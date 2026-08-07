# Interval/segment detection and the analysis-platform data model

Research note. Scope: (1) how to automatically cut a power/pace/HR time series
into work and recovery intervals, and everything that hangs off a segmented
activity; (2) the data model and surfaces a serious analysis platform needs
around those streams. Written against primary sources — open-source
implementations, format specifications, and the change-point literature.

Vendor-neutral by request: no competing analysis product is named. File formats
and open-source libraries are named and cited.

---

## TL;DR

1. **The detection algorithm is mostly solved here already** (ADR 0032–0036 +
   the #327/#330 wayfinder notes pick PELT-L2 + band-separation gate + 2-means
   repeat mining). What is genuinely missing is everything _downstream_ of a
   segment: there is no **per-interval metrics** entity, no **interval editing**
   model, and no interval-level provenance — the app can only materialize a
   detected structure into a `Workout` and then flip `Session Source` to
   `authored` wholesale.
2. **The stored stream is too thin and too coarse to be an analysis platform.**
   Three channels (power/heartrate/pace), a 5 s floor _and_ a 1000-sample cap
   that degrades a 5 h ride to ~19 s resolution, and no distance/altitude/
   cadence/latlng/grade/temperature/moving channels. Detection, per-interval
   metrics, GAP, and elevation-change all need channels we throw away at ingest.
   The fix is a **two-tier** model: a full-resolution analysis blob (compressed,
   cold) + the existing bounded display grid derived from it. **ADR 0020 should
   be superseded** — it reasoned from chart cost, and every analysis consumer
   since has inherited that constraint as if it were physics.
3. **Ramps and pyramids are a known blind spot with a known fix.** PELT with an
   L2 (piecewise-_constant_) cost cannot see a smooth 130→190 W warm-up ramp —
   #330 documented exactly this. Change-point libraries ship a
   piecewise-_linear_ cost for precisely this case; a slope-test post-pass over
   each detected segment is the cheap hand-rolled equivalent.
4. **Plan-vs-actual alignment has a standard answer the repo has ruled out on
   honesty grounds, not technical grounds.** Subsequence/open-end DTW or a
   Needleman–Wunsch alignment over the step sequence gives a monotone mapping
   from planned steps to executed time. ADR 0034 forbids a per-step _verdict_ —
   it does not forbid a per-step _mapping_, and the mapping is what makes the
   overlay legible ("this stretch is rep 4"). That distinction is currently not
   drawn anywhere.
5. **The whole "analysis platform" surface layer is absent**: no configurable
   activity-list columns, no saved column sets, no filter/query language over
   activities, no aggregate footers or grouping totals, no user-defined derived
   fields or custom charts, and no bulk export of activities/originals. These
   are data-model decisions (typed field definitions + per-activity values,
   saved-view rows, a parsed filter AST) as much as UI ones, and none of them
   have an ADR.

---

## Part 1 — Interval / segment detection

### 1.1 The algorithm families

#### Change-point detection

The canonical framing: given a signal `y[0..n)`, find breakpoints
`t_1 < … < t_K` minimising `Σ_k c(y[t_k : t_{k+1})) + pen·K`, where `c` is a
cost measuring how badly a segment fits an assumed regime. Truong, Oudre &
Vayatis' survey ("Selective review of offline change point detection methods",
_Signal Processing_ 165, 2020; arXiv:1801.00718) is the reference taxonomy, and
the `ruptures` library is its executable form. It decomposes every method into
**cost function × search method × penalty**:

| Search method                      | Guarantee                       | Cost                          |
| ---------------------------------- | ------------------------------- | ----------------------------- |
| `Dynp` (exact dynamic programming) | optimal, needs known `K`        | O(K n²)                       |
| `Pelt`                             | optimal for a linear penalty    | ~O(n) amortised under pruning |
| `Binseg`                           | greedy                          | O(n log n)                    |
| `BottomUp`                         | greedy merge                    | O(n log n)                    |
| `Window`                           | greedy, fixed-width discrepancy | O(n w)                        |

| Cost                     | Detects                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `CostL2`                 | shifts in **mean**, `Σ‖y_t − ȳ‖²` (piecewise-constant)                                           |
| `CostL1`                 | shifts in **median** — robust to power/GPS spikes                                                |
| `CostNormal`             | shifts in **mean _and_ variance** — a steady tempo block and a surgy group ride can share a mean |
| `CostLinear`             | shifts in a **linear regression** — ramps, HR-vs-power drift                                     |
| `CostCLinear`            | _continuous_ piecewise-linear (segments join up) — pacing decay                                  |
| `CostRbf` / `CostCosine` | kernel mean shift; `γ` defaults to the median heuristic                                          |
| `CostRank`               | rank-transformed, distribution-free                                                              |
| `CostMl` (mahalanobis)   | multivariate with a metric `M` — the honest way to feed power **and** HR **and** cadence jointly |
| `CostAR`                 | piecewise autoregressive                                                                         |

`ruptures` also ships **`L1Potts`** — an exact solver for the L1 Potts
functional `min_u γ·Σ 1(u_i ≠ u_{i+1}) + Σ w_i|f_i − u_i|` (Storath et al. 2017)
in **O(K·N)**, where `K` is the number of distinct observed values. Its docs
claim 20–30× faster than `Pelt(model="l1")`, it is robust to heavy-tailed noise,
and it accepts **per-sample weights** — exactly the primitive for down-weighting
a known sensor dropout instead of deleting it. 1-D only. It postdates the #327
survey and is a strong candidate for noisy power/pace.

Two traps:

- **The `ruptures` user guide says `min_size=1, jump=1`; the code defaults are
  `min_size=2, jump=5`.** `jump=5` only considers every 5th index as a candidate
  breakpoint — a 5× resolution loss. Set it explicitly; in a hand-rolled port,
  do not silently inherit a stride.
- **The penalty is not transferable across units or athletes.** It scales with
  the residual variance of the cost — which is why GoldenCheetah's own PELT
  example chart uses `pen.value = 60000*log(n)` on **raw watts** while this
  repo's prototype uses `8·log n` on a **median/MAD-normalised** signal.
  Normalise first, then one penalty can be shared.

**Choosing a penalty without a magic number: CROPS** (Haynes, Eckley &
Fearnhead, "Computationally Efficient Changepoint Detection for a Range of
Penalties", _JCGS_ 26(1), 2017) runs PELT across a penalty _range_ efficiently
and returns every distinct segmentation in it. That is a better product shape
than one calibrated constant: it turns "trust our threshold" into "here are the
four segmentations this activity supports", and makes calibration inspectable.

**ED-PELT** (Haynes, Fearnhead & Eckley, _Statistics and Computing_ 27, 2017;
arXiv:1602.01254) is the nonparametric empirical-distribution variant — and its
headline worked example is _literally_ segmenting heart rate, speed and
elevation from a 10-mile undulating run into effort phases. It is the closest
published analogue to this problem that exists.

PELT itself is Killick, Fearnhead & Eckley, "Optimal detection of changepoints
with a linear computational cost" (_JASA_ 107(500), 2012). It is exact — it
returns the same segmentation as full dynamic programming — because of a pruning
inequality: a candidate `t` can be discarded forever once
`F(t) + C(y[t:s]) + K > F(s)`, where `K` is a constant satisfying
`C(a,t) + C(t,b) + K ≤ C(a,b)` (`K = 0` for L2). Linear expected time requires
that the number of changepoints grows linearly with `n`; worst case is still
O(n²). Penalty choice is BIC/SIC (`pen = p·log n`, `p` = params per segment),
MBIC, or AIC. The repo's prototype landed on `8·log n` for the pace/power
z-signal, with `6·log n` over-segmenting easy runs — that is a BIC-family
penalty with an empirically inflated multiplier, which is normal practice.

**Practical read for us:** at ≤1000 samples every method above is instant, so
the choice is about _shape_, not speed. L2/PELT is right for square-wave
intervals; it is provably wrong for ramps (see §1.3).

**The asymmetry nobody in the literature has:** when a _plan_ exists, the
expected number of segments is known. That converts an unsupervised
penalty-tuning problem into `Dynp.predict(n_bkps = k)` — exact dynamic
programming with a fixed segment count — plus an alignment. This is a much
better-posed problem than anything the change-point literature addresses, and it
is available for every matched planned session. It does **not** violate the
plan-blind rule of ADR 0034 if it is used as a _second, plan-aware pass whose
output is kept separate from the plan-blind detection_ — but that separation has
to be deliberate, because a plan-aware `k` absolutely would manufacture
agreement if it fed the stored detection.

#### Threshold crossing with hysteresis (Schmitt trigger)

The dumbest thing that works, and worth keeping as a labelling stage: define
`hi` and `lo` thresholds with `lo < hi`; enter WORK when the smoothed signal
exceeds `hi`, leave WORK only when it drops below `lo`. The dead band kills the
flicker a single threshold produces. Add a **minimum dwell** (`min_size`) so a
2-sample excursion cannot open a segment. This is what a pure zone-crossing
detector reduces to, and it is the honest fallback for HR-only streams where
change-point detection on a lagged signal produces systematically wrong edges.

GoldenCheetah's W′-match finder (`src/Metrics/WPrime.cpp`) is the best-designed
instance of this in open source, and its three refinements are all worth
copying:

```cpp
const int WprimeMatchSmoothing = 25;   // seconds
const int WprimeMatchMinJoules = 100;
// OR on entry — either the smoothed or the raw series crossing CP opens a match
if (!inmatch && (smooth[i] >= CP || raw[i] >= CP)) { inmatch = true; start = i; }
// AND on exit — both must fall below CP to close it
if ( inmatch && (smooth[i] <  CP && raw[i] <  CP)) {
    int end = i - 1;
    while (end > start && raw[end] < CP) end--;   // backtrack on RAW data
    match.cost = wbal[start] - wbal[end];          // joules of W' spent
    if (match.cost >= WprimeMatchMinJoules) matches << match;
    inmatch = false;
}
```

1. **Asymmetric hysteresis across two smoothings** (OR-in on smoothed-or-raw,
   AND-out on smoothed-and-raw) rather than two thresholds on one series.
2. **Backtrack the endpoint on the raw series** so the 25 s smoothing does not
   inflate the interval — smoothing decides _whether_, raw decides _where_.
3. **Filter by physiological cost (joules), not duration.** A magnitude filter
   in units the athlete cares about is a much better "is this worth showing"
   test than an arbitrary `min_size`. The analogue for us would be a minimum TSS
   or kJ contribution per detected interval.

#### Sliding-window variance / discrepancy

`Window` in the survey's taxonomy: slide two adjacent half-windows of width `w`,
score the discrepancy between them (difference of means, difference of
variances, kernel MMD), and take local maxima of that score as breakpoints. Fast
and streaming-friendly, but a single `w` cannot serve a session mixing 30 s and
8 min reps — you would need a multi-scale sweep. CUSUM is the classical online
sibling; Adams & MacKay's Bayesian Online Changepoint Detection
(arXiv:0710.3742) is the probabilistic one and gives a run-length posterior,
which is nice for "how sure are we there is a boundary here" but is more
machinery than a 1000-sample offline problem deserves.

#### Clustering of laps

If device laps exist, the problem changes from _segmentation_ to
_classification_: you already have boundaries, you only need to decide which
laps are work and which are recovery, and which laps belong to the same set.
2-means (or 1-D Jenks natural breaks) over lap mean-intensity, with a
value-margin gate, is enough. This is strictly more reliable than stream
segmentation and is why lap ingestion matters so much for short reps.

#### Repeated-pattern matching → "N×" groups

Two workable approaches:

- **Motif clustering on the segment sequence** (what the prototype does):
  cluster work segments by `(duration, representative intensity)` with a
  tolerance, then look for the `k × (work, recovery)` alternation. Corroborate
  with the autocorrelation of the work/recovery indicator to pick `k`.
- **Matrix profile motif discovery** (Yeh et al.; `stumpy`) on the raw signal:
  compute, for every subsequence of length `m`, the z-normalised Euclidean
  distance to its nearest non-trivial neighbour. Low-valued plateaus in the
  matrix profile are repeated motifs. It finds repeats _without_ first
  segmenting, which makes it attractive for fartlek-ish sessions, but it needs
  the motif length `m` up front (or a sweep) and is heavier than we need. Worth
  knowing about as a validation tool rather than a production dependency.

#### Energy-model effort discovery (a different question, worth stealing)

GoldenCheetah does not do generic segmentation; its automatic interval discovery
(`src/Core/RideItem.cpp`, `RideItem::updateIntervals()`) finds _maximal efforts_
against a power-duration model. Concretely, for `EFFORT` intervals it:

1. resamples power onto a 1 Hz grid and builds an **integrated (cumulative
   joules) series**;
2. for each start `i`, walks duration `t` down from 3600 s to 120 s;
3. computes `tc = (J(i+t) − J(i) − W′) / CP` — the Monod/critical-power equation
   `P(t) = W′/t + CP` re-solved for `t` in joules;
4. accepts the interval when `tc ≥ 0.85·t` — i.e. the effort is within **85 %**
   of what the athlete's CP/W′ model says is maximal — and records
   `quality = tc / t`;
5. when it fails, it **jumps** `t = tc` rather than decrementing, which is the
   monotonicity trick that turns O(n²) into something near O(n log n);
6. sprints use the 3-parameter model `t = W′/(P − CP) + W′/(CP − Pmax)`, only
   for `P > CP + 0.5(Pmax − CP)`, down to `t ≥ 5 s`;
7. overlapping candidates within the same power zone are deduplicated by keeping
   the higher `quality`.

It also ships `PEAKPOWER`/`PEAKPACE` discovery over a fixed duration ladder
(`1, 5, 10, 15, 20, 30, 60, 300, 600, 1200, 1800, 2700, 3600` s for power;
`10 …3600` s for pace), a **climb** detector (candidate hills need
`distance ≥ 0.5 km` and gradient `≥ 20 %·…`: specifically
`height/distance ≥ 60 − 10·distance` for `distance < 4 km`, else `≥ 20` m/km —
with a groundrise trim at both ends using a 20 m/km slope test), and W′-balance
**matches** (`cost > 2000 J`).

The interval object itself (`src/Core/IntervalItem.h`) is instructive as a data
model:

```cpp
RideItem *rideItem_;  QString name;
RideFileInterval::IntervalType type;   // DEVICE | USER | ALL | PEAKPOWER |
                                       // PEAKPACE | EFFORT | ROUTE | CLIMB
double start, stop;          // seconds
double startKM, stopKM;      // distance
int displaySequence;  QColor color;  QUuid route;  bool test;
QVector<double> metrics_;    // every ride metric, recomputed for the interval
QVector<double> count_;
QMap<int,double> stdmean_, stdvariance_;   // mean ± SD per metric
```

Two things to steal: the **type enum distinguishes device-provided from
user-defined from discovered** intervals (provenance in the type, not a side
table), and **every whole-activity metric is recomputed over every interval**
including a mean and variance — which is what makes an "avg ± SD" footer
possible anywhere in the UI.

### 1.2 A concrete pipeline (pseudocode)

This is the #327/#330 pipeline written out, with the gaps of §1.3 filled in.

```ts
type Channel = Array<number | null>
type Seg = { startIdx: number; endIdx: number } // half-open

function detectStructure(stream: ActivityStream, profile: DisciplineProfile) {
	// 0. Choose the edge channel. NEVER HR — HR lag puts edges 20–40 s late.
	const edge =
		profile.discipline === 'bike'
			? stream.power
			: (stream.runningPower ?? stream.pace)
	if (!edge) return null // honest no-detection

	// 1. Split at pause gaps. Never interpolate across a null run.
	const blocks = splitOnNullRuns(edge, { minGapSamples: 1 })

	// 2. Denoise: rolling median (5–9 samples) kills GPS/power spikes without
	//    rounding the square edges a moving average would smear.
	//    Hampel filter (median ± 3·MAD) is the principled version.
	const clean = blocks.map((b) => rollingMedian(b, 7))

	// 3. Robust normalize. Plain z-scoring is destroyed by a single 20 s/km
	//    GPS spike: it inflates SD and deflates the effective penalty.
	const z = clean.map((b) => clampOutliers(medianMadNormalize(b), 4))

	// 4. Segment each block independently.
	const MIN_DWELL_SEC = 25
	let segs: Seg[] = []
	for (const b of z) {
		segs.push(
			...pelt(b, {
				cost: 'l2',
				penalty: 8 * Math.log(b.length), // BIC-family, tuned per discipline
				minSize: Math.ceil(MIN_DWELL_SEC / stream.resolutionSec),
			}),
		)
	}

	// 5. RAMP PASS (missing today). L2 fits constants; a smooth warm-up ramp has
	//    no changepoint, so its tail is eaten by rep 1. For each segment, fit
	//    y = a + b·t and compare residual SS against the constant fit.
	segs = segs.flatMap((s) => {
		const { slopePerMin, r2, improvesOverConstant } = linFit(z, s)
		if (improvesOverConstant && Math.abs(slopePerMin) > RAMP_SLOPE_MIN)
			return [{ ...s, shape: 'ramp', slopePerMin }]
		return [{ ...s, shape: 'steady' }]
	})
	// Equivalent library route: re-run PELT with a piecewise-LINEAR cost
	// (`ruptures` CostLinear) and take the union of the two breakpoint sets.

	// 6. Snap to device laps when present and trustworthy.
	//    Trust order: platform-authored intervals > FIT fitness_equipment (ERG)
	//    laps > manual laps > uniform distance/time auto-laps (discard).
	segs = snapToLaps(segs, trustedLaps(stream.laps), {
		toleranceSec: 3 * stream.resolutionSec, // bucket-mean smears edges by ~1 bucket
	})

	// 7. Label: representative value = trimmed mean / median over the SETTLED
	//    interior (skip first ~30 s when the classifying channel is HR).
	const labelled = segs.map((s) => ({
		...s,
		value: trimmedMean(
			edge,
			interiorOf(s, { leadInSec: hrIsClassifier ? 30 : 0 }),
		),
		zone: zoneFor(value, profile), // display-derived, not stored
	}))

	// 8. Work/easy split by 2-means over representative values, NOT a fixed
	//    percentile: real recoveries are often walks far easier than the warm-up,
	//    which drags quantiles onto the work level.
	const { workLevel, easyLevel } = twoMeans(labelled.map((s) => s.value))

	// 9. HONESTY GATE (ADR 0033). The single most important knob.
	if (zoneOf(workLevel) < zoneOf(easyLevel) + 1) return null // band separation
	if (!valueMarginOk(workLevel, easyLevel, { pace: 0.08, power: 0.15 }))
		return null
	if (!recoverySanity(labelled)) return null // recoveries must be shorter AND
	// easier than the works they split
	if (structuredCoverage(labelled) < MIN_COVERAGE) return null

	// 10. Merge adjacent same-role, same-band segments (undo over-segmentation).
	const merged = mergeAdjacent(labelled, sameRoleAndBand)

	// 11. Warm-up / cool-down: a leading (trailing) easy segment longer than
	//     MIN_WARMUP_SEC, before the first (after the last) work segment.
	//     A leading `ramp` segment is a warm-up regardless of its end level.

	// 12. Repeat mining → N× groups.
	const groups = mineRepeats(merged, {
		durationTolerance: 0.15, // relative
		intensityTolerance: 0.08,
		minReps: 2, // k = 2 is weak; feeds the confidence k-factor
	})
	// mineRepeats: cluster (duration, value) of WORK segments; for each cluster,
	// walk the sequence and greedily extend a run of (work_i, recovery_i) pairs
	// whose members stay in-cluster; corroborate k with the autocorrelation of
	// the work indicator. Pyramids (1'-2'-3'-2'-1') will NOT cluster — detect
	// them as a monotone-then-monotone duration sequence and emit an ordered
	// block rather than an N× group.

	return { blocks: groups, shape: 'detected' }
}
```

Knob summary, in the priority order the prototype found:

| Knob                                    | Value that worked        | What it protects against                   |
| --------------------------------------- | ------------------------ | ------------------------------------------ |
| Band-separation gate                    | work ≥ 1 zone above easy | phantom structure on easy runs             |
| Median/MAD normalize + clamp            | clamp at ~4 MAD          | GPS pace spikes wrecking the penalty       |
| PELT penalty                            | `8·log n`                | over-/under-segmentation                   |
| Min dwell                               | 25 s                     | flicker                                    |
| 2-means + value margin                  | pace ≥ 8 %, power ≥ 15 % | quantile methods pulled by walk recoveries |
| Pause stitch, k-factor, recovery sanity | —                        | second-order failures                      |

### 1.3 Practical heuristics, and where they are still open

- **Smoothing before detection.** Rolling _median_ (5–9 samples), not mean: a
  mean rounds the square edges you are trying to find. Hampel (median ± 3·MAD
  over a window) is the named version. Savitzky–Golay is the right choice only
  if you also want the derivative for ramp detection.
- **Minimum interval duration.** Two separate floors: the algorithmic `min_size`
  (anti-flicker, ~25 s) and a _display_ floor below which a segment is not worth
  showing as an interval. They should not be the same number.
- **Merging adjacent similar segments.** Always do this after segmentation, not
  by loosening the penalty: a high penalty that misses a real boundary cannot be
  undone, but an over-segmentation can be merged.
- **Snapping to device laps.** Snap only within a tolerance of a few grid
  buckets. The 5–19 s bucket-mean grid smears every edge by roughly one bucket,
  so a lap boundary within ±1 bucket is almost certainly the _same_ boundary
  observed more precisely — take the lap's.
- **Ramps.** Open here. L2 cost is structurally blind (see pseudocode step 5).
- **Pyramids.** Open here. A `(1', 2', 3', 2', 1')` ladder does **not** form one
  duration cluster, so a cluster-based repeat miner emits five singletons or
  nothing. The fix is a second miner that looks for a monotone run of durations
  at a constant intensity and emits an _ordered_ block. Nobody has specced the
  domain shape for that (`Block.repeat` implies homogeneity).
- **Warm-up / cool-down.** Easiest reliable rule is positional + intensity, not
  pattern-based: leading/trailing easy material bounded by the first/last work
  segment. A leading ramp is a warm-up even when it ends at threshold.
- **Pauses.** Never interpolate. But note a stored `null` currently conflates
  _pause_ with _sensor dropout_; only laps (or a `moving` channel) disambiguate
  them, and they should be segmented differently — a dropout should be bridged,
  a pause should split.

### 1.4 Per-interval metrics

Once a segment is bounded, the metrics that matter — and the traps:

| Metric                              | Notes / trap                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration (elapsed) & moving time    | Differ whenever a pause falls inside the segment. Store both.                                                                                                                                                                                                                                                                                                                                   |
| Distance                            | Needs a `distance` channel; deriving it from pace × time accumulates error.                                                                                                                                                                                                                                                                                                                     |
| Avg power, max power                | Trivial once `power` exists.                                                                                                                                                                                                                                                                                                                                                                    |
| **Normalized Power**                | **Do not compute for short intervals.** NP is the 4th root of the mean 4th power of a 30 s rolling average (Coggan). Common coaching guidance is that the 30 s window must be ≤5 % of the interval, i.e. NP is meaningless below ~10 min. ADR 0035 already reaches the right conclusion for a different reason (a constant-intensity segment ≈ its average). Make that a rule, not an accident. |
| Avg HR, max HR                      | Trim a ~30 s lead-in for lag; report the settled interior.                                                                                                                                                                                                                                                                                                                                      |
| Avg pace                            | Harmonic vs arithmetic matters: average _speed_ then invert, do not average sec/km.                                                                                                                                                                                                                                                                                                             |
| **GAP (grade-adjusted pace)**       | Needs `altitude` + `distance`. Standard basis is Minetti et al. 2002 (_J Appl Physiol_ 93:1039–1046), whose cost-of-running polynomial is widely quoted as `Cr(g) = 155.4g⁵ − 30.4g⁴ − 43.3g³ + 46.3g² + 19.5g + 3.6` J·kg⁻¹·m⁻¹ for gradient `g` as a decimal, valid −0.45…+0.45, minimum near −10 %. GAP = pace scaled by `Cr(g)/Cr(0)`. **Unbuildable today** — no altitude channel.         |
| % of threshold                      | `value / threshold` on the discipline's anchor channel.                                                                                                                                                                                                                                                                                                                                         |
| Zone label                          | Display-derived from the measured value through the _current_ recipe (ADR 0035). Correct — do not persist.                                                                                                                                                                                                                                                                                      |
| Avg cadence                         | Needs a `cadence` channel. Absent today.                                                                                                                                                                                                                                                                                                                                                        |
| Elevation gain/loss                 | Needs `altitude`. Absent today. Must be computed with a threshold filter (ignore <~3 m oscillation) or barometric noise inflates it.                                                                                                                                                                                                                                                            |
| W′ expended / match cost            | Needs CP + W′; GoldenCheetah's `cost > 2000 J` is a reasonable "worth showing" floor.                                                                                                                                                                                                                                                                                                           |
| Intensity Factor, TSS share         | Derived from the above.                                                                                                                                                                                                                                                                                                                                                                         |
| **Mean ± SD across a repeat group** | GoldenCheetah stores `stdmean_` / `stdvariance_` per metric per interval precisely so the UI can show `228 ± 6 W`.                                                                                                                                                                                                                                                                              |

**Repeat-group summarisation.** The conventional shorthand —
`28 × 45s @ 176bpm`, `6 × (3:04 @ T + 3:20 E)` — is a _rendering_ of a group,
and needs: `k`, the representative work duration, the representative work
intensity **on the classifying channel with its unit**, and optionally the
recovery duration and intensity. Rules that make it honest:

- Use the **median** work duration and round to a human unit (`45s`, `3:00`,
  `1km`), and say so when reps vary: `6 × 3:00–3:12`.
- Use the group's **mean ± SD** intensity when SD is material; a bare mean over
  a fading set (`252→232 W`) lies.
- Never invent a `k` the detector did not see. Under-detection is systematic
  (#330: a real 10×3 detected as 6×3 at 0.95 confidence).

### 1.5 Editing affordances, and why detected ≠ edited

An analysis UI needs, at minimum: **add** an interval by dragging on the chart,
**split** at the cursor, **merge** with a neighbour, **delete**, **drag either
boundary**, **rename**, and **re-order / re-group** into an N× set. Every one of
those invalidates the cached per-interval metrics, so metrics must be
recomputable from `(streamRef, startIdx, endIdx)` on demand.

**Why detected structure must be stored separately from edited structure:**

1. **Re-detection.** The engine version bumps, the athlete fixes their FTP, laps
   get backfilled — all of which should be able to re-run detection. If the only
   copy of the structure is the one the athlete edited, re-detection either
   destroys their work or can never run.
2. **Honesty labelling.** "This is what the machine saw" and "this is what I say
   happened" are different claims. Collapsing them makes the badge a lie in one
   direction or the other.
3. **Measuring the detector.** You cannot calibrate a detector whose output you
   overwrite. Keeping both gives a free labelled corpus: every athlete edit is a
   correction signal.
4. **Undo / revert to detected.** Cheap if you kept it, impossible if you did
   not.

The shape that works is a **base + overlay**: the detection row is immutable and
engine-owned; an edit creates (or updates) a user-owned structure that
references it, with a per-interval `origin: 'detected' | 'lap' | 'user'` and a
`derivedFromIntervalId`. This is the same pattern as a diff over a generated
artifact — never edit the generated file in place.

```ts
type IntervalOrigin =
	| { kind: 'detected'; engineVersion: string }
	| { kind: 'device-lap'; lapIndex: number; trigger: LapTrigger }
	| { kind: 'user'; editedAt: Date }
	| { kind: 'peak'; durationSec: number } // discovered best effort

type ActivityInterval = {
	id: string
	activityImportId: string
	parentGroupId: string | null // membership in an N× repeat group
	orderIndex: number
	role: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'other'
	shape: 'steady' | 'ramp'
	startSec: number
	endSec: number
	origin: IntervalOrigin
	name: string | null // user rename; null → generated caption
	metrics: IntervalMetrics | null // cache; recomputable, invalidate on edit
}
```

### 1.6 Comparing a completed activity against a planned structured workout

The planned workout is a sequence of steps `P = [p_1 … p_m]`, each with a target
duration/distance and an intensity target. The executed activity is either a raw
stream or a detected sequence `D = [d_1 … d_n]`. Three levels of ambition:

1. **Whole-session verdict.** Compare archetypes (rep count, work durations,
   total work time) with a tolerance. This is what ADR 0034 specifies, and its
   asymmetry argument (under-detection makes a downward mismatch
   uninterpretable) is sound.
2. **Sequence alignment (mapping, no verdict).** Align `P` to `D` with a
   monotone, gap-tolerant alignment — Needleman–Wunsch over the two step
   sequences with a substitution score based on `(duration, intensity)`
   similarity and affine gap penalties. Output: a mapping `p_i → d_j | ∅`. This
   is cheap (O(mn), both ≤ ~50) and gives the overlay the ability to say "you
   are looking at planned rep 4" without asserting whether rep 4 was hit.
3. **Time-warped alignment against the raw signal.** Build the plan's target
   curve as a step function over planned time, then subsequence/open-begin-end
   DTW it against the executed stream. Classic DTW (Sakoe & Chiba 1978) with a
   Sakoe–Chiba band or Itakura parallelogram to bound the warp;
   `dtaidistance`/`tslearn` are the reference implementations; FastDTW (Salvador
   & Chan 2007) is the approximate O(n) variant — though Wu & Keogh ("FastDTW is
   approximate and generally slower than the algorithm it approximates",
   TKDE 2021) showed it is usually slower than a properly bounded exact DTW at
   these sizes, so just use banded exact DTW. Open-begin-end DTW matters because
   the athlete's warm-up and cool-down are longer/shorter than planned and
   should not be forced to align.

   ```
   cost(i, j) = |plannedTargetAt(i) − actualAt(j)|      # in %threshold units
   D(i, j)    = cost(i, j) + min(D(i−1, j), D(i, j−1), D(i−1, j−1))
   # band: |i·(n/m) − j| ≤ w    # w ≈ 10–20 % of n
   # open-end: answer = argmin_j D(m, j) rather than D(m, n)
   ```

4. **Per-step adherence scoring.** Given (2) or (3), each planned step gets
   `durationRatio`, `intensityRatio`, and a compliance score. The repo has
   deliberately declined this (ADR 0034: "reverses the Telemetry Overlay's
   deliberate no-per-step decision"). The honest middle ground nobody has
   written down: **compute the alignment, expose it as navigation and as
   _executed_ values per planned step, and withhold the pass/fail verdict.**
   Showing "planned 4×4′ @ 300 W · executed 302, 298, 291, 274 W" makes no
   accusation; the athlete draws the conclusion.

---

## Part 2 — Analysis platform data model & surfaces

### 2.1 Activity stream storage

#### Channels that matter

The union of what the three file formats and the main streaming API expose, and
what each channel unlocks:

| Channel          | FIT `record` field                           | TCX                                          | GPX 1.1                                    | Stream API key    | Unlocks                               |
| ---------------- | -------------------------------------------- | -------------------------------------------- | ------------------------------------------ | ----------------- | ------------------------------------- |
| time             | `timestamp` (253)                            | `Trackpoint/Time`                            | `trkpt/time` (optional!)                   | `time`            | everything                            |
| distance         | `distance` (5, scale 100, **accumulated**)   | `Trackpoint/DistanceMeters` (**cumulative**) | — (derive by haversine)                    | `distance`        | per-interval distance, splits         |
| altitude         | `enhanced_altitude` (78) / `altitude` (2)    | `AltitudeMeters` (often absent)              | `trkpt/ele`                                | `altitude`        | elevation gain, GAP, climbs, VAM      |
| latlng           | `position_lat/long` (0/1, **semicircles**)   | `Position/LatitudeDegrees`                   | `@lat`/`@lon` (required)                   | `latlng`          | map, route matching, derived distance |
| heart rate       | `heart_rate` (3)                             | `HeartRateBpm/Value`                         | `gpxtpx:hr` (v1/v2)                        | `heartrate`       | HR zones, drift                       |
| cadence          | `cadence` (4) + `fractional_cadence` (53)    | `Cadence`, `ns3:TPX/RunCadence`              | `gpxtpx:cad`                               | `cadence`         | run form, per-interval cadence        |
| power            | `power` (7), `accumulated_power` (29)        | `ns3:TPX/Watts`                              | `gpxpx:PowerInWatts` **or** bare `<power>` | `watts`           | NP, TSS, W′, everything               |
| speed / velocity | `enhanced_speed` (73) / `speed` (6)          | `ns3:TPX/Speed`                              | `gpxtpx:speed` (v2 only)                   | `velocity_smooth` | pace                                  |
| temperature      | `temperature` (13)                           | —                                            | `gpxtpx:atemp`                             | `temp`            | HR-drift context                      |
| grade            | `grade` (9, scale 100)                       | —                                            | —                                          | `grade_smooth`    | GAP shortcut                          |
| moving           | (derive from `event` timer msgs)             | (derive from multiple `Track` per `Lap`)     | (derive from `trkseg` boundaries)          | `moving`          | pause-vs-dropout, moving time         |
| respiration      | `enhanced_respiration_rate` (108, scale 100) | —                                            | —                                          | —                 | future                                |
| core temperature | `core_temperature` (139, scale 100)          | —                                            | —                                          | —                 | heat training                         |

Format notes that bite (all verified against the specs/SDK profile, see
References):

- **FIT semicircles → degrees is `deg = semicircles · 180 / 2³¹`**, and an
  unfixed GPS record carries the invalid sentinel `0x7FFFFFFF`, not `0`.
- **FIT scale/offset direction:** "the binary quantity is divided by the scale
  factor and then the offset is subtracted" — so altitude is `raw/5 − 500`.
  Getting the order backwards is the classic altitude bug.
- **FIT legacy fields are _component containers_.** `altitude` (2) declares
  `components=[78]`, `speed` (6) declares `components=[73]`, `respiration_rate`
  (99) → `enhanced_respiration_rate` (108). A conforming decoder synthesises the
  `enhanced_*` field from the legacy one. Read the `enhanced_*` field and treat
  the legacy one as fallback; never sum them.
- **FIT accumulated fields wrap.** `distance`, `total_cycles`,
  `accumulated_power` are flagged `is_accumulated` and must be accumulated with
  a rollover-aware delta (`acc += (v − last) & ((1<<bits)−1)`), not read
  directly.
- **FIT compressed timestamp headers** (header bit 7 = 1; bits 5–6 = local
  message type 0–3; bits 0–4 = a 5-bit second offset that rolls over every 32 s)
  are **not implemented by either of Garmin's official SDKs** — the JS decoder's
  `#decodeCompressedTimestampDataMessage()` throws "compressed timestamp
  messages are not currently supported", and the Python SDK does the same.
  **This repo uses `@garmin/fitsdk`, so a FIT file using compressed timestamp
  headers fails to parse today.** `python-fitparse` and `fitdecode` both support
  them; a JS equivalent (`fit-file-parser` / `muktihari/fit`) or a small local
  shim would be needed. Worth an explicit test fixture.
- **FIT rate/CRC/framing:** endianness is declared **per definition message**,
  so one file can legally mix; a file may be a **chain** of concatenated
  complete FIT files; and because most devices write summary-last, a truncated
  file can have **no `session` and no `activity` message** at all. Garmin's own
  cookbook recommends synthesising a session from the first/last record
  timestamps rather than failing.
- **FIT developer fields** are keyed by the pair
  `(developer_data_index, field_definition_number)` — the field number is not
  globally unique. A `field_description` may set `native_field_num` to declare
  equivalence with a native field, and in that case the spec is explicit that
  **the native scale/offset must NOT be applied** — use the description's own.
  Developer fields are only present when bit 5 of a definition record header is
  set. Relevant concretely: CORE body-temperature sensors write core temp as a
  developer field on older firmware and as native `record.core_temperature`
  (139) on newer.
- **FIT pause representation is the `event` message**, not a timestamp gap:
  `event = timer` with
  `event_type ∈ {stop, stop_all, stop_disable, stop_disable_all}`. The cookbook
  warns explicitly that "Smart Recording" variable intervals make it "difficult
  to know the difference between short pauses… and long durations in between
  samples" — so gap-inference is not a substitute.
- **FIT laps already carry the answer, often.**
  `lap.lap_trigger ∈ {manual, time, distance, position_start, position_lap, position_waypoint, position_marked, session_end, fitness_equipment}`
  distinguishes an athlete-pressed lap from an auto-lap, and
  **`lap.intensity ∈ {active, rest, warmup, cooldown, recovery, interval, other}`**
  is a _device-authored structure label_. A watch executing a structured workout
  labels every lap directly. Reading that is strictly better than detecting it.
- **FIT `total_elapsed_time` vs `total_timer_time` vs `total_moving_time`** are
  three different numbers, all on the lap and session messages.
- **FIT `activity`/`session` may be missing** on a truncated file — never make
  their presence a hard parse precondition. `local_timestamp − timestamp` on the
  activity message is the only place the timezone offset lives.
- **TCX has no pause markers in the schema at all.** The convention is that
  `Lap` allows `maxOccurs="unbounded"` `Track` children, and a second `Track`
  inside one lap means the recording stopped and restarted. This is a
  convention, not a schema statement.
- **TCX `TriggerMethod ∈ {Manual, Distance, Location, Time, HeartRate}`** and
  **`Intensity ∈ {Active, Resting}`** — much coarser than FIT's enums, and note
  `Resting`, not `Rest`. TCX `Sport` is only `Running | Biking | Other`.
- **TCX `Trackpoint/DistanceMeters` is cumulative from activity start**, not per
  point and not per lap; a producer that resets it per lap is a known bug —
  validate monotonicity. `Calories` and `DistanceMeters` are _required_, so
  producers emit `0` for unknown, which is ambiguous with a real zero.
- **GPX 1.1 has no distance, speed, HR, cadence or power** in the base schema —
  everything comes from extensions, and **`time` and `ele` are both optional**.
  The XSD states outright that a new `trkseg` is how you represent a gap in
  reception or a receiver turned off, so **`trkseg` boundaries are the only
  pause signal GPX gives you**.
- **GPX namespace prefixes vary** (`gpxtpx` vs `ns3` vs others) and v1/v2 are
  _different namespace URIs_. Resolve by URI, never by prefix. Power has two
  incompatible conventions: the schema-backed
  `gpxpx:PowerExtension/PowerInWatts`, and a bare namespace-less `<power>`
  element that is what large exporters actually emit. Support both.
- **`velocity_smooth` and `grade_smooth` are already smoothed by the provider**
  — double-smoothing them before segmentation costs edge sharpness.
- **`device_watts: false` means the power stream is _estimated_** from speed,
  grade and weight. Estimated power must not feed NP/TSS.
- **`resolution` and `series_type` are response-only on the streams endpoint in
  the current spec** — the request takes only `id`, `keys`, and `key_by_type`
  (documented as "Must be true"). You can no longer ask for a downsampled
  stream; you always get full resolution and downsample yourself.
- **Published rate limits are 200 req/15 min and 2,000/day overall, with a
  tighter 100/15 min and 1,000/day for read endpoints**, surfaced in
  `X-RateLimit-*` and `X-ReadRateLimit-*` headers as comma-separated
  `15min,daily` pairs. Windows reset on the quarter hour; daily at UTC midnight.
  (The #328 note flagged that this repo's limiter assumes 600/15 min — that is
  6× the documented read budget and should be re-checked.)
- **Garmin's activity-detail `samples[]`** field names are `startTimeInSeconds`,
  `latitudeInDegree`, `longitudeInDegree`, `elevationInMeters`,
  `airTemperatureCelcius` (the misspelling is real), `heartRate`,
  `speedMetersPerSecond`, `stepsPerMinute`, `powerInWatts`, `bikeCadenceInRPM`,
  `swimCadenceInStrokesPerMinute`, `totalDistanceInMeters`,
  `timerDurationInSeconds`, `clockDurationInSeconds`, `movingDurationInSeconds`.
  Note the three separate duration channels — Garmin hands you the pause/moving
  distinction per sample. Raw FIT is only reachable via the partner-gated
  activity-file endpoint.

#### Sampling rates and gaps

Consumer devices record at 1 Hz, or "smart recording" (variable, 1–10 s,
event-driven). Swim watches record per length. Trainers/power meters can emit
sub-second. So a stream is **not** evenly spaced in general, and any storage
format that assumes an even grid must resample at ingest — which is what our
`downsampleStream` does, and which is fine for display and lossy for analysis.

Gap semantics deserve three distinct states, not one `null`:

| State   | Cause                              | Correct handling                                                    |
| ------- | ---------------------------------- | ------------------------------------------------------------------- |
| Paused  | timer stopped, auto-pause          | break the line; exclude from moving time; a segment boundary        |
| Dropout | sensor lost (HR strap, GPS tunnel) | break the line; **not** a segment boundary; bridgeable for analysis |
| Zero    | genuinely 0 W coasting             | a real value, not a gap                                             |

Conflating pause and dropout is a real correctness bug for detection: a 40 s HR
dropout mid-rep currently looks like a pause and splits the rep.

#### Downsampling for charting vs full resolution for computation

The two use cases have opposite requirements and should not share one artifact.

- **Charting** wants ≲ 2000 points (device pixel width), _visually faithful_.
  The right algorithm is **LTTB** (Largest-Triangle-Three-Buckets), Steinarsson,
  "Downsampling Time Series for Visual Representation", MSc thesis, University
  of Iceland, 2013: bucket the series into `n` equal buckets, keep the first and
  last points, and from each bucket pick the point forming the **largest
  triangle** with the previously selected point and the mean of the next bucket.
  It preserves peaks and troughs, which a bucket **mean** destroys. Reference
  implementations: `flot-downsample`, `highcharts-downsample` (both by
  Steinarsson), plus ports in most languages. Note LTTB picks _real_ points, so
  it cannot be used where you need aligned multi-channel buckets — for
  multi-channel you either run LTTB on a designated channel and take the sibling
  values at the chosen indices, or accept per-channel index misalignment.
- **Computation** wants full resolution, or at least a fixed fine grid (1–5 s),
  and does not care about size because it is read once by a job, not by a page
  render. Bucket-mean at 19 s (a 5 h ride under a 1000-sample cap) makes a 45 s
  rep invisible; that is a detection ceiling imposed by a _display_ decision.

Practical two-tier shape:

```ts
// Tier 1 — hot, read on every page view, bounded, LTTB or bucket-mean.
type DisplayStream = { resolutionSec: number; timeSec: number[] /* channels */ }

// Tier 2 — cold, read by jobs only. Fixed 1 s grid, gzip/brotli'd, or delta+
// varint packed. A 5 h ride at 1 Hz × 6 channels ≈ 108 k values; as float32
// that is ~430 kB raw, ~60–120 kB gzipped, and far less with delta encoding
// because HR/cadence/power are slowly varying small integers.
type AnalysisStream = {
	resolutionSec: 1
	encoding: 'gzip-json' | 'delta-varint'
	payload: Buffer
	channels: ChannelName[]
}
```

Storage sanity check: even at 100 kB/activity, 1000 activities is 100 MB — fine
on object storage, borderline as SQLite BLOBs on a single small node. A
reasonable compromise if a second tier is too much: **raise the sample cap and
drop the coupling between the display grid and the analysis grid** — i.e. keep
one stored stream at a genuine 1 s/5 s grid and LTTB it _at read time_ for the
chart. That pays CPU per page view (which ADR 0020 rejected) but only for the
detail route, and it can be cached.

### 2.2 Custom / extensible fields and custom charts

The ask: let an athlete define a derived field ("kJ per TSS", "decoupling",
"time above 90 % HRmax") and chart it.

GoldenCheetah's model is the most complete open-source precedent. A **user
metric** carries: a _symbol_ (identifier used in formulas), a _name_, a _type_
that determines **aggregation** (`Total` | `Peak` | `Average`, where `Average`
is duration-weighted and requires the program to supply a `count`), a
_description_, an _is-time_ flag (render as HH:MM:SS), an _aggregate-zero_ flag,
and metric/imperial _unit_ labels with a conversion factor. The program is
written in a small expression language with optional lifecycle hooks —
`relevant` (does this metric apply to this activity), `init`, `sample` (per data
point; documented as discouraged for performance), `before`/`after`, `value`,
and `count`. Metrics are recomputed when an activity is imported or changed, and
built-in metrics are computed first so user metrics can reference them.
Crucially the same machinery evaluates **per interval** as well as per activity
(`IntervalItem::getForSymbol`).

The data-model shape that generalises:

```ts
type FieldValueType =
	| 'number'
	| 'duration'
	| 'distance'
	| 'pace'
	| 'power'
	| 'text'
	| 'enum'
	| 'boolean'

type CustomFieldDefinition = {
	id: string
	athleteId: string
	key: string // stable identifier used in formulas & saved views
	label: string
	valueType: FieldValueType
	unit: string | null
	precision: number
	aggregation: 'total' | 'average' | 'peak' | 'last' | 'none'
	aggregateZero: boolean
	scope: 'activity' | 'interval' | 'both'
	source:
		| { kind: 'manual' } // athlete types it in
		| { kind: 'derived'; expression: string; engineVersion: string }
	appliesTo: { disciplines: Discipline[] } | null // the `relevant` hook
	createdAt: Date
}

type CustomFieldValue = {
	definitionId: string
	activityImportId: string
	intervalId: string | null
	numberValue: number | null // typed columns, not a stringly `value`
	textValue: string | null
	computedAt: Date | null // null for manual
	definitionVersion: number // invalidate the cache on formula edit
}
```

**Risks, and the mitigations:**

- **This is EAV.** The well-documented failure modes (Karwin's _SQL
  Antipatterns_; the PostgreSQL community writes about it constantly) are: no
  type safety, no `NOT NULL`, no referential integrity on values, and horrible
  pivot queries when you want 8 custom columns in one list row. Mitigations:
  typed value columns rather than one `value TEXT`; a hard cap on definitions
  per athlete; and for the list surface, **precompute a per-activity JSON map**
  of custom values rather than pivoting N joins.
- **A JSON column is the pragmatic alternative** (`customValues JSON` on the
  activity row, definitions in a real table). Loses per-value queryability
  unless the DB can index into JSON — SQLite can via generated columns, which is
  the escape hatch.
- **Formula language = a sandbox problem.** A general expression evaluator over
  a stream is a code-execution surface and a DoS surface (a `sample` hook over
  18 000 points × 1000 activities). Constraints that keep it safe: no loops, a
  fixed function allowlist, a step/time budget, evaluation only on a job queue,
  never in a request.
- **Staleness.** Every derived value needs `definitionVersion` + `computedAt`,
  and an edit to a definition must enqueue a recompute — otherwise the list
  shows a mix of old and new semantics under one column header, which is exactly
  the kind of silently-wrong number the honesty principle forbids.
- **Custom charts** are a thin layer on top: a saved chart is
  `{ xField, series: [{ fieldKey, aggregation, chartType }], filter, grouping, period }`.
  The hard part is not the chart, it is that every field referenced must resolve
  through the same definition registry.

### 2.3 The activity list surface

What a serious list surface needs, and the model behind each:

**Configurable columns + saved column sets ("tabs").** A saved view is a first-
class row, not a UI preference blob:

```ts
type ActivityView = {
	id: string
	athleteId: string
	name: string // the tab label
	orderIndex: number
	columns: Array<{
		fieldKey: string // builtin metric key OR custom field key
		width?: number
		aggregate?: 'sum' | 'avg' | 'min' | 'max' | 'avgSd' | 'none' // footer
	}>
	filter: string // the query source text
	filterAst: FilterNode // parsed & validated at save time
	sort: Array<{ fieldKey: string; dir: 'asc' | 'desc' }>
	groupBy: { fieldKey: string; period?: 'week' | 'month' | 'year' } | null
	isDefault: boolean
}
```

Storing both `filter` (source) and `filterAst` (parsed) means a saved view can
be executed without re-parsing and can be _rejected at save time_ rather than
failing at read time.

**A filter/query language.** Don't invent one. Established grammars with public
ABNF and existing parsers:

- **SCIM filter** (RFC 7644 §3.4.2.2): `attrExp` / `logExp` / `valuePath`, with
  operators `eq ne co sw ew gt lt ge le pr`, `and`/`or`/`not`, parentheses, and
  `attr[sub eq "x"]` for nested collections. Small, unambiguous, several
  open-source parsers exist.
- **OData `$filter`**: bigger, has arithmetic and functions, more than needed.
- **Lucene query syntax**: nice for free-text-ish filtering, weak for typed
  numeric comparisons and ranges over units.

A domain-flavoured subset is what athletes actually want:
`discipline = run and distance > 15km and date >= -8w and tss > 80`. The unit
literals (`15km`, `8w`, `4:00/km`) are the interesting part and are exactly
where a generic grammar needs a typed-literal extension. Given the repo already
has a shared display-formatting layer (ADR 0023), the parse side is its natural
inverse and should live beside it.

**Aggregate footer rows.** Per-column aggregation kind must be part of the
column definition (see `aggregate` above), because the correct aggregate is
type-dependent: distance sums, pace averages (harmonically, weighted by
distance), TSS sums, HR averages (weighted by duration), and "avg ± SD" is the
one that actually communicates consistency across a set. GoldenCheetah's
per-interval `stdmean_`/`stdvariance_` exist for exactly this.

**Grouping and totals tables.** Group by discipline × period (week/month/year)
with totals per cell. Two model choices: compute on read (fine to a few thousand
activities in SQLite) or maintain a rollup table. Given the app already computes
CTL/ATL rollups, reusing that machinery is preferable to a second one.

### 2.4 Data portability

Most of the parsing gotchas are catalogued in §2.1 above, because they are the
same facts that determine which channels exist. What remains is the export side
and a few whole-file traps.

**Whole-file traps.**

- **FIT**: header is 12 or 14 bytes with ASCII `.FIT` at bytes 8–11; integrity
  is `file size == header size + data size + CRC size` plus a CRC match.
  **Endianness is per definition message** — one file can legally mix. Base type
  IDs carry an endian bit (`BASE_TYPE_MASK = 0x1F`). Invalid sentinels (`0xFF`,
  `0x7F`, `0xFFFF`, `0x7FFF`, `0xFFFFFFFF`, `0x7FFFFFFF`, …) must be scrubbed to
  `null` **before** scale/offset is applied. The `date_time` epoch is
  1989-12-31T00:00:00Z (631065600 s); values below `0x10000000` are a _system_
  time, not UTC.
- **Multisport FIT**: `num_sessions > 1`, one session per leg _including
  transitions_ (`sport = transition`). Timer events do **not** bracket each leg
  — use sessions for legs and timer events for pauses.
- **Pool swims**: `length` messages with a `length_type` (including idle
  lengths); distance per length is `session.pool_length`, always in metres
  (`pool_length_unit` is display-only). This is a native, exact per-rep signal —
  swim structure detection is nearly free, and is currently excluded.
- **Dynamic fields / subfields**: `event.data` (field 3) means different things
  depending on the `event` value (`battery` → `battery_level`,
  `rear_gear_change` → `gear_change_data`, …). Subfields have no field number of
  their own.
- **GPX elevation** is GPS-derived, carries no source marker, and drifts tens of
  metres — cumulative ascent must be threshold-filtered or it is fiction. If a
  barometric device was re-encoded to GPX, you cannot tell from the file.
- **`gpxpy`** stores extensions as raw ElementTree DOM with no typed accessors —
  you match namespaced tags yourself. Its object model is not 1:1 with the XML
  (GPX 1.0's `speed` is lost when serialising as 1.1), it defaults to version
  1.0 when the `version` attribute is missing, and it uses `lxml` when installed
  and `minidom` otherwise — which changes extension-element semantics. Its
  `max_speed` helper is **not raw**: it strips the top 5 % of speeds as GPS
  errors.

**Bulk export.** The established shape for an activity-data export is a CSV
index plus a directory of original files. Practical requirements learned from
the ecosystem:

- **Ship the originals, not a re-encode.** Re-encoding to GPX or TCX drops timer
  events, developer fields, per-sample power sub-metrics, temperature, and
  pool-swim length structure, and turns pauses into either nothing (GPX without
  segment splits) or an ambiguous `Track` boundary (TCX). We already store the
  provider payload verbatim in `rawJson`, so an export of originals is nearly
  free — for uploaded files it _is_ the file, and for API imports it is the
  payload.
- **Do not trust filename extensions in an import path.** Real exports contain
  `123.gpx`, `456.gpx.gz` and `789.fit.gz` side by side. Sniff for the gzip
  magic `1f 8b` and for `.FIT` at bytes 8–11.
- **Index CSV headers are often localised** by the exporting account's language.
  Index by position or normalise headers; don't hardcode English.
- **Manual activities appear in the index with no file** — the CSV is the only
  record of them.
- Export should include derived data too (per-activity metrics, per-interval
  metrics, custom field values), because that is the part the athlete cannot
  reconstruct from the originals.

---

## Implications for trainm8

Read against `CONTEXT.md`, ADR 0020/0024/0029/0030/0032/0033/0034/0035/0036, the
`WorkoutDetection` / `ActivityStream` Prisma models, and the
`#327`/`#328`/`#330` wayfinder notes. **A lot of Part 1 is already decided and
decided well** — the PELT + band-separation-gate + 2-means pipeline, the
plan-blind rule, the display-derived zone label, the honesty gate, the trust
ordering for laps. Those are confirmed below and should not be reopened.

This section is written to the evidence rather than to the decision record.
Where a shipped ADR is right, it is confirmed. Where the evidence says a shipped
ADR is wrong, it is named and the change is stated as a change — including where
that moves numbers an athlete has already seen. A verdict table closes the
section.

### Gap 1 — There is no per-interval entity, and therefore no per-interval metrics

`WorkoutDetection.structureJson` stores a `WorkoutStructureSchema` (Block →
WorkoutStep → IntensityTarget) — a _prescription_ shape. It carries durations
and an intensity target, and nothing else. There is no place to put avg HR, max
power, distance, cadence, elevation change, moving-vs-elapsed time, or a mean ±
SD across a repeat group. Materializing it into a `Workout` does not help: a
`Workout` is also a prescription.

This is the single biggest structural gap. An "analysis platform" is largely
_the table of intervals with their measured metrics_, and the current model has
no row to hang those on. **Build the `ActivityInterval` model sketched in §1.5
as a first-class, measured entity, a sibling of the detected structure rather
than a replacement for it.**

ADR 0032's "reuses the workout structure vocabulary" clause should be
**amended** to stop there: reusing the prescription vocabulary was right for
_materializing a Workout_ and that half is confirmed, but it is the wrong
vocabulary for _measured_ intervals and the two must not be forced into one
type. A prescription says "4 × 6 min @ Z3"; a measurement says "this rep ran
5:52, 312 W avg, 168 bpm, 41 m climbed" — no amount of nullable fields on an
`IntensityTarget` makes it a measurement.

### Gap 2 — No interval-level editing or provenance

ADR 0033 gives exactly one editing affordance: edit the materialized `Workout`,
which flips `Session Source` `detected → authored` wholesale. There is no
split/merge/drag/rename, no per-interval origin, and no way to keep the
detector's output once the athlete has corrected it. Consequences today:

- Re-detection (engine bump, threshold fix, lap backfill — all explicitly
  anticipated in ADR 0032's provenance note) has nowhere safe to write.
- Athlete corrections are unrecoverable as a calibration corpus, even though ADR
  0033 defers "exact numeric cut points" to _"build-time calibration against the
  seeded corpus"_ — the athlete corrections would be a far better corpus.
- "Revert to detected" is impossible.

**ADR 0033's adopt-on-edit rule should be amended: replace wholesale adoption
with the base+overlay model in §1.5** — `WorkoutDetection` stays immutable and
engine-owned, and athlete edits land on a user-owned interval set that shadows
it. ADR 0033's central decision (a binary band-separation honesty gate plus a
display-only grade, with `low` still auto-importing) is confirmed and untouched;
it is only the single editing affordance that is wrong, and it is wrong because
it destroys the engine's output at the exact moment that output becomes
checkable against a human correction.

### Gap 3 — The stream has three channels; almost every per-interval metric needs a fourth

`ActivityStream` stores `timeSec`, `power`, `heartrate`, `pace`. Missing and
consequential:

| Missing channel             | What it blocks                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `distance`                  | per-interval distance without error accumulation; distance-based steps; splits                                                                         |
| `altitude`                  | GAP, per-interval elevation gain, climb detection, VAM                                                                                                 |
| `cadence`                   | per-interval cadence; run form; the FIT/TCX/GPX parsers already see it                                                                                 |
| `latlng`                    | per-interval map highlight; route matching (a `polyline` exists but is whole-activity)                                                                 |
| `grade`                     | GAP shortcut, climb classification                                                                                                                     |
| `moving`                    | separating pause from dropout; honest moving-time per interval                                                                                         |
| `temperature`               | HR-drift context                                                                                                                                       |
| `respiration` / `core temp` | future; respiration is a FIT message (297) _and_ record field (108), core temp is a **field only** (record 139) — there is no core-temperature message |

All of these are present in the source files/APIs and are being **discarded at
adapt time** — `recordsToRawStream` in `fit-parser.server.ts` reads only
timestamp/heartRate/power/speed, and `RawStream` in `activity-stream.ts` is
typed to exactly three channels. Widening `RawStream` is a small, mechanical
change with a large surface payoff, and ADR 0036 already established the "full
parity across formats" precedent for exactly this kind of widening.

**The sharpest instance: a GPX run import is currently undetectable.**
`pointsToRawStream` in `gpx-parser.server.ts` emits **only** `heartrate`, with
the comment "GPX carries no recorded speed or power channel, so those stay
absent — pace is never estimated from coordinates." Follow that through ADR
0035: a run classifies on pace; pace is absent; the ladder falls to HR; and #327
forbids HR from setting edges. So every GPX run yields _absent_ by construction,
for a file that contains a complete GPS track. It also ignores `gpxtpx:cad`,
`gpxtpx:atemp`, `gpxtpx:speed` (v2 — a genuinely recorded channel) and both
power conventions, all of which are in the published extension schemas.

**The "never estimate pace from coordinates" rule is a misapplication of ADR
0008 and should be dropped.** ADR 0008's principle — never fabricate a number —
is correct and confirmed; deriving distance from consecutive GPS fixes is not
fabrication. It is how a GPS watch computes pace in the first place, and it is
what `velocity_smooth` is on the streaming API. The honest framing is a _lower
confidence_, not an absence: a haversine-derived pace channel is a measurement
with known error characteristics, so it belongs in the existing Load Confidence
ladder behind a reduced label, exactly as ADR 0024 kept average-power Coggan at
`medium` rather than discarding it. Refusing it instead costs an entire ingest
format its detection, its overlay, and its rTSS — which is the less truthful
outcome, by ADR 0024's own argument.

**And the cheapest win of all: FIT laps carry `intensity`.** The enum is
`active | rest | warmup | cooldown | recovery | interval | other` — a
_device-authored structure label_, written directly by any watch executing a
structured workout, alongside `lap_trigger` to tell an athlete-pressed lap from
an auto-lap. Where that is present the structure does not need detecting at all;
it needs _reading_. That is a materially higher-trust signal than anything the
engine can infer, and it is discarded today along with the rest of the lap data.
(FIT files may also carry the _planned_ structure as `workout` / `workout_step`
messages when the session was pushed to the device.)

### Gap 4 — The display grid must stop being the analysis grid: ADR 0020 should be superseded

**The correct design is two tiers: a full-resolution, compressed, cold analysis
stream as the stored truth, and the bounded display grid derived from it as a
render cache.** ADR 0020 decided there is one stored stream and that it is the
downsampled one; that decision should be **superseded**, because it was reasoned
entirely from chart cost ("the overlay does not need 1 Hz fidelity") and every
analysis consumer since has silently inherited a chart constraint as if it were
a physical limit.

The inheritance is documented and measurable:

- `res = max(5, ceil(span/999))`. A 5 h ride lands at ~19 s resolution, where a
  45 s rep is 2–3 samples. #330 measured the result: 30/30 and 45/15 sessions
  are invisible to the detector.
- ADR 0034 then books that under-detection as a **permanent** honesty cost
  ("structure not confidently verifiable ... an accepted honesty cost"). It is
  not permanent. It is a consequence of the grid.
- ADR 0033 compensates by leaning on provider laps to rescue short reps — a
  workaround for a problem the storage tier created.
- ADR 0024 states outright that bucket-mean smoothing makes stored Normalized
  Power "slightly conservative versus a 1 Hz NP", and that buckets coarser than
  30 s degrade the rolling pass "to identity". Stored TSS for every long or
  variable ride is therefore biased by a chart decision.
- ADR 0021's short-duration best-effort benchmarks and the mean-maximal curve
  (§2.1) cannot be computed truthfully at 19 s at all.

For TCX and Strava imports the full-resolution data is **already retained
verbatim** in `rawJson` — the information is stored, just not in a queryable
shape — so for those sources the second tier is a re-shaping job, not a new
ingest.

**Migration cost, stated plainly and not used as a reason to soften this:**

- Recomputing NP from a fine grid will **move stored TSS, and therefore
  CTL/ATL/TSB**, for historical rides — upward for variable rides, since today's
  numbers are conservative by ADR 0024's own admission. This is the one-time
  migration + notice case, not an athlete-facing offer.
- Re-detection over a finer grid will find structure on sessions that currently
  read "no structure detected", which changes what the athlete sees on old
  sessions. Gap 2's base+overlay model is a prerequisite so that re-detection
  has somewhere safe to write.
- Sources whose originals were not retained keep only the coarse grid. Those
  activities must stay honestly capped — short-duration bests unavailable, ADR
  0008's existing vocabulary — rather than being back-filled from an
  interpolated curve.

The **sizing** is the open question, not the shape: the §2.1 compression
arithmetic is unmeasured (see Uncertainty flags), so measure the blob size on
this database before choosing an encoding. That is a question about _how_ to
store the analysis tier, not about _whether_ to have one.

Related and separate: `null` conflates pause with dropout, which is a
correctness issue for step 1 of the pipeline (split-on-gap), not just a display
nicety. A `moving` channel (Gap 3) fixes it.

### Gap 5 — Ramps and pyramids have no answer

#330 documents the ramp failure ("PELT L2 fits piecewise-constant segments; a
smooth 130→190 W ramp has no sharp changepoint, so its tail merges into rep 1")
and no ADR addresses it. Two concrete options exist (§1.2 step 5): a linear-fit
post-pass per segment, or a second PELT run with a piecewise-linear cost. Either
would also let a detected step carry `shape: 'ramp'`, which the authoring
vocabulary may or may not support — worth checking, because a ramp warm-up is
the single most common non-constant block in real training.

Pyramids are worse: `Block.repeat` presumes homogeneous reps, so a
`1'-2'-3'-2'-1'` ladder has no representation at all. It will silently degrade
to five singleton steps or to _absent_.

### Gap 6 — ADR 0034 refuses the right thing at the wrong granularity, and should be amended

**The per-step verdict refusal is correct and should stand.** Grading each
detected step against its planned step, given systematic under-detection, would
render a fabricated "N of M intervals" that blames the athlete for the
detector's blindness. That reasoning is sound and this research confirms it.

**What ADR 0034 gets wrong is the scope of the word "per-step".** Its blanket
"whole-session, never per-step" also forecloses a per-step **mapping**, which is
not a verdict and carries no judgement. A subsequence/open-end DTW or
Needleman–Wunsch alignment (§1.6) is a pure function of two stored artifacts —
exactly the same category as `structureAdherence(detected, planned)`, which ADR
0034 already permits — and it unlocks three things the app currently cannot do:

- the overlay labelling "planned rep 4" on the axis;
- a per-planned-step table of _executed_ numbers with **no pass/fail column**;
- a materially better-grounded whole-session verdict than archetype comparison,
  because the alignment tells you _which_ planned steps went unmatched.

So amend ADR 0034 on two points, plainly:

1. **The per-step mapping is permitted; only the per-step verdict is refused.**
   Left implicit, "no per-step" will be read as forbidding the alignment, and
   the overlay stays illegible for no honesty gain.
2. **Retire the "accepted honesty cost" framing.** ADR 0034 books permanent
   detector blindness on short-rep and in-zone sessions. That blindness is a
   consequence of the display-grid storage decision (Gap 4), not a property of
   the problem. Once the full-resolution analysis tier lands, the asymmetric
   degradation must be re-derived against the real detector, not carried forward
   as a standing limitation.

ADR 0034's third decision — a `recorded` or `detected` session computes **no**
Planned TSS, because grading a plan reconstructed from actuals against those
same actuals is ~100 % by construction — is confirmed, unaffected, and should
not be touched.

### Gap 7 — `lapsJson` is inert, and it is load-bearing for the honest failure modes

The column exists with the comment "populated later (#328)". ADR 0033 and 0034
both lean on laps to rescue short-rep sessions, and ADR 0036 spent a whole
decision getting TCX streams to parity partly for detection reach. Until laps
are actually ingested and the snap-to-lap step exists, the detector's documented
blind spots stay open and the "further motivation for the lap-ingestion work" in
ADR 0034's consequences is the only thing holding them.

Also note: laps are the _only_ signal that disambiguates pause from dropout
without a `moving` channel (Gap 3).

### Gap 8 — Nothing in Part 2's surface layer exists

No ADR covers, and no model supports:

- **Configurable activity-list columns or saved column sets.** `imports._index`
  renders a fixed line per import (discipline, duration, distance).
- **A filter/query language over activities.** No filtering at all beyond the
  route's implicit ordering.
- **Aggregate footers, grouping, totals tables.** `avg ± SD` is not derivable
  because per-interval and per-activity metrics are not stored in a uniform,
  addressable "field" registry.
- **User-defined derived fields or custom charts.** There is no field registry
  at all — metrics are hard-coded properties on `ActivityImport`.
- **Bulk export.** `resources/download-user-data.tsx` is the Epic Stack default
  JSON dump of the user row; there is no activity CSV, no original-file export,
  and no re-download of the stored `rawJson`.

The unifying missing concept is a **field registry**: a typed, keyed catalogue
of every displayable/aggregatable quantity (builtin + custom, activity-scope +
interval-scope) with its value type, unit, precision, and default aggregation.
Columns, filters, sorts, footers, custom charts, and CSV export are all just
consumers of that one registry. Building any one of those five surfaces without
it means building it four more times. Note it would sit naturally next to the
existing shared display-formatting layer (ADR 0023), which already owns half the
metadata (unit + precision + formatter) — the registry is that layer plus a key,
a value type, and an aggregation rule.

### Smaller notes

- **Normalized Power per interval must be forbidden below ~10 min** (30 s window
  ≤ 5 % of the interval). ADR 0035 reaches "don't compute per-segment NP" by a
  different route and is confirmed; the duration rule is the general principle,
  and it belongs stated once in ADR 0024 — which owns NP — because it also
  governs any future per-lap or per-peak NP.
- **Extend detection to swim once laps land.** Detection is run/bike only by ADR
  0032's scope clause, and swim is arguably the _easiest_ discipline to segment
  because pool lengths are a native lap signal — per-length data makes swim
  detection nearly free. That scope clause should be amended rather than treated
  as a boundary. Indoor/rowing activities collapse to `other` under ADR 0015,
  which is confirmed: don't expand the Discipline enum speculatively.
- **Re-detection triggers** are deferred by ADR 0032 ("left to a later ticket").
  Gap 2 is a prerequisite: you cannot safely re-run detection until edits live
  somewhere other than the detected structure.
- **Peak/best-effort intervals are a discovered-interval _type_, not a separate
  mechanism.** ADR 0021 deferred pace/power benchmarks until "streams land" —
  they have landed, so the deferral condition is met and ADR 0021's
  single-benchmark (`farthest`) scope should be amended. A
  `PEAKPOWER`/`PEAKPACE` duration ladder over the same `ActivityInterval` model
  delivers Personal Records and the mean-max curve from machinery Gap 1 needs
  anyway. Note the ordering: short-duration rungs of that ladder are only
  truthful on the full-resolution tier (Gap 4), so land the tier first and mark
  the short rungs unavailable until it exists.

### Uncertainty flags

- The claim that a two-tier stream is affordable rests on rough compression
  arithmetic (§2.1), not a measurement against this database on this Fly node.
  Measure before deciding.
- Penalty/tolerance constants quoted here (`8·log n`, 25 s dwell, 8 %/15 %
  margins) come from the repo's own prototype against its own seeded corpus;
  they are not externally validated and are explicitly build-time calibration.
- The Minetti polynomial is widely reproduced in this exact form by practitioner
  tools; the coefficients should be checked against the 2002 paper itself before
  shipping a GAP number, and note the model is for _metabolic cost_, not for
  equivalent-perceived-effort, which is what athletes assume GAP means.
- No primary algorithm documentation exists for the major closed-source analysis
  platforms; nothing here is attributed to them.
- **Bulk-export archive internals are not documented by any provider.** The
  CSV-index-plus-originals layout and the mixed-gzip filenames are corroborated
  by several independent open-source tools but not by a primary source. Design
  the importer defensively (sniff magic bytes) rather than to a documented spec.
- The Strava rate-limit and stream-parameter facts above come from the current
  swagger spec and rate-limit page; historical behaviour differed, so any
  existing code written against the older `resolution` parameter may be silently
  ignored rather than erroring.

### ADRs this research challenges

| ADR                                        | What it decided                                                                                  | What the evidence says                                                                                                                                | Verdict       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **0020** downsampled telemetry             | One stored stream, downsampled to a 5 s floor / 1000-sample cap, chosen for chart cost           | The display grid must not be the analysis grid: detection blindness, biased NP/TSS and unavailable short-duration bests all trace to it. Two tiers.   | **Supersede** |
| **0034** detected-structure verification   | Structure Adherence is "whole-session, never per-step"; under-detection is an accepted cost      | The per-step _verdict_ refusal is right; the per-step _mapping_ is not a verdict and must be permitted. The "permanent" blindness is a Gap 4 artifact | **Amend**     |
| **0032** structure detection auto-import   | Detection reuses the prescription vocabulary; scope is run/bike only                             | Right for materializing a Workout, wrong for measured intervals — needs a sibling `ActivityInterval`. Swim is nearly free once laps land              | **Amend**     |
| **0033** detection confidence honesty bar  | The only edit path is editing the materialized Workout, flipping `detected → authored` wholesale | Destroys the engine output, blocks re-detection and discards the best available calibration corpus. Base + user-owned overlay instead                 | **Amend**     |
| **0021** Personal Records                  | `farthest` only; pace/power benchmarks deferred "once streams land"                              | Streams have landed; peak efforts are a discovered-interval type over the same model. Short rungs wait on the Gap 4 tier, the ladder does not         | **Amend**     |
| **0024** Normalized Power from the stream  | NP from the stored (downsampled) power channel; average-power Coggan retained at `medium`        | The confidence-label logic is exactly right and is the template for GPX-derived pace; but NP needs a stated ~10 min floor for any per-segment use     | **Amend**     |
| **0023** shared display-formatting layer   | One module owns unit, precision and formatting for every athlete-facing value                    | This is the natural home of the missing **field registry** — the same metadata plus a key, a value type and an aggregation rule                       | **Amend**     |
| **0008** Unavailable Metric                | Never fabricate a number; degrade to an honest gap                                               | Confirmed as the governing principle — but it does not forbid a measured-with-known-error channel such as haversine-derived pace                      | **Confirm**   |
| **0035** detected-segment classification   | Classify on the discipline's anchor channel; zone label display-derived; HR never sets edges     | Matches the literature and the #330 evidence; the HR-lag trimming and sibling-pooling rules are the right refinements                                 | **Confirm**   |
| **0036** TCX trackpoint stream             | Full channel parity across import formats                                                        | The correct precedent, and the one to extend to the GPX extension channels and the wider `RawStream`                                                  | **Confirm**   |
| **0015** `other` discipline is import-only | Unmapped activity types collapse to `other`; don't expand the enum speculatively                 | Confirmed — mismapped load is invented data, and the enum should grow only behind a Load Formula decision                                             | **Confirm**   |

---

## References

### Change-point detection & alignment

- Truong, Oudre & Vayatis, "Selective review of offline change point detection
  methods", _Signal Processing_ 167:107299, 2020 —
  <https://arxiv.org/abs/1801.00718> ·
  <https://doi.org/10.1016/j.sigpro.2019.107299>
- `ruptures` docs — <https://centre-borelli.github.io/ruptures-docs/> · source
  <https://github.com/deepcharles/ruptures>
- Killick, Fearnhead & Eckley, "Optimal detection of changepoints with a linear
  computational cost", _JASA_ 107(500):1590–1598, 2012 —
  <https://arxiv.org/abs/1101.1438>
- Haynes, Eckley & Fearnhead, "Computationally Efficient Changepoint Detection
  for a Range of Penalties" (CROPS), _JCGS_ 26(1):134–143, 2017 —
  <https://doi.org/10.1080/10618600.2015.1116445>
- Haynes, Fearnhead & Eckley, "A computationally efficient nonparametric
  approach for changepoint detection" (ED-PELT), _Statistics and Computing_
  27:1293–1305, 2017 — <https://arxiv.org/abs/1602.01254>
- Zhang & Siegmund, "A modified Bayes information criterion…" (MBIC),
  _Biometrics_ 63:22–32, 2007
- Fryzlewicz, "Wild Binary Segmentation for multiple change-point detection",
  _Annals of Statistics_ 42(6):2243–2281, 2014
- Page, "Continuous Inspection Schemes" (CUSUM), _Biometrika_ 41(1–2):100–115,
  1954 — <https://doi.org/10.1093/biomet/41.1-2.100>
- Adams & MacKay, "Bayesian Online Changepoint Detection", 2007 —
  <https://arxiv.org/abs/0710.3742>
- R `changepoint` package (`cpt.mean`, PELT, MBIC/CROPS penalties) —
  <https://rdrr.io/cran/changepoint/man/cpt.mean.html>
- Pearson, Neuvo, Astola & Gabbouj, "Generalized Hampel Filters", _EURASIP J.
  Adv. Signal Process._ 2016:87 — <https://doi.org/10.1186/s13634-016-0383-6>
- Sakoe & Chiba, "Dynamic programming algorithm optimization for spoken word
  recognition", _IEEE Trans. ASSP_ 26(1):43–49, 1978
- Giorgino, "Computing and Visualizing Dynamic Time Warping Alignments in R",
  _JSS_ 31(7), 2009 — <https://www.jstatsoft.org/article/view/v031i07> · docs
  <https://dynamictimewarping.github.io/>
- Müller, _Fundamentals of Music Processing_ §C7, subsequence DTW —
  <https://www.audiolabs-erlangen.de/resources/MIR/FMP/C7/C7S2_SubsequenceDTW.html>
- Wu & Keogh, "FastDTW is approximate and Generally Slower than the Algorithm it
  Approximates", _IEEE TKDE_, 2020 — <https://arxiv.org/abs/2003.11246>
- `dtaidistance` subsequence & local-concurrence APIs —
  <https://dtaidistance.readthedocs.io/en/latest/usage/subsequence.html>
- `tslearn.metrics` (DTW, subsequence DTW, soft-DTW, LCSS, Sakoe-Chiba/Itakura
  masks) —
  <https://tslearn.readthedocs.io/en/stable/gen_modules/tslearn.metrics.html>
- Biopython `PairwiseAligner` (Needleman–Wunsch / Smith–Waterman / Gotoh) —
  <https://biopython.org/docs/latest/Tutorial/chapter_pairwise.html>
- Yeh et al., Matrix Profile / motif discovery; `stumpy` —
  <https://github.com/stumpy-dev/stumpy> ·
  <https://www.cs.ucr.edu/~eamonn/MatrixProfile.html>
- Amat et al., "Algorithm-Based Real-Time Analysis of Heart Rate Measures in
  HIIT Training", _Applied Sciences_ 15(9):4749, 2025 —
  <https://doi.org/10.3390/app15094749> _(abstract only; parameters unverified)_

### Open-source implementations

- GoldenCheetah — <https://github.com/GoldenCheetah/GoldenCheetah>
  - `src/Core/RideItem.cpp` (`updateIntervals()`: EFFORT/TTE via CP+W′, sprint
    3-parameter model, PEAKPOWER/PEAKPACE duration ladder, climb detector)
  - `src/Core/IntervalItem.h` (interval data model, per-interval metric vector
    with mean/variance)
  - `src/FileIO/RideFile.h` (`intervaltype` and `seriestype` enums)
  - `src/Metrics/WPrime.cpp` (W′ match finder — asymmetric hysteresis around CP,
    25 s smoothing, raw-data endpoint backtracking, 100 J floor)
  - `src/Gui/AddIntervalDialog.cpp` (`findPeaks`, interactive discovery, 3 m
    altitude hysteresis climb finder)
  - `src/FileIO/RideFileCache.cpp` (`divided_max_mean` mean-max curve)
  - `test/charts/Interval Discovery.gchart` — a shipped PELT-based interval
    detector:
    `cpt.mean(ts, penalty="Manual", pen.value="60000*log(n)", method="PELT")`
  - User metrics model —
    <https://github.com/GoldenCheetah/GoldenCheetah/wiki/UG_Special-Topics_Creating-User-Metrics>
- `sweatpy` / `sweat` — <https://github.com/GoldenCheetah/sweatpy>
  (`median_filter` = Hampel, `rolling_mean`, `weighted_average_power`
  WAP/xPower, `w_prime_balance`, `mean_max`. **No interval detection;
  `heartrate.py` is empty, so no hrss.**)
- `msimms/ActivityAnalyzer` (Rust/WASM) — smooth → find_peaks → 2-D k-means on
  (avg power, duration) with elbow selection; the only OSS project with a
  non-trivial interval detector
- `python-fitparse` — <https://github.com/dtcooper/python-fitparse>
- `garmin/fit-python-sdk`, `garmin/fit-javascript-sdk`
- `gpxpy` — <https://github.com/tkrajina/gpxpy>
- `ruptures`, `dtaidistance`, `tslearn`, `stumpy`, `hmmlearn`, `river` (drift
  detectors: `PageHinkley`, `ADWIN`, `KSWIN`)

### Formats & APIs

- FIT Protocol —
  <https://developer.garmin.com/fit/articles/fit-protocol/fit_protocol.html>
- FIT Activity file type —
  <https://developer.garmin.com/fit/articles/file-types/activity.html>
- FIT cookbook, decoding activity files —
  <https://developer.garmin.com/fit/articles/cookbook/decoding_activity_files.html>
- FIT profile (21.212) —
  <https://github.com/garmin/fit-python-sdk/blob/main/garmin_fit_sdk/profile.py>
- TCX v2 XSD — <https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd>
- ActivityExtension v2 (TPX/LX) —
  <https://www8.garmin.com/xmlschemas/ActivityExtensionv2.xsd>
- TrackPointExtension v1 / v2 —
  <https://www8.garmin.com/xmlschemas/TrackPointExtensionv1.xsd> ·
  <https://www8.garmin.com/xmlschemas/TrackPointExtensionv2.xsd>
- TrackStatsExtension —
  <https://www8.garmin.com/xmlschemas/TrackStatsExtension.xsd>
- PowerExtension v1 — <https://www8.garmin.com/xmlschemas/PowerExtensionv1.xsd>
- GPX 1.1 schema — <https://www.topografix.com/GPX/1/1/gpx.xsd>
- Strava API reference & swagger —
  <https://developers.strava.com/docs/reference/> ·
  <https://developers.strava.com/swagger/swagger.json> · `stream.json`,
  `lap.json`, `activity.json`

### Data platform

- Steinarsson, "Downsampling Time Series for Visual Representation" (LTTB), MSc
  thesis, University of Iceland, 2013 —
  <https://skemman.is/bitstream/1946/15343/3/SS_MSthesis.pdf> · reference
  implementations <https://github.com/sveinn-steinarsson/flot-downsample>
- RFC 7644 §3.4.2.2, SCIM filter grammar —
  <https://datatracker.ietf.org/doc/html/rfc7644>
- Minetti, Moia, Roi, Susta & Ferretti, "Energy cost of walking and running at
  extreme uphill and downhill slopes", _J Appl Physiol_ 93:1039–1046, 2002 — the
  basis for grade-adjusted pace
- Coggan, Normalized Power definition (4th root of the mean 4th power of a 30 s
  rolling average); Skiba xPower (25 s EWMA variant)
- EAV / dynamic-attribute modelling trade-offs — Karwin, _SQL Antipatterns_;
  <https://www.cybertec-postgresql.com/en/entity-attribute-value-eav-design-in-postgresql-dont-do-it/>

### Negative results worth recording

- **There is no published paper on detecting interval-training bouts from
  cycling power or running pace.** ED-PELT's run-segmentation example is the
  closest analogue.
- **There is no published methodology for per-step workout-compliance scoring.**
  Multiple commercial platforms ship it; none document it.
- `sweatpy` has **no** interval detection and **no** hrss, despite common
  secondhand claims.
