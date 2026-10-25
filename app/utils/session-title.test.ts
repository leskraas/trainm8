import { expect, test } from 'vitest'
import {
	deriveRecordingTitle,
	deriveWorkoutTitle,
	stampedSessionTitle,
} from './session-title.ts'
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

test('a block repeated in series reads with its series (#615)', () => {
	const s = structure([
		{
			repeatCount: 13,
			seriesRepeatCount: 3,
			betweenSeriesRestSec: 360,
			steps: [cardio({ durationSec: 30, intensity: power }), rest(15)],
		},
	])
	expect(deriveWorkoutTitle(s)).toBe('3 × 13 × 30 s')
})

test('a block repeated only in series reads with its series', () => {
	const s = structure([
		{ repeatCount: 1, steps: [cardio({ durationSec: 900, intensity: pace })] },
		{
			repeatCount: 1,
			seriesRepeatCount: 3,
			steps: [cardio({ durationSec: 600, intensity: power }), rest(180)],
		},
	])
	expect(deriveWorkoutTitle(s)).toBe('3 × 10 min')
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
	expect(deriveWorkoutTitle(s)).toBe('4 × 6 min terskel')
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
	expect(deriveWorkoutTitle(s)).toBe('45 min rolig')
})

test('a percentage target writes its zone word, never a Z-code', () => {
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
	// 95–105 % FTP is zone 4 on the shared mapping, written as its word.
	expect(deriveWorkoutTitle(s)).toBe('30 min terskel')
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

test('a repeat block that can name nothing does not shadow a later namable block', () => {
	// First block: a repeat set whose measured work step has no duration/distance,
	// so it contributes neither a quantity nor an honest zone word. The steady
	// second block can name the session, so it wins rather than "Run".
	const s = structure([
		{ repeatCount: 4, steps: [cardio({ intensity: power }), rest(120)] },
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
	expect(deriveWorkoutTitle(s)).toBe('45 min rolig')
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
	// left dangling; the honest zone word still names it. A title starts with a
	// capital, so the word that leads it is capitalised — only there: mid-title
	// it stays lowercase (`45 min rolig`).
	expect(deriveWorkoutTitle(s)).toBe('Terskel')
})

test('a recipe code keeps its spelling; a stored word stays lowercase', () => {
	const titled = (label: string) =>
		deriveWorkoutTitle(
			structure([
				{
					repeatCount: 1,
					steps: [
						cardio({
							durationSec: 2700,
							intensity: { kind: 'zoneLabel', label },
						}),
					],
				},
			]),
		)
	expect(titled('Z4')).toBe('45 min Z4')
	expect(titled('T')).toBe('45 min T')
	expect(titled('rolig')).toBe('45 min rolig')
	expect(titled('I-3')).toBe('45 min I-3')
	expect(titled('sub-T')).toBe('45 min sub-T')
	// A word typed with a capital is still a word, not a code.
	expect(titled('Rolig')).toBe('45 min rolig')
	expect(titled('Terskel')).toBe('45 min terskel')
	expect(titled('Tempo')).toBe('45 min tempo')
})

test('a recipe code that leads the title keeps its spelling', () => {
	// A step with no quantity is titled by its zone alone; the capital a title
	// starts with is for a word (`Terskel`), never for a code (`sub-T`).
	const s = structure([
		{
			repeatCount: 1,
			steps: [cardio({ intensity: { kind: 'zoneLabel', label: 'sub-T' } })],
		},
	])
	expect(deriveWorkoutTitle(s)).toBe('sub-T')
})

test('an RPE target writes its zone word', () => {
	const s = structure([
		{
			repeatCount: 1,
			steps: [
				cardio({ durationSec: 2700, intensity: { kind: 'rpe', min: 3 } }),
			],
		},
	])
	expect(deriveWorkoutTitle(s)).toBe('45 min rolig')
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

// Round 2 (#505 story 68): a session the plan lays is named for what it is,
// in Norwegian, and the same words the first run's preview showed — never
// its duration ("54 min", "1 h 48 min"), which every surface shows anyway.
test.each([
	[{ discipline: 'run', role: 'ordinary', zone: null }, 'Rolig økt · Løping'],
	[{ discipline: 'run', role: 'long', zone: null }, 'Langtur · Løping'],
	[{ discipline: 'bike', role: 'long', zone: null }, 'Langtur · Sykling'],
	[{ discipline: 'swim', role: 'long', zone: null }, 'Lang økt · Svømming'],
	[{ discipline: 'run', role: 'ordinary', zone: 3 }, 'Tempoøkt · Løping'],
	[{ discipline: 'bike', role: 'ordinary', zone: 4 }, 'Terskeløkt · Sykling'],
	[{ discipline: 'run', role: 'ordinary', zone: 5 }, 'Intervalløkt · Løping'],
] as const)('a laid session reads %o as %s', (session, title) => {
	expect(stampedSessionTitle(session)).toBe(title)
})
