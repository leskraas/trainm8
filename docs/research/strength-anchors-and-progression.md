# Strength anchors: 1RM, training max, RIR, and progression

Research note. Compiled 2026-08-13. Primary sources cited inline with DOIs;
every claim that rests on a practitioner manual, a survey of practice, a
preprint, or a truncated abstract is flagged where it appears.

This is the strength counterpart of
[`zones-and-thresholds.md`](./zones-and-thresholds.md) and it deliberately
copies that document's shape. It does **not** repeat what the corpus already
holds:

- [`workouts-strength-and-other.md`](./workouts-strength-and-other.md) carries
  the 25-session library, the four phases, the anchor-family table (§4.1), the
  `%1RM ↔ reps` table with its error bars (§4.3), and the finding that strength
  resists TSS-style quantification structurally (§12). Cited throughout; not
  re-derived.
- [`../wayfinder/manual-training-planning/380-strength-volume-landmarks.md`](../wayfinder/manual-training-planning/380-strength-volume-landmarks.md)
  carries MV/MEV/MAV/MRV, Prilepin's chart as a landmark model, and the two
  trials that found **against** ratcheting opening volume block over block.
  Cited in §7.5; not re-derived.
- ADR
  [0046](../adr/0046-no-load-number-spans-incommensurable-training-tracks.md)
  and [0047](../adr/0047-strength-progresses-by-anchor-and-ramp.md) already
  settled that strength carries no TSS and progresses by hard-set counting.
  Confirmed, not revisited.

The gap this document fills is the **athlete-side number** those sessions
resolve against.

---

## TL;DR

- **No single 1RM prediction formula is defensible, and the popular ones are not
  studies.** Epley (1985) is a poundage chart from a University of Nebraska
  training manual; Brzycki (1993) is a practitioner article in _JOPERD_; Lander,
  O'Conner, Lombardi and Wathen come from textbook chapters and manuals. Only
  Mayhew's was fitted to a substantial sample. The equations are conventions
  with a citation habit, not derivations.
- **The error is tolerable to ~10 reps and then explodes.** In 103 women tested
  before and after 12 weeks of training, over a 2–30 rep range Brzycki's mean
  error was **+26.7 ± 101.7 %** and Lander's **+22.9 ± 70.7 %**; restricted to ≤
  10 reps the same equations came in at **−2.0 ± 10.5 %** and **−1.1 ± 10.5 %**
  ([Mayhew et al. 2008](https://doi.org/10.1519/JSC.0b013e31817b02ad)). Note
  what survives even in the good case: a **± 10 % individual SD** around a
  near-zero mean.
- **Error also differs by lift, and the difference is systematic.** Seven
  equations tested on bench, squat and deadlift in 67 untrained students
  correlated at r > 0.95 with the measured 1RM and **all of them significantly
  underestimated the deadlift** (LeSuer et al. 1997). The largest
  meta-regression to date needs **separate `REPS ~ %1RM` tables for bench press
  and leg press**
  ([Nuzzo et al. 2024](https://doi.org/10.1007/s40279-023-01937-7)).
- **The thing being predicted has its own error floor.** Across 32 studies (n
  = 1595) the 1RM test's median test–retest CV is **4.2 %** (median ICC 0.97)
  ([Grgic et al. 2020](https://doi.org/10.1186/s40798-020-00260-z)). No
  estimator can be better than the criterion.
- **`% 1RM` is portable only in the heavy band, and the primary source checks
  out** — Richens & Cleather 2014
  ([doi 10.5604/20831862.1099047](https://doi.org/10.5604/20831862.1099047)),
  leg press, 8 weightlifters vs 8 endurance runners: **39.9 ± 17.6 vs 17.9 ± 2.8
  reps at 70 %**, 19.8 ± 6.4 vs 11.8 ± 2.7 at 80 %, and 10.8 ± 3.9 vs 7.0 ± 2.1
  at 90 % (n.s.). §3.1 flags that the 90 % "no difference" is an **underpowered
  null**, not demonstrated equivalence — the repo's summary of it should be
  narrowed by one word.
- **RIR is the most portable anchor and the least accurate where a novice
  starts.** Trainees underpredict their reps to failure — by ~0.9 reps pooled
  ([Halperin et al. 2022](https://doi.org/10.1007/s40279-021-01559-x)) and by
  SEM 2.6–3.4 reps in 141 mixed-experience trainees
  ([Steele et al. 2017](https://doi.org/10.7717/peerj.4105)). Accuracy is a
  function of **proximity**: 259 coaches watching video misjudged RIR by 4.8
  reps a third of the way through a set and 1.2 reps near its end
  ([Emanuel et al. 2022](https://doi.org/10.1186/s40798-022-00526-8)).
- **RIR-prescribed load does not beat percentage-prescribed load in the one
  properly matched trial.** Eight weeks, sets and reps matched, squat and bench:
  both groups improved, **no significant between-group difference**
  ([Helms et al. 2018](https://doi.org/10.3389/fphys.2018.00247)).
- **The training max has no evidence base.** It is a practical buffer, its
  author's own site says there is "no hard rule" for it, and no peer-reviewed
  study tests the construct. Adopt it as a **product convention or not at all**
  — never as physiology.
- **Velocity-based training needs a sensor, and even with one, 1RM from a
  load–velocity profile carries SEE% ≈ 9.8 % with a systematic +4.5 kg
  overestimate**; the meta-analysts' own recommendation is to measure 1RM
  directly ([Greig et al. 2023](https://doi.org/10.1007/s40279-023-01854-9)).
  Without a barbell sensor there is **nothing to implement**. §6 says why, so
  nobody builds it.
- **Progression and deload rules are almost entirely uncontrolled.** Adding load
  and adding reps produce the same adaptations
  ([Plotkin et al. 2022](https://doi.org/10.7717/peerj.14142)); the "three fails
  then cut 10 %" rule has **no trial of any kind**; the circulating deload
  numbers come from a **survey of what athletes do** (6.4 ± 1.7 days, every 5.6
  ± 2.3 weeks) and a **Delphi consensus**, and the two controlled deload trials
  found no benefit — one found a **strength cost**.
- **A strength anchor is per exercise, and `DisciplineProfile` structurally
  cannot hold it.** The recommendation in §9 is an `ExerciseThreshold` carrying
  ADR 0054's two provenance axes plus a stored **rep-max** so that `10RM` never
  round-trips through a fabricated 1RM. **Do not decay it** — but for a
  different reason than ADR 0054 §7 gives, because unlike the cardio case there
  _is_ detraining literature here. It measures **cessation**, not "training but
  untested", so it still licenses nothing. §9.5.

---

## 1. What a strength anchor is, and the four candidates

A cardio zone model is a ratio table over exactly one anchor
([`zones-and-thresholds.md`](./zones-and-thresholds.md) §1). Strength has the
same shape and a different set of anchors, and the anchors differ from FTP in
three structural ways that determine everything downstream:

| Property              | FTP / CP / LTHR                     | 1RM                                                                    |
| --------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| Cardinality           | One per discipline × metric         | **One per exercise** — as many as the athlete has tested lifts         |
| How it is observed    | Passively, from every recorded ride | **Only by a deliberate maximal attempt**, or estimated from a hard set |
| What the % table is   | A metabolic-domain surrogate        | A **mechanical** fraction with no metabolic meaning                    |
| Between-athlete drift | Zone edges vary with W′ and economy | The `%1RM ↔ reps` mapping varies by **fibre type, exercise, and lift** |

Four anchors are in play — **1RM**, **`nRM`** ("the heaviest load allowing
exactly _n_ reps"), **RIR/RPE**, and **mean bar velocity** — and
`workouts-strength-and-other.md` §4.1 already tabulates them with `%BW` and
absolute kg added; §3.3 below revisits the portability column with the accuracy
literature attached. What that table left open is the question this document
answers: **each of these is a number about the athlete, so where does the number
come from, how wrong is it, and how is it stored?**

One vocabulary point, because the literature is sloppy about it and a data model
cannot be. Three distinct things get called "1RM":

- **A measured 1RM** — a maximal attempt was performed and recorded.
- **An estimated 1RM** — a formula applied to a submaximal set. This is a
  _prediction with a standard error_, and §2 quantifies it.
- **A training max** — a deliberately reduced working figure. This is a
  **programming decision**, not a measurement of anything (§5).

Storing all three in one `Float` is the exact mistake ADR 0054 §2 corrected for
FTP-versus-CP, one layer down.

---

## 2. Estimating 1RM from a submaximal set

### 2.1 The formulas

Fourteen equations, transcribed verbatim from Table 2 of
[Mayhew et al. 2008](https://doi.org/10.1519/JSC.0b013e31817b02ad), where
`RepWt` is the load used and `RTF` the repetitions performed to fatigue:

```
Adams              1RM = RepWt / (1 − 0.02·RTF)
Berger             1RM = RepWt / (1.0261 − 0.00262·RTF)
Brown              1RM = (0.0338·RTF + 0.9849) · RepWt
Brzycki            1RM = RepWt / (1.0278 − 0.0278·RTF)          # ≡ RepWt · 36/(37 − RTF)
Cummings & Finn    1RM = 1.175·RepWt + 0.839·RTF − 4.29787
Kemmler            1RM = RepWt · (0.988 + 0.0104·RTF + 0.0019·RTF² − 0.0000584·RTF³)
Lander             1RM = RepWt / (1.013 − 0.0267123·RTF)
Lombardi           1RM = RTF^0.10 · RepWt
Mayhew et al.      1RM = RepWt / (0.522 + 0.419·e^(−0.055·RTF))
O'Conner et al.    1RM = RepWt · (1 + 0.025·RTF)                # ≡ RepWt · (1 + RTF/40)
Reynolds et al.    1RM = RepWt / (0.4847 + 0.5551·e^(−0.0723·RTF))   ⚠ see note
Tucker et al.      1RM = 1.139·RepWt + 0.352·RTF + 0.243
Wathen             1RM = RepWt / (0.488 + 0.538·e^(−0.075·RTF))
Welday             1RM = RepWt · (1 + 0.0333·RTF)               # ≡ RepWt · (1 + RTF/30)
```

Epley is not in Mayhew's table. Its canonical form is

```
Epley              1RM = RepWt · (1 + RTF/30)
```

— which is **algebraically identical to Welday's**, and the reason two names
circulate for one equation is that Welday's was reverse-engineered from a
published chart. Anyone comparing "Epley vs Welday" is comparing a formula with
itself.

⚠ **Typographic hazard, and it is load-bearing.** Mayhew's table prints Reynolds
as `RepWt/(0.5551 e^(−0.0723 RTF + 0.4847))`, with the `+ 0.4847` inside the
exponent. Read literally that is a different function from the form given above,
and it disagrees with the Wathen/Mayhew family it was clearly written to match.
I have rendered it in the family form and flagged it rather than silently
picking one. **Anyone implementing Reynolds must go to
[Reynolds et al. 2006](https://doi.org/10.1519/R-15304.1) directly** — where, in
any case, the paper's own recommendation is a plain linear equation from a 5RM
(§2.5), not this one.

Two families are visible once they are lined up:

- **Reciprocal-linear** (Adams, Berger, Brzycki, Lander, O'Conner,
  Welday/Epley): a straight line in `%1RM` against reps. Simple, and wrong at
  both ends — Brzycki divides by zero at 37 reps, and Adams at 50.
- **Exponential / power** (Mayhew, Wathen, Reynolds, Lombardi, Kemmler): a curve
  that flattens, which is the correct shape (§2.3). Mayhew's was fitted to 435
  college students (184 men, 251 women) on the bench press as
  `%1RM = 52.2 + 41.9·e^(−0.055·reps)`, and is the only one in the list with a
  documented empirical derivation of that size.

### 2.2 The provenance problem: most of these are not studies

This is the part the citation habit hides, and it should be stated in product
copy the moment a formula is used:

- **Epley (1985)** — a poundage chart in a resistance-training manual for
  athletes at the University of Nebraska, from which the formula was later
  extrapolated. Not a peer-reviewed study.
- **Brzycki (1993)** — a practitioner article in _JOPERD_, no reported sample or
  methodology.
- **Lander (1985)**, **O'Conner et al. (1989)**, **Lombardi (1989)**, **Wathen
  (1994)** — practitioner manuals, textbook chapters (Wathen's is a chapter in
  Baechle's _Essentials of Strength Training and Conditioning_), or small
  unpublished datasets.
- **Mayhew et al. (1992)** — the exception: a substantial sample, an explicitly
  fitted exponential model.

Provenance audit source: the literature review of
[Marzagão (preprint, 2026)](https://arxiv.org/abs/2603.17495), cross-checked
against Mayhew 2008 Table 2. ⚠ **A preprint by an employee of a commercial
training app** — §2.6.

The design consequence mirrors ADR 0054 §2 exactly: **a stored `estimatedOneRm`
that does not record which formula produced it is not reconstructible**, and the
formulas are not interchangeable at the individual level even where their group
means agree (§2.3).

### 2.3 The published error, three ways

**(a) Error grows with reps, sharply.** Mayhew et al. 2008 is the cleanest
demonstration because it reports the same equations over two rep windows in the
same 103 women. Percent error (mean ± SD of
`(predicted − actual)/actual × 100`), pre-training:

| Equation        | Over 2–30 reps  | Restricted to ≤ 10 reps |
| --------------- | --------------- | ----------------------- |
| Brzycki         | +26.7 ± 101.7 % | **−2.0 ± 10.5 %**       |
| Lander          | +22.9 ± 70.7 %  | **−1.1 ± 10.5 %**       |
| Cummings & Finn | +10.8 ± 16.9 %  | +1.1 ± 10.6 %           |
| Wathen          | +4.9 ± 10.5 %   | +0.7 ± 10.6 %           |
| Adams           | +2.9 ± 16.1 %   | −4.5 ± 9.1 %            |
| Mayhew et al.   | +1.2 ± 9.0 %    | +1.6 ± 9.4 %            |
| Lombardi        | −4.9 ± 9.7 %    | −0.9 ± 9.2 %            |
| O'Conner et al. | −2.1 ± 9.0 %    | −3.7 ± 9.1 %            |
| Berger          | −24.0 ± 9.4 %   | −17.4 ± 7.2 %           |

Read the table twice. The first reading is the headline: **the reciprocal-linear
equations are catastrophic over a wide rep range** — a ±100 % SD is not an
estimate, and it is exactly the divide-by-zero tail arriving. The second reading
is the one that matters for a product: **restricting to ≤ 10 reps fixes the mean
and leaves a ± 9–11 % individual SD in every single row.** Berger is _precise
and biased_ (−17 ± 7 %), which is worse than useless because it looks stable.

Corroboration from other designs:

- [Reynolds et al. 2006](https://doi.org/10.1519/R-15304.1): 70 adults (34 men,
  36 women, 18–69 y), bench press and leg press at 1, 5, 10 and 20RM. The **5RM
  gave the best prediction** (R² = 0.993 bench, 0.974 leg press; SEE 2.98 kg
  bench, **16.16 kg leg press**), and the authors conclude that **no more than
  10 repetitions** should be used in a linear equation. Anthropometry did not
  help.
- [Brechue & Mayhew 2012](https://doi.org/10.1519/JSC.0b013e318225eee3): 58
  college footballers, squat. Best from reps-to-failure at **80 % 1RM (5–17
  reps)**, error within **± 5 % in 95 % of subjects**.

**(b) Error differs by lift.** LeSuer, McCormick, Mayhew, Wasserstein & Arnold
(1997), _JSCR_ 11(4):211–213, tested seven equations on the bench press, squat
and deadlift in 67 untrained college students (40 men, 27 women). Correlations
were uniformly high (r > 0.95) and the absolute accuracy was not: the mean
difference was significantly non-zero for all but two equations in the bench
press, all but one in the squat, and — the finding worth carrying — **every
equation significantly underestimated the deadlift.**

The mechanism is visible in the rep data. In
[Nuzzo et al. 2024](https://doi.org/10.1007/s40279-023-01937-7)'s
meta-regression, at 70 % 1RM the **leg press** estimate is **19.0 reps [95 % CI
14.2–25.5]** against the **bench press**'s **14.1 [12.4–16.1]**; at 80 % it is
13.1 [9.8–17.5] against 8.8 [7.7–10.1]. A single conversion table applied to
both lifts is wrong by ~5 reps at 70 % — which, run backwards through any of
§2.1's equations, is a double-digit percentage error in the estimated 1RM.
Shimano et al. (2006) found the same ordering directly: at 60 % 1RM, trained and
untrained men completed significantly more reps in the **back squat** than in
the bench press or arm curl, i.e. **active muscle mass modulates repetition
capacity at matched relative intensity** (as reported in Mayhew 2008's
discussion and in the Marzagão review; ⚠ I did not read Shimano in full).

**(c) Error differs by training status — with a genuine conflict in the
literature.** Mayhew et al. 2008 measured the same women before and after 12
weeks: the group-mean reps at a fixed `%1RM` barely moved (12.5 → 13.1), but the
**individual** change was enormous (range −15 to +17 reps; pre-post correlation
only r = 0.66), and the change in reps correlated **negatively** with the change
in 1RM (r = −0.55). Getting stronger made these lifters _less_ rep-tolerant at
the same relative load — so an athlete's own conversion factor moves as they
train. Mayhew's discussion also records that **untrained** men performed
significantly more reps at 90 % 1RM than trained men.

Against that, Nuzzo et al. 2024 — 952 reps-to-failure tests, 7,289 individuals,
452 groups, 269 studies — reports that **sex, age and training status did not
clearly moderate** the `REPS ~ %1RM` relationship, and that **exercise was the
only moderator that mattered**. And Richens & Cleather's runners-versus-lifters
result (§3.1) is a training-status effect of enormous size.

**How to hold all three at once**, stated as my reading rather than as a
finding: exercise is the moderator that survives aggregation, because it is a
mechanical property of the movement and is coded identically across studies.
Training-status effects are real but **live in the tails** — Richens & Cleather
sampled two extreme populations on a single lift, while a meta-regression pools
recreationally-trained-versus-untrained contrasts that differ far less. Nuzzo's
null is a statement about the average study, not a statement that fibre-type
profile is irrelevant to an individual endurance athlete. The product-facing
consequence is the same either way, and it is the **between-individuals SD**,
not the mean: Nuzzo's model fits that SD as a **linear function of load,
decreasing as load rises**, which is the meta-analytic version of §3's whole
argument.

### 2.4 The criterion has its own error

[Grgic et al. 2020](https://doi.org/10.1186/s40798-020-00260-z), a systematic
review of 32 studies (pooled n = 1595): test–retest **ICC ranged 0.64–0.99
(median 0.97**, 92 % ≥ 0.90) and **CV ranged 0.5–12.1 % (median 4.2 %)**.

Two things follow. First, **a re-test that differs by 3 % is not evidence of
adaptation** — it is inside the noise, and any progression rule that fires on a
single measured 1RM difference is firing on noise. Second, **no estimator can be
validated below the criterion's own reliability**, so the honest ceiling on an
estimated 1RM is roughly "± 5 % if the set was ≤ 10 reps and genuinely close to
failure", and the observed ± 9–11 % SD in §2.3 says the estimators do not reach
that ceiling.

### 2.5 So: can a single formula be recommended?

**No formula can be recommended as _the_ formula.** What can be recommended is a
narrow protocol, and the recommendation is mostly about the inputs:

1. **Prefer not to convert at all.** If the athlete performed "8 reps at 70 kg
   to near-failure", the honest stored fact is an **8RM of 70 kg**. Every
   conversion to 1RM and back is a round trip through a ± 10 % transform. §9.2
   makes `repMax` a first-class stored construct for exactly this reason, and
   `workouts-strength-and-other.md` §14.3 reached the same conclusion from the
   authoring side (Rønnestad's `10RM → 4RM` is _defined_ in rep-maxes).
2. **If a conversion is unavoidable, gate it on reps ≤ 10** and refuse above it.
   That is Reynolds' own conclusion, Mayhew's, and Brechue's. Above ~12 reps the
   estimate is not low-confidence, it is **not an estimate** — the SD exceeds
   any difference the app would act on.
3. **Within that gate, choose from the exponential family**, and record the
   choice. Mayhew (`+1.6 ± 9.4 %` at ≤ 10 reps, and best-in-class over the wide
   range too), Wathen (`+0.7 ± 10.6 %`) and Lombardi (`−0.9 ± 9.2 %`) are the
   defensible three on this evidence. **Epley/Welday** (`RepWt·(1 + reps/30)`)
   is the pragmatic pick if a single well-known formula is wanted — it is
   near-unbiased at ≤ 10 reps in Mayhew's data (`+0.5 ± 10.2 %`) and it is what
   every other app uses, which matters for an athlete comparing numbers. It is
   also, per §2.2, a chart from a 1985 manual, and the UI should not imply
   otherwise.
4. **Avoid Berger** (systematically −17 %) and **Brzycki/Lander/Adams above 10
   reps** (divergent by construction).
5. **Never present the point estimate alone.** The defensible display is a band,
   and the band's width is the population SD of the chosen equation, not a
   pretty ± 2 %.

### 2.6 The one large-scale attempt, and why it does not settle it

[Marzagão (preprint, 2026)](https://arxiv.org/abs/2603.17495) is the only
analysis at app scale: 303,494 near-failure sets from 14,966 users across 388
exercises, drawn from the Fitbod app, proposing a conversion factor that varies
logarithmically with the weight lifted:

```
1RM = w · (1 + (r − 1)^0.85 / (−2.55 + 4.58·ln w))
```

It reports a 17–22 % reduction in inconsistency against all four classical
benchmarks (91 % of it from the weight-dependent factor), and its substantive
claim is that **the conversion factor increases with load** — at 10 kg lateral
raises each extra rep implies a larger fraction of maximal capacity than at 100
kg squats.

Three reasons this is a lead and not a result, all stated by the paper itself:
**there is no measured 1RM anywhere in the dataset** (the criterion is _internal
consistency_ between (weight, rep) pairs from the same user in the same 14-day
window, and a formula can be self-consistent and uniformly wrong); **the
near-failure filter is inferential** (an AMRAP flag or a within-workout rep
decline, against a population the paper itself notes trains 3–5 reps shy of
failure); and **logged weight means different things per equipment type**
(per-hand for dumbbells, total for barbells, stack setting for machines), which
makes `ln w` partly an equipment proxy.

It is nonetheless the best available evidence that **the rep–%1RM relationship
is exercise-specific in a way no classical equation captures**, converging with
Nuzzo's exercise moderator and LeSuer's deadlift finding. Treat as
**directional, low confidence, preprint, commercially interested.**

---

## 3. Why `% 1RM` is not portable below ~85 %

### 3.1 The primary source, verified — and one word to narrow

`portable-intensity-anchors.md` and [`README.md`](./README.md) both carry this
finding. The primary source is **Richens, B. & Cleather, D.J. (2014), "The
relationship between the number of repetitions performed at given intensities is
different in endurance and strength trained athletes", _Biology of Sport_
31(2):157–161,
[doi 10.5604/20831862.1099047](https://doi.org/10.5604/20831862.1099047)** (PMID
24899782). Verified against the abstract in full:

| Load     | Endurance runners (n = 8) | Weightlifters (n = 8) | p      |
| -------- | ------------------------- | --------------------- | ------ |
| 70 % 1RM | **39.9 ± 17.6**           | **17.9 ± 2.8**        | < 0.05 |
| 80 % 1RM | **19.8 ± 6.4**            | **11.8 ± 2.7**        | < 0.05 |
| 90 % 1RM | **10.8 ± 3.9**            | **7.0 ± 2.1**         | > 0.05 |

Design details the repo's summary omits and should carry: **the exercise is the
leg press**, the groups are **n = 8 each**, and the athletes are competitive
weightlifters against endurance runners — two deliberately extreme populations.

⚠ **The 90 % row is an underpowered null, not equivalence.** 10.8 versus 7.0
reps is a 54 % relative difference that failed to reach significance with eight
athletes per group; the SDs (3.9 vs 2.1) overlap heavily but the point estimates
do not. Every downstream statement in this corpus that reads "no difference at
90 %" should read **"the difference was not statistically significant at 90 %"**
— and the honest engineering conclusion is not "`%1RM` is portable at 90 %" but
"**the between-population gap narrows sharply as load rises, and at 90 % it is
small enough that this study could not resolve it.**" That is still enough to
justify §3.3's recommendation; it is not enough to justify treating `@ 90 % 1RM`
as an exactly transferable prescription.

### 3.2 The meta-analytic picture, which sharpens the same claim

[Nuzzo et al. 2024](https://doi.org/10.1007/s40279-023-01937-7) is the extension
the brief asked for. Its methodological contribution is precisely the thing
every older `%1RM ↔ reps` table lacks: it **estimates the between-individuals
standard deviation** alongside the mean, and models it explicitly.

- The mean relationship is best described by **natural cubic splines**, not by
  the linear or simple exponential forms every equation in §2.1 assumes.
- The between-individuals **SD is a linear function of load and decreases as
  load increases.** This is the portability claim in its most defensible form:
  the spread that makes 70 % unusable as a shared prescription is a measured,
  modelled quantity, and it shrinks toward the top of the range.
- **Bench press and leg press need their own tables**; everything else shares a
  main model, which is an admission of coverage rather than a finding of
  equivalence — the corpus is 42 % bench press and 14 % leg press, and **rows,
  overhead presses, deadlift variations and most isolation work have no
  validated exercise-specific mapping at all.**

### 3.3 So what _is_ the portable strength anchor, and over what range?

| Anchor              | Portable over                                   | Fails where                                             | Evidence quality                                                |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| **`nRM`** (`8RM`)   | **Everywhere, by definition**                   | Needs the athlete to find it, once, per exercise        | Definitional — nothing to validate                              |
| **RIR / RPE**       | **Everywhere in principle**; reliably ≤ 2–3 RIR | Far from failure, at light loads, and in novices (§4.3) | Good and unflattering: multiple accuracy studies, all imperfect |
| **Velocity loss %** | Everywhere, as a fatigue cap                    | Requires a sensor (§6)                                  | Strong: r = 0.91–0.97 against lactate/ammonia                   |
| **`% 1RM`**         | **≈ 85 % and above**                            | Below ~85 %, and worst for endurance-trained athletes   | Good, and consistent across three independent designs           |
| **`% bodyweight`**  | Bodyweight and calisthenic movements            | Loaded barbell work                                     | Convention                                                      |
| **Absolute kg**     | Nowhere across athletes                         | Everywhere                                              | —                                                               |

The practical ordering for this app's population, which
`workouts-strength-and-other.md` §4.4 already reached and this document now
underwrites with the accuracy literature:

- **Novice, no tested lifts:** prescribe **`nRM`**. It is self-calibrating,
  needs no introspection, and needs no stored anchor at all. This is the single
  most important recommendation in the document for the out-of-the-box case,
  because it is the only anchor that **works with an empty profile**.
- **Trained, no sensor:** **RIR** for effort, **`% 1RM`** for load in the heavy
  band once a 1RM exists.
- **Anywhere below 85 % 1RM:** `% 1RM` is a **starting load**, and the set's
  termination must be governed by something else (RIR, or a rep target the
  athlete is known to be able to hit).

---

## 4. RIR and RPE autoregulation

### 4.1 The scale

The Zourdos RIR-anchored RPE scale
([Zourdos et al. 2016, _JSCR_ 30(1):267–275, doi 10.1519/JSC.0000000000001049](https://doi.org/10.1519/JSC.0000000000001049))
is reproduced in `workouts-strength-and-other.md` §4.4 and not repeated here.
Its construction is the point: **RPE is _defined_ as a restatement of RIR** (RPE
10 = 0 RIR, RPE 9 = 1 RIR, …), so the scale is not a perception scale that
happens to correlate with proximity to failure — it is a proximity-to-failure
scale wearing a perception scale's numbering. Everything about its accuracy is
therefore a question about **how well people estimate reps in reserve**, not
about how well they perceive exertion.

### 4.2 What the validation study actually validated

Zourdos et al. 2016 tested 29 lifters (15 experienced, training age 5.2 ± 3.5 y;
14 novice, 0.4 ± 0.6 y) at 60, 75 and 90 % 1RM plus an 8-rep set at 70 %, with
mean velocity recorded throughout. Findings:

- Strong **inverse** velocity–RPE correlations: **r = −0.88** (experienced, p <
  0.001) and **r = −0.77** (novice, p = 0.001).
- Experienced lifters showed **slower velocity and higher RPE at 1RM** than
  novices, which the authors read as better efficiency at high intensities.
- Between-group velocity differences existed only at **100 % and 90 %** 1RM —
  not at 60 %, 75 %, or within the 70 % set.

**What that establishes:** the RPE report tracks an objective correlate of
effort, monotonically, in both groups. **What it does not establish:** that the
reported RIR equals the actual RIR. Zourdos' design measures the _association_
between the rating and velocity; it does not take the set to failure from the
reported RIR and count what was left. That is a different study, and §4.3 is
where those live.

This distinction matters for product copy. "Validated scale" is true and is
routinely used to imply an accuracy that has not been demonstrated.

### 4.3 Accuracy, and how it varies

The accuracy literature is consistent in direction and unflattering in
magnitude. **People underpredict how many reps they have left** — they stop
believing they are at failure while several reps remain.

| Study                                                              | Sample                                     | Finding                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Halperin et al. 2022](https://doi.org/10.1007/s40279-021-01559-x) | Meta-analysis, 12 studies, 414 subjects    | Participants **underpredicted reps to failure by ≈ 0.9 repetitions** across 262 effect sizes                                                                                                                 |
| [Steele et al. 2017](https://doi.org/10.7717/peerj.4105)           | 141 trainees, full-body session to failure | **SEM 2.64–3.38 reps** underprediction; accuracy tended to improve with experience; authors' own conclusion: "**RIR should be used cautiously**"                                                             |
| [Emanuel et al. 2022](https://doi.org/10.1186/s40798-022-00526-8)  | 259 certified coaches judging video        | Absolute error **4.8 / 2.0 / 1.2 reps** at 33 % / 66 % / 90 % through the set; worse for biceps curl (+1.43 reps), better at heavier loads (−1.17); **years of coaching experience had a negligible effect** |
| [Helms et al. 2017](https://doi.org/10.1519/JSC.0000000000002097)  | 12 powerlifters, self-selected loads       | Mean absolute deviation from the target RPE **0.33 ± 0.28 RPE** — i.e. trained lifters hit a prescribed RPE well                                                                                             |
| [Bastos et al. 2024](https://doi.org/10.1177/00315125241241785)    | Scoping review, 31 studies                 | RIR is "contextually feasible and useful"; **the prediction should be made close to task failure to increase accuracy**                                                                                      |
| [Paulsen et al. 2025](https://doi.org/10.7717/peerj.19797)         | 19 well-trained, 2,972 measurements        | Perceived RIR was systematically affected by **exercise, load, velocity-loss threshold and set number**; average r² with bar velocity only **0.3**                                                           |

Four regularities worth carrying into a design:

1. **Proximity dominates.** Every source that varied it found accuracy improving
   as the set approaches failure. A prescription of `RIR 4` is asking for a
   judgement at the point where the judgement is worst; `RIR 1–2` is asking at
   the point where it is best. Zourdos' own scale is coarsest exactly where
   accuracy is worst (RPE 5–6 spans "4 to 6 left").
2. **Load matters, in the same direction as §3.** Heavier loads → better RIR
   estimates. Qin 2025
   ([PMID 40133968](https://pubmed.ncbi.nlm.nih.gov/40133968/), already cited in
   `workouts-strength-and-other.md` §4.3) found both `%1RM`-to-failure and
   velocity-based estimates **overestimated intended RIR at 60 % 1RM** and were
   accurate at 80 %.
3. **Exercise matters.** Small single-joint movements (biceps curl) are judged
   worse than large compounds. Paulsen 2025 finds the velocity↔RIR mapping
   itself differs between squat and bench.
4. **Experience helps, and less than folklore claims.** Steele found a tendency,
   not a fix; Emanuel found coaching experience irrelevant to judging someone
   else's set. **Nobody has demonstrated that a novice can be trained into
   accurate RIR quickly.**

### 4.4 Does RIR-prescribed load actually beat percentage-prescribed load?

This is the question a product needs answered, and the answer is **no, not on
current evidence**:

- [**Helms et al. 2018**](https://doi.org/10.3389/fphys.2018.00247) is the
  cleanest test: 21 resistance-trained men, 8 weeks, squat + bench 3×/week in a
  daily-undulating format, **sets and repetitions matched**, differing only in
  whether load came from a `%1RM` table or from a target RPE. Both groups gained
  1RM (bench +9.6 vs +10.7 kg; squat +13.9 vs +17.1 kg) and muscle thickness;
  **between-group differences were non-significant.** Magnitude-based inference
  gave 57–79 % chances of a small effect-size advantage to RPE. ⚠
  Magnitude-based inference has since been widely criticised as a statistical
  method; read the significance test, not the "79 % chance".
- [**Graham & Cleather 2021**](https://doi.org/10.1519/JSC.0000000000003164)
  reports the opposite — its title states that RIR autoregulation "leads to
  greater improvements in strength over a 12-week training program than fixed
  loading". ⚠ **I read the title, journal and DOI only** (the abstract is empty
  in Europe PMC and the full text is paywalled). Note also what "fixed loading"
  means: a program that cannot adjust at all is a weaker comparator than a
  percentage table recalculated from a fresh 1RM, so this design tests
  _adjustment_ rather than _the RIR construct_.
- [**Shattock & Tee 2022**](https://doi.org/10.1519/JSC.0000000000003530)
  compared **subjective (RPE) against objective (velocity)** autoregulation in
  20 rugby players, volume-matched, crossover: both produced meaningful gains,
  with velocity favoured for countermovement jump (+8.2 % vs +3.8 %). ⚠ Also
  magnitude-based decisions.
- [**Greig et al. 2020**](https://doi.org/10.1007/s40279-020-01330-8) is the
  review that explains why the picture is thin: autoregulation has been a
  framework since the 1940s with **"limited systematic research investigating
  its broad utility"**, and the term is used inconsistently enough that findings
  do not synthesise.

**The defensible statement:** RIR prescription is **not superior** to percentage
prescription for the outcome, and its advantages are elsewhere — it needs **no
stored 1RM** (decisive for the out-of-the-box case), it **self-corrects** for
day-to-day readiness, and it produces **less negative affect** than training to
failure ([Refalo et al. 2025](https://doi.org/10.1002/ejsc.12266): more positive
general feelings for RIR than for failure), which is an adherence argument
rather than a physiological one.

### 4.5 The novice asymmetry, stated as a rule

Combining §4.3 and §4.4: **RIR is the anchor that needs no profile and the
anchor a beginner is worst at reporting.** The resolution is not to distrust RIR
but to **prefer `nRM` for novices** — "the heaviest load you can lift 10 times"
is a discoverable fact, not an introspective estimate — and to reserve RIR
prescriptions for the heavy, close-to-failure region where every accuracy study
says the judgement is best.

A corollary for anything that _reads_ a logged RIR as data: an athlete's
self-reported `RIR 2` is, on the pooled evidence, **closer to RIR 3** and could
be RIR 5. Any 1RM estimated from a set the athlete labelled `RIR 2` inherits
that bias, and it biases the estimate **downward** (they had more left than they
thought, so their true 1RM is higher). §9 does not attempt to correct for this,
and says why.

---

## 5. The training max

The 5/3/1 idea is to compute every working load from a **deliberate fraction of
the true 1RM** — canonically 90 % — so that the top set of a session is
repeatable rather than a max attempt.

**There is no evidence base. Stated plainly: none.** Searches of Europe PMC for
the construct, for the program, and for its author return nothing on the topic;
no trial manipulates the anchor's fraction, and no study compares training
computed from 90 % of 1RM against training computed from 100 %.

Its rationale, from the author's own site, is explicitly practical rather than
physiological: 90 % is described as a starting point that "guarantees that the
accumulation of fatigue throughout life and the program will never take you into
waters you cannot traverse", with a companion piece stating there is **"no hard
rule for your TM"** and that later programs may use 85 %, 80 % "or whatever"
([jimwendler.com, _The Training Max: What You Need to Know_](https://www.jimwendler.com/blogs/jimwendler-com/101082310-the-training-max-what-you-need-to-know)).

**What the science supports is the premise, not the number.** Day-to-day
performance varies (the whole premise of §4.4's literature); the 1RM test's own
CV is ~4 % (§2.4), so half of "100 % of 1RM" is unattainable on an average day;
and an estimated 1RM carries a ± 9–11 % SD (§2.3) while a load–velocity estimate
carries a **systematic +3.7 % overestimate** (§6). That last point is the real
argument and it is a measurement argument rather than a training one:
**computing working loads from an estimator that is biased high, with no buffer,
systematically overloads the athlete — and a buffer is the correct response to a
biased estimator.**

**Recommendation.** If a working fraction is implemented it should be a
**product convention documented as such** (not attributed to physiology),
**explicit and visible** rather than a silent multiplier — a silent one makes
every displayed `%1RM` a lie about what the athlete is lifting — and **stored
separately from the anchor**, so `estimatedOneRm = 120 kg` and
`workingFraction = 0.9` stay independently editable. Folding the fraction into
the stored anchor destroys the anchor.

⚠ The convention would also collide with the library:
`workouts-strength-and-other.md`'s maximal-strength phase prescribes ≥ 85 % 1RM,
and 85 % of a 90 % training max is **76.5 % of the true 1RM** — below the band
where `%1RM` is portable at all (§3). Either the fraction applies and the bands
must be restated against the training max, or the bands are true-1RM percentages
and the fraction must not silently apply to them. **Both are defensible; doing
both at once is not.**

---

## 6. Velocity-based training, briefly, and why not to build it

Two uses with very different evidential standing, both sketched in
`workouts-strength-and-other.md` §4.5. What this section adds is the accuracy
numbers and the hardware verdict.

**The load–velocity profile as a 1RM estimator.** Relative load and mean
concentric velocity are close to linear and stable within an individual;
González-Badillo & Sánchez-Medina (2010) reported R² = 0.98 in 120
strength-trained men on the bench press, holding after a 9.3 % rise in 1RM — so
velocity tracks _relative_ intensity regardless of absolute strength. The 1RM is
read off as the load at a **minimum velocity threshold** (MVT), conventionally
~0.30 m·s⁻¹ for the squat. The pooled accuracy is the thing to know:

- [**Greig et al. 2023**](https://doi.org/10.1007/s40279-023-01854-9), a
  systematic review and **individual-participant-data** meta-analysis: pooled
  **SEE% = 9.8 % (95 % CI 7.4–12.2)**, by lift **bench 8.5 kg / 9.9 %**,
  **deadlift 13.3 kg / 8.0 %**, **back squat 18.6 kg / 12.3 %**, with a
  systematic **overestimation of 4.5 kg (1.5–7.4)** ≈ **3.7 %**. Verbatim
  recommendation: "practitioners should incorporate direct assessment of 1RM
  wherever possible", with LVP reserved for "general monitoring".
- MVT choice dominates the residual error and a **general** MVT is not
  interchangeable with an **individual** one:
  [Chen et al. 2025](https://doi.org/10.1519/JSC.0000000000005040) found only
  the optimal MVT acceptably accurate across nine variants;
  [Dello Stritto et al. 2025](https://doi.org/10.3390/sports13070224) found 0.30
  m·s⁻¹ right for men and **0.25 for women**, with 0.40 underestimating in both.
- [Haff, García-Ramos & James 2020](https://doi.org/10.3390/sports8090129) found
  the profile **unacceptable** for the power clean — typical error exceeded the
  smallest worthwhile change.

So even with a transducer, an LVP-derived 1RM is **worse than the rep-based
estimators of §2.3**, biased high, and lift-dependent.

**Velocity loss as a stop rule** is the better-evidenced use: Sánchez-Medina &
González-Badillo 2011
([doi 10.1249/MSS.0b013e318213f880](https://doi.org/10.1249/MSS.0b013e318213f880))
found within-set velocity loss and CMJ-height loss correlated **r = 0.91–0.97**
with lactate and ammonia across 15 protocols, and
[Jukic et al. 2023](https://doi.org/10.1007/s40279-022-01754-4) reviews what
different thresholds do.

**Can an app without a barbell sensor use any of this? No.** Every quantity
above is a measurement of bar speed, and the obvious substitutes — phone camera,
wrist IMU — are not validated instruments for mean concentric velocity. Marston
et al. 2022
([doi 10.1371/journal.pone.0267937](https://doi.org/10.1371/journal.pone.0267937))
names the **monitoring device itself** as one of four factors determining
whether an LVP-derived 1RM is valid at all.

**Recommendation: build no velocity computation, and record that as a decision
rather than an omission.** Two narrow exceptions: `ExerciseSet`'s `LoadTarget`
already admits a **bar velocity** kind and a **`velocityLoss`** termination, and
keeping those **authorable, athlete-reported, never app-computed** costs nothing
— a coach with a GymAware can write `5 × 3 @ 0.9–1.1 m/s` and the app should
render it faithfully. And the perceived analogue ("stop when the reps visibly
slow") is what RIR already encodes, badly (Paulsen 2025: r² ≈ 0.3 against
measured velocity); it is not a substitute and must not be presented as one.

---

## 7. Progression and deload, as science rather than folklore

The sibling document covers what the beginner-barbell programs _say_. This
section covers what has been _tested_, and the honest summary is that the
progression rules in universal circulation have almost no controlled evidence
behind them.

### 7.1 Adding load every session

There is no trial of "add 2.5 kg every session until you can't". What exists is
the more general question, tested well:

- [**Plotkin et al. 2022**](https://doi.org/10.7717/peerj.14142) randomised 43
  trained individuals for 8 weeks to **increase load** with reps held constant,
  or **increase reps** with load held constant, across four lower-body
  exercises. Rectus femoris growth modestly favoured REPS (2.8 mm [90 % CI −0.5,
  5.8]); dynamic strength slightly favoured LOAD (2.0 kg [−2.4, 7.8]); every
  other outcome differed by less than the measurement noise. The authors'
  conclusion is that **both are viable**. So "progressive overload" does not
  require progressing _load_, and a program that adds reps is not a lesser
  program.
- The **dose–response** meta-analyses give the intensity and frequency at which
  gains are maximised, by training status:
  [Rhea et al. 2003](https://doi.org/10.1249/01.MSS.0000053727.63505.D4) (140
  studies, 1,433 effect sizes) — **untrained: 60 % 1RM, 3 d/wk**; **trained: 80
  % 1RM, 2 d/wk**; 4 sets per muscle group in both.
  [Peterson et al. 2004](https://doi.org/10.1519/R-12842.1) — **athletes: 85 %
  1RM, 2 d/wk, 8 sets**. These are meta-analytic optima for a _population_, not
  a progression rule for an individual, and they are frequently misread as the
  latter.
- **Periodisation beats no periodisation for 1RM**, modestly:
  [Williams et al. 2017](https://doi.org/10.1007/s40279-017-0734-y), 18 studies,
  81 effects, **ES 0.43 (95 % CI 0.27–0.58)**. ⚠ That meta-analysis drew a
  published critique arguing its comparators conflate "periodised" with "varied"
  ([Nunes et al. 2018](https://doi.org/10.1007/s40279-017-0824-x); authors'
  reply
  [doi 10.1007/s40279-017-0822-z](https://doi.org/10.1007/s40279-017-0822-z)),
  and a review of meta-analyses on the subject found that **none tested the
  predicted timing of the adaptations periodisation claims to schedule**
  ([Afonso et al. 2019](https://doi.org/10.3389/fphys.2019.01023)).

### 7.2 The three-fails rule

**No controlled evidence exists, for any variant.** Not for three, not for two,
not for a specific fraction to cut. The rule is a heuristic for detecting
stalling with a fixed sample size, and its statistical content is worth stating
because it is the part a data model can reason about: given the 1RM test's ~4 %
CV (§2.4) and the day-to-day variation the autoregulation literature is built
on, **a single failed session is uninformative and three consecutive ones are
reasonable evidence of a plateau.** That is a defensible design argument. It is
not a research finding, and it should not be dressed as one.

### 7.3 Deload percentages and frequency

The circulating numbers come from **surveys of practice and expert consensus**,
which is a legitimate source clearly labelled and a laundering hazard otherwise:

| Source                                                               | What it is                                         | What it reports                                                                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Rogerson et al. 2024](https://doi.org/10.1186/s40798-024-00691-y)   | Survey, 246 competitive strength/physique athletes | **All** deloaded. Duration **6.4 ± 1.7 days**, every **5.6 ± 2.3 weeks**. Volume ↓ (reps/set and sets/week), **frequency unchanged**, load ↓, effort ↓ via more RIR |
| [Bell et al. 2022](https://doi.org/10.3389/fspor.2022.1073223)       | Interviews, 18 coaches ≥ national level            | "No single method"; volume and effort are the levers; typically **5–7 days**                                                                                        |
| [Bell et al. 2023](https://doi.org/10.1186/s40798-023-00633-0)       | **Delphi consensus**, 34 → 21 coaches              | Design principles by agreement — expert opinion by construction, and the highest-quality evidence available on _how_ to deload                                      |
| [De Marco et al. 2024](https://doi.org/10.1519/JSC.0000000000004932) | Survey, 204 S&C coaches                            | Deload weeks: 1–2 sessions, 1–3 sets, 1–6 reps, **60–84 % 1RM**; most common volume reduction **0–25 %**                                                            |

**The two controlled trials that exist do not support a deload:**

- [**Coleman et al. 2024**](https://doi.org/10.7717/peerj.16777): 39
  resistance-trained adults, a **1-week deload at the midpoint of a 9-week
  program** versus continuous training. No differences in muscle size, local
  endurance or power — and the **continuous group gained more isometric and
  dynamic strength.**
- [**Pancar et al. 2026**](https://doi.org/10.1038/s41598-026-40612-5): 19
  untrained men, within-subject (limbs randomised), deload weeks at the midpoint
  and endpoint of 8 weeks. **No time × condition interactions** for muscle
  thickness or 10RM; all Δ 95 % CIs included zero.

**So:** deloading is universal in practice, its dose is entirely
practice-derived, and the two trials that tested it found no benefit with one
finding a strength cost. Nothing here says deloads are useless — both trials are
short, in one case untrained, and neither tested the case deloads are actually
for (a stalled athlete, or one accumulating fatigue across two training tracks).
It does say that **any specific percentage or cadence an app ships is a
convention, and the "10 % vs 20 %" question has no answer in the literature at
all.**

The most defensible thing to copy from practice is not a number but a **shape**,
because all four sources agree on it: **cut volume and effort, hold frequency,
keep exercise selection.** That shape has a mechanism behind it (§7.4) and it
happens to be exactly what an endurance athlete needs, because holding frequency
preserves the neuromuscular signal that Rønnestad's maintenance dose is built on
(`workouts-strength-and-other.md` §8).

### 7.4 Fatigue management — the one part that is measured

The fatigue side is better evidenced than the progression side, because it can
be measured acutely:

- [**Refalo et al. 2023**](https://doi.org/10.1186/s40798-023-00554-y): 24
  resistance-trained adults, six bench press sets at 75 % 1RM to failure, 1-RIR
  or 3-RIR. Lifting velocity 4 min post-exercise fell **−25 % (failure)** vs
  **−13 % (1-RIR)** vs **−8 % (3-RIR)**; at **24 h**, −3 % / −3 % / **+2 %**;
  differences gone by 48 h. Within-session velocity loss from first to final
  set: −22 % / −9 % / −6 %.
- Velocity loss as a within-set fatigue proxy is validated against metabolic
  markers at r = 0.91–0.97 (§6).

**This is the number that matters for an endurance athlete**, and it is the one
`workouts-strength-and-other.md` §3.3 flagged as the direction nobody schedules
for: a set taken to failure leaves a measurable neuromuscular deficit **at 24
hours**, and a set stopped at 3-RIR does not. If tomorrow is a quality run, the
RIR prescription _is_ the fatigue management.

### 7.5 The volume ratchet is already refuted — do not re-import it

`380-strength-volume-landmarks.md` §7 records two randomised trials
([Barsuhn et al. 2025](https://pubmed.ncbi.nlm.nih.gov/39665246/);
[Enes et al. 2024](https://doi.org/10.1007/s00421-024-05655-4)) that increased
weekly set volume relative to each lifter's own habitual volume and found **no
advantage**, with 1RM in Barsuhn's trial **greater in the maintenance group**.
ADR 0047 §7 already took the no-upward-ratchet position. Nothing in the
progression literature reviewed here disturbs that, and §7.1's finding that
adding reps works as well as adding load makes the ratchet even less necessary:
there are two other overload levers before volume.

---

## 8. Reps in reserve versus failure

The question is whether the last few reps are worth their fatigue cost. The
literature is unusually consistent:

**For strength: no advantage to failure.**

- [Grgic et al. 2022](https://doi.org/10.1016/j.jshs.2021.01.007), 15 studies:
  strength **ES = −0.09 (95 % CI −0.22 to 0.05)** — the point estimate mildly
  favours **non**-failure. In studies that did **not** equate volume,
  non-failure was significantly better (**ES = −0.32, −0.57 to −0.07**), i.e.
  when failure training costs you sessions, it costs you strength.
- [Robinson et al. 2024](https://doi.org/10.1007/s40279-024-02069-2), a series
  of meta-regressions treating proximity to failure as continuous (estimated
  RIR): in **all** best-fit strength models the confidence intervals for the RIR
  slope **contained the null**, "indicating a negligible relationship". ⚠ Read
  from the abstract; the paper also models hypertrophy separately and reports
  modest overall model fit, and I did not read that part in full.

**For hypertrophy: trivial at best.**

- [Refalo et al. 2023](https://doi.org/10.1007/s40279-022-01784-y), 15 studies:
  "set failure" (any definition) versus non-failure **ES = 0.19 (0.00–0.37), p =
  0.045** — statistically detectable, practically trivial, and unmoderated by
  volume load or relative load. Restricted to **momentary muscular failure**:
  **ES = 0.12 (−0.13–0.37), p = 0.343** — nothing. High versus moderate
  velocity-loss thresholds: **ES = 0.08**.
- Grgic 2022's overall hypertrophy estimate was **ES = 0.22 (−0.11 to 0.55)**,
  n.s.; a trained-subject subgroup favoured failure at **ES = 0.15**.

**For fatigue: a real, measured cost** — §7.4.

**For adherence: a cost too.**
[Refalo et al. 2025](https://doi.org/10.1002/ejsc.12266) found greater perceived
discomfort and session RPE for failure and more positive general feelings for
RIR training, over 8 weeks in trained lifters.

**The synthesis for this app is unusually clean.** For an endurance athlete
lifting to support running or cycling: **training to failure buys nothing
measurable in strength, close to nothing in hypertrophy, and costs a measurable
neuromuscular deficit that is still present 24 hours later.** Stopping at 2–3
RIR is not a compromise — on this evidence it is the better prescription, and it
is already what the library's phases prescribe.

One inversion worth flagging, because it is where the two literatures pull
apart: **RIR accuracy improves as you approach failure** (§4.3), so the
prescription with the best fatigue profile (`RIR 3`) is the one the athlete
estimates worst, and the prescription they estimate best (`RIR 0–1`) is the one
with the worst fatigue profile. There is no way to have both. `nRM` prescription
is the only anchor that escapes the trade-off, because it moves the judgement
from "how many do I have left" to "what load lets me do exactly ten", which is
discovered rather than estimated.

---

## 9. How a per-exercise strength anchor should be stored

### 9.1 The defect, restated precisely

`README.md` defect 7 and `workouts-strength-and-other.md` §14.3 record it;
verified against the current schema (uncommitted working tree, 2026-08-13):

- `ExerciseSet` now carries a **`load` `LoadTarget` union** — absolute kg,
  `%1RM`, a rep-max reference, bodyweight ± added, `%BW`, bar velocity — plus an
  **`effortCap`** union and termination kinds `toRir` / `velocityLoss`. The
  authoring side of `workouts-strength-and-other.md` §14.2 has shipped.
- **The referent has not.** `DisciplineProfile` holds `maxHr`, `lthr`, `ftp`,
  `runPowerThresholdW`, `thresholdPaceSecPerKm`, `cssSecPer100m`. No 1RM.
- `ThresholdEvent.kind` enumerates
  `maxHr | lthr | ftp | runPower | thresholdPace | css | weight`, where `weight`
  is bodyweight. It has **no exercise relation**, so it cannot hold a lift's
  anchor even if a `kind` were added.
- `DisciplineProfile`'s unique key is `[athleteProfileId, discipline]`. A squat
  1RM and a deadlift 1RM would have to be **the same row**. This is not a
  missing column; it is a **cardinality mismatch**, and it is the reason the gap
  has stayed open.

So `@ 85 % 1RM` and `@ 8RM` are both authorable today and both resolve to
nothing — the same shape as the pre-ADR-0054 cardio case, one level down.

### 9.2 The entity

`workouts-strength-and-other.md` §14.3 sketched `ExerciseThreshold`. This
document's §2 changes three things about it: the protocol vocabulary is longer,
the rep count is **not optional** for an estimate, and confidence joins as an
ordinal grade under ADR 0033.

```prisma
model ExerciseThreshold {
  id       String @id @default(cuid())

  /// **What was measured** — the construct, not the column. `oneRm` is a
  /// performed maximal attempt. `estimatedOneRm` is a formula's output and is a
  /// different claim with a ±9–11 % population SD. `repMax` is the heaviest load
  /// for exactly `reps` repetitions and is stored **directly**, never converted.
  construct String // "oneRm" | "estimatedOneRm" | "repMax"
  valueKg   Float

  /// The repetitions the value refers to. **Required** for `repMax` and for
  /// `estimatedOneRm` (the rep count is the single largest determinant of the
  /// estimate's error, §2.3); null for a measured `oneRm`.
  reps Int?

  /// **How it was arrived at.** A tested 1RM, an Epley estimate from a 5-rep
  /// set and a load–velocity extrapolation are three constructs with three
  /// error profiles — exactly the CP-vs-FTP case of ADR 0054 §2.
  protocol String // "tested" | "epley" | "brzycki" | "lombardi" | "mayhew" |
                  // "wathen" | "rep-max-observed" | "athlete-stated" | "provider"

  /// ADR 0033's ordinal grade, and **null where the athlete typed the number** —
  /// a figure somebody stated about themselves is not graded by the app.
  confidence String? // "high" | "medium" | "low"

  effectiveAt DateTime @default(now())
  createdAt   DateTime @default(now())

  exercise   Exercise @relation(fields: [exerciseId], references: [id])
  exerciseId String

  athleteProfile   AthleteProfile @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
  athleteProfileId String

  @@unique([athleteProfileId, exerciseId, construct, reps, effectiveAt])
  @@index([athleteProfileId, exerciseId])
}
```

Notes on the shape, each earning its place from a finding above:

- **`repMax` is a peer of `oneRm`, not a derivative.** §2.5 and
  `workouts-strength-and-other.md` §14.3 agree: converting an observed 8RM into
  a 1RM in order to render `@ 8RM` is a **fabrication round-trip** through a ±
  10 % transform, twice.
- **`reps` is required on an estimate** because the estimate's error is a
  function of it, and because a stored `estimatedOneRm` without its rep count
  cannot be re-derived, re-graded, or refused (§9.6).
- **The protocol is the formula name, not a trust label.** ADR 0054 §2's
  correction applies verbatim. `manual | inferred | auto` would group
  Epley-from-5 with Epley-from-20 and separate two tested 1RMs.
- **Effective-dated and append-only**, like `ThresholdEvent`. A strength anchor
  moves faster than an FTP — novices add load weekly — so the history is the
  interesting object, and ADR 0054's consequence about `effectiveAt` being
  written and never read applies here **before** the first row exists rather
  than after.
- **Exercise-scoped, which resolves the cardinality problem** and also makes the
  anchor's scope honest: a back squat 1RM says nothing about a front squat, and
  §2.3(b) is why.

### 9.3 Measured and estimated must never be coerced into one number

ADR 0054 §3 kept CP out of FTP's meaning while allowing it into FTP's column,
because no validated conversion exists. The strength case is the same and worse:

- A **tested** 1RM has CV ≈ 4 % (§2.4).
- An **estimated** 1RM from ≤ 10 reps has a **± 9–11 % individual SD** on top of
  that (§2.3a), plus a lift-specific bias (§2.3b), plus a downward bias from
  systematic RIR underprediction (§4.5).
- A **velocity-derived** 1RM has SEE% ≈ 9.8 % and a **+3.7 % systematic
  overestimate** (§6).

These are not three measurements of one quantity with different precision; the
third is biased in a known direction and the second is biased by the athlete's
own effort calibration. **A display that renders all three as "1RM: 120 kg" is
the exact failure ADR 0054 §3 exists to prevent.** The rule to copy is also from
ADR 0054 §3: the caveat sits **on the number**, in one phrase, with the argument
behind a tap — _"120 kg · estimated from 8 reps at 100 kg on 12 Mar"_.

### 9.4 Confidence, on which terms

ADR 0054 §5 grades on coverage, recency, maximality and residual. Three of those
four **do not exist here**, and the substitutes are different:

| ADR 0054 term    | Strength analogue                                                                                                        | Available?                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| **Coverage**     | How many distinct rep counts support the estimate (one 8-rep set vs a 3-rep and an 8-rep set agreeing)                   | Only with a per-set log (§9.7)              |
| **Recency**      | Days since the supporting set                                                                                            | **Yes, directly**                           |
| **Maximality**   | Was the set actually near failure                                                                                        | **No** — and it is worse than cardio's case |
| **Residual**     | Agreement between two estimates from different rep counts                                                                | Only with two sets                          |
| _(new)_ **Reps** | **The rep count itself is the dominant error term** — this is the strength-specific grading input and it has no analogue | **Yes**                                     |

The defensible grading, then:

- **`high`** — a tested 1RM, or a directly observed `repMax` at ≤ 5 reps, within
  the last ~8 weeks.
- **`medium`** — an estimate from a set of ≤ 6 reps explicitly marked at or near
  failure.
- **`low`** — an estimate from 7–10 reps, or an athlete-stated figure they did
  not test.
- **A refusal** above 10 reps — see §9.6.

On maximality, the honest statement is stronger than ADR 0054's. In cardio,
maximality is unverifiable but **inferable** — a genuinely maximal effort has
signatures (HR near max, decoupling, negative-split failure). In strength there
is **no signature at all** without bar velocity: a set of 8 at RIR 4 and a set
of 8 at RIR 0 are byte-identical in any data an app can collect. So the only
available source is the athlete's own report of proximity, which §4.3 shows to
be biased by ~1–3 reps. **Maximality here is not a weak signal; it is an absent
one**, and that argues for pushing the whole feature toward `repMax` — a fact
the athlete discovers — rather than toward estimation from ordinary sets.

### 9.5 Decay: check ADR 0054 §7's reasoning, and it survives — differently

ADR 0054 §7 declines a decay function on the grounds that **no literature
validates one**. For strength, that premise is **partly false**, and the
conclusion still holds. Both halves matter.

**What exists.** [Bosquet et al. 2013](https://doi.org/10.1111/sms.12047), a
meta-analysis of 103 studies, quantifies resistance-training **cessation**:
submaximal strength **SMD −0.62 (−0.80 to −0.45)**, maximal force **−0.46 (−0.54
to −0.37)**, maximal power **−0.20 (−0.28 to −0.13)**, with an identified
**dose–response between effect size and duration of cessation**, larger in
adults over 65 and in previously inactive people. This is a real decay curve, in
the right direction, with moderators.

**Why it still licenses nothing.** It measures **stopping**. The case a stale
anchor describes is an athlete who is **training and has not tested** — which is
the opposite population. Two further reasons specific to strength:

- The direction is **ambiguous, not merely uncertain.** A stale FTP is most
  likely stale in one direction for a given training pattern; a stale 1RM in a
  novice who has been adding load weekly is stale **low**, and a decay function
  would move it further from the truth. There is no defensible prior on the
  sign.
- `workouts-strength-and-other.md` §8 documents the other side: **1×/week
  maintains strength** (Rønnestad 2010/2011). An athlete lifting once a week has
  a valid anchor and no new test; a decay curve would penalise exactly the
  behaviour the evidence says preserves the quantity.

**So: freeze and flag, as ADR 0054 §7 does — and add a third option ADR 0054 did
not have.** A strength anchor has something an FTP does not: **the athlete logs
a hard set, with a load and a rep count, most weeks.** So the right response to
staleness is not to decay and not merely to nag, but to **re-estimate from the
most recent qualifying set** and show it as a proposal in ADR 0054's
derived-then-authored shape. That is strictly better than any time-based
function, because it is a measurement.

⚠ It requires something that does not exist: `workouts-strength-and-other.md`
§14.6 records that there is **no `ExerciseSetLog`** — a completed strength
session records nothing about what was lifted. **The strength anchor's estimator
is blocked on the actual-side set record, not on the anchor entity.** That is
the single most useful sequencing fact in this document.

### 9.6 A refusal is a first-class answer here too

ADR 0054 §5 makes a threshold estimate a discriminated union so that "we did not
look" and "we looked and there is nothing" say different things. The strength
refusals, and each one's reason:

| Refusal             | When                                                                                   | Why it is a refusal rather than a `low` grade                                                       |
| ------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `no-sets-logged`    | No set record exists for this exercise                                                 | Nothing was read (§9.5's blocker)                                                                   |
| `reps-out-of-range` | The best available set is > 10 reps                                                    | §2.3: the SD exceeds anything the app would act on. This is not uncertainty within a valid estimate |
| `effort-unknown`    | No proximity-to-failure information on the set                                         | §9.4: maximality has no signature in strength, so a set of unknown effort supports no estimate      |
| `exercise-unmapped` | The exercise has no validated rep↔load mapping and is not a compound the corpus covers | §3.2: rows, overhead presses and isolation work have none                                           |

ADR 0054's precedent is exact: a resolution-starved curve is refused rather than
graded `low`, because "a grade communicates uncertainty _within_ a valid fit; it
must not be asked to carry 'this is not a fit at all'."

### 9.7 Where ADR 0054's shape does **not** fit

The brief asked for this explicitly, and it is where the mirror breaks:

1. **There is no passive observation.** ADR 0054's whole machine is a
   mean-maximal curve built from telemetry the athlete produced without being
   asked. Strength has **no equivalent stream** — no `ActivityStream`, no
   downsampling problem, no `resolution` refusal. The input is a **logged set**
   that a human typed, and if they did not type it there is nothing. The ADR
   0020 supersede that ADR 0054 §6 turns on is **irrelevant** here.
2. **The estimator is one observation, not a fit.** CP comes from a regression
   over several durations with a residual; an estimated 1RM comes from **one
   (load, reps) pair through a closed-form formula**. There is no residual, so
   ADR 0054's fourth confidence term has no analogue — which is why §9.4
   substitutes the rep count.
3. **Cardinality inverts the storage decision.** ADR 0054 could defer a `cp`
   column because "nothing reads a CP except as an FTP proxy" and a column with
   no consumer is ADR 0037's mistake. Here the **consumer already exists and
   ships**: `LoadTarget`'s `pct1RM` and `repMax` arms are authorable now. The
   deferral argument runs the other way — this is a **reader waiting for a
   writer**, not a writer waiting for a reader.
4. **There is no `provider` pre-fill worth having.** ADR 0054 §8 handles a
   connected account's eFTP as an offer. No integration in this repo carries a
   per-exercise 1RM, and the ones that could (a lifting app's estimate) would be
   another app's Epley applied to another app's set. If `protocol: 'provider'`
   exists here it should exist unused, for the same reason.
5. **The anchor is not the only thing needed, and may not be the first thing
   needed.** ADR 0054 closed the cardio gap because a threshold was the _only_
   missing referent. Here, §3.3's recommendation is that the **novice case is
   served by `nRM`, which needs no anchor at all** — so the highest-value work
   may be making `@ 10RM` render and log well, with `ExerciseThreshold`
   following for the trained athlete who wants `@ 85 % 1RM`. That ordering is
   the opposite of the cardio feature's.

---

## Implications for trainm8

Read against `CONTEXT.md`, `prisma/schema.prisma` (`ExerciseSet`,
`DisciplineProfile`, `ThresholdEvent`), `app/utils/workout-schema.ts`
(`LoadTarget`, `EffortCap`), and ADRs 0046, 0047, 0054.

**The design the evidence supports, in one paragraph.** A strength anchor is a
`{construct, protocol, value, reps, effective date}` tuple **scoped to one
exercise** — a tested 1RM, an Epley estimate from a 5-rep set and a
load–velocity extrapolation are three different numbers for the same lift with
different biases, and the estimate's error is dominated by the rep count it came
from, so the rep count is part of the value rather than metadata about it. A
rep-max is stored directly and never round-tripped through a 1RM. Above ten reps
the app **refuses** rather than grades. `% 1RM` is offered as a prescription
only in the heavy band, `nRM` is the anchor for anyone without a tested lift,
RIR is the effort cap and is trusted most near failure and least in novices,
velocity is authorable and never computed, and no anchor decays on a curve — it
freezes, flags, and offers a fresh reading from the athlete's next logged hard
set. Almost none of that exists yet, and the blocker is not the anchor entity:
it is that a completed strength session records nothing about what was lifted.

### What already lines up with the evidence

- **Strength carries no TSS and progresses by hard-set counting** (ADR 0046,
  0047 §2). Confirmed again from a different direction: every quantity in this
  document is per-set or per-exercise, and nothing in the 1RM/RIR literature
  offers a session-level intensity scalar that could be normalised.
- **`ExerciseSet`'s `LoadTarget` union with six arms, and `effortCap` orthogonal
  to it** (ADR 0007, amended). Vindicated. §3.3's anchor table maps onto those
  arms one-for-one, including the two — `repMax` and bar velocity — that no
  simpler shape could have expressed. `toRir` and `velocityLoss` as termination
  kinds are the same win: §7.4's fatigue result is only expressible as a
  termination rule.
- **`ThresholdEvent`'s `construct` / `protocol` / `confidence` split** (ADR 0054
  §2). The strength case is a stronger argument for it than the cardio case was:
  there are **six** named formulas in circulation, they disagree by more than CP
  disagrees with FTP, and four of the six are not peer-reviewed derivations at
  all.
- **`confidence` null where the athlete typed it** (ADR 0054 §2). Correct here
  too, and it is the reason `protocol: 'athlete-stated'` needs to exist: "I
  squat about 120" is a claim, not a graded estimate.
- **The no-upward-ratchet rule** (ADR 0047 §7). Unchallenged, and §7.1
  strengthens it.
- **ADR 0033's ordinal confidence over a score.** Reused unchanged. Nothing in
  §2's error data justifies a finer grade than three levels — the error is a
  population SD, not a per-athlete quantity.

### Gaps, roughly in priority order

1. **There is no `ExerciseSetLog`, and it blocks everything else here.** A
   completed strength session records nothing about what was lifted, so: no
   estimator has an input (§9.5), `coverage` and `residual` confidence terms
   cannot exist (§9.4), progression cannot be detected, and the three-fails rule
   has nothing to count. `workouts-strength-and-other.md` §14.6 already asked
   for it; this document makes it the **critical path** rather than a
   nice-to-have. Its minimum shape is
   `{exerciseId, load, reps, rir?, completedAt}` — and the optional `rir` is
   what turns a logged set into an estimator input at all.
2. **`pct1RM` and `repMax` are authorable and resolve to nothing.** Add
   `ExerciseThreshold` (§9.2). Note the two arms fail differently: `%1RM` needs
   a 1RM, while **`repMax` needs nothing** — `@ 8RM` is a complete instruction
   to the athlete and could render honestly today. **Ship `repMax` resolution
   first**; it is free and it is the novice path (§3.3).
3. **No 1RM estimator, and when one is written it must be gated at ≤ 10 reps.**
   §2.5 is the recipe: exponential family, formula recorded in `protocol`, rep
   count stored, refusal above the gate. The gate is not a nicety — Brzycki at
   20 reps is a 100 % SD.
4. **`ThresholdEvent` cannot express a per-exercise anchor and should not be
   extended to try.** Its `kind` has no lift and it has no exercise relation,
   and `DisciplineProfile`'s `[athleteProfileId, discipline]` key structurally
   forbids one (§9.1). This is the one place where the cardio shape must be
   **copied rather than reused**.
5. **ADR 0047 §3's Strength Goal derives a `%1RM` band, and below 85 % that band
   is not portable.** `workouts-strength-and-other.md` §14.4 already recommends
   amending the enum to five values. §3 adds a second, independent reason to
   touch the same derivation: the `anatomical-adaptation` and `hypertrophy`
   goals sit in the band where `%1RM` **does not travel between athletes**, so
   those goals should derive an **RIR or `nRM`** prescription and only
   `maximal-strength` should derive a `%1RM` one. That is a change to what the
   derivation table produces, not to the goal vocabulary.
6. **If a training max is implemented, it must be visible and stored
   separately** (§5), and the collision between an 85 % band and a 90 % training
   max must be resolved explicitly rather than by multiplication.
7. **Nothing should compute bar velocity, and that should be written down.** §6.
   The union's velocity arm stays authorable and athlete-reported. Writing the
   refusal into an ADR is cheaper than someone building a phone-camera velocity
   estimator in eighteen months.
8. **No deload concept anywhere, and the evidence does not support inventing a
   numeric one.** If a deload ships, copy the **shape** all four practice
   sources agree on (cut volume and effort, hold frequency, keep exercises) and
   label the duration and cadence as conventions with the survey means attached
   (6.4 ± 1.7 days, every 5.6 ± 2.3 weeks) — not as a finding (§7.3).
9. **`effectiveAt` will be written and not read, again.** ADR 0054's consequence
   section flags this for `ThresholdEvent`. A strength anchor moves faster than
   an FTP, so an as-of-date resolver matters sooner here — and it should be
   designed **before** the first `ExerciseThreshold` row exists, not after.
10. **The RIR bias is real and should not be silently corrected.** An athlete's
    `RIR 2` is on average nearer RIR 3 (§4.3). It would be easy to add a
    correction constant; it would also be a number about this athlete that
    nobody measured, applied to their own self-report. Prefer surfacing the
    caveat to adjusting the input.

### ADRs this research challenges

| ADR                                                                     | What it decided                                                               | What the evidence says                                                                                                                                                                                                                                                                                      | Verdict                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **0046** — no load number spans incommensurable tracks                  | Strength carries no TSS; hard-set counting is the currency                    | Confirmed from a third direction. Nothing in the 1RM, RIR or velocity literature offers a normalisable session-level intensity for lifting                                                                                                                                                                  | **Confirm**                  |
| **0047 §2, §4, §7** — hard sets, 2/1/0.5 per week, no upward ratchet    | The strength track's currency, dose and progression rule                      | Confirmed. §7.1 adds that reps and load are interchangeable overload levers, which makes the volume ratchet even less necessary                                                                                                                                                                             | **Confirm**                  |
| **0047 §3** — a Strength Goal derives a `%1RM` band and a rep range     | Three goals; band and reps derived from the goal                              | Amend, for a second reason beyond the enum's coverage: below ~85 % `%1RM` is not portable between athletes (§3), so the sub-maximal goals should derive **RIR or `nRM`**, not a percentage band                                                                                                             | **Amend**                    |
| **0007** — `ExerciseSet` as a union with a `LoadTarget` and `effortCap` | Six load kinds, orthogonal effort cap, `toRir` / `velocityLoss` termination   | Confirmed and vindicated. `repMax` and velocity-loss termination are unexpressible in any simpler shape, and §7.4's fatigue finding is a termination rule                                                                                                                                                   | **Confirm**                  |
| **0002** — a Step Quantity is one of three                              | Duration, distance, vertical on `WorkoutStep`                                 | Untouched. A strength set's quantities live on `ExerciseSet`, and this document adds no fourth step quantity — the ground-contact request in `workouts-strength-and-other.md` §14.6 stands separately                                                                                                       | **Confirm (out of scope)**   |
| **0005** — thresholds on `DisciplineProfile`, history in an event log   | Current value per `[athleteProfileId, discipline]`; append-only event log     | **Cannot hold a strength anchor.** 1RM is per _exercise_; the unique key forbids it and `ThresholdEvent` has no exercise relation. Needs a **sibling entity**, not a widened enum (§9.1)                                                                                                                    | **Amend**                    |
| **0054 §2** — provenance is construct and protocol                      | `construct` / `protocol` / `confidence`, `confidence` null when athlete-typed | Confirmed, and the strength case is the stronger argument: six named formulas, four of them not peer-reviewed, disagreeing by more than CP disagrees with FTP                                                                                                                                               | **Confirm and generalize**   |
| **0054 §5** — every rung answers; a refusal is first-class              | Discriminated estimate union with named refusals                              | Confirmed and extended: `reps-out-of-range`, `effort-unknown` and `exercise-unmapped` are the strength refusals, and **maximality is not weakly observable here but absent** (§9.4)                                                                                                                         | **Confirm and extend**       |
| **0054 §6** — ADR 0020's grid produces a refusal                        | Sample-floor refusals from the display-grid resolution                        | **Does not apply.** Strength has no stream; the input is a typed set. The ADR 0020 supersede is orthogonal to this feature                                                                                                                                                                                  | **Out of scope**             |
| **0054 §7** — a stale estimate freezes and is flagged, never decayed    | No literature validates a decay function                                      | **Right conclusion, wrong premise here.** Detraining literature _does_ exist (Bosquet 2013, dose–response with cessation duration) — but it measures cessation, not "training but untested", and the sign of the error is ambiguous. Freeze, flag, and **re-estimate from the next logged hard set** (§9.5) | **Confirm, amend reasoning** |
| **0033** — confidence is an ordinal grade                               | `high \| medium \| low`, never a score                                        | Confirmed. The dominant grading input differs (rep count, not fit residual), and three levels are all the error data supports                                                                                                                                                                               | **Confirm**                  |
| **0008** — Unavailable Metric over a fabricated one                     | Refuse rather than guess                                                      | Confirmed at a new site: `@ 85 % 1RM` with no stored 1RM must read as unavailable, and an estimate from a 20-rep set must too                                                                                                                                                                               | **Confirm**                  |

---

## Claims this document declines to launder

- **"Your estimated 1RM is 118 kg."** Not from one set, not as a number, and not
  without the rep count and formula attached. The defensible form is a band
  whose width is the ± 9–11 % population SD of the chosen equation — and above
  ten reps there is no defensible form at all.
- **"Epley's formula" as science.** It is a poundage chart from a 1985
  University of Nebraska training manual, back-fitted into an equation.
  Brzycki's is a practitioner article with no reported sample. Using them is
  fine; citing them as research is not.
- **"`% 1RM` is portable at 90 %."** Richens & Cleather's 90 % row is a
  **non-significant difference with eight athletes per group** (10.8 vs 7.0
  reps), not demonstrated equivalence. The narrowing of the gap with load is
  well supported; the equality at the top is not established, and this corpus's
  own summary should be reworded.
- **"The RIR scale is validated."** Zourdos 2016 validated that RPE reports
  track bar velocity monotonically (r = −0.88 / −0.77). It did **not** validate
  that a reported RIR equals the actual RIR — the studies that tested that found
  errors of ~1 to ~3 reps, worse far from failure and worse in small movements.
- **"RIR-based training beats percentage-based training."** The one trial with
  sets and reps matched found **no significant difference** (Helms 2018). The
  trial that favours RIR compared it against **fixed** loading, which tests
  adjustment rather than the construct, and I could not read its numbers.
- **"90 % is the right training max."** It is a starting point in a
  self-published program whose author states there is no hard rule. The
  _existence_ of a buffer is defensible on measurement grounds (§5); the
  fraction is a convention.
- **"Deload by 10 % every fourth week."** No trial supports any specific
  percentage or cadence. The numbers in circulation are the means of a survey of
  what 246 athletes reported doing, and the two controlled trials of a deload
  found no benefit — one found a strength cost.
- **"Add 2.5 kg every session; after three failures, cut 10 %."** Neither half
  has been tested. The three-fails rule is defensible as **noise rejection**
  given the 1RM test's ~4 % CV; presenting it as a training finding launders a
  reasonable heuristic into evidence.
- **A phone-camera or wrist-IMU bar velocity.** The validated instruments in
  this literature are linear position transducers and a small set of
  accelerometers, and device choice is one of four factors determining whether
  an LVP-derived 1RM is valid at all. An unvalidated velocity is not a
  low-confidence velocity.
- **A decay curve on a stale 1RM.** Bosquet 2013 is a real decay curve for
  training **cessation**, and applying it to an athlete who is training but
  untested would move a novice's anchor in the wrong direction. Freeze, flag,
  and ask for a set.
- **Correcting a logged RIR by the population bias.** The bias is real (~1–3
  reps). A correction constant applied to somebody's self-report is a number
  about this athlete that nobody measured — `zones/defaults.ts:10`'s rule, one
  level down.
- **The Fitbod preprint's weight-dependent formula as a solved problem.** Its
  optimisation criterion is internal consistency with **no measured 1RM anywhere
  in the dataset**, its near-failure filter is inferential, and its `ln w` term
  is partly an equipment proxy. Directionally interesting; not a validated
  estimator.

---

## Uncertainty and limitations

- **Three sources were read at abstract or title level only**, and each is
  flagged where used: Graham & Cleather 2021 (title, journal and DOI only — the
  abstract is empty in Europe PMC and the full text paywalled), Robinson et al.
  2024's hypertrophy models (the strength result is verbatim from the abstract;
  the hypertrophy dose–response is not), and Shimano et al. 2006 (read via two
  secondary descriptions that agree).
- **Two of the strongest results rest on magnitude-based inference** (Helms
  2018's "79 % chance of a small advantage", Shattock & Tee 2022's whole
  analysis). MBI has been substantially criticised as a statistical method; I
  have quoted the significance tests and flagged the MBI claims rather than
  dropping the studies.
- **The `%1RM ↔ reps` evidence is a bench-press-and-leg-press literature.**
  Nuzzo 2024's own corpus is 42 % bench press and 14 % leg press. **Rows,
  overhead presses, deadlift variations, split squats and every isolation
  movement have no validated exercise-specific mapping** — which is most of a
  real strength session, and the reason §9.6 makes `exercise-unmapped` a
  refusal.
- **The training-status conflict in §2.3(c) is resolved by argument, not by
  data.** Nuzzo's null moderator and Richens & Cleather's large effect are both
  credible; my reading that training status lives in the tails while exercise
  survives aggregation is a synthesis, not a finding. Someone should check
  whether an endurance-trained subgroup exists in Nuzzo's data.
- **No paper found addresses the case this app actually has**: estimating a lift
  anchor from unsupervised, self-logged sets of unknown proximity to failure.
  The only attempt is the preprint in §2.6, and its own limitations are the
  reason it cannot settle it. Every confidence threshold in §9.4 is therefore
  reasoned from the supervised literature's error bars, not measured in this
  setting.
- **The rep gate of 10 is a rounding of three converging recommendations**
  (Reynolds' "no more than 10", Mayhew's ≤ 10 split, Brechue's 5–17 at 80 %),
  not a validated cut point. A gate of 8 or 12 would be equally defensible; what
  is not defensible is having no gate.
- **Nothing here addresses the interaction with endurance training load**, which
  is where an endurance-athlete app actually needs it. §7.4's 24-hour velocity
  deficit is the closest thing to a bridge, and it is measured on bar velocity
  rather than on running or cycling performance.
- **Sex is treated as a non-moderator on Nuzzo's authority**, and there is one
  contrary signal worth watching: the MVT literature finds different optimal
  thresholds for men and women (0.30 vs 0.25 m·s⁻¹), and Refalo 2023 found
  greater post-failure velocity loss in men (−29 %) than women (−21 %).

---

## References

Primary and near-primary sources, grouped. DOIs given where they exist.

**1RM estimation and its error**

- Mayhew et al. (2008) —
  [Accuracy of prediction equations for determining 1RM bench press in women before and after resistance training, _JSCR_ 22(5):1570–1577](https://doi.org/10.1519/JSC.0b013e31817b02ad)
  — Table 2 is §2.1's equation list; Tables 3–4 the error data
- LeSuer et al. (1997) — The accuracy of prediction equations for estimating
  1-RM performance in the bench press, squat, and deadlift, _JSCR_ 11(4):211–213
  ([record](https://journals.lww.com/nsca-jscr/abstract/1997/11000/the_accuracy_of_prediction_equations_for.1.aspx))
- Reynolds et al. (2006) —
  [Prediction of 1RM strength from multiple repetition maximum testing and anthropometry, _JSCR_ 20(3):584–592](https://doi.org/10.1519/R-15304.1)
- Brechue & Mayhew (2012) —
  [Lower-body work capacity and 1RM squat prediction in college football players, _JSCR_ 26(2):364–372](https://doi.org/10.1519/JSC.0b013e318225eee3)
- Mayhew et al. (2011) —
  [Impact of testing strategy on upper-body work capacity and 1RM prediction, _JSCR_ 25(10):2796–2807](https://doi.org/10.1519/JSC.0b013e31822dcea0)
- Grgic et al. (2020) —
  [Test–retest reliability of the 1RM strength assessment: a systematic review, _Sports Med Open_ 6:31](https://doi.org/10.1186/s40798-020-00260-z)
- Marzagão (2026, **preprint**) —
  [A weight-dependent 1RM prediction equation optimized on 303,494 near-failure sets across 388 exercises](https://arxiv.org/abs/2603.17495)
  · [SportRxiv mirror](https://sportrxiv.org/index.php/server/preprint/view/768)

**The repetitions–%1RM relationship**

- Richens & Cleather (2014) —
  [The relationship between the number of repetitions performed at given intensities is different in endurance and strength trained athletes, _Biol Sport_ 31(2):157–161](https://doi.org/10.5604/20831862.1099047)
- Nuzzo et al. (2024) —
  [Maximal number of repetitions at percentages of the 1RM: a meta-regression and moderator analysis, _Sports Med_ 54:303–321](https://doi.org/10.1007/s40279-023-01937-7)
- Currier et al. (2026) — ACSM position stand, _MSSE_ 58(4):851–872,
  [doi 10.1249/MSS.0000000000003897](https://doi.org/10.1249/MSS.0000000000003897)
  (already this repo's authority via ADR 0047 §3)

**RIR, RPE and autoregulation**

- Zourdos et al. (2016) —
  [Novel resistance training-specific RPE scale measuring repetitions in reserve, _JSCR_ 30(1):267–275](https://doi.org/10.1519/JSC.0000000000001049)
- Halperin et al. (2022) —
  [Accuracy in predicting repetitions to task failure: a scoping review and exploratory meta-analysis, _Sports Med_ 52:377–390](https://doi.org/10.1007/s40279-021-01559-x)
- Steele et al. (2017) —
  [Ability to predict repetitions to momentary failure is not perfectly accurate, though improves with experience, _PeerJ_ 5:e4105](https://doi.org/10.7717/peerj.4105)
- Emanuel et al. (2022) —
  [Seeing effort: coaches' prediction of repetitions in reserve before task-failure, _Sports Med Open_ 8:132](https://doi.org/10.1186/s40798-022-00526-8)
- Helms et al. (2017) —
  [Self-rated accuracy of RPE-based load prescription in powerlifters, _JSCR_ 31(10):2938–2943](https://doi.org/10.1519/JSC.0000000000002097)
- Helms et al. (2018) —
  [RPE vs. percentage 1RM loading in periodized programs matched for sets and repetitions, _Front Physiol_ 9:247](https://doi.org/10.3389/fphys.2018.00247)
- Graham & Cleather (2021) —
  [Autoregulation by "repetitions in reserve" leads to greater improvements in strength than fixed loading, _JSCR_ 35(9):2451–2456](https://doi.org/10.1519/JSC.0000000000003164)
  ⚠ title/DOI only
- Shattock & Tee (2022) —
  [Autoregulation in resistance training: subjective versus objective methods, _JSCR_ 36(3):641–648](https://doi.org/10.1519/JSC.0000000000003530)
- Greig et al. (2020) —
  [Autoregulation in resistance training: addressing the inconsistencies, _Sports Med_ 50:1873–1887](https://doi.org/10.1007/s40279-020-01330-8)
- Bastos et al. (2024) —
  [Feasibility and usefulness of RIR scales for selecting exercise intensity: a scoping review, _Percept Mot Skills_ 131(3):940–970](https://doi.org/10.1177/00315125241241785)
- Paulsen et al. (2025) —
  [Exercise type, load, velocity loss threshold and sets affect the lifting-velocity ↔ perceived-RIR relationship, _PeerJ_ 13:e19797](https://doi.org/10.7717/peerj.19797)

**Failure, proximity to failure, and fatigue**

- Grgic et al. (2022) —
  [Resistance training to repetition failure or non-failure on strength and hypertrophy: systematic review and meta-analysis, _J Sport Health Sci_ 11(2):202–211](https://doi.org/10.1016/j.jshs.2021.01.007)
- Refalo et al. (2023) —
  [Influence of proximity-to-failure on skeletal muscle hypertrophy: systematic review with meta-analysis, _Sports Med_ 53:649–665](https://doi.org/10.1007/s40279-022-01784-y)
- Robinson et al. (2024) —
  [Dose–response between estimated proximity to failure, strength gain, and hypertrophy: a series of meta-regressions, _Sports Med_ 54:2209–2231](https://doi.org/10.1007/s40279-024-02069-2)
- Refalo et al. (2023) —
  [Influence of proximity-to-failure, determined by RIR, on neuromuscular fatigue, _Sports Med Open_ 9:10](https://doi.org/10.1186/s40798-023-00554-y)
- Refalo et al. (2025) —
  [The effect of proximity-to-failure on perceptual responses, _Eur J Sport Sci_ 25:e12266](https://doi.org/10.1002/ejsc.12266)

**Velocity-based training**

- Sánchez-Medina & González-Badillo (2011) —
  [Velocity loss as an indicator of neuromuscular fatigue during resistance training, _MSSE_ 43(9):1725–1734](https://doi.org/10.1249/MSS.0b013e318213f880)
- Jukic et al. (2023) —
  [Acute and chronic effects of velocity loss thresholds: systematic review, meta-analysis and critical evaluation, _Sports Med_ 53:177–214](https://doi.org/10.1007/s40279-022-01754-4)
- Greig et al. (2023) —
  [Predictive validity of individualised load-velocity relationships for predicting 1RM: systematic review and IPD meta-analysis, _Sports Med_ 53:1693–1708](https://doi.org/10.1007/s40279-023-01854-9)
- Marston et al. (2022) —
  [Load-velocity relationships and predicted maximal strength: validity and reliability of current methods, _PLoS One_ 17(10):e0267937](https://doi.org/10.1371/journal.pone.0267937)
- Chen et al. (2025) —
  [Estimating the free-weight back squat 1RM from the 2-point method and optimal minimal velocity threshold, _JSCR_ 39(4):e530–e537](https://doi.org/10.1519/JSC.0000000000005040)
- Dello Stritto et al. (2025) —
  [How does load selection and sex influence 1RM prediction using the MVT during free-weight back squat?, _Sports_ 13(7):224](https://doi.org/10.3390/sports13070224)
- Haff, García-Ramos & James (2020) —
  [Using velocity to predict the maximum dynamic strength in the power clean, _Sports_ 8(9):129](https://doi.org/10.3390/sports8090129)

**Progression, periodisation and deloading**

- Plotkin et al. (2022) —
  [Progressive overload without progressing load? Load or repetition progression, _PeerJ_ 10:e14142](https://doi.org/10.7717/peerj.14142)
- Rhea et al. (2003) —
  [A meta-analysis to determine the dose response for strength development, _MSSE_ 35(3):456–464](https://doi.org/10.1249/01.MSS.0000053727.63505.D4)
- Peterson, Rhea & Alvar (2004) —
  [Maximizing strength development in athletes: dose–response meta-analysis, _JSCR_ 18(2):377–382](https://doi.org/10.1519/R-12842.1)
- Williams et al. (2017) —
  [Periodized vs non-periodized resistance training on maximal strength: a meta-analysis, _Sports Med_ 47:2083–2100](https://doi.org/10.1007/s40279-017-0734-y)
  · critique: [Nunes et al. 2018](https://doi.org/10.1007/s40279-017-0824-x) ·
  [reply](https://doi.org/10.1007/s40279-017-0822-z)
- Afonso et al. (2019) —
  [A systematic review of meta-analyses comparing periodized and non-periodized programs, _Front Physiol_ 10:1023](https://doi.org/10.3389/fphys.2019.01023)
- Rogerson et al. (2024) —
  [Deloading practices in strength and physique sports: a cross-sectional survey, _Sports Med Open_ 10:26](https://doi.org/10.1186/s40798-024-00691-y)
- Bell et al. (2022) —
  [Coaches' perceptions, practices and experiences of deloading, _Front Sports Act Living_ 4:1073223](https://doi.org/10.3389/fspor.2022.1073223)
- Bell et al. (2023) —
  [Integrating deloading into strength and physique training programmes: an international Delphi consensus, _Sports Med Open_ 9:87](https://doi.org/10.1186/s40798-023-00633-0)
- De Marco et al. (2024) —
  [Resistance training prescription during planned deloading periods: a survey of S&C coaches, _JSCR_ 38(12):2099–2106](https://doi.org/10.1519/JSC.0000000000004932)
- Coleman et al. (2024) —
  [Gaining more from doing less? A one-week deload during supervised resistance training, _PeerJ_ 12:e16777](https://doi.org/10.7717/peerj.16777)
- Pancar et al. (2026) —
  [Effects of deload periods on hypertrophy and strength endurance in untrained young men, _Sci Rep_ 16:10299](https://doi.org/10.1038/s41598-026-40612-5)
- Bosquet et al. (2013) —
  [Effect of training cessation on muscular performance: a meta-analysis, _Scand J Med Sci Sports_ 23(3):e140–e149](https://doi.org/10.1111/sms.12047)

**Practitioner sources, cited as such**

- Wendler, J. —
  [The Training Max: What You Need to Know](https://www.jimwendler.com/blogs/jimwendler-com/101082310-the-training-max-what-you-need-to-know)
  (self-published; the source for the 90 % convention and for there being "no
  hard rule")
- Epley, B. (1985) — poundage chart, University of Nebraska resistance-training
  manual (not retrieved; provenance per §2.2's sources)
- Brzycki, M. (1993) — Strength testing: predicting a one-rep max from
  reps-to-fatigue, _JOPERD_ 64(1):88–90
- Wathen, D. (1994) — Load assignment, in Baechle, T.R. (ed.) _Essentials of
  Strength Training and Conditioning_, pp. 435–439

### Confidence notes

- **High:** the equation list and error tables in Mayhew 2008 (read from the
  paper); Grgic 2020's ICC/CV figures; Richens & Cleather's numbers (read from
  the abstract in full); Nuzzo 2024's moderator conclusion and the
  bench/leg-press contrast; Zourdos 2016's correlations; Steele 2017's SEM
  range; Emanuel 2022's proximity gradient; Helms 2018's null between-group
  result; Grgic 2022 and Refalo 2023's effect sizes; Refalo 2023's velocity-loss
  time course; Greig 2023's SEE% and bias; Sánchez-Medina 2011's r = 0.91–0.97;
  the deload survey means; Bosquet 2013's SMDs; Plotkin 2022's between-group
  estimates.
- **Medium:** LeSuer 1997's per-lift findings (read via two independent
  secondary descriptions that agree, plus the journal record; the paper itself
  predates online full text); the exponential-family recommendation in §2.5 (a
  synthesis of three studies' rankings, not a head-to-head verdict); the ≤
  10-rep gate as a specific number; Reynolds' equation as transcribed (see
  §2.1's typography warning); the MVT figures (a fast-moving literature with
  several 2025–26 papers).
- **Low:** Graham & Cleather 2021's magnitude (title only); Robinson 2024's
  hypertrophy models (not read); Shimano 2006 (secondary only); the §2.3(c)
  synthesis of the training-status conflict (my argument, not a source's).
- **No evidence base / product decisions, not science:** the **training max
  fraction** (90 %, 85 %, or any); any **deload percentage or cadence**; the
  **three-fails rule**; any **decay function** on a strength anchor; any
  **correction constant** applied to a self-reported RIR; the exact **confidence
  thresholds** in §9.4. Every one of these should be documented as a convention
  with this section cited, in the way `zones-and-thresholds.md` documents the
  smoothing window and the decay refusal.
