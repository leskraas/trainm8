import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader, action } from './upcoming.$sessionId.edit.tsx'

const ROUTE_PATH = '/training/upcoming/:sessionId/edit'
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
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						name: 'Main set',
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									kind: 'cardio',
									notes: '10 min easy jog',
									discipline: 'run',
									intensity: 'easy',
									orderIndex: 0,
									durationSec: 600,
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
	const url = new URL(`/training/upcoming/${sessionId}/edit`, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	return new Request(url.toString(), { method: 'GET', headers })
}

function makeActionRequest(
	sessionId: string,
	formEntries: Array<[string, string]>,
	cookieHeader?: string,
) {
	const url = new URL(`/training/upcoming/${sessionId}/edit`, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	headers.set('content-type', 'application/x-www-form-urlencoded')
	const body = new URLSearchParams(formEntries).toString()
	return new Request(url.toString(), { method: 'POST', headers, body })
}

function validFormEntries(): Array<[string, string]> {
	return [
		['title', 'Updated Tempo Run'],
		['discipline', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-15'],
		['scheduledAtTime', '07:00'],
		['blocks[0].name', 'Main set'],
		['blocks[0].repeatCount', '1'],
		['blocks[0].steps[0].kind', 'cardio'],
		['blocks[0].steps[0].notes', 'updated step'],
		['blocks[0].steps[0].durationSec', '900'],
	]
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

test('unauthenticated loader request redirects to login', async () => {
	const response = await loader({
		request: makeRequest('missing-session'),
		params: { sessionId: 'missing-session' },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/login')
})

test('loader returns session data for owner', async () => {
	const user = await setupUser()
	const created = await createWorkoutSession(user.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(user)
	const response = await loader({
		request: makeRequest(created.id, cookieHeader),
		params: { sessionId: created.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as {
		session: {
			id: string
			status: string
			workout: { title: string; blocks: Array<{ name: string | null }> }
		}
	}
	expect(data.session.id).toBe(created.id)
	expect(data.session.workout.blocks).toHaveLength(1)
	expect(data.session.workout.blocks[0]!.name).toBe('Main set')
})

test('loader returns 404 for non-owner', async () => {
	const owner = await setupUser()
	const other = await setupUser()
	const created = await createWorkoutSession(owner.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(other)
	const response = await loader({
		request: makeRequest(created.id, cookieHeader),
		params: { sessionId: created.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).status).toBe(404)
})

test('action updates session and redirects to detail view', async () => {
	const user = await setupUser()
	const created = await createWorkoutSession(user.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(user)
	const response = await action({
		request: makeActionRequest(created.id, validFormEntries(), cookieHeader),
		params: { sessionId: created.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toBe(`/training/upcoming/${created.id}`)

	const updated = await prisma.workoutSession.findUnique({
		where: { id: created.id },
		include: {
			workout: {
				include: { blocks: { include: { steps: true } } },
			},
		},
	})
	expect(updated!.workout.title).toBe('Updated Tempo Run')
	expect(updated!.workout.blocks[0]!.steps[0]!.notes).toBe('updated step')
	expect(updated!.workout.blocks[0]!.steps[0]!.durationSec).toBe(900)
})

test('action rejects invalid input and returns field errors', async () => {
	const user = await setupUser()
	const created = await createWorkoutSession(user.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(user)
	const response = await action({
		request: makeActionRequest(
			created.id,
			[
				['title', ''],
				['discipline', 'run'],
				['scheduledAtDate', '2026-06-15'],
				['scheduledAtTime', '07:00'],
				['blocks[0].steps[0].kind', 'cardio'],
				['blocks[0].steps[0].notes', 'some step'],
			],
			cookieHeader,
		),
		params: { sessionId: created.id },
		...LOADER_ARGS_BASE,
	})

	const result = response as {
		data: { result: { status: string } }
		init: { status: number }
	}
	expect(result.init.status).toBe(400)
	expect(result.data.result.status).toBe('error')
})

test('action returns 404 for non-owner', async () => {
	const owner = await setupUser()
	const other = await setupUser()
	const created = await createWorkoutSession(owner.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(other)
	const response = await action({
		request: makeActionRequest(created.id, validFormEntries(), cookieHeader),
		params: { sessionId: created.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).status).toBe(404)
})
