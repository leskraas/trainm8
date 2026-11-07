/**
 * **Account Erasure** — what "Slett kontoen din" does to the Workouts an athlete
 * wrote, and what the one-time purge does to the **Orphaned Workouts** every
 * deletion before #641 left behind (ADR 0051 §5 "Account erasure", ADR 0112).
 *
 * `Workout.ownerId` is `SetNull` (ADR 0051 §2), so a bare `prisma.user.delete`
 * erases the account and leaves every Workout the athlete wrote behind as an
 * orphan — their titles, descriptions and notes, and, for a published one, a
 * Shared Workout under the name they published as. This is the one place an
 * account is deleted, and it erases first; lint rejects any other
 * `user.delete` in `app/` and `server/` (ADR 0112 §4).
 *
 * The rules live here once and run over an **erasure scope**: an account's own
 * Workouts (`deleteAccount`) or the Orphaned Workouts (`eraseOrphanedWorkouts`).
 * What survives, and why nothing else has to:
 *
 * - **Stock Workouts** — never the athlete's. The account scope selects by
 *   owner, which a Stock Workout never has (CHECK); the orphan scope selects by
 *   `authorship = 'athlete'` as well as the missing owner, never by the missing
 *   owner alone, which would take in the whole corpus.
 * - **Another athlete's adoption or plan** — placing, forking and stamping all
 *   deep-copy into a Workout *that athlete owns*, so it is theirs and untouched.
 *   Its `copiedFromId` is spliced past the erased rows to the nearest surviving
 *   ancestor, so a fork of a fork of a cited Stock Workout keeps its citation.
 * - **A row another athlete's session, Week Pattern slot or a Program day points
 *   at directly.** No shipped path writes one, but deleting it would cascade into
 *   somebody else's training, so it is kept **unattributed**: `private`, its
 *   entry retired and its **Attribution** deleted, since that holds the
 *   published name. Not the author's withdrawal (`unpublishWorkout`), which
 *   keeps the Attribution.
 *
 * A bookmark (`CatalogueSave`) does not keep a row: it is a pointer, not a copy,
 * and it cascades away with the row.
 */
import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import { MAX_LINEAGE_HOPS } from './workout.server.ts'

export type AccountErasure = {
	/** Workouts erased. */
	erased: number
	/** Workouts kept unattributed because someone else's training points at them. */
	keptUnattributed: number
	/** Surviving Workouts whose back-pointer was spliced past an erased row. */
	spliced: number
}

/**
 * Whose Workouts an erasure takes: one account's, or the Orphaned Workouts an
 * account deleted before #641 left behind.
 */
type ErasureScope = { kind: 'account'; userId: string } | { kind: 'orphans' }

// A prolific athlete's purge (many Workouts, a big fork tree) outruns Prisma's 5 s default.
export const ERASURE_TRANSACTION_OPTIONS = { timeout: 30_000 }

export async function deleteAccount(userId: string): Promise<AccountErasure> {
	return prisma.$transaction(async (tx) => {
		// The athlete's own plan goes with the account anyway; it goes first because
		// a `fixed` or `lifting` slot on an erased Workout would be `SetNull`ed into
		// a row the `WeekPatternDay_kind_fields` CHECK refuses, rolling it all back.
		// Their own slots never keep a row, so this does not change what is kept.
		await tx.weekPatternDay.deleteMany({
			where: { pattern: { outline: { athleteId: userId } } },
		})
		const erasure = await erase(tx, { kind: 'account', userId })
		await tx.user.delete({ where: { id: userId } })
		return erasure
	}, ERASURE_TRANSACTION_OPTIONS)
}

/**
 * Erase the **Orphaned Workouts** with the rules `deleteAccount` applies, inside
 * the caller's transaction (the one-time purge, ADR 0112 §2). Idempotent: a row
 * kept unattributed on one run is held by the same training on the next, so it
 * is kept again and never erased.
 */
export async function eraseOrphanedWorkouts(
	tx: Prisma.TransactionClient,
): Promise<AccountErasure> {
	return erase(tx, { kind: 'orphans' })
}

/** The Workouts a scope may erase. Carries `authorship` for the orphan scope. */
function candidateWhere(scope: ErasureScope): Prisma.WorkoutWhereInput {
	return scope.kind === 'account'
		? { ownerId: scope.userId }
		: { ownerId: null, authorship: 'athlete' }
}

/**
 * The training that keeps a candidate. An account's own sessions and slots go
 * with it, so they do not count; an orphan's author's training already went
 * with their account, so any session, slot or Program day still on it is
 * somebody else's.
 */
function heldElsewhereWhere(scope: ErasureScope): Prisma.WorkoutWhereInput {
	if (scope.kind === 'orphans') {
		return {
			OR: [
				{ sessions: { some: {} } },
				{ patternDays: { some: {} } },
				{ programDays: { some: {} } },
			],
		}
	}
	const { userId } = scope
	return {
		OR: [
			{ sessions: { some: { userId: { not: userId } } } },
			{
				patternDays: {
					some: { pattern: { outline: { athleteId: { not: userId } } } },
				},
			},
			{ programDays: { some: {} } },
		],
	}
}

async function erase(
	tx: Prisma.TransactionClient,
	scope: ErasureScope,
): Promise<AccountErasure> {
	const candidates = candidateWhere(scope)
	const rows = await tx.workout.findMany({
		where: candidates,
		select: { id: true, copiedFromId: true },
	})
	const heldElsewhere = await tx.workout.findMany({
		where: { AND: [candidates, heldElsewhereWhere(scope)] },
		select: { id: true },
	})
	const kept = new Set(heldElsewhere.map((row) => row.id))
	const parentOf = new Map(
		rows
			.filter((row) => !kept.has(row.id))
			.map((row) => [row.id, row.copiedFromId]),
	)

	await keepUnattributed(tx, [...kept])
	const spliced = await spliceLineage(tx, parentOf)
	// The candidate `where` again, never `ownerId` alone: in the orphan scope it
	// is what keeps every Stock Workout out of this delete.
	const { count: erased } = await tx.workout.deleteMany({
		where: { AND: [candidates, { id: { notIn: [...kept] } }] },
	})
	return { erased, keptUnattributed: kept.size, spliced }
}

/** Keep a row with no author's name on it: private, entry retired, Attribution gone. */
async function keepUnattributed(tx: Prisma.TransactionClient, ids: string[]) {
	if (ids.length === 0) return
	await tx.workout.updateMany({
		where: { id: { in: ids } },
		data: { visibility: 'private' },
	})
	await tx.catalogueEntry.updateMany({
		where: { workoutId: { in: ids }, retiredAt: null },
		data: { retiredAt: new Date() },
	})
	await tx.attribution.deleteMany({ where: { workoutId: { in: ids } } })
}

/**
 * Re-point every surviving Workout whose `copiedFromId` lands on a row about to
 * be erased at the nearest ancestor that survives — walked in memory over the
 * erased set, capped at {@link MAX_LINEAGE_HOPS}, `null` past the cap or where it
 * would point a row at itself. Children are found by the erased ids, never by
 * their parent's owner: an ownerless parent is also every Stock Workout.
 */
async function spliceLineage(
	tx: Prisma.TransactionClient,
	parentOf: ReadonlyMap<string, string | null>,
) {
	if (parentOf.size === 0) return 0
	const children = await tx.workout.findMany({
		where: { copiedFromId: { in: [...parentOf.keys()] } },
		select: { id: true, copiedFromId: true },
	})
	const byTarget = new Map<string | null, string[]>()
	for (const child of children) {
		if (parentOf.has(child.id)) continue
		let target: string | null = child.copiedFromId
		for (
			let hop = 0;
			hop < MAX_LINEAGE_HOPS && target != null && parentOf.has(target);
			hop++
		) {
			target = parentOf.get(target) ?? null
		}
		if (target != null && (parentOf.has(target) || target === child.id)) {
			target = null
		}
		byTarget.set(target, [...(byTarget.get(target) ?? []), child.id])
	}
	// One write per surviving ancestor, not per child: this runs inside the
	// erasure transaction, whose interactive timeout a big fork tree would hit.
	let spliced = 0
	for (const [target, ids] of byTarget) {
		await tx.workout.updateMany({
			where: { id: { in: ids } },
			data: { copiedFromId: target },
		})
		spliced += ids.length
	}
	return spliced
}
