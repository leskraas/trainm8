import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import {
	clearLoggedSet,
	getStrengthLogView,
	getStrengthSummaryCount,
	saveLoggedSet,
} from './strength-log.server.ts'
import { WARMUP_ORDER_INDEX_BASE, loadValueText } from './strength-log.ts'

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

/**
 * A movement with its equipment realizations. `equipment` is what the `Exercise`
 * row itself states — the string the log path resolves a variant from — and
 * `variantEquipments` are the realizations that actually exist for it, which is
 * not always the same list.
 */
async function createExerciseWithVariants(
	name: string,
	equipment: string | null,
	variantEquipments: string[],
) {
	const exercise = await prisma.exercise.create({
		select: { id: true },
		data: {
			name,
			primaryMuscle: 'chest',
			equipment,
			isCompound: true,
			variants: {
				create: variantEquipments.map((variantEquipment, index) => ({
					equipment: variantEquipment,
					displayName: `${name} (${variantEquipment})`,
					loadKind: 'external',
					isDefault: index === 0,
				})),
			},
		},
	})
	const variants = await prisma.exerciseVariant.findMany({
		where: { exerciseId: exercise.id },
		select: { id: true, equipment: true },
	})
	return { id: exercise.id, variants }
}

const workingSet = {
	role: 'working' as const,
	outcome: 'completed' as const,
	toFailure: false,
	repsLeft: null,
	durationSec: null,
	rir: null,
	restTakenSec: null,
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

	expect(first).toEqual({
		ok: true,
		id: expect.any(String),
		records: expect.any(Array),
	})
	expect(second).toEqual({
		ok: true,
		id: expect.any(String),
		records: expect.any(Array),
	})
	// One row, one identity, and therefore one banner: the second tap re-derives
	// over the same row and replaces the first answer rather than adding to it.
	expect(second.ok && second.id).toBe(first.ok && first.id)
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

test("editing a recorded set's reps does not change what it was loaded with", async () => {
	// The data-corruption defect: a Barbell Row logged as machine level 7 reopened
	// labelled `kg` with 7 in the box, and typing a rep count and saving rewrote the
	// stored row from `{"kind":"stackLevel","level":7}` / `effectiveKg NULL` into
	// `{"kind":"external","kg":7}` / `effectiveKg 7`. A logged set is a record of
	// what happened, so the kind is locked unless the caller says it means to change
	// it — and a rep-count edit never does.
	const user = await createAthlete()
	const exercise = await createExercise('Barbell row')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)
	const set = {
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working' as const,
		outcome: 'completed' as const,
		toFailure: false,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	}
	await saveLoggedSet({
		...set,
		load: { kind: 'stackLevel', level: 7 },
		reps: 10,
	})

	const refused = await saveLoggedSet({
		...set,
		load: { kind: 'external', kg: 7 },
		reps: 8,
	})

	expect(refused.ok).toBe(false)
	expect(refused.ok === false && refused.reason).toBe('load-kind-locked')
	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(JSON.parse(row.load)).toEqual({ kind: 'stackLevel', level: 7 })
	expect(row.effectiveKg).toBeNull()
	// The reps the athlete typed are not saved either: a set is one statement, and
	// half-applying it would leave 8 reps recorded against a load nobody restated.
	expect(row.reps).toBe(10)
})

test('changing what a recorded set was loaded with is allowed when it is said out loud', async () => {
	// The other half of the lock. An athlete who genuinely logged a machine set on
	// the wrong picker must be able to fix it — the deliberate act is saying so.
	const user = await createAthlete()
	const exercise = await createExercise('Barbell row')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)
	const set = {
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working' as const,
		outcome: 'completed' as const,
		toFailure: false,
		reps: 10,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	}
	await saveLoggedSet({ ...set, load: { kind: 'stackLevel', level: 7 } })

	const changed = await saveLoggedSet({
		...set,
		load: { kind: 'external', kg: 60 },
		changeLoadKind: true,
	})

	expect(changed.ok).toBe(true)
	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(JSON.parse(row.load)).toEqual({ kind: 'external', kg: 60 })
	expect(row.effectiveKg).toBe(60)
})

/**
 * A dip-belt set logged at 74 kg bodyweight with 30 kg on the belt: `effectiveKg
 * 104`, `bodyweightKg 74`. Returned with the handles to edit it, so each of the
 * tests below can say what an edit is allowed to move.
 */
async function loggedWeightedDip(scheduledAt: Date) {
	const user = await createAthlete(74)
	const exercise = await createExercise('Weighted dip')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		scheduledAt,
	)
	const set = {
		...workingSet,
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		load: { kind: 'bodyweightPlus' as const, addedKg: 30 },
		reps: 5,
	}
	await saveLoggedSet(set)
	const logged = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(logged.effectiveKg).toBe(104)
	expect(logged.bodyweightKg).toBe(74)
	return { user, sessionId, stepId, set }
}

/** Raise what the athlete's profile says they weigh, the way stepping on a scale
 * months later does. */
async function nowWeighs(userId: string, weightKg: number) {
	await prisma.athleteProfile.update({
		where: { userId },
		data: { weightKg },
	})
}

test('editing a rep count does not re-bake the kilo that was baked when the set was logged', async () => {
	// The defect: one `fields` object served both branches of the upsert, so an
	// update carried a freshly baked `effectiveKg` along with the rep count. Raising
	// the profile weight 74 → 84 and then changing 5 reps to 6 moved a stored 104 kg
	// dip to 114 kg, and the banner read "Heaviest bodyweight set: 114 kg" for a set
	// performed at 104.
	const { user, sessionId, set } = await loggedWeightedDip(
		new Date('2026-08-13T17:00:00Z'),
	)
	await nowWeighs(user.id, 84)

	const edited = await saveLoggedSet({ ...set, reps: 6 })

	expect(edited.ok).toBe(true)
	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	// The rep count is what the athlete edited, and the only thing that moved.
	expect(row.reps).toBe(6)
	expect(row.effectiveKg).toBe(104)
})

test('a bodyweight change does not rewrite an old weighted-dip record', async () => {
	// ADR 0056 §3's stated reason for baking at all, read at the surface rather
	// than in the column: the athlete gains 10 kg over two years, then tidies up an
	// old session by adding the RIR they remember, and the old set still says what
	// it was lifted at.
	const { user, sessionId, set } = await loggedWeightedDip(
		new Date('2024-08-13T17:00:00Z'),
	)
	await nowWeighs(user.id, 84)

	await saveLoggedSet({ ...set, rir: 1 })

	const view = await getStrengthLogView(user.id, sessionId)
	const logged = view?.exercises[0]?.rows[0]?.logged
	expect(logged?.rir).toBe(1)
	expect(logged?.effectiveKg).toBe(104)
	expect(logged?.load).toEqual({ kind: 'bodyweightPlus', addedKg: 30 })
})

test('the bodyweight stored beside a baked kilo is never overwritten by an edit', async () => {
	// The audit column is the whole defence: it exists so 104 can be re-derived and
	// checked. The observed defect overwrote it in the same statement that moved the
	// kilo, which destroyed the evidence that anything had happened.
	const { user, sessionId, set } = await loggedWeightedDip(
		new Date('2026-08-13T17:00:00Z'),
	)
	await nowWeighs(user.id, 84)

	// Every field an edit legitimately touches, one at a time.
	await saveLoggedSet({ ...set, reps: 6 })
	await saveLoggedSet({ ...set, reps: 6, rir: 2 })
	await saveLoggedSet({ ...set, reps: 6, rir: 2, restTakenSec: 210 })
	await saveLoggedSet({ ...set, reps: 6, rir: 2, outcome: 'abandoned' })
	await saveLoggedSet({ ...set, reps: 6, rir: 2, role: 'backoff' })

	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(row.bodyweightKg).toBe(74)
	expect(row.effectiveKg).toBe(104)
	// And the edits did land — the row is not simply frozen.
	expect(row.role).toBe('backoff')
	expect(row.rir).toBe(2)
})

test('restating what a set was loaded with re-bakes the kilo and stores the bodyweight it used beside it', async () => {
	// The other side of the rule. A load the athlete deliberately restates is a new
	// statement about what was on the belt, so the kilo is baked again — and the
	// bodyweight that bake used is written in the same breath, so the pair is never
	// half-updated. It is the bodyweight *the row already states*, because restating
	// a load corrects what the set was loaded with and not when it happened.
	const { user, sessionId, set } = await loggedWeightedDip(
		new Date('2024-08-13T17:00:00Z'),
	)
	await nowWeighs(user.id, 84)

	const restated = await saveLoggedSet({
		...set,
		load: { kind: 'bodyweightPlus', addedKg: 35 },
	})

	expect(restated.ok).toBe(true)
	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(JSON.parse(row.load)).toEqual({ kind: 'bodyweightPlus', addedKg: 35 })
	// 74 + 35, not 84 + 35: the belt is what got corrected, not the athlete.
	expect(row.effectiveKg).toBe(109)
	expect(row.bodyweightKg).toBe(74)
})

test('a load kind restated into a bodyweight one bakes against the weight the athlete states now, and says so beside it', async () => {
	// The one case with no bodyweight standing beside the row to bake against: it
	// was logged as plain iron, so nothing was ever stated about the athlete. The
	// current stated weight is the honest input — and it is written down, so the
	// kilo can be audited like any other.
	const user = await createAthlete(84)
	const exercise = await createExercise('Dip')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)
	const set = {
		...workingSet,
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		reps: 8,
	}
	await saveLoggedSet({ ...set, load: { kind: 'external', kg: 30 } })

	const restated = await saveLoggedSet({
		...set,
		load: { kind: 'bodyweightPlus', addedKg: 30 },
		changeLoadKind: true,
	})

	expect(restated.ok).toBe(true)
	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(row.effectiveKg).toBe(114)
	expect(row.bodyweightKg).toBe(84)
})

test('the movement a set was lifted on is not rewritten by a later edit to the prescription', async () => {
	// The same class of bug one column over. `exerciseId` and `variantId` are facts
	// about the moment of logging — they are the progression key a record is filed
	// under — so an update must not re-derive them from a Step that has since been
	// edited to a different movement. Swapping the exercise after logging is
	// un-logging the set, not editing it.
	const user = await createAthlete()
	const squat = await createExercise('Back squat')
	const frontSquat = await createExercise('Front squat')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		squat.id,
		new Date('2026-08-13T17:00:00Z'),
	)
	const set = {
		...workingSet,
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		load: { kind: 'external' as const, kg: 100 },
		reps: 5,
	}
	await saveLoggedSet(set)

	await prisma.workoutStep.update({
		where: { id: stepId },
		data: { exerciseId: frontSquat.id },
	})
	await saveLoggedSet({ ...set, reps: 4 })

	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(row.reps).toBe(4)
	expect(row.exerciseId).toBe(squat.id)
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

test('a logged set records which realization of the movement it was, so barbell and dumbbell bench never share a record', async () => {
	const user = await createAthlete()
	// The barbell bench also has a Smith-machine realization on file, so the
	// resolution has something to get wrong.
	const barbellBench = await createExerciseWithVariants(
		'Bench press',
		'barbell',
		['barbell', 'smith-machine'],
	)
	const dumbbellBench = await createExerciseWithVariants(
		'Dumbbell bench press',
		'dumbbell',
		['dumbbell'],
	)

	const rows = []
	for (const exercise of [barbellBench, dumbbellBench]) {
		const { sessionId, stepId } = await createSquatSession(
			user.id,
			exercise.id,
			new Date('2026-08-13T17:00:00Z'),
		)
		await saveLoggedSet({
			...workingSet,
			athleteId: user.id,
			sessionId,
			stepId,
			orderIndex: 0,
			load: { kind: 'external', kg: 80 },
			reps: 5,
		})
		rows.push(
			await prisma.exerciseSetLog.findFirstOrThrow({
				where: { sessionId },
				select: { variant: { select: { id: true, equipment: true } } },
			}),
		)
	}

	expect(rows.map((row) => row.variant?.equipment)).toEqual([
		'barbell',
		'dumbbell',
	])
	expect(rows[0]!.variant!.id).not.toBe(rows[1]!.variant!.id)
})

test('an equipment with no variant for this movement logs no variant rather than borrowing a neighbouring one', async () => {
	const user = await createAthlete()
	// The movement says kettlebell; the only realization on file is a barbell.
	const swing = await createExerciseWithVariants('Swing', 'kettlebell', [
		'barbell',
	])
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		swing.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	await saveLoggedSet({
		...workingSet,
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		load: { kind: 'external', kg: 24 },
		reps: 10,
	})

	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
		select: { variantId: true, exerciseId: true },
	})
	// The set happened, and it happened on nothing anybody named.
	expect(row.exerciseId).toBe(swing.id)
	expect(row.variantId).toBeNull()
})

test('the ghost comes from the last session on this same realization, not merely the same movement', async () => {
	const user = await createAthlete()
	const bench = await createExerciseWithVariants('Bench press', 'barbell', [
		'barbell',
		'smith-machine',
	])
	const smith = bench.variants.find((v) => v.equipment === 'smith-machine')!

	// Monday, on the bar: 80 kg.
	const monday = await createSquatSession(
		user.id,
		bench.id,
		new Date('2026-08-03T17:00:00Z'),
	)
	await saveLoggedSet({
		...workingSet,
		athleteId: user.id,
		sessionId: monday.sessionId,
		stepId: monday.stepId,
		orderIndex: 0,
		load: { kind: 'external', kg: 80 },
		reps: 5,
	})

	// Wednesday, on the Smith machine: 100 kg, which is not 100 kg on the bar.
	const wednesday = await createSquatSession(
		user.id,
		bench.id,
		new Date('2026-08-05T17:00:00Z'),
	)
	await saveLoggedSet({
		...workingSet,
		athleteId: user.id,
		sessionId: wednesday.sessionId,
		stepId: wednesday.stepId,
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		reps: 5,
	})
	// The runner has no per-set equipment control yet, so the realization is
	// stated here — the rule under test is the reader's scoping, not the picker.
	// **Both halves of it**, because the key is the row's own statement: a set that
	// still said `barbell` would still be a barbell set, which is the whole point of
	// the stamp.
	await prisma.exerciseSetLog.updateMany({
		where: { sessionId: wednesday.sessionId },
		data: { variantId: smith.id, equipment: 'smith-machine' },
	})

	// Friday, back on the bar.
	const friday = await createSquatSession(
		user.id,
		bench.id,
		new Date('2026-08-07T17:00:00Z'),
	)

	const view = await getStrengthLogView(user.id, friday.sessionId)
	const ghosts = view!.exercises[0]!.rows.map((r) => r.ghost)
	expect(ghosts.map((g) => (g ? loadValueText(g.load) : null))).toEqual([
		'80 kg',
		'80 kg',
		'80 kg',
	])
	expect(ghosts.map((g) => g?.extrapolated)).toEqual([false, true, true])
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
	// A barbell rung's two kilos are the same kilo, and the row says so — which is
	// what tells a reader this ramp is not resolved against the athlete.
	expect(ramp[0]!.warmupRung!.effectiveKg).toBe(20)
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

test('saving a working set reports the records it took, and a warm-up reports none', async () => {
	// The wiring only: what a record *is* is proven over the database in
	// `strength-records.server.test.ts` and over arrays in `strength/records.test.ts`.
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
		load: { kind: 'external' as const, kg: 120 },
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	}

	const working = await saveLoggedSet(input)
	const warmup = await saveLoggedSet({
		...input,
		orderIndex: 1,
		role: 'warmup',
		load: { kind: 'external' as const, kg: 200 },
	})

	expect(working.ok && working.records.length).toBeGreaterThan(0)
	expect(working.ok && working.records[0]?.exerciseId).toBe(exercise.id)
	// Heavier than everything, and still not a record: a warm-up is not work.
	expect(warmup.ok && warmup.records).toEqual([])
})

test('a weight with no count is refused rather than saved as a completed working set', async () => {
	// The drive-through defect: `20` in the kg field, the reps field left blank,
	// one tap on ✓ — and a `completed` / `working` row with `reps: NULL` was
	// written, which minted "Heaviest ever: 20 kg" off a set nobody performed and
	// counted as a miss in the program's success predicate, so an accidental tap
	// silently stalled the program.
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	const result = await saveLoggedSet({
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'external', kg: 20 },
		reps: null,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})

	expect(result).toEqual({ ok: false, reason: 'no-count' })
	// Nothing was written, so there is no row for a record to be derived from and
	// none for the program engine to read as zero reps.
	expect(await prisma.exerciseSetLog.count({ where: { sessionId } })).toBe(0)
})

test('a timed hold logs its seconds with no rep count at all, so the rule is about the count and not about reps', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Plank')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	const held = await saveLoggedSet({
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'unloaded' },
		reps: null,
		repsLeft: null,
		durationSec: 45,
		rir: null,
		restTakenSec: null,
	})

	expect(held.ok).toBe(true)
	const row = await prisma.exerciseSetLog.findFirstOrThrow({
		where: { sessionId },
	})
	expect(row.durationSec).toBe(45)
	expect(row.reps).toBeNull()
})

test('a set that did not happen is recorded by abandoning it, which needs no count', async () => {
	// ADR 0056 §6: a miss came up short of a count, an abandoned set has no count
	// to compare. It is the honest way to record a rack-and-walk-away — and the
	// way out of an accidental tap — so it is exempt from the count rule.
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	const abandoned = await saveLoggedSet({
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: 0,
		role: 'working',
		outcome: 'abandoned',
		toFailure: false,
		load: { kind: 'external', kg: 20 },
		reps: null,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})

	expect(abandoned.ok).toBe(true)
	// And an abandoned set takes no record, so nothing is announced off it.
	expect(abandoned.ok && abandoned.records).toEqual([])
})

test('a warm-up rung is a check-off and needs no typed count, because it feeds no reading', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	const rung = await saveLoggedSet({
		athleteId: user.id,
		sessionId,
		stepId,
		orderIndex: WARMUP_ORDER_INDEX_BASE,
		role: 'warmup',
		outcome: 'completed',
		toFailure: false,
		load: { kind: 'external', kg: 60 },
		reps: null,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	})

	expect(rung.ok).toBe(true)
	expect(rung.ok && rung.records).toEqual([])
})

test('the view carries the load semantics the corpus authored, so a bodyweight movement states its own load', async () => {
	const user = await createAthlete()
	const exercise = await prisma.exercise.create({
		select: { id: true },
		data: {
			name: 'Plank',
			primaryMuscle: 'abs',
			equipment: 'bodyweight',
			isCompound: false,
			variants: {
				create: {
					equipment: 'bodyweight',
					displayName: 'Plank',
					loadKind: 'bodyweight',
					useBodyweightForBar: true,
					isDefault: true,
				},
			},
		},
	})
	const { sessionId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	const view = await getStrengthLogView(user.id, sessionId)

	// Said without a gym on file, because a plank is bodyweight-loaded in a
	// garage too — the plate context is null here and this is not.
	expect(view?.exercises[0]?.loadSemanticsKind).toBe('bodyweight')
})

test('a movement whose load semantics nobody authored says so, rather than being called external', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const { sessionId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)

	const view = await getStrengthLogView(user.id, sessionId)

	expect(view?.exercises[0]?.loadSemanticsKind).toBeNull()
})

// ——— The stored kilo, checked against the load that explains it ————————————

test('a set log whose stored kilo does not match the load that explains it is not believed', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Weighted dip')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)
	// The row a verifier hand-wrote, which no runner interaction can produce: 30 kg
	// of load with 300 kg baked beside it. The app read the 300 all the way to
	// *"Set used: 300 kg × 3"*, a stored 330 kg `estimatedOneRm` and a 264 kg
	// prescription.
	await prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId,
			stepId,
			exerciseId: exercise.id,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'external', kg: 30 }),
			effectiveKg: 300,
			reps: 3,
		},
	})

	const view = await getStrengthLogView(user.id, sessionId)
	const logged = view?.exercises[0]?.rows[0]?.logged

	// The 300 is gone — nothing downstream may price anything off it — and the
	// number is not repaired to 30 either.
	expect(logged?.effectiveKg).toBeNull()
	// The set still exists and still says what it was loaded with: a row that
	// happened must not vanish because a derived column got out of step with it.
	expect(logged?.load).toEqual({ kind: 'external', kg: 30 })
	expect(logged?.reps).toBe(3)
	// And the refusal says why, quoting both numbers.
	expect(logged?.loadUnreadable).toMatch(/30 kg/)
	expect(logged?.loadUnreadable).toMatch(/300 kg/)
})

test('a bodyweight-derived row is checked against the bodyweight stored beside it, not today’s', async () => {
	// The athlete weighs 84 kg **now**, and that is not the bodyweight either of
	// these rows is checked against.
	const user = await createAthlete(84)
	const exercise = await createExercise('Weighted dip')
	const { sessionId, stepId } = await createSquatSession(
		user.id,
		exercise.id,
		new Date('2026-08-13T17:00:00Z'),
	)
	// Row one: baked at the 74 kg the athlete was then, which is what stands
	// beside it. Honest, and it must survive the athlete gaining weight.
	await prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId,
			stepId,
			exerciseId: exercise.id,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'bodyweightPlus', addedKg: 20 }),
			effectiveKg: 94,
			bodyweightKg: 74,
			reps: 5,
		},
	})
	// Row two: 104 kg — today's 84 plus 20 — standing beside a stored bodyweight of
	// 74. The pair cannot both be true, and the witness is what says so.
	await prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId,
			stepId,
			exerciseId: exercise.id,
			orderIndex: 1,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'bodyweightPlus', addedKg: 20 }),
			effectiveKg: 104,
			bodyweightKg: 74,
			reps: 5,
		},
	})

	const view = await getStrengthLogView(user.id, sessionId)
	const rows = view?.exercises[0]?.rows ?? []

	// The old row keeps its own kilo, unmoved and un-recomputed — checking it
	// against today's 84 kg would refuse a row that was right when it was written.
	expect(rows[0]?.logged?.effectiveKg).toBe(94)
	expect(rows[0]?.logged?.loadUnreadable ?? null).toBeNull()
	// The row that does not follow from the bodyweight beside it is refused.
	expect(rows[1]?.logged?.effectiveKg).toBeNull()
	expect(rows[1]?.logged?.loadUnreadable).toMatch(/94 kg/)
})
