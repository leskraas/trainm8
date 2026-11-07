# A race pace converts from the nearest result, picks it from stored results alone, and binds to the result it read

Status: Accepted · Ticket #674 (map #465) · Amends
[ADR 0007](./0007-step-as-discriminated-union.md)'s consequence that the **Race
Equivalence** ladder resolves at rung 1 only · Follows
[ADR 0006](./0006-zone-system-in-code.md)'s pattern for the equivalence model ·
Applies [ADR 0098](./0098-source-terms-bind-per-origin-platform.md) §1, §3 and
§6 to converted targets, as #670's ADR (an Event's result is a Performance
Result, bound by its origin) §4 does for rung 1

## Context

A `racePace` target resolves only against a **Performance Result** at exactly
its **Race Anchor** (rung 1), so an athlete with a 5k and a `10 km-fart` session
sees a bare name. #674 walks rung 2: a result at another distance, converted.
The research's ladder (`portable-intensity-anchors.md` §4.3) picks its source
from results "within 365 days" and grades rung 1 by recency, which makes _which
result_ a target reads depend on the day it is viewed. A low-confidence
conversion renders as a band, and the confidence turns partly on the source's
age. Three readers take a resolved pace as a number: Planned TSS (ADR 0019), the
cached `intensity*` columns, and chip tint. And since #670, a result can come
from a Garmin or Polar Recording, whose terms follow anything derived from it.

## Decision

### 1. The ladder picks from stored results alone; the day viewed only grades

For a `racePace` target in run:

- **Rung 1**: the newest run result at the anchor itself, the typed one on a
  same-day tie (#670). A result at the anchor always wins over a conversion,
  however old.
- **Rung 2**: otherwise, the run result whose distance is nearest the anchor by
  ratio (the longer over the shorter, converting either way), any stored
  distance, an off-anchor one included; at that distance the result rung 1 would
  pick. A tie on ratio goes to the newer result, then the longer distance.
- Otherwise nothing: the bare authored name, as today.

Which rung and which result resolve a target are a function of the athlete's
stored results and nothing else. There is no recency window: ageing never moves
a pace, it lowers the confidence. This departs from the research's pseudo-code
(§4.3) on purpose; its own §5.4 treats recency as a grading signal, which is how
it is used here.

**Confidence** is the weakest of the distance ratio (≤ 2 `high`, ≤ 4 `medium`,
above 4 `low`) and the source's age on the day viewed, in the athlete's timezone
(under 90 days `high`, 90–365 `medium`, older `low`). Rung 1 is graded by age
alone. A grade never hides a target.

### 2. The equivalence model is reference data in code, keyed by an id

`riegel-1.06` (Riegel, exponent 1.06, with 1.15 as the recreational exponent its
low band reaches to) is a typed constant beside the resolver, as ADR 0006 keeps
zone recipes. A revised exponent ships as a new id; a resolution says which id
produced it. No row stores the id.

### 3. The point is the pace; the band is a display facet

The resolution's pace (what `paceMin`/`paceMax` carry, with the step's own
percentage applied) is always the point at the model's exponent. A `low`
conversion additionally renders the range from that point to the pace at the
recreational exponent, with the step's percentage on both edges; that range is
computed at display from the resolution and the day viewed, never written into
the pace. Planned TSS, the cached `intensity*` columns and chip tint read the
point, so none of them moves with the date and none is computed from a band.
Converting a longer result down to a shorter anchor puts the 1.15 edge on the
fast side; the point is still the 1.06 pace.

### 4. The provenance is derived on read

The resolution carries `via` (`actual-result` or `race-equivalence`), the source
result (distance, time, day, typed or measured, its binding set), the ratio and
the model id. One function produces it, from one read of the athlete's run
results at every distance; the screen's resolver and Planned TSS both call it,
so they cannot disagree on the rung or the result. It is stored nowhere: the
Target Resolution's frozen completion stamp is still to come.

### 5. A converted target binds to the result it read

A converted target is derived from its source result exactly as a rung-1 target
is (#670's ADR §4): its binding set is the source's (the Recording's Origin
Platform plus its aliases'; nothing for a typed result). So:

- **Planned TSS** stores, beside its value, the union of the binding sets of the
  results its `racePace` steps resolved against (the column #670 adds), and
  every reader that sends it to `model`, starting with `plannedReading` in
  `app/actions/session-summary.server.ts`, unions that with the Workout's set. A
  Polar-derived Planned TSS is `source-terms` without the Polar opt-in (ADR
  0108); a Garmin-derived one carries the Garmin credit.
- **On screen**, the session's score stanza carries `derivedAttributionLines`
  for the union of its resolved targets' binding sets as `SourceCredits`,
  visible with the provenance popover closed (ADR 0098 §3: never only in a
  tooltip); the popover repeats it.
- **An I dag row** whose shown `≈` pace was derived from a Garmin or Polar
  result carries the derived credit in the row's existing `SourceCredits` line,
  after the row's own Recording credit if it has one (ADR 0098 §6's slot,
  extended from rows built on a Recording to rows showing a value derived from
  one).

### 6. Any change to a run result recomputes scheduled Planned TSS

Adding, replacing or removing a run result at any distance recomputes the
Planned TSS of the athlete's `scheduled` sessions, typed results through their
writer and Event results through #670's reconcile. Nothing recomputes on the
calendar: §1 and §3 leave Planned TSS a function of stored results.

## Considered options

- **The research's 365-day window for rung 1 and rung 2.** Rejected: a session
  viewed a day later could switch from a 10k result to a converted 5k, its pace
  jumping with nothing the athlete did; and Planned TSS, stored once, would go
  stale on the calendar with no event to recompute it.
- **The band's midpoint, or its slow edge, as the pace.** Rejected: confidence
  turns on age, so Planned TSS and the cached columns would move as days pass.
- **The resolver takes the day viewed and returns the band as `paceMin`/
  `paceMax`.** Rejected for the same reason, and because the cached columns
  would freeze whatever band the day of the write produced.
- **Store the provenance or the model id on the step.** Rejected: it is a cache
  of a function of stored results, and the frozen stamp is a separate decision.
- **A plan-side target binds to nothing** (ADR 0098 §1's plan-side clause).
  Rejected, as #670's ADR rejects it for rung 1: the number is computed from the
  vendor's data.
- **The credit only in the popover, or no credit on I dag rows.** Rejected: ADR
  0098 §3 and §6 put a credit by what it speaks for, never only in a tooltip.

## Consequences

- `RaceAnchorPaces` (an anchor to a number) gives way to a per-anchor source
  with its provenance, built by one function in place of the two places that
  build anchor paces today (`performance-result.server.ts` for the screen,
  `load/planned-tss.server.ts` for Planned TSS); the query reads every run
  distance, not only the anchors.
- Rung 3 (a **Threshold** read as a virtual race result) slots in below rung 2
  with its own `via`; it is the next ticket.
- Swim and bike race paces, a per-athlete fitted exponent, and the inverse
  `equivalent` facet are not decided here.
