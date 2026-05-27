# Near-term scope: a session tracker surfaced as one Form number

The domain model and `CONTEXT.md` describe an ambitious periodized planner
(Events with A/B/C priority, taper language, the full TSS/CTL/ATL/TSB triad, The
Tape). For the near term we deliberately narrow scope to: simple Workout
Sessions plus a single user-facing **Form** number (TSB) translated to plain
language, computed from sessions and RPE. Periodization (training phases /
season planning) and The Tape are deferred.

Rationale: Excel already handles dense ledgers and periodization tables well. A
dedicated tool's edge is heavy analysis surfaced as a few trustworthy, simple
numbers. Form (TSB) is the highest-value daily signal and the engine already
computes it. Cold-start is handled honestly — show "building baseline" rather
than a misleading number, per the **Unavailable Metric** principle.

## Consequences

- **Training Load** stays in the model and keeps being computed; we are scoping
  down what is _surfaced_, not removing the engine. Load remains available for
  later forward-planning features.

## Placement (resolved)

The "which surface" question — previously deferred — is resolved via prototype:
the Form (TSB) number lives as the **Coach card at the top of the home page**
(`/`), with the dense session ledger directly below it. We are **not** building
a separate `/training/load` destination as the primary daily surface; the
existing `/training/load` page remains only as a secondary detail view.

- Below the trustworthiness threshold (see ADR 0008 and the cold-start gate) the
  Coach card shows a "building baseline — day N/42" state instead of a number.
- At/above the threshold it shows the plain-language readiness label plus a
  short recommendation, derived from the TSB value.
- The home surface (`/`) is the athlete's default destination after login.
