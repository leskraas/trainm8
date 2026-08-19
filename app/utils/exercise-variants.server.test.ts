/**
 * Seam 2: a real SQLite database, Prisma never mocked. The rule under test is a
 * question about rows — *does any logged set reference this variant* — so there is
 * nothing to prove over arrays and nothing here that a pure test could cover.
 */
import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import { saveExerciseVariant } from './exercise-variants.server.ts'

async function createAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	return user.id
}

async function createExercise() {
	return prisma.exercise.create({
		select: { id: true },
		data: {
			name: 'Bench Press',
			primaryMuscle: 'chest',
			equipment: 'barbell',
			isCompound: true,
			movementPattern: 'horizontal-push',
			authorship: 'system',
		},
	})
}

function facets(exerciseId: string, equipment: string) {
	return {
		exerciseId,
		equipment,
		angle: null,
		displayName: `Bench Press (${equipment})`,
		loadKind: 'external',
		barKg: 20,
		perSideMultiplier: 2,
		isFixed: false,
		isAssisting: false,
		useBodyweightForBar: false,
		isDefault: true,
	}
}

/** One logged set on this variant, with the equipment stamped the way the writer
 * stamps it. */
async function logOneSetOn(
	userId: string,
	exerciseId: string,
	variantId: string,
	equipment: string,
) {
	const workout = await prisma.workout.create({
		select: {
			id: true,
			blocks: { select: { steps: { select: { id: true } } } },
		},
		data: {
			title: 'Bench day',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [{ orderIndex: 0, kind: 'strength', exerciseId }],
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
			scheduledAt: new Date('2026-08-14T10:00:00Z'),
			workoutId: workout.id,
		},
	})
	return prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId: session.id,
			stepId: workout.blocks[0]!.steps[0]!.id,
			exerciseId,
			variantId,
			equipment,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'external', kg: 100 }),
			effectiveKg: 100,
			reps: 5,
		},
	})
}

test('a variant whose equipment a logged set depends on cannot be quietly restated', async () => {
	const userId = await createAthlete()
	const exercise = await createExercise()
	const created = await saveExerciseVariant(
		prisma,
		'var_bench_test',
		facets(exercise.id, 'barbell'),
	)
	expect(created).toEqual({ ok: true, id: 'var_bench_test' })
	await logOneSetOn(userId, exercise.id, 'var_bench_test', 'barbell')

	// The write that rekeyed eight barbell bench sessions onto a dumbbell key.
	const refused = await saveExerciseVariant(
		prisma,
		'var_bench_test',
		facets(exercise.id, 'dumbbell'),
	)

	expect(refused).toMatchObject({
		ok: false,
		reason: 'equipment-is-a-different-realization',
		recordedEquipment: 'barbell',
		postedEquipment: 'dumbbell',
		loggedSetCount: 1,
	})
	// **Nothing was written** — not the equipment, and not the facets standing
	// beside it. A half-restated row is a worse answer than the refusal.
	const row = await prisma.exerciseVariant.findUniqueOrThrow({
		where: { id: 'var_bench_test' },
		select: { equipment: true, displayName: true },
	})
	expect(row.equipment).toBe('barbell')
	expect(row.displayName).toBe('Bench Press (barbell)')
	// And the sentence says what to do instead: another realization is another
	// variant, and restating live sets takes a migration and a notice.
	if (refused.ok) throw new Error('expected a refusal')
	expect(refused.explanation).toContain('a new variant')
	expect(refused.explanation).toContain('Load Recompute Notice')
})

test('a variant nobody has logged against may still say it was the wrong equipment all along', async () => {
	const exercise = await createExercise()
	await saveExerciseVariant(
		prisma,
		'var_bench_untouched',
		facets(exercise.id, 'barbell'),
	)

	// No logged set is keyed on the answer, so there is no history to rekey and
	// nothing to protect: a corpus row that was wrong from the day it shipped is
	// simply corrected.
	const written = await saveExerciseVariant(
		prisma,
		'var_bench_untouched',
		facets(exercise.id, 'smith-machine'),
	)

	expect(written).toEqual({ ok: true, id: 'var_bench_untouched' })
	const row = await prisma.exerciseVariant.findUniqueOrThrow({
		where: { id: 'var_bench_untouched' },
		select: { equipment: true },
	})
	expect(row.equipment).toBe('smith-machine')
})

test('a variant with logged sets still accepts every correction that is not its key', async () => {
	const userId = await createAthlete()
	const exercise = await createExercise()
	await saveExerciseVariant(
		prisma,
		'var_bench_facets',
		facets(exercise.id, 'barbell'),
	)
	await logOneSetOn(userId, exercise.id, 'var_bench_facets', 'barbell')

	// A display name, a bar weight and a plate multiplier are corrigible facts
	// about the *same* realization — and correcting them is the whole reason the
	// corpus seed re-runs. Only the key is frozen.
	const written = await saveExerciseVariant(prisma, 'var_bench_facets', {
		...facets(exercise.id, 'barbell'),
		displayName: 'Barbell Bench Press',
		barKg: 15,
	})

	expect(written).toEqual({ ok: true, id: 'var_bench_facets' })
	const row = await prisma.exerciseVariant.findUniqueOrThrow({
		where: { id: 'var_bench_facets' },
		select: { displayName: true, barKg: true, equipment: true },
	})
	expect(row).toEqual({
		displayName: 'Barbell Bench Press',
		barKg: 15,
		equipment: 'barbell',
	})
})
