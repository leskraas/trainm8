/**
 * **Strength records — derived, never stored.**
 *
 * ADR 0021 made a Personal Record the product of a detection function over the
 * athlete's efforts, so there is no way to author one; `personal-records.ts` is
 * the prior art and this is the same rule one track over. Nothing here is a
 * table, a column or a cache: feed it the logged sets and it says what the
 * records are.
 *
 * Pure: arrays in, decisions out. No clock, no query, no `prisma`, no random
 * source, and the only imports are the strength module's own vocabularies. **The
 * cutoff is one of the arguments**: `now` is required
 * ({@link StrengthRecordOptions}) and is the same instant the history strip is
 * read at, so a record cannot be announced from a session the history says has
 * not happened.
 *
 * **Only the honest readings ship** (`strength-module-brief.md` §E.1):
 *
 * - the **heaviest working set ever**, per variant — the number athletes
 *   actually care about;
 * - a **rep-max record per rep count** — the best load at *exactly* n reps, the
 *   least model-dependent record there is, because no equation stands between
 *   the bar and the reading;
 * - an **estimated 1RM**, which is a *model*, so the equation is injected
 *   ({@link OneRepMaxEstimator}), named on the record, and absent entirely when
 *   no estimator is supplied. This module owns no formula — and where the winning
 *   set is a **single**, no equation was applied to it, so the record says
 *   `'tested'` and names none (see {@link StrengthRecord.oneRmProtocol}).
 *
 * Every one of them is a reading about **reps**, so a **timed hold takes no
 * record** — see {@link statesReps}. A plank's kilos are real and its duration is
 * real, and neither makes a heaviest-ever lift.
 *
 * **And every one of them is a reading about one kind of kilo.** A record answers
 * *"what is the most you have done on this movement"*, so the two sides of the
 * comparison have to mean the same thing — and `effectiveKg` alone does not carry
 * that. The kilo is therefore partitioned by {@link RecordLoadBasis} and never
 * compared across it, an **`assisted`** set takes no record at all because its
 * number grows as the work shrinks, and the classification is the program
 * engine's own (`loadKindComparability`) rather than a second copy. See ADR 0058's
 * amendment: the sentence *"every record path selects `effectiveKg` and passes it
 * through"* was the bug.
 *
 * **Session tonnage and logging streaks are declined, not deferred** — ADR 0056's
 * considered options. Tonnage rewards junk volume and inverts the portability
 * thesis ADR 0046 §1 rests on; a streak measures app-opening and is actively
 * harmful if it discourages a deload. Neither is a reading about training, so
 * there is nothing here to import and no TODO promising one later.
 */
import { formatKg, formatNbKg } from '../format.ts'
import {
	type EquipmentId,
	type EstimatorName,
	type LoadValue,
	type SetOutcome,
	type SetRole,
	countsTowardWork,
} from '../strength-log.ts'
import { hasHappenedBy } from './exercise-history.ts'
import {
	KILO_LOAD_BASES,
	type KiloLoadBasis,
	kiloLoadBasis,
} from './program-rules.ts'

// ——— What a record is derived from ———————————————————————————————————————

/**
 * One logged set as the record machinery sees it: the qualification gate
 * (`role`, `outcome`), the progression key (`exerciseId`, `equipment`), when it
 * happened, and the two numbers a record can be made of.
 *
 * `effectiveKg` is **read, never re-derived**. It was baked at log time against
 * the bodyweight in force *then* (ADR 0056 §3); recomputing it from today's
 * bodyweight would silently rewrite a two-year-old weighted-dip record after a
 * 6 kg change. `null` means no honest kilo exists — a stack level, a band, an
 * unloaded hold, or a bodyweight-derived load with no bodyweight on file — and
 * such a set is absent from every kilo reading rather than counted as zero.
 */
export type RecordedSet = {
	sessionId: string
	exerciseId: string
	/** The other half of the progression key: barbell and dumbbell bench are
	 * separate histories, so a lighter dumbbell day is never a regression. */
	equipment: EquipmentId
	performedAt: Date
	role: SetRole
	outcome: SetOutcome
	load: LoadValue
	/** Baked at log time. Null where no honest kilo exists. */
	effectiveKg: number | null
	reps: number | null
	/**
	 * **What licenses an estimate**, carried on the set rather than assumed by the
	 * reading: the athlete's reported reps in reserve, and whether the set was
	 * taken to failure on purpose.
	 *
	 * Here because an estimated 1RM read off a set that was stopped five reps
	 * short is not a weak estimate, it is no estimate — in lifting there is no
	 * signature of maximality in the numbers (`one-rm.ts`). The observed records
	 * ignore both fields: a 100 kg set is 100 kg whatever the effort was.
	 */
	rir: number | null
	toFailure: boolean
}

/**
 * The 1RM equation, **injected**. An estimate is a model output, not an
 * observation, so this module takes the model rather than choosing one: the
 * estimator lives in `one-rm.ts` and its rep gate, its refusals and its
 * confidence grading stay there.
 *
 * Returning `null` is a **refusal** — a set of 20 is outside every published
 * equation's validated range, and so is a set nobody said how hard was — and a
 * refused set simply contributes nothing rather than being graded down.
 *
 * The effort is handed over with the numbers because the model's gates are the
 * model's business: **whether a submaximal set may be estimated from at all is
 * part of the equation's fit**, and if this module decided it, the history
 * surface and the propose surface would answer one question twice.
 */
export type OneRepMaxEstimator = (effort: {
	weightKg: number
	reps: number
	rir: number | null
	toFailure: boolean
}) => number | null

/** The injected estimator plus the name the axis has to print beside it. */
export type OneRepMaxModel = {
	name: EstimatorName
	estimate: OneRepMaxEstimator
}

export type StrengthRecordOptions = {
	/**
	 * **When the reading is being taken**, and therefore which work exists to be
	 * read: a set whose session's day is still ahead of `now` has not happened, and
	 * takes no record. Required rather than defaulted, so a surface cannot forget
	 * to say — the missing cutoff is exactly how a banner announced a record off a
	 * set the same page called unlogged. The rule itself is
	 * {@link hasHappenedBy}'s, shared with the history strip and the Set Ghost.
	 *
	 * This module still reads no clock. `now` arrives as an argument, from the one
	 * server seam that owns it.
	 */
	now: Date
	/** Omit it and no estimated-1RM record is produced. */
	oneRm?: OneRepMaxModel
}

// ——— What a record is ————————————————————————————————————————————————————

/**
 * **A union of its own, parallel to `BenchmarkKind` and not part of it.** The
 * spec asked for these to be grown onto `BenchmarkKind`; that is not what
 * shipped, `BenchmarkKind` is still the single member `farthest`, and the two
 * unions are unconnected — so a strength record cannot surface anywhere the
 * existing personal-record machinery reads, including the Cockpit's proof zone
 * (ADR 0058, Consequences). Said here rather than left implied, because a doc
 * comment claiming kinship would hide exactly that gap.
 *
 * `stackLevel` is the odd member and is here on purpose: a machine stack
 * progresses against *itself* (6 → 7 is real) and cannot be compared to anything
 * else, so it gets a record in its own unit instead of a fabricated kilo.
 */
export type StrengthRecordKind =
	| 'heaviestLoad'
	| 'repMax'
	| 'e1RM'
	| 'stackLevel'

/**
 * **What the kilos on a record are kilos *of*** — the partition a reading is
 * made within, and never across.
 *
 * A record answers *"what is the most you have done on this movement"*, and that
 * question needs the numbers on both sides of the comparison to mean the same
 * thing. `effectiveKg` alone does not carry that: 104 kg baked off
 * `{ kind: 'bodyweightPlus', addedKg: 30 }` is the athlete plus a dip belt, and
 * comparing it to a 30 kg bar announced *"Heaviest ever: 104 kg — up 74 kg"*
 * about a bench press whose heaviest bar was 30 kg. So the basis is **part of the
 * key**, beside `exerciseId` and `equipment`:
 *
 * - **`bar`** — `external` only, the one member that is a weight on the bar
 *   ({@link loadKindComparability}). The only basis that is comparable to
 *   anything outside itself.
 * - **`perHand`** — `perSide`. `effectiveKg` is the honest *total* (32 kg in each
 *   hand is 64 kg), but the athlete's number, the column and a bar are three
 *   different numbers, so it keeps its own progression.
 * - **`bodyweightDerived`** — `bodyweight` and `bodyweightPlus`, together on
 *   purpose: both include the athlete, both grow with what is hung off them, so a
 *   weighted dip beating an unweighted one is real progress and is visible here.
 *   It moves when the athlete's weight moves, which is exactly why it cannot be
 *   read against a bar.
 * - **`stackLevel`** — the ordinal, in levels, as ADR 0058 §2 already had it.
 *
 * **`assisted`, `band` and `unloaded` are not members**, because none of them
 * supports a *best*. See {@link assistedRecordRefusal} for the assist, which is
 * the one that used to slip through as a kilo.
 */
export type RecordLoadBasis =
	| 'bar'
	| 'perHand'
	| 'bodyweightDerived'
	| 'stackLevel'

/** The three bases a **kilo** reading can be made within, in the order they are
 * reported — the program rules' own partition, not a copy. `stackLevel` is not one
 * of them: its record is an ordinal. */
const KILO_BASES = KILO_LOAD_BASES
type KiloBasis = KiloLoadBasis

/**
 * **Which partition this set's kilo belongs to, or none at all.**
 *
 * The classification is **not made here** — it is {@link kiloLoadBasis}'s, which
 * is {@link loadKindComparability} asked which numbers may be ranked together, and
 * the same pair the program engine grades a session with. So the two surfaces
 * cannot disagree about what a logged number is. The engine learned this rule when it narrated *"Back Squat 74 kg →
 * 77.5 kg"* about an empty bar; the records surface had not, and announced the
 * same 74 kg as a heaviest-ever. One classification, two readings.
 *
 * `null` is *this set takes no kilo record*, and it has three causes, all of them
 * statements rather than gaps:
 *
 * - **`assisted` is sign-inverted** (ADR 0056 §3): the number is bodyweight minus
 *   the assistance, so a *bigger* number is *less* work and a "heaviest ever"
 *   over it points the wrong way. There is no honest maximum to take.
 * - **`stackLevel`** has a record, in levels, and it is not a kilo one.
 * - **`band` and `unloaded`** are not masses at all.
 *
 * The assist is refused **here** rather than left to the shared function, which
 * refuses it too: a `LoadValue`'s kind is what this module has, and saying the
 * inverted case out loud beside {@link assistedRecordRefusal} keeps the refusal and
 * its sentence next to each other.
 */
function kiloBasisOf(set: RecordedSet): KiloBasis | null {
	if (set.load.kind === 'assisted') return null
	return kiloLoadBasis(set.load.kind)
}

/**
 * **Why an assisted lift has no record**, in the one phrase the surface says
 * instead of going quiet.
 *
 * Returned for a history that contains qualifying assisted work, so the athlete
 * who does assisted pull-ups every week is told *why* the strip is empty rather
 * than left to read the silence as "no progress". The progress is real and the
 * app can see it; what it cannot do is call it a maximum, because the number it
 * would maximise gets bigger as the machine does more of the work.
 *
 * `null` where there is no assisted work, so nothing is said about an absence
 * that is not there.
 *
 * **Takes the same cutoff the records do**, and for the same reason: this
 * sentence explains why the strip beside it is empty, so it may only be said
 * about work that strip could have contained. Explaining an emptiness with a
 * session the page says has not happened is the defect one line over.
 */
export function assistedRecordRefusal(
	sets: RecordedSet[],
	now: Date,
): string | null {
	return sets.some(
		(s) =>
			countsTowardWork(s) &&
			hasHappenedBy(s.performedAt, now) &&
			s.load.kind === 'assisted',
	)
		? ASSIST_INVERTED_NOTE
		: null
}

export type StrengthRecord = {
	exerciseId: string
	equipment: EquipmentId
	/** The third of the key: which kind of kilo this record is a record of. A
	 * `bar` reading and a `bodyweightDerived` one on the same lift are two
	 * records, never one, and neither is ever compared with the other. */
	loadBasis: RecordLoadBasis
	kind: StrengthRecordKind
	/** The rep count a `repMax` is *exactly* at; null for every other kind. */
	reps: number | null
	value: number
	/** Stated so nothing can read an ordinal as a mass. */
	unit: 'kg' | 'level'
	sessionId: string
	achievedAt: Date
	/** The best this record beat — the best from *before* it was set. */
	previousValue: number | null
	/** `value − previousValue`; null when nothing came before. */
	delta: number | null
	/** False where the reading has no honest kilo behind it. */
	crossExerciseComparable: boolean
	/** The one phrase that says why comparison is unavailable, or null. */
	unavailableNote: string | null
	/** Fewer than {@link DEBUT_PRIOR_SESSIONS} sessions on this variant before the
	 * record: an early entry, which is announced quietly rather than as a PR. What
	 * it does **not** decide is whether this was a first time — see
	 * {@link recordGainPhrase}. */
	debut: boolean
	/**
	 * **How an `e1RM` reached its number** — the equation that was applied, or
	 * `'tested'` where none was. **Absent** on the observed records, which have no
	 * model between the bar and the reading and so have no protocol to name.
	 *
	 * `'tested'` is `one-rm.ts`'s own `protocol` value and means the same thing
	 * here: the winning set was a **single**, so the number *is* the load lifted
	 * and no equation touched it. The record used to name the injected model
	 * unconditionally and printed *"61.25 kg (epley)"* about a kilo Epley never
	 * saw — an equation credited with a measurement.
	 */
	oneRmProtocol?: EstimatorName | 'tested'
	/**
	 * The equation named on an `e1RM`, or null where no equation was applied — a
	 * **projection** of {@link StrengthRecord.oneRmProtocol} for the surfaces that
	 * print an equation's name, and never a second source of truth.
	 */
	estimator: EstimatorName | null
}

/**
 * How many prior sessions a variant needs before a best becomes a *record*.
 * A first-ever dumbbell bench firing four PRs on day one is the failure this
 * avoids: "first time!" is both truer and nicer.
 */
export const DEBUT_PRIOR_SESSIONS = 3

const NO_KILOS_NOTE = 'No kilos — this progresses against itself only.'

/** The assist's refusal, as {@link assistedRecordRefusal} says it. */
export const ASSIST_INVERTED_NOTE =
	'An assisted set takes no record: the number is your bodyweight minus the assistance, so it grows as the work shrinks.'

/**
 * **The one phrase each partition carries**, or none for the bar.
 *
 * A `bar` record is the only one comparable to anything outside itself, so it is
 * the only one that says nothing. The other three say what they progress against
 * — in place, on the number, argument behind a tap (#437's rule) — because a
 * reading the athlete cannot place is a reading they will misread.
 */
const BASIS_NOTES: Record<RecordLoadBasis, string | null> = {
	bar: null,
	perHand: 'Per-hand kilos — this progresses against other per-hand sets only.',
	bodyweightDerived:
		'Includes your bodyweight — this progresses against other bodyweight sets only.',
	stackLevel: NO_KILOS_NOTE,
}

const KIND_ORDER: StrengthRecordKind[] = [
	'heaviestLoad',
	'repMax',
	'e1RM',
	'stackLevel',
]

// ——— Derivation ——————————————————————————————————————————————————————————

type Candidate = {
	value: number
	set: RecordedSet
	/** Set on 1RM candidates only: how *this* candidate's number was arrived at, so
	 * the record names what happened to the set that won rather than what the
	 * injected model is called. */
	oneRmProtocol?: EstimatorName | 'tested'
}

/**
 * The athlete's current strength records, one per variant per reading.
 *
 * - **One qualification gate**, shared with every other strength aggregate:
 *   `countsTowardWork` — a working set that finished. Warm-ups never set a
 *   record and abandoned sets are dropped from every aggregate.
 * - **One time cutoff**, shared with the history strip and the Set Ghost:
 *   {@link hasHappenedBy}. Work dated after `options.now` has not happened, so it
 *   takes no record — and because the cutoff is applied *here*, inside the single
 *   derivation both the runner's PR banner and the history strip read, the two
 *   surfaces cannot be given different answers about the same set. Filtering at
 *   the call sites instead is what let them disagree.
 * - **Scoped to `(exerciseId, equipment)`**, the progression key, so the lifts
 *   only ever compete with themselves.
 * - **Ties go to the earliest set**, so the athlete who first reached the number
 *   keeps the record.
 * - **The previous best is the best from before the record was set** — what the
 *   athlete actually beat, never a later, lighter session.
 *
 * Returned in a stable order (variant, then reading, then rep count) so a strip
 * does not reshuffle between renders.
 */
export function deriveStrengthRecords(
	sets: RecordedSet[],
	options: StrengthRecordOptions,
): StrengthRecord[] {
	const byVariant = new Map<string, RecordedSet[]>()
	for (const set of sets) {
		if (!countsTowardWork(set)) continue
		// Not yet. A set logged into a session dated later than `now` is work the
		// history cannot see, and a record read off it contradicts the page it is
		// printed on. Same predicate as `exerciseHistory`'s scope.
		if (!hasHappenedBy(set.performedAt, options.now)) continue
		// The separator is an escaped NUL because a cuid never contains one, so two
		// ids can never run together into the same key. Written as \u0000, never as a
		// raw byte: a literal NUL makes this file binary to grep and rg.
		const key = `${set.exerciseId}\u0000${set.equipment}`
		const bucket = byVariant.get(key) ?? []
		bucket.push(set)
		byVariant.set(key, bucket)
	}

	const records: StrengthRecord[] = []
	for (const group of byVariant.values()) {
		records.push(...variantRecords(group, options))
	}

	return records.sort(
		(a, b) =>
			a.exerciseId.localeCompare(b.exerciseId) ||
			a.equipment.localeCompare(b.equipment) ||
			KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
			(a.reps ?? 0) - (b.reps ?? 0),
	)
}

function variantRecords(
	group: RecordedSet[],
	options: StrengthRecordOptions,
): StrengthRecord[] {
	const records: StrengthRecord[] = []
	// **The basis order is this loop plus the stack push below**, and it is the one
	// an athlete reads in: the bar's reading — what they mean by "my bench" — leads,
	// because `KILO_LOAD_BASES` opens on `bar`, and the qualified partitions follow
	// it. There is deliberately no second `BASIS_ORDER` table restating that: the
	// shared partition already carries the order, and a table beside it is a table
	// that can disagree with it.
	for (const basis of KILO_BASES) {
		records.push(...basisRecords(group, basis, options))
	}

	// A machine stack is an ordinal, so its record is in levels and is excluded
	// from anything that compares it to a barbell. A band gets no record at all:
	// band colours have no published order, and inventing one would be the same
	// fabrication as inventing kilos for the stack.
	// The rep gate applies here for the reason it applies to the kilo readings: a
	// timed hold on level 7 is not a "best level" either, it is a hold.
	const stackSets = group.filter((set) => set.load.kind === 'stackLevel')
	const levels = stackSets.flatMap((set) =>
		set.load.kind === 'stackLevel' && statesReps(set)
			? [{ value: set.load.level, set }]
			: [],
	)
	const levelRecord = record(levels, stackSets, {
		basis: 'stackLevel',
		kind: 'stackLevel',
		unit: 'level',
	})
	if (levelRecord) records.push(levelRecord)

	return records
}

/**
 * The kilo readings of **one partition** of one variant.
 *
 * A kilo record can only be made of sets that have an honest kilo, **a rep
 * count**, and **a kilo of this basis**.
 *
 * The basis gate is the fix for the defect this module shipped with: it filtered
 * on `effectiveKg` alone and consulted `load.kind` only to find a stack level, so
 * every kind that bakes a kilo landed in one pile. An assisted squat read
 * *"Best 2-rep set: 64 kg — first time!"* with nothing on the bar, and a dip-belt
 * bench read *"Heaviest ever: 104 kg — up 74 kg"* on a lift whose heaviest bar was
 * 30 kg — on the same page as the engine's own sentence saying that number is not
 * a weight on the bar.
 *
 * The rep gate is what keeps a **timed hold** out of the kilo readings. A
 * 45-second bodyweight push-up hold logs `effectiveKg` = the athlete's
 * bodyweight (baked at log time, ADR 0056 §3) and no reps, and reading a
 * *heaviest weight ever* off it announced "Heaviest ever: 74 kg — first time!"
 * about a set whose entire content is a duration. The kilo is real; the
 * reading is not. A hold is not a heaviest lift, and a hold's kilos cannot be
 * ranked against a five-rep set in the same column.
 *
 * Every logged set states reps *or* seconds (`statesWhatWasPerformed`), so
 * `reps == null` on a qualifying set means "this was timed" — no extra field is
 * needed to tell them apart, and a legacy row that states neither is not a set
 * either and belongs in no reading.
 *
 * **A hold therefore takes no record at all, and that is the answer, not a
 * gap.** ADR 0058's honest readings are all rep-based (heaviest working set,
 * best load at exactly n reps, estimated 1RM) and none of them can be read off
 * a duration; ADR 0056 declined tonnage and streaks, so a "longest hold ever"
 * invented here to fill the silence would be the third vanity metric of the
 * same family. Saying nothing about a plank is the honest reading. Do not add
 * one without an ADR that supersedes 0058.
 */
function basisRecords(
	group: RecordedSet[],
	basis: KiloBasis,
	options: StrengthRecordOptions,
): StrengthRecord[] {
	const records: StrengthRecord[] = []
	// **The partition is also the history.** `debut` and the previous best are
	// counted over this basis only, because a first dip-belt bench is a first entry
	// on that progression however many barbell sessions sit behind it — and the
	// barbell sessions are not what it beat.
	const ofBasis = group.filter((set) => kiloBasisOf(set) === basis)
	const withKilos = ofBasis.filter(
		(s) => s.effectiveKg != null && s.effectiveKg > 0 && statesReps(s),
	)

	const heaviest = withKilos.map((set) => ({ value: set.effectiveKg!, set }))
	const heaviestRecord = record(heaviest, ofBasis, {
		basis,
		kind: 'heaviestLoad',
		unit: 'kg',
	})
	if (heaviestRecord) records.push(heaviestRecord)

	const repCounts = new Set(
		withKilos.flatMap((s) => (s.reps != null && s.reps > 0 ? [s.reps] : [])),
	)
	for (const reps of [...repCounts].sort((a, b) => a - b)) {
		const atReps = withKilos
			.filter((s) => s.reps === reps)
			.map((set) => ({ value: set.effectiveKg!, set }))
		const repMax = record(atReps, ofBasis, {
			basis,
			kind: 'repMax',
			unit: 'kg',
			reps,
		})
		if (repMax) records.push(repMax)
	}

	// **An estimated 1RM is a bar reading and is taken off the bar only.** The
	// equation maps reps to a fraction of a one-rep *maximum*, and the number it
	// produces is what an anchor and the propose surface price a prescription in
	// (`anchors.constants.ts`). Feeding it a kilo that includes the athlete would
	// hand those surfaces a bar weight the athlete has never touched — the same
	// mistake as the heaviest-ever, laundered through a model. A weighted dip has a
	// `bodyweightDerived` heaviest and a rep-max, and no estimate.
	const model = basis === 'bar' ? options.oneRm : undefined
	if (model) {
		const estimates: Candidate[] = withKilos.flatMap((set): Candidate[] => {
			if (set.reps == null || set.reps <= 0) return []
			const consented = model.estimate({
				weightKg: set.effectiveKg!,
				reps: set.reps,
				rir: set.rir,
				toFailure: set.toFailure,
			})
			// A refusal contributes nothing rather than being graded down. The model's
			// gates — the rep range, the effort, an unmapped movement — decide *whether*
			// a set may be read at all, and they are asked first for a single too.
			if (consented == null) return []
			// **A single is the measurement, and the record says so.** `one-rm.ts` names
			// running an equation over a one-rep set as forbidden — *"Epley would report
			// 103.3 kg from a 100 kg single, fabricating 3.3 kg"* — so the value here is
			// the load lifted and the protocol is `tested`, not the model's name. The
			// number and its label are decided by the same branch on purpose: the defect
			// was a strip printing *"61.25 kg (epley)"*, an equation's name over a kilo
			// no equation produced.
			return set.reps === 1
				? [
						{
							value: set.effectiveKg!,
							set,
							oneRmProtocol: 'tested' as const,
						},
					]
				: [{ value: consented, set, oneRmProtocol: model.name }]
		})
		const e1rm = record(estimates, ofBasis, {
			basis,
			kind: 'e1RM',
			unit: 'kg',
		})
		if (e1rm) records.push(e1rm)
	}

	return records
}

/**
 * Whether this set counted repetitions. A set that did not is a timed one — a
 * hold — and every reading in this module is a reading about reps.
 */
function statesReps(set: RecordedSet): boolean {
	return set.reps != null && set.reps > 0
}

function record(
	candidates: Candidate[],
	group: RecordedSet[],
	shape: {
		basis: RecordLoadBasis
		kind: StrengthRecordKind
		unit: 'kg' | 'level'
		reps?: number
	},
): StrengthRecord | null {
	if (candidates.length === 0) return null
	// Best first; the earliest wins a tie, so the original setter holds it.
	const [best] = [...candidates].sort(
		(a, b) =>
			b.value - a.value ||
			a.set.performedAt.getTime() - b.set.performedAt.getTime(),
	)
	if (!best) return null

	const achievedAt = best.set.performedAt.getTime()
	const previousValue = candidates.reduce<number | null>(
		(bestBefore, candidate) =>
			candidate.set.performedAt.getTime() < achievedAt
				? Math.max(bestBefore ?? candidate.value, candidate.value)
				: bestBefore,
		null,
	)
	const priorSessions = new Set(
		group
			.filter((s) => s.performedAt.getTime() < achievedAt)
			.map((s) => s.sessionId),
	).size
	// **Only the bar is comparable outside itself**, and the note is the basis's
	// own — one table, so a partition cannot be flagged uncomparable and then
	// left with nothing to say, or say something and be flagged comparable.
	const note = BASIS_NOTES[shape.basis]

	return {
		exerciseId: best.set.exerciseId,
		equipment: best.set.equipment,
		loadBasis: shape.basis,
		kind: shape.kind,
		reps: shape.reps ?? null,
		value: best.value,
		unit: shape.unit,
		sessionId: best.set.sessionId,
		achievedAt: best.set.performedAt,
		previousValue,
		delta: previousValue == null ? null : best.value - previousValue,
		crossExerciseComparable: shape.basis === 'bar',
		unavailableNote: note,
		debut: priorSessions < DEBUT_PRIOR_SESSIONS,
		// **The winner's own protocol**, because a 1RM reading's candidates are not all
		// arrived at the same way: a tested single sits in the same pile as the
		// equation's output on a five-rep set, and whichever wins is what the record is
		// a record *of*.
		...(best.oneRmProtocol ? { oneRmProtocol: best.oneRmProtocol } : {}),
		estimator:
			best.oneRmProtocol === 'tested' ? null : (best.oneRmProtocol ?? null),
	}
}

// ——— The reading —————————————————————————————————————————————————————————

/**
 * The record as one phrase. The caveat sits *on* the number — an estimate names
 * its equation and an ordinal says it cannot be compared — rather than waiting
 * in a footnote nobody reads.
 */
export function strengthRecordLabel(record: StrengthRecord): string {
	const headline = `${strengthRecordHeadline(record)}: ${formatValue(record)}`
	const gain = recordGainPhrase(record)
	const phrase = gain ? `${headline} — ${gain}` : headline
	return record.unavailableNote
		? `${phrase} · ${record.unavailableNote}`
		: phrase
}

/**
 * **What a record says it is, in three words or none** — and the one place the
 * debut window becomes words, so the runner's banner and the history strip
 * cannot phrase the same record two ways.
 *
 * *"first time!"* is licensed by {@link StrengthRecord.previousValue} being null
 * and by nothing else: it is the statement *"nothing came before this reading"*,
 * which is exactly what a null previous best means. It is **not** licensed by
 * `debut`, and that was the defect — a 22.5 kg set inside the debut window read
 * "first time!" directly above a visible 20 kg session, contradicting what the
 * athlete could see on the same page.
 *
 * Inside the window a beaten reading reads *"best so far"*: true (it is the best
 * of every qualifying set), and deliberately quieter than the gain phrase, which
 * is what {@link DEBUT_PRIOR_SESSIONS} exists for. Day one on a dumbbell bench
 * still does not fire four PRs; it just no longer claims a first time it can see
 * is not one.
 */
export function recordGainPhrase(record: StrengthRecord): string | null {
	if (record.previousValue == null) return 'first time!'
	if (record.debut) return 'best so far'
	if (record.delta == null || record.delta <= 0) return null
	if (record.unit === 'kg') {
		// Stated as *the difference between the two numbers as they are shown*, so
		// "Heaviest ever 61.25 kg — up 21.25 kg" always reconciles with the 40 kg it
		// beat. Rounding the delta on its own can leave a gain that does not
		// subtract, which is the same class of defect as `61.3`.
		return `up ${formatNbKg(shownDeltaKg(record.value, record.previousValue ?? 0))} kg`
	}
	return `up ${formatNbKg(record.delta)} ${record.delta === 1 ? 'level' : 'levels'}`
}

/**
 * **What a record calls itself** — the one definition, read by both the runner's
 * banner and the history strip, so a reading cannot be headlined two ways on two
 * screens (ADR 0058's Consequences noted the presenter keeping its own copy).
 *
 * The basis is **in the words**, not only in the footnote. *"Heaviest ever:
 * 104 kg"* with a caveat underneath is still the sentence that was wrong: the
 * athlete reads the headline and the number. *"Heaviest bodyweight set: 104 kg"*
 * cannot be misread as a bar.
 */
export function strengthRecordHeadline(record: StrengthRecord): string {
	const qualifier = BASIS_QUALIFIERS[record.loadBasis]
	switch (record.kind) {
		case 'heaviestLoad':
			return qualifier ? `Heaviest ${qualifier} set` : 'Heaviest ever'
		case 'repMax':
			return qualifier
				? `Best ${record.reps}-rep ${qualifier} set`
				: `Best ${record.reps}-rep set`
		case 'e1RM':
			// Bar-only by construction — see `basisRecords`. And *estimated* is a claim
			// about how the number was got, so a tested single does not make it: it is a
			// lift, and the headline says which of the two the athlete is reading.
			return record.oneRmProtocol === 'tested'
				? 'Best tested 1RM'
				: 'Best estimated 1RM'
		case 'stackLevel':
			return 'Best level'
	}
}

/** The word that names the partition inside a headline. The bar takes none: it is
 * what an athlete means by "my bench", and qualifying it would make the ordinary
 * case read like the exception. */
const BASIS_QUALIFIERS: Record<RecordLoadBasis, string | null> = {
	bar: null,
	perHand: 'per-hand',
	bodyweightDerived: 'bodyweight',
	stackLevel: null,
}

/**
 * The number with **what produced it** in the same breath: an equation names
 * itself, and a tested single says *the load lifted* — `one-rm.ts`'s own words for
 * the same case — rather than borrowing the name of an equation that was never
 * applied.
 */
function formatValue(record: StrengthRecord): string {
	if (record.unit === 'level') return formatNbKg(record.value)
	const kg = `${formatNbKg(record.value)} kg`
	if (record.oneRmProtocol === 'tested')
		return `${kg} (${TESTED_SINGLE_PHRASE})`
	return record.estimator ? `${kg} (${record.estimator})` : kg
}

/** What a `tested` 1RM is, in three words. `one-rm.ts`'s `equationText` says the
 * long version — *"the load lifted — a single to failure is the measurement, so no
 * equation is applied"* — and this is the short one, on the number itself. */
export const TESTED_SINGLE_PHRASE = 'the load lifted'

/** The gain the two shown weights actually differ by. Both sides go through
 * {@link formatKg} first, so a delta can never disagree with the pair it was
 * subtracted from. */
function shownDeltaKg(value: number, previousValue: number): number {
	return Number(formatKg(value)) - Number(formatKg(previousValue))
}
