import { prisma } from './db.server.ts'
import { type WorkoutAuthoringInput } from './workout-schema.ts'

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

export async function createWorkoutSession(
	userId: string,
	input: WorkoutAuthoringInput,
) {
	return prisma.$transaction(async (tx) => {
		const workout = await tx.workout.create({
			data: {
				title: input.title,
				activityType: input.activityType,
				ownerId: userId,
				blocks: {
					create: input.blocks.map((block, blockIndex) => ({
						name: block.name ?? null,
						orderIndex: blockIndex,
						repeatCount: block.repeatCount,
						steps: {
							create: block.steps.map((step, stepIndex) => ({
								description: step.description ?? '',
								activity: step.activity ?? input.activityType,
								intensity: step.intensity ?? null,
								orderIndex: stepIndex,
								durationSec: step.durationSec ?? null,
								distanceM: step.distanceM ?? null,
							})),
						},
					})),
				},
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
