import { randomBytes } from 'node:crypto'
import { afterEach, expect, test, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { init } from './env.server.ts'

afterEach(() => {
	vi.unstubAllEnvs()
})

test('a production boot without CREDENTIALS_ENCRYPTION_KEY refuses to start', () => {
	consoleError.mockImplementation(() => {})
	vi.stubEnv('NODE_ENV', 'production')
	vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', '')

	expect(() => init()).toThrow('Invalid environment variables')
	expect(JSON.stringify(consoleError.mock.calls)).toContain(
		'CREDENTIALS_ENCRYPTION_KEY',
	)
})

test('a production boot with a real key starts', () => {
	vi.stubEnv('NODE_ENV', 'production')
	vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', randomBytes(32).toString('base64'))

	expect(() => init()).not.toThrow()
})
