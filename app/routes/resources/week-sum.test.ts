import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { localDate, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './week-sum.tsx'

// The week a writing-line day belongs to, read for its preview (#505 story 37).

async function setUp() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: { create: { timezone: 'UTC' } },
				},
			},
		},
		select: { id: true, userId: true },
	})
	const created = await createPlanOutline(session.userId, {
		startWeekKey: weekMonday(new Date(), 'UTC'),
		structure: { phases: [{ name: 'Blokk 1', weeks: 4, rhythm: '3:1' }] },
		tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
	})
	if (!created.ok) throw new Error(created.reason)
	return getSessionCookieHeader(session)
}

function read(cookie: string, day: string) {
	return loader({
		request: new Request(
			new URL(`/resources/week-sum?day=${day}`, BASE_URL).toString(),
			{ headers: new Headers({ cookie }) },
		),
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: '/resources/week-sum',
	})
}

test('a day reads its week: the name and every track’s numbers', async () => {
	const cookie = await setUp()
	const today = localDate(new Date(), 'UTC')

	const reply = await read(cookie, today)

	expect(reply.day).toBe(today)
	expect(reply.week?.weekName).toBe('Denne uka')
	expect(reply.week?.volumes.tracks).toEqual([
		expect.objectContaining({
			discipline: 'run',
			currency: 'km',
			planned: 0,
			target: expect.any(Number),
		}),
	])
})

test('a day nobody could point at reads no week, rather than throwing', async () => {
	const cookie = await setUp()
	expect(await read(cookie, '2026-13-45')).toEqual({
		day: '2026-13-45',
		week: null,
	})
})
