/**
 * **The server half of strength records and per-exercise history.**
 *
 * Split the way `strength-log.server.ts` is (ADR 0053 §2): this file queries and
 * hands arrays to the pure modules, and decides nothing. Every rule about what
 * counts as work, what a record is, which set is a session's top set and what
 * "last time" means already lives in `strength/records.ts` and
 * `strength/exercise-history.ts`, and is not restated here.
 *
 * **No schema change and no records table** — ADR 0021's derived-never-stored
 * rule, one track over. Unlike the pace/power ladder ADR 0021 deferred, this
 * needs no stream tier at all: the `ExerciseSetLog` row *is* the measurement, so
 * there is nothing to downsample and nothing to cache.
 *
 * Two things this module deliberately does not do.
 *
 * **It never re-derives `effectiveKg`.** The column was baked at log time
 * against the bodyweight in force then (ADR 0056 §3); recomputing it from
 * today's bodyweight would silently rewrite a two-year-old weighted-dip record
 * after a 6 kg change. It is selected and passed through, `null` included.
 *
 * **It computes no tonnage and no streak.** ADR 0056 declined both — tonnage
 * rewards junk volume and a streak measures app-opening — so there is no query
 * here that would feed one and no TODO promising one later.
 */
import { type Prisma } from '@prisma/client'
import { getAthleteTimezone } from './athlete.server.ts'
import { prisma } from './db.server.ts'
import {
	DEFAULT_ESTIMATOR,
	MAX_ESTIMATOR_REPS,
} from './strength/anchors.constants.ts'
import {
	type ExerciseSessionSummary,
	type PerformedSet,
	exerciseHistory,
	lastTimeYouDidThis,
} from './strength/exercise-history.ts'
import { applyEstimator } from './strength/one-rm.ts'
import {
	type OneRepMaxModel,
	type StrengthRecord,
	deriveStrengthRecords,
} from './strength/records.ts'
import {
	type EquipmentId,
	type EstimatorName,
	type LoadValue,
	type SetOutcome,
	type SetRole,
	EQUIPMENT_IDS,
	LoadValueSchema,
} from './strength-log.ts'

/**
 * The 1RM model the records strip is derived with — `one-rm.ts`'s published
 * equation plus `one-rm.ts`'s own rep gate, injected rather than reimplemented.
 *
 * Above {@link MAX_ESTIMATOR_REPS} reps this **refuses**, returning `null`, and
 * `deriveStrengthRecords` then leaves the set out of the estimate entirely. A
 * set of twenty is outside every published equation's validated range, so
 * grading it down would be the shrug ADR 0054 forbids.
 */
export const RECORD_ONE_RM_MODEL: OneRepMaxModel = {
	name: DEFAULT_ESTIMATOR,
	estimate: ({ weightKg, reps }) =>
		reps >= 1 && reps <= MAX_ESTIMATOR_REPS
			? applyEstimator(DEFAULT_ESTIMATOR, weightKg, reps)
			: null,
}

/** A stored `load` column parsed back into its union, or null when the row
 * predates a vocabulary or was written by hand. Parse-don't-trust at the seam. */
function parseLoadValue(raw: string): LoadValue | null {
	try {
		const parsed = LoadValueSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/**
 * The equipment half of the progression key, as a member of the vocabulary.
 *
 * A row with no `ExerciseVariant` falls back to the `Exercise`'s legacy
 * `equipment` string (the column the default variants were backfilled *from*),
 * and to `other` when that says nothing. `other` is a real bucket rather than a
 * dropped row: a set that happened is history even when nobody said what it was
 * lifted on.
 */
function toEquipmentId(...candidates: Array<string | null | undefined>) {
	for (const candidate of candidates) {
		if (candidate && (EQUIPMENT_IDS as readonly string[]).includes(candidate)) {
			return candidate as EquipmentId
		}
	}
	return 'other' as const
}

const historySelect = {
	id: true,
	orderIndex: true,
	role: true,
	outcome: true,
	toFailure: true,
	load: true,
	effectiveKg: true,
	reps: true,
	repsLeft: true,
	durationSec: true,
	rir: true,
	sessionId: true,
	session: { select: { scheduledAt: true } },
	variant: { select: { equipment: true } },
} satisfies Prisma.ExerciseSetLogSelect

/** One equipment variant this athlete has actually lifted this exercise on, so
 * the surface offers only histories that exist. */
export type ExerciseVariantTab = {
	equipment: EquipmentId
	/** How many sessions of *work* the athlete has on this variant. */
	sessionCount: number
}

export type ExerciseHistoryView = {
	exercise: { id: string; name: string; unilateral: boolean }
	/** Which variant this reading is scoped to; `null` reads across all of them. */
	equipment: EquipmentId | null
	variants: ExerciseVariantTab[]
	/** Every past session containing this lift, newest first. */
	sessions: ExerciseSessionSummary[]
	/** The last session containing **this exercise** — never the last calendar
	 * session, which on a push/pull/legs split is the wrong lift two days in three. */
	lastTime: ExerciseSessionSummary | null
	records: StrengthRecord[]
	/** Named on the axis, because an estimate is a model output. */
	estimator: EstimatorName
	timezone: string
	now: Date
}

/**
 * Everything the per-exercise history and records surface reads, in three
 * queries.
 *
 * **Ownership scoping:** a set log is reachable only by its athlete, enforced
 * through `session: { userId }` rather than by filtering afterwards. Exercise
 * rows themselves are shared only when they say so — `authorship: 'system'` —
 * which is #469's rule and not an inference from `createdByAthleteId IS NULL`:
 * an orphaned athlete-authored row stays private.
 *
 * Returns `null` when the exercise does not exist or is not this athlete's to
 * read. An exercise the athlete may read but has never logged returns a view
 * with empty `sessions` and `records`, so the surface says "no sets yet" rather
 * than 404-ing on a lift that is really there.
 */
export async function getExerciseHistoryView(
	userId: string,
	exerciseId: string,
	options: { equipment?: EquipmentId | null; now?: Date } = {},
): Promise<ExerciseHistoryView | null> {
	const exercise = await prisma.exercise.findFirst({
		where: {
			id: exerciseId,
			OR: [{ authorship: 'system' }, { createdByAthleteId: userId }],
		},
		select: { id: true, name: true, unilateral: true, equipment: true },
	})
	if (!exercise) return null

	const rows = await prisma.exerciseSetLog.findMany({
		where: { exerciseId, session: { userId } },
		orderBy: { orderIndex: 'asc' },
		select: historySelect,
	})
	const timezone = await getAthleteTimezone(userId)
	const now = options.now ?? new Date()

	const sets: PerformedSet[] = rows.flatMap((row) => {
		const load = parseLoadValue(row.load)
		// A row whose load cannot be parsed is not a zero and not an `unloaded`
		// hold; it is a row we cannot read, and it stays out of every reading.
		if (!load) return []
		return [
			{
				sessionId: row.sessionId,
				exerciseId: exercise.id,
				equipment: toEquipmentId(row.variant?.equipment, exercise.equipment),
				// **The session's own day**, matching the shipped ghost query: back
				// filling last Tuesday's session today must not make it today's history.
				performedAt: row.session.scheduledAt,
				orderIndex: row.orderIndex,
				role: row.role as SetRole,
				outcome: row.outcome as SetOutcome,
				load,
				// Read, never re-derived. See the module note.
				effectiveKg: row.effectiveKg,
				reps: row.reps,
				repsLeft: row.repsLeft,
				durationSec: row.durationSec,
				rir: row.rir,
				toFailure: row.toFailure,
			},
		]
	})

	const equipment = options.equipment ?? null
	const scope = {
		exerciseId: exercise.id,
		equipment: equipment ?? undefined,
		now,
	}
	const scoped =
		equipment == null ? sets : sets.filter((s) => s.equipment === equipment)

	return {
		exercise: {
			id: exercise.id,
			name: exercise.name,
			unilateral: exercise.unilateral,
		},
		equipment,
		variants: variantTabs(sets),
		sessions: exerciseHistory(sets, scope),
		lastTime: lastTimeYouDidThis(sets, scope),
		records: deriveStrengthRecords(scoped, { oneRm: RECORD_ONE_RM_MODEL }),
		estimator: RECORD_ONE_RM_MODEL.name,
		timezone,
		now,
	}
}

/**
 * The variants the athlete has history on, most-used first. Counted over *every*
 * logged set rather than qualifying work, because a tab that vanishes when a
 * whole session was abandoned is a tab that lies about what happened.
 */
function variantTabs(sets: PerformedSet[]): ExerciseVariantTab[] {
	const sessionsByEquipment = new Map<EquipmentId, Set<string>>()
	for (const set of sets) {
		const bucket = sessionsByEquipment.get(set.equipment) ?? new Set<string>()
		bucket.add(set.sessionId)
		sessionsByEquipment.set(set.equipment, bucket)
	}
	return [...sessionsByEquipment.entries()]
		.map(([equipment, sessions]) => ({
			equipment,
			sessionCount: sessions.size,
		}))
		.sort(
			(a, b) =>
				b.sessionCount - a.sessionCount ||
				a.equipment.localeCompare(b.equipment),
		)
}
