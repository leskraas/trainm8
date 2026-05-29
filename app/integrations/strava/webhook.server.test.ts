import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { jobHandlers } from '#app/utils/jobs/handlers.server.ts'
import { enqueueJob, processNextJob } from '#app/utils/jobs/queue.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import {
	registerStravaWebhookSubscription,
	STRAVA_WEBHOOK_JOB_KIND,
	type StravaWebhookJobPayload,
} from './webhook.server.ts'

const EXTERNAL_ATHLETE_ID = '12345678'

async function setupConnectedAthlete() {
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...createUser(),
			athleteProfile: { create: { timezone: 'UTC' } },
		},
	})
	await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: EXTERNAL_ATHLETE_ID,
			accessToken: 'initial_access',
			refreshToken: 'initial_refresh',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-05-28T00:00:00.000Z'),
		},
	})
	return user
}

function mockActivity(id: string, overrides: Record<string, unknown> = {}) {
	server.use(
		http.get(`https://www.strava.com/api/v3/activities/${id}`, () =>
			HttpResponse.json({
				id,
				name: 'Webhook Run',
				sport_type: 'Run',
				type: 'Run',
				distance: 10000,
				moving_time: 3000,
				elapsed_time: 3100,
				start_date: '2026-05-25T06:00:00Z',
				average_heartrate: 150,
				...overrides,
			}),
		),
	)
}

async function enqueueAndRun(payload: StravaWebhookJobPayload) {
	await enqueueJob({ kind: STRAVA_WEBHOOK_JOB_KIND, payload })
	return processNextJob(jobHandlers)
}

test('a create event fetches the activity and files an ActivityImport', async () => {
	const user = await setupConnectedAthlete()
	mockActivity('5001')

	const result = await enqueueAndRun({
		objectType: 'activity',
		objectId: '5001',
		aspectType: 'create',
		ownerId: EXTERNAL_ATHLETE_ID,
	})

	expect(result).toBe('processed')
	const imp = await prisma.activityImport.findUnique({
		where: {
			externalProvider_externalId: {
				externalProvider: 'strava',
				externalId: '5001',
			},
		},
	})
	expect(imp).not.toBeNull()
	expect(imp!.athleteId).toBe(user.id)
	expect(imp!.discipline).toBe('run')
})

test('a create event auto-matches the import to a planned same-day session', async () => {
	const user = await setupConnectedAthlete()
	// Activity lands on 2026-05-25 (run); a planned run session that day exists.
	mockActivity('5003')
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Planned Run',
			discipline: 'run',
			intent: 'endurance',
			ownerId: user.id,
		},
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-05-25T09:00:00Z'),
			status: 'scheduled',
		},
	})

	await enqueueAndRun({
		objectType: 'activity',
		objectId: '5003',
		aspectType: 'create',
		ownerId: EXTERNAL_ATHLETE_ID,
	})

	const imp = await prisma.activityImport.findUnique({
		where: {
			externalProvider_externalId: {
				externalProvider: 'strava',
				externalId: '5003',
			},
		},
		select: { id: true, promotedSessionId: true },
	})
	expect(imp!.promotedSessionId).toBe(session.id)
	const linked = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { recordingId: true },
	})
	expect(linked!.recordingId).toBe(imp!.id)
})

test('an update event refreshes a non-promoted import in place', async () => {
	const user = await setupConnectedAthlete()
	const original = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			externalProvider: 'strava',
			externalId: '6001',
			startedAt: new Date('2026-05-25T06:00:00Z'),
			endedAt: new Date('2026-05-25T06:50:00Z'),
			durationSec: 3000,
			distanceM: 10000,
			discipline: 'run',
			rawJson: '{}',
		},
	})
	// Strava now reports a corrected distance for the same activity.
	mockActivity('6001', { distance: 12345, moving_time: 3300 })

	await enqueueAndRun({
		objectType: 'activity',
		objectId: '6001',
		aspectType: 'update',
		ownerId: EXTERNAL_ATHLETE_ID,
	})

	const refreshed = await prisma.activityImport.findUnique({
		where: { id: original.id },
		select: { distanceM: true, durationSec: true },
	})
	expect(refreshed!.distanceM).toBe(12345)
	expect(refreshed!.durationSec).toBe(3300)
})

test('an update event leaves a promoted Recording unchanged', async () => {
	const user = await setupConnectedAthlete()
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			workoutId: null,
			scheduledAt: new Date('2026-05-25T06:00:00Z'),
			status: 'completed',
		},
	})
	const promoted = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			externalProvider: 'strava',
			externalId: '6002',
			startedAt: new Date('2026-05-25T06:00:00Z'),
			endedAt: new Date('2026-05-25T06:50:00Z'),
			durationSec: 3000,
			distanceM: 10000,
			discipline: 'run',
			rawJson: '{}',
			promotedSessionId: session.id,
		},
	})
	// Strava reports a different distance, but a promoted Recording is immutable.
	mockActivity('6002', { distance: 99999, moving_time: 9999 })

	await enqueueAndRun({
		objectType: 'activity',
		objectId: '6002',
		aspectType: 'update',
		ownerId: EXTERNAL_ATHLETE_ID,
	})

	const after = await prisma.activityImport.findUnique({
		where: { id: promoted.id },
		select: { distanceM: true, durationSec: true },
	})
	expect(after!.distanceM).toBe(10000)
	expect(after!.durationSec).toBe(3000)
})

test('a delete event removes a non-promoted import', async () => {
	const user = await setupConnectedAthlete()
	await prisma.activityImport.create({
		data: {
			athleteId: user.id,
			externalProvider: 'strava',
			externalId: '7001',
			startedAt: new Date('2026-05-25T06:00:00Z'),
			endedAt: new Date('2026-05-25T06:50:00Z'),
			durationSec: 3000,
			discipline: 'run',
			rawJson: '{}',
		},
	})

	await enqueueAndRun({
		objectType: 'activity',
		objectId: '7001',
		aspectType: 'delete',
		ownerId: EXTERNAL_ATHLETE_ID,
	})

	const gone = await prisma.activityImport.findUnique({
		where: {
			externalProvider_externalId: {
				externalProvider: 'strava',
				externalId: '7001',
			},
		},
	})
	expect(gone).toBeNull()
})

test('a delete event leaves a promoted Recording intact', async () => {
	const user = await setupConnectedAthlete()
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			workoutId: null,
			scheduledAt: new Date('2026-05-25T06:00:00Z'),
			status: 'completed',
		},
	})
	const promoted = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			externalProvider: 'strava',
			externalId: '7002',
			startedAt: new Date('2026-05-25T06:00:00Z'),
			endedAt: new Date('2026-05-25T06:50:00Z'),
			durationSec: 3000,
			discipline: 'run',
			rawJson: '{}',
			promotedSessionId: session.id,
		},
	})

	await enqueueAndRun({
		objectType: 'activity',
		objectId: '7002',
		aspectType: 'delete',
		ownerId: EXTERNAL_ATHLETE_ID,
	})

	const survivor = await prisma.activityImport.findUnique({
		where: { id: promoted.id },
	})
	expect(survivor).not.toBeNull()
})

test('a deauthorize event revokes the connection but keeps non-promoted imports', async () => {
	const user = await setupConnectedAthlete()
	await prisma.activityImport.create({
		data: {
			athleteId: user.id,
			externalProvider: 'strava',
			externalId: '8001',
			startedAt: new Date('2026-05-25T06:00:00Z'),
			endedAt: new Date('2026-05-25T06:50:00Z'),
			durationSec: 3000,
			discipline: 'run',
			rawJson: '{}',
		},
	})

	await enqueueAndRun({
		objectType: 'athlete',
		objectId: EXTERNAL_ATHLETE_ID,
		aspectType: 'update',
		ownerId: EXTERNAL_ATHLETE_ID,
		updates: { authorized: 'false' },
	})

	const connection = await prisma.accountConnection.findFirstOrThrow({
		where: { athleteId: user.id, provider: 'strava' },
		select: { status: true },
	})
	expect(connection.status).toBe('revoked')
	const stillThere = await prisma.activityImport.count({
		where: { athleteId: user.id, externalId: '8001' },
	})
	expect(stillThere).toBe(1)
})

test('an event for an unknown owner is a no-op that completes cleanly', async () => {
	const job = await enqueueJob({
		kind: STRAVA_WEBHOOK_JOB_KIND,
		payload: {
			objectType: 'activity',
			objectId: '9001',
			aspectType: 'create',
			ownerId: 'nobody-here',
		} satisfies StravaWebhookJobPayload,
	})

	const result = await processNextJob(jobHandlers)

	expect(result).toBe('processed')
	const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
	expect(row.status).toBe('completed')
	const imports = await prisma.activityImport.count({
		where: { externalId: '9001' },
	})
	expect(imports).toBe(0)
})

const SUBSCRIPTION_ARGS = {
	callbackUrl: 'https://app.example.com/webhook/strava',
	clientId: 'client-1',
	clientSecret: 'secret-1',
	verifyToken: 'verify-1',
}

test('registering a webhook subscription creates one when none exists', async () => {
	let posted = false
	server.use(
		http.get('https://www.strava.com/api/v3/push_subscriptions', () =>
			HttpResponse.json([]),
		),
		http.post('https://www.strava.com/api/v3/push_subscriptions', () => {
			posted = true
			return HttpResponse.json({ id: 42 })
		}),
	)

	const result = await registerStravaWebhookSubscription(SUBSCRIPTION_ARGS)

	expect(result).toEqual({ id: 42, created: true })
	expect(posted).toBe(true)
})

test('registering a webhook subscription is idempotent when one already exists', async () => {
	let posted = false
	server.use(
		http.get('https://www.strava.com/api/v3/push_subscriptions', () =>
			HttpResponse.json([
				{ id: 7, callback_url: SUBSCRIPTION_ARGS.callbackUrl },
			]),
		),
		http.post('https://www.strava.com/api/v3/push_subscriptions', () => {
			posted = true
			return HttpResponse.json({ id: 999 })
		}),
	)

	const result = await registerStravaWebhookSubscription(SUBSCRIPTION_ARGS)

	expect(result).toEqual({ id: 7, created: false })
	expect(posted).toBe(false)
})

test('a duplicate create event does not create a second import', async () => {
	const user = await setupConnectedAthlete()
	mockActivity('5002')

	const createPayload: StravaWebhookJobPayload = {
		objectType: 'activity',
		objectId: '5002',
		aspectType: 'create',
		ownerId: EXTERNAL_ATHLETE_ID,
	}
	await enqueueAndRun(createPayload)
	const second = await enqueueAndRun(createPayload)

	expect(second).toBe('processed')
	const imports = await prisma.activityImport.count({
		where: { athleteId: user.id, externalId: '5002' },
	})
	expect(imports).toBe(1)
})
