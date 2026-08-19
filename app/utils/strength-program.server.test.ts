import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import { proposeExerciseOneRm } from './strength-anchors.server.ts'
import {
	PROGRAM_LIFT_EQUIPMENT,
	PROGRAM_LIFT_EXERCISE_IDS,
	seedStrengthPrograms,
} from './strength-program-seed.server.ts'
import {
	endProgram,
	getProgramOverview,
	listPrograms,
	openNextProgramSession,
	recordProgramSession,
	setWorkingWeight,
	startProgram,
} from './strength-program.server.ts'
import { buildBlocksCreate } from './workout.server.ts'

const SQUAT = PROGRAM_LIFT_EXERCISE_IDS.squat
const BENCH = PROGRAM_LIFT_EXERCISE_IDS.benchPress
const ROW = PROGRAM_LIFT_EXERCISE_IDS.barbellRow
const DEADLIFT = PROGRAM_LIFT_EXERCISE_IDS.deadlift
/** The realization all three seeded programs state — see `PROGRAM_LIFT_EQUIPMENT`.
 * Stated here too, because a test that passed `null` would be keying its athlete's
 * lift state on a pair the program does not prescribe. */
const BARBELL = PROGRAM_LIFT_EQUIPMENT.squat

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
			{ exerciseId: SQUAT, equipment: BARBELL, weightKg: squatKg },
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
			equipment: BARBELL,
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

// ——— The percentage family: a training max and an Anchor Re-estimate ————————

/**
 * A **5/3/1-shaped** run: every set is a percentage of a training max, the last
 * set is the rule, and one miss is an **Anchor Re-estimate**. Built here rather
 * than seeded because the percentage families are not shipped yet — the shape is
 * what the injected estimator has to answer.
 */
async function startFiveThreeOneShaped(options: {
	userId: string
	exerciseId: string
	movementPattern: string
	statedMaxKg: number
	successPredicate: Record<string, unknown>
}) {
	await prisma.exercise.update({
		where: { id: options.exerciseId },
		data: { movementPattern: options.movementPattern },
		select: { id: true },
	})
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: '5/3/1-shaped · Workout A',
			discipline: 'strength',
			intent: 'strength-max',
			strengthGoal: 'maximal-strength',
			authorship: 'system',
			blocks: {
				create: buildBlocksCreate([
					{
						repeatCount: 1,
						steps: [
							{
								kind: 'strength',
								exerciseId: options.exerciseId,
								sets: [0, 1, 2].map((orderIndex) => ({
									kind: 'reps' as const,
									orderIndex,
									reps: 5,
								})),
							},
						],
					},
				]),
			},
		},
	})
	const programId = `prog_test_531_${options.exerciseId}`
	await prisma.strengthProgram.create({
		select: { id: true },
		data: {
			id: programId,
			key: 'test-531-shaped',
			variantId: 'v1',
			name: '5/3/1-shaped',
			authorship: 'system',
			cursorKind: 'alternatingDays',
			initialCursor: JSON.stringify({
				kind: 'alternatingDays',
				nextDayId: 'A',
			}),
			days: {
				create: [
					{
						dayId: 'A',
						orderIndex: 0,
						workoutId: workout.id,
						workoutAuthorship: 'system',
					},
				],
			},
			liftRules: {
				create: [
					{
						exerciseId: options.exerciseId,
						equipment: null,
						orderIndex: 0,
						dayIds: JSON.stringify(['A']),
						setCount: 3,
						repsPerSet: 5,
						setWeightSources: JSON.stringify([
							{ kind: 'pctOfTrainingMax', pct: 75 },
							{ kind: 'pctOfTrainingMax', pct: 85 },
							{ kind: 'pctOfTrainingMax', pct: 95 },
						]),
						trigger: JSON.stringify({ kind: 'perCycle', weeksPerCycle: 3 }),
						successPredicate: JSON.stringify(options.successPredicate),
						increment: JSON.stringify({ kind: 'absolute', deltaKg: 2.5 }),
						stallsBeforeResponse: 1,
						stallResponse: JSON.stringify({
							kind: 'anchorReEstimate',
							estimator: 'epley',
							trainingMaxPct: 90,
						}),
						incrementAdjustmentOnStall: JSON.stringify({ kind: 'unchanged' }),
					},
				],
			},
		},
	})
	const started = await startProgram({
		userId: options.userId,
		programId,
		startedOn: new Date('2026-08-14T06:00:00Z'),
		startingWeights: [
			{
				exerciseId: options.exerciseId,
				equipment: null,
				weightKg: options.statedMaxKg,
			},
		],
	})
	if (!started.ok) throw new Error(`start failed: ${started.reason}`)
	return started.instanceId
}

/** Log one set per weight-and-rep pair, in the order given. `toFailure` is the
 * athlete's own statement about the set and defaults to absent, which is what a
 * log that says nothing about effort looks like. */
async function logSets(
	sessionId: string,
	exerciseId: string,
	sets: { weightKg: number; reps: number; toFailure?: boolean }[],
) {
	const step = await prisma.workoutStep.findFirstOrThrow({
		where: {
			exerciseId,
			block: { workout: { sessions: { some: { id: sessionId } } } },
		},
		select: { id: true },
	})
	for (const [orderIndex, set] of sets.entries()) {
		await prisma.exerciseSetLog.create({
			select: { id: true },
			data: {
				sessionId,
				stepId: step.id,
				exerciseId,
				orderIndex,
				role: 'working',
				outcome: 'completed',
				load: JSON.stringify({ kind: 'external', kg: set.weightKg }),
				effectiveKg: set.weightKg,
				reps: set.reps,
				toFailure: set.toFailure ?? false,
			},
		})
	}
}

test('a program whose sets are percentages of a training max is started with one', async () => {
	const userId = await createAthlete()
	const instanceId = await startFiveThreeOneShaped({
		userId,
		exerciseId: SQUAT,
		movementPattern: 'squat',
		statedMaxKg: 100,
		successPredicate: { kind: 'minRepsOnAmrapSet', minReps: 3 },
	})

	const lift = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { trainingMaxKg: true, workingFraction: true },
	})
	// The program's own published fraction of the stated max, with the fraction
	// stored visibly beside it rather than folded into the kilo.
	expect(lift.trainingMaxKg).toBe(90)
	expect(lift.workingFraction).toBe(0.9)

	// And the prescription resolves, which it cannot do without a training max.
	const opened = await openNextProgramSession({ userId, instanceId })
	expect(opened!.prescription.lifts[0]!.sets[0]!.weight).toMatchObject({
		kind: 'resolved',
		kg: 67.5,
	})
})

test('a stall on a percentage program performs an Anchor Re-estimate and lands a new training max', async () => {
	const userId = await createAthlete()
	const instanceId = await startFiveThreeOneShaped({
		userId,
		exerciseId: SQUAT,
		movementPattern: 'squat',
		statedMaxKg: 100,
		successPredicate: { kind: 'minRepsOnAmrapSet', minReps: 3 },
	})
	const opened = await openNextProgramSession({ userId, instanceId })
	// Two reps on the last set, where the program asks for three: 5/3/1's own
	// trigger for re-estimating the max off the number that was actually lifted.
	// Nothing here marks the set as taken to failure, and nothing needs to: the
	// program itself prescribes its last set as an AMRAP, which is what the
	// estimator's `toFailure` means — a plan, not an outcome.
	await logSets(opened!.sessionId, SQUAT, [
		{ weightKg: 67.5, reps: 5 },
		{ weightKg: 77.5, reps: 5 },
		{ weightKg: 85, reps: 2 },
	])

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)
	expect(outcome).toMatchObject({
		kind: 'stalled',
		response: 'anchorReEstimate',
		// The training max moved, not the working weight: saying "your squat
		// dropped" about a training max would be a lie.
		moved: 'trainingMax',
		fromKg: 90,
	})
	expect(outcome!.reason).toMatch(/2 reps at 85 kg re-estimates the 1RM/)
	// The convention is said out loud wherever the number is written.
	expect(outcome!.reason).toMatch(/no evidence base/)

	const lift = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { trainingMaxKg: true, workingFraction: true, stallHistory: true },
	})
	expect(lift.trainingMaxKg).not.toBe(90)
	// The number the athlete is told is the number that was written.
	const stalled = outcome!
	expect(lift.trainingMaxKg).toBe(
		stalled.kind === 'stalled' ? stalled.toKg : null,
	)
	expect(lift.workingFraction).toBe(0.9)
	expect(JSON.parse(lift.stallHistory)).toHaveLength(1)
})

test('a stall with no set the estimator may read refuses with the reason, and changes nothing', async () => {
	const userId = await createAthlete()
	const instanceId = await startFiveThreeOneShaped({
		userId,
		exerciseId: SQUAT,
		movementPattern: 'squat',
		statedMaxKg: 100,
		successPredicate: { kind: 'allRepsAllSets' },
	})
	const opened = await openNextProgramSession({ userId, instanceId })
	// The session is a miss — four reps where five were asked — and the only set
	// the re-estimate could read ran to twelve reps, above the range where these
	// equations are estimates at all.
	await logSets(opened!.sessionId, SQUAT, [
		{ weightKg: 67.5, reps: 5 },
		{ weightKg: 77.5, reps: 4 },
		{ weightKg: 85, reps: 12 },
	])

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)
	expect(outcome).toMatchObject({
		kind: 'stallResponseUnavailable',
		response: 'anchorReEstimate',
		// The count is kept, not reset: the condition that fired it is still true.
		stallCount: 1,
	})
	// A refusal that says why, and points at what would fix it.
	expect(outcome!.reason).toMatch(/above 10 reps/)

	const lift = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { trainingMaxKg: true, stallHistory: true },
	})
	expect(lift.trainingMaxKg).toBe(90)
	expect(JSON.parse(lift.stallHistory)).toEqual([])
})

test('a program whose last set is not an AMRAP refuses to re-estimate off a miss the athlete said nothing about', async () => {
	const userId = await createAthlete()
	const instanceId = await startFiveThreeOneShaped({
		userId,
		exerciseId: SQUAT,
		movementPattern: 'squat',
		statedMaxKg: 100,
		// The top set is the rule, and it is not printed as "as many reps as
		// possible" — so nobody planned to go to failure on it.
		successPredicate: { kind: 'allRepsOnTopSet' },
	})
	const opened = await openNextProgramSession({ userId, instanceId })
	// Four reps where five were asked: a miss, well inside the estimator's rep
	// gate, and with no reps-in-reserve and no to-failure mark on it.
	await logSets(opened!.sessionId, SQUAT, [
		{ weightKg: 67.5, reps: 5 },
		{ weightKg: 77.5, reps: 5 },
		{ weightKg: 85, reps: 4 },
	])

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	// Racking a set early is not taking it to failure, and a training max is not
	// reset off a guess about which one happened.
	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)
	expect(outcome).toMatchObject({
		kind: 'stallResponseUnavailable',
		response: 'anchorReEstimate',
	})
	expect(outcome!.reason).toMatch(/how close to failure/i)
	const lift = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { trainingMaxKg: true },
	})
	expect(lift.trainingMaxKg).toBe(90)
})

test('the same miss re-estimates once the athlete says the set was taken to failure', async () => {
	const userId = await createAthlete()
	const instanceId = await startFiveThreeOneShaped({
		userId,
		exerciseId: SQUAT,
		movementPattern: 'squat',
		statedMaxKg: 100,
		successPredicate: { kind: 'allRepsOnTopSet' },
	})
	const opened = await openNextProgramSession({ userId, instanceId })
	await logSets(opened!.sessionId, SQUAT, [
		{ weightKg: 67.5, reps: 5 },
		{ weightKg: 77.5, reps: 5 },
		{ weightKg: 85, reps: 4, toFailure: true },
	])

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)
	expect(outcome).toMatchObject({
		kind: 'stalled',
		response: 'anchorReEstimate',
		moved: 'trainingMax',
	})
})

test('a deadlift is estimated on the same basis by the program engine and by the propose surface', async () => {
	const userId = await createAthlete()
	const instanceId = await startFiveThreeOneShaped({
		userId,
		exerciseId: DEADLIFT,
		// The one pattern the equations were tested on and found to read low, which
		// is a weaker basis than the squat's and still a basis.
		movementPattern: 'hinge',
		statedMaxKg: 100,
		successPredicate: { kind: 'minRepsOnAmrapSet', minReps: 3 },
	})
	const opened = await openNextProgramSession({ userId, instanceId })
	await logSets(opened!.sessionId, DEADLIFT, [
		{ weightKg: 67.5, reps: 5, toFailure: true },
		{ weightKg: 77.5, reps: 5, toFailure: true },
		{ weightKg: 85, reps: 2, toFailure: true },
	])

	// What the propose surface says about this lift, off the very same sets.
	const proposal = await proposeExerciseOneRm(userId, DEADLIFT, {
		now: new Date('2026-08-17T10:00:00Z'),
	})
	const reading = proposal!.reading
	if (reading.kind !== 'estimate') throw new Error('expected an estimate')
	expect(proposal!.repLoadBasis).toBe('measured-biased')
	// A measured bias costs a grade, on both paths.
	expect(reading.confidence).toBe('low')

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
		now: new Date('2026-08-17T10:00:00Z'),
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	// The program engine served the estimate rather than refusing it, and it is
	// the same number, read from the same set, by the same equation, on the same
	// grade — one answer about one lift, not two.
	const outcome = recorded.outcomes.find((o) => o.exerciseId === DEADLIFT)
	expect(outcome).toMatchObject({
		kind: 'stalled',
		response: 'anchorReEstimate',
		moved: 'trainingMax',
	})
	expect(outcome!.reason).toContain(
		`The estimate is ${reading.valueKg} kg from 2 reps by epley, graded low.`,
	)
	// And the borrowing is said out loud where the number is shown.
	expect(outcome!.reason).toMatch(/underestimated it \(LeSuer 1997\)/)
})

test('a fold recorded before its outcomes were stored is restated rather than folded in again', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId)
	const opened = await openNextProgramSession({ userId, instanceId })
	await logLift(opened!.sessionId, SQUAT, 60, [5, 5, 5, 5, 5])
	await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})

	// What the migration's backfill leaves behind: the fact that this session was
	// folded in, with no answer kept and no time recorded, because neither was
	// ever written down.
	await prisma.programSessionApplication.updateMany({
		where: { instanceId, sessionId: opened!.sessionId },
		data: { appliedAt: null, outcomes: null },
	})

	const again = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!again.ok) throw new Error(`expected a fold: ${again.reason}`)

	expect(again.alreadyRecorded).toBe(true)
	const outcome = again.outcomes.find((o) => o.exerciseId === SQUAT)
	expect(outcome).toMatchObject({ kind: 'incremented', fromKg: 60, toKg: 62.5 })
	expect(outcome!.reason).toMatch(/Already folded in/)
	// And the guard held: the weight moved once, on the evidence of one session.
	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true, weightHistory: true },
	})
	expect(squat.currentWorkingWeightKg).toBe(62.5)
	expect(JSON.parse(squat.weightHistory)).toHaveLength(1)
})

test('opening a session stamps the resolved load onto the athlete’s own copy and leaves the shared day shape without a kilo', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)

	const opened = await openNextProgramSession({ userId, instanceId })
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: opened!.sessionId },
		select: {
			workoutId: true,
			workout: { select: { ownerId: true, copiedFromId: true } },
		},
	})

	// The session prescribes a row this athlete owns, and it says where it came
	// from — the shared shape, which is corpus content nothing here writes to.
	expect(session.workout!.ownerId).toBe(userId)
	expect(session.workout!.copiedFromId).toBe(
		'wk_prog_stronglifts_5x5_basic_day_a',
	)
	const stamped = await prisma.exerciseSet.findMany({
		where: {
			step: { exerciseId: SQUAT, block: { workoutId: session.workoutId! } },
		},
		select: { reps: true, weightKg: true },
	})
	expect(stamped).toHaveLength(5)
	expect(stamped.every((set) => set.reps === 5 && set.weightKg === 60)).toBe(
		true,
	)

	// And the shared shape still states reps and no load, so the next athlete to
	// open Workout A does not inherit this one's 60 kg.
	const shared = await prisma.exerciseSet.findMany({
		where: {
			step: {
				exerciseId: SQUAT,
				block: { workoutId: 'wk_prog_stronglifts_5x5_basic_day_a' },
			},
		},
		select: { reps: true, weightKg: true, load: true },
	})
	expect(shared).toHaveLength(5)
	expect(
		shared.every(
			(set) => set.reps === 5 && set.weightKg === null && set.load === null,
		),
	).toBe(true)
})

test('a session opened before the load was materialised is repointed at a stamped copy, unless sets were already logged against it', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)
	const dayShapeId = 'wk_prog_stronglifts_5x5_basic_day_a'

	// How a session opened by the previous version of this function looks: pointed
	// straight at the shared shape, and therefore prescribing no kilos.
	const legacy = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: dayShapeId,
			scheduledAt: new Date('2026-08-14T06:00:00Z'),
			source: 'generated',
		},
		select: { id: true },
	})

	const reopened = await openNextProgramSession({ userId, instanceId })
	expect(reopened!.sessionId).toBe(legacy.id)
	const upgraded = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: legacy.id },
		select: { workout: { select: { copiedFromId: true } } },
	})
	expect(upgraded.workout!.copiedFromId).toBe(dayShapeId)

	// A second session, this one with a set already logged against the shared
	// shape's Step: repointing it would strand that set outside the grid, so it
	// keeps the shape it has.
	const inProgress = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: dayShapeId,
			scheduledAt: new Date('2026-08-16T06:00:00Z'),
			source: 'generated',
		},
		select: { id: true },
	})
	await logLift(inProgress.id, SQUAT, 60, [5])
	await prisma.workoutSession.update({
		where: { id: legacy.id },
		data: { status: 'completed' },
		select: { id: true },
	})

	const again = await openNextProgramSession({ userId, instanceId })
	expect(again!.sessionId).toBe(inProgress.id)
	const untouched = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: inProgress.id },
		select: { workoutId: true },
	})
	expect(untouched.workoutId).toBe(dayShapeId)
})

// ——— The prescription the grid actually shows ————————————————————————————

/** What one lift's sets are stamped at on the session's own copy of the day
 * shape — the numbers the grid draws, read from the rows the grid reads. */
async function stampedKg(sessionId: string, exerciseId: string) {
	const sets = await prisma.exerciseSet.findMany({
		where: {
			step: {
				exerciseId,
				block: { workout: { sessions: { some: { id: sessionId } } } },
			},
		},
		orderBy: { orderIndex: 'asc' },
		select: { weightKg: true },
	})
	return sets.map((set) => set.weightKg)
}

test('reopening a session after the working weight changed shows the new weight in the grid', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 20)

	const first = await openNextProgramSession({ userId, instanceId })
	expect(await stampedKg(first!.sessionId, SQUAT)).toEqual([20, 20, 20, 20, 20])

	// *Save weight* on the overview, then reopen the very same session.
	await setWorkingWeight({
		userId,
		instanceId,
		exerciseId: SQUAT,
		equipment: BARBELL,
		weightKg: 60,
	})
	const reopened = await openNextProgramSession({ userId, instanceId })

	// The same session — a double tap is still not two workouts — and the same
	// weight on both surfaces. It used to hand back the copy stamped a moment
	// earlier, so the overview said 60 kg and the grid said 20 kg.
	expect(reopened!.sessionId).toBe(first!.sessionId)
	expect(await stampedKg(first!.sessionId, SQUAT)).toEqual([60, 60, 60, 60, 60])
	const overview = await getProgramOverview(userId, instanceId)
	const squatToday = overview!.today.lifts.find(
		(lift) => lift.exerciseId === SQUAT,
	)!
	expect(squatToday.sets[0]!.weight).toMatchObject({ kind: 'resolved', kg: 60 })
})

test('a session already being logged keeps the numbers it was opened with', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)
	const opened = await openNextProgramSession({ userId, instanceId })
	await logLift(opened!.sessionId, SQUAT, 60, [5])

	await setWorkingWeight({
		userId,
		instanceId,
		exerciseId: SQUAT,
		equipment: BARBELL,
		weightKg: 100,
	})
	const reopened = await openNextProgramSession({ userId, instanceId })

	// Re-stamping mid-session would move the target out from under a set the
	// athlete already logged against it.
	expect(reopened!.sessionId).toBe(opened!.sessionId)
	expect(await stampedKg(opened!.sessionId, SQUAT)).toEqual([
		60, 60, 60, 60, 60,
	])
})

test('a scheduled session left over from an ended run is not adopted by a new one', async () => {
	const userId = await createAthlete()
	const first = await startStrongLifts(userId, 60)
	const stale = await openNextProgramSession({ userId, instanceId: first })
	await endProgram(userId, first)

	// A second run of the same program, started later and at a different weight.
	const started = await startProgram({
		userId,
		programId: 'prog_stronglifts_5x5_basic',
		startedOn: new Date('2026-08-20T06:00:00Z'),
		startingWeights: [{ exerciseId: SQUAT, equipment: BARBELL, weightKg: 100 }],
	})
	if (!started.ok) throw new Error(`start failed: ${started.reason}`)
	const opened = await openNextProgramSession({
		userId,
		instanceId: started.instanceId,
		now: new Date('2026-08-20T06:00:00Z'),
	})

	// A brand-new run gets a brand-new session. Adopting the old one handed the
	// athlete a prescription from a program they had already stopped.
	expect(opened!.sessionId).not.toBe(stale!.sessionId)
	expect(await stampedKg(opened!.sessionId, SQUAT)).toEqual([
		100, 100, 100, 100, 100,
	])
	// And the run that was stopped opens nothing at all.
	expect(await openNextProgramSession({ userId, instanceId: first })).toBeNull()
})

test('a Stall Cut lands on a weight the athlete’s gym can actually load', async () => {
	const userId = await createAthlete()
	// A bar and plates that make 2.5 kg steps and nothing finer — the rack the
	// 20.25 kg prescription was impossible on.
	await prisma.athleteProfile.create({
		select: { id: true },
		data: {
			userId,
			plateInventories: {
				create: {
					name: 'My gym',
					isDefault: true,
					bars: JSON.stringify([{ label: 'Olympic', weightKg: 20 }]),
					plates: JSON.stringify([
						{ weightKg: 20, count: 4 },
						{ weightKg: 10, count: 2 },
						{ weightKg: 5, count: 2 },
						{ weightKg: 2.5, count: 2 },
						{ weightKg: 1.25, count: 2 },
					]),
					fixedDumbbellsKg: null,
				},
			},
		},
	})
	const instanceId = await startStrongLifts(userId, 22.5)

	for (let session = 0; session < 3; session++) {
		const opened = await openNextProgramSession({ userId, instanceId })
		await logLift(opened!.sessionId, SQUAT, 22.5, [5, 5, 5, 5, 3])
		await recordProgramSession({
			userId,
			instanceId,
			sessionId: opened!.sessionId,
		})
	}

	const overview = await getProgramOverview(userId, instanceId)
	const squat = overview!.lifts.find((lift) => lift.exerciseId === SQUAT)!
	// 10 % off 22.5 kg is 20.25 kg, which this rack — and every rack — cannot
	// make. The bar it can make is 20 kg, and that is what is prescribed.
	expect(squat.currentWorkingWeightKg).toBe(20)
	expect(squat.lastStall).toEqual({
		fromKg: 22.5,
		toKg: 20,
		response: 'stallCut',
	})

	// And the number the grid is stamped with is the same one.
	const next = await openNextProgramSession({ userId, instanceId })
	expect(await stampedKg(next!.sessionId, SQUAT)).toEqual([20, 20, 20, 20, 20])
})

test('a session logged lighter than prescribed does not move the weight, and says which two weights it read', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 62.5)
	const opened = await openNextProgramSession({ userId, instanceId })
	// The bar stripped to 20 kg, five perfect sets — the repro, end to end.
	await logLift(opened!.sessionId, SQUAT, 20, [5, 5, 5, 5, 5])

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)
	expect(outcome).toMatchObject({
		kind: 'liftedLighter',
		prescribedKg: 62.5,
		loggedKg: 20,
	})
	// The sentence names what was lifted and never claims the prescription.
	expect(outcome!.reason).toContain('20 kg')
	expect(outcome!.reason).not.toMatch(/every set at 62\.5 kg/)

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
	expect(JSON.parse(squat.weightHistory)).toEqual([])
})

/** One working set, at one index — so a test can log part of a session, change
 * something, and log the rest. */
async function logSet(input: {
	sessionId: string
	exerciseId: string
	orderIndex: number
	reps: number
	/** `null` is a set with **no honest kilo**: a machine stack level, which is
	 * what the athlete switched *How this is loaded* to in the repro. */
	weightKg: number | null
	level?: number
}) {
	const step = await prisma.workoutStep.findFirstOrThrow({
		where: {
			exerciseId: input.exerciseId,
			block: { workout: { sessions: { some: { id: input.sessionId } } } },
		},
		select: { id: true },
	})
	await prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId: input.sessionId,
			stepId: step.id,
			exerciseId: input.exerciseId,
			orderIndex: input.orderIndex,
			role: 'working',
			outcome: 'completed',
			load:
				input.weightKg == null
					? JSON.stringify({ kind: 'stackLevel', level: input.level ?? 3 })
					: JSON.stringify({ kind: 'external', kg: input.weightKg }),
			effectiveKg: input.weightKg,
			reps: input.reps,
		},
	})
}

test('a session is graded against the weight it was stamped with, not the weight the state moved to', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)
	const opened = await openNextProgramSession({ userId, instanceId })
	expect(await stampedKg(opened!.sessionId, SQUAT)).toEqual([
		60, 60, 60, 60, 60,
	])

	// The repro of FAIL B: one set logged at what the grid asked for, then *Save
	// weight* on the overview, then the rest of the session at the same 60 kg the
	// grid — frozen at its stamp, correctly — is still asking for.
	await logSet({
		sessionId: opened!.sessionId,
		exerciseId: SQUAT,
		orderIndex: 0,
		reps: 5,
		weightKg: 60,
	})
	await setWorkingWeight({
		userId,
		instanceId,
		exerciseId: SQUAT,
		equipment: BARBELL,
		weightKg: 90,
	})
	for (const orderIndex of [1, 2, 3, 4]) {
		await logSet({
			sessionId: opened!.sessionId,
			exerciseId: SQUAT,
			orderIndex,
			reps: 5,
			weightKg: 60,
		})
	}
	// The stamp is untouched by the change, which is the point: re-stamping under
	// logged sets would move the target out from under them.
	expect(await stampedKg(opened!.sessionId, SQUAT)).toEqual([
		60, 60, 60, 60, 60,
	])

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)!
	// It matched the screen, so it is credited — and from the 60 kg it was run at.
	// The engine used to grade it against live state and answer "logged at 60 kg,
	// not the 90 kg 5×5 it prescribed" about a prescription never shown.
	expect(outcome).toMatchObject({ kind: 'incremented', fromKg: 60, toKg: 62.5 })
	expect(outcome.reason).not.toMatch(/not the 90 kg/)
	expect(outcome.reason).toContain('stamped at 60 kg')

	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true, weightHistory: true },
	})
	expect(squat.currentWorkingWeightKg).toBe(62.5)
	// The history records the weight the athlete actually lifted, which is the one
	// field no set log can re-derive.
	expect(JSON.parse(squat.weightHistory)).toEqual([
		{ sessionId: opened!.sessionId, weightKg: 60, succeeded: true },
	])
})

test('a kilo-priced lift logged with no honest kilo is unverifiable, and nothing moves', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 90)
	const opened = await openNextProgramSession({ userId, instanceId })

	// FAIL A, end to end: 90 kg on the grid, *How this is loaded* switched to
	// Machine level, 5×5 logged at level 3 with no `effectiveKg` on any row.
	for (const orderIndex of [0, 1, 2, 3, 4]) {
		await logSet({
			sessionId: opened!.sessionId,
			exerciseId: SQUAT,
			orderIndex,
			reps: 5,
			weightKg: null,
		})
	}

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)!
	expect(outcome).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 90,
		weightKg: 90,
	})
	expect(outcome.reason).toContain('neither a success nor a miss')
	// The app used to answer "90 kg → 92.5 kg (5×5 completed)".
	expect(outcome.reason).not.toContain('92.5')

	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: {
			currentWorkingWeightKg: true,
			stallCount: true,
			weightHistory: true,
		},
	})
	expect(squat.currentWorkingWeightKg).toBe(90)
	expect(squat.stallCount).toBe(0)
	// **90 kg existed nowhere in the log**, so it goes nowhere in the history.
	expect(JSON.parse(squat.weightHistory)).toEqual([])
})

test('the overview states the open session’s own stamped weight rather than the working weight it was changed to', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)
	const opened = await openNextProgramSession({ userId, instanceId })
	await logSet({
		sessionId: opened!.sessionId,
		exerciseId: SQUAT,
		orderIndex: 0,
		reps: 5,
		weightKg: 60,
	})
	await setWorkingWeight({
		userId,
		instanceId,
		exerciseId: SQUAT,
		equipment: BARBELL,
		weightKg: 50,
	})

	const overview = await getProgramOverview(userId, instanceId)
	// The grid is frozen at 60 kg and it is the number the athlete is lifting to,
	// so the overview's Today line says 60 too — it used to say 50 while the grid
	// one tap away said 60, with neither labelled.
	expect(overview!.openSessionId).toBe(opened!.sessionId)
	const squatToday = overview!.today.lifts.find(
		(lift) => lift.exerciseId === SQUAT,
	)!
	expect(squatToday.sets[0]!.weight).toMatchObject({
		kind: 'resolved',
		kg: 60,
		basis: 'the weight this session was stamped with',
	})
	// And the live working weight is still stated as its own distinct number,
	// under *Your weights*, where changing it belongs.
	expect(
		overview!.lifts.find((lift) => lift.exerciseId === SQUAT)!
			.currentWorkingWeightKg,
	).toBe(50)
})

test('the program list leads with the best-known beginner program rather than sorting alphabetically', async () => {
	await seedStrengthPrograms(prisma)

	const listed = await listPrograms()

	expect(listed.map((program) => program.name)).toEqual([
		'StrongLifts 5×5',
		'Starting Strength',
		'GreySkull LP',
	])
})

// ——— The overview and the grid, on one open session ———————————————————————

test('the overview quotes an open session’s stamp from the moment it is opened, not from its first logged set', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)
	const opened = await openNextProgramSession({ userId, instanceId })
	expect(await stampedKg(opened!.sessionId, SQUAT)).toEqual([
		60, 60, 60, 60, 60,
	])

	// The athlete saves a different weight by hand and does not log a single set.
	await setWorkingWeight({
		userId,
		instanceId,
		exerciseId: SQUAT,
		equipment: BARBELL,
		weightKg: 150,
	})
	const overview = await getProgramOverview(userId, instanceId)

	// The open session's `setLogs: { some: {} }` condition used to hide this
	// session, so the overview live-resolved and said "5×5 @ 150 kg" while the
	// grid one tap away asked for 60. The stamp exists from the moment the session
	// is opened, so it is honoured from that moment.
	expect(overview!.openSessionId).toBe(opened!.sessionId)
	expect(overview!.openSessionHasLoggedSets).toBe(false)
	const squatToday = overview!.today.lifts.find(
		(lift) => lift.exerciseId === SQUAT,
	)!
	expect(squatToday.sets[0]!.weight).toMatchObject({ kind: 'resolved', kg: 60 })
	// And *Your weights* still says the athlete's own number, because that is a
	// different question with a different answer.
	expect(
		overview!.lifts.find((lift) => lift.exerciseId === SQUAT)!
			.currentWorkingWeightKg,
	).toBe(150)

	// One logged set is what freezes that stamp, and it is reported separately so
	// the surface can say which of the two consequences the athlete is getting.
	await logLift(opened!.sessionId, SQUAT, 60, [5])
	const withASet = await getProgramOverview(userId, instanceId)
	expect(withASet!.openSessionHasLoggedSets).toBe(true)
})

// ——— A lift with no honest kilo, as production can actually reach it ————————

/** Five working sets logged as a **machine stack level** — an ordinal, so no
 * `effectiveKg` at all (ADR 0056 §3). */
async function logStackLevels(
	sessionId: string,
	exerciseId: string,
	level: number,
) {
	const step = await prisma.workoutStep.findFirstOrThrow({
		where: {
			exerciseId,
			block: { workout: { sessions: { some: { id: sessionId } } } },
		},
		select: { id: true },
	})
	for (const orderIndex of [0, 1, 2, 3, 4]) {
		await prisma.exerciseSetLog.create({
			data: {
				sessionId,
				stepId: step.id,
				exerciseId,
				orderIndex,
				role: 'working',
				outcome: 'completed',
				load: JSON.stringify({ kind: 'stackLevel', level }),
				effectiveKg: null,
				reps: 5,
			},
			select: { id: true },
		})
	}
}

/**
 * Log one lift's working sets under an arbitrary `LoadValue`, with the
 * `effectiveKg` the log surface would have baked at the time — which is the whole
 * point: a bodyweight set stores a **real kilo**, of the athlete rather than the
 * bar, and that kilo is what the fold used to grade.
 */
async function logLiftAs(
	sessionId: string,
	exerciseId: string,
	load: object,
	effectiveKg: number | null,
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
				load: JSON.stringify(load),
				effectiveKg,
				reps,
			},
			select: { id: true },
		})
	}
}

test('a barbell lift logged as a bodyweight load is unverifiable through the real stamp and query, and nothing moves', async () => {
	// **The browser repro, end to end.** A barbell squat prescribed 60 kg, five
	// sets logged with *How this is loaded* set to Bodyweight — which bakes the
	// athlete's own 74 kg into `effectiveKg`. 74 ≥ 60, so the load axis passed and
	// the app published "Back Squat 74 kg → 77.5 kg", wrote
	// `{"weightKg":74,"succeeded":true}` to `weightHistory` and moved the working
	// weight — while the same paragraph said the 74 kg was "not a weight on the
	// bar". Prisma is never mocked here because the defect lived in the round trip:
	// the kilo comes back off `effectiveKg` and the kind off the `load` column.
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)
	const opened = await openNextProgramSession({ userId, instanceId })
	await logLiftAs(
		opened!.sessionId,
		SQUAT,
		{ kind: 'bodyweight' },
		74,
		[5, 5, 5, 5, 5],
	)

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)!
	expect(outcome).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 60,
		standsAtKg: 60,
		unreadableSetCount: 5,
		gradedSetCount: 5,
		loggedLoadKind: 'bodyweight',
		unreadableReason: 'bodyweightDerived',
	})
	// The athlete is told which kind was logged and why it cannot be read.
	expect(outcome.reason).toContain('logged as a bodyweight load')
	expect(outcome.reason).toContain('not a weight on the bar')
	// And nothing moved — not the weight, and not the one piece of state no set log
	// can re-derive.
	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true, weightHistory: true },
	})
	expect(squat.currentWorkingWeightKg).toBe(60)
	expect(JSON.parse(squat.weightHistory)).toEqual([])
})

test('a lift logged on the assisted machine is unverifiable through the real stamp and query, because its number means less work as it grows', async () => {
	// The second live instance: `{"kind":"assisted","assistKg":10}`, whose
	// `effectiveKg` is the athlete's 74 kg minus the 10 the machine took off. The
	// panel said "Overhead Press 64 kg → 67.5 kg / Every rep of every set at 64 kg"
	// with **no caveat at all** — and the sign is the point: a bigger assist is
	// less work, so read as a bar weight this number moves the wrong way.
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)
	const opened = await openNextProgramSession({ userId, instanceId })
	await logLiftAs(
		opened!.sessionId,
		BENCH,
		{ kind: 'assisted', assistKg: 10 },
		64,
		[5, 5, 5, 5, 5],
	)

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === BENCH)!
	expect(outcome).toMatchObject({
		kind: 'unverifiable',
		// The bench starts at StrongLifts' own empty bar, and stays there.
		prescribedKg: 20,
		standsAtKg: 20,
		loggedLoadKind: 'assisted',
		unreadableReason: 'assistInverted',
	})
	expect(outcome.reason).toContain('how much the machine took')
	const bench = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: BENCH },
		select: { currentWorkingWeightKg: true, weightHistory: true },
	})
	expect(bench.currentWorkingWeightKg).toBe(20)
	expect(JSON.parse(bench.weightHistory)).toEqual([])
})

test('a program lift logged as a machine stack level is told the session could not be read, and that a stack lift cannot progress in a program yet', async () => {
	// **The honest replacement for a falsely-green test.** The engine can express
	// "neither side has a kilo, so the reps are the whole of what can be read", and
	// a unit test used to prove it by injecting a stamped prescription of five
	// `null`s. Nothing in production can produce that:
	// `ProgramLiftState.currentWorkingWeightKg` is a non-null kilo and
	// `readStampedPrescription` folds an all-null stamp back to it.
	//
	// So this is what production does, through the real query and the real stamp:
	// the lift is priced at 60 kg, the log has no kilos, and the fold refuses. It is
	// a stated gap, and the sentence names it as one.
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)
	const opened = await openNextProgramSession({ userId, instanceId })
	await logStackLevels(opened!.sessionId, SQUAT, 6)

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)!
	expect(outcome).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 60,
		// Where the lift stands, read off the lift state — unmoved.
		standsAtKg: 60,
		unreadableSetCount: 5,
		gradedSetCount: 5,
	})
	// The gap, named as a gap in the app rather than a verdict on the athlete.
	expect(outcome.reason).toContain('cannot progress inside a program yet')
	// And nothing moved: no invented kilo, and no invented level either.
	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true, weightHistory: true },
	})
	expect(squat.currentWorkingWeightKg).toBe(60)
	expect(JSON.parse(squat.weightHistory)).toEqual([])
})

// ——— The stored kilo, and the row a re-estimate was read off ————————————————

test('a session whose stored kilo does not follow from its load is neither a success nor a miss', async () => {
	const userId = await createAthlete()
	const instanceId = await startStrongLifts(userId, 60)
	const opened = await openNextProgramSession({ userId, instanceId })
	const step = await prisma.workoutStep.findFirstOrThrow({
		where: {
			exerciseId: SQUAT,
			block: { workout: { sessions: { some: { id: opened!.sessionId } } } },
		},
		select: { id: true },
	})
	// Five sets of five at the prescribed 60 kg — except that one row's baked kilo
	// says 300. `saveLoggedSet` cannot write that pair; a hand-written row can, and
	// every reader used to believe it.
	for (const orderIndex of [0, 1, 2, 3, 4]) {
		await prisma.exerciseSetLog.create({
			select: { id: true },
			data: {
				sessionId: opened!.sessionId,
				stepId: step.id,
				exerciseId: SQUAT,
				orderIndex,
				role: 'working',
				outcome: 'completed',
				load: JSON.stringify({ kind: 'external', kg: 60 }),
				effectiveKg: orderIndex === 2 ? 300 : 60,
				reps: 5,
			},
		})
	}

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)
	// Unreadable, so nothing moves — not the weight, not the Stall Count, and
	// above all not the weight history, which no set log can re-derive.
	expect(outcome).toMatchObject({
		kind: 'unverifiable',
		unreadableReason: 'kiloContradictsLoad',
	})
	// And it says which sentence applies, rather than claiming no kilos were
	// logged about a row that recorded 300 kg.
	expect(outcome!.reason).toMatch(/does not follow from the load/)

	const lift = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true, weightHistory: true },
	})
	expect(lift.currentWorkingWeightKg).toBe(60)
	expect(JSON.parse(lift.weightHistory)).toHaveLength(0)
})

test('the source set of a re-estimate is the row that was read, not a row that happens to share its number', async () => {
	const userId = await createAthlete()
	const instanceId = await startFiveThreeOneShaped({
		userId,
		exerciseId: SQUAT,
		movementPattern: 'squat',
		statedMaxKg: 100,
		successPredicate: { kind: 'minRepsOnAmrapSet', minReps: 3 },
	})
	const opened = await openNextProgramSession({ userId, instanceId })
	// The session the estimator reads is the last set: 2 reps at 85 kg on the bar.
	// Standing earlier in the same session is a set with **the same numbers and a
	// different identity** — 42.5 kg in each hand is the same 85 kg effective, and
	// per-hand kilos are not weights on a bar. Matching the source row by its
	// number hands the barbell set's provenance to the dumbbell one, and the
	// re-estimate then refuses on a load kind the graded set never had.
	await logSets(opened!.sessionId, SQUAT, [
		{ weightKg: 67.5, reps: 5 },
		{ weightKg: 77.5, reps: 5 },
	])
	const step = await prisma.workoutStep.findFirstOrThrow({
		where: {
			exerciseId: SQUAT,
			block: { workout: { sessions: { some: { id: opened!.sessionId } } } },
		},
		select: { id: true },
	})
	await prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId: opened!.sessionId,
			stepId: step.id,
			exerciseId: SQUAT,
			orderIndex: 2,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'perSide', kg: 42.5, sides: 2 }),
			effectiveKg: 85,
			reps: 2,
		},
	})
	await prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId: opened!.sessionId,
			stepId: step.id,
			exerciseId: SQUAT,
			orderIndex: 3,
			load: JSON.stringify({ kind: 'external', kg: 85 }),
			role: 'working',
			outcome: 'completed',
			effectiveKg: 85,
			reps: 2,
		},
	})

	const recorded = await recordProgramSession({
		userId,
		instanceId,
		sessionId: opened!.sessionId,
	})
	if (!recorded.ok) throw new Error(`expected a fold: ${recorded.reason}`)

	const outcome = recorded.outcomes.find((o) => o.exerciseId === SQUAT)
	// The re-estimate reads the set it graded, so it lands a training max rather
	// than refusing on the decoy's per-hand load.
	expect(outcome).toMatchObject({
		kind: 'stalled',
		response: 'anchorReEstimate',
		moved: 'trainingMax',
		fromKg: 90,
	})
	expect(outcome!.reason).toMatch(/2 reps at 85 kg re-estimates the 1RM/)

	const lift = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { trainingMaxKg: true },
	})
	expect(lift.trainingMaxKg).not.toBe(90)
})
