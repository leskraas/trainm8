import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { ingestActivityFile } from '#app/utils/activity-file-ingest.server.ts'
import { autoSaveImport } from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import {
	MOCK_INTERVALSICU_API_KEY,
	MOCK_INTERVALSICU_ATHLETE_ID,
} from '#tests/mocks/intervalsicu.ts'
import {
	dispatchIntervalsIcuFitHarvest,
	ensureIntervalsIcuFitHarvestEnqueued,
	INTERVALSICU_FIT_HARVEST_DISPATCH_JOB_KIND,
	INTERVALSICU_FIT_HARVEST_JOB_KIND,
	runIntervalsIcuFitHarvest,
	runIntervalsIcuFitHarvestJob,
} from './fit-harvest.server.ts'

// The harvest (#547, WI §4): while Intervals.icu still serves Garmin, fetch
// each bridge-era activity's ORIGINAL file (`GET /activity/{id}/file`, one
// request per activity, within the 5,000 requests a day a key allows) and keep
// its bytes and FIT key. It is a job that resumes where it stopped.

const FILE_URL = 'https://intervals.icu/api/v1/activity/:id/file'
const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'fit')
const fixture = (name: string) =>
	new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)))

const LAPS_RUN_KEY = 'fit:1:4315:3412345678:1780552800'
const NOW = new Date('2026-10-13T12:00:00Z')

async function setup(accessToken = MOCK_INTERVALSICU_API_KEY) {
	const user = await prisma.user.create({
		select: { id: true },
		data: { ...createUser(), athleteProfile: { create: { timezone: 'UTC' } } },
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'intervalsicu',
			externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
			accessToken,
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00Z'),
		},
	})
	return { athleteId: user.id, connectionId: connection.id }
}

/** A bridge-era import, as the sync filed it before the harvest existed. */
async function bridgeImport(
	athleteId: string,
	externalId: string,
	{
		originPlatform = 'garmin',
		startedAt = new Date('2026-06-04T06:00:01Z'),
	}: { originPlatform?: string; startedAt?: Date } = {},
) {
	return prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId,
			externalProvider: 'intervalsicu',
			externalId,
			originPlatform,
			deviceName: 'Garmin Forerunner 965',
			startedAt,
			endedAt: new Date(startedAt.getTime() + 2400_000),
			durationSec: 2380,
			distanceM: 8400,
			discipline: 'run',
			rawJson: '{}',
		},
	})
}

/** Serve originals by activity id, counting every request made. */
function serveOriginals(files: Record<string, Uint8Array | number>) {
	const requested: string[] = []
	server.use(
		http.get(FILE_URL, ({ params }) => {
			const id = String(params.id)
			requested.push(id)
			const file = files[id]
			if (file == null || typeof file === 'number') {
				return new HttpResponse(null, { status: file ?? 404 })
			}
			return new HttpResponse(file, {
				headers: { 'content-type': 'application/octet-stream' },
			})
		}),
	)
	return requested
}

const harvested = (id: string) =>
	prisma.activityImport.findUniqueOrThrow({
		where: { id },
		select: {
			fitFileKey: true,
			fitHarvestedAt: true,
			durationSec: true,
			promotedSessionId: true,
			originalFile: { select: { fetchedVia: true, bytes: true } },
		},
	})

test("each bridge-era import keeps its original FIT's bytes and key", async () => {
	const { athleteId } = await setup()
	const run = await bridgeImport(athleteId, 'i1')
	const manual = await bridgeImport(athleteId, 'i2')
	serveOriginals({ i1: gzipSync(fixture('run-with-laps.fit')) })

	const outcome = await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	expect(outcome).toMatchObject({ kind: 'done', requests: 2 })
	const kept = await harvested(run.id)
	expect(kept.fitFileKey).toBe(LAPS_RUN_KEY)
	expect(kept.originalFile?.fetchedVia).toBe('intervalsicu-harvest')
	// Stored as the FIT itself, not the gzip it travelled in.
	expect(new Uint8Array(kept.originalFile!.bytes)).toEqual(
		fixture('run-with-laps.fit'),
	)
	// A manual entry has no original: asked once, marked, never asked again.
	expect(await harvested(manual.id)).toMatchObject({
		fitFileKey: null,
		originalFile: null,
		fitHarvestedAt: NOW,
	})
})

test('a harvest that has finished asks for nothing more', async () => {
	const { athleteId } = await setup()
	await bridgeImport(athleteId, 'i1')
	serveOriginals({ i1: fixture('run-with-laps.fit') })
	await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	const requested = serveOriginals({ i1: fixture('run-with-laps.fit') })
	const again = await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	expect(again).toMatchObject({ kind: 'done', requests: 0 })
	expect(requested).toEqual([])
})

test('the harvest never touches the Recording or its metrics', async () => {
	const { athleteId } = await setup()
	const run = await bridgeImport(athleteId, 'i1')
	await autoSaveImport(athleteId, run.id, 'UTC')
	const before = await harvested(run.id)
	serveOriginals({ i1: fixture('run-with-laps.fit') })

	await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	const after = await harvested(run.id)
	expect(after.durationSec).toBe(before.durationSec)
	expect(after.promotedSessionId).toBe(before.promotedSessionId)
})

test('Garmin-origin activities are harvested first, then the newest', async () => {
	const { athleteId } = await setup()
	await bridgeImport(athleteId, 'polar-new', {
		originPlatform: 'polar',
		startedAt: new Date('2026-09-01T06:00:00Z'),
	})
	await bridgeImport(athleteId, 'garmin-old', {
		startedAt: new Date('2026-03-01T06:00:00Z'),
	})
	await bridgeImport(athleteId, 'garmin-new', {
		startedAt: new Date('2026-08-01T06:00:00Z'),
	})
	const requested = serveOriginals({})

	await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	expect(requested).toEqual(['garmin-new', 'garmin-old', 'polar-new'])
})

test('only Intervals.icu imports are asked for', async () => {
	const { athleteId } = await setup()
	await ingestActivityFile(
		athleteId,
		{ fileName: 'ride.fit', bytes: fixture('ride-with-power.fit') },
		{ timezone: 'UTC' },
	)
	const requested = serveOriginals({})

	const outcome = await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	expect(outcome).toMatchObject({ kind: 'done', requests: 0 })
	expect(requested).toEqual([])
})

test('a spent daily budget pauses the harvest until its window turns', async () => {
	const { athleteId } = await setup()
	await bridgeImport(athleteId, 'a')
	await bridgeImport(athleteId, 'b')
	await bridgeImport(athleteId, 'c')
	serveOriginals({})

	const paused = await runIntervalsIcuFitHarvest(athleteId, {
		now: NOW,
		dailyBudget: 2,
		batchSize: 50,
	})
	expect(paused).toEqual({
		kind: 'paused',
		requests: 2,
		resumeAt: new Date('2026-10-14T12:00:00Z'),
	})

	// Before the window turns, nothing is spent.
	const early = await runIntervalsIcuFitHarvest(athleteId, {
		now: new Date('2026-10-14T11:59:00Z'),
		dailyBudget: 2,
	})
	expect(early).toMatchObject({ kind: 'paused', requests: 0 })

	const resumed = await runIntervalsIcuFitHarvest(athleteId, {
		now: new Date('2026-10-14T12:00:00Z'),
		dailyBudget: 2,
	})
	expect(resumed).toMatchObject({ kind: 'done', requests: 1 })
})

test('athletes who share one key share its daily budget', async () => {
	// Intervals.icu counts requests per API key, and several athletes may
	// connect with the same key (#544).
	const first = await setup('shared-key')
	const second = await setup('shared-key')
	for (const { athleteId } of [first, second]) {
		await bridgeImport(athleteId, `${athleteId}-a`)
		await bridgeImport(athleteId, `${athleteId}-b`)
	}
	serveOriginals({})
	const options = { now: NOW, dailyBudget: 3, batchSize: 50 }

	expect(
		await runIntervalsIcuFitHarvest(first.athleteId, options),
	).toMatchObject({ kind: 'done', requests: 2 })
	expect(
		await runIntervalsIcuFitHarvest(second.athleteId, options),
	).toMatchObject({
		kind: 'paused',
		requests: 1,
		resumeAt: new Date('2026-10-14T12:00:00Z'),
	})
})

test('a batch hands over to the next run without losing count of the day', async () => {
	const { athleteId } = await setup()
	await bridgeImport(athleteId, 'a')
	await bridgeImport(athleteId, 'b')
	serveOriginals({})

	const options = { now: NOW, batchSize: 1, dailyBudget: 1 }

	// The batch is full: carry on straight away...
	expect(await runIntervalsIcuFitHarvest(athleteId, options)).toEqual({
		kind: 'paused',
		requests: 1,
		resumeAt: NOW,
	})
	// ... and the next run still knows the day's one request is spent.
	expect(await runIntervalsIcuFitHarvest(athleteId, options)).toEqual({
		kind: 'paused',
		requests: 0,
		resumeAt: new Date('2026-10-14T12:00:00Z'),
	})
})

test('a rejected key revokes the connection and stops, marking nothing', async () => {
	const { athleteId, connectionId } = await setup('regenerated-key')
	const run = await bridgeImport(athleteId, 'i1')

	const outcome = await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	expect(outcome).toMatchObject({ kind: 'revoked' })
	expect(
		(
			await prisma.accountConnection.findUniqueOrThrow({
				where: { id: connectionId },
			})
		).status,
	).toBe('revoked')
	expect((await harvested(run.id)).fitHarvestedAt).toBeNull()
})

test('a 403 on one file while the key still works marks that activity, not the connection', async () => {
	// Garmin's block may answer per activity; the key itself is still good.
	const { athleteId, connectionId } = await setup()
	const blocked = await bridgeImport(athleteId, 'blocked')
	const next = await bridgeImport(athleteId, 'next', {
		startedAt: new Date('2026-06-01T06:00:00Z'),
	})
	serveOriginals({ blocked: 403, next: fixture('run-with-laps.fit') })

	const outcome = await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	expect(outcome).toMatchObject({ kind: 'done' })
	expect(
		(
			await prisma.accountConnection.findUniqueOrThrow({
				where: { id: connectionId },
			})
		).status,
	).toBe('active')
	expect(await harvested(blocked.id)).toMatchObject({
		fitHarvestedAt: NOW,
		originalFile: null,
	})
	expect((await harvested(next.id)).fitFileKey).toBe(LAPS_RUN_KEY)
})

test('a 403 on a file while the key check itself fails backs off and marks nothing', async () => {
	// The check cannot tell whether the key is fine; the activity must not be
	// written off as unavailable on that.
	const { athleteId, connectionId } = await setup()
	const blocked = await bridgeImport(athleteId, 'blocked')
	serveOriginals({ blocked: 403 })
	server.use(
		http.get(
			'https://intervals.icu/api/v1/athlete/0',
			() => new HttpResponse(null, { status: 503 }),
		),
	)

	const outcome = await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	expect(outcome).toMatchObject({
		kind: 'paused',
		resumeAt: new Date('2026-10-13T13:00:00Z'),
	})
	expect((await harvested(blocked.id)).fitHarvestedAt).toBeNull()
	expect(
		(
			await prisma.accountConnection.findUniqueOrThrow({
				where: { id: connectionId },
			})
		).status,
	).toBe('active')
})

test('rate limiting backs off for an hour and leaves the activity to retry', async () => {
	const { athleteId } = await setup()
	const run = await bridgeImport(athleteId, 'i1')
	serveOriginals({ i1: 429 })

	const outcome = await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	expect(outcome).toMatchObject({
		kind: 'paused',
		resumeAt: new Date('2026-10-13T13:00:00Z'),
	})
	expect((await harvested(run.id)).fitHarvestedAt).toBeNull()
})

test('an original that inflates past the size limit is marked asked and not kept', async () => {
	const { athleteId } = await setup()
	const bomb = await bridgeImport(athleteId, 'bomb')
	// A real FIT followed by 80 MiB of zeros: it gzips to about 80 KB.
	const padded = new Uint8Array(80 * 1024 * 1024)
	padded.set(fixture('run-with-laps.fit'))
	serveOriginals({ bomb: gzipSync(padded) })

	const outcome = await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	expect(outcome).toMatchObject({ kind: 'done', requests: 1 })
	expect(await harvested(bomb.id)).toMatchObject({
		fitHarvestedAt: NOW,
		originalFile: null,
	})
})

test('the job re-enqueues itself until the harvest is done', async () => {
	const { athleteId } = await setup()
	await bridgeImport(athleteId, 'a')
	serveOriginals({})
	const continuations = () =>
		prisma.job.findMany({
			where: { kind: INTERVALSICU_FIT_HARVEST_JOB_KIND, status: 'pending' },
			select: { payload: true, runAt: true },
		})

	await runIntervalsIcuFitHarvestJob(
		{ athleteId },
		{ now: NOW, dailyBudget: 0 },
	)
	const [next] = await continuations()
	expect(JSON.parse(next!.payload)).toEqual({ athleteId })
	expect(next!.runAt).toEqual(new Date('2026-10-14T12:00:00Z'))

	await prisma.job.deleteMany({
		where: { kind: INTERVALSICU_FIT_HARVEST_JOB_KIND },
	})
	await runIntervalsIcuFitHarvestJob({ athleteId }, { now: NOW })
	expect(await continuations()).toEqual([])
})

test('after the harvest, uploading the same FIT matches on its FIT key', async () => {
	const { athleteId } = await setup()
	const run = await bridgeImport(athleteId, 'i1', {
		// Far enough off that only the FIT key can make the match.
		startedAt: new Date('2026-06-04T06:10:00Z'),
	})
	await autoSaveImport(athleteId, run.id, 'UTC')
	serveOriginals({ i1: fixture('run-with-laps.fit') })
	await runIntervalsIcuFitHarvest(athleteId, { now: NOW })

	const result = await ingestActivityFile(
		athleteId,
		{ fileName: 'run.fit', bytes: fixture('run-with-laps.fit') },
		{ timezone: 'UTC' },
	)

	expect(result).toEqual({ status: 'duplicate' })
	expect(
		await prisma.activityImportAlias.findMany({
			where: { activityImportId: run.id },
			select: { matchedBy: true },
		}),
	).toEqual([{ matchedBy: 'fit-file-key' }])
})

test('boot enqueues the dispatch once; the dispatch starts one harvest per active connection', async () => {
	const { athleteId } = await setup()
	const { athleteId: revoked, connectionId } = await setup()
	await prisma.accountConnection.update({
		where: { id: connectionId },
		data: { status: 'revoked' },
	})

	await ensureIntervalsIcuFitHarvestEnqueued()
	await ensureIntervalsIcuFitHarvestEnqueued()
	expect(
		await prisma.job.count({
			where: { kind: INTERVALSICU_FIT_HARVEST_DISPATCH_JOB_KIND },
		}),
	).toBe(1)

	await dispatchIntervalsIcuFitHarvest()
	await dispatchIntervalsIcuFitHarvest()
	const harvests = await prisma.job.findMany({
		where: { kind: INTERVALSICU_FIT_HARVEST_JOB_KIND },
		select: { payload: true },
	})
	expect(harvests.map((h) => JSON.parse(h.payload))).toEqual([{ athleteId }])
	expect(JSON.stringify(harvests)).not.toContain(revoked)
})
