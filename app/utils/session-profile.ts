import { z } from 'zod/v3'
import { type LedgerSession } from './ledger-session.ts'
import { perStep, stepDurationSec, workoutReps } from './workout-reps.ts'
import {
	blockRepeatTotal,
	IntensityTargetSchema,
	type IntensityTarget,
} from './workout-schema.ts'
import { ZONE_WORDS } from './zones/words.ts'

/** The persisted Workout row tree the Workout Shape derives from (exported so
 * the draft→shape adapter in `workout-notation` can build the same shape). */
export type Workout = NonNullable<LedgerSession['workout']>
type WorkoutStep = Workout['blocks'][number]['steps'][number]

/** A normalized training zone, 1 (easiest) through 5 (hardest). */
export type TrainingZone = 1 | 2 | 3 | 4 | 5

const isTrainingZone = (value: unknown): value is TrainingZone =>
	value === 1 || value === 2 || value === 3 || value === 4 || value === 5

export const ProfileBarSchema = z.object({
	id: z.string(),
	/** The derived training zone, or null when intensity can't be truthfully mapped to a zone. */
	zone: z.custom<TrainingZone>(isTrainingZone).nullable(),
	/** Relative weight for bar width — the segment's duration in seconds (0 when unquantified). */
	durationSec: z.number(),
})
export type ProfileBar = z.infer<typeof ProfileBarSchema>

/**
 * {@link ProfileBarSchema}'s check, written out: every completed session's
 * stored profile is read on opening I dag's full view, twice (its week's
 * volumes and its row's bars), and zod's object and union parsing was the
 * biggest piece of the season presenter after its formatters (#503). Like the
 * schema it keeps only the three fields.
 */
function readProfileBar(value: unknown): ProfileBar | null {
	if (typeof value !== 'object' || value === null) return null
	const { id, zone, durationSec } = value as Record<string, unknown>
	if (typeof id !== 'string') return null
	if (zone !== null && !isTrainingZone(zone)) return null
	if (typeof durationSec !== 'number' || Number.isNaN(durationSec)) return null
	return { id, zone, durationSec }
}

/**
 * Parse the JSON profile stored on a recording (`ActivityImport.phaseBarsJson`),
 * tolerating malformed/legacy data by returning an empty profile (rendered as a
 * muted "—") rather than throwing.
 */
export function parseRecordingPhaseBars(
	json: string | null | undefined,
): ProfileBar[] {
	if (!json) return []
	let parsed: unknown
	try {
		parsed = JSON.parse(json)
	} catch {
		return []
	}
	if (!Array.isArray(parsed)) return []
	const bars: ProfileBar[] = []
	for (const item of parsed) {
		const bar = readProfileBar(item)
		if (!bar) return []
		bars.push(bar)
	}
	return bars
}

/**
 * A repeat-group bracket over a contiguous run of profile bars: the bars a
 * `repeatCount > 1` block expands into, annotated `× N` in the Workout Shape.
 * Purely additive — renderings without groups draw exactly as before.
 */
export type ProfileBarGroup = {
	/** Index of the first bar the group spans (into `SessionProfile.bars`). */
	startIndex: number
	/** Number of consecutive bars the group spans (repeatCount × steps). */
	span: number
	/** The block's repeat count, rendered as `× N`. */
	repeatCount: number
}

export type SessionProfile = {
	bars: ProfileBar[]
	/** Repeat-group brackets over the bars; empty when no block repeats. */
	groups: ProfileBarGroup[]
}

/** Each stored zone word (`zones/words.ts`) back to its Training Zone. */
const STORED_WORD_ZONES = new Map(
	Object.entries(ZONE_WORDS).map(
		([zone, word]) => [word, Number(zone) as TrainingZone] as const,
	),
)

function clampZone(n: number): TrainingZone {
	if (n <= 1) return 1
	if (n >= 5) return 5
	return n as TrainingZone
}

/**
 * The Training Zone a zone label names without reading any recipe: a `Z1…Z7`
 * code (clamped to 5), a generic word, or a band label that means the same zone
 * on every recipe that has it (Daniels/Norwegian `E M sub-T T I`, OLT
 * `I-1…I-5`). Daniels' `R` declares no zone (ADR 0042 §7), so it stays null.
 * `resolveIntensity` reads a label that is not the athlete's own band label
 * through this (#614).
 */
export function zoneLabelToZone(label: string): TrainingZone | null {
	const trimmed = label.trim()
	switch (trimmed) {
		case 'E':
			return 2
		case 'M':
			return 3
		case 'sub-T':
		case 'T':
			return 4
		case 'I':
			return 5
	}
	const normalized = trimmed.toLowerCase()
	const zMatch = /^z\s*([1-7])$/.exec(normalized)
	if (zMatch) return clampZone(Number(zMatch[1]))
	const oltMatch = /^i-([1-5])$/.exec(normalized)
	if (oltMatch) return Number(oltMatch[1]) as TrainingZone
	// The zone words the writing line, the day stamp and an eased session store
	// (#627), read from the one list that writes them.
	const stored = STORED_WORD_ZONES.get(normalized)
	if (stored != null) return stored
	switch (normalized) {
		// The generic English vocabulary, and the older Norwegian `restitusjon`.
		case 'restitusjon':
		case 'recovery':
			return 1
		// `easy` is zone 2, as Daniels' `E` band ("easy") declares (#607).
		case 'easy':
		case 'zone2':
		case 'endurance':
			return 2
		case 'moderate':
		case 'tempo':
			return 3
		case 'threshold':
			return 4
		case 'vo2max':
		case 'anaerobic':
		case 'max':
			return 5
		default:
			return null
	}
}

function rpeToZone(min: number): TrainingZone {
	if (min <= 2) return 1
	if (min <= 4) return 2
	if (min <= 6) return 3
	if (min <= 8) return 4
	return 5
}

// Coggan %FTP zones, normalized to threshold so no athlete-specific data is invented.
// Exported so recordings can bucket actual %threshold effort with the same boundaries.
export function pctToZone(pct: number): TrainingZone {
	if (pct < 55) return 1
	if (pct < 76) return 2
	if (pct < 91) return 3
	if (pct < 106) return 4
	return 5
}

/**
 * Map an authored Intensity Target to the normalized training zone it centres
 * on, or null when it can't be truthfully mapped without athlete thresholds
 * (absolute pace/HR/watts stay honestly unzoned). Shared by the Workout Shape
 * (`stepToZone`) and the Workout Notation's zone-chip facet so both derive the
 * same zone from the same target.
 */
export function intensityTargetToZone(
	target: IntensityTarget,
): TrainingZone | null {
	switch (target.kind) {
		case 'zoneLabel':
			return zoneLabelToZone(target.label)
		case 'rpe':
			return rpeToZone(target.min)
		case 'powerPct':
		case 'hrPct':
			return pctToZone(target.minPct)
		// hrBpm, power (W) and pace need athlete thresholds to map to a
		// zone; leaving them unzoned keeps the profile honest.
		default:
			return null
	}
}

function stepToZone(step: WorkoutStep): TrainingZone | null {
	if (step.kind !== 'cardio') return null
	if (!step.intensity) return null
	return intensityZone(step.intensity)
}

/**
 * Each stored intensity's zone, read once. A season reads the same few
 * intensities thousands of times (every rep of every step, for the week's zone
 * split and again for a row's bars), and parsing one each time was the biggest
 * piece left of opening the 52-week Stream (#503, ADR 0122). Bounded, because
 * an intensity is text the athlete may have written: past the cap it starts
 * over.
 */
const INTENSITY_ZONES = new Map<string, TrainingZone | null>()
const INTENSITY_ZONES_MAX = 512

function intensityZone(intensity: string): TrainingZone | null {
	const known = INTENSITY_ZONES.get(intensity)
	if (known !== undefined) return known
	const zone = readIntensityZone(intensity)
	if (INTENSITY_ZONES.size >= INTENSITY_ZONES_MAX) INTENSITY_ZONES.clear()
	INTENSITY_ZONES.set(intensity, zone)
	return zone
}

function readIntensityZone(intensity: string): TrainingZone | null {
	// A structured target is a JSON object; a legacy plain word is not JSON, and
	// throwing on it costs more than the rest of the read together.
	if (intensity.trimStart().startsWith('{')) {
		try {
			const parsed = IntensityTargetSchema.safeParse(JSON.parse(intensity))
			if (parsed.success) return intensityTargetToZone(parsed.data)
		} catch {
			// fall through to legacy plain-string matching
		}
	}
	return zoneLabelToZone(intensity)
}

/**
 * The **Workout Shape**'s zone for one step: the zone its authored intensity
 * names, the workout's intent (`fallback`) where a cardio step states none,
 * and null otherwise — a strength or rest step, or a target that cannot be
 * zoned without thresholds. The one step zone rule the shape's bars and I
 * dag's Effort Word both read (#638).
 */
export function shapeZone(
	step: WorkoutStep,
	fallback: TrainingZone | null,
): TrainingZone | null {
	if (step.kind !== 'cardio') return null
	return step.intensity ? stepToZone(step) : fallback
}

/** One executed step in workout order, carrying the original Step so callers can
 * read its resolved Intensity Target alongside the derived zone and duration. */
export type ExpandedStep = {
	id: string
	zone: TrainingZone | null
	durationSec: number
	step: WorkoutStep
}

/**
 * Expand a workout into the ordered sequence of steps it actually executes:
 * blocks in order, each repeated `repeatCount` times, steps in order. Every rep,
 * unbounded, so bound the workout before calling it; what is *drawn* — the
 * Workout Shape and the telemetry overlay's planned bands — reads
 * `workoutReps`, which thins a dense plan the same way for both.
 */
export function expandWorkoutSteps(workout: Workout | null): ExpandedStep[] {
	if (!workout) return []
	return workout.blocks
		.slice()
		.sort((a, b) => a.orderIndex - b.orderIndex)
		.flatMap((block) => {
			const sortedSteps = block.steps
				.slice()
				.sort((a, b) => a.orderIndex - b.orderIndex)
			const repeats = blockRepeatTotal(block)
			return Array.from({ length: repeats }, (_, repeatIndex) =>
				sortedSteps.map((step) => ({
					id: repeats > 1 ? `${step.id}-r${repeatIndex}` : step.id,
					zone: stepToZone(step),
					durationSec: stepDurationSec(step),
					step,
				})),
			).flat()
		})
}

/**
 * Map a workout's authored intent to the training zone that effort centres on.
 * The intent is the athlete's own declaration of the session's purpose, so a
 * zone derived from it is prescription data, not a fabricated measurement.
 * Strength intents map to no cardio zone.
 */
export function intentToZone(
	intent: string | null | undefined,
): TrainingZone | null {
	switch (intent) {
		case 'recovery':
		case 'technique':
		case 'mobility':
			return 1
		case 'endurance':
			return 2
		case 'tempo':
			return 3
		case 'threshold':
		case 'race':
		case 'test':
			return 4
		case 'vo2max':
		case 'anaerobic':
		case 'neuromuscular':
			return 5
		default:
			return null
	}
}

/**
 * The repeat-group brackets over a workout's bars: one per block with
 * `repeatCount > 1`, spanning the bars that block is drawn with. Read off the
 * same `workoutReps` walk as the bars, so the `startIndex`/`span` line up with
 * them by construction, thinned block or not.
 */
export function deriveRepeatGroups(workout: Workout | null): ProfileBarGroup[] {
	return workoutReps(workout).groups
}

/**
 * Derive the per-session intensity profile from a workout's real steps: one bar
 * per drawn step (`workoutReps`: every rep while that fits, a dense block
 * thinned to the reps that do, each carrying its share of the time), colored
 * by training zone and weighted by Step Duration.
 *
 * So every workout carries a shape: a cardio step with *no authored intensity
 * at all* falls back to the workout's intent zone (the only prescription that
 * exists for it), and a step-less workout collapses to a single intent-zone
 * bar. A step whose *authored* target merely can't be mapped without athlete
 * thresholds (absolute pace/HR/watts) stays honestly unzoned — the fallback
 * never overrides an explicit target.
 */
export function deriveSessionProfile(workout: Workout | null): SessionProfile {
	const fallbackZone = intentToZone(workout?.intent)
	const { steps, groups } = workoutReps(workout)
	const zoneOf = perStep((step: WorkoutStep) => shapeZone(step, fallbackZone))
	const bars = steps.map(({ id, step, durationSec }) => ({
		id,
		zone: zoneOf(step),
		durationSec,
	}))
	if (bars.length === 0 && workout && fallbackZone != null) {
		return {
			bars: [{ id: 'intent', zone: fallbackZone, durationSec: 1 }],
			groups: [],
		}
	}
	return { bars, groups }
}
