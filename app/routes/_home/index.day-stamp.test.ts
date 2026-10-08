/**
 * Tapping an empty day, on the server (ADR 0065 §5, #501).
 *
 * The gesture's whole claim is that what a cell writes is a **real session on
 * that date** and that it is **indistinguishable from one authored on the full
 * route**. Both are claims about the database, so both are checked here rather
 * than through the screen — including the second one literally, by authoring the
 * same session both ways and comparing what landed.
 */
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action as newSessionAction } from '../training/sessions.new.tsx'
import { action, loader } from './index.tsx'

const ROUTE_PATH = '/'
/**
 * A day the timeline actually renders — thirty days out, well inside the ±182
 * the loader queries. Every stamp here goes on a day the athlete could scroll
 * to, because that is now the action's own rule: a session written outside the
 * window is invisible on the one surface that offers the way back.
 */
const IN_WINDOW = addDays(localDate(new Date(), 'UTC'), 30)
const ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

async function setupUser() {
	const userData = createUser()
	return prisma.session.create({
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
}

function post(entries: Array<[string, string]>, cookieHeader: string) {
	const headers = new Headers({
		cookie: cookieHeader,
		'content-type': 'application/x-www-form-urlencoded',
	})
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers,
		body: new URLSearchParams(entries).toString(),
	})
}

function get(cookieHeader: string) {
	const headers = new Headers({ cookie: cookieHeader })
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'GET',
		headers,
	})
}

/** A completed session on `daysAgo`, which is what "history" means here. */
async function trained(userId: string, discipline: string, daysAgo: number) {
	const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
	await prisma.workout.create({
		data: {
			title: 'Session',
			discipline,
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
									discipline,
									durationSec: 1800,
								},
							],
						},
					},
				],
			},
			sessions: { create: { userId, scheduledAt: at, status: 'completed' } },
		},
	})
}

async function stampedSession(userId: string) {
	return prisma.workoutSession.findFirstOrThrow({
		where: { userId },
		select: {
			scheduledAt: true,
			status: true,
			source: true,
			plannedTssValue: true,
			workout: {
				select: {
					title: true,
					discipline: true,
					intent: true,
					blocks: {
						select: {
							repeatCount: true,
							steps: {
								select: {
									kind: true,
									discipline: true,
									durationSec: true,
									intensity: true,
								},
							},
						},
					},
				},
			},
		},
	})
}

test('tapping an empty day commits a real session on that date', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	const result = (await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'stamp-day'],
				['date', IN_WINDOW],
				['discipline', 'bike'],
			],
			cookie,
		),
	})) as { data: { stampedSessionId: string } }

	expect(result.data.stampedSessionId).toEqual(expect.any(String))
	const stamped = await stampedSession(session.userId)
	// The date the athlete tapped, at their Default Training Time.
	expect(localDate(stamped.scheduledAt, 'UTC')).toBe(IN_WINDOW)
	expect(stamped.status).toBe('scheduled')
	// A shape and a prescription from the first tap — not a title with nothing
	// under it (ADR 0065 §5).
	expect(stamped.workout!.blocks[0]!.steps).toEqual([
		{
			kind: 'cardio',
			discipline: 'bike',
			durationSec: 2700,
			intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z2' }),
		},
	])
	expect(stamped.workout!.title).toBe('45 min Z2')
})

test('a past day takes the same gesture, and authors a prescription rather than a recording', async () => {
	// `GOAL.md`'s no-in-app-recorder non-goal is about capturing executed cardio.
	// What this writes is a scheduled Workout Session with no Recording attached
	// and no actual on it — the actual still arrives by import (ADR 0049).
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const past = localDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), 'UTC')

	await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'stamp-day'],
				['date', past],
				['discipline', 'run'],
			],
			cookie,
		),
	})

	const row = await prisma.workoutSession.findFirstOrThrow({
		where: { userId: session.userId },
		select: { status: true, tssValue: true, recording: true },
	})
	expect(row.status).toBe('scheduled')
	expect(row.tssValue).toBeNull()
	expect(row.recording).toBeNull()
})

test('what a cell writes is what the full route writes', async () => {
	// The claim stated as an assertion: same structure, same title, same status,
	// same source — deliberately, since it is the same input through the same
	// `createWorkoutSession`.
	const cellUser = await setupUser()
	const routeUser = await setupUser()

	await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'stamp-day'],
				['date', IN_WINDOW],
				['discipline', 'run'],
			],
			await getSessionCookieHeader(cellUser),
		),
	})

	const routeRequest = new Request(
		new URL('/training/sessions/new', BASE_URL).toString(),
		{
			method: 'POST',
			headers: new Headers({
				cookie: await getSessionCookieHeader(routeUser),
				'content-type': 'application/x-www-form-urlencoded',
			}),
			body: new URLSearchParams([
				['title', '45 min Z2'],
				['discipline', 'run'],
				['intent', 'endurance'],
				['scheduledAtDate', IN_WINDOW],
				['scheduledAtTime', '07:00'],
				['structure', 'structured'],
				['blocks[0].repeatCount', '1'],
				['blocks[0].steps[0].kind', 'cardio'],
				['blocks[0].steps[0].discipline', 'run'],
				['blocks[0].steps[0].duration', '45 min'],
				[
					'blocks[0].steps[0].intensity',
					JSON.stringify({ kind: 'zoneLabel', label: 'Z2' }),
				],
			]).toString(),
		},
	)
	await newSessionAction({
		...ARGS_BASE,
		unstable_pattern: '/training/sessions/new',
		request: routeRequest,
	}).catch((response: unknown) => response)

	expect(await stampedSession(cellUser.userId)).toEqual(
		await stampedSession(routeUser.userId),
	)
})

test('a mistake is recoverable without leaving the timeline', async () => {
	// ADR 0076. Every empty row is a write target now, so a mistap commits a
	// database row; the way back is a post from the row itself.
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	const stamped = (await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'stamp-day'],
				['date', IN_WINDOW],
				['discipline', 'swim'],
			],
			cookie,
		),
	})) as { data: { stampedSessionId: string } }

	await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'undo-stamp'],
				['sessionId', stamped.data.stampedSessionId],
			],
			cookie,
		),
	})

	expect(
		await prisma.workoutSession.count({ where: { userId: session.userId } }),
	).toBe(0)
	// The prescription goes with it — an undone stamp leaves nothing behind.
	expect(
		await prisma.workout.count({ where: { ownerId: session.userId } }),
	).toBe(0)
})

test('one athlete cannot undo another athlete’s session', async () => {
	const owner = await setupUser()
	const other = await setupUser()
	const stamped = (await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'stamp-day'],
				['date', IN_WINDOW],
				['discipline', 'run'],
			],
			await getSessionCookieHeader(owner),
		),
	})) as { data: { stampedSessionId: string } }

	await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'undo-stamp'],
				['sessionId', stamped.data.stampedSessionId],
			],
			await getSessionCookieHeader(other),
		),
	})

	expect(
		await prisma.workoutSession.count({ where: { userId: owner.userId } }),
	).toBe(1)
})

test('a day nobody could point at on a calendar is refused', async () => {
	// `YYYY-MM-DD` is a shape, not a date. All three of these match it and all
	// three roll over silently in the day-bounds maths — `2026-13-45` becomes
	// February 2027 — so the guard is a round trip through the athlete's own
	// calendar rather than a regex.
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	for (const date of ['2026-13-45', '9999-99-99', '2026-02-30']) {
		await expect(
			action({
				...ARGS_BASE,
				request: post(
					[
						['intent', 'stamp-day'],
						['date', date],
						['discipline', 'run'],
					],
					cookie,
				),
			}),
		).rejects.toMatchObject({ status: 400 })
	}
	expect(
		await prisma.workoutSession.count({ where: { userId: session.userId } }),
	).toBe(0)
})

test('a day outside the window the timeline renders is refused', async () => {
	// ADR 0076's way back lives on the row, and a row exists only inside the
	// window home queries. A session stamped a year out would be a database row
	// the athlete cannot see and therefore cannot undo from where they made it.
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const todayKey = localDate(new Date(), 'UTC')

	for (const date of [addDays(todayKey, 400), addDays(todayKey, -400)]) {
		await expect(
			action({
				...ARGS_BASE,
				request: post(
					[
						['intent', 'stamp-day'],
						['date', date],
						['discipline', 'run'],
					],
					cookie,
				),
			}),
		).rejects.toMatchObject({ status: 400 })
	}
	expect(
		await prisma.workoutSession.count({ where: { userId: session.userId } }),
	).toBe(0)
})

test('a discipline the line cannot say is refused rather than half-written', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)

	await expect(
		action({
			...ARGS_BASE,
			request: post(
				[
					['intent', 'stamp-day'],
					['date', IN_WINDOW],
					['discipline', 'strength'],
				],
				cookie,
			),
		}),
	).rejects.toMatchObject({ status: 400 })
	expect(
		await prisma.workoutSession.count({ where: { userId: session.userId } }),
	).toBe(0)
})

test('the prefilled discipline is read from the athlete’s own history', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	await trained(session.userId, 'run', 30)
	await trained(session.userId, 'swim', 20)
	await trained(session.userId, 'swim', 10)

	const data = (await loader({ ...ARGS_BASE, request: get(cookie) })) as {
		stampDiscipline: string | null
	}
	expect(data.stampDiscipline).toBe('swim')
})

test('an athlete with no history gets no prefill, so the cell asks', async () => {
	const session = await setupUser()
	const data = (await loader({
		...ARGS_BASE,
		request: get(await getSessionCookieHeader(session)),
	})) as { stampDiscipline: string | null }

	expect(data.stampDiscipline).toBeNull()
})
