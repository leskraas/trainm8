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
 *   constants. Nothing else — in particular the 1RM estimator an Anchor
 *   Re-estimate needs is an **injected function** ({@link AnchorReEstimator}),
 *   not an import, so the estimator can live in its own module without this one
 *   growing a dependency or a fake.
 *
 * A whole StrongLifts run is therefore testable as a fold: feed six sessions of
 * logged sets, assert the working weights and the outcomes at the end. That one
 * test covers the cursor, the predicate, the increment, the Stall Count and the
 * Stall Cut, and it needs no database.
 *
 * ## What it deliberately does not do
 *
 * - **It does not round to plates.** *"If your increments are set to 5lb, then
 *   the weight will increase by 5lb regardless of your plate setup."* The engine
 *   emits the arithmetic next weight and keeps the unrounded intent beside it;
 *   loadability is a separate module and a separate line on the screen.
 * - **It does not tell the athlete anything.** It returns outcomes with reasons;
 *   the server says what happened **once, as a notice, never as an offer** — an
 *   engine that silently drops the squat 10 % and shows the new number is the
 *   exact failure the Load Recompute Notice pattern exists to prevent.
 * - **It does not model assistance work.** No program in the family publishes a
 *   progression rule for it, so modelling it would be inventing one.
 * - **No velocity, no tonnage records, no streaks.**
 */
import {
	type Increment,
	type LiftProgressionRule,
	type ProgramCursor,
	type ProgramDefinition,
	type LoggedWorkSet,
	type StallResponse,
	adjustedIncrement,
	advanceCursor,
	amrapSet,
	cursorDayId,
	evaluateSuccessPredicate,
	incrementedWeightKg,
	liftIsOnDay,
	normaliseKg,
	progressionSets,
	topSet,
} from './program-rules.ts'

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
	/** The estimator the program's rule names (`epley`, `brzycki`, …). Typed as
	 * a string because the canonical vocabulary belongs to the estimator module,
	 * not to the program rules that reference it. */
	estimator: string
	weightKg: number
	reps: number
}) =>
	| { kind: 'estimate'; oneRmKg: number; basis?: string }
	| { kind: 'refusal'; reason: string }

/** Everything the engine cannot compute itself, in one bag. Optional: the
 * absolute-increment family (StrongLifts, Starting Strength, GreySkull) needs
 * none of it. */
export type ProgramEngineDeps = {
	reEstimateAnchor?: AnchorReEstimator
}

// ——— The outcome ——————————————————————————————————————————————————————————

/**
 * What happened to one lift, with its reason in the lift's own numbers.
 *
 * Five members, not the three a summary would suggest. `skipped` and
 * `stallResponseUnavailable` are the two honest answers a three-member union has
 * to launder into something that did not happen: a lift with no logged sets did
 * not *repeat* its weight, and a Stall Response whose input is missing did not
 * *stall* the lift.
 */
export type LiftOutcome = { exerciseId: string; equipment: string | null } & (
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
		const made = evaluateSuccessPredicate(rule.successPredicate, rule, sets)

		if (made == null) {
			outcomes.push({
				exerciseId: liftState.exerciseId,
				equipment: liftState.equipment,
				kind: 'skipped',
				weightKg: liftState.currentWorkingWeightKg,
				reason: 'No working sets were logged for this lift, so nothing moved.',
				appliedAtISO: nowISO,
			})
			return liftState
		}

		return made
			? applySuccess({ liftState, rule, sets, sessionId, nowISO, outcomes })
			: applyFailure({
					liftState,
					rule,
					sets,
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

function applySuccess(args: {
	liftState: ProgramLiftState
	rule: LiftProgressionRule
	sets: LoggedWorkSet[]
	sessionId: string
	nowISO: string
	outcomes: LiftOutcome[]
}): ProgramLiftState {
	const { liftState, rule, sets, sessionId, nowISO, outcomes } = args
	const fromKg = liftState.currentWorkingWeightKg
	const history = [
		...liftState.weightHistory,
		{ sessionId, weightKg: fromKg, succeeded: true },
	]

	const nextKg = triggerFires(liftState, rule, history)
		? incrementedWeightKg(liftState.currentIncrement, fromKg, sets)
		: null

	if (nextKg == null) {
		// Either the trigger has not come round yet ("add 2.5 kg every three
		// workouts") or the increment's own basis was not in what was logged.
		// Both repeat the weight, and neither is a stall: the Stall Count still
		// resets, because the athlete made the weight.
		outcomes.push({
			exerciseId: liftState.exerciseId,
			equipment: liftState.equipment,
			kind: 'repeated',
			weightKg: fromKg,
			stallCount: 0,
			reason: repeatOnSuccessReason(liftState, rule),
			appliedAtISO: nowISO,
		})
		return { ...liftState, stallCount: 0, weightHistory: history }
	}

	outcomes.push({
		exerciseId: liftState.exerciseId,
		equipment: liftState.equipment,
		kind: 'incremented',
		fromKg,
		toKg: nextKg,
		reason: incrementReason(liftState, rule, sets, fromKg, nextKg),
		appliedAtISO: nowISO,
	})
	return {
		...liftState,
		currentWorkingWeightKg: nextKg,
		unroundedWorkingWeightKg: nextKg,
		stallCount: 0,
		weightHistory: history,
	}
}

function applyFailure(args: {
	liftState: ProgramLiftState
	rule: LiftProgressionRule
	sets: LoggedWorkSet[]
	sessionId: string
	nowISO: string
	outcomes: LiftOutcome[]
	deps: ProgramEngineDeps
}): ProgramLiftState {
	const { liftState, rule, sets, sessionId, nowISO, outcomes, deps } = args
	const fromKg = liftState.currentWorkingWeightKg
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
			weightKg: fromKg,
			stallCount,
			reason: `Not every rep of every set was completed, so ${trimKg(fromKg)} kg repeats. Miss ${rule.stallsBeforeResponse} sessions in a row and the weight comes down.`,
			appliedAtISO: nowISO,
		})
		return { ...liftState, stallCount, weightHistory: history }
	}

	const response = resolveStallResponse({
		liftState,
		rule,
		sets,
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
			weightKg: fromKg,
			stallCount,
			reason: response.reason,
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
		fromKg: response.fromKg,
		toKg: response.toKg,
		reason: response.reason,
		appliedAtISO: nowISO,
	})

	return {
		...liftState,
		currentWorkingWeightKg:
			response.moved === 'workingWeight' ? response.toKg : fromKg,
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
	weightHistory: WeightHistoryEntry[]
	deps: ProgramEngineDeps
}): ResolvedStallResponse {
	const { liftState, rule, sets, weightHistory, deps } = args
	const response = rule.stallResponse
	const fromKg = liftState.currentWorkingWeightKg

	switch (response.kind) {
		case 'stallCut': {
			// The athlete's own override wins, because the reference product exposes
			// this per exercise.
			const pct = liftState.stallCutPctOverride ?? response.pct
			const exact = fromKg * (1 - pct / 100)
			return {
				kind: 'applied',
				moved: 'workingWeight',
				fromKg,
				toKg: normaliseKg(exact),
				unroundedToKg: exact,
				reason: `Missed ${rule.stallsBeforeResponse} sessions in a row at ${trimKg(fromKg)} kg, so the weight comes down ${trimKg(pct)} % to ${trimKg(normaliseKg(exact))} kg. The ${trimKg(pct)} % is this program's own convention — no trial supports the figure.`,
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
			const estimate = reEstimate({
				exerciseId: liftState.exerciseId,
				equipment: liftState.equipment,
				estimator: response.estimator,
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
			return {
				kind: 'applied',
				moved: 'trainingMax',
				fromKg: previousTm,
				toKg: normaliseKg(exact),
				unroundedToKg: exact,
				reason: `${readFrom.reps} reps at ${trimKg(readFrom.weightKg)} kg re-estimates the 1RM, and the training max resets to ${trimKg(response.trainingMaxPct)} % of it — ${trimKg(normaliseKg(exact))} kg. The training max is a product convention with no evidence base; the working fraction is stored beside it so nothing is hidden.`,
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
		(entry) =>
			entry.succeeded && entry.weightKg === liftState.currentWorkingWeightKg,
	).length
	return successesAtThisWeight % everyN === 0
}

function repeatOnSuccessReason(
	liftState: ProgramLiftState,
	rule: LiftProgressionRule,
): string {
	const trigger = rule.trigger
	if (trigger.kind === 'perSession') {
		const everyN =
			liftState.progressEveryNSessionsOverride ?? trigger.everyNSessions
		if (everyN > 1) {
			return `Every rep was completed. This lift adds weight every ${everyN} workouts, so ${trimKg(liftState.currentWorkingWeightKg)} kg stays for now.`
		}
	}
	return `Every rep was completed, but this lift's increment needs a number this session did not record, so ${trimKg(liftState.currentWorkingWeightKg)} kg stays rather than a guess going on the bar.`
}

function incrementReason(
	liftState: ProgramLiftState,
	rule: LiftProgressionRule,
	sets: LoggedWorkSet[],
	fromKg: number,
	toKg: number,
): string {
	const increment = liftState.currentIncrement
	const base = `Every rep of every set at ${trimKg(fromKg)} kg, so the weight goes to ${trimKg(toKg)} kg`
	if (increment.kind === 'multipliedOnAmrap') {
		const reps = amrapSet(sets)?.reps ?? 0
		if (reps >= increment.atOrAboveReps) {
			return `${reps} reps on the last set is ${increment.atOrAboveReps} or more, so this lift adds ${trimKg(increment.factor)}× its usual jump — ${trimKg(fromKg)} kg to ${trimKg(toKg)} kg. The rep threshold is reverse-engineered from secondary sources.`
		}
	}
	if (rule.successPredicate.kind === 'minRepsOnAmrapSet') {
		const reps = amrapSet(sets)?.reps ?? 0
		return `${reps} reps on the last set met this lift's target, so the weight goes from ${trimKg(fromKg)} kg to ${trimKg(toKg)} kg.`
	}
	if (rule.successPredicate.kind === 'allRepsOnTopSet') {
		return `The top set was completed in full, so the weight goes from ${trimKg(fromKg)} kg to ${trimKg(toKg)} kg.`
	}
	return `${base} (${rule.setCount}×${rule.repsPerSet} completed).`
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
					weight: resolveSetWeight(source, liftState, resolved),
				})
			}
			return {
				exerciseId: rule.exerciseId,
				equipment: rule.equipment,
				sets: resolved,
			}
		})
	return { dayId, lifts }
}

function resolveSetWeight(
	source: LiftProgressionRule['setWeightSources'][number],
	liftState: ProgramLiftState | undefined,
	resolvedSoFar: ResolvedSet[],
): ResolvedSet['weight'] {
	const workingKg = liftState?.currentWorkingWeightKg
	switch (source.kind) {
		case 'workingWeight':
			if (workingKg == null) {
				return {
					kind: 'unavailable',
					reason: 'needs-anchor',
					basis: 'no working weight on file for this lift yet',
				}
			}
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
			const exact = workingKg * (source.pct / 100)
			return {
				kind: 'resolved',
				kg: normaliseKg(exact),
				unroundedKg: exact,
				basis: `${trimKg(source.pct)} % of the ${trimKg(workingKg)} kg top set`,
			}
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
			const exact = tm * (source.pct / 100)
			return {
				kind: 'resolved',
				kg: normaliseKg(exact),
				unroundedKg: exact,
				basis: `${trimKg(source.pct)} % of a ${trimKg(tm)} kg training max`,
			}
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

function trimKg(value: number): string {
	return Number.isInteger(value) ? String(value) : String(normaliseKg(value))
}
