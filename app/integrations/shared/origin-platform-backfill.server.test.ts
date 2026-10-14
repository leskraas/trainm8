import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { intervalsIcuOriginPlatform } from './origin-platform.ts'

/**
 * The data migration that gives every existing import its Origin Platform
 * (ADR 0096 §1, #546), run for real against rows of each kind. The
 * statements are read out of the migration file itself, below its
 * `-- backfill` marker, so what is tested is what ships.
 */
const MIGRATION = path.join(
	process.cwd(),
	'prisma/migrations/20261013130000_every_import_records_its_origin_platform/migration.sql',
)

function backfillStatements(): string[] {
	const sql = fs.readFileSync(MIGRATION, 'utf8')
	const [, backfill] = sql.split(/^-- backfill$/m)
	if (!backfill) throw new Error('no -- backfill marker in the migration')
	return backfill
		.split(/;\s*$/m)
		.map((statement) =>
			statement
				.split('\n')
				.filter((line) => !line.trimStart().startsWith('--'))
				.join('\n')
				.trim(),
		)
		.filter(Boolean)
}

async function runBackfill() {
	for (const statement of backfillStatements()) {
		await prisma.$executeRawUnsafe(statement)
	}
}

let seq = 0
async function insertImport(
	athleteId: string,
	externalProvider: string,
	rawJson: string,
) {
	seq++
	// As history was written before the columns existed: the column default.
	return prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider,
			externalId: `backfill-${seq}`,
			startedAt: new Date('2026-06-01T06:00:00Z'),
			endedAt: new Date('2026-06-01T07:00:00Z'),
			durationSec: 3600,
			discipline: 'run',
			rawJson,
		},
		select: { id: true },
	})
}

async function readBack(id: string) {
	return prisma.activityImport.findUniqueOrThrow({
		where: { id },
		select: { originPlatform: true, deviceName: true },
	})
}

async function athlete() {
	return prisma.user.create({ data: createUser(), select: { id: true } })
}

test('a transport that is the whole story backfills to its platform', async () => {
	const { id: athleteId } = await athlete()
	const strava = await insertImport(athleteId, 'strava', '{"id":1}')
	const upload = await insertImport(athleteId, 'manual', '{}')
	const garmin = await insertImport(athleteId, 'garmin', '{}')

	await runBackfill()

	expect(await readBack(strava.id)).toEqual({
		originPlatform: 'strava',
		deviceName: null,
	})
	expect(await readBack(upload.id)).toEqual({
		originPlatform: 'upload',
		deviceName: null,
	})
	expect(await readBack(garmin.id)).toEqual({
		originPlatform: 'garmin',
		deviceName: null,
	})
})

test('an Intervals.icu Garmin row backfills to garmin with its device', async () => {
	const { id: athleteId } = await athlete()
	const row = await insertImport(
		athleteId,
		'intervalsicu',
		JSON.stringify({
			id: 'i1',
			source: 'GARMIN_CONNECT',
			device_name: 'Garmin Forerunner 965',
		}),
	)

	await runBackfill()

	expect(await readBack(row.id)).toEqual({
		originPlatform: 'garmin',
		deviceName: 'Garmin Forerunner 965',
	})
})

test('an Intervals.icu row from a non-Garmin watch keeps its own platform', async () => {
	const { id: athleteId } = await athlete()
	const polar = await insertImport(
		athleteId,
		'intervalsicu',
		JSON.stringify({ id: 'i2', source: 'POLAR', device_name: 'Polar Grit X2' }),
	)
	const coros = await insertImport(
		athleteId,
		'intervalsicu',
		JSON.stringify({ id: 'i3', source: 'COROS' }),
	)

	await runBackfill()

	expect(await readBack(polar.id)).toEqual({
		originPlatform: 'polar',
		deviceName: 'Polar Grit X2',
	})
	expect(await readBack(coros.id)).toEqual({
		originPlatform: 'coros',
		deviceName: null,
	})
})

test('a payload that is not JSON, or says nothing, backfills to unknown without failing', async () => {
	const { id: athleteId } = await athlete()
	const broken = await insertImport(athleteId, 'intervalsicu', 'not json {')
	const silent = await insertImport(athleteId, 'intervalsicu', '{"id":"i4"}')
	const oddTypes = await insertImport(
		athleteId,
		'intervalsicu',
		JSON.stringify({ id: 'i5', source: 42, device_name: { model: 'x' } }),
	)

	await runBackfill()

	for (const row of [broken, silent, oddTypes]) {
		expect(await readBack(row.id)).toEqual({
			originPlatform: 'unknown',
			deviceName: null,
		})
	}
})

test('the SQL backfill and the ingest rule agree on every source and device', async () => {
	const { id: athleteId } = await athlete()
	const cases: Array<{ source: string | null; device: string | null }> = [
		{ source: 'GARMIN_CONNECT', device: null },
		{ source: 'garmin_connect', device: null },
		{ source: 'POLAR', device: null },
		{ source: 'SUUNTO', device: 'Suunto Race S' },
		{ source: 'COROS', device: null },
		{ source: 'WAHOO', device: 'ELEMNT BOLT' },
		{ source: 'ZWIFT', device: null },
		{ source: 'STRAVA', device: null },
		{ source: 'UPLOAD', device: null },
		{ source: 'MANUAL', device: null },
		{ source: 'OAUTH_CLIENT', device: null },
		{ source: 'DROPBOX', device: null },
		{ source: null, device: null },
		// The override, whatever the source says, in any case.
		{ source: 'UPLOAD', device: 'GARMIN Edge 1050' },
		{ source: 'STRAVA', device: 'Forerunner (garmin)' },
		{ source: null, device: 'Garmin' },
		{ source: 'POLAR', device: '  ' },
		// Non-Latin text passes through as the device's own words.
		{ source: 'COROS', device: 'COROS 高驰 PACE Pro' },
	]
	const rows = []
	for (const { source, device } of cases) {
		const row = await insertImport(
			athleteId,
			'intervalsicu',
			JSON.stringify({
				id: `i-${seq}`,
				...(source != null ? { source } : {}),
				...(device != null ? { device_name: device } : {}),
			}),
		)
		rows.push({ id: row.id, source, device })
	}

	await runBackfill()

	for (const { id, source, device } of rows) {
		const back = await readBack(id)
		expect
			.soft(back.originPlatform, `${source} / ${device}`)
			.toBe(intervalsIcuOriginPlatform({ source, deviceName: device }))
	}
})

test('running the backfill twice gives the same answer', async () => {
	const { id: athleteId } = await athlete()
	const row = await insertImport(
		athleteId,
		'intervalsicu',
		JSON.stringify({ id: 'i9', source: 'UPLOAD', device_name: 'Garmin Edge' }),
	)

	await runBackfill()
	await runBackfill()

	expect(await readBack(row.id)).toEqual({
		originPlatform: 'garmin',
		deviceName: 'Garmin Edge',
	})
})
