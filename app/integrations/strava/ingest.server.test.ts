import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { ingestActivityStreams, stravaLapsToMarkers } from './ingest.server.ts'
import { StravaActivitySchema, StravaLapsSchema } from './types.ts'

/**
 * Fixture-level tests for the Strava lap → engine-marker mapping (#356). The
 * live `GET /activities/{id}/laps` call can't be exercised in CI; these parse a
 * realistic laps payload through the wire schema and assert the neutral
 * `{ startSec, endSec }` edges the lap-edged detection path consumes.
 */

test('maps per-rep laps to marker edges on the raw stream axis via indices', () => {
	// Elapsed-second axis of the raw ~1 Hz stream the laps index into.
	const time = Array.from({ length: 241 }, (_, i) => i)
	const laps = StravaLapsSchema.parse([
		{ lap_index: 1, start_index: 0, end_index: 45, elapsed_time: 45 },
		{ lap_index: 2, start_index: 46, end_index: 60, elapsed_time: 15 },
		{ lap_index: 3, start_index: 61, end_index: 106, elapsed_time: 45 },
		{ lap_index: 4, start_index: 107, end_index: 121, elapsed_time: 15 },
	])

	expect(stravaLapsToMarkers(laps, { time })).toEqual([
		{ startSec: 0, endSec: 45 },
		{ startSec: 46, endSec: 60 },
		{ startSec: 61, endSec: 106 },
		{ startSec: 107, endSec: 121 },
	])
})

test('a single whole-activity lap is "no laps pressed" and yields nothing', () => {
	const time = Array.from({ length: 3600 }, (_, i) => i)
	const laps = StravaLapsSchema.parse([
		{ lap_index: 1, start_index: 0, end_index: 3599, elapsed_time: 3600 },
	])
	expect(stravaLapsToMarkers(laps, { time })).toEqual([])
})

test('falls back to the start_date offset when a backfill has no raw stream', () => {
	const activityStartMs = Date.parse('2026-05-01T10:00:00Z')
	const laps = StravaLapsSchema.parse([
		{
			lap_index: 1,
			start_date: '2026-05-01T10:00:00Z',
			elapsed_time: 45,
			start_index: 0,
			end_index: 45,
		},
		{
			lap_index: 2,
			start_date: '2026-05-01T10:00:45Z',
			elapsed_time: 15,
			start_index: 46,
			end_index: 60,
		},
	])

	// No `time` axis supplied → the wall-clock offset path is used.
	expect(stravaLapsToMarkers(laps, { activityStartMs })).toEqual([
		{ startSec: 0, endSec: 45 },
		{ startSec: 45, endSec: 60 },
	])
})

test('drops laps that resolve via neither indices nor a start_date offset', () => {
	// Index-less and date-less laps carry no trustworthy edge: rather than guess a
	// contiguous position, they are dropped (stream-only detection).
	const laps = StravaLapsSchema.parse([
		{ lap_index: 1, elapsed_time: 45 },
		{ lap_index: 2, elapsed_time: 15 },
		{ lap_index: 3, elapsed_time: 45 },
	])
	expect(stravaLapsToMarkers(laps, {})).toEqual([])
})

test('drops laps without a positive span', () => {
	const time = Array.from({ length: 100 }, (_, i) => i)
	const laps = StravaLapsSchema.parse([
		{ lap_index: 1, start_index: 0, end_index: 40, elapsed_time: 40 },
		// Zero-length lap (same index) — dropped.
		{ lap_index: 2, start_index: 41, end_index: 41, elapsed_time: 0 },
		{ lap_index: 3, start_index: 42, end_index: 80, elapsed_time: 38 },
	])
	expect(stravaLapsToMarkers(laps, { time })).toEqual([
		{ startSec: 0, endSec: 40 },
		{ startSec: 42, endSec: 80 },
	])
})

test('out-of-range indices fall through to the start_date offset', () => {
	// `time` shorter than the indices claim (truncated/partial stream): the index
	// path is rejected and the wall-clock offset takes over.
	const time = [0, 1, 2]
	const activityStartMs = Date.parse('2026-05-01T10:00:00Z')
	const laps = StravaLapsSchema.parse([
		{
			lap_index: 1,
			start_index: 0,
			end_index: 45,
			elapsed_time: 45,
			start_date: '2026-05-01T10:00:00Z',
		},
		{
			lap_index: 2,
			start_index: 46,
			end_index: 60,
			elapsed_time: 15,
			start_date: '2026-05-01T10:00:45Z',
		},
	])
	expect(stravaLapsToMarkers(laps, { time, activityStartMs })).toEqual([
		{ startSec: 0, endSec: 45 },
		{ startSec: 45, endSec: 60 },
	])
})

// ── the forward ingest path (#356) ──────────────────────────────────────────
// `ingestActivityStreams` piggybacks lap ingest onto the per-activity streams
// fetch, persisting `lapsJson` before the stream so any detection reads the
// ground-truth edges on the first compute. This exercises the index-based
// mapping end to end — the accurate path a live sync uses.

test('the forward streams loop persists index-mapped provider laps', async () => {
	const user = await prisma.user.create({
		select: { id: true },
		data: { ...createUser() },
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'initial_access',
			refreshToken: 'initial_refresh',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	const activity = StravaActivitySchema.parse({
		id: 90042,
		sport_type: 'Run',
		type: 'Run',
		distance: 800,
		moving_time: 120,
		elapsed_time: 120,
		start_date: '2026-05-21T11:00:00Z',
	})
	await prisma.activityImport.create({
		data: {
			athleteId: user.id,
			externalProvider: 'strava',
			externalId: '90042',
			startedAt: new Date('2026-05-21T11:00:00.000Z'),
			endedAt: new Date('2026-05-21T11:02:00.000Z'),
			durationSec: 120,
			discipline: 'run',
			rawJson: '{}',
		},
	})

	// A 121-sample raw axis plus a 45/15 lap breakdown indexing into it.
	const time = Array.from({ length: 121 }, (_, i) => i)
	const heartrate = time.map((t) => (t % 60 < 45 ? 170 : 120))
	server.use(
		http.get('https://www.strava.com/api/v3/activities/:id/streams', () =>
			HttpResponse.json({
				time: { data: time },
				heartrate: { data: heartrate },
			}),
		),
		http.get('https://www.strava.com/api/v3/activities/:id/laps', () =>
			HttpResponse.json([
				{ lap_index: 1, start_index: 0, end_index: 45, elapsed_time: 45 },
				{ lap_index: 2, start_index: 46, end_index: 60, elapsed_time: 15 },
				{ lap_index: 3, start_index: 61, end_index: 106, elapsed_time: 45 },
				{ lap_index: 4, start_index: 107, end_index: 120, elapsed_time: 14 },
			]),
		),
	)

	await ingestActivityStreams(connection, [activity])

	const imp = await prisma.activityImport.findUniqueOrThrow({
		where: {
			externalProvider_externalId: {
				externalProvider: 'strava',
				externalId: '90042',
			},
		},
		select: { lapsJson: true, stream: { select: { id: true } } },
	})
	expect(imp.stream).not.toBeNull()
	expect(JSON.parse(imp.lapsJson!)).toEqual([
		{ startSec: 0, endSec: 45 },
		{ startSec: 46, endSec: 60 },
		{ startSec: 61, endSec: 106 },
		{ startSec: 107, endSec: 120 },
	])
})
