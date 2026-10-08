/**
 * The writing line, on the server (#505 stories 35–40).
 *
 * A typed sentence is read again on the server — the client's preview is never
 * trusted as structure — and written through the Day Stamp's own path, so it is
 * an authored session like any other. The claims are about the database and the
 * reply: what landed, that the Week Target did not move, and the toast that
 * says so.
 */
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { addDays, localDate, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { getWeekVolumes } from '#app/utils/plan-outline/week-volumes.server.ts'
import { toastSessionStorage } from '#app/utils/toast.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './index.tsx'

const ROUTE_PATH = '/'
const ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

type Reply = {
	data: { stampedSessionId?: string }
	init: { status?: number; headers?: HeadersInit } | null
}

/** A runner on UTC with a plan that opened this Monday: a km track. */
async function setUp({ plan = true }: { plan?: boolean } = {}) {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: {
						create: { timezone: 'UTC', defaultTrainingTime: '07:00' },
					},
				},
			},
		},
		select: { id: true, userId: true },
	})
	if (plan) {
		const created = await createPlanOutline(session.userId, {
			startWeekKey: weekMonday(new Date(), 'UTC'),
			structure: { phases: [{ name: 'Blokk 1', weeks: 12, rhythm: '3:1' }] },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
		})
		if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	}
	return { ...session, cookie: await getSessionCookieHeader(session) }
}

function post(entries: Array<[string, string]>, cookie: string) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: new Headers({
			cookie,
			'content-type': 'application/x-www-form-urlencoded',
		}),
		body: new URLSearchParams(entries).toString(),
	})
}

async function write(
	cookie: string,
	{
		date,
		sentence,
		discipline = 'run',
	}: { date: string; sentence: string; discipline?: string },
) {
	return (await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'write-session'],
				['date', date],
				['discipline', discipline],
				['sentence', sentence],
			],
			cookie,
		),
	}).catch((response: unknown) => response)) as Reply | Response
}

/** The toast a reply flashes, as the root loader would read it. */
async function toastOf(reply: Reply): Promise<string | null> {
	const cookie = new Headers(reply.init?.headers).get('set-cookie')
	if (!cookie) return null
	const session = await toastSessionStorage.getSession(cookie)
	return (
		(session.get('toast') as { description: string } | undefined)
			?.description ?? null
	)
}

function mondayOf(dayKey: string): string {
	const weekday = (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7
	return addDays(dayKey, -weekday)
}

/** The plan's targets for every week, as stored rows — what must not move. */
async function storedTargets(userId: string) {
	return prisma.planOutline.findFirstOrThrow({
		where: { athleteId: userId },
		select: {
			updatedAt: true,
			phases: true,
			tracks: {
				select: {
					currency: true,
					anchors: { select: { fromWeekKey: true, value: true } },
					segments: true,
					overrides: true,
				},
			},
		},
	})
}

test('a typed sentence becomes an authored session with the structure it says', async () => {
	const user = await setUp()
	const day = addDays(localDate(new Date(), 'UTC'), 2)

	const reply = (await write(user.cookie, {
		date: day,
		sentence: '3x10 min terskel p 1 min',
	})) as Reply

	expect(reply.data.stampedSessionId).toEqual(expect.any(String))
	const row = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: reply.data.stampedSessionId },
		select: {
			scheduledAt: true,
			status: true,
			source: true,
			workout: {
				select: {
					title: true,
					discipline: true,
					intent: true,
					blocks: {
						select: {
							repeatCount: true,
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: { kind: true, durationSec: true, intensity: true },
							},
						},
					},
				},
			},
		},
	})
	expect(localDate(row.scheduledAt, 'UTC')).toBe(day)
	expect(row.status).toBe('scheduled')
	// The athlete's own words: authored, so no machine write may change it.
	expect(row.source).toBe('authored')
	expect(row.workout).toEqual({
		title: '3x10 min terskel p 1 min',
		discipline: 'run',
		intent: 'threshold',
		blocks: [
			{
				repeatCount: 3,
				steps: [
					{
						kind: 'cardio',
						durationSec: 600,
						intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z4' }),
					},
					{ kind: 'rest', durationSec: 60, intensity: null },
				],
			},
		],
	})
})

test('writing a session moves the week sum and never the Week Target', async () => {
	const user = await setUp()
	const day = addDays(localDate(new Date(), 'UTC'), 1)
	const weekKey = mondayOf(day)
	const targetsBefore = await storedTargets(user.userId)
	const before = await getWeekVolumes(user.userId, { weekKey })
	const run = before.tracks.find((t) => t.discipline === 'run')!
	expect(run.target).toEqual(expect.any(Number))

	const reply = (await write(user.cookie, {
		date: day,
		sentence: '6 km rolig',
	})) as Reply

	const after = await getWeekVolumes(user.userId, { weekKey })
	const runAfter = after.tracks.find((t) => t.discipline === 'run')!
	expect(runAfter.planned).toBe((run.planned ?? 0) + 6)
	expect(runAfter.target).toBe(run.target)
	expect(await storedTargets(user.userId)).toEqual(targetsBefore)

	const sameWeek = weekKey === weekMonday(new Date(), 'UTC')
	expect(await toastOf(reply)).toBe(
		`Løping ${sameWeek ? 'denne uka' : 'neste uke'}: ${run.planned ?? 0} → ${(run.planned ?? 0) + 6} km. Ukemålet står på ${run.target}.`,
	)
})

test('a session with no km says so in the toast rather than adding zero', async () => {
	const user = await setUp()
	const day = addDays(localDate(new Date(), 'UTC'), 7)

	const reply = (await write(user.cookie, {
		date: day,
		sentence: '45 min rolig',
	})) as Reply

	expect(await toastOf(reply)).toMatch(
		/^Løping neste uke: 0 km, \+1 uten km\. Ukemålet står på \d+\.$/,
	)
})

test('a day past the Planning Horizon and months out takes the same sentence', async () => {
	const user = await setUp()
	const far = addDays(localDate(new Date(), 'UTC'), 120)

	const reply = (await write(user.cookie, {
		date: far,
		sentence: '21 km langtur',
	})) as Reply

	expect(reply.data.stampedSessionId).toEqual(expect.any(String))
	const row = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: reply.data.stampedSessionId },
		select: { scheduledAt: true },
	})
	expect(localDate(row.scheduledAt, 'UTC')).toBe(far)
})

test('a sentence the reader is unsure of writes nothing', async () => {
	const user = await setUp()
	const day = addDays(localDate(new Date(), 'UTC'), 1)

	const reply = await write(user.cookie, {
		date: day,
		sentence: '3x10 min terksel',
	})

	expect(reply).toBeInstanceOf(Response)
	expect((reply as Response).status).toBe(400)
	expect(
		await prisma.workoutSession.count({ where: { userId: user.userId } }),
	).toBe(0)
})

test('without a plan the toast says there is no target', async () => {
	const user = await setUp({ plan: false })
	const day = addDays(localDate(new Date(), 'UTC'), 1)

	const reply = (await write(user.cookie, {
		date: day,
		sentence: '10 km rolig',
	})) as Reply

	expect(await toastOf(reply)).toBe(
		'Økta er lagt inn. Uten plan er det ikke noe ukemål.',
	)
})

test('taking a session back states the sum the other way', async () => {
	const user = await setUp()
	const day = addDays(localDate(new Date(), 'UTC'), 7)
	const written = (await write(user.cookie, {
		date: day,
		sentence: '8 km rolig',
	})) as Reply
	const target = (await getWeekVolumes(user.userId, { weekKey: mondayOf(day) }))
		.tracks[0]!.target

	const undone = (await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'undo-stamp'],
				['sessionId', written.data.stampedSessionId!],
			],
			user.cookie,
		),
	})) as Reply

	expect(await toastOf(undone)).toBe(
		`Løping neste uke: 8 → 0 km. Ukemålet står på ${target}.`,
	)
})
