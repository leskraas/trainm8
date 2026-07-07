# Adaptive Week Replan: a persistent, at-most-once, volume-only rescale of the next Training Week

The Coach card's one-session ease (#159) and the missed-session nudge (#188)
adapt exactly one upcoming session, ephemerally re-decided on every load
recompute. The North-star ("your plan adapts to what you actually did") needs a
**durable, week-scoped** adaptation: when a Training Week closes having run
clearly over plan and the athlete's Form confirms the overload, the *following*
week's planned sessions should soften — persistently, visibly, and with a
plain-language reason — and when the data can't justify a change, the app must
say "no adjustment" rather than invent one.

## Decision

1. **A Week Replan is a persistent decision record, made at most once per
   closed Training Week.** When a load recompute (`recomputeLoadFrom` — the ADR
   0008 path: session log, import/promotion, threshold change, missed/skipped
   status; never a GET) finds that the most recently closed Training Week
   (calendar Mon–Sun in the Athlete Timezone, per ADR 0019/#122) has no stored
   decision yet, it evaluates one and stores it: a `WeekReplan` row keyed
   unique on (athlete, closed week's Monday). Outcomes: `adjusted`,
   `no-change`, or `insufficient-data` — every outcome carries a
   plain-language reason. The first evaluation **wins**: late-arriving data for
   the closed week never re-opens the decision. This is what makes a
   multiplicative adjustment safe — it can never compound — and what makes the
   declined state ("no adjustment — not enough data") as durable and demoable
   as the adjustment itself. Deriving the decision at render (the nudge's
   model) was rejected: a mutation that rewrites stored prescriptions needs a
   stored, auditable cause, and re-derivation over shifting inputs would let
   what was *applied* and what is *said* drift apart.

2. **One documented rule: inverse-overshoot volume scaling, downward only.**
   Adjust only when the closed week's **Weekly Plan Adherence** band is `over`
   (ADR 0019 thresholds) **and** current **TSB** is trustworthy (42-day gate,
   ADR 0008/0010) **and** at or below a named gate (`REPLAN_TSB_GATE = 0`) —
   the overshoot happened *and* the body is measurably under load. The factor
   is `scale = max(1 / weeklyAdherenceRatio, REPLAN_MIN_SCALE = 0.70)`: the
   next week is brought back to roughly the load the plan intended, never cut
   by more than 30%. The scale applies to each still-scheduled future
   session's quantified cardio **Step Quantities** (durations and distances);
   **Intensity Targets are not changed**. Zone labels and threshold
   percentages are discrete/anchored and do not scale honestly, whereas volume
   scaling flows through the existing Planned TSS recompute (ADR 0019) so the
   softened plan re-prices itself with the same formulas — no invented
   numbers. An `under` week produces `no-change` with a "bank the planned
   work" reason: automatically inflating load is the risky direction
   (safety-first, #120), and the correct response to undertraining is doing
   the plan, not a bigger plan. All cut points are named exported constants,
   tunable like the adherence band's.

3. **The change is written to the Workout Sessions themselves, honestly
   scoped.** Adjusted sessions get their steps rescaled in place, their
   Planned TSS recomputed, and a **Replan Note** (`replanReason`, one new
   nullable column) attached; `source` is **not** flipped (no adoption, ADR
   0016 — regeneration remains the reversibility path, exactly as the nudge
   applier decided). Sessions the rule cannot honestly touch are left alone
   with no note: strength (no load model to scale), sessions with no
   quantified cardio steps, and non-future or non-`scheduled` sessions. If
   nothing in the target week is adjustable, or the closed week's adherence is
   unavailable (`null`), or TSB is untrustworthy, the decision is
   `insufficient-data`/`no-change` — an explicit refusal, never a tweak.

4. **Prescription rewrites clear the note.** A manual session edit
   (`updateWorkoutSession`) or a Session Nudge ease rewrites the prescription
   the note explains, so both clear that session's `replanReason`. Idempotency
   does not depend on the notes surviving — it lives in the `WeekReplan` row.
   Within `recomputeLoadFrom` the Week Replan runs **before**
   `applySessionNudgeForUser`, so the single-session ease composes on top of
   the week-scoped rescale, not under it.

## Status

Extends ADR 0019 (Weekly Plan Adherence / Planned TSS), ADR 0008/0010 (TSB and
its trust gate), and the Session Nudge appliers (#159/#188), whose
source-preserving, trust-gated, recompute-path pattern it follows. First
persistent-adjustment seam; multi-week and phase-level adaptation would extend
the same `WeekReplan` record.

## Consequences

- New `WeekReplan` model (athlete, weekKey, outcome, reason, scale/ratio/TSB
  provenance) unique per (athlete, closed week); one new nullable
  `replanReason` column on `WorkoutSession`. Additive migration only.
- `decideWeekReplan` (pure) and the step-scaling helper join the load
  utilities; `week-replan.server.ts` is the applier on the recompute path,
  mirroring `session-nudge.server.ts`.
- The Week tab surfaces the latest decision's reason (adjusted or declined);
  the Workout Detail View and Session Ledger surface per-session Replan Notes.
- A decision made early in the week (first import after Sunday) stands even if
  later data would have changed it — the deliberate price of no-compounding.
  Tuning `REPLAN_TSB_GATE` / `REPLAN_MIN_SCALE` is a constant change, not
  structural.
