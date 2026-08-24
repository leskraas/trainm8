/**
 * The measurement and threshold arithmetic behind the home timeline's two axes,
 * kept pure so the numbers that were hard to get right are testable without a
 * scroll container, a layout pass or a browser.
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
 * How far the stream may drift from the landing point before the hero folds
 * away. Measured from the landing position, not from zero: landing sits far
 * down a bi-directional stream, so an absolute `scrollTop > 40` test would have
 * the hero collapsed on open and the athlete would never see today's session.
 */
export const COLLAPSE_THRESHOLD = 40

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

/**
 * Programmatic scrolling does not reliably emit `scroll` events, so the active
 * week and the pill are recomputed explicitly after a jump — twice, because the
 * first pass can land mid-smooth-scroll.
 */
export const POST_JUMP_LADDER = [40, 220] as const

/** A queued jump waits for its week to reach the DOM; this is how long it tries. */
export const DRAIN_JUMP_LADDER = [0, 60] as const

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
 */
export function landingPosition(todayOffset: number): number {
	return Math.max(0, todayOffset - LANDING_OFFSET)
}

/**
 * Whether the hero is folded away: movement away from the landing point in
 * **either** direction collapses it, and coming back opens it again.
 */
export function isCollapsed(scrollTop: number, landing: number): boolean {
	return Math.abs(scrollTop - landing) > COLLAPSE_THRESHOLD
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
export function compensatedScrollTop(
	before: { offset: number; scrollTop: number },
	nowAt: number,
): number | null {
	const delta = nowAt - before.offset
	if (delta === 0) return null
	return before.scrollTop + delta
}
