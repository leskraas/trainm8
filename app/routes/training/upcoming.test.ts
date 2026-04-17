import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './upcoming.tsx'

const ROUTE_PATH = '/training/upcoming'
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
) {
	const workout = await prisma.workout.create({
		data: {
			title: faker.lorem.words(3),
			activityType: 'run',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									description: 'warm up',
									activity: 'run',
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
	return workout
}

function makeRequest(cookieHeader?: string) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	return new Request(url.toString(), { method: 'GET', headers })
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

test('unauthenticated requests redirect to login', async () => {
	const request = makeRequest()
	const response = await loader({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)
	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/login')
})

test('authenticated user receives only their own sessions', async () => {
	const userA = await setupUser()
	const userB = await setupUser()
	await createWorkoutWithSession(userA.userId, inDays(2))
	await createWorkoutWithSession(userB.userId, inDays(3))

	const cookieHeader = await getSessionCookieHeader(userA)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as { sessions: Array<{ id: string }> }
	expect(data.sessions).toHaveLength(1)
})

test('response contract includes expected session and workout fields', async () => {
	const session = await setupUser()
	await createWorkoutWithSession(session.userId, inDays(1))

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		sessions: Array<{
			id: string
			scheduledAt: Date
			status: string
			workout: {
				id: string
				title: string
				description: string | null
				activityType: string
				blocks: Array<{
					id: string
					name: string | null
					orderIndex: number
					steps: Array<{
						id: string
						description: string
						activity: string
						intensity: string | null
						orderIndex: number
					}>
				}>
			}
		}>
	}

	expect(data.sessions).toHaveLength(1)
	const s = data.sessions[0]!
	expect(s).toHaveProperty('id')
	expect(s).toHaveProperty('scheduledAt')
	expect(s).toHaveProperty('status')
	expect(s.workout).toHaveProperty('id')
	expect(s.workout).toHaveProperty('title')
	expect(s.workout).toHaveProperty('activityType')
	expect(s.workout.blocks).toHaveLength(1)
	expect(s.workout.blocks[0]!.steps).toHaveLength(1)
	expect(s.workout.blocks[0]!.steps[0]).toHaveProperty('description')
	expect(s.workout.blocks[0]!.steps[0]).toHaveProperty('activity')
	expect(s.workout.blocks[0]!.steps[0]).toHaveProperty('intensity')
})
