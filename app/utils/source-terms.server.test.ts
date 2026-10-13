import { faker } from '@faker-js/faker/locale/en'
import { expect, test } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import {
	autoSaveImport,
	createActivityImport,
	type ActivityImportInput,
} from './activity-import.server.ts'
import { prisma } from './db.server.ts'
import { readRecordedBindingSet } from './source-terms.server.ts'

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

async function athlete() {
	return prisma.user.create({ data: createUser(), select: { id: true } })
}

async function recorded(
	athleteId: string,
	overrides: Partial<ActivityImportInput>,
	{ save = true } = {},
) {
	const startedAt = overrides.startedAt ?? daysAgo(3)
	const { id } = await createActivityImport(athleteId, {
		externalProvider: 'intervalsicu',
		externalId: faker.string.uuid(),
		startedAt,
		endedAt: new Date(startedAt.getTime() + 45 * 60 * 1000),
		durationSec: 2700,
		distanceM: 8000,
		discipline: 'run',
		rawJson: '{}',
		...overrides,
	})
	if (save) await autoSaveImport(athleteId, id, 'UTC', { recomputeLoad: false })
	return id
}

test('the binding set behind load is every Origin Platform the counted sessions were recorded on', async () => {
	const { id: athleteId } = await athlete()
	await recorded(athleteId, { originPlatform: 'garmin' })
	await recorded(athleteId, { originPlatform: 'garmin' })
	await recorded(athleteId, { externalProvider: 'manual' })

	expect((await readRecordedBindingSet(athleteId)).sort()).toEqual([
		'garmin',
		'upload',
	])
})

test("another athlete's Garmin data is not in this athlete's set", async () => {
	const { id: mine } = await athlete()
	const { id: theirs } = await athlete()
	await recorded(mine, { externalProvider: 'manual' })
	await recorded(theirs, { originPlatform: 'garmin' })

	expect(await readRecordedBindingSet(mine)).toEqual(['upload'])
})

test('an import no completed session counts reads into nothing', async () => {
	const { id: athleteId } = await athlete()
	await recorded(athleteId, { originPlatform: 'garmin' }, { save: false })

	expect(await readRecordedBindingSet(athleteId)).toEqual([])
})

test('a window keeps only the sessions inside it', async () => {
	const { id: athleteId } = await athlete()
	await recorded(athleteId, {
		originPlatform: 'garmin',
		startedAt: daysAgo(60),
	})
	await recorded(athleteId, { originPlatform: 'polar', startedAt: daysAgo(5) })

	expect(
		await readRecordedBindingSet(athleteId, {
			from: daysAgo(28),
			to: new Date(),
		}),
	).toEqual(['polar'])
})
