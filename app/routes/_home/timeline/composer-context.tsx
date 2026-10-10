/**
 * The session composer's one place on I dag (owner decisions 1 and 2, round 2;
 * ADR 0088): where it is open, the one way it writes, and the one way back.
 *
 * **One composer, one container per screen.** Every "+" — a free day's, the
 * "legg til en til" under a day's sessions, the top line's _Ny økt_ — calls
 * {@link ComposerActions.openComposer} with a day, and a session row or its
 * glyph calls {@link ComposerActions.openDetail}. Where that lands is decided
 * once, here, by the screen: on a phone the Drawer (`composer-drawer.tsx`);
 * from `lg` the frame's own day — the Sheet between `lg` and `xl`, the day
 * pane from `xl` — through `onReveal`.
 *
 * **One write path.** The composer posts what `composerPost` built to home's
 * own action, and every reply comes back the same way: the session's id and
 * the week's sum before → after.
 *
 * **One undo path** (ADR 0088, amending ADR 0076). Every write gets a toast —
 * at the bottom on a phone, in thumb's reach — with _Angre_, and the row it
 * landed as rises into place, highlighted and carrying its own _Angre_, for
 * as long as the toast stays. Both call the same {@link
 * ComposerActions.undo}: the owner-scoped delete ADR 0076 decided on.
 *
 * Three contexts rather than one, because hundreds of memoised rows read
 * this: the actions never change; the landing changes once per write and is
 * read only by session rows; the open state is read only by the composer.
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
import { SESSION_COMPOSER_LABELS } from '#app/utils/labels.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'

/** Where the composer is: writing on a day, or a session's details. */
export type ComposerTarget =
	| { mode: 'compose'; dayKey: string }
	| { mode: 'detail'; sessionId: string; dayKey: string }

/** The container the screen gives the composer. */
export type ComposerContainer = 'drawer' | 'sheet' | 'pane'

export type ComposerActions = {
	/** The athlete's most-trained sport, or null where nothing says (ADR 0065 §5). */
	prefill: Discipline | null
	thresholds: DisciplineThresholdMap
	todayKey: string
	/** The first day a write may land on (the loader's window). */
	minDayKey: string
	container: ComposerContainer
	openComposer: (dayKey: string) => void
	openDetail: (sessionId: string, dayKey: string) => void
	/** Post a write; `title` is what the toast quotes. */
	submit: (post: Record<string, string>, meta: { title: string }) => void
	undo: (sessionId: string) => void
}

export type ComposerStatus = {
	/** The Drawer's target; always null where the composer lives in the frame. */
	target: ComposerTarget | null
	close: () => void
	pending: boolean
	failed: boolean
	/** Bumps when a write lands, so an open composer starts over. */
	landedCount: number
}

export type ComposerLanding = {
	/** The row that just landed: risen, highlighted, carrying _Angre_. */
	landedSessionId: string | null
	undoingSessionId: string | null
}

const ActionsContext = createContext<ComposerActions | null>(null)
const StatusContext = createContext<ComposerStatus | null>(null)
const LandingContext = createContext<ComposerLanding>({
	landedSessionId: null,
	undoingSessionId: null,
})

/**
 * How long a write's toast stays, and its row stays highlighted with _Angre_:
 * long enough to read the week's sum and reach the way back.
 */
export const LANDED_MS = 10_000

/** Never optional: every "+" in the list opens the composer. */
export function useComposer(): ComposerActions {
	const value = useContext(ActionsContext)
	if (!value) {
		throw new Error('The stream must be rendered inside a ComposerProvider')
	}
	return value
}

export function useComposerStatus(): ComposerStatus {
	const value = useContext(StatusContext)
	if (!value) {
		throw new Error('The composer must be rendered inside a ComposerProvider')
	}
	return value
}

export function useComposerLanding(): ComposerLanding {
	return useContext(LandingContext)
}

type WriteReply = {
	stampedSessionId?: string
	weekSumLine?: string | null
	done?: boolean
}

export function ComposerProvider({
	prefill,
	thresholds,
	todayKey,
	minDayKey,
	container,
	onReveal,
	children,
}: {
	prefill: Discipline | null
	thresholds: DisciplineThresholdMap
	todayKey: string
	minDayKey: string
	container: ComposerContainer
	/**
	 * Show a day in the frame's own container (from `lg`): pick it, open the
	 * Sheet or bring the day pane's composer to hand.
	 */
	onReveal?: (dayKey: string, why: ComposerTarget['mode']) => void
	children: React.ReactNode
}) {
	const [target, setTarget] = useState<ComposerTarget | null>(null)
	const [landedSessionId, setLanded] = useState<string | null>(null)
	const [undoingSessionId, setUndoing] = useState<string | null>(null)
	const [failed, setFailed] = useState(false)
	const [landedCount, setLandedCount] = useState(0)
	const writeFetcher = useFetcher<WriteReply>()
	const undoFetcher = useFetcher()
	const submitWrite = writeFetcher.submit
	const submitUndo = undoFetcher.submit
	const titleRef = useRef('')
	// The id the fetcher already held when this post left: a second write's
	// failure leaves the first one's id in place, and without this it would
	// read as the second write landing.
	const landedBeforeRef = useRef<string | undefined>(undefined)
	const revealRef = useRef(onReveal)
	revealRef.current = onReveal
	const containerRef = useRef(container)
	containerRef.current = container

	const undo = useCallback(
		(sessionId: string) => {
			setUndoing(sessionId)
			setLanded((current) => (current === sessionId ? null : current))
			toast.dismiss(`write-${sessionId}`)
			void submitUndo({ intent: 'undo-stamp', sessionId }, { method: 'POST' })
		},
		[submitUndo],
	)

	// **The landing.** The written session's id comes back on the action's own
	// reply, so the row that rises is the one actually written — not a guess
	// about which of the day's sessions is new.
	const reply = writeFetcher.data
	const stampedSessionId = reply?.stampedSessionId
	const latestIdRef = useRef(stampedSessionId)
	latestIdRef.current = stampedSessionId
	const toastedRef = useRef<string | null>(null)
	useEffect(() => {
		if (!stampedSessionId || stampedSessionId === landedBeforeRef.current)
			return
		if (toastedRef.current === stampedSessionId) return
		toastedRef.current = stampedSessionId
		setFailed(false)
		setTarget(null)
		setLanded(stampedSessionId)
		setLandedCount((count) => count + 1)
		const line =
			reply?.weekSumLine ??
			(reply?.done
				? SESSION_COMPOSER_LABELS.writtenDone
				: SESSION_COMPOSER_LABELS.written)
		toast.success(line, {
			id: `write-${stampedSessionId}`,
			description: titleRef.current ? `«${titleRef.current}»` : undefined,
			duration: LANDED_MS,
			action: {
				label: SESSION_COMPOSER_LABELS.undo,
				onClick: () => undo(stampedSessionId),
			},
		})
	}, [reply, stampedSessionId, undo])

	// The highlight leaves with the toast.
	useEffect(() => {
		if (!landedSessionId) return
		const timer = window.setTimeout(() => setLanded(null), LANDED_MS)
		return () => window.clearTimeout(timer)
	}, [landedSessionId])

	// **The other ending.** A post that comes back with no new id — a dropped
	// connection, a refusal — returns the fetcher to idle carrying nothing. The
	// composer then says so and stays open on what the athlete wrote, because a
	// button stuck on `Legger til…` is the one state with no way out (#501 AC 8).
	const writeState = writeFetcher.state
	const inFlightRef = useRef(false)
	useEffect(() => {
		if (writeState !== 'idle') {
			inFlightRef.current = true
			return
		}
		if (!inFlightRef.current) return
		inFlightRef.current = false
		if (stampedSessionId && stampedSessionId !== landedBeforeRef.current) return
		setFailed(true)
	}, [stampedSessionId, writeState])

	// The row is gone once the undo lands; only the word on its button is left.
	const undoIdle = undoFetcher.state === 'idle'
	useEffect(() => {
		if (undoIdle) setUndoing(null)
	}, [undoIdle])

	const actions = useMemo<ComposerActions>(
		() => ({
			prefill,
			thresholds,
			todayKey,
			minDayKey,
			container,
			openComposer: (dayKey) => {
				setFailed(false)
				if (containerRef.current === 'drawer') {
					setTarget({ mode: 'compose', dayKey })
				} else revealRef.current?.(dayKey, 'compose')
			},
			openDetail: (sessionId, dayKey) => {
				if (containerRef.current === 'drawer') {
					setTarget({ mode: 'detail', sessionId, dayKey })
				} else revealRef.current?.(dayKey, 'detail')
			},
			submit: (post, { title }) => {
				titleRef.current = title
				landedBeforeRef.current = latestIdRef.current
				setFailed(false)
				// No `action`: a fetcher with none posts to the route it is rendered
				// inside, which is home's own index route. Naming `/` would post to
				// the **root** layout instead, which has no action.
				void submitWrite(post, { method: 'POST' })
			},
			undo,
		}),
		[container, minDayKey, prefill, submitWrite, thresholds, todayKey, undo],
	)

	const status = useMemo<ComposerStatus>(
		() => ({
			target,
			close: () => setTarget(null),
			pending: writeState !== 'idle',
			failed,
			landedCount,
		}),
		[failed, landedCount, target, writeState],
	)

	const landing = useMemo<ComposerLanding>(
		() => ({ landedSessionId, undoingSessionId }),
		[landedSessionId, undoingSessionId],
	)

	return (
		<ActionsContext.Provider value={actions}>
			<StatusContext.Provider value={status}>
				<LandingContext.Provider value={landing}>
					{children}
				</LandingContext.Provider>
			</StatusContext.Provider>
		</ActionsContext.Provider>
	)
}
