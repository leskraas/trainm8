/**
 * The strip's window on a season too long for a phone (S10, ADR 0086): the
 * whole season whenever the bars can be ~6px, else a window as wide as fits
 * that starts centred on the reader and then moves only as far as it must.
 */
import { describe, expect, test } from 'vitest'
import { MIN_BAR_PX, stripWindow, WINDOW_MARGIN } from './strip.ts'
import { fitPhaseName } from './week-strip.tsx'

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

describe('a phase name in its band', () => {
	test('whole where it fits, cut with a full stop where it does not, gone when tiny', () => {
		expect(fitPhaseName('Spissing', 200)).toBe('Spissing')
		expect(fitPhaseName('Grunntrening', 50)).toBe('Grunntr.')
		expect(fitPhaseName('Grunntrening', 20)).toBeNull()
	})
})
