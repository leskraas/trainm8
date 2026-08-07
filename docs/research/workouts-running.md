# A running workout library

Research note. Compiled 2026-08-07. A citable catalogue of ~50 real running
sessions, every one written in **portable intensity anchors** so that the same
row means the same physiological thing to a 17-minute and a 30-minute 5k runner.

> **Sibling documents.** This note was commissioned alongside
> `workout-taxonomy.md` and `portable-intensity-anchors.md`. **Neither exists in
> `docs/research/` at the time of writing** — only the seven documents listed in
> [README.md](README.md). This note therefore carries a minimal anchor legend of
> its own (§2) rather than deferring, and that legend should be _deleted and
> replaced by a reference_ the moment the anchors document lands. Zone tables,
> TID theory, and the TSS/rTSS maths are **not** repeated here — see
> [zones-and-thresholds.md](zones-and-thresholds.md),
> [intensity-distribution.md](intensity-distribution.md) and
> [training-load-and-fitness-model.md](training-load-and-fitness-model.md).

## TL;DR

- **Race pace is the most portable anchor there is, and trainm8 cannot express
  it.** `IntensityTargetSchema` (`app/utils/workout-schema.ts:57`) has seven
  kinds — `zoneLabel`, `rpe`, `hrBpm`, `hrPct`, `power`, `powerPct`, `pace` —
  and _none_ of them is a percentage of a pace. There is `powerPct` (%FTP) but
  no `pacePct` (%threshold pace), and no race-pace kind at all. ADR 0027 A2
  reserved an `equivalent` facet slot and shipped it permanently `null`. The
  consequence is concrete: **Canova's entire system, roughly a third of this
  library, is unauthorable today** except by pre-computing absolute paces per
  athlete — which is exactly the non-portability this research was asked to
  avoid.
- **Four anchor families cover every published protocol**, and they are not
  interchangeable: _%HRmax_ (Helgerud 4×4 — 90–95 % HRmax), _%vVO2max /
  velocity_ (Billat 30/30), _%threshold_ (Daniels T, Norwegian double threshold,
  Seiler 4×8), and _%race pace_ (Canova). A library that can only store zone
  labels flattens all four into one lossy vocabulary and loses the citation's
  meaning.
- **The Norwegian threshold tradition is a _sub_-threshold tradition.** Bakken's
  model deliberately runs at 2.3–3.0 mmol/L — _below_ the 4 mmol convention — as
  intervals rather than continuous, twice in one day. `daniels-pace-5`
  (`app/utils/zones/recipes.ts:148`) has one `T` band and cannot express
  "0.4–0.8 mmol under threshold", which is the single most-used session type in
  the tradition this app's Norwegian users train in.
- **Hills and trail break the anchor model, not just the numbers.** Pace is
  meaningless above ~4 % grade; the honest anchors uphill are HR, RPE, running
  power, and _vertical metres per hour_. `WorkoutStep` quantifies duration and
  distance only (ADR 0002) — there is no vertical-metres or grade quantity, so a
  `1 000 vm @ RPE 7` session is not representable, and grade-blind rTSS
  under-prices every hill session in the library.
- **A seeded library is the cheapest correctness upgrade available to the AI
  planner.** ~50 rows of cited, anchor-expressed, phase-tagged sessions turn ADR
  0016's plan generation from free invention into retrieval-plus- substitution.
  That needs a `WorkoutTemplate` entity with archetype, phase applicability,
  goal-event applicability, level, citation, and progression/regression edges —
  none of which exists.

---

## 1. How to read this library

Each archetype gets **two tables**:

- **Prescription** — `#`, name (with the Norwegian term where one is standard),
  structure in portable anchors, volume, estimated TSS, phase · frequency, and
  source.
- **Notation & variants** — the same session rendered in this repo's
  [Workout Notation](../adr/0027-text-first-workout-authoring.md), plus how to
  progress and regress it.

**TSS figures are estimates, flagged as such.** They are computed as
`IF² × hours × 100` for a notional intermediate athlete and vary ±25 % with the
athlete's threshold accuracy, warm-up length, and (for trail) terrain. They are
directionally useful for plan budgeting and should never be shown as precise.

**Levels.** _Beginner_ ≈ <40 km/wk, ≤2 quality sessions; _intermediate_ ≈ 40–80
km/wk, 2–3 quality; _advanced_ ≈ 80 km+/wk, 3 quality (or 2 doubles + 1). Where
a row is level-specific the volume column says so; otherwise §12 gives the
scaling rule.

### Notation legend

The renderer (`app/utils/workout-notation.ts`) is deterministic; these are its
real tokens, taken from `NOTATION_SEPARATORS` and the unit tests:

| Token          | Renders as                                           | Authored `IntensityTarget` kind  |
| -------------- | ---------------------------------------------------- | -------------------------------- |
| Step separator | `→`                                                  | —                                |
| Repeat         | `4 × 6 min`, `3 × (3 min Threshold → 1 min Easy)`    | —                                |
| Value          | `@ 4:40 /km`, `@ 80 kg`                              | —                                |
| Derived facet  | `· Z4`, `· Z4 (238–263 W)`                           | —                                |
| Zone label     | `20 min Threshold`, `4 × Easy` (capitalised, no `@`) | `zoneLabel`                      |
| RPE            | `30 min @ RPE 6 · Z3`                                | `rpe`                            |
| % HR           | `4 min @ 90–95% max HR · Z5`                         | `hrPct` (`ref: 'max' \| 'lthr'`) |
| % power        | `20 min @ 95–105% FTP · Z4`                          | `powerPct`                       |
| Absolute       | `@ 4:40 /km`, `@ 150–160 bpm`                        | `pace`, `hrBpm`, `power`         |
| Rest step      | `(1 min rest)`                                       | —                                |

Two markers appear in the notation column below:

- **†** — needs a new `pacePct` kind (_% of threshold pace_), e.g.
  `@ 98–102% T-pace`. Today only `powerPct` exists; the pace channel has no
  percentage form even though `daniels-pace-5` is anchored on `thresholdPace`
  (`app/utils/zones/recipes.ts:150`).
- **‡** — needs a new `racePace` kind (_% of a named race-distance pace_), e.g.
  `@ 102% MP`, `@ 95% 5k`. This is ADR 0027's reserved-and-unshipped
  `equivalent` facet, promoted from a display facet to a first-class authored
  anchor.

Everything unmarked is authorable in trainm8 **today**.

---

## 2. Anchor legend (provisional — supersede with `portable-intensity-anchors.md`)

| Anchor       | Meaning                                                    | Portable because                              | Where it comes from                      |
| ------------ | ---------------------------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `E` / Easy   | Daniels Easy, ~59–74 % VO2max, ~65–79 % HRmax              | Ratio to the athlete's own VDOT               | Daniels, _Running Formula_               |
| `M`          | Marathon pace, ~75–84 % VO2max                             | Defined by the athlete's own marathon ability | Daniels                                  |
| `T`          | Threshold, ~83–88 % VO2max, ~1 h race pace, ~88–92 % HRmax | Ratio to the athlete's own LT                 | Daniels                                  |
| `I`          | Interval, ~95–100 % VO2max, ≈ 3–5 k race pace              | Ratio to the athlete's own vVO2max            | Daniels                                  |
| `R`          | Repetition, ~105–120 % vVO2max, ≈ 1500 m–mile pace         | Ratio to the athlete's own speed              | Daniels                                  |
| `% HRmax`    | Fraction of measured maximal HR                            | Measured per athlete                          | Helgerud; Olympiatoppen (`olt-hr-5-run`) |
| `% LTHR`     | Fraction of lactate-threshold HR                           | Measured per athlete                          | Friel (`friel-hr-5-run`)                 |
| `% vVO2max`  | Fraction of velocity at VO2max                             | Measured per athlete                          | Billat                                   |
| `% T-pace` † | Fraction of threshold pace                                 | Ratio to the athlete's own LT pace            | Norwegian tradition; Seiler              |
| `% RP` ‡     | Fraction of _goal-race_ pace for a named distance          | The whole point: 100 % is the athlete's own   | Canova                                   |
| `RPE 1–10`   | Session/interval perceived exertion                        | Subjective by construction                    | Borg CR10 / Foster sRPE                  |
| `mmol/L`     | Blood lactate                                              | Measured, individual                          | Bakken; Norwegian model                  |
| `vm/h`       | Vertical metres per hour                                   | Terrain-portable where pace is not            | Trail/skyrunning practice                |

**Canova's percentage grammar deserves its own row set**, because it is the
system that most directly answers "make this portable". Canova prescribes
everything as a percentage of _goal race pace for the target event_:

| Canova band | Name                         | Typical use                                         |
| ----------- | ---------------------------- | --------------------------------------------------- |
| ≤ 80 % RP   | Fundamental / _regeneration_ | Easy and long aerobic running — "training to train" |
| 85–90 % RP  | Fundamental fast             | Long aerobic support, marathon long runs            |
| 90 % RP     | **Special endurance**        | Recovery floats inside alternations; extension work |
| 95–105 % RP | **Specific**                 | The race-specific block; the funnel's neck          |
| 110 % RP    | **Special speed**            | Support from above; short reps                      |

Note the crucial asymmetry: for a marathoner, 105 % MP is _faster_ than race
pace and 90 % MP is a **float**, not a rest. For a 5k runner, 95 % of 5k pace is
roughly 10k pace. The same percentage means a different physiological system per
event, which is why the notation must record _which_ race distance the
percentage refers to (`@ 105% MP` ≠ `@ 105% 5k`). Source: Canova & Arcelli,
_Marathon Training: A Scientific Approach_; the modern reconstruction in
[Running Writings' percentage-based training overview](https://runningwritings.com/2023/12/percentage-based-training.html).

---

## 3. Archetype A — Easy & recovery (_rolig_ / _restitusjon_)

The 75–85 % of weekly volume that is not the workout. Casado et al. found that
volume of easy running is among the best predictors of world-class distance
performance — this archetype is not filler.

### Prescription

| #   | Name (norsk)                                     | Purpose                                                                         | Structure (anchors)                                                     | Volume         | TSS (est.) | Phase · freq                          | Source                                                          |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------- | ---------- | ------------------------------------- | --------------------------------------------------------------- |
| A1  | Recovery run (_restitusjonsjogg_)                | Circulation, no adaptive stimulus intended                                      | Continuous `E` at the slow edge; RPE 2–3; ≤ 70 % HRmax                  | 20–40 min      | 12–25      | All phases · 0–3×/wk                  | Daniels `E`; Norwegian "under 1.0 mmol" easy day (Bakken)       |
| A2  | Easy run (_rolig tur_ / _rolig langkjøring_)     | Mitochondrial & capillary density, fat oxidation, tendon load tolerance         | Continuous `E`, RPE 3–4, 65–79 % HRmax, conversational                  | 40–75 min      | 30–60      | All phases · 3–6×/wk                  | Daniels `E`; Lydiard aerobic base                               |
| A3  | Easy + strides (_rolig med stigningsløp_)        | Aerobic volume with neuromuscular touch; keeps `R` mechanics alive in base      | `E` run → 6–8 × 20 s at ~mile effort (`R`-ish), full walk/jog recovery  | 40–70 min      | 35–60      | Base, build, taper · 2–3×/wk          | Daniels strides; Hudson                                         |
| A4  | Double easy day (_dobbeltøkt rolig_)             | Volume without a single long stress; the precondition for double-threshold days | AM `E` 40–60 min + PM `E` 30–45 min                                     | 70–105 min/day | 55–90      | Base, build (advanced only) · 1–4×/wk | Norwegian model (Bakken); Haugen et al. on world-class training |
| A5  | Aerobic base run, capped (_langkjøring med tak_) | Lydiard's "aerobic ceiling" — steady but strictly sub-threshold                 | Continuous at the top of `E` / bottom of `M`; hard cap at LTHR − 10 bpm | 45–90 min      | 45–85      | Base · 1–3×/wk                        | Lydiard, _Running to the Top_                                   |

### Notation & variants

| #   | Workout Notation                                  | Progression (harder)                                          | Regression (easier)                         |
| --- | ------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| A1  | `30 min Easy`                                     | — (never progress a recovery run; progress the day around it) | Walk/run 4 × (5 min jog → 2 min walk)       |
| A2  | `60 min Easy`                                     | +10 min per fortnight, or add A3's strides                    | 40 min, or run/walk intervals for beginners |
| A3  | `50 min Easy → 6 × (20 s Repetition → 60 s Easy)` | 8–10 strides; strides on a 1–2 % rise                         | 4 strides of 15 s                           |
| A4  | AM `50 min Easy` · PM `35 min Easy`               | Convert the PM to C3/C4 (double threshold)                    | Collapse to one 60 min run                  |
| A5  | `70 min @ 80–88% max HR · Z2`                     | Extend to 100 min before raising intensity                    | `60 min Easy`, no cap needed                |

---

## 4. Archetype B — Long run (_langtur_)

### Prescription

| #   | Name (norsk)                                       | Purpose                                                                        | Structure (anchors)                                                                       | Volume      | TSS (est.) | Phase · freq                              | Source                                            |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------- | ---------- | ----------------------------------------- | ------------------------------------------------- |
| B1  | Classic long run (_langtur_)                       | Glycogen storage, capillarisation, musculoskeletal durability, mental duration | Continuous `E`, RPE 4; cap at 25–30 % of weekly volume                                    | 90–150 min  | 85–150     | Base, build · 1×/wk                       | Lydiard; Daniels `L`                              |
| B2  | Progression long run (_progressiv langtur_)        | Teaches pacing and fat→CHO transition; adds quality without a second hard day  | 3 equal thirds: `E` → top of `E` → `M`. Last third ~85–90 % of the run's first-third pace | 90–120 min  | 100–150    | Base→build · 1× per 2 wks                 | Canova "progressive"; Hudson                      |
| B3  | Long run with `M` finish (_langtur med marsjfart_) | Race-specific fatigue resistance for HM/M                                      | `E` for 60–70 % of the run → final 20–40 min at `M` (100 % MP ‡)                          | 100–150 min | 120–180    | Build, peak · 1× per 1–2 wks              | Pfitzinger & Douglas, _Advanced Marathoning_      |
| B4  | Canova specific long run                           | Extension of quality: the long run _is_ the race-specific session              | 25–35 km with 60–75 % of it at 90–95 % MP ‡, easy only at the edges                       | 25–35 km    | 170–260    | Specific/peak (advanced) · 1× per 2–3 wks | Canova & Arcelli                                  |
| B5  | Capped long run (Hansons)                          | Cumulative fatigue over a fatigued week, not a single heroic effort            | Continuous `E`–`M`-minus; capped at ~16 mi / 26 km **or** ~25–30 % of week                | 100–140 min | 100–150    | Build, peak · 1×/wk                       | Humphrey & the Hansons, _Hansons Marathon Method_ |
| B6  | Medium-long run (_mellomlang tur_)                 | A second aerobic pillar mid-week; the marathoner's under-rated session         | Continuous `E`, occasionally with 15–20 min at `M` embedded                               | 70–110 min  | 70–110     | Base, build · 1–2×/wk                     | Pfitzinger & Douglas                              |

### Notation & variants

| #   | Workout Notation                                                 | Progression                                                          | Regression                                    |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| B1  | `2 h Easy`                                                       | +10–15 min per fortnight to a distance cap, then add B2/B3 quality   | 60–75 min; or 3 × 25 min Easy with 3 min walk |
| B2  | `40 min Easy → 40 min @ 85–92% LTHR · Z3 → 30 min Marathon`      | Compress: shift the boundary earlier so the `M` third becomes 45 min | Two thirds only: 40 min Easy → 30 min Z3      |
| B3  | `70 min Easy → 30 min Marathon → 10 min Easy` ‡                  | 3 × 20 min Marathon inside the run (5 min Easy floats)               | 15 min Marathon finish                        |
| B4  | `4 km Easy → 5 × (4 km @ 95% MP → 2 km @ 90% MP) → 3 km Easy` ‡  | Raise 95 % → 98 % → 100 %; shorten the 90 % floats                   | 3 sets; floats at 88 % MP                     |
| B5  | `2 h 15 Easy`                                                    | Nothing — the cap _is_ the method; add load elsewhere in the week    | 90 min                                        |
| B6  | `80 min Easy` or `30 min Easy → 20 min Marathon → 30 min Easy` ‡ | Two per week (Pfitzinger's signature)                                | 55 min Easy                                   |

**Uncertainty flag.** The "25–30 % of weekly volume" long-run cap is coaching
convention repeated across Daniels, Pfitzinger and Hansons; I found no
controlled trial establishing the threshold. Treat as heuristic.

---

## 5. Archetype C — Threshold & tempo (_terskel_)

The densest and most contested archetype, and the one where the Norwegian
tradition diverges most sharply from Anglo-American practice.

### Prescription

| #   | Name (norsk)                                    | Purpose                                                                             | Structure (anchors)                                                                              | Volume          | TSS (est.) | Phase · freq                         | Source                                                              |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- | ---------- | ------------------------------------ | ------------------------------------------------------------------- |
| C1  | Continuous tempo (_terskelløp_)                 | Raise LT velocity; the classic "comfortably hard"                                   | 20–40 min continuous at `T` (≈ 1 h race pace, 88–92 % HRmax, RPE 6–7)                            | 45–70 min total | 55–85      | Base, build · 1×/wk                  | Daniels `T`; Pfitzinger LT run                                      |
| C2  | Cruise intervals (_terskeldrag_)                | Same LT stimulus, more total time at `T`, less psychological cost                   | 4–6 × 5–8 min at `T`, 1 min jog float                                                            | 55–80 min total | 60–90      | Base→peak · 1×/wk                    | Daniels cruise intervals                                            |
| C3  | Double threshold, AM (_dobbel terskel, morgen_) | Accumulate sub-threshold time at controlled lactate (~2.3–2.8 mmol)                 | 5–6 × 6 min at **sub**-`T` (~95–98 % T-pace †), 1 min jog                                        | 60–75 min total | 65–90      | Base, build (advanced) · 1–2 days/wk | Bakken, _The Norwegian Model_; Tønnessen et al. 2024                |
| C4  | Double threshold, PM (_dobbel terskel, kveld_)  | Second dose the same day at slightly higher lactate (~2.8–3.0 mmol) with short reps | 10–12 × 1000 m at `T`, 60 s jog — **or** 25 × 400 m, 30 s jog — **or** 20 × (45 s on / 15 s off) | 60–80 min total | 70–95      | Base, build (advanced) · 1–2 days/wk | Bakken; the Ingebrigtsen practice as documented by Tønnessen et al. |
| C5  | LT run with full frame (Pfitzinger)             | Marathon-oriented LT development with substantial aerobic frame                     | 3 km `E` → 20–40 min at `T` (15k–HM effort) → 3 km `E`                                           | 60–100 min      | 70–110     | Build · 1×/wk                        | Pfitzinger & Douglas                                                |
| C6  | Hansons tempo (_marsjfart_)                     | Rehearse **goal marathon pace** on tired legs — not a lactate session               | 6–16 km continuous at 100 % MP ‡, run within a fatigued week                                     | 60–100 min      | 75–120     | Build, peak · 1×/wk                  | Humphrey & the Hansons                                              |
| C7  | Floating threshold (_flytende terskel_)         | Sustained sub-threshold time via micro-floats; keeps lactate 0.4–0.8 mmol under LT  | 3 × (8 min at 96 % T-pace † → 2 min at 88 % T-pace †) unbroken                                   | 55–75 min       | 65–90      | Build · 1×/wk                        | Bakken ("floating"); Canova alternations                            |
| C8  | Threshold ladder (_stigende terskel_)           | Progressive lactate rise 2.0 → 3.0 mmol; a controlled way to find the ceiling       | 6 min at 94 % → 6 min at 97 % → 6 min at 100 % → 6 min at 102 % T-pace †, 1 min jog              | 60–75 min       | 70–95      | Build, peak · 1× per 2 wks           | Bakken (progressive session); Daniels T-ladder                      |

### Notation & variants

| #   | Workout Notation                                                                                                        | Progression                                       | Regression                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| C1  | `2 km warm-up → 25 min Threshold → 2 km cool-down`                                                                      | 25 → 30 → 40 min; then move to C2 for more volume | 2 × 10 min Threshold with 2 min Easy                                      |
| C2  | `2 km warm-up → 5 × (6 min Threshold → 1 min Easy) → 2 km cool-down`                                                    | 5 → 6 reps; 6 → 8 min reps; float 1 min → 45 s    | 4 × 5 min, 90 s float                                                     |
| C3  | `3 km warm-up → 5 × (6 min @ 95–98% T-pace → 1 min Easy) → 2 km cool-down` †                                            | 5 → 6 reps; nudge the band to 97–100 %            | 4 × 6 min at 93–96 %                                                      |
| C4  | `2 km warm-up → 10 × (1000 m Threshold → 60 s Easy) → 2 km cool-down`                                                   | 10 → 12 reps; jog 60 s → 45 s                     | 8 × 1000 m, 90 s jog — or the 25 × 400 m variant, which is easier per rep |
| C5  | `3 km warm-up → 30 min Threshold → 3 km cool-down`                                                                      | 20 → 40 min at `T` across the block               | 15 min at `T`                                                             |
| C6  | `3 km warm-up → 10 km Marathon → 2 km cool-down` ‡                                                                      | 6 → 8 → 10 → 16 km at MP                          | 5 km at MP; or MP + 10 s/km                                               |
| C7  | `2 km warm-up → 3 × (8 min @ 96% T-pace → 2 min @ 88% T-pace) → 2 km cool-down` †                                       | 4 sets; floats 2 min → 90 s                       | 2 sets; floats at 85 %                                                    |
| C8  | `3 km warm-up → 6 min @ 94% T-pace → 6 min @ 97% T-pace → 6 min @ 100% T-pace → 6 min @ 102% T-pace → 2 km cool-down` † | Add a fifth rung at 104 %                         | Three rungs, stop at 100 %                                                |

**Honesty flag on C3/C4.** The Norwegian double-threshold model is
_lactate-controlled_, not pace-controlled — Bakken is explicit that the target
is 2.3–3.0 mmol/L measured, and that individual thresholds sit well below the 4
mmol convention. Rendering it as `% T-pace` is a **lossy translation** that this
library performs deliberately, because trainm8 has no lactate channel. Any
seeded version of C3/C4 should carry that caveat in its description; presenting
a pace band as "the Norwegian method" without it would be overclaiming. Also
note the prerequisite: doubles presuppose the A4 volume base and are
inappropriate below ~80 km/wk.

---

## 6. Archetype D — VO2max intervals (_intervall_ / _harde drag_)

The best-evidenced archetype: three of these rows are named, published,
randomised protocols.

### Prescription

| #   | Name (norsk)                        | Purpose                                                                             | Structure (anchors)                                                                                  | Volume    | TSS (est.) | Phase · freq                            | Source                                                                                           |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- | ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| D1  | Helgerud 4 × 4 (_fire ganger fire_) | Maximise VO2max via stroke-volume stress; the reference HIIT protocol               | 4 × 4 min at **90–95 % HRmax**, 3 min active recovery at 70 % HRmax                                  | 45–55 min | 65–90      | Build, peak · 1–3×/wk (3× in the trial) | Helgerud et al., _Med Sci Sports Exerc._ 2007;39(4):665–671                                      |
| D2  | Seiler 4 × 8 (_fire ganger åtte_)   | The dose/intensity sweet spot — largest gains of 4×4 / 4×8 / 4×16                   | 4 × 8 min at maximal _sustainable_ even effort (~95–100 % T-pace †, ≈ 10 k effort), 2 min recovery   | 55–70 min | 75–100     | Build · 1–2×/wk                         | Seiler et al., _Scand J Med Sci Sports_ 2013;23(1):74–83                                         |
| D3  | Billat 30/30 (_tretti-tretti_)      | Maximise _time at_ VO2max with minimal lactate cost; excellent first VO2max session | 12–20 × (30 s at 100 % vVO2max → 30 s at 50 % vVO2max)                                               | 40–55 min | 55–80      | Build · 1×/wk                           | Billat et al., _Eur J Appl Physiol_ 2000;81(3):188–196; Billat, _Sports Med_ 2001 (Parts I & II) |
| D4  | Daniels `I` reps                    | Classic VO2max development at ~3–5 k race pace                                      | 5–6 × 1000 m at `I`, jog recovery ≈ rep duration; cap `I` at 8 % of weekly volume or 10 % of session | 55–70 min | 70–95      | Build, peak · 1×/wk                     | Daniels, _Running Formula_                                                                       |
| D5  | 6 × 3 min (_treminuttere_)          | Shorter reps for athletes who over-pace 4-min reps; hill-friendly                   | 6 × 3 min at `I` / 92–95 % HRmax, 2–3 min jog                                                        | 50–60 min | 65–85      | Build · 1×/wk                           | Daniels `I`; Tønnessen et al. 2024 session models                                                |
| D6  | Broken 5k ladder (_pyramide_)       | Pace-change tolerance plus VO2max; race-simulation flavour                          | 1-2-3-2-1 min at `I`, equal jog recovery, ×2 sets                                                    | 50–65 min | 65–90      | Peak · 1× per 2 wks                     | Hudson, _Run Faster_; common Norwegian _pyramidedrag_                                            |

### Notation & variants

| #   | Workout Notation                                                                                  | Progression                                                                          | Regression                   |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| D1  | `10 min warm-up → 4 × (4 min @ 90–95% max HR · Z5 → 3 min @ 70% max HR) → 10 min cool-down`       | 5 reps; recovery 3 → 2 min. Do **not** raise intensity — the ceiling is the protocol | 3 reps; recovery 4 min       |
| D2  | `15 min warm-up → 4 × (8 min @ 95–100% T-pace → 2 min Easy) → 10 min cool-down` †                 | 5 × 8 min; recovery 2 → 90 s                                                         | 4 × 6 min; or 3 × 8 min      |
| D3  | `15 min warm-up → 16 × (30 s Interval → 30 s Easy) → 10 min cool-down`                            | 20 reps; then 2 sets of 12 with 4 min between                                        | 12 reps; recovery jog → walk |
| D4  | `3 km warm-up → 5 × (1000 m Interval → 3 min Easy) → 2 km cool-down`                              | 6 reps; recovery 3 → 2 min                                                           | 4 × 800 m, 3 min jog         |
| D5  | `3 km warm-up → 6 × (3 min Interval → 2 min Easy) → 2 km cool-down`                               | 8 reps; recovery 2 min → 90 s                                                        | 5 × 2 min, 2 min jog         |
| D6  | `3 km warm-up → 2 × (1 min → 2 min → 3 min → 2 min → 1 min Interval, equal jog) → 2 km cool-down` | 3 sets; or extend the peak rung to 4 min                                             | 1 set, then 10 min Easy      |

**Two protocol-fidelity notes.**

1. **D1 is HR-anchored on purpose.** Helgerud prescribed 90–95 % HRmax, not a
   pace. Re-expressing it as `Interval` (a pace zone) breaks the citation, and
   HR's lag means the first rep will read low — the protocol accepts that.
   trainm8 can author this correctly today via `hrPct { ref: 'max' }`.
2. **D2's finding is about duration, not intensity.** Seiler's 4×8 group
   out-gained both 4×4 and 4×16 at _self-selected maximal sustainable_
   intensity. Prescribing a fixed % of vVO2max for 4×8 misses the mechanism; the
   anchor is "the hardest even effort you can hold for all four reps", which is
   closest to RPE 8 / `@ RPE 8` in trainm8's vocabulary.

---

## 7. Archetype E — Race-specific (Canova percentage system)

This archetype exists _only_ as percentages of goal race pace. Every row is
marked ‡ because none of it is authorable today.

### Prescription

| #   | Name (norsk)                           | Purpose                                                                                  | Structure (anchors)                                                                                  | Volume       | TSS (est.) | Phase · freq                                    | Source                                                    |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------ | ---------- | ----------------------------------------------- | --------------------------------------------------------- |
| E1  | 5k special endurance                   | Support race pace from below at 95 % — extends the duration you can hold near race speed | 4 × 2000 m at **95 % of 5k pace**, 3 min jog                                                         | 55–70 min    | 70–95      | Specific/peak · 1×/wk                           | Canova (5k sample: "4 × 2 km at 95 % w/ 3 min jog")       |
| E2  | 10k specific                           | Rehearse exact race pace at fractional race volume                                       | 5 × 2000 m at **100 % of 10k pace**, 2–3 min jog                                                     | 60–75 min    | 80–105     | Peak · 1× per 1–2 wks                           | Canova (10k sample: "5 × 2 km at 100 %")                  |
| E3  | Half-marathon specific                 | Long specific volume near race pace                                                      | 3 × 5 km at **100–102 % of HM pace**, 3 min jog — or 12–15 km continuous at 98 % HM                  | 90–110 min   | 110–150    | Peak · 1× per 2 wks                             | Canova; Pfitzinger HM tune-up                             |
| E4  | Marathon alternations (_cambio ritmo_) | The signature Canova session: race pace stress with 90 % floats instead of rest          | 8–10 × (1 km at **105 % MP** → 1 km at **90 % MP**), unbroken                                        | 20–24 km     | 160–210    | Specific/peak (advanced) · 1× per 2–3 wks       | Canova (marathon sample); Running Writings reconstruction |
| E5  | Canova special block                   | Two specific sessions in one day on partially depleted glycogen                          | AM: 10–12 km with 6–8 km at 95–100 % MP · PM (5–7 h later): 8–10 × 1000 m at 102–105 % MP, 2 min jog | 35–45 km/day | 250–340    | Specific (elite/advanced only) · 1× per 3–4 wks | Canova "special block"                                    |
| E6  | Extension long run at 90–95 % MP       | Canova's extension principle: hold near-race speed for progressively longer              | Continuous 18 → 25 → 30 km at 90–95 % MP                                                             | 18–30 km     | 130–220    | Specific · progressive across the block         | Canova; see also B4                                       |

### Notation & variants

| #   | Workout Notation                                                                                                                       | Progression                                                          | Regression                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| E1  | `3 km warm-up → 4 × (2 km @ 95% 5k → 3 min Easy) → 2 km cool-down` ‡                                                                   | 95 → 98 → 100 % 5k; jog 3 → 2 min                                    | 4 × 1500 m at 95 %; or 5 × 1000 m at 100 % |
| E2  | `3 km warm-up → 5 × (2 km @ 100% 10k → 3 min Easy) → 2 km cool-down` ‡                                                                 | 6 reps, or jog 3 → 2 min (Canova progresses by _shrinking recovery_) | 4 × 1600 m at 100 %                        |
| E3  | `3 km warm-up → 3 × (5 km @ 100–102% HM → 3 min Easy) → 2 km cool-down` ‡                                                              | Merge into 15 km continuous at 98–100 % HM                           | 3 × 3 km at 100 % HM                       |
| E4  | `3 km warm-up → 10 × (1 km @ 105% MP → 1 km @ 90% MP) → 2 km cool-down` ‡                                                              | 12 sets; raise floats 90 → 93 % MP (this is the hard progression)    | 6 sets; floats at 85 % MP                  |
| E5  | AM `2 km warm-up → 8 km @ 95–100% MP → 2 km cool-down` · PM `3 km warm-up → 10 × (1 km @ 102–105% MP → 2 min Easy) → 2 km cool-down` ‡ | Shorten the AM–PM gap; raise AM to 100 % MP                          | Split across two days                      |
| E6  | `25 km @ 92% MP` ‡                                                                                                                     | Extend distance first, then raise the percentage                     | 15 km at 88 % MP                           |

**Why this archetype is the argument for a race-pace anchor.** A pace-based
substitution (`@ 3:15 /km`) is correct for exactly one athlete on exactly one
day. A zone-label substitution (`Threshold`) is wrong: 105 % MP is nowhere near
threshold for a 2:10 marathoner and is _past_ threshold for a 4:30 marathoner.
Only the percentage-of-own-race-pace form survives both substitutions — which is
the definition of portable.

---

## 8. Archetype F — Speed, repetition & neuromuscular

### Prescription

| #   | Name (norsk)                   | Purpose                                                                        | Structure (anchors)                                                                                        | Volume            | TSS (est.) | Phase · freq                                      | Source                                                                   |
| --- | ------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------- | ---------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| F1  | Strides (_stigningsløp_)       | Recruit fast fibres, improve economy and mechanics at near-zero metabolic cost | 6–10 × 15–25 s accelerating to ~mile/1500 m effort, holding form, then decelerating; 45–90 s full recovery | Appended to A2/A3 | +3–6       | **All phases including race week** · 2–4×/wk      | Daniels; Hudson; universal elite practice                                |
| F2  | `R` reps, 200 m                | Speed and running economy without VO2max cost                                  | 8–10 × 200 m at `R` (≈ 1500 m pace), 200 m jog (full recovery); cap `R` at 5 % of weekly volume            | 45–60 min         | 45–65      | Base, taper · 1×/wk                               | Daniels `R`                                                              |
| F3  | `R` reps, 400 m                | Same, with more speed-endurance                                                | 6–8 × 400 m at `R`, 400 m jog or 3 min standing                                                            | 50–65 min         | 55–75      | Base, peak · 1× per 1–2 wks                       | Daniels `R`; Lydiard track phase                                         |
| F4  | Hill sprints (_bakkesprint_)   | Maximal-force, low-impact strength stimulus; injury-prophylactic               | 6–10 × 8–12 s **maximal** effort up a 6–10 % hill, walk down + 2 min full recovery                         | Appended to A2    | +5–10      | Base (introduce), all phases (maintain) · 1–2×/wk | Hudson, _Run Faster_; Magness, _Science of Running_                      |
| F5  | Flying 30s (_flyvende tretti_) | Top-end speed on the flat with a rolling start                                 | 5–6 × 30 s at 95 % of maximal speed after a 30 m rolling entry, 3 min walk                                 | 40–50 min         | 30–45      | Base, taper · 1× per 2 wks                        | Sprint-transfer practice; Haugen et al. 2021 on middle-distance training |

### Notation & variants

| #   | Workout Notation                                                       | Progression                                                           | Regression                    |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------- |
| F1  | `50 min Easy → 8 × (20 s Repetition → 60 s Easy)`                      | 6 → 10 reps; 20 → 25 s; move to a 1–2 % rise                          | 4 × 15 s on grass             |
| F2  | `3 km warm-up → 10 × (200 m Repetition → 200 m Easy) → 2 km cool-down` | 12 reps; shorten jog to 100 m (this makes it an `I` session — beware) | 6 × 200 m, full walk recovery |
| F3  | `3 km warm-up → 6 × (400 m Repetition → 3 min rest) → 2 km cool-down`  | 8 reps; jog rather than stand                                         | 6 × 300 m                     |
| F4  | `40 min Easy → 8 × (10 s @ RPE 10 → 2 min rest)`                       | 6 → 10 reps over 4 weeks; then 12–15 s                                | 4 × 8 s on a gentler grade    |
| F5  | `3 km warm-up → 5 × (30 s @ RPE 9 → 3 min rest) → 2 km cool-down`      | 6 reps                                                                | 4 reps of 20 s                |

**Stride prescription, spelled out** (this is the most commonly mis-prescribed
item in the library):

- **Duration, not distance** — 15–25 s. Distance-based strides (100 m) become a
  time trial for slow runners and a jog for fast ones. This is a portability
  argument identical to the race-pace one.
- **Effort, not pace** — "smooth, fast, relaxed, ~mile effort", never maximal. A
  stride that leaves you breathing hard was a rep, not a stride.
- **Full recovery** — 45–90 s; the point is quality mechanics, not fatigue.
- **Frequency** — 2–4×/wk year-round, including race week and taper (they are
  one of the very few things you _add_ during a taper).
- **Load** — negligible; do not price strides into a session's TSS beyond a few
  points, and do not count them as a quality session in a hard/easy ledger.

---

## 9. Archetype G — Hills (_bakke_)

Hill work splits into three physiologically distinct things that share a word.
Conflating them is a common library-design error.

### Prescription

| #   | Name (norsk)                          | Purpose                                                                                 | Structure (anchors)                                                                                       | Volume    | TSS (est.) | Phase · freq                                   | Source                                                                       |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| G1  | Long hill reps (_bakkedrag_)          | VO2max stimulus at lower impact than flat `I`; specific strength                        | 5–8 × 3 min uphill (4–7 % grade) at `I` effort / 92–95 % HRmax, jog down (≈ 2–3 min)                      | 55–70 min | 70–95      | Base→build · 1×/wk                             | Lydiard hill phase; Daniels `I` on hills                                     |
| G2  | Short hill reps (_korte bakkedrag_)   | Anaerobic power + mechanics; the bridge between F4 sprints and G1                       | 8–12 × 60–90 s uphill at `R`–`I` effort (RPE 8–9), jog down                                               | 45–60 min | 55–80      | Base, build · 1×/wk                            | Lydiard; Hudson                                                              |
| G3  | Hilly tempo (_kupert terskel_)        | Threshold effort on rolling terrain — effort held constant, pace allowed to vary widely | 25–40 min continuous on rolling terrain at `T` **effort** (RPE 6–7 / 88–92 % HRmax); ignore pace entirely | 55–80 min | 65–95      | Build (esp. trail/hilly-course goals) · 1×/wk  | Pfitzinger; standard trail-marathon practice                                 |
| G4  | Lydiard hill circuit (_bakketrening_) | Springing/bounding + running as one continuous strength circuit                         | 3–4 × [ 200 m steep hill bounding → jog to top → 200 m stride on flat → jog down ], continuous            | 50–70 min | 60–85      | Late base / hill phase · 2–3×/wk for 3–4 wks   | Lydiard, _Running to the Top_                                                |
| G5  | Downhill reps (_utforløp_)            | Eccentric loading; mandatory prep for downhill-heavy races                              | 6–8 × 60–90 s at controlled 3–6 % **descent**, ~10 k effort, walk/jog back up                             | 45–60 min | 40–65      | Build, peak (course-specific) · 1× per 1–2 wks | Vernillo et al., uphill/downhill running physiology; standard trail practice |

### Notation & variants

| #   | Workout Notation                                                                                   | Progression                                                                | Regression                    |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| G1  | `3 km warm-up → 6 × (3 min @ 92–95% max HR · Z5 → 3 min Easy) → 2 km cool-down`                    | 8 reps; 3 → 4 min; steeper grade                                           | 4 × 2 min on a gentler grade  |
| G2  | `3 km warm-up → 10 × (75 s @ RPE 8 → 2 min Easy) → 2 km cool-down`                                 | 12 reps; jog-down recovery shortened                                       | 6 × 60 s                      |
| G3  | `2 km warm-up → 35 min @ RPE 6–7 · Z4 → 2 km cool-down`                                            | 35 → 45 min; hillier route                                                 | 20 min; flatter route         |
| G4  | `3 km warm-up → 4 × (200 m @ RPE 9 → 3 min Easy → 200 m Repetition → 3 min Easy) → 2 km cool-down` | 5–6 circuits                                                               | 2 circuits; walk the bounding |
| G5  | `3 km warm-up → 8 × (90 s @ RPE 7 → 3 min Easy) → 2 km cool-down`                                  | 10 reps; steeper descent — **progress slowly**, DOMS is severe and delayed | 4 × 60 s at 3 %               |

**Grade discipline.** G1/G2/G4 are all _uphill_, where pace is not a legitimate
target; every one of these rows anchors on HR or RPE, and that is a prescription
decision, not a data limitation. G3 is the interesting case: the _whole point_
is that pace varies while effort does not, which makes a pace-anchored authored
target actively wrong. See §11.

---

## 10. Archetype H — Trail & vertical

Trail sessions are where the app's step model runs out of quantities: none of
these can be authored with `durationSec`/`distanceM` alone.

### Prescription

| #   | Name (norsk)                                         | Purpose                                                                         | Structure (anchors)                                                          | Volume                  | TSS (est.) | Phase · freq                                            | Source                                                                        |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------- | ---------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| H1  | Vertical repeats (_høydemeterdrag_)                  | Climbing-specific VO2max and muscular endurance, measured in vertical metres    | 4–6 × 150–250 vertical metres at `T`–`I` effort, easy descent recovery       | 700–1200 vm, 70–100 min | 80–120     | Build · 1×/wk                                           | Skyrunning/vertical-km practice; Giovanelli et al. on VK energetics           |
| H2  | Power-hike intervals (_gangintervall_)               | Race-specific: above ~15–20 % grade, hiking is more economical than running     | 6 × 4 min steep power-hike at 85–90 % HRmax, 2 min easy descent              | 600–900 vm, 60–80 min   | 65–95      | Build, peak (ultra/steep-course goals) · 1× per 1–2 wks | Giovanelli et al., _J Appl Physiol_ 2016 (steeper-is-cheaper); ultra practice |
| H3  | Technical descent reps (_teknisk utfor_)             | Descent skill and eccentric tolerance — a _skill_ session, not a load session   | 5–6 × 2–3 min technical descent at controlled RPE 6–7, walk/jog back up      | 60–80 min               | 45–70      | Build, peak · 1× per 1–2 wks                            | Vernillo et al. 2017; trail-coaching practice                                 |
| H4  | Long mountain run (_fjelltur_ / _langtur i terreng_) | Time-on-feet, fuelling rehearsal, terrain durability                            | 2.5–5 h at `E` effort with 800–2000 vm; hike all steep sections deliberately | 2.5–5 h                 | 180–350    | Base, build · 1× per 1–2 wks                            | Standard ultra/trail practice; Scheer et al. off-road position statement      |
| H5  | Uphill time trial / VK test (_motbakketest_)         | Portable fitness test where flat-pace tests are impossible — vm/h is the metric | 20–30 min sustained maximal climb; record **vertical metres per hour**       | 60–80 min               | 75–105     | Base and peak (bookend a block) · 2–3× per season       | Vertical-kilometre racing convention                                          |

### Notation & variants

| #   | Workout Notation                                                                                                   | Progression                                                                | Regression                |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------- |
| H1  | `15 min warm-up → 5 × (200 vm @ RPE 7 → descent Easy) → 10 min cool-down` — **`vm` is not a quantity trainm8 has** | 6 reps; 250 vm; raise to RPE 8                                             | 3 × 150 vm                |
| H2  | `15 min warm-up → 6 × (4 min @ 85–90% max HR · Z4 → 2 min Easy) → 10 min cool-down`                                | 8 reps; steeper grade; add a weighted vest/pack                            | 4 × 3 min                 |
| H3  | `15 min warm-up → 5 × (3 min @ RPE 6–7 → 4 min Easy) → 10 min cool-down`                                           | More technical terrain (never faster)                                      | 3 reps on a smoother line |
| H4  | `4 h Easy` (with a target of ~1500 vm — again unrepresentable)                                                     | +30 min or +300 vm per fortnight                                           | 2 h with 500 vm           |
| H5  | `20 min warm-up → 25 min @ RPE 9 → 15 min cool-down`                                                               | Compare vm/h against the previous test — the test itself does not progress | 15 min effort             |

**The representational gap.** H1, H4 and H5 all have _vertical metres_ as their
primary quantity, and H2/H3 have _grade_ as a defining parameter. `WorkoutStep`
(ADR 0002 / ADR 0007) quantifies `durationSec` and `distanceM`. Seeding these
rows without a `verticalM` quantity and a `gradePct` parameter means either
storing the real prescription in `notes` (unqueryable, unverifiable against a
recording, invisible to the AI planner) or not seeding them at all.

---

## 11. Grade-adjusted targets, treadmill equivalents, and terrain

### The energetics

- **Uphill.** Minetti et al. measured the metabolic cost of running across
  gradients from −45 % to +45 %; cost rises steeply and non-linearly with
  positive grade. The practical field heuristic — roughly **+12–15 s/km per 1 %
  of grade** at moderate grades — is a linearisation that holds only to about
  5–8 % and then under-predicts badly.
- **Downhill is not symmetric.** The metabolic _minimum_ sits around −10 % to
  −20 %, and the pace benefit from descending is far smaller than the penalty
  from climbing — a common rule of thumb is that you recover only about half of
  what a climb costs. Eccentric muscle damage, meanwhile, has no metabolic
  signature at all: a downhill session can be metabolically trivial and
  mechanically severe, so **grade-adjusted pace systematically under-prices
  descent load**.
- **Running gives way to walking.** Above roughly 15–20 % grade, uphill
  _walking_ becomes as economical as or more economical than running (Giovanelli
  et al.) — which is why H2 prescribes power-hiking rather than treating it as a
  failure to run.

### Prescription rules on hills

| Situation                                      | Correct anchor                        | Wrong anchor                  |
| ---------------------------------------------- | ------------------------------------- | ----------------------------- |
| Uphill reps (G1, G2, H1, H2)                   | HR (%HRmax), RPE, or running power    | Pace or grade-adjusted pace   |
| Rolling tempo (G3)                             | RPE / %LTHR held constant             | Any pace target               |
| Downhill reps (G5, H3)                         | RPE + a hard cap on volume            | HR (misleadingly low) or pace |
| Long mountain run (H4)                         | RPE + a `E`-effort ceiling            | Pace; distance                |
| Flat sessions on a _slightly_ undulating route | Pace, with an explicit tolerance band | A single pace value           |

The general rule: **hold effort constant and let pace float**, and record the
_intent_ alongside the target so a later comparison against the recording knows
not to flag the pace deviation as non-adherence. This has a direct consequence
for ADR 0019's adherence bands and ADR 0034's plan verification: a hill session
executed perfectly will look like a pace miss.

The counterpart on the _analysis_ side is grade-adjusted pace (GAP) / normalised
graded pace — covered in
[activity-analysis-metrics.md](activity-analysis-metrics.md), and blocked today
because `ActivityStream` carries no altitude or distance channel (README defect
#4). So neither the prescription side nor the measurement side of grade is
currently expressible.

### Treadmill equivalents

- **Set 1 % incline** to approximate outdoor energetic cost, per Jones & Doust,
  whose finding holds at speeds above roughly 13 km/h; at slower speeds 0 % is
  closer, and setting 1 % for a beginner over-corrects.
- **Every anchor in this library transfers except pace-on-hills.** `T`, `I`,
  `R`, %HRmax and RPE all work unmodified. A treadmill's speed display is a
  _better_ pace anchor than GPS for D1–D4, because it removes pacing noise.
- **Treadmill-specific advantages the Norwegian tradition exploits** (Bakken is
  explicit about this): exact intensity control makes double threshold sessions
  repeatable and comparable session-to-session — the AM/PM C3/C4 pair is easier
  to execute correctly indoors than outdoors.
- **Treadmill-specific caveats.** Heat accumulation raises HR at the same
  velocity (drift, not intensity); belt assistance reduces the eccentric
  component; and downhill reps (G5) are impossible on most consumer treadmills.
- **Uphill treadmill work** substitutes cleanly for G1/G2/H2 (and is safer for
  H2 power-hiking), but note that the belt does not reproduce descent, so a
  treadmill-only trail build leaves G5/H3 entirely untrained.

---

## 12. Programming: phase × goal × level

### Which archetypes dominate which phase

| Phase               | Dominant archetypes                | Typical quality sessions/wk | Notes                                                                                          |
| ------------------- | ---------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| **Base**            | A, B1–B2, C1–C4, F1, F4, G1–G2, G4 | 1–2 (+ strides)             | Lydiard: build the aerobic ceiling first. Norwegian: threshold _is_ base work, not build work. |
| **Build**           | C (all), D1–D5, B3, B6, G3, H1–H2  | 2–3                         | The archetype-densest phase; where the 4×4 / 4×8 protocols live.                               |
| **Peak / specific** | E (all), C6, D6, B4, E6            | 2–3                         | Canova: everything converges on 95–105 % RP. Volume plateaus, specificity rises.               |
| **Taper**           | F1, F2, I1, reduced C2/D4          | 1–2 (sharp, short)          | Cut _volume_ 40–60 %, keep intensity and frequency. Strides go **up**.                         |
| **Race week**       | A1–A3, I2–I3                       | 1 (a primer, not a workout) | Nothing here builds fitness; the goal is freshness plus rhythm.                                |

### Which archetypes dominate which goal

| Goal              | Signature sessions                      | De-emphasised                                |
| ----------------- | --------------------------------------- | -------------------------------------------- |
| **5k**            | D1–D6, E1, F2–F3, C2                    | Long-run extension beyond ~100 min           |
| **10k**           | C2, C7, D2, D4, E2                      | `R` volume; very long runs                   |
| **Half**          | C1–C6, E3, B3, B6                       | `R` work; 30/30s                             |
| **Marathon**      | B3–B6, C5–C6, E4–E6, A4                 | `R` work; D3                                 |
| **Trail / ultra** | H1–H5, G1–G5, B1, C3 (effort-based), A2 | Track `I`/`R`; flat pace targets of any kind |

### Level scaling

| Level            | Volume      | Quality/wk               | Which rows are off-limits               | How to regress a row                                                                                                           |
| ---------------- | ----------- | ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Beginner**     | <40 km/wk   | 1–2 (one may be strides) | A4, C3, C4, E4, E5, D2 at full dose, H4 | Halve the rep count first, then shorten reps, then lengthen recovery. Never soften the anchor — a beginner's `T` is still `T`. |
| **Intermediate** | 40–80 km/wk | 2–3                      | E5; C3/C4 as a _daily double_           | Reduce sets before intensity; keep the citation's intensity intact.                                                            |
| **Advanced**     | 80 km+/wk   | 3, or 2 doubles + 1      | —                                       | Canova's own order: extend volume → extend rep length → shorten recovery → raise the percentage. Raise percentage last.        |

**The regression rule, stated once.** Every regression in this library reduces
_volume or density_, never the anchor. That is what makes the anchor portable: a
30-minute 5k runner doing `4 × 6 min @ 95% T-pace` and a 17-minute runner doing
the same session are doing the same physiology at different speeds. Drop one to
`4 × 6 min @ 85% T-pace` and they are no longer doing the same session at all —
they are doing an easy run with extra steps.

---

## 13. Implications for trainm8

### 13.1 Seed a starter library — but as templates, not sessions

The 50 rows above should ship as a **`WorkoutTemplate` catalogue**, seeded in a
migration the way ADR 0007 already seeds `Exercise` (~50–100 entries, athlete
extensible). Templates are _not_ `WorkoutSession` rows: they have no date, no
athlete, and no completion state. Instantiating a template creates a session
(the ADR 0004 hub) whose Workout is a deep copy of the template's block/step
tree, with the athlete's own thresholds resolved into cached ranges at that
moment.

This is the cheapest way to make three things true at once:

1. **The AI planner (ADR 0016) stops inventing sessions.** Plan generation
   becomes retrieval-and-substitute over a cited corpus, filtered by
   `archetype × phase × goalEvent × level`. That is a smaller, auditable, and
   far more defensible generation surface than free-form step synthesis, and it
   makes generation provenance real rather than nominal.
2. **The manual planner (ADR 0039) gets a starting point.** "Add a threshold
   session" resolves to eight cited candidates rather than an empty form.
3. **The Plan Outline (ADRs 0041–0044) gets something to hang on its phases.** A
   phase that carries no load (ADR 0041) can still carry _archetype emphasis_,
   and this catalogue is what that emphasis dereferences to.

### 13.2 The data shape the library needs

Beyond the existing `Workout → Block → Step` tree:

| Field                                                                                                        | Why                                                                                                        | Exists?       |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------- |
| `archetype` enum (`easy \| long \| threshold \| vo2max \| raceSpecific \| speed \| hill \| trail \| tuneUp`) | The grouping the whole library is organised by; the planner's primary filter                               | No            |
| `phases: Phase[]`                                                                                            | Multi-valued — most rows span 2–3 phases                                                                   | No            |
| `goalEvents: Discipline+Distance[]`                                                                          | 5k/10k/HM/M/trail applicability                                                                            | No            |
| `level` band                                                                                                 | Off-limits rows per §12                                                                                    | No            |
| `citation` (structured: author, work, year, DOI/ISBN)                                                        | Non-negotiable for a library that claims to be published protocols                                         | No            |
| `progressesTo` / `regressesTo` self-relations                                                                | §12's variants, as edges rather than prose                                                                 | No            |
| `intensityFidelity` note                                                                                     | Where the library _translates_ a source lossily (C3/C4's lactate → pace)                                   | No            |
| `verticalM` step quantity                                                                                    | H1, H4, H5 are otherwise unrepresentable                                                                   | No (ADR 0002) |
| `gradePct` step parameter                                                                                    | G1–G5, H2, H3; also the input to any GAP-aware load                                                        | No            |
| Template visibility/ownership                                                                                | Seeded rows have no athlete owner; ADR 0037 models per-workout visibility but not a system-owned catalogue | Partial       |

### 13.3 The intensity model must gain two anchor kinds

This is the single most important finding. `IntensityTargetSchema` cannot
express:

- **`pacePct`** — `{ kind: 'pacePct', minPct, maxPct }`, resolved against
  `DisciplineProfile.thresholdPaceSecPerKm`. This is the exact pace-channel
  analogue of the existing `powerPct`, and the resolver work is nearly
  identical: `daniels-pace-5` is already `anchor: 'thresholdPace'`
  (`app/utils/zones/recipes.ts:150`), so the ratio maths and the zone-chip facet
  already exist. It unblocks C3, C7, C8, D2 — the entire Norwegian sub-threshold
  family. **Low cost, high yield; do this first.**
- **`racePace`** —
  `{ kind: 'racePace', event: '1500m' | '5k' | '10k' | 'hm' | 'marathon', minPct, maxPct }`.
  Renders as `@ 105% MP` / `@ 95% 5k`. This is strictly harder because it needs
  a _race-pace reference_ on the athlete that does not exist today: ADR 0027's
  A2 declined to ship the `equivalent` facet precisely because fabricating "HM
  pace" from threshold pace would breach the Unavailable Metric principle. The
  right answer is not to derive it — it is to **store it**, as either a recent
  race result or an explicit goal pace on the Event (ADR 0009 already makes
  Event the plan anchor, which is the natural home for a goal pace). Then
  `@ 105% MP` resolves honestly when a goal marathon pace exists and degrades to
  the bare authored form (`@ 105% MP`, no range facet) when it does not —
  exactly the behaviour `powerPct` already has without FTP, per the existing
  test at `app/utils/workout-notation.test.ts:396`.

Both fit the existing render-never-parse notation cleanly: they are new
discriminated-union members with new `@ …` token text and the same `· Zn` facet,
requiring no grammar and no parser.

### 13.4 Secondary implications

- **A sub-threshold zone band.** `daniels-pace-5` has a single `T`. The
  Norwegian tradition operates in a band _below_ it (2.0–3.0 mmol). Either a new
  recipe (`norwegian-threshold-*`) or an explicit sub-`T` band is needed before
  C3/C4 can be seeded truthfully.
- **Hill sessions will read as non-adherent.** ADR 0019's adherence bands and
  ADR 0034's plan verification compare execution to prescription; a
  correctly-executed G3 hilly tempo deviates from any pace target by design.
  Sessions need an `effortAnchored` flag that suppresses pace-based adherence
  scoring.
- **Load under-prices hills and over-prices nothing.** Grade-blind rTSS
  under-counts G1–G5 and H1–H5; grade-adjusted pace would fix the climbs and
  still under-count descents (§11). Until `ActivityStream` gains altitude
  (README defect #4), HR-first load (ADR 0008) is actually the _more honest_
  channel for this archetype — an accidental point in its favour.
- **Strides must not be modelled as a quality session.** F1 appended to A3 must
  not flip the day's classification in any hard/easy or session-goal TID
  computation. This interacts with the session-goal TID method described in
  [intensity-distribution.md](intensity-distribution.md).
- **Norwegian naming is a real requirement, and ADR 0027 A3 declines it.** A3
  fixed the notation language to en-GB. This library's names (_langtur_,
  _terskel_, _bakkedrag_, _stigningsløp_, _rolig_) are the terms the app's
  Norwegian users actually use, and they are not translations of the English —
  _bakkedrag_ and "hill reps" carry different default assumptions about length.
  A template's _name_ is content, not chrome; it can be bilingual without
  localising the notation's `warm-up` / `rest` glue.

### ADRs this research challenges

| ADR                                                      | Verdict                  | Why                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0007** Step as discriminated union                     | **Amend**                | `IntensityTarget` needs `pacePct` and `racePace`. The union shape is right; two members are missing, and their absence makes ~1/3 of the published running literature unauthorable.                                                                                                 |
| **0027** A2 — race-pace equivalent reserved, not shipped | **Supersede**            | The decision was framed as a _display facet_ that would have to be fabricated. It is actually an _authoring anchor_ that should be stored (goal pace on the Event, or a race-result reference on the profile), not derived. Canova's whole system is a race-pace percentage system. |
| **0027** A3 — notation language is English               | **Amend**                | Correct for the notation's glue words; wrong for workout _names_. The library's Norwegian domain terms are content and must survive.                                                                                                                                                |
| **0002** Step quantification                             | **Amend**                | No `verticalM` quantity and no `gradePct` parameter. H1/H4/H5 cannot be expressed; G1–G5 lose their defining parameter.                                                                                                                                                             |
| **0005** Athlete Profile & thresholds                    | **Amend**                | Needs a race-pace reference (recent result and/or goal pace) as a first-class anchor alongside LTHR/FTP/threshold pace, or `racePace` has nothing to resolve against.                                                                                                               |
| **0006** Zone system in code                             | **Amend**                | Recipes are immutable constants (confirmed good), but the catalogue is missing a Norwegian sub-threshold recipe and has no notion of an effort-only (grade-invalid) zone.                                                                                                           |
| **0016** AI plan generation                              | **Amend**                | Generation should retrieve from a cited template catalogue and substitute anchors, not synthesise step trees. This narrows the model's surface and makes provenance real.                                                                                                           |
| **0019** Plan adherence                                  | **Amend**                | Effort-anchored sessions (hills, trail, G3) will score as pace misses when executed perfectly. Adherence needs to know which channel the prescription actually anchored on.                                                                                                         |
| **0034** Detected-structure plan verification            | **Amend**                | Same cause: verification against a pace target is invalid for an effort-anchored session.                                                                                                                                                                                           |
| **0037** Workout visibility                              | **Amend**                | Models per-workout visibility for athletes; a system-owned, athlete-copyable template catalogue is a third case.                                                                                                                                                                    |
| **0008** TSS triad, HR-first                             | **Confirm**              | For hill and trail sessions HR is genuinely the most honest available channel; the fallback ladder's HR rung earns its place here.                                                                                                                                                  |
| **0009** Event as plan anchor                            | **Confirm** (and extend) | Event is the right home for a goal race pace, which is exactly what `racePace` needs.                                                                                                                                                                                               |
| **0023** Shared display formatting                       | **Confirm**              | New anchor kinds render through the same `format` layer with no structural change.                                                                                                                                                                                                  |
| **0033** Detection-confidence honesty bar                | **Confirm**              | The library's own lossy translations (lactate → pace) are the same class of honesty problem and should be labelled the same way.                                                                                                                                                    |
| **0041–0044** Plan Outline                               | **Confirm** (and extend) | Phases carrying archetype _emphasis_ rather than load is exactly right; this catalogue is what the emphasis dereferences to.                                                                                                                                                        |

---

## 14. Uncertainty and limitations

- **TSS values are estimates**, computed from notional IF for an intermediate
  athlete, not measured. Ranges are ±25 % at best. Do not surface them as
  precise numbers.
- **The Norwegian double-threshold rows (C3, C4, C7, C8) are translations.** The
  source prescribes blood lactate; this library prescribes % of threshold pace.
  The mapping is coach-consensus, not published equivalence.
- **Canova's exact percentage bands vary by source and by athlete.** The primary
  text (Canova & Arcelli) is out of print and hard to obtain; the percentage
  tables reproduced here lean on a modern reconstruction, which is flagged
  in-line. Treat band edges (95 % vs 96 %) as approximate.
- **The 25–30 % long-run cap** and the **5 % / 8 % weekly caps on `R` and `I`**
  are coaching convention (Daniels states them explicitly) without an
  underpinning trial.
- **Grade-adjustment heuristics** (+12–15 s/km per 1 %) are field linearisations
  of a non-linear cost curve and break down above ~8 % grade.
- **DOIs and page numbers below were compiled from a combination of live
  verification and recall.** Helgerud 2007 (MSSE 39(4):665–671), Seiler 2013
  (Scand J Med Sci Sports 23(1):74–83) and the Canova/Bakken material were
  verified in this pass; the remaining identifiers should be re-checked before
  any of them is surfaced in-product as a citation.
- **No competitor product is named anywhere in this document**, per the research
  brief and the convention in [README.md](README.md).

---

## References

**Peer-reviewed**

- Helgerud J, Høydal K, Wang E, Karlsen T, Berg P, Bjerkaas M, et al. Aerobic
  high-intensity intervals improve V̇O2max more than moderate training. _Med Sci
  Sports Exerc._ 2007;39(4):665–671.
  doi:[10.1249/mss.0b013e3180304570](https://doi.org/10.1249/mss.0b013e3180304570)
- Seiler S, Jøranson K, Olesen BV, Hetlelid KJ. Adaptations to aerobic interval
  training: interactive effects of exercise intensity and total work duration.
  _Scand J Med Sci Sports._ 2013;23(1):74–83.
  doi:[10.1111/j.1600-0838.2011.01351.x](https://doi.org/10.1111/j.1600-0838.2011.01351.x)
- Billat VL, Slawinski J, Bocquet V, Demarle A, Lafitte L, Chassaing P,
  Koralsztein JP. Intermittent runs at the velocity associated with maximal
  oxygen uptake enables subjects to remain at maximal oxygen uptake for a longer
  time than intense but submaximal runs. _Eur J Appl Physiol._
  2000;81(3):188–196.
  doi:[10.1007/s004210050029](https://doi.org/10.1007/s004210050029)
- Billat LV. Interval training for performance: a scientific and empirical
  practice. Part I: aerobic interval training. _Sports Med._ 2001;31(1):13–31.
  Part II: anaerobic interval training. _Sports Med._ 2001;31(2):75–90.
- Billat V, Slawinski J, Bocquet V, Chassaing P, Demarle A, Koralsztein JP. Very
  short (15 s–15 s) interval-training around the critical velocity allows
  middle-aged runners to maintain V̇O2max for 14 minutes. _Int J Sports Med._
  2001;22(3):201–208.
- Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. Energy cost of walking and
  running at extreme uphill and downhill slopes. _J Appl Physiol._
  2002;93(3):1039–1046.
  doi:[10.1152/japplphysiol.01177.2001](https://doi.org/10.1152/japplphysiol.01177.2001)
- Giovanelli N, Ortiz ALR, Henninger K, Kram R. Energetics of vertical kilometer
  foot races; is steeper cheaper? _J Appl Physiol._ 2016;120(3):370–375.
  doi:[10.1152/japplphysiol.00546.2015](https://doi.org/10.1152/japplphysiol.00546.2015)
- Jones AM, Doust JH. A 1 % treadmill grade most accurately reflects the
  energetic cost of outdoor running. _J Sports Sci._ 1996;14(4):321–327.
  doi:[10.1080/02640419608727717](https://doi.org/10.1080/02640419608727717)
- Vernillo G, Giandolini M, Edwards WB, Morin J-B, Samozino P, Horvais N, Millet
  GY. Biomechanics and physiology of uphill and downhill running. _Sports Med._
  2017;47(4):615–629.
  doi:[10.1007/s40279-016-0605-y](https://doi.org/10.1007/s40279-016-0605-y)
- Tønnessen E, Sandbakk Ø, Sandbakk SB, Seiler S, Haugen T. Training session
  models in endurance sports: a Norwegian perspective on best practice
  recommendations. _Sports Med._ 2024;54(11):2935–2953.
  doi:[10.1007/s40279-024-02067-4](https://doi.org/10.1007/s40279-024-02067-4)
- Haugen T, Sandbakk Ø, Seiler S, Tønnessen E. The training characteristics of
  world-class distance runners: an integration of scientific literature and
  results-proven practice. _Sports Med Open._ 2022;8:46.
  doi:[10.1186/s40798-022-00438-7](https://doi.org/10.1186/s40798-022-00438-7)
- Haugen T, Sandbakk Ø, Enoksen E, Seiler S, Tønnessen E. Crossing the golden
  training divide: the science and practice of training world-class 800- and
  1500-m runners. _Sports Med._ 2021;51(9):1835–1854.
  doi:[10.1007/s40279-021-01481-2](https://doi.org/10.1007/s40279-021-01481-2)
- Casado A, Hanley B, Santos-Concejero J, Ruiz-Pérez LM. World-class
  long-distance running performances are best predicted by volume of easy runs
  and deliberate practice of short-interval and tempo runs. _J Strength Cond
  Res._ 2021;35(9):2525–2531.
  doi:[10.1519/JSC.0000000000003176](https://doi.org/10.1519/JSC.0000000000003176)
- Esteve-Lanao J, Foster C, Seiler S, Lucia A. Impact of training intensity
  distribution on performance in endurance athletes. _J Strength Cond Res._
  2007;21(3):943–949.

**Coaches and named systems (books)**

- Daniels J. _Daniels' Running Formula._ 4th ed. Human Kinetics; 2021. ISBN
  978-1718203662. — the E/M/T/I/R anchor set and VDOT.
- Pfitzinger P, Douglas S. _Advanced Marathoning._ 3rd ed. Human Kinetics; 2019.
  ISBN 978-1492568667. — LT runs, medium-long runs, MP long runs.
- Humphrey L, with Hanson K, Hanson K. _Hansons Marathon Method._ 2nd ed.
  VeloPress; 2016. ISBN 978-1937715489. — cumulative fatigue, the capped long
  run, tempo at goal MP.
- Hudson B, Fitzgerald M. _Run Faster from the 5K to the Marathon._ Broadway
  Books; 2008. ISBN 978-0767928229. — adaptive running, hill sprints, ladders.
- Canova R, Arcelli E. _Marathon Training: A Scientific Approach._ IAAF; 1999. —
  the percentage-of-race-pace system, special blocks, alternations.
- Lydiard A, Gilmour G. _Running to the Top._ Meyer & Meyer Sport; 1997. —
  aerobic base, the hill phase, periodisation.
- Magness S. _The Science of Running._ Origin Press; 2014. ISBN 978-0615942940.
  — hill sprints, mechanics, intensity-anchor reasoning.

**Coach-published web material (secondary, cited for provenance)**

- Bakken M. _The Norwegian Model._
  <https://www.mariusbakken.com/the-norwegian-model.html> — double threshold,
  lactate 2.3–3.0 mmol/L, session formats (6 min / 1000 m / 400 m / 45–15),
  treadmill control.
- Bell J. _A comprehensive overview of Canova-style "full-spectrum"
  percentage-based training for runners._ Running Writings; 2023.
  <https://runningwritings.com/2023/12/percentage-based-training.html> — the
  modern reconstruction of Canova's percentage bands and worked examples per
  event.
- Bell J. _The keys to marathon training: modern changes to Renato Canova's
  elite marathon training methods._ Running Writings; 2023.
  <https://runningwritings.com/2023/07/renato-canova-marathon-training-lecture.html>

**In-repo**

- [ADR 0002](../adr/0002-step-quantification.md),
  [0005](../adr/0005-athlete-profile-and-thresholds.md),
  [0006](../adr/0006-zone-system-in-code.md),
  [0007](../adr/0007-step-as-discriminated-union.md),
  [0009](../adr/0009-event-as-plan-anchor.md),
  [0016](../adr/0016-ai-plan-generation.md),
  [0019](../adr/0019-plan-adherence-planned-tss.md),
  [0027](../adr/0027-text-first-workout-authoring.md),
  [0034](../adr/0034-detected-structure-plan-verification.md),
  [0037](../adr/0037-workout-visibility-field.md),
  [0041](../adr/0041-plan-outline-phases-carry-no-load.md)–[0044](../adr/0044-plan-outline-is-relational.md)
- `app/utils/workout-schema.ts` (`IntensityTargetSchema`, line 57),
  `app/utils/workout-notation.ts` (`NOTATION_SEPARATORS`, line 55),
  `app/utils/intensity-target.ts`, `app/utils/zones/recipes.ts`
