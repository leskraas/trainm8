# Destination: strength becomes a real tracker

Owner's ask, verbatim:

> _"how 5x5 stronglifts app works. I want this in my app as well. aka a propper
> strength workout tracker. I want all the exercises and the recording stuff,
> all the nice features"_

Synthesis over four investigations run in parallel on 2026-08-13: an audit of
what this repo has for strength, and three research documents —
[`strength-program-stronglifts-and-kin.md`](../../research/strength-program-stronglifts-and-kin.md),
[`strength-tracker-surfaces.md`](../../research/strength-tracker-surfaces.md),
[`strength-anchors-and-progression.md`](../../research/strength-anchors-and-progression.md).
Sibling of [`destination.md`](./destination.md), which covers the endurance
side.

---

## The blocker that is not technical

`GOAL.md`'s non-goal:

> **No in-app activity recorder** — trainm8 is not a GPS/live-recording device.
> Executed data arrives via **Activity Import** (Strava/Garmin/Polar/upload),
> never from trainm8 capturing it live.

Verified against the code: **no import path anywhere carries an `ExerciseSet`.**
Not Strava, not Intervals.icu, not FIT/TCX/GPX — both providers map
`WeightTraining | Workout | Crossfit` to `strength` and deliver a whole-activity
summary. A completed strength session's entire actual is:

```ts
sRPE = (durationSec / 3600) × rpe × 15   // confidence: 'low'
```

So an athlete can plan `5×5 squat @ 100 kg` and record **"it felt like an 8."**

Applied to strength, the non-goal does not defer the plan↔actual loop — it
**forecloses** it, because there is no other route by which a strength actual
could arrive. `GOAL.md` pillar 1 calls that loop _"the wedge Strava can't
reach"_. For the strength track it is unreachable by policy.

**Proposed wording change. The owner's call, not this document's:**

> **No in-app activity recorder** — trainm8 is not a GPS or live-telemetry
> capture device. Executed **cardio** data arrives via **Activity Import**,
> never from trainm8 capturing it live. **Strength is the exception, because no
> provider exports set-by-set data: logging sets, reps and load in-app is the
> only way a strength actual can exist.**

Everything below assumes that change. Nothing below is worth building without
it.

## The gap is not where it looks

**The prescription layer is done.** `ExerciseSet` already carries a six-member
`LoadTarget` union (`absolute`, `pct1RM`, `repMax`, `bodyweight ± added`,
`pctBodyweight`, `velocity`), an orthogonal `EffortCap` (RIR, Zourdos RPE), five
termination kinds (`reps`, `timed`, `amrap`, `toRir`, `velocityLoss`) and
`tempo`. The StrongLifts research checked every set in all seven programs it
compared and found **not one prescription unrepresentable**.

Three layers are missing, and they are missing in a specific order.

### Layer 1 — the referent. `pct1RM` is shipped and resolves to nothing

`@ 85 % 1RM` renders as the literal string `"85% 1RM"` and the athlete does the
arithmetic. `@ 8RM` renders as **nothing at all** — `setLoadText` reads only the
two legacy columns, so Rønnestad's `10RM`, the corpus's headline acquisition, is
stored correctly and displayed as a bare `4 × 10`.

And it cannot be fixed by adding a column. `DisciplineProfile`'s
`@@unique([athleteProfileId, discipline])` means a squat 1RM and a deadlift 1RM
would be **the same row**. This is a cardinality mismatch, which is why the gap
has stayed open through three ADRs.

It is the exact shape of the cardio threshold gap ADR 0054 just closed, one
level down — so the answer has the same shape. An **`ExerciseThreshold`**, keyed
per exercise, carrying ADR 0054's two provenance axes:

- **`construct`**: `oneRm` (performed) · `estimatedOneRm` (a formula's output) ·
  `repMax` (the heaviest load for exactly _n_ reps). Three different claims.
- **`protocol`**: `tested` · `epley` · `brzycki` · `mayhew` · `wathen` ·
  `rep-max-observed` · `athlete-stated`. The formula name, not a trust label.
- **`confidence`**: ADR 0033's ordinal grade, **null where the athlete typed
  it**.

Two properties the research insists on:

- **`repMax` is a peer of `oneRm`, not a derivative.** Converting an observed
  8RM to a 1RM in order to render `@ 8RM` is a fabrication round-trip through a
  ±10 % transform, twice.
- **`reps` is required on an estimate**, because rep count is the single largest
  determinant of the error, and a stored estimate without it cannot be
  re-derived, re-graded or refused.

The error bars are not a footnote. Over 2–30 reps, Brzycki's mean error was
**+26.7 ± 101.7 %**; restricted to ≤10 reps, **−2.0 ± 10.5 %**. Even the good
case carries a ±10 % individual SD — and the 1RM test itself has a median
test–retest **CV of 4.2 %**, so no estimator can beat that floor. Every one of
the popular formulas is a textbook chart or a practitioner article, not a study.

### Layer 2 — the log. There is no performance side for strength at all

Endurance has `Workout` vs `ActivityImport`/`ActivityStream`, Planned TSS vs
TSS, an Adherence Band and Structure Detection. Strength has `ExerciseSet` — a
child of the _prescription_ — and nothing else. No `PerformedSet`, no
`actualReps`, no `completedAt`. Detection excludes strength by construction.

One entity, **`ExerciseSetLog`**, unblocks nearly everything the owner asked
for: per-exercise history, tonnage, "last time you did this lift", strength PRs,
1RM estimation from a real set, and — independently — ADR 0046 §4's **Strength
Summary Count**, which that ADR mandates and which _was never built_. Two
features, one entity.

Model notes the research is firm about:

- **Prescribed and performed sit in the same row.** The whole interaction is
  "tap to accept last time, or overtype one number".
- **`weightKg: Float` is wrong on five equipment classes** and this is not a
  rounding problem: assisted machines carry _negative_ added load, dumbbells are
  per-hand, bodyweight is `bodyweight ± added`, machine stacks are ordinal
  levels, bands have no kilos. Equipment needs a per-athlete profile that also
  encodes which plates this gym owns.
- **ADR 0027 governs the prescription and must not govern the log.** Forcing a
  set log into a Token Sentence would reproduce #434's "too much text" in the
  one place an athlete works one-thumbed between sets. The log is a grid with a
  ghost row.

### Layer 3 — the program. This is what StrongLifts actually is

**The load-bearing architectural finding, and it is not obvious:**

> ADR 0047's strength progression is **calendar-indexed** — a weekly sets target
> interpolated from a position in a season. All seven programs studied are
> **outcome-indexed** — the next weight is a pure function of the last logged
> session, and the calendar contributes nothing.

StrongLifts adds 2.5 kg **if and only if** 25 of 25 reps were completed. 5/3/1
raises a training max per cycle. Madcow carries Friday's triple into Monday's
top set. A plan that says _"week 7 targets 18 sets"_ cannot answer **what do I
lift today**, which is the only question these programs exist to answer.

These are not competing models. They are orthogonal, and ADR 0047 gets a
**scope** rather than a supersede: it is correct for the season layer and does
not reach the program layer.

The per-lift state a program must persist — seven pieces plus a cursor: working
weight, consecutive-fail count, increment, training max, deload history, cycle
position, and which of A/B is next. **The progression rule belongs on the lift,
not the program** — StrongLifts' own deadlift breaks the program-level rule on
two axes (1×5 not 5×5, and a bigger increment).

**Failure has three structurally different remedies** and a model needs all
three: a percentage cut (−10 %), a **reset to a past weight** (needs weight
_history_), and a **re-estimation of a derived anchor** (needs an estimator).
Collapsing them into a percentage loses two of them.

## What the research refused to launder

Worth reading before anyone writes a "smart" feature:

- **The "5×5 → 3×5 → 1×5 after two deloads" ladder is not on the official site**
  — not in the failure article, the plateau article, or the app's progression
  settings. The single most-repeated StrongLifts rule in secondary write-ups is
  folklore or an artefact of an older edition, and the document declines to
  state it as the program's rule.
- **"Three fails then cut 10 %" has no trial of any kind.** Neither does any
  deload percentage in the family. The circulating deload numbers come from a
  survey of what athletes do and a Delphi consensus; the two controlled deload
  trials found **no benefit — one found a strength cost**.
- **The training max has no evidence base.** Adopt it as a product convention or
  not at all, never as physiology.
- **RIR-prescribed load does not beat percentage-prescribed load** in the one
  properly matched trial (Helms 2018, no significant between-group difference).
- **Velocity-based training needs a barbell sensor**, and even with one, 1RM
  from a load–velocity profile carries SEE ≈ 9.8 % with a systematic +4.5 kg
  overestimate. There is nothing to implement. Do not build it.
- **Session-tonnage records and streaks are vanity** — tonnage rewards junk
  volume, a streak measures app-opening. Estimated 1RM, per-rep-count records
  and heaviest-weight-at-reps are honest readings.
- **`% 1RM`'s portability claim needs narrowing by one word.** The repo's
  existing summary of Richens & Cleather cites "no difference at 90 %"; that is
  an **underpowered null**, not demonstrated equivalence. A correction to
  `portable-intensity-anchors.md` is owed.

## Build order

Each step is demoable on its own, which is this repo's bar.

**All five have shipped**, as ADRs 0056–0061. The step numbers below are this
document's; the slice numbers are `docs/specs/strength-module.md`'s.

1. **`ExerciseSetLog` + the logging surface.** The grid with a ghost row, a rest
   timer, and one-tap "same as last time". This alone turns strength from
   planned-only into a tracker, and it fixes ADR 0046 §4's unbuilt Summary
   Count. **Needs the `GOAL.md` change.** — **Shipped as
   [ADR 0056](../../adr/0056-a-strength-actual-is-logged-in-app-and-a-kilo-is-not-a-kilo.md)**
   (spec slice 1).
2. **`ExerciseThreshold`.** `pct1RM` and `repMax` stop resolving to nothing, and
   `setLoadText` learns to render the four `LoadTarget` members it currently
   drops. Estimation from a logged set follows ADR 0054's shape — propose, show
   the derivation, the athlete accepts. — **Shipped as
   [ADR 0057](../../adr/0057-a-strength-anchor-is-per-exercise-and-a-rep-max-is-a-peer-of-a-1rm.md)**
   (spec slice 2).
3. **Strength PRs and per-exercise history.** Derived, never stored (ADR 0021
   generalizes cleanly). Unlike the pace/power ladder ADR 0021 deferred, this
   needs **no stream tier at all** — the set row _is_ the measurement. —
   **Shipped as
   [ADR 0058](../../adr/0058-a-strength-record-is-derived-from-the-set-row-and-tonnage-is-declined.md)**
   (spec slice 3). The PR banner and hard-sets-per-muscle did not land with it;
   see that ADR's Consequences.
4. **The program engine.** Per-lift state, a cursor, three failure remedies.
   StrongLifts, Starting Strength and GreySkull run on nothing but the last
   weight lifted; 5/3/1 and nSuns need step 2 first. — **Shipped as
   [ADR 0059](../../adr/0059-a-program-is-outcome-indexed-and-its-progression-rule-lives-on-the-lift.md)**
   (spec slice 4), with those three programs seeded and the percentage families
   still unseeded.
5. **The exercise database.** `free-exercise-db` (873 rows, Unlicense) and wger
   (850 rows, CC-BY-SA 4.0) are both usable, and **neither carries movement
   pattern or load semantics** — so adoption is a seed, not a dependency, and
   the licence difference is a product decision. The progression key should be
   **`(exerciseId, equipment)`**, which keeps barbell and dumbbell bench
   progressing separately without exploding the picker. — **Shipped as
   [ADR 0061](../../adr/0061-the-exercise-database-is-a-seed-and-a-movement-pattern-nobody-published-stays-null.md)**
   (spec slice 6). `free-exercise-db` was chosen, on the licence; **#469 is
   fixed** by asserted `authorship`. The picker itself was not touched, so the
   movement-pattern filter and the alias search are seeded data with no reader —
   see that ADR's Consequences.

One step this document did not name shipped between 4 and 5: **the session
runner** — warm-up ramp, plate calculator on a per-athlete Plate Inventory, an
outcome-aware rest timer, an explicit finish that writes
`WorkoutSession.status`, and the post-session outcome per lift. **Shipped as
[ADR 0060](../../adr/0060-the-session-runner-is-a-grid-with-a-deadline-and-a-rack-that-cannot-make-the-number-says-so.md)**
(spec slice 5).

Two pre-existing debts sat on the path. **#469** (`Exercise` serves an orphaned
athlete-authored row as trainm8-authored — the bug `Workout` fixed in #448) is
cleared in code by
[ADR 0061](../../adr/0061-the-exercise-database-is-a-seed-and-a-movement-pattern-nobody-published-stays-null.md)
§5, and the issue is still open on GitHub. `Exercise`'s six columns, which ADR
0047 §2 cites as the blocker for per-muscle volume, are cleared by the same ADR
— though per-muscle volume itself is still unbuilt.

## Two vocabulary problems to settle before building

- **`deload` collides.** In this family it means a **per-lift −10 % cut on
  failure**; in ADR 0047 it means a **planned −50 % week** in a season segment.
  Same word, two objects, both already in the codebase.
- **There is no strength Session Archetype.** All sixteen values are endurance.
  The corpus files every heavy squat day as `neuromuscular` or `technique` and
  its own header calls that _"the nearest honest member and not a good fit."_
  ADR 0055 just made archetype an authored column on `Workout`, so this is the
  moment to decide whether the vocabulary grows a strength arm.

## Decisions to record before building

- Does `GOAL.md`'s recorder non-goal get scoped to cardio? **Everything waits on
  this.**
- Is a program a first-class entity, a Catalogue row, or a Plan Outline segment?
  (The research says the first, firmly, and says why the other two fail.)
- Where does per-lift progression state live — on the program instance or on the
  lift? (The research says the lift.)
- Does `SESSION_ARCHETYPES` grow a strength arm, or does strength keep its own
  axis via **Strength Goal**?
- Which exercise dataset, on which licence — and does the app ship it or seed
  from it?
