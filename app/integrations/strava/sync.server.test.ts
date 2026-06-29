import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { syncStravaActivities } from './sync.server.ts'

const ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities'
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
