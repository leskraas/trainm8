# Detection v3: what changes, measured on the scoreboard

The resolution asset for *Decide what detection v3 changes, measured on the
scoreboard* (#609) on the map *structured workouts everywhere* (#600). The
owner asked the agent to answer what the code and data can answer. This note
does that, and leaves three product choices (§8).

**How it was measured.**
- The scoreboard is `npm run detection:eval` on branch
  `wayfinder/605-detection-scoreboard` at `b2edc8d`. That commit's `matchEdges`
  pairs edges by an optimal match (most pairs, then least error). Every number
  here uses that scorer.
- Each candidate change was prototyped as a flag on a throwaway engine. It
  reuses the shipped `signal.ts`, `classify.ts`, `grade.ts` and `mine.ts`, and
  the scorer in `eval/score.ts`. The prototype was never pushed.
- Code references are to `b2edc8d`.
- The profile is `label-power` (CP 355 W) unless a row says otherwise.
- "Boundary F1 (drawn)" is the scoreboard's own metric: edges laid end to end
  from the stored structure's durations. "Boundary F1 (intervals)" scores the
  engine's per-rep edges, which v3 stores as Activity Intervals (#603).
- `*` means the laps were synthesised from the labels. They are not device
  data.

## In one paragraph

v3 claims structure only where work is clearly harder than both the athlete's
easy running and the recoveries between reps, and where the reps repeat
regularly. Zones no longer decide whether structure exists; they only label it.
On the stream alone, v3 finds 9/9 labelled sessions at `high` with 0/35 false
claims, under every threshold profile, including the seed profile, where v2
finds 0/9. No threshold change flips a verdict any more (v2: 23 flips). Reps
are exact in 5/9 from the stream and in 9/9 from typed step laps. The cost is
honesty about scope: 9 positives from one athlete, and the segmentation penalty
was set by the 45/15 sessions themselves (§5).

## 1. Each change, alone and combined

| Variant | high P / R | ≥medium P / R | any P / R | false claims (any) | reps exact | mean \|Δreps\| | boundary F1 drawn / intervals | edge err median | flips ±10 % pace / power |
|---|---|---|---|---|---|---|---|---|---|
| v2 shipped | 40 % / 2/9 | 24 % / 8/9 | 24 % / 8/9 | 25/35 | 1/9 | 13.7 | 16 % / 16 % | 10 s | 23 / 7 |
| (a) typed laps only* | 75 % / 9/9 | 26 % / 9/9 | 26 % / 9/9 | 25/35 | 9/9 | 0.0 | 98 % / 100 % | 0 s | 18 / 7 |
| (b) contrast gate only | 100 % / 2/9 | 67 % / 2/9 | 67 % / 2/9 | 1/35 | 1/9 | 14.3 | 8 % / 8 % | 12 s | 0 / 0 |
| (c) every rep only | 40 % / 2/9 | 24 % / 8/9 | 24 % / 8/9 | 25/35 | 2/9 | 13.6 | 16 % / 19 % | 9 s | 23 / 7 |
| (d) short-rep segmentation only | 50 % / 4/9 | 24 % / 9/9 | 24 % / 9/9 | 29/35 | 0/9 | 3.3 | 47 % / 45 % | 7 s | 23 / 5 |
| (b + c) | 100 % / 2/9 | 67 % / 2/9 | 67 % / 2/9 | 1/35 | 2/9 | 14.2 | 0 % / 15 % | 44 s | 0 / 0 |
| (b + d), v2 emission | 100 % / 9/9 | 47 % / 9/9 | 41 % / 9/9 | 13/35 | 1/9 | 4.0 | 52 % / 50 % | 10 s | 0 / 0 |
| (c + d), v2 gate | 50 % / 4/9 | 24 % / 9/9 | 24 % / 9/9 | 29/35 | 2/9 | 3.4 | 56 % / 81 % | 16 s | 23 / 5 |
| **(b + c + d), stream** | **100 % / 9/9** | 47 % / 9/9 | 41 % / 9/9 | 13/35 | **5/9** | **2.4** | **82 % / 88 %** | 4 s | **0 / 0** |
| **(a + b + c + d) = v3*** | **100 % / 9/9** | 47 % / 9/9 | 41 % / 9/9 | 13/35 | **9/9** | **0.0** | **98 % / 100 %** | 0 s | **0 / 0** |

What the table says:
1. **No single change is enough.**
   - (b) alone is honest but blind. The shipped segmentation can't resolve 45/15.
   - (d) alone finds everything and claims 29/35 easy runs too.
   - (c) alone changes almost nothing behind the v2 gate.
2. **(b) and (d) need each other.** Together they bring `high` recall from 2/9
   to 9/9 at 100 % precision.
3. **(c) is what fixes the shape.** It takes reps exact from 1/9 to 5/9 and
   interval F1 from 50 % to 88 %.
4. **(a) makes the shape exact** wherever typed step laps exist. It is the only
   change that also works with the seed threshold *inside v2* (9/9 vs 0/9),
   because it skips the threshold gate.
5. **All of v3's false claims are below `high`.** They are 3-rep or loose sets
   on steady and hilly runs (§3). This is why the claim is `high` only (§6.3).

## 2. The decided changes, in build order

### 2.1 Trust typed step laps (a)

- **Build.** When the device layer holds workout-step laps (FIT `intensity`
  and `wkt_step_index`, findings #604), build the structure straight from them.
  - An active lap is work. A rest or recovery lap is recovery. Warm-up and
    cool-down come from `intensity`.
  - Consecutive active laps that share a step index form one set. A change of
    step index starts a new set.
  - There is no 2-means, no ±12 % clustering and no threshold.
- **Measured** (synthetic typed laps)*:
  - 9/9 at `high`, reps exact 9/9, interval F1 100 %, intensity error 0 %.
  - With ±3 s random edge jitter: reps still 9/9 and interval F1 still 100 %
    within 10 s. Drawn F1 falls to 88 % because the median durations drift.
  - With the seed profile: 9/9. v2 on the same laps gets 0/9, because the
    threshold gate overrides ground-truth edges (`mine.ts:186-188`).
- **Read order (#603).** The engine writes these as its `engine` rows with
  `origin = lap`. The #603 read order (athlete → engine → device step laps)
  therefore stands unchanged.
- **Auto-laps are ignored.** These are `lap_trigger` distance or time laps,
  and laps of equal distance when no trigger is given.
  - Used as edges, 1 km auto-laps give 0/9.
  - They are not even worth adding as candidate edges: the 5 s stream already
    beats them.
- **Untyped step-like laps** are intervals.icu WORK/RECOVERY, TCX Active/Resting
  and manual laps. They go through the same v3 gate as stream segments, and
  their roles are never trusted (#603).
  - On a 5 s stream they add nothing: 8/9 with laps vs 9/9 from the stream.
  - On a coarse stream they rescue recall:
    - at 10 s: 9/9 with laps vs 6/9 from the stream;
    - at 15 s: 5/9 vs 2/9.
  - **Rule:** use lap edges when the stream is coarser than 5 s, otherwise the
    stream.
- **Depends on** the FIT parser keeping `intensity`, `wkt_step_index` and
  `lap_trigger`. `fit-parser.server.ts:239-255` keeps only `{startSec, endSec}`.
  It also depends on the zero-I/O device backfill (#603 choice 4).

### 2.2 Replace the threshold gate with contrast + periodicity (b)

- **Replaces** the 2-means + band-separation gate (`mine.ts:77-108`,
  `:180-188`; `MIN_BAND_SEPARATION`, `constants.ts:58`).
- **The rules**, on a hardness value per segment (power if present, else speed;
  never HR):
  1. **Walks and stops are not "easy".** A segment slower than 0.65 × the
     session's time-weighted median hardness is a walk or stop. It can be a
     recovery, but it never sets the easy baseline.
  2. **Work vs recoveries.** Every recovery between two reps must be easier
     than both by 15 % (`repMargin`, the old `VALUE_MARGIN_GATE.power`,
     `constants.ts:46`). The set's median work must be ≥ 1.15 × its median
     recovery.
  3. **Work vs flanks.** The set's median work must be ≥ 1.08 × the moving,
     non-walk time outside the set (`flankMargin`). Flank intensity is measured
     over all flank time, not the first and last segment (`mine.ts:140,155`).
  4. **No flanks.** A set with less than 120 s of moving flank time must be
     strictly periodic: k ≥ 4, rep-duration CV ≤ 0.10, recovery CV ≤ 0.35.
     This is what refuses a steady run cut by traffic stops.
  5. **Periodicity.** At least 3 reps. Rep-duration CV (ignoring the first
     and last rep when k > 4) must be ≤ 0.30.
  6. **Zones only label.** The classifier still turns each measured value into
     a zone at read time (ADR 0035 §6). It is no longer asked whether
     structure exists.
- **Measured:** alone, false claims fall from 25/35 to 1/35, and threshold
  flips fall from 23/7 to 0/0. Recall stays 2/9 until (d) lands.
- **No sustained-block claim in v3.** v2's `mineSustained` (`mine.ts:377-410`)
  makes most v2 false claims. The corpus has no positive tempo or threshold
  block, so a sustained claim can't be calibrated.
  - With a strict flank check (≥ 15 % above both flanks, ≥ 5 min warm-up),
    sustained adds 1 false claim (13 → 14) and finds nothing.
  - It returns when the corpus has positives (§7).

### 2.3 Segment for short reps (d)

- **PELT penalty** `0.5 · log n · channels`, down from `8` (`constants.ts:29`,
  `segments.ts:260`).
- **No rolling-median prefilter** on the edge channels (window 1, down from 5;
  `segments.ts:108`).
- **Minimum segment** stays 10 s (`RESPONSIVE_EDGE_MIN_SEG_SEC`,
  `constants.ts:89`).
- **Pace as speed.** Edges use speed (1000 / pace), and segment pace is averaged
  as speed.
- **Why.** With penalty 8 the whole of `i3 20x45/15` is one 2140 s segment.
  With 0.5 it is 19 of 20 reps, each 45 s with 15 s off. A 15 s recovery is 3
  samples at 5 s, and at the shipped penalty it can't pay for its two cuts.
- **Speed vs pace**, with everything else in v3:
  - false claims at any grade: 13 vs 17;
  - drawn F1: 82 % vs 72 %;
  - `high` unchanged.
- **This change only works behind (b).** On its own it raises false claims to
  29/35.

### 2.4 Emit every rep (c)

Rep grouping by alternation replaces the ±12 % clustering:
- **Before:** `mine.ts:249-262` clusters, `:371` keeps one cluster, `:344-361`
  averages the reps and `:336-342` keeps only the first recovery.
- **How it works:**
  - The engine tries every hardness level τ as the work/easy split.
  - It merges neighbouring segments on the same side.
  - It chains work runs that alternate with easier recoveries.
  - It keeps the chain with the most regular work time:
    `Σ work × (1 − 2·CV) × (1 − recovery CV)`.
- **Output:** every rep and every recovery as its own interval, with its own
  value. The materialized Workout keeps one repeat block per set, with median
  work and recovery.
- **Measured** (b + d → b + c + d):
  - reps exact 1/9 → 5/9;
  - mean |Δreps| 4.0 → 2.4;
  - interval F1 50 % → 88 %;
  - drawn F1 52 % → 82 %.
- **Rep 1 no longer merges into the warm-up.** `10x3 min` comes out 10 × 185 s
  / 60 s, where v2 gave 9 ×.
  - The finer edges and the τ search fix this on their own.
  - An explicit trim of a first or last rep longer than 1.4 × the median
    changed nothing (0 metrics moved), so it is not part of v3.

### 2.5 The claim and the HR cap

- **The structured claim is the `high` grade** (§6.3).
  - The grade: k ≥ 4, rep-duration CV ≤ 0.15, recovery CV ≤ 0.5, work /
    recovery ≥ 1.25, work / flank ≥ 1.10.
  - Typed step laps are `high` by construction.
- **The HR cap moves from the claim to the label.** v3 sets edges and the gate
  on power or speed even when HR classifies the zone.
  - ADR 0033's reason for the cap was "the zone label is shaky". That still
    holds, so the cap belongs on the zone label.
  - With the cap on the claim, the `hr` profile gets 0/9 at `high`. Without it,
    it gets the same 9/9 / 0 false claims as every other profile.

## 3. What v3 still gets wrong

Per session, stream only, label-power profile:

| Session | truth | v3 | edges within 10 s |
|---|---|---|---|
| i3 10x3 min, p:60 | 10 × 180/60 | high 10 × 185/60 | 15/20 |
| i3 5x6min | 5 × 360/60 | high 5 × 370/50 | 8/10 |
| i3 15x45/15 | 15 × 45/15 | high **5** × 50/10 | 10/30 |
| i3 20x45/15 | 20 × 45/15 | high 19 × 45/15 | 38/40 |
| i4 13x45/15 motbakke | 13 × 45/15 | high 12 × 45/15 | 22/26 |
| i4 20x45/15 | 20 × 45/15 | high 20 × 45/15 | 39/40 |
| i3 25x45/15 | 25 × 45/15 | high **15** × 45/15 | 30/50 |
| 15x45/15 | 15 × 45/15 | high 15 × 50/10 | 30/30 |
| 20x45/15 | 20 × 45/15 | high 20 × 48/12 | 40/40 |

- **Broken chains.** In `i3 15x45/15` and `i3 25x45/15`, a few reps are barely
  harder than their recoveries. In the 25×, a 15 s recovery reads 349 W against
  a 340 W rep. The chain breaks there, and v3 keeps the longest part. The
  next measured change is to join chains of the same period across a gap of
  one or two periods. It was not prototyped.
- **False claims below `high`** (13/35): eleven 3-rep sets and two 4-rep sets.
  - They are on steady runs with work/recovery contrast 1.19–1.30, and on hilly
    trails with recovery CV 0.67–0.84.
  - No false claim reaches `high`. The nearest negatives fail on rep-duration
    CV (0.26, 0.30 vs the 0.15 cut) or on k = 3.
- **Two unlabelled sessions are claimed at `high`.** Both look real (§7).

## 4. Rejected, with the measurement

| Candidate | Effect on v3 (stream) | Verdict |
|---|---|---|
| Snap edges to the steepest power step (±1 sample) | drawn F1 82 % → 51 %, edge error 4 → 11 s | rejected; revisit with a 1 s stream (#610) |
| Noise-scaled normalisation (MAD of first differences) at BIC-like penalties 1–16 | best `high` 7/9 at 88 % precision, 23 false claims | rejected |
| Second pass re-cutting reps at the work/recovery midpoint | reps exact 5/9 → 4/9 | rejected |
| Trim a rep that swallowed a flank | no metric moved | not needed |
| Sustained single-block claim | +1 false claim, 0 finds | held until the corpus has tempo positives |
| `repMargin` 0.20 / 0.30 | `high` 9/9 → 7/9 / 6/9 | keep 0.15 |
| `flankMargin` 0.15 / 0.25 | `high` 9/9 → 8/9 | keep 0.08 |
| `minSegSec` 20 | `high` 7/9 at 88 % | keep 10 s |
| 1 km auto-laps as edges | 0/9 | auto-laps ignored |

## 5. Overfitting: what holds, and what doesn't

The corpus has 9 positives from one athlete, one watch and one sport. Seven of
them are 45/15.

**What holds.**
- **Leave-one-out.** The grid was 100 settings: penalty {0.25, 0.5, 1, 2, 4} ×
  `repMargin` {0.05, 0.1, 0.15, 0.2, 0.3} × `flankMargin` {0, 0.04, 0.08,
  0.15}.
  - For each of the 44 labelled sessions, the setting was chosen on the other
    43: maximise high recall − 3 × high false claims, with ties broken toward
    the more conservative setting.
  - Result: high recall 9/9, false claims at `high` 0/35, reps exact 6/9.
- **The gate is on a plateau.** With the penalty at 0.5, `high` stays 9/9 with
  0 false claims across:
  - `repMargin` 0.05–0.15;
  - `flankMargin` 0–0.08;
  - walk fraction 0.5–0.65;
  - maximum duration CV 0.15–0.5;
  - minimum segment 5–10 s.
- **The threshold is out of the verdict.** 0 flips at ±5 % and ±10 %, for pace
  and power.

**What doesn't hold.**
- **Holdout of the 45/15 class.** Tuned on 10×3, 5×6 and the 35 negatives
  only, 88 of the 100 settings tie.
  - The conservative pick (penalty 4) finds **0/7** of the held-out 45/15.
  - Across the tied settings, the 45/15 score ranges from 0/7 to 7/7.
  - So the long-rep sessions can't choose the penalty. **The 0.5 penalty was
    set by the 45/15 sessions themselves.**
- **The plateau for the penalty is narrow.** Only 16 of the 100 settings give
  0 false claims at `high` with ≥ 8/9 recall, all at penalty 0.25–0.5.
- **The defence is a design rule, not a fit:** "a 15 s recovery at 5 s sampling
  must be able to pay for its two cuts". That rule gives a penalty below about
  1. Whether it over-segments other athletes' runs is unmeasured until #625
  lands.

**Precision can't be proven yet.** 9 true claims and 0 false claims give a 95 %
Wilson lower bound of only 70 % on `high` precision. Showing ≥ 90 % with zero
false claims takes about 35 true `high` claims.

## 6. The policies

### 6.1 Calibration target for the grades

- **`high`:** ≥ 90 % precision on the scoreboard, **and** 0 false claims among
  the labelled negatives.
  - The scoreboard reports the 95 % Wilson lower bound beside it.
  - The target counts as *met* once that lower bound is ≥ 90 %, which takes
    about 35 true `high` claims. Until then, it is *provisional*.
- **`medium` and `low` ship empty in v3.** On this corpus the band below `high`
  holds 0 true claims and 13 false ones (0 % precision). It can't be
  calibrated.
  - A band ships only when the scoreboard shows it meets its own target with at
    least 5 true claims in the band.
  - Proposed targets: `medium` ≥ 70 %. `low` is never a claim (§8, choice 1).
- **Grade inputs.** k, rep-duration CV, recovery CV, work/recovery contrast and
  work/flank contrast. The v2 0–1 score (`constants.ts:136-166`) retires. The
  grade is still never stored as a number (ADR 0032).

### 6.2 Engine version and backfill

- **Bump `STRUCTURE_DETECTION_ENGINE_VERSION` to `'3'**
  (`detect-job.server.ts:40`). The version-aware backfill
  (`detect-backfill.server.ts:28-55`, `:76-91`) then re-detects all history.
  The existing guards apply unchanged:
  - **Unpromoted imports:** replaced.
  - **Promoted, unadopted `detected` sessions:**
    - re-materialized when v3 claims structure;
    - retracted to `recorded` when it doesn't. This retires v2's false claims:
      21–28 of 35 easy runs for athletes with a real threshold.
  - **Promoted `recorded` sessions:** materialized to `detected` when v3
    claims. With the seed profile, v2 found 0/9; v3 finds 9/9.
  - **Adopted sessions** (`adoptedAt`, #460) and **athlete-layer intervals**
    (#603): never touched.
- **Order.** The v3 backfill runs after the zero-I/O device-lap backfill
  (#603 choice 4), in the same release or later. Otherwise typed laps are not
  there to read, and the detections would have to be redone.
- **Reach.** The backfill query requires a stream
  (`detect-backfill.server.ts:82`). v3 must also reach imports that have
  device step laps but no stream.
- **No Load Recompute Notice.** Detection changes no load number:
  - actual TSS comes from the import;
  - Planned TSS never computes for `detected` (ADR 0034 §3);
  - planned vs done is a mapping, not a verdict (#600 settled point 4).
- **Every future engine bump attaches the scoreboard.** A bump PR includes the
  `npm run detection:eval` table, and it may not:
  - drop `high` precision below 90 %;
  - add a false claim at `high`;
  - re-introduce threshold flips.

### 6.3 The structured claim

**The claim becomes the scoreboard-calibrated `high` grade.** ADR 0033's
band-separation gate retires. This is decided from the evidence:

| ADR 0033 says the gate… | Measured |
|---|---|
| "refuses the ~40 easy runs that otherwise produced phantom sets" | it claims 21–28 of 35 easy runs once the threshold is real |
| is "the honesty line" | a ±10 % threshold change flips 23 of 50 verdicts |
| works with laps as an "enabler" | with the seed threshold, even perfect step laps give 0/9 |

The contrast + periodicity gate does what ADR 0033 wanted: it refuses
fabrication, with 0 false claims at `high`, and it does so with no threshold.
What stays from ADR 0033:
- the `high | medium | low` vocabulary;
- "below the claim, nothing is attached";
- the grade as a display label, never stored as a number;
- the provenance marking and #460.

## 7. ADR amendments proposed

- **ADR 0033 (honesty gate).**
  1. The gate is contrast + periodicity, not band-separation (§2.2).
  2. Missing thresholds no longer make detection *absent*. Structure is found
     without a threshold, and the zone label is `unavailable` (the reader's
     hatched bar, #601/#602).
  3. The claim is the lowest grade band that meets its scoreboard target
     (§6.1). In v3 that is `high` only, and `low` no longer auto-imports. This
     reverses the "bar at `medium`/`low` rejected" alternative, because the
     band below `high` measured 0 % precision.
  4. The HR cap moves from the structure grade to the zone label (§2.5).
  5. Typed workout-step laps are `high` by construction. They are measured
     structure, not inferred.
  6. A single sustained block no longer clears the claim until the corpus can
     calibrate it.
- **ADR 0035 (zone classification).**
  - §3: the ladder no longer gates detection. Without any threshold, `analyze`
    still returns the structure, and the zone is unavailable.
  - The band-separation sentence in §3 retires.
  - §4: HR still never sets edges. The pooled-interior labelling stands.
- **ADR 0032.** No change to the model. The Lifecycle bullet "trigger rules
  left to a later ticket" is answered for engine bumps by §6.2.
- **ADR 0034.** No change from this ticket. §1 (plan-blind detection) stands:
  v3 never uses the plan. §2 is already amended by #600.
- **ADR 0020.** No amendment. The measurement supports its Revisit note:
  - at 10 s, v3 finds 6/9 and reps are exact in 3/9;
  - at 15 s, it finds 2/9.
  - A long session's 19 s grid can't resolve 45/15 from the stream. That is
    #610's question.
- **GLOSSARY `Detection Confidence`.** It is calibrated precision bands on the
  scoreboard, not a 0–1 score cut.

## 8. Choices for the owner

1. **Should anything below `high` be shown?**
   - (A) No: below `high` the recording reads as one whole-session interval.
   - (B) Show `medium` as "possible structure", with no roles and no Workout.
   - (C) Keep ADR 0033's "`low` auto-imports".
   - **Recommendation: (A).** The band below `high` measured 0/13 right. (C)
     would put a phantom 3 × 60 s on 13 of 35 easy runs.
2. **Is a 3-rep session allowed to reach `high`?** v3 needs k ≥ 4 for `high`.
   This corpus has no 3-rep positive, so a real 3 × 10 min or 3 × 2 km would be
   missed. Every 3-rep claim here was false.
   - (A) Keep k ≥ 4 until the corpus has 3-rep positives.
   - (B) Allow k = 3 at a stricter contrast (≥ 1.4) and CV (≤ 0.1).
   - **Recommendation: (A)**, plus asking the athlete for one or two 3-rep
     sessions for the corpus.
3. **Two label corrections in `labels.json`:**
   - `18552701268` is labelled "steady with a firmer 13–25 min stretch". The
     stream shows a plain 15 × 45/15 with walked recoveries (power 380–420 W /
     145–190 W).
   - `17089380389` ("four ~4 min surges") is claimed as 4 × 233/130 s at
     contrast 2.4.
   - **Recommendation:** relabel the first as structured. Ask the athlete
     whether the second was hill repeats.

## 9. What remains unmeasurable, and why

| Question | Why not now | Unblocked by |
|---|---|---|
| Real device step laps: COROS/Polar step semantics, a lap pressed mid-step, a skipped step, how a repeat reuses `wkt_step_index` | all laps here are synthesised from the labels | #625 (FIT files), #604's per-brand decode |
| Whether the 0.5 penalty over-segments other athletes, GPS-only runs, or bikes | one athlete, one watch, runs only; the penalty was set by the 45/15 class (§5) | #625, plus the 16 intervals.icu sessions |
| `high` precision ≥ 90 % with confidence | needs about 35 true claims; there are 9 | #625 |
| Tempo / sustained blocks, 3-rep sets, pyramids, ramps, multiple sets | no positive of any of these in the corpus | corpus additions (new ticket below) |
| Bike | no bike in the corpus | corpus additions |
| Boundary snapping and HR lag models | 5 s grid; snapping hurt at 5 s | #610 (1 s stream) |
| Swim from lengths | no swim in the corpus | #623 |
| Whether the negatives are truly unstructured | labelled from per-minute data by the agent; one was wrong (§8.3) | the athlete reviewing `labels.json` |

## 10. New questions this surfaces

- **Corpus coverage ticket.** Add positives of the shapes the scoreboard can't
  see yet: tempo blocks, 3-rep sets, multi-set sessions, pyramids, a bike
  session. Have the athlete confirm the negatives. Without these, `medium`
  and sustained claims can't ship (§6.1).
- **Chain joining.** Can sets broken by one weak rep (15× → 5×, 25× → 15×) be
  joined by period without new false claims? It is the largest remaining
  rep-count error, and it is cheap to measure on this scoreboard.
- **Backfill reach.** The backfill should cover imports with step laps but no
  stream (`detect-backfill.server.ts:82`). It belongs in the v3 build ticket,
  not a decision ticket.
