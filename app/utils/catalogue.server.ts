/**
 * The **Catalogue**'s server half (ADR 0051) — membership, collection, the fork,
 * and the back-pointer a fork keeps to what it came from.
 *
 * The vocabularies and the tier derivation live in `catalogue.ts`; nothing in
 * this file re-derives them.
 */
import { type Prisma } from '@prisma/client'
import {
	type CatalogueGoalEvent,
	type CataloguePhase,
	type SessionArchetype,
} from './catalogue.ts'
import { prisma } from './db.server.ts'
import { copyWorkout, workoutCopySelect } from './workout.server.ts'

/** How far a lineage walk will follow `copiedFromId` before giving up. */
const MAX_LINEAGE_HOPS = 16

export const catalogueEntrySelect = {
	id: true,
	workoutId: true,
	archetype: true,
	level: true,
	citationAuthor: true,
	citationWork: true,
	citationYear: true,
	citationLocator: true,
	progressesToId: true,
	regressesToId: true,
	retiredAt: true,
	phases: { select: { phase: true }, orderBy: { phase: 'asc' as const } },
	goalEvents: {
		select: { goalEvent: true },
		orderBy: { goalEvent: 'asc' as const },
	},
} satisfies Prisma.CatalogueEntrySelect

export type CatalogueEntryRow = Prisma.CatalogueEntryGetPayload<{
	select: typeof catalogueEntrySelect
}>

/**
 * Retrieve from the corpus, filtered by the four facets `workouts-running.md`
 * §13.1 names: `archetype × phase × goalEvent × level`.
 *
 * Two things this query says on purpose.
 *
 * **Retired rows are not retrievable.** `retiredAt` exists so a stock session
 * later found mis-cited stops being offered *without* vanishing from the plans
 * that already used it — the row survives, and a fork's back-pointer still
 * resolves through it.
 *
 * **Membership is read off asserted authorship, never off `ownerId IS NULL`.**
 * That is the correction this whole model exists for: `getExerciseCatalog` asks
 * `createdByAthleteId: null` and therefore serves an orphaned athlete-authored
 * row to everyone as a trainm8-authored entry. A `community` arm is absent
 * because `public` visibility and the publish flow that produces it land whole
 * in #452 — not because the axis is missing.
 */
export async function listCatalogue({
	viewerId,
	discipline,
	archetype,
	phase,
	goalEvent,
}: {
	viewerId: string
	discipline?: string
	archetype?: SessionArchetype
	phase?: CataloguePhase
	goalEvent?: CatalogueGoalEvent
}) {
	return prisma.catalogueEntry.findMany({
		where: {
			retiredAt: null,
			archetype,
			phases: phase == null ? undefined : { some: { phase } },
			goalEvents: goalEvent == null ? undefined : { some: { goalEvent } },
			workout: {
				discipline,
				OR: [{ authorship: 'system' }, { ownerId: viewerId }],
			},
		},
		select: {
			...catalogueEntrySelect,
			workout: {
				select: {
					id: true,
					title: true,
					description: true,
					discipline: true,
					intent: true,
					authorship: true,
					ownerId: true,
				},
			},
		},
		orderBy: { workout: { title: 'asc' } },
	})
}

/**
 * **Membership** — offer a Workout for reuse.
 *
 * The Workout's `authorship` is read here and written onto the entry rather than
 * taken from the caller. `CatalogueEntry.workoutAuthorship` exists so the
 * citation rule can be an intra-row CHECK, and the composite foreign key already
 * rejects a mismatch — but a caller that has to *restate* the parent's
 * discriminator is a caller that can state it wrongly, and the resulting foreign
 * key error says nothing about why. Both columns default to `'athlete'`, which
 * agrees, so the failure only bites on the system rows the seed writes: exactly
 * the ones that matter.
 */
export async function createCatalogueEntry(
	workoutId: string,
	entry: Omit<
		Prisma.CatalogueEntryUncheckedCreateInput,
		'workoutId' | 'workoutAuthorship'
	>,
) {
	const workout = await prisma.workout.findUnique({
		where: { id: workoutId },
		select: { authorship: true },
	})
	if (!workout) return null
	return prisma.catalogueEntry.create({
		data: { ...entry, workoutId, workoutAuthorship: workout.authorship },
		select: catalogueEntrySelect,
	})
}

/**
 * **Collection** — put a Workout in this athlete's list. Idempotent, and it
 * copies nothing: the save points at the original, so the citation an athlete
 * reads is the original's and cannot degrade over copies-of-copies. The copy
 * happens later, at the first edit (see {@link forkCatalogueWorkout}).
 */
export async function saveToCatalogueList(userId: string, workoutId: string) {
	return prisma.catalogueSave.upsert({
		where: { workoutId_ownerId: { workoutId, ownerId: userId } },
		create: { workoutId, ownerId: userId },
		update: {},
		select: { id: true },
	})
}

/** Take a Workout back out of this athlete's list. Idempotent. */
export async function removeFromCatalogueList(
	userId: string,
	workoutId: string,
) {
	const { count } = await prisma.catalogueSave.deleteMany({
		where: { workoutId, ownerId: userId },
	})
	return { removed: count > 0 }
}

/** Is this Workout in the viewer's list — the facet that is *not* a tier. */
export async function isInCatalogueList(userId: string, workoutId: string) {
	const save = await prisma.catalogueSave.findUnique({
		where: { workoutId_ownerId: { workoutId, ownerId: userId } },
		select: { id: true },
	})
	return save != null
}

/**
 * How many athletes have adopted this row.
 *
 * **A ranking input, never a displayed number.** `GOAL.md`'s permanent no is on
 * followers, kudos and comments — the vanity layer — and a "847 saves 🔥" badge
 * on a workout card is that layer arriving through the back door. A corpus that
 * *ranks* by what athletes adopt is the opposite of vanity; the same column
 * reads as a different product depending on whether it is shown. Callers that
 * render this number are wrong.
 */
export async function catalogueAdoptionCount(workoutId: string) {
	return prisma.catalogueSave.count({ where: { workoutId } })
}

/**
 * **Fork-on-write.** Deep-copy a Catalogue Workout into an athlete-owned one and
 * record the back-pointer to what it was forked from.
 *
 * The copy happens at the **first edit** and never at save time. Three things
 * that buys which copy-on-save cannot: adoption stays countable (a save is one
 * row against one original, where copy-on-save makes every save a distinct
 * Workout and the corpus can never report what works); attribution survives
 * unforked (the citation shown is the original's, reached through the pointer
 * rather than copied onto the fork, so it cannot drift and `retiredAt` keeps
 * working); and nothing shared is ever mutated in place, because the fork
 * happens before the first write.
 *
 * The back-pointer is `Workout.copiedFromId`, and it is one field doing the job
 * for both this and #460's adopted sessions — one rule across both: never edit
 * the machine-written or corpus-written artifact in place.
 */
export async function forkCatalogueWorkout(
	tx: Prisma.TransactionClient,
	workoutId: string,
	ownerId: string,
	overrides: { title?: string } = {},
): Promise<{ id: string } | null> {
	const source = await tx.workout.findUnique({
		where: { id: workoutId },
		select: workoutCopySelect,
	})
	if (!source) return null
	return copyWorkout(tx, source, ownerId, {
		...overrides,
		copiedFromId: source.id,
	})
}

/**
 * Walk `copiedFromId` back to the **Catalogue Entry** this Workout descends
 * from, or `null` where it descends from nothing in the corpus.
 *
 * A walk rather than one hop, because lineage is a chain: a fork of a fork still
 * came from the corpus, and the citation it should show is the corpus row's. The
 * hop cap is a guard against a cycle the schema cannot forbid — SQLite's CHECK
 * can only rule out a row pointing at itself, not a longer loop.
 *
 * A **retired** entry is still returned. Retirement stops a row being
 * *retrievable*; it does not rewrite where an existing session came from, and a
 * plan that already used it must keep reading its source.
 */
export async function resolveCatalogueOrigin(
	workoutId: string,
): Promise<CatalogueEntryRow | null> {
	const seen = new Set<string>()
	let currentId: string | null = workoutId

	for (let hop = 0; hop < MAX_LINEAGE_HOPS && currentId != null; hop++) {
		if (seen.has(currentId)) return null
		seen.add(currentId)

		const workout: {
			copiedFromId: string | null
			catalogueEntry: CatalogueEntryRow | null
		} | null = await prisma.workout.findUnique({
			where: { id: currentId },
			select: {
				copiedFromId: true,
				catalogueEntry: { select: catalogueEntrySelect },
			},
		})
		if (!workout) return null
		if (workout.catalogueEntry) return workout.catalogueEntry
		currentId = workout.copiedFromId
	}

	return null
}
