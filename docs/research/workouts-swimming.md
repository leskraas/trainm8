# A swimming workout library

A citable catalogue of ~32 swim sessions spanning every archetype and phase,
pool and open water, triathlon and pure-swim, beginner to advanced — written in
the notation swimmers actually use, re-expressed in this repo's **Workout
Notation**, and used as a forcing function to find what the current data model
cannot say.

> **Read order note.** The task asked for `docs/research/workout-taxonomy.md`
> and `docs/research/portable-intensity-anchors.md` to be read first. **Neither
> exists** in this repo (2026-08). The seven documents listed in
> [`docs/research/README.md`](README.md) were read instead; the zone anchors and
> load formulas here are taken from
> [`zones-and-thresholds.md`](zones-and-thresholds.md),
> [`training-load-and-fitness-model.md`](training-load-and-fitness-model.md) and
> the shipped code (`app/utils/zones/recipes.ts`, `app/utils/load/formulas.ts`).

---

## TL;DR

- **Swimming is modelled in this repo, but only just.** `swim` is a discipline,
  `css-3`/`css-5` are zone recipes anchored on `cssSecPer100m`, and `sTSS`
  (`hours × (CSS/pace)² × 100`) is implemented. Everything _below_ that —
  send-off, stroke, equipment, mode, pool length, course — does not exist in
  `WorkoutStep`. A swim session is currently authorable only as a run with a
  different label.
- **Send-off is the missing primitive, and it is an _intensity_ mechanism, not a
  rest field.** `8 × 100 @ 1:40` prescribes a cycle time; the rest is the
  _residual_ (`send-off − swim time`), so the same written set is easy for a
  fast swimmer and near-maximal for a slow one. The model has only
  `RestStep.durationSec` — fixed rest — which is the one form real pool coaching
  uses _least_.
- **A send-off is portable only when it is expressed relative to the athlete's
  own CSS.** `100 on CSS + 10 s` means 1:50 at a 1:40 CSS and 2:20 at a 2:10 CSS
  and yields the same ~10 s rest for both. This is the single most important
  recommendation in this document: store send-off as
  `{ anchor: 'css', offsetSecPer100m }`, never as an absolute clock time.
- **Three shipped defects.** (1) The `pace` Intensity Target is `minSecPerKm`
  only, so an authored swim pace either displays as `/km` or is silently read as
  sec/100 m by the load math — `app/utils/zones/resolve.ts:139` writes it
  through unconverted and `app/utils/load/planned-tss.ts:120` reads it as
  per-100 m. (2) `formatDistance` renders a 1500 m swim step as `1.5 km` in the
  Token Sentence (`workout-notation.ts:746`) although `formatMeters` exists for
  exactly this. (3) `zone-equivalent.ts:222` divides an authored `pace` by 10
  for CSS recipes — a compensating hack that proves the unit is ambiguous.
- **Distance-prescribed sets are not TSS-portable, and that is physiologically
  correct.** The same written `30 × 100 @ CSS` is 71 TSS for a 1:20/100 m
  swimmer and 116 TSS for a 2:10/100 m swimmer, because TSS is time-denominated
  and the slower swimmer is in the water 63 % longer. Every distance-prescribed
  workout below therefore carries a **TSS range across CSS 1:20 → 2:10**, not a
  number. Time-prescribed work (T-30, continuous swims) _is_ TSS-portable.

---

## 1. How swimmers write workouts

Swimming has a written notation older and more standardised than anything in
running or cycling. It is chalked on whiteboards, printed on laminated cards,
and read from the wall at the end of the lane. It has to be terse and it has to
be unambiguous to a swimmer with foggy goggles.

### 1.1 The core sentence

```
8 × 100 free @ 1:40
│   │    │      └─ send-off / interval: leave every 1:40 on the pace clock
│   │    └──────── stroke
│   └───────────── distance per repetition, in the pool's own unit
└───────────────── repetitions
```

### 1.2 The notation elements

Swimming's notation is not folklore — parts of it are **formally published**.
The NISCA _Swimming & Diving Manual for New Coaches_ ch. 3 reproduces a complete
whiteboard shorthand called **"the '0' code"** (pp. 43–58), and US Masters
Swimming, Boston University Masters and numerous club programmes publish
glossaries with near-identical semantics. This is the closest thing any
endurance sport has to a standardised workout DSL, and it predates every
software tool.

| Element                          | Written                                                                                                                                   | Meaning                                                                                                                                                                              | Portable?                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Repetitions × distance**       | `8 × 100`                                                                                                                                 | 8 repeats of 100 (metres or yards, by pool)                                                                                                                                          | Yes                                                                                 |
| **Send-off / interval**          | `@ 1:40`, `on the 1:40`                                                                                                                   | Cycle time. Leave the wall every 1:40. **Rest is implied**: `1:40 − swim time`. USMS: "you have 1 minute, 30 seconds to complete each swim _and rest_ and then begin the next swim". | **No** — absolute clock                                                             |
| **Rest interval (RI)**           | `w/ :20 rest`, `+ 20 s`, `:10 RI`                                                                                                         | Rest measured from the touch, not from the clock. BU: "if you touch the wall at 2:53, you push off for the next swim at 3:03."                                                       | Partly — same seconds for everyone, but a bigger fraction of a slow swimmer's cycle |
| **"On the top / on the bottom"** | `100s on the top`, `on the :30`                                                                                                           | Absolute start anchor: leave when the pace-clock hand reaches 0/60 ("the top") or 30 ("the bottom"). Orthogonal to the send-off.                                                     | No                                                                                  |
| **"5/10 seconds apart"**         |                                                                                                                                           | Staggered lane departures within one set                                                                                                                                             | Yes (relative to lane-mate)                                                         |
| **Nested set**                   | `4 × (4 × 50 @ :45) w/ 1:00 between rounds`                                                                                               | A group of groups                                                                                                                                                                    | Yes                                                                                 |
| **Descend (`des`)**              | `4 × 100 descend 1–4`                                                                                                                     | Each consecutive swim _faster_ than the last. `8 × 50 descend every 4` = two descending runs.                                                                                        | Yes (relative)                                                                      |
| **Ascend (`asc`)**               |                                                                                                                                           | The reverse of descend                                                                                                                                                               | Yes                                                                                 |
| **Descending _interval_**        |                                                                                                                                           | The **send-off** shortens each rep — a different thing that shares the word                                                                                                          | Depends on anchor                                                                   |
| **Build (`BU`)**                 | `4 × 100 build`                                                                                                                           | Get faster _within_ each repeat; every rep swum the same way. BU handout: "often confused with Descend; Build has a distinct meaning."                                               | Yes (relative)                                                                      |
| **Build down (`BD`)**            |                                                                                                                                           | The reverse of build                                                                                                                                                                 | Yes                                                                                 |
| **Negative split (`NS`)**        | `3 × 400 negative split`                                                                                                                  | Second half of a swim faster than the first                                                                                                                                          | Yes (relative)                                                                      |
| **Broken swim (`br`, `RI-x`)**   | `broken 200 @ 50s w/ :10`                                                                                                                 | A race-distance swim cut into pieces with ~10 s breaks, timed as a whole; usually swum _faster_ than race pace                                                                       | Yes                                                                                 |
| **Ladder / pyramid**             | `25-50-75-100`, `25-50-100-50-25`                                                                                                         | Ascending, or up-and-down, rep lengths                                                                                                                                               | Yes                                                                                 |
| **IM order (`imo`)**             | `4 × 75 IMO`                                                                                                                              | Fly, back, breast, free — assigned by rep index                                                                                                                                      | Yes                                                                                 |
| **Reverse IM order (`RIMO`)**    | `4 × 75 Rev IMO`                                                                                                                          | Free, breast, back, fly                                                                                                                                                              | Yes                                                                                 |
| **IM transitions (`MT`)**        | `3 × 50 IM trans`                                                                                                                         | `#1 = 25 fly/25 back, #2 = 25 back/25 breast, #3 = 25 breast/25 free`                                                                                                                | Yes                                                                                 |
| **Mode**                         | `p` pull, `K` kick, `Dr` drill, swim                                                                                                      | Arms only (buoy), legs only, technique, whole stroke                                                                                                                                 | Yes                                                                                 |
| **Equipment**                    | `pad` paddles, `Ppad` pull w/ paddles, `z` zoomers (short fins), `DS` drag suit, `strap`/band, `NB` no board, `cordz`, `VK` vertical kick | Alters resistance, propulsion and breathing                                                                                                                                          | Yes                                                                                 |
| **Choice / stroke**              | `free`, `back`, `br`, `fly`, `IM`, `choice`                                                                                               |                                                                                                                                                                                      | Yes                                                                                 |
| **Race-pace token**              | `p200`                                                                                                                                    | "Swim repeat at race pace of the distance noted"                                                                                                                                     | Yes — anchored to the athlete's own race                                            |
| **Breath control**               | `hyp-x` (x strokes between breaths), `<flags>` no breathing outside the flags, `o/u` over/under                                           | Restricted breathing pattern                                                                                                                                                         | Yes — but hard safety constraints, §1.7                                             |
| **Recovery rule**                | `on heart x`                                                                                                                              | "Start the next repeat when heart rate decreases to x for a six-second count"                                                                                                        | Yes — a _condition_, not a duration                                                 |
| **Test token**                   | `T-30`                                                                                                                                    | "30 minute swim, count lengths"                                                                                                                                                      | Yes                                                                                 |
| **Distance unit**                | `25s`, `50s`, `100s`                                                                                                                      | Multiples of pool length; a "25" in a 25 yd pool is 22.86 m                                                                                                                          | **No** — course-dependent                                                           |

Sources: NISCA, _Swimming & Diving Manual for New Coaches_, ch. 3, "the '0'
code", p. 58; US Masters Swimming, _Glossary of Swimming Terms_ and _How Do I
Use the Pace Clock?_; Boston University Masters, _Helpful Terminology for
Masters Swimmers_; Mountain View Masters, _Workouts Glossary_; Mary Donahue,
_Swim Workout Vocabulary_.

⚠ **Two elements are universal in practice but undocumented in any glossary I
could reach**: parenthesised nesting `N × (M × d)`, and the bare plural `25s`.
Mountain View Masters documents the related but distinct "pattern repeating"
(`1 × 300: 50 free / 25 back / 25 breast`, a pattern that tiles a distance).

### 1.3 Send-off as an intensity mechanism

This is the structural difference from land sports, and the model must handle
it.

In running, a coach prescribes `6 × 1 km @ threshold pace, 90 s jog`. Work and
recovery are both explicit. In swimming, the coach prescribes `10 × 100 @ 1:30`
and the _rest is whatever is left_. Tightening the send-off from 1:40 to 1:30
without changing the target pace converts an aerobic set into a threshold set —
the work is identical and only the recovery shrank.

Three consequences:

1. **The send-off is the dial.** Coaches progress a set by dropping the send-off
   by 5 s, not by changing the target pace. This is the swim equivalent of
   raising FTP percentage, and there is no field for it.
2. **The set is self-policing.** A swimmer who cannot hold the pace loses rest,
   then misses the send-off and is pulled from the set. The prescription
   contains its own failure condition.
3. **It is only equal-stress within a lane.** Squads solve this by assigning
   different send-offs per lane for the same written set ("lane 1 on the 1:20,
   lane 3 on the 1:40"). That practice is exactly the "portable anchor" problem
   this document is about — coaches already solve it by _relativising the
   send-off_, and the data model should do the same, arithmetically.

**The portable form.** A send-off is portable when it is written as _target pace
plus rest allowance_, both anchored to the athlete:

```
10 × 100 on (CSS + 10 s)      ← 1:50 send-off at CSS 1:40; 2:20 at CSS 2:10
                                 both swimmers get ~10 s rest and the same stimulus
```

Everything in §3 is written this way.

### 1.3.1 Coaches solved this in the 1980s: the Cruise Interval

The single most important source found for this document. The NISCA coaches'
manual (ch. 3, p. 46, contributed by **Mark Onstott**, New Trier High School)
records both the problem and the solution, verbatim:

> If you arbitrarily divide the lanes and assign intervals, you will most likely
> have some swimmers getting too much rest, some swimmers getting too little
> rest… A simple solution to this problem is cruise intervals. **Cruise
> intervals were developed by Dick Bower**… a timed 600 yard swim is probably
> the easiest to administer… **By dividing the total time by 6, you get an
> average time for 100 yards. Bower added 10 seconds to this time and called it
> the cruise interval.**

and, attributing to Maglischo:

> the major advantage of cruise intervals is that they provide an easily
> understood and administrated structure for endurance training that encourages
> swimmers to train in **the individual range of endurance speeds that is best
> for them**… **By adding or subtracting time from the base interval, training
> can be accomplished at almost any intensity.**

That is, precisely, the portable-anchor construction this document argues for —
independently invented by swim coaches decades ago, and reduced to
lane-assignment lookup tables ("600 time 7:16–7:30 → cruise intervals :40 / 1:20
/ 2:40") taped to the pace clock. **`sendOff = f(threshold pace) + allowance` is
not a novel data model; it is transcribed coaching practice.**

The Boston University Masters handout gives the equivalent construct under the
name **Base Interval**, with a field test (5 × 100 max on :10 RI; net time ÷ 5;
add ~10 s) and two details worth encoding:

- **Base intervals live on a 5-second lattice.** The worked example rounds
  1:32.4 to "1:40 or 1:45". A stored send-off should quantise to 5 s, because
  that is what a pace clock affords.
- **"Missing your interval"** — swim time ≥ send-off, so rest is zero or
  negative — is a **defined failure state** in coaching practice, not an edge
  case.

Sub-consequence for the data model that follows from all of this: under a
send-off, **the total duration of a set is known before it is swum**
(`reps × sendOff`). Under a rest interval it is not. A planner that wants to fit
a session into a pool booking needs the distinction.

### 1.4 Distance, not time, is the default

Pools are measured. Swimmers count lengths. Almost every swim prescription is
distance-based — the exceptions are threshold _tests_ (T-30, T-20) and
open-water work where distance is unknowable. This inverts the run/bike default
and matters for the model in two places: `CardioStepSchema` forbids a step
having both `durationSec` and `distanceM` (correct), and `ADR 0043` already
assigns the swim Training Track a **km** volume currency (correct, though
swimmers say metres).

### 1.5 Equipment and mode are part of the step, not the workout

`4 × 200 pull w/ paddles and band` is one step with three orthogonal attributes:
distance, mode (`pull`), equipment (`paddles`, `band`). The training effect is
materially different from `4 × 200 swim` — a band removes kick propulsion and
roughly doubles the aerobic cost of holding a pace; paddles increase force per
stroke and are the single most common source of shoulder injury in swim training
(Maglischo 2003, ch. on training equipment; also widely repeated in USA Swimming
coach education ⚠ exact position statement not verified).

**Load consequence:** equipment breaks the pace → cost mapping that `sTSS`
depends on. Fins make a swimmer _faster at lower metabolic cost_; a band makes
them _slower at higher cost_. Pricing an equipment step from pace alone is a
known-wrong number, not an approximation.

### 1.6 Drills, and why they resist quantification

A drill set (`8 × 50 single-arm free w/ fins, 15 s rest`) can be genuinely
fatiguing and is not remotely captured by its pace, which will be slow. The
three reasons load models fail on technique work:

1. **Pace is decoupled from effort by design.** The whole point of a drill is to
   remove propulsion or exaggerate a position. Slow is the intent.
2. **The adaptation target is neuromuscular/skill, not metabolic.** There is no
   accepted dose–response curve for motor learning, and the impulse-response CTL
   model assumes a metabolic dose.
3. **Equipment confounds it further** (§1.5).

The honest treatment is the one this repo already has a principle for: a drill
step contributes **distance** to volume and an **Unavailable Metric** to TSS
unless the athlete authors an RPE. Pricing it from pace would score a hard drill
set at near-zero, which is worse than saying nothing.

⚠ **Safety.** Prolonged breath-holding / hypoxic sets carry a shallow-water
blackout risk and have been the subject of restrictive guidance from national
governing bodies. The two breath-control sessions below use _reduced-frequency
breathing over short distances_, never extended breath-holds. I could not verify
the exact wording or date of USA Swimming's position statement; treat the
citation as unconfirmed.

---

## 2. Portable intensity anchors for swimming

Everything in §3 uses only these. None of them is an absolute time.

| Anchor                                   | Definition                                                         | Notes                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSS** (Critical Swim Speed)            | `CSS = (400 − 200) / (T₄₀₀ − T₂₀₀)` m/s, expressed as sec/100 m    | Wakayoshi et al. 1992. The de-facto swim threshold. Already stored as `DisciplineProfile.cssSecPer100m`.                                                                                           |
| **% CSS**                                | Ratio of pace to CSS pace                                          | The form `css-5` uses (`app/utils/zones/recipes.ts:303`). 1.10 × CSS = 10 % slower than threshold.                                                                                                 |
| **CSS ± n s/100 m**                      | Additive offset                                                    | What swimmers and swim coaches actually say ("CSS + 5"). **Not equivalent to a ratio**: `1.10 × CSS` is +7.5 s at CSS 1:15 and +11 s at CSS 1:50. The `css-5` comment already flags this.          |
| **"400 pace" / "200 pace" / "100 pace"** | The pace the athlete can hold for an all-out swim of that distance | Fully portable. Roughly, for a trained swimmer: 400 pace ≈ CSS − 2…3 s/100; 200 pace ≈ CSS − 5…7; 100 pace ≈ CSS − 9…12. ⚠ These offsets are a coaching rule of thumb, not a published regression. |
| **T-30 pace / T-pace**                   | Average pace over a 30-minute continuous maximal swim              | Long-standing squad protocol; used as threshold pace directly.                                                                                                                                     |
| **T-20 pace**                            | Same over 20 min; ~1–2 s/100 m faster than T-30                    | ⚠ The 1–2 s adjustment is convention, not a validated correction.                                                                                                                                  |
| **RPE 1–10**                             | Borg CR10 / session-RPE                                            | The fallback anchor for drill, kick and equipment steps where pace lies.                                                                                                                           |
| **Stroke rate (SR)**                     | Strokes per minute (cycles/min)                                    | A _technique_ target, not an intensity. Set relative to the athlete's own race SR.                                                                                                                 |
| **Stroke count / SPL**                   | Strokes per length                                                 | Course-dependent (25 m vs 25 yd vs 50 m). Always expressed as "your baseline ± n".                                                                                                                 |
| **SWOLF / "swim golf"**                  | `time for a length + strokes for that length`                      | A combined efficiency score; portable only against the athlete's own baseline.                                                                                                                     |

### 2.1 The `css-5` band table used throughout §3

From `app/utils/zones/recipes.ts` (ratios are pace/CSS; smaller is faster):

| Zone | Ratio band  | Description       | Typical prose            |
| ---- | ----------- | ----------------- | ------------------------ |
| Z1   | 1.19 – 1.33 | easy aerobic      | recovery, drill, warm-up |
| Z2   | 1.10 – 1.19 | aerobic endurance | steady, "aerobic"        |
| Z3   | 1.04 – 1.10 | moderate          | tempo, EN2-ish           |
| Z4   | 0.98 – 1.04 | threshold (CSS)   | CSS pace, T-pace         |
| Z5   | < 0.98      | VO₂ max           | 400/200 pace and faster  |

⚠ **A real tension.** The additive convention swim coaches use puts easy
swimming at CSS + 10–12 s/100 m ≈ 1.12 × CSS — which `css-5` calls **Z2**, not
Z1. `css-5`'s Z1 floor of 1.33 × CSS is _very_ slow water. Sessions below label
easy swimming **Z1/Z2** to stay honest about the disagreement, which the
recipe's own source comment already documents.

### 2.2 How the TSS ranges were computed

`sTSS = hours × (CSS / pace)² × 100` (`app/utils/load/formulas.ts:85`). For a
distance segment of `d` metres at relative pace `r = pace/CSS`:

```
TSS = (d / 100) × CSS_sec / (36 × r)
```

Every workout below is priced at three CSS values — **1:20**, **1:40** and
**2:10** per 100 m — and the table shows all three. Rest contributes zero. Drill
and kick segments are priced at their (slow) pace, which is exactly the
under-count §1.6 warns about; those rows are marked ⚠.

---

## 3. The library

32 sessions. Distances assume a metric pool; a yard pool substitutes yards for
metres throughout and the relative structure is unchanged.

**Legend.** `Z1…Z5` are `css-5` bands. `on (CSS + n)` is a portable send-off:
the cycle time equals the athlete's CSS-pace time for that distance plus `n`
seconds per 100 m of it. `RPE n` is Borg CR10. Phase names follow the repo's
Plan Outline vocabulary (Base / Build / Peak / Taper / Transition).

---

### 3.A Tests and benchmarks

| #   | Name                              | Purpose                                                                    | Structure                                                                                                                                                   | Distance | TSS (1:20 / 1:40 / 2:10) | Phase · freq                   | Progression / regression                                                                               | Source                                                                                                                         |
| --- | --------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| A1  | **CSS Test (400/200)**            | Establish CSS = threshold anchor                                           | 600 WU mixed → **400 time trial, all out** → 100 easy → 10 min loose swim → **200 time trial, all out** → 300 CD                                            | 1 600 m  | 33 / 42 / 54             | All phases · every 4–6 wk      | _Regress:_ 200/100 for a beginner who cannot pace 400. _Progress:_ add a 100 TT for a 100-pace anchor. | Wakayoshi et al. 1992 (the CV construct); 400/200 field protocol popularised by Newsome & Young, _Swim Smooth_ (2012)          |
| A2  | **T-30**                          | Threshold pace from a long continuous maximal swim                         | 600 WU → **30 min continuous, maximal sustainable, count distance** → 300 CD. Also record the last-10-min average HR (LTHR-swim).                           | ~2 700 m | **67 / 72 / 78**         | Base / Build · every 6–8 wk    | _Regress:_ T-20. _Progress:_ T-30 as `2 × 20 min w/ 30 s`, take the second.                            | Long-standing squad protocol; documented in Sweetenham & Atkinson, _Championship Swim Training_ (2003) ⚠ exact page unverified |
| A3  | **T-20 / 1500 TT**                | Shorter threshold benchmark; race rehearsal for the 1 500/IM-distance swim | 800 WU with 4 × 50 build → **20 min (or 1 500 m) time trial** → 300 CD                                                                                      | ~2 400 m | 54 / 60 / 68             | Build / Peak · every 6 wk      | _Progress:_ T-30. _Regress:_ 800 TT. T-20 pace ≈ T-30 pace − 1…2 s/100 ⚠                               | Sweetenham & Atkinson (2003) ⚠                                                                                                 |
| A4  | **7 × 200 incremental step test** | Pace/HR/lactate curve; find the deflection                                 | 400 WU → **7 × 200 on 4:00-equivalent send-off**, each ~4 s/100 faster than the last, from Z1 to all-out; HR (and lactate if available) after each → 300 CD | 2 100 m  | 43 / 54 / 70             | Base entry / Build · 2×/season | _Regress:_ 5 × 200. _Progress:_ 7 × 400 for distance specialists.                                      | Pyne, Lee & Swanwick, _Med Sci Sports Exerc_ 2001;33(2):291–297 — the AIS-style incremental swim step test                     |

**In trainm8 Workout Notation** (rendered from `Workout → Block → Step`):

```
A1  600 m Z2 warm-up → 400 m Z5 → 100 m Z1 → 10 min Z1 → 200 m Z5 → 300 m Z1 cool-down
A2  600 m Z2 warm-up → 30 min Z4 → 300 m Z1 cool-down
A4  400 m Z2 warm-up → 200 m Z1 → 200 m Z2 → 200 m Z2 → 200 m Z3 → 200 m Z4 → 200 m Z4 → 200 m Z5 → 300 m Z1 cool-down
```

> **Already lossy.** A1's two time trials are _maximal-effort tests_, not "Z5"
> steps — the notation has no way to say "swim this as fast as you can and
> record the time as a threshold input", so the target degrades to a zone that
> will resolve to a pace _range_ the athlete is meant to exceed. A4's seven
> steps have lost the "each 4 s/100 faster than the last" rule and become seven
> independent zones — and the two Z2 rows and two Z4 rows are indistinguishable
> although the protocol requires them to differ. See gaps **G6** and **G10**.

---

### 3.B Aerobic and endurance

| #   | Name                    | Purpose                                                                   | Structure                                                                             | Distance | TSS (1:20 / 1:40 / 2:10) | Phase · freq            | Progression / regression                                                                                             | Source                                                                                    |
| --- | ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- | ------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| B1  | **Straight Swim**       | Continuous aerobic base; pacing discipline; the simplest session there is | 400 WU → **2 000 m continuous @ Z2 (CSS + 8…12 s/100)** → 200 CD                      | 2 600 m  | 51 / 64 / 83             | Base · 1–2×/wk          | _Regress:_ 1 000 m. _Progress:_ 3 000–4 000 m, or negative-split the last 500.                                       | Universal; the "EN1" aerobic-maintenance category in Maglischo, _Swimming Fastest_ (2003) |
| B2  | **Aerobic Pyramid**     | Aerobic volume with attention resets; a beginner's first structured set   | 400 WU → **100 · 200 · 300 · 400 · 300 · 200 · 100 @ Z2, 20 s rest between** → 200 CD | 2 200 m  | 43 / 54 / 71             | Base · 1×/wk            | _Regress:_ 50–100–150–200–150–100–50. _Progress:_ run the pyramid twice, or descend the back half.                   | Universal squad set                                                                       |
| B3  | **Long Pull Set**       | Aerobic volume with upper-body emphasis; body-position feedback           | 400 WU → **3 × 600 pull w/ buoy + band @ Z2, 30 s rest** → 200 CD                     | 2 400 m  | 47 / 59 / 77 ⚠           | Base · 1×/wk            | _Regress:_ 3 × 300 pull w/ buoy only (no band). _Progress:_ add paddles for one of the three; or band-only, no buoy. | Maglischo (2003), equipment chapter                                                       |
| B4  | **The Thirty Hundreds** | The canonical aerobic-endurance monolith; teaches pace repeatability      | 400 WU → **30 × 100 @ Z2 on (CSS + 12 s)** → 200 CD                                   | 3 600 m  | **71 / 89 / 116**        | Base · 1×/wk (advanced) | _Regress:_ 15 × 100. _Progress:_ drop the send-off 2 s/100 per week until it becomes B4→C2.                          | A named staple of masters and distance squads ⚠ no single attributable origin found       |
| B5  | **Negative-Split 800s** | Aerobic endurance + pacing control under fatigue                          | 400 WU → **3 × 800: first 400 @ Z2, second 400 @ Z3, 45 s rest** → 200 CD             | 3 000 m  | 61 / 76 / 98             | Base / Build · 1×/wk    | _Regress:_ 3 × 400. _Progress:_ 3 × 1 000, or make the last 800 fully Z3.                                            | Universal; "negative split" convention per §1.2                                           |

```
B1  400 m Z2 warm-up → 2 km Z2 → 200 m Z1 cool-down
B2  400 m Z2 warm-up → 100 m Z2 → 20 s rest → 200 m Z2 → 20 s rest → 300 m Z2 → 20 s rest
    → 400 m Z2 → 20 s rest → 300 m Z2 → 20 s rest → 200 m Z2 → 20 s rest → 100 m Z2
    → 200 m Z1 cool-down
B3  400 m Z2 warm-up → 3 × 600 m Z2 (30 s rest) → 200 m Z1 cool-down
B4  400 m Z2 warm-up → 30 × 100 m Z2 (12 s rest) → 200 m Z1 cool-down
B5  400 m Z2 warm-up → 3 × (400 m Z2 → 400 m Z3 → 45 s rest) → 200 m Z1 cool-down
```

> **Lossy.** B3 loses `pull`, `buoy` and `band` entirely — it renders as
> ordinary swimming and prices at swim pace, which is wrong in both directions
> (band swimming is slower _and_ harder). B4's `on (CSS + 12 s)` had to be
> flattened to a fixed `12 s rest`, which is only correct if the swimmer hits
> target pace exactly. B2's pyramid needs 13 hand-authored steps because there
> is no ladder primitive. Gaps **G1**, **G2**, **G3**, **G7**.

---

### 3.C Threshold / CSS

| #   | Name                            | Purpose                                                             | Structure                                                                                                            | Distance | TSS (1:20 / 1:40 / 2:10) | Phase · freq           | Progression / regression                                                                  | Source                                                                                    |
| --- | ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | ---------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| C1  | **CSS Hundreds**                | The reference threshold set; hold CSS exactly                       | 600 WU → **10 × 100 @ Z4 (CSS ± 0) on (CSS + 10 s)** → 400 CD                                                        | 2 000 m  | 42 / 52 / 67             | Base / Build · 1–2×/wk | _Regress:_ 8 × 75. _Progress:_ 15 × 100, then drop to `on (CSS + 5 s)`.                   | The CSS-pace interval as prescribed by Newsome & Young (2012)                             |
| C2  | **Red Mist**                    | Sustained threshold volume; the squad's hardest aerobic session     | 600 WU → **20 × 100 @ Z4 on (CSS + 5 s)** → 400 CD                                                                   | 3 000 m  | 64 / 80 / 104            | Build · 1×/wk          | _Regress:_ 12 × 100 on (CSS + 10). _Progress:_ 30 × 100, or alternate 100s at CSS − 2.    | "Red Mist" is Swim Smooth's name for their sustained CSS sessions (Newsome & Young, 2012) |
| C3  | **Threshold Descending Ladder** | Threshold with a within-set intensity gradient                      | 600 WU → **4 × (200 · 150 · 100 · 50), each rep faster: Z3 → Z4 → Z4 → Z5, 15 s rest, 45 s between rounds** → 400 CD | 3 000 m  | 64 / 80 / 104            | Build · 1×/wk          | _Regress:_ 2 rounds. _Progress:_ 5 rounds, or shorten the between-round rest to 20 s.     | Nested-set + descend conventions (§1.2)                                                   |
| C4  | **Broken 1000**                 | Threshold-plus; race-distance rehearsal for the 1 000/1 500         | 600 WU → **10 × 100 @ Z4 on 10 s rest, timed as one 1 000** → 300 CD                                                 | 1 900 m  | 40 / 50 / 64             | Build / Peak · 1×/wk   | _Regress:_ broken 500 (5 × 100). _Progress:_ broken 1 500; then reduce the breaks to 5 s. | "Broken swim" convention (§1.2); a standard race-rehearsal device                         |
| C5  | **Threshold Pyramid**           | Threshold volume in varied rep lengths — resists pace-locking       | 600 WU → **2 × (400 · 300 · 200 · 100 @ Z4, rest = 5 s per 100 swum)** → 400 CD                                      | 3 000 m  | 64 / 80 / 104            | Build · 1×/wk          | _Regress:_ one round. _Progress:_ three rounds; or descend the 100s to Z5.                | Universal                                                                                 |
| C6  | **CSS Sandwich**                | Teaches the _difference_ between just-under and just-over threshold | 600 WU → **8 × 200 alternating Z3 (CSS + 4) and Z4/Z5 (CSS − 2), 20 s rest** → 400 CD                                | 2 600 m  | 55 / 68 / 89             | Build · 1×/wk          | _Regress:_ 6 × 100. _Progress:_ 8 × 300; or widen the gap to CSS + 6 / CSS − 4.           | The "aerobic/threshold contrast" idea in Maglischo's EN2 category (2003)                  |

```
C1  600 m Z2 warm-up → 10 × 100 m Z4 (10 s rest) → 400 m Z1 cool-down
C2  600 m Z2 warm-up → 20 × 100 m Z4 (5 s rest) → 400 m Z1 cool-down
C3  600 m Z2 warm-up → 4 × (200 m Z3 → 15 s rest → 150 m Z4 → 15 s rest → 100 m Z4
    → 15 s rest → 50 m Z5 → 45 s rest) → 400 m Z1 cool-down
C4  600 m Z2 warm-up → 10 × 100 m Z4 (10 s rest) → 300 m Z1 cool-down
C5  600 m Z2 warm-up → 2 × (400 m Z4 → 20 s rest → 300 m Z4 → 15 s rest → 200 m Z4
    → 10 s rest → 100 m Z4 → 45 s rest) → 400 m Z1 cool-down
C6  600 m Z2 warm-up → 4 × (200 m Z3 → 20 s rest → 200 m Z5 → 20 s rest) → 400 m Z1 cool-down
```

> **Lossy.** C1 and C4 render **identically** — the model cannot express that C4
> is one continuous timed 1 000 broken by micro-rests while C1 is ten discrete
> efforts. C3's "each rep faster" survives only because it was hand-expanded
> into four differently-zoned steps. C6's CSS + 4 / CSS − 2 became Z3/Z5 because
> there is no additive-offset target kind; the resolved ranges will be wider
> than the prescription. Gaps **G4**, **G6**, **G8**.

---

### 3.D VO₂ max

| #   | Name                    | Purpose                                                                  | Structure                                                                             | Distance | TSS (1:20 / 1:40 / 2:10) | Phase · freq         | Progression / regression                                           | Source                                          |
| --- | ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------- | ------------------------ | -------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| D1  | **Fifties at 400 Pace** | High aerobic power with short recoveries; classic EN3                    | 600 WU → **16 × 50 @ 400 pace (≈ Z5, CSS − 2…3) on 10–15 s rest** → 400 easy → 200 CD | 2 000 m  | 41 / 52 / 67             | Build / Peak · 1×/wk | _Regress:_ 10 × 50. _Progress:_ 20 × 50, or shorten rest to 10 s.  | Maglischo (2003) **EN3 / "overload endurance"** |
| D2  | **VO₂ Hundreds**        | Time at or near VO₂ max; ~1:1 work:rest                                  | 800 WU → **10 × 100 @ 200 pace (Z5) on 1:1 rest** → 500 CD                            | 2 300 m  | 49 / 61 / 79             | Build / Peak · 1×/wk | _Regress:_ 8 × 75. _Progress:_ 12 × 100, or reduce rest to 0.75:1. | Maglischo EN3; the 1:1 work:rest convention     |
| D3  | **Max-Aerobic 75s**     | VO₂ max at a distance that is hard to pace-cheat                         | 600 WU → **8 × 75 @ Z5 on 45 s rest** → 400 CD                                        | 1 600 m  | 33 / 42 / 54             | Build · 1×/wk        | _Regress:_ 8 × 50. _Progress:_ 12 × 75.                            | Universal                                       |
| D4  | **Five Two-Hundreds**   | Sustained VO₂ work for distance swimmers; the classic "broken 1000 hard" | 800 WU → **5 × 200 @ 400 pace, 45–60 s rest** → 400 CD                                | 2 200 m  | 46 / 58 / 75             | Build / Peak · 1×/wk | _Regress:_ 5 × 100. _Progress:_ 6 × 200 or 5 × 300.                | Maglischo EN3; a staple distance-squad set      |

```
D1  600 m Z2 warm-up → 16 × 50 m Z5 (15 s rest) → 400 m Z1 → 200 m Z1 cool-down
D2  800 m Z2 warm-up → 10 × 100 m Z5 (1 min 30 s rest) → 500 m Z1 cool-down
D3  600 m Z2 warm-up → 8 × 75 m Z5 (45 s rest) → 400 m Z1 cool-down
D4  800 m Z2 warm-up → 5 × 200 m Z5 (1 min rest) → 400 m Z1 cool-down
```

> **Lossy.** D2's rest is prescribed as **1:1 with the swim time** — a ratio,
> not a duration — and had to be hard-coded to 90 s, which is right only for a
> 1:30 swimmer. `css-5`'s Z5 is unbounded fast (`maxRatio 0.98, minRatio 0`), so
> "400 pace" (Z5-shallow) and "100 pace" (Z5-deep) are the _same_ authored
> target here. Gaps **G4**, **G9**.

---

### 3.E Sprint, speed and lactate tolerance

| #   | Name                       | Purpose                                                         | Structure                                                                       | Distance | TSS (1:20 / 1:40 / 2:10) | Phase · freq           | Progression / regression                                                                         | Source                                                                                       |
| --- | -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- | ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| E1  | **Alactic 25s**            | Pure speed / neuromuscular; no lactate accumulation             | 800 WU incl. 6 × 25 build → **12 × 25 max on 1:00 (≈45 s rest)** → 600 CD       | 1 700 m  | 35 / 44 / 57 ⚠           | Build / Peak · 1×/wk   | _Regress:_ 8 × 25 on 1:15. _Progress:_ 16 × 25, or add 4 × 15 m dive sprints.                    | Maglischo **SP1 / "power" and speed** category (2003)                                        |
| E2  | **Lactate Production 50s** | Drive peak blood lactate; anaerobic capacity                    | 800 WU → **6 × 50 all-out on 2:00** → 700 loose swim/CD                         | 1 800 m  | 37 / 46 / 60 ⚠           | Peak · 1×/wk max       | _Regress:_ 4 × 50 on 3:00. _Progress:_ 8 × 50, or 4 × 75 all-out on 3:00.                        | Maglischo **SP2 / lactate production**                                                       |
| E3  | **Broken 100s**            | Lactate tolerance at race speed; the 100-m specialist's session | 800 WU → **4 × (100 broken at the 25s w/ 10 s rest, all-out) on 5:00** → 600 CD | 1 800 m  | 37 / 47 / 61 ⚠           | Peak · 1×/wk max       | _Regress:_ broken 50s. _Progress:_ broken 200s; or reduce the internal breaks to 5 s.            | Maglischo **SP3 / lactate tolerance**; broken-swim convention                                |
| E4  | **Race-Pace Fifties**      | Rehearse goal 100/200 pace at low fatigue                       | 700 WU → **20 × 50 @ goal 100 pace on 20 s rest** → 500 CD                      | 2 200 m  | 48 / 60 / 78             | Peak / Taper · 1–2×/wk | _Regress:_ 12 × 50. _Progress:_ 20 × 50 on 15 s rest, then convert to 10 × 100 at the same pace. | Race-pace training as a distinct category — Maglischo (2003); Sweetenham & Atkinson (2003) ⚠ |

```
E1  800 m Z2 warm-up → 12 × 25 m Z5 (45 s rest) → 600 m Z1 cool-down
E2  800 m Z2 warm-up → 6 × 50 m Z5 (1 min 30 s rest) → 700 m Z1 cool-down
E3  800 m Z2 warm-up → 4 × (25 m Z5 → 10 s rest → 25 m Z5 → 10 s rest → 25 m Z5
    → 10 s rest → 25 m Z5 → 4 min rest) → 600 m Z1 cool-down
E4  700 m Z2 warm-up → 20 × 50 m Z5 (20 s rest) → 500 m Z1 cool-down
```

> **Lossy and load-wrong.** All four sprint sessions collapse onto **Z5**, which
> is a single unbounded band — so an all-out 25 and a 400-pace 50 are the same
> authored target. Worse, `sTSS` prices these sessions at 35–61, _below_ a
> steady aerobic swim, because the sprint volume is tiny and the model has no
> anaerobic term. That is the swim analogue of the known cycling problem where
> TSS under-costs sprint work. Gaps **G8**, **G9**.

---

### 3.F Technique and skills

| #   | Name                       | Purpose                                              | Structure                                                                                                                                                         | Distance | TSS (1:20 / 1:40 / 2:10) | Phase · freq         | Progression / regression                                                                              | Source                                                                                                                                    |
| --- | -------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Drill–Swim Contrast**    | Transfer a drill's feel into whole-stroke swimming   | 400 WU → **16 × 50 as 25 drill / 25 swim**, 4 drills × 4 (catch-up, single-arm, fingertip-drag, sculling), 15 s rest → **8 × 100 @ Z2 holding the feel** → 200 CD | 2 200 m  | 42 / 52 / 68 ⚠           | Base / all · 1–2×/wk | _Regress:_ 8 × 50, one drill. _Progress:_ drill at speed; add a snorkel to remove breathing.          | Drill–swim contrast is the standard technique-transfer method — Maglischo (2003); Newsome & Young (2012)                                  |
| F2  | **Swim Golf (SWOLF)**      | Efficiency: minimise `time + strokes`                | 400 WU → **12 × 100 @ Z3, count strokes and note time; score = sum. Aim to hold the score while the split drops** → 400 CD                                        | 2 000 m  | 41 / 51 / 66             | Base / Build · 1×/wk | _Regress:_ 12 × 50. _Progress:_ run the same set at three stroke rates and find the personal optimum. | "Swim golf" is a widely used squad drill ⚠ origin commonly attributed to Gennadi Touretski's work with Alexander Popov — **not verified** |
| F3  | **Stroke-Rate Ladder**     | Find and extend the personal SR/DPS optimum          | 600 WU → **12 × 100 @ Z4-ish in 4 sets of 3, stroke rate set to baseline −4, −0, +4, +8 spm** (metronome device), 20 s rest → 400 CD                              | 2 200 m  | 45 / 57 / 74             | Base / Build · 1×/wk | _Regress:_ 8 × 50 at two rates. _Progress:_ hold the fastest split at the _lowest_ workable rate.     | The SR ↔ distance-per-stroke trade-off — Craig & Pendergast, _Med Sci Sports Exerc_ 1979;11(3):278–283                                    |
| F4  | **Kick and Body Position** | Kick propulsion, ankle mobility, horizontal position | 400 WU → **20 × 50 kick @ RPE 6–7, alternating board / streamline-on-back / vertical kick 30 s**, 20 s rest → **12 × 50 swim w/ snorkel @ Z2** → 200 CD           | 2 200 m  | 39 / 49 / 63 ⚠           | Base · 1–2×/wk       | _Regress:_ 10 × 50 kick w/ fins. _Progress:_ remove fins; add 4 × 100 kick for time.                  | Universal; kick as a discrete training category — Maglischo (2003)                                                                        |

```
F1  400 m Z2 warm-up → 16 × 50 m Z1 (15 s rest) → 8 × 100 m Z2 → 200 m Z1 cool-down
F2  400 m Z2 warm-up → 12 × 100 m Z3 (20 s rest) → 400 m Z1 cool-down
F3  600 m Z2 warm-up → 12 × 100 m Z4 (20 s rest) → 400 m Z1 cool-down
F4  400 m Z2 warm-up → 20 × 50 m @ RPE 6–7 (20 s rest) → 12 × 50 m Z2 → 200 m Z1 cool-down
```

> **Almost entirely lost.** F1 loses every drill name and the 25/25 alternation
> (it renders as 16 undifferentiated 50s). F2 loses the stroke count — the
> _entire point of the session_. F3 loses the stroke-rate targets, which are the
> only thing distinguishing its four sub-sets. F4 loses `kick`, `board`,
> `snorkel`. These four sessions are the strongest argument in this document
> that the swim step needs `mode`, `equipment` and a technique-target slot. Gaps
> **G1**, **G2**, **G5**.

---

### 3.G Open water

Open-water sessions are written for the water available; distances are nominal.
Where the session is in a pool, it is a _simulation_.

| #   | Name                      | Purpose                                                        | Structure                                                                                                                                         | Distance | TSS (1:20 / 1:40 / 2:10) | Phase · freq                                       | Progression / regression                                                                                               | Source                                                                                                                                       |
| --- | ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Sighting Set**          | Sight without wrecking the stroke; hold a line                 | 600 WU → **12 × 100 @ Z3, sight 2× per 25 (alligator-eyes: eyes up, mouth in)**, 20 s rest; every 4th 100 as heads-up polo/"Tarzan" free → 400 CD | 2 200 m  | 44 / 56 / 72             | Build / Peak · 1×/wk in the 8 wk before an OW race | _Regress:_ sight 1× per 25. _Progress:_ sight every 6 strokes at Z4; then swim 100s with eyes closed between sights.   | Newsome & Young (2012), open-water chapter; universal triathlon-coaching practice                                                            |
| G2  | **Drafting Set**          | Sit on the feet / on the hip; learn the energy saving          | 600 WU → **12 × 100 @ Z3 in pairs, rotating lead every 100 — 4 on the feet, 4 on the hip, 4 leading**, 20 s rest → 400 CD                         | 2 200 m  | 44 / 56 / 72             | Build / Peak · 1×/wk                               | _Regress:_ 8 × 50 drafting. _Progress:_ lead swimmer surges randomly; follower must respond.                           | Drafting is well-established in the swim-physiology literature (reduced drag behind a lead swimmer) ⚠ specific primary citation not verified |
| G3  | **Beach Starts & Exits**  | Dolphin dives, run-in/run-out, turn buoys                      | 600 WU → **10 × (dolphin-dive entry → 60 m hard @ Z5 → turn tight around a buoy → 60 m @ Z3 → exit and run 20 m)**, 90 s rest → 600 CD            | ~1 800 m | 38 / 48 / 62             | Peak · 1×/wk in the 4 wk before race               | _Regress:_ pool version — push-off + 25 sprint + tumble at a cone. _Progress:_ add a second buoy and a full 180° turn. | Standard open-water race-skills practice ⚠ no single attributable source                                                                     |
| G4  | **Pack Swim / Chop**      | Contact tolerance, breathing bilaterally in wash, staying calm | 600 WU → **6 × 250 @ Z3 swum 3-abreast in one lane, rotating positions; deliberate contact**, 45 s rest → 400 CD                                  | 2 500 m  | 51 / 63 / 82             | Peak · 1×/wk                                       | _Regress:_ 2-abreast, 4 × 200. _Progress:_ add a wave-making lane or swim in real chop; add a wetsuit.                 | Standard OW-preparation practice ⚠                                                                                                           |
| G5  | **Open-Water Continuous** | Race-specific continuous aerobic swimming, no walls            | 400 WU → **3 000 m continuous @ Z2 in open water, sighting every 8–10 strokes, wetsuit if the race is wetsuit-legal** → 200 CD                    | 3 600 m  | **71 / 89 / 116**        | Build / Peak · 1×/wk                               | _Regress:_ 1 500 m. _Progress:_ race distance + 25 %; add a mid-swim 400 at Z4.                                        | Universal; wetsuit-specificity per Newsome & Young (2012)                                                                                    |

```
G1  600 m Z2 warm-up → 12 × 100 m Z3 (20 s rest) → 400 m Z1 cool-down
G2  600 m Z2 warm-up → 12 × 100 m Z3 (20 s rest) → 400 m Z1 cool-down
G3  600 m Z2 warm-up → 10 × (60 m Z5 → 60 m Z3 → 1 min 30 s rest) → 600 m Z1 cool-down
G4  600 m Z2 warm-up → 6 × 250 m Z3 (45 s rest) → 400 m Z1 cool-down
G5  400 m Z2 warm-up → 3 km Z2 → 200 m Z1 cool-down
```

> **G1 and G2 render identically**, and neither says anything about sighting or
> drafting. G3's 20 m run is a `run` cardio step (ADR 0007 handles that — brick
> steps work), but the dolphin dive and buoy turn have no representation. G5
> does not record that it is open water in a wetsuit, so its pace will be
> compared against a pool-derived CSS that does not apply. Gap **G11**.

---

### 3.H Triathlon-specific

| #   | Name                       | Purpose                                                     | Structure                                                                                                        | Distance                  | TSS (1:20 / 1:40 / 2:10) | Phase · freq                         | Progression / regression                                                                                       | Source                                                                                                                                                                      |
| --- | -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | **Race-Start Surge**       | Survive the 200 m washing machine and settle into race pace | 700 WU → **6 × (100 @ 100-pace (Z5) → straight into 200 @ Z3 race pace, no rest)**, 60 s between rounds → 400 CD | 2 900 m                   | 61 / 77 / 100            | Peak · 1×/wk in the 6 wk before race | _Regress:_ 4 × (50 hard + 150 steady). _Progress:_ 8 rounds, or start each round from a dive/deep-water start. | A standard triathlon swim-prep device — Friel, _The Triathlete's Training Bible_ 4th ed. (2016); Dixon, _Fast-Track Triathlete_ (2017) ⚠ exact set attribution not verified |
| H2  | **Broken Race Simulation** | Rehearse the whole 1 500 at race intensity                  | 700 WU → **1 500 as 3 × 500 @ Z4/race pace, 20 s rest, descending** → 400 CD                                     | 2 600 m                   | 54 / 67 / 88             | Peak · every 2 wk                    | _Regress:_ 1 500 as 5 × 300. _Progress:_ straight 1 500 time trial (→ A3).                                     | Broken race-rehearsal convention (§1.2)                                                                                                                                     |
| H3  | **Swim-Exit Brick**        | Practise the swim→T1 transition with elevated HR            | 400 WU → **4 × (300 @ Z3 → exit the pool → 400 m run @ easy effort → re-enter)**, no rest between → 200 CD       | 1 200 m swim + 1.6 km run | 37 / 46 / 60 (swim only) | Peak · every 2 wk                    | _Regress:_ 2 rounds, 200 m run. _Progress:_ 6 rounds; add wetsuit strip.                                       | Brick training — Friel (2016); Bernhardt, _Training Plans for Multisport Athletes_ ⚠                                                                                        |
| H4  | **Taper Sharpener**        | Keep speed, shed fatigue; low volume, race-pace touches     | 600 WU → **6 × 50 @ 200 pace (Z5) on 45 s rest → 4 × 50 @ 100 pace (Z5) on 60 s rest** → 400 CD                  | 1 500 m                   | 31 / 39 / 51             | Taper · 2–3×/wk                      | _Regress:_ halve the reps. _Progress:_ n/a — this session is not meant to grow.                                | Taper principles — Mujika & Padilla, _Med Sci Sports Exerc_ 2003;35(7):1182–1187                                                                                            |

```
H1  700 m Z2 warm-up → 6 × (100 m Z5 → 200 m Z3 → 1 min rest) → 400 m Z1 cool-down
H2  700 m Z2 warm-up → 3 × 500 m Z4 (20 s rest) → 400 m Z1 cool-down
H3  400 m Z2 warm-up → 4 × (300 m Z3 → 400 m Z1 run) → 200 m Z1 cool-down
H4  600 m Z2 warm-up → 6 × 50 m Z5 (45 s rest) → 4 × 50 m Z5 (1 min rest) → 400 m Z1 cool-down
```

> **H3 is the one session that renders almost correctly** — ADR 0007's per-step
> discipline makes the swim→run brick natural, and it is worth saying so. H2
> loses "descending". H4's two sub-sets are indistinguishable because both are
> Z5. Gaps **G8**, **G10**.

---

### 3.I Weekly frequency and phase summary

| Phase      | Sessions/wk | Typical mix (triathlon) | Typical mix (pure swim) |
| ---------- | ----------- | ----------------------- | ----------------------- |
| Transition | 1–2         | F1, B1                  | F1, F4                  |
| Base       | 3           | B1/B4 + C1 + F1         | B4 + C1 + F1/F4 + kick  |
| Build      | 3–4         | C2 + D1 + G1 + B5       | C2/C5 + D2 + E1 + B5    |
| Peak       | 3–4         | H1 + H2 + G3/G4 + B1    | E2/E3 + E4 + D4 + B1    |
| Taper      | 3           | H4 ×2 + B1              | H4 ×2 + B1              |

Consistent with the quality-session guidance already collected in
[`intensity-distribution.md`](intensity-distribution.md) §5: 2–3 quality
sessions per week, more of the rest easy. Swimming's high technical load argues
for _frequency over duration_ — five 45-minute swims beat three 75-minute ones
for a developing swimmer, a point on which coaching sources are unusually
unanimous ⚠ (no controlled trial found).

---

## 4. Gap analysis: what the current model cannot say

Each gap below was found by trying to render a real session in §3.

| #       | Gap                                                                      | Where it bites                                                                 | Current model                                             | Proposed extension                                                                                                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1**  | **Mode** (`swim` / `pull` / `kick` / `drill`)                            | B3, F1, F4 — 4 sessions unrenderable                                           | Nothing                                                   | `WorkoutStep.mode: 'swim' \| 'pull' \| 'kick' \| 'drill'`, cardio-only, default `swim`                                                                                                                                                                                                       |
| **G2**  | **Equipment**                                                            | B3, F1, F3, F4, G5                                                             | Nothing (`Exercise.equipment` is strength-only)           | `WorkoutStep.equipmentJson: string[]` from a closed vocabulary: `pull-buoy \| paddles \| fins \| snorkel \| band \| kickboard \| drag-shorts \| tempo-device \| wetsuit`                                                                                                                     |
| **G3**  | **Send-off** — the primary swim intensity dial                           | Every pool set in §3                                                           | `RestStep.durationSec` only                               | See §4.1                                                                                                                                                                                                                                                                                     |
| **G4**  | **Relative rest** (1:1 with work, "5 s per 100 swum")                    | C5, D2                                                                         | Fixed seconds                                             | `RestStep.ratioToWork: number` as an alternative to `durationSec`                                                                                                                                                                                                                            |
| **G5**  | **Technique targets** (stroke rate, stroke count, SWOLF)                 | F2, F3                                                                         | Nothing                                                   | A `techniqueTarget` field _separate from_ `IntensityTarget`: `{ kind:'strokeRate', minSpm, maxSpm } \| { kind:'strokeCount', deltaFromBaseline } \| { kind:'swolf', target }`. Keeping it separate preserves the honest "no zone" chip.                                                      |
| **G6**  | **Set-progression operators** (`descend 1–4`, `build`, `negative split`) | A4, C3, H2, B5                                                                 | Hand-expand into N steps                                  | Either accept hand-expansion (it is _more_ precise for load math) plus an authoring macro, **or** `Block.progression: { kind:'descend' \| 'build' \| 'negativeSplit' }`. **Recommendation: hand-expansion + macro** — it keeps ADR 0007 intact and gives each rep its own resolvable target. |
| **G7**  | **Nested repeats**                                                       | C3, C5, E3, G3, H1 (all worked only because the inner group fits in one Block) | `Block.repeatCount` is one level; `Block` has no children | `WorkoutBlock.parentBlockId` self-relation, one level of nesting. Needed the moment a set is `4 × (4 × 50 + 200 easy)`.                                                                                                                                                                      |
| **G8**  | **Z5 is one unbounded band**                                             | Every VO₂ and sprint session                                                   | `css-5` Z5 = `minRatio 0, maxRatio 0.98`                  | Either a `css-7` recipe splitting Z5, or — better — an **anchor-relative pace target** (§4.2) so "400 pace" and "100 pace" are distinguishable without inventing bands                                                                                                                       |
| **G9**  | **`sTSS` has no anaerobic term**                                         | E1–E3 price _below_ an easy swim                                               | `hours × IF² × 100`                                       | Not a swim problem — the same TSS limitation the repo already documents for cycling. Recommend the honest treatment: sprint sessions carry an RPE-authored target and price via `sRPE`, flagged `low` confidence.                                                                            |
| **G10** | **A test step has no protocol role**                                     | A1, A2, A3, A4                                                                 | Nothing                                                   | `WorkoutStep.testRole: string` (e.g. `css-400`, `css-200`, `t30`) + a `ThresholdProtocol` that reads the matched Recording laps and proposes a `ThresholdEvent`. Without it, the CSS test is a workout whose _entire purpose_ — producing a number — happens outside the system.             |
| **G11** | **Course / environment**                                                 | G1–G5, and every yard-pool athlete                                             | Nothing                                                   | `Workout.course: { kind:'pool', lengthM: 25 \| 33.3 \| 50 } \| { kind:'openWater' }`; plus a distance `unit: 'm' \| 'yd'`. Required for SPL (G5), for yard pools, and to stop an open-water pace being scored against a pool CSS.                                                            |
| **G12** | **Stroke**                                                               | A1 (IM order), and any non-freestyle set                                       | Nothing                                                   | `WorkoutStep.stroke: 'free' \| 'back' \| 'breast' \| 'fly' \| 'im' \| 'choice'`. **CSS is stroke-specific**: a butterfly step anchored to freestyle CSS must resolve to _Unavailable_, not to a fabricated range.                                                                            |
| **G13** | **Pace target has no unit**                                              | Any authored absolute swim pace                                                | `{ kind:'pace', minSecPerKm }`                            | See §4.2 — this is a **live defect**, not a missing feature                                                                                                                                                                                                                                  |
| **G14** | **Swim distances display in km**                                         | B1, G5 render `2 km`, `3 km`                                                   | `formatDistance` at `workout-notation.ts:746`             | Use `formatMeters` when the step discipline is `swim` (or when the course is a pool)                                                                                                                                                                                                         |

### 4.1 Proposed: the Send-Off

The central recommendation. Add to `WorkoutBlock` (it governs a repeat group,
not a single step):

```ts
// The cycle time a repeat group leaves on. Rest is the residual:
// sendOff − actual swim time. Absent means the block uses explicit rest steps.
export const SendOffSchema = z.discriminatedUnion('kind', [
	// Portable: the athlete's own CSS pace for the step distance, plus a rest
	// allowance per 100 m. `100 on (CSS + 10 s)` = { anchor:'css', allowanceSecPer100m: 10 }.
	z.object({
		kind: z.literal('anchored'),
		anchor: z.literal('css'),
		allowanceSecPer100m: z.number(), // may be negative for a "no-rest" set
	}),
	// What a coach writes on the board. Not portable; kept because squads use it
	// and an imported set must round-trip.
	z.object({
		kind: z.literal('absolute'),
		intervalSec: z.number().int().positive(),
	}),
])
```

Rules:

- A block has **either** a `sendOff` **or** rest steps, never both.
- `anchored` resolves at display time against `cssSecPer100m` to a concrete
  send-off, exactly the way a `powerPct` target resolves against FTP — and
  degrades to the **Unavailable Metric** when CSS is absent, rather than
  fabricating a clock time.
- Planned TSS uses the _target pace_, not the send-off, so nothing in
  `planned-tss.ts` changes. The send-off's effect on load is real but indirect
  (it constrains recovery); pricing it would require modelling incomplete
  recovery, which no published swim load model does. ⚠
- Notation renders it as the swimmers' own glyph: `10 × 100 m Z4 @ CSS + 10 s`
  or `10 × 100 m Z4 @ 1:40`.

Why `anchored` and not just `absolute`: this document's hard requirement was
that a prescription mean the same thing at 1:20/100 m and 2:10/100 m.
`8 × 100 @ 1:40` is a moderate aerobic set for the first swimmer and physically
impossible for the second. `8 × 100 on (CSS + 10 s)` is the same session for
both. **A library of example workouts cannot ship absolute send-offs.**

### 4.2 Proposed: fix the pace target, and add the two swim conventions

The live defect first. `IntensityTargetSchema`'s `pace` variant is
`{ minSecPerKm, maxSecPerKm }`. Trace it through:

- `zones/resolve.ts:139` —
  `case 'pace': return { paceMin: authored.minSecPerKm, ... }`, **unconverted**.
- `workout.server.ts:560` — that value is persisted to
  `WorkoutStep.intensityPaceMin`.
- `load/planned-tss.ts:120` — for `discipline === 'swim'`, `intensityPaceMin` is
  read as **sec/100 m**.
- `intensity-target.ts` `formatIntensityTarget` — `case 'pace'` calls
  `formatPaceRange`, which **hardcodes `/km`** (`format.ts:208`).
- `zone-equivalent.ts:222` — divides by 10 for CSS recipes, a compensating hack.

So an authored swim pace is _either_ displayed correctly and priced 10× wrong,
_or_ priced correctly and displayed as an absurd `/km` figure. There is no
correct way to author an absolute swim pace today. Proposed:

```ts
z.object({
  kind: z.literal('pace'),
  unit: z.enum(['perKm', 'per100m']).default('perKm'),   // explicit, never inferred
  min: z.number().int().positive(),
  max: z.number().int().positive().optional(),
}),
// The additive convention swim coaches actually use: "CSS + 5"
z.object({
  kind: z.literal('cssOffset'),
  minOffsetSecPer100m: z.number(),
  maxOffsetSecPer100m: z.number().optional(),
}),
// The distance-anchored convention: "400 pace", "200 pace"
z.object({
  kind: z.literal('racePace'),
  distanceM: z.union([z.literal(50), z.literal(100), z.literal(200), z.literal(400), z.literal(1500)]),
}),
```

`cssOffset` closes **G8** for threshold work (C6's CSS + 4 / CSS − 2 becomes
exact) and `racePace` closes it for VO₂/sprint work (D1's "400 pace" and E4's
"100 pace" stop colliding in Z5). `racePace` also activates ADR 0027's reserved
`equivalent` facet slot for the first time with a _truthful_ source — the
athlete's own recorded best efforts, which ADR 0021 already derives.

`formatPaceRange` must take a unit parameter (ADR 0023's shared display layer is
the right home; this is a one-line change with wide blast radius).

### 4.3 What §3 would look like with the extensions

```
B3  400 m Z2 warm-up → 3 × 600 m Z2 · pull · buoy+band (30 s rest) → 200 m Z1 cool-down
B4  400 m Z2 warm-up → 30 × 100 m Z2 @ CSS + 12 s → 200 m Z1 cool-down
C6  600 m Z2 warm-up → 4 × (200 m @ CSS + 4 s · Z3 → 200 m @ CSS − 2 s · Z4 (20 s rest))
    → 400 m Z1 cool-down
D1  600 m Z2 warm-up → 16 × 50 m @ 400 pace · Z5 (15 s rest) → 400 m Z1 → 200 m Z1 cool-down
F2  400 m Z2 warm-up → 12 × 100 m Z3 · SWOLF ≤ baseline (20 s rest) → 400 m Z1 cool-down
F3  600 m Z2 warm-up → 3 × 100 m Z4 · SR −4 → 3 × 100 m Z4 · SR base → 3 × 100 m Z4 · SR +4
    → 3 × 100 m Z4 · SR +8 → 400 m Z1 cool-down
F4  400 m Z2 warm-up → 20 × 50 m kick @ RPE 6–7 · board (20 s rest)
    → 12 × 50 m Z2 · snorkel → 200 m Z1 cool-down
G1  600 m Z2 warm-up → 12 × 100 m Z3 · open water · sight ×2/25 (20 s rest) → 400 m Z1 cool-down
```

Each added facet follows the existing `·` separator convention
(`NOTATION_SEPARATORS.facet`), so nothing about the Token Sentence's grammar
changes — only the set of token types.

### 4.4 The one place ADR 0027's "render, never parse" is genuinely tested

ADR 0027 decided the notation is _rendered from_ structure and explicitly
rejected free-text parsing, on the grounds that parsing invites invalid
intermediate states. That reasoning is sound for a general workout editor.

Swimming is the strongest counter-case in the whole app, and it is worth stating
plainly rather than burying it:

- Swim notation is a **pre-existing, stable, widely-taught written grammar**.
  Every squad coach in the world can already write
  `4 × (4 × 50 @ :45) descend 1–4` and every swimmer can read it. Nothing
  comparable exists for running.
- The library in §3 is ~32 workouts × ~6 steps. Hand-building them through
  tappable tokens is hostile; pasting a whiteboard set is natural.
- The set is _already written down_ — on a card, in an email from a coach, in a
  club's weekly plan. The authoring act for swimming is transcription, not
  composition.

This does **not** require reversing ADR 0027. The ADR's own text says "a future
free-text parser could target the same token model". The recommendation is to
scope that parser narrowly: **a swim-set parser that emits `WorkoutStructure`**,
used for import/paste only, with the Token Sentence remaining the editing
surface. Invalid-by-construction is preserved because the parser's output is
validated by `WorkoutStructureSchema` before it becomes anything.

---

## 5. Implications for trainm8

1. **Ship the send-off, anchored to CSS, before shipping any swim library.**
   Everything else in §4 is additive polish; without §4.1 a swim workout is a
   distance list with the intensity mechanism removed. And it must be the
   `anchored` form — an absolute send-off makes a shared workout library
   meaningless.
2. **Fix G13 as a bug, not a feature.** The `pace` target's missing unit is a
   silent 10× error path that already exists in shipped code. It belongs with
   the defect list in [`README.md`](README.md), alongside the gapped zone bands.
   The `zone-equivalent.ts:222` divide-by-10 is the smell that identifies it.
3. **`mode` + `equipment` + `stroke` are three small nullable columns that make
   four of the six archetypes expressible.** They are also the cheapest possible
   change: three nullable columns on `WorkoutStep`, three optional fields on
   `CardioStepSchema`, three token types. Cardio steps in run and bike simply
   leave them null.
4. **Be honest about equipment and drill load.** A `pull`+`band` step or a drill
   step must _not_ be priced from pace. The precedent already exists (ADR 0008's
   Unavailable Metric, ADR 0033's confidence vocabulary): mark equipment/drill
   steps `medium`/`low` confidence, or refuse to price them and require an RPE.
   Under-costing a hard band set is a worse error than saying nothing.
5. **The CSS test is the model's biggest missed opportunity.** The athlete
   already has `cssSecPer100m` on their Discipline Profile and `ThresholdEvent`
   already exists. A1 produces the two numbers that compute it, and there is no
   wire between them. A `testRole` on the step plus a protocol that proposes a
   `ThresholdEvent` from the recording would close the loop for swimming — and
   generalise to FTP tests and run threshold tests.
6. **Distance-prescribed load is athlete-dependent and the UI must say so.** The
   same swim workout is 71 TSS for one athlete and 116 for another. If a plan
   template ever prescribes swim distance, its planned TSS must be resolved _per
   athlete_, never stored on the template. `planned-tss.ts` already does this
   correctly (it resolves against the athlete's Discipline Profile); the risk is
   a future plan-template feature caching a number.
7. **Open water is a different course, not a different mood.** A 3 km open-water
   swim in a wetsuit scored against a pool CSS will over-report the athlete's
   fitness. Either store a separate open-water CSS or mark open-water pace as
   non-comparable. The honest default is the latter.

### ADRs this research challenges

| ADR                                                   | Verdict                        | Why                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0007** Step as discriminated union                  | **Amend**                      | The union axis (`cardio \| strength \| rest`) is right and the brick case (H3) works beautifully. But the cardio arm is run/bike-shaped: it needs `mode`, `stroke`, `equipment`, and a technique-target slot before a swim step is a swim step. Also: `rest` allowing only `durationSec` is the wrong shape for the sport where rest is a _residual_.                                                |
| **0002** Step quantification                          | **Amend**                      | Duration-XOR-distance is correct for swim (distance-native, §1.4), but a repeat group needs a **third** quantity — the send-off cycle time — which is neither.                                                                                                                                                                                                                                       |
| **0027** Text-first authoring ("render, never parse") | **Amend**                      | Decision 1's reasoning holds for editing. It does not hold for _ingest_: swimming has a pre-existing written grammar and the authoring act is transcription. Scope a swim-set parser that emits `WorkoutStructure` for paste/import, leaving the Token Sentence as the sole editing surface. Also: ADR 0027 A2's reserved `equivalent` facet gets its first truthful filling from `racePace` (§4.2). |
| **0006** Zone system in code                          | **Amend**                      | `css-5` is a genuine improvement over `css-3` and its source comment is exemplary. Two remaining problems: Z5 is one unbounded band covering 400-pace through all-out (G8), and the recipe is implicitly freestyle-only while CSS is stroke-specific (G12). Neither is fixed by another recipe; both need target kinds (§4.2).                                                                       |
| **0005** Athlete profile and thresholds               | **Amend**                      | One `cssSecPer100m` per athlete assumes one stroke, one course, and one pool length. Minimum viable fix: record the _protocol_ that produced it (400/200 vs T-30 — they do not agree) and whether it is pool or open water. This is the same "record the protocol, not the source-enum" correction the zones document already made against 0005.                                                     |
| **0023** Shared display formatting                    | **Amend**                      | `formatPaceRange` hardcodes `/km` (`format.ts:208`) and `formatDistance` renders a 1 500 m swim as `1.5 km`. `formatMeters` exists and is unused by the notation. The shared layer is the right place; it is simply not swim-aware.                                                                                                                                                                  |
| **0008** TSS triad, HR-first                          | **Confirm, with a scope note** | The swim rung (`sTSS` ← CSS + pace ← sRPE) is correct and implemented. The scope note: pace stops being a valid load proxy under equipment, drill mode and open water, so those steps should drop to the `sRPE` rung rather than compute a confident-looking wrong number. That is a _use_ of ADR 0008's ladder, not a change to it.                                                                 |
| **0043** Volume currency per Training Track           | **Confirm**                    | A swim track with a distance currency is exactly right; swim volume is metres and always has been. (Swimmers say "metres", not "km" — a labelling nicety, not a model problem.)                                                                                                                                                                                                                      |
| **0046** No load number spans incommensurable tracks  | **Confirm**                    | Independently supported here: a drill set and a lactate-tolerance set are not commensurable _within_ swimming, let alone across sports. §4 G9's recommendation is the same structural refusal.                                                                                                                                                                                                       |

---

## 6. Confidence and open questions

**Solid.** The notation conventions in §1 are stable and universal; the CSS
formula and its derivation; the `css-5` band table (read from this repo's own
code); the TSS arithmetic in §2.2 (computed from the repo's own `sTSS`); the
entire gap analysis in §4 (derived by reading the shipped schema and tracing the
code paths cited).

**Flagged uncertain** — marked ⚠ throughout:

- The 400/200/100-pace-to-CSS offsets in §2 are coaching rules of thumb, not a
  published regression. A real implementation should derive them from the
  athlete's own best efforts (ADR 0021) rather than from a constant.
- The T-20 ≈ T-30 − 1…2 s/100 m adjustment is convention.
- Exact page/edition attributions for Maglischo and Sweetenham & Atkinson were
  not verified; the _categories_ (EN1/EN2/EN3, SP1/SP2/SP3) are certain, the
  page numbers are not.
- "Swim golf"/SWOLF's origin is commonly attributed to Gennadi Touretski; not
  verified.
- The exact wording and date of any national-governing-body position statement
  on hypoxic/breath-hold training was not verified.
- Several open-water sessions (G2, G3, G4) are standard practice with no single
  attributable published origin. They are labelled as such rather than given a
  false citation.
- **CSS is contested as a threshold.** Dekerle et al. (2005) found critical swim
  speed does _not_ coincide with maximal lactate steady state, typically sitting
  above it — the same CP-vs-FTP problem the zones document already documents for
  cycling. `css-5` bands should not be read as physiological truth.

**Open questions.**

- Does the send-off belong on `WorkoutBlock` or on `WorkoutStep`? §4.1 puts it
  on the block because it governs a repeat group, but a mixed set
  (`4 × 100 @ 1:30, 4 × 50 @ :45` as one block) argues for the step.
- Should a `pull` step's distance count toward the swim Training Track's volume
  at full weight? Squads count it fully; a load model arguably should not.
- Where does a per-stroke CSS live if `DisciplineProfile` is per-discipline?
- Does open water need its own `DisciplineProfile`, or a modifier on the swim
  one?

---

## References

**Primary — physiology and protocols**

- Wakayoshi K, Ikuta K, Yoshida T, Udo M, Moritani T, Mutoh Y, Miyashita M.
  Determination and validity of critical velocity as an index of swimming
  performance in the competitive swimmer. _Eur J Appl Physiol Occup Physiol._
  1992;64(2):153–157.
  doi:[10.1007/BF00717953](https://doi.org/10.1007/BF00717953)
- Wakayoshi K, Yoshida T, Udo M, et al. Does critical swimming velocity
  represent exercise intensity at maximal lactate steady state? _Eur J Appl
  Physiol._ 1993;66(1):90–95.
  doi:[10.1007/BF00863406](https://doi.org/10.1007/BF00863406)
- Dekerle J, Nesi X, Lefevre T, et al. Stroking parameters in front crawl
  swimming and maximal lactate steady state speed. _Int J Sports Med._
  2005;26(1):53–58.
  doi:[10.1055/s-2004-817854](https://doi.org/10.1055/s-2004-817854) — the CSS ≠
  MLSS caveat.
- Craig AB Jr, Pendergast DR. Relationships of stroke rate, distance per stroke,
  and velocity in competitive swimming. _Med Sci Sports Exerc._
  1979;11(3):278–283. — the canonical stroke-rate / distance-per-stroke source.
- Pyne DB, Lee H, Swanwick KM. Monitoring the lactate threshold in world-ranked
  swimmers. _Med Sci Sports Exerc._ 2001;33(2):291–297. — the incremental 7 ×
  200 step test (A4).
- Toussaint HM, Beek PJ. Biomechanics of competitive front crawl swimming.
  _Sports Med._ 1992;13(1):8–24.
  doi:[10.2165/00007256-199213010-00002](https://doi.org/10.2165/00007256-199213010-00002)
- Mujika I, Padilla S. Scientific bases for precompetition tapering strategies.
  _Med Sci Sports Exerc._ 2003;35(7):1182–1187.
  doi:[10.1249/01.MSS.0000074448.73931.11](https://doi.org/10.1249/01.MSS.0000074448.73931.11)
- Foster C. Monitoring training in athletes with reference to overtraining
  syndrome. _Med Sci Sports Exerc._ 1998;30(7):1164–1168. — session-RPE, the
  fallback rung for drill and equipment work.

**Coaching literature (named coaches and squads)**

- Maglischo EW. _Swimming Fastest._ Human Kinetics, 2003. ISBN 978-0736031806. —
  the EN1/EN2/EN3 and SP1/SP2/SP3 energy-system training categories used
  throughout §3.D and §3.E; equipment and kick chapters. ⚠ page-level citations
  not verified.
- Sweetenham B, Atkinson J. _Championship Swim Training._ Human Kinetics, 2003.
  ISBN 978-0736036542. — test-set and race-pace training structure; the T-30
  protocol. ⚠ page-level citations not verified.
- Newsome P, Young A. _Swim Smooth: The Complete Coaching Programme for Swimmers
  and Triathletes._ Wiley, 2012. ISBN 978-1119963554. — the 400/200 CSS field
  test, CSS-paced interval training, the "Red Mist" sustained-CSS sessions,
  open-water and wetsuit specifics.
- Costill DL, Maglischo EW, Richardson AB. _Swimming_ (Handbook of Sports
  Medicine and Science). Blackwell Scientific, 1992. ISBN 978-0632030279.
- Friel J. _The Triathlete's Training Bible._ 4th ed. VeloPress, 2016. ISBN
  978-1937715441. — triathlon swim periodisation and brick work.
- Dixon M. _Fast-Track Triathlete._ VeloPress, 2017. ISBN 978-1937715755.
- Bernhardt G. _Training Plans for Multisport Athletes._ VeloPress. ⚠ edition
  not verified.

**This repo**

- `app/utils/zones/recipes.ts` — `css-3`, `css-5`, and the %CV sourcing comment.
- `app/utils/load/formulas.ts` — `sTSS`.
- `app/utils/load/planned-tss.ts` — swim pace read as sec/100 m.
- `app/utils/zones/resolve.ts`, `app/utils/intensity-target.ts`,
  `app/utils/zone-equivalent.ts`, `app/utils/format.ts` — the pace-unit defect
  path (§4.2).
- `app/utils/workout-notation.ts`, `app/utils/workout-schema.ts`,
  `prisma/schema.prisma` — the Token Sentence and the step model.
- `docs/adr/0002`, `0005`, `0006`, `0007`, `0008`, `0023`, `0027`, `0043`,
  `0046`.
- [`docs/research/zones-and-thresholds.md`](zones-and-thresholds.md),
  [`docs/research/training-load-and-fitness-model.md`](training-load-and-fitness-model.md),
  [`docs/research/intensity-distribution.md`](intensity-distribution.md).
- `docs/wayfinder/manual-training-planning/intensity-load-and-volume-reference.md`
  §4 — the swim %CV zone scale `css-5` is derived from, and the "swim distance ≠
  time: 75 % of distance ≈ 80 % of time" note.
