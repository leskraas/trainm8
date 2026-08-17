import { type SessionArchetype } from '../catalogue.ts'
import { type TrainingZone } from '../session-profile.ts'
import { type DetectionGrade } from '../structure-detection/types.ts'
import { type CardioDiscipline } from '../workout-schema.ts'

/**
 * **Archetype Classification** — the pure vocabulary for *reading* what kind of
 * session a completed recording was (research:
 * `docs/research/workout-taxonomy.md` §8; decided by ADR 0055).
 *
 * The module produces a **reading**, never a stored value. An authored
 * `Workout.archetype` is what a session *is*; a reading is what the app *saw*,
 * and it is recomputed from the athlete's current window every time it is shown.
 * Nothing here may be persisted — a reading frozen into a column would be a
 * classification of a 28-day window that has since moved (ADR 0055 §3, the same
 * rule ADR 0035 holds for a zone label).
 *
 * The caller never passes an authored archetype in. §8.2's branch 0 ("the
 * athlete's own statement wins") is discharged by **not calling this at all**
 * when one exists, so the module has no opportunity to overrule a plan.
 */

/**
 * Why the reader would not name an archetype. Stated rather than omitted — the
 * same rule `ThresholdEstimate`'s refusals hold and the same reason `analyze()`
 * returns `null` instead of a shaky structure (ADR 0033).
 */
export const ARCHETYPE_REFUSALS = [
	/** Neither a structure nor an intensity profile: nothing was read at all. */
	'no-signal',
	/**
	 * Reps were found, but no threshold resolved their intensity to a zone, so
	 * their geometry cannot be read as hard or easy. Never a population default
	 * (ADR 0035).
	 */
	'no-zone',
	/**
	 * The call turns on how this session compares to the athlete's own recent
	 * volume and no such window is known. **Easy and long are separated only by
	 * that window** — a 100-minute run is `easy` in a 120 km week and `long` in a
	 * 50 km one — so a session long enough to be either, read without the window,
	 * is a coin flip and not an answer.
	 */
	'no-week-context',
	/**
	 * A sustained effort between LT1 and LT2 — which is **tempo or steady**, and
	 * telemetry cannot separate them: the difference is the coach's intent about
	 * where the athlete's LT1 and LT2 sit. `workout-taxonomy.md` §8.3 returns a
	 * merged `TEMPO_STEADY` class for exactly this, and the shipped sixteen-value
	 * vocabulary has no merged member (nor should it — `sweet spot` was refused
	 * for the neighbouring reason). Picking one would be the coin flip §8.3 names.
	 */
	'tempo-or-steady',
	/** A set was found and its geometry matches no archetype in the inventory. */
	'geometry-unmatched',
	/** No structure, and no duration/intensity rule fits what was read. */
	'no-rule-fits',
] as const
export type ArchetypeRefusal = (typeof ARCHETYPE_REFUSALS)[number]

/** One repetition of the main set, as the reader found it. */
export type RepReading = {
	durationSec: number
	/**
	 * The canonical **Training Zone** the rep sat in, or `null` when no threshold
	 * on its channel could resolve one. A single null refuses the whole reading:
	 * a mean over the reps that happened to be resolvable is not the session's.
	 */
	zone: TrainingZone | null
}

/** The main set, reduced to the geometry the archetype branches read. */
export type StructureReading = {
	reps: RepReading[]
	/** Total recovery/float seconds inside the set. */
	recoverySec: number
	/**
	 * The coefficient of variation of the rep durations, or `null` when the reader
	 * could not know it.
	 *
	 * Null is the normal case today, and it is a platform gap rather than a
	 * modelling choice: a persisted **Workout Detection** collapses a mined set to
	 * **one averaged step with `{ repeatCount: k }`**, so the individual rep
	 * lengths are gone by the time anything can read them (`analyze.ts`'s
	 * `toStructure`; `interval-detection-and-data-platform.md` Gap 1). Fartlek is
	 * *defined* by irregular reps, so the branch that finds it cannot fire until a
	 * per-interval entity exists. It is null rather than 0 so that absence never
	 * reads as regularity.
	 */
	durationCV: number | null
	/** The **Detection Confidence** of the structure this was read from. */
	grade: DetectionGrade
}

/** A stretch of one discipline inside the session — how a brick is recognised. */
export type DisciplineSegment = {
	discipline: CardioDiscipline
	startSec: number
	endSec: number
}

/** The three-zone (LT1/LT2) time split, time-denominated. */
export type TimeInZone = { z1Frac: number; z2Frac: number; z3Frac: number }

/**
 * Everything the reader may look at. Pure: no clock, no DB, no stream — the
 * caller reduces the session to this and the module decides (the same seam
 * `analyze(input)` and `estimateThresholds(input)` already draw).
 *
 * Every field that can honestly be absent is nullable, and a branch that needs
 * an absent field **refuses** rather than falling through to a rule that happens
 * to match without it.
 */
export type ArchetypeInput = {
	movingSec: number
	/** What intensity was read from. Caps the confidence at `medium` for HR. */
	channel: 'power' | 'pace' | 'heartRate'
	/** The main set, or `null` when nothing structured was found. */
	structure: StructureReading | null
	/** Session **Intensity Factor**, or null when no threshold resolved one. */
	intensityFactor: number | null
	/** Time-denominated three-zone split, or null when nothing produced one. */
	timeInZone: TimeInZone | null
	/**
	 * The disciplines the session moved through, in time order. One entry for an
	 * ordinary session; two or more with a tight changeover is a brick.
	 */
	disciplineSegments: readonly DisciplineSegment[]
	/** The athlete's own recent volume — the *role in the week* half of §1. */
	context: {
		/**
		 * The median moving time of the athlete's sessions over the last 28 days,
		 * or null when the window is empty. What separates easy from long.
		 */
		medianSessionSec28d: number | null
	}
}

/**
 * What was read: an archetype with its confidence and its derivation, or a
 * refusal that says which call could not be made.
 *
 * A discriminated union rather than a nullable archetype, because "the geometry
 * matched nothing" and "we could not resolve a zone" are different statements
 * and the surface says different things about them.
 */
export type ArchetypeReading =
	| {
			kind: 'archetype'
			archetype: SessionArchetype
			/**
			 * Archetypes the session *also* contained without being. Strides on the
			 * end of an easy run are `neuromuscular` here and never the primary —
			 * promoting them would make the day count as a quality session, which
			 * `workouts-running.md` §8 explicitly forbids.
			 */
			modifiers: SessionArchetype[]
			/** ADR 0033's vocabulary, never a bespoke 0–1 score. */
			confidence: DetectionGrade
			/** Why, in the reader's own terms. Shown behind a tap, never asserted. */
			reasons: string[]
			/** A caveat that travels with the answer and caps it at `medium`. */
			caveat: string | null
	  }
	| {
			kind: 'unclassified'
			refusal: ArchetypeRefusal
			reasons: string[]
	  }
