# Strength for endurance athletes, and the other-discipline workouts

Research note. Compiled 2026-08-07. A catalogue of **25 strength sessions** for
endurance athletes across four phases, every one written in **portable load
anchors** so that the same row means the same physiological thing to a 60 kg and
a 120 kg squatter — plus a shorter treatment of **XC skiing, rowing and
cross-training**, and a data-model analysis of how (and whether) any of it fits
this repo.

> **Sibling documents.** Written alongside
> [workouts-running.md](workouts-running.md) and
> [workouts-swimming.md](workouts-swimming.md), and alongside
> `workout-taxonomy.md`, which owns the archetype vocabulary — archetype
> definitions are **referenced, not repeated**, here. Load maths (TSS, sRPE,
> CTL/ATL/TSB) belongs to
> [training-load-and-fitness-model.md](training-load-and-fitness-model.md); zone
> tables to [zones-and-thresholds.md](zones-and-thresholds.md). This note adds
> the one thing none of them covers: **a load axis that is mechanical rather
> than metabolic.**

## TL;DR

- **`%1RM` is not the portable anchor the brief assumed, and this app's own
  population is the counter-example.** At 70 % 1RM, endurance runners completed
  **39.9 ± 17.6** repetitions where weightlifters completed **17.9 ± 2.8**; the
  difference vanishes only at 90 % (Richens & Cleather 2014,
  [PMID 24899782](https://pubmed.ncbi.nlm.nih.gov/24899782/)). So
  `3 × 10 @ 70 %` is a near-failure set for one athlete and a warm-up for the
  other. **RIR (reps in reserve) is the portable anchor; `%1RM` is portable only
  above ~85 %**, which happens to be exactly the band endurance athletes should
  train in. The data model must make RIR first-class, not an afterthought to
  `pct1RM`.
- **The Step union does not need a new member — `ExerciseSet` needs an
  `IntensityTarget` of its own.** ADR 0007's `kind: 'strength'` step with an
  `Exercise` FK and `ExerciseSet[]` children is the right shape and survives
  this research intact. The mismatch is one level down: `ExerciseSet` carries
  `weightKg XOR pct1RM` and nothing else, so RIR, RPE, velocity, velocity-loss
  stop rules, tempo, bodyweight-plus-load and rep-max references are all
  **unauthorable**. The fix is symmetric with the cardio side: a **`LoadTarget`
  discriminated union** on the set, plus a separate **set-termination rule** (a
  velocity-loss set has no authored rep count).
- **`pct1RM` is already shipped and already resolves to nothing.** There is no
  1RM stored anywhere: `DisciplineProfile` holds
  `maxHr / lthr / ftp / runPowerThresholdW / thresholdPaceSecPerKm / cssSecPer100m`,
  and `ThresholdEvent.kind` has no `oneRm`. And 1RM is **per exercise**, not per
  discipline, so it does not fit `DisciplineProfile`'s one-row-per-discipline
  shape at all. An `ExerciseThreshold` entity is required before `@ 85 % 1RM`
  can render a kg facet.
- **The evidence for lifting is strong, specific and small-effect.** Berryman
  2018's meta-analysis: **SMD 0.52** on performance (95 % CI 0.33–0.70),
  **0.65** on energy cost, **0.99** on maximal force. Blagrove 2018: running
  economy improves **2–8 %**. What does _not_ improve: VO2max, vVO2max, blood
  lactate, body composition. Interference is real but narrow — Schumann 2022
  finds maximal strength (−0.06) and hypertrophy (−0.01) unaffected, only
  **explosive strength** attenuated (**−0.28**), and only when the two are in
  the **same session**; ≥3 h separation removes it.
- **ADR 0046 and ADR 0047 are confirmed, from the physiology side.** No source
  anywhere prices lifting in TSS. Of the three candidate currencies, **tonnage
  fails portability by construction** (a 120 kg squatter banks ~2× the kg for an
  identical relative stimulus), **sRPE is Foster's `hours × assumed intensity`**
  — the conversion ADR 0046 §2 removed — and **hard-set counting is the currency
  the dose-response literature itself uses**. ADR 0047 §2 already chose sets.
  Nothing here disturbs either decision; §12 strengthens both.

---

## 1. How to read this library

Each phase gets a **prescription table** (structure in portable anchors, rest,
tempo where it matters, frequency, source) and a **notation & progression
table** (the same session in this repo's
[Workout Notation](../adr/0027-text-first-workout-authoring.md), plus how to
progress and regress it).

**No absolute kilogram appears anywhere in this document.** That is a hard rule
of the brief and it is also the correct rule: an absolute load is a fact about
one athlete on one day, not a prescription.

**Levels.** _Novice lifter_ ≈ <6 months of structured resistance training, no
reliable 1RM; _trained_ ≈ 6–24 months, technique stable under load; _advanced_ ≈
2 years+, an established rep-max history. Endurance athletes are frequently
_advanced_ in their sport and _novice_ in the weight room, and the library
assumes that combination is the default rather than the exception.

### Notation legend

The renderer (`app/utils/workout-notation.ts`) is deterministic. Its
**strength** tokens today are exactly three: an `exercise` token, a `sets`
token, and an optional rest-between-sets facet.

| Token          | Renders as                                | Authored from                          |
| -------------- | ----------------------------------------- | -------------------------------------- |
| Step separator | `→`                                       | `WorkoutStep.orderIndex`               |
| Block repeat   | `3 × ( … )`                               | `WorkoutBlock.repeatCount`             |
| Exercise       | `Back squat`                              | `WorkoutStep.exerciseId` → `Exercise`  |
| Uniform sets   | `4 × 4 @ 85% 1RM`                         | `ExerciseSet[]` (collapsed if uniform) |
| Mixed sets     | `5 @ 80% 1RM / 3 @ 87% 1RM / 1 @ 92% 1RM` | `ExerciseSet[]` (listed if not)        |
| AMRAP set      | `AMRAP`                                   | `ExerciseSet.kind = 'amrap'`           |
| Timed set      | `3 × 45 s`                                | `ExerciseSet.kind = 'timed'`           |
| Rest facet     | `· 3 min rest`                            | `WorkoutStep.restBetweenSetsSec`       |
| Rest **step**  | `(3 min rest)`                            | `kind: 'rest'` step                    |

Four markers appear in the notation column below. **Every one of them is a
missing anchor, not a missing formatting rule** — see §14.

- **†** — needs a `rir` load kind: `@ RIR 2`. The single most-used anchor in the
  modern strength literature and the only one that is genuinely portable across
  training backgrounds.
- **‡** — needs a `tempo` field on the set: `@ 3-0-3`. Load-bearing for exactly
  one family (heavy slow resistance for tendon) and cosmetic everywhere else,
  which is why it is a set field and not a load kind.
- **§** — needs a `velocity` load kind and/or a **velocity-loss stop rule**:
  `@ 0.5–0.6 m/s`, `stop at −20 % velocity`. A velocity-loss set has **no
  authored rep count**, which the current `reps | timed | amrap` discriminator
  cannot express.
- **‖** — needs a `bodyweight` load kind (optionally `+ x kg`), or a `repMax`
  reference kind (`@ 10RM`). Half this library's anatomical-adaptation phase is
  bodyweight and currently has to be authored as a load-less set.

Everything unmarked is authorable in trainm8 **today** — which, as §14 shows, is
a smaller fraction of the library than the same test applied to the running
library.

---

## 2. Why endurance athletes lift

### 2.1 What the evidence says it buys

| Outcome                                            | Effect                                                                            | Source                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Endurance **performance**                          | SMD **0.52** (95 % CI 0.33–0.70), moderate                                        | Berryman 2018, meta-analysis of 28 studies                                  |
| **Energy cost** of locomotion                      | SMD **0.65** (95 % CI 0.32–0.98)                                                  | Berryman 2018                                                               |
| **Maximal force**                                  | SMD **0.99** (95 % CI 0.80–1.18)                                                  | Berryman 2018                                                               |
| **Maximal power**                                  | SMD **0.50** (95 % CI 0.34–0.67)                                                  | Berryman 2018                                                               |
| **Running economy**                                | **2–8 %** improvement across 20 of 24 studies                                     | Blagrove 2018, systematic review                                            |
| Running economy, pooled                            | **−3.93 ± 1.19 %** oxygen cost                                                    | Denadai 2017, meta-analysis                                                 |
| — explosive training                               | **−4.83 ± 1.53 %**                                                                | Denadai 2017                                                                |
| — heavy weight training                            | **−3.65 ± 2.74 %**                                                                | Denadai 2017                                                                |
| — **isometric** training                           | **−2.20 ± 4.37 %, n.s.** (p = 0.324)                                              | Denadai 2017                                                                |
| Cycling: 40-min mean power, LT power, Wingate peak | improved vs endurance-only over 12 wk                                             | Rønnestad 2010 ([PMID 19960350](https://pubmed.ncbi.nlm.nih.gov/19960350/)) |
| 5-km time                                          | improved with **32 %** of volume replaced by explosive work, **VO2max unchanged** | Paavolainen 1999                                                            |

### 2.2 What it does _not_ buy

This half matters more for an app, because it determines which surfaces may
claim credit for a gym block.

- **VO2max, vVO2max, blood lactate and body composition are unchanged** in the
  bulk of the running literature (Blagrove 2018). Paavolainen's 5-km improvement
  came with **no VO2max change at all**. So a strength block that "worked"
  produces no signal in any of the metrics this repo currently derives from
  telemetry.
- **Body composition is not harmed** either (Blagrove 2018) — the standard
  athlete objection ("I'll get heavy") is not supported.
- **Isometric training does not improve running economy** to significance
  (Denadai 2017). This is worth stating because isometrics are the cheapest
  thing to prescribe to a travelling athlete and the evidence declines to
  endorse them for economy. They keep a place in the library only as a
  **maintenance and tendon** tool (S23, S12), never as an economy intervention.
- **It is not universal.** Skattebo 2016 gave junior female XC skiers ten weeks
  of upper-body heavy strength training: seated pull-down **+15 %**, and
  **trivial** effects on 20-s and 3-min double-poling ergometer power
  ([PMID 26146761](https://pubmed.ncbi.nlm.nih.gov/26146761/)). Strength gains
  transfer to _performance_ only when the strength was the limiter.

### 2.3 Why heavy and low-volume rather than high-rep circuits

The mechanism named across the reviews is neuromuscular, not metabolic:
**delayed type-II fibre recruitment, improved neuromuscular efficiency, IIx →
IIa fibre conversion, and increased musculo-tendinous stiffness** (Rønnestad &
Mujika 2014). Every one of those is a **high-force** adaptation. Four
consequences follow, and together they are the whole argument for the library's
shape:

1. **Force is the stimulus, and force requires load.** A 20-rep circuit at 40 %
   1RM cannot recruit the high-threshold motor units whose behaviour is the
   point, except in the last few reps at the cost of enormous fatigue.
2. **The endurance athlete is already maximally trained in the metabolic
   direction.** A high-rep circuit is a _worse_ aerobic stimulus than the
   running they would otherwise be doing, delivered with more soreness. It
   occupies the one training quality the athlete does not need help with.
3. **Interference scales with endurance volume and duration, not with lifting
   load** (Wilson 2012: frequency −0.26 to −0.35, duration −0.29 to −0.75). The
   circuit adds endurance-like minutes to a schedule already full of them.
4. **Low volume is the point, not a compromise.** Rønnestad 2010's in-season
   result — **one** session per week maintaining both thigh CSA and leg strength
   through a 13-week competitive period — is the strongest single practical
   finding in this document
   ([PMID 20799042](https://pubmed.ncbi.nlm.nih.gov/20799042/)).

The corollary is a house rule that runs through the library: **endurance
athletes lift heavy, briefly, and rarely to failure.** Training to failure buys
little extra adaptation and costs disproportionate residual fatigue, which is
paid for out of the next day's key endurance session (§3).

---

## 3. Concurrent training and the interference effect

### 3.1 Hickson's original result, read correctly

Hickson 1980 ([PMID 7193134](https://pubmed.ncbi.nlm.nih.gov/7193134/)) is
routinely cited as "you cannot do both". The actual result is **asymmetric and
directional**:

- The combined group's strength rose normally for ~7 weeks and then **declined
  in the final weeks** of the 10-week study.
- **VO2max rose ~25 % identically** in the endurance and combined groups.

So the interference runs **endurance → strength**, not strength → endurance, and
it emerges **late**, under a training load (5 days/wk endurance _and_ 5 days/wk
strength, both to exhaustion) that no endurance athlete would ever run. For an
athlete whose _goal_ is the endurance side, Hickson is close to reassurance.

### 3.2 The modern picture: narrow, specific, and manageable

| Question                           | Answer                                                                                                                                                            | Source                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Is maximal strength blunted?       | **No** — SMD −0.06 (95 % CI −0.20 to 0.09), n.s.                                                                                                                  | Schumann 2022 ([PMID 34757594](https://pubmed.ncbi.nlm.nih.gov/34757594/)) |
| Is hypertrophy blunted?            | **No** — SMD −0.01 (−0.16 to 0.18), n.s.                                                                                                                          | Schumann 2022                                                              |
| Is **explosive** strength blunted? | **Yes** — SMD **−0.28** (−0.48 to −0.08), p = 0.007                                                                                                               | Schumann 2022                                                              |
| Does it matter when?               | **Yes** — attenuation is pronounced in the **same session**, absent when separated by **≥3 h**                                                                    | Schumann 2022                                                              |
| Running vs cycling?                | **No meaningful difference** (2022) — reversing Wilson 2012's finding that running interfered and cycling did not                                                 | Schumann 2022 vs Wilson 2012                                               |
| What predicts interference?        | Endurance **frequency** (r −0.26 to −0.35) and **duration** (r −0.29 to −0.75)                                                                                    | Wilson 2012 ([PMID 22002517](https://pubmed.ncbi.nlm.nih.gov/22002517/))   |
| Within-session order?              | **Resistance before endurance** — **+6.91 %** for lower-body dynamic strength; no difference for hypertrophy, static strength, aerobic capacity, body composition | Eddens 2018 ([PMID 28917030](https://pubmed.ncbi.nlm.nih.gov/28917030/))   |

⚠️ **The running-vs-cycling reversal is unresolved.** Wilson 2012 found running
concurrent with resistance training significantly decremented hypertrophy and
strength while cycling did not; Schumann 2022, with a decade more evidence,
finds no modality difference. Treat modality as **not** a scheduling
consideration until this settles, and note that Wilson's finding is the one most
often quoted in coaching material.

### 3.3 The direction nobody schedules for: lifting degrading the _next_ endurance session

The interference literature asks whether endurance blunts lifting. The
scheduling problem for an endurance athlete is the reverse, and Doma's reviews
are the sources for it: **residual fatigue from a resistance session may impair
the quality of a subsequent endurance session for several hours to days**, via
impaired neural recruitment, reduced movement efficiency, muscle soreness and
glycogen depletion (Doma 2017,
[PMID 28702901](https://pubmed.ncbi.nlm.nih.gov/28702901/); Doma 2019,
[PMID 30847824](https://pubmed.ncbi.nlm.nih.gov/30847824/)).

This is why the "minimum recovery between a lift and a key endurance session" is
not a single number. What the sources support:

| Pairing                                                    | Recommended separation  | Confidence                                                  |
| ---------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| Lift → **easy** endurance                                  | none required           | High — routinely done in every cited protocol               |
| Lift → **key** endurance session (threshold, VO2max, race) | **≥24 h**, ideally 48 h | Moderate — Doma's "hours to days", not a trial              |
| **Key** endurance session → lift, same day                 | **≥3 h**                | Moderate — Schumann 2022's own cut point                    |
| Both in the same session, strength goal matters            | **lift first**          | Moderate — Eddens 2018, +6.91 % lower-body dynamic strength |
| Heavy **eccentric** or novel lifting → any quality session | **48–72 h**             | Low — extrapolated from muscle-damage time course           |

**House rules for this library**, stated as conventions rather than findings:

1. Never place a heavy lower-body session in the 24 h before a key run.
2. If both must fall on one day, put them ≥3 h apart; if they cannot be
   separated, **lift first** when strength is the block's goal and **run first**
   when the run is the block's goal — Eddens' 6.91 % is a strength outcome, not
   an endurance one, and does not license putting a lift ahead of a key session.
3. Concentrate lifting on **hard days**, protecting easy days as easy. This is
   the standard "polarize the week, not just the session" argument and it is
   coaching consensus, not a trial result.

---

## 4. Portable load anchors for lifting

### 4.1 The anchor families, and which are actually portable

| Anchor          | Meaning                                  | Portable across athletes?                         | Where it comes from                                                              |
| --------------- | ---------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `%1RM`          | Fraction of one-repetition maximum       | **Only above ~85 %** — see §4.2                   | ACSM position stands; universal convention                                       |
| `RIR` †         | Reps in reserve at set termination       | **Yes** — defined by proximity to failure         | Zourdos 2016; Helms                                                              |
| `RPE 6–10` †    | Zourdos RIR-anchored scale (10 = 0 RIR)  | **Yes** — same construct, inverted                | Zourdos 2016 ([PMID 26049792](https://pubmed.ncbi.nlm.nih.gov/26049792/))        |
| `nRM` ‖         | "the heaviest load allowing n reps"      | **Yes** — self-calibrating by definition          | Rønnestad's protocols use `10RM → 4RM`                                           |
| Mean velocity § | Concentric bar speed in m·s⁻¹            | **Partly** — see §4.4                             | González-Badillo & Sánchez-Medina                                                |
| Velocity loss § | % drop in mean velocity within a set     | **Yes** — an intra-set fatigue proxy              | Sánchez-Medina 2011 ([PMID 21311352](https://pubmed.ncbi.nlm.nih.gov/21311352/)) |
| `%BW` ‖         | Fraction of bodyweight (e.g. hip thrust) | **Yes** — and the natural anchor for calisthenics | Convention                                                                       |
| Absolute kg     | A number of kilograms                    | **No** — the thing this document forbids          | —                                                                                |

### 4.2 Why `%1RM` fails the 60 kg / 120 kg test below 85 %

This is the most consequential finding in the document, and it inverts the
brief's stated premise. Richens & Cleather 2014
([PMID 24899782](https://pubmed.ncbi.nlm.nih.gov/24899782/)) had endurance
runners and weightlifters perform repetitions to failure at fixed relative
loads:

| Load     | Endurance runners    | Weightlifters       | Verdict                   |
| -------- | -------------------- | ------------------- | ------------------------- |
| 70 % 1RM | **39.9 ± 17.6** reps | **17.9 ± 2.8** reps | Not the same prescription |
| 80 % 1RM | significantly more   | fewer               | Not the same prescription |
| 90 % 1RM | **no difference**    | **no difference**   | Portable                  |

Two things follow. First, the canonical `%1RM ↔ reps` table (below) is a
population average with an enormous between-athlete SD, and it is _most_ wrong
for **precisely the population this app serves** — the fibre-type and
fatigue-resistance profile that makes someone a good endurance athlete is the
same profile that makes them an outlier on that table. Second, the endurance
athlete's correct training band (≥85 % 1RM, per ACSM's ≥80 % strength
prescription and every protocol in §6) is the band where `%1RM` _does_ travel.

**So `%1RM` is a legitimate anchor for this library specifically**, because this
library lives in the heavy band — but it must not be the _only_ anchor, because
the anatomical-adaptation and maintenance phases do not.

### 4.3 The `%1RM ↔ reps` table, with its error bars attached

| % 1RM   | Reps typically achievable to failure | Corresponding RIR at the prescribed rep count | Usable for                                  |
| ------- | ------------------------------------ | --------------------------------------------- | ------------------------------------------- |
| 100 %   | 1                                    | 0                                             | Testing only                                |
| 95 %    | 2                                    | 0–1                                           | Advanced max-strength singles               |
| 90 %    | 3–4                                  | 1–2 at 2 reps                                 | Max strength                                |
| 87 %    | 5                                    | 2 at 3 reps                                   | Max strength                                |
| 85 %    | 6                                    | 2–3 at 3–4 reps                               | **The library's core band**                 |
| 80 %    | 8                                    | 3–4 at 4–5 reps                               | Transition / volume phase                   |
| 75 %    | 10                                   | 4+ at 6 reps                                  | Anatomical adaptation                       |
| 70 %    | 12 (**runners: ~40**)                | uninterpretable                               | Power (with low reps), AA                   |
| 60 %    | 20+ (**runners: far more**)          | uninterpretable                               | Power, technique, warm-up                   |
| 30–70 % | —                                    | —                                             | ACSM's **power** band, ≤24 repetitions·sets |

⚠️ **Treat every row below 85 % as a starting estimate, not a lookup.** The
runners column is Richens & Cleather's; it is one study on one exercise, but the
direction is unambiguous and the magnitude (>2×) is far too large to ignore. Qin
2025 ([PMID 40133968](https://pubmed.ncbi.nlm.nih.gov/40133968/)) reaches the
same conclusion by a different route: both `%1RM`-to-failure and velocity-based
estimates **overestimated intended RIR at 60 % 1RM** and were accurate at 80 %.

**ACSM 2026's three prescriptions** (Currier et al., _MSSE_ 58(4):851–872, doi
[10.1249/MSS.0000000000003897](https://doi.org/10.1249/MSS.0000000000003897))
frame the library's phases and are already this repo's authority via ADR 0047
§3: **strength** ≥80 % 1RM, 2–3 sets, ≥2 sessions/wk · **hypertrophy** ≥10
sets/wk · **power** 30–70 % 1RM, ≤24 repetitions·sets.

### 4.4 RIR autoregulation

The Zourdos RIR-anchored RPE scale is the practical instrument
([PMID 26049792](https://pubmed.ncbi.nlm.nih.gov/26049792/)):

| RPE | Meaning                      | RIR |
| --- | ---------------------------- | --- |
| 10  | Maximal                      | 0   |
| 9.5 | No more reps, could add load | 0   |
| 9   | One rep left                 | 1   |
| 8   | Two reps left                | 2   |
| 7   | Three reps left              | 3   |
| 5–6 | Four to six left             | 4–6 |

Two caveats the scale's own authors document. **Novices rate poorly**: Zourdos
found experienced squatters showed slower velocity and higher RPE at maximum
effort, i.e. better calibration. And RIR accuracy degrades badly at **low loads
and far from failure** — Qin 2025 above. The practical upshot: **RIR is the most
portable anchor available and it is least accurate exactly where a novice
endurance athlete starts.** An app should therefore prefer `nRM` references
(`@ 10RM`) for novices, which are self-calibrating without requiring
introspection, and RIR for trained athletes.

### 4.5 Velocity-based training

Two distinct uses, with different evidential standing.

**Velocity as a load anchor** ("lift at 0.5–0.6 m/s"). Rests on the individual
load–velocity profile being linear and stable, which it broadly is, but the
mapping is **exercise-specific and individual**, so the widely circulated
generic tables are a convenience. Representative mean-concentric-velocity
anchors for the back squat:

| Zone                  | Mean concentric velocity | ≈ % 1RM | Use in this library     |
| --------------------- | ------------------------ | ------- | ----------------------- |
| Absolute strength     | < 0.50 m/s               | ≥ 85 %  | S6–S13 max strength     |
| Accelerative strength | 0.50–0.75 m/s            | 75–85 % | Transition work         |
| Strength–speed        | 0.75–1.00 m/s            | 55–75 % | S17 Olympic derivatives |
| Speed–strength        | 1.00–1.30 m/s            | 30–55 % | S14, S18 ballistic      |
| Starting strength     | > 1.30 m/s               | < 30 %  | Jumps, throws           |

⚠️ **These band edges are coaching-practice convention, not a single citable
table**, they are for the back squat only, and bench-press bands sit lower. Cite
them as conventions.

**Velocity loss as a fatigue stop rule** is the better-evidenced use and the
more useful one here. Sánchez-Medina & González-Badillo 2011
([PMID 21311352](https://pubmed.ncbi.nlm.nih.gov/21311352/)) found within-set
velocity loss and countermovement-jump-height loss correlate **r = 0.91–0.97**
with lactate and ammonia accumulation across 15 protocols. That makes "stop the
set at −10 % velocity" a directly measured fatigue ceiling rather than a guess —
which is exactly what an endurance athlete who must run tomorrow wants. **A −10
% velocity-loss cap is the single most defensible way to prescribe "heavy but
not fatiguing" in this whole document.**

Its cost for a data model: **a velocity-loss set has no authored rep count.**
`ExerciseSet.kind = 'reps' | 'timed' | 'amrap'` cannot represent it. See §14.

---

## 5. Library — Phase 1: Anatomical adaptation (S1–S5)

**Purpose.** Build tissue tolerance and movement competence so the max-strength
phase can be loaded safely. Connective tissue adapts more slowly than muscle;
this phase exists mostly for tendon, and secondarily for technique.

**Phase conventions.** 2–3 sessions/wk · 2–3 sets · 10–15 reps · RIR 3–5 · 60–90
s rest · controlled tempo · never to failure · 3–6 weeks (novice: 6–8). Placed
in **general preparation**, when endurance volume is lowest.

### Prescription

| #      | Name                             | Structure (portable anchors)                                                                                                                                            | Rest    | Tempo     | Freq   | Source / basis                     |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | ------ | ---------------------------------- |
| **S1** | AA full-body A                   | Goblet squat 3 × 12 @ RIR 4 · Push-up 3 × 10–15 @ RIR 3 · Romanian deadlift 3 × 12 @ RIR 4 · Single-arm row 3 × 12/side @ RIR 3 · Plank 3 × 45 s                        | 60–90 s | 2-0-2     | 2–3/wk | ACSM 2026 general prep             |
| **S2** | AA full-body B — unilateral      | Split squat 3 × 10/leg @ RIR 4 · Single-leg RDL 3 × 10/leg @ RIR 4 · Step-up 3 × 10/leg @ RIR 4 · Half-kneeling press 3 × 12 @ RIR 3 · Side plank 3 × 30 s/side         | 60–90 s | 2-0-2     | 2/wk   | Blagrove 2018 (unilateral bias)    |
| **S3** | AA posterior chain / hinge       | Hip hinge patterning 3 × 12 @ RIR 5 · Hip thrust 3 × 12 @ 50 % BW ‖ · Back extension 3 × 15 @ BW ‖ · Nordic hamstring 2 × 5 (assisted) · Calf raise 3 × 15              | 90 s    | 2-1-2     | 2/wk   | Convention + injury-prevention lit |
| **S4** | AA runner's tendon primer (HSR)  | Heel-raise, straight-leg 3 × 15 @ RIR 4 ‡ · Heel-raise, bent-knee 3 × 15 @ RIR 4 ‡ · Leg press 3 × 15 @ RIR 4 ‡ · Split squat 2 × 12/leg                                | 2 min   | **3-0-3** | 2–3/wk | Heavy Slow Resistance protocol     |
| **S5** | AA upper / pull — ski, row, swim | Seated pull-down 3 × 12 @ RIR 4 · Cable double-poling pull 3 × 15 @ RIR 4 · Triceps press-down 3 × 12 @ RIR 3 · Bent-over row 3 × 12 @ RIR 3 · Pallof press 3 × 10/side | 60–90 s | 2-0-2     | 2/wk   | Losnegard 2011 exercise selection  |

### Notation & progression

| #   | Workout Notation (this repo's renderer)                                                                                                                                                                                  | Progress by                                                                           | Regress by                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| S1  | `Goblet squat → 3 × 12 @ RIR 4 † · 90 s rest → Push-up → 3 × 12 @ RIR 3 † · 90 s rest → Romanian deadlift → 3 × 12 @ RIR 4 † · 90 s rest → Single-arm row → 3 × 12 @ RIR 3 † · 60 s rest → Plank → 3 × 45 s · 60 s rest` | Add a set (3 → 4); then drop to RIR 3; then move to S6                                | 2 sets; RIR 5; halve the rep count                |
| S2  | `Split squat → 3 × 10 @ RIR 4 † · 90 s rest → Single-leg Romanian deadlift → 3 × 10 @ RIR 4 † · 90 s rest → Step-up → 3 × 10 @ RIR 4 † · 90 s rest → Half-kneeling press → 3 × 12 @ RIR 3 †`                             | Hold a load in the contralateral hand; then move to a rear-foot-elevated split squat  | Reduce range of motion; hold a support            |
| S3  | `Hip hinge → 3 × 12 @ RIR 5 † → Hip thrust → 3 × 12 @ 50% BW ‖ · 90 s rest → Back extension → 3 × 15 · 90 s rest → Nordic hamstring → 2 × 5 · 2 min rest → Standing calf raise → 3 × 15`                                 | Nordic 2 × 5 → 3 × 6 → 3 × 8; hip thrust 50 → 75 → 100 % BW                           | Assisted Nordic (band); Romanian deadlift instead |
| S4  | `Straight-leg heel raise → 3 × 15 @ RIR 4 † ‡ · 2 min rest → Bent-knee heel raise → 3 × 15 @ RIR 4 † ‡ · 2 min rest → Leg press → 3 × 15 @ RIR 4 † ‡ · 2 min rest`                                                       | Weeks 1–12 of the HSR ramp: 3 × 15 → 3 × 12 → 4 × 10 → 4 × 8 → 4 × 6, tempo unchanged | Bodyweight only; two-leg instead of single-leg    |
| S5  | `Seated pull-down → 3 × 12 @ RIR 4 † · 90 s rest → Cable double-poling pull → 3 × 15 @ RIR 4 † · 90 s rest → Triceps press-down → 3 × 12 @ RIR 3 † → Bent-over row → 3 × 12 @ RIR 3 †`                                   | Move to S9's `10RM → 4RM` ramp                                                        | Band resistance instead of cable                  |

**On S4 (heavy slow resistance).** The 3-0-3 tempo _is_ the intervention: the
tendon adaptation depends on time under high load, not on rep count. This is the
one family in the library where a missing tempo field makes the prescription
**wrong rather than incomplete** (§14). ⚠️ The HSR protocol is drawn from the
tendinopathy rehabilitation literature (Achilles and patellar); its use as a
**prophylactic** primer for healthy runners is extrapolation, and is flagged as
such.

---

## 6. Library — Phase 2: Maximal strength (S6–S13)

**Purpose.** The phase that produces the effect sizes in §2.1. Raise maximal
force and rate of force development; buy the economy improvement.

**Phase conventions.** 2 sessions/wk · 3–4 sets · 3–6 reps · **≥85 % 1RM** or
RIR 1–3 · 3–4 min rest · maximal _intent_ on the concentric regardless of actual
bar speed · **not to failure** · 6–12 weeks. Placed in **specific preparation**,
never within 24 h before a key endurance session.

### Prescription

| #       | Name                                       | Structure (portable anchors)                                                                                                                                      | Rest    | Tempo                | Freq | Source / basis                                                                            |
| ------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | ---- | ----------------------------------------------------------------------------------------- |
| **S6**  | Max strength A — squat                     | Back squat 4 × 4 @ 85–90 % 1RM (RIR 2) · Bulgarian split squat 3 × 6/leg @ RIR 2 · Standing calf raise 3 × 8 @ RIR 2 · Pallof press 3 × 8/side                    | 3–4 min | 2-0-X (explosive up) | 2/wk | ACSM 2026 ≥80 %; Rønnestad & Mujika 2014                                                  |
| **S7**  | Max strength B — hinge                     | Trap-bar deadlift 4 × 4 @ 85 % 1RM (RIR 2) · Hip thrust 3 × 6 @ RIR 2 · Single-leg RDL 3 × 6/leg @ RIR 3 · Nordic hamstring 3 × 6                                 | 3–4 min | 2-0-X                | 2/wk | Same; hinge counterpart to S6                                                             |
| **S8**  | **Rønnestad protocol** (the cited one)     | Half squat · one-legged leg press · one-legged hip flexion · standing calf raise — **3 sets each**, ramping **10RM → 4RM over 12 weeks** ‖                        | 3 min   | 2-0-X                | 2/wk | Rønnestad 2010 ([PMID 19960350](https://pubmed.ncbi.nlm.nih.gov/19960350/)); Vikmoen 2016 |
| **S9**  | Upper-body max strength — ski / row / swim | Seated pull-down 4 × 5 @ RIR 2 · Standing double-poling pull 4 × 5 @ RIR 2 · Triceps press 3 × 6 @ RIR 2 · Bent-over row 3 × 6 @ RIR 2                            | 3 min   | 2-0-X                | 2/wk | Losnegard 2011 ([PMID 20136751](https://pubmed.ncbi.nlm.nih.gov/20136751/))               |
| **S10** | Heavy cluster / velocity-capped singles    | Back squat — sets of 3 singles @ 88–92 % 1RM, 20 s intra-cluster rest, **stop the exercise when mean velocity falls > 10 %** §                                    | 3 min   | maximal intent       | 1/wk | Sánchez-Medina 2011 ([PMID 21311352](https://pubmed.ncbi.nlm.nih.gov/21311352/))          |
| **S11** | Low-fatigue max strength (**the default**) | Back squat 3 × 3 @ 85 % 1RM (**RIR 3**) · Trap-bar deadlift 3 × 3 @ 82 % (RIR 3) · Calf raise 2 × 8 @ RIR 3 — **~25 min, no soreness intended**                   | 3 min   | 2-0-X                | 2/wk | Convention derived from Doma 2017's residual-fatigue cost                                 |
| **S12** | Tendon-loading day (HSR, loaded)           | Straight-leg heel raise 4 × 6 @ RIR 2 ‡ · Bent-knee heel raise 4 × 6 @ RIR 2 ‡ · Leg press 4 × 6 @ RIR 2 ‡ — **tempo 3-0-3 throughout**                           | 2–3 min | **3-0-3**            | 2/wk | HSR protocol, loaded stage                                                                |
| **S13** | Unilateral max strength                    | Rear-foot-elevated split squat 4 × 5/leg @ RIR 2 · Single-leg press 4 × 5/leg @ RIR 2 · Single-leg calf raise 3 × 8/leg @ RIR 2 · Copenhagen adduction 3 × 8/side | 3 min   | 2-0-X                | 2/wk | Rønnestad 2010's one-legged bias; running specificity                                     |

### Notation & progression

| #   | Workout Notation                                                                                                                                                                          | Progress by                                                                                      | Regress by                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| S6  | `Back squat → 4 × 4 @ 85% 1RM · 4 min rest → Bulgarian split squat → 3 × 6 @ RIR 2 † · 3 min rest → Standing calf raise → 3 × 8 @ RIR 2 † · 2 min rest`                                   | 85 % → 87 % → 90 % across a 4-week block; then reset −5 % and add a set                          | 3 × 5 @ 80 %, RIR 3; goblet squat if bar position hurts |
| S7  | `Trap-bar deadlift → 4 × 4 @ 85% 1RM · 4 min rest → Hip thrust → 3 × 6 @ RIR 2 † · 3 min rest → Single-leg Romanian deadlift → 3 × 6 @ RIR 3 †`                                           | Same %-ramp as S6; trap bar → conventional deadlift once technique holds                         | Romanian deadlift from mid-shin; 3 × 6 @ 75 %           |
| S8  | `Half squat → 3 × 8 @ 8RM ‖ · 3 min rest → One-legged leg press → 3 × 8 @ 8RM ‖ · 3 min rest → One-legged hip flexion → 3 × 8 @ 8RM ‖ · 2 min rest → Standing calf raise → 3 × 8 @ 8RM ‖` | **Weeks 1–3: 10RM · 4–6: 8RM · 7–9: 6RM · 10–12: 4RM.** This _is_ the progression                | Hold at 10RM; 2 sets                                    |
| S9  | `Seated pull-down → 4 × 5 @ RIR 2 † · 3 min rest → Standing double-poling pull → 4 × 5 @ RIR 2 † · 3 min rest → Triceps press → 3 × 6 @ RIR 2 †`                                          | 10RM → 4RM ramp as S8                                                                            | 3 × 8 @ RIR 4                                           |
| S10 | `3 × ( Back squat → 3 × 1 @ 90% 1RM · 20 s rest ) → (3 min rest)` — **block repeat, cluster inside** §                                                                                    | Add a cluster (3 → 4 blocks) before adding load                                                  | 88 %; 2 clusters; drop the velocity cap and use RIR 2   |
| S11 | `Back squat → 3 × 3 @ 85% 1RM · 3 min rest → Trap-bar deadlift → 3 × 3 @ 82% 1RM · 3 min rest → Standing calf raise → 2 × 8 @ RIR 3 †`                                                    | This session is deliberately **not** progressed into fatigue; add load only when RIR drifts to 4 | 2 × 3; drop the deadlift                                |
| S12 | `Straight-leg heel raise → 4 × 6 @ RIR 2 † ‡ · 3 min rest → Bent-knee heel raise → 4 × 6 @ RIR 2 † ‡ · 3 min rest → Leg press → 4 × 6 @ RIR 2 † ‡`                                        | 3 × 15 (S4) → 3 × 12 → 4 × 10 → 4 × 8 → 4 × 6, tempo constant                                    | Back to S4                                              |
| S13 | `Rear-foot-elevated split squat → 4 × 5 @ RIR 2 † · 3 min rest → Single-leg press → 4 × 5 @ RIR 2 † · 3 min rest → Single-leg calf raise → 3 × 8 @ RIR 2 †`                               | Add external load before adding reps                                                             | Bodyweight split squat; reduce elevation                |

**Note on S8.** This is the closest thing in the literature to a copy-and-run
protocol with a measured performance outcome behind it, and it is notable that
its load anchor is **`nRM`, not `%1RM`** — the protocol self-calibrates, needs
no 1RM test, and sidesteps §4.2's problem entirely. ‖ is therefore not a
nice-to-have marker: **the best-evidenced session in this document is
unauthorable in trainm8 today.**

---

## 7. Library — Phase 3: Power and explosive (S14–S19)

**Purpose.** Convert maximal force into rate of force development and tendon
stiffness. Denadai 2017 gives explosive work the _larger_ running-economy effect
(−4.83 % vs −3.65 %); Paavolainen 1999 is the proof of concept.

**Phase conventions.** 1–2 sessions/wk · low reps · **maximal intent** · long
rest · **quality-limited, never fatigue-limited** — the set ends when speed
drops, not when reps run out. ACSM 2026's power band is **30–70 % 1RM with ≤24
repetitions·sets**. Placed in **pre-competition**, and this is the phase most
vulnerable to interference (Schumann 2022: explosive strength SMD −0.28).

### Prescription

| #       | Name                              | Structure (portable anchors)                                                                                                                      | Rest                  | Freq | Source / basis                                                         |
| ------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---- | ---------------------------------------------------------------------- |
| **S14** | Contrast / complex pairs          | 4 × ( Back squat 3 @ 85 % 1RM → 90 s → Countermovement jump 5 @ max intent ) · then Hip thrust 3 × 5 @ RIR 3                                      | 3–4 min between pairs | 1/wk | Post-activation potentiation practice                                  |
| **S15** | Plyometrics A — reactive, low     | Pogo hops 3 × 20 · Ankle bounds 3 × 20 m · Low box jump-down-to-jump (20 cm) 3 × 6 · Skipping 3 × 30 m · **ground contacts ≤ 120**                | 90 s                  | 2/wk | Paavolainen 1999; Denadai 2017 explosive arm                           |
| **S16** | Plyometrics B — high intensity    | Drop jump from 30–40 cm 4 × 5 · Alternate-leg bounding 4 × 20 m · Single-leg hop 3 × 8/leg · Hurdle hops 3 × 6 · **ground contacts ≤ 100**        | 2–3 min               | 1/wk | Paavolainen 1999 (5-km time ↓, VO2max unchanged)                       |
| **S17** | Olympic-derivative power          | Hang power clean 5 × 3 @ 70–80 % 1RM § (target 0.9–1.1 m/s) · Mid-thigh pull 4 × 3 @ 80 % · Jump squat 4 × 4 @ 30 % 1RM § (>1.0 m/s)              | 3 min                 | 1/wk | ACSM 2026 power band; VBT convention (§4.5)                            |
| **S18** | Ballistic upper — ski, row, swim  | Medicine-ball slam 5 × 5 · Explosive cable double-poling 5 × 5 @ 0.8–1.0 m/s § · Explosive pull-down 4 × 4 @ 60 % 1RM · Med-ball chest pass 4 × 5 | 2–3 min               | 1/wk | Losnegard 2011 exercise selection, power variant                       |
| **S19** | Maximal hill sprints (the bridge) | 8 × 8 s maximal uphill sprint on 6–10 % grade, **walk-back full recovery (2–3 min)**                                                              | 2–3 min               | 1/wk | Cross-refers to [workouts-running.md](workouts-running.md) archetype F |

### Notation & progression

| #   | Workout Notation                                                                                                                              | Progress by                                                            | Regress by                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| S14 | `4 × ( Back squat → 3 × 1 @ 85% 1RM · 90 s rest → Countermovement jump → 1 × 5 ) → (3 min rest)`                                              | Shorten the intra-pair rest 90 s → 60 s; then add a pair               | Drop the contrast: squat and jumps as separate steps |
| S15 | `Pogo hop → 3 × 20 · 90 s rest → Ankle bound → 3 × 20 · 90 s rest → Box jump-down → 3 × 6 · 90 s rest → Skip → 3 × 30`                        | Raise ground contacts 120 → 140; then progress to S16                  | Halve contacts; remove the box                       |
| S16 | `Drop jump → 4 × 5 · 3 min rest → Alternate-leg bound → 4 × 20 · 3 min rest → Single-leg hop → 3 × 8 · 2 min rest → Hurdle hop → 3 × 6`       | Box height 30 → 40 → 50 cm only when contact time is unchanged         | Back to S15; two-leg only; grass instead of track    |
| S17 | `Hang power clean → 5 × 3 @ 75% 1RM · 3 min rest → Mid-thigh pull → 4 × 3 @ 80% 1RM · 3 min rest → Jump squat → 4 × 4 @ 30% 1RM · 3 min rest` | Hold the velocity band and add load until velocity falls out of band § | Replace cleans with mid-thigh pulls; drop to 3 sets  |
| S18 | `Medicine-ball slam → 5 × 5 · 2 min rest → Explosive cable double-poling → 5 × 5 · 2 min rest → Explosive pull-down → 4 × 4 @ 60% 1RM`        | Load, then rate, then reps — in that order                             | Bands; fewer sets                                    |
| S19 | `10 min warm-up → 8 × ( 8 s @ RPE 10 → (2 min 30 s rest) ) → 10 min cool-down` — **cardio steps, not strength steps**                         | 8 → 10 reps; then grade 6 % → 10 %                                     | 6 reps; flat sprints                                 |

**S19 is deliberately modelled as cardio.** It is a neuromuscular session with a
strength purpose, and it demonstrates the classification problem directly: it
carries a `run` discipline, contributes rTSS/hrTSS, and would count toward
endurance adherence — while the physiological intent belongs to this phase. See
§14.6.

---

## 8. Library — Phase 4: In-season maintenance (S20–S25)

**Purpose.** Hold the adaptation bought in phases 2–3 at the lowest possible
cost in fatigue and time.

**The key finding.** Rønnestad 2010: cyclists who lifted **twice weekly** for a
12-week preparatory period and then **once weekly** through a 13-week
competitive period **maintained** thigh CSA and leg strength and **continued to
improve** sprint peak power, LT power and 40-min mean power against
endurance-only controls
([PMID 20799042](https://pubmed.ncbi.nlm.nih.gov/20799042/)). The companion
frequency experiment in soccer players found **1×/wk maintained** strength,
sprint and jump, while **once per fortnight lost** leg strength and 40 m sprint
([PMID 21873897](https://pubmed.ncbi.nlm.nih.gov/21873897/)).

**So the maintenance dose is one session per week, and one per fortnight is not
enough.** That is a rare, directly actionable, directly citable number.

### Prescription

| #       | Name                                   | Structure (portable anchors)                                                                                                                   | Rest  | Freq     | Source / basis                                                              |
| ------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | --------------------------------------------------------------------------- |
| **S20** | **Minimum effective maintenance**      | Back squat 3 × 4 @ 85 % 1RM (RIR 2) · Trap-bar deadlift 2 × 4 @ 82 % (RIR 2) — **~20–25 min total**                                            | 3 min | **1/wk** | Rønnestad 2010 ([PMID 20799042](https://pubmed.ncbi.nlm.nih.gov/20799042/)) |
| **S21** | Race-week maintenance (**taper-safe**) | Back squat 2 × 3 @ 80 % 1RM (**RIR 4**) · Countermovement jump 2 × 3 — **≤15 min, no soreness, ≥72 h before race**                             | 3 min | 1×       | Convention: retain neural drive, add no fatigue                             |
| **S22** | Maintenance + plyometric top-up        | Back squat 3 × 4 @ 85 % (RIR 2) · Drop jump 3 × 5 · Bounding 3 × 20 m — **ground contacts ≤ 60**                                               | 3 min | 1/wk     | Combines S20 with S16's smallest useful dose                                |
| **S23** | Travel / no-equipment maintenance      | Single-leg squat 3 × 8/leg @ RIR 2 ‖ · Nordic hamstring 3 × 6 · Single-leg calf raise 3 × 12/leg @ RIR 2 · Isometric split-squat hold 3 × 30 s | 2 min | 1/wk     | ⚠️ **weakest row in the library** — see below                               |
| **S24** | Injury-prevention adjunct              | Nordic hamstring 3 × 6 · Copenhagen adduction 3 × 8/side · Single-leg calf raise 3 × 15/leg · Hip abduction 3 × 15/side                        | 90 s  | 1–2/wk   | Injury-prevention literature, not performance lit                           |
| **S25** | Trunk / anti-rotation                  | Pallof press 3 × 10/side · Side plank 3 × 45 s/side · Dead bug 3 × 10/side · Suitcase carry 3 × 30 m/side                                      | 60 s  | 1–2/wk   | ⚠️ **weak evidence** — see §10                                              |

### Notation & progression

| #   | Workout Notation                                                                                                                                                                 | Progress by                                                         | Regress by                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| S20 | `Back squat → 3 × 4 @ 85% 1RM · 3 min rest → Trap-bar deadlift → 2 × 4 @ 82% 1RM · 3 min rest`                                                                                   | Do **not** progress in-season; hold the relative load as 1RM drifts | Drop the deadlift; 2 × 4                     |
| S21 | `Back squat → 2 × 3 @ 80% 1RM · 3 min rest → Countermovement jump → 2 × 3`                                                                                                       | n/a — this session exists to _not_ progress                         | Jumps only                                   |
| S22 | `Back squat → 3 × 4 @ 85% 1RM · 3 min rest → Drop jump → 3 × 5 · 2 min rest → Alternate-leg bound → 3 × 20 · 2 min rest`                                                         | Contacts 60 → 80                                                    | Drop the plyometrics (→ S20)                 |
| S23 | `Single-leg squat → 3 × 8 @ RIR 2 † ‖ · 2 min rest → Nordic hamstring → 3 × 6 · 2 min rest → Single-leg calf raise → 3 × 12 @ RIR 2 † ‖ → Isometric split-squat hold → 3 × 45 s` | Add a backpack; slow the tempo                                      | Two-leg variants                             |
| S24 | `Nordic hamstring → 3 × 6 · 90 s rest → Copenhagen adduction → 3 × 8 · 90 s rest → Single-leg calf raise → 3 × 15 · 90 s rest`                                                   | Nordic 3 × 6 → 3 × 8 → 3 × 10                                       | Band-assisted Nordic; short-lever Copenhagen |
| S25 | `Pallof press → 3 × 10 · 60 s rest → Side plank → 3 × 45 s · 60 s rest → Dead bug → 3 × 10 · 60 s rest → Suitcase carry → 3 × 30`                                                | Load, not duration                                                  | Knees-down side plank                        |

⚠️ **S23 is the library's weakest row and should be labelled as such
in-product.** Denadai 2017 found isometric training's effect on running economy
**not significant** (−2.20 ± 4.37 %, p = 0.324), and bodyweight-only work cannot
reach the ≥85 % 1RM band the phase-2 evidence rests on. S23 preserves _some_
neural stimulus during travel; it is not a substitute for S20 and should not be
presented as one.

---

## 9. Plyometrics and running economy

Plyometrics has the **best** economy effect size in the meta-analytic record and
the **worst** fit with everything this repo can measure.

| Finding                                                  | Figure                                    | Source           |
| -------------------------------------------------------- | ----------------------------------------- | ---------------- |
| Explosive training on running economy                    | **−4.83 ± 1.53 %** oxygen cost, p < 0.001 | Denadai 2017     |
| Heavy weight training, same outcome                      | −3.65 ± 2.74 %, p = 0.009                 | Denadai 2017     |
| Isometric training, same outcome                         | −2.20 ± 4.37 %, **n.s.**                  | Denadai 2017     |
| 5-km time with 32 % of volume replaced by explosive work | improved; **VO2max unchanged**            | Paavolainen 1999 |
| Explosive strength gains under concurrent training       | attenuated, SMD **−0.28**                 | Schumann 2022    |

Three things follow for an app.

1. **The dose is counted in ground contacts, not in sets and reps.** Coaching
   convention runs ~60–100 contacts for an introductory session and ~100–150 for
   a developed one, per session, with 48–72 h between sessions. The repo has no
   quantity for this: it is neither `reps` (a contact is not a rep of a named
   exercise in the sense `ExerciseSet` means) nor `durationSec`.
2. **Progression is by intensity of ground contact, not by volume.** Drop
   height, single- vs double-leg, and surface are the progression axes. None is
   expressible; all three would have to live in `notes`.
3. **Plyometrics is the phase most damaged by concurrent training** (Schumann's
   −0.28 is _the_ significant interference finding), which means it is the phase
   where scheduling matters most and the phase an app can help most with — by
   protecting it from the surrounding endurance load rather than by prescribing
   it better.

⚠️ Paavolainen's design replaced 32 % of training volume with explosive work.
That is a **substitution**, not an addition, and no study in the set tested
adding plyometrics on top of an unchanged endurance load. The library's
ground-contact caps are conventions chosen to keep the addition small.

---

## 10. Core and stability work — and why its evidence base is weak

The honest summary is short. Reed et al. 2012, _Sports Medicine_ 42(8),
[PMID 22784233](https://pubmed.ncbi.nlm.nih.gov/22784233/), reviewed 24 studies
and concluded that **"targeted core stability training provides marginal
benefits to athletic performance"**, with conflicting findings across studies,
no standardised measurement protocol, and — decisively — core work almost always
delivered **inside a more comprehensive programme**, so its independent
contribution cannot be isolated.

Nothing found in this pass overturns that. A targeted search for systematic
reviews of core/trunk training against _endurance or running_ performance
specifically returned **no directly relevant reviews** — the retrieved set was
racket sports, basketball and general functional training. That absence is
itself the finding: **there is no endurance-specific core-training evidence base
to summarise.**

What this means for the library and the app:

- **S25 stays in the library**, because athletes want it and it is harmless, but
  it is the **only** session here whose prescription cannot cite an effect size.
- **It must not be phase-critical.** Nothing in the periodization model (§11)
  should make a block's success depend on trunk work.
- **It is a candidate for the honesty treatment this repo already applies
  elsewhere.** A seeded template whose citation field reads "marginal benefit;
  cannot be isolated from the surrounding programme" is more useful than one
  with a fabricated rationale, and matches ADR 0033's confidence vocabulary.
- **The strong version of the claim — that core training prevents running
  injuries — was not found supported** in this pass. S24 (Nordic hamstring,
  Copenhagen adduction) has a real injury-prevention literature behind it; S25
  does not, and conflating them is the common error.

---

## 11. Periodizing strength alongside endurance

### 11.1 The block model

Issurin's argument (_Sports Medicine_ 2010;40(3):189–206,
[PMID 20199119](https://pubmed.ncbi.nlm.nih.gov/20199119/); and _J Sports Med
Phys Fitness_ 2008;48(1):65–75) is that traditional "mixed" periodization
produces **conflicting physiological responses** when many abilities are trained
at once, and that the remedy is sequenced blocks of **highly concentrated
workloads directed at a minimal number of targeted abilities** — accumulation →
transmutation → realization.

Applied to a hybrid athlete, that maps onto this library as:

| Issurin block     | Endurance emphasis           | Strength phase                       | Sessions      | Strength freq |
| ----------------- | ---------------------------- | ------------------------------------ | ------------- | ------------- |
| **Accumulation**  | High volume, low intensity   | Anatomical adaptation → max strength | S1–S5 → S6–S9 | 2–3/wk        |
| **Transmutation** | Sport-specific intensity     | Max strength, reduced volume         | S11, S13      | 2/wk          |
| **Realization**   | Taper, race-specific quality | Maintenance + power                  | S20, S21, S22 | 1/wk          |

⚠️ Kiely's commentary in the same journal issue (_Sports Medicine_ 2010;40(9):
803–805, [PMID 20806489](https://pubmed.ncbi.nlm.nih.gov/20806489/)) — "block
periodization: new horizon or a false dawn?" — is a documented dissent, and
block periodization has no meta-analytic superiority result behind it. Present
it as **one coherent scheme**, not as the correct one.

### 11.2 The decoupling argument, which this repo already implements

Issurin's separation of blocks is about **deload timing**, not about volume
ceilings. A strength deload that lands because the _running_ phase ended is
exactly the coupling the block model exists to avoid. ADR 0047 §6 already
reaches this conclusion and lets a strength segment float free of the Plan
Outline phases, with its own `startWeekKey` + `weeks`. **That decision is
confirmed by this research on its own terms**, independent of the Volume
Landmark argument that ADR 0047 retired.

### 11.3 The one-way ratchet the evidence does support

Two frequency findings are firm enough to encode as conventions:

- **2×/wk builds, 1×/wk maintains, 0.5×/wk loses** (Rønnestad 2010, 2011).
- **≥2 sessions/wk** is ACSM 2026's strength prescription.

And one that is firm enough to encode as a _refusal_: ADR 0047 §7's "no upward
ratchet" survives everything found here. Barsuhn 2025 and Enes 2024 both
randomised trained lifters to raise volume relative to their own baseline and
found **no size benefit and, in Barsuhn's case, better 1RM in the maintenance
group**. For an athlete whose primary sport is endurance, the case for a
volume-raising nudge is weaker still.

---

## 12. Quantifying strength load — three candidates, one survivor

This section exists to test ADR 0046 and ADR 0047 against the physiology
literature rather than against this repo's other documents. **Both survive.**

### 12.1 Why strength resists TSS-style quantification structurally

TSS-family metrics are all of the form `intensity² × duration`, where intensity
is a fraction of a **sustainable metabolic threshold**. Every term breaks for
lifting:

| TSS term       | Endurance meaning                       | Strength equivalent                                                     |
| -------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Intensity      | Fraction of FTP / LTHR / threshold pace | `%1RM` — a fraction of a **mechanical maximum**, not a sustainable rate |
| Duration       | Time at that intensity                  | Time under load is ~5–10 % of session clock time                        |
| The square law | Metabolic cost rises supralinearly      | No metabolic analogue; a 90 % single costs almost no oxygen             |
| The integral   | Continuous over the session             | Discrete: the stimulus lives in ~15 bursts of 10–20 s                   |

A 45-minute heavy session contains perhaps **4 minutes** of actual work. Any
clock-time-based formula therefore prices the rest intervals, which is where
`hours × assumed intensity` gets its number from — the exact quantity ADR 0046
§2 removed from CTL/ATL/TSB.

### 12.2 The three defensible alternatives, assessed

| Currency                                     | What it is                      | Evidence for                                                                                                                                                                | Fatal or serious objection                                                                                                                                                                                                                                                                                   | Verdict                                                                                           |
| -------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Tonnage / volume load** (sets × reps × kg) | Total kg moved                  | McBride 2009 ([PMID 19130641](https://pubmed.ncbi.nlm.nih.gov/19130641/)): VL **discriminates** hypertrophy/strength from power protocols, where total work does not        | **Denominated in kg, so it fails the 60/120 kg test by construction** — the 120 kg squatter banks ~2× the tonnage for an identical relative stimulus. Also rewards light high-rep work over heavy low-rep work, inverting this library's whole thesis: S20 (5 heavy sets) scores _below_ S1 (12 light sets). | **Reject** as a load currency; keep as an optional _per-athlete trend_ only                       |
| **sRPE** (`RPE × minutes`)                   | Foster's session load           | Day 2004 ([PMID 15142026](https://pubmed.ncbi.nlm.nih.gov/15142026/)): ICC **0.88** across high/moderate/low resistance sessions — genuinely reliable                       | Reliable ≠ commensurable. Multiplying by **minutes** prices the rest intervals (§12.1); it is `hours × assumed intensity`, which ADR 0046 §2 removed on evidentiary grounds, and its validity against endurance TSS is r 0.25–0.52. It also only ever _adds_, biasing readiness toward "go hard".            | **Reject** for any cross-modality use; defensible only as a strength-only, strength-scaled figure |
| **Hard-set counting**                        | Working sets taken near failure | The currency the dose-response literature itself uses: Baz-Valle 2022 ([PMID 35291645](https://pubmed.ncbi.nlm.nih.gov/35291645/)), Pelland 2026, ACSM 2026's "≥10 sets/wk" | Insensitive to load — 3 × 4 @ 90 % and 3 × 12 @ 65 % both count as 3. Needs a proximity-to-failure qualifier (RIR ≤ ~4) to mean anything. Not comparable across muscle groups.                                                                                                                               | **Accept** — and it is what ADR 0047 §2 already chose                                             |

### 12.3 What this confirms

**ADR 0046 is confirmed from the physiology side.** No source located in this
pass prices resistance training in TSS or in any endurance-load currency, and
§12.1 explains why: the failure is structural, not a gap someone will close with
better data. The consolidated verdict already recorded in [README.md](README.md)
— "no source anywhere prices lifting in TSS, and the reason is structural" — is
reproduced here from an independent literature set.

**ADR 0047 §2's choice of `sets` is confirmed as the least-bad currency**, with
one caveat worth recording: the literature's set counts are **hard sets** — sets
taken reasonably close to failure — and this library deliberately prescribes
**RIR 2–3, not failure**. A season anchor pre-filled from an athlete's logged
sets/wk is counting a slightly different object from the one Baz-Valle counted.
That is a labelling matter, not a reason to change currency, but the pre-fill's
copy should not imply the athlete's number is comparable to a published range —
which ADR 0047's accepted-costs section already says.

**One thing this research would add if asked:** a **hard-set qualifier** derived
from the set's authored RIR. Once `ExerciseSet` can carry RIR (§14), "sets/wk"
can be counted honestly as "sets at RIR ≤ 4", which is the literature's unit
rather than an approximation of it. That is a small, cheap, evidence-improving
change and it depends on nothing except the load-union work.

---

## 13. Other disciplines

Shorter by design. The common question in all three is: **what is the portable
intensity anchor when the discipline has no FTP and no threshold pace?**

### 13.1 Cross-country skiing

Norway is this app's home context and XC skiing is where the strength and
endurance literatures actually meet — double poling is a whole-body strength
event with a 3-hour aerobic requirement attached.

**What the evidence says.** Losnegard 2011
([PMID 20136751](https://pubmed.ncbi.nlm.nih.gov/20136751/)): 12 weeks of heavy
strength training in **elite** skiers gave **+19 %** seated pull-down, **+12 %**
half squat, **+7 %** VO2max in skate roller-skiing, and **greater improvement in
double-poling performance** than controls — but **no difference** in the
roller-ski time trial. Skattebo 2016
([PMID 26146761](https://pubmed.ncbi.nlm.nih.gov/26146761/)): in **junior
females**, ten weeks of upper-body heavy strength gave **+15 %** pull-down and
**trivial** performance effects. So the transfer is real, movement-specific, and
population-dependent.

**Anchors.** Skiing has three intensity channels and no single portable one:

| Channel                    | Portability                                | Note                                                                             |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| **% HRmax / % LTHR**       | Good — and the Norwegian standard          | `olt-hr-5` (`app/utils/zones/recipes.ts`) already exists                         |
| **Blood lactate (mmol/L)** | Best, and unrepresentable in this repo     | The tradition's actual anchor; see [workouts-running.md](workouts-running.md) §2 |
| **Speed / pace**           | **Useless** — varies with snow, wax, grade | Roller-ski pace on a fixed loop is the only comparable case                      |
| **Ski-ergometer watts**    | Good, for double poling only               | Whole-body power; not comparable to cycling watts                                |
| **Vertical metres**        | Good for uphill classic                    | No repo quantity                                                                 |

⚠️ **HR runs ~5–10 bpm lower in double poling than in running at the same oxygen
cost** (upper-body-dominant work has lower cardiac output per unit VO2); this is
well-established in the skiing literature and means a run-derived LTHR should
not be reused for double poling. Sub-technique-specific thresholds are the
honest answer.

**Example sessions.**

| Name                              | Structure                                     | Anchor                            | Note                                       |
| --------------------------------- | --------------------------------------------- | --------------------------------- | ------------------------------------------ |
| _Rolig langtur_ (classic)         | 2–4 h continuous, undulating                  | 60–72 % HRmax                     | The volume backbone                        |
| _Terskeldrag_ (skate, roller)     | 5 × 6 min, 1 min rest                         | 82–87 % HRmax / 2.5–3.5 mmol      | Norwegian sub-threshold family             |
| _Stakedrag_ (double poling)       | 8 × 3 min double-poling only, 2 min rest      | 85–90 % HRmax                     | Doubles as upper-body strength endurance   |
| _Stakemølle_ (ski-erg intervals)  | 6 × 4 min on the ski ergometer, 2 min rest    | % of a 6-min max-effort watt test | The one wattage-portable ski session       |
| _Bakkeintervall_ (uphill classic) | 5 × 5 min uphill, striding, jog-back recovery | 88–92 % HRmax                     | Vertical metres are the honest volume unit |
| _Fartslek på ski_                 | 90 min with 10 × 1 min surges                 | RPE 8 on the surges               | Snow-condition-proof                       |

### 13.2 Rowing — the 2 k split as a universal anchor

**This is the strongest anchor precedent in the whole document and it deserves
to be studied as a design pattern rather than as a rowing fact.**

The rowing world anchors essentially all training to **one number: the athlete's
2 000 m ergometer split** (time per 500 m). Everything else is expressed as an
offset from it. Why this works so well is worth spelling out, because it is a
recipe another discipline could copy:

1. **The reference is a maximal race effort over a fixed, standard distance** —
   not a submaximal test, not a model estimate. Every serious rower has one, it
   is refreshed often, and there is no protocol ambiguity.
2. **The measurement device is standardised**, so the number is comparable
   between athletes and between years without a calibration argument.
3. **Pace and power are related by a published deterministic formula**, so a
   split _is_ a power and vice versa: `P = 2.80 / pace³`, with pace in seconds
   per metre. (2:00 per 500 m → 0.24 s·m⁻¹ → **202.5 W**.) There is no FTP-vs-CP
   construct problem, because there is no construct — it is arithmetic.
4. **Zones are expressed as an offset in seconds per 500 m**, which is an
   _additive_ rather than multiplicative transform of an already-portable
   number, and turns out to be roughly correct across ability levels.

The conventional band system (UT2 / UT1 / AT / TR / AN, the international rowing
five-band scheme) with its usual offsets:

| Band    | Name                | Offset from 2 k split   | % HRmax | Stroke rate | Session shape          |
| ------- | ------------------- | ----------------------- | ------- | ----------- | ---------------------- |
| **UT2** | Utilisation 2       | **+18 to +24 s**        | 65–75 % | 18–20 spm   | 60–120 min steady      |
| **UT1** | Utilisation 1       | **+12 to +18 s**        | 75–82 % | 20–24 spm   | 3 × 20 min, 4 × 15 min |
| **AT**  | Anaerobic threshold | **+8 to +12 s**         | 82–88 % | 24–28 spm   | 4 × 10 min, 2 × 20 min |
| **TR**  | Oxygen transport    | **+2 to +6 s**          | 88–95 % | 28–32 spm   | 6 × 500 m, 4 × 1000 m  |
| **AN**  | Anaerobic           | **2 k split or faster** | max     | 32+ spm     | 8 × 250 m, 10 × 1 min  |

⚠️ **These offsets are coaching-practice convention, not a peer-reviewed
table.** A targeted search of the indexed literature for rowing zone tables
anchored to 2 000 m pace returned **none**; the published rowing
training-intensity work (Treff 2017, _Front Physiol_ 8:515; Treff 2021, _Sci
Rep_ 11) anchors to **lactate thresholds and HR**, not to 2 k offsets. The 2
k-offset system is real, universally used, and undocumented in the peer-reviewed
record — exactly the kind of thing this repo's honesty conventions require to be
labelled.

**Example sessions.**

| Name             | Structure                      | Anchor     | Note                          |
| ---------------- | ------------------------------ | ---------- | ----------------------------- |
| Steady state     | 70 min continuous @ r18        | 2 k + 20 s | The volume backbone           |
| 4 × 15 min       | 15 min work, 3 min rest, r20   | 2 k + 14 s | UT1                           |
| 4 × 10 min       | 10 min work, 3 min rest, r24   | 2 k + 10 s | The classic threshold session |
| 6 × 500 m        | 3.5 min rest, r30              | 2 k − 1 s  | Race-pace-plus                |
| 8 × 250 m        | 3 min rest, r34+               | Max        | Neuromuscular                 |
| 30 min free-rate | Continuous, self-selected rate | RPE 7      | The classic aerobic benchmark |

**The transferable lesson for trainm8.** The 2 k split works as an anchor
because it is _(a)_ a maximal effort at _(b)_ a fixed standard distance on _(c)_
a standardised device with _(d)_ a published pace↔power identity. The running
library's request for a `racePace` anchor
([workouts-running.md](workouts-running.md) §13.3) is asking for exactly
property (a) + (b) in a sport that lacks (c) and (d). **Rowing is the existence
proof that a race-result-derived anchor beats a model-derived threshold when
both are available** — which is a direct argument for that document's
recommendation.

### 13.3 Cross-training

| Modality                       | Load anchor that works                           | Anchor that does **not**                      | Evidence                                                                                          |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Aqua-jogging**               | **RPE**, and cadence (strides/min)               | **HR** — see below                            | Wilber 1996 ([PMID 8871917](https://pubmed.ncbi.nlm.nih.gov/8871917/)); Bushman 1997; Reilly 2003 |
| **Elliptical / cross-trainer** | RPE and HR                                       | Machine watts (uncalibrated between machines) | —                                                                                                 |
| **Hiking / ski touring**       | **Vertical metres** and vertical metres per hour | Pace, distance                                | Convention                                                                                        |
| **Ski-ergometer**              | Watts, from a device-specific max test           | Comparison to cycling watts                   | —                                                                                                 |

**Aqua-jogging is the best-evidenced injury substitute in endurance sport, and
the one whose anchors break hardest.**

- Wilber 1996 ([PMID 8871917](https://pubmed.ncbi.nlm.nih.gov/8871917/)): 16
  trained male runners, 6 weeks, water running vs land — **no significant intra-
  or inter-group differences** in VO2max, ventilatory threshold or running
  economy.
- Bushman 1997 ([PMID 9140909](https://pubmed.ncbi.nlm.nih.gov/9140909/)): 11
  competitive runners, **4 weeks of deep-water running exclusively** — no
  significant change in **5-km time**, running economy, lactate threshold or
  VO2max.
- Reilly 2003 ([PMID 14748454](https://pubmed.ncbi.nlm.nih.gov/14748454/)):
  aerobic fitness maintained for **6 weeks** in trained athletes.

**So the honest claim is maintenance for 4–6 weeks, not improvement, and not
indefinitely.** That is precisely the claim an injured athlete needs.

⚠️ **HR is systematically lower in deep water at the same relative effort** —
hydrostatic pressure increases central blood volume and stroke volume, so heart
rate falls for the same oxygen cost (the classic figure quoted in the literature
is roughly 8–11 bpm at HRmax, though it varies with immersion depth and
temperature). Reilly further notes that **blood lactate at a given effort is
_elevated_ relative to treadmill running**. **Consequence: any HR-derived load
formula applied to an aqua-jogging session under-prices it, and a land-derived
LTHR is invalid in water.** This is a stronger version of the same problem ADR
0015 identified for `'other'` imports.

**Example sessions.**

| Modality     | Name                 | Structure                                       | Anchor               |
| ------------ | -------------------- | ----------------------------------------------- | -------------------- |
| Aqua-jogging | Aerobic maintenance  | 45–60 min continuous, cadence 70–80 strides/min | RPE 4–5              |
| Aqua-jogging | Threshold substitute | 5 × 5 min hard, 1 min easy, cadence 85–90       | RPE 7–8              |
| Aqua-jogging | VO2max substitute    | 10 × 1 min max, 1 min easy, cadence 95+         | RPE 9                |
| Elliptical   | Long aerobic         | 90 min, cadence 80–90 rpm                       | 65–75 % HRmax        |
| Ski touring  | Vertical endurance   | 1 200 vertical metres continuous ascent         | 600–900 vm/h · RPE 5 |
| Hiking       | Loaded vertical      | 800 vm with a 10 kg pack                        | RPE 6                |

**Vertical metres per hour is the portable anchor for anything uphill**, exactly
as [workouts-running.md](workouts-running.md) §11 found for trail running. It is
the same missing quantity, requested by a second document.

---

## 14. Implications for trainm8

### 14.1 The Step union is right. The mismatch is one level down.

The brief anticipated that strength would not fit ADR 0007's `WorkoutStep`
discriminated union, because "sets/reps/load/exercise is a different shape from
duration/target". **It fits.** ADR 0007 already solved this: a `strength` step
carries an `Exercise` FK, forbids step-level intensity, and delegates the
quantified detail to a 1:N `ExerciseSet` child. That is the correct
decomposition and nothing in this research disturbs it.

The actual mismatch is that **`ExerciseSet` never got the treatment
`WorkoutStep` got.** Compare the two:

| Concern             | Cardio step                                                           | `ExerciseSet` today                         |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| Intensity, authored | `intensity: IntensityTarget` — a **7-member union**                   | `weightKg XOR pct1RM` — two nullable floats |
| Intensity, resolved | `intensityHrMin/Max`, `intensityPowerMin/Max`, `intensityPaceMin/Max` | **nothing**                                 |
| Quantity            | `durationSec` / `distanceM`                                           | `reps` / `durationSec`                      |
| Termination rule    | implicit (the quantity)                                               | `kind: reps \| timed \| amrap`              |

ADR 0007's own rejected option — _"Free-text intensity ('zone 2', 'RPE 7'):
Rejected — AI generation, Recording comparison, and load math all need
structured numbers"_ — was applied to the cardio channel and **not** to the
strength channel, which received two scalars instead of a union. This document's
library is the evidence of the cost: of 25 sessions, **the majority carry at
least one marker**, and the single best-evidenced protocol in the whole
literature (S8, Rønnestad's `10RM → 4RM`) is unauthorable.

**The recommendation is therefore not a new Step kind. It is to give
`ExerciseSet` the union it should have had.**

### 14.2 Three orthogonal axes, currently collapsed into two columns

The clean way to see the gap is that a prescribed set specifies **three
independent things**, and the current model has slots for one and a half:

| Axis            | Question it answers    | Examples from this library                                        | Today                                   |
| --------------- | ---------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| **Load**        | What is on the bar?    | `85 % 1RM`, `8RM`, `bodyweight + 10 kg`, `50 % BW`, `0.5–0.6 m/s` | `weightKg XOR pct1RM` (2 of 5)          |
| **Effort cap**  | How close to failure?  | `RIR 2`, `RPE 8`                                                  | **absent**                              |
| **Termination** | When does the set end? | `4 reps`, `AMRAP`, `45 s`, `at −10 % velocity`, `at RIR 1`        | `kind: reps \| timed \| amrap` (3 of 5) |

Load and effort cap are **not the same axis and routinely co-occur**: "4 reps at
85 % 1RM, stopping if RIR falls below 2" is one prescription with values on
both. Collapsing them into a single union would force S6 to choose between
naming its load and naming its ceiling.

**Proposed shape** — three JSON/enum slots on `ExerciseSet`, plus one scalar:

```ts
// authored load — the strength analogue of IntensityTarget (ADR 0007)
export const LoadTargetSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('absolute'), kg: z.number().positive() }),
	z.object({
		kind: z.literal('pct1RM'),
		minPct: z.number(),
		maxPct: z.number().optional(),
	}),
	z.object({ kind: z.literal('repMax'), reps: z.number().int().positive() }), // "@ 8RM"
	z.object({ kind: z.literal('bodyweight'), addedKg: z.number().optional() }),
	z.object({ kind: z.literal('pctBodyweight'), pct: z.number().positive() }),
	z.object({
		kind: z.literal('velocity'),
		minMs: z.number(),
		maxMs: z.number().optional(),
	}),
])

// authored effort ceiling — optional, orthogonal to load
export const EffortCapSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('rir'),
		min: z.number().min(0).max(10),
		max: z.number().optional(),
	}),
	z.object({
		kind: z.literal('rpe'),
		min: z.number().min(1).max(10),
		max: z.number().optional(),
	}), // Zourdos
])

// how the set ends — replaces `kind`
export const TerminationSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('reps'), reps: z.number().int().positive() }),
	z.object({
		kind: z.literal('timed'),
		durationSec: z.number().int().positive(),
	}),
	z.object({ kind: z.literal('amrap') }),
	z.object({ kind: z.literal('toRir'), rir: z.number().min(0).max(10) }),
	z.object({ kind: z.literal('velocityLoss'), pct: z.number().positive() }), // "stop at −10 %"
])
```

plus `tempo: string?` on the set (`"3-0-3"`, eccentric-pause-concentric; `X` for
maximal intent), which is load-bearing for exactly one family (S4, S12) and
inert elsewhere.

Four properties make this the right shape rather than merely a bigger one:

1. **It is the pattern the repo already uses**, one level down. `ExerciseSet` is
   to a strength step what a cardio step is to a cardio workout: the quantified
   unit. The union belongs on the quantified unit.
2. **It preserves ADR 0027's render-never-parse invariant exactly.** Each new
   member is one new `@ …` token text in `formatSetsSummary`; no grammar, no
   parser, no new editor concept beyond a picker with more tabs. The existing
   uniform-set collapse (`4 × 4 @ 85% 1RM`) generalises unchanged.
3. **It is migration-cheap.** `weightKg` → `{kind:'absolute'}`, `pct1RM` →
   `{kind:'pct1RM'}`, `kind` → the termination union. Every existing row maps
   losslessly; the pair of columns can stay for one release the way ADR 0047's
   retired columns do.
4. **It makes the honest-degradation behaviour free.** `@ 85% 1RM` with no
   stored 1RM renders as the bare authored form with no kg facet — exactly what
   `powerPct` already does without an FTP
   (`app/utils/workout-notation.test.ts`). The Unavailable Metric principle is
   satisfied by the existing mechanism.

### 14.3 `pct1RM` is shipped and resolves to nothing

This is a live defect, not a design gap. `ExerciseSet.pct1RM` exists, is
authorable, renders as `@ 85% 1RM`, and **has no referent anywhere in the
schema**:

- `DisciplineProfile` holds `maxHr`, `lthr`, `ftp`, `runPowerThresholdW`,
  `thresholdPaceSecPerKm`, `cssSecPer100m`, and no 1RM.
- `ThresholdEvent.kind` enumerates
  `maxHr | lthr | ftp | runPower | thresholdPace | css | weight` — `weight` is
  bodyweight, not a lift.
- `WorkoutStep`'s resolved-range columns are HR, power and pace only. There is
  no `resolvedLoadKgMin/Max`.

So `@ 85% 1RM` can never render a kg facet, can never be compared to anything
recorded, and can never be recomputed when the athlete gets stronger. ADR 0047
§3 leans on this field — _"`ExerciseSet.pct1RM` already exists as a first-class
authored quantity … so a session at 60 % inside a `maximal-strength` segment
raises ADR 0042 §9's soft warning with no schema change"_ — and that warning
does work, because it only compares two authored numbers. But the field is
otherwise inert.

**And 1RM does not fit `DisciplineProfile`.** FTP is one number for the bike;
1RM is one number **per exercise**, and an athlete has as many as they have
tested lifts. The unique constraint is `[athleteProfileId, discipline]`, so
there is nowhere to put a squat 1RM that is not also the deadlift 1RM.

**Recommended entity**, shaped like ADR 0005's thresholds rather than invented:

```prisma
model ExerciseThreshold {
  id          String   @id @default(cuid())
  kind        String   // "oneRm" | "estimatedOneRm" | "repMax"
  valueKg     Float
  reps        Int?     // for repMax / estimatedOneRm: the reps the value was measured at
  protocol    String?  // "tested-1rm" | "epley-from-set" | "velocity-profile" | "athlete-estimate"
  effectiveAt DateTime
  exercise    Exercise @relation(...)
  athleteProfileId String
  @@unique([athleteProfileId, exerciseId, effectiveAt])
}
```

Two design notes drawn from the research rather than from convenience. **Record
the protocol, not a `manual | inferred | auto` flag** — the same correction
[README.md](README.md) already records against ADR 0005, and it matters more
here: a tested 1RM, an Epley estimate from a 5-rep set, and a
load–velocity-profile extrapolation are three different constructs with
different error, exactly as CP ≠ FTP. And **`repMax` must be storable
directly**, because S8's `10RM → 4RM` prescription is _defined_ in rep-maxes and
converting it to a 1RM to convert it back is a fabrication round-trip (§4.2 is
the reason: the `%1RM ↔ reps` conversion has an enormous SD in this population).

### 14.4 The Strength Goal enum cannot label 10 of these 25 sessions

ADR 0047 §3 has a strength segment author a **Strength Goal** —
`hypertrophy | maximal-strength | power` — from which the `%1RM` band and rep
range derive. Against this library:

| Library phase             | Sessions | Nearest ADR 0047 goal | Fits?                                                                                                                                                                                                                     |
| ------------------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maximal strength          | S6–S13   | `maximal-strength`    | **Yes** — ≥85 % 1RM, 3–6 reps, exactly ACSM's band                                                                                                                                                                        |
| Power / explosive         | S14–S19  | `power`               | **Yes** — 30–70 % 1RM, ≤24 repetitions·sets                                                                                                                                                                               |
| **Anatomical adaptation** | S1–S5    | `hypertrophy`?        | **No.** 60–75 % 1RM at RIR 4–5 is deliberately sub-hypertrophic; the target tissue is tendon, and ACSM's hypertrophy prescription is a _volume_ number this phase does not hit                                            |
| **In-season maintenance** | S20–S25  | `maximal-strength`?   | **No.** Same band, **one third the frequency and volume**, and the explicit intent is to _not_ progress. Deriving a band from the goal is right; deriving it and then silently reusing the build-phase frequency is wrong |

The evidence for the two missing values is stronger than for the ones present:
maintenance has a **directly citable dose** (1×/wk maintains, 1×/fortnight loses
— Rønnestad 2010, 2011) where `hypertrophy` has only "≥10 sets/wk".

**Recommendation: amend the Strength Goal enum to five values** —
`anatomical-adaptation | hypertrophy | maximal-strength | power | maintenance`.
This costs nothing structurally (§3 of ADR 0047 derives band and rep range from
the goal; two more rows in that derivation table) and it lets a season express
the shape every source in §11 actually describes.

**Related: there are two vocabularies for this axis at two layers, and they
disagree.** `WORKOUT_INTENTS` (`app/utils/workout-schema.ts`) already carries
`strength-max | strength-hypertrophy | strength-power | strength-endurance` at
the _session_ layer, while ADR 0047's Strength Goal carries three different
tokens at the _segment_ layer — and `strength-endurance` is a fourth concept
that ACSM 2026 does not have and that ADR 0047 implicitly dropped. One of these
should derive from or map onto the other; today neither is stated in terms of
the other.

### 14.5 What the notation gains, concretely

With §14.2's slots, the library's marked rows become authorable with no change
to the rendering architecture:

| Library row          | Today                           | With the load union                       |
| -------------------- | ------------------------------- | ----------------------------------------- |
| S1 goblet squat      | `3 × 12` (load silently absent) | `3 × 12 @ RIR 4`                          |
| S3 hip thrust        | `3 × 12`                        | `3 × 12 @ 50% BW`                         |
| S4 heel raise        | `3 × 15`                        | `3 × 15 @ RIR 4 · 3-0-3`                  |
| S8 half squat        | **unauthorable**                | `3 × 8 @ 8RM`                             |
| S10 cluster          | `3 × 1 @ 90% 1RM`               | `3 × 1 @ 90% 1RM · stop at −10% velocity` |
| S17 hang clean       | `5 × 3 @ 75% 1RM`               | `5 × 3 @ 0.9–1.1 m/s`                     |
| S23 single-leg squat | `3 × 8`                         | `3 × 8 @ bodyweight · RIR 2`              |

**And supersets, circuits, complexes and contrast pairs already work.**
`WorkoutBlock.repeatCount` renders as `3 × ( … )`, so S14's contrast pair is
`4 × ( Back squat → 3 × 1 @ 85% 1RM · 90 s rest → Countermovement jump → 1 × 5 )`
with no new concept at all. This is a genuine, unheralded strength of the
existing model and it should be recorded as a **Confirm**, not quietly relied
on.

### 14.6 Three quantities this library needs and cannot express

- **Ground contacts** (S15, S16, S22). The plyometric dose unit. Not reps of a
  named exercise, not seconds. Either a fourth termination kind
  (`{kind:'contacts', n}`) or an accepted approximation as `reps` with the
  session's cap in `notes`.
- **Vertical metres** (§13.3 ski touring and hiking). This is the **second**
  research document to request it — [workouts-running.md](workouts-running.md)
  §11 and §13.2 ask for the identical quantity for trail and hills. Two
  independent requests for the same missing `WorkoutStep` quantity is a stronger
  signal than either alone.
- **An actual-side set record.** A completed strength session records nothing
  about what was lifted. There is no `ExerciseSetLog`, so ADR 0046 §4's strength
  **Summary Count** can only count _sessions_, never whether the prescription
  was met. The natural field is the one thing an athlete can report accurately
  without equipment — **the RIR they actually hit** — which is the _same
  vocabulary as the planned side_. That symmetry is unusual and worth
  exploiting: planned RIR 2 vs reported RIR 4 is a meaningful, cheap, honest
  adherence signal that needs no telemetry and no conversion.

Also worth naming: **S19 (maximal hill sprints) is a strength session modelled
as cardio**, and correctly so — it carries a `run` discipline, produces rTSS,
and counts toward endurance adherence. The library contains at least three such
crossovers (S19, the ski-erg sessions in §13.1, and arguably S16's bounding).
Any archetype taxonomy that keys off `Step.kind` or `discipline` will
misclassify them; the classification belongs to `WorkoutIntent`
(`neuromuscular`), which already exists.

### 14.7 Seed the library as templates, not sessions

Identical to [workouts-running.md](workouts-running.md) §13.1 and not repeated:
these 25 rows should ship as a **`WorkoutTemplate` catalogue** with
`archetype × phase × level × citation × progressesTo/regressesTo`, seeded in a
migration the way ADR 0007 already seeds `Exercise`. Two strength-specific
additions to that shape:

- **`equipment` requirements** at the template level, so S23's travel variant is
  reachable by filter rather than by reading prose. `Exercise.equipment` exists;
  a template-level roll-up does not.
- **A citation field that can say "convention"**, because a large fraction of
  this library — every tempo, every rest interval, every ground-contact cap, and
  the whole of §13.2's rowing table — is coaching practice with no peer-reviewed
  anchor. A citation field that can only hold DOIs will be filled with
  approximations.

### 14.8 Other-discipline implications

ADR 0015 makes `'other'` import-only and declines to add `hike`, `nordicSki` or
`row` as first-class disciplines "until a concrete athlete-profile demand
exists". This document is a partial such demand and a partial argument _against_
one:

- **For:** XC skiing in a Norwegian-context app is not an exotic activity, it
  has a real threshold (`% HRmax`, sub-technique-specific), it has an existing
  zone recipe family (`olt-hr-5`), and its sessions are plannable in a way a
  Hike is not. Rowing is the strongest case of all, because it arrives with a
  ready-made, deterministic, portable anchor (§13.2).
- **Against:** aqua-jogging is the clearest case where a first-class discipline
  would be **actively harmful**, because HR-derived load systematically
  under-prices it (§13.3) — a new discipline would force a Load Formula decision
  that the evidence says should be "none". ADR 0015's reasoning is exactly right
  for this case.

**Recommendation: split the question.** ADR 0015 treats "may I plan it?" and
"may it contribute load?" as one decision. They are two. A discipline that is
**plannable but load-silent** — authorable steps, no TSS contribution — is
precisely what aqua-jogging, ski touring and hiking need, and it is the same
shape ADR 0046 §2 just gave strength. The mechanism already exists; only the
permission does not.

### 14.9 Confirmed without qualification

- **ADR 0046** — no load number spans incommensurable tracks; strength carries
  no TSS. Confirmed from an independent literature set (§12), with the
  structural reason spelled out in §12.1.
- **ADR 0047 §2** — `sets` as the strength Volume Currency. Confirmed as the
  least-bad of three, with the hard-set qualifier noted in §12.3.
- **ADR 0047 §4** — a strength segment authors sessions/week. **Strongly**
  confirmed: 2×/wk builds, 1×/wk maintains, 1×/fortnight loses is the most
  directly actionable number in this document.
- **ADR 0047 §6** — strength segments float free of the endurance phases.
  Confirmed on Issurin's decoupling argument, which §11.2 shows survives the
  retirement of the Volume Landmarks that ADR 0047's other grounds rested on.
- **ADR 0047 §7** — no upward volume ratchet. Confirmed; §11.3.
- **ADR 0003 / 0007's block structure** — `WorkoutBlock.repeatCount` expresses
  supersets, circuits, complexes and contrast pairs with no new concept (§14.5).

### ADRs this research challenges

| ADR                                       | Verdict                  | Why                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0007** Step as discriminated union      | **Amend**                | The step-level union is right and confirmed. `ExerciseSet` is the half that never got the treatment: `weightKg XOR pct1RM` cannot express RIR, RPE, rep-max, bodyweight, %BW or velocity, and `reps\|timed\|amrap` cannot express a velocity-loss or to-RIR stop. Give the set a `LoadTarget` union, an orthogonal effort cap, and a termination union.                   |
| **0005** Athlete Profile & thresholds     | **Amend**                | No 1RM exists anywhere, so the one strength anchor the repo ships (`pct1RM`) resolves to nothing. 1RM is **per exercise**, which `DisciplineProfile`'s `[athleteProfileId, discipline]` unique constraint cannot hold. Needs an `ExerciseThreshold` entity recording the **protocol** (tested / Epley / velocity-profile), not a `manual\|inferred\|auto` flag.           |
| **0047** §3 Strength Goal                 | **Amend**                | Three values cannot label 10 of these 25 sessions. Anatomical adaptation (tendon, sub-hypertrophic, RIR 4–5) and maintenance (same band, one third the dose, explicitly non-progressing, and the best-cited dose in the document) are distinct authored goals with distinct derived consequences. Extend to five.                                                         |
| **0002** Step quantification              | **Amend**                | No `verticalM` quantity — requested independently by this document (§13.3) and by [workouts-running.md](workouts-running.md) §11. No ground-contact quantity for plyometrics. No `tempo` on a set.                                                                                                                                                                        |
| **0015** `'other'` is import-only         | **Amend**                | Conflates "may I plan it?" with "may it contribute load?" A **plannable but load-silent** discipline is what XC skiing, rowing, ski touring and aqua-jogging need — the same shape ADR 0046 §2 gave strength. Rowing additionally arrives with a better anchor than several first-class disciplines have.                                                                 |
| **0027** A2 reserved `equivalent` facet   | **Amend**                | Argued from running; §13.2 supplies the design precedent. Rowing shows a **race-result-derived anchor** (maximal effort, fixed distance, standard device, published pace↔power identity) outperforms a model-derived threshold. The strength analogue is `repMax`, which is the same trick: anchor to a measured maximal performance rather than to an estimated ceiling. |
| **0008** TSS triad                        | **Amend**                | Aqua-jogging, ski touring and any upper-body-dominant discipline break the HR rung: HR is systematically depressed in water at the same oxygen cost, and ~5–10 bpm lower in double poling than running. A land-derived LTHR is invalid in both. Either an Unavailable Metric or a per-modality threshold.                                                                 |
| **0016** AI plan generation               | **Amend**                | Same argument as the running library: retrieve from a cited template catalogue and substitute anchors. Sharper here, because free-form strength synthesis has no guard rails at all — the model can invent an exercise, a set count and a percentage with nothing to check them against.                                                                                  |
| **0019/0046 §4** Strength adherence       | **Amend**                | The **Summary Count** counts sessions because nothing records what was lifted. A reported **RIR** per set is an accurate, equipment-free, conversion-free actual-side signal in the **same vocabulary as the prescription**. Needs an `ExerciseSetLog`.                                                                                                                   |
| **0046** No cross-track load number       | **Confirm**              | Independently confirmed. §12.1 gives the structural reason: every term in a TSS-family formula breaks for lifting. Tonnage fails portability by construction; sRPE is the `hours × assumed intensity` conversion §2 removed.                                                                                                                                              |
| **0047** §2 `sets` currency               | **Confirm**              | The dose-response literature's own unit. Note only that its unit is the **hard set**, and this library prescribes RIR 2–3 rather than failure.                                                                                                                                                                                                                            |
| **0047** §4 sessions/week                 | **Confirm** (strongly)   | 2/1/0.5 per week — build / maintain / lose — is directly cited (Rønnestad 2010, 2011) and is the most actionable number here.                                                                                                                                                                                                                                             |
| **0047** §6 floating strength segments    | **Confirm**              | Issurin's decoupling argument stands on its own and does not depend on the retired Volume Landmarks.                                                                                                                                                                                                                                                                      |
| **0047** §7 no upward ratchet             | **Confirm**              | Barsuhn 2025 and Enes 2024; and the case is weaker still for an athlete whose primary sport is endurance.                                                                                                                                                                                                                                                                 |
| **0027** render-never-parse               | **Confirm**              | Every new anchor is one new `@ …` token text in `formatSetsSummary`. No grammar, no parser, no invalid intermediate states.                                                                                                                                                                                                                                               |
| **0003 / 0007** Block structure           | **Confirm**              | `WorkoutBlock.repeatCount` already expresses supersets, circuits, complexes and contrast pairs.                                                                                                                                                                                                                                                                           |
| **0033** Detection-confidence honesty bar | **Confirm** (and extend) | This library needs the same vocabulary for its own provenance: §13.2's rowing offsets, every tempo and rest interval, and S25's rationale are **convention**, not evidence, and must be labelled.                                                                                                                                                                         |

---

## 15. Uncertainty and limitations

- **The rowing zone table (§13.2) has no peer-reviewed source.** A targeted
  search of the indexed literature for rowing zones anchored to 2 000 m pace
  returned none; published rowing work anchors to lactate and HR. The offsets
  are real, near-universal coaching practice and are labelled as convention.
  Treat individual band edges (+12 vs +14 s) as approximate.
- **Velocity-based training band edges (§4.5) are convention**,
  exercise-specific (squat only, as given), and vary between published
  renderings. The velocity-**loss** finding they sit beside is a genuine
  peer-reviewed result and is much firmer.
- **Richens & Cleather 2014 is one study.** Its effect (>2× the reps at 70 %
  1RM) is large and directionally corroborated by Qin 2025, but the specific
  numbers should not be surfaced as a lookup.
- **The tempo prescriptions, rest intervals and ground-contact caps throughout
  the library are coaching convention.** Only S4/S12's 3-0-3 has a protocol
  behind it, and that protocol comes from tendinopathy _rehabilitation_, not
  from prophylaxis in healthy athletes.
- **The Wilson 2012 / Schumann 2022 disagreement on running-vs-cycling
  interference is unresolved** and is flagged in §3.2 rather than adjudicated.
- **Barsuhn 2025 and Enes 2024 were read from abstract only** (per ADR 0047's
  own note); they corroborate §11.3 rather than carrying it.
- **The 8–11 bpm HR depression in deep water and the 5–10 bpm depression in
  double poling are recalled field figures**, well-established in their
  respective literatures but not verified against a primary source in this pass.
  The _direction_ is not in doubt; the magnitudes should be re-checked before
  being surfaced in-product.
- **No effect size is available for anatomical adaptation as a phase.** Its
  inclusion rests on tissue-adaptation reasoning and universal coaching
  practice, not on a trial comparing programmes with and without it.
- **Nothing here addresses female-specific or masters-specific programming**,
  beyond noting that Skattebo 2016 (junior females) and Vikmoen 2016 (female
  cyclists) reached opposite conclusions in different sports and populations.
- **No competitor training product is named anywhere in this document**, per the
  research brief and the convention in [README.md](README.md).

---

## References

**Strength for endurance performance**

- Rønnestad BR, Mujika I. Optimizing strength training for running and cycling
  endurance performance: a review. _Scand J Med Sci Sports._ 2014;24(4):603–612.
  doi:[10.1111/sms.12104](https://doi.org/10.1111/sms.12104) ·
  [PMID 23914932](https://pubmed.ncbi.nlm.nih.gov/23914932/)
- Beattie K, Kenny IC, Lyons M, Carson BP. The effect of strength training on
  performance in endurance athletes. _Sports Med._ 2014;44(6):845–865.
  doi:[10.1007/s40279-014-0157-y](https://doi.org/10.1007/s40279-014-0157-y) ·
  [PMID 24532151](https://pubmed.ncbi.nlm.nih.gov/24532151/)
- Blagrove RC, Howatson G, Hayes PR. Effects of strength training on the
  physiological determinants of middle- and long-distance running performance: a
  systematic review. _Sports Med._ 2018;48(5):1117–1149.
  doi:[10.1007/s40279-017-0835-7](https://doi.org/10.1007/s40279-017-0835-7) ·
  [PMID 29249083](https://pubmed.ncbi.nlm.nih.gov/29249083/)
- Berryman N, Mujika I, Arvisais D, Roubeix M, Binet C, Bosquet L. Strength
  training for middle- and long-distance performance: a meta-analysis. _Int J
  Sports Physiol Perform._ 2018;13(1):57–63.
  doi:[10.1123/ijspp.2017-0032](https://doi.org/10.1123/ijspp.2017-0032) ·
  [PMID 28459360](https://pubmed.ncbi.nlm.nih.gov/28459360/)
- Denadai BS, de Aguiar RA, de Lima LC, Greco CC, Caputo F. Explosive training
  and heavy weight training are effective for improving running economy in
  endurance athletes: a systematic review and meta-analysis. _Sports Med._
  2017;47(3):545–554.
  doi:[10.1007/s40279-016-0604-z](https://doi.org/10.1007/s40279-016-0604-z) ·
  [PMID 27497600](https://pubmed.ncbi.nlm.nih.gov/27497600/)
- Paavolainen L, Häkkinen K, Hämäläinen I, Nummela A, Rusko H.
  Explosive-strength training improves 5-km running time by improving running
  economy and muscle power. _J Appl Physiol._ 1999;86(5):1527–1533.
  doi:[10.1152/jappl.1999.86.5.1527](https://doi.org/10.1152/jappl.1999.86.5.1527)
  · [PMID 10233114](https://pubmed.ncbi.nlm.nih.gov/10233114/)
- Rønnestad BR, Hansen EA, Raastad T. Effect of heavy strength training on thigh
  muscle cross-sectional area, performance determinants, and performance in
  well-trained cyclists. _Eur J Appl Physiol._ 2010;108(5):965–975.
  doi:[10.1007/s00421-009-1307-z](https://doi.org/10.1007/s00421-009-1307-z) ·
  [PMID 19960350](https://pubmed.ncbi.nlm.nih.gov/19960350/)
- Rønnestad BR, Hansen EA, Raastad T. In-season strength maintenance training
  increases well-trained cyclists' performance. _Eur J Appl Physiol._
  2010;110(6):1269–1282.
  doi:[10.1007/s00421-010-1622-4](https://doi.org/10.1007/s00421-010-1622-4) ·
  [PMID 20799042](https://pubmed.ncbi.nlm.nih.gov/20799042/)
- Rønnestad BR, Nymark BS, Raastad T. Effects of in-season strength maintenance
  training frequency in professional soccer players. _J Strength Cond Res._
  2011;25(10):2653–2660.
  doi:[10.1519/JSC.0b013e31822dcd96](https://doi.org/10.1519/JSC.0b013e31822dcd96)
  · [PMID 21873897](https://pubmed.ncbi.nlm.nih.gov/21873897/)
- Vikmoen O, Ellefsen S, Trøen Ø, Hollan I, Hanestadhaugen M, Raastad T,
  Rønnestad BR. Strength training improves cycling performance, fractional
  utilization of VO2max and cycling economy in female cyclists. _Scand J Med Sci
  Sports._ 2016;26(4):384–396.
  doi:[10.1111/sms.12468](https://doi.org/10.1111/sms.12468) ·
  [PMID 25892654](https://pubmed.ncbi.nlm.nih.gov/25892654/)
- Hansen EA, Rønnestad BR, Vegge G, Raastad T. Cyclists' improvement of pedaling
  efficacy and performance after heavy strength training. _Int J Sports Physiol
  Perform._ 2012;7(4):313–321.
  doi:[10.1123/ijspp.7.4.313](https://doi.org/10.1123/ijspp.7.4.313) ·
  [PMID 23197584](https://pubmed.ncbi.nlm.nih.gov/23197584/)

**Concurrent training and interference**

- Hickson RC. Interference of strength development by simultaneously training
  for strength and endurance. _Eur J Appl Physiol Occup Physiol._
  1980;45(2–3):255–263.
  doi:[10.1007/BF00421333](https://doi.org/10.1007/BF00421333) ·
  [PMID 7193134](https://pubmed.ncbi.nlm.nih.gov/7193134/)
- Wilson JM, Marin PJ, Rhea MR, Wilson SM, Loenneke JP, Anderson JC. Concurrent
  training: a meta-analysis examining interference of aerobic and resistance
  exercises. _J Strength Cond Res._ 2012;26(8):2293–2307.
  doi:[10.1519/JSC.0b013e31823a3e2d](https://doi.org/10.1519/JSC.0b013e31823a3e2d)
  · [PMID 22002517](https://pubmed.ncbi.nlm.nih.gov/22002517/)
- Schumann M, Feuerbacher JF, Sünkeler M, Freitag N, Rønnestad BR, Doma K,
  Lundberg TR. Compatibility of concurrent aerobic and strength training for
  skeletal muscle size and function: an updated systematic review and
  meta-analysis. _Sports Med._ 2022;52(3):601–612.
  doi:[10.1007/s40279-021-01587-7](https://doi.org/10.1007/s40279-021-01587-7) ·
  [PMID 34757594](https://pubmed.ncbi.nlm.nih.gov/34757594/)
- Eddens L, van Someren K, Howatson G. The role of intra-session exercise
  sequence in the interference effect: a systematic review with meta-analysis.
  _Sports Med._ 2018;48(1):177–188.
  doi:[10.1007/s40279-017-0784-1](https://doi.org/10.1007/s40279-017-0784-1) ·
  [PMID 28917030](https://pubmed.ncbi.nlm.nih.gov/28917030/)
- Doma K, Deakin GB, Bentley DJ. Implications of impaired endurance performance
  following single bouts of resistance training: an alternate concurrent
  training perspective. _Sports Med._ 2017;47(11):2187–2200.
  doi:[10.1007/s40279-017-0758-3](https://doi.org/10.1007/s40279-017-0758-3) ·
  [PMID 28702901](https://pubmed.ncbi.nlm.nih.gov/28702901/)
- Doma K, Deakin GB, Schumann M, Bentley DJ. Training considerations for
  optimising endurance development: an alternate concurrent training
  perspective. _Sports Med._ 2019;49(5):669–682.
  doi:[10.1007/s40279-019-01072-2](https://doi.org/10.1007/s40279-019-01072-2) ·
  [PMID 30847824](https://pubmed.ncbi.nlm.nih.gov/30847824/)

**Load anchors, autoregulation and quantification**

- Zourdos MC, Klemp A, Dolan C, et al. Novel resistance training-specific rating
  of perceived exertion scale measuring repetitions in reserve. _J Strength Cond
  Res._ 2016;30(1):267–275.
  doi:[10.1519/JSC.0000000000001049](https://doi.org/10.1519/JSC.0000000000001049)
  · [PMID 26049792](https://pubmed.ncbi.nlm.nih.gov/26049792/)
- Richens B, Cleather DJ. The relationship between the number of repetitions
  performed at given intensities is different in endurance and strength trained
  athletes. _Biol Sport._ 2014;31(2):157–161.
  doi:[10.5604/20831862.1099047](https://doi.org/10.5604/20831862.1099047) ·
  [PMID 24899782](https://pubmed.ncbi.nlm.nih.gov/24899782/)
- Sánchez-Medina L, González-Badillo JJ. Velocity loss as an indicator of
  neuromuscular fatigue during resistance training. _Med Sci Sports Exerc._
  2011;43(9):1725–1734.
  doi:[10.1249/MSS.0b013e318213f880](https://doi.org/10.1249/MSS.0b013e318213f880)
  · [PMID 21311352](https://pubmed.ncbi.nlm.nih.gov/21311352/)
- Qin X, Liu B, García-Ramos A. Gauging proximity to failure in the bench press:
  generalized velocity-based vs. %1RM-repetitions-to-failure approaches. _BMC
  Sports Sci Med Rehabil._ 2025;17:60.
  doi:[10.1186/s13102-025-01098-2](https://doi.org/10.1186/s13102-025-01098-2) ·
  [PMID 40133968](https://pubmed.ncbi.nlm.nih.gov/40133968/)
- McBride JM, McCaulley GO, Cormie P, Nuzzo JL, Cavill MJ, Triplett NT.
  Comparison of methods to quantify volume during resistance exercise. _J
  Strength Cond Res._ 2009;23(1):106–110.
  doi:[10.1519/JSC.0b013e31818efdfe](https://doi.org/10.1519/JSC.0b013e31818efdfe)
  · [PMID 19130641](https://pubmed.ncbi.nlm.nih.gov/19130641/)
- Day ML, McGuigan MR, Brice G, Foster C. Monitoring exercise intensity during
  resistance training using the session RPE scale. _J Strength Cond Res._
  2004;18(2):353–358. doi:[10.1519/R-13113.1](https://doi.org/10.1519/R-13113.1)
  · [PMID 15142026](https://pubmed.ncbi.nlm.nih.gov/15142026/)
- Baz-Valle E, Balsalobre-Fernández C, Alix-Fages C, Santos-Concejero J. A
  systematic review of the effects of different resistance training volumes on
  muscle hypertrophy. _J Strength Cond Res._ 2022;36(1):e1–e10.
  [PMID 35291645](https://pubmed.ncbi.nlm.nih.gov/35291645/)
- Currier BS, et al. (ACSM Position Stand 2026). _Med Sci Sports Exerc._
  2026;58(4):851–872.
  doi:[10.1249/MSS.0000000000003897](https://doi.org/10.1249/MSS.0000000000003897)
  · [PMID 41843416](https://pubmed.ncbi.nlm.nih.gov/41843416/)

**Periodization**

- Issurin VB. New horizons for the methodology and physiology of training
  periodization. _Sports Med._ 2010;40(3):189–206.
  doi:[10.2165/11319770-000000000-00000](https://doi.org/10.2165/11319770-000000000-00000)
  · [PMID 20199119](https://pubmed.ncbi.nlm.nih.gov/20199119/)
- Issurin V. Block periodization versus traditional training theory: a review.
  _J Sports Med Phys Fitness._ 2008;48(1):65–75.
  [PMID 18212712](https://pubmed.ncbi.nlm.nih.gov/18212712/)
- Kiely J. Block periodization: new horizon or a false dawn? _Sports Med._
  2010;40(9):803–805.
  doi:[10.2165/11535130-000000000-00000](https://doi.org/10.2165/11535130-000000000-00000)
  · [PMID 20806489](https://pubmed.ncbi.nlm.nih.gov/20806489/)

**Core and stability**

- Reed CA, Ford KR, Myer GD, Hewett TE. The effects of isolated and integrated
  "core stability" training on athletic performance measures: a systematic
  review. _Sports Med._ 2012;42(8):697–706.
  doi:[10.2165/11633450-000000000-00000](https://doi.org/10.2165/11633450-000000000-00000)
  · [PMID 22784233](https://pubmed.ncbi.nlm.nih.gov/22784233/)

**Cross-country skiing**

- Losnegard T, Mikkelsen K, Rønnestad BR, Hallén J, Rud B, Raastad T. The effect
  of heavy strength training on muscle mass and physical performance in elite
  cross country skiers. _Scand J Med Sci Sports._ 2011;21(3):389–401.
  doi:[10.1111/j.1600-0838.2009.01074.x](https://doi.org/10.1111/j.1600-0838.2009.01074.x)
  · [PMID 20136751](https://pubmed.ncbi.nlm.nih.gov/20136751/)
- Skattebo Ø, Hallén J, Rønnestad BR, Losnegard T. Upper body heavy strength
  training does not affect performance in junior female cross-country skiers.
  _Scand J Med Sci Sports._ 2016;26(9):1007–1016.
  doi:[10.1111/sms.12517](https://doi.org/10.1111/sms.12517) ·
  [PMID 26146761](https://pubmed.ncbi.nlm.nih.gov/26146761/)

**Rowing**

- Treff G, Winkert K, Machus K, Steinacker JM. Computer-aided stroke-by-stroke
  visualization of actual and target power allows for continuously increasing
  ramp tests on wind-braked rowing ergometers. _Front Physiol._ 2017;8:515.
  doi:[10.3389/fphys.2017.00515](https://doi.org/10.3389/fphys.2017.00515) ·
  [PMID 28824440](https://pubmed.ncbi.nlm.nih.gov/28824440/)
- Treff G, Winkert K, Steinacker JM. Olympic rowing — maximum capacity over 2000
  metres. _Ger J Exerc Sport Res._ / and: Treff G, et al. _Sci Rep._
  2021;11:17140.
  doi:[10.1038/s41598-021-96569-0](https://doi.org/10.1038/s41598-021-96569-0) ·
  [PMID 34446761](https://pubmed.ncbi.nlm.nih.gov/34446761/)
- Watts S, et al. Training prescription and monitoring practices of elite rowing
  coaches. _Eur J Sport Sci._ 2025.
  doi:[10.1002/ejsc.12328](https://doi.org/10.1002/ejsc.12328) ·
  [PMID 40481800](https://pubmed.ncbi.nlm.nih.gov/40481800/)
- The UT2 / UT1 / AT / TR / AN band scheme and its 2 k-split offsets are
  **coaching convention** with no located peer-reviewed source; the ergometer
  power–pace identity `P = 2.80 / pace³` (pace in s·m⁻¹) is the standard
  manufacturer-published relation.

**Cross-training**

- Wilber RL, Moffatt RJ, Scott BE, Lee DT, Cucuzzo NA. Influence of water run
  training on the maintenance of aerobic performance. _Med Sci Sports Exerc._
  1996;28(8):1056–1062.
  doi:[10.1097/00005768-199608000-00017](https://doi.org/10.1097/00005768-199608000-00017)
  · [PMID 8871917](https://pubmed.ncbi.nlm.nih.gov/8871917/)
- Bushman BA, Flynn MG, Andres FF, Lambert CP, Taylor MS, Braun WA. Effect of 4
  wk of deep water run training on running performance. _Med Sci Sports Exerc._
  1997;29(5):694–699.
  doi:[10.1097/00005768-199705000-00017](https://doi.org/10.1097/00005768-199705000-00017)
  · [PMID 9140909](https://pubmed.ncbi.nlm.nih.gov/9140909/)
- Reilly T, Dowzer CN, Cable NT. The physiology of deep-water running. _J Sports
  Sci._ 2003;21(12):959–972.
  doi:[10.1080/02640410310001641368](https://doi.org/10.1080/02640410310001641368)
  · [PMID 14748454](https://pubmed.ncbi.nlm.nih.gov/14748454/)
- Kwok MMY, So BCL, Heywood S, Lai MCY, Ng SSM. Effectiveness of deep water
  running on improving cardiorespiratory fitness, physical function and quality
  of life: a systematic review. _Int J Environ Res Public Health._
  2022;19(15):9434.
  doi:[10.3390/ijerph19159434](https://doi.org/10.3390/ijerph19159434) ·
  [PMID 35954790](https://pubmed.ncbi.nlm.nih.gov/35954790/)

**Cited via ADR 0047 rather than re-verified here**

- Pelland JC, et al. _Sports Med._ 2026;56(2):481–505.
  doi:[10.1007/s40279-025-02344-w](https://doi.org/10.1007/s40279-025-02344-w)
- Barsuhn A, et al. _J Appl Physiol._ 2025;138(1):259–269.
  [PMID 39665246](https://pubmed.ncbi.nlm.nih.gov/39665246/)
- Enes A, et al. _Eur J Appl Physiol._ 2024.
  doi:[10.1007/s00421-024-05655-4](https://doi.org/10.1007/s00421-024-05655-4)
