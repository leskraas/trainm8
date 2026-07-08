import { invariant } from '@epic-web/invariant'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { promoteToNewSession } from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import {
	MOCK_INTERVALSICU_API_KEY,
	MOCK_INTERVALSICU_ATHLETE_ID,
} from '#tests/mocks/intervalsicu.ts'
import {
	ensureIntervalsIcuTelemetryBackfillEnqueued,
	INTERVALSICU_TELEMETRY_BACKFILL_JOB_KIND,
	runIntervalsIcuTelemetryBackfill,
} from './telemetry-backfill.server.ts'

const STREAMS_URL = 'https://intervals.icu/api/v1/activity/:id/streams'

// ── the one-shot Intervals.icu telemetry heal ───────────────────────────────
// The daily sweep — this provider's primary ingest path — used to file imports
// without fetching their per-sample streams, leaving every swept recording's
// Telemetry Overlay Unavailable and its TSS blind to the power stream. The
// backfill fetches streams once for every stream-less import and recomputes
// load through the existing paths.

async function setupAthlete(overrides: { accessToken?: string } = {}) {
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...createUser(),
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						// Coggan TSS is opt-in per discipline profile (ADR 0008).
						create: [{ discipline: 'bike', ftp: 250, preferCogganTss: true }],
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
			accessToken: overrides.accessToken ?? MOCK_INTERVALSICU_API_KEY,
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	return { user, connection }
}

/** A swept-in ride filed without a stream (the pre-fix sweep's output). */
async function createStreamlessRide(athleteId: string, externalId = 'i7001') {
	return prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId,
			externalProvider: 'intervalsicu',
			externalId,
			startedAt: new Date('2026-05-21T11:00:00.000Z'),
			endedAt: new Date('2026-05-21T12:20:00.000Z'),
			durationSec: 4800,
			discipline: 'bike',
			rawJson: '{}',
		},
	})
}

/** Serve a steady 200W power stream for every activity id. */
function mockPowerStreams() {
	const time: number[] = []
	const watts: number[] = []
	for (let t = 0; t < 4800; t++) {
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
}

test('heals a stream-less import and the recompute upgrades its TSS to NP-based Coggan', async () => {
	const { user } = await setupAthlete()
	const ride = await createStreamlessRide(user.id)
	// Promoted before the stream existed: TSS was uncomputable (no power avg,
	// no HR, no RPE) — exactly the state swept-in recordings were left in.
	const {
		session: { id: sessionId },
	} = await promoteToNewSession(user.id, ride.id)
	const before = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { tssValue: true },
	})
	expect(before.tssValue).toBeNull()
	mockPowerStreams()

	await runIntervalsIcuTelemetryBackfill()

	const stream = await prisma.activityStream.findUnique({
		where: { activityImportId: ride.id },
	})
	invariant(stream, 'expected the heal to persist an Activity Stream')
	// Steady 200W for 4800s at FTP 250: IF = 0.8, TSS = 85.3 — true NP from the
	// recovered stream, at high confidence (ADR 0024), stamped on the promoted
	// session by the recompute.
	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { tssValue: true, tssFormula: true, tssConfidence: true },
	})
	expect(after.tssFormula).toBe('coggan')
	expect(after.tssConfidence).toBe('high')
	expect(after.tssValue).toBeCloseTo(
		((4800 * 200 * (200 / 250)) / (250 * 3600)) * 100,
		1,
	)
})

test('never re-fetches imports that already carry a stream, and skips "other" imports', async () => {
	const { user } = await setupAthlete()
	const withStream = await createStreamlessRide(user.id, 'i7002')
	await prisma.activityStream.create({
		data: {
			activityImportId: withStream.id,
			resolutionSec: 5,
			sampleCount: 2,
			timeSec: '[0,5]',
			power: '[200,200]',
		},
	})
	await prisma.activityImport.create({
		data: {
			athleteId: user.id,
			externalProvider: 'intervalsicu',
			externalId: 'i7003',
			startedAt: new Date('2026-05-22T17:00:00.000Z'),
			endedAt: new Date('2026-05-22T18:00:00.000Z'),
			durationSec: 3600,
			discipline: 'other',
			rawJson: '{}',
		},
	})
	const fetchedIds: string[] = []
	server.use(
		http.get(STREAMS_URL, ({ params }) => {
			fetchedIds.push(String(params.id))
			return new HttpResponse(null, { status: 404 })
		}),
	)

	await runIntervalsIcuTelemetryBackfill()

	expect(fetchedIds).toEqual([])
})

test('an import whose activity has no streams at the source stays honestly stream-less', async () => {
	const { user } = await setupAthlete()
	const ride = await createStreamlessRide(user.id, 'i7004')
	server.use(
		http.get(STREAMS_URL, () => new HttpResponse(null, { status: 404 })),
	)

	await runIntervalsIcuTelemetryBackfill()

	const stream = await prisma.activityStream.findUnique({
		where: { activityImportId: ride.id },
	})
	expect(stream).toBeNull()
})

test('a key rejection flips the connection to revoked and moves on', async () => {
	const { connection, user } = await setupAthlete({
		accessToken: 'stale_or_regenerated_key',
	})
	await createStreamlessRide(user.id, 'i7005')

	await runIntervalsIcuTelemetryBackfill()

	const after = await prisma.accountConnection.findUniqueOrThrow({
		where: { id: connection.id },
	})
	expect(after.status).toBe('revoked')
})

test('boot enqueues the heal exactly once — the job row is the marker', async () => {
	await ensureIntervalsIcuTelemetryBackfillEnqueued()
	await ensureIntervalsIcuTelemetryBackfillEnqueued()

	const jobs = await prisma.job.findMany({
		where: { kind: INTERVALSICU_TELEMETRY_BACKFILL_JOB_KIND },
	})
	expect(jobs).toHaveLength(1)
})
