/**
 * The session composer, on the server (owner decisions 1, 2, 4, 5 and 11,
 * round 2; ADR 0088): every write it can post lands the same way — the
 * session's id and the week's sum on the reply, nothing flashed — and what
 * it says beside the session (Annet, _Allerede gjort_, a note) is in the
 * database afterwards. And the sources it starts from.
 */
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { addDays, localDate, mondayOfDay } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { createCatalogueEntry } from '#app/utils/catalogue.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { MARK_DONE_REACH_DAYS } from '#app/utils/import-fit.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader as sourcesLoader } from '../resources/composer-sources.tsx'
import { action } from './index.tsx'

const ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/',
}

type Reply = {
	data: {
		stampedSessionId?: string
		weekSumLine?: string | null
		done?: boolean
	}
	init: { status?: number; headers?: HeadersInit } | null
}

async function setUp() {
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
	return { ...session, cookie: await getSessionCookieHeader(session) }
}

async function post(cookie: string, entries: Record<string, string>) {
	const request = new Request(new URL('/', BASE_URL).toString(), {
		method: 'POST',
		headers: new Headers({
			cookie,
			'content-type': 'application/x-www-form-urlencoded',
		}),
		body: new URLSearchParams(entries).toString(),
	})
	return (await action({ ...ARGS_BASE, request }).catch(
		(response: unknown) => response,
	)) as Reply | Response
}

const today = () => localDate(new Date(), 'UTC')

async function written(id: string | undefined) {
	return prisma.workoutSession.findUniqueOrThrow({
		where: { id },
		select: {
			scheduledAt: true,
			status: true,
			source: true,
			markedDoneAt: true,
			countsInNoTrack: true,
			workout: {
				select: {
					id: true,
					title: true,
					description: true,
					copiedFromId: true,
				},
			},
		},
	})
}

async function stockSession() {
	const stock = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Terskel 4 × 6 min',
			discipline: 'run',
			intent: 'threshold',
			authorship: 'system',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 4,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 360,
									intensity: JSON.stringify({
										kind: 'zoneLabel',
										label: 'terskel',
									}),
								},
								{ orderIndex: 1, kind: 'rest', durationSec: 60 },
							],
						},
					},
				],
			},
		},
	})
	await createCatalogueEntry(stock.id, { archetype: 'threshold' })
	return stock.id
}

test('every composer write lands by toast: the id and the week’s sum on the reply, nothing flashed', async () => {
	const user = await setUp()
	const day = addDays(today(), 2)
	const writes: Array<Record<string, string>> = [
		{ intent: 'stamp-day', date: day, discipline: 'run', landing: 'toast' },
		{
			intent: 'write-session',
			date: day,
			discipline: 'run',
			sentence: '45 min rolig',
			landing: 'toast',
		},
	]
	for (const entries of writes) {
		const reply = (await post(user.cookie, entries)) as Reply
		expect(reply.data.stampedSessionId).toEqual(expect.any(String))
		expect(reply.data.weekSumLine).toEqual(expect.any(String))
		expect(new Headers(reply.init?.headers).get('set-cookie')).toBeNull()
	}
})

test('a stamp from the composer may land past the window, as a sentence may', async () => {
	const user = await setUp()
	const far = addDays(today(), 3 * 365)
	const reply = (await post(user.cookie, {
		intent: 'stamp-day',
		date: far,
		discipline: 'bike',
		landing: 'toast',
	})) as Reply
	const row = await written(reply.data.stampedSessionId)
	expect(localDate(row.scheduledAt, 'UTC')).toBe(far)
	expect(row.workout?.title).toBe('45 min rolig')
})

test('Annet when writing: the session counts in no track, and the toast says so (owner decision 4)', async () => {
	const user = await setUp()
	const reply = (await post(user.cookie, {
		intent: 'write-session',
		date: addDays(today(), 1),
		discipline: '',
		sentence: '25 min sykkel',
		annet: 'true',
		landing: 'toast',
	})) as Reply
	const row = await written(reply.data.stampedSessionId)
	expect(row.countsInNoTrack).toBe(true)
	expect(reply.data.weekSumLine).toBe(
		'Økta teller i Annet. Ingen ukesum flyttet seg.',
	)
})

test('Allerede gjort writes a done session on a past day, however far back (owner decision 5)', async () => {
	const user = await setUp()
	const longAgo = addDays(today(), -(MARK_DONE_REACH_DAYS + 20))
	const reply = (await post(user.cookie, {
		intent: 'write-session',
		date: longAgo,
		discipline: 'run',
		sentence: '10 km rolig',
		done: 'true',
		landing: 'toast',
	})) as Reply
	expect(reply.data.done).toBe(true)
	const row = await written(reply.data.stampedSessionId)
	expect(row.status).toBe('completed')
	expect(row.markedDoneAt).not.toBeNull()
})

test('a done write on a day that has not begun is left planned, never claimed', async () => {
	const user = await setUp()
	const reply = (await post(user.cookie, {
		intent: 'write-session',
		date: addDays(today(), 3),
		discipline: 'run',
		sentence: '10 km rolig',
		done: 'true',
		landing: 'toast',
	})) as Reply
	expect(reply.data.done).toBe(false)
	expect((await written(reply.data.stampedSessionId)).status).toBe('scheduled')
})

test('a note from “Gjør grundigere” is the session’s description', async () => {
	const user = await setUp()
	const reply = (await post(user.cookie, {
		intent: 'write-session',
		date: addDays(today(), 1),
		discipline: 'run',
		sentence: '45 min rolig',
		notes: 'Med klubben, start ved bryggen',
		landing: 'toast',
	})) as Reply
	expect(
		(await written(reply.data.stampedSessionId)).workout?.description,
	).toBe('Med klubben, start ved bryggen')
})

test('Bibliotek places through the Catalogue: a fresh copy with its lineage, authored', async () => {
	const user = await setUp()
	const workoutId = await stockSession()
	const day = addDays(today(), 4)
	const reply = (await post(user.cookie, {
		intent: 'place-session',
		date: day,
		workoutId,
	})) as Reply
	const row = await written(reply.data.stampedSessionId)
	expect(localDate(row.scheduledAt, 'UTC')).toBe(day)
	expect(row.source).toBe('authored')
	expect(row.workout?.copiedFromId).toBe(workoutId)
	expect(row.workout?.id).not.toBe(workoutId)
	expect(reply.data.weekSumLine).toEqual(expect.any(String))
})

test('Kopier copies one of the athlete’s own sessions to another day, and never another athlete’s', async () => {
	const user = await setUp()
	const first = (await post(user.cookie, {
		intent: 'write-session',
		date: addDays(today(), -7),
		discipline: 'run',
		sentence: '6x1000 m terskel p 90 s',
		landing: 'toast',
	})) as Reply
	const sourceId = first.data.stampedSessionId!
	const day = addDays(today(), 1)
	const reply = (await post(user.cookie, {
		intent: 'copy-session',
		date: day,
		sessionId: sourceId,
	})) as Reply
	const copy = await written(reply.data.stampedSessionId)
	const original = await written(sourceId)
	expect(localDate(copy.scheduledAt, 'UTC')).toBe(day)
	expect(copy.workout?.title).toBe('6x1000 m terskel p 90 s')
	// A fresh Workout: editing the copy never edits the day it came from.
	expect(copy.workout?.id).not.toBe(original.workout?.id)

	const stranger = await setUp()
	const refused = await post(stranger.cookie, {
		intent: 'copy-session',
		date: day,
		sessionId: sourceId,
	})
	expect(refused).toBeInstanceOf(Response)
	expect((refused as Response).status).toBe(404)
})

test('every write is undone by the same delete (ADR 0088)', async () => {
	const user = await setUp()
	const workoutId = await stockSession()
	const reply = (await post(user.cookie, {
		intent: 'place-session',
		date: addDays(today(), 2),
		workoutId,
	})) as Reply
	await post(user.cookie, {
		intent: 'undo-stamp',
		sessionId: reply.data.stampedSessionId!,
	})
	expect(
		await prisma.workoutSession.findUnique({
			where: { id: reply.data.stampedSessionId },
		}),
	).toBeNull()
})

test('the sources: Bibliotek says each session as a line when it can; Kopier reads the week before, same weekday first', async () => {
	const user = await setUp()
	const workoutId = await stockSession()
	// Next week's Wednesday, so the day before its weekday a week back is still
	// in the week Kopier reads, whatever weekday the test runs on.
	const day = addDays(mondayOfDay(today()), 9)
	// Last week, relative to `day`: one on the same weekday, one the day before.
	for (const [offset, sentence] of [
		[-8, '10 km rolig'],
		[-7, '6x1000 m terskel p 90 s'],
	] as const) {
		await post(user.cookie, {
			intent: 'write-session',
			date: addDays(day, offset),
			discipline: 'run',
			sentence,
			landing: 'toast',
		})
	}
	const request = new Request(
		new URL(`/resources/composer-sources?day=${day}&discipline=run`, BASE_URL),
		{ headers: { cookie: user.cookie } },
	)
	const data = await sourcesLoader({ ...ARGS_BASE, request } as never)
	const placed = data.library.find((item) => item.id === workoutId)
	expect(placed).toMatchObject({
		title: 'Terskel 4 × 6 min',
		sentence: '4x6 min terskel p 1 min',
	})
	expect(data.copy.items.map((item) => item.title)).toEqual([
		'6x1000 m terskel p 90 s',
		'10 km rolig',
	])
})

test('a session of lifts from the composer: read against the catalogue on the server and written as strength (ADR 0089)', async () => {
	const user = await setUp()
	const day = addDays(today(), 2)
	const reply = (await post(user.cookie, {
		intent: 'write-session',
		date: day,
		discipline: 'strength',
		sentence: 'Knebøy 5×5 @ 82,5 kg · Benkpress 3×8',
		landing: 'toast',
	})) as Reply
	expect(reply.data.stampedSessionId).toEqual(expect.any(String))
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: reply.data.stampedSessionId },
		select: {
			source: true,
			workout: {
				select: {
					discipline: true,
					blocks: {
						select: {
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: {
									exercise: { select: { name: true } },
									sets: { select: { reps: true } },
								},
							},
						},
					},
				},
			},
		},
	})
	expect(session.source).toBe('authored')
	expect(session.workout?.discipline).toBe('strength')
	const steps = session.workout!.blocks[0]!.steps
	expect(steps.map((step) => step.exercise?.name)).toEqual([
		'Back Squat',
		'Bench Press',
	])
	expect(steps.map((step) => step.sets.length)).toEqual([5, 3])

	// A lift the catalogue does not hold is refused, never guessed.
	const refused = await post(user.cookie, {
		intent: 'write-session',
		date: day,
		discipline: 'strength',
		sentence: 'Knebøj 5×5',
		landing: 'toast',
	})
	expect(refused).toBeInstanceOf(Response)
	expect((refused as Response).status).toBe(400)
})
