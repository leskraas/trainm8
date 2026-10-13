import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { fileIntervalsIcuActivities } from '#app/integrations/intervalsicu/ingest.server.ts'
import { IntervalsIcuActivitySchema } from '#app/integrations/intervalsicu/types.ts'
import { ingestActivityFile } from '#app/utils/activity-file-ingest.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { ingestFit } from './ingest-fit.server.ts'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'fit')
const fixture = (name: string) =>
	new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)))

const LAPS_RUN_KEY = 'fit:1:4315:3412345678:1780552800'
const TRIATHLON_KEY = 'fit:1:3906:3300112233:1780815600'

async function athlete() {
	return prisma.user.create({ select: { id: true }, data: createUser() })
}

/** The interval run in `run-with-laps.fit`, as Intervals.icu lists it. */
async function syncIntervalsRun(athleteId: string) {
	await fileIntervalsIcuActivities(
		athleteId,
		[
			IntervalsIcuActivitySchema.parse({
				id: 'i5501',
				type: 'Run',
				// Intervals.icu reports moving time; the FIT says timer time.
				moving_time: 2380,
				elapsed_time: 2400,
				distance: 8400,
				start_date: '2026-06-04T06:00:01Z',
				source: 'GARMIN_CONNECT',
				device_name: 'Garmin Forerunner 965',
			}),
		],
		'UTC',
	)
	return prisma.activityImport.findUniqueOrThrow({
		where: {
			athleteId_externalProvider_externalId: {
				athleteId,
				externalProvider: 'intervalsicu',
				externalId: 'i5501',
			},
		},
		select: { id: true, promotedSessionId: true },
	})
}

const sessionCount = (userId: string) =>
	prisma.workoutSession.count({ where: { userId } })

test('uploading a FIT already imported through Intervals.icu creates an alias, not a session', async () => {
	const { id } = await athlete()
	const held = await syncIntervalsRun(id)
	expect(await sessionCount(id)).toBe(1)

	const result = await ingestActivityFile(
		id,
		{ fileName: 'run-with-laps.fit', bytes: fixture('run-with-laps.fit') },
		{ timezone: 'UTC' },
	)

	expect(result).toEqual({ status: 'duplicate' })
	expect(await sessionCount(id)).toBe(1)
	expect(await prisma.activityImport.count({ where: { athleteId: id } })).toBe(
		1,
	)
	expect(
		await prisma.activityImportAlias.findMany({
			where: { activityImportId: held.id },
			select: {
				externalProvider: true,
				originPlatform: true,
				fitFileKey: true,
				matchedBy: true,
			},
		}),
	).toEqual([
		{
			externalProvider: 'manual',
			originPlatform: 'upload',
			fitFileKey: LAPS_RUN_KEY,
			matchedBy: 'fuzzy',
		},
	])
})

test('a mirror with no original file takes the uploaded FIT, keeping who it is', async () => {
	const { id } = await athlete()
	const held = await syncIntervalsRun(id)

	await ingestActivityFile(
		id,
		{ fileName: 'run-with-laps.fit', bytes: fixture('run-with-laps.fit') },
		{ timezone: 'UTC' },
	)

	const refreshed = await prisma.activityImport.findUniqueOrThrow({
		where: { id: held.id },
		select: {
			externalProvider: true,
			externalId: true,
			originPlatform: true,
			deviceName: true,
			fitFileKey: true,
			durationSec: true,
			lapsJson: true,
			promotedSessionId: true,
			originalFile: { select: { source: true, bytes: true } },
			stream: { select: { id: true } },
		},
	})
	expect(refreshed).toMatchObject({
		externalProvider: 'intervalsicu',
		externalId: 'i5501',
		originPlatform: 'garmin',
		deviceName: 'Garmin Forerunner 965',
		fitFileKey: LAPS_RUN_KEY,
		// The device's own timer time replaces Intervals.icu's moving time.
		durationSec: 2400,
		promotedSessionId: held.promotedSessionId,
	})
	expect(JSON.parse(refreshed.lapsJson!) as unknown[]).toHaveLength(7)
	expect(refreshed.stream).not.toBeNull()
	expect(refreshed.originalFile?.source).toBe('upload')
	expect(new Uint8Array(refreshed.originalFile!.bytes)).toEqual(
		fixture('run-with-laps.fit'),
	)
})

test('a Recording the athlete built on is never refreshed, but the alias is kept', async () => {
	const { id } = await athlete()
	const held = await syncIntervalsRun(id)
	await prisma.sessionLog.create({
		data: { sessionId: held.promotedSessionId!, content: 'Tung', rpe: 6 },
	})

	const result = await ingestActivityFile(
		id,
		{ fileName: 'run-with-laps.fit', bytes: fixture('run-with-laps.fit') },
		{ timezone: 'UTC' },
	)

	expect(result.status).toBe('duplicate')
	const kept = await prisma.activityImport.findUniqueOrThrow({
		where: { id: held.id },
		select: {
			fitFileKey: true,
			durationSec: true,
			originalFile: { select: { id: true } },
			_count: { select: { aliases: true } },
		},
	})
	expect(kept).toEqual({
		fitFileKey: null,
		durationSec: 2380,
		originalFile: null,
		_count: { aliases: 1 },
	})
})

test('a new FIT keeps its key, device, laps and original bytes', async () => {
	const { id } = await athlete()
	const result = await ingestActivityFile(
		id,
		{ fileName: 'run-with-laps.fit', bytes: fixture('run-with-laps.fit') },
		{ timezone: 'UTC' },
	)
	expect(result.status).toBe('imported')
	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: id },
		select: {
			externalProvider: true,
			originPlatform: true,
			fitFileKey: true,
			deviceName: true,
			lapsJson: true,
			originalFile: { select: { source: true, format: true, bytes: true } },
		},
	})
	expect(imported).toMatchObject({
		externalProvider: 'manual',
		originPlatform: 'upload',
		fitFileKey: LAPS_RUN_KEY,
		deviceName: 'Garmin Forerunner 965',
	})
	expect((JSON.parse(imported.lapsJson!) as unknown[])[1]).toEqual({
		startSec: 600,
		endSec: 780,
	})
	expect(imported.originalFile).toMatchObject({
		source: 'upload',
		format: 'fit',
	})
	expect(new Uint8Array(imported.originalFile!.bytes)).toEqual(
		fixture('run-with-laps.fit'),
	)
})

test('a triathlon file becomes one session per leg, and a re-upload adds nothing', async () => {
	const { id } = await athlete()
	const bytes = fixture('triathlon.fit')
	await ingestActivityFile(
		id,
		{ fileName: 'triathlon.fit', bytes },
		{ timezone: 'UTC' },
	)
	const legs = await prisma.activityImport.findMany({
		where: { athleteId: id },
		orderBy: { startedAt: 'asc' },
		select: { discipline: true, fitFileKey: true, promotedSessionId: true },
	})
	expect(legs.map((l) => [l.discipline, l.fitFileKey])).toEqual([
		['swim', TRIATHLON_KEY],
		['bike', TRIATHLON_KEY],
		['run', TRIATHLON_KEY],
	])
	expect(legs.every((l) => l.promotedSessionId != null)).toBe(true)

	const again = await ingestActivityFile(
		id,
		{ fileName: 'renamed.fit', bytes },
		{ timezone: 'UTC' },
	)
	expect(again).toEqual({ status: 'duplicate' })
	expect(await sessionCount(id)).toBe(3)
})

test("a vendor's FIT is filed under the vendor's id, one id per leg", async () => {
	const { id } = await athlete()
	const results = await ingestFit(id, fixture('triathlon.fit'), {
		externalProvider: 'polar',
		externalId: 'p-123',
		originPlatform: 'polar',
		fileSource: 'polar',
		timezone: 'UTC',
	})
	expect(results.map((r) => r.status)).toEqual([
		'imported',
		'imported',
		'imported',
	])
	const legs = await prisma.activityImport.findMany({
		where: { athleteId: id },
		orderBy: { startedAt: 'asc' },
		select: { externalProvider: true, externalId: true, originPlatform: true },
	})
	expect(legs).toEqual([
		{ externalProvider: 'polar', externalId: 'p-123', originPlatform: 'polar' },
		{
			externalProvider: 'polar',
			externalId: 'p-123#2',
			originPlatform: 'polar',
		},
		{
			externalProvider: 'polar',
			externalId: 'p-123#3',
			originPlatform: 'polar',
		},
	])
})
