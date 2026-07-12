/**
 * The Workout Shape strip derivation (#258, spec §8): the honest,
 * height-profiled segment model behind the read-only preview under the Token
 * Sentence. Pure — the same normalized `NotationInput` both the draft editor
 * and the persisted detail view already build.
 *
 * Honesty rules (§8.1):
 * - Nothing is fabricated. A step with neither quantity nor intensity yields
 *   no segment; zero paintable steps yield an empty list (callers render no
 *   preview region at all). The old intent-fallback bar does not exist here.
 * - Widths are time-true where time resolves: durations directly; distance
 *   via the pace the step's intensity resolves to (falling back to the
 *   athlete's threshold pace); reps-based strength via Planned-TSS-style
 *   fixed estimates. When nothing resolves, a segment gets the fixed nominal
 *   width — never a sliver.
 * - Heights follow the intensity ladder (§8.2): zone steps 1–5 at 30→100 %,
 *   rest lowest, unknown intensity at a fixed nominal 55 % — strength as
 *   muted solid, an authored-but-unresolvable zone hatched. Zone equivalence
 *   comes from the shared `zoneEquivalent` bucketing (§7.1/§7.4), so the
 *   strip and the sentence's chip tint can never disagree.
 */
import { type DisciplineThresholdMap } from './intensity-target.ts'
import { type TrainingZone } from './session-profile.ts'
import {
	type NotationInput,
	type NotationSet,
	type NotationStep,
} from './workout-notation.ts'
import { type IntensityTarget } from './workout-schema.ts'
import { zoneEquivalent } from './zone-equivalent.ts'
import { resolveIntensity } from './zones/index.ts'

/** Heights of the five zone steps, % of the strip (Z1 30 % → Z5 100 %). */
export const ZONE_HEIGHT_PCT: Record<TrainingZone, number> = {
	1: 30,
	2: 47.5,
	3: 65,
	4: 82.5,
	5: 100,
}

/** Rest segments sit lowest — clearly beneath the easiest zone. */
export const REST_HEIGHT_PCT = 16

/** The fixed nominal height for unknown intensity — a convention, never a guess. */
export const UNKNOWN_HEIGHT_PCT = 55

/**
 * The fixed nominal width weight (in the strip's seconds scale) for a segment
 * whose time can't be resolved — wide enough to read, never a sliver.
 */
export const NOMINAL_WIDTH_SEC = 300

/** Planned-TSS-style working-time estimate for one rep of a strength set. */
export const SECONDS_PER_REP = 4

/** Planned-TSS-style working-time estimate for an AMRAP set. */
export const AMRAP_SET_SEC = 45

export type ShapeSegmentFill =
	/** A resolved zone step — solid zone hue. */
	| 'zone'
	/** No zone statement at all (rest, strength, quantity-only) — muted solid. */
	| 'muted'
	/** An authored intensity that can't resolve to a zone — hatched. */
	| 'hatched'

export type ShapeSegment = {
	id: string
	/** Relative width weight: resolved/estimated seconds, or the nominal. */
	weightSec: number
	/** True when nothing resolved to time and the fixed nominal width applies. */
	nominalWidth: boolean
	/** Height as % of the strip (bottom-aligned). */
	heightPct: number
	fill: ShapeSegmentFill
	/** The zone-equivalent step behind a `zone` fill; null otherwise. */
	zone: TrainingZone | null
}

/** The pace a step's intensity resolves to (midpoint), in the resolver's own
 * unit — sec/km for pace-anchored recipes, sec/100 m for CSS. */
function resolvedPaceMid(
	intensity: IntensityTarget | null | undefined,
	profile: DisciplineThresholdMap[string],
): number | null {
	if (!intensity || !profile) return null
	const resolved = resolveIntensity(intensity, profile)
	if (resolved.unavailable) return null
	if (resolved.paceMin != null && resolved.paceMax != null) {
		return (resolved.paceMin + resolved.paceMax) / 2
	}
	return resolved.paceMin ?? resolved.paceMax ?? null
}

/**
 * A distance step's time, via the athlete's pace: the pace the intensity
 * resolves to when there is one, else the discipline's threshold pace. Swim
 * paces are sec/100 m; every other discipline's are sec/km.
 */
function distanceDurationSec(
	step: NotationStep,
	profile: DisciplineThresholdMap[string],
): number | null {
	if (step.distanceM == null) return null
	const swim = step.discipline === 'swim'
	const pace =
		resolvedPaceMid(step.intensity, profile) ??
		(swim ? profile?.cssSecPer100m : profile?.thresholdPaceSecPerKm) ??
		null
	if (pace == null) return null
	return swim ? (step.distanceM / 100) * pace : (step.distanceM / 1000) * pace
}

function setDurationSec(set: NotationSet): number {
	switch (set.kind) {
		case 'reps':
			return (set.reps ?? 0) * SECONDS_PER_REP
		case 'timed':
			return set.durationSec ?? 0
		case 'amrap':
			return AMRAP_SET_SEC
	}
}

/** Planned-TSS-style strength time estimate: working sets plus the rests
 * between them. Null when the sets estimate to nothing. */
function strengthDurationSec(step: NotationStep): number | null {
	const sets = step.sets ?? []
	if (sets.length === 0) return null
	const work = sets.reduce((sum, set) => sum + setDurationSec(set), 0)
	const rest =
		step.restBetweenSetsSec && sets.length > 1
			? step.restBetweenSetsSec * (sets.length - 1)
			: 0
	const total = work + rest
	return total > 0 ? total : null
}

/** Whether a strength step states a quantity at all — authored sets are its
 * quantity even while none of them estimates to time yet. */
function strengthHasQuantity(step: NotationStep): boolean {
	return (step.sets ?? []).length > 0
}

/** A step's paintable statement, or null when it makes none (§8.1). */
function toSegment(
	step: NotationStep,
	id: string,
	thresholds: DisciplineThresholdMap,
): ShapeSegment | null {
	const profile = step.discipline ? thresholds[step.discipline] : undefined

	if (step.kind === 'rest') {
		if (step.durationSec == null) return null
		return {
			id,
			weightSec: step.durationSec,
			nominalWidth: false,
			heightPct: REST_HEIGHT_PCT,
			fill: 'muted',
			zone: null,
		}
	}

	if (step.kind === 'strength') {
		// Authored sets are the step's quantity even when none of them
		// estimates to time yet — then it keeps the nominal width, never a
		// sliver, never absent.
		if (!strengthHasQuantity(step)) return null
		const durationSec = strengthDurationSec(step)
		return {
			id,
			weightSec: durationSec ?? NOMINAL_WIDTH_SEC,
			nominalWidth: durationSec == null,
			heightPct: UNKNOWN_HEIGHT_PCT,
			fill: 'muted',
			zone: null,
		}
	}

	// Cardio: paintable when it has a quantity or an authored intensity. A
	// half-typed intensity draft is not a statement yet.
	const hasQuantity = step.durationSec != null || step.distanceM != null
	if (!hasQuantity && step.intensity == null) return null

	const durationSec = step.durationSec ?? distanceDurationSec(step, profile)

	let heightPct: number = UNKNOWN_HEIGHT_PCT
	let fill: ShapeSegmentFill = 'muted'
	let zone: TrainingZone | null = null
	if (step.intensity) {
		const equivalent = zoneEquivalent(step.intensity, profile)
		if (equivalent.step != null) {
			zone = equivalent.step
			heightPct = ZONE_HEIGHT_PCT[equivalent.step]
			fill = 'zone'
		} else {
			fill = 'hatched'
		}
	}

	return {
		id,
		weightSec: durationSec ?? NOMINAL_WIDTH_SEC,
		nominalWidth: durationSec == null,
		heightPct,
		fill,
		zone,
	}
}

/**
 * Derive the strip's segments from the normalized notation input: blocks in
 * order, each expanded `repeatCount` times, steps in order — one segment per
 * paintable executed step. An empty result means the preview region is absent.
 */
export function deriveShapeStrip(
	input: NotationInput,
	options: { thresholds?: DisciplineThresholdMap } = {},
): ShapeSegment[] {
	const thresholds = options.thresholds ?? {}
	return input.blocks.flatMap((block, blockIndex) =>
		Array.from({ length: Math.max(block.repeatCount, 1) }, (_, repeatIndex) =>
			block.steps.flatMap((step, stepIndex) => {
				const segment = toSegment(
					step,
					`${blockIndex}-${repeatIndex}-${stepIndex}`,
					thresholds,
				)
				return segment ? [segment] : []
			}),
		).flat(),
	)
}
