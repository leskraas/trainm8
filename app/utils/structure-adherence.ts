import {
	type IntensityTarget,
	type WorkoutStructure,
} from './workout-schema.ts'

/**
 * Structure Adherence (ADR 0034): the coarse, whole-session comparison of a
 * matched planned session's *detected* structure against its *prescribed*
 * structure, surfaced beside the **Adherence Band** on the **Workout Detail
 * View** (#332/#345).
 *
 * Pure and display-derived — a function of the two stored `WorkoutStructure`s,
 * never stored, and it never touches **Planned TSS** or **Training Load**.
 * Because **Structure Detection** systematically *under*-detects (it merges
 * warm-up ramps, is blind to short and in-zone reps, #330), the signal is
 * deliberately **asymmetric**:
 *
 * - **`as-prescribed`** — the detected archetype corroborates the plan (rep
 *   count and work durations broadly aligned within tolerance).
 * - **`diverged`** — detection *confidently* found structure the plan did not
 *   prescribe: surplus reps, or clearly-higher work intensity on a comparable
 *   channel. The engine never fabricates structure (its band-separation gate
 *   refuses phantom structure, ADR 0033), so surplus detected structure is real
 *   and safe to assert.
 * - **`not-verifiable`** — detection found *less* than planned (an Unavailable
 *   Metric, "structure not confidently verifiable"). That gap cannot be told
 *   apart from detector blindness, so it is **never** charged to the athlete as
 *   a missed-reps verdict (ADR 0008).
 */
export type StructureAdherenceVerdict =
	| 'as-prescribed'
	| 'diverged'
	| 'not-verifiable'

/**
 * Match tolerances — tunable build-time constants (cf. ADR 0019's placeholder
 * band cut points), not domain decisions. Deliberately forgiving on the "under"
 * side because detection under-detects.
 */

/** Detected reps may exceed the plan by this many and still corroborate it. */
export const REP_SURPLUS_TOLERANCE = 1
/** Detected reps may fall short of the plan by this many and still corroborate it. */
export const REP_DEFICIT_TOLERANCE = 1
/**
 * Median work-rep duration must align within this relative margin to *confirm*
 * `as-prescribed`; a wider gap (usually merged reps) degrades to `not-verifiable`.
 */
export const WORK_DURATION_TOLERANCE = 0.35
/**
 * Detected peak work intensity this much above the prescribed peak — on a
 * comparable channel — is a real, safe-to-assert divergence.
 */
export const INTENSITY_SURPLUS_MARGIN = 0.12

/**
 * A step intensity reduced to a scalar that is only comparable to another of
 * the same `scale`, where a *higher* `value` always means *harder*. Detection
 * stores measured metrics (pace / power / bpm), authoring may store zone labels
 * or metrics — so two intensities are honestly comparable only when they speak
 * the same channel; otherwise the comparison is skipped rather than faked.
 */
type Magnitude = { scale: string; value: number }

/** Ordinal training-zone ladder for zone-label targets (higher = harder). */
const ZONE_ORDINALS: Record<string, number> = {
	recovery: 1,
	easy: 1,
	z1: 1,
	endurance: 2,
	zone2: 2,
	z2: 2,
	tempo: 3,
	z3: 3,
	threshold: 4,
	z4: 4,
	vo2max: 5,
	max: 5,
	z5: 5,
	anaerobic: 6,
	z6: 6,
	neuromuscular: 7,
	z7: 7,
}

function intensityMagnitude(intensity: IntensityTarget): Magnitude | null {
	// The magnitude is the *hardest* edge of a target's range: the upper bound
	// for range kinds (so a detected value inside a prescribed band like 280–300 W
	// is not flagged harder than the plan), and the faster (lower) bound for pace.
	// A detected step carries a single measured value (no upper bound), so it
	// falls back to that value.
	switch (intensity.kind) {
		case 'zoneLabel': {
			const ord = ZONE_ORDINALS[intensity.label.trim().toLowerCase()]
			return ord != null ? { scale: 'zone', value: ord } : null
		}
		case 'rpe':
			return { scale: 'rpe', value: intensity.max ?? intensity.min }
		case 'hrBpm':
			return { scale: 'hr', value: intensity.max ?? intensity.min }
		case 'hrPct':
			return {
				scale: `hrPct:${intensity.ref}`,
				value: intensity.maxPct ?? intensity.minPct,
			}
		case 'power':
			return { scale: 'power', value: intensity.maxW ?? intensity.minW }
		case 'powerPct':
			return { scale: 'powerPct', value: intensity.maxPct ?? intensity.minPct }
		case 'pace':
			// Faster (fewer seconds per km) is harder, so negate to keep "higher =
			// harder" across every scale; the faster bound is the min, not the max.
			return { scale: 'pace', value: -intensity.minSecPerKm }
	}
}

type WorkStep = { durationSec: number | null; magnitude: Magnitude | null }
type StructureBlock = WorkoutStructure['blocks'][number]

/** The hardest cardio step in a block — the block's representative work effort. */
function blockWorkStep(block: StructureBlock): WorkStep | null {
	let best: WorkStep | null = null
	let bestMag: number | null = null
	let firstCardio: WorkStep | null = null
	for (const s of block.steps) {
		if (s.kind !== 'cardio') continue
		const magnitude = s.intensity ? intensityMagnitude(s.intensity) : null
		const durationSec = 'durationSec' in s ? (s.durationSec ?? null) : null
		const candidate: WorkStep = { durationSec, magnitude }
		if (firstCardio == null) firstCardio = candidate
		if (magnitude != null && (bestMag == null || magnitude.value > bestMag)) {
			best = candidate
			bestMag = magnitude.value
		}
	}
	// A block with cardio steps but no resolvable intensity still has a work
	// effort — fall back to its first cardio step (authoring puts work first).
	return best ?? firstCardio
}

/** The coarse work archetype of a whole structure. */
type WorkProfile = {
	/** Number of repeated work efforts (warm-up / cool-down excluded). */
	repCount: number
	/** Per-rep work durations, when quantified by time (empty when distance-based). */
	workDurations: number[]
	/** Hardest work intensity across the work blocks, when comparable. */
	peak: Magnitude | null
}

function workProfile(structure: WorkoutStructure): WorkProfile {
	const blocksWithWork = structure.blocks
		.map((b) => ({ block: b, work: blockWorkStep(b) }))
		.filter(
			(b): b is { block: StructureBlock; work: WorkStep } => b.work != null,
		)

	const repeated = blocksWithWork.filter((b) => b.block.repeatCount >= 2)

	let workBlocks: Array<{ block: StructureBlock; work: WorkStep }>
	let repCount: number
	if (repeated.length > 0) {
		// An interval structure: every repeated block is work; the flanking
		// warm-up / cool-down (repeat 1, easier) are not.
		workBlocks = repeated
		repCount = repeated.reduce((n, b) => n + b.block.repeatCount, 0)
	} else if (blocksWithWork.length > 0) {
		// A sustained / steady structure: the single hardest (then longest) block
		// is the one work effort; warm-up and cool-down fall away as not-hardest.
		const pick = blocksWithWork.reduce((a, b) => {
			const av = a.work.magnitude?.value ?? -Infinity
			const bv = b.work.magnitude?.value ?? -Infinity
			if (bv !== av) return bv > av ? b : a
			return (b.work.durationSec ?? 0) > (a.work.durationSec ?? 0) ? b : a
		})
		workBlocks = [pick]
		repCount = 1
	} else {
		workBlocks = []
		repCount = 0
	}

	const workDurations = workBlocks
		.map((b) => b.work.durationSec)
		.filter((d): d is number => d != null && d > 0)

	let peak: Magnitude | null = null
	for (const b of workBlocks) {
		const m = b.work.magnitude
		if (
			m &&
			(peak == null || (m.scale === peak.scale && m.value > peak.value))
		) {
			// Keep a single comparable peak: adopt the first, then only raise it
			// within the same scale (mixed-scale structures leave peak on the first).
			if (peak == null || m.scale === peak.scale) peak = m
		}
	}
	return { repCount, workDurations, peak }
}

function median(xs: number[]): number | null {
	if (xs.length === 0) return null
	const sorted = [...xs].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2
		? sorted[mid]!
		: (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Compare a plan-blind detected structure against its prescription into a single
 * whole-session verdict (ADR 0034). Pure: never mutates its inputs, never reads
 * Planned TSS or Training Load. See {@link StructureAdherenceVerdict}.
 */
export function structureAdherence(
	detected: WorkoutStructure,
	planned: WorkoutStructure,
): StructureAdherenceVerdict {
	const d = workProfile(detected)
	const p = workProfile(planned)

	// No resolvable work on either side → nothing to honestly verify.
	if (p.repCount === 0 || d.repCount === 0) return 'not-verifiable'

	// Surplus detected reps the plan did not prescribe — a real divergence.
	if (d.repCount - p.repCount > REP_SURPLUS_TOLERANCE) return 'diverged'

	// Detection found fewer reps than planned — indistinguishable from detector
	// blindness, so never charged to the athlete (ADR 0008).
	if (p.repCount - d.repCount > REP_DEFICIT_TOLERANCE) return 'not-verifiable'

	// Counts corroborate. A clearly-higher measured intensity on a comparable
	// channel is a safe-to-assert divergence (went harder than prescribed).
	if (
		d.peak != null &&
		p.peak != null &&
		d.peak.scale === p.peak.scale &&
		p.peak.value !== 0
	) {
		const rel = (d.peak.value - p.peak.value) / Math.abs(p.peak.value)
		if (rel > INTENSITY_SURPLUS_MARGIN) return 'diverged'
	}

	// Confirm `as-prescribed` only when work durations also broadly align; a wide
	// gap (usually merged reps) can only be honestly reported as not-verifiable.
	const dMed = median(d.workDurations)
	const pMed = median(p.workDurations)
	if (dMed != null && pMed != null && pMed > 0) {
		if (Math.abs(dMed - pMed) / pMed > WORK_DURATION_TOLERANCE) {
			return 'not-verifiable'
		}
	}

	return 'as-prescribed'
}

/** How a verdict reads in the UI — a label and a one-line description. The
 * verdict itself is the styling key (see the caller's tone palette). */
export type StructureAdherenceDescription = {
	label: string
	description: string
}

/**
 * The plain-language rendering of a verdict (the structural mirror of
 * `adherenceBand`). `not-verifiable` is an honest **Unavailable Metric**, never
 * a failing grade.
 */
export function describeStructureAdherence(
	verdict: StructureAdherenceVerdict,
): StructureAdherenceDescription {
	switch (verdict) {
		case 'as-prescribed':
			return {
				label: 'As prescribed',
				description: 'matched the planned structure',
			}
		case 'diverged':
			// Covers both asserted paths (ADR 0034): surplus reps and same-count but
			// clearly-higher measured intensity.
			return {
				label: 'Diverged',
				description: 'exceeded the prescribed structure',
			}
		case 'not-verifiable':
			return {
				label: 'Not verifiable',
				description: 'structure not confidently verifiable',
			}
	}
}
