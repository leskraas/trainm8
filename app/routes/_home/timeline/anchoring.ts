/**
 * The measurement arithmetic behind the home timeline's two axes, kept pure so
 * the numbers that were hard to get right are testable without a scroll
 * container, a layout pass or a browser.
 *
 * Every function here takes plain numbers or a minimal `Box` — never a real
 * `Element` — so the hook that owns the DOM (`use-timeline-scroll.ts`) reads as
 * a sequence of "measure, decide, apply" and the deciding half is covered by
 * unit tests.
 */

/** The one fact these helpers need from a DOM node: where its box starts. */
export type Box = { top: number }

/**
 * Today's row parks this far below the top of the stream, leaving the week
 * header and a little air above it so the row reads as *arrived at* rather than
 * flush against the edge.
 */
export const LANDING_OFFSET = 96

/**
 * A week jumped to from the strip parks flush, minus a hair: its sticky header
 * should sit *at* the top, and 2px of slack keeps a sub-pixel measurement from
 * scrolling the header out of its own sticky slot.
 */
export const WEEK_JUMP_OFFSET = 2

/**
 * How much of the fold the fade takes. The two halves of the collapse run at
 * different rates on purpose: the hero is transparent well before the box has
 * finished closing, so what the athlete watches is a band *leaving* rather than
 * legible text being squashed.
 */
export const HERO_FADE_SHARE = 0.6

/**
 * How far the hero drifts up while it folds, as a share of the fold. A parallax
 * lift rather than a squash — the band recedes instead of being crushed. It is
 * the only *movement* in the collapse, which is why it is the only part
 * `prefers-reduced-motion` drops (see `hero-lift` in `tailwind.css`); the fold
 * and the fade are not movement and carry the collapse on their own.
 */
export const HERO_LIFT_SHARE = 0.5

/**
 * A week header counts as "the week the stream is parked in" once it has passed
 * this line — a little below the top edge, so the active cell flips when the
 * header reaches the reading position rather than the instant it appears.
 */
export const ACTIVE_WEEK_LINE = 70

/** Today's row is far enough above the viewport to offer a way back down. */
export const PILL_ABOVE = -60

/** Distance from the bottom edge at which today's row counts as below the fold. */
export const PILL_BELOW_INSET = 40

/**
 * Re-apply the landing on this ladder of delays (ms). Rows keep laying out
 * after the first frame — profile bars resolve, a long title wraps — so one
 * measurement is not enough, and `requestAnimationFrame` is the wrong tool: the
 * ladder exists for *late layout*, not for missing frames.
 */
export const SETTLE_LADDER = [0, 60, 160, 320, 700, 1200] as const

/**
 * How long the landing holds the stream. Past this the athlete owns the scroll
 * position, loading is released, and a late layout pass may no longer yank the
 * reading position back to today.
 */
export const SETTLE_WINDOW_MS = 1300

/**
 * The strip centres itself on this ladder after mounting. Same reason as
 * `SETTLE_LADDER`: cell widths are fixed but the fonts inside them are not, so
 * the scroll-snap container needs more than one chance to land centred.
 */
export const STRIP_CENTRE_LADDER = [0, 120, 400, 900] as const

/** Loading may not start until the landing has settled — see `SETTLE_WINDOW_MS`. */
export const LOAD_PAD_MIN = 80
export const LOAD_PAD_MAX = 320
export const LOAD_PAD_VIEWPORT_SHARE = 0.5

/**
 * A node's offset inside its scroller, measured against the **scroller's own
 * box**. `offsetTop` is wrong here and was the original bug: its `offsetParent`
 * is whichever positioned ancestor happens to be nearest, so the number it
 * gives is an offset inside something that is not the thing being scrolled.
 */
export function offsetWithin(
	scroller: Box & { scrollTop: number },
	node: Box,
): number {
	return node.top - scroller.top + scroller.scrollTop
}

/**
 * Where "parked on today" is. Re-measured live rather than remembered from
 * mount, so it survives weeks loading in above — which move today's row down
 * the stream without the athlete having scrolled at all.
 *
 * It is a fact about today's row and about nothing else — in particular it is
 * never clamped to the stream's scroll range. The hero's fold is measured from
 * here, and folding the hero hands the stream back the height the hero was
 * using, so a landing that knew about `clientHeight` would move every time the
 * fold moved and the fold would be measured from a point the fold itself had
 * shifted.
 */
export function landingPosition(todayOffset: number): number {
	return Math.max(0, todayOffset - LANDING_OFFSET)
}

/** Everything the hero's collapse needs written to the DOM, in one shape. */
export type HeroFold = {
	/** 0 parked on today, 1 fully folded away. */
	progress: number
	/** The clip box's height, in px. */
	heightPx: number
	/** How much height the fold has taken, in px — what the lift is drawn from. */
	foldPx: number
	opacity: number
	/** Folded far enough to be gone: the compact header row takes over here. */
	collapsed: boolean
}

/**
 * The collapse, read straight off the scroll offset — **no duration, no
 * threshold, no curve**. Drifting away from the landing point in either
 * direction folds the hero by exactly the distance drifted, so half a drag
 * leaves it half folded and reversing reverses it from wherever it is.
 *
 * The travel is the hero's **own open height**, which is not an arbitrary
 * choice. The hero sits above the stream rather than inside it, so every pixel
 * the fold takes off the header is a pixel the stream's viewport gains: while
 * the hero is folding, content moves `1 + openHeight/travel` times as fast as
 * the thumb. A travel of exactly the open height makes that 2 — the smallest
 * number a full fold can be done in — and anything shorter buys a quicker fold
 * by multiplying the lurch it was supposed to remove.
 *
 * `null` when the hero has not been measured yet: on the server, before layout,
 * and in jsdom. The caller writes nothing then and the hero renders at its
 * natural height, which is what "not collapsed" has to look like with no
 * numbers to go on.
 */
export function heroFold({
	scrollTop,
	landing,
	openHeight,
}: {
	scrollTop: number
	landing: number
	/** The hero's height with nothing folded away — the fold's whole travel. */
	openHeight: number
}): HeroFold | null {
	if (!(openHeight > 0)) return null
	const progress = clamp01(Math.abs(scrollTop - landing) / openHeight)
	return {
		progress,
		heightPx: openHeight * (1 - progress),
		foldPx: openHeight * progress,
		opacity: clamp01(1 - progress / HERO_FADE_SHARE),
		collapsed: progress >= 1,
	}
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value))
}

/**
 * The distance from either edge at which the next week loads. A fixed pad is
 * wrong: this stream's viewport is a phone's, and a pad larger than the
 * viewport makes "near the end" true at every position — including the landing
 * one, which would walk the stream to the end of the plan on open.
 */
export function loadPad(clientHeight: number): number {
	return Math.max(
		LOAD_PAD_MIN,
		Math.min(LOAD_PAD_MAX, clientHeight * LOAD_PAD_VIEWPORT_SHARE),
	)
}

/** Which end of the stream the reader has reached, if either. */
export type LoadEdge = 'earlier' | 'later' | null

/**
 * Which week to load next, given where the reader is. The two tests are
 * mutually exclusive per pass: a stream shorter than two pads would otherwise
 * satisfy both and grow at both ends forever.
 */
export function loadEdge(
	view: { scrollTop: number; clientHeight: number; scrollHeight: number },
	room: { earlier: boolean; later: boolean },
): LoadEdge {
	const pad = loadPad(view.clientHeight)
	if (view.scrollTop < pad && room.earlier) return 'earlier'
	if (
		view.scrollTop + view.clientHeight > view.scrollHeight - pad &&
		room.later
	) {
		return 'later'
	}
	return null
}

/** Where the pill points, or that it stays hidden: −1 above, 0 in view, +1 below. */
export type AwayFromToday = -1 | 0 | 1

/**
 * Whether today's row is off-screen and which way. `rel` is today's offset
 * relative to the current scroll position, so it is negative once the row has
 * gone up past the top edge.
 */
export function awayFromToday(
	todayOffset: number,
	scrollTop: number,
	clientHeight: number,
): AwayFromToday {
	const rel = todayOffset - scrollTop
	if (rel < PILL_ABOVE) return -1
	if (rel > clientHeight - PILL_BELOW_INSET) return 1
	return 0
}

/**
 * The week the stream is parked in: the **last** week whose header has passed
 * the active line. Scanning to the last match rather than the first is what
 * makes a tall week keep the strip on itself all the way down.
 */
export function activeWeekFrom(
	weeks: Array<{ key: string; offset: number }>,
	scrollTop: number,
	fallback: string,
): string {
	let active = fallback
	for (const week of weeks) {
		if (week.offset - ACTIVE_WEEK_LINE <= scrollTop) active = week.key
	}
	return active
}

/**
 * How far to scroll the strip so a cell sits in the middle of it. Expressed as
 * a target `scrollLeft`, so the caller only has to assign it.
 */
export function centreScrollLeft(
	cellLeft: number,
	cellWidth: number,
	stripWidth: number,
): number {
	return Math.max(0, cellLeft - (stripWidth - cellWidth) / 2)
}

/**
 * The reading position after a week has loaded in above. `before` is a stable
 * week node's own offset and the scroll position, both recorded *before* the
 * state change; `nowAt` is that same node's offset after the render.
 *
 * The delta belongs to the marked node, never to total `scrollHeight`: a week
 * appended *below* in the same pass grows the scroll height too, and crediting
 * that as height inserted above walks the stream to the end of the plan a week
 * at a time. When nothing moved above the mark the delta is 0 and the position
 * is left exactly as the athlete left it.
 */
/**
 * The reading position after a **past band** has expanded or collapsed in place
 * (#500). `before` is the band's own offset inside the scroller and the scroll
 * position, both read before the toggle; `delta` is the height the toggle added
 * (or, collapsing, removed).
 *
 * The one rule, and it is the whole of the AC: *what the reader can see does not
 * move*. Everything above the band is untouched by the toggle, so a band that
 * opens at or below the top edge needs no correction at all — the row they
 * tapped stays exactly where their thumb left it and the days grow downwards
 * from it. A band whose top has already gone up past the edge is the other case:
 * every pixel the reader is looking at is *below* the insertion, so the position
 * has to take the delta back or the run walks them down the season.
 *
 * Null means "leave it alone", so the caller never writes a `scrollTop` it did
 * not need to — an assignment of the same number still cancels a smooth scroll
 * in flight.
 */
export function bandScrollTop(
	before: { offset: number; scrollTop: number },
	delta: number,
): number | null {
	if (delta === 0) return null
	if (before.offset >= before.scrollTop) return null
	return Math.max(0, before.scrollTop + delta)
}

export function compensatedScrollTop(
	before: { offset: number; scrollTop: number },
	nowAt: number,
): number | null {
	const delta = nowAt - before.offset
	if (delta === 0) return null
	return before.scrollTop + delta
}
