/**
 * I dag's list, wired to a real scroller — and kept out of the reader's way.
 *
 * This hook owns every measurement the list makes; the arithmetic lives in
 * `anchoring.ts`. It is built around one rule (ADR 0086): **the app never
 * writes `scrollTop` under a scrolling reader.** A write while a finger is
 * flinging the list cancels the fling's momentum on a phone, and every write
 * the old module made — the settle ladder, the growth compensation — landed
 * exactly then.
 *
 * - **The past is mounted up front.** Every week before today renders on the
 *   first pass (a closed week is one folded line), so nothing ever grows
 *   *above* the reader and there is nothing to compensate. Weeks ahead are
 *   appended as the reader nears the end, which moves nothing they can see.
 * - **The landing happens before first paint.** The server renders a small
 *   script right after the list (`landingScript`), so the browser parks it on
 *   today while parsing; hydration re-measures the same spot in a layout
 *   effect and writes only if the two differ. Late layout (a font, a wrapped
 *   title) is followed by a `ResizeObserver` that re-lands **until the reader's
 *   first input** — `pointerdown`, `wheel`, `touchstart`, `keydown` — and never
 *   after it. No timers.
 * - **Where the reader is comes from `IntersectionObserver`s**, not from a
 *   scroll handler: one for the weeks on screen (the strip's frame), one
 *   one-pixel line for the week being read, one for today's row (the I dag
 *   pill), one sentinel at the end for the weeks ahead. They report only when
 *   something crosses, and state is set only when a value changes.
 * - **Jumps are instant writes**, made because the reader tapped, and the
 *   observers report the new position on their own.
 * - **A revalidation that adds height above the reader** is the one case left
 *   that writes on its own: {@link ReadingHold} measures the reader's week
 *   just before the new data commits and hands the delta back in the same
 *   frame — the write native scroll anchoring would make, and the stream
 *   carries `overflow-anchor: none` so the two never both make it.
 */
import {
	Component,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react'
import {
	type AwayFromToday,
	activeLineMargin,
	activeWeekOf,
	AHEAD_INITIAL,
	AHEAD_PAD,
	AWAY_MARGIN,
	awayFromEntry,
	awayOf,
	compensatedScrollTop,
	frameOf,
	landingTop,
	nextAhead,
	offsetWithin,
	WEEK_JUMP_OFFSET,
} from './anchoring.ts'

/** The DOM contract between this hook and the markup that renders the list. */
export const WEEK_ATTR = 'data-timeline-week'
/** The scroller itself — how a row deep in the stream finds what it scrolls in. */
export const STREAM_ATTR = 'data-timeline-stream'
export const TODAY_ATTR = 'data-timeline-today'
/** A week's sticky header — what today's row must land clear of. */
export const WEEK_HEADER_ATTR = 'data-week-header'
export const CELL_ATTR = 'data-timeline-cell'
/** The sentinel after the last mounted week: in reach, the next weeks mount. */
export const AHEAD_SENTINEL_ATTR = 'data-timeline-ahead'

/** The inputs that hand the scroll position to the reader for good. */
const INPUTS = [
	'pointerdown',
	'wheel',
	'touchstart',
	'keydown',
	// A click with no pointer behind it: a screen reader activating a control.
	'click',
] as const

export type TimelineScroll = {
	streamRef: (node: HTMLDivElement | null) => void
	/** The week the stream is parked in — the strip's current week. */
	activeWeekKey: string
	/**
	 * The first and last week the reader can see — the edges of the strip's
	 * frame (#505 story 17). Set only when an edge moves to another week.
	 */
	frame: { from: string; to: string }
	/** −1 above, 0 in view, +1 below; drives the I dag pill. */
	away: AwayFromToday
	/** How many weeks after today are mounted. Every week before it always is. */
	after: number
	backToToday: () => void
	/** Mount the week if it is ahead of the window, then jump the stream to it. */
	goToWeek: (key: string) => void
	/** The reader's week as last reported — what {@link ReadingHold} marks. */
	readerKey: () => string
}

export function useTimelineScroll({
	weekKeys,
	todayIndex,
}: {
	weekKeys: string[]
	/** Index of today's week in `weekKeys`. */
	todayIndex: number
}): TimelineScroll {
	const homeKey = weekKeys[todayIndex] ?? weekKeys[0] ?? ''
	const maxAfter = Math.max(0, weekKeys.length - 1 - todayIndex)
	const [after, setAfter] = useState(() => Math.min(maxAfter, AHEAD_INITIAL))
	const [activeWeekKey, setActiveWeekKey] = useState(homeKey)
	const [frame, setFrame] = useState({ from: homeKey, to: homeKey })
	const [away, setAway] = useState<AwayFromToday>(0)

	const streamElRef = useRef<HTMLDivElement | null>(null)
	/** True until the reader's first input: the landing still owns the position. */
	const holdingRef = useRef(true)
	/** A jump waiting for its week to be mounted. */
	const pendingJumpRef = useRef<string | null>(null)
	// Mirrors of state for the observer callbacks, which must compare before
	// they set: a state updater has to stay pure, so the decision lives here.
	const activeRef = useRef(homeKey)
	const frameRef = useRef(frame)
	const awayRef = useRef<AwayFromToday>(0)
	const homeKeyRef = useRef(homeKey)
	homeKeyRef.current = homeKey
	const keysRef = useRef(weekKeys)
	keysRef.current = weekKeys
	const afterRef = useRef(after)
	afterRef.current = after
	const maxAfterRef = useRef(maxAfter)
	maxAfterRef.current = maxAfter

	// ——— measuring ————————————————————————————————————————————————————————

	/** The scroller as the DOM has it now: a ref captured earlier may be detached. */
	const scroller = useCallback(() => {
		const el = streamElRef.current
		return el && el.isConnected ? el : null
	}, [])

	const offsetOf = useCallback(
		(el: HTMLElement, node: Element) =>
			offsetWithin(
				{ top: el.getBoundingClientRect().top, scrollTop: el.scrollTop },
				{ top: node.getBoundingClientRect().top },
			),
		[],
	)

	/** Where the landing parks (`landingTop`), or null with nothing to aim at. */
	const landingTarget = useCallback(
		(el: HTMLElement) => {
			const today = el.querySelector(`[${TODAY_ATTR}]`)
			const week = today?.closest(`[${WEEK_ATTR}]`)
			if (!today || !week) return null
			const header = week.querySelector(`[${WEEK_HEADER_ATTR}]`)
			return landingTop({
				weekOffset: offsetOf(el, week),
				todayOffset: offsetOf(el, today),
				todayHeight: today.getBoundingClientRect().height,
				headerHeight: header?.getBoundingClientRect().height ?? 0,
				clientHeight: el.clientHeight,
			})
		},
		[offsetOf],
	)

	/**
	 * Assign a scroll position, instantly, and only if it differs — an
	 * assignment of the same number still cancels a scroll in flight. The list
	 * carries `scroll-behavior: smooth` for the reader's own keyboard scrolling,
	 * so smooth is switched off around the write.
	 */
	const jumpTo = useCallback((el: HTMLElement, want: number) => {
		const top = Math.max(0, Math.round(want))
		if (Math.abs(el.scrollTop - top) < 1) return
		const previous = el.style.scrollBehavior
		el.style.scrollBehavior = 'auto'
		el.scrollTop = top
		el.style.scrollBehavior = previous
	}, [])

	/** Park on today — only while the landing still owns the position. */
	const land = useCallback(() => {
		if (!holdingRef.current) return
		const el = scroller()
		if (!el) return
		const want = landingTarget(el)
		if (want != null) jumpTo(el, want)
	}, [jumpTo, landingTarget, scroller])

	// ——— the reader takes over ————————————————————————————————————————————

	const releaseRef = useRef<() => void>(() => {})

	const streamRef = useCallback(
		(node: HTMLDivElement | null) => {
			if (streamElRef.current === node) return
			releaseRef.current()
			streamElRef.current = node
			if (!node) return
			holdingRef.current = true
			// Late layout — a web font arriving, a title wrapping, the strip
			// measuring itself — moves today's row after the first paint. Followed
			// by observing the list's content box, and only until the reader acts.
			const content = node.firstElementChild
			const resize =
				typeof ResizeObserver === 'undefined' || !content
					? null
					: new ResizeObserver(() => land())
			if (resize && content) resize.observe(content)
			const release = () => {
				holdingRef.current = false
				resize?.disconnect()
				for (const type of INPUTS) {
					document.removeEventListener(type, release, { capture: true })
				}
				releaseRef.current = () => {}
			}
			// Anywhere on the page, not only on the list: a tap on the strip, the
			// badge or "+ Ny" is the reader taking over just as much. Passive and
			// capturing, so the reader's own scroll is never delayed by a listener
			// that exists only to stop interfering with it.
			for (const type of INPUTS) {
				document.addEventListener(type, release, {
					capture: true,
					passive: true,
				})
			}
			releaseRef.current = release
		},
		[land],
	)
	useEffect(() => () => releaseRef.current(), [])

	// ——— landing ——————————————————————————————————————————————————————————

	// Before the first paint the client makes: the server's script has usually
	// parked the list already, and this measures the same spot and writes
	// nothing. Without it (no-JS-script cases, a client navigation) this is the
	// landing.
	useLayoutEffect(() => {
		land()
	}, [land])

	// ——— where the reader is ———————————————————————————————————————————————

	/** Set by the observer effect; re-run after every commit that mounts weeks. */
	const attachRef = useRef<() => void>(() => {})

	useEffect(() => {
		const el = scroller()
		if (!el || typeof IntersectionObserver === 'undefined') return
		const order = () => keysRef.current
		const visible = new Set<string>()
		const crossing = new Set<string>()
		const keyOf = (entry: IntersectionObserverEntry) =>
			entry.target.getAttribute(WEEK_ATTR) ?? ''

		const setActive = (key: string) => {
			if (key === activeRef.current) return
			activeRef.current = key
			setActiveWeekKey(key)
		}
		const setFrameIfMoved = (next: { from: string; to: string } | null) => {
			if (
				!next ||
				(next.from === frameRef.current.from && next.to === frameRef.current.to)
			)
				return
			frameRef.current = next
			setFrame(next)
		}
		const setAwayIfMoved = (next: AwayFromToday) => {
			if (next === awayRef.current) return
			awayRef.current = next
			setAway(next)
		}

		const weeks = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					// Touching an edge is not being on screen: a week whose bottom is
					// exactly the list's top intersects with zero height.
					if (entry.isIntersecting && entry.intersectionRect.height > 0) {
						visible.add(keyOf(entry))
					} else visible.delete(keyOf(entry))
				}
				setFrameIfMoved(frameOf(visible, order()))
				updateAway()
			},
			{ root: el },
		)
		let line: IntersectionObserver | null = null
		const lineCallback = (entries: IntersectionObserverEntry[]) => {
			for (const entry of entries) {
				if (entry.isIntersecting) crossing.add(keyOf(entry))
				else crossing.delete(keyOf(entry))
			}
			setActive(activeWeekOf(crossing, order(), activeRef.current))
		}
		// Today's row: in view or not, and which side its last report put it.
		let todayInView = true
		let lastReport: AwayFromToday = 0
		const updateAway = () =>
			setAwayIfMoved(
				awayOf({
					inView: todayInView,
					lastReport,
					frame: frameOf(visible, order()),
					order: order(),
					todayKey: homeKeyRef.current,
				}),
			)
		const today = new IntersectionObserver(
			(entries) => {
				const entry = entries[entries.length - 1]
				if (!entry) return
				lastReport = awayFromEntry(entry)
				todayInView = lastReport === 0
				updateAway()
			},
			{ root: el, rootMargin: AWAY_MARGIN },
		)
		const ahead = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return
				if (afterRef.current >= maxAfterRef.current) return
				setAfter((n) => nextAhead(n, maxAfterRef.current))
			},
			{ root: el, rootMargin: `0px 0px ${AHEAD_PAD}px 0px` },
		)

		// What is observed now, so a commit that mounted nothing re-observes
		// nothing: observers fire an initial report for every node they are
		// handed, and a commit happens every time the active week changes.
		let weekCount = -1
		let todayNode: Element | null = null
		let sentinelNode: Element | null = null
		/** Attach the observers to whatever has mounted since the last commit. */
		const attach = () => {
			const nodes = el.querySelectorAll(`[${WEEK_ATTR}]`)
			if (nodes.length !== weekCount) {
				weekCount = nodes.length
				for (const node of nodes) {
					weeks.observe(node)
					line?.observe(node)
				}
			}
			const row = el.querySelector(`[${TODAY_ATTR}]`)
			if (row !== todayNode) {
				if (todayNode) today.unobserve(todayNode)
				if (row) today.observe(row)
				todayNode = row
			}
			const sentinel = el.querySelector(`[${AHEAD_SENTINEL_ATTR}]`)
			if (sentinel !== sentinelNode) {
				if (sentinelNode) ahead.unobserve(sentinelNode)
				if (sentinel) ahead.observe(sentinel)
				sentinelNode = sentinel
			}
		}
		/** The line is a margin off the scroller's height, so a resize rebuilds it. */
		const rebuildLine = () => {
			line?.disconnect()
			crossing.clear()
			line = new IntersectionObserver(lineCallback, {
				root: el,
				rootMargin: activeLineMargin(el.clientHeight),
			})
			for (const node of el.querySelectorAll(`[${WEEK_ATTR}]`)) {
				line.observe(node)
			}
		}
		rebuildLine()
		attach()
		attachRef.current = attach
		window.addEventListener('resize', rebuildLine)
		return () => {
			window.removeEventListener('resize', rebuildLine)
			attachRef.current = () => {}
			weeks.disconnect()
			line?.disconnect()
			today.disconnect()
			ahead.disconnect()
		}
	}, [scroller])

	// ——— jumping ——————————————————————————————————————————————————————————

	const backToToday = useCallback(() => {
		const el = scroller()
		if (!el) return
		const want = landingTarget(el)
		if (want != null) jumpTo(el, want)
	}, [jumpTo, landingTarget, scroller])

	/**
	 * Jump to a queued week once it is mounted. A week ahead of the window has
	 * to wait for the commit that mounts it; that commit's layout effect drains
	 * it, before paint, so the reader never sees the list at the old position
	 * with the new week appended.
	 */
	const drainJump = useCallback(() => {
		const key = pendingJumpRef.current
		if (!key) return
		const el = scroller()
		const node = el?.querySelector(`[${WEEK_ATTR}="${cssEscape(key)}"]`)
		if (!el || !node) return
		pendingJumpRef.current = null
		jumpTo(el, offsetOf(el, node) - WEEK_JUMP_OFFSET)
	}, [jumpTo, offsetOf, scroller])

	const goToWeek = useCallback(
		(key: string) => {
			const index = weekKeys.indexOf(key)
			if (index < 0) return
			// A jump is the reader's own act: the landing has no more say.
			releaseRef.current()
			if (index > todayIndex + afterRef.current) setAfter(index - todayIndex)
			pendingJumpRef.current = key
			drainJump()
		},
		[drainJump, todayIndex, weekKeys],
	)

	// After every commit: drain a jump, and observe whatever has just mounted.
	useLayoutEffect(() => {
		drainJump()
		attachRef.current()
	})

	const readerKey = useCallback(() => activeRef.current, [])

	return {
		streamRef,
		activeWeekKey,
		frame,
		away,
		after,
		backToToday,
		goToWeek,
		readerKey,
	}
}

/**
 * Holds the reading position when the loader revalidates and puts height above
 * the reader — the one write this list makes on its own (ADR 0086).
 *
 * A class for `getSnapshotBeforeUpdate`, which is the only hook React offers
 * that runs **after** the render and **before** the DOM changes: the reader's
 * week is measured there, against the old layout, and again in
 * `componentDidUpdate`, against the new one, in the same frame. Nothing is
 * measured on renders that did not bring new data (`revision` is the season's
 * week list, so a scroll that moves the active week costs nothing here). A
 * band or a folded week opening is not new data, and holds its own position
 * (`bandScrollTop`), so the two never pay for the same height.
 */
export class ReadingHold extends Component<{
	/** Changes when the data under the list does — the season's weeks. */
	revision: unknown
	stream: () => HTMLElement | null
	readerKey: () => string
	children: ReactNode
}> {
	getSnapshotBeforeUpdate(previous: { revision: unknown }) {
		if (previous.revision === this.props.revision) return null
		const el = this.props.stream()
		if (!el?.isConnected) return null
		const key = this.props.readerKey()
		const node = el.querySelector(`[${WEEK_ATTR}="${cssEscape(key)}"]`)
		if (!node) return null
		return {
			key,
			offset:
				node.getBoundingClientRect().top -
				el.getBoundingClientRect().top +
				el.scrollTop,
			scrollTop: el.scrollTop,
		}
	}

	componentDidUpdate(
		_previous: unknown,
		_state: unknown,
		snapshot: { key: string; offset: number; scrollTop: number } | null,
	) {
		const el = this.props.stream()
		if (!el || !snapshot) return
		const node = el.querySelector(`[${WEEK_ATTR}="${cssEscape(snapshot.key)}"]`)
		if (!node) return
		const next = compensatedScrollTop(
			snapshot,
			node.getBoundingClientRect().top -
				el.getBoundingClientRect().top +
				el.scrollTop,
		)
		if (next == null || Math.abs(next - el.scrollTop) < 1) return
		const previous = el.style.scrollBehavior
		el.style.scrollBehavior = 'auto'
		el.scrollTop = Math.max(0, Math.round(next))
		el.style.scrollBehavior = previous
	}

	render() {
		return this.props.children
	}
}

/**
 * Week keys are `YYYY-MM-DD`, so they need no escaping today — but they are
 * data, and building a selector out of data without escaping it is how a
 * selector injection gets in later. `CSS.escape` is not in jsdom's older
 * surfaces, so fall back to the identity for the keys we actually issue.
 */
function cssEscape(value: string): string {
	return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
		? CSS.escape(value)
		: value
}
