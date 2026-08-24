import { describe, expect, test } from 'vitest'
import {
	ACTIVE_WEEK_LINE,
	activeWeekFrom,
	awayFromToday,
	centreScrollLeft,
	compensatedScrollTop,
	COLLAPSE_THRESHOLD,
	isCollapsed,
	LANDING_OFFSET,
	landingPosition,
	loadEdge,
	loadPad,
	LOAD_PAD_MAX,
	LOAD_PAD_MIN,
	offsetWithin,
	SETTLE_LADDER,
	SETTLE_WINDOW_MS,
	WEEK_JUMP_OFFSET,
} from './anchoring.ts'

// A phone-sized stream: the viewport these thresholds have to hold for.
const VIEWPORT = 620

describe('measuring against the scroller', () => {
	test('an offset is measured against the scroller box, not the page', () => {
		// The scroller sits 120px down the page and is scrolled 900px; a node whose
		// box currently starts at 260px is therefore 1040px into the content.
		expect(offsetWithin({ top: 120, scrollTop: 900 }, { top: 260 })).toBe(1040)
	})

	test('a node above the fold measures as a smaller offset, never a negative page number', () => {
		// The node has scrolled off the top: its client rect is above the
		// scroller's, and the arithmetic still puts it at its true content offset.
		expect(offsetWithin({ top: 120, scrollTop: 900 }, { top: 20 })).toBe(800)
	})
})

describe('landing on today', () => {
	test("the landing parks today's row below the top edge, not flush against it", () => {
		expect(landingPosition(1400)).toBe(1400 - LANDING_OFFSET)
		expect(LANDING_OFFSET).toBe(96)
	})

	test('a landing that would be negative clamps to the top of the stream', () => {
		// Today's row inside the first 96px — the first week of a brand-new
		// account — must not ask for a negative scroll position.
		expect(landingPosition(40)).toBe(0)
	})

	test('the settle ladder retries late layout and then stops', () => {
		// Rows keep laying out after the first frame, so one measurement is not
		// enough; the ladder ends well inside the window that releases the anchor.
		expect([...SETTLE_LADDER]).toEqual([0, 60, 160, 320, 700, 1200])
		expect(SETTLE_LADDER[SETTLE_LADDER.length - 1]).toBeLessThan(
			SETTLE_WINDOW_MS,
		)
	})

	test('a week jumped to from the strip parks flush, minus a hair of slack', () => {
		expect(WEEK_JUMP_OFFSET).toBeLessThan(LANDING_OFFSET)
		expect(WEEK_JUMP_OFFSET).toBe(2)
	})
})

describe('the hero collapse is measured from the landing point, not from zero', () => {
	// The whole point: landing sits far down a bi-directional stream. An absolute
	// `scrollTop > 40` test would have the hero collapsed the moment the screen
	// opened, and the athlete would never see today's session.
	const landing = 1304

	test('parked exactly on the landing point, the hero is open', () => {
		expect(isCollapsed(landing, landing)).toBe(false)
	})

	test('an absolute scrollTop far from zero is still "at home"', () => {
		expect(landing).toBeGreaterThan(COLLAPSE_THRESHOLD)
		expect(isCollapsed(landing, landing)).toBe(false)
	})

	test('drifting down past the threshold collapses it', () => {
		expect(isCollapsed(landing + COLLAPSE_THRESHOLD, landing)).toBe(false)
		expect(isCollapsed(landing + COLLAPSE_THRESHOLD + 1, landing)).toBe(true)
	})

	test('drifting *up* past the threshold collapses it too — either direction', () => {
		expect(isCollapsed(landing - COLLAPSE_THRESHOLD, landing)).toBe(false)
		expect(isCollapsed(landing - COLLAPSE_THRESHOLD - 1, landing)).toBe(true)
	})

	test('coming back opens it again', () => {
		expect(isCollapsed(landing + 400, landing)).toBe(true)
		expect(isCollapsed(landing + 10, landing)).toBe(false)
	})

	test('the top of the stream is collapsed when the landing is far down it', () => {
		expect(isCollapsed(0, landing)).toBe(true)
	})
})

describe('the bi-directional load pad', () => {
	test('the pad scales with the viewport, because a fixed one is wrong', () => {
		// A pad larger than the viewport makes "near the end" true at every
		// position — including the landing one, which would walk the stream to the
		// end of the plan on open.
		expect(loadPad(VIEWPORT)).toBe(VIEWPORT / 2)
		expect(loadPad(VIEWPORT)).toBeLessThan(VIEWPORT)
	})

	test('a tiny viewport still gets a usable pad', () => {
		expect(loadPad(100)).toBe(LOAD_PAD_MIN)
	})

	test('a tall viewport is capped, so the pad never spans a whole week', () => {
		expect(loadPad(2000)).toBe(LOAD_PAD_MAX)
	})
})

describe('which edge loads next', () => {
	const view = { clientHeight: VIEWPORT, scrollHeight: 4000 }
	const room = { earlier: true, later: true }

	test('reading past the top edge loads an earlier week', () => {
		expect(loadEdge({ ...view, scrollTop: 10 }, room)).toBe('earlier')
	})

	test('reading past the bottom edge loads a later week', () => {
		expect(loadEdge({ ...view, scrollTop: 4000 - VIEWPORT - 10 }, room)).toBe(
			'later',
		)
	})

	test('parked in the middle loads nothing', () => {
		expect(loadEdge({ ...view, scrollTop: 1600 }, room)).toBeNull()
	})

	test('the two tests are mutually exclusive: a short stream picks one end only', () => {
		// Both conditions are true here (the stream is barely taller than the
		// viewport). Growing at both ends in one pass would double the window.
		const short = { clientHeight: VIEWPORT, scrollHeight: VIEWPORT + 20 }
		expect(loadEdge({ ...short, scrollTop: 0 }, room)).toBe('earlier')
	})

	test('no room earlier means the bottom test still gets its turn', () => {
		const short = { clientHeight: VIEWPORT, scrollHeight: VIEWPORT + 20 }
		expect(
			loadEdge({ ...short, scrollTop: 0 }, { earlier: false, later: true }),
		).toBe('later')
	})

	test('the start of the season loads nothing more, however far up you read', () => {
		expect(
			loadEdge({ ...view, scrollTop: 0 }, { earlier: false, later: true }),
		).toBeNull()
	})

	test('the end of the season loads nothing more, however far down you read', () => {
		expect(
			loadEdge(
				{ ...view, scrollTop: 4000 - VIEWPORT },
				{ earlier: true, later: false },
			),
		).toBeNull()
	})
})

describe('holding the reading position when a week loads above', () => {
	test("the compensation is the marked week's own offset delta", () => {
		// A week 820px tall arrived above the mark: the mark moved down by exactly
		// that, so the scroll position moves down by exactly that.
		const before = { offset: 1200, scrollTop: 60 }
		expect(compensatedScrollTop(before, 2020)).toBe(880)
	})

	test('nothing above the mark moved, so nothing is compensated', () => {
		// This is the case a `scrollHeight` delta gets wrong: a week appended
		// *below* in the same pass grows the scroll height without moving the mark,
		// and crediting that as height inserted above walks the stream to the end
		// of the plan a week at a time.
		const before = { offset: 1200, scrollTop: 60 }
		expect(compensatedScrollTop(before, 1200)).toBeNull()
	})

	test('a week removed above pulls the reading position back up', () => {
		const before = { offset: 1200, scrollTop: 900 }
		expect(compensatedScrollTop(before, 400)).toBe(100)
	})
})

describe('the active week', () => {
	const weeks = [
		{ key: '2030-01-07', offset: 0 },
		{ key: '2030-01-14', offset: 900 },
		{ key: '2030-01-21', offset: 1800 },
	]

	test('the last week whose header has passed the line wins', () => {
		expect(activeWeekFrom(weeks, 1000, 'fallback')).toBe('2030-01-14')
	})

	test('a tall week keeps the strip on itself all the way down', () => {
		expect(activeWeekFrom(weeks, 1700, 'fallback')).toBe('2030-01-14')
		expect(activeWeekFrom(weeks, 1730, 'fallback')).toBe('2030-01-21')
	})

	test('the header flips at the active line, a little below the top edge', () => {
		expect(activeWeekFrom(weeks, 900 - ACTIVE_WEEK_LINE - 1, 'x')).toBe(
			'2030-01-07',
		)
		expect(activeWeekFrom(weeks, 900 - ACTIVE_WEEK_LINE, 'x')).toBe(
			'2030-01-14',
		)
	})

	test('above every header, the caller keeps whatever it had', () => {
		expect(activeWeekFrom([{ key: 'a', offset: 500 }], 0, 'kept')).toBe('kept')
	})

	test('no weeks in the DOM changes nothing', () => {
		expect(activeWeekFrom([], 4000, 'kept')).toBe('kept')
	})
})

describe('the back-to-today pill', () => {
	test('it is hidden while today is in view — including on first paint', () => {
		// Landed: today's row sits 96px down the viewport, which is "in view".
		expect(awayFromToday(1400, 1304, VIEWPORT)).toBe(0)
	})

	test('it points up once today has gone off the top', () => {
		expect(awayFromToday(1400, 1500, VIEWPORT)).toBe(-1)
	})

	test('it points down once today is below the fold', () => {
		expect(awayFromToday(1400, 500, VIEWPORT)).toBe(1)
	})

	test('a row just off the top edge is not yet "away"', () => {
		// A little slack either side, so a nudge of the thumb does not flash a pill.
		expect(awayFromToday(1400, 1450, VIEWPORT)).toBe(0)
	})

	test('a row at the very bottom edge is not yet "away" either', () => {
		expect(awayFromToday(1400, 1400 - VIEWPORT + 50, VIEWPORT)).toBe(0)
	})
})

describe('centring a strip cell', () => {
	test('a cell is centred against the strip, not the page', () => {
		// A 124px cell in a 390px strip: 133px of slack either side.
		expect(centreScrollLeft(500, 124, 390)).toBe(367)
	})

	test('the first cell cannot scroll to a negative position', () => {
		expect(centreScrollLeft(0, 124, 390)).toBe(0)
	})
})
