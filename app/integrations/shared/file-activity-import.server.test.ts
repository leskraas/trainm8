import { expect, test } from 'vitest'
import { type ActivityImportInput } from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { fileActivityImport } from './file-activity-import.server.ts'

// ADR 0096 §4: before any insert, a candidate is resolved against the
// athlete's imports and aliases; the first rule that matches decides.
//   1. same transport key → the same activity re-fetched, nothing new
//   2. same FIT key → alias, matchedBy 'fit-file-key'
//   3. same discipline, start within 120 s, duration within 5 % → alias, 'fuzzy'
//   4. otherwise a new import

async function athlete() {
	return prisma.user.create({ select: { id: true }, data: createUser() })
}

const RUN_START = new Date('2026-06-01T07:30:00Z')

function run(
	overrides: Partial<ActivityImportInput> = {},
): ActivityImportInput {
	const startedAt = overrides.startedAt ?? RUN_START
	const durationSec = overrides.durationSec ?? 3000
	return {
		externalProvider: 'intervalsicu',
		externalId: 'i1001',
		originPlatform: 'garmin',
		deviceName: 'Garmin Forerunner 965',
		startedAt,
		endedAt: new Date(startedAt.getTime() + durationSec * 1000),
		durationSec,
		distanceM: 10000,
		discipline: 'run',
		rawJson: '{}',
		...overrides,
	}
}

function upload(overrides: Partial<ActivityImportInput> = {}) {
	return run({
		externalProvider: 'manual',
		externalId: 'manual-abc',
		originPlatform: 'upload',
		deviceName: 'Garmin Forerunner 965',
		...overrides,
	})
}

async function aliasesOf(importId: string) {
	return prisma.activityImportAlias.findMany({
		where: { activityImportId: importId },
		select: {
			externalProvider: true,
			externalId: true,
			originPlatform: true,
			deviceName: true,
			fitFileKey: true,
			matchedBy: true,
		},
	})
}

const importCount = (athleteId: string) =>
	prisma.activityImport.count({ where: { athleteId } })

test('an activity nothing matches is filed as a new import', async () => {
	const { id } = await athlete()
	const result = await fileActivityImport(id, run())
	expect(result.kind).toBe('created')
	expect(await importCount(id)).toBe(1)
})

test('the same transport key again is the same activity: no row, no alias', async () => {
	const { id } = await athlete()
	const first = await fileActivityImport(id, run())
	const again = await fileActivityImport(id, run({ distanceM: 10050 }))
	expect(again).toEqual({
		kind: 'duplicate',
		importId: first.importId,
		matchedBy: 'transport-key',
	})
	expect(await importCount(id)).toBe(1)
	expect(await aliasesOf(first.importId)).toEqual([])
})

test('a key already held as an alias is the same activity too', async () => {
	const { id } = await athlete()
	const held = await fileActivityImport(id, run())
	await fileActivityImport(id, upload())
	const again = await fileActivityImport(id, upload())
	expect(again).toEqual({
		kind: 'duplicate',
		importId: held.importId,
		matchedBy: 'transport-key',
	})
	expect(await aliasesOf(held.importId)).toHaveLength(1)
})

test('the same FIT key from another source becomes an alias carrying its own origin', async () => {
	const { id } = await athlete()
	const held = await fileActivityImport(
		id,
		run({ fitFileKey: 'fit:1:4315:3412345678:1780299000' }),
	)
	// Ten minutes off and half the length: only the FIT key can match this.
	const result = await fileActivityImport(
		id,
		upload({
			fitFileKey: 'fit:1:4315:3412345678:1780299000',
			startedAt: new Date(RUN_START.getTime() + 600_000),
			durationSec: 1500,
		}),
	)
	expect(result).toEqual({
		kind: 'duplicate',
		importId: held.importId,
		matchedBy: 'fit-file-key',
	})
	expect(await aliasesOf(held.importId)).toEqual([
		{
			externalProvider: 'manual',
			externalId: 'manual-abc',
			originPlatform: 'upload',
			deviceName: 'Garmin Forerunner 965',
			fitFileKey: 'fit:1:4315:3412345678:1780299000',
			matchedBy: 'fit-file-key',
		},
	])
	expect(await importCount(id)).toBe(1)
})

test("a FIT key held only by an alias leads to that alias's import", async () => {
	const { id } = await athlete()
	const held = await fileActivityImport(id, run())
	await fileActivityImport(
		id,
		upload({ fitFileKey: 'fit:1:4315:3412345678:1780299000' }),
	)
	const third = await fileActivityImport(
		id,
		run({
			externalProvider: 'garmin',
			externalId: 'g-77',
			fitFileKey: 'fit:1:4315:3412345678:1780299000',
			startedAt: new Date(RUN_START.getTime() + 3_600_000),
		}),
	)
	expect(third).toEqual({
		kind: 'duplicate',
		importId: held.importId,
		matchedBy: 'fit-file-key',
	})
})

test('a run within 120 s and 5 % of a held run becomes a fuzzy alias', async () => {
	const { id } = await athlete()
	const held = await fileActivityImport(id, run({ durationSec: 3000 }))
	const result = await fileActivityImport(
		id,
		upload({
			startedAt: new Date(RUN_START.getTime() + 120_000),
			// 5 % of max(3000, 3150) = 157.5 s
			durationSec: 3150,
		}),
	)
	expect(result).toEqual({
		kind: 'duplicate',
		importId: held.importId,
		matchedBy: 'fuzzy',
	})
})

test('different FIT keys do not stop a fuzzy match: a watch and a bike computer are one ride', async () => {
	const { id } = await athlete()
	const held = await fileActivityImport(
		id,
		run({ discipline: 'bike', fitFileKey: 'fit:1:4315:111:1780299000' }),
	)
	const result = await fileActivityImport(
		id,
		upload({ discipline: 'bike', fitFileKey: 'fit:32:12:999:1780299003' }),
	)
	expect(result).toMatchObject({
		kind: 'duplicate',
		importId: held.importId,
		matchedBy: 'fuzzy',
	})
})

test.each([
	[
		'starts 121 s apart',
		{ startedAt: new Date(RUN_START.getTime() + 121_000) },
	],
	['lasts more than 5 % longer', { durationSec: 3160 }],
	['is another discipline', { discipline: 'bike' }],
	['has no duration', { durationSec: 0 }],
] satisfies Array<[string, Partial<ActivityImportInput>]>)(
	'no fuzzy match when the newcomer %s',
	async (_, overrides) => {
		const { id } = await athlete()
		await fileActivityImport(id, run({ durationSec: 3000 }))
		const result = await fileActivityImport(id, upload(overrides))
		expect(result.kind).toBe('created')
		expect(await importCount(id)).toBe(2)
	},
)

test("'other' matches only 'other'", async () => {
	const { id } = await athlete()
	const held = await fileActivityImport(id, run({ discipline: 'other' }))
	expect(
		(await fileActivityImport(id, upload({ discipline: 'other' }))).importId,
	).toBe(held.importId)
	const { id: second } = await athlete()
	await fileActivityImport(second, run({ discipline: 'other' }))
	expect((await fileActivityImport(second, upload())).kind).toBe('created')
})

test('of several fuzzy candidates the closest start wins, then the oldest', async () => {
	const { id } = await athlete()
	// Rows that predate dedupe (they would have merged on the way in).
	const held = (externalId: string, offsetSec: number, createdAt: string) =>
		prisma.activityImport.create({
			select: { id: true },
			data: {
				athleteId: id,
				externalProvider: 'intervalsicu',
				externalId,
				startedAt: new Date(RUN_START.getTime() + offsetSec * 1000),
				endedAt: new Date(RUN_START.getTime() + (offsetSec + 3000) * 1000),
				durationSec: 3000,
				discipline: 'run',
				rawJson: '{}',
				createdAt: new Date(createdAt),
			},
		})
	await held('far', -90, '2026-06-01T09:00:00Z')
	await held('newer', -30, '2026-06-02T09:00:00Z')
	const older = await held('older', 30, '2026-06-01T10:00:00Z')

	const result = await fileActivityImport(id, upload())
	expect(result.importId).toBe(older.id)
})

test("another athlete's activity never matches", async () => {
	const { id: first } = await athlete()
	const { id: second } = await athlete()
	await fileActivityImport(
		first,
		run({ fitFileKey: 'fit:1:4315:3412345678:1780299000' }),
	)
	const result = await fileActivityImport(
		second,
		upload({ fitFileKey: 'fit:1:4315:3412345678:1780299000' }),
	)
	expect(result.kind).toBe('created')
})

test("another leg of the same multisport file is not a match, though it shares the file's key", async () => {
	const { id } = await athlete()
	const key = 'fit:1:3906:3300112233:1780815600'
	await fileActivityImport(
		id,
		upload({ externalId: 'manual-swim', discipline: 'swim', fitFileKey: key }),
	)
	const bike = await fileActivityImport(
		id,
		upload({
			externalId: 'manual-bike',
			discipline: 'bike',
			fitFileKey: key,
			startedAt: new Date(RUN_START.getTime() + 1980_000),
		}),
	)
	expect(bike.kind).toBe('created')
})

test('a multisport leg matches the leg of the same discipline under a shared FIT key', async () => {
	const { id } = await athlete()
	const key = 'fit:1:3906:3300112233:1780815600'
	await fileActivityImport(
		id,
		run({ externalId: 'swim', discipline: 'swim', fitFileKey: key }),
	)
	const bike = await fileActivityImport(
		id,
		run({
			externalId: 'bike',
			discipline: 'bike',
			fitFileKey: key,
			startedAt: new Date(RUN_START.getTime() + 1980_000),
		}),
	)
	const result = await fileActivityImport(
		id,
		upload({
			externalId: 'manual-bike',
			discipline: 'bike',
			fitFileKey: key,
			startedAt: new Date(RUN_START.getTime() + 1980_000),
		}),
	)
	expect(result).toEqual({
		kind: 'duplicate',
		importId: bike.importId,
		matchedBy: 'fit-file-key',
	})
})
