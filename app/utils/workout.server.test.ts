import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { type WorkoutAuthoringInput } from './workout-schema.ts'
import { createWorkoutSession } from './workout.server.ts'

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

function validInput(overrides: Partial<WorkoutAuthoringInput> = {}): WorkoutAuthoringInput {
	return {
		title: 'Test Session',
		activityType: 'run',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ description: '10 min easy' }],
			},
		],
		...overrides,
	}
}

test('creates a workout session with workout, block, and step', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const result = await prisma.scheduledSession.findUnique({
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
	expect(result!.workout.title).toBe('Test Session')
	expect(result!.workout.activityType).toBe('run')
	expect(result!.workout.ownerId).toBe(user.id)
	expect(result!.userId).toBe(user.id)
	expect(result!.status).toBe('scheduled')
	expect(result!.workout.blocks).toHaveLength(1)
	expect(result!.workout.blocks[0]!.steps).toHaveLength(1)
	expect(result!.workout.blocks[0]!.steps[0]!.description).toBe('10 min easy')
})

test('step defaults activity to workout activityType when not specified', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(
		user.id,
		validInput({ activityType: 'swim' }),
	)

	const result = await prisma.scheduledSession.findUnique({
		where: { id: session.id },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})

	expect(result!.workout.blocks[0]!.steps[0]!.activity).toBe('swim')
})

test('step uses explicit activity override when provided', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Brick',
		activityType: 'bike',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{ activity: 'run', description: 'run off the bike' },
				],
			},
		],
	})

	const result = await prisma.scheduledSession.findUnique({
		where: { id: session.id },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})

	expect(result!.workout.blocks[0]!.steps[0]!.activity).toBe('run')
})

test('creates multiple blocks with ordered steps', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Multi-block',
		activityType: 'run',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				name: 'Warm-up',
				repeatCount: 1,
				steps: [
					{ durationSec: 600, intensity: 'easy', description: 'easy jog' },
				],
			},
			{
				name: 'Main Set',
				repeatCount: 5,
				steps: [
					{ durationSec: 180, intensity: 'threshold', description: 'hard' },
					{ durationSec: 60, activity: 'rest', intensity: 'easy', description: 'recover' },
				],
			},
		],
	})

	const result = await prisma.scheduledSession.findUnique({
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

	expect(result!.workout.blocks).toHaveLength(2)
	expect(result!.workout.blocks[0]!.name).toBe('Warm-up')
	expect(result!.workout.blocks[0]!.orderIndex).toBe(0)
	expect(result!.workout.blocks[0]!.repeatCount).toBe(1)
	expect(result!.workout.blocks[1]!.name).toBe('Main Set')
	expect(result!.workout.blocks[1]!.orderIndex).toBe(1)
	expect(result!.workout.blocks[1]!.repeatCount).toBe(5)
	expect(result!.workout.blocks[1]!.steps).toHaveLength(2)
	expect(result!.workout.blocks[1]!.steps[0]!.durationSec).toBe(180)
	expect(result!.workout.blocks[1]!.steps[1]!.activity).toBe('rest')
})

test('persists durationSec and distanceM on steps', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Quantified',
		activityType: 'run',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{ durationSec: 600, description: 'timed' },
					{ distanceM: 400, description: 'distance' },
					{ description: 'unquantified' },
				],
			},
		],
	})

	const result = await prisma.scheduledSession.findUnique({
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

	const steps = result!.workout.blocks[0]!.steps
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

	const result = await prisma.scheduledSession.findFirst({
		where: { id: session.id, userId: userB.id },
	})
	expect(result).toBeNull()

	const ownerResult = await prisma.scheduledSession.findFirst({
		where: { id: session.id, userId: userA.id },
	})
	expect(ownerResult).not.toBeNull()
})

test('workout is 1:1 with session (private workout)', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const result = await prisma.scheduledSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})

	const sessionsForWorkout = await prisma.scheduledSession.findMany({
		where: { workoutId: result!.workoutId },
	})
	expect(sessionsForWorkout).toHaveLength(1)
})
