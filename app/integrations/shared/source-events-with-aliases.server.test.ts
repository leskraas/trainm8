import { expect, test } from 'vitest'
import {
	autoSaveImport,
	deleteImportIfAutoSaveMirror,
	updateActivityImportSnapshot,
	type ActivityImportInput,
} from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { fileActivityImport } from './file-activity-import.server.ts'

// ADR 0096 §7: source-side events once an import can have aliases.

const START = new Date('2026-06-01T07:30:00Z')

function run(
	overrides: Partial<ActivityImportInput> = {},
): ActivityImportInput {
	return {
		externalProvider: 'intervalsicu',
		externalId: 'i1001',
		startedAt: START,
		endedAt: new Date(START.getTime() + 3_000_000),
		durationSec: 3000,
		distanceM: 10000,
		discipline: 'run',
		rawJson: '{}',
		...overrides,
	}
}

/** An Intervals.icu run auto-saved as a mirror, and the same run from Strava. */
async function heldWithStravaAlias() {
	const { id } = await prisma.user.create({
		select: { id: true },
		data: createUser(),
	})
	const held = await fileActivityImport(id, run())
	await autoSaveImport(id, held.importId, 'UTC')
	await fileActivityImport(
		id,
		run({ externalProvider: 'strava', externalId: '555', durationSec: 2990 }),
	)
	return { athleteId: id, importId: held.importId }
}

const importExists = (id: string) =>
	prisma.activityImport.count({ where: { id } }).then((n) => n === 1)
const aliasCount = (activityImportId: string) =>
	prisma.activityImportAlias.count({ where: { activityImportId } })

test("a source-side delete of an alias's key removes the alias only", async () => {
	const { athleteId, importId } = await heldWithStravaAlias()

	await deleteImportIfAutoSaveMirror(athleteId, 'strava', '555')

	expect(await importExists(importId)).toBe(true)
	expect(await aliasCount(importId)).toBe(0)
})

test("a source-side delete of the import's own key keeps it while another source vouches for it", async () => {
	const { athleteId, importId } = await heldWithStravaAlias()

	const result = await deleteImportIfAutoSaveMirror(
		athleteId,
		'intervalsicu',
		'i1001',
	)

	expect(result).toEqual({ deleted: false })
	expect(await importExists(importId)).toBe(true)
	expect(await aliasCount(importId)).toBe(1)
})

test('a source-side update for an alias key leaves the import as it is', async () => {
	const { athleteId, importId } = await heldWithStravaAlias()

	const result = await updateActivityImportSnapshot(
		athleteId,
		run({ externalProvider: 'strava', externalId: '555', durationSec: 1200 }),
	)

	expect(result).toEqual({ updated: false })
	expect(
		(
			await prisma.activityImport.findUniqueOrThrow({
				where: { id: importId },
				select: { durationSec: true },
			})
		).durationSec,
	).toBe(3000)
})

test('with no aliases, a delete still removes the mirror (ADR 0049)', async () => {
	const { id } = await prisma.user.create({
		select: { id: true },
		data: createUser(),
	})
	const held = await fileActivityImport(id, run())
	await autoSaveImport(id, held.importId, 'UTC')

	expect(
		await deleteImportIfAutoSaveMirror(id, 'intervalsicu', 'i1001'),
	).toEqual({ deleted: true })
	expect(await importExists(held.importId)).toBe(false)
})
