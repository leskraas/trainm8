import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import {
	addPerformanceResult,
	deletePerformanceResult,
	listPerformanceResults,
	parseFinishTime,
} from './performance-result-writer.server.ts'
import { getDisciplineThresholds } from './training.server.ts'
import { resolveIntensity } from './zones/resolve.ts'

async function athlete() {
	const user = await prisma.user.create({
		select: { id: true },
		data: createUser(),
	})
	await prisma.athleteProfile.create({
		data: {
			userId: user.id,
			timezone: 'UTC',
			disciplineProfiles: { create: [{ discipline: 'run' }] },
		},
	})
	return user
}

const MAY_3 = new Date('2026-05-03T00:00:00Z')

test('parseFinishTime reads a race clock and refuses anything else', () => {
	expect(parseFinishTime('41:30')).toBe(2490)
	expect(parseFinishTime('1:32:00')).toBe(5520)
	expect(parseFinishTime(' 19:05 ')).toBe(1145)
	expect(parseFinishTime('41')).toBeNull()
	expect(parseFinishTime('41:75')).toBeNull()
	expect(parseFinishTime('0:00')).toBeNull()
	expect(parseFinishTime('abc')).toBeNull()
})

test('a typed 10k becomes the race anchor a 10k-pace step resolves against', async () => {
	const user = await athlete()
	const added = await addPerformanceResult(user.id, {
		anchor: '10k',
		timeSec: 2400,
		occurredAt: MAY_3,
		source: 'race',
	})
	expect(added.ok).toBe(true)

	const thresholds = await getDisciplineThresholds(user.id)
	expect(
		resolveIntensity({ kind: 'racePace', event: '10k' }, thresholds.run!),
	).toEqual({ paceMin: 240, paceMax: 240, approximate: true })
})

test('a typed result is never marked as measured by the app', async () => {
	const user = await athlete()
	await addPerformanceResult(user.id, {
		anchor: 'hm',
		timeSec: 5520,
		occurredAt: MAY_3,
		source: 'timeTrial',
	})
	const [row] = await listPerformanceResults(user.id)
	expect(row).toMatchObject({
		anchor: 'hm',
		distanceM: 21097,
		timeSec: 5520,
		source: 'timeTrial',
		verified: false,
	})
})

test('a result in the future is refused', async () => {
	const user = await athlete()
	const refused = await addPerformanceResult(
		user.id,
		{
			anchor: '5k',
			timeSec: 1200,
			occurredAt: new Date('2026-06-01T00:00:00Z'),
			source: 'race',
		},
		new Date('2026-05-10T12:00:00Z'),
	)
	expect(refused).toEqual({ ok: false, reason: 'future' })
	expect(await listPerformanceResults(user.id)).toEqual([])
})

test('an athlete deletes their own result and nobody else’s', async () => {
	const owner = await athlete()
	const other = await athlete()
	await addPerformanceResult(owner.id, {
		anchor: '5k',
		timeSec: 1200,
		occurredAt: MAY_3,
		source: 'race',
	})
	const [row] = await listPerformanceResults(owner.id)

	expect(await deletePerformanceResult(other.id, row!.id)).toBe(false)
	expect(await listPerformanceResults(owner.id)).toHaveLength(1)

	expect(await deletePerformanceResult(owner.id, row!.id)).toBe(true)
	expect(await listPerformanceResults(owner.id)).toEqual([])
})

test('a result with no athlete profile is refused rather than orphaned', async () => {
	const user = await prisma.user.create({
		select: { id: true },
		data: createUser(),
	})
	expect(
		await addPerformanceResult(user.id, {
			anchor: '5k',
			timeSec: 1200,
			occurredAt: MAY_3,
			source: 'race',
		}),
	).toEqual({ ok: false, reason: 'no-profile' })
})
