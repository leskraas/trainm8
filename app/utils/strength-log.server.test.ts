import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import {
	clearLoggedSet,
	getStrengthLogView,
	getStrengthSummaryCount,
	saveLoggedSet,
} from './strength-log.server.ts'
import { loadValueText } from './strength-log.ts'

async function createAthlete(weightKg: number | null = 80) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	await prisma.athleteProfile.create({
		data: { userId: user.id, weightKg, timezone: 'UTC' },
	})
	return user
}

/** A `5 × 5 @ 100 kg` squat day, scheduled on `scheduledAt`. */
async function createSquatSession(
	userId: string,
	exerciseId: string,
	scheduledAt: Date,
	setCount = 3,
) {
	const workout = await prisma.workout.create({
		select: {
			id: true,
			blocks: { select: { steps: { select: { id: true } } } },
		},
		data: {
			title: 'Squat day',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									exerciseId,
									restBetweenSetsSec: 180,
									sets: {
										create: Array.from({ length: setCount }, (_, i) => ({
											orderIndex: i,
											kind: 'reps',
											reps: 5,
											load: JSON.stringify({ kind: 'absolute', kg: 100 }),
										})),
									},
								},
							],
						},
					},
				],
			},
		},
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: { userId, scheduledAt, workoutId: workout.id },
	})
	return { sessionId: session.id, stepId: workout.blocks[0]!.steps[0]!.id }
}

async function createExercise(name: string) {
	return prisma.exercise.create({
		select: { id: true },
		data: {
			name,
			primaryMuscle: 'quads',
			equipment: 'barbell',
			isCompound: true,
		},
	})
}

test('the view carries the prescription, so a target is readable before anything is logged', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	const view = await getStrengthLogView(user.id, sessionId)

	expect(view?.exercises).toHaveLength(1)
	expect(view?.exercises[0]?.name).toBe('Back squat')
	expect(view?.exercises[0]?.rows).toHaveLength(3)
	expect(view?.exercises[0]?.rows[0]?.prescribedReps).toBe(5)
	expect(view?.exercises[0]?.rows[0]?.prescribedLoad).toEqual({
		kind: 'absolute',
		kg: 100,
	})
	// Nothing logged is nothing logged, not a zero.
	expect(view?.exercises[0]?.rows[0]?.logged).toBeNull()
	expect(view?.exercises[0]?.rows[0]?.ghost).toBeNull()
})

test('another athlete cannot read the log', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId } = await createSquatSession(
		owner.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	expect(await getStrengthLogView(stranger.id, sessionId)).toBeNull()
})

test('logging is an upsert, so the between-sets double-tap cannot log a set twice', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	const input = {
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working' as const,
		outcome: 'completed' as const,
		toFailure: false,
		load: { kind: 'external' as const, kg: 100 },
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	}
	const first = await saveLoggedSet(input)
	const second = await saveLoggedSet({ ...input, reps: 4 })

	expect(first).toEqual({ ok: true, id: expect.any(String) })
	expect(second).toEqual({ ok: true, id: expect.any(String) })
	const rows = await prisma.exerciseSetLog.findMany({ where: { sessionId } })
	expect(rows).toHaveLength(1)
	expect(rows[0]?.reps).toBe(4)
	// The prescribed set it answers is resolved server-side, never posted.
	expect(rows[0]?.exerciseSetId).not.toBeNull()
	expect(rows[0]?.exerciseId).toBe(exercise.id)
})

test('the effective kilo is baked at log time, with the bodyweight it used', async () => {
	const user = await createAthlete(82)
	const exercise = await createExercise('Weighted dip')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	await saveLoggedSet({
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'bodyweightPlus', addedKg: 20 },
		reps: 6,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})

	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(row.effectiveKg).toBe(102)
	// Stored so the number can be audited — and so a later bodyweight change
	// cannot rewrite this record.
	expect(row.bodyweightKg).toBe(82)

	await prisma.athleteProfile.update({
		where: { userId: user.id },
		data: { weightKg: 76 },
	})
	const after = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(after.effectiveKg).toBe(102)
})

test('a machine level logs with no kilos rather than an invented one', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Lat pulldown')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	await saveLoggedSet({
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'stackLevel', level: 7 },
		reps: 10,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})

	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(row.effectiveKg).toBeNull()
	expect(row.bodyweightKg).toBeNull()
})

test('a stranger cannot log against a session that is not theirs', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId, stepId } = await createSquatSession(
		owner.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	const result = await saveLoggedSet({
		athleteId: stranger.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'external', kg: 100 },
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})

	expect(result).toEqual({ ok: false, reason: 'not-found' })
	expect(await prisma.exerciseSetLog.count({ where: { sessionId } })).toBe(0)
})

test('the ghost comes from the last session containing this lift, matched positionally', async () => {
	const user = await createAthlete()
	const squat = await createExercise('Back squat')
	const bench = await createExercise('Bench press')

	// Monday: a squat ramp.
	const monday = await createSquatSession(
		user.id,
		squat.id,
		new Date('2026-08-03T17:00:00Z'),
	)
	for (const [index, kg] of [60, 80, 100].entries()) {
		await saveLoggedSet({
			athleteId: user.id,
			sessionId: monday.sessionId,
			stepId: monday.stepId,
			orderIndex: index,
			role: 'working',
			outcome: 'completed',
			toFailure: false,
			load: { kind: 'external', kg },
			reps: 5,
			repsLeft: null,
			durationSec: null,
			rir: null,
			restTakenSec: null,
		})
	}

	// Wednesday: bench. It must not become the squat's ghost — that is the
	// push/pull/legs failure mode.
	const wednesday = await createSquatSession(
		user.id,
		bench.id,
		new Date('2026-08-05T17:00:00Z'),
	)
	await saveLoggedSet({
		athleteId: user.id,
		sessionId: wednesday.sessionId,
		stepId: wednesday.stepId,
		orderIndex: 0,
		role: 'working',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'external', kg: 70 },
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})

	// Friday: squat again, four sets this time.
	const friday = await createSquatSession(
		user.id,
		squat.id,
		new Date('2026-08-07T17:00:00Z'),
		4,
	)

	const view = await getStrengthLogView(user.id, friday.sessionId)
	const ghosts = view!.exercises[0]!.rows.map((r) => r.ghost)
	expect(ghosts.map((g) => loadValueText(g!.load))).toEqual([
		'60 kg',
		'80 kg',
		'100 kg',
		'100 kg',
	])
	expect(ghosts.map((g) => g!.extrapolated)).toEqual([
		false,
		false,
		false,
		true,
	])
})

test('un-logging removes the row rather than tombstoning it', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)
	await saveLoggedSet({
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'external', kg: 100 },
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})

	expect(await clearLoggedSet(user.id, sessionId, stepId, 0)).toBe(true)
	expect(await prisma.exerciseSetLog.count({ where: { sessionId } })).toBe(0)
	// A second clear is not an error, it is nothing to do.
	expect(await clearLoggedSet(user.id, sessionId, stepId, 0)).toBe(false)
})

test('the Strength Summary Count reads logged work, not a typed RPE (ADR 0046 §4)', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const now = new Date('2026-08-13T12:00:00Z') // a Thursday
	const a = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-11T17:00:00Z'),
	)
	await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-12T17:00:00Z'),
	)

	// Nothing logged yet: two sessions on the calendar, neither done.
	expect(await getStrengthSummaryCount(user.id, now)).toEqual({
		completed: 0,
		planned: 2,
	})

	// A warm-up is not the session being done.
	await saveLoggedSet({
		athleteId: user.id,
		sessionId: a.sessionId,
		stepId: a.stepId,
		orderIndex: 0,
		role: 'warmup',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'external', kg: 40 },
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})
	expect(await getStrengthSummaryCount(user.id, now)).toEqual({
		completed: 0,
		planned: 2,
	})

	await saveLoggedSet({
		athleteId: user.id,
		sessionId: a.sessionId,
		stepId: a.stepId,
		orderIndex: 1,
		role: 'working',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'external', kg: 100 },
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})
	expect(await getStrengthSummaryCount(user.id, now)).toEqual({
		completed: 1,
		planned: 2,
	})
})

test('a week with no lifting session is an absence, never 0 of 0', async () => {
	const user = await createAthlete()
	expect(
		await getStrengthSummaryCount(user.id, new Date('2026-08-13T12:00:00Z')),
	).toBeNull()
})

// ——— The runner's additions (spec Slice 5) ————————————————————————————————

/** A gym with the plates it takes to make 100 kg off a 20 kg bar. */
async function createGym(userId: string) {
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { id: true },
	})
	await prisma.plateInventory.create({
		data: {
			athleteProfileId: profile.id,
			name: 'My gym',
			isDefault: true,
			bars: JSON.stringify([{ label: 'Olympic', weightKg: 20 }]),
			plates: JSON.stringify([
				{ weightKg: 20, count: 2 },
				{ weightKg: 10, count: 2 },
				{ weightKg: 5, count: 2 },
				{ weightKg: 2.5, count: 2 },
			]),
			fixedDumbbellsKg: null,
		},
		select: { id: true },
	})
}

test('the ramp is generated from the resolved work weight, and only once a gym is on file', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	// No gym described: no plate line and no ramp, stated rather than assumed.
	const without = await getStrengthLogView(user.id, sessionId)
	expect(without!.hasGymOnFile).toBe(false)
	expect(without!.exercises[0]!.warmupRows).toEqual([])

	await createGym(user.id)
	const view = await getStrengthLogView(user.id, sessionId)
	const ramp = view!.exercises[0]!.warmupRows

	expect(view!.hasGymOnFile).toBe(true)
	// Two empty-bar sets, then rungs — and every rung is plate-aligned on *this*
	// rack rather than a percentage of the work weight.
	expect(ramp.length).toBeGreaterThanOrEqual(3)
	expect(ramp[0]!.warmupRung!.targetKg).toBe(20)
	expect(ramp.at(-1)!.warmupRung!.targetKg).toBeLessThan(100)
	expect(ramp[0]!.warmupRung!.plateLine).toBe('empty bar')
})

test('a logged ramp rung lives in its own index band and does not grow the grid', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)
	await createGym(user.id)

	const saved = await saveLoggedSet({
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 1000,
		role: 'warmup',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'external', kg: 20 },
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})
	expect(saved.ok).toBe(true)

	const view = await getStrengthLogView(user.id, sessionId)
	const step = view!.exercises[0]!

	// Three prescribed rows, still — a rung at 1000 must not produce a thousand
	// empty sets, which is the bug the reserved band is checked for.
	expect(step.rows).toHaveLength(3)
	expect(step.rows.every((r) => r.logged == null)).toBe(true)
	expect(step.warmupRows[0]!.logged?.reps).toBe(5)
	expect(step.warmupRows[0]!.logged?.role).toBe('warmup')
})

test('an unresolved percentage reaches the runner as an absence and never as a kilo', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Percentage day',
			discipline: 'strength',
			intent: 'strength',
			ownerId: user.id,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									exerciseId: exercise.id,
									sets: {
										create: [
											{
												orderIndex: 0,
												kind: 'reps',
												reps: 5,
												load: JSON.stringify({ kind: 'pct1RM', minPct: 85 }),
											},
										],
									},
								},
							],
						},
					},
				],
			},
		},
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-08-13T17:00:00Z'),
		},
	})

	const view = await getStrengthLogView(user.id, session.id)
	const resolved = view!.exercises[0]!.rows[0]!.resolvedLoad

	expect(resolved?.kind).toBe('unavailable')
	if (resolved?.kind === 'unavailable') {
		expect(resolved.reason).toBe('no-anchor')
		expect(resolved.authored).toEqual({ kind: 'pct1RM', minPct: 85 })
	}
	// And with no resolved kilo there is nothing to ramp to, so no ramp is invented.
	expect(view!.exercises[0]!.warmupRows).toEqual([])
})
