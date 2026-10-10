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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { addDays, localDate, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { getWeekVolumes } from '#app/utils/plan-outline/week-volumes.server.ts'
import { toastSessionStorage } from '#app/utils/toast.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action as sessionAction } from '../training/sessions.$sessionId.tsx'
import { action, loader } from './index.tsx'

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
async function setUp({
	plan = true,
	weeks = 12,
}: { plan?: boolean; weeks?: number } = {}) {
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
			structure: { phases: [{ name: 'Blokk 1', weeks, rhythm: '3:1' }] },
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

test('from "+ Ny" the reply carries the week’s sum for the toast that holds Angre, and flashes none', async () => {
	const user = await setUp()
	const day = addDays(localDate(new Date(), 'UTC'), 7)
	const reply = (await action({
		...ARGS_BASE,
		request: post(
			[
				['intent', 'write-session'],
				['date', day],
				['discipline', 'run'],
				['sentence', '6 km rolig'],
				['landing', 'toast'],
			],
			user.cookie,
		),
	})) as Reply & { data: { weekSumLine?: string | null } }

	expect(reply.data.stampedSessionId).toEqual(expect.any(String))
	expect(reply.data.weekSumLine).toMatch(
		/^Løping neste uke: 0 → 6 km\. Ukemålet står på \d+\.$/,
	)
	// One toast, the client's: the server flashes nothing beside it.
	expect(await toastOf(reply)).toBeNull()
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

describe('the branches, on a fixed clock', () => {
	// Wednesday 6 March 2030, midday UTC: this week opened Monday 4 March.
	const NOW = new Date('2030-03-06T12:00:00Z')
	const TODAY = '2030-03-06'
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOW)
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	async function status(reply: Reply | Response) {
		return reply instanceof Response ? reply.status : 200
	}

	test('a day no calendar has, or one behind what I dag reads, is refused', async () => {
		const user = await setUp()
		for (const date of [
			'2030-02-30',
			'30-03-2030',
			// Half a year back is where I dag stops reading, and writing with it.
			addDays(TODAY, -200),
		]) {
			expect({
				date,
				status: await status(
					await write(user.cookie, { date, sentence: '10 km rolig' }),
				),
			}).toEqual({ date, status: 400 })
		}
		expect(
			await prisma.workoutSession.count({ where: { userId: user.userId } }),
		).toBe(0)
	})

	test('the window runs two years ahead, past the plan’s end, and the loader reads the session back', async () => {
		// Forty weeks: the plan ends about 280 days out. A race placed past it,
		// more than a year away, is written and read back (#505 story 40).
		const user = await setUp({ weeks: 40 })
		const far = addDays(TODAY, 500)
		const reply = (await write(user.cookie, {
			date: far,
			sentence: '30 km langtur',
		})) as Reply
		expect(reply.data.stampedSessionId).toEqual(expect.any(String))

		const home = await loader({
			...ARGS_BASE,
			request: new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
				headers: new Headers({ cookie: user.cookie }),
			}),
		})
		if (!home.isAuthenticated) throw new Error('expected a signed-in home')
		expect(home.ledger.map((s) => s.id)).toContain(reply.data.stampedSessionId)
	})

	test('a sentence goes any distance ahead, past what I dag reads, and is still taken back (#505 story 40)', async () => {
		const user = await setUp()
		// Past the two years the loader reads: written all the same.
		const farther = addDays(TODAY, 3 * 365)
		const reply = (await write(user.cookie, {
			date: farther,
			sentence: '42 km løp',
		})) as Reply
		expect(reply.data.stampedSessionId).toEqual(expect.any(String))
		const row = await prisma.workoutSession.findUniqueOrThrow({
			where: { id: reply.data.stampedSessionId },
			select: { scheduledAt: true },
		})
		expect(localDate(row.scheduledAt, 'UTC')).toBe(farther)

		// Its way back is the toast's Angre, the same undo the open row posts.
		await action({
			...ARGS_BASE,
			request: post(
				[
					['intent', 'undo-stamp'],
					['sessionId', reply.data.stampedSessionId!],
				],
				user.cookie,
			),
		})
		expect(
			await prisma.workoutSession.count({ where: { userId: user.userId } }),
		).toBe(0)
	})

	test('a stamp comes from a cell on screen, so it stays inside what I dag reads', async () => {
		const user = await setUp()
		const reply = await action({
			...ARGS_BASE,
			request: post(
				[
					['intent', 'stamp-day'],
					['date', addDays(TODAY, 3 * 365)],
					['discipline', 'run'],
				],
				user.cookie,
			),
		}).catch((response: unknown) => response)
		expect(await status(reply as Reply | Response)).toBe(400)
	})

	test('an empty or overlong sentence is refused', async () => {
		const user = await setUp()
		const date = addDays(TODAY, 1)
		expect(
			await status(await write(user.cookie, { date, sentence: '   ' })),
		).toBe(400)
		expect(
			await status(
				await write(user.cookie, {
					date,
					sentence: `10 km ${'rolig '.repeat(40)}`,
				}),
			),
		).toBe(400)
		expect(
			await status(
				await write(user.cookie, {
					date,
					sentence: '10 km rolig',
					discipline: 'strength',
				}),
			),
		).toBe(400)
	})

	test('undo on another athlete’s session leaves it, and says nothing', async () => {
		const owner = await setUp()
		const stranger = await setUp()
		const written = (await write(owner.cookie, {
			date: addDays(TODAY, 1),
			sentence: '8 km rolig',
		})) as Reply

		const reply = (await action({
			...ARGS_BASE,
			request: post(
				[
					['intent', 'undo-stamp'],
					['sessionId', written.data.stampedSessionId!],
				],
				stranger.cookie,
			),
		})) as Reply | { undone: true }

		expect(reply).toEqual({ undone: true })
		expect(
			await prisma.workoutSession.count({
				where: { id: written.data.stampedSessionId },
			}),
		).toBe(1)
	})

	test('a signed-out post is sent to log in', async () => {
		const reply = await action({
			...ARGS_BASE,
			request: post(
				[
					['intent', 'write-session'],
					['date', TODAY],
					['sentence', '10 km'],
				],
				'',
			),
		}).catch((response: unknown) => response)
		expect(reply).toBeInstanceOf(Response)
		expect((reply as Response).status).toBe(302)
		expect((reply as Response).headers.get('location')).toMatch(/^\/login/)
	})
})

describe('a change from the open row or the detail view says what it did', () => {
	function edit(
		sessionId: string,
		date: string,
		distance: string,
		cookie: string,
		notes = '',
	) {
		return sessionAction({
			...ARGS_BASE,
			unstable_pattern: '/training/sessions/:sessionId',
			params: { sessionId },
			request: new Request(
				new URL(`/training/sessions/${sessionId}`, BASE_URL).toString(),
				{
					method: 'POST',
					headers: new Headers({
						cookie,
						'content-type': 'application/x-www-form-urlencoded',
					}),
					body: new URLSearchParams({
						saveWorkout: '1',
						title: '6 km rolig',
						discipline: 'run',
						intent: 'endurance',
						scheduledAtDate: date,
						scheduledAtTime: '07:00',
						structure: 'structured',
						'blocks[0].repeatCount': '1',
						'blocks[0].steps[0].kind': 'cardio',
						'blocks[0].steps[0].discipline': 'run',
						'blocks[0].steps[0].distance': distance,
						'blocks[0].steps[0].notes': notes,
						'blocks[0].steps[0].intensity': JSON.stringify({
							kind: 'zoneLabel',
							label: 'Z2',
						}),
					}).toString(),
				},
			),
		}).catch((response: unknown) => response) as Promise<Reply | Response>
	}

	test('a token edit that moves the sum toasts it; one that does not says nothing', async () => {
		const user = await setUp()
		const day = addDays(localDate(new Date(), 'UTC'), 7)
		const written = (await write(user.cookie, {
			date: day,
			sentence: '6 km rolig',
		})) as Reply
		const id = written.data.stampedSessionId!
		const target = (
			await getWeekVolumes(user.userId, { weekKey: mondayOf(day) })
		).tracks[0]!.target

		const moved = (await edit(id, day, '8 km', user.cookie)) as Reply
		expect(await toastOf(moved)).toBe(
			`Løping neste uke: 6 → 8 km. Ukemålet står på ${target}.`,
		)

		const quiet = (await edit(
			id,
			day,
			'8 km',
			user.cookie,
			'med gjengen',
		)) as Reply
		expect(quiet.data).toEqual({ saved: true })
		expect(await toastOf(quiet)).toBeNull()
	})

	test('a delete from the detail view goes home with the sum the other way', async () => {
		const user = await setUp()
		const day = addDays(localDate(new Date(), 'UTC'), 7)
		const written = (await write(user.cookie, {
			date: day,
			sentence: '6 km rolig',
		})) as Reply
		const id = written.data.stampedSessionId!

		const response = (await sessionAction({
			...ARGS_BASE,
			unstable_pattern: '/training/sessions/:sessionId',
			params: { sessionId: id },
			request: post([['intent', 'delete']], user.cookie),
		})) as Response

		expect(response.headers.get('location')).toBe('/')
		expect(
			await toastOf({ data: {}, init: { headers: response.headers } }),
		).toMatch(/^Løping neste uke: 6 → 0 km\. Ukemålet står på \d+\.$/)
	})
})
