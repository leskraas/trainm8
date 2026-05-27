# Near-term scope: a session tracker surfaced as one Form number

The domain model and `CONTEXT.md` describe an ambitious periodized planner
(Events with A/B/C priority, taper language, the full TSS/CTL/ATL/TSB triad, The
Tape). For the near term we deliberately narrow scope to: simple Workout Sessions
plus a single user-facing **Form** number (TSB) translated to plain language,
computed from sessions and RPE. Periodization (training phases / season planning)
and The Tape are deferred.

Rationale: Excel already handles dense ledgers and periodization tables well. A
dedicated tool's edge is heavy analysis surfaced as a few trustworthy, simple
numbers. Form (TSB) is the highest-value daily signal and the engine already
computes it. Cold-start is handled honestly — show "building baseline" rather
than a misleading number, per the **Unavailable Metric** principle.

## Consequences

- **Training Load** stays in the model and keeps being computed; we are scoping
  down what is *surfaced*, not removing the engine. Load remains available for
  later forward-planning features.
