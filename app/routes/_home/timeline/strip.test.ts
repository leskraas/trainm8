/**
 * The strip's window on a season too long for a phone (S10, ADR 0086): the
 * whole season whenever the bars can be ~6px, else a window as wide as fits
 * that starts centred on the reader and then moves only as far as it must.
 */
import { describe, expect, test } from 'vitest'
import { MIN_BAR_PX, stripWindow, WINDOW_MARGIN } from './strip.ts'
import { placePhaseNames } from './week-strip.tsx'

const PHONE = 358

describe('the strip’s window (S10)', () => {
	test('a season that fits is shown whole', () => {
		const fits = Math.floor(PHONE / MIN_BAR_PX)
		expect(
			stripWindow({
				count: fits,
				width: PHONE,
				frame: { from: 3, to: 4 },
				current: null,
			}),
		).toEqual({ start: 0, end: fits - 1 })
	})

	test('before anything is measured the season is shown whole', () => {
		expect(
			stripWindow({
				count: 120,
				width: 0,
				frame: { from: 3, to: 4 },
				current: null,
			}),
		).toEqual({ start: 0, end: 119 })
	})

	test('a long season opens on a window centred on the reader', () => {
		const shown = stripWindow({
			count: 120,
			width: PHONE,
			frame: { from: 60, to: 61 },
			current: null,
		})
		const span = Math.floor(PHONE / MIN_BAR_PX)
		expect(shown.end - shown.start + 1).toBe(span)
		expect(shown.start).toBeLessThanOrEqual(60)
		expect(shown.end).toBeGreaterThanOrEqual(61)
		expect(Math.abs((shown.start + shown.end) / 2 - 60.5)).toBeLessThanOrEqual(
			1,
		)
	})

	test('it is clamped to the season’s ends', () => {
		expect(
			stripWindow({
				count: 120,
				width: PHONE,
				frame: { from: 0, to: 1 },
				current: null,
			}).start,
		).toBe(0)
		expect(
			stripWindow({
				count: 120,
				width: PHONE,
				frame: { from: 118, to: 119 },
				current: null,
			}).end,
		).toBe(119)
	})

	test('it holds still while the reader moves inside it', () => {
		const current = stripWindow({
			count: 120,
			width: PHONE,
			frame: { from: 60, to: 61 },
			current: null,
		})
		expect(
			stripWindow({
				count: 120,
				width: PHONE,
				frame: {
					from: current.start + WINDOW_MARGIN,
					to: current.start + WINDOW_MARGIN + 1,
				},
				current,
			}),
		).toBe(current)
	})

	test('past its edge it moves only far enough to bring the reader back in', () => {
		const current = stripWindow({
			count: 120,
			width: PHONE,
			frame: { from: 60, to: 61 },
			current: null,
		})
		const next = stripWindow({
			count: 120,
			width: PHONE,
			frame: { from: current.end + 3, to: current.end + 3 },
			current,
		})
		expect(next.end).toBe(current.end + 3 + WINDOW_MARGIN)
	})
})

describe('the phase names under the strip', () => {
	const season = [
		{ name: 'Grunntrening', from: 0, to: 3 },
		{ name: 'Oppbygging', from: 4, to: 5 },
		{ name: 'Spissing', from: 6, to: 6 },
		{ name: 'Nedtrapping', from: 7, to: 7 },
	]

	test('every name is whole where its band is wide enough', () => {
		const placed = placePhaseNames(season, { barPx: 80, count: 8, current: 0 })
		expect(placed.map((phase) => phase.name)).toEqual([
			'Grunntrening',
			'Oppbygging',
			'Spissing',
			'Nedtrapping',
		])
	})

	test('a name that does not fit is left out, never abbreviated', () => {
		const placed = placePhaseNames(season, { barPx: 14, count: 8, current: 0 })
		// 4 × 14 = 56px is too narrow for `Grunntrening` (~71px), but today is
		// in it, so it is named whole and runs on; every other name is left out.
		expect(placed.map((phase) => phase.name)).toEqual([
			'Grunntrening',
			null,
			null,
			null,
		])
		for (const phase of placed) {
			expect(phase.name ?? '').not.toMatch(/\.$/)
		}
	})

	test('the current phase is named in full, inside the strip, and a name it would cover gives way', () => {
		const placed = placePhaseNames(
			[
				{ name: 'Grunntrening', from: 0, to: 9 },
				{ name: 'Spissing', from: 10, to: 10 },
				{ name: 'Nedtrapping', from: 11, to: 18 },
			],
			{ barPx: 10, count: 19, current: 10 },
		)
		const peak = placed[1]!
		expect(peak.name).toBe('Spissing')
		// Kept inside the 190px strip.
		expect(peak.nameLeft + 'Spissing'.length * 5.6).toBeLessThanOrEqual(190)
		// `Grunntrening` ends before it starts, so it stays; `Nedtrapping`
		// would fit its own band, but the current phase's name covers it.
		expect(placed[0]!.name).toBe('Grunntrening')
		expect(placed[2]!.name).toBeNull()
	})

	test('with no current phase in view, only the names that fit are drawn', () => {
		const placed = placePhaseNames(season, {
			barPx: 14,
			count: 8,
			current: null,
		})
		expect(placed.map((phase) => phase.name)).toEqual([null, null, null, null])
	})
})
