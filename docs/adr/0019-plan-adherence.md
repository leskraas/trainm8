# Plan Adherence as planned-vs-actual TSS, fed into the Coach narrative

The home surface answers "how am I today?" (Coach card, ADR 0010), "where am I
in the arc?" (Plan card, ADR 0018), and "what have I done / will I do?" (Session
Ledger). It does not answer **"am I actually following the plan?"** Progress on
the Plan card is deliberately weeks-elapsed, not adherence (ADR 0018), so nothing
on home compares what was _prescribed_ against what was _done_.

This ADR adds that comparison as **Plan Adherence**, built on the load currency
the app already speaks (TSS, ADR 0008), and routes its meaning through the
existing Coach voice rather than adding a parallel signal.

## Decision

Adherence is the signed deviation of **actual TSS** from **Planned TSS**, per
session, aggregated to the week, surfaced through existing home surfaces.

1. **Planned TSS reuses the actual-TSS formulas.** For each Step with a duration,
   take the midpoint of its _resolved_ intensity range
   (`intensityPowerMin/Max`, `intensityPaceMin/Max`, `intensityHrMin/Max` —
   filled by the resolution job from the athlete's thresholds) and run it through
   the **same** Coggan/`rTSS`/`hrTSS` formula the session would use for actual
   TSS (ADR 0008). Distance-only Steps derive duration from the resolved pace.
   Planned TSS is therefore the same model and currency as actual TSS, not a
   parallel invented metric.

2. **Planned TSS degrades to an Unavailable Metric, never a guess.** A Step with
   no duration and no resolved intensity (thresholds unset, resolution failed,
   unquantified Step) contributes nothing, and the session's Planned TSS is
   marked _partial_ or _unavailable_ accordingly (ADR 0008 principle, ADR 0002
   quantification). Adherence for such a session renders as "—", not 100%.

3. **Planned TSS never enters the load triad.** CTL/ATL/TSB stay actual-only
   (ADR 0008). Planned TSS exists solely for the adherence comparison; it must
   not contribute to any Load Snapshot.

4. **Bands are asymmetric, tighter toward over.** Per session, the ratio
   actual/planned maps to **under / on-target / over**, with the over edge
   nearer than the under edge — overreaching is the more dangerous deviation, so
   it flags sooner (e.g. under `<85%`, on-target `85–108%`, over `>108%`; exact
   cuts calibrated against real data, structure fixed now). This mirrors
   `readinessFromTsb`: named exported thresholds, a `tone` enum, and a
   `{ label, recommendation, tone }` result.

5. **Weekly aggregate is a load ratio with per-session bands beneath it.** The
   week headline is `sum(actual) / sum(planned)` banded; the per-session bands
   are shown under it so compensation stays visible — a single big Saturday ride
   covering three skipped weekday sessions reads as "1 over, 3 under/missed"
   even when the weekly total looks on-target.

6. **Consequence feeds the Coach narrative; no new widget.** Adherence is an
   input to the existing Coach card voice (sustained under → "fitness drifting
   from the goal"; sustained over → "overreaching risk, TSB diving"), not a
   second opinion. It threads through three existing surfaces: consequence in the
   **Coach card**, the weekly ratio at the this-week stats, per-session bands on
   **Session Ledger** rows.

## Considered options

- **Duration- or discipline-based adherence**: Rejected as the primary axis.
  Always available without resolution, but a duration match says nothing about
  intensity, and TSS is the currency the rest of the app (CTL/ATL/TSB, AI plan
  generation) already speaks. Duration remains the implicit fallback only inside
  the formula chain (sRPE uses duration).
- **A coarse zone→IF table** (`easy`/`zone2`/`threshold`/`max` → fixed intensity
  factor): Rejected — it would model Planned TSS differently from actual TSS,
  putting two methods behind one currency and reintroducing the comparability
  problem ADR 0008 exists to avoid. The resolved ranges already give us the real
  prescribed intensity.
- **Planned TSS authored by AI plan generation only**: Rejected — leaves
  manually authored sessions (ADR 0003 session-first) with no Planned TSS,
  covering only part of the dataset.
- **Capped compliance % (max 100%)**: Rejected — caps hide overdoing, but
  overreaching is the deviation an honest coach must call out, not erase.
- **A dedicated "Plan Adherence" card on home**: Rejected — more discoverable,
  but a fourth top-level signal alongside Coach / Load / Plan dilutes the single
  coach voice (ADR 0017 consolidation). Threading through existing surfaces keeps
  one voice.

## Consequences

- A `plannedTssValue` (plus `plannedTssConfidence`) is stored on **Workout
  Session**, computed at materialization and recomputed on prescription edit or
  threshold change — parallel to how actual `tssValue` provenance is stored
  (ADR 0008). On-the-fly computation per render is rejected for the same reason
  ADR 0008 rejects it for the load triad.
- Adherence is only as good as resolution: athletes without thresholds set get
  mostly Unavailable Planned TSS, so adherence is gated on the same onboarding
  that ADR 0005 (thresholds) and ADR 0008 (formula fallback) already depend on.
- The Coach card (ADR 0010) gains a second input beside Form (TSB). The two must
  be reconciled into one recommendation, not shown as competing lines.
- Session Ledger rows already carry `load`; the per-session band is an
  adornment on the existing load cell, not a new column of raw numbers.
- Exact band cut points are intentionally left as named, tunable thresholds;
  this ADR fixes the _structure_ (asymmetric, three bands, readiness-style) and
  defers calibration. The weekly window (calendar Mon–Sun vs rolling 7 days) is
  likewise deferred to implementation.
