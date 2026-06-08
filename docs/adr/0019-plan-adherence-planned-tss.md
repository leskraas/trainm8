# Plan Adherence via Planned TSS and an Adherence Band

The app computes per-session actual TSS (ADR 0008) and surfaces it on the
Session Ledger, but nothing tells the athlete how a session compared to what was
**prescribed**. "Did I do the workout I planned?" is the first adherence
question, and it needs a number to compare against — one the app can compute
from the prescription itself, not ask the athlete to estimate.

## Decision

Introduce **Planned TSS**: the training stress a Workout Session's prescription
implies, computed from each Step's **resolved** intensity midpoint run through
the **same Load Formula** the session uses for actual TSS (Coggan / `rTSS` /
`hrTSS` / `sTSS` per ADR 0008). Compare it to actual TSS as a three-state
**Adherence Band** surfaced on the Session Ledger.

1. **Same formula, midpoint input.** Per Step, take the midpoint of the resolved
   intensity range (HR / power / pace) as the "average" the formula expects.
   Distance-only Steps derive their duration from the resolved pace. This keeps
   Planned and actual TSS on one scale — the comparison is only honest if both
   sides use the same math.

2. **Materialized, never per-render.** Store `plannedTssValue` +
   `plannedTssConfidence` on the Workout Session (parallel to actual TSS
   provenance). Recompute on prescription edits (Step duration / intensity
   changed) and on threshold changes (resolved ranges shifted). On-the-fly
   per-render computation is rejected for the same reason as CTL/ATL/TSB
   (ADR 0008): wasteful and inconsistent across views.

3. **Honesty over guessing.** A Step with neither a quantity nor a resolved
   intensity contributes nothing (an open "warm up until ready" Step). A Step
   that prescribes an effort we can't quantify drops the session's confidence to
   `partial`; a session where nothing resolves is **unavailable** (`null`),
   never a fabricated value. Confidence is `full` | `partial`, with `null` value
   for unavailable.

4. **Planned TSS is not fitness.** It never enters any Load Snapshot / CTL / ATL
   / TSB calculation. Only actual, recorded load is fitness; Planned TSS exists
   solely for the adherence comparison.

5. **Adherence Band mirrors `readinessFromTsb`.** A pure `adherenceBand(ratio)`
   returns `{ label, recommendation, tone }` with named exported thresholds and
   a `tone` enum (`under` | `on-target` | `over`). Thresholds are **asymmetric**:
   the over edge sits nearer to 1.0 than the under edge, so overreaching — the
   riskier failure mode — flags sooner than undertraining. Placeholder cut
   points (`under <85%`, `on-target 85–108%`, `over >108%`): the structure is
   fixed now, the numbers tunable later.

## Status

Foundational vertical slice. Extends ADR 0008 (TSS triad / Load Formula) and
ADR 0002 (Step Duration XOR Distance); reuses the zone resolver (ADR 0006) for
resolved intensity ranges. The Adherence Band follows the `readinessFromTsb`
pattern established for the Coach card readiness label.

## Consequences

- Two new nullable columns on `WorkoutSession`: `plannedTssValue` and
  `plannedTssConfidence`.
- `computePlannedTss` (pure) and `adherenceBand` (pure) join the load utilities
  alongside `compute.ts`, `formulas.ts`, and `readiness.ts`.
- Planned TSS is recomputed synchronously (SQLite hobby project, as with the
  rest of the load math): in `createWorkoutSession` / `updateWorkoutSession`
  for prescription edits, and after `recomputeIntensityRanges` on a threshold
  change. The recompute resolves intensity fresh from the athlete's current
  profile rather than reading the cached `intensity*` columns, so a Planned TSS
  is correct immediately after an edit (the authoring path does not refresh
  those columns).
- The Session Ledger's existing load cell gains a tone-coloured band adornment;
  a session missing either Planned or actual TSS renders the band as "—".
- Cut points are placeholders; tuning them later is a constant change, not a
  structural one.
