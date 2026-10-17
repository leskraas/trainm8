/**
 * Bibliotek's old address still lands (ADR 0101 §1): in the Bibliotek section
 * of Plan, on the plan when there is one and on plan creation — Plan's landing
 * while there is no plan — when there is not.
 */
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createKeepMeActivePlan } from '#app/utils/plan-outline/authoring.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './library.tsx'

const ROUTE_PATH = '/library'

async function setupUser() {
	return prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: { create: { ...createUser() } },
		},
		select: { id: true, userId: true },
	})
}

async function forwardOf(session: { id: string }): Promise<string | null> {
	try {
		await loader({
			request: new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
				headers: { cookie: await getSessionCookieHeader(session) },
			}),
			params: {},
			context: {} as AppLoadContext,
			unstable_pattern: ROUTE_PATH,
		})
	} catch (thrown) {
		if (thrown instanceof Response) return thrown.headers.get('location')
		throw thrown
	}
	return null
}

test('with a plan, Bibliotek lands in its section on Plan', async () => {
	const session = await setupUser()
	const created = await createKeepMeActivePlan(session.userId, {
		discipline: 'run',
		weeklyHours: 4,
	})
	expect(created.ok, 'the plan fixture failed to author').toBe(true)

	expect(await forwardOf(session)).toBe('/training/plan#bibliotek')
})

test('with no plan, Bibliotek lands in its section on plan creation', async () => {
	const session = await setupUser()

	expect(await forwardOf(session)).toBe('/training/plan/new#bibliotek')
})
