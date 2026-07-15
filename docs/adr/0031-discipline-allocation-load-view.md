# Discipline Allocation is a training-load view, not an upcoming-session count

**Discipline Allocation** entered the domain (CONTEXT.md) as _"the summary
distribution of **upcoming** workout sessions by discipline within the **14-Day
Horizon**,"_ explicitly _"calculated from **Workout Sessions**, not from planned
duration or training load."_ It was defined but never implemented — it had no
home in the app.

Making it a real interactive chart (map #309, ticket #319, the second discrete
consumer of the **Chart Primitive**) forced the question the definition had
deferred: **what does a discipline's bar measure?** The ticket framed it as a
"load/time" chart, which contradicts the original count-of-upcoming definition
head-on. Both cannot ship.

## Decision

**Discipline Allocation is the distribution of accumulated actual training load
(TSS) by discipline over a trailing window** — the Trends tab's "Mix" surface.
It sums the actual TSS of _completed_ sessions per discipline over the last **6
weeks**, ranks disciplines heaviest-first, and shows each discipline's share of
the window's total resolvable load. The original upcoming-session _count_
meaning is retired.

The window, the disciplines present, and the totals are all rendered honestly:
the window is named on the surface ("Last 6 weeks"), and a discipline that
trained in the window but whose sessions carry no trustworthy TSS is an
**Unavailable Metric** (ADR 0008) — a marked gap with its session count, never a
fabricated zero bar. Its unresolvable load is excluded from the share
denominator, so it can't dilute the percentages of the disciplines we _can_
measure.

## Why load, not the original count

- **The Trends tab is the load story's one home** (#184): the fitness curve and
  the weekly build already read in TSS. A count-of-sessions bar beside them
  would speak a different currency and answer a weaker question ("how many did I
  do?") than the one the tab is built around ("where did my training load go?").
- **The original definition was speculative and unbuilt.** No code implemented
  the upcoming-count meaning, so there is nothing to migrate and no consumer to
  break — the cost of redefining is only the doc edit.
- **It exercises the primitive where it matters.** A load view has a real
  **Unavailable Metric** path (a discipline with no trustworthy TSS), which a
  pure count — always resolvable — would never trigger. That is exactly the
  contract the Chart Primitive exists to carry (ADR 0029/0030).

## Alternatives considered

- **Keep the count-of-upcoming definition**: rejected. It answers the weaker
  question, speaks a non-load currency on a load-focused tab, and never
  meaningfully hits the Unavailable path.
- **Time share (accumulated duration) instead of TSS**: rejected as the primary
  measure. Duration is available but is a second-class currency here; TSS is the
  app's load unit end to end, and a single currency keeps the Trends tab
  coherent. Duration could return later as an alternate measure toggle.

## Consequences

- CONTEXT.md's **Discipline Allocation** entry and its relationship line are
  rewritten to the load view; a **Flagged ambiguities** note records the
  redefinition and that nothing migrated.
- `buildDisciplineAllocation` (presenter) sums completed-session actual TSS per
  discipline over the trailing window, emitting `null` load + `null` share for
  an Unavailable discipline. It reads the already-loaded ledger — no loader
  change.
- The discipline palette is bridged to the primitive as SVG `fill` classes
  (`disciplineFill` in `cockpit/shared.tsx`), the same hue as each discipline's
  dot — the theme-bridge pattern ADR 0029 established for the Adherence Band.
- The **Discipline Filter** / **Discipline Query** (the Upcoming Workouts
  filter) are unaffected — they were always separate from Discipline Allocation.
