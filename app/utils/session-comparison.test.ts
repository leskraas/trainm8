import { expect, test } from 'vitest'
import {
	type ComparableSession,
	buildVsLastComparison,
} from './session-comparison.ts'

const session = (
	tssValue: number | null,
	durationSec: number | null,
): ComparableSession => ({
	tssValue,
	recording: durationSec != null ? { durationSec } : null,
})

const prior = (
	tssValue: number | null,
	durationSec: number | null,
	scheduledAt = new Date('2026-05-01T06:00:00Z'),
) => ({ id: 'prev', scheduledAt, ...session(tssValue, durationSec) })

test('returns null when there is no prior similar session', () => {
	expect(buildVsLastComparison(session(72, 3600), null)).toBeNull()
})

test('carries the previous session id and date for linking back', () => {
	const date = new Date('2026-05-03T06:00:00Z')
	const comparison = buildVsLastComparison(
		session(72, 3600),
		prior(60, 3000, date),
	)
	expect(comparison?.previousSessionId).toBe('prev')
	expect(comparison?.previousDate).toEqual(date)
})

test('computes the signed change for each metric (current − previous)', () => {
	const comparison = buildVsLastComparison(session(72, 3600), prior(60, 3300))
	expect(comparison?.tss).toEqual({ current: 72, previous: 60, change: 12 })
	expect(comparison?.durationSec).toEqual({
		current: 3600,
		previous: 3300,
		change: 300,
	})
})

test('change is negative when this session was easier/shorter', () => {
	const comparison = buildVsLastComparison(session(50, 2400), prior(80, 3600))
	expect(comparison?.tss.change).toBe(-30)
	expect(comparison?.durationSec.change).toBe(-1200)
})

test('a metric missing on either side yields a null change, never a fabricated delta', () => {
	const noCurrentTss = buildVsLastComparison(session(null, 3600), prior(60, 3000))
	expect(noCurrentTss?.tss).toEqual({ current: null, previous: 60, change: null })

	const noPriorDuration = buildVsLastComparison(
		session(72, 3600),
		prior(60, null),
	)
	expect(noPriorDuration?.durationSec).toEqual({
		current: 3600,
		previous: null,
		change: null,
	})
})

test('treats a session without a recording as having no actual duration', () => {
	const comparison = buildVsLastComparison(session(72, null), prior(60, 3000))
	expect(comparison?.durationSec.current).toBeNull()
	expect(comparison?.durationSec.change).toBeNull()
	// TSS still compares — it does not depend on a recording.
	expect(comparison?.tss.change).toBe(12)
})
