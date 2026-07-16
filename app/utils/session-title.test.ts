import { expect, test } from 'vitest'
import { deriveRecordingTitle, deriveWorkoutTitle } from './session-title.ts'
import {
	type IntensityTarget,
	type WorkoutStructure,
} from './workout-schema.ts'

// ── Derived session titles ───────────────────────────────────────────────────
// Pure, display-derived names for a session, so a detected/authored structure
// and a bare recording both read as something better than "Detected structure"
// or "Recording". Honest per ADR 0008: the intensity word only appears when the
// target carries an intrinsic zone — a raw measured target (what Structure
// Detection stores) is never back-classified into a fabricated zone here.

const cardio = (
	step: Partial<
		Extract<
			WorkoutStructure['blocks'][number]['steps'][number],
			{ kind: 'cardio' }
		>
	>,
): WorkoutStructure['blocks'][number]['steps'][number] => ({
	kind: 'cardio',
	discipline: 'run',
	...step,
})

const rest = (
	durationSec?: number,
): WorkoutStructure['blocks'][number]['steps'][number] =>
	durationSec != null ? { kind: 'rest', durationSec } : { kind: 'rest' }

const structure = (
	blocks: WorkoutStructure['blocks'],
	discipline: WorkoutStructure['discipline'] = 'run',
): WorkoutStructure => ({ discipline, blocks })

const power: IntensityTarget = { kind: 'power', minW: 250 }
const pace: IntensityTarget = { kind: 'pace', minSecPerKm: 280 }

// ── deriveWorkoutTitle ───────────────────────────────────────────────────────

test('a detected interval block reads as the rep count × work quantity', () => {
	// Structure Detection stores a measured (power) target, so no zone word is
	// asserted — just the honest structure.
	const s = structure([
		{
			repeatCount: 4,
			steps: [cardio({ durationSec: 360, intensity: power }), rest(120)],
		},
	])
	expect(deriveWorkoutTitle(s)).toBe('4 × 6 min')
})

test('the repeat block is the headline even with a warm-up and cool-down around it', () => {
	const s = structure([
		{ repeatCount: 1, steps: [cardio({ durationSec: 720, intensity: pace })] },
		{
			repeatCount: 5,
			steps: [cardio({ durationSec: 180, intensity: power }), rest(60)],
		},
		{ repeatCount: 1, steps: [cardio({ durationSec: 480, intensity: pace })] },
	])
	expect(deriveWorkoutTitle(s)).toBe('5 × 3 min')
})

test('distance reps read in the distance unit', () => {
	const s = structure([
		{
			repeatCount: 6,
			steps: [cardio({ distanceM: 400, intensity: power }), rest(60)],
		},
	])
	expect(deriveWorkoutTitle(s)).toBe('6 × 400 m')
})

test('an authored zone-label target contributes its word', () => {
	const s = structure([
		{
			repeatCount: 4,
			steps: [
				cardio({
					durationSec: 360,
					intensity: { kind: 'zoneLabel', label: 'threshold' },
				}),
				rest(120),
			],
		},
	])
	expect(deriveWorkoutTitle(s)).toBe('4 × 6 min Threshold')
})

test('a single steady authored step reads as quantity + zone word', () => {
	const s = structure([
		{
			repeatCount: 1,
			steps: [
				cardio({
					durationSec: 2700,
					intensity: { kind: 'zoneLabel', label: 'easy' },
				}),
			],
		},
	])
	expect(deriveWorkoutTitle(s)).toBe('45 min Easy')
})

test('a percentage target still yields a zone word (Z-label)', () => {
	const s = structure([
		{
			repeatCount: 1,
			steps: [
				cardio({
					durationSec: 1800,
					intensity: { kind: 'powerPct', minPct: 95, maxPct: 105 },
				}),
			],
		},
	])
	// The exact zone comes from the shared mapping; the point is a word appears.
	expect(deriveWorkoutTitle(s)).toMatch(/^30 min Z[1-5]$/)
})

test('a measured target on a single steady step omits the zone word', () => {
	const s = structure([
		{
			repeatCount: 1,
			steps: [cardio({ durationSec: 2700, intensity: power })],
		},
	])
	expect(deriveWorkoutTitle(s)).toBe('45 min')
})

test('a structure with no cardio step degrades to the discipline noun, never empty', () => {
	const s = structure([{ repeatCount: 1, steps: [rest(300)] }], 'bike')
	expect(deriveWorkoutTitle(s)).toBe('Ride')
})

test('a repeat block whose work step has no quantity never dangles a bare "4 ×"', () => {
	const s = structure([
		{
			repeatCount: 4,
			steps: [
				cardio({ intensity: { kind: 'zoneLabel', label: 'threshold' } }),
				rest(120),
			],
		},
	])
	// No duration/distance to multiply, so the rep count is dropped rather than
	// left dangling; the honest zone word still names it.
	expect(deriveWorkoutTitle(s)).toBe('Threshold')
})

// ── deriveRecordingTitle ─────────────────────────────────────────────────────

test('a bare recording is named by duration and discipline', () => {
	expect(
		deriveRecordingTitle({
			discipline: 'run',
			durationSec: 2700,
			distanceM: 8200,
		}),
	).toBe('45 min run')
})

test('a bike recording reads as a ride', () => {
	expect(
		deriveRecordingTitle({
			discipline: 'bike',
			durationSec: 2700,
			distanceM: 30000,
		}),
	).toBe('45 min ride')
})

test('duration beats distance when both are present, and hours format humanely', () => {
	expect(
		deriveRecordingTitle({
			discipline: 'run',
			durationSec: 5400,
			distanceM: 18000,
		}),
	).toBe('1 h 30 min run')
})

test('distance names the recording when there is no duration', () => {
	expect(
		deriveRecordingTitle({
			discipline: 'run',
			durationSec: null,
			distanceM: 8200,
		}),
	).toBe('8.2 km run')
})

test('a recording with neither duration nor distance degrades to the discipline noun', () => {
	expect(
		deriveRecordingTitle({
			discipline: 'swim',
			durationSec: null,
			distanceM: null,
		}),
	).toBe('Swim')
})
