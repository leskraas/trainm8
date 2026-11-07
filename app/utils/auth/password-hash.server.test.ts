import { expect, test } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import { getPasswordHash, verifyUserPassword } from '../auth.server.ts'
import { prisma } from '../db.server.ts'
import { auth } from './better-auth.server.ts'
import { PASSWORD_HASH_COST } from './password-hash.server.ts'

/**
 * Both logins hash with bcrypt at cost 10 (ADR 0094 §2), so the cutover copies
 * `Password.hash` verbatim and a rollback can copy a new hash back.
 */

const PASSWORD = 'a-long-enough-password-123'

test('a hash copied from Epic’s Password signs in on Better Auth unchanged', async () => {
	const { email, username, name } = createUser()
	const user = await prisma.user.create({
		select: { id: true, password: { select: { hash: true } } },
		data: {
			email,
			username,
			name,
			password: { create: { hash: await getPasswordHash(PASSWORD) } },
		},
	})
	const epicHash = user.password?.hash ?? ''
	expect(epicHash).toMatch(new RegExp(`^\\$2[aby]\\$${PASSWORD_HASH_COST}\\$`))
	await prisma.authAccount.create({
		data: {
			id: `${username}-credential`,
			userId: user.id,
			providerId: 'credential',
			accountId: user.id,
			password: epicHash,
			updatedAt: new Date(),
		},
	})

	const signIn = await auth.api.signInEmail({
		body: { email, password: PASSWORD },
		asResponse: true,
	})

	expect(signIn.status).toBe(200)
})

test('a hash Better Auth writes is bcrypt at cost 10, and Epic verifies it', async () => {
	const context = await auth.$context
	const hash = await context.password.hash(PASSWORD)
	expect(hash).toMatch(/^\$2[aby]\$10\$/)

	const { email, username, name } = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: { email, username, name, password: { create: { hash } } },
	})

	await expect(verifyUserPassword({ id: user.id }, PASSWORD)).resolves.toEqual({
		id: user.id,
	})
	await expect(
		context.password.verify({ hash, password: 'not-the-password' }),
	).resolves.toBe(false)
})
