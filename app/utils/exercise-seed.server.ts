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
 * 1. **It never clobbers an athlete's own exercise.** A row that is
 *    athlete-authored **and still owned** — `authorship: 'athlete'` with a
 *    non-null `createdByAthleteId` — is skipped whole. Id collisions are not
 *    expected, since every corpus id is a stable literal and an athlete's is a
 *    cuid, but "not expected" is not an invariant and a seed that overwrites an
 *    athlete's movement takes their history's referent with it. **An ownerless
 *    athlete-authored row is a different case and is healed, not protected** —
 *    see `isAthleteOwned` below (#469).
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
import { saveExerciseVariant } from './exercise-variants.server.ts'

/** The subset of the client this seed needs, so a test passes the real one and
 * nothing here reaches for a module-level singleton. */
type SeedClient = Pick<
	PrismaClient,
	'exercise' | 'exerciseVariant' | 'exerciseAlias' | 'exerciseSetLog'
>

export type ExerciseSeedResult = {
	/** `Exercise` rows written or refreshed. */
	exercises: number
	/** `ExerciseVariant` rows written or refreshed. */
	variants: number
	/** `ExerciseAlias` rows written or refreshed. */
	aliases: number
	/** Corpus rows whose id is already an exercise an athlete authored **and
	 * still owns**, and which were therefore left exactly as the athlete wrote
	 * them. */
	skippedAthleteAuthored: number
	/** Corpus rows that were sitting as **orphans** — `authorship: 'athlete'`
	 * with no owner — and which this run put back under trainm8's authorship
	 * (#469). An orphan belongs to nobody, so refreshing it takes nothing from
	 * anybody; leaving it alone froze it out of the shared catalog forever. */
	healedOrphans: number
	/** Of the rows written, how many state a **movement pattern**. The rest say
	 * null, which is a stated absence and not a gap to be filled by guessing. */
	withMovementPattern: number
	/** Of the rows written, how many state **laterality** at all — `true` or
	 * `false`. The rest say null, and null is *"nobody stated it"*: writing
	 * `false` there would make an unauthored row claim to be bilateral, which is
	 * the defect ADR 0061 records. */
	withStatedLaterality: number
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
		// **Through the write path, which can refuse.** The default variant's id is
		// `var_<exerciseId>` with no equipment in it, so a corpus row whose first
		// variant changes equipment would land this upsert on the *same* row and
		// restate what every set logged against it was lifted on. That is not a
		// correction; it is a different realization, and it needs a new variant. The
		// seed does not paper over it — it stops, naming the row, because a corpus
		// that says something else than the history keyed on it is a bug to fix in
		// `exercise-corpus.ts` and not a condition to survive.
		const written = await saveExerciseVariant(prisma, id, variantFacets)
		if (!written.ok) {
			throw new Error(
				`refusing to re-seed variant ${id}: ${written.explanation}`,
			)
		}
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
 * **The row a corpus seed may not touch: one an athlete authored _and still
 * owns_.**
 *
 * The guard protects an athlete's own movement, and ownership is what makes it
 * theirs. Two conditions, and the distinction between them is the whole of
 * #469:
 *
 * - `authorship: 'athlete'` **with** a `createdByAthleteId` — somebody's
 *   movement, with somebody's history hanging off it. Never written by a seed.
 * - `authorship: 'athlete'` **without** one — an **orphan**. It belongs to
 *   nobody, `getExerciseCatalog` correctly refuses to serve it to anybody, and
 *   the old guard's `authorship: 'athlete'` test froze it in that state
 *   permanently: no athlete could reach it and no seed would repair it. A row
 *   nobody owns has nobody to protect, so it is refreshed like any corpus row.
 *
 * This is deliberately *not* inferred the other way round: authorship is
 * asserted, and a system row still says `'system'` with a null owner. Only the
 * `'athlete'` + null pair is an orphan.
 */
const ATHLETE_OWNED = {
	authorship: 'athlete',
	createdByAthleteId: { not: null },
} as const

/**
 * Seed (or refresh) the whole exercise corpus.
 *
 * Rows an athlete authored **and still owns** are read first and skipped, so an
 * athlete's own movement is never overwritten by a corpus row that happens to
 * share its id. Orphaned rows are read too — and refreshed, which is what heals
 * them (#469).
 */
export async function seedExercises(
	prisma: SeedClient,
	corpus: SeedExercise[] = EXERCISE_CORPUS,
): Promise<ExerciseSeedResult> {
	const ids = corpus.map((row) => row.id)
	const athleteOwned = await prisma.exercise.findMany({
		where: { id: { in: ids }, ...ATHLETE_OWNED },
		select: { id: true },
	})
	const owned = new Set(athleteOwned.map((row) => row.id))

	const orphaned = await prisma.exercise.findMany({
		where: { id: { in: ids }, authorship: 'athlete', createdByAthleteId: null },
		select: { id: true },
	})
	const orphans = new Set(orphaned.map((row) => row.id))

	const result: ExerciseSeedResult = {
		exercises: 0,
		variants: 0,
		aliases: 0,
		skippedAthleteAuthored: 0,
		healedOrphans: 0,
		withMovementPattern: 0,
		withStatedLaterality: 0,
	}

	for (const row of corpus) {
		if (owned.has(row.id)) {
			result.skippedAthleteAuthored += 1
			continue
		}
		if (orphans.has(row.id)) result.healedOrphans += 1
		await seedExercise(prisma, row)
		result.exercises += 1
		result.variants += row.variants.length
		result.aliases += row.aliases.length
		if (row.movementPattern !== null) result.withMovementPattern += 1
		if (row.unilateral !== null) result.withStatedLaterality += 1
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
