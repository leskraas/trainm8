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
		['discipline', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '08:00'],
		['structure', 'structured'],
		['blocks[0].steps[0].kind', 'cardio'],
		['blocks[0].steps[0].notes', '10 min easy jog'],
		['blocks[0].steps[0].discipline', 'run'],
		['blocks[0].steps[0].intensity', 'easy'],
		['blocks[0].steps[0].duration', '10 min'],
	]
}

function simpleFormEntries(): Array<[string, string]> {
	return [
		['title', 'Easy Run'],
		['discipline', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '08:00'],
		['structure', 'simple'],
		['duration', '40 min'],
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
	})) as { defaultDate: string; defaultTime: string; exercises: unknown[] }

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
		/\/training\/sessions\/[a-z0-9]+/i,
	)

	const sessions = await prisma.workoutSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: {
				include: { blocks: { include: { steps: true } } },
			},
		},
	})
	expect(sessions).toHaveLength(1)
	expect(sessions[0]!.workout!.title).toBe('Morning Tempo Run')
	expect(sessions[0]!.workout!.discipline).toBe('run')
	expect(sessions[0]!.workout!.blocks[0]!.steps[0]!.durationSec).toBe(600)
})

// ——— Simple mode (#176): a humane-units submission persists as a valid
// single-step structured session — no schema change, canonical units. ———

test('simple mode creates a single-step session with the duration in seconds', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(simpleFormEntries(), cookieHeader)

	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).status).toBe(302)

	const sessions = await prisma.workoutSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})
	expect(sessions).toHaveLength(1)
	const workout = sessions[0]!.workout!
	expect(workout.title).toBe('Easy Run')
	expect(workout.discipline).toBe('run')
	expect(workout.intent).toBe('endurance')
	expect(workout.blocks).toHaveLength(1)
	expect(workout.blocks[0]!.repeatCount).toBe(1)
	expect(workout.blocks[0]!.steps).toHaveLength(1)
	const step = workout.blocks[0]!.steps[0]!
	expect(step.kind).toBe('cardio')
	expect(step.discipline).toBe('run')
	expect(step.durationSec).toBe(2400)
	expect(step.distanceM).toBeNull()
})

test('simple mode reads a bare duration as minutes', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries = simpleFormEntries().map(([key, value]) =>
		key === 'duration'
			? (['duration', '40'] as [string, string])
			: [key, value],
	) as Array<[string, string]>
	const request = makeActionRequest(entries, cookieHeader)

	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)
	expect((response as Response).status).toBe(302)

	const sessions = await prisma.workoutSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})
	expect(sessions[0]!.workout!.blocks[0]!.steps[0]!.durationSec).toBe(2400)
})

test('simple mode stores a km distance as metres', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries = simpleFormEntries()
		.filter(([key]) => key !== 'duration')
		.concat([['distance', '8 km']])
	const request = makeActionRequest(entries, cookieHeader)

	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)
	expect((response as Response).status).toBe(302)

	const sessions = await prisma.workoutSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})
	const step = sessions[0]!.workout!.blocks[0]!.steps[0]!
	expect(step.distanceM).toBe(8000)
	expect(step.durationSec).toBeNull()
})

test('simple mode rejects a submission with neither duration nor distance', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries = simpleFormEntries().filter(([key]) => key !== 'duration')
	const request = makeActionRequest(entries, cookieHeader)

	const response = (await action({
		request,
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('simple mode rejects a submission with both duration and distance', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries = simpleFormEntries().concat([['distance', '8 km']])
	const request = makeActionRequest(entries, cookieHeader)

	const response = (await action({
		request,
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('simple mode rejects an unparseable duration', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries = simpleFormEntries().map(([key, value]) =>
		key === 'duration'
			? (['duration', 'a while'] as [string, string])
			: [key, value],
	) as Array<[string, string]>
	const request = makeActionRequest(entries, cookieHeader)

	const response = (await action({
		request,
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('simple mode rejects a strength session (structure required)', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries = simpleFormEntries().map(([key, value]) =>
		key === 'discipline'
			? (['discipline', 'strength'] as [string, string])
			: [key, value],
	) as Array<[string, string]>
	const request = makeActionRequest(entries, cookieHeader)

	const response = (await action({
		request,
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
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
		['discipline', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '08:00'],
		['structure', 'structured'],
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
		['discipline', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '08:00'],
		['structure', 'structured'],
		['blocks[0].steps[0].kind', 'cardio'],
		['blocks[0].steps[0].notes', 'conflicting'],
		['blocks[0].steps[0].duration', '5 min'],
		['blocks[0].steps[0].distance', '1 km'],
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
		['discipline', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '07:00'],
		['structure', 'structured'],
		['blocks[0].steps[0].kind', 'cardio'],
		['blocks[0].steps[0].notes', 'warm up'],
		['blocks[0].steps[0].intensity', 'easy'],
		['blocks[0].steps[0].duration', '10 min'],
		['blocks[0].steps[1].kind', 'cardio'],
		['blocks[0].steps[1].notes', 'hard rep'],
		['blocks[0].steps[1].intensity', 'threshold'],
		['blocks[0].steps[1].duration', '3 min'],
		['blocks[0].steps[2].kind', 'cardio'],
		['blocks[0].steps[2].notes', 'cool down'],
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

	const sessions = await prisma.workoutSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: {
				include: {
					blocks: { include: { steps: { orderBy: { orderIndex: 'asc' } } } },
				},
			},
		},
	})
	expect(sessions[0]!.workout!.blocks[0]!.steps).toHaveLength(3)
	expect(sessions[0]!.workout!.blocks[0]!.steps[0]!.notes).toBe('warm up')
	expect(sessions[0]!.workout!.blocks[0]!.steps[2]!.notes).toBe('cool down')
})

test('action creates multi-block session with names and repeat counts', async () => {
	const user = await setupUser()
	const cookieHeader = await getSessionCookieHeader(user)
	const entries: Array<[string, string]> = [
		['title', 'Swim Intervals'],
		['discipline', 'swim'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '06:00'],
		['structure', 'structured'],
		['blocks[0].name', 'Warm-up'],
		['blocks[0].repeatCount', '1'],
		['blocks[0].steps[0].kind', 'cardio'],
		['blocks[0].steps[0].notes', 'easy swim'],
		['blocks[0].steps[0].intensity', 'easy'],
		['blocks[0].steps[0].duration', '10 min'],
		['blocks[1].name', 'Main set'],
		['blocks[1].repeatCount', '5'],
		['blocks[1].steps[0].kind', 'cardio'],
		['blocks[1].steps[0].notes', 'hard 100m'],
		['blocks[1].steps[0].intensity', 'threshold'],
		['blocks[1].steps[0].distance', '100 m'],
		['blocks[1].steps[1].kind', 'cardio'],
		['blocks[1].steps[1].notes', 'easy 50m'],
		['blocks[1].steps[1].intensity', 'easy'],
		['blocks[1].steps[1].distance', '50 m'],
		['blocks[2].name', 'Cool-down'],
		['blocks[2].repeatCount', '1'],
		['blocks[2].steps[0].kind', 'cardio'],
		['blocks[2].steps[0].notes', 'easy swim'],
		['blocks[2].steps[0].duration', '5 min'],
	]
	const request = makeActionRequest(entries, cookieHeader)

	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)

	const sessions = await prisma.workoutSession.findMany({
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
	const blocks = sessions[0]!.workout!.blocks
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
		['discipline', 'run'],
		['intent', 'endurance'],
		['scheduledAtDate', '2026-06-01'],
		['scheduledAtTime', '07:00'],
		['structure', 'structured'],
		['blocks[0].repeatCount', '1'],
		['blocks[0].steps[0].kind', 'cardio'],
		['blocks[0].steps[0].notes', 'easy jog'],
	]
	const request = makeActionRequest(entries, cookieHeader)

	const response = await action({
		request,
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)

	const sessions = await prisma.workoutSession.findMany({
		where: { userId: user.userId },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})
	expect(sessions[0]!.workout!.blocks[0]!.name).toBeNull()
	expect(sessions[0]!.workout!.blocks[0]!.repeatCount).toBe(1)
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
