/**
 * The **Catalogue**'s seed entrypoint (#451): write the research corpus into
 * **Stock Workouts** and their **Catalogue Entries**.
 *
 * ## Why this is a seed script and not a migration
 *
 * ADR 0051 and `CONTEXT.md` both said "seeded in a migration, on the precedent
 * `Exercise` set". This does it in the seed instead, and the ADR is amended to
 * say so. Three reasons, in order of how much they matter:
 *
 * 1. **The corpus is content, and content changes without a schema change.** A
 *    mis-cited row gets `retiredAt` and a corrected one gets re-seeded; neither
 *    is a schema event, and a migration is the wrong vehicle for a thing that
 *    moves on its own clock.
 * 2. **A migration cannot be validated.** Every row here is checked against
 *    `WorkoutStructureSchema` and `IntensityTargetSchema` by
 *    `catalogue-corpus.test.ts` before it is ever written. The same corpus as
 *    hand-written SQL is a few thousand lines nothing can typecheck, in which a
 *    transposed `minPct` is invisible.
 * 3. `Exercise` is a precedent for *a flat vocabulary of fifty names*, not for
 *    a hundred-odd Workout → Block → Step trees carrying JSON discriminated
 *    unions.
 *
 * ## Two things this deliberately does not do
 *
 * **It does not go through the session editor.** The Conform-backed draft/form
 * editor drops the facets #450 added — cadence, grade, vertical, rest form,
 * send-off, series, load — on a round trip. The seed writes through
 * `buildBlocksCreate`, the same builder detection materialization uses, which
 * carries all of them. Routing a seeded row through the editor would silently
 * strip exactly the fields the corpus exists to express.
 *
 * **It does not resolve any intensity.** Nothing here reads an athlete's
 * thresholds or bakes a pace: a corpus row is portable by construction and
 * resolves per athlete at read time. That is also why `intensity*` cache
 * columns are left null.
 */
import { type PrismaClient } from '@prisma/client'
import {
	CATALOGUE_CORPUS,
	STRENGTH_EXERCISES,
	stockEntryId,
	stockWorkoutId,
} from './catalogue-corpus.all.ts'
import { type CorpusSession } from './catalogue-corpus.ts'
import {
	EXERCISE_CORPUS,
	defaultVariantFor,
	type SeedExercise,
} from './exercise-corpus.ts'
import { seedExercises } from './exercise-seed.server.ts'
import { buildBlocksCreate } from './workout.server.ts'

/**
 * The strength corpus's own **Exercise** rows, in the shape the exercise
 * database's writer takes.
 *
 * Two things this shape states, both of them #469's subject:
 *
 * 1. **A default `ExerciseVariant`**, derived from the row's equipment by the
 *    same `defaultVariantFor` the corpus uses everywhere else. Without one the
 *    progression key `(exerciseId, equipment)` resolved to nothing for every
 *    row here — a jump squat had no realization to log a set against.
 * 2. **Nulls that are stated, not guessed.** No open source carries a movement
 *    pattern, a laterality or a secondary-muscle list for these rows, so they
 *    say so. `null` is *"nobody stated it"*, and writing `false` for
 *    `unilateral` would make a single-leg hop claim to be bilateral (ADR 0061).
 *
 * **Where `EXERCISE_CORPUS` already carries the id, its row wins.** Three of
 * them do — the RFE split squat, the suitcase carry and the Pallof press — and
 * they have since been authored there with a movement pattern, a laterality,
 * aliases and richer variants. Writing the thinner row over them would erase
 * those facets, and which of the two seeders ran last would decide the outcome.
 * The row is still written here rather than skipped, because the strength
 * corpus's own steps have a foreign key into it and this seeder runs first.
 */
const AUTHORED_BY_ID = new Map(EXERCISE_CORPUS.map((row) => [row.id, row]))
export const STRENGTH_EXERCISE_CORPUS: SeedExercise[] = STRENGTH_EXERCISES.map(
	(row) => {
		const authored = AUTHORED_BY_ID.get(row.id)
		if (authored) return authored
		const exercise = { ...row, secondaryMuscles: null }
		return {
			...exercise,
			movementPattern: null,
			unilateral: null,
			variationGroupId: null,
			aliases: [],
			variants: [defaultVariantFor(exercise)],
		}
	},
)

/** The subset of the client this seed needs — so a test can pass the real one
 * and nothing here reaches for a module-level singleton. */
type SeedClient = Pick<
	PrismaClient,
	| 'workout'
	| 'catalogueEntry'
	| 'catalogueEntryPhase'
	| 'catalogueEntryGoalEvent'
	| 'exercise'
	| 'exerciseVariant'
	| 'exerciseAlias'
	// Needed only because this seeder writes exercises through `seedExercises`,
	// whose variant writer asks whether any logged set is keyed on the equipment
	// it is about to restate.
	| 'exerciseSetLog'
>

export type CatalogueSeedResult = {
	/** **Exercise** catalog rows the strength corpus needed and added. */
	exercises: number
	/** Of those, how many were **orphans** — `authorship: 'athlete'` with no
	 * owner — that this run put back under trainm8's authorship. This seeder
	 * minted every one of them, by upserting with no stated authorship and
	 * letting the column default to `'athlete'` (#469). */
	healedOrphanExercises: number
	/** Rows written or refreshed. */
	seeded: number
	/** Of those, how many claim a published **Citation**. */
	cited: number
	/** How many are coaching convention with no publication behind them. */
	convention: number
	/** How many trainm8 wrote itself — no source, and none claimed. */
	handWritten: number
}

function entryFacets(session: CorpusSession) {
	return {
		archetype: session.archetype,
		level: session.level,
		citationAuthor: session.citation?.author ?? null,
		citationWork: session.citation?.work ?? null,
		citationYear: session.citation?.year ?? null,
		citationLocator: session.citation?.locator ?? null,
	}
}

/**
 * Write one corpus row as a **Stock Workout** plus its **Catalogue Entry**.
 *
 * Upsert on a deterministic id rather than insert, so re-running the seed
 * refreshes the corpus in place: a `CatalogueSave`, a fork's `copiedFromId` and
 * another row's progression edge all keep resolving. The block tree is rebuilt
 * rather than diffed — nothing an athlete owns lives inside a stock row, since
 * saving copies nothing and the first edit forks (ADR 0051 §5).
 *
 * `authorship: 'system'` and `ownerId: null` are stated together because the
 * migration's CHECK is the implication between them, and asserting authorship
 * is the whole reason a null owner is safe to read.
 */
async function seedSession(prisma: SeedClient, session: CorpusSession) {
	const id = stockWorkoutId(session.key)
	const envelope = {
		title: session.title,
		description: session.description,
		discipline: session.discipline,
		intent: session.intent,
		// The **Session Archetype** is authored here since ADR 0055, and the entry's
		// own column is a component of a three-column foreign key into this one — so
		// the parent must be written first and must agree. That ordering is already
		// what this function does, and it is now load-bearing rather than incidental.
		archetype: session.archetype,
		authorship: 'system',
		ownerId: null,
	}

	const existing = await prisma.workout.findUnique({
		where: { id },
		select: { id: true },
	})
	if (existing) {
		await prisma.workout.update({
			where: { id },
			data: {
				...envelope,
				blocks: { deleteMany: {}, create: buildBlocksCreate(session.blocks) },
			},
			select: { id: true },
		})
	} else {
		await prisma.workout.create({
			data: {
				id,
				...envelope,
				blocks: { create: buildBlocksCreate(session.blocks) },
			},
			select: { id: true },
		})
	}

	const entryId = stockEntryId(session.key)
	await prisma.catalogueEntry.upsert({
		where: { id: entryId },
		create: {
			id: entryId,
			workoutId: id,
			// Restated from the parent because the composite foreign key requires
			// it to match, and it is what makes the citation rule an intra-row
			// CHECK rather than a convention.
			workoutAuthorship: 'system',
			...entryFacets(session),
		},
		update: entryFacets(session),
		select: { id: true },
	})

	// `phases` and `goalEvents` are rows with closed vocabularies (ADR 0044's
	// idiom): no rows is a positive statement — "not scoped" — rather than
	// "unknown". Replaced wholesale so a corrected scope shrinks as well as grows.
	await prisma.catalogueEntryPhase.deleteMany({ where: { entryId } })
	await prisma.catalogueEntryGoalEvent.deleteMany({ where: { entryId } })
	if (session.phases.length > 0) {
		await prisma.catalogueEntryPhase.createMany({
			data: session.phases.map((phase) => ({ entryId, phase })),
		})
	}
	if (session.goalEvents.length > 0) {
		await prisma.catalogueEntryGoalEvent.createMany({
			data: session.goalEvents.map((goalEvent) => ({ entryId, goalEvent })),
		})
	}
}

/**
 * Seed (or refresh) the whole corpus.
 *
 * Two passes, because progression edges point at other entries: every row is
 * written first, then the edges are wired. A `progressesTo` naming a key that
 * is not in the corpus is dropped rather than written as a dangling id — the
 * corpus test forbids one, so this is a belt on top of a brace.
 */
export async function seedCatalogue(
	prisma: SeedClient,
	corpus: CorpusSession[] = CATALOGUE_CORPUS,
): Promise<CatalogueSeedResult> {
	const keys = new Set(corpus.map((session) => session.key))

	// The strength rows reference exercises the shipped `Exercise` catalog does
	// not have — plyometric jumps, Olympic derivatives, the Copenhagen adduction.
	// They are catalog entries in the same sense the shipped ones are, so they go
	// through the exercise database's own writer, which asserts authorship and
	// gives each row its default **Exercise Variant** (#469).
	const exercises = await seedExercises(prisma, STRENGTH_EXERCISE_CORPUS)

	for (const session of corpus) {
		await seedSession(prisma, session)
	}

	for (const session of corpus) {
		const progressesToId =
			session.progressesTo && keys.has(session.progressesTo)
				? stockEntryId(session.progressesTo)
				: null
		const regressesToId =
			session.regressesTo && keys.has(session.regressesTo)
				? stockEntryId(session.regressesTo)
				: null
		if (progressesToId == null && regressesToId == null) continue
		await prisma.catalogueEntry.update({
			where: { id: stockEntryId(session.key) },
			data: { progressesToId, regressesToId },
			select: { id: true },
		})
	}

	return {
		exercises: exercises.exercises,
		healedOrphanExercises: exercises.healedOrphans,
		seeded: corpus.length,
		cited: corpus.filter((session) => session.citation != null).length,
		convention: corpus.filter((session) => session.provenance === 'convention')
			.length,
		handWritten: corpus.filter(
			(session) => session.provenance === 'hand-written',
		).length,
	}
}
