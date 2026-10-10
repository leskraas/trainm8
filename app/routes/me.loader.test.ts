/**
 * Meg's loader reads Form and Rekorder through the same server functions the
 * home hero read them through (#505), so the numbers match what the hero showed.
 */
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './me.tsx'

const ROUTE_PATH = '/me'

async function setupUser() {
	return prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: { create: { ...createUser() } },
		},
		select: { id: true, userId: true },
	})
}

async function runLoader(session: { id: string }) {
	return loader({
		request: new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
			headers: { cookie: await getSessionCookieHeader(session) },
		}),
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: ROUTE_PATH,
	})
}

test('a new athlete gets "ikke målt" with its reason, and no records', async () => {
	const session = await setupUser()

	const { form, records } = await runLoader(session)

	expect(form.stats.map((stat) => stat.value)).toEqual([null, null, null])
	expect(form.unmeasured).toMatch(/^Ikke målt ennå/)
	expect(form.baseline).toEqual({
		day: 0,
		required: 42,
		label: 'dag 0 av 42',
	})
	expect(records).toEqual([])
})

test('the latest Load Snapshot is the reading, and the snapshots are its trend', async () => {
	const session = await setupUser()
	await prisma.loadSnapshot.createMany({
		data: [
			{
				athleteId: session.userId,
				date: daysAgo(2),
				ctl: 51.4,
				atl: 40,
				tsb: 3,
			},
			{
				athleteId: session.userId,
				date: daysAgo(1),
				ctl: 61.6,
				atl: 58.2,
				tsb: 3.4,
			},
		],
	})

	const { form } = await runLoader(session)

	// Three days of history (the first day counts): Fitness and Fatigue read,
	// Form waits for the gate.
	expect(form.stats.map((stat) => stat.value)).toEqual(['62', '58', null])
	expect(form.baseline?.label).toBe('dag 3 av 42')
	expect(form.trend).toMatch(/^Kondisjon 51 → 62 siden /)
})

function daysAgo(days: number): string {
	const date = new Date(Date.now() - days * 86_400_000)
	return date.toISOString().slice(0, 10)
}
