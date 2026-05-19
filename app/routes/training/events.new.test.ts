import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader, action } from './events.new.tsx'

const ROUTE_PATH = '/training/events/new'
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

function validFormEntries(
	overrides: Array<[string, string]> = [],
): Array<[string, string]> {
	const base: Array<[string, string]> = [
		['name', 'Trondheim Marathon'],
		['kind', 'race'],
		['priority', 'A'],
		['startDate', '2026-06-15'],
		['disciplines', 'run'],
	]
	return [...base, ...overrides]
}

test('unauthenticated loader redirects to login', async () => {
	const request = makeLoaderRequest()
	const response = await loader({ request, ...LOADER_ARGS_BASE }).catch(
		(e: unknown) => e,
	)
	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/login')
})

test('authenticated loader returns today as default date', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeLoaderRequest(cookie)
	const result = await loader({ request, ...LOADER_ARGS_BASE })
	expect(result).toHaveProperty('defaultDate')
})

test('unauthenticated action redirects to login', async () => {
	const request = makeActionRequest(validFormEntries())
	const response = await action({ request, ...LOADER_ARGS_BASE }).catch(
		(e: unknown) => e,
	)
	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/login')
})

test('action creates event and redirects to event detail', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(validFormEntries(), cookie)
	const response = await action({ request, ...LOADER_ARGS_BASE }).catch(
		(e: unknown) => e,
	)
	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/training/events/')

	const events = await prisma.event.findMany({
		where: { athleteId: session.userId },
	})
	expect(events).toHaveLength(1)
	expect(events[0]!.name).toBe('Trondheim Marathon')
})

test('action returns 400 on invalid form data', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest([['name', '']], cookie)
	const result = (await action({ request, ...LOADER_ARGS_BASE })) as {
		data: { result: { status: string } }
		init: { status: number }
	}
	expect(result.data.result.status).toBe('error')
	expect(result.init.status).toBe(400)
})

test('action with endDate before startDate returns 400', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		validFormEntries([['endDate', '2026-06-01']]),
		cookie,
	)
	const result = (await action({ request, ...LOADER_ARGS_BASE })) as {
		data: { result: { status: string } }
		init: { status: number }
	}
	expect(result.data.result.status).toBe('error')
})
