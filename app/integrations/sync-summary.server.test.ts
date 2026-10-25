import { expect, test } from 'vitest'
import { summariseSyncs } from './sync-summary.server.ts'

test('sums what each provider filed and names the ones that failed', () => {
	expect(
		summariseSyncs([
			{ label: 'Strava', result: { ok: true, created: 2, skipped: 1 } },
			{ label: 'Intervals.icu', result: { ok: false, reason: 'unavailable' } },
		]),
	).toEqual({ created: 2, failed: ['Intervals.icu'], retryAt: null })
})

test('says to try again at the earliest time a rate-limited provider names', () => {
	const earlier = new Date('2026-05-21T12:15:00Z')
	const later = new Date('2026-05-22T00:00:00Z')

	const { failed, retryAt } = summariseSyncs([
		{
			label: 'A',
			result: { ok: false, reason: 'rate-limited', retryAt: earlier },
		},
		{
			label: 'B',
			result: { ok: false, reason: 'rate-limited', retryAt: later },
		},
	])

	expect(failed).toEqual(['A', 'B'])
	expect(retryAt).toEqual(earlier)
})
