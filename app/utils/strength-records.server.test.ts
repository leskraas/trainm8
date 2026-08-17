/**
 * Seam 2 (spec "Testing Decisions"): a real SQLite database, Prisma never
 * mocked, and **only what the pure seam structurally cannot cover**. Every rule
 * about what a record *is* — the qualification gate, the variant scoping, the
 * debut window, the tie-break, the previous best — is already proven over arrays
 * in `strength/records.test.ts` and `strength/exercise-history.test.ts` and is
 * not re-tested here.
 *
 * What is left is what only a database can answer: ownership scoping, reading
 * the baked `effectiveKg` column rather than re-deriving it, and the wiring of
 * the injected 1RM equation.
 */
import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import { type LoadValue } from './strength-log.ts'
import { getExerciseHistoryView } from './strength-records.server.ts'

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

async function createExercise(
	name: string,
	options: { authorship?: string; createdByAthleteId?: string } = {},
) {
	return prisma.exercise.create({
		select: { id: true },
		data: {
			name,
			primaryMuscle: 'quads',
			equipment: 'barbell',
			isCompound: true,
			authorship: options.authorship ?? 'system',
			createdByAthleteId: options.createdByAthleteId ?? null,
		},
	})
}

async function createVariant(exerciseId: string, equipment: string) {
	return prisma.exerciseVariant.create({
		select: { id: true },
		data: {
			exerciseId,
			equipment,
			displayName: `${equipment} lift`,
			loadKind: 'external',
		},
	})
}

/** A strength session with one Step on `exerciseId`, and nothing logged yet. */
async function createSession(
	userId: string,
	exerciseId: string,
	scheduledAt: Date,
) {
	const workout = await prisma.workout.create({
		select: {
			id: true,
			blocks: { select: { steps: { select: { id: true } } } },
		},
		data: {
			title: 'Lift day',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [{ orderIndex: 0, kind: 'strength', exerciseId }],
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

/** Write a set log straight in, the way `saveLoggedSet` leaves it: the load as
 * JSON and `effectiveKg` **baked**. */
async function logSet(
	where: { sessionId: string; stepId: string; exerciseId: string },
	set: {
		orderIndex: number
		load: LoadValue
		effectiveKg: number | null
		reps: number | null
		variantId?: string
		role?: string
		outcome?: string
		bodyweightKg?: number | null
	},
) {
	return prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId: where.sessionId,
			stepId: where.stepId,
			exerciseId: where.exerciseId,
			variantId: set.variantId ?? null,
			orderIndex: set.orderIndex,
			role: set.role ?? 'working',
			outcome: set.outcome ?? 'completed',
			load: JSON.stringify(set.load),
			effectiveKg: set.effectiveKg,
			bodyweightKg: set.bodyweightKg ?? null,
			reps: set.reps,
		},
	})
}

const NOW = new Date('2026-08-14T12:00:00Z')

test('another athlete’s logged sets are not in this athlete’s history', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			owner.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
	})

	const mine = await getExerciseHistoryView(owner.id, exercise.id, { now: NOW })
	const theirs = await getExerciseHistoryView(stranger.id, exercise.id, {
		now: NOW,
	})

	expect(mine?.sessions).toHaveLength(1)
	expect(mine?.records.length).toBeGreaterThan(0)
	// A set log is reachable only by its athlete: the stranger may read the shared
	// exercise, and reads none of somebody else's work.
	expect(theirs?.sessions).toEqual([])
	expect(theirs?.records).toEqual([])
})

test('an exercise another athlete authored is not readable at all', async () => {
	const author = await createAthlete()
	const stranger = await createAthlete()
	const exercise = await createExercise('Hack squat, my way', {
		authorship: 'athlete',
		createdByAthleteId: author.id,
	})

	expect(await getExerciseHistoryView(author.id, exercise.id)).not.toBeNull()
	expect(await getExerciseHistoryView(stranger.id, exercise.id)).toBeNull()
})

test('an exercise the athlete has never logged reads as an empty history, not a missing page', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Front squat')

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view).not.toBeNull()
	expect(view?.sessions).toEqual([])
	expect(view?.lastTime).toBeNull()
	expect(view?.variants).toEqual([])
})

test('history is scoped to the variant, so a lighter dumbbell day is not a regression', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Bench press')
	const barbell = await createVariant(exercise.id, 'barbell')
	const dumbbell = await createVariant(exercise.id, 'dumbbell')
	const barbellDay = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-05T17:00:00Z'),
		)),
	}
	await logSet(barbellDay, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
		variantId: barbell.id,
	})
	const dumbbellDay = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-12T17:00:00Z'),
		)),
	}
	await logSet(dumbbellDay, {
		orderIndex: 0,
		load: { kind: 'external', kg: 60 },
		effectiveKg: 60,
		reps: 5,
		variantId: dumbbell.id,
	})

	const all = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })
	const onBarbell = await getExerciseHistoryView(user.id, exercise.id, {
		equipment: 'barbell',
		now: NOW,
	})

	expect(all?.variants).toEqual([
		{ equipment: 'barbell', sessionCount: 1 },
		{ equipment: 'dumbbell', sessionCount: 1 },
	])
	// The dumbbell day is the athlete's last session on this movement, and the
	// barbell history still tops out at 100 kg.
	expect(onBarbell?.sessions).toHaveLength(1)
	expect(
		onBarbell?.records.find((record) => record.kind === 'heaviestLoad')?.value,
	).toBe(100)
	expect(
		all?.records.filter((record) => record.kind === 'heaviestLoad'),
	).toHaveLength(2)
})

test('a set log with no variant row falls back to the exercise’s own equipment', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.variants).toEqual([{ equipment: 'barbell', sessionCount: 1 }])
})

test('a weighted-dip record reads the kilos baked at log time, so a later bodyweight change never rewrites it', async () => {
	const user = await createAthlete(80)
	const exercise = await createExercise('Weighted dip')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'bodyweightPlus', addedKg: 20 },
		effectiveKg: 100,
		reps: 5,
		bodyweightKg: 80,
	})

	const before = await getExerciseHistoryView(user.id, exercise.id, {
		now: NOW,
	})
	await prisma.athleteProfile.update({
		where: { userId: user.id },
		data: { weightKg: 74 },
	})
	const after = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	const heaviest = (view: typeof before) =>
		view?.records.find((record) => record.kind === 'heaviestLoad')?.value
	expect(heaviest(before)).toBe(100)
	expect(heaviest(after)).toBe(100)
})

test('a set with no honest kilo gets a level record and never an invented kilo', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Lat pulldown')
	const machine = await createVariant(exercise.id, 'machine')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'stackLevel', level: 7 },
		effectiveKg: null,
		reps: 12,
		variantId: machine.id,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.records.map((record) => record.kind)).toEqual(['stackLevel'])
	expect(view?.records[0]?.unit).toBe('level')
	expect(view?.sessions[0]?.topSetKg).toBeNull()
	// Present in its own curve, and absent from every kilo reading.
	expect(view?.sessions).toHaveLength(1)
})

test('an estimated 1RM is produced from a set inside the equation’s rep range and refused outside it', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const inRange = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(inRange, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
	})

	const withEstimate = await getExerciseHistoryView(user.id, exercise.id, {
		now: NOW,
	})

	const e1rm = withEstimate?.records.find((record) => record.kind === 'e1RM')
	expect(e1rm?.estimator).toBe('epley')
	expect(e1rm?.value).toBeCloseTo(116.7, 1)

	const other = await createExercise('Leg extension')
	const highReps = {
		exerciseId: other.id,
		...(await createSession(
			user.id,
			other.id,
			new Date('2026-08-11T17:00:00Z'),
		)),
	}
	await logSet(highReps, {
		orderIndex: 0,
		load: { kind: 'external', kg: 40 },
		effectiveKg: 40,
		reps: 20,
	})

	const refused = await getExerciseHistoryView(user.id, other.id, { now: NOW })

	// A set of twenty is outside every published equation's validated range, so it
	// contributes nothing rather than being graded down.
	expect(refused?.records.map((record) => record.kind)).not.toContain('e1RM')
	expect(refused?.records.map((record) => record.kind)).toContain(
		'heaviestLoad',
	)
})

test('a warm-up is not a record and an abandoned set is dropped, even when it is the heaviest row in the table', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 60 },
		effectiveKg: 60,
		reps: 5,
		role: 'warmup',
	})
	await logSet(where, {
		orderIndex: 1,
		load: { kind: 'external', kg: 140 },
		effectiveKg: 140,
		reps: 1,
		outcome: 'abandoned',
	})
	await logSet(where, {
		orderIndex: 2,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(
		view?.records.find((record) => record.kind === 'heaviestLoad')?.value,
	).toBe(100)
	expect(view?.sessions[0]?.workingSetCount).toBe(1)
})

test('a row whose stored load cannot be parsed is left out rather than read as a zero', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await prisma.exerciseSetLog.create({
		data: {
			sessionId: where.sessionId,
			stepId: where.stepId,
			exerciseId: exercise.id,
			orderIndex: 0,
			load: 'not json',
			effectiveKg: 100,
			reps: 5,
		},
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.sessions).toEqual([])
	expect(view?.records).toEqual([])
})

test('a session is history by the day it was scheduled, so back-filling last week does not make it today', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const lastWeek = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-04T17:00:00Z'),
		)),
	}
	await logSet(lastWeek, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
	})
	const thisWeek = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-12T17:00:00Z'),
		)),
	}
	await logSet(thisWeek, {
		orderIndex: 0,
		load: { kind: 'external', kg: 102.5 },
		effectiveKg: 102.5,
		reps: 5,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.lastTime?.sessionId).toBe(thisWeek.sessionId)
	expect(view?.sessions.map((session) => session.topSetKg)).toEqual([
		102.5, 100,
	])
})
