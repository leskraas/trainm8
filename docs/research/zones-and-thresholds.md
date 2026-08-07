# Zone systems, thresholds, and automatic threshold estimation

Research note. Compiled 2026-08-07. Primary sources cited inline; every claim
that rests on secondary or reconstructed material is flagged.

## TL;DR

- **Every zone model is a ratio table over exactly one anchor.** Coggan is
  `%FTP`, Friel is `%LTHR` (and the bike and run tables genuinely differ — bike
  Z1 ends at 81 % LTHR, run Z1 at 85 %), Daniels is `%threshold pace`,
  Olympiatoppen is `%HRmax`, swim is `%CSS`. The anchor is the whole model; the
  percentages are a rounding convention on top of it.
- **FTP and Critical Power are not the same number and should not be
  interchanged.** In a direct head-to-head, CP was 256 ± 50 W vs FTP 249 ± 44 W,
  bias +7 ± 13 W, 95 % limits of agreement −19 to +33 W — a ±25 W spread on an
  individual athlete despite r = 0.969. CP also sits ~12 W above MLSS in
  meta-analysis, and the gap **widens in fitter athletes**.
- **Automatic threshold estimation is a fit to the mean-maximal-power (or pace)
  curve over a rolling window**, not a test. The 2-parameter model
  `P(t) = CP + W′/t` is well-behaved over roughly 2–20 min efforts; the
  3-parameter Morton model adds `Pmax` but is known to return low CP and
  implausibly high W′. Rolling windows in the field are 42–90 days, with 90 the
  most commonly published figure.
- **Thresholds must be stored per discipline × per metric × per effective date,
  and the zone _recipe_ choice must be versioned alongside them.** trainm8
  already has the first two (`DisciplineProfile` + `ThresholdEvent`); the
  effective-dating is present in the event log but **nothing reads it**, so a
  threshold change silently re-resolves historical zones. That is the single
  biggest gap found.
- **Time-in-zone is a per-sample dwell-time sum, not a sample count.** With
  trainm8's fixed `resolutionSec` grid the two happen to coincide, but the
  `null`-gap channels mean the correct accumulator credits `resolutionSec`
  seconds per non-null sample and drops gaps entirely — and the _choice of
  channel_ (power > pace > HR) has to be recorded per activity or the numbers
  are not comparable week to week.

---

## 1. What the models are actually approximating

Zone models are cheap surrogates for two physiological boundaries. Getting the
vocabulary straight matters because the same boundary has five names.

| Boundary | Also called                                                                               | Roughly                   | What it means                                                                  |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| **LT1**  | aerobic threshold, VT1, first ventilatory threshold, "aerobic-anaerobic transition" onset | ~2 mmol·L⁻¹ blood lactate | Lactate first rises above baseline; production and clearance still balanced    |
| **LT2**  | anaerobic threshold, VT2, MLSS, "the" lactate threshold                                   | ~4 mmol·L⁻¹ (nominal)     | Highest intensity at which lactate is still in steady state                    |
| **CP**   | critical power / critical velocity / critical swim speed                                  | —                         | Asymptote of the power–duration hyperbola; boundary of the heavy/severe domain |

Two cautions from the literature:

- The "~2 and ~4 mmol" figures are _conventions_, not measurements. LT1 has been
  defined as 0.5 mmol above baseline, 1.0 mmol above baseline, or the last point
  before a detected rise — three different intensities from the same blood
  samples
  ([MLSS origin review, _Eur J Appl Physiol_ / PMC10840223](https://pmc.ncbi.nlm.nih.gov/articles/PMC10840223/)).
- **CP is not MLSS.** A 2025 systematic review and meta-analysis found CP
  significantly higher than MLSS by a pooled 12.42 W (95 % CI 4.69–20.16, p =
  0.005), with a prediction interval of −11.62 to +36.47 W, and the difference
  _increasing with fitness_ (moderator slope 0.21 on CP, p = 0.002)
  ([PMC11927562](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11927562/)).

So: three-zone models split at LT1 and LT2. Five- and seven-zone models
sub-divide those three, and the sub-divisions are coaching convention, not
physiology. That is worth stating in product copy.

---

## 2. Zone models and their exact boundaries

### 2.1 Coggan 7-zone power model (% FTP)

Andrew Coggan's levels, from _Training and Racing with a Power Meter_ (Allen &
Coggan, 2006) and reproduced in Coggan's own published table.

| Level | Name                | % FTP     | % LTHR † | RPE (Borg 6–20) |
| ----- | ------------------- | --------- | -------- | --------------- |
| 1     | Active recovery     | < 55 %    | < 68 %   | < 2             |
| 2     | Endurance           | 56–75 %   | 69–83 %  | 2–3             |
| 3     | Tempo               | 76–90 %   | 84–94 %  | 3–4             |
| 4     | Lactate threshold   | 91–105 %  | 95–105 % | 4–5             |
| 5     | VO₂ max             | 106–120 % | > 106 %  | 6–7             |
| 6     | Anaerobic capacity  | 121–150 % | n/a      | > 7             |
| 7     | Neuromuscular power | > 150 %   | n/a      | maximal         |

Sources:
[TrainingPeaks, "Cycling Power Zones Explained: Coggan's 7-Level System"](https://www.trainingpeaks.com/blog/power-training-levels/);
[Hunter Allen, "Power Training Zones 101"](https://www.hunterallenpowerblog.com/2015/05/power-training-zones-101.html).

**Boundary-convention warning.** Two renderings of the same table circulate: the
"gapped" one above (`… 55 / 56–75 / 76–90 …`) and a contiguous one
(`< 55 / 55–74 / 75–89 / 90–104 / 105–120 / 121–150 / > 150`) used by several
implementations
([Staminity zone-limit reference](https://help.staminity.com/en/basics/intensity-zones.html)).
They are the same model; the gapped form leaves a 1 %-wide hole between bands.
**Any implementation that buckets a _measured_ value must use the contiguous
form or samples fall between bands.** trainm8's `COGGAN_POWER_7` uses the gapped
form (`maxRatio: 0.55`, then `minRatio: 0.56`) — fine for _authoring_ a target,
a real bug for _classifying_ a stream sample.

† The %LTHR column is reconstructed from secondary reproductions of Coggan's
table; treat as medium confidence. Coggan himself notes HR is unusable for
levels 6–7.

### 2.2 Friel 7-zone HR model (% LTHR) — bike and run differ

Joe Friel's field test: warm up, then a **30-minute all-out solo time trial**;
LTHR is the **average HR over the final 20 minutes**. (Solo — group riding or
racing inflates it.)

| Zone | Name               | Run, % LTHR | Bike, % LTHR |
| ---- | ------------------ | ----------- | ------------ |
| 1    | Recovery           | ≤ 85 %      | ≤ 81 %       |
| 2    | Aerobic            | 86–89 %     | 82–89 %      |
| 3    | Tempo              | 90–94 %     | 90–93 %      |
| 4    | Sub-threshold      | 95–99 %     | 94–99 %      |
| 5a   | Super-threshold    | 100–102 %   | 100–102 %    |
| 5b   | Aerobic capacity   | 103–106 %   | 103–106 %    |
| 5c   | Anaerobic capacity | > 106 %     | > 106 %      |

Sources:
[Joe Friel, "A Quick Guide to Setting Zones"](https://joefrieltraining.com/a-quick-guide-to-setting-zones/);
[TrainingPeaks mirror of the same article](https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/);
tabulated at
[Staminity](https://help.staminity.com/en/basics/intensity-zones.html).

**Why they differ.** Running is weight-bearing and upright with a larger active
muscle mass; for the same fractional metabolic intensity, HR sits higher than on
the bike, and an athlete's _cycling_ LTHR is typically 5–10 bpm below their
_running_ LTHR. Friel's bike table therefore compresses the low zones (Z1 ends
at 81 % rather than 85 %). This is the canonical worked example of why a
threshold set must be per-discipline: one LTHR value used for both sports is
wrong for at least one of them.

### 2.3 Friel pace zones (% threshold pace)

Anchored on functional threshold pace, not HR. Note these are stated as **pace
ratios**, so numbers **> 100 % are slower**:

| Zone | Name               | % of threshold pace (pace ratio) |
| ---- | ------------------ | -------------------------------- |
| 1    | Recovery           | > 129 %                          |
| 2    | Aerobic            | 114–129 %                        |
| 3    | Tempo              | 106–113 %                        |
| 4    | Sub-threshold      | 101–105 %                        |
| 5a   | Super-threshold    | 97–100 %                         |
| 5b   | Aerobic capacity   | 90–96 %                          |
| 5c   | Anaerobic capacity | < 90 %                           |

Source: [Staminity](https://help.staminity.com/en/basics/intensity-zones.html)
tabulating Friel. Beware: some tools express the same model as **speed**
percentages, which inverts every number. Storing a bare "%" without declaring
pace-vs-speed is a correctness hazard.

### 2.4 Jack Daniels: VDOT and E / M / T / I / R

Daniels does not publish a zone _table_ so much as five named training
intensities, each defined by a physiological fraction and a duration limit.

| Pace  | Name       | % VO₂max   | % HRmax       | Purpose / limit                                                              |
| ----- | ---------- | ---------- | ------------- | ---------------------------------------------------------------------------- |
| **E** | Easy       | 59–74 %    | 65–79 %       | Base, recovery; 30–150 min                                                   |
| **M** | Marathon   | 75–84 %    | 80–90 %       | Race-specific; ≤ 110 min or 29 km                                            |
| **T** | Threshold  | 83–88 %    | 88–92 %       | "Comfortably hard", ~60 min race pace; 20 min continuous or cruise intervals |
| **I** | Interval   | 95–100 %   | 98–100 %      | VO₂max; reps 3–5 min, ≤ 10 km or 8 % of weekly volume                        |
| **R** | Repetition | ~105–120 % | n/a (HR lags) | Speed & economy; reps ≤ 2 min, full recovery                                 |

Sources:
[Daniels' training intensities, summarised](https://medium.com/runners-life/the-training-intensities-of-jack-daniels-c63821c79205);
[_Daniels' Running Formula_ review](https://www.teesche.com/bookshelf/jack_daniels_daniels_running_formula).

**Uncertainty flag.** The %VO₂max column differs between the 2nd and 3rd
editions of the book and between secondary reproductions (E is variously "59–74
%" and "65–78 %"). Treat the ranges as ±3 pp. The _ordering_ and the duration
limits are stable.

**VDOT** is a "pseudo-VO₂max": a single number that folds aerobic capacity and
running economy together, derived by inverting two Daniels–Gilbert curves:

```
VO2(v)      = -4.60 + 0.182258·v + 0.000104·v²        v in m/min
%VO2max(t)  = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)   t in min
VDOT        = VO2(v) / %VO2max(t)
```

Given a race result `(distance, time)`, compute `v`, evaluate both curves, get
VDOT; then invert to get each training pace at its target fraction. This is the
mechanism behind every "VDOT calculator". Source:
[Daniels–Gilbert equations as reproduced by VDOT implementations](https://sport-calculator.com/calculators/running/jack-daniels-running-calculator).

Practical note: VDOT is _not_ measured VO₂max and should never be surfaced as
one. Two runners with identical lab VO₂max can differ by several VDOT points
purely on economy.

### 2.5 Running power zones (% critical running power)

Stryd's five-zone running-power model is anchored on a **running Critical
Power**, auto-computed from roughly the last **90 days** of runs and updated
continuously — no test.

| Zone | Name                      | % CP      |
| ---- | ------------------------- | --------- |
| 1    | Easy                      | < 80 %    |
| 2    | Moderate / long endurance | 80–90 %   |
| 3    | Threshold                 | 90–100 %  |
| 4    | Interval (VO₂max)         | 100–115 % |
| 5    | Repetition / sprint       | > 115 %   |

Source:
[Stryd, "Critical Power definition"](https://help.stryd.com/en/articles/6879345-critical-power-definition);
[Stryd, "What is Critical Power?"](https://blog.stryd.com/2021/08/04/what-is-critical-power/).
Stryd also publishes race-pace anchors on the same scale: **10 km ≈ 96 % CP,
half marathon ≈ 92 % CP**, which is a useful sanity check on any auto-estimated
running CP.

Running CP is a _distinct threshold from cycling FTP_ and must not share a
column. trainm8 already gets this right (`runPowerThresholdW`, ADR 0038).

### 2.6 Seiler 3-zone model

Stephen Seiler's model is deliberately coarse: three zones bounded by the two
ventilatory thresholds.

| Zone | Bound     | Label                      |
| ---- | --------- | -------------------------- |
| 1    | < VT1     | Low intensity (LIT)        |
| 2    | VT1 → VT2 | Moderate ("the grey zone") |
| 3    | > VT2     | High intensity (HIT)       |

Seiler & Kjerland (2006) observed junior Norwegian XC skiers over 32 days: **75
% of sessions below VT1, 8 % between VT1 and VT2, 17 % with significant portions
above VT2** — the origin of the "polarized / 80-20" claim. Source:
[Seiler & Kjerland, _Scand J Med Sci Sports_ 16:49–56 (2006)](https://onlinelibrary.wiley.com/doi/10.1111/j.1600-0838.2004.00418.x);
see also
[Stöggl & Sperlich, _Front Physiol_ (2015)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4621419/).

**Critical detail for any product that computes an intensity distribution:**
Seiler's 80/20 is a **session-goal** count (what was the session _for_), not a
time-in-zone count. Time-in-zone on the same training gives a much more extreme
distribution (~90/10) because warm-ups and recoveries in a HIT session are
low-intensity minutes. Reporting one and calling it the other is the single most
common error in this space. (trainm8's CONTEXT.md already records this
distinction for Quality Session Mix — good.)

### 2.7 Olympiatoppen intensity scale (Norwegian 5-zone, % HRmax)

The Norwegian Olympic Federation's scale, version 2 (2024). It is officially an
**eight**-zone scale; only I-1 to I-5 have heart-rate ranges.

| I-zone | Description          | % HRmax   | % VO₂max  | Lactate (mmol·L⁻¹) | Borg 6–20     | CR10 |
| ------ | -------------------- | --------- | --------- | ------------------ | ------------- | ---- |
| I-1    | Very light           | ~55–72 %  | ~45–55 %  | ~0.5–1.0 (< 1.5)   | < 11          | 1–2  |
| I-2    | Fairly light         | ~72–82 %  | ~55–72 %  | ~1.0–2.0           | < 13          | 2–3  |
| I-3    | Somewhat hard        | ~82–87 %  | ~70–80 %  | ~1.5–3.5           | 13–14         | 4–5  |
| I-4    | Hard                 | ~87–92 %  | ~75–85 %  | —                  | 14–16 (15–16) | 6–7  |
| I-5    | Very hard            | ~92–100 % | ~85–100 % | —                  | 16–19 (17–19) | 8–10 |
| I-6    | Very, very hard      | —         | —         | —                  | 19–20         | 9–10 |
| I-7    | Very, very hard      | —         | —         | —                  | 20            | 10   |
| I-8    | Maximal mobilisation | —         | —         | —                  | —             | —    |

Source:
[Olympiatoppen's Intensity Scale, Version 2 (2024)](https://olt-skala.nif.no/olt_2024_en.pdf)
(verbatim from Table 1 and the per-zone detail pages); scale home at
[olt-skala.nif.no](https://olt-skala.nif.no/en). Contextualised internationally
in
[_Scientific Reports_ (2025)](https://www.nature.com/articles/s41598-025-17023-z).

Two things the PDF says explicitly and product copy should echo: (1) the lactate
values come from a Biosen analyser and handheld devices vary more; (2) "_the
I-scale serves as guidance and is not meant to be applied rigidly_" —
Olympiatoppen _recommends every athlete build a modified, sport-specific
I-scale_. That is a direct endorsement of per-discipline zone overrides.

The Borg columns in Table 1 and the per-zone pages disagree slightly for I-4/I-5
(Table 1 says 14–16 / 16–19; the detail pages say 15–16 / 17–19). Both are
quoted above.

### 2.8 British Cycling 6-zone model (% HRmax)

| Level | Name                      | % MHR   |
| ----- | ------------------------- | ------- |
| 1     | Easy / recovery           | 60–65 % |
| 2     | Endurance ("fat burning") | 65–75 % |
| 3     | Lower aerobic             | 75–82 % |
| 4     | Upper aerobic / threshold | 82–89 % |
| 5     | Anaerobic                 | 89–94 % |
| 6     | Maximal                   | > 94 %  |

Source:
[British Cycling Federation training guidelines](http://www.machinehead-software.co.uk/bcfguide.html);
British Cycling's own
[Understanding intensity](https://www.britishcycling.org.uk/knowledge/article/izn20140725-all-cycling-understanding-intensity-1-0)
series. Confidence: medium — British Cycling has revised its published guidance
several times and now leans on power. Included mainly to show that a %HRmax
anchor produces a _structurally different_ table from a %LTHR anchor: the bands
are wider and the whole ladder shifts down, because HRmax > LTHR.

**Conversion rule** if you ever need to move between a %HRmax recipe and an
%LTHR recipe: multiply by `maxHr / lthr`. trainm8 stores both on
`DisciplineProfile`, so this is available — and is already how `olt-hr-5-*` is
documented to interoperate.

### 2.9 Swim zones anchored on CSS

**Critical Swim Speed** is the swimming instance of critical velocity: the
asymptote of the distance–time line. Two field protocols:

```
CSS (m/s) = (400 − 200) / (T400 − T200)      # times in seconds, both maximal
CSS (m/s) = (400 −  50) / (T400 −  T50)      # 350/(T400−T50) variant
```

In pace terms, `CSS_sec_per_100m = (T400 − T200) / 2`. Origin: Wakayoshi et al.
(1992), _Eur J Appl Physiol_, who showed swimming critical velocity tracks blood
lactate and MLSS; simplified for field use by Ginn (1993) and popularised by
Swim Smooth (Paul Newsome). See
[Topend Sports' protocol write-up](https://www.topendsports.com/testing/tests/critical-swim-speed.htm)
and
[Swim Smooth, "The CSS Test Explained"](https://blog.swimsmooth.com/p/the-css-test-explained).

**The zone table is where sources diverge, materially.** Two conventions exist:

_Additive_ (seconds per 100 m relative to CSS) — the coaching-deck convention:

| Zone        | Offset from CSS             |
| ----------- | --------------------------- |
| 1 Recovery  | CSS + 10–12 s /100 m        |
| 2 Aerobic   | CSS + 5–8 s /100 m          |
| 3 Threshold | CSS ± 1–2 s /100 m          |
| 4 VO₂max    | CSS − 2–4 s /100 m          |
| 5 Sprint    | CSS − 5 s /100 m and faster |

_Multiplicative_ (% critical velocity), invertible to pace ratios:

| Zone              | % CV     | Pace ratio to CSS |
| ----------------- | -------- | ----------------- |
| 1 Easy            | 75–84 %  | 1.19–1.33         |
| 2 Aerobic         | 84–91 %  | 1.10–1.19         |
| 3 Moderate        | 91–96 %  | 1.04–1.10         |
| 4 Threshold (CSS) | 96–102 % | 0.98–1.04         |
| 5 VO₂max          | > 102 %  | < 0.98            |

**These disagree about easy swimming, not marginally.** At a 1:30/100 m CSS, the
additive Z1 (CSS + 11 s) is ≈ 1.12 × CSS; the multiplicative Z1 is 1.19–1.33 ×
CSS. Picking one is a choice of _source_, not a rounding. trainm8's `css-5`
already documents exactly this and picks the %CV scale — that reasoning holds
up.

Confidence on the additive offsets: **low-to-medium.** Swim Smooth's canonical
numbers sit behind a paywall; the offsets above are the widely-reproduced
consensus, not a verified primary quote. Do not present them as Swim Smooth's
own without checking the book.

### 2.10 What zones 6 and 7 actually mean

Coggan's levels 6 and 7 are the only widely-used bands above VO₂max, and they
differ from everything below them in kind, not just degree:

- **Z6, anaerobic capacity (121–150 % FTP)** — efforts of ~30 s to ~3 min,
  fuelled substantially by glycolysis. Limited by W′ (the finite work capacity
  above CP), not by oxygen delivery. HR is uninformative: it lags the effort and
  often peaks during the _recovery_.
- **Z7, neuromuscular power (> 150 % FTP)** — sprints of a few seconds. Limited
  by muscle recruitment, force production, and PCr stores. Coggan lists **no HR
  range at all** for Z6–Z7 precisely because HR cannot resolve them.

The design consequence: **a neuromuscular band is not "step 6 on a metabolic
ladder"; it is off the ladder.** A 5-second maximal sprint has near-zero
metabolic cost and enormous mechanical intensity. trainm8's ADR 0042 §7 already
took this position (Daniels' `R` and Stryd's `Z5` carry no `zone`), and this
research supports it. Note trainm8's `coggan-power-7` currently maps Z6 and Z7
both to Training Zone 5 — defensible for Z6 (still a metabolic effort), but Z7
arguably deserves the same "off the axis" treatment as Daniels' `R`. That
inconsistency is worth a decision.

---

## 3. The anchors

### 3.1 FTP

Coined by Coggan and Allen (2006): **the highest power a rider can sustain in a
quasi-steady state without fatiguing** — operationally, ~1 hour. Protocols:

| Protocol              | Estimate                  | Notes                                                               |
| --------------------- | ------------------------- | ------------------------------------------------------------------- |
| 60-min maximal TT     | FTP = mean power          | The definitional "truth", almost never done                         |
| 20-min TT             | FTP = 0.95 × mean power   | The 5 % haircut approximates the 20→60 min decay                    |
| 8-min (×2)            | FTP = 0.90 × mean power   | Larger haircut, shorter effort                                      |
| Ramp to exhaustion    | FTP = 0.75 × MAP          | MAP = 1-min mean at exhaustion; convention used by indoor platforms |
| Race / hard-ride data | eFTP from the power curve | §4                                                                  |

Sources:
[Cyclingnews, understanding FTP](https://www.cyclingnews.com/features/understanding-ftp-and-how-to-perform-your-own-test-indoors/);
[Carmichael, FTP test protocols](https://trainright.com/ftp-tests-how-to-perform-20-minute-8-minute-and-ramp-tests/);
[Prediction of FTP from graded exercise test data, _Int J Environ Res Public Health_ / PMC9365101](https://pmc.ncbi.nlm.nih.gov/articles/PMC9365101/).

The 0.95 and 0.75 factors are **population averages**, and the individual
variation around them is exactly the individual variation in W′ / anaerobic
contribution. A rider with a big W′ is systematically over-estimated by the
20-min test and by the ramp test. This is a real argument for offering the
athlete a per-athlete correction factor rather than a hard-coded constant, or
for preferring a curve fit.

### 3.2 Critical Power, and why it is not FTP

CP is the **asymptote of the hyperbolic power–duration relationship**:

```
2-parameter (Monod & Scherrer 1965; Morton 2006):
    t = W′ / (P − CP)          equivalently   P(t) = CP + W′/t
    linear work form:          W = CP·t + W′       (fit a straight line, slope = CP)

3-parameter (Morton 1996):
    t = W′ / (P − CP) − W′ / (Pmax − CP)
```

CP is a _modelled_ boundary of the heavy/severe exercise domain. FTP is an
_empirical_ ~1-hour power. They are close and highly correlated, but:

- Head-to-head: **CP 256 ± 50 W vs FTP 249 ± 44 W**; bias +7 ± 13 W; 95 % LoA
  **−19 to +33 W**; r = 0.969; typical error 13 W (5.6 % CV). Authors' own
  words: _"these values generally should not be used interchangeably."_
  ([_Int J Exerc Sci_ / PMC7862708](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7862708/))
- CP is typically the **higher** number, and CP > MLSS by a further ~12 W
  ([PMC11927562](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11927562/)).
- The 3-parameter model "_has been shown to produce comparatively low values of
  CP and questionably high values of W′_" — a known failure mode, not a
  refinement.
  ([CP/W′ narrative review, _Sports_ / PMC7552657](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7552657/))
- Practically, most riders cannot hold CP for an hour — 30–45 min is more
  typical. So a CP-anchored zone table and an FTP-anchored one produce different
  zone edges from "the same" threshold.

**Design implication:** the anchor must record _which construct it is_. Storing
`ftp = 250` with no provenance loses the difference between "a 60-min TT", "0.95
× a 20-min TT", "0.75 × ramp MAP", and "the CP asymptote of a curve fit" — four
numbers that can differ by 20 W for the same athlete.

### 3.3 LTHR

Friel's protocol (see §2.2): 30-min solo all-out TT, average HR of the **last 20
minutes**. Run and bike LTHR are different numbers for the same athlete
(typically bike 5–10 bpm lower). Swim LTHR is not usable in practice.

### 3.4 Threshold pace

The running analogue of FTP: pace sustainable for ~60 min (roughly 15 km–half
marathon race pace for trained runners; closer to 10 km pace for slower runners
whose "1-hour race" _is_ 10 km — a real source of error in naive "threshold = 10
k pace" advice). Daniels' T pace is defined the same way at 83–88 % VO₂max.

For anything off flat road, threshold pace must be grade-adjusted before use.
TrainingPeaks' **NGP (Normalized Graded Pace)** and Skiba's **GOVSS** are the
two published treatments; both convert a hilly run into an equivalent flat pace
before comparing to threshold.
([rTSS explanation](https://www.trainingpeaks.com/learn/articles/running-training-stress-score-rtss-explained/);
[GOVSS paper, Skiba](https://runscribe.com/wp-content/uploads/power/GOVSS.pdf))

### 3.5 CSS

See §2.9. Note CSS is closer to a 20–30 min sustainable pace than a 60 min one,
which is why swim "threshold" and bike "threshold" are not the same fractional
intensity.

### 3.6 Max HR: estimation formulas and why they are poor

| Formula                 | Equation                  | SEE                                                      |
| ----------------------- | ------------------------- | -------------------------------------------------------- |
| Fox (1971), "220 − age" | `HRmax = 220 − age`       | ~7–12 bpm; systematically under-predicts in older adults |
| **Tanaka (2001)**       | `HRmax = 208 − 0.7 × age` | ~10 bpm SD around the regression                         |
| Gellish (2007)          | `HRmax = 207 − 0.7 × age` | similar                                                  |

Tanaka et al. derived theirs from a meta-analysis of **351 studies / 492 groups
/ 18,712 subjects**, cross-validated in 514 subjects.
([Tanaka, Monahan & Seals, _J Am Coll Cardiol_ 37:153–156, 2001](https://www.sciencedirect.com/science/article/pii/S0735109700010548))

**Why they are poor, stated plainly:** a ~10 bpm standard deviation means
roughly one athlete in three has a true HRmax more than 10 bpm from the
prediction, and one in twenty more than 20 bpm off. Since HRmax-anchored zones
are ~5 % HRmax wide (≈ 9 bpm), _a formula-derived HRmax can put an athlete a
whole zone wrong._ Age explains only a fraction of HRmax variance; individual
variation is not reducible by adding terms. See also
[Fox vs Tanaka in marathon runners, PMC5862813](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5862813/).

Corollary: **prefer an observed HRmax** (the highest HR seen in a hard effort,
ideally a maximal test) over any formula, and label formula-derived values as
estimates in the UI. trainm8's ADR 0005 already does the right thing — Tanaka as
a _compute-time fallback_, never materialised — but the UI must say so.

### 3.7 Heart rate reserve (Karvonen) and resting HR

```
HRR    = HRmax − HRrest
target = HRrest + intensity% × HRR
```

Martti Karvonen, 1957. HRR correlates more closely with **oxygen uptake
reserve** (%VO₂R) than plain %HRmax does, which is why ACSM prescribes it.
([BCMJ on Karvonen's contributions](https://bcmj.org/articles/science-exercise-prescription-martti-karvonen-and-his-contributions);
[Cleveland Clinic on HRR](https://my.clevelandclinic.org/health/articles/24649-heart-rate-reserve))

Standard Karvonen bands:

| Zone | Range                 |
| ---- | --------------------- |
| 1    | HRrest + 50–60 % HRR  |
| 2    | HRrest + 60–70 % HRR  |
| 3    | HRrest + 70–80 % HRR  |
| 4    | HRrest + 80–90 % HRR  |
| 5    | HRrest + 90–100 % HRR |

Caveat: HRR inherits _both_ HRmax error and resting-HR error. Resting HR must be
a true supine-on-waking value; a "lowest HR the watch saw today" figure is a
sleeping HR and several bpm lower, which shifts every band. If you store resting
HR, store how it was obtained.

HRR also matters for load: Banister's TRIMP weights time by an exponential of
HRR fraction — `0.64·e^(1.92·HRR)` for males, `0.86·e^(1.67·HRR)` for females
([TRIMP reference](https://www.veohtu.com/trimp.html)) — so a bad resting HR
distorts training load, not just zone display.

---

## 4. Automatic / passive threshold detection

### 4.1 The basic machine

1. **Build a mean-maximal curve.** For each activity, for each duration
   `d ∈ {1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 1200, 1800, 3600 s}`,
   compute the best rolling mean of the metric. (Same construction for power,
   for running power, for speed; for pace you take the best _fastest_ rolling
   mean.)
2. **Aggregate over a rolling window.** Take the per-duration maximum across all
   activities whose start falls in the last _N_ days. This is the athlete's
   MMP/MMS curve.
3. **Fit a model.** Least-squares fit `P(t) = CP + W′/t` (or the linear work
   form `W = CP·t + W′`) over the durations where the model is valid.
4. **Publish `CP`** (and optionally `W′`) as the estimated threshold; derive
   eFTP from it if the product's anchor is FTP.

### 4.2 Which durations to fit

The 2-parameter model is only valid in a band. Below ~2 min the anaerobic
contribution dominates and inflates CP; above ~20–30 min the real curve droops
below the hyperbola (aerobic decoupling, glycogen), which deflates CP. The
conventional fitting range is **2–20 min**, sometimes extended to 3–30.

GoldenCheetah — the reference open-source implementation — offers **classic CP
(2p), Morton 3-parameter (3p), an extended model, Veloclinic, and Ward-Smith**,
and does an _envelope fit_: "_searches for a maximal fit using parts of the
curve that influence parameters most greatly — short durations for Pmax and W′
and longer durations for CP and CP decay._"
([GoldenCheetah power-duration model notes](https://3record.de/about/pd_model);
[Liversedge, "Performance Tests and Power Index"](http://markliversedge.blogspot.com/2019/01/performance-tests-and-power-index.html);
source at
[github.com/GoldenCheetah/GoldenCheetah](https://github.com/GoldenCheetah/GoldenCheetah)).

There is also active methodological work on doing this from _uncontrolled race
data_ rather than tests — see
[Dauwe et al., "Analysis of Mean Maximal Power in cycling with a modified Critical Power model allowing for a non-constant Anaerobic Work Capacity", _J Sci Cycling_](https://www.jsc-journal.com/index.php/JSC/article/view/195)
and
["An improved methodology for estimating critical power from mean maximal power output data", _J Sports Sci_ 41(10), 2023](https://www.tandfonline.com/doi/full/10.1080/02640414.2023.2254574).

### 4.3 Monotonicity

The MMP curve is **monotonically non-increasing by construction** (the best
20-min mean can never exceed the best 10-min mean). Two uses:

- **Validation.** If your computed curve is not monotone, you have a bug —
  usually a windowing or gap-handling error. Assert it.
- **Smoothing.** Noisy or sparse curves can be repaired with **isotonic
  regression** (pool-adjacent-violators) under a non-increasing constraint
  before fitting, which is more principled than a moving average because it
  cannot invent a non-physiological bump. The literature on constrained
  physiological fitting frames this as a quadratic program with inequality
  constraints; it is cheap.

Confidence: the monotone-constraint-then-fit pipeline is standard engineering
practice and appears in implementations, but I did not find a paper that
validates isotonic pre-smoothing specifically for CP estimation. Treat as sound
but unvalidated.

### 4.4 Rolling window length

| Window      | Trade-off                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 42 days     | Matches the CTL time constant; responsive; but a 6-week block with no maximal effort leaves the curve unpopulated                                         |
| **90 days** | The most commonly published choice — TrainingPeaks' modelled FTP uses "the past 90 days of power data"; Stryd uses "approximately 90 days' worth of runs" |
| 180 days+   | Stable but stale; carries last season's peak into this season's base                                                                                      |

Sources:
[TrainingPeaks power-duration curve](https://www.trainingpeaks.com/coach-blog/power-duration-curve-modeled-power/);
[Stryd CP definition](https://help.stryd.com/en/articles/6879345-critical-power-definition).

A defensible compromise: **use a 90-day window for the curve but weight recent
efforts more heavily**, or run both and surface the 42-day number as "recent
form" against the 90-day "season best".

### 4.5 Decay when no hard efforts

The failure mode of naive auto-detection: an athlete does one great 20-minute
effort, then trains easy for two months. The 90-day max keeps that effort until
day 91, then FTP drops off a cliff. Options:

- **Cliff (pure window).** Simple, honest about its window, but produces a
  discontinuity the athlete did not earn.
- **Exponential decay.** Apply `CP(t) = CP₀ · e^(−t/τ)` after a staleness
  threshold. Requires picking τ with no good evidence base — detraining data
  suggests VO₂max falls a few percent per week after 2–4 weeks of inactivity,
  but that is inactivity, not easy training.
- **Freeze + flag (recommended).** Keep the last estimate, mark it stale ("last
  supported by a hard effort 47 days ago"), and prompt for a test. This is the
  only option that doesn't fabricate a number.

**Uncertainty flag: there is no primary literature that validates any specific
decay function for passively-estimated thresholds.** Every product that does it
is guessing. Say so in the UI.

### 4.6 Confidence

An auto-estimate should carry a confidence grade derived from observables:

- **Coverage** — how many of the fitting durations have a supporting effort?
- **Recency** — how old is the newest effort that constrains the fit?
- **Maximality** — did the effort look maximal (HR near max, decoupling,
  negative split failure), or was it a steady tempo that happens to be the best
  20 min in the window? A submaximal best-effort _under_-estimates CP.
- **Fit residual** — a curve that fits `r² > 0.99` over 6 durations is a
  different claim from two points and a line.

This maps cleanly onto trainm8's existing Detection Confidence vocabulary (high
/ medium / low, ADR 0033).

---

## 5. Per-sport threshold storage and versioning

### 5.1 Why the set must be per-discipline

The physiological reasons, each independently sufficient:

- **Active muscle mass and posture** change the HR–VO₂ relationship. Cycling
  LTHR runs ~5–10 bpm below running LTHR in the same athlete; Friel's two tables
  encode this (§2.2).
- **Economy is sport-specific and trainable independently.** Runners have better
  running economy than cyclists at matched VO₂max
  ([Comparison of running and cycling economy, _Eur J Appl Physiol_ 2018](https://link.springer.com/article/10.1007/s00421-018-3865-4)).
  A triathlete's bike fitness and run fitness move on different timescales.
- **Swimming is upper-body and horizontal.** HRmax in the water is typically ~10
  bpm below land HRmax, and a chest strap slips / wrist optical HR fails
  submerged. Hence CSS, not HR.
- **Rowing has its own anchor** (2000 m split, or a rowing critical power) and
  cannot borrow either FTP or running CP.

### 5.2 Why per-metric matters too

Within one discipline you may hold _three_ independent thresholds — FTP (power),
LTHR (HR), threshold pace — and they drift apart. Heat, altitude, fatigue, and
caffeine move HR without moving power. An athlete's FTP can rise while their
LTHR is unchanged. Storing them as one "fitness number" loses this.

Consequence for time-in-zone: **the same activity gives different answers
depending on which metric you classify on.** This is not a bug; it is
information. But it must be labelled.

### 5.3 Versioning: the hard part

Three things change over time and each needs its own effective-dated history:

1. **The threshold value** (FTP 250 → 265 on 2026-04-12).
2. **The recipe choice** (athlete switches bike from `friel-hr-5-bike` to
   `coggan-power-7`).
3. **The recipe definition itself** (a published model gets revised).

The invariant: **a historical activity's zones must be resolvable against the
threshold and recipe that were in force at the time of the activity.** Otherwise
raising your FTP retroactively demotes last month's threshold intervals to
tempo, and the whole training history rewrites itself. Athletes notice this and
lose trust.

Two implementation strategies:

- **Resolve-at-read against an effective-dated history.** Given an activity's
  start time, `SELECT` the latest `ThresholdEvent` with `effectiveAt <= start`,
  plus the recipe id in force at that time. Correct, keeps one source of truth,
  but every read is a temporal join and the recipe-id history must exist.
- **Materialise-at-write.** Stamp the resolved zone boundaries (or at least
  `{recipeId, anchorKind, anchorValue}`) onto the activity when it is imported.
  Cheap reads, immune to later edits, but a genuine correction (bad FTP entered)
  requires an explicit backfill — which is fine, and is exactly the "Load
  Recompute Notice" pattern already in this repo's playbook.

**Recommendation: materialise `{recipeId, anchorKind, anchorValue}` onto the
activity at import**, and keep the effective-dated event log as the source for
backfills, trend charts, and AI context. Recipe _definition_ changes are already
handled by ADR 0006's new-id rule (`coggan-power-7-v2`), which is the right
call.

---

## 6. Time-in-zone computation

### 6.1 The accumulator

For a stream of samples `(t_i, v_i)`:

```
for each i:
    if v_i is null:  continue                    # gap: credit nothing
    dt = t_{i+1} - t_i                           # dwell time of this sample
    if dt > MAX_GAP:  dt = nominal_resolution    # a pause, not a long sample
    z = bucket(v_i, resolvedBands)
    seconds[z] += dt
```

Points that are easy to get wrong:

- **Sum dwell time, not sample count.** Counting samples is only correct at a
  uniform sample rate. Devices record at 1 Hz, "smart recording" (variable, 1–8
  s or more), or per-lap. A 1 Hz ride and a smart-recorded ride give wildly
  different zone _counts_ and identical zone _seconds_.
- **Gaps are not zeroes.** A paused stream must contribute nothing, not "0 W ⇒
  Zone 1". This is the most common time-in-zone bug and it inflates
  recovery-zone time on every ride with a coffee stop.
- **Elapsed vs moving time.** Decide once, document it, and be consistent — zone
  seconds should sum to _moving_ time, not elapsed.
- **Bands must be contiguous and half-open.** Use `[min, max)` with no gaps and
  no overlaps, and one open-ended top band. The gapped Coggan rendering (§2.1)
  breaks this.
- **Smoothing before bucketing.** Raw power is spiky; many implementations
  bucket a 3–30 s rolling average rather than instantaneous watts, because zone
  _intent_ is about sustained intensity. HR needs no smoothing (it is already a
  lagged integrator); pace does (GPS noise). **Whatever you choose, it changes
  the answer, so record it.** No consensus exists in the literature on the right
  smoothing window — flag as a product decision, not a fact.
- **HR lag.** Heart rate takes 30–90 s to respond. In a session of 30/30s, HR
  time-in-zone will show almost nothing in Z5 while power shows half the work
  there. HR-based time-in-zone systematically under-reports high zones and
  over-reports the zone below. This is intrinsic, not fixable by smoothing.

### 6.2 "Combined zones": one channel per activity

Since power / pace / HR give different answers, the workable pattern is to pick
**one** channel per activity by a documented preference order and record the
choice:

```
bike:  power (FTP)      > HR (LTHR)                # pace is meaningless on a bike
run:   running power(CP) > pace (threshold pace) > HR (LTHR)
swim:  pace (CSS)                                  # HR unusable
row:   power            > pace                     > HR
```

Rules that make this honest:

1. **Fall through only when the channel is absent _or_ its anchor threshold is
   missing.** A power stream with no FTP set is not usable.
2. **Record the channel used** on the activity, and surface it. Weekly totals
   that silently mix power-derived and HR-derived zone seconds are not
   comparable — and the mix changes the moment an athlete forgets a strap.
3. **Never blend channels within one activity.** Half a ride on power and half
   on HR produces a distribution that is neither.
4. **Cap confidence for HR-derived distributions**, for the lag reason above.

trainm8 already applies exactly this preference order for structure detection
(CONTEXT.md: "power (critical power) when that threshold is set, else pace; HR
only as a fallback"). Time-in-zone should reuse that same resolver, not grow a
second one.

---

## 7. VO₂max estimation and economy

### 7.1 From HR + pace (running)

The dominant commercial method (Firstbeat, the engine behind most watch VO₂max
numbers) works by:

1. Segmenting the session into HR bands.
2. Within each segment, regressing speed on HR and computing the correlation.
3. **Discarding segments with wide variance and low correlation** (i.e. any
   segment where HR and speed have decoupled — hills, heat, intervals).
4. Extrapolating the surviving HR–speed relationship out to HRmax, then
   converting the implied speed to VO₂ via an oxygen-cost curve.

Reported accuracy for running: **MAPE ≈ 5 %**, error < 3.5 ml·kg⁻¹·min⁻¹ in most
cases, validated on 2,690 freely-performed runs from 79 runners with four lab
tests each.
([Firstbeat white paper, "Automated Fitness Level (VO₂max) Estimation with Heart Rate and Speed Data"](https://assets.firstbeat.com/firstbeat/uploads/2017/06/white_paper_VO2max_30.6.2017.pdf))

The critical dependency: **it extrapolates to HRmax, so a wrong HRmax makes a
wrong VO₂max, roughly proportionally.** Given §3.6, a formula-derived HRmax puts
a ~10 % error bar on VO₂max before any other source of error. This is why watch
VO₂max is best treated as a trend line, not a number.

### 7.2 From power (cycling)

ACSM's leg-ergometry equation gives a steady-state estimate:

```
VO2 (ml·kg⁻¹·min⁻¹) = (10.8 × watts) / body_mass_kg + 7
```

where the `+7` is 3.5 (resting, 1 MET) + 3.5 (unloaded leg movement). Validated
for ~50–200 W steady state; it degrades outside that.
([ACSM metabolic equations](https://www.scribd.com/doc/316171074/ACSM-Metabolic-Equations);
see also
[Prediction of VO₂max in competitive cyclists, PMC9866134](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9866134/))

Applied to MAP (the 1-min power at exhaustion in a ramp test), this gives a
serviceable VO₂max estimate. Applied to submaximal power it does not — it gives
the VO₂ _of that effort_.

Running analogue (ACSM, horizontal component):
`VO2 = 0.2 × speed_m_per_min + 3.5` (plus `0.9 × speed × grade` for incline).

### 7.3 Economy

- **Running economy** = oxygen cost of a given speed, best expressed
  **ml·kg⁻¹·km⁻¹** (energy per unit distance) rather than ml·kg⁻¹·min⁻¹ at a
  reference speed, because the latter is not comparable across speeds.
- **Cycling gross efficiency** = mechanical work rate / metabolic energy
  expenditure, expressed as a percentage; trained cyclists sit around 18–24 %.

Economy is the third pillar of endurance performance alongside VO₂max and the
lactate threshold, and it explains why two athletes with identical VO₂max can
race very differently.
([Exercise economy overview](https://training4endurance.co.uk/physiology-of-endurance/exercise-economy/);
[Running vs cycling economy, _Eur J Appl Physiol_ 2018](https://link.springer.com/article/10.1007/s00421-018-3865-4);
[Walking and running economy vs peak VO₂, PMC2944919](https://pmc.ncbi.nlm.nih.gov/articles/PMC2944919/))

**Where this is actually useful in a product:** economy is the reason VDOT beats
lab VO₂max as a training-pace anchor (VDOT folds economy in), and the reason a
threshold-based anchor beats a VO₂max-based one for prescription. It also makes
a good longitudinal metric — _pace at a fixed HR_, or _HR at a fixed pace_
(sometimes called aerobic decoupling / efficiency factor), is a cheap economy
proxy computable from data trainm8 already stores.

---

## 8. Implications for trainm8

Read against `CONTEXT.md`, `docs/adr/0005-athlete-profile-and-thresholds.md`,
`docs/adr/0006-zone-system-in-code.md`, `app/utils/zones/recipes.ts`,
`app/utils/zones/types.ts`, and `prisma/schema.prisma`.

**The design the evidence supports, in one paragraph.** A threshold is not a
number, it is a `{construct, protocol, value, effective date}` tuple — FTP from
a 60-minute TT, FTP from `0.95 × 20 min`, FTP from `0.75 × ramp MAP` and a CP
curve fit are four different numbers for the same athlete (§3.1, §3.2), and an
activity's zones must resolve against the tuple that was in force when it
happened, not against whatever is current. Zone recipes stay code constants
keyed by id with a new id per revision, their bands are contiguous half-open
intervals, each band declares its own semantics rather than borrowing them from
its index, and neuromuscular work sits off the metabolic ladder entirely. Time
in zone is a dwell-time sum on one declared channel per activity, never a sample
count and never a blend. Auto-estimated thresholds freeze and flag when stale;
they never decay on a made-up curve. Most of that is already the repo's position
— the parts that are not are called out below, and one of them is a live
correctness defect.

### What already lines up with the evidence

- **Recipes as typed code constants keyed by id, with new ids for revisions**
  (ADR 0006). Correct. Every model in §2 is a stable published table; making
  them database rows would invite silent mutation of Coggan's numbers.
- **`ZoneRecipe.anchor` as a discriminated `ZoneAnchor`** — matches the finding
  that the anchor _is_ the model. `runPower` separate from `ftp` (ADR 0038)
  matches §5.1.
- **Separate `friel-hr-5-bike` and `friel-hr-5-run`** — matches Friel's actual
  published difference (§2.2), which many implementations get wrong.
- **`ZoneBand.zone` declared rather than inferred from position** — vindicated
  by Daniels (`T` is third but is threshold) and Olympiatoppen (band names
  describe _feel_, carrying no physiological word). Exactly the right call.
- **Neuromuscular work off the five-zone axis** (ADR 0042 §7) — matches §2.10.
  Coggan himself gives Z6/Z7 no HR range.
- **`css-5`'s reasoning about %CV vs additive offsets** — the research confirms
  the two conventions disagree materially about easy swimming, and that this is
  a choice of source. The comment in `recipes.ts` is accurate.
- **Tanaka as compute-time fallback, never materialised** (ADR 0005) — right,
  given §3.6.
- **Session-goal vs time-in-zone distinction** for Quality Session Mix — this is
  the distinction most products botch (§2.6).

### Gaps, roughly in priority order

1. **Zone resolution against the athlete's _current_ threshold is wrong, and
   should stop.** `ThresholdEvent` is append-only with `source` and
   `effectiveAt`, but only `app/utils/load/snapshot.server.ts` and a test
   reference it; zone resolution reads `DisciplineProfile`'s current value. So
   raising FTP today retroactively demotes last month's threshold intervals to
   tempo. §5.3 is unambiguous that this is the trust killer, and ADR 0005's own
   stated purpose for keeping history includes "retro-resolution of authored
   Intensity Targets" — so the shipped behaviour contradicts the ADR that
   authorised it, and the ADR needs the resolution rule written into it
   explicitly. **Fix: materialise `{recipeId, anchorKind, anchorValue}` onto the
   Activity Import / Recording at ingest**, and reserve the event log for
   backfills, trends and AI context.

   Migration cost, stated plainly: existing activities carry no stamp, so
   backfilling one means resolving each historical activity against the
   effective-dated event log — which will move zone labels and time-in-zone
   readings that athletes have already seen, in the direction of correctness.
   For activities predating any `ThresholdEvent` there is no honest answer and
   the stamp should be absent rather than guessed.

2. **`DisciplineProfile.zoneSystem` has no history, and ADR 0006's
   no-silent-re-resolution promise is therefore unkeepable.** ADR 0006 says
   "existing athletes stay on the old recipe until they opt to switch — no
   silent re-resolution of authored history". That promise holds for the recipe
   _definition_ (the new-id rule delivers it) but not for the athlete's
   _choice_: there is no effective-dated record of when they switched, so even a
   correct temporal join on `ThresholdEvent` cannot reconstruct historical
   zones. Effective-date the recipe id the same way, or (better) stamp it on the
   activity per gap 1.

3. **`coggan-power-7` bands are gapped, not contiguous.** `maxRatio: 0.55` then
   `minRatio: 0.56` leaves 55–56 % FTP in no band, and the same 1 % hole between
   every pair. Harmless for authoring a target, a real defect the moment
   time-in-zone buckets a measured watt value (§6.1). Either make the bands
   contiguous under a new recipe id (`coggan-power-7-v2`, per ADR 0006) or make
   the bucketing function explicitly nearest-band. `css-5` already documents
   contiguity as a requirement; `coggan-power-7` should match. Note
   `friel-hr-5-*` and `daniels-pace-5` have the same 1-point gaps.

4. **No time-in-zone anywhere.** `ActivityStream` stores the right shape — an
   even `timeSec` grid at a known `resolutionSec` with `null` marking gaps — but
   nothing accumulates seconds per zone. When it is built: sum `resolutionSec`
   per non-null sample (§6.1), skip nulls rather than treating them as zero, and
   **record which channel was used** plus any smoothing window. Reuse the
   existing power > pace > HR resolver from structure detection rather than
   writing a second one.

5. **`ThresholdEvent.source: manual | inferred | auto` is the wrong provenance
   axis and should be replaced.** That enum records _how much to trust the
   entry_, which is not the thing that varies. §3.1/§3.2 show that "FTP = 250"
   from a 60-minute TT, from `0.95 × 20 min`, from `0.75 × ramp MAP`, and from a
   CP curve fit are four different numbers for the same rider — up to ~20 W
   apart, with the CP fit systematically the highest and CP itself sitting ~12 W
   above MLSS. Two of those four are `manual` and two are `auto`, so the current
   enum cannot tell them apart. `ThresholdEvent` needs the **protocol** (`tt60`,
   `ftp20`, `ramp`, `cp-fit`, `manual`, …) and, where they differ, the
   **construct** (FTP vs CP), so the app can explain a jump that is really a
   protocol change and can label a CP-derived FTP as the CP-ish number it is.
   Keeping `source` alongside is fine; keeping it as the _only_ provenance is
   not.

6. **No automatic threshold estimation at all.** The `source: 'auto'` enum value
   exists with nothing producing it. §4 is the recipe: MMP curve → 90-day
   rolling window → 2-parameter fit over 2–20 min → confidence grade from
   coverage, recency, maximality, and residual. The confidence vocabulary
   already exists (ADR 0033's high/medium/low). **Do not implement a decay
   function** — §4.5 — freeze the estimate and flag it stale instead; that also
   fits the repo's stated honesty principles (Unavailable Metric, "never a
   fabricated value").

7. **`coggan-power-7` maps Z7 to Training Zone 5; it should map to no zone at
   all.** ADR 0042 §7 already ruled that neuromuscular work has no position on
   the metabolic intensity axis, and §2.10 gives the physiological reason: above
   ~150 % FTP the limiter is recruitment, force production and PCr, not oxygen
   delivery, and the model's own author publishes no HR range for it. Z7 is the
   same case as the run recipes' top band, which correctly carries no zone. Z6
   (anaerobic capacity, still glycolytic and still metabolic) reasonably stays
   at 5. This is not a new decision — it is ADR 0042 §7 applied consistently,
   and the current state is a recipe inconsistency rather than a live
   disagreement.

8. **No rowing, and no obvious slot for it.** §5.1 notes rowing needs its own
   anchor. `CardioDiscipline` and `DisciplineProfile.discipline` are
   run/bike/swim/strength. Not urgent, but the `ZoneAnchor` union and the
   nullable-column-per-threshold shape on `DisciplineProfile` will get awkward
   at the fifth discipline — worth watching.

9. **No LT1/aerobic-threshold concept.** Every recipe in the repo is anchored on
   an LT2-family threshold. Zone 2 training, the polarized-distribution story,
   and Seiler's model all key off LT1, which is currently only implicit in a
   band edge. If the product ever wants to say "you are training above LT1", it
   needs LT1 as a stored anchor, not a derived percentage.

10. **Resting HR is absent.** Karvonen/HRR (§3.7) and Banister TRIMP both need
    it, and TRIMP is already in the load vocabulary. If it gets added, store
    _how_ it was measured — a sleep-derived low is not a supine waking resting
    HR.

11. **No grade adjustment for run pace.** §3.4: comparing raw pace to threshold
    pace on hills is wrong, and rTSS depends on NGP. If run pace ever anchors
    time-in-zone or load, this becomes load-bearing.

12. **The running-power recipe needs a v2: contiguous edges and a vendor-neutral
    id.** The published %CP table is `<80 / 80–90 / 90–100 / 100–115 / >115`;
    the repo has `0–0.80 / 0.81–0.90 / 0.91–1.00 / 1.01–1.15 / 1.16+` — the same
    off-by-one-percent gap problem as gap 3, which becomes a real defect the
    moment this recipe buckets a measured watt value. Separately, ADR 0038 chose
    a recipe id that names a device vendor. Both are fixed by one `-v2` under
    ADR 0006's new-id rule, with `run-power-cp-5` as the neutral name; the
    athlete's threshold and the band ratios are unchanged, so nothing recomputes
    except the two samples per band that currently fall in the gap.

### ADRs this research challenges

| ADR                                                                       | What it decided                                                                                          | What the evidence says                                                                                                                                                                                   | Verdict       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **0006** — recipes are code constants; a revision gets a new id           | Zone recipes live in `app/utils/zones/`, keyed by id; the athlete's choice is a recipe id on the profile | Correct. Every model in §2 is a stable published table; DB rows would invite silent mutation of a named physiological model. Overrides-on-top also matches Olympiatoppen's own advice (§2.7)             | **Confirm**   |
| **0006** — "existing athletes stay on the old recipe"                     | No silent re-resolution of authored history when a recipe is revised                                     | Holds for the recipe _definition_, not for the athlete's _choice_: `zoneSystem` has no effective-dated history, so historical zones cannot be reconstructed either way (§5.3)                            | **Amend**     |
| **0005** — current thresholds on the profile, history in an event log     | `DisciplineProfile` holds the current value; `ThresholdEvent` is append-only with `effectiveAt`          | The log is the right shape but nothing reads it — zones resolve against the _current_ value, so raising FTP retroactively rewrites history. Stamp `{recipeId, anchorKind, anchorValue}` at ingest (§5.3) | **Amend**     |
| **0005** — `ThresholdEvent.source: manual \| inferred \| auto`            | A single enum carries threshold provenance                                                               | Wrong axis. Four protocols give four different "FTP"s up to ~20 W apart and the enum cannot distinguish them. Record the **protocol** and, where they differ, the **construct** (FTP vs CP) (§3.1, §3.2) | **Supersede** |
| **0005** — HRmax from Tanaka, compute-time only, never materialised       | Age-predicted HRmax as a fallback, never written to the database                                         | Right, and for a stronger reason than convenience: the ~10 bpm SD can put an athlete a whole zone wrong, so the value must stay visibly an estimate (§3.6)                                               | **Confirm**   |
| **0042 §7** — neuromuscular work has no position on the intensity axis    | The top run bands carry no `zone`                                                                        | Confirmed by §2.10 — the model's own author publishes no HR range above VO₂max. The rule is simply not applied consistently yet: `coggan-power-7` still maps Z7 to Training Zone 5                       | **Confirm**   |
| **0033** — Detection Confidence as high / medium / low over a binary gate | A graded honesty label, never a second gate                                                              | The right vocabulary to reuse for an auto-estimated threshold, graded on coverage, recency, maximality and fit residual (§4.6)                                                                           | **Confirm**   |
| **0035 / 0038** — anchor-channel ladder: power over pace over HR          | Classify on the channel the recipe is anchored to; HR only as a fallback                                 | Confirmed for time-in-zone as well, which must reuse the same resolver rather than growing a second one. HR-derived time-in-zone is intrinsically biased, not merely noisy (§6.1, §6.2)                  | **Confirm**   |
| **0038** — the running-power recipe id and its band edges                 | A built-in %CP running-power recipe under a vendor-named id                                              | Separating the `runPower` anchor from `ftp` is right (§2.5). The id names a device vendor and the bands are gapped rather than contiguous — both fixed by one `-v2` under ADR 0006's rule (§6.1)         | **Amend**     |

---

## References

Primary and near-primary sources, grouped.

**Zone models**

- Allen, H. & Coggan, A. —
  [Cycling Power Zones Explained: Coggan's 7-Level System](https://www.trainingpeaks.com/blog/power-training-levels/)
- Allen, H. —
  [Power Training Zones 101](https://www.hunterallenpowerblog.com/2015/05/power-training-zones-101.html)
- Friel, J. —
  [A Quick Guide to Setting Zones](https://joefrieltraining.com/a-quick-guide-to-setting-zones/)
  ·
  [mirror](https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/)
- [Methods of calculating training-zone limits (Coggan / Friel / Janssen / Karvonen tables)](https://help.staminity.com/en/basics/intensity-zones.html)
- Daniels, J. —
  [training intensities summary](https://medium.com/runners-life/the-training-intensities-of-jack-daniels-c63821c79205)
  ·
  [Daniels–Gilbert VDOT equations](https://sport-calculator.com/calculators/running/jack-daniels-running-calculator)
- Seiler, S. & Kjerland, G.Ø. (2006) —
  [Quantifying training intensity distribution in elite endurance athletes, _Scand J Med Sci Sports_ 16:49–56](https://onlinelibrary.wiley.com/doi/10.1111/j.1600-0838.2004.00418.x)
- Stöggl, T. & Sperlich, B. (2015) —
  [The training intensity distribution among well-trained and elite endurance athletes, _Front Physiol_](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4621419/)
- Olympiatoppen —
  [Intensity Scale, Version 2 (2024), PDF](https://olt-skala.nif.no/olt_2024_en.pdf)
  · [olt-skala.nif.no](https://olt-skala.nif.no/en)
- [Contextualizing the Norwegian standardized intensity zone framework, _Scientific Reports_ (2025)](https://www.nature.com/articles/s41598-025-17023-z)
- British Cycling —
  [training guidelines](http://www.machinehead-software.co.uk/bcfguide.html) ·
  [Understanding intensity](https://www.britishcycling.org.uk/knowledge/article/izn20140725-all-cycling-understanding-intensity-1-0)
- Stryd —
  [Critical Power definition](https://help.stryd.com/en/articles/6879345-critical-power-definition)
  ·
  [What is Critical Power?](https://blog.stryd.com/2021/08/04/what-is-critical-power/)
- Swim Smooth (Newsome, P.) —
  [The CSS Test Explained](https://blog.swimsmooth.com/p/the-css-test-explained)
- [Critical Swim Speed test protocol (Wakayoshi 1992 / Ginn 1993)](https://www.topendsports.com/testing/tests/critical-swim-speed.htm)

**Thresholds and their physiology**

- Tanaka, H., Monahan, K.D. & Seals, D.R. (2001) —
  [Age-predicted maximal heart rate revisited, _J Am Coll Cardiol_ 37:153–156](https://www.sciencedirect.com/science/article/pii/S0735109700010548)
- [Age-predicted HRmax in recreational marathon runners: Fox vs Tanaka, PMC5862813](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5862813/)
- [Martti Karvonen and the science of exercise prescription, _BCMJ_](https://bcmj.org/articles/science-exercise-prescription-martti-karvonen-and-his-contributions)
- [Heart rate reserve, Cleveland Clinic](https://my.clevelandclinic.org/health/articles/24649-heart-rate-reserve)
- [Relationship between the critical power test and a 20-min FTP test in cycling, PMC7862708](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7862708/)
- [Application of critical power, W′ and its reconstitution: a narrative review, PMC7552657](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7552657/)
- [Factors influencing proximity and agreement between critical power and MLSS: systematic review and meta-analysis, PMC11927562](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11927562/)
- [The origin of the maximal lactate steady state, PMC10840223](https://pmc.ncbi.nlm.nih.gov/articles/PMC10840223/)
- [Prediction of FTP from graded exercise test data, PMC9365101](https://pmc.ncbi.nlm.nih.gov/articles/PMC9365101/)
- [Understanding FTP and testing protocols, Cyclingnews](https://www.cyclingnews.com/features/understanding-ftp-and-how-to-perform-your-own-test-indoors/)
  ·
  [Carmichael on 20-min / 8-min / ramp tests](https://trainright.com/ftp-tests-how-to-perform-20-minute-8-minute-and-ramp-tests/)

**Automatic estimation and modelling**

- GoldenCheetah —
  [power-duration model documentation](https://3record.de/about/pd_model) ·
  [source](https://github.com/GoldenCheetah/GoldenCheetah)
- Liversedge, M. —
  [Performance Tests and Power Index](http://markliversedge.blogspot.com/2019/01/performance-tests-and-power-index.html)
- Dauwe et al. —
  [Analysis of Mean Maximal Power with a modified Critical Power model, _J Sci Cycling_](https://www.jsc-journal.com/index.php/JSC/article/view/195)
- [An improved methodology for estimating critical power from mean maximal power output data, _J Sports Sci_ 41(10), 2023](https://www.tandfonline.com/doi/full/10.1080/02640414.2023.2254574)
- [The power-duration curve and modelled FTP over 90 days](https://www.trainingpeaks.com/coach-blog/power-duration-curve-modeled-power/)

**Load, VO₂max and economy**

- Skiba, P. —
  [GOVSS: Calculation of Power Output and Quantification of Training Stress in Distance Runners](https://runscribe.com/wp-content/uploads/power/GOVSS.pdf)
- [Running Training Stress Score (rTSS) explained](https://www.trainingpeaks.com/learn/articles/running-training-stress-score-rtss-explained/)
- [TRIMP and training-load metrics (Banister coefficients)](https://www.veohtu.com/trimp.html)
- Firstbeat Technologies (2017) —
  [Automated Fitness Level (VO₂max) Estimation with Heart Rate and Speed Data](https://assets.firstbeat.com/firstbeat/uploads/2017/06/white_paper_VO2max_30.6.2017.pdf)
- [ACSM metabolic equations](https://www.scribd.com/doc/316171074/ACSM-Metabolic-Equations)
- [Prediction of maximal oxygen consumption in cycle ergometry in competitive cyclists, PMC9866134](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9866134/)
- [Comparison of running and cycling economy in runners, cyclists and triathletes, _Eur J Appl Physiol_ (2018)](https://link.springer.com/article/10.1007/s00421-018-3865-4)
- [Exercise economy / efficiency](https://training4endurance.co.uk/physiology-of-endurance/exercise-economy/)
- [Walking and running economy: inverse association with peak oxygen uptake, PMC2944919](https://pmc.ncbi.nlm.nih.gov/articles/PMC2944919/)

### Confidence notes

- **High:** Coggan %FTP boundaries; Friel LTHR protocol and both HR tables;
  Olympiatoppen table (read verbatim from the official PDF); Seiler & Kjerland
  session percentages; Tanaka equation and its SEE; CP-vs-FTP and CP-vs-MLSS
  numeric results; CSS formula; the 2-parameter CP model; Firstbeat's stated
  running accuracy; Stryd's 90-day window.
- **Medium:** Coggan's %LTHR column (reconstructed from secondary
  reproductions); Daniels' %VO₂max ranges (differ across editions by ~±3 pp);
  British Cycling's zone table (guidance has been revised); the exact Stryd zone
  edges; the 0.75 ramp factor (a platform convention, not a published study).
- **Low:** the additive Swim Smooth CSS offsets (primary source paywalled; the
  numbers given are widely-reproduced consensus). **No confidence / no evidence
  base:** any specific decay function for a stale auto-estimated threshold, and
  any specific smoothing window before time-in-zone bucketing. Both are product
  decisions that should be documented as such rather than justified by science.
