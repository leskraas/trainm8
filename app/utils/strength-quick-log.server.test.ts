import { invariant } from '@epic-web/invariant'
import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	autoSaveImport,
	createActivityImport,
} from './activity-import.server.ts'
import { prisma } from './db.server.ts'
import {
	PROGRAM_LIFT_EQUIPMENT,
	PROGRAM_LIFT_EXERCISE_IDS,
	seedStrengthPrograms,
} from './strength-program-seed.server.ts'
import {
	openNextProgramSession,
	setWorkingWeight,
	startProgram,
} from './strength-program.server.ts'
import {
	logStrengthSession,
	readQuickLog,
} from './strength-quick-log.server.ts'

/**
 * The quick strength log (#505 stories 83–84), Seam 1: what goes in at the
 * server and what the set log and the session say after.
 */

// Wednesday 7 October 2026, midday; the athlete lives in UTC.
const NOW = new Date('2026-10-07T12:00:00Z')
const TZ = 'UTC'
const DAY = 24 * 60 * 60 * 1000

async function createAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	await prisma.athleteProfile.create({
		data: { userId: user.id, weightKg: 80, timezone: TZ },
	})
	return user.id
}

async function exercise(name: string, loadKind = 'external') {
	return prisma.exercise.create({
		select: { id: true },
		data: {
			name,
			primaryMuscle: 'quads',
			equipment: loadKind === 'external' ? 'barbell' : 'bodyweight',
			isCompound: true,
			variants: {
				create: [
					{
						equipment: loadKind === 'external' ? 'barbell' : 'bodyweight',
						displayName: name,
						loadKind,
						isDefault: true,
					},
				],
			},
		},
	})
}

/**
 * A gym day of three squats at 100 kg and two 45-second planks, `daysFromNow`
 * from NOW. `squatLoad` replaces the squat's authored load.
 */
async function gymDay(
	userId: string,
	daysFromNow = 0,
	{
		squatLoad = { kind: 'absolute', kg: 100 } as object,
		repeatCount = 1,
	}: { squatLoad?: object; repeatCount?: number } = {},
) {
	const squat = await exercise('Back Squat')
	const plank = await exercise('Plank', 'bodyweight')
	const workout = await prisma.workout.create({
		select: {
			id: true,
			blocks: { select: { steps: { select: { id: true, exerciseId: true } } } },
		},
		data: {
			title: 'Styrke A',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									exerciseId: squat.id,
									sets: {
										create: [0, 1, 2].map((orderIndex) => ({
											orderIndex,
											kind: 'reps',
											reps: 5,
											load: JSON.stringify(squatLoad),
										})),
									},
								},
								{
									orderIndex: 1,
									kind: 'strength',
									exerciseId: plank.id,
									sets: {
										create: [0, 1].map((orderIndex) => ({
											orderIndex,
											kind: 'timed',
											durationSec: 45,
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
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date(NOW.getTime() + daysFromNow * DAY - 3 * 3600_000),
			source: 'authored',
		},
	})
	const steps = workout.blocks.flatMap((block) => block.steps)
	const squatStep = steps.find((s) => s.exerciseId === squat.id)
	const plankStep = steps.find((s) => s.exerciseId === plank.id)
	invariant(squatStep && plankStep, 'the gym day has its two lifts')
	return {
		sessionId: session.id,
		squatStep: squatStep.id,
		plankStep: plankStep.id,
	}
}

async function setsOf(sessionId: string) {
	return prisma.exerciseSetLog.findMany({
		where: { sessionId },
		orderBy: [{ stepId: 'asc' }, { orderIndex: 'asc' }],
		select: {
			stepId: true,
			orderIndex: true,
			role: true,
			outcome: true,
			reps: true,
			durationSec: true,
			load: true,
			effectiveKg: true,
		},
	})
}

async function statusOf(sessionId: string) {
	return (
		await prisma.workoutSession.findUniqueOrThrow({
			where: { id: sessionId },
			select: { status: true },
		})
	).status
}

const asPlanned = { kind: 'as-planned' } as const
const at = { now: NOW, timezone: TZ }

test('the quick log reads the plan pre-filled, lift by lift and set by set', async () => {
	const userId = await createAthlete()
	const { sessionId, squatStep, plankStep } = await gymDay(userId)

	const log = await readQuickLog(userId, sessionId, at)

	expect(log).toEqual({
		sessionId,
		loggable: true,
		runnerTo: `/training/sessions/${sessionId}/log`,
		lifts: [
			{
				stepId: squatStep,
				name: 'Back Squat',
				scheme: '3×5',
				loadLabel: '100 kg',
				loggable: true,
				sets: [0, 1, 2].map((orderIndex) => ({
					orderIndex,
					target: 5,
					unit: 'reps',
				})),
			},
			{
				stepId: plankStep,
				name: 'Plank',
				scheme: '2×45 s',
				loadLabel: 'kroppsvekt',
				loggable: true,
				sets: [0, 1].map((orderIndex) => ({
					orderIndex,
					target: 45,
					unit: 'seconds',
				})),
			},
		],
	})
})

test('som planlagt writes every planned set exactly once, at the planned weight, and finishes the session', async () => {
	const userId = await createAthlete()
	const { sessionId, squatStep, plankStep } = await gymDay(userId, -1)

	const result = await logStrengthSession(userId, sessionId, asPlanned, at)

	expect(result).toMatchObject({
		ok: true,
		loggedSets: 5,
		alreadyLogged: false,
	})
	const sets = await setsOf(sessionId)
	expect(sets).toHaveLength(5)
	const squats = sets.filter((s) => s.stepId === squatStep)
	expect(squats.map((s) => [s.orderIndex, s.reps])).toEqual([
		[0, 5],
		[1, 5],
		[2, 5],
	])
	for (const set of squats) {
		expect(JSON.parse(set.load)).toEqual({ kind: 'external', kg: 100 })
		expect(set.effectiveKg).toBe(100)
		expect(set).toMatchObject({ role: 'working', outcome: 'completed' })
	}
	const planks = sets.filter((s) => s.stepId === plankStep)
	expect(planks.map((s) => [s.durationSec, s.reps])).toEqual([
		[45, null],
		[45, null],
	])
	// A bodyweight hold bakes the athlete's weight, as the runner's tap does.
	expect(planks.map((set) => JSON.parse(set.load))).toEqual([
		{ kind: 'bodyweight' },
		{ kind: 'bodyweight' },
	])
	expect(await statusOf(sessionId)).toBe('completed')
	// Done, the quick log is no longer offered.
	expect(await readQuickLog(userId, sessionId, at)).toBeNull()
})

test('a double tap logs once: the second finds the session done and writes nothing', async () => {
	const userId = await createAthlete()
	const { sessionId } = await gymDay(userId)

	const first = await logStrengthSession(userId, sessionId, asPlanned, at)
	const before = await setsOf(sessionId)
	const second = await logStrengthSession(userId, sessionId, asPlanned, at)

	expect(first).toMatchObject({ ok: true, alreadyLogged: false })
	expect(second).toEqual({
		ok: true,
		sessionId,
		loggedSets: 0,
		alreadyLogged: true,
		finished: null,
		week: null,
	})
	expect(await setsOf(sessionId)).toEqual(before)
})

test('two taps in flight at once still log every set once', async () => {
	const userId = await createAthlete()
	const { sessionId } = await gymDay(userId)

	const [one, two] = await Promise.all([
		logStrengthSession(userId, sessionId, asPlanned, at),
		logStrengthSession(userId, sessionId, asPlanned, at),
	])

	expect([one, two].filter((r) => r.ok && !r.alreadyLogged)).toHaveLength(1)
	expect([one, two].filter((r) => r.ok && r.alreadyLogged)).toHaveLength(1)
	expect(await setsOf(sessionId)).toHaveLength(5)
})

test('Endre logs the sets that differed: fewer reps, a set not done, the rest as planned', async () => {
	const userId = await createAthlete()
	const { sessionId, squatStep, plankStep } = await gymDay(userId)

	const result = await logStrengthSession(
		userId,
		sessionId,
		{
			kind: 'edited',
			sets: [
				{ stepId: squatStep, orderIndex: 0, count: 5 },
				{ stepId: squatStep, orderIndex: 1, count: 3 },
				// Not done: no count.
				{ stepId: squatStep, orderIndex: 2 },
				// Held longer than asked.
				{ stepId: plankStep, orderIndex: 0, count: 60 },
				// Left out: as planned.
			],
		},
		at,
	)

	expect(result).toMatchObject({ ok: true, loggedSets: 4 })
	const sets = await setsOf(sessionId)
	expect(
		sets.map((s) => [
			s.stepId === squatStep ? 'squat' : 'plank',
			s.orderIndex,
			s.reps ?? s.durationSec,
		]),
	).toEqual([
		...(squatStep < plankStep
			? [
					['squat', 0, 5],
					['squat', 1, 3],
					['plank', 0, 60],
					['plank', 1, 45],
				]
			: [
					['plank', 0, 60],
					['plank', 1, 45],
					['squat', 0, 5],
					['squat', 1, 3],
				]),
	])
	// The weight is the planned one on every set: ADR 0064 leaves no other.
	for (const set of sets.filter((s) => s.stepId === squatStep)) {
		expect(JSON.parse(set.load)).toEqual({ kind: 'external', kg: 100 })
	}
	expect(await statusOf(sessionId)).toBe('completed')
})

test('Endre with nothing done is refused, and nothing is written', async () => {
	const userId = await createAthlete()
	const { sessionId, squatStep, plankStep } = await gymDay(userId)

	const result = await logStrengthSession(
		userId,
		sessionId,
		{
			kind: 'edited',
			sets: [
				...[0, 1, 2].map((orderIndex) => ({
					stepId: squatStep,
					orderIndex,
					count: 0,
				})),
				...[0, 1].map((orderIndex) => ({ stepId: plankStep, orderIndex })),
			],
		},
		at,
	)

	expect(result).toEqual({ ok: false, reason: 'nothing-done' })
	expect(await setsOf(sessionId)).toEqual([])
	expect(await statusOf(sessionId)).toBe('scheduled')
})

test('a set the plan does not have is refused, and nothing is written', async () => {
	const userId = await createAthlete()
	const { sessionId, squatStep } = await gymDay(userId)

	const result = await logStrengthSession(
		userId,
		sessionId,
		{ kind: 'edited', sets: [{ stepId: squatStep, orderIndex: 7, count: 5 }] },
		at,
	)

	expect(result).toEqual({ ok: false, reason: 'unknown-set' })
	expect(await setsOf(sessionId)).toEqual([])
})

test('a lift whose weight does not resolve sends the whole session to the runner', async () => {
	const userId = await createAthlete()
	// 85 % of a 1RM nobody has on file: no kilo to log, and none is guessed.
	const { sessionId } = await gymDay(userId, 0, {
		squatLoad: { kind: 'pct1RM', minPct: 85 },
	})

	const log = await readQuickLog(userId, sessionId, at)
	expect(log?.loggable).toBe(false)
	expect(log?.lifts[0]).toMatchObject({ loggable: false, loadLabel: null })

	expect(await logStrengthSession(userId, sessionId, asPlanned, at)).toEqual({
		ok: false,
		reason: 'not-plannable',
	})
	expect(await setsOf(sessionId)).toEqual([])
})

test('only a session whose day has begun, at most a week back, and only the athlete’s own', async () => {
	const userId = await createAthlete()
	const ahead = await gymDay(userId, 1)
	const old = await gymDay(userId, -7)
	const weekBack = await gymDay(userId, -6)
	const stranger = await createAthlete()

	for (const sessionId of [ahead.sessionId, old.sessionId]) {
		expect(await readQuickLog(userId, sessionId, at)).toBeNull()
		expect(await logStrengthSession(userId, sessionId, asPlanned, at)).toEqual({
			ok: false,
			reason: 'not-loggable',
		})
	}
	expect(await readQuickLog(userId, weekBack.sessionId, at)).not.toBeNull()

	expect(await readQuickLog(stranger, weekBack.sessionId, at)).toBeNull()
	expect(
		await logStrengthSession(stranger, weekBack.sessionId, asPlanned, at),
	).toEqual({ ok: false, reason: 'session-not-found' })
	expect(await setsOf(weekBack.sessionId)).toEqual([])
})

test('a session the runner has started is finished in the runner, not over it', async () => {
	const userId = await createAthlete()
	const { sessionId, squatStep } = await gymDay(userId)
	await prisma.exerciseSetLog.create({
		data: {
			sessionId,
			stepId: squatStep,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'external', kg: 100 }),
			effectiveKg: 100,
			reps: 3,
		},
	})

	expect(await readQuickLog(userId, sessionId, at)).toBeNull()
	expect(await logStrengthSession(userId, sessionId, asPlanned, at)).toEqual({
		ok: false,
		reason: 'not-loggable',
	})
	// The short set stays as the athlete logged it.
	expect((await setsOf(sessionId)).map((s) => s.reps)).toEqual([3])
})

test('a program session logged as planned folds into the run once, however often it is tapped', async () => {
	const userId = await createAthlete()
	await seedStrengthPrograms(prisma)
	const now = new Date()
	const started = await startProgram({
		userId,
		programId: 'prog_stronglifts_5x5_basic',
		startedOn: new Date(now.getTime() - DAY),
		startingWeights: [
			{
				exerciseId: PROGRAM_LIFT_EXERCISE_IDS.squat,
				equipment: PROGRAM_LIFT_EQUIPMENT.squat,
				weightKg: 60,
			},
		],
	})
	if (!started.ok) throw new Error(started.reason)
	const opened = await openNextProgramSession({
		userId,
		instanceId: started.instanceId,
	})
	if (!opened) throw new Error('expected a session')

	const first = await logStrengthSession(userId, opened.sessionId, asPlanned, {
		now,
		timezone: TZ,
	})
	await logStrengthSession(userId, opened.sessionId, asPlanned, {
		now,
		timezone: TZ,
	})

	expect(first.ok && first.finished?.programName).toBeTruthy()
	expect(
		await prisma.programSessionApplication.count({
			where: { instanceId: started.instanceId },
		}),
	).toBe(1)
	// The squat logged at the run's own working weight.
	const squat = await prisma.exerciseSetLog.findFirstOrThrow({
		where: {
			sessionId: opened.sessionId,
			exerciseId: PROGRAM_LIFT_EXERCISE_IDS.squat,
		},
		select: { load: true },
	})
	expect(JSON.parse(squat.load)).toEqual({ kind: 'external', kg: 60 })
})

test('a gym day an import linked is still logged: the import brought no sets', async () => {
	const userId = await createAthlete()
	const { sessionId } = await gymDay(userId, -1)
	// intervals.icu carries the workout but no kilos and no sets (ADR 0056 §1).
	const start = new Date(NOW.getTime() - DAY - 3 * 3600_000)
	const imported = await createActivityImport(userId, {
		externalProvider: 'intervalsicu',
		externalId: `gym-${userId}`,
		startedAt: start,
		endedAt: new Date(start.getTime() + 50 * 60_000),
		durationSec: 50 * 60,
		discipline: 'strength',
		rawJson: '{}',
	})
	const saved = await autoSaveImport(userId, imported.id, TZ)
	expect(saved?.sessionId).toBe(sessionId)
	expect(await statusOf(sessionId)).toBe('completed')

	expect(await readQuickLog(userId, sessionId, at)).not.toBeNull()
	const result = await logStrengthSession(userId, sessionId, asPlanned, at)

	expect(result).toMatchObject({
		ok: true,
		loggedSets: 5,
		alreadyLogged: false,
	})
	expect(await setsOf(sessionId)).toHaveLength(5)
	expect(await statusOf(sessionId)).toBe('completed')
	// Logged, it is not offered again.
	expect(await readQuickLog(userId, sessionId, at)).toBeNull()
})

test('a repeated block is logged in the runner, not as fewer sets than planned', async () => {
	const userId = await createAthlete()
	// Squats and planks, twice through: 10 sets planned. The runner logs them
	// round by round; this short log does not show rounds, so it sends them there.
	const { sessionId } = await gymDay(userId, 0, { repeatCount: 2 })

	const log = await readQuickLog(userId, sessionId, at)
	expect(log?.loggable).toBe(false)
	expect(await logStrengthSession(userId, sessionId, asPlanned, at)).toEqual({
		ok: false,
		reason: 'not-plannable',
	})
	expect(await setsOf(sessionId)).toEqual([])
})

test('the sets and the finish land together: a finish that fails leaves no set behind', async () => {
	const userId = await createAthlete()
	const { sessionId } = await gymDay(userId)
	await prisma.$executeRawUnsafe(`
		CREATE TRIGGER quick_log_finish_fails
		BEFORE UPDATE OF status ON WorkoutSession
		WHEN NEW.status = 'completed'
		BEGIN SELECT RAISE(ABORT, 'the finish failed'); END`)
	try {
		await expect(
			logStrengthSession(userId, sessionId, asPlanned, at),
		).rejects.toThrow()
	} finally {
		await prisma.$executeRawUnsafe(`DROP TRIGGER quick_log_finish_fails`)
	}
	expect(await setsOf(sessionId)).toEqual([])
	expect(await statusOf(sessionId)).toBe('scheduled')
	// Nothing half-written, so the log is still there to try again.
	expect(await readQuickLog(userId, sessionId, at)).not.toBeNull()
})

test('a program session is logged at the run’s current working weight', async () => {
	const userId = await createAthlete()
	await seedStrengthPrograms(prisma)
	const now = new Date()
	const started = await startProgram({
		userId,
		programId: 'prog_stronglifts_5x5_basic',
		startedOn: new Date(now.getTime() - DAY),
		startingWeights: [
			{
				exerciseId: PROGRAM_LIFT_EXERCISE_IDS.squat,
				equipment: PROGRAM_LIFT_EQUIPMENT.squat,
				weightKg: 60,
			},
		],
	})
	if (!started.ok) throw new Error(started.reason)
	const opened = await openNextProgramSession({
		userId,
		instanceId: started.instanceId,
	})
	if (!opened) throw new Error('expected a session')
	// Stamped at 60 kg when it was opened; the athlete has moved the squat since.
	await setWorkingWeight({
		userId,
		instanceId: started.instanceId,
		exerciseId: PROGRAM_LIFT_EXERCISE_IDS.squat,
		equipment: PROGRAM_LIFT_EQUIPMENT.squat,
		weightKg: 70,
	})

	const log = await logStrengthSession(userId, opened.sessionId, asPlanned, {
		now,
		timezone: TZ,
	})

	expect(log).toMatchObject({ ok: true, alreadyLogged: false })
	const squats = await prisma.exerciseSetLog.findMany({
		where: {
			sessionId: opened.sessionId,
			exerciseId: PROGRAM_LIFT_EXERCISE_IDS.squat,
		},
		select: { load: true },
	})
	expect(squats.length).toBeGreaterThan(0)
	for (const squat of squats) {
		expect(JSON.parse(squat.load)).toEqual({ kind: 'external', kg: 70 })
	}
})
