# Detected structures verify against the plan honestly; recorded sessions have no Planned TSS

Map #326 (Workout auto-analysis) charts a **Structure Detection** that runs on
every run/bike **Activity Import** and, above its honesty gate, auto-materializes
a **Workout** onto the recording-only session — marked **Session Source**
`detected` (ADR 0032, ADR 0033). Its destination also promises that "when the
import auto-matched a planned session, the detected structure is additionally
scored against the prescription." Two questions were left to settle (#332): how
the prescription participates in detection and what that "scoring" means, and —
the trap — whether a structure reconstructed from the actuals may feed **Planned
TSS**.

## Decision

### 1. Detection is plan-blind; verification comes after

The engine synthesizes structure **free-form from telemetry alone** (#327/#330
pipeline). The matched session's prescription is **never** an input to detection
— not as a candidate template, not as a prior the engine can snap to. Detection
therefore produces the same result whether or not the import matched a plan, and
"scoring against the prescription" is an honest, after-the-fact comparison rather
than a self-fulfilling one. (This is distinct from — and consistent with — the
already-ruled-out template-library matching: neither the athlete's saved
templates nor the current prescription steers the engine.)

### 2. Structure Adherence — a coarse, asymmetric, honesty-gated signal

When a matched planned session carries both a resolvable prescription and a
**Structure Detection** that cleared its honesty gate (ADR 0033), the two
structures are compared into a single whole-session **Structure Adherence**
verdict, surfaced beside the **Adherence Band** on the **Workout Detail View**.
It is:

- **Whole-session, never per-step.** It asserts no per-interval pass/fail — the
  same deliberate stance the **Telemetry Overlay** takes. One verdict per session.
- **Asymmetric, because detection under-detects.** The #330 prototype confirmed
  the engine systematically finds *less* structure than was executed — it merges
  warmup ramps into the first rep, is blind to short reps (30/30, 45/15) and to
  reps run inside a single zone, and undercounted a real 10×3 as 6×3 at 0.95
  confidence. So the signal:
  - confirms **`as-prescribed`** when the detected structure corroborates the
    planned archetype (rep count and work durations broadly aligned within
    tunable tolerance);
  - may assert **`diverged`** only when detection *confidently* finds structure
    the plan did **not** prescribe — surplus or clearly-higher-intensity work.
    The engine never fabricates structure (its band-separation gate refuses
    phantom structure, ADR 0033), so detected structure in excess of the plan is
    real and safe to report;
  - degrades to an **Unavailable Metric** ("structure not confidently
    verifiable") whenever detection finds *less* than planned. That gap cannot be
    told apart from detector blindness, so it is **never** charged to the athlete
    as a missed-reps verdict (ADR 0008).
- **Display-derived, not stored.** Computed as a pure function of the stored
  detected structure and the stored prescription, like the **Adherence Band** is
  derived from stored Planned/actual TSS. Match tolerances are tunable build-time
  constants (cf. ADR 0019's placeholder band cut points).
- **Never load.** It never feeds **Planned TSS**, **CTL/ATL/TSB**, or the
  **Adherence Band**; it is an independent structural signal.

### 3. A recorded (or detected) session never computes Planned TSS

A session with no genuine prescription computes **no** Planned TSS, and its
**Adherence Band** stays unavailable ("—"). This covers both **Session Source**
`recorded` (a recording-only session with no structure) and `detected` (one whose
**Workout** was auto-materialized by a **Structure Detection**, ADR 0033). A plan
reconstructed from the session's own actuals would be graded against those same
actuals: ~100% adherence by construction, a meaningless self-comparison and a
dishonest number (ADR 0008). Planned TSS keeps its ADR 0019 meaning — it exists
only to compare a genuine *prescription* against actuals — and the materialize
path must guard on **Session Source** so it never populates `plannedTssValue` for
`detected` (or `recorded`) sessions.

## Alternatives considered

- **Feed the prescription in as a detection prior** (snap to the plan when
  telemetry is ambiguous): rejected. It manufactures agreement — detection would
  tend to "find" whatever was planned, inflating both Detection Confidence and
  Structure Adherence. A verification signal is only worth anything if the thing
  being verified was produced independently.
- **Per-step adherence verdicts** (grade each detected step against its planned
  step): rejected. It reverses the Telemetry Overlay's deliberate no-per-step
  decision, and — given systematic under-detection — would routinely render a
  fabricated "N of M intervals" that blames the athlete for the detector's
  blindness.
- **Symmetric structural scoring** ("6 of 10 completed"): rejected for the same
  reason. Under-detection makes a downward mismatch uninterpretable; only the
  upward direction is safe to assert.
- **Store the detected structure but do no plan comparison in V1** (defer
  structural adherence to a future effort): rejected as too weak — it narrows the
  destination, which explicitly wants the detected structure scored against the
  prescription. The asymmetric coarse signal delivers that promise without the
  honesty hazards.
- **Let the materialized detected Workout feed Planned TSS** like any
  prescription: rejected as self-referential and dishonest (see Decision 3).

## Consequences

- CONTEXT.md gains a **Structure Adherence** term, two relationship lines, and a
  flagged-ambiguity note separating the two "adherence" signals; the **Planned
  TSS** term notes the `recorded`/`detected` exclusion.
- Extends ADR 0019 (Planned TSS / Adherence Band) with a second, structural
  adherence signal and an explicit no-prescription carve-out; applies the ADR
  0008 honesty rule to structural comparison; builds on ADR 0032 (auto-import),
  ADR 0033 (the honesty gate and the `detected` source), and the #330 prototype's
  documented failure modes.
- Build-time work (a pure `structureAdherence(detected, planned)` comparator, its
  tunable tolerances, the Session-Source guard on the materialize path, and the
  Workout Detail View slot) is left to implementation; this ADR fixes the
  semantics, not the code.
- Short-rep and in-zone sessions that detection cannot see will frequently read
  "structure not confidently verifiable" even when executed perfectly — an
  accepted honesty cost, and further motivation for the lap-ingestion work still
  in the map's fog (#328).
