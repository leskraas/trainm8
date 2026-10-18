/**
 * **Juster** through its resource route (spec #558 S5, ADR 0100 §7): each
 * intent, each refusal, the undo, and the documented exception to Session
 * Adoption — _For sliten i dag_ and _Lite tid_ leave the machine's session
 * the machine's, and the athlete's own stays theirs.
 */
import { type AppLoadContext } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createFirstRunPlan } from '#app/utils/first-run/plan.server.ts'
import { sessionOwner } from '#app/utils/session-ownership.ts'
import { getSessionDurationMin } from '#app/utils/training.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './session-adjust.tsx'

// Wednesday 2 January 2030, midday UTC; the week is Mon 31 Dec – Sun 6 Jan.
const NOW = new Date('2030-01-02T12:00:00Z')
const ROUTE_PATH = '/resources/session-adjust'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

beforeEach(() => {
	// Only the clock: the database and the timers stay real.
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

type Step = {
	kind?: string
	durationSec?: number
	intensity?: string
	exerciseId?: string
	sets?: number
}

/** A planned session with its own Workout. The machine's unless `authored`. */
async function planned(
	userId: string,
	at: string,
	{
		title = 'Terskeløkt · Løping',
		discipline = 'run',
		intent = 'threshold',
		blocks = [{ repeatCount: 1, steps: [{ durationSec: 3600 }] }],
		source = 'generated',
		status = 'scheduled',
		activityKind = null,
		effortWord = null,
	}: {
		title?: string
		discipline?: string
		intent?: string
		blocks?: Array<{ repeatCount: number; steps: Step[] }>
		source?: string
		status?: string
		activityKind?: string | null
		effortWord?: string | null
	} = {},
): Promise<string> {
	const workout = await prisma.workout.create({
		data: {
			title,
			discipline,
			intent,
			activityKind,
			effortWord,
			ownerId: userId,
			blocks: {
				create: blocks.map((block, blockIndex) => ({
					orderIndex: blockIndex,
					repeatCount: block.repeatCount,
					steps: {
						create: block.steps.map((step, stepIndex) => ({
							orderIndex: stepIndex,
							kind: step.kind ?? 'cardio',
							discipline,
							durationSec: step.durationSec ?? null,
							intensity: step.intensity ?? null,
							exerciseId: step.exerciseId ?? null,
							sets:
								step.sets != null
									? {
											create: Array.from({ length: step.sets }, (_, index) => ({
												orderIndex: index,
												kind: 'reps',
												reps: 8,
											})),
										}
									: undefined,
						})),
					},
				})),
			},
			sessions: {
				create: { userId, scheduledAt: new Date(at), status, source },
			},
		},
		select: { sessions: { select: { id: true } } },
	})
	return workout.sessions[0]!.id
}

/** A 60-minute threshold run: warm-up, 3 × 10 at threshold, cool-down. */
const THRESHOLD_RUN = [
	{ repeatCount: 1, steps: [{ durationSec: 900 }] },
	{
		repeatCount: 3,
		steps: [
			{
				durationSec: 600,
				intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z4' }),
			},
			{ durationSec: 120 },
		],
	},
	{ repeatCount: 1, steps: [{ durationSec: 540 }] },
]

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

async function juster(
	cookie: string,
	intent: 'tired' | 'short' | 'move',
	sessionId: string,
) {
	return (await action({
		...ARGS,
		request: post({ intent, sessionId }, cookie),
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

/** Everything a Juster could touch on a session, as one comparable picture. */
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
			recording: { select: { durationSec: true } },
			workout: {
				select: {
					title: true,
					discipline: true,
					intent: true,
					activityKind: true,
					effortWord: true,
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							repeatCount: true,
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: {
									kind: true,
									durationSec: true,
									intensity: true,
									exerciseId: true,
									sets: { select: { reps: true } },
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

// ── For sliten i dag ─────────────────────────────────────────────────────

test('For sliten i dag makes the machine’s threshold run easy at 60 % of its time, and it stays the machine’s', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: THRESHOLD_RUN,
	})

	const reply = await juster(cookie, 'tired', today)

	expect(reply.data.result).toMatchObject({
		ok: true,
		toast: 'Dagens økt er rolig nå, 35 min.',
		changedSessionIds: [today],
	})
	const after = await picture(today)
	expect(after.minutes).toBe(35)
	expect(after.workout?.intent).toBe('endurance')
	expect(after.workout?.title).toBe('Rolig økt · Løping')
	// One easy step: no quality left in it.
	expect(after.workout?.blocks).toHaveLength(1)
	expect(after.workout?.blocks[0]!.steps).toHaveLength(1)
	// The documented exception: no adoption, the machine's session stays the
	// machine's, so the autopilot keeps laying the weeks around it.
	expect(after.owner).toBe('machine')
	expect(after.source).toBe('generated')
	expect(after.adoptedAt).toBeNull()
	expect(after.replanReason).toBe('For sliten i dag: gjort rolig og kortere.')
})

test('For sliten i dag never makes a session shorter than 20 minutes', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: [{ repeatCount: 1, steps: [{ durationSec: 30 * 60 }] }],
	})

	await juster(cookie, 'tired', today)

	expect((await picture(today)).minutes).toBe(20)
})

test('For sliten i dag on the athlete’s own session changes it, and it stays theirs', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: THRESHOLD_RUN,
		source: 'authored',
	})

	await juster(cookie, 'tired', today)

	const after = await picture(today)
	expect(after.minutes).toBe(35)
	expect(after.owner).toBe('athlete')
	expect(after.source).toBe('authored')
})

test('For sliten i dag keeps a Simple Activity what it is, rolig and shorter', async () => {
	const { userId, cookie } = await signedIn()
	const climb = await planned(userId, '2030-01-02T17:00:00Z', {
		title: 'Klatring',
		discipline: 'other',
		intent: 'simple-activity',
		activityKind: 'climb',
		effortWord: 'hard',
		blocks: [{ repeatCount: 1, steps: [{ durationSec: 90 * 60 }] }],
	})

	await juster(cookie, 'tired', climb)

	const after = await picture(climb)
	expect(after.workout).toMatchObject({
		title: 'Klatring',
		discipline: 'other',
		activityKind: 'climb',
		effortWord: 'rolig',
	})
	expect(after.minutes).toBe(55)
})

test('For sliten i dag keeps a lift a lift, rolig with fewer sets', async () => {
	const { userId, cookie } = await signedIn()
	const exercise = await prisma.exercise.findFirstOrThrow({
		select: { id: true },
	})
	const lift = await planned(userId, '2030-01-02T17:00:00Z', {
		title: 'Styrke',
		discipline: 'strength',
		intent: 'strength-hypertrophy',
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'strength', exerciseId: exercise.id, sets: 5 }],
			},
		],
	})

	await juster(cookie, 'tired', lift)

	const after = await picture(lift)
	expect(after.workout?.discipline).toBe('strength')
	expect(after.workout?.effortWord).toBe('rolig')
	const step = after.workout!.blocks[0]!.steps[0]!
	expect(step.exerciseId).toBe(exercise.id)
	expect(step.sets).toHaveLength(3)
})

test('For sliten i dag on a session already easy and short says why, and changes nothing', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		intent: 'endurance',
		blocks: [{ repeatCount: 1, steps: [{ durationSec: 20 * 60 }] }],
	})
	const before = await picture(today)

	const reply = await juster(cookie, 'tired', today)

	expect(reply.init?.status).toBe(409)
	expect(reply.data.result).toEqual({ ok: false, reason: 'already-easy' })
	expect(reply.data.submission.error?.['']).toEqual([
		'Økta er allerede rolig og så kort den kan bli.',
	])
	expect(await picture(today)).toEqual(before)
})

// ── Lite tid ─────────────────────────────────────────────────────────────

test('Lite tid cuts a session to 30 minutes and keeps its intent', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: THRESHOLD_RUN,
	})

	const reply = await juster(cookie, 'short', today)

	expect(reply.data.result).toMatchObject({
		ok: true,
		toast: 'Dagens økt er kortet ned til 30 min.',
	})
	const after = await picture(today)
	expect(after.minutes).toBe(30)
	expect(after.workout?.intent).toBe('threshold')
	expect(after.workout?.title).toBe('Terskeløkt · Løping')
	// The threshold reps are still there, shorter.
	expect(after.workout?.blocks.map((block) => block.repeatCount)).toEqual([
		1, 3, 1,
	])
	expect(after.owner).toBe('machine')
	expect(after.adoptedAt).toBeNull()
	expect(after.replanReason).toBe('Lite tid: kortet ned.')
})

test('Lite tid cuts a session of 30 minutes or less to 20', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: [{ repeatCount: 1, steps: [{ durationSec: 30 * 60 }] }],
	})

	await juster(cookie, 'short', today)

	expect((await picture(today)).minutes).toBe(20)
})

test('Lite tid on a session of 20 minutes says it is already short', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: [{ repeatCount: 1, steps: [{ durationSec: 20 * 60 }] }],
	})

	const reply = await juster(cookie, 'short', today)

	expect(reply.data.result).toEqual({ ok: false, reason: 'already-short' })
})

test('Lite tid on a session with no time says so', async () => {
	const { userId, cookie } = await signedIn()
	const exercise = await prisma.exercise.findFirstOrThrow({
		select: { id: true },
	})
	const lift = await planned(userId, '2030-01-02T17:00:00Z', {
		title: 'Styrke',
		discipline: 'strength',
		intent: 'strength-hypertrophy',
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'strength', exerciseId: exercise.id, sets: 3 }],
			},
		],
	})

	const reply = await juster(cookie, 'short', lift)

	expect(reply.data.result).toEqual({ ok: false, reason: 'no-time' })
})

// ── Bytt dag ─────────────────────────────────────────────────────────────

test('Bytt dag moves today’s session to the next free day this week, at the same time of day', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z')
	await planned(userId, '2030-01-03T07:00:00Z', {
		title: 'Rolig økt',
		intent: 'endurance',
	})

	const reply = await juster(cookie, 'move', today)

	expect(reply.data.result).toMatchObject({
		ok: true,
		toast: 'Økta er flyttet til fredag.',
		changedSessionIds: [today],
	})
	const after = await picture(today)
	expect(after.scheduledAt).toEqual(new Date('2030-01-04T17:00:00Z'))
	// A reschedule: nothing adopted, the prescription as it was.
	expect(after.owner).toBe('machine')
	expect(after.minutes).toBe(60)
	expect(after.replanReason).toBe('Flyttet fra onsdag med Bytt dag.')
})

test('Bytt dag moves an easy run past the day before the intervals (spec #588 story 28)', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		title: 'Rolig økt',
		intent: 'endurance',
	})
	// Friday's intervals: Thursday is the day before them.
	await planned(userId, '2030-01-04T07:00:00Z', { blocks: THRESHOLD_RUN })

	const reply = await juster(cookie, 'move', today)

	expect(reply.data.result).toMatchObject({
		ok: true,
		toast: 'Økta er flyttet til lørdag.',
	})
	expect((await picture(today)).scheduledAt).toEqual(
		new Date('2030-01-05T17:00:00Z'),
	)
})

test('Bytt dag on intervals skips the day after a lift', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: THRESHOLD_RUN,
	})
	const exercise = await prisma.exercise.findFirstOrThrow({
		select: { id: true },
	})
	await planned(userId, '2030-01-03T07:00:00Z', {
		title: 'Styrke',
		discipline: 'strength',
		intent: 'strength-max',
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'strength', exerciseId: exercise.id, sets: 3 }],
			},
		],
	})

	const reply = await juster(cookie, 'move', today)

	expect(reply.data.result).toMatchObject({
		ok: true,
		toast: 'Økta er flyttet til lørdag.',
	})
})

test('Bytt dag, when every free day clashes, still moves to the first free day and says why in one line, adopting nothing', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: THRESHOLD_RUN,
	})
	// Hard on Friday and Sunday: Thursday and Saturday are each next to one.
	await planned(userId, '2030-01-04T07:00:00Z', { blocks: THRESHOLD_RUN })
	await planned(userId, '2030-01-06T07:00:00Z', { blocks: THRESHOLD_RUN })

	const reply = await juster(cookie, 'move', today)

	expect(reply.data.result).toMatchObject({
		ok: true,
		toast:
			'Økta er flyttet til torsdag, dagen før en annen hard økt. Ingen ledig dag passet bedre.',
		changedSessionIds: [today],
	})
	const after = await picture(today)
	expect(after.scheduledAt).toEqual(new Date('2030-01-03T17:00:00Z'))
	expect(after.owner).toBe('machine')
	expect(after.replanReason).toBe('Flyttet fra onsdag med Bytt dag.')
})

test('Bytt dag swaps with the next session when no day this week is free', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z')
	const thursday = await planned(userId, '2030-01-03T07:00:00Z', {
		title: 'Rolig økt',
	})
	await planned(userId, '2030-01-04T07:00:00Z', { title: 'Fredag' })
	await planned(userId, '2030-01-05T07:00:00Z', { title: 'Lørdag' })
	await planned(userId, '2030-01-06T07:00:00Z', { title: 'Søndag' })

	const reply = await juster(cookie, 'move', today)

	expect(reply.data.result).toMatchObject({
		ok: true,
		toast: 'Økta er flyttet til torsdag, og «Rolig økt» er i dag.',
		changedSessionIds: [today, thursday],
	})
	expect((await picture(today)).scheduledAt).toEqual(
		new Date('2030-01-03T17:00:00Z'),
	)
	expect((await picture(thursday)).scheduledAt).toEqual(
		new Date('2030-01-02T07:00:00Z'),
	)
})

test('Bytt dag on the last day of the week says there is no day left', async () => {
	const { userId, cookie } = await signedIn()
	vi.setSystemTime(new Date('2030-01-06T09:00:00Z'))
	const sunday = await planned(userId, '2030-01-06T17:00:00Z')

	const reply = await juster(cookie, 'move', sunday)

	expect(reply.init?.status).toBe(409)
	expect(reply.data.result).toEqual({ ok: false, reason: 'no-later-day' })
	expect(reply.data.submission.error?.['']).toEqual([
		'Det er ingen dager igjen denne uka å flytte til.',
	])
	expect((await picture(sunday)).scheduledAt).toEqual(
		new Date('2030-01-06T17:00:00Z'),
	)
})

// ── refusals ─────────────────────────────────────────────────────────────

test('Juster changes only today’s session', async () => {
	const { userId, cookie } = await signedIn()
	const tomorrow = await planned(userId, '2030-01-03T17:00:00Z')

	const reply = await juster(cookie, 'short', tomorrow)

	expect(reply.data.result).toEqual({ ok: false, reason: 'not-today' })
	expect((await picture(tomorrow)).minutes).toBe(60)
})

test('Juster on a session already done says so', async () => {
	const { userId, cookie } = await signedIn()
	const done = await planned(userId, '2030-01-02T07:00:00Z', {
		status: 'completed',
	})

	const reply = await juster(cookie, 'tired', done)

	expect(reply.data.result).toEqual({ ok: false, reason: 'not-open' })
})

test('another athlete’s session is not found, and stays as it is', async () => {
	const owner = await signedIn()
	const stranger = await signedIn()
	const today = await planned(owner.userId, '2030-01-02T17:00:00Z')

	const reply = await juster(stranger.cookie, 'short', today)

	expect(reply.init?.status).toBe(404)
	expect((await picture(today)).minutes).toBe(60)
})

test('a post with an intent Juster does not have is refused as the form’s error', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z')

	const reply = (await action({
		...ARGS,
		request: post({ intent: 'harder', sessionId: today }, cookie),
	})) as Reply

	expect(reply.init?.status).toBe(400)
	expect(reply.data.submission.status).toBe('error')
})

// ── Angre ────────────────────────────────────────────────────────────────

test.each(['tired', 'short', 'move'] as const)(
	'Angre on %s puts the session back exactly, and a second Angre writes nothing',
	async (intent) => {
		const { userId, cookie } = await signedIn()
		const today = await planned(userId, '2030-01-02T17:00:00Z', {
			blocks: THRESHOLD_RUN,
		})
		const before = await picture(today)
		const token = tokenOf(await juster(cookie, intent, today))
		expect(await picture(today)).not.toEqual(before)

		const first = await angre(cookie, token)
		expect(first.data.undone).toBe(true)
		expect(first.init?.headers?.get('set-cookie')).toEqual(expect.any(String))
		expect(await picture(today)).toEqual(before)

		const second = await angre(cookie, token)
		expect(second.data.undone).toBe(false)
		expect(await picture(today)).toEqual(before)
	},
)

test('Angre on a swap puts both sessions back', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z')
	const others = [
		await planned(userId, '2030-01-03T07:00:00Z', { title: 'Torsdag' }),
		await planned(userId, '2030-01-04T07:00:00Z', { title: 'Fredag' }),
		await planned(userId, '2030-01-05T07:00:00Z', { title: 'Lørdag' }),
		await planned(userId, '2030-01-06T07:00:00Z', { title: 'Søndag' }),
	]
	const before = await Promise.all([today, ...others].map(picture))

	await angre(cookie, tokenOf(await juster(cookie, 'move', today)))

	expect(await Promise.all([today, ...others].map(picture))).toEqual(before)
})

test('Angre is refused once the session is trained', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z')
	const token = tokenOf(await juster(cookie, 'short', today))
	await prisma.workoutSession.update({
		where: { id: today },
		data: { status: 'completed', markedDoneAt: NOW },
	})

	const reply = await angre(cookie, token)

	expect(reply.init?.status).toBe(409)
	expect(reply.data.submission.error?.['']).toEqual([
		'Det kan ikke angres lenger: økta er trent.',
	])
	expect((await picture(today)).minutes).toBe(30)
})

test('Angre on an older change is refused while a newer one stands, and works again once that is undone', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: THRESHOLD_RUN,
	})
	const before = await picture(today)
	const tired = tokenOf(await juster(cookie, 'tired', today))
	const short = tokenOf(await juster(cookie, 'short', today))

	const refused = await angre(cookie, tired)
	expect(refused.init?.status).toBe(409)
	expect(refused.data.submission.error?.['']).toEqual([
		'Det kan ikke angres lenger: økta er endret igjen siden.',
	])

	expect((await angre(cookie, short)).data.undone).toBe(true)
	expect((await angre(cookie, tired)).data.undone).toBe(true)
	expect(await picture(today)).toEqual(before)
})

test('another athlete cannot take a Juster back', async () => {
	const owner = await signedIn()
	const stranger = await signedIn()
	const today = await planned(owner.userId, '2030-01-02T17:00:00Z')
	const token = tokenOf(await juster(owner.cookie, 'short', today))

	const reply = await angre(stranger.cookie, token)

	expect(reply.init?.status).toBe(404)
	expect((await picture(today)).minutes).toBe(30)
})

// ── on a real plan ───────────────────────────────────────────────────────

test('on a plan’s own session, a Juster leaves the machine’s session the machine’s and never moves the Week Target', async () => {
	const { userId, cookie } = await signedIn()
	const created = await createFirstRunPlan(
		userId,
		{
			discipline: 'run',
			hours: 4,
			days: [1, 3, 5],
			level: 'recreational',
			family: null,
		},
		NOW,
	)
	expect(created.ok).toBe(true)
	// The plan starts on the first week not yet begun: Tuesday 8 Jan is a day.
	vi.setSystemTime(new Date('2030-01-08T06:00:00Z'))
	const first = await prisma.workoutSession.findFirstOrThrow({
		where: {
			userId,
			scheduledAt: {
				gte: new Date('2030-01-08T00:00:00Z'),
				lt: new Date('2030-01-09T00:00:00Z'),
			},
		},
		select: { id: true },
	})
	const plan = () =>
		prisma.planOutline.findMany({
			where: { athleteId: userId },
			include: { phases: true, tracks: { include: { segments: true } } },
		})
	const others = () =>
		prisma.workoutSession.findMany({
			where: { userId, id: { not: first.id } },
			orderBy: { scheduledAt: 'asc' },
			select: {
				id: true,
				scheduledAt: true,
				workout: { select: { updatedAt: true } },
			},
		})
	const planBefore = await plan()
	const othersBefore = await others()
	expect(sessionOwner(await picture(first.id))).toBe('machine')

	await juster(cookie, 'tired', first.id)

	const after = await picture(first.id)
	expect(after.owner).toBe('machine')
	expect(after.source).toBe('generated')
	expect(await plan()).toEqual(planBefore)
	expect(await others()).toEqual(othersBefore)
})

test('a Workout another session also reads is left as it is: the change goes on today’s own copy, and Angre takes the copy away', async () => {
	const { userId, cookie } = await signedIn()
	const today = await planned(userId, '2030-01-02T17:00:00Z', {
		blocks: THRESHOLD_RUN,
	})
	const { workoutId } = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: today },
		select: { workoutId: true },
	})
	const sibling = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId,
			scheduledAt: new Date('2030-01-09T17:00:00Z'),
			source: 'generated',
		},
		select: { id: true },
	})
	const before = await picture(today)
	const siblingBefore = await picture(sibling.id)

	const token = tokenOf(await juster(cookie, 'short', today))

	expect((await picture(today)).minutes).toBe(30)
	expect(await picture(sibling.id)).toEqual(siblingBefore)

	await angre(cookie, token)

	expect(await picture(today)).toEqual(before)
	expect(await picture(sibling.id)).toEqual(siblingBefore)
	expect(await prisma.workout.count({ where: { ownerId: userId } })).toBe(1)
})
