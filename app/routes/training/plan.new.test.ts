import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './plan.new.tsx'

const ROUTE_PATH = '/training/plan/new'

async function setupUser() {
	const userData = createUser()
	return prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: {
						create: {
							timezone: 'UTC',
							trainableWeekdays: '[1,3,5]',
							defaultTrainingTime: '18:00',
						},
					},
				},
			},
		},
		select: { id: true, userId: true },
	})
}

function makeRequest(form: Record<string, string | string[]>, cookie?: string) {
	const body = new URLSearchParams()
	for (const [key, value] of Object.entries(form)) {
		if (Array.isArray(value)) value.forEach((v) => body.append(key, v))
		else body.set(key, value)
	}
	const headers = new Headers({
		'content-type': 'application/x-www-form-urlencoded',
	})
	if (cookie) headers.set('cookie', cookie)
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers,
		body: body.toString(),
	})
}

test('approve action persists the plan and redirects to the ledger', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeRequest(
		{
			discipline: ['run', 'bike'],
			experience: 'intermediate',
			goal: 'Run a sub-2:00 half marathon',
			horizonWeeks: '8',
		},
		cookie,
	)

	const response = await action({
		request,
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: ROUTE_PATH,
	}).catch((thrown: unknown) => thrown as Response)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).status).toBe(302)
	expect((response as Response).headers.get('location')).toBe(
		'/training/upcoming',
	)

	// A fitness-goal Event and generated sessions were persisted.
	const event = await prisma.event.findFirst({
		where: { athleteId: session.userId, kind: 'fitness-goal' },
		select: { id: true, planOutline: true },
	})
	expect(event).not.toBeNull()
	expect(event!.planOutline).toBeTruthy()

	const sessions = await prisma.workoutSession.findMany({
		where: { userId: session.userId, source: 'generated' },
		select: { targetEventId: true, generatedByModel: true },
	})
	expect(sessions.length).toBeGreaterThan(0)
	expect(sessions.every((s) => s.targetEventId === event!.id)).toBe(true)
	expect(sessions.every((s) => s.generatedByModel === 'stub-v1')).toBe(true)
})

test('approve action anchors to a chosen Target Event without creating a duplicate', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	const event = await prisma.event.create({
		data: {
			athleteId: session.userId,
			name: 'Oslo Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
			disciplines: JSON.stringify(['run']),
			status: 'planned',
		},
		select: { id: true },
	})

	const before = await prisma.event.count({
		where: { athleteId: session.userId },
	})

	const request = makeRequest(
		{
			discipline: ['run'],
			experience: 'intermediate',
			goal: 'Run a sub-2:00 half marathon',
			horizonWeeks: '12',
			targetEventId: event.id,
		},
		cookie,
	)

	const response = await action({
		request,
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: ROUTE_PATH,
	}).catch((thrown: unknown) => thrown as Response)

	expect((response as Response).status).toBe(302)

	// No new Event — the chosen Target Event was reused.
	const after = await prisma.event.count({
		where: { athleteId: session.userId },
	})
	expect(after).toBe(before)

	// Generated sessions anchor to the chosen Event.
	const sessions = await prisma.workoutSession.findMany({
		where: { userId: session.userId, source: 'generated' },
		select: { targetEventId: true },
	})
	expect(sessions.length).toBeGreaterThan(0)
	expect(sessions.every((s) => s.targetEventId === event.id)).toBe(true)
})

test('approve action rejects an invalid request', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	// No disciplines selected → invalid.
	const request = makeRequest(
		{ experience: 'intermediate', goal: 'Get fit', horizonWeeks: '8' },
		cookie,
	)

	const response = await action({
		request,
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: ROUTE_PATH,
	})

	// Invalid input returns a 400 `data()` payload rather than redirecting.
	expect(response.init?.status).toBe(400)
	expect(response.data.error).toBeTruthy()
})
