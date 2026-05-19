import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { type WorkoutAuthoringInput } from './workout-schema.ts'
import {
	createWorkoutSession,
	deleteWorkoutSession,
	updateWorkoutSession,
	getWorkoutSessionForEdit,
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

	const result = await prisma.workoutSession.findUnique({
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
				steps: [{ activity: 'run', description: 'run off the bike' }],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
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
					{
						durationSec: 60,
						activity: 'rest',
						intensity: 'easy',
						description: 'recover',
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
	const workoutId = before!.workoutId

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

test('updateWorkoutSession updates title, activityType, and scheduledAt', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const updated = await updateWorkoutSession(user.id, session.id, {
		title: 'Updated Title',
		activityType: 'bike',
		scheduledAt: new Date('2026-07-01T10:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ description: 'easy spin' }],
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

	expect(result!.workout.title).toBe('Updated Title')
	expect(result!.workout.activityType).toBe('bike')
	expect(result!.scheduledAt.toISOString()).toBe('2026-07-01T10:00:00.000Z')
	expect(result!.workout.blocks).toHaveLength(1)
	expect(result!.workout.blocks[0]!.steps[0]!.description).toBe('easy spin')
})

test('updateWorkoutSession replaces entire block/step subtree', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Original',
		activityType: 'run',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				name: 'Warm-up',
				repeatCount: 1,
				steps: [{ durationSec: 600, description: 'easy jog' }],
			},
			{
				name: 'Main Set',
				repeatCount: 3,
				steps: [
					{ durationSec: 300, intensity: 'threshold', description: 'hard' },
				],
			},
		],
	})

	await updateWorkoutSession(user.id, session.id, {
		title: 'Revised',
		activityType: 'run',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				name: 'Only Block',
				repeatCount: 2,
				steps: [{ distanceM: 400, description: '400m rep' }],
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

	expect(result!.workout.blocks).toHaveLength(1)
	expect(result!.workout.blocks[0]!.name).toBe('Only Block')
	expect(result!.workout.blocks[0]!.repeatCount).toBe(2)
	expect(result!.workout.blocks[0]!.steps).toHaveLength(1)
	expect(result!.workout.blocks[0]!.steps[0]!.distanceM).toBe(400)
	expect(result!.workout.blocks[0]!.steps[0]!.description).toBe('400m rep')
})

test('updateWorkoutSession enforces owner scope', async () => {
	const owner = await createUserWithPassword()
	const otherUser = await createUserWithPassword()
	const session = await createWorkoutSession(owner.id, validInput())

	const result = await updateWorkoutSession(otherUser.id, session.id, {
		title: 'Hijacked',
		activityType: 'run',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [{ repeatCount: 1, steps: [{ description: 'evil step' }] }],
	})

	expect(result).toBeNull()

	const unchanged = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: { workout: true },
	})
	expect(unchanged!.workout.title).toBe('Test Session')
})

test('getWorkoutSessionForEdit returns session data for owner', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Editable Session',
		activityType: 'swim',
		scheduledAt: new Date('2026-06-15T07:00:00.000Z'),
		blocks: [
			{
				name: 'Main',
				repeatCount: 2,
				steps: [{ durationSec: 300, intensity: 'zone2', description: 'pull' }],
			},
		],
	})

	const result = await getWorkoutSessionForEdit(user.id, session.id)

	expect(result).not.toBeNull()
	expect(result!.workout.title).toBe('Editable Session')
	expect(result!.workout.activityType).toBe('swim')
	expect(result!.workout.blocks).toHaveLength(1)
	expect(result!.workout.blocks[0]!.name).toBe('Main')
	expect(result!.workout.blocks[0]!.repeatCount).toBe(2)
	expect(result!.workout.blocks[0]!.steps[0]!.durationSec).toBe(300)
	expect(result!.workout.blocks[0]!.steps[0]!.intensity).toBe('zone2')
})

test('getWorkoutSessionForEdit returns null for non-owner', async () => {
	const owner = await createUserWithPassword()
	const other = await createUserWithPassword()
	const session = await createWorkoutSession(owner.id, validInput())

	const result = await getWorkoutSessionForEdit(other.id, session.id)
	expect(result).toBeNull()
})
