import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { readAthleteForecast } from './athlete-forecast.server.ts'

test('no Home Place is null whatever days are asked, even none', async () => {
	const { id } = await prisma.user.create({
		data: { ...createUser(), athleteProfile: { create: { timezone: 'UTC' } } },
		select: { id: true },
	})
	const now = new Date()
	for (const dayKeys of [[], ['2026-11-12']]) {
		expect(
			await readAthleteForecast(id, { dayKeys, now, timezone: 'UTC' }),
		).toBeNull()
	}
})

test('a Home Place with no days asked is an empty forecast, not null', async () => {
	const { id } = await prisma.user.create({
		data: {
			...createUser(),
			athleteProfile: {
				create: {
					timezone: 'UTC',
					homePlace: {
						create: {
							name: 'Lillehammer',
							kind: 'By',
							municipality: 'Lillehammer',
							county: 'Innlandet',
							latitude: 61.12,
							longitude: 10.47,
						},
					},
				},
			},
		},
		select: { id: true },
	})
	const forecast = await readAthleteForecast(id, {
		dayKeys: [],
		now: new Date(),
		timezone: 'UTC',
	})
	expect(forecast).toEqual(new Map())
})
