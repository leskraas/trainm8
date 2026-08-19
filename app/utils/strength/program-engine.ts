/**
 * **The program engine** — the heart of a linear-progression strength program.
 *
 * One sentence contains the whole design: **the next weight is a pure function
 * of the last logged session.** Progression here is *outcome-indexed*, and the
 * calendar contributes nothing. ADR 0047's strength segment is calendar-indexed
 * (week 7 → 18 sets) and stays correct for the season layer; it does not reach
 * this layer, and the two never write each other's number. A program paused for
 * three months resumes exactly where it stopped, because **no source in this
 * family publishes a detraining rule and inventing one would be fiction.**
 *
 * ## The purity contract, which is what makes the test seam sufficient
 *
 * - **No clock.** `nowISO` is an argument, and it is used only to stamp the
 *   outcomes — never to decide anything.
 * - **No random source**, seeded or otherwise.
 * - **No database.** The definition and the state arrive as arguments, so the
 *   server can re-run the engine rather than trusting a payload.
 * - **No mutation.** Every returned state is new.
 * - **Imports:** `zod` (via the rule vocabulary) and this module's own
 *   constants. Nothing else — in particular its two real dependencies are
 *   **injected functions**: the 1RM estimator an Anchor Re-estimate needs
 *   ({@link AnchorReEstimator}) and the plate solver a prescribed weight has to
 *   be loadable by ({@link LoadableRounder}). Both live in their own modules,
 *   and neither drags a query or a fake in here.
 *
 * A whole StrongLifts run is therefore testable as a fold: feed six sessions of
 * logged sets, assert the working weights and the outcomes at the end. That one
 * test covers the cursor, the predicate, the increment, the Stall Count and the
 * Stall Cut, and it needs no database.
 *
 * ## What it deliberately does not do
 *
 * - **It does not *do* the plate maths, and it does not ship a second rounding
 *   rule.** It does insist that a weight it *prescribes* is one somebody can
 *   load — 10 % off 22.5 kg is 20.25 kg, and no bar makes that — but it gets the
 *   answer by asking the injected {@link LoadableRounder}, which is
 *   `plates.ts`' solver run backwards against this athlete's own rack. The
 *   arithmetic figure is kept beside it as `unroundedWorkingWeightKg`, so the
 *   next percentage does not compound the rounding, and where the two differ
 *   the outcome's reason says so.
 * - **It does not tell the athlete anything.** It returns outcomes with reasons;
 *   the server says what happened **once, as a notice, never as an offer** — an
 *   engine that silently drops the squat 10 % and shows the new number is the
 *   exact failure the Load Recompute Notice pattern exists to prevent.
 * - **It does not model assistance work.** No program in the family publishes a
 *   progression rule for it, so modelling it would be inventing one.
 * - **No velocity, no tonnage records, no streaks.**
 *
 * ## The known gap: a program lift the athlete does not load with a bar cannot
 * progress yet
 *
 * This engine's grading vocabulary can already express *"the prescription has no
 * kilo either, so the reps are the whole of what can be read"* — a `made` verdict
 * with `loadStated: false`, which is ADR 0056 §3 and ADR 0008's Unavailable
 * Metric. **Production cannot reach it.** `ProgramLiftState.currentWorkingWeightKg`
 * is a non-null kilo, so every prescription this engine resolves is a kilo, so a
 * lift logged on a machine stack or a band is graded `unverifiable` forever and
 * never progresses. Level 6 → 7 is real progress and the app cannot record it.
 *
 * **The same gap, one size larger:** a kilo that measures something *other* than
 * the bar is exactly as unreadable, so a lift the athlete logs as bodyweight,
 * bodyweight-plus, assisted or per-hand is also `unverifiable` forever against a
 * kilo-priced prescription (see `loadKindComparability`). That is the honest
 * answer — reading an assisted 64 kg as a 64 kg bar weight moved a working weight
 * on a number that means the opposite as it grows — and the remedy is the same
 * slice: the prescription has to be a `LoadValue` too, so like is compared with
 * like. Until then the sentence tells the athlete to log the bar, or to change
 * what the program prescribes.
 *
 * It is stated here rather than papered over, and the `unverifiable` sentence says
 * it to the athlete in as many words. Closing it is a slice of its own, and these
 * are its parts:
 *
 * 1. **The working load becomes a union, not a nullable number.** The log side
 *    already has `LoadValue`; the state side should hold the same shape — an
 *    external kilo, a stack level, a band, an unloaded hold — rather than
 *    `currentWorkingWeightKg: Float?` plus an ordinal column, which is two fields
 *    that can disagree and a third state (both null) that means nothing.
 * 2. **`weightHistory` and `stallHistory` take the same union.** A history of
 *    kilos with holes in it where the levels were is unreadable, and a **Weight
 *    Rollback** reads that history to find a load the lift actually used.
 * 3. **The increment becomes a step in the load's own units.** *"+1 level"* is
 *    not *"+1 kg"*, and `incrementedWeightKg` currently cannot say which it is.
 * 4. **The stamp has to carry the ordinal.** `readStampedPrescription` reads
 *    `ExerciseSet.weightKg`, which is the legacy kilo projection; it would have to
 *    read the `load` JSON, and `gradeSession` would compare ordinals to ordinals
 *    and refuse to compare an ordinal to a kilo.
 * 5. **The unique index needs watching.** `(instanceId, exerciseId, equipment)`
 *    is unique and SQLite treats NULLs in a unique index as distinct — the hole
 *    that has already produced two duplication bugs here. Any new nullable column
 *    on `ProgramLiftState` must stay out of that key.
 * 6. **Somewhere to declare it.** The athlete has to be able to say *"this lift
 *    is a stack, starting at level 6"* when the program is started, which is the
 *    program-start surface and not this module.
 */
import {
	type Increment,
	type LiftProgressionRule,
	type ProgramCursor,
	type ProgramDefinition,
	type LoggedWorkSet,
	type StallResponse,
	type SessionVerdict,
	type UnreadableLoadReason,
	adjustedIncrement,
	advanceCursor,
	amrapSet,
	cursorDayId,
	gradeSession,
	incrementedWeightKg,
	liftIsOnDay,
	loadKindIsBodyweightDerived,
	loadKindLabel,
	unreadableLoad,
	normaliseKg,
	progressionSets,
	topSet,
} from './program-rules.ts'
import { DEFAULT_LOADABLE_STEP_KG, formatKg } from './program.constants.ts'

// ——— The state ———————————————————————————————————————————————————————————

/** One entry of a lift's weight history. A **Weight Rollback** needs a weight
 * the lift *actually used*, and no rule can reconstruct one. */
export type WeightHistoryEntry = {
	sessionId: string
	weightKg: number
	succeeded: boolean
}

/**
 * One entry of a lift's stall history. **Not needed to compute the next
 * weight** — it exists so *"why did my squat drop 10 kg?"* has an honest answer.
 */
export type StallHistoryEntry = {
	sessionId: string
	fromKg: number
	toKg: number
	response: StallResponse['kind']
}

/**
 * The per-lift progression state — the pieces that provably cannot be derived.
 * A squat can be mid-stall while a bench is still adding weight, because this is
 * per lift and never per session.
 */
export type ProgramLiftState = {
	exerciseId: string
	/** The other half of the progression key, so barbell and dumbbell bench
	 * progress separately. */
	equipment: string | null
	/** What goes on the bar next. */
	currentWorkingWeightKg: number
	/** The **unrounded intent** beside it: the program says 70 % of 102.5 =
	 * 71.75 kg and the bar makes 72.5 kg. Storing only the rounded number makes
	 * the next percentage compound the rounding error. */
	unroundedWorkingWeightKg: number | null
	/** Percentage families only. **Authored state**, not a recomputable display
	 * artefact, and deliberately not an `ExerciseThreshold` construct. */
	trainingMaxKg: number | null
	/** The fraction of the anchor the training max is — explicit and visible,
	 * never a silent multiplier. */
	workingFraction: number | null
	/** The **Stall Count**: consecutive sessions this lift failed its predicate.
	 * Stored, not derived at read time, and reset to 0 on any success. */
	stallCount: number
	/** **Mutable**: Starting Strength shrinks it at the same moment it cuts the
	 * weight, so the increment is state and not just a rule. */
	currentIncrement: Increment
	/** The athlete's own overrides — increment, stall cut and frequency are the
	 * three settings the reference product exposes per exercise. The increment
	 * override *is* `currentIncrement`; there is no second field to disagree. */
	stallCutPctOverride: number | null
	progressEveryNSessionsOverride: number | null
	weightHistory: WeightHistoryEntry[]
	stallHistory: StallHistoryEntry[]
}

/** The athlete's run of a program, as the pure engine sees it. */
export type ProgramInstanceState = {
	programId: string
	variantId: string
	/** **Stored, never counted** from the session log. */
	cursor: ProgramCursor
	lifts: ProgramLiftState[]
}

// ——— The injected estimator ———————————————————————————————————————————————

/**
 * **The Anchor Re-estimate's one dependency, injected rather than imported.**
 *
 * 5/3/1: *"If you get fewer than 3 reps, use that number to estimate your 1 Rep
 * Max, and reset your TM based on that for your next cycle."* That needs a 1RM
 * estimator, which lives in its own pure module (`one-rm.ts`) with its own
 * formulas, its own ≤ 10-rep gate and its own refusals. Taking it as a function
 * keeps this engine pure and keeps two vocabularies from leaking into one file.
 *
 * The return type is ADR 0054's shape: **an estimate or a refusal**, because
 * *"we did not look"* and *"we looked and there is nothing"* are different
 * statements. A refusal here does **not** become a fabricated training max — see
 * the `stallResponseUnavailable` outcome.
 */
export type AnchorReEstimator = (input: {
	exerciseId: string
	equipment: string | null
	/**
	 * **Which logged row the weight and reps below were read off** — the row
	 * itself, identified, rather than left to be found again by its numbers.
	 *
	 * The server's estimator needs that row's load kind, RIR, `toFailure` and date
	 * to grade the reading, and it used to look the row back up with
	 * `reps === reps && effectiveKg === weightKg`. Two sets sharing a number then
	 * swapped identities. `null` where the caller cannot name a row, which a
	 * reader must treat as *no provenance* rather than as any particular set.
	 */
	setLogId: string | null
	/** The estimator the program's rule names (`epley`, `brzycki`, …). Typed as
	 * a string because the canonical vocabulary belongs to the estimator module,
	 * not to the program rules that reference it. */
	estimator: string
	weightKg: number
	reps: number
}) => /** `basis` is the estimator's own provenance, as a sentence — which equation
	 * read which set, how it was graded, and what it borrowed to do it. Where it
	 * is given, the outcome's reason ends with it. */
	| { kind: 'estimate'; oneRmKg: number; basis?: string }
	| { kind: 'refusal'; reason: string }

// ——— The injected rounder ————————————————————————————————————————————————

/**
 * **The second injected dependency: what this athlete's rack can actually
 * make.**
 *
 * A prescribed working weight has to be a weight somebody can put on a bar. Ten
 * per cent off 22.5 kg is 20.25 kg, and the app used to store and prescribe
 * exactly that — then contradict itself across four surfaces about what the
 * number even was. Loadability is `plates.ts`' problem and it already solves it
 * against the athlete's own `PlateInventory`, ties going to the lighter weight,
 * refusing honestly where a rack cannot make a number at all. **This engine does
 * not reimplement any of that**; it asks.
 *
 * Injected rather than imported for the same reason the estimator is: the solver
 * needs an inventory, an inventory needs a query, and this module has neither a
 * `prisma` nor a fake. The server passes the real one; a test passes a rack.
 *
 * `null` is a refusal, and it means *this load has no honest kilo* — a machine
 * stack level, a band, an unloaded hold (ADR 0056 §3, ADR 0008). The engine then
 * leaves the arithmetic number exactly as it is rather than forcing an ordinal
 * through a kilo rounding, and claims nothing about loadability.
 *
 * With **no rounder at all** the engine emits the arithmetic weight, which is
 * what it always did and what the pure fold tests read.
 */
export type LoadableRounder = (input: {
	exerciseId: string
	equipment: string | null
	kg: number
}) => number | null

/**
 * **Where the prescription this session was actually stamped with comes from.**
 *
 * This is the root fix for both of the fabrications this engine has committed.
 * `applySession` used to grade the log against the prescription it re-resolved
 * from **live state**, while the grid the athlete ran is **frozen at its stamp**
 * — deliberately, because re-stamping mid-session would move the target out from
 * under sets that are already logged. Two prescriptions for one session, and the
 * grader took the one nobody was shown: stamp the grid at 60 kg, change the
 * working weight to 90 on the overview, log the remaining sets at the 60 kg the
 * grid asked for, and the outcome read *"logged at 60 kg, not the 90 kg 5×5 it
 * prescribed"* about a 90 kg prescription that was never on screen.
 *
 * So the prescription is **read**, not recomputed. The stamped kilos live on the
 * athlete's own copied `ExerciseSet` rows — the very rows the grid renders — and
 * the server hands them in through this seam. The grader and the screen then
 * cannot disagree by construction, which is the property that was missing all
 * along.
 *
 * Injected rather than queried for the usual reason: these rows need a `prisma`
 * and this module has none. `null` means *this session has no stamp for this
 * lift* — a session opened before loads were materialised — and the engine then
 * falls back to resolving from state, which is the best available answer and
 * still the same one the grid would have shown.
 *
 * **`null` is not a claim that the lift has no kilos.** A stamped array of all
 * `null`s is: that is a lift the engine could not price at all, and the reps are
 * then the whole of what can be read (ADR 0056 §3).
 */
export type StampedPrescriptionReader = (lift: {
	exerciseId: string
	equipment: string | null
}) => ReadonlyArray<number | null> | null

/** Which rack answered *"can this be loaded?"* — the athlete's own
 * `PlateInventory`, or the stated {@link DEFAULT_LOADABLE_STEP_KG} default step
 * where no gym is on file. **No number depends on this**; only the sentence
 * does, because *"27 kg is not a weight that can be loaded"* is a claim about a
 * gym the app may know nothing about. */
export type LoadabilityBasis = 'inventory' | 'default-step'

export type LoadabilityBasisReader = (lift: {
	exerciseId: string
	equipment: string | null
}) => LoadabilityBasis

/** Everything the engine cannot compute itself, in one bag. Optional: a run with
 * neither a percentage family nor a gym on file needs none of it. */
export type ProgramEngineDeps = {
	reEstimateAnchor?: AnchorReEstimator
	roundToLoadable?: LoadableRounder
	loadabilityBasis?: LoadabilityBasisReader
	stampedPrescription?: StampedPrescriptionReader
}

/** The rounder applied to one lift's number, with the engine's own fallback: no
 * rounder, or a refusal, leaves the arithmetic weight untouched. */
function loadable(
	lift: { exerciseId: string; equipment: string | null },
	kg: number,
	round: LoadableRounder | undefined,
): number {
	if (!round) return normaliseKg(kg)
	const rounded = round({ ...lift, kg })
	return normaliseKg(rounded ?? kg)
}

/**
 * **Why the number moved, said only as far as the app can see.**
 *
 * The old sentence was *"27 kg is not a weight that can be loaded"*, on an
 * athlete with **no `PlateInventory` on file at all** — a claim about a gym the
 * app has never been told about, and untrue of any gym owning a pair of 1.25 kg
 * plates. With no rack on file the true statement is the one about the app: it
 * rounds to a **stated 2.5 kg default step**, which the reason never mentioned
 * and now always does.
 */
function roundingNote(
	lift: { exerciseId: string; equipment: string | null },
	exactKg: number,
	landedKg: number,
	basis: LoadabilityBasisReader | undefined,
): string {
	if (normaliseKg(exactKg) === landedKg) return ''
	const from = trimKg(normaliseKg(exactKg))
	const to = trimKg(landedKg)
	return (basis?.(lift) ?? 'default-step') === 'inventory'
		? ` ${from} kg is not a weight the plates on file for your gym can make, so it lands on ${to} kg.`
		: ` No gym is on file, so the app rounds to its stated ${trimKg(DEFAULT_LOADABLE_STEP_KG)} kg default step: ${from} kg lands on ${to} kg. Describe your gym and this follows the plates you actually own.`
}

// ——— The outcome ——————————————————————————————————————————————————————————

/**
 * What happened to one lift, with its reason in the lift's own numbers.
 *
 * Six members, not the three a summary would suggest. `skipped`,
 * `stallResponseUnavailable` and `liftedLighter` are the three honest answers a
 * three-member union has to launder into something that did not happen: a lift
 * with no logged sets did not *repeat* its weight, a Stall Response whose input
 * is missing did not *stall* the lift, and a session lifted 40 kg under the
 * prescription neither made it nor failed at it.
 */
export type LiftOutcome = {
	exerciseId: string
	equipment: string | null
	/**
	 * **Where this lift stands now, read off the lift state after the fold** — and
	 * never off the stamp, the prescription or the log.
	 *
	 * This field exists because the app has stated a weight the athlete's lift was
	 * not at three separate times, and the third instance was here. A `repeated`
	 * outcome carried the *stamped* kilo and a `liftedLighter` outcome carried the
	 * *prescribed* one, both under the sentence *"stays at"*, while `applySession`
	 * had returned the lift state untouched — so the lift stood at its live
	 * working weight and the panel named neither.
	 *
	 * The rule, and it is the one every member of this union is now audited
	 * against: **a sentence about where the lift now stands reads `standsAtKg`; a
	 * sentence about what this session prescribed or what was logged reads the
	 * stamp or the log. Never one posing as the other.** Where an outcome moves
	 * the working weight this is that new weight; where it moves nothing — and
	 * four of the seven members move nothing — it is `currentWorkingWeightKg`
	 * exactly as it stood, which for an athlete who saved a weight by hand
	 * mid-session is *their* number and not the session's.
	 */
	standsAtKg: number
} & (
	| {
			kind: 'incremented'
			fromKg: number
			toKg: number
			reason: string
			appliedAtISO: string
	  }
	| {
			kind: 'repeated'
			weightKg: number
			stallCount: number
			reason: string
			appliedAtISO: string
	  }
	| {
			kind: 'stalled'
			response: StallResponse['kind']
			/** Which number the response moved. The percentage families move the
			 * training max, not the working weight, and saying "your squat dropped"
			 * about a training max would be a lie. */
			moved: 'workingWeight' | 'trainingMax'
			fromKg: number
			toKg: number
			reason: string
			appliedAtISO: string
	  }
	| {
			kind: 'stallResponseUnavailable'
			response: StallResponse['kind']
			weightKg: number
			stallCount: number
			reason: string
			appliedAtISO: string
	  }
	| { kind: 'skipped'; weightKg: number; reason: string; appliedAtISO: string }
	| {
			/**
			 * **The athlete worked, but not at the weight that was asked for.**
			 *
			 * A sixth member rather than a sixth way of saying "repeated", because
			 * the two things it is not are both wrong and both dangerous. It is not
			 * a **success**: five sets of five at 20 kg against a 62.5 kg
			 * prescription is not a 62.5 kg session, and crediting it is how the app
			 * came to narrate a lift that never happened. It is not a **miss**
			 * either: nothing was attempted at the prescribed weight, so there is no
			 * evidence a Stall Cut is the remedy, and an athlete backing off on
			 * purpose would otherwise be cut 10 % for it.
			 *
			 * So the weight repeats, the **Stall Count does not move in either
			 * direction**, and both numbers are stated — the one that was lifted and
			 * the one that was prescribed.
			 */
			kind: 'liftedLighter'
			prescribedKg: number
			/** The lightest set that came in under its own prescription. */
			loggedKg: number
			stallCount: number
			reason: string
			appliedAtISO: string
	  }
	| {
			/**
			 * **The session cannot be read against the weight it was priced at.**
			 *
			 * A seventh member, and the one FAIL A needed. The prescription is
			 * **90 kg** and every set was logged as a machine stack level, so there
			 * is no kilo anywhere in the log: the app cannot tell whether 90 kg was
			 * on the bar. Crediting it moved the weight to 92.5 kg and wrote
			 * `{weightKg: 90, succeeded: true}` into `weightHistory` — a weight that
			 * existed nowhere in the athlete's log, in the one piece of state no set
			 * log can re-derive.
			 *
			 * So: nothing moves. Not the weight, not the Stall Count, not the
			 * history. The athlete is told the session could not be read and what
			 * would make it readable, which is the only claim available here.
			 */
			kind: 'unverifiable'
			prescribedKg: number
			/** The weight that stays — unchanged, because nothing was learned. The
			 * same number as `standsAtKg`, and read from the same place. */
			weightKg: number
			/** How many graded sets could not be read, out of how many were graded.
			 * Carried so the **headline** cannot over-claim: two sets at exactly 90 kg
			 * and three as a stack level is not *"no kilos were logged"*, and the
			 * headline said that while the body said *"3 of the 5"*. */
			unreadableSetCount: number
			gradedSetCount: number
			/** **Which load kind was logged and why it is not that kilo** — the
			 * verdict's own two fields, passed through unchanged. The headline names
			 * the kind, because *"no kilos were logged"* is false about an assisted
			 * set: a kilo was logged, of something else. */
			loggedLoadKind: string | null
			unreadableReason: UnreadableLoadReason
			stallCount: number
			reason: string
			appliedAtISO: string
	  }
)

export type ApplySessionResult = {
	nextState: ProgramInstanceState
	outcomes: LiftOutcome[]
}

// ——— applySession ————————————————————————————————————————————————————————

/**
 * Fold one logged session into the program's state.
 *
 * Per lift, in this order — and the order matters, because a Stall Response that
 * fired before the count was incremented would fire one session early:
 *
 * 1. evaluate the success predicate over qualifying sets only;
 * 2. on success → Stall Count to 0, and apply the increment **if the trigger
 *    fires**;
 * 3. on failure → Stall Count + 1; at `stallsBeforeResponse`, apply the **Stall
 *    Response** and the increment adjustment, then reset the count. Otherwise
 *    the weight simply **repeats** — there is no separate "repeat" mode, because
 *    repeating is what the predicate failing means;
 * 4. advance the cursor;
 * 5. append to `weightHistory`, and to `stallHistory` if a response fired;
 * 6. emit the outcome, with its reason.
 *
 * `performedDayId` defaults to the day the cursor names. Pass it explicitly to
 * back-fill a session out of order: the cursor then advances from the day that
 * was actually performed, which is what keeps a skipped or duplicated session
 * from desyncing the whole program.
 */
export function applySession(
	state: ProgramInstanceState,
	definition: ProgramDefinition,
	loggedSets: LoggedWorkSet[],
	sessionId: string,
	nowISO: string,
	options: ProgramEngineDeps & { performedDayId?: string } = {},
): ApplySessionResult {
	const dayId = options.performedDayId ?? cursorDayId(state.cursor)
	const outcomes: LiftOutcome[] = []

	const lifts = state.lifts.map((liftState) => {
		const rule = definition.liftRules.find(
			(candidate) =>
				candidate.exerciseId === liftState.exerciseId &&
				candidate.equipment === liftState.equipment,
		)
		// A lift the definition has no rule for is not this program's business.
		if (!rule) return liftState
		// A lift that is not on today's day is left alone entirely — not failed,
		// not repeated, and above all not counted as a stall.
		if (!liftIsOnDay(rule, dayId)) return liftState

		const sets = progressionSets(loggedSets, liftState)
		// **The weights this lift was prescribed at — read off the stamp where
		// there is one.** The stamped kilos are the grid's own rows, so grading
		// against them is grading against the screen. Only a session with no stamp
		// falls back to resolving from state, and that is the same answer the grid
		// would have shown it.
		const prescribedKgs = sessionPrescribedKgs(
			rule,
			liftState,
			options.stampedPrescription,
			options.roundToLoadable,
		)
		const verdict = gradeSession(rule, sets, prescribedKgs)
		// The one weight this session asked for, for the families whose sets are
		// priced at the working weight — what moves, and what the history records.
		const sessionKg = sessionWorkingWeightKg(liftState, rule, prescribedKgs)

		if (verdict.kind === 'notLogged') {
			outcomes.push({
				exerciseId: liftState.exerciseId,
				equipment: liftState.equipment,
				kind: 'skipped',
				standsAtKg: liftState.currentWorkingWeightKg,
				weightKg: liftState.currentWorkingWeightKg,
				reason: 'No working sets were logged for this lift, so nothing moved.',
				appliedAtISO: nowISO,
			})
			return liftState
		}

		if (verdict.kind === 'liftedLighter') {
			// Neither a success nor a miss, and said as exactly that. Nothing is
			// appended to the weight history either: no attempt was made at the
			// prescribed weight, so there is nothing about it to record.
			outcomes.push({
				exerciseId: liftState.exerciseId,
				equipment: liftState.equipment,
				kind: 'liftedLighter',
				// Nothing moved, so the lift stands exactly where it stood — which is
				// **not** `prescribedKg`, and the panel used to say it was.
				standsAtKg: liftState.currentWorkingWeightKg,
				prescribedKg: verdict.prescribedKg,
				loggedKg: verdict.loggedKg,
				stallCount: liftState.stallCount,
				reason:
					liftedLighterReason(verdict, rule) +
					unchangedWeightNote(liftState, sessionKg),
				appliedAtISO: nowISO,
			})
			return liftState
		}

		if (verdict.kind === 'unverifiable') {
			// **Nothing moves.** Not the weight, not the Stall Count, and not the
			// weight history — a history entry here *is* the fabrication, because it
			// would assert a kilo the log does not contain.
			outcomes.push({
				exerciseId: liftState.exerciseId,
				equipment: liftState.equipment,
				kind: 'unverifiable',
				standsAtKg: liftState.currentWorkingWeightKg,
				prescribedKg: verdict.prescribedKg,
				weightKg: liftState.currentWorkingWeightKg,
				unreadableSetCount: verdict.unreadableSetCount,
				gradedSetCount: verdict.gradedSetCount,
				loggedLoadKind: verdict.loggedLoadKind,
				unreadableReason: verdict.reason,
				stallCount: liftState.stallCount,
				reason:
					unverifiableReason(verdict, rule) +
					unchangedWeightNote(liftState, sessionKg),
				appliedAtISO: nowISO,
			})
			return liftState
		}

		return verdict.kind === 'made'
			? applySuccess({
					liftState,
					rule,
					sets,
					verdict,
					sessionKg,
					sessionId,
					nowISO,
					outcomes,
					deps: options,
				})
			: applyFailure({
					liftState,
					rule,
					sets,
					sessionKg,
					sessionId,
					nowISO,
					outcomes,
					deps: options,
				})
	})

	const advanced = advanceCursor(state.cursor, definition.dayIds, dayId)

	return {
		nextState: { ...state, cursor: advanced.cursor, lifts },
		outcomes,
	}
}

/** Are this lift's sets priced **at the working weight**? A 5/3/1 set is a
 * percentage of a training max, and reading one of those as a working weight
 * would be reading one number as another. */
function gradedAtWorkingWeight(rule: LiftProgressionRule): boolean {
	return (
		rule.setWeightSources.length === 0 ||
		rule.setWeightSources.every((source) => source.kind === 'workingWeight')
	)
}

/**
 * **The weight this session asked for** — the stamped one, not the live one.
 *
 * The working weight can be changed on the overview *while a session is open*,
 * and the grid stays frozen at its stamp on purpose. The session then belongs to
 * the stamped number on both axes: it is what the athlete was graded against, it
 * is what repeats or stalls, and it is what `weightHistory` records. Reading the
 * live number instead is how a session run entirely at 60 kg came to write
 * `{weightKg: 90, succeeded: true}` — a weight that appears nowhere in the log,
 * into the one field no set log can re-derive.
 *
 * A change made mid-session is not lost, and it is not silent either: the reason
 * sentences say which number the session was run at (see
 * {@link stampedWeightNote}).
 */
function sessionWorkingWeightKg(
	liftState: ProgramLiftState,
	rule: LiftProgressionRule,
	prescribedKg: ReadonlyArray<number | null>,
): number {
	if (!gradedAtWorkingWeight(rule)) return liftState.currentWorkingWeightKg
	const stated = prescribedKg.filter((kg): kg is number => kg != null)
	return stated.length > 0
		? Math.max(...stated)
		: liftState.currentWorkingWeightKg
}

/**
 * **The weight this session actually established**, which is what the next one
 * is built on.
 *
 * `sessionKg` is what this session *asked* for. Where the athlete put more on the
 * bar and made it, incrementing off the prescription would under-credit them by
 * exactly the difference — and a heavier session is the one case where the two
 * numbers can honestly disagree, because a lighter one is never a success in the
 * first place.
 */
function successBaseKg(
	rule: LiftProgressionRule,
	verdict: Extract<SessionVerdict, { kind: 'made' }>,
	sessionKg: number,
): number {
	if (!gradedAtWorkingWeight(rule) || verdict.atKg == null) return sessionKg
	return Math.max(sessionKg, verdict.atKg)
}

/**
 * **Said out loud where the session's own weight and the stored one disagree.**
 *
 * The athlete changed the working weight after this session was stamped, so the
 * number that moves is not the number the overview has been showing. Silence
 * here would be the app quietly picking one of the two, which is precisely the
 * defect this whole seam exists to close.
 */
function stampDisagreesWithState(
	liftState: ProgramLiftState,
	sessionKg: number,
): boolean {
	return (
		normaliseKg(sessionKg) !== normaliseKg(liftState.currentWorkingWeightKg)
	)
}

/**
 * **The athlete saved a weight by hand, and this fold is about to write over
 * it.** Said, with both numbers, because the alternative is what shipped: a fold
 * graded from a 60 kg stamp wrote 92.5 kg over an explicitly saved 120 kg and
 * the athlete was told nothing at all about the number they had typed.
 *
 * Grading from the stamp is correct and is not up for negotiation — the stamp is
 * what the grid showed and what the sets were logged against. Discarding their
 * input **silently** is the part that is not.
 */
function replacedWeightNote(
	liftState: ProgramLiftState,
	sessionKg: number,
	toKg: number,
): string {
	if (!stampDisagreesWithState(liftState, sessionKg)) return ''
	return ` This session was stamped at ${trimKg(sessionKg)} kg, so it is graded and moved from that and not from the ${trimKg(liftState.currentWorkingWeightKg)} kg you saved as this lift's working weight after it was stamped. That ${trimKg(liftState.currentWorkingWeightKg)} kg is replaced by ${trimKg(toKg)} kg — if it was the number you meant, save it again.`
}

/**
 * **The same disagreement, where nothing moved.** The athlete's saved number
 * survives this fold, and that is worth one sentence too: the session was graded
 * against a different weight than the one the lift now stands at, and neither of
 * them is a mistake.
 */
function unchangedWeightNote(
	liftState: ProgramLiftState,
	sessionKg: number,
): string {
	if (!stampDisagreesWithState(liftState, sessionKg)) return ''
	return ` This session was stamped at ${trimKg(sessionKg)} kg and is graded against that. Nothing moved, so this lift still stands at the ${trimKg(liftState.currentWorkingWeightKg)} kg you saved after it was stamped.`
}

/** **"Miss two more sessions"**, and never *"Missed 1 sessions"*. One rule, one
 * place: the count is a program's own published figure and can be any number,
 * including one. */
function sessionsText(count: number): string {
	return count === 1 ? '1 session' : `${count} sessions`
}

/** What the athlete is warned about while the count is still short of the
 * threshold. */
function missMoreText(stallsBeforeResponse: number): string {
	return stallsBeforeResponse === 1
		? 'Miss it again and the weight comes down.'
		: `Miss ${sessionsText(stallsBeforeResponse)} in a row and the weight comes down.`
}

function applySuccess(args: {
	liftState: ProgramLiftState
	rule: LiftProgressionRule
	sets: LoggedWorkSet[]
	verdict: Extract<SessionVerdict, { kind: 'made' }>
	sessionKg: number
	sessionId: string
	nowISO: string
	outcomes: LiftOutcome[]
	deps: ProgramEngineDeps
}): ProgramLiftState {
	const {
		liftState,
		rule,
		sets,
		verdict,
		sessionKg,
		sessionId,
		nowISO,
		outcomes,
		deps,
	} = args
	const fromKg = successBaseKg(rule, verdict, sessionKg)
	const history = [
		...liftState.weightHistory,
		{ sessionId, weightKg: fromKg, succeeded: true },
	]

	const exactNextKg = triggerFires(liftState, rule, history, fromKg)
		? incrementedWeightKg(liftState.currentIncrement, fromKg, sets)
		: null
	// The arithmetic next weight is kept as the unrounded intent; what goes on the
	// bar is what the rack can make of it.
	const nextKg =
		exactNextKg == null
			? null
			: loadable(liftState, exactNextKg, deps.roundToLoadable)

	if (nextKg == null) {
		// Either the trigger has not come round yet ("add 2.5 kg every three
		// workouts") or the increment's own basis was not in what was logged.
		// Both repeat the weight, and neither is a stall: the Stall Count still
		// resets, because the athlete made the weight.
		outcomes.push({
			exerciseId: liftState.exerciseId,
			equipment: liftState.equipment,
			kind: 'repeated',
			// **Nothing moved**, so the lift stands where it stood. `fromKg` is what
			// this session was run at and stays on `weightKg`; the two differ exactly
			// when the athlete saved a weight by hand after the stamp, and the panel
			// used to print `fromKg` under the words "stays at".
			standsAtKg: liftState.currentWorkingWeightKg,
			weightKg: fromKg,
			stallCount: 0,
			reason:
				repeatOnSuccessReason(liftState, rule, fromKg) +
				unchangedWeightNote(liftState, sessionKg),
			appliedAtISO: nowISO,
		})
		return { ...liftState, stallCount: 0, weightHistory: history }
	}

	outcomes.push({
		exerciseId: liftState.exerciseId,
		equipment: liftState.equipment,
		kind: 'incremented',
		// The lift moves, so where it stands *is* the new weight.
		standsAtKg: nextKg,
		fromKg,
		toKg: nextKg,
		reason:
			incrementReason({
				liftState,
				rule,
				sets,
				verdict,
				sessionKg,
				fromKg,
				toKg: nextKg,
				exactToKg: exactNextKg!,
				deps,
			}) + replacedWeightNote(liftState, sessionKg, nextKg),
		appliedAtISO: nowISO,
	})
	return {
		...liftState,
		currentWorkingWeightKg: nextKg,
		unroundedWorkingWeightKg: exactNextKg,
		stallCount: 0,
		weightHistory: history,
	}
}

function applyFailure(args: {
	liftState: ProgramLiftState
	rule: LiftProgressionRule
	sets: LoggedWorkSet[]
	sessionKg: number
	sessionId: string
	nowISO: string
	outcomes: LiftOutcome[]
	deps: ProgramEngineDeps
}): ProgramLiftState {
	const {
		liftState,
		rule,
		sets,
		sessionKg,
		sessionId,
		nowISO,
		outcomes,
		deps,
	} = args
	// The weight that was **missed** is the one this session was stamped at. A
	// Stall Cut taken off a number the athlete never attempted is the fabrication
	// pointing downwards.
	const fromKg = sessionKg
	const stallCount = liftState.stallCount + 1
	const history = [
		...liftState.weightHistory,
		{ sessionId, weightKg: fromKg, succeeded: false },
	]

	if (stallCount < rule.stallsBeforeResponse) {
		outcomes.push({
			exerciseId: liftState.exerciseId,
			equipment: liftState.equipment,
			kind: 'repeated',
			// The weight this session was run at repeats; where the lift *stands* is
			// still the lift state's own number, which a hand edit may have moved.
			standsAtKg: liftState.currentWorkingWeightKg,
			weightKg: fromKg,
			stallCount,
			reason:
				`Not every rep of every set was completed, so ${trimKg(fromKg)} kg repeats. ${missMoreText(rule.stallsBeforeResponse)}` +
				unchangedWeightNote(liftState, sessionKg),
			appliedAtISO: nowISO,
		})
		return { ...liftState, stallCount, weightHistory: history }
	}

	const response = resolveStallResponse({
		liftState,
		rule,
		sets,
		fromKg,
		weightHistory: liftState.weightHistory,
		deps,
	})

	if (response.kind === 'unavailable') {
		// The response could not be applied and no number is invented in its
		// place. The Stall Count is *kept*, not reset: the condition that fired it
		// is still true.
		outcomes.push({
			exerciseId: liftState.exerciseId,
			equipment: liftState.equipment,
			kind: 'stallResponseUnavailable',
			response: rule.stallResponse.kind,
			// Nothing was changed — that is the whole content of this outcome — so the
			// lift stands where it stood, not at the weight the session was run at.
			standsAtKg: liftState.currentWorkingWeightKg,
			weightKg: fromKg,
			stallCount,
			reason: response.reason + unchangedWeightNote(liftState, sessionKg),
			appliedAtISO: nowISO,
		})
		return { ...liftState, stallCount, weightHistory: history }
	}

	const nextIncrement = adjustedIncrement(
		liftState.currentIncrement,
		rule.incrementAdjustmentOnStall,
	)

	outcomes.push({
		exerciseId: liftState.exerciseId,
		equipment: liftState.equipment,
		kind: 'stalled',
		response: rule.stallResponse.kind,
		moved: response.moved,
		// A response that moved the **training max** left the working weight alone,
		// so where the lift stands is the state's own number. Only a
		// working-weight response makes `toKg` the answer.
		standsAtKg:
			response.moved === 'workingWeight'
				? response.toKg
				: liftState.currentWorkingWeightKg,
		fromKg: response.fromKg,
		toKg: response.toKg,
		reason:
			response.reason +
			(response.moved === 'workingWeight'
				? replacedWeightNote(liftState, sessionKg, response.toKg)
				: unchangedWeightNote(liftState, sessionKg)),
		appliedAtISO: nowISO,
	})

	return {
		...liftState,
		currentWorkingWeightKg:
			response.moved === 'workingWeight'
				? response.toKg
				: // A training-max response does not touch the working weight. Writing
					// `fromKg` here would silently replace the athlete's own saved number
					// with the one this session was stamped at.
					liftState.currentWorkingWeightKg,
		unroundedWorkingWeightKg:
			response.moved === 'workingWeight'
				? response.unroundedToKg
				: liftState.unroundedWorkingWeightKg,
		trainingMaxKg:
			response.moved === 'trainingMax'
				? response.toKg
				: liftState.trainingMaxKg,
		// Reset on the response, not on the success: "three sessions in a row"
		// starts counting again from here.
		stallCount: 0,
		currentIncrement: nextIncrement,
		weightHistory: history,
		stallHistory: [
			...liftState.stallHistory,
			{
				sessionId,
				fromKg: response.fromKg,
				toKg: response.toKg,
				response: rule.stallResponse.kind,
			},
		],
	}
}

type ResolvedStallResponse =
	| {
			kind: 'applied'
			moved: 'workingWeight' | 'trainingMax'
			fromKg: number
			toKg: number
			unroundedToKg: number
			reason: string
	  }
	| { kind: 'unavailable'; reason: string }

/** The three remedies, each reading only what it actually needs. */
function resolveStallResponse(args: {
	liftState: ProgramLiftState
	rule: LiftProgressionRule
	sets: LoggedWorkSet[]
	/** The weight the session was stamped at — the one that was actually missed,
	 * and therefore the one a Stall Cut is a percentage of. */
	fromKg: number
	weightHistory: WeightHistoryEntry[]
	deps: ProgramEngineDeps
}): ResolvedStallResponse {
	const { liftState, rule, sets, fromKg, weightHistory, deps } = args
	const response = rule.stallResponse

	switch (response.kind) {
		case 'stallCut': {
			// The athlete's own override wins, because the reference product exposes
			// this per exercise.
			const pct = liftState.stallCutPctOverride ?? response.pct
			const exact = fromKg * (1 - pct / 100)
			// 10 % off 22.5 kg is 20.25 kg, which no bar makes. The cut lands on a
			// weight the rack can actually load, and where the two differ the
			// athlete is told both — one weight, and the reason it is that one.
			const toKg = loadable(liftState, exact, deps.roundToLoadable)
			// **What can be said about loadability, and no more.** With no gym on
			// file the app does not know what this athlete can load; what it knows is
			// its own stated default step, and that is what the sentence names.
			const rounding = roundingNote(
				liftState,
				exact,
				toKg,
				deps.loadabilityBasis,
			)
			return {
				kind: 'applied',
				moved: 'workingWeight',
				fromKg,
				toKg,
				unroundedToKg: exact,
				reason: `${
					rule.stallsBeforeResponse === 1
						? `Missed the session at ${trimKg(fromKg)} kg`
						: `Missed ${sessionsText(rule.stallsBeforeResponse)} in a row at ${trimKg(fromKg)} kg`
				}, so the weight comes down ${trimKg(pct)} % to ${trimKg(toKg)} kg.${rounding} The ${trimKg(pct)} % is this program's own convention — no trial supports the figure.`,
			}
		}
		case 'weightRollback': {
			// A weight the lift actually used. There is no closed form for this, and
			// with nothing on file the honest answer is to say so.
			if (weightHistory.length === 0) {
				return {
					kind: 'unavailable',
					reason:
						'A Weight Rollback goes back to a weight this lift actually used, and there is no logged history to go back to. Nothing was changed.',
				}
			}
			const index = Math.max(0, weightHistory.length - response.sessionsBack)
			const target = weightHistory[index]!
			return {
				kind: 'applied',
				moved: 'workingWeight',
				fromKg,
				toKg: normaliseKg(target.weightKg),
				unroundedToKg: target.weightKg,
				reason: `Rolled back ${response.sessionsBack} sessions to ${trimKg(target.weightKg)} kg — a weight this lift actually used, not a percentage of anything.`,
			}
		}
		case 'anchorReEstimate': {
			const reEstimate = deps.reEstimateAnchor
			if (!reEstimate) {
				return {
					kind: 'unavailable',
					reason:
						'An Anchor Re-estimate needs a 1RM estimate read off the logged set, and no estimator was available. Nothing was changed.',
				}
			}
			const readFrom = amrapSet(sets) ?? topSet(sets)
			if (readFrom?.weightKg == null || readFrom.reps == null) {
				return {
					kind: 'unavailable',
					reason:
						'An Anchor Re-estimate reads a weight and a rep count off the last logged set, and this session has neither. Nothing was changed.',
				}
			}
			// **A 1RM is a weight on a bar.** A session that reaches a Stall Response
			// has already been graded on comparable loads, so this is a belt: an
			// assisted or per-hand kilo fed to a rep-max formula would set a training
			// max — and every percentage of it — off the wrong quantity.
			const unreadable = unreadableLoad(readFrom)
			if (unreadable != null) {
				return {
					kind: 'unavailable',
					reason: `An Anchor Re-estimate reads a 1RM off the last logged set, and that set was logged as ${loadKindLabel(unreadable.loggedLoadKind) ?? 'a load with no honest kilo'} — not a weight on the bar, so no 1RM can be estimated from it. Nothing was changed.`,
				}
			}
			const estimate = reEstimate({
				exerciseId: liftState.exerciseId,
				equipment: liftState.equipment,
				estimator: response.estimator,
				// The set that was **read**, named. Everything the estimator needs about
				// how that effort went — the load kind, the RIR, whether it was taken to
				// failure, when it happened — is a property of this row and of no other
				// row that shares its numbers.
				setLogId: readFrom.setLogId ?? null,
				weightKg: readFrom.weightKg,
				reps: readFrom.reps,
			})
			if (estimate.kind === 'refusal') {
				return {
					kind: 'unavailable',
					reason: `An Anchor Re-estimate was due, and the 1RM could not be estimated: ${estimate.reason}. Nothing was changed.`,
				}
			}
			const exact = estimate.oneRmKg * (response.trainingMaxPct / 100)
			const previousTm = liftState.trainingMaxKg ?? fromKg
			// A training max is the basis every set of these programs is priced off,
			// so it is rounded to something loadable too — otherwise every
			// percentage of it inherits a weight nobody can make.
			const toKg = loadable(liftState, exact, deps.roundToLoadable)
			return {
				kind: 'applied',
				moved: 'trainingMax',
				fromKg: previousTm,
				toKg,
				unroundedToKg: exact,
				// The estimator's own provenance is appended rather than dropped: a
				// training max reset off a borrowed curve, or off a graded-down reading,
				// must say so where the number is shown.
				reason: `${readFrom.reps} reps at ${trimKg(readFrom.weightKg)} kg re-estimates the 1RM, and the training max resets to ${trimKg(response.trainingMaxPct)} % of it — ${trimKg(toKg)} kg. The training max is a product convention with no evidence base; the working fraction is stored beside it so nothing is hidden.${estimate.basis ? ` ${estimate.basis}` : ''}`,
			}
		}
	}
}

/**
 * Does the increment fire this session?
 *
 * Counted from the log and never from the calendar. *"Add 2.5lb every three
 * workouts instead"* is a published setting, so the successes at the **current
 * weight** are counted — a weight that changed starts the count again, which is
 * what makes the rule survive a stall.
 *
 * The weekly and per-cycle triggers deliberately fire on the **definition's own
 * week boundary** (the last day of the day list was just performed) rather than
 * on a date. It is the only week boundary an outcome-indexed engine can know.
 */
function triggerFires(
	liftState: ProgramLiftState,
	rule: LiftProgressionRule,
	historyIncludingThisSession: WeightHistoryEntry[],
	/** The weight this session established, which is the one the successes are
	 * counted at — a weight that changed starts the count again. */
	atWeightKg: number,
): boolean {
	const trigger = rule.trigger
	if (trigger.kind !== 'perSession') {
		// `perWeek` and `perCycle` are decided by the cursor, which the caller
		// advances; a program whose lifts are all on the week's last day fires
		// there. Until the percentage families ship their day shapes, the honest
		// behaviour is to fire once per completed pass of the day list.
		return true
	}
	const everyN =
		liftState.progressEveryNSessionsOverride ?? trigger.everyNSessions
	if (everyN <= 1) return true
	const successesAtThisWeight = historyIncludingThisSession.filter(
		(entry) => entry.succeeded && entry.weightKg === atWeightKg,
	).length
	return successesAtThisWeight % everyN === 0
}

function repeatOnSuccessReason(
	liftState: ProgramLiftState,
	rule: LiftProgressionRule,
	/** The weight that stays — this session's own, never the live one. */
	staysAtKg: number,
): string {
	const trigger = rule.trigger
	if (trigger.kind === 'perSession') {
		const everyN =
			liftState.progressEveryNSessionsOverride ?? trigger.everyNSessions
		if (everyN > 1) {
			return `Every rep was completed. This lift adds weight every ${everyN} workouts, so ${trimKg(staysAtKg)} kg stays for now.`
		}
	}
	return `Every rep was completed, but this lift's increment needs a number this session did not record, so ${trimKg(staysAtKg)} kg stays rather than a guess going on the bar.`
}

/**
 * **The sentence may only name a weight the athlete actually lifted.**
 *
 * This is where the cardinal sin was committed: the reason quoted `fromKg` —
 * the *prescription*, straight off stored state — and so announced *"every rep
 * of every set at 62.5 kg"* about a session logged entirely at 20 kg. The
 * quoted number is now `verdict.atKg`, which comes from the set rows, and where
 * there is no honest kilo to quote the sentence says the reps were the whole of
 * what could be read rather than inventing one.
 */
function incrementReason(args: {
	liftState: ProgramLiftState
	rule: LiftProgressionRule
	sets: LoggedWorkSet[]
	verdict: Extract<SessionVerdict, { kind: 'made' }>
	/** What this session was stamped at — the prescription the athlete ran, which
	 * is the only one they can be told they beat. */
	sessionKg: number
	fromKg: number
	toKg: number
	exactToKg: number
	deps: ProgramEngineDeps
}): string {
	const { liftState, rule, sets, verdict, sessionKg, fromKg, toKg, exactToKg } =
		args
	const increment = liftState.currentIncrement
	// Said whenever the arithmetic answer and the loadable one differ, so the
	// number on the screen is never one the gym cannot make and never unexplained
	// — and never as a claim about a rack the app has not been told about.
	const rounding = roundingNote(
		liftState,
		exactToKg,
		toKg,
		args.deps.loadabilityBasis,
	)
	// Where the quoted kilo is the athlete rather than the implement, the sentence
	// says so — a barbell lift logged as a bodyweight set is still quoting a real
	// number out of the log, and still not a number that was on the bar.
	const kiloIs = bodyweightKiloNote(verdict.loggedLoadKind, verdict.atKg)
	// The prescription is named alongside only when the athlete beat it — nobody
	// needs telling they lifted the weight they were asked for.
	const overPrescription =
		verdict.atKg != null && verdict.atKg > sessionKg && fromKg === verdict.atKg
			? ` That is ${trimKg(normaliseKg(verdict.atKg - sessionKg))} kg over the ${trimKg(sessionKg)} kg prescribed, and the jump is taken from what was lifted.`
			: ''

	if (increment.kind === 'multipliedOnAmrap') {
		const reps = amrapSet(sets)?.reps ?? 0
		if (reps >= increment.atOrAboveReps) {
			return `${reps} reps on the last set is ${increment.atOrAboveReps} or more, so this lift adds ${trimKg(increment.factor)}× its usual jump — ${trimKg(fromKg)} kg to ${trimKg(toKg)} kg. The rep threshold is reverse-engineered from secondary sources.${rounding}${kiloIs}`
		}
	}
	if (rule.successPredicate.kind === 'minRepsOnAmrapSet') {
		const reps = amrapSet(sets)?.reps ?? 0
		const at = verdict.atKg == null ? '' : ` at ${trimKg(verdict.atKg)} kg`
		return `${reps} reps on the last set${at} met this lift's target, so the weight goes from ${trimKg(fromKg)} kg to ${trimKg(toKg)} kg.${rounding}${kiloIs}`
	}
	if (rule.successPredicate.kind === 'allRepsOnTopSet') {
		const at = verdict.atKg == null ? '' : ` at ${trimKg(verdict.atKg)} kg`
		return `The top set was completed in full${at}, so the weight goes from ${trimKg(fromKg)} kg to ${trimKg(toKg)} kg.${rounding}${kiloIs}`
	}
	// The `allRepsAllSets` families, where the whole session is one weight — and
	// the one place the fabricated sentence used to be written.
	const at = verdict.loadStated
		? `Every rep of every set at ${trimKg(verdict.atKg!)} kg`
		: 'Every rep of every set — this lift logs no kilos, so the reps are the whole of what can be read'
	return `${at}, so the weight goes to ${trimKg(toKg)} kg (${rule.setCount}×${rule.repsPerSet} completed).${overPrescription}${rounding}${kiloIs}`
}

/**
 * **What a lighter-than-prescribed session is told** — in both numbers, with the
 * consequence stated, and **describing what actually happened**.
 *
 * The verdict was right and the sentence was not. One set at 40 kg followed by
 * four at 82.5 kg produced *"This session was logged at 40 kg"*, which reads as
 * if the whole of it was light. So the count is said: *one of five*, and the
 * other four are credited with having been where they should be, because they
 * were.
 */
function liftedLighterReason(
	verdict: Extract<SessionVerdict, { kind: 'liftedLighter' }>,
	rule: LiftProgressionRule,
): string {
	const prescribed = trimKg(verdict.prescribedKg)
	const shape = `${rule.setCount}×${rule.repsPerSet}`
	const whichSets =
		verdict.gradedSetCount <= 1
			? `The set this lift is graded on was logged at ${trimKg(verdict.loggedKg)} kg`
			: verdict.lighterSetCount === verdict.gradedSetCount
				? `All ${verdict.gradedSetCount} sets were logged under the weight they were prescribed at, the lightest at ${trimKg(verdict.loggedKg)} kg`
				: `${verdict.lighterSetCount} of the ${verdict.gradedSetCount} sets logged came in under the weight they were prescribed at — the lightest at ${trimKg(verdict.loggedKg)} kg. The other ${verdict.gradedSetCount - verdict.lighterSetCount} were at or above it`
	// A **belt**, and deliberately kept as one: a `liftedLighter` verdict now
	// implies a comparable load kind, because an incomparable one is `unverifiable`
	// before the lighter check runs. If that order ever changes, the sentence still
	// says what the quoted kilo is a kilo of rather than silently claiming a bar.
	return `${whichSets}, so this is not the ${prescribed} kg ${shape} the session prescribed and it does not count as making ${prescribed} kg. The weight stays where it is, and nothing is counted against you: backing off is not the same as missing.${bodyweightKiloNote(verdict.loggedLoadKind, verdict.loggedKg)}`
}

/**
 * **What that kilo is a kilo of**, said only where it is not what it looks like.
 *
 * A barbell squat logged with load kind **Bodyweight** bakes the athlete's own
 * 74 kg into `effectiveKg`, and the app then said *"logged at 74 kg"* about a bar
 * with nothing on it. The number is in the log, so this is not the fabrication
 * class — but the sentence read as a claim about the bar, and it is not one. So
 * it says whose 74 kg it is, and that the bar is not what was measured.
 */
function bodyweightKiloNote(
	loadKind: string | null,
	kg: number | null,
): string {
	if (!loadKindIsBodyweightDerived(loadKind) || kg == null) return ''
	return ` That ${trimKg(kg)} kg is a bodyweight load — your own bodyweight, plus anything added, baked in when the set was logged, and not a weight on the bar.`
}

/**
 * **What an unverifiable session is told** — that it could not be read, **which
 * kind of number was logged instead**, which kilo could not be checked, and what
 * would make the next one readable.
 *
 * The app used to answer this session with *"Back Squat 90 kg → 92.5 kg"* off
 * five sets logged at machine stack level 3; then with *"Back Squat 74 kg →
 * 77.5 kg"* off five bodyweight sets against a 25 kg prescription, while the very
 * same paragraph said the 74 kg was *"not a weight on the bar"*. The caveat was
 * prose and the fold went ahead. Now both come off `verdict.reason`, so the
 * sentence cannot disagree with the state it describes.
 */
function unverifiableReason(
	verdict: Extract<SessionVerdict, { kind: 'unverifiable' }>,
	rule: LiftProgressionRule,
): string {
	const prescribed = trimKg(verdict.prescribedKg)
	const label = loadKindLabel(verdict.loggedLoadKind)
	const sets =
		verdict.unreadableSetCount === verdict.gradedSetCount
			? verdict.gradedSetCount === 1
				? 'The set this lift is graded on'
				: `All ${verdict.gradedSetCount} sets`
			: `${verdict.unreadableSetCount} of the ${verdict.gradedSetCount} sets logged`
	// One clause per reason, and the reason is the verdict's — the same value that
	// decided nothing would move.
	const what =
		verdict.reason === 'kiloContradictsLoad'
			? `${sets} record a kilo that does not follow from the load recorded beside it — the two disagree, so the number cannot be believed`
			: verdict.reason === 'noKiloLogged'
				? `${sets} record no kilos at all`
				: verdict.reason === 'bodyweightDerived'
					? `${sets} were logged as ${label ?? 'a bodyweight load'} — that kilo is your own bodyweight, plus anything added, baked in when the set was logged, and not a weight on the bar`
					: verdict.reason === 'assistInverted'
						? `${sets} were logged as ${label ?? 'an assisted load'} — the number there is how much the machine took **off**, so more of it is less work, not more, and it cannot be read as a weight on the bar`
						: verdict.reason === 'perHand'
							? `${sets} were logged as ${label ?? 'a per-hand load'} — 32 kg in each hand is 64 kg of work, so that number is not the same number as a weight on a bar`
							: `${sets} were logged as ${label ?? 'a stack level, a band or an unloaded hold'} — an ordinal or a force curve, not a weight`
	// What would fix it. Where a real kilo exists but of the wrong thing, logging
	// the bar is the whole answer; where there is no kilo at all, the app's own gap
	// has to be named rather than asked of the athlete.
	const next =
		verdict.reason === 'kiloContradictsLoad'
			? 'Re-log the set with the weight that was actually on the bar and the next session can be graded. Nothing was derived from the number that disagreed — not a record, not a 1RM estimate and not this lift’s weight.'
			: verdict.reason === 'noKiloLogged' || verdict.reason === 'notAWeight'
				? "Log this lift in kilos and the next session can be graded. If it genuinely has no kilos — a machine stack or a band — then it cannot progress inside a program yet: a program lift's weight is stored as kilos and there is nowhere to keep a level. That is a gap in the app, not a judgement about your training."
				: `Log this lift with the weight that was on the bar — *How this is loaded* set to a plain weight — and the next session can be graded against its ${prescribed} kg. If this lift is not a barbell lift for you, change what the program prescribes rather than logging it as something else: the two numbers are not comparable.`
	return `${what}, and this lift was prescribed ${prescribed} kg for ${rule.setCount}×${rule.repsPerSet}. So there is no way to read whether ${prescribed} kg was lifted: this session is neither a success nor a miss, and nothing moved. The weight stays where it is, the Stall Count is untouched, and nothing was written to this lift's history. ${next}`
}

// ——— nextSession ——————————————————————————————————————————————————————————

/** One prescribed set of the next session. The weight is resolved *now*, from
 * the state as it stands — never stamped weeks ago. */
export type ResolvedSet = {
	setIndex: number
	reps: number
	weight:
		| { kind: 'resolved'; kg: number; unroundedKg: number; basis: string }
		| {
				kind: 'unavailable'
				reason: 'no-training-max' | 'needs-anchor' | 'needs-another-day'
				basis: string
		  }
}

export type NextSession = {
	dayId: string | null
	lifts: Array<{
		exerciseId: string
		equipment: string | null
		sets: ResolvedSet[]
	}>
}

/**
 * What to do next, resolved at the moment it is asked for.
 *
 * The *shape* may be stamped ahead; the **load resolves when the session is
 * opened**, because week 6's weight is a function of week 5's log. Sources this
 * engine cannot resolve alone — a rep-max percentage (an anchor lives in another
 * module) and a cross-day percentage — return a stated absence rather than a
 * fabricated kilo.
 */
export function nextSession(
	state: ProgramInstanceState,
	definition: ProgramDefinition,
	_nowISO: string,
	options: { roundToLoadable?: LoadableRounder } = {},
): NextSession {
	const dayId = cursorDayId(state.cursor)
	const lifts = definition.liftRules
		.filter((rule) => liftIsOnDay(rule, dayId))
		.map((rule) => {
			const liftState = state.lifts.find(
				(candidate) =>
					candidate.exerciseId === rule.exerciseId &&
					candidate.equipment === rule.equipment,
			)
			return {
				exerciseId: rule.exerciseId,
				equipment: rule.equipment,
				sets: resolveLiftSets(rule, liftState, options.roundToLoadable),
			}
		})
	return { dayId, lifts }
}

/**
 * One lift's prescribed sets, resolved from the state as it stands.
 *
 * Shared by {@link nextSession} — which is what the grid is stamped from — and
 * by {@link applySession}, which grades the log against it. **One resolution,
 * read twice**: two would be two prescriptions, and the athlete would be graded
 * against a weight they were never shown.
 */
function resolveLiftSets(
	rule: LiftProgressionRule,
	liftState: ProgramLiftState | undefined,
	round: LoadableRounder | undefined,
): ResolvedSet[] {
	const sources =
		rule.setWeightSources.length > 0
			? rule.setWeightSources
			: Array.from({ length: rule.setCount }, () => ({
					kind: 'workingWeight' as const,
				}))
	const resolved: ResolvedSet[] = []
	for (let index = 0; index < rule.setCount; index++) {
		const source = sources[Math.min(index, sources.length - 1)]!
		resolved.push({
			setIndex: index,
			reps: rule.repsPerSet,
			weight: resolveSetWeight(source, rule, liftState, resolved, round),
		})
	}
	return resolved
}

/**
 * **The prescription this session is graded against, indexed by set.**
 *
 * The stamp wins, always, because the stamp is what the grid rendered. Only
 * where there is no stamp for this lift — a session opened before loads were
 * materialised — is the prescription resolved from state, which is the same
 * answer the grid would have shown.
 *
 * An **empty** stamped array is treated as no stamp: zero rows is the absence of
 * a prescription, not a prescription of nothing. An array of `null`s is a real
 * answer — a lift the engine could not price — and it is what keeps a stack-level
 * lift progressing against its own reps.
 */
function sessionPrescribedKgs(
	rule: LiftProgressionRule,
	liftState: ProgramLiftState,
	stamped: StampedPrescriptionReader | undefined,
	round: LoadableRounder | undefined,
): Array<number | null> {
	const fromStamp = stamped?.({
		exerciseId: liftState.exerciseId,
		equipment: liftState.equipment,
	})
	if (fromStamp && fromStamp.length > 0) return [...fromStamp]
	return prescribedSetKgs(rule, liftState, round).map((set) =>
		set.kind === 'resolved' ? set.kg : null,
	)
}

/** The prescribed weights of one lift, indexed by set — the fallback
 * {@link sessionPrescribedKgs} uses where a session carries no stamp. */
function prescribedSetKgs(
	rule: LiftProgressionRule,
	liftState: ProgramLiftState,
	round: LoadableRounder | undefined,
): ResolvedSet['weight'][] {
	// **The same rounder the grid was stamped with**, and that is the whole point:
	// grade the athlete against the number that was on their screen. Resolving
	// unrounded here would fail a session logged at exactly the weight the app
	// prescribed, whenever the rounding moved it down.
	return resolveLiftSets(rule, liftState, round).map((set) => set.weight)
}

function resolveSetWeight(
	source: LiftProgressionRule['setWeightSources'][number],
	rule: { exerciseId: string; equipment: string | null },
	liftState: ProgramLiftState | undefined,
	resolvedSoFar: ResolvedSet[],
	round: LoadableRounder | undefined,
): ResolvedSet['weight'] {
	const workingKg = liftState?.currentWorkingWeightKg
	/** A percentage of anything lands on a weight the rack can make, with the
	 * exact figure kept beside it so the next percentage does not compound the
	 * rounding. `unroundedKg` is that field's whole reason for existing. */
	const priced = (exactKg: number, basis: string): ResolvedSet['weight'] => ({
		kind: 'resolved',
		kg: loadable(rule, exactKg, round),
		unroundedKg: exactKg,
		basis,
	})

	switch (source.kind) {
		case 'workingWeight':
			if (workingKg == null) {
				return {
					kind: 'unavailable',
					reason: 'needs-anchor',
					basis: 'no working weight on file for this lift yet',
				}
			}
			// Not re-rounded: the working weight *is* the stored prescription, and
			// rounding it again on every read would move a number the athlete may
			// have set by hand.
			return {
				kind: 'resolved',
				kg: workingKg,
				unroundedKg: liftState?.unroundedWorkingWeightKg ?? workingKg,
				basis: 'working weight',
			}
		case 'pctOfTopSet': {
			if (workingKg == null) {
				return {
					kind: 'unavailable',
					reason: 'needs-anchor',
					basis: 'no working weight on file for this lift yet',
				}
			}
			return priced(
				workingKg * (source.pct / 100),
				`${trimKg(source.pct)} % of the ${trimKg(workingKg)} kg top set`,
			)
		}
		case 'pctOfTrainingMax': {
			const tm = liftState?.trainingMaxKg
			if (tm == null) {
				return {
					kind: 'unavailable',
					reason: 'no-training-max',
					basis: 'this lift has no training max on file',
				}
			}
			return priced(
				tm * (source.pct / 100),
				`${trimKg(source.pct)} % of a ${trimKg(tm)} kg training max`,
			)
		}
		case 'sameAsSet': {
			const other = resolvedSoFar[source.setIndex]
			if (!other || other.weight.kind !== 'resolved') {
				return {
					kind: 'unavailable',
					reason: 'needs-another-day',
					basis: `set ${source.setIndex + 1} of this session is not resolved`,
				}
			}
			return {
				kind: 'resolved',
				kg: other.weight.kg,
				unroundedKg: other.weight.unroundedKg,
				basis: `the weight from set ${source.setIndex + 1}`,
			}
		}
		case 'pctOfRepMax':
			// An anchor is another module's business, and converting one rep max to
			// another is exactly the fabrication that module refuses.
			return {
				kind: 'unavailable',
				reason: 'needs-anchor',
				basis: `${trimKg(source.pct)} % of a ${source.reps}RM, which resolves against the athlete's anchors`,
			}
		case 'pctOfAnotherDay':
			return {
				kind: 'unavailable',
				reason: 'needs-another-day',
				basis: `${trimKg(source.pct)} % of day ${source.dayId}`,
			}
	}
}

/** One weight, rendered the same way everywhere — the house rule lives in
 * `program.constants.ts` and is imported rather than restated, because three
 * files each rounding a kilo their own way is how one prescription came to read
 * `20.3`, `20.25` and `20` on a single screen. */
function trimKg(value: number): string {
	return formatKg(value)
}
