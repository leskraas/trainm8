import { expect, test } from 'vitest'
import {
	PROVENANCE,
	STRONGLIFTS_VOLUME_LADDER,
} from '#app/utils/strength/program.constants.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import {
	PROGRAM_LIFT_EXERCISE_IDS,
	programDayWorkoutId,
	seedStrengthPrograms,
} from './strength-program-seed.server.ts'

test('the seed writes the three linear-progression programs, each with a citation and a provenance note', async () => {
	const result = await seedStrengthPrograms(prisma)

	expect(result.programs).toBe(3)
	expect(result.skippedLifts).toEqual([])
	const programs = await prisma.strengthProgram.findMany({
		where: {
			id: {
				in: [
					'prog_stronglifts_5x5_basic',
					'prog_starting_strength_phase1',
					'prog_greyskull_lp_base',
				],
			},
		},
		select: {
			id: true,
			name: true,
			authorship: true,
			citationWork: true,
			provenanceNote: true,
		},
	})
	expect(programs).toHaveLength(3)
	for (const program of programs) {
		expect(program.authorship).toBe('system')
		expect(program.citationWork).toBeTruthy()
		expect(program.provenanceNote).toBeTruthy()
	}
})

test('every published percentage is labelled program convention rather than physiology', async () => {
	await seedStrengthPrograms(prisma)

	const strongLifts = await prisma.strengthProgram.findUniqueOrThrow({
		where: { id: 'prog_stronglifts_5x5_basic' },
		select: { provenanceNote: true },
	})
	expect(strongLifts.provenanceNote).toMatch(/convention/i)
	expect(strongLifts.provenanceNote).toMatch(/no trial/i)
})

test('the 5×5 → 3×5 → 1×5 ladder is not seeded as StrongLifts’ rule, because it is in none of its published sources', async () => {
	await seedStrengthPrograms(prisma)

	const rules = await prisma.strengthProgramLiftRule.findMany({
		where: { programId: 'prog_stronglifts_5x5_basic' },
		select: { exerciseId: true, setCount: true, repsPerSet: true },
	})
	// Five sets of five for the four barbell lifts, and one set of five for the
	// deadlift. No rule anywhere drops to 3×5 or 1×5 as a *response* to anything.
	const nonDeadlift = rules.filter(
		(rule) => rule.exerciseId !== PROGRAM_LIFT_EXERCISE_IDS.deadlift,
	)
	expect(nonDeadlift).toHaveLength(4)
	for (const rule of nonDeadlift) {
		expect(rule.setCount).toBe(5)
		expect(rule.repsPerSet).toBe(5)
	}
	// The ladder's absence is recorded where the number would have lived — on
	// the constant itself — rather than in the card's provenance sentence, whose
	// copy is the design handoff's (§1) and says only what the card shows.
	expect(STRONGLIFTS_VOLUME_LADDER.status).toBe(PROVENANCE.folklore)
	expect(STRONGLIFTS_VOLUME_LADDER.note).toMatch(/not implemented/i)
})

test('the deadlift carries its own rule, which is why the rule table is keyed by lift', async () => {
	await seedStrengthPrograms(prisma)

	const deadlift = await prisma.strengthProgramLiftRule.findFirstOrThrow({
		where: {
			programId: 'prog_stronglifts_5x5_basic',
			exerciseId: PROGRAM_LIFT_EXERCISE_IDS.deadlift,
		},
		select: {
			setCount: true,
			repsPerSet: true,
			increment: true,
			incrementAdjustmentOnStall: true,
		},
	})
	expect(deadlift.setCount).toBe(1)
	expect(deadlift.repsPerSet).toBe(5)
	expect(JSON.parse(deadlift.increment)).toEqual({
		kind: 'absolute',
		deltaKg: 5,
	})
	// Two axes at once: the jump shrinks on a stall exactly as published.
	expect(JSON.parse(deadlift.incrementAdjustmentOnStall)).toEqual({
		kind: 'stepDown',
		toDeltaKg: 2.5,
	})
})

test('a seeded day shape states reps and no load, because the load resolves when the session is opened', async () => {
	await seedStrengthPrograms(prisma)

	const workout = await prisma.workout.findUniqueOrThrow({
		where: { id: programDayWorkoutId('prog_stronglifts_5x5_basic', 'A') },
		select: {
			authorship: true,
			ownerId: true,
			discipline: true,
			strengthGoal: true,
			blocks: {
				select: {
					steps: {
						select: {
							exerciseId: true,
							sets: { select: { reps: true, load: true, weightKg: true } },
						},
					},
				},
			},
		},
	})
	expect(workout.authorship).toBe('system')
	expect(workout.ownerId).toBeNull()
	expect(workout.discipline).toBe('strength')
	expect(workout.strengthGoal).toBe('maximal-strength')
	const steps = workout.blocks.flatMap((block) => block.steps)
	expect(steps.map((step) => step.exerciseId)).toEqual([
		PROGRAM_LIFT_EXERCISE_IDS.squat,
		PROGRAM_LIFT_EXERCISE_IDS.benchPress,
		PROGRAM_LIFT_EXERCISE_IDS.barbellRow,
	])
	for (const set of steps.flatMap((step) => step.sets)) {
		expect(set.reps).toBe(5)
		expect(set.load).toBeNull()
		expect(set.weightKg).toBeNull()
	}
})

test('re-seeding refreshes the definitions in place and does not clobber an athlete’s run', async () => {
	await seedStrengthPrograms(prisma)

	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	const instance = await prisma.programInstance.create({
		select: { id: true },
		data: {
			programId: 'prog_stronglifts_5x5_basic',
			variantId: 'basic',
			userId: user.id,
			startedOn: new Date('2026-08-01T00:00:00Z'),
			cursor: JSON.stringify({ kind: 'alternatingDays', nextDayId: 'B' }),
			liftStates: {
				create: [
					{
						exerciseId: PROGRAM_LIFT_EXERCISE_IDS.squat,
						currentWorkingWeightKg: 82.5,
						stallCount: 2,
						currentIncrement: JSON.stringify({
							kind: 'absolute',
							deltaKg: 2.5,
						}),
					},
				],
			},
		},
	})

	const before = await prisma.strengthProgram.count()
	await seedStrengthPrograms(prisma)
	expect(await prisma.strengthProgram.count()).toBe(before)

	const after = await prisma.programInstance.findUniqueOrThrow({
		where: { id: instance.id },
		select: {
			cursor: true,
			liftStates: {
				select: { currentWorkingWeightKg: true, stallCount: true },
			},
		},
	})
	expect(after.cursor).toBe(
		JSON.stringify({ kind: 'alternatingDays', nextDayId: 'B' }),
	)
	expect(after.liftStates).toEqual([
		{ currentWorkingWeightKg: 82.5, stallCount: 2 },
	])
})

test('every seeded lift rule states its equipment, because a NULL that silently means “any” is what dropped every logged set', async () => {
	await seedStrengthPrograms(prisma)

	const rules = await prisma.strengthProgramLiftRule.findMany({
		where: {
			programId: {
				in: [
					'prog_stronglifts_5x5_basic',
					'prog_starting_strength_phase1',
					'prog_greyskull_lp_base',
				],
			},
		},
		select: { exerciseId: true, equipment: true },
	})

	expect(rules).toHaveLength(13)
	// All three are barbell programs, and each rule's equipment half resolves to a
	// real `ExerciseVariant` rather than to a string nothing answers to.
	for (const rule of rules) {
		expect(rule.equipment).toBe('barbell')
		expect(
			await prisma.exerciseVariant.findFirst({
				where: { exerciseId: rule.exerciseId, equipment: rule.equipment! },
				select: { id: true },
			}),
		).not.toBeNull()
	}
})

test('a rule whose equipment half changes is refreshed rather than duplicated, because SQLite treats NULLs in a unique index as distinct', async () => {
	await seedStrengthPrograms(prisma)
	// The state this database was in before the key's second half was stated: the
	// unique triple cannot catch a NULL, so a seed that matched on the pair without
	// looking would leave the old row beside the new one.
	await prisma.strengthProgramLiftRule.updateMany({
		where: { programId: 'prog_stronglifts_5x5_basic' },
		data: { equipment: null },
	})

	await seedStrengthPrograms(prisma)

	const rules = await prisma.strengthProgramLiftRule.findMany({
		where: { programId: 'prog_stronglifts_5x5_basic' },
		select: { exerciseId: true, equipment: true },
	})
	expect(rules).toHaveLength(5)
	expect(rules.every((rule) => rule.equipment === 'barbell')).toBe(true)
})
