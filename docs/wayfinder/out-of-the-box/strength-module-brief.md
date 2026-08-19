# Design brief: the full StrongLifts-style strength module

**Audience.** The agent implementing the strength module. This document is your
**only source**. It is a compression of four documents you should not need to
re-read:

- `docs/research/strength-program-stronglifts-and-kin.md` — the seven programs,
  as specifications
- `docs/research/strength-tracker-surfaces.md` — the logging surface, the set
  model, load semantics, PRs, interchange
- `docs/research/strength-anchors-and-progression.md` — 1RM/repMax/RIR/training
  max, the formulas and their error bars
- ADR 0056 (strength actual is logged in-app; a kilo is not a kilo), ADR 0054 (a
  threshold may be proposed from the athlete's own history), ADR 0047 (strength
  progresses by anchor and ramp)

Every number below is quoted from a primary source or is explicitly flagged as
convention, folklore, or unverified. **Do not "improve" a published number.** A
seeded "StrongLifts 5×5" that quietly uses 2 kg increments because they seemed
more sensible is not StrongLifts.

---

## 0. The three-sentence summary

1. **A program is a function of the log, not of the calendar.** ADR 0047 makes a
   strength plan calendar-indexed (week 7 → 18 sets). All seven programs studied
   are outcome-indexed (next weight = f(last logged session)). These are
   orthogonal objects; ADR 0047 gets a **scope note**, not a supersede.
2. **The progression rule and its state live on the lift, never on the
   program.** StrongLifts' own deadlift breaks the program-level rule on two
   axes at once (1×5 not 5×5, 10 lb not 5 lb).
3. **`weightKg: Float` is wrong on five equipment classes**, and the derived
   kilo is allowed to refuse (ADR 0056 §3, ADR 0008).

---

# A. The programs, exactly

## A.1 StrongLifts 5×5 — the reference implementation

All figures from stronglifts.com and support.stronglifts.com, retrieved
2026-08-13.

### A.1.1 Composition

| Workout       | Exercises                                         |
| ------------- | ------------------------------------------------- |
| **Workout A** | Squat 5×5 · Bench Press 5×5 · Barbell Row 5×5     |
| **Workout B** | Squat 5×5 · Overhead Press 5×5 · **Deadlift 1×5** |

Five lifts. The squat is in both workouts → trained 3×/wk. **Three sessions a
week, A and B alternating → the pattern is ABA · BAB and the true cycle is two
weeks / six sessions**, not one week. Quote: _"Most Stronglifters train Monday,
Wednesday and Friday."_

**Consequence you must implement:** the engine cannot store "which weekday" and
recover state. It must store **which of A/B is next** (the cursor, §C.4).

### A.1.2 The deadlift exception

The deadlift is the only lift prescribed `1×5` — _"one heavy set of 5 reps after
you warm up"_. It also has its own increment: it _"can progress by 10lb. Once
this becomes hard, switch to 5lb increments."_ So the deadlift differs from the
squat on **two axes simultaneously**. This is the single reason a per-lift rule
table is the only correct shape.

### A.1.3 Starting weights

| Lift                          | Official starting weight                   |
| ----------------------------- | ------------------------------------------ |
| Squat, Bench, Overhead Press  | "empty bar" — **45 lb / 20 kg**            |
| Barbell Row, Deadlift         | **65–95 lb / 30–40 kg**                    |
| Experienced lifters, any lift | "a weight that you could lift for 10 reps" |

Note: the empty-bar start is a **fixed absolute weight**, not a percentage of
anything — which is exactly why the program needs no 1RM. The experienced-lifter
rule is a `10RM` reference — i.e. the `repMax` member of the shipped
`LoadTarget` union, which resolves against nothing today (§D).

### A.1.4 The increment — the sources disagree, report all three

| Source            | Squat / Deadlift                  | Bench / Press / Row        |
| ----------------- | --------------------------------- | -------------------------- |
| Quick start guide | 5–10 lb / 2.5–5 kg                | 2.5–5 lb / 1.25–2.5 kg     |
| Progress page     | "5lb or less"; DL 10 lb then 5 lb | 5 lb men; OHP 2.5 lb women |
| **App defaults**  | **5 lb per workout**              | **5 lb per workout**       |

The app's default is **a flat 5 lb for everything**: _"if you did 5x5 200lb
Squats last workout, and you didn't miss any reps, then the weight will increase
to 205lb."_ The smaller press increment is described as **a setting the lifter
changes**, not a default. "Add 2.5 lb to the overhead press" is **advice, not
the app's behaviour** — do not seed it as a default.

**A third axis:** progression is **frequency-configurable** — _"add 2.5lb every
three workouts instead"_ is supported. The engine cannot hard-code "every
session"; see `ProgressionTrigger.everyNSessions`.

### A.1.5 Success predicate and the failure rule

Success predicate: **all reps on all sets of that exercise.** Verbatim: _"Add
weight if you completed five reps on all sets of this exercise."_ Otherwise the
weight is repeated (there is no separate "same weight next time" mode —
repeating is the automatic consequence of the predicate failing).

Failure is defined by **rep shortfall**, not bar speed or form: _"you attempt to
lift the weight for five reps. But you can't do more than one, two, three or
four reps."_

Deload trigger — **both sources agree on 3 consecutive failed sessions → −10
%**, scoped **to the exercise**:

| Source                  | Trigger                                                                             | Cut                               |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| Failure article         | "What if you repeat the weight three times but still fail? Stop trying and deload." | "Reduce the weight by about 10%." |
| App progression setting | "if you fail to complete all sets on an exercise for three sessions in a row"       | "the weight will decrease by 10%" |

⚠ **The two counters are not the same predicate.** The failure article counts
_repeats of the same weight_; the app counts _consecutive sessions where all
sets were not completed_. For a program that repeats the weight after any
failure they coincide, but you must pick one. **Pick the app's** — it is the
mechanical one, and it is the one that survives an out-of-order log.

### A.1.6 Rest and warm-up (official values)

| Element                     | Official value                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Between work sets           | "Rest about 3min between your five sets of five reps."                                                                          |
| — if the set felt easy      | 1–2 min                                                                                                                         |
| — normal                    | 3 min                                                                                                                           |
| — hard                      | 5 min                                                                                                                           |
| Between warm-up sets        | "There is no rest time between the warm up sets"                                                                                |
| Before the last warm-up set | timer "rings at 3min by default"                                                                                                |
| Warm-up structure           | "two sets of five reps with the empty bar. Then... several heavier warm up sets of five reps until you reach your work weight." |

### A.1.7 Exit conditions — the program says it ends, and never says when

Verbatim: _"You can't add 5lb on the bar 2-3x/week forever. It's
unsustainable."_ The plateau article gives **no duration, no strength standard,
and no 3×5/1×5 ladder**. Its prescribed sequence:

1. Reduce squat frequency 3×/wk → 2×/wk.
2. Add lift variations (pause squats and similar).
3. Raise bench volume to 3×/wk with variations.
4. Move to **StrongLifts 5×5 Intermediate**.

Madcow 5×5 exists in the same product but as a **separate program**, not as a
successor.

### A.1.8 ⚠ The 5×5 → 3×5 → 1×5 ladder is NOT the program's rule

The single most-repeated StrongLifts rule in secondary write-ups appears in
**none** of: the failure article, the plateau article, the app's progression
settings. `web.archive.org` was unreachable, so it could not be checked against
an older edition. **Status: unverified. Do not implement it as StrongLifts'
rule.** If a `volumeLadder` field ever exists it must be an athlete-authored
option, never a seeded default.

## A.2 The app's mechanics (distinct from the program)

These are the parts of the StrongLifts app the owner actually asked for.

### A.2.1 Warm-up generation

Official rule: _"The Stronglifts Warmup Calculator prevents this issue by not
giving jumps in weight larger than 45lb on the warmup sets."_

Official worked example: _"say you have to Squat 225lb for 5x5. The warmup
calculator will show you 5x45, 5x45, 5x95, 5x135, 5x185lb and then 5x5 225lb."_

⚠ **The 45 lb cap is violated by the vendor's own example on two of four jumps**
(45→95 = 50, 135→185 = 50). The mechanism is therefore **not** a pure cap; it is
more likely a plate-aligned ramp (45 → 95 → 135 → 185 = one 25 then successive
45 lb plate pairs). **The cap is official; the plate-aligned mechanism is an
inference and is not published.** Implement the plate-aligned ramp; do not claim
the cap in copy.

Two further published properties: **set count scales with the work weight**, not
with the lifter (_"a 315lb Squatter more warmup sets than a 95lb Squatter"_;
_"not determined by your sex"_), and the output is **fixed** — _"It's not
possible to edit the warmup sets or weights."_ (You may choose to allow editing;
just know the reference product does not.)

### A.2.2 The rest timer is outcome-aware

| Timer            | Default | Vendor's stated rationale                                                                                    |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| Timer Success    | 3 min   | —                                                                                                            |
| Timer Failure    | 5 min   | "gives your energy stores more time to fully recover. It makes it less likely to fail again on the next set" |
| Warm-up sets     | none    | "because the weights are light"                                                                              |
| Last warm-up set | 3 min   | rest before the hardest warm-up set                                                                          |

It also supports **overlapping notifications** (one at 1m30, one at 3min) —
"rest is adequate" then "rest is complete".

**This is the most interesting design in the family: rest is a function of the
previous set's outcome, not a constant.** Rest is therefore a third thing the
state machine writes, alongside load and rep target.

⚠ Do not repeat the vendor's uncited rationale ("~85 % of energy refilled after
1m30, ~90 % after 3 min, 95 % after 5 min"). Directionally the phosphocreatine
curve; the three-point table is unsourced.

### A.2.3 Plate calculator — loadability and progression are independent

Configuration is a **per-plate inventory** (_"Enter the weight of the plate and
how many you have"_) plus an adjustable bar weight. The consequence, verbatim:

> _"If your increments are set to 5lb, then the weight will increase by 5lb
> regardless of your plate setup."_

**Copy this.** The engine emits the **arithmetic** next weight; loadability is
displayed separately. Owning 1 lb plates does not change the increment; changing
the increment does not check loadability.

### A.2.4 What is configurable per exercise

Three settings, exposed per exercise: **increment amount**, **deload amount**,
**frequency**. Increment and deload are both applied automatically.

### A.2.5 What the app ships, and what it derives

Programs: StrongLifts 5×5 in Basic/Plus/Lite/Mini/Ultra/Ultra Max, StrongLifts
5×5 Intermediate, Madcow 5×5 in Classic/Alternate Lifts/Pause Lifts/Deadlift
Focus. **No 5/3/1, nSuns, Texas Method, Starting Strength or PPL.**

Charts: weight lifted, **estimated 1RM**, volume, reps, consistency, PRs. Note
the dependency direction and copy it: **the app derives a 1RM for display while
the program needs no 1RM at all** (§C.6).

## A.3 The other six programs, on the axes that matter

| Program                | Main-lift scheme                                 | Progression trigger                | Load basis                                           | Training max?            | AMRAP?                          | Failure / deload rule                                                        | Cycle length                     |
| ---------------------- | ------------------------------------------------ | ---------------------------------- | ---------------------------------------------------- | ------------------------ | ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| **StrongLifts 5×5**    | 5×5; deadlift 1×5                                | **Per session**, all-reps-all-sets | Absolute kg on last weight                           | No                       | No                              | Repeat weight; 3 consecutive fails → **−10 %**                               | 2 weeks (ABA·BAB)                |
| **Starting Strength**  | 3×5; deadlift 1×5; power clean 5×3 (phase 2)     | **Per session**                    | Absolute kg on last weight                           | No                       | No                              | **Reset −10 %** (press −8–10 %) **and reduce the increment**                 | 2 weeks (A/B, presses alternate) |
| **GreySkull LP**       | 2×5 + **1×5+**                                   | **Per session**, on the AMRAP set  | Absolute kg on last weight                           | No                       | **Yes — it is the rule**        | <5 reps on the final set → **−10 %** on that lift                            | 2 weeks (3 days, lifts rotate)   |
| **Madcow 5×5**         | Ramped 5×5 Mon; 4×5 Wed; 4×5 + **1×3** + 1×8 Fri | **Per week**                       | **+2.5 % of Monday's top set**; ramp derived from it | No — a **5RM** to seed   | No (a heavy triple)             | Hold the weight next week; if most lifts stall, **reset several weeks back** | 1 week, open-ended               |
| **Texas Method**       | Volume 5×5 Mon; light 2×5 Wed; **1×5 PR** Fri    | **Per week**, on Friday's 5RM      | % of 5RM (≈90 % Mon, ≈80 % of Mon on Wed)            | No — a **5RM**           | No                              | Miss the Friday 5RM → repeat or reduce; resets are per-lift                  | 1 week                           |
| **5/3/1**              | 3 sets/wk: `5/5/5+`, `3/3/3+`, `5/3/1+`          | **Per 3-week cycle**               | **% of training max**                                | **Yes — 85–90 % of 1RM** | **Yes — the `+` set**           | <3 reps on the `+` set → **re-estimate 1RM from it, reset the TM**           | 3 weeks (4 with legacy deload)   |
| **nSuns 5/3/1 LP**     | 9 sets on the main lift incl. a **`1+`**         | **Per week**, from AMRAP reps      | **% of training max**                                | **Yes**                  | **Yes — drives a lookup table** | Below minimum reps → reduce the TM next cycle                                | 1 week; 4/5/6-day variants       |
| **PPL (Metallicadpa)** | 5×5, last set an AMRAP-style `5+`                | **Per session**                    | Absolute kg on last weight                           | No (1RM only to seed)    | Yes, as the trigger             | Reset on failure ⚠ (percentage **unverified**)                               | 1 week (6 days)                  |

### A.3.1 Program-specific detail worth implementing

**Starting Strength.** Phase 1: Squat 3×5, Bench **or** Overhead Press 3×5
(alternating between sessions), Deadlift 1×5, 3×/wk, ~1–3 weeks. Phase 2 adds
the **power clean 5×3** and moves the deadlift off every session. The failure
remedy is a **reset**, and it does **two things at once**: cut ~10 % (press 8–10
%) **and reduce the increment going forward** — _"if you've been going up 10 lbs
you start going up 5 lbs"_. **Starting Strength's increment is mutable per-lift
state**, not a constant. This is why `IncrementAdjustmentOnFailure` exists.

**GreySkull LP.** 3 sessions/wk, main lifts **2×5 then a final `5+`** taken to
as many reps as possible. Hit ≥5 → add weight (**2.5 lb upper, 5 lb lower**);
fall short → reset that lift **≈10 %**. The commonly cited **double-increment
rule** — AMRAP reaches **≥10 reps → add twice the usual increment** — is what
makes GreySkull structurally different: the increment is **a function of the
logged rep count**. ⚠ The 10-rep threshold is **secondary-only** (the primary is
a paid e-book); treat as reverse-engineered and label it.

**Madcow 5×5** — the hardest of the seven and the best stress test. Verbatim
rules from the author's own (mirrored) page:

| Day       | Prescription                                                  |
| --------- | ------------------------------------------------------------- |
| Monday    | Squat 5×5 · Bench 5×5 · Barbell Row 5×5 — ramped to a top set |
| Wednesday | Squat 4×5 · Incline or Military Press 4×5 · Deadlift 4×5      |
| Friday    | Squat · Bench · Row, each **4×5, 1×3, 1×8**                   |

- _"weekly increases of 2.5% of your top set of 5 on Monday"_ — a **percentage
  of the lifter's own last top set**. A fourth load basis, distinct from both
  absolute-delta and %-of-training-max.
- Ramp: _"Jumps can be somewhere between 10-15% per set based on your top set"_,
  worked example 60/70/80/90/100 for a 100 lb top set. StrongLifts' rendering
  calls this a "12.5% set interval". **Ramp weights are derived; the only
  authored number is the top set.**
- Seeding: _"your 1 rep maxes or more ideally your real 5 rep max in each
  lift"_.
- **Friday's top triple becomes the following Monday's top set of five** — a
  cross-day forward carry no per-lift "current weight" scalar can hold alone.
- Friday's final set of 8 _"uses the weight from the 3rd set"_ — a back-off set
  computed from a position in **this session's own ramp**.
- Failure: _"If you miss reps, keep the weight constant the next week."_ Only
  when the _"majority of lifts are stalling"_ do you _"reset several weeks back
  and rebuild"_ — a **reset to a past weight**, at **program** scope.
- Length: the published 9-week table is illustrative — _"this is not a 9 week
  program"_; run it "until it stops working."

**Texas Method.** Monday volume 5×5 at ~90 % of the current 5RM; Wednesday
recovery (squat 2×5 at ~80 % of Monday's weight, alternate press 3×5); Friday
intensity, **a single set of 5 at a new 5-rep PR**. The weekly rule is _beat
last week's Friday 5RM_ and Monday follows from it. Two unique requirements: **a
week has named roles** (volume/recovery/intensity) whose loads compute from one
another, and **the anchor is a measured performance**, not an estimate.

**5/3/1.** The cleanest spec, and the reference implementation of a training
max.

- TM = **85 % or 90 %** of actual-or-estimated 1RM. **Every prescribed weight is
  a percentage of the TM, never of the 1RM.**

  | Week | Sets                                |
  | ---- | ----------------------------------- |
  | 1    | 5 @ 65 % · 5 @ 75 % · **5+ @ 85 %** |
  | 2    | 3 @ 70 % · 3 @ 80 % · **3+ @ 90 %** |
  | 3    | 5 @ 75 % · 3 @ 85 % · **1+ @ 95 %** |

- Per cycle: **press and bench +5 lb, squat and deadlift +10 lb** on the TM.
- Failure: _"If you get fewer than 3 reps, use that number to estimate your 1
  Rep Max, and reset your TM based on that for your next cycle."_ → the engine
  needs a **1RM estimator**.
- ⚠ The **fourth deload week (40/50/60 % × 5/5/5)** is **edition-dependent**.
  thefitness.wiki: _"Past iterations of 5/3/1 involved a deload week every 4th
  week... it is outdated and no longer used."_ Every online calculator still
  shows it. **Report the disagreement; do not pick.**
- **5s PRO** removes the `+` set (all main sets fixed at 5). That proves **AMRAP
  is a per-template toggle**, not a property of the program.

**nSuns 5/3/1 LP.** Weekly cycle, 9 sets on the main lift including a `1+`.
Progression table verbatim:

> _"0-1 reps: increase TM by 0 pounds / 2-3 reps: increase TM by 5 pounds / 4-5
> reps: increase TM by 5 to 10 pounds / 6+ reps: increase TM by 10 to 15
> pounds"_

Four variants: 4-day, 5-day, 6-day squat-focus, 6-day deadlift-focus. ⚠ **Two of
the four rows publish a range**, so the rule is **not deterministic as
published**. Any implementation must either pick a point in the range and say
so, or ask. The nine-set percentage table was **not obtained** — do not invent
it.

**PPL.** Six days (2 push / 2 pull / 2 legs), compounds `5×5` with the last set
for extra reps, ~2.5 kg upper / ~5 kg lower, session-to-session linear. A 1RM is
used only to **seed** the spreadsheet. ⚠ Its failure rule **could not be
verified at all**. Do not ship a number for it.

### A.3.2 The axes — read down the columns, not across

- **Trigger:** per session (4) · per week (2) · per 3-week cycle (1).
- **Load basis (four irreducible kinds):** absolute increment on the last weight
  (4) · % of a training max (2) · % of a measured 5RM (1) · % of the lifter's
  own last top set (Madcow, 1).
- **Anchor required:** none (4) · training max (2) · measured rep max (2,
  overlapping).
- **AMRAP:** required and load-bearing (3) · absent (4) · **toggled by
  template** (5/3/1's 5s PRO) — so it is a property of the **variant**, never
  the program.
- **Failure remedy (three structural kinds):** percentage cut (4) · reset to a
  past weight (1) · re-estimate the anchor (2).
- **Failure scope:** per lift (6) · per program (Madcow's majority-stalling
  rule, 1).
- **Increment mutability:** constant (5) · reduced after a reset (Starting
  Strength) · doubled on a high AMRAP (GreySkull) · table-driven (nSuns).

**Seven programs, seven distinct positions. There is no smaller expressible
set.**

---

# B. The state machine of running a session

This is the product. Everything else is scaffolding around a person tapping a
phone with one thumb, twenty seconds after a heavy set, heart rate 150, glasses
fogged. **Every design call resolves in favour of fewer taps and less reading.**

## B.1 Screen states

1. **Pre-session / "Start Workout".** Shows which day is next (A or B, week-in-
   cycle, or the weekly role) resolved from the **cursor**, and the resolved
   working weight per lift. The load resolves **at the moment the session is
   opened** — it is unknowable in advance (§C.1).
2. **Warm-up (per exercise).** Generated ramp (§A.2.1). **No rest between
   warm-up sets** except a 3 min timer before the last one. Warm-ups are
   excluded from tonnage, from PR detection, and from "hard sets per week";
   included in session duration.
3. **Working sets (per exercise).** A grid: one row per set. Exercises stacked
   on **one scroll** — never a wizard step per exercise, never a modal per set.
4. **Rest.** A persistent bar, always visible, **never blocking** logging the
   next set. Auto-started on set completion.
5. **Session complete.** Nothing needs an explicit "save" — see B.7.
6. **Post-session outcome.** Per-lift: incremented / repeated / deloaded, with
   the reason stated (§C.5, the Load Recompute Notice shape).

## B.2 The row: prescribed and performed side by side

Both production models that got this right (liftosaur `ISet`, wger `WorkoutLog`)
store target and actual in **the same conceptual row** — `reps`/`completedReps`,
`weight_target`/`weight`, `rir`/`rir_target`, `rest`/`rest_target`.

⚠ **ADR 0056 §2 deliberately departs from that recommendation for this repo, and
you must follow the ADR.** `ExerciseSetLog` is a **separate entity**, because
here `Workout` is 1:N with `WorkoutSession` and a **Catalogue** row is a
`Workout` with `authorship: 'system'`, `ownerId: NULL`, read by every athlete.
Writing performed reps onto `ExerciseSet` would write one athlete's performance
into shared corpus content. **The join is the price of the Catalogue.**

- Key: **`(sessionId, stepId, orderIndex)`** — the occurrence, the exercise
  slot, the position in the set list. A save from the grid is therefore an
  **upsert**: the between-sets double-tap is the most likely interaction on the
  surface and **must not log a set twice**.
- **`exerciseSetId` is nullable on purpose** — an athlete who felt good and did
  a sixth set has a real set with no prescribed row to answer. `SET NULL` keeps
  that set when a later edit deletes the row it pointed at.
- Keep `originalWeight` beside the rounded `weight`: the program says 70 % of
  102.5 = 71.75 kg, the bar makes 72.5 kg. **Storing only the rounded number
  loses the intent and makes the next percentage compound the rounding error.**
- **`completedRepsLeft` is not a nicety.** A unilateral set that got 10 left and
  8 right is _one set_ with two rep counts; collapsing to "9" is fabricated.

## B.3 The Set Ghost (ADR 0056 §5) — four rules, each a bug avoided

Each row shows, in lighter text, what the athlete did **on this exercise** last
time (`100 kg × 8`).

- **Not the last calendar session** — the last session containing this exercise.
  Otherwise a push/pull/legs split shows the wrong ghost two days in three.
- **Matched positionally** within the exercise (set 3's ghost is last time's set
  3), never by nearest weight — positional matching is what makes a ramp
  (60/80/100) show the right ghost per row.
- **An extra row borrows the last ghost, flagged.** An empty ghost on set 5 of 5
  reads as "new territory" when it only means "you did four last time".
- **It is text, and the input stays empty.** The observed failure mode across
  several apps is athletes logging the ghost by accident and never noticing.
  Filling it is an explicit tap.
- **Warm-ups and abandoned sets are dropped from the previous session before
  matching**, so adding a warm-up does not shift every working row's ghost by
  one.

**"Same as last time" is the single highest-value control on the screen.** Three
scopes: per set (tap the ghost), **per exercise (the one that gets used)**, and
— with more care — per session. The per-exercise _"Fill from last time"_ fills
the inputs **and stops there** — it never submits on the athlete's behalf.

## B.4 Set-cell tap semantics and the control budget

**ADR 0056 §4's rule: the two-thumb path is three controls per row — load, reps,
✓.** Reps in reserve, the other side of a unilateral set, to-failure and
abandoned all sit **behind the row's own control**. Asking for everything on
every set is how a logger becomes a chore.

| Good                                                                | Bad                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| One tap completes a set at the ghost values                         | A modal per set                                               |
| Numeric inputs open a numeric keypad and select-on-focus            | A generic text field the athlete must clear first             |
| The complete-set target is ≥44 pt and near the bottom of the screen | Anything requiring a reach to the top bar mid-session         |
| Rest timer is a persistent bar, always visible, never blocking      | A full-screen timer you dismiss to log the next set           |
| Explanations live behind the exercise name, one tap away            | A paragraph next to the control (**this is the #434 defect**) |
| Survives lock / background / rotation with no state loss            | Anything that loses a half-logged session                     |
| Everything on one scroll: exercises stacked, sets as rows           | A wizard step per exercise                                    |

**No prose on the logging surface at all.** ADR 0028 (mobile-first) was
necessary and demonstrably insufficient — #434 shipped a 4,283-line screen with
24 explanatory prose spans and the verdict was _"too much text, the flow and
design is too hard to follow."_

## B.5 Failure / partial-rep entry — three meanings, one column (ADR 0056 §6)

- **Missed the target** — prescribed 5, got 3. **Derived** from
  `reps < prescribedReps`. A `failed` boolean beside a rep count is redundant
  state that can disagree with the number it describes. **Do not add it.**
- **Went to failure on purpose** — an AMRAP or to-failure set that succeeded.
  This is a **plan**, not a miss → `toFailure` modifier.
- **Abandoned** — racked it, form broke. Not a rep count at all →
  `outcome: 'abandoned'`, dropped from **every** aggregate.

`role` is the one flag that **is** stored rather than inferred, because a
warm-up changes what the row means to every downstream number. **Three values,
not wger's nine** — `dropSegment` and `myoMini` are **segments of one set**, not
sets, and admitting them as roles would let a drop set count as three hard sets.

Program-state machines (deload after N failures) care about the **first** sense
only.

## B.6 The rest timer, in order of how much it matters

1. **Auto-start on set completion.** A timer you have to start is a timer you
   forget. This is why "complete set" is one tap, not two.
2. **Per-exercise durations with a session default.** Reference defaults:
   liftosaur `timers.workout = 180 s`, separate `timers.warmup`, per-set
   override. StrongLifts: 3 min success / 5 min failure / none on warm-ups / 3
   min before the last warm-up (§A.2.2). **Rest is prescribed data, not a UI
   preference.**
3. **Wall-clock, not `setInterval`.** Derive remaining time from a stored
   deadline so backgrounding is safe. ADR 0056 records that the timer **does not
   survive a closed tab**, and that the honest fix is a scheduled local
   notification — **not built**, and stated as an absence.
4. **Overflow, not truncation.** Record the rest **actually taken**
   (`restTakenSec`) — more honest than the prescription, and the only way "your
   rest is creeping up" is ever knowable.
5. Adjust ±15/30 s with one tap; audible/haptic at zero; **never blocks
   logging**.

## B.7 Persistence and completion

- **Persist every set as it is completed, never on a "save workout" button.**
  This is ADR 0049 generalized: the athlete already did the work, and the
  failure mode (a lost session) is much worse than a bad import.
- ADR 0056: **nothing marks the session completed.** The Summary Count reads
  logged working sets rather than `status`, deliberately — a session whose sets
  are logged _is_ done, and a second source of truth could disagree with the
  sets. ⚠ Known consequence: `WorkoutSession.status` still says `scheduled` on a
  fully logged strength session. **The two need reconciling** — flag it, don't
  paper over it.

## B.8 Plate math and the warm-up calculator

The maths is trivial; the model is not. Reference implementation
(`liftosaur/src/models/weight.ts`), with the five details a naive version gets
wrong:

```ts
const equipmentData = getEquipmentDataForExerciseType(settings, exerciseType)
if (equipmentData.isFixed) {
	// dumbbells / fixed machines: largest available ≤ target, else the smallest
	const weight =
		fixed.find((w) => lte(w, absAllWeight)) ?? fixed[fixed.length - 1]
	return { plates: [], totalWeight: roundTo005(weight) }
}
const barWeight =
	equipmentData.useBodyweightForBar && settings.currentBodyweight
		? settings.currentBodyweight
		: equipmentData.bar[units]
const multiplier = equipmentData.multiplier || 1 // 2 for a barbell: plates come in pairs
const isAssisting = equipmentData.isAssisting || false // assisted machines SUBTRACT
const weight = roundTo000005(subtract(absAllWeight, barWeight))
const plates = calculatePlatesInternalFast(
	weight,
	availablePlates,
	multiplier,
	isAssisting,
)
```

- **`multiplier`** — plates are consumed `multiplier` at a time,
  `maxUnits = floor(p.num / multiplier)`. A barbell is 2; a loadable machine
  with one horn is 1. **This is also why the smallest achievable increment is
  `2 × smallestPlate` on a bar and `1 × smallestPlate` on a horn.**
- **Bounded inventory, not greedy.** `plates: {weight, num}[]` is what this gym
  owns. Greedy descent fails at 140 kg with only two 20s per side. Use a bounded
  knapsack with pruning over **integer-scaled** values
  (`Math.round(v * precision)`) — 2.5 kg plates plus a 0.5 kg microplate are
  exactly what breaks float accumulation.
- **`isFixed`** — a dumbbell rack is "largest available ≤ target", falling back
  to the smallest. An honest failure, not an unloadable number.
- **`isAssisting`** — the assisted pull-up/dip machine, where more "weight" is
  _less_ work. **The sign is a property of the equipment, not of the number.**
- **`useBodyweightForBar`** — for a bodyweight-loaded movement the "bar" is the
  athlete's current bodyweight, so the plate calculator becomes an added-load
  calculator with no second code path.

**`round(w)` is defined as `calculatePlates(w).totalWeight`** — i.e. rounding is
the plate solver run backwards. That factoring means a percentage-derived load
is always a loadable load.

**On the phone the calculator is a passive annotation, not a screen**: under the
weight input, `20 · 20 · 10 · 2.5` per side, muted, updating as you type. ADR
0056 records the plate calculator as **not built** — it needs a per-athlete
plate inventory to be anything but a lie about what the gym owns.

## B.9 What happens next session

On session completion, per lift, in this order:

1. Evaluate the **success predicate** against the logged sets (warm-ups and
   abandoned sets excluded).
2. On success → `consecutiveFailures = 0`; apply the **increment** if the
   trigger fires (per session / every N sessions / per week / per cycle).
3. On failure → `consecutiveFailures += 1`; if
   `consecutiveFailures >= failuresBeforeRemedy`, apply the **remedy** and the
   **increment adjustment**, then reset the counter.
4. Advance the **cursor** (A→B, week-in-cycle, weekly role).
5. Append to `weightHistory` and, if a remedy fired, `deloadHistory`.
6. **Say what happened, once, as a notice.** Never as an offer. An engine that
   silently drops the squat 10 % and shows the new number is precisely the
   failure mode the **Load Recompute Notice** pattern exists to prevent.

---

# C. The data model conclusions

## C.1 A program is a third object, not a Workout and not a Plan Outline

| Object           | Answers                            | Depends on                                   | In this repo             |
| ---------------- | ---------------------------------- | -------------------------------------------- | ------------------------ |
| **Workout**      | _What is this session?_            | Nothing outside itself                       | Shipped                  |
| **Plan Outline** | _What should this week look like?_ | Calendar position + authored anchor and ramp | Shipped (ADR 0044, 0047) |
| **Program**      | _What do I lift **today**?_        | **The outcome of the last session**          | **Absent — build this**  |

Three consequences:

1. **A program generates sessions lazily, one at a time.** You cannot stamp
   twelve weeks of StrongLifts into the calendar: week 6's weight is unknowable
   in week 1. A program stamps only the **shape** ahead; the **load resolves
   when the session is opened.** (ADR 0053 is confirmed and extended: these
   programs are _fully_ deterministic and need no model at any point — but
   determinism and eager generation are **separable properties**.)
2. **State is per lift, not per program.** The squat can be mid-deload while the
   bench is still adding weight.
3. **The engine reads the log.** A program that does not consume completed-set
   data is a printed sheet.

## C.2 The eight things the engine must express

1. **Per-lift independent progression state**, keyed
   `(program instance, exercise)` — never the program. Six of seven scope
   failure to the lift, and Madcow needs the per-lift states anyway to evaluate
   "the majority are stalling".
2. **A trigger granularity that is not the calendar** — per completed session,
   per completed cycle, or per _N_ successful sessions. **Never "week 7".**
3. **Four load bases as a closed union.** Absolute delta; % of a stored training
   max; % of a measured rep max; % of the athlete's own previous top set.
   Collapsing any two loses a program.
4. **Fixed-rep and outcome-terminated sets side by side in one session**, with
   the outcome of the terminated set feeding the rule. 5/3/1 week 1 is literally
   `5, 5, 5+`.
5. **Fail-counting as persisted state**, with a documented reset condition (any
   success). Without it, "three sessions in a row" is unimplementable.
6. **Three failure remedies, not one.** A cut needs only the current weight; a
   **reset to a past weight** needs a **weight history**; an **anchor
   re-estimation** needs a **1RM estimator applied to a logged AMRAP set**. A
   single `deloadPct: number` expresses one of three.
7. **Cycle position as explicit state.** Derivable from a session count only if
   no session is ever skipped, reordered or back-filled — which is exactly what
   real logs do.
8. **Derived set weights within a session.** Madcow's ramp, its 1×8 back-off
   ("the weight from the 3rd set"), Texas Method's Wednesday (≈80 % of
   Monday's), and the warm-up generator all compute one set's weight from
   another's. **One number per lift per session is authored; the rest is a
   function.**

## C.3 The type sketch (repo idiom: closed `as const` vocabularies, discriminated unions on `kind`, units in names)

```ts
/* ───────────────  The rule: authored once, then immutable  ─────────────── */

export type ProgressionTrigger =
	| { kind: 'perSession'; everyNSessions: number } // StrongLifts' configurable frequency
	| { kind: 'perWeek' } // Madcow, Texas Method, nSuns
	| { kind: 'perCycle'; weeksPerCycle: number } // 5/3/1

export type SuccessPredicate =
	| { kind: 'allRepsAllSets' } // StrongLifts (25 of 25)
	| { kind: 'allRepsOnTopSet' } // Madcow, Texas Method
	| { kind: 'minRepsOnAmrapSet'; minReps: number } // GreySkull, 5/3/1, nSuns

/** The four bases are irreducible. */
export type Increment =
	| { kind: 'absolute'; deltaKg: number }
	| { kind: 'pctOfLastTopSet'; pct: number } // Madcow: +2.5 %
	| { kind: 'byAmrapReps'; table: { minReps: number; deltaKg: number }[] } // nSuns
	| {
			kind: 'multipliedOnAmrap'
			baseDeltaKg: number
			atOrAboveReps: number
			factor: number
	  } // GreySkull

/** Three structurally different remedies with three different dependencies. */
export type FailureRemedy =
	| { kind: 'cutPct'; pct: number } // needs current weight
	| { kind: 'resetToPastWeight'; sessionsBack: number } // needs weightHistory
	| {
			kind: 'reEstimateAnchor'
			estimator: EstimatorName
			trainingMaxPct: number
	  } // needs an estimator

/** Starting Strength: a reset also shrinks the increment, permanently. */
export type IncrementAdjustmentOnFailure =
	| { kind: 'unchanged' }
	| { kind: 'halve' }
	| { kind: 'stepDown'; toDeltaKg: number }

export type LiftProgressionRule = {
	exerciseId: string
	trigger: ProgressionTrigger
	success: SuccessPredicate
	increment: Increment
	/** StrongLifts: 3. GreySkull and 5/3/1: 1 — the remedy is immediate. */
	failuresBeforeRemedy: number
	remedy: FailureRemedy
	onRemedy: IncrementAdjustmentOnFailure
	/** NOTE: a `volumeLadder` field would live here. Deliberately absent — §A.1.8. */
}

/* ─────────────  Where a session's weights come from (derived)  ───────────── */

export type SetWeightSource =
	| { kind: 'workingWeight' }
	| { kind: 'pctOfTrainingMax'; pct: number } // 5/3/1, nSuns
	| { kind: 'pctOfRepMax'; reps: number; pct: number } // Texas Method
	| { kind: 'pctOfTopSet'; pct: number } // Madcow's ramp
	| { kind: 'sameAsSet'; setIndex: number } // Madcow's 1×8 "weight from the 3rd set"
	| { kind: 'pctOfAnotherDay'; dayId: string; pct: number } // Texas Method's Wednesday

export type ProgrammedSet = {
	termination: ExerciseSetKind // shipped: 'reps'|'timed'|'amrap'|'toRir'|'velocityLoss'
	reps?: number
	weight: SetWeightSource
	restAfterSuccessSec?: number // §A.2.2 — rest is outcome-aware
	restAfterFailureSec?: number
}

/* ───────────────  The state: persisted, one row per lift  ─────────────── */

export type LiftProgressionState = {
	exerciseId: string
	equipment: EquipmentId // §C.7 — the key is the PAIR
	currentWorkingWeightKg: number
	trainingMaxKg?: number // percentage families only
	consecutiveFailures: number // reset to 0 on any success
	weightHistory: { sessionId: string; weightKg: number; succeeded: boolean }[]
	currentIncrement: Increment // mutable: Starting Strength shrinks it
	deloadHistory: {
		sessionId: string
		fromKg: number
		toKg: number
		reason: FailureRemedy['kind']
	}[]
}

/** Stored, never counted. */
export type ProgramCursor =
	| { kind: 'alternatingDays'; nextDayId: 'A' | 'B' }
	| { kind: 'weekInCycle'; weekIndex: number; weeksPerCycle: number }
	| { kind: 'weeklyRoles'; nextRole: 'volume' | 'recovery' | 'intensity' }

export type ProgramInstance = {
	programId: string
	variantId?: string
	startedOn: string
	cursor: ProgramCursor
	lifts: LiftProgressionState[]
}
```

Two things the sketch deliberately does **not** do:

- **It does not model assistance work.** Every program has an accessory layer
  and **none progresses it by a published rule**; modelling it would be
  inventing one.
- **It does not put the load-basis choice on the program.** It is on the
  **lift** — StrongLifts' deadlift and Starting Strength's press already prove a
  program-level rule wrong on day one.

## C.4 The seven pieces of state, and why none is derivable

| #   | State                         | Scope       | Needed by                                    | Why it cannot be derived                                                                             |
| --- | ----------------------------- | ----------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | **Current working weight**    | Per lift    | All absolute-increment programs              | The accumulation of every past success and failure. Recomputable only by replaying the whole log.    |
| 2   | **Training max**              | Per lift    | 5/3/1, nSuns                                 | Authored (from a test or an estimate), then mutated per cycle. Not a function of any single session. |
| 3   | **Consecutive-failure count** | Per lift    | StrongLifts (3), any fail-count rule         | Derivable **only if every session is logged and ordered**; a skipped or partial session breaks it.   |
| 4   | **Cycle position**            | Per program | A/B alternation, 3-week cycles, weekly roles | Counting sessions gives the wrong answer the first time one is skipped, duplicated or back-filled.   |
| 5   | **Current increment**         | Per lift    | Starting Strength; StrongLifts' settings     | Mutable state in one program and a setting in another. Never a constant.                             |
| 6   | **Weight history**            | Per lift    | Madcow's "reset several weeks back"          | A reset target that is a past weight has no closed form.                                             |
| 7   | **Deload history**            | Per lift    | Every program, for **explanation**           | Not needed to compute the next weight; needed to answer "why did my squat drop 10 kg?" honestly.     |

**Rows 1–6 are functional. Row 7 is a product requirement** — the **Load
Recompute Notice** pattern.

**Nothing on this list is a function of the date.** A program instance untrained
for three months resumes exactly where it stopped. Whether it _should_ is a
physiological question **no source in the family answers. Do not invent a
detraining rule.**

## C.5 The `deload` vocabulary collision (ADR 0056 §8 — already settled)

The word collides: in this program family it means a **per-lift −10 % cut on
failure**; in ADR 0047 it means a **planned −50 % week** in a season segment.
**ADR 0047 keeps `deload` for the planned week. The per-lift cut on failure must
be named something else.** Pick the name before writing the migration.

## C.6 Derived vs authored — the 1RM/TM fork

The StrongLifts app **displays** an estimated-1RM chart while the program needs
**no** 1RM. 5/3/1 does the reverse — the TM is **stored** because every
prescription depends on it. Both are correct for their program. **They must not
share a field.**

> A 1RM computed for a chart is a **display artefact** and can be recomputed
> freely. A **training max is authored state** with a provenance and an edit
> history, because a lifter's whole cycle is wrong if it is wrong.

This is ADR 0035's rule one layer up, and ADR 0021's PR carve-out: a 5RM and an
estimated 1RM are **derived** best efforts; a training max is **not** a best
effort and must not be folded into the PR machinery.

## C.7 `(exerciseId, equipment)` is the progression key

Four options were observed in production:

- **A — flat rows, equipment in the name** (FIT: 1,846 names; Hevy's display
  names). ✅ Trivial, histories separate. ❌ The picker explodes; ~500 enum
  members express what 3 columns on ~40 rows would; no structural statement that
  barbell and dumbbell bench are the same movement.
- **B — canonical exercise + equipment discriminator** (liftosaur:
  `IExerciseType = { id, equipment? }`). Every reference — program set, history
  entry, graph, per-exercise state, plate calculation — carries the **pair**,
  and the load semantics hang off the **pair**, not the movement. ✅ Short list,
  separate histories, substitution works. ❌ Two-field key everywhere; angle is
  a third axis it does not model.
- **C — variation groups** (wger). ✅ Symmetric, spans axes. ❌ Says nothing
  about _how_ two rows differ; groups drift.
- **D — EAV** (workout-cool). ✅ New axes cost no migration. ❌ No type safety —
  nothing prevents `PRIMARY_MUSCLE = BARBELL`; a join per attribute.

**Recommendation: B for identity + C for discovery + aliases for recall.**

```ts
type MovementPattern =
	| 'squat'
	| 'hinge'
	| 'lunge'
	| 'horizontalPush'
	| 'verticalPush'
	| 'horizontalPull'
	| 'verticalPull'
	| 'carry'
	| 'rotation'
	| 'isolation'

type Exercise = {
	id: string
	name: string // canonical, equipment-free: "Bench Press"
	movementPattern: MovementPattern
	primaryMuscles: MuscleId[]
	secondaryMuscles: MuscleId[]
	unilateral: boolean
	variationGroupId: string | null // discovery only, NEVER identity
}

type ExerciseVariant = {
	id: string
	exerciseId: string
	equipment: EquipmentId
	angle: 'flat' | 'incline' | 'decline' | null
	load: LoadSemantics // §C.8 — the reason this entity exists
	displayName: string // "Incline Bench Press (Dumbbell)"
}

type ExerciseAlias = {
	exerciseId: string
	variantId: string | null
	text: string
	locale: string
}
```

**The rule that keeps this honest: history rows reference `variantId`, never
`exerciseId`.** Aggregating up to the movement is a choice a chart makes;
merging down is impossible if you got it wrong, and dumbbell and barbell bench
genuinely progress independently. **An alias must never be a second identity** —
the moment an alias can be logged against, you have two histories for one
movement.

**Exercise database sizing.** `free-exercise-db` = 873 rows (**Unlicense**, the
default choice); wger = 850 rows (**CC-BY-SA 4.0 per row** — share-alike reaches
the derived corpus); FIT = 1,846 names; ExerciseDB claims "11,000+" but its data
licence is unstated → **not usable for a seed**. Practical range: **300–900
curated rows**. Below ~200 the athlete hits "my exercise isn't here" in week
one; above ~1,500 without a movement-pattern filter the picker is unusable on a
phone.

**No open dataset carries movement pattern, unilateral, or load semantics.** All
three must be authored locally → **adoption is a seed, not a dependency.**
Recommendation: seed from `free-exercise-db`, mine wger's _structure_
(translations / aliases / variation groups / the anatomical-vs-display muscle
split), and use FIT's 53-member `exerciseCategory` as the movement-pattern
vocabulary.

## C.8 A kilo is not a kilo (ADR 0056 §3 — the highest-consequence call)

| Equipment                      | Athlete types | What it means              | Tonnage should use | Trap                                                                   |
| ------------------------------ | ------------- | -------------------------- | ------------------ | ---------------------------------------------------------------------- |
| Barbell                        | `100`         | total **incl. bar**        | 100                | The plate calc must subtract the bar                                   |
| Dumbbell (pair)                | `32`          | **per hand**               | 64                 | A "32 kg DB press" outranks a "60 kg barbell press" in a naive PR list |
| Dumbbell (single, goblet)      | `32`          | total                      | 32                 | Same equipment, different multiplier — decided by the **exercise**     |
| Kettlebell (double)            | `24`          | per hand                   | 48                 | as above                                                               |
| Bodyweight only                | —             | bodyweight **at the time** | bw × reps          | Using today's weight rewrites last year's tonnage                      |
| Bodyweight + added             | `+20`         | bw **plus** 20             | (bw + 20) × reps   | Storing `20` alone makes a weighted pull-up look lighter than a curl   |
| **Assisted** (pull-up machine) | `21`          | bw **minus** 21            | (bw − 21) × reps   | **The sign is inverted.** More number = less work = _lower_ PR         |
| Machine stack                  | `level 7`     | an **ordinal**             | **not comparable** | Stack plates are not standardised; "7" here ≠ "7" on the next machine  |
| Cable (per-side pulley)        | `20`          | may be halved by the ratio | ambiguous          | Machine-dependent; the honest answer is "as marked"                    |
| Band                           | `red`         | a non-linear force curve   | **not computable** | Any kg conversion is fabricated                                        |

```ts
type LoadValue =
	| { kind: 'external'; kg: number } // barbell total, machine in real kg
	| { kind: 'perSide'; kg: number; sides: 2 } // dumbbells, kettlebells
	| { kind: 'bodyweight' }
	| { kind: 'bodyweightPlus'; addedKg: number }
	| { kind: 'assisted'; assistKg: number } // effective = bw − assist
	| { kind: 'stackLevel'; level: number; label?: string } // ORDINAL
	| { kind: 'band'; bandId: string } // named, never converted
	| { kind: 'unloaded' } // a timed hold, a jump

// Attached to the VARIANT, so the input widget, the plate calculator and every
// aggregate know what the number means before the athlete types it.
type LoadSemantics = {
	kind: LoadValue['kind']
	barKg: number | null // 20 Olympic, 15 women's bar
	perSideMultiplier: 1 | 2
	inventoryProfileId: string | null // which plates/dumbbells this gym has
}
```

Rules, each a bug avoided:

- **`effectiveLoadKg` is a derived function that is allowed to refuse.** It
  returns `null` for `stackLevel`, `band`, `unloaded`, and for any
  bodyweight-derived load with no bodyweight on file. ADR 0008's Unavailable
  Metric, one level down. A stack-level exercise **still progresses against
  itself** (level 6 → 7 is real), so its curve is drawable; only cross-exercise
  comparison and tonnage are unavailable. Surface copy: _"No kilos — this
  progresses against itself only."_
- **`effectiveKg` is baked at log time and never recomputed**, with
  `bodyweightKg` stored beside it so it can be audited and re-derived. This
  looks like breaking derived-never-stored and is not: recomputing would
  silently rewrite a two-year-old weighted-dip record after a 6 kg bodyweight
  change. Same resolve-and-bake as a Step's resolved intensity ranges.
- **ADR 0023 (shared display formatting) must take the variant, not just the
  number.** `32` renders as `2 × 32 kg`, `+20 kg`, `−21 kg assist` or `level 7`
  depending on `LoadSemantics`.
- ⚠ **Assisted load is where every export breaks.** Hevy's CSV carries
  `Pull Up (Assisted), weight_kg 21` — a positive number meaning −21 kg. _(Sign
  convention inferred from one community sample; documented by no vendor. Verify
  against a real file before trusting it.)_

## C.9 Set shapes: what a flat `ExerciseSet[]` cannot express

| Shape            | Structural requirement                                                        | Flat list?        |
| ---------------- | ----------------------------------------------------------------------------- | ----------------- |
| Straight sets    | nothing                                                                       | ✅                |
| Ramp / pyramid   | per-set load                                                                  | ✅                |
| **Superset**     | a **container over exercises**; rest belongs to the group                     | ❌                |
| **Circuit**      | container + **round count**                                                   | ❌                |
| **Drop set**     | **one set with an ordered list of load segments**; one entry in the set count | ❌                |
| **Myo-reps**     | one activation set + a **run of mini-sets bound to it**, sharing a load       | ❌                |
| **Cluster set**  | **intra-set rest** as a first-class field + a cluster size                    | ❌                |
| AMRAP            | a termination rule; `reps` becomes an outcome; a `minReps` floor is common    | ⚠ needs `kind`    |
| **EMOM**         | a **time-boxed container** whose rest is `interval − work` (derived)          | ❌                |
| Timed hold       | duration as the quantity                                                      | ⚠ `kind: 'timed'` |
| **Loaded carry** | **distance AND load simultaneously**, plus per-hand load                      | ❌                |
| **Rest-pause**   | intra-set rest with an AMRAP termination per segment                          | ❌                |

**Two additions cover all of it, not thirteen special cases:** a **`SetGroup`**
above the set (superset / circuit / EMOM, with `restAfterSec` on the **group**),
and a **`segments[]`** list on the set. Drop sets, myo-reps, clusters and
rest-pause **differ only in `intraRestSec` and whether the load descends** —
modelling them as four `kind`s means four renderers, four aggregation rules and
four ways to get tonnage wrong. One shape means one renderer and one rule
(`tonnage = Σ segments`), and the technique's _name_ becomes a label.

**ADR 0056 defers `segments[]` — deferred, not rejected.** It arrives as a
column on `ExerciseSetLog`, and **the four techniques stay unloggable until it
does, rather than being logged wrongly as three separate sets.** Supersets and
circuits likewise have **no container** today, so their rest belongs to the last
set. State these as absences.

**ADR 0002's XOR (duration XOR distance) governs `WorkoutStep` and must not be
inherited downward.** A loaded carry is `4 × 40 m @ 2 × 32 kg` — distance and
load simultaneously, at **set** level.

**Token Sentence check** — the prescription still renders as a pure function of
this structure, no parser:

```
5 × 5 @ 100 kg · 3 min rest
100 kg × 8 → 80 kg × 6 → 60 kg × 5             (drop set: → joins segments)
3 × 1 @ 90 % 1RM · 20 s intra-set rest          (cluster)
A1 bench 3 × 8 · A2 row 3 × 10 · 90 s rest      (superset: · joins members)
EMOM 10 min: 3 clean @ 70 kg                    (the group states the interval)
4 × 40 m @ 2 × 32 kg                            (a carry: distance AND load)
```

Open question, not a blocker: a **myo-rep run** does not fall out of the segment
list cleanly and needs an explicit convention (`12 @ 60 kg + 4 × 4 myo-reps`).

## C.10 The rule for the log surface vs ADR 0027

> **The Token Sentence renders the prescription. The set grid records the
> performance. They are the same rows in two modes, and the sentence is what a
> completed session collapses back to for the ledger.**

Render-never-parse is untouched: the sentence stays a pure function of
structure, and the grid parses nothing — it posts typed fields to an action.

⚠ **Do not route the log through the Conform-backed session editor.**
`WorkoutAuthoringSchema`'s round trip silently drops `load`, `effortCap` and
`tempo` (`catalogue-seed.server.ts` already bypasses it for this reason), and
`load` is the one field a set log exists to record.

---

# D. ExerciseThreshold and anchors

## D.1 Three things get called "1RM" and storing them in one `Float` is the mistake

- **A measured 1RM** — a maximal attempt was performed. Test–retest **CV median
  4.2 %** (ICC median 0.97; 32 studies, n = 1595, Grgic 2020). **A re-test
  differing by 3 % is inside the noise.**
- **An estimated 1RM** — a formula applied to a submaximal set. A prediction
  with a **± 9–11 % individual SD** even in the good case.
- **A training max** — a deliberately reduced working figure. A **programming
  decision**, not a measurement of anything.

## D.2 The formulas, verbatim

`RepWt` = load used, `RTF` = repetitions performed to fatigue. Transcribed from
Mayhew et al. 2008 Table 2:

```
Adams              1RM = RepWt / (1 − 0.02·RTF)
Berger             1RM = RepWt / (1.0261 − 0.00262·RTF)
Brown              1RM = (0.0338·RTF + 0.9849) · RepWt
Brzycki            1RM = RepWt / (1.0278 − 0.0278·RTF)          ≡ RepWt · 36/(37 − RTF)
Cummings & Finn    1RM = 1.175·RepWt + 0.839·RTF − 4.29787
Kemmler            1RM = RepWt · (0.988 + 0.0104·RTF + 0.0019·RTF² − 0.0000584·RTF³)
Lander             1RM = RepWt / (1.013 − 0.0267123·RTF)
Lombardi           1RM = RTF^0.10 · RepWt
Mayhew et al.      1RM = RepWt / (0.522 + 0.419·e^(−0.055·RTF))
O'Conner et al.    1RM = RepWt · (1 + 0.025·RTF)                ≡ RepWt · (1 + RTF/40)
Reynolds et al.    1RM = RepWt / (0.4847 + 0.5551·e^(−0.0723·RTF))   ⚠ see below
Tucker et al.      1RM = 1.139·RepWt + 0.352·RTF + 0.243
Wathen             1RM = RepWt / (0.488 + 0.538·e^(−0.075·RTF))
Welday             1RM = RepWt · (1 + 0.0333·RTF)               ≡ RepWt · (1 + RTF/30)

Epley              1RM = RepWt · (1 + RTF/30)     # algebraically IDENTICAL to Welday
```

⚠ **Reynolds is a typographic hazard.** Mayhew's table prints it with `+ 0.4847`
**inside** the exponent, which is a different function. Rendered above in the
family form and flagged. **Do not implement Reynolds without going to the
primary paper** — whose own recommendation is a plain linear equation from a 5RM
anyway.

**Two families:** _reciprocal-linear_ (Adams, Berger, Brzycki, Lander, O'Conner,
Welday/Epley) — a straight line, **wrong at both ends**: Brzycki divides by zero
at 37 reps, Adams at 50. _Exponential/power_ (Mayhew, Wathen, Reynolds,
Lombardi, Kemmler) — a curve that flattens, which is the correct shape. Mayhew's
was fitted to 435 college students as `%1RM = 52.2 + 41.9·e^(−0.055·reps)` and
is the only one with a documented empirical derivation of that size.

## D.3 Provenance — most of these are not studies

- **Epley (1985)** — a poundage chart in a University of Nebraska training
  manual, back-fitted into an equation. Not peer-reviewed.
- **Brzycki (1993)** — a practitioner article in _JOPERD_, no reported sample or
  methodology.
- **Lander (1985), O'Conner et al. (1989), Lombardi (1989), Wathen (1994)** —
  practitioner manuals or textbook chapters (Wathen's is a chapter in Baechle's
  _Essentials_).
- **Mayhew et al. (1992)** — the exception: substantial sample, explicitly
  fitted exponential model.

**A stored `estimatedOneRm` that does not record which formula produced it is
not reconstructible.**

## D.4 The error bars (copy these verbatim into any UI that shows a band)

Percent error, mean ± SD, in 103 women (Mayhew 2008):

| Equation        | Over 2–30 reps  | Restricted to ≤ 10 reps |
| --------------- | --------------- | ----------------------- |
| Brzycki         | +26.7 ± 101.7 % | **−2.0 ± 10.5 %**       |
| Lander          | +22.9 ± 70.7 %  | **−1.1 ± 10.5 %**       |
| Cummings & Finn | +10.8 ± 16.9 %  | +1.1 ± 10.6 %           |
| Wathen          | +4.9 ± 10.5 %   | +0.7 ± 10.6 %           |
| Adams           | +2.9 ± 16.1 %   | −4.5 ± 9.1 %            |
| Mayhew et al.   | +1.2 ± 9.0 %    | +1.6 ± 9.4 %            |
| Lombardi        | −4.9 ± 9.7 %    | −0.9 ± 9.2 %            |
| O'Conner et al. | −2.1 ± 9.0 %    | −3.7 ± 9.1 %            |
| Berger          | −24.0 ± 9.4 %   | −17.4 ± 7.2 %           |
| Epley/Welday    | —               | **+0.5 ± 10.2 %**       |

Read it twice. (1) The reciprocal-linear equations are **catastrophic** over a
wide rep range — a ±100 % SD is not an estimate. (2) **Restricting to ≤ 10 reps
fixes the mean and leaves a ± 9–11 % individual SD in every single row.** Berger
is _precise and biased_ (−17 ± 7 %), which is worse than useless because it
looks stable.

Corroboration: Reynolds 2006 (70 adults) — **the 5RM gave the best prediction**
(R² 0.993 bench / 0.974 leg press; SEE 2.98 kg bench, **16.16 kg leg press**),
concluding **no more than 10 repetitions** in a linear equation. Brechue &
Mayhew 2012 (58 footballers, squat) — best from reps-to-failure at 80 % 1RM
(5–17 reps), error within **± 5 % in 95 % of subjects**.

**Error differs by lift.** LeSuer et al. 1997, seven equations on bench/squat/
deadlift in 67 untrained students: r > 0.95 throughout, and **every equation
significantly underestimated the deadlift.** Nuzzo 2024's meta-regression needs
**separate `REPS ~ %1RM` tables for bench press and leg press** — at 70 % 1RM,
leg press **19.0 reps [14.2–25.5]** vs bench **14.1 [12.4–16.1]**; at 80 %, 13.1
[9.8–17.5] vs 8.8 [7.7–10.1]. Rows, overhead presses, deadlift variations and
most isolation work have **no validated exercise-specific mapping at all.**

## D.5 The protocol, in five rules

1. **Prefer not to convert at all.** "8 reps at 70 kg to near-failure" is
   honestly stored as an **8RM of 70 kg**. Every conversion to 1RM and back is a
   round trip through a ± 10 % transform.
2. **If a conversion is unavoidable, gate it at reps ≤ 10 and refuse above it.**
   Above ~12 reps it is not a low-confidence estimate — it is **not an
   estimate**.
3. **Within the gate, choose from the exponential family and record the
   choice.** Mayhew, Wathen and Lombardi are the defensible three.
   **Epley/Welday (`RepWt·(1 + reps/30)`) is the pragmatic pick** —
   near-unbiased at ≤ 10 reps and what every other app uses, which matters for
   an athlete comparing numbers. The UI must not imply it is science.
4. **Avoid Berger** (systematically −17 %) and **Brzycki/Lander/Adams above 10
   reps**.
5. **Never present the point estimate alone.** The defensible display is a
   **band** whose width is the population SD of the chosen equation — not a
   pretty ± 2 %.

## D.6 The entity

`DisciplineProfile`'s `@@unique([athleteProfileId, discipline])` means a squat
1RM and a deadlift 1RM would be **the same row**. This is a **cardinality
mismatch**, not a missing column, and it is why the gap survived three ADRs.
`ThresholdEvent` has no exercise relation either. **Copy the cardio shape; do
not reuse it.**

```prisma
model ExerciseThreshold {
  id       String @id @default(cuid())

  /// WHAT was measured. `oneRm` = a performed maximal attempt. `estimatedOneRm`
  /// = a formula's output, a different claim with a ±9–11 % population SD.
  /// `repMax` = the heaviest load for exactly `reps` reps, stored DIRECTLY and
  /// never converted.
  construct String // "oneRm" | "estimatedOneRm" | "repMax"
  valueKg   Float

  /// REQUIRED for `repMax` and for `estimatedOneRm` — the rep count is the single
  /// largest determinant of the estimate's error. Null for a measured `oneRm`.
  reps Int?

  /// HOW it was arrived at. The formula name, not a trust label.
  protocol String // "tested" | "epley" | "brzycki" | "lombardi" | "mayhew" |
                  // "wathen" | "rep-max-observed" | "athlete-stated" | "provider"

  /// ADR 0033's ordinal grade, and NULL where the athlete typed the number.
  confidence String? // "high" | "medium" | "low"

  effectiveAt DateTime @default(now())
  createdAt   DateTime @default(now())

  exercise   Exercise @relation(fields: [exerciseId], references: [id])
  exerciseId String

  athleteProfile   AthleteProfile @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
  athleteProfileId String

  @@unique([athleteProfileId, exerciseId, construct, reps, effectiveAt])
  @@index([athleteProfileId, exerciseId])
}
```

- **`repMax` is a peer of `oneRm`, not a derivative.**
- **Effective-dated and append-only.** A strength anchor moves faster than an
  FTP (novices add load weekly), so the history is the interesting object — and
  **an as-of-date resolver should be designed _before_ the first row exists**,
  not after. (ADR 0054 already logged `effectiveAt` written-and-never-read as a
  live defect.)
- **Exercise-scoped** — a back squat 1RM says nothing about a front squat.

## D.7 Confidence, on strength's own terms

ADR 0054 grades on coverage / recency / maximality / residual. **Three of the
four do not exist here.**

| ADR 0054 term    | Strength analogue                                                      | Available?                                  |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| **Coverage**     | How many distinct rep counts support the estimate                      | Only with a per-set log                     |
| **Recency**      | Days since the supporting set                                          | **Yes, directly**                           |
| **Maximality**   | Was the set actually near failure                                      | **No — and it is worse than cardio's case** |
| **Residual**     | Agreement between two estimates from different rep counts              | Only with two sets                          |
| _(new)_ **Reps** | **The rep count is the dominant error term** — strength-specific input | **Yes**                                     |

Grading:

- **`high`** — a tested 1RM, or a directly observed `repMax` at ≤ 5 reps, within
  ~8 weeks.
- **`medium`** — an estimate from ≤ 6 reps explicitly marked at/near failure.
- **`low`** — an estimate from 7–10 reps, or an athlete-stated untested figure.
- **A refusal above 10 reps.**

**On maximality the honest statement is stronger than ADR 0054's.** In cardio a
maximal effort has signatures. In strength there is **no signature at all**
without bar velocity: a set of 8 at RIR 4 and a set of 8 at RIR 0 are
byte-identical in any data an app can collect. **Maximality is not a weak
signal; it is an absent one** — which argues for pushing the feature toward
`repMax` (a fact the athlete discovers) rather than estimation from ordinary
sets.

## D.8 Refusals are first-class answers

| Refusal             | When                                                               | Why not just `low`                                                          |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `no-sets-logged`    | No set record exists for this exercise                             | Nothing was read                                                            |
| `reps-out-of-range` | The best available set is > 10 reps                                | The SD exceeds anything the app would act on — not uncertainty within a fit |
| `effort-unknown`    | No proximity-to-failure information on the set                     | Maximality has no signature in strength                                     |
| `exercise-unmapped` | No validated rep↔load mapping and not a compound the corpus covers | Rows, OHPs and isolation work have none                                     |

ADR 0054's precedent verbatim: _"a grade communicates uncertainty **within** a
valid fit; it must not be asked to carry 'this is not a fit at all'."_

## D.9 The propose → accept shape (ADR 0054, copy it exactly)

- **Nothing is ever written without the athlete's act.** The analyze screen is a
  screen of **proposals**: the loader has no transaction and no create; one POST
  per accepted reading writes anything at all.
- **Derived-then-authored (ADR 0050):** once accepted, the number is theirs, and
  **nothing re-reads history to move it underneath them.**
- **Acceptance re-runs the analysis server-side** rather than trusting the value
  the browser posted back. **An athlete cannot accept a number the app never
  produced.**
- **The engine is pure**: reads no clock (`now` is an argument), no random
  source, mutates nothing, cannot query. The server half assembles the input and
  writes only what was accepted.
- **The caveat sits on the number**, one phrase, in place, argument behind a
  tap: _"120 kg · estimated from 8 reps at 100 kg on 12 Mar"_.
- **A stale estimate freezes and is flagged, never decayed.** ⚠ Strength has a
  twist: `Bosquet 2013` **is** a real decay curve (submaximal strength SMD
  −0.62, maximal force −0.46, maximal power −0.20, dose–response with duration)
  — but it measures **cessation**, and the stale-anchor case is an athlete who
  is _training and untested_. The sign of the error is **ambiguous**: a novice
  adding load weekly is stale **low**, and a decay function would move them
  further from the truth. Also, 1×/week **maintains** strength (Rønnestad), so a
  decay curve would penalise exactly the behaviour that preserves the quantity.
  **Freeze, flag, and re-estimate from the most recent qualifying logged set — a
  measurement, not a function of time.**
- **`protocol: 'provider'` exists and nothing writes it unasked.** No
  integration carries a per-exercise 1RM; the ones that could would be **another
  app's Epley applied to another app's set**.

## D.10 The training max

**There is no evidence base. None.** No trial manipulates the fraction; no study
compares training from 90 % of 1RM against 100 %. The author's own site: _"no
hard rule for your TM"_, and later programs may use 85 %, 80 % "or whatever".

**What the science supports is the premise, not the number:** day-to-day
performance varies, the 1RM test's CV is ~4 %, an estimated 1RM carries ± 9–11
%, and a velocity-derived one is biased **+3.7 %**. **Computing working loads
from an estimator biased high, with no buffer, systematically overloads the
athlete — and a buffer is the correct response to a biased estimator.**

Implementation rules: a working fraction is a **product convention documented as
such**; it is **explicit and visible**, never a silent multiplier (a silent one
makes every displayed `%1RM` a lie about what the athlete is lifting); and it is
**stored separately from the anchor** so `estimatedOneRm = 120` and
`workingFraction = 0.9` stay independently editable. **Folding the fraction into
the stored anchor destroys the anchor.**

⚠ **A collision to resolve explicitly:** the session library's maximal-strength
phase prescribes ≥ 85 % 1RM, and 85 % of a 90 % TM is **76.5 % of the true 1RM**
— below the band where `%1RM` is portable at all. Either the fraction applies
and the bands are restated against the TM, **or** the bands are true-1RM
percentages and the fraction must not silently apply to them. **Both are
defensible; doing both at once is not.**

## D.11 Which anchor for whom

| Anchor              | Portable over                               | Fails where                                       |
| ------------------- | ------------------------------------------- | ------------------------------------------------- |
| **`nRM`** (`8RM`)   | **Everywhere, by definition**               | Needs the athlete to find it, once, per exercise  |
| **RIR / RPE**       | Everywhere in principle; reliably ≤ 2–3 RIR | Far from failure, at light loads, and in novices  |
| **Velocity loss %** | Everywhere, as a fatigue cap                | **Requires a sensor** — do not build              |
| **`% 1RM`**         | **≈ 85 % and above**                        | Below ~85 %, worst for endurance-trained athletes |
| **`% bodyweight`**  | Bodyweight / calisthenic movements          | Loaded barbell work                               |
| **Absolute kg**     | Nowhere across athletes                     | Everywhere                                        |

- **Novice, no tested lifts → prescribe `nRM`.** It is self-calibrating, needs
  no introspection, and **needs no stored anchor at all**. This is the single
  most important recommendation for the out-of-the-box case, and it inverts the
  cardio build order: **ship `repMax` resolution first — it is free and it is
  the novice path.** `%1RM` needs a 1RM; `@ 8RM` is a complete instruction
  today.
- **Trained, no sensor** → RIR for effort, `%1RM` for load in the heavy band.
- **Below 85 % 1RM**, `%1RM` is a **starting load** and the set's termination
  must be governed by something else.

**The RIR asymmetry, stated as a rule:** RIR is the anchor that needs no profile
and the anchor a beginner is worst at reporting. Pooled underprediction ≈ **0.9
reps** (Halperin 2022); SEM **2.64–3.38 reps** in 141 trainees (Steele 2017);
259 coaches judging video were off by **4.8 / 2.0 / 1.2 reps** at 33 / 66 / 90 %
through the set (Emanuel 2022 — and **coaching experience had a negligible
effect**). **Accuracy is a function of proximity to failure.** A logged `RIR 2`
is on average nearer RIR 3 and could be RIR 5, which biases any derived 1RM
**downward**. ⚠ **Do not correct for it** — a correction constant applied to
somebody's self-report is a number about this athlete that nobody measured.
Surface the caveat instead.

Also: **RIR-prescribed load does not beat percentage-prescribed load.** Helms
2018, 8 weeks, sets and reps matched: both groups improved, **no significant
between-group difference** (bench +9.6 vs +10.7 kg; squat +13.9 vs +17.1 kg).
RIR's advantages are elsewhere — no stored 1RM needed, self-correcting for
readiness, better affect.

---

# E. PRs and history

## E.1 Honest vs vanity

| Surface                                | Reads                                    | Verdict                                                                        |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| **Per-exercise strength curve**        | top-set load over time, per `variantId`  | **Honest.** The core surface. Per variant, warm-ups excluded.                  |
| **Estimated-1RM trend**                | best e1RM per session, from the best set | **Honest with a named formula** — name the model **on the axis**.              |
| **Rep-max records per rep count**      | heaviest weight at exactly N reps        | **Honest and underrated** — the least model-dependent record there is.         |
| **Heaviest weight ever, any reps**     | max load                                 | **Honest**, and the one athletes actually care about.                          |
| **Tonnage / volume load per exercise** | `Σ reps × effectiveKg`                   | **Honest as a dose reading, dishonest as an achievement.** Never a PR.         |
| **Hard sets per muscle per week**      | count of working sets                    | **The most defensible dose metric** — and cheap: no load maths.                |
| **Volume per muscle group per week**   | sets/tonnage attributed to muscles       | **Semi-honest — declare the attribution rule.**                                |
| **Session tonnage record**             | "most weight lifted in a session"        | **Vanity.** Maximised by longer sessions and lighter sets.                     |
| **Streaks**                            | consecutive weeks/days trained           | **Vanity.** Measures app-opening; actively harmful if it discourages a deload. |
| **Muscle-group heatmap**               | coloured body diagram                    | **Vanity dressed as analysis** unless the attribution rule is stated.          |
| **e1RM leaderboard across lifts**      | bench vs squat vs curl                   | **Vanity.** Cross-exercise comparison of absolute load says nothing.           |

**The muscle-attribution rule is the load-bearing detail.** Liftosaur's answer
is an explicit, **user-visible** constant — `synergistMultiplier = 0.5`, with
per-exercise overrides. That number is a **convention, not a measurement**, and
a heatmap with an undeclared attribution rule is a coloured picture that looks
like evidence.

## E.2 How PRs are derived

- **Derived, never stored** (ADR 0021 generalizes cleanly). The **carve-out**: a
  **training max is authored state**, not a best effort, and must not be folded
  into the PR machinery.
- **No stream tier is needed at all** — the set row _is_ the measurement. This
  is materially different from the pace/power ladder ADR 0021 deferred, and it
  means strength PRs ship the same day the log does. `BenchmarkKind` should grow
  strength arms (`e1RM`, `repMax(n)`, `heaviestLoad`) **now, not later**.
- **The check runs on set completion**, not at session end — the live banner is
  the reason the feature exists.
- **Against the variant's history**, so a first-ever dumbbell bench does not
  trigger four PRs on day one. **Rule: on a variant with fewer than ~3 prior
  sessions it is a first entry, not a record** — _"first time!"_ is both truer
  and nicer than _"PR!"_.
- Warm-ups and abandoned sets are excluded from every record.

## E.3 The Strength Summary Count (ADR 0056 §7 — ships with the log)

- **Sessions with at least one logged working set, over strength sessions
  materialized in the week.**
- **A count, not an Adherence Band** — a band's cut points are asymmetric on a
  stated principle about volume overshoot, and this repo has no source for that
  asymmetry on a session count.
- **A week with no strength session reads as an absence, never `0 of 0`** — a
  Summary Count is derived from _existing_ sessions, and `0 of 0` reads as a
  completed week.
- The weekly load figure now reads **"92 % of planned endurance load"**. The
  ratio is a TSS ratio and strength has no TSS by decision, so the figure was
  never the week's — it was endurance's, presented as the week's. Arithmetic
  untouched; only the claim changes.

## E.4 Import / export — there is no standard

**FIT's `set` message (225) is the only cross-vendor format**, and it is lossy:
`duration` (uint32, **scale 1000**), `repetitions` (uint16), `weight` (uint16,
**scale 16 kg**, unsigned → **assisted load is unrepresentable**), `setType` ∈
**`{rest, active}` — the whole vocabulary**, `category[]`, `categorySubtype[]`,
`weightDisplayUnit`, `wktStepIndex`. `exercise_title` (264) is the escape hatch
for a custom name. There is **no strength equipment field** in FIT, which is why
it bakes equipment into 1,846 names.

**Survives a round trip:** exercise identity, reps, kg, per-set duration,
ordering, the link to a prescribed step. **Does not:** warm-up vs working, drop
segments, RPE/RIR, unilateral split, assisted (negative) load, band and
stack-level loads, superset grouping, rest actually taken.

CSVs everyone migrates with: **Strong**
(`Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE`
— and `0` in Distance/Seconds is **ambiguous with a real zero**) and **Hevy**
(adds `superset_id` and `set_type`, so strictly more structure). **Neither
carries** exercise identity beyond a display string, equipment, bodyweight at
the time, rest taken, per-set notes, or drop-set structure. **An import from
either is lossy and the app must say so** rather than silently producing a
history that looks complete.

**Export rule:** the app's own lossless JSON is the **archival** export; a
Strong-shaped CSV is the **interoperability** export; **the UI names which is
which** instead of offering "Export" once.

---

# F. What NOT to build — refusals, not omissions

Each of these is a decision recorded in the research or an ADR. Building any of
them is a regression.

1. **Velocity-based training / any computed bar velocity.** Even with a
   transducer, an LVP-derived 1RM carries **SEE% ≈ 9.8 %** with a **systematic
   +4.5 kg (≈ 3.7 %) overestimate** — worse than the rep-based estimators — and
   the meta-analysts' own recommendation is to measure 1RM directly. Phone
   cameras and wrist IMUs are **not validated instruments**; an unvalidated
   velocity is not a low-confidence velocity. **Narrow exception:**
   `LoadTarget`'s velocity arm and the `velocityLoss` termination stay
   **authorable, athlete-reported, never app-computed** — a coach with a
   GymAware can write `5 × 3 @ 0.9–1.1 m/s` and the app renders it faithfully.
2. **Session tonnage records and logging streaks.** Rejected, **not deferred**.
   Tonnage rewards junk volume and inverts the portability thesis; a streak
   measures app-opening.
3. **A kg value for a band, or for a machine stack level.** No conversion
   exists. Inventing one to make a chart continuous is the fabrication this repo
   forbids.
4. **A single "strength score" across exercises**, or an e1RM leaderboard across
   lifts. Absolute loads across different movements are not commensurable.
5. **A `failed: Boolean` column.** Three claims in one field, and the most
   common of them is already visible in the numbers.
6. **The 5×5 → 3×5 → 1×5 ladder as StrongLifts' rule.** Unverified (§A.1.8).
7. **A detraining / decay rule on paused program state or on a stale anchor.**
   No source in the family publishes one; the sign is ambiguous.
8. **A population-bias correction applied to a logged RIR.** Surface the caveat
   instead.
9. **A single shared `deloadPct` field.** −10 % (StrongLifts, GreySkull), −8–10
   % (Starting Strength press), "several weeks back" (Madcow) and "re-estimate
   the TM" (5/3/1) are **four different operations**; one field launders three
   into the first.
10. **Any deload percentage or cadence presented as evidence.** The circulating
    numbers are a **survey of practice** (Rogerson 2024: **6.4 ± 1.7 days, every
    5.6 ± 2.3 weeks**; De Marco 2024: 1–2 sessions, 1–3 sets, 1–6 reps, **60–84
    % 1RM**, most common volume reduction **0–25 %**) and a **Delphi
    consensus**. **The two controlled trials found no benefit — Coleman 2024's
    continuous group gained _more_ strength.** If a deload ships, copy the
    **shape** all four practice sources agree on: **cut volume and effort, hold
    frequency, keep exercise selection** — and label duration and cadence as
    conventions with the survey means attached.
11. **Deriving a duration or a strength standard for when a program stops
    working.** No official source in the family gives one; "3–6 months" is
    third-party. What the app _can_ show is the athlete's own data — increments
    firing less often, deloads clustering. **A derived observation, never a
    prediction.**
12. **Seeding a program with adjusted numbers under its published name.**
13. **Progressing assistance work by an invented rule.** No program publishes
    one.
14. **An upward volume ratchet** (ADR 0047 §7, unchanged and strengthened:
    adding reps and adding load produce the same adaptations, Plotkin 2022).
15. **Extending ADR 0027's Token Sentence to the log** (§C.10).
16. **Writing performed reps onto `ExerciseSet`** (ADR 0056 §2).
17. **Deriving the fail count from the session log at read time.** Right only
    when the log is complete and ordered, which real logs are not.
18. **Expressing a program as a Plan Outline segment or a Catalogue row.** A
    Catalogue row is one session; a program is a sequence + a rule + state. It
    is a **sibling entity that references Catalogue rows for its sessions.**
19. **A "1RM" field that serves both the chart and the training max** (§C.6).

---

# G. Reference constants, in one place

**StrongLifts.** Warm-up: 2 × 5 @ empty bar, then heavier 5s to the work weight;
jump cap 45 lb (⚠ violated by the vendor's own example); example for a 225 lb
squat: `5×45, 5×45, 5×95, 5×135, 5×185` then `5×5 @ 225`. Rest: **3 min success
/ 5 min failure / none between warm-ups / 3 min before the last warm-up**;
overlapping notifications at 1m30 and 3min. Increment: **5 lb/2.5 kg default,
everything**; DL 10 lb then 5 lb. Deload: **3 consecutive failed sessions → −10
%, per exercise.** Start: **20 kg / 45 lb** (squat/bench/OHP), **30–40 kg /
65–95 lb** (row/DL). Cycle: **ABA·BAB**, two weeks.

**5/3/1.** TM = **85–90 %** of 1RM. Wk1 `5@65 · 5@75 · 5+@85`; Wk2
`3@70 · 3@80 · 3+@90`; Wk3 `5@75 · 3@85 · 1+@95`. Per cycle: **press/bench +5
lb, squat/DL +10 lb** on the TM. `<3` reps on the `+` set → re-estimate the 1RM
from it and reset the TM. Legacy deload week 40/50/60 % × 5/5/5 —
**edition-dependent**.

**nSuns TM table (verbatim, ranges included).**
`0–1 reps: +0 lb · 2–3: +5 lb · 4–5: +5–10 lb · 6+: +10–15 lb`. **Not
deterministic as published.**

**GreySkull.** `2×5 + 1×5+`; ≥5 → +2.5 lb upper / +5 lb lower; <5 → −10 % on
that lift; ⚠ ≥10 reps → double increment (**secondary-only**).

**Madcow.** +2.5 %/wk of Monday's top set; ramp jumps **10–15 %** per set
(worked example 60/70/80/90/100; StrongLifts calls it a "12.5 % set interval");
Friday's 1×8 uses the 3rd set's weight; Friday's triple → next Monday's top
five; miss → hold next week; majority stalling → reset several weeks back.

**Texas Method.** Mon 5×5 @ ~90 % of the 5RM; Wed squat 2×5 @ ~80 % of Monday;
Fri 1×5 at a new 5RM.

**Starting Strength.** 3×5 squat, alternating bench/OHP 3×5, DL 1×5; reset −10 %
(press −8–10 %) **and shrink the increment** (10 lb → 5 lb); phase 2 adds power
clean 5×3.

**Error bars to quote in UI.** 1RM test–retest **CV median 4.2 %** (ICC 0.97).
Estimated 1RM at ≤ 10 reps: **± 9–11 % individual SD**. Over 2–30 reps Brzycki
is **+26.7 ± 101.7 %**. LVP-derived 1RM: **SEE% 9.8 %**, bias **+4.5 kg**. RIR
underprediction: **≈ 0.9 reps pooled**, SEM **2.6–3.4 reps**.

**Portability.** Richens & Cleather 2014, leg press, n = 8 vs 8: reps at 70 % =
**39.9 ± 17.6 (runners) vs 17.9 ± 2.8 (weightlifters)**, at 80 % **19.8 ± 6.4 vs
11.8 ± 2.7**, at 90 % **10.8 ± 3.9 vs 7.0 ± 2.1 (n.s.)**. ⚠ **The 90 % row is an
underpowered null, not equivalence.** Never write "`%1RM` is portable at 90 %";
write "the between-population gap narrows sharply as load rises."

**Dataset sizes.** free-exercise-db **873** (Unlicense) · wger **850** (CC-BY-SA
4.0 per row) · FIT **1,846** names across **53** categories / **51** name enums
· practical picker range **300–900**.

**Defaults observed in production.** liftosaur `timers.workout = 180 s`,
`synergistMultiplier = 0.5`. wger RiR capped at 9.5, rounded to the nearest 0.5.

---

## Build order (each step demoable on its own — this repo's bar)

1. **`ExerciseSetLog` + the logging surface** — the grid with a ghost, a rest
   timer, one-tap "same as last time". Turns strength from planned-only into a
   tracker and fixes ADR 0046 §4's unbuilt Summary Count. **(ADR 0056 — shipped
   as Stage 1.)**
2. **`ExerciseThreshold`** — `repMax` resolution **first** (free, and the novice
   path), then `pct1RM`. Estimation follows ADR 0054's propose→accept shape.
3. **Strength PRs and per-exercise history** — derived, no stream tier.
4. **The program engine** — per-lift state, a cursor, three failure remedies.
   StrongLifts, Starting Strength and GreySkull run on nothing but the last
   weight lifted; 5/3/1 and nSuns need step 2 first.
5. **The exercise database** — seed, `(exerciseId, equipment)` as the
   progression key, load semantics authored locally.

**Open items to settle before writing the migration:** the name for the per-lift
cut on failure (§C.5); whether `SESSION_ARCHETYPES` grows a strength arm or
strength keeps its own axis via **Strength Goal**; which dataset on which
licence; and the `WorkoutSession.status`-vs-logged-sets reconciliation (§B.7).
