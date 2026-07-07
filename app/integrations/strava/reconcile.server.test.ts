import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { enqueueReconciliationJobs } from '#app/integrations/reconcile-sweep.server.ts'
import {
	RECONCILE_OVERLAP_MS,
	runStravaReconciliation,
	STRAVA_RECONCILE_JOB_KIND,
} from './reconcile.server.ts'

const ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities'

async function setupConnection(
	overrides: Partial<{
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
			accessToken: 'initial_access',
			refreshToken: 'initial_refresh',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: overrides.status ?? 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
			lastSyncedAt:
				overrides.lastSyncedAt === undefined
					? new Date('2026-05-20T00:00:00.000Z')
					: overrides.lastSyncedAt,
		},
	})
	return { user, connection }
}

/** A single Strava activity the webhook missed, returned by the mock feed. */
function missedActivity(id = 5001) {
	return {
		id,
		name: 'Missed Morning Run',
		sport_type: 'Run',
		type: 'Run',
		distance: 10000,
		moving_time: 3000,
		elapsed_time: 3100,
		start_date: '2026-05-21T06:00:00Z',
		average_heartrate: 150,
		map: { summary_polyline: 'abc' },
	}
}

test('repairs a missed activity by filing it as an ActivityImport', async () => {
	const { user } = await setupConnection()
	server.use(
		http.get(ACTIVITIES_URL, () => HttpResponse.json([missedActivity()])),
	)

	const result = await runStravaReconciliation(user.id)

	invariant(result.ok, 'expected a successful reconciliation')
	expect(result.created).toBe(1)

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(1)
	expect(imports[0]!.externalId).toBe('5001')
	expect(imports[0]!.externalProvider).toBe('strava')
})

test('fetches with a 48h overlap before lastSyncedAt to catch late edits', async () => {
	const lastSyncedAt = new Date('2026-05-20T00:00:00.000Z')
	const { user } = await setupConnection({ lastSyncedAt })

	let after: string | null = null
	server.use(
		http.get(ACTIVITIES_URL, ({ request }) => {
			after = new URL(request.url).searchParams.get('after')
			// An activity that landed just before the watermark — a manual sync
			// (no overlap) would never reach back for it.
			return HttpResponse.json([
				{
					...missedActivity(5002),
					start_date: '2026-05-19T06:00:00Z',
				},
			])
		}),
	)

	const result = await runStravaReconciliation(user.id)

	invariant(result.ok, 'expected a successful reconciliation')
	const expectedAfter = Math.floor(
		(lastSyncedAt.getTime() - RECONCILE_OVERLAP_MS) / 1000,
	)
	expect(after).toBe(String(expectedAfter))

	const imported = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, externalId: '5002' },
	})
	expect(imported).not.toBeNull()
})

test('re-runs are idempotent: duplicates are skipped, not re-imported', async () => {
	const { user } = await setupConnection()
	server.use(
		http.get(ACTIVITIES_URL, () => HttpResponse.json([missedActivity()])),
	)

	const first = await runStravaReconciliation(user.id)
	const second = await runStravaReconciliation(user.id)

	invariant(first.ok && second.ok, 'expected both runs to succeed')
	expect(first.created).toBe(1)
	expect(second.created).toBe(0)
	expect(second.skipped).toBe(1)

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(1)
})

test('advances lastSyncedAt to the latest activity time on success', async () => {
	const { user, connection } = await setupConnection({
		lastSyncedAt: new Date('2026-05-20T00:00:00.000Z'),
	})
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json([
				{ ...missedActivity(6001), start_date: '2026-05-21T06:00:00Z' },
				{ ...missedActivity(6002), start_date: '2026-05-23T18:00:00Z' },
			]),
		),
	)

	await runStravaReconciliation(user.id)

	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.lastSyncedAt?.toISOString()).toBe('2026-05-23T18:00:00.000Z')
})

test('never regresses lastSyncedAt when the overlap only returns older activities', async () => {
	const lastSyncedAt = new Date('2026-05-25T00:00:00.000Z')
	const { user, connection } = await setupConnection({ lastSyncedAt })
	// The 48h overlap reaches back before the watermark; the only activity it
	// finds is older than lastSyncedAt and must not pull the watermark backward.
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json([
				{ ...missedActivity(6003), start_date: '2026-05-24T06:00:00Z' },
			]),
		),
	)

	await runStravaReconciliation(user.id)

	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.lastSyncedAt?.toISOString()).toBe(lastSyncedAt.toISOString())
})

test('auto-matches a modeled discipline but leaves "other" in the inbox', async () => {
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
	// Planned run on the same UTC day as the recovered run activity.
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-05-21T09:00:00.000Z'),
		},
	})
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json([
				{ ...missedActivity(7001), sport_type: 'Run', type: 'Run' },
				{
					...missedActivity(7002),
					sport_type: 'Hike',
					type: 'Hike',
					map: undefined,
				},
			]),
		),
	)

	await runStravaReconciliation(user.id)

	const run = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, externalId: '7001' },
	})
	expect(run!.promotedSessionId).not.toBeNull()

	const other = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, externalId: '7002' },
	})
	expect(other!.discipline).toBe('other')
	expect(other!.promotedSessionId).toBeNull()
})

test('enqueues one reconciliation job per active connection, skipping the rest', async () => {
	const active1 = await setupConnection({ status: 'active' })
	const active2 = await setupConnection({ status: 'active' })
	await setupConnection({ status: 'revoked' })
	await setupConnection({ status: 'error' })
	await setupConnection({ status: 'expired' })

	const result = await enqueueReconciliationJobs()

	expect(result.enqueued).toBe(2)

	const jobs = await prisma.job.findMany({
		where: { kind: STRAVA_RECONCILE_JOB_KIND },
	})
	expect(jobs).toHaveLength(2)
	const enqueuedAthleteIds = jobs
		.map((j) => (JSON.parse(j.payload) as { athleteId: string }).athleteId)
		.sort()
	expect(enqueuedAthleteIds).toEqual([active1.user.id, active2.user.id].sort())
})

test('does not poll a connection that is no longer active', async () => {
	// Revoked between dispatch and processing: the handler must no-op rather than
	// fetch against a dead grant.
	const { user } = await setupConnection({ status: 'revoked' })
	server.use(
		http.get(ACTIVITIES_URL, () => HttpResponse.json([missedActivity()])),
	)

	const result = await runStravaReconciliation(user.id)

	expect(result).toEqual({ ok: false, reason: 'inactive' })
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(0)
})
