import { expect, test } from 'vitest'
import { GENERATION_CORPUS } from '#tests/fixtures/generation/corpus.ts'
import { prescribedDuration } from '../prescribed-duration.ts'
import { DETERMINISTIC_GENERATOR_ID } from './deterministic.ts'
import {
	DETERMINISTIC_SEASON_GENERATOR,
	generateSeason,
	type SeasonGenerator,
} from './generator.ts'
import { type RetrievableEntry } from './retrieval.ts'
import { type GeneratedSeason, type SeasonRequest } from './season.ts'

const REQUEST: SeasonRequest = {
	presetKey: 'masters-2-1-short',
	startWeekKey: '2026-01-05',
	eventWeekKey: '2026-03-30',
	tracks: [{ discipline: 'run', currency: 'km', anchorValue: 30 }],
	strengthDisciplines: ['strength'],
	trainableWeekdays: null,
	goalEvent: null,
	intent: 'first-season',
	weeklyCapacityHours: null,
	conversionContexts: {},
	thresholds: {},
}

test('the seam produces a payload through the deterministic implementation by default', () => {
	const season = generateSeason(REQUEST, [])
	expect(season.generatorId).toBe(DETERMINISTIC_GENERATOR_ID)
	expect(season.presetKey).toBe('masters-2-1-short')
	// The implementation behind the seam is the real one, not a stub: it produces
	// a whole season, and it declines the strength track by name.
	expect(season.weeks.length).toBeGreaterThan(0)
	expect(season.unavailable).toEqual([
		{ reading: 'strength-track', discipline: 'strength' },
	])
})

test('a second implementation is substitutable without touching any caller', () => {
	// What a model implementation will be, minus the model: the seam's contract is
	// a request and a corpus in, one typed payload out.
	const calls: Array<{ request: SeasonRequest; corpus: number }> = []
	const stub: SeasonGenerator = {
		id: 'stub',
		generate(request, corpus): GeneratedSeason {
			calls.push({ request, corpus: corpus.length })
			return {
				generatorId: 'stub',
				presetKey: request.presetKey,
				startWeekKey: request.startWeekKey,
				eventWeekKey: request.eventWeekKey,
				phases: [],
				tracks: request.tracks,
				capacity: { kind: 'unset' },
				placed: { kind: 'unset' },
				weeks: [],
				sessions: [],
				unfilled: [],
				unavailable: [],
				weekdaySource: 'default',
				levelFloor: 'beginner',
				goalEvent: null,
			}
		},
	}
	const corpus: RetrievableEntry[] = []
	expect(generateSeason(REQUEST, corpus, stub).generatorId).toBe('stub')
	expect(calls).toEqual([{ request: REQUEST, corpus: 0 }])
})

test('the shipped generator names itself', () => {
	expect(DETERMINISTIC_SEASON_GENERATOR.id).toBe(DETERMINISTIC_GENERATOR_ID)
})

// --- Placed Hours (#473, ADR 0110 §4, ADR 0112) ---

const RUN_THRESHOLDS: SeasonRequest['thresholds'] = {
	run: {
		lthr: null,
		maxHr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: 270,
		cssSecPer100m: null,
		zoneSystem: null,
		zoneOverrides: null,
	},
}

/** A 10k season with paces set, so the placed sessions can be timed. */
const TIMED: SeasonRequest = {
	...REQUEST,
	presetKey: 'classic-linear',
	eventWeekKey: '2026-05-11',
	goalEvent: '10k',
	intent: 'deliberately-building',
	thresholds: RUN_THRESHOLDS,
}

test('every placed session carries how long it takes, through the athlete’s thresholds', () => {
	const season = generateSeason(TIMED, GENERATION_CORPUS)
	expect(season.sessions.length).toBeGreaterThan(0)
	expect(season.sessions.some((s) => s.prescribed != null)).toBe(true)
	for (const placed of season.sessions) {
		const entry = GENERATION_CORPUS.find((e) => e.entryId === placed.entryId)!
		expect(placed.prescribed).toEqual(
			prescribedDuration(entry.blocks, {
				thresholds: RUN_THRESHOLDS,
				discipline: entry.discipline,
			}),
		)
	}
})

test('no placed session changes because of the Placed Hours reading (AC 8)', () => {
	// The same season with no capacity, a roomy one and one every week breaches:
	// the same sessions on the same days, the same rows, the same prescriptions.
	const without = generateSeason(TIMED, GENERATION_CORPUS)
	const roomy = generateSeason(
		{ ...TIMED, weeklyCapacityHours: 40 },
		GENERATION_CORPUS,
	)
	const tight = generateSeason(
		{ ...TIMED, weeklyCapacityHours: 0.5 },
		GENERATION_CORPUS,
	)
	expect(without.placed).toEqual({ kind: 'unset' })
	expect(roomy.placed).toMatchObject({ kind: 'read', breaches: [] })
	expect(tight.placed.kind === 'read' && tight.placed.breaches.length).toBe(1)
	expect(roomy.sessions).toEqual(without.sessions)
	expect(tight.sessions).toEqual(without.sessions)
	expect(tight.unfilled).toEqual(without.unfilled)
	// And the anchor is not lowered on the placed reading: with no conversion
	// contexts the Week Target cannot be read in hours, so nothing else moved it.
	expect(tight.tracks).toEqual(TIMED.tracks)
	expect(tight.weeks).toEqual(without.weeks)
})

test('the placed reading runs when the Week Target reading is unpriced (AC 9)', () => {
	// A km track with no conversion context cannot be read in hours, so the
	// capacity check does not run; the placed sessions still can be.
	const season = generateSeason(
		{ ...TIMED, weeklyCapacityHours: 2, conversionContexts: {} },
		GENERATION_CORPUS,
	)
	expect(season.capacity).toEqual({ kind: 'unpriced', weeklyCapacityHours: 2 })
	expect(season.placed.kind).toBe('read')
	if (season.placed.kind !== 'read') return
	expect(season.placed.weeks).toHaveLength(season.weeks.length)
	expect(season.placed.weeks.some((week) => week != null)).toBe(true)
	expect(season.placed.breaches.length).toBeGreaterThan(0)
})
