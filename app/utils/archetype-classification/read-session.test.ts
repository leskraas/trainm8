import { expect, test } from 'vitest'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import { readSessionArchetype, type ReadSessionInput } from './read-session.ts'

// ── The seam: a loader row in, one word out (ADR 0055) ───────────────────────
// This is where "the athlete's own statement wins" actually lives — §8.2's
// branch 0 is discharged by not calling the reader at all.

const RUNNER: DisciplineProfileForResolver = {
	lthr: 170,
	maxHr: 190,
	ftp: null,
	runPowerThresholdW: 280,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: null,
	zoneOverrides: null,
}

/** The shape a detection materializes: warm-up, `k ×` (work + float), cool-down. */
function detectedWorkout(
	repeatCount: number,
	workSec: number,
	watts: number,
	discipline = 'run',
) {
	return {
		discipline,
		archetype: null,
		blocks: [
			{
				orderIndex: 0,
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						orderIndex: 0,
						durationSec: 900,
						intensity: JSON.stringify({ kind: 'power', minW: 190 }),
					},
				],
			},
			{
				orderIndex: 1,
				repeatCount,
				steps: [
					{
						kind: 'cardio',
						orderIndex: 0,
						durationSec: workSec,
						intensity: JSON.stringify({ kind: 'power', minW: watts }),
					},
					{
						kind: 'cardio',
						orderIndex: 1,
						durationSec: 120,
						intensity: JSON.stringify({ kind: 'power', minW: 160 }),
					},
				],
			},
		],
	}
}

function input(overrides: Partial<ReadSessionInput> = {}): ReadSessionInput {
	return {
		workout: detectedWorkout(4, 480, 280),
		recording: { discipline: 'run', durationSec: 4200 },
		detectionGrade: 'high',
		profile: RUNNER,
		medianSessionSec28d: 3600,
		...overrides,
	}
}

test('a detected 4 × 8 min at threshold power reads as a threshold session', () => {
	// The demo this whole slice exists for: detection says `4 × 8 min at 280 W`
	// and the app can finally say *threshold session*.
	const view = readSessionArchetype(input())

	expect(view?.kind).toBe('read')
	if (view?.kind !== 'read') throw new Error('expected a reading')
	expect(view.reading.archetype).toBe('threshold')
	expect(view.reading.confidence).toBe('high')
})

test('an authored archetype wins outright and the reader is never consulted', () => {
	// A workout whose *geometry* reads as VO₂max, stated as a tempo session. The
	// statement stands: classification is for orphans, not for overruling a plan.
	const view = readSessionArchetype(
		input({
			workout: { ...detectedWorkout(5, 240, 340), archetype: 'tempo' },
		}),
	)

	expect(view).toEqual({ kind: 'stated', archetype: 'tempo' })
})

test('a stale or unknown stored value is not rendered as an archetype', () => {
	// Narrowed against the vocabulary, so a retired value shows nothing rather
	// than a raw slug — and falls through to a reading like any unstated session.
	const view = readSessionArchetype(
		input({
			workout: { ...detectedWorkout(4, 480, 280), archetype: 'sweet-spot' },
		}),
	)

	expect(view?.kind).toBe('read')
})

test('with no threshold on the channel the reading refuses, never defaults', () => {
	const view = readSessionArchetype(
		input({ profile: { ...RUNNER, runPowerThresholdW: null, ftp: null } }),
	)

	expect(view).toMatchObject({ kind: 'unread', refusal: 'no-zone' })
})

test('a recording-only session with no structure says there is nothing to read', () => {
	// No set, and neither an Intensity Factor nor a time-in-zone split is stored
	// anywhere yet — so the duration-and-intensity branches cannot fire, and the
	// reader says so rather than approximating.
	const view = readSessionArchetype(
		input({
			workout: null,
			recording: { discipline: 'run', durationSec: 2700 },
		}),
	)

	expect(view).toMatchObject({ kind: 'unread', refusal: 'no-signal' })
})

test('a strength session is never classified at all', () => {
	// ADR 0046/0047 put strength on its own axis with a **Strength Goal**, and
	// detection never runs for it either.
	const view = readSessionArchetype(
		input({
			workout: { ...detectedWorkout(4, 480, 280, 'strength'), archetype: null },
			recording: { discipline: 'strength', durationSec: 3600 },
		}),
	)

	expect(view).toBeNull()
})

test('a session with neither a prescription nor a recording has nothing to name', () => {
	const view = readSessionArchetype(input({ workout: null, recording: null }))

	expect(view).toBeNull()
})

test('a bike-then-run prescription with no break between them reads as a brick', () => {
	// The disciplines are laid out on the prescription's timeline, which is enough
	// to see the changeover — and honest about being a planned one.
	const view = readSessionArchetype(
		input({
			workout: {
				discipline: 'bike',
				archetype: null,
				blocks: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: [
							{
								kind: 'cardio',
								orderIndex: 0,
								durationSec: 3600,
								discipline: 'bike',
								intensity: JSON.stringify({ kind: 'zoneLabel', label: 'easy' }),
							},
							{
								kind: 'cardio',
								orderIndex: 1,
								durationSec: 1800,
								discipline: 'run',
								intensity: JSON.stringify({ kind: 'zoneLabel', label: 'easy' }),
							},
						],
					},
				],
			},
			recording: { discipline: 'bike', durationSec: 5400 },
		}),
	)

	expect(view?.kind).toBe('read')
	if (view?.kind !== 'read') throw new Error('expected a reading')
	expect(view.reading.archetype).toBe('brick')
})

test('a missing detection grade caps the reading at low rather than assuming high', () => {
	const view = readSessionArchetype(input({ detectionGrade: null }))

	expect(view?.kind).toBe('read')
	if (view?.kind !== 'read') throw new Error('expected a reading')
	expect(view.reading.confidence).toBe('low')
})
