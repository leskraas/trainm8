import { afterEach, expect, test } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { matchDevToken, parseDevTokens } from './dev-token.server.ts'

// The Phase 0 dev bearer token (ADR 0092 §8). #639 H6: production refuses it
// — boot fails with one configured, and no request ever matches one there.

const TOKEN = 'a'.repeat(40)
const request = (authorization?: string) =>
	new Request('http://localhost/mcp', {
		method: 'POST',
		headers: authorization ? { authorization } : {},
	})

const saved = { ...process.env }
afterEach(() => {
	process.env = { ...saved }
})

test('#639 H6: boot fails in production when a dev token is configured', async () => {
	const { init } = await import('#app/utils/env.server.ts')
	let logged: unknown[] = []
	consoleError.mockImplementation((...args: unknown[]) => {
		logged = args
	})
	process.env.NODE_ENV = 'production'
	process.env.MCP_DEV_TOKENS = `kody:${TOKEN}`
	expect(() => init()).toThrow('Invalid environment variables')
	expect(logged[1]).toMatchObject({
		MCP_DEV_TOKENS: [expect.stringContaining('#639 H6')],
	})
	// The same environment without the token does not fail on it.
	process.env.MCP_DEV_TOKENS = ''
	logged = []
	try {
		init()
	} catch {
		// Production may fail on other settings in a test environment; never on this one.
	}
	expect(logged[1] ?? {}).not.toHaveProperty('MCP_DEV_TOKENS')
})

test('#639 H6: a request never matches a dev token outside development and test', () => {
	const configured = { MCP_DEV_TOKENS: `kody:${TOKEN}` }
	expect(
		matchDevToken(request(`Bearer ${TOKEN}`), {
			...configured,
			NODE_ENV: 'test',
		}),
	).toMatchObject({ userId: 'kody', scopes: ['training:read'] })
	expect(
		matchDevToken(request(`Bearer ${TOKEN}`), {
			...configured,
			NODE_ENV: 'production',
		}),
	).toBeNull()
})

test('a token is matched exactly, and only as a bearer', () => {
	const env = { NODE_ENV: 'development', MCP_DEV_TOKENS: `kody:${TOKEN}` }
	expect(matchDevToken(request(), env)).toBeNull()
	expect(matchDevToken(request(`Bearer ${TOKEN}x`), env)).toBeNull()
	expect(matchDevToken(request(`Basic ${TOKEN}`), env)).toBeNull()
	expect(matchDevToken(request(`bearer ${TOKEN}`), env)?.userId).toBe('kody')
})

test('entries are userId:token[:scope+scope], with tokens long enough to guess at nothing', () => {
	expect(
		parseDevTokens(
			`kody:${TOKEN}, ann:${'b'.repeat(32)}:training:read+training:log`,
			'test',
		),
	).toEqual([
		{ userId: 'kody', token: TOKEN, scopes: ['training:read'] },
		{
			userId: 'ann',
			token: 'b'.repeat(32),
			scopes: ['training:read', 'training:log'],
		},
	])
	expect(() => parseDevTokens('kody:short', 'test')).toThrow(/32/)
	expect(() => parseDevTokens(`kody:${TOKEN}:admin`, 'test')).toThrow(
		/unknown scope/,
	)
	expect(parseDevTokens(undefined, 'production')).toEqual([])
})

test('the placeholder in .env.example is public, so it is never a token', async () => {
	const { readFile } = await import('node:fs/promises')
	const example = await readFile(
		new URL('../../.env.example', import.meta.url),
		'utf8',
	)
	const line = /^# MCP_DEV_TOKENS="(.+)"$/m.exec(example)?.[1]
	expect(line).toBeDefined()
	expect(() => parseDevTokens(line, 'development')).toThrow(/\.env\.example/)
})
