import { prisma } from './db.server.ts'
import { type WorkoutAuthoringInput } from './workout-schema.ts'

function buildBlocksCreate(input: WorkoutAuthoringInput) {
	return input.blocks.map((block, blockIndex) => ({
		name: block.name ?? null,
		orderIndex: blockIndex,
		repeatCount: block.repeatCount,
		steps: {
			create: block.steps.map((step, stepIndex) => ({
				description: step.description ?? '',
				discipline: step.discipline ?? input.discipline,
				intensity: step.intensity ?? null,
				orderIndex: stepIndex,
				durationSec: step.durationSec ?? null,
				distanceM: step.distanceM ?? null,
			})),
		},
	}))
}

export async function deleteWorkoutSession(userId: string, sessionId: string) {
	const session = await prisma.scheduledSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, workoutId: true },
	})

	if (!session) return null

	return prisma.$transaction(async (tx) => {
		await tx.scheduledSession.delete({ where: { id: session.id } })
		await tx.workout.delete({ where: { id: session.workoutId } })
		return { id: session.id }
	})
}

export async function getWorkoutSessionForEdit(
	userId: string,
	sessionId: string,
) {
	return prisma.scheduledSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			id: true,
			scheduledAt: true,
			status: true,
			workout: {
				select: {
					id: true,
					title: true,
					discipline: true,
					blocks: {
						orderBy: { orderIndex: 'asc' as const },
						select: {
							id: true,
							name: true,
							repeatCount: true,
							orderIndex: true,
							steps: {
								orderBy: { orderIndex: 'asc' as const },
								select: {
									id: true,
									discipline: true,
									intensity: true,
									durationSec: true,
									distanceM: true,
									description: true,
									orderIndex: true,
								},
							},
						},
					},
				},
			},
		},
	})
}

export async function updateWorkoutSession(
	userId: string,
	sessionId: string,
	input: WorkoutAuthoringInput,
) {
	const session = await prisma.scheduledSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, workoutId: true },
	})

	if (!session) return null

	return prisma.$transaction(async (tx) => {
		await tx.workoutBlock.deleteMany({
			where: { workoutId: session.workoutId },
		})

		await tx.workout.update({
			where: { id: session.workoutId },
			data: {
				title: input.title,
				discipline: input.discipline,
				blocks: { create: buildBlocksCreate(input) },
			},
		})

		return tx.scheduledSession.update({
			where: { id: session.id },
			data: { scheduledAt: input.scheduledAt },
			select: { id: true },
		})
	})
}

export async function createWorkoutSession(
	userId: string,
	input: WorkoutAuthoringInput,
) {
	return prisma.$transaction(async (tx) => {
		const workout = await tx.workout.create({
			data: {
				title: input.title,
				discipline: input.discipline,
				ownerId: userId,
				blocks: { create: buildBlocksCreate(input) },
			},
			select: { id: true },
		})

		const session = await tx.scheduledSession.create({
			data: {
				userId,
				workoutId: workout.id,
				scheduledAt: input.scheduledAt,
				status: 'scheduled',
			},
			select: { id: true },
		})

		return session
	})
}
