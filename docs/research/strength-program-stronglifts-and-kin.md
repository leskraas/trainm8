# StrongLifts 5×5 and the beginner barbell program family

Research note. Compiled 2026-08-13. One program, the app that delivers it, and
the six programs it is usually compared against — read as **specifications for a
program engine**, not as physiology.

> **Sibling documents.** The 25-session strength library, the `%1RM ↔ reps`
> table, RIR autoregulation, velocity-based training and the concurrent-training
> interference literature live in
> [`workouts-strength-and-other.md`](workouts-strength-and-other.md); the
> per-muscle volume landmarks and their provenance live in
> [`../wayfinder/manual-training-planning/380-strength-volume-landmarks.md`](../wayfinder/manual-training-planning/380-strength-volume-landmarks.md).
> **Neither is repeated here.** This note owns exactly one thing: **what these
> programs' own published rules say, and what a machine must hold to execute
> them.**
>
> **Deliberate deviation from a corpus convention.** [README.md](README.md)
> states that findings are recorded vendor-neutrally, no product named. That is
> impossible here: the subject _is_ a named program and a named app, and a
> comparison table of seven named programs is the deliverable. Products are
> named throughout §2–§4 and in References. The findings in §5–§7 are stated
> product-neutrally.

## TL;DR

- **Every program in this family is an outcome-driven state machine, and this
  repo's strength model has no state.** ADR 0047 settled that a strength segment
  progresses by **anchor and ramp** — a weekly sets target interpolated from a
  calendar position. Not one of the seven programs below works that way: in all
  seven, **the next session's weight is a pure function of the last session's
  logged outcome**, and the calendar contributes nothing. StrongLifts adds 2.5
  kg if and only if 25 of 25 reps were completed; 5/3/1 raises a training max
  per cycle; Madcow carries Friday's triple forward into Monday's top set. A
  plan that says "week 7 targets 18 sets" cannot answer _what do I lift today_,
  which is the only question these programs exist to answer.
- **StrongLifts' published numbers are narrower than its reputation.** Workout A
  is Squat/Bench/Row 5×5, Workout B is Squat/Overhead-Press 5×5 plus **Deadlift
  1×5**, three sessions a week alternating, so the A/B cycle spans **two weeks**
  (ABA·BAB). The increment is **5 lb / 2.5 kg on squat and deadlift** and
  **2.5–5 lb / 1.25–2.5 kg on the presses and row**; the failure rule is
  **repeat the weight, and after three failed sessions in a row cut 10 %**; the
  app's defaults are exactly those two numbers. Starting weights are the **empty
  20 kg / 45 lb bar** for squat, bench and press and **30–40 kg / 65–95 lb** for
  row and deadlift.
- **The famous "5×5 → 3×5 → 1×5 after two deloads" ladder is not on the official
  site.** The single most-repeated StrongLifts rule in secondary write-ups
  appears in neither the failure article, nor the plateau article, nor the app's
  progression settings. What the current plateau article prescribes instead:
  drop squat frequency 3×→2×/wk, add lift variations, raise bench frequency,
  then move to _StrongLifts 5×5 Intermediate_. The ladder is **folklore or an
  artefact of an older edition**, and this document declines to state it as the
  program's rule.
- **The app's mechanics are more specified than the program's.** From the
  vendor's support articles: rest timer **3 min after a completed set, 5 min
  after a failed one**, none between warm-up sets; the warm-up calculator
  generates sets by **capping any jump at 45 lb** (225 lb squat →
  45/45/95/135/185 then 5×5 at 225) and is **not editable**; the plate
  calculator is a **Pro (paid) feature** taking a per-plate inventory; and
  **increments are independent of the plate inventory**. That last one is worth
  copying: loadability and progression are two different concerns.
- **Two of the seven need an estimated 1RM and four need nothing, and that is
  the sharpest fork in the family.** 5/3/1 and nSuns are built on a **training
  max** — a stored, per-exercise number, conventionally 85–90 % of 1RM — and
  every prescribed weight is a percentage of it. Madcow and Texas Method need a
  **5-rep max**, a measured performance rather than an estimate. StrongLifts,
  Starting Strength and GreySkull need **nothing but the last weight lifted**.
  This repo ships `pct1RM` and `repMax` on `ExerciseSet` and stores **no 1RM
  anywhere**, so the percentage-based families are unrunnable today and the
  absolute-increment families would run if per-lift state existed.
- **Three of the seven terminate a set on reps achieved rather than prescribed,
  and that set _is_ the progression rule.** 5/3/1's `5+/3+/1+`, GreySkull's
  final `5+` and nSuns' `1+` are AMRAP sets whose rep count feeds a lookup that
  decides the next load (nSuns, verbatim: 0–1 reps → +0 lb, 2–3 → +5, 4–5 →
  +5–10, 6+ → +10–15). ADR 0007's amended `ExerciseSetKind` already includes
  `amrap`, so the prescription side is solved; the **logged rep count as a
  program input** is not.
- **Failure has three structurally different remedies and a model needs all
  three.** A **percentage cut** (StrongLifts −10 %, GreySkull −10 %, Starting
  Strength −10 % and press −8–10 %), a **reset to a past weight** (Madcow:
  "reset several weeks back and rebuild"), and a **re-estimation of a derived
  anchor** (5/3/1: fewer than 3 reps on the `+` set → re-estimate the 1RM from
  it and reset the training max). Not three tunings of one rule: the second
  needs a weight _history_, the third needs an estimator.
- **The programs' rules are specifications, not findings.** No progression rule,
  deload percentage, fail-count or volume-ladder transition in this family has
  been tested against a matched alternative in the peer-reviewed literature.
  What _is_ established is the underlying gradient — untrained lifters gain far
  faster than trained ones — which is a reason a linear rule works at all, not
  evidence for 5 lb over 2.5 lb or three failures over two.

---

## 1. Why a program is a different object from a workout

This repo models a **Workout** — a tree of blocks and steps, one per session,
authored or generated, private 1:1 to a `WorkoutSession` (ADR 0003, ADR 0004).
It models a **Plan Outline** — dated phases and segments carrying volume targets
(ADR 0039, 0041, 0044, 0047). Between those two there is a gap, and the programs
in this document live in it.

| Object           | Answers                            | Depends on                                   | In this repo             |
| ---------------- | ---------------------------------- | -------------------------------------------- | ------------------------ |
| **Workout**      | _What is this session?_            | Nothing outside itself                       | Shipped                  |
| **Plan Outline** | _What should this week look like?_ | Calendar position + authored anchor and ramp | Shipped (ADR 0044, 0047) |
| **Program**      | _What do I lift **today**?_        | **The outcome of the last session**          | **Absent**               |

The distinguishing property is the third row's dependency. A Plan Outline is a
**function of time**: give it a week key and it returns a target,
deterministically, without knowing whether last week happened. A program in this
family is a **function of logged history**: give it a week key and it cannot
answer at all. Squat 100 kg is next session's prescription because 97.5 kg × 5 ×
5 was completed, not because it is week 7.

That has three consequences that recur in every section below.

1. **A program generates sessions lazily, one at a time.** You cannot stamp
   twelve weeks of StrongLifts into the calendar in advance, because the weight
   in week 6 is unknowable in week 1. ADR 0053 stamps a whole season
   deterministically; a program can stamp only the **shape** in advance, and
   must resolve the load at the moment the session is opened.
2. **State is per lift, not per program.** In all seven programs the squat can
   be mid-deload while the bench press is still adding weight. Any single
   program-level "current week" field is wrong.
3. **The engine reads the log.** A program that does not consume completed-set
   data is a printed sheet. This is the same seam ADR 0019 needed for adherence
   and the same missing `ExerciseSetLog` that
   [`workouts-strength-and-other.md`](workouts-strength-and-other.md) §14.6
   already asked for — reached independently, from a different direction.

---

## 2. StrongLifts 5×5, exactly

All figures in this section are from stronglifts.com and
support.stronglifts.com, retrieved 2026-08-13. Where the official pages disagree
with each other or with the community, that is stated in place rather than
reconciled.

### 2.1 The two workouts and the five lifts

| Workout       | Exercises                                         |
| ------------- | ------------------------------------------------- |
| **Workout A** | Squat 5×5 · Bench Press 5×5 · Barbell Row 5×5     |
| **Workout B** | Squat 5×5 · Overhead Press 5×5 · **Deadlift 1×5** |

Five lifts total. The squat appears in both workouts, so it is trained three
times a week; the other four appear in one workout each, so each is trained
either once or twice in a given week depending on where the alternation falls.

> "Most Stronglifters train Monday, Wednesday and Friday."

Three sessions a week with A and B alternating means the pattern is **ABA, BAB**
and the true cycle length is **two weeks / six sessions**, not one week. This is
load-bearing for §5: a program engine cannot store "which day of the week" and
recover the state; it must store **which of A/B is next**.

### 2.2 The deadlift exception

The deadlift is the only lift prescribed as `1×5`. The stated reason:

> you perform "one heavy set of 5 reps after you warm up" rather than five sets

The official [progress page](https://stronglifts.com/5x5/progress/) also gives
the deadlift its own increment: it "can progress by 10lb. Once this becomes
hard, switch to 5lb increments." So the deadlift differs on **two** axes at once
— set count and increment size — which is why a per-lift rule table is the only
correct shape (§4).

### 2.3 Starting weights

| Lift                          | Official starting weight                   |
| ----------------------------- | ------------------------------------------ |
| Squat, Bench, Overhead Press  | "empty bar" — **45 lb / 20 kg**            |
| Barbell Row, Deadlift         | **65–95 lb / 30–40 kg**                    |
| Experienced lifters, any lift | "a weight that you could lift for 10 reps" |

Two things to note. The empty-bar start is a **fixed absolute weight**, not a
percentage of anything — which is exactly why the program needs no 1RM. And the
experienced-lifter rule is a `10RM` reference, which is the `repMax` member of
this repo's shipped `LoadTarget` union (`app/utils/workout-schema.ts:222`) and
resolves against nothing today.

### 2.4 The increment

The official pages state the increment two ways, and the numbers do not quite
line up.

| Source                                                                        | Squat / Deadlift                  | Bench / Press / Row        |
| ----------------------------------------------------------------------------- | --------------------------------- | -------------------------- |
| [Quick start guide](https://stronglifts.com/stronglifts-5x5/workout-program/) | 5–10 lb / 2.5–5 kg                | 2.5–5 lb / 1.25–2.5 kg     |
| [Progress page](https://stronglifts.com/5x5/progress/)                        | "5lb or less"; DL 10 lb then 5 lb | 5 lb men; OHP 2.5 lb women |
| [App defaults](https://support.stronglifts.com/article/71-progression)        | **5 lb** per workout              | **5 lb** per workout       |

The app's stated default is a flat 5 lb for everything — "if you did 5x5 200lb
Squats last workout, and you didn't miss any reps, then the weight will increase
to 205lb" — with a smaller increment for the overhead press described as a
**setting the lifter changes**, not a default the app applies. The much-repeated
"2.5 lb on the overhead press" is therefore **advice, not the app's behaviour**,
and the smaller-increment-for-women framing is the only place the official text
attaches 2.5 lb to the press unconditionally.

Progression is also **frequency-configurable** in the app: "add 2.5lb every
three workouts instead" is given as a supported alternative. That is a third
axis — per how many successful sessions does the increment fire — and it means
the engine cannot hard-code "every session".

### 2.5 The success predicate and the failure rule

The success predicate is stated as **all reps on all sets of that exercise**:

> "Add weight if you completed five reps on all sets of this exercise."

Otherwise the weight is repeated. Failure itself is defined by rep shortfall,
not by bar speed or form:

> you "attempt to lift the weight for five reps. But you can't do more than one,
> two, three or four reps"

The deload trigger is three strikes, stated as prose on the program site and as
a default setting in the app:

| Source                                                                             | Trigger                                                                             | Cut                               |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| [Failure article](https://stronglifts.com/stronglifts-5x5/failure/)                | "What if you repeat the weight three times but still fail? Stop trying and deload." | "Reduce the weight by about 10%." |
| [App progression settings](https://support.stronglifts.com/article/71-progression) | "if you fail to complete all sets on an exercise for three sessions in a row"       | "the weight will decrease by 10%" |

Both agree on **3 consecutive failed sessions → −10 %**, and both scope the
counter **to the exercise**. Note the subtle difference in what "failed" means:
the failure article's counter counts _repeats of the same weight_, the app's
counts _consecutive sessions where all sets were not completed_. For a program
that repeats the weight after any failure these coincide, but they are not the
same predicate, and an engine must pick one. The app's is the mechanical one.

### 2.6 Rest and warm-up

| Element                     | Official value                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Between work sets           | "Rest about 3min between your five sets of five reps."                                                                          |
| — if the set felt easy      | 1–2 min                                                                                                                         |
| — normal                    | 3 min                                                                                                                           |
| — hard                      | 5 min                                                                                                                           |
| Between warm-up sets        | "There is no rest time between the warm up sets"                                                                                |
| Before the last warm-up set | timer "rings at 3min by default"                                                                                                |
| Warm-up structure           | "two sets of five reps with the empty bar. Then... several heavier warm up sets of five reps until you reach your work weight." |

### 2.7 The stated exit conditions

The current official plateau article is explicit that the program ends, and
vague about when:

> "You can't add 5lb on the bar 2-3x/week forever. It's unsustainable"

It gives **no** duration, no strength standard, and **no 3×5/1×5 ladder**. Its
prescribed sequence of changes is:

1. Reduce squat frequency from 3×/wk to 2×/wk.
2. Add lift variations (pause squats and similar).
3. Raise bench volume to 3×/wk with variations.
4. Move to **Stronglifts 5×5 Intermediate**.

Madcow 5×5 exists in the same product but is presented as a **separate
program**, not as StrongLifts' successor. See §7 for the ladder claim's status.

---

## 3. The app, as distinct from the program

Verified from the vendor's own support articles unless marked otherwise. Only
what is **specific to this app's delivery of this program family**; generic
tracker features are out of scope by the brief.

### 3.1 Warm-up generation — a computed ramp with a jump cap

> "The Stronglifts Warmup Calculator prevents this issue by not giving jumps in
> weight larger than 45lb on the warmup sets."

> "say you have to Squat 225lb for 5x5. The warmup calculator will show you
> 5x45, 5x45, 5x95, 5x135, 5x185lb and then 5x5 225lb."

Read the example against the rule: two sets at the empty bar, then 95, 135, 185
— jumps of 50, 40, 50, then 40 to the work weight. **The stated 45 lb cap is
violated by the vendor's own example on two of the four jumps.** The generator
is therefore not a pure cap; more likely a plate-aligned ramp (45 → 95 → 135 →
185 is one 25 then successive 45 lb plate pairs) that the cap describes
approximately. **The cap is official; the mechanism is reverse-engineered here
and is not published.**

Two further published properties: set count scales with the work weight, not
with the lifter ("a 315lb Squatter more warmup sets than a 95lb Squatter"; "not
determined by your sex"), and the output is **fixed** — "It's not possible to
edit the warmup sets or weights."

### 3.2 The rest timer is outcome-aware

| Timer            | Default | Vendor's stated rationale                                                                                    |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| Timer Success    | 3 min   | —                                                                                                            |
| Timer Failure    | 5 min   | "gives your energy stores more time to fully recover. It makes it less likely to fail again on the next set" |
| Warm-up sets     | none    | "because the weights are light"                                                                              |
| Last warm-up set | 3 min   | so you can rest before the hardest warm-up set                                                               |

It also supports **overlapping notifications** ("a notification at 1m30" and
"3min"), telling the lifter when rest is _adequate_ and again when it is
_complete_.

This is the most interesting piece of app design in the family: the rest
prescription is a **function of the previous set's outcome**, not a constant.
That makes rest a third thing the state machine writes, alongside load and rep
target. The vendor attaches an uncited physiological claim to it — see §7 and
the laundering list.

### 3.3 Plate calculator — paid, and correctly separated from progression

> "The Plate Calculator shows at the top (Pro feature)."

Configuration is a **per-plate inventory** ("Enter the weight of the plate and
how many you have") plus an adjustable bar weight, so it cannot propose an
unloadable weight. The consequence the vendor spells out is the important one:

> "If your increments are set to 5lb, then the weight will increase by 5lb
> regardless of your plate setup."

**Loadability and progression are independent concerns.** Owning 1 lb plates
does not change the increment; changing the increment does not check
loadability. Any program engine faces the same fork — emit the _arithmetic_ next
weight or the nearest _loadable_ one — and StrongLifts emits the arithmetic one
and shows loadability separately.

### 3.4 Auto-increment, auto-deload, and what is configurable

Increment and deload are both applied automatically, with the §2.4–2.5 defaults,
and three settings are exposed per exercise ("Tap Start Workout > Tap the weight
of the exercise > Scroll down to the progression settings"): **increment
amount**, **deload amount**, **frequency**. "Same weight next time" is not a
separate mode — it is the automatic consequence of the success predicate
failing.

### 3.5 Programs shipped in the app

From [stronglifts.com/app](https://stronglifts.com/app/): StrongLifts 5×5 in
**Basic, Plus, Lite, Mini, Ultra, Ultra Max**, **StrongLifts 5×5 Intermediate**,
and **Madcow 5×5** in **Classic, Alternate Lifts, Pause Lifts, Deadlift Focus**.
Per the vendor's program pages, _Lite_ is lower-volume for recovery-limited
lifters, _Mini_ is maintenance, _Plus_ drops squat frequency below 3×/wk and
moves the deadlift off squat day, and _Ultra_/_Ultra Max_ are 4- and 5-day
upper/lower splits. **No 5/3/1, nSuns, Texas Method, Starting Strength or PPL**
— the app implements exactly two program families, its own and Madcow's.

Also listed: automatic progression and deload, warm-up and plate calculators,
one-tap logging, the rest timer, Apple Watch logging, 100+ videos, custom and
replacement exercises, and charts for weight lifted, **estimated 1RM**, volume,
reps, consistency and personal records. Note the estimated-1RM chart: the app
**derives** a 1RM for display while the program needs no 1RM at all. That
dependency direction is right and worth copying — §5.3.

### 3.6 Pricing and tiering

Officially, from
[the upgrade article](https://support.stronglifts.com/article/98-buy-pro): **Pro
Monthly $11.99**, **Pro Yearly $59.99**, **7-day free trial** on the yearly
plan. The plate calculator is officially Pro.

⚠ **Not verified:** a third-party review reports further price points
($4.99/week, $29.99/quarter, $199.99 lifetime) and a broader free/paid split
("advanced analytics, custom workouts, an exercise library and warm-up sets" as
paid). **The vendor's own pages do not enumerate a Pro feature list** and the
app page marks nothing as paid. Any claim about what is free is **from reviews,
not the vendor**; only the plate calculator is recorded here as officially Pro.

---

## 4. The family, on the axes that matter

Seven programs, compared only on what a machine must express. Rep schemes are
for the main lifts; assistance work is omitted throughout.

| Program                | Main-lift scheme                                 | Progression trigger                   | Load basis                                                | Needs a training max?  | Needs AMRAP?                    | Failure / deload rule                                                        | Cycle length                     |
| ---------------------- | ------------------------------------------------ | ------------------------------------- | --------------------------------------------------------- | ---------------------- | ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| **StrongLifts 5×5**    | 5×5; deadlift 1×5                                | **Per session**, on all-reps-all-sets | Absolute kg added to last weight                          | No                     | No                              | Repeat weight; 3 consecutive fails → **−10 %**                               | 2 weeks (ABA·BAB)                |
| **Starting Strength**  | 3×5; deadlift 1×5; power clean 5×3 (phase 2)     | **Per session**                       | Absolute kg added to last weight                          | No                     | No                              | **Reset −10 %** (press −8–10 %) _and reduce the increment_                   | 2 weeks (A/B, presses alternate) |
| **GreySkull LP**       | 2×5 + **1×5+**                                   | **Per session**, on the AMRAP set     | Absolute kg added to last weight                          | No                     | **Yes** — and it is the rule    | <5 reps on the final set → **−10 %** on that lift                            | 2 weeks (3 days, lifts rotate)   |
| **Madcow 5×5**         | Ramped 5×5 Mon; 4×5 Wed; 4×5 + **1×3** + 1×8 Fri | **Per week**                          | **+2.5 % of Monday's top set**; ramp sets derived from it | No — a **5RM** to seed | No (a heavy triple, not AMRAP)  | Hold the weight next week; if most lifts stall, **reset several weeks back** | 1 week, open-ended               |
| **Texas Method**       | Volume 5×5 Mon; light 2×5 Wed; **1×5 PR** Fri    | **Per week**, on Friday's 5RM         | % of 5RM (≈90 % Mon, ≈80 % of Mon Wed)                    | No — a **5RM**         | No (a top single set of 5)      | Miss the Friday 5RM → repeat or reduce; resets are per-lift                  | 1 week                           |
| **5/3/1**              | 3 sets/wk: `5/5/5+`, `3/3/3+`, `5/3/1+`          | **Per 3-week cycle**                  | **% of training max**                                     | **Yes** — 85–90 % 1RM  | **Yes** — the `+` set           | <3 reps on the `+` set → **re-estimate 1RM from it and reset the TM**        | 3 weeks (4 with legacy deload)   |
| **nSuns 5/3/1 LP**     | 9 sets on the main lift incl. a **`1+`**         | **Per week**, from AMRAP reps         | **% of training max**                                     | **Yes**                | **Yes** — drives a lookup table | Below the minimum reps → reduce the TM next cycle                            | 1 week; 4/5/6-day variants       |
| **PPL (Metallicadpa)** | 5×5 with the last set an AMRAP-style `5+`        | **Per session**                       | Absolute kg added to last weight                          | No (1RM only to seed)  | Yes, as the trigger             | Reset on failure ⚠ (percentage not verified from the original post)          | 1 week (6 days)                  |

### 4.0 Provenance for the whole table, in one place

Three hosts refused this environment, so the rows above are **not** uniformly
sourced. Rather than repeat the caveat under each program, it is stated once:

| Program               | Primary source                     | Status here                                                                         |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| **StrongLifts**       | stronglifts.com + support site     | **Retrieved in full.** Every §2–§3 figure is from a page this note fetched          |
| **Madcow**            | the author's Geocities page        | **Retrieved in full** via the `oocities.org` mirror — the only original text read   |
| **Starting Strength** | startingstrength.com; the books    | `403` Cloudflare on three URLs. Figures from **search extracts of official pages**  |
| **Texas Method**      | _Practical Programming_ 3rd ed.    | Book **not read**; the official article is behind the same wall. Secondary guides   |
| **5/3/1**             | Wendler's books; his T-Nation post | T-Nation `403`, books **not read**. Figures from `thefitness.wiki`'s 5/3/1 primer   |
| **nSuns**             | the `r/nSuns` wiki                 | reddit **unfetchable**. TM table quoted from LiftVault; per-set percentages not got |
| **GreySkull**         | _The Greyskull LP_ 2nd ed. (2012)  | Paid e-book **not read**. Scheme corroborated across secondary write-ups            |
| **PPL**               | the original r/Fitness post        | reddit **unfetchable**. Failure rule **could not be verified** at all               |

### 4.1 Starting Strength (Rippetoe)

Phase 1 is **Squat 3×5, Bench Press or Overhead Press 3×5 (alternating between
sessions), Deadlift 1×5**, three times a week, for roughly 1–3 weeks; **Phase
2** introduces the **power clean 5×3** and moves the deadlift off every session.
The failure remedy is called a **reset**, not a deload, and it does two things
at once: cut the weight ~10 % (the press specifically 8–10 %) **and reduce the
increment going forward** — "if you've been going up 10 lbs you start going up 5
lbs".

That second half is the modelling point. Starting Strength's increment is
**mutable per-lift state**, not a constant. StrongLifts' is a setting the user
edits; Starting Strength's changes as a documented consequence of failing.

### 4.2 GreySkull LP (John Sheaffer / "Johnny Pain")

Three sessions a week, main lifts as **two sets of five then a final set of "5+"
taken to as many reps as possible**. Progression is per session on the AMRAP
set: hit 5 or more and add weight (**2.5 lb upper, 5 lb lower**); fall short and
reset that lift **≈10 %**. The commonly cited **double-increment rule** — if the
AMRAP set reaches **10 or more reps, add twice the usual increment** — is what
makes GreySkull genuinely different from StrongLifts: the increment is **a
function of the logged rep count**, so a single program expresses both slow and
fast progression without the lifter changing a setting.

⚠ The **10-rep double-increment threshold is secondary-only** and should be
treated as reverse-engineered from the community's implementations.

### 4.3 Madcow 5×5

The only program here whose original text this document retrieved, from the
surviving mirror of the author's Geocities page
([oocities.org/elitemadcow1](https://www.oocities.org/elitemadcow1/5x5_Program/Linear_5x5.htm)).
Madcow is a pseudonymous adaptation of **Bill Starr's** 5×5, and the
adaptation's whole point is moving the progression from per-session to
**per-week**.

| Day       | Prescription                                                  |
| --------- | ------------------------------------------------------------- |
| Monday    | Squat 5×5 · Bench 5×5 · Barbell Row 5×5 — ramped to a top set |
| Wednesday | Squat 4×5 · Incline or Military Press 4×5 · Deadlift 4×5      |
| Friday    | Squat · Bench · Row, each **4×5, 1×3, 1×8**                   |

Verbatim rules:

- **"weekly increases of 2.5% of your top set of 5 on Monday"** — a **percentage
  increment on the lifter's own last top set**, which is neither an absolute
  increment nor a percentage of a training max. A fourth load basis.
- Ramp: **"Jumps can be somewhere between 10-15% per set based on your top
  set"**, with the worked example 60/70/80/90/100 for a 100 lb top set.
  StrongLifts' rendering of the same program calls this a "12.5% set interval".
  So the ramp weights are **derived**, and the only authored number is the top
  set.
- Seeding: **"your 1 rep maxes or more ideally your real 5 rep max in each
  lift"**.
- Friday's top **triple becomes the following Monday's top set of five** — a
  forward carry between days within the cycle, which is state no per-lift
  "current weight" scalar can hold on its own.
- Friday's final set of 8 **"uses the weight from the 3rd set"** — a back-off
  set computed from a position in this session's own ramp.
- Failure: **"If you miss reps, keep the weight constant the next week."** Only
  when the **"majority of lifts are stalling"** do you "reset several weeks back
  and rebuild" — a **reset to a past weight**, not a percentage cut, and
  triggered at **program** rather than lift scope.
- Length: the published 9-week table is illustrative — **"this is not a 9 week
  program"**; run it "until it stops working."

Madcow alone therefore needs: a percentage-of-own-last-top-set increment, a
derived ramp, a cross-day carry, a back-off set referencing another set in the
same session, a program-scope stall trigger, and a weight history to reset into.
It is the hardest of the seven to express and the best stress test for §5.

### 4.4 Texas Method

A weekly volume/recovery/intensity split, from _Practical Programming for
Strength Training_ (Rippetoe & Baker). **Monday** is volume: 5×5 at roughly 90 %
of the current 5RM. **Wednesday** is a deliberately light recovery day (squat
2×5 at about 80 % of Monday's weight, the alternate press 3×5). **Friday** is
intensity: **a single set of 5 at a new 5-rep PR**. The weekly progression rule
is simply _beat last week's Friday 5RM_, and Monday's volume weight follows from
it.

Two model requirements are unique to this family. **A week has named roles**
(volume / recovery / intensity) whose loads are computed from one another, and
**the progression anchor is a measured performance** — a 5RM the athlete
actually lifted — rather than an estimate.

### 4.5 5/3/1 (Jim Wendler)

The cleanest specification in the family, and the reference implementation of a
**training max**.

- The **Training Max (TM)** is set at **85 % or 90 %** of the actual or
  estimated 1RM. Every prescribed weight is a percentage of the TM, never of the
  1RM.
- Three weeks of main work:

  | Week | Sets                                |
  | ---- | ----------------------------------- |
  | 1    | 5 @ 65 % · 5 @ 75 % · **5+ @ 85 %** |
  | 2    | 3 @ 70 % · 3 @ 80 % · **3+ @ 90 %** |
  | 3    | 5 @ 75 % · 3 @ 85 % · **1+ @ 95 %** |

  "The '+' for the last set indicates that it is an AMRAP set – As Many Reps As
  Possible."

- Per cycle: **press and bench +5 lb, squat and deadlift +10 lb** on the TM.
- Failure: **"If you get fewer than 3 reps, use that number to estimate your 1
  Rep Max, and reset your TM based on that for your next cycle."** The remedy is
  a re-estimation, which means the engine needs a **1RM estimator** — a
  dependency none of the absolute-increment programs have.
- The **fourth deload week (40/50/60 % × 5/5/5)** belongs to older editions.
  [thefitness.wiki](https://thefitness.wiki/5-3-1-primer/) states it plainly:
  "Past iterations of 5/3/1 involved a deload week every 4th week... it is
  outdated and no longer used." Secondary write-ups and every online calculator
  still present it as current. **Report both; the deload week is
  edition-dependent.**
- Templates change the supplemental and assistance layers, not the main-work
  percentages: **Boring But Big**, **5s PRO** (all main sets fixed at 5 reps,
  the `+` set removed — i.e. the same program with AMRAP switched **off**),
  **Beyond 5/3/1**. That 5s PRO exists proves AMRAP is a **per-template
  toggle**, not a property of the program.

### 4.6 nSuns 5/3/1 LP

A Reddit-originated 5/3/1 derivative that swaps the three-week cycle for a
**weekly** one and drives the TM directly from AMRAP performance. Nine sets on
the main lift including a `1+`, and the progression is an explicit table:

> "0-1 reps: increase TM by 0 pounds / 2-3 reps: increase TM by 5 pounds / 4-5
> reps: increase TM by 5 to 10 pounds / 6+ reps: increase TM by 10 to 15 pounds"

Four variants: **4-day, 5-day, 6-day squat-focus, 6-day deadlift-focus**.

This is the family's clearest statement that **the AMRAP rep count is a control
signal with a range, not a pass/fail**. Note also that two of the four rows give
a **range** for the increase — the rule is not fully deterministic even as
published, and any engine must either pick a point in the range or ask.

### 4.7 PPL (the r/Fitness "Metallicadpa" routine)

Six days a week — two push, two pull, two legs — with compound lifts on a `5×5`
where the last set is taken for extra reps, upper-body increments of ~2.5 kg and
lower-body ~5 kg, run indefinitely with session-to-session linear progression. A
1RM input is used only to **seed** the starting weights in the widely circulated
spreadsheet, not to compute ongoing loads.

### 4.8 What the comparison shows

Read down the columns rather than across the rows and the family collapses into
a small number of independent choices:

- **Trigger:** per session (4 of 7) · per week (2) · per 3-week cycle (1).
- **Load basis:** absolute increment on the last weight (4) · % of a training
  max (2) · % of a measured 5RM (1) · % of the lifter's own last top set
  (Madcow, 1). These are four distinct kinds, not four tunings.
- **Anchor required:** none (4) · training max, i.e. a stored estimate (2) ·
  measured rep max (2, overlapping).
- **AMRAP:** required and load-bearing (3) · absent (4) · **toggled by
  template** (5/3/1's 5s PRO) — so it cannot be a property of the program, only
  of a variant.
- **Failure remedy:** percentage cut (4) · reset to a past weight (1) ·
  re-estimate the anchor (2).
- **Failure scope:** per lift (6) · per program (Madcow's majority-stalling
  rule, 1).
- **Increment mutability:** constant (5) · reduced after a reset (Starting
  Strength) · doubled on a high AMRAP (GreySkull) · table-driven (nSuns).

Seven programs, seven distinct positions. There is no smaller expressible set.

---

## 5. What a program engine must be able to express

This is the load-bearing section, derived entirely from §4.8.

### 5.1 The eight requirements

1. **Per-lift independent progression state.** The unit of state is
   `(program instance, exercise)`, never the program. Six of seven programs
   scope failure to the lift, and Madcow — the exception — needs the per-lift
   states anyway to evaluate "the majority of lifts are stalling".
2. **A trigger granularity that is not the calendar.** Per completed session,
   per completed cycle, or per _N_ successful sessions (StrongLifts'
   configurable frequency). Never "week 7".
3. **Four load bases as a closed union.** Absolute delta; percentage of a stored
   training max; percentage of a measured rep max; percentage of the athlete's
   own previous top set. Collapsing any two of these loses a program.
4. **Fixed-rep and outcome-terminated sets side by side in one session**, with
   the outcome of the terminated set feeding the progression rule. 5/3/1's week
   1 is literally `5, 5, 5+` — two of one kind and one of the other.
5. **Fail-counting as persisted state.** A consecutive-failure counter per lift,
   with a documented reset condition (any success). Without it "three sessions
   in a row" is unimplementable.
6. **Three failure remedies, not one.** A percentage cut needs only the current
   weight. A **reset to a past weight** needs a **weight history** ("several
   weeks back"). An **anchor re-estimation** needs a **1RM estimator applied to
   a logged AMRAP set**. A single `deloadPct: number` field expresses one of the
   three.
7. **Alternating-day / cycle position as explicit state.** Which of A/B is next;
   which week of a 3-week cycle; which role (volume/recovery/intensity) today
   carries. Derivable from a session count only if no session is ever skipped,
   reordered or logged out of band — which is exactly what real logs do.
8. **Derived set weights within a session.** Madcow's ramp (10–15 % steps down
   from the top set), its 1×8 back-off ("the weight from the 3rd set"), Texas
   Method's Wednesday (≈80 % of Monday's), and the warm-up generator all compute
   one set's weight from another's. The authored quantity is one number per lift
   per session; the rest is a function.

### 5.2 A candidate type sketch

Written in this repo's idiom: closed `as const` vocabularies, discriminated
unions on `kind`, every quantity naming its unit. It deliberately reuses the
shipped `LoadTarget` and `ExerciseSetKind` from `app/utils/workout-schema.ts`
rather than inventing parallel ones.

```ts
/* ───────────────  The rule: authored once, then immutable  ─────────────── */

/** When does the load move? Never a calendar position — always an outcome.
 *  `everyNSessions` is StrongLifts' configurable frequency ("+2.5lb every
 *  three workouts"); `perCycle` is 5/3/1's three weeks. */
export type ProgressionTrigger =
	| { kind: 'perSession'; everyNSessions: number }
	| { kind: 'perWeek' }
	| { kind: 'perCycle'; weeksPerCycle: number }

/** What counts as having earned the increment. StrongLifts judges all 25 reps;
 *  Madcow and Texas Method judge only the top set; GreySkull, 5/3/1 and nSuns
 *  judge a rep count on the AMRAP set. */
export type SuccessPredicate =
	| { kind: 'allRepsAllSets' }
	| { kind: 'allRepsOnTopSet' }
	| { kind: 'minRepsOnAmrapSet'; minReps: number }

/** How far the load moves on success. The four bases are irreducible (§4.8). */
export type Increment =
	/** StrongLifts, Starting Strength, GreySkull, PPL, and 5/3/1's TM bump. */
	| { kind: 'absolute'; deltaKg: number }
	/** Madcow: +2.5 % of the lifter's own last top set of five. */
	| { kind: 'pctOfLastTopSet'; pct: number }
	/** nSuns: the delta is a lookup on the reps actually achieved. The published
	 *  ranges are collapsed to one value here — see §7 on that non-determinism. */
	| { kind: 'byAmrapReps'; table: { minReps: number; deltaKg: number }[] }
	/** GreySkull: the usual delta, doubled when the AMRAP set is generous. */
	| {
			kind: 'multipliedOnAmrap'
			baseDeltaKg: number
			atOrAboveReps: number
			factor: number
	  }

/** What happens on failure. Three structurally different remedies (§5.1.6):
 *  a cut needs only the current weight, a reset needs the weight history, and a
 *  re-estimation needs an estimator — named, because the number is only as good
 *  as the formula (`workouts-strength-and-other.md` §4.2). */
export type FailureRemedy =
	| { kind: 'cutPct'; pct: number }
	| { kind: 'resetToPastWeight'; sessionsBack: number }
	| {
			kind: 'reEstimateAnchor'
			estimator: 'epley' | 'brzycki'
			trainingMaxPct: number
	  }

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
	/** Consecutive failures tolerated before the remedy fires. StrongLifts: 3.
	 *  GreySkull and 5/3/1: 1 — the remedy is immediate. */
	failuresBeforeRemedy: number
	remedy: FailureRemedy
	onRemedy: IncrementAdjustmentOnFailure
	/** StrongLifts' 5×5 → 3×5 → 1×5 ladder would live here, as a `volumeLadder`
	 *  field rather than a variant of `remedy`. Deliberately absent: see §7.4. */
}

/* ─────────────  Where a session's weights come from (derived)  ───────────── */

/** One number per lift per session is authored; the rest compute (§5.1.8).
 *  `sameAsSet` is Madcow's 1×8 "weight from the 3rd set"; `pctOfAnotherDay` is
 *  Texas Method's Wednesday at ~80 % of Monday. */
export type SetWeightSource =
	| { kind: 'workingWeight' }
	| { kind: 'pctOfTrainingMax'; pct: number }
	| { kind: 'pctOfRepMax'; reps: number; pct: number }
	| { kind: 'pctOfTopSet'; pct: number }
	| { kind: 'sameAsSet'; setIndex: number }
	| { kind: 'pctOfAnotherDay'; dayId: string; pct: number }

export type ProgrammedSet = {
	/** The shipped union: 'reps'|'timed'|'amrap'|'toRir'|'velocityLoss'. */
	termination: ExerciseSetKind
	reps?: number
	weight: SetWeightSource
	/** The outcome-aware timer of §3.2: rest is a third thing the engine writes. */
	restAfterSuccessSec?: number
	restAfterFailureSec?: number
}

/* ───────────────  The state: persisted, one row per lift  ─────────────── */

export type LiftProgressionState = {
	exerciseId: string
	/** The absolute-increment families need only this. */
	currentWorkingWeightKg: number
	/** The percentage families need this instead — and it is per *exercise*,
	 *  which `DisciplineProfile`'s [athleteProfileId, discipline] key cannot
	 *  hold (already flagged against ADR 0005). */
	trainingMaxKg?: number
	/** §5.1.5. Reset to 0 on any success. */
	consecutiveFailures: number
	/** §5.1.6 remedy 2 reads this. Also the only honest way to show a lifter
	 *  why today's weight is what it is. */
	weightHistory: { sessionId: string; weightKg: number; succeeded: boolean }[]
	/** Starting Strength mutates its own increment. */
	currentIncrement: Increment
	deloadHistory: {
		sessionId: string
		fromKg: number
		toKg: number
		reason: FailureRemedy['kind']
	}[]
}

/** Cycle position must be stored, not counted (§5.1.7). */
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

Two notes on what the sketch deliberately does **not** do. **It does not model
assistance work** — every program in §4 has an accessory layer and none
progresses it by a published rule, so modelling it would be inventing one, the
failure mode [`workout-taxonomy.md`](workout-taxonomy.md) §4.3 warns about. And
**it does not put the load-basis choice on the program**: it is on the **lift**,
because StrongLifts' deadlift already differs from its squat on two axes (§2.2)
and Starting Strength's press has its own reset percentage (§4.1). A
program-level increment would be wrong on day one.

### 5.3 One derived-vs-stored decision worth naming

The StrongLifts app **displays** an estimated-1RM chart while the program itself
needs **no** 1RM (§3.5). 5/3/1 does the reverse: the training max is **stored**
because every prescription depends on it. Both are correct for their program,
and the distinction is exactly ADR 0035's rule one layer up — store the measured
value, derive the label. A 1RM computed for a chart is a display artefact and
can be recomputed freely; a **training max is authored state** with a provenance
and an edit history, because a lifter's whole cycle is wrong if it is wrong.
They should not share a field.

---

## 6. The state a program carries between sessions

Stated as the answer to one question: **what is the minimum that must be
persisted for "what do I lift today?" to be answerable after a cold start?**

| #   | State                         | Scope       | Needed by                                    | Why it cannot be derived                                                                                        |
| --- | ----------------------------- | ----------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | **Current working weight**    | Per lift    | All absolute-increment programs              | It is the accumulation of every past success and failure. Recomputable only by replaying the whole log.         |
| 2   | **Training max**              | Per lift    | 5/3/1, nSuns                                 | Authored (from a test or an estimate), then mutated per cycle. Not a function of any single session.            |
| 3   | **Consecutive-failure count** | Per lift    | StrongLifts (3), any fail-count rule         | Derivable from the log **only if every session is logged and ordered**; a skipped or partial session breaks it. |
| 4   | **Cycle position**            | Per program | A/B alternation, 3-week cycles, weekly roles | Counting sessions gives the wrong answer the first time a session is skipped, duplicated or back-filled.        |
| 5   | **Current increment**         | Per lift    | Starting Strength; StrongLifts' settings     | It is mutable state in one program and a setting in another. Either way it is not a constant.                   |
| 6   | **Weight history**            | Per lift    | Madcow's "reset several weeks back"          | A reset target that is a past weight has no closed form.                                                        |
| 7   | **Deload history**            | Per lift    | Every program, for **explanation**           | Not needed to compute the next weight; needed to answer "why did my squat drop 10 kg?" honestly.                |

Rows 1–6 are functional requirements. **Row 7 is a product requirement**, and
this repo has already decided how to treat it: the **Load Recompute Notice**
pattern — when stored numbers move under an athlete, say so once, as a notice,
never as an offer. A deload is exactly that event at a smaller scale. An engine
that silently drops the squat 10 % and shows the new number is the failure mode
that pattern exists to prevent.

Note what is **not** on the list. Nothing is a function of the date. A program
instance that has not trained for three months resumes exactly where it stopped,
because none of rows 1–7 decays. Whether it _should_ is a physiological question
this document does not answer, and none of the seven programs publishes a
detraining rule. **Do not invent one.**

---

## 7. Where these programs are honest, and where they are not

### 7.1 Honest: they all state that they end

Every program in the family says out loud that its progression stops working.
StrongLifts is the bluntest — "You can't add 5lb on the bar 2-3x/week forever.
It's unsustainable" — and Madcow's own page says to run it "until it stops
working". Starting Strength's entire novice/intermediate distinction is built
around the transition. None of them claims perpetual linear gains.

This is worth crediting because the underlying gradient is genuinely well
established: untrained lifters improve on the order of 15–30 % on a 1RM test in
twelve weeks, while trained lifters improve a few percent per **year**. A rule
that adds a fixed increment every session is a rule that works precisely as long
as that steep part of the curve lasts, and every one of these programs is
explicit that it is exploiting a temporary condition.

### 7.2 Not honest: the duration is never stated, anywhere

For all that, **not one of the seven official sources gives a duration or a
strength standard for its own end condition.** StrongLifts' plateau article
provides no timeline; its own text references "beginner gains" without attaching
a number. The widely repeated "3–6 months" figure appears only in third-party
write-ups. The consequence for a product is direct: **an app cannot honestly
tell a lifter when the program will stop working**, and should not try. What it
_can_ do is show the thing the athlete's own data says — increment frequency
falling, deloads clustering — and let the pattern speak. That is a derived
observation, not a prediction, and it is the same distinction ADR 0033 draws for
detection confidence.

### 7.3 Not studied: the rules themselves

The specific numbers in this document — 2.5 kg versus 5 kg, three failed
sessions versus two, −10 % versus −8 %, 90 % versus 85 % for a training max, 2.5
% per week for Madcow — are, without exception, **coaching conventions published
as program specifications**. A targeted search of the indexed literature found
no controlled comparison of any of them against a matched alternative. The
periodization literature has plenty to say about linear versus undulating
loading in general (which is the sibling document's territory, not this one's),
and **none** of it tests these programs as published.

The correct posture in-product follows the convention this corpus already uses
for named protocols: a program is reproduced **with its author's numbers and its
author's name attached**, and the app never presents those numbers as
evidence-based optima. A seeded "StrongLifts 5×5" that quietly uses 2 kg
increments because they seemed more sensible is not StrongLifts, in the same way
that a bodyweight 20/10 circuit is not Tabata.

### 7.4 The one rule this document refuses to state

The 5×5 → 3×5 → 1×5 ladder (§2.7, §7 below) is the most confidently repeated
StrongLifts rule in the secondary literature and it is absent from every
official page this document retrieved. It is entirely plausible that it was on
the site in an earlier edition — the program is nearly two decades old and has
been rewritten — but this document could not verify that (`web.archive.org` is
unreachable from this environment). Until someone reads an archived snapshot,
the rule's status is **unverified**, and an app that seeds it as StrongLifts'
rule is attributing a rule to an author who does not currently publish it.

---

## 8. Implications for trainm8

### 8.1 The shape of the gap

The repo has the **prescription** layer and does not have the **program** layer.
Concretely, `ExerciseSet` (post-ADR-0007 amendment) can already express every
single set in every program in §4: `LoadTarget` covers absolute, `pct1RM` and
`repMax`; `ExerciseSetKind` includes `amrap`; `effortCap` and `tempo` cover the
variants. **Not one prescription in this document is unrepresentable.**

What is missing is everything in §6 — seven pieces of per-lift state and a
cursor — plus the one thing that writes them: a **logged set outcome**. Both
absences were already identified from other directions
(`workouts-strength-and-other.md` §14.6 wants an `ExerciseSetLog`; ADR 0005 has
no per-exercise anchor), which is the encouraging part: the program engine needs
no new concepts beyond two the corpus has already asked for.

### 8.2 In cost order

| Gap                                                                 | Cost   | Unblocks                                                                              |
| ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| **`ExerciseSetLog`** — reps and load actually completed, per set    | Low    | Everything below. Also ADR 0019's strength adherence, which currently counts sessions |
| **Per-exercise anchor** (`trainingMaxKg`, `repMax`) with provenance | Low    | `pct1RM` stops resolving to nothing; 5/3/1 and nSuns become expressible               |
| **`LiftProgressionState`** — working weight, fail count, increment  | Medium | StrongLifts, Starting Strength, GreySkull, PPL — the four no-anchor programs          |
| **`ProgramCursor`** — A/B, week-in-cycle, weekly role               | Low    | Correct answers after a skipped session                                               |
| **`SetWeightSource`** — derived set weights within a session        | Medium | Madcow's ramp and back-off, Texas Method's light day, warm-up generation              |
| **Weight and deload history**                                       | Medium | Madcow's reset; the Load-Recompute-Notice-shaped explanation of a deload              |

### 8.3 Things this research says not to do

- **Do not express these programs as a Plan Outline segment.** ADR 0047's anchor
  and ramp is a function of the calendar; every program here is a function of
  the log. Forcing one into the other produces a plan that cannot answer its own
  central question (§1).
- **Do not put the progression rule on the program.** It belongs on the lift.
  StrongLifts' own deadlift already breaks a program-level rule on two axes
  (§2.2).
- **Do not derive the fail count from the session log at read time.** It is
  right only when the log is complete and ordered, which real logs are not (§6
  row 3).
- **Do not collapse the three failure remedies into a percentage.** A reset to a
  past weight and an anchor re-estimation are different computations with
  different dependencies (§5.1 requirement 6).
- **Do not seed a program with adjusted numbers under its published name**
  (§7.3).
- **Do not invent a detraining rule** for a paused program instance. No source
  in the family publishes one (§6).
- **Do not build a "1RM" field that serves both the chart and the training
  max.** One is derived and disposable, the other is authored state with
  provenance (§5.3).

### ADRs this research challenges

Each ADR below was read before being cited.

| ADR                                                                                   | What it decided                                                                                        | What the evidence says                                                                                                                                                                                                                                                                                                                                                            | Verdict                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **0047** Strength progresses by anchor and ramp; segment authors goal + sessions/week | A strength track derives a weekly sets target from a Season Anchor plus a Volume Ramp, indexed by week | Correct for the **plan** layer and untouched there. But it is **calendar-indexed by construction**, and all seven programs in §4 are **outcome-indexed**: the next weight is a function of the last logged session, not of a week key. A program is a second, orthogonal progression object the ADR's scope does not reach                                                        | **Amend** (add a scope)        |
| **0005** Athlete Profile & thresholds                                                 | Thresholds live on `DisciplineProfile`, keyed `[athleteProfileId, discipline]`                         | A **training max is per exercise** and 5/3/1 and nSuns are unrunnable without it. Same amendment `workouts-strength-and-other.md` §14.3 raises, reached from program mechanics instead of from the `%1RM` table. Additionally needs a **provenance** (tested / estimated-from-AMRAP / carried-from-last-cycle), not a flag                                                        | **Amend**                      |
| **0007** Step as a discriminated union (as amended)                                   | Five-valued `ExerciseSetKind` incl. `amrap`; `LoadTarget` union; `effortCap`; `tempo`                  | **Confirmed as sufficient for prescription** — every set in §4 expresses. Two additions: an **AMRAP set's logged rep count is a program input**, so it needs a home on the actual side; and Madcow's `1×8` "weight from the 3rd set" plus Texas Method's light day need a **set-references-another-set** weight source                                                            | **Amend** (small)              |
| **0002** Step quantification (duration XOR distance)                                  | A step quantifies duration or distance                                                                 | Unchallenged by this document. A strength set quantifies reps × load, which `ExerciseSet` already holds separately from the step; §5's requirements land on state and on weight derivation, not on step quantities. Listed because the brief expected a verdict                                                                                                                   | **Confirm**                    |
| **0003** Session-first authoring; Workout private 1:1 to Session                      | No template library; Workout belongs to one Session                                                    | The 1:1 decision survives and helps: a program **generates** a Workout per Session lazily. But a program is a **third** authoring source beside manual and generated, and it can only stamp shape ahead of time, never load                                                                                                                                                       | **Amend**                      |
| **0053** Season generation is deterministic behind the model-client seam              | A whole season is generated deterministically; the model sits behind a seam                            | **Strongly confirmed and extended.** These programs are _fully_ deterministic — no model needed at any point, ever. But they are **not stampable in advance**: week 6's weight is unknowable in week 1. Determinism and eager generation are separable properties and the ADR currently treats them together                                                                      | **Amend**                      |
| **0051** The Catalogue has four axes                                                  | Catalogue rows are indexed on four axes                                                                | A program is **not** a Catalogue row and should not be forced into one: a row is one session, a program is a sequence plus a rule plus state. It is a sibling entity that _references_ Catalogue rows for its sessions                                                                                                                                                            | **Amend** (scope note)         |
| **0019 / 0046 §4** Strength adherence is a Summary Count                              | Strength adherence counts sessions, because nothing records what was lifted                            | The same `ExerciseSetLog` this document needs for progression is the one that fixes adherence. Two features, one entity. Independent confirmation of `workouts-strength-and-other.md` §14.6                                                                                                                                                                                       | **Amend**                      |
| **0021** Personal Records as derived best efforts                                     | PRs derived from recorded activity, never stored                                                       | Generalises correctly to lifting: a 5RM and an estimated 1RM are **derived** best efforts. The exception is the **training max**, which is authored state, not a best effort, and must not be folded into the PR machinery (§5.3)                                                                                                                                                 | **Confirm** (with a carve-out) |
| **0033** Detection Confidence honesty bar                                             | `high\|medium\|low`, else nothing; return nothing rather than guess                                    | The right vocabulary for §7's problem. "This program will stop working in 3–6 months" is unsourced and should be refused; "your increments have fired less often each month" is a derived observation and can ship                                                                                                                                                                | **Confirm** (and extend)       |
| **0035** Store the measured value; derive the label                                   | Segment classification on the anchor channel; labels display-derived                                   | Applies one layer up as the derived-vs-authored fork in §5.3: an estimated 1RM for a chart is derived and disposable; a training max is authored                                                                                                                                                                                                                                  | **Confirm** (and extend)       |
| **0046** No load number spans incommensurable tracks                                  | Strength carries no TSS                                                                                | Untouched and independently unproblematic — nothing in a program engine wants a load number. It wants a weight and a rep count                                                                                                                                                                                                                                                    | **Confirm**                    |
| **0039** Domain-standard vocabulary; theory terms as synonyms                         | Canonical terms are what practitioners say; theory terms are recognized synonyms                       | Exactly the right pattern for this vocabulary. **Training max**, **deload**, **reset**, **AMRAP**, **working weight**, **top set**, **back-off set**, **microloading**, **stall** are all field-standard and should enter CONTEXT.md's register as-is. Note the collision: **deload** here means a per-lift −10 % cut on failure, where ADR 0047 uses it for a planned −50 % week | **Confirm** (and extend)       |

---

## Claims this document declines to launder

- **"StrongLifts 5×5 switches to 3×5 after two deloads, and to 1×5 after two
  more."** The most-repeated rule about this program, and it is on **none** of
  the official pages retrieved: not the failure article, not the plateau
  article, not the app's progression settings. Community-sourced or from a
  superseded edition of the site. Not stated here as StrongLifts' rule (§7.4).
- **"StrongLifts is where you go before Madcow, and Madcow before 5/3/1."** A
  folk hierarchy. The vendor's own plateau article routes to _Stronglifts 5×5
  Intermediate_ and presents Madcow as a separate program; nothing published
  orders the family.
- **"Add 2.5 lb to the overhead press."** Sound advice, widely given, and **not
  the app's default** — the app's default is 5 lb for everything, with the
  smaller press increment described as a setting to change and attached
  unconditionally only to a women's-progression note (§2.4).
- **"A beginner can add weight every session for 3–6 months."** Third-party
  write-ups only. No official source in the family attaches a duration to its
  own end condition (§7.2). The steep-then-shallow gain curve underneath it is
  real; the number is not published.
- **"~85 % of your energy is refilled after 1m30, ~90 % after 3 min, 95 % after
  5 min."** The app's stated rationale for its rest defaults, with no citation.
  Directionally the phosphocreatine resynthesis curve; the three-point table is
  unsourced and is not repeated here as fact (§3.2).
- **"The warm-up calculator never jumps more than 45 lb."** Stated officially,
  and contradicted by the vendor's own worked example on two of four jumps
  (§3.1). The plate-aligned mechanism proposed in §3.1 is **this document's
  inference**, not published.
- **"5/3/1 has a deload week."** Edition-dependent. Present in older iterations,
  described as "outdated and no longer used" by a current community reference,
  and still shown by essentially every online calculator (§4.5). Report the
  disagreement; do not pick.
- **A single "deload percentage" for the family.** −10 % (StrongLifts,
  GreySkull), −8–10 % (Starting Strength press), "several weeks back" (Madcow),
  and "re-estimate the training max" (5/3/1) are four different operations. A
  shared `deloadPct` field would launder three of them into the first.
- **That any of these progression rules is optimal, or tested.** No controlled
  comparison of any published increment, fail-count, deload percentage or
  training-max percentage against a matched alternative was found (§7.3).
- **nSuns' training-max table as a deterministic rule.** Two of its four rows
  publish a **range** (+5–10 lb, +10–15 lb). As published it does not determine
  a single next weight, and any implementation that appears to is making a
  choice the author did not (§4.6).
- **GreySkull's 10-rep double-increment threshold.** Consistently reported and
  **secondary-only**; the primary source is a paid e-book this document did not
  read (§4.2).

---

## Uncertainty and limitations

- **Three hosts were unreachable, and §4.0 tables which programs that affects.**
  `startingstrength.com` and `t-nation.com` returned **403** behind Cloudflare
  to both WebFetch and `curl` with a browser user agent; `reddit.com` is not
  fetchable at all. Five of the seven §4 rows therefore rest on secondary
  sources or on search-engine extracts of official pages. StrongLifts and Madcow
  do not.
- **`web.archive.org` is unreachable**, so no claim about what any of these
  sites said in an earlier edition could be checked. That is the specific reason
  §7.4 leaves the 3×5/1×5 ladder unresolved rather than dismissing it.
- **Four books are the real primary sources and none was read** — _Starting
  Strength_ (3rd ed.), _Practical Programming_ (3rd ed.), _The Greyskull LP_
  (2nd ed.), and Wendler's _5/3/1_ family. Where a rule traces to a book, the
  book is cited and the figure is marked as reported rather than read.
- **The app's behaviour was not observed.** All of §3 is from the vendor's
  support articles; nothing rests on running the app. Where those articles are
  silent — the exact warm-up algorithm, the full Pro feature list — this
  document says so rather than inferring from a review. Only the plate
  calculator is officially marked Pro.
- **nSuns' nine-set percentage table was not obtained** (only its TM progression
  table), and **PPL's failure rule could not be verified at all**. Both are
  absent rather than approximated.
- **The type sketch in §5.2 is untested.** It expresses all seven programs on
  paper and has not been implemented; the Madcow cross-day carry (Friday's
  triple becoming Monday's top set) is squeezed into `SetWeightSource` and may
  want its own concept.
- **No physiology is asserted anywhere in this document.** Whether linear
  progression is the right way to train a novice, how a training max should be
  estimated, and what volume a lifter should carry are out of scope — see the
  sibling notes named in the header.
- **The seven-program selection is the brief's, not a survey.** GZCLP, Wendler's
  beginner templates, Starr's original 5×5 and the Russian percentage-based
  tradition are absent. Adding them would add positions on the §4.8 axes but
  probably not a new axis: the four load bases and three failure remedies look
  closed for the beginner-barbell family specifically.

---

## References

**StrongLifts — program (official, all retrieved)**

- The Complete Workout Guide. <https://stronglifts.com/stronglifts-5x5/>
- Quick Start Guide. <https://stronglifts.com/stronglifts-5x5/workout-program/>
  — Workout A/B, the deadlift 1×5, starting weights, rest table, warm-up,
  increments.
- How to Progress. <https://stronglifts.com/5x5/progress/> — "5lb or less"; the
  deadlift's 10 lb; the women's overhead-press note.
- How to Overcome Failure. <https://stronglifts.com/stronglifts-5x5/failure/> —
  the definition of failure; "repeat the weight three times… Stop trying and
  deload"; "about 10%".
- How to Break Plateaus. <https://stronglifts.com/stronglifts-5x5/plateaus/> —
  "You can't add 5lb on the bar 2-3x/week forever"; the four-step change
  sequence; **no 3×5/1×5 ladder**.
- Intermediate <https://stronglifts.com/stronglifts-5x5/intermediate/> · Plus
  <https://stronglifts.com/stronglifts-5x5/plus/> · Lite
  <https://stronglifts.com/stronglifts-5x5/lite/> · Mini
  <https://stronglifts.com/stronglifts-5x5/mini/> · Ultra
  <https://stronglifts.com/stronglifts-5x5/ultra/>

**StrongLifts — app (official support, all retrieved)**

- Progression Settings. <https://support.stronglifts.com/article/71-progression>
  — 5 lb default; −10 % after three consecutive failed sessions; configurable
  frequency.
- Rest Timer. <https://support.stronglifts.com/article/39-timer> — 3 min success
  / 5 min failure; no warm-up rest; multiple timers; the uncited energy table.
- Warmup Calculator. <https://support.stronglifts.com/article/87-warmup> — the
  45 lb jump cap, the 225 lb worked example, non-editability.
- Plate Calculator.
  <https://support.stronglifts.com/article/154-plate-calculator> — "(Pro
  feature)"; plate inventory; increments independent of plates.
- Upgrade to Pro. <https://support.stronglifts.com/article/98-buy-pro> —
  $11.99/month, $59.99/year, 7-day trial.
- App page. <https://stronglifts.com/app/> — shipped programs and features.

**Madcow / Bill Starr**

- "Madcow". Bill Starr 5×5 — Madcow Intermediate or Linear Version. Original
  Geocities page, surviving mirror:
  <https://www.oocities.org/elitemadcow1/5x5_Program/Linear_5x5.htm> — **the
  only original program text retrieved in full**: the M/W/F layout, "weekly
  increases of 2.5% of your top set of 5 on Monday", "10-15% per set", the
  Friday triple → Monday carry, the 1×8 from set 3, "keep the weight constant
  the next week", "reset several weeks back", "this is not a 9 week program".
- StrongLifts' rendering. <https://stronglifts.com/madcow-5x5/workout/> — +5
  lb/wk squat and deadlift, 2.5 lb microloading, "12.5% set interval", the 5RM
  seed.
- Starr B. _The Strongest Shall Survive._ 1976. — the original 5×5; not read.

**Starting Strength / Texas Method** (all official URLs **403**)

- Programs. <https://startingstrength.com/get-started/programs> · Alter R, The
  Reset: Why and How.
  <https://startingstrength.com/article/the-reset-why-and-how> · Baker A,
  Understanding the Texas Method Intensity Day.
  <https://startingstrength.com/article/understanding-the-texas-method-intensity-day>
- Rippetoe M, Bradford S. _Starting Strength: Basic Barbell Training._ 3rd
  ed. 2011. · Rippetoe M, Baker A. _Practical Programming for Strength
  Training._ 3rd ed. 2013. — the primary sources for §4.1 and §4.4; neither
  read.

**5/3/1 / nSuns**

- 5/3/1 Primer. The Fitness Wiki (community reference).
  <https://thefitness.wiki/5-3-1-primer/> — the TM at 85–90 %, the three-week
  percentage table, "the '+' … AMRAP", +5/+10 lb per cycle, "fewer than 3 reps…
  reset your TM", the deload week as "outdated and no longer used".
- Wendler J. _5/3/1_ · _Beyond 5/3/1_ · _5/3/1 Forever._ — primary; not read.
  His T-Nation article "5/3/1: How to Build Pure Strength" — **403**.
- nSuns 531 Program Guide (LiftVault, secondary).
  <https://liftvault.com/programs/powerlifting/n-suns-lifting-spreadsheets/> —
  the TM progression table and the four day-count variants. The `r/nSuns` wiki
  is primary and unfetchable here.

**GreySkull / PPL**

- Sheaffer J ("Johnny Pain"). _The Greyskull LP._ 2nd ed.; 2012. ISBN
  978-0615635576. — primary; not read.
- The Greyskull LP. 70's Big; 2011.
  <https://70sbig.com/blog/2011/03/the-greyskull-lp/> — contemporary account;
  confirms reduced squat frequency, changed exercise order and "max reps on the
  last set", and defers the numbers to the e-book.
- GreySkull LP (LiftVault, secondary).
  <https://liftvault.com/programs/strength/greyskull-linear-progression-spreadsheet/>
  · Metallicadpa 6-Day PPL (LiftVault, secondary).
  <https://liftvault.com/programs/strength/metallicadpa-ppl-template/> — the
  original r/Fitness post is unfetchable here.

**In-repo**

- ADRs [0002](../adr/0002-step-quantification.md),
  [0003](../adr/0003-session-first-authoring.md),
  [0005](../adr/0005-athlete-profile-and-thresholds.md),
  [0007](../adr/0007-step-as-discriminated-union.md),
  [0019](../adr/0019-plan-adherence-planned-tss.md),
  [0021](../adr/0021-personal-records-derived-best-efforts.md),
  [0033](../adr/0033-detection-confidence-honesty-bar.md),
  [0035](../adr/0035-detected-segment-zone-classification.md),
  [0039](../adr/0039-manual-planning-authors-the-plan-outline.md),
  [0046](../adr/0046-no-load-number-spans-incommensurable-training-tracks.md),
  [0047](../adr/0047-strength-progresses-by-anchor-and-ramp.md),
  [0051](../adr/0051-the-catalogue-has-four-axes.md),
  [0053](../adr/0053-season-generation-is-deterministic-behind-the-seam.md)
- [`workouts-strength-and-other.md`](workouts-strength-and-other.md) — the 25
  strength sessions, the `%1RM ↔ reps` table and its error bars, RIR, VBT, and
  the `ExerciseSetLog` request this document independently reaches
- [`../wayfinder/manual-training-planning/380-strength-volume-landmarks.md`](../wayfinder/manual-training-planning/380-strength-volume-landmarks.md)
  — the per-muscle volume-landmark literature and RP's own numbers
- [`workout-taxonomy.md`](workout-taxonomy.md) §4.3 — the domain-standard vs
  invented test, and the rule against naming a protocol you did not reproduce
- `app/utils/workout-schema.ts` — `LoadTargetSchema` (line 215),
  `EXERCISE_SET_KINDS` (line 268), `ExerciseSetSchema` (line 364)
- `prisma/schema.prisma` — `model ExerciseSet` (line 593)
- `CONTEXT.md` — **Load Recompute Notice**, **Summary Count**, **Training
  Track**
