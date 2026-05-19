import { data } from 'react-router'
import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server.ts'
import { MUSCLE_GROUPS } from '#app/utils/workout-schema.ts'
import { createCustomExercise } from '#app/utils/workout.server.ts'
import { type Route } from './+types/exercises.ts'

const CreateExerciseSchema = z.object({
	name: z.string().min(1, 'Name is required').max(120),
	primaryMuscle: z.enum(MUSCLE_GROUPS, {
		errorMap: () => ({ message: 'Please select a muscle group' }),
	}),
	equipment: z.string().max(60).optional(),
	isCompound: z.coerce.boolean().optional(),
})

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const parsed = CreateExerciseSchema.safeParse({
		name: formData.get('name'),
		primaryMuscle: formData.get('primaryMuscle'),
		equipment: formData.get('equipment') || undefined,
		isCompound: formData.get('isCompound') === 'true',
	})

	if (!parsed.success) {
		return data(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
			{ status: 400 },
		)
	}

	const exercise = await createCustomExercise(userId, {
		name: parsed.data.name,
		primaryMuscle: parsed.data.primaryMuscle,
		equipment: parsed.data.equipment,
		isCompound: parsed.data.isCompound ?? false,
	})

	return data({ exercise: { id: exercise.id, name: exercise.name } })
}
