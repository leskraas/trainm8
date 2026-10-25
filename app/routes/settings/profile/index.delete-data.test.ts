// "Slett kontoen din" when the erasure fails. `deleteAccount` runs in one
// transaction, so a failure (its timeout, a CHECK, a busy database) rolls every
// write back: the athlete's account is untouched. The action has to say so on
// the page, not hand the throw to the root boundary, which replaced the whole
// app with an English "Unexpected Server Error" and left the athlete guessing
// whether anything was gone.

import { type AppLoadContext } from 'react-router'
import { expect, test, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './index.tsx'

vi.mock('#app/utils/account-deletion.server.ts', () => ({
	deleteAccount: vi.fn(async () => {
		throw new Error('Transaction already closed: timeout')
	}),
}))

test('a failed erasure is said on the page, and the account is still there', async () => {
	// The action logs what failed; the shared setup fails on console.error.
	consoleError.mockImplementation(() => {})
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

	const result = await action({
		request: new Request(new URL('/settings/profile', BASE_URL).toString(), {
			method: 'POST',
			headers: {
				cookie: await getSessionCookieHeader(session),
				'content-type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams([['intent', 'delete-data']]),
		}),
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: '/settings/profile',
	})

	expect(result).toMatchObject({ data: { status: 'error' } })
	expect(
		await prisma.user.findUnique({ where: { id: session.userId } }),
	).not.toBeNull()
})
