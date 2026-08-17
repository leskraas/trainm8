/**
 * The **community tier**'s server half (ADR 0052): the publish flow, the
 * **Attribution** it writes, and **report-and-takedown** — the moderation gate the
 * publish flow may not ship without.
 *
 * The rule this file exists to hold: **publishing is an act, and so is undoing
 * one.** Nothing here infers a row into the community tier and nothing inherits
 * its way there — a fork of a published session is private (see `copyWorkout`),
 * and a row a moderator has taken down never goes back.
 *
 * The vocabularies and the pure reads live in `community.ts`; the four axes and
 * the fork live in `catalogue.server.ts`, which this file calls rather than
 * re-implements.
 */
import { type Prisma } from '@prisma/client'
import { resolveCatalogueOrigin } from './catalogue.server.ts'
import {
	type Citation,
	type SessionArchetype,
	readCitation,
} from './catalogue.ts'
import { type ReportReason } from './community.ts'
import { prisma } from './db.server.ts'

export const attributionSelect = {
	displayName: true,
	publishedAt: true,
	takenDownAt: true,
	takedownReason: true,
} satisfies Prisma.AttributionSelect

export type AttributionRow = Prisma.AttributionGetPayload<{
	select: typeof attributionSelect
}>

/**
 * What a **Shared Workout** may say about where it came from.
 *
 * A community row is **structurally incapable of carrying a Citation** — the
 * schema forbids the columns on an athlete-authored entry — so the only honest
 * source it can show is the one belonging to whatever it was forked *from*, named
 * as somebody else's. `adaptedFrom` is that: the origin's own citation, shown as
 * provenance and never as this row's authority.
 */
export type SharedProvenance = {
	/** The **Citation** of the corpus row this descends from, if any. */
	adaptedFrom: Citation | null
	/** The title of that corpus row, so the link says what it points at. */
	adaptedFromTitle: string | null
	adaptedFromWorkoutId: string | null
}

const EMPTY_PROVENANCE: SharedProvenance = {
	adaptedFrom: null,
	adaptedFromTitle: null,
	adaptedFromWorkoutId: null,
}

/**
 * **Walk `copiedFrom` for the provenance a publish owes.**
 *
 * Two things make this a walk and not a read.
 *
 * **It starts one hop up.** A published Workout has a `CatalogueEntry` of its own
 * — membership is what publishing creates — so asking `resolveCatalogueOrigin` for
 * the row itself answers with the row's own entry and learns nothing. The question
 * is what it was *copied from*, so the walk starts at `copiedFromId`.
 *
 * **It never assumes one hop** (#460). Lineage is a chain: a fork of a fork of a
 * **Stock Workout** still came from the corpus, and the citation it may point at
 * is the corpus row's. `resolveCatalogueOrigin` walks it, capped at
 * `MAX_LINEAGE_HOPS`, and this function does not re-implement that walk.
 *
 * The result is **read, never copied**. Nothing from the origin is written onto
 * the published row — that is ADR 0051 §5's rule, and it is what keeps
 * `CatalogueEntry.retiredAt` working: retiring a mis-cited corpus row stops every
 * descendant showing its citation, including ones published years earlier.
 */
export async function resolveSharedProvenance(
	workoutId: string,
): Promise<SharedProvenance> {
	const workout = await prisma.workout.findUnique({
		where: { id: workoutId },
		select: { copiedFromId: true },
	})
	if (workout?.copiedFromId == null) return EMPTY_PROVENANCE

	const origin = await resolveCatalogueOrigin(workout.copiedFromId)
	if (origin == null) return EMPTY_PROVENANCE

	const source = await prisma.workout.findUnique({
		where: { id: origin.workoutId },
		select: { title: true },
	})

	return {
		// `readCitation` returns null on an athlete-authored origin by construction
		// — the citation columns cannot be non-null there — so a fork of somebody
		// else's community row shows no borrowed authority, only the title.
		adaptedFrom: readCitation(origin),
		adaptedFromTitle: source?.title ?? null,
		adaptedFromWorkoutId: origin.workoutId,
	}
}

export type PublishResult =
	| { ok: true; workoutId: string }
	| {
			ok: false
			reason: 'not-found' | 'not-yours' | 'not-athlete-authored' | 'taken-down'
	  }

/**
 * **Publish** a Workout into the community tier.
 *
 * Three writes, one transaction, because a row that is `public` without an
 * Attribution is exactly the thing the asymmetry forbids:
 *
 * 1. **Visibility** goes `public` — the axis ADR 0037 landed inert and #452 turns on.
 * 2. **Attribution** is written or refreshed, carrying the public identity the
 *    athlete confirmed on the publish screen.
 * 3. **Membership** — a `CatalogueEntry`, created or un-retired. Publishing offers
 *    the session for reuse; that is what publishing *means* here, and the
 *    retrieval metadata (`archetype`, `level`) is what makes it findable rather
 *    than merely visible.
 *
 * A row a moderator has taken down is refused permanently. A takedown a republish
 * could undo would not be a takedown.
 */
export async function publishWorkout({
	userId,
	workoutId,
	displayName,
	archetype,
	level,
}: {
	userId: string
	workoutId: string
	displayName: string
	archetype: SessionArchetype
	level?: string | null
}): Promise<PublishResult> {
	const workout = await prisma.workout.findUnique({
		where: { id: workoutId },
		select: {
			id: true,
			ownerId: true,
			authorship: true,
			attribution: { select: { takenDownAt: true } },
		},
	})
	if (workout == null) return { ok: false, reason: 'not-found' }
	if (workout.ownerId !== userId) return { ok: false, reason: 'not-yours' }
	// Belt and braces over the schema's own CHECK: a Stock Workout carries a
	// Citation and can never carry an Attribution, so it can never be published by
	// an athlete either.
	if (workout.authorship !== 'athlete') {
		return { ok: false, reason: 'not-athlete-authored' }
	}
	if (workout.attribution?.takenDownAt != null) {
		return { ok: false, reason: 'taken-down' }
	}

	await prisma.$transaction(async (tx) => {
		await tx.workout.update({
			where: { id: workoutId },
			// Publishing **states** the archetype on the Workout, where the axis is
			// authored (ADR 0055). The entry's own column is a component of a
			// three-column foreign key into this one, so this write must come first
			// and the two can never disagree afterwards.
			data: { visibility: 'public', archetype },
		})
		await tx.attribution.upsert({
			where: { workoutId },
			create: {
				workoutId,
				workoutAuthorship: 'athlete',
				displayName,
				publishedAt: new Date(),
			},
			update: { displayName, publishedAt: new Date() },
		})
		await tx.catalogueEntry.upsert({
			where: { workoutId },
			create: {
				workoutId,
				workoutAuthorship: 'athlete',
				archetype,
				level: level ?? null,
			},
			// Re-publishing after the author withdrew it un-retires the entry rather
			// than writing a second one: membership is 1:1 and retirement is the
			// reversible half of it.
			update: { archetype, level: level ?? null, retiredAt: null },
		})
	})

	return { ok: true, workoutId }
}

/**
 * **The author's own withdrawal.** Reversible, and deliberately not called a
 * takedown: the athlete is not being told anything, they are changing their mind.
 *
 * Membership retires rather than deleting (ADR 0051 §3) — a session somebody
 * already forked keeps resolving through it, and the fork's back-pointer keeps
 * finding the row it came from.
 */
export async function unpublishWorkout(userId: string, workoutId: string) {
	const workout = await prisma.workout.findUnique({
		where: { id: workoutId },
		select: { ownerId: true },
	})
	if (workout == null || workout.ownerId !== userId)
		return { ok: false as const }

	await prisma.$transaction(async (tx) => {
		await tx.workout.update({
			where: { id: workoutId },
			data: { visibility: 'private' },
		})
		await tx.catalogueEntry.updateMany({
			where: { workoutId, retiredAt: null },
			data: { retiredAt: new Date() },
		})
	})
	return { ok: true as const }
}

export type ReportResult =
	| { ok: true; alreadyReported: boolean }
	| { ok: false; reason: 'not-found' | 'not-public' | 'your-own' }

/**
 * **Report** a Shared Workout.
 *
 * **Who can report: any signed-in athlete except its author.** There is no
 * reputation gate and no threshold — a gate on who may report is a gate on who may
 * be heard, and this corpus is small enough that the honest answer is everyone.
 * The author is excluded because they have a better verb: withdraw.
 *
 * **What a report does immediately: it hides the row from the reporter**, through
 * the read path's `NOT reports.some(reporterId)` clause. This is the whole of the
 * rule that makes reporting safe to hand to everybody — it is *self-effective at
 * once* and *community-effective only through a moderator*. A report that hid the
 * row from everyone would hand any athlete a unilateral takedown of anybody's
 * session; a report that did nothing at all would make the reporter keep seeing
 * what they just told us they did not want to see.
 *
 * One report per athlete per row (a unique index): a second one is the same person
 * saying the same thing louder.
 */
export async function reportWorkout({
	reporterId,
	workoutId,
	reason,
	detail,
}: {
	reporterId: string
	workoutId: string
	reason: ReportReason
	detail?: string | null
}): Promise<ReportResult> {
	const workout = await prisma.workout.findUnique({
		where: { id: workoutId },
		select: { ownerId: true, visibility: true },
	})
	if (workout == null) return { ok: false, reason: 'not-found' }
	if (workout.ownerId === reporterId) return { ok: false, reason: 'your-own' }
	if (workout.visibility !== 'public')
		return { ok: false, reason: 'not-public' }

	const existing = await prisma.workoutReport.findUnique({
		where: { workoutId_reporterId: { workoutId, reporterId } },
		select: { id: true },
	})
	if (existing) return { ok: true, alreadyReported: true }

	await prisma.workoutReport.create({
		data: { workoutId, reporterId, reason, detail: detail ?? null },
	})
	return { ok: true, alreadyReported: false }
}

/** Has this viewer reported this row — the reason it is no longer in their Catalogue. */
export async function hasReported(reporterId: string, workoutId: string) {
	const report = await prisma.workoutReport.findUnique({
		where: { workoutId_reporterId: { workoutId, reporterId } },
		select: { id: true },
	})
	return report != null
}

/**
 * The moderator's queue: every open report, oldest first, with what a moderator
 * needs to decide without leaving the page — the session, who published it, why it
 * was reported and what the reporter wrote.
 */
export async function listOpenReports() {
	return prisma.workoutReport.findMany({
		where: { resolvedAt: null },
		orderBy: { createdAt: 'asc' },
		select: {
			id: true,
			reason: true,
			detail: true,
			createdAt: true,
			reporter: { select: { id: true, name: true, username: true } },
			workout: {
				select: {
					id: true,
					title: true,
					description: true,
					discipline: true,
					visibility: true,
					attribution: { select: attributionSelect },
				},
			},
		},
	})
}

/**
 * **Takedown** — the moderator's act, and the reason the publish flow was allowed
 * to merge.
 *
 * What it does, in one transaction:
 *
 * - **Visibility goes back to `private`.** The row is not deleted. Deleting it
 *   would take the author's own session out of their own training history as
 *   collateral, and it would strand every fork's back-pointer — ADR 0051's
 *   retire-never-delete rule, applied to the one case that most tempts a delete.
 * - **Membership retires**, so it stops being retrievable by anybody.
 * - **The Attribution records the takedown and its reason**, which is what the
 *   author is shown on their own publish screen. An author whose session vanished
 *   with no explanation has been moderated at, not moderated.
 * - **Every open report on that row resolves as `taken-down`**, so the queue
 *   reflects the decision rather than re-asking it once per reporter.
 *
 * Publishing again is refused from here on. `Attribution.takenDownAt` is the
 * permanent record and `publishWorkout` reads it first.
 */
export async function takeDownWorkout({
	moderatorId,
	workoutId,
	reason,
}: {
	moderatorId: string
	workoutId: string
	reason: string
}) {
	const attribution = await prisma.attribution.findUnique({
		where: { workoutId },
		select: { id: true },
	})
	if (attribution == null)
		return { ok: false as const, reason: 'not-published' }

	const now = new Date()
	await prisma.$transaction(async (tx) => {
		await tx.workout.update({
			where: { id: workoutId },
			data: { visibility: 'private' },
		})
		await tx.catalogueEntry.updateMany({
			where: { workoutId, retiredAt: null },
			data: { retiredAt: now },
		})
		await tx.attribution.update({
			where: { workoutId },
			data: { takenDownAt: now, takedownReason: reason },
		})
		await tx.workoutReport.updateMany({
			where: { workoutId, resolvedAt: null },
			data: {
				resolvedAt: now,
				resolution: 'taken-down',
				resolvedById: moderatorId,
			},
		})
	})
	return { ok: true as const }
}

/**
 * **Dismiss** one report. The row stays published for everybody else; it stays
 * hidden from the athlete who reported it, because that half of the report was
 * never the moderator's to overturn.
 */
export async function dismissReport(moderatorId: string, reportId: string) {
	const { count } = await prisma.workoutReport.updateMany({
		where: { id: reportId, resolvedAt: null },
		data: {
			resolvedAt: new Date(),
			resolution: 'dismissed',
			resolvedById: moderatorId,
		},
	})
	return { ok: count > 0 }
}

/**
 * The **Attributions** for a set of Workouts, as a map — one query for a whole
 * Catalogue page rather than one per row.
 *
 * Kept here rather than widened into `listCatalogue`'s select: the Catalogue's
 * read path is shared with the stock corpus, and a community-only join belongs to
 * the community-only module.
 */
export async function attributionsFor(workoutIds: string[]) {
	if (workoutIds.length === 0) return new Map<string, AttributionRow>()
	const rows = await prisma.attribution.findMany({
		where: { workoutId: { in: workoutIds } },
		select: { workoutId: true, ...attributionSelect },
	})
	return new Map(rows.map((row) => [row.workoutId, row]))
}

/**
 * One athlete's own Workouts, with their publish state — what the Catalogue's
 * "your sessions" section offers to publish.
 *
 * Owner-scoped on purpose: this is the one list on the Catalogue surface that is
 * about the athlete rather than about the corpus.
 */
export async function listOwnPublishableWorkouts(userId: string, take = 20) {
	return prisma.workout.findMany({
		where: { ownerId: userId, authorship: 'athlete' },
		orderBy: { updatedAt: 'desc' },
		take,
		select: {
			id: true,
			title: true,
			discipline: true,
			intent: true,
			visibility: true,
			attribution: { select: attributionSelect },
			catalogueEntry: {
				select: { archetype: true, level: true, retiredAt: true },
			},
		},
	})
}

/** Everything the publish screen needs about one Workout. */
export async function readPublishTarget(userId: string, workoutId: string) {
	const workout = await prisma.workout.findUnique({
		where: { id: workoutId },
		select: {
			id: true,
			title: true,
			description: true,
			discipline: true,
			intent: true,
			ownerId: true,
			authorship: true,
			visibility: true,
			attribution: { select: attributionSelect },
			catalogueEntry: {
				select: { archetype: true, level: true, retiredAt: true },
			},
			owner: { select: { name: true, username: true } },
		},
	})
	if (workout == null || workout.ownerId !== userId) return null
	return workout
}

/**
 * The name an athlete's publish screen offers them by default. Their profile name
 * where they have one, their username otherwise — and always shown to them for
 * confirmation before it becomes public, because a default that publishes a real
 * name nobody was asked about is not a default, it is a disclosure.
 */
export function defaultDisplayName(user: {
	name: string | null
	username: string
}) {
	return user.name?.trim() || user.username
}

/**
 * The reports one Workout carries, for the moderation surface's per-row history.
 */
export async function listReportsForWorkout(workoutId: string) {
	return prisma.workoutReport.findMany({
		where: { workoutId },
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			reason: true,
			detail: true,
			createdAt: true,
			resolvedAt: true,
			resolution: true,
		},
	})
}
