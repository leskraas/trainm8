// The planning surface's **stamp** action (#412): the one write on this route that
// leaves Workout Sessions behind rather than Plan Outline rows, and the one whose
// refusal can be a question the athlete answers.
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { addDays } from '#app/utils/athlete-calendar.ts'
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

/** A planned Event whose Outline carries one pattern with one share day on it. */
async function createStampablePlan(athleteId: string) {
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
	const track = await prisma.trainingTrack.create({
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
	const pattern = await prisma.weekPattern.create({
		select: { id: true },
		data: {
			outlineId: outline.id,
			name: 'Typical week',
			orderIndex: 0,
			days: {
				create: [
					{
						weekday: 5, // Saturday, Monday-first (ADR 0019)
						orderInDay: 0,
						kind: 'share',
						weight: 1,
						trackId: track.id,
					},
				],
			},
		},
	})
	return { eventId: event.id, monday, patternId: pattern.id }
}

/**
 * One posted body, with **repeated** `weekKeys` — the whole point of the control is
 * that a stamp carries however many weeks the athlete ticked, in one submit.
 */
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

function stampFields(
	patternId: string,
	weekKeys: string[],
	replace = false,
): Array<[string, string]> {
	return [
		['intent', 'stamp-week-pattern'],
		['patternId', patternId],
		...weekKeys.map((weekKey): [string, string] => ['weekKeys', weekKey]),
		...(replace ? ([['replace', 'on']] as Array<[string, string]>) : []),
	]
}

async function sessionCount(userId: string) {
	return prisma.workoutSession.count({ where: { userId } })
}

test('a stamp writes the ticked weeks and says so once, in words', async () => {
	const athlete = await setupAthlete()
	const plan = await createStampablePlan(athlete.userId)

	const response = (await submit(
		athlete.cookie,
		stampFields(plan.patternId, [plan.monday, addDays(plan.monday, 7)]),
	)) as Response

	// A redirect rather than a fall-through: the calendar changed, and the one
	// thing the page cannot say by itself is that the sessions are now ordinary.
	expect(response.status).toBe(302)
	expect(response.headers.get('location')).toBe('/training/plan')
	expect(await sessionCount(athlete.userId)).toBe(2)
})

test('a filled week comes back as a question, not a refusal, and writes nothing', async () => {
	const athlete = await setupAthlete()
	const plan = await createStampablePlan(athlete.userId)
	await submit(athlete.cookie, stampFields(plan.patternId, [plan.monday]))

	const again = (await submit(
		athlete.cookie,
		stampFields(plan.patternId, [plan.monday, addDays(plan.monday, 7)]),
	)) as {
		data: {
			error?: string
			stamp: {
				patternId: string
				weekKeys: string[]
				conflicts: Array<{ weekKey: string; replacing: number }>
			}
		}
		init: { status: number }
	}

	expect(again.init.status).toBe(400)
	// No `error` key: nothing was refused and nothing is worded at the top of the
	// reading — the panel that renders the counts is the answer.
	expect(again.data.error).toBeUndefined()
	expect(again.data.stamp.patternId).toBe(plan.patternId)
	expect(again.data.stamp.weekKeys).toEqual([
		plan.monday,
		addDays(plan.monday, 7),
	])
	expect(again.data.stamp.conflicts).toEqual([
		{ weekKey: plan.monday, weekInPlan: 1, replacing: 1, keeping: 0 },
	])
	// Neither week was touched — not even the empty one.
	expect(await sessionCount(athlete.userId)).toBe(1)
})

test('the confirm submit replays the same weeks and replaces them', async () => {
	const athlete = await setupAthlete()
	const plan = await createStampablePlan(athlete.userId)
	await submit(athlete.cookie, stampFields(plan.patternId, [plan.monday]))
	const before = await prisma.workoutSession.findFirstOrThrow({
		where: { userId: athlete.userId },
		select: { id: true },
	})

	const response = (await submit(
		athlete.cookie,
		stampFields(plan.patternId, [plan.monday], true),
	)) as Response

	expect(response.status).toBe(302)
	const after = await prisma.workoutSession.findMany({
		where: { userId: athlete.userId },
		select: { id: true },
	})
	expect(after).toHaveLength(1)
	expect(after[0]!.id).not.toBe(before.id)
})

test('a stamp with no week ticked is refused with a sentence', async () => {
	const athlete = await setupAthlete()
	const plan = await createStampablePlan(athlete.userId)

	const refused = (await submit(
		athlete.cookie,
		stampFields(plan.patternId, []),
	)) as { data: { error: string }; init: { status: number } }

	expect(refused.init.status).toBe(400)
	expect(refused.data.error).toBe('Choose at least one week to stamp')
	expect(await sessionCount(athlete.userId)).toBe(0)
})

test('another athlete’s pattern reads as gone and writes nothing', async () => {
	const mine = await setupAthlete()
	const theirs = await setupAthlete()
	await createStampablePlan(mine.userId)
	const theirPlan = await createStampablePlan(theirs.userId)

	const refused = (await submit(
		mine.cookie,
		stampFields(theirPlan.patternId, [theirPlan.monday]),
	)) as { data: { error: string } }

	expect(refused.data.error).toBe(
		'That week pattern is no longer part of this plan.',
	)
	expect(await sessionCount(mine.userId)).toBe(0)
	expect(await sessionCount(theirs.userId)).toBe(0)
})
