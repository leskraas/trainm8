# Surface the active plan as a Plan card on home

Plan Generation (ADR 0016) shipped fully wired — Event-anchored, preview →
approve, sessions tagged `generated` — but with **no entry point**: no nav item,
no button, no home presence. ADR 0017 then made home the single training surface
and gave plan generation a one-tap _create_ path via the "+" authoring menu.
That covers creating a plan, but nothing surfaces the athlete's _ongoing_ plan
or nudges an athlete who has none.

## Decision

Add a **Plan card** to the home stack, between the **Training Load Section** and
the **Session Ledger**:

```
Coach card → Training Load Section → Plan card → Session Ledger
```

1. **Adaptive.** When the athlete has an active plan, the card summarizes it;
   when they don't, the same slot shows a **Plan Generation** call-to-action.

2. **Active plan is derived, not stored.** A **Training Plan** is a view, not an
   entity. The active plan is the nearest upcoming **Target Event** carrying a
   **Plan Outline**. Events without an Outline are calendar markers, not plans.
   B/C events folded into an A-priority plan don't get their own card. In the
   Friel model the app already encodes, this is normally exactly one plan, so
   "which plan wins" is a non-problem; nearest-with-outline degrades gracefully
   when data is messy.

3. **Arc-level signals only.** The card shows phase, week N of M, countdown to
   the Target Event, and progress — and deliberately omits this-week counts and
   the next session, which the surrounding home surface already owns.

4. **Progress is weeks-elapsed, not adherence.** The bar measures weeks elapsed
   of total weeks. A sessions-completed ratio would be an **Unavailable Metric**
   (ADR 0008 principle): later phases are materialized on demand, so total
   session count isn't known and the ratio can't be computed truthfully.

## Status

Extends ADR 0017's home stack. Does not reverse ADR 0010 or 0017: the Coach card
remains the primary top signal, and the Coach card + Training Load Section stay
coupled as reading + evidence — the Plan card sits _after_ that pair rather than
splitting it, then bridges to the concrete Session Ledger (state → arc → list).

## Consequences

- The Plan card is purely derived from existing data (Plan Outline + Events +
  sessions + date); it adds no new stored entity.
- The "+" menu (ADR 0017) remains the _create_ path; the Plan card is the
  _surface/resume_ path. Empty-state CTA and the "+" menu point at the same Plan
  Generation flow.
- Tapping the active-plan card opens the **Target Event** detail
  (`/training/events/$eventId`) — the Event owns the **Plan Outline**, so no new
  plan-detail page is added (consistent with ADR 0017's "fewer subpages"). The
  empty-state CTA instead opens the Plan Generation wizard
  (`/training/plan/new`).
- If an athlete deliberately keeps two overlapping plans (e.g. a 10k plan and a
  marathon plan over the same dates), the card shows the nearer one only. This
  is double-planning the domain already discourages; not designed for here.
