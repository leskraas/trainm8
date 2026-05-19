import { prisma } from './db.server.ts'
import {
	type ExerciseSet,
	type WorkoutAuthoringInput,
	type WorkoutStep,
} from './workout-schema.ts'

function buildStepCreate(step: WorkoutStep, stepIndex: number) {
	const base = { orderIndex: stepIndex }

	if (step.kind === 'cardio') {
		return {
			...base,
			kind: 'cardio',
			discipline: step.discipline,
			intensity: step.intensity ?? null,
			durationSec: step.durationSec ?? null,
			distanceM: step.distanceM ?? null,
			notes: step.notes ?? null,
		}
	}

	if (step.kind === 'strength') {
		return {
			...base,
			kind: 'strength',
			exerciseId: step.exerciseId,
			restBetweenSetsSec: step.restBetweenSetsSec ?? null,
			notes: step.notes ?? null,
			sets: {
				create: step.sets.map((set: ExerciseSet) => ({
					orderIndex: set.orderIndex,
					kind: set.kind,
					weightKg: set.weightKg ?? null,
					pct1RM: set.pct1RM ?? null,
					reps: set.kind === 'reps' ? set.reps : null,
					durationSec: set.kind === 'timed' ? set.durationSec : null,
				})),
			},
		}
	}

	return {
		...base,
		kind: 'rest',
		durationSec: step.durationSec ?? null,
		notes: step.notes ?? null,
	}
}

function buildBlocksCreate(input: WorkoutAuthoringInput) {
	return input.blocks.map((block, blockIndex) => ({
		name: block.name ?? null,
		orderIndex: blockIndex,
		repeatCount: block.repeatCount,
		steps: {
			create: block.steps.map(buildStepCreate),
		},
	}))
}

export async function deleteWorkoutSession(userId: string, sessionId: string) {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, workoutId: true },
	})

	if (!session) return null

	return prisma.$transaction(async (tx) => {
		await tx.workoutSession.delete({ where: { id: session.id } })
		if (session.workoutId) {
			await tx.workout.delete({ where: { id: session.workoutId } })
		}
		return { id: session.id }
	})
}

export async function getWorkoutSessionForEdit(
	userId: string,
	sessionId: string,
) {
	return prisma.workoutSession.findFirst({
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
					intent: true,
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
									kind: true,
									discipline: true,
									intensity: true,
									durationSec: true,
									distanceM: true,
									exerciseId: true,
									restBetweenSetsSec: true,
									notes: true,
									orderIndex: true,
									sets: {
										orderBy: { orderIndex: 'asc' as const },
										select: {
											id: true,
											kind: true,
											orderIndex: true,
											weightKg: true,
											pct1RM: true,
											reps: true,
											durationSec: true,
										},
									},
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
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, workoutId: true },
	})

	if (!session) return null

	return prisma.$transaction(async (tx) => {
		if (session.workoutId) {
			await tx.workoutBlock.deleteMany({
				where: { workoutId: session.workoutId },
			})
			await tx.workout.update({
				where: { id: session.workoutId },
				data: {
					title: input.title,
					discipline: input.discipline,
					intent: input.intent,
					blocks: { create: buildBlocksCreate(input) },
				},
			})
		}

		return tx.workoutSession.update({
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
				intent: input.intent,
				ownerId: userId,
				blocks: { create: buildBlocksCreate(input) },
			},
			select: { id: true },
		})

		const session = await tx.workoutSession.create({
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

export async function getExerciseCatalog(userId: string) {
	return prisma.exercise.findMany({
		where: {
			OR: [{ createdByAthleteId: null }, { createdByAthleteId: userId }],
		},
		select: {
			id: true,
			name: true,
			primaryMuscle: true,
			equipment: true,
			isCompound: true,
			createdByAthleteId: true,
		},
		orderBy: [{ name: 'asc' }],
	})
}

export async function createCustomExercise(
	userId: string,
	data: {
		name: string
		primaryMuscle: string
		equipment?: string
		isCompound?: boolean
	},
) {
	return prisma.exercise.create({
		data: {
			name: data.name,
			primaryMuscle: data.primaryMuscle,
			equipment: data.equipment ?? null,
			isCompound: data.isCompound ?? false,
			createdByAthleteId: userId,
		},
		select: { id: true, name: true },
	})
}
