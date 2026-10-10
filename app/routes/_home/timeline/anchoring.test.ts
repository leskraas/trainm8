/**
 * @vitest-environment jsdom
 *
 * The arithmetic behind I dag's list and strip (ADR 0086): the landing, what
 * the observers' reports mean, the revalidation's position hold, and a week's
 * estimated height. The landing script the server renders is
 * held to `landingTop` here, against a fake layout, so the copy that runs
 * before hydration cannot drift from the one that runs after it.
 */
import { describe, expect, test } from 'vitest'
import {
	ACTIVE_WEEK_LINE,
	activeLineMargin,
	activeWeekOf,
	AHEAD_INITIAL,
	AHEAD_STEP,
	awayFromEntry,
	awayOf,
	compensatedScrollTop,
	frameOf,
	LANDING_GAP,
	LANDING_OFFSET,
	LANDING_ROOM,
	landingOffsetFor,
	landingPosition,
	landingScript,
	landingTop,
	nextAhead,
	offsetWithin,
	WEEK_HEIGHTS,
	WEEK_JUMP_OFFSET,
	type WeekHeightInput,
	weekHeightEstimate,
} from './anchoring.ts'

// A phone-sized list: the viewport these thresholds have to hold for.
const VIEWPORT = 600

describe('measuring against the scroller', () => {
	test('an offset is measured against the scroller box, not the page', () => {
		expect(offsetWithin({ top: 120, scrollTop: 900 }, { top: 260 })).toBe(1040)
	})

	test('a node above the fold measures as a smaller offset, never a negative page number', () => {
		expect(offsetWithin({ top: 120, scrollTop: 900 }, { top: 20 })).toBe(800)
	})
})

describe('landing on today', () => {
	test("today parks below its week's measured header, plus a little air", () => {
		expect(landingOffsetFor(80.4)).toBe(81 + LANDING_GAP)
		expect(landingPosition(1400, landingOffsetFor(80))).toBe(1400 - 92)
	})

	test('an unmeasured header falls back to the old constant', () => {
		expect(landingOffsetFor(0)).toBe(LANDING_OFFSET)
	})

	test('a landing that would be negative clamps to the top of the list', () => {
		expect(landingPosition(40)).toBe(0)
	})

	test('a week that fits on screen up to today opens at its own top', () => {
		// Header, notes and Monday to today: 360px, with today's row 120px tall,
		// on a 600px list — the week reads as a week, and today is in it.
		expect(
			landingTop({
				weekOffset: 2000,
				todayOffset: 2240,
				todayHeight: 120,
				headerHeight: 80,
				clientHeight: VIEWPORT,
			}),
		).toBe(2000)
	})

	test("a week too tall to show up to today parks today under the week's header", () => {
		expect(
			landingTop({
				weekOffset: 2000,
				todayOffset: 2500,
				todayHeight: 200,
				headerHeight: 80,
				clientHeight: VIEWPORT,
			}),
		).toBe(2500 - landingOffsetFor(80))
	})

	test('the room under today is kept: a row that would end at the bottom edge does not fit', () => {
		const at = (todayHeight: number) =>
			landingTop({
				weekOffset: 0,
				todayOffset: 300,
				todayHeight,
				headerHeight: 80,
				clientHeight: VIEWPORT,
			})
		expect(at(VIEWPORT - LANDING_ROOM - 300)).toBe(0)
		expect(at(VIEWPORT - LANDING_ROOM - 300 + 1)).toBe(300 - 92)
	})

	test('with no height to measure (no layout yet) it never claims the week fits', () => {
		expect(
			landingTop({
				weekOffset: 0,
				todayOffset: 400,
				todayHeight: 0,
				headerHeight: 0,
				clientHeight: 0,
			}),
		).toBe(400 - LANDING_OFFSET)
	})

	test('a week jumped to from the strip parks flush, minus a hair of slack', () => {
		expect(WEEK_JUMP_OFFSET).toBe(2)
	})
})

describe('the landing script the server renders', () => {
	/** A fake layout: every node's top is its content offset less the scroll. */
	function layout({
		weekOffset,
		todayOffset,
		todayHeight,
		headerHeight,
		clientHeight,
	}: Parameters<typeof landingTop>[0]) {
		document.body.innerHTML = `<div id="s"><div data-timeline-week><div data-week-header></div><div data-timeline-today></div></div></div>`
		const stream = document.getElementById('s')!
		const week = stream.querySelector('[data-timeline-week]')!
		const header = stream.querySelector('[data-week-header]')!
		const today = stream.querySelector('[data-timeline-today]')!
		let top = 0
		Object.defineProperty(stream, 'scrollTop', {
			get: () => top,
			set: (v: number) => (top = v),
		})
		Object.defineProperty(stream, 'clientHeight', { get: () => clientHeight })
		const rect = (y: () => number, height = 0) =>
			(() => ({ top: y(), height })) as unknown as () => DOMRect
		stream.getBoundingClientRect = rect(() => 50)
		week.getBoundingClientRect = rect(() => 50 + weekOffset - top)
		header.getBoundingClientRect = rect(
			() => 50 + weekOffset - top,
			headerHeight,
		)
		today.getBoundingClientRect = rect(
			() => 50 + todayOffset - top,
			todayHeight,
		)
		return stream
	}

	test.each([
		{ weekOffset: 2000, todayOffset: 2240, todayHeight: 120 },
		{ weekOffset: 2000, todayOffset: 2500, todayHeight: 200 },
		{ weekOffset: 0, todayOffset: 40, todayHeight: 900 },
	])('parks exactly where landingTop does (%o)', (geometry) => {
		const input = { ...geometry, headerHeight: 80.5, clientHeight: VIEWPORT }
		const stream = layout(input)
		new Function(landingScript('s'))()
		expect(stream.scrollTop).toBe(Math.round(landingTop(input)))
	})

	test('a page with no today row is left alone', () => {
		document.body.innerHTML = '<div id="s"></div>'
		expect(() => new Function(landingScript('s'))()).not.toThrow()
		expect(() => new Function(landingScript('missing'))()).not.toThrow()
	})

	test('the stream id is quoted, never spliced in raw', () => {
		expect(landingScript('a"b')).toContain(JSON.stringify('a"b'))
	})
})

describe('what the observers report', () => {
	const order = ['w1', 'w2', 'w3', 'w4']

	test('the frame is the first and last visible week, in season order', () => {
		expect(frameOf(new Set(['w3', 'w2']), order)).toEqual({
			from: 'w2',
			to: 'w3',
		})
		expect(frameOf(new Set(['w4']), order)).toEqual({ from: 'w4', to: 'w4' })
	})

	test('nothing visible is no frame at all, so the caller keeps its own', () => {
		expect(frameOf(new Set(), order)).toBeNull()
	})

	test('the active week is the one the reading line crosses', () => {
		expect(activeWeekOf(new Set(['w2']), order, 'w1')).toBe('w2')
		// The instant one header hands over to the next, both cross: the later wins.
		expect(activeWeekOf(new Set(['w2', 'w3']), order, 'w1')).toBe('w3')
	})

	test('with nothing on the line (over the start cap) the active week stays', () => {
		expect(activeWeekOf(new Set(), order, 'w4')).toBe('w4')
	})

	test('the reading line is one pixel, at the active line, whatever the height', () => {
		expect(activeLineMargin(VIEWPORT)).toBe(
			`-${ACTIVE_WEEK_LINE}px 0px -${VIEWPORT - ACTIVE_WEEK_LINE - 1}px 0px`,
		)
		// A list shorter than the line never gets a negative margin.
		expect(activeLineMargin(20)).toBe(`-${ACTIVE_WEEK_LINE}px 0px -0px 0px`)
	})

	test("today's row in view is 0; off the top is −1; below is +1", () => {
		const root = { top: 100 }
		expect(
			awayFromEntry({
				isIntersecting: true,
				boundingClientRect: { top: 300 },
				rootBounds: root,
			}),
		).toBe(0)
		expect(
			awayFromEntry({
				isIntersecting: false,
				boundingClientRect: { top: -400 },
				rootBounds: root,
			}),
		).toBe(-1)
		expect(
			awayFromEntry({
				isIntersecting: false,
				boundingClientRect: { top: 1400 },
				rootBounds: root,
			}),
		).toBe(1)
	})
})

describe('which way today is, when its row never crossed an edge', () => {
	const order = ['w1', 'w2', 'w3', 'w4', 'w5']
	const base = { order, todayKey: 'w2', lastReport: 1 as const }

	test('in view is in view, whatever else is known', () => {
		expect(
			awayOf({ ...base, inView: true, frame: { from: 'w4', to: 'w5' } }),
		).toBe(0)
	})

	test('one long jump from below today to far past it points up', () => {
		// The row reported "below" and has not reported since: it jumped over the
		// viewport without crossing it. The weeks on screen say where it went.
		expect(
			awayOf({ ...base, inView: false, frame: { from: 'w4', to: 'w5' } }),
		).toBe(-1)
	})

	test('weeks before today on screen point down', () => {
		expect(
			awayOf({
				...base,
				inView: false,
				lastReport: -1,
				frame: { from: 'w1', to: 'w1' },
			}),
		).toBe(1)
	})

	test('inside today’s own week the row’s last report decides', () => {
		expect(
			awayOf({ ...base, inView: false, frame: { from: 'w2', to: 'w2' } }),
		).toBe(1)
	})
})

describe('the weeks ahead', () => {
	test('a handful mount up front, and more in steps, never past the season', () => {
		expect(AHEAD_INITIAL).toBeGreaterThan(0)
		expect(nextAhead(AHEAD_INITIAL, 100)).toBe(AHEAD_INITIAL + AHEAD_STEP)
		expect(nextAhead(10, 12)).toBe(12)
	})
})

describe('holding the reading position when the loader revalidates', () => {
	test("the compensation is the reader's week's own offset delta", () => {
		const before = { offset: 1200, scrollTop: 60 }
		expect(compensatedScrollTop(before, 2020)).toBe(880)
	})

	test('nothing above the reader moved, so nothing is written', () => {
		// Height appended *below* grows the scroll height without moving the
		// reader's week, and is not the reader's concern.
		expect(
			compensatedScrollTop({ offset: 1200, scrollTop: 60 }, 1200),
		).toBeNull()
	})

	test('height removed above pulls the reading position back up', () => {
		expect(compensatedScrollTop({ offset: 1200, scrollTop: 900 }, 400)).toBe(
			100,
		)
	})
})

describe("a week's estimated height, for content-visibility (ADR 0086)", () => {
	const day = (titles: string[] = []) => ({
		sessions: titles.map((title) => ({ title })),
	})
	const week = (overrides: Partial<WeekHeightInput> = {}): WeekHeightInput => ({
		tracks: [{ hasFigures: true, noteCount: 0 }],
		summary: '2 av 5 gjort',
		planStart: false,
		opensHorizon: false,
		rows: Array.from({ length: 7 }, () => day()),
		...overrides,
	})

	test('an empty week is its header and seven empty days', () => {
		const h = WEEK_HEIGHTS
		expect(weekHeightEstimate(week())).toBe(
			h.header + h.track + h.summary + 7 * h.emptyDay,
		)
	})

	test('sessions, a wrapping sentence and an action line each add their height', () => {
		const one = weekHeightEstimate(week({ rows: [day(['6 km rolig'])] }))
		const long = weekHeightEstimate(
			week({
				rows: [
					day([
						'Knebøy 5×5 @ 80 kg · Benkpress 5×5 @ 60 kg · Roing 3×8 · Markløft 3×5',
					]),
				],
			}),
		)
		const two = weekHeightEstimate(
			week({ rows: [day(['6 km rolig', 'Styrke A'])] }),
		)
		expect(long).toBeGreaterThan(one)
		expect(two).toBe(one + WEEK_HEIGHTS.extraSession)
	})

	test('notes, the plan-start line and the horizon divider are counted', () => {
		const base = weekHeightEstimate(week())
		expect(
			weekHeightEstimate(
				week({
					tracks: [{ hasFigures: true, noteCount: 2 }],
					planStart: true,
					opensHorizon: true,
				}),
			),
		).toBe(base + 2 * WEEK_HEIGHTS.note + 2 * WEEK_HEIGHTS.banner)
	})
})
