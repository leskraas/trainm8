# The Plan Outline is relational, its weeks are dated, and Plan Generation is deleted rather than adapted

#367 asked what the extended **Plan Outline**'s stored shape is and how today's
data migrates. Both halves of the question had moved since it was written.

The stored shape today is a JSON blob on the Event — `planOutline String?`
(`prisma/schema.prisma`), holding
`{ phases: [{ name, weeks, focus, weeklyLoadHours }] }`
(`app/utils/plan-generation/schema.ts`). Four ADRs have since taken that shape
apart:

- **ADR 0040**: per-week volume is derived from an anchor plus a rate, never
  stored. `weeklyLoadHours` has no successor field.
- **ADR 0041**: a phase carries no load, no unit and no discipline. Volume moved
  onto **Training Tracks**.
- **ADR 0042**: `focus` leaves the phase; an endurance segment authors a
  **Quality Session Mix** instead.
- **ADR 0043**: **Volume Currency** belongs to the **Training Track**, one track
  per **Discipline**, over one shared phase timeline.

So the shape now holds two structures — phases, and _n_ tracks — and almost
every field of the old blob is gone. This ADR decides how that is stored, what
happens to the data, and what happens to the only producer that writes it today.

## Evidence

### The repo already has a rule for this, and the blob is its one exception

| Existing model                         | Form             | What it is                                   |
| -------------------------------------- | ---------------- | -------------------------------------------- |
| `Workout → WorkoutBlock → WorkoutStep` | **rows**         | authored, nested, edited piece by piece      |
| `WorkoutStep.intensity`                | JSON in a column | a _value object_ (a union), replaced whole   |
| `Event.disciplines`, `Event.target`    | JSON in a column | value objects, replaced whole                |
| `Event.planOutline`                    | JSON             | authored nested structure — **the only one** |

The blob was defensible while the Outline was **Plan Generation output written
once on approve** (ADR 0016): a record of what was generated, never edited. #365
changed its category — manual authoring makes it primary data the athlete edits
one segment at a time. `WorkoutStep` also shows this repo already expresses a
discriminated union relationally, with `kind` plus nullable per-kind columns,
which is the shape ADR 0041 §4's two progression rules need.

Two further facts: the repo carries **27 migrations**, so DDL is routine here
rather than an event; and a blob makes every edit a read-modify-write of the
whole season, so two tabs editing different segments silently clobber each other
— a risk generation never had because it wrote once.

### Nothing points _into_ the structure

Five call sites read the outline, and none of them addresses a phase or a week:

| Site                                 | Reads                                    |
| ------------------------------------ | ---------------------------------------- |
| `training.server.ts` `getActivePlan` | the whole thing, for the Plan card's arc |
| `load/fitness-projection.ts`         | `weeks` + `weeklyLoadHours`              |
| `plan-generation/generate.server.ts` | the whole thing, to compute the horizon  |
| `plan-generation/extend.server.ts`   | only _does it exist_                     |
| `plan.new.tsx`, `preview.ts`         | rendering                                |

`week-replan.server.ts` never reads it, and **Weekly Plan Adherence** never
reads it either (ADR 0019: it is `sum(actual TSS) / sum(Planned TSS)` over
sessions). A stamped session anchors to the **Event** via `targetEventId`, not
to a phase — #365 §2's "no live link". So normalisation buys addressability
nobody asks for; its case rests on editability and enforceable invariants
instead.

### The plan's start was derived backward, and manual authoring breaks that

`dashboard.ts` computes `planStart = eventDate − totalWeeks`. Generation could
rely on it because its prompt forces the phases to sum to the horizon exactly
(`anthropic-client.ts`: "the outline phases' weeks must sum to the full
horizon"). Manual authoring has no such constraint: adding two weeks to Base
moves the plan's _start_ two weeks earlier — into the past, over weeks the
athlete never lived. That is the failure ADR 0040 §5 introduced dated anchor
segments to prevent, one level up.

### The repo already has a week key, and it is a date

`schema.prisma`, `WeekReplan`:

```prisma
weekKey String // closed week's Monday, YYYY-MM-DD in the Athlete Timezone
@@unique([athleteId, weekKey])
```

`athlete-calendar.ts` calls it "the **canonical key** for week-scoped records …
addressed by their week key **rather than by an instant**".

### The deload literature cuts volume and holds intensity and frequency

From the
[reference note](../wayfinder/manual-training-planning/intensity-load-and-volume-reference.md)
§7:

- **Bosquet et al. 2007** (meta-analysis): a 2-week taper with volume
  exponentially reduced **41–60%** is "the most efficient strategy", optimally
  "without any modification of either training intensity … or frequency".
- **Mujika & Padilla 2003**: maintain intensity, cut volume, reduce frequency
  **no more than ~20%**; progressive tapers beat step tapers.
- **Bell et al. 2025** (strength deload): volume **40–60%** for moderate
  recovery needs, 5–7 days, "frequency will generally remain unchanged".
- **intervals.icu**: 3:1 with **−30%** volume, citing 25–40%.

ADR 0040 left one question here: with a **Quality Session Count** in the model,
should a recovery week reduce it, as Runna's deload does? Runna is the outlier,
and its three moves — hard sessions cut more than easy ones, the long run cut by
ability, one fewer run — all distribute work _inside_ the week. None of them is
a statement at the week's guideline level.

### Enforcement: CHECK constraints have precedent, triggers do not

`20260707141528_relax_account_connection_for_key_providers/migration.sql`
carries a hand-written
`CHECK ("status" IN ('active','expired','revoked','error'))`. No migration in
the repo contains a `TRIGGER`. Immutability elsewhere in the app (ADR 0012,
0032: "promoted Recordings are immutable") is enforced by no code path writing
them, not by the database.

### Plan Generation is well encapsulated, and its output no longer fits

17 files in `app/utils/plan-generation/` (~3 650 lines) plus two routes, with
**only two importers outside the directory** — those same two routes. Of eight
ADRs that mention generation, only **ADR 0016** is about it. Meanwhile its tool
schema lists `focus` as **required**, and `focus` was removed by ADR 0042; its
`weeklyLoadHours` has no column to land in; and the volume level it emits is an
AI guess where ADR 0040 §6 requires the athlete's authored number, pre-filled
from actuals.

## Decision

### 1. The Plan Outline is stored relationally

Nine tables replace the blob, and `Event.planOutline` becomes the relation:

```
Event
└── PlanOutline                     startWeekKey            (1:1 with Event)
    ├── PlanOutlinePhase[]          orderIndex, name, weeks, rhythm, tapers
    ├── TrainingTrack[]             discipline, currency    @@unique(outline, discipline)
    │   ├── SeasonAnchorSegment[]   fromWeekKey, value
    │   ├── TrainingTrackSegment[]  kind: endurance | strength
    │   │   └── QualitySessionMixEntry[]  zone (3–5), sessionsPerWeek
    │   └── WeekVolumeOverride[]    weekKey, value
    └── WeekPattern[]               name, orderIndex
        └── WeekPatternDay[]        weekday, kind: fixed | share
```

Nothing is JSON-encoded, including the **Quality Session Mix**: every level has
its own identity, its own editing action, and an integrity rule the database can
hold. That last point is what a blob cannot do at all:

| Invariant                                              | Enforced by                         |
| ------------------------------------------------------ | ----------------------------------- |
| one track per **Discipline** (ADR 0043 §1)             | `@@unique([outlineId, discipline])` |
| one endurance segment per phase (ADR 0042 §8)          | `@@unique([trackId, phaseId])`      |
| a zone cannot appear twice in a mix                    | `@@unique([segmentId, zone])`       |
| one anchor and one override per week                   | `@@unique`                          |
| zones **3–5** only (ADR 0042 §3)                       | `CHECK ("zone" BETWEEN 3 AND 5)`    |
| a segment cannot mix the two kinds' positioning fields | `CHECK` on `kind`                   |

Rejected: keeping the blob with a grown Zod schema and a `version`
discriminator. Its strongest argument was that #381 must land either way without
a migration — and that argument dissolves once **Volume Landmarks** are read
correctly. They are _athlete_ attributes that ratchet between segments, not plan
values (ADR 0041 §4, `CONTEXT.md`), so a strength segment stores landmark
**names** plus a duration. If #381 lands per-muscle, the vector lands on the
athlete and this schema does not change. `Exercise.primaryMuscle` already
carries the `MuscleGroup` vocabulary.

### 2. A phase's name stays free text, and "current" is compared by identity

`name` remains a `String`. Nothing in the app branches on it: `planArc` picks
the phase containing the current week and returns the name for display, and the
three things the name used to proxy are now their own fields — `tapers`,
`rhythm`, and the emphasis derived from the mix (ADR 0042 §5). A closed
vocabulary would refuse "Off-season", "Rebuild" or "Return to run", and ADR 0042
§6 already established that the Base/Build difference is quantitative — so an
enum would assert a kind distinction the model does not have. The name carries
**intent**, which no derived quantity can.

What an enum would _not_ have fixed is the real defect it was proposed for:
`presenter.ts` compared `phase.name === currentPhase`, so a season with two
A-races — `Base · Build · Peak · Taper · Base · Build · Peak · Taper` — lights
up two phases as current. An enum repeats exactly as much as a string. The fix
is identity: `planArc` now returns `phaseIndex`, and the bands compare
positions.

Preset names stay **#371's**. If that ticket wants a machine-readable origin it
is one nullable `presetKey` column added then, and this ADR deliberately does
not pre-empt it.

### 3. Weeks are keyed by their Monday; the plan's start is authored

Every week-scoped row carries a `weekKey` — the week's Monday, `YYYY-MM-DD` in
the **Athlete Timezone**, the `WeekReplan` idiom — rather than an index into the
plan. An index is relative to a start that used to be derived, so a structural
edit shifted every stored anchor and override by a week. This is recorded as a
**sharpening** of ADR 0040 §5's `(fromWeek, value)`: the pair is
`(fromWeekKey, value)`, and the reason is that ADR's own — never rewrite a week
already lived.

`PlanOutline.startWeekKey` is authored, and the phases lay **forward** from it.
So "the phases sum to the horizon" becomes a visible consequence — _"the plan
ends one week before the race"_ — rather than an invisible invariant that moves
the past.

One rule follows, and it is the whole geometry:

> **What floats free of the phase timeline is dated. What is aligned to it is
> relative.**

| Structure                 | Position                 | Why                                                                                        |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| **Plan Outline phase**    | `orderIndex` + `weeks`   | contiguous by construction; a gap in a season is meaningless, so it is **unrepresentable** |
| **endurance segment**     | `phaseId`, no dates      | 1:1 with its phase (ADR 0042 §8); its own dates could drift from the phase's               |
| **strength segment**      | `startWeekKey` + `weeks` | floats free (ADR 0041 §4), and a gap _is_ meaningful — "no lifting these weeks"            |
| **Season Anchor segment** | `fromWeekKey`            | a dated act (ADR 0040 §5)                                                                  |
| **Week Volume Override**  | `weekKey`                | a statement about one calendar week                                                        |

Every phase's from/to dates are **derived** by one function, so the athlete and
the API see dates everywhere — they are simply not stored in two fields that can
disagree. Storing `start` _and_ `end` _and_ `weeks` is three numbers where one
suffices, and it makes gaps and overlaps representable, guarded only by a
validator. A strength segment stores its **duration**, not its end date, because
ADR 0041 §4 has the segment author "two landmarks and a duration" and its length
is a _consequence_ of reaching MRV — an end date would store the consequence.

### 4. The phase says _when_ a week recovers; the track says _how much_ — and the mix is untouched

`rhythm` and `tapers` live on the phase: they are time structure. The magnitude
of every cut is a volume quantity, so it lives on the **Training Track
segment**, which is where a phase carrying no volume (ADR 0041 §1) forces it.

**A recovery week does not reduce the Quality Session Mix.** This answers what
ADR 0040 left here, and against Runna: three independent sources — endurance
taper, endurance recovery week, strength deload — cut volume and hold
**intensity and frequency**. Runna's transformation operates on sessions
_within_ the week, which is the **Week Pattern**'s level, not the guideline's.

| Field                             | Carrier           | Null means                                  |
| --------------------------------- | ----------------- | ------------------------------------------- |
| `rhythm` (`3:1` / `2:1` / `none`) | phase             | — (defaults to `3:1`)                       |
| `tapers`                          | phase             | —                                           |
| `recoveryCut`                     | endurance segment | convention **−30%** (intervals.icu; 25–40%) |
| `taperCut`                        | endurance segment | convention **−50%** (Bosquet: 41–60%)       |
| `deloadCut`, `deloadWeeks`        | strength segment  | convention **−50%**, 1 week (Bell 2025)     |

Nullable rather than a stored default, because `null` means "follow the
convention" and a number means "the athlete authored this". The distinction is
load-bearing: these constants are **conventions**, not injury prevention (ADR
0040 §13), so when one moves, the athlete's own numbers must not move with it.

The taper's _shape_ is a documented function in code — exponential to its full
cut in the phase's final week, per Bosquet — never per-week stored values, which
would re-store what ADR 0040 §1 derives. Domain knowledge in code follows
ADR 0006.

Because a strength track segments independently of the phases, it never meets
the phase's rhythm: its deload closes its own segment, when MRV is reached. A
runner's recovery week and a lifter's deload landing in different weeks is ADR
0041 §4's intent, not an inconsistency.

### 5. An override is a leaf, and it is the week's final target

Three things follow from ADR 0040 §3's _indexed, not folded_:

- **A leaf.** An override changes one week. The next week still computes from
  the anchor and the ramps. Folding it forward would reintroduce the order
  dependence the indexed formula exists to remove, and would turn "I dropped one
  week" into "I dropped the rest of my season".
- **Final.** The role factor is _not_ applied on top, or an override of 45 on a
  recovery week would yield 31.5 and the number the athlete typed would never be
  the number they get.
- **It survives a later re-anchor**, marked, revertible. Deleting an athlete's
  explicit statement about a week because they later re-anchored is a silent
  overwrite, which is the thing dated anchors exist to stop.

`value = 0` expresses a week without training, needing no flag, and because
overrides hang on the **track** they work identically for a strength track.

### 6. A Week Pattern is stored, per plan

`WeekPattern` + `WeekPatternDay` belong to the **Plan Outline**, so a stamped
week can be re-stamped without being rebuilt by hand. This is the narrow answer:
whether a _named, reusable, athlete-owned_ pattern exists is **#375's**, and the
Outline's shape at the phase and track level is invariant under every answer
that ticket can give. The accepted cost is that if #375 puts the week level on
the athlete, these rows become a copy-on-stamp instance of it — the
template/instance split ADR 0039 already uses — or migrate upward once.

Two consequences travel with stamping, and both hold regardless:

- **Stamping copies the `Workout` per session.** `Workout.sessions` is
  one-to-many, so sharing a Workout across stamped weeks would make editing
  Wednesday in week 2 edit weeks 1, 3 and 4 — breaking #365 §2's "editing one
  week never touches its siblings". `extend.server.ts` already created a fresh
  Workout per generated session, so the precedent existed before it was deleted.
- **V1 needs a copy-week action.** There is no session- or week-level duplicate
  in the app today (`duplicate` exists only for a step and a set inside the
  workout editor), so "just copy a week" was not the free alternative it looked
  like.

### 7. A pattern day is either a fixed session or a share of the week

A pattern cannot hold absolute quantities, because the week's target is derived
and changes week to week (ADR 0040 §1): the same pattern stamped into a 50 km
week and a 65 km week must produce different sessions.

| `kind`  | Carries                                         | Stamped as                                                  |
| ------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `fixed` | `workoutId`                                     | copied as authored — intervals are _prescribed_, not scaled |
| `share` | `weight` (+ an optional `workoutId` as a shape) | absorbs its part of the week's remaining volume, by weight  |

```
                        week 1 (50 km)   week 8 (65 km)
tue  share  weight 1      6.7 km           9.1 km
wed  fixed  5×1000m Z4    8.0 km  fixed    8.0 km  fixed
thu  share  weight 1      6.7 km           9.1 km
sat  share  weight 2.5   16.8 km          22.8 km
sun  share  weight 1.75  11.8 km          16.0 km
                         ───────          ───────
                          50 km            65 km
```

This is ADR 0041 §5 verbatim — "the endurance sessions split the whole endurance
target between them". Weights are **normalised at stamp time**, so "the shares
sum to 97%" is unrepresentable. A day carries no zone: `session-profile.ts`
resolves the zone from the session itself, so the mix-disagreement warning (ADR
0042 §9) reads the content rather than a claim about it. A day references its
**track** by foreign key, since the pattern lives on the same Outline. If the
fixed sessions alone exceed the week's target, the app warns softly and never
corrects — the shape of ADR 0040 §12 and ADR 0042 §9.

### 8. Volume Currency's lock is a type; the vocabularies are CHECKs

The database enforces what a value **may be**; the code enforces **when** it may
be set.

- `CHECK ("currency" IN ('km','hours','tss','sets'))`, and the same for
  `discipline`, `rhythm`, both segment `kind`s and the landmark names. Every
  structural invariant in §1's table is pinned by
  `app/utils/plan-outline/constraints.test.ts`, because a constraint nobody
  exercises is one a later table rebuild can silently drop.
- `currency` will appear in the authoring service's **create** input and in **no
  update input**, so changing it is a compile error rather than a runtime check.
  That service does not exist yet — there is no authoring surface — so this half
  is a **requirement on it**, not something already enforced, and the test that
  pins it lands with it. Changing currency is re-authoring, so the action
  offered is _author a new track_, never a greyed-out field.

Rejected: a `BEFORE UPDATE` trigger. It would be the repo's first, invisible in
`schema.prisma`, and SQLite rebuilds tables on `ALTER` — as the two existing
CHECK migrations show — so a later migration could silently drop it. The risk is
asymmetric (a stray currency write corrupts the unit of every week already
lived), which is the argument for the service-level test, not for a trigger.

### 9. Existing Outlines are deleted, not migrated

Every stored outline is Plan Generation output, and the app has **no external
users**, so a conversion buys nothing over a clean slate. The two lossy parts
were deliberate in any case: `focus` prose ("Add threshold and tempo work") maps
to no zone honestly, and one `weeklyLoadHours` covering several **Disciplines**
cannot be split across one track per Discipline without inventing a
distribution.

_This reason is dated._ It holds only before launch, and it is not a precedent
that Outline data is disposable.

Sessions anchored to those Events survive. An Event without an Outline is a
calendar marker, not a plan (ADR 0018), which the read path already handles.

For the record, the conversion that was designed and then dropped:
`startWeekKey` from the old backward derivation, one **Season Anchor** segment
per phase (a flat per-phase level _is_ a re-anchor), `rhythm: 'none'` and
`tapers: false` because the old data claimed neither and setting them would have
changed the numbers, and **no segments at all** — because a segment with an
empty mix would assert "this Build phase contains no quality sessions", and the
new shape deliberately has no way to say "unknown".

### 10. Plan Generation is deleted rather than adapted

V1 planning is fully manual, and the blob it wrote is gone, so
`app/utils/plan-generation/` and its two routes are removed rather than ported.
Rebuilding generation on this foundation is its own effort; **ADR 0016 is
superseded** by that deletion, and `CONTEXT.md`'s generation entries are marked
_Retired_ following the `Upcoming Ledger` precedent (ADR 0017).

The alternative — keeping generation alive on a thin adapter, `focus` dropped
and per-phase hours mapped to anchor segments — was rejected as carrying a
feature no one is building on: it would have produced outlines with no ramp and
no mix, and an AI-guessed volume level where ADR 0040 §6 requires the athlete's.

**Session Source keeps `generated`** in its vocabulary: sessions already
recorded as generated are history, and history is immutable (ADR 0012).

## Consequences

### What this sharpens and supersedes

- **ADR 0040 §5 is sharpened**: an anchor segment is `(fromWeekKey, value)` — a
  dated Monday, not a week index. Same reason, stronger against structural
  edits.
- **ADR 0040 §2 and §3 are reconciled.** §3's formula reads "Π over the loading
  weeks before w", while §2 states "a recovery week is **last loading week** ×
  (1 − cut)". Read literally, §3 gives a recovery week the step a loading week
  in its position _would_ have taken, making the deload's reference the ramp
  rather than the loading peak — which the platform survey found to be the
  field's strongest convergence. §2 wins: the ramp product **freezes at the last
  loading week**, and the implementation and its tests pin it.
- **ADR 0018's arc** reads the authored `startWeekKey` instead of counting back
  from the Event date, and `planArc` returns `phaseIndex` beside the name.
- **ADR 0016 is superseded** — the feature it describes is deleted (§10).
- **ADR 0019 is untouched**: **Weekly Plan Adherence** still never reads the
  Outline. Verified, not assumed.

### Accepted costs

- **Two representations instead of one.** A plan authored in a wizard is
  in-memory before it is rows; the blob was one shape for both. Precedent exists
  — `buildBlocksCreate` did exactly this mapping for sessions.
- **A schema change now costs a migration.** #384 (a strength emphasis
  vocabulary) is the one open ticket likely to need one. #371 is code constants,
  #385 is a derivation, and #381 is neutralised by §1.
- **No SQL query can filter on plan content**, since currency and discipline are
  now columns — this cost is actually _removed_ by going relational; what
  remains is that the immutability of `currency` is a code invariant, not a
  database one.
- **Existing generated plans are gone**, and the app has no plan-authoring
  surface at all until the manual one lands. Deliberate: both halves are
  destructive without their replacement, which is why they belong in the same
  release.
- **A strength track's weeks are Unavailable**, because **Volume Landmarks** are
  athlete attributes this schema does not yet carry. The segment stores landmark
  names and a duration; the numbers wait on #380 and #381.

### Downstream

- **#375** receives the per-plan **Week Pattern** and the invariance argument
  (§6), plus stamping's two requirements.
- **#371** receives a phase object with exactly one word on it, and the note
  that a `presetKey` column is available if it wants one (§2).
- **#368** is **voided**: with generation deleted there is no coexistence to
  decide. It is closed unanswered rather than resolved.
- **#385** owns the remaining conversion. `TSS_PER_PLANNED_HOUR = 60` is
  untouched and still pinned by a test; `plannedWeeklyTss` now localises it,
  returns **null** for `km` and `sets`, and needs no change beyond that when the
  mix-aware rule lands. _Decided in ADR 0045, which also found that the **Week
  Pattern** stored here cannot serve the conversion: `WeekPattern` carries no
  week binding, so which pattern governs a given week is unanswerable from
  stored data, and §7's deliberate "a day carries no zone" means the
  easy-vs-quality split could only be recovered by reading the referenced
  `Workout` — the session layer ADR 0043 §3 keeps out of guideline-level
  figures._
- **Rebuilding Plan Generation** on this foundation is raised as its own issue,
  outside map #362 (which holds generation out of scope), in the same way #377
  and #383 were raised.

## Status

Accepted for the manual planning foundation (#367, parent map #362). Sharpens
ADR 0040 §2, §3 and §5, amends ADR 0018, and supersedes ADR 0016. Landed as
schema, migration and code rather than as a plan alone, at the owner's
direction.
