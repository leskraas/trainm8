import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { parseStoredStream } from '#app/utils/activity-stream.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getSessionByIdForUser } from '#app/utils/training.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { syncStravaActivities } from './sync.server.ts'

const ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities'
const STREAMS_URL = 'https://www.strava.com/api/v3/activities/:id/streams'
const TOKEN_URL = 'https://www.strava.com/oauth/token'

async function setupConnection(
	overrides: Partial<{
		accessToken: string
		refreshToken: string
		expiresAt: Date
		status: string
		lastSyncedAt: Date | null
	}> = {},
) {
	const user = await prisma.user.create({
		data: { ...createUser() },
		select: { id: true },
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: overrides.accessToken ?? 'initial_access',
			refreshToken: overrides.refreshToken ?? 'initial_refresh',
			expiresAt:
				overrides.expiresAt ?? new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: overrides.status ?? 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
			lastSyncedAt: overrides.lastSyncedAt ?? null,
		},
	})
	return { user, connection }
}

async function createRunWorkout(userId: string) {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
		},
	})
}

test('happy path: imports activities across disciplines including "other"', async () => {
	const { user, connection } = await setupConnection()

	const result = await syncStravaActivities(user.id)

	invariant(result.ok, 'expected a successful sync')
	expect(result.created).toBe(4)

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
		orderBy: { externalId: 'asc' },
	})
	expect(imports).toHaveLength(4)
	expect(imports.map((i) => i.discipline).sort()).toEqual([
		'bike',
		'other',
		'run',
		'swim',
	])
	expect(imports.every((i) => i.externalProvider === 'strava')).toBe(true)

	// Field mapping for the run: 10km in 3000s → 300 s/km pace.
	const run = imports.find((i) => i.discipline === 'run')!
	expect(run.distanceM).toBe(10000)
	expect(run.durationSec).toBe(3000)
	expect(run.paceAvgSecPerKm).toBe(300)
	expect(run.hrAvg).toBe(150)
	expect(run.hrMax).toBe(178)
	expect(run.cadenceAvg).toBe(86)
	expect(run.elevationGainM).toBe(120)
	expect(run.speedMaxMps).toBe(4.8)
	expect(run.polyline).toBe('abc')

	// Cycling power metrics, including weighted-average ("normalized") power.
	const ride = imports.find((i) => i.discipline === 'bike')!
	expect(ride.powerAvg).toBe(210)
	expect(ride.powerMax).toBe(540)
	expect(ride.powerWeightedAvg).toBe(235)
	expect(ride.kilojoules).toBe(1008)

	// rawJson is lossless: fields we don't model survive verbatim (#data-loss fix).
	const runRaw = JSON.parse(run.rawJson) as { kudos_count?: number }
	expect(runRaw.kudos_count).toBe(7)

	// lastSyncedAt advances on success.
	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.lastSyncedAt).not.toBeNull()
})

test('derives HR phase bars for recordings when the athlete has a threshold', async () => {
	const { user } = await setupConnection()
	// Give the athlete a run threshold HR so HR can be bucketed into zones.
	await prisma.athleteProfile.create({
		data: {
			userId: user.id,
			disciplineProfiles: { create: { discipline: 'run', lthr: 168 } },
		},
	})

	await syncStravaActivities(user.id)

	const run = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'run' },
	})
	invariant(run?.phaseBarsJson, 'expected phase bars on the run recording')
	const bars = JSON.parse(run.phaseBarsJson) as Array<{
		zone: number | null
		durationSec: number
	}>
	expect(bars.length).toBeGreaterThan(0)
	expect(bars.some((b) => b.zone === 4)).toBe(true) // the hard middle segment

	// A discipline with no configured threshold (bike) gets no phase bars.
	const ride = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'bike' },
	})
	expect(ride?.phaseBarsJson).toBeNull()
})

test('ingests an Activity Stream for each modeled recording, never for "other"', async () => {
	const { user } = await setupConnection()

	// Default mocks: four activities (run/bike/swim/hike) and a 900s HR streams
	// payload returned for every activity id.
	await syncStravaActivities(user.id)

	// One stream per modeled recording (run, bike, swim); the hike is 'other'.
	const streams = await prisma.activityStream.findMany({
		where: { activityImport: { athleteId: user.id } },
	})
	expect(streams).toHaveLength(3)

	const other = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'other' },
		select: { stream: { select: { id: true } } },
	})
	expect(other!.stream).toBeNull()

	// The run's stream is downsampled (≥ the 5s floor, bounded sample count) and
	// carries the heart-rate channel from the streams payload.
	const run = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'run' },
		select: { id: true },
	})
	const runStream = await prisma.activityStream.findUnique({
		where: { activityImportId: run!.id },
	})
	invariant(runStream, 'expected a stream on the run recording')
	expect(runStream.resolutionSec).toBeGreaterThanOrEqual(5)
	expect(runStream.sampleCount).toBeLessThanOrEqual(1000)
	const parsed = parseStoredStream(runStream)
	invariant(parsed, 'expected a parseable read-time stream')
	expect(parsed.heartrate).toBeDefined()
	expect(parsed.heartrate!).toHaveLength(runStream.sampleCount)
})

test('ingests exactly one stream with power, HR, and pace channels when present', async () => {
	const { user } = await setupConnection()
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json([
				{
					id: 3001,
					sport_type: 'Run',
					type: 'Run',
					distance: 5000,
					moving_time: 1500,
					elapsed_time: 1500,
					start_date: '2026-05-20T06:00:00Z',
				},
			]),
		),
		http.get(STREAMS_URL, () => {
			const time: number[] = []
			const heartrate: number[] = []
			const watts: number[] = []
			const velocity_smooth: number[] = []
			for (let t = 0; t <= 60; t++) {
				time.push(t)
				heartrate.push(140)
				watts.push(200)
				velocity_smooth.push(2.5) // 2.5 m/s → 400 s/km pace
			}
			return HttpResponse.json({
				time: { data: time },
				heartrate: { data: heartrate },
				watts: { data: watts },
				velocity_smooth: { data: velocity_smooth },
			})
		}),
	)

	const result = await syncStravaActivities(user.id)
	invariant(result.ok, 'expected a successful sync')

	// Exactly one Activity Stream, linked to the single imported activity.
	const all = await prisma.activityStream.findMany()
	expect(all).toHaveLength(1)
	const imp = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: user.id },
		select: { id: true },
	})
	expect(all[0]!.activityImportId).toBe(imp.id)

	const parsed = parseStoredStream(all[0]!)
	invariant(parsed, 'expected a parseable read-time stream')
	expect(parsed.resolutionSec).toBe(5)
	expect(parsed.timeSec[0]).toBe(0)
	expect(parsed.timeSec.at(-1)).toBe(60)
	// Flat inputs survive the bucket-mean unchanged; pace is converted from speed.
	expect(parsed.heartrate!.every((v) => v === 140)).toBe(true)
	expect(parsed.power!.every((v) => v === 200)).toBe(true)
	expect(parsed.pace!.every((v) => v === 400)).toBe(true)
})

test('re-sync does not re-create an existing Activity Stream', async () => {
	const { user } = await setupConnection()

	await syncStravaActivities(user.id)
	const first = await prisma.activityStream.findMany({
		where: { activityImport: { athleteId: user.id } },
		select: { id: true },
	})
	expect(first.length).toBeGreaterThan(0)

	// A second pass re-files nothing and, via the existing-stream guard, skips the
	// redundant streams fetch + insert — the same rows survive unchanged.
	await syncStravaActivities(user.id)
	const second = await prisma.activityStream.findMany({
		where: { activityImport: { athleteId: user.id } },
		select: { id: true },
	})
	expect(second.map((s) => s.id).sort()).toEqual(first.map((s) => s.id).sort())
})

test('an activity with no streams persists none and does not error', async () => {
	const { user } = await setupConnection()
	// Strava returns an empty stream set (manual upload / no device).
	server.use(http.get(STREAMS_URL, () => HttpResponse.json({})))

	const result = await syncStravaActivities(user.id)

	invariant(result.ok, 'sync must succeed even when no streams are available')
	expect(result.created).toBe(4)
	const streams = await prisma.activityStream.count()
	expect(streams).toBe(0)
})

test('a freshly-synced recording exposes its stream through the session loader', async () => {
	const { user } = await setupConnection()
	const workout = await createRunWorkout(user.id)
	// Planned run on the same UTC day as the mock "Morning Run" (2026-05-20).
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-05-20T09:00:00.000Z'),
		},
	})

	await syncStravaActivities(user.id)

	// End-to-end: the synced run auto-matched to the planned session, and its
	// telemetry reads back through the session-detail loader the overlay consumes.
	const detail = await getSessionByIdForUser(user.id, session.id)
	invariant(detail?.recording, 'expected the run to be linked as the recording')
	invariant(
		detail.recording.stream,
		'expected a parsed stream on the recording',
	)
	expect(detail.recording.stream.heartrate).toBeDefined()
	expect(detail.recording.stream.timeSec.length).toBeGreaterThan(0)
})

test('re-sync is idempotent: duplicates are skipped, not re-imported', async () => {
	const { user } = await setupConnection()

	await syncStravaActivities(user.id)
	const second = await syncStravaActivities(user.id)

	invariant(second.ok, 'expected a successful re-sync')
	expect(second.created).toBe(0)
	expect(second.skipped).toBe(4)

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(4)
})

test('auto-matches modeled disciplines but excludes "other"', async () => {
	const { user } = await setupConnection()
	const workout = await createRunWorkout(user.id)
	// Planned run on the same UTC day as the mock "Morning Run" (2026-05-20).
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-05-20T09:00:00.000Z'),
		},
	})

	await syncStravaActivities(user.id)

	const run = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'run' },
	})
	expect(run!.promotedSessionId).not.toBeNull()

	const other = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'other' },
	})
	expect(other!.promotedSessionId).toBeNull()
	expect(other!.tssValue).toBeNull()
})

test('reactively refreshes and retries once on a 401', async () => {
	const { user, connection } = await setupConnection({
		refreshToken: 'initial_refresh',
	})

	let calls = 0
	server.use(
		http.get(ACTIVITIES_URL, () => {
			calls++
			if (calls === 1) return new HttpResponse(null, { status: 401 })
			return HttpResponse.json([
				{
					id: 2001,
					sport_type: 'Run',
					type: 'Run',
					distance: 5000,
					moving_time: 1500,
					elapsed_time: 1500,
					start_date: '2026-05-20T06:00:00Z',
				},
			])
		}),
	)

	const result = await syncStravaActivities(user.id)

	invariant(result.ok, 'expected a successful sync after refresh')
	expect(result.created).toBe(1)
	expect(calls).toBe(2)

	// The rotated refresh token (from the default token mock) is persisted.
	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.refreshToken).toBe('mock_refresh_token')
	expect(after!.refreshToken).not.toBe('initial_refresh')
})

test('a permanent refresh failure moves the connection to revoked', async () => {
	const { user, connection } = await setupConnection({
		// Expired access token forces a proactive refresh.
		expiresAt: new Date(Date.now() - 1000),
	})
	server.use(
		http.post(TOKEN_URL, () =>
			HttpResponse.json({ message: 'invalid' }, { status: 400 }),
		),
	)

	const result = await syncStravaActivities(user.id)

	expect(result).toEqual({ ok: false, reason: 'revoked' })

	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.status).toBe('revoked')
	// No watermark advance, no imports created.
	expect(after!.lastSyncedAt).toBeNull()
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(0)
})

test('a 403 (missing activity scope) returns insufficient-scope, not a throw', async () => {
	const { user, connection } = await setupConnection()
	server.use(
		http.get(ACTIVITIES_URL, () => new HttpResponse(null, { status: 403 })),
	)

	const result = await syncStravaActivities(user.id)

	expect(result).toEqual({ ok: false, reason: 'insufficient-scope' })
	// No watermark advance and nothing imported on a failed pass.
	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.lastSyncedAt).toBeNull()
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(0)
})

test('an inactive-application 403 returns app-inactive, distinct from scope', async () => {
	const { user } = await setupConnection()
	// Strava disables the whole API app: 403 with the Application/Inactive body.
	// This must be distinguished from a missing-scope 403 (reconnecting can't fix
	// an inactive app).
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json(
				{
					message: 'Forbidden',
					errors: [
						{ resource: 'Application', field: 'Status', code: 'Inactive' },
					],
				},
				{ status: 403 },
			),
		),
	)

	const result = await syncStravaActivities(user.id)

	expect(result).toEqual({ ok: false, reason: 'app-inactive' })
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(0)
})

test('returns not-connected when the athlete has no Strava connection', async () => {
	const user = await prisma.user.create({
		data: { ...createUser() },
		select: { id: true },
	})

	const result = await syncStravaActivities(user.id)

	expect(result).toEqual({ ok: false, reason: 'not-connected' })
})

test('refuses to sync a revoked connection', async () => {
	const { user } = await setupConnection({ status: 'revoked' })

	const result = await syncStravaActivities(user.id)

	expect(result).toEqual({ ok: false, reason: 'revoked' })
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(0)
})
