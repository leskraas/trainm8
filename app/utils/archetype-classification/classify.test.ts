import { expect, test } from 'vitest'
import { classifyArchetype } from './classify.ts'
import { LONG_ABS_MIN_SEC } from './constants.ts'
import {
	type ArchetypeInput,
	type ArchetypeReading,
	type RepReading,
	type TimeInZone,
} from './types.ts'

// ── Reading a Session Archetype off a completed session (ADR 0055) ───────────
// The bar is not "does it label things" — it is "does it refuse the calls the
// data cannot support". Half of these tests are about the refusals.

const EASY_TIZ: TimeInZone = { z1Frac: 0.99, z2Frac: 0.01, z3Frac: 0 }

function input(overrides: Partial<ArchetypeInput> = {}): ArchetypeInput {
	return {
		movingSec: 3600,
		channel: 'power',
		structure: null,
		intensityFactor: 0.7,
		timeInZone: EASY_TIZ,
		disciplineSegments: [{ discipline: 'run', startSec: 0, endSec: 3600 }],
		context: { medianSessionSec28d: 3600 },
		...overrides,
	}
}

/** A flat set of `count` reps, each `durationSec` long, all in one zone. */
function reps(count: number, durationSec: number, zone: 1 | 2 | 3 | 4 | 5) {
	return Array.from(
		{ length: count },
		(): RepReading => ({
			durationSec,
			zone,
		}),
	)
}

function set(
	overrides: Partial<ArchetypeInput['structure'] & object> = {},
): ArchetypeInput['structure'] {
	return {
		reps: reps(4, 480, 4),
		recoverySec: 4 * 120,
		durationCV: null,
		grade: 'high',
		...overrides,
	}
}

function named(reading: ArchetypeReading) {
	if (reading.kind !== 'archetype') {
		throw new Error(`expected an archetype, got refusal ${reading.refusal}`)
	}
	return reading
}

function refusal(reading: ArchetypeReading) {
	if (reading.kind !== 'unclassified') {
		throw new Error(`expected a refusal, got archetype ${reading.archetype}`)
	}
	return reading
}

// ── The structured path: rep geometry ───────────────────────────────────────

test('long reps at threshold intensity read as a threshold session', () => {
	// The headline case: 4 × 8 min at LT2 should be able to say "threshold", which
	// is the whole defect this axis was added to fix.
	const reading = named(classifyArchetype(input({ structure: set() })))

	expect(reading.archetype).toBe('threshold')
	expect(reading.confidence).toBe('high')
	expect(reading.reasons.join(' ')).toContain('4 × 8 min')
	expect(reading.caveat).toBeNull()
})

test('mid-length reps above LT2 read as VO₂max (long)', () => {
	const reading = named(
		classifyArchetype(
			input({
				structure: set({ reps: reps(5, 240, 5), recoverySec: 5 * 180 }),
			}),
		),
	)

	expect(reading.archetype).toBe('vo2max-long')
})

test('short reps with incomplete recovery read as VO₂max (short)', () => {
	// 13 × 30 s with 15 s floats — Rønnestad's 30/15.
	const reading = named(
		classifyArchetype(
			input({
				structure: set({ reps: reps(13, 30, 5), recoverySec: 13 * 15 }),
			}),
		),
	)

	expect(reading.archetype).toBe('vo2max-short')
})

test('near-maximal short reps with long recoveries read as anaerobic', () => {
	const reading = named(
		classifyArchetype(
			input({ structure: set({ reps: reps(6, 60, 5), recoverySec: 6 * 240 }) }),
		),
	)

	expect(reading.archetype).toBe('anaerobic')
})

test('many controlled reps with short floats read as sub-threshold, never as threshold', () => {
	// 6 × 6 min at the Z3/Z4 seam with 1 min floats — the Norwegian shape. The
	// generic threshold rule would swallow it, so order is load-bearing here.
	const reading = named(
		classifyArchetype(
			input({ structure: set({ reps: reps(6, 360, 4), recoverySec: 6 * 60 }) }),
		),
	)

	expect(reading.archetype).toBe('sub-threshold')
})

test('sub-threshold carries the lactate caveat and is capped at medium for it', () => {
	// The app must not tell an athlete they did a lactate-guided session when no
	// lactate was measured — so the caveat travels with the answer and caps it.
	const reading = named(
		classifyArchetype(
			input({ structure: set({ reps: reps(6, 360, 4), recoverySec: 6 * 60 }) }),
		),
	)

	expect(reading.caveat).toMatch(/lactate/)
	expect(reading.confidence).toBe('medium')
})

test('a set whose geometry matches no archetype is refused, not rounded to the nearest', () => {
	// 3 × 3 min at zone 2: too easy for threshold, too long for a micro-interval,
	// too few for sub-threshold. There is no honest name for it.
	const reading = refusal(
		classifyArchetype(
			input({ structure: set({ reps: reps(3, 180, 2), recoverySec: 3 * 60 }) }),
		),
	)

	expect(reading.refusal).toBe('geometry-unmatched')
})

// ── Refusals the geometry path owes ─────────────────────────────────────────

test('reps whose intensity no threshold resolves refuse rather than reading as easy', () => {
	// ADR 0035's rule: never a population default. An unresolved zone is not a
	// low one, and treating it as one would call a VO₂max session an easy run.
	const reading = refusal(
		classifyArchetype(
			input({
				structure: set({
					reps: reps(4, 480, 4).map((r) => ({ ...r, zone: null })),
				}),
			}),
		),
	)

	expect(reading.refusal).toBe('no-zone')
	expect(reading.reasons.join(' ')).toContain('no threshold')
})

test('one unresolved rep refuses the whole reading', () => {
	// A mean over the reps that happened to resolve is not the session's mean.
	const partial = [...reps(3, 480, 4), { durationSec: 480, zone: null }]
	const reading = refusal(
		classifyArchetype(input({ structure: set({ reps: partial }) })),
	)

	expect(reading.refusal).toBe('no-zone')
})

// ── Neuromuscular is a modifier, never the session ──────────────────────────

test('strides on the end of an easy run leave the session easy and add a modifier', () => {
	// The requirement `workouts-running.md` §8 states outright: strides must not
	// promote the day to a quality session.
	const reading = named(
		classifyArchetype(
			input({
				structure: set({ reps: reps(8, 20, 5), recoverySec: 8 * 160 }),
			}),
		),
	)

	expect(reading.archetype).toBe('easy')
	expect(reading.modifiers).toEqual(['neuromuscular'])
	expect(reading.reasons.join(' ')).toContain(
		'short efforts with full recovery',
	)
})

test('strides on a session that cannot be read leave the refusal standing', () => {
	// Promoting the strides to the primary would be the exact error the ordering
	// exists to prevent, so the refusal survives and merely says what was found.
	const reading = refusal(
		classifyArchetype(
			input({
				timeInZone: null,
				structure: set({ reps: reps(8, 20, 5), recoverySec: 8 * 160 }),
			}),
		),
	)

	expect(reading.refusal).toBe('no-signal')
	expect(reading.reasons.join(' ')).toContain(
		'short efforts with full recovery',
	)
})

// ── Easy vs long: the refusal that the pseudocode guesses at ────────────────

test('a session past the absolute floor reads as long against a smaller median', () => {
	const reading = named(
		classifyArchetype(
			input({ movingSec: 7200, context: { medianSessionSec28d: 3600 } }),
		),
	)

	expect(reading.archetype).toBe('long')
	expect(reading.reasons.join(' ')).toContain('median session')
})

test('the same session reads as easy against a bigger median', () => {
	// Same telemetry, different archetype. This is §1's whole point.
	const reading = named(
		classifyArchetype(
			input({ movingSec: 7200, context: { medianSessionSec28d: 6000 } }),
		),
	)

	expect(reading.archetype).toBe('easy')
})

test('a session past the absolute floor with no window is refused, never answered easy', () => {
	// §8.2 orders `isLong` first and returns false without a window, which
	// quietly answers `easy` for a three-hour run. This deviates deliberately.
	const reading = refusal(
		classifyArchetype(
			input({ movingSec: 10800, context: { medianSessionSec28d: null } }),
		),
	)

	expect(reading.refusal).toBe('no-week-context')
	expect(reading.reasons.join(' ')).toContain('recent volume')
})

test('a session below the absolute floor needs no window at all', () => {
	// Nothing shorter than 90 min is long for anybody, so the window is not
	// consulted — and its absence must not cost anything, because the reading
	// never asked for it.
	const shortSession = { movingSec: LONG_ABS_MIN_SEC - 60 }
	const withoutWindow = named(
		classifyArchetype(
			input({ ...shortSession, context: { medianSessionSec28d: null } }),
		),
	)
	const withWindow = named(
		classifyArchetype(
			input({ ...shortSession, context: { medianSessionSec28d: 3600 } }),
		),
	)

	expect(withoutWindow.archetype).toBe('easy')
	expect(withoutWindow.confidence).toBe(withWindow.confidence)
})

// ── The unstructured path ───────────────────────────────────────────────────

test('short, capped and formless reads as recovery', () => {
	const reading = named(
		classifyArchetype(input({ movingSec: 2100, intensityFactor: 0.55 })),
	)

	expect(reading.archetype).toBe('recovery')
})

test('sustained between LT1 and LT2 is refused as tempo-or-steady, never guessed', () => {
	// Telemetry cannot separate the two; picking one is a coin flip wearing a
	// label, and the sixteen-value vocabulary has no merged member.
	const reading = refusal(
		classifyArchetype(
			input({
				intensityFactor: 0.85,
				timeInZone: { z1Frac: 0.3, z2Frac: 0.65, z3Frac: 0.05 },
			}),
		),
	)

	expect(reading.refusal).toBe('tempo-or-steady')
})

test('mixed intensity with no detectable set reads as fartlek', () => {
	const reading = named(
		classifyArchetype(
			input({
				intensityFactor: 0.75,
				timeInZone: { z1Frac: 0.6, z2Frac: 0.25, z3Frac: 0.15 },
			}),
		),
	)

	expect(reading.archetype).toBe('fartlek')
})

test('no structure and no time-in-zone profile is refused as no-signal', () => {
	const reading = refusal(classifyArchetype(input({ timeInZone: null })))

	expect(reading.refusal).toBe('no-signal')
})

test('an unstructured session matching no rule is refused, not defaulted', () => {
	// Too much above LT1 to be easy, too little to be a fartlek, the wrong IF for
	// tempo, too long for recovery. Nothing fits and nothing is invented.
	const reading = refusal(
		classifyArchetype(
			input({
				movingSec: 3600,
				intensityFactor: 0.7,
				timeInZone: { z1Frac: 0.8, z2Frac: 0.19, z3Frac: 0.01 },
			}),
		),
	)

	expect(reading.refusal).toBe('no-rule-fits')
})

// ── Branches that override intensity entirely ───────────────────────────────

test('two disciplines with no break between them read as a brick, whatever the intensity', () => {
	const reading = named(
		classifyArchetype(
			input({
				movingSec: 7200,
				disciplineSegments: [
					{ discipline: 'bike', startSec: 0, endSec: 5400 },
					{ discipline: 'run', startSec: 5520, endSec: 7200 },
				],
			}),
		),
	)

	expect(reading.archetype).toBe('brick')
})

test('two disciplines separated by a real break are two sessions, not a brick', () => {
	const reading = named(
		classifyArchetype(
			input({
				movingSec: 7200,
				context: { medianSessionSec28d: 3600 },
				disciplineSegments: [
					{ discipline: 'bike', startSec: 0, endSec: 3600 },
					{ discipline: 'run', startSec: 7200, endSec: 9000 },
				],
			}),
		),
	)

	expect(reading.archetype).not.toBe('brick')
})

test('a near-maximal sustained effort reads as a test', () => {
	const reading = named(
		classifyArchetype(input({ movingSec: 1800, intensityFactor: 0.98 })),
	)

	expect(reading.archetype).toBe('test')
})

test('a near-maximal effort that was repeated is not a test', () => {
	// The output of a test is a number, and that means one effort, not a set.
	const reading = classifyArchetype(
		input({
			intensityFactor: 0.98,
			structure: set({ reps: reps(5, 240, 5), recoverySec: 5 * 180 }),
		}),
	)

	expect(named(reading).archetype).toBe('vo2max-long')
})

// ── Confidence composition ─────────────────────────────────────────────────

test('a zone read off heart rate caps the confidence at medium', () => {
	const reading = named(
		classifyArchetype(input({ channel: 'heartRate', structure: set() })),
	)

	expect(reading.confidence).toBe('medium')
})

test('confidence is the weakest input, never an average', () => {
	const reading = named(
		classifyArchetype(
			input({ channel: 'heartRate', structure: set({ grade: 'low' }) }),
		),
	)

	expect(reading.confidence).toBe('low')
})

test('an unstructured reading is capped at low, because no structure was graded', () => {
	// There is no detection to grade, so the weakest input is the missing one.
	const reading = named(
		classifyArchetype(input({ movingSec: 2100, intensityFactor: 0.55 })),
	)

	expect(reading.confidence).toBe('low')
})

// ── Fartlek's structured branch is unreachable, and that is honest ──────────

test('averaged reps never read as a fartlek, because an average is not regularity', () => {
	// `durationCV: null` is the stored reality: a detection collapses its set to
	// one averaged step, so irregularity — which *defines* fartlek — is gone.
	const reading = classifyArchetype(
		input({ structure: set({ reps: reps(5, 300, 3), durationCV: null }) }),
	)

	expect(reading.kind === 'archetype' && reading.archetype).not.toBe('fartlek')
})

test('given real rep durations, irregular ones do read as a fartlek', () => {
	// The branch is correct and waiting on a per-interval entity, not wrong.
	const reading = named(
		classifyArchetype(
			input({
				structure: set({
					reps: [
						{ durationSec: 120, zone: 4 },
						{ durationSec: 420, zone: 4 },
						{ durationSec: 90, zone: 4 },
						{ durationSec: 600, zone: 4 },
					],
					durationCV: 0.7,
				}),
			}),
		),
	)

	expect(reading.archetype).toBe('fartlek')
})
