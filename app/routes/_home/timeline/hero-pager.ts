/**
 * The hero's pager, as arithmetic.
 *
 * Home has two horizontal axes and they are different instruments (ADR 0065
 * §8): the strip **scrolls** — a scrubber, native overflow, proximity snap —
 * and the hero **pages**, one full-width pane per gesture, mandatory snap, four
 * dots. Which is why the strip needs no module like this one and the hero does:
 * a scrubber lands where the finger left it, and a pager has to decide.
 *
 * It decides by **projecting the flick**, not by measuring the release. A thumb
 * that flicks 20px and lets go at 900px/s was heading for the next pane; the
 * nearest pane to where it stopped is the one it started on. So the landing
 * pane comes from where the momentum was going:
 *
 *     projected = offset + (v / 1000) · d / (1 − d)      d = 0.998
 *
 * which is the closed form of "keep decaying this velocity by `d` every
 * millisecond until it dies". `d / (1 − d)` is 499, so a 900px/s flick projects
 * 449px — more than a 390px pane — and lands on the next one.
 *
 * Then **one pane per gesture**. The projection decides *which way* and
 * *whether*, never how far: a hard flick across three panes is still one pane,
 * because the dots are the indicator and a pager that skips them stops being
 * countable. Crossing the season at speed is the strip's job.
 *
 * Everything here is pure so the gesture can be tested with a velocity instead
 * of a browser; the spring that carries the pane there lives on the component.
 */

/** The four facets of now, in order. The hero opens on the first (ADR 0065 §8). */
export const HERO_PANES = ['Today', 'Form', 'This week', 'Records'] as const

export type HeroPaneName = (typeof HERO_PANES)[number]

/**
 * Momentum decay per millisecond — the canvas's `d ≈ 0.998`. High enough that a
 * flick projects several hundred pixels, low enough that a drag-and-release
 * projects almost nothing, which is the whole distinction being drawn.
 */
export const FLICK_DECAY = 0.998

/**
 * The spring the pane settles on: **critically damped**, because a deliberate
 * swipe carried no momentum to pay back and a pane that overshoots and returns
 * reads as an animation rather than as a page turn. `duration` on a spring with
 * `bounce: 0` is the time to settle, not a keyframe length.
 */
export const PANE_SPRING = {
	type: 'spring',
	bounce: 0,
	duration: 0.35,
} as const

/**
 * Where a flick was heading, in pixels from the resting position: the release
 * offset plus everything the remaining velocity would still have travelled.
 */
export function projectFlick(
	offsetPx: number,
	velocityPxPerSec: number,
	decay: number = FLICK_DECAY,
): number {
	return offsetPx + (velocityPxPerSec / 1000) * (decay / (1 - decay))
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

/**
 * The pane a gesture landed on: the projected flick, rounded to the nearest
 * pane, capped at one pane per gesture and at the ends of the pager.
 *
 * A leftward drag is a negative offset and moves *forward* through the panes,
 * which is why the projection is negated before it is measured in panes.
 */
export function paneAfterFlick({
	index,
	offsetPx,
	velocityPxPerSec,
	paneWidthPx,
	paneCount = HERO_PANES.length,
}: {
	/** The pane the gesture started on. */
	index: number
	/** Release offset from the resting position; negative is a drag leftwards. */
	offsetPx: number
	/** Release velocity in px/s; negative is travelling leftwards. */
	velocityPxPerSec: number
	paneWidthPx: number
	paneCount?: number
}): number {
	// No measured width means no layout yet (server render, jsdom): there is
	// nothing to divide by and nowhere the gesture could have been heading.
	if (paneWidthPx <= 0) return clamp(index, 0, paneCount - 1)
	const projected = projectFlick(offsetPx, velocityPxPerSec)
	const panes = clamp(Math.round(-projected / paneWidthPx), -1, 1)
	return clamp(index + panes, 0, paneCount - 1)
}
