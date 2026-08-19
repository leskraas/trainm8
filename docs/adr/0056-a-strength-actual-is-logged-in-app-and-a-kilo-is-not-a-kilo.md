# A strength actual is logged in-app, and a kilo is not a kilo

Status: Accepted

Stage 1 of
[`out-of-the-box/strength-destination.md`](../wayfinder/out-of-the-box/strength-destination.md).
Research:
[`strength-tracker-surfaces.md`](../research/strength-tracker-surfaces.md) §3,
§4, §5;
[`workouts-strength-and-other.md`](../research/workouts-strength-and-other.md)
§14.6.

**Amends `GOAL.md`'s no-in-app-recorder non-goal**, scoping it to cardio.
**Builds
[ADR 0046](./0046-no-load-number-spans-incommensurable-training-tracks.md) §4's
Strength Summary Count**, which that ADR mandated and which was never built
because nothing recorded what was lifted. **Scopes
[ADR 0027](./0027-text-first-workout-authoring.md)** to the prescription:
render-never-parse is untouched and the Token Sentence does not reach the log.
**Confirms [ADR 0008](./0008-tss-triad-with-hr-first.md)** — the Unavailable
Metric principle is what stops a machine level from being converted into kilos.

## Context

The strength track has a prescription layer and no performance layer.
`ExerciseSet` is a child of `WorkoutStep`, which is a child of the
**prescription** — it carries `reps`, `load`, `effortCap`, `tempo`, and there is
no `actualReps`, no `completedAt` and no row anywhere that says what happened.

**And nothing was going to bring one in.** Verified against every import path:
no path anywhere carries an `ExerciseSet`. Strava and Intervals.icu both map
`WeightTraining | Workout | Crossfit` to `strength` and deliver a whole-activity
summary; FIT, TCX and GPX carry no set-by-set data either. So a completed
strength session's entire actual was:

```ts
sRPE = (durationSec / 3600) × rpe × 15   // confidence: 'low'
```

An athlete could plan `5 × 5 squat @ 100 kg` and record **"it felt like an 8."**

`GOAL.md`'s non-goal said executed data arrives via **Activity Import**, never
from trainm8 capturing it live. Applied to the endurance tracks that is a sound
boundary: a GPS trace exists elsewhere and importing it is strictly better than
recording it. Applied to strength it is not a deferral — it is a
**foreclosure**, because there is no other route by which a strength actual
could ever arrive. `GOAL.md` pillar 1 calls the plan↔actual loop _"the wedge
Strava can't reach"_; for one of the four disciplines it was unreachable by
policy.

## Decision

### 1. The recorder non-goal is scoped to cardio

> **No in-app activity recorder** — trainm8 is not a GPS or live-telemetry
> capture device. Executed **cardio** data arrives via **Activity Import**,
> never from trainm8 capturing it live. **Strength is the exception, because no
> provider exports set-by-set data: logging sets, reps and load in-app is the
> only way a strength actual can exist.**

The boundary the non-goal was protecting is intact and is stated more precisely
than before. trainm8 still captures no GPS, no heart rate, no per-sample
telemetry, and still starts no clock against a moving athlete. What it now
accepts is **the athlete typing a number after the fact**, which is what a set
log is and what a **Session Log** already was.

### 2. `ExerciseSetLog` is a separate entity, and that is a decision about the Catalogue

The two production models that got the logging surface right — liftosaur's
`ISet` and wger's `WorkoutLog` — put target and actual **in the same row**
(`reps` / `completedReps`, `weight_target` / `weight`), and
`strength-tracker-surfaces.md` §3.1 recommends the same here on the grounds that
a separate table "pays a join on the hottest surface in the app".

**That recommendation is right for their schema and wrong for this one.** In
those apps a program instance is per athlete per day, so the prescription row
has exactly one occurrence to be filled in. Here:

- `Workout` is **1:N** with `WorkoutSession` (`Workout.sessions`), so one
  prescription can be scheduled more than once;
- a **Catalogue** member is a `Workout` with `authorship: 'system'` and
  `ownerId: NULL`, read by every athlete (ADR 0051, 0052).

Writing performed reps onto `ExerciseSet` would write **one athlete's
performance into shared corpus content**. The join is the price of the
Catalogue, and it is the correct price.

The key is `(sessionId, stepId, orderIndex)` — the occurrence, the exercise
slot, the position in the set list — which makes a save from the grid an
**upsert**. The between-sets double-tap is the single most likely interaction on
the surface and it must not be able to log a set twice.

`exerciseSetId` is **nullable on purpose**: an athlete who felt good and did a
sixth set has a real set with no prescribed row to answer, and `SET NULL` keeps
that set after a later edit deletes the row it pointed at.

**Amended (2026-08-19): `stepId` is nullable on exactly the same grounds, and it
was not.** The care above was taken for the prescribed _set_ and not for the
exercise _slot_, which shipped `ON DELETE CASCADE`. The session-detail editor
saved by deleting every `WorkoutBlock` and re-creating the subtree, so every
Step got a new id on every autosave — and changing one step's exercise took all
five of that session's logged sets with it, with no warning and no undo. Three
changes, and the order is the order of preference:

1. **The ids are stable.** `updateWorkoutSession` reconciles blocks, steps and
   sets **in place**, positionally, so an ordinary edit renames nothing the logs
   point at and the cascade never fires. A fork-on-write adoption re-points this
   session's logs onto the forked Steps.
2. **An edit that would change what a Step _is_ is refused** — a different
   exercise, a different kind, or the Step gone, while sets are logged against
   it — and the editor says so before the athlete taps. Re-pointing the sets at
   the new exercise was the alternative and it is the worse lie: a record and an
   anchor would then be read off a lift nobody did.
3. **`stepId` is `SET NULL`**, as the floor under every other path a Step can
   die by. A detached set keeps its `exerciseId`, which is what the per-exercise
   history, the records and the anchors read.

**The key does not change and the double-tap guarantee is untouched.** Logging
always names a live Step, so every row the upsert can reach has a non-null
`stepId` and `(sessionId, stepId, orderIndex)` constrains it exactly as before.
A NULL arrives only later, from a deletion, and such a row is never an upsert
target again; SQLite treating NULLs as distinct is what lets a detached set sit
beside the set that takes over its slot.

**An anchor read from a set that is gone states that.** `ExerciseThreshold` is
append-only and `sourceSetLogId` is `SET NULL` — the value is the athlete's own
and must survive — but a row naming _"Epley/Welday"_ with nothing behind it
asserts a derivation it cannot produce. The reader says the reading and says the
set is no longer on file (`anchorDerivation`), which is ADR 0008's Unavailable
Metric applied to a provenance rather than to a number.

### 3. A kilo is not a kilo — `weightKg: Float` is wrong five different ways

This is the highest-consequence call in the slice, because every one of these
errors is invisible until it corrupts a record.

| Equipment          | The number means             | The trap                                      |
| ------------------ | ---------------------------- | --------------------------------------------- |
| Barbell            | total including the bar      | —                                             |
| Dumbbell / KB pair | **per hand**                 | `32` outranks a 60 kg barbell press in a list |
| Bodyweight         | the athlete, **at the time** | today's weight rewrites last year's records   |
| Bodyweight + added | `bw + n`                     | storing `n` makes a weighted dip a curl       |
| **Assisted**       | `bw − n` — **inverted sign** | more number = _less_ work                     |
| Machine stack      | an **ordinal**               | "7" here ≠ "7" on the next machine            |
| Band               | a force curve                | any kg conversion is fabricated               |

So `load` is a **`LoadValue`** discriminated union in JSON — eight members — and
the kilo is a **derived function that is allowed to refuse**. `effectiveLoadKg`
returns `null` for a stack level, a band, an unloaded hold, and for any
bodyweight-derived load with no bodyweight on file. That is ADR 0008's
Unavailable Metric principle one level down: **a machine level has no honest
kilo, and inventing one to make a chart continuous is precisely the fabrication
this repo forbids.** A stack-level exercise still progresses against itself
(level 6 → 7 is real), so only cross-exercise comparison is unavailable, and the
surface says so in one phrase — _"No kilos — this progresses against itself
only."_

**`effectiveKg` is baked at log time, and never recomputed.** This looks like
the derived-never-stored rule being broken and it is not: a bodyweight-derived
load depends on the bodyweight _then_, so recomputing it would silently rewrite
a two-year-old weighted-dip record after a 6 kg change. `bodyweightKg` is stored
beside it so the number can be audited and re-derived. The same resolve-and-bake
as a Step's resolved intensity ranges.

### 4. ADR 0027 governs the prescription and stops at the log

ADR 0027 makes the prescription a **rendered sentence**, and that decision
stands: a prescription is read before the session, on the couch, and
`5 × 5 @ 100 kg · 3 min rest` reads well.

The **log is the same data in the other mode** — written during the session, one
number at a time, twenty seconds after a heavy set, one-thumbed. A sentence is
the worst possible shape for that: every edit is a popover, the numbers do not
align into columns, and the set-by-set diff against last time is invisible.
Forcing a set log into a Token Sentence would reproduce #434's verdict — _"too
much text, the flow and design is too hard to follow"_ — in the one place an
athlete has the least attention to spare.

> **The Token Sentence renders the prescription. The set grid records the
> performance. They are the same rows in two modes.**

Render-never-parse is untouched: the sentence remains a pure function of
structure, and the grid parses nothing — it posts typed fields to an action.

The surface's own rule, from the same finding: **the two-thumb path is three
controls per row** — load, reps, ✓. Reps in reserve, the other side of a
unilateral set, to-failure and abandoned all sit behind the row's own control.
Asking for all of it on every set of every session is how a logger becomes a
chore.

### 5. The **Set Ghost** is text, matched positionally, and never a prefilled input

Each row shows what the athlete did on **this exercise** last time. Four rules,
each one a bug avoided:

- **Not the last calendar session** — the last session containing this exercise.
  Otherwise a push/pull/legs split shows the wrong ghost two days in three.
- **Matched positionally**, so a ramp (60/80/100) shows the right ghost per row.
  Nearest-weight matching would show 100 kg against the warm-up.
- **An extra row borrows the last ghost, flagged** — an empty ghost on set 5 of
  5 reads as "new territory" when it only means "you did four last time".
- **It is text, and the input stays empty.** The observed failure mode across
  several apps is athletes logging the ghost by accident and never noticing, so
  filling it is an explicit tap. The per-exercise _"Fill from last time"_ fills
  the inputs and stops there — it never submits on the athlete's behalf.

Warm-ups and abandoned sets are dropped from the previous session before
matching, so adding a warm-up does not shift every working row's ghost by one.

### 6. "Failed" means three things, and only one of them gets a column

- **Missed the target** — prescribed 5, got 3. **Derived** from
  `reps < prescribedReps`. A `failed` column beside a rep count is redundant
  state that can disagree with the number it describes.
- **Went to failure on purpose** — an AMRAP that succeeded. A _plan_, not a
  miss, so it is `toFailure`.
- **Abandoned** — racked it, form broke. Not a rep count at all, so it is
  `outcome: 'abandoned'`, and it is what every aggregate drops.

`role` is the one flag that _is_ stored rather than inferred, because a warm-up
changes what the row means to every downstream number. Three values, not wger's
nine: `dropSegment` and `myoMini` are **segments of one set**, not sets, and
admitting them as roles would let a drop set count as three hard sets.

### 7. ADR 0046 §4's Strength Summary Count ships, and the endurance ratio says which track it is

Two features, one entity. The count is **sessions with at least one logged
working set, over strength sessions materialized in the week** — and it is
deliberately a count rather than a second **Adherence Band**, for ADR 0046 §4's
reason unchanged: a band's cut points are asymmetric on a stated principle about
volume overshoot, and this repo has no source for that asymmetry on a session
count.

A week with no strength session reads as an **absence**, never `0 of 0` — a
Summary Count is derived from _existing_ sessions and `0 of 0` reads as a
completed week.

ADR 0046 §4's other half lands with it: the weekly load figure now reads **"92%
of planned endurance load"**. The ratio is a TSS ratio, strength has no TSS by
decision (ADR 0046 §2), so the figure was never the week's — it was endurance's,
presented as the week's. Its arithmetic is untouched; only its claim is, which
is the fix ADR 0046 §4 named.

### 8. `deload` is not used, in either sense

The word collides: in the StrongLifts program family it means a **per-lift −10 %
cut on failure**; in ADR 0047 it means a **planned −50 % week** in a season
segment. This slice logs sets and does not decide what to lift next, so it
introduces neither, and the vocabulary is settled before the program engine
rather than during it: **ADR 0047 keeps `deload` for the planned week; the
per-lift cut on failure will be named something else.**

## Considered options

- **Columns on `ExerciseSet`** (`actualReps`, `completedAt`, …), as liftosaur
  and wger do. Rejected — §2. It writes an athlete's performance into Catalogue
  rows that belong to nobody.
- **`weightKg: Float` on the log, with equipment handled at display time.**
  Rejected. The sign inversion on an assisted machine and the per-hand
  multiplier are not display concerns; they change what the number _is_, and
  every aggregate downstream would have to re-derive the same switch from an
  `Exercise.equipment` string that is nullable and free-text today.
- **Convert a stack level or a band to kilos so tonnage stays continuous.**
  Rejected outright. There is no conversion; a stack is not standardised and a
  band is a non-linear force curve. This is the fabrication the building
  principle forbids.
- **A `failed: Boolean`.** Rejected — §6. It is three claims in one field, and
  the most common of them is already visible in the numbers.
- **Session tonnage and a logging streak.** Rejected, and not deferred. Tonnage
  rewards junk volume and inverts the portability thesis ADR 0046 §1 rests on; a
  streak measures app-opening. Neither is a reading about training.
- **The segment list** (`segments[]`, which collapses drop sets, myo-reps,
  clusters and rest-pause into one shape). Deferred, not rejected — see
  Consequences. The row-per-set model does not foreclose it: a segment list
  arrives as a column on this table, and the four techniques stay unloggable
  until it does rather than being logged wrongly as three separate sets.
- **Routing the log through the Conform-backed session editor.** Rejected on
  sight. `WorkoutAuthoringSchema`'s round trip silently drops `load`,
  `effortCap` and `tempo` — `catalogue-seed.server.ts` already bypasses it for
  exactly this reason — and `load` is the one field a set log exists to record.

## Consequences

- **§3's table is now code, in one place: `kiloLoadBasis` / `KILO_LOAD_BASES` in
  `strength/program-rules.ts`.** The table says which kilos mean different
  things; that function is the **partition every ranking reads** — the program
  engine's success predicate, the records surface (ADR 0058 §9) and the
  per-exercise history all import it rather than restating the table for
  themselves, and it is derived from `loadKindComparability` rather than being a
  second classification beside it. It has **no default branch**, so a ninth
  `LoadValue` member cannot arrive as a bar weight by omission, and `unstated`
  fails closed: a row nobody classified is left out of an ordering rather than
  joining the bar's pile. This ADR remains the authority for _why_ the piles are
  what they are; when they change, that function is the one place to change, and
  a fourth copy of the table is the defect to look for. The class of bug it
  exists to prevent is written up in ADR 0058's head note, and it was two
  surfaces each deciding for themselves what a stored kilo meant.
- **`ExerciseSet.weightKg` and `pct1RM` are now legacy on both sides.** The
  performed side never had them; the prescription side keeps them for one more
  release as ADR 0007 planned.
- **`pct1RM` and `repMax` still resolve to nothing.** `setLoadText` renders all
  six `LoadTarget` members correctly and resolves none of them, so a set
  prescribed `@ 85 % 1RM` reaches the grid as the literal string and the athlete
  does the arithmetic. That is the next slice's job (`ExerciseThreshold`), and
  it cannot be fixed with a column: `DisciplineProfile`'s
  `@@unique([athleteProfileId, discipline])` makes a squat 1RM and a deadlift
  1RM the same row.
- **Four set shapes remain unloggable**: drop sets, myo-reps, clusters and
  rest-pause. They are not four features — they differ only in `intraRestSec`
  and whether the load descends — and they need one column, not four `kind`s.
  Stated as an absence rather than approximated.
- **Supersets and circuits have no container**, so their rest belongs to the
  last set rather than to the group. Unchanged from the prescription side, where
  the same gap already exists.
- **`perSide` is in the union and not in the picker.** A per-hand load also
  needs to know whether _this_ exercise is two-handed — a "32 kg dumbbell press"
  is 64 kg and a "32 kg goblet squat" is 32 kg, same equipment — and that is a
  property of the exercise. The stored shape assumes nothing; the picker gains
  the member when the exercise database carries load semantics.
- **The load kind lives in component state, not on the exercise.** It defaults
  from the prescription and from what was logged last, which is right for today
  and is a re-answer per visit. Persisting it is the exercise database's job,
  and the progression key there should be `(exerciseId, equipment)`.
- **The rest timer does not survive a closed tab.** It is derived from a
  wall-clock deadline rather than a decremented counter, so backgrounding is
  safe; a scheduled local notification is the honest fix and is not built.
- **Nothing marks the session completed.** The Summary Count reads logged
  working sets rather than `status`, deliberately — a session whose sets are
  logged _is_ done, and a second source of truth for that could disagree with
  the sets. But `WorkoutSession.status` therefore still says `scheduled` on a
  fully logged strength session, and the two will need reconciling. **Reconciled
  by the session runner (spec Slice 5), by direction rather than by a second
  source of truth:** finishing is an **explicit athlete act** that writes
  `status: 'completed'`, and every strength aggregate still reads logged working
  sets and never `status`. The column is calendar and list state, the sets are
  the truth, and neither is derived from the other. Finishing a session with no
  logged working set is refused, so the column cannot claim a day the sets do
  not.
- **The plate calculator is not built.** It is the passive annotation under the
  weight input (`20 · 20 · 10 · 2.5` per side), and it needs a per-athlete plate
  inventory to be anything but a lie about what the gym owns. **Built in spec
  Slice 5** on the `PlateInventory` the athlete describes at
  `/settings/training/gym`; where they have described no gym there is **no plate
  line at all**, which is the absence rather than an assumed rack.
- **#469 is closed.** `Exercise.authorship` is asserted rather than inferred, on
  `Workout`'s #448 precedent, so an orphaned athlete-authored row is no longer
  served as trainm8-authored. What the browser found on top of that reading: 29
  corpus rows were sitting _as_ orphans, because `seedCatalogue` upserted them
  with a null owner and no stated authorship and the column's `'athlete'`
  default did the rest — so `getExerciseCatalog` correctly withheld them and a
  scheduled session's lead lift rendered as `Select exercise…`. Migration
  `20260818160000` heals them, guarded on the pair
  `authorship = 'athlete' AND createdByAthleteId IS NULL`, and only where a
  shipped corpus knows the id; a genuine orphan whose author deleted their
  account is left exactly as it is, because publishing it would hand one
  athlete's private movement to everybody. `seedExercises`' skip guard now tests
  _ownership_ rather than authorship alone, so the class can heal itself on a
  re-seed instead of being frozen forever. `ExerciseSetLog.exerciseId` is
  `SET NULL`, so a deleted exercise loses the history's name but keeps its sets.
