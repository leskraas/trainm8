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
 * **The same landing for the row's own writes** (ADR 0088, amended): _Gjort_
 * and a "hva var dette?" link are not the composer's, but they land through
 * the same toast, tinted row and _Angre_ — and their undo posts the token
 * their write's reply carried to that write's own route instead of deleting
 * anything. A write whose reply carried no token lands without _Angre_.
 * The row's button posts on a keyed fetcher and hands that key here
 * ({@link ComposerActions.watch}); the reply is read here, not in the
 * button, because a revalidation already in flight can bring the written
 * state — and take the button away — before the button's own reply arrives.
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
	/**
	 * Land a write the row made itself (_Gjort_, a link answer) once its
	 * reply is in: called as the post leaves, with the post's fetcher key.
	 */
	watch: (watch: LandingWatch) => void
}

/**
 * A row's post to land: the key of the fetcher it went out on, and how its
 * reply reads as a landing (null for a refusal, which the row says itself).
 */
export type LandingWatch = {
	fetcherKey: string
	toWrite: (reply: unknown) => LandedWrite | null
}

/**
 * How a landed write is taken back: the form its _Angre_ posts, and where.
 * No `action` posts to home's own route (the composer's `undo-stamp`).
 */
export type UndoPost = { action?: string; post: Record<string, string> }

/** A write that landed on a row, for its toast and its row's _Angre_. */
export type LandedWrite = {
	sessionId: string
	/** The toast's line: what changed. */
	line: string
	/** Quoted under the line. */
	title?: string
	/** The way back, or null when the write may not be taken back. */
	undo: UndoPost | null
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
	/** Whether that row's write can be taken back, so it carries _Angre_. */
	landedUndoable: boolean
	undoingSessionId: string | null
}

const ActionsContext = createContext<ComposerActions | null>(null)
const StatusContext = createContext<ComposerStatus | null>(null)
const LandingContext = createContext<ComposerLanding>({
	landedSessionId: null,
	landedUndoable: false,
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

/**
 * The landing for a write made outside the composer, or null outside a
 * provider (a details view rendered on its own): such a write then lands as
 * it always did, on the revalidated row alone.
 */
export function useLandingWatch(): ComposerActions['watch'] | null {
	return useContext(ActionsContext)?.watch ?? null
}

/**
 * Reads one watched post's reply off its keyed fetcher, which lives as long
 * as this does — after the row that posted it has gone — and lands it once.
 * A reply already there when the watch began (a refusal before a retry) is
 * not this post's.
 */
function WatchedLanding({
	watch,
	land,
	done,
}: {
	watch: LandingWatch
	land: (write: LandedWrite) => void
	done: (fetcherKey: string) => void
}) {
	const fetcher = useFetcher({ key: watch.fetcherKey })
	const before = useRef(fetcher.data)
	const reply = fetcher.data
	useEffect(() => {
		if (reply === undefined || reply === before.current) return
		before.current = reply
		const write = watch.toWrite(reply)
		if (write) land(write)
		done(watch.fetcherKey)
	}, [done, land, reply, watch])
	return null
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
	const [landedUndoable, setLandedUndoable] = useState(false)
	// Each landed write's way back, by session: written as it lands, read by
	// the toast's and the row's _Angre_. A ref, because the rows never need to
	// re-render for it.
	const undoPostsRef = useRef(new Map<string, UndoPost | null>())
	const [watches, setWatches] = useState<LandingWatch[]>([])
	const watch = useCallback((next: LandingWatch) => {
		setWatches((current) => [
			...current.filter((one) => one.fetcherKey !== next.fetcherKey),
			next,
		])
	}, [])
	const unwatch = useCallback((fetcherKey: string) => {
		setWatches((current) =>
			current.filter((one) => one.fetcherKey !== fetcherKey),
		)
	}, [])
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
			// Only a write that landed here has a way back, and only the one it
			// landed with: never a guess (a row's _Gjort_ is not a stamp to
			// delete). A second tap posts the same token, which the server reads
			// as nothing left to take back.
			const way = undoPostsRef.current.get(sessionId)
			if (!way) return
			setUndoing(sessionId)
			setLanded((current) => (current === sessionId ? null : current))
			toast.dismiss(`write-${sessionId}`)
			// A session the composer wrote is deleted (`undo-stamp`, ADR 0076);
			// a row's own write posts its token to its own route.
			const { action, post } = way
			void submitUndo(
				post,
				action ? { method: 'POST', action } : { method: 'POST' },
			)
		},
		[submitUndo],
	)

	// **One landing** for every write: the toast that says what changed and
	// carries _Angre_ when there is a way back, and the row's highlight.
	const announce = useCallback(
		({ sessionId, line, title, undo: way }: LandedWrite) => {
			undoPostsRef.current.set(sessionId, way)
			setLanded(sessionId)
			setLandedUndoable(way !== null)
			toast.success(line, {
				id: `write-${sessionId}`,
				description: title ? `«${title}»` : undefined,
				duration: LANDED_MS,
				action:
					way === null
						? undefined
						: {
								label: SESSION_COMPOSER_LABELS.undo,
								onClick: () => undo(sessionId),
							},
			})
		},
		[undo],
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
		setLandedCount((count) => count + 1)
		announce({
			sessionId: stampedSessionId,
			line:
				reply?.weekSumLine ??
				(reply?.done
					? SESSION_COMPOSER_LABELS.writtenDone
					: SESSION_COMPOSER_LABELS.written),
			title: titleRef.current || undefined,
			undo: { post: { intent: 'undo-stamp', sessionId: stampedSessionId } },
		})
	}, [announce, reply, stampedSessionId])

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
			watch,
		}),
		[
			container,
			minDayKey,
			prefill,
			submitWrite,
			thresholds,
			todayKey,
			undo,
			watch,
		],
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
		() => ({ landedSessionId, landedUndoable, undoingSessionId }),
		[landedSessionId, landedUndoable, undoingSessionId],
	)

	return (
		<ActionsContext.Provider value={actions}>
			<StatusContext.Provider value={status}>
				<LandingContext.Provider value={landing}>
					{children}
					{watches.map((one) => (
						<WatchedLanding
							key={one.fetcherKey}
							watch={one}
							land={announce}
							done={unwatch}
						/>
					))}
				</LandingContext.Provider>
			</StatusContext.Provider>
		</ActionsContext.Provider>
	)
}
