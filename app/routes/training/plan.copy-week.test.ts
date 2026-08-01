// The planning surface's **copy a week** action (#415): the second write on this
// route that leaves Workout Sessions behind, and the second whose refusal can be a
// question the athlete answers.
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { addDays, localTimeUTC } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './plan.tsx'

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

function mondayOf(date: Date): string {
	const day = date.toISOString().slice(0, 10)
	const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay()
	return addDays(day, -((weekday + 6) % 7))
}

/** A four-week plan, so weeks 1 and 2 are both inside it. */
async function createPlan(athleteId: string) {
	const monday = mondayOf(new Date())
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 60 * DAY_MS),
			disciplines: '["run"]',
		},
	})
	const outline = await prisma.planOutline.create({
		select: { id: true, phases: { select: { id: true } } },
		data: {
			eventId: event.id,
			startWeekKey: monday,
			phases: {
				create: [{ orderIndex: 0, name: 'Base', weeks: 4, rhythm: 'none' }],
			},
		},
	})
	await prisma.trainingTrack.create({
		select: { id: true },
		data: {
			outlineId: outline.id,
			discipline: 'run',
			currency: 'km',
			anchors: { create: [{ fromWeekKey: monday, value: 50 }] },
			segments: {
				create: [{ kind: 'endurance', phaseId: outline.phases[0]!.id }],
			},
		},
	})
	return { eventId: event.id, outlineId: outline.id, monday }
}

/** One planned run in a given week, at 07:00 on the given weekday. */
async function addSession(
	athleteId: string,
	{
		eventId,
		weekKey,
		weekday,
		km = 10,
	}: { eventId: string; weekKey: string; weekday: number; km?: number },
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: athleteId,
			title: `${km} km`,
			discipline: 'run',
			intent: 'endurance',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									distanceM: km * 1000,
								},
							],
						},
					},
				],
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: athleteId,
			workoutId: workout.id,
			scheduledAt: localTimeUTC(addDays(weekKey, weekday), '07:00', 'UTC'),
			status: 'scheduled',
			source: 'authored',
			targetEventId: eventId,
		},
	})
}

function post(cookie: string, fields: Array<[string, string]>) {
	const body = new URLSearchParams()
	for (const [name, value] of fields) body.append(name, value)
	return new Request(new URL('/training/plan', BASE_URL).toString(), {
		method: 'POST',
		headers: new Headers({
			cookie,
			'content-type': 'application/x-www-form-urlencoded',
		}),
		body: body.toString(),
	})
}

async function submit(cookie: string, fields: Array<[string, string]>) {
	return action({ request: post(cookie, fields), ...ARGS_BASE }).catch(
		(error: unknown) => error,
	)
}

function copyFields(
	outlineId: string,
	sourceWeekKey: string,
	targetWeekKey: string,
	replace = false,
): Array<[string, string]> {
	return [
		['intent', 'copy-week'],
		['outlineId', outlineId],
		['sourceWeekKey', sourceWeekKey],
		['targetWeekKey', targetWeekKey],
		...(replace ? ([['replace', 'on']] as Array<[string, string]>) : []),
	]
}

async function sessionCount(userId: string) {
	return prisma.workoutSession.count({ where: { userId } })
}

test('a copy writes the target week and says so once, in words', async () => {
	const athlete = await setupAthlete()
	const plan = await createPlan(athlete.userId)
	await addSession(athlete.userId, {
		eventId: plan.eventId,
		weekKey: plan.monday,
		weekday: 2,
	})

	const response = (await submit(
		athlete.cookie,
		copyFields(plan.outlineId, plan.monday, addDays(plan.monday, 7)),
	)) as Response

	// A redirect rather than a fall-through: the calendar changed, and the page
	// cannot say by itself that the two weeks are now independent.
	expect(response.status).toBe(302)
	expect(response.headers.get('location')).toBe('/training/plan')
	expect(await sessionCount(athlete.userId)).toBe(2)
})

test('a filled target week comes back as a question, not a refusal, and writes nothing', async () => {
	const athlete = await setupAthlete()
	const plan = await createPlan(athlete.userId)
	const week2 = addDays(plan.monday, 7)
	await addSession(athlete.userId, {
		eventId: plan.eventId,
		weekKey: plan.monday,
		weekday: 2,
	})
	await addSession(athlete.userId, {
		eventId: plan.eventId,
		weekKey: week2,
		weekday: 4,
		km: 5,
	})

	const asked = (await submit(
		athlete.cookie,
		copyFields(plan.outlineId, plan.monday, week2),
	)) as {
		data: {
			error?: string
			copy: {
				sourceWeekKey: string
				targetWeekKey: string
				conflict: { weekInPlan: number; replacing: number; keeping: number }
			}
		}
		init: { status: number }
	}

	expect(asked.init.status).toBe(400)
	// No `error` key: nothing was refused and nothing is worded at the top of the
	// reading — the panel that renders the counts is the answer.
	expect(asked.data.error).toBeUndefined()
	expect(asked.data.copy.sourceWeekKey).toBe(plan.monday)
	expect(asked.data.copy.targetWeekKey).toBe(week2)
	expect(asked.data.copy.conflict).toEqual({
		weekKey: week2,
		weekInPlan: 2,
		replacing: 1,
		keeping: 0,
	})
	expect(await sessionCount(athlete.userId)).toBe(2)
})

test('the confirm submit replays the same weeks and replaces the target', async () => {
	const athlete = await setupAthlete()
	const plan = await createPlan(athlete.userId)
	const week2 = addDays(plan.monday, 7)
	await addSession(athlete.userId, {
		eventId: plan.eventId,
		weekKey: plan.monday,
		weekday: 2,
		km: 12,
	})
	const doomed = await addSession(athlete.userId, {
		eventId: plan.eventId,
		weekKey: week2,
		weekday: 4,
		km: 5,
	})

	const response = (await submit(
		athlete.cookie,
		copyFields(plan.outlineId, plan.monday, week2, true),
	)) as Response

	expect(response.status).toBe(302)
	expect(await prisma.workoutSession.count({ where: { id: doomed.id } })).toBe(
		0,
	)
	expect(await sessionCount(athlete.userId)).toBe(2)
})

test('copying an empty week is refused with a plain sentence', async () => {
	const athlete = await setupAthlete()
	const plan = await createPlan(athlete.userId)

	const refused = (await submit(
		athlete.cookie,
		copyFields(plan.outlineId, plan.monday, addDays(plan.monday, 7)),
	)) as { data: { error: string }; init: { status: number } }

	expect(refused.init.status).toBe(400)
	expect(refused.data.error).toBe(
		'That week has no sessions in it, so there is nothing to copy. Pick a week you have already filled in.',
	)
	expect(await sessionCount(athlete.userId)).toBe(0)
})

test('copying a week onto itself is refused rather than run', async () => {
	const athlete = await setupAthlete()
	const plan = await createPlan(athlete.userId)
	await addSession(athlete.userId, {
		eventId: plan.eventId,
		weekKey: plan.monday,
		weekday: 2,
	})

	const refused = (await submit(
		athlete.cookie,
		copyFields(plan.outlineId, plan.monday, plan.monday, true),
	)) as { data: { error: string } }

	expect(refused.data.error).toBe(
		'That is the same week twice. Pick a different week to copy it onto.',
	)
	expect(await sessionCount(athlete.userId)).toBe(1)
})

test('another athlete’s plan reads as gone and writes nothing', async () => {
	const mine = await setupAthlete()
	const theirs = await setupAthlete()
	const theirPlan = await createPlan(theirs.userId)
	await addSession(theirs.userId, {
		eventId: theirPlan.eventId,
		weekKey: theirPlan.monday,
		weekday: 2,
	})

	const refused = (await submit(
		mine.cookie,
		copyFields(
			theirPlan.outlineId,
			theirPlan.monday,
			addDays(theirPlan.monday, 7),
			true,
		),
	)) as { data: { error: string } }

	expect(refused.data.error).toBe('That plan is not available to edit.')
	expect(await sessionCount(mine.userId)).toBe(0)
	expect(await sessionCount(theirs.userId)).toBe(1)
})
