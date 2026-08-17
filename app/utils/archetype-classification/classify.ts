import { type SessionArchetype } from '../catalogue.ts'
import { type DetectionGrade } from '../structure-detection/types.ts'
import {
	ANAEROBIC_MIN_MEAN_ZONE,
	ANAEROBIC_MIN_REST_RATIO,
	ANAEROBIC_REP_SEC,
	BRICK_MAX_GAP_SEC,
	EASY_MAX_Z2_FRAC,
	EASY_MAX_Z3_FRAC,
	FARTLEK_MIN_MIXED_FRAC,
	FARTLEK_MIN_REP_CV,
	FARTLEK_MIN_REPS,
	LONG_ABS_MIN_SEC,
	LONG_REL_MULTIPLE,
	NEURO_MAX_TOTAL_WORK_SEC,
	NEURO_MIN_REST_RATIO,
	NEURO_REP_SEC,
	RECOVERY_MAX_IF,
	RECOVERY_MAX_SEC,
	SUBTHRESHOLD_MAX_MEAN_ZONE,
	SUBTHRESHOLD_MAX_REST_RATIO,
	SUBTHRESHOLD_MIN_REPS,
	SUBTHRESHOLD_MIN_TOTAL_WORK_SEC,
	TEMPO_IF_BAND,
	TEMPO_MIN_Z2_FRAC,
	THRESHOLD_MAX_MEAN_ZONE,
	THRESHOLD_MIN_MEAN_ZONE,
	THRESHOLD_REP_SEC,
	TT_MIN_IF,
	VO2_LONG_REP_SEC,
	VO2_MIN_MEAN_ZONE,
	VO2_SHORT_MAX_REST_RATIO,
	VO2_SHORT_MIN_REPS,
	VO2_SHORT_REP_SEC,
} from './constants.ts'
import {
	type ArchetypeInput,
	type ArchetypeReading,
	type ArchetypeRefusal,
	type StructureReading,
} from './types.ts'

/**
 * Read what kind of session a completed recording was — the **Session
 * Archetype** axis, derived (ADR 0055; `workout-taxonomy.md` §8).
 *
 * Pure in the sense the season generator and `analyze()` are: it reads no clock,
 * queries nothing, mutates nothing, and has no random source. The caller reduces
 * the session to an `ArchetypeInput` and this decides.
 *
 * **It refuses rather than guesses.** Every branch that needs a fact it does not
 * have returns an `unclassified` naming the missing call, and the two hardest
 * cases are refusals by design rather than by omission: `easy` versus `long` is
 * refused without the athlete's own 28-day window, and `tempo` versus `steady` is
 * refused always, because telemetry cannot separate them.
 *
 * **Never call this when an archetype is authored.** §8.2's branch 0 lives at the
 * call site: an authored `Workout.archetype` is the athlete's own statement and
 * wins outright, so the reader is simply not consulted. That is why no
 * `plannedArchetype` field reaches this function — it cannot overrule a plan it
 * cannot see.
 *
 * Branch order is load-bearing and follows §8.3: neuromuscular before every other
 * structured branch, and sub-threshold before threshold.
 */
export function classifyArchetype(input: ArchetypeInput): ArchetypeReading {
	// 1. Two disciplines with no real break between them is a brick whatever the
	//    intensity did — the changeover is the physiologically interesting part
	//    (Millet & Vleck 2000), and it is the one archetype the discipline-on-the-
	//    step decision (ADR 0007) already represents and only lacks a name for.
	if (isBrick(input)) {
		return graded(input, 'brick', ['two disciplines, no break between them'])
	}

	// 2. A near-maximal effort held rather than repeated is a test, whatever the
	//    athlete called it: the session's output is a number.
	if (
		input.intensityFactor != null &&
		input.intensityFactor >= TT_MIN_IF &&
		countReps(input.structure) <= 1
	) {
		return graded(input, 'test', ['near-maximal sustained effort'])
	}

	// 3. No set to read: fall back to duration and intensity alone.
	if (input.structure == null) return readUnstructured(input)

	return readGeometry(input, input.structure)
}

// ---------------------------------------------------------------------------
// The unstructured path — duration and intensity only
// ---------------------------------------------------------------------------

/**
 * What the session was, read without a set: `recovery`, `long`, `easy`, or a
 * refusal. Also the base reading a neuromuscular modifier attaches to, which is
 * why it is a function of its own (§8.2's `classifyIgnoringBlocks`).
 */
function readUnstructured(input: ArchetypeInput): ArchetypeReading {
	const tiz = input.timeInZone
	if (tiz == null) {
		return refused('no-signal', [
			'no set was detected and no time-in-zone profile could be built, so there is nothing to read',
		])
	}
	const abovelt1 = tiz.z2Frac + tiz.z3Frac

	// Recovery is defined by its ceiling: short, capped, and nothing above LT1.
	if (
		abovelt1 <= EASY_MAX_Z3_FRAC * 2 &&
		input.movingSec <= RECOVERY_MAX_SEC &&
		input.intensityFactor != null &&
		input.intensityFactor <= RECOVERY_MAX_IF
	) {
		return graded(input, 'recovery', ['short, capped intensity, no structure'])
	}

	// Easy and long occupy the same zone; only the athlete's own recent volume
	// separates them. The absolute floor is what makes the refusal narrow: below
	// it, nothing is long for anybody, so `easy` needs no window. At or above it
	// the session is genuinely either, and without the window this is a coin flip.
	//
	// §8.2 orders `isLong` before `easy` and returns false when the window is
	// missing, which quietly answers `easy` for a three-hour run. That is the one
	// place the pseudocode guesses, and this deviates from it deliberately.
	const longEnoughToBeEither = input.movingSec >= LONG_ABS_MIN_SEC
	if (longEnoughToBeEither && input.context.medianSessionSec28d == null) {
		return refused('no-week-context', [
			`${formatMinutes(input.movingSec)} is long enough to be either an easy session or a long one`,
			'which of the two it was depends on the athlete’s own recent volume, and no 28-day window is known',
		])
	}
	if (longEnoughToBeEither && isLong(input)) {
		return graded(
			input,
			'long',
			[
				`${formatMinutes(input.movingSec)}, at least ${LONG_REL_MULTIPLE}× the median session of the last 28 days`,
			],
			{ usedContext: true },
		)
	}

	if (tiz.z3Frac <= EASY_MAX_Z3_FRAC && tiz.z2Frac < EASY_MAX_Z2_FRAC) {
		return graded(
			input,
			'easy',
			['continuous, almost all of it below LT1'],
			// The window was read to rule `long` out, wherever it mattered.
			{ usedContext: longEnoughToBeEither },
		)
	}

	// Sustained between LT1 and LT2 — which is tempo *or* steady, and telemetry
	// cannot say which. Refused rather than guessed; see the refusal's own note.
	if (
		input.intensityFactor != null &&
		input.intensityFactor >= TEMPO_IF_BAND[0] &&
		input.intensityFactor <= TEMPO_IF_BAND[1] &&
		tiz.z2Frac >= TEMPO_MIN_Z2_FRAC
	) {
		return refused('tempo-or-steady', [
			'sustained between LT1 and LT2, which is a tempo session or a steady one',
			'the two differ by where this athlete’s LT1 and LT2 actually sit, which telemetry cannot show',
		])
	}

	// Mixed intensity with no detectable set. Speed play is exactly the session
	// whose boundaries the athlete chose rather than the prescription (§2.1).
	if (abovelt1 >= FARTLEK_MIN_MIXED_FRAC) {
		return graded(input, 'fartlek', ['mixed intensity with no detectable set'])
	}

	return refused('no-rule-fits', [
		'no set was detected, and the duration and intensity match no archetype',
	])
}

// ---------------------------------------------------------------------------
// The structured path — read the rep geometry
// ---------------------------------------------------------------------------

function readGeometry(
	input: ArchetypeInput,
	structure: StructureReading,
): ArchetypeReading {
	const reps = structure.reps
	if (reps.length === 0) return readUnstructured(input)

	const totalWorkSec = reps.reduce((sum, rep) => sum + rep.durationSec, 0)
	const medianRepSec = median(reps.map((rep) => rep.durationSec))
	const restRatio = totalWorkSec > 0 ? structure.recoverySec / totalWorkSec : 0

	// 4a. Tiny reps, full recovery, trivial total work: neuromuscular work, which
	//     is a *modifier* and never the session. Checked first so strides on the
	//     end of an easy run cannot promote the day to a quality session.
	if (
		within(medianRepSec, NEURO_REP_SEC) &&
		totalWorkSec <= NEURO_MAX_TOTAL_WORK_SEC &&
		restRatio >= NEURO_MIN_REST_RATIO
	) {
		return withNeuromuscularModifier(readUnstructured(input), reps.length)
	}

	// 4b. Regularity is what makes a set a set. Cannot fire yet — see the note on
	//     `durationCV`, which a persisted detection has already averaged away.
	if (
		structure.durationCV != null &&
		structure.durationCV >= FARTLEK_MIN_REP_CV &&
		reps.length >= FARTLEK_MIN_REPS
	) {
		return graded(input, 'fartlek', ['repeated efforts of irregular length'])
	}

	// Every geometry branch below reads how hard the reps were, so an unresolved
	// zone refuses here rather than being silently treated as easy. One null is
	// enough: a mean over the reps that happened to resolve is not the session's.
	const meanZone = durationWeightedMeanZone(reps)
	if (meanZone == null) {
		return refused('no-zone', [
			`${reps.length} reps were found, but no threshold on this session’s channel could resolve how hard they were`,
		])
	}

	const geometry = `${reps.length} × ${formatMinutes(medianRepSec)}`

	// 4c. Many controlled reps at the Z3/Z4 seam with floats rather than
	//     recoveries. Before threshold: it is the denser, easier pattern and the
	//     generic threshold rule would swallow the whole Norwegian method.
	if (
		reps.length >= SUBTHRESHOLD_MIN_REPS &&
		meanZone <= SUBTHRESHOLD_MAX_MEAN_ZONE &&
		restRatio <= SUBTHRESHOLD_MAX_REST_RATIO &&
		totalWorkSec >= SUBTHRESHOLD_MIN_TOTAL_WORK_SEC
	) {
		return graded(
			input,
			'sub-threshold',
			[
				`${geometry} with short floats, at or below LT2`,
				`${formatMinutes(totalWorkSec)} of accumulated work`,
			],
			{
				caveat:
					'the shape of a lactate-guided session, but no lactate was measured',
			},
		)
	}

	// 4d. Long reps at LT2.
	if (
		within(medianRepSec, THRESHOLD_REP_SEC) &&
		meanZone >= THRESHOLD_MIN_MEAN_ZONE &&
		meanZone < THRESHOLD_MAX_MEAN_ZONE
	) {
		return graded(input, 'threshold', [`${geometry} at threshold intensity`])
	}

	// 4e. Mid-length reps above LT2.
	if (within(medianRepSec, VO2_LONG_REP_SEC) && meanZone >= VO2_MIN_MEAN_ZONE) {
		return graded(input, 'vo2max-long', [`${geometry} above LT2`])
	}

	// 4f. Short reps, incomplete recovery, many of them.
	if (
		within(medianRepSec, VO2_SHORT_REP_SEC) &&
		restRatio <= VO2_SHORT_MAX_REST_RATIO &&
		reps.length >= VO2_SHORT_MIN_REPS
	) {
		return graded(input, 'vo2max-short', [
			`${geometry} with incomplete recovery`,
		])
	}

	// 4g. Short reps bought with long recoveries, at the top of the scale.
	if (
		within(medianRepSec, ANAEROBIC_REP_SEC) &&
		restRatio >= ANAEROBIC_MIN_REST_RATIO &&
		meanZone >= ANAEROBIC_MIN_MEAN_ZONE
	) {
		return graded(input, 'anaerobic', [
			`${geometry} near-maximal, with long recoveries`,
		])
	}

	// §8.2's branch 4h — race simulation — is deliberately absent rather than
	// present and unreachable. It needs the goal event's target pace, and no such
	// field exists on `Event`; a branch reading a field nothing writes is dead
	// code wearing a capability. `race-simulation` therefore only ever arrives
	// **authored**, which is exactly right for a session an athlete plans as a
	// dress rehearsal. Same for `technique`, which has no telemetric signature at
	// all: its load is a by-product rather than the point (§2).
	return refused('geometry-unmatched', [
		`${geometry} was found, and its geometry matches no archetype`,
	])
}

/**
 * Attach the neuromuscular modifier to whatever the session around the strides
 * was (§8.3: "neuromuscular returns a *modifier*, not a replacement").
 *
 * When the surrounding session cannot be read, the refusal stands and says the
 * strides were found. Promoting them to the primary would be the exact error the
 * ordering exists to prevent — it would make a strides day a quality day.
 */
function withNeuromuscularModifier(
	base: ArchetypeReading,
	repCount: number,
): ArchetypeReading {
	const found = `${repCount} short efforts with full recovery`
	if (base.kind === 'unclassified') {
		return {
			...base,
			reasons: [
				...base.reasons,
				`${found} were found, but they say what the session contained rather than what it was`,
			],
		}
	}
	return {
		...base,
		modifiers: [...base.modifiers, 'neuromuscular'],
		reasons: [...base.reasons, `with ${found} appended`],
	}
}

// ---------------------------------------------------------------------------
// Confidence and small readers
// ---------------------------------------------------------------------------

/**
 * Confidence is the **minimum** of the inputs that were actually used — the same
 * min-of-grades composition `gradeConfidence` and the Threshold Estimate already
 * use, and never a bespoke score (ADR 0033).
 *
 * `contextGrade` is only in the minimum when the reading *used* the window. A
 * threshold set read off rep geometry does not become less trustworthy because
 * the athlete's 28-day median is unknown; it never asked.
 */
function graded(
	input: ArchetypeInput,
	archetype: SessionArchetype,
	reasons: string[],
	options: { caveat?: string; usedContext?: boolean } = {},
): ArchetypeReading {
	const grades: DetectionGrade[] = [
		input.structure?.grade ?? 'low',
		// HR lags and drifts, so a zone read off it caps the answer (ADR 0024/0035).
		input.channel === 'heartRate' ? 'medium' : 'high',
	]
	if (options.usedContext) {
		grades.push(input.context.medianSessionSec28d != null ? 'high' : 'low')
	}
	if (options.caveat) grades.push('medium')

	return {
		kind: 'archetype',
		archetype,
		modifiers: [],
		confidence: weakest(grades),
		reasons,
		caveat: options.caveat ?? null,
	}
}

function refused(
	refusal: ArchetypeRefusal,
	reasons: string[],
): ArchetypeReading {
	return { kind: 'unclassified', refusal, reasons }
}

const GRADE_RANK: Record<DetectionGrade, number> = {
	low: 0,
	medium: 1,
	high: 2,
}

function weakest(grades: readonly DetectionGrade[]): DetectionGrade {
	return grades.reduce((worst, grade) =>
		GRADE_RANK[grade] < GRADE_RANK[worst] ? grade : worst,
	)
}

/**
 * Role, not intensity: long is both an absolute floor *and* a multiple of the
 * athlete's own median. Callers check the floor themselves, because it is the
 * floor that decides whether the window is needed at all.
 */
function isLong(input: ArchetypeInput): boolean {
	const median28d = input.context.medianSessionSec28d
	if (median28d == null) return false
	return input.movingSec >= LONG_REL_MULTIPLE * median28d
}

function isBrick(input: ArchetypeInput): boolean {
	const segments = input.disciplineSegments
	const disciplines = new Set(segments.map((segment) => segment.discipline))
	if (disciplines.size < 2) return false

	const ordered = [...segments].sort((a, b) => a.startSec - b.startSec)
	return ordered.every(
		(segment, index) =>
			index === 0 ||
			segment.startSec - ordered[index - 1]!.endSec <= BRICK_MAX_GAP_SEC,
	)
}

function countReps(structure: StructureReading | null): number {
	return structure?.reps.length ?? 0
}

/** Null when any rep's zone is unresolved — see the call site's note. */
function durationWeightedMeanZone(
	reps: readonly { durationSec: number; zone: number | null }[],
): number | null {
	let weighted = 0
	let total = 0
	for (const rep of reps) {
		if (rep.zone == null) return null
		weighted += rep.zone * rep.durationSec
		total += rep.durationSec
	}
	return total > 0 ? weighted / total : null
}

function within(value: number, [min, max]: readonly [number, number]): boolean {
	return value >= min && value <= max
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 0
		? (sorted[mid - 1]! + sorted[mid]!) / 2
		: sorted[mid]!
}

/** Whole minutes where the reason line reads better for it, else seconds. */
function formatMinutes(seconds: number): string {
	if (seconds < 90) return `${Math.round(seconds)} s`
	return `${Math.round(seconds / 60)} min`
}
