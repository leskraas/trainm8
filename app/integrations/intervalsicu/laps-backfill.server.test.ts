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
	ensureIntervalsIcuLapsBackfillEnqueued,
	INTERVALSICU_LAPS_BACKFILL_JOB_KIND,
	runIntervalsIcuLapsBackfill,
} from './laps-backfill.server.ts'

const INTERVALS_URL = 'https://intervals.icu/api/v1/activity/:id/intervals'

// ── the one-shot Intervals.icu lap heal (#356) ──────────────────────────────
// The sweep used to file imports without their interval breakdown, so run/bike
// detections were computed stream-only. The backfill fetches `icu_intervals`
// for each lap-less unpromoted import, persists the edges, and re-runs detection
// — frozen (promoted) Recordings are left untouched (ADR 0012/0032).

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
			provider: 'intervalsicu',
			externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
			accessToken: MOCK_INTERVALSICU_API_KEY,
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	return { user }
}

/** A swept-in run filed with a stream but no laps (the pre-fix sweep's output). */
async function createLaplessRun(athleteId: string, externalId = 'i8001') {
	const imp = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId,
			externalProvider: 'intervalsicu',
			externalId,
			startedAt: new Date('2026-05-21T11:00:00.000Z'),
			endedAt: new Date('2026-05-21T11:20:00.000Z'),
			durationSec: 1200,
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
	return imp
}

/** Serve a 45/15 interval breakdown for every activity id. */
function mockIntervals() {
	server.use(
		http.get(INTERVALS_URL, () =>
			HttpResponse.json({
				id: 'i8001',
				analyzed: true,
				icu_intervals: [
					{ type: 'WORK', start_time: 0, end_time: 45 },
					{ type: 'RECOVERY', start_time: 45, end_time: 60 },
					{ type: 'WORK', start_time: 60, end_time: 105 },
					{ type: 'RECOVERY', start_time: 105, end_time: 120 },
				],
			}),
		),
	)
}

test('persists the interval breakdown as lap markers on a lap-less import', async () => {
	const { user } = await setupAthlete()
	const run = await createLaplessRun(user.id)
	mockIntervals()

	await runIntervalsIcuLapsBackfill()

	const healed = await prisma.activityImport.findUniqueOrThrow({
		where: { id: run.id },
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
	const run = await createLaplessRun(user.id)
	await promoteToNewSession(user.id, run.id)
	const fetchedIds: string[] = []
	server.use(
		http.get(INTERVALS_URL, ({ params }) => {
			fetchedIds.push(String(params.id))
			return HttpResponse.json({ icu_intervals: [] })
		}),
	)

	await runIntervalsIcuLapsBackfill()

	// A frozen Recording is never fetched or re-detected.
	expect(fetchedIds).toEqual([])
	const still = await prisma.activityImport.findUniqueOrThrow({
		where: { id: run.id },
		select: { lapsJson: true },
	})
	expect(still.lapsJson).toBeNull()
})

test('skips imports that already carry laps, and "other" imports', async () => {
	const { user } = await setupAthlete()
	// Already has laps → skipped.
	const withLaps = await createLaplessRun(user.id, 'i8100')
	await prisma.activityImport.update({
		where: { id: withLaps.id },
		data: { lapsJson: '[{"startSec":0,"endSec":30}]' },
	})
	// 'other' discipline → never detected, never fetched (ADR 0015).
	const other = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			externalProvider: 'intervalsicu',
			externalId: 'i8101',
			startedAt: new Date('2026-05-22T17:00:00.000Z'),
			endedAt: new Date('2026-05-22T18:00:00.000Z'),
			durationSec: 3600,
			discipline: 'other',
			rawJson: '{}',
		},
	})
	const fetchedIds: string[] = []
	server.use(
		http.get(INTERVALS_URL, ({ params }) => {
			fetchedIds.push(String(params.id))
			return HttpResponse.json({ icu_intervals: [] })
		}),
	)

	await runIntervalsIcuLapsBackfill()

	expect(fetchedIds).toEqual([])
	const otherAfter = await prisma.activityImport.findUniqueOrThrow({
		where: { id: other.id },
		select: { lapsJson: true },
	})
	expect(otherAfter.lapsJson).toBeNull()
})

test('enqueues the heal exactly once; a second boot does not double up', async () => {
	await ensureIntervalsIcuLapsBackfillEnqueued()
	await ensureIntervalsIcuLapsBackfillEnqueued()
	const jobs = await prisma.job.count({
		where: { kind: INTERVALSICU_LAPS_BACKFILL_JOB_KIND },
	})
	expect(jobs).toBe(1)
})
