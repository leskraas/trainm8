/**
 * @vitest-environment jsdom
 *
 * The scroll module's *wired* paths — settle, release, the jumps, the fold and
 * growth compensation.
 *
 * `anchoring.test.ts` covers the arithmetic, which is where the numbers that
 * were hard to get right live. What it cannot reach is the sequencing: when the
 * landing is re-applied and when it stops being, what a week arriving above the
 * reader does to the position *and* to the hero, and whether a jump is measured
 * from where it actually landed. Those were the untested half, and #498 changed
 * every one of them.
 *
 * jsdom has no layout, so this file supplies one. Each node is given a rect
 * derived from a content offset the harness owns, which is exactly the fiction
 * the hook is written against: it never reads `offsetTop`, only a node's box
 * measured against the scroller's own box (see `offsetWithin`).
 */
import { act, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SETTLE_WINDOW_MS } from './anchoring.ts'
import {
	CELL_ATTR,
	TODAY_ATTR,
	useTimelineScroll,
	WEEK_ATTR,
} from './use-timeline-scroll.ts'

/** A phone's stream: the viewport all of this has to hold for. */
const VIEWPORT = 620
/** Every week in the fake layout is this tall, so a delta is countable. */
const WEEK_HEIGHT = 900
/** How far into its own week today's row sits. */
const TODAY_IN_WEEK = 400
/** The hero's open height — the fold's whole travel. */
const HERO_OPEN = 400
/** The start cap above the first loaded week. */
const TOP_PAD = 120

const KEYS = [
	'2030-01-07',
	'2030-01-14',
	'2030-01-21',
	'2030-01-28',
	'2030-02-04',
	'2030-02-11',
	'2030-02-18',
]
const TODAY_INDEX = 3

/**
 * The fake layout. Weeks stack at a fixed height from a fixed top pad, so a
 * week arriving above the reader moves everything below it by exactly
 * `WEEK_HEIGHT` — which is the one number growth compensation is allowed to add
 * back.
 */
function weekOffset(indexInWindow: number) {
	return TOP_PAD + indexInWindow * WEEK_HEIGHT
}

function stub(node: Element, offset: () => number) {
	node.getBoundingClientRect = () =>
		({ top: offset(), left: 0, width: 390, height: 40 }) as DOMRect
}

/**
 * Every write to the scroller's position, and what `scroll-behavior` was in
 * force when it landed. The scrollers carry `scroll-behavior: smooth` for the
 * athlete's own keyboard scrolling, and a programmatic write held back into a
 * smooth scroller *animates* — which is a bug wherever the hook has to trust
 * the position it just assigned. jsdom has no smooth scrolling to observe, so
 * this observes the switch instead.
 */
let writes: Array<{ top: number; behavior: string }> = []

const recorded = new WeakSet<HTMLElement>()

function recordScrollTop(node: HTMLElement) {
	// Once per node: an inline `ref` is a new function every render, so React
	// re-runs it, and redefining the property would reset the position.
	if (recorded.has(node)) return
	recorded.add(node)
	let top = 0
	Object.defineProperty(node, 'scrollTop', {
		configurable: true,
		get: () => top,
		set: (value: number) => {
			top = value
			writes.push({ top: value, behavior: node.style.scrollBehavior })
		},
	})
}

function fixHeight(
	node: Element,
	prop: 'scrollHeight' | 'clientHeight' | 'clientWidth' | 'offsetWidth',
	value: () => number,
) {
	Object.defineProperty(node, prop, { configurable: true, get: value })
}

function Harness() {
	const streamRef = useRef<HTMLDivElement | null>(null)
	const scroll = useTimelineScroll({ weekKeys: KEYS, todayIndex: TODAY_INDEX })
	const from = Math.max(0, TODAY_INDEX - scroll.loaded.before)
	const to = Math.min(KEYS.length - 1, TODAY_INDEX + scroll.loaded.after)
	const window_ = KEYS.slice(from, to + 1)
	const top = () => streamRef.current?.scrollTop ?? 0
	return (
		<div>
			<div
				data-testid="stream"
				ref={(node) => {
					streamRef.current = node
					if (node) {
						recordScrollTop(node)
						fixHeight(node, 'clientHeight', () => VIEWPORT)
						fixHeight(
							node,
							'scrollHeight',
							() => TOP_PAD * 2 + window_.length * WEEK_HEIGHT,
						)
					}
					scroll.streamRef(node)
				}}
				onScroll={scroll.onStreamScroll}
			>
				{window_.map((key, i) => (
					<div
						key={key}
						{...{ [WEEK_ATTR]: key }}
						ref={(node) => {
							if (node) stub(node, () => weekOffset(i) - top())
						}}
					>
						{key === KEYS[TODAY_INDEX] ? (
							<div
								{...{ [TODAY_ATTR]: 'true' }}
								ref={(node) => {
									if (node) {
										stub(node, () => weekOffset(i) + TODAY_IN_WEEK - top())
									}
								}}
							/>
						) : null}
					</div>
				))}
			</div>
			<div
				data-testid="hero"
				ref={(node) => {
					if (node) fixHeight(node, 'scrollHeight', () => HERO_OPEN)
					scroll.heroRef(node)
				}}
			>
				<div data-testid="hero-content" />
			</div>
			<div
				data-testid="strip"
				ref={(node) => {
					if (node) fixHeight(node, 'clientWidth', () => 390)
					scroll.stripRef(node)
				}}
			>
				{KEYS.map((key, i) => (
					<button
						key={key}
						type="button"
						{...{ [CELL_ATTR]: key }}
						ref={(node) => {
							if (!node) return
							fixHeight(node, 'offsetWidth', () => 124)
							stub(node, () => i * 128)
						}}
						onClick={() => scroll.goToWeek(key)}
					/>
				))}
			</div>
			<span data-testid="collapsed">{String(scroll.collapsed)}</span>
			<span data-testid="away">{String(scroll.away)}</span>
			<span data-testid="active">{scroll.activeWeekKey}</span>
			<span data-testid="loaded">{`${scroll.loaded.before}/${scroll.loaded.after}`}</span>
			<button type="button" data-testid="back" onClick={scroll.backToToday} />
		</div>
	)
}

function mount() {
	const view = render(<Harness />)
	const stream = view.getByTestId('stream')
	const hero = view.getByTestId('hero')
	return {
		...view,
		stream,
		hero,
		/** Where the landing wants the stream, given the window it has now. */
		landingFor: (windowIndexOfToday: number) =>
			weekOffset(windowIndexOfToday) + TODAY_IN_WEEK - 96,
		scrollTo(top: number) {
			stream.scrollTop = top
			// `fireEvent` wraps its own `act`, and the assignment above is a plain
			// property write that React has no view on.
			fireEvent.scroll(stream)
		},
		tick(ms: number) {
			act(() => {
				vi.advanceTimersByTime(ms)
			})
		},
		read: () => ({
			scrollTop: stream.scrollTop,
			height: hero.style.height,
			opacity: hero.style.opacity,
			lift: hero.style.getPropertyValue('--hero-lift'),
			collapsed: view.getByTestId('collapsed').textContent,
			away: view.getByTestId('away').textContent,
			active: view.getByTestId('active').textContent,
			loaded: view.getByTestId('loaded').textContent,
		}),
	}
}

beforeEach(() => {
	vi.useFakeTimers()
	writes = []
})
afterEach(() => {
	vi.useRealTimers()
})

describe('settling on today', () => {
	test('the stream is on the landing position by the end of the first commit', () => {
		const view = mount()
		// One week either side of today, so today is the middle of three. The
		// after-every-render effect is the first thing that can measure anything,
		// and it settles there and then — the ladder is for what layout does next.
		expect(view.read().scrollTop).toBe(view.landingFor(1))
	})

	test('a late layout pass moves today, and the ladder follows it', () => {
		// Rows keep laying out after the first frame — profile bars resolve, a
		// long title wraps. This is the whole reason the landing is a ladder and
		// not an effect, and nothing about the fold going scroll-driven changes it.
		const view = mount()
		view.tick(0)
		const first = view.read().scrollTop
		// Something moves the position out from under the landing before it has
		// been released — a late layout pass, a row that finished resolving.
		view.stream.scrollTop = 0
		view.tick(700)
		expect(view.read().scrollTop).toBe(first)
	})

	test('the athlete is not re-landed once the window has passed', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		view.scrollTo(2000)
		view.tick(5000)
		// Released: the position is the athlete's now, and no rung takes it back.
		expect(view.read().scrollTop).toBe(2000)
	})

	test('nothing loads while the landing still owns the position', () => {
		const view = mount()
		view.tick(0)
		// Reading past the top edge — but before the release, so the window must
		// not grow: a week arriving mid-landing moves today's row while the ladder
		// is still aiming at it.
		view.scrollTo(0)
		expect(view.read().loaded).toBe('1/1')
	})
})

describe('releasing the landing', () => {
	test('the release happens on its own timer, even with nothing re-rendering', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS)
		expect(view.read().active).toBe(KEYS[TODAY_INDEX])
		expect(view.read().away).toBe('0')
	})

	test('after the release, reading past an edge grows the window', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		view.scrollTo(0)
		expect(view.read().loaded).toBe('2/1')
	})

	test('the release is what lets the hero fold at all', () => {
		// Until it happens every scroll of the athlete's is undone by the next
		// settle: the first scroll away from today would snap straight back and
		// the hero would never fold.
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		const landing = view.read().scrollTop
		view.scrollTo(landing + HERO_OPEN)
		expect(view.read().scrollTop).toBe(landing + HERO_OPEN)
		expect(view.read().collapsed).toBe('true')
	})
})

describe('the fold, written off the scroll offset', () => {
	function landed() {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		return { view, landing: view.read().scrollTop }
	}

	test('the hero is whole on open, though the stream is parked far from zero', () => {
		const { view, landing } = landed()
		expect(landing).toBeGreaterThan(HERO_OPEN)
		expect(view.read()).toMatchObject({
			height: `${HERO_OPEN}px`,
			opacity: '1',
			lift: '0px',
			collapsed: 'false',
		})
	})

	test('dragging halfway leaves the hero halfway', () => {
		const { view, landing } = landed()
		view.scrollTo(landing + HERO_OPEN / 2)
		expect(view.read()).toMatchObject({
			height: `${HERO_OPEN / 2}px`,
			lift: `${HERO_OPEN / 4}px`,
			collapsed: 'false',
		})
	})

	test('reversing reverses from where it is, with no jump', () => {
		const { view, landing } = landed()
		const heights: string[] = []
		for (const d of [40, 120, 260, 400, 260, 120, 40, 0]) {
			view.scrollTo(landing + d)
			heights.push(view.read().height)
		}
		expect(heights).toEqual([
			'360px',
			'280px',
			'140px',
			'0px',
			'140px',
			'280px',
			'360px',
			'400px',
		])
	})

	test('reading *up* past today folds it too', () => {
		const { view, landing } = landed()
		view.scrollTo(landing - HERO_OPEN / 4)
		expect(view.read().height).toBe(`${HERO_OPEN * 0.75}px`)
	})

	test('only a hero folded all the way away re-renders the header', () => {
		const { view, landing } = landed()
		view.scrollTo(landing + HERO_OPEN - 1)
		expect(view.read().collapsed).toBe('false')
		view.scrollTo(landing + HERO_OPEN)
		expect(view.read().collapsed).toBe('true')
		view.scrollTo(landing + 9000)
		expect(view.read()).toMatchObject({ height: '0px', collapsed: 'true' })
	})
})

describe('holding the reading position when a week loads in above', () => {
	test('the position holds, and the fold holds with it', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		// Part-way through the fold first, to prove the write is live at all.
		const landing = view.read().scrollTop
		expect(landing).toBe(view.landingFor(1))
		view.scrollTo(landing - 200)
		expect(view.read().height).toBe('200px')

		// Now read up past the top edge, which is far enough from today that the
		// hero is gone by the time the week arrives.
		view.scrollTo(0)
		expect(view.read().loaded).toBe('2/1')
		// A whole week arrived above the reader. The compensation is the marked
		// week's own offset delta, so the position moves by exactly the height
		// inserted — never by the `scrollHeight` delta, which also counts a week
		// appended below.
		expect(view.read().scrollTop).toBe(WEEK_HEIGHT)
		// And today's row moved by exactly the same amount, so the *distance from
		// the landing* — the only number the fold is made of — did not change. A
		// fold measured from a landing remembered at mount would have jumped a
		// whole week here.
		expect(view.landingFor(2) - view.landingFor(1)).toBe(WEEK_HEIGHT)
		expect(view.read().scrollTop - view.landingFor(2)).toBe(
			0 - view.landingFor(1),
		)
	})

	test('the landing tracked the growth, so the hero opens again at the new one', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		view.scrollTo(0)
		expect(view.read().loaded).toBe('2/1')
		expect(view.read().height).toBe('0px')
		// The landing is a live measurement, never a number kept from mount: park
		// on where today's row is *now* and the hero is whole again.
		view.scrollTo(view.landingFor(2))
		expect(view.read()).toMatchObject({
			height: `${HERO_OPEN}px`,
			opacity: '1',
			collapsed: 'false',
			away: '0',
		})
	})

	test('growth below moves nothing: the mark did not move', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		const landing = view.read().scrollTop
		// Read past the bottom edge instead.
		view.scrollTo(TOP_PAD * 2 + 3 * WEEK_HEIGHT - VIEWPORT)
		expect(view.read().loaded).toBe('1/2')
		// The earliest week is still the first in the DOM and still at the same
		// offset, so nothing is added back and the athlete keeps their place.
		expect(view.read().scrollTop).toBe(TOP_PAD * 2 + 3 * WEEK_HEIGHT - VIEWPORT)
		expect(landing).toBeGreaterThan(0)
	})

	test('the compensation jumps: it is never handed back into a smooth scroller', () => {
		// Held back into a smooth scroller the compensation *animates*, and every
		// frame it animates through is a scroll event of its own re-running the
		// pass that decided to grow. Two growths then compensate against each
		// other's half-finished positions and the reading position is lost.
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		writes = []
		view.scrollTo(0)
		expect(view.read().loaded).toBe('2/1')
		const compensation = writes.filter((write) => write.top === WEEK_HEIGHT)
		expect(compensation).not.toHaveLength(0)
		for (const write of compensation) expect(write.behavior).toBe('auto')
		// And smooth is handed straight back, in the same tick: nothing is left
		// for it to animate, and the athlete's own scrolling still glides.
		expect(view.stream.style.scrollBehavior).toBe('')
	})

	test('one growth per pass, whatever the scroll handler is told', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		view.scrollTo(0)
		view.scrollTo(0)
		expect(view.read().loaded).toBe('2/1')
	})
})

describe('jumping, measured the moment it has moved', () => {
	test('back to today lands on the landing and re-opens the hero, with no timer to wait for', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		const landing = view.read().scrollTop
		view.scrollTo(landing + 3000)
		expect(view.read()).toMatchObject({ collapsed: 'true', away: '-1' })

		act(() => {
			view.getByTestId('back').click()
		})
		// No `advanceTimersByTime`: the jump is instant and the fold is a write,
		// so both are true the moment the click returns. The post-jump ladder used
		// to exist because neither was.
		expect(view.read()).toMatchObject({
			scrollTop: landing,
			height: `${HERO_OPEN}px`,
			collapsed: 'false',
			away: '0',
		})
	})

	test('a strip cell inside the window jumps straight away', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		act(() => {
			view.getByTestId('strip').querySelectorAll('button')[2]!.click()
		})
		// The week before today, already loaded: it mounts nothing new, so there
		// is no render to drain the jump from and it has to happen on the spot.
		expect(view.read().scrollTop).toBe(weekOffset(0) - 2)
		expect(view.read().active).toBe(KEYS[2])
	})

	test('a strip cell outside the window loads it, then jumps to it', () => {
		const view = mount()
		view.tick(SETTLE_WINDOW_MS + 1)
		act(() => {
			view.getByTestId('strip').querySelectorAll('button')[0]!.click()
		})
		expect(view.read().loaded).toBe('3/1')
		// Three weeks now sit above today, and the jumped-to week is the first.
		expect(view.read().scrollTop).toBe(weekOffset(0) - 2)
		expect(view.read().active).toBe(KEYS[0])
		expect(view.read().collapsed).toBe('true')
	})
})
