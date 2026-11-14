/**
 * **Account Erasure** — what "Slett kontoen din" does to the Workouts an athlete
 * wrote, and what the one-time purge does to the **Orphaned Workouts** every
 * deletion before #641 left behind (ADR 0051 §5 "Account erasure", ADR 0121).
 *
 * `Workout.ownerId` is `SetNull` (ADR 0051 §2), so a bare `prisma.user.delete`
 * erases the account and leaves every Workout the athlete wrote behind as an
 * Orphaned Workout — their titles, descriptions and notes, and, for a published one, a
 * Shared Workout under the name they published as. This is the one place an
 * account is deleted, and it erases first; lint rejects any other
 * `user.delete` in `app/` and `server/` (ADR 0121 §4).
 *
 * The rules live here once and run over an **erasure scope**: an account's own
 * Workouts (`deleteAccount`) or the Orphaned Workouts (`eraseOrphanedWorkouts`).
 * What survives, and why nothing else has to:
 *
 * - **Stock Workouts** — never the athlete's. The account scope selects by
 *   owner, which a Stock Workout never has (CHECK); the Orphaned Workout scope selects by
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
 * Sign-in data goes too: Better Auth's tables cascade from `User`, except
 * `AuthVerification`, which names its user only by id or email and is cleared
 * by `eraseAuthVerifications` (ADR 0114 §6).
 *
 * A bookmark (`CatalogueSave`) does not keep a row: it is a pointer, not a copy,
 * and it cascades away with the row.
 *
 * The athlete's own Week Pattern slots are deleted before the purge, not left to
 * the `User` cascade: `WeekPatternDay.workoutId` is `NO ACTION` (ADR 0113 §7),
 * so deleting a Workout a slot still uses fails. A plan's **Held Workouts**
 * are the athlete's own (`ownerId`), so they are purged with the rest.
 */
import { type Prisma } from '@prisma/client'
import { eraseAuthVerifications } from './auth/erase.server.ts'
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
type ErasureScope =
	| { kind: 'account'; userId: string }
	| { kind: 'orphanedWorkouts' }

// A prolific athlete's purge (many Workouts, a big fork tree) outruns Prisma's 5 s default.
export const ERASURE_TRANSACTION_OPTIONS = { timeout: 30_000 }

export async function deleteAccount(userId: string): Promise<AccountErasure> {
	return prisma.$transaction(async (tx) => {
		// The athlete's own plan goes with the account anyway; its days go first
		// because a day's Workout is `NO ACTION` (ADR 0113 §7): erasing a Workout
		// a day still uses would fail and roll it all back. Their own slots never
		// keep a row, so this does not change what is kept.
		await tx.weekPatternDay.deleteMany({
			where: { pattern: { outline: { athleteId: userId } } },
		})
		const erasure = await erase(tx, { kind: 'account', userId })
		// Better Auth's verification rows name the user by id or email, not by a
		// foreign key, so the `User` cascade misses them (ADR 0114 §6). Its other
		// tables cascade.
		const { email } = await tx.user.findUniqueOrThrow({
			where: { id: userId },
			select: { email: true },
		})
		await eraseAuthVerifications(tx, { userId, email })
		await tx.user.delete({ where: { id: userId } })
		return erasure
	}, ERASURE_TRANSACTION_OPTIONS)
}

/**
 * Erase the **Orphaned Workouts** with the rules `deleteAccount` applies, inside
 * the caller's transaction (the one-time purge, ADR 0121 §2). Idempotent: a row
 * kept unattributed on one run is held by the same training on the next, so it
 * is kept again and never erased.
 */
export async function eraseOrphanedWorkouts(
	tx: Prisma.TransactionClient,
): Promise<AccountErasure> {
	return erase(tx, { kind: 'orphanedWorkouts' })
}

/**
 * What a scope reads, decided in one place: its **candidates**, the Workouts it
 * may erase (carrying `authorship` for the Orphaned Workout scope), and the
 * training that keeps a candidate (**heldElsewhere**). An account's own
 * sessions and slots go with it, so they do not count; an Orphaned Workout's
 * author's training already went with their account, so any session, slot or
 * Program day still on it is somebody else's.
 *
 * The `patternDays` clauses cannot match on a migrated database: since ADR
 * 0113 a day uses only its own plan's Held Workout (§3), and its migration
 * re-pointed every existing day at one (§8), so no slot points at another
 * athlete's row or at an Orphaned Workout. They stay as the guard the rule
 * states, for a row a future path or an unmigrated database could still hold.
 */
function scopeFilters(scope: ErasureScope): {
	candidates: Prisma.WorkoutWhereInput
	heldElsewhere: Prisma.WorkoutWhereInput
} {
	if (scope.kind === 'orphanedWorkouts') {
		return {
			candidates: { ownerId: null, authorship: 'athlete' },
			heldElsewhere: {
				OR: [
					{ sessions: { some: {} } },
					{ patternDays: { some: {} } },
					{ programDays: { some: {} } },
				],
			},
		}
	}
	const { userId } = scope
	return {
		candidates: { ownerId: userId },
		heldElsewhere: {
			OR: [
				{ sessions: { some: { userId: { not: userId } } } },
				{
					patternDays: {
						some: { pattern: { outline: { athleteId: { not: userId } } } },
					},
				},
				{ programDays: { some: {} } },
			],
		},
	}
}

async function erase(
	tx: Prisma.TransactionClient,
	scope: ErasureScope,
): Promise<AccountErasure> {
	const { candidates, heldElsewhere } = scopeFilters(scope)
	const candidateRows = await tx.workout.findMany({
		where: candidates,
		select: { id: true, copiedFromId: true },
	})
	const heldRows = await tx.workout.findMany({
		where: { AND: [candidates, heldElsewhere] },
		select: { id: true },
	})
	const kept = new Set(heldRows.map((row) => row.id))
	const parentOf = new Map(
		candidateRows
			.filter((row) => !kept.has(row.id))
			.map((row) => [row.id, row.copiedFromId]),
	)

	await keepUnattributed(tx, [...kept])
	const spliced = await spliceLineage(tx, parentOf)
	// The candidate `where` again, never `ownerId` alone: in the Orphaned Workout scope it
	// is what keeps every Stock Workout out of this delete.
	const { count: erased } = await tx.workout.deleteMany({
		where: { AND: [candidates, { id: { notIn: [...kept] } }] },
	})
	return { erased, keptUnattributed: kept.size, spliced }
}

/**
 * Keep a row with no author's name on it: private, entry retired, Attribution
 * gone. Each write takes only the rows it would change, so a row an earlier run
 * already kept unattributed is left exactly as it is (`updatedAt` included).
 */
async function keepUnattributed(tx: Prisma.TransactionClient, ids: string[]) {
	if (ids.length === 0) return
	await tx.workout.updateMany({
		where: { id: { in: ids }, visibility: { not: 'private' } },
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
