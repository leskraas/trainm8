# Rule-based interval detection for the Activity Stream (#327)

## TL;DR

For a downsampled, noisy power/pace/HR series (≥5s resolution, ≤1000 samples,
`null` = pause) the most reliable rule-based recipe is a **two-stage pipeline**:
(1) split the stream at pauses, median-filter each channel, then run **offline
penalised change-point detection (PELT with an L2 / piecewise-constant cost)**
to cut the series into constant-intensity segments; (2) label each segment into
an intensity band, enforce a minimum dwell time, and run a small
**repeated-pattern pass** (cluster segments by duration+intensity, then detect
the `k × (work + recovery)` repetition) to name the structure. PELT is chosen
because it is _exact_, runs in near-linear time (trivial at ≤1000 samples),
takes a single tuning knob (the penalty), and has a faithful, dependency-free
TypeScript port on npm (`karaul`) that is ~50 lines and easy to vendor and
audit. The main real-world tools take a _different_ route — GoldenCheetah
discovers efforts from a critical-power (W′/CP) energy model, and intervals.icu
detects on power only, falling back to device laps for HR/pace — which confirms
the two hardest parts of our problem (HR lag, GPS-noisy pace) are worth
_avoiding_ by segmenting on the cleanest channel (power for bike; filtered pace
for run) and using HR only for zone labelling, never for edges.

## Question & constraints (recap)

**Question:** which rule-based approaches reliably segment a noisy power/pace/HR
time series into workout structure (steady segments, repeated intervals,
warmup/cooldown), and which fits trainm8's constraints?

**Constraints** (from `CONTEXT.md` "Activity Stream" and
`docs/adr/0020-activity-stream-downsampled-telemetry.md`):

- Input is a downsampled **Activity Stream**: index-aligned numeric arrays
  `timeSec` + optional `power` / `heartrate` / `pace` (sec/km), a
  `resolutionSec` never finer than **5s**, a **≤1000** `sampleCount`, each grid
  point the _mean_ of its bucket, and a **`null`** entry marking a paused gap
  (ADR 0020, storage format & downsampling policy).
- Rule-based only (no ML/AI), TypeScript, running in the in-process **Job
  Queue** (ADR 0013 / `CONTEXT.md`).
- Disciplines: **run + bike only**. Bike classifies on power first; run pace is
  GPS-noisy and HR lags effort.
- Output goal: **ranked candidate structures** like "warmup + 4×4′ Z5 w/ 3′
  recoveries + cooldown", so **repeat-count inference** (4×4′ vs 3×4′ vs 5×4′)
  matters.

Because the stream is already ≤1000 points, **algorithmic complexity is a
non-issue** — every family below runs in well under a second. The real selection
criteria are: robustness to noise, number/opacity of tuning knobs, exactness of
the segmentation, and TypeScript implementability.

## Survey of algorithm families

### 1. Change-point detection (segment the signal into constant regimes)

The `ruptures` library is the canonical reference implementation and its docs
map directly onto the primary literature. Its homepage frames the task as
"off-line change point detection … analysis and segmentation of non-stationary
signals" and cites the survey _Truong, Oudre, Vayatis, "Selective review of
offline change point detection methods", Signal Processing 167:107299, 2020_
[[ruptures home](https://centre-borelli.github.io/ruptures-docs/)]. Four search
methods matter to us:

- **PELT (Pruned Exact Linear Time).** _Exact_ penalised segmentation: minimises
  `sum(cost of segments) + penalty × (number of change-points)` via dynamic
  programming with a pruning rule that "discards many indexes, substantially
  reducing computational cost while maintaining optimal segmentation". Average
  complexity ≈ **O(C·K·n)** (n samples, K change-points, C cost-function cost);
  with the L2 / piecewise-constant cost this is very fast. Key knobs: **`pen`**
  (penalty — the _only_ thing you must tune), **`min_size`** (minimum samples
  between change-points), **`jump`** (grid coarsening). Reference: _Killick,
  Fearnhead, Eckley (2012), "Optimal detection of changepoints with a linear
  computational cost", JASA 107(500):1590–1598_
  [[ruptures PELT](https://centre-borelli.github.io/ruptures-docs/user-guide/detection/pelt/)].
  **Fit:** best fit for us. `min_size` is exactly our dwell-time / anti-flicker
  control (e.g. "no segment shorter than 20–30 s"). Penalty is one interpretable
  knob. Exactness means the segmentation doesn't depend on greedy ordering.
- **Binary Segmentation (Binseg).** Greedy: find the single best change-point,
  split, recurse. Low complexity, "of the order of **O(C·n log n)**", and works
  whether or not the number of regimes is known. It is _approximate_ (a greedy
  first cut can be sub-optimal). References: _Bai (1997)_; _Fryzlewicz (2014),
  "Wild binary segmentation", Annals of Statistics 42(6):2243–2281_
  [[ruptures Binseg](https://centre-borelli.github.io/ruptures-docs/user-guide/detection/binseg/)].
  **Fit:** viable fallback, simplest to hand-code, but greedy so slightly less
  reliable on the ambiguous warmup→first-rep boundary.
- **Bottom-Up.** Start over-segmented on a fine grid, then iteratively _merge_
  the most similar adjacent segments. "Generous" (starts with many
  change-points, removes the least significant). Complexity **O(n log n)**;
  supports fixed count, penalty, or an `epsilon` residual threshold. References:
  _Keogh et al. (2001), "An online algorithm for segmenting time series"_;
  _Fryzlewicz (2007)_
  [[ruptures BottomUp](https://centre-borelli.github.io/ruptures-docs/user-guide/detection/bottomup/)].
  **Fit:** good conceptual match to interval workouts (merge noise back into the
  rep it belongs to) and trivial to implement, but the initial grid choice is an
  extra knob.
- **Window-based.** Slide two adjacent windows and compute a discrepancy
  `d = c(y_{u..w}) − c(y_{u..v}) − c(y_{v..w})`; "a sequential peak search is
  performed on the discrepancy curve". Complexity **O(n·w)**. Knobs: `width`
  (sensitivity), `jump`. It is _approximate_ and its accuracy is sensitive to
  window width vs the shortest interval
  [[ruptures Window](https://centre-borelli.github.io/ruptures-docs/user-guide/detection/window/)].
  **Fit:** window width must be smaller than the shortest interval yet large
  enough to beat noise — awkward when the same activity mixes 30 s and 8 min
  reps. Weakest fit.

All four "extend single change-point detection to multiple change-points and
work whether or not the number of regimes is known" — so none require us to know
the rep count in advance, which is essential given our output goal.

### 2. Step-fitting / piecewise-constant approximation

L1 trend filtering / total-variation (TV) denoising and top-down step-fitting
(the Kerssemakers biophysics step-finder) all approximate a signal by a
piecewise-constant staircase — conceptually the same output as change-point
detection, reached by different means (a convex sparsity penalty on the first
difference, or greedy step insertion). These are strong when the ground truth
really is a clean staircase (single channel, sharp edges). For us they are
**equivalent-or-worse to PELT**: TV denoising adds a regularisation weight that
behaves like PELT's penalty but yields _soft_ edges you still have to threshold
into segments, and no maintained TypeScript implementation was found on npm
(searches surfaced only Python/R/Julia change-point libraries; see Sources).
PELT with an L2 cost gives the same staircase with crisp edges and one knob, so
step-fitting does not earn its extra complexity here. _(This paragraph is
engineering judgement against the constraints; the "no TS implementation" claim
is from the npm searches in Sources, not from a step-fitting primary source.)_

### 3. Smoothing + thresholding / zone-crossing with hysteresis

Rolling median/mean → classify each sample into an intensity band (using the
athlete's zones, which trainm8 already resolves) → merge consecutive same-band
runs → drop runs shorter than a minimum dwell time. This is the simplest
possible rule-based method, needs no library, and is easy to reason about. The
weaknesses are well known and visible in how the real tools behave: a raw
threshold flickers around the band edge (fixed by hysteresis: require the signal
to cross _past_ the band edge by a margin, or dwell N seconds, before
switching), and it bakes the band boundaries into the segmentation so a
genuinely steady effort that straddles a zone edge gets chopped in two. It
cannot by itself tell "one long Z3 block" from "the tempo drifted across the
Z3/Z4 line". **Fit:** ideal as the _labelling_ stage on top of a change-point
segmentation, and as a zero-dependency fallback for HR-only or pace-only
streams; not reliable as the primary segmenter.

### 4. Repeated-pattern mining (on top of segmentation)

Once you have labelled segments, repeat-count inference is a separate problem:

- **Cluster segments by (duration, intensity).** Group work segments whose
  duration and mean intensity are within a tolerance; the cluster size is the
  candidate rep count. Robust to the last rep being short or a missed recovery.
- **Look for the alternating `work, recovery, work, recovery …` motif** and
  count the work members; this is what lets you emit "4×4′ w/ 3′ recoveries"
  rather than "8 segments".
- **Autocorrelation of the intensity signal** as an independent periodicity
  check: a strong autocorrelation peak at lag ≈ (work+recovery) duration
  corroborates the rep period and helps rank candidates (4×4′ vs 3×4′) when
  segmentation is ambiguous at the ends.

No primary "interval-mining" reference is cited here because this stage is
application-specific glue; it is standard clustering/autocorrelation applied to
the segment list, all trivially implementable in TypeScript.

## What existing tools do (primary sources)

### GoldenCheetah (open source, C++) — energy-model effort discovery, _not_ generic segmentation

GoldenCheetah's auto-discovery lives in `RideItem::updateIntervals()` in
`src/Core/RideItem.cpp`. It runs several independent discoverers gated by a
`GC_DISCOVERY` bitmask (default 57, which deliberately excludes peak search):

- **PEAKPOWER / PEAKPACE**: for a fixed list of durations
  (`{1,5,10,15,20,30,60,300,600,1200,1800,2700,3600}` s for power;
  `{10,15,…,3600}` for pace) it calls `AddIntervalDialog::findPeaks(...)` on the
  `watts` (bike) or `kph` (run/swim) series to pull out the single best effort
  of each length — a sliding-window best-average, one interval per duration
  [`RideItem.cpp` ~L1011–1079].
- **EFFORT** (the closest thing to "interval detection"): **bike + power only**
  (`!f->isRun() && !f->isSwim() && f->isDataPresent(RideFile::watts)`), and it
  requires the athlete's **CP, W′ and Pmax** to be set. It resamples power to 1
  Hz, builds an _integrated_ (cumulative-energy) series, then for each start
  second sweeps a duration `t` down from ≤3600 s and computes a
  time-to-exhaustion from the Monod critical-power equation — the comment:
  _"This takes the monod equation p(t) = W'/t + CP and solves for t … Joules =
  (W'/t + CP) \* t … t = (Joules − W') / CP"_. A window is a candidate effort
  when the modelled TTE reaches at least **85%** of the window length
  (`if (tc >= (t*0.85f))`), keeping the highest-"quality" duration; overlapping
  candidates in the same zone are merged keeping the higher quality. A separate
  loop (`t >= 5`) finds **sprints** using a three-component P/CP/Pmax model
  [`RideItem.cpp` ~L1082–1338].
- **CLIMB**: altitude-based hill finder (gradient/length rules), and **PEAKS/
  ROUTE** are unrelated [`RideItem.cpp` ~L1397–1516].

**Takeaway for us:** GoldenCheetah does _not_ run a general change-point
segmenter; its interval discovery is a physiology-model effort finder that
requires calibrated CP/W′/Pmax and is **power/bike-only**. That is a heavier,
more opinionated approach than we need (we want generic warmup/interval/cooldown
structure, and we can't assume CP/W′/Pmax). But it strongly corroborates two
design choices: **segment on power for bike**, and **use a minimum-duration /
overlap-merge rule** to avoid fragmenting one effort into many.

### intervals.icu — power-only detection, laps for HR/pace (David Tinker, forum)

The author David Tinker describes the algorithm's _scope_ directly on the forum
(no full pseudocode is published — a user explicitly asked and got no algorithm
dump
[[how are intervals detected](https://forum.intervals.icu/t/how-are-intervals-detected/92496)]):

- _"Unfortunately interval detection only works for power data. For HR and pace
  it will use laps if they are available."_ (thread 325, post 19)
  [[Interval detection problems](https://forum.intervals.icu/t/interval-detection-problems/325)]
- For HR-only activities it treats each **lap** as a candidate, takes the lap's
  **average HR** to pick a zone, then applies a **minimum-duration heuristic**
  per zone to decide if it's "long enough" to count — e.g. _"Z4 must be 110s+"_
  (post 2), with published thresholds Z3 ≈ 590 s, Z4 ≥ 110 s, Z5/Z6 ≥ 25 s, Z7 ≥
  5 s (post 5).
- Manual editing is drag-to-merge / drag-to-nothing-to-delete (post 8), and
  HR-only detection otherwise needs the athlete to press the lap button (post
  12).
- An announcement notes a refinement: _"I have updated the power interval code
  to ignore laps if there is only one and use auto detection"_
  [[Laps and interval detection updates](https://forum.intervals.icu/t/laps-and-interval-detection-updates/10779)].

**Takeaway:** the most widely used interval detector in the sport deliberately
**segments on power and declines to auto-detect on HR/pace**, using device laps
as the fallback and per-zone minimum durations as the dwell rule. This is direct
evidence that HR-edge and GPS-pace-edge detection are hard enough that a mature
product avoids them.

### Runalyze (open source, PHP) — feature exists, source not located (honest gap)

Runalyze's documentation/changelog confirm an **auto detection of type
"interval-training" that only works in batch/bulk mode**, plus lap tagging as
Interval/Active, Recovery, Warm-up, Cool-down, Rest, and per-lap active-only HR
averaging (Runalyze changelog / docs, via search — see Sources). **However, a
code search for the detection implementation returned nothing usable**: the
GitHub code-search query `repo:Runalyze/Runalyze interval detection` returned
`total_count: 0`, and I did not locate the specific PHP function that implements
the classifier. So I can confirm the _feature_ from primary docs but **cannot
cite the algorithm** — treat Runalyze as an unknown here rather than repeating a
guess.

### Strava / TrainingPeaks — closed source, no primary algorithm available

Both are closed-source. I found **no official, primary documentation**
describing how either segments a stream into intervals (Strava "Laps"/segments
and TrainingPeaks "peak detection" are user-facing features, not documented
algorithms). Per the brief, I am **not** repeating third-party
reverse-engineering or rumours. Nothing primary to cite.

## Practical handling of the hard parts

**Pauses (`null` gaps).** ADR 0020 makes `null` an explicit paused-gap marker
and says the chart "breaks the line rather than interpolating through it". Do
the same in analysis: **split the stream at `null` runs into contiguous
sub-series and segment each independently**, then stitch. Bridge only _very_
short gaps (e.g. a single dropped sample) if you must; never interpolate a real
pause, and never let a change-point straddle a gap. (Primary basis: ADR 0020
storage format / honesty.)

**HR lag (~30 s+).** Both reference tools point the same way: **do not derive
segment edges from HR**. GoldenCheetah's EFFORT discovery is power-only
[`RideItem.cpp` L1087]; intervals.icu "only works for power data" and falls back
to laps for HR (Tinker, thread 325 post 19). So for trainm8: **find edges on the
cleanest available channel (power for bike, filtered pace for run) and use HR
only to _label_ a segment's zone** — computed over the segment interior,
optionally skipping the first ~30 s so the lagged ramp doesn't drag the average
down. If a stream is HR-only, degrade to the smoothing+band+min-dwell method
(§3) rather than pretending HR gives sharp edges. _(The specific "shift HR /
skip first 30 s" mechanic is engineering judgement consistent with the cited
tool behaviour, not a quoted algorithm.)_

**Run-pace GPS noise.** Pace (sec/km) is our noisiest channel. Apply a **rolling
median** (odd window, e.g. 5–9 samples ≈ 25–45 s at our resolution) before
segmentation — a median rejects GPS spikes without the edge-smearing of a mean.
GoldenCheetah works pace detection off the `kph` (speed) series, not a derived
pace, and only does peak-average discovery on it rather than fine segmentation
[`RideItem.cpp` L1044–1079], which again argues for **generous smoothing + a
large `min_size`** on run pace and modest expectations about edge precision.
Where a distance channel is available, speed-from-distance is steadier than
instantaneous pace — but note our Activity Stream stores `pace` directly (ADR
0020 read model), so median-filtering that channel is the pragmatic path.

**Repeat-count inference robustness.** This is the output goal, so protect it:

- Run the pattern mining on **post-`min_size` segments** so noise slivers can't
  be miscounted as reps.
- **Cluster by (duration, intensity) with tolerance** rather than requiring
  exact equality — reps drift (a fading athlete's last rep is shorter/weaker).
  Both reference tools use a _minimum-duration-per-zone_ gate before something
  counts as an interval (Tinker post 5; GC's 85%-of-window rule), which is the
  same idea applied to a single effort.
- Use **autocorrelation of the (smoothed, band-mapped) intensity signal** as an
  independent tie-breaker between 3× / 4× / 5× hypotheses, and emit **ranked
  candidates** (as the brief wants) rather than one answer — e.g. score each
  `k×` hypothesis by how well the observed segments fit its expected
  work/recovery template.

## Recommendation

### Primary candidate — PELT (L2 cost) + band-labelling + repeat-mining

Pipeline stages:

1. **Segment on pauses.** Split the Activity Stream at `null` runs; process each
   contiguous block separately (ADR 0020).
2. **Pick the edge channel.** Bike → `power`; run → `pace` (median-filtered);
   fall back to HR-band method (§3) only if that is the sole channel present.
   (Matches GoldenCheetah/intervals.icu power-first behaviour.)
3. **Denoise.** Rolling median on the edge channel (window ~5–9 samples). Keep
   the raw HR channel aside for labelling.
4. **PELT, L2 cost, penalty-tuned.** Run PELT to cut each block into
   piecewise-constant segments. Knobs that matter: **`penalty`** (higher → fewer
   segments; the one knob to tune per discipline) and **`min_size`** (dwell
   floor, e.g. ≥20–30 s so recoveries and micro-noise don't become segments).
   Exact and fast at ≤1000 points (Killick 2012 via ruptures PELT).
5. **Label + merge.** Assign each segment an intensity band from the athlete's
   resolved zones (HR labelling done over the segment interior); merge adjacent
   same-band segments; identify leading low-intensity segment as **warmup**,
   trailing as **cooldown**.
6. **Repeat-mine + rank.** Cluster the interior work segments by (duration,
   intensity), detect the `k × (work + recovery)` motif, corroborate with
   autocorrelation, and emit **ranked candidate structures**.

**Why PELT wins:** exact (not greedy) so the ambiguous warmup→first-rep cut is
principled; near-linear and trivially fast at our size; a single interpretable
penalty knob plus `min_size` that _is_ our dwell-time requirement; and —
decisive for a TS/Node job — a faithful, **dependency-free TypeScript
implementation already exists on npm: `karaul`** ("Lightweight PELT changepoint
detection for TypeScript. No dependencies. Pluggable cost functions", MIT, ESM).
Its `pelt.js` is a textbook PELT (~50 lines: DP array `F`, pruning of the
`active` candidate set, backtrack via `cps`), with a `GaussianCost`, a
`PoissonCost`, a `CostFunction` interface, and a MAD-based `estimatePenalty`. At
v0.1.0 it is early-stage and single-channel, so the recommendation is to
**vendor and audit it (or reimplement the ~50 lines)** rather than take a
runtime dependency — but its existence proves the port is cheap and low-risk.
_(Source: local inspection of `karaul@0.1.0` package contents — see Sources.)_

### Secondary candidate — Bottom-Up merge (fallback / simplest hand-roll)

If we prefer zero external code and a single self-contained function,
**Bottom-Up segmentation** (start over-segmented on a fine grid, merge the most
similar adjacent pair until a penalty/`epsilon` stop) is O(n log n), matches
interval workouts conceptually (noise merges back into its parent rep), and is a
short hand-written routine (ruptures BottomUp). It loses to PELT only on
exactness and on the extra "initial grid" knob.

### Why the others lost

- **Binary Segmentation** — greedy and approximate; fine as a fallback but the
  first-cut greediness is exactly wrong at the warmup boundary (ruptures
  Binseg).
- **Window-based** — window width must simultaneously beat noise and be shorter
  than the shortest rep; breaks on mixed-duration sessions (ruptures Window).
- **Step-fitting / TV denoising** — same staircase as PELT but with soft edges
  you must re-threshold and no maintained TS implementation (npm searches; §2).
- **Pure smoothing + threshold** — flickers at band edges and bakes zone
  boundaries into segmentation; kept only as the _labelling_ stage and the
  HR/pace-only fallback (§3).
- **GoldenCheetah's W′/CP effort model** — requires calibrated CP/W′/Pmax and is
  power/bike-only; too opinionated for generic warmup/interval/cooldown
  structure (`RideItem.cpp` EFFORT branch).
- **Bayesian Online Changepoint (BOCPD)** npm packages (`bayesian-changepoint`,
  `volume-anomaly`) exist in TS but are _online/streaming_ detectors tuned for
  anomaly/regime-drift monitoring, not offline workout segmentation, and add
  probabilistic knobs (hazard rate, priors) we don't need for a batch job.

## Sources

Primary — algorithm docs & literature (via ruptures reference implementation):

- ruptures home + Truong/Oudre/Vayatis 2020 survey citation:
  https://centre-borelli.github.io/ruptures-docs/
- PELT (Killick, Fearnhead, Eckley 2012):
  https://centre-borelli.github.io/ruptures-docs/user-guide/detection/pelt/
- Binary Segmentation (Bai 1997; Fryzlewicz 2014):
  https://centre-borelli.github.io/ruptures-docs/user-guide/detection/binseg/
- Bottom-Up (Keogh 2001; Fryzlewicz 2007):
  https://centre-borelli.github.io/ruptures-docs/user-guide/detection/bottomup/
- Window-based:
  https://centre-borelli.github.io/ruptures-docs/user-guide/detection/window/

Primary — existing tools (source code / author statements):

- GoldenCheetah `RideItem::updateIntervals()` (EFFORT/PEAK/CLIMB discovery),
  `src/Core/RideItem.cpp` ~L897–1516, esp. EFFORT branch L1082–1338 (Monod TTE
  at 85% of window) and power-only gate L1087:
  https://github.com/GoldenCheetah/GoldenCheetah/blob/master/src/Core/RideItem.cpp
- intervals.icu — David Tinker, "Interval detection problems" thread 325 (posts
  2, 5, 8, 12, 19: power-only, laps for HR/pace, per-zone min durations):
  https://forum.intervals.icu/t/interval-detection-problems/325
- intervals.icu — "How are intervals detected?" (no algorithm published):
  https://forum.intervals.icu/t/how-are-intervals-detected/92496
- intervals.icu — "Laps and interval detection updates" (single-lap fallback to
  auto detection):
  https://forum.intervals.icu/t/laps-and-interval-detection-updates/10779
- Runalyze — interval-training auto detection (batch-only) & lap tagging, from
  docs/changelog (feature confirmed, implementation NOT located;
  `repo:Runalyze/Runalyze interval detection` code search returned 0):
  https://github.com/Runalyze/Runalyze and
  https://runalyze.com/changelog?_locale=en
- Strava / TrainingPeaks — no primary algorithm documentation found;
  deliberately not citing rumours.

Primary — TypeScript implementability (npm):

- `karaul@0.1.0` — "Lightweight PELT changepoint detection for TypeScript. No
  dependencies." MIT, ESM; verified by unpacking the tarball and reading
  `dist/pelt.js` (textbook PELT + Gaussian/Poisson cost + MAD penalty). npm:
  https://www.npmjs.com/package/karaul
- `bayesian-changepoint` (BOCPD, JS/TS; npm description field is mislabelled):
  https://www.npmjs.com/package/bayesian-changepoint — repo
  https://github.com/mathew-kurian/BayesianChangePointJS
- `volume-anomaly@2.0.0` — TS BOCPD/CUSUM/Hawkes, online anomaly detection (not
  offline segmentation): https://www.npmjs.com/package/volume-anomaly
- No dedicated npm PELT/Binseg offline-segmentation library beyond `karaul`
  surfaced; the mature implementations are Python (`ruptures`), R
  (`changepoint`), Julia (`Changepoints.jl`).

Project context:

- `/home/user/trainm8/CONTEXT.md` — Activity Stream definition.
- `/home/user/trainm8/docs/adr/0020-activity-stream-downsampled-telemetry.md` —
  storage format, ≥5s/≤1000 downsampling, `null` = pause,
  break-don't-interpolate.
