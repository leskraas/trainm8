import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import {
	PROGRAM_LIFT_EXERCISE_IDS,
	seedStrengthPrograms,
} from './strength-program-seed.server.ts'
import {
	getProgramOverview,
	openNextProgramSession,
	recordProgramSession,
	setWorkingWeight,
	startProgram,
} from './strength-program.server.ts'

const SQUAT = PROGRAM_LIFT_EXERCISE_IDS.squat
const BENCH = PROGRAM_LIFT_EXERCISE_IDS.benchPress
const ROW = PROGRAM_LIFT_EXERCISE_IDS.barbellRow

async function createAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	return user.id
}

/** A StrongLifts run started at the program's own numbers, except the squat,
 * which the athlete states. */
async function startStrongLifts(userId: string, squatKg = 60) {
	await seedStrengthPrograms(prisma)
	const started = await startProgram({
		userId,
		programId: 'prog_stronglifts_5x5_basic',
		startedOn: new Date('2026-08-14T06:00:00Z'),
		startingWeights: [
			{ exerciseId: SQUAT, equipment: null, weightKg: squatKg },
		],
	})
	if (!started.ok) throw new Error(`start failed: ${started.reason}`)
	return started.instanceId
}

/** Log `reps` on every prescribed working set of one lift in a session. */
async function logLift(
	sessionId: string,
	exerciseId: string,
	weightKg: number,
	repsPerSet: number[],
) {
	const step = await prisma.workoutStep.findFirstOrThrow({
		where: {
			exerciseId,
			block: { workout: { sessions: { some: { id: sessionId } } } },
		},
		select: { id: true },
	})
	for (const [orderIndex, reps] of repsPerSet.entries()) {
		await prisma.exerciseSetLog.create({
			data: {
				sessionId,
				stepId: step.id,
				exerciseId,
				orderIndex,
				role: 'working',
				outcome: 'completed',
				load: JSON.stringify({ kind: 'external', kg: weightKg }),
				effectiveKg: weightKg,
				reps,
			},
			select: { id: true },
		})
	}
}

test('a lift the athlete leaves blank starts at the program’s own published weight', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId)

	const overview = await getProgramOverview(userId, instanceId)
	const byExercise = new Map(
		overview!.lifts.map((lift) => [
			lift.exerciseId,
			lift.currentWorkingWeightKg,
		]),
	)
	// The empty bar for the press lifts, and the low end of the published
	// 30–40 kg range for the row — both StrongLifts' own numbers.
	expect(byExercise.get(BENCH)).toBe(20)
	expect(byExercise.get(ROW)).toBe(30)
	// The one number the athlete stated wins over the default.
	expect(byExercise.get(SQUAT)).toBe(60)
})

test('a program run is reachable only by its athlete', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const instanceId = await startStrongLifts(owner)

	expect(await getProgramOverview(stranger, instanceId)).toBeNull()
	expect(
		await setWorkingWeight({
			userId: stranger,
			instanceId,
			exerciseId: SQUAT,
			equipment: null,
			weightKg: 200,
		}),
	).toBe(false)
	const opened = await openNextProgramSession({ userId: stranger, instanceId })
	expect(opened).toBeNull()

	const stillOwned = await getProgramOverview(owner, instanceId)
	expect(
		stillOwned!.lifts.find((lift) => lift.exerciseId === SQUAT)!
			.currentWorkingWeightKg,
	).toBe(60)
})

test('opening a session twice gives back the same session, because a double tap is not two workouts', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId)

	const first = await openNextProgramSession({ userId, instanceId })
	const second = await openNextProgramSession({ userId, instanceId })

	expect(first!.sessionId).toBe(second!.sessionId)
	expect(await prisma.workoutSession.count({ where: { userId } })).toBe(1)
})

test('the load resolves when the session is opened, so the next session’s weight is a function of the last log', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId)

	const first = await openNextProgramSession({ userId, instanceId })
	const squatToday = first!.prescription.lifts.find(
		(lift) => lift.exerciseId === SQUAT,
	)!
	expect(squatToday.sets).toHaveLength(5)
	expect(squatToday.sets[0]!.weight).toMatchObject({ kind: 'resolved', kg: 60 })

	// 25 of 25 on every lift of Workout A.
	await logLift(first!.sessionId, SQUAT, 60, [5, 5, 5, 5, 5])
	await logLift(first!.sessionId, BENCH, 20, [5, 5, 5, 5, 5])
	await logLift(first!.sessionId, ROW, 30, [5, 5, 5, 5, 5])
	await recordProgramSession({
		userId,
		instanceId,
		sessionId: first!.sessionId,
	})
	await prisma.workoutSession.update({
		where: { id: first!.sessionId },
		data: { status: 'completed' },
		select: { id: true },
	})

	// Workout B next, from the stored cursor — and the squat's weight is the one
	// the log just produced, resolved now rather than stamped a week ago.
	const second = await openNextProgramSession({ userId, instanceId })
	expect(second!.dayId).toBe('B')
	const squatNext = second!.prescription.lifts.find(
		(lift) => lift.exerciseId === SQUAT,
	)!
	expect(squatNext.sets[0]!.weight).toMatchObject({
		kind: 'resolved',
		kg: 62.5,
	})
})

test('the advanced state and its appended weight history land together', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId)
	const opened = await openNextProgramSession({ userId, instanceId })
	await logLift(opened!.sessionId, SQUAT, 60, [5, 5, 5, 5, 5])

	const result = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	expect(result.ok).toBe(true)

	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: {
			currentWorkingWeightKg: true,
			stallCount: true,
			weightHistory: true,
		},
	})
	expect(squat.currentWorkingWeightKg).toBe(62.5)
	expect(squat.stallCount).toBe(0)
	// The history entry names the session the advance came from, so the new
	// number and the evidence for it are never out of step.
	expect(JSON.parse(squat.weightHistory)).toEqual([
		{ sessionId: opened!.sessionId, weightKg: 60, succeeded: true },
	])
})

test('a session logged for an athlete who does not own the run changes nothing', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const instanceId = await startStrongLifts(owner)
	const opened = await openNextProgramSession({ userId: owner, instanceId })
	await logLift(opened!.sessionId, SQUAT, 60, [5, 5, 5, 5, 5])

	const result = await recordProgramSession({
		userId: stranger,
		instanceId,
		sessionId: opened!.sessionId,
	})

	expect(result).toEqual({ ok: false, reason: 'not-found' })
	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true, weightHistory: true },
	})
	expect(squat.currentWorkingWeightKg).toBe(60)
	expect(squat.weightHistory).toBe('[]')
})

test('a Stall Cut is written to the lift’s stall history, so “why did my squat drop?” has an answer', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 100)

	// Three sessions in a row where the squat did not complete all 25 reps.
	for (let session = 0; session < 3; session++) {
		const opened = await openNextProgramSession({ userId, instanceId })
		await logLift(opened!.sessionId, SQUAT, 100, [5, 5, 5, 5, 3])
		await recordProgramSession({
			userId,
			instanceId,
			sessionId: opened!.sessionId,
		})
		await prisma.workoutSession.update({
			where: { id: opened!.sessionId },
			data: { status: 'completed' },
			select: { id: true },
		})
	}

	const overview = await getProgramOverview(userId, instanceId)
	const squat = overview!.lifts.find((lift) => lift.exerciseId === SQUAT)!
	expect(squat.currentWorkingWeightKg).toBe(90)
	// The count resets with the response, and the drop is recorded with the two
	// weights it moved between.
	expect(squat.stallCount).toBe(0)
	expect(squat.lastStall).toEqual({
		fromKg: 100,
		toKg: 90,
		response: 'stallCut',
	})
})
