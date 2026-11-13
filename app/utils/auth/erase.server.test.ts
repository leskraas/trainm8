import { expect, test } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import { deleteAccount } from '../account-deletion.server.ts'
import { prisma } from '../db.server.ts'
import { auth } from './better-auth.server.ts'
import { hashPassword } from './password-hash.server.ts'

/**
 * Erasure clears every `AuthVerification` row that names the user (ADR 0114
 * §6). One test per flow that writes such a row, each driven through
 * `auth.api` so the row has the shape Better Auth really writes: an upgrade
 * that changes a format fails here instead of leaving rows behind.
 */

const PASSWORD = 'a-long-enough-password-123'

async function createAthlete({ twoFactor = false } = {}) {
	const { email, username, name } = createUser()
	const user = await prisma.user.create({
		select: { id: true, email: true },
		data: { email, username, name, twoFactorEnabled: twoFactor },
	})
	// A password Sign-in Method: Better Auth's credential row is keyed by the user id.
	await prisma.authAccount.create({
		data: {
			id: `${username}-credential`,
			userId: user.id,
			providerId: 'credential',
			accountId: user.id,
			password: await hashPassword(PASSWORD),
			updatedAt: new Date(),
		},
	})
	return user
}

/** The `Cookie` header a browser would send back after `response`. */
function cookiesFrom(response: Response) {
	const cookie = response.headers
		.getSetCookie()
		.map((header) => header.split(';')[0])
		.join('; ')
	return new Headers({ cookie, origin: process.env.APP_ORIGIN ?? '' })
}

async function rowsNaming(user: { id: string; email: string }) {
	const rows = await prisma.authVerification.findMany()
	return rows.filter(
		(row) =>
			row.value.includes(user.id) ||
			row.identifier.includes(user.email.toLowerCase()),
	)
}

async function expectErasedWith(
	user: { id: string; email: string },
	written: number,
) {
	expect(await prisma.authVerification.count()).toBeGreaterThanOrEqual(written)
	const bystander = await createAthlete()
	await auth.api.sendVerificationOTP({
		body: { email: bystander.email, type: 'sign-in' },
	})
	const before = await prisma.authVerification.count()

	await deleteAccount(user.id)

	expect(await rowsNaming(user)).toEqual([])
	expect(await prisma.authVerification.count()).toBe(before - written)
	expect(await rowsNaming(bystander)).toHaveLength(1)
}

test('an email code is erased with the account', async () => {
	const user = await createAthlete()
	await auth.api.sendVerificationOTP({
		body: { email: user.email, type: 'sign-in' },
	})
	await auth.api.sendVerificationOTP({
		body: { email: user.email, type: 'forget-password' },
	})
	expect(
		(await prisma.authVerification.findMany()).map((row) => row.identifier),
	).toEqual(
		expect.arrayContaining([
			`sign-in-otp-${user.email.toLowerCase()}`,
			`forget-password-otp-${user.email.toLowerCase()}`,
		]),
	)

	await expectErasedWith(user, 2)
})

test('a password reset is erased with the account', async () => {
	const user = await createAthlete()
	await auth.api.requestPasswordReset({
		body: { email: user.email, redirectTo: '/reset-password' },
	})
	const [reset] = await prisma.authVerification.findMany()
	expect(reset).toMatchObject({ value: user.id })
	expect(reset?.identifier).toMatch(/^reset-password:/)

	await expectErasedWith(user, 1)
})

test('the two-factor cookie and its code are erased with the account', async () => {
	const user = await createAthlete({ twoFactor: true })
	const signIn = await auth.api.signInEmail({
		body: { email: user.email, password: PASSWORD },
		asResponse: true,
	})
	await expect(signIn.json()).resolves.toMatchObject({
		twoFactorRedirect: true,
	})
	await auth.api.sendTwoFactorOTP({ headers: cookiesFrom(signIn), body: {} })
	const identifiers = (await prisma.authVerification.findMany()).map(
		(row) => row.identifier,
	)
	const key = identifiers.find((identifier) =>
		/^2fa-(?!otp-|attempts-)/.test(identifier),
	)
	expect(key).toBeDefined()
	expect(identifiers).toEqual(
		expect.arrayContaining([`2fa-otp-${key}`, `2fa-attempts-${key}`]),
	)

	await expectErasedWith(user, 3)
})

test('a passkey challenge is erased with the account', async () => {
	const user = await createAthlete()
	const signIn = await auth.api.signInEmail({
		body: { email: user.email, password: PASSWORD },
		asResponse: true,
	})
	expect(signIn.status).toBe(200)
	await auth.api.generatePasskeyRegistrationOptions({
		headers: cookiesFrom(signIn),
	})
	const [challenge] = await prisma.authVerification.findMany()
	expect(JSON.parse(challenge?.value ?? '{}')).toMatchObject({
		userData: { id: user.id },
	})

	await expectErasedWith(user, 1)
})

test('erasure keeps a code for an address that only looks like the user’s', async () => {
	const { username, name } = createUser()
	const user = await prisma.user.create({
		select: { id: true, email: true },
		data: { email: `a_b-${username}@example.test`, username, name },
	})
	const lookalike = `axb-${username}@example.test`
	await prisma.authVerification.create({
		data: {
			id: 'lookalike',
			identifier: `sign-in-otp-${lookalike}`,
			value: 'hashed:0',
			expiresAt: new Date(Date.now() + 300_000),
			updatedAt: new Date(),
		},
	})

	await deleteAccount(user.id)

	expect(
		await prisma.authVerification.findUnique({ where: { id: 'lookalike' } }),
	).not.toBeNull()
})
