import { expect, test } from 'vitest'
import {
	structureAdherence,
	describeStructureAdherence,
} from './structure-adherence.ts'
import {
	type IntensityTarget,
	type WorkoutStructure,
} from './workout-schema.ts'

// ── Structure Adherence comparator (ADR 0034) ────────────────────────────────
// A pure, whole-session, *asymmetric* comparison of a plan-blind detected
// structure against its prescription (#332/#345). It confirms `as-prescribed`,
// asserts `diverged` only on surplus / clearly-higher-intensity detected work
// the plan did not prescribe, and degrades to `not-verifiable` whenever
// detection finds *less* than planned — never a missed-reps verdict charged to
// the athlete (ADR 0008). Both inputs are `WorkoutStructure`s, so the detected
// side (already this shape) needs no translation.

const pace = (secPerKm: number): IntensityTarget => ({
	kind: 'pace',
	minSecPerKm: secPerKm,
})
const power = (w: number): IntensityTarget => ({ kind: 'power', minW: w })
const zone = (label: string): IntensityTarget => ({ kind: 'zoneLabel', label })

/** A cardio step with a duration and an intensity target. */
function step(durationSec: number, intensity: IntensityTarget) {
	return {
		kind: 'cardio' as const,
		discipline: 'run' as const,
		durationSec,
		intensity,
	}
}

/**
 * A warm-up → k × (work + recovery) → cool-down run structure, the archetype
 * both the detector and an authored interval workout produce. `reps` sets the
 * repeat count; `work`/`rec` are per-rep durations at the given paces.
 */
function intervalRun(opts: {
	reps: number
	workSec: number
	recSec?: number
	workPace: number
	recPace?: number
}): WorkoutStructure {
	const recPace = opts.recPace ?? 360
	const recSec = opts.recSec ?? 120
	return {
		discipline: 'run',
		blocks: [
			{ repeatCount: 1, steps: [step(300, pace(recPace))] }, // warm-up
			{
				repeatCount: opts.reps,
				steps: [
					step(opts.workSec, pace(opts.workPace)),
					step(recSec, pace(recPace)),
				],
			},
			{ repeatCount: 1, steps: [step(180, pace(recPace))] }, // cool-down
		],
	}
}

test('detected structure matching the plan reads as-prescribed', () => {
	const planned = intervalRun({ reps: 6, workSec: 230, workPace: 230 })
	const detected = intervalRun({ reps: 6, workSec: 230, workPace: 232 })
	expect(structureAdherence(detected, planned)).toBe('as-prescribed')
})

test('detected surplus reps the plan did not prescribe reads diverged', () => {
	const planned = intervalRun({ reps: 4, workSec: 240, workPace: 230 })
	const detected = intervalRun({ reps: 7, workSec: 240, workPace: 230 })
	expect(structureAdherence(detected, planned)).toBe('diverged')
})

test('detected fewer reps than planned is not-verifiable, never a missed-reps verdict', () => {
	// The #330 failure mode: a real 10×3 undercounted as 6×3. Detection finding
	// LESS than planned cannot be told apart from detector blindness (ADR 0008).
	const planned = intervalRun({ reps: 10, workSec: 180, workPace: 230 })
	const detected = intervalRun({ reps: 6, workSec: 180, workPace: 230 })
	expect(structureAdherence(detected, planned)).toBe('not-verifiable')
})

test('an off-by-one rep count still corroborates the archetype (as-prescribed)', () => {
	const planned = intervalRun({ reps: 10, workSec: 180, workPace: 230 })
	const detected = intervalRun({ reps: 9, workSec: 180, workPace: 230 })
	expect(structureAdherence(detected, planned)).toBe('as-prescribed')
})

test('detected clearly-higher intensity at the same count reads diverged', () => {
	// Same 4 reps, but the athlete ran them far harder than prescribed — a real,
	// safe-to-assert divergence (comparable pace channel both sides).
	const planned = intervalRun({ reps: 4, workSec: 240, workPace: 250 })
	const detected = intervalRun({ reps: 4, workSec: 240, workPace: 205 })
	expect(structureAdherence(detected, planned)).toBe('diverged')
})

test('a matching count with incomparable intensity channels stays as-prescribed', () => {
	// Plan prescribes a zone label; detection measured pace. The two intensities
	// cannot be honestly compared, so the rep-count corroboration carries and no
	// divergence is fabricated.
	const planned: WorkoutStructure = {
		discipline: 'run',
		blocks: [
			{ repeatCount: 1, steps: [step(300, zone('easy'))] },
			{
				repeatCount: 5,
				steps: [step(240, zone('threshold')), step(120, zone('easy'))],
			},
			{ repeatCount: 1, steps: [step(180, zone('easy'))] },
		],
	}
	const detected = intervalRun({ reps: 5, workSec: 240, workPace: 230 })
	expect(structureAdherence(detected, planned)).toBe('as-prescribed')
})

test('a work-duration mismatch at a matching count degrades to not-verifiable', () => {
	// Same rep count, but the detected work reps are far longer than prescribed —
	// most likely merged reps (under-detection). We can only *confirm*
	// as-prescribed when rep count AND work durations broadly align (ADR 0034).
	const planned = intervalRun({ reps: 4, workSec: 120, workPace: 230 })
	const detected = intervalRun({ reps: 4, workSec: 420, workPace: 230 })
	expect(structureAdherence(detected, planned)).toBe('not-verifiable')
})

test('a single sustained block matching the plan reads as-prescribed', () => {
	const sustained = (workSec: number, workPace: number): WorkoutStructure => ({
		discipline: 'run',
		blocks: [
			{ repeatCount: 1, steps: [step(300, pace(360))] },
			{ repeatCount: 1, steps: [step(workSec, pace(workPace))] },
			{ repeatCount: 1, steps: [step(180, pace(360))] },
		],
	})
	const planned = sustained(1200, 250)
	const detected = sustained(1150, 252)
	expect(structureAdherence(detected, planned)).toBe('as-prescribed')
})

test('a detected sustained block against a planned interval set is not-verifiable', () => {
	// One detected effort where the plan prescribed several: detection found less
	// than planned → Unavailable, never charged as missed reps.
	const planned = intervalRun({ reps: 5, workSec: 240, workPace: 230 })
	const detected: WorkoutStructure = {
		discipline: 'run',
		blocks: [
			{ repeatCount: 1, steps: [step(300, pace(360))] },
			{ repeatCount: 1, steps: [step(600, pace(240))] },
			{ repeatCount: 1, steps: [step(180, pace(360))] },
		],
	}
	expect(structureAdherence(detected, planned)).toBe('not-verifiable')
})

test('warm-up and cool-down are not counted as work reps', () => {
	// The plan's work block repeats 4×; the flanking warm-up/cool-down blocks
	// (repeat 1, easy) must not inflate the rep count to 6.
	const planned = intervalRun({ reps: 4, workSec: 240, workPace: 230 })
	const detected = intervalRun({ reps: 4, workSec: 240, workPace: 232 })
	expect(structureAdherence(detected, planned)).toBe('as-prescribed')
})

test('bike power intervals compare on the power channel', () => {
	const bike = (reps: number, w: number): WorkoutStructure => ({
		discipline: 'bike',
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'bike',
						durationSec: 300,
						intensity: power(150),
					},
				],
			},
			{
				repeatCount: reps,
				steps: [
					{
						kind: 'cardio',
						discipline: 'bike',
						durationSec: 240,
						intensity: power(w),
					},
					{
						kind: 'cardio',
						discipline: 'bike',
						durationSec: 120,
						intensity: power(150),
					},
				],
			},
		],
	})
	expect(structureAdherence(bike(5, 280), bike(5, 282))).toBe('as-prescribed')
	// Rode the intervals well over the prescribed power → diverged.
	expect(structureAdherence(bike(5, 360), bike(5, 280))).toBe('diverged')
})

test('a detected intensity within a prescribed range is not a divergence', () => {
	// Prescribed work is a 280–320 W band; the athlete held 315 W — inside the
	// range, so the peak comparison must use the band's upper bound, not 280.
	const banded: WorkoutStructure = {
		discipline: 'bike',
		blocks: [
			{
				repeatCount: 4,
				steps: [
					{
						kind: 'cardio',
						discipline: 'bike',
						durationSec: 240,
						intensity: { kind: 'power', minW: 280, maxW: 320 },
					},
					{
						kind: 'cardio',
						discipline: 'bike',
						durationSec: 120,
						intensity: { kind: 'power', minW: 150 },
					},
				],
			},
		],
	}
	const detected: WorkoutStructure = {
		discipline: 'bike',
		blocks: [
			{
				repeatCount: 4,
				steps: [
					{
						kind: 'cardio',
						discipline: 'bike',
						durationSec: 240,
						intensity: { kind: 'power', minW: 315 },
					},
					{
						kind: 'cardio',
						discipline: 'bike',
						durationSec: 120,
						intensity: { kind: 'power', minW: 150 },
					},
				],
			},
		],
	}
	expect(structureAdherence(detected, banded)).toBe('as-prescribed')
})

test('the comparator is a pure function of its inputs', () => {
	const planned = intervalRun({ reps: 6, workSec: 230, workPace: 230 })
	const detected = intervalRun({ reps: 6, workSec: 230, workPace: 232 })
	const a = structureAdherence(detected, planned)
	const b = structureAdherence(detected, planned)
	expect(a).toBe(b)
	// Inputs are not mutated.
	expect(planned.blocks[1]!.repeatCount).toBe(6)
})

test('describeStructureAdherence gives each verdict an honest label and description', () => {
	expect(describeStructureAdherence('as-prescribed').label).toBe(
		'As prescribed',
	)
	expect(describeStructureAdherence('diverged').label).toBe('Diverged')
	const na = describeStructureAdherence('not-verifiable')
	expect(na.label).toBe('Not verifiable')
	expect(na.description).toMatch(/not confidently verifiable/i)
})
