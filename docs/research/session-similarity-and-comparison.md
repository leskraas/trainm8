# Session similarity and repeat comparison

How a training platform decides that two recorded sessions are _the same
session_, and what it may honestly show once it has found N repeats of one.

Research note. Compiled 2026-08-13.

> **Sibling documents.** This note is the retrieval-and-comparison layer that
> sits on top of
> [`interval-detection-and-data-platform.md`](interval-detection-and-data-platform.md).
> That document owns **segmentation** (finding the reps inside one activity),
> **per-interval metrics** (§1.4), **plan-vs-actual alignment** (§1.6 — a
> different problem: aligning one activity against one prescription), and the
> **list/filter surface** (§2.3). None of them answer _"which of my past
> sessions is this one a repeat of?"_ — this document owns exactly that, plus
> what the resulting comparison may and may not claim.
>
> The archetype vocabulary is [`workout-taxonomy.md`](workout-taxonomy.md). The
> portable intensity axis every cross-occurrence comparison depends on is
> [`portable-intensity-anchors.md`](portable-intensity-anchors.md). Decoupling,
> Efficiency Factor and GAP are defined in
> [`activity-analysis-metrics.md`](activity-analysis-metrics.md) §2.3–§2.4 and
> §1.4 — this note only says which of them survive being trended _across_
> occurrences.

## TL;DR

- **Nobody in the field ships automatic structural session matching, and it is
  worth saying that plainly.** Route-based matching is shipped and documented by
  at least two platforms (start/end point + direction + distance clustering in
  one case; a distance/bounding-box prefilter followed by Dynamic Time Warping
  over the GPS track in the other). Structure-based matching — "find my other
  6×1000 m sessions" — is, everywhere this search looked, **manual selection**:
  drag-and-drop compare panes, date-range pickers, tick-boxes on a list. The
  open feature request asking for exactly this ("as you get lots of workouts of
  the same type it is very time-consuming to mark all intervals of the same
  type") sat unanswered on a public forum for over a year. **This is a genuine
  unsolved surface, not a solved one this repo has skipped.**
- **"The same session" is not one key; it is at least five, and they answer
  different questions.** Same _route_ (geometric), same _prescription lineage_
  (provenance), same _prescribed structure_ (authored shape), same _detected
  structure_ (measured shape), same _archetype + dose_ (fuzzy). Provenance is
  the cheapest and most certain, geometry is the only one with shipped prior
  art, and detected-structure is the only one that works for the athlete who
  never authors a workout. A serious implementation uses **provenance first,
  structure second, and never one alone**.
- **Dynamic Time Warping is the right tool for routes and traces and the wrong
  tool for step sequences.** DTW's defining property — many-to-one alignment —
  is precisely what you do _not_ want when rep count is the discriminator: DTW
  will happily stretch four reps onto ten and report a small distance. Over a
  flattened step sequence, **weighted edit distance (Needleman–Wunsch with a
  graded substitution cost) is the correct family**, because insertion and
  deletion are exactly how "you did 8 not 10" should be priced. DTW is also not
  a metric (it violates the triangle inequality), which blocks naive metric
  indexing.
- **The cheap layer does most of the work.** A canonicalised **set signature** —
  `k × (work-duration bucket @ intensity bucket) + recovery bucket`, per block,
  hashed — turns the common case into an O(1) index lookup. Its one failure mode
  is bucket-boundary straddle (5:00 vs 5:05 across a cut point), and the
  standard fix is to use it as a **blocking key** (probe the ±1 neighbourhood in
  each dimension) feeding an exact reranker, never as the answer.
- **The features that actually discriminate a session type are few, and two of
  them are near-duplicates.** Rep count `k`, mean rep duration, total work
  duration, mean rep intensity as a fraction of threshold, work:rest ratio,
  within-set CV of rep intensity, discipline. Total work duration ≈ `k` × mean
  rep duration, so a plain Euclidean distance over all seven **double-counts
  dose**. Durations must be compared on a log axis (30 s vs 45 s is a bigger
  difference than 20:00 vs 20:15), discipline is a **hard filter and not a
  feature**, and standardisation must be against **the athlete's own** session
  distribution.
- **A "faster" repeat is very often just a shorter one, and this is the single
  biggest honesty failure available in this surface.** Ranking occurrences by
  mean rep pace, with rep count and total work duration off-screen, manufactures
  progress out of a dropped rep. The rule that follows: **never reduce an
  occurrence to one scalar**, always show `k`, total work duration and mean rep
  intensity together, and compare rep-by-rep over `1…min(k)` rather than
  set-mean to set-mean.
- **Almost nothing in this comparison is published-valid; the data display is,
  the inference is not.** Per-rep grids and mean ± SD are arithmetic. A trend
  line over occurrences is an inference that needs a noise floor, and a noise
  floor needs a typical error, which needs repeated measures under standardised
  conditions that training data does not provide. Weather alone moves marathon
  pace measurably across a 5–25 °C WBGT range **and moves it more for slower
  runners**, so an uncorrected cross-occurrence pace trend partly measures the
  season. "Power at the same heart rate" is a coaching construct with no primary
  validation, is invalid on interval sessions by construction, and is already
  flagged as such in this corpus.
- **The comparison is impossible in this repo today, and the reason is one line
  of code.** `mine.ts` computes every individual rep — durations, values, the
  recoveries between them — and then `analyze.ts` emits **one averaged step with
  a `repeatCount`**. The reps are computed and discarded. That makes
  [`interval-detection-and-data-platform.md`](interval-detection-and-data-platform.md)'s
  **Gap 1 ("there is no per-interval entity")** load-bearing for this entire
  feature: without per-rep rows there is no per-rep grid, no fade slope, no mean
  ± SD, and the richest available session fingerprint collapses to three
  numbers.

---

## 1. What "the same session" means

### 1.1 Five candidate identity keys

| #   | Key                      | Definition                                                   | Certainty     | Works without authoring? | Shipped prior art                               |
| --- | ------------------------ | ------------------------------------------------------------ | ------------- | ------------------------ | ----------------------------------------------- |
| 1   | **Route**                | Same geographic path, same direction, comparable distance    | High          | Yes                      | **Yes** — two documented implementations        |
| 2   | **Prescription lineage** | Both sessions' prescriptions descend from one source row     | **Exact**     | No                       | Partial (structured-workout libraries)          |
| 3   | **Prescribed structure** | The authored step sequences are equal under canonicalisation | High          | No                       | Not as a retrieval key                          |
| 4   | **Detected structure**   | The _measured_ step sequences are similar under a distance   | Medium        | Yes                      | **No** — manual selection everywhere            |
| 5   | **Archetype + dose**     | Same session archetype, comparable total work and intensity  | Low (a class) | Yes                      | Partial (list filters over interval properties) |

These are not competing answers. They are **different questions wearing one
phrase**:

- Key 1 answers _"how has my pace on this loop changed?"_ — a route-and-terrain
  controlled comparison, and the only one where terrain is genuinely held
  constant.
- Key 2 answers _"how have I executed this prescription over time?"_ — the
  question a plan asks.
- Key 4 answers _"what did I actually do that looked like this?"_ — the only
  question available to an athlete who imports activities and never authors
  anything.
- Key 5 answers _"how have my threshold sessions been going?"_ — a cohort, not a
  repeat, and it should be labelled as a cohort.

**Design consequence.** The identity key must be a stored, displayable property
of a comparison set, not an implicit one. "These 6 sessions" means something
different if they were gathered by route than by structure, and the athlete has
to be told which. The corpus convention of naming the derivation rather than
hiding it (ADR 0035's derive-the-label rule; ADR 0033's grade-or-nothing rule)
applies directly.

### 1.2 Route identity — the one thing the field has actually built

Two documented implementations, at two levels of published detail.

**The coarser one** describes its criteria in prose: the algorithm "identifies
the starting and ending points of the route, the direction of the route, and the
distance completed", and matched efforts are then grouped into a single chart
showing a performance trend over time, across run/walk/hike/ride/wheelchair
types
([Strava support: Matched Activities](https://support.strava.com/hc/en-us/articles/216918597-Matched-Activities)).
The same page volunteers the interesting failure mode: an activity that
"differed just enough to prevent it from matching the original cluster" creates
a **second group for the same route**, so the athlete ends up with two histories
of one loop. ⚠ The clustering method, the tolerances and the direction test are
**not published**; only the three named criteria are. Everything beyond that is
reverse-engineering and this document does not do it.

**The finer one** publishes the algorithm shape. A new activity is prefiltered
against stored routes by **total distance, start/end coordinates and the
bounding box (min/max coordinates)**, with a distance tolerance of **200 m or 4
%**, whichever applies; surviving candidates are then compared by **Dynamic Time
Warping over the track**, with sequence order mattering and deviations
**penalised quadratically** — so being on the other side of the road is
tolerated while a short detour is not
([Runalyze: Recurring Routes](https://runalyze.com/help/article/recurring-routes),
[announcement post](https://blog.runalyze.com/allgemein-en/new-feature-recurring-routes/)).
Matched activities then get a ranking, a count, the last ten efforts, and a
chart with selectable X and Y metrics. ⚠ **Sourcing caveat:** the help page and
the blog post both returned HTTP 403 to direct fetch during this research; the
quoted parameters come from an indexed summary of those two pages, not from a
read of the pages themselves. The **DTW-plus-prefilter architecture** is the
load-bearing claim and is consistently reported; the exact 200 m / 4 % numbers
and the penalty weights should be re-verified before being copied.

**What to take from this.** The architecture is the finding, and it generalises
past routes: **a cheap, indexable prefilter (scalar bounds) followed by an
expensive sequence distance on the survivors.** That is the same two-stage
blocking-then-ranking shape §2 arrives at for structures, from a completely
different direction.

**What route identity cannot do.** It is unavailable to indoor sessions, to
swimming, to treadmill work, and to any athlete who runs a different loop each
time. It also **conflates route with session**: the same 10 km loop carries an
easy run, a tempo run and a set of hill reps, and route identity groups all
three.

### 1.3 Prescription lineage — the exact key, and the one nobody markets

If two sessions were both stamped from the same source prescription, they are
the same session by construction. No distance, no threshold, no false positives.
Structured-workout libraries make this expressible; none of the platforms
surveyed exposes _"show me every time I did this workout"_ as a first-class
retrieval from the library row.

This is the cheapest correct key that exists, and in this repo it is **already
in the schema** — `Workout.copiedFrom` / `copiedFromId` is a lineage chain
(`prisma/schema.prisma:227`), documented as the fork-on-write back-pointer for
Catalogue forks, adopted generated sessions, and citation resolution. Walking
that chain to its origin partitions an athlete's sessions into exact repeat
groups. Nothing reads it that way today. §7.

Its limit is equally clear: it is empty for imported, detected and hand-authored
one-off sessions, which for most athletes is most sessions. It is a **high-
precision, low-recall** key, which is exactly the profile you want as the first
stage of a union.

### 1.4 Structure identity — the unsolved one

Every compare surface surveyed is manual:

- A drag-and-drop **Compare Pane** where activities, intervals and date ranges
  are dropped in, the first item becomes the reference, and most charts switch
  to comparison rendering. The documentation contains **no automatic similarity
  search**
  ([GoldenCheetah wiki: Compare Pane](https://github.com/GoldenCheetah/GoldenCheetah/wiki/UG_Compare-Pane_General)).
- A **Workout Comparison** dashboard where the athlete picks a date range, then
  ticks workouts to overlay, then reads a grid of global metrics
  ([TrainingPeaks help: Workout Comparison](https://help.trainingpeaks.com/hc/en-us/articles/45991996472333-Workout-Comparison)).
- A **Compare Activities** page that overlays traces, toggles the X axis between
  time and distance, allows shifting traces to align intervals by hand, and
  offers search **by activity name, hashtag, or interval intensity and
  duration**
  ([Intervals.icu: Compare Activities](https://www.intervals.icu/features/compare-activities/)).
  That last clause is the closest thing in the field to a structural query — it
  is a filter over interval properties, one step short of a similarity search.

And the demand is documented. A public feature request asks for a way to select
"all intervals of a specific type" across chosen workouts, because "as you get
lots of workouts of the same type it is very time-consuming to mark all
intervals from the same type"; a second user independently proposes saved
"compare sets". The thread ran from early 2025 with follow-ups and **no
developer response**
([Intervals.icu forum](https://forum.intervals.icu/t/more-efficient-way-to-compare-similar-intervals-in-compare-activities/95665)).
An open issue on the same theme — "advanced interval discovery and charting" —
sits in another project's tracker
([GoldenCheetah issue #537](https://github.com/GoldenCheetah/GoldenCheetah/issues/537)).

⚠ Absence of evidence is not evidence of absence: closed-source platforms may
have unpublished matching. What can be said is that **no platform surveyed
documents structural session matching, and at least one has a public, unanswered
request for it.**

### 1.5 The academic literature is thin, and adjacent

There is a substantial literature on time-series similarity (§2) and on
trajectory similarity, and a small applied literature on recommending training
_from_ athlete histories — e.g. a marathon-training recommender built on
similarity between runners' training histories
([Fit to Run, RecSys 2020, doi:10.1145/3383313.3412228](https://doi.org/10.1145/3383313.3412228)).
DTW has been applied to sports trajectories and movement patterns. What this
search did **not** find is any published, evaluated method — or benchmark
dataset — for _"given a structured endurance session, retrieve its prior
repeats"_. Every threshold in §2 and §3 is therefore **calibration, not
science**, and must be labelled that way wherever it surfaces.

---

## 2. Structural similarity over a step sequence

### 2.1 The object being compared

Before any distance, canonicalise. The comparable object is a **flattened,
portable, role-tagged step sequence**:

```ts
/** One step of a session, in the only form two sessions can be compared in. */
type StepToken = {
	role: 'warmup' | 'work' | 'recovery' | 'cooldown'
	durationSec: number
	/**
	 * Intensity as a fraction of the athlete's threshold on the discipline's
	 * anchor channel, **using the threshold that was in force on the session's
	 * date** (§5). Null when no threshold resolves — an honest hole, never 1.0.
	 */
	intensityFrac: number | null
}

type SessionSequence = {
	discipline: 'run' | 'bike' | 'swim'
	steps: StepToken[]
	totalWorkSec: number
}
```

Four canonicalisation rules, each of which is a decision:

1. **Expand repeats.** `3 × (13 × (30 s / 15 s))` becomes 78 tokens. Expansion
   makes rep count a first-class part of the sequence, which is what makes
   insertion/deletion price it correctly (§2.4). It also makes the sequence
   long, which is why §2.3's signature exists.
2. **Convert distance-quantified steps to duration.** A `1000 m` rep and a
   `3:20` rep are the same rep. The conversion needs a pace, and the only
   defensible pace is the one **measured** in that occurrence — which means
   distance-quantified _prescriptions_ are only comparable to duration-
   quantified _recordings_ through the recording. Prescriptions that never got
   recorded stay incomparable, and should say so.
3. **Convert intensity to a fraction of threshold.** Absolute watts and sec/km
   do not travel across athletes _or_ across one athlete's fitness changes (§5).
4. **Drop warm-up and cool-down from the distance, keep them in the display.**
   Two 6×1000 m sessions are the same session whether the warm-up was 10 or 25
   minutes. Warm-up length is a real difference and belongs on screen; it is not
   an identity difference. (This is the same instinct
   [`workout-taxonomy.md`](workout-taxonomy.md) §5.1 records — the main set is
   the archetype-bearing part.)

### 2.2 Bucketing, and why durations go on a log axis

Every method below needs a notion of "close enough" on duration and intensity.
Linear tolerance is wrong: 30 s vs 45 s is a different session (a short-interval
VO₂max protocol vs an anaerobic one), while 20:00 vs 20:15 is the same session
executed twice. The ratio, not the difference, is what matters — so compare
`log(duration)` and bucket geometrically.

```ts
/** Geometric duration buckets: ~15 % wide, so 30/35/40/45 s separate cleanly
 *  while 20:00 and 20:15 land together. */
const DUR_LOG_BASE = Math.log(1.15)
const durBucket = (sec: number) => Math.round(Math.log(sec) / DUR_LOG_BASE)

/** Intensity buckets of 5 % of threshold — finer than a zone, coarser than noise. */
const INTENSITY_BUCKET_WIDTH = 0.05
const intBucket = (frac: number) => Math.round(frac / INTENSITY_BUCKET_WIDTH)
```

⚠ **1.15 and 0.05 are placeholders.** They are the same class of constant as
`app/utils/structure-detection/constants.ts`, whose own header says to tune
against the corpus rather than the domain. Nothing in the literature fixes them.

### 2.3 Set-signature hashing — the O(1) layer

Most repeats of a session are _exact_ repeats at the granularity anyone cares
about. A canonical signature turns those into an index lookup.

```ts
/** A block reduced to the shorthand a coach would say out loud. */
type BlockSignature = {
	k: number // rep count (product of both repeat levels)
	workDurBucket: number
	workIntBucket: number | null
	recDurBucket: number | null
}

function signature(seq: SessionSequence): string {
	const blocks = groupIntoBlocks(seq.steps) // work runs + the recovery that follows
	const parts = blocks
		.filter((b) => b.role === 'work')
		.map(
			(b) =>
				`${b.k}x${b.workDurBucket}@${b.workIntBucket ?? '?'}/${b.recDurBucket ?? '-'}`,
		)
	// Sorted: a session is a multiset of sets. Order of blocks is not identity.
	return `${seq.discipline}|${parts.sort().join('+')}`
}
```

**What it buys.** An indexed equality lookup. `6x28@17/12` finds every other 6×5
min @ threshold session with a ~1 min float, in one query, with no sequence
algorithm run at all.

**Its one pitfall, and it is a real one.** Bucket-boundary straddle. Two
genuinely identical sessions whose mean rep durations fall either side of a cut
point get different signatures and never meet. The standard mitigation is to
treat the signature as a **blocking key** rather than an answer: probe the
signature and its ±1 neighbours in each bucketed dimension, then rerank the
union with a real distance (§2.4). With `d` bucketed dimensions that is `3^d`
probes — 27 for the three above, which is still cheap and still indexed.

**Do not use a locality-sensitive hash here.** MinHash-style signatures
([Broder 1997, doi:10.1109/SEQUEN.1997.666900](https://doi.org/10.1109/SEQUEN.1997.666900))
solve set resemblance at a scale — millions of documents — that a single
athlete's session history is roughly six orders of magnitude short of. An
athlete with ten years of daily training has ~4 000 sessions. A full scan with a
cheap prefilter is not the bottleneck; **JSON parsing of an unindexable column
is** (§7).

### 2.4 Edit distance over step tokens — the correct reranker

Two sequences of step tokens, of possibly different lengths, where **a missing
rep should be expensive and a slightly slow rep should be cheap**. That is the
sequence-alignment problem, and its canonical solution is the
Needleman–Wunsch/Levenshtein dynamic program
([Levenshtein 1966](https://nymity.ch/sybilhunting/pdf/Levenshtein1966a.pdf);
[Needleman & Wunsch 1970, doi:10.1016/0022-2836(70)90057-4](<https://doi.org/10.1016/0022-2836(70)90057-4>))
with a **graded substitution cost** instead of a binary one.

```ts
const W_DUR = 1.0
const W_INT = 2.0 // intensity discriminates archetype harder than duration does
const ROLE_MISMATCH = 1.5 // a work step is never a recovery step

/** Cost of calling token a the same step as token b. 0 = identical. */
function subCost(a: StepToken, b: StepToken): number {
	if (a.role !== b.role) return ROLE_MISMATCH
	const dur = Math.abs(Math.log(a.durationSec / b.durationSec))
	// A null intensity is an unavailable metric, not a zero. Charge a fixed,
	// modest penalty rather than pretending the two agree or disagree.
	const int =
		a.intensityFrac == null || b.intensityFrac == null
			? 0.25
			: Math.abs(a.intensityFrac - b.intensityFrac)
	return W_DUR * dur + W_INT * int
}

/** Cost of an unmatched token — proportional to how much session it is. */
function indelCost(t: StepToken, totalWorkSec: number): number {
	const share = t.durationSec / Math.max(1, totalWorkSec)
	return t.role === 'work' ? 1.0 + 2.0 * share : 0.4 * (1 + share)
}

/** Global alignment distance. O(n·m) time, O(min(n,m)) space with a rolling row. */
function sequenceDistance(x: SessionSequence, y: SessionSequence): number {
	if (x.discipline !== y.discipline) return Infinity // a hard filter, not a cost
	const n = x.steps.length
	const m = y.steps.length
	let prev = new Float64Array(m + 1)
	let cur = new Float64Array(m + 1)
	for (let j = 1; j <= m; j++)
		prev[j] = prev[j - 1]! + indelCost(y.steps[j - 1]!, y.totalWorkSec)

	for (let i = 1; i <= n; i++) {
		cur[0] = prev[0]! + indelCost(x.steps[i - 1]!, x.totalWorkSec)
		for (let j = 1; j <= m; j++) {
			const sub = prev[j - 1]! + subCost(x.steps[i - 1]!, y.steps[j - 1]!)
			const del = prev[j]! + indelCost(x.steps[i - 1]!, x.totalWorkSec)
			const ins = cur[j - 1]! + indelCost(y.steps[j - 1]!, y.totalWorkSec)
			cur[j] = Math.min(sub, del, ins)
		}
		;[prev, cur] = [cur, prev]
	}
	// Normalize so sessions of different lengths are comparable at all.
	return prev[m]! / Math.max(n, m)
}
```

**Why indel cost is duration-weighted.** A dropped 20-minute threshold block and
a dropped 20-second stride are both one deletion, and pricing them equally is
the mistake that makes edit distance feel arbitrary on this data.

**Why `role` is a hard-ish cost rather than a hard constraint.** A detector that
labels a fading last rep as `recovery` should be penalised, not made to return
`Infinity` — the detector is fallible and the corpus already says so (ADR 0033).

**Complexity.** `n`, `m` ≤ a few hundred expanded tokens; `O(n·m)` is
microseconds. Against 4 000 candidate sessions unfiltered it is still only ~10⁸
cell evaluations in the worst case — noticeable, which is why §2.3's blocking
stage exists, not why a different algorithm is needed.

### 2.5 DTW — right for traces, wrong for step sequences

Dynamic Time Warping is the same dynamic program with one difference: it allows
**many-to-one** alignment, and (in its classical form) requires the endpoints to
match
([Sakoe & Chiba 1978, doi:10.1109/TASSP.1978.1163055](https://doi.org/10.1109/TASSP.1978.1163055);
[Berndt & Clifford 1994](https://cdn.aaai.org/Workshops/1994/WS-94-03/WS94-03-031.pdf)).
That property is exactly what makes it correct for a GPS track — where the same
road is sampled at different speeds and you _want_ five samples to align to one
— and exactly what makes it wrong for a step sequence, where **rep count is the
discriminator**. DTW aligns 4×3 min onto 10×3 min by warping, and reports a
small distance. Edit distance charges six deletions. The second is the answer
the athlete wants.

Three further facts worth carrying:

- **A warping window is mandatory in practice.** The Sakoe–Chiba band restricts
  `|i − j| ≤ r`, which both prevents pathological alignments and drops the cost
  to `O(n·r)`.
- **DTW is not a metric.** It violates the triangle inequality, so metric-tree
  indexing does not apply directly. Indexing DTW at scale requires the
  `LB_Keogh` lower bound and a warping constraint
  ([Keogh & Ratanamahatana 2005, doi:10.1007/s10115-004-0154-9](https://doi.org/10.1007/s10115-004-0154-9)).
- **Linear-time approximations exist and are approximations.** FastDTW projects
  a coarse-resolution solution and refines it, in linear time and space
  ([Salvador & Chan 2007, _Intelligent Data Analysis_ 11(5):561–580](https://content.iospress.com/articles/intelligent-data-analysis/ida00303)).
  At session-history scale there is no reason to reach for it.

**Where DTW genuinely belongs in this feature**: (a) route matching, per §1.2;
(b) aligning two raw telemetry traces for overlay rendering, which is the "shift
traces to align intervals" affordance the compare surfaces expose by hand; (c)
as an alternative to `Fréchet`/`LCSS` for the geometric key. For trajectories
specifically the published alternatives are the discrete/continuous Fréchet
distance
([Alt & Godau 1995, doi:10.1142/S0218195995000064](https://doi.org/10.1142/S0218195995000064))
and LCSS-style measures designed for noisy trajectories with outliers
([Vlachos, Kollios & Gunopulos 2002, doi:10.1109/ICDE.2002.994784](https://doi.org/10.1109/ICDE.2002.994784)).

### 2.6 Choosing between them

| Method                      | Compares                 | Cost             | Right when                                                     | Fails when                                                     |
| --------------------------- | ------------------------ | ---------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| **Signature equality**      | Canonical block multiset | O(1) indexed     | The common case: an exact repeat                               | Bucket-boundary straddle; any variation at all                 |
| **Signature ±1 blocking**   | Same, neighbourhood      | O(3^d) indexed   | Generating candidates for a reranker                           | Still misses genuinely irregular sets                          |
| **Weighted edit distance**  | Expanded step sequence   | O(n·m)           | Reranking candidates; rep count matters; sets differ in length | Long sequences × unfiltered corpus; needs tuned weights        |
| **DTW (banded)**            | Raw trace or GPS track   | O(n·r)           | Routes; trace overlay alignment                                | Step sequences — warps rep count away; not a metric            |
| **Feature-vector distance** | 6–7 scalars              | O(1) per pair    | Fuzzy "sessions like this"; the cohort question (key 5)        | Loses order and shape entirely; collapses ladders and pyramids |
| **Fréchet / LCSS**          | Trajectories             | O(n·m) (Fréchet) | Geometric route identity with noise/outliers                   | Not applicable to non-GPS sessions                             |

The defensible pipeline is all three cheap-to-expensive stages, not one method:

```
hard filter (athlete, discipline, date window)
  → signature ±1 blocking          [indexed, O(1)]
  → feature-vector prefilter       [cheap, cuts the tail]
  → weighted edit distance rerank  [exact, ordered]
  → top-k with the identity key stated on screen
```

---

## 3. The feature-vector approach

### 3.1 Which features actually discriminate

| Feature                 | Why it discriminates                                                         | Transform                      |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| **Discipline**          | A run and a ride are never the same session                                  | **Hard filter, not a feature** |
| **Rep count `k`**       | 5×5 min and 20×1 min differ here and almost nowhere else in the scalars      | `log(1 + k)`                   |
| **Mean rep duration**   | The single strongest archetype signal in the short/long VO₂max split         | `log`                          |
| **Total work duration** | Dose. ⚠ ≈ `k` × mean rep duration — see §3.2                                 | `log`                          |
| **Mean rep intensity**  | The zone axis, as a fraction of threshold                                    | linear, already dimensionless  |
| **Work:rest ratio**     | Separates sub-threshold floats (3:1–6:1) from anaerobic recoveries (1:3–1:6) | `log`                          |
| **CV of rep intensity** | Separates a flat set from a ladder, a progression or a fade                  | linear, already dimensionless  |
| **Total session TSS**   | ⚠ Weak and redundant. See below                                              | —                              |

The work:rest and intensity bands above are
[`workout-taxonomy.md`](workout-taxonomy.md) §5.2's table, which is convention
rather than validated optima — it is being used here as a **feature-design
argument** ("these dimensions separate the archetypes coaches distinguish"), not
as evidence.

**Total TSS earns its ⚠.** It is a scalar that deliberately collapses duration
and intensity into one number, which is the opposite of what a discriminator
needs: a 90-minute easy run and a 55-minute threshold session can price the
same. It is a useful _display_ column beside a comparison and a poor _feature_
inside one. [`workout-taxonomy.md`](workout-taxonomy.md) §9.3 reaches the same
conclusion from the archetype side ("do not build a numeric session-difficulty
score… that is TSS again").

**Structural shape is missing from this list and that is the honest limit of the
approach.** A ladder (1-2-3-4-3-2-1), a pyramid and a flat 7×2:30 can have
identical `k`, mean duration, total work and mean intensity. Only CV of rep
_duration_ partially separates them, and it cannot tell a ladder from a random
set. **Feature vectors are a prefilter and a cohort tool; they are not an
identity key.**

### 3.2 The double-counting trap

`totalWorkSec ≈ k × meanRepSec`, so including all three in a Euclidean distance
weights dose roughly twice. Three options, in increasing order of pain:

1. **Drop one.** Keep `k` and mean rep duration; derive total for display.
   Simplest and defensible.
2. **Reweight by hand.** Halve the weight on the three dose features. Arbitrary,
   and arbitrary weights are what make a similarity score feel unexplainable.
3. **Mahalanobis distance**, which whitens by the inverse covariance
   ([Mahalanobis 1936, _Proc Natl Inst Sci India_ 2(1):49–55](https://insa.nic.in/writereaddata/UpLoadedFiles/PINSA/Vol02_1936_1_Art05.pdf)),
   and so handles the correlation correctly by construction. ⚠ It needs a
   well-conditioned covariance estimate, and an athlete with 40 sessions
   estimating a 7×7 covariance with two near-collinear columns will produce a
   near-singular matrix and unstable distances. **Not recommended below a few
   hundred sessions**, and requiring shrinkage above that.

Option 1 is the right default and should be stated as a decision, not left
implicit.

### 3.3 Normalisation and the distance

```ts
type FeatureVector = readonly number[]

/**
 * Robust standardisation against **this athlete's own** session distribution.
 * Median/IQR rather than mean/SD because session distributions are heavy-tailed
 * — one 5-hour ride drags a mean and an SD around and a median does not.
 */
function standardise(
	x: FeatureVector,
	stats: { med: number[]; iqr: number[] },
) {
	return x.map((v, i) => (v - stats.med[i]!) / Math.max(stats.iqr[i]!, 1e-6))
}

/** Weighted Euclidean = Mahalanobis with a diagonal covariance. Say so. */
function featureDistance(
	a: FeatureVector,
	b: FeatureVector,
	w: readonly number[],
): number {
	let s = 0
	for (let i = 0; i < a.length; i++) s += w[i]! * (a[i]! - b[i]!) ** 2
	return Math.sqrt(s)
}
```

**Cosine similarity is the wrong choice here and it is worth saying why**, since
it is the reflex for anything called a feature vector. Cosine discards
magnitude. On these features magnitude _is_ the signal: 4×4 min and 12×4 min
point in nearly the same direction and are different sessions. Cosine is right
for high-dimensional sparse count data; this is a seven-dimensional dense vector
of physical quantities, and Euclidean-after-standardisation is the correct
family.

**Mixed types.** If the vector ever grows categorical members (surface, indoor/
outdoor), the standard mixed-type coefficient is Gower's
([Gower 1971, doi:10.2307/2528823](https://doi.org/10.2307/2528823)) — but the
better move for the categories in this domain is to make them **filters** rather
than dimensions, as discipline already is.

### 3.4 Thresholds — and why an absolute one should not be shipped

There is no published cut point. Two honest constructions:

- **Relative, per athlete.** Compute the distribution of pairwise distances
  across the athlete's own sessions and take the k nearest, reporting the
  distance's **percentile** rather than its value. "These are your 6 closest
  matches, all within your 2nd percentile of session-to-session distance" is a
  statement the data supports.
- **Graded, per this repo's own honesty convention.** ADR 0033's rule —
  `high | medium | low`, or return nothing — is directly reusable. A similarity
  score rendered as `0.87` invites an athlete to reason about the third decimal
  of a number whose constants were guessed.

⚠ **A percentage similarity in the UI would be the exact failure ADR 0033 exists
to prevent.** Show the matched sessions and the identity key; show a grade if
anything; never a bare number.

### 3.5 One dimensionality caveat, for the record

Distance concentration — the phenomenon where nearest and farthest neighbour
distances converge as dimensionality rises — makes nearest-neighbour retrieval
meaningless in high dimensions
([Aggarwal, Hinneburg & Keim 2001, doi:10.1007/3-540-44503-X_27](https://doi.org/10.1007/3-540-44503-X_27)).
At six or seven dimensions this is **not** a live problem, and it is worth
recording precisely so that nobody later "improves" the feature vector to forty
dimensions on the assumption that more features is better. It is not.

---

## 4. The comparison itself

Given N occurrences of one session, what may be shown?

### 4.1 The primitives

| Surface                         | What it is                                                                                  | Status                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Per-rep grid**                | Rows = occurrences, columns = rep index, cell = the anchor metric (pace/power) for that rep | **Arithmetic.** Valid. The single highest-value surface, and the one this repo cannot build (§7)                       |
| **Mean ± SD across the set**    | `228 ± 6 W` for one occurrence's work reps                                                  | **Arithmetic.** Valid, and the field's convention — GoldenCheetah stores per-interval `stdmean_`/`stdvariance_` for it |
| **Fade / decay across reps**    | Slope of rep metric vs rep index within one occurrence                                      | Descriptive statistic; the underlying construct (durability) is published, the statistic is not (§4.2)                 |
| **Trend across occurrences**    | A line through occurrence-level means over time                                             | **Inference.** Needs a noise floor it does not have (§4.3)                                                             |
| **Pace / power at the same HR** | Efficiency Factor and aerobic decoupling, trended                                           | **Coaching construct, unvalidated, and invalid on intervals** (§4.2)                                                   |
| **Rep-matched delta**           | Rep _i_ this time vs rep _i_ last time, for `i ∈ 1…min(k)`                                  | **Arithmetic**, and the honest replacement for a set-mean comparison (§4.4)                                            |
| **Context strip**               | Date, temperature, elevation gain, preceding 7-day load, threshold in force                 | Not a metric; the thing that makes every row above readable                                                            |

### 4.2 Published-valid vs eyeballing

**Published-valid:**

- The **within-set mean ± SD** and the per-rep values. These are descriptions of
  the data, not claims about the athlete.
- **Durability as a construct** — that physiological attributes measured at rest
  or early in a session are not static and shift during prolonged exercise, with
  direct consequences for intensity regulation and for quantifying adaptation
  ([Maunder et al. 2021, _Sports Med_ 51(8):1619–1628, doi:10.1007/s40279-021-01459-0](https://doi.org/10.1007/s40279-021-01459-0)).
  This validates _looking at_ late reps differently from early reps. It does not
  validate any particular fade-slope statistic.
- **Reliability framing.** The correct machinery for "is this repeat actually
  different" is the typical (within-subject standard) error of measurement
  ([Hopkins 2000, _Sports Med_ 30(1):1–15, doi:10.2165/00007256-200030010-00001](https://doi.org/10.2165/00007256-200030010-00001)).
  The framing is valid; see §4.3 for why the number is not available.

**Eyeballing, and must be labelled as such:**

- **Efficiency Factor and aerobic decoupling.** Both are coaching constructs
  from the power-meter tradition with no primary validation, and this corpus
  already flags them (`activity-analysis-metrics.md` §2.3–§2.4, including that
  "heat, dehydration and caffeine produce decoupling that is not a fitness
  signal"). They additionally **require a steady aerobic effort** — computing
  either over an interval session and trending it across occurrences produces a
  number that varies with the recovery valleys, not with fitness.
- **Any fade-slope threshold** ("more than 3 % drop-off means you went out too
  hard"). No source.
- **A trend line over fewer than a handful of occurrences.** Two points are not
  a trend; four points spanning a season are four confounded points.

### 4.3 The confound problem

This is where the surface becomes dishonest if built naively. Each row is a
mechanism by which a cross-occurrence difference is **not** a fitness
difference.

| Confound                 | Mechanism                                                                                                                                                                                                                                                                                                         | Correctable?                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dose non-identity**    | The "faster" occurrence was 8 reps, not 10. §4.4                                                                                                                                                                                                                                                                  | **Yes, and it must be** — show `k` and total work; compare rep-matched                                                                                                                                                                               |
| **Environment**          | Marathon pace slows progressively as WBGT rises from ~5 °C to ~25 °C, and **more for slower runners** ([Ely et al. 2007, doi:10.1249/mss.0b013e31802d3aba](https://doi.org/10.1249/mss.0b013e31802d3aba); consistent with [Vihma 2010, doi:10.1007/s00484-009-0280-x](https://doi.org/10.1007/s00484-009-0280-x)) | **Partially.** Display temperature; do **not** silently "correct" pace — the published effect is population-level and non-linear                                                                                                                     |
| **Terrain / gradient**   | A rep up a 4 % grade is a different rep                                                                                                                                                                                                                                                                           | **Partially** — GAP on the Minetti cost-of-running basis ([doi:10.1152/japplphysiol.01177.2001](https://doi.org/10.1152/japplphysiol.01177.2001)); the downhill half of the curve is the weak part, and it needs an altitude channel this repo lacks |
| **Antecedent load**      | Rep 1 fresh vs rep 1 after a long run the day before                                                                                                                                                                                                                                                              | **No.** Display the preceding 7-day load beside each occurrence and let the reader judge                                                                                                                                                             |
| **Within-session order** | Late reps are systematically affected by durability, not just effort (Maunder 2021)                                                                                                                                                                                                                               | **No.** Which is exactly why rep-matched comparison beats set-mean                                                                                                                                                                                   |
| **Threshold drift**      | If intensity is stored as `% of current threshold`, raising the threshold makes every past session retroactively easier                                                                                                                                                                                           | **Yes** — resolve against the threshold in force on the session's date (§5)                                                                                                                                                                          |
| **Measurement error**    | GPS pace noise on short reps; power-meter unit-to-unit differences ([Gardner et al. 2004, doi:10.1249/01.MSS.0000132380.21785.03](https://doi.org/10.1249/01.MSS.0000132380.21785.03)); HR strap dropouts and lag                                                                                                 | **No.** It sets a floor below which differences must not be rendered as change                                                                                                                                                                       |
| **Fitness**              | The thing you are trying to measure                                                                                                                                                                                                                                                                               | n/a — it is the signal, and everything above is what buries it                                                                                                                                                                                       |

**The noise-floor problem, stated honestly.** The right test for "is this repeat
different" compares the observed change against the typical error (Hopkins
2000). Computing a typical error requires **repeated measures under standardised
conditions**, which training data by definition is not. Two serviceable
substitutes, both of which must be labelled as substitutes:

1. **The within-set SD of the reps** in each occurrence gives a same-day,
   same-conditions dispersion. If two occurrences' set means differ by less than
   the pooled within-set SD, calling that a change is not defensible.
2. **The residual scatter around a fitted trend** over ≥5 occurrences bounds the
   occurrence-to-occurrence noise, at the price of assuming the trend model.

Neither is a validated typical error. Both are far better than a bare arrow.

### 4.4 "A faster repeat may just be a shorter one"

The failure mode deserves its own statement because it is the one a naive
implementation will ship.

An athlete does 10×1000 m at 3:35/km in March and 8×1000 m at 3:31/km in May. A
surface that ranks occurrences by mean rep pace shows an improvement. The
athlete did **20 % less work** the second time, which is a large part of why the
reps were faster. The same failure appears as a shortened last rep, a truncated
session, and a set where the recovery quietly grew from 60 s to 90 s.

Three rules, all cheap:

1. **Never reduce an occurrence to one scalar.** `k`, total work duration and
   mean rep intensity travel together or not at all.
2. **Compare rep-matched.** Rep _i_ against rep _i_ over `1…min(k)`. A dropped
   rep then costs the comparison nothing and shows up as a missing column, which
   is the truth.
3. **Price the recovery.** Work:rest ratio belongs in the comparison header. A
   set run on 90 s floats is not the set run on 60 s floats, and the mean rep
   pace will say it is better.

---

## 5. Cross-athlete portability

This is the same problem
[`portable-intensity-anchors.md`](portable-intensity-anchors.md) solves for
prescription, restated for comparison, and the answer transfers with one
addition.

**The problem.** `312 W` and `3:35/km` do not travel across athletes, and — the
part that is specific to comparison — **they do not travel across one athlete's
own fitness changes either.** Comparing occurrences on absolute values answers
"did the numbers get bigger", which is only the question the athlete meant if
their threshold did not move. If it did, the number moved partly because the
same relative effort is now a different absolute one.

**The answer, in three parts:**

1. **Compare on a fraction of threshold**, on the discipline's anchor channel —
   the same axis `portable-intensity-anchors.md` establishes for prescription
   (`pctThreshold` is one of its six target variants). This makes two athletes'
   executions of one Catalogue session commensurable, and makes one athlete's
   March and May executions commensurable.
2. **Resolve against the threshold that was in force on the session's date**,
   not the current one. This is the direct comparison-side consequence of that
   document's "freeze the resolution at prescription time, re-resolve at view
   time, and show both" finding: for a _comparison_, the frozen value answers
   "how hard was this at the time" and the current value answers "how hard would
   this be now", and they are **two different charts**. Rendering one and
   labelling it as the other is the error.
3. **Race-equivalent anchors are the wrong axis here.** That document is
   explicit that named race paces are duration-relative and therefore not the
   same physiological intensity for two athletes. For comparison specifically,
   the threshold anchor is the only defensible one.

**The residual, which cannot be engineered away.** Even on a perfectly portable
axis, two athletes executing the same session are not doing the same session:
`5 × 6 min @ 100 % threshold` costs a 16-minute-5k runner and a 30-minute-5k
runner different amounts of time at that intensity, different absolute
durations, and different fatigue. Cross-athlete comparison of a session is
**comparison of execution fidelity**, not of physiology, and should be framed
that way — "you both held the prescribed band", never "you did it better".

**What makes cross-athlete comparison tractable at all** is that identity key 2
(§1.3) is exact across athletes: two athletes who both forked one Catalogue
Entry are provably doing the same prescription. Structure-based matching across
athletes compounds two uncertain steps and should not be the basis of anything
displayed.

---

## 6. Claims this document declines to launder

Popular practice in this area rests on a lot of unsourced assertion. Recorded
here rather than repeated in the findings:

- **"Strava-style route matching works by ⟨specific algorithm⟩."** Only three
  criteria are published — start/end points, direction, distance. The
  clustering, the tolerances and the direction test are not. Several blog-level
  reconstructions exist; none is authoritative and none is cited here.
- **The proprietary GAP model.** Grade-adjusted pace as shipped by a major
  platform is unpublished. Minetti et al. 2002 is the published basis for _a_
  gradient-cost correction, and this corpus already carries it
  (`activity-analysis-metrics.md` §1.4). Do not present Minetti as a
  reconstruction of anyone's shipped GAP.
- **"Decoupling under 5 % means you are aerobically fit."** The 5 % figure
  circulates from coaching blog posts. No primary source, no published
  derivation, no reported reliability. It is already flagged in this corpus and
  is flagged again here because a comparison surface is exactly where it would
  get trended.
- **"Compare power at the same heart rate to see fitness improve."** The
  construct (Efficiency Factor) has no primary validation; its sensitivity to
  heat, hydration and caffeine is acknowledged even by its proponents; and it is
  undefined on interval sessions. It may be **shown** with its preconditions
  stated. It may not be the headline of a repeat comparison.
- **Any similarity threshold presented as validated.** No benchmark dataset for
  endurance-session similarity was found. Every constant in §2 and §3 of this
  document is a placeholder, said so in place, and must be calibrated against
  the seeded corpus before it is believed.
- **"DTW measures workout similarity."** DTW is validated for speech and
  trajectory alignment. Its application to structured-session similarity is, on
  this search, unpublished — and §2.5 argues it is actively the wrong choice
  there. The route-matching use is the one with a shipped precedent.
- **The exact parameters of the one published route-matching algorithm.** The
  200 m / 4 % prefilter, the quadratic penalty and the DTW step are reported
  consistently, but both source pages returned 403 to direct fetch during this
  research and the numbers come from an indexed summary. Treat the
  **architecture** as sourced and the **constants** as needing re-verification.
- **Any claim about what closed platforms do internally.** Absence of
  documentation is what is recorded, not absence of a feature.

---

## 7. Implications for trainm8

Read against `prisma/schema.prisma`, `app/utils/structure-detection/`
(`types.ts`, `mine.ts`, `analyze.ts`), `app/utils/catalogue.ts`,
`app/utils/athlete.server.ts`, and ADR
0002/0007/0020/0021/0032/0033/0034/0035/ 0051.

### 7.1 Gap 1 is load-bearing, and here is exactly why

[`interval-detection-and-data-platform.md`](interval-detection-and-data-platform.md)
**Gap 1 — "There is no per-interval entity, and therefore no per-interval
metrics"** — is not merely relevant to this feature. It is the reason the
feature cannot be built at all, and the code says so more sharply than the
schema does.

`mineStructure` in `app/utils/structure-detection/mine.ts` **computes every
individual rep**: it builds a `Rep[]` with `startSec`, `endSec`, `durationSec`
and a representative `value` per rep, stitches reps split by pauses, clusters
them, measures the recovery between each consecutive pair, and computes the
within-cluster coefficient of variation of both duration and value. All of it is
there. Then:

```ts
const workSteps: StepPlan[] = [
	{ role: 'work', durationSec: workDurMean, value: workValue },
]
```

— one step, carrying the **mean** duration and a pooled representative value,
with the count moved to `{ repeat: k }`. `analyze.ts`'s `toStructure` then
renders that into a `WorkoutStructure`, and `WorkoutDetection.structureJson`
persists it. **The reps are computed and thrown away.**

The consequences for this feature, in order:

1. **No per-rep grid.** The highest-value comparison surface in §4.1 has no data
   behind it, for a single session let alone across occurrences.
2. **No mean ± SD.** The CV is computed inside the scorer and discarded; the SD
   the field's convention displays (`228 ± 6 W`) is not recoverable.
3. **No fade slope, no rep-matched comparison, no durability read.** All three
   need rep index.
4. **The session fingerprint collapses to three numbers.** What survives
   persistence is `(k, meanWorkDurationSec, representativeValue)` per block.
   §2's step-sequence edit distance degenerates to §3's feature vector, because
   the sequence has no distinguishable elements. **A ladder, a pyramid and a
   flat set that share those three numbers are byte-identical after detection.**
5. **The recovery is half-stored.** One representative recovery duration and
   value per block, so work:rest ratio survives but its variation does not.

`WorkoutDetection.structureJson` stores a **prescription** shape — that is the
sibling document's diagnosis and it is confirmed here from a new direction: a
prescription has no room for a measurement, and a comparison surface is entirely
made of measurements. The `ActivityInterval` model that document sketches is the
prerequisite for this one.

### 7.2 The concrete gaps, in cost order

| Gap                                                                                                                                                                                | Cost         | Unblocks                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Read `Workout.copiedFrom` as a repeat key.** The lineage chain already exists (`schema.prisma:227`) and nothing walks it to partition sessions into repeat groups                | **Very low** | Identity key 2 — exact repeats of a Catalogue or forked prescription, with zero new schema                                          |
| **A threshold-as-of-date resolver.** `ThresholdEvent` carries `effectiveAt` and `getThresholdHistory` reads it, but every resolution path uses the **current** `DisciplineProfile` | Low          | §5's portable axis; without it, raising a threshold silently rewrites every past comparison                                         |
| **`archetype` on `WorkoutSession` / `WorkoutDetection`.** `SESSION_ARCHETYPES` ships in `app/utils/catalogue.ts` but is authored only on a `CatalogueEntry`                        | Low          | The blocking key; identity key 5; the "cohort, not repeat" label                                                                    |
| **A stored, indexed structural signature.** §2.3, as a real column with an index                                                                                                   | Low          | O(1) candidate lookup. Today every similarity query is a full scan plus a `JSON.parse` of `structureJson` — an unindexable `String` |
| **A per-interval measured entity.** §7.1 / sibling Gap 1                                                                                                                           | **High**     | Everything in §4.1 above the context strip. The prerequisite, not an enhancement                                                    |
| **`distance` + `altitude` + `latlng` stream channels.** Sibling Gap 3                                                                                                              | High         | Identity key 1 (route matching) at all; GAP for the terrain confound; per-rep distance                                              |
| **A Comparison Set entity.** Saved selections with the identity key recorded                                                                                                       | Medium       | The "saved compare set" the field's users are asking for, and the surface on which the identity key can be stated                   |

### 7.3 Things this research says **not** to do

- **Do not ship a similarity percentage.** ADR 0033's grade-or-nothing rule
  applies verbatim: the constants are uncalibrated and a `0.87` invites
  reasoning the data cannot support.
- **Do not use DTW on step sequences.** §2.5. Use it for routes and trace
  overlay only.
- **Do not reuse the plan-vs-actual alignment machinery** (sibling §1.6, ADR
  0034). Aligning one recording to one prescription is a supervised, one-to-one
  problem with a known target; retrieval is unsupervised and one-to-many.
  Sharing code between them will corrupt both.
- **Do not rank occurrences by a single scalar.** §4.4. This is the specific
  dishonesty this surface makes easy.
- **Do not auto-correct pace for weather.** Display the temperature. The
  published weather effect is population-level, non-linear in WBGT, and
  interacts with ability (Ely 2007) — a per-athlete correction factor would be
  invention.
- **Do not grow the feature vector.** §3.5. Six or seven dimensions is the right
  size; forty is worse, not better.
- **Do not lead the comparison with Efficiency Factor or decoupling.** §4.2.

### ADRs this research challenges

Each ADR below was read before being cited.

| ADR                                                                                   | What it decided                                                                                        | What the evidence says                                                                                                                                                                                                                                                                                                         | Verdict                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| **0032** Detection stores a single structure; reuses the workout vocabulary           | One winning structure persisted, in `WorkoutStructureSchema` shape, materializable with no translation | The single-structure half is confirmed. The vocabulary-reuse half is the binding constraint here: `mine.ts` computes every rep and `toStructure` averages them into one step (§7.1). A comparison surface is entirely made of per-rep measurements. Same amendment the sibling document raises as Gap 1, reached independently | **Amend**                  |
| **0033** Detection Confidence honesty bar (`high\|medium\|low`, else nothing)         | A graded, shared honesty vocabulary; never a bespoke 0–1 scale                                         | Reused verbatim for similarity. There is no published cut point for session similarity (§1.5), so a percentage would be the exact failure this ADR prevents. Extend the rule to cover retrieval scores                                                                                                                         | **Confirm** (and extend)   |
| **0035** Segments classified on the anchor channel; the zone label is display-derived | Store the measured value; derive the label                                                             | Confirmed and extended: similarity must be computed on **fraction of threshold**, derived at compare time, never on the stored absolute. And the threshold used must be the one in force on the session's date, which needs the resolver §7.2 names                                                                            | **Confirm** (and extend)   |
| **0051** The Catalogue has four axes; `copiedFrom` is the fork-on-write back-pointer  | Lineage exists for forks, adopted generated sessions, and citation resolution                          | The field ships no exact identity key at all (§1.4); this repo already has one and does not read it. `copiedFrom` is the cheapest correct answer to "the same session", and `CatalogueEntry.archetype` is the natural blocking key. Extend the axes' reading, not their number                                                 | **Amend**                  |
| **0002** Step quantification — duration XOR distance XOR vertical                     | A step quantifies exactly one of three                                                                 | Correct as authoring. But a `1000 m` rep and a `3:20` rep are the same rep, and comparing them requires a canonicalisation rule and a measured pace (§2.1). The rule does not exist; the ADR should name what happens when two quantities meet in one comparison                                                               | **Amend**                  |
| **0020** ActivityStream stores downsampled telemetry                                  | A display-grade even grid                                                                              | Route identity is unavailable without `latlng`, terrain correction without `altitude`, per-rep distance without `distance`. The sibling document already argues this ADR should be superseded (its Gap 4); this note adds a third independent consumer and does not re-litigate                                                | **Amend** (defer to Gap 4) |
| **0034** Detected structure verifies against the plan                                 | Plan verification at the granularity the ADR fixes                                                     | Confirmed as scoped, and explicitly **not** the machinery for retrieval: alignment is supervised one-to-one, retrieval is unsupervised one-to-many (§7.3). Keep them apart                                                                                                                                                     | **Confirm**                |
| **0021** Personal Records are derived best efforts                                    | PRs derived, never stored as authored facts                                                            | Confirmed, and the same shape: a PR is repeat comparison with the identity key fixed to a duration or distance. The noise-floor honesty in §4.3 should apply to both — a PR beaten by less than measurement error is not news                                                                                                  | **Confirm** (and extend)   |
| **0007** Step as a discriminated union; two repeat levels; `sendOff`                  | `cardio \| strength \| rest`, `repeatCount` × `seriesRepeatCount`, send-off on the block               | Confirmed and load-bearing: the flattener in §2.1 needs exactly these three to expand `3 × (13 × 30/15)` correctly, and `blockRepeatTotal()` already exists. The vocabulary is sufficient for the **prescription** side of similarity                                                                                          | **Confirm**                |
| **0023** Shared display-formatting layer                                              | One formatting layer for units                                                                         | Confirmed: a comparison grid is the densest unit-rendering surface in the app, and the mean ± SD rendering (`228 ± 6 W`, `3:04 ± 0:04`) belongs there rather than in the comparison view                                                                                                                                       | **Confirm**                |

---

## 8. Uncertainty and limitations

- **Every constant in §2 and §3 is a placeholder.** The 1.15 duration bucket
  base, the 0.05 intensity bucket, the substitution weights (`W_DUR = 1.0`,
  `W_INT = 2.0`), the role-mismatch cost, the indel formula and the null-
  intensity penalty were chosen to be plausible and internally consistent. None
  is calibrated, and no benchmark exists to calibrate against without building a
  labelled corpus first. This is the same status
  `structure-detection/constants.ts` warns about in its own header.
- **The pseudocode is untested.** It was written for this document and has not
  been run against the seeded corpus or anything else.
- **The route-matching parameters are second-hand.** Both source pages returned
  HTTP 403 to direct fetch; the 200 m / 4 % prefilter, the DTW step and the
  quadratic penalty come from an indexed summary of those pages. Flagged in
  place in §1.2 and §6.
- **"No platform does structural matching" is a negative result from a bounded
  search.** Four platforms' public documentation and two public forums/trackers
  were checked. Closed platforms may have unpublished features, and the search
  did not cover every product in the category.
- **No systematic literature search was performed for session-similarity
  retrieval.** The conclusion in §1.5 — that no evaluated method or benchmark
  exists — rests on targeted searches, not on a systematic review, and should be
  treated as "not found" rather than "does not exist".
- **The feature list in §3.1 is reasoned, not empirically selected.** It comes
  from which dimensions separate the archetypes in
  [`workout-taxonomy.md`](workout-taxonomy.md) §2 and §5.2 — themselves a
  synthesis rather than a standard. A feature-selection study on real session
  data could easily find that three of the seven carry everything.
- **The noise-floor substitutes in §4.3 are not typical errors.** Within-set SD
  and trend residual are stand-ins for a statistic that requires standardised
  repeated measures. They are defensible as floors and indefensible as
  reliability coefficients.
- **The weather citation is about marathon racing, not interval sessions.** Ely
  et al. 2007 quantifies a marathon-performance effect across WBGT; applying it
  qualitatively to "a threshold session in July is not a threshold session in
  February" is an extrapolation, and no source was found that quantifies the
  effect on interval-session pacing specifically.
- **Cross-athlete comparison was analysed, not evidenced.** The argument in §5
  that comparing two athletes on one session is a fidelity comparison rather
  than a physiological one follows from
  [`portable-intensity-anchors.md`](portable-intensity-anchors.md)'s
  duration-relativity finding; no source addresses cross-athlete session
  comparison directly.
- **No competitor training product is named anywhere in the findings**, per the
  convention in [README.md](README.md). Source platforms are named in §1 and in
  the References, which is what that convention permits.

---

## References

**Sequence and time-series similarity**

- Sakoe H, Chiba S. Dynamic programming algorithm optimization for spoken word
  recognition. _IEEE Trans Acoust Speech Signal Process._ 1978;26(1):43–49.
  doi:[10.1109/TASSP.1978.1163055](https://doi.org/10.1109/TASSP.1978.1163055)
- Berndt DJ, Clifford J. Using dynamic time warping to find patterns in time
  series. _AAAI-94 Workshop on Knowledge Discovery in Databases_, 1994:359–370.
  [PDF](https://cdn.aaai.org/Workshops/1994/WS-94-03/WS94-03-031.pdf) (workshop
  paper; no DOI)
- Keogh E, Ratanamahatana CA. Exact indexing of dynamic time warping. _Knowl Inf
  Syst._ 2005;7(3):358–386.
  doi:[10.1007/s10115-004-0154-9](https://doi.org/10.1007/s10115-004-0154-9)
- Salvador S, Chan P. Toward accurate dynamic time warping in linear time and
  space. _Intell Data Anal._ 2007;11(5):561–580.
  [Publisher](https://content.iospress.com/articles/intelligent-data-analysis/ida00303)
- Levenshtein VI. Binary codes capable of correcting deletions, insertions and
  reversals. _Soviet Physics Doklady._ 1966;10(8):707–710.
  [PDF](https://nymity.ch/sybilhunting/pdf/Levenshtein1966a.pdf) (no DOI)
- Needleman SB, Wunsch CD. A general method applicable to the search for
  similarities in the amino acid sequence of two proteins. _J Mol Biol._
  1970;48(3):443–453.
  doi:[10.1016/0022-2836(70)90057-4](<https://doi.org/10.1016/0022-2836(70)90057-4>)
- Alt H, Godau M. Computing the Fréchet distance between two polygonal curves.
  _Int J Comput Geom Appl._ 1995;5(1–2):75–91.
  doi:[10.1142/S0218195995000064](https://doi.org/10.1142/S0218195995000064)
- Vlachos M, Kollios G, Gunopulos D. Discovering similar multidimensional
  trajectories. _Proc 18th Int Conf Data Engineering (ICDE)_, 2002:673–684.
  doi:[10.1109/ICDE.2002.994784](https://doi.org/10.1109/ICDE.2002.994784)
- Broder AZ. On the resemblance and containment of documents. _Proc Compression
  and Complexity of Sequences_, 1997:21–29.
  doi:[10.1109/SEQUEN.1997.666900](https://doi.org/10.1109/SEQUEN.1997.666900)

**Distance, standardisation and retrieval**

- Mahalanobis PC. On the generalised distance in statistics. _Proc Natl Inst Sci
  India._ 1936;2(1):49–55.
  [PDF](https://insa.nic.in/writereaddata/UpLoadedFiles/PINSA/Vol02_1936_1_Art05.pdf)
  (no DOI)
- Gower JC. A general coefficient of similarity and some of its multivariate
  properties. _Biometrics._ 1971;27(4):857–871.
  doi:[10.2307/2528823](https://doi.org/10.2307/2528823)
- Aggarwal CC, Hinneburg A, Keim DA. On the surprising behavior of distance
  metrics in high dimensional space. _Proc 8th Int Conf Database Theory (ICDT)_,
  LNCS 1973, 2001:420–434.
  doi:[10.1007/3-540-44503-X_27](https://doi.org/10.1007/3-540-44503-X_27)
- Berndsen J, Smyth B, Lawlor A. Fit to run: personalised recommendations for
  marathon training. _Proc 14th ACM Conf Recommender Systems (RecSys)_, 2020.
  doi:[10.1145/3383313.3412228](https://doi.org/10.1145/3383313.3412228) ⚠ cited
  for the existence of history-similarity recommendation in this domain, not for
  a session-similarity method

**Sports science — what a comparison may claim**

- Hopkins WG. Measures of reliability in sports medicine and science. _Sports
  Med._ 2000;30(1):1–15.
  doi:[10.2165/00007256-200030010-00001](https://doi.org/10.2165/00007256-200030010-00001)
  · PMID 10907753
- Maunder E, Seiler S, Mildenhall MJ, Kilding AE, Plews DJ. The importance of
  'durability' in the physiological profiling of endurance athletes. _Sports
  Med._ 2021;51(8):1619–1628.
  doi:[10.1007/s40279-021-01459-0](https://doi.org/10.1007/s40279-021-01459-0) ·
  PMID 33886100
- Ely MR, Cheuvront SN, Roberts WO, Montain SJ. Impact of weather on
  marathon-running performance. _Med Sci Sports Exerc._ 2007;39(3):487–493.
  doi:[10.1249/mss.0b013e31802d3aba](https://doi.org/10.1249/mss.0b013e31802d3aba)
  · PMID 17473775
- Vihma T. Effects of weather on the performance of marathon runners. _Int J
  Biometeorol._ 2010;54(3):297–306.
  doi:[10.1007/s00484-009-0280-x](https://doi.org/10.1007/s00484-009-0280-x)
- Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. Energy cost of walking and
  running at extreme uphill and downhill slopes. _J Appl Physiol._
  2002;93(3):1039–1046.
  doi:[10.1152/japplphysiol.01177.2001](https://doi.org/10.1152/japplphysiol.01177.2001)
- Gardner AS, Stephens S, Martin DT, Lawton E, Lee H, Jenkins D. Accuracy of SRM
  and Power Tap power monitoring systems for bicycling. _Med Sci Sports Exerc._
  2004;36(7):1252–1258.
  doi:[10.1249/01.MSS.0000132380.21785.03](https://doi.org/10.1249/01.MSS.0000132380.21785.03)

**Platform documentation (source platforms named here only)**

- Strava Support — Matched Activities.
  <https://support.strava.com/hc/en-us/articles/216918597-Matched-Activities>
  (published criteria: start/end points, direction, distance; the split-cluster
  failure mode)
- Runalyze Help — Recurring Routes.
  <https://runalyze.com/help/article/recurring-routes> · announcement:
  <https://blog.runalyze.com/allgemein-en/new-feature-recurring-routes/> ⚠ both
  returned HTTP 403 to direct fetch; parameters quoted from an indexed summary
- GoldenCheetah Wiki — Compare Pane (General).
  <https://github.com/GoldenCheetah/GoldenCheetah/wiki/UG_Compare-Pane_General>
  (manual drag-and-drop selection; no automatic similarity search documented)
- GoldenCheetah issue #537 — Advanced interval discovery and charting.
  <https://github.com/GoldenCheetah/GoldenCheetah/issues/537>
- TrainingPeaks Help Center — Workout Comparison.
  <https://help.trainingpeaks.com/hc/en-us/articles/45991996472333-Workout-Comparison>
  (date-range picker plus manual selection)
- Intervals.icu — Compare Activities.
  <https://www.intervals.icu/features/compare-activities/> (manual selection;
  search by name, hashtag, or interval intensity and duration; manual trace
  shifting)
- Intervals.icu forum — More efficient way to compare similar intervals in
  "Compare Activities".
  <https://forum.intervals.icu/t/more-efficient-way-to-compare-similar-intervals-in-compare-activities/95665>
  (the open, unanswered request for exactly this feature)

**In-repo cross-references**

- [interval-detection-and-data-platform.md](interval-detection-and-data-platform.md)
  — §1.4 per-interval metrics, §1.6 plan-vs-actual alignment, §2.3 the list
  surface, Gap 1 (no per-interval entity), Gap 3 (missing stream channels), Gap
  4 (ADR 0020)
- [portable-intensity-anchors.md](portable-intensity-anchors.md) — the portable
  intensity axis, the six-variant target union, resolution timing and provenance
- [activity-analysis-metrics.md](activity-analysis-metrics.md) — §1.4 GAP, §2.3
  Efficiency Factor, §2.4 aerobic decoupling and its confounds
- [workout-taxonomy.md](workout-taxonomy.md) — §2 the archetype inventory, §5.1
  warm-up/main set/cool-down, §5.2 work:rest ratios by archetype, §9.3 on not
  building a session-difficulty score
