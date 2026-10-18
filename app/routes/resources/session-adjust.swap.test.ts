/**
 * **Bytt økt** through Juster's resource route (spec #558 S5, #579): a pick
 * from Bibliotek — a Catalogue session, a program day or one exercise —
 * replaces today's prescription, with _Angre_. It is the athlete's choice of
 * session, so it **adopts** the machine's session under the normal rule
 * (ADR 0080), unlike _For sliten i dag_ and _Lite tid_.
 */
import { type AppLoadContext } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sessionOwner } from '#app/utils/session-ownership.ts'
import { getSessionDurationMin } from '#app/utils/training.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './session-adjust.tsx'

// Wednesday 2 January 2030, midday UTC; the week is Mon 31 Dec – Sun 6 Jan.
const NOW = new Date('2030-01-02T12:00:00Z')
const TODAY_AT = '2030-01-02T17:00:00.000Z'
const ROUTE_PATH = '/resources/session-adjust'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(NOW)
})
afterEach(() => {
	vi.useRealTimers()
})

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

/** A planned run on its own Workout. The machine's unless `authored`. */
async function planned(
	userId: string,
	at: string,
	{
		title = 'Terskeløkt · Løping',
		minutes = 60,
		source = 'generated',
		status = 'scheduled',
		releasedAt = null,
	}: {
		title?: string
		minutes?: number
		source?: string
		status?: string
		releasedAt?: Date | null
	} = {},
): Promise<string> {
	const workout = await prisma.workout.create({
		data: {
			title,
			discipline: 'run',
			intent: 'threshold',
			ownerId: userId,
			blocks: {
				create: {
					orderIndex: 0,
					repeatCount: 1,
					steps: {
						create: {
							orderIndex: 0,
							kind: 'cardio',
							discipline: 'run',
							durationSec: minutes * 60,
						},
					},
				},
			},
			sessions: {
				create: {
					userId,
					scheduledAt: new Date(at),
					status,
					source,
					releasedAt,
					replanReason: 'Lagt inn av planen.',
				},
			},
		},
		select: { sessions: { select: { id: true } } },
	})
	return workout.sessions[0]!.id
}

let stockCount = 0

/** A Stock Workout in the Catalogue: a 45-minute easy ride. */
async function stockRide(title = 'Rolig sykkeltur') {
	stockCount += 1
	const workout = await prisma.workout.create({
		data: {
			title,
			description: 'Fra tabellen.',
			discipline: 'bike',
			intent: 'endurance',
			archetype: 'easy',
			authorship: 'system',
			ownerId: null,
			blocks: {
				create: {
					orderIndex: 0,
					repeatCount: 1,
					steps: {
						create: {
							orderIndex: 0,
							kind: 'cardio',
							discipline: 'bike',
							durationSec: 45 * 60,
						},
					},
				},
			},
		},
		select: { id: true },
	})
	await prisma.catalogueEntry.create({
		data: {
			id: `swap-test-entry-${stockCount}-${workout.id}`,
			workoutId: workout.id,
			workoutAuthorship: 'system',
			archetype: 'easy',
		},
	})
	return workout.id
}

async function exercise(name: string) {
	return prisma.exercise.create({
		data: { name, primaryMuscle: 'quads', authorship: 'system' },
		select: { id: true },
	})
}

/** A seeded program with one day, a lift at 5 × 5. */
async function programDay() {
	const lift = await exercise(`Knebøy ${Math.random().toString(36).slice(2)}`)
	const key = Math.random().toString(36).slice(2)
	const workout = await prisma.workout.create({
		data: {
			title: 'Økt A',
			discipline: 'strength',
			intent: 'strength',
			authorship: 'system',
			ownerId: null,
			blocks: {
				create: {
					orderIndex: 0,
					repeatCount: 1,
					steps: {
						create: {
							orderIndex: 0,
							kind: 'strength',
							exerciseId: lift.id,
							sets: {
								create: Array.from({ length: 5 }, (_, index) => ({
									orderIndex: index,
									kind: 'reps',
									reps: 5,
								})),
							},
						},
					},
				},
			},
		},
		select: { id: true },
	})
	const program = await prisma.strengthProgram.create({
		data: {
			id: `prog_swap_${key}`,
			key: `swap-${key}`,
			variantId: 'basic',
			name: 'Fem ganger fem',
			cursorKind: 'alternatingDays',
			initialCursor: JSON.stringify({
				kind: 'alternatingDays',
				nextDayId: 'A',
			}),
			days: {
				create: { dayId: 'A', orderIndex: 0, workoutId: workout.id },
			},
		},
		select: { days: { select: { id: true } } },
	})
	return { dayId: program.days[0]!.id, liftId: lift.id }
}

function post(entries: Record<string, string>, cookie: string) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(entries).toString(),
	})
}

type Reply = {
	data: {
		result:
			| {
					ok: true
					toast: string
					title: string
					changedSessionIds: string[]
					undo: { adjustmentId: string }
			  }
			| { ok: false; reason: string }
			| null
		undone: boolean | null
		submission: { status?: string; error?: Record<string, string[]> | null }
	}
	init: { status: number; headers?: Headers } | null
}

async function byttOkt(
	cookie: string,
	sessionId: string,
	from: 'catalogue' | 'program' | 'exercise',
	pickId: string,
) {
	return (await action({
		...ARGS,
		request: post({ intent: 'swap', sessionId, from, pickId }, cookie),
	})) as Reply
}

async function angre(cookie: string, adjustmentId: string) {
	return (await action({
		...ARGS,
		request: post({ intent: 'undo', adjustmentId }, cookie),
	})) as Reply
}

function tokenOf(reply: Reply): string {
	const result = reply.data.result
	if (!result?.ok)
		throw new Error(`expected a change, got ${JSON.stringify(result)}`)
	return result.undo.adjustmentId
}

/** Everything Bytt økt could touch on a session, as one comparable picture. */
async function picture(sessionId: string) {
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: {
			scheduledAt: true,
			status: true,
			source: true,
			adoptedAt: true,
			releasedAt: true,
			replanReason: true,
			workoutId: true,
			plannedTssValue: true,
			workout: {
				select: {
					title: true,
					discipline: true,
					intent: true,
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							repeatCount: true,
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: {
									kind: true,
									durationSec: true,
									exerciseId: true,
									sets: {
										orderBy: { orderIndex: 'asc' },
										select: { reps: true },
									},
								},
							},
						},
					},
				},
			},
		},
	})
	return {
		...session,
		minutes: getSessionDurationMin({
			recording: null,
			workout: session.workout,
		}),
		owner: sessionOwner(session),
	}
}

// ── the pick replaces today's prescription ────────────────────────────────

test('Bytt økt to a Catalogue session puts it on today, says so, and the machine’s session becomes the athlete’s', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT)
	const ride = await stockRide()

	const reply = await byttOkt(cookie, today, 'catalogue', ride)

	expect(reply.data.result).toMatchObject({
		ok: true,
		toast: 'Dagens økt er byttet til «Rolig sykkeltur».',
		title: 'Rolig sykkeltur',
		changedSessionIds: [today],
	})
	const after = await picture(today)
	expect(after.workout).toMatchObject({
		title: 'Rolig sykkeltur',
		discipline: 'bike',
		intent: 'endurance',
	})
	expect(after.minutes).toBe(45)
	// Same day, same time: only what is trained changed.
	expect(after.scheduledAt.toISOString()).toBe(TODAY_AT)
	// The normal rule, not the Juster exception: the athlete chose this
	// session, so it is theirs now and no replan rewrites it.
	expect(after.owner).toBe('athlete')
	expect(after.adoptedAt).not.toBeNull()
	expect(after.source).toBe('generated')
	// The plan's note explained the old session, not this one.
	expect(after.replanReason).toBeNull()
})

test('Bytt økt puts a copy on today: the Catalogue’s own session is left as it is', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT)
	const ride = await stockRide()

	await byttOkt(cookie, today, 'catalogue', ride)

	const after = await picture(today)
	expect(after.workoutId).not.toBe(ride)
	const stock = await prisma.workout.findUniqueOrThrow({
		where: { id: ride },
		select: { title: true, sessions: { select: { id: true } } },
	})
	expect(stock).toEqual({ title: 'Rolig sykkeltur', sessions: [] })
})

test('Bytt økt on a session the athlete handed back takes it back', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT, {
		source: 'authored',
		releasedAt: new Date('2030-01-01T08:00:00Z'),
	})

	await byttOkt(cookie, today, 'catalogue', await stockRide())

	const after = await picture(today)
	expect(after.releasedAt).toBeNull()
	expect(after.owner).toBe('athlete')
})

test('Bytt økt to a program day puts that day’s lifts on today', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT)
	const { dayId, liftId } = await programDay()

	const reply = await byttOkt(cookie, today, 'program', dayId)

	expect(reply.data.result).toMatchObject({ ok: true, title: 'Økt A' })
	const after = await picture(today)
	expect(after.workout?.discipline).toBe('strength')
	expect(after.workout?.blocks[0]!.steps[0]).toMatchObject({
		kind: 'strength',
		exerciseId: liftId,
		sets: Array.from({ length: 5 }, () => ({ reps: 5 })),
	})
	expect(after.owner).toBe('athlete')
})

test('Bytt økt to one exercise puts that lift on today, at 3 × 8 when it has never been lifted', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT)
	const lift = await exercise('Utfall')

	const reply = await byttOkt(cookie, today, 'exercise', lift.id)

	expect(reply.data.result).toMatchObject({ ok: true, title: 'Utfall' })
	const after = await picture(today)
	expect(after.workout).toMatchObject({
		title: 'Utfall',
		discipline: 'strength',
	})
	expect(after.workout?.blocks).toHaveLength(1)
	expect(after.workout?.blocks[0]!.steps).toEqual([
		expect.objectContaining({
			kind: 'strength',
			exerciseId: lift.id,
			sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
		}),
	])
	expect(after.owner).toBe('athlete')
})

test('Bytt økt to an exercise the athlete has planned before takes the sets they planned last time', async () => {
	const { userId, cookie } = await signedIn()
	const lift = await exercise('Markløft')
	// Last week's lift: 4 × 6.
	await prisma.workout.create({
		data: {
			title: 'Markløft',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: {
					orderIndex: 0,
					repeatCount: 1,
					steps: {
						create: {
							orderIndex: 0,
							kind: 'strength',
							exerciseId: lift.id,
							sets: {
								create: Array.from({ length: 4 }, (_, index) => ({
									orderIndex: index,
									kind: 'reps',
									reps: 6,
								})),
							},
						},
					},
				},
			},
			sessions: {
				create: {
					userId,
					scheduledAt: new Date('2029-12-27T17:00:00Z'),
					status: 'completed',
					source: 'authored',
				},
			},
		},
	})
	const today = await planned(userId, TODAY_AT)

	await byttOkt(cookie, today, 'exercise', lift.id)

	const after = await picture(today)
	expect(after.workout?.blocks[0]!.steps[0]!.sets).toEqual(
		Array.from({ length: 4 }, () => ({ reps: 6 })),
	)
})

// ── refusals ─────────────────────────────────────────────────────────────

test('Bytt økt to a pick that is not in Bibliotek says so and changes nothing', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT)
	const before = await picture(today)

	const reply = await byttOkt(cookie, today, 'catalogue', 'no-such-session')

	expect(reply.init?.status).toBe(409)
	expect(reply.data.result).toEqual({ ok: false, reason: 'pick-not-found' })
	expect(reply.data.submission.error?.['']).toEqual([
		'Fant ikke økta i Bibliotek. Velg en annen.',
	])
	expect(await picture(today)).toEqual(before)
})

test('Bytt økt changes only today’s session', async () => {
	const { userId, cookie } = await signedIn()
	const tomorrow = await planned(userId, '2030-01-03T17:00:00Z')

	const reply = await byttOkt(cookie, tomorrow, 'catalogue', await stockRide())

	expect(reply.data.result).toEqual({ ok: false, reason: 'not-today' })
})

test('Bytt økt on a session already done says so', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT, { status: 'completed' })

	const reply = await byttOkt(cookie, today, 'catalogue', await stockRide())

	expect(reply.data.result).toEqual({ ok: false, reason: 'not-open' })
})

test('another athlete’s session is not found by Bytt økt, and stays as it is', async () => {
	const owner = await signedIn()
	const other = await signedIn()
	const today = await planned(owner.userId, TODAY_AT)
	const before = await picture(today)

	const reply = await byttOkt(
		other.cookie,
		today,
		'catalogue',
		await stockRide(),
	)

	expect(reply.init?.status).toBe(404)
	expect(await picture(today)).toEqual(before)
})

// ── Angre ────────────────────────────────────────────────────────────────

test('Angre on Bytt økt restores today’s previous session exactly, ownership included', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT)
	const before = await picture(today)
	const swapped = await byttOkt(cookie, today, 'catalogue', await stockRide())
	const copyId = (await picture(today)).workoutId!

	const reply = await angre(cookie, tokenOf(swapped))

	expect(reply.data.undone).toBe(true)
	expect(await picture(today)).toEqual(before)
	// The copy Bytt økt put on today is gone with it.
	expect(await prisma.workout.findUnique({ where: { id: copyId } })).toBeNull()
	const toast = reply.init?.headers?.get('set-cookie') ?? ''
	expect(toast).not.toBe('')
})

test('Angre on Bytt økt twice takes it back once', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT)
	const before = await picture(today)
	const token = tokenOf(
		await byttOkt(cookie, today, 'catalogue', await stockRide()),
	)

	await angre(cookie, token)
	const second = await angre(cookie, token)

	expect(second.data.undone).toBe(false)
	expect(await picture(today)).toEqual(before)
})

test('Angre on Bytt økt is refused once the session is trained', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT)
	const token = tokenOf(
		await byttOkt(cookie, today, 'catalogue', await stockRide()),
	)
	await prisma.workoutSession.update({
		where: { id: today },
		data: { status: 'completed', markedDoneAt: NOW },
	})
	const trained = await picture(today)

	const reply = await angre(cookie, token)

	expect(reply.init?.status).toBe(409)
	expect(reply.data.submission.error?.['']).toEqual([
		'Det kan ikke angres lenger: økta er trent.',
	])
	expect(await picture(today)).toEqual(trained)
})

test('Angre on Bytt økt is refused once the picked session has been changed since', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, TODAY_AT)
	const token = tokenOf(
		await byttOkt(cookie, today, 'catalogue', await stockRide()),
	)
	// Lite tid on the picked ride: 45 → 30 minutes.
	await action({
		...ARGS,
		request: post({ intent: 'short', sessionId: today }, cookie),
	})
	const changed = await picture(today)

	const reply = await angre(cookie, token)

	expect(reply.data.result).toBeNull()
	expect(reply.init?.status).toBe(409)
	expect(await picture(today)).toEqual(changed)
})
