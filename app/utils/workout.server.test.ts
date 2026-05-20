import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { type WorkoutAuthoringInput } from './workout-schema.ts'
import {
	createWorkoutSession,
	deleteWorkoutSession,
	updateWorkoutSession,
	getWorkoutSessionForEdit,
	getExerciseCatalog,
	createCustomExercise,
} from './workout.server.ts'

async function createUserWithPassword() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

function validInput(
	overrides: Partial<WorkoutAuthoringInput> = {},
): WorkoutAuthoringInput {
	return {
		title: 'Test Session',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'cardio', discipline: 'run', notes: '10 min easy' }],
			},
		],
		...overrides,
	}
}

test('creates a workout session with workout, block, and step', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: { steps: true },
						orderBy: { orderIndex: 'asc' },
					},
				},
			},
		},
	})

	expect(result).not.toBeNull()
	expect(result!.workout!.title).toBe('Test Session')
	expect(result!.workout!.discipline).toBe('run')
	expect(result!.workout!.ownerId).toBe(user.id)
	expect(result!.userId).toBe(user.id)
	expect(result!.status).toBe('scheduled')
	expect(result!.workout!.blocks).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.steps).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.steps[0]!.notes).toBe('10 min easy')
	expect(result!.workout!.blocks[0]!.steps[0]!.kind).toBe('cardio')
})

test('cardio step stores discipline explicitly', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(
		user.id,
		validInput({ discipline: 'swim' }),
	)

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})

	expect(result!.workout!.blocks[0]!.steps[0]!.discipline).toBe('run')
})

test('cardio step with explicit discipline stores that discipline', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Brick',
		discipline: 'bike',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						notes: 'run off the bike',
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})

	expect(result!.workout!.blocks[0]!.steps[0]!.discipline).toBe('run')
})

test('creates multiple blocks with ordered steps (cardio + rest)', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Multi-block',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				name: 'Warm-up',
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 600,
						intensity: { kind: 'zoneLabel' as const, label: 'Z1' },
						notes: 'easy jog',
					},
				],
			},
			{
				name: 'Main Set',
				repeatCount: 5,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 180,
						intensity: { kind: 'zoneLabel' as const, label: 'threshold' },
						notes: 'hard',
					},
					{
						kind: 'rest',
						durationSec: 60,
						notes: 'recover',
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: { steps: { orderBy: { orderIndex: 'asc' } } },
						orderBy: { orderIndex: 'asc' },
					},
				},
			},
		},
	})

	expect(result!.workout!.blocks).toHaveLength(2)
	expect(result!.workout!.blocks[0]!.name).toBe('Warm-up')
	expect(result!.workout!.blocks[0]!.orderIndex).toBe(0)
	expect(result!.workout!.blocks[0]!.repeatCount).toBe(1)
	expect(result!.workout!.blocks[1]!.name).toBe('Main Set')
	expect(result!.workout!.blocks[1]!.orderIndex).toBe(1)
	expect(result!.workout!.blocks[1]!.repeatCount).toBe(5)
	expect(result!.workout!.blocks[1]!.steps).toHaveLength(2)
	expect(result!.workout!.blocks[1]!.steps[0]!.durationSec).toBe(180)
	expect(result!.workout!.blocks[1]!.steps[1]!.kind).toBe('rest')
})

test('persists durationSec and distanceM on cardio steps', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Quantified',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 600,
						notes: 'timed',
					},
					{
						kind: 'cardio',
						discipline: 'run',
						distanceM: 400,
						notes: 'distance',
					},
					{ kind: 'cardio', discipline: 'run', notes: 'unquantified' },
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: { steps: { orderBy: { orderIndex: 'asc' } } },
					},
				},
			},
		},
	})

	const steps = result!.workout!.blocks[0]!.steps
	expect(steps[0]!.durationSec).toBe(600)
	expect(steps[0]!.distanceM).toBeNull()
	expect(steps[1]!.distanceM).toBe(400)
	expect(steps[1]!.durationSec).toBeNull()
	expect(steps[2]!.durationSec).toBeNull()
	expect(steps[2]!.distanceM).toBeNull()
})

test('owner scope: session belongs to the requesting user', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()

	const session = await createWorkoutSession(userA.id, validInput())

	const result = await prisma.workoutSession.findFirst({
		where: { id: session.id, userId: userB.id },
	})
	expect(result).toBeNull()

	const ownerResult = await prisma.workoutSession.findFirst({
		where: { id: session.id, userId: userA.id },
	})
	expect(ownerResult).not.toBeNull()
})

test('workout is 1:1 with session (private workout)', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})

	const sessionsForWorkout = await prisma.workoutSession.findMany({
		where: { workoutId: result!.workoutId },
	})
	expect(sessionsForWorkout).toHaveLength(1)
})

test('deleteWorkoutSession removes session and cascades to private workout', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const before = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})
	const workoutId = before!.workoutId!

	await deleteWorkoutSession(user.id, session.id)

	const deletedSession = await prisma.workoutSession.findUnique({
		where: { id: session.id },
	})
	expect(deletedSession).toBeNull()

	const deletedWorkout = await prisma.workout.findUnique({
		where: { id: workoutId },
	})
	expect(deletedWorkout).toBeNull()
})

test('deleteWorkoutSession enforces owner scope', async () => {
	const owner = await createUserWithPassword()
	const otherUser = await createUserWithPassword()
	const session = await createWorkoutSession(owner.id, validInput())

	const result = await deleteWorkoutSession(otherUser.id, session.id)
	expect(result).toBe(null)

	const stillExists = await prisma.workoutSession.findUnique({
		where: { id: session.id },
	})
	expect(stillExists).not.toBeNull()
})

test('deleteWorkoutSession cascades to session log', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	await prisma.sessionLog.create({
		data: {
			sessionId: session.id,
			content: 'Great workout',
			rpe: 7,
		},
	})

	const logBefore = await prisma.sessionLog.findUnique({
		where: { sessionId: session.id },
	})
	expect(logBefore).not.toBeNull()

	await deleteWorkoutSession(user.id, session.id)

	const logAfter = await prisma.sessionLog.findUnique({
		where: { sessionId: session.id },
	})
	expect(logAfter).toBeNull()
})

test('updateWorkoutSession updates title, discipline, and scheduledAt', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const updated = await updateWorkoutSession(user.id, session.id, {
		title: 'Updated Title',
		discipline: 'bike',
		intent: 'endurance',
		scheduledAt: new Date('2026-07-01T10:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'cardio', discipline: 'bike', notes: 'easy spin' }],
			},
		],
	})

	expect(updated).not.toBeNull()
	expect(updated!.id).toBe(session.id)

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: { include: { steps: true }, orderBy: { orderIndex: 'asc' } },
				},
			},
		},
	})

	expect(result!.workout!.title).toBe('Updated Title')
	expect(result!.workout!.discipline).toBe('bike')
	expect(result!.scheduledAt.toISOString()).toBe('2026-07-01T10:00:00.000Z')
	expect(result!.workout!.blocks).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.steps[0]!.notes).toBe('easy spin')
})

test('updateWorkoutSession replaces entire block/step subtree', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Original',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				name: 'Warm-up',
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 600,
						notes: 'easy jog',
					},
				],
			},
			{
				name: 'Main Set',
				repeatCount: 3,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 300,
						intensity: { kind: 'zoneLabel' as const, label: 'threshold' },
						notes: 'hard',
					},
				],
			},
		],
	})

	await updateWorkoutSession(user.id, session.id, {
		title: 'Revised',
		discipline: 'run',
		intent: 'tempo',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				name: 'Only Block',
				repeatCount: 2,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						distanceM: 400,
						notes: '400m rep',
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: { steps: { orderBy: { orderIndex: 'asc' } } },
						orderBy: { orderIndex: 'asc' },
					},
				},
			},
		},
	})

	expect(result!.workout!.blocks).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.name).toBe('Only Block')
	expect(result!.workout!.blocks[0]!.repeatCount).toBe(2)
	expect(result!.workout!.blocks[0]!.steps).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.steps[0]!.distanceM).toBe(400)
	expect(result!.workout!.blocks[0]!.steps[0]!.notes).toBe('400m rep')
})

test('updateWorkoutSession enforces owner scope', async () => {
	const owner = await createUserWithPassword()
	const otherUser = await createUserWithPassword()
	const session = await createWorkoutSession(owner.id, validInput())

	const result = await updateWorkoutSession(otherUser.id, session.id, {
		title: 'Hijacked',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'cardio', discipline: 'run', notes: 'evil step' }],
			},
		],
	})

	expect(result).toBeNull()

	const unchanged = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: { workout: true },
	})
	expect(unchanged!.workout!.title).toBe('Test Session')
})

test('getWorkoutSessionForEdit returns session data for owner', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Editable Session',
		discipline: 'swim',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-15T07:00:00.000Z'),
		blocks: [
			{
				name: 'Main',
				repeatCount: 2,
				steps: [
					{
						kind: 'cardio',
						discipline: 'swim',
						durationSec: 300,
						intensity: { kind: 'zoneLabel' as const, label: 'Z2' },
						notes: 'pull',
					},
				],
			},
		],
	})

	const result = await getWorkoutSessionForEdit(user.id, session.id)

	expect(result).not.toBeNull()
	expect(result!.workout!.title).toBe('Editable Session')
	expect(result!.workout!.discipline).toBe('swim')
	expect(result!.workout!.blocks).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.name).toBe('Main')
	expect(result!.workout!.blocks[0]!.repeatCount).toBe(2)
	expect(result!.workout!.blocks[0]!.steps[0]!.durationSec).toBe(300)
	expect(result!.workout!.blocks[0]!.steps[0]!.intensity).toBe(
		JSON.stringify({ kind: 'zoneLabel', label: 'Z2' }),
	)
	expect(result!.workout!.blocks[0]!.steps[0]!.kind).toBe('cardio')
})

test('getWorkoutSessionForEdit returns null for non-owner', async () => {
	const owner = await createUserWithPassword()
	const other = await createUserWithPassword()
	const session = await createWorkoutSession(owner.id, validInput())

	const result = await getWorkoutSessionForEdit(other.id, session.id)
	expect(result).toBeNull()
})

test('creates strength step with exercise sets', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Lower Body',
		discipline: 'strength',
		intent: 'strength-max',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'strength',
						exerciseId: 'ex_bb_back_squat',
						restBetweenSetsSec: 90,
						sets: [
							{ kind: 'reps', orderIndex: 0, reps: 5, weightKg: 100 },
							{ kind: 'reps', orderIndex: 1, reps: 5, weightKg: 100 },
							{ kind: 'reps', orderIndex: 2, reps: 5, weightKg: 100 },
						],
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: {
							steps: {
								include: {
									sets: { orderBy: { orderIndex: 'asc' } },
									exercise: true,
								},
							},
						},
					},
				},
			},
		},
	})

	const step = result!.workout!.blocks[0]!.steps[0]!
	expect(step.kind).toBe('strength')
	expect(step.exerciseId).toBe('ex_bb_back_squat')
	expect(step.exercise!.name).toBe('Back Squat')
	expect(step.restBetweenSetsSec).toBe(90)
	expect(step.sets).toHaveLength(3)
	expect(step.sets[0]!.kind).toBe('reps')
	expect(step.sets[0]!.reps).toBe(5)
	expect(step.sets[0]!.weightKg).toBe(100)
})

test('creates rest step with durationSec', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'With Rest',
		discipline: 'strength',
		intent: 'strength-max',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'rest',
						durationSec: 90,
						notes: 'Rest between sets',
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: { include: { steps: true } },
				},
			},
		},
	})

	const step = result!.workout!.blocks[0]!.steps[0]!
	expect(step.kind).toBe('rest')
	expect(step.durationSec).toBe(90)
	expect(step.notes).toBe('Rest between sets')
})

test('getExerciseCatalog returns seed exercises plus custom exercises for user', async () => {
	const user = await createUserWithPassword()

	const before = await getExerciseCatalog(user.id)
	const seedCount = before.length
	expect(seedCount).toBeGreaterThan(0)

	const custom = await createCustomExercise(user.id, {
		name: 'Kettlebell Swing',
		primaryMuscle: 'glutes',
		equipment: 'kettlebell',
		isCompound: true,
	})

	const after = await getExerciseCatalog(user.id)
	expect(after.length).toBe(seedCount + 1)
	expect(after.some((ex) => ex.id === custom.id)).toBe(true)
})

test('getExerciseCatalog does not return other users custom exercises', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()

	await createCustomExercise(userA.id, {
		name: 'UserA Secret Move',
		primaryMuscle: 'chest',
	})

	const catalogForB = await getExerciseCatalog(userB.id)
	expect(catalogForB.some((ex) => ex.name === 'UserA Secret Move')).toBe(false)
})
