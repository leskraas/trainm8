# Deriving an athlete profile from imported history

How a connected account becomes thresholds, zones and a training level without
asking the athlete a question — and, more importantly, which parts of that are
recoverable from what this repo currently stores and which are structurally
impossible until the storage changes.

**What this document is.** A synthesis and a route, not a fresh primary-source
sweep of the physiology. The physiology is already settled in
[`zones-and-thresholds.md`](./zones-and-thresholds.md) (Coggan / Friel / Daniels
/ Seiler / Olympiatoppen tables, FTP · eFTP · CP · LTHR · CSS, the automatic
estimation recipe in its §4) and in
[`portable-intensity-anchors.md`](./portable-intensity-anchors.md) (the
velocity–duration curve, Riegel, Daniels–Gilbert VDOT, Critical Speed, Cameron).
Every physiological claim below defers to those two documents and their
citations; where this document adds a number it says where from. What is new
here is the **pipeline**: what runs, in what order, over which stored fields,
writing what, with what provenance.

Written against the audit in
[`../wayfinder/plan-builder-mobile-ux/434-implementation-review.md`](../wayfinder/plan-builder-mobile-ux/434-implementation-review.md)
and the destination in
[`../wayfinder/out-of-the-box/destination.md`](../wayfinder/out-of-the-box/destination.md).

---

## TL;DR

- **The data arrives and nothing reads it.** All three import paths are
  complete. `ThresholdEvent.source` reserves `'inferred'` and `'auto'` and
  neither value is ever written. There is no FTP, LTHR, threshold-pace or max-HR
  estimator anywhere in the repo.
- **The blocker is not the algorithm; it is ADR 0020.** `ActivityStream` is a
  _display_ grid — `STREAM_MAX_SAMPLES = 1000`,
  `STREAM_RESOLUTION_FLOOR_SEC = 5`. A 5 h ride lands on an **18 s** grid. A
  mean-maximal curve fitted to that is wrong at short durations by construction,
  and the 5 s / 15 s / 60 s rungs are not merely noisy — they are
  **unrecoverable**. Three research documents already recommend superseding ADR
  0020 for this reason; this is the fourth, and the first where the
  recommendation is load-bearing for a feature rather than for fidelity.
- **But a useful profile does not need the short end of the curve.** The
  2-parameter CP model `P(t) = CP + W′/t` is well-behaved over roughly **2–20
  min**, and at an 18 s grid a 2-minute window is seven samples. The honest
  split is: **CP/eFTP is approximately recoverable today; anything under ~2 min
  is not; distance-based best efforts are impossible for a different reason.**
- **`ActivityStream` carries no distance and no altitude channel.** Already
  filed as Gap 3 of
  [`interval-detection-and-data-platform.md`](./interval-detection-and-data-platform.md).
  So a 5 k or 10 k best effort _inside_ a longer run cannot be found, which is
  the single richest source of a runner's threshold pace.
- **Two things are free today and neither is built.** `ActivityImport` stores
  per-activity `hrMax`, `powerMax`, `distanceM`, `durationSec` and
  `paceAvgSecPerKm` as provider summaries that were **never downsampled**. An
  observed max HR and a set of whole-activity distance/time pairs are one query
  away.
- **`AthleteProfile.birthdate` is dead data.** ADR 0005 §44 promises Tanaka (208
  − 0.7 × age) and `structure-detection/classify.ts:227` defers to it as
  "computed upstream"; nothing upstream computes it. This is the cheapest rung
  on the whole ladder and it is a comment.
- **The provenance axis in ADR 0005 is wrong and this feature is what breaks
  it.** `manual | inferred | auto` records _how much to trust the entry_, which
  is not the thing that varies. `zones-and-thresholds.md` §3.1/§3.2 shows FTP
  from a 60-min TT, from `0.95 × 20 min`, from `0.75 × ramp MAP` and from a CP
  fit are four different numbers for the same rider, up to ~20 W apart — two of
  them `manual` and two `auto`. Record the **protocol** and the **construct**.
- **CP ≠ FTP and must not be written into `ftp`.** 256 ± 50 W vs 249 ± 44 W,
  limits of agreement −19 to +33 W, gap widening with fitness, and the authors
  state they should not be used interchangeably. A CP fit written silently into
  `DisciplineProfile.ftp` is a fabrication with a correct-looking number in it.
- **Derived once, then authored.** The same rule ADR 0050 already set for
  `weeklyCapacityHours`. Never silently re-read history and move an athlete's
  zones underneath them; a movement that changes stored history owes a **Load
  Recompute Notice**.
- **Never decay a stale estimate.** No literature validates any decay function.
  Freeze and flag as stale.
- **Do not import a provider's computed threshold as ours.** The Intervals.icu
  ingest already declines `icu_training_load`, CTL and ATL by deliberate
  decision (`app/integrations/intervalsicu/ingest.server.ts:49`). A provider
  eFTP is the same class of thing — but it is legitimate as a **pre-filled value
  the athlete confirms**, which is a different act from the app asserting it.

---

## 1. What the repo actually has to work with

Read from `prisma/schema.prisma` and `app/`.

### 1.1 Per-activity summaries — full fidelity, never downsampled

`ActivityImport` (`schema.prisma:1123`) stores, per activity:

| Field                                         | Use to a profile                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `hrMax`, `hrAvg`                              | **Observed max HR** across history; the HR side of an efficiency trend                                                |
| `powerMax`, `powerAvg`, `powerWeightedAvg`    | `powerWeightedAvg` ≈ Normalized Power as the provider computed it                                                     |
| `distanceM`, `durationSec`, `paceAvgSecPerKm` | One (distance, time) pair per activity — the raw material of a race-equivalence anchor, **if** the effort was maximal |
| `elevationGainM`                              | The confound that invalidates a raw pace comparison                                                                   |
| `kilojoules`                                  | Total mechanical work                                                                                                 |
| `lapsJson`                                    | Provider lap markers — stored and, per Gap 7, **unread**                                                              |
| `rawJson`                                     | The full provider payload, verbatim and lossless                                                                      |

`rawJson` is the sleeper asset. It means a re-analysis over the whole history
does not require re-fetching from the provider for anything the summary payload
carried. It does **not** carry streams — both providers serve those from a
separate endpoint, and both fetchers exist (`fetchStravaActivityStreams`,
`fetchIntervalsIcuActivityStreams`).

### 1.2 Streams — a display grid being asked to do analysis

`ActivityStream` (`schema.prisma:1174`), per ADR 0020:

- `STREAM_RESOLUTION_FLOOR_SEC = 5`, `STREAM_MAX_SAMPLES = 1000`
  (`app/utils/activity-stream.ts:45`)
- three channels: `power`, `heartrate`, `pace` — **no distance, no altitude, no
  cadence, no temperature**
- `null` marks a pause and is never interpolated (correct, and load-bearing
  below)

Effective resolution is `max(5, ceil(span / 999))`:

| Activity                | Span     | Grid        |
| ----------------------- | -------- | ----------- |
| 45 min interval session | 2 700 s  | 5 s (floor) |
| 90 min ride             | 5 400 s  | 6 s         |
| 3 h ride                | 10 800 s | 11 s        |
| 5 h ride                | 18 000 s | **19 s**    |

The model comment is candid that this is a display decision: _"the overlay needs
no 1 Hz fidelity; this bounds storage."_ It was the right call for the overlay
and it is the wrong grid for a mean-maximal curve.

### 1.3 What is missing outright

- **No mean-maximal / power-duration curve anywhere.** Grep returns prose only.
- **`BenchmarkKind = 'farthest'`** — one benchmark kind
  (`app/utils/personal-records.ts:15`). No time-based or duration-based records.
- **`PerformanceResult` has no writer** (#464). Read helpers exist
  (`raceAnchorForDistance`, `raceAnchorPacesFor`); nothing creates a row, from
  any route, service or seed.
- **`ThresholdEvent.effectiveAt` is written and never read**, so zone resolution
  uses the _current_ profile and raising an FTP retroactively reclassifies
  history. `DisciplineProfile.zoneSystem` has no history at all.

---

## 2. The estimation ladder, rung by rung

Ordered by **cost to build**, not by physiological importance — because the
cheap rungs are also the ones that unblock the most surfaces.

### Rung 0 — Age-predicted max HR (Tanaka)

`HRmax ≈ 208 − 0.7 × age`. Already promised by ADR 0005 §44 and already depended
on by `structure-detection/classify.ts:227`, which resolves an HR classifier
against a maxHr recipe when no LTHR exists.

- **Input:** `AthleteProfile.birthdate`. Stored today, read by nothing.
- **Cost:** one pure function.
- **Construct:** `maxHr`. **Protocol:** `tanaka`.
- **Confidence: `low`, permanently.** A population regression is not a
  measurement of this athlete, and the standard error on individual prediction
  is large enough that it must never outrank an observed value.
- **Unblocks:** every HR-anchored recipe for an athlete who has typed nothing,
  which today means structure detection returns `null` for them.

### Rung 1 — Observed max HR

`max(hrMax)` over `ActivityImport` in a rolling window.

- **Input:** the provider summary field. Not downsampled, so this is exact.
- **Cost:** one query.
- **Construct:** `maxHr`. **Protocol:** `observed`.
- **Confidence:** graded on **recency** and on whether any activity in the
  window was plausibly maximal. An athlete who has done nothing but Z2 for six
  months has an observed max that is a floor, not a max — and the honest
  statement is a floor.
- **Trap:** HR strap dropouts and cross-talk produce 220 bpm spikes. The
  provider summary inherits them. Take a high percentile of per-activity maxima
  rather than the single global maximum, and state the rule.

### Rung 2 — Critical Power / eFTP from a mean-maximal curve

The recipe is `zones-and-thresholds.md` §4 and is not restated here: build an
MMP curve per activity, take a 90-day rolling window, least-squares fit
`P(t) = CP + W′/t` over 2–20 min, grade from coverage, recency, maximality and
residual.

```ts
// Per activity, over the stored stream. Note the resolution caveat below.
function meanMaximal(
	series: Array<number | null>,
	resolutionSec: number,
	durationsSec: readonly number[],
): Map<number, number | null> {
	// Sliding window over an EVEN grid; nulls (pauses) invalidate a window
	// rather than counting as zero — a paused 5 min is not a 5 min effort.
	const out = new Map<number, number | null>()
	for (const d of durationsSec) {
		const w = Math.round(d / resolutionSec)
		if (w < MIN_SAMPLES_PER_WINDOW) {
			out.set(d, null)
			continue
		} // honest refusal
		let best: number | null = null
		for (let i = 0; i + w <= series.length; i++) {
			const slice = series.slice(i, i + w)
			if (slice.some((v) => v == null)) continue
			const mean = (slice as number[]).reduce((a, b) => a + b, 0) / w
			if (best == null || mean > best) best = mean
		}
		out.set(d, best)
	}
	return out
}
```

**`MIN_SAMPLES_PER_WINDOW` is where the honesty lives.** At an 18 s grid a
60-second window is 3.3 samples and the answer is not a 60 s max power — it is
noise with a plausible magnitude. The refusal must be structural, not a warning.

**What this means in practice, given ADR 0020:**

| Duration rung | 5 s grid (short session) | 19 s grid (5 h ride)   |
| ------------- | ------------------------ | ---------------------- |
| 5 s, 15 s     | 1–3 samples — **refuse** | **refuse**             |
| 1 min         | 12 samples — usable      | 3 samples — **refuse** |
| 2 min         | 24 samples — good        | 6 samples — marginal   |
| 5–20 min      | good                     | good                   |

So the CP fit's own valid range (2–20 min) is **approximately** intact, and
everything the neuromuscular end of the curve would tell you is gone. Two
consequences worth stating plainly:

1. A CP/eFTP estimate is buildable **today**, against the current storage, for
   most athletes, with a documented resolution refusal at the short end.
2. **W′ is not.** The fit returns a `W′` from the same regression, and a `W′`
   whose short-duration anchors were refused is a free parameter absorbing
   residual. Report CP; decline W′ until the analysis tier exists.

**The construct rule.** The fit returns **CP**, not FTP. Write it as CP with
`construct: 'cp'`. If a surface anchored on FTP needs a number, it may _read_
the CP with the difference stated — it may not have it silently written into
`DisciplineProfile.ftp`.

### Rung 3 — Threshold pace, and why it is harder than power

Two paths, and the repo can currently walk neither cleanly.

**Path A — from a `PerformanceResult`.** `performance-result.server.ts` resolves
_"rung 1 or nothing"_: an exact stored result at the exact distance. There is no
writer, so it resolves to nothing. #464 is the writer; #465 is rungs 2–5, the
equivalence model that turns one result into every distance.

The candidate rows are sitting in `ActivityImport`: `(distanceM, durationSec)`
per activity. What is missing is **maximality** — knowing that a 21.1 km run at
4:12/km was a race and not a long steady effort. Signals available today:

- the provider's own workout/race type flag in `rawJson`;
- the activity title (athletes name races);
- an outlier test against the athlete's own distance–pace scatter;
- a completed `WorkoutSession` linked to an `Event` with `kind: 'race'` — the
  cleanest signal, and one the model already carries.

The honest design is that a detected candidate is **proposed and confirmed**,
never asserted. `PerformanceResult.source` already distinguishes
`race | timeTrial | trainingSegment`, and `verified` already records whether the
app read the telemetry itself — the schema was designed for exactly this and is
waiting.

**Path B — from the pace stream.** Blocked, and not by resolution.
`ActivityStream` has a `pace` channel but **no distance channel**, so "the
fastest 5 km inside this run" cannot be found: you cannot integrate a
downsampled, pause-gapped pace series into distance without accumulating error
that is exactly the size of the thing being measured. This is Gap 3 of
`interval-detection-and-data-platform.md` and it gates the richest source a
runner has.

A _duration_-based mean-maximal curve on pace **is** available (fastest 20
minutes, fastest 60 minutes), and for threshold estimation that is arguably the
better anchor anyway — but it is a different quantity from a 10 k PB and must
not be labelled as one.

### Rung 4 — LTHR

The tradition's protocols (a 30-min TT's last 20 min, or ~0.95 × HR in a 20-min
maximal effort) all require **a known-maximal effort**, which is the same
maximality problem as rung 3 and not a data problem.

The honest position: **LTHR is the rung most likely to stay manual**, and that
is fine, because rung 0 and rung 1 give the HR recipes an anchor to run on
(`olt-hr-5-*` are `maxHr`-anchored) and `friel-hr-5-*` degrade to a zone label
rather than a fabricated number.

Where a **detected** session is a threshold session (stage 2 of the destination
— archetype classification), the mean HR of its work intervals is a genuine LTHR
candidate, because the _prescription_ asserts the intensity. That is a real
route and it depends on the archetype axis existing.

### Rung 5 — CSS (swim)

`CSS = (D₂ − D₁) / (t₂ − t₁)` from a 400 m / 200 m pair. Swim imports carry no
stream and no laps worth the name. **This stays manual**, and the app already
handles that correctly: `css-5` is the default recipe and an unresolved target
degrades to a zone label.

### Rung 6 — Training level

The Catalogue's `level` is a **floor** (`beginner | intermediate | advanced`,
null = unscoped), and ADR 0053 §9 already decided the conservative rule for
generation: the athlete's stated intent maps to a floor, and **nothing maps to
`advanced`**, because retrieving at `intermediate` already admits every unscoped
and beginner-floored row.

That decision should hold even once history is readable. A derived level is a
**band about a person**, and the asymmetry is the point: getting it too low
costs an athlete a scroll; getting it too high puts a session on their calendar
they should not be doing. Where history genuinely informs it — years of
consistent volume, a CP fit with high coverage — it belongs as a **pre-filled
suggestion on a control the athlete owns**, never as a silent input to
retrieval.

---

## 3. Provenance: the model ADR 0005 needs

`ThresholdEvent.source: manual | inferred | auto` cannot express what this
feature produces. Replace it with two orthogonal fields, keeping `source` for
compatibility:

```ts
type ThresholdConstruct =
	| 'maxHr'
	| 'lthr'
	| 'ftp' // the 60-min-power construct
	| 'cp' // the hyperbolic asymptote — NOT ftp
	| 'thresholdPace'
	| 'criticalSpeed'
	| 'css'
	| 'runPower'

type ThresholdProtocol =
	| 'manual' // the athlete typed it
	| 'tt60'
	| 'ftp20'
	| 'ramp' // named field tests
	| 'cp-fit' // least-squares over the MMP curve
	| 'race-equivalence' // resolved from a PerformanceResult
	| 'observed' // the maximum actually recorded
	| 'tanaka' // age regression
	| 'provider' // a connected account's own number, confirmed by the athlete

type ThresholdEstimate = {
	construct: ThresholdConstruct
	protocol: ThresholdProtocol
	value: number
	confidence: 'high' | 'medium' | 'low' // ADR 0033's vocabulary, never a 0–1 score
	window: { fromISO: string; toISO: string }
	basis: { activityCount: number; durationsUsed: number[]; residual?: number }
	staleAfterISO: string // frozen, never decayed
}
```

Four rules on top of the shape:

1. **A construct is never silently coerced.** A `cp` estimate does not become
   `ftp` because a surface wanted an FTP.
2. **Confidence is the ordinal vocabulary the app already speaks.** Detection
   Confidence and Load Confidence are `high | medium | low`; a fourth bespoke
   scale is the thing ADR 0033 exists to prevent.
3. **Derived once, then authored** — ADR 0050's rule, applied unchanged. The
   estimate is a _pre-fill with its derivation shown_, and once the athlete has
   a stored value nothing re-reads history to move it.
4. **A stale estimate is frozen and flagged, never decayed.** No literature
   validates a decay function, and inventing one is exactly the fabrication the
   building principle forbids.

### 3.1 The recompute problem

`ThresholdEvent.effectiveAt` is written and never read: zone resolution uses the
current `DisciplineProfile`, so a threshold movement retroactively reclassifies
history. Today that is a latent defect because thresholds move rarely and by
hand. A backfill that estimates a threshold across an athlete's whole history
makes it a **live** one, and on day one.

The repo already has the honest mechanism: a **Load Recompute Notice** — a
one-time migration plus a notice that explains the movement, never an offer. Any
first run of this pipeline over existing athletes owes one.

---

## 4. What the app should do the first time an account connects

The destination's stage 1, expressed as a sequence with an honest output at
every step — so a partial answer is still a useful one.

```
connect → backfill (exists) → analyse (new) → propose → athlete confirms
```

| Step                                  | Output                                  | If it cannot                                    |
| ------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| Observed max HR (rung 1)              | a number with a date                    | say "we have not seen a hard enough effort yet" |
| Tanaka (rung 0)                       | a `low`-confidence floor                | say `birthdate` is not set, and offer the field |
| CP fit per cardio discipline (rung 2) | CP + confidence + the window it read    | name which duration rungs were refused and why  |
| Race candidates (rung 3A)             | a list to confirm, not a stored result  | say no maximal effort was identifiable          |
| Zone Recipe                           | already defaulted per discipline (#454) | —                                               |
| Level                                 | a suggestion on a control               | default to the ADR 0053 §9 floor                |

**Nothing on that list may be silently written.** The whole page is a proposal
with its derivation visible, which is the shape ADR 0050 already used for Weekly
Capacity and the shape #436 settled for generation's inputs.

---

## 5. Implications for trainm8

1. **Build rungs 0 and 1 first.** They are a pure function and a query, they
   need no schema change, and they turn structure detection on for every athlete
   who has typed nothing — which is currently a `null` return.
2. **Add `construct` and `protocol` to `ThresholdEvent` before writing a single
   estimate.** Retrofitting provenance onto stored numbers is not possible;
   `zoneSystem`'s missing history is the standing proof.
3. **Build the CP fit against the current storage, with a documented resolution
   refusal.** Do not block stage 1 on ADR 0020. Do file the supersede — this is
   the fourth document to recommend it, and the first with a feature behind it.
4. **The analysis tier, when it comes, is a second blob and not a bigger display
   grid.** Full-resolution analysis series, with the display grid derived from
   it. That is the shape three documents already recommend.
5. **`ActivityStream` needs a distance channel** before a runner's threshold
   pace can come from anywhere but a confirmed race. Gap 3, already filed.
6. **Write `PerformanceResult` from confirmed candidates** (#464), and take the
   maximality signal from an `Event` link where one exists rather than from a
   heuristic where one does not.
7. **Do not adopt a provider's threshold as the app's own.** Offer it as a
   pre-fill labelled `protocol: 'provider'`, confirmed by the athlete. The
   Intervals.icu ingest's refusal of `icu_training_load` / CTL / ATL is the
   precedent and it is the right one.
8. **`AthleteProfile.birthdate` gets a consumer or it should not be collected.**
   Storing a date of birth that nothing reads is a privacy cost with no product
   return.

### ADRs this research challenges

| ADR                                                                             | Verdict                     | Reason                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0005** — `ThresholdEvent.source: manual \| inferred \| auto`; Tanaka promised | **Supersede**               | Wrong provenance axis: four protocols produce four different numbers for one rider and the enum cannot tell them apart. Record **protocol** and **construct**. Also: the Tanaka fallback it promises has never been built, and this is the feature that needs it |
| **0020** — Downsampled activity stream                                          | **Supersede**               | Fourth independent recommendation. The display grid is being used as the analysis grid; at 19 s the short end of the mean-maximal curve is unrecoverable rather than noisy                                                                                       |
| **0050** — Weekly Capacity is derived-then-authored                             | **Confirm, and generalize** | The right pattern for every derived profile quantity. This document adopts it wholesale                                                                                                                                                                          |
| **0033** — Confidence is an ordinal grade, never a score                        | **Confirm**                 | A threshold estimate's confidence uses the same three labels; a bespoke 0–1 scale would be a second vocabulary                                                                                                                                                   |
| **0006** — Zone recipes are immutable code constants                            | **Confirm**                 | Nothing here changes a recipe; the estimates feed the _anchors_ recipes resolve against                                                                                                                                                                          |
| **0008** — Unavailable Metric over a fabricated one                             | **Confirm**                 | The refusals in §2 are this rule applied one layer earlier, at estimation rather than at display                                                                                                                                                                 |
| **0021** — Personal Records as derived best efforts                             | **Amend**                   | `BenchmarkKind = 'farthest'` is one kind. A duration-based mean-maximal curve is the same machinery and the same honesty rules                                                                                                                                   |

---

## 6. Claims this document declines to launder

- **"Connect your account and we'll calculate your FTP."** Not from this
  storage, not at any duration under two minutes, and not as an FTP — as a CP,
  with the construct named. The marketing sentence is available; the number
  behind it is narrower than the sentence implies.
- **A single "fitness score" derived from history.** The repo already declines a
  composite readiness score for the documented reason that subjective measures
  outperform objective ones. A composite fitness number has the same shape and
  no better evidence.
- **A decay curve on a stale threshold.** Named as unsupported in
  `zones-and-thresholds.md` §4.5 and repeated here because a pipeline that
  estimates automatically will feel the pull to keep the number moving.
- **Inferring `advanced` from volume.** Years of high volume is a fact about
  training history, not a statement that an athlete should be served the
  advanced-floored rows. ADR 0053 §9 already declined this for stated intent;
  history does not change the asymmetry.
- **A W′ from a fit whose short anchors were refused.** The regression will
  return one. It will be a residual sink.

## 7. Uncertainty and limitations

- **The 2-minute marginality at a 19 s grid is reasoned, not measured.** Six
  samples for a two-minute mean is defensible for the _mean_ and shaky for
  _which window is maximal_ — the true peak can be missed by up to half a grid
  step. Someone should measure the bias against a full-resolution fixture before
  the refusal thresholds are fixed as constants.
- **The maximality heuristics in §2 rung 3A are untested against real history.**
  Title-matching in particular is a guess about how one owner names files.
- **Percentile-vs-maximum for observed max HR** is stated as a rule with no
  number attached, deliberately. The right percentile depends on strap quality
  and should be picked against real data, not chosen here.
- **Nothing here addresses multi-sport interference** — a runner who also cycles
  has two CP fits that are not comparable, which is correct, but the _level_
  suggestion in rung 6 has no defensible cross-discipline form.

## 8. References

Deferred, deliberately, to the two documents that already carry the verified
primary sources rather than re-listing them at one remove:

- [`zones-and-thresholds.md`](./zones-and-thresholds.md) — §3 the protocols and
  their disagreement, §4 the automatic-estimation recipe and its confidence
  inputs, §4.5 the refusal to decay, and the CP-vs-FTP head-to-head with its
  limits of agreement.
- [`portable-intensity-anchors.md`](./portable-intensity-anchors.md) — the
  velocity–duration curve, the race-equivalence models and their exponent
  sensitivity, and the two-stamp resolution rule.
- [`interval-detection-and-data-platform.md`](./interval-detection-and-data-platform.md)
  — Gap 3 (no distance or altitude channel), Gap 4 (the display grid must stop
  being the analysis grid), Gap 7 (`lapsJson` is inert).

Repo evidence cited above, for whoever picks this up: `prisma/schema.prisma:667`
(`AthleteProfile`), `:716` (`PerformanceResult`), `:734` (`DisciplineProfile`),
`:766` (`ThresholdEvent`), `:1123` (`ActivityImport`), `:1174`
(`ActivityStream`); `app/utils/activity-stream.ts:45`;
`app/utils/athlete.server.ts:121`; `app/utils/zones/defaults.ts:10`;
`app/utils/performance-result.server.ts:1`;
`app/utils/structure-detection/classify.ts:227`;
`app/integrations/intervalsicu/ingest.server.ts:49`.
