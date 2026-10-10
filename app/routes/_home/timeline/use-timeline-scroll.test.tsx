/**
 * @vitest-environment jsdom
 *
 * The scroll module's wired paths (ADR 0086): the landing before first paint,
 * the `ResizeObserver` that follows late layout until the reader's first
 * input and never after it, the observers that report where the reader is,
 * the weeks ahead mounting below, the jumps, and the one write the list makes
 * on its own — a revalidation that put height above the reader.
 *
 * The rule under all of it, asserted as a count: **no `scrollTop` write while
 * the reader scrolls.** The old module's settle ladder and growth
 * compensation both wrote exactly then (#505 P1, P2).
 *
 * jsdom has no layout and no observers, so this file supplies both: each node
 * gets a rect from a content offset the harness owns, and the observers are
 * fakes the test fires by hand.
 */
import { act, fireEvent, render } from '@testing-library/react'
import { useCallback, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
	AHEAD_INITIAL,
	AHEAD_STEP,
	AWAY_MARGIN,
	LANDING_GAP,
} from './anchoring.ts'
import {
	AHEAD_SENTINEL_ATTR,
	ReadingHold,
	TODAY_ATTR,
	useTimelineScroll,
	WEEK_ATTR,
	WEEK_HEADER_ATTR,
} from './use-timeline-scroll.ts'

const VIEWPORT = 600
const WEEK_HEIGHT = 900
const HEADER = 60
/** Deep enough into its week that the week does not fit above it. */
const TODAY_IN_WEEK = 700
const TODAY_HEIGHT = 120
/** Before the first week: the start cap. */
const TOP_PAD = 100
const KEYS = Array.from(
	{ length: 30 },
	(_, i) =>
		`2030-${String(1 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
)
const TODAY_INDEX = 12

/** Height a revalidation put above every week (a session on a past day). */
let insertedAbove = 0
/** Height each revalidation puts above every week. */
let pendingInsert = 0
/** Height late layout put inside today's week, above today's row. */
let lateLayout = 0

const weekOffset = (index: number) =>
	TOP_PAD +
	insertedAbove +
	index * WEEK_HEIGHT +
	(index > TODAY_INDEX ? lateLayout : 0)
const todayOffset = () => weekOffset(TODAY_INDEX) + TODAY_IN_WEEK + lateLayout
const landing = () => todayOffset() - (HEADER + LANDING_GAP)

// ——— fake observers ————————————————————————————————————————————————————————

class FakeIntersectionObserver {
	static all: FakeIntersectionObserver[] = []
	observed = new Set<Element>()
	disconnected = false
	constructor(
		public callback: IntersectionObserverCallback,
		public options: IntersectionObserverInit = {},
	) {
		FakeIntersectionObserver.all.push(this)
	}
	observe(node: Element) {
		this.observed.add(node)
	}
	unobserve(node: Element) {
		this.observed.delete(node)
	}
	disconnect() {
		this.observed.clear()
		this.disconnected = true
	}
	takeRecords() {
		return []
	}
	report(
		entries: Array<{ target: Element; isIntersecting: boolean; top?: number }>,
	) {
		act(() =>
			this.callback(
				entries.map((entry) => ({
					target: entry.target,
					isIntersecting: entry.isIntersecting,
					boundingClientRect: { top: entry.top ?? 0 } as DOMRect,
					intersectionRect: {
						height: entry.isIntersecting ? 40 : 0,
					} as DOMRect,
					rootBounds: { top: 0 } as DOMRect,
				})) as unknown as IntersectionObserverEntry[],
				this as unknown as IntersectionObserver,
			),
		)
	}
}

class FakeResizeObserver {
	static all: FakeResizeObserver[] = []
	disconnected = false
	constructor(public callback: ResizeObserverCallback) {
		FakeResizeObserver.all.push(this)
	}
	observe() {}
	unobserve() {}
	disconnect() {
		this.disconnected = true
	}
	fire() {
		act(() => this.callback([], this as unknown as ResizeObserver))
	}
}

const live = <T extends { disconnected: boolean }>(list: T[]) =>
	list.filter((o) => !o.disconnected)
const observer = (match: (options: IntersectionObserverInit) => boolean) =>
	live(FakeIntersectionObserver.all).find((o) => match(o.options))!
const weeksObserver = () =>
	observer((o) => o.rootMargin == null && o.root != null)
const lineObserver = () =>
	observer((o) => o.rootMargin?.startsWith('-70px') ?? false)
const todayObserver = () => observer((o) => o.rootMargin === AWAY_MARGIN)
const aheadObserver = () =>
	observer((o) => o.rootMargin?.startsWith('0px 0px') ?? false)

// ——— the harness ———————————————————————————————————————————————————————————

let writes: number[] = []
let renders = 0

function Harness() {
	const stream = useRef<HTMLDivElement | null>(null)
	const [revision, setRevision] = useState(0)
	const scroll = useTimelineScroll({ weekKeys: KEYS, todayIndex: TODAY_INDEX })
	renders += 1
	const to = Math.min(KEYS.length - 1, TODAY_INDEX + scroll.after)
	const top = () => stream.current?.scrollTop ?? 0
	// Stable, as the app's is: an inline ref is detached and re-attached on
	// every commit, after the children's updates have already run.
	const { streamRef: hookRef } = scroll
	const streamRef = useCallback(
		(node: HTMLDivElement | null) => {
			stream.current = node
			if (node && !Object.getOwnPropertyDescriptor(node, 'scrollTop')) {
				let value = 0
				Object.defineProperty(node, 'scrollTop', {
					configurable: true,
					get: () => value,
					set: (v: number) => {
						value = v
						writes.push(v)
					},
				})
				Object.defineProperty(node, 'clientHeight', {
					get: () => VIEWPORT,
				})
				node.getBoundingClientRect = () =>
					({ top: 0, height: VIEWPORT }) as DOMRect
			}
			hookRef(node)
		},
		[hookRef],
	)
	const stub = (node: Element | null, offset: () => number, height = 40) => {
		if (node)
			node.getBoundingClientRect = () =>
				({ top: offset() - top(), height, left: 0, width: 390 }) as DOMRect
	}
	return (
		<div>
			<div data-testid="stream" ref={streamRef}>
				<ReadingHold
					revision={revision}
					stream={() => stream.current}
					readerKey={scroll.readerKey}
				>
					<div>
						{/* The new data's height arrives with the commit, as a real DOM
						    mutation does: after the snapshot, before the hold's update. */}
						<span
							key={revision}
							ref={() => {
								insertedAbove = revision * pendingInsert
							}}
						/>
						{KEYS.slice(0, to + 1).map((key, i) => (
							<div
								key={key}
								{...{ [WEEK_ATTR]: key }}
								ref={(node) => stub(node, () => weekOffset(i), WEEK_HEIGHT)}
							>
								<div
									{...{ [WEEK_HEADER_ATTR]: '' }}
									ref={(node) => stub(node, () => weekOffset(i), HEADER)}
								/>
								{i === TODAY_INDEX ? (
									<div
										{...{ [TODAY_ATTR]: 'true' }}
										ref={(node) => stub(node, todayOffset, TODAY_HEIGHT)}
									/>
								) : null}
							</div>
						))}
						{to < KEYS.length - 1 ? (
							<div {...{ [AHEAD_SENTINEL_ATTR]: '' }} />
						) : null}
					</div>
				</ReadingHold>
			</div>
			<span data-testid="active">{scroll.activeWeekKey}</span>
			<span data-testid="frame">{`${scroll.frame.from}/${scroll.frame.to}`}</span>
			<span data-testid="away">{scroll.away}</span>
			<span data-testid="after">{scroll.after}</span>
			<button type="button" data-testid="back" onClick={scroll.backToToday} />
			<button
				type="button"
				data-testid="revalidate"
				onClick={() => setRevision((n) => n + 1)}
			/>
			{KEYS.map((key) => (
				<button
					key={key}
					type="button"
					data-testid={`jump-${key}`}
					onClick={() => scroll.goToWeek(key)}
				/>
			))}
		</div>
	)
}

function mount() {
	const view = render(<Harness />)
	const stream = view.getByTestId('stream')
	return {
		...view,
		stream,
		text: (id: string) => view.getByTestId(id).textContent,
		week: (key: string) => stream.querySelector(`[${WEEK_ATTR}="${key}"]`)!,
		/** The reader scrolls: a wheel (their input), then the position moves. */
		readerScrollsTo(top: number) {
			fireEvent.wheel(stream)
			Object.getOwnPropertyDescriptor(stream, 'scrollTop')!.set!.call(
				stream,
				top,
			)
			writes.pop() // the reader's own scroll is not the app's write
			fireEvent.scroll(stream)
		},
	}
}

beforeEach(() => {
	FakeIntersectionObserver.all = []
	FakeResizeObserver.all = []
	globalThis.IntersectionObserver =
		FakeIntersectionObserver as unknown as typeof IntersectionObserver
	globalThis.ResizeObserver =
		FakeResizeObserver as unknown as typeof ResizeObserver
	writes = []
	renders = 0
	insertedAbove = 0
	pendingInsert = 0
	lateLayout = 0
})
afterEach(() => {
	// @ts-expect-error — removed again, as jsdom has none.
	delete globalThis.IntersectionObserver
})

describe('landing on today', () => {
	test('the list is on today by the end of the first commit, before any paint', () => {
		const { stream } = mount()
		expect(stream.scrollTop).toBe(landing())
	})

	test('every week before today is mounted from the start, and a few after it', () => {
		const { stream, text } = mount()
		expect(stream.querySelectorAll(`[${WEEK_ATTR}]`)).toHaveLength(
			TODAY_INDEX + 1 + AHEAD_INITIAL,
		)
		expect(text('after')).toBe(String(AHEAD_INITIAL))
	})

	test('late layout before the reader acts is followed', () => {
		const { stream } = mount()
		lateLayout = 140
		FakeResizeObserver.all[0]!.fire()
		expect(stream.scrollTop).toBe(landing())
	})

	test.each(['pointerDown', 'wheel', 'touchStart', 'keyDown'] as const)(
		'after the reader’s first input (%s) late layout never moves them back',
		(input) => {
			const { stream } = mount()
			fireEvent[input](document.body)
			expect(FakeResizeObserver.all[0]!.disconnected).toBe(true)
			Object.getOwnPropertyDescriptor(stream, 'scrollTop')!.set!.call(
				stream,
				300,
			)
			writes = []
			lateLayout = 140
			FakeResizeObserver.all[0]!.fire()
			expect(stream.scrollTop).toBe(300)
			expect(writes).toEqual([])
		},
	)
})

describe('no write under a scrolling reader', () => {
	test('scrolling up through the whole past writes nothing and mounts nothing', () => {
		const { stream, readerScrollsTo } = mount()
		const weeks = stream.querySelectorAll(`[${WEEK_ATTR}]`).length
		writes = []
		for (let top = landing(); top > 0; top -= 240) readerScrollsTo(top)
		readerScrollsTo(0)
		expect(writes).toEqual([])
		expect(stream.querySelectorAll(`[${WEEK_ATTR}]`)).toHaveLength(weeks)
	})

	test('weeks ahead mount below as the end comes near, and nothing is written', () => {
		const { text, readerScrollsTo, stream } = mount()
		readerScrollsTo(weekOffset(TODAY_INDEX + AHEAD_INITIAL - 1))
		writes = []
		const sentinel = stream.querySelector(`[${AHEAD_SENTINEL_ATTR}]`)!
		aheadObserver().report([{ target: sentinel, isIntersecting: true }])
		expect(text('after')).toBe(String(AHEAD_INITIAL + AHEAD_STEP))
		expect(writes).toEqual([])
	})
})

describe('where the reader is, from the observers', () => {
	test('the frame follows the weeks on screen, and only moves when an edge does', () => {
		const { text, week } = mount()
		const before = renders
		weeksObserver().report([
			{ target: week(KEYS[12]!), isIntersecting: true },
			{ target: week(KEYS[13]!), isIntersecting: true },
		])
		expect(text('frame')).toBe(`${KEYS[12]}/${KEYS[13]}`)
		const after = renders
		// The same weeks reported again: no state change, no render.
		weeksObserver().report([{ target: week(KEYS[13]!), isIntersecting: true }])
		expect(renders).toBe(after)
		expect(after).toBeGreaterThan(before)
	})

	test('the active week is the week crossing the reading line', () => {
		const { text, week } = mount()
		lineObserver().report([{ target: week(KEYS[9]!), isIntersecting: true }])
		expect(text('active')).toBe(KEYS[9])
		lineObserver().report([
			{ target: week(KEYS[9]!), isIntersecting: false },
			{ target: week(KEYS[10]!), isIntersecting: true },
		])
		expect(text('active')).toBe(KEYS[10])
	})

	test("the I dag pill reads today's row going off the top and coming back", () => {
		const { text, stream } = mount()
		const today = stream.querySelector(`[${TODAY_ATTR}]`)!
		expect(todayObserver().observed.has(today)).toBe(true)
		todayObserver().report([
			{ target: today, isIntersecting: false, top: -500 },
		])
		expect(text('away')).toBe('-1')
		todayObserver().report([{ target: today, isIntersecting: true }])
		expect(text('away')).toBe('0')
	})
})

test('a jump past today that never crossed its row still points the pill back up', () => {
	const { text, stream, week } = mount()
	const today = stream.querySelector(`[${TODAY_ATTR}]`)!
	todayObserver().report([{ target: today, isIntersecting: false, top: 900 }])
	expect(text('away')).toBe('1')
	// The reader lands far below today in one move: only the weeks report.
	weeksObserver().report([
		{ target: week(KEYS[12]!), isIntersecting: false },
		{ target: week(KEYS[16]!), isIntersecting: true },
	])
	expect(text('away')).toBe('-1')
})

describe('jumps are instant writes the reader asked for', () => {
	test('back to today lands where the landing does', () => {
		const { stream, readerScrollsTo, getByTestId } = mount()
		readerScrollsTo(200)
		fireEvent.click(getByTestId('back'))
		expect(stream.scrollTop).toBe(landing())
	})

	test('a mounted week jumps straight to its header', () => {
		const { stream, getByTestId } = mount()
		fireEvent.click(getByTestId(`jump-${KEYS[3]}`))
		expect(stream.scrollTop).toBe(weekOffset(3) - 2)
	})

	test('a week ahead of the window is mounted, then jumped to, in one commit', () => {
		const { stream, getByTestId } = mount()
		writes = []
		fireEvent.click(getByTestId(`jump-${KEYS[27]}`))
		expect(stream.querySelector(`[${WEEK_ATTR}="${KEYS[27]}"]`)).not.toBeNull()
		expect(stream.scrollTop).toBe(weekOffset(27) - 2)
		expect(writes).toEqual([weekOffset(27) - 2])
	})

	test('a jump hands the position to the reader: late layout no longer re-lands', () => {
		const { stream, getByTestId } = mount()
		fireEvent.click(getByTestId(`jump-${KEYS[3]}`))
		lateLayout = 140
		FakeResizeObserver.all[0]!.fire()
		expect(stream.scrollTop).toBe(weekOffset(3) - 2)
	})
})

describe('a revalidation that puts height above the reader', () => {
	test('is handed back in the same commit, against the reader’s week', () => {
		const { stream, week, getByTestId, readerScrollsTo } = mount()
		readerScrollsTo(weekOffset(5) + 100)
		lineObserver().report([{ target: week(KEYS[5]!), isIntersecting: true }])
		writes = []
		pendingInsert = 300
		fireEvent.click(getByTestId('revalidate'))
		expect(stream.scrollTop).toBe(weekOffset(5) + 100)
		expect(writes).toHaveLength(1)
	})

	test('a render that brought no new data measures and writes nothing', () => {
		const { week, readerScrollsTo } = mount()
		readerScrollsTo(weekOffset(5) + 100)
		writes = []
		lineObserver().report([{ target: week(KEYS[5]!), isIntersecting: true }])
		expect(writes).toEqual([])
	})

	test('new data that moved nothing above the reader writes nothing', () => {
		const { week, getByTestId, readerScrollsTo } = mount()
		readerScrollsTo(weekOffset(5) + 100)
		lineObserver().report([{ target: week(KEYS[5]!), isIntersecting: true }])
		writes = []
		fireEvent.click(getByTestId('revalidate'))
		expect(writes).toEqual([])
	})
})
