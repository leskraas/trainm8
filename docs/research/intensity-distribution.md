# Training Intensity Distribution (TID)

Research notes on measuring and classifying how an athlete's training time is
spread across intensities: the three-zone framework, the named archetypes and
their quantitative definitions, the Polarization Index, the time-in-zone vs
session-goal methodological fork, and what the evidence actually supports.

## TL;DR

- **TID is a three-zone quantity, anchored on two thresholds.** Z1 below the
  first lactate/ventilatory threshold (LT1/VT1), Z2 between LT1 and LT2, Z3
  above LT2. Five- and seven-zone ladders are _display_ scales that must be
  folded down to these three before any archetype label is meaningful — and the
  fold is not always clean.
- **The archetypes have real quantitative definitions**, published by Treff et
  al. (2019) building on Seiler & Kjerland (2006) and Stöggl & Sperlich (2015):
  polarized requires `Z1 > Z3 > Z2` _and_ a small Z2; pyramidal is
  `Z1 > Z2 > Z3`; threshold emphasises Z2; HIIT-focused is Z3-dominant.
- **The Polarization Index is `log10(100 × Z1/Z2 × Z3)` on fractions** (`> 2.00`
  = polarized). Note this is **not** `log10(Z1 × Z3 × 100 / Z2)` — that
  mis-transcription inflates PI by ~2.0. A 2023 commentary shows the PI is only
  _defined_ when the polarized structure already holds, and that two of Treff's
  own worked examples are arithmetically wrong.
- **Time-in-zone and session-goal give wildly different answers on the same
  training.** Sylta et al. (2014), same 570 sessions: TIZ says 96/3/1, session
  goal says 87/11/2. Published conversion factors are ~3.0 and ~0.33 between the
  two in the high-intensity range. Neither is "the" TID; the method must be
  stated with the number.
- **The evidence for polarized-over-pyramidal is weaker than the marketing.**
  The 2025 individual-participant-data network meta-analysis (n = 348) found no
  difference in VO₂max or time-trial performance between polarized and pyramidal
  distributions, and the largest observational dataset (119,452 marathon
  runners) found the _fastest_ runners are overwhelmingly **pyramidal**. What is
  well supported is "most of it easy" — not the specific shape of the hard 20%.

---

## 1. The three-zone framework

### 1.1 Anchors

The scientific standard for TID is a **three-zone model bounded by two
physiological thresholds** (Seiler & Kjerland 2006; Seiler 2010; Treff et al.
2019):

| Zone   | Boundary                                                             | Common names                                                         | Physiology                                                |
| ------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| **Z1** | ≥ ~50% VO₂max, below LT1 / VT1 (≤ ~2 mmol·L⁻¹ lactate)               | low intensity, LIT, basic endurance, HVLIT, "easy"                   | moderate domain; lactate at or near baseline steady state |
| **Z2** | between LT1/VT1 and LT2/VT2 (~2–4 mmol·L⁻¹)                          | moderate intensity, MIT, threshold, "the lactate accommodation zone" | heavy domain; elevated but steady-state-able lactate      |
| **Z3** | above LT2 / VT2 / MLSS / critical power (> ~4 mmol·L⁻¹, ~>90% HRmax) | high intensity, HIT, VO₂max work                                     | severe domain; no lactate steady state                    |

Treff et al. state the boundaries verbatim as: _"Zone 1 (basic endurance), ≥ 50%
VO₂max and ≤ first lactate or ventilatory threshold; Zone 2 (lactate threshold),
≥ first and ≤ second lactate or ventilatory threshold; Zone 3 (high
intensity), > second lactate or ventilatory threshold."_

Two things follow that matter for implementation:

1. **The boundaries are athlete-specific physiological anchors, not percentages
   of a maximum.** %HRmax and %FTP tables are proxies for them. The proxy error
   is real: LT1 sits anywhere from ~55% to ~80% of HRmax depending on training
   status, and LT2 from ~80% to ~92%.
2. **Z1 has a floor as well as a ceiling** (≥ ~50% VO₂max). Walking between
   intervals, coasting descents, and long soft-pedal stretches are below the
   floor in the literature's model but are counted as Z1 by every practical
   time-in-zone implementation. This inflates Z1 relative to published research
   figures.

### 1.2 Folding 5- and 7-zone ladders down to three

Athlete-facing apps almost always use a five- or seven-band ladder. The fold to
three zones is a **mapping decision, not a derivation**, because the popular
ladders were not built with LT1/LT2 as internal boundaries.

A defensible default mapping:

| Source ladder                                               | → Z1                               | → Z2                     | → Z3                                         |
| ----------------------------------------------------------- | ---------------------------------- | ------------------------ | -------------------------------------------- |
| **5-zone (Friel HR, Olympiatoppen HR, Daniels-style pace)** | bands 1–2                          | band 3                   | bands 4–5                                    |
| **7-zone (Coggan power)**                                   | 1 (active recovery), 2 (endurance) | 3 (tempo), 4 (threshold) | 5 (VO₂max), 6 (anaerobic), 7 (neuromuscular) |
| **3-zone CSS-style swim**                                   | easy                               | threshold                | above-threshold                              |

Caveats that make this fold lossy:

- **The 5-zone Z1/Z2 boundary is not LT1.** In most 5-zone HR models the top of
  band 2 sits near LT1, so `bands 1–2 → Z1` is roughly right. But
  Olympiatoppen's five HR zones are named for how the work _feels_ ("comfortably
  hard"), not for what it trains, so position-based folding misplaces bands.
  Each band should **declare** which three-zone bucket it belongs to rather than
  have it inferred from its index.
- **Coggan zone 4 straddles the boundary.** "Threshold" in the Coggan model is
  91–105% FTP, and FTP is itself an approximation of LT2/MLSS. A ride at 104%
  FTP is above LT2 for most athletes and should be Z3; a ride at 92% is Z2.
  Folding all of zone 4 into Z2 systematically under-reports Z3.
- **Coggan zone 7 (neuromuscular) is not metabolically Z3.** Sprint work is high
  mechanical intensity at low metabolic cost. Folding it into Z3 makes a
  strides-heavy easy run look like a hard session. Some three-zone
  implementations exclude neuromuscular work from the TID entirely; this is the
  more honest choice and should be stated.
- **Daniels' `T` (threshold) pace sits third in his ladder but is a Z2/Z3
  boundary intensity**, and his `M` (marathon) pace is squarely Z2 despite
  feeling "easy-hard". Ordinal position is not intensity class.

**Recommendation:** carry an explicit, per-band declared three-zone bucket in
the zone model itself; never infer it from band index.

---

## 2. The archetypes and their quantitative definitions

Treff et al. (2019, §Introduction) give the canonical set, with worked example
percentages, "based on previous definitions (Seiler and Kjerland, 2006; Stöggl
and Sperlich, 2015)". Quoting the substance:

### Polarized

> "elevated percentages of time or distance spent in both high- (Zone 3) and
> low-intensity exercise (Zone 1) and only a small proportion of training in
> Zone 2… with percentages of Zone 1 greater than Zone 3 and Zone 3 always
> greater than Zone 2."

Worked examples: **80-5-15**, **75-5-20**. Formal conditions:
`Z1 + Z2 + Z3 = 1`, `Z3 > Z2`, `Z1 > Z3` (hence `Z1 > Z2`), **plus** "a
relatively small proportion of Zone 2" — which is what the PI operationalises.

### Pyramidal

> "a high percentage of training volume spent in Zone 1 and less proportions in
> Zone 2 and 3."

Worked example: **70-20-10**. Formal condition: `Z1 > Z2 > Z3` (monotonically
decreasing).

### Threshold (lactate-threshold, THR)

> "training volume emphasizing Zone 2… established by longer intervals with an
> intensity between first and second lactate or ventilatory threshold or by
> continuous exercise intermixed with higher intensities and without a distinct
> recovery interval."

Worked examples: **40-50-10**, **50-45-5**. Treff explicitly notes a threshold
TID "may but not necessarily has to be pyramidal" — 50-45-5 is _both_ (Z2 is
huge, and Z1>Z2>Z3 holds). **These categories are not mutually exclusive at the
definition level**, which is exactly why a deterministic tie-break order is
needed in any classifier.

### High-intensity (HIIT-focused)

> "a TID with training predominantly performed in Zone 3 and mainly involving
> interval training."

Worked example: **20-10-70**. Note the PI is **undefined** here — Treff: "If
Zone 3 > Zone 1 the PI is not valid and must not be calculated."

### High-volume low-intensity (HVLIT / "base")

Stöggl & Sperlich (2015) treat HVLIT as one of four options an athlete may
choose: "high-volume, low-intensity exercise (HVLIT), usually performed below
the first ventilatory threshold… referred to as 'zone 1' intensity". As a
_distribution_ it is the degenerate pyramidal case: Z1 very high (≥ ~85–90%)
with both Z2 and Z3 small. Treff's Table 1 contains real instances — Guellich et
al. 2009 rowers at **95-3-2** (PI 1.80, non-polarized), and Treff et al. 2017 at
**94-4-2** (PI 1.67, non-polarized, described as pyramidal).

This case is worth naming separately in a product, because PI calls it
"non-polarized" and a naïve pyramidal label calls it "pyramidal", but the
coaching read is different: it is a **base/volume block with almost no quality
work**, which is a deliberate and legitimate phase, not a mistake.

### "Unique" / unclassified

Not a literature term, but necessary. Real distributions land in three awkward
places:

1. **Polarized structure, Z2 too big** — `Z1 > Z3 > Z2` holds but PI ≤ 2.00.
   Treff's example: Carnes & Mahoney (2018) at **74-11-15**, PI = 2.00 exactly,
   which he calls "a non-, but 'nearly'-polarized TID".
2. **Z3 > Z1 but Z3 < 50%** — a hard-heavy block that is not really
   HIIT-focused.
3. **Insufficient data** — too few sessions, too short a window, or zone
   assignment unavailable.

### Reference table of published distributions

| Source                             | Z1   | Z2   | Z3   | PI (Treff) | Treff's label     | Authors' label |
| ---------------------------------- | ---- | ---- | ---- | ---------- | ----------------- | -------------- |
| Neal et al. 2013                   | 80.0 | 0.0  | 20.0 | 3.18       | Polarized         | Polarized      |
| Ingham et al. 2008                 | 72.0 | 0.0  | 28.0 | 3.29       | Polarized         | Polarized      |
| Stöggl & Sperlich 2014 (POL arm)   | 68.0 | 6.0  | 26.0 | 2.47       | Polarized         | Polarized      |
| Bourgois et al. 2013               | 93.1 | 2.3  | 4.6  | 2.27       | Polarized         | Not classified |
| Treff et al. 2017 (POL arm)        | 93.0 | 1.0  | 6.0  | 2.75       | Polarized         | Polarized      |
| Neal et al. 2013 (THR arm)         | 57.0 | 43.0 | 0.0  | 0.00       | Non-polarized     | Threshold      |
| Stöggl & Sperlich 2014 (THR arm)   | 46.0 | 54.0 | 0.0  | 0.00       | Non-polarized     | Threshold      |
| Plews & Laursen 2017               | 67.3 | 30.2 | 2.5  | 0.75       | Non-polarized     | Pyramidal      |
| Stöggl & Sperlich 2014 (HVLIT arm) | 83.0 | 16.0 | 1.0  | 0.71       | Non-polarized     | HVLIT          |
| **Plews & Laursen 2017**           | 80.4 | 17.9 | 1.8  | 0.91       | **Non-polarized** | **Polarized**  |
| **Plews et al. 2014**              | 77.3 | 16.9 | 5.8  | 1.42       | **Non-polarized** | **Polarized**  |
| Treff et al. 2017 (PYR arm)        | 94.0 | 4.0  | 2.0  | 1.67       | Non-polarized     | Pyramidal      |
| Guellich et al. 2009               | 95.0 | 3.0  | 2.0  | 1.80       | Non-polarized     | Non-polarized  |
| **Carnes & Mahoney 2018**          | 74.0 | 11.0 | 15.0 | 2.00       | **Non-polarized** | **Polarized**  |
| Stöggl & Sperlich 2014 (HIT arm)   | 43.0 | 0.0  | 57.0 | n/a        | —                 | HIT            |

_(Table 1 of Treff et al. 2019, CC BY. Bold rows = the PI disagrees with the
original publication's own label.)_ Four disagreements out of fifteen is the
core motivation for the index: **the word "polarized" in the literature is used
loosely, often for what is plainly pyramidal.**

---

## 3. The Polarization Index (Treff et al. 2019)

### 3.1 Exact formula

**Primary source:** Treff G, Winkert K, Sareban M, Steinacker JM, Sperlich B.
_The Polarization-Index: A Simple Calculation to Distinguish Polarized From
Non-polarized Training Intensity Distributions._ Front Physiol. 2019;10:707.
doi:[10.3389/fphys.2019.00707](https://doi.org/10.3389/fphys.2019.00707)

With zones expressed as **fractions** (`z1 + z2 + z3 = 1`):

```
PI = log10( 100 × (z1 / z2) × z3 )
```

Equivalently, with zones expressed as **percentages** (`Z1 + Z2 + Z3 = 100`),
the ×100 cancels:

```
PI = log10( (Z1 / Z2) × Z3 )
```

Special case, `z2 = 0` (avoids division by zero):

```
PI = log10( 100 × (z1 / 0.01) × (z3 − 0.01) )
```

Edge rules stated by the authors:

- `z3 = 0` → **PI = 0 by definition.**
- `z3 > z1` → **PI is not valid and must not be calculated.**
- **Cut-off: `PI > 2.00 a.U.` = polarized; `PI ≤ 2.00` = non-polarized.** Higher
  values = more polarized.

> ⚠️ **Transcription hazard.** The formula is frequently written as
> `log10(Z1 × Z3 × 100 / Z2)`, which is wrong. Check against Treff's own worked
> value: 80-8-12 must give **2.08**. Correct form: `(80/8) × 12 = 120`,
> `log10(120) = 2.079` ✓. Incorrect form: `80 × 12 × 100 / 8 = 12000`,
> `log10(12000) = 4.08` ✗. Any implementation should be unit-tested against
> Treff's published triples: 80-8-12 → 2.08; 60-14-26 → 2.05; 60-19-21 → 1.82;
> 68-6-26 → 2.47; 93-1-6 → 2.75.

### 3.2 Why 2.00, and what it encodes

The cut-off is not arbitrary. Treff's argument: if `z2 = z3`, the terms cancel
and the un-logged expression reduces to `z1 × 100`, which approaches 100 as z1
approaches 1 — so `log10(100) = 2.00` is the ceiling for any distribution where
Z2 equals Z3. Therefore **`PI > 2.00` mathematically guarantees `Z3 > Z2`**, and
combined with the domain restriction it guarantees the whole polarized
structure.

The index also silently encodes the "small Z2" condition, and does so
**proportionally to Z1**:

| If Z1 is… | …Z2 must be below roughly | for PI > 2.00     |
| --------- | ------------------------- | ----------------- |
| 60%       | ~15%                      | (60-14-26 → 2.05) |
| 80%       | ~9%                       | (80-8-12 → 2.08)  |

Treff also states the useful practical range: "the PI is practically useful
within reasonable and accepted limits for Zone 1 in polarized TIDs, being
approximately **70–90%**."

### 3.3 Criticisms

**(a) The formal commentary.** Montenegro Arjona OA, Montenegro Arjona J, Blasco
Lafarga C, Cordellat A. _Commentary: The polarization-index…_ Front Physiol.
2023;14:1179769.
doi:[10.3389/fphys.2023.1179769](https://doi.org/10.3389/fphys.2023.1179769)

Their points:

1. **PI is only _defined_ on the polarized-structure domain.** Formally, PI
   should be a piecewise function defined only when `0 < z2 < z3 < z1` (or the
   `z2 = 0` branch with `0.01 < z3 < z1`); **everywhere else it is `NA`, not a
   low number.** Computing a PI for a pyramidal distribution and reporting "PI =
   0.75, non-polarized" is therefore a category error — the correct statement is
   "not polarized by structure; PI undefined".
2. **Two of Treff's own worked examples are arithmetically wrong.** Treff claims
   90-5-5 and 74-13-13 both give PI = 2.00. The commentary computes
   `log10(90) = 1.954` and `log10(74) = 1.869`, and notes both violate the
   `z2 < z3` condition anyway, so PI should be `NA` for both. (This does not
   undermine the cut-off derivation, but it does undermine Treff's specific "two
   very different TIDs give the same PI" illustration.)
3. **Figure 2's 2-D rendering of a 3-D simplex is hard to interpret**; a simplex
   plot is the honest visualisation.

They supply reference R code; the logic transcribes directly.

**(b) Limitations the authors themselves state.**

- PI "does not allow the differentiation of sub-types of the non-polarized TID
  structures (for example, lactate-threshold vs. high-intensity TID)" and
  "values between 0 and 2.00 must not be interpreted in terms of more or less
  polarized distributions." **PI is not a continuous "polarization score" below
  2.0.**
- Replacing 0% Z2 with 0.01 to avoid division by zero is "theoretically
  inappropriate", though practically irrelevant.
- "We discourage the interpretation as a surrogate for training load." A given
  PI at 15 h/wk and at 25 h/wk describe entirely different training.
- Index compression loses information by construction.

**(c) Practical criticisms not in the papers but visible in the data.**

- **Extreme sensitivity to small Z2 at high Z1.** At Z1 = 93%, moving Z2 from 1%
  to 3% moves PI from 2.75 to ~2.27 to below 2.0. Since Z2 is the zone most
  corrupted by measurement error (HR drift, warm-up ramps, hill surges), the
  index's discriminating variable is its least trustworthy input.
- **Discontinuity at the boundary.** A one-percentage-point reclassification can
  flip the label. Any UI showing a hard label should show the margin too.
- **It presupposes the three-zone fold is correct.** All the mapping error in
  §1.2 propagates into PI unattenuated.

---

## 4. Seiler, 80/20, and what the evidence supports

### 4.1 The origin

Seiler & Kjerland (2006) instrumented 11 well-trained junior cross-country
skiers over 32 days / 384 sessions (347 endurance, **37 strength sessions
excluded from the endurance TID** — an early precedent for treating resistance
work as outside the distribution). Results for endurance sessions:

- HR time-in-zone: **75 ± 3 / 8 ± 3 / 17 ± 4**
- session-RPE: **76 ± 4 / 6 ± 5 / 18 ± 7**
- blood lactate (60 sessions): 71% ≤ 2 mM, 7% 2–4 mM, 22% > 4 mM

Conclusion: "elite endurance athletes train surprisingly little at the lactate
threshold intensity."

Seiler (2010) generalised across sports: "about 80% of training sessions are
performed at low intensity (2 mM blood lactate), with about 20% dominated by
periods of high-intensity work". Note carefully: **"80% of training _sessions_",
not 80% of time** — Seiler's own headline number is a session-goal figure.

### 4.2 The 80/20 rule (Fitzgerald)

Matt Fitzgerald's _80/20 Running_ (2014) and _80/20 Triathlon_ (2018) are trade
books, not primary literature. They popularise Seiler's session-level
observation as a prescription for recreational athletes: keep ~80% of training
easy (below LT1), ~20% moderate-to-hard. The evidence they lean on is
Esteve-Lanao et al. (2005, 2007) and Seiler's descriptive work.

The strongest single experiment behind it is **Esteve-Lanao et al. 2007** (JSCR
21:943–949): 12 sub-elite runners, 5 months, HR-controlled to **80.5/11.8/8.3**
vs **66.8/24.7/8.5** (Z3 matched). The 80% group improved a 10.4 km
cross-country time by −157 s vs −121 s (p = 0.03). That is a real randomised
result — but note it compares **Z1-heavy vs Z2-heavy at matched Z3**, i.e. it is
evidence for "more easy volume", not evidence for polarized over pyramidal.

### 4.3 Polarized vs pyramidal vs threshold: what the literature shows

**Pro-polarized:**

- Stöggl & Sperlich (2014, Front Physiol 5:33,
  doi:[10.3389/fphys.2014.00033](https://doi.org/10.3389/fphys.2014.00033)):
  4-arm 9-week RCT in trained athletes (POL 68-6-26, THR 46-54-0, HVLIT 83-16-1,
  HIT 43-0-57). POL produced the largest gains in VO₂max (+11.7%),
  time-to-exhaustion and peak velocity/power.
- Kenneally et al. (2018, IJSPP 13:1114–1121): systematic review of middle/long
  distance running — "pyramidal and polarized training are more effective than
  threshold training".
- Rosenblat, Perrotta & Vicenzino (2019, JSCR 33:3491–3500): meta-analysis
  favouring polarized over threshold.

**Against polarized-as-optimal:**

- **Rosenblat et al. 2025** (Sports Med 55:655–673, IPD network meta-analysis,
  13 studies, n = 348 — author list includes Treff, Sandbakk, Stöggl and Seiler
  himself): using time-in-HR-zone, **no difference between POL and PYR** for
  VO₂max (SMD = −0.06, p = 0.68) or time trial (SMD = −0.05, p = 0.34), and no
  significant difference between POL and _any_ other TID. Subgroup finding worth
  keeping: competitive athletes may respond better to POL, **recreational
  athletes may respond better to PYR** (SMD = −0.63, p < 0.05).
- **Li, Yang & Wang 2026** (JSCR 40:e755–e764, Bayesian NMA): "Compared with
  polarized training, no other TID model showed a definite advantage" — all
  credible intervals crossed zero — but posterior ranking put **threshold**
  first for VO₂max (SUCRA 84.8%) and **HIIT** first for time-trial (SUCRA
  81.5%).
- **Muniz-Pumares et al. 2025** (Sports Med 55:1023–1035): the largest
  observational dataset that exists — 151,813 marathons by 119,452 runners,
  16-week build-ups, three-zone model with critical speed as the Z2/Z3 boundary
  and 82.3% of critical speed as the Z1/Z2 boundary. **Pyramidal was the most
  common TID, adopted by > 80% of runners with the fastest marathon times.**
  What distinguished fast runners was Z1 volume, not distribution shape.
- **Point/counterpoint, MSSE 2022.** Foster, Casado, Esteve-Lanao, Haugen &
  Seiler, "Polarized Training Is Optimal for Endurance Athletes" (54:1028–1031,
  doi:10.1249/MSS.0000000000002871) vs Burnley, Bearden & Jones, "Polarized
  Training Is Not Optimal for Endurance Athletes" (54:1032–1034,
  doi:10.1249/MSS.0000000000002869), plus both responses (54:1035–1037 and
  54:1038–1040). Burnley et al.'s core charge is that the pro-polarized side
  conflates polarized and pyramidal, and that there is no compelling evidence
  polarized beats the pyramidal distribution most endurance athletes actually
  use for events lasting > ~10 min.
- **Kenneally et al. 2021** (Eur J Sport Sci 21:819–826): in 7 world-class
  middle/long distance runners over 50 weeks, the _same training_ classified by
  race-pace zones was pyramidal in every phase, but classified by physiological
  zones was polarized in some phases. The label is partly an artefact of the
  zoning scheme.

**What survives all of it:**

1. High total volume, most of it clearly below LT1, is the consistent signature
   of successful endurance athletes across every sport studied.
2. 2–3 "key workout" days per week with 3–5 intensive sessions is the
   best-practice pattern reported by world-class Norwegian coaches across eight
   Olympic endurance sports (Sandbakk et al. 2025; Tønnessen et al. 2024).
   Notably those coaches use **considerably more MIT (Z2) sessions than HIT (Z3)
   sessions across the annual cycle** — which is pyramidal, not polarized.
3. Distributions are **phase-dependent**. Stöggl & Sperlich (2015) organise
   their whole review around preparation / pre-competition / competition phases
   because the shape moves. A season-long average is a different object from a
   6-week block average.
4. **"Polarized vs pyramidal" is probably the wrong axis to argue about.** Both
   are ~75–90% Z1. The disagreement is about how the remaining 10–25% is split,
   and no meta-analysis has resolved it.

---

## 5. The methodological fork: time-in-zone vs session-goal

This is the single largest source of disagreement in TID numbers, larger than
any physiological effect being measured.

### 5.1 The two methods

**Time-in-zone (TIZ).** Take each recorded sample, classify it by the intensity
channel, sum the seconds per zone, divide by total seconds. Fully automatic from
telemetry. Every warm-up minute, every recovery jog between reps, every descent
counts in Z1.

**Session-goal (SG).** Classify the _whole session_ by its intent, and credit
its full duration to that zone. A `20 min WU → 6 × 4 min @ Z3 → 15 min CD`
session is **one Z3 session**, all 70 minutes of it.

**Hybrid (SG/TIZ).** Classify the session by goal, but count only in-zone time
toward the zone; recovery and warm-up land in Z1.

### 5.2 The magnitude of the difference

**Sylta, Tønnessen & Seiler 2014** (IJSPP 9:100–107,
doi:[10.1123/ijspp.2013-0298](https://doi.org/10.1123/ijspp.2013-0298)) ran all
three methods on the **same 570 sessions** from 29 elite cross-country skiers:

| Method                | Z1        | Z2        | Z3       |
| --------------------- | --------- | --------- | -------- |
| Time-in-zone (TIZ)    | 96.1%     | 2.9%      | 1.1%     |
| Hybrid (SG/TIZ)       | 95.5%     | 3.6%      | 0.8%     |
| **Session goal (SG)** | **86.6%** | **11.1%** | **2.4%** |

All differences p < .001. Published conversion factors: TIZ → SG ≈ **×3.0** in
the high-intensity range (Z2+Z3) and **×0.9** in Z1; SG → TIZ ≈ **×0.33**.

The same fork appears in Seiler & Kjerland's own data and in Algrøy et al. 2011
(IJSPP 6:70–81), which concluded outright that "quantifying training intensity
by using heart rate based total time in zone is **not valid** for describing the
effective training intensity in soccer" — an extreme case, but the mechanism is
general.

### 5.3 Why they diverge, and which is "right"

They diverge because **a hard session is mostly not hard**. A 60-minute interval
session might contain 24 minutes above LT2 and 36 minutes of warm-up, recovery
and cool-down that land in Z1. TIZ credits 40% of that session to Z3; SG credits
100%.

Neither is wrong; they answer different questions:

- **TIZ answers "where did the physiological time actually go?"** It is the
  right currency for dose–response modelling and for comparing against
  time-in-zone-based literature. It is also the only method computable without
  knowing intent.
- **SG answers "how did I structure my week?"** It matches how coaches
  prescribe, how athletes remember training, and how Seiler's original 80/20
  claim was framed. It is the right currency for planning.

**Consequences that matter for any product:**

1. **The 80/20 target is a session-goal target.** Holding a TIZ-computed
   distribution to 80/20 is a category error — TIZ on the same training reads
   more like 90/10 or 95/5. Sylta's ×3 factor is the bridge.
2. **The archetype thresholds in §2 and the PI cut-off are calibrated on a mix
   of both methods.** Treff's Table 1 draws from studies using different
   quantification methods without adjustment. This is an unacknowledged weakness
   of the whole classification literature.
3. **A product must state the method next to the number**, and should not let a
   user compare a TIZ number against a published SG number.

---

## 6. Computing TID when metrics differ across activities

### 6.1 The anchor-channel problem

Different disciplines have different trustworthy intensity channels:

| Discipline    | Best anchor                                       | Fallback                   | Last resort |
| ------------- | ------------------------------------------------- | -------------------------- | ----------- |
| Cycling       | power (vs FTP/CP)                                 | heart rate                 | RPE         |
| Running       | running power (CP) or pace (vs threshold pace/CS) | heart rate                 | RPE         |
| Swimming      | pace vs CSS                                       | — (HR unreliable in water) | RPE         |
| Rowing/skiing | power or pace                                     | heart rate                 | RPE         |
| Strength      | —                                                 | —                          | RPE / sets  |

The methods do **not** agree. **Sanders, Myers & Akubat 2017** (IJSPP
12:1232–1237,
doi:[10.1123/ijspp.2016-0523](https://doi.org/10.1123/ijspp.2016-0523)) measured
all three channels on the same 10 weeks of training in 15 road cyclists:

| Channel      | Z1    | Z2    | Z3    |
| ------------ | ----- | ----- | ----- |
| Power output | 79.5% | 9.0%  | 11.5% |
| Heart rate   | 86.8% | 8.8%  | 4.4%  |
| RPE          | 44.9% | 29.9% | 25.2% |

Same athletes, same rides. **The HR reading loses more than half the Z3 time
that power sees** (4.4% vs 11.5%). RPE is a different universe entirely.

Kenneally et al. 2021 found the analogous fork in running: race-pace zoning gave
88.5/7.4/4.1 and physiological zoning gave 87.2/6.1/6.6 on the same 50 weeks — a
large effect on Z2 and a moderate effect on Z3, enough to flip "pyramidal" to
"polarized".

### 6.2 The specific biases heart rate introduces

1. **Response lag.** HR takes 30–120 s to reach a steady state matching a new
   work rate. In a `6 × 3 min` session, HR spends much of each rep climbing
   through Z2 toward Z3 and much of each recovery decaying back down. Time in Z3
   is systematically under-counted and time in Z2 over-counted. The shorter the
   intervals, the worse — a `30/30` session can register almost **zero** Z3 time
   by HR while being unambiguously severe-domain work.
2. **Cardiovascular drift.** Over prolonged exercise, stroke volume falls
   progressively after 10–20 min and HR rises to compensate, at constant work
   rate (Coyle & González-Alonso 2001, Exerc Sport Sci Rev 29:88–92). Effect
   sizes of 5–15 bpm over 1–3 h are routine, larger in heat or with dehydration.
   **A long easy ride therefore drifts from Z1 into Z2 without the athlete
   working any harder** — inflating apparent Z2, which is exactly the zone the
   PI is most sensitive to.
3. **Heat, altitude, caffeine, illness, sleep debt, fatigue** all shift the
   HR–work rate relationship by several bpm in either direction.
4. **Bounded-above compression.** HR cannot exceed HRmax, so all-out and
   very-hard work compress into the same top band; HR cannot distinguish VO₂max
   work from sprint work.
5. **Water and cold.** Swimming HR runs ~10 bpm below land equivalents for the
   same relative intensity.

The net directional bias is consistent: **HR-derived TID over-reports Z1 (via
lag on hard days) _and_ over-reports Z2 (via drift on long easy days), while
under-reporting Z3.** It makes training look more pyramidal / less polarized
than power or pace would.

### 6.3 A defensible mixed-metric policy

1. **Classify per activity on that activity's best available anchor**, in a
   declared priority order. Never mix channels within one activity.
2. **Carry a per-activity confidence** derived from the channel used (power/pace
   = high, HR = medium, RPE/estimated = low) and propagate the weakest input to
   the aggregate. HR-classified activities should be capped below the top
   confidence grade.
3. **Report coverage.** "This distribution covers 82% of your recorded training
   time; 18% could not be classified." Excluding unclassifiable time from the
   denominator is honest; silently zero-filling it is not.
4. **Weight by time, not by session count** (unless doing session-goal, where
   count _is_ the unit).
5. **Never fabricate a zone for an activity with no intensity channel at all.**
   A GPS-less strength session or a hike with no HR strap has no place in a
   time-in-zone distribution.
6. **Prefer a stable window.** Rolling 28 or 42 days is defensible; anything
   shorter than ~2 weeks is dominated by which day of the week it is.

### 6.4 Sanity checks worth running

- If Z2 rises while Z3 falls on interval days, suspect HR lag.
- If Z2 rises on long days only, suspect cardiac drift.
- If a session-goal-classified Z3 session shows < 10% TIZ Z3, suspect either the
  threshold is set too high or the session was executed too easily — these two
  are indistinguishable without more information and should not be asserted
  apart.
- If the athlete's LT2 anchor is stale (> ~8–12 weeks old), every zone
  percentage inherits that error; a fitter athlete against an old threshold
  reads as spending far more time in Z2/Z3 than they actually do.

---

## 7. A classification algorithm

Deterministic, ordered, with an explicit confidence. Designed so that every
branch is defensible from §2 and every threshold is a named, tunable constant.

```
CONSTANTS (build-time, tunable; sourced in comments)
  PI_CUTOFF          = 2.00   # Treff et al. 2019
  Z1_PI_VALID_LO     = 60.0   # Treff: PI "practically useful" for Z1 ~70–90;
  Z1_PI_VALID_HI     = 95.0   #   widened slightly to avoid a hard cliff
  HIIT_Z3_MIN        = 50.0   # Treff's HIT exemplar is 20-10-70
  BASE_Z3_MAX        =  5.0   # HVLIT / base block: almost no quality work
  BASE_Z1_MIN        = 85.0
  MIN_SESSIONS       =  8     # coverage gate
  MIN_HOURS          =  8.0
  MIN_DAYS           = 21
  MIN_COVERAGE_FRAC  =  0.70  # classified time / total recorded time
  MARGIN_HIGH        =  5.0   # pp from nearest decision boundary
  MARGIN_LOW         =  2.0

INPUT
  z1, z2, z3         : percentages of *classified* time, summing to 100
  method             : TIME_IN_ZONE | SESSION_GOAL | HYBRID
  channelMix         : per-activity anchor channels + their time shares
  coverage           : classified time / total recorded time in window
  nSessions, hours, spanDays

# ---------------------------------------------------------------
FUNCTION classifyTID(...) -> { archetype, confidence, pi, margin, reasons }

  reasons = []

  # 0. Coverage gate. Below this, refuse — do not guess.
  IF nSessions < MIN_SESSIONS
     OR hours < MIN_HOURS
     OR spanDays < MIN_DAYS
     OR coverage < MIN_COVERAGE_FRAC:
       RETURN { archetype: UNCLASSIFIED_INSUFFICIENT_DATA,
                confidence: NONE, pi: null, margin: null,
                reasons: ["not enough classified training in the window"] }

  # 1. Z3-dominant -> HIIT-focused. PI is undefined here (Treff: z3 > z1).
  IF z3 > z1 AND z3 >= HIIT_Z3_MIN:
       archetype = HIIT_FOCUSED
       margin    = min(z3 - z1, z3 - HIIT_Z3_MIN)
       GOTO score

  # 2. Z3 > Z1 but not dominant -> genuinely odd. Do not force a label.
  IF z3 > z1:
       archetype = UNIQUE
       margin    = z3 - z1
       reasons  += ["more time above LT2 than below LT1"]
       GOTO score

  # 3. Z2 at or above Z1 -> threshold-emphasis.
  #    (Treff exemplars 40-50-10, 50-45-5.)
  IF z2 >= z1:
       archetype = THRESHOLD
       margin    = z2 - z1
       GOTO score

  # --- from here on: z1 > z2 and z1 >= z3 ---

  # 4. Base / high-volume low-intensity: a positive statement, not a failure
  #    to be polarized. (Guellich 95-3-2; Treff 94-4-2.)
  #    The `z3 <= z2` guard matters: Bourgois 93.1-2.3-4.6 also clears the Z1/Z3
  #    bars but has a polarized structure and PI 2.27, so it must fall through.
  IF z1 >= BASE_Z1_MIN AND z3 <= BASE_Z3_MAX AND z3 <= z2:
       archetype = HIGH_VOLUME_BASE
       margin    = min(z1 - BASE_Z1_MIN, BASE_Z3_MAX - z3)
       reasons  += ["almost no work above LT2 — reads as a base/volume block"]
       GOTO score

  # 5. Pyramidal: monotonically decreasing. Z2 > Z3 is the discriminator.
  IF z2 > z3:
       archetype = PYRAMIDAL
       margin    = z2 - z3
       GOTO score

  # 6. Polarized structure holds (z1 > z3 > z2, or z3 == z2). Now the PI
  #    decides whether Z2 is "relatively small".
  #    PI is only defined on this domain (Montenegro Arjona et al. 2023).
  IF z2 == 0:
       # Treff Eq. 2, on fractions. Undefined (NA) unless z3/100 > 0.01.
       f1 = z1 / 100 ; f3 = z3 / 100
       IF f3 <= 0.01: RETURN { archetype: UNIQUE, pi: null, ... }
       pi = log10( 100 * (f1 / 0.01) * (f3 - 0.01) )
  ELSE:
       # Treff Eq. 1. On percentages the ×100 cancels:
       #   log10(100 × (f1/f2) × f3)  ==  log10((z1/z2) × z3)
       pi = log10( (z1 / z2) * z3 )

  IF z1 < Z1_PI_VALID_LO OR z1 > Z1_PI_VALID_HI:
       reasons += ["Z1 outside the range where the polarization index is
                    considered practically useful"]

  IF pi > PI_CUTOFF:
       archetype = POLARIZED
  ELSE:
       # Polarized shape, but Z2 too large to earn the label.
       # Treff's Carnes & Mahoney 74-11-15 (PI = 2.00) lives here.
       archetype = UNIQUE
       reasons  += ["shape is polarized (Z1 > Z3 > Z2) but Z2 is too large
                     for the polarization index cut-off"]

  # margin, expressed in percentage points of Z2: how much Z2 would have to
  # move to flip the PI verdict. More interpretable than a margin in log units.
  z2_at_cutoff = (z1 * z3) / (10 ^ PI_CUTOFF)
  margin       = abs(z2 - z2_at_cutoff)

  # ---------------------------------------------------------------
  score:
  # Confidence is the MINIMUM of three independent grades. Reuse the app's
  # existing high | medium | low vocabulary.

  # (a) boundary margin — how safely inside the class are we?
  marginGrade = margin >= MARGIN_HIGH ? HIGH
              : margin >= MARGIN_LOW  ? MEDIUM
              :                         LOW

  # (b) input trust — worst anchor channel carrying >20% of the time wins.
  #     HR under-reports Z3 and over-reports Z2 (drift, lag) -> capped MEDIUM.
  #     RPE differs from power by ~35pp in Z1 (Sanders 2017)     -> LOW.
  channelGrade = HIGH
  FOR (channel, share) IN channelMix WHERE share > 0.20:
      channelGrade = min(channelGrade,
                         channel == POWER or channel == PACE ? HIGH
                       : channel == HEART_RATE               ? MEDIUM
                       :                                       LOW)

  # (c) sample size
  sampleGrade = (nSessions >= 20 AND spanDays >= 28 AND coverage >= 0.90) ? HIGH
              : (nSessions >= 12 AND spanDays >= 21 AND coverage >= 0.80) ? MEDIUM
              :                                                            LOW

  confidence = min(marginGrade, channelGrade, sampleGrade)

  RETURN { archetype, confidence, pi, margin, reasons, method }
```

### Notes on the algorithm

- **Order matters and is deliberate.** Threshold is tested before pyramidal
  because Treff explicitly notes 50-45-5 satisfies both; the more informative
  label wins. Base is tested before pyramidal for the same reason.
- **`UNIQUE` is a real answer, not a failure.** Two distinct situations reach
  it: Z3 > Z1 without dominance, and polarized-shape-but-fat-Z2. Both should
  carry their `reasons` string into the UI.
- **`pi` is returned only where defined**, per the 2023 commentary. Never render
  "PI = 0.75" beside a pyramidal label.
- **The margin is reported in percentage points of Z2**, which is the number a
  coach can act on: "3 pp more Z2 and this stops being polarized."
- **The method must ride along with the label.** A `POLARIZED` from session-goal
  and a `POLARIZED` from time-in-zone are not the same claim.
- **Do not blend windows.** Classify one window; if you want a trend, classify
  each window separately and show the sequence.

---

## 8. Practical thresholds and honest presentation

### 8.1 Coaching-advice triggers

These are **conventions synthesised from the literature, not validated cut
points.** No paper establishes "Z2 > 25% is bad". They should be framed as
observations, not verdicts.

| Observation (time-in-zone, 4–6 week window)     | Reasonable read                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Z1 < 70%                                        | Easy days probably are not easy. The most consistently supported finding in the field is high Z1 volume (Esteve-Lanao 2005, 2007; Muniz-Pumares 2025). |
| Z1 75–90%                                       | Consistent with virtually every successful cohort studied.                                                                                             |
| Z1 > 95% (TIZ)                                  | Either a genuine base block, or no quality work at all — check Z3 absolute minutes before commenting.                                                  |
| Z2 > 20–25%                                     | "Threshold creep" / grey-zone drift. Worth surfacing, but check for cardiac drift on long sessions first — it manufactures Z2 out of nothing.          |
| Z3 < 3% for > 6 weeks with an event approaching | No severe-domain stimulus.                                                                                                                             |
| Z3 > 20% (TIZ) sustained                        | Very high; sustainable only at low volume.                                                                                                             |
| Hard days ≥ 4/week                              | Above the 2–3 key-workout-days pattern reported by world-class coaches (Sandbakk 2025).                                                                |

Deliberately **not** a trigger: "you are pyramidal, become polarized." The 2025
IPD network meta-analysis found no difference between them, and the recreational
subgroup trended _toward_ pyramidal. Advising an athlete to change archetype is
not supported.

### 8.2 Presenting a distribution honestly

- **Always state the method** ("time in zone" vs "session goal") on the surface,
  not in a tooltip. They differ by a factor of 3 in the hard zones.
- **Always state the window** and the coverage ("last 42 days; 84% of recorded
  training could be classified").
- **Show the three percentages, not just the label.** The label is derived and
  brittle; the percentages are the data.
- **Show the margin when near a boundary.** "Polarized — but only just: 2 pp
  more Z2 and this reads as pyramidal."
- **Degrade rather than guess.** Below the coverage gate, show "not enough
  classified training to describe a distribution", never a chart of three bars
  computed from two sessions.
- **Mark the anchor channel.** A distribution derived mostly from HR should say
  so, with the direction of the known bias ("heart-rate-based; hard intervals
  are likely under-counted").
- **Resist a single scalar.** A PI badge with no percentages beside it invites
  exactly the misreading the 2023 commentary documents. If a scalar is shown, it
  must be shown only where defined.
- **Do not present an archetype as a target.** Present it as a description of
  what happened.
- **A stacked bar or a simplex/ternary plot is the honest chart.** A pie chart
  hides the ordering relations (`Z1 > Z2 > Z3`) that the classification depends
  on.

---

## 9. Sport-specific caveats

### Running

- Pace is a good anchor on flat ground and a bad one on hills and trails; grade-
  adjusted pace helps but is itself modelled. Running power (critical power) is
  a direct measurement and is not subject to the HR caveats.
- Race-pace zoning and physiological zoning disagree enough to flip the label
  (Kenneally 2021). Kenneally et al. (2018) argue for zones defined relative to
  **goal race pace** so that periodization types become comparable — a genuine
  alternative framework, not just a variant.
- Muniz-Pumares (2025) used **82.3% of critical speed** as a practical LT1 proxy
  in the absence of lab data; a useful default if pace is the only anchor.
- Strides and hill sprints are neuromuscular, not metabolic Z3.

### Cycling

- Power is the best-behaved anchor in any sport: instantaneous, drift-free,
  environment-independent. Cycling TID is the most trustworthy TID.
- But **coasting**. Outdoor rides contain large stretches of zero power that
  time-in-zone will file as Z1 (or should exclude entirely). Whether coasting
  time counts materially changes Z1 and therefore every ratio. State the choice.
- Normalized/weighted power is a session aggregate, not a per-sample channel; do
  not classify samples with it.
- Group rides and races are intensity-uncontrolled and will read as threshold-
  heavy regardless of intent.

### Swimming

- HR is unreliable in water (immersion bradycardia, wet-strap dropouts, no wrist
  optical signal). Pace vs CSS is the only practical anchor.
- Sessions are highly intermittent by construction; the wall rest between reps
  makes time-in-zone nearly meaningless without lap-level parsing. **Swimming is
  the sport where session-goal counting is most clearly the right method.**
- Sprint specialists are a genuine exception to the polarized/pyramidal
  discussion: the 50 m event is only ~20% aerobic, and the appropriate TID for a
  50 m specialist is contested (Papadimitriou et al. 2026).
- Technique/drill volume is low intensity by measurement and high value by
  intent — TID says nothing about it.

### Strength / resistance training

- **There is no established TID framework for resistance training.** The
  three-zone model is defined by lactate/ventilatory thresholds, which do not
  meaningfully order a set of squats. Searches of the indexed literature return
  no TID-for-resistance-training studies.
- The founding paper is explicit about this by action: Seiler & Kjerland (2006)
  logged 384 sessions and **excluded all 37 strength sessions** from the
  endurance intensity distribution.
- Strength intensity is ordered by **%1RM and proximity to failure**, an
  independent axis. Mapping "80% 1RM" onto "Z3" is a conversion, not a
  measurement.
- **Recommendation: exclude strength from TID entirely and say so.** A TID that
  silently omits three gym sessions a week is fine; one that silently files them
  as Z2 is a fabrication.

### Team / intermittent sports

- Algrøy et al. (2011) showed HR time-in-zone is "not valid for describing the
  effective training intensity in soccer" — the stop-start profile means HR
  never tracks the actual work. Session-goal or sRPE is required.
- Relevant here as a warning: any activity with a highly intermittent power
  profile (mountain biking, cyclocross, circuit work) inherits the same problem.

---

## 10. Open questions and disagreement to flag

1. **Is polarized better than pyramidal?** Unresolved. Two 2025–2026
   meta-analyses say no difference; the 2014 RCT says yes; the largest
   observational dataset says the fastest people are pyramidal. Any product
   claim in either direction is over-claiming.
2. **Which method should be the default?** No consensus. TIZ is automatic and
   comparable; SG matches how training is prescribed and is what Seiler's 80/20
   claim was actually about.
3. **Do the archetype thresholds transfer across quantification methods?** No
   one has re-derived them per method. Treff's Table 1 mixes methods.
4. **Does PI's Z2-sensitivity survive measurement noise?** Untested. The zone
   the index hinges on is the one most corrupted by drift and lag.
5. **How long a window?** The literature uses everything from 2 weeks to 50
   weeks. Phase-dependence (Stöggl & Sperlich 2015) means the answer is "shorter
   than a season, longer than a microcycle" and no more precise.
6. **Recreational vs competitive divergence.** Rosenblat 2025's subgroup finding
   (recreational athletes may do better on pyramidal) is a single subgroup
   analysis and should be treated as hypothesis-generating.

---

## Implications for trainm8

Read against `CONTEXT.md` and
`docs/adr/0031-discipline-allocation-load-view.md`. These are recommendations on
the evidence. Where a shipped ADR blocks the right design, it is named and
should be replaced; where it is right, that is said too.

**The design the evidence supports, in one paragraph.** TID is a **time**-
denominated three-zone quantity over a named trailing window, computed per
activity on that activity's best anchor channel and never blended within one
activity. Each zone band **declares** its three-zone bucket rather than having
it inferred from its index, and neuromuscular bands declare none. The
quantification **method** — time-in-zone or session-goal — rides with every
number, because the same training reads 96/3/1 one way and 87/11/2 the other.
Strength and `other` are excluded entirely. The archetype is a description,
never a target, because the largest meta-analysis and the largest observational
dataset both decline to separate polarized from pyramidal. Most of that is
already the repo's instinct; the one place it collides with a shipped decision
is the currency.

**1. TID is a new derived metric, and the vocabulary is already half-claimed.**
`CONTEXT.md`'s **Quality Session Mix** entry explicitly lists _"Intensity
distribution, TID"_ under _Avoid_, and correctly notes that "a count of sessions
per zone is Seiler's _session-goal_ method, not the time-based intensity
distribution ADR 0040 refused — distribution stays derived, never authored."
That boundary is exactly right and is confirmed by the research: the Quality
Session Mix **is** a session-goal prescription, and a measured TID **is** a
time-in-zone observation, and §5 shows they differ by a factor of ~3 in the hard
zones. If TID ships, it needs its own CONTEXT entry, with the Quality Session
Mix relationship stated as "the authored session-goal counterpart" — and the app
must never compare the two numbers directly without Sylta's conversion caveat.

**2. The Training Zone ladder already declares its three-zone fold — reuse that
mechanism.** ADR 0045's rule that each **Zone Recipe** band _declares_ which
**Training Zone** it is (rather than having it inferred from position) is
precisely the fix §1.2 argues for, one level up. TID needs the same treatment: a
declared `Z1 | Z2 | Z3 | none` bucket per band, authored per recipe, with
neuromuscular bands declaring `none`. Inferring from the five-step ladder's
index would misplace Daniels' `T` and would file sprint work as Z3 — the exact
errors ADR 0045 already anticipated.

**3. `css-3` is too coarse for TID; `css-5` is not.** The same reasoning that
produced `css-5` applies here. A three-band swim recipe can express the
three-zone fold trivially but cannot distinguish a Z3 set from a Z2 set with any
resolution. Swim TID should be session-goal-based regardless (§9).

**4. Load Confidence maps onto TID confidence directly.** The algorithm in §7
needs a channel-trust grade, and the app already has the vocabulary and the
policy: ADR 0024's rule that HR-derived readings never exceed `medium`, and ADR
0035/0038's anchor-channel priority (bike → power; run → running power when the
CP threshold is set, else pace; HR only as fallback; running power is a direct
measurement and is _not_ HR-capped). TID should reuse that ordering verbatim
rather than inventing a second one. The physiological justification is in §6.2 —
HR under-reports Z3 by more than half in the one study that measured both.

**5. Discipline Allocation is the precedent for the surface.** ADR 0031 settled
the pattern TID should follow: a named trailing window on the surface ("Last 6
weeks"), shares computed over a denominator that **excludes** what cannot be
trustworthily measured, and an **Unavailable Metric** marker rather than a
fabricated zero. TID inherits all three. §8.2's "coverage" line is the same idea
under a different name: state what fraction of recorded time could be
classified, and exclude the rest from the denominator rather than filing it as
Z1.

Two differences from Discipline Allocation worth deciding explicitly:

- **Currency — and ADR 0031's "one currency on the Trends tab" rule should be
  superseded.** Discipline Allocation is denominated in TSS; **TID must be
  denominated in time, and there is no version of it that can be denominated in
  TSS.** `TSS = IF² × hours × 100`, so a TSS-weighted zone share multiplies each
  zone's time by the square of its own intensity — the distribution would
  double-count intensity and make every athlete read threshold-heavy regardless
  of how they trained. That is not a currency preference, it is an arithmetic
  error. ADR 0031's decision that _Discipline Allocation_ is a load view is
  correct and untouched; its supporting rule that "a single currency keeps the
  Trends tab coherent", and its rejection of duration as "a second-class
  currency", must go — they were reasoned from one chart and do not generalise.
  ADR 0046 §1 has already established the shape of the replacement: one number
  per commensurability group, stated in its own units, side by side. Zone-time
  and load are two such groups.
- **Window.** ADR 0031 chose 6 weeks. For TID, 4–6 weeks is defensible (§10.5),
  but the window should be visible and probably phase-aligned — a **Plan Outline
  phase** is arguably the natural window, since distributions are
  phase-dependent and the app already knows the phase boundaries.

**6. Strength stays out, consistently with ADR 0046.** The app has already ruled
that a strength Training Track "contributes no TSS at all" because pricing
lifting as `hours × assumed intensity` is a conversion, not a measurement. §9
reaches the identical conclusion from the physiology side: the three-zone model
is defined by lactate thresholds that do not order resistance work, and the
founding TID study excluded strength sessions outright. TID is
**endurance-only** for the same reason and by the same argument — and the
`other` discipline (hike, yoga, alpine ski) is excluded on the existing rule
that it contributes to no derived load metric. A pure lifter's TID reads "—".

**7. `Structure Detection` gives the app the rare ability to do session-goal
counting honestly.** Session-goal classification normally requires knowing
intent, which is why apps default to time-in-zone. But a `detected` session
already carries a reconstructed warmup/efforts/cooldown structure above an
honesty gate, and its band-separation anchor (a work segment counts only if it
sits ≥ 1 training zone above the easy band) is close to what a session-goal
classifier needs. Two implications: the app could offer **both** methods with
their difference explained, which is a genuinely differentiated and honest
presentation; and, per ADR 0034's asymmetry rule, under-detection means the
session-goal Z3 count is a **floor**, never a ceiling — an undetected hard
session must not be silently filed as Z1.

**8. The `Unavailable Metric` discipline is what makes TID safe to ship.** Every
failure mode in §6.4 and §7's coverage gate is an Unavailable path the app
already knows how to render: a stale threshold anchor, an activity with no
intensity channel, a window with too few sessions. The one new honesty
obligation is **the margin** — a boundary-adjacent classification is not
Unavailable, but it is not a fact either, and §8.2's "2 pp more Z2 and this
reads as pyramidal" is the honest rendering.

**9. Do not turn the archetype into advice.** The **Coach card** answers "go
hard or recover?" from TSB. It would be tempting to have TID answer "are you
training right?" — but §4.3 says the literature does not support telling an
athlete to change archetype, and §10.1 says the polarized-vs-pyramidal question
is open. Defensible advice from TID is narrow: _"your easy days are not easy"_
(Z1 < 70%, the best-supported finding in the field) and _"you have had no work
above LT2 in six weeks"_ (an absence, which is a fact). Everything else is a
description.

### ADRs this research challenges

| ADR                                                                                  | What it decided                                                                                                                | What the evidence says                                                                                                                                                                                                                   | Verdict       |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **0031** — Discipline Allocation is a trailing-window load share                     | Actual TSS per discipline over 6 weeks, named window, Unavailable rather than a fabricated zero, excluded from the denominator | The surface pattern is right and TID should copy it wholesale — named window, honest coverage, exclusion rather than zero-fill (§8.2)                                                                                                    | **Confirm**   |
| **0031 §"Why load, not the original count"** — one currency on the Trends tab        | A single load currency keeps the tab coherent; duration is "a second-class currency"                                           | Does not generalise. `TSS = IF² × hours × 100`, so a TSS-weighted zone share squares intensity into the distribution and makes everyone read threshold-heavy. TID is time-denominated or it is wrong (§5, §6)                            | **Supersede** |
| **0045 §3** — each recipe band declares its Training Zone                            | Bands declare their zone rather than inheriting it from position                                                               | Exactly the fix §1.2 argues for, one level up — positional folding misplaces the threshold band and files sprint work as high-intensity. Needs extending: bands must also declare a `Z1 \| Z2 \| Z3 \| none` TID bucket                  | **Amend**     |
| **0040** — intensity distribution is derived, never authored                         | The Quality Session Mix is a session-count prescription; TID was refused as an authored quantity                               | Confirmed, and the research explains why the two must stay apart: the Mix is a session-goal prescription, a measured TID is a time-in-zone observation, and they differ by ~3× in the hard zones (§5.2)                                  | **Confirm**   |
| **0046** — no load number spans incommensurable tracks; strength contributes nothing | Strength leaves the triad; two figures in two currencies, never one                                                            | Independently confirmed from the physiology side: the three-zone model is bounded by lactate thresholds that do not order a set of squats, and the founding TID study excluded strength sessions outright (§9)                           | **Confirm**   |
| **0024 / 0035 / 0038** — anchor-channel priority; HR capped at `medium`              | Power, then pace, then HR; HR-derived readings never claim top confidence                                                      | Strongly confirmed and quantified: on the same rides, HR sees 4.4 % Z3 where power sees 11.5 % (§6.1). TID must reuse this ordering verbatim rather than inventing a second one                                                          | **Confirm**   |
| **0034** — detection under-detects, so only the upward direction is assertable       | Structure Adherence may assert surplus work, never missing work                                                                | The same asymmetry governs session-goal counting from detected structure: an undetected hard session makes the Z3 count a **floor**, and must never be filed as easy time (§7)                                                           | **Confirm**   |
| **0006** — `css-3` as a built-in swim recipe                                         | Three-band CSS recipe registered alongside the others                                                                          | Adequate for authoring, too coarse to resolve a high-intensity set from a threshold set for TID purposes. Swim TID should be session-goal-based regardless — wall rest makes swim time-in-zone near-meaningless without lap parsing (§9) | **Confirm**   |

---

## References

**Primary — the polarization index**

- Treff G, Winkert K, Sareban M, Steinacker JM, Sperlich B. The Polarization-
  Index: A Simple Calculation to Distinguish Polarized From Non-polarized
  Training Intensity Distributions. _Front Physiol._ 2019;10:707.
  doi:[10.3389/fphys.2019.00707](https://doi.org/10.3389/fphys.2019.00707) (PMID
  31249533, PMC6582670; CC BY)
- Montenegro Arjona OA, Montenegro Arjona J, Blasco Lafarga C, Cordellat A.
  Commentary: The polarization-index… _Front Physiol._ 2023;14:1179769.
  doi:[10.3389/fphys.2023.1179769](https://doi.org/10.3389/fphys.2023.1179769)
  (PMID 37954449, PMC10639116)
- Treff G, et al. Eleven-Week Preparation Involving Polarized Intensity
  Distribution Is Not Superior to Pyramidal Distribution in National Elite
  Rowers. _Front Physiol._ 2017;8:515.
  doi:[10.3389/fphys.2017.00515](https://doi.org/10.3389/fphys.2017.00515)
  (PMC5539230) — where the PI first appeared.

**Primary — the three-zone model and its origins**

- Seiler KS, Kjerland GØ. Quantifying training intensity distribution in elite
  endurance athletes: is there evidence for an "optimal" distribution? _Scand J
  Med Sci Sports._ 2006;16(1):49–56.
  doi:[10.1111/j.1600-0838.2004.00418.x](https://doi.org/10.1111/j.1600-0838.2004.00418.x)
- Seiler S. What is best practice for training intensity and duration
  distribution in endurance athletes? _Int J Sports Physiol Perform._
  2010;5(3):276–291.
  doi:[10.1123/ijspp.5.3.276](https://doi.org/10.1123/ijspp.5.3.276)
- Stöggl TL, Sperlich B. The training intensity distribution among well-trained
  and elite endurance athletes. _Front Physiol._ 2015;6:295.
  doi:[10.3389/fphys.2015.00295](https://doi.org/10.3389/fphys.2015.00295)
  (PMC4621419)

**Method comparison — time-in-zone vs session-goal vs channel**

- Sylta Ø, Tønnessen E, Seiler S. From heart-rate data to training
  quantification: a comparison of 3 methods of training-intensity analysis. _Int
  J Sports Physiol Perform._ 2014;9(1):100–107.
  doi:[10.1123/ijspp.2013-0298](https://doi.org/10.1123/ijspp.2013-0298)
- Sanders D, Myers T, Akubat I. Training-Intensity Distribution in Road
  Cyclists: Objective Versus Subjective Measures. _Int J Sports Physiol
  Perform._ 2017;12(9):1232–1237.
  doi:[10.1123/ijspp.2016-0523](https://doi.org/10.1123/ijspp.2016-0523)
- Kenneally M, Casado A, Gomez-Ezeiza J, Santos-Concejero J. Training intensity
  distribution analysis by race pace vs. physiological approach in world-class
  middle- and long-distance runners. _Eur J Sport Sci._ 2021;21(6):819–826.
  doi:[10.1080/17461391.2020.1773934](https://doi.org/10.1080/17461391.2020.1773934)
- Algrøy EA, Hetlelid KJ, Seiler S, Stray Pedersen JI. Quantifying training
  intensity distribution in a group of Norwegian professional soccer players.
  _Int J Sports Physiol Perform._ 2011;6(1):70–81.
  doi:[10.1123/ijspp.6.1.70](https://doi.org/10.1123/ijspp.6.1.70)
- Campos Y, Casado A, Vieira JG, et al. Training-intensity Distribution on
  Middle- and Long-distance Runners: A Systematic Review. _Int J Sports Med._
  2022;43(4):305–316.
  doi:[10.1055/a-1559-3623](https://doi.org/10.1055/a-1559-3623)

**Evidence base and the polarized debate**

- Esteve-Lanao J, San Juan AF, Earnest CP, Foster C, Lucia A. How do endurance
  runners actually train? Relationship with competition performance. _Med Sci
  Sports Exerc._ 2005;37(3):496–504.
  doi:[10.1249/01.MSS.0000155393.78744.86](https://doi.org/10.1249/01.MSS.0000155393.78744.86)
- Esteve-Lanao J, Foster C, Seiler S, Lucia A. Impact of training intensity
  distribution on performance in endurance athletes. _J Strength Cond Res._
  2007;21(3):943–949. doi:[10.1519/R-19725.1](https://doi.org/10.1519/R-19725.1)
- Stöggl T, Sperlich B. Polarized training has greater impact on key endurance
  variables than threshold, high intensity, or high volume training. _Front
  Physiol._ 2014;5:33.
  doi:[10.3389/fphys.2014.00033](https://doi.org/10.3389/fphys.2014.00033)
  (PMC3912323)
- Kenneally M, Casado A, Santos-Concejero J. The Effect of Periodization and
  Training Intensity Distribution on Middle- and Long-Distance Running
  Performance: A Systematic Review. _Int J Sports Physiol Perform._
  2018;13(9):1114–1121.
  doi:[10.1123/ijspp.2017-0327](https://doi.org/10.1123/ijspp.2017-0327)
- Rosenblat MA, Perrotta AS, Vicenzino B. Polarized vs. Threshold Training
  Intensity Distribution on Endurance Sport Performance: A Systematic Review and
  Meta-Analysis of Randomized Controlled Trials. _J Strength Cond Res._
  2019;33(12):3491–3500.
  doi:[10.1519/JSC.0000000000002618](https://doi.org/10.1519/JSC.0000000000002618)
- Rosenblat MA, Watt JA, Arnold JI, … Seiler S. Which Training Intensity
  Distribution Intervention will Produce the Greatest Improvements in Maximal
  Oxygen Uptake and Time-Trial Performance in Endurance Athletes? A Systematic
  Review and Network Meta-analysis of Individual Participant Data. _Sports Med._
  2025;55(3):655–673.
  doi:[10.1007/s40279-024-02149-3](https://doi.org/10.1007/s40279-024-02149-3)
- Li H, Yang Q, Wang B. Effects of Different Training-Intensity Distribution
  Models on Maximal Oxygen Uptake and Time-Trial Performance in Endurance
  Athletes: A Bayesian Network Meta-Analysis. _J Strength Cond Res._
  2026;40(7):e755–e764.
  doi:[10.1519/JSC.0000000000005415](https://doi.org/10.1519/JSC.0000000000005415)
- Muniz-Pumares D, Hunter B, Meyler S, Maunder E, Smyth B. The Training
  Intensity Distribution of Marathon Runners Across Performance Levels. _Sports
  Med._ 2025;55(4):1023–1035.
  doi:[10.1007/s40279-024-02137-7](https://doi.org/10.1007/s40279-024-02137-7)
- Foster C, Casado A, Esteve-Lanao J, Haugen T, Seiler S. Polarized Training Is
  Optimal for Endurance Athletes. _Med Sci Sports Exerc._ 2022;54(6):1028–1031.
  doi:[10.1249/MSS.0000000000002871](https://doi.org/10.1249/MSS.0000000000002871)
  (response at doi:10.1249/MSS.0000000000002923)
- Burnley M, Bearden SE, Jones AM. Polarized Training Is Not Optimal for
  Endurance Athletes. _Med Sci Sports Exerc._ 2022;54(6):1032–1034.
  doi:[10.1249/MSS.0000000000002869](https://doi.org/10.1249/MSS.0000000000002869)
  (response at doi:10.1249/MSS.0000000000002924)

**Best practice, sport-specific, and physiology**

- Sandbakk Ø, Tønnessen E, Sandbakk SB, Losnegard T, Seiler S, Haugen T.
  Best-Practice Training Characteristics Within Olympic Endurance Sports as
  Described by Norwegian World-Class Coaches. _Sports Med Open._ 2025;11:45.
  doi:[10.1186/s40798-025-00848-3](https://doi.org/10.1186/s40798-025-00848-3)
  (PMC12031707)
- Tønnessen E, Sandbakk Ø, Sandbakk SB, Seiler S, Haugen T. Training Session
  Models in Endurance Sports: A Norwegian Perspective on Best Practice
  Recommendations. _Sports Med._ 2024;54(11):2935–2953.
  doi:[10.1007/s40279-024-02067-4](https://doi.org/10.1007/s40279-024-02067-4)
  (PMC11560996)
- Papadimitriou K, Ruiz-Navarro JJ, Cuenca-Fernández F, Margaritelis NV.
  Training intensity distribution for sprinter swimmers. _Eur J Appl Physiol._
  2026;126(2):619–628.
  doi:[10.1007/s00421-025-06064-x](https://doi.org/10.1007/s00421-025-06064-x)
- Coyle EF, González-Alonso J. Cardiovascular drift during prolonged exercise:
  new perspectives. _Exerc Sport Sci Rev._ 2001;29(2):88–92.
  doi:[10.1097/00003677-200104000-00009](https://doi.org/10.1097/00003677-200104000-00009)
- Souissi A, Haddad M, Dergaa I, Ben Saad H, Chamari K. A new perspective on
  cardiovascular drift during prolonged exercise. _Life Sci._ 2021;287:120109.
  doi:[10.1016/j.lfs.2021.120109](https://doi.org/10.1016/j.lfs.2021.120109)

**Non-primary (popularisation, cited for provenance only)**

- Fitzgerald M. _80/20 Running._ New American Library, 2014. ISBN
  978-0451470881.
- Fitzgerald M, Warden D. _80/20 Triathlon._ Da Capo Lifelong Books, 2018. ISBN
  978-0738234687.
