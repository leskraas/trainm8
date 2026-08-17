import { expect, test } from 'vitest'
import {
	MIN_HR_ACTIVITIES,
	TANAKA_INTERCEPT,
	TANAKA_SLOPE,
} from './constants.ts'
import {
	ageAt,
	type AnalysisActivity,
	type AnalysisInput,
	estimateProfile,
} from './estimate.ts'
import { type SampledChannel } from './mean-maximal.ts'
import { type ThresholdConstruct, type ThresholdEstimate } from './types.ts'

// ── Profile Analysis, end to end over the pure engine ────────────────────────
// Every rung either produces a number with its provenance or states why it
// could not. Nothing degrades to a plausible-looking default.

const NOW = new Date('2026-08-13T12:00:00Z')

function pick(
	estimates: ThresholdEstimate[],
	discipline: string,
	construct: ThresholdConstruct,
) {
	const found = estimates.find(
		(estimate) =>
			estimate.discipline === discipline && estimate.construct === construct,
	)
	if (!found) throw new Error(`no rung for ${discipline}/${construct}`)
	return found
}

function input(overrides: Partial<AnalysisInput> = {}): AnalysisInput {
	return { now: NOW, birthdate: null, activities: [], ...overrides }
}

/** A power channel holding `watts` for `durationSec`, on a 5 s grid. */
function powerFor(watts: number, durationSec: number): SampledChannel {
	const count = Math.round(durationSec / 5)
	return {
		resolutionSec: 5,
		samples: Array.from({ length: count }, () => watts),
	}
}

/**
 * A ride whose whole duration sits at one wattage. Several of these at
 * decreasing wattage and increasing duration trace the model's own curve.
 */
function ride(
	id: string,
	watts: number,
	durationSec: number,
	daysAgo: number,
): AnalysisActivity {
	return {
		id,
		discipline: 'bike',
		occurredAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
		hrMax: null,
		power: powerFor(watts, durationSec),
		speedMps: null,
	}
}

/** Rides that lie on `P(t) = CP + W′/t` for the given parameters. */
function ridesOnModel(cpW: number, wPrimeJ: number): AnalysisActivity[] {
	return [120, 300, 600, 1200].map((durationSec, i) =>
		ride(`ride-${i}`, cpW + wPrimeJ / durationSec, durationSec, (i + 1) * 3),
	)
}

// ── Max HR ───────────────────────────────────────────────────────────────────

test('with no history and no birthdate, max HR refuses and says which is missing', () => {
	const estimates = estimateProfile(input())
	expect(pick(estimates, 'run', 'maxHr')).toMatchObject({
		kind: 'refusal',
		refusal: 'no-birthdate',
	})
})

test('a birthdate alone yields Tanaka, pinned at low confidence', () => {
	const estimates = estimateProfile(
		input({ birthdate: new Date('1986-01-01T00:00:00Z') }),
	)
	const maxHr = pick(estimates, 'bike', 'maxHr')
	expect(maxHr).toMatchObject({
		kind: 'estimate',
		protocol: 'tanaka',
		confidence: 'low',
	})
	if (maxHr.kind !== 'estimate') return
	expect(maxHr.value).toBe(Math.round(TANAKA_INTERCEPT - TANAKA_SLOPE * 40))
})

test('an observed maximum beats the age formula once there is enough of it', () => {
	const activities = Array.from({ length: MIN_HR_ACTIVITIES }, (_, i) => ({
		id: `run-${i}`,
		discipline: 'run' as const,
		occurredAt: new Date(NOW.getTime() - i * 86_400_000),
		hrMax: 180 + i,
		power: null,
		speedMps: null,
	}))
	const estimates = estimateProfile(
		input({ activities, birthdate: new Date('1986-01-01T00:00:00Z') }),
	)
	const maxHr = pick(estimates, 'run', 'maxHr')
	expect(maxHr).toMatchObject({ kind: 'estimate', protocol: 'observed' })
	if (maxHr.kind !== 'estimate') return
	// The 95th percentile of five maxima is the top one — but the mechanism is
	// a percentile, which is what the spike test below actually exercises.
	expect(maxHr.value).toBe(184)
})

test('a single strap spike does not become the athlete max HR', () => {
	// Nineteen honest readings and one 228 bpm cross-talk artefact. A global
	// maximum would set the whole zone ladder from the artefact.
	const activities = Array.from({ length: 20 }, (_, i) => ({
		id: `run-${i}`,
		discipline: 'run' as const,
		occurredAt: new Date(NOW.getTime() - i * 86_400_000),
		hrMax: i === 0 ? 228 : 180,
		power: null,
		speedMps: null,
	}))
	const maxHr = pick(estimateProfile(input({ activities })), 'run', 'maxHr')
	if (maxHr.kind !== 'estimate') throw new Error('expected an estimate')
	expect(maxHr.value).toBe(180)
})

test('too few HR activities falls back rather than reading one ride as a maximum', () => {
	const activities = Array.from({ length: MIN_HR_ACTIVITIES - 1 }, (_, i) => ({
		id: `run-${i}`,
		discipline: 'run' as const,
		occurredAt: NOW,
		hrMax: 190,
		power: null,
		speedMps: null,
	}))
	const estimates = estimateProfile(
		input({ activities, birthdate: new Date('1986-01-01T00:00:00Z') }),
	)
	expect(pick(estimates, 'run', 'maxHr')).toMatchObject({ protocol: 'tanaka' })
})

test('an implausible HR reading is discarded before it can be a maximum', () => {
	const activities = Array.from({ length: MIN_HR_ACTIVITIES + 1 }, (_, i) => ({
		id: `run-${i}`,
		discipline: 'run' as const,
		occurredAt: NOW,
		hrMax: i === 0 ? 250 : 175,
		power: null,
		speedMps: null,
	}))
	const maxHr = pick(estimateProfile(input({ activities })), 'run', 'maxHr')
	if (maxHr.kind !== 'estimate') throw new Error('expected an estimate')
	expect(maxHr.value).toBe(175)
})

// ── Critical power ───────────────────────────────────────────────────────────

test('a bike history on the model recovers a critical power, marked as one', () => {
	const estimates = estimateProfile(
		input({ activities: ridesOnModel(250, 20_000) }),
	)
	const cp = pick(estimates, 'bike', 'cp')
	expect(cp).toMatchObject({
		kind: 'estimate',
		construct: 'cp',
		protocol: 'cp-fit',
	})
	if (cp.kind !== 'estimate') return
	expect(cp.value).toBeGreaterThan(240)
	expect(cp.value).toBeLessThan(260)
	// The construct is `cp` and never `ftp`: the two are different quantities and
	// nothing in this module converts one to the other.
	expect(cp.construct).not.toBe('ftp')
})

test('W′ is carried for the derivation and never offered as a threshold', () => {
	const estimates = estimateProfile(
		input({ activities: ridesOnModel(250, 20_000) }),
	)
	const cp = pick(estimates, 'bike', 'cp')
	if (cp.kind !== 'estimate') throw new Error('expected an estimate')
	expect(cp.companion?.label).toBe('W′')
	// It is not a second estimate anyone could accept.
	expect(
		estimates.some((estimate) => estimate.construct === ('wPrime' as never)),
	).toBe(false)
})

test('a history of one ride is refused rather than fitted', () => {
	const estimates = estimateProfile(
		input({ activities: [ride('one', 300, 1200, 2)] }),
	)
	expect(pick(estimates, 'bike', 'cp')).toMatchObject({ kind: 'refusal' })
})

test('rides too long to read short efforts from refuse for resolution, not for effort', () => {
	// A 5 h ride lands on a 19 s grid, so every window in the fit band is under
	// the sample floor. The athlete did the efforts; the storage cannot see them.
	const coarse: AnalysisActivity[] = [1, 2, 3].map((i) => ({
		id: `long-${i}`,
		discipline: 'bike',
		occurredAt: new Date(NOW.getTime() - i * 86_400_000),
		hrMax: null,
		power: {
			resolutionSec: 200,
			samples: Array.from({ length: 90 }, () => 200),
		},
		speedMps: null,
	}))
	const cp = pick(estimateProfile(input({ activities: coarse })), 'bike', 'cp')
	expect(cp).toMatchObject({ kind: 'refusal', refusal: 'resolution' })
	if (cp.kind !== 'refusal') return
	// And it names the durations it could not read, rather than dropping them.
	expect(cp.basis.durationsRefusedSec.length).toBeGreaterThan(0)
})

test('no power anywhere is a data refusal, not a coarseness one', () => {
	const activities: AnalysisActivity[] = [
		{
			id: 'hr-only',
			discipline: 'bike',
			occurredAt: NOW,
			hrMax: 175,
			power: null,
			speedMps: null,
		},
	]
	expect(
		pick(estimateProfile(input({ activities })), 'bike', 'cp'),
	).toMatchObject({
		kind: 'refusal',
		refusal: 'no-data',
	})
})

// ── Critical speed ───────────────────────────────────────────────────────────

test('a run history yields a critical speed in seconds per km', () => {
	// 4:00/km is 1000/240 ≈ 4.167 m/s. Trace the model in speed.
	const cs = 4.0
	const dPrime = 200
	const activities: AnalysisActivity[] = [120, 300, 600, 1200].map(
		(durationSec, i) => {
			const speed = cs + dPrime / durationSec
			const count = Math.round(durationSec / 5)
			return {
				id: `run-${i}`,
				discipline: 'run' as const,
				occurredAt: new Date(NOW.getTime() - (i + 1) * 3 * 86_400_000),
				hrMax: null,
				power: null,
				speedMps: {
					resolutionSec: 5,
					samples: Array.from({ length: count }, () => speed),
				},
			}
		},
	)
	const estimate = pick(
		estimateProfile(input({ activities })),
		'run',
		'criticalSpeed',
	)
	expect(estimate).toMatchObject({
		kind: 'estimate',
		construct: 'criticalSpeed',
	})
	if (estimate.kind !== 'estimate') return
	// 4.0 m/s is 250 s/km.
	expect(estimate.value).toBeGreaterThan(245)
	expect(estimate.value).toBeLessThan(255)
})

// ── Refusals that are permanent, and stated as such ──────────────────────────

test('swim CSS says it is not built rather than averaging a whole swim', () => {
	expect(pick(estimateProfile(input()), 'swim', 'css')).toMatchObject({
		kind: 'refusal',
		refusal: 'unbuilt',
	})
})

test('every discipline gets an answer, so nothing is silently missing', () => {
	const estimates = estimateProfile(input())
	for (const discipline of ['run', 'bike', 'swim']) {
		expect(
			estimates.filter((estimate) => estimate.discipline === discipline).length,
		).toBeGreaterThan(0)
	}
})

// ── Purity ───────────────────────────────────────────────────────────────────

test('the engine reads no clock — the same input twice gives the same answer', () => {
	const activities = ridesOnModel(250, 20_000)
	const first = estimateProfile(input({ activities }))
	const second = estimateProfile(input({ activities }))
	expect(JSON.stringify(second)).toEqual(JSON.stringify(first))
})

test('the engine does not mutate its input', () => {
	const activities = ridesOnModel(250, 20_000)
	const before = JSON.stringify(activities)
	estimateProfile(input({ activities }))
	expect(JSON.stringify(activities)).toEqual(before)
})

// ── Age ──────────────────────────────────────────────────────────────────────

test('age is whole years, and a birthday later this year has not happened yet', () => {
	expect(ageAt(new Date('1986-08-12T00:00:00Z'), NOW)).toBe(40)
	expect(ageAt(new Date('1986-08-14T00:00:00Z'), NOW)).toBe(39)
})

test('an age outside the regression band is refused rather than extrapolated', () => {
	expect(ageAt(new Date('1900-01-01T00:00:00Z'), NOW)).toBeNull()
	expect(ageAt(new Date('2025-01-01T00:00:00Z'), NOW)).toBeNull()
	expect(ageAt(null, NOW)).toBeNull()
})
