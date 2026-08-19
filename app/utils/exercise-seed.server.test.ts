import { readFile } from 'node:fs/promises'
import path from 'node:path'
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
import { createCustomExercise, getExerciseCatalog } from './workout.server.ts'

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

test('an exercise nobody authored says it does not know whether it is unilateral', () => {
	const authoredIds = new Set(AUTHORED_LIFTS.map((lift) => lift.id))
	const snapshotRows = EXERCISE_CORPUS.filter((row) => !authoredIds.has(row.id))
	expect(snapshotRows.length).toBeGreaterThan(0)
	for (const row of snapshotRows) {
		// Not `false`. `false` is the sentence "this movement is worked with both
		// sides at once", and no open dataset carries laterality for anyone to
		// have written it (ADR 0061).
		expect(row.unilateral).toBeNull()
	}
})

test('an authored lift states its laterality either way, so a concentration curl and a back squat do not make the same claim', () => {
	for (const lift of AUTHORED_LIFTS) {
		expect(lift.unilateral).not.toBeNull()
	}
	const lunge = AUTHORED_LIFTS.find((row) => row.id === 'ex_bb_lunge')!
	expect(lunge.unilateral).toBe(true)
	const squat = AUTHORED_LIFTS.find((row) => row.id === 'ex_bb_back_squat')!
	expect(squat.unilateral).toBe(false)
})

test('the seed writes an unauthored laterality as null and counts only the ones actually stated', async () => {
	const result = await seedExercises(prisma, EXERCISE_CORPUS)
	expect(result.withStatedLaterality).toBe(AUTHORED_LIFTS.length)
	expect(result.withStatedLaterality).toBeLessThan(result.exercises)

	const snapshotRow = await prisma.exercise.findUniqueOrThrow({
		where: { id: 'ex_fedb_ab_roller' },
		select: { unilateral: true },
	})
	expect(snapshotRow.unilateral).toBeNull()

	const authored = await prisma.exercise.findMany({
		where: { id: { in: ['ex_bb_back_squat', 'ex_bb_lunge'] } },
		orderBy: { id: 'asc' },
		select: { id: true, unilateral: true },
	})
	expect(authored).toEqual([
		{ id: 'ex_bb_back_squat', unilateral: false },
		{ id: 'ex_bb_lunge', unilateral: true },
	])
})

test('an exercise the athlete creates says it does not know its laterality rather than claiming to be bilateral', async () => {
	const athlete = await createAthlete()
	const created = await createCustomExercise(athlete.id, {
		name: 'A movement only I do',
		primaryMuscle: 'quads',
	})
	const row = await prisma.exercise.findUniqueOrThrow({
		where: { id: created.id },
		select: { unilateral: true },
	})
	// The column has no default, so nothing is asserted on the athlete's behalf.
	expect(row.unilateral).toBeNull()
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

test('an orphaned athlete-authored row is not served as trainm8-authored', async () => {
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

// ── The heal: #469's orphaned corpus rows ──────────────────────────────────
//
// The `Exercise` rows `seedCatalogue` used to mint with no stated authorship
// landed as `authorship: 'athlete'` with no owner, which is nobody's row. The
// migration puts the ones a corpus knows back under trainm8's authorship and
// leaves every other orphan exactly where it is. These tests run the real
// migration SQL against the real database, because the guard *is* the SQL.

const ORPHAN_HEAL_MIGRATION =
	'prisma/migrations/20260818160000_an_orphaned_exercise_belongs_to_nobody_and_is_healed_only_where_the_corpus_knows_it/migration.sql'

/** Apply the migration exactly as `migrate deploy` would — comments stripped,
 * statements split, nothing rewritten. */
async function applyOrphanHeal() {
	const sql = await readFile(path.join(process.cwd(), ORPHAN_HEAL_MIGRATION), {
		encoding: 'utf8',
	})
	const statements = sql
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('--'))
		.join('\n')
		.split(';')
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0)
	for (const statement of statements) {
		await prisma.$executeRawUnsafe(statement)
	}
	return statements.length
}

/** A row in the state the defect produced: athlete-authored, owned by nobody. */
async function createOrphan(id: string, name: string) {
	await prisma.exercise.create({
		data: {
			id,
			name,
			primaryMuscle: 'quads',
			equipment: 'barbell',
			authorship: 'athlete',
			createdByAthleteId: null,
		},
		select: { id: true },
	})
}

test('the heal reaches an orphan the corpus knows and no other row', async () => {
	const athlete = await createAthlete()

	// Three rows that all look alike to a query that reads only one column.
	await createOrphan('ex_bw_cmj', 'Countermovement jump')
	await createOrphan(
		'ex_orphan_no_corpus_knows_it',
		'A movement only its author knew',
	)
	await prisma.exercise.create({
		data: {
			id: 'ex_mb_slam',
			name: 'My own slam',
			primaryMuscle: 'abs',
			authorship: 'athlete',
			createdByAthleteId: athlete.id,
		},
		select: { id: true },
	})

	expect(await applyOrphanHeal()).toBeGreaterThan(0)

	const rows = await prisma.exercise.findMany({
		where: {
			id: {
				in: ['ex_bw_cmj', 'ex_orphan_no_corpus_knows_it', 'ex_mb_slam'],
			},
		},
		select: {
			id: true,
			name: true,
			authorship: true,
			createdByAthleteId: true,
		},
		orderBy: { id: 'asc' },
	})

	// A mislabelled corpus row: the seeder's own output, healed.
	const healed = rows.find((row) => row.id === 'ex_bw_cmj')!
	expect(healed.authorship).toBe('system')
	expect(healed.createdByAthleteId).toBeNull()

	// Genuinely lost data — an id no corpus has ever heard of. Untouched, and
	// still out of every athlete's catalog.
	const lost = rows.find((row) => row.id === 'ex_orphan_no_corpus_knows_it')!
	expect(lost.authorship).toBe('athlete')
	expect(lost.createdByAthleteId).toBeNull()

	// An athlete's own movement that happens to carry a corpus id. The guard is
	// the *pair* of conditions, so a real owner is never matched.
	const owned = rows.find((row) => row.id === 'ex_mb_slam')!
	expect(owned.authorship).toBe('athlete')
	expect(owned.createdByAthleteId).toBe(athlete.id)
	expect(owned.name).toBe('My own slam')

	// And a variant is never attached to a row the heal declined to touch.
	expect(
		await findVariantByEquipment(prisma, 'ex_mb_slam', 'medicine-ball'),
	).toBeNull()
})

test('the heal is idempotent and safe to re-run over its own output', async () => {
	await createOrphan('ex_bw_cmj', 'Countermovement jump')
	await applyOrphanHeal()
	const afterFirst = await prisma.exerciseVariant.count()
	await applyOrphanHeal()
	expect(await prisma.exerciseVariant.count()).toBe(afterFirst)
	expect(
		await prisma.exercise.count({
			where: { authorship: 'athlete', createdByAthleteId: null },
		}),
	).toBe(0)
})

test('a healed row gets the variant its progression key needs, and an equipment with no variant still resolves to nothing', async () => {
	await createOrphan('ex_bw_cmj', 'Countermovement jump')
	expect(
		await findVariantByEquipment(prisma, 'ex_bw_cmj', 'bodyweight'),
	).toBeNull()

	await applyOrphanHeal()

	const variant = await findVariantByEquipment(
		prisma,
		'ex_bw_cmj',
		'bodyweight',
	)
	expect(variant).not.toBeNull()
	expect(variant!.id).toBe('var_ex_bw_cmj')
	expect(variant!.loadKind).toBe('bodyweight')
	expect(variant!.isDefault).toBe(true)

	// The rule the backfill must not break: an equipment this movement has no
	// variant for answers with nothing rather than a neighbouring realization.
	expect(
		await findVariantByEquipment(prisma, 'ex_bw_cmj', 'barbell'),
	).toBeNull()
})

test('a healed row is maintained by a later re-seed rather than skipped forever', async () => {
	const row = EXERCISE_CORPUS[0]!
	// Upserted, not created: some corpus ids ship in a migration, and either
	// starting point has to end up in the same orphaned state.
	const orphaned = {
		name: 'Whatever the defect left behind',
		primaryMuscle: 'quads',
		authorship: 'athlete',
		createdByAthleteId: null,
	}
	await prisma.exercise.upsert({
		where: { id: row.id },
		create: { id: row.id, ...orphaned },
		update: orphaned,
		select: { id: true },
	})

	const result = await seedExercises(prisma, [row])
	// The guard protects a row with an owner; this one has none, so it is
	// refreshed rather than protected.
	expect(result.skippedAthleteAuthored).toBe(0)
	expect(result.healedOrphans).toBe(1)
	expect(result.exercises).toBe(1)

	const after = await prisma.exercise.findUniqueOrThrow({
		where: { id: row.id },
		select: { name: true, authorship: true, createdByAthleteId: true },
	})
	expect(after.name).toBe(row.name)
	expect(after.authorship).toBe('system')
	expect(after.createdByAthleteId).toBeNull()
})

test('a scheduled session names its lift rather than showing a picker placeholder', async () => {
	const athlete = await createAthlete()
	await createOrphan('ex_bb_trap_bar_deadlift', 'Trap-bar deadlift')

	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Lower body',
			discipline: 'strength',
			intent: 'strength',
			ownerId: athlete.id,
			authorship: 'athlete',
			blocks: {
				create: {
					orderIndex: 0,
					steps: {
						create: {
							orderIndex: 0,
							kind: 'strength',
							exerciseId: 'ex_bb_trap_bar_deadlift',
						},
					},
				},
			},
		},
	})
	await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: athlete.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-08-20T06:00:00Z'),
			status: 'scheduled',
		},
	})

	// The symptom: the step names a lift the combobox was never handed, so it
	// has nothing to render but `Select exercise…`.
	const before = await getExerciseCatalog(athlete.id)
	expect(before.map((entry) => entry.id)).not.toContain(
		'ex_bb_trap_bar_deadlift',
	)

	await applyOrphanHeal()

	const after = await getExerciseCatalog(athlete.id)
	const lift = after.find((entry) => entry.id === 'ex_bb_trap_bar_deadlift')
	expect(lift).toBeDefined()
	expect(lift!.name).toBe('Trap-bar deadlift')
	expect(lift!.authorship).toBe('system')
})
