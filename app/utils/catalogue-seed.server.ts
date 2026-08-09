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
	stockEntryId,
	stockWorkoutId,
} from './catalogue-corpus.all.ts'
import { type CorpusSession } from './catalogue-corpus.ts'
import { buildBlocksCreate } from './workout.server.ts'

/** The subset of the client this seed needs — so a test can pass the real one
 * and nothing here reaches for a module-level singleton. */
type SeedClient = Pick<
	PrismaClient,
	| 'workout'
	| 'catalogueEntry'
	| 'catalogueEntryPhase'
	| 'catalogueEntryGoalEvent'
>

export type CatalogueSeedResult = {
	/** Rows written or refreshed. */
	seeded: number
	/** Of those, how many claim a published **Citation**. */
	cited: number
	/** Of those, how many trainm8 wrote itself — no source, and none claimed. */
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
		seeded: corpus.length,
		cited: corpus.filter((session) => session.citation != null).length,
		handWritten: corpus.filter(
			(session) => session.provenance === 'hand-written',
		).length,
	}
}
