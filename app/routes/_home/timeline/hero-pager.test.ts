/**
 * The hero's pager, as arithmetic (ADR 0065 §8).
 *
 * The whole reason this is a module and not four lines inside a component: a
 * flick has to land on the pane the gesture was **heading for**, and a test that
 * only moves a finger from A to B can never tell that apart from landing on
 * whatever was nearest to B. Every case here carries a velocity.
 *
 * The numbers are worked from the projection the design canvas states —
 * `offset + (v/1000) · d/(1−d)` with `d = 0.998`, so the momentum term is
 * `v · 0.499` — against a 390px pane, which is the width ADR 0028 gates every
 * screen at.
 */
import { expect, test } from 'vitest'
import {
	HERO_PANES,
	PANE_SPRING,
	paneAfterFlick,
	projectFlick,
} from './hero-pager.ts'

const PANE_WIDTH = 390

/** A gesture on a 390px pane, from the pane it started on. */
function flick({
	index = 0,
	offsetPx,
	velocityPxPerSec,
}: {
	index?: number
	offsetPx: number
	velocityPxPerSec: number
}) {
	return paneAfterFlick({
		index,
		offsetPx,
		velocityPxPerSec,
		paneWidthPx: PANE_WIDTH,
	})
}

test('the four panes are today first, then the facets of it', () => {
	expect([...HERO_PANES]).toEqual(['today', 'form', 'week', 'records'])
})

test('the spring is critically damped, at the canvas’s duration', () => {
	// Bounce is earned by momentum and a deliberate swipe carried none.
	expect(PANE_SPRING.bounce).toBe(0)
	expect(PANE_SPRING.duration).toBeCloseTo(0.35)
})

test('a flick projects its remaining travel, not just where it stopped', () => {
	// 900px/s still has 449px of decay left in it, on top of the 20px travelled.
	expect(projectFlick(-20, -900)).toBeCloseTo(-469.1, 1)
	// A release with no velocity has nowhere left to go.
	expect(projectFlick(-140, 0)).toBe(-140)
})

test('a short, fast flick lands on the next pane — not the one it started on', () => {
	// 20px of travel: every pixel of it is on pane 1, and a rule that read the
	// release position would keep the athlete there. The flick was going to pane
	// 2 and that is where it lands.
	expect(flick({ offsetPx: -20, velocityPxPerSec: -900 })).toBe(1)
})

test('a slow drag that let go early stays where it started', () => {
	// A third of the pane, released dead: the gesture was abandoned, not aimed.
	expect(flick({ offsetPx: -130, velocityPxPerSec: 0 })).toBe(0)
})

test('a slow drag past halfway pages, as a mandatory snap must', () => {
	expect(flick({ offsetPx: -220, velocityPxPerSec: 0 })).toBe(1)
})

test('a flick reversed at the last moment goes back where it came from', () => {
	// Dragged most of the way to pane 2, then thrown back: the finger was over
	// the next pane at release and the gesture was heading home.
	expect(flick({ offsetPx: -260, velocityPxPerSec: 1200 })).toBe(0)
})

test('one pane per gesture, however hard it is thrown', () => {
	// 4000px/s projects nearly 2000px — five panes — and still turns one page.
	// The dots are the indicator, and a pager that skips them stops being
	// countable; crossing a season at speed is the strip's job.
	expect(flick({ offsetPx: -40, velocityPxPerSec: -4000 })).toBe(1)
	expect(flick({ index: 3, offsetPx: 40, velocityPxPerSec: 4000 })).toBe(2)
})

test('the ends of the pager hold', () => {
	expect(flick({ index: 0, offsetPx: 120, velocityPxPerSec: 1500 })).toBe(0)
	expect(flick({ index: 3, offsetPx: -120, velocityPxPerSec: -1500 })).toBe(3)
})

test('a flick backwards from the middle lands on the pane behind', () => {
	expect(flick({ index: 2, offsetPx: 20, velocityPxPerSec: 900 })).toBe(1)
})

test('with nothing measured yet the gesture cannot have been heading anywhere', () => {
	// The server render and jsdom both report a zero-width viewport; there is
	// nothing to divide by, and inventing a pane would page on first paint.
	expect(
		paneAfterFlick({
			index: 1,
			offsetPx: -300,
			velocityPxPerSec: -900,
			paneWidthPx: 0,
		}),
	).toBe(1)
})
