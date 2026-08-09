# Step Quantification: one Step Quantity of three, plus Step Parameters

> **Amended (#450, from
> [#435](https://github.com/leskraas/trainm8/issues/435)).** The XOR is right
> and the cardinality was wrong. A **Step Quantity** is now one of **three** —
> Step Duration, Step Distance, **Step Vertical** — and two **Step Parameters**
> (`gradePct`, cadence) join them as things a step states that are not
> quantities at all. The swim research's **send-off** was the fourth request and
> it does not belong here: it governs a repeat group rather than a step, so it
> lands on `WorkoutBlock` under ADR 0007. The original decision and its rejected
> options are unchanged below; this note says what the shape grew.

Each WorkoutStep may carry an optional **Step Quantity**: a Step Duration (in
seconds), a Step Distance (in meters), or a **Step Vertical** (in metres of
climb) — never more than one. All three are optional: an unquantified step is
valid ("warm up until ready").

Beside the quantity a step may carry **Step Parameters**, which do not compete
with it and never substitute for it: a signed `gradePct` and a
`cadenceRpmMin`/`cadenceRpmMax` range.

## Considered options

- **Single polymorphic field with a unit column**: Rejected — adds complexity
  for two well-known dimensions that behave differently (time is additive for
  shape width; distance is not directly comparable without pace).
- **Both fields allowed simultaneously**: Rejected — semantics are ambiguous
  ("run 5 km in 20 min" conflates quantity with target). If a future slice needs
  pace targets, that is a separate field.
- **Required quantity on every step**: Rejected — many real workouts contain
  open-ended steps ("strides on flat ground", "warm up until ready").
- **Grade and cadence as a third and fourth quantity**: Rejected — they are not
  magnitudes of the work, they are conditions the work happens under. A hill
  session is `6 min @ 8 %`: it has a duration _and_ a grade, and forcing the XOR
  over them would make the two mutually exclusive for no reason.
- **Leaving grade and cadence in `notes`** (the shipped behaviour): Rejected on
  the evidence. All five of the running research's G rows seed today with their
  `6–10 %` grade in free text, which reads correctly to a human and is invisible
  to every filter, planner and adherence check — indistinguishable from a flat
  session. That is a silent hole rather than a visible one, and the honest fix
  is a column, not better prose. Cadence is the same defect on the cycling side:
  it is the **defining variable** of six sessions, and `ActivityStream` already
  stores `cadenceAvg`, so today the _measured_ side exists and the _prescribed_
  side does not — those sessions can never be verified against their recording.
- **A `verticalM` derived from grade and distance**: Rejected — it is only
  derivable when both are stated, and a vertical-kilometre test states neither.
  Deriving it would also invent a number for the mountain long runs that state
  climb and nothing else.

## Consequences

- `WorkoutStep.durationSec Int?`, `WorkoutStep.distanceM Int?` and
  `WorkoutStep.verticalM Int?` in the Prisma schema, plus `gradePct Float?`,
  `cadenceRpmMin Int?` and `cadenceRpmMax Int?`.
- The Zod authoring schema enforces the XOR across all three quantities: a step
  with more than one set is rejected at validation time. Parameters are exempt
  by construction and a cadence range must run low to high.
- `gradePct` is **signed**. A descent is a real prescription, and the trail and
  hill literature prescribes them; clamping to positive would have quietly
  reclassified every downhill rep as flat.
- Workout Shape width uses Step Duration when present; unquantified steps
  contribute zero width. A Step Vertical resolves to no width — the app holds no
  vertical-ascent rate for an athlete, and estimating one from grade and pace
  would be a fabricated number (Unavailable Metric, ADR 0008).
- The detail view formats duration as friendly time ("10 min", "1 h 5 min"),
  distance with units ("400 m", "1.5 km") and vertical as metres of climb.
- Cadence ships with honest copy. The evidence for low-cadence and torque work
  as a _performance_ lever is weak to null — a 12-week 40 rpm trial found no
  gain in VO₂max, performance or leg strength while the free-cadence control
  improved. The field exists for **prescription fidelity**, so the app can say
  what a session actually is, and no seeded description may claim it builds
  strength.
