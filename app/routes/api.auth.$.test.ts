import { type AppLoadContext } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { action, loader } from './api.auth.$.ts'

/**
 * `/api/auth/*` runs dark (ADR 0113 §1–§2): 404 in production, and a foreign
 * `Origin` refused before Better Auth sees the request. The production gate's
 * proof that Better Auth is never constructed there is in
 * `app/utils/auth/handler.production.server.test.ts`.
 */

const APP_ORIGIN = 'http://localhost:3000'
const FOREIGN_ORIGIN = 'https://evil.example'

const ARGS_BASE = {
	// The splat; the handler reads the path from the request, never from here.
	params: { '*': '' },
	context: {} as AppLoadContext,
	unstable_pattern: '/api/auth/*',
}

afterEach(() => {
	vi.unstubAllEnvs()
})

function authRequest(
	path: string,
	init: { method?: string; headers?: Record<string, string>; body?: unknown },
) {
	return new Request(new URL(`/api/auth${path}`, APP_ORIGIN), {
		method: init.method ?? 'GET',
		headers: {
			...(init.body ? { 'Content-Type': 'application/json' } : {}),
			...init.headers,
		},
		body: init.body ? JSON.stringify(init.body) : undefined,
	})
}

function signUpBody(email: string) {
	return {
		email,
		password: 'a-long-enough-password-123',
		name: 'Noen',
		username: email.split('@')[0],
	}
}

test('in tests, /api/auth/ok answers 200', async () => {
	expect(process.env.APP_ORIGIN).toBe(APP_ORIGIN)

	const response = await loader({
		request: authRequest('/ok', {}),
		...ARGS_BASE,
	})

	expect(response.status).toBe(200)
	await expect(response.json()).resolves.toEqual({ ok: true })
})

test('in development, /api/auth/ok answers 200', async () => {
	vi.stubEnv('NODE_ENV', 'development')

	const response = await loader({
		request: authRequest('/ok', {}),
		...ARGS_BASE,
	})

	expect(response.status).toBe(200)
})

test('in production, every request to /api/auth answers 404', async () => {
	vi.stubEnv('NODE_ENV', 'production')

	const ok = await loader({ request: authRequest('/ok', {}), ...ARGS_BASE })
	const session = await loader({
		request: authRequest('/get-session', {}),
		...ARGS_BASE,
	})
	const signUp = await action({
		request: authRequest('/sign-up/email', {
			method: 'POST',
			headers: { Origin: APP_ORIGIN },
			body: signUpBody('prod@example.test'),
		}),
		...ARGS_BASE,
	})

	expect([ok.status, session.status, signUp.status]).toEqual([404, 404, 404])
	expect(
		await prisma.user.count({ where: { email: 'prod@example.test' } }),
	).toBe(0)
})

test('a POST with a foreign Origin and no cookie is refused with 403', async () => {
	const response = await action({
		request: authRequest('/sign-up/email', {
			method: 'POST',
			headers: { Origin: FOREIGN_ORIGIN },
			body: signUpBody('csrf@example.test'),
		}),
		...ARGS_BASE,
	})

	expect(response.status).toBe(403)
	expect(
		await prisma.user.count({ where: { email: 'csrf@example.test' } }),
	).toBe(0)
})

test('a POST with a foreign Origin and a cookie is refused with 403', async () => {
	const response = await action({
		request: authRequest('/sign-out', {
			method: 'POST',
			headers: {
				Origin: FOREIGN_ORIGIN,
				Cookie: 'better-auth.session_token=anything',
			},
		}),
		...ARGS_BASE,
	})

	expect(response.status).toBe(403)
})

test('an Origin that only looks like the app is refused', async () => {
	const lookalikes = [
		'http://localhost:3000.evil.example',
		'https://localhost:3000',
		'http://localhost:3001',
		'null',
	]
	const statuses: Record<string, number> = {}
	for (const origin of lookalikes) {
		const response = await action({
			request: authRequest('/sign-out', {
				method: 'POST',
				headers: { Origin: origin },
			}),
			...ARGS_BASE,
		})
		statuses[origin] = response.status
	}

	expect(statuses).toEqual(
		Object.fromEntries(lookalikes.map((origin) => [origin, 403])),
	)
})

test('sign-up is closed even from the app itself', async () => {
	const response = await action({
		request: authRequest('/sign-up/email', {
			method: 'POST',
			headers: { Origin: APP_ORIGIN },
			body: signUpBody('own@example.test'),
		}),
		...ARGS_BASE,
	})

	expect(response.status).not.toBe(403)
	expect(response.ok).toBe(false)
	expect(
		await prisma.user.count({ where: { email: 'own@example.test' } }),
	).toBe(0)
})

test('a POST with no Origin goes on to Better Auth', async () => {
	const response = await action({
		request: authRequest('/sign-up/email', {
			method: 'POST',
			body: signUpBody('server@example.test'),
		}),
		...ARGS_BASE,
	})

	// Better Auth's own answer (sign-up is closed), not the route's 403.
	expect(response.status).not.toBe(403)
	expect(response.ok).toBe(false)
})

test('a GET with a foreign Origin is not refused by the route', async () => {
	const response = await loader({
		request: authRequest('/ok', { headers: { Origin: FOREIGN_ORIGIN } }),
		...ARGS_BASE,
	})

	expect(response.status).toBe(200)
})
