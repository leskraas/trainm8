import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { parseStoredStream } from '#app/utils/activity-stream.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getSessionByIdForUser } from '#app/utils/training.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { runStravaBackfill } from './backfill.server.ts'

const STREAMS_URL = 'https://www.strava.com/api/v3/activities/:id/streams'
const ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities'

/** Serve a fixed activity feed: page 1 returns the list, later pages are empty
 * so the paginated fetcher terminates. */
function mockActivityFeed(activities: Array<Record<string, unknown>>) {
	server.use(
		http.get(ACTIVITIES_URL, ({ request }) => {
			const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
			return HttpResponse.json(page === 1 ? activities : [])
		}),
	)
}

function ride(id: number, start: Date): Record<string, unknown> {
	return {
		id,
		name: `Ride ${id}`,
		sport_type: 'Ride',
		type: 'Ride',
		distance: 40000,
		moving_time: 4800,
		elapsed_time: 5000,
		start_date: start.toISOString(),
	}
}

function daysBefore(now: Date, days: number): Date {
	return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

/**
 * An athlete with an active Strava connection and a run threshold profile so
 * HR-based TSS is computable for the mock "Morning Run" (avg HR 150).
 */
async function setupBackfillAthlete() {
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...createUser(),
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: [{ discipline: 'run', lthr: 160, maxHr: 185 }],
					},
				},
			},
		},
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
			connectedAt: new Date('2026-05-28T00:00:00.000Z'),
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

test('backfill imports the activities in the window', async () => {
	const { user } = await setupBackfillAthlete()

	const result = await runStravaBackfill(user.id)

	invariant(result.ok, 'expected a successful backfill')
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(4)
	expect(imports.map((i) => i.discipline).sort()).toEqual([
		'bike',
		'other',
		'run',
		'swim',
	])
})

test('an unmatched modeled activity is auto-promoted to a recording-only session', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)

	const bike = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'bike' },
	})
	expect(bike!.promotedSessionId).not.toBeNull()

	const session = await prisma.workoutSession.findUnique({
		where: { id: bike!.promotedSessionId! },
	})
	expect(session!.workoutId).toBeNull()
	expect(session!.status).toBe('completed')
	expect(session!.recordingId).toBe(bike!.id)
})

test('a matched activity links to the planned session instead of creating one', async () => {
	const { user } = await setupBackfillAthlete()
	const workout = await createRunWorkout(user.id)
	// Planned run on the same UTC day as the mock "Morning Run" (2026-05-20).
	const planned = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-05-20T09:00:00.000Z'),
		},
	})

	await runStravaBackfill(user.id)

	const run = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'run' },
	})
	expect(run!.promotedSessionId).toBe(planned.id)

	// No extra recording-only run session was created.
	const runSessions = await prisma.workoutSession.count({
		where: { userId: user.id, recordingId: run!.id },
	})
	expect(runSessions).toBe(1)
})

test('an "other" activity stays in the inbox, never auto-promoted', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)

	const other = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'other' },
	})
	expect(other!.promotedSessionId).toBeNull()
	const otherSessions = await prisma.workoutSession.count({
		where: { userId: user.id, recordingId: other!.id },
	})
	expect(otherSessions).toBe(0)
})

test('watermarks are stamped: lastSyncedAt to the latest activity, backfillCompletedAt set', async () => {
	const { user, connection } = await setupBackfillAthlete()
	const now = new Date('2026-05-28T12:00:00.000Z')

	await runStravaBackfill(user.id, { now })

	const after = await prisma.accountConnection.findUniqueOrThrow({
		where: { id: connection.id },
	})
	// Latest mock activity is the Hike at 2026-05-23T17:00:00Z.
	expect(after.lastSyncedAt!.toISOString()).toBe('2026-05-23T17:00:00.000Z')
	expect(after.backfillCompletedAt!.toISOString()).toBe(now.toISOString())
})

test('Training Load is recomputed across the window after backfill', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)

	// The auto-promoted "Morning Run" (avg HR 150, LTHR 160) contributes hrTSS.
	const snapshot = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: user.id, date: '2026-05-20' } },
	})
	expect(snapshot).not.toBeNull()
	expect(snapshot!.tssTotal).toBeGreaterThan(0)
})

test('backfill is idempotent on retry', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)
	const second = await runStravaBackfill(user.id)

	invariant(second.ok, 'expected a successful re-run')
	expect(second.created).toBe(0)
	expect(second.promoted).toBe(0)

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(4)
	// run + bike + swim auto-promoted (3 recording-only sessions); 'other' is not.
	const sessions = await prisma.workoutSession.count({
		where: { userId: user.id },
	})
	expect(sessions).toBe(3)
})

test('backfill ingests an Activity Stream for each modeled recording, never for "other"', async () => {
	const { user } = await setupBackfillAthlete()

	// Default mocks: four activities (run/bike/swim/hike) and a 900s HR streams
	// payload returned for every activity id.
	await runStravaBackfill(user.id)

	// One stream per backfilled modeled recording (run, bike, swim); the hike is
	// 'other' and gets no overlay, so no stream.
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

test('re-running backfill does not duplicate Activity Streams (idempotent)', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)
	const first = await prisma.activityStream.findMany({
		where: { activityImport: { athleteId: user.id } },
		select: { id: true },
	})
	expect(first).toHaveLength(3)

	// A second pass re-files nothing and, via the existing-stream guard, skips the
	// redundant streams fetch + insert — the same rows survive unchanged.
	await runStravaBackfill(user.id)
	const second = await prisma.activityStream.findMany({
		where: { activityImport: { athleteId: user.id } },
		select: { id: true },
	})
	expect(second.map((s) => s.id).sort()).toEqual(first.map((s) => s.id).sort())
})

test('a backfilled activity with no streams persists none and does not error', async () => {
	const { user } = await setupBackfillAthlete()
	// Strava returns an empty stream set (manual upload / no device).
	server.use(http.get(STREAMS_URL, () => HttpResponse.json({})))

	const result = await runStravaBackfill(user.id)

	invariant(
		result.ok,
		'backfill must succeed even when no streams are available',
	)
	const streams = await prisma.activityStream.count()
	expect(streams).toBe(0)
})

test('a backfilled, auto-promoted recording exposes its stream through the session loader', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)

	// The bike has no planned session, so backfill auto-promotes it to a
	// recording-only session. End-to-end: its telemetry reads back through the
	// session-detail loader the Workout Detail View overlay consumes.
	const bike = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: user.id, discipline: 'bike' },
		select: { promotedSessionId: true },
	})
	invariant(bike.promotedSessionId, 'expected the bike to be auto-promoted')

	const detail = await getSessionByIdForUser(user.id, bike.promotedSessionId)
	invariant(
		detail?.recording,
		'expected the bike to be linked as the recording',
	)
	invariant(
		detail.recording.stream,
		'expected a parsed stream on the recording',
	)
	expect(detail.recording.stream.heartrate).toBeDefined()
	expect(detail.recording.stream.timeSec.length).toBeGreaterThan(0)
})

// The count target trims the reach only when it lands *past* the 42-day floor —
// otherwise the floor keeps everything. What matters here is that trimming
// behaviour, not the production target's exact value: driving the real target of
// 50 would push 50 activities through the whole import → promote → stream-ingest
// → load-recompute pipeline one sequential DB round-trip at a time, which ran
// ~20s locally and timed out on contended CI runners — doubly harmful, because
// the abandoned backfill keeps issuing queries while the next test's beforeEach
// disconnects Prisma, cascading into "Engine is not yet connected" across the
// suite. So inject a small target instead: it exercises the identical trimming
// path at a fraction of the cost.
test('a prolific athlete is backfilled to the count target, trimming older activities', async () => {
	const { user } = await setupBackfillAthlete()
	const now = new Date('2026-06-30T12:00:00.000Z')
	// A small target reaching past the 42-day floor: 8 sessions spaced a week
	// apart span 49 days, so the target — not the floor — sets the reach.
	const targetSessions = 8
	// 12 weekly rides (newest = today). The target keeps the 8 newest (through
	// day 49); the four older ones fall outside the reach and are not imported.
	mockActivityFeed(
		Array.from({ length: 12 }, (_, i) =>
			ride(2000 + i, daysBefore(now, i * 7)),
		),
	)
	// Telemetry isn't the point here; an empty stream set keeps enrichment cheap.
	server.use(http.get(STREAMS_URL, () => HttpResponse.json({})))

	const result = await runStravaBackfill(user.id, { now, targetSessions })
	invariant(result.ok, 'expected a successful backfill')

	const imports = await prisma.activityImport.count({
		where: { athleteId: user.id },
	})
	expect(imports).toBe(targetSessions)
	// Eight sequential import→promote→stream→load round-trips still run several
	// seconds — past the 5s default on slower CI runners — so keep headroom.
}, 30_000)

// Same headroom rationale as the "prolific athlete" test above: driving eight
// rides across a ~210-day reach through the full import → promote →
// stream-ingest → load-recompute pipeline runs several seconds — past the 5s
// default on slower CI runners. And a timeout here is doubly harmful: the
// abandoned backfill keeps issuing queries while the *next* test's beforeEach
// disconnects Prisma, cascading into "Engine is not yet connected". Give it
// real headroom.
test('a sparse athlete is backfilled well past the 42-day floor, up to the age cap', async () => {
	const { user } = await setupBackfillAthlete()
	const now = new Date('2026-06-30T12:00:00.000Z')
	// 8 rides, one every ~30 days, spanning ~210 days — far beyond the 42-day
	// floor but fewer than the count target, so the reach extends to gather all.
	mockActivityFeed(
		Array.from({ length: 8 }, (_, i) =>
			ride(3000 + i, daysBefore(now, i * 30)),
		),
	)
	server.use(http.get(STREAMS_URL, () => HttpResponse.json({})))

	const result = await runStravaBackfill(user.id, { now })
	invariant(result.ok, 'expected a successful backfill')

	const imports = await prisma.activityImport.count({
		where: { athleteId: user.id },
	})
	// All eight kept: recency never capped the reach at 42 days.
	expect(imports).toBe(8)
}, 30_000)

test('activities older than the age cap are not imported', async () => {
	const { user } = await setupBackfillAthlete()
	const now = new Date('2026-06-30T12:00:00.000Z')
	mockActivityFeed([
		ride(4001, daysBefore(now, 10)), // recent — kept
		ride(4002, daysBefore(now, 200)), // within the age cap — kept
		ride(4003, daysBefore(now, 400)), // older than the cap — dropped
	])
	server.use(http.get(STREAMS_URL, () => HttpResponse.json({})))

	const result = await runStravaBackfill(user.id, { now })
	invariant(result.ok, 'expected a successful backfill')

	const imports = await prisma.activityImport.count({
		where: { athleteId: user.id },
	})
	expect(imports).toBe(2)
})
