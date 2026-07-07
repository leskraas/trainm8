import { expect, test } from 'vitest'
import { mapActivityToImportInput } from './ingest.server.ts'
import { IntervalsIcuActivitySchema } from './types.ts'

test('maps a metric-rich ride onto the provider-neutral import shape', () => {
	const activity = IntervalsIcuActivitySchema.parse({
		id: 'i2002',
		name: 'Lunch Ride',
		type: 'Ride',
		distance: 40000,
		moving_time: 4800,
		elapsed_time: 5000,
		start_date: '2026-05-21T11:00:00Z',
		average_heartrate: 141,
		max_heartrate: 172,
		icu_average_watts: 210,
		max_watts: 540,
		icu_weighted_avg_watts: 235,
		average_cadence: 88,
		max_speed: 14.2,
		total_elevation_gain: 410,
		icu_joules: 1008000,
	})

	const input = mapActivityToImportInput(activity)

	expect(input).toMatchObject({
		externalProvider: 'intervalsicu',
		externalId: 'i2002',
		discipline: 'bike',
		durationSec: 4800,
		distanceM: 40000,
		hrAvg: 141,
		hrMax: 172,
		powerAvg: 210,
		powerMax: 540,
		powerWeightedAvg: 235,
		cadenceAvg: 88,
		speedMaxMps: 14.2,
		elevationGainM: 410,
		kilojoules: 1008,
	})
	expect(input.startedAt.toISOString()).toBe('2026-05-21T11:00:00.000Z')
	// endedAt from elapsed time (5000s), not moving time.
	expect(input.endedAt.toISOString()).toBe('2026-05-21T12:23:20.000Z')
	// Pace derived from moving time over distance: 4800s / 40km = 120 s/km.
	expect(input.paceAvgSecPerKm).toBe(120)
})

test('a metric-sparse activity maps with absent metrics as null, never fabricated', () => {
	const activity = IntervalsIcuActivitySchema.parse({
		id: 'i3001',
		type: 'WeightTraining',
		moving_time: 2700,
		start_date: '2026-06-01T18:00:00Z',
	})

	const input = mapActivityToImportInput(activity)

	expect(input).toMatchObject({
		externalProvider: 'intervalsicu',
		externalId: 'i3001',
		discipline: 'strength',
		durationSec: 2700,
		distanceM: null,
		hrAvg: null,
		hrMax: null,
		powerAvg: null,
		powerMax: null,
		powerWeightedAvg: null,
		cadenceAvg: null,
		paceAvgSecPerKm: null,
		speedMaxMps: null,
		elevationGainM: null,
		kilojoules: null,
		polyline: null,
	})
	// No elapsed_time: the end falls back to start + moving_time.
	expect(input.endedAt.getTime() - input.startedAt.getTime()).toBe(2700 * 1000)
})

test("Intervals.icu's computed load numbers survive only in the raw snapshot, never as modeled fields", () => {
	const activity = IntervalsIcuActivitySchema.parse({
		id: 'i3002',
		type: 'Run',
		moving_time: 3000,
		start_date: '2026-06-02T06:00:00Z',
		icu_training_load: 87,
		icu_ctl: 54.2,
		icu_atl: 61.9,
	})

	const input = mapActivityToImportInput(activity)

	// The full payload is snapshot for provenance…
	expect(JSON.parse(input.rawJson)).toMatchObject({ icu_training_load: 87 })
	// …but no modeled field carries a source-computed load number: TSS and
	// Training Load are earned downstream from the activity's own data.
	const { rawJson: _rawJson, ...modeled } = input
	expect(JSON.stringify(modeled)).not.toContain('87')
	expect(JSON.stringify(modeled)).not.toContain('54.2')
	expect(JSON.stringify(modeled)).not.toContain('61.9')
})

test('an unmodeled type maps to the "other" discipline', () => {
	const activity = IntervalsIcuActivitySchema.parse({
		id: 'i3003',
		type: 'Yoga',
		moving_time: 3600,
		start_date: '2026-06-03T19:00:00Z',
	})

	expect(mapActivityToImportInput(activity).discipline).toBe('other')
})
