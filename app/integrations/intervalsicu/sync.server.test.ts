import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { connectAccountConnection } from '#app/utils/account-connection.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import {
	MOCK_INTERVALSICU_API_KEY,
	MOCK_INTERVALSICU_ATHLETE_ID,
} from '#tests/mocks/intervalsicu.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { syncIntervalsIcuActivities } from './sync.server.ts'

const ACTIVITIES_URL =
	'https://intervals.icu/api/v1/athlete/:athleteId/activities'
const STREAMS_URL = 'https://intervals.icu/api/v1/activity/:id/streams'

async function setupConnection(
	overrides: Partial<{
		status: string
		lastSyncedAt: Date | null
		accessToken: string
	}> = {},
) {
	const user = await prisma.user.create({
		data: { ...createUser() },
		select: { id: true },
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'intervalsicu',
			externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
			accessToken: overrides.accessToken ?? MOCK_INTERVALSICU_API_KEY,
			status: overrides.status ?? 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
			lastSyncedAt:
				overrides.lastSyncedAt === undefined
					? new Date('2026-05-19T00:00:00.000Z')
					: overrides.lastSyncedAt,
		},
	})
	return { user, connection }
}

function newActivity(id = 'i9001') {
	return {
		id,
		name: 'New Morning Run',
		type: 'Run',
		distance: 10000,
		moving_time: 3000,
		elapsed_time: 3100,
		start_date: '2026-05-21T06:00:00Z',
		average_heartrate: 150,
	}
}

test('imports new activities since the watermark and advances it', async () => {
	const lastSyncedAt = new Date('2026-05-19T00:00:00.000Z')
	const { user, connection } = await setupConnection({ lastSyncedAt })
	let oldest: string | null = null
	server.use(
		http.get(ACTIVITIES_URL, ({ request }) => {
			oldest = new URL(request.url).searchParams.get('oldest')
			return HttpResponse.json([newActivity()])
		}),
		http.get(STREAMS_URL, () => new HttpResponse(null, { status: 404 })),
	)

	const result = await syncIntervalsIcuActivities(user.id)

	invariant(result.ok, 'expected a successful sync')
	expect(result.created).toBe(1)
	// The window opens 48h before the watermark (the reconcile overlap):
	// Intervals.icu filters by activity *start* time, so a ride that uploaded
	// after the watermark advanced would otherwise be missed. The API takes
	// local ISO-8601 date-times (no zone suffix); with no profile the timezone
	// defaults to UTC.
	expect(oldest).toBe('2026-05-17T00:00:00')

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(1)
	expect(imports[0]!.externalProvider).toBe('intervalsicu')
	expect(imports[0]!.externalId).toBe('i9001')

	// The watermark advances to the newest activity's start time — the same
	// meaning backfill and the reconcile sweep give it — never the sync's own
	// wall-clock time.
	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.lastSyncedAt?.toISOString()).toBe('2026-05-21T06:00:00.000Z')
})

test('an activity that uploaded late (start time before the watermark) is still imported', async () => {
	// The athlete pressed "Sync now" at 12:00 before the 10:00 ride reached
	// Intervals.icu; the watermark sits after the ride's start time. The 48h
	// overlap must still pick it up on the next sync.
	const lastSyncedAt = new Date('2026-05-21T12:00:00.000Z')
	const { user, connection } = await setupConnection({ lastSyncedAt })
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json([
				{ ...newActivity('i9020'), start_date: '2026-05-21T10:00:00Z' },
			]),
		),
		http.get(STREAMS_URL, () => new HttpResponse(null, { status: 404 })),
	)

	const result = await syncIntervalsIcuActivities(user.id)

	invariant(result.ok, 'expected a successful sync')
	expect(result.created).toBe(1)

	// Forward-only: an older activity never pulls the watermark backwards.
	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.lastSyncedAt?.toISOString()).toBe(lastSyncedAt.toISOString())
})

test('the fetch window is rendered as wall-clock time in the athlete profile timezone', async () => {
	const lastSyncedAt = new Date('2026-05-19T00:00:00.000Z')
	const { user } = await setupConnection({ lastSyncedAt })
	await prisma.athleteProfile.create({
		data: { userId: user.id, timezone: 'Europe/Oslo' },
	})
	let oldest: string | null = null
	server.use(
		http.get(ACTIVITIES_URL, ({ request }) => {
			oldest = new URL(request.url).searchParams.get('oldest')
			return HttpResponse.json([])
		}),
	)

	const result = await syncIntervalsIcuActivities(user.id)

	invariant(result.ok, 'expected a successful sync')
	// 48h before the watermark, rendered in Oslo wall-clock time: midnight UTC
	// is 02:00 CEST — and never a trailing `Z`.
	expect(oldest).toBe('2026-05-17T02:00:00')
})

test('an Intervals.icu outage reports unavailable and leaves the connection untouched', async () => {
	consoleError.mockImplementation(() => {})
	const lastSyncedAt = new Date('2026-05-19T00:00:00.000Z')
	const { user, connection } = await setupConnection({ lastSyncedAt })
	server.use(
		http.get(ACTIVITIES_URL, () => new HttpResponse('boom', { status: 500 })),
	)

	const result = await syncIntervalsIcuActivities(user.id)

	expect(result).toEqual({ ok: false, reason: 'unavailable' })
	expect(consoleError).toHaveBeenCalled()
	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	// Not revoked (the key is fine) and the watermark stays put, so the next
	// sync re-covers the same window.
	expect(after!.status).toBe('active')
	expect(after!.lastSyncedAt).toEqual(lastSyncedAt)
})

test('re-runs are idempotent: duplicates are skipped, not re-imported', async () => {
	const { user } = await setupConnection()
	server.use(
		http.get(ACTIVITIES_URL, () => HttpResponse.json([newActivity()])),
		http.get(STREAMS_URL, () => new HttpResponse(null, { status: 404 })),
	)

	const first = await syncIntervalsIcuActivities(user.id)
	const second = await syncIntervalsIcuActivities(user.id)

	invariant(first.ok && second.ok, 'expected both runs to succeed')
	expect(first.created).toBe(1)
	expect(second.created).toBe(0)
	expect(second.skipped).toBe(1)
})

test('links a modeled activity to a same-day planned session, never creating sessions', async () => {
	const { user } = await setupConnection()
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
			discipline: 'run',
			intent: 'endurance',
			ownerId: user.id,
		},
	})
	const planned = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-05-21T09:00:00.000Z'),
		},
	})
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json([newActivity('i9002'), newActivity('i9003')]),
		),
		http.get(STREAMS_URL, () => new HttpResponse(null, { status: 404 })),
	)

	const result = await syncIntervalsIcuActivities(user.id)
	invariant(result.ok, 'expected a successful sync')

	// Two same-day runs but one planned session: only an unambiguous single
	// match links; nothing auto-creates a recording-only session on sync.
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(2)
	const linked = imports.filter((i) => i.promotedSessionId != null)
	expect(linked.length).toBeLessThanOrEqual(1)
	const sessions = await prisma.workoutSession.findMany({
		where: { userId: user.id },
	})
	expect(sessions.map((s) => s.id)).toEqual([planned.id])
})

test('a 401 flips the connection to revoked and reports it', async () => {
	const { user, connection } = await setupConnection({
		accessToken: 'stale_or_regenerated_key',
	})

	const result = await syncIntervalsIcuActivities(user.id)

	expect(result).toEqual({ ok: false, reason: 'revoked' })
	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.status).toBe('revoked')
})

test('a revoked connection is reported without fetching', async () => {
	const { user } = await setupConnection({ status: 'revoked' })
	let fetched = false
	server.use(
		http.get(ACTIVITIES_URL, () => {
			fetched = true
			return HttpResponse.json([])
		}),
	)

	const result = await syncIntervalsIcuActivities(user.id)

	expect(result).toEqual({ ok: false, reason: 'revoked' })
	expect(fetched).toBe(false)
})

test('reports not-connected when there is no connection', async () => {
	const user = await prisma.user.create({
		data: { ...createUser() },
		select: { id: true },
	})
	const result = await syncIntervalsIcuActivities(user.id)
	expect(result).toEqual({ ok: false, reason: 'not-connected' })
})

test('pasting a new key recovers the same revoked connection and sync works again', async () => {
	// Sync with a dead key → revoked.
	const { user, connection } = await setupConnection({
		accessToken: 'regenerated_away_key',
	})
	const revoked = await syncIntervalsIcuActivities(user.id)
	expect(revoked).toEqual({ ok: false, reason: 'revoked' })

	// The reconnect path (#203) upserts the same athlete/provider row with the
	// fresh key and re-activates it.
	await connectAccountConnection({
		athleteId: user.id,
		provider: 'intervalsicu',
		externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
		accessToken: MOCK_INTERVALSICU_API_KEY,
		refreshToken: null,
		expiresAt: null,
	})

	server.use(
		http.get(ACTIVITIES_URL, () => HttpResponse.json([newActivity('i9010')])),
		http.get(STREAMS_URL, () => new HttpResponse(null, { status: 404 })),
	)
	const result = await syncIntervalsIcuActivities(user.id)

	invariant(result.ok, 'expected sync to succeed after reconnect')
	expect(result.created).toBe(1)
	const rows = await prisma.accountConnection.findMany({
		where: { athleteId: user.id, provider: 'intervalsicu' },
	})
	// Same connection row, recovered — not a second one.
	expect(rows).toHaveLength(1)
	expect(rows[0]!.id).toBe(connection.id)
	expect(rows[0]!.status).toBe('active')
})
