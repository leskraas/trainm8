// The planning surface's loader: it reads the active plan, and sends an athlete
// who has none to the flow's first question rather than to an empty page.
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './plan.tsx'

const ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/training/plan',
}

const DAY_MS = 24 * 60 * 60 * 1000

async function setupAthlete() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: { create: { timezone: 'UTC' } },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return { ...session, cookie: await getSessionCookieHeader(session) }
}

/** An upcoming Event carrying a one-phase, one-track Outline opening this week. */
async function createPlannedEvent(
	athleteId: string,
	overrides: { name?: string; inDays?: number } = {},
) {
	const monday = mondayOf(new Date())
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId,
			name: overrides.name ?? 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + (overrides.inDays ?? 60) * DAY_MS),
			disciplines: '["run"]',
		},
	})
	const outline = await prisma.planOutline.create({
		select: { id: true },
		data: {
			eventId: event.id,
			startWeekKey: monday,
			phases: { create: [{ orderIndex: 0, name: 'Base', weeks: 4 }] },
		},
	})
	await prisma.trainingTrack.create({
		data: {
			outlineId: outline.id,
			discipline: 'run',
			currency: 'km',
			anchors: { create: [{ fromWeekKey: monday, value: 50 }] },
		},
	})
	return { eventId: event.id, monday }
}

function mondayOf(instant: Date): string {
	const date = new Date(
		Date.UTC(
			instant.getUTCFullYear(),
			instant.getUTCMonth(),
			instant.getUTCDate(),
		),
	)
	date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
	return date.toISOString().slice(0, 10)
}

function request(cookie?: string, search = '') {
	const url = new URL(`/training/plan${search}`, BASE_URL)
	const headers = new Headers()
	if (cookie) headers.set('cookie', cookie)
	return new Request(url.toString(), { method: 'GET', headers })
}

test('an athlete with no plan is sent to the flow’s first question', async () => {
	const athlete = await setupAthlete()

	const response = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).headers.get('location')).toBe(
		'/training/plan/new',
	)
})

test('the surface reads the authored season, phases and derived weeks', async () => {
	const athlete = await setupAthlete()
	const { eventId, monday } = await createPlannedEvent(athlete.userId)

	const result = await loader({ request: request(athlete.cookie), ...ARGS_BASE })

	expect(result.season.eventId).toBe(eventId)
	expect(result.season.startWeekKey).toBe(monday)
	expect(result.season.weeks).toHaveLength(4)
	expect(result.season.weeks[0]?.targets[0]?.value).toBe(50)
	expect(result.season.phases[0]).toMatchObject({
		name: 'Base',
		fromWeekInPlan: 1,
		toWeekInPlan: 4,
	})
	// The default reading is Blocks, kept out of the URL.
	expect(result.tab).toBe('blocks')
})

test('the Weeks reading is selected by search param, and an unknown one is not', async () => {
	const athlete = await setupAthlete()
	await createPlannedEvent(athlete.userId)

	expect(
		(await loader({ request: request(athlete.cookie, '?tab=weeks'), ...ARGS_BASE }))
			.tab,
	).toBe('weeks')
	expect(
		(await loader({ request: request(athlete.cookie, '?tab=nonsense'), ...ARGS_BASE }))
			.tab,
	).toBe('blocks')
})

test('a named Event shows that Event’s season, not the nearest one', async () => {
	const athlete = await setupAthlete()
	await createPlannedEvent(athlete.userId)
	const later = await createPlannedEvent(athlete.userId, {
		name: 'Next Season',
		inDays: 400,
	})

	const result = await loader({
		request: request(athlete.cookie, `?event=${later.eventId}`),
		...ARGS_BASE,
	})

	expect(result.season.eventId).toBe(later.eventId)
	expect(result.eventQuery).toBe(later.eventId)
})

test('a named Event with no plan of its own falls back to the active plan', async () => {
	const athlete = await setupAthlete()
	await createPlannedEvent(athlete.userId)
	const marker = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: athlete.userId,
			name: 'Just a marker',
			kind: 'race',
			priority: 'C',
			startDate: new Date(Date.now() + 20 * DAY_MS),
			disciplines: '["run"]',
		},
	})

	const response = await loader({
		request: request(athlete.cookie, `?event=${marker.id}`),
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	expect((response as Response).headers.get('location')).toBe('/training/plan')
})

test('an unauthenticated athlete is sent to login', async () => {
	const response = await loader({ request: request(), ...ARGS_BASE }).catch(
		(error: unknown) => error,
	)

	expect((response as Response).headers.get('location')).toContain('/login')
})
