/**
 * @vitest-environment jsdom
 *
 * The chart's own seam: the geometry it draws for a given {@link ChartBar}.
 *
 * What the screen *says* is proven in `__exercise-history-presenter.test.ts` and
 * `exercises.$exerciseId.route.test.tsx`. What is left here is the one thing
 * neither can reach — how tall a bar is drawn for the value it was given.
 */
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { type ChartBar } from './__exercise-history-presenter.ts'
import { LiftChart } from './__lift-chart.tsx'

function bar(overrides: Partial<ChartBar> = {}): ChartBar {
	return {
		sessionId: 'sess-1',
		ordinal: 1,
		heightFraction: 0.5,
		latest: false,
		stallCut: null,
		tickLabel: null,
		dateLabel: '1 Jul',
		text: '80 kg × 5',
		...overrides,
	}
}

function draw(bars: ChartBar[]) {
	const { container } = render(
		<LiftChart
			bars={bars}
			label="Back squat: top set across 3 sessions, oldest first."
			table={{
				caption: 'Back squat, top set by session, oldest first',
				columns: ['Session', 'Date', 'Top set', 'Marked'],
				rows: bars.map((b) => [
					`Session ${b.ordinal}`,
					b.dateLabel,
					b.text,
					'—',
				]),
			}}
		/>,
	)
	return container
}

const heightOf = (rect: Element) => Number(rect.getAttribute('height'))

function barHeights(bars: ChartBar[]): number[] {
	return [...draw(bars).querySelectorAll('rect[data-lift-bar]')].map(heightOf)
}

test('a real value is drawn at the height it is worth, however small, and never at a floor', () => {
	// The old chart rounded the fraction to a whole percent and then let a CSS
	// `min-h-1` catch whatever that flattened — so three readings a decade apart
	// came out as three bars of one height. Height is arithmetic now, not a
	// fallback.
	const [small, mid, large] = barHeights([
		bar({ sessionId: 'a', ordinal: 1, heightFraction: 0.004 }),
		bar({ sessionId: 'b', ordinal: 2, heightFraction: 0.012 }),
		bar({ sessionId: 'c', ordinal: 3, heightFraction: 0.04 }),
	])

	expect(small).toBeGreaterThan(0)
	expect(mid! / small!).toBeCloseTo(3)
	expect(large! / small!).toBeCloseTo(10)
})

test('a real value smaller than the Unavailable marker draws smaller than it, so the two never read alike', () => {
	// The floor's real cost: it drew a genuine reading at about the height of the
	// stub that means *there is no reading here* (ADR 0030 rule 1), so an honest
	// value and a missing one were the same picture.
	const [tiny] = barHeights([bar({ heightFraction: 0.004 })])
	const marker = draw([bar({ heightFraction: null })]).querySelector(
		'rect:not([data-lift-bar])',
	)!

	expect(tiny).toBeLessThan(heightOf(marker))
})

test('the Stall Cut keeps its destructive tone, and wins over the latest bar', () => {
	// A bar can be both, and on the day the program cuts a weight the cut is what
	// the athlete needs to see — drawing it in primary because it happens to be
	// today would hide the one event the screen exists to explain.
	const tones = [
		...draw([
			bar({ sessionId: 'a', ordinal: 1 }),
			bar({
				sessionId: 'b',
				ordinal: 2,
				stallCut: { fromKg: 80, toKg: 72.5 },
			}),
			bar({ sessionId: 'c', ordinal: 3, latest: true }),
			bar({
				sessionId: 'd',
				ordinal: 4,
				latest: true,
				stallCut: { fromKg: 80, toKg: 72.5 },
			}),
		]).querySelectorAll('rect[data-lift-bar]'),
	].map((rect) => rect.getAttribute('class'))

	expect(tones).toEqual([
		'fill-foreground/15',
		'fill-destructive',
		'fill-primary',
		'fill-destructive',
	])
})

test('bars stand in slot order, so the oldest session is leftmost', () => {
	const xs = [
		...draw([
			bar({ sessionId: 'a', ordinal: 1, heightFraction: 0.2 }),
			bar({ sessionId: 'b', ordinal: 2, heightFraction: 0.6 }),
			bar({ sessionId: 'c', ordinal: 3, heightFraction: 1, latest: true }),
		]).querySelectorAll('rect[data-lift-bar]'),
	].map((rect) => Number(rect.getAttribute('x')))

	expect(xs).toEqual([...xs].sort((a, b) => a - b))
})
