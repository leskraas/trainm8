/**
 * The **Catalogue**'s server half (ADR 0051) — membership, collection, the fork,
 * and the back-pointer a fork keeps to what it came from.
 *
 * The vocabularies and the tier derivation live in `catalogue.ts`; nothing in
 * this file re-derives them.
 */
import { type Prisma } from '@prisma/client'
import { localTimeUTC } from './athlete-calendar.ts'
import { DEFAULT_TRAINING_TIME } from './athlete-schema.ts'
import {
	CATALOGUE_LEVELS,
	type CatalogueGoalEvent,
	type CatalogueLevel,
	type CataloguePhase,
	type CatalogueTier,
	type SessionArchetype,
} from './catalogue.ts'
import { prisma } from './db.server.ts'
import { recomputePlannedTssForSession } from './load/planned-tss.server.ts'
import {
	MAX_LINEAGE_HOPS,
	copyWorkout,
	workoutCopySelect,
} from './workout.server.ts'

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
 * row to everyone as a trainm8-authored entry.
 *
 * **The third arm is the community tier** (#452, ADR 0052) — and it is the first
 * query in this app that is not owner-scoped. Two things ride on it. A `public`
 * row is here because an athlete *published* it, never because it was inherited:
 * `copyWorkout` writes `private` on every copy, so a fork of a shared session is
 * private until its new owner publishes it themselves. And a row the viewer has
 * **reported** drops out for that viewer at once — the half of report-and-takedown
 * that does not wait for a moderator (`community.server.ts`).
 */
/**
 * **Who may read a Catalogue row** — the whole of it, in one place.
 *
 * Extracted rather than inlined because there are two readers now: the list and
 * the single-row read that placement is gated on (#470). A guard that decides
 * whether an athlete may *see* a row and a guard that decides whether they may
 * *place* it have to be the same guard, and the only way to be sure of that is
 * for there to be one.
 *
 * The `reports` arm is the half of report-and-takedown that does not wait for a
 * moderator: a row this viewer reported is gone **for this viewer** at once
 * (ADR 0052). It is not a moderation state and never becomes one.
 */
function visibleToViewer(viewerId: string): Prisma.WorkoutWhereInput {
	return {
		OR: [
			{ authorship: 'system' },
			{ ownerId: viewerId },
			{ visibility: 'public' },
		],
		reports: { none: { reporterId: viewerId } },
	}
}

/**
 * The **Tier** narrowed in SQL. Tier is derived and viewer-relative
 * (`catalogueTier`), so it cannot be a column — but each of its three arms is
 * expressible as a predicate, which is what lets it be a facet rather than a
 * post-filter that would break the page count.
 */
function tierWhere(
	tier: CatalogueTier,
	viewerId: string,
): Prisma.WorkoutWhereInput {
	switch (tier) {
		case 'stock':
			return { authorship: 'system' }
		case 'mine':
			return { authorship: 'athlete', ownerId: viewerId }
		case 'community':
			return {
				authorship: 'athlete',
				visibility: 'public',
				NOT: { ownerId: viewerId },
			}
	}
}

/**
 * Which stated level floors suit an athlete at `level` — the SQL half of
 * `suitsLevel`. A row with **no** floor suits everybody, so the null arm is part
 * of the answer and not a gap in it.
 */
function suitsLevelWhere(
	level: CatalogueLevel,
): Prisma.CatalogueEntryWhereInput {
	const atOrBelow = CATALOGUE_LEVELS.slice(
		0,
		CATALOGUE_LEVELS.indexOf(level) + 1,
	)
	return { OR: [{ level: null }, { level: { in: [...atOrBelow] } }] }
}

export async function listCatalogue({
	viewerId,
	discipline,
	archetype,
	phase,
	goalEvent,
	level,
	tier,
	savedBy,
	q,
}: {
	viewerId: string
	discipline?: string
	archetype?: SessionArchetype
	phase?: CataloguePhase
	goalEvent?: CatalogueGoalEvent
	/** The athlete's level: rows whose floor is at or below it, plus unscoped rows. */
	level?: CatalogueLevel
	tier?: CatalogueTier
	/** Narrow to the rows this athlete has saved — a facet, never a tier. */
	savedBy?: string
	/** Free text over title and description. */
	q?: string
}) {
	const text = q?.trim()
	return prisma.catalogueEntry.findMany({
		where: {
			retiredAt: null,
			archetype,
			phases: phase == null ? undefined : { some: { phase } },
			goalEvents: goalEvent == null ? undefined : { some: { goalEvent } },
			AND: level == null ? undefined : [suitsLevelWhere(level)],
			workout: {
				discipline,
				...visibleToViewer(viewerId),
				...(tier == null ? {} : tierWhere(tier, viewerId)),
				catalogueSaves:
					savedBy == null ? undefined : { some: { ownerId: savedBy } },
				// A second `OR` at this level would overwrite the visibility clause, so
				// the text search rides in an `AND` beside it rather than merged into it.
				AND: text
					? [
							{
								OR: [
									{ title: { contains: text } },
									{ description: { contains: text } },
								],
							},
						]
					: undefined,
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
					visibility: true,
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
 *
 * The **archetype travels the other way**, and that is the asymmetry ADR 0055
 * introduces. Since the axis is authored on `Workout`, publishing a row *states*
 * its archetype on the parent, and the entry's column is the pinned copy the
 * three-column foreign key requires — so both writes are one transaction. A
 * caller still passes the archetype on the entry, because that is where it is
 * chosen; it simply also lands where it is now authored.
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
	return prisma.$transaction(async (tx) => {
		// Before the entry, never after: the entry's foreign key resolves against
		// this value, so an entry written first could not be written at all.
		await tx.workout.update({
			where: { id: workoutId },
			data: { archetype: entry.archetype },
		})
		return tx.catalogueEntry.create({
			data: { ...entry, workoutId, workoutAuthorship: workout.authorship },
			select: catalogueEntrySelect,
		})
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
 * The same question asked once for a whole page of rows.
 *
 * A `Set` and not a count per row: the list needs to know *whether* each row is
 * saved so it can offer the right control, and a per-row count would be the
 * displayed number the axis above forbids.
 */
export async function catalogueSavedIds(
	userId: string,
	workoutIds: string[],
): Promise<Set<string>> {
	if (workoutIds.length === 0) return new Set()
	const saves = await prisma.catalogueSave.findMany({
		where: { ownerId: userId, workoutId: { in: workoutIds } },
		select: { workoutId: true },
	})
	return new Set(saves.map((save) => save.workoutId))
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

/**
 * One retrievable row, read through the **same** visibility guard as the list.
 *
 * Anything the list would not show, this returns `null` for — including a row
 * the viewer has reported and a retired one. Placement is gated on this rather
 * than on the workout id alone, so a stale link cannot place a session the
 * athlete can no longer see.
 */
export async function readRetrievableEntry(
	viewerId: string,
	workoutId: string,
) {
	return prisma.catalogueEntry.findFirst({
		where: {
			workoutId,
			retiredAt: null,
			workout: visibleToViewer(viewerId),
		},
		select: {
			...catalogueEntrySelect,
			workout: {
				select: {
					id: true,
					title: true,
					description: true,
					discipline: true,
					authorship: true,
					ownerId: true,
					visibility: true,
					attribution: { select: { displayName: true, publishedAt: true } },
				},
			},
		},
	})
}

export type PlacementFailure = 'not-retrievable' | 'bad-date'

/**
 * **Place one session on the athlete's calendar** (#470).
 *
 * The mechanics are `writeSessions`' (`plan-generation/generate.server.ts`) and
 * deliberately not a second implementation of them: a fresh `copyWorkout` per
 * session with `copiedFromId` back at the corpus row, scheduled at the athlete's
 * `defaultTrainingTime` in their own zone. `Workout.sessions` is one-to-many, so
 * pointing a session at the corpus row itself would make one athlete's edit
 * everybody's.
 *
 * Two things differ from generation, and both follow from **who acted**
 * (ADR 0053 §4).
 *
 * `source` is `authored`. The athlete picked this row; nothing generated it, and
 * a season regeneration must not treat it as its own to replace.
 *
 * A **community** row is placeable here where generation retrieves stock-only.
 * Generation places what trainm8 can source, so it may only place what trainm8
 * stands behind; an athlete placing a session they read the non-vouch on is
 * their own choice about their own week.
 *
 * No `targetEventId`: a session an athlete placed on a date is not thereby
 * periodized toward an Event, and inventing that link would put a session into a
 * plan's arc that the plan never asked for.
 */
export async function placeCatalogueSession({
	athleteId,
	workoutId,
	date,
}: {
	athleteId: string
	workoutId: string
	/** `YYYY-MM-DD` in the athlete's own zone. */
	date: string
}): Promise<
	{ ok: true; sessionId: string } | { ok: false; reason: PlacementFailure }
> {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
		return { ok: false, reason: 'bad-date' }

	const entry = await readRetrievableEntry(athleteId, workoutId)
	if (!entry) return { ok: false, reason: 'not-retrievable' }

	const source = await prisma.workout.findUnique({
		where: { id: workoutId },
		select: workoutCopySelect,
	})
	if (!source) return { ok: false, reason: 'not-retrievable' }

	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: athleteId },
		select: { timezone: true, defaultTrainingTime: true },
	})
	const timezone = profile?.timezone ?? 'UTC'
	const trainingTime = profile?.defaultTrainingTime ?? DEFAULT_TRAINING_TIME

	const sessionId = await prisma.$transaction(
		async (tx: Prisma.TransactionClient) => {
			const copy = await copyWorkout(tx, source, athleteId, {
				copiedFromId: source.id,
			})
			const created = await tx.workoutSession.create({
				data: {
					userId: athleteId,
					workoutId: copy.id,
					scheduledAt: localTimeUTC(date, trainingTime, timezone),
					status: 'scheduled',
					source: 'authored',
				},
				select: { id: true },
			})
			return created.id
		},
	)

	// Planned TSS is materialized per session (ADR 0019) and resolves the copied
	// row's portable targets against *this* athlete's thresholds — so an athlete
	// with none gets an honest `null` rather than a figure from nobody's threshold.
	await recomputePlannedTssForSession(athleteId, sessionId)

	return { ok: true, sessionId }
}
