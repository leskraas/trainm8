/**
 * **The warm-up ramp** — the ladder from the empty bar to the work weight.
 *
 * The reference product's rule is published in two halves and only one of them
 * survives contact with its own example
 * (`docs/wayfinder/out-of-the-box/strength-module-brief.md` §A.2.1):
 *
 * - **Published and used:** two sets of five with the empty bar, then heavier
 *   fives up to the work weight; the set count scales with the **work weight**
 *   and never with the lifter; no jump larger than 45 lb.
 * - **Published and broken by the vendor's own worked example:** that 45 lb cap,
 *   on two of its four jumps. So the cap cannot be the mechanism. It is used here
 *   only to **count the rungs** — which reproduces the published example exactly
 *   — while each rung is then snapped to a weight the athlete's rack can
 *   genuinely make. That plate-aligned mechanism is an inference, so the cap is
 *   never claimed in copy.
 *
 * Two deliberate departures, both stated: the ramp is **editable** here (the
 * reference product's is not), and a rung the rack cannot make is **dropped**
 * rather than approximated, so the ladder never lists a weight nobody can load.
 *
 * Loadability is {@link calculatePlates}' job, and this module does not repeat a
 * line of it: a second rounding rule beside the solver is a rule that can
 * disagree with it.
 *
 * Pure: no clock, no random source, no `prisma`.
 */
import { type SetRole, type LoadValueKind } from '../strength-log.ts'
import {
	WARMUP_EMPTY_BAR_SETS,
	WARMUP_JUMP_CAP_KG,
	WARMUP_REPS,
} from './plates.constants.ts'
import {
	type PlateInventory,
	type PlateOptions,
	type PlateRefusal,
	type PlateSolution,
	calculatePlates,
} from './plates.ts'

/** One rung of the ladder, ready to be written as a `warmup` set. */
export type WarmupSet = {
	orderIndex: number
	/** Always `warmup` — the one flag that is stored, because it is what keeps
	 * these sets out of records, hard-set counts and every aggregate. */
	role: Extract<SetRole, 'warmup'>
	reps: number
	/** The kilos this rung is, as `effectiveLoadKg` would report them. */
	loadKg: number
	/** The kilos above the base — plate mass on a bar, added mass on a dip belt. */
	addedKg: number
	/** What goes on the bar to make it. Always an exact solution, by construction. */
	solution: PlateSolution
}

/** Why there is no ramp. Every plate refusal, plus the two ramping adds. */
export type WarmupRefusal =
	| PlateRefusal
	/** An empty bar needs no ramp to reach an empty bar. */
	| 'work-weight-is-not-above-the-bar'
	/**
	 * A dumbbell and an assisted machine. The published mechanics are bar-based
	 * (two empty-bar sets, then plate-aligned rungs) and the vendor publishes
	 * nothing for a fixed rack or for a load that ramps *downward* as it gets
	 * harder. Stated as an absence rather than filled in with an invention.
	 */
	| 'no-published-ramp-for-this-load-kind'

export type WarmupRamp =
	| { outcome: 'ramp'; sets: WarmupSet[] }
	| { outcome: 'unavailable'; reason: WarmupRefusal; explanation: string }

export type WarmupOptions = Omit<PlateOptions, 'kind'> & {
	inventory: PlateInventory
	kind?: LoadValueKind
	/** Reps per warm-up set. Defaults to the program's five. */
	reps?: number
}

/**
 * A gram of slack in the rung count, and nothing else depends on it.
 *
 * Not a published figure and not a claim: a 45 lb bar is 20.41165… kg, so a work
 * weight that is exactly four capped jumps above it lands a rounding artefact
 * over the line and silently grows a fifth rung. The cap it is applied to is
 * 20.4 kg, so a gram cannot change any answer that was not already a tie.
 */
const JUMP_COUNT_TOLERANCE_KG = 0.001

/** The load kinds the published mechanics actually cover. */
const RAMPABLE_KINDS: LoadValueKind[] = ['external', 'bodyweightPlus']

/**
 * The ladder up to `workKg` — two empty-bar sets, then the rungs.
 *
 * `workKg` is read in the load's own semantics, exactly as
 * {@link calculatePlates} reads it: a barbell total including the bar, the added
 * kilos of a weighted dip.
 */
export function warmupRamp(workKg: number, options: WarmupOptions): WarmupRamp {
	const kind = options.kind ?? 'external'
	const { inventory, reps = WARMUP_REPS, ...plateOptions } = options

	// The refusals belong to the load union, so they are asked of the solver
	// rather than restated here — a stack level has no kilos to ramp through.
	const solvedWork = calculatePlates(workKg, inventory, {
		...plateOptions,
		kind,
	})
	if (solvedWork.outcome === 'unavailable') {
		return {
			outcome: 'unavailable',
			reason: solvedWork.reason,
			explanation: solvedWork.explanation,
		}
	}
	if (!RAMPABLE_KINDS.includes(kind)) {
		return refuse('no-published-ramp-for-this-load-kind')
	}

	// The base is the bar, or the athlete for a bodyweight-derived load — the
	// brief's `useBodyweightForBar`, and the reason there is one code path.
	const baseKg = solvedWork.barKg
	// The ladder is built in "kilos above the base", which is the one axis both
	// a barbell and a dip belt share.
	const workAboveBase = solvedWork.totalWeight - baseKg
	if (workAboveBase <= 0) return refuse('work-weight-is-not-above-the-bar')

	// Rung count from the published cap: the fewest jumps that keep every jump
	// inside 45 lb. This is what makes the count scale with the work weight and
	// with nothing else — not the lifter, not their sex, not their history.
	// The tolerance matters: a 45 lb bar is 20.41165… kg and the solver works in
	// scaled integers, so without it the vendor's own 225 lb example lands a
	// rounding artefact over four jumps and silently grows a fifth rung.
	const jumps = Math.max(
		1,
		Math.ceil((workAboveBase - JUMP_COUNT_TOLERANCE_KG) / WARMUP_JUMP_CAP_KG),
	)

	const ladder: Array<{
		loadKg: number
		addedKg: number
		solution: PlateSolution
	}> = []
	for (let rung = 1; rung < jumps; rung++) {
		const targetAboveBase = (workAboveBase * rung) / jumps
		const asked =
			kind === 'external' ? baseKg + targetAboveBase : targetAboveBase
		const solved = calculatePlates(asked, inventory, { ...plateOptions, kind })
		if (solved.outcome === 'unavailable') continue
		const addedKg = solved.totalWeight - baseKg
		// A rung the rack cannot distinguish from the bar below it or from the work
		// weight above it is not a rung: drop it rather than repeat a weight.
		if (addedKg <= (ladder.at(-1)?.addedKg ?? 0)) continue
		if (addedKg >= workAboveBase) continue
		ladder.push({ loadKg: solved.totalWeight, addedKg, solution: solved })
	}

	// The empty bar (or the athlete alone), twice, before anything is loaded.
	const emptyBar = calculatePlates(
		kind === 'external' ? baseKg : 0,
		inventory,
		{
			...plateOptions,
			kind,
		},
	)
	const emptyBarSets = Array.from({ length: WARMUP_EMPTY_BAR_SETS }, () => ({
		loadKg: baseKg,
		addedKg: 0,
		solution: emptyBar,
	}))

	return {
		outcome: 'ramp',
		sets: [...emptyBarSets, ...ladder].map((rung, orderIndex) => ({
			orderIndex,
			role: 'warmup' as const,
			reps,
			loadKg: rung.loadKg,
			addedKg: rung.addedKg,
			solution: rung.solution,
		})),
	}
}

const REFUSAL_TEXT: Record<
	'work-weight-is-not-above-the-bar' | 'no-published-ramp-for-this-load-kind',
	string
> = {
	'work-weight-is-not-above-the-bar':
		'The work weight is the empty bar, so there is nothing to ramp up to.',
	'no-published-ramp-for-this-load-kind':
		'No warm-up ramp is published for this equipment, so none is generated.',
}

function refuse(
	reason: keyof typeof REFUSAL_TEXT,
): Extract<WarmupRamp, { outcome: 'unavailable' }> {
	return { outcome: 'unavailable', reason, explanation: REFUSAL_TEXT[reason] }
}
