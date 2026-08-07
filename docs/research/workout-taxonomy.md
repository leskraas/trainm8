# Workout taxonomy and session archetypes

Research note. Compiled 2026-08-07. The cross-sport vocabulary of _what kind of
session is this_ — the archetype layer that sits above intensity zones and below
the plan.

> **Sibling documents.** This note is the cross-sport counterpart to
> [`workouts-running.md`](workouts-running.md) and
> [`workouts-swimming.md`](workouts-swimming.md), which catalogue ~50 running
> and ~45 swimming sessions in sport-specific detail. **Those catalogues are not
> repeated here.** Zone tables live in
> [`zones-and-thresholds.md`](zones-and-thresholds.md); the three-zone model,
> the Polarization Index and the session-goal-vs-time-in-zone fork live in
> [`intensity-distribution.md`](intensity-distribution.md); the TSS/rTSS/hrTSS
> maths lives in
> [`training-load-and-fitness-model.md`](training-load-and-fitness-model.md);
> the segmentation engine that this document's classifier consumes lives in
> [`interval-detection-and-data-platform.md`](interval-detection-and-data-platform.md).
> This note owns exactly one thing: **the archetype axis and its names.**

## TL;DR

- **trainm8 has an intensity axis wearing an archetype's name.** `WorkoutIntent`
  (`app/utils/workout-schema.ts:37`) is a 15-value enum —
  `recovery | endurance | tempo | threshold | vo2max | anaerobic | …` — and its
  first six members are, verbatim, the zone-label synonyms `zoneLabelToZone()`
  maps onto `TrainingZone` 1–5 in `app/utils/session-profile.ts:76`. ADR 0042
  already caught this once, at phase scope: "four of the six `Focus` members are
  already zone synonyms in this repo… it was the step-level zone vocabulary
  lifted to the phase". The same diagnosis applies at session scope. The
  consequence is concrete: **a 30-minute recovery jog, a 70-minute easy run and
  a 3-hour long run are all `intent: 'endurance'`**, a fartlek and a set of
  cruise intervals are indistinguishable, and there is no value at all for
  _brick_, _fartlek_, _long_, _race simulation_ or _steady_. Archetype and
  intensity are two axes and the app stores one.
- **The Norwegian double-threshold method is a distinct archetype, not a
  threshold variant, and it is now properly published.** Casado, Foster, Bakken
  & Tjelta (2023, IJERPH 20(5):3782) describe lactate-guided threshold interval
  training as **3–4 sessions per week** at a blood-lactate target of **2–4.5
  mmol·L⁻¹**, measured every 1–3 reps, plus one VO₂max session, inside 150–180
  km/week. Talsnes et al. (2024, Front Physiol 15:1428536) supply the direct
  mechanism for splitting the day: one 6×10 min session drifts physiologically
  where two 3×10 min sessions 6.5 h apart do not. Two things follow for this
  repo: the defining anchor is **internal (lactate), not pace**, and **4–5
  quality sessions a week** breaks the "2–3 quality sessions" convention that
  CONTEXT.md's **Quality Session Mix** is calibrated around.
- **Tabata is the most misnamed protocol in the field.** Tabata et al. (1996,
  MSSE 28(10):1327–1330) is 7–8 × 20 s at **~170 % of VO₂max** on a mechanically
  braked cycle ergometer, 10 s rest, **5 days/week for 6 weeks**, on trained
  speed-skaters, against a 4×/wk 70 % VO₂max control. It is a supramaximal
  anaerobic-capacity protocol on one modality. Tabata's own 2019 review (J
  Physiol Sci 69(4):559–572) restates the intensity requirement explicitly. "20
  s on / 10 s off at whatever you can manage, with bodyweight moves" is a
  different session, and naming it Tabata is a citation error the app should not
  reproduce.
- **Rest is not one thing, and the model has only one of the four forms.**
  `RestStep.durationSec` covers fixed rest. The literature and the field also
  specify rest as a **send-off / cycle time** (the residual — swimming's
  universal form, and per `workouts-swimming.md` §1.3.1 a portable-anchor
  construction Dick Bower invented in the 1980s), as **recovery-to-an-HR-value**
  ("until HR < 120"), and as **a distance or an act** ("jog back down", "200 m
  jog"). Each has a different failure mode and a different effect on total
  session duration: under a send-off the set's length is known before it starts;
  under HR-recovery it is not knowable at all. Seiler & Hetlelid (2005, MSSE
  37(9):1601–1607) is the only controlled evidence on the duration question and
  it says ~120 s of active recovery is the balance point for 4-minute work
  bouts.
- **The archetype label should be derived, not authored — and archetype, not
  zone, is the right unit for the Quality Session Mix.** ADR 0042's rule ("never
  authored, so no segment can be labelled for work it does not contain") is
  right and should extend down to the session. But a mix of `{Z4: 2}` cannot
  distinguish two cruise-interval sessions from one continuous tempo plus one
  race-simulation, which are different weeks; and CONTEXT.md explicitly excludes
  the long run from the mix ("the long run is volume"), so the mix cannot
  express a three-quality week whose third quality item is a fast-finish long
  run — the Hansons structure, and a large fraction of real marathon plans.

---

## 1. What "archetype" is, and why it is not "intent"

Three orthogonal axes describe a session. Conflating any two of them is the
recurring design error in this space.

| Axis               | Question it answers                           | Values                                     | In this repo                                                   |
| ------------------ | --------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| **Intensity**      | _How hard?_                                   | Z1–Z5 / I1–I5 / LT1–LT2 bands              | Shipped: `TrainingZone`, zone recipes, `IntensityTarget`       |
| **Structure**      | _What shape?_                                 | continuous, reps, alternating, progressive | Shipped: `Workout → Block → Step`, `repeatCount`               |
| **Archetype/role** | _What is this session **for**, in this week?_ | recovery, long, threshold, VO₂max, brick…  | **Absent.** `Workout.intent` is the intensity axis, relabelled |

The archetype is the product of the other two plus a _role in the week_. That
last part is why it cannot be computed from a single session's numbers alone: a
100-minute easy run is an **easy run** in a 120 km week and a **long run** in a
50 km week. Same telemetry, different archetype, and the difference is what a
plan is made of.

### 1.1 The evidence that `intent` is the zone axis

`WORKOUT_INTENTS` and `zoneLabelToZone()` side by side:

| `WorkoutIntent` | `zoneLabelToZone()` accepts | Resolves to |
| --------------- | --------------------------- | ----------- |
| `recovery`      | `'recovery'`                | Zone 1      |
| `endurance`     | `'endurance'`               | Zone 2      |
| `tempo`         | `'tempo'`                   | Zone 3      |
| `threshold`     | `'threshold'`               | Zone 4      |
| `vo2max`        | `'vo2max'`                  | Zone 5      |
| `anaerobic`     | `'anaerobic'`               | Zone 5      |

Six of fifteen intents are literally the same strings the zone mapper consumes.
Of the remainder, `neuromuscular` is a zone-5-adjacent adaptation word, four are
strength goals (which ADR 0047 has since resolved properly, as a **Strength
Goal**), `mobility` and `technique` are modality words, and only `race` and
`test` are genuine archetypes. **The enum is a zone ladder with two archetypes
and four strength goals bolted on.**

This is not a criticism of the original decision — ADR 0003 shipped
session-first authoring with no template library, and one coarse label was the
right size then. It is a statement that the archetype axis has never been
modelled, and that several later features (Quality Session Mix, Plan Outline
emphasis, Structure Detection's derived titles, any rebuilt plan generation)
each independently want it.

---

## 2. The canonical archetype inventory

Zone column uses both the three-zone model (Z1 = below LT1, Z2 = between, Z3 =
above LT2 — see `intensity-distribution.md` §1) and the Olympiatoppen **I1–I5**
ladder, because `olt-hr-5-run` / `olt-hr-5-bike` already ship those exact labels
in `app/utils/zones/recipes.ts` and they are what this app's Norwegian users say
out loud.

| #   | Archetype                                | Standard name (+ synonyms)                                                     | Norsk                                                    | Physiological target                                                                        | Duration           | Zone                               | Typical structure                                                                                   | Freq/wk        |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| 1   | **Recovery**                             | recovery run/ride/swim; regeneration; shakeout; _active recovery_              | _restitusjonsøkt_, _rolig jogg_, _restitusjonstur_       | Circulation and mood; **no adaptive stimulus intended**                                     | 20–45 min          | Z1 · I1 (bottom)                   | Continuous, flat, RPE 2–3, hard ceiling                                                             | 0–4            |
| 2   | **Easy / aerobic base**                  | easy run; base ride; LSD (long slow distance); _general aerobic_               | _rolig løping_, _rolig langkjøring_, _mengdetrening_     | Mitochondrial & capillary density, fat oxidation, tissue tolerance                          | 40–90 min          | Z1 · I1–I2                         | Continuous, conversational                                                                          | 3–6            |
| 3   | **Long**                                 | long run/ride/swim; _the long one_; overdistance                               | _langtur_, _langkjøring_                                 | Glycogen storage, capillarisation, durability, fuelling rehearsal, mental duration          | 90 min–5 h         | Z1 (Z2 tail if progressive)        | Continuous; **variants: progressive, fast-finish, with-quality**                                    | 1 (or 1/2 wks) |
| 4   | **Steady / aerobic endurance**           | steady state; aerobic endurance; Daniels `M`; _moderate_; extensive endurance  | _rolig hard langkjøring_, _jevn fart_, _I2-økt_          | LT1 velocity, fat/CHO crossover, aerobic durability at a real pace                          | 45–120 min         | Z1 top / Z2 bottom · I2            | Continuous or one long block; **below** LT2 by design                                               | 1–3            |
| 5   | **Tempo / sweet spot**                   | tempo; sweet spot; _steady tempo_; sub-threshold (cycling sense, 88–94 % FTP)  | _tempoøkt_, _I3-økt_                                     | Extend time-to-fatigue near LT2 at a sub-LT2 cost                                           | 45–90 min          | Z2 · I3                            | 2–3 × 15–25 min, or 30–60 min continuous                                                            | 1–2            |
| 6   | **Threshold / LT2**                      | threshold run; LT run; cruise intervals (Daniels); _comfortably hard_          | _terskeløkt_, _terskeldrag_, _I4-økt_                    | Raise velocity/power at LT2 (MLSS/FTP/CSS)                                                  | 45–80 min          | Z2 top · I4                        | 20–40 min continuous, or 4–6 × 5–10 min, 1–2 min float                                              | 1–2            |
| 7   | **Sub-threshold, lactate-guided**        | Norwegian threshold; double threshold; LGTIT; _controlled threshold_           | _terskeltrening_, _dobbel terskel_, _dobbeltøkt terskel_ | Maximal accumulated volume at 2–4.5 mmol·L⁻¹ with low central/peripheral fatigue cost       | 60–80 min ×2/day   | Z2, deliberately below LT2 · I3–I4 | 5–6 × 6 min / 10–12 × 1000 m / 25 × 400 m / 20 × (45 s–15 s)                                        | 2–4 sessions   |
| 8   | **VO₂max intervals (long reps)**         | VO₂max intervals; aerobic power; Daniels `I`; _hard intervals_                 | _intervall_, _harde drag_, _I5-drag_                     | Maximise time at ≥ 90 % VO₂max; stroke volume, cardiac output                               | 45–70 min          | Z3 · I5                            | 4–6 × 3–8 min, recovery 50–100 % of rep                                                             | 1–2            |
| 9   | **VO₂max intervals (short reps)**        | short intervals; micro-intervals; 30/15s, 30/30s, 15/15s                       | _korte drag_, _mikrointervall_                           | Same target, far lower blood-lactate and RPE cost per minute above 90 % VO₂max              | 45–65 min          | Z3 · I5                            | 3 series × 10–13 × (30 s on / 15–30 s off), 3 min between series                                    | 1–2            |
| 10  | **Anaerobic capacity / speed endurance** | speed endurance; lactate tolerance; anaerobic capacity; Daniels-adjacent       | _hurtighetsutholdenhet_, _melkesyretrening_              | Glycolytic power, H⁺/lactate buffering, tolerance                                           | 40–60 min          | Z3, supramaximal · above I5        | 4–8 × 30–90 s near-maximal, 2–6 × rep-length recovery                                               | 0–1            |
| 11  | **Neuromuscular / speed**                | strides; sprints; hill sprints; plyometrics; accelerations; _pickups_          | _stigningsløp_, _bakkesprint_, _spenst_, _fart_          | Motor-unit recruitment, stiffness, economy; **not** metabolic                               | +5–15 min appended | Not a metabolic zone               | 6–10 × 8–25 s, **full** recovery (10–20 × work)                                                     | 2–4            |
| 12  | **Fartlek**                              | fartlek (Sw., "speed play"); structured vs unstructured; surges                | _fartslek_, _naturlig intervall_, _lekbetont fart_       | Pace-change tolerance; a mixed stimulus deliberately not held constant                      | 40–75 min          | Mixed Z1–Z3                        | Unstructured: by landmark/feel. Structured: e.g. 8 × (2 min on / 2 min off) inside a continuous run | 0–1            |
| 13  | **Race simulation**                      | race-specific session; specific endurance; tune-up race; dress rehearsal       | _konkurransespesifikk økt_, _generalprøve_               | Rehearse the exact pace, fuelling, kit and pacing profile of the goal event                 | 60–150 min         | Event-dependent                    | Fractional race volume at 95–105 % goal pace, with race kit                                         | 1 / 2–3 wks    |
| 14  | **Test / time trial**                    | time trial; field test; benchmark; T-30 (swim); ramp test; critical-power test | _testløp_, _terskeltest_, _motbakketest_                 | Produce a **number** (threshold, CSS, VDOT, best effort) — the session's output is data     | 30–75 min          | Maximal for its duration           | Standardised warm-up → fixed maximal effort → cool-down                                             | 1 / 4–8 wks    |
| 15  | **Brick / combined**                     | brick; transition run; combined session; _combi_                               | _kombiøkt_, _kombinasjonsøkt_, _overgangsøkt_            | Cycle-to-run transition tolerance; the neuromuscular and ventilatory cost of the changeover | 60–180 min         | Mixed, usually Z1–Z2               | Discipline A → **minimal transition** → discipline B                                                | 0–1            |
| 16  | **Technique / drill**                    | technique session; skill session; drills; form work                            | _teknikkøkt_, _teknikktrening_                           | Motor pattern, efficiency; **load is a by-product, not the point**                          | 30–75 min          | Z1 mostly, unpriced                | Short repeats with feedback and rest; low continuous intensity                                      | 1–3            |

Strength sessions are a seventeenth family and are deliberately **not** in this
table: ADR 0046 and ADR 0047 settled that they carry no TSS and author a
**Strength Goal** (`hypertrophy | maximal-strength | power`) rather than an
endurance archetype. That is the correct boundary and this document does not
reopen it.

### 2.1 Notes where the table is lossy

**Recovery (#1) has the weakest evidence base of any archetype.** Van Hooren &
Peake (2018, Sports Med 48(7):1575–1595) conclude active cool-downs are "largely
ineffective for improving most psychophysiological markers of post-exercise
recovery"; the same reasoning applies to standalone recovery sessions, whose
justification is circulation, habit and mood rather than a measured adaptation.
It should still exist as an archetype — athletes do it, plans schedule it, and
its _defining property is a ceiling_ — but the app should not claim an
adaptation for it.

**Easy (#2) vs Long (#3) is a role distinction, not an intensity one.** They
occupy the same zone. The discriminator is duration relative to the athlete's
other sessions, which means the classifier in §6 needs weekly context.

**The long run has three named variants** that matter enough to be separately
addressable: the **progression long run** (three thirds, each faster), the
**fast-finish long run** (final 20–40 min at marathon effort), and the **long
run with embedded quality**. All three are coaching constructs (Pfitzinger &
Douglas; Hudson; Canova's _extension_ principle) with no controlled trial
establishing superiority over a flat long run ⚠. They are nonetheless the
sessions that decide whether the long run counts as a quality day — see §5.3.

**Sweet spot (#5) has no primary physiological source.** It is a coaching
construct from the power-meter tradition (Coggan & Allen's zone table plus the
observation that ~88–94 % FTP buys most of the threshold stimulus at a fraction
of the recovery cost; popularised by Frank Overton). It is now genuinely
domain-standard among cyclists — a coach will say it and be understood — but the
app should not attach a citation to it that does not exist. It maps to the top
of Coggan Z3 / bottom of Z4 and is a _dose_ argument, not a distinct adaptation.

**Steady (#4) is the archetype most often missing from software vocabularies**,
and its absence is why athletes end up calling everything either "easy" or
"tempo". It is Daniels' `M`, Olympiatoppen's I2, "steady state" in cycling, and
`rolig hard` in Norwegian club-speak. Casado et al. (2021, JSCR 35(9):2525–2531)
found volume of easy running and deliberate practice of short-interval and tempo
runs best predict world-class performance — the middle ground is real training,
not a mistake.

**Fartlek (#12) is a structure, not an intensity**, which is exactly why it
resists this taxonomy. Coined by Gösta Holmér (Sweden, 1930s); the Norwegian
_fartslek_ is the same word. Its defining feature is that the athlete, not the
prescription, chooses the boundaries. That has a data-model consequence: a
prescribed unstructured fartlek is **authored with no intensity target and no
rep geometry**, and any adherence check against it is meaningless.

**Brick (#15) already works in this model, and that is a genuine win.** ADR 0007
states it outright: "Brick workouts (e.g. bike → run) emerge naturally as one
Workout with cardio steps in different disciplines." The discipline-on-the-step
decision was correct. What is missing is only the _label_ — nothing marks the
session as a brick, so it cannot be counted, filtered or planned as one. The
transition itself is the physiologically interesting part (Millet & Vleck 2000,
BJSM 34(5):384–390: elevated energy cost and hyperventilation in the run
following cycling), and it is currently unrepresentable except as an
undifferentiated gap between two cardio steps.

---

## 3. The Norwegian threshold tradition, properly

This deserves its own section because it is (a) the most-cited endurance method
of the last decade, (b) the tradition this app's Norwegian users actually train
in, and (c) routinely misdescribed.

### 3.1 What it actually prescribes

The primary published description is **Casado A, Foster C, Bakken M, Tjelta LI
(2023)**, _Does Lactate-Guided Threshold Interval Training within a High-Volume
Low-Intensity Approach Represent the "Next Step" in the Evolution of Distance
Running Training?_ IJERPH 20(5):3782, doi:10.3390/ijerph20053782. Marius Bakken
— the athlete-physiologist who reverse-engineered and documented the model — is
a co-author, which makes this the closest thing to a primary source that exists.
Verbatim from the abstract:

> This training model consists of performing three to four LGTIT sessions and
> one VO₂max intensity session weekly. In addition, low intensity running is
> performed up to an overall volume of 150–180 km/week. During LGTIT sessions,
> the training pace is dictated by a blood lactate concentration target (i.e.,
> internal rather than external training load), typically ranging from 2 to 4.5
> mmol·L⁻¹, measured every one to three repetitions.

Four load-bearing details, each of which is routinely dropped in secondary
retellings:

1. **The anchor is internal.** Lactate sets the pace; pace does not set the
   lactate. Every pace-based rendering of this method (including the one
   `workouts-running.md` §5 performs deliberately, rows C3/C4) is a **lossy
   translation**, and that document flags it as such. The honest version needs a
   lactate channel.
2. **The measurement cadence is part of the protocol** — every 1–3 reps. Without
   it, the session is not lactate-guided; it is a pace session with a Norwegian
   name.
3. **The frequency is 3–4 threshold sessions plus one VO₂max session** — 4–5
   quality sessions per week. This is not the 2–3 convention (§5.2).
4. **It sits inside 150–180 km/week.** The volume is a precondition, not a
   detail. Casado et al. frame LGTIT as living _within_ a high-volume
   low-intensity approach.

Bakken's own published account
(<https://www.mariusbakken.com/the-norwegian-model.html>) gives the narrower
operating band the Ingebrigtsen practice is associated with — roughly **2.3–3.0
mmol·L⁻¹**, morning session at the lower end, afternoon at the higher — and the
canonical session formats: **5–6 × 6 min**, **10–12 × 1000 m**, **25 × 400 m**,
and **20 × (45 s on / 15 s off)**, with short floats rather than full
recoveries. ⚠ **Flag the discrepancy honestly**: Casado 2023 says 2–4.5
mmol·L⁻¹, Bakken says 2.3–3.0. They are describing the same family at different
grain (the wider band spans athletes and session types; the narrower is one
athlete-group's operating point). Do not present either as _the_ number.

### 3.2 Why split the day

**Talsnes RK, Torvik PØ, Skovereng K, Sandbakk Ø (2024)**, _Comparison of Acute
Physiological Responses Between One Long and Two Short Sessions of
Moderate-Intensity Training in Endurance Athletes_, Front Physiol 15:1428536,
doi:10.3389/fphys.2024.1428536, is the direct evidence: one 6 × 10 min session
versus two 3 × 10 min sessions separated by 6.5 h, time- and intensity-matched.
The single long session produced a **duration-dependent drift in physiological
responses**; the split did not. That is the mechanism for _dobbel terskel_
stated in one sentence: the same accumulated volume at a lower fatigue cost,
which is what permits 3–4 threshold sessions a week instead of 1–2.

**Tønnessen E, Sandbakk Ø, Sandbakk SB, Seiler S, Haugen T (2024)**, _Training
Session Models in Endurance Sports: A Norwegian Perspective on Best Practice
Recommendations_, Sports Med 54(11):2935–2953, doi:10.1007/s40279-024-02067-4,
interviewed twelve elite Norwegian coaches across Olympic endurance sports and
found the shared session grammar to be "a high accumulated volume, a progressive
increase in intensity throughout the session, and a **controlled, rather than
exhaustive, execution approach**." That last clause is the cultural difference
in one phrase, and it has a UI consequence: a plan that rewards "went harder
than prescribed" is measuring the wrong thing for this tradition.

Historical context: **Tjelta LI (2019)**, _Three Norwegian brothers all European
1500 m champions: What is the secret?_, Int J Sports Sci Coach 14(5):694–700,
doi:10.1177/1747954119872321 (with a corrigendum at
doi:10.1177/1747954119880993).

### 3.3 What this means for the app

- **Sub-threshold is a distinct archetype (#7), not a softer #6.** Its
  prescription, its frequency, its recovery cost and its progression rule are
  all different. Folding it into `threshold` loses the entire method.
- **There is no lactate channel.** `IntensityTarget` has seven kinds and none is
  `mmol/L`. Adding `{ kind: 'lactate', minMmol, maxMmol }` is a small,
  self-contained union member; it resolves against nothing (it is a _measured
  target_, like `hrBpm`) and renders as `@ 2.5–3.0 mmol`. Without it, the app
  cannot store the method's defining parameter, and any seeded "Norwegian
  threshold" template is a pace session with a borrowed name.
- **`daniels-pace-5` has one `T` band** (`app/utils/zones/recipes.ts:148`), so
  "0.4–0.8 mmol under threshold" has nowhere to land. The OLT recipe's I3/I4
  split is closer to the tradition's own grain and is already shipped.
- **Two sessions in one day is a scheduling shape the model handles** (two
  `WorkoutSession` rows on one date) **but the plan cannot express it** — a Week
  Pattern day is one workout, and a Quality Session Mix counts sessions without
  saying they may pair.

---

## 4. The naming problem

This repo has a documented rule — _use the term real athletes and coaches use;
never invent a name where a domain standard exists_ — and ADR 0039 already
applied it well once, keeping **Training Plan / Plan Outline phase / Training
Week** as canonical and recording macrocycle/mesocycle/microcycle as _recognized
synonyms, never UI or code terms_. That is exactly the right pattern for
archetype names too.

### 4.1 Norwegian glossary

Not translations — these are the words, and several have no clean English
equivalent. The app's Norwegian users will search for these.

| Norsk                       | Literally          | Means                                                                    | English standard             |
| --------------------------- | ------------------ | ------------------------------------------------------------------------ | ---------------------------- |
| **økt**                     | "session"          | Any single training session; the unit of planning                        | session / workout            |
| **rolig**                   | "calm"             | Easy. `rolig løping`, `rolig tur`. The default adjective for Z1          | easy                         |
| **restitusjon(søkt)**       | "restitution"      | Recovery; also the noun for the recovery _state_                         | recovery                     |
| **mengdetrening**           | "volume training"  | The accumulated easy-volume habit; a plan's aerobic bedrock              | base / volume work           |
| **langtur**                 | "long trip"        | The long run/ride. Note _tur_ implies outdoors and unhurried             | long run / long ride         |
| **langkjøring**             | "long driving"     | Long _continuous_ effort; more about continuity than about being easy    | long steady / continuous run |
| **terskel**                 | "threshold"        | LT2. `terskeløkt`, `terskeltrening`, `terskelfart`                       | threshold                    |
| **dobbel terskel**          | "double threshold" | Two threshold sessions in one day (§3)                                   | double threshold             |
| **drag**                    | "pull"             | **One repetition.** `6 drag på 3 minutter` = 6 × 3 min                   | rep / repetition             |
| **serie**                   | "series"           | **One set** of reps                                                      | set / series                 |
| **intervall(trening)**      | "interval"         | Hard reps. Unlike English, `intervall` implies _hard_ by default         | intervals (hard)             |
| **harde drag**              | "hard pulls"       | VO₂max-ish reps                                                          | hard intervals               |
| **bakkedrag**               | "hill pulls"       | Hill reps. Default assumption ≈ 1–3 min uphill, jog down                 | hill repeats                 |
| **bakkesprint**             | "hill sprint"      | 8–12 s maximal uphill, full recovery                                     | hill sprints                 |
| **motbakke / motbakkeløp**  | "against-hill"     | Uphill; an uphill race or sustained climb                                | uphill / uphill race         |
| **stigningsløp**            | "rising run"       | **Strides.** 15–25 s accelerating to fast-and-relaxed, then decelerating | strides                      |
| **fartslek**                | "speed play"       | Fartlek (the Swedish original is _fartlek_)                              | fartlek                      |
| **tempoøkt**                | "tempo session"    | Tempo. ⚠ Ambiguous in Norwegian too — often means _race-pace_, not LT    | tempo                        |
| **oppvarming**              | "warming up"       | Warm-up                                                                  | warm-up                      |
| **nedjogging / uttjogging** | "jogging down/out" | Cool-down (running-specific; the generic is _nedtrapping_/_avslutning_)  | cool-down                    |
| **pause**                   | "pause"            | Rest between reps                                                        | rest / recovery              |
| **I1 … I5**                 | "intensity 1–5"    | The Olympiatoppen zone ladder — **spoken aloud**: "en I4-økt"            | Zone 1–5 (OLT recipe)        |
| **testløp / terskeltest**   | "test run"         | Field test / time trial                                                  | test / time trial            |
| **kombiøkt**                | "combi session"    | Brick                                                                    | brick                        |
| **generalprøve**            | "dress rehearsal"  | Race-simulation session                                                  | race simulation              |

Two of these are load-bearing for the data model:

- **`drag` (rep) and `serie` (set) are the whole set/rep grammar in one pair**,
  and the app already has the structure (`Block.repeatCount` over steps) but no
  name for the two levels. §5.4.
- **I1–I5 is already shipped** in `OLT_HR_5_ZONES`, so the Norwegian zone
  vocabulary is a solved problem. Session _names_ are the unsolved half — which
  is precisely the amendment `workouts-running.md` §13.4 raises against ADR 0027
  A3 (notation language fixed to en-GB): glue words can stay English while a
  template's _name_ is content and can be bilingual.

### 4.2 Terms that collide, and must be disambiguated

| Term                         | Meaning A                                                       | Meaning B                                                                   | Resolution                                                                                                     |
| ---------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Tempo**                    | US distance running: ~1 h race pace, LT2, "comfortably hard"    | UK/track and Hansons: **goal race pace** (marathon pace) reps or continuous | Never use bare "tempo" as a stored value; store the archetype + anchor                                         |
| **Threshold**                | LT1 / aerobic threshold / first ventilatory threshold           | LT2 / MLSS / FTP / CSS / anaerobic threshold                                | The app means LT2 everywhere; say so, and never write "threshold" for LT1                                      |
| **Cruise interval**          | Running (Daniels): T-pace reps of 5–10 min with 1 min floats    | Swimming (Bower/Maglischo): the **send-off time** = threshold + ~10 s       | Genuine collision across two of this app's disciplines. Scope the term per discipline or avoid it in shared UI |
| **Interval**                 | English: any repeated structure, including easy ones            | Norwegian _intervall_: hard reps by default                                 | Prefer "reps"/"repeats" in shared UI; keep _intervall_ for the hard archetypes                                 |
| **Zone 2**                   | Three-zone model: everything below LT1 (i.e. all easy training) | Five-zone models: the _second_ band, which is not the same set of paces     | Never render a bare "Zone 2"; always name the recipe or the anchor                                             |
| **Recovery**                 | An archetype (session #1)                                       | The rest period inside an interval set                                      | Use "recovery" for the in-set rest and "recovery session" for #1                                               |
| **Long slow distance (LSD)** | Historical (Joe Henderson, 1960s–70s): a _method_               | Modern colloquial: any long easy run                                        | Prefer "long run" (#3) and "easy run" (#2); LSD is a synonym, not a value                                      |

### 4.3 Domain-standard vs invented

The test is simple and mechanical: **can you attach a coach, a book, a governing
body or a paper to the term?**

- **Domain-standard, keep:** recovery, easy, long run, steady, tempo, threshold,
  cruise interval, VO₂max intervals, fartlek, strides, hill repeats, hill
  sprints, brick, time trial, race simulation, over-under, ladder, pyramid,
  send-off, negative split, progression run, double threshold. Each traces to
  Daniels, Lydiard, Holmér, Bower/Maglischo, Canova, Bakken, Pfitzinger,
  Hansons, or the triathlon field.
- **Coach-coined but now genuinely standard, keep with a caveat:** _sweet spot_
  (no primary physiological source, §2.1), _polarized_ (Seiler's term; see
  `intensity-distribution.md` for how contested the evidence is),
  _sub-threshold_ (means slightly different things in cycling and in the
  Norwegian tradition).
- **Invented, do not use:** any name whose purpose is to sound energetic rather
  than to identify a physiological target. If a proposed session name would not
  be recognised by a coach who has never used this app, it is wrong. The
  particular smell to avoid: brand-flavoured compound nouns ("Threshold
  Builder", "Aerobic Accelerator", "Power Blast") and difficulty adjectives
  standing in for archetypes ("Crusher", "Sufferfest"). These are unsearchable,
  untranslatable, and destroy the one property a taxonomy exists to provide.
- **Attribution errors, which are worse than invention:** calling a bodyweight
  20/10 circuit "Tabata" (§6.3), calling any 4-minute interval session "4×4"
  without the 90–95 % HRmax anchor, calling a pace-based sub-threshold session
  "the Norwegian method" without the lactate measurement. A wrong citation is a
  claim; an invented name is only bad taste.

---

## 5. Session structure grammar

### 5.1 Warm-up / main set / cool-down

Universal across sports and the one part of the grammar every source agrees on.
It maps onto `Workout → Block[]` with no change: block 1 warm-up, block 2..n-1
the main set(s), block n cool-down.

- **Warm-up** — McGowan et al. (2015, Sports Med 45(11):1523–1546) is the
  reference review: active warm-up raises muscle temperature, speeds VO₂
  kinetics and increases preparedness; the appropriate length and content scale
  with the intensity of what follows. Practically: 10 min easy for a threshold
  session, 15–25 min plus strides and 2–3 build-ups for a VO₂max or race
  session, and _nothing_ before a recovery run. A warm-up longer than the main
  set is normal for #10 and #11 and is not a modelling error.
- **Main set** — the archetype-bearing part. This is the block a classifier and
  a title generator should read (which is what `deriveWorkoutTitle` already
  does: "the first repeat block… else the block carrying the longest single
  effort").
- **Cool-down** — Van Hooren & Peake (2018) found active cool-downs "largely
  ineffective for improving most psychophysiological markers of post-exercise
  recovery", with modest cardiovascular/lactate-clearance benefit over passive
  rest. The honest position: cool-downs are part of the grammar because athletes
  do them and they add volume, not because they are proven to aid recovery.

The repo's detection engine already emits this shape —
`MIN_WARMUP_COOLDOWN_SEC = 120` in `app/utils/structure-detection/constants.ts`
decides whether a tail becomes its own block — so warm-up/cool-down is one of
the few taxonomy concepts already round-tripping between prescription and
recording.

### 5.2 Work:rest ratios by archetype

Buchheit & Laursen (2013, Sports Med 43(5):313–338 and 43(10):927–954) is the
canonical statement of the problem and the source of the grammar itself: nine
independent programming variables — work-interval intensity and duration, relief
intensity and duration, exercise modality, number of reps, number of series, and
between-series recovery duration and intensity. Any archetype model that stores
fewer than these cannot round-trip a published protocol.

| Archetype                       | Work:rest                    | Rest intensity           | Rationale / evidence                                                                                                                                                                                                                                                         |
| ------------------------------- | ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #4 Steady, #5 Tempo             | 5:1 – 10:1, often continuous | Easy jog/spin            | The rest exists to break psychological monotony and let form reset, not to clear metabolites. Daniels' rule of thumb: ~1 min per 5 min of work                                                                                                                               |
| #6 Threshold / cruise intervals | 4:1 – 8:1                    | Easy, brief "float"      | Daniels' cruise-interval convention (~1 min per 5 min at T). Long enough rest defeats the purpose — the stimulus is _accumulated_ time near LT2                                                                                                                              |
| #7 Sub-threshold (Norwegian)    | 3:1 – 6:1                    | Short jog float, 15–60 s | 6 min/1 min, 1000 m/60 s, 45 s/15 s (Bakken). Floats are deliberately too short for full recovery — lactate is held in a band, not cleared                                                                                                                                   |
| #8 VO₂max, long reps            | 1:0.5 – 1:1                  | Active, ~70 % HRmax      | **Seiler & Hetlelid 2005** (MSSE 37(9):1601–1607): for 4-min work bouts, extending rest 1 → 2 min raised velocity; 2 → 4 min added nothing. "~120 s of active recovery may provide an appropriate balance." Helgerud's 4×4 uses 3 min at 70 % HRmax; Seiler's 4×8 uses 2 min |
| #9 VO₂max, short reps           | 1:0.5 – 1:1                  | Active, ~50 % vVO₂max    | 30/15 (Rønnestad), 30/30 and 15/15 (Billat). The short rest is what keeps VO₂ elevated between reps — that _is_ the mechanism                                                                                                                                                |
| #10 Anaerobic capacity          | 1:3 – 1:6                    | Walk or very easy jog    | Rep quality is everything; incomplete recovery converts the session into a lower-quality threshold session. Buchheit & Laursen Part II                                                                                                                                       |
| #11 Neuromuscular               | 1:10 – 1:20                  | **Full**, walk/stand     | 20 s stride / 60–90 s; 10 s hill sprint / 2–3 min. Paavolainen et al. (1999, J Appl Physiol 86(5):1527–1533) improved 5 km via economy and muscle power with explosive work, _replacing_ 32 % of endurance volume — dose is small and recovery is complete                   |
| #13/#14 Race sim, TT            | n/a                          | n/a                      | Continuous, or race-realistic splits                                                                                                                                                                                                                                         |
| #15 Brick                       | **0**                        | none                     | The transition is the point; any rest destroys the stimulus (Millet & Vleck 2000)                                                                                                                                                                                            |

⚠ **Honest limits on this table.** Seiler & Hetlelid 2005 is essentially the
only controlled comparison of relief duration at a fixed work duration in
trained endurance athletes, and it covers one work duration (4 min) in one
modality (running). Every other ratio above is convention distilled from named
protocols — defensible, widely reproduced, and _not_ independently validated.
Present them as coaching conventions with a citation for their origin, never as
optima.

### 5.3 How rest is specified — four forms, one field

`WorkoutStep` of `kind: 'rest'` carries `durationSec`. That is form (a).

| Form                          | Written as                                         | Total set duration knowable in advance? | Failure mode                                                       | In the model?                                                              |
| ----------------------------- | -------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| (a) **Fixed time**            | `2 min rest`, `90 s jog`                           | Yes                                     | Too much rest for the strong, too little for the weak              | **Yes**                                                                    |
| (b) **Send-off / cycle time** | `10 × 100 @ 1:40`                                  | Yes (`reps × sendOff`)                  | "Missing your interval" — swim time ≥ send-off, rest goes to zero  | **No.** See `workouts-swimming.md` §4.1                                    |
| (c) **Recovery to a value**   | `until HR < 120`, `until 60 % HRmax`               | **No**                                  | Cardiac drift makes later reps unreachable; the session never ends | **No**                                                                     |
| (d) **A distance or an act**  | `200 m jog`, `jog back down`, `walk to the bottom` | Roughly                                 | Terrain and fatigue change its duration                            | Partially (`distanceM` on a cardio step, but no "this is recovery" marker) |

Form (b) is the _default_ in swimming and unavailable; form (d) is the default
for hill reps (`bakkedrag` — "jog down" is the recovery, and its duration is a
consequence of the hill) and is currently modelled as either a fixed time (a
guess) or a cardio step indistinguishable from work. Form (c) is common in
cycling and in Norwegian club practice.

The clean fix is to make the rest step a small discriminated union of its own,
mirroring `IntensityTarget`:

```ts
type RestSpec =
	| { kind: 'time'; durationSec: number }
	| { kind: 'sendOff'; anchor: 'css'; offsetSecPer100m: number } // swim; see swimming §4.1
	| { kind: 'toHr'; belowBpm: number }
	| { kind: 'toHrPct'; ref: 'max'; belowPct: number }
	| { kind: 'distance'; distanceM: number }
	| { kind: 'act'; description: 'jogBack' | 'walkDown' | 'ridDown' }
```

with a **derived** `estimatedDurationSec` for planning arithmetic and an
explicit `durationKnown: boolean`, so a plan that cannot state a session's
length says so rather than fabricating one (the Unavailable Metric principle,
ADR 0008).

### 5.4 Set vs rep, and the two-level repeat

Universal: a **rep** (Norwegian _drag_) is one work bout; a **set** or
**series** (_serie_) is a group of reps sharing a recovery pattern; a session
has one or more sets. Written `3 × (13 × 30/15)` — three series of thirteen
reps, which is exactly Rønnestad's short-interval protocol.

The repo's `Block.repeatCount` over `Step[]` gives **one** level of nesting.
That covers `4 × (4 min → 3 min rest)` but not
`3 × (13 × (30 s → 15 s) → 3 min)`. Rønnestad's protocol, Lydiard's hill
circuit, and most swim main sets are two-level. ⚠ This is a real expressiveness
gap, but nesting blocks is a structural change with a large blast radius; the
cheaper interim is a `seriesRepeatCount` on the block plus a
`betweenSeriesRest`, which covers the two-level case without introducing
arbitrary recursion.

### 5.5 Named structural shapes

These are _shapes of the main set_, orthogonal to archetype — a ladder can be a
threshold session or a VO₂max session.

| Shape                        | Definition                                                                     | Norsk                      | Typical archetype | Note                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------ | -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Straight set**             | N identical reps                                                               | _rette drag_               | Any               | The default                                                                                                                                            |
| **Ladder (ascending)**       | Reps grow: 1-2-3-4-5 min                                                       | _stigende drag_            | #8, #6            | Rest usually grows with the rep                                                                                                                        |
| **Ladder (descending)**      | Reps shrink: 5-4-3-2-1 min                                                     | _synkende drag_            | #8, #10           | Finishes fast; good for pace-change tolerance                                                                                                          |
| **Pyramid**                  | Up then down: 1-2-3-2-1                                                        | _pyramide_, _pyramidedrag_ | #8, #12           | The Norwegian club standard for a mixed hard session                                                                                                   |
| **Over-under (criss-cross)** | Alternates just above and just below LT2, unbroken: 2 min @105 % / 2 min @95 % | _vekseldrag_               | #6                | Coaching construct; rationale is lactate shuttling/clearance under load. ⚠ No controlled trial found showing superiority over matched steady threshold |
| **Alternations / floats**    | Fast segment / slower-but-not-easy segment, unbroken                           | _cambio ritmo_ (It.)       | #7, #13           | Canova's signature; the "rest" is itself a training intensity                                                                                          |
| **Progression**              | Monotonically faster across the session                                        | _progressiv_               | #3, #4            | Long-run variant; teaches pacing and the fat→CHO transition                                                                                            |
| **Broken race**              | Race distance split into fractions at race pace with tiny rests                | _brutt konkurranse_        | #13               | e.g. 5 km as 5 × 1 km at 5 km pace, 60 s                                                                                                               |
| **Negative split**           | Second half faster than first                                                  | _negativ splitt_           | #3, #13, #14      | An execution intent, not a structure — belongs on the session, not the block                                                                           |

**These should be derived, not authored.** Every one of them is a function of
the step tree that already exists: a ladder is monotone rep durations, a pyramid
is up-then-down, an over-under is an alternation whose "recovery" step is above
Z1. Deriving them follows ADR 0042's own rule — "never authored, so no segment
can be labelled for work it does not contain" — and means the label is correct
by construction after any edit. The one exception is **negative split**, which
is an intent about execution rather than a property of the prescription.

---

## 6. Named, published protocols

Exact prescriptions. Each row is what the paper actually did, not what the
internet says it did.

| Protocol                   | Full prescription (as published)                                                                                                                                                                                          | Population / duration                                                        | Primary finding                                                                                                                                                | Citation                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Helgerud 4 × 4**         | 4 × 4 min at **90–95 % HRmax**, 3 min active recovery at **70 % HRmax**; 20 min warm-up at 70 % HRmax; **3 sessions/week**                                                                                                | Moderately trained men, 8 weeks; 4 arms (LSD, lactate-threshold, 15/15, 4×4) | 4×4 and 15/15 raised VO₂max ~5.5 % and ~7.2 %; LSD and threshold produced no significant change                                                                | Helgerud et al., MSSE 2007;39(4):665–671, doi:10.1249/mss.0b013e3180304570                           |
| **Helgerud 15/15**         | 15 s at 90–95 % HRmax / 15 s active recovery at 70 % HRmax, **47 reps**                                                                                                                                                   | Same study                                                                   | Equal to 4×4 for VO₂max; the "short intervals work too" arm that is usually forgotten                                                                          | Same paper                                                                                           |
| **Billat 30/30**           | 30 s at **100 % vVO₂max** / 30 s at **50 % vVO₂max**, run to exhaustion or a set count (commonly 12–20)                                                                                                                   | Trained runners, acute physiology                                            | Accumulates far more time **at** VO₂max than a continuous run at the same velocity                                                                             | Billat et al., Eur J Appl Physiol 2000;81(3):188–196, doi:10.1007/s004210050029                      |
| **Billat 15/15**           | 15 s / 15 s around critical velocity                                                                                                                                                                                      | Middle-aged runners                                                          | Maintained VO₂max for ~14 min                                                                                                                                  | Billat et al., Int J Sports Med 2001;22(3):201–208                                                   |
| **Seiler 4 × 8**           | 4 × 8 min at **self-selected maximal sustainable even effort** (≈ 10 km effort, RPE ~8), 2 min recovery; compared against 4 × 4 min (3 min rec.) and 4 × 16 min (2 min rec.), all self-paced                              | Trained cyclists, 7 weeks                                                    | 4×8 produced the largest gains — the finding is about **work duration at self-selected intensity**, not a prescribed %                                         | Seiler et al., Scand J Med Sci Sports 2013;23(1):74–83, doi:10.1111/j.1600-0838.2011.01351.x         |
| **Rønnestad 30/15 (2015)** | Short intervals vs effort-matched long intervals, **2 HIT sessions/week for 10 weeks**                                                                                                                                    | Cyclists                                                                     | SI raised VO₂max 8.7 ± 5.0 % vs LI 2.6 ± 5.2 %; ES 0.86–1.54 across the power profile                                                                          | Rønnestad et al., Scand J Med Sci Sports 2015;25(2):143–151, doi:10.1111/sms.12165                   |
| **Rønnestad 30/15 (2020)** | **3 series × 13 × (30 s work / 15 s recovery)**, **3 min between series**; vs LI = **4 series × 5 min, 2.5 min between**; effort-matched on RPE; 3 sessions/week × 3 weeks                                                | **Elite** cyclists (VO₂max 73 ± 4 mL·kg⁻¹·min⁻¹)                             | SI > LI for peak aerobic power (+3.7 % vs −0.3 %), power at 4 mmol (+2.0 % vs −2.8 %), 20-min mean power (+4.7 % vs −1.4 %); **no group difference in VO₂max** | Rønnestad, Hansen, Nygaard, Lundby, Scand J Med Sci Sports 2020;30(5):849–857, doi:10.1111/sms.13627 |
| **Tabata (actual)**        | **7–8 × 20 s at ~170 % VO₂max**, 10 s rest, on a **mechanically braked cycle ergometer**, to exhaustion; **5 days/week for 6 weeks**; control arm 60 min at 70 % VO₂max, 5 d/wk                                           | Trained male physical-education students / speed-skaters                     | +28 % anaerobic capacity **and** +7 mL·kg⁻¹·min⁻¹ VO₂max; the control raised VO₂max but not anaerobic capacity                                                 | Tabata et al., MSSE 1996;28(10):1327–1330, doi:10.1097/00005768-199610000-00018                      |
| **Tabata (metabolics)**    | Same 20/10 structure; measured the energetics                                                                                                                                                                             | —                                                                            | The protocol taxes **both** anaerobic and aerobic systems near-maximally — that is _why_ the intensity matters                                                 | Tabata et al., MSSE 1997;29(3):390–395, doi:10.1097/00005768-199703000-00015                         |
| **Norwegian LGTIT**        | **3–4 sessions/week** at **2–4.5 mmol·L⁻¹**, lactate measured **every 1–3 reps**, plus **1 VO₂max session/week**, inside **150–180 km/week**. Common formats 5–6 × 6 min · 10–12 × 1000 m · 25 × 400 m · 20 × (45 s/15 s) | World-class middle/long-distance runners                                     | Model description + mechanism (AMPK/calcium signalling, motor-unit recruitment at low metabolic cost)                                                          | Casado, Foster, Bakken, Tjelta, IJERPH 2023;20(5):3782, doi:10.3390/ijerph20053782                   |
| **Split MIT day**          | One 6 × 10 min session vs **two 3 × 10 min sessions 6.5 h apart**, time- and intensity-matched                                                                                                                            | 14 endurance athletes, acute                                                 | The single long session drifted physiologically; the split did not — the mechanism for _dobbel terskel_                                                        | Talsnes et al., Front Physiol 2024;15:1428536, doi:10.3389/fphys.2024.1428536                        |
| **Paavolainen explosive**  | **32 % of total training volume** replaced with explosive-strength work (sprints 5–10 × 20–100 m, jumps, plyometrics, leg-press/knee-extension at low load, high velocity), 9 weeks                                       | Elite cross-country runners                                                  | 5 km time improved via **running economy and muscle power**, with **no change in VO₂max**                                                                      | Paavolainen et al., J Appl Physiol 1999;86(5):1527–1533, doi:10.1152/jappl.1999.86.5.1527            |

### 6.1 Reading the four VO₂max protocols together

They disagree, and the disagreement is the useful part:

- Helgerud prescribes **%HRmax** (external control on an internal signal).
- Seiler prescribes **self-selected maximal sustainable effort** and the finding
  is that the _duration_ choice dominates. Re-expressing 4×8 as "% of vVO₂max"
  breaks the mechanism.
- Billat prescribes **% vVO₂max** (velocity), and the goal metric is _time
  accumulated at VO₂max_, not the workout itself.
- Rønnestad prescribes **structure** (30/15, three series) and effort-matches on
  RPE, and finds short intervals beat long ones for elite cyclists.

Four different anchor families for one adaptation. `workouts-running.md` §2
makes the same point for the anchor model; the taxonomy consequence is that **an
archetype cannot own an anchor kind**. A stored archetype must be independent of
how intensity was prescribed, or half the literature becomes unstorable.

### 6.2 The 4×4 / 4×8 / 30-15 practical picture

There is no evidence that one is universally superior. Helgerud's population was
moderately trained; Seiler's was trained cyclists at self-selected effort;
Rønnestad's 2020 population was elite (VO₂max 73). The defensible synthesis: in
**already-elite** athletes, short intervals appear to deliver more per session
(Rønnestad 2015, 2020; and note Rønnestad 2020 found _no_ VO₂max difference —
the gains were in power at threshold and 20-min power); in less-trained
athletes, 4×4 has the strongest single-study record for raising VO₂max. Do not
present a ranking.

### 6.3 The Tabata myth, explicitly

| The myth                                      | The paper                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "Tabata is 8 rounds of 20 s work / 10 s rest" | The structure is right; the **intensity (~170 % VO₂max) is the protocol**, and it is what is dropped |
| "Any exercise works — burpees, squats"        | Mechanically braked **cycle ergometer**. Modality determines whether 170 % VO₂max is even achievable |
| "It's a 4-minute workout"                     | 6 weeks, **5 days/week**, plus warm-up, plus a separate steady-state day in the original design      |
| "It's a fat-burning / general-fitness method" | It is an **anaerobic capacity** protocol; the VO₂max gain was the surprise, not the aim              |
| "It's better than steady state"               | It was better than the control **for anaerobic capacity**. The control also raised VO₂max            |

Tabata's own 2019 review (_Tabata training: one of the most energetically
effective high-intensity intermittent training methods_, J Physiol Sci
69(4):559–572, doi:10.1007/s12576-019-00676-7) restates the intensity
requirement. **Practical rule for this app: never label a session "Tabata"
unless the prescription carries a supramaximal anchor.** If a user names it
that, fine — it is their session title. If the _app_ generates it, it is a false
citation. Archetype #10 (anaerobic capacity) is the honest classification of a
20/10 set.

---

## 7. Archetype ↔ load

### 7.1 Expected duration, IF and TSS per archetype

TSS from `IF² × hours × 100`. These are **planning-budget estimates for a
notional intermediate athlete, ±25 %**, and must never be surfaced as precise
(the same caveat `workouts-running.md` §1 attaches to its per-row figures).

| #   | Archetype                   | Session duration | Typical IF | TSS range | Notes                                                                                                                                         |
| --- | --------------------------- | ---------------- | ---------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Recovery                    | 20–45 min        | 0.50–0.60  | 10–25     | The archetype most damaged by a load model: a 30 min recovery jog and a 30 min tempo differ 4× in TSS but ~1× in perceived cost to a beginner |
| 2   | Easy                        | 40–90 min        | 0.62–0.72  | 25–65     | The bulk of weekly TSS in any high-volume plan                                                                                                |
| 3   | Long                        | 90 min–5 h       | 0.65–0.78  | 85–350    | Highest single-session TSS in almost every plan. Fast-finish variants add 20–40                                                               |
| 4   | Steady                      | 45–120 min       | 0.75–0.85  | 45–130    | —                                                                                                                                             |
| 5   | Tempo / sweet spot          | 45–90 min        | 0.80–0.90  | 55–110    | The best TSS-per-hour ratio short of threshold; that is its whole rationale                                                                   |
| 6   | Threshold                   | 45–80 min        | 0.85–0.95  | 60–110    | —                                                                                                                                             |
| 7   | Sub-threshold (per session) | 60–80 min        | 0.82–0.90  | 65–95     | **×2 on a double day → 130–190 TSS/day**, which is long-run territory from two "moderate" sessions                                            |
| 8   | VO₂max, long reps           | 45–70 min        | 0.85–0.95  | 65–100    | TSS badly under-prices this relative to its recovery cost — a known TSS limitation                                                            |
| 9   | VO₂max, short reps          | 45–65 min        | 0.82–0.92  | 55–90     | Under-priced further: NP/IF smooths the 30 s peaks                                                                                            |
| 10  | Anaerobic capacity          | 40–60 min        | 0.75–0.90  | 40–80     | The worst TSS fit of any archetype. Recovery cost is days; TSS says "easier than a tempo"                                                     |
| 11  | Neuromuscular               | +5–15 min        | negligible | **+3–10** | **Must not flip a day's classification.** Strides appended to an easy run leave it an easy run                                                |
| 12  | Fartlek                     | 40–75 min        | 0.75–0.88  | 45–95     | Wide by construction                                                                                                                          |
| 13  | Race simulation             | 60–150 min       | 0.85–1.00  | 90–200    | —                                                                                                                                             |
| 14  | Test / time trial           | 30–75 min        | 0.95–1.05  | 60–110    | IF ≈ 1.0 by definition for a ~1 h maximal effort — that is what threshold _means_                                                             |
| 15  | Brick                       | 60–180 min       | 0.70–0.85  | 70–180    | Sum of the parts; the transition itself is unpriced                                                                                           |
| 16  | Technique                   | 30–75 min        | 0.55–0.70  | 20–50     | Load is a by-product; pricing it can mislead a plan into thinking work was done                                                               |

**The systematic bias worth stating plainly:** TSS under-prices archetypes #8,
#9 and #10 relative to their recovery cost, and over-prices #3 relative to its.
This is not a bug in the implementation — it is a property of `IF² × hours` —
and it is the reason a plan should budget by **archetype count**, not only by
TSS. The Quality Session Mix already encodes this instinct; §7.3 argues it
encodes it at the wrong grain.

### 7.2 How a week mixes archetypes

The conventions, with their sources and their disagreements:

| Convention                     | Source                                       | Says                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2–3 quality sessions/week**  | Daniels ("Q" days); broad coaching consensus | Two hard days plus a long run for most; three for advanced. Daniels also caps `I` work at 8 % of weekly volume (or 10 km) and `R` work at 5 % (or 8 km)                          |
| **Hard/easy alternation**      | Bill Bowerman (Oregon), 1960s                | Never two hard days consecutively; the easy day is what makes the hard day possible                                                                                              |
| **Three "SOS" days**           | Hansons                                      | Speed/strength, tempo (at goal MP), and long — with the long run _capped_ so it is one of three, not the whole week                                                              |
| **80/20 by session goal**      | Seiler; Fitzgerald                           | ~80 % of _sessions_ easy. See `intensity-distribution.md` §5 — this is a **session-goal** claim and must not be applied to time-in-zone                                          |
| **4–5 quality sessions/week**  | Casado et al. 2023 (Norwegian LGTIT)         | 3–4 threshold + 1 VO₂max, at 150–180 km/week. **Directly contradicts the 2–3 convention** — because the threshold sessions are deliberately sub-maximal and split across the day |
| **Controlled, not exhaustive** | Tønnessen et al. 2024                        | Elite Norwegian coaches' shared execution principle across all Olympic endurance sports                                                                                          |

The apparent contradiction resolves: **the quality-session budget is a function
of how hard the quality sessions are.** Two exhaustive VO₂max sessions cost more
than four controlled sub-threshold sessions. A plan model that counts sessions
without recording their archetype cannot represent this, and will either forbid
the Norwegian week or permit an unsurvivable one.

A defensible weekly skeleton generator, stated as archetype counts:

```
week(level, phase, goal):
  long        = 1                                    # 1 per 1–2 wks in a recovery week
  quality     = { beginner: 1–2, intermediate: 2–3, advanced: 3 }[level]
                # ...unless the athlete's tradition is #7, where quality = 3–5
                # and each quality session is capped at "controlled" execution
  neuromuscular = 2–4   # appended; never counted against `quality`
  remainder   = easy / recovery, filling the volume target
  constraint  : no two `quality` days adjacent, EXCEPT a #7 double, which is
                one day with two sessions
  constraint  : `long` counts as `quality` iff it carries a Z2+ segment
                longer than ~20 min (progression / fast-finish / embedded MP)
```

### 7.3 Why zone-count is the wrong unit for the Quality Session Mix

CONTEXT.md defines the **Quality Session Mix** as "a multiset of **Training
Zone** → count", zones 3–5 only, and explicitly excludes the long run: "_ours is
intensity only, and the long run is volume_". ADR 0042 §3 is right that the mix
should be authored and the distribution derived, and right that counting
sessions is Seiler's session-goal method rather than time-in-zone. Two problems
remain, and both are archetype-shaped:

1. **`{Z4: 2}` is ambiguous across four physiologically different weeks.** Two
   continuous tempos; two sets of cruise intervals; one continuous tempo plus
   one over-under; two Norwegian sub-threshold sessions with lactate control.
   Same zone, same count, materially different recovery demand and adaptation. A
   mix of `{threshold: 1, subThreshold: 1}` says something; `{Z4: 2}` does not.
2. **The long run is excluded, so a very common week is inexpressible.** The
   Hansons structure is exactly three quality days one of which is the long run;
   a fast-finish long run with 30 min at marathon pace is unambiguously a hard
   day and will be budgeted as pure volume. The exclusion is defensible for a
   _flat_ long run (Daniels' broader "Q" sense is genuinely too broad) but
   becomes wrong the moment the long run carries a quality segment — which is
   precisely when it matters.

The minimal amendment: keep the mix authored and derived-emphasis, but make the
key an **archetype**, with the zone remaining derivable from it. That preserves
every property ADR 0042 argued for (authored, countable, session-goal, no
time-in-zone) and fixes both problems, because "is this a quality session"
becomes a property of the archetype rather than of a zone number the long run
happens not to reach on average.

---

## 8. Classification: inferring the archetype from a completed activity

### 8.1 What this can and cannot do

The inputs available in this repo are good: a `WorkoutDetection` already
reconstructs blocks, reps and recoveries with a `DetectionGrade`
(`app/utils/structure-detection/`), an `ActivityStream` gives time-in-zone, and
the athlete's `DisciplineProfile` gives the bands. What is _not_ available from
one activity is the **role in the week**, which is what separates easy from
long, and race simulation from threshold. So the classifier needs a small weekly
context object, and it must be allowed to answer "unclassified".

Three honesty rules, inherited from ADR 0033 and ADR 0008 and non-negotiable:

- **Return `unclassified` rather than guess.** An unstructured 50-minute run at
  mixed intensity is genuinely not an archetype.
- **Carry the confidence, and cap it at the weakest input.** If the detection
  grade is `low` or intensity was classified on HR, the archetype cannot be
  `high`.
- **Prefer the athlete's own statement.** If the session was planned with an
  archetype (or a detection matched a planned structure per ADR 0034), that wins
  outright — classification is for orphan recordings, not for overruling a plan.

### 8.2 Pseudocode

```
CONSTANTS (build-time calibration, tunable against the seeded corpus —
           the ADR 0033 convention: cut points are calibration, not domain)
  LONG_ABS_MIN_SEC        = 5400    # 90 min: nothing shorter is "long" for anyone
  LONG_REL_MULTIPLE       = 1.5     # ...or ≥1.5× the athlete's median session in 28 d
  RECOVERY_MAX_SEC        = 2700    # 45 min
  RECOVERY_MAX_IF         = 0.62
  EASY_MAX_Z3_FRAC        = 0.02    # a stray 2% above LT2 does not make a run hard
  QUALITY_MIN_Z2PLUS_SEC  = 480     # 8 min above LT1 before a session is "quality"
  TEMPO_BAND              = (0.80, 0.90)   # session IF
  THRESH_REP_SEC          = (240, 1500)    # 4–25 min reps read as threshold
  VO2_LONG_REP_SEC        = (150, 600)     # 2.5–10 min
  VO2_SHORT_REP_SEC       = (15,  75)      # 15–75 s
  ANAEROBIC_REP_SEC       = (20,  120)
  NEURO_REP_SEC           = (5,   30)
  NEURO_MAX_TOTAL_WORK    = 300     # 5 min of total work: above this it is a real set
  NEURO_MIN_REST_RATIO    = 6       # rest ≥ 6× work → full recovery → neuromuscular
  SUBTHRESH_MAX_MEAN_ZONE = 4.0     # sub-threshold sits at the Z3/Z4 seam, not above
  SUBTHRESH_MIN_REPS      = 5
  SUBTHRESH_MAX_REST_RATIO= 0.35    # floats, not recoveries
  FARTLEK_MIN_REP_CV      = 0.35    # irregular rep durations → speed play, not a set
  RACE_SIM_MIN_COVERAGE   = 0.50    # ≥50% of moving time at goal-race intensity
  TT_MIN_IF               = 0.95
  BRICK_MAX_GAP_SEC       = 600     # discipline change within 10 min = one brick

INPUT
  detection : { grade, blocks[], reps[{durSec, meanValue, zoneIdx}],
                recoveries[{durSec, meanValue}], coverage, motifKind }  # may be null
  tiz       : { z1Frac, z2Frac, z3Frac }        # three-zone, TIME-denominated
  session   : { movingSec, IF, disciplines[], disciplineSegments[], plannedArchetype? }
  context   : { medianSessionSec28d, longestSessionSec28d, weekLongRunTaken,
                goalEventPaceAvailable, goalEventPace }
  channel   : POWER | PACE | HEART_RATE            # what intensity was read from

FUNCTION classifyArchetype(...) -> { archetype, confidence, reasons }

  reasons = []

  # 0. The athlete's own statement wins. Classification is for orphans.
  IF session.plannedArchetype != null:
      RETURN { archetype: session.plannedArchetype, confidence: HIGH,
               reasons: ["prescribed"] }

  # 1. Multi-discipline with a tight transition -> BRICK, regardless of intensity.
  IF count(distinct session.disciplines) >= 2
     AND maxGapBetweenDisciplineSegments(session) <= BRICK_MAX_GAP_SEC:
        RETURN grade(BRICK, ["two disciplines, no break between them"])

  # 2. Maximal short effort with no structure -> TEST / TIME TRIAL.
  IF session.IF >= TT_MIN_IF AND detection?.motifKind IN {null, SUSTAINED}:
        RETURN grade(TEST_TIME_TRIAL, ["near-maximal sustained effort"])

  # --- 3. No structure found: fall back to duration + intensity only. ---
  IF detection == null OR detection.coverage < MIN_MOTIF_COVERAGE:

      IF tiz.z2Frac + tiz.z3Frac <= EASY_MAX_Z3_FRAC*2
         AND session.movingSec <= RECOVERY_MAX_SEC
         AND session.IF <= RECOVERY_MAX_IF:
            RETURN grade(RECOVERY, ["short, capped intensity, no structure"])

      IF isLong(session, context):
            RETURN grade(LONG, ["longest session in the window"])

      IF tiz.z3Frac <= EASY_MAX_Z3_FRAC AND tiz.z2Frac < 0.15:
            RETURN grade(EASY, ["continuous, almost all below LT1"])

      IF session.IF WITHIN TEMPO_BAND AND tiz.z2Frac >= 0.50:
            RETURN grade(TEMPO_STEADY, ["sustained between LT1 and LT2"])
            # deliberately merged: TEMPO vs STEADY is not separable from
            # telemetry alone. Report the merged class, not a coin flip.

      IF tiz.z2Frac + tiz.z3Frac >= 0.25 AND repVariabilityUnknown():
            RETURN grade(FARTLEK, ["mixed intensity with no detectable set"])

      RETURN { archetype: UNCLASSIFIED, confidence: NONE,
               reasons: ["no structure detected and no duration/intensity rule fits"] }

  # --- 4. Structure found. Read the rep geometry. ---
  reps       = detection.reps
  k          = count(reps)
  medDur     = median(rep.durSec for rep in reps)
  totalWork  = sum(rep.durSec for rep in reps)
  restRatio  = sum(rec.durSec) / totalWork
  meanZone   = durationWeightedMean(rep.zoneIdx for rep in reps)
  durCV      = stdev(rep.durSec) / medDur

  # 4a. Tiny reps, full recovery, trivial total work -> NEUROMUSCULAR.
  #     Checked FIRST so strides appended to an easy run do not read as a set.
  IF medDur WITHIN NEURO_REP_SEC
     AND totalWork <= NEURO_MAX_TOTAL_WORK
     AND restRatio >= NEURO_MIN_REST_RATIO:
        # ...and the *session* is still classified by what surrounds them.
        base = classifyIgnoringBlocks(reps, session, context, tiz)
        RETURN grade(base WITH modifier NEUROMUSCULAR,
                     ["short full-recovery efforts appended to a "+base])

  # 4b. Irregular reps -> FARTLEK. Regularity is what makes a set a set.
  IF durCV >= FARTLEK_MIN_REP_CV AND k >= 3:
        RETURN grade(FARTLEK, ["repeated efforts of irregular length"])

  # 4c. Many controlled reps at the Z3/Z4 seam with floats -> SUB-THRESHOLD.
  #     This must be tested BEFORE threshold: it is a *denser*, *easier* set,
  #     and folding it into threshold loses the whole Norwegian method.
  IF k >= SUBTHRESH_MIN_REPS
     AND meanZone <= SUBTHRESH_MAX_MEAN_ZONE
     AND restRatio <= SUBTHRESH_MAX_REST_RATIO
     AND totalWork >= 1800:                       # ≥30 min of accumulated work
        RETURN grade(SUB_THRESHOLD,
                     ["many controlled reps with short floats, at/below LT2"],
                     caveat: "cannot confirm without lactate — see §3")

  # 4d. Long reps at/near LT2 -> THRESHOLD.
  IF medDur WITHIN THRESH_REP_SEC AND meanZone >= 3.5 AND meanZone < 4.6:
        RETURN grade(THRESHOLD, ["long reps at threshold intensity"])

  # 4e. Mid reps above LT2 -> VO2MAX (long).
  IF medDur WITHIN VO2_LONG_REP_SEC AND meanZone >= 4.5:
        RETURN grade(VO2MAX_LONG, [k+" × "+fmt(medDur)+" above LT2"])

  # 4f. Short reps, short rests, many of them -> VO2MAX (short).
  IF medDur WITHIN VO2_SHORT_REP_SEC AND restRatio <= 1.2 AND k >= 8:
        RETURN grade(VO2MAX_SHORT, ["micro-intervals with incomplete recovery"])

  # 4g. Short reps, long rests, very high intensity -> ANAEROBIC CAPACITY.
  IF medDur WITHIN ANAEROBIC_REP_SEC AND restRatio >= 2.0 AND meanZone >= 4.8:
        RETURN grade(ANAEROBIC, ["near-maximal reps with long recoveries"])

  # 4h. Sustained block at goal race pace covering most of the session.
  IF context.goalEventPaceAvailable
     AND coverageAt(session, context.goalEventPace, tolerance=0.03) >= RACE_SIM_MIN_COVERAGE:
        RETURN grade(RACE_SIMULATION, ["majority of the session at goal race pace"])

  RETURN { archetype: UNCLASSIFIED, confidence: NONE,
           reasons: ["structure found but its geometry matches no archetype"] }

# ---------------------------------------------------------------
FUNCTION isLong(session, context) -> bool
  # Role, not intensity. Needs the window, which is why archetype is not a
  # pure function of one activity.
  RETURN session.movingSec >= LONG_ABS_MIN_SEC
     AND session.movingSec >= LONG_REL_MULTIPLE * context.medianSessionSec28d

FUNCTION grade(archetype, reasons, caveat=null)
  # Confidence is the MINIMUM of three grades — the same shape
  # intensity-distribution.md §7 uses, and the same vocabulary as
  # DetectionGrade / Load Confidence. Never a bespoke 0–1 score.
  structureGrade = detection?.grade ?? LOW
  channelGrade   = { POWER: HIGH, PACE: HIGH, HEART_RATE: MEDIUM }[channel]
  contextGrade   = context.medianSessionSec28d != null ? HIGH : LOW
  conf = min(structureGrade, channelGrade, contextGrade)
  IF caveat: conf = min(conf, MEDIUM)
  RETURN { archetype, confidence: conf, reasons, caveat }
```

### 8.3 Notes on the algorithm

- **Order is load-bearing and deliberate.** Neuromuscular is tested before every
  other structured branch so that 8 × 20 s strides at the end of an easy run
  cannot promote the day to a quality session — a requirement
  `workouts-running.md` §8 states explicitly and one that directly affects any
  session-goal TID computation. Sub-threshold is tested before threshold for the
  symmetric reason: it is the _denser_ pattern and the generic rule would
  swallow it.
- **Tempo and steady are deliberately merged into one returned class.** They are
  not separable from telemetry — the difference is the coach's intent about
  where LT1 and LT2 sit. Returning `TEMPO_STEADY` with a reason is honest;
  picking one is a coin flip wearing a label.
- **Neuromuscular returns a _modifier_, not a replacement.** "Easy run +
  strides" is the correct answer and a flat enum cannot say it. That argues the
  stored shape is `{ primary: Archetype, modifiers: Archetype[] }`, which also
  covers "long run with embedded marathon-pace"
  (`{ primary: LONG, modifiers: [RACE_SIM] }`).
- **`UNCLASSIFIED` is a real answer.** It should render as "no archetype
  detected", exactly as `WorkoutDetection` renders "no structure detected".
- **Race simulation needs a goal pace that does not exist yet** —
  `workouts-running.md` §13.3 makes the same finding from the authoring side.
  Until a goal pace is stored on the Event (ADR 0009 makes Event the plan
  anchor, so it is the natural home), branch 4h never fires.
- **Lactate is undetectable.** Branch 4c can identify the _shape_ of a Norwegian
  session but not the method, hence the mandatory caveat and the MEDIUM cap. The
  app must not tell an athlete they did a lactate-guided session when no lactate
  was measured.
- **Do not classify strength.** ADR 0046/0047 put strength on a different axis
  entirely, and detection already never runs for it
  (`DETECTION_DISCIPLINES = ['run','bike']`).

---

## 9. Implications for trainm8

### 9.1 Add an archetype axis; keep intent as the intensity axis

The smallest correct change is **not** to extend `WORKOUT_INTENTS` — that would
deepen the conflation. It is to add a second field:

```ts
export const SESSION_ARCHETYPES = [
	'recovery',
	'easy',
	'long',
	'steady',
	'tempo',
	'threshold',
	'sub-threshold',
	'vo2max-long',
	'vo2max-short',
	'anaerobic',
	'neuromuscular',
	'fartlek',
	'race-simulation',
	'test',
	'brick',
	'technique',
] as const
```

on `Workout` (authored or generated) and, derived, on a `WorkoutDetection`. The
existing `intent` then either (a) stays as the coarse zone word and is
**derived** from the archetype, removing a second source of truth, or (b) is
narrowed to the four strength values that ADR 0047 has since given a proper home
(`Strength Goal`), and retired for cardio. (a) is the smaller migration; (b) is
the cleaner model. Either way, **one of the two fields should stop being
authored.**

### 9.2 Six concrete gaps, in cost order

| Gap                                                                    | Cost   | Unblocks                                                                                              |
| ---------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `archetype` on `Workout` + `WorkoutDetection`                          | Low    | Everything below; plan budgeting; honest session titles; template filtering                           |
| Derived structural shape (ladder / pyramid / over-under / progression) | Low    | Better titles and better plan descriptions, computed from the existing tree                           |
| `{ kind: 'lactate', minMmol, maxMmol }` on `IntensityTarget`           | Low    | The Norwegian method's defining anchor; §3. A measured target like `hrBpm`, resolving against nothing |
| `RestSpec` union (send-off / to-HR / distance / act)                   | Medium | Swimming's default form; hill reps' "jog back"; honest session-duration arithmetic (§5.3)             |
| Two-level repeat (`seriesRepeatCount` + `betweenSeriesRest`)           | Medium | Rønnestad 30/15, Lydiard's hill circuit, most swim main sets (§5.4)                                   |
| Archetype-keyed Quality Session Mix                                    | Medium | §7.3; the Norwegian week; the fast-finish long run as a quality day                                   |

### 9.3 Things this research says **not** to do

- **Do not add "sweet spot" as an archetype.** It is a dose position inside
  tempo/threshold with no primary source (§2.1). Store `tempo` and let the zone
  say the rest.
- **Do not let the app generate a session named after a protocol it did not
  reproduce** (§6.3). A named protocol carries its intensity anchor or it is not
  that protocol.
- **Do not author the structural shape.** Derive it, per ADR 0042's own rule.
- **Do not price technique or neuromuscular sessions into a quality budget.**
  Both are real training and neither is a hard day.
- **Do not build a numeric "session difficulty" score** to sit beside archetype.
  That is TSS again, with the same known bias (§7.1), and the archetype is the
  thing that carries the information TSS loses.

### ADRs this research challenges

Each ADR below was read before being cited.

| ADR                                                                                     | What it decided                                                                                | What the evidence says                                                                                                                                                                                                                                                                                            | Verdict                  |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **0003** Session-first authoring, no template library                                   | Workout is private 1:1 to Session; "templates are planned for a later slice"                   | The 1:1 decision is correct and unaffected. But the deferred template library is now the binding constraint: an archetype vocabulary without a catalogue to filter is a dropdown, not a feature. `workouts-running.md` §13.1 reaches the same conclusion independently                                            | **Amend**                |
| **0042** Intensity Emphasis is derived; Quality Session Mix is zones 3–5 → count        | Emphasis derived from the mix; the mix is authored as a zone multiset                          | The _derived-not-authored_ rule is exactly right and should extend down to the session's archetype. The _zone_ key is wrong grain: `{Z4: 2}` cannot distinguish two cruise-interval sessions from a tempo + a race simulation, and the long-run exclusion makes the Hansons/fast-finish week inexpressible (§7.3) | **Amend**                |
| **0007** Step as a discriminated union                                                  | `cardio \| strength \| rest`; discipline on the cardio step; "brick workouts emerge naturally" | The brick claim is correct and is a genuine design win. Two gaps: the `rest` arm has only `durationSec` where the field uses four rest forms (§5.3), and one level of `repeatCount` cannot express `3 × (13 × 30/15)` (§5.4)                                                                                      | **Amend**                |
| **0027** A3 — notation language fixed to en-GB                                          | The Token Sentence's glue words are English                                                    | Correct for glue words. Session and template _names_ are content: _langtur_, _terskel_, _bakkedrag_, _stigningsløp_, _drag_, _serie_ and the spoken I1–I5 ladder are what Norwegian users say, and are not translations (§4.1). `workouts-running.md` §13.4 raises the same amendment                             | **Amend**                |
| **0006** Zone system in code; recipes are immutable constants                           | The recipe catalogue, including `olt-hr-5-run`/`olt-hr-5-bike` with I-1…I-5 labels             | The immutability decision holds, and shipping the Olympiatoppen I1–I5 labels already solves the Norwegian _zone_ vocabulary. Still missing: a sub-threshold band between I3 and I4 for §3, and `daniels-pace-5`'s single `T` cannot hold "0.4–0.8 mmol under threshold"                                           | **Amend**                |
| **0002** Step quantification (duration XOR distance)                                    | A step quantifies duration or distance                                                         | Neither quantity can express a rest specified as an act ("jog back down") or as a target HR, and neither can express a send-off cycle time. Same amendment the running and swimming notes raise for `verticalM` and send-off                                                                                      | **Amend**                |
| **0039** Domain-standard vocabulary; theory terms are recognized synonyms only          | Training Plan / Plan Outline phase / Training Week canonical; macrocycle et al. as synonyms    | Exactly the right pattern, and this document applies it unchanged to session names. Extend the synonym register in CONTEXT.md with the Norwegian archetype terms and the collisions in §4.2 (especially _cruise interval_, which means two different things in running and swimming)                              | **Confirm** (and extend) |
| **0032** Detection stores a single structure, no candidate inbox                        | One winning structure persisted; no confirmation surface                                       | An archetype label is a derived property of that same artifact, not a new entity and not a new inbox. The decision generalises cleanly                                                                                                                                                                            | **Confirm**              |
| **0033** Detection Confidence honesty bar (`high\|medium\|low`, else nothing)           | Confidence vocabulary shared with Load Confidence; cut points are build-time calibration       | The archetype classifier reuses the grade, the min-of-three composition, and the "return nothing rather than guess" rule verbatim (§8). The lactate caveat in branch 4c is the same class of honesty problem the ADR already names                                                                                | **Confirm**              |
| **0035** Detected segments classified on the anchor channel; zone label display-derived | Store the measured value; derive the label                                                     | Archetype is the next layer up and follows the same rule: derive, cap on HR, never persist a label the data cannot support                                                                                                                                                                                        | **Confirm** (and extend) |
| **0046 / 0047** Strength carries no TSS; authors a Strength Goal                        | Strength is a separate track with its own vocabulary                                           | Confirmed from the taxonomy side: strength sessions do not belong in a cardio archetype enum, and the four `strength-*` members of `WORKOUT_INTENTS` are now duplicated by `Strength Goal` and should be retired from that enum                                                                                   | **Confirm**              |
| **0016** AI plan generation                                                             | Already **superseded by ADR 0044** — the feature was deleted                                   | Noted, not challenged. When generation is rebuilt, the archetype axis plus a cited template catalogue is what turns it from free invention into retrieval-and-substitute                                                                                                                                          | (already superseded)     |

---

## 10. Uncertainty and limitations

- **The archetype list itself is a synthesis, not a standard.** No governing
  body publishes one. The 16 rows in §2 are the intersection of Daniels,
  Lydiard, Pfitzinger, Hansons, Canova, Bakken, Tønnessen 2024, and standard
  triathlon/swim practice. Reasonable coaches would merge #4 into #5, or split
  #11 into strides and plyometrics. The _axis_ is not in doubt; the exact
  cardinality is a design choice.
- **Work:rest ratios are convention with one controlled study behind them**
  (Seiler & Hetlelid 2005, one work duration, one modality). §5.2 says so
  in-line. Do not present the table as evidence-based optima.
- **Sweet spot, over-under, fast-finish long run and the 25–30 % long-run cap
  have no controlled trials** establishing superiority over matched
  alternatives. All four are flagged ⚠ where they appear.
- **The Norwegian lactate band is reported two ways** — 2–4.5 mmol·L⁻¹
  (Casado 2023) and 2.3–3.0 mmol·L⁻¹ (Bakken) — and this document reports both
  rather than reconciling them (§3.1).
- **The Norwegian glossary is compiled from field usage**, not from a published
  Norwegian coaching lexicon; the Olympiatoppen I1–I5 labels are the exception
  and are verifiable in this repo's own `OLT_HR_5_ZONES`. Native-speaker review
  is warranted before any of these strings ship in UI. In particular _langtur_
  vs _langkjøring_ and _tempoøkt_'s ambiguity are usage judgements.
- **The classification pseudocode is untested.** Its constants are placeholders
  chosen to be plausible, not calibrated — exactly the status
  `structure-detection/constants.ts` warns about ("tune these against the
  corpus, not the domain"). It should be validated against the seeded corpus
  before any of it is believed.
- **Tabata's original subject description varies across secondary retellings**
  (physical-education students vs speed-skaters, 7 vs 8 sets). The 1996 paper's
  own numbers — ~170 % VO₂max, 20/10, 5 d/wk, 6 weeks, +28 % anaerobic capacity
  — are the ones verified here via the indexed abstract; the finer participant
  details were not read from the full text.
- **Buchheit & Laursen's nine-variable framing** was verified from the indexed
  abstracts of both parts; the specific per-variable recommendations were not
  read from the full text and are not quoted.
- **No competitor training product is named anywhere in this document**, per the
  brief and the convention in [README.md](README.md).

---

## References

**Peer-reviewed — protocols**

- Tabata I, Nishimura K, Kouzaki M, Hirai Y, Ogita F, Miyachi M, Yamamoto K.
  Effects of moderate-intensity endurance and high-intensity intermittent
  training on anaerobic capacity and VO2max. _Med Sci Sports Exerc._
  1996;28(10):1327–1330.
  doi:[10.1097/00005768-199610000-00018](https://doi.org/10.1097/00005768-199610000-00018)
  · PMID 8897392
- Tabata I, Irisawa K, Kouzaki M, Nishimura K, Ogita F, Miyachi M. Metabolic
  profile of high intensity intermittent exercises. _Med Sci Sports Exerc._
  1997;29(3):390–395.
  doi:[10.1097/00005768-199703000-00015](https://doi.org/10.1097/00005768-199703000-00015)
  · PMID 9139179
- Tabata I. Tabata training: one of the most energetically effective
  high-intensity intermittent training methods. _J Physiol Sci._
  2019;69(4):559–572.
  doi:[10.1007/s12576-019-00676-7](https://doi.org/10.1007/s12576-019-00676-7) ·
  PMID 31004287
- Helgerud J, Høydal K, Wang E, Karlsen T, Berg P, Bjerkaas M, et al. Aerobic
  high-intensity intervals improve VO2max more than moderate training. _Med Sci
  Sports Exerc._ 2007;39(4):665–671.
  doi:[10.1249/mss.0b013e3180304570](https://doi.org/10.1249/mss.0b013e3180304570)
- Seiler S, Jøranson K, Olesen BV, Hetlelid KJ. Adaptations to aerobic interval
  training: interactive effects of exercise intensity and total work duration.
  _Scand J Med Sci Sports._ 2013;23(1):74–83.
  doi:[10.1111/j.1600-0838.2011.01351.x](https://doi.org/10.1111/j.1600-0838.2011.01351.x)
- Seiler S, Hetlelid KJ. The impact of rest duration on work intensity and RPE
  during interval training. _Med Sci Sports Exerc._ 2005;37(9):1601–1607.
  doi:[10.1249/01.mss.0000177560.18014.d8](https://doi.org/10.1249/01.mss.0000177560.18014.d8)
  · PMID 16177614
- Billat VL, Slawinski J, Bocquet V, Demarle A, Lafitte L, Chassaing P,
  Koralsztein JP. Intermittent runs at the velocity associated with maximal
  oxygen uptake enables subjects to remain at maximal oxygen uptake for a longer
  time than intense but submaximal runs. _Eur J Appl Physiol._
  2000;81(3):188–196.
  doi:[10.1007/s004210050029](https://doi.org/10.1007/s004210050029)
- Billat V, Slawinski J, Bocquet V, Chassaing P, Demarle A, Koralsztein JP. Very
  short (15 s–15 s) interval-training around the critical velocity allows
  middle-aged runners to maintain VO2max for 14 minutes. _Int J Sports Med._
  2001;22(3):201–208.
- Rønnestad BR, Hansen J, Vegge G, Tønnessen E, Slettaløkken G. Short intervals
  induce superior training adaptations compared with long intervals in cyclists
  — an effort-matched approach. _Scand J Med Sci Sports._ 2015;25(2):143–151.
  doi:[10.1111/sms.12165](https://doi.org/10.1111/sms.12165) · PMID 24382021
- Rønnestad BR, Hansen J, Nygaard H, Lundby C. Superior performance improvements
  in elite cyclists following short-interval vs effort-matched long-interval
  training. _Scand J Med Sci Sports._ 2020;30(5):849–857.
  doi:[10.1111/sms.13627](https://doi.org/10.1111/sms.13627) · PMID 31977120
- Almquist NW, Nygaard H, Vegge G, Hammarström D, Ellefsen S, Rønnestad BR.
  Systemic and muscular responses to effort-matched short intervals and long
  intervals in elite cyclists. _Scand J Med Sci Sports._ 2020;30(7):1140–1150.
  doi:[10.1111/sms.13672](https://doi.org/10.1111/sms.13672)
- Rønnestad BR, Øfsteng SJ, Zambolin F, Raastad T, Hammarström D. Superior
  physiological adaptations after a microcycle of short intervals versus long
  intervals in cyclists. _Int J Sports Physiol Perform._ 2021;16(10):1432–1438.
  doi:[10.1123/ijspp.2020-0647](https://doi.org/10.1123/ijspp.2020-0647)
- Paavolainen L, Häkkinen K, Hämäläinen I, Nummela A, Rusko H.
  Explosive-strength training improves 5-km running time by improving running
  economy and muscle power. _J Appl Physiol._ 1999;86(5):1527–1533.
  doi:[10.1152/jappl.1999.86.5.1527](https://doi.org/10.1152/jappl.1999.86.5.1527)

**Peer-reviewed — the Norwegian tradition**

- Casado A, Foster C, Bakken M, Tjelta LI. Does lactate-guided threshold
  interval training within a high-volume low-intensity approach represent the
  "next step" in the evolution of distance running training? _Int J Environ Res
  Public Health._ 2023;20(5):3782.
  doi:[10.3390/ijerph20053782](https://doi.org/10.3390/ijerph20053782) · PMID
  36900796
- Tønnessen E, Sandbakk Ø, Sandbakk SB, Seiler S, Haugen T. Training session
  models in endurance sports: a Norwegian perspective on best practice
  recommendations. _Sports Med._ 2024;54(11):2935–2953.
  doi:[10.1007/s40279-024-02067-4](https://doi.org/10.1007/s40279-024-02067-4) ·
  PMID 39012575
- Kjøsen Talsnes R, Torvik PØ, Skovereng K, Sandbakk Ø. Comparison of acute
  physiological responses between one long and two short sessions of
  moderate-intensity training in endurance athletes. _Front Physiol._
  2024;15:1428536.
  doi:[10.3389/fphys.2024.1428536](https://doi.org/10.3389/fphys.2024.1428536) ·
  PMID 39139482
- Tjelta LI. Three Norwegian brothers all European 1500 m champions: what is the
  secret? _Int J Sports Sci Coach._ 2019;14(5):694–700.
  doi:[10.1177/1747954119872321](https://doi.org/10.1177/1747954119872321)
  (corrigendum
  doi:[10.1177/1747954119880993](https://doi.org/10.1177/1747954119880993))
- Haugen T, Sandbakk Ø, Seiler S, Tønnessen E. The training characteristics of
  world-class distance runners. _Sports Med Open._ 2022;8:46.
  doi:[10.1186/s40798-022-00438-7](https://doi.org/10.1186/s40798-022-00438-7)
- Bakken M. _The Norwegian Model._
  <https://www.mariusbakken.com/the-norwegian-model.html> — coach-published,
  cited for provenance: the 2.3–3.0 mmol·L⁻¹ operating band and the canonical
  session formats.

**Peer-reviewed — grammar and general**

- Buchheit M, Laursen PB. High-intensity interval training, solutions to the
  programming puzzle. Part I: cardiopulmonary emphasis. _Sports Med._
  2013;43(5):313–338.
  doi:[10.1007/s40279-013-0029-x](https://doi.org/10.1007/s40279-013-0029-x)
- Buchheit M, Laursen PB. …Part II: anaerobic energy, neuromuscular load and
  practical applications. _Sports Med._ 2013;43(10):927–954.
  doi:[10.1007/s40279-013-0066-5](https://doi.org/10.1007/s40279-013-0066-5)
- McGowan CJ, Pyne DB, Thompson KG, Rattray B. Warm-up strategies for sport and
  exercise: mechanisms and applications. _Sports Med._ 2015;45(11):1523–1546.
  doi:[10.1007/s40279-015-0376-x](https://doi.org/10.1007/s40279-015-0376-x)
- Van Hooren B, Peake JM. Do we need a cool-down after exercise? A narrative
  review of the psychophysiological effects and the effects on performance,
  injuries and the long-term adaptive response. _Sports Med._
  2018;48(7):1575–1595.
  doi:[10.1007/s40279-018-0916-2](https://doi.org/10.1007/s40279-018-0916-2)
- Currell K, Jeukendrup AE. Validity, reliability and sensitivity of measures of
  sporting performance. _Sports Med._ 2008;38(4):297–316.
  doi:[10.2165/00007256-200838040-00003](https://doi.org/10.2165/00007256-200838040-00003)
  — why the time trial, not time-to-exhaustion, is the test archetype.
- Millet GP, Vleck VE. Physiological and biomechanical adaptations to the cycle
  to run transition in Olympic triathlon. _Br J Sports Med._ 2000;34(5):384–390.
  doi:[10.1136/bjsm.34.5.384](https://doi.org/10.1136/bjsm.34.5.384)
- Casado A, Hanley B, Santos-Concejero J, Ruiz-Pérez LM. World-class
  long-distance running performances are best predicted by volume of easy runs
  and deliberate practice of short-interval and tempo runs. _J Strength Cond
  Res._ 2021;35(9):2525–2531.
  doi:[10.1519/JSC.0000000000003176](https://doi.org/10.1519/JSC.0000000000003176)

**Coaches, books and named systems**

- Daniels J. _Daniels' Running Formula._ 4th ed. Human Kinetics; 2021. —
  E/M/T/I/R, cruise intervals, the "Q session" convention and the 8 %/5 % weekly
  caps.
- Lydiard A, Gilmour G. _Running to the Top._ Meyer & Meyer Sport; 1997. —
  aerobic base, the hill phase, the hill circuit.
- Pfitzinger P, Douglas S. _Advanced Marathoning._ 3rd ed. Human Kinetics; 2019.
  — LT runs, medium-long runs, marathon-pace long runs.
- Humphrey L, with Hanson K, Hanson K. _Hansons Marathon Method._ 2nd ed.
  VeloPress; 2016. — the three-SOS-day week and the capped long run.
- Canova R, Arcelli E. _Marathon Training: A Scientific Approach._ IAAF; 1999. —
  percentage-of-race-pace, alternations (_cambio ritmo_), special blocks.
- Hudson B, Fitzgerald M. _Run Faster from the 5K to the Marathon._ Broadway
  Books; 2008. — hill sprints, ladders, progression runs.
- Magness S. _The Science of Running._ Origin Press; 2014.
- Allen H, Coggan A. _Training and Racing with a Power Meter._ VeloPress. — the
  power zone table sweet spot sits inside; no primary source for sweet spot
  itself.
- Holmér G — originator of _fartlek_ (Sweden, 1930s); no primary text in print.
- Bower D; Maglischo EW — the swimming **cruise interval** / base interval, via
  the NISCA coaches' manual; see [`workouts-swimming.md`](workouts-swimming.md)
  §1.3.1 for the verbatim passage and provenance.

**In-repo**

- ADRs [0002](../adr/0002-step-quantification.md),
  [0003](../adr/0003-session-first-authoring.md),
  [0006](../adr/0006-zone-system-in-code.md),
  [0007](../adr/0007-step-as-discriminated-union.md),
  [0009](../adr/0009-event-as-plan-anchor.md),
  [0016](../adr/0016-ai-plan-generation.md) (superseded by
  [0044](../adr/0044-plan-outline-is-relational.md)),
  [0027](../adr/0027-text-first-workout-authoring.md),
  [0032](../adr/0032-structure-detection-auto-import.md),
  [0033](../adr/0033-detection-confidence-honesty-bar.md),
  [0034](../adr/0034-detected-structure-plan-verification.md),
  [0035](../adr/0035-detected-segment-zone-classification.md),
  [0039](../adr/0039-manual-planning-authors-the-plan-outline.md),
  [0042](../adr/0042-intensity-emphasis-is-scoped-by-track.md),
  [0046](../adr/0046-no-load-number-spans-incommensurable-training-tracks.md),
  [0047](../adr/0047-strength-progresses-by-anchor-and-ramp.md)
- `app/utils/workout-schema.ts` (`WORKOUT_INTENTS`, line 37;
  `IntensityTargetSchema`, line 57), `app/utils/labels.ts` (`INTENT_LABELS`,
  line 84), `app/utils/session-profile.ts` (`zoneLabelToZone`, line 76),
  `app/utils/session-title.ts` (`deriveWorkoutTitle`),
  `app/utils/zones/recipes.ts` (`OLT_HR_5_ZONES`, `DANIELS_PACE_5`),
  `app/utils/structure-detection/` (`constants.ts`, `classify.ts`, `types.ts`)
- `CONTEXT.md` — **Quality Session Mix**, **Quality Session Count**, **Intensity
  Emphasis**, **Week Pattern**
