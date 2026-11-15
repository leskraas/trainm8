/**
 * The sessions capabilities against a real database: every write, its undo,
 * its refusals, and that another athlete's ids are not found.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { type ProposalPayload } from '#app/utils/load/week-replan-proposal.ts'
import { recordProposals } from '#app/utils/load/week-replan-proposals.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { type CapabilityResult } from './define.ts'
import { SESSION_CAPABILITIES } from './sessions.server.ts'

// Wednesday 2 January 2030, midday UTC; the week is Mon 31 Dec – Sun 6 Jan.
// The last closed week is the one of Mon 24 Dec, so the coming week (the one
// proposals land in) is this one.
const NOW = new Date('2030-01-02T12:00:00Z')
const PAST = new Date('2029-12-01T12:00:00Z')
// Proposals: Sunday 6 January after the week's close at 20:00, so the
// closed week is Mon 31 Dec's and the coming one, not begun yet, Mon 7 Jan's.
const SUNDAY = new Date('2030-01-06T21:00:00Z')
const CLOSED = '2029-12-31'
const COMING = '2030-01-07'

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(NOW)
})
afterEach(() => {
	vi.useRealTimers()
})

type Caps = typeof SESSION_CAPABILITIES

async function call<N extends keyof Caps>(
	userId: string,
	name: N,
	input: unknown,
): Promise<CapabilityResult<any>> {
	const cap = SESSION_CAPABILITIES[name] as Caps[N]
	const parsed = cap.input.safeParse(input)
	if (!parsed.success) {
		return { ok: false, code: 'invalid-input', message: parsed.error.message }
	}
	return (cap.run as (ctx: any, input: any) => Promise<CapabilityResult<any>>)(
		{
			userId,
			now: new Date(),
			timezone: 'UTC',
			origin: 'http://localhost:3000',
			request: new Request('http://localhost:3000/lab/api/x'),
		},
		parsed.data,
	)
}

async function value(
	userId: string,
	name: keyof Caps,
	input: unknown,
): Promise<any> {
	const result = await call(userId, name, input)
	if (!result.ok) {
		throw new Error(`${name} failed: ${result.code} ${result.message}`)
	}
	return result.value
}

async function athlete() {
	const user = await prisma.user.create({
		data: {
			...createUser(),
			athleteProfile: { create: { timezone: 'UTC', autopilot: false } },
		},
		select: { id: true },
	})
	return user.id
}

/** A planned one-hour run on `at`; the plan's unless `authored`. */
async function planned(
	userId: string,
	at: string,
	{
		title = 'Rolig tur',
		discipline = 'run',
		source = 'generated',
		status = 'scheduled',
		minutes = 60,
		effortWord = null as string | null,
	} = {},
): Promise<string> {
	const workout = await prisma.workout.create({
		data: {
			title,
			discipline,
			intent: 'endurance',
			effortWord,
			ownerId: userId,
			createdAt: PAST,
			updatedAt: PAST,
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
									discipline,
									durationSec: minutes * 60,
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date(at),
			status,
			source,
			createdAt: PAST,
			updatedAt: PAST,
		},
		select: { id: true },
	})
	return session.id
}

/** A strength session today: 3 × 5 back squat at 60 kg. */
async function squatDay(userId: string, at = '2030-01-02T07:00:00Z') {
	const exercise = await prisma.exercise.create({
		data: { name: 'Knebøy', primaryMuscle: 'quads', equipment: 'barbell' },
		select: { id: true },
	})
	const workout = await prisma.workout.create({
		data: {
			title: 'Styrke A',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			createdAt: PAST,
			updatedAt: PAST,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									discipline: 'strength',
									exerciseId: exercise.id,
									sets: {
										create: [0, 1, 2].map((orderIndex) => ({
											orderIndex,
											kind: 'reps',
											reps: 5,
											load: JSON.stringify({ kind: 'absolute', kg: 60 }),
											weightKg: 60,
										})),
									},
								},
							],
						},
					},
				],
			},
		},
		select: {
			id: true,
			blocks: { select: { steps: { select: { id: true } } } },
		},
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date(at),
			status: 'scheduled',
			source: 'authored',
			createdAt: PAST,
			updatedAt: PAST,
		},
		select: { id: true },
	})
	return { sessionId: session.id, stepId: workout.blocks[0]!.steps[0]!.id }
}

async function status(id: string) {
	return (
		await prisma.workoutSession.findUniqueOrThrow({
			where: { id },
			select: { status: true },
		})
	).status
}

describe('doing and recording', () => {
	test('mark_done marks a run done and undo puts it back', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-02T07:00:00Z')
		const done = await value(userId, 'mark_done', { sessionId: id })
		expect(done.changed[0]).toMatchObject({
			id,
			state: 'done',
			date: '2030-01-02',
		})
		expect(done.undo).toEqual(expect.any(String))
		const undone = await value(userId, 'undo', { token: done.undo })
		expect(undone.undone).toBe(true)
		expect(undone.changed[0]).toMatchObject({ id, state: 'planned' })
		expect(await status(id)).toBe('scheduled')
		// A second undo changes nothing and says so.
		expect((await value(userId, 'undo', { token: done.undo })).undone).toBe(
			false,
		)
	})

	test('mark_done refuses a day ahead, a strength session, and another athlete', async () => {
		const userId = await athlete()
		const ahead = await planned(userId, '2030-01-04T07:00:00Z')
		expect(await call(userId, 'mark_done', { sessionId: ahead })).toMatchObject(
			{
				ok: false,
				code: 'not-yet',
			},
		)
		const { sessionId } = await squatDay(userId)
		expect(await call(userId, 'mark_done', { sessionId })).toMatchObject({
			ok: false,
			code: 'strength-needs-sets',
		})
		const other = await athlete()
		expect(await call(other, 'mark_done', { sessionId: ahead })).toMatchObject({
			ok: false,
			code: 'not-found',
		})
	})

	test('skip_session: missed on a begun day, skipped ahead, both undoable', async () => {
		const userId = await athlete()
		const today = await planned(userId, '2030-01-02T07:00:00Z')
		const ahead = await planned(userId, '2030-01-05T07:00:00Z')
		const missed = await value(userId, 'skip_session', { sessionId: today })
		expect(missed.state).toBe('missed')
		expect(missed.changed[0].state).toBe('missed')
		const skipped = await value(userId, 'skip_session', { sessionId: ahead })
		expect(skipped.state).toBe('skipped')
		expect(await status(ahead)).toBe('skipped')
		expect(skipped.undo).toEqual(expect.any(String))
		await value(userId, 'undo', { token: skipped.undo })
		expect(await status(ahead)).toBe('scheduled')
		expect(
			await call(userId, 'skip_session', { sessionId: today }),
		).toMatchObject({ ok: false, code: 'not-open' })
	})

	test('a token is bound to its athlete', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-02T07:00:00Z')
		const done = await value(userId, 'mark_done', { sessionId: id })
		const other = await athlete()
		expect(await call(other, 'undo', { token: done.undo })).toMatchObject({
			ok: false,
			code: 'not-found',
		})
		expect(
			await call(userId, 'undo', { token: `${done.undo.slice(0, -2)}xx` }),
		).toMatchObject({ ok: false, code: 'not-found' })
	})

	test('add_session writes a sentence, a sport, a copy; undo removes it', async () => {
		const userId = await athlete()
		const written = await value(userId, 'add_session', {
			date: '2030-01-04',
			sentence: '45 min rolig',
			sport: 'run',
		})
		expect(written.changed[0]).toMatchObject({
			date: '2030-01-04',
			sport: 'run',
			state: 'planned',
			minutes: 45,
			owner: 'athlete',
		})
		const stamped = await value(userId, 'add_session', {
			date: '2030-01-05',
			sport: 'bike',
		})
		expect(stamped.changed[0]).toMatchObject({ sport: 'bike', minutes: 45 })
		const copy = await value(userId, 'add_session', {
			date: '2030-01-06',
			copyOf: written.sessionId,
		})
		expect(copy.changed[0]).toMatchObject({ date: '2030-01-06', minutes: 45 })

		const removed = await value(userId, 'undo', { token: written.undo })
		expect(removed.removedSessionIds).toEqual([written.sessionId])
		expect(
			await prisma.workoutSession.count({ where: { id: written.sessionId } }),
		).toBe(0)
		expect(
			await call(userId, 'add_session', {
				date: '2030-01-04',
				sentence: '???',
			}),
		).toMatchObject({ ok: false, code: 'not-understood' })
	})

	test('add_session reads every example the contract gives', async () => {
		const userId = await athlete()
		await prisma.athleteProfile.update({
			where: { userId },
			data: { sports: JSON.stringify(['bike', 'run']) },
		})
		const cases: Array<[string, Record<string, unknown>, string]> = [
			['45 min rolig', { sport: 'run' }, 'run'],
			['4x8 min terskel', { sport: 'run' }, 'run'],
			['3x10 knebøy', {}, 'strength'],
			['3x10 knebøy', { sport: 'strength' }, 'strength'],
			['3x10 knebøy 60 kg', {}, 'strength'],
			['3x10 knebøy 60 kg', { sport: 'strength' }, 'strength'],
			['knebøy 3x10 60kg', {}, 'strength'],
			['løp 45 min rolig', {}, 'run'],
			['sykkel 1 t rolig', {}, 'bike'],
			['svømming 30 min', {}, 'swim'],
			['45 min rolig', {}, 'bike'],
		]
		for (const [sentence, hint, sport] of cases) {
			const added = await value(userId, 'add_session', {
				date: '2030-01-04',
				sentence,
				...hint,
			})
			expect({ ...added.changed[0], sentence }).toMatchObject({
				sport,
				title: sentence,
			})
			expect({
				sentence,
				guessed: added.sportGuessedBecause !== null,
			}).toEqual({
				sentence,
				guessed: sentence === '45 min rolig' && !('sport' in hint),
			})
		}
	})

	test('add_session can say it was already done, with a note and outside the plan', async () => {
		const userId = await athlete()
		const done = await value(userId, 'add_session', {
			date: '2030-01-01',
			sentence: '30 min rolig',
			sport: 'run',
			alreadyDone: true,
			note: 'Fin tur',
			countsTowardPlan: false,
		})
		expect(done.changed[0]).toMatchObject({
			state: 'done',
			note: 'Fin tur',
			countsTowardPlan: false,
		})
		expect(done.notDoneBecause).toBeNull()
		const ahead = await value(userId, 'add_session', {
			date: '2030-01-05',
			sport: 'run',
			alreadyDone: true,
		})
		expect(ahead.changed[0].state).toBe('planned')
		expect(ahead.notDoneBecause).toEqual(expect.any(String))
	})

	test('delete_session removes it, says it cannot be undone, and refuses a recording', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-04T07:00:00Z')
		const other = await athlete()
		expect(
			await call(other, 'delete_session', { sessionId: id }),
		).toMatchObject({
			ok: false,
			code: 'not-found',
		})
		const deleted = await value(userId, 'delete_session', { sessionId: id })
		expect(deleted).toMatchObject({ removedSessionIds: [id], undo: null })
		expect(deleted.noUndoBecause).toEqual(expect.any(String))
	})
})

describe('when life happens', () => {
	test('move_session to a date keeps the time, notes it, warns of nothing else, and undoes', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-03T07:30:00Z')
		const moved = await value(userId, 'move_session', {
			sessionId: id,
			date: '2030-01-05',
		})
		expect(moved.moves).toEqual([
			{ sessionId: id, fromDate: '2030-01-03', toDate: '2030-01-05' },
		])
		expect(moved.changed[0]).toMatchObject({
			date: '2030-01-05',
			time: '07:30',
			changeNote: 'Flyttet fra torsdag.',
		})
		expect(moved.leftItsWeek).toBe(false)
		await value(userId, 'undo', { token: moved.undo })
		const back = await prisma.workoutSession.findUniqueOrThrow({
			where: { id },
			select: { scheduledAt: true, replanReason: true },
		})
		expect(back.scheduledAt.toISOString()).toBe('2030-01-03T07:30:00.000Z')
		expect(back.replanReason).toBeNull()
	})

	test('move_session says who shares the new day, the clash, and a new week', async () => {
		const userId = await athlete()
		const hard = await planned(userId, '2030-01-04T07:00:00Z', {
			title: 'Intervaller',
			effortWord: 'hard',
		})
		const other = await planned(userId, '2030-01-03T07:00:00Z', {
			effortWord: 'hard',
			title: 'Terskel',
		})
		const moved = await value(userId, 'move_session', {
			sessionId: other,
			date: '2030-01-04',
		})
		expect(moved.sharesDayWith).toEqual([hard])
		expect(moved.clashes.length).toBeGreaterThan(0)
		expect(moved.clashes[0].text).toEqual(expect.any(String))
		const later = await value(userId, 'move_session', {
			sessionId: hard,
			date: '2030-01-08',
		})
		expect(later.leftItsWeek).toBe(true)
	})

	test('move_session refuses the past, the same day, and a done session', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-03T07:00:00Z')
		expect(
			await call(userId, 'move_session', { sessionId: id, date: '2030-01-01' }),
		).toMatchObject({ ok: false, code: 'past-date' })
		expect(
			await call(userId, 'move_session', { sessionId: id, date: '2030-01-03' }),
		).toMatchObject({ ok: false, code: 'same-day' })
		const done = await planned(userId, '2030-01-01T07:00:00Z', {
			status: 'completed',
		})
		expect(
			await call(userId, 'move_session', {
				sessionId: done,
				date: '2030-01-04',
			}),
		).toMatchObject({ ok: false, code: 'not-open' })
	})

	test('move_session with no date moves today’s session to the next free day', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-02T07:00:00Z')
		const moved = await value(userId, 'move_session', { sessionId: id })
		expect(moved.moves[0]).toMatchObject({
			sessionId: id,
			fromDate: '2030-01-02',
		})
		expect(moved.moves[0].toDate > '2030-01-02').toBe(true)
		const ahead = await planned(userId, '2030-01-05T07:00:00Z')
		expect(
			await call(userId, 'move_session', { sessionId: ahead }),
		).toMatchObject({ ok: false, code: 'not-today' })
	})

	test('swap_sessions exchanges the days, and undo puts both back', async () => {
		const userId = await athlete()
		const a = await planned(userId, '2030-01-03T07:00:00Z')
		const b = await planned(userId, '2030-01-05T18:00:00Z')
		const swapped = await value(userId, 'swap_sessions', {
			sessionId: a,
			otherSessionId: b,
		})
		const byId = Object.fromEntries(
			swapped.changed.map((one: any) => [one.id, one]),
		)
		expect(byId[a]).toMatchObject({ date: '2030-01-05', time: '07:00' })
		expect(byId[b]).toMatchObject({ date: '2030-01-03', time: '18:00' })
		await value(userId, 'undo', { token: swapped.undo })
		expect(
			(
				await prisma.workoutSession.findUniqueOrThrow({ where: { id: b } })
			).scheduledAt.toISOString(),
		).toBe('2030-01-05T18:00:00.000Z')
		expect(
			await call(userId, 'swap_sessions', { sessionId: a, otherSessionId: a }),
		).toMatchObject({ ok: false, code: 'same-session' })
	})

	test('shorten_session and ease_session change today’s session and undo', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-02T07:00:00Z')
		const short = await value(userId, 'shorten_session', { sessionId: id })
		expect(short).toMatchObject({ minutesBefore: 60, minutesAfter: 30 })
		await value(userId, 'undo', { token: short.undo })
		const eased = await value(userId, 'ease_session', { sessionId: id })
		expect(eased).toMatchObject({ minutesBefore: 60, minutesAfter: 35 })
		const ahead = await planned(userId, '2030-01-04T07:00:00Z')
		expect(
			await call(userId, 'shorten_session', { sessionId: ahead }),
		).toMatchObject({ ok: false, code: 'not-today' })
	})

	test('release_session hands an athlete’s session back, and undo takes it again', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-04T07:00:00Z', {
			source: 'authored',
		})
		const released = await value(userId, 'release_session', { sessionId: id })
		expect(released.released).toBe(true)
		expect(released.changed[0].owner).toBe('plan')
		const back = await value(userId, 'undo', { token: released.undo })
		expect(back.changed[0].owner).toBe('athlete')
		const already = await value(userId, 'release_session', { sessionId: id })
		await value(userId, 'undo', { token: already.undo })
		const plans = await planned(userId, '2030-01-05T07:00:00Z')
		const noop = await value(userId, 'release_session', { sessionId: plans })
		expect(noop).toMatchObject({ released: false, undo: null })
	})

	test('set_counts_toward_plan flips and undoes', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-04T07:00:00Z')
		const out = await value(userId, 'set_counts_toward_plan', {
			sessionId: id,
			countsTowardPlan: false,
		})
		expect(out.changed[0].countsTowardPlan).toBe(false)
		const back = await value(userId, 'undo', { token: out.undo })
		expect(back.changed[0].countsTowardPlan).toBe(true)
	})
})

describe('feeling', () => {
	test('rate_session and note_session keep each other, and undo each', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-01T07:00:00Z', {
			status: 'completed',
		})
		const rated = await value(userId, 'rate_session', { sessionId: id, rpe: 7 })
		expect(rated.changed[0]).toMatchObject({ rpe: 7, note: null })
		const noted = await value(userId, 'note_session', {
			sessionId: id,
			note: 'Tunge bein',
		})
		expect(noted.changed[0]).toMatchObject({ rpe: 7, note: 'Tunge bein' })
		const unNoted = await value(userId, 'undo', { token: noted.undo })
		expect(unNoted.changed[0]).toMatchObject({ rpe: 7, note: null })
		const unRated = await value(userId, 'undo', { token: rated.undo })
		expect(unRated.changed[0]).toMatchObject({ rpe: null, note: null })
		expect(await prisma.sessionLog.count({ where: { sessionId: id } })).toBe(0)
	})

	test('rate_session refuses a day ahead and an RPE out of range', async () => {
		const userId = await athlete()
		const ahead = await planned(userId, '2030-01-04T07:00:00Z')
		expect(
			await call(userId, 'rate_session', { sessionId: ahead, rpe: 5 }),
		).toMatchObject({ ok: false, code: 'not-yet' })
		expect(
			await call(userId, 'rate_session', { sessionId: ahead, rpe: 11 }),
		).toMatchObject({ ok: false, code: 'invalid-input' })
	})

	test('an undo refuses once the feeling changed again', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-01T07:00:00Z', {
			status: 'completed',
		})
		const first = await value(userId, 'rate_session', { sessionId: id, rpe: 4 })
		await value(userId, 'rate_session', { sessionId: id, rpe: 8 })
		expect(await call(userId, 'undo', { token: first.undo })).toMatchObject({
			ok: false,
			code: 'cannot-undo',
		})
	})
})

describe('strength', () => {
	test('strength_session reads the prescription; start answers the same', async () => {
		const userId = await athlete()
		const { sessionId, stepId } = await squatDay(userId)
		const read = await value(userId, 'strength_session', { sessionId })
		expect(read.exercises).toHaveLength(1)
		const exercise = read.exercises[0]
		expect(exercise).toMatchObject({ stepId, name: expect.any(String) })
		const working = exercise.sets.filter((set: any) => !set.warmup)
		expect(working).toHaveLength(3)
		expect(working[0].prescribed).toMatchObject({ reps: 5, kg: 60 })
		expect(working[0].plates).toBeNull()
		expect(working[0].platesUnknownBecause).toEqual(expect.any(String))
		expect(read).toMatchObject({ loggedWorkingSets: 0, unloggedWorkingSets: 3 })
		const started = await value(userId, 'start_strength_session', { sessionId })
		expect(started.exercises[0].stepId).toBe(stepId)
		const run = await planned(userId, '2030-01-02T07:00:00Z')
		expect(
			await call(userId, 'strength_session', { sessionId: run }),
		).toMatchObject({ ok: false, code: 'not-strength' })
	})

	test('log_strength_set logs a tap as prescribed, edits, removes, and undoes each', async () => {
		const userId = await athlete()
		const { sessionId, stepId } = await squatDay(userId)
		const tap = await value(userId, 'log_strength_set', {
			sessionId,
			stepId,
			setIndex: 0,
		})
		expect(tap.set.logged).toMatchObject({
			reps: 5,
			load: { kind: 'kg', kg: 60 },
			done: true,
		})
		const edit = await value(userId, 'log_strength_set', {
			sessionId,
			stepId,
			setIndex: 0,
			reps: 4,
			load: { kind: 'kg', kg: 62.5 },
		})
		expect(edit.set.logged).toMatchObject({
			reps: 4,
			load: { kind: 'kg', kg: 62.5 },
		})
		await value(userId, 'undo', { token: edit.undo })
		let read = await value(userId, 'strength_session', { sessionId })
		expect(
			read.exercises[0].sets.find((s: any) => s.setIndex === 0 && !s.warmup)
				.logged,
		).toMatchObject({ reps: 5, load: { kind: 'kg', kg: 60 } })

		const removed = await value(userId, 'remove_strength_set', {
			sessionId,
			stepId,
			setIndex: 0,
		})
		expect(removed.removed).toBe(true)
		await value(userId, 'undo', { token: removed.undo })
		read = await value(userId, 'strength_session', { sessionId })
		expect(read.loggedWorkingSets).toBe(1)

		const second = await value(userId, 'log_strength_set', {
			sessionId,
			stepId,
			setIndex: 1,
		})
		await value(userId, 'undo', { token: second.undo })
		read = await value(userId, 'strength_session', { sessionId })
		expect(read.loggedWorkingSets).toBe(1)

		expect(
			await call(userId, 'log_strength_set', {
				sessionId,
				stepId,
				setIndex: 0,
				load: { kind: 'machine-level', level: 4 },
			}),
		).toMatchObject({ ok: false, code: 'load-kind-locked' })
		const other = await athlete()
		expect(
			await call(other, 'log_strength_set', { sessionId, stepId, setIndex: 0 }),
		).toMatchObject({ ok: false, code: 'not-found' })
	})

	test('finish_strength_session asks about unlogged sets, finishes, and undoes', async () => {
		const userId = await athlete()
		const { sessionId, stepId } = await squatDay(userId)
		expect(
			await call(userId, 'finish_strength_session', { sessionId }),
		).toMatchObject({ ok: false, code: 'nothing-logged' })
		await value(userId, 'log_strength_set', { sessionId, stepId, setIndex: 0 })
		expect(
			await call(userId, 'finish_strength_session', { sessionId }),
		).toMatchObject({ ok: false, code: 'unlogged-sets' })
		const finished = await value(userId, 'finish_strength_session', {
			sessionId,
			unloggedSets: 'not-done',
		})
		expect(finished.changed[0].state).toBe('done')
		expect(finished).toMatchObject({ lifts: [], programName: null })
		await value(userId, 'undo', { token: finished.undo })
		expect(await status(sessionId)).toBe('scheduled')
	})

	test('log_strength_as_planned logs every set, finishes, and undo takes it back', async () => {
		const userId = await athlete()
		const { sessionId } = await squatDay(userId)
		const logged = await value(userId, 'log_strength_as_planned', { sessionId })
		expect(logged).toMatchObject({ loggedSets: 3, alreadyLogged: false })
		expect(logged.changed[0].state).toBe('done')
		const again = await value(userId, 'log_strength_as_planned', { sessionId })
		expect(again.alreadyLogged).toBe(true)
		await value(userId, 'undo', { token: logged.undo })
		expect(await status(sessionId)).toBe('scheduled')
		expect(await prisma.exerciseSetLog.count({ where: { sessionId } })).toBe(0)
	})

	test('plates_for says why there are none without a gym', async () => {
		const userId = await athlete()
		const { sessionId, stepId } = await squatDay(userId)
		const plates = await value(userId, 'plates_for', {
			sessionId,
			stepId,
			kg: 80,
		})
		expect(plates).toMatchObject({ plates: null, gymName: null })
		expect(plates.platesUnknownBecause).toEqual(expect.any(String))
	})
})

describe('recordings', () => {
	test('link_options, link_recording and unlink_recording, with undo', async () => {
		const userId = await athlete()
		const plannedId = await planned(userId, '2030-01-02T07:00:00Z')
		const startedAt = new Date('2030-01-02T07:05:00Z')
		const recording = await prisma.activityImport.create({
			data: {
				athleteId: userId,
				externalProvider: 'manual',
				externalId: `lab-${userId}`,
				startedAt,
				endedAt: new Date(startedAt.getTime() + 3600_000),
				durationSec: 3600,
				discipline: 'run',
				rawJson: '{}',
			},
			select: { id: true },
		})
		const extra = await prisma.workoutSession.create({
			data: {
				userId,
				scheduledAt: startedAt,
				status: 'completed',
				source: 'recorded',
				recordingId: recording.id,
				createdAt: PAST,
				updatedAt: PAST,
			},
			select: { id: true },
		})
		await prisma.activityImport.update({
			where: { id: recording.id },
			data: { promotedSessionId: extra.id },
		})

		const options = await value(userId, 'link_options', {
			recordingId: recording.id,
		})
		expect(options.currentSessionId).toBe(extra.id)
		expect(options.options.map((one: any) => one.id)).toEqual([plannedId])

		const linked = await value(userId, 'link_recording', {
			recordingId: recording.id,
			sessionId: plannedId,
		})
		expect(linked.changed[0]).toMatchObject({
			id: plannedId,
			state: 'done',
			hasRecording: true,
		})
		expect(linked.removedSessionIds).toEqual([extra.id])

		const unlinked = await value(userId, 'unlink_recording', {
			recordingId: recording.id,
		})
		const planOne = unlinked.changed.find((one: any) => one.id === plannedId)
		expect(planOne).toMatchObject({ hasRecording: false, state: 'planned' })
		expect(unlinked.extraSessionId).not.toBe(plannedId)

		const relinked = await value(userId, 'undo', { token: unlinked.undo })
		expect(relinked.changed[0]).toMatchObject({
			id: plannedId,
			hasRecording: true,
		})
		expect(relinked.removedSessionIds).toEqual([unlinked.extraSessionId])

		const other = await athlete()
		expect(
			await call(other, 'link_options', { recordingId: recording.id }),
		).toMatchObject({ ok: false, code: 'not-found' })
	})
})

describe('adaptation', () => {
	beforeEach(() => {
		vi.setSystemTime(SUNDAY)
	})

	async function closedWeek(userId: string, autopilot = false) {
		const replan = await prisma.weekReplan.create({
			data: {
				athleteId: userId,
				weekKey: CLOSED,
				outcome: 'proposed',
				reason: 'Forrige uke ble tyngre enn planlagt.',
				autopilot,
			},
			select: { id: true },
		})
		return replan.id
	}

	async function propose(
		userId: string,
		replanId: string,
		payload: ProposalPayload,
		targetSessionId: string | null,
	) {
		await prisma.$transaction((tx) =>
			recordProposals(
				tx,
				userId,
				[{ payload, targetSessionId, targetWeekKey: COMING, reason: 'Fordi.' }],
				replanId,
			),
		)
		return (
			await prisma.weekReplanProposal.findFirstOrThrow({
				where: { athleteId: userId },
				orderBy: { createdAt: 'desc' },
				select: { id: true },
			})
		).id
	}

	async function proposal(id: string) {
		return prisma.weekReplanProposal.findUniqueOrThrow({
			where: { id },
			select: { answer: true, appliedAt: true, undoneAt: true },
		})
	}

	async function startsAt(id: string) {
		return (
			await prisma.workoutSession.findUniqueOrThrow({ where: { id } })
		).scheduledAt.toISOString()
	}

	test('answer_proposal: yes applies a move; undo puts it back; no twice', async () => {
		const userId = await athlete()
		const replanId = await closedWeek(userId)
		const id = await planned(userId, '2030-01-08T07:00:00Z')
		const proposalId = await propose(
			userId,
			replanId,
			{
				kind: 'move',
				fromDate: '2030-01-08',
				toDate: '2030-01-10',
				makeUp: false,
			},
			id,
		)
		const yes = await value(userId, 'answer_proposal', {
			proposalId,
			answer: 'yes',
		})
		expect(yes).toMatchObject({ proposalId, status: 'accepted', applied: true })
		expect(yes.changed.find((one: any) => one.id === id).date).toBe(
			'2030-01-10',
		)
		await value(userId, 'undo', { token: yes.undo })
		expect((await proposal(proposalId)).undoneAt).not.toBeNull()
		expect(await startsAt(id)).toBe('2030-01-08T07:00:00.000Z')
		expect(
			await call(userId, 'answer_proposal', { proposalId, answer: 'no' }),
		).toMatchObject({ ok: false, code: 'already-answered' })
	})

	test('undo_change takes back an applied change by its proposal id', async () => {
		const userId = await athlete()
		const replanId = await closedWeek(userId)
		const id = await planned(userId, '2030-01-08T07:00:00Z')
		const proposalId = await propose(
			userId,
			replanId,
			{ kind: 'scale', factor: 0.5 },
			id,
		)
		const yes = await value(userId, 'answer_proposal', {
			proposalId,
			answer: 'yes',
		})
		expect(yes.changed[0]).toMatchObject({ id, minutes: 30 })
		const back = await value(userId, 'undo_change', { proposalId })
		expect(back).toMatchObject({ undone: true })
		expect(back.changed[0]).toMatchObject({ id, minutes: 60 })
		const again = await value(userId, 'undo_change', { proposalId })
		expect(again.undone).toBe(false)
		const other = await athlete()
		expect(await call(other, 'undo_change', { proposalId })).toMatchObject({
			ok: false,
			code: 'not-found',
		})
	})

	test('no changes nothing and has no undo; accept_all says yes to the rest', async () => {
		const userId = await athlete()
		const replanId = await closedWeek(userId)
		const a = await planned(userId, '2030-01-08T07:00:00Z')
		const b = await planned(userId, '2030-01-09T07:00:00Z')
		const first = await propose(
			userId,
			replanId,
			{ kind: 'scale', factor: 0.8 },
			a,
		)
		const second = await propose(
			userId,
			replanId,
			{ kind: 'scale', factor: 0.8 },
			b,
		)
		const no = await value(userId, 'answer_proposal', {
			proposalId: first,
			answer: 'no',
		})
		expect(no).toMatchObject({ status: 'declined', applied: false, undo: null })
		const all = await value(userId, 'accept_all_proposals', {})
		expect(all.accepted).toEqual([second])
		expect(all.changed.find((one: any) => one.id === b).minutes).toBe(48)
		await value(userId, 'undo', { token: all.undo })
		expect((await proposal(second)).undoneAt).not.toBeNull()
		const other = await athlete()
		expect(
			await call(other, 'answer_proposal', {
				proposalId: first,
				answer: 'yes',
			}),
		).toMatchObject({ ok: false, code: 'not-found' })
	})

	test('ease_week scales the coming week once and undo restores it', async () => {
		const userId = await athlete()
		const id = await planned(userId, '2030-01-09T07:00:00Z')
		const eased = await value(userId, 'ease_week', {})
		expect(eased.week).toBe(COMING)
		expect(eased.sessionsChanged).toBe(1)
		expect(eased.changed[0]).toMatchObject({ id, minutes: 51 })
		expect(await call(userId, 'ease_week', {})).toMatchObject({
			ok: false,
			code: 'already-eased',
		})
		expect(
			await call(userId, 'ease_week', { week: '2030-01-14' }),
		).toMatchObject({ ok: false, code: 'not-the-coming-week' })
		const back = await value(userId, 'undo', { token: eased.undo })
		expect(back.changed[0]).toMatchObject({ id, minutes: 60 })
	})

	test('once the week has begun, a yes stands and says it cannot be undone', async () => {
		const userId = await athlete()
		const replanId = await closedWeek(userId)
		const id = await planned(userId, '2030-01-10T07:00:00Z')
		const proposalId = await propose(
			userId,
			replanId,
			{ kind: 'scale', factor: 0.8 },
			id,
		)
		vi.setSystemTime(new Date('2030-01-08T09:00:00Z'))
		const yes = await value(userId, 'answer_proposal', {
			proposalId,
			answer: 'yes',
		})
		expect(yes).toMatchObject({ applied: true, undo: null })
		expect(yes.noUndoBecause).toEqual(expect.any(String))
		expect(await call(userId, 'undo_change', { proposalId })).toMatchObject({
			ok: false,
			code: 'cannot-undo',
		})
	})

	test('undo_all_changes refuses a week the plan did not change by itself', async () => {
		const userId = await athlete()
		await closedWeek(userId)
		expect(await call(userId, 'undo_all_changes', {})).toMatchObject({
			ok: false,
			code: 'cannot-undo',
		})
	})

	test('refresh_adaptation closes a finished week once', async () => {
		const userId = await athlete()
		const first = await value(userId, 'refresh_adaptation', {})
		expect(first.newProposals).toBe(true)
		expect(first.waiting).toEqual(expect.any(Number))
		const second = await value(userId, 'refresh_adaptation', {})
		expect(second.newProposals).toBe(false)
	})
})
