# Consolidate training surfaces onto the home view

The app had grown several primary surfaces that all show facets of the same
training: the home **Dashboard** (`/`), a separate `/training/upcoming`
(**Upcoming Ledger**), and a separate `/training/load` deep-dive. ADR 0010 put
the single **Form (TSB)** number on home as the **Coach card** and deliberately
pushed the full CTL/ATL/TSB triad to `/training/load`; ADR 0011 kept that page
as a secondary deep-dive rather than deleting it.

In practice this fragmented one mental model — "my training" — across three
destinations. The forward half of the home **Session Ledger** already duplicated
the **Upcoming Ledger**, and the Coach card's "View load trend →" link sent the
athlete to a near-empty page to see the numbers behind a reading that lives on
home. The goal of this change: more of the training story on home, fewer
subpages to navigate.

## Decision

Make the home **Dashboard** the single viewing surface for training, and delete
the two redundant pages.

1. **Delete `/training/upcoming`.** The **Session Ledger** on home is the one
   chronological list (past · Now · planned); the **Upcoming Ledger** as a
   separate dense surface (filters, allocation, shape, summary counts) is
   retired. The **Workout Detail View** that was nested under it moves to a
   surviving route (e.g. `/training/sessions/$sessionId`) so ledger rows still
   link through.

2. **Fold `/training/load` into home as the Training Load Section.** Directly
   beneath the Coach card sits an always-visible section that exposes the
   CTL/ATL/TSB triad as _evidence_, with a single toggle between the numbers and
   their trend graph. `/training/load` is deleted. The Coach card keeps its
   plain-language headline reading and loses its link to the (now absent)
   deep-dive.

3. **Honest cold-start for the section.** While Form (TSB) is untrustworthy, the
   Training Load Section stays visible but carries the same "building baseline —
   day N/42" caveat as the Coach card (per the **Unavailable Metric** principle,
   ADR 0008/0010), rather than hiding the very data the caveat refers to.

4. **Simplify navigation.** The primary pill nav becomes **Home · Settings**.
   The "Training" pill (which pointed at the deleted `/training/upcoming`) is
   removed. **Events** and **Imports** live in the "More" overflow menu. The "+"
   button becomes a small authoring menu — _New session_ / _Generate plan_ /
   _New event_ — so plan generation (ADR 0016) stays one tap from anywhere
   despite Events moving into "More".

## Status

This reverses the _placement_ decisions of ADR 0010 (full triad off home) and
supersedes ADR 0011 (keep `/training/load`). It does **not** reverse ADR 0010's
substance: the Coach card remains the single plain-language daily signal, and
the triad is still progressively disclosed (numbers by default, graph behind a
toggle) rather than thrown at the athlete. The **Training Load** engine and
snapshots are unchanged.

## Consequences

- Home stacks top-to-bottom: **Coach card** → **Training Load Section** →
  **Session Ledger**. It remains calm by default (numbers, not graph) and stays
  the default post-login destination.
- Two routes are deleted outright; `/training/upcoming` and `/training/load`
  will 404. No redirect is added — these were never shared/public destinations,
  so the indirection is not worth carrying.
- The **Discipline Filter** / **Discipline Allocation** / **Workout Shape**
  affordances that lived only on the Upcoming Ledger are dropped for now; if
  they prove missed, they return as progressive disclosure on the home ledger,
  not as a separate page.
- Navigation shrinks to two pills plus a "More" menu and an authoring "+" menu;
  Events is reachable in two taps (More → Events) but creating a plan is one tap
  (+ → Generate plan).
