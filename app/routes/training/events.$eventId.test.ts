import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createEvent } from '#app/utils/event.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader, action } from './events.$eventId.tsx'

const ROUTE_PATH = '/training/events/:eventId'
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

async function createWorkout(userId: string) {
	return prisma.workout.create({
		data: {
			title: faker.lorem.words(3),
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{ description: 'Easy run', discipline: 'run', orderIndex: 0 },
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
}

async function createWorkoutSession(userId: string, scheduledAt: Date) {
	const workout = await createWorkout(userId)
	return prisma.workoutSession.create({
		data: { userId, workoutId: workout.id, scheduledAt, status: 'scheduled' },
		select: { id: true },
	})
}

function makeRequest(method: string, eventId: string, cookieHeader?: string) {
	const url = new URL(`/training/events/${eventId}`, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	return new Request(url.toString(), { method, headers })
}

function makeActionRequest(
	formEntries: Array<[string, string]>,
	eventId: string,
	cookieHeader?: string,
) {
	const url = new URL(`/training/events/${eventId}`, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	headers.set('content-type', 'application/x-www-form-urlencoded')
	const body = new URLSearchParams(formEntries).toString()
	return new Request(url.toString(), { method: 'POST', headers, body })
}

test('unauthenticated loader redirects to login', async () => {
	const request = makeRequest('GET', 'some-id')
	const response = await loader({
		request,
		params: { eventId: 'some-id' },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)
	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/login')
})

test('loader returns event data for owner', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	const event = await createEvent(session.userId, {
		name: 'My Race',
		kind: 'race',
		priority: 'A',
		startDate: new Date('2026-06-15'),
		disciplines: ['run'],
		status: 'planned',
	})

	const request = makeRequest('GET', event.id, cookie)
	const result = await loader({
		request,
		params: { eventId: event.id },
		...LOADER_ARGS_BASE,
	})
	expect(result.event.name).toBe('My Race')
})

test('loader 404 for another user event', async () => {
	const user1 = await setupUser()
	const user2 = await setupUser()
	const cookie2 = await getSessionCookieHeader(user2)

	const event = await createEvent(user1.userId, {
		name: 'Private Race',
		kind: 'race',
		priority: 'C',
		startDate: new Date('2026-06-15'),
		disciplines: ['run'],
		status: 'planned',
	})

	const request = makeRequest('GET', event.id, cookie2)
	const response = await loader({
		request,
		params: { eventId: event.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)
	expect(response).toBeInstanceOf(Response)
	expect((response as Response).status).toBe(404)
})

test('action cancel sets status to cancelled', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	const event = await createEvent(session.userId, {
		name: 'Race to Cancel',
		kind: 'race',
		priority: 'C',
		startDate: new Date('2026-06-15'),
		disciplines: ['run'],
		status: 'planned',
	})

	const request = makeActionRequest(
		[['intent', 'cancel']],
		event.id,
		cookie,
	)
	const response = await action({
		request,
		params: { eventId: event.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)
	// redirects after cancel
	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)

	const updated = await prisma.event.findFirst({ where: { id: event.id } })
	expect(updated!.status).toBe('cancelled')
})

test('action delete removes event', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	const event = await createEvent(session.userId, {
		name: 'Event to Delete',
		kind: 'fitness-goal',
		priority: 'C',
		startDate: new Date('2026-12-01'),
		disciplines: ['strength'],
		status: 'planned',
	})

	const request = makeActionRequest([['intent', 'delete']], event.id, cookie)
	const response = await action({
		request,
		params: { eventId: event.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)
	expect(response).toBeInstanceOf(Response)
	expect((response as Response).status).toBe(302)

	const gone = await prisma.event.findFirst({ where: { id: event.id } })
	expect(gone).toBeNull()
})

test('action set-result links session and marks completed', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	const event = await createEvent(session.userId, {
		name: 'Race Day',
		kind: 'race',
		priority: 'A',
		startDate: new Date('2026-06-15'),
		disciplines: ['run'],
		status: 'planned',
	})

	const workoutSession = await createWorkoutSession(
		session.userId,
		new Date('2026-06-15T08:00:00Z'),
	)

	const request = makeActionRequest(
		[
			['intent', 'set-result'],
			['sessionId', workoutSession.id],
		],
		event.id,
		cookie,
	)
	const response = await action({
		request,
		params: { eventId: event.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)
	expect(response).toBeInstanceOf(Response)
	expect((response as Response).status).toBe(302)

	const updated = await prisma.event.findFirst({ where: { id: event.id } })
	expect(updated!.resultSessionId).toBe(workoutSession.id)
	expect(updated!.status).toBe('completed')
})

test('action unlink-result clears resultSessionId', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	const workoutSession = await createWorkoutSession(
		session.userId,
		new Date('2026-06-15T08:00:00Z'),
	)

	const event = await createEvent(session.userId, {
		name: 'Linked Race',
		kind: 'race',
		priority: 'A',
		startDate: new Date('2026-06-15'),
		disciplines: ['run'],
		status: 'planned',
		resultSessionId: workoutSession.id,
	})

	// first link it
	await prisma.event.update({
		where: { id: event.id },
		data: { resultSessionId: workoutSession.id, status: 'completed' },
	})

	const request = makeActionRequest([['intent', 'unlink-result']], event.id, cookie)
	const response = await action({
		request,
		params: { eventId: event.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)
	expect(response).toBeInstanceOf(Response)

	const updated = await prisma.event.findFirst({ where: { id: event.id } })
	expect(updated!.resultSessionId).toBeNull()
})
