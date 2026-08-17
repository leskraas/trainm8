/**
 * The **exercise database**'s seed entrypoint (Slice 6): write the corpus into
 * `Exercise`, its `ExerciseVariant` realizations and its search-only
 * `ExerciseAlias` rows.
 *
 * ## Why a seed and not a migration
 *
 * The same three reasons `catalogue-seed.server.ts` states: the corpus is
 * **content** and moves on its own clock, a migration cannot be typechecked or
 * validated, and seven hundred rows of hand-written SQL is a place a transposed
 * field is invisible. Migration `20260814120000` created the tables and one
 * default variant per already-seeded exercise; this fills them.
 *
 * ## The three rules this writer keeps
 *
 * 1. **It never clobbers an athlete's own exercise.** A row whose `authorship`
 *    is `'athlete'` is skipped whole — id collisions are not expected, since
 *    every corpus id is a stable literal and an athlete's is a cuid, but "not
 *    expected" is not an invariant and a seed that overwrites an athlete's
 *    movement takes their history's referent with it.
 * 2. **It is idempotent.** Every row is upserted on a stable id — `ex_…` for
 *    the exercise, `var_…` for the variant (the scheme the migration's backfill
 *    used, so this lands on those rows rather than beside them) — and aliases
 *    on their `(exerciseId, text, locale)` key. Re-running changes nothing.
 * 3. **It asserts authorship.** `authorship: 'system'` with
 *    `createdByAthleteId: null`, stated together because the migration's CHECK
 *    is the implication between them (#469). Nothing here infers authorship
 *    from a null owner, and nothing reading these rows should either.
 *
 * The **progression key is `(exerciseId, equipment)`**, so a variant is written
 * per equipment and `findVariantByEquipment` is how a caller resolves one. A
 * bare exercise id resolves to the default variant and never to "whichever row
 * came back first".
 */
import { type PrismaClient } from '@prisma/client'
import {
	EXERCISE_CORPUS,
	exerciseVariantId,
	type SeedExercise,
} from './exercise-corpus.ts'

/** The subset of the client this seed needs, so a test passes the real one and
 * nothing here reaches for a module-level singleton. */
type SeedClient = Pick<
	PrismaClient,
	'exercise' | 'exerciseVariant' | 'exerciseAlias'
>

export type ExerciseSeedResult = {
	/** `Exercise` rows written or refreshed. */
	exercises: number
	/** `ExerciseVariant` rows written or refreshed. */
	variants: number
	/** `ExerciseAlias` rows written or refreshed. */
	aliases: number
	/** Corpus rows whose id is already an **athlete-authored** exercise, and
	 * which were therefore left exactly as the athlete wrote them. */
	skippedAthleteAuthored: number
	/** Of the rows written, how many state a **movement pattern**. The rest say
	 * null, which is a stated absence and not a gap to be filled by guessing. */
	withMovementPattern: number
}

/** Write (or refresh) one corpus row, its variants and its aliases. */
async function seedExercise(prisma: SeedClient, row: SeedExercise) {
	const facets = {
		name: row.name,
		primaryMuscle: row.primaryMuscle,
		secondaryMuscles:
			row.secondaryMuscles === null
				? null
				: JSON.stringify(row.secondaryMuscles),
		equipment: row.equipment,
		isCompound: row.isCompound,
		movementPattern: row.movementPattern,
		unilateral: row.unilateral,
		variationGroupId: row.variationGroupId,
		authorship: 'system',
		createdByAthleteId: null,
	}

	await prisma.exercise.upsert({
		where: { id: row.id },
		create: { id: row.id, ...facets },
		update: facets,
		select: { id: true },
	})

	for (const [index, variant] of row.variants.entries()) {
		const isDefault = index === 0
		const id = exerciseVariantId(row.id, variant, isDefault)
		const variantFacets = {
			exerciseId: row.id,
			equipment: variant.equipment,
			angle: variant.angle ?? null,
			displayName: variant.displayName,
			loadKind: variant.loadKind,
			barKg: variant.barKg ?? null,
			perSideMultiplier: variant.perSideMultiplier ?? 2,
			isFixed: variant.isFixed ?? false,
			isAssisting: variant.isAssisting ?? false,
			useBodyweightForBar: variant.useBodyweightForBar ?? false,
			isDefault,
		}
		await prisma.exerciseVariant.upsert({
			where: { id },
			create: { id, ...variantFacets },
			update: variantFacets,
			select: { id: true },
		})
	}

	for (const text of row.aliases) {
		// `variantId` stays null: these name the **movement** ("OHP", "military
		// press"), and an alias is search-only in either case — nothing may be
		// logged against one, or there are two histories for one movement.
		await prisma.exerciseAlias.upsert({
			where: {
				exerciseId_text_locale: { exerciseId: row.id, text, locale: 'en' },
			},
			create: { exerciseId: row.id, text, locale: 'en' },
			update: {},
			select: { id: true },
		})
	}
}

/**
 * Seed (or refresh) the whole exercise corpus.
 *
 * Rows an athlete authored are read first and skipped, so an athlete's own
 * movement is never overwritten by a corpus row that happens to share its id.
 */
export async function seedExercises(
	prisma: SeedClient,
	corpus: SeedExercise[] = EXERCISE_CORPUS,
): Promise<ExerciseSeedResult> {
	const athleteAuthored = await prisma.exercise.findMany({
		where: { id: { in: corpus.map((row) => row.id) }, authorship: 'athlete' },
		select: { id: true },
	})
	const owned = new Set(athleteAuthored.map((row) => row.id))

	const result: ExerciseSeedResult = {
		exercises: 0,
		variants: 0,
		aliases: 0,
		skippedAthleteAuthored: 0,
		withMovementPattern: 0,
	}

	for (const row of corpus) {
		if (owned.has(row.id)) {
			result.skippedAthleteAuthored += 1
			continue
		}
		await seedExercise(prisma, row)
		result.exercises += 1
		result.variants += row.variants.length
		result.aliases += row.aliases.length
		if (row.movementPattern !== null) result.withMovementPattern += 1
	}

	return result
}

/**
 * The variant a `(exerciseId, equipment)` pair names — **the progression key**.
 *
 * Returns `null` rather than a neighbouring realization when the exercise has
 * no variant for that equipment: a dumbbell bench press is not a barbell bench
 * press with a different number on it, and answering with one would merge two
 * histories that progress independently.
 */
export async function findVariantByEquipment(
	prisma: SeedClient,
	exerciseId: string,
	equipment: string,
) {
	const variants = await prisma.exerciseVariant.findMany({
		where: { exerciseId, equipment },
		orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
	})
	return variants[0] ?? null
}
