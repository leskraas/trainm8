import { expect, test } from 'vitest'
import {
	type QualitySessionMixEntry,
	type QualityZone,
	emphasisTerms,
	isQualityZone,
	qualitySessionCount,
} from './quality-mix.ts'

function mix(
	...entries: [zone: QualityZone, sessionsPerWeek: number][]
): QualitySessionMixEntry[] {
	return entries.map(([zone, sessionsPerWeek]) => ({ zone, sessionsPerWeek }))
}

test('the Quality Session Count is the sum of the mix (ADR 0042 §4)', () => {
	expect(qualitySessionCount(mix([4, 2], [5, 1]))).toBe(3)
})

test('an empty mix counts zero quality sessions rather than null (ADR 0042 §6)', () => {
	expect(qualitySessionCount([])).toBe(0)
})

test('the emphasis terms come back ascending by zone whatever order the rows arrive in', () => {
	// `{ z5: 1, z4: 2 }` must read "2× threshold + 1× VO₂ max" (ADR 0042 §5), so
	// the order is a property of the zones and not of the stored rows.
	expect(emphasisTerms(mix([5, 1], [3, 1], [4, 2]))).toEqual([
		{ zone: 3, sessionsPerWeek: 1 },
		{ zone: 4, sessionsPerWeek: 2 },
		{ zone: 5, sessionsPerWeek: 1 },
	])
})

test('a zero or negative dose is not a term', () => {
	expect(emphasisTerms(mix([3, 0], [4, 2], [5, -1]))).toEqual([
		{ zone: 4, sessionsPerWeek: 2 },
	])
})

test('an empty mix yields no terms, which is the positive statement that the segment has no quality sessions', () => {
	// `[]` is "no quality sessions in this segment", never "unknown" — which is
	// why `recovery` needed no successor word (ADR 0042 §6). The wording of that
	// statement belongs to `formatEmphasisLabel` (ADR 0023).
	expect(emphasisTerms([])).toEqual([])
})

test('no term can name zone 1, zone 2, or anything neuromuscular (ADR 0042 §3, §7)', () => {
	expect(isQualityZone(1)).toBe(false)
	expect(isQualityZone(2)).toBe(false)
	expect(isQualityZone(6)).toBe(false)
	expect(isQualityZone(3)).toBe(true)
	expect(isQualityZone(4)).toBe(true)
	expect(isQualityZone(5)).toBe(true)
})
