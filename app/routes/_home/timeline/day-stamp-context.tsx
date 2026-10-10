/**
 * What the stream needs to know about the **Day Stamp**, carried as context
 * rather than threaded through every row (ADR 0065 §5).
 *
 * Context, deliberately: `WeekBlock` → `DayRow` → the cell is three components
 * that have no opinion about authoring, and giving each of them a pass-through
 * prop for it would put the feature in their signatures instead of in the one
 * place that implements it. What a row asks is only ever *"is this day mine to
 * open?"*, and the answer is a fact about the screen, not about the row.
 *
 * Everything here is client state plus two posts. The stamp and the undo go to
 * home's own action, which revalidates the loader — so the row the athlete just
 * wrote into arrives back through the ledger like every other session, with a
 * shape and a Planned TSS, and there is no second copy of a session anywhere.
 *
 * **Every write has a way back on I dag** (ADR 0076, ADR 0082 S11). A stamp or
 * a draft's sentence opens its row with Angre. A sentence from "+ Ny" →
 * "Skriv en økt" lands on a day that may be anywhere in the list — far ahead,
 * past what the stream has mounted — so its way back is the toast instead:
 * the week's sum, with Angre on it.
 */
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { DAY_STAMP_LABELS } from '#app/utils/labels.ts'
import { type LedgerSession } from '#app/utils/training.server.ts'
import {
	type CardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'

/** A ledger session that carries a prescription — the only kind the Token
 * Sentence has anything to render. */
export type StampedLedgerSession = LedgerSession & {
	workout: NonNullable<LedgerSession['workout']>
}

export type DayStamp = {
	/**
	 * The Discipline a draft opens on — the athlete's **most-trained**, read from
	 * their own history. `null` means there is nothing to read it from, and the
	 * draft asks instead of assigning one (ADR 0065 §5).
	 */
	prefill: Discipline | null
	thresholds: DisciplineThresholdMap
	/** The day whose draft is open, as `YYYY-MM-DD`. */
	draftDayKey: string | null
	/** The day whose stamp is in flight — the draft's button says so. */
	pendingDayKey: string | null
	/**
	 * The day whose stamp came back with nothing written — a dropped connection,
	 * or a refusal from the action. The draft says so and stays open on the
	 * athlete's own choice, because #501's AC 8 is that a mistake is recoverable
	 * and a button stuck on `Adding…` forever is the one state that is not.
	 */
	failedDayKey: string | null
	/** The session whose Token Sentence is open in its row. */
	openSessionId: string | null
	/**
	 * That session as the ledger has it — the prescription the sentence renders.
	 * Null until the revalidated loader carries it, which is why the row keeps
	 * reading as an ordinary session row for the one paint in between rather than
	 * rendering an editor over data that is not there yet.
	 */
	openSession: StampedLedgerSession | null
	/** The session being undone, so its button can say so. */
	undoingSessionId: string | null
	openDraft: (dayKey: string) => void
	closeDraft: () => void
	closeOpen: () => void
	stamp: (dayKey: string, discipline: Discipline) => void
	/**
	 * Write a sentence from the **writing line** onto a day (#505 stories
	 * 35–40). The same in-flight and failure states as a stamp, keyed by the
	 * day. `open: false` leaves the row closed — the panel's case, whose day may
	 * be anywhere in the list — and offers Angre on the toast instead.
	 */
	write: (
		dayKey: string,
		discipline: CardioDiscipline | null,
		sentence: string,
		options?: { open?: boolean },
	) => void
	undo: (sessionId: string) => void
}

const DayStampContext = createContext<DayStamp | null>(null)

/**
 * How long the toast after a "+ Ny" write stays: long enough to read the
 * week's sum and reach Angre, the way back it carries.
 */
const WRITE_TOAST_MS = 10_000

/** Never optional: every cell in the stream is a write target, so a stream
 * rendered outside the provider is a bug rather than a degraded mode. */
export function useDayStamp(): DayStamp {
	const value = useContext(DayStampContext)
	if (!value) {
		throw new Error('The stream must be rendered inside a DayStampProvider')
	}
	return value
}

export function DayStampProvider({
	prefill,
	thresholds,
	ledger,
	children,
}: {
	prefill: Discipline | null
	thresholds: DisciplineThresholdMap
	/** The season's sessions, as home already loaded them. */
	ledger: LedgerSession[]
	children: React.ReactNode
}) {
	const [draftDayKey, setDraftDayKey] = useState<string | null>(null)
	const [openSessionId, setOpenSessionId] = useState<string | null>(null)
	const stampFetcher = useFetcher<{
		stampedSessionId?: string
		/** The week's sum after a panel write, for the toast that carries Angre. */
		weekSumLine?: string | null
	}>()
	const undoFetcher = useFetcher()
	const submitUndo = undoFetcher.submit
	const [pendingDayKey, setPendingDayKey] = useState<string | null>(null)
	const [failedDayKey, setFailedDayKey] = useState<string | null>(null)
	const [undoingSessionId, setUndoingSessionId] = useState<string | null>(null)
	// Whether the write in flight opens its row once it lands. A ref, because it
	// is read by the landing effect and never rendered.
	const openOnLandRef = useRef(true)
	// The id the fetcher already held when this post left. A second write's
	// failure leaves the first one's id in place, and without this it would read
	// as the second write landing.
	const landedBeforeRef = useRef<string | undefined>(undefined)

	// The stamped session's id comes back on the action's own reply, so the row
	// opens on the thing that was actually written rather than on a guess about
	// which of the day's sessions is the new one.
	const stampedSessionId = stampFetcher.data?.stampedSessionId
	const weekSumLine = stampFetcher.data?.weekSumLine ?? null

	const undoSession = useCallback(
		(sessionId: string) => {
			setUndoingSessionId(sessionId)
			setOpenSessionId(null)
			void submitUndo({ intent: 'undo-stamp', sessionId }, { method: 'POST' })
		},
		[submitUndo],
	)

	// The session the toast already offered Angre for: the effect below re-runs
	// when the undo callback changes, and one write is one toast.
	const toastedRef = useRef<string | null>(null)
	useEffect(() => {
		if (!stampedSessionId) return
		setPendingDayKey(null)
		setFailedDayKey(null)
		setDraftDayKey(null)
		if (openOnLandRef.current) {
			setOpenSessionId(stampedSessionId)
			return
		}
		if (toastedRef.current === stampedSessionId) return
		toastedRef.current = stampedSessionId
		// The panel's write: the row is not opened, so the way back rides on the
		// toast that says what the write did to its week (ADR 0076).
		toast.success(weekSumLine ?? DAY_STAMP_LABELS.written, {
			id: `write-${stampedSessionId}`,
			duration: WRITE_TOAST_MS,
			action: {
				label: DAY_STAMP_LABELS.undo,
				onClick: () => undoSession(stampedSessionId),
			},
		})
	}, [stampedSessionId, undoSession, weekSumLine])

	// **The other ending.** A post that comes back with no id — a dropped
	// connection, a refusal, a 500 out of `createWorkoutSession` — returns the
	// fetcher to idle carrying nothing, and the success effect above has nothing
	// to fire on. Left there the draft sits `disabled` on `Adding…` with no way
	// out but Cancel, which is precisely the unrecoverable mistake ADR 0076 and
	// #501's AC 8 exist to prevent.
	//
	// `inFlightRef` is what makes "idle" mean *finished* rather than *not started
	// yet*: `stamp()` sets the pending day a render before the submission leaves,
	// so an unguarded idle check would cancel every stamp the moment it began.
	const stampState = stampFetcher.state
	const inFlightRef = useRef(false)
	useEffect(() => {
		if (stampState !== 'idle') {
			inFlightRef.current = true
			return
		}
		if (!inFlightRef.current) return
		inFlightRef.current = false
		if (stampedSessionId && stampedSessionId !== landedBeforeRef.current) return
		setFailedDayKey(pendingDayKey)
		setPendingDayKey(null)
	}, [pendingDayKey, stampState, stampedSessionId])

	// The row is gone the moment the undo lands, so the only thing left to clear
	// is the word on the button.
	const undoIdle = undoFetcher.state === 'idle'
	useEffect(() => {
		if (undoIdle) setUndoingSessionId(null)
	}, [undoIdle])

	const openSession = useMemo<StampedLedgerSession | null>(() => {
		if (!openSessionId) return null
		const found = ledger.find((session) => session.id === openSessionId)
		return found?.workout ? (found as StampedLedgerSession) : null
	}, [ledger, openSessionId])

	const value = useMemo<DayStamp>(
		() => ({
			prefill,
			thresholds,
			draftDayKey,
			openSession,
			pendingDayKey,
			failedDayKey,
			openSessionId,
			undoingSessionId,
			openDraft: (dayKey) => {
				setOpenSessionId(null)
				setFailedDayKey(null)
				setDraftDayKey(dayKey)
			},
			closeDraft: () => {
				setDraftDayKey(null)
				setFailedDayKey(null)
			},
			closeOpen: () => setOpenSessionId(null),
			stamp: (dayKey, discipline) => {
				openOnLandRef.current = true
				landedBeforeRef.current = stampFetcher.data?.stampedSessionId
				setPendingDayKey(dayKey)
				// A retry starts from a clean row: the failure being reported is the
				// last one, never a stale one from the attempt before it.
				setFailedDayKey(null)
				// No `action`: a fetcher with none posts to the route it is rendered
				// inside, which is home's own index route. Naming `/` would post to
				// the **root** layout instead — `/` matches both, and the parent wins
				// unless the index is named — and root has no action at all.
				void stampFetcher.submit(
					{ intent: 'stamp-day', date: dayKey, discipline },
					{ method: 'POST' },
				)
			},
			write: (dayKey, discipline, sentence, { open = true } = {}) => {
				openOnLandRef.current = open
				landedBeforeRef.current = stampFetcher.data?.stampedSessionId
				setPendingDayKey(dayKey)
				setFailedDayKey(null)
				// Home's own index action, as the stamp — see above.
				void stampFetcher.submit(
					{
						intent: 'write-session',
						date: dayKey,
						discipline: discipline ?? '',
						sentence,
						landing: open ? 'row' : 'toast',
					},
					{ method: 'POST' },
				)
			},
			undo: undoSession,
		}),
		[
			draftDayKey,
			failedDayKey,
			openSession,
			openSessionId,
			pendingDayKey,
			prefill,
			stampFetcher,
			thresholds,
			undoSession,
			undoingSessionId,
		],
	)

	return (
		<DayStampContext.Provider value={value}>
			{children}
		</DayStampContext.Provider>
	)
}
