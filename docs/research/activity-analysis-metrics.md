# Single-Activity Analysis Metrics

Everything that can be computed from **one** workout's telemetry streams — the
algorithms, their primary sources, their units, and their edge cases. Scope is
deliberately _intra-activity_: no CTL/ATL/TSB, no multi-week trends, no
threshold estimation from history (except where a single activity feeds one).

## TL;DR

- **Normalized Power is a 4-step algorithm** (30 s rolling mean → 4th power →
  mean → 4th root) and almost every "advanced" cycling number is a ratio built
  on it: IF = NP/FTP, VI = NP/avg, EF = NP/avgHR. Getting NP's _edge cases_
  right (gaps, zeros, short activities, downsampling) matters more than the
  formula, which is trivial.
- **Pace needs a grade correction before it means anything.** The primary
  science is Minetti et al. 2002's 5th-order energy-cost polynomial; a
  grade→multiplier lookup over a _smoothed_ grade series is ~40 lines of code
  and unlocks Grade Adjusted Pace, Normalized Graded Pace, running EF, and
  honest run best-efforts on hilly courses.
- **Two families of "how hard was this really" metrics exist**: threshold-ratio
  metrics (IF, VI, EF, decoupling) which are cheap and robust, and
  **critical-power / W'bal** metrics which are richer but need a fitted CP+W'
  and are much easier to get subtly wrong. Start with the first family.
- **The mean-maximal curve (best effort for every duration) is the single
  highest-value stream derivation** — it is one O(n) pass per duration, it
  generalises to power/pace/HR, and it is exactly what ADR 0021 reserved a slot
  for (`BenchmarkKind` as a union, "once streams land").
- **Calorie and fuel numbers are estimates with wildly different trust levels.**
  From power they are near-exact (1 kJ ≈ 1 kcal at ~24 % efficiency, an
  arithmetic coincidence). From HR they are a population regression
  (Keytel 2005) with large individual error. Label them accordingly or don't
  ship them.

---

## 1. Power-derived metrics

### 1.1 Normalized Power (Coggan)

NP estimates the constant power that would have cost the same physiologically as
the actual variable ride. The canonical 4-step algorithm (Allen & Coggan,
_Training and Racing with a Power Meter_):

```
Inputs:  power[i]  watts, 1 Hz (or resolutionSec-spaced), i = 0..n-1
Output:  NP        watts

1. rolling[i] = mean(power[i-W+1 .. i])   for i >= W-1,  W = 30 s window
2. q[i]       = rolling[i] ^ 4
3. m          = mean(q)
4. NP         = m ^ 0.25
```

Equivalently `NP = (mean(rollingMean30s(power)^4))^(1/4)`.

Why: 30 s approximates the time constant of the cardiovascular/metabolic
response to a change in effort; the 4th power approximates the (roughly quartic)
relationship between power and physiological stress markers such as blood
lactate, so a 400 W surge costs ~16× a 200 W one rather than 2×.
([Coggan formulas summary](https://medium.com/critical-powers/formulas-from-training-and-racing-with-a-power-meter-2a295c661b46),
[TrainerRoad explainer](https://www.trainerroad.com/blog/normalized-power-what-it-is-and-how-to-use-it/))

**Edge cases — this is where implementations diverge.**

| Case                              | Common handling                                                                    | Note                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity < 20 min                 | Compute, but label low-trust or suppress                                           | NP is calibrated against ~1 h efforts; below ~20 min the 30 s window is a large fraction of the ride and NP inflates. Coggan himself cautions against NP for very short/very variable efforts. |
| Activity < 30 s                   | Undefined — return `null`                                                          | Not one full window.                                                                                                                                                                           |
| Coasting zeros                    | **Include them as 0 W**                                                            | Zeroes are real: they lower the rolling mean and therefore NP. Dropping them is the single most common bug and inflates NP on descents/crits.                                                  |
| Paused gaps (`null`)              | **Skip, do not read as 0**                                                         | A pause is absence of data, not zero watts. Either close the gap (concatenate) or restart the rolling window across it.                                                                        |
| Non-1 Hz sampling                 | Window = `ceil(30 / resolutionSec)` samples                                        | At `resolutionSec >= 30` the data is already smoothed past the window; the rolling pass degrades to identity and NP is conservative. Already recorded in **ADR 0024**.                         |
| First 29 s                        | Two conventions: drop the incomplete-window prefix, or seed with an expanding mean | Dropping is the literal reading and is what most implementations do; the difference is < 1 % for anything over ~10 min.                                                                        |
| Ramp-only / perfectly steady ride | NP ≈ avg power                                                                     | Correct behaviour, not a bug. VI ≈ 1.00.                                                                                                                                                       |

Pseudocode with gap handling:

```
function normalizedPower(power: (number|null)[], resolutionSec: number): number|null {
  const W = ceil(30 / resolutionSec)
  const segments = splitOnNulls(power)          // contiguous real-sample runs
  const fourths: number[] = []
  for (const seg of segments) {
    if (seg.length < W) continue                // segment too short to fill a window
    let sum = sum(seg[0..W-1])
    fourths.push((sum / W) ** 4)
    for (let i = W; i < seg.length; i++) {
      sum += seg[i] - seg[i - W]
      fourths.push((sum / W) ** 4)
    }
  }
  if (fourths.length === 0) return null         // "usable stream" gate
  return mean(fourths) ** 0.25
}
```

Complexity O(n) with the sliding sum. Watch float drift on very long rides — a
sliding `sum += new - old` accumulates error over ~10⁵ samples; recompute the
window sum every ~10⁴ steps, or use a Kahan sum, if you care about the last 0.01
W (you don't).

### 1.2 xPower (Skiba) — the alternative

Skiba's xPower replaces the flat 30 s box filter with a **25 s exponentially
weighted moving average**, then applies the same ^4 / mean / ^0.25 treatment.
The argument is that an exponential decay is a better model of physiological lag
than a rectangular window (which weights a sample 29 s ago exactly as much as
the current one, then drops it to zero).

```
alpha  = 1 - exp(-dt / 25)          // dt = sample interval in seconds
ewma[0] = power[0]
ewma[i] = ewma[i-1] + alpha * (power[i] - ewma[i-1])
xPower  = (mean(ewma^4)) ^ 0.25
```

Downstream: **Relative Intensity** `RI = xPower / CP` and **BikeScore**
`= xPower * RI * duration / (CP * 3600) * 100` are the xPower analogues of IF
and TSS. In practice NP and xPower agree within a few watts on most rides and
diverge most on very spiky efforts (crits, short intervals), where xPower tends
to read slightly lower.
([GoldenCheetah users discussion](https://groups.google.com/d/topic/golden-cheetah-users/FqxV3d0HneI))

Recommendation: pick one and be consistent. NP is the more widely recognised
number and is what athletes will cross-check against their head unit.

### 1.3 Intensity Factor and Variability Index

```
IF = NP / FTP                       // dimensionless
VI = NP / averagePower              // dimensionless, >= 1.0 in practice
```

`averagePower` here should be the **moving-time** average over the same samples
NP used (see §4.4) — mixing an elapsed-time average with a gap-skipping NP
manufactures a fake VI.

**IF interpretation bands** (Coggan's published guidance; treat as folklore-
grade, not measurement):

| IF        | Typical session                                 |
| --------- | ----------------------------------------------- |
| < 0.75    | Recovery ride                                   |
| 0.75–0.85 | Endurance / long steady                         |
| 0.85–0.95 | Tempo, aerobic intervals, long-course race pace |
| 0.95–1.05 | Threshold, ~40 km TT, short-course race         |
| 1.05–1.15 | Short TT, hard intervals                        |
| > 1.15    | Track pursuit, very short efforts               |

**VI interpretation bands:**

| VI        | Reading                                                  |
| --------- | -------------------------------------------------------- |
| 1.00–1.05 | Very steady — TT, trainer, flat solo ride                |
| 1.05–1.15 | Normal road ride with rolling terrain                    |
| 1.15–1.30 | Group ride, hilly, some surging                          |
| > 1.30    | Crit / cyclocross / MTB, or a ride with lots of coasting |

A high VI on a session _prescribed_ as steady is a genuine coaching signal: the
athlete rode it as intervals. This is a good, cheap "how well did you execute"
number that does not require per-step alignment.

### 1.4 Work

```
work_kJ = sum(power[i] * dt_i) / 1000     // watts * seconds = joules
```

Gaps contribute nothing. This is the input to the power-based calorie estimate
(§7.1) and is genuinely measured, not modelled.

---

## 2. Heart-rate-derived metrics

### 2.1 Intensity ratios

```
pctMaxHR  = avgHR / maxHR        * 100
pctLTHR   = avgHR / LTHR         * 100
pctHRR    = (avgHR - restHR) / (maxHR - restHR) * 100    // Karvonen reserve
```

Prefer **%LTHR** for training prescription (it is anchored to a physiological
breakpoint that moves with fitness) and **%maxHR** only when LTHR is unknown.
%HRR (Karvonen) requires a trustworthy resting HR, which most apps do not have;
if resting HR is a guess, the reserve is a guess squared.

Caveats that apply to every HR-derived number from a single activity: cardiac
drift, heat, dehydration, caffeine, altitude, illness, and the ~30–90 s lag of
HR behind effort. HR is a _response_ variable; power and pace are _dose_
variables. Never claim HR-derived intensity at the same confidence as
power-derived — the codebase already encodes this instinct (ADR 0024's `medium`
cap, ADR 0035's HR ceiling).

### 2.2 Heart rate recovery (HRR / HRRc)

The number of beats HR drops in the first 60 s after effort cessation:

```
HRR60 = HR_at_effort_end - HR_60s_later     // beats per minute
```

Origin: Cole et al., NEJM 1999 — in 2,428 adults referred for treadmill testing,
an HRR ≤ 12 bpm at 1 minute predicted roughly double all-cause mortality over 6
years, independent of workload and perfusion defects. It is a proxy for
parasympathetic reactivation.
([Cole 1999 in NEJM](https://www.nejm.org/doi/full/10.1056/NEJM199910283411804),
[overview](https://www.sciencedirect.com/topics/medicine-and-dentistry/heart-rate-recovery))

**As an athletic (not clinical) metric**, HRR is used as a day-to-day
freshness/fatigue signal: a _drop_ in your own typical HRR is more informative
than the absolute value, and the clinical ≤ 12 bpm cutoff is not an athlete
threshold. Trained endurance athletes commonly recover 25–45 bpm in 60 s.

Extracting it from a stream is the hard part — you need to identify "effort
cessation":

```
1. Find the last sample where the intensity channel (power/pace) is above a
   work threshold and remains so for >= 60 s.  Call it t_end.
2. Require >= 60 s of continuous HR samples after t_end with intensity
   below a recovery threshold (e.g. < 30% FTP, or speed ~ 0).
3. HRR60 = HR[t_end] - min(HR[t_end .. t_end+60s])
   (use min, not the point value, to survive a noisy sample)
4. If the athlete stopped recording at the finish line — the overwhelmingly
   common case — there is no post-effort tail. Return null. Do not
   extrapolate.
```

Reality check: most uploaded activities end _at_ the effort, so HRR is
computable for maybe 10–20 % of sessions. Treat it as opportunistic, and only
compute it after intervals in the middle of a session or after a clean
cool-down. Confidence in the extraction should itself be reported.

### 2.3 Efficiency Factor (EF)

```
EF_bike = NP  / avgHR                // watts per beat per minute
EF_run  = NGP / avgHR                // metres per second per bpm (or yd/min per bpm)
```

EF is only meaningful **compared against itself over time, at matched intensity
and duration**. A rising EF for the same type of aerobic session is the classic
aerobic-fitness improvement signal (Friel). Absolute EF values are not
comparable between athletes, disciplines, or units. Compute it on steady aerobic
sessions only; EF from an interval session is noise.
([Friel/TrainingPeaks on EF and decoupling](https://www.trainingpeaks.com/coach-blog/aerobic-endurance-and-decoupling/))

Units warning: `EF_run` differs by an order of magnitude depending on whether
NGP is in m/s, yards/min, or min/km. Pick one and store the unit.

### 2.4 Aerobic decoupling (Pw:HR, Pa:HR)

Friel's method: split the activity into halves and compare the
output-per-heartbeat of each.

```
Given samples over the (moving-time) work portion of the session:
  firstHalf, secondHalf  = split at the midpoint of *moving time*
  ratio1 = NP(firstHalf)  / avgHR(firstHalf)      // Pw:HR for cycling
  ratio2 = NP(secondHalf) / avgHR(secondHalf)
  decoupling% = (ratio1 - ratio2) / ratio1 * 100
```

For running, substitute NGP for NP and the metric is called **Pa:HR**.

Interpretation (Friel):

| Decoupling | Reading                                                                         |
| ---------- | ------------------------------------------------------------------------------- |
| < 0 %      | Second half _more_ efficient — usually an incomplete warm-up, or negative split |
| 0 – 5 %    | Well-developed aerobic endurance for that duration/intensity                    |
| 5 – 10 %   | Developing; aerobic base is the limiter                                         |
| > 10 %     | Aerobic endurance is clearly the limiter at this duration                       |

**Preconditions that make or break this metric:**

- **Steady aerobic session only.** Decoupling on an interval or race workout is
  meaningless — the halves differ in prescription, not in fatigue.
- **Minimum duration** — commonly ≥ 60 min for cycling, ≥ 45 min for running.
  Below that, drift hasn't had time to appear.
- **Exclude the warm-up.** HR is still rising in the first ~10 min, which
  systematically flatters the first half. Common implementations either drop the
  warm-up or require the athlete to select a range.
- **Exclude stopped time**, or the halves are not equal work.
- Heat, dehydration and caffeine produce decoupling that is not a fitness
  signal. On a hot day this number lies.

This is a metric that _must_ ship with its preconditions visible, or it will
generate confident nonsense on 80 % of an athlete's sessions.

---

## 3. Pace and grade

### 3.1 The physiological cost of grade — Minetti et al. 2002

The primary source is Minetti, Moia, Roi, Susta & Ferretti, "Energy cost of
walking and running at extreme uphill and downhill slopes", _J Appl Physiol_
93:1039–1046, 2002. They measured oxygen cost on a treadmill across gradients
from −45 % to +45 % and fitted a 5th-order polynomial for the metabolic cost of
transport for **running**:

```
Cr(i) = 155.4*i^5 - 30.4*i^4 - 43.3*i^3 + 46.3*i^2 + 19.5*i + 3.6
        // Cr in J per kg per metre
        // i = gradient as a rise/run fraction (+ uphill, - downhill)
        // valid for |i| <= 0.45; Cr(0) = 3.6 J/kg/m
```

([paper on APS](https://journals.physiology.org/doi/full/10.1152/japplphysiol.01177.2001),
[PDF](http://runscribe.com/wp-content/uploads/power/Minetti2002.pdf))

Note the shape: cost is _minimised_ around −20 % grade (about 60 % of level
cost) and rises again on steeper descents as braking work dominates. This is why
a naive linear grade adjustment is wrong in both directions.

To turn it into a GAP multiplier, normalise to level cost:

```
gradeFactor(i) = Cr(i) / Cr(0) = Cr(i) / 3.6
gradeAdjustedSpeed = actualSpeed * gradeFactor(i)
gradeAdjustedPace  = actualPace  / gradeFactor(i)
```

So on a +10 % climb,
`Cr(0.10) ≈ 3.6 + 1.95 + 0.463 - 0.043 - 0.003 + 0.016 ≈ 5.98`, factor ≈ 1.66 —
a 6:00/km climb is worth roughly a 3:37/km flat effort. That is aggressive; see
the caveat below.

### 3.2 Strava's GAP — and why it differs from Minetti

Strava's original GAP was Minetti-derived (a lab study of ~30 elite runners).
Their revised model was fitted from ~6 million runs / 240,000 athletes using
**equivalent heart rate** (HR ÷ speed, normalised per activity against that
activity's median efficiency near-flat) rather than metabolic cost. Reported
differences:

- The downhill adjustment bottoms out around **−9 to −10 %** grade at a factor
  of ~**0.88**, returning to 1.0 by about −18 %.
- The uphill slope is similar to the old model but shifted right by ~2 %.
- Net: the field-fitted model is **much less extreme than Minetti** in both
  directions — real runners get less credit for climbs and more credit for
  descents than the lab polynomial implies.
- The adjustment is pace-dependent: the same grade costs a fast runner
  proportionally more than a slow one.

([Strava Engineering: An Improved GAP Model](https://medium.com/strava-engineering/an-improved-gap-model-8b07ae8886c3),
[Improving Grade Adjusted Pace](https://medium.com/strava-engineering/improving-grade-adjusted-pace-b9a2a332a5dc),
[Strava GAP help](https://support.strava.com/en-us/articles/15402117-grade-adjusted-pace-gap),
[independent reverse-engineering as a degree-5 polynomial](https://aaron-schroeder.github.io/reverse-engineering/grade-adjusted-pace.html))

**Uncertainty flag:** no vendor publishes exact GAP coefficients. Minetti is the
only fully specified, citable, reproducible curve. Recommendation: ship Minetti,
cite Minetti, and optionally clamp the multiplier (e.g. to [0.85, 1.60]) so a
single bad GPS altitude sample cannot produce a 3:00/km "grade adjusted" split.

### 3.3 Grade computation and smoothing — the actual hard part

The polynomial is trivial; getting a usable `grade[i]` from GPS is not. Raw
per-sample grade from 1 Hz GPS is garbage: horizontal error of ±5 m and vertical
error of ±10 m over a 3 m step yields grades of ±300 %.

```
// 1. Smooth altitude before differentiating, never after.
alt_s = movingAverage(altitude, windowSeconds = 10..30)
//    or a Savitzky-Golay / LOESS filter, which preserves peaks better

// 2. Compute grade over a *distance* baseline, not a time baseline,
//    so it degrades gracefully when the athlete slows down.
BASE = 10  // metres of horizontal travel
grade[i] = (alt_s[j] - alt_s[i]) / (dist[j] - dist[i])
           where j = first index with dist[j] - dist[i] >= BASE

// 3. Clamp.
grade[i] = clamp(grade[i], -0.45, +0.45)   // Minetti's validity range

// 4. Guard the denominator: if the athlete is stationary
//    (dist[j] - dist[i] ~ 0), grade is undefined -> 0.
```

Barometric altitude (from a pressure sensor) is far better _relative_ data than
GPS altitude — smooth and accurate over short intervals — but drifts absolutely
with weather. GPS altitude is absolutely referenced but noisy. If the file
carries a `enhanced_altitude` / barometric channel, prefer it and reduce the
smoothing window; if it is GPS-only, smooth harder or fall back to a DEM
("elevation correction") lookup.

### 3.4 Normalized Graded Pace (NGP) and running power models

NGP applies the NP treatment to grade-adjusted pace, so that a run with surges
gets an intensity number reflecting its metabolic cost. Conceptually:

```
gap[i] = actualSpeed[i] * gradeFactor(grade[i])
NGP    = (mean(rollingMean30s(gap)^4)) ^ 0.25      // then convert to pace
```

TrainingPeaks describes NGP as applying an exponential weighting reflecting the
intensity→lactate relationship, so supra-threshold segments cost more than raw
pace suggests
([TrainingPeaks on NGP](https://www.trainingpeaks.com/learn/articles/what-is-normalized-graded-pace/)).
The exact windowing is not published.

The fully specified open alternative is **Skiba's GOVSS**, implemented in
GoldenCheetah. Reading the source is instructive because every constant is
visible
([GOVSS.cpp](https://github.com/GoldenCheetah/GoldenCheetah/blob/master/src/Metrics/GOVSS.cpp),
[Skiba's GOVSS paper PDF](https://runscribe.com/wp-content/uploads/power/GOVSS.pdf)):

```
// GoldenCheetah GOVSS, in outline:
speed_s, slope_s = 120-second rolling averages          // note: 120 s, not 30 s
Cr               = Minetti polynomial(slope_s)          // same 155.4 / -30.4 / -43.3 / 46.3 / 19.5 / 3.6
kineticPower     = d(0.5*v^2)/dt
aeroPower        = 0.5 * 1.2 * 0.9 * Af * v^3 / mass    // Af = 0.2025*h^0.725*m^0.425*0.266
efficiency       = (0.25 + 0.054*v) * (1 - 0.5*v/8.33)
runningPower     = (Cr*v + kinetic + aero) / efficiency-ish
LNP              = (mean(rollingMean30s(runningPower)^4)) ^ 0.25
IWF              = LNP / RTP                            // RTP = run threshold power
GOVSS            = (LNP * IWF * durationSec) / (RTP * 3600) * 100
```

### 3.5 Running power — what it actually is

**Running power is modelled, not measured.** Unlike a bike power meter (a strain
gauge measuring torque × angular velocity at a known interface), no consumer
running device measures the force the athlete applies to the ground. Every
running "power" number is a function of speed, grade, and sometimes
accelerometry, wind, body mass, and vendor-specific constants — see the GOVSS
outline above, which is entirely a function of `v`, `slope`, `mass`, `height`.

Consequences worth stating explicitly in product surfaces:

- **Cross-vendor numbers are not comparable.** Different models, different
  constants, different definitions of whether "power" includes the cost of
  moving the limbs. Differences of 20–30 % between vendors for the same run are
  normal.
- **Because it is largely a transform of grade-adjusted speed, running power
  carries little information that GAP does not** — its main advantages are
  responsiveness on rolling terrain and a familiar single-number scale.
- It nevertheless behaves like a _dose_ variable rather than a _response_
  variable (unlike HR): it responds instantly, is unaffected by heat and
  hydration, and is therefore a legitimately better classification channel than
  HR. This is the reasoning already recorded in **ADR 0038**.
- Validation is mixed but not damning: at least one peer-reviewed study finds
  vendor running power tracks intensity usefully around maximal lactate steady
  state ([PubMed 37960430](https://pubmed.ncbi.nlm.nih.gov/37960430/)).

### 3.6 Running effectiveness

```
RE = speed (m/s) / (power (W) / bodyMass (kg))       // dimensionless-ish, ~0.9-1.1
```

Introduced by Coggan; a ratio of how much speed the runner extracts per watt per
kg. Typical values cluster near 1.00; a higher value at a matched speed suggests
better mechanics or less fatigue. Grade-adjusted speed should be used if the run
wasn't flat.
([RUNALYZE glossary](https://runalyze.com/glossary/running-effectiveness),
[WKO article](https://wko5.zendesk.com/hc/en-us/articles/8042479584141-Looking-at-Running-Effectiveness-and-Speed-with-WKO))

Since running power is itself derived largely from speed, RE on a device-
modelled power stream is close to circular. It is only genuinely informative
with an independent power estimate (a footpod's accelerometry contribution).
Flagging this as **low value relative to implementation cost**.

---

## 4. Critical power, W', and the power-duration curve

### 4.1 The 2-parameter critical power model

```
t = W' / (P - CP)        for P > CP
P(t) = CP + W'/t         (hyperbolic form)
W(t) = CP*t + W'         (linear work-time form, easiest to fit)
```

- `CP` — critical power (W), the highest sustainable-in-steady-state power; the
  asymptote of the power-duration hyperbola.
- `W'` ("W prime") — the finite work capacity above CP, in **joules** (typically
  10,000–30,000 J for trained cyclists). Sometimes called anaerobic work
  capacity.

The 2-parameter model is unphysical at both extremes: it predicts infinite power
for infinitesimal duration and infinite duration at CP. It fits well over
roughly 2–20 minutes.

### 4.2 The 3-parameter model (Morton 1996) and Pmax

Morton, "A 3-parameter critical power model", _Ergonomics_ 39(4):611–619, 1996
adds `Pmax`, maximal instantaneous power, which bounds the short end:

```
t = W' / (P - CP) - W' / (Pmax - CP)
```

([Ergonomics abstract](https://www.tandfonline.com/doi/abs/10.1080/00140139608964484))
It needs ≥ 4 test durations to fit and is described as protocol-independent.

**Fitting CP/W' from a single activity is generally not possible and should not
be attempted.** It requires maximal efforts at several durations. What a single
activity _can_ do is contribute points to the athlete's all-time mean-maximal
curve, from which CP/W' are fitted over a rolling window (a multi-activity
concern, out of scope here but worth designing towards).

### 4.3 W'bal — how much of the tank is left, second by second

W'bal turns CP+W' into a live intra-activity depletion/recovery trace. Two
algorithm families:

**Integral (Skiba et al. 2012).** W' recovers exponentially with a time constant
τ that depends on how far below CP the athlete is recovering:

```
W'bal(t) = W' - Σ_{u=0}^{t} W'exp(u) * e^((u-t)/τ)

W'exp(u) = max(0, P(u) - CP) * dt                 // joules expended above CP
τ        = 546 * e^(-0.01 * D_CP) + 316           // seconds
D_CP     = CP - mean(P over samples where P < CP) // the "recovery" deficit, watts
```

Note τ is computed from the **whole activity's** mean sub-CP power, which is the
model's main criticism: a single scalar τ for the whole ride cannot represent a
session with both easy and hard recoveries. It is also O(n²) if implemented
literally.

**Differential (Froncioni / Skiba / Clarke).** Recovery is proportional to how
depleted you currently are; the exponentials drop out and no τ is needed:

```
for each sample, dt seconds:
  if P > CP:
    W'bal -= (P - CP) * dt                             // deplete
  else:
    W'bal += (CP - P) * (W' - W'bal) / W' * dt         // recover, self-limiting
  W'bal = min(W'bal, W')                               // never exceed capacity
```

This is O(n), stateless, streamable, and is GoldenCheetah's default. It can be
tuned with a recovery factor α on the recovery term.
([Liversedge on W'bal implementation](http://markliversedge.blogspot.com/2014/07/wbal-its-implementation-and-optimisation.html),
[algorithm comparison](https://medium.com/critical-powers/comparison-of-wbalance-algorithms-8838173e2c15),
[sweatpy reference implementation](https://github.com/GoldenCheetah/sweatpy/blob/master/sweat/pdm/w_prime_balance.py))

There is also a **Waterworth optimisation** of the integral form that reduces it
to O(n) using a running exponentially weighted sum:

```
runningSum = runningSum + W'exp(t) * e^(t/τ)
W'bal(t)   = W' - runningSum * e^(-t/τ)
```

(numerically delicate — `e^(t/τ)` overflows for long activities unless
rescaled).

**Edge cases:** garbage CP/W' → garbage W'bal (it will pin at zero or never
deplete); a stale CP after a fitness change is the usual cause of "my W'bal says
I should be dead". W'bal below zero is physically impossible — clamp at 0 and
treat repeated pinning as a signal that CP is set too low. Recommend
**differential** for any new implementation.

### 4.4 Mean-maximal curve and best efforts

The mean-maximal (a.k.a. "peak power", "critical power chart") curve is the best
average value sustained for every duration in the activity:

```
for each duration d in DURATIONS:
  W = round(d / resolutionSec)
  if W > n: continue
  best[d] = max over i of mean(power[i .. i+W-1])      // sliding window, O(n)
```

Standard duration ladder: 1, 5, 10, 15, 20, 30, 60 s; 2, 3, 5, 8, 10, 12, 20,
30, 45, 60, 90 min; 2, 3, 4, 5, 6 h. A log-spaced ladder of ~40 durations covers
the curve for plotting; a short ladder of 6–10 is enough for records.

The same routine generalises:

| Channel          | Aggregation                          | Notes                                                                                                        |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Power            | max mean over window                 | Straightforward                                                                                              |
| Heart rate       | max mean over window                 | Rarely interesting; peak 20-min HR is not a record                                                           |
| **Speed / pace** | max mean **over distance**, not time | "Fastest 5 km" needs a distance-window sliding over the cumulative-distance array, which is a different loop |
| Elevation        | max gain over window                 | Novelty                                                                                                      |

**Distance-based best efforts** (fastest 1 km / 5 km / 10 K / half / full) are
what runners actually care about and require the distance channel:

```
for each targetDistance D:
  j = 0
  best = +Infinity
  for i in 0..n-1:
    while j < n and dist[j] - dist[i] < D: j++
    if j >= n: break
    // linear interpolation between j-1 and j gives sub-sample accuracy
    best = min(best, time[j] - time[i])
  bestTime[D] = best
```

Two-pointer, O(n). Interpolate the final partial sample or every split will be
biased slow by up to one sample interval.

**Downsampling destroys best efforts.** A stream stored at 5 s resolution cannot
yield a credible 1-second peak power, and bucket-mean downsampling
systematically _lowers_ every short-duration peak. This is a real tension with
**ADR 0020**. Two honest options: (a) only offer durations ≥ ~4× the stored
resolution, or (b) compute the ladder at ingest from the _raw_ stream, before
downsampling, and persist the small array of results. Option (b) is ~40 numbers
per activity, costs nothing, and is strictly more truthful. GoldenCheetah takes
the same shape — it precomputes and caches mean-maximal arrays per ride
([RideFileCache.cpp](https://github.com/GoldenCheetah/GoldenCheetah/blob/master/src/FileIO/RideFileCache.cpp)).

---

## 5. Elevation

### 5.1 Total ascent

Naive summation of positive altitude deltas over noisy GPS produces comically
inflated numbers (a flat 10 km run can "climb" 300 m). Every real implementation
applies a threshold, smoothing, or both:

```
// Threshold / hysteresis method
smooth = movingAverage(altitude, 10..30 s)   // or box filter over distance
ascent = 0
ref    = smooth[0]
for i in 1..n-1:
  delta = smooth[i] - ref
  if delta >= THRESHOLD:  ascent += delta; ref = smooth[i]
  else if delta <= -THRESHOLD: ref = smooth[i]     // reset ref on real descent
  // else: within noise band, ignore
```

Published thresholds:

- Strava: climbing must be sustained for **> 10 m** without strong barometric
  data, **> 2 m** with barometric data
  ([Strava elevation FAQ](https://support.strava.com/hc/en-us/articles/115001294564-Elevation-on-Strava-FAQs)).
- RUNALYZE reports good results with a **3 m** threshold; **5 m** is a commonly
  cited value for GPS tracks
  ([RUNALYZE elevation help](https://runalyze.com/help/article/elevation)).

The threshold and the smoothing window are **not independent** — smoothing
harder means you can use a smaller threshold. Both reduce reported ascent, so
whatever you pick, your numbers will disagree with some other app's, and that is
fine as long as you are internally consistent. Barometric-derived totals from
the device file are usually the best available answer; **prefer the
provider/device `total_ascent` field when present** and only compute your own as
a fallback.

### 5.2 Barometric vs GPS altitude

|                   | Barometric                                             | GPS                              |
| ----------------- | ------------------------------------------------------ | -------------------------------- |
| Short-term noise  | Very low                                               | ±5–15 m                          |
| Absolute accuracy | Drifts with weather (can be tens of metres over hours) | Referenced, no drift             |
| Failure modes     | Pressure changes, temperature, a covered port, tunnels | Canyons, tree cover, cold starts |
| Best used for     | Ascent, grade                                          | Absolute elevation               |

A third option is **elevation correction**: replace the recorded altitude with a
DEM lookup along the GPS track. This gives smooth, plausible profiles but
inherits DEM resolution artifacts (typically 30 m grids, which flatten short
steep features) and is wrong for bridges/overpasses.

---

## 6. Cadence, stride and running dynamics

### 6.1 Stride length

```
strideLength_m = speed_m_per_s / (cadence_spm / 60)
```

**The single most common bug is a factor of two.** Devices and formats disagree
on whether cadence is _steps per minute_ (both legs, typically 160–190 for
running) or _strides/revolutions per minute_ (one leg, typically 80–95). FIT
running cadence is usually per-leg with a separate fractional field; Strava's
`cadence` stream for runs is typically **one leg** and needs doubling to get
steps/min. Detect it: if the value is < 130 for a run, it is almost certainly
per-leg.

For cycling, cadence is unambiguously crank RPM, and the analogue of stride
length is:

```
developmentMetres = speed_m_per_s * 60 / cadence_rpm      // metres per crank rev
```

which, divided by wheel circumference, recovers the gear ratio — a nice derived
"which gear were you in" channel that almost nobody computes.

### 6.2 Ground contact time, vertical oscillation, vertical ratio

Available only from a chest strap / pod / some watches, via FIT running dynamics
fields.

| Metric                              | Unit  | Typical range         | Direction                 |
| ----------------------------------- | ----- | --------------------- | ------------------------- |
| Ground contact time (GCT)           | ms    | 160–300 (elite < 200) | Lower is generally better |
| GCT balance                         | % L/R | 50/50 ± 2 %           | Symmetry                  |
| Vertical oscillation (VO)           | cm    | 6–13                  | Lower is generally better |
| Vertical ratio (VO ÷ stride length) | %     | 6–10; elite < 7       | Lower is better           |
| Cadence                             | spm   | 155–190               | Rises with speed          |

([Garmin Running Dynamics owner's-manual page](https://www8.garmin.com/manuals/webhelp/GUID-9D99A9D4-467A-4F1A-A0EA-023184FEA3DD/EN-US/GUID-62A09512-518A-424A-8491-FE2B80CD2091.html))

Crucial caveat: all of these are **strongly speed-dependent and
height-dependent**. GCT falls and cadence rises as you speed up; a tall runner
naturally has higher VO. Comparing raw values between athletes, or between an
easy run and a tempo run, is meaningless. The only defensible presentations are
(a) _this metric at matched pace over time_, or (b) _left/right balance_, which
is self-normalising. Vertical ratio is the most robust of the set because it
already normalises VO by stride length.

---

## 7. Energy expenditure and fuelling

### 7.1 From power (cycling) — the good case

```
work_kJ  = Σ power_W * dt_s / 1000
kcal     = work_kJ / 4.184 / efficiency        // efficiency ~ 0.20 - 0.25
         ≈ work_kJ * 1.0                        at efficiency = 0.239
```

The famous coincidence: 1 kcal = 4.184 kJ, and human gross cycling efficiency is
~22–25 %, so dividing by ~0.24 and by 4.184 nearly cancel. **1 kJ of mechanical
work ≈ 1 kcal of metabolic cost**, to within a few percent, for most cyclists.
([Stages explainer](https://stagescycling.com/en_us/content/what-it-means-watts-to-kjs-to-kcals),
[TrainerRoad](https://www.trainerroad.com/blog/calories-and-power/),
[CTS](https://trainright.com/energy-expenditure-calories-kilojoules-and-power-in-cycling/))

This is the most trustworthy calorie number in all of consumer fitness, because
the mechanical work is genuinely measured and only the efficiency constant is
assumed. Note it is _gross_ energy expenditure including basal metabolism during
the ride — it is not "extra" calories.

### 7.2 From heart rate — Keytel et al. 2005

Keytel LR et al., "Prediction of energy expenditure from heart rate monitoring
during submaximal exercise", _J Sports Sci_ 23(3):289–297, 2005. Gender-specific
regressions on n = 115, ages 18–45, mass 47–120 kg, VO₂max 27–81 ml/kg/min:

```
// EE in kJ per minute
male:   EE = -55.0969 + 0.6309*HR + 0.1988*mass_kg + 0.2017*age_y
female: EE = -20.4022 + 0.4472*HR - 0.1263*mass_kg + 0.0740*age_y

kcal = EE_kJ_per_min * durationMin / 4.184
```

([Semantic Scholar record](https://www.semanticscholar.org/paper/Prediction-of-energy-expenditure-from-heart-rate-Keytel-Goedecke/2f647f62e650bf7df32546e541af3cf155297749))

There is a VO₂max-including variant with lower error, if VO₂max is known.

**Serious caveats:**

- Validated for **submaximal steady-state** exercise only. It is wrong for
  intervals, wrong above threshold, and wrong during recovery (HR stays high,
  expenditure has dropped).
- Can return **negative** values at low HR — clamp at 0.
- Sex is a binary in the model; the equations do not extend gracefully.
- The population error is large (±10–20 % typical, worse individually). It is a
  plausible number, not a measurement.

### 7.3 Substrate split and carbohydrate need

Fuel mix shifts from predominantly fat to predominantly carbohydrate as
intensity rises. A rough, widely used rule-of-thumb mapping:

| Intensity                | CHO fraction of energy | Practical fuelling        |
| ------------------------ | ---------------------- | ------------------------- |
| < 55 % VO₂max / recovery | ~30 %                  | none needed under ~90 min |
| Endurance, ~65 %         | ~50 %                  | 30–60 g/h beyond 90 min   |
| Tempo, ~75 %             | ~70 %                  | 60 g/h                    |
| Threshold+               | ~85–95 %               | 60–90 g/h, gut-limited    |

The _demand_ side can be estimated from measured work; the _supply_ side is
hard-capped by intestinal absorption, and this cap is well established:

- A **single** carbohydrate source oxidises at **≤ ~60 g/h** (SGLT1-limited).
- **Multiple transportable carbohydrates** (glucose + fructose, ~2:1) raise this
  to **~90 g/h**, with lab observations up to ~105–120 g/h.
- Recommendation shape: ~30 g/h for 1–2 h, ~60 g/h for 2–3 h, ~90 g/h for
  > 2.5–3 h.

([Jeukendrup, "Carbohydrate feeding during exercise", _Eur J Sport Sci_ 2008](https://onlinelibrary.wiley.com/doi/10.1080/17461390801918971),
[Jeukendrup, "A step towards personalized sports nutrition", _Sports Med_ 2014](https://link.springer.com/article/10.1007/s40279-014-0148-z),
[GSSI on multiple transportable carbohydrates](https://www.gssiweb.org/sports-science-exchange/article/sse-108-multiple-transportable-carbohydrates-and-their-benefits))

A defensible single-activity output: `estimated CHO used (g)` = kcal × CHO
fraction ÷ 4 kcal/g, alongside
`recommended intake for a session of this duration and intensity (g/h)`. Both
are estimates; the intake recommendation is on much firmer evidential ground
than the expenditure estimate.

---

## 8. Time bases and coasting

### 8.1 Moving vs elapsed time

```
elapsedTime = last timestamp - first timestamp     // wall clock, includes stops
movingTime  = elapsed - Σ(detected rest intervals)
```

A representative implementation: scan for stretches where speed is below a
sport-specific threshold for **more than ~15 s** and subtract them. Reported
thresholds: running "slower than a 30-minute mile" (~0.9 km/h); cycling ~1.5
km/h.
([Strava moving time, speed and pace](https://support.strava.com/en-us/articles/15401804-moving-time-speed-and-pace-calculations),
[Strava Engineering on auto-pause](https://medium.com/strava-engineering/improving-auto-pause-for-everyone-13f253c66f9e))

Known failure mode: horizontal speed on very steep or technical terrain (hiking
a 30 % pitch, technical MTB) legitimately drops below the threshold, so real
effort gets discarded as rest.

**Rule: every average must declare its time base.** Average power over moving
time and over elapsed time can differ by 20 % on a stop-and-go ride, and VI
built from mismatched bases is nonsense.

### 8.2 Coasting

For cycling with a power meter, coasting is directly observable:

```
coastingFraction = count(power == 0 AND speed > movingThreshold) / count(moving samples)
```

Distinct from _stopped_ (speed ≈ 0). A high coasting fraction explains a high VI
and a low average power without implying a low effort — it is exactly what you
want to know about a descent-heavy or crit ride. Reporting
`% pedalling / % coasting / % stopped` as a three-way split of elapsed time is
cheap, unambiguous, and rarely done.

Zero-power samples are also detectable as sensor dropout rather than coasting:
if cadence > 0 while power == 0, the power meter dropped out, and those samples
should be treated as gaps (`null`), not zeros.

---

## 9. Perceived measures

### 9.1 The scales

| Scale                  | Range                  | Anchoring                                                  | Notes                                                                                                            |
| ---------------------- | ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Borg RPE (6–20)**    | 6–20                   | Designed so RPE × 10 ≈ HR in bpm for a healthy young adult | The original; the odd range exists purely for that HR mapping, which does not hold for trained or older athletes |
| **Borg CR10**          | 0–10, ratio-scaled     | Verbal anchors, logarithmic to match sensory perception    | Ratio properties mean "8 is twice as hard as 4" is meaningful                                                    |
| **Foster session-RPE** | CR10, modified anchors | Asked ~30 min post-session, for the session _as a whole_   | Foster explicitly tested 6–20 and chose CR10, re-anchoring the verbal descriptors into American idiom            |
| **"Feel" 1–5**         | 1–5                    | Subjective wellness, _not_ exertion                        | Orthogonal axis: how the session _felt_, not how hard it was                                                     |

([Foster session-RPE validity review, _Front Neurosci_ 2017](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/full))

```
sessionLoad_AU = sRPE(0-10) * durationMinutes
```

Foster reports ~80–90 % of athletes can give a single meaningful whole-session
number. Ask at least ~30 min after the session — asked immediately, the rating
is dominated by the final interval.

**Do not silently convert between scales.** Approximate mappings exist
(`CR10 ≈ (RPE6-20 - 6) / 1.4`) but they are lossy and the scales measure subtly
different constructs. Pick one, store which one, and never migrate a stored
rating from one scale to another without telling the athlete.

### 9.2 Combining perceived with objective

The interesting product surface is the **mismatch**, not the agreement:

```
expectedRPE   = f(IF or %LTHR, duration)      // e.g. a simple lookup
rpeDivergence = actualRPE - expectedRPE
```

- Objective load normal, RPE high → fatigue, illness, heat, poor sleep, or a
  psychologically hard session.
- Objective load high, RPE low → strong day, or the athlete under-rates.
- Persistent divergence in one direction → the athlete's threshold is stale.

Pair it with decoupling (§2.4) for a two-signal fatigue read. This is a
genuinely differentiated feature and it is _cheap_ — no new telemetry required.

---

## 10. Classifying a single session

Two complementary approaches.

### 10.1 Single-number classification

Take the session's overall intensity (IF for power, NGP/threshold pace for
running, %LTHR for HR) and bucket it. Simple, matches the IF table in §1.3, and
is what most coaches mean by "that was a tempo ride". It fails badly on interval
sessions: 4×8 min at 105 % FTP with long recoveries can produce an overall IF of
0.82, indistinguishable from an endurance ride.

### 10.2 Distribution-based classification (better)

Compute time-in-zone from the stream, then classify on the _shape_:

```
1. Resolve the athlete's zone boundaries for the anchor channel
   (power for bike, running power/pace for run, HR as fallback).
2. tiz[z] = seconds where the (lightly smoothed, ~5-30 s) channel falls in zone z,
   over moving time only.
3. Classify:

   let hard    = tiz[Z4] + tiz[Z5] + tiz[Z6+]       // >= threshold
   let moderate= tiz[Z3]                             // tempo
   let easy    = tiz[Z1] + tiz[Z2]
   let total   = easy + moderate + hard

   if  total < 20min and easy/total > 0.9      -> "recovery"
   if  hard/total  >= 0.08 and peakZone >= Z5  -> "vo2max"
   if  hard/total  >= 0.12 and peakZone == Z4  -> "threshold"
   if  moderate/total >= 0.25                  -> "tempo"
   if  easy/total  >= 0.85                     -> "endurance"
   else                                        -> "mixed"
```

Refinements worth having:

- **Smooth before binning.** Raw 1 Hz power crosses zone boundaries constantly;
  a 10–30 s smoothing before time-in-zone makes the distribution reflect intent
  rather than sensor jitter.
- **Require sustained occupancy.** Count zone time only in runs of ≥ 30–60 s, so
  a single 8-second sprint out of a corner does not label an endurance ride
  "VO₂max".
- **Peak sustained value matters as much as total.** The best sustained 5-minute
  power tells you whether a VO₂max stimulus actually occurred.
- **Distinguish "polarized" from "mixed"**: high easy fraction _and_ meaningful
  hard fraction with almost no Z3 is a legitimate polarized interval session,
  not a mixed one.
- Zone boundaries are athlete-specific and threshold-dependent; if the anchor
  threshold is missing, the classification is not available. That is the honest
  answer, not a default guess.

The repository already has most of this machinery in **Structure Detection**
(ADR 0032/0033/0035) — band separation, anchor-channel selection, an honesty
gate, HR-capped confidence. Session classification is arguably a _simpler_
sibling that could reuse the same zone resolution and the same confidence
vocabulary.

---

## Implications for trainm8

Read against `CONTEXT.md`, ADR 0020 (Activity Stream), ADR 0021 (Personal
Records), ADR 0024 (NP from the stream), ADR 0032–0035 (Structure Detection) and
ADR 0038 (running power classification). These are recommendations on the
evidence. Where a shipped ADR blocks the right design, it is named and should be
replaced; where it is right, that is said too.

**The design the evidence supports, in one paragraph.** An activity's derived
metrics are computed **at ingest from the raw stream**, and the small results
are persisted — not recomputed later from a lossy stored copy, because
downsampling destroys the short-duration peaks and the channels that most of
this document depends on. The stored stream needs **distance and altitude**
alongside time, power, HR and pace, because without them grade adjustment,
distance-based best efforts, and every running metric built on them are simply
unavailable. Every derived metric declares its preconditions as data and returns
either a value with a confidence or an Unavailable Metric with a written reason
— because almost all of them are meaningless on the wrong kind of session.

**Already covered — the research confirms these, do not re-derive:**

- **Normalized Power** is done, with the right edge cases: `ceil(30/res)`
  window, `null`-skipping, the "usable stream" gate at one full window, and the
  confidence demotion to `medium` for average-power fallback (ADR 0024). §1.1
  independently arrives at the same edge-case list.
- **Zone resolution, band separation, honesty gate, confidence vocabulary** (ADR
  0033/0035) — reuse, don't rebuild.
- **Load Confidence as a trust gate** (ADR 0008/0021) is exactly the right
  mechanism for every metric in this document. Most of them are estimates.

**ADR 0038's conclusion survives, but its stated reason does not.** ADR 0038 §3
justifies leaving running power uncapped on the grounds that it is "a direct
mechanical measurement, like cycling power". §3.5 shows that is factually wrong:
no consumer running device measures the force the athlete applies to the ground,
and every running "power" number is a model over speed, grade, mass and
vendor-specific constants. The _decision_ is still right, for the reason ADR
0038 gives second: running power behaves like a **dose** variable — instant,
drift-free, unaffected by heat and hydration — which is what the HR cap exists
to punish and which running power genuinely is not. Fix the reasoning, and take
the consequence the wrong reasoning hid: because it is modelled, **cross-vendor
running power differs by 20–30 % for the same run**, so the critical-power
threshold must be scoped to the provider that produced the stream. Today, an
athlete who changes running-power device silently reclassifies their training.

**Highest value, lowest risk — recommended next:**

1. **Compute the mean-maximal ladder at ingest from the raw stream, and carry
   distance and altitude channels. ADR 0020's storage decision should be
   superseded.** ADR 0020 decided that only a bucket-mean downsampled stream is
   persisted (≥5 s floor, ≤1000 samples) across `timeSec` / `power` /
   `heartrate` / `pace`, and that nothing is derived at ingest. That was the
   right trade for the one consumer it had — a telemetry overlay that cannot
   render 1 Hz fidelity anyway — and it is the wrong shape for everything in
   this document. It is lossy in a way no read-time cleverness recovers:
   bucket-mean downsampling systematically _lowers_ every short-duration peak,
   so a 1-second or 5-second best effort read back from storage is not merely
   imprecise, it is biased low. And the two missing channels are not optional
   extras: without distance there are no distance-based run bests (fastest 1 km
   / 5 km / 10 K), which is the benchmark runners actually care about; without
   altitude there is no grade, and therefore no Grade Adjusted Pace, no NGP, no
   running EF and no honest run best-effort on a hilly course (§3.1–§3.4).

   Replace it with: derive the ~40-number mean-maximal ladder from the **raw**
   provider stream at ingest and persist it beside `ActivityStream`; extend the
   stored channel set with `distance` and `altitude`. The downsampling policy
   itself stays — the stored stream is still for rendering. This directly
   unblocks ADR 0021's reserved `BenchmarkKind` union (pace/power/duration
   benchmarks "once streams land").

   Migration cost, stated plainly: historical activities have already discarded
   their raw streams, so their ladders cannot be reconstructed truthfully.
   Either re-fetch raw streams from the provider where the connection still
   allows it, or leave pre-change activities with no ladder and no grade-derived
   metric — an Unavailable Metric, not a low-biased number computed from the
   downsampled copy. Personal Records derived from the new ladder will therefore
   appear to "start" at the change date for athletes whose history cannot be
   re-fetched; that is the honest rendering and it should be labelled, not
   hidden.

2. **Variability Index and Intensity Factor.** Free: NP already exists, FTP
   already exists, average power already exists as an aggregate. VI is a real
   execution signal ("you rode your steady session as intervals") that requires
   no per-step alignment and therefore does not violate the Telemetry Overlay's
   "no per-step verdicts" stance. One caution: the stored average must share
   NP's time base, or VI is fiction.
3. **Session classification from the intensity distribution** (§10.2), reusing
   Structure Detection's zone resolution and confidence grading. ADR 0034 §3 is
   right that a `recorded` or `detected` session must never compute Planned TSS
   — grading a plan reconstructed from the actuals against those same actuals is
   a self-comparison — but it leaves those sessions with nothing at all to say.
   Distribution-based classification is the honest thing to say instead: it
   describes what happened without claiming a prescription existed.
4. **A three-way elapsed-time split (pedalling / coasting / stopped)** for
   power-equipped rides. Trivial, unambiguous, and it _explains_ VI rather than
   just reporting it. Also gives you the sensor-dropout detector (cadence > 0
   with power == 0 ⇒ gap, not zero) which improves NP itself.

**Worth doing, with preconditions enforced in the model:**

5. **Grade Adjusted Pace via the Minetti polynomial.** It is the only fully
   published, citable curve, and it makes hilly run pace comparable at all. It
   requires the **altitude and distance channels** that recommendation #1 adds
   to `ActivityStream`; that is the whole gate, and it is a schema decision
   rather than a modelling one. Clamp the multiplier and smooth grade over a
   _distance_ baseline. Once GAP exists, NGP, run EF, and honest run
   best-efforts follow almost for free. Keep §3.2's uncertainty flag visible:
   field-fitted models are less extreme than the lab polynomial in both
   directions, and no vendor publishes coefficients, so Minetti is the only
   reproducible choice — not the known-correct one.
6. **Efficiency Factor and aerobic decoupling** — high coaching value, but they
   are the metrics most likely to embarrass the app. Both are meaningless on
   interval sessions, on short sessions, and on hot days. Model them as
   **conditionally available**: compute only when the session is classified
   `endurance`/`tempo` (which #3 gives you), duration ≥ 45–60 min, and a
   continuous HR channel exists — otherwise an **Unavailable Metric** with a
   written reason ("decoupling needs a steady aerobic session over 60 minutes").
   That is exactly the ADR 0008 pattern and it turns a fragile metric into an
   honest one.
7. **Work in kJ and calories from power.** kJ is measured, not estimated, and
   the kJ ≈ kcal identity is the one calorie number worth showing at `high`
   confidence. HR-based (Keytel) calories should sit at `low` confidence at
   best, or be omitted — a wrong calorie number is the kind of thing athletes
   notice and stop trusting the app over.

**Recommend against, for now:**

- **W'bal.** Rich and beautiful, but it needs a fitted CP + W', which needs a
  multi-activity mean-maximal history, which needs #1 first. Sequence it after
  the power-duration curve exists. When it lands, use the **differential**
  (Froncioni/Skiba/Clarke) form: O(n), no τ, streamable, and the default in the
  reference open-source implementation.
- **xPower / BikeScore as a second intensity family.** NP is already shipped and
  the two agree within a few watts. Two competing normalisations is a support
  burden with no athlete benefit.
- **Running effectiveness.** Near-circular when running power is itself derived
  from speed (§3.6).
- **Heart rate recovery.** Genuinely interesting, but extractable from maybe
  10–20 % of uploads (most activities stop at the effort). If built, it must
  report _why_ it is unavailable, and it should be framed as a personal trend,
  never against the clinical ≤ 12 bpm cutoff, which is a mortality marker and
  not an athlete threshold.
- **Running dynamics (GCT, VO, vertical ratio).** Requires fields the current
  ingest path does not carry, and every value is speed- and height-dependent, so
  only "at matched pace over time" presentations are defensible. Low
  value-per-unit-work relative to everything above.

**Cross-cutting recommendation.** Almost every metric here is a _conditional_
metric: it is only meaningful under preconditions (steady session, minimum
duration, present channel, present threshold, adequate sample resolution). The
codebase already has the right primitive for this in **Unavailable Metric** with
a written reason. The design suggestion is to make that explicit and uniform:
each derived metric declares its preconditions as data, and a single evaluator
returns either a value with a confidence, or an unavailability with a
human-written reason. This should be a decision, not a habit: today the pattern
is applied case by case, and every metric added without it is a future
embarrassment. That prevents the failure mode this whole document warns about —
a confidently rendered number that happens to be meaningless for this particular
session.

### ADRs this research challenges

| ADR                                                                                           | What it decided                                                                                                                                  | What the evidence says                                                                                                                                                                                                                                             | Verdict       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **0020** — store only a downsampled stream, derive nothing at ingest                          | Bucket-mean grid, ≥5 s floor / ≤1000 samples, channels `timeSec` / `power` / `heartrate` / `pace`; "recomputing from streams stays out of scope" | Right for the overlay, wrong as the app's only telemetry record. Bucket means bias every short-duration peak low, and the missing `distance` / `altitude` channels make GAP, NGP and distance-based bests impossible outright (§3.1–§3.4, §4.4)                    | **Supersede** |
| **0021** — Personal Records are derived, never authored; `BenchmarkKind` reserved for streams | `farthest` only in v1; trust gate on Load Confidence `high`/`medium`                                                                             | Correct, and the reserved union is the right slot. The mean-maximal ladder (§4.4) is exactly what unblocks it — no change to the detection contract needed                                                                                                         | **Confirm**   |
| **0024** — true NP from the stream; average power falls back at `medium`                      | 30 s rolling window sized `ceil(30/res)`, `null`-skipping, usable-stream gate, confidence demotion                                               | §1.1 derives the same edge-case list independently. Keeping the average-power rung at a lower confidence is more truthful than dropping real data                                                                                                                  | **Confirm**   |
| **0038 §3** — running power is uncapped because it is "a direct mechanical measurement"       | No HR-style trust cap for running-power classification                                                                                           | The conclusion holds — running power is a dose variable, which is what the cap exists to punish. The stated reason does not: it is **modelled** from speed, grade and mass, so cross-vendor values differ 20–30 % and the threshold must be provider-scoped (§3.5) | **Amend**     |
| **0034 §3** — `recorded` / `detected` sessions compute no Planned TSS                         | A plan reconstructed from the actuals cannot be graded against them                                                                              | Right, and unimprovable. The gap it leaves is filled by describing the session (§10.2), not by inventing a prescription                                                                                                                                            | **Confirm**   |
| **0033 / 0035** — zone resolution, band separation, confidence vocabulary                     | One anchor-channel resolver, one honesty gate, one high/medium/low grade                                                                         | Session classification is a simpler sibling of Structure Detection and should reuse all three rather than grow a parallel set                                                                                                                                      | **Confirm**   |

---

## Uncertainty flags

- **GAP coefficients**: no vendor publishes them. The Strava figures in §3.2 (−9
  % / 0.88 / back to 1.0 at −18 %) are read off published plots in Strava's own
  engineering blog, not from released coefficients. Minetti is the only
  reproducible curve.
- **NP short-activity behaviour**: the "< 20 min is unreliable" guidance is
  widely repeated coaching lore attributed to Coggan, but I did not find a
  primary published cutoff. Treat the number as a convention, not a finding.
- **NGP's exact algorithm** is unpublished. GOVSS/LNP (§3.4) is the specified
  open equivalent, and it uses a **120 s** window for speed/slope and 30 s for
  power — a detail worth noting if you ever compare your NGP to another app's.
- **CHO fraction by intensity** (§7.3 table) is an approximation of a
  continuous, individually variable relationship (RER-derived). The _intake_
  recommendations (60 / 90 g/h) are far better established than the
  _expenditure_ split.
- **W'bal τ constants** (546, −0.01, 316) come from Skiba's original fitting on
  a modest sample and have been revised in later work (e.g. Bartram's faster
  recovery constants for elite riders). They are not universal.
- **Zone-boundary cut points** in §10.2 (0.08, 0.12, 0.25, 0.85) are my own
  reasonable defaults, not published values. They need calibration against real
  sessions.

---

## References

**Power**

- Allen & Coggan, _Training and Racing with a Power Meter_ — formulas summarised
  at
  [Critical Powers: Formulas from Training and Racing with a Power Meter](https://medium.com/critical-powers/formulas-from-training-and-racing-with-a-power-meter-2a295c661b46)
  and
  [gssns.io mirror](https://gssns.io/posts/formulas-training-racing-power-meter/)
- [TrainerRoad: Normalized Power — what it is and how to use it](https://www.trainerroad.com/blog/normalized-power-what-it-is-and-how-to-use-it/)
- [GoldenCheetah users: Calculating xPower](https://groups.google.com/d/topic/golden-cheetah-users/FqxV3d0HneI)

**Critical power / W'bal**

- Morton RH, "A 3-parameter critical power model", _Ergonomics_ 39(4):611–619,
  1996 —
  [abstract](https://www.tandfonline.com/doi/abs/10.1080/00140139608964484)
- Skiba PF et al., "Modeling the expenditure and reconstitution of work capacity
  above critical power", _Med Sci Sports Exerc_ 2012
- [Mark Liversedge: W'bal, its implementation and optimisation](http://markliversedge.blogspot.com/2014/07/wbal-its-implementation-and-optimisation.html)
- [Critical Powers: Comparison of W'balance algorithms](https://medium.com/critical-powers/comparison-of-wbalance-algorithms-8838173e2c15)
  ([mirror](https://gssns.io/posts/w-prime-balance-algorithms/))
- [sweatpy `w_prime_balance.py`](https://github.com/GoldenCheetah/sweatpy/blob/master/sweat/pdm/w_prime_balance.py)
  — reference implementations of all three variants
- [sweatpy docs: power duration modelling](https://sweatpy.gssns.io/features/Power%20duration%20modelling/)
- [GoldenCheetah `RideFileCache.cpp`](https://github.com/GoldenCheetah/GoldenCheetah/blob/master/src/FileIO/RideFileCache.cpp)
  — mean-maximal caching

**Pace and grade**

- Minetti AE, Moia C, Roi GS, Susta D, Ferretti G, "Energy cost of walking and
  running at extreme uphill and downhill slopes", _J Appl Physiol_ 93:1039–1046,
  2002 —
  [APS](https://journals.physiology.org/doi/full/10.1152/japplphysiol.01177.2001),
  [PDF](http://runscribe.com/wp-content/uploads/power/Minetti2002.pdf)
- [Strava Engineering: An Improved GAP Model](https://medium.com/strava-engineering/an-improved-gap-model-8b07ae8886c3)
- [Strava Engineering: Improving Grade Adjusted Pace](https://medium.com/strava-engineering/improving-grade-adjusted-pace-b9a2a332a5dc)
- [Strava Help: Grade Adjusted Pace (GAP)](https://support.strava.com/en-us/articles/15402117-grade-adjusted-pace-gap)
- [Aaron Schroeder: Reverse-engineering Strava's Grade Adjusted Pace](https://aaron-schroeder.github.io/reverse-engineering/grade-adjusted-pace.html)
- Skiba PF, "Calculation of power output and quantification of training stress
  in distance runners" (GOVSS) —
  [PDF](https://runscribe.com/wp-content/uploads/power/GOVSS.pdf);
  [GoldenCheetah `GOVSS.cpp`](https://github.com/GoldenCheetah/GoldenCheetah/blob/master/src/Metrics/GOVSS.cpp)
- [TrainingPeaks: What is Normalized Graded Pace?](https://www.trainingpeaks.com/learn/articles/what-is-normalized-graded-pace/)
- [Ron George: Technical review of the GOVSS running power model](http://www.georgeron.com/2017/11/the-govss-running-power-algorithm-and.html)

**Heart rate**

- Cole CR, Blackstone EH, Pashkow FJ, Snader CE, Lauer MS, "Heart-rate recovery
  immediately after exercise as a predictor of mortality", _N Engl J Med_
  341:1351–1357, 1999 —
  [NEJM](https://www.nejm.org/doi/full/10.1056/NEJM199910283411804)
- [Joe Friel / TrainingPeaks: Aerobic endurance and decoupling](https://www.trainingpeaks.com/coach-blog/aerobic-endurance-and-decoupling/)

**Energy and fuelling**

- Keytel LR et al., "Prediction of energy expenditure from heart rate monitoring
  during submaximal exercise", _J Sports Sci_ 23(3):289–297, 2005 —
  [record](https://www.semanticscholar.org/paper/Prediction-of-energy-expenditure-from-heart-rate-Keytel-Goedecke/2f647f62e650bf7df32546e541af3cf155297749)
- Jeukendrup AE, "Carbohydrate feeding during exercise", _Eur J Sport Sci_
  8(2):77–86, 2008 —
  [Wiley](https://onlinelibrary.wiley.com/doi/10.1080/17461390801918971)
- Jeukendrup AE, "A step towards personalized sports nutrition: carbohydrate
  intake during exercise", _Sports Med_ 44(S1):25–33, 2014 —
  [Springer](https://link.springer.com/article/10.1007/s40279-014-0148-z)
- [GSSI SSE #108: Multiple transportable carbohydrates and their benefits](https://www.gssiweb.org/sports-science-exchange/article/sse-108-multiple-transportable-carbohydrates-and-their-benefits)
- [Stages Cycling: Watts to kJ to kcal](https://stagescycling.com/en_us/content/what-it-means-watts-to-kjs-to-kcals)
- [CTS: Energy expenditure — calories, kilojoules and power](https://trainright.com/energy-expenditure-calories-kilojoules-and-power-in-cycling/)

**Elevation, time base, dynamics**

- [Strava: Elevation FAQs](https://support.strava.com/hc/en-us/articles/115001294564-Elevation-on-Strava-FAQs)
- [RUNALYZE: Elevation help](https://runalyze.com/help/article/elevation)
- [Strava: Moving time, speed and pace calculations](https://support.strava.com/en-us/articles/15401804-moving-time-speed-and-pace-calculations)
- [Strava Engineering: Improving auto-pause for everyone](https://medium.com/strava-engineering/improving-auto-pause-for-everyone-13f253c66f9e)
- [Garmin: Running Dynamics (owner's manual)](https://www8.garmin.com/manuals/webhelp/GUID-9D99A9D4-467A-4F1A-A0EA-023184FEA3DD/EN-US/GUID-62A09512-518A-424A-8491-FE2B80CD2091.html)
- [RUNALYZE glossary: Running Effectiveness](https://runalyze.com/glossary/running-effectiveness)
- Imbach F et al., "Is running power a useful metric? Quantifying training
  intensity and aerobic fitness using running power near the maximal lactate
  steady state", _Sensors_ 2023 —
  [PubMed](https://pubmed.ncbi.nlm.nih.gov/37960430/)

**Perceived exertion**

- Borg G, _Borg's Perceived Exertion and Pain Scales_, Human Kinetics, 1998
- Foster C et al., "A new approach to monitoring exercise training", _J Strength
  Cond Res_ 15(1):109–115, 2001
- Haddad M, Stylianides G, Djaoui L, Dellal A, Chamari K, "Session-RPE method
  for training load monitoring: validity, ecological usefulness, and influencing
  factors", _Front Neurosci_ 11:612, 2017 —
  [Frontiers](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/full)
