import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './index.tsx'

const ROUTE_PATH = '/'
const LOADER_ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

async function setupUser() {
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
	return session
}

async function createWorkoutWithSession(
	userId: string,
	scheduledAt: Date,
	status = 'scheduled',
	activityType = 'run',
	title?: string,
) {
	return prisma.workout.create({
		data: {
			title: title ?? faker.lorem.words(3),
			activityType,
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									description: 'warm up',
									activity: activityType,
									intensity: 'easy',
									orderIndex: 0,
								},
							],
						},
					},
				],
			},
			sessions: {
				create: { userId, scheduledAt, status },
			},
		},
		select: { id: true, sessions: { select: { id: true } } },
	})
}

function makeRequest(cookieHeader?: string) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	return new Request(url.toString(), { method: 'GET', headers })
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

test('unauthenticated user receives marketing data', async () => {
	const request = makeRequest()
	const response = await loader({ request, ...LOADER_ARGS_BASE })
	const data = response as { isAuthenticated: false }
	expect(data.isAuthenticated).toBe(false)
})

test('authenticated user receives dashboard data with sessions', async () => {
	const session = await setupUser()
	await createWorkoutWithSession(session.userId, inDays(1))
	await createWorkoutWithSession(session.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		isAuthenticated: true
		nextSession: { id: string } | null
		upcomingSessions: Array<{ id: string }>
	}
	expect(data.isAuthenticated).toBe(true)
	expect(data.nextSession).not.toBeNull()
	expect(data.upcomingSessions.length).toBeGreaterThanOrEqual(1)
})

test('authenticated user with no sessions gets null nextSession and empty list', async () => {
	const session = await setupUser()
	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		isAuthenticated: true
		nextSession: null
		upcomingSessions: Array<{ id: string }>
	}
	expect(data.isAuthenticated).toBe(true)
	expect(data.nextSession).toBeNull()
	expect(data.upcomingSessions).toHaveLength(0)
})

test('dashboard nextSession is the chronologically first session', async () => {
	const session = await setupUser()
	const w1 = await createWorkoutWithSession(
		session.userId,
		inDays(3),
		'scheduled',
		'run',
		'Later Run',
	)
	const w2 = await createWorkoutWithSession(
		session.userId,
		inDays(1),
		'scheduled',
		'bike',
		'Sooner Ride',
	)

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		nextSession: { id: string; workout: { title: string } }
		upcomingSessions: Array<{ id: string }>
	}
	expect(data.nextSession!.id).toBe(w2.sessions[0]!.id)
})

test('upcomingSessions contains at most 5 sessions after the first', async () => {
	const session = await setupUser()
	for (let i = 1; i <= 8; i++) {
		await createWorkoutWithSession(session.userId, inDays(i))
	}

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		nextSession: { id: string }
		upcomingSessions: Array<{ id: string }>
	}
	expect(data.nextSession).not.toBeNull()
	expect(data.upcomingSessions.length).toBeLessThanOrEqual(5)
})
