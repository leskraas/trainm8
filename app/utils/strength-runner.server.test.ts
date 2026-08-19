import { expect, test } from 'vitest'
import { buildTargetText } from '#app/routes/training/__runner-presenter.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import { getStrengthLogView, saveLoggedSet } from './strength-log.server.ts'
import {
	PROGRAM_LIFT_EQUIPMENT,
	PROGRAM_LIFT_EXERCISE_IDS,
	seedStrengthPrograms,
} from './strength-program-seed.server.ts'
import {
	openNextProgramSession,
	startProgram,
} from './strength-program.server.ts'
import {
	getExerciseHistoryView,
	performedSetsForExercise,
} from './strength-records.server.ts'
import { finishStrengthSession } from './strength-runner.server.ts'

const SQUAT = PROGRAM_LIFT_EXERCISE_IDS.squat
/** The realization StrongLifts states — the second half of the progression key. */
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

async function startRunAndOpenSession(userId: string, squatKg = 60) {
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
	const opened = await openNextProgramSession({
		userId,
		instanceId: started.instanceId,
	})
	if (!opened) throw new Error('expected a session')
	return { instanceId: started.instanceId, sessionId: opened.sessionId }
}

async function logLift(
	sessionId: string,
	exerciseId: string,
	weightKg: number,
	repsPerSet: number[],
	role: 'working' | 'warmup' = 'working',
	orderIndexBase = 0,
) {
	const step = await prisma.workoutStep.findFirstOrThrow({
		where: {
			exerciseId,
			block: { workout: { sessions: { some: { id: sessionId } } } },
		},
		select: { id: true },
	})
	for (const [index, reps] of repsPerSet.entries()) {
		await prisma.exerciseSetLog.create({
			data: {
				sessionId,
				stepId: step.id,
				exerciseId,
				orderIndex: orderIndexBase + index,
				role,
				outcome: 'completed',
				load: JSON.stringify({ kind: 'external', kg: weightKg }),
				effectiveKg: weightKg,
				reps,
			},
			select: { id: true },
		})
	}
}

test('finishing is an explicit act that marks the session completed', async () => {
	const userId = await createAthlete()
	const { sessionId } = await startRunAndOpenSession(userId)
	await logLift(sessionId, SQUAT, 60, [5, 5, 5, 5, 5])

	const before = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { status: true },
	})
	// Logging every set does *not* move the column — the sets are the truth and
	// nothing infers the athlete's day is over.
	expect(before.status).toBe('scheduled')

	const finished = await finishStrengthSession({ userId, sessionId })

	expect(finished.ok).toBe(true)
	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { status: true },
	})
	expect(after.status).toBe('completed')
})

test('a session with nothing logged cannot be finished, so the column cannot disagree with the sets', async () => {
	const userId = await createAthlete()
	const { sessionId } = await startRunAndOpenSession(userId)

	const refused = await finishStrengthSession({ userId, sessionId })

	expect(refused).toEqual({ ok: false, reason: 'nothing-logged' })
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { status: true },
	})
	expect(session.status).toBe('scheduled')
})

test('a warm-up alone is not a finished session, because no aggregate counts one', async () => {
	const userId = await createAthlete()
	const { sessionId } = await startRunAndOpenSession(userId)
	await logLift(sessionId, SQUAT, 20, [5, 5], 'warmup', 1000)

	expect(await finishStrengthSession({ userId, sessionId })).toEqual({
		ok: false,
		reason: 'nothing-logged',
	})
})

test('finishing folds the log into the program, so the next session’s weight moved', async () => {
	const userId = await createAthlete()
	const { instanceId, sessionId } = await startRunAndOpenSession(userId)
	await logLift(sessionId, SQUAT, 60, [5, 5, 5, 5, 5])

	const finished = await finishStrengthSession({ userId, sessionId })
	if (!finished.ok) throw new Error('expected a finish')

	expect(finished.programName).toBe('StrongLifts 5×5')
	const squat = finished.outcomes.find((o) => o.exerciseId === SQUAT)
	expect(squat?.kind).toBe('incremented')

	// The state moved, and it moved from what was *logged* rather than from what
	// the form posted.
	const lift = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true },
	})
	expect(lift.currentWorkingWeightKg).toBeGreaterThan(60)
})

test('another athlete cannot finish this athlete’s session', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const { sessionId } = await startRunAndOpenSession(owner)
	await logLift(sessionId, SQUAT, 60, [5, 5, 5, 5, 5])

	expect(await finishStrengthSession({ userId: stranger, sessionId })).toEqual({
		ok: false,
		reason: 'not-found',
	})
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { status: true },
	})
	expect(session.status).toBe('scheduled')
})

test('a session that belongs to no running program finishes and advances nothing', async () => {
	const userId = await createAthlete()
	const { instanceId, sessionId } = await startRunAndOpenSession(userId)
	await logLift(sessionId, SQUAT, 60, [5, 5, 5, 5, 5])
	// The athlete stopped the run: a stopped program is not advanced by a session
	// logged under it.
	await prisma.programInstance.update({
		where: { id: instanceId },
		// The schema's own rule: an ended run has an end date.
		data: { status: 'ended', endedAt: new Date('2026-08-14T10:00:00Z') },
		select: { id: true },
	})

	const finished = await finishStrengthSession({ userId, sessionId })
	if (!finished.ok) throw new Error('expected a finish')

	expect(finished.outcomes).toEqual([])
	expect(finished.programName).toBeNull()
	const lift = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true },
	})
	expect(lift.currentWorkingWeightKg).toBe(60)
})

// ——— Finishing happens once ——————————————————————————————————————————————

/** Three misses in a row on the squat — the third session is the one the Stall
 * Cut fires on, which is the session worth double-tapping. */
async function missUntilTheStall(userId: string) {
	await seedStrengthPrograms(prisma)
	const started = await startProgram({
		userId,
		programId: 'prog_stronglifts_5x5_basic',
		startedOn: new Date('2026-08-14T06:00:00Z'),
		startingWeights: [{ exerciseId: SQUAT, equipment: BARBELL, weightKg: 100 }],
	})
	if (!started.ok) throw new Error(`start failed: ${started.reason}`)
	let sessionId = ''
	for (let session = 0; session < 3; session++) {
		const opened = await openNextProgramSession({
			userId,
			instanceId: started.instanceId,
		})
		if (!opened) throw new Error('expected a session')
		await logLift(opened.sessionId, SQUAT, 100, [5, 5, 5, 5, 3])
		sessionId = opened.sessionId
		// Every session but the last is finished here; the last one is the one the
		// test finishes, twice.
		if (session < 2) await finishStrengthSession({ userId, sessionId })
	}
	return { instanceId: started.instanceId, sessionId }
}

test('finishing a session twice advances the program once', async () => {
	const userId = await createAthlete()
	const { instanceId, sessionId } = await missUntilTheStall(userId)

	await finishStrengthSession({ userId, sessionId })
	await finishStrengthSession({ userId, sessionId })

	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: {
			currentWorkingWeightKg: true,
			stallCount: true,
			weightHistory: true,
			stallHistory: true,
		},
	})
	// The histories are the assertion that matters: a working weight can look
	// right while the evidence under it says the same session twice, and the
	// history is the one piece of state no set log can re-derive.
	expect(JSON.parse(squat.weightHistory)).toHaveLength(3)
	expect(JSON.parse(squat.stallHistory)).toHaveLength(1)
	expect(squat.currentWorkingWeightKg).toBe(90)
	expect(squat.stallCount).toBe(0)
})

test('a session put back to scheduled and finished again still advances the program once', async () => {
	const userId = await createAthlete()
	const { instanceId, sessionId } = await missUntilTheStall(userId)

	await finishStrengthSession({ userId, sessionId })
	// Whatever moves this column — a re-open, a repair, another surface — it is not
	// what decides whether the log has been folded in, so moving it cannot let the
	// same session cut the weight a second time.
	await prisma.workoutSession.update({
		where: { id: sessionId },
		data: { status: 'scheduled' },
		select: { id: true },
	})
	const second = await finishStrengthSession({ userId, sessionId })
	if (!second.ok) throw new Error('expected a finish')

	expect(second.alreadyFinished).toBe(true)
	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: {
			currentWorkingWeightKg: true,
			weightHistory: true,
			stallHistory: true,
		},
	})
	expect(JSON.parse(squat.weightHistory)).toHaveLength(3)
	expect(JSON.parse(squat.stallHistory)).toHaveLength(1)
	expect(squat.currentWorkingWeightKg).toBe(90)
})

test('a second finish returns the first finish’s outcomes rather than an error', async () => {
	const userId = await createAthlete()
	const { sessionId } = await missUntilTheStall(userId)

	const first = await finishStrengthSession({ userId, sessionId })
	const second = await finishStrengthSession({ userId, sessionId })
	if (!first.ok || !second.ok) throw new Error('expected two finishes')

	// Not an error, and it says which of the two it was.
	expect(first.alreadyFinished).toBe(false)
	expect(second.alreadyFinished).toBe(true)
	expect(second.programName).toBe(first.programName)

	// **Identical, not merely equivalent** — the same lifts, the same verdicts, the
	// same numbers, the same sentences and the same timestamps. The first fold's
	// answer is stored, so the second finish replays it rather than rebuilding one
	// that agrees about the numbers and paraphrases the reasons.
	expect(second.outcomes).toEqual(first.outcomes)
	expect(
		first.outcomes.find((outcome) => outcome.exerciseId === SQUAT),
	).toMatchObject({ kind: 'stalled', fromKg: 100, toKg: 90 })
})

// ——— The writer and the reader, in one test ———————————————————————————————
//
// Every test above logs its sets with a bare `prisma.exerciseSetLog.create`,
// which is what let StrongLifts ship structurally unrunnable: the production
// **writer** stamps the logged set's **Exercise Variant** and the production
// **reader** matched on equipment, and the two never met. `'barbell'` on the log
// against NULL on the rule dropped all fifteen sets, `progressionSets` returned
// nothing, and the outcome panel said *"No working sets were logged for this
// lift, so nothing moved"* while the athlete was looking at fifteen logged sets.
//
// So these two go through the real save path and the real fold, and nothing in
// between is hand-written.

/** The athlete's own bodyweight row and a rack that can make the numbers — what
 * a plate line and a warm-up ramp both need on file before they can say
 * anything. */
async function createProfileAndGym(userId: string) {
	const profile = await prisma.athleteProfile.create({
		data: { userId, weightKg: 80 },
		select: { id: true },
	})
	await prisma.plateInventory.create({
		data: {
			athleteProfileId: profile.id,
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
		select: { id: true },
	})
}

/** Log every prescribed working set of one lift **the way the runner logs one**:
 * through `saveLoggedSet`, at the weight the grid is showing, with the variant
 * stamped by the writer rather than by this test. */
async function logLiftThroughTheRunner(
	userId: string,
	sessionId: string,
	exerciseId: string,
	repsPerSet: number[],
) {
	const view = await getStrengthLogView(userId, sessionId)
	if (!view) throw new Error('expected a log view')
	const exercise = view.exercises.find((e) => e.exerciseId === exerciseId)
	if (!exercise) throw new Error(`no ${exerciseId} in this session`)
	for (const [index, reps] of repsPerSet.entries()) {
		const row = exercise.rows[index]
		const resolved = row?.resolvedLoad
		if (resolved?.kind !== 'resolved') {
			throw new Error(`row ${index} has no kilo to lift`)
		}
		const saved = await saveLoggedSet({
			athleteId: userId,
			sessionId,
			stepId: exercise.stepId,
			orderIndex: index,
			role: 'working',
			outcome: 'completed',
			toFailure: false,
			load: { kind: 'external', kg: resolved.kg },
			reps,
			repsLeft: null,
			durationSec: null,
			rir: null,
			restTakenSec: null,
		})
		if (!saved.ok) throw new Error(`save failed: ${saved.reason}`)
	}
}

test('the first session of a run tells the athlete what to put on the bar, with no history to read it from', async () => {
	const userId = await createAthlete()
	await createProfileAndGym(userId)
	const { sessionId } = await startRunAndOpenSession(userId, 60)

	const view = await getStrengthLogView(userId, sessionId)
	const squat = view!.exercises.find((e) => e.exerciseId === SQUAT)!

	// Five prescribed sets, and every one of them states a kilo. Session one has
	// no Set Ghost to fall back on, so a grid that said only "5 reps" would leave
	// the athlete with nowhere to read the weight off.
	expect(squat.rows).toHaveLength(5)
	expect(squat.rows[0]!.prescribedReps).toBe(5)
	expect(squat.rows[0]!.resolvedLoad).toMatchObject({
		kind: 'resolved',
		kg: 60,
	})
	expect(buildTargetText(squat.rows[0]!)).toBe('5 reps · 60 kg')

	// And the warm-up ramp lights up, because it is computed off that same working
	// weight — an empty bar first, and never a rung heavier than the work.
	expect(squat.warmupRows.length).toBeGreaterThanOrEqual(3)
	expect(squat.warmupRows[0]!.warmupRung!.targetKg).toBe(20)
	expect(squat.warmupRows.at(-1)!.warmupRung!.targetKg).toBeLessThan(60)
})

test('sets logged through the runner’s own save path move the working weight, because the writer and the reader key on the same equipment', async () => {
	const userId = await createAthlete()
	await createProfileAndGym(userId)
	const { instanceId, sessionId } = await startRunAndOpenSession(userId, 60)

	await logLiftThroughTheRunner(userId, sessionId, SQUAT, [5, 5, 5, 5, 5])

	// The writer really did stamp the variant — which is the fact that broke the
	// fold, and the reason this test is not equivalent to one that creates rows.
	const stamped = await prisma.exerciseSetLog.findMany({
		where: { sessionId, exerciseId: SQUAT },
		select: { variantId: true, variant: { select: { equipment: true } } },
	})
	expect(stamped).toHaveLength(5)
	for (const log of stamped) {
		expect(log.variantId).not.toBeNull()
		expect(log.variant!.equipment).toBe(BARBELL)
	}

	const finished = await finishStrengthSession({ userId, sessionId })
	if (!finished.ok) throw new Error('expected a finish')

	// Twenty-five of twenty-five: the squat goes up, and nothing is "skipped".
	expect(
		finished.outcomes.find((outcome) => outcome.exerciseId === SQUAT),
	).toMatchObject({ kind: 'incremented', fromKg: 60, toKg: 62.5 })
	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true, equipment: true },
	})
	expect(squat.currentWorkingWeightKg).toBe(62.5)
	// Stated on the athlete's own row too, so the unique triple carries no NULL.
	expect(squat.equipment).toBe(BARBELL)

	// And the next session is opened at the weight that moved, so the athlete
	// reads the new number off the grid rather than off the run page.
	const next = await openNextProgramSession({ userId, instanceId })
	const nextView = await getStrengthLogView(userId, next!.sessionId)
	expect(
		nextView!.exercises.find((e) => e.exerciseId === SQUAT)!.rows[0]!
			.resolvedLoad,
	).toMatchObject({ kind: 'resolved', kg: 62.5 })
})

test('a logged set records which realization it was, so changing a variant later cannot rekey it', async () => {
	const userId = await createAthlete()
	await createProfileAndGym(userId)
	const { instanceId, sessionId } = await startRunAndOpenSession(userId, 60)

	await logLiftThroughTheRunner(userId, sessionId, SQUAT, [5, 5, 5, 5, 5])

	// The writer stamps **both halves of the progression key** on the row: the
	// variant it was lifted on, and the equipment that variant is. The second one is
	// the fix — until it existed, every reader derived it from `variant.equipment` at
	// read time, which made the key a function of a row that can still change.
	const stamped = await prisma.exerciseSetLog.findMany({
		where: { sessionId, exerciseId: SQUAT },
		select: { variantId: true, equipment: true },
	})
	expect(stamped).toHaveLength(5)
	for (const log of stamped) {
		expect(log.variantId).not.toBeNull()
		expect(log.equipment).toBe(BARBELL)
	}

	// **The one statement that used to rewrite eight sessions of history.** Written
	// straight to the row, the way an import or a `sqlite3` session would — around
	// the write path's refusal, which is exactly why the stamp and not the refusal is
	// the fix.
	await prisma.exerciseVariant.update({
		where: { id: stamped[0]!.variantId! },
		data: { equipment: 'dumbbell' },
	})

	// The history is still filed under the barbell: one bucket, five sets, and no
	// dumbbell tab for a dumbbell day that never happened.
	// The reading is taken **after** the session's own day, because every line of
	// this payload is scoped by `hasHappenedBy` — a session in the future is not
	// history yet, and that is a different question from this one.
	const { scheduledAt } = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { scheduledAt: true },
	})
	const view = await getExerciseHistoryView(userId, SQUAT, {
		now: new Date(scheduledAt.getTime() + 60_000),
	})
	expect(view!.variants).toEqual([
		expect.objectContaining({ equipment: BARBELL, sessionCount: 1 }),
	])
	expect(
		(await performedSetsForExercise(userId, SQUAT)).map((set) => set.equipment),
	).toEqual([BARBELL, BARBELL, BARBELL, BARBELL, BARBELL])

	// And the program still folds them in, because the barbell rule and the barbell
	// stamp still meet. Reading the variant here is what made the fold return
	// `skipped` and left the working weight where it was.
	const finished = await finishStrengthSession({ userId, sessionId })
	if (!finished.ok) throw new Error('expected a finish')
	expect(
		finished.outcomes.find((outcome) => outcome.exerciseId === SQUAT),
	).toMatchObject({ kind: 'incremented', fromKg: 60, toKg: 62.5 })
	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true },
	})
	expect(squat.currentWorkingWeightKg).toBe(62.5)
})

test('a rule that states no equipment still folds in a set that names one, because the leniency is the rule’s to state', async () => {
	const userId = await createAthlete()
	await createProfileAndGym(userId)
	const { instanceId, sessionId } = await startRunAndOpenSession(userId, 60)

	// A definition that means *this lift, however you realize it* — the one thing
	// a NULL equipment half is allowed to mean, and it has to be stated on both
	// the rule and the athlete's lift state for the pair to be the key.
	await prisma.strengthProgramLiftRule.updateMany({
		where: { programId: 'prog_stronglifts_5x5_basic', exerciseId: SQUAT },
		data: { equipment: null },
	})
	await prisma.programLiftState.updateMany({
		where: { instanceId, exerciseId: SQUAT },
		data: { equipment: null },
	})

	await logLiftThroughTheRunner(userId, sessionId, SQUAT, [5, 5, 5, 5, 5])
	const finished = await finishStrengthSession({ userId, sessionId })
	if (!finished.ok) throw new Error('expected a finish')

	// The set says `barbell`; the rule says nothing and therefore contradicts
	// nothing. Dropping the set here is what made the program unrunnable.
	expect(
		finished.outcomes.find((outcome) => outcome.exerciseId === SQUAT),
	).toMatchObject({ kind: 'incremented', fromKg: 60, toKg: 62.5 })
})

test('a set logged on another realization of the lift does not move a barbell rule', async () => {
	const userId = await createAthlete()
	await createProfileAndGym(userId)
	const { instanceId, sessionId } = await startRunAndOpenSession(userId, 60)

	await logLiftThroughTheRunner(userId, sessionId, SQUAT, [5, 5, 5, 5, 5])
	// The same movement on the Smith machine is a different lift under a barbell
	// program's rules, and its own key: restating these five sets as smith-machine
	// sets must leave the barbell squat exactly where it was.
	const smith = await prisma.exerciseVariant.create({
		data: {
			exerciseId: SQUAT,
			equipment: 'smith-machine',
			displayName: 'Back Squat (Smith Machine)',
			loadKind: 'external',
			barKg: 20,
		},
		select: { id: true },
	})
	// **Both halves, because the key is the row's own statement now.** Re-pointing
	// `variantId` alone would leave five sets that still say `barbell` — and they
	// would still be barbell sets, which is the point of the stamp. Restating what a
	// set was lifted on means restating what the set says.
	await prisma.exerciseSetLog.updateMany({
		where: { sessionId, exerciseId: SQUAT },
		data: { variantId: smith.id, equipment: 'smith-machine' },
	})

	const finished = await finishStrengthSession({ userId, sessionId })
	if (!finished.ok) throw new Error('expected a finish')

	expect(
		finished.outcomes.find((outcome) => outcome.exerciseId === SQUAT),
	).toMatchObject({ kind: 'skipped', weightKg: 60 })
	const squat = await prisma.programLiftState.findFirstOrThrow({
		where: { instanceId, exerciseId: SQUAT },
		select: { currentWorkingWeightKg: true },
	})
	expect(squat.currentWorkingWeightKg).toBe(60)
})
