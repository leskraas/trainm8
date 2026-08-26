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
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useFetcher } from 'react-router'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type LedgerSession } from '#app/utils/training.server.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'

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
	undo: (sessionId: string) => void
}

const DayStampContext = createContext<DayStamp | null>(null)

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
	const stampFetcher = useFetcher<{ stampedSessionId?: string }>()
	const undoFetcher = useFetcher()
	const [pendingDayKey, setPendingDayKey] = useState<string | null>(null)
	const [undoingSessionId, setUndoingSessionId] = useState<string | null>(null)

	// The stamped session's id comes back on the action's own reply, so the row
	// opens on the thing that was actually written rather than on a guess about
	// which of the day's sessions is the new one.
	const stampedSessionId = stampFetcher.data?.stampedSessionId
	useEffect(() => {
		if (!stampedSessionId) return
		setPendingDayKey(null)
		setDraftDayKey(null)
		setOpenSessionId(stampedSessionId)
	}, [stampedSessionId])

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
			openSessionId,
			undoingSessionId,
			openDraft: (dayKey) => {
				setOpenSessionId(null)
				setDraftDayKey(dayKey)
			},
			closeDraft: () => setDraftDayKey(null),
			closeOpen: () => setOpenSessionId(null),
			stamp: (dayKey, discipline) => {
				setPendingDayKey(dayKey)
				// No `action`: a fetcher with none posts to the route it is rendered
				// inside, which is home's own index route. Naming `/` would post to
				// the **root** layout instead — `/` matches both, and the parent wins
				// unless the index is named — and root has no action at all.
				void stampFetcher.submit(
					{ intent: 'stamp-day', date: dayKey, discipline },
					{ method: 'POST' },
				)
			},
			undo: (sessionId) => {
				setUndoingSessionId(sessionId)
				setOpenSessionId(null)
				void undoFetcher.submit(
					{ intent: 'undo-stamp', sessionId },
					{ method: 'POST' },
				)
			},
		}),
		[
			draftDayKey,
			openSession,
			openSessionId,
			pendingDayKey,
			prefill,
			stampFetcher,
			thresholds,
			undoFetcher,
			undoingSessionId,
		],
	)

	return (
		<DayStampContext.Provider value={value}>
			{children}
		</DayStampContext.Provider>
	)
}
