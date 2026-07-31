import { expect, test } from 'vitest'
import { type EnduranceSegmentSpec, type PhaseSpec } from './derive.ts'
import { RAMP_GUARD_MAX, rampWarnings } from './ramp-guard.ts'

const phases: PhaseSpec[] = [
	{ weeks: 4, rhythm: '3:1', tapers: false },
	{ weeks: 4, rhythm: '3:1', tapers: false },
	{ weeks: 2, rhythm: 'none', tapers: true },
]

function segment(
	phaseIndex: number,
	overrides: Partial<EnduranceSegmentSpec> = {},
): EnduranceSegmentSpec {
	return {
		kind: 'endurance',
		phaseIndex,
		ramp: null,
		boundaryStep: null,
		recoveryCut: null,
		taperCut: null,
		...overrides,
	}
}

test('a ramp at the convention is not warned on', () => {
	expect(
		rampWarnings(phases, [segment(0, { ramp: RAMP_GUARD_MAX })]),
	).toEqual([])
})

test('a ramp steeper than the convention warns, naming what was authored', () => {
	expect(rampWarnings(phases, [segment(1, { ramp: 0.12 })])).toEqual([
		{ subject: 'ramp', phaseIndex: 1, authored: 0.12 },
	])
})

test('a boundary step steeper than the convention warns', () => {
	expect(rampWarnings(phases, [segment(1, { boundaryStep: 0.2 })])).toEqual([
		{ subject: 'boundary-step', phaseIndex: 1, authored: 0.2 },
	])
})

test('a deliberate drop is intent and is never warned on (ADR 0040 §4)', () => {
	expect(
		rampWarnings(phases, [segment(1, { ramp: -0.2, boundaryStep: -0.33 })]),
	).toEqual([])
})

test('the guard reads the authored numbers, never a week-over-week difference', () => {
	// A −30% recovery week is followed by a +43% rebound and a taper falls 50% in
	// one week. Both are false positives for a diff-based guard; the subject here
	// is what the athlete authored, so both are silent (ADR 0040 §12).
	const steep = [
		segment(0, { ramp: 0.05, recoveryCut: 0.6 }),
		segment(1, { ramp: 0.05 }),
		segment(2, { ramp: 0.05, taperCut: 0.7 }),
	]
	expect(rampWarnings(phases, steep)).toEqual([])
})

test('a phase with no segment authors nothing to warn about', () => {
	expect(rampWarnings(phases, [])).toEqual([])
})

test('both authored numbers of one segment warn separately', () => {
	expect(
		rampWarnings(phases, [segment(0, { ramp: 0.1, boundaryStep: 0.15 })]),
	).toEqual([
		{ subject: 'ramp', phaseIndex: 0, authored: 0.1 },
		{ subject: 'boundary-step', phaseIndex: 0, authored: 0.15 },
	])
})

test('warnings come back in phase order, whatever order the segments arrive in', () => {
	const warnings = rampWarnings(phases, [
		segment(2, { ramp: 0.3 }),
		segment(0, { ramp: 0.2 }),
	])
	expect(warnings.map((warning) => warning.phaseIndex)).toEqual([0, 2])
})

test('a segment addressing no phase in the season is skipped', () => {
	expect(rampWarnings(phases, [segment(9, { ramp: 0.4 })])).toEqual([])
})
