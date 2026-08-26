/**
 * The two axes, wired to a real scroller.
 *
 * This hook owns every measurement the home timeline makes and nothing else:
 * the arithmetic lives in `anchoring.ts`, so what is left here is "find the
 * node, measure it, decide, assign". Five behaviours share one scroll handler
 * because they share one measurement pass — collapsing the hero, growing the
 * window, tracking the active week, showing the pill, and holding the reading
 * position while a week loads in above.
 *
 * The awkward parts are awkward on purpose:
 *
 * - **Landing is a ladder, not an effect.** Rows keep laying out after the first
 *   frame, so the initial `scrollTop` assignment is re-applied on a ladder of
 *   timers and only released once the layout has stopped moving.
 * - **Nothing loads until the landing has settled**, or growth races the anchor
 *   and the athlete opens on a random week.
 * - **Growth above is compensated against a marked week's own offset**, never
 *   against total `scrollHeight`.
 * - **Programmatic scrolling is re-measured explicitly**, because assigning
 *   `scrollTop` does not reliably emit a `scroll` event and the strip would be
 *   left pointing at the week the athlete just left.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	type AwayFromToday,
	activeWeekFrom,
	awayFromToday,
	centreScrollLeft,
	compensatedScrollTop,
	DRAIN_JUMP_LADDER,
	isCollapsed,
	LANDING_OFFSET,
	landingPosition,
	loadEdge,
	offsetWithin,
	POST_JUMP_LADDER,
	SETTLE_LADDER,
	SETTLE_WINDOW_MS,
	STRIP_CENTRE_LADDER,
	WEEK_JUMP_OFFSET,
} from './anchoring.ts'

/** The DOM contract between this hook and the markup that renders the timeline. */
export const WEEK_ATTR = 'data-timeline-week'
/** The scroller itself — how a row deep in the stream finds what it scrolls in. */
export const STREAM_ATTR = 'data-timeline-stream'
export const TODAY_ATTR = 'data-timeline-today'
export const CELL_ATTR = 'data-timeline-cell'

export type TimelineScroll = {
	streamRef: (node: HTMLDivElement | null) => void
	stripRef: (node: HTMLDivElement | null) => void
	/** One handler for every axis-driven state; see the module note. */
	onStreamScroll: () => void
	/** True once the stream has moved away from the landing point, either way. */
	collapsed: boolean
	/** The week the stream is parked in — the strip's active cell. */
	activeWeekKey: string
	/** −1 above the fold, 0 in view, +1 below; drives the back-to-today pill. */
	away: AwayFromToday
	/** How many weeks either side of today are mounted. */
	loaded: { before: number; after: number }
	backToToday: () => void
	/** Load the week if it is outside the window, then jump the stream to it. */
	goToWeek: (key: string) => void
}

export function useTimelineScroll({
	weekKeys,
	todayIndex,
}: {
	weekKeys: string[]
	/** Index of today's week in `weekKeys` — the window grows from here. */
	todayIndex: number
}): TimelineScroll {
	const homeKey = weekKeys[todayIndex] ?? weekKeys[0] ?? ''
	const [before, setBefore] = useState(1)
	const [after, setAfter] = useState(1)
	const [collapsed, setCollapsed] = useState(false)
	const [activeWeekKey, setActiveWeekKey] = useState(homeKey)
	const [away, setAway] = useState<AwayFromToday>(0)
	// A mirror of `activeWeekKey` for the measuring path to read. A state updater
	// must stay pure — React may run it more than once — and deciding to re-centre
	// the strip is a side effect, so the comparison happens out here instead.
	const activeKeyRef = useRef(homeKey)

	const streamElRef = useRef<HTMLDivElement | null>(null)
	const stripElRef = useRef<HTMLDivElement | null>(null)
	/** False while the initial landing still owns the scroll position. */
	const landedRef = useRef(false)
	const mountedAtRef = useRef(0)
	/** The last measured landing position, for when today's row is not mounted. */
	const landingRef = useRef(0)
	/** A stable week node and its offset, recorded before a week loads above. */
	const pendingGrowthRef = useRef<{
		key: string
		offset: number
		scrollTop: number
	} | null>(null)
	/** A jump waiting for its week to reach the DOM. */
	const pendingJumpRef = useRef<string | null>(null)
	/** A strip cell waiting to be centred after the render that mounts it. */
	const pendingCentreRef = useRef<string | null>(null)
	/** One growth per pass; two in the same tick would double-count the window. */
	const growingRef = useRef(false)

	// Every timer this hook starts, so unmounting cannot leave one measuring a
	// detached node — jsdom and React both complain, and rightly.
	const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>())
	const later = useCallback((fn: () => void, ms: number) => {
		const id = setTimeout(() => {
			timersRef.current.delete(id)
			fn()
		}, ms)
		timersRef.current.add(id)
	}, [])
	useEffect(
		() => () => {
			for (const id of timersRef.current) clearTimeout(id)
			timersRef.current.clear()
		},
		[],
	)

	const maxBefore = todayIndex
	const maxAfter = Math.max(0, weekKeys.length - 1 - todayIndex)

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

	const todayOffset = useCallback(
		(el: HTMLElement) => {
			const node = el.querySelector(`[${TODAY_ATTR}]`)
			return node ? offsetOf(el, node) : null
		},
		[offsetOf],
	)

	const landing = useCallback(
		(el: HTMLElement) => {
			const offset = todayOffset(el)
			return offset == null ? landingRef.current : landingPosition(offset)
		},
		[todayOffset],
	)

	/**
	 * Assign a scroll position. `scrollTo({ behavior: 'smooth' })` is unreliable
	 * on a snap container, so the scrollers carry `scroll-behavior: smooth` and
	 * this assigns the property. Where the assignment does not take — a
	 * smooth-scrolling snap container can ignore one — smooth is switched off for
	 * that single write and restored after it.
	 */
	const glide = useCallback(
		(el: HTMLElement, axis: 'x' | 'y', want: number) => {
			const prop = axis === 'x' ? 'scrollLeft' : 'scrollTop'
			const target = Math.max(0, want)
			el[prop] = target
			if (Math.abs(el[prop] - target) > 2) {
				const previous = el.style.scrollBehavior
				el.style.scrollBehavior = 'auto'
				el[prop] = target
				later(() => {
					el.style.scrollBehavior = previous
				}, 0)
			}
		},
		[later],
	)

	const centreStrip = useCallback(
		(key: string) => {
			const strip = stripElRef.current
			if (!strip?.isConnected) return
			const cell = strip.querySelector<HTMLElement>(
				`[${CELL_ATTR}="${cssEscape(key)}"]`,
			)
			if (!cell) return
			const left =
				cell.getBoundingClientRect().left -
				strip.getBoundingClientRect().left +
				strip.scrollLeft
			glide(
				strip,
				'x',
				centreScrollLeft(left, cell.offsetWidth, strip.clientWidth),
			)
		},
		[glide],
	)

	// ——— the scroll pass ——————————————————————————————————————————————————

	/**
	 * Recompute the active week and the pill from wherever the stream is now.
	 * Split out from the scroll handler because a programmatic jump has to run it
	 * by hand: assigning `scrollTop` does not reliably emit a `scroll` event.
	 */
	const resync = useCallback(() => {
		const el = scroller()
		if (!el) return
		const top = el.scrollTop
		const weeks = [...el.querySelectorAll<HTMLElement>(`[${WEEK_ATTR}]`)].map(
			(node) => ({
				key: node.getAttribute(WEEK_ATTR) ?? '',
				offset: offsetOf(el, node),
			}),
		)
		const nextWeek = activeWeekFrom(weeks, top, activeKeyRef.current)
		if (nextWeek !== activeKeyRef.current) {
			activeKeyRef.current = nextWeek
			pendingCentreRef.current = nextWeek
			setActiveWeekKey(nextWeek)
		}
		const offset = todayOffset(el)
		if (offset != null) setAway(awayFromToday(offset, top, el.clientHeight))
	}, [offsetOf, scroller, todayOffset])

	const grow = useCallback(
		(edge: 'earlier' | 'later') => {
			const el = scroller()
			if (!el || growingRef.current) return
			growingRef.current = true
			// Mark a week that is already mounted and remember *its* offset. After
			// the render its offset has moved by exactly the height inserted above
			// it — which is the only number that can be safely added back.
			const mark = el.querySelector<HTMLElement>(`[${WEEK_ATTR}]`)
			if (mark) {
				pendingGrowthRef.current = {
					key: mark.getAttribute(WEEK_ATTR) ?? '',
					offset: offsetOf(el, mark),
					scrollTop: el.scrollTop,
				}
			}
			if (edge === 'earlier') setBefore((n) => Math.min(maxBefore, n + 1))
			else setAfter((n) => Math.min(maxAfter, n + 1))
			later(() => {
				growingRef.current = false
			}, 0)
		},
		[later, maxAfter, maxBefore, offsetOf, scroller],
	)

	const onStreamScroll = useCallback(() => {
		const el = scroller()
		if (!el) return
		const top = el.scrollTop
		setCollapsed(isCollapsed(top, landing(el)))
		resync()
		// No loading at all until the landing has settled: a week arriving mid-
		// landing moves today's row while the ladder is still aiming at it.
		if (!landedRef.current) return
		const edge = loadEdge(
			{
				scrollTop: top,
				clientHeight: el.clientHeight,
				scrollHeight: el.scrollHeight,
			},
			{ earlier: before < maxBefore, later: after < maxAfter },
		)
		if (edge) grow(edge)
	}, [after, before, grow, landing, maxAfter, maxBefore, resync, scroller])

	// ——— landing ——————————————————————————————————————————————————————————

	/**
	 * Put the stream on today. Not animated — smooth is killed for the single
	 * assignment and restored straight after, because the athlete should open
	 * *on* today rather than watch the app scroll there.
	 */
	const settle = useCallback(() => {
		if (landedRef.current) return
		const el = scroller()
		if (!el) return
		const previous = el.style.scrollBehavior
		el.style.scrollBehavior = 'auto'
		later(() => {
			el.style.scrollBehavior = previous
		}, 0)
		const offset = todayOffset(el)
		// Nothing to aim at yet: no anchor, or a stream that has not laid out far
		// enough to be scrollable at all.
		if (offset == null || el.scrollHeight <= el.clientHeight) return
		const want = landingPosition(offset)
		if (!want) return
		el.scrollTop = want
		landingRef.current = want
	}, [later, scroller, todayOffset])

	/**
	 * Hand the scroll position back to the athlete. On its own timer rather than
	 * folded into the last rung of the ladder: the release has to happen even if
	 * nothing renders again, and it *must* happen, because until it does every
	 * scroll of theirs is undone by the next settle — the first scroll away from
	 * today would snap straight back and the hero would never collapse.
	 */
	const release = useCallback(() => {
		if (landedRef.current) return
		landedRef.current = true
		setAway(0)
		activeKeyRef.current = homeKey
		setActiveWeekKey(homeKey)
		pendingCentreRef.current = homeKey
	}, [homeKey])

	const streamRef = useCallback(
		(node: HTMLDivElement | null) => {
			if (!node || streamElRef.current === node) return
			streamElRef.current = node
			landedRef.current = false
			mountedAtRef.current = Date.now()
			for (const delay of SETTLE_LADDER) later(() => settle(), delay)
			later(() => release(), SETTLE_WINDOW_MS)
		},
		[later, release, settle],
	)

	const stripRef = useCallback(
		(node: HTMLDivElement | null) => {
			if (!node || stripElRef.current === node) return
			stripElRef.current = node
			for (const delay of STRIP_CENTRE_LADDER) {
				later(() => centreStrip(homeKey), delay)
			}
		},
		[centreStrip, homeKey, later],
	)

	// ——— jumping ——————————————————————————————————————————————————————————

	const backToToday = useCallback(() => {
		const el = scroller()
		if (!el) return
		landedRef.current = true
		activeKeyRef.current = homeKey
		setActiveWeekKey(homeKey)
		setAway(0)
		pendingCentreRef.current = homeKey
		const offset = todayOffset(el)
		if (offset != null) glide(el, 'y', offset - LANDING_OFFSET)
		for (const delay of POST_JUMP_LADDER) later(() => resync(), delay)
	}, [glide, homeKey, later, resync, scroller, todayOffset])

	/**
	 * Drain a queued jump once its week is mounted. A jump into an unloaded week
	 * has to wait for the render that loads it, and React's `setState` gives no
	 * usable "after the DOM has it" callback, so the queue is drained from the
	 * post-render effect and from a short ladder of timers.
	 */
	const drainJump = useCallback(() => {
		const key = pendingJumpRef.current
		if (!key) return
		const el = scroller()
		const node = el?.querySelector<HTMLElement>(
			`[${WEEK_ATTR}="${cssEscape(key)}"]`,
		)
		if (!el || !node) return
		pendingJumpRef.current = null
		landedRef.current = true
		glide(el, 'y', offsetOf(el, node) - WEEK_JUMP_OFFSET)
		for (const delay of POST_JUMP_LADDER) later(() => resync(), delay)
	}, [glide, later, offsetOf, resync, scroller])

	const goToWeek = useCallback(
		(key: string) => {
			const index = weekKeys.indexOf(key)
			if (index < 0) return
			if (index < todayIndex - before) setBefore(todayIndex - index)
			if (index > todayIndex + after) setAfter(index - todayIndex)
			activeKeyRef.current = key
			setActiveWeekKey(key)
			pendingCentreRef.current = key
			pendingJumpRef.current = key
			for (const delay of DRAIN_JUMP_LADDER) later(() => drainJump(), delay)
		},
		[after, before, drainJump, later, todayIndex, weekKeys],
	)

	// ——— after every render ————————————————————————————————————————————————

	useEffect(() => {
		drainJump()
		settle()
		const centre = pendingCentreRef.current
		if (centre) {
			pendingCentreRef.current = null
			centreStrip(centre)
		}
		const pending = pendingGrowthRef.current
		if (!pending) return
		pendingGrowthRef.current = null
		const el = scroller()
		const mark = el?.querySelector<HTMLElement>(
			`[${WEEK_ATTR}="${cssEscape(pending.key)}"]`,
		)
		if (!el || !mark) return
		const next = compensatedScrollTop(pending, offsetOf(el, mark))
		if (next != null) el.scrollTop = next
	})

	return {
		streamRef,
		stripRef,
		onStreamScroll,
		collapsed,
		activeWeekKey,
		away,
		loaded: { before, after },
		backToToday,
		goToWeek,
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
