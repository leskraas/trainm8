# A strength record is derived from the set row, and tonnage is declined

Status: Accepted

> **Amended — §4's second paragraph was wrong.** _"Every record path selects
> `effectiveKg` and passes it through"_ is exactly one half of the rule, and
> shipping only that half let a bodyweight-derived kilo compete with bar kilos
> inside one `(exerciseId, equipment)` group. Observed in the browser: an
> assisted squat (`{ assisted, assistKg: 10 }`, baked `effectiveKg` 64) fired
> _"Best 2-rep set: 64 kg — first time!"_ with nothing on the bar, and one
> dip-belt row (`{ bodyweightPlus, addedKg: 30 }`, baked 104) fired _"Heaviest
> ever: 104 kg — up 74 kg"_ on a Bench Press whose heaviest real bar weight is
> **30 kg** — on the same page as the engine's own sentence saying that number
> is not a weight on the bar.
>
> **What a reader must now believe instead:** `effectiveKg` is read as baked —
> that part stands and is load-bearing — **and it is only comparable to another
> `effectiveKg` of the same load kind.** The record key is
> `(exerciseId, equipment, loadBasis)`, and the basis is a **fourth** thing a
> reading is about, alongside the kind, the reps and the variant. The
> classification is not a new one: it is `loadKindComparability`, the function
> ADR 0056 §3's table became when the **program engine** was taught the same
> rule a round earlier (_"Back Squat 74 kg → 77.5 kg"_ about an empty bar). The
> engine learned it and this surface did not, which is the whole story of this
> defect. One classification, two readings, and no default branch — see §4 as
> amended and the new §9.
>
> **No stored number moves, and none can.** §1 and §8 stand unchanged: there is
> no records table, no migration, no write path. Every record is derived on
> read, so the fix takes effect the moment the code ships and there is nothing
> to backfill and no Load Recompute Notice to give.
>
> **What the athlete will see change.** Records they have already been shown
> will stop being announced, and that is the point. An assisted lift now has
> **no** record and says why. A weighted dip, a plain bodyweight dip and a
> per-hand dumbbell set keep their records but in their own partition, with the
> basis **in the headline** — _"Heaviest bodyweight set"_, _"Best 5-rep per-hand
> set"_ — so a card the athlete reads at a glance cannot be read as a bar
> weight. A gain phrase can therefore vanish or shrink: the dip belt's _"up 74
> kg"_ becomes _"first time!"_, because within its own partition nothing came
> before it. No number the athlete lifted has changed; what has changed is what
> the app claims those numbers are the most of.

> **Amended again — §2's `e1RM` bullet is only half true.** _"with the equation
> named on the number"_ is right for every reading an equation produced, and it
> names an equation for the one reading no equation may touch: a **one-rep
> set**. `one-rm.ts` forbids estimating from a single — _"Epley would report
> 103.3 kg from a 100 kg single, fabricating 3.3 kg"_ — so where the winning set
> is a single, the number **is** the load lifted. The strip nonetheless printed
> _"61.25 kg (epley)"_: an equation credited with a measurement, and 1/30th of
> it invented.
>
> **What a reader must now believe instead:** an `e1RM` record names **how it
> reached its number**, and that is one of exactly two things with no default.
> `StrengthRecord.oneRmProtocol` is `EstimatorName | 'tested'` — `one-rm.ts`'s
> own `protocol` vocabulary rather than a second one beside it — so the surface
> reads _"Best tested 1RM: 61.25 kg (the load lifted)"_ where a single was the
> measurement and _"(epley)"_ only where Epley actually ran. `estimator` remains
> the projection the equation-naming surfaces read and is **null** on a tested
> single, so no surface can name an equation by omission. The value and the
> label are decided in the same branch on purpose: they cannot disagree about
> what happened. The model's own gates — rep range, effort, an unmapped movement
> — are still asked **first**, for a single as for anything else; `tested` is a
> claim about which arithmetic applies, never a bypass of consent.
>
> **No stored number moves, and none can.** §1 and §8 stand: no records table,
> no migration, no write path. The tested single's kilo is the `effectiveKg` ADR
> 0056 baked at log time, read through unchanged — this amendment removes an
> equation from the read path and adds nothing to the write path.
>
> **What the athlete will see change.** On a lift whose best `e1RM` came from a
> single, the number gets **smaller** by whatever the equation was adding —
> 61.25 kg where the strip said 63.3 — and it stops citing an equation. That is
> not a lost record; it is the record it always was, with the fabrication taken
> off. A multi-rep set's `e1RM` is untouched and still names its equation, which
> is §2's rule and the reason it is worth naming at all.

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
  naming the equation is not decoration. **Amended:** where the winning set is a
  **single** there is no equation to name, because none may be applied — the
  record names the protocol `tested` and says _"the load lifted"_ instead. See
  the second head note.
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

**Amended.** Passing the baked kilo through is necessary and it is not
sufficient, and the paragraph above stopped one sentence too early.
`effectiveKg` is a number whose _meaning_ depends on the `LoadValue` kind it was
baked from, and a record is a comparison — so reading it without its kind
compares a dip belt to a bar. The correct rule is: **read `effectiveKg` as
baked, and compare it only to another `effectiveKg` of the same load basis**
(§9).

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

### 9. A record is keyed by load basis, and an assist takes none

**Amendment, decided with the head note above.** The progression key gains a
third component, `loadBasis`, because `(exerciseId, equipment)` does not
separate two numbers that mean different things on the same lift:

| Load kind                      | Basis               | Why                                                         |
| ------------------------------ | ------------------- | ----------------------------------------------------------- |
| `external`                     | `bar`               | The one weight on the bar. The only comparable basis.       |
| `perSide`                      | `perHand`           | 32 kg in each hand is 64 kg of work — a different quantity. |
| `bodyweight`, `bodyweightPlus` | `bodyweightDerived` | Includes the athlete, so it moves when the athlete does.    |
| `stackLevel`                   | `stackLevel`        | An ordinal, in levels, exactly as §2 already had it.        |
| `assisted`, `band`, `unloaded` | **none**            | No best exists. See below.                                  |

Three consequences follow, each of which is a decision:

- **Partitioned, not restricted.** A weighted dip getting better _is_ real
  progress and must not become invisible, so it keeps every reading it had — a
  heaviest, a rep-max per rep count, a previous best, a debut window — within
  its own basis. `bodyweight` and `bodyweightPlus` share one basis on purpose:
  they are the same number with and without something hung off it, so a first
  weighted dip beats the last unweighted one, which is exactly what happened.
- **The basis is counted as its own history.** `previousValue` and the
  three-prior-session debut window (§6) are computed over the basis, not the
  variant: a first dip-belt bench is a first entry on that progression however
  many barbell sessions sit behind it, and the barbell sessions are not what it
  beat.
- **The basis is in the headline, not only in the note.** _"Heaviest ever: 104
  kg"_ with a caveat underneath is still the sentence that was wrong, because
  the athlete reads the headline and the number. `strengthRecordHeadline` is now
  the single definition both the banner and the strip use, which also closes one
  of the two duplications this ADR's Consequences recorded.

**An `assisted` set takes no record at all**, and this is the one place the
answer is an absence rather than a partition. Its number is bodyweight _minus_
the assistance (ADR 0056 §3's inverted sign), so a maximum over it points the
wrong way: the athlete finally needing no assist at all would read as the
biggest record of the lot, for the wrong reason, and every step of real progress
before that reads as a smaller one. Assisted progress is real and the log holds
it; what the app may not do is call any of it a maximum. So the refusal is
**said** — _"An assisted set takes no record: the number is your bodyweight
minus the assistance, so it grows as the work shrinks."_ — rather than shown as
an empty strip.

**An estimated 1RM is restricted rather than partitioned: it is a `bar` reading
only.** The equation maps reps to a fraction of a one-rep maximum, and the
number it produces is what an anchor and the propose surface price a
prescription in. An e1RM read off a kilo that includes the athlete would hand
those surfaces a bar weight the athlete has never touched — the same defect as
the heaviest-ever, laundered through a model.

**The classification is shared, not copied.** `records.ts` imports
`loadKindComparability` from `program-rules.ts` rather than restating ADR 0056
§3's table, and that function has **no default branch**, so a ninth `LoadValue`
member cannot arrive as a bar weight by omission. Its current home is a
compromise: the classification is a property of `LoadValue` and belongs beside
it in `strength-log.ts`, next to `effectiveLoadKg` — the function that produces
exactly the numbers it qualifies. Moving it there would also let
`program-rules.ts` drop its restated tuple of the eight kinds. **Not done in
this change** because `strength-log.ts` was owned by concurrent work; recorded
here as the next step rather than as a second copy.

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
  The doc comment on `StrengthRecordKind` now says that outright instead of
  calling these _"the strength arms of `BenchmarkKind`"_, which was inaccurate
  as written; the gap itself stands until the unions are joined.
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
- **An `e1RM` record now carries its protocol, and the two surfaces that print
  one read the same field.** `oneRmProtocol` is the answer to _how did this
  number happen_ (`EstimatorName | 'tested'`, absent on the observed records),
  and `estimator` is a **projection** of it for the surfaces that name equations
  — null on a tested single rather than a second answer able to disagree with
  the first. `TESTED_SINGLE_PHRASE` is the short form of `one-rm.ts`'s own
  `equationText`, so the strip and the propose surface say the same thing at two
  lengths and not two things. What is **not** fixed: there is still no e1RM
  series (see below), so which protocol produced the number is stated on the one
  all-time-best card and nowhere over time.
- **`crossExerciseComparable` is computed and never read.** There is no
  cross-exercise reading yet for it to exclude a stack level from, so the flag
  is correct and inert. **Amended:** it is now true for the `bar` basis alone,
  and the records strip does read the phrase that travels with it.
- **Records the athlete has already been shown will disappear** (§9). Nothing is
  migrated, because nothing was stored — the readings simply stop being derived.
  An athlete who has only ever done assisted pull-ups now sees a records strip
  with a sentence in it instead of numbers, which is the honest state and was
  not the previous one.
- **`NO_KILOS_NOTE` is still two literals, and there are now three more phrases
  beside it** — one per non-bar basis, plus the assist's refusal. They live in
  `records.ts`'s `BASIS_NOTES` as one table keyed by the basis, so a partition
  cannot be flagged uncomparable and then left with nothing to say; the
  presenter's own copy of the no-kilos phrase remains the outstanding
  duplication.
- **`strengthRecordLabel` and the presenter no longer phrase headlines twice.**
  Both call `strengthRecordHeadline`. The label function is still unused in
  production, so half of that Consequence stands.
- **`NO_KILOS_NOTE` exists as two literals in two modules**, and
  `strengthRecordLabel` duplicates the presenter's formatting and is unused in
  production. Two copies of a phrase and two copies of a rule, both able to
  drift.
- **Records are keyed on the variant's equipment with a fallback to the legacy
  `Exercise.equipment` string**, because ADR 0061's `variantId` is not yet
  written by the log path. The key's shape is right and its second half is still
  a string.
