import { test as base, type Locator, type Response } from '@playwright/test'
import { type User as UserModel } from '@prisma/client'
import { href, type Register } from 'react-router'
import * as setCookieParser from 'set-cookie-parser'
import {
	getPasswordHash,
	getSessionExpirationDate,
	sessionKey,
} from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { MOCK_CODE_GITHUB_HEADER } from '#app/utils/providers/constants.ts'
import { normalizeEmail } from '#app/utils/providers/provider.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createUser } from './db-utils.ts'
import {
	type GitHubUser,
	deleteGitHubUser,
	insertGitHubUser,
} from './mocks/github.ts'

export * from './db-utils.ts'

/**
 * An athlete timezone where it is midday now (local 12:00–12:59).
 *
 * The app's day is the athlete's day. A seed placed hours either side of now —
 * "done earlier today", "later today" — leaves a UTC athlete's today in the
 * last or first hours of the UTC day, so it is seeded for an athlete whose
 * day has room on both sides. The local hour is the UTC hour plus the offset
 * with no wrap, so the athlete's date is the UTC date: a spec's
 * `toISOString().slice(0, 10)` still names their today.
 */
export function middayTimezone(now = new Date()) {
	const offset = 12 - now.getUTCHours()
	if (offset === 0) return 'UTC'
	// POSIX signs: Etc/GMT-3 is three hours *ahead* of UTC.
	return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`
}

/**
 * Wait until React has hydrated `control`: its props are on the host node.
 *
 * A tap that lands before hydration is lost, or worse, a form posts natively
 * and the page navigates to a resource route's raw answer. Where a tap is a
 * write, retrying it is no fix (the first may have landed), so wait for the
 * handler instead and tap once.
 */
export async function untilHydrated(control: Locator) {
	await expect
		.poll(
			() =>
				control.evaluate((el) =>
					Object.keys(el).some((key) => key.startsWith('__reactProps$')),
				),
			{ timeout: 15_000 },
		)
		.toBe(true)
}

type GetOrInsertUserOptions = {
	id?: string
	username?: UserModel['username']
	password?: string
	email?: UserModel['email']
}

type User = {
	id: string
	email: string
	username: string
	name: string | null
}

async function getOrInsertUser({
	id,
	username,
	password,
	email,
}: GetOrInsertUserOptions = {}): Promise<User> {
	const select = { id: true, email: true, username: true, name: true }
	if (id) {
		return await prisma.user.findUniqueOrThrow({
			select,
			where: { id: id },
		})
	} else {
		const userData = createUser()
		username ??= userData.username
		password ??= userData.username
		email ??= userData.email
		return await prisma.user.create({
			select,
			data: {
				...userData,
				email,
				username,
				roles: { connect: { name: 'user' } },
				password: { create: { hash: await getPasswordHash(password) } },
			},
		})
	}
}

export type AppPages = keyof Register['pages']

export const test = base.extend<{
	navigate: <Path extends AppPages>(
		...args: Parameters<typeof href<Path>>
	) => Promise<null | Response>
	insertNewUser(options?: GetOrInsertUserOptions): Promise<User>
	login(options?: GetOrInsertUserOptions): Promise<User>
	prepareGitHubUser(): Promise<GitHubUser>
	hideDevtools: void
}>({
	/**
	 * The dev server's React Router devtools trigger floats over the bottom-right
	 * corner, which on a phone is the Meg tab (ADR 0083). It is a dev-only
	 * overlay — the CI server runs the production build — so every test hides
	 * it rather than clicking round it.
	 */
	hideDevtools: [
		async ({ page }, use) => {
			await page.addInitScript(() => {
				document.addEventListener('DOMContentLoaded', () => {
					const style = document.createElement('style')
					style.textContent =
						'[data-testid="react-router-devtools-trigger"]{display:none!important}'
					document.head.append(style)
				})
			})
			await use()
		},
		{ auto: true },
	],
	navigate: async ({ page }, use) => {
		await use((...args) => {
			return page.goto(href(...args))
		})
	},
	insertNewUser: async ({}, use) => {
		let userId: string | undefined = undefined
		await use(async (options) => {
			const user = await getOrInsertUser(options)
			userId = user.id
			return user
		})
		await prisma.user.delete({ where: { id: userId } }).catch(() => {})
	},
	login: async ({ page }, use) => {
		let userId: string | undefined = undefined
		await use(async (options) => {
			const user = await getOrInsertUser(options)
			userId = user.id
			const session = await prisma.session.create({
				data: {
					expirationDate: getSessionExpirationDate(),
					userId: user.id,
				},
				select: { id: true },
			})

			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieConfig = setCookieParser.parseString(
				await authSessionStorage.commitSession(authSession),
			)
			const newConfig = {
				...cookieConfig,
				domain: 'localhost',
				expires: cookieConfig.expires?.getTime(),
				sameSite: cookieConfig.sameSite as 'Strict' | 'Lax' | 'None',
			}
			await page.context().addCookies([newConfig])
			return user
		})
		await prisma.user.deleteMany({ where: { id: userId } })
	},
	prepareGitHubUser: async ({ page }, use, testInfo) => {
		await page.route(/\/auth\/github(?!\/callback)/, async (route, request) => {
			const headers = {
				...request.headers(),
				[MOCK_CODE_GITHUB_HEADER]: testInfo.testId,
			}
			await route.continue({ headers })
		})

		let ghUser: GitHubUser | null = null
		await use(async () => {
			const newGitHubUser = await insertGitHubUser(testInfo.testId)!
			ghUser = newGitHubUser
			return newGitHubUser
		})

		const user = await prisma.user.findUnique({
			select: { id: true, name: true },
			where: { email: normalizeEmail(ghUser!.primaryEmail) },
		})
		if (user) {
			await prisma.user.delete({ where: { id: user.id } })
			await prisma.session.deleteMany({ where: { userId: user.id } })
		}
		await deleteGitHubUser(ghUser!.primaryEmail)
	},
})
export const { expect } = test

/**
 * This allows you to wait for something (like an email to be available).
 *
 * It calls the callback every 50ms until it returns a value (and does not throw
 * an error). After the timeout, it will throw the last error that was thrown or
 * throw the error message provided as a fallback
 */
export async function waitFor<ReturnValue>(
	cb: () => ReturnValue | Promise<ReturnValue>,
	{
		errorMessage,
		timeout = 5000,
	}: { errorMessage?: string; timeout?: number } = {},
) {
	const endTime = Date.now() + timeout
	let lastError: unknown = new Error(errorMessage)
	while (Date.now() < endTime) {
		try {
			const response = await cb()
			if (response) return response
		} catch (e: unknown) {
			lastError = e
		}
		await new Promise((r) => setTimeout(r, 100))
	}
	throw lastError
}
