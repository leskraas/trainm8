# A strength record is derived from the set row, and tonnage is declined

Status: Accepted

Slice 3 of [`strength-module.md`](../specs/strength-module.md), stage 3 of
[`out-of-the-box/strength-destination.md`](../wayfinder/out-of-the-box/strength-destination.md).
Research:
[`strength-tracker-surfaces.md`](../research/strength-tracker-surfaces.md) §6;
[`strength-anchors-and-progression.md`](../research/strength-anchors-and-progression.md)
§2.3, §2.5.

**Generalises [ADR 0021](./0021-personal-records-derived-best-efforts.md)** —
its derived-never-authored rule reaches strength unchanged, and, unlike the
pace/power ladder ADR 0021 deferred, **needs no stream tier at all**. **Confirms
[ADR 0056](./0056-a-strength-actual-is-logged-in-app-and-a-kilo-is-not-a-kilo.md)**
on three counts: `effectiveKg` is read as baked, `countsTowardWork` is the one
qualification gate, and the refusal to invent a kilo for a stack level or a band
is what keeps those rows out of every comparison. **Confirms
[ADR 0008](./0008-tss-triad-with-hr-first.md)'s Unavailable Metric principle**
one level further down.

## Context

ADR 0056 shipped the measurement and no reader. Every set an athlete has ever
lifted sits in one indexed table, and **the only thing that reads it is the Set
Ghost.** The `(exerciseId, completedAt)` index was added _for_ a history surface
and had no consumer.

So an athlete could log six months of squats and could not see their squat. Not
their best triple, not their heaviest-ever, not whether the lift was moving at
all. That is the whole point of a strength tracker, and it is the second half of
map #434's verdict: machinery, no product.

Unlike the endurance side, nothing structural was in the way. ADR 0021 deferred
the pace/power record ladder because a mean-maximal reading needs a
full-resolution stream tier that ADR 0020's display grid cannot serve (and which
ADR 0054 §6 later had to refuse around). **A strength record needs none of it:
the set row _is_ the measurement.** 100 kg × 5 is not a window over a signal; it
is the reading, already stored, already typed.

## Decision

### 1. Records are derived on read, and there is no records table

No schema change. This slice adds **no migration at all**.
`deriveStrengthRecords` is a pure function — arrays in, decisions out, no clock,
no query — and the one server module around it does a `findMany` and nothing
else.

ADR 0021's argument transfers verbatim and gets stronger here. A stored record
is a **second source of truth about a set that already exists**, and the ways it
can drift are all real: an athlete edits a rep count, marks a set abandoned,
deletes a session. A derived record cannot disagree with the log because it _is_
the log.

### 2. Four record kinds, each of which is a reading and not a model

- **`heaviestLoad`** — max effective load at any rep count, per variant. The
  least model-dependent record there is, and the one athletes actually care
  about.
- **`repMax(n)`** — heaviest load at exactly _n_ reps. Best single, best triple,
  best five. Also model-free.
- **`e1RM`** — best estimated 1RM, with **the equation named on the number** and
  the sentence _"An estimate is a model, not a lift."_ beside it. A figure an
  athlete compares against another app must be reconstructible, which means
  naming the equation is not decoration.
- **`stackLevel`** — a fourth kind the spec did not ask for, and the right call.
  A machine stack has **no honest kilo** (ADR 0056 §3), so it is absent from
  every kilo record — but level 6 → 7 is real progress and refusing to record it
  would be the Unavailable Metric principle overreaching into a metric that _is_
  available, in its own unit.

**Records are keyed `(exerciseId, equipment)`**, which is ADR 0056's stated
progression key. Barbell bench and dumbbell bench are separate histories, so a
lighter dumbbell day never reads as a regression.

### 3. Session tonnage and streaks are declined, not deferred

ADR 0056 rejected both in passing; this slice makes it a standing decision,
because a history surface is exactly where they get asked for.

- **Tonnage** (`sets × reps × kg`) rewards junk volume: five sloppy sets of 20
  at 60 kg outscore a hard triple at 150 kg. It also **inverts the portability
  thesis ADR 0046 §1 rests on** — it is a number that reads as comparable across
  athletes and exercises and is not. And it is uncomputable for exactly the rows
  ADR 0056 refused to fabricate a kilo for, so it would either be wrong or have
  a hole in it.
- **A streak** measures app-opening. It is not a reading about training, and a
  metric that punishes a rest day is a metric that argues against the training.

Neither is a reading about training, which is the bar. Three tests assert their
**absence**, including a grep over the module's exports — the honest way to
enforce a refusal.

Declined with them, for the same reason: a single strength score across
exercises, an e1RM leaderboard across lifts, and a muscle heatmap with no
declared attribution rule.

### 4. `effectiveKg` is read as baked, never re-derived

ADR 0056 §3 baked the kilo at log time with the bodyweight it used, and the
whole point was this slice. Re-deriving from today's bodyweight would silently
rewrite a two-year-old weighted-dip record after a 6 kg change — a stored number
moving with no act and no notice, which is the failure the Load Recompute Notice
pattern exists to prevent.

Every record path selects `effectiveKg` and passes it through. `effectiveLoadKg`
is called in exactly one place in the codebase and it is the write path.

### 5. A null kilo is absent from comparisons and present in its own curve

Rows whose `effectiveKg` is null — a stack level, a band, an unloaded hold, a
bodyweight-derived load with no bodyweight on file — are filtered out **before**
`heaviestLoad`, `repMax` and `e1RM` are computed, so they can never contribute a
zero.

They remain in the exercise's own history as points with no bar and
`comparable: false`, and the surface says so in one phrase: _"No kilos — this
progresses against itself only."_ One phrase, in place, argument behind a tap —
#437's rule.

### 6. A first entry is not a record

On a variant with fewer than **three** prior sessions of work, the surface says
_"first time!"_ rather than _"PR!"_. A first-ever dumbbell bench press firing
four personal records on day one is not a celebration, it is noise that teaches
the athlete to ignore the banner.

`priorSessions` counts distinct qualifying sessions strictly before the record's
own date, so the rule is about **experience on this variant**, not about how
long the account has existed.

### 7. Qualification is one gate, already shipped

Every strength aggregate routes through `countsTowardWork`
(`role === 'working' && outcome === 'completed'`). Warm-ups and abandoned sets
are excluded from records, and — per ADR 0059 — from the program's success
predicate too. One rule, one place, three consumers.

### 8. No stored number moves

Nothing is written. This slice has no migration, no write path and no authoring
path; it reads rows ADR 0056 already stored and computes over them in memory.

## Considered options

- **A `StrengthRecord` table, written on set save.** Rejected — §1, ADR 0021. It
  is a second source of truth about a row that already exists, and every edit
  path becomes a place it can drift.
- **Growing `BenchmarkKind` with the three strength arms**, as the spec asked.
  **Not taken** — see Consequences. A separate `StrengthRecordKind` shipped
  instead, and the divergence has a cost.
- **Session tonnage.** Rejected — §3. Rewards junk volume and is uncomputable
  for the rows ADR 0056 refused to fabricate.
- **A logging streak.** Rejected — §3. It measures app-opening.
- **Re-deriving `effectiveKg` at read time so the records are "current".**
  Rejected — §4. It moves stored numbers for a bodyweight change nobody
  consented to.
- **Dropping stack-level and band rows from the exercise's own history too.**
  Rejected — §5. Their kilo is unavailable; their progress is not.
- **Celebrating every first entry as a PR.** Rejected — §6. Four records on day
  one trains the athlete to ignore the fifth.
- **A muscle-group heatmap.** Rejected as such. Hard sets per muscle with the
  attribution rule visible was the accepted alternative — and it did not ship
  either; see Consequences.

## Consequences

- **The PR banner is not built.** `saveLoggedSet` still returns
  `{ ok: true; id } | { ok: false; reason }` and runs no detection. The spec's
  own demo sentence — _"a PR banner that fires the moment a record set is
  completed"_ — is unmet, and the user story that calls the banner _"the reason
  the feature exists"_ is unserved. The derivation is pure and cheap to call
  from that action; nothing structural blocks it.
- **`BenchmarkKind` did not grow.** It is still the single member `farthest`,
  and strength records live in a **parallel, unconnected union**. The
  consequence is concrete: a strength record cannot surface anywhere the
  existing personal-record machinery reads, including the Cockpit's proof zone.
  The doc comment calling these _"the strength arms of `BenchmarkKind`"_ is
  inaccurate as written and should be fixed with the union.
- **Hard sets per muscle per week is not built**, and neither, therefore, is the
  stated synergist attribution rule. `countsTowardWork`'s own doc comment
  advertises a hard-set count that has no consumer. The guard held by accident:
  no coloured picture was drawn, so no picture is pretending to be evidence.
- **There is no estimated-1RM trend and there is no chart.** The exercise page
  ships a list of rows with a CSS-width bar, and its value is **top-set kilos**,
  not e1RM. The equation is named on the record card, honestly — but "the
  formula named on the axis" has no axis to be named on, and the e1RM series
  over time is a single all-time-best card.
- **The history query is unbounded.** No `take`, no cursor. It loads every set
  log for the exercise, which is fine at today's volumes and is a stated debt,
  not a design.
- **The database query is written twice, and the two disagree.** The pure layer
  generalised correctly (`lastTimeYouDidThis` is literally
  `exerciseHistory(...)[0]`), but the ghost still runs its own pair of queries
  in `strength-log.server.ts` while the history surface runs its own `findMany`.
  The ghost query is **not equipment-scoped** and the history query is, so a
  dumbbell session can ghost against a barbell one. `setGhostReadings`, the pure
  function that would unify them, is exported, tested and **has no production
  caller.**
- **The two pre-declared indexes are still unexercised.** The shipped query
  filters on `exerciseId` and orders by `orderIndex`, so neither
  `(exerciseId, completedAt)` nor `(variantId, completedAt)` is used. The index
  ADR 0056 added _for_ this slice is still waiting for it.
- **`crossExerciseComparable` is computed and never read.** There is no
  cross-exercise reading yet for it to exclude a stack level from, so the flag
  is correct and inert.
- **`NO_KILOS_NOTE` exists as two literals in two modules**, and
  `strengthRecordLabel` duplicates the presenter's formatting and is unused in
  production. Two copies of a phrase and two copies of a rule, both able to
  drift.
- **Records are keyed on the variant's equipment with a fallback to the legacy
  `Exercise.equipment` string**, because ADR 0061's `variantId` is not yet
  written by the log path. The key's shape is right and its second half is still
  a string.
