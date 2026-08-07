# Portable intensity anchoring

How to prescribe a workout target that means the same thing for every athlete,
and still resolves to _this_ athlete's pace, power, or split.

Research note. Compiled 2026-08-07. Builds on
[zones-and-thresholds.md](zones-and-thresholds.md) — that document establishes
that **a zone model is a ratio table over exactly one anchor**, and how the
anchor itself is measured and versioned. This document is about the layer above
it: the _vocabulary_ a target is authored in, and the resolution machinery that
turns a portable name into a number.

> **Verification status.** All equations were re-derived and every numeric
> example in this document was computed locally (Daniels–Gilbert curves, Riegel
> exponent sweep, critical-speed fits, Concept2 watts↔split, rowing band
> conversion). Coefficients and worked numbers are therefore **high
> confidence**.
>
> The bibliography was re-checked in a second pass (2026-08-07) against
> Crossref, Europe PMC, OpenAlex, Open Library and the primary publisher pages.
> Peer-reviewed citations are now verified down to volume, issue, pages and DOI
> unless stated otherwise. What remains unverified is marked in place as **⚠
> citation unverified** together with _what the claim actually rests on_ —
> usually a coaching convention, a self-published booklet, or an internet-era
> formula with no primary publication. Those markers are load-bearing: they mean
> "do not present this as literature".

## TL;DR

- **Riegel and Daniels are the same model in different clothes.** For a 20:00 5k
  runner they predict 10k within **14 seconds** and the marathon within **32
  seconds** of each other. The interesting disagreement is not Riegel-vs-Daniels
  — it is **Riegel-vs-reality**: the empirical exponent for recreational runners
  is nearer **1.10–1.15** than Riegel's 1.06, and at 1.15 the same runner's
  predicted marathon moves from **3:11:49 to 3:52:25** — a **40-minute, 21 %**
  error. Race-equivalence is trustworthy within roughly a **4× distance ratio**
  and untrustworthy outside it.
- **The right anchor for prescription is a threshold, not a race name.** Named
  race paces (`5k pace`, `10k pace`) are _duration-relative_ — a 16:00 5k runner
  holds 5k pace for 16 minutes, a 30:00 runner for 30 — so they are not the same
  physiological intensity for both. Critical Speed and threshold pace are
  duration-invariant by construction. Race names are the right _authoring_ and
  _display_ vocabulary; a threshold is the right _storage_ anchor.
- **Additive offset anchors (rowing's "2k split + 20 s", swim's "CSS + 10 s")
  are scale-dependent and silently wrong across ability levels.** Rowing's
  published UT2 band `2k split + 20–24 s` is **54–59 % of 2k power** for a 1:45
  rower but a much softer fraction for a 2:15 rower, because erg power goes as
  `pace⁻³`. Convert to a ratio before storing.
- **Freeze the resolution at prescription time, re-resolve at view time, and
  show both.** A target is authored as a portable name; the number an athlete
  read _when they did the session_ is history and must never move; the number
  they see for _tomorrow's_ session must track their current fitness. These are
  two different stamps, not one.
- **The union that covers everything is six variants**: `absolute`,
  `pctThreshold`, `zone`, `raceEquivalent`, `rpe`, `open` — plus a mandatory
  `Resolution` record carrying
  `{value | unavailable, via, confidence, resolvedAt}`. Five of the six can fail
  to resolve; only `rpe` and `open` cannot, which is exactly why they are the
  honest floor.

---

## 1. The velocity–duration curve

### 1.1 What it is

Every model in this document is a re-parameterisation of one object: the
athlete's **velocity–duration curve** `v(t)` — the fastest average speed
sustainable for a duration `t`. It is the running analogue of the power–duration
curve, and it is built from data exactly the same way (see
[zones-and-thresholds.md §4.1](zones-and-thresholds.md)):

```
For each activity a, for each duration t in DURATIONS:
    mms[a][t] = max over all windows of length t of (distance / t)

MMS(t) = max over activities a in [today - N days, today] of mms[a][t]
```

`MMS` is the **mean-maximal speed curve**. The distance-domain twin, which is
more natural for running, is the **mean-maximal distance curve**: the greatest
distance covered in any window of length `t`. The two are trivially
interconvertible (`d(t) = v(t)·t`) and the distance form has the nicer property
that the two-parameter model becomes a _straight line_.

Two structural facts, both worth asserting in code:

- **`MMS(t)` is monotonically non-increasing in `t`.** Best 20-minute speed can
  never exceed best 10-minute speed. Non-monotonicity is a windowing bug.
- **`d(t) = v(t)·t` is monotonically non-decreasing.** Same assertion, dual
  form.

### 1.2 Three competing functional forms

| Form                              | Equation                                      | Valid range    | What it says                                                                        |
| --------------------------------- | --------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| **Power law** (Riegel / Kennelly) | `t = a·d^b`, equivalently `v = k·t^(1/b − 1)` | ~2 min to ~4 h | Speed decays as a fixed _fractional_ rate per doubling of distance. No asymptote.   |
| **Hyperbolic / 2-parameter CP**   | `d = CS·t + D′` ⟺ `v(t) = CS + D′/t`          | ~2–20 min      | Speed decays to a finite asymptote `CS`.                                            |
| **Daniels–Gilbert**               | `%VO₂max(t)` × oxygen-cost curve              | ~3 min to ~3 h | Speed decays because the _sustainable fraction of VO₂max_ decays, not speed itself. |

They cannot all be right, and the ranges where each is valid barely overlap:

- The power law has **no asymptote**, so extrapolated far enough it predicts a
  positive speed for infinite duration and an infinite speed for zero duration.
  Both are wrong; it is an interpolation formula.
- The hyperbolic model has an asymptote but **over-predicts long durations
  badly**: it says `CS` is holdable forever, whereas real athletes hold CS for
  20–40 minutes. Above ~20–30 min the real curve droops below the hyperbola
  (glycogen depletion, thermal drift, aerobic decoupling).
- Daniels–Gilbert is the only one with an explicit _physiological_ decay term,
  and it is fitted to elite-ish data.

**Design consequence: pick the model by the duration you are interpolating into,
not by preference.** A 3-minute VO₂max interval should be priced off the
hyperbolic model or off `I` pace; a marathon-pace long run should be priced off
Daniels or an empirical exponent, never off `CS + D′/t`.

Kennelly (1906),
["An approximate law of fatigue in the speeds of racing animals", _Proc Am Acad Arts Sci_ 42(15):275](https://doi.org/10.2307/20022230)
— the original power-law statement, ~75 years before Riegel. Author, year,
venue, volume, issue and opening page verified; ⚠ the closing page (usually
quoted as 331) is **unverified** — Crossref and OpenAlex both record only the
first page.

Blythe & Király (2016),
["Prediction and quantification of individual athletic performance of runners", _PLoS ONE_ 11(6):e0157257](https://doi.org/10.1371/journal.pone.0157257)
— verified. A low-rank decomposition of **164 746 runners and 1 417 432
performances** from the thepowerof10 database, in which **three** parameters per
runner plus three components shared by all runners reproduce the whole
performance curve, and those parameters map onto training state, event
specialisation and age. (An earlier draft of this document called this a
"rank-2" result; the paper's own framing is three parameters per runner.) This
is the strongest modern evidence that a _multi_-parameter personal curve, not a
one-parameter universal exponent, is the right object.

---

## 2. Race-equivalence models

### 2.1 Riegel's endurance formula

```
T2 = T1 × (D2 / D1)^b            b = 1.06   (Riegel's "fatigue factor")
```

Peter Riegel published the exponent form as "Time Predicting" in _Runner's
World_ (August 1977) and then in
["Athletic Records and Human Endurance", _American Scientist_ 69(3):285–290 (1981)](https://www.jstor.org/stable/27850427)
— **verified**: author, title, year, volume, issue and page range all confirmed
(OpenAlex; the paper has ~70 citations). Riegel's own framing is important and
usually lost: he fitted `b` **separately per sport**, over an "endurance range"
of roughly 3.5–230 minutes, and the values sit in the ~1.06–1.08 band. ⚠
**citation unverified for the sport-by-sport exponent table itself** — the 1981
paper is paywalled (JSTOR) and we could not read the table. Secondary summaries
of it name running, swimming and race walking; the wider list (cycling, nordic
skiing) is widely repeated but we could not source it. The number 1.06 is a
_running road-race_ fit to 1970s competition data, not a law of nature.

Rearranged into a pace statement — which is the form you want for prescription:

```
pace2 = pace1 × (D2 / D1)^(b − 1)
```

So at `b = 1.06`, **each doubling of distance costs `2^0.06 − 1 = 4.2 %` of
pace** — about 10 s/km for a 4:00/km runner. At `b = 1.15` it costs 10.9 %.

#### What the exponent actually is

The exponent is not a constant. The direction of the effect is well established
even where the exact coefficients are not:

| Moderator       | Direction                                                                                    | Rough magnitude                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Training status | Slower/less-trained runners have a **higher** `b`                                            | Recreational marathoners fit ~1.10–1.15 vs ~1.05–1.07 for elites ⚠ magnitude unverified |
| Distance range  | `b` rises as `D2/D1` grows                                                                   | The 5k→marathon step (8.4×) is where 1.06 fails; 5k→10k (2×) is fine                    |
| Sex             | Women fit a **lower** `b` than men at marathon distance — better fatigue resistance / pacing | ~0.01–0.02 lower ⚠ magnitude unverified                                                 |
| Weekly volume   | Higher volume lowers `b`                                                                     | Volume, not speed, is the moderator                                                     |

The most-cited modern re-analysis is Vickers & Vertosick (2016),
["An empirical study of race times in recreational endurance runners", _BMC Sports Sci Med Rehabil_ 8:26](https://doi.org/10.1186/s13102-016-0052-y),
**verified** (author, journal, volume, article number 26 and DOI all confirmed).
It fitted race velocity in **2 303 recreational runners** from sex, age, BMI and
**race training** (weekly volume), and reported that the Riegel formula
_underestimates_ marathon finishing time — i.e. real marathons are slower than
Riegel predicts, which is exactly the direction this section assumes. The volume
term carries real signal that Riegel discards entirely: two runners with the
same 5k can have materially different marathons depending on how much they run.
⚠ **citation unverified for the individual regression coefficients** — the paper
and its conclusions were confirmed from the record and abstract, not from the
coefficient table.

**Quantified failure, computed here.** A 20:00 5k runner:

```
b = 1.04   10k 41:07   HM 1:29:24   M 3:03:49
b = 1.06   10k 41:42   HM 1:32:00   M 3:11:49     <- Riegel's published value
b = 1.08   10k 42:17   HM 1:34:42   M 3:20:11
b = 1.10   10k 42:52   HM 1:37:27   M 3:28:54
b = 1.15   10k 44:23   HM 1:44:44   M 3:52:25
```

The 10k spread across the whole plausible exponent range is **3:16 (7.9 %)**.
The marathon spread is **48:36 (26 %)**. That asymmetry is the single most
important number in this document: **race equivalence is a good interpolator
within about a 2–4× distance ratio and a bad one beyond it.**

Practically: predicting `10k pace` from a 5k is safe. Predicting `marathon pace`
from a 5k, for a runner who has never run one, is not — and if the product does
it anyway it must carry a wide band and a low confidence grade.

### 2.2 Daniels' VDOT (Daniels & Gilbert)

VDOT is a "pseudo-VO₂max" that folds aerobic capacity _and_ running economy into
one number. It comes from Jack Daniels and Jimmy Gilbert, _Oxygen Power:
Performance Tables for Distance Runners_ (1979), and is the engine behind every
VDOT calculator.

⚠ **The provenance of the two equations below is genuinely weak, and this is
worth stating plainly rather than papering over.** Daniels and Gilbert's
collaboration on VDOT in the 1970s is well documented, but _Oxygen Power_ itself
is a **self-published booklet of tables** — it is not indexed in Open Library,
OpenAlex, Crossref or the Library of Congress catalogue, and we could not
confirm its publisher, ISBN or even that the printed edition states these
equations in closed form. _Daniels' Running Formula_ (Human Kinetics; 1st ed.
1998, 2nd 2005, 3rd 2013, 4th 2021 — editions verified via Open Library)
publishes the **tables**, not the curves. The two polynomial/exponential fits
below therefore have the status of a **community reverse-engineering of a
published table**: they circulate second-hand through VDOT calculator source
code, they reproduce Daniels' `T`/`I`/`R` columns to a few seconds per kilometre
(see below), and they visibly do _not_ reproduce his `E`/`M` columns. Treat them
as "the curves that fit Daniels' tables", not as "Daniels' published equations".

Two curves. **Oxygen cost of running at velocity `v`** (`v` in metres per
minute, result in ml·kg⁻¹·min⁻¹):

```
VO2(v) = -4.60 + 0.182258·v + 0.000104·v²
```

**The sustainable fraction of VO₂max at duration `t`** (`t` in minutes):

```
%VO2max(t) = 0.8
           + 0.1894393 · e^(-0.012778·t)
           + 0.2989558 · e^(-0.1932605·t)
```

Note the structure: two exponentials with very different time constants (a fast
one, τ ≈ 5.2 min, and a slow one, τ ≈ 78 min) over a floor of 0.80. The floor is
why Daniels never predicts a sustainable fraction below 80 % of VO₂max however
long the race — an assumption that is defensible to ~3 hours and increasingly
optimistic beyond it.

**Forward: race result → VDOT.**

```
v    = distance_m / (time_sec / 60)     # m/min
t    = time_sec / 60                    # min
VDOT = VO2(v) / %VO2max(t)
```

**Inverse: VDOT → equivalent time at another distance.** There is no closed
form; solve numerically for `t` such that `VO2(d/t) / %VO2max(t) = VDOT`
(bisection converges in ~40 iterations; the function is monotone in `t`).

**Inverse: VDOT → training pace.** Pick a target fraction `f`, then invert the
quadratic for velocity:

```
target_VO2 = f · VDOT
v = ( -0.182258 + sqrt(0.182258² - 4·0.000104·(-4.60 - target_VO2)) ) / (2 · 0.000104)
pace_sec_per_km = 60000 / v
```

#### Worked example, computed here — the 20:00 5k runner

```
VDOT = 49.81            (v = 250.0 m/min, t = 20 min)
vVO2max = 260.0 m/min = 3:51/km

Equivalent races                 Riegel b=1.06      delta
  1k   3:28   3:28/km            3:38               -10 s
  3k  11:35   3:52/km           11:38                -3 s
  5k  20:00   4:00/km           20:00                 —
 10k  41:28   4:09/km           41:42               -14 s
  HM 1:31:50  4:21/km          1:32:00              -10 s
   M 3:11:17  4:32/km          3:11:49              -32 s

Training paces by fraction f of VDOT
  f = 0.59   5:53/km      f = 0.88   4:16/km   <- T
  f = 0.66   5:23/km      f = 0.95   4:01/km
  f = 0.74   4:54/km      f = 1.00   3:51/km   <- I
  f = 0.84   4:26/km      f = 1.05   3:42/km   <- R
```

**Riegel@1.06 and Daniels agree to within 32 seconds on a 3-hour-11 marathon.**
They are the same model. Anyone choosing between them on accuracy grounds is
choosing between noise.

The agreement holds across the ability range (computed here):

| 5k time | 10k: Riegel1.06 vs Daniels   | Marathon: Riegel1.06 vs Daniels |
| ------- | ---------------------------- | ------------------------------- |
| 16:00   | 33:22 / 33:13 (**9 s**)      | 2:33:27 / 2:33:26 (**1 s**)     |
| 20:00   | 41:42 / 41:28 (**14 s**)     | 3:11:49 / 3:11:17 (**32 s**)    |
| 25:00   | 52:07 / 51:53 (**14 s**)     | 3:59:47 / 3:57:55 (**1:51**)    |
| 30:00   | 1:02:33 / 1:02:23 (**10 s**) | 4:47:44 / 4:43:39 (**4:05**)    |

Even at the extreme, the two models differ by **1.4 %** on a marathon while the
Riegel exponent uncertainty alone is worth **21 %**. Model choice is irrelevant;
exponent (or, equivalently, the athlete's personal fatigue resistance) is
everything.

#### Reproducing Daniels' published training paces

⚠ Medium confidence. Applying `%VO₂max` fractions and inverting `VO2(v)`
reproduces Daniels' published table for **T, I and R within ~4 s/km** at VDOT
50, but **E and M come out too fast** (computed E at f = 0.74 is 4:54/km; the
published E range for VDOT 50 is nearer 5:14–5:45/km). Daniels' easy and
marathon paces in the book are **not** a pure inversion of the two curves —
there is an additional convention layered on. If the product wants to publish
"Daniels E pace", it should either use Daniels' own table or state plainly that
it is showing a %VDOT-derived approximation. `T`, `I`, `R` are safe to compute.

Documented fractions
([per zones-and-thresholds.md §2.4](zones-and-thresholds.md)): E 59–74 %, M
75–84 %, T 83–88 %, I 95–100 %, R ~105–120 % of VO₂max, with ±3 pp of
edition-to-edition drift.

#### Where VDOT is wrong

VDOT's equivalences assume **one universal fatigue profile** — the `%VO2max(t)`
curve is the same for everybody. That is exactly the assumption the Riegel
exponent literature falsifies: fatigue resistance is individual and trainable,
and it is a further dimension of the velocity-duration curve (Blythe & Király's
three-parameters-per-runner finding, §1.2). A runner with a big aerobic base and
modest speed will beat their VDOT-predicted marathon and miss their
VDOT-predicted 1500; a fast-twitch 5k specialist does the reverse. VDOT
collapses that into one number by construction.

**Do not surface VDOT as VO₂max.** Two runners with identical laboratory VO₂max
can differ by several VDOT points purely on economy.

### 2.3 Critical Speed / Critical Velocity

The two-parameter model, in the distance domain where it is linear:

```
d = CS · t + D′
```

`CS` is in m/s (the asymptotic sustainable speed), `D′` in metres (the finite
distance available above `CS`, the running analogue of `W′`). Velocity form:

```
v(t) = CS + D′ / t
t(d) = (d − D′) / CS
```

Origin: Monod & Scherrer (1965),
["The work capacity of a synergic muscular group", _Ergonomics_ 8(3):329–338](https://doi.org/10.1080/00140136508930810),
for local muscle work; extended to whole-body running by Hughson, Orok & Staudt
(1984),
["A high velocity treadmill running test to assess endurance running potential", _Int J Sports Med_ 5(1):23–25](https://doi.org/10.1055/s-2008-1025875);
the modern canonical review is Jones & Vanhatalo (2017),
["The 'Critical Power' Concept: Applications to Sports Performance with a Focus on Intermittent High-Intensity Exercise", _Sports Med_ 47(Suppl 1):65–78](https://doi.org/10.1007/s40279-017-0688-0).
All three **verified** — authors, year, journal, volume, issue, pages and DOI.
(The French school around Monod — Vandewalle, Vautier and colleagues — carried
the `W = W′ + CP·t` linear model forward from the 1960s into the 1990s; e.g.
Vautier, Vandewalle, Arabi & Monod, "Critical power as an endurance index",
_Appl Ergon_ 26(2):117–121, 1995, doi:10.1016/0003-6870(95)00009-2, verified.
The concept is Monod & Scherrer's; the sports-science popularisation is theirs
and Moritani's.)

**Fitting it.** Two maximal efforts of clearly different duration
(conventionally 2–3 min and 10–15 min) give a two-point line:

```
CS = (d2 − d1) / (t2 − t1)
D′ = d1 − CS · t1
```

Field protocols, both **verified — and the previous draft mis-attributed one of
them**:

- Galbraith, Hopker, Lelliott, Diddams & Passfield (2014),
  ["A single-visit field test of critical speed", _Int J Sports Physiol Perform_ 9(6):931–935](https://doi.org/10.1123/ijspp.2013-0507)
  — three maximal track runs of **3600 m, 2400 m and 1200 m** in one session,
  fitted as a line. It is a _distance_-based test. There is no "Galbraith
  3MT/9MT"; that label was an error.
- Vanhatalo, Doust & Burnley (2007),
  ["Determination of critical power using a 3-min all-out cycling test", _Med Sci Sports Exerc_ 39(3):548–555](https://doi.org/10.1249/mss.0b013e31802dd3e6)
  — the **3-minute all-out test**, where `CP` is the mean power of the final 30
  s and `W′` the work above it. Note it is originally a _cycling_ protocol; the
  running transfer (final-30 s speed → `CS`, distance above → `D′`) is a later
  adaptation, ⚠ not established by this paper.

**Worked example, computed here.** Taking the 20:00-5k runner's
Daniels-equivalent 3k (11:35) and 10k (41:28):

```
CS = (10000 − 3000) / (2488 − 695) = 3.905 m/s = 4:16/km
D′ = 3000 − 3.905 × 695 = 286 m
```

Two things fall out, and both are load-bearing:

1. **`CS` lands on 4:16/km — the same number Daniels' `T` pace gives (f =
   0.88).** Two completely independent models converge on the same threshold.
   That is a strong sanity check and means `CS`, threshold pace, and Daniels `T`
   can be treated as _the same anchor_ in a running product, with the caveat
   that they are constructs measured differently (see
   [zones-and-thresholds.md §3.2](zones-and-thresholds.md) for the CP≠FTP
   version of this warning — the same non-interchangeability applies).
2. **`D′ = 286 m` is a plausible recreational value.** Published ranges are
   roughly 100–300 m; sprint-oriented runners are higher. ⚠ **citation
   unverified** — this range is widely repeated in the critical-speed literature
   but we did not re-read a source reporting the distribution; treat it as a
   sanity-check heuristic, not a published reference interval.

**Race pace as a fraction of CS**, computed for the same runner:

```
5k  pace = 106.7 % CS
10k pace = 102.9 % CS
HM  pace =  98.1 % CS
```

Compare the independently-published running-power anchors
([zones-and-thresholds.md §2.5](zones-and-thresholds.md)): 10 km ≈ 96 % CP, half
≈ 92 % CP. **These are not the same numbers, and they are not supposed to be** —
one is a _speed_ ratio, the other a _power_ ratio, and running power scales
super-linearly with speed. Do not mix a %CS table and a %CP table.

**%CS zone table** for the worked runner (pace ratios, so higher % = faster):

| % CS  | Pace    | Roughly              |
| ----- | ------- | -------------------- |
| 80 %  | 5:20/km | easy / recovery      |
| 85 %  | 5:01/km | endurance            |
| 90 %  | 4:45/km | steady               |
| 95 %  | 4:30/km | tempo / marathon-ish |
| 100 % | 4:16/km | CS = threshold       |
| 105 % | 4:04/km | ~5k pace             |
| 110 % | 3:53/km | VO₂max intervals     |

**Where CS breaks.** `t(d) = (d − D′)/CS` is only valid for `d` well above `D′`
and durations in the ~2–20 min window. Feed it a marathon and it predicts a
marathon at essentially CS pace — for this runner,
`(42195 − 286)/3.905 = 2:58:50`, versus Daniels' 3:11:17. **CS over-predicts the
marathon by 12½ minutes (7 %)**, in exactly the direction §1.2 predicted. Never
use a CS fit for long-distance equivalence.

### 2.4 Cameron, Purdy, and age-grading — briefly

**Cameron's model** (Dave Cameron) is an alternative running predictor with an
explicit "fatigue per mile" function:

```
a(x) = 13.49681 − 0.048865·x + 2.438936 / x^0.7905          x = distance in miles
T2   = (T1 / x1) · (a(x1) / a(x2)) · x2
```

⚠ **citation unverified — and on re-checking, there appears to be no primary
publication at all.** Searches of Crossref, Europe PMC and OpenAlex return
nothing for a Cameron running race-prediction model. The formula circulates as a
1990s internet posting attributed to Dave Cameron and is reproduced verbatim by
third-party calculators; the coefficients above are that widely-reproduced form.
The claim rests on **an unsourced but widely-copied internet formula**, not on
literature. The numbers below were computed here _from_ that form, so they are
arithmetically right and evidentially only as good as it is. Computed for the
20:00 5k runner:

```
  1k  3:22    3k 11:33    10k 41:40    HM 1:31:51    M 3:15:11
```

It agrees with Daniels within ~15 s to the half and predicts a marathon **3:54
slower** — i.e. Cameron applies slightly more long-distance penalty, which is
the correct direction relative to Riegel's known bias, but nowhere near enough
to close the 40-minute exponent gap.

**Purdy points** (Gardner & Purdy, _Computerized Running Training Programs_,
Tafnews Press, 1970) are a _scoring_ system rather than an equivalence model: a
table of "world-class" times per distance, with a linear scale placing any
performance on a points axis. Equivalence falls out as "same points at another
distance". Because it is table-driven rather than parametric, it inherits
whatever fatigue profile the reference table encodes. The book is **verified to
exist** — Open Library records "Computerized running training programs", 1970,
Tafnews Press (the Track & Field News imprint; the earlier draft's "Track &
Field News Press" was slightly wrong), catalogued under James B. Gardner, with
J. Gerry Purdy conventionally credited as co-author. ⚠ **The contents are
unverified**: we did not see the reference table or the scoring scale, so any
specific Purdy number should be recomputed from an implementation, not quoted
from here.

**WAVA / WMA age-grading** is orthogonal but shares the machinery: an
age-and-sex factor table converts a performance into a percentage of the
open-class world standard for that distance. It answers "how good is this,
adjusted for age", not "what could you run at another distance". Relevant here
only because it is the same shape of thing: a **named, portable, table-driven
normalisation**, and if a product ships one it should version the table exactly
as it versions zone recipes.

Edition history, **corrected** (an earlier draft invented "2015 / 2020 / 2025"
editions, which do not exist): the tables were first compiled by WAVA and
published by _National Masters News_ in **1989**, then revised in **1991**,
**1994**, **2006**, **2010**, **2014** (minor) and **2023** (major, effective 1
January 2023). World Masters Athletics currently publishes "WMA Age Factors
(2023)" as the live document. That the revision cadence is irregular is itself
the argument for versioning the table rather than hard-coding it.

### 2.5 How much the models disagree — the summary table

For the 20:00 5k runner, computed here:

| Distance | Riegel 1.06 | Daniels | Cameron | CS fit    | Riegel 1.15 | **Spread**       |
| -------- | ----------- | ------- | ------- | --------- | ----------- | ---------------- |
| 1 km     | 3:38        | 3:28    | 3:22    | 3:03 ‡    | 3:09        | 35 s (**19 %**)  |
| 3 km     | 11:38       | 11:35   | 11:33   | 11:35 †   | 11:07       | 31 s (4.6 %)     |
| 10 km    | 41:42       | 41:28   | 41:40   | 41:28 †   | 44:23       | 2:55 (**7.0 %**) |
| Half     | 1:32:00     | 1:31:50 | 1:31:51 | 1:28:49 ‡ | 1:44:44     | 15:55 (**18 %**) |
| Marathon | 3:11:49     | 3:11:17 | 3:15:11 | 2:58:50 ‡ | 3:52:25     | 53:35 (**30 %**) |

† inside the CS fit's own calibration range (the fit was made from these two
points), so trivially consistent. ‡ **outside** it — and the errors are large
and in opposite directions: CS is 25 s too fast at 1 km because the hyperbola
has no `Pmax` ceiling, and 12½ min too fast at the marathon because it has no
long-duration droop. Both are §1.2's structural warning made numeric.

**The rule this table implies, and the one the product should encode:**

```
distance_ratio = target_distance / source_distance

ratio ≤ 2      -> high confidence     (±1-2 %)
2 < ratio ≤ 4  -> medium confidence   (±3-5 %)
ratio > 4      -> low confidence      (±10-20 %), and say so
```

---

## 3. The same problem in other sports

### 3.1 Cycling — % FTP and the named power duration

Cycling solved this first and most cleanly, and the reason is instructive:
**power is already normalised.** A watt is a watt regardless of gradient, wind,
mass, or bike, so an absolute number is _nearly_ portable already — it just
isn't comparable between athletes. Two normalisations are used:

- **% FTP** — the near-universal prescription anchor.
  `Intensity Factor = NP / FTP` and `TSS = IF² × hours × 100` both key off it,
  which means the same ratio that prescribes a target also prices its load. This
  coupling is why the cycling vocabulary is so stable.
- **W/kg at a named duration** — the "power profile": 5 s, 1 min, 5 min, and
  functional-threshold power, each expressed per kilogram and placed against a
  population table from untrained to world class, separately for men and women.
  The table is Coggan's, published in Allen, Coggan & McGregor, _Training and
  Racing with a Power Meter_ (VeloPress; 1st ed. 2006, 2nd 2010, 3rd 2019 — book
  and editions verified via Open Library). ⚠ **The specific W/kg cell values are
  unverified** — they are behind a book, not a DOI, and several slightly
  different renderings circulate online. Its purpose is _comparison and
  phenotype identification_ (sprinter vs time-triallist vs all-rounder), not
  prescription — which is a distinction worth preserving.

Named-duration anchors (`5 min power`, `20 min power`) are cycling's direct
equivalent of `5k pace`, and they carry exactly the same defect:
**`20 min power` is a different physiological intensity for a rider with a large
`W′` than for one with a small one.** The published 0.95 haircut from a
20-minute test to FTP is a population average whose error _is_ the individual
`W′` variation ([zones-and-thresholds.md §3.1](zones-and-thresholds.md)).

`eFTP` / modelled FTP — fitting `P(t) = CP + W′/t` over a rolling 90-day
mean-maximal curve — is cycling's answer to §6 of this document, and it works
because riders produce near-maximal 2–20 min efforts incidentally, in races and
on climbs. Runners produce them far less often.

### 3.2 Swimming — CSS and the per-100 m anchor

Swimming's portable unit is **seconds per 100 m**, and its anchor is **Critical
Swim Speed** — the swimming instance of §2.3:

```
CSS (m/s)            = (400 − 200) / (T400 − T200)
CSS (s per 100 m)    = (T400 − T200) / 2
```

Worked: 400 m in 6:00 and 200 m in 2:50 gives `CSS = 1.053 m/s = 1:35/100 m`.

Origin Wakayoshi, Ikuta, Yoshida, Udo, Moritani, Mutoh & Miyashita (1992),
["Determination and validity of critical velocity as an index of swimming performance in the competitive swimmer", _Eur J Appl Physiol Occup Physiol_ 64(2):153–157](https://doi.org/10.1007/BF00717953)
— **verified** (full author list, journal, volume, issue, pages, DOI); see also
the same group's "A simple method for determining critical speed as swimming
fatigue threshold in competitive swimming", _Int J Sports Med_ 13(5):367–371,
doi:10.1055/s-2007-1021282, verified. Popularised for coaches by **Enid M.
Ginn** (1993), whose work on this is a University of Queensland PhD thesis,
_Critical speed: the adaptation of the critical power method to swimming and
swim training prescription_, doi:10.14264/ce2d801 — verified to exist; ⚠ the
attribution of the specific "400/200 minus" simplification to Ginn rather than
to Wakayoshi's group is a **coaching-literature convention we could not source
to either document**. Note this is a two-point `d = CS·t + D′` fit with the
distance term discarded — the same machinery as running CS, in a sport where the
two-trial protocol is easy to run in a pool.

The **T-30** protocol (associated with Bill Sweetenham) is the alternative: swim
30 minutes continuously at maximal sustainable effort; threshold pace is the
average per-100 m. The likely source is Sweetenham & Atkinson, _Championship
Swim Training_, Human Kinetics, 2003 — **the book is verified** (title, both
authors, publisher, year). ⚠ **The attribution of T-30 to it is unverified**: we
did not see the protocol in the text, and the claim currently rests on
**widely-repeated swim-coaching convention**. T-30 is closer to a true 30-minute
sustainable pace; CSS from 400/200 is an asymptote fit. They give different
numbers, so the _protocol_ has to be recorded — same finding as
[zones-and-thresholds.md §3.1](zones-and-thresholds.md) for FTP.

**The additive-offset trap.** Swim coaching conventionally prescribes as
`CSS + 10 s /100 m`, `CSS − 3 s /100 m`. This is _scale-dependent_: `+10 s` on a
1:10/100 m CSS is a 14 % pace change; on a 2:00/100 m CSS it is 8.3 %. The
[zones-and-thresholds.md §2.9](zones-and-thresholds.md) finding that the
additive and multiplicative swim tables disagree materially about easy swimming
is exactly this effect. **Store the ratio; render the offset if coaches want to
read it that way.**

### 3.3 Rowing — the 2k split, and why it's the strongest precedent

Rowing is the best-developed portable-anchor culture in endurance sport, and
worth copying structurally.

**The anchor is the 2000 m split** — average seconds per 500 m in a maximal 2 km
erg test. Everything is prescribed relative to it. A rower who says "UT2, 2k
split plus 22" is understood identically by every coach in the sport, and the
statement resolves to a different absolute split for every athlete. That is the
exact property this document is chasing.

**Split ↔ watts.** Concept2's ergometer defines:

```
watts = 2.80 / pace³              pace in seconds per metre
pace  = (2.80 / watts)^(1/3)      then × 500 for a /500 m split
```

**Verified**: Concept2's own
[watts calculator page](https://www.concept2.com/indoor-rowers/training/calculators/watts-calculator)
states the relation as `watts = 2.80 / pace³` with pace in seconds per metre.
The constant is published, not folklore, and it reproduces the machine's display
exactly.

**Why this matters more than it looks.** Power goes as the **cube** of speed on
an erg, so an additive split band is a wildly non-linear power band. Computed
here for a 1:45 2k split (302 W):

| Band | Published offset   | Split     | % of 2k power |
| ---- | ------------------ | --------- | ------------- |
| UT2  | 2k + 20–24 s       | 2:09–2:05 | **54–59 %**   |
| UT1  | 2k + 14–18 s       | 2:03–1:59 | **62–69 %**   |
| AT   | 2k + 8–12 s        | 1:57–1:53 | **72–80 %**   |
| TR   | 2k + 4–6 s         | 1:51–1:49 | **85–89 %**   |
| AN   | 2k split or faster | ≤ 1:45    | **≥ 100 %**   |

⚠ **citation unverified for the exact offsets.** The UT2/UT1/AT/TR/AN band
system is real and universal in rowing, but the `2k split + N s` offsets are a
**coaching convention that circulates in several slightly different renderings**
(British Rowing, USRowing, individual club programmes) rather than a single
published table we could point at. The _structure_ is solid and the power
conversion below is arithmetic.

Two lessons:

1. **The rowing bands land almost exactly on the cycling %FTP table** — UT2 at
   54–59 % is Coggan Z1/Z2, AT at 72–80 % is tempo, TR at 85–89 % is
   sub-threshold. Independently derived, same physiology, and a good cross-check
   that a %-of-threshold vocabulary is universal.
2. **For a slower rower, the same additive offsets produce a different
   fractional intensity.** A 2:15 2k split (137 W) with `+22 s` gives 2:37 = 87
   W = 64 % of 2k power, not 56 %. **The novice rower's "easy" is proportionally
   harder than the elite's.** This is a real, quantified, published-convention
   bug, and the fix is to store ratios.

**Paul's Law** (Paul Smith) is rowing's Riegel: _doubling the distance adds
about 5 seconds to the 500 m split._ In ratio terms that is not a fixed
percentage — it is an additive rule with the same scale-dependence problem — but
it is remarkably serviceable. Computed from a 1:45 2k:

```
  500 m  1:35   (135 % of 2k power)
 1000 m  1:40   (116 %)
 2000 m  1:45   (100 %)
 4000 m  1:50   ( 87 %)
 8000 m  1:55   ( 76 %)
```

⚠ **citation unverified — and there is no primary publication to find.** "Paul's
Law" is an **oral coaching heuristic** attributed to Paul Smith; the claim rests
on that, plus the fact that it happens to agree with Riegel (below). Compare
Riegel: at `b = 1.06`, 2k→4k costs 4.2 % of pace; Paul's Law costs 4.8 %. **They
agree to within a percentage point.** Two sports, two independent coaching
traditions, the same fatigue curve.

**Weight adjustment.** Concept2 publishes a factor for comparing erg scores
across body masses (heavier rowers move more mass but the erg does not know it):
`factor = (weight_kg / 122.47)^0.222`, applied to the score. **Verified**:
Concept2's
[weight-adjustment calculator page](https://www.concept2.com/indoor-rowers/training/calculators/weight-adjustment-calculator)
publishes it in pounds as `Wf = (body weight in lb / 270)^0.222`, with
`corrected time = Wf × actual time` — and 270 lb is 122.47 kg, so the metric
form above is exactly equivalent. Relevant here only as a reminder that a
"portable" anchor sometimes needs a second normalisation axis.

### 3.4 Cross-country skiing

Skiing has the weakest portable-anchor vocabulary of the five, for a structural
reason: **terrain and technique dominate speed**, so pace is not portable even
within one athlete's own training, and there is no widely-adopted ski power
meter. The field therefore anchors on **physiology, not performance**:
Olympiatoppen's I-1…I-5 %HRmax scale
([zones-and-thresholds.md §2.7](zones-and-thresholds.md)) plus blood lactate at
the top end, with the scale's own text recommending each athlete build a
**modified, sport-specific** version.

Roller-ski double-poling ergometry gives a power anchor in the lab, and some
programmes use a **flat-terrain time trial** or a **standard uphill** as a
repeatable reference — which is a _course-specific_ anchor, portable across
sessions for one athlete but not across athletes.

**Design consequence: not every discipline can carry a performance anchor, and a
product must not pretend otherwise.** For skiing (and for trail running, which
has the same problem), the honest anchor is HR or RPE, and the target vocabulary
must degrade gracefully to those.

### 3.5 Cross-sport comparison

| Sport     | Primary portable anchor | Secondary         | Named-performance anchor           | Additive convention?        |
| --------- | ----------------------- | ----------------- | ---------------------------------- | --------------------------- |
| Cycling   | % FTP                   | % LTHR            | 5 s / 1 min / 5 min / 20 min power | No — ratios throughout      |
| Running   | % threshold pace / % CS | % LTHR, % CP(run) | 1k / 3k / 5k / 10k / HM / M pace   | No                          |
| Swimming  | % CSS                   | —                 | 100 m / 400 m pace                 | **Yes** — `CSS ± N s/100 m` |
| Rowing    | 2k split                | watts             | 500 m / 2k / 5k / 6k split         | **Yes** — `2k split + N s`  |
| XC skiing | % HRmax (I-zones)       | lactate, RPE      | — (course-relative only)           | n/a                         |

The three that got it right store a **ratio**. The two that use additive offsets
have a latent ability-dependence bug. Store ratios.

---

## 4. A unified target vocabulary

### 4.1 The union

Six variants. The design pressure that produces exactly six: an athlete or a
coach must be able to say _any_ of "hold 250 watts", "hold 90 % of threshold",
"hold zone 3", "hold 10k pace", "hold RPE 7", or "just run".

```ts
/** The metric a target is expressed in. Determines the unit and the direction. */
type Metric = 'pace' | 'speed' | 'power' | 'hr' | 'split' | 'cadence'

/** A named threshold an athlete's profile may hold. Extends ZoneAnchor. */
type ThresholdRef =
	| 'ftp' // bike power
	| 'runPower' // running critical power
	| 'criticalSpeed' // running CS / threshold pace, as a speed
	| 'thresholdPace' // running threshold pace
	| 'css' // swim critical swim speed
	| 'lthr'
	| 'maxHr'
	| 'hrReserve' // Karvonen: needs maxHr AND restingHr
	| 'twoKSplit' // rowing
	| 'lt1' // aerobic threshold — currently unmodelled

/**
 * A named race-equivalent anchor. Deliberately *not* a free distance:
 * an enumerated set keeps the vocabulary shared, keeps the UI a picker,
 * and stops "3.7k pace" appearing in a plan.
 */
type RaceAnchor =
	| {
			discipline: 'run'
			event:
				| '400m'
				| '800m'
				| '1500m'
				| '1k'
				| '3k'
				| '5k'
				| '10k'
				| 'halfMarathon'
				| 'marathon'
	  }
	| { discipline: 'swim'; event: '100m' | '200m' | '400m' | '800m' | '1500m' }
	| { discipline: 'row'; event: '500m' | '1k' | '2k' | '5k' | '6k' | '10k' }
	| { discipline: 'bike'; event: '5min' | '20min' | '40k' | '1hour' }

/** A target may be a point or a band. A point is a band of zero width. */
type Band = { min: number; max?: number }

type IntensityTarget =
	/** 1. An absolute number in a metric. The only variant that is already resolved. */
	| { kind: 'absolute'; metric: Metric; band: Band }

	/** 2. A fraction of a named threshold. `band` is in ratio units (0.90 = 90 %). */
	| { kind: 'pctThreshold'; ref: ThresholdRef; band: Band }

	/** 3. A band of the athlete's chosen Zone Recipe, by that recipe's own label. */
	| { kind: 'zone'; label: string }

	/**
	 * 4. A named race-equivalent pace/split. `adjust` lets a coach say
	 * "10k pace minus 2 s/km" without leaving the portable vocabulary;
	 * it is a *ratio*, never seconds, for the §3.3 reason.
	 */
	| { kind: 'raceEquivalent'; anchor: RaceAnchor; adjustRatio?: number }

	/** 5. Perceived exertion. Never resolves to a metric — by design, not by failure. */
	| { kind: 'rpe'; scale: 'borg6to20' | 'cr10'; band: Band }

	/** 6. Explicitly unprescribed. Distinct from "no target authored". */
	| { kind: 'open'; note?: string }
```

Three deliberate choices worth defending:

- **`zone` carries only a label, not a ratio.** The ratio lives in the recipe,
  which is versioned code. This is already the repo's position and it is right.
- **`raceEquivalent.adjustRatio` is a ratio, not seconds.** §3.2 and §3.3.
- **`open` exists and is not `null`.** "The coach deliberately left this
  unprescribed" and "nobody has filled this in yet" are different states and the
  UI should render them differently.

### 4.2 What each resolves to, and how each fails

| Variant          | Needs                                       | Resolves via                                    | Fails when                              | Fallback                                     |
| ---------------- | ------------------------------------------- | ----------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| `absolute`       | nothing                                     | identity                                        | never                                   | —                                            |
| `pctThreshold`   | that threshold, dated                       | `value = threshold × ratio` (inverted for pace) | threshold absent or stale               | show the ratio verbatim: "90 % of threshold" |
| `zone`           | recipe + its anchor threshold               | recipe band ratios × anchor                     | no recipe chosen, or anchor absent      | show the Training Zone + caption             |
| `raceEquivalent` | a performance model + ≥1 anchor performance | §4.3 ladder                                     | no race history and no usable MMS curve | show the anchor name only: "10k pace"        |
| `rpe`            | nothing                                     | identity (no metric)                            | never                                   | —                                            |
| `open`           | nothing                                     | identity                                        | never                                   | —                                            |

**The key asymmetry: `rpe` and `open` are the only two that cannot fail.** That
is why the degradation ladder must terminate there, and why a plan generator
should be _allowed_ to emit them rather than being forced to fabricate a number.
This generalises the repo's Unavailable Metric principle: an unresolvable target
still says something true.

### 4.3 Resolving `raceEquivalent` — the anchor ladder

```
resolveRaceEquivalent(anchor, athlete, asOf):

  # Rung 1 - the athlete actually did it, recently
  best = mostRecentResult(athlete, anchor.event, within = 365 days)
  if best: return { value: paceOf(best), via: 'actual-result',
                    confidence: recency(best) < 90d ? 'high' : 'medium' }

  # Rung 2 - the athlete did a *different* race; convert
  src = bestRecentResult(athlete, anyEvent, within = 365 days)
  if src:
      value = equivalencePace(src, anchor.event, athlete.fatigueExponent ?? 1.06)
      ratio = distance(anchor.event) / distance(src.event)
      return { value, via: 'race-equivalence',
               confidence: ratio <= 2 ? 'high' : ratio <= 4 ? 'medium' : 'low',
               band: widthFor(ratio) }

  # Rung 3 - derive from a stored threshold
  #   Threshold pace / CS *is* a point on the same curve: it is the
  #   ~30-60 min performance. Treat it as a virtual race result.
  th = threshold(athlete, discipline, asOf)
  if th: return { value: equivalenceFromThreshold(th, anchor.event),
                  via: 'threshold', confidence: 'medium' }

  # Rung 4 - fit the mean-maximal curve (Section 6)
  fit = criticalSpeedFit(athlete, window = 90 days)
  if fit and fit.coverage >= 3 and fit.r2 >= 0.95:
      return { value: paceFromCS(fit, anchor.event),
               via: 'mms-curve',
               confidence: fit.maximality == 'likely' ? 'medium' : 'low' }

  # Rung 5 - nothing truthful to say
  return { unavailable: 'No race result or threshold to anchor this pace' }
```

Note rung 3's move: **a threshold is just another point on the velocity–duration
curve.** Threshold pace ≈ the 60-minute performance, CS ≈ the 30–40-minute
performance, CSS ≈ the 20–30-minute performance. Treating them as virtual race
results unifies the two model families and means a product with _only_ a
threshold can still render "≈ 5k pace" honestly, with a medium grade.

### 4.4 Full resolution algorithm

```
resolve(target, athlete, asOf) -> Resolution:

  switch target.kind:

    case 'absolute':
      return ok(target.band, via='authored', confidence='high')

    case 'rpe':
      return ok(target.band, metric='rpe', via='authored', confidence='high')

    case 'open':
      return ok(null, via='authored', confidence='high')

    case 'pctThreshold':
      th = thresholdAsOf(athlete, target.ref, asOf)      # effective-dated read
      if th == null:
          return unavailable("${label(target.ref)} is not set")
      if isPaceLike(th.metric):
          # pace is inverse to intensity: 90 % intensity = 1/0.90 pace ratio
          value = { min: th.value / target.band.max, max: th.value / target.band.min }
      else:
          value = { min: th.value * target.band.min, max: th.value * target.band.max }
      return ok(value, via='threshold',
                confidence: th.stale ? 'low' : gradeOf(th.protocol),
                anchorSnapshot: { ref, value: th.value, protocol: th.protocol,
                                  effectiveAt: th.effectiveAt })

    case 'zone':
      recipe = recipeAsOf(athlete, discipline, asOf)
      if recipe == null: return unavailable("No zone system chosen")
      band = override(athlete, recipe, target.label) ?? recipe.bandFor(target.label)
      if band == null: return unavailable("Zone ${label} not in ${recipe.id}")
      # A zone is exactly a pctThreshold in disguise. Delegate; do not duplicate.
      return resolve({ kind: 'pctThreshold', ref: recipe.anchor,
                       band: { min: band.minRatio, max: band.maxRatio } },
                     athlete, asOf)
              .withZone(band.zone).withRecipe(recipe.id)

    case 'raceEquivalent':
      r = resolveRaceEquivalent(target.anchor, athlete, asOf)     # Section 4.3
      if r.unavailable: return r
      value = target.adjustRatio ? scalePace(r.value, target.adjustRatio) : r.value
      return ok(value, via=r.via, confidence=r.confidence,
                anchorSnapshot: r.snapshot)
```

The `zone → pctThreshold` delegation is the important line. A zone band _is_ a
percentage of a threshold; expressing that in the code rather than in a comment
removes an entire class of drift between the two paths. The current
`resolveIntensity` has them as parallel switch arms.

### 4.5 The `Resolution` record

```ts
type Confidence = 'high' | 'medium' | 'low'

type Resolution =
	| {
			status: 'resolved'
			metric: Metric | 'rpe' | null // null for `open`
			band: Band | null
			/** How the number was arrived at. Drives the UI's explanatory line. */
			via:
				| 'authored'
				| 'threshold'
				| 'actual-result'
				| 'race-equivalence'
				| 'mms-curve'
			confidence: Confidence
			/** Everything needed to reproduce this number later. */
			anchorSnapshot?: {
				ref: ThresholdRef | RaceAnchor
				value: number
				protocol?: string // 'tt60' | 'ftp20' | 'cp-fit' | 'race' | ...
				effectiveAt: string
				recipeId?: string
			}
			resolvedAt: string
	  }
	| { status: 'unavailable'; reason: string; whatWouldFixIt: string }
```

`whatWouldFixIt` is not decoration. "LTHR is not set" is a dead end; "Set your
threshold heart rate, or run a 30-minute time trial" is an action. Every
unavailable path in §4.2 has a known remedy and should carry it.

---

## 5. Resolution timing and provenance

### 5.1 Freeze or re-resolve? Both — but they are different objects

This is the question the topic brief flags as mattering most, and the answer is
that "the resolved number" is not one thing:

| Object                                                    | Timing                                                  | Why                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **The prescription** (`IntensityTarget`)                  | authored once, immutable until edited                   | It is what the coach meant. `5k pace` does not become `4:00/km`; it stays `5k pace`.                                  |
| **The forward-looking display** for a _scheduled_ session | **re-resolved at view time**                            | The athlete's 5k pace moved in week 8 of a 16-week plan. Showing them week 1's number is showing them a stale target. |
| **The execution stamp** for a _completed_ session         | **frozen at the moment the session moves to completed** | This is what they were told to run. It is history, and history is immutable.                                          |
| **The comparison baseline** in analysis                   | the execution stamp                                     | Adherence must be judged against what was asked at the time, not against a target retro-fitted to today's fitness.    |

The failure mode of freeze-only: an athlete improves mid-plan, and every
remaining session is prescribed off their week-1 fitness — a 16-week plan
becomes progressively easier. The failure mode of re-resolve-only: the athlete
raises their FTP and last month's threshold session retroactively becomes a
tempo session, and the adherence chart rewrites itself. Both are real, both are
trust-destroying, and they are avoided by **different** mechanisms, not one
compromise.

There is a third position worth naming and rejecting: **re-resolve everything at
read time against an effective-dated log**. It is correct in principle —
`SELECT` the threshold in force at the session's date — but it makes every read
a temporal join, it cannot survive a _correction_ (the athlete typed 260 and
meant 250) without a rewrite anyway, and it still cannot reconstruct which zone
recipe was selected unless that too is effective-dated. The materialise-at-
transition approach gets the same correctness with cheap reads, at the cost of
an explicit backfill when a correction happens — which is a feature, because
that backfill is exactly the moment the athlete should be told their numbers
moved.

### 5.2 The threshold-drift trigger

When a threshold changes, forward-looking resolutions change silently. Three
policies, and only one is honest:

1. **Silent re-resolve.** Wrong: the athlete's Thursday session changed pace
   overnight and nothing said so.
2. **Ask before applying.** Wrong for a different reason: it makes the athlete
   an approver of arithmetic they did not author, and the default answer is
   always yes.
3. **Apply, then notify** — a one-line notice on the affected sessions: _"Your
   threshold pace changed on 12 Aug; upcoming targets moved with it."_ This is
   the repo's existing **Load Recompute Notice** pattern applied to prescription
   instead of load. Recommended.

The rule generalises: **a recompute is announced, never offered.**

### 5.3 The UI: show both names

A target has two truthful renderings and the UI should carry both:

```
  10k pace  ≈ 4:09/km for you
  ─────────  ──────────────────
  portable    resolved, with a hedge
```

Concretely, in the repo's Token Sentence vocabulary:

```
6 × 1 km @ 10k pace (≈ 4:09/km) · Z4   (2 min jog)
```

Rules:

- **The portable name is the primary text; the number is the facet.** Reversed,
  the athlete learns nothing transferable and the target looks like it was
  authored in absolute units.
- **Use `≈` whenever `via != 'authored'`.** The tilde carries the epistemic
  status at zero UI cost, and its absence is then meaningful.
- **A low-confidence resolution renders a band, not a point.** `≈ 4:05–4:15/km`
  is honest where `≈ 4:09/km` implies a precision the model does not have. Band
  width from the §2.5 ratio rule.
- **`via` is available on hover / long-press**, not always-on: _"From your 5k on
  3 May, converted."_ / _"Estimated from your training, not a race."_
- **Never render a resolved number with no name.** If the athlete only ever sees
  `4:09/km`, they cannot carry the target to a treadmill, a hilly route, or a
  hot day.

### 5.4 Confidence when the anchor is estimated

Grade the resolution, not the athlete. The observable inputs:

| Signal                | High                                   | Medium                                | Low                                                     |
| --------------------- | -------------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| Source                | actual race result                     | converted race, or protocol threshold | curve fit / inferred                                    |
| Recency               | < 90 days                              | 90–365 days                           | > 365 days, or "stale"                                  |
| Distance ratio (§2.5) | ≤ 2                                    | 2–4                                   | > 4                                                     |
| Curve coverage        | ≥ 5 durations, r² ≥ 0.99               | 3–4 durations                         | 2 points and a line                                     |
| Maximality            | HR near max, positive-split, sustained | ambiguous                             | steady effort that merely happens to be the window best |

Take the **minimum** across signals — confidence is a weakest-link property, not
an average. This reuses the repo's existing Detection Confidence vocabulary
(high / medium / low, ADR 0033) rather than inventing a second scale, and it
must never become a gate: a low-confidence target still renders, badged.

---

## 6. Deriving anchors without a race

### 6.1 The pipeline

```
1. Build the mean-maximal SPEED curve from run activities (§1.1).
   Durations: 60, 120, 300, 600, 900, 1200, 1800, 3600 s.
   Equivalent and often better for running: the mean-maximal DISTANCE curve.

2. Roll over a 90-day window; take the per-duration max.

3. Isotonic-repair for monotonicity (pool-adjacent-violators, non-increasing).

4. Fit d = CS·t + D' by least squares over the 2-20 min durations only.
   Report CS, D', r^2, and n (how many durations had a supporting effort).

5. Sanity-gate before publishing:
     - CS must be slower than the best 5 min speed and faster than the
       best 60 min speed. If not, the fit is junk - reject, do not clamp.
     - D' in [50, 500] m. Outside that, reject.
     - n >= 3 for medium confidence, n >= 5 for high.

6. Convert to race equivalents via §4.3 rung 4 - and cap at 'medium'.
```

### 6.2 How much to trust it

Less than the equivalent cycling pipeline, and the reasons are specific:

- **Runners rarely produce maximal short efforts incidentally.** A cyclist hits
  near-maximal 5-minute power on any climb; a runner in an easy week produces
  nothing near their curve. The 90-day window is far more likely to be
  unpopulated for running.
- **The window best is not the maximal effort.** A steady 20-minute tempo can be
  the best 20-minute segment in the window while sitting well below the
  athlete's true 20-minute capacity. This **systematically under-estimates CS**,
  unlike random noise, which averages out. This is the single largest source of
  error.
- **GPS pace is noisy and terrain-dependent.** A 1-minute "best speed" from a
  downhill or a GPS glitch is not a performance. Grade-adjust before building
  the curve (NGP or GOVSS; see
  [zones-and-thresholds.md §3.4](zones-and-thresholds.md)) and reject segments
  above a gradient threshold.
- **Interval sessions break the curve.** The best 20 minutes of a `6 × 1 km`
  session includes the recoveries, so its mean speed understates both the
  interval pace and the athlete's continuous 20-minute capacity. Fitting to
  _continuous_ segments only is better but throws away most run data; fitting to
  the whole session biases low.

The honest posture: **a curve-fit anchor is a starting point that gets the
athlete training, and a prompt to run a test — not a substitute for one.** Cap
its confidence at `medium`, badge it, and surface "your last supported effort
was N days ago". Per [zones-and-thresholds.md §4.5](zones-and-thresholds.md), do
**not** decay it on an invented curve when it goes stale; freeze and flag.

### 6.3 The cheap alternative nobody does

The most reliable non-race anchor is not a curve fit; it is **a
deliberately-scheduled repeatable effort**. A 3 km time trial or a 20-minute
tempo on the same route, prescribed every 6–8 weeks, produces exactly the two
points §2.3 needs, on a known course, with known maximality. That is a _product_
answer to a modelling problem, and it is better than the modelling answer.

It also composes with everything above: the time trial is an `Event` of
`kind: 'time-trial'` — a concept the repo already has — and its result is a real
performance, so it enters §4.3 at **rung 1**, not rung 4.

---

## 7. Implications for trainm8

Read against `CONTEXT.md`, `docs/adr/0005-athlete-profile-and-thresholds.md`,
`docs/adr/0007-step-as-discriminated-union.md`,
`docs/adr/0027-text-first-workout-authoring.md`, `app/utils/zones/`,
`app/utils/intensity-target.ts`, `app/utils/workout-notation.ts`, and
`prisma/schema.prisma`.

**The design the evidence supports, in one paragraph.** The prescription is a
portable _name_, never a number — a fraction of a named threshold, a recipe
band, or a named race-equivalent — and the number is a _resolution_, computed on
demand, carrying `via` and `confidence` and the snapshot needed to reproduce it.
Race-equivalence is a legitimate and well-founded anchor family (§2), so ADR
0027's assumption A2 needs **widening, not retiring**: read in full, A2 says "No
truthful race-pace model exists (no race-pace reference on the athlete; Daniels
M/T are the closest anchors)" — the parenthetical scopes the sentence to _this
repo's data_, not to the exercise-science literature, and on that reading A2 was
correct and its conclusion (reserve the `equivalent` facet, ship nothing) was
the right call at the time. What this document adds is that the gap is closable:
the missing thing is _performance history_, a data gap rather than a science
gap, and §4.3's ladder resolves a race pace from a stored threshold at medium
confidence even before that history exists — which is honest, not fabricated,
and is the assumption A2 should be amended to allow. Because the athlete's 5k
pace moves mid-plan, the resolution is re-run at view time for scheduled
sessions and frozen at completion for history, which is two stamps rather than
the current one. And every additive offset the domain hands us — swim's
`CSS + 10 s`, rowing's `2k + 22 s` — becomes a ratio before it is stored,
because additive offsets are ability-dependent by construction (§3.2, §3.3).

### 7.1 What already lines up

- **`IntensityTarget` as a discriminated union** (ADR 0007). Exactly right, and
  §4.1 is an extension of it, not a replacement. The `kind` discriminator is the
  correct axis.
- **Unavailable Metric over a fabricated number.** §4.2's "five of six variants
  can fail" is the same principle, generalised — and it produces the useful
  corollary that `rpe` and `open` are the honest floor of the degradation
  ladder.
- **The reserved `equivalent` facet slot** in `workout-notation.ts`
  (`facets.equivalent`, always `null`, ADR 0027 A2). The slot is in the right
  place and §5.3 is what goes in it — but it should carry the _portable name_
  when the target is metric-authored, and the _number_ when the target is
  race-authored. It is a two-way bridge, not a one-way one.
- **`Event.kind: 'time-trial'`** already exists. §6.3 makes it the recommended
  route to a trustworthy anchor, which means it earns product weight it
  currently does not have.
- **Recipes as versioned code constants** (ADR 0006). §4.4's
  `zone → pctThreshold` delegation depends on the recipe being a stable table,
  and it is.
- **`daniels-pace-5`'s pace-ratio direction and its `R`-has-no-zone rule.**
  Verified against the Daniels–Gilbert inversion here: the recipe's `T` band at
  ratio 1.00–1.14 and `I` at 0.88–0.99 reproduce computed `T` (4:16/km) and `I`
  (3:51/km) for a VDOT-50 runner correctly.

### 7.2 Gaps, in priority order

1. **There is no performance history table, so `raceEquivalent` cannot resolve
   at rung 1 or 2.** `Event` holds a _planned_ target and an optional
   `resultSessionId`; there is no queryable "athlete's best 5k" anywhere. This
   is the single blocker for the whole feature. The fix is small: a
   `PerformanceResult` row
   (`athleteProfileId, discipline, distanceM, timeSec, occurredAt, source: 'race'|'timeTrial'|'trainingSegment', verified: bool`),
   populated from completed `Event`s at rung 1 and from activity personal-bests
   at rung 4. Note this also needs `ActivityStream` to carry a **distance
   channel**, which [README.md defect 4](README.md) already flags as missing —
   so the two should ship together.

2. **`IntensityTarget` has no `raceEquivalent` variant and no `open` variant.**
   Both are additive to the Zod union in `app/utils/workout-schema.ts` and to
   `resolveIntensity`. `raceEquivalent` is the headline feature; `open` is a
   one-line change that removes a real ambiguity (`intensity: undefined`
   currently means both "unprescribed" and "not filled in").

3. **`resolveIntensity` returns a bare `ResolvedIntensity` with no provenance.**
   It cannot say _how_ it got the number, so the UI cannot render `≈`, cannot
   show a confidence badge, and cannot explain itself. §4.5's `Resolution`
   record is the shape. This is a bigger change than it looks because
   `intensityHrMin/Max` etc. are flat columns on `WorkoutStep` with nowhere to
   put `via`.

4. **The resolution is frozen once, at save, and never re-run.** ADR 0007's
   consequence "resolved ranges are recomputed by a background job when athlete
   thresholds change" describes re-resolution of _everything_, which is the
   wrong rule per §5.1: scheduled sessions should re-resolve, completed ones
   must not. Split the two: keep the baked columns as the **execution stamp**
   (written when a session transitions to completed), and resolve **scheduled**
   sessions at read time.

5. **The `zone` and `pctThreshold` resolution paths are duplicated.** In
   `app/utils/zones/resolve.ts`, `case 'zoneLabel'` and `case 'powerPct'` /
   `case 'hrPct'` each independently multiply an anchor by a ratio, and only the
   zone path handles overrides while only the pct path handles the pace
   inversion. §4.4 collapses them. Note the latent bug this exposes: **there is
   no `pacePct` variant at all**, so "90 % of threshold pace" is currently
   inexpressible, while "90 % of FTP" and "90 % of LTHR" both are. Pace is the
   metric where a %-of-threshold target is _most_ useful.

6. **No rowing, so the strongest portable-anchor precedent in the sport is
   unrepresented.** `CardioDiscipline` is run/bike/swim/strength. Adding rowing
   forces the `twoKSplit` anchor and the `pace⁻³` power conversion, which is a
   good forcing function for getting §3.3's ratio-not-offset rule right before
   it calcifies.

7. **Additive offsets are latent in the swim path.** `css-5` correctly chose the
   %CV (multiplicative) convention, and §3.2 confirms that call. But if the
   product ever accepts coach-entered swim targets in the `CSS + 10 s` form, it
   must convert on input, not store.

8. **`Event.target` (the `EventTarget` union) is not the same thing as a
   performance result and should not be overloaded into one.** It is a _goal_.
   Keep them separate; a goal that was met produces a result, a goal that was
   missed still produces a result.

### 7.3 ADRs this research challenges

| ADR                                                                                                                                                                                 | What it decided                                                                                                                                                   | What the evidence says                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Verdict                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **0027 A2** — "No truthful race-pace model exists (no race-pace reference on the athlete; Daniels M/T are the closest anchors)"; the `equivalent` facet is reserved and always null | Race-pace equivalence is unshippable because nothing on the athlete supports it, and fabricating "HM pace" from threshold pace would breach the honesty principle | **Right conclusion, over-broad wording.** The headline clause reads as a claim about the science, which would be wrong — Riegel (1981), the Daniels–Gilbert curves and the CS model are three independently-derived equivalence models that agree within 32 s on a 3:11 marathon (§2.2). But A2's own parenthetical scopes it to the athlete's data, and on that reading it was correct: with no performance history and no `pacePct`, there was nothing to resolve from. What this document changes is the "fabricating" premise — §4.3 rung 3 derives a race pace from a stored threshold _with a stated medium confidence_, which is honest rather than fabricated. So: keep the decision, widen the assumption, and fix the wording so it says "no race-pace **reference** exists on the athlete" rather than "no race-pace **model** exists" | **Amend** (not supersede)                          |
| **0007** — resolved ranges are recomputed by a background job when thresholds change                                                                                                | One resolved number per step, refreshed globally on threshold change                                                                                              | Right that a resolution must move; wrong that it moves everywhere. Re-resolving a _completed_ session's target rewrites what the athlete was told to run and corrupts adherence. Two stamps: re-resolve scheduled, freeze at completion (§5.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **Amend**                                          |
| **0007** — `IntensityTarget` is a discriminated union over metric models                                                                                                            | pace / power / %FTP / hr / %LTHR / %maxHR / RPE / zone label                                                                                                      | Correct axis, incomplete vocabulary. Missing `raceEquivalent` (the whole point of this document), `open` (distinct from absent), and `pacePct` — %-of-threshold works for power and HR but not for pace, which is where it is most useful (§4.1, §7.2 gap 5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **Amend**                                          |
| **0007** — resolved range stored as flat columns (`intensityPaceMin/Max`, …)                                                                                                        | Queryable numeric ranges beside the authored JSON                                                                                                                 | The number without its provenance cannot be rendered honestly — no `≈`, no confidence badge, no "from your 5k on 3 May". A `Resolution` value object (§4.5) is needed alongside, or the flat columns grow `via` and `confidence` (§7.2 gap 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Amend**                                          |
| **0005** — `DisciplineProfile` holds one current value per threshold; `ThresholdEvent` is the history                                                                               | Current-state columns plus an append-only log                                                                                                                     | Confirmed as the right shape for §5, and §4.3 rung 3 gives the log a new consumer: a threshold _is_ a point on the velocity–duration curve, so the log is also a performance history of last resort. Reinforces [zones-and-thresholds.md](zones-and-thresholds.md)'s finding that `effectiveAt` must actually be read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Confirm** (with that doc's Amend still standing) |
| **0005** — one nullable column per threshold on `DisciplineProfile`                                                                                                                 | `ftp`, `lthr`, `thresholdPace`, `css`, `runPower`, `maxHr`                                                                                                        | Reaching its limit. §4.1's `ThresholdRef` adds `criticalSpeed`, `hrReserve`, `twoKSplit` and `lt1`; that is ten nullable columns on one row, and the set is discipline-specific. A `Threshold` child row keyed `(disciplineProfileId, ref)` scales; the wide row does not. Same conclusion as [zones-and-thresholds.md](zones-and-thresholds.md) gap 8, reached from a different direction                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **Amend**                                          |
| **0006** — recipes are versioned code constants keyed by id                                                                                                                         | Zone models live in `app/utils/zones/`, never DB rows                                                                                                             | Confirmed and extended: the _equivalence model_ (Riegel exponent, Daniels curves, Cameron) is the same kind of object — published reference data with a fatigue profile baked in — and should ship the same way, keyed by id, with a new id per revision. A per-athlete fitted exponent is then an _override_ on a named model, exactly as `zoneOverrides` overrides a recipe                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Confirm**                                        |
| **0033** — Detection Confidence as high / medium / low, never a gate                                                                                                                | A graded honesty label                                                                                                                                            | Confirmed as the right vocabulary for §5.4's resolution confidence. Reuse it; do not invent a second scale. The weakest-link (minimum, not average) aggregation rule is the addition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **Confirm**                                        |

### 7.4 The smallest shippable slice

Ordered so each step is demoable end-to-end:

1. **`open` variant** + UI affordance. One schema line, removes a real
   ambiguity, no new data.
2. **`pacePct`** — %-of-threshold-pace, using the existing
   `thresholdPaceSecPerKm`. Closes the §7.2-gap-5 asymmetry with the resolver
   that already exists.
3. **`Resolution` provenance** on the existing paths — `via` and `confidence`
   for `threshold`-derived targets, rendered as `≈` plus a hover line. No new
   models, immediately visible.
4. **`PerformanceResult`** written from completed `Event`s. Surfaces as a
   "personal bests" list. Useful on its own.
5. **`raceEquivalent`** resolving at rungs 1–3 only (actual result, converted
   result, threshold-derived). Ships the headline feature with two models
   (Riegel-with-configurable-exponent and Daniels) and the §2.5 confidence rule.
6. **Rung 4** (curve fit) last, and only after `ActivityStream` carries
   distance.

---

## References

Grouped. Bibliographic details were re-checked on 2026-08-07 against Crossref,
Europe PMC, OpenAlex, Open Library and the publishers' own pages. **✅** =
authors, year, venue, volume/issue, pages and DOI all confirmed. **⚠** = could
not be confirmed, with the basis of the claim named.

**Race equivalence**

- ✅ Riegel, P.S. (1981) — "Athletic Records and Human Endurance", _American
  Scientist_ 69(3):285–290.
  [JSTOR 27850427](https://www.jstor.org/stable/27850427). Volume, issue and
  page range confirmed via OpenAlex. No DOI is registered for this article. ⚠
  the paper's own per-sport fatigue-factor table is unread (paywalled).
- ✅ Riegel, P.S. (1977) — "Time Predicting", _Runner's World_ (August 1977).
  Title and month confirmed, but only from secondary sources; a popular-magazine
  article with no DOI, volume or page record. ⚠ page number unavailable.
- ✅ Kennelly, A.E. (1906) — "An approximate law of fatigue in the speeds of
  racing animals", _Proc Am Acad Arts Sci_ 42(15):275.
  [doi:10.2307/20022230](https://doi.org/10.2307/20022230). ⚠ the closing page
  (commonly quoted as 331) is recorded nowhere we could reach; cite the opening
  page only.
- ⚠ Daniels, J. & Gilbert, J. (1979) — _Oxygen Power: Performance Tables for
  Distance Runners_. Self-published booklet. **Unverified and probably
  unverifiable by bibliographic search**: absent from Open Library, OpenAlex,
  Crossref, Google Books and the Library of Congress catalogue. The
  Daniels/Gilbert VDOT collaboration is well attested (see Daniels' own
  biography), but the two curves used in §2.2 do **not** come from a citable
  publication — their real provenance is **community reverse-engineering of
  Daniels' published tables**, propagated through VDOT calculator source code. A
  representative implementation:
  [sport-calculator.com](https://sport-calculator.com/calculators/running/jack-daniels-running-calculator).
  Do not cite _Oxygen Power_ as the source of the equations; cite it as the
  origin of the VDOT _concept_ and cite the equations as a community fit.
- ✅ Daniels, J. — _Daniels' Running Formula_, Human Kinetics. Editions
  confirmed via Open Library: 1st 1998, 2nd 2005, 3rd 2013, 4th 2021. This is
  where the E/M/T/I/R definitions and the VDOT tables actually live.
- ✅ Vickers, A.J. & Vertosick, E.A. (2016) — "An empirical study of race times
  in recreational endurance runners", _BMC Sports Sci Med Rehabil_ 8(1):26.
  [doi:10.1186/s13102-016-0052-y](https://doi.org/10.1186/s13102-016-0052-y). N
  = 2 303; reports that Riegel underestimates marathon time. ⚠ individual
  regression coefficients unread.
- ✅ Blythe, D.A.J. & Király, F.J. (2016) — "Prediction and quantification of
  individual athletic performance of runners", _PLoS ONE_ 11(6):e0157257.
  [doi:10.1371/journal.pone.0157257](https://doi.org/10.1371/journal.pone.0157257).
  164 746 runners, 1 417 432 performances; **three** parameters per runner plus
  three shared components — an earlier draft of this document described it as
  "rank-2", which was wrong.
- ✅ Gardner, J.B. & Purdy, J.G. (1970) — _Computerized Running Training
  Programs_. **Tafnews Press** (not "Track & Field News Press"). Confirmed to
  exist via Open Library, catalogued under James B. Gardner. ⚠ contents (the
  reference table and scoring scale) unread.
- ⚠ "Cameron's model" (Dave Cameron) — **no primary publication found.**
  Crossref, Europe PMC and OpenAlex return nothing. The formula in §2.4 rests on
  **an unsourced internet-era posting reproduced by third-party calculators**.
  Usable, but not literature.
- ✅ World Masters Athletics / WAVA — age-grading factor tables. First compiled
  by WAVA and published by _National Masters News_ in **1989**; revised 1991,
  1994, 2006, 2010, 2014 (minor) and 2023 (major). WMA currently publishes "WMA
  Age Factors (2023)". An earlier draft cited non-existent "2015 / 2020 / 2025"
  editions.

**Critical speed / critical power**

- ✅ Monod, H. & Scherrer, J. (1965) — "The work capacity of a synergic muscular
  group", _Ergonomics_ 8(3):329–338.
  [doi:10.1080/00140136508930810](https://doi.org/10.1080/00140136508930810).
- ✅ Vautier, J.F., Vandewalle, H., Arabi, H. & Monod, H. (1995) — "Critical
  power as an endurance index", _Appl Ergon_ 26(2):117–121.
  [doi:10.1016/0003-6870(95)00009-2](https://doi.org/10.1016/0003-6870%2895%2900009-2).
  The Monod-school continuation of the linear work–time model.
- ✅ Hughson, R.L., Orok, C.J. & Staudt, L.E. (1984) — "A high velocity
  treadmill running test to assess endurance running potential", _Int J Sports
  Med_ 5(1):23–25.
  [doi:10.1055/s-2008-1025875](https://doi.org/10.1055/s-2008-1025875).
- ✅ Jones, A.M. & Vanhatalo, A. (2017) — "The 'Critical Power' Concept:
  Applications to Sports Performance with a Focus on Intermittent High-Intensity
  Exercise", _Sports Med_ 47(Suppl 1):65–78.
  [doi:10.1007/s40279-017-0688-0](https://doi.org/10.1007/s40279-017-0688-0).
- ✅ Vanhatalo, A., Doust, J.H. & Burnley, M. (2007) — "Determination of
  critical power using a 3-min all-out cycling test", _Med Sci Sports Exerc_
  39(3):548–555.
  [doi:10.1249/mss.0b013e31802dd3e6](https://doi.org/10.1249/mss.0b013e31802dd3e6).
  A **cycling** protocol; the running adaptation is later work.
- ✅ Galbraith, A., Hopker, J., Lelliott, S., Diddams, L. & Passfield, L. (2014)
  — "A single-visit field test of critical speed", _Int J Sports Physiol
  Perform_ 9(6):931–935.
  [doi:10.1123/ijspp.2013-0507](https://doi.org/10.1123/ijspp.2013-0507). Three
  runs of 3600 / 2400 / 1200 m. An earlier draft called this a "3MT/9MT" test,
  which conflated it with Vanhatalo's 3-minute all-out protocol.
- ✅ Wakayoshi, K., Ikuta, K., Yoshida, T., Udo, M., Moritani, T., Mutoh, Y. &
  Miyashita, M. (1992) — "Determination and validity of critical velocity as an
  index of swimming performance in the competitive swimmer", _Eur J Appl Physiol
  Occup Physiol_ 64(2):153–157.
  [doi:10.1007/BF00717953](https://doi.org/10.1007/BF00717953). Companion paper:
  Wakayoshi et al. (1992), "A simple method for determining critical speed as
  swimming fatigue threshold in competitive swimming", _Int J Sports Med_
  13(5):367–371,
  [doi:10.1055/s-2007-1021282](https://doi.org/10.1055/s-2007-1021282).
  Practitioner write-up:
  [Topend Sports](https://www.topendsports.com/testing/tests/critical-swim-speed.htm)
- ✅ Ginn, E.M. (1993) — _Critical speed: the adaptation of the critical power
  method to swimming and swim training prescription_. PhD thesis, University of
  Queensland. [doi:10.14264/ce2d801](https://doi.org/10.14264/ce2d801). ⚠ the
  convention of attributing the simplified 400/200 CSS formula specifically to
  Ginn is coaching-literature usage we could not source to the thesis itself.
- Further CP/W′ sources, including the CP-vs-FTP and CP-vs-MLSS meta-analyses,
  are catalogued in [zones-and-thresholds.md](zones-and-thresholds.md) §
  References and not repeated here.

**Sport-specific anchors**

- ✅ Concept2 — watts ↔ split calculator. The page publishes
  `watts = 2.80/pace³` (pace in s/m) verbatim:
  [concept2.com watts calculator](https://www.concept2.com/indoor-rowers/training/calculators/watts-calculator)
- ✅ Concept2 — weight-adjustment calculator. Published as
  `Wf = (body weight in lb / 270)^0.222`, `corrected time = Wf × actual time`;
  270 lb = 122.47 kg, so §3.3's metric form is equivalent:
  [concept2.com weight adjustment](https://www.concept2.com/indoor-rowers/training/calculators/weight-adjustment-calculator)
- ⚠ "Paul's Law" (Paul Smith) — +5 s per 500 m split per doubling of distance.
  **No primary publication**; the claim rests on an oral coaching heuristic (and
  on its agreement with Riegel, §3.3).
- ⚠ British Rowing / USRowing UT2 / UT1 / AT / TR / AN band definitions relative
  to 2k split. The band _names_ are universal; the `+N s` offsets rest on
  **coaching convention**, and several slightly different renderings circulate.
  No single authoritative table was located.
- ⚠ Sweetenham, B. & Atkinson, J. (2003) — _Championship Swim Training_, Human
  Kinetics. The **book is verified**; the attribution of the T-30 threshold
  protocol to it is **not**, and currently rests on widely-repeated
  swim-coaching convention.
- ⚠ Allen, H., Coggan, A.R. & McGregor, S. — _Training and Racing with a Power
  Meter_, VeloPress (1st ed. 2006, 2nd 2010, 3rd 2019 — editions verified via
  Open Library). Source of the W/kg power-profile table in §3.1; **the table's
  cell values are unverified** and several renderings circulate online.
- ✅ Olympiatoppen —
  [Intensity Scale, Version 2 (2024)](https://olt-skala.nif.no/olt_2024_en.pdf)
  (the XC-skiing anchor; detailed in
  [zones-and-thresholds.md](zones-and-thresholds.md) §2.7)

**Prior work in this repo**

- [zones-and-thresholds.md](zones-and-thresholds.md) — anchors, protocols,
  recipes, automatic threshold estimation, time-in-zone
- [activity-analysis-metrics.md](activity-analysis-metrics.md) — the
  mean-maximal curve construction, NGP / GAP, W′bal
- [README.md](README.md) — consolidated ADR verdicts and the shipped-code defect
  list

### Confidence notes

- **High** — every equation and every numeric example in §2, §3.3 and §6
  (Daniels–Gilbert coefficients, the Riegel exponent sweep, the CS two-point
  fit, the Concept2 cube law, the rowing band → %-of-2k-power conversion) was
  computed locally and is reproducible from the formulas as written. The
  qualitative finding that Riegel@1.06 and Daniels are effectively the same
  model is robust across the whole ability range tested.
- **Medium** — the direction and rough magnitude of the Riegel exponent's
  variation by training status, sex, and distance ratio; the reproduction of
  Daniels' `T`/`I`/`R` paces from %VO₂max fractions (`E` and `M` are _not_
  reproduced and need the book's own table); typical `D′` ranges; the rowing
  band offsets.
- **Low / unverified** — Riegel's own per-sport fatigue-factor table (the paper
  is verified; its table is paywalled and unread, so the sport list in §2.1 is
  hedged); the Cameron equation coefficients; Purdy's reference table; the
  Coggan power-profile cell values; the rowing `+N s` band offsets; the T-30
  attribution; the exact published `%CS` values for race distances (the ones in
  §2.3 are computed from this document's own worked example, not quoted).
- **No published equation** — the Daniels–Gilbert curves in §2.2. They reproduce
  Daniels' `T`/`I`/`R` tables well and his `E`/`M` tables badly, and their real
  provenance is a community fit to a published table, not a citable paper. This
  does not affect the arithmetic; it affects how the product is allowed to
  describe it.
- **No evidence base** — any specific rule for how long a race result stays
  valid as an anchor. The 90/365-day thresholds in §4.3 and §5.4 are product
  decisions dressed in round numbers, and should be documented as such rather
  than justified by science.
