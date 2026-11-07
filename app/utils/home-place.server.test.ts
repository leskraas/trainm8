import { expect, test } from 'vitest'
import { getOrCreateAthleteProfile } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import {
	readHomePlace,
	removeHomePlace,
	setHomePlace,
} from './home-place.server.ts'

async function athlete() {
	return prisma.user.create({
		data: { ...createUser(), athleteProfile: { create: { timezone: 'UTC' } } },
		select: { id: true },
	})
}

const LILLEHAMMER = {
	name: 'Lillehammer',
	kind: 'By',
	municipality: 'Lillehammer',
	county: 'Innlandet',
	latitude: 61.11514,
	longitude: 10.46628,
}

test('choosing a place stores the name and a point rounded to 2 decimals, nothing finer', async () => {
	const { id } = await athlete()
	const result = await setHomePlace(id, LILLEHAMMER)
	expect(result).toEqual({
		ok: true,
		place: { ...LILLEHAMMER, latitude: 61.12, longitude: 10.47 },
	})
	const row = await prisma.homePlace.findFirstOrThrow({
		where: { athleteProfile: { userId: id } },
	})
	expect([row.latitude, row.longitude]).toEqual([61.12, 10.47])
	expect(await readHomePlace(id)).toEqual({
		...LILLEHAMMER,
		latitude: 61.12,
		longitude: 10.47,
	})
})

test('choosing again replaces the place; Fjern removes it', async () => {
	const { id } = await athlete()
	await setHomePlace(id, LILLEHAMMER)
	await setHomePlace(id, {
		name: 'Tromsø',
		kind: 'Kommune',
		municipality: 'Tromsø',
		county: 'Troms',
		latitude: 69.65455,
		longitude: 18.96366,
	})
	expect(
		await prisma.homePlace.count({ where: { athleteProfile: { userId: id } } }),
	).toBe(1)
	expect((await readHomePlace(id))?.name).toBe('Tromsø')
	await removeHomePlace(id)
	expect(await readHomePlace(id)).toBeNull()
	// Removing what is not there is no error.
	await removeHomePlace(id)
})

test('a point outside Kartverket’s area is refused, and the place is unchanged', async () => {
	const { id } = await athlete()
	await setHomePlace(id, LILLEHAMMER)
	expect(
		await setHomePlace(id, {
			...LILLEHAMMER,
			name: 'Chamonix',
			latitude: 45.92,
			longitude: 6.87,
		}),
	).toEqual({ ok: false, reason: 'outside-area' })
	expect((await readHomePlace(id))?.name).toBe('Lillehammer')
})

test('the place goes with the account', async () => {
	const { id } = await athlete()
	await setHomePlace(id, LILLEHAMMER)
	await prisma.user.delete({ where: { id } })
	expect(await prisma.homePlace.count()).toBe(0)
})

test('choosing a place before the athlete has a profile creates it as every other path does, with its discipline profiles', async () => {
	const user = await prisma.user.create({
		data: createUser(),
		select: { id: true },
	})
	await setHomePlace(user.id, LILLEHAMMER)
	const fresh = await prisma.user.create({
		data: createUser(),
		select: { id: true },
	})
	const expected = await getOrCreateAthleteProfile(fresh.id)
	const disciplines = await prisma.disciplineProfile.findMany({
		where: { athleteProfile: { userId: user.id } },
		select: { discipline: true },
		orderBy: { discipline: 'asc' },
	})
	expect(disciplines.map((d) => d.discipline)).toEqual(
		expected.disciplineProfiles.map((d) => d.discipline).sort(),
	)
	expect(disciplines.length).toBeGreaterThan(0)
	expect(await readHomePlace(user.id)).toMatchObject({ name: 'Lillehammer' })
})
