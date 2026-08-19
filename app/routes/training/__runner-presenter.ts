/**
 * **The session runner's presenter** — the mapping between the runner's loader
 * data and what the grid draws, as pure functions.
 *
 * The repo's presenter seam (`app/routes/_home/cockpit/presenter.ts`): components
 * stay dumb, every non-trivial mapping is a `build*` function tested at the pure
 * seam rather than through a rendered surface. That matters more here than
 * anywhere, because the rules this file holds are the ones that regressed in
 * #434 — an unresolved anchor showing a number, and a Stall Cut reading as an
 * offer.
 *
 * Pure: no clock, no random source, no `prisma`.
 */
import {
	type LoadResolution,
	loadResolutionText,
} from '#app/utils/strength/anchors.ts'
import {
	type PlateInventory,
	type PlateOptions,
	calculatePlates,
	hasPlateSolve,
	plateLineText,
	plateOptionsForKind,
} from '#app/utils/strength/plates.ts'
import { type LiftOutcome } from '#app/utils/strength/program-engine.ts'
import { loadKindLabel } from '#app/utils/strength/program-rules.ts'
import { formatKg } from '#app/utils/strength/program.constants.ts'
import {
	type StrengthRecord,
	strengthRecordLabel,
} from '#app/utils/strength/records.ts'
import {
	type RestPrescription,
	type RestReason,
	restAfterSet,
	restReasonText,
} from '#app/utils/strength/rest.ts'
import {
	type LogExercise,
	type LogRow,
} from '#app/utils/strength-log.server.ts'
import {
	type SetRole,
	isMissedSet,
	loadValueText,
} from '#app/utils/strength-log.ts'
import { loadTargetText } from '#app/utils/workout-notation.ts'

// ——— The row's target ————————————————————————————————————————————————————

/**
 * What the row is asking for, as one phrase — never a sentence, and never a
 * kilo the athlete does not have.
 *
 * The rule that regressed in #434 and is the reason this is a tested function:
 * an **unresolved** `85 % 1RM` renders **the authored form plus its stated
 * absence**. Not a zero, not a guess from a neighbouring lift, and not silence —
 * silence reads as *"no load prescribed"*, which is a different prescription.
 */
export function buildTargetText(row: LogRow): string | null {
	const parts: string[] = []
	if (row.prescribedReps != null) parts.push(`${row.prescribedReps} reps`)
	if (row.prescribedDurationSec != null)
		parts.push(`${row.prescribedDurationSec} s`)
	// **A rung of a bodyweight-derived ramp names its base.** `effectiveKg` above
	// `targetKg` is what says this ramp resolves against the athlete, and the rung is
	// then described the way every other bodyweight-plus load on this surface is:
	// `bodyweight + 15 kg`, or `bodyweight` alone on the base rungs.
	//
	// That base rung is why this branch exists. `LoadTarget.absolute` is `positive()`
	// in the schema, so the only source of a zero kg is a base rung — the athlete
	// alone, with nothing on the belt. `0 kg` beside `Bodyweight + kg` reads as a
	// prescription to load nothing, so it used to be **suppressed**, which left the
	// two empty-bar rungs of a dip ramp saying only `5 reps`. The other alternative —
	// printing the bodyweight-inclusive total — is the defect this column had: a ramp
	// of `84 / 84 / 99` above a work set of `30`. Naming the base says the true thing
	// without quoting a kilo the athlete puts anywhere.
	const rung = row.warmupRung
	const zeroAbsolute =
		row.prescribedLoad?.kind === 'absolute' && row.prescribedLoad.kg <= 0
	if (rung && rung.effectiveKg > rung.targetKg) {
		parts.push(
			rung.targetKg > 0
				? `bodyweight + ${formatKg(rung.targetKg)} kg`
				: 'bodyweight',
		)
	} else if (row.prescribedLoad && !zeroAbsolute) {
		// The guard stays for the zero no rung explains: a `0 kg` target is never a
		// prescription to load nothing, whoever wrote it.
		parts.push(loadTargetText(row.prescribedLoad, row.resolvedLoad))
	}
	return parts.length ? parts.join(' · ') : null
}

/**
 * The provenance of a resolved load — *"85 % of your tested 140 kg 1RM"* — or the
 * fix where nothing resolved.
 *
 * One tap behind the exercise name, never beside the control: #434 shipped 24
 * explanatory prose spans on the logging surface and the verdict was *"too much
 * text"*.
 */
export function buildResolutionDetail(
	resolution: LoadResolution | null,
): { text: string; fix: string | null } | null {
	if (!resolution) return null
	return resolution.kind === 'resolved'
		? { text: loadResolutionText(resolution), fix: null }
		: { text: resolution.text, fix: resolution.fix }
}

// ——— The plate line ——————————————————————————————————————————————————————

/**
 * The passive annotation under the weight input — `20 · 20 · 10 · 2.5` per side,
 * muted, updating as the athlete types.
 *
 * Three answers, and the two that are not a plate line matter most:
 *
 * - a **rack that cannot make the number says so**, with the weight it can make;
 * - a stack level, a band and an unloaded hold have **no plates and no honest
 *   kilo**, so they get neither — the solver's own refusal is quoted rather than
 *   a line of dots being drawn under an ordinal.
 */
export type PlateLine =
	| { kind: 'plates'; text: string; perSideKg: number }
	| { kind: 'nearest'; text: string; note: string }
	| { kind: 'unavailable'; note: string }
	| null

export function buildPlateLine(input: {
	/** What the athlete has typed, in the load's own semantics. Empty or unparsable
	 * is not a zero — it is a row with nothing to solve yet. */
	loadNumber: string
	inventory: PlateInventory | null
	options: PlateOptions
}): PlateLine {
	if (!input.inventory) return null
	const kg = Number(input.loadNumber)
	if (input.loadNumber.trim() === '' || !Number.isFinite(kg) || kg <= 0) {
		return null
	}

	const solution = calculatePlates(kg, input.inventory, input.options)
	if (solution.outcome === 'unavailable') {
		return { kind: 'unavailable', note: solution.explanation }
	}
	const text = plateLineText(solution)
	// **The gap sentence quotes the quantity the athlete typed.** `achievedKg` is
	// `requestedKg`'s own unit — the belt's kilos for a weighted dip, the kilos of
	// help on an assist stack, the bell per hand — and it is the number `gapKg` is
	// measured in. This read `totalWeight`, which is bodyweight-inclusive for three
	// of the eight kinds: a dip belt typed as `+31` on a 74 kg athlete printed
	// *"Your gym makes 105.25 kg, not 31 kg"* when the gym had in fact made 31.25 of
	// belt, and `11 kg` of assist printed *"62.75 kg, not 11 kg"*.
	//
	// A `null` `achievedKg` means the kind carries no number at all (`bodyweight`),
	// which is never `nearest` — so the plate line is drawn with no gap sentence
	// rather than a sentence about some other quantity.
	if (solution.outcome === 'nearest' && solution.achievedKg != null) {
		return {
			kind: 'nearest',
			text,
			note: `Your gym makes ${trimKg(solution.achievedKg)} kg, not ${trimKg(kg)} kg.`,
		}
	}
	return { kind: 'plates', text, perSideKg: solution.perSideKg }
}

// ——— The record you just set —————————————————————————————————————————————

/**
 * The PR banner as the row draws it: one line per reading, already phrased.
 *
 * `debut` is the whole reason this is a type and not an array. On a variant the
 * athlete has barely touched, every reading is a best by default — a first-ever
 * dumbbell bench would fire four records on day one, which is not a celebration
 * but noise that teaches the athlete to ignore the banner (ADR 0058 §6). A debut
 * therefore says **one** thing, and says "first time!" rather than "PR!".
 */
export type RecordBanner = {
	lines: string[]
	debut: boolean
}

/**
 * The records a set just took, as the banner's lines.
 *
 * The phrasing is `strengthRecordLabel`'s and is not restated here: the caveat
 * belongs **on** the number — an estimate names its equation, an ordinal says it
 * cannot be compared, a bodyweight-derived kilo says it includes the athlete —
 * rather than in a footnote under the banner. That also settles the stack-level
 * case in one phrase instead of inventing a kilo for a machine that has none.
 *
 * The **load basis is in the headline**, which is what stops the banner saying
 * *"Heaviest ever: 104 kg — up 74 kg"* about a dip belt on a bench press whose
 * heaviest bar is 30 kg (ADR 0058's amendment).
 *
 * `null` when nothing was taken, which is the ordinary answer for most sets.
 */
export function buildRecordBanner(
	records: readonly StrengthRecord[],
): RecordBanner | null {
	const [first] = records
	if (!first) return null
	// The readings arrive in a stable order (heaviest, rep max, e1RM, level), so
	// "the first" is the least model-dependent thing this set achieved — the one
	// worth saying alone when there is only room for one.
	const debut = first.debut
	const shown = debut ? [first] : records
	return { lines: shown.map(strengthRecordLabel), debut }
}

// ——— What you lift next time —————————————————————————————————————————————

/** The three **Stall Responses**, in the athlete's words. `deload` is ADR 0047's
 * planned week and is deliberately not one of them. */
const STALL_RESPONSE_LABELS: Record<string, string> = {
	stallCut: 'Stall Cut',
	weightRollback: 'Weight Rollback',
	anchorReEstimate: 'Anchor Re-estimate',
}

/**
 * One lift's outcome as the panel shows it.
 *
 * `isNotice` is the whole point of the type: a **Stall Cut is a notice**, so it
 * carries a reason and **offers nothing**. There is no control inside it and it
 * asks the athlete for no decision — an engine that silently drops the squat
 * 10 % and shows the new number is the failure the Load Recompute Notice pattern
 * exists to prevent, and an engine that turns the same drop into an offer is the
 * other half of it.
 */
export type OutcomeItem = {
	key: string
	liftName: string
	/** `Squat 100 kg → 102.5 kg`, or `Bench 80 kg, repeated`. */
	headline: string
	reason: string
	isNotice: boolean
	label: string | null
}

/**
 * **What was logged where the load could not be read** — the count and the kind
 * in one phrase.
 *
 * Reads `unreadableReason`, which is the same field the engine's own sentence
 * reads and the same one that decided nothing would move. There is no second
 * classification here on purpose: the fourth round of this bug was a caveat that
 * lived only in prose.
 */
function unreadableSetsPhrase(
	outcome: Extract<LiftOutcome, { kind: 'unverifiable' }>,
): string {
	const all = outcome.unreadableSetCount >= outcome.gradedSetCount
	const label = loadKindLabel(outcome.loggedLoadKind)
	// **A contradicted kilo is its own sentence, and it is checked first.** The set
	// *was* logged as a weight on the bar — the kind says `external` — so every
	// branch below would print the true kind and, with it, the false claim that the
	// number can be read: *"every set was logged as a weight on the bar"* about the
	// rows whose kilo this engine just refused to believe. What the headline has to
	// name is the disagreement, because that is the only thing the athlete can fix.
	// The engine's own `reason` has said this correctly since the contradiction got
	// its own reason; only the headline was still reading the kind.
	if (outcome.unreadableReason === 'kiloContradictsLoad') {
		return all
			? 'every set recorded a kilo that does not follow from the load beside it'
			: `${outcome.unreadableSetCount} of the ${outcome.gradedSetCount} sets recorded a kilo that does not follow from the load beside it`
	}
	if (outcome.unreadableReason === 'noKiloLogged' || label == null) {
		return all
			? 'no kilos were logged'
			: `${outcome.unreadableSetCount} of the ${outcome.gradedSetCount} sets logged no kilos`
	}
	return all
		? `every set was logged as ${label}`
		: `${outcome.unreadableSetCount} of the ${outcome.gradedSetCount} sets were logged as ${label}`
}

/**
 * The outcome panel, one item per lift.
 *
 * **The one rule this function is audited against:** a sentence about *where the
 * lift now stands* reads `standsAtKg`, which the engine reads off the lift state
 * after the fold. A sentence about *what this session prescribed* or *what was
 * logged* reads `prescribedKg`, `loggedKg` or `weightKg`. Never one posing as the
 * other.
 *
 * It is a rule because it was broken three times. `repeated` printed the
 * **stamped** kilo under the words *"stays at"* and `liftedLighter` printed the
 * **prescribed** one, while `applySession` had returned the lift state untouched
 * — so *"Back Squat stays at 60 kg"* was published about a lift standing at
 * 77.5, and *"stays at 120 kg"* about one standing at 60. `unverifiable` was
 * right only because it was the only member reading the state.
 */
export function buildOutcomePanel(
	outcomes: readonly LiftOutcome[],
	liftNames: Record<string, string>,
): OutcomeItem[] {
	return outcomes.map((outcome) => {
		const liftName = liftNames[outcome.exerciseId] ?? 'Lift'
		const key = `${outcome.exerciseId}::${outcome.equipment ?? ''}`
		switch (outcome.kind) {
			case 'incremented':
				return {
					key,
					liftName,
					headline: `${liftName} ${trimKg(outcome.fromKg)} kg → ${trimKg(outcome.toKg)} kg`,
					reason: outcome.reason,
					isNotice: false,
					label: null,
				}
			case 'repeated':
				return {
					key,
					liftName,
					// **`standsAtKg`, not `weightKg`.** "Stays at" is a sentence about
					// where the lift now stands, so it reads the lift state. `weightKg` is
					// the weight *this session* was stamped at, and printing it here is
					// how the panel announced "Back Squat stays at 60 kg" about a lift the
					// fold had left standing at 77.5.
					headline: `${liftName} stays at ${trimKg(outcome.standsAtKg)} kg`,
					reason: outcome.reason,
					isNotice: false,
					label:
						outcome.stallCount > 0 ? `Stall Count ${outcome.stallCount}` : null,
				}
			case 'stalled':
				return {
					key,
					liftName,
					// Which number moved is stated, because the percentage families move
					// the training max and saying "your squat dropped" about a training
					// max would be a lie.
					headline: `${liftName} ${
						outcome.moved === 'trainingMax' ? 'training max ' : ''
					}${trimKg(outcome.fromKg)} kg → ${trimKg(outcome.toKg)} kg`,
					reason: outcome.reason,
					isNotice: true,
					label: STALL_RESPONSE_LABELS[outcome.response] ?? outcome.response,
				}
			case 'stallResponseUnavailable':
				return {
					key,
					liftName,
					// Nothing was changed, which is the whole content of this outcome, so
					// the weight named is the one the lift stands at.
					headline: `${liftName} stays at ${trimKg(outcome.standsAtKg)} kg`,
					reason: outcome.reason,
					isNotice: true,
					label: STALL_RESPONSE_LABELS[outcome.response] ?? outcome.response,
				}
			case 'unverifiable':
				// **A notice that claims nothing.** The prescription is priced in kilos
				// and the log carries no number that *is* that kilo, so neither "you made
				// it" nor "you missed it" can be said — and the app used to say the first
				// one, then move the weight. It names the weight it could not check, the
				// kind of load that was logged instead, and states that nothing moved.
				return {
					key,
					liftName,
					// **Both the count and the kind**, because the headline has over-claimed
					// twice. Two sets at exactly 90 kg and three at a stack level is not
					// "no kilos were logged"; and five *bodyweight* sets are not "no kilos"
					// either — a kilo was logged, of the athlete rather than the bar. Saying
					// "no kilos" there is how the athlete came to read a caveat that
					// contradicted the number above it.
					headline: `${liftName} stays at ${trimKg(outcome.standsAtKg)} kg — ${unreadableSetsPhrase(outcome)}, so the ${trimKg(outcome.prescribedKg)} kg prescribed could not be checked`,
					reason: outcome.reason,
					isNotice: true,
					label: 'Could not be read',
				}
			case 'liftedLighter':
				// **A notice, and it names both weights.** Neither credited as the
				// prescribed weight nor counted as a miss — the athlete is told which
				// number was read and which one was asked for, and left to decide what
				// it meant. Silently picking either reading would be the app deciding.
				return {
					key,
					liftName,
					// Three numbers, each read from the one place that can state it: where
					// the lift stands (the state), what was logged (the log) and what was
					// asked for (the stamp). The headline used to print the *prescription*
					// after the words "stays at" — "Back Squat stays at 120 kg" about a
					// lift standing at 60.
					headline: `${liftName} stays at ${trimKg(outcome.standsAtKg)} kg — logged at ${trimKg(outcome.loggedKg)} kg, prescribed ${trimKg(outcome.prescribedKg)} kg`,
					reason: outcome.reason,
					isNotice: true,
					label: 'Lighter than prescribed',
				}
			case 'skipped':
				return {
					key,
					liftName,
					headline: `${liftName} unchanged at ${trimKg(outcome.standsAtKg)} kg`,
					reason: outcome.reason,
					isNotice: false,
					label: null,
				}
		}
	})
}

/** **One weight, rendered the same way everywhere.** Imported rather than
 * restated: this file used to render 20.25 kg as `20.3`, the grid rendered it as
 * `20.25` and the plate note as `20`, all on one screen and all about one
 * prescription. See {@link formatKg}. */
function trimKg(kg: number): string {
	return formatKg(kg)
}

// ——— The tap-to-log grid ——————————————————————————————————————————————————
//
// **The circles hold every rule the grid used to spread across three inputs**
// (ADR 0064, which supersedes ADR 0060 §1). A working set is one control: it
// shows the target, one tap logs the target in full, each further tap counts the
// reps down, and a tap past zero clears it. The component draws circles and
// posts fields; every question about *what* a circle says, *what* it announces
// and *what* the next tap means is answered here, at a seam a test can reach
// without a browser.

/**
 * One working set's key in the runner's logged map — `stepId_orderIndex`, the
 * same pair the save is an upsert on (ADR 0056 §2).
 *
 * The key is built here rather than interpolated at three call sites because the
 * map and the post have to agree about the identity of a set, and the day they
 * disagree is the day a tap logs the wrong row.
 */
export function setCircleKey(stepId: string, orderIndex: number): string {
	return `${stepId}_${orderIndex}`
}

/**
 * What the athlete has already logged, as the runner's own map.
 *
 * The runner holds this in component state so a tapped circle answers before the
 * round trip; this function is what seeds it from the loader, so a reopened
 * session comes back with its circles filled.
 *
 * **An abandoned set seeds as zero.** A racked set has no count to record —
 * ADR 0056 §6's distinction — and the circle grid has no third colour for it, so
 * it renders as the short set it was. That is a real narrowing and it is named in
 * ADR 0064.
 */
export function buildRunnerLog(
	exercises: readonly LogExercise[],
): Record<string, number> {
	const logged: Record<string, number> = {}
	for (const exercise of exercises) {
		for (const row of [...exercise.rows, ...exercise.warmupRows]) {
			const done = row.logged
			if (!done) continue
			const count =
				done.outcome === 'abandoned' ? 0 : (done.reps ?? done.durationSec)
			if (count == null) continue
			logged[setCircleKey(exercise.stepId, row.orderIndex)] = count
		}
	}
	return logged
}

/**
 * **The weight a tap posts, or the reason there is none.**
 *
 * This is the whole of ADR 0064's cost in one function: the grid no longer asks
 * the athlete what was on the bar, so the load has to come from the prescription
 * — and where the prescription does not resolve to a number in a `LoadValue`'s
 * own semantics, the honest answer is *no circles*, with the absence stated.
 *
 * `loadNumber` is in the load's **own** semantics, never the bodyweight-inclusive
 * total: a weighted dip posts the kilos on the belt, because that is what
 * `saveLoggedSet` stores and what the plate line is solved against.
 */
export type WorkingLoad =
	| {
			kind: 'resolved'
			/** The `LoadValue` member a tap posts. */
			loadKind:
				| 'external'
				| 'bodyweight'
				| 'bodyweightPlus'
				| 'assisted'
				| 'unloaded'
			/** The number a tap posts, or `''` where the kind carries none. */
			loadNumber: string
			/** The kilos, where the load has any — what the plate line solves. */
			kg: number | null
			/** `82.5 kg` / `bodyweight + 15 kg` — the sub-line's second half. */
			text: string
	  }
	| { kind: 'absent'; text: string; fix: string | null }

export function buildWorkingLoad(exercise: LogExercise): WorkingLoad {
	const row =
		exercise.rows.find(
			(r) => r.prescribedLoad != null || r.resolvedLoad != null,
		) ?? exercise.rows[0]
	const semantics = exercise.loadSemanticsKind
	if (!row) {
		return { kind: 'absent', text: 'this lift has no sets to log', fix: null }
	}
	const prescribed = row.prescribedLoad
	const resolution = row.resolvedLoad

	// **A stated absence is rendered as the absence.** ADR 0008's Unavailable
	// Metric, and the rule that regressed in #434: an unresolved `85 % 1RM` gets
	// its sentence and its fix, never a number and never a zero.
	if (resolution?.kind === 'unavailable') {
		return { kind: 'absent', text: resolution.text, fix: resolution.fix }
	}

	if (prescribed?.kind === 'bodyweight') {
		const added = prescribed.addedKg ?? 0
		return added > 0
			? {
					kind: 'resolved',
					loadKind: 'bodyweightPlus',
					loadNumber: postedNumber(added),
					kg: added,
					text: `bodyweight + ${formatKg(added)} kg`,
				}
			: {
					kind: 'resolved',
					loadKind: 'bodyweight',
					loadNumber: '',
					kg: null,
					text: 'bodyweight',
				}
	}

	if (prescribed == null && resolution == null) {
		// Nothing was authored, so only a kind that carries **no number** can be
		// posted without inventing one.
		if (semantics === 'bodyweight') {
			return {
				kind: 'resolved',
				loadKind: 'bodyweight',
				loadNumber: '',
				kg: null,
				text: 'bodyweight',
			}
		}
		if (semantics === 'unloaded') {
			return {
				kind: 'resolved',
				loadKind: 'unloaded',
				loadNumber: '',
				kg: null,
				text: 'no load',
			}
		}
		return {
			kind: 'absent',
			text: 'no load is prescribed for this lift, and a tap cannot invent one',
			fix: null,
		}
	}

	const kg =
		resolution?.kind === 'resolved'
			? resolution.kg
			: prescribed?.kind === 'absolute'
				? prescribed.kg
				: null
	if (kg == null) {
		return {
			kind: 'absent',
			text: 'this prescription does not resolve to kilos, so there is nothing to tap',
			fix: null,
		}
	}

	// Which member of the union this lift's kilos **are**. A stated per-hand,
	// machine-level or band lift is none of them, and its absence is quoted in the
	// program's own words rather than solved as a bar.
	const loadKind =
		semantics == null || semantics === 'external'
			? 'external'
			: (semantics === 'bodyweightPlus' || semantics === 'assisted') &&
				  prescribed?.kind === 'absolute'
				? semantics
				: null
	if (loadKind == null) {
		return {
			kind: 'absent',
			text: `${loadKindLabel(semantics) ?? 'this load'} cannot be logged by tapping`,
			fix: null,
		}
	}
	return {
		kind: 'resolved',
		loadKind,
		loadNumber: postedNumber(kg),
		kg,
		text: `${formatKg(kg)} kg`,
	}
}

/**
 * The scheme, as the card's sub-line says it — `5×5`, or `5 sets` where the rows
 * do not ask for the same count.
 *
 * A timed hold counts in seconds, because a hold has no reps to promise
 * (`isMissedSet`'s own distinction, one screen up).
 */
export function buildLiftScheme(rows: readonly LogRow[]): string | null {
	if (rows.length === 0) return null
	const reps = rows.map((r) => r.prescribedReps)
	const seconds = rows.map((r) => r.prescribedDurationSec)
	const same = <T>(values: readonly (T | null)[]): T | null =>
		values[0] != null && values.every((v) => v === values[0]) ? values[0] : null
	const sameReps = same(reps)
	if (sameReps != null) return `${rows.length}×${sameReps}`
	const sameSeconds = same(seconds)
	if (sameSeconds != null) return `${rows.length}×${sameSeconds} s`
	return rows.length === 1 ? '1 set' : `${rows.length} sets`
}

/**
 * `5×5 · 82.5 kg` — the one line under the lift's name, and the only place this
 * screen states the weight the program resolved.
 *
 * Where the weight is an absence, the absence takes the number's place. It never
 * reads `5×5 · 0 kg`.
 */
export function buildLiftSubline(exercise: LogExercise): string | null {
	const scheme = buildLiftScheme(exercise.rows)
	const load = buildWorkingLoad(exercise)
	const parts = [scheme, load.text].filter(
		(part): part is string => part != null && part !== '',
	)
	return parts.length ? parts.join(' · ') : null
}

// ——— One circle ——————————————————————————————————————————————————————————

/**
 * What a circle is, in three states and no more.
 *
 * `short` is deliberately the same state for four reps as for zero: a set under
 * its target is a set the program will read as a miss, and the athlete is
 * entitled to see that at a glance rather than to work it out from a number
 * (#476's user story 6).
 */
export type SetCircleState = 'untouched' | 'made' | 'short'

export type SetCircle = {
	/** `stepId_orderIndex` — {@link setCircleKey}. */
	key: string
	orderIndex: number
	/** 1-based, as the athlete counts sets. */
	position: number
	state: SetCircleState
	/** The target when untouched, the count achieved once logged. */
	display: string
	/** `Log set 3 of Squat`, and `Logged set 3 of Squat` once logged. */
	ariaLabel: string
	/** The count a first tap posts, or null where nothing was prescribed. */
	target: number | null
	/** What is logged against this set, or null when it is untouched. */
	logged: number | null
	/** Which typed field a tap posts the count under. A hold is seconds. */
	quantity: 'reps' | 'durationSec'
	/**
	 * Whether further taps count the number down. A hold does not: decrementing a
	 * 45-second plank one second at a time is thirty taps, so a timed set logs in
	 * full and the next tap clears it.
	 */
	countsDown: boolean
	/** `working` on a prescribed row, and whatever a logged row already says —
	 * re-tapping a set must not restate what kind of set it was. */
	role: SetRole
	/** Whether a tap can post at all. False where the load is an absence. */
	tappable: boolean
}

export function buildSetCircles(input: {
	liftName: string
	stepId: string
	rows: readonly LogRow[]
	/** The runner's logged map, {@link buildRunnerLog}'s shape. */
	logged: Readonly<Record<string, number>>
	/** False where {@link buildWorkingLoad} found no number to post. */
	tappable?: boolean
}): SetCircle[] {
	return input.rows.map((row, index) => {
		const key = setCircleKey(input.stepId, row.orderIndex)
		const timed =
			row.prescribedReps == null && row.prescribedDurationSec != null
		const target = timed ? row.prescribedDurationSec : row.prescribedReps
		const logged = key in input.logged ? input.logged[key]! : null
		const state: SetCircleState =
			logged == null
				? 'untouched'
				: target != null && logged < target
					? 'short'
					: 'made'
		const position = index + 1
		return {
			key,
			orderIndex: row.orderIndex,
			position,
			state,
			// An untouched set shows what it is asking for; a logged one shows what
			// was done. A set with no prescribed count shows neither, because a `0`
			// there would be a target nobody set.
			display:
				logged != null ? String(logged) : target != null ? String(target) : '—',
			ariaLabel: `${logged == null ? 'Log' : 'Logged'} set ${position} of ${input.liftName}`,
			target,
			logged,
			quantity: timed ? 'durationSec' : 'reps',
			countsDown: !timed,
			role: row.logged?.role ?? 'working',
			tappable: (input.tappable ?? true) && target != null,
		}
	})
}

/**
 * **The tap cycle.** `target → target−1 → … → 0 → cleared`, and back to the
 * target on the next tap.
 *
 * The first tap logging the target **in full** is the whole design: the common
 * case is all the reps, and the common case must cost one action (#476's user
 * story 3). Counting down rather than up is the second half of it — a short set
 * is a correction to a made one, so the number the athlete reaches for is one or
 * two taps from where they already are.
 */
export function nextSetReps(
	current: number | null,
	target: number,
): number | 'cleared' {
	if (current == null) return target
	if (current <= 0) return 'cleared'
	// A count above the target — a logged AMRAP, or a target that moved under a
	// set already logged — steps down from the target rather than from itself, so
	// the cycle cannot strand the athlete tapping their way down from 20.
	return Math.min(current, target) - 1
}

/**
 * `2 of 5 logged` — what is left without counting circles (#476's user story 17).
 *
 * Working sets only, which is free here: warm-up rungs are chips and never
 * circles, so the ramp cannot inflate the count.
 */
export function buildLoggedCounter(circles: readonly SetCircle[]): string {
	const done = circles.filter((circle) => circle.logged != null).length
	return `${done} of ${circles.length} logged`
}

/**
 * How many working sets this session has logged — the number `Finish workout` is
 * refused for when it is zero (ADR 0060 §6). The server refuses it too, on the
 * sets themselves; this is only so the surface does not offer what the server
 * will refuse without saying why.
 */
export function countLoggedWorkingSets(
	exercises: readonly LogExercise[],
	logged: Readonly<Record<string, number>>,
): number {
	let count = 0
	for (const exercise of exercises) {
		for (const row of exercise.rows) {
			if (setCircleKey(exercise.stepId, row.orderIndex) in logged) count += 1
		}
	}
	return count
}

// ——— The warm-up ramp, as chips ———————————————————————————————————————————

/**
 * A rung of the generated ramp as one chip — `40 × 5`, on or off.
 *
 * **Interim, and the seam #483 lands on.** The rest a rung implies, the last
 * rung's three minutes and the earlier rung that cancels a running rest all
 * belong to the rest module and to that ticket; what is here is the toggle and
 * the label, so the ramp stays loggable while the row it used to be is deleted.
 */
export type WarmupChip = {
	key: string
	orderIndex: number
	label: string
	on: boolean
	ariaLabel: string
	/** The last rung is the only one that will start a rest (#483). */
	isLast: boolean
	loadKind: 'external' | 'bodyweight' | 'bodyweightPlus'
	loadNumber: string
	reps: number | null
	durationSec: number | null
}

export function buildWarmupChips(input: {
	liftName: string
	stepId: string
	rows: readonly LogRow[]
	logged: Readonly<Record<string, number>>
}): WarmupChip[] {
	return input.rows.map((row, index) => {
		const key = setCircleKey(input.stepId, row.orderIndex)
		const rung = row.warmupRung
		// `targetKg` is the rung in the load's **own** semantics — the kilos on the
		// belt, never the athlete plus the belt. A rung with nothing added is the
		// base alone, and it posts as bodyweight rather than as `0 kg`.
		const addsWeight = rung != null && rung.targetKg > 0
		const derivedFromBodyweight =
			rung != null && rung.effectiveKg > rung.targetKg
		const loadKind = derivedFromBodyweight
			? addsWeight
				? 'bodyweightPlus'
				: 'bodyweight'
			: 'external'
		const count = row.prescribedReps ?? row.prescribedDurationSec
		const weightLabel = derivedFromBodyweight
			? addsWeight
				? `bw + ${formatKg(rung.targetKg)}`
				: 'bw'
			: rung != null
				? formatKg(rung.targetKg)
				: '—'
		const label = count == null ? weightLabel : `${weightLabel} × ${count}`
		const on = key in input.logged
		return {
			key,
			orderIndex: row.orderIndex,
			label,
			on,
			ariaLabel: `${on ? 'Logged' : 'Log'} warm-up ${index + 1} of ${input.liftName}, ${label}`,
			isLast: index === input.rows.length - 1,
			loadKind,
			loadNumber:
				loadKind === 'bodyweight' || rung == null
					? ''
					: postedNumber(rung.targetKg),
			reps: row.prescribedReps,
			durationSec:
				row.prescribedReps == null ? row.prescribedDurationSec : null,
		}
	})
}

/**
 * A kilo as a **posted field**, not as a rendered one.
 *
 * `formatKg` is for reading; this is for the wire, so `82.5` posts as `82.5` and
 * a percentage-derived `118.99999999999999` posts as `119` rather than as
 * seventeen digits the athlete never typed. Two decimals is the smallest plate
 * anybody owns, twice over.
 */
function postedNumber(kg: number): string {
	return String(Number(kg.toFixed(2)))
}

// ——— The rest a tap implies ————————————————————————————————————————————————
//
// **Rest is prescribed data, not a UI preference** (`app/utils/strength/rest.ts`),
// and *which* prescription a given tap earns is programme logic — so it is
// answered here rather than in the bar. `180` and `300` are therefore never
// written in a component; nor is the rule that a short set rests longer, which is
// the whole reason the timer is outcome-aware.

/**
 * What a tap does to the one rest timer this screen has.
 *
 * Two members, because there is no third thing a tap can do: it either starts a
 * rest — from now, for a stated reason — or it ends the one that is running.
 * There is deliberately no *leave it alone*: every tap on this screen is either
 * the end of a set or the undoing of one, and both are events about rest.
 */
export type RestAction =
	| { kind: 'start'; sec: number; reason: RestReason }
	| { kind: 'cancel' }

/**
 * `sec: null` is a real answer from the rest module — a warm-up rung that is not
 * the last one gets no timer — and here it means **cancel**, not *nothing*:
 * walking back down the ramp is the athlete saying the pause is over.
 */
function restActionFrom(prescription: RestPrescription): RestAction {
	return prescription.sec == null
		? { kind: 'cancel' }
		: { kind: 'start', sec: prescription.sec, reason: prescription.reason }
}

/**
 * **The rest a tap on a working-set circle implies.**
 *
 * The outcome is read off the count the tap just logged rather than off a flag,
 * through `isMissedSet` — one definition of *short*, living with the log — so a
 * five-of-five rests three minutes and a four-of-five rests five, with the reason
 * the bar states.
 */
export function restForSetTap(input: {
	circle: Pick<SetCircle, 'role' | 'target' | 'quantity'>
	/** What the tap logged — {@link nextSetReps}' answer. */
	next: number | 'cleared'
	/** `WorkoutStep.restBetweenSetsSec`, where a coach authored one. */
	prescribedSec?: number | null
}): RestAction {
	// A cleared set has no rest to serve: the set it was resting from is gone.
	if (input.next === 'cleared') return { kind: 'cancel' }
	const counted = input.circle.quantity === 'reps'
	return restActionFrom(
		restAfterSet({
			role: input.circle.role,
			// A timed hold has no reps to come up short of, so it is never a miss on
			// this surface — `countsDown` is false for it and it logs in full.
			missed: isMissedSet({
				outcome: 'completed',
				reps: counted ? input.next : null,
				prescribedReps: counted ? input.circle.target : null,
			}),
			prescribedSec: input.prescribedSec ?? null,
		}),
	)
}

/**
 * **The rest a warm-up chip implies — the seam #483 lands on.**
 *
 * The ramp is walked up briskly and the one pause is the one that matters: the
 * last rung starts a rest, any earlier rung clears the one that is running, and
 * un-ticking a rung clears it too. The exercise's own `restBetweenSetsSec` is
 * deliberately **not** passed — warm-up rests are the ramp's, never the work
 * set's, which is the rest module's own rule.
 */
export function restForWarmupTap(input: {
	chip: Pick<WarmupChip, 'isLast'>
	/** Whether this tap ticks the rung **on**. */
	on: boolean
}): RestAction {
	if (!input.on) return { kind: 'cancel' }
	return restActionFrom(
		restAfterSet({
			role: 'warmup',
			missed: false,
			isLastWarmupSet: input.chip.isLast,
		}),
	)
}

/**
 * **The instant the rest is over**, anchored to when the athlete tapped rather
 * than to when the save landed — a rest clock that starts when the network
 * finishes is short by the round trip.
 *
 * A deadline rather than a counter is the whole trick: an interval in a
 * backgrounded tab does not run, so anything decremented comes back wrong, and
 * everything the bar shows is re-derived from this number and the clock.
 */
export function restDeadline(
	action: Extract<RestAction, { kind: 'start' }>,
	at: number,
): number {
	return at + action.sec * 1000
}

/**
 * The bar's whole content, recomputed from the deadline and the current time.
 *
 * Called on every tick, and it is the only arithmetic behind the clock — the
 * interval exists to force a render, never to count.
 */
export type RestClock = {
	/** `2:45`, and `+0:14` once the rest is over. */
	text: string
	/** Past the deadline: the bar reads destructive and keeps counting. */
	past: boolean
	/** The phrase beside the clock — the rest module's wording. */
	label: string
}

export function buildRestClock(input: {
	deadline: number
	reason: RestReason
	now: number
}): RestClock {
	const remainingMs = input.deadline - input.now
	const past = remainingMs <= 0
	// Counting down rounds **up** so the first render of a three-minute rest says
	// `3:00` rather than `2:59`; counting over rounds **down** so the first second
	// past the deadline says `+0:00`.
	const sec = past
		? Math.floor(-remainingMs / 1000)
		: Math.ceil(remainingMs / 1000)
	const text = `${past ? '+' : ''}${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
	return {
		text,
		past,
		// Once the deadline has gone by, the reason is no longer the news: what the
		// athlete is looking at is how far over they are.
		label: past ? 'over your rest' : restReasonText(input.reason),
	}
}

// ——— The help panel, the plate line and last time ————————————————————————
//
// **Every number on the card accounts for itself when asked, and not before**
// (#484). The panel is collapsed by default because this screen's rule is *no
// prose on the logging surface at all* (#434's verdict), and open it says four
// things in the athlete's own numbers rather than in the algorithm's.
//
// All four sentences are built here. The panel component renders strings and
// decides nothing about which sentence a lift gets.

/**
 * Where one lift of a run now stands, as the panel needs it: the weight, the
 * run of made sessions behind it, and the Stall Count behind a weight that is
 * held.
 *
 * Structurally `programLiftProgress`'s row — restated as a presenter type on
 * purpose, so this file stays free of `prisma` and the server module stays free
 * of copy.
 */
export type LiftProgress = {
	exerciseId: string
	equipment: string | null
	workingWeightKg: number
	stallCount: number
	/** The **trailing** run of made sessions — *"has made its last five"*, never
	 * *"has made five in total"*. */
	madeInARow: number
}

/**
 * This lift's progression state, or `null` where the run cannot say.
 *
 * **Ambiguity is a `null`, not a guess.** The progression key is
 * `(exerciseId, equipment)` — barbell and dumbbell bench progress separately —
 * and the runner's step carries no equipment, so a run holding two states for
 * one exercise cannot be resolved from here. Picking either would put a dumbbell
 * lift's history under a barbell weight, so the panel falls back to the
 * prescription's own provenance instead.
 */
export function findLiftProgress(
	progress: readonly LiftProgress[],
	exerciseId: string | null,
): LiftProgress | null {
	if (exerciseId == null) return null
	const matches = progress.filter((row) => row.exerciseId === exerciseId)
	return matches.length === 1 ? matches[0]! : null
}

/**
 * **Where this weight came from, in the athlete's own numbers** — the panel's
 * first line.
 *
 * Two sentences, and which one is said is the whole point of the line:
 *
 * - a lift that is **moving** says the run behind it — *"82.5 kg is your working
 *   weight after five made sessions"*;
 * - a lift that is **held** says why it did not move — *"60 kg is held: two
 *   sessions in a row came up short"*. A weight that stopped moving and says
 *   nothing reads as a bug, which is the failure this line exists to prevent
 *   (#476's user story 23).
 *
 * The Stall Count is checked **first**. It is reset to zero on any success, so a
 * non-zero count is the more recent fact about the lift and the one the athlete
 * is owed.
 *
 * Where the session belongs to no run, there is no history to quote and the
 * sentence falls back to the shipped resolution detail — the anchor provenance
 * (*"85 % of your tested 140 kg 1RM"*) or the stated absence and its fix.
 */
export function buildResolutionSentence(input: {
	progress: LiftProgress | null
	/** {@link buildResolutionDetail}'s answer for this lift's first loaded row. */
	resolution: { text: string; fix: string | null } | null
}): string | null {
	const progress = input.progress
	if (progress) {
		const kg = trimKg(progress.workingWeightKg)
		if (progress.stallCount > 0) {
			return progress.stallCount === 1
				? `${kg} kg is held: a session came up short.`
				: `${kg} kg is held: ${spelled(progress.stallCount)} sessions in a row came up short.`
		}
		if (progress.madeInARow > 0) {
			return progress.madeInARow === 1
				? `${kg} kg is your working weight after one made session.`
				: `${kg} kg is your working weight after ${spelled(progress.madeInARow)} made sessions.`
		}
		return `${kg} kg is your working weight. Nothing has been logged for this lift on this run yet.`
	}
	const detail = input.resolution
	if (!detail) return null
	return detail.fix ? `${detail.text} ${detail.fix}` : detail.text
}

/**
 * **The counts are spelled, because the design's copy spells them.** *"after
 * five made sessions"* is a sentence a coach says; *"after 5 made sessions"* is
 * a readout. Above twelve the word is longer than the number is informative, so
 * the digits come back.
 */
const NUMBER_WORDS = [
	'zero',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten',
	'eleven',
	'twelve',
] as const

function spelled(count: number): string {
	return NUMBER_WORDS[count] ?? String(count)
}

/**
 * The four lines of the help panel, already phrased, plus the link.
 *
 * `plates` is the second line and it is **not** a plate line: it names the rack
 * the plate line under the sets is solved against, which is what makes that line
 * accountable. Where no gym is described it says so — the offer to describe one
 * belongs under the sets, in the place the plate line would have been.
 */
export type HelpPanelLines = {
	/** {@link buildResolutionSentence}. Null only where nothing can be said. */
	resolution: string | null
	/** Why there is no warm-up ramp, in the ramp module's own words. */
	warmup: string | null
	plates: string
	timer: string
	/** This lift over time, where the step names an exercise the app knows. */
	history: { text: string; href: string } | null
}

/**
 * **The rest timer's honest limit, stated rather than approximated.** A tab the
 * athlete closed loses the deadline, and the fix for that is a scheduled local
 * notification, which is not built. So the panel says what the timer does and
 * does not survive.
 */
export const REST_TIMER_LIMIT_SENTENCE =
	'The rest timer survives a locked phone, but not a closed tab.'

export function buildHelpPanel(input: {
	exercise: LogExercise
	hasGymOnFile: boolean
	progress: LiftProgress | null
}): HelpPanelLines {
	const { exercise } = input
	const resolution = exercise.rows
		.map((row) => buildResolutionDetail(row.resolvedLoad))
		.find((detail) => detail != null)
	const gym = exercise.plateContext
	return {
		resolution: buildResolutionSentence({
			progress: input.progress,
			resolution: resolution ?? null,
		}),
		warmup: exercise.warmupUnavailable,
		plates: gym
			? `Plates are solved against ${gym.gymName}${
					gym.variantName ? ` for ${gym.variantName}` : ''
				}.`
			: 'No gym is described, so no plates are solved.',
		timer: REST_TIMER_LIMIT_SENTENCE,
		history:
			exercise.exerciseId == null
				? null
				: {
						text: 'This lift over time',
						href: `/training/exercises/${exercise.exerciseId}`,
					},
	}
}

/**
 * **What goes under the sets, and it is one of three answers** (ADR 0060 §2).
 *
 * - `plates` — the line itself, per side and heaviest first, in the solver's own
 *   words.
 * - `refusal` — a rack that **cannot make the number says so**, in the solver's
 *   own refusal sentence, so the athlete is not hunting for a plate that does
 *   not exist.
 * - `no-gym` — **no plate line at all**, and the offer to describe a gym in its
 *   place. Not a default rack, not an assumed bar: the app never guesses what
 *   somebody's rack holds.
 *
 * `null` where there is nothing to solve — an absent weight, a load kind with no
 * plates (a stack level, a band, an unloaded hold), or a gym on file that says
 * nothing about this movement.
 */
export type PlateAnnotation =
	| { kind: 'plates'; text: string }
	| { kind: 'refusal'; text: string }
	| { kind: 'no-gym' }
	| null

export function buildLiftPlateAnnotation(input: {
	exercise: LogExercise
	load: WorkingLoad
	hasGymOnFile: boolean
}): PlateAnnotation {
	const { exercise, load } = input
	// Nothing resolved, so there is no number to put on a bar and no absence to
	// explain here — the sub-line under the lift's name already said it.
	if (load.kind !== 'resolved' || load.kg == null) return null
	if (!hasPlateSolve(load.loadKind)) return null
	if (!exercise.plateContext)
		return input.hasGymOnFile ? null : { kind: 'no-gym' }
	const options = plateOptionsForKind(
		load.loadKind,
		exercise.plateContext.options,
	)
	if (!options) return null
	const line = buildPlateLine({
		loadNumber: load.loadNumber,
		inventory: exercise.plateContext.inventory,
		options,
	})
	if (!line) return null
	// **The gap is a refusal, not a footnote.** A rack that lands 0.75 kg away has
	// not made the number, and the line says which number it did make rather than
	// printing plates that add up to something else.
	if (line.kind === 'unavailable') return { kind: 'refusal', text: line.note }
	if (line.kind === 'nearest') {
		return { kind: 'refusal', text: `${line.text} · ${line.note}` }
	}
	return { kind: 'plates', text: line.text }
}

/**
 * `Last time 80 × 5,5,5,5,5` — the previous session's working sets, beside
 * today's (#476's user story 25).
 *
 * Read off the **Set Ghost**, which is already matched onto this session's rows
 * positionally. Two rules it does not break:
 *
 * - an **extrapolated** ghost is dropped. A session that grew from four sets to
 *   five borrows the fourth set's ghost onto the fifth row, and printing it here
 *   would claim a fifth set the athlete never did.
 * - **the weight is quoted once where it was one weight**, and per set where it
 *   was not: a ramp of 80/85/90 is not *"90 × 5,5,5"*.
 *
 * `null` where last time cannot be quoted at all, which is the honest answer on
 * a lift's first session.
 */
export function buildLastTime(rows: readonly LogRow[]): string | null {
	const sets = rows
		.map((row) => row.ghost)
		.filter((ghost) => ghost != null && !ghost.extrapolated)
		.map((ghost) => ({
			load: loadValueText(ghost!.load),
			count:
				ghost!.reps != null
					? String(ghost!.reps)
					: ghost!.durationSec != null
						? `${ghost!.durationSec} s`
						: null,
		}))
		.filter((set): set is { load: string; count: string } => set.count != null)
	if (sets.length === 0) return null
	const oneWeight = sets.every((set) => set.load === sets[0]!.load)
	return oneWeight
		? `Last time ${sets[0]!.load} × ${sets.map((set) => set.count).join(',')}`
		: `Last time ${sets.map((set) => `${set.load} × ${set.count}`).join(', ')}`
}
