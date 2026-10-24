import { expect, test } from 'vitest'
import { widestCtlMovement } from './recompute-notice.ts'

const curve = (entries: Array<[string, number]>) => new Map(entries)

test('a rise is the day the curve went up furthest, not the last day', () => {
	const before = curve([
		['2026-01-01', 10],
		['2026-01-02', 20],
		['2026-01-03', 30],
	])
	const after = curve([
		['2026-01-01', 11],
		['2026-01-02', 26],
		['2026-01-03', 31],
	])
	expect(widestCtlMovement(before, after, 'rise')).toEqual({
		ctlBefore: 20,
		ctlAfter: 26,
	})
})

test('a rise ignores days the curve fell, and a fall ignores days it rose', () => {
	const before = curve([
		['2026-01-01', 10],
		['2026-01-02', 20],
	])
	const after = curve([
		['2026-01-01', 30],
		['2026-01-02', 12],
	])
	expect(widestCtlMovement(before, after, 'rise')).toEqual({
		ctlBefore: 10,
		ctlAfter: 30,
	})
	expect(widestCtlMovement(before, after, 'fall')).toEqual({
		ctlBefore: 20,
		ctlAfter: 12,
	})
})

test('float noise, an unchanged curve and unmatched days are no movement', () => {
	expect(
		widestCtlMovement(
			curve([['2026-01-01', 20]]),
			curve([['2026-01-01', 20.02]]),
			'rise',
		),
	).toBeNull()
	expect(
		widestCtlMovement(
			curve([['2026-01-01', 20]]),
			curve([['2026-01-02', 90]]),
			'rise',
		),
	).toBeNull()
	expect(widestCtlMovement(curve([]), curve([]), 'fall')).toBeNull()
})
