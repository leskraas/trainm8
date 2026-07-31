// The **Strength Goal**'s prescription: the `%1RM` band and the rep range that a
// strength Training Track segment's authored goal **derives** (ADR 0047 §3, which
// closes ADR 0042 §10 by taking its option B).
//
// One documented constant table (`STRENGTH_PRESCRIPTIONS`) and pure readings off
// it, in the shape `ramp-guard.ts` and `quality-mix.ts` hold their own conventions.
// `STRENGTH_GOALS` and `StrengthGoal` live in `derive.ts` beside the segment that
// authors one; the *consequences* of the token live here, and only here.
//
// **The figures, and where each comes from:**
//
// | Goal               | `%1RM` band | Reps | Source                                    |
// | ------------------ | ----------- | ---- | ----------------------------------------- |
// | `hypertrophy`      | 70–85       | 6–12 | ACSM 2009 Position Stand                  |
// | `maximal-strength` | 80–100      | 1–6  | ACSM 2026 (Currier et al.), ≥80% 1RM      |
// | `power`            | 30–70       | 3–6  | ACSM 2026 (Currier et al.), 30–70% 1RM    |
//
// - **ACSM 2026** is Currier et al., _MSSE_ 58(4):851–872, doi
//   10.1249/MSS.0000000000003897 — an overview of 137 systematic reviews. It
//   prescribes **≥80% 1RM, 2–3 sets** for strength and **30–70% 1RM** for power.
//   `maximal-strength`'s open-ended `≥80%` is closed at 100 because `%1RM` is a
//   fraction of the athlete's own one-rep maximum, so 100 is the band's ceiling by
//   construction rather than a second claim about training.
// - **`hypertrophy` is sourced to the ACSM 2009 Position Stand** (_Progression
//   Models in Resistance Training for Healthy Adults_) — **70–85% 1RM, 6–12 reps**
//   — and not to ACSM 2026, deliberately: **2026 gives hypertrophy only a _volume_
//   figure (≥10 sets/wk)**, and ADR 0047 §3 forbids deriving sets per week from the
//   goal. The 2009 stand is the newest source that states hypertrophy's figure on
//   the axis this module is allowed to speak on.
// - **The rep ranges are the documented consequence of each band**, not independent
//   prescriptions: ACSM 2026 states its two goals as loads, and a load band bounds
//   how many repetitions it admits.
//
// **Three rules from ADR 0047 §3, each of which this module exists to hold:**
//
// - **Nothing here derives sets per week from the goal.** Weekly volume is the
//   **Season Anchor**'s and the **Volume Ramp**'s (ADR 0047 §1), and a second
//   source for that one number is exactly the conflict the ADR removed. So ACSM's
//   `2–3 sets`, `≥10 sets/wk` and power's `≤24 repetitions·sets` are recorded above
//   as evidence and **deliberately not exported** — an implementer reading ACSM
//   would otherwise wire the set counts in, which is why the ADR states the
//   boundary explicitly and why this note repeats it.
// - **The band and the rep range are derived and cannot be typed.** Nothing in this
//   module is authorable and none of it is ever stored: the segment authors the
//   goal token and this table is the single place its consequences exist. That is
//   also what makes `30 sets/wk at 90% 1RM` unauthorable rather than merely guarded.
// - **No citable range attaches to the `sets` currency, and none may be presented
//   as if one did** (ADR 0047 "Accepted costs"). A systemic weekly set count is
//   ours — countable from the athlete's own log, published by nobody — so no
//   reading here may be dressed up as a set-count recommendation.
//
// The check against real sessions is `isOutsideBand`, which **warns and never
// blocks** (ADR 0042 §9): `ExerciseSet.pct1RM` is a first-class authored quantity,
// so a session at 60% inside a `maximal-strength` segment is a soft warning with no
// schema change. Following `ramp-guard.ts` and `quality-mix.ts`, the reading carries
// **no wording** — the surface words it, and `format.ts` renders the figures
// (ADR 0023).

import { type StrengthGoal } from './derive.ts'

/**
 * A `%1RM` band, **inclusive at both ends**: a session at exactly 80% is inside
 * `maximal-strength`'s band, and one at exactly 70% is inside `power`'s. The bands
 * overlap on purpose — ACSM's own figures overlap, and the goals are separated by
 * volume rather than by load, which is why the goal and not a band is what a
 * segment authors (ADR 0047 §3).
 */
export type Pct1RMBand = {
	/** Lowest `%1RM` in the band, as whole percent (`80`, not `0.8`). */
	readonly minPct1RM: number
	/** Highest `%1RM` in the band, as whole percent. */
	readonly maxPct1RM: number
}

/** A repetition range, inclusive at both ends. */
export type RepRange = {
	readonly minReps: number
	readonly maxReps: number
}

/**
 * What a **Strength Goal** prescribes: the intensity side, and nothing else. No
 * `sets` member exists here, and adding one would re-create the two-sources
 * conflict ADR 0047 §1 removed.
 */
export type StrengthPrescription = {
	readonly band: Pct1RMBand
	readonly reps: RepRange
}

/**
 * The one table mapping each **Strength Goal** to its `%1RM` band and rep range.
 * Sources and the reasoning behind every figure are in the module header; keep them
 * there rather than restating them per entry, so a reader meets the whole set at
 * once and sees what is missing from it.
 *
 * Domain knowledge in code, beside the vocabulary it belongs with (ADR 0006), and
 * never in athlete data — a segment authors the goal token and reads this back.
 */
export const STRENGTH_PRESCRIPTIONS = {
	hypertrophy: {
		band: { minPct1RM: 70, maxPct1RM: 85 },
		reps: { minReps: 6, maxReps: 12 },
	},
	'maximal-strength': {
		band: { minPct1RM: 80, maxPct1RM: 100 },
		reps: { minReps: 1, maxReps: 6 },
	},
	power: {
		band: { minPct1RM: 30, maxPct1RM: 70 },
		reps: { minReps: 3, maxReps: 6 },
	},
} as const satisfies Record<StrengthGoal, StrengthPrescription>

/**
 * Derived: the band and rep range the segment's authored goal implies.
 *
 * An accessor rather than callers indexing {@link STRENGTH_PRESCRIPTIONS}
 * themselves, so the table can gain a figure without every surface learning its
 * shape — and so `Record<StrengthGoal, …>` stays the only exhaustiveness check
 * anyone needs: a fourth goal added to `STRENGTH_GOALS` fails to compile here
 * rather than reading back `undefined` at a surface.
 */
export function strengthPrescription(goal: StrengthGoal): StrengthPrescription {
	return STRENGTH_PRESCRIPTIONS[goal]
}

/**
 * Whether a scheduled session's `%1RM` falls outside the band its segment's goal
 * derives — the subject of ADR 0042 §9's soft warning, and the ADR's own example:
 * 60% inside a `maximal-strength` segment.
 *
 * **Warns, never blocks**, exactly as the ramp guard does (ADR 0040 §12): no write
 * path may consult this, and nothing here returns a validation error. Both ends are
 * inclusive, so a session sitting on a boundary is inside the band — the figures are
 * a **convention** read off position stands, not a threshold with a consequence at
 * it, and a band edge is the wrong place to start telling an athlete they are wrong.
 *
 * A bare predicate and no wording: the surface says what it means, so the honesty
 * rules stay where the athlete reads them instead of being duplicated as strings in
 * here. `pct1RM` is whole percent, matching `ExerciseSet.pct1RM`.
 */
export function isOutsideBand(goal: StrengthGoal, pct1RM: number): boolean {
	const { band } = STRENGTH_PRESCRIPTIONS[goal]
	return pct1RM < band.minPct1RM || pct1RM > band.maxPct1RM
}
