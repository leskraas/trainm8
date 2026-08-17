import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import {
	PROGRAM_LIFT_EXERCISE_IDS,
	seedStrengthPrograms,
} from './strength-program-seed.server.ts'
import {
	openNextProgramSession,
	startProgram,
} from './strength-program.server.ts'
import { finishStrengthSession } from './strength-runner.server.ts'

const SQUAT = PROGRAM_LIFT_EXERCISE_IDS.squat

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
			{ exerciseId: SQUAT, equipment: null, weightKg: squatKg },
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
