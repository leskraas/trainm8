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
	NEAR_FAILURE_MAX_RIR,
	type RepLoadBasis,
	repLoadBasis,
} from './strength/anchors.constants.ts'
import {
	type ExerciseSessionSummary,
	type PerformedSet,
	exerciseHistory,
	hasHappenedBy,
	lastTimeYouDidThis,
} from './strength/exercise-history.ts'
import {
	type EstimatorSet,
	applyEstimator,
	estimateOneRm,
	oneRmRefusalText,
} from './strength/one-rm.ts'
import {
	type OneRepMaxModel,
	type StrengthRecord,
	assistedRecordRefusal,
	deriveStrengthRecords,
} from './strength/records.ts'
import {
	type EquipmentId,
	type EstimatorName,
	type SetOutcome,
	type SetRole,
	EQUIPMENT_IDS,
	countsTowardWork,
	readStoredSetLoad,
} from './strength-log.ts'

/**
 * **The 1RM model the records strip is derived with** — `one-rm.ts`'s published
 * equation, its rep gate and its **effort gate**, injected rather than
 * reimplemented, and built per exercise because the fit is a property of the
 * movement.
 *
 * Three refusals, each returning `null`, after which `deriveStrengthRecords`
 * leaves the set out of the estimate entirely:
 *
 * - **No validated rep↔load mapping** for this movement. Estimating anyway would
 *   borrow the bench press's curve, which is the reading the propose surface
 *   refuses as `exercise-unmapped`.
 * - **Above {@link MAX_ESTIMATOR_REPS} reps**, outside every published equation's
 *   validated range, so grading it down would be the shrug ADR 0054 forbids.
 * - **The effort is unknown.** This is the fix for the defect where one set got
 *   two answers: the history page reported `Best estimated 1RM 23.3 kg · epley`
 *   from a set nobody said was near failure, while the propose surface refused
 *   the same set with *"None of your sets here says how close to failure it
 *   was."* The propose surface was right. In lifting there is **no signature of
 *   maximality in the numbers** — an estimate off a set stopped five reps short
 *   understates the maximum, and this repo states an unknown rather than
 *   approximating it. A `toFailure` flag or an `rir` within
 *   {@link NEAR_FAILURE_MAX_RIR} is what licenses the number, on both surfaces.
 *
 * And **a single is the measurement, not an estimate off itself.** `one-rm.ts`
 * names this case as forbidden — *"Epley would report 103.3 kg from a 100 kg
 * single, fabricating 3.3 kg"* — and `estimateOneRm` already returns the load
 * lifted, untouched by any equation, for a one-rep set. This model did not, so
 * the strip reported *"Best estimated 1RM 63.29 kg"* beside *"Best 1-rep set
 * 61.25 kg"*: 2.04 kg invented, on the same screen as the number it was invented
 * from. The single is now **passed through**, not refused: a tested maximum is
 * the strongest evidence about a 1RM the athlete has, and dropping it would let a
 * five-rep set's estimate stand as the best reading while a heavier single sat
 * beside it unread. Same rule as `estimateOneRm`, same arithmetic, so the two
 * surfaces report one number.
 *
 * **What this model does not ask is what kind of kilo it was handed** — and it
 * must not, because it is handed one only for `bar` sets: `records.ts` partitions
 * every set by `loadKindComparability` first and offers this model to the `bar`
 * partition alone. One classification, upstream, rather than a second copy here.
 *
 * The threshold is `anchors.constants`'s and not a second copy: the gate is
 * asked here rather than through `estimateOneRm` only because that function
 * reads a *set of sets* and grades the winner, where a record needs every
 * candidate priced so `record()` can find the best and what it beat.
 */
export function recordOneRmModel(basis: RepLoadBasis): OneRepMaxModel {
	return {
		name: DEFAULT_ESTIMATOR,
		estimate: ({ weightKg, reps, rir, toFailure }) => {
			if (basis === 'unmapped') return null
			if (reps < 1 || reps > MAX_ESTIMATOR_REPS) return null
			if (!toFailure && !(rir != null && rir <= NEAR_FAILURE_MAX_RIR))
				return null
			// The load lifted, byte for byte. No equation touches a single.
			if (reps === 1) return weightKg
			return applyEstimator(DEFAULT_ESTIMATOR, weightKg, reps)
		},
	}
}

/**
 * **Why no estimated 1RM could be read**, in `one-rm.ts`'s own sentence — so the
 * strip states the absence instead of quietly dropping a row the athlete saw
 * yesterday.
 *
 * Answered by asking `estimateOneRm` the propose surface's exact question over
 * the same sets, which is what keeps the two screens agreeing about *why* as
 * well as *whether*. `null` where an estimate exists, and `null` where there is
 * **no qualifying work at all** — that absence already says itself once, in the
 * strip's own empty line, and repeating it here would be the second sentence
 * about one absence.
 *
 * **An absence and an unreadable presence are two answers, and they get two
 * sentences.** A Push-up whose only work is a 45-second hold has sets: they just
 * state a duration rather than a load lifted for a counted number of reps, so
 * nothing here can be estimated from. Saying *"No sets logged for this lift
 * yet"* about it contradicts the runner row directly above, which reads *"Last
 * time bodyweight × 45 s"* — so that case is `sets-not-readable` and says what
 * it means.
 *
 * **Both gates are the page's own**: `countsTowardWork`, and
 * {@link hasHappenedBy}. A session dated later tonight must not license an
 * estimate the records strip beside it refuses to show, and must not explain one
 * away either.
 */
function oneRmUnavailableNote(
	sets: PerformedSet[],
	basis: RepLoadBasis,
	now: Date,
): string | null {
	const worked = sets.filter(
		(set) => countsTowardWork(set) && hasHappenedBy(set.performedAt, now),
	)
	const estimatorSets: EstimatorSet[] = worked.flatMap((set) =>
		set.effectiveKg != null && set.reps != null
			? [
					{
						setLogId: null,
						loadKg: set.effectiveKg,
						reps: set.reps,
						performedAt: set.performedAt,
						rir: set.rir,
						toFailure: set.toFailure,
						// The kind the set was logged under, so the note answers the
						// propose surface's question and not an easier one: a lift whose
						// only work is dip-belt bench has no readable bar weight, and both
						// surfaces now say so in the same sentence.
						loadKind: set.load.kind,
					},
				]
			: [],
	)
	// Nothing has happened on this lift yet. The absence is stated once, by the
	// empty strip, and not twice.
	if (worked.length === 0) return null
	// Work happened and none of it is a load lifted for a counted number of reps.
	// That is a statement about the sets, not their absence.
	if (estimatorSets.length === 0) return oneRmRefusalText('sets-not-readable')
	const reading = estimateOneRm({
		now,
		sets: estimatorSets,
		hasValidatedRepLoadMapping: basis !== 'unmapped',
	})
	if (reading.kind !== 'refusal') return null
	// `no-sets-logged` is unreachable from here — everything handed over is
	// already readable — and if it were reached it would be the absence case,
	// which the strip states itself.
	return reading.refusal === 'no-sets-logged'
		? null
		: oneRmRefusalText(reading.refusal)
}

/**
 * The equipment half of the progression key, as a member of the vocabulary.
 *
 * A logged set is read from its own `equipment` stamp; a candidate that says
 * nothing, or says something outside the vocabulary, falls through to `other`.
 * `other` is a real bucket rather than a dropped row: a set that happened is
 * history even when nobody said what it was lifted on.
 *
 * Still variadic, because a *prescription* has no stamp — the Set Ghost's scope is
 * read from the `Exercise` the Step names, and that caller hands one candidate of
 * its own.
 *
 * Exported because the **ghost is scoped by the same key as the records** — one
 * definition of scope and not two (ADR 0058's finding that the two queries
 * disagreed, so a dumbbell session could ghost against a barbell one).
 */
export function toEquipmentId(...candidates: Array<string | null | undefined>) {
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
	/// The witness the stored kilo is checked against — a bodyweight-derived bake is
	/// a function of the bodyweight *then*, so the check reads that number and never
	/// the athlete's weight now. See `readStoredSetLoad`.
	bodyweightKg: true,
	reps: true,
	repsLeft: true,
	durationSec: true,
	rir: true,
	sessionId: true,
	exerciseId: true,
	session: { select: { scheduledAt: true } },
	/// **The equipment the row states**, stamped at log time. No join: the variant's
	/// `equipment` is a mutable column, and reading the key's second half through it
	/// meant one `UPDATE ExerciseVariant SET equipment = 'dumbbell'` rekeyed every
	/// set ever logged on that variant and every record derived from them. The
	/// migration that added the column backfilled it from exactly the two sources
	/// this select used to read — the variant, then the legacy `Exercise.equipment`
	/// string — so every row reads the same bucket it read before, from its own row.
	equipment: true,
} satisfies Prisma.ExerciseSetLogSelect

type HistoryRow = Prisma.ExerciseSetLogGetPayload<{
	select: typeof historySelect
}>

/**
 * **The one query behind every per-exercise reading** — the records strip, the
 * history curve and the Set Ghost.
 *
 * ADR 0058 found the ghost running its own pair of queries beside this one and
 * the two disagreeing on equipment scoping. There is now a single query and a
 * single scope: callers read the sets, then narrow them with the pure module's
 * `ExerciseScope`.
 *
 * **Ownership scoping** is enforced through `session: { userId }`, never by
 * filtering afterwards. Unbounded by design-debt rather than by design — ADR
 * 0058's stated `take`-less read, fine at today's volumes.
 */
export async function performedSetsForExercise(
	userId: string,
	exerciseId: string,
): Promise<PerformedSet[]> {
	const rows = await prisma.exerciseSetLog.findMany({
		where: { exerciseId, session: { userId } },
		orderBy: { orderIndex: 'asc' },
		select: historySelect,
	})
	return rows.flatMap((row) => toPerformedSet(row, exerciseId))
}

/**
 * One stored row as the pure modules read it.
 *
 * Returns nothing in two cases, and they are different sentences about the same
 * refusal to guess:
 *
 * - **The load cannot be parsed.** That is not a zero and not an `unloaded` hold,
 *   it is a row we cannot read, and it stays out of every reading.
 * - **The stored kilo contradicts the load that explains it.** `effectiveKg` is a
 *   pure function of `(load, bodyweightKg)` on every branch, so a row where it is
 *   not that function's answer carries a number nothing may be derived from — the
 *   hand-written `30 kg` load beside `effectiveKg: 300` is what reached a stored
 *   330 kg 1RM. It is not corrected here (ADR 0056 §3's bake is the record of what
 *   happened, and quietly substituting a fresh reading for it is the rewrite that
 *   ADR forbids) and it is not passed on: no record, no history point and no Set
 *   Ghost is minted from it. The grid still shows the row, with the contradiction
 *   stated beside it — `toLoggedRow`'s job, on the one surface that can explain it.
 */
function toPerformedSet(row: HistoryRow, exerciseId: string): PerformedSet[] {
	const reading = readStoredSetLoad(row)
	const load = reading.load
	if (!load) return []
	if (reading.kind === 'contradicted') return []
	return [
		{
			sessionId: row.sessionId,
			exerciseId,
			equipment: toEquipmentId(row.equipment),
			// **The session's own day**: back-filling last Tuesday's session today
			// must not make it today's history, and must not make it today's ghost.
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
}

/** Every set of this exercise as the record machinery reads it, each carrying
 * the row id so one set can be told from another. `performedSetsForExercise` is
 * the same query without the identity, and the pure modules never need it. */
async function recordedSetsForExercise(
	userId: string,
	exerciseId: string,
): Promise<Array<PerformedSet & { id: string }>> {
	const rows = await prisma.exerciseSetLog.findMany({
		where: { exerciseId, session: { userId } },
		orderBy: { orderIndex: 'asc' },
		select: historySelect,
	})
	return rows.flatMap((row) =>
		toPerformedSet(row, exerciseId).map((set) => ({ ...set, id: row.id })),
	)
}

/**
 * The identity of a reading within a variant, so "the same record before and
 * after" is a lookup rather than a scan.
 *
 * **`loadBasis` is part of the key because `records.ts` declares it part of the
 * key** — a `bar` reading and a `bodyweightDerived` one on the same lift are two
 * records and are never compared. Leaving it out collapsed them into one entry:
 * a bodyweight-derived 77 kg overwrote the bar's 82.5 kg in the `before` map, so
 * the bar's **unchanged** 82.5 kg looked new and the banner announced *"Heaviest
 * ever: 82.5 kg — up 2.5 kg"* on a 61.25 kg single. The mirror case is worse in
 * the other direction: a record the athlete really did set was suppressed
 * because a reading in another partition already held the key.
 */
function recordKey(record: StrengthRecord): string {
	return [
		record.exerciseId,
		record.equipment,
		record.loadBasis,
		record.kind,
		record.reps ?? '',
	].join(' ')
}

/**
 * **Which records this one set just took** — the reading behind the PR banner.
 *
 * Asked *after* the set is written, and answered against the athlete's history
 * **as it stood a moment before**: derive the records over everything that came
 * earlier, derive them again with this set added, and a reading whose value rose
 * is a reading this set took. Comparing against the past rather than against the
 * whole log is what survives the cases a banner gets wrong:
 *
 * - an **equal** set does not fire, because ties go to the earliest set and the
 *   original setter keeps the record (`records.ts`);
 * - **two identical sets** in the same session fire once: the first beats the
 *   history, and the second has its twin in front of it;
 * - a set logged **out of order** still reads against what preceded it, so
 *   back-filling last Tuesday cannot retroactively un-set today's record;
 * - the **between-sets double-tap** cannot fire twice, because the save is an
 *   upsert on `(sessionId, stepId, orderIndex)` and the second tap re-derives
 *   over exactly the same row, so the same answer replaces the first rather than
 *   adding to it. Nothing is written either way: a record is derived, never
 *   stored (ADR 0021, ADR 0058 §1).
 *
 * **Warm-ups and abandoned sets never reach the query.** `countsTowardWork` is
 * the one gate, asked before anything is read, so the ramp — the majority of the
 * taps on a heavy day — costs a single indexed lookup and nothing else.
 *
 * A **stack level, a band or an unloaded hold** has no honest kilo and is absent
 * from every kilo record; a machine stack still progresses against itself and
 * gets its `stackLevel` reading back, carrying the one phrase that says it
 * cannot be compared to anything else (ADR 0058 §5).
 *
 * **And a set dated in the future takes nothing yet.** The derivation is read at
 * `options.now` — the same cutoff the history strip is read at
 * ({@link hasHappenedBy}) — because this function feeds the PR banner and
 * `getExerciseHistoryView` feeds the page, and the two must not be able to
 * disagree about one set. A Pull-up logged at 11:00 into a session dated 23:30
 * tonight announced *"Heaviest bodyweight set: 109 kg — first time!"* on the very
 * payload whose `sessions` was empty and whose page read *"First time on this
 * lift"*. The banner now waits until the session's own day, and the record is
 * not lost: it announces itself on the next read after that instant.
 *
 * The cutoff is not applied here. It is applied inside `deriveStrengthRecords`,
 * which both surfaces go through, so there is one filter rather than a filter per
 * caller to keep in step.
 *
 * **Do not pass the session's own day as `now`.** The runner reads *anchors* and
 * the *ghost* as of `session.scheduledAt` on purpose (`strength-log.server.ts`) —
 * a prescription is priced for the day it was written for. A record is the
 * opposite kind of reading: it is a claim about the athlete's history as the
 * athlete can see it, and the history page has no session to read as of. Handing
 * this function the session's day would make the banner fire on work the page
 * still calls unlogged, which is exactly the defect the cutoff closes.
 *
 * Returns an empty array for a set that took nothing, for a row that is not this
 * athlete's, and for a Step logged against no exercise — there is no history to
 * be a record within.
 */
export async function recordsSetBy(
	userId: string,
	setLogId: string,
	/** The clock lives at this seam, not in the pure modules. Passed in by a test
	 * and by any caller that already knows what time the request is being served
	 * at; defaulted here so the reading has exactly one clock. */
	options: { now?: Date } = {},
): Promise<StrengthRecord[]> {
	const now = options.now ?? new Date()
	const row = await prisma.exerciseSetLog.findFirst({
		where: { id: setLogId, session: { userId } },
		select: {
			id: true,
			exerciseId: true,
			role: true,
			outcome: true,
			// The movement's own pattern, because the estimate's basis is a property
			// of the lift: the banner may not announce an estimated 1RM on a movement
			// the propose surface refuses to estimate.
			exercise: { select: { movementPattern: true } },
		},
	})
	if (!row?.exerciseId) return []
	if (
		!countsTowardWork({
			role: row.role as SetRole,
			outcome: row.outcome as SetOutcome,
		})
	) {
		return []
	}

	const sets = await recordedSetsForExercise(userId, row.exerciseId)
	const mine = sets.find((set) => set.id === row.id)
	if (!mine) return []

	// Everything the athlete had **before this set**, in the order the sets
	// happened: earlier days, then earlier positions within the same day. The
	// record is then the ordinary question — is this better than everything that
	// came before it? — which is also what makes two identical sets behave: the
	// first beats the history, the second has its twin in front of it.
	const earlier = sets.filter(
		(set) => set.id !== mine.id && isBefore(set, mine),
	)
	const derivation = {
		now,
		oneRm: recordOneRmModel(
			repLoadBasis(row.exercise?.movementPattern ?? null),
		),
	}
	const before = new Map(
		deriveStrengthRecords(earlier, derivation).map((record) => [
			recordKey(record),
			record.value,
		]),
	)
	return deriveStrengthRecords([...earlier, mine], derivation).filter(
		(record) => {
			const previous = before.get(recordKey(record))
			return previous == null || record.value > previous
		},
	)
}

/** Did `set` happen before `other`? The session's own day decides, and within a
 * day the position in the workout does — back-filling last Tuesday's session
 * today must not make it today's set. */
function isBefore(
	set: PerformedSet,
	other: PerformedSet & { orderIndex: number },
): boolean {
	const day = set.performedAt.getTime() - other.performedAt.getTime()
	return day === 0 ? set.orderIndex < other.orderIndex : day < 0
}

/** One equipment variant this athlete has actually lifted this exercise on, so
 * the surface offers only histories that exist. */
export type ExerciseVariantTab = {
	equipment: EquipmentId
	/** How many sessions of *work* the athlete has on this variant. */
	sessionCount: number
}

export type ExerciseHistoryView = {
	exercise: {
		id: string
		name: string
		/** `null` where nobody has stated whether this movement is worked one side
		 * at a time (ADR 0061). A surface that needs laterality — the log's
		 * other-side rep count, a per-side reading of a load — must say it does
		 * not know rather than fall back to bilateral: the fallback silently
		 * halves or doubles what the athlete actually lifted. */
		unilateral: boolean | null
	}
	/** Which variant this reading is scoped to; `null` reads across all of them. */
	equipment: EquipmentId | null
	variants: ExerciseVariantTab[]
	/** Every past session containing this lift, newest first. */
	sessions: ExerciseSessionSummary[]
	/** The last session containing **this exercise** — never the last calendar
	 * session, which on a push/pull/legs split is the wrong lift two days in three. */
	lastTime: ExerciseSessionSummary | null
	records: StrengthRecord[]
	/**
	 * **Why an assisted lift has no record**, or `null` where none was logged.
	 *
	 * An assisted machine's kilo is bodyweight *minus* the assistance, so it grows
	 * as the work shrinks (ADR 0056 §3) and no maximum over it is a best. The
	 * refusal is said out loud rather than shown as an empty strip, because the
	 * athlete's assisted pull-ups really are improving.
	 */
	recordsRefused: string | null
	/** Named on the axis, because an estimate is a model output. */
	estimator: EstimatorName
	/**
	 * **Why there is no estimated 1RM**, where there is none and something was
	 * read: an unmarked effort, a best set above the rep gate, or a movement with
	 * no validated curve. `null` when there is an estimate, or when nothing
	 * readable was logged at all.
	 *
	 * The row is never silently absent: the propose surface refuses out loud, and
	 * a strip that just stops showing the number would be the same lie in the
	 * other direction.
	 */
	oneRmUnavailable: string | null
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
 * **One `now`, read by everything in the payload.** The history, the Set Ghost's
 * "last time", the records, the assisted refusal, the missing-estimate sentence
 * and the variant tabs are all taken through {@link hasHappenedBy} at the same
 * instant, so no two lines of one payload can disagree about whether a session
 * has happened. That is what broke: the records had no cutoff, and the same
 * response carried a 109 kg record and an empty history.
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
		select: {
			id: true,
			name: true,
			unilateral: true,
			movementPattern: true,
		},
	})
	if (!exercise) return null

	// Which curve, if any, this movement is on. `unmapped` is why a row press gets
	// no estimated 1RM here and none on the propose surface either.
	const basis = repLoadBasis(exercise.movementPattern)
	const sets = await performedSetsForExercise(userId, exercise.id)
	const timezone = await getAthleteTimezone(userId)
	const now = options.now ?? new Date()

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
		variants: variantTabs(sets, now),
		sessions: exerciseHistory(sets, scope),
		lastTime: lastTimeYouDidThis(sets, scope),
		records: deriveStrengthRecords(scoped, {
			now,
			oneRm: recordOneRmModel(basis),
		}),
		recordsRefused: assistedRecordRefusal(scoped, now),
		estimator: DEFAULT_ESTIMATOR,
		oneRmUnavailable: oneRmUnavailableNote(scoped, basis, now),
		timezone,
		now,
	}
}

/**
 * The variants the athlete has history on, most-used first. Counted over *every*
 * logged set rather than qualifying work, because a tab that vanishes when a
 * whole session was abandoned is a tab that lies about what happened.
 *
 * **The time cutoff still applies**, which is a different question from the work
 * gate: a tab reading *"Barbell · 1"* over a page that says no sets are logged is
 * the same self-contradiction as the banner's, one widget over.
 */
function variantTabs(sets: PerformedSet[], now: Date): ExerciseVariantTab[] {
	const sessionsByEquipment = new Map<EquipmentId, Set<string>>()
	for (const set of sets) {
		if (!hasHappenedBy(set.performedAt, now)) continue
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
