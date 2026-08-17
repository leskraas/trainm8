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
	if (row.prescribedLoad) {
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
	if (solution.outcome === 'nearest') {
		return {
			kind: 'nearest',
			text,
			note: `Your gym makes ${trimKg(solution.totalWeight)} kg, not ${trimKg(kg)} kg.`,
		}
	}
	return { kind: 'plates', text, perSideKg: solution.perSideKg }
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
					headline: `${liftName} stays at ${trimKg(outcome.weightKg)} kg`,
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
					headline: `${liftName} stays at ${trimKg(outcome.weightKg)} kg`,
					reason: outcome.reason,
					isNotice: true,
					label: STALL_RESPONSE_LABELS[outcome.response] ?? outcome.response,
				}
			case 'skipped':
				return {
					key,
					liftName,
					headline: `${liftName} unchanged at ${trimKg(outcome.weightKg)} kg`,
					reason: outcome.reason,
					isNotice: false,
					label: null,
				}
		}
	})
}

/** Kilos to one decimal, integers bare — the notation's own house rule. */
function trimKg(kg: number): string {
	return Number.isInteger(kg) ? String(kg) : kg.toFixed(1)
}
