# Spec: the strength module — a real tracker, and a program that answers "what do I lift today"

Owner's ask, verbatim:

> _"how 5x5 stronglifts app works. I want this in my app as well. aka a propper
> strength workout tracker. I want all the exercises and the recording stuff,
> all the nice features"_

Sources (do not re-derive):
[`strength-module-brief.md`](../wayfinder/out-of-the-box/strength-module-brief.md),
[`strength-code-audit.md`](../wayfinder/out-of-the-box/strength-code-audit.md),
[`strength-destination.md`](../wayfinder/out-of-the-box/strength-destination.md),
ADR 0056 (shipped slice 1), ADR 0054 (threshold provenance), ADR 0047 (the
calendar-indexed season layer), ADR 0046 §4 (Summary Count), ADR 0027
(render-never-parse), ADR 0021 (derived-never-authored records), ADR 0008
(Unavailable Metric), ADR 0033 (confidence vocabulary), ADR 0050
(derived-then-authored), ADR 0053 §2 (a pure engine behind an impure shell).

---

## Problem Statement

Slice 1 shipped (ADR 0056): an athlete can now log what they lifted. An
**Exercise Set Log** exists, the grid has a **Set Ghost**, the rest timer runs
on a wall-clock deadline, and the **Strength Summary Count** ADR 0046 §4
mandated finally has data behind it. Strength stopped being planned-only.

It is still not a strength tracker, and it is nowhere near StrongLifts. Four
things are missing, and they are missing in a specific order.

**1. The prescription has no referent.** `LoadTarget` ships six members and
`setLoadText` resolves **none** of them. `@ 85 % 1RM` reaches the grid as the
literal string and the athlete does the arithmetic on their phone between sets.
`@ 8RM` — Rønnestad's protocol, the strength corpus's headline acquisition —
renders as a bare `4 × 10` because the module reads only the two legacy columns.
This cannot be fixed with a column: `DisciplineProfile`'s
`@@unique([athleteProfileId, discipline])` makes a squat 1RM and a deadlift 1RM
**the same row**. It is a cardinality mismatch, which is why the gap survived
three ADRs.

**2. There is no history surface and no record.** Every set ever lifted sits in
one indexed table and nothing reads it except the ghost. The athlete cannot see
their squat over time, cannot see their best triple, cannot see an estimated 1RM
trend. The index `(exerciseId, completedAt)` was added _for_ this and has no
consumer.

**3. There is no program.** This is the actual ask. StrongLifts is not a workout
and it is not a plan — it is a **rule plus per-lift state plus a cursor**, and
the next weight is a pure function of the last logged session. ADR 0047's
strength progression is **calendar-indexed**: a weekly sets target interpolated
from a position in a season. That model is correct for the season and cannot
answer _what do I lift today_, because week 6's weight is unknowable in week 1.
The two are orthogonal objects, not competing ones.

**4. There is no session runner.** The log surface is an editing grid for a
session you already know how to do. StrongLifts' surface is a **run**: today's
workout resolved at the moment you open it, a generated warm-up ramp, plate math
under the weight input, an outcome-aware rest timer, and — the part that makes
the whole thing a product — a post-session line that says _what you lift next
time and why_.

Underneath all four sits a fifth gap: `Exercise` has **six columns**. No
movement pattern, no laterality, no load semantics, no aliases, 29 seeded rows,
and an open authorship bug (#469) that serves an orphaned athlete-authored row
to every athlete as trainm8-authored. `perSide` is in the stored `LoadValue`
union and out of the picker for exactly this reason: nothing knows whether a "32
kg dumbbell press" is 64 kg or a "32 kg goblet squat" is 32 kg.

The failure this spec exists to prevent is the one map #434 already produced:
shipping the engine and not the product. An athlete out of the box must be able
to pick **StrongLifts 5×5**, answer one question per lift, and be told what to
put on the bar — today, and every session after, forever, without reading a
paragraph.

---

## Solution

Five entities and one screen.

**`ExerciseThreshold`** — the referent. Per-exercise, effective-dated,
append-only, carrying ADR 0054's two provenance axes (`construct` × `protocol`)
plus an ordinal `confidence` that is **null where the athlete typed the
number**. `repMax` is a **peer** of `oneRm`, never a derivative: converting an
observed 8RM to a 1RM in order to render `@ 8RM` is a round trip through a ±10 %
transform, twice. With it, `setLoadText` resolves the four `LoadTarget` members
it currently drops, and — per ADR 0054 — an estimate may be **proposed** from
the athlete's own logged sets, shown with its derivation, and written only on
their act.

**Strength records and per-exercise history** — derived, never stored (ADR 0021
generalizes cleanly, and unlike the pace/power ladder it needs **no stream tier
at all**: the set row _is_ the measurement). Three honest benchmark kinds join
`BenchmarkKind`: estimated 1RM, rep-max at exactly _n_ reps, and heaviest load
ever. Session tonnage and streaks are **declined, not deferred**.

**The Program** — a first-class entity, sibling to `Workout` and `PlanOutline`,
referencing Catalogue rows for its sessions. A **Program Definition** carries a
per-lift rule table; a **Program Instance** carries per-lift state and a cursor.
The engine is pure — arrays in, decisions out, `now` injected, cannot query —
and it emits both the next prescription **and the reason**, which is the Load
Recompute Notice shape applied to a squat that just dropped 10 kg.

**The Session Runner** — the StrongLifts screen. Today's workout resolved on
open, per-lift target sets, a generated warm-up ramp, plate math as a passive
annotation under the weight input, the shipped set grid with its Set Ghost and
three-controls-per-row rule, an outcome-aware rest timer (3 min after a good
set, 5 min after a missed one), and a post-session outcome per lift.

**The Exercise Database** — a **seed, not a dependency**, because no open
dataset carries movement pattern, laterality or load semantics and all three
must be authored here anyway. `Exercise` gets rebuilt: asserted `authorship`
(fixing #469 on `Workout`'s worked precedent), a movement pattern, laterality,
aliases, and an `ExerciseVariant` child carrying `equipment` and **Load
Semantics** — the thing that lets `perSide` into the picker and tells the plate
calculator what the bar weighs. The progression key is
**`(exerciseId, equipment)`**.

Every number in the shipped programs is quoted from its primary source. A seeded
"StrongLifts 5×5" that quietly uses 2 kg increments because they seemed more
sensible **is not StrongLifts**.

---

## User Stories

### Anchors and the referent (Slice 2)

1. As an athlete, I want to record that my back squat 1RM is 140 kg, so that
   every session prescribed `@ 85 % 1RM` shows me a number instead of a
   percentage.
2. As an athlete, I want my squat anchor and my deadlift anchor to be **separate
   numbers**, so that the app stops pretending one strength value describes me.
3. As an athlete, I want to record `8RM = 70 kg` on the bench press
   **directly**, so that a session prescribed `@ 8RM` resolves without anybody
   converting it to a 1RM and back.
4. As an athlete, I want a rep-max entry to require its rep count, so that a
   number in my history can never mean two different things.
5. As an athlete, I want the app to say **which formula** produced an estimated
   1RM, so that a number I compare against another app is reconstructible.
6. As an athlete, I want an anchor I typed myself to carry **no confidence
   grade**, so that the app never grades a figure I stated about myself.
7. As an athlete, I want each anchor to be effective-dated and appended rather
   than overwritten, so that my strength history is the interesting object and
   my old sessions still read against the anchor they were prescribed from.
8. As an athlete, I want a resolved load to show its provenance in one phrase in
   place — _"119 kg · 85 % of your 140 kg tested squat"_ — with the argument
   behind a tap, so that the logging surface stays free of prose.
9. As an athlete, I want `bodyweight + 20 kg` and `% bodyweight` prescriptions
   to resolve against my current bodyweight, so that weighted dips and pistol
   squats read as loads rather than as an instruction to do arithmetic.
10. As an athlete with no bodyweight on file, I want a bodyweight-derived
    prescription to say plainly that it cannot resolve and what would fix it,
    rather than showing a number nobody measured.
11. As an athlete, I want the app to **propose** a 1RM from a set I already
    logged, showing the set it read and the formula it used, so that I get a
    referent without testing a maximal single.
12. As an athlete, I want to be able to **decline** a proposal and have nothing
    written, so that opening the analysis screen is never an act.
13. As an athlete, I want the app to **refuse** to estimate from a set of 15
    reps, and say so in those words, so that I am not handed a number with a
    ±100 % error bar wearing a confidence grade.
14. As an athlete, I want the app to refuse when it has no sets for a lift, when
    the only sets are far from failure, and when the movement has no validated
    rep↔load mapping — four different refusals with four different sentences, so
    that _"we did not look"_ and _"we looked and there is nothing"_ never
    collapse into the same shrug.
15. As an athlete, I want an accepted estimate to become **mine** — nothing
    re-reads my history to move it underneath me later.
16. As an athlete, I want a stale anchor **frozen and flagged**, never decayed,
    because nobody can tell whether an untested lifter who is still training got
    weaker or stronger.
17. As an athlete on a percentage-based program, I want my **training max**
    stored separately from my 1RM and visibly so, so that an `85 % 1RM` band
    never silently means 76.5 % of my real 1RM.
18. As a coach reading the corpus, I want `@ 8RM` sessions to render their
    resolved kilos for _this_ athlete without the Catalogue row itself changing,
    so that a portable prescription stays portable.

### Records and history (Slice 3)

19. As an athlete, I want a per-exercise page showing my top working set over
    time, so that I can see whether the lift is actually moving.
20. As an athlete, I want my rep-max records **per rep count** — best single,
    best triple, best five — so that I get the least model-dependent record
    there is.
21. As an athlete, I want my heaviest-ever load on a lift, because that is the
    number I actually care about.
22. As an athlete, I want an estimated-1RM trend with the **formula named on the
    axis**, so that the chart states its own model.
23. As an athlete, I want a record to be announced **when I complete the set**,
    not at the end of the session, because the banner is the reason the feature
    exists.
24. As an athlete, I want my first-ever dumbbell bench press to read _"first
    time!"_ rather than firing four PRs on day one.
25. As an athlete, I want warm-ups and abandoned sets excluded from every
    record, so that a record is always a record of work.
26. As an athlete, I want records scoped to the **variant** — barbell bench and
    dumbbell bench are separate histories — so that a lighter dumbbell day never
    looks like a regression.
27. As an athlete, I want a machine-stack exercise to still show its own
    progress curve (level 6 → 7 is real), while being absent from anything that
    compares it to a barbell.
28. As an athlete, I want **no session tonnage record and no streak**, because
    one rewards junk volume and the other measures app-opening.
29. As an athlete, I want to see how many hard sets I did per muscle this week,
    with the attribution rule stated where I can read it.

### Choosing and running a program (Slice 4)

30. As an athlete, I want to start **StrongLifts 5×5** from a short list of
    real, named programs, so that I get the thing I asked for out of the box.
31. As an athlete starting a program, I want to answer **one question per lift**
    — a starting weight, with the program's own published default pre-offered —
    and then never be asked again.
32. As a novice with no tested lifts, I want the empty-bar start (20 kg squat /
    bench / press, 30–40 kg row / deadlift) offered as StrongLifts publishes it,
    so that I need no 1RM to begin.
33. As an experienced lifter, I want to seed a lift from _"a weight you could
    lift for 10 reps"_ — a `10RM` — because that is the program's own
    instruction and it needs no anchor.
34. As an athlete, I want the app to tell me whether **Workout A or Workout B**
    is next, from a stored cursor and not from counting sessions, so that a
    skipped, back-filled or duplicated session does not desync my whole program.
35. As an athlete, I want the deadlift to follow **its own rule** (1×5, 10 lb
    increments until it gets hard, then 5 lb) inside a program whose other four
    lifts are 5×5, because that is what StrongLifts is.
36. As an athlete, I want the weight to go up **if and only if I completed every
    rep of every set of that exercise** — the program's own success predicate,
    counted over working sets, warm-ups and abandoned sets excluded.
37. As an athlete, I want a failed session to **repeat** the weight, with no
    separate mode to select, because repeating is what happens when the
    predicate fails.
38. As an athlete, I want my squat to be able to be mid-stall while my bench is
    still adding weight, because progression state is per lift.
39. As an athlete who has missed the same exercise **three sessions running**, I
    want the weight cut ~10 % and the count reset, exactly as the program
    publishes it.
40. As an athlete whose squat just dropped 10 kg, I want to be **told, once, as
    a notice with a reason** — never as a silent number and never as an offer.
41. As an athlete on Starting Strength, I want a reset to _also shrink my
    increment_ (10 lb → 5 lb), because that is two things at once and the
    program says both.
42. As an athlete on GreySkull, I want a final AMRAP set of ≥10 reps to add
    **double** the usual increment, and I want the app to tell me that rule is
    reverse-engineered from secondary sources.
43. As an athlete on Madcow, I want a stall to hold the weight for a week, and a
    program-wide stall to **roll back to a past weight**, which requires the app
    to remember what I lifted weeks ago.
44. As an athlete on 5/3/1, I want fewer than 3 reps on the `+` set to
    **re-estimate my 1RM from that set** and reset my training max for the next
    cycle.
45. As an athlete, I want to configure my **increment, my stall cut and my
    progression frequency per exercise**, because those are the three settings
    the reference product exposes.
46. As an athlete, I want to be able to add 2.5 kg every **three** workouts
    instead of every workout, because the program supports it and my bench does
    not.
47. As an athlete, I want a program that has been paused for three months to
    resume exactly where it stopped, because no source in this family publishes
    a detraining rule and inventing one would be fiction.
48. As an athlete, I want the app never to claim a program has an end date or a
    graduation standard, because none of them publishes one — but I do want to
    see my own evidence (increments firing less often, cuts clustering) when it
    stops working.
49. As an athlete, I want to edit my working weight by hand at any point,
    because I know something the log does not.
50. As an athlete, I want to stop a program without losing the sets I logged
    under it.

### Running the session (Slice 5)

51. As an athlete arriving at the gym, I want to open today's session and see,
    per lift, exactly what to load — resolved at the moment I open it, not
    stamped weeks ago.
52. As an athlete, I want a **generated warm-up ramp** to the work weight,
    plate- aligned, with more sets for a heavier work weight, so that I stop
    doing the arithmetic myself.
53. As an athlete, I want **no rest between warm-up sets**, and a 3-minute timer
    before the last one — the reference product's own behaviour.
54. As an athlete, I want warm-ups excluded from records, hard-set counts and
    every aggregate, and included in the session's duration.
55. As an athlete, I want the **plates per side** shown under the weight input
    (`20 · 20 · 10 · 2.5`), muted, updating as I type.
56. As an athlete, I want to tell the app **which plates and bars my gym has**,
    so that the plate line is a fact about my gym and not a guess.
57. As an athlete whose gym has only two 20s per side, I want the calculator to
    solve within my actual inventory rather than descending greedily and
    failing.
58. As an athlete, I want my increment to be **independent of my plates** —
    owning 1 kg plates does not change my increment, and changing my increment
    does not check loadability — because that is the reference product's stated
    behaviour and it keeps two ideas from contaminating each other.
59. As an athlete using a dumbbell rack, I want the largest available dumbbell ≤
    my target, and an honest statement when nothing fits.
60. As an athlete on an assisted pull-up machine, I want the sign handled by the
    equipment and not by me, because more assist is _less_ work.
61. As an athlete, I want the rest timer to **auto-start when I complete a
    set**, because a timer I have to start is a timer I forget.
62. As an athlete, I want a **longer rest after a missed set than after a good
    one** (5 min vs 3 min), because rest is prescribed data and not a UI
    preference.
63. As an athlete, I want the timer to be a persistent bar that never blocks me
    from logging the next set.
64. As an athlete who locked their phone mid-session, I want the timer to be
    right when I unlock, because it is derived from a wall-clock deadline.
65. As an athlete, I want the app to record the rest I **actually took**, so
    that "your rest is creeping up" is knowable at all.
66. As an athlete, I want to add or remove 15 seconds with one tap.
67. As an athlete, I want every set persisted the moment I complete it, with no
    "save workout" button anywhere, because I already did the work.
68. As an athlete, I want one tap to complete a set at last time's values, and a
    per-exercise _"Fill from last time"_ that fills the inputs **and stops
    there** — it never submits for me.
69. As an athlete who did a sixth set nobody prescribed, I want it logged as a
    real set.
70. As an athlete who got 3 of 5, I want to type `3` and be done — no separate
    "failed" toggle, because the number already says it.
71. As an athlete who racked the bar with bad form, I want to mark it
    **abandoned** and have it dropped from every aggregate, including the
    program's success predicate.
72. As an athlete who did 10 left and 8 right, I want both numbers, because
    collapsing them to 9 is fabricated.
73. As an athlete, I want the whole session on **one scroll** — exercises
    stacked, sets as rows — never a wizard step per exercise and never a modal
    per set.
74. As an athlete, I want **no prose on this screen at all**; explanations live
    one tap behind the exercise name.
75. As an athlete, I want to explicitly finish the session, and see per lift
    whether I went up, repeated, or was cut — with the reason.
76. As an athlete, I want the session I just finished to stop showing as
    _scheduled_ on my calendar.

### The exercise database (Slice 6)

77. As an athlete, I want a picker with hundreds of real exercises, so that I do
    not hit _"my exercise isn't here"_ in week one.
78. As an athlete, I want to search by the name I actually use — "OHP",
    "military press" — and land on the canonical movement.
79. As an athlete, I want barbell bench and dumbbell bench to be the **same
    movement with separate histories**, so that my picker stays short and my
    progress stays honest.
80. As an athlete, I want to filter by movement pattern on a phone, because a
    flat list of 900 rows is unusable.
81. As an athlete, I want the app to know a movement is unilateral, so that it
    asks for the other side's reps only where that means something.
82. As an athlete, I want the app to know how a movement is loaded before I
    type, so that the input says `per hand` on a dumbbell press and `total` on a
    goblet squat.
83. As trainm8, I want `Exercise` to **assert** its authorship rather than infer
    it from a null owner, so that an athlete deleting their account cannot
    promote their custom exercise into the shared catalog for everybody.
84. As an athlete, I want my own custom exercises to keep working, with their
    history intact, through the rebuild.
85. As trainm8, I want the seeded corpus to be idempotent, keyed by stable ids,
    and re-runnable, like every other seed in this repo.

---

## Implementation Decisions

Ordered so each slice is demoable end-to-end. Slice 1 (`ExerciseSetLog` + the
grid) has shipped as ADR 0056 and is not restated.

### Decision 0 — the two open questions, decided

**(a) A Program is a first-class entity.** Not a Catalogue row, not a Plan
Outline segment.

- **A Catalogue row fails on cardinality and on ownership.** A Catalogue member
  is a `Workout` with `authorship: 'system'` and `ownerId: NULL`, read by every
  athlete — the exact reason ADR 0056 §2 refused to write performed reps onto
  `ExerciseSet`. A program carries **per-athlete mutable state** (working
  weight, stall count, cursor); putting it on a row owned by nobody writes one
  athlete's state into shared corpus content. Structurally, a Catalogue row is
  **one session**; a program is a sequence + a rule + state.
- **A Plan Outline segment fails on indexing.** ADR 0047's strength segment is
  keyed by `startWeekKey` and interpolates a weekly sets target from a season
  position. It is **calendar-indexed**; every program in this family is
  **outcome-indexed**. You cannot stamp twelve weeks of StrongLifts into the
  calendar, because week 6's weight is a function of week 5's log. A segment
  also has no per-lift slot and no failure counter.
- Therefore: a **Program Definition** (the rule, authored once, immutable,
  seeded) and a **Program Instance** (the athlete's run, with per-lift state and
  a cursor) are new entities. The instance **references Catalogue `Workout`
  rows** for its session shapes and generates sessions **lazily, one at a
  time**: the shape may be stamped ahead, the **load resolves when the session
  is opened**.
- **ADR 0047 gets a scope note, not a supersede.** It is correct for the season
  layer and does not reach the program layer. The two coexist: a Plan Outline
  may say "3 strength sessions a week"; the Program says what is on the bar.
  Where both exist, the Program owns the load and the Outline owns the
  frequency, and neither writes the other's number.

**(b) `SESSION_ARCHETYPES` does not grow a strength arm. Strength keeps its own
axis.** CONTEXT.md already states the position — _"Strength is deliberately
outside it: a strength session authors a **Strength Goal**, not an endurance
archetype"_ — and the sixteen values are endurance readings whose classifier
refuses without a Training Week as context. Growing the vocabulary would mean
touching a CHECK **and** ADR 0055's three-column foreign key into
`CatalogueEntry`, in order to add values whose reading is not computable from a
strength session at all. Instead: **`Workout` gains an authored `strengthGoal`
column** over the shipped `STRENGTH_GOALS` vocabulary, mutually exclusive with
`archetype` by CHECK (`discipline = 'strength'` ⟹ `archetype IS NULL`), so the
corpus stops filing heavy squat days as `neuromuscular` — _"the nearest honest
member and not a good fit"_, in its own header's words. This lands with Slice 6,
where the corpus is being touched anyway. _(ADR 0047's own Revisit note argues
the three goals cannot label 10 of 25 corpus sessions and proposes
`anatomical- adaptation` and `maintenance`. That is a separate amendment to ADR
0047 and is out of scope here; this spec uses the shipped three and inherits
whatever that amendment lands.)_

**(c) The `deload` collision is settled by naming.** ADR 0047 keeps `deload` for
the planned week. The per-lift response to repeated failure is a **Stall
Response**, with three members:

| Term                   | Meaning                                                           | Programs                                  |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| **Stall Cut**          | reduce this lift's working weight by a percent                    | StrongLifts, GreySkull, Starting Strength |
| **Weight Rollback**    | reset to a weight this lift actually used before                  | Madcow                                    |
| **Anchor Re-estimate** | re-derive the anchor from a logged set and reset the training max | 5/3/1, nSuns                              |

The counter is the **Stall Count**. `backoff` is already taken by `SET_ROLES`;
`deload` is already taken by ADR 0047; `reset` alone is ambiguous between two of
the three. These four terms go into CONTEXT.md's glossary **before** the
migration.

---

### Slice 2 — `ExerciseThreshold`: the prescription gets a referent

**Demo:** a Catalogue session prescribed `5 × 5 @ 85 % 1RM` and `4 × 10 @ 10RM`
renders resolved kilos for this athlete, from anchors the athlete entered on a
per-exercise thresholds screen; and the analysis screen proposes a 1RM from a
set they already logged, with its derivation, which they may accept or ignore.

**Schema — a new table, mirroring `ThresholdEvent`'s shape and not reusing it.**

```prisma
model ExerciseThreshold {
  id       String @id @default(cuid())
  construct String   // "oneRm" | "estimatedOneRm" | "repMax"
  valueKg   Float
  reps      Int?     // REQUIRED for repMax and estimatedOneRm; null for a tested oneRm
  protocol  String   // "tested" | "epley" | "brzycki" | "mayhew" | "wathen"
                     // | "rep-max-observed" | "athlete-stated" | "provider"
  confidence String? // "high" | "medium" | "low"; NULL where the athlete typed it
  effectiveAt DateTime @default(now())
  createdAt   DateTime @default(now())
  sourceSetLogId String?   // the set an estimate was read from; SET NULL
  exercise   Exercise       @relation(...)
  exerciseId String
  athleteProfile   AthleteProfile @relation(..., onDelete: Cascade)
  athleteProfileId String
  @@unique([athleteProfileId, exerciseId, construct, reps, effectiveAt])
  @@index([athleteProfileId, exerciseId])
}
```

CHECKs in the migration pin both vocabularies and enforce
`construct IN ('repMax','estimatedOneRm') ⟹ reps IS NOT NULL` and
`protocol = 'athlete-stated' ⟹ confidence IS NULL`. Append-only: an edit writes
a new row with a later `effectiveAt`; nothing is updated in place and nothing is
deleted. **The as-of-date resolver is written before the first row exists** —
ADR 0054's Consequences already log `ThresholdEvent.effectiveAt` as
written-and-never-read, and this table must not repeat it.

**The training max is a separate column, not a construct.** `ProgramLiftState`
(Slice 4) carries `trainingMaxKg` and a visible `workingFraction`. A 1RM
computed for a chart is a display artefact and may be recomputed freely; a
training max is **authored state** whose whole cycle is wrong if it is wrong.
They must not share a field, and the training max must not enter the record
machinery (ADR 0021's carve-out).

**New pure module: exercise-anchors.**

```ts
type AnchorConstruct = 'oneRm' | 'estimatedOneRm' | 'repMax'
type Anchor = { construct: AnchorConstruct; valueKg: number; reps: number | null
              ; protocol: EstimatorName | 'tested' | 'rep-max-observed' | 'athlete-stated'
              ; confidence: 'high' | 'medium' | 'low' | null; effectiveAtISO: string }

/** As-of resolution: the latest anchor of this construct effective on or before `asOf`. */
resolveAnchor(anchors: Anchor[], construct: AnchorConstruct, reps: number | null, asOfISO: string): Anchor | null

/** The one choke point. Returns kilos, or a stated refusal. */
resolveLoadTarget(target: LoadTarget, ctx: { anchors: Anchor[]; bodyweightKg: number | null; asOfISO: string })
  : { kind: 'resolved'; kg: number; basis: string }
  | { kind: 'unavailable'; reason: 'no-anchor' | 'no-bodyweight' | 'not-resolvable' }
```

Resolution rules, one per `LoadTarget` member:

- `absolute` — passthrough.
- `pct1RM` — needs a `oneRm` **or** `estimatedOneRm`; the basis phrase names
  which and, for an estimate, the formula and the rep count.
- `repMax` — needs a `repMax` anchor **at exactly those reps**. It does **not**
  fall back to converting a 1RM down, and it does **not** convert an observed
  8RM up to a 1RM and back. `@ 8RM` with only a 5RM on file is `no-anchor`, and
  that is the correct answer.
- `bodyweight ± addedKg` and `pctBodyweight` — need `AthleteProfile.weightKg`;
  `no-bodyweight` otherwise, with what would fix it.
- `velocity` — `not-resolvable`, permanently. Authorable, athlete-reported,
  never app-computed.

**`setLoadText` becomes resolution-aware.** It stays the single choke point for
prescription load text and gains an optional resolution context; with no context
it renders exactly as it does today (the Catalogue's portable form is
untouched). With context it renders `@ 85 % 1RM · 119 kg`. An unavailable
resolution renders the authored form plus the stated absence — never a
fabricated kilo. ADR 0027 is untouched: this is still a pure function of
structure plus the athlete's own stored numbers, and nothing is parsed.

**Estimation follows ADR 0054 exactly.** A new pure estimator module returns a
discriminated union of `estimate | refusal` — because _"we did not look"_ and
_"we looked and there is nothing"_ are different statements — each estimate
carrying a basis that can be **shown**: the set it read (load, reps, date, RIR
if present), the formula, and the population SD to render as a band.

- **Epley/Welday** (`RepWt × (1 + reps/30)`) is the default: near-unbiased at ≤
  10 reps (+0.5 ± 10.2 %) and what every other app uses, which matters to an
  athlete comparing numbers. **Mayhew, Wathen, Lombardi** are selectable.
  **Berger is not offered** (systematically −17 %, and precise enough to look
  stable). **Brzycki/Lander/Adams are gated to ≤ 10 reps like everything else**
  and are offered only for parity with other apps.
- **Hard gate at reps ≤ 10.** Above it, `reps-out-of-range` — a refusal, not a
  `low` grade. ADR 0054: _"a grade communicates uncertainty within a valid fit;
  it must not be asked to carry 'this is not a fit at all'."_
- Four refusals, closed vocabulary: `no-sets-logged`, `reps-out-of-range`,
  `effort-unknown`, `exercise-unmapped`.
- Confidence grades on **recency** and **reps** — the only two of ADR 0054's
  four terms that exist here. Maximality in strength is not a weak signal, it is
  an **absent** one: a set of 8 at RIR 4 and a set of 8 at RIR 0 are
  byte-identical in anything an app can collect. `high` = tested, or an observed
  `repMax` ≤ 5 reps within ~8 weeks; `medium` = ≤ 6 reps marked at or near
  failure; `low` = 7–10 reps, or athlete-stated (which stores `confidence: NULL`
  regardless).
- **Never the point estimate alone** — the band's width is the chosen equation's
  population SD, quoted from the research, not a decorative ±2 %.
- **A stale estimate freezes and is flagged, never decayed** (ADR 0054 §7). The
  strength twist is stated in the doc comment: Bosquet's decay curve measures
  **cessation**, and a stale anchor belongs to an athlete who is training and
  untested — the sign of the error is ambiguous, and 1×/week maintains strength,
  so a decay function would penalise the behaviour that preserves the quantity.

**Route contracts.** A per-exercise thresholds surface reachable from the
exercise history page and from settings: loader returns anchors + the current
resolved values; action is `intent`-dispatched with a local zod schema (the set
log's idiom, not Conform — `WorkoutAuthoringSchema` drops `load`). The
estimation surface is the shipped analyze screen with a different noun: **loader
has no transaction and no create**, one POST per accepted reading writes
anything at all, and **acceptance re-runs the estimation server-side rather than
trusting the posted value**. An athlete cannot accept a number the app never
produced.

---

### Slice 3 — Strength records and per-exercise history

**Demo:** an exercise page showing the athlete's squat over time, their best
single/triple/five, their heaviest-ever load and an estimated-1RM trend; and a
PR banner that fires the moment a record set is completed.

**No schema change.** Records are derived on read, like every other Personal
Record (ADR 0021 §1). There is no records table and no authoring path.

**`BenchmarkKind` grows three strength arms now, not later** — the set row _is_
the measurement, so unlike the pace/power ladder there is no stream tier to wait
for:

- `e1RM` — best estimated 1RM per session, per variant, formula named on the
  axis;
- `repMax(n)` — heaviest load at exactly _n_ reps, per variant;
- `heaviestLoad` — max effective load, any reps, per variant.

**Declined, not deferred:** session tonnage records, logging streaks, a single
strength score across exercises, an e1RM leaderboard across lifts, and a muscle
heatmap without a declared attribution rule.

**Qualification is one gate, already shipped.** Every strength aggregate routes
through `countsTowardWork` (`role === 'working' && outcome === 'completed'`).
Warm-ups and abandoned sets are excluded from records, from hard-set counts and
from the program's success predicate — one rule, one place.

**Effective load is read, never re-derived.** `effectiveKg` was baked at log
time with the bodyweight it used; re-deriving it from today's bodyweight would
rewrite a two-year-old weighted-dip record. A row whose `effectiveKg` is null
(stack level, band, unloaded, bodyweight with no bodyweight on file) is absent
from cross-exercise readings and **present in its own curve** — level 6 → 7 is
real, and the surface says so in one phrase.

**A first entry is not a record.** On a variant with fewer than ~3 prior
sessions the surface says _"first time!"_, which is both truer and nicer than
_"PR!"_.

**Detection runs on set completion**, in the same action that saves the set, and
returns the record alongside the save result so the banner is immediate.

**Per-exercise history generalizes the query that exists.** The shipped "last
session containing this exercise" query becomes a paged per-exercise history
over the existing `(exerciseId, completedAt)` index; it is not written twice. A
**presenter** maps it to the view model, following the cockpit's `build*`
pattern, so the chart components stay dumb and the mapping is unit-testable.

**Hard sets per muscle per week** ships with the attribution rule **visible**: a
synergist multiplier stated as a convention, not a measurement, in the surface
itself. Absent that, it is a coloured picture that looks like evidence.

---

### Slice 4 — The Program engine

**Demo:** the athlete starts StrongLifts 5×5, answers one number per lift, and
the app says _"Next: Workout A — Squat 5×5 @ 60 kg, Bench 5×5 @ 40 kg, Row 5×5 @
45 kg."_ They log it; on finishing they see _"Squat → 62.5 kg. Bench → 42.5 kg.
Row stays at 45 kg — you got 5,5,5,5,3."_

**Schema — three tables.**

`StrengthProgram` — the definition. Seeded, `authorship: 'system'`, with a
`variantId` axis (StrongLifts Basic/Plus/…; 5/3/1 vs 5s PRO). Carries the
program's day shapes as references to Catalogue `Workout` rows, its cursor kind,
and its **per-lift rule table**. The rule table is `LiftProgressionRule[]` and
lives on the program definition as authored, immutable data — but it is **keyed
by lift**, because StrongLifts' own deadlift breaks the program-level rule on
two axes at once (1×5 not 5×5, 10 lb not 5 lb). A program-level rule is provably
wrong on day one.

`ProgramInstance` — one per athlete per run. `programId`, `variantId`,
`startedOn`, `cursor` (JSON, a discriminated union), `status`
(`active | paused | ended`), and the athlete's per-exercise setting overrides.

`ProgramLiftState` — one row per lift per instance. **This is the seven pieces
of state the brief proves cannot be derived**, and the reason for the table:

```ts
type ProgramLiftState = {
	exerciseId: string
	equipment: string | null // the progression key is the PAIR (see Slice 6)
	currentWorkingWeightKg: number
	trainingMaxKg: number | null // percentage families only
	workingFraction: number | null // explicit and visible; never a silent multiplier
	stallCount: number // reset to 0 on any success
	currentIncrement: Increment // MUTABLE: Starting Strength shrinks it
	weightHistory: { sessionId: string; weightKg: number; succeeded: boolean }[]
	stallHistory: {
		sessionId: string
		fromKg: number
		toKg: number
		response: StallResponse['kind']
	}[]
}
```

`weightHistory` and `stallHistory` are JSON arrays on the row, not child tables:
they are read only with their parent, appended in the same transaction that
advances the state, and never queried across athletes. `stallHistory` is **not
needed to compute the next weight** — it exists to answer _"why did my squat
drop 10 kg?"_ honestly, which is the Load Recompute Notice pattern one level
down.

**The rule vocabulary** — closed `as const` unions, the repo's idiom, and each
member exists because collapsing it loses a program:

```ts
type ProgressionTrigger =
	| { kind: 'perSession'; everyNSessions: number } // StrongLifts, configurable
	| { kind: 'perWeek' } // Madcow, Texas Method, nSuns
	| { kind: 'perCycle'; weeksPerCycle: number } // 5/3/1

type SuccessPredicate =
	| { kind: 'allRepsAllSets' } // StrongLifts: 25 of 25
	| { kind: 'allRepsOnTopSet' } // Madcow, Texas Method
	| { kind: 'minRepsOnAmrapSet'; minReps: number } // GreySkull, 5/3/1, nSuns

type Increment = // four irreducible load bases
	| { kind: 'absolute'; deltaKg: number }
	| { kind: 'pctOfLastTopSet'; pct: number } // Madcow +2.5 %
	| { kind: 'byAmrapReps'; table: { minReps: number; deltaKg: number }[] } // nSuns
	| {
			kind: 'multipliedOnAmrap'
			baseDeltaKg: number
			atOrAboveReps: number
			factor: number
	  } // GreySkull

type StallResponse = // three structural remedies
	| { kind: 'stallCut'; pct: number } // needs the current weight
	| { kind: 'weightRollback'; sessionsBack: number } // needs weightHistory
	| {
			kind: 'anchorReEstimate'
			estimator: EstimatorName
			trainingMaxPct: number
	  } // needs Slice 2

type IncrementAdjustmentOnStall =
	| { kind: 'unchanged' }
	| { kind: 'halve' }
	| { kind: 'stepDown'; toDeltaKg: number }

type ProgramCursor = // STORED, never counted
	| { kind: 'alternatingDays'; nextDayId: 'A' | 'B' }
	| { kind: 'weekInCycle'; weekIndex: number; weeksPerCycle: number }
	| { kind: 'weeklyRoles'; nextRole: 'volume' | 'recovery' | 'intensity' }
```

**Deliberately absent:** a `volumeLadder` field (the 5×5 → 3×5 → 1×5 ladder is
**not** StrongLifts' published rule and must never be seeded as one), any model
of assistance work (no program publishes a progression rule for it), and a
single shared `deloadPct` (it launders three operations into one).

**Where a session's set weights come from.** One number per lift per session is
authored; the rest is a function — Madcow's ramp, its 1×8 back-off _"the weight
from the 3rd set"_, Texas Method's Wednesday at ~80 % of Monday, and the warm-up
generator are all derivations:

```ts
type SetWeightSource =
	| { kind: 'workingWeight' }
	| { kind: 'pctOfTrainingMax'; pct: number }
	| { kind: 'pctOfRepMax'; reps: number; pct: number }
	| { kind: 'pctOfTopSet'; pct: number }
	| { kind: 'sameAsSet'; setIndex: number }
	| { kind: 'pctOfAnotherDay'; dayId: string; pct: number }
```

Alongside the rounded weight the app keeps the **unrounded intent**: the program
says 70 % of 102.5 = 71.75 kg and the bar makes 72.5 kg. Storing only the
rounded number loses the intent and makes the next percentage compound the
rounding error.

**The state machine, on session completion, per lift, in this order:**

1. Evaluate the success predicate over `countsTowardWork`-qualified sets only.
2. On success → `stallCount = 0`; apply the increment **if the trigger fires**
   (per session / every _N_ sessions / per week / per cycle).
3. On failure → `stallCount += 1`; if `stallCount >= stallsBeforeResponse`,
   apply the **Stall Response** and the **increment adjustment**, then reset the
   count. Otherwise the weight simply repeats — there is no separate "repeat"
   mode, because repeating is what the predicate failing means.
4. Advance the **cursor**.
5. Append to `weightHistory`, and to `stallHistory` if a response fired.
6. Emit the **outcome**, per lift, with its reason.

**The failure predicate is the app's, not the article's.** The two published
counters differ — the failure article counts _repeats of the same weight_, the
app counts _consecutive sessions where all sets were not completed_. Take the
app's: it is mechanical, and it is the one that survives an out-of-order log.

**The engine is a pure module**, mirroring the `plan-generation` trio
(deterministic engine / generator / server seam) and its stated purity contract:
reads no clock (`now` is an argument), no random source, mutates nothing, cannot
query. Its shape:

```ts
nextSession(instance: ProgramInstanceState, definition: ProgramDefinition, nowISO: string)
  : { dayId: string; lifts: { exerciseId; equipment; sets: ResolvedSet[] }[] }

applySession(instance: ProgramInstanceState, definition: ProgramDefinition,
             logged: LoggedSet[], sessionId: string)
  : { next: ProgramInstanceState; outcomes: LiftOutcome[] }

type LiftOutcome =
  | { kind: 'incremented'; fromKg: number; toKg: number; reason: string }
  | { kind: 'repeated'; weightKg: number; stallCount: number; reason: string }
  | { kind: 'stalled'; response: StallResponse['kind']; fromKg: number; toKg: number; reason: string }
```

The server half assembles the input, writes the new state and the outcomes in
one transaction, and **says what happened once, as a notice, never as an
offer**. An engine that silently drops the squat 10 % and shows the new number
is exactly the failure mode the Load Recompute Notice pattern exists to prevent.

**Programs seeded in this slice** — the absolute-increment family, which runs on
nothing but the last weight lifted and needs no anchor: **StrongLifts 5×5**
(including its deadlift exception, its ABA·BAB two-week cycle, its flat 5 lb /
2.5 kg app default, its 3-stalls → −10 % rule scoped to the exercise, and its 20
kg / 30–40 kg starts), **Starting Strength** (reset −10 %, press −8–10 %, _and_
shrink the increment), **GreySkull LP** (`2×5 + 1×5+`, the AMRAP is the rule;
the ≥10-reps double increment ships **labelled as reverse-engineered from
secondary sources**). Every published number is quoted; nothing is "improved".

**The percentage families (5/3/1, nSuns, Madcow, Texas Method) are a later
slice** and depend on Slice 2's estimator and training max. `SetWeightSource`,
`StallResponse` and `Increment` ship complete so that arrival is data, not a
migration. nSuns' table publishes **ranges** on two of four rows and is
therefore not deterministic as published: the seed picks the low end of each
range and says so on the surface. 5/3/1's fourth deload week is
**edition-dependent** and the surface reports the disagreement rather than
picking.

**`stallsBeforeResponse` is 3 for StrongLifts and 1 for GreySkull and 5/3/1** —
the response is immediate in those two.

**Program state ignores the calendar entirely.** A program paused for three
months resumes exactly where it stopped. Whether it _should_ is a physiological
question no source in the family answers, so no detraining rule is invented.

---

### Slice 5 — The session runner

**Demo:** tap "Start workout" on today's strength session and run the whole
thing one-thumbed: warm-up ramp, plate line, tap-to-complete rows, timer bar,
finish, and "here's what you lift next time".

**Schema.** One new entity, the **Plate Inventory**: a per-athlete gym profile
carrying bar weights (20 kg Olympic, 15 kg women's bar, a trap bar…), a bounded
plate list (`{ weightKg, count }[]`), and an optional fixed-dumbbell list.
Without it the plate calculator is a lie about what the gym owns, which is why
ADR 0056 recorded it as not built. `ExerciseSetLog` gains **nothing**; the
session runner writes through the shipped save path.

**The screen is one scroll.** Exercises stacked, sets as rows, the shipped
three-controls-per-row rule (load, reps, ✓) with everything else — RIR, the
other side of a unilateral set, to-failure, abandoned — behind the row's own
control. **No prose on the logging surface at all**; explanations live one tap
behind the exercise name. ADR 0028 was necessary and demonstrably insufficient:
#434 shipped a 4,283-line screen with 24 explanatory prose spans and the verdict
was _"too much text, the flow and design is too hard to follow."_

**Screen states**, as a state machine rather than a wizard — all of it on one
scroll, the "state" being what the athlete's attention is on:

```
pre-session ──open──▶ warm-up ──▶ working sets ⇄ rest ──finish──▶ outcome
     │                                    ▲   │
     └─ cursor resolved, loads resolved   └───┘  (rest never blocks logging)
```

**Warm-up generation.** A plate-aligned ramp from the empty bar to the work
weight, set count scaling with the **work weight** and not with the lifter. The
published rule is a 45 lb jump cap; the vendor's own worked example violates it
on two of four jumps, so the implemented mechanism is the plate-aligned ramp and
**the cap is not claimed in copy**. Generated warm-up rows are written with
`role: 'warmup'`, which is what keeps them out of every aggregate. Unlike the
reference product, the ramp is editable — a deliberate departure, stated.

**Plate math — the maths is trivial and the model is not.** A pure module:

- **`multiplier`** — plates are consumed `multiplier` at a time; a barbell is 2,
  a single-horn machine is 1. This is also why the smallest achievable increment
  is `2 × smallestPlate` on a bar.
- **Bounded inventory, not greedy** — a bounded knapsack with pruning over
  **integer-scaled** values. Greedy descent fails at 140 kg with only two 20s a
  side, and 2.5 kg plates plus a 0.5 kg microplate are exactly what breaks float
  accumulation.
- **`isFixed`** — a dumbbell rack is "largest available ≤ target", falling back
  to the smallest, and says so honestly rather than emitting an unloadable
  number.
- **`isAssisting`** — the sign is a property of the equipment, not of the
  number.
- **`useBodyweightForBar`** — a bodyweight-loaded movement's "bar" is the
  athlete's bodyweight, so the plate calculator becomes an added-load calculator
  with no second code path.
- **`round(w)` is defined as `calculatePlates(w).totalWeight`** — rounding is
  the plate solver run backwards, which is what makes a percentage-derived load
  always a loadable load.
- **Loadability and progression are independent**, verbatim from the reference
  product: _"If your increments are set to 5lb, then the weight will increase by
  5lb regardless of your plate setup."_ The engine emits the arithmetic next
  weight; loadability is displayed separately.

On the phone the calculator is a **passive annotation, not a screen**: under the
weight input, `20 · 20 · 10 · 2.5` per side, muted, updating as you type.

**The rest timer becomes outcome-aware.** Rest is the third thing the state
machine writes, alongside load and rep target: 3 min after a set that met its
target, 5 min after one that did not, none between warm-up sets, 3 min before
the last warm-up set. Rest is **prescribed data, not a UI preference** —
per-exercise durations with a session default. It stays a wall-clock deadline
(backgrounding is safe), stays a persistent bar that never blocks logging,
auto-starts on set completion, adjusts ±15 s in one tap, and records the rest
**actually taken** in the shipped `restTakenSec`. It still does not survive a
closed tab; the honest fix is a scheduled local notification and it is **not
built**, stated as an absence.

**Persistence.** Every set persists as it is completed. There is no "save
workout" button anywhere — the athlete already did the work, and a lost session
is a much worse failure than a bad import.

**Session completion, and the `status` reconciliation.** ADR 0056 deliberately
made the Summary Count read logged working sets rather than `status`, and left
`WorkoutSession.status` saying `scheduled` on a fully logged session as a stated
consequence. **In scope, and resolved by direction rather than by a second
source of truth:** finishing the session is an **explicit athlete act** in the
runner that writes `status: 'completed'` — an act, not an inference — and
**every strength aggregate continues to read logged working sets, never
`status`**. The column is calendar and list state; the sets are the truth. The
two therefore cannot disagree about anything that matters, and neither is
derived from the other.

**Post-session outcome.** Per lift: incremented / repeated / stalled, each with
its reason in the lift's own numbers, and — for a **Stall Cut** — the Load
Recompute Notice shape: one-time, explained, never an offer.

---

### Slice 6 — The exercise database

**Demo:** the picker has hundreds of real exercises, searchable by alias,
filterable by movement pattern; a dumbbell bench press and a barbell bench press
are one movement with two variants and two histories; and the load input says
`per hand` where that is what the number means.

**Dataset: `free-exercise-db`, 873 rows, Unlicense.** Recommended over wger (850
rows, CC-BY-SA 4.0 **per row**) on the licence, not the content. Share-alike
reaches the derived corpus, and this repo has a **community publish tier** where
athlete-authored rows are published and attributed — a share-alike obligation
propagating into that corpus is a legal question the product does not want and
does not need. The Unlicense is public-domain dedication with no downstream
obligation. wger's **structure** is mined and its rows are not: the
translations/aliases split, the variation-group idea, and the
anatomical-vs-display muscle distinction. FIT's 53-member `exerciseCategory`
supplies the movement-pattern vocabulary. **Adoption is a seed, not a
dependency** — no open dataset carries movement pattern, laterality or load
semantics, so all three are authored here regardless, and vendoring a snapshot
beats taking a runtime dependency on anybody. Practical picker range: 300–900
curated rows. Below ~200 the athlete hits _"my exercise isn't here"_ in week
one; above ~1,500 without a movement-pattern filter the picker is unusable at
390 px.

**Identity: canonical exercise + equipment discriminator, with variation groups
for discovery and aliases for recall.** Four production models were compared;
this is the one that keeps the picker short, the histories separate and
substitution possible.

```ts
type Exercise = {
	id
	name // canonical, equipment-free: "Bench Press"
	movementPattern: MovementPattern
	primaryMuscles
	secondaryMuscles
	unilateral: boolean
	variationGroupId: string | null // DISCOVERY ONLY, never identity
	authorship: 'system' | 'athlete' // ASSERTED — fixes #469
}
type ExerciseVariant = {
	id
	exerciseId
	equipment: EquipmentId
	angle: 'flat' | 'incline' | 'decline' | null
	load: LoadSemantics // the reason this entity exists
	displayName: string // "Incline Bench Press (Dumbbell)"
}
type LoadSemantics = {
	kind: LoadValue['kind'] // which member of the shipped union this movement takes
	barKg: number | null // 20 Olympic, 15 women's bar
	perSideMultiplier: 1 | 2
	inventoryProfileId: string | null // which Plate Inventory applies
}
type ExerciseAlias = { exerciseId; variantId: string | null; text; locale }
```

**The rule that keeps this honest: history rows reference the variant, never the
bare exercise.** Aggregating up to the movement is a choice a chart makes;
merging down is impossible if you got it wrong, and dumbbell and barbell bench
genuinely progress independently. **An alias must never be a second identity** —
the moment an alias can be logged against, there are two histories for one
movement.

**#469 is fixed here, as its own PR.** `Exercise` gains asserted `authorship` on
`Workout`'s worked precedent (#448): the migration enforces the **implication**
`authorship = 'system' ⟹ createdByAthleteId IS NULL` and not the biconditional,
so an orphaned athlete-authored row stays expressible and is no longer served to
everybody as trainm8-authored. The rebuild is verified the way #448 was: row
counts plus a byte-identical hash over carried columns. The catalogue read query
is corrected to read asserted authorship, with a test proving an orphaned
athlete-authored entry is not served as stock.

**Migration is additive and the old column stays readable through one release.**
Existing `ExerciseSetLog` rows keep pointing at their `Exercise`; a default
variant is created per existing exercise from its current `equipment` string so
no history is orphaned. **Nobody's numbers move**, so no Load Recompute Notice
is owed — and the migration says so in its opening comment, as every migration
in this repo does.

**`perSide` enters the picker** the moment load semantics exist, which is the
condition ADR 0056 stated. The progression key becomes a real
**`(exerciseId, equipment)`** pair rather than the nullable string Slice 4
defaults from.

`Workout.strengthGoal` lands here too (Decision 0b), and the strength corpus
stops filing heavy squat days under an endurance archetype.

---

### Cross-cutting decisions

- **Every new rule module is pure**, under the repo's stated contract: reads no
  clock (`now` is an argument), no random source, mutates nothing, cannot query.
  Every server module queries and writes and **decides nothing** — the split the
  shipped strength-log pair already states in its header.
- **No new write path goes through the Conform-backed authoring schema.** Its
  round trip silently drops `load`, `effortCap` and `tempo`, and `load` is the
  one field these features exist to record. Per-row, no-navigation writes use
  the set log's idiom: `useFetcher` plus a local zod schema over
  `Object.fromEntries(formData)`, `intent`-dispatched, result as a tagged union.
- **Every vocabulary ships as an `as const` tuple plus a CHECK in the
  migration.** No Prisma enums, no triggers. Cross-table invariants carry the
  parent's discriminator and use a composite foreign key.
- **Every magic number is named in a constants module with its citation
  inline**, and every number quoted from a primary source keeps its provenance
  next to it — including the ones flagged as convention, folklore or unverified.
- **Glossary first.** **Stall Response**, **Stall Cut**, **Weight Rollback**,
  **Anchor Re-estimate**, **Stall Count**, **Program**, **Program Instance**,
  **Exercise Threshold**, **Plate Inventory**, **Load Semantics**, **Exercise
  Variant** go into CONTEXT.md before the first migration, each with its _Avoid_
  list.
- **One ADR per slice**, in the house format, and each states plainly whether
  any stored number moves.

---

## Testing Decisions

**What makes a good test here:** it states a rule in its name and asserts
external behaviour only.
`'logging is an upsert, so the between-sets double-tap cannot log a set twice'`
and `'a stack level and a band have no honest kilo, and none is invented'` are
the shipped precedents, and reviewers in this repo treat the sentence-style name
as a hard convention. A test that asserts an internal call happened, or that
reaches into engine state between steps, is not one of these tests.

**Four seams, in descending preference. Prefer the highest; the fewer the
better.**

### Seam 1 — the pure domain modules (the highest seam that still has no IO)

This is where nearly all of the behaviour lives, and it is an **existing** seam:
`app/utils/strength-log.ts` already takes arrays in and returns decisions out,
with zero imports beyond zod, and `app/utils/strength-log.test.ts` (15 tests) is
the prior art. Four modules join it under the same contract:

| Module             | Seam function                                           | Rules it must prove                                                                                                                                                              |
| ------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| exercise anchors   | `resolveLoadTarget(target, ctx)`                        | `@ 8RM` with only a 5RM on file refuses; `pct1RM` names its basis; bodyweight kinds refuse without a bodyweight                                                                  |
| 1RM estimation     | `estimateOneRm(input) : estimate \| refusal`            | the ≤ 10-rep gate refuses rather than grading `low`; four distinct refusals; the band is the equation's SD                                                                       |
| the program engine | `applySession(state, definition, logged, sessionId)`    | 25 of 25 increments; 24 of 25 repeats; the third consecutive miss cuts and resets the count; the deadlift's own rule; the cursor advances on a skipped session without desyncing |
| plates + warm-up   | `calculatePlates(kg, inventory)` / `warmupRamp(workKg)` | a bounded inventory beats greedy descent; `round(w) === calculatePlates(w).totalWeight`; an assisted machine's sign; a rack that cannot make the number says so                  |

Prior art for the shape of a pure engine tested at this seam:
`app/utils/plan-generation/deterministic.ts` + `generate.server.test.ts`,
`app/utils/plan-outline/derive.ts`, `app/utils/load/session-nudge.ts`,
`app/utils/personal-records.ts`, and `app/utils/profile-analysis/estimate.ts`
(whose `estimate | refusal` union is the exact shape Slice 2 copies).

**The engine's determinism is what makes this seam sufficient.** `now` is an
argument, nothing is random, nothing queries — so a whole StrongLifts run can be
tested as a fold: feed six sessions of logged sets, assert the working weights
and the outcomes at the end. That single test covers the cursor, the predicate,
the increment, the stall count and the cut, and it needs no database.

### Seam 2 — the server modules, against real SQLite

Prior art: `app/utils/strength-log.server.test.ts` (10 tests) and the repo's
`tests/setup/db-setup.ts`, which copies a base SQLite file per vitest pool —
**server tests hit a real database and Prisma is never mocked**. This seam gets
only what the pure seam structurally cannot cover:

- ownership scoping (a program instance, an anchor and a set log are all
  reachable only by their athlete);
- the append-only guarantee on `ExerciseThreshold` and the **as-of-date**
  resolver reading the right row for a past date;
- the acceptance path **re-running the estimation server-side** — the test posts
  a value the engine would not produce and asserts nothing is written;
- transactional state advance: `applySession`'s result and the appended history
  land together or not at all;
- the `Exercise` rebuild: row counts and a byte-identical hash over carried
  columns, plus the #469 regression (an orphaned athlete-authored row is **not**
  served as stock).

### Seam 3 — route tests via `createRoutesStub` + Testing Library

Prior art: `app/routes/training/sessions.$sessionId_.log.route.test.tsx` (12
tests), which imports the default-export component, stubs the route, and asserts
on the submitted form data. Reserved for the surface rules that are genuinely
about the surface, because they are the ones that regressed in #434:

- the Set Ghost is **text and the input stays empty**; "Fill from last time"
  fills and does not submit;
- the rest bar never blocks logging the next set;
- an unresolved `@ 85 % 1RM` renders the authored form plus its stated absence,
  never a number;
- a proposal screen writes nothing on load;
- a Stall Cut renders as a notice with a reason, and offers nothing.

### Seam 4 — Playwright e2e

**Declined for these slices.** The e2e suite here is thin, and everything a
strength e2e would assert is covered by seams 1–3 at a fraction of the cost. The
one thing it could genuinely add — that a half-logged session survives a lock, a
background and a rotation — is not reliably testable in this harness, and is
stated as an absence rather than approximated by a test that passes for the
wrong reason.

### The presenter seam, where a surface gets complicated

`app/routes/_home/cockpit/presenter.ts` + `presenter.test.ts` is the repo's
pattern for pure `build*` functions mapping loader data onto view models so
components stay dumb. The per-exercise history/records surface and the runner's
outcome panel each get one, tested at seam 1 rather than seam 3.

### What is not tested, deliberately

The published numbers themselves. A test asserting that StrongLifts' increment
is 2.5 kg is a test of the seed, and the seed is data with a citation beside it.
What **is** tested is that the engine applies whatever the definition says —
including a deadlift whose rule differs from its program's on two axes.

---

## Out of Scope

**Refused, not deferred** — building any of these is a regression:

1. **Velocity-based training, or any app-computed bar velocity.** An LVP-derived
   1RM carries SEE ≈ 9.8 % with a systematic ≈ +3.7 % overestimate — worse than
   the rep-based estimators — and phone cameras and wrist IMUs are not validated
   instruments. **Narrow exception:** `LoadTarget`'s velocity arm and the
   `velocityLoss` termination stay authorable and athlete-reported; a coach with
   a GymAware may write `5 × 3 @ 0.9–1.1 m/s` and the app renders it faithfully.
2. **Session tonnage records and logging streaks.** Tonnage rewards junk volume
   and inverts the portability thesis; a streak measures app-opening.
3. **A kg value for a band or a machine stack level.** No conversion exists.
4. **A single strength score across exercises, or an e1RM leaderboard across
   lifts.**
5. **A `failed: Boolean` column.**
6. **The 5×5 → 3×5 → 1×5 ladder as StrongLifts' rule** — unverified in every
   official source.
7. **A detraining or decay rule** on paused program state or a stale anchor.
8. **A population-bias correction applied to a logged RIR.**
9. **A single shared `deloadPct` field.**
10. **Any deload percentage or cadence presented as physiology.** The
    circulating numbers are a survey of practice and a Delphi consensus; the two
    controlled trials found no benefit and one found a strength cost.
11. **A derived duration or strength standard for when a program stops
    working.**
12. **Seeding a program with adjusted numbers under its published name.**
13. **Progressing assistance work by an invented rule.**
14. **Extending the Token Sentence to the log surface.**
15. **Writing performed reps onto `ExerciseSet`.**
16. **Deriving the stall count from the session log at read time.**
17. **Expressing a program as a Plan Outline segment or a Catalogue row.**
18. **A "1RM" field serving both the chart and the training max.**

**Deferred, with a stated reason:**

19. **`segments[]` on `ExerciseSetLog`** — drop sets, myo-reps, clusters and
    rest-pause stay **unloggable** rather than being logged wrongly as three
    separate sets. They differ only in intra-set rest and whether the load
    descends: one column, not four kinds. ADR 0056 deferred this and this spec
    does not un-defer it.
20. **A `SetGroup` container** for supersets, circuits and EMOM. No container
    exists on the prescription side either, so their rest belongs to the last
    set. Stated as an absence.
21. **Import/export.** FIT's `set` message is the only cross-vendor format and
    it cannot represent assisted load, warm-up vs working, RIR, unilateral
    splits, bands, stack levels, supersets or rest taken. Strong's and Hevy's
    CSVs carry no exercise identity beyond a display string. When it ships, the
    rule is: the app's own lossless JSON is the **archival** export, a
    Strong-shaped CSV is the **interoperability** export, and the UI names which
    is which.
22. **Recomputing a strength session's load from its logged sets.** A completed
    strength session's TSS is still sRPE at `confidence: 'low'`. Changing it
    rewrites stored numbers and therefore owes a **Load Recompute Notice**; it
    is entangled with #463 and is its own slice.
23. **The percentage-based program families** (5/3/1, nSuns, Madcow, Texas
    Method). The vocabulary ships complete in Slice 4 so their arrival is seed
    data, not a migration, but they need Slice 2's estimator and training max
    and are a seventh slice.
24. **Bodyweight history.** `AthleteProfile.weightKg` is a single current value.
    `effectiveKg` is baked at log time with the bodyweight it used, which is
    what makes this survivable; a proper history table is a separate concern.
25. **ADR 0047's own Revisit** (two more Strength Goals: anatomical adaptation
    and maintenance). This spec uses the shipped three.
26. **A scheduled local notification for the rest timer.** The honest fix for a
    timer that does not survive a closed tab, and not built.
27. **A muscle-group heatmap.** Vanity dressed as analysis unless the
    attribution rule is stated; hard-sets-per-muscle ships with the rule visible
    instead.

**Debts on the path, and their disposition:**

| Debt                                                             | In scope?                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **#469** — `Exercise` serves an orphaned athlete row as stock    | **In**, Slice 6, as its own PR on #448's precedent                             |
| **`Exercise`'s six columns**                                     | **In**, Slice 6 — the whole slice                                              |
| **`WorkoutSession.status` says `scheduled` on a logged session** | **In**, Slice 5 — an explicit finish act writes it; aggregates still read sets |
| **`perSide` in the union, out of the picker**                    | **In**, Slice 6, when Load Semantics exist                                     |
| **Strength TSS still sRPE `low`**                                | **Out** — owes a Load Recompute Notice, entangled with #463                    |
| **Four unloggable set shapes; no superset container**            | **Out** — stated absences, per ADR 0056                                        |
| **`imports.upload` tests fail on `main`**                        | **Out** — pre-existing and environment-dependent                               |

---

## Further Notes

**On the ordering.** The build order is the research's, with one adjustment. The
program engine (Slice 4) wants the `(exerciseId, equipment)` progression key
that the exercise database (Slice 6) creates. Rather than reorder — the database
is the biggest slice and the least demoable on its own — `ProgramLiftState`
carries `equipment` from day one, defaulted from the nullable
`Exercise.equipment` string that exists today. Slice 6 turns that string into a
real referent without changing the key's shape. This is the one place where a
later slice sharpens an earlier one's data instead of the reverse, and it is
deliberate.

**On what makes this the product rather than the engine.** Map #434's verdict
was that the app has a great deal of machinery and gives an athlete almost
nothing out of the box. The test for these slices is a single sentence: **a new
athlete picks StrongLifts 5×5, answers five numbers, and is told what to put on
the bar — forever, without reading a paragraph.** Slices 4 and 5 are the ones
that satisfy it. Slices 2, 3 and 6 are what stop it from being a lie six weeks
in.

**On the numbers.** Every published figure in the seeded programs is quoted from
a primary source and carries its citation. Several are flagged in the research
as convention, folklore or unverified — the ≥10-rep double increment in
GreySkull, the 45 lb warm-up jump cap that the vendor's own example violates,
5/3/1's edition-dependent deload week, nSuns' two published ranges. Each of
those ships **with its flag visible**, because the alternative is the app
quietly asserting something nobody published. Equally: "three fails then cut 10
%" has **no trial of any kind**, the training max has **no evidence base**, and
neither may be presented as physiology. They ship as **product conventions
documented as such**.

**On the one collision that needs the owner's eye.** The session library's
maximal-strength phase prescribes ≥ 85 % 1RM, and 85 % of a 90 % training max is
**76.5 % of the true 1RM** — below the band where `%1RM` is portable at all.
Either the working fraction applies and the Strength Goal bands are restated
against the training max, **or** the bands are true-1RM percentages and the
fraction must not silently apply to them. Both are defensible; doing both at
once is not. This spec keeps the fraction **explicit, visible and stored
separately from the anchor**, which makes the collision visible rather than
resolving it — and it is the one modelling question in this document that a
later slice must close before the percentage families ship.

**On RIR.** It is the anchor that needs no profile and the anchor a beginner is
worst at reporting: pooled underprediction ≈ 0.9 reps, SEM 2.6–3.4 reps, and
coaching experience has a negligible effect on the judgement. A logged `RIR 2`
is on average nearer RIR 3 and could be RIR 5, which biases any derived 1RM
**downward**. The app surfaces the caveat and applies no correction — a
correction constant applied to somebody's self-report is a number about this
athlete that nobody measured.

**On the novice path, which inverts the cardio build order.** `@ 8RM` is a
complete instruction **today**, needs no stored anchor, and is self-calibrating
by definition. `@ 85 % 1RM` needs a 1RM the athlete does not have. So `repMax`
resolution ships **first** inside Slice 2 — it is free, and it is the
out-of-the- box path. That is the single most important recommendation the
anchors research made, and it is easy to invert by habit.
