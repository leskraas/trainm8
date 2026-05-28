import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './exercises.ts'

const ROUTE_PATH = '/training/exercises'

const ACTION_ARGS_BASE = {
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

test('action creates a custom exercise for the authenticated user', async () => {
	const session = await setupUser()
	const cookieHeader = await getSessionCookieHeader(session)

	const response = (await action({
		...ACTION_ARGS_BASE,
		request: makeActionRequest(
			[
				['name', 'Kettlebell Swing'],
				['primaryMuscle', 'glutes'],
				['equipment', 'kettlebell'],
				['isCompound', 'true'],
			],
			cookieHeader,
		),
	})) as {
		data: { exercise: { id: string; name: string } }
		init?: { status?: number }
	}

	expect(response.data.exercise).toBeDefined()
	expect(response.data.exercise.name).toBe('Kettlebell Swing')

	const dbExercise = await prisma.exercise.findUnique({
		where: { id: response.data.exercise.id },
	})
	expect(dbExercise).toBeDefined()
	expect(dbExercise!.createdByAthleteId).toBe(session.userId)
})

test('action returns 400 for missing name', async () => {
	const session = await setupUser()
	const cookieHeader = await getSessionCookieHeader(session)

	const response = (await action({
		...ACTION_ARGS_BASE,
		request: makeActionRequest([['primaryMuscle', 'chest']], cookieHeader),
	})) as { data: { error: string }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.error).toBeDefined()
})

test('action returns 400 for invalid primaryMuscle', async () => {
	const session = await setupUser()
	const cookieHeader = await getSessionCookieHeader(session)

	const response = (await action({
		...ACTION_ARGS_BASE,
		request: makeActionRequest(
			[
				['name', 'Mystery Move'],
				['primaryMuscle', 'spleen'],
			],
			cookieHeader,
		),
	})) as { data: { error: string }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.error).toBeDefined()
})

test('action redirects to login for unauthenticated requests', async () => {
	const response = await action({
		...ACTION_ARGS_BASE,
		request: makeActionRequest([
			['name', 'Ghost Squat'],
			['primaryMuscle', 'quads'],
		]),
	}).catch((r: Response) => r)

	expect((response as Response).status).toBe(302)
	expect((response as Response).headers.get('location')).toContain('/login')
})
