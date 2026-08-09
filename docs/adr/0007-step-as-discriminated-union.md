# Workout Step as a discriminated union of cardio, strength, and rest

> **Amended, structurally (#450, from
> [#435](https://github.com/leskraas/trainm8/issues/435)).** Four things the
> shipped shape could not say, all of them inside the structure rather than
> beside it: a block had **one repeat level**, so `3 × (13 × 30/15)` was
> unexpressible; `rest` carried only `durationSec`, where the field uses **four
> rest forms**; a repeat group had no **send-off**, swimming's universal form
> and neither a duration nor a distance; and `ExerciseSet` never got the union
> treatment the step got, which is why Rønnestad's `10RM → 4RM` — the
> best-evidenced strength protocol in the literature — was unauthorable. The
> `rest` step **kind** is not what changed: what a rest step may carry is.
>
> **Amended, on the intensity axis (#449, from
> [#435](https://github.com/leskraas/trainm8/issues/435)).** The union's axis
> was right and its vocabulary was short by four: `pacePct` (%-of-threshold
> works for power and heart rate but not for pace, which is where it is most
> useful), `lactate` (the Norwegian tradition's defining anchor, and without it
> a seeded "Norwegian threshold" session is a pace session with a borrowed
> name), `racePace` (Canova's entire system, and the whole of the running
> corpus's E-block), and a named `ref` on `powerPct`, which silently meant %FTP
> where the interval literature anchors on MAP and the critical-power literature
> on CP. A new **`PerformanceResult`** model gives `racePace` something to
> resolve against — the research called it "the single blocker for the whole
> feature".
>
> **Lactate is authored and pace is a derived facet — one stored value, not
> two.** See §"The lactate arm" below; this is the decision the amendment turns
> on and the one most easily got wrong.

> **Confirmed by research.** The `kind: 'cardio' | 'strength' | 'rest'` axis and
> the brick-emerges-naturally claim are confirmed independently by the running,
> cycling, swimming and strength libraries; the strength mismatch is one level
> down, in `ExerciseSet`, not in the step shape. See
> [`docs/research/workouts-strength-and-other.md`](../research/workouts-strength-and-other.md).

`WorkoutStep` is a discriminated union over
`kind: 'cardio' | 'strength' | 'rest'`. Each kind has its own required and
forbidden fields. Discipline lives only on cardio steps; Workout itself has no
discipline field. Brick workouts (e.g. bike → run) emerge naturally as one
Workout with cardio steps in different disciplines. Strength steps own an
`Exercise` FK and a 1:N `ExerciseSet` child relation. Intensity Target is stored
on the step as a discriminated union (authored form) plus cached numeric ranges
(resolved form) for queryable comparison against Recording telemetry.

The **Intensity Target** union is eleven arms: `zoneLabel`, `rpe`, `hrBpm`,
`hrPct`, `power`, `powerPct` (with a `ref` of `ftp | map | cp`), `pace`,
`pacePct`, `lactate`, and `racePace` over an enumerated set of **Race Anchors**.

A **Block** carries **two repeat levels** — an inner `repeatCount` (the reps in
one series) and an outer `seriesRepeatCount` — plus the recovery between series
and an optional **Send-Off**. A **rest step** carries a **Rest Spec**, a
discriminated union over the four forms rest takes. An **ExerciseSet** states
three orthogonal things — a **Load Target**, an **Effort Cap**, and a
termination rule — rather than two.

## The lactate arm: one authored anchor, one derived facet

The Norwegian method prescribes a **blood lactate concentration**, and the pace
is a consequence of it — lactate sets the pace, pace does not set the lactate.
Every pace-based rendering of the method is a lossy translation, which is why
`workouts-running.md` flags rows C3/C4 as such and why an `intensityFidelity`
note was proposed to mark them.

Because `IntensityTarget` is a discriminated union — **one `kind` per step** —
"store both" resolves the only way it can:

- **`{ kind: 'lactate', minMmol, maxMmol }` is what is stored.** It is the one
  authored value, and it is a measured target like `hrBpm` rather than a ratio.
- **The channel range is _resolved_ from it**, at read time, against the
  athlete's own **Zone Recipe** — pace on a pace-anchored recipe, bpm on an
  HR-anchored one. There is no second stored number, so nothing can drift.
- **A `ZoneBand` now _declares_ the blood lactate its source publishes it at**,
  exactly as ADR 0045 §3 made it declare its **Training Zone**, and for the same
  reason: lactate is an internal measure and a band's ratio to an external
  anchor cannot imply one. An undeclared band is a positive statement —
  Olympiatoppen's own table leaves I-4 and I-5 blank, and above LT2 there is no
  lactate steady state to quote — so a reading past the last declared band is an
  **Unavailable Metric**, never the nearest band.
- **Rendered `2.5–3.0 mmol/L ≈ 3:35/km`.** The portable name is primary, the
  number is the facet, and the `≈` marks a translation. Its absence is therefore
  meaningful: a `pacePct` target is arithmetic on a number the athlete authored
  and carries no tilde.

**`intensityFidelity` is therefore not built.** It existed to flag a lossy
translation the model could not otherwise represent; once the source anchor is
stored, the loss is visible in the resolution rather than asserted in a note.

**A sub-`T` band is mandatory, not optional**, because it is what `lactate`
resolves _into_. It ships as a new recipe, `norwegian-threshold-run`, rather
than as a band inserted into `daniels-pace-5`: at 1.02–1.05 × threshold pace it
straddles Daniels' `T` and `M` and cannot be inserted without moving one of
them, and `zone-equivalent.ts` read a band's _position_, so an inserted band
would have silently re-filed every runner's `T`, `I` and `R` work. ADR 0006
allows a **defect** to be corrected in place (#444) and requires a **preference
change** to take a new id; this is the second kind. Shipping beside
`daniels-pace-5` moves nobody and owes no **Load Recompute Notice**.

**One defect fixed in passing, which the new recipe forced.**
`zone-equivalent.ts` derived a band's **Training Zone** from its _position_,
which ADR 0045 §3 had already rejected — it read Daniels' `E` as zone 1 and its
`T` as zone 3, and `css-3`'s threshold band as zone 3. A six-band recipe whose
`sub-T` and `T` are both zone 4 cannot be read positionally at all. The band's
own declaration now wins, with position surviving only for bands that
deliberately declare nothing (Daniels' `R`, Stryd's `Z5`). This moves chip tints
and Workout Shape bar heights for runners and swimmers; it moves no **Load
Snapshot**, so it owes an explanation nowhere (ADR 0006's own test).

## Considered options

- **Polymorphic single shape (every field nullable, conditional logic in
  code)**: Rejected — type safety collapses, validation drowns in conditionals,
  and AI generation has no structured schema to follow.
- **Separate tables per kind (CardioStep, StrengthStep, RestStep)**: Rejected —
  Prisma Pattern 4 (single table + kind discriminator + nullable per-kind
  columns) gives the same correctness with simpler joins and ordering across
  kinds within a Block. Reconfirmed by the research rather than reopened: the
  four sport research documents all reach for _more fields on the rest arm_,
  never for a rest table.
- **Discipline on Workout (one discipline per workout)**: Rejected — brick
  workouts and strength-and-conditioning sessions need to mix disciplines within
  one Workout. Putting Discipline on cardio steps lets multi-modal workouts
  emerge naturally.
- **Free-text intensity ("zone 2", "RPE 7")**: Rejected — AI generation,
  Recording comparison, and load math all need structured numbers. The amendment
  below is this same rejection finally applied to the strength channel, which
  received two nullable scalars where the cardio channel received a union.
- **Arbitrarily nested blocks** for the second repeat level: Rejected — a
  recursive block tree is a structural change with a large blast radius (every
  expansion, every load walk, every renderer) bought for one extra level nobody
  has asked to exceed. Two named levels cover Rønnestad's protocol, Lydiard's
  hill circuit and most swim main sets, and the day a third level is genuinely
  needed is the day to pay for recursion.
- **A send-off on the step** rather than the block: Rejected — a send-off
  governs a repeat group, which is what a block is. A mixed set
  (`4 × 100 @ 1:30, 4 × 50 @ :45`) is two blocks, and reads better as two.
- **An absolute-only send-off**: Rejected — `8 × 100 @ 1:40` is a moderate
  aerobic set at 1:20/100 m and physically impossible at 2:10/100 m, so a shared
  Catalogue cannot ship one. The anchored form (`on CSS + 10 s`) is the same
  session for both swimmers. `absolute` survives as the second member because it
  is what a coach writes on the board and an imported set must round-trip.
- **An estimated duration on the rest forms that have none**: Rejected. The
  research asked for a derived `estimatedDurationSec`; attaching a plausible
  number to "until HR < 120" is exactly the fabrication the Unavailable Metric
  rule forbids, and the honest reading is that under HR-recovery a set's length
  is _not knowable_. `restSpecDurationSec()` returns null and callers say so.
- **Replacing `weightKg`/`pct1RM` outright**: Rejected for now — the pair stays
  beside the new `load` union for one release, the way ADR 0047's retired
  columns did, so no shipped payload and no stored row has to move on the same
  day the union lands. A set states its load once: the schema rejects `load`
  together with either scalar.
- **An additive lactate-to-pace offset, or a lactate scale of the app's own**:
  Rejected — the ratio-not-offset rule the research established for swim's
  `CSS + 10 s` applies here too, and a scale we wrote ourselves would be an
  invented constant wearing a lab coat. The bands carry the numbers their own
  published sources print, and where a source prints nothing the app says so.
- **Making `powerPct.ref` required**: Rejected — a required discriminant field
  breaks every shipped block literal and every stored row, for a field whose
  absent value has one obvious meaning. `.optional()` plus "absent means `ftp`"
  costs zero call sites, and the editor writes `ref` only when it is not `ftp`
  so the authored JSON is byte-identical to what it always was.
- **Resolving `ref: 'map'` against FTP**: Rejected — 66 % of MAP and 66 % of FTP
  are different watts, and the app holds no MAP for anyone. Naming the reference
  is the honest half of the fix; the target degrades to an **Unavailable
  Metric** that says which threshold is missing. `ref: 'cp'` resolves for
  running against `runPowerThresholdW` (ADR 0038) and degrades for cycling,
  because **CP is not FTP** — 256 ± 50 W against 249 ± 44 W, and the authors say
  the two should not be used interchangeably.
- **Adding `mapW` / `cpW` columns to `DisciplineProfile`**: Deferred, not
  rejected. `DisciplineProfile` is already six nullable threshold columns and
  two research documents independently reach the same conclusion — the wide row
  is at its limit and a `Threshold` child row keyed `(disciplineProfileId, ref)`
  is the shape that scales. Adding two more columns on the way past would make
  that migration worse, not better.
- **Rounding a race distance onto the nearest anchor**: Rejected — a 4.8 km
  parkrun is not a 5k, and rounding it into one puts a pace the athlete never
  ran behind a `5k pace` target. Anchors are an enumerated set matched on exact
  metres.
- **Resolving `racePace` off the athlete's _best_ result**: Rejected — a
  prescription resolves against what the athlete can do _now_, and a personal
  best from three seasons ago prescribes a target they cannot hold. The most
  **recent** result at that distance is the anchor; the fastest-ever reading is
  a **Personal Record**, a different question with its own derivation (ADR
  0021).
- **Folding the effort cap into the load union**: Rejected — load and effort cap
  are orthogonal and routinely co-occur. "4 reps at 85 % 1RM, stopping if RIR
  falls below 2" has a value on both axes, and one union would force a session
  to choose between naming its load and naming its ceiling.

## Consequences

- `WorkoutStep` table has a `kind` discriminator column, nullable per-kind
  columns (`discipline`, `exerciseId`, `durationSec`, `distanceM`, `verticalM`,
  `gradePct`, `cadenceRpmMin/Max`, `rest`, etc.), JSON for the authored
  Intensity Target, and flat columns for the resolved range
  (`intensityHrMin/Max`, `intensityPowerMin/Max`, `intensityPaceMin/Max`).
- Resolved ranges are recomputed by a background job when athlete thresholds
  change.
- `WorkoutBlock` carries `repeatCount`, `seriesRepeatCount`,
  `betweenSeriesRestSec` and a JSON `sendOff`. The effective number of passes is
  the **product** of the two counts, read through `blockRepeatTotal()` — every
  piece of block arithmetic (Planned TSS, planned volume, the Workout Shape's
  bars, the session's headline target) goes through it, or a `3 × (13 × 30/15)`
  block would be priced at thirteen reps instead of thirty-nine.
- `betweenSeriesRestSec` requires more than one series, and a block states
  either a send-off or rest steps — never both, since a send-off already says
  what the rest is and stating both prices the recovery twice.
- `ExerciseSet` keeps its termination discriminator, now five-valued
  (`reps | timed | amrap | toRir | velocityLoss`), and gains a JSON `load`
  (`absolute | pct1RM | repMax | bodyweight | pctBodyweight | velocity`), a JSON
  `effortCap` (`rir | rpe`, Zourdos' strength scale) and a `tempo` string.
  `toRir` and `velocityLoss` have no authored rep count by construction, and the
  Workout Shape gives them AMRAP's open-ended estimate rather than inventing
  one. The editor authors three of the five kinds; the other two arrive with the
  Catalogue and render read-only until a control exists for them.
- `% 1RM` is one member of the load union rather than the axis, because it is
  not portable below ~85 %: endurance runners manage 39.9 ± 17.6 reps at 70 %
  1RM where weightlifters manage 17.9 ± 2.8, with no difference at 90 %. A
  `repMax` reference is self-calibrating, which is why Rønnestad's protocol is
  written `10RM → 4RM` and why it cannot be restated as a percentage.
- Two load kinds (`absolute`, `pct1RM`) mirror into the legacy `weightKg` /
  `pct1RM` columns. The other four have nothing to mirror into and leave both
  null rather than being converted into a kilo nobody stated.
- `Exercise` is a catalog FK. ~50–100 seed entries ship in migration; athletes
  may add private custom Exercises via `createdByAthleteId`. AI is bound to the
  catalog visible to that athlete and never invents Exercise names in prose.
- App-layer invariants enforced by Zod:
  - `cardio` → discipline required, exerciseId null, sets empty, at most one
    Step Quantity (ADR 0002)
  - `strength` → exerciseId required, sets non-empty, step intensity null
    (intensity lives on each ExerciseSet)
  - `rest` → only a Rest Spec (or its `durationSec` shorthand) and `notes` may
    be set, and never both forms of the same statement
- A rest step's `durationSec` column is the **projection** of a `time` Rest Spec
  and nothing else. Under a send-off, an HR recovery, a distance or an act it
  stays null, because writing a guess into the column every duration reader
  trusts is the fabrication this decision exists to avoid.
- Migration: existing free-text `description` is demoted to `notes`; strength
  rows receive a placeholder Exercise + "needs structure" flag; intensity
  strings become `{ kind: 'zoneLabel', label }`. The #450 columns are all
  additive and nullable (or defaulted to the shipped behaviour), so no existing
  row moves.

- `PerformanceResult` is a new table keyed on `AthleteProfile` —
  `discipline, distanceM, timeSec, occurredAt, source, verified`. It is
  **distinct from an Event Target**, which is a goal (a goal that was met
  produces a result and a goal that was missed produces one too), and **distinct
  from a Personal Record**, which is the derived best over a **Benchmark Kind**.
  It ships with **no writer**: populating it from completed **Events** and from
  activity bests is a derivation with its own honesty rules — which efforts
  qualify, and ADR 0021's **Load Confidence** gate — and duplicating the
  Personal Record detection function here to get one would be the wrong seam.
  Until a writer lands, every `racePace` target degrades to its bare authored
  form, which is exactly what `powerPct` does without an FTP.
- The **Race Equivalence** ladder resolves at **rung 1 only** — the athlete's
  own result at that distance. Rungs 2–5 (a result at another distance
  converted, a **Threshold** read as a virtual race result, a mean-maximal-curve
  fit, then nothing) each need an equivalence model shipped as versioned
  reference data with a distance-ratio confidence rule, and a resolution that
  cannot state which rung produced it cannot be rendered honestly.
- The **notation's `equivalent` facet stays reserved**, for a narrower reason
  than ADR 0027 A2 gave. The race-_authored_ direction ships and needs no slot —
  a `racePace` target renders its portable name as the token text with the
  resolved pace as its facet. The reserved slot is the _inverse_ (a pace
  annotated `= HM pace`), which needs the conversion ladder above.
- **The Token Sentence's intensity popover authors `pacePct` and `lactate`.**
  `pacePct` joins the pace group as a `/km ⇄ % T-pace` unit toggle, converting
  through threshold pace when it is known — and swapping the bounds as it goes,
  since the percentage is of speed and the _slower_ pace is the _lower_
  percentage. **`lactate` gets its own group and no unit toggle**, because it is
  a measured anchor rather than a unit of pace: converting a pace draft into a
  lactate figure would invent a measurement nobody took.
- **`powerPct.ref` and `racePace` round-trip but have no control.** The
  popover's watts toggle now _reads_ the reference so a MAP-anchored target is
  never mislabelled `%FTP`, and skips the conversion when the reference is not
  the FTP it holds; changing the reference, and targeting a race, wait on
  controls of their own — and a race-pace picker in front of a table with no
  writer would be a false promise. The draft carries every new arm's fields, so
  a Catalogue-sourced target survives an editor round-trip rather than being
  silently stripped — which is what the identical gap on the _structural_ facets
  (below) still costs.

**Two things the amendment deliberately stops short of, both owned by the
Catalogue seed ([#451](https://github.com/leskraas/trainm8/issues/451)) and the
authoring port ([#457](https://github.com/leskraas/trainm8/issues/457)):**

- **The Workout Notation does not yet render the new facets.** A Step Vertical,
  a grade, a cadence range, a send-off, the outer series count and a non-`time`
  rest are stored, queryable and carried by every copy, but the Token Sentence
  says nothing about them — so a seeded session reads as less than it is. Each
  is one more token by ADR 0027's render-never-parse rule and none needs a
  grammar; the ticket that has rows to render is the one that should draw them.
  Two facets already render honestly rather than lying: a `toRir` /
  `velocityLoss` set states its condition instead of a rep count, and the
  Workout Shape expands both repeat levels.
- **The draft (form) round-trip drops them.** The Token Sentence editor rebuilds
  a session from Conform form values, and those values carry only the fields the
  editor can author — so opening a Catalogue-sourced session in the editor and
  saving it would write the session back without its cadence, grade, vertical,
  rest form, send-off, series count or set load. The persisted read path and
  `buildBlocksCopy` both carry everything; it is only the form that is narrow.
  Nothing shipped is affected (no stored row carries these fields yet), but the
  seed must not land in front of an editor that silently strips them.
