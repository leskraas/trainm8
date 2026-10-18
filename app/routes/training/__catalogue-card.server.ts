/**
 * What a Catalogue card reads off a row's Workout (`__catalogue-card.ts`): the
 * tree the Token Sentence and the figures are built from — the copy select's,
 * plus a lift's name, which a strength row's sentence says. Read by the
 * Catalogue and by _Bytt økt_'s picker, so a session reads the same in both.
 */
import { type Prisma } from '@prisma/client'
import { workoutCopySelect } from '#app/utils/workout.server.ts'

export const cardWorkoutSelect = {
	id: true,
	discipline: true,
	blocks: {
		...workoutCopySelect.blocks,
		select: {
			...workoutCopySelect.blocks.select,
			steps: {
				...workoutCopySelect.blocks.select.steps,
				select: {
					...workoutCopySelect.blocks.select.steps.select,
					exercise: { select: { name: true } },
				},
			},
		},
	},
} satisfies Prisma.WorkoutSelect
