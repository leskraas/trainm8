# A program is outcome-indexed, and its progression rule lives on the lift

Status: Accepted

Slice 4 of [`strength-module.md`](../specs/strength-module.md), stage 4 of
[`out-of-the-box/strength-destination.md`](../wayfinder/out-of-the-box/strength-destination.md).
Research:
[`strength-program-stronglifts-and-kin.md`](../research/strength-program-stronglifts-and-kin.md)
§1, §2, §4, §5, §6, §7;
[`strength-anchors-and-progression.md`](../research/strength-anchors-and-progression.md)
§5, §7.2, §7.3.

**Scopes [ADR 0047](./0047-strength-progresses-by-anchor-and-ramp.md) — a scope
note, not a supersede** (§1). **Builds on
[ADR 0057](./0057-a-strength-anchor-is-per-exercise-and-a-rep-max-is-a-peer-of-a-1rm.md)**
for the anchor an **Anchor Re-estimate** reads and the training max it resets.
**Confirms
[ADR 0056](./0056-a-strength-actual-is-logged-in-app-and-a-kilo-is-not-a-kilo.md)
§2** — the Catalogue argument that refused performed reps on `ExerciseSet` is
the same argument that refuses program state on a Catalogue row — and **settles
ADR 0056 §8's naming promise**: the per-lift response is a **Stall Response**,
and `deload` stays ADR 0047's planned week. **Follows
[ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md) §2**
for the pure-engine-behind-an-impure-shell split.

## Context

This is the owner's actual ask: _"how 5x5 stronglifts app works… a propper
strength workout tracker."_

StrongLifts is not a workout and it is not a plan. It is a **rule plus per-lift
state plus a cursor**, and the next weight is a pure function of the last logged
session. Nothing in this repo could express that. `Workout` is one session.
`PlanOutline` is a season. Neither carries a stall count.

The finding that decided the whole slice is about **indexing**, and it is worth
stating precisely because it looks like a conflict and is not:

> **ADR 0047's strength progression is calendar-indexed. Every program in this
> family is outcome-indexed.**

ADR 0047 §2–§4 interpolates a **weekly hard-set target** from a position in a
season: week 7 → 18 sets. That is correct for a season and it structurally
cannot answer _what do I lift today_, because **week 6's weight is a function of
week 5's log** and is unknowable in week 1. You cannot stamp twelve weeks of
StrongLifts into a calendar. The two objects are not competing models of the
same thing; they are **orthogonal axes**, and each is right about its own.

## Decision

### 1. ADR 0047 gets a scope note, not a supersede — and the note is this

ADR 0047 is not wrong and nothing in it is retracted. It is scoped:

> **Scope note to ADR 0047.** ADR 0047 governs the **season layer**: a Training
> Track's calendar-indexed volume, its hard-set currency, its Strength Goals and
> its no-upward-ratchet rule. It does not reach the **program layer**, which is
> outcome-indexed. Where a Plan Outline and a Program both exist, **the Outline
> owns the frequency and the Program owns the load**, and neither writes the
> other's number. A Plan Outline may say _"3 strength sessions a week"_; the
> Program says what goes on the bar.

A supersede would have been wrong twice: it would discard a correct season
model, and it would imply the two numbers are the same number reached two ways.
They are not — a weekly sets target and a working weight are different
quantities and neither is derivable from the other.

### 2. A Program is a first-class entity

Not a Catalogue row, not a Plan Outline segment.

**A Catalogue row fails on cardinality and on ownership.** A Catalogue member is
a `Workout` with `authorship: 'system'` and `ownerId: NULL`, read by every
athlete (ADR 0051, 0052) — which is the exact reason ADR 0056 §2 refused to
write performed reps onto `ExerciseSet`. A program carries **per-athlete mutable
state**: working weight, stall count, cursor. Putting it on a row owned by
nobody writes one athlete's state into shared corpus content. And structurally a
Catalogue row is **one session** while a program is a sequence plus a rule plus
state.

**A Plan Outline segment fails on indexing** — §1 — and on shape: a segment has
no per-lift slot and no failure counter.

So three tables. `StrengthProgram` is the authored, immutable, seeded definition
(with `StrengthProgramDay` referencing Catalogue `Workout` rows for its session
shapes, and `StrengthProgramLiftRule` for its rules). `ProgramInstance` is one
athlete's run, carrying the **stored cursor**. `ProgramLiftState` is one row per
lift per run.

Sessions are generated **lazily, one at a time**: the shape may be stamped
ahead, the **load resolves when the session is opened**. That is the
outcome-indexing made operational.

**The day reference carries its parent's discriminator.** `StrengthProgramDay`
keys `Workout` on the composite `(workoutId, workoutAuthorship)`, so a seeded
program's day cannot silently come to point at an athlete's private `Workout`
after an edit — the repo's standing pattern for a cross-table invariant.

### 3. The rule table is keyed by lift, because the reference program breaks its own rule

`StrengthProgramLiftRule` is unique on `(programId, exerciseId, equipment)`, and
that is not generality for its own sake:

> **StrongLifts' own deadlift breaks the program-level rule on two axes at
> once** — 1×5 rather than 5×5, and 10 lb rather than 5 lb, stepping down to 5
> lb once it gets hard.

A program-level rule is therefore **provably wrong on day one** for the flagship
program. This is exactly the shape of finding ADR 0047 §2 made about volume
landmarks: the model that looks simpler cannot express the first real case.

### 4. The Stall Response vocabulary, and why one percentage loses two of its members

ADR 0056 §8 left the naming to this slice. `deload` collides — ADR 0047's
planned −50 % week versus this family's per-lift cut on failure — and `backoff`
is taken by `SET_ROLES`. So: a **Stall Response**, counted by a **Stall Count**,
with three members that are **structurally different operations**, not three
settings of one:

| Member                 | What it does                                     | What it needs        | Programs                                  |
| ---------------------- | ------------------------------------------------ | -------------------- | ----------------------------------------- |
| **Stall Cut**          | reduce this lift's working weight by a percent   | the current weight   | StrongLifts, GreySkull, Starting Strength |
| **Weight Rollback**    | reset to a weight this lift actually used before | `weightHistory`      | Madcow                                    |
| **Anchor Re-estimate** | re-derive the anchor and reset the training max  | ADR 0057's estimator | 5/3/1, nSuns                              |

A single shared `deloadPct` field **launders three operations into one and loses
two of them.** A Weight Rollback's answer is not a percentage of anything — it
is a weight that is in the log and nowhere else, and no rule can reconstruct it,
which is why `weightHistory` exists as a stored array. An Anchor Re-estimate
does not touch the working weight at all; it moves a different quantity.
Collapsing them keeps only Stall Cut and silently reinterprets the other two as
it.

`IncrementAdjustmentOnStall` is a separate axis for the same reason: **Starting
Strength shrinks the increment _and_ cuts the weight**, two things at once,
because the program says both. That is why `ProgramLiftState.currentIncrement`
is **mutable state** and not just a copy of the rule.

### 5. The engine is pure, the server decides nothing, and the advance is one write

The `plan-generation` trio's contract, restated and honoured: `nowISO` is an
argument used only to stamp outcomes and **never to decide anything**, no random
source, no database, no mutation. The 1RM estimator an Anchor Re-estimate needs
is an **injected function**, not an import, so the engine does not grow a
dependency or a fake.

The determinism is what makes the test seam sufficient: a whole StrongLifts run
is a **fold** — feed six sessions of logged sets, assert the working weights and
the outcomes — and that one test covers the cursor, the predicate, the
increment, the Stall Count and the Stall Cut with no database.

The state machine, per lift, on session completion: evaluate the predicate over
`countsTowardWork`-qualified sets; on success reset the Stall Count and apply
the increment **if the trigger fires**; on failure increment the count and, at
threshold, apply the Stall Response and the increment adjustment; advance the
cursor; append to `weightHistory` and `stallHistory`; emit the outcome.

**There is no "repeat" mode**, because repeating is what the predicate failing
means.

The server half writes the cursor, every lift's new state and both appended
histories in **one transaction** — _"a partial advance would leave a Stall Count
that its own history contradicts."_

**The cursor is stored and never counted.** A skipped, back-filled or duplicated
session must not desync the program, and `recordProgramSession` derives the
performed `dayId` from the session's own `Workout` rather than from a position
in a list.

**The failure predicate is the app's, not the article's.** The two published
counters differ: the failure article counts _repeats of the same weight_, the
app counts _consecutive sessions where all sets were not completed_. The app's
is mechanical and survives an out-of-order log. And a lift with no logged sets
returns a **third answer** — neither success nor failure — so a skipped lift
never accrues a stall.

### 6. It says what happened once, as a notice, and offers nothing

_"An engine that silently drops the squat 10 % and shows the new number is the
exact failure the Load Recompute Notice pattern exists to prevent."_

So the engine returns outcomes with reasons and tells the athlete nothing; the
server says it once. A Stall Cut renders as a `role="status"` region with **no
button, no link and no input inside it** — asserted by test — carrying the lift,
the two weights, the reason in the lift's own numbers, and the program's
provenance note.

`stallHistory` is **not needed to compute the next weight.** It exists to answer
_"why did my squat drop 10 kg?"_ honestly, which is the Load Recompute Notice
pattern one level down.

### 7. The numbers are quoted, and the ones with no evidence say so beside themselves

Every published figure is quoted from its primary source and carries a
`PROVENANCE` label — `primary`, `secondary`, `convention`, `folklore`,
`disputed`. A seeded "StrongLifts 5×5" that quietly uses 2 kg increments because
they seemed more sensible **is not StrongLifts**. Four things are recorded
plainly, in the module's own header and in the runtime copy:

- **"Three fails then cut 10 %" has no trial of any kind.** Not for three, not
  for two, not for any specific fraction. The rule is a defensible design
  argument — given the 1RM test's ~4 % CV, one failed session is uninformative
  and three consecutive ones are reasonable evidence of a plateau — and it is
  **not a research finding.** The engine's own stall-cut reason string says so
  to the athlete: _"The 10 % is this program's own convention — no trial
  supports the figure."_
- **No deload percentage in this family has one either.** The circulating
  numbers are **surveys of practice and a Delphi consensus**. The **two
  controlled trials that exist found no benefit, and one found a strength cost**
  (Coleman 2024: the continuous group gained more isometric and dynamic
  strength; Pancar 2026: no time × condition interactions, all Δ 95 % CIs
  included zero). Neither trial tested the case a deload is actually for, which
  is why deloads are not dismissed — but any specific percentage an app ships is
  a **convention**, and the "10 % vs 20 %" question has no answer in the
  literature at all.
- **The training max has no evidence base. Stated plainly: none.** No trial
  manipulates the anchor's fraction. Its author's own rationale is practical
  rather than physiological, and a companion piece says there is _"no hard rule
  for your TM"_. It ships because 5/3/1 and nSuns prescribe every weight as a
  percentage of it, as a **documented product convention**, with
  `workingFraction` stored explicitly and visibly beside it — a silent
  multiplier would make every displayed `%1RM` a lie about what is on the bar.
- **The 5×5 → 3×5 → 1×5 ladder is not on the official site.** It is the most
  confidently repeated StrongLifts rule in the secondary literature and it is
  absent from the failure article, the plateau article and the app's own
  progression settings. It is labelled `PROVENANCE.folklore` in a constant that
  exists **only to record its own non-implementation**, there is no
  `volumeLadder` field, and a test asserts it is not seeded as the program's
  rule.

Three programs are seeded — the absolute-increment family, which runs on nothing
but the last weight lifted and needs no anchor: **StrongLifts 5×5** (2.5 kg
flat, the deadlift exception in full, 20 kg / 30 kg starts, 3 stalls → −10 %
scoped to the exercise), **Starting Strength** (−10 % reset, press −8 %, **and**
the increment shrinks), and **GreySkull LP** (`2×5 + 1×5+`, the AMRAP is the
rule, ≥ 10 reps doubles the increment — shipped **labelled as reverse-engineered
from secondary sources**, because its primary is a paid e-book). Where a source
publishes a range the seed takes the low end and says so; where editions
disagree the surface reports the disagreement rather than picking.

**What is deliberately not tested is the published numbers themselves.** A test
asserting StrongLifts' increment is 2.5 kg is a test of the seed, and the seed
is data with a citation beside it. What is tested is that the engine applies
whatever the definition says — **including a deadlift whose rule differs from
its program's on two axes.**

### 8. Program state ignores the calendar entirely

A program paused for three months resumes exactly where it stopped. Whether it
_should_ is a physiological question **no source in this family answers**, so no
detraining rule is invented. There is no date arithmetic anywhere in the engine.

### 9. No stored number moves

Five tables are new and empty (`StrengthProgram`, `StrengthProgramDay`,
`StrengthProgramLiftRule`, `ProgramInstance`, `ProgramLiftState`). No existing
column is read and rewritten with a different value, and no threshold, TSS, CTL,
ATL, TSB, `effectiveKg` or `bodyweightKg` is touched. **No Load Recompute Notice
is owed.**

The program's own numbers do move — that is what a Stall Cut _is_ — and every
one of those movements is an outcome the athlete is told about once, with its
reason, in the same transaction that made it.

## Considered options

- **A Catalogue row.** Rejected — §2. Per-athlete mutable state on a row owned
  by nobody, and one session where a sequence is needed.
- **A Plan Outline segment.** Rejected — §2. Calendar-indexed, no per-lift slot,
  no failure counter.
- **A program-level progression rule, with per-lift overrides.** Rejected — §3.
  The flagship program's deadlift breaks it on two axes, so the "override" is
  load-bearing from the first seeded program and the rule is the special case.
- **A single `deloadPct`.** Rejected — §4. It launders three operations into one
  and silently reinterprets two of them as the third.
- **Deriving the Stall Count from the session log at read time.** Rejected. The
  two published counters disagree, so the derivation has to pick one and then
  changes meaning if it is ever revised; and an out-of-order log makes it
  unstable. It is stored.
- **Counting sessions to decide whether Workout A or B is next.** Rejected. A
  skipped, back-filled or duplicated session desyncs the whole program. The
  cursor is stored, and the performed day is read from the session's own
  `Workout`.
- **A separate "repeat" mode the athlete selects.** Rejected — §5. Repeating is
  what the predicate failing means, and a mode is a second source of truth for
  it.
- **Seeding the 5×5 → 3×5 → 1×5 ladder as StrongLifts' rule.** Rejected — §7. It
  is in no official source, and seeding it attributes a rule to an author who
  does not publish it.
- **A derived program duration or graduation standard.** Rejected. Every program
  in the family says it ends and **none of them says when**; a computed end date
  would be invented physiology. The athlete's own evidence — increments firing
  less often, cuts clustering — is the honest substitute.
- **A model of assistance work.** Rejected. No program in the family publishes a
  progression rule for it, so modelling it would be inventing one.
- **A detraining rule on paused state.** Rejected — §8.
- **`weightHistory` and `stallHistory` as child tables.** Rejected. They are
  read only with their parent, appended in the same transaction that advances
  the state, and never queried across athletes — the same test the schema
  applies to `secondaryMuscles` and to a Plate Inventory's plate list.

## Consequences

- **ADR 0047's scope note is stated here and is not in ADR 0047.** §1 is the
  note; ADR 0047's own file has no reference to a program layer. Until somebody
  adds the blockquote there, a reader arriving at ADR 0047 first will read a
  calendar-indexed strength progression as the whole story. **This is an owed
  edit to ADR 0047 and the spec asked for it.**
- **Pause and resume are not built.** `'paused'` is in the vocabulary and in the
  migration CHECK, and there is no transition and no UI for it. The run screen
  renders a non-active instance read-only, so the state is expressible and
  unreachable. §8's decision stands for whenever it ships.
- **`trainingMaxKg` and `workingFraction` have no production writer.**
  `startProgram` writes null for both, and no caller ever injects the anchor
  re-estimator — so in production an **Anchor Re-estimate always yields
  `stallResponseUnavailable`**, which is at least an honest refusal rather than
  a silent no-op. The percentage families that need them are a later slice, and
  the vocabulary ships complete so their arrival is seed data, not a migration.
- **`perWeek` and `perCycle` triggers short-circuit to "fires".** Until the
  percentage families ship their day shapes, the engine fires once per completed
  pass of the day list. It is documented in place and it is a real behavioural
  gap against step 2 of the state machine — a `perWeek` program seeded today
  would progress per pass, not per week.
- **The Stall Response is strictly per lift.** Madcow's **program-scoped**
  rollback — which fires when the majority of lifts are stalling — is documented
  in a constant and has no mechanism. Madcow is not seeded, so nothing is wrong
  today; it is the one member of the vocabulary whose scope the tables do not
  yet express.
- **StrongLifts' ABA·BAB two-week framing is encoded as plain alternation.**
  Behaviourally identical, and nothing represents the "two-week, six-session"
  presentation the program publishes. `weekInCycle` exists and is unseeded.
- **`weightHistory` is unbounded.** Every session appends forever, in a JSON
  column read whole with its parent. Fine for years of training; stated as a
  debt rather than a design.
- **`finishStrengthSession` is not idempotent** (see also ADR 0060). Nothing
  dedupes on `sessionId`, so a second finish after a reload advances the program
  again and appends duplicate weight and stall history. The engine is pure and
  the fold is deterministic, which makes this a missing guard at the seam rather
  than a modelling error — and it is the most consequential open defect in the
  slice, because the thing it corrupts is exactly the state that cannot be
  re-derived.
- **A set whose variant equipment is null matches any lift with the same
  exercise.** `recordProgramSession`'s set→lift matching is loose today because
  ADR 0061's `variantId` is not yet written by the log path. Once it is, a
  dumbbell set could be attributed to a barbell progression unless the match is
  tightened with it.
- **`ProgramInstance.cursor`'s JSON `kind` is not tied to the definition's
  `cursorKind` by any constraint or runtime cross-check.** It is validated
  against the union at the parse seam, which catches a malformed cursor and not
  a mismatched one.
- **`StrengthProgram` asserts `authorship` and has no owner column**, so unlike
  `Workout` there is no `system has no owner` constraint to enforce it. Programs
  are seed-only today; an athlete-authored program would need the column and the
  CHECK together.
- **`programs.$programId.start.tsx` has no route test**, which is the one
  surface where the athlete answers the one-question-per-lift the whole product
  promise rests on.
