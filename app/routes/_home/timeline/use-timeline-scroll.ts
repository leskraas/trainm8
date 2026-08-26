/**
 * The two axes, wired to a real scroller.
 *
 * This hook owns every measurement the home timeline makes and nothing else:
 * the arithmetic lives in `anchoring.ts`, so what is left here is "find the
 * node, measure it, decide, assign". Five behaviours share one scroll handler
 * because they share one measurement pass — folding the hero, growing the
 * window, tracking the active week, showing the pill, and holding the reading
 * position while a week loads in above.
 *
 * **The fold is written, not animated (#498).** It is a scroll effect on the
 * screen the athlete opens most, so it has no duration and no threshold: every
 * pass turns the distance from the landing point into a height, an opacity and
 * a lift, and assigns them. Nothing here waits for a transition to finish,
 * which is why the jump paths below can measure the instant they have moved.
 *
 * The awkward parts that remain are awkward on purpose:
 *
 * - **Landing is a ladder, not an effect.** Rows keep laying out after the first
 *   frame, so the initial `scrollTop` assignment is re-applied on a ladder of
 *   timers and only released once the layout has stopped moving. That ladder is
 *   about *late layout*, not about motion, so the fold going scroll-driven
 *   leaves it exactly as load-bearing as it was.
 * - **Nothing loads until the landing has settled**, or growth races the anchor
 *   and the athlete opens on a random week.
 * - **Growth above is compensated against a marked week's own offset**, never
 *   against total `scrollHeight`.
 * - **Programmatic scrolling is re-measured explicitly**, because assigning
 *   `scrollTop` does not reliably emit a `scroll` event and the strip would be
 *   left pointing at the week the athlete just left — and the fold would be left
 *   showing the distance from a position nobody is at any more.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	type AwayFromToday,
	activeWeekFrom,
	awayFromToday,
	centreScrollLeft,
	compensatedScrollTop,
	heroFold,
	HERO_LIFT_SHARE,
	LANDING_OFFSET,
	landingPosition,
	loadEdge,
	offsetWithin,
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
	/**
	 * The hero's clip box. The hook measures its open height and writes the fold
	 * straight onto it, because a fold that re-rendered React on every scroll
	 * frame would be the same cost the transition was removed for.
	 */
	heroRef: (node: HTMLDivElement | null) => void
	/** One handler for every axis-driven state; see the module note. */
	onStreamScroll: () => void
	/**
	 * True once the hero has folded all the way away — the point the compact
	 * header row takes over and the band leaves the tab order. The *partial*
	 * fold is not React state at all; it is the height on the node.
	 */
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
	const heroElRef = useRef<HTMLDivElement | null>(null)
	/** The hero's height with nothing folded away — the fold's whole travel. */
	const heroOpenRef = useRef(0)
	// A mirror of `collapsed`, for the same reason `activeKeyRef` mirrors the
	// active week: the fold runs on every scroll frame and must not set state it
	// has already set.
	const collapsedRef = useRef(false)
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

	/** Where "parked on today" is right now — the point the fold is measured from. */
	const landing = useCallback(
		(el: HTMLElement) => {
			const offset = todayOffset(el)
			return offset == null ? landingRef.current : landingPosition(offset)
		},
		[todayOffset],
	)

	/**
	 * The hero's open height. Read off the clip box's `scrollHeight`, which is
	 * its *content*, not the height the fold has assigned to it — so the travel
	 * survives being measured mid-fold. Zero before layout (the server render,
	 * jsdom), which `heroFold` reads as "write nothing".
	 */
	const measureHero = useCallback(() => {
		const hero = heroElRef.current
		if (hero?.isConnected && hero.scrollHeight > 0) {
			heroOpenRef.current = hero.scrollHeight
		}
		return heroOpenRef.current
	}, [])

	/**
	 * The fold itself: distance from the landing point, turned into a height, an
	 * opacity and a lift, and written to the node. No transition, no threshold
	 * and no React render — a partially folded hero is a number on an element,
	 * and only "folded all the way away" is worth re-rendering the header for.
	 */
	const applyFold = useCallback(
		(el: HTMLElement) => {
			const hero = heroElRef.current
			if (!hero?.isConnected) return
			const fold = heroFold({
				scrollTop: el.scrollTop,
				landing: landing(el),
				openHeight: measureHero(),
			})
			if (!fold) return
			hero.style.height = `${fold.heightPx}px`
			hero.style.opacity = `${fold.opacity}`
			// The lift is a share of the fold, published as a length the stylesheet
			// applies (`hero-lift` in `tailwind.css`) rather than a transform
			// written from here — so `prefers-reduced-motion` can drop the movement
			// without the hook having to know the athlete's preference.
			hero.style.setProperty(
				'--hero-lift',
				`${fold.foldPx * HERO_LIFT_SHARE}px`,
			)
			if (fold.collapsed === collapsedRef.current) return
			collapsedRef.current = fold.collapsed
			setCollapsed(fold.collapsed)
		},
		[landing, measureHero],
	)

	/**
	 * Assign a scroll position, **instantly**. The scrollers carry
	 * `scroll-behavior: smooth` for the athlete's own keyboard scrolling; every
	 * write this hook makes is a jump, so smooth is switched off around it.
	 *
	 * It used to write, read the property back, and only fall back to this if the
	 * write had missed by more than 2px — restoring smooth on a timer afterwards.
	 * The probe could not fail: a smooth scroll has not started moving by the
	 * time the property is read, so *every* write took the fallback anyway. What
	 * the probe bought was a timer between assigning a position and being able to
	 * trust it, and that is the thing the jump paths below no longer want.
	 */
	const jumpTo = useCallback(
		(el: HTMLElement, axis: 'x' | 'y', want: number) => {
			const prop = axis === 'x' ? 'scrollLeft' : 'scrollTop'
			const previous = el.style.scrollBehavior
			el.style.scrollBehavior = 'auto'
			el[prop] = Math.max(0, want)
			// Restored in the same tick: the assignment above is synchronous and
			// already done, so nothing is left for smooth to animate.
			el.style.scrollBehavior = previous
		},
		[],
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
			jumpTo(
				strip,
				'x',
				centreScrollLeft(left, cell.offsetWidth, strip.clientWidth),
			)
		},
		[jumpTo],
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
		resync()
		// No loading at all until the landing has settled: a week arriving mid-
		// landing moves today's row while the ladder is still aiming at it.
		if (landedRef.current) {
			const edge = loadEdge(
				{
					scrollTop: el.scrollTop,
					clientHeight: el.clientHeight,
					scrollHeight: el.scrollHeight,
				},
				{ earlier: before < maxBefore, later: after < maxAfter },
			)
			if (edge) grow(edge)
		}
		// Last, because it is the only thing in the pass that *writes* to the
		// layout. Everything above reads it, and a write in the middle would have
		// the browser lay the page out twice for one scroll frame — which is the
		// cost this fold exists to avoid paying.
		applyFold(el)
	}, [after, applyFold, before, grow, maxAfter, maxBefore, resync, scroller])

	// ——— landing ——————————————————————————————————————————————————————————

	/**
	 * Put the stream on today. Not animated: the athlete should open *on* today
	 * rather than watch the app scroll there.
	 */
	const settle = useCallback(() => {
		if (landedRef.current) return
		const el = scroller()
		if (!el) return
		const offset = todayOffset(el)
		// Nothing to aim at yet: no anchor, or a stream that has not laid out far
		// enough to be scrollable at all.
		if (offset == null || el.scrollHeight <= el.clientHeight) return
		const want = landingPosition(offset)
		if (!want) return
		jumpTo(el, 'y', want)
		landingRef.current = want
	}, [jumpTo, scroller, todayOffset])

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

	const heroRef = useCallback((node: HTMLDivElement | null) => {
		heroElRef.current = node
	}, [])

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
		if (offset != null) jumpTo(el, 'y', offset - LANDING_OFFSET)
		// Measured here rather than on a ladder of timers. The jump above is
		// instant, so there is no smooth scroll to land mid-flight of, and the
		// fold is a write rather than a transition — both are true of the position
		// the moment the assignment returns. Assigning `scrollTop` does not
		// reliably emit a `scroll` event, which is why this is by hand at all.
		resync()
		applyFold(el)
	}, [applyFold, homeKey, jumpTo, resync, scroller, todayOffset])

	/**
	 * Drain a queued jump once its week is mounted. A jump into an unloaded week
	 * has to wait for the render that loads it, so the queue is drained from the
	 * after-every-render effect — and once more, straight away, by `goToWeek`
	 * itself, for the week that was already mounted and therefore renders nothing
	 * new to be drained by.
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
		jumpTo(el, 'y', offsetOf(el, node) - WEEK_JUMP_OFFSET)
		resync()
		applyFold(el)
	}, [applyFold, jumpTo, offsetOf, resync, scroller])

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
			// A week already inside the window mounts nothing new, so there is no
			// render for the effect below to drain the jump from.
			drainJump()
		},
		[after, before, drainJump, todayIndex, weekKeys],
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
		// Through `jumpTo`, never a bare assignment. Held back into a *smooth*
		// scroller, the compensation animates instead of landing — and the frames
		// it animates through are scroll events of their own, each one re-running
		// the pass that decided to grow. Two growths then compensate against each
		// other's half-finished positions and the athlete's place is lost.
		if (next != null) jumpTo(el, 'y', next)
	})

	// Re-written after every render, last, so it reads the position the passes
	// above have just settled on. A week loading in above moves today's row and
	// the reading position by the same amount, so the fold this recomputes is
	// unchanged — which is the point: growth compensation holds the *fold* still
	// as well as the page, and it can only do that if the two are measured
	// together.
	useEffect(() => {
		const el = scroller()
		if (el) applyFold(el)
	})

	// A rotation changes the hero's height, and the fold's whole travel with it.
	useEffect(() => {
		const remeasure = () => {
			const el = scroller()
			if (!el) return
			heroOpenRef.current = 0
			applyFold(el)
		}
		window.addEventListener('resize', remeasure)
		return () => window.removeEventListener('resize', remeasure)
	}, [applyFold, scroller])

	return {
		streamRef,
		stripRef,
		heroRef,
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
