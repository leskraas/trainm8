# Training load quantification and the fitness / fatigue / form model

Research note. Primary sources cited inline and collected under
[References](#references). Vendor-neutral: where a behaviour is a product
convention rather than published science, it is described as "a common approach"
and flagged as such.

## TL;DR

- **One score, many formulas.** Every mainstream per-activity load score is the
  same shape — `load = duration × f(intensity / threshold)` — normalised so that
  **one hour at threshold = 100**. What differs is which channel supplies
  "intensity" (power, HR, pace, RPE) and the exponent on the intensity ratio (2
  for bike/run pace, ~3 for swim, ~3.1 for running power, an exponential for
  TRIMP). Picking a formula is therefore a _data-availability_ decision, not a
  physiology decision — which is exactly what ADR 0008's fallback chain encodes.
- **CTL/ATL are not "42-day and 7-day averages"** — they are first-order
  exponential filters with _time constants_ of 42 and 7 days:
  `CTL_t = CTL_{t−1}·e^{−1/42} + TSS_t·(1 − e^{−1/42})`. Half-lives are ≈29.1
  and ≈4.85 days. Their steady state equals mean daily TSS **regardless of the
  time constant** — changing 42/7 changes responsiveness and lag, never the
  plateau.
- **The two real implementation ambiguities are (a) whether TSB is
  `CTL_today − ATL_today` or `CTL_yesterday − ATL_yesterday`, and (b) what CTL
  is seeded to at t=0.** Neither is settled by any published source; both
  visibly move an athlete's numbers. GoldenCheetah's glossary uses the
  _yesterday_ convention; most consumer charts use _today_.
- **Form zones (>+25 / +5..+25 / −10..+5 / −10..−30 / <−30) are Joe Friel's
  coaching heuristic, published on his own blog, not a validated model.** Same
  for ramp rate (5–8 CTL/wk Friel, 3–5 conservative), monotony >2.0, and the
  ACWR "sweet spot" 0.8–1.3. ACWR in particular has been formally attacked as
  mathematically coupled and non-causal; a correction/retraction of its founding
  figure was requested in BJSM.
- **Nothing in the literature prices a lifting session in TSS.** Resistance
  training is quantified as volume load (`Σ sets × reps × load`) or sRPE, both
  in their own units. trainm8's ADR 0046 §2 (strength contributes no TSS) is the
  position the evidence supports; the alternative would require an hours ×
  assumed-intensity conversion with no published anchor.

---

## 1. Per-activity load scores

### 1.1 The common shape

All of the "…TSS" family normalise to the same reference point: **100 points =
one hour at the discipline's threshold**. The generic form is

```
TSS = (duration_hours) × (intensity / threshold)^k × 100
```

with `k = 2` for power and running pace, and larger exponents where the
intensity–cost relationship is steeper (see §1.5, §1.6).

### 1.2 Coggan TSS (power)

Developed by Andy Coggan and Hunter Allen (_Training and Racing with a Power
Meter_). Published form:

```
TSS = (t_sec × NP × IF) / (FTP × 3600) × 100
    = IF² × t_hours × 100

IF  = NP / FTP
```

Normalized Power is a four-step algorithm on the power stream:

```
1. 30-second rolling mean of power  ->  s_i
2. raise each s_i to the 4th power
3. take the arithmetic mean of those
4. take the 4th root
NP = ( mean(s_i^4) )^(1/4)
```

Rationale given by the authors: physiological responses to intensity changes are
not instantaneous (hence the 30 s smoothing) and several key responses are
curvilinear, not linear, in intensity (hence the 4th power). See
[TrainingPeaks: NP, IF and TSS](https://www.trainingpeaks.com/learn/articles/normalized-power-intensity-factor-training-stress/)
and a worked derivation at
[ssp3nc3r, _Calculating training load in cycling_](https://ssp3nc3r.github.io/post/2020-05-08-calculating-training-load-in-cycling/).

This matches trainm8's ADR 0024 / CONTEXT definition of NP exactly, including
the "average power stands in at medium confidence" degradation.

### 1.3 rTSS (running, pace-based)

```
rTSS = IF² × t_hours × 100
IF   = NGP / FTPace          (both as speeds, or invert if using pace units)
```

**NGP (Normalized Graded Pace)** is the GPS pace adjusted for grade so that it
reflects the metabolic cost of running the same effort on the flat, then passed
through the same 30 s-smoothing / 4th-power normalisation idea as NP. The exact
grade-adjustment curve is proprietary; open reimplementations use published
running-economy-vs-grade data (Minetti et al. 2002) instead. **Flag: the exact
NGP curve is not published — any implementation is a reconstruction.**

Known failure mode, acknowledged by the algorithm's own vendor: on technical
trail, soft surface, or heavy-pack running, NGP underestimates cost and rTSS
comes out low; the documented remedy is to fall back to hrTSS for those
activities
([TrainingPeaks: Low rTSS and trail running](https://help.trainingpeaks.com/hc/en-us/articles/205229730-Low-rTSS-and-Trail-Running)).
This is the same objection ADR 0008 used to reject pace-first for run.

### 1.4 hrTSS (heart rate)

Two distinct implementations circulate, and they do not agree:

**(a) Time-in-zone table.** Accumulate minutes in %LTHR bands and multiply each
by a TSS-per-hour coefficient. The band edges in common use:

| Zone | %LTHR     |
| ---- | --------- |
| 1    | < 85 %    |
| 2    | 85–89 %   |
| 3    | 90–94 %   |
| 4    | 95–99 %   |
| 5a   | 100–102 % |
| 5b   | 103–106 % |
| 5c   | > 106 %   |

Joe Friel's own worked examples on his blog give the coefficients only
partially: zone 1 ≈ 10 TSS/h, zone 2 ≈ 60 TSS/h ("a steady 90-minute workout at
an average heart rate of high zone 2 would be a TSS estimate of 90 (60 × 1.5)"),
zone 5a ≈ 50 TSS for the illustrated segment
([Friel, _Estimating TSS_](http://www.trainingbible.com/joesblog/2009/09/estimating-tss.html)).
**Flag: the full table only ever existed as an image, and that image is now a
dead link on the author's blog. Any complete zone→TSS/h table you find online is
reverse-engineered.**

**(b) TRIMP-normalised (often called HRSS).** Compute a per-sample Banister
TRIMP over the activity and normalise by the TRIMP of one hour at LTHR:

```
HRSS = 100 × TRIMP_activity / TRIMP(1 hour at LTHR)
```

This is cleaner, continuous (no band edges), needs only HRrest/HRmax/LTHR, and
is what GoldenCheetah calls **TRIMP(100) Points** ("same as TRIMP Points but
scaled so 1 hour at LTHR gives 100 points",
[GC glossary](https://github.com/GoldenCheetah/GoldenCheetah/wiki/UG_Glossary)).
**Recommendation: (b) is the better hrTSS.** It is monotone, has no cliff at a
band edge, and reduces exactly to 100 for the reference hour by construction.

### 1.5 sTSS (swim)

```
sTSS = t_hours × IF^k × 100
IF   = CSS_pace / actual_pace      (as speeds: NSS / CSS speed)
```

**Flag: sources disagree on `k`.** Some state `k = 2` (identical to bike/run),
others `k = 3`, arguing that hydrodynamic drag rises ~with the square of speed
so power rises ~with the cube. The vendor documentation states only that sTSS is
"based on your functional threshold swim pace, total distance covered, and total
_moving_ duration (excluding rest)" without publishing the exponent
([TrainingPeaks: Calculating swimming TSS](https://www.trainingpeaks.com/learn/articles/calculating-swimming-tss-score/)).
Note the moving-duration caveat: rest between intervals must be excluded or a
long masters set with 1:1 rest is priced as threshold work.

For trainm8 this interacts with the `css-3`/`css-5` Zone Recipes: whichever `k`
is chosen, it must be the same `k` the Volume Conversion uses to price a swim
zone, or measured and projected curves will step at today.

### 1.6 Running power (RSS / GOVSS)

Stryd's **Running Stress Score** uses critical power rather than FTP:

```
RSS = 100 × t_hours × (P / CP)^K
```

with `K` "significantly higher than that of cycling TSS", reflecting the
mechanical (not just metabolic) cost of running
([Stryd help](https://help.stryd.com/en/articles/6879537-running-stress-score-rss)).
Stryd does not publish `K`. A curve-fit against Stryd's own published example
table gives an _exponential_ rather than power form:

```
RSS/min = 0.0758 × exp(3.1297 × P/CP)      (R² ≈ 0.987)
```

([Ron George, _An equation for Running Stress Score_](http://www.georgeron.com/2017/08/an-equation-for-running-stress-score-rss.html)).
**Flag: reverse-engineered, not published.**

**GOVSS** (Gravity Ordered Velocity Stress Score, Phil Skiba) is the open
alternative — it models running power from velocity, grade, air resistance and
efficiency, then applies the TSS shape against velocity at lactate threshold
(estimated from a 10 km–1 h maximal run). Technical review:
[georgeron.com on GOVSS](http://www.georgeron.com/2017/11/the-govss-running-power-algorithm-and.html).

This is directly relevant to trainm8's ADR 0038 decision that running power is a
direct measurement and therefore _not_ HR-capped for Detection Confidence: the
same argument says a running-power TSS should carry `high` confidence.

### 1.7 Session RPE (Foster)

```
sRPE_load = RPE(CR-10) × session_duration_minutes        [arbitrary units, AU]
```

Foster et al. 2001, _A new approach to monitoring exercise training_, J Strength
Cond Res 15(1):109–115. RPE is collected on Borg's **CR-10** scale (0–10), **~30
minutes after** the session ends so that the last interval does not dominate the
rating. Validated against a HR-zone reference across steady-state and interval
exercise. [PubMed 11708692](https://pubmed.ncbi.nlm.nih.gov/11708692/) ·
[full text PDF](https://paulogentil.com/pdf/A%20New%20Approach%20to%20Monitoring%20Exercise%20Training.pdf)
· review:
[Haddad et al. 2017, Front Neurosci](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/full).

Two things to note:

1. **sRPE units are AU, not TSS.** 60 min at RPE 7 = 420 AU. To feed a
   TSS-scaled series it must be rescaled. A common rescaling anchors RPE→TSS/h;
   Friel's published anchors are RPE 6 ≈ 70 TSS/h and RPE 4 ≈ 50 TSS/h (from his
   worked examples — again the full table is a dead image).
2. Note trainm8's CONTEXT defines RPE as **1–10**, whereas Foster's method is
   CR-10 (**0–10**, where 0 = rest). Minor, but it changes the bottom of the
   scale.

### 1.8 Choosing one formula per activity

No paper prescribes a priority order; this is entirely a product convention. The
convention that has converged across implementations is
**most-direct-measurement first, within discipline**:

```
bike : power stream + FTP        -> Coggan TSS      (high)
       avg power only            -> Coggan TSS      (medium)
       HR + LTHR                 -> hrTSS           (medium)
       RPE + duration            -> sRPE            (low)

run  : running power + CP        -> RSS/GOVSS       (high)
       pace + grade + FTPace     -> rTSS            (high, low on trail)
       HR + LTHR                 -> hrTSS           (medium)
       RPE + duration            -> sRPE            (low)

swim : pace + CSS                -> sTSS            (high)
       RPE + duration            -> sRPE            (low)
```

Two design constraints that are _not_ obvious and that ADR 0008 already got
right:

- **Cross-formula comparability is fragile.** Coggan TSS and hrTSS for the same
  ride commonly diverge 10–20 %. If the priority order is evaluated per
  activity, an athlete whose HR strap died mid-block gets a CTL discontinuity
  for a hardware reason. Pinning the formula _per discipline profile_ rather
  than per activity (ADR 0008) removes that class of artefact.
- **Switching formula rewrites history.** Any change to the chain — new power
  meter, new threshold, new default — moves every downstream CTL value. This is
  precisely the Load Recompute Notice problem.

---

## 2. TRIMP variants — exact formulas

Let

```
ΔHR = (HR_exercise − HR_rest) / (HR_max − HR_rest)      [heart rate reserve fraction, 0..1]
D   = duration in minutes
```

### 2.1 Banister TRIMP (with Morton's exponential weighting)

```
TRIMP = D × ΔHR × Y

Y = 0.64 × e^(1.92 × ΔHR)     for men
Y = 0.86 × e^(1.67 × ΔHR)     for women
```

Origin: Banister, Calvert, Savage & Bach 1975, _A systems model of training for
athletic performance_, Aust J Sports Med 7:57–61
([citation](https://www.sciepub.com/reference/104335)); the exponential
weighting factor `Y` and its sex-specific coefficients come from fitting the
blood-lactate vs %HRR curve, refined in Morton, Fitz-Clarke & Banister 1990,
_Modeling human performance in running_, J Appl Physiol 69(3):1171–1177
([DOI 10.1152/jappl.1990.69.3.1171](https://journals.physiology.org/doi/abs/10.1152/jappl.1990.69.3.1171)).

Notes:

- Apply per sample and sum (`Σ dt × ΔHR × 0.64·e^(k·ΔHR)`) rather than to the
  session mean HR. Applied to mean HR, an interval session and a steady session
  with the same average score identically — the exponential is the whole point,
  and it only bites on a sample-by-sample basis.
- Requires **HRrest and HRmax**, not just LTHR. Both are the sloppiest numbers
  in an athlete profile.
- The sex coefficients are a two-group fit from 1990. Treat them as a modelling
  convention, not a physiological constant.

### 2.2 Edwards TRIMP (zone-weighted / summated heart rate zones)

```
TRIMP_Edwards = Σ_{i=1..5} ( minutes_in_zone_i × i )

zone 1: 50–59 % HRmax   × 1
zone 2: 60–69 % HRmax   × 2
zone 3: 70–79 % HRmax   × 3
zone 4: 80–89 % HRmax   × 4
zone 5: 90–100 % HRmax  × 5
```

Edwards 1993, _The heart rate monitor book_. Linear weights, %HRmax anchored (no
HRrest needed). Cheap; coarse; discontinuous at band edges.

### 2.3 Lucia TRIMP

```
TRIMP_Lucia = 1×min(Z1) + 2×min(Z2) + 3×min(Z3)

Z1 = below VT1  (ventilatory threshold 1)
Z2 = VT1 .. VT2
Z3 = above VT2
```

Lucia et al. 2003. Same linear-weight idea as Edwards, but with band edges that
are _physiologically_ placed (the two ventilatory thresholds bounding the three
metabolic domains) rather than at arbitrary %HRmax deciles. Trade-off: it needs
a lab test or a reliable field proxy for VT1/VT2.

### 2.4 iTRIMP (Manzi)

Replaces the population coefficients in §2.1 with a per-athlete exponential
fitted to that athlete's own blood-lactate–vs–HR curve from an incremental test,
applied per HR sample rather than per zone. Manzi et al. 2009, _Relation between
individualized training impulses and performance in distance runners_
([ResearchGate](https://www.researchgate.net/publication/26879362_Relation_between_Individualized_Training_Impulses_and_Performance_in_Distance_Runners)).
Best-validated of the family and completely impractical without lab access — a
useful thing to _name_ as unavailable rather than approximate.

### 2.5 HRR-based vs %HRmax-based

Banister/iTRIMP use **heart rate reserve** (needs HRrest + HRmax); Edwards uses
**%HRmax** (needs HRmax only); the hrTSS zone table uses **%LTHR** (needs LTHR
only). These are not interchangeable: for a typical athlete, 70 % HRmax ≈ 55 %
HRR ≈ 80 % LTHR. Whichever anchor is chosen must be the one the Zone Recipe
already uses, or zone boundaries and load will disagree with each other.

---

## 3. The impulse-response model: CTL, ATL, TSB

### 3.1 Origin

Banister's systems model (1975; Calvert et al. 1976, _A systems model of the
effects of training on physical performance_, IEEE Trans Syst Man Cybern
6:94–102) models performance as the superposition of two first-order responses
to a training impulse:

```
p(t) = p0 + k1·g(t) − k2·h(t)
```

where `g` (fitness) has a long time constant τ1 and `h` (fatigue) a short one
τ2, and both satisfy the same recurrence with different τ. Morton 1990 fitted τ1
≈ 45–50 d, τ2 ≈ 11–15 d, with k2 > k1 (fatigue is larger per unit but decays
faster). See also Busso et al. 1994, _Fatigue and fitness modelled from the
effects of training on performance_
([DOI 10.1007/BF00867927](https://link.springer.com/article/10.1007/BF00867927)),
and the limitations critique Hellard et al. 2006, _Assessing the limitations of
the Banister model in monitoring training_
([PMC1974899](https://pmc.ncbi.nlm.nih.gov/articles/PMC1974899/)).

The **Performance Management Chart** (Coggan/Allen) is a deliberately simplified
version: keep the two exponential filters, drop the fitted `k1`/`k2`, fix the
time constants at 42 and 7 days, and report the two states directly (CTL, ATL)
plus their difference (TSB) instead of a predicted performance. Mark Liversedge
documents the difference and a real Banister implementation for GoldenCheetah at
[markliversedge.blogspot.com](http://markliversedge.blogspot.com/2019/01/implementing-banister-impulse-response.html).

### 3.2 Exact recurrence

The **exponential** (correct) form:

```
CTL_t = CTL_{t−1} · e^(−1/42) + TSS_t · (1 − e^(−1/42))
ATL_t = ATL_{t−1} · e^(−1/7)  + TSS_t · (1 − e^(−1/7))
TSB_t = CTL − ATL
```

with

```
e^(−1/42) = 0.9764585…      1 − e^(−1/42) = 0.0235415…
e^(−1/7)  = 0.8668779…      1 − e^(−1/7)  = 0.1331221…
```

The **linear/discrete** approximation that also circulates (and that
GoldenCheetah notes as "Coggan's original formula"):

```
CTL_t = CTL_{t−1} + (TSS_t − CTL_{t−1}) / 42
ATL_t = ATL_{t−1} + (TSS_t − ATL_{t−1}) / 7
```

i.e. α = 1/42 = 0.023810 and α = 1/7 = 0.142857. **These differ from the
exponential form by ~1 % on CTL and ~7 % on ATL per step.** Pick one and never
mix them.

**A third convention is a trap.** Pandas/`ewm(span=N)` uses `α = 2/(N+1)`,
giving α = 2/43 = 0.0465 for "42" and 2/8 = 0.25 for "7" — roughly _double_ the
correct decay. Code that reaches for a stdlib EWMA helper will silently produce
a different, faster-moving CTL. If any trainm8 code path uses a library EWMA, it
must pass `alpha=` explicitly, not `span=`.

### 3.3 Derived constants

| Quantity                                   | CTL (τ=42) | ATL (τ=7) |
| ------------------------------------------ | ---------- | --------- |
| daily decay factor                         | 0.97646    | 0.86688   |
| daily weight on today's TSS                | 0.023542   | 0.133122  |
| half-life (`τ·ln2`)                        | 29.1 d     | 4.85 d    |
| 63 % of a step response                    | 42 d       | 7 d       |
| 95 % of a step response (`3τ`)             | 126 d      | 21 d      |
| steady state under constant daily load `L` | `L`        | `L`       |

The last row is the most under-appreciated fact in the whole model: **at steady
state CTL = ATL = mean daily TSS, and TSB = 0, for any time constants.** τ
controls only lag and smoothing.

### 3.4 Is today's load included?

Unsettled, and it matters visibly.

- The recurrence as written above **includes today's TSS in today's CTL/ATL**.
  This is what most consumer charts show.
- GoldenCheetah's glossary defines TSB as "the result of subtracting
  **yesterday's** ATL from **yesterday's** CTL"
  ([GC glossary](https://github.com/GoldenCheetah/GoldenCheetah/wiki/UG_Glossary)).
  The argument is behavioural: form should answer "how fresh am I _before_
  today's session", so today's planned work must not depress today's form
  reading.

**Flag: no primary source resolves this.** For a product whose headline surface
is a daily "go hard or recover?" answer, the _yesterday_ convention is the
defensible one — otherwise logging today's session retroactively degrades the
advice that told you to do it. State the convention in the UI copy.

### 3.5 Seeding and initial values

Also unpublished. Options in the wild:

1. **CTL_0 = ATL_0 = 0.** Simple and honest, but the curve is materially wrong
   for ~3τ ≈ 126 days. Anyone importing history sees a fake 4-month "build".
2. **Seed CTL_0 to the athlete's estimated recent average daily TSS**, ATL_0 to
   the same value (so TSB starts at 0). Used by "estimate starting fitness"
   flows.
3. **Backfill enough real history that seeding is irrelevant.** With 3τ = 126
   days of real data the seed contributes < 5 %.

trainm8's Backfill Window (≥50 modelled workouts, ≥42-day floor, ≤365-day cap)
sits between (1) and (3): 42 days is only _one_ time constant, so a zero-seeded
CTL is still ~37 % low at the join. Two consequences: keep the "building
baseline — day N/42" caveat (it is the right idea) but recognise that **42 days
is not enough for CTL to be right — it is enough for it to be non-absurd**; and
prefer pushing backfill toward 126 days where the provider allows it.

### 3.6 Rest days

`TSS_t = 0` — nothing special happens, the filters just decay:

```
CTL after n rest days = CTL_0 × 0.97646^n
ATL after n rest days = ATL_0 × 0.86688^n
```

A 7-day rest week costs ≈16 % of CTL and ≈63 % of ATL — which is exactly the
mechanism that makes a taper raise TSB. Note that a _missing_ day (no data) and
a _rest_ day (zero load) must be treated identically as `TSS = 0`, or the series
becomes dependent on sync latency. trainm8 already does this via `LoadSnapshot`
rows existing for every day.

---

## 4. Form (TSB) zones

Joe Friel's zones, from his own blog
([_Managing training using TSB_](https://joefrieltraining.com/managing-training-using-tsb/),
and
[_Part 3: Training stress balance — so what?_](https://joefrieltraining.com/part-3-training-stress-balanceso-what/)):

| Zone                         | TSB       | Meaning                                             | Decision                                                                                                                      |
| ---------------------------- | --------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Transition** (grey/orange) | > +25     | "Very safe, but fitness is also very low"           | End-of-season break, or forced layoff from injury/illness. Not a place to be mid-season.                                      |
| **Fresh / Freshness** (blue) | +5 … +25  | Peak readiness                                      | Race day. Individual: some peak at +20…+25, others at +5…+10.                                                                 |
| **Grey Zone**                | −10 … +5  | Little adaptive stimulus, little recovery           | Recovery weeks, early taper, return from a break. Brief passage only — "you don't want to spend too much training time here". |
| **Optimal Training** (green) | −10 … −30 | "Typically when the most effective training occurs" | The place to live during build blocks.                                                                                        |
| **High Risk** (red)          | < −30     | Significant fatigue, overtraining risk              | Only a few days at a time, then back off.                                                                                     |

Caveats worth carrying into product copy:

- Friel states explicitly that the boundaries are individual and should be
  adjusted per athlete.
- These are **coaching heuristics published on a coach's blog**, with no
  controlled validation. There is no paper establishing −30 as a risk threshold.
- The zones assume a _trustworthy_ CTL. With a zero-seeded 3-week history, TSB
  is dominated by seeding error, not by physiology — which is why trainm8's
  "building baseline" gate on the Coach card is the right shape.
- TSB is scale-free in the wrong direction: −25 means something very different
  to a CTL-40 athlete than to a CTL-110 athlete. Some implementations therefore
  offer **Form % = TSB / CTL × 100** as an alternative axis (a common approach;
  no primary source). Worth considering as a secondary read.

---

## 5. Ramp rate

Definition (GoldenCheetah glossary): _"the rate at which CTL increases per ATL
period, 7 days by default"_. Concretely:

```
RampRate_t = CTL_t − CTL_{t−7}          [CTL points per week]
```

Some implementations divide a longer window to weekly units, e.g.
`(CTL_t − CTL_{t−28}) / 4`. Both are in circulation; the 7-day difference is
noisier but responds within a microcycle.

Published guidance:

| Source                                                                                                    | Recommendation                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Friel, _The CTL ramp rate_](https://joefrieltraining.com/the-ctl-ramp-rate/)                             | **5–8 CTL/week** for most athletes. Below that, "not very focused"; above, "crash training load range".                                                                                                                        |
| [Couzens, _CTL ramp rates, TSB floors & loading patterns_](https://www.alancouzens.com/blog/CTLramp.html) | **3–5 CTL/week** conservative (≈10–20 per 4-week block) is preferable long-term for most high-performance athletes; 5–8 for robust athletes. TSB floor ≈ −20 at the end of a 3-week load block (−40 for exceptional athletes). |
| Couzens' "1,2,3 rule"                                                                                     | Loading-day TSS ≈ CTL + 30; TSB floor ≈ −20; recovery-week TSS ≈ CTL − 30 (returns TSB to ≈0). Yields ≈10 CTL/month.                                                                                                           |

Elite athletes sustaining >10 CTL/week exist but are the exception.

**Terminology collision inside trainm8:** CONTEXT.md already reserves "ramp
rate" as _the TrainingPeaks metric over CTL_ and deliberately avoids it as a
synonym for **Volume Ramp**. Keep that separation — Volume Ramp is an _authored_
percentage on planned volume; ramp rate is a _derived_ CTL-point delta. They are
related (a 5 % weekly volume ramp on a CTL-70 athlete is roughly 3.5 CTL/week at
steady intensity mix) but they are not the same quantity and the guard rails
differ.

---

## 6. Related load-risk metrics

### 6.1 Acute:chronic workload ratio (ACWR)

```
ACWR_rolling = (mean daily load over last 7 d) / (mean daily load over last 28 d)

ACWR_EWMA    = EWMA_7(load) / EWMA_28(load),   λ_N = 2 / (N + 1)
               λ_7 = 0.250,  λ_28 = 0.0690
```

Note the EWMA variant uses the `2/(N+1)` convention (Williams et al. 2017),
which is _different_ from the CTL/ATL `e^{−1/τ}` convention in §3.2. Do not
assume ACWR's 7/28 filters are the same objects as ATL/CTL.

Popularised thresholds (Gabbett 2016, _The training–injury prevention paradox_):
"sweet spot" **0.8–1.3**, "danger zone" **> 1.5**. Coupled (acute inside
chronic) vs uncoupled (chronic excludes the acute week) forms both exist and
give different numbers.

**The criticism is severe and should be treated as decisive:**

- **Mathematical coupling / spurious correlation.** The numerator is part of the
  denominator in the coupled form; the ratio correlates with injury partly by
  construction.
- **Arbitrary windows.** No rationale is offered for 7 and 28 days specifically.
- **Ratio pathologies.** Undefined/exploding when chronic load is near zero
  (return from injury — exactly the population it is aimed at).
- **No causal model**, and dichotomising a continuous exposure into "zones"
  ("dichotomania").
- Impellizzeri et al. requested **formal correction or retraction** of the
  Blanch & Gabbett ACWR–injury-likelihood figure, noting it had been republished
  at least 7 times including in an IOC consensus statement where it was
  presented as validated.

Sources: Impellizzeri, Tenan, Kempton, Novak & Coutts 2020, _Acute:Chronic
Workload Ratio: Conceptual Issues and Fundamental Pitfalls_, IJSPP
15(6):907–913,
[DOI 10.1123/ijspp.2019-0864](https://journals.humankinetics.com/view/journals/ijspp/15/6/article-p907.xml);
Impellizzeri et al. 2020, _The acute-chronic workload ratio-injury figure and
its 'sweet spot' are flawed_, BJSM
([Semantic Scholar](https://www.semanticscholar.org/paper/The-acute-chronic-workload-ratio-injury-figure-and-Impellizzeri-Wookcock/d9f17d9d6cbd2c0195209fa2f5dc23af6fb97d61));
editorial overview
[Front Sports Act Living / PMC8138569](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8138569/);
2025 meta-analysis
[PMC12487117](https://pmc.ncbi.nlm.nih.gov/articles/PMC12487117/).

**Verdict for a product: do not ship ACWR as a risk gauge.** TSB already encodes
the same acute-vs-chronic information without the ratio pathology, and it does
not carry an injury-prediction claim the evidence cannot support.

### 6.2 Training monotony and strain (Foster)

```
Monotony_week = mean(daily load, 7 days) / SD(daily load, 7 days)
Strain_week   = Σ(daily load over the week) × Monotony_week
```

Foster 1998, _Monitoring training in athletes with reference to overtraining
syndrome_, Med Sci Sports Exerc 30(7):1164–1168; operationalised with sRPE in
Foster et al. 2001. Heuristic interpretation in common use: monotony **> 2.0**
is high/problematic, **< 1.5** preferable. **Flag: those cut points are
practitioner convention, not a validated threshold.**

Implementation gotchas that bite:

- **Rest days must be included as zeros**, or monotony is meaningless (a 4-day
  athlete training identically 4× looks maximally monotonous only if the 3 zeros
  are counted; excluding them inflates the mean and deflates SD in opposite
  directions).
- **SD = 0 → division by zero.** Seven identical days is exactly the case the
  metric is about, and it blows up. Cap it, or report it as unavailable.
- Monotony is a genuinely _different_ signal from TSB: two weeks with identical
  CTL/ATL/TSB can have monotony 1.1 and 3.5. This is the cheapest useful metric
  on this whole page that trainm8 does not currently have.

### 6.3 Weekly load ceilings

No published universal ceiling exists in TSS units. What is published is
relative: the ramp-rate bounds in §5, and Couzens' loading-day heuristic
(`daily TSS ≈ CTL + 30`, i.e. weekly ceiling ≈ `7 × CTL + 210` in a load week,
with a recovery week at `7 × CTL − 210`). Any absolute "don't exceed X TSS/week"
number should be treated as fabricated.

---

## 7. Load for strength / non-cardio work

### 7.1 Why cardio platforms exclude it

Three independent reasons, all of which trainm8's ADR 0046 §2 already leans on:

1. **No threshold anchor.** Every …TSS is defined relative to a _sustainable
   metabolic_ threshold (FTP, LTHR, FTPace, CSS). Lifting has no such anchor —
   1RM is a single-effort maximum, not a one-hour sustainable intensity. There
   is nothing to divide by.
2. **Wrong axis of strain.** CONTEXT.md's Training Zone entry already states it:
   zones order work by _metabolic_ strain, and heavy/neuromuscular work is high
   mechanical cost at low metabolic cost. A 45-minute heavy squat session might
   be genuinely destructive and produce an hrTSS of 25.
3. **It corrupts the interpretation of CTL.** Once strength TSS is in the sum,
   "CTL 70" no longer means "70 TSS/day of endurance work", and the ramp-rate
   and TSB heuristics — all calibrated on endurance-only series — stop applying.

The failure mode of including it is specifically `hours × assumed intensity`,
which is a conversion with no published exchange rate. This is the same argument
ADR 0041/0045/0047 made against pricing sets in TSS.

### 7.2 What is used instead

```
Volume load (tonnage)  VL = Σ_sets (reps × external load)          [kg]
Total work             TW = Σ (force × displacement)               [J]
Session RPE            sRPE = RPE_CR10 × duration_min              [AU]
Hard sets              count of sets taken to RPE ≥ 7              [count]
```

- **Volume load** is the decades-old default in resistance-training literature.
  Its known weakness: it ignores displacement, so a 100 kg × 5 quarter-squat and
  a full-depth one score identically.
- **Total work** (force × displacement) has been judged "the most valid"
  quantification protocol but requires bar-path data
  ([PMC6316164](https://pmc.ncbi.nlm.nih.gov/articles/PMC6316164/)).
- **sRPE** is the standard _internal_ load counterpart and correlates with
  volume load, though the relationship is effort-type-dependent and sometimes
  inverse (heavy low-rep work: low volume load, high RPE)
  ([PMC11680556](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11680556/)).
- Recent work proposes muscle-physiology-based frameworks as an alternative
  ([PMC11768794](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11768794/)) —
  early, not deployable.

**No source converts any of these into TSS.** Cross-modality fatigue interaction
is real but unmodelled in the literature; naming it as unmodelled (as CONTEXT.md
does) is the honest position.

---

## 8. Custom time constants

Letting an athlete change 42/7 is a common capability. What actually changes:

| Effect                    | Shorter τ                                  | Longer τ                              |
| ------------------------- | ------------------------------------------ | ------------------------------------- |
| Steady-state value        | **unchanged** (= mean daily load)          | **unchanged**                         |
| Lag behind a load change  | shorter                                    | longer                                |
| Day-to-day volatility     | higher                                     | lower                                 |
| Peak TSB swing in a taper | ATL↓ → TSB recovers faster and peaks lower | ATL↑ → slower, deeper freshness build |
| Ramp rate readings        | inflated (CTL tracks load more closely)    | deflated                              |
| Time to trustworthy value | 3τ                                         | 3τ                                    |

Practical ranges seen in implementations: ATL 3–10 days (default 7), CTL 28–56
days (default 42) — see the
[GoldenCheetah glossary](https://github.com/GoldenCheetah/GoldenCheetah/wiki/UG_Glossary).
The physiological literature's own fitted values are _longer_ than the PMC
defaults: Morton 1990 fitted τ_fitness ≈ 45–50 d and τ_fatigue ≈ 11–15 d, i.e.
the PMC's 7-day ATL is markedly faster than the fitted fatigue decay. Coaching
guidance suggests shorter ATL for younger/faster-recovering athletes and longer
for older ones — **flag: this is practitioner heuristic, no controlled study
supports specific per-athlete values.**

Three product consequences:

1. **Changing τ retroactively rewrites the entire history**, including every
   number the athlete has already read. This is a Load Recompute Notice event by
   construction, not a preference toggle.
2. **All the published heuristics are calibrated on 42/7.** Friel's TSB zones,
   the 5–8 CTL/week ramp rate, the −30 risk floor: none of them transfer to a
   28/5 configuration. If custom constants ship, the zone boundaries must either
   move with them or be relabelled as approximate.
3. **The gain is small.** Since the steady state is invariant, the only thing an
   athlete buys is responsiveness. That is a real but narrow benefit for a
   feature that invalidates every published threshold.

---

## 9. Implications for trainm8

Read against [CONTEXT.md](../../CONTEXT.md) §Training load and
[ADR 0008](../adr/0008-tss-triad-with-hr-first.md). These are recommendations on
the evidence, not accommodations of what is already shipped. Where a shipped ADR
is wrong, it is named and should be replaced; where it is right, that is said
too.

**The design the evidence supports, in one paragraph.** Load is
`duration × f(intensity / threshold)`, one formula pinned per discipline
profile, most-direct-channel-first within the discipline — and that includes a
running-power rung the shipped chain does not have. The daily filters are
exponential (`e^{−1/τ}`) at fixed τ = 42/7, seeded at zero and gated until the
series has converged, with TSB read off _yesterday's_ states. HR-derived load is
computed as a continuous TRIMP normalised to one hour at LTHR, not as a
zone-table lookup whose coefficients were never fully published. Strength
contributes nothing to the triad. Monotony ships; ACWR does not. Nothing in that
list is a preference — each item is either the only documented option or the
only one that does not fabricate a number.

**1. Fix the EWMA convention in the ADR, not in code — ADR 0008 is incomplete
here and should be amended.** ADR 0008 fixes 42/7 but is silent on the
recurrence form, on whether today's load is included, and on the seed. Those
three choices move an athlete's numbers by more than the choice of formula does,
so leaving them to whichever helper a developer reaches for is not a deferral,
it is an undocumented decision. The right answers: the **exponential form**
(`e^{−1/τ}`; never `1/τ`, never a library `span=` that silently means `2/(N+1)`
and roughly doubles the decay), **TSB from yesterday's CTL/ATL** so the Coach
card's "go hard or recover?" answer is not perturbed by the session it is
recommending, and **CTL_0 = ATL_0 = 0** with the existing "building baseline"
gate rather than an estimated seed — a seed is a fabricated number, which the
Unavailable Metric doctrine already forbids. §3.4 flags that no primary source
resolves the yesterday/today question; that flag stands, and the tie is broken
on product-behaviour grounds, which must be stated in the UI copy rather than
implied.

**2. Extend the baseline gate from 42 days to ~126.** CTL reaches only ~63 % of
its true value in one time constant. The current "day N/42" copy implies the
number is right on day 43; it is ~37 % low. Either extend the gate to 3τ, or
change the copy to say the curve is still converging. This also argues for
raising `BACKFILL_MIN_DAYS` toward 126 where the provider allows it — 50
workouts is a better proxy than 42 days, and the count-based reach already
mostly gets there.

**3. hrTSS is the TRIMP(100) form. Replace the zone table.** `hrTSS` is the
default endurance formula (ADR 0008), which makes it the single most
load-bearing formula in the app — and the zone-table version of it is the one
whose published coefficients only ever existed as an image that is now a dead
link. Shipping the app's most-used number against a source nobody can read is
not defensible. `100 × TRIMP_activity / TRIMP(1h @ LTHR)` with per-sample
Banister weighting is continuous, fully documented (§2.1), computable from the
Activity Stream already stored (ADR 0020), and has no band-edge cliffs.

Two honest costs. First, it needs **HRrest and HRmax** on the Discipline
Profile, not just LTHR — ADR 0005 has neither field, so this is an additive
schema change, and Load Confidence must reflect it (`high` only when all three
are athlete-measured; `medium` when HRmax is age-predicted). Second, **it moves
every stored hrTSS value and therefore every CTL/ATL/TSB point in every
athlete's history** — a full recompute and a Load Recompute Notice. That cost is
real and should be planned for; it is not a reason to keep the wrong formula.

**4. Resolve the swim exponent explicitly.** `sTSS` is in the Load Formula
union, but `k = 2` vs `k = 3` is unresolved in the sources (§1.5) and changes a
CSS+10 % swim's load by ~10 %. Whichever is chosen must be the same exponent the
Volume Conversion uses to price a swim quality session, or the Fitness
Projection will step at today — which CONTEXT.md explicitly forbids.

**5. ADR 0008's run fallback chain is wrong as shipped and should be amended.**
ADR 0038 already ruled that running power is the truest available run intensity
signal and is not HR-capped; ADR 0008's run chain still goes pace → HR, so the
app classifies a run on power and then prices it on pace. That is an internal
contradiction, not a gap. Add a running-power rung above `rTSS`, taken whenever
a critical-power threshold is set. Use the open, published GOVSS formulation
rather than a reverse-engineered vendor exponent (§1.6), and keep the
trail-running case in view: `rTSS` is known to under-read there, which is the
same objection ADR 0008 originally used against pace-first.

**6. Ship training monotony; do not ship ACWR.** Monotony/strain (§6.2) is
Foster-published, computes from the `LoadSnapshot` series trainm8 already
materialises, needs no new data, and catches a failure mode TSB is blind to
(seven identical days). ACWR (§6.1) has had a formal retraction request filed
against its founding figure and would attach an injury-risk claim the evidence
cannot carry. Guard the two implementation traps: include rest days as zeros,
and return an Unavailable Metric when SD = 0.

**7. Keep "ramp rate" and "Volume Ramp" separated, and add the derived one.**
CONTEXT.md already reserves the name correctly. The _derived_ ramp rate
(`CTL_t − CTL_{t−7}`) is currently missing and is the natural upward guard rail
to sit beside Week Replan's downward rule: a Volume Ramp that produces more than
8 CTL/week should warn at authoring time. Grade it 3–5 CTL/wk green, 5–8 amber,
above 8 red, and say in the copy that these are coaching heuristics
(Friel/Couzens), not validated thresholds. ADR 0040's ramp guard reads a track's
_authored_ numbers only, which is correct for what it guards; the derived CTL
ramp rate is a second, additive guard on a different quantity, not a
replacement.

**8. Do not build custom time constants.** The steady state is invariant, so the
feature buys only responsiveness — while invalidating every published TSB zone
and ramp-rate threshold the app quotes, and triggering a full-history recompute
each time it is touched (§8). If it is ever built, it must be a Load Recompute
Notice event with the zone boundaries relabelled as approximate.

**9. ADR 0046 §2 is right, and the research strengthens its reasoning.** The
literature does not price lifting in TSS, and the reason is structural — there
is no sustainable-intensity threshold to normalise against, so there is nothing
to divide by — rather than a gap someone will close with a better model. ADR
0046 reached that conclusion from the currency-matrix side; §7.1 reaches it
independently from the physiology side. Keep the decision, and say why in the
athlete-facing copy: the number did not get worse, the metric got narrower.

**10. Ship Form % beside TSB.** TSB −25 is a different state at CTL 40 and CTL
110, and the Coach card's plain-language label is wrong for one of them today.
`TSB / CTL × 100` fixes the scaling. It is a common approach with no primary
source behind it — that flag stands, and it is exactly why it belongs _beside_
the raw TSB rather than replacing it, not a reason to leave the scaling bug in
place.

### ADRs this research challenges

| ADR                                                       | What it decided                                                                             | What the evidence says                                                                                                                                                                     | Verdict       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **0008** — TSS triad, HR-first defaults                   | Coggan triad; `hrTSS` default for cardio; formula pinned per Discipline Profile; fixed 42/7 | Per-discipline pinning and fixed 42/7 are right (§1.8, §8). But the ADR never fixes the recurrence form, today-inclusion or the seed, and its `hrTSS` is the unpublished zone table (§1.4) | **Amend**     |
| **0008** — run fallback chain (pace → HR)                 | Run prices on `rTSS`, then `hrTSS`                                                          | Contradicts ADR 0038, which already treats running power as the truest run signal. A running-power (GOVSS) rung belongs above `rTSS` (§1.6)                                                | **Supersede** |
| **0005** — profile split; Tanaka as compute-time fallback | `DisciplineProfile` holds LTHR / FTP / pace / CSS; HRmax from Tanaka, never materialised    | Tanaka-as-fallback is correct (§3.6 of the zones note). But TRIMP(100) needs **HRrest and HRmax as stored fields**, which the profile does not have (§2.1, §2.5)                           | **Amend**     |
| **0020** — Activity Stream, downsampled                   | Bucket-mean stream at ≥5 s / ≤1000 samples                                                  | Adequate for HR-based load: HR is already a lagged integrator, so bucket means barely move a per-sample TRIMP. The stream is the right input for hrTSS                                     | **Confirm**   |
| **0038** — running power is uncapped and first-class      | Running power classifies runs and carries no HR-style trust cap                             | Supported for load as well as classification: a running-power TSS should carry `high` confidence, and the load chain must catch up (§1.6)                                                  | **Confirm**   |
| **0040** — ramp guard reads a track's authored numbers    | Progressive overload is authored; the guard watches the authored ramp                       | Correct for what it guards. The derived CTL ramp rate (`CTL_t − CTL_{t−7}`) is a different quantity and an additive second guard, not a replacement (§5)                                   | **Confirm**   |
| **0046 §2** — strength contributes no TSS                 | Strength leaves CTL/ATL/TSB; `sRPE` on a lift is `hours × assumed intensity`                | Independently confirmed from the physiology side: no sustainable-intensity threshold exists to normalise against, so the conversion is structurally unavailable, not merely imprecise (§7) | **Confirm**   |

---

## References

**Per-activity load scores**

- Allen H., Coggan A. — _Training and Racing with a Power Meter_. NP/IF/TSS
  overview:
  https://www.trainingpeaks.com/learn/articles/normalized-power-intensity-factor-training-stress/
- Coggan A. — _The science of the Performance Manager_:
  https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/
- Spencer S. — _Calculating training load in cycling_ (formulas + code):
  https://ssp3nc3r.github.io/post/2020-05-08-calculating-training-load-in-cycling/
- _Running Training Stress Score (rTSS) explained_:
  https://www.trainingpeaks.com/learn/articles/running-training-stress-score-rtss-explained/
- _Low rTSS and trail running_:
  https://help.trainingpeaks.com/hc/en-us/articles/205229730-Low-rTSS-and-Trail-Running
- _Training Stress Scores (TSS) explained_ (variant list + hrTSS zones):
  https://help.trainingpeaks.com/hc/en-us/articles/204071944-Training-Stress-Scores-TSS-Explained
- _Calculating swimming TSS score_:
  https://www.trainingpeaks.com/learn/articles/calculating-swimming-tss-score/
- Friel J. — _Estimating TSS_ (RPE and HR-zone anchors; table image now dead):
  http://www.trainingbible.com/joesblog/2009/09/estimating-tss.html
- Stryd — _Running Stress Score (RSS)_:
  https://help.stryd.com/en/articles/6879537-running-stress-score-rss
- George R. — _An equation for Running Stress Score_ (reverse-engineered fit):
  http://www.georgeron.com/2017/08/an-equation-for-running-stress-score-rss.html
- George R. — _Technical review of the GOVSS running power model_ (Skiba):
  http://www.georgeron.com/2017/11/the-govss-running-power-algorithm-and.html

**TRIMP**

- Banister E.W., Calvert T.W., Savage M.V., Bach T. (1975) _A systems model of
  training for athletic performance_. Aust J Sports Med 7:57–61.
  https://www.sciepub.com/reference/104335
- Morton R.H., Fitz-Clarke J.R., Banister E.W. (1990) _Modeling human
  performance in running_. J Appl Physiol 69(3):1171–1177.
  https://journals.physiology.org/doi/abs/10.1152/jappl.1990.69.3.1171
- Edwards S. (1993) _The Heart Rate Monitor Book_ — zone-weighted TRIMP.
  Summary: https://www.trainingimpulse.com/edwards-trimp
- Banister TRIMP summary: https://www.trainingimpulse.com/banisters-trimp-0
- Manzi V. et al. (2009) _Relation between individualized training impulses and
  performance in distance runners_.
  https://www.researchgate.net/publication/26879362_Relation_between_Individualized_Training_Impulses_and_Performance_in_Distance_Runners
  · overview: https://www.trainingimpulse.com/itrimp
- Abt G. / Hull repository — _Methods of monitoring training load and their
  relationships to changes in fitness and performance_ (bTRIMP/eTRIMP/iTRIMP
  comparison):
  https://hull-repository.worktribe.com/preview/443111/13805%20Abt.pdf

**Impulse-response / PMC**

- Calvert T.W., Banister E.W. et al. (1976) _A systems model of the effects of
  training on physical performance_. IEEE Trans Syst Man Cybern 6:94–102.
  https://ui.adsabs.harvard.edu/abs/1976ITSMC...6...94C/abstract
- Busso T. et al. (1994) _Fatigue and fitness modelled from the effects of
  training on performance_. Eur J Appl Physiol.
  https://link.springer.com/article/10.1007/BF00867927
- Hellard P. et al. (2006) _Assessing the limitations of the Banister model in
  monitoring training_. https://pmc.ncbi.nlm.nih.gov/articles/PMC1974899/
- Liversedge M. — _Implementing the Banister impulse-response model in
  GoldenCheetah_:
  http://markliversedge.blogspot.com/2019/01/implementing-banister-impulse-response.html
- GoldenCheetah user glossary (CTL/LTS, ATL/STS, TSB/SB, ramp rate, TRIMP
  variants): https://github.com/GoldenCheetah/GoldenCheetah/wiki/UG_Glossary
- GoldenCheetah `sweatpy` (open-source Python analysis library):
  https://github.com/GoldenCheetah/sweatpy
- Statistical critique of the fitness-fatigue model (2025), Sci Rep:
  https://www.nature.com/articles/s41598-025-88153-7

**Form zones and ramp rate**

- Friel J. — _Managing training using TSB_:
  https://joefrieltraining.com/managing-training-using-tsb/
- Friel J. — _Part 3: Training stress balance — so what?_:
  https://joefrieltraining.com/part-3-training-stress-balanceso-what/
- Friel J. — _The CTL ramp rate_:
  https://joefrieltraining.com/the-ctl-ramp-rate/
- Couzens A. — _CTL ramp rates, TSB floors & loading patterns_:
  https://www.alancouzens.com/blog/CTLramp.html

**Session RPE, monotony, strain**

- Foster C. et al. (2001) _A new approach to monitoring exercise training_. J
  Strength Cond Res 15(1):109–115. https://pubmed.ncbi.nlm.nih.gov/11708692/ ·
  PDF:
  https://paulogentil.com/pdf/A%20New%20Approach%20to%20Monitoring%20Exercise%20Training.pdf
- Foster C. (1998) _Monitoring training in athletes with reference to
  overtraining syndrome_. Med Sci Sports Exerc 30(7):1164–1168.
- Haddad M. et al. (2017) _Session-RPE method for training load monitoring:
  validity, ecological usefulness, and influencing factors_. Front Neurosci.
  https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/full

**ACWR and its critics**

- Gabbett T. (2016) _The training–injury prevention paradox_. BJSM.
- Williams S. et al. (2017) _Calculating acute:chronic workload ratios using
  exponentially weighted moving averages provides a more sensitive indicator of
  injury likelihood than rolling averages_. BJSM.
  https://www.researchgate.net/publication/311860780
- Impellizzeri F.M., Tenan M.S., Kempton T., Novak A., Coutts A.J. (2020)
  _Acute:chronic workload ratio: conceptual issues and fundamental pitfalls_.
  IJSPP 15(6):907–913. DOI 10.1123/ijspp.2019-0864.
  https://journals.humankinetics.com/view/journals/ijspp/15/6/article-p907.xml
- Impellizzeri F.M. et al. (2020) _The acute-chronic workload ratio-injury
  figure and its 'sweet spot' are flawed_. BJSM.
  https://www.semanticscholar.org/paper/d9f17d9d6cbd2c0195209fa2f5dc23af6fb97d61
- Editorial: _Acute:chronic workload ratio — is there scientific evidence?_
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8138569/
- ACWR systematic review and meta-analysis (2025):
  https://pmc.ncbi.nlm.nih.gov/articles/PMC12487117/

**Resistance training load**

- _Resistance training volume load with and without exercise displacement_:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6316164/
- _The association between resistance training volume load and session RPE_:
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11680556/
- _A muscle physiology-based framework for quantifying training load in
  resistance exercises_: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11768794/
- _Quantifying workloads in resistance training: a brief review_:
  https://www.researchgate.net/publication/239731099
