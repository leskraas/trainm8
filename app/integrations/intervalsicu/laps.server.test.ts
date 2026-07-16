import { expect, test } from 'vitest'
import { intervalsIcuIntervalsToMarkers } from './ingest.server.ts'
import { IntervalsIcuIntervalsSchema } from './types.ts'

/**
 * Fixture-level tests for the Intervals.icu interval → engine-marker mapping
 * (#356). The live `GET /activity/{id}/intervals` call can't be exercised in
 * CI; these parse a realistic `IntervalsDTO` body through the wire schema and
 * assert the neutral `{ startSec, endSec }` edges the lap-edged path consumes.
 */

test('maps icu_intervals start/end times straight onto marker edges', () => {
	const dto = IntervalsIcuIntervalsSchema.parse({
		id: 'i123',
		analyzed: true,
		icu_intervals: [
			{ type: 'WORK', start_time: 0, end_time: 45, start_index: 0, end_index: 45 },
			{ type: 'RECOVERY', start_time: 45, end_time: 60 },
			{ type: 'WORK', start_time: 60, end_time: 105 },
			{ type: 'RECOVERY', start_time: 105, end_time: 120 },
		],
	})

	expect(intervalsIcuIntervalsToMarkers(dto.icu_intervals!)).toEqual([
		{ startSec: 0, endSec: 45 },
		{ startSec: 45, endSec: 60 },
		{ startSec: 60, endSec: 105 },
		{ startSec: 105, endSec: 120 },
	])
})

test('drops intervals without a positive span or with missing bounds', () => {
	const dto = IntervalsIcuIntervalsSchema.parse({
		icu_intervals: [
			{ type: 'WORK', start_time: 0, end_time: 240 },
			// Zero-length — dropped.
			{ type: 'RECOVERY', start_time: 240, end_time: 240 },
			// Missing end_time — dropped.
			{ type: 'WORK', start_time: 300 },
			{ type: 'RECOVERY', start_time: 300, end_time: 420 },
		],
	})

	expect(intervalsIcuIntervalsToMarkers(dto.icu_intervals!)).toEqual([
		{ startSec: 0, endSec: 240 },
		{ startSec: 300, endSec: 420 },
	])
})

test('an empty or absent breakdown yields no markers', () => {
	const empty = IntervalsIcuIntervalsSchema.parse({ icu_intervals: [] })
	expect(intervalsIcuIntervalsToMarkers(empty.icu_intervals!)).toEqual([])

	const absent = IntervalsIcuIntervalsSchema.parse({ id: 'i9', analyzed: false })
	expect(intervalsIcuIntervalsToMarkers(absent.icu_intervals ?? [])).toEqual([])
})
