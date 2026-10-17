// Writing a **Simple Activity** (ADR 0015 §A, #567): its Workout on `other`
// with the Activity Kind and Effort Word, and one timed step with no Intensity
// Target. The shape is `simple-activity.ts`'s; this only puts it in the
// database. The start (#572) lays Simple Activities through a Week Pattern day
// that references a Workout written here; stamping copies it per session.
import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import { SIMPLE_ACTIVITY_LABELS } from './labels.ts'
import {
	type SimpleActivity,
	SimpleActivitySchema,
	simpleActivityWorkoutData,
} from './simple-activity.ts'

/**
 * Write a Simple Activity's Workout, owned by `ownerId`. Its title is the
 * Activity Kind's name (_Klatring_) unless one is given.
 */
export async function createSimpleActivityWorkout(
	tx: Prisma.TransactionClient,
	ownerId: string,
	activity: SimpleActivity,
	{ title }: { title?: string } = {},
): Promise<{ id: string }> {
	const checked = SimpleActivitySchema.parse(activity)
	const shape = simpleActivityWorkoutData(checked)
	return tx.workout.create({
		data: {
			title: title ?? SIMPLE_ACTIVITY_LABELS.kind[checked.kind],
			discipline: shape.discipline,
			intent: shape.intent,
			activityKind: shape.activityKind,
			effortWord: shape.effortWord,
			ownerId,
			blocks: {
				create: [
					{
						orderIndex: shape.block.orderIndex,
						repeatCount: shape.block.repeatCount,
						seriesRepeatCount: shape.block.seriesRepeatCount,
						steps: { create: [{ ...shape.block.step }] },
					},
				],
			},
		},
		select: { id: true },
	})
}

/**
 * A planned Simple Activity on `scheduledAt`, for `userId`: its own Workout
 * and a scheduled session holding it. No Planned TSS is stored — it is an
 * Unavailable Metric for a Simple Activity.
 */
export async function createSimpleActivitySession(
	userId: string,
	{
		scheduledAt,
		activity,
		title,
		planOutlineId = null,
		source = 'authored',
	}: {
		scheduledAt: Date
		activity: SimpleActivity
		title?: string
		planOutlineId?: string | null
		source?: 'authored' | 'generated'
	},
): Promise<{ sessionId: string; workoutId: string }> {
	return prisma.$transaction(async (tx) => {
		const workout = await createSimpleActivityWorkout(tx, userId, activity, {
			title,
		})
		const session = await tx.workoutSession.create({
			data: {
				userId,
				workoutId: workout.id,
				scheduledAt,
				status: 'scheduled',
				source,
				planOutlineId,
			},
			select: { id: true },
		})
		return { sessionId: session.id, workoutId: workout.id }
	})
}
