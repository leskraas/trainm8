import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createSessionLog } from '#app/utils/session-log.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader, action } from './upcoming.$sessionId.tsx'

const ROUTE_PATH = '/training/upcoming/:sessionId'
const LOADER_ARGS_BASE = {
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

async function createWorkoutSession(
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
						name: 'Main set',
						orderIndex: 0,
						steps: {
							create: [
								{
									description: '4 x 5 min steady',
									activity: 'run',
									intensity: 'moderate',
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
		select: { sessions: { select: { id: true } } },
	})
	return workout.sessions[0]!
}

function makeRequest(sessionId: string, cookieHeader?: string) {
	const url = new URL(`/training/upcoming/${sessionId}`, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	return new Request(url.toString(), { method: 'GET', headers })
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

test('unauthenticated requests redirect to login', async () => {
	const request = makeRequest('missing-session')
	const response = await loader({
		request,
		params: { sessionId: 'missing-session' },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/login')
})

test('authenticated user receives their own session with workout structure', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as {
		session: {
			id: string
			status: string
			workout: { blocks: Array<{ steps: Array<{ description: string }> }> }
		}
	}

	expect(data.session.id).toBe(createdSession.id)
	expect(data.session.status).toBe('completed')
	expect(data.session.workout.blocks).toHaveLength(1)
	expect(data.session.workout.blocks[0]!.steps[0]!.description).toContain(
		'steady',
	)
})

test('loader includes session log when one exists', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	await createSessionLog({
		sessionId: createdSession.id,
		content: 'Felt great today',
		rpe: 7,
	})

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as {
		session: {
			id: string
			sessionLog: { content: string; rpe: number | null } | null
		}
	}

	expect(data.session.sessionLog).not.toBeNull()
	expect(data.session.sessionLog!.content).toBe('Felt great today')
	expect(data.session.sessionLog!.rpe).toBe(7)
})

test('loader returns null sessionLog when none exists', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(user.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as {
		session: {
			id: string
			sessionLog: null
		}
	}

	expect(data.session.sessionLog).toBeNull()
})

test('authenticated user cannot access another user session detail', async () => {
	const owner = await setupUser()
	const otherUser = await setupUser()
	const createdSession = await createWorkoutSession(owner.userId, inDays(1))

	const cookieHeader = await getSessionCookieHeader(otherUser)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(404)
})

function makeActionRequest(
	sessionId: string,
	formData: Record<string, string>,
	cookieHeader?: string,
) {
	const url = new URL(`/training/upcoming/${sessionId}`, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	headers.set('content-type', 'application/x-www-form-urlencoded')
	const body = new URLSearchParams(formData).toString()
	return new Request(url.toString(), { method: 'POST', headers, body })
}

test('action creates a session log with content and RPE', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ content: 'Solid tempo session', rpe: '7' },
		cookieHeader,
	)

	await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const log = await prisma.sessionLog.findUnique({
		where: { sessionId: createdSession.id },
	})
	expect(log).not.toBeNull()
	expect(log!.content).toBe('Solid tempo session')
	expect(log!.rpe).toBe(7)
})

test('action creates a session log without RPE', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ content: 'Easy recovery' },
		cookieHeader,
	)

	await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const log = await prisma.sessionLog.findUnique({
		where: { sessionId: createdSession.id },
	})
	expect(log).not.toBeNull()
	expect(log!.content).toBe('Easy recovery')
	expect(log!.rpe).toBeNull()
})

test('action rejects invalid RPE value', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ content: 'Some content', rpe: '15' },
		cookieHeader,
	)

	const response = (await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')

	const log = await prisma.sessionLog.findUnique({
		where: { sessionId: createdSession.id },
	})
	expect(log).toBeNull()
})

test('action rejects empty content', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ content: '' },
		cookieHeader,
	)

	const response = (await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('action prevents non-owner from creating session log', async () => {
	const owner = await setupUser()
	const otherUser = await setupUser()
	const createdSession = await createWorkoutSession(owner.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(otherUser)
	const request = makeActionRequest(
		createdSession.id,
		{ content: 'Sneaky log' },
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(404)
})

test('action updates existing session log on resubmit', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)

	const request1 = makeActionRequest(
		createdSession.id,
		{ content: 'First draft', rpe: '5' },
		cookieHeader,
	)
	await action({
		request: request1,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const request2 = makeActionRequest(
		createdSession.id,
		{ content: 'Revised reflection', rpe: '8' },
		cookieHeader,
	)
	await action({
		request: request2,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const logs = await prisma.sessionLog.findMany({
		where: { sessionId: createdSession.id },
	})
	expect(logs).toHaveLength(1)
	expect(logs[0]!.content).toBe('Revised reflection')
	expect(logs[0]!.rpe).toBe(8)
})
