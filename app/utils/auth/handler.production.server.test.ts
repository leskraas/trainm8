import { afterEach, expect, test, vi } from 'vitest'
import { handleAuthRequest } from './handler.server.ts'

/**
 * Production never constructs Better Auth (ADR 0113 §1): the gate answers 404
 * before `better-auth.server.ts` is imported. The mock records an import, and
 * stands in for a handler that would answer anything.
 */
const constructed = vi.hoisted(() => ({ value: false }))

vi.mock('./better-auth.server.ts', () => {
	constructed.value = true
	return {
		auth: { handler: () => new Response('Better Auth answered') },
	}
})

afterEach(() => {
	vi.unstubAllEnvs()
})

test('production answers 404 without importing Better Auth', async () => {
	vi.stubEnv('NODE_ENV', 'production')

	const responses = await Promise.all(
		[
			new Request('http://localhost:3000/api/auth/ok'),
			new Request('http://localhost:3000/api/auth/sign-up/email', {
				method: 'POST',
				headers: { Origin: 'http://localhost:3000' },
				body: '{}',
			}),
			new Request('http://localhost:3000/api/auth/sign-in/email', {
				method: 'POST',
				body: '{}',
			}),
		].map(handleAuthRequest),
	)

	expect(responses.map((response) => response.status)).toEqual([404, 404, 404])
	expect(constructed.value).toBe(false)
})

test('production answers 404 even with APP_ORIGIN and the secret unset', async () => {
	vi.stubEnv('NODE_ENV', 'production')
	vi.stubEnv('APP_ORIGIN', undefined)
	vi.stubEnv('BETTER_AUTH_SECRET', undefined)

	const response = await handleAuthRequest(
		new Request('http://localhost:3000/api/auth/ok', {
			method: 'POST',
			headers: { Origin: 'https://evil.example' },
		}),
	)

	expect(response.status).toBe(404)
	expect(constructed.value).toBe(false)
})

test('outside production the same request reaches Better Auth', async () => {
	vi.stubEnv('NODE_ENV', 'development')

	const response = await handleAuthRequest(
		new Request('http://localhost:3000/api/auth/ok'),
	)

	expect(await response.text()).toBe('Better Auth answered')
	expect(constructed.value).toBe(true)
})
