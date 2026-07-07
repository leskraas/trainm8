import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { BACKFILL_TARGET_SESSIONS } from '#app/integrations/backfill-window.ts'
import { parseStoredStream } from '#app/utils/activity-stream.ts'
import { prisma } from '#app/utils/db.server.ts'
import { jobHandlers } from '#app/utils/jobs/handlers.server.ts'
import { getSessionByIdForUser } from '#app/utils/training.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import {
	MOCK_INTERVALSICU_API_KEY,
	MOCK_INTERVALSICU_ATHLETE_ID,
} from '#tests/mocks/intervalsicu.ts'
import {
	INTERVALSICU_BACKFILL_JOB_KIND,
	runIntervalsIcuBackfill,
} from './backfill.server.ts'

const ACTIVITIES_URL =
	'https://intervals.icu/api/v1/athlete/:athleteId/activities'
const STREAMS_URL = 'https://intervals.icu/api/v1/activity/:id/streams'

/** Serve a fixed activity feed in place of the default mock. */
function mockActivityFeed(activities: Array<Record<string, unknown>>) {
	server.use(http.get(ACTIVITIES_URL, () => HttpResponse.json(activities)))
}

function ride(id: string, start: Date): Record<string, unknown> {
	return {
		id,
		name: `Ride ${id}`,
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
 * An athlete with an active Intervals.icu connection, a run threshold profile
 * (so HR-based TSS is computable for the mock "Morning Run", avg HR 150) and a
 * bike FTP (so a power stream yields NP-based Coggan TSS, ADR 0024).
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
						create: [
							{ discipline: 'run', lthr: 160, maxHr: 185 },
							// Coggan TSS is opt-in per discipline profile (ADR 0008).
							{ discipline: 'bike', ftp: 250, preferCogganTss: true },
						],
					},
				},
			},
		},
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'intervalsicu',
			externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
			accessToken: MOCK_INTERVALSICU_API_KEY,
			status: 'active',
			connectedAt: new Date('2026-05-28T00:00:00.000Z'),
		},
	})
	return { user, connection }
}

test('backfill imports the activities in the window with the intervalsicu provider', async () => {
	const { user } = await setupBackfillAthlete()

	const result = await runIntervalsIcuBackfill(user.id)

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
	// Every import carries the provider the inbox badge renders.
	expect(new Set(imports.map((i) => i.externalProvider))).toEqual(
		new Set(['intervalsicu']),
	)
})

test('the job handler runs the backfill for the enqueued athlete', async () => {
	const { user } = await setupBackfillAthlete()

	await jobHandlers[INTERVALSICU_BACKFILL_JOB_KIND]!({ athleteId: user.id })

	const imports = await prisma.activityImport.count({
		where: { athleteId: user.id, externalProvider: 'intervalsicu' },
	})
	expect(imports).toBe(4)
})

test('an unmatched modeled activity is auto-promoted to a recording-only session', async () => {
	const { user } = await setupBackfillAthlete()

	await runIntervalsIcuBackfill(user.id)

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
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
			discipline: 'run',
			intent: 'endurance',
			ownerId: user.id,
		},
	})
	// Planned run on the same UTC day as the mock "Morning Run" (2026-05-20).
	const planned = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-05-20T09:00:00.000Z'),
		},
	})

	await runIntervalsIcuBackfill(user.id)

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

test('an "other" activity stays in the inbox, never auto-promoted, never feeding load', async () => {
	const { user } = await setupBackfillAthlete()

	await runIntervalsIcuBackfill(user.id)

	const other = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'other' },
	})
	expect(other!.promotedSessionId).toBeNull()
	expect(other!.tssValue).toBeNull()
	const otherSessions = await prisma.workoutSession.count({
		where: { userId: user.id, recordingId: other!.id },
	})
	expect(otherSessions).toBe(0)
})

test('watermarks are stamped: lastSyncedAt to the latest activity, backfillCompletedAt set', async () => {
	const { user, connection } = await setupBackfillAthlete()
	const now = new Date('2026-05-28T12:00:00.000Z')

	await runIntervalsIcuBackfill(user.id, { now })

	const after = await prisma.accountConnection.findUniqueOrThrow({
		where: { id: connection.id },
	})
	// Latest mock activity is the Yoga at 2026-05-23T17:00:00Z.
	expect(after.lastSyncedAt!.toISOString()).toBe('2026-05-23T17:00:00.000Z')
	expect(after.backfillCompletedAt!.toISOString()).toBe(now.toISOString())
})

test('Training Load is recomputed across the window after backfill', async () => {
	const { user } = await setupBackfillAthlete()

	await runIntervalsIcuBackfill(user.id)

	// The auto-promoted "Morning Run" (avg HR 150, LTHR 160) contributes hrTSS.
	const snapshot = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: user.id, date: '2026-05-20' } },
	})
	expect(snapshot).not.toBeNull()
	expect(snapshot!.tssTotal).toBeGreaterThan(0)
})

test('backfill is idempotent on retry: no duplicate imports, sessions, or streams', async () => {
	const { user } = await setupBackfillAthlete()

	await runIntervalsIcuBackfill(user.id)
	const firstStreams = await prisma.activityStream.findMany({
		where: { activityImport: { athleteId: user.id } },
		select: { id: true },
	})
	const second = await runIntervalsIcuBackfill(user.id)

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
	// The same stream rows survive unchanged — no redundant fetch/insert.
	const secondStreams = await prisma.activityStream.findMany({
		where: { activityImport: { athleteId: user.id } },
		select: { id: true },
	})
	expect(secondStreams.map((s) => s.id).sort()).toEqual(
		firstStreams.map((s) => s.id).sort(),
	)
})

test('backfill ingests a downsampled Activity Stream for each modeled recording, never for "other"', async () => {
	const { user } = await setupBackfillAthlete()

	// Default mocks: four activities (run/ride/swim/yoga) and a 900s HR streams
	// payload returned for every activity id.
	await runIntervalsIcuBackfill(user.id)

	// One stream per backfilled modeled recording (run, bike, swim); the yoga is
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

test('a promoted ride with a power stream earns NP-based Coggan TSS', async () => {
	const { user } = await setupBackfillAthlete()
	// Every activity's streams carry a steady 200W power channel (plus time).
	const time: number[] = []
	const watts: number[] = []
	for (let t = 0; t < 3600; t++) {
		time.push(t)
		watts.push(200)
	}
	server.use(
		http.get(STREAMS_URL, () =>
			HttpResponse.json([
				{ type: 'time', data: time },
				{ type: 'watts', data: watts },
			]),
		),
	)

	// Pin "now" so the mock ride (2026-05-21) sits inside the 42-day load
	// recompute window and gets its TSS provenance stamped.
	await runIntervalsIcuBackfill(user.id, {
		now: new Date('2026-05-28T12:00:00.000Z'),
	})

	// The ride was auto-promoted and its stream yields a true Normalized Power,
	// so TSS is Coggan at high confidence — the exact same path Strava's
	// promoted rides take (ADR 0024); no provider-specific formula. The load
	// recompute stamps provenance on the promoted session row.
	const bike = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: user.id, discipline: 'bike' },
		select: { promotedSessionId: true },
	})
	invariant(bike.promotedSessionId, 'expected the ride to be auto-promoted')
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: bike.promotedSessionId },
	})
	expect(session.tssFormula).toBe('coggan')
	expect(session.tssConfidence).toBe('high')
	// Steady 200W for the ride's 4800s at FTP 250: IF = 0.8, TSS = 85.3.
	expect(session.tssValue).toBeCloseTo(
		((4800 * 200 * (200 / 250)) / (250 * 3600)) * 100,
		1,
	)
})

test('a backfilled activity with no streams persists none and degrades, not errors', async () => {
	const { user } = await setupBackfillAthlete()
	// Intervals.icu answers 404: no recorded streams (manual entry, no device).
	server.use(
		http.get(STREAMS_URL, () => new HttpResponse('Not Found', { status: 404 })),
	)

	const result = await runIntervalsIcuBackfill(user.id)

	invariant(
		result.ok,
		'backfill must succeed even when no streams are available',
	)
	const streams = await prisma.activityStream.count()
	expect(streams).toBe(0)
})

test('a backfilled, auto-promoted recording exposes its stream through the session loader', async () => {
	const { user } = await setupBackfillAthlete()

	await runIntervalsIcuBackfill(user.id)

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

test('a rejected API key flips the connection to revoked and imports nothing', async () => {
	const { user, connection } = await setupBackfillAthlete()
	// The athlete regenerated their key at Intervals.icu: the stored one 401s.
	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: { accessToken: 'stale-key' },
	})

	const result = await runIntervalsIcuBackfill(user.id)

	expect(result).toEqual({ ok: false, reason: 'revoked' })
	const after = await prisma.accountConnection.findUniqueOrThrow({
		where: { id: connection.id },
	})
	expect(after.status).toBe('revoked')
	expect(
		await prisma.activityImport.count({ where: { athleteId: user.id } }),
	).toBe(0)
})

// Backfilling the full count target drives 50 activities through the whole
// import → promote → stream-ingest → load-recompute pipeline sequentially, so
// it legitimately runs several seconds. Give it real headroom (see the Strava
// twin of this test for the full rationale).
test('a prolific athlete is backfilled to the count target, trimming older activities', async () => {
	const { user } = await setupBackfillAthlete()
	const now = new Date('2026-06-30T12:00:00.000Z')
	// 60 daily rides (newest = today). The count target is 50, so the ten oldest
	// fall outside the reach and are not imported.
	mockActivityFeed(
		Array.from({ length: 60 }, (_, i) =>
			ride(`i${5000 + i}`, daysBefore(now, i)),
		),
	)
	// Telemetry isn't the point here; absent streams keep enrichment cheap.
	server.use(
		http.get(STREAMS_URL, () => new HttpResponse('Not Found', { status: 404 })),
	)

	const result = await runIntervalsIcuBackfill(user.id, { now })
	invariant(result.ok, 'expected a successful backfill')

	const imports = await prisma.activityImport.count({
		where: { athleteId: user.id },
	})
	expect(imports).toBe(BACKFILL_TARGET_SESSIONS)
}, 120_000)

test('activities older than the age cap are not imported', async () => {
	const { user } = await setupBackfillAthlete()
	const now = new Date('2026-06-30T12:00:00.000Z')
	mockActivityFeed([
		ride('i6001', daysBefore(now, 10)), // recent — kept
		ride('i6002', daysBefore(now, 200)), // within the age cap — kept
		ride('i6003', daysBefore(now, 400)), // older than the cap — dropped
	])
	server.use(
		http.get(STREAMS_URL, () => new HttpResponse('Not Found', { status: 404 })),
	)

	const result = await runIntervalsIcuBackfill(user.id, { now })
	invariant(result.ok, 'expected a successful backfill')

	const imports = await prisma.activityImport.count({
		where: { athleteId: user.id },
	})
	expect(imports).toBe(2)
})
