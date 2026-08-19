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
	plateLineText,
} from '#app/utils/strength/plates.ts'
import { type LiftOutcome } from '#app/utils/strength/program-engine.ts'
import { loadKindLabel } from '#app/utils/strength/program-rules.ts'
import { formatKg } from '#app/utils/strength/program.constants.ts'
import {
	type StrengthRecord,
	strengthRecordLabel,
} from '#app/utils/strength/records.ts'
import { type LogRow } from '#app/utils/strength-log.server.ts'
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
