/**
 * _Se hele sesongen_ (spec #558 story 102, #562): the full Home Timeline at its
 * own address. Its claim is that it **is** I dag's timeline — what it reads and
 * what it writes — so both are checked against I dag's own route.
 *
 * Where it parks (on today, never at the top of a long empty history) is a
 * measurement of laid-out rows, and is driven in a real browser in
 * `tests/e2e/home-timeline.test.ts`.
 */
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { appTabPlace, HOME_TIMELINE_HREF } from '#app/utils/app-tabs.ts'
import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader as todayLoader } from './index.tsx'
import { action, loader } from './season.tsx'

const ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: HOME_TIMELINE_HREF,
}

async function signedIn() {
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
	return {
		userId: session.userId,
		cookie: await getSessionCookieHeader(session),
	}
}

function request(
	path: string,
	cookie: string | null,
	body?: Array<[string, string]>,
) {
	const headers = new Headers()
	if (cookie) headers.set('cookie', cookie)
	if (body) headers.set('content-type', 'application/x-www-form-urlencoded')
	return new Request(new URL(path, BASE_URL).toString(), {
		method: body ? 'POST' : 'GET',
		headers,
		body: body ? new URLSearchParams(body).toString() : undefined,
	})
}

/** A done session `daysAgo` — the athlete's history. */
async function trained(userId: string, daysAgo: number) {
	await prisma.workout.create({
		data: {
			title: 'Rolig tur',
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 1800,
								},
							],
						},
					},
				],
			},
			sessions: {
				create: {
					userId,
					scheduledAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
					status: 'completed',
				},
			},
		},
	})
}

test('signed out, the full view asks for a login and comes back to itself', async () => {
	const response = await loader({
		request: request(HOME_TIMELINE_HREF, null),
		...ARGS_BASE,
	}).catch((thrown: unknown) => thrown)

	expect(response).toBeInstanceOf(Response)
	const location = (response as Response).headers.get('location') ?? ''
	expect(location).toMatch(/^\/login\?/)
	expect(new URLSearchParams(location.split('?')[1]).get('redirectTo')).toBe(
		HOME_TIMELINE_HREF,
	)
})

test('the full view reads the same timeline I dag reads', async () => {
	const { userId, cookie } = await signedIn()
	await trained(userId, 3)
	await trained(userId, 170)

	const full = await loader({
		request: request(HOME_TIMELINE_HREF, cookie),
		...ARGS_BASE,
	})
	const today = await todayLoader({
		request: request('/', cookie),
		...ARGS_BASE,
		unstable_pattern: '/',
	})

	expect(today.isAuthenticated).toBe(true)
	const {
		isAuthenticated: _,
		now: todayNow,
		...todayTimeline
	} = today as Extract<typeof today, { isAuthenticated: true }>
	const { now: fullNow, ...fullTimeline } = full
	expect(fullNow).toBeInstanceOf(Date)
	expect(todayNow).toBeInstanceOf(Date)
	expect(fullTimeline).toEqual(todayTimeline)
	expect(full.ledger).toHaveLength(2)
})

test('a session written on the full view lands as one written on I dag does', async () => {
	const { userId, cookie } = await signedIn()
	const day = addDays(localDate(new Date(), 'UTC'), 2)

	const reply = (await action({
		request: request(HOME_TIMELINE_HREF, cookie, [
			['intent', 'write-session'],
			['date', day],
			['sentence', '45 min rolig'],
			['discipline', 'run'],
			['landing', 'toast'],
		]),
		...ARGS_BASE,
	})) as unknown as {
		data: { stampedSessionId: string; weekSumLine: string | null }
	}

	const written = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: reply.data.stampedSessionId },
		select: { userId: true, scheduledAt: true },
	})
	expect(written.userId).toBe(userId)
	expect(localDate(written.scheduledAt, 'UTC')).toBe(day)
	// The toast's week sum rides on the reply, as on I dag (#505 story 39).
	expect(reply.data.weekSumLine).toEqual(expect.any(String))
})

test('the full view keeps I dag the current tab', () => {
	expect(appTabPlace(HOME_TIMELINE_HREF)).toEqual({
		tab: 'today',
		landing: false,
	})
	expect(appTabPlace(`${HOME_TIMELINE_HREF}/`)).toEqual({
		tab: 'today',
		landing: false,
	})
	// I dag itself is still its own landing page.
	expect(appTabPlace('/')).toEqual({ tab: 'today', landing: true })
	// Matched on whole segments: a page that merely starts with the word is not.
	expect(appTabPlace('/seasons')).toBeNull()
})
