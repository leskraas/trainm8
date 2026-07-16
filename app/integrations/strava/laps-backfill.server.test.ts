import { invariant } from '@epic-web/invariant'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { promoteToNewSession } from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import {
	ensureStravaLapsBackfillEnqueued,
	runStravaLapsBackfill,
	STRAVA_LAPS_BACKFILL_JOB_KIND,
} from './laps-backfill.server.ts'

const LAPS_URL = 'https://www.strava.com/api/v3/activities/:id/laps'

// ── the one-shot Strava lap heal (#356) ─────────────────────────────────────
// The sync/backfill path used to file imports without their provider laps, so
// run/bike detections were computed stream-only. The heal fetches laps for each
// lap-less unpromoted import and re-runs detection with the lap-edged path;
// frozen (promoted) Recordings are left untouched (ADR 0012/0032).

async function setupAthlete() {
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...createUser(),
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: { create: [{ discipline: 'run', lthr: 165 }] },
				},
			},
		},
	})
	await prisma.accountConnection.create({
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
	return { user }
}

/** A synced run filed with a stream but no laps (the pre-fix sync's output). */
async function createLaplessRun(athleteId: string, externalId = '90001') {
	const startedAt = new Date('2026-05-21T11:00:00.000Z')
	const imp = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId,
			externalProvider: 'strava',
			externalId,
			startedAt,
			endedAt: new Date(startedAt.getTime() + 120_000),
			durationSec: 120,
			discipline: 'run',
			rawJson: '{}',
		},
	})
	await prisma.activityStream.create({
		data: {
			activityImportId: imp.id,
			resolutionSec: 5,
			sampleCount: 2,
			timeSec: '[0,5]',
			heartrate: '[150,150]',
		},
	})
	return { imp, startedAt }
}

/**
 * Serve a 45/15 laps payload aligned to the activity start, index-less so the
 * heal's wall-clock fallback (`start_date` + `elapsed_time`) is exercised — the
 * path a backfill uses without the raw stream in hand.
 */
function mockLaps(startedAt: Date) {
	const at = (offsetSec: number) =>
		new Date(startedAt.getTime() + offsetSec * 1000).toISOString()
	server.use(
		http.get(LAPS_URL, () =>
			HttpResponse.json([
				{ lap_index: 1, start_date: at(0), elapsed_time: 45 },
				{ lap_index: 2, start_date: at(45), elapsed_time: 15 },
				{ lap_index: 3, start_date: at(60), elapsed_time: 45 },
				{ lap_index: 4, start_date: at(105), elapsed_time: 15 },
			]),
		),
	)
}

test('persists provider laps as markers on a lap-less import', async () => {
	const { user } = await setupAthlete()
	const { imp, startedAt } = await createLaplessRun(user.id)
	mockLaps(startedAt)

	await runStravaLapsBackfill()

	const healed = await prisma.activityImport.findUniqueOrThrow({
		where: { id: imp.id },
		select: { lapsJson: true },
	})
	invariant(healed.lapsJson, 'expected the heal to persist lap markers')
	expect(JSON.parse(healed.lapsJson)).toEqual([
		{ startSec: 0, endSec: 45 },
		{ startSec: 45, endSec: 60 },
		{ startSec: 60, endSec: 105 },
		{ startSec: 105, endSec: 120 },
	])
})

test('never touches a promoted (frozen) Recording', async () => {
	const { user } = await setupAthlete()
	const { imp } = await createLaplessRun(user.id)
	await promoteToNewSession(user.id, imp.id)
	const fetchedIds: string[] = []
	server.use(
		http.get(LAPS_URL, ({ params }) => {
			fetchedIds.push(String(params.id))
			return HttpResponse.json([])
		}),
	)

	await runStravaLapsBackfill()

	expect(fetchedIds).toEqual([])
	const still = await prisma.activityImport.findUniqueOrThrow({
		where: { id: imp.id },
		select: { lapsJson: true },
	})
	expect(still.lapsJson).toBeNull()
})

test('enqueues the heal exactly once; a second boot does not double up', async () => {
	await ensureStravaLapsBackfillEnqueued()
	await ensureStravaLapsBackfillEnqueued()
	const jobs = await prisma.job.count({
		where: { kind: STRAVA_LAPS_BACKFILL_JOB_KIND },
	})
	expect(jobs).toBe(1)
})
