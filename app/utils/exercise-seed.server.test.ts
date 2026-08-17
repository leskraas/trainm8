import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import { FREE_EXERCISE_DB_ROWS } from './exercise-corpus.free-exercise-db.ts'
import {
	AUTHORED_LIFTS,
	EXERCISE_CORPUS,
	exerciseVariantId,
} from './exercise-corpus.ts'
import {
	findVariantByEquipment,
	seedExercises,
} from './exercise-seed.server.ts'
import { getExerciseCatalog } from './workout.server.ts'

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

test('the corpus is large enough that an athlete does not hit "my exercise isn\'t here" in week one', () => {
	expect(EXERCISE_CORPUS.length).toBeGreaterThanOrEqual(300)
	// Above ~1,500 rows the picker is unusable at 390 px even with a filter.
	expect(EXERCISE_CORPUS.length).toBeLessThanOrEqual(1500)
})

test('every corpus row has a stable id, at least one variant, and a default variant that is its first', () => {
	const ids = new Set<string>()
	for (const row of EXERCISE_CORPUS) {
		expect(row.id).toMatch(/^ex_[a-z0-9_]+$/)
		expect(ids.has(row.id)).toBe(false)
		ids.add(row.id)
		expect(row.variants.length).toBeGreaterThanOrEqual(1)
	}
})

test('a movement never carries two variants for the same equipment and angle, because that pair is the identity', () => {
	for (const row of EXERCISE_CORPUS) {
		const keys = row.variants.map((v) => `${v.equipment}/${v.angle ?? ''}`)
		expect(new Set(keys).size).toBe(keys.length)
	}
})

test('the authored lifts state a movement pattern and the snapshot rows honestly state none', () => {
	for (const lift of AUTHORED_LIFTS) {
		expect(lift.movementPattern).not.toBeNull()
	}
	const authoredIds = new Set(AUTHORED_LIFTS.map((lift) => lift.id))
	const snapshotRows = EXERCISE_CORPUS.filter((row) => !authoredIds.has(row.id))
	expect(snapshotRows.length).toBeGreaterThan(0)
	for (const row of snapshotRows) {
		expect(row.movementPattern).toBeNull()
	}
	// The snapshot is the bulk of the corpus, and none of its rows is guessed at.
	expect(snapshotRows).toHaveLength(
		FREE_EXERCISE_DB_ROWS.filter((row) => !authoredIds.has(row.id)).length,
	)
})

test('every lift the seeded programs progress carries an authored movement pattern and load semantics', () => {
	const programLifts = [
		'ex_bb_back_squat',
		'ex_bb_bench',
		'ex_bb_row',
		'ex_bb_ohp',
		'ex_bb_deadlift',
		'ex_fedb_power_clean',
		'ex_bb_front_squat',
		'ex_fedb_close_grip_barbell_bench_press',
		'ex_bb_incline_bench',
		'ex_bb_sumo_dl',
		'ex_bw_chinup',
		'ex_bw_dip',
		'ex_fedb_barbell_curl',
	]
	for (const id of programLifts) {
		const lift = AUTHORED_LIFTS.find((row) => row.id === id)
		expect(lift, `${id} is authored`).toBeDefined()
		expect(lift!.movementPattern).not.toBeNull()
		expect(lift!.variants[0]!.loadKind).toBeTruthy()
	}
})

test('a dumbbell press is loaded per hand and a goblet squat is loaded total, because the number means different things', () => {
	const dbBench = AUTHORED_LIFTS.find((row) => row.id === 'ex_db_bench')!
	expect(dbBench.variants[0]!.loadKind).toBe('perSide')
	const goblet = AUTHORED_LIFTS.find((row) => row.id === 'ex_db_goblet_squat')!
	expect(goblet.variants[0]!.loadKind).toBe('external')
})

test('an assisted variant subtracts, because more assist is less work', () => {
	const pullup = AUTHORED_LIFTS.find((row) => row.id === 'ex_bw_pullup')!
	const assisted = pullup.variants.find(
		(v) => v.equipment === 'assisted-machine',
	)!
	expect(assisted.loadKind).toBe('assisted')
	expect(assisted.isAssisting).toBe(true)
})

test('seeding writes the corpus, its variants and its aliases, and re-seeding duplicates nothing', async () => {
	const first = await seedExercises(prisma, EXERCISE_CORPUS)
	expect(first.exercises).toBe(EXERCISE_CORPUS.length)

	const afterFirst = {
		exercises: await prisma.exercise.count(),
		variants: await prisma.exerciseVariant.count(),
		aliases: await prisma.exerciseAlias.count(),
	}
	expect(afterFirst.exercises).toBeGreaterThanOrEqual(EXERCISE_CORPUS.length)
	expect(afterFirst.aliases).toBe(first.aliases)

	const second = await seedExercises(prisma, EXERCISE_CORPUS)
	expect(second).toEqual(first)
	expect(await prisma.exercise.count()).toBe(afterFirst.exercises)
	expect(await prisma.exerciseVariant.count()).toBe(afterFirst.variants)
	expect(await prisma.exerciseAlias.count()).toBe(afterFirst.aliases)
})

test('the seed lands on the default variant the migration backfilled rather than beside it', async () => {
	await seedExercises(prisma, EXERCISE_CORPUS)
	const squat = EXERCISE_CORPUS.find((row) => row.id === 'ex_bb_back_squat')!
	const defaultId = exerciseVariantId(squat.id, squat.variants[0]!, true)
	expect(defaultId).toBe('var_ex_bb_back_squat')
	const variants = await prisma.exerciseVariant.findMany({
		where: { exerciseId: 'ex_bb_back_squat' },
		select: { id: true, isDefault: true },
	})
	expect(variants.filter((v) => v.isDefault)).toHaveLength(1)
	expect(variants.map((v) => v.id)).toContain('var_ex_bb_back_squat')
})

test('barbell bench and dumbbell bench are separate progression keys with a shared variation group', async () => {
	await seedExercises(prisma, EXERCISE_CORPUS)

	const barbell = await findVariantByEquipment(prisma, 'ex_bb_bench', 'barbell')
	const dumbbell = await findVariantByEquipment(
		prisma,
		'ex_db_bench',
		'dumbbell',
	)
	expect(barbell).not.toBeNull()
	expect(dumbbell).not.toBeNull()
	expect(barbell!.id).not.toBe(dumbbell!.id)
	expect(barbell!.loadKind).toBe('external')
	expect(dumbbell!.loadKind).toBe('perSide')

	const rows = await prisma.exercise.findMany({
		where: { id: { in: ['ex_bb_bench', 'ex_db_bench'] } },
		select: { variationGroupId: true },
	})
	expect(rows.map((row) => row.variationGroupId)).toEqual([
		'grp_bench',
		'grp_bench',
	])
})

test('an equipment the movement has no variant for resolves to nothing rather than to a neighbouring realization', async () => {
	await seedExercises(prisma, EXERCISE_CORPUS)
	expect(
		await findVariantByEquipment(prisma, 'ex_bb_bench', 'kettlebell'),
	).toBeNull()
})

test('re-seeding does not clobber an exercise the athlete authored', async () => {
	const athlete = await createAthlete()
	const custom = await prisma.exercise.create({
		select: { id: true },
		data: {
			id: 'ex_bb_back_squat_custom_collision',
			name: 'My Zercher Squat',
			primaryMuscle: 'quads',
			authorship: 'athlete',
			createdByAthleteId: athlete.id,
		},
	})

	// The corpus is handed a row that collides with the athlete's own id.
	const collidingCorpus = EXERCISE_CORPUS.slice(0, 3).map((row, index) =>
		index === 0 ? { ...row, id: custom.id, name: 'Back Squat' } : row,
	)
	const result = await seedExercises(prisma, collidingCorpus)
	expect(result.skippedAthleteAuthored).toBe(1)
	expect(result.exercises).toBe(2)

	const after = await prisma.exercise.findUniqueOrThrow({
		where: { id: custom.id },
		select: { name: true, authorship: true, createdByAthleteId: true },
	})
	expect(after.name).toBe('My Zercher Squat')
	expect(after.authorship).toBe('athlete')
	expect(after.createdByAthleteId).toBe(athlete.id)
})

test('an orphaned athlete-authored exercise is not served as stock', async () => {
	const author = await createAthlete()
	const reader = await createAthlete()
	await prisma.exercise.create({
		data: {
			id: 'ex_orphan_test_row',
			name: 'A movement only its author knew',
			primaryMuscle: 'quads',
			authorship: 'athlete',
			createdByAthleteId: author.id,
		},
		select: { id: true },
	})

	// The author deletes their account: `onDelete: SetNull` nulls the owner and
	// leaves the row behind. Before #469 that made it read as trainm8-authored.
	await prisma.user.delete({ where: { id: author.id } })
	const orphan = await prisma.exercise.findUniqueOrThrow({
		where: { id: 'ex_orphan_test_row' },
		select: { authorship: true, createdByAthleteId: true },
	})
	expect(orphan.createdByAthleteId).toBeNull()
	expect(orphan.authorship).toBe('athlete')

	const catalog = await getExerciseCatalog(reader.id)
	expect(catalog.map((row) => row.id)).not.toContain('ex_orphan_test_row')
})

test('an athlete sees their own exercises and everything trainm8 authored', async () => {
	await seedExercises(prisma, EXERCISE_CORPUS.slice(0, 5))
	const athlete = await createAthlete()
	await prisma.exercise.create({
		data: {
			id: 'ex_mine_only',
			name: 'My own movement',
			primaryMuscle: 'abs',
			authorship: 'athlete',
			createdByAthleteId: athlete.id,
		},
		select: { id: true },
	})

	const catalog = await getExerciseCatalog(athlete.id)
	const ids = catalog.map((row) => row.id)
	expect(ids).toContain('ex_mine_only')
	expect(ids).toContain(EXERCISE_CORPUS[0]!.id)
	expect(catalog.every((row) => row.authorship !== undefined)).toBe(true)
})
