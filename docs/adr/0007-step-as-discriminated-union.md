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
> The **intensity** half of the Revisit (a `pacePct` kind, a race-pace kind, a
> `lactate` kind, and a named `ref` on `powerPct`) is
> [#449](https://github.com/leskraas/trainm8/issues/449) and is untouched here.

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

A **Block** carries **two repeat levels** — an inner `repeatCount` (the reps in
one series) and an outer `seriesRepeatCount` — plus the recovery between series
and an optional **Send-Off**. A **rest step** carries a **Rest Spec**, a
discriminated union over the four forms rest takes. An **ExerciseSet** states
three orthogonal things — a **Load Target**, an **Effort Cap**, and a
termination rule — rather than two.

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
