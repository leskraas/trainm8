import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { consoleWarn } from '#tests/setup/setup-test-env.ts'
import {
	checkIsCommonPassword,
	getPasswordHashParts,
	resetUserPassword,
	verifyUserPassword,
} from './auth.server.ts'
import { prisma } from './db.server.ts'

test('checkIsCommonPassword returns true when password is found in breach database', async () => {
	const password = 'testpassword'
	const [prefix, suffix] = getPasswordHashParts(password)

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/${prefix}`, () => {
			// Include the actual suffix in the response with another realistic suffix
			return new HttpResponse(
				`1234567890123456789012345678901234A:1\n${suffix}:1234`,
				{ status: 200 },
			)
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(true)
})

test('checkIsCommonPassword returns false when password is not found in breach database', async () => {
	const password = 'sup3r-dup3r-s3cret'
	const [prefix] = getPasswordHashParts(password)

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/${prefix}`, () => {
			// Response with realistic suffixes that won't match
			return new HttpResponse(
				'1234567890123456789012345678901234A:1\n' +
					'1234567890123456789012345678901234B:2',
				{ status: 200 },
			)
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(false)
})

// Error cases
test('checkIsCommonPassword returns false when API returns 500', async () => {
	const password = 'testpassword'
	const [prefix] = getPasswordHashParts(password)

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/${prefix}`, () => {
			return new HttpResponse(null, { status: 500 })
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(false)
})

test('checkIsCommonPassword returns false when response has invalid format', async () => {
	consoleWarn.mockImplementation(() => {})
	const password = 'testpassword'
	const [prefix] = getPasswordHashParts(password)

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/${prefix}`, () => {
			// Create a response that will cause a TypeError when text() is called
			const response = new Response()
			Object.defineProperty(response, 'text', {
				value: () => Promise.resolve(null),
			})
			return response
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(false)
	expect(consoleWarn).toHaveBeenCalledWith(
		'Unknown error during password check',
		expect.any(TypeError),
	)
})

describe('timeout handling', () => {
	// normally we'd use fake timers for a test like this, but there's an issue
	// with AbortSignal.timeout() and fake timers: https://github.com/sinonjs/fake-timers/issues/418
	// beforeEach(() => vi.useFakeTimers())
	// afterEach(() => vi.useRealTimers())

	test('checkIsCommonPassword times out after 1 second', async () => {
		consoleWarn.mockImplementation(() => {})
		server.use(
			http.get('https://api.pwnedpasswords.com/range/:prefix', async () => {
				const twoSecondDelay = 2000
				await new Promise((resolve) => setTimeout(resolve, twoSecondDelay))
				// swap to this when we can use fake timers:
				// await vi.advanceTimersByTimeAsync(twoSecondDelay)
				return new HttpResponse(
					'1234567890123456789012345678901234A:1\n' +
						'1234567890123456789012345678901234B:2',
					{ status: 200 },
				)
			}),
		)

		const result = await checkIsCommonPassword('testpassword')
		expect(result).toBe(false)
		expect(consoleWarn).toHaveBeenCalledWith('Password check timed out')
	})
})

describe('resetUserPassword', () => {
	test('resets the password for a user who already has one', async () => {
		const userData = createUser()
		await prisma.user.create({
			data: { ...userData, password: { create: { hash: 'old-hash' } } },
		})

		await resetUserPassword({
			username: userData.username,
			password: 'new-password',
		})

		expect(
			await verifyUserPassword({ username: userData.username }, 'new-password'),
		).toEqual({ id: expect.any(String) })
	})

	test('resets the password for a user who has none yet (e.g. OAuth/passkey)', async () => {
		// Users created via a social connection or a passkey have no Password
		// record, so resetting must create one rather than update a missing row.
		const userData = createUser()
		await prisma.user.create({ data: userData })

		await resetUserPassword({
			username: userData.username,
			password: 'new-password',
		})

		expect(
			await verifyUserPassword({ username: userData.username }, 'new-password'),
		).toEqual({ id: expect.any(String) })
	})
})
