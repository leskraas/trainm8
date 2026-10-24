/**
 * Derived session titles — the pure, display-only naming of a session from what
 * it actually is, so a session never falls back to a bare "Detected structure"
 * or "Recording". Two sources, two functions:
 *
 * - `deriveWorkoutTitle` names a session that has a **structure** (a Structure
 *   Detection's materialized Workout, or an authored/generated one) from its
 *   headline block — `4 × 6 min`, `45 min rolig`.
 * - `deriveRecordingTitle` names a **structureless recording** (a steady run/
 *   ride Structure Detection left `recorded`) from its duration/distance and
 *   discipline — `45 min run`, `8.2 km ride`.
 *
 * Honest per ADR 0008 / GLOSSARY.md: the intensity word only appears when the
 * target carries an *intrinsic* zone (a zone label, an RPE, a %-of-threshold).
 * A measured target — power/pace/HR, which is exactly what the detection engine
 * stores — is left wordless rather than back-classified into a fabricated zone.
 * All quantities render through the shared `format` layer (the en-GB house
 * format, ADR 0023).
 */

import { formatDistance, formatDuration } from './format.ts'
import {
	getDisciplineLabel,
	NB_DISCIPLINE_LABELS,
	STAMPED_SESSION_LABELS,
	zoneLabelWord,
} from './labels.ts'
import { type QualityZone } from './plan-outline/quality-mix.ts'
import { intensityTargetToZone } from './session-profile.ts'
import {
	type IntensityTarget,
	type WorkoutStructure,
} from './workout-schema.ts'
import { ZONE_WORDS } from './zones/words.ts'

type WorkoutBlock = WorkoutStructure['blocks'][number]
type CardioStep = Extract<WorkoutBlock['steps'][number], { kind: 'cardio' }>

/**
 * The zone word a target contributes to a title, or null when none can be named
 * honestly — lowercase, as the stamp and the sentence write it (`45 min rolig`
 * under `Legg til 45 min rolig`). A zone label is its own word in Norwegian
 * (`threshold` → `terskel`), and a recipe's code (`Z4`, `T`) stays as written;
 * RPE and %-targets carry an intrinsic zone, written as that zone's word
 * (`zones/words.ts`), never `Z3`; a measured power/pace/HR target does not, so
 * it stays wordless — never guessed from the raw value.
 */
function intensityWord(target: IntensityTarget): string | null {
	if (target.kind === 'zoneLabel') {
		const label = target.label.trim()
		const word = zoneLabelWord(label)
		// A code is its own spelling; a word is the lowercase word it reads as.
		const isCode = word === label && label !== label.toLowerCase()
		return isCode ? label : word.toLowerCase() || null
	}
	const zone = intensityTargetToZone(target)
	return zone != null ? ZONE_WORDS[zone] : null
}

function isCardioStep(step: WorkoutBlock['steps'][number]): step is CardioStep {
	return step.kind === 'cardio'
}

/** The first cardio (work) step of a block, or null for a block of rests. */
function firstCardioStep(block: WorkoutBlock): CardioStep | null {
	return block.steps.find(isCardioStep) ?? null
}

/** A cardio step's quantity as display text: its duration, else its distance. */
function stepQuantity(step: CardioStep): string | null {
	if (step.durationSec != null) return formatDuration(step.durationSec)
	if (step.distanceM != null) return formatDistance(step.distanceM)
	return null
}

/** A comparable magnitude for picking the "main" steady step (units are only
 * ever compared within one structure, so mixing duration and distance is fine
 * as a tiebreak). */
function stepMagnitude(step: CardioStep): number {
	return step.durationSec ?? step.distanceM ?? 0
}

/**
 * Whether a step can put anything in the title — a quantity, or an honest zone
 * word. A measured-target step with no duration/distance contributes nothing, so
 * it must not shadow a later block that could actually name the session.
 */
function stepContributes(step: CardioStep): boolean {
	return (
		stepQuantity(step) != null ||
		(step.intensity != null && intensityWord(step.intensity) != null)
	)
}

/**
 * Name a workout from its headline block: the first repeat block (an interval
 * set), else the block carrying the longest single effort. The rep count and
 * the work step's quantity are always honest; the intensity word appears only
 * when the target names a zone. Degrades to the discipline noun rather than an
 * empty string when there is no cardio step to describe.
 */
export function deriveWorkoutTitle(structure: WorkoutStructure): string {
	const withCardio = structure.blocks
		.map((block) => ({ block, step: firstCardioStep(block) }))
		.filter((entry): entry is { block: WorkoutBlock; step: CardioStep } =>
			Boolean(entry.step),
		)

	if (withCardio.length === 0) return getDisciplineLabel(structure.discipline)

	// Prefer blocks that can actually name the session; only if none can do we
	// fall back to the whole set (which then yields the discipline noun).
	const informative = withCardio.filter(({ step }) => stepContributes(step))
	const pool = informative.length > 0 ? informative : withCardio

	// Either repeat level makes a block the repeated one: `1 × … × 3 series`
	// is three efforts.
	const repeated = (block: (typeof pool)[number]['block']) =>
		block.repeatCount >= 2 || (block.seriesRepeatCount ?? 1) >= 2
	const headline =
		pool.find(({ block }) => repeated(block)) ??
		pool.reduce((best, entry) =>
			stepMagnitude(entry.step) > stepMagnitude(best.step) ? entry : best,
		)

	const quantity = stepQuantity(headline.step)
	const reps = headline.block.repeatCount
	// The series lead the reps: `3 × 13 × 30 s` is three series of 13 (#615).
	const series = headline.block.seriesRepeatCount ?? 1
	const count =
		series >= 2 ? (reps >= 2 ? `${series} × ${reps}` : `${series}`) : `${reps}`
	// A dangling `4 ×` (a repeat block whose work step states no quantity) reads
	// worse than the plain zone word or discipline fallback, so the rep count
	// only appears when it has a quantity to multiply.
	const core = quantity
		? repeated(headline.block)
			? `${count} × ${quantity}`
			: quantity
		: ''
	const word = headline.step.intensity
		? intensityWord(headline.step.intensity)
		: null

	const title = [core, word].filter(Boolean).join(' ').trim()
	return title || getDisciplineLabel(structure.discipline)
}

/**
 * Name a structureless recording from its duration (preferred) or distance and
 * its discipline: `45 min run`, `8.2 km ride`. No intensity word — a bare
 * recording carries no resolved zone to assert one from. Degrades to the
 * discipline noun when neither duration nor distance is known.
 */
export function deriveRecordingTitle(recording: {
	discipline: string
	durationSec: number | null
	distanceM: number | null
}): string {
	const noun = getDisciplineLabel(recording.discipline)
	const quantity =
		recording.durationSec != null
			? formatDuration(recording.durationSec)
			: recording.distanceM != null
				? formatDistance(recording.distanceM)
				: null
	return quantity ? `${quantity} ${noun.toLowerCase()}` : noun
}

/**
 * The Norwegian title of a session the plan lays from a bare share of the
 * week (round 2, #505 story 68): what kind of session it is, then the sport —
 * `Rolig økt · Løping`, `Langtur · Løping`, `Terskeløkt · Sykling`.
 *
 * A separate path from {@link deriveWorkoutTitle} on purpose: that one names
 * a *structure* from its quantities (`1 h 48 min`) through `getDisciplineLabel`,
 * whose English words other stored titles depend on, and a bare share has no
 * structure worth naming — its duration is on every surface already. This one
 * names the session from the plan's own facts: the long day (`role`) and the
 * quality zone the stamp gave it from the week's mix (`zone`). The first run's
 * preview calls it too, so what step 5 shows is what lands on I dag.
 */
export function stampedSessionTitle({
	discipline,
	role,
	zone,
}: {
	discipline: string
	role: 'long' | 'ordinary'
	zone: QualityZone | null
}): string {
	const kind =
		zone != null
			? STAMPED_SESSION_LABELS.zone[zone]
			: role === 'long'
				? discipline === 'swim'
					? STAMPED_SESSION_LABELS.longSwim
					: STAMPED_SESSION_LABELS.long
				: STAMPED_SESSION_LABELS.easy
	const sport = (NB_DISCIPLINE_LABELS as Record<string, string | undefined>)[
		discipline
	]
	return sport ? `${kind} · ${sport}` : kind
}
