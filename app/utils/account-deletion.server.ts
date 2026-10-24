/**
 * **Account erasure** — what "Slett alle dataene dine" does (#468, ADR 0051 §5
 * amendment "Account erasure").
 *
 * `Workout.ownerId` is `SetNull` (ADR 0051 §2), so a bare `prisma.user.delete`
 * erases the account and leaves every Workout the athlete wrote behind as an
 * orphan — their titles, descriptions and notes, and, for a published one, a
 * Shared Workout still served to everybody under the name they published as.
 * This is the one place an account is deleted, and it purges first.
 *
 * What survives, and why nothing else has to:
 *
 * - **Stock Workouts** — never the athlete's; `authorship = 'system'` has no
 *   owner by CHECK, so an owner-scoped purge cannot reach one.
 * - **Another athlete's adoption or plan** — placing, forking and stamping all
 *   deep-copy into a Workout *that athlete owns*, so it is theirs and untouched.
 *   Its `copiedFromId` is spliced past the erased rows to the nearest surviving
 *   ancestor, so a fork of a fork of a cited Stock Workout keeps its citation.
 * - **A row another athlete's session, Week Pattern slot or a Program day points
 *   at directly.** No shipped path writes one, but deleting it would cascade into
 *   somebody else's training, so it is kept — withdrawn (`private`, entry retired)
 *   with its **Attribution** deleted, since that holds the published name.
 *
 * A bookmark (`CatalogueSave`) does not keep a row: it is a pointer, not a copy,
 * and it cascades away with the row.
 *
 * The athlete's own Week Pattern slots are deleted before the purge, not left to
 * the `User` cascade: `WeekPatternDay.workoutId` is the one `SetNull` into an
 * erased Workout, and a `fixed` or `lifting` slot with no Workout fails its CHECK.
 */
import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import { MAX_LINEAGE_HOPS } from './workout.server.ts'

export type AccountErasure = {
	/** Workouts erased with the account. */
	erased: number
	/** Workouts kept ownerless because someone else's training points at them. */
	withdrawn: number
	/** Other athletes' Workouts whose back-pointer was spliced past an erased row. */
	spliced: number
}

// A prolific athlete's purge (many Workouts, a big fork tree) outruns Prisma's 5 s default.
const TRANSACTION_TIMEOUT_MS = { timeout: 30_000 }

export async function deleteAccount(userId: string): Promise<AccountErasure> {
	return prisma.$transaction(async (tx) => {
		const owned = await tx.workout.findMany({
			where: { ownerId: userId },
			select: { id: true, copiedFromId: true },
		})
		const heldElsewhere = await tx.workout.findMany({
			where: {
				ownerId: userId,
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
			select: { id: true },
		})
		const kept = new Set(heldElsewhere.map((row) => row.id))
		const parentOf = new Map(
			owned
				.filter((row) => !kept.has(row.id))
				.map((row) => [row.id, row.copiedFromId]),
		)

		await withdraw(tx, [...kept])
		const spliced = await spliceLineage(tx, userId, parentOf)
		// The athlete's own plan goes with the account anyway; it goes first because
		// a `fixed` or `lifting` slot on an erased Workout would be `SetNull`ed into
		// a row the `WeekPatternDay_kind_fields` CHECK refuses, rolling it all back.
		await tx.weekPatternDay.deleteMany({
			where: { pattern: { outline: { athleteId: userId } } },
		})
		const { count: erased } = await tx.workout.deleteMany({
			where: { ownerId: userId, id: { notIn: [...kept] } },
		})
		await tx.user.delete({ where: { id: userId } })
		return { erased, withdrawn: kept.size, spliced }
	}, TRANSACTION_TIMEOUT_MS)
}

async function withdraw(tx: Prisma.TransactionClient, ids: string[]) {
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
 * would point a row at itself.
 */
async function spliceLineage(
	tx: Prisma.TransactionClient,
	userId: string,
	parentOf: ReadonlyMap<string, string | null>,
) {
	const children = await tx.workout.findMany({
		where: { copiedFrom: { ownerId: userId } },
		select: { id: true, copiedFromId: true },
	})
	const byTarget = new Map<string | null, string[]>()
	for (const child of children) {
		if (parentOf.has(child.id)) continue
		if (child.copiedFromId == null || !parentOf.has(child.copiedFromId)) {
			continue
		}
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
