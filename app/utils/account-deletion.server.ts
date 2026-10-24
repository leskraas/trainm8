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

// The splice updates one child per row; a prolific athlete outruns Prisma's 5 s default.
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
	let spliced = 0
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
		await tx.workout.update({
			where: { id: child.id },
			data: { copiedFromId: target },
		})
		spliced++
	}
	return spliced
}
