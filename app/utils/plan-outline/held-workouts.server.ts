// **Held Workouts** (ADR 0112): a Plan Outline holds a private copy of every
// Workout its Week Pattern days use. This module is the one place that rule
// lives. Every write that gives a day an existing Workout takes its id from
// `hold`, every undo that puts rows back is checked by `acceptsOnly`, and every
// write that can leave a held row unused ends with `sweep`. The one row written
// held from the start is the first run's new Simple Activity, which no session
// owns (`createSimpleActivityWorkout`'s `heldByOutlineId`, ADR 0112 §1).
//
// - **A copy per pick, shared by the plan.** `hold` copies the athlete's own
//   Workout or a Stock Workout once per write (`copyWorkout`, owned by the
//   athlete, `copiedFromId` at the source, `heldByOutlineId` the plan), and
//   returns a row the plan already holds unchanged. One write's lifting slots
//   share one copy, and a Simple Activity stays one unit with one id
//   (ADR 0112 §2).
// - **Pattern writes accept only rows this plan holds.** A session's own row,
//   another plan's row or a stranger's never lands on a day, so editing or
//   deleting a session can never reach the pattern (ADR 0112 §3).
// - **A held row lives while a day uses it.** `sweep` deletes the plan's held
//   rows no day uses, sparing only those the write's own undo still names
//   (ADR 0112 §4). Deleting the plan, its Event or the athlete cascades.

import { type Prisma } from '@prisma/client'
import {
	type CopyableWorkout,
	copyWorkout,
	workoutCopySelect,
} from '../workout.server.ts'

/**
 * The `where` fragment every reader of "the athlete's own Workouts" shares, so
 * a plan's private copies never show up as Workouts the athlete wrote: the
 * Catalogue's "your sessions" list and the publish flow (ADR 0112 §5).
 */
export const notHeld = {
	heldByOutlineId: null,
} as const satisfies Prisma.WorkoutWhereInput

/** Why a Workout cannot be held for a plan's day. */
export type HoldRefusal =
	/** Missing, a stranger's, or another plan's held row: from here, absent. */
	| 'workout-gone'
	/** The Workout is not of the day's track's Discipline (ADR 0041). */
	| 'workout-discipline-mismatch'

export type HoldResult =
	| { ok: true; workoutId: string }
	| { ok: false; reason: HoldRefusal }

export type HeldWorkouts = {
	/**
	 * The id a day of this plan may store for `workoutId`: the id itself when
	 * the plan holds it, else a held copy of the athlete's own Workout or of a
	 * Stock Workout, made once per holder. `discipline`, when given, is the
	 * day's track's, and a Workout of another refuses.
	 */
	hold(workoutId: string, discipline?: string): Promise<HoldResult>
	/**
	 * Whether every id is a row this plan holds (of `discipline`, when given):
	 * what an undo payload may put back on the plan's days.
	 */
	acceptsOnly(
		workoutIds: ReadonlyArray<string | null>,
		discipline?: string,
	): Promise<boolean>
	/**
	 * Delete the plan's held rows that no day uses, except `spare`: the ids the
	 * write's own undo payload still names. Returns how many went.
	 */
	sweep(options?: { spare?: Iterable<string | null> }): Promise<number>
}

/**
 * A holder for one write to one plan, in the write's transaction. `athleteId`
 * is the plan's athlete: a copy is theirs, and only their own Workouts are
 * copied in.
 */
export function heldWorkouts(
	tx: Prisma.TransactionClient,
	{ outlineId, athleteId }: { outlineId: string; athleteId: string },
): HeldWorkouts {
	/** Source id → held copy, so one write copies a source once. */
	const copies = new Map<string, string>()

	return {
		async hold(workoutId, discipline) {
			const copied = copies.get(workoutId)
			const row = await tx.workout.findUnique({
				where: { id: copied ?? workoutId },
				select: {
					id: true,
					discipline: true,
					ownerId: true,
					authorship: true,
					heldByOutlineId: true,
				},
			})
			if (!row) return { ok: false, reason: 'workout-gone' }
			if (discipline != null && row.discipline !== discipline) {
				return { ok: false, reason: 'workout-discipline-mismatch' }
			}
			if (row.heldByOutlineId === outlineId) {
				return { ok: true, workoutId: row.id }
			}
			// Another plan's copy is that plan's, even when it is the same
			// athlete's: holding it here would tie the two plans together.
			if (row.heldByOutlineId != null) {
				return { ok: false, reason: 'workout-gone' }
			}
			const copyable =
				(row.authorship === 'athlete' && row.ownerId === athleteId) ||
				row.authorship === 'system'
			if (!copyable) return { ok: false, reason: 'workout-gone' }

			const source = await tx.workout.findUniqueOrThrow({
				where: { id: row.id },
				select: workoutCopySelect,
			})
			// The plan may already hold a copy of this source that still says what
			// it says: an earlier write picked it. Reuse it, so the same pick on
			// another day, or in another of the plan's Week Patterns, is one unit
			// with one id (ADR 0112 §2). A source edited since gets a new copy.
			const earlier = await tx.workout.findMany({
				where: { heldByOutlineId: outlineId, copiedFromId: source.id },
				orderBy: { createdAt: 'asc' },
				select: workoutCopySelect,
			})
			const same = earlier.find((held) => sameContent(held, source))
			const copy =
				same ??
				(await copyWorkout(tx, source, athleteId, {
					copiedFromId: source.id,
					heldByOutlineId: outlineId,
				}))
			copies.set(workoutId, copy.id)
			return { ok: true, workoutId: copy.id }
		},

		async acceptsOnly(workoutIds, discipline) {
			const ids = [
				...new Set(workoutIds.filter((id): id is string => id != null)),
			]
			if (ids.length === 0) return true
			const held = await tx.workout.count({
				where: {
					id: { in: ids },
					heldByOutlineId: outlineId,
					...(discipline != null ? { discipline } : {}),
				},
			})
			return held === ids.length
		},

		async sweep({ spare = [] } = {}) {
			const kept = [...spare].filter((id): id is string => id != null)
			const { count } = await tx.workout.deleteMany({
				where: {
					heldByOutlineId: outlineId,
					patternDays: { none: {} },
					...(kept.length > 0 ? { id: { notIn: kept } } : {}),
				},
			})
			return count
		},
	}
}

/**
 * Whether a held copy still says what its source says: every column
 * `copyWorkout` carries, blocks, steps and sets, but the id and `visibility`,
 * which a copy never takes.
 */
function sameContent(copy: CopyableWorkout, source: CopyableWorkout) {
	const content = ({
		id: _id,
		visibility: _visibility,
		...rest
	}: CopyableWorkout) => JSON.stringify(rest)
	return content(copy) === content(source)
}
