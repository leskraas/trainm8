import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { parseFinishTime } from './performance-result-entry.ts'
import {
	addPerformanceResult,
	countPerformanceResults,
	deletePerformanceResult,
	listPerformanceResults,
} from './performance-result-writer.server.ts'
import { getDisciplineThresholds } from './training.server.ts'
import { resolveIntensity } from './zones/resolve.ts'

async function athlete(timezone = 'UTC') {
	const user = await prisma.user.create({
		select: { id: true },
		data: createUser(),
	})
	await prisma.athleteProfile.create({
		data: {
			userId: user.id,
			timezone,
			disciplineProfiles: { create: [{ discipline: 'run' }] },
		},
	})
	return user
}

const MAY_3 = '2026-05-03'

test('parseFinishTime reads a race clock and refuses anything else', () => {
	expect(parseFinishTime('41:30')).toBe(2490)
	expect(parseFinishTime('1:32:00')).toBe(5520)
	expect(parseFinishTime(' 19:05 ')).toBe(1145)
	expect(parseFinishTime('41')).toBeNull()
	expect(parseFinishTime('41:75')).toBeNull()
	expect(parseFinishTime('0:00')).toBeNull()
	expect(parseFinishTime('abc')).toBeNull()
})

test('parseFinishTime takes a full stop or comma for the colon', () => {
	expect(parseFinishTime('41.30')).toBe(2490)
	expect(parseFinishTime('41,30')).toBe(2490)
	expect(parseFinishTime('1.32.00')).toBe(5520)
	expect(parseFinishTime('41,5')).toBeNull()
})

test('a time no one could run at that distance is refused', async () => {
	const user = await athlete()
	const add = (anchor: '1500m' | '5k' | 'marathon', timeSec: number) =>
		addPerformanceResult(user.id, {
			anchor,
			timeSec,
			date: MAY_3,
			source: 'race',
		})
	// `3:15` meant as 3 h 15 reads as 3 min 15 s.
	expect(await add('marathon', parseFinishTime('3:15')!)).toEqual({
		ok: false,
		reason: 'implausible',
	})
	expect(await add('1500m', 1)).toEqual({ ok: false, reason: 'implausible' })
	expect(await add('5k', parseFinishTime('999:59')!)).toEqual({
		ok: false,
		reason: 'implausible',
	})
	expect(await add('marathon', parseFinishTime('3:15:00')!)).toMatchObject({
		ok: true,
	})
	expect(await listPerformanceResults(user.id)).toHaveLength(1)
})

test('a day that is not on the calendar is refused, not rolled over', async () => {
	const user = await athlete()
	for (const date of ['2026-02-31', '0000-01-01', '2026-13-01', '3 May']) {
		expect(
			await addPerformanceResult(user.id, {
				anchor: '5k',
				timeSec: 1200,
				date,
				source: 'race',
			}),
		).toEqual({ ok: false, reason: 'bad-date' })
	}
	expect(await listPerformanceResults(user.id)).toEqual([])
})

test('"today" is the athlete’s own day, not the server’s', async () => {
	// 22:30Z on 25 May is 00:30 on 26 May in Oslo.
	const now = new Date('2026-05-25T22:30:00Z')
	const input = {
		anchor: '5k',
		timeSec: 1200,
		date: '2026-05-26',
		source: 'race',
	} as const
	const oslo = await athlete('Europe/Oslo')
	expect(await addPerformanceResult(oslo.id, input, now)).toMatchObject({
		ok: true,
	})
	const london = await athlete('UTC')
	expect(await addPerformanceResult(london.id, input, now)).toEqual({
		ok: false,
		reason: 'future',
	})
})

test('a second result at the same distance and day replaces the first', async () => {
	const user = await athlete()
	const input = {
		anchor: '10k',
		timeSec: 2550,
		date: MAY_3,
		source: 'race',
	} as const
	expect(await addPerformanceResult(user.id, input)).toEqual({
		ok: true,
		replaced: false,
	})
	expect(
		await addPerformanceResult(user.id, { ...input, timeSec: 2490 }),
	).toEqual({ ok: true, replaced: true })
	const rows = await listPerformanceResults(user.id)
	expect(rows).toHaveLength(1)
	expect(rows[0]!.timeSec).toBe(2490)
	const thresholds = await getDisciplineThresholds(user.id)
	expect(
		resolveIntensity({ kind: 'racePace', event: '10k' }, thresholds.run!),
	).toMatchObject({ paceMin: 249 })
})

test('only run results are listed and counted', async () => {
	const user = await athlete()
	await addPerformanceResult(user.id, {
		anchor: '5k',
		timeSec: 1200,
		date: MAY_3,
		source: 'race',
	})
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId: user.id },
	})
	await prisma.performanceResult.create({
		data: {
			athleteProfileId: profile.id,
			discipline: 'bike',
			distanceM: 5000,
			timeSec: 400,
			occurredAt: new Date('2026-05-04T00:00:00Z'),
			source: 'race',
		},
	})
	expect(await listPerformanceResults(user.id)).toHaveLength(1)
	expect(await countPerformanceResults(user.id)).toBe(1)
})

test('a typed 10k becomes the race anchor a 10k-pace step resolves against', async () => {
	const user = await athlete()
	const added = await addPerformanceResult(user.id, {
		anchor: '10k',
		timeSec: 2400,
		date: MAY_3,
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
		date: MAY_3,
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
			date: '2026-06-01',
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
		date: MAY_3,
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
			date: MAY_3,
			source: 'race',
		}),
	).toEqual({ ok: false, reason: 'no-profile' })
})
