import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader as meLoader } from '../me.tsx'
import { action, loader } from './level.tsx'

// _Nivå og økter_ in Meg (#571): the Training Level, the activities and the
// Session Preferences the start asked, shown and changed.

const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/settings/level',
}

async function setUp() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return {
		userId: session.userId,
		cookie: await getSessionCookieHeader(session),
	}
}

function request(cookie: string, entries?: Array<[string, string]>) {
	return new Request(new URL('/settings/level', BASE_URL).toString(), {
		...(entries
			? {
					method: 'POST',
					body: new URLSearchParams(entries).toString(),
				}
			: {}),
		headers: {
			cookie,
			...(entries
				? { 'content-type': 'application/x-www-form-urlencoded' }
				: {}),
		},
	})
}

test('an athlete from before the start has no level, no preferences and, with no plan, no activities', async () => {
	const { cookie } = await setUp()
	expect(await loader({ request: request(cookie), ...ARGS })).toEqual({
		level: null,
		preferences: [],
		activities: [],
	})
})

test('Meg shows the level and preferences kept, and the activities the plan has tracks for', async () => {
	const { userId, cookie } = await setUp()
	await prisma.athleteProfile.create({
		data: {
			userId,
			trainingLevel: 'experienced',
			sessionPreferences: JSON.stringify(['short', 'long']),
		},
	})
	await createOpenEndedPlan(userId, { discipline: 'run', weeklyHours: 4 })
	expect(await loader({ request: request(cookie), ...ARGS })).toEqual({
		level: 'experienced',
		preferences: ['long', 'short'],
		activities: ['Løping'],
	})
	const me = await meLoader({
		request: request(cookie),
		...ARGS,
		unstable_pattern: '/me',
	})
	expect(me.startAnswersDetail).toBe(
		'Erfaren · Lange, rolige turer, Korte økter',
	)
})

test('the level and preferences change in Meg, and none is a choice too', async () => {
	const { userId, cookie } = await setUp()
	const saved = await action({
		request: request(cookie, [
			['level', 'competitive'],
			['preferences', 'surprise'],
			['preferences', 'threshold'],
		]),
		...ARGS,
	})
	expect(saved).toMatchObject({ saved: { ok: true } })
	expect(await loader({ request: request(cookie), ...ARGS })).toMatchObject({
		level: 'competitive',
		preferences: ['threshold', 'surprise'],
	})

	await action({ request: request(cookie, [['level', 'beginner']]), ...ARGS })
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { trainingLevel: true, sessionPreferences: true },
	})
	expect(profile).toEqual({
		trainingLevel: 'beginner',
		sessionPreferences: '[]',
	})
})

test('a level that does not exist is refused, and nothing is stored', async () => {
	const { userId, cookie } = await setUp()
	const refused = (await action({
		request: request(cookie, [['level', 'elite']]),
		...ARGS,
	})) as unknown as { init: { status: number } | null }
	expect(refused.init?.status).toBe(400)
	expect(
		await prisma.athleteProfile.count({
			where: { userId, trainingLevel: { not: null } },
		}),
	).toBe(0)
})
