import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader, action } from './sessions.new.tsx'

const ROUTE_PATH = '/training/sessions/new'
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

function makeLoaderRequest(cookieHeader?: string) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	return new Request(url.toString(), { method: 'GET', headers })
}

function makeActionRequest(
	formEntries: Array<[string, string]>,
	cookieHeader?: string,
) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	headers.set('content-type', 'application/x-www-form-urlencoded')
	const body = new URLSearchParams(formEntries).toString()
	return new Request(url.toString(), { method: 'POST', headers, body })
}

function validFormEntries(): Array<[string, string]> {
	return [
		['title', 'Morning Tempo Run'],
		['activityType', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '08:00'],
		['blocks[0].steps[0].description', '10 min easy jog'],
		['blocks[0].steps[0].activity', 'run'],
		['blocks[0].steps[0].intensity', 'easy'],
		['blocks[0].steps[0].durationSec', '600'],
	]
}

test('unauthenticated loader request redirects to login', async () => {
	const request = makeLoaderRequest()
	const response = await loader({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/login')
})

test('authenticated loader returns default date and time', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeLoaderRequest(cookieHeader)

	const result = (await loader({
		request,
		...LOADER_ARGS_BASE,
	})) as { defaultDate: string; defaultTime: string }

	expect(result.defaultDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	expect(result.defaultTime).toMatch(/^\d{2}:\d{2}$/)
})

test('action creates session and redirects on valid input', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(validFormEntries(), cookieHeader)

	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toMatch(
		/\/training\/upcoming\/[a-z0-9]+/i,
	)

	const sessions = await prisma.scheduledSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: {
				include: { blocks: { include: { steps: true } } },
			},
		},
	})
	expect(sessions).toHaveLength(1)
	expect(sessions[0]!.workout.title).toBe('Morning Tempo Run')
	expect(sessions[0]!.workout.activityType).toBe('run')
	expect(sessions[0]!.workout.blocks[0]!.steps[0]!.durationSec).toBe(600)
})

test('action rejects missing title', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries = validFormEntries().filter(([key]) => key !== 'title')
	const request = makeActionRequest(entries, cookieHeader)

	const response = (await action({
		request,
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('action rejects missing date', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries = validFormEntries().filter(
		([key]) => key !== 'scheduledAtDate',
	)
	const request = makeActionRequest(entries, cookieHeader)

	const response = (await action({
		request,
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('action rejects input with no steps', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries: Array<[string, string]> = [
		['title', 'Empty workout'],
		['activityType', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '08:00'],
	]
	const request = makeActionRequest(entries, cookieHeader)

	const response = (await action({
		request,
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('action rejects step with both duration and distance', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries: Array<[string, string]> = [
		['title', 'Bad step'],
		['activityType', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '08:00'],
		['blocks[0].steps[0].description', 'conflicting'],
		['blocks[0].steps[0].durationSec', '300'],
		['blocks[0].steps[0].distanceM', '1000'],
	]
	const request = makeActionRequest(entries, cookieHeader)

	const response = (await action({
		request,
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('action creates session with multiple steps', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries: Array<[string, string]> = [
		['title', 'Interval Session'],
		['activityType', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '07:00'],
		['blocks[0].steps[0].description', 'warm up'],
		['blocks[0].steps[0].intensity', 'easy'],
		['blocks[0].steps[0].durationSec', '600'],
		['blocks[0].steps[1].description', 'hard rep'],
		['blocks[0].steps[1].intensity', 'threshold'],
		['blocks[0].steps[1].durationSec', '180'],
		['blocks[0].steps[2].description', 'cool down'],
		['blocks[0].steps[2].intensity', 'easy'],
	]
	const request = makeActionRequest(entries, cookieHeader)

	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)

	const sessions = await prisma.scheduledSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: {
				include: {
					blocks: { include: { steps: { orderBy: { orderIndex: 'asc' } } } },
				},
			},
		},
	})
	expect(sessions[0]!.workout.blocks[0]!.steps).toHaveLength(3)
	expect(sessions[0]!.workout.blocks[0]!.steps[0]!.description).toBe('warm up')
	expect(sessions[0]!.workout.blocks[0]!.steps[2]!.description).toBe(
		'cool down',
	)
})

test('action creates multi-block session with names and repeat counts', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries: Array<[string, string]> = [
		['title', 'Swim Intervals'],
		['activityType', 'swim'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '06:00'],
		['blocks[0].name', 'Warm-up'],
		['blocks[0].repeatCount', '1'],
		['blocks[0].steps[0].description', 'easy swim'],
		['blocks[0].steps[0].intensity', 'easy'],
		['blocks[0].steps[0].durationSec', '600'],
		['blocks[1].name', 'Main set'],
		['blocks[1].repeatCount', '5'],
		['blocks[1].steps[0].description', 'hard 100m'],
		['blocks[1].steps[0].intensity', 'threshold'],
		['blocks[1].steps[0].distanceM', '100'],
		['blocks[1].steps[1].description', 'easy 50m'],
		['blocks[1].steps[1].intensity', 'easy'],
		['blocks[1].steps[1].distanceM', '50'],
		['blocks[2].name', 'Cool-down'],
		['blocks[2].repeatCount', '1'],
		['blocks[2].steps[0].description', 'easy swim'],
		['blocks[2].steps[0].durationSec', '300'],
	]
	const request = makeActionRequest(entries, cookieHeader)

	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)

	const sessions = await prisma.scheduledSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: {
				include: {
					blocks: {
						orderBy: { orderIndex: 'asc' },
						include: { steps: { orderBy: { orderIndex: 'asc' } } },
					},
				},
			},
		},
	})
	expect(sessions).toHaveLength(1)
	const blocks = sessions[0]!.workout.blocks
	expect(blocks).toHaveLength(3)
	expect(blocks[0]!.name).toBe('Warm-up')
	expect(blocks[0]!.repeatCount).toBe(1)
	expect(blocks[0]!.steps).toHaveLength(1)
	expect(blocks[1]!.name).toBe('Main set')
	expect(blocks[1]!.repeatCount).toBe(5)
	expect(blocks[1]!.steps).toHaveLength(2)
	expect(blocks[2]!.name).toBe('Cool-down')
	expect(blocks[2]!.repeatCount).toBe(1)
})

test('action creates block without name (anonymous block)', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries: Array<[string, string]> = [
		['title', 'Quick Run'],
		['activityType', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '07:00'],
		['blocks[0].repeatCount', '1'],
		['blocks[0].steps[0].description', 'easy jog'],
	]
	const request = makeActionRequest(entries, cookieHeader)

	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)

	const sessions = await prisma.scheduledSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})
	expect(sessions[0]!.workout.blocks[0]!.name).toBeNull()
	expect(sessions[0]!.workout.blocks[0]!.repeatCount).toBe(1)
})

test('unauthenticated action request redirects to login', async () => {
	const request = makeActionRequest(validFormEntries())
	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/login')
})
