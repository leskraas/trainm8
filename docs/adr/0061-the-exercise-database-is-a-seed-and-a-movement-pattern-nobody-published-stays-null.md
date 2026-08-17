# The exercise database is a seed, and a movement pattern nobody published stays null

Status: Accepted

Slice 6 of [`strength-module.md`](../specs/strength-module.md), stage 5 of
[`out-of-the-box/strength-destination.md`](../wayfinder/out-of-the-box/strength-destination.md).
Research:
[`strength-tracker-surfaces.md`](../research/strength-tracker-surfaces.md) §1.1,
§1.2, §1.3, §2.

**Closes
[ADR 0056](./0056-a-strength-actual-is-logged-in-app-and-a-kilo-is-not-a-kilo.md)'s
consequence that the progression key "should be `(exerciseId, equipment)`"** by
building the equipment half as a real entity. **Confirms
[ADR 0055](./0055-a-session-archetype-is-authored-and-a-reading-is-never-stored.md)**
— `SESSION_ARCHETYPES` does not grow a strength arm, and the reason is ADR
0055's own three-column foreign key. **Follows
[ADR 0027](./0027-text-first-workout-authoring.md)** — a variant's `displayName`
is stored rather than composed, because a rendered name is never parsed back
out. **Fixes #469 on `Workout`'s worked precedent (#448).**

## Context

`Exercise` had **six columns**: `id`, `name`, `primaryMuscle`, `equipment`,
`isCompound`, `createdByAthleteId`. Twenty-nine seeded rows behind them, and
three consequences that each blocked a shipped feature:

- **No load semantics**, which is why ADR 0056 shipped `perSide` inside the
  stored `LoadValue` union and kept it out of the picker. A "32 kg dumbbell
  press" is 64 kg of work and a "32 kg goblet squat" is 32 kg, same equipment —
  and nothing in the schema knew which.
- **No movement pattern**, which ADR 0047 §2 already cites as the blocker for
  per-muscle volume, and which is the only filter axis that makes a
  several-hundred-row picker usable at 390 px.
- **Authorship inferred from `createdByAthleteId IS NULL`** — #469, the bug
  `Workout` fixed in #448. An athlete authors a custom exercise, deletes their
  account, `onDelete: SetNull` nulls the owner, and the orphan is then served to
  **every** athlete as a trainm8-authored catalog row.

Twenty-nine rows is also simply not a picker. `strength-tracker-surfaces.md`
§1.1 puts the practical range at 300–900: below ~200 the athlete hits _"my
exercise isn't here"_ in week one, and above ~1,500 without a pattern filter the
list is unusable on a phone.

## Decision

### 1. `free-exercise-db`, vendored, and the licence is the whole argument

Two datasets were real candidates and the content difference between them is
immaterial. **`free-exercise-db` (873 rows, The Unlicense)** wins over **wger
(850 rows, CC-BY-SA 4.0 per row)** on the licence alone.

Share-alike reaches a **derived** corpus, and this repo has a **community
publish tier** (ADR 0052) where athlete-authored rows are published and
attributed. A share-alike obligation propagating into that corpus is a legal
question the product does not want and does not need. The Unlicense is a
public-domain dedication with no downstream obligation, which is the only
property that matters here.

wger's **structure** is mined and its rows are not: the translations/aliases
split, the variation-group idea, and the anatomical-versus-display muscle
distinction all come from reading wger's schema.

### 2. It is a seed, not a runtime dependency

`app/utils/exercise-corpus.free-exercise-db.ts` is a **vendored snapshot** — the
rows live in this repo, dated (`2026-08-14`), and nothing in the app fetches
from upstream at any point. The alternative is a runtime dependency on a
GitHub-hosted JSON file for the contents of the exercise picker, which is a
liveness dependency taken in exchange for nothing.

The snapshot is curated down to **704 rows** by four stated rules, each of which
is a refusal rather than a mapping: `stretching` and `cardio` categories are
dropped (no set, no load); rows whose primary muscle is `adductors`, `abductors`
or `neck` are dropped, because `MUSCLE_GROUPS` has no member for them and filing
one under a neighbour would **invent an anatomy claim**; rows colliding by name
with an already-seeded id are dropped so the shipped id stays the single
referent; `traps` maps to `shoulders`, following the shipped seed's own shrug
row. With the 44-row authored overlay, `EXERCISE_CORPUS` is **745 rows** —
inside the research's stated range, and the seed test asserts the range rather
than the number.

### 3. Movement pattern, laterality and load semantics are authored here, and are null where nobody authored them

**No open dataset carries any of the three.** That is not a gap in the dataset
chosen; it is true of every candidate, and it is the reason adoption had to be a
seed in the first place — all three would have to be authored regardless of
which rows were adopted.

So they are authored, for the **44 lifts that matter** — the ones a program
prescribes, a plate calculator loads, and a record is kept for — and the other
701 rows carry `movementPattern: null`. A null here is a **stated absence**: the
picker's pattern filter simply does not offer those rows, and nobody is told a
cable crossover is a horizontal push on the strength of a guess. The seed test
asserts both halves: every authored lift has a pattern, and **every** snapshot
row has none.

The same honesty runs inside the authored set. A trap bar and an EZ bar keep
`barKg: null`, because those implements are **not standardised** and a number
would be a claim about the athlete's gym.

**`MOVEMENT_PATTERNS` is twelve members and not FIT's 53.** FIT's
`exerciseCategory` was the vocabulary the research offered; half its members are
not patterns, and 53 chips do not fit at 390 px. Twelve is what a phone filter
can be.

### 4. Identity is `(exercise, variant)`; an alias is never a second identity

`Exercise` is the canonical, equipment-free movement — "Bench Press".
`ExerciseVariant` is one equipment realization of it, carrying `equipment`,
`angle` and the **Load Semantics**. This keeps the picker short (one "Bench
Press" row, not four) and the histories separate (barbell and dumbbell bench
genuinely progress independently).

`variationGroupId` is **discovery only, never identity**. It groups
near-substitutes so the picker can suggest a front squat for a back squat. Were
it identity, two histories would merge, and **merging down is irreversible if
you got it wrong** while aggregating up is a choice a chart makes freely.

`ExerciseAlias` is search-only for the same reason stated as a rule: **the
moment an alias can be logged against, one movement has two histories.** There
is deliberately no foreign key from `ExerciseSetLog` to an alias.

**Load Semantics ship as columns on the variant rather than as a nested JSON
object** — a divergence from the spec's sketch, and the better shape: `loadKind`
(which `LoadValue` member this movement takes), `barKg`, `perSideMultiplier`,
`isFixed`, `isAssisting`, `useBodyweightForBar`, `inventoryProfileId`. Each is
CHECK-constrained and each is read by the plate solver (ADR 0060 §2) as a
column, not as a parsed blob. `perSideMultiplier` is also the reason the
smallest achievable increment on a bar is `2 × smallestPlate` — and, per ADR
0060 §2, why loadability is a separate question from the increment.

### 5. `authorship` is asserted, and the constraint is an implication

`Exercise.authorship` is `'system' | 'athlete'`, asserted, with the migration
enforcing

```sql
CHECK ("authorship" <> 'system' OR "createdByAthleteId" IS NULL)
```

— the **implication**, not the biconditional. That is the whole fix. The
biconditional would make an orphaned athlete-authored row **inexpressible**,
which forces it back into `'system'` and re-creates #469 in the constraint
layer. Under the implication the orphan stays exactly what it was, is readable
by nobody, and is served to nobody.

`getExerciseCatalog` reads asserted authorship
(`authorship: 'system' OR createdByAthleteId = userId`) and a test proves the
orphan is not served as stock. The backfill is exact rather than a guess: all 94
existing rows have a NULL author and are genuinely trainm8-authored, and there
are no athlete-authored rows yet.

### 6. `Workout.strengthGoal` is an authored column, and `SESSION_ARCHETYPES` did not grow a strength arm

The corpus files every heavy squat day as `neuromuscular` or `technique` — _"the
nearest honest member and not a good fit"_, in its own header's words. The
obvious fix is to add strength members to `SESSION_ARCHETYPES`. It is the wrong
fix on three counts:

- **All sixteen archetypes are endurance readings**, and their classifier
  refuses without a **Training Week** as context. A strength session cannot
  produce a reading of that vocabulary at all, so the new members would be
  values nothing could ever compute.
- **The cost is structural.** Growing it means touching a CHECK **and** ADR
  0055's three-column foreign key into `CatalogueEntry`.
- CONTEXT.md already states the position: strength authors a **Strength Goal**,
  not an endurance archetype.

So `Workout` gains an authored `strengthGoal` over the shipped three
`STRENGTH_GOALS` (`hypertrophy | maximal-strength | power`), and strength keeps
its own axis. ADR 0047's own Revisit note argues for two more members
(anatomical adaptation, maintenance); that is an amendment to ADR 0047 and this
slice inherits whatever it lands.

**The mutual exclusion shipped weaker than the spec asked, deliberately.** The
spec wanted `discipline = 'strength' ⟹ archetype IS NULL`. What shipped is
`strengthGoal IS NOT NULL ⟹ archetype IS NULL`, plus
`strengthGoal IS NOT NULL ⟹ discipline = 'strength'`. The stronger reading
cannot be imposed today: `CatalogueEntry.archetype` is **NOT NULL** and pinned
to this column by ADR 0055's composite foreign key, so nulling the 24 strength
corpus rows' archetype would **revoke their Catalogue membership**. The corpus
re-authoring that closes it is its own change, and it is named as such below
rather than smuggled into a migration that would have broken the Catalogue.

### 7. No stored number moves

Six tables are new and empty. Every column added to an existing table is new and
either NULL or a stated default. No existing column is read and rewritten with a
different value; no threshold, TSS, CTL, ATL, TSB, `effectiveKg` or
`bodyweightKg` is touched.

Two backfills write and **neither changes a figure**: `Exercise.authorship`
records what each row already was, and one default `ExerciseVariant` per
exercise is derived from that exercise's own legacy `equipment` string so no
history is orphaned. The legacy `Exercise.equipment` column stays readable
beside the variants for one release, the way ADR 0047's retired columns were.
**No Load Recompute Notice is owed**, and the migration says so in its opening
comment.

## Considered options

- **wger's 850 rows.** Rejected on licence, not content. CC-BY-SA 4.0 per row,
  and share-alike reaching a derived corpus collides with the community publish
  tier this repo already ships.
- **A runtime dependency on the upstream dataset.** Rejected — §2. The exercise
  picker would acquire a liveness dependency on somebody's GitHub, in exchange
  for updates nobody asked for, to a corpus that has to be overlaid by hand
  anyway.
- **Guessing a movement pattern from the dataset's `category` or `equipment`
  string.** Rejected — §3. `category: 'strength'` describes 600 rows and says
  nothing about a pattern. A guessed pattern is a filter that quietly hides the
  right exercise.
- **Equipment as a column on `Exercise`, no variant table.** Rejected. It is the
  shape that exists today, and it forces one of two failures: either barbell and
  dumbbell bench are one row and their histories merge, or they are two rows and
  the picker doubles.
- **`variationGroupId` as identity.** Rejected — §4. Merging down is
  irreversible; aggregating up is a chart's free choice.
- **An alias as a loggable referent.** Rejected — §4. One movement, two
  histories, silently.
- **The biconditional on `authorship`.** Rejected — §5. It makes the orphan
  inexpressible, which is how #469 was created in the first place.
- **Growing `SESSION_ARCHETYPES` with strength members.** Rejected — §6. Values
  no classifier could ever compute, bought with a CHECK change and a composite
  foreign key change.
- **Nulling the strength corpus's archetypes in this migration.** Rejected — §6.
  It revokes 24 rows' Catalogue membership.

## Consequences

- **`perSide` is still not in the picker.** ADR 0056 stated the condition —
  _"the picker gains the member when the exercise database carries load
  semantics"_ — and the database now carries them. The picker's `LOAD_KINDS`
  array was not updated and still carries the comment saying it is waiting. The
  data is there; the seven-member array is a one-line fix that this slice did
  not make. **This is the headline of the slice's own demo sentence and it is
  unshipped.**
- **The picker was not touched at all.** There is no movement-pattern filter and
  no alias search: `__exercise-combobox.tsx` still filters by muscle and by the
  legacy `equipment` string. Both `movementPattern` and `ExerciseAlias` are
  seeded data with **no reader**, which is ADR 0037's exact mistake made twice
  in one slice. The rows, the patterns and the aliases exist and nothing shows
  them.
- **New set logs still reference the bare exercise.** `ExerciseSetLog.variantId`
  ships, is indexed `(variantId, completedAt)`, and **`logSet` never writes
  it.** The spec called variant-referencing _"the rule that keeps this honest"_,
  and it is currently true of the schema and false of the data.
  `strength-records.server.ts` already reads `variant?.equipment` with a
  fallback to the legacy string, so the readers tolerate the null — which is
  what makes this easy to forget.
- **The progression key is still the nullable string.**
  `ProgramLiftState.equipment` and `StrengthProgramLiftRule.equipment` remain
  `String?`, defaulted from `Exercise.equipment`. The key's **shape** is
  `(exerciseId, equipment)` as ADR 0056 required; its second half is not yet a
  referent. `findVariantByEquipment` exists and has no production caller.
- **The strength corpus was not re-authored.** All 24 strength Catalogue rows
  still carry `archetype: 'neuromuscular' | 'technique'` and **none carries a
  `strengthGoal`**. The column exists; exactly one row in the whole app writes
  it. The spec asserted the corpus would stop filing heavy squat days under an
  endurance archetype in this slice, and it did not — for the structural reason
  in §6, which is real, and the re-authoring is now an owed change rather than a
  done one.
- **`unilateral` is a boolean that defaults to `false`**, so 701 unauthored rows
  **assert** they are bilateral rather than saying nothing. That is the one
  place in this slice where an absence became a claim, and it is forced by the
  column's type. A genuinely unilateral snapshot row that nobody authored will
  not ask for the other side's reps.
- **The rebuild was not verified the way #448 was.** The spec asked for row
  counts plus a byte-identical hash over carried columns across the `Workout`
  and `Exercise` table rebuilds. Neither was written. The #469 regression test
  exists; the rebuild-integrity check does not.
- **No constraint tests.** None of `Exercise_system_has_no_author`,
  `Workout_strength_goal_is_strength`,
  `Workout_strength_goal_excludes_archetype`,
  `ExerciseVariant_multiplier_is_one_or_two` or
  `ExerciseVariant_bar_is_positive` has a test, despite
  `catalogue.constraints.test.ts` being the shipped precedent for exactly this.
- **`ExerciseVariant`'s `@@unique([exerciseId, equipment, angle])` does not
  constrain the un-angled row.** SQLite treats NULLs as distinct in a unique
  index, so the row with `angle IS NULL` is pinned only by the seed's stable
  ids. The schema comment admits this; a partial unique index is the fix and is
  not built.
- **#469's code is fixed and the issue is still open.** The asserted column, the
  implication CHECK, the corrected read query and the regression test all ship.
  The issue should be closed by whoever merges this, and it was not shipped as
  its own PR as the spec asked.
