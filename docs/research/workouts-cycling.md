# A cycling workout library

Research note. Compiled 2026-08-07. A citable catalogue of 41 real bike
sessions, every one written in **portable intensity anchors** so that the same
row means the same physiological thing to a 180 W and a 380 W FTP rider.

> **Sibling documents.** Commissioned alongside `workout-taxonomy.md` and
> `portable-intensity-anchors.md`. **Neither exists in `docs/research/` at the
> time of writing** — the folder holds the seven documents in
> [README.md](README.md) plus [workouts-running.md](workouts-running.md), which
> was written in the same pass. This note therefore carries its own minimal
> anchor legend (§2) which should be **deleted and replaced by a reference** the
> moment the anchors document lands. Zone tables, TID theory, the polarized /
> pyramidal evidence base and the TSS maths are **not** repeated here — see
> [zones-and-thresholds.md](zones-and-thresholds.md),
> [intensity-distribution.md](intensity-distribution.md) and
> [training-load-and-fitness-model.md](training-load-and-fitness-model.md). The
> template-catalogue argument is made once, in
> [workouts-running.md §13.1](workouts-running.md), and is not restated.

## TL;DR

- **The single biggest representational gap on the bike is not an intensity kind
  — it is a _nested repeat_.** Rønnestad's 30/15 protocol is
  `3 × (13 × (30 s hard → 15 s easy))`, and `BlockSchema`
  (`app/utils/workout-schema.ts:192`) gives exactly **one** level of
  `repeatCount` on a flat list of blocks. The most-cited cycling interval
  session of the last decade is **structurally unauthorable** in trainm8 today,
  and so is every set-of-sets session (broken threshold, 30/30s in series,
  micro-burst blocks). This is a schema shape problem, not a missing enum
  member.
- **`powerPct` means "% FTP" and nothing else, and half this library isn't
  anchored on FTP.** Rønnestad and Bossi anchor on **MAP / P<sub>VO2max</sub>**
  from a ramp; the critical-power literature anchors on **CP and W′** (which the
  repo's own zones research already establishes is _not_ FTP —
  [zones-and-thresholds.md §3.2](zones-and-thresholds.md)); Seiler's 4 × 8
  anchors on **"maximal sustainable even effort"**, which is an _open_ target
  with a constraint, not a number at all. Re-expressing all four as % FTP is a
  lossy translation that silently rewrites the citation.
- **Sweet spot has no peer-reviewed existence as a named construct**, and its
  numeric definition is vendor-dependent precisely because it describes no
  physiological landmark. PubMed and Europe PMC searches return **zero** studies
  of sweet-spot training. It straddles the Coggan L3/L4 boundary by
  construction, so it can never be a band in `coggan-power-7`. The nearest real
  evidence — Rønnestad's moderate-intensity-interval blocks — supports the
  _practice_ (sub-threshold intervals work, and match HIT for 15-min power)
  while giving no support whatsoever to the _branding_.
- **Indoor and outdoor are different prescriptions, and the app has no field for
  which one you meant.** In ERG mode variability index ≈ 1.00 by construction,
  there is no coasting, and HR runs high from thermal load — so the same nominal
  session yields a different NP, a different TSS, and a different hrTSS indoors.
  The widely-quoted "indoor FTP is 5 % lower" fudge is **not supported**:
  Kowalski et al. 2024 found no group-level difference in well-trained athletes,
  with the individual gap predicted by which environment the rider habitually
  trains in. Model it per athlete or not at all. And note the awkward corollary
  of Bossi et al. 2020: **constant power is the _inferior_ stimulus for time at
  VO₂max**, so ERG-by-default is HIIT-by-default-worse.
- **Two popular archetypes in this library have weak or null evidence and must
  be labelled honestly.** Big-gear torque work as "strength": the longest,
  cleanest trial (Kristoffersen et al. 2014, 12 weeks at 40 rpm) found no gain
  in VO₂max, performance **or leg strength**, while the freely-chosen-cadence
  control improved. Cadence drills reliably change _cadence_ and reliably fail
  to change _performance_. Over-unders' "trains lactate clearance" rationale is
  extrapolated from steady-state MCT1 training studies and has **never been
  tested** against a work-matched constant-power interval.

---

## 1. How to read this library

Each archetype gets **two tables**:

- **Prescription** — `#`, name (the term real cyclists use), purpose, structure
  in portable anchors, duration, estimated TSS, phase · frequency, and source.
- **Notation & variants** — the same session rendered in this repo's
  [Workout Notation](../adr/0027-text-first-workout-authoring.md), plus how to
  progress and regress it.

**TSS figures are estimates, flagged as such.** Computed as `IF² × hours × 100`
per step for a notional intermediate rider, summed — the same midpoint-IF recipe
`app/utils/load/planned-tss.ts` uses. They vary ±25 % with FTP accuracy, warm-up
length, terrain, and (materially) indoor vs outdoor. Never surface them as
precise.

**Levels.** _Beginner_ ≈ < 5 h/wk, 1–2 quality sessions, FTP not yet stable;
_intermediate_ ≈ 5–10 h/wk, 2–3 quality; _advanced_ ≈ 10 h+/wk, 3 quality or a
block structure. §12 gives the scaling rule.

### Notation legend

The renderer (`app/utils/workout-notation.ts`) is deterministic; these are its
real tokens, taken from `NOTATION_SEPARATORS`, `intensityChipText`
(`app/utils/zone-equivalent.ts:243`) and the unit tests.

| Token                   | Renders as                                              | Authored `IntensityTarget` kind       |
| ----------------------- | ------------------------------------------------------- | ------------------------------------- |
| Step separator          | `→`                                                     | —                                     |
| Repeat (one level only) | `4 × 8 min`, `3 × (3 min Threshold → 1 min Easy)`       | —                                     |
| Value                   | `@ 105% FTP`, `@ 320 W`                                 | —                                     |
| Derived facet           | `· Z4`, `· Z4 (238–263 W)`                              | —                                     |
| Zone label              | `45 min Easy`, `20 min Tempo` (capitalised, **no** `@`) | `zoneLabel`                           |
| RPE (CR10 only)         | `30 min @ RPE 6 · Z3`                                   | `rpe` (1–10)                          |
| % HR                    | `4 min @ 90–95% max HR · Z5`, `@ 95–105% LTHR`          | `hrPct` (`ref: 'max' \| 'lthr'`)      |
| % power                 | `20 min @ 95–105% FTP · Z4`                             | `powerPct` (**FTP only**)             |
| Absolute                | `@ 320 W`, `@ 150–160 bpm`                              | `power`, `hrBpm`                      |
| Rest step               | `(4 min rest)`                                          | — (rest steps carry **no** intensity) |
| Block label             | `20 min warm-up`, `cool-down`                           | —                                     |

Four markers appear in the notation column:

- **†** — needs a **nested repeat**. `Block.repeatCount` is one level over a
  flat block list; `3 × (13 × (30 s → 15 s))` has two.
- **‡** — needs a **new intensity anchor**: `% MAP`, `% 5-min power`,
  `% 20-min power`, `% CP`, or an **open "maximal sustainable"** target.
  `powerPct` resolves against FTP and nothing else
  (`app/utils/zones/recipes.ts:15`, `anchor: 'ftp'`).
- **§** — needs a **cadence** parameter on the step. `CardioStepSchema`
  (`app/utils/workout-schema.ts:152`) has discipline, intensity, duration,
  distance, notes — no cadence, no gradient, no position.
- **¶** — needs an **execution mode** (indoor ERG / indoor free / outdoor) or an
  **all-out / open** target the load model can price.

Everything unmarked is authorable in trainm8 **today**.

---

## 2. Anchor legend (provisional — supersede with `portable-intensity-anchors.md`)

The hard requirement is that a row mean the same thing to a 180 W and a 380 W
rider. That is satisfied by _ratios to something the athlete owns_, and the
cycling literature owns **five different somethings**, which are not
interchangeable.

| Anchor                                   | Meaning                                                    | Portable because                                                                               | Where it comes from                                                  | In trainm8?                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `% FTP`                                  | Fraction of Functional Threshold Power                     | Ratio to the rider's own hour-ish power                                                        | Allen & Coggan, _Training and Racing with a Power Meter_ (2006)      | **Yes** (`powerPct`)                                                                                                                                  |
| `Z1–Z7`                                  | Coggan seven-level ladder                                  | Bands defined as % FTP                                                                         | Allen & Coggan; `coggan-power-7`                                     | **Yes** (`zoneLabel`)                                                                                                                                 |
| `% MAP` / `% P`<sub>VO2max</sub> ‡       | Fraction of maximal aerobic power from an incremental ramp | Ratio to the rider's own ramp ceiling                                                          | Rønnestad et al.; Bossi et al. 2020                                  | No                                                                                                                                                    |
| `% CP` + `W′` ‡                          | Critical power and the finite work capacity above it       | Two-parameter hyperbola fitted per rider                                                       | Monod & Scherrer; Jones & Vanhatalo 2017                             | No (and **CP ≠ FTP**)                                                                                                                                 |
| `% 5-min power` ‡                        | Fraction of the rider's best 5-minute mean power           | A directly measured MAP proxy from the mean-maximal curve                                      | Field convention; `personal-records.ts` already derives best efforts | Derivable, not authorable                                                                                                                             |
| `% 20-min power` ‡                       | Fraction of the rider's best 20-minute mean power          | The raw number the FTP test produces before the 0.95 haircut                                   | Allen & Coggan test protocol                                         | Derivable, not authorable                                                                                                                             |
| **"maximal sustainable even effort"** ‡¶ | Self-paced: the hardest _even_ power holdable for all reps | The constraint is the anchor; it self-scales exactly                                           | Seiler et al. 2013; Rønnestad's short/long interval trials           | No                                                                                                                                                    |
| `% HRmax` / `% LTHR`                     | Fraction of measured maximal / threshold heart rate        | Measured per rider                                                                             | Helgerud; Friel; Olympiatoppen                                       | **Yes** (`hrPct`)                                                                                                                                     |
| `RPE`                                    | Perceived exertion                                         | Subjective by construction                                                                     | Borg                                                                 | **Partly** — CR10 (1–10) only; **Borg 6–20 cannot be stored**, and several protocols (Rønnestad's MIT: "Borg 14–15") are prescribed on the 6–20 scale |
| `mmol·L⁻¹`                               | Blood lactate                                              | Measured, individual                                                                           | Norwegian tradition; Rønnestad MIT (2.8 mmol)                        | No                                                                                                                                                    |
| `rpm` §                                  | Cadence                                                    | Absolute, but the target _is_ absolute — a cadence prescription is not scaled by fitness       | Low-cadence / high-cadence literature                                | No                                                                                                                                                    |
| `W/kg`                                   | Power per kilogram                                         | Portable _across riders_ for climbing; **not** an intensity anchor — it does not encode effort | Climbing convention                                                  | No                                                                                                                                                    |

**Two anchor traps specific to cycling.**

1. **CP is not FTP and the gap widens with fitness** (256 ± 50 W vs 249 ± 44 W,
   limits of agreement −19 to +33 W; the authors say explicitly they should not
   be used interchangeably — see
   [zones-and-thresholds.md §3.2](zones-and-thresholds.md)). Prescribing "120 %
   FTP" for an anaerobic session whose published dose was "120 % CP" introduces
   a systematic, athlete-dependent error in the one intensity domain where a few
   percent decides whether the rep is completable.
2. **W/kg is a comparison unit, not a prescription unit.** "4 W/kg" means a
   sweet-spot ride for one rider and a threshold effort for another. It belongs
   in reporting, never in a target.

---

## 3. Archetype A — Endurance & recovery

The volume archetype. Note that the _molecular_ case for "zone 2" is much weaker
than folklore suggests — see §11.3 — and the honest case is a load-management
one: it is the intensity at which large volumes are recoverable, and volume is
the driver.

### Prescription

| #   | Name                           | Purpose                                                                                                                | Structure (anchors)                                                                                            | Duration  | TSS (est.) | Phase · freq                 | Source                                                                                                                  |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A1  | Recovery spin                  | Circulation without stimulus; the day-after ride                                                                       | Continuous at **< 55 % FTP · Z1**, RPE ≤ 2, cadence self-selected, **no** intervals of any kind                | 30–60 min | 15–30      | All phases · 1–3×/wk         | Allen & Coggan L1                                                                                                       |
| A2  | Endurance ride (_langtur_)     | Aerobic base, capillarisation, fat oxidation, durability                                                               | Continuous **56–75 % FTP · Z2**, RPE 3–4                                                                       | 2–5 h     | 100–250    | Base, build · 2–4×/wk        | Allen & Coggan L2; the LIT arm of every polarized/pyramidal trial                                                       |
| A3  | Endurance with sprints         | Adds a neuromuscular/anaerobic stimulus to a LIT ride at almost no aerobic cost                                        | Z2 ride containing **3 series × 3 × 30 s maximal sprints**, ~4 min easy between reps, ~10 min between series ¶ | 3–4 h     | 170–220    | Base, transition · 1×/wk     | Almquist, Ettema, Hopker, Sandbakk & Rønnestad, _IJSPP_ 2019; Almquist et al., _MSSE_ 2021; Taylor et al., _IJSPP_ 2021 |
| A4  | Durability ride (tempo finish) | Trains performance _after_ accumulated work — the fatigue-resistance quality fondos and stage races actually select on | 3–4 h Z2, final **30–45 min at 85–92 % FTP**; fuel deliberately                                                | 3.5–4.5 h | 230–300    | Build, peak · 1× per 1–2 wks | Durability literature (Maunder, Seiler & Plews 2021); standard gran-fondo practice                                      |

### Notation & variants

| #   | Workout Notation                                                                                                                                                      | Progression                                                      | Regression                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| A1  | `45 min @ 45–55% FTP · Z1`                                                                                                                                            | None. A recovery ride that progresses is not a recovery ride     | 30 min, or take the day off               |
| A2  | `3 h @ 60–75% FTP · Z2`                                                                                                                                               | +20–30 min per fortnight; then split the range upward to 65–75 % | 90 min; or 2 × 60 min as a commute double |
| A3  | `30 min @ 65% FTP · Z2 → 3 × (30 s @ RPE 10 → 4 min @ 60% FTP · Z1) → 45 min @ 65% FTP · Z2 → 3 × (30 s @ RPE 10 → 4 min @ 60% FTP · Z1) → 90 min @ 65% FTP · Z2` † ¶ | 3 series; then 4 × 30 s per series                               | 2 series of 2 sprints inside a 2 h ride   |
| A4  | `3 h @ 62–72% FTP · Z2 → 35 min @ 85–92% FTP · Z3`                                                                                                                    | Finish 30 → 45 min; or raise to 90–95 % FTP                      | 2 h Z2 → 20 min at 80–85 %                |

**Fidelity note on A3.** The published sprint-in-LIT protocols use **30 s**
sprints — glycolytic, Wingate-like — not the 5–15 s effort that coaching
software labels "neuromuscular". Extending the finding to a 10 s max sprint is
an extrapolation, not a result. The strongest outcomes also come from the
_transition period_ (Taylor et al. 2021), an unusually favourable context
because the athlete is otherwise detraining. The notation above is written
without nested repeats by unrolling the series, which is exactly the workaround
the † marker exists to complain about.

---

## 4. Archetype B — Tempo & sweet spot (sub-threshold)

### Prescription

| #   | Name                       | Purpose                                                                                       | Structure (anchors)                                                                                                            | Duration    | TSS (est.) | Phase · freq                                   | Source                                                                                               |
| --- | -------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| B1  | Tempo ride                 | Classic "steady state"; aerobic development at higher density than Z2 for time-limited riders | 2–3 × **20 min at 76–90 % FTP · Z3**, RPE 5, 5 min easy between                                                                | 75–120 min  | 70–95      | Base, build · 1–2×/wk                          | Allen & Coggan L3                                                                                    |
| B2  | Sweet spot intervals       | The claimed maximum adaptation per unit strain; the workhorse of time-crunched plans          | 3 × **15 min at 88–94 % FTP**, 5 min at 55 % FTP between                                                                       | 75–90 min   | 75–100     | Base, build · 2×/wk                            | Frank Overton (FasCat Coaching), c. 2005 — see §11.1 for the origin and the definition dispute       |
| B3  | Extended sweet spot        | Same stimulus, longer continuous exposure; fondo/TT specific                                  | 2 × **30 min at 88–94 % FTP**, 10 min at 55 % between                                                                          | 100–120 min | 95–125     | Build · 1×/wk                                  | Overton; the "long SS" convention                                                                    |
| B4  | Rønnestad MIT session      | The one sub-threshold protocol with a controlled trial behind it                              | 5–7 × **10–14 min at Borg 14–15** (≈ 66 % P<sub>VO2max</sub>, ~85 % HRmax, ~2.8 mmol·L⁻¹, ≈ 88–95 % FTP), 3 min easy between ‡ | 90–120 min  | 110–150    | Base / a 6-session MIT block week · see source | Mølmen et al., _MSSE_ 2025 (PMID 40101160); Rønnestad et al., _Eur J Sport Sci_ 2025 (PMID 41169000) |
| B5  | Progressive endurance ride | Rehearses negative-split pacing; ends near threshold on accumulated fatigue                   | 4 × 25 min stepping **65 % → 75 % → 85 % → 92 % FTP**, continuous, no recovery                                                 | 100–120 min | 110–145    | Base, build · 1× per 1–2 wks                   | Coaching convention (progressive / "ramp" ride); no controlled trial                                 |

### Notation & variants

| #   | Workout Notation                                                                                                                                | Progression                                                              | Regression                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| B1  | `15 min warm-up → 3 × (20 min @ 78–88% FTP · Z3 → 5 min @ 55% FTP · Z1) → 10 min cool-down`                                                     | 3 → 4 reps; 20 → 25 min                                                  | 2 × 15 min                                         |
| B2  | `20 min warm-up → 3 × (15 min @ 88–94% FTP → 5 min @ 55% FTP · Z1) → 10 min cool-down`                                                          | 3 → 4 reps; 15 → 20 min; recovery 5 → 3 min                              | 2 × 12 min at 85–90 %                              |
| B3  | `20 min warm-up → 2 × (30 min @ 88–94% FTP → 10 min @ 55% FTP · Z1) → 10 min cool-down`                                                         | 2 → 3 reps; or 1 × 60 min continuous                                     | 2 × 20 min                                         |
| B4  | `20 min warm-up → 6 × (12 min @ RPE 5–6 → 3 min @ 55% FTP · Z1) → 10 min cool-down` ‡                                                           | 5 → 7 reps; 10 → 14 min. The **block** form is 6 such sessions in 7 days | 4 × 10 min; and never in block form for a beginner |
| B5  | `15 min warm-up → 25 min @ 62–68% FTP · Z2 → 25 min @ 72–78% FTP · Z2 → 25 min @ 82–88% FTP · Z3 → 25 min @ 90–94% FTP · Z4 → 10 min cool-down` | Add a fifth 25 min rung at 96–100 %                                      | Three rungs, stop at 88 %                          |

**Two honesty flags on this archetype.**

1. **B2/B3's band is a coaching heuristic, not a landmark.** Nobody measured a
   physiological breakpoint at 88 % or 94 % FTP. Overton's original range is
   **84–97 % FTP**; the narrower **88–94 %** figure that dominates online is
   published without attribution by an indoor training platform (not named here
   per this repo's convention) and cannot be traced to a primary author. 84–97
   %, 88–94 %, 88–93 % and 83–97 % all circulate. §11.1.
2. **B4's `RPE 5–6` is a lossy conversion.** The protocol prescribes **Borg
   14–15 on the 6–20 scale**; `IntensityTargetSchema` stores CR10 only
   (`app/utils/workout-schema.ts:60`, `min(1).max(10)`), so the citation's
   actual anchor is unstorable. The `% P`<sub>VO2max</sub> and mmol figures are
   also unstorable, which is why B4 carries ‡.

---

## 5. Archetype C — Threshold & over-unders

### Prescription

| #   | Name                      | Purpose                                                                       | Structure (anchors)                                                                  | Duration    | TSS (est.) | Phase · freq                 | Source                                                                                                 |
| --- | ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- | ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| C1  | 2 × 20 (_the two-twenty_) | The reference threshold session; raise power at MLSS                          | 2 × **20 min at 95–105 % FTP · Z4**, 10 min at 55 % between                          | 90–105 min  | 85–110     | Build · 1–2×/wk              | Allen & Coggan L4; near-universal convention                                                           |
| C2  | 3 × 12 threshold          | Same stimulus, more reps, lower per-rep psychological cost                    | 3 × **12 min at 98–102 % FTP**, 4 min at 55 % between                                | 80–95 min   | 80–105     | Base, build · 1–2×/wk        | Allen & Coggan L4                                                                                      |
| C3  | Over-unders (criss-cross) | Tolerance of surges around threshold; _claimed_ lactate clearance — see §11.2 | 3 × **12 min alternating 2 min at 95 % / 2 min at 105 % FTP**, 6 min at 55 % between | 90–105 min  | 90–115     | Build · 1×/wk                | Over-under convention; steeper 1 min @ 110 % / 1 min @ 90 % variant per Overton                        |
| C4  | Sharp over-unders         | Larger oscillation, shorter dwell; race-surge specific                        | 3 × **12 min alternating 1 min at 110 % / 1 min at 90 % FTP**, 6 min at 55 % between | 90–105 min  | 95–120     | Build, peak · 1× per 1–2 wks | Overton (FasCat Coaching)                                                                              |
| C5  | Long steady state         | TT / fondo specific: continuous sub-threshold in position                     | **40–60 min continuous at 88–95 % FTP**, in the intended race position               | 90–120 min  | 85–115     | Build, peak · 1×/wk          | TT convention; the "race-pace" rehearsal session                                                       |
| C6  | Broken threshold          | Accumulates more time at Z4 than a continuous effort of the same intensity    | **2 × (4 × 6 min at 100–105 % FTP, 1 min at 55 %)**, 8 min between sets †            | 100–120 min | 100–130    | Build · 1× per 1–2 wks       | Micro-recovery threshold convention; the mechanism is the same one Rønnestad's short intervals exploit |

### Notation & variants

| #   | Workout Notation                                                                                                                                                                                                | Progression                                      | Regression                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------- |
| C1  | `20 min warm-up → 2 × 20 min @ 95–105% FTP · Z4 (10 min rest) → 15 min cool-down`                                                                                                                               | 2 → 3 reps; recovery 10 → 6 min; then 2 × 25 min | 2 × 12 min; recovery 10 min      |
| C2  | `20 min warm-up → 3 × (12 min @ 98–102% FTP · Z4 → 4 min @ 55% FTP · Z1) → 10 min cool-down`                                                                                                                    | 3 → 4 reps; 12 → 15 min                          | 3 × 8 min; recovery 5 min        |
| C3  | `20 min warm-up → 3 × (2 min @ 95% FTP · Z4 → 2 min @ 105% FTP · Z4 → 2 min @ 95% FTP · Z4 → 2 min @ 105% FTP · Z4 → 2 min @ 95% FTP · Z4 → 2 min @ 105% FTP · Z4 → 6 min @ 55% FTP · Z1) → 10 min cool-down` † | 3 → 4 sets; overs 105 → 108 %                    | 2 sets; overs 102 %, unders 90 % |
| C4  | Same shape, `1 min @ 110% FTP` / `1 min @ 90% FTP` alternating for 12 min †                                                                                                                                     | 4 sets; overs to 115 %                           | 8 min sets                       |
| C5  | `20 min warm-up → 45 min @ 88–95% FTP · Z4 → 15 min cool-down`                                                                                                                                                  | 40 → 60 min; then raise band to 92–97 %          | 25 min; or break into 2 × 20 min |
| C6  | `20 min warm-up → 4 × (6 min @ 100–105% FTP · Z4 → 1 min @ 55% FTP · Z1) → 8 min @ 55% FTP · Z1 → 4 × (6 min @ 100–105% FTP · Z4 → 1 min @ 55% FTP · Z1) → 10 min cool-down` †                                  | 3 sets of 4; or 5 reps per set                   | 1 set of 4                       |

**The over-under notation is where the flat block model hurts most.** C3 as
written unrolls six alternating steps three times because there is no
`3 × (6 × (2 min over → 2 min under))`. The Token Sentence for C3 is 27 tokens
long and unreadable, which is a _rendering_ symptom of a _schema_ problem.

---

## 6. Archetype D — VO₂max

The best-evidenced archetype on the bike — and the one where the anchor problem
bites hardest: **three of the six rows are anchored on something other than
FTP**.

### Prescription

| #   | Name                               | Purpose                                                                                                                                                       | Structure (anchors)                                                                                                                                                                                                                                                                                                                                                                                                           | Duration   | TSS (est.) | Phase · freq                          | Source                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Seiler 4 × 8                       | The dose/intensity optimum of the 4×4 / 4×8 / 4×16 comparison — largest gains across the board                                                                | 4 × **8 min at "maximal tolerable intensity"**, self-paced (the trial's riders landed at **90 ± 2 % HRpeak, 9.6 mmol·L⁻¹**; ≈ 100–105 % FTP for most riders — the anchor is the constraint, not the number). Recovery **2 min, unconfirmed** — the published abstract does not state it                                                                                                                                       | 60–75 min  | 80–100     | Build · 1–2×/wk                       | Seiler, Jøranson, Olesen & Hetlelid, _Scand J Med Sci Sports_ 2013;23(1):74–83, PMID 21812820, doi:10.1111/j.1600-0838.2011.01351.x ‡                                                                                                                                                                                      |
| D2  | Seiler 4 × 4 / Helgerud 4 × 4      | Highest-intensity arm; the reference HIIT protocol in the wider literature                                                                                    | 4 × **4 min at maximal tolerable intensity** (Seiler's arm reached **94 ± 2 % HRpeak, 13.2 mmol·L⁻¹**) **or 90–95 % HRmax with 3 min active recovery at 70 % HRmax** (Helgerud)                                                                                                                                                                                                                                               | 45–60 min  | 55–75      | Build, peak · 1–3×/wk                 | Seiler 2013; Helgerud et al., _MSSE_ 2007;39(4):665–671, PMID 17414804 — **a running study in moderately trained men, not cyclists**                                                                                                                                                                                       |
| D3  | Seiler 4 × 16                      | The high-volume/lower-intensity arm — included because knowing what _didn't_ win is part of the citation                                                      | 4 × **16 min at maximal tolerable intensity** (the trial's riders landed at **88 ± 2 % HRpeak, 4.9 mmol·L⁻¹** — i.e. near or below FTP by necessity)                                                                                                                                                                                                                                                                          | 90–105 min | 100–130    | Base · 1×/wk                          | Seiler 2013 ‡                                                                                                                                                                                                                                                                                                              |
| D4  | Rønnestad 30/15                    | Maximise time at a high fraction of VO₂max; out-performed effort-matched long intervals in three trials from one lab — **and see the replication note below** | **3 series of 13 × 30 s work separated by 12 × 15 s relief** (each series = 9.5 min continuous), **3 min between series**. Relief and between-series recovery are both at **50 % of the work-interval power**, not soft-pedalling. Work is **self-paced at the highest average power sustainable across the whole session**, seeded at P<sub>VO2max</sub> in series 1. The 2021 microcycle form is **5 series × 12 reps** † ‡ | 60–80 min  | 70–90      | Build; also as a 1-week block · 2×/wk | Origin of the 2:1 ratio: Rønnestad & Hansen, _JSCR_ 2016;30(4):999–1006, PMID 23942167. Training trials: Rønnestad, Hansen, Vegge, Tønnessen & Slettaløkken, _SJMSS_ 2015;25(2):143–151; Rønnestad et al., _SJMSS_ 2020 (PMID 31977120); Rønnestad, Øfsteng, Zambolin, Raastad & Hammarström, _IJSPP_ 2021 (PMID 33735833) |
| D5  | Rønnestad long-interval comparator | The effort-matched long-interval arm — a hard, legitimate session, and the honest control                                                                     | **4 × 5 min at maximal sustainable average power, 2.5 min recovery at 50 % of work power**. Note this is _not_ threshold work: the 2015 arm averaged 324 ± 42 W at 10.0 mmol·L⁻¹ and RPE 17.6/20                                                                                                                                                                                                                              | 70–85 min  | 70–90      | Build · 1–2×/wk                       | Rønnestad et al., _SJMSS_ 2015; _SJMSS_ 2020 ‡                                                                                                                                                                                                                                                                             |
| D6  | Variable-intensity VO₂max          | Raises time ≥ 90 % VO₂max by ~43 % vs constant power at **matched mean power and duration**                                                                   | 4–5 × 5 min whose power **oscillates** around the mean rather than being held flat — e.g. each minute = 15 s at ~130 % FTP + 45 s at ~95 % FTP ¶                                                                                                                                                                                                                                                                              | 60–75 min  | 75–95      | Build, peak · 1×/wk                   | Bossi, Mesquida, Passfield, Rønnestad & Hopker, _IJSPP_ 2020;15(7):982–989, PMID 32244222                                                                                                                                                                                                                                  |

### Notation & variants

| #   | Workout Notation                                                                                                                                                                                                                                                                                                                                                               | Progression                                                                        | Regression              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------- |
| D1  | `20 min warm-up → 4 × 8 min @ RPE 8 (2 min rest) → 10 min cool-down` ‡ — or, pre-computed, `4 × 8 min @ 100–105% FTP · Z4`                                                                                                                                                                                                                                                     | 5 × 8 min; recovery 2 → 90 s. Do **not** raise the % — the anchor is self-paced    | 3 × 8 min; or 4 × 6 min |
| D2  | `20 min warm-up → 4 × (4 min @ 90–95% max HR · Z5 → 3 min @ 70% max HR) → 10 min cool-down`                                                                                                                                                                                                                                                                                    | 5 reps; recovery 3 → 2 min. The Helgerud ceiling is the protocol; do not exceed it | 3 reps; recovery 4 min  |
| D3  | `20 min warm-up → 4 × 16 min @ RPE 7 (2 min rest) → 10 min cool-down` ‡                                                                                                                                                                                                                                                                                                        | 5 reps — but note this arm under-performed 4×8; prefer progressing _to_ D1         | 3 × 16 min              |
| D4  | `20 min warm-up → 12 × (30 s @ RPE 9 → 15 s @ 65% FTP · Z2) → 30 s @ RPE 9 → 3 min @ 65% FTP · Z2 → 12 × (30 s @ RPE 9 → 15 s @ 65% FTP · Z2) → 30 s @ RPE 9 → 3 min @ 65% FTP · Z2 → 12 × (30 s @ RPE 9 → 15 s @ 65% FTP · Z2) → 30 s @ RPE 9 → 10 min cool-down` † ‡ — _three unrolled series, each with a trailing 13th work bout, because the schema has one repeat level_ | 3 → 5 series (the 2021 microcycle form)                                            | 2 series × 10 reps      |
| D5  | `20 min warm-up → 4 × (5 min @ RPE 9 → 2 min 30 s @ 50% FTP · Z1) → 10 min cool-down` ‡                                                                                                                                                                                                                                                                                        | 5 → 6 reps; recovery 2:30 → 2:00                                                   | 3 × 5 min               |
| D6  | `20 min warm-up → 4 × (15 s @ 130% FTP · Z6 → 45 s @ 95% FTP · Z4 → 15 s @ 130% FTP · Z6 → 45 s @ 95% FTP · Z4 → 15 s @ 130% FTP · Z6 → 45 s @ 95% FTP · Z4 → 15 s @ 130% FTP · Z6 → 45 s @ 95% FTP · Z4 → 15 s @ 130% FTP · Z6 → 45 s @ 95% FTP · Z4 → 5 min @ 55% FTP · Z1) → 10 min cool-down` † ¶                                                                          | 5 sets; raise the surge to 140 % at matched mean                                   | 3 sets; surge 120 %     |

**Six protocol-fidelity notes.**

1. **Seiler's finding is about _duration_, not intensity.** All three arms were
   _self-paced at "maximal tolerable intensity"_; the 4 × 8 group out-gained
   every other arm on the composite outcome (**+11.4 %**, 95 % CI 8.0–14.9, vs
   +5.5 %, +5.6 % and +4.2 % for 4 × 4, 4 × 16 and low-intensity-only; p <
   0.02). Prescribing a fixed % FTP for D1 misses the mechanism entirely — the
   anchor is "the hardest even power you can hold for all four reps", which
   trainm8 can only approximate as `@ RPE 8`. **Scope caveat:** n = 35 across
   four arms, 7 weeks, and the riders were _trained recreational_ (VO₂peak 52 ±
   6 mL·kg⁻¹·min⁻¹). An 11 % composite gain does not transfer to an elite.
   Helgerud's 4 × 4 (D2) has the same limitation and is additionally a
   **running** study.
2. **The popular "Rønnestad 30/15" and the published one differ in four ways.**
   (a) No paper prescribes a **% FTP** — the anchor is P<sub>VO2max</sub> in the
   acute study and _self-paced maximal average power_ in the training trials.
   (b) The relief is at **50 % of the work-interval power** (≈ 180 W in the 2015
   trial), not soft-pedalling. (c) A series is **13 work bouts with 12 reliefs**
   — 9.5 min continuous — so "13 × (30/15)" overstates it. (d) The long-interval
   comparator was **4 × 5 min self-paced maximal with 2.5 min recovery**, a
   brutal session — framing the result as "30/15 beats threshold intervals" is
   simply wrong.
3. **The 30/15 evidence is weaker than its reputation, and the mechanism has
   since failed to replicate.** Every positive training trial is from one lab
   with n = 7–9 per arm. In the 2015 study the between-group p-values for
   _performance_ (40-min power p = 0.056, 5-min, Wingate, power @ 4 mM) were all
   > 0.05; the headline rests on VO₂max, W<sub>max</sub> and Cohen's d. Effort
   > matching is **not** work matching: the short-interval group produced 12 %
   > higher mean power at the same RPE and lactate, so "short is better" and
   > "more work is better" are not separable. Then: **Appelhans, Rønnestad &
   > Skovereng, _IJSPP_ 2025** (PMID 40328438) ran both formats under fixed and
   > self-paced conditions in the same riders — the short-interval advantage in
   > time ≥ 90 % VO₂max appeared **only in the fixed condition** (p < .01) and
   > vanished when both were self-paced (p = .321). **Fleckenstein et al. 2025**
   > (PMID 39835194) found the _opposite_ ordering in runners. And the
   > meta-analytic signal points the other way: **Rosenblat et al., _Sports Med_
   > 2021** (PMID 33826121; 29 studies, 67 groups) found work-bout **duration**,
   > not intensity, predicted time-trial improvement — i.e. toward _longer_
   > bouts. Seed D4, but do not seed it as settled.
4. **D6 is one acute crossover, n = 14, on a surrogate outcome.** Time ≥ 90 %
   VO₂max was 410 s (varied) vs 286 s (constant), P = .02, with no difference in
   HR, RPE or lactate. The authors attribute part of the effect to the **oxygen
   cost of breathing** (ventilation was higher; ΔVO₂ correlated with ΔV̇E, r =
   .36). No training intervention has shown this converts to superior
   adaptation. The specific structure in the notation column is a
   _reconstruction of the principle_, not the published waveform.
5. **The mechanism that ties the archetype together is fraction of VO₂max, not
   lactate.** Rønnestad et al., _Eur J Sport Sci_ 2024 — "the higher the
   fraction of maximal oxygen uptake during interval training, the greater the
   cycling performance gain"; and Odden et al., _Eur J Sport Sci_ 2024
   (PMID 39385317) found adaptation across 21 sessions of 5 × 8 min tracked
   %VO₂max achieved (R²<sub>adj</sub> 0.25–0.54). This is the best available
   justification for the whole time-at-VO₂max design philosophy — and it is a
   _respiratory/central_ argument, not the lactate-clearance one coaches give
   for over-unders.
6. **An interval prescription has nine independent variables, and trainm8 can
   store four of them.** Buchheit & Laursen, _Sports Med_ 2013 (Part I,
   PMID 23539308) enumerate them: work-interval intensity and duration,
   **relief-interval intensity and duration**, exercise modality, number of
   repetitions, **number of series**, and **between-series recovery duration and
   intensity**. Their target — "at least several minutes per session in the red
   zone", ≥ 90 % VO₂max — is the design rule this whole archetype serves, and
   they explicitly warn that time-at-VO₂max alone is insufficient without also
   characterising anaerobic contribution, neuromuscular load and musculoskeletal
   strain. Of the nine, trainm8 today can express work intensity, work duration,
   relief duration and repetitions. **Relief intensity, series count and
   between-series recovery are exactly the three the nested-repeat and
   rest-step-intensity gaps (§13.1, §13.4) block.**

---

## 7. Archetype E — Anaerobic capacity & neuromuscular

### Prescription

| #   | Name                         | Purpose                                                                           | Structure (anchors)                                                                                     | Duration  | TSS (est.)                            | Phase · freq                               | Source                                                                                                            |
| --- | ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| E1  | Anaerobic capacity reps      | Deplete and reload W′; raise tolerance to supra-CP work                           | 2 × **5 × 1 min at 120–130 % FTP** (≈ 115–125 % CP), 3 min at 45 % between reps, 8 min between sets † ‡ | 70–85 min | 55–75                                 | Build, peak · 1×/wk                        | Allen & Coggan L6; W′ framing per Jones & Vanhatalo, _Sports Med_ 2017                                            |
| E2  | 30/30s                       | Repeated supra-threshold surges with incomplete recovery; crit-specific           | 2–3 × **10 × (30 s at 130 % FTP / 30 s at 50 % FTP)**, 5 min between sets †                             | 70–85 min | 60–80                                 | Build, peak · 1×/wk                        | Convention; the cycling analogue of Billat's 30/30                                                                |
| E3  | Wingate SIT                  | Maximal glycolytic stimulus at minimal time cost                                  | **4–6 × 30 s all-out**, 4 min recovery ¶                                                                | 30–45 min | 40–60 (**badly modelled** — see note) | Build; time-crunched blocks · 1–2×/wk      | Burgomaster, Hughes, Heigenhauser, Bradwell & Gibala, _J Appl Physiol_ 2005; Burgomaster et al., _J Physiol_ 2008 |
| E4  | Neuromuscular sprints        | Peak power, recruitment, and bike-handling under load                             | **8 × 10 s maximal from a rolling ~30 km/h start**, 5 min full recovery, inside a Z2 ride ¶             | 60–90 min | 45–60                                 | All phases · 1×/wk                         | Allen & Coggan L7; standard practice                                                                              |
| E5  | Standing-start power efforts | Torque + recruitment from near-standstill; race-start and attack specific         | **8 × 8 s from ~10 km/h in a big gear, standing**, 4–5 min recovery § ¶                                 | 60–75 min | 40–55                                 | Base, build · 1×/wk                        | Convention; standing raises peak power ~26 % over seated (Millet et al. 2002)                                     |
| E6  | Attack repeats               | Race-realistic: a hard surge followed by continued sub-threshold riding, not rest | 5 × (**30 s at 150 % FTP → 4 min 30 s at 88–92 % FTP**), 5 min easy between                             | 80–95 min | 75–95                                 | Peak, race week (reduced) · 1× per 1–2 wks | Road-racing convention; W′ reconstitution rationale per Skiba et al. 2012                                         |

### Notation & variants

| #   | Workout Notation                                                                                                                                                               | Progression                                         | Regression                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------- |
| E1  | `20 min warm-up → 5 × (1 min @ 120–130% FTP · Z6 → 3 min @ 45% FTP · Z1) → 8 min @ 50% FTP · Z1 → 5 × (1 min @ 120–130% FTP · Z6 → 3 min @ 45% FTP · Z1) → 10 min cool-down` † | 2 → 3 sets; recovery 3 → 2 min                      | 1 set of 4 reps           |
| E2  | `20 min warm-up → 10 × (30 s @ 130% FTP · Z6 → 30 s @ 50% FTP · Z1) → 5 min @ 50% FTP · Z1 → 10 × (30 s @ 130% FTP · Z6 → 30 s @ 50% FTP · Z1) → 10 min cool-down` †           | 3 sets; or 12 reps per set                          | 1 set of 8; recovery 45 s |
| E3  | `15 min warm-up → 5 × 30 s @ RPE 10 (4 min rest) → 10 min cool-down` ¶                                                                                                         | 4 → 6 reps over 2–3 weeks. Do not add sets beyond 6 | 3 reps; or substitute E4  |
| E4  | `30 min @ 65% FTP · Z2 → 8 × (10 s @ RPE 10 → 5 min @ 60% FTP · Z2) → 15 min cool-down`                                                                                        | 10 reps; add a second cluster later in the ride     | 5 reps                    |
| E5  | `25 min warm-up → 8 × (8 s @ RPE 10 → 4 min @ 55% FTP · Z1) → 15 min cool-down` §                                                                                              | 10 reps; bigger gear                                | 5 reps; seated start      |
| E6  | `20 min warm-up → 5 × (30 s @ 150% FTP · Z7 → 4 min 30 s @ 88–92% FTP · Z3 → 5 min @ 55% FTP · Z1) → 10 min cool-down`                                                         | 6–7 reps; raise the sub-threshold float to 92–96 %  | 3 reps; float at 80 %     |

**Two load-model notes.**

1. **TSS systematically under-prices E3, E4 and E5.** `IF² × hours` is a
   quadratic function of a 30-s-smoothed power series; a 10 s sprint barely
   registers in a 30 s rolling window, and the whole session's _elapsed_ time is
   mostly recovery. The number will read ~45 while the neuromuscular and
   glycolytic cost is nothing like a 45-TSS ride. Barranco-Gil et al., _IJSPP_
   2024 makes the general version of this point directly: **work-matched is not
   fatigue-matched** — two ~15 kJ/kg sessions, one as 3-min reps at 110–120 % CP
   and one continuous at 60–70 % CP, left measurably different 2-min power
   afterwards.
2. **The Wingate adherence objection is contested, not settled.** The published
   debate (Biddle & Batterham, _IJBNPA_ 2015; Jung, Little & Batterham, _Front
   Psychol_ 2015) is genuinely two-sided, and more recent affect work finds an
   intensity × duration interaction where the _total exposure_ to unpleasantness
   is lower for supramaximal formats. What is not contested: all-out Wingates
   need a suitable ergometer and reliably produce nausea. Also note Burgomaster
   2005's most-dropped finding — **no change in VO₂peak** despite doubled
   endurance capacity.

---

## 8. Archetype F — Torque & cadence

**Read §11.4 before seeding any of this.** This is the weakest-evidenced
archetype in the library, and the standard justification for F1 is contradicted
by the cleanest trial in the literature.

### Prescription

| #   | Name                                           | Purpose                                                                                                                     | Structure (anchors)                                                                      | Duration  | TSS (est.) | Phase · freq    | Source                                                                                                                                                                    |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------- | ---------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Big-gear / torque intervals ("muscle tension") | **Claimed:** on-bike strength endurance. **Defensible:** low-cadence pacing tolerance and position-specific comfort         | 5 × **6 min at 80–90 % FTP at 50–60 rpm**, seated, 4 min easy at self-selected cadence § | 75–90 min | 60–80      | Base · 1×/wk    | Coaching convention. Nearest trials: Paton, Hopkins & Cook, _JSCR_ 2009; Nimmerichter et al., _EJAP_ 2012. **Contradicted** by Kristoffersen et al., _Front Physiol_ 2014 |
| F2  | Cadence ladder                                 | Broaden the comfortable cadence range; a _skill_ session                                                                    | 4 × (2 min at **70 / 85 / 100 / 115 rpm**) at constant Z2 power, 3 min easy §            | 75–90 min | 55–75      | Base · 1×/wk    | Convention; ERG mode makes it easy because power is cadence-independent                                                                                                   |
| F3  | High-cadence spin-ups                          | Neuromuscular smoothness at high leg speed                                                                                  | 8 × **30 s ramping to 120–130 rpm** at Z2 power, 90 s easy, inside a Z2 ride §           | 60–90 min | 40–60      | Base · 1×/wk    | Convention. Whitty et al. 2016 shows this _does_ shift freely-chosen cadence (92 → 101 rpm) — it just does not improve performance more than the low-cadence comparator   |
| F4  | Single-leg drills                              | **Claimed:** pedalling efficiency. **Evidence: essentially none.** Included so a library that omits it does so deliberately | 4 × (30 s left → 30 s right → 60 s both) at Z2, 2 min easy §                             | 45–60 min | 30–45      | Base · optional | Coaching convention only. No trial supports a transfer to two-legged efficiency                                                                                           |

### Notation & variants

| #   | Workout Notation                                                                                                                                                                                                                                                                          | Progression                          | Regression             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------- |
| F1  | `20 min warm-up → 5 × (6 min @ 80–90% FTP · Z3 → 4 min @ 55% FTP · Z1) → 10 min cool-down` § — **cadence lives only in `notes` today**                                                                                                                                                    | 6 reps; 6 → 8 min; 55 → 50 rpm       | 3 × 5 min at 60–65 rpm |
| F2  | `20 min warm-up → 4 × (2 min @ 65% FTP · Z2 → 2 min @ 65% FTP · Z2 → 2 min @ 65% FTP · Z2 → 2 min @ 65% FTP · Z2 → 3 min @ 55% FTP · Z1) → 10 min cool-down` § — the four steps are _identical in the notation_ because cadence is the only thing that varies, which is the whole problem | Widen the range to 60/80/105/120 rpm | Three rungs            |
| F3  | `30 min @ 65% FTP · Z2 → 8 × (30 s @ 65% FTP · Z2 → 90 s @ 60% FTP · Z2) → 20 min @ 65% FTP · Z2` §                                                                                                                                                                                       | 10 reps; 130 → 140 rpm               | 5 reps; 110 rpm        |
| F4  | `20 min warm-up → 4 × (30 s @ 60% FTP · Z2 → 30 s @ 60% FTP · Z2 → 1 min @ 65% FTP · Z2 → 2 min @ 55% FTP · Z1) → 10 min cool-down` §                                                                                                                                                     | 45 s per leg                         | 20 s per leg           |

**F2's notation renders four identical tokens.** That is not a rendering bug —
it is the honest output of a structure that cannot say what the session is
about. Any cadence-centric row is currently a lie by omission unless the
prescription is duplicated into `notes`, where it is unqueryable, invisible to
the AI planner, and unverifiable against the recording (even though
`ActivityStream`/`prisma/schema.prisma:738` already stores `cadenceAvg`).

---

## 9. Archetype G — Climbing, TT & race-specific

### Prescription

| #   | Name                          | Purpose                                                                                                               | Structure (anchors)                                                                                                        | Duration    | TSS (est.)                                           | Phase · freq                               | Source                                                                                                                                                              |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Climbing VO₂max repeats       | VO₂max stimulus with terrain enforcing steady power (no coasting)                                                     | 5 × **4 min uphill at 110–118 % FTP**, descend to recover (≈ 4–6 min)                                                      | 75–95 min   | 65–85                                                | Build · 1×/wk                              | Allen & Coggan L5 on a climb; hill-repeat convention                                                                                                                |
| G2  | Sustained climb threshold     | Climb-specific threshold in the position the event demands                                                            | 3 × **15 min uphill at 95–102 % FTP**, seated, descend to recover                                                          | 90–120 min  | 90–115                                               | Build, peak · 1×/wk                        | Convention                                                                                                                                                          |
| G3  | Seated / standing alternation | Rehearse the position switching every climber actually does; lowers post-effort lactate at matched VO₂ and efficiency | 4 × **6 min at 95–100 % FTP alternating 1 min standing / 2 min seated**, 5 min easy §                                      | 80–95 min   | 80–100                                               | Build, peak · 1× per 1–2 wks               | Millet, Tronche, Fuster & Candau, _MSSE_ 2002; Carlsson, Lindblom & Carlsson, _Front Sports Act Living_ 2024                                                        |
| G4  | TT race-pace session          | Rehearse goal power, position, pacing and fuelling simultaneously                                                     | 2 × **20 min at goal TT power** (≈ 95–100 % FTP for a 40 km TT; ~105 % for a 10 mile) in full aero position, 10 min easy ‡ | 90–110 min  | 90–115                                               | Peak · 1×/wk                               | TT convention. The _portable_ anchor here is **% of goal-event power**, which trainm8 cannot express (the cycling analogue of the running library's `racePace` gap) |
| G5  | Gran fondo simulation         | Durability plus repeated climbing efforts on accumulated fatigue                                                      | 3.5–4.5 h Z2 containing **4 × 10–15 min at 88–95 % FTP** spaced across the ride, fuelled to plan                           | 3.5–4.5 h   | 250–320                                              | Build, peak · 1× per 2 wks                 | Fondo/road-race convention; durability rationale as A4                                                                                                              |
| G6  | Triathlon brick               | Bike-to-run transition specificity; run economy under cycling fatigue                                                 | **90 min at 75–85 % FTP** (steady, aero, no surges) → **20 min run at easy-to-marathon effort**, transition < 5 min        | 115–130 min | ~95 bike + ~30 run (**two currencies — do not sum**) | Build, peak · 1×/wk                        | Triathlon convention; ADR 0007's brick case, one Workout with cardio steps in two disciplines                                                                       |
| G7  | Criterium simulation          | Repeated supra-threshold surges from a sub-threshold floor                                                            | 3 × **8 min alternating 15 s at 200 % FTP / 45 s at 85 % FTP**, 6 min easy †                                               | 80–95 min   | 80–100                                               | Peak, race week (reduced) · 1× per 1–2 wks | Crit-racing convention; the "micro-burst" family                                                                                                                    |

### Notation & variants

| #   | Workout Notation                                                                                                                                                                                                                               | Progression                        | Regression              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------- |
| G1  | `20 min warm-up → 5 × (4 min @ 110–118% FTP · Z5 → 5 min @ 50% FTP · Z1) → 15 min cool-down`                                                                                                                                                   | 6 reps; 4 → 5 min                  | 3 × 3 min               |
| G2  | `20 min warm-up → 3 × (15 min @ 95–102% FTP · Z4 → 8 min @ 50% FTP · Z1) → 15 min cool-down`                                                                                                                                                   | 4 reps; 15 → 20 min                | 2 × 12 min              |
| G3  | `20 min warm-up → 4 × (1 min @ 95–100% FTP · Z4 → 2 min @ 95–100% FTP · Z4 → 1 min @ 95–100% FTP · Z4 → 2 min @ 95–100% FTP · Z4 → 5 min @ 55% FTP · Z1) → 10 min cool-down` § — again, the standing/seated distinction exists only in `notes` | 5 sets; 6 → 8 min                  | 3 sets; 30 s standing   |
| G4  | `20 min warm-up → 2 × 20 min @ 95–100% FTP · Z4 (10 min rest) → 15 min cool-down` ‡                                                                                                                                                            | 2 × 25 min; then 1 × 40 min        | 2 × 15 min              |
| G5  | `60 min @ 65% FTP · Z2 → 12 min @ 88–95% FTP · Z3 → 45 min @ 65% FTP · Z2 → 12 min @ 88–95% FTP · Z3 → 45 min @ 65% FTP · Z2 → 12 min @ 88–95% FTP · Z3 → 40 min @ 65% FTP · Z2 → 12 min @ 88–95% FTP · Z3 → 30 min @ 62% FTP · Z2` †          | +30 min; or 5 efforts              | 2.5 h with 2 efforts    |
| G6  | `bike 15 min @ 60% FTP · Z2 → bike 75 min @ 78–85% FTP · Z3 → run 20 min @ RPE 4–5`                                                                                                                                                            | Bike 90 → 120 min; run 20 → 30 min | Bike 60 min; run 10 min |
| G7  | `20 min warm-up → 3 × (15 s @ 200% FTP · Z7 → 45 s @ 85% FTP · Z3 → … ×8 → 6 min @ 55% FTP · Z1) → 10 min cool-down` †                                                                                                                         | 4 sets; surge to 220 %             | 2 sets; 6 min each      |

**G4 is the cycling `racePace` gap.** The running library's central finding is
that _% of goal race pace_ is the most portable anchor and trainm8 cannot store
it ([workouts-running.md §13.3](workouts-running.md)). On the bike the same hole
exists as **% of goal event power** — and it is arguably more tractable, because
ADR 0009 already makes Event the plan anchor and a goal power is a single number
on it. G4, G5 and G7 all want it.

---

## 10. Archetype H — Tests, taper & race week

### Prescription

| #   | Name               | Purpose                                                                                                                    | Structure (anchors)                                                                                                                                         | Duration  | TSS (est.) | Phase · freq                         | Source                                                                                                                                 |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | 20-minute FTP test | Establish the anchor everything else is a ratio of                                                                         | 20 min warm-up incl. 3 × 1 min at 100+ rpm → **5 min all-out** → 10 min easy → **20 min maximal even effort** → cool-down. FTP = 0.95 × 20-min mean power ¶ | 60–75 min | 65–85      | Bookend every block · every 6–10 wks | Allen & Coggan, _Training and Racing with a Power Meter_                                                                               |
| H2  | Ramp test to MAP   | Establish **MAP / P**<sub>VO2max</sub> — the anchor Rønnestad and Bossi actually use, and the one trainm8 has no field for | Progressive ramp (e.g. +25 W/min from 100 W) to volitional exhaustion; record final 1-min mean power = MAP ‡ ¶                                              | 30–45 min | 45–60      | Bookend every block · every 8–12 wks | Ramp-test convention; the anchor in Rønnestad's and Bossi's protocols                                                                  |
| H3  | Race-week opener   | Restore neuromuscular sharpness without adding fatigue; the day-before ride                                                | 45–60 min Z2 containing **3 × 3 min at 95–100 % FTP** (3 min easy) and **3 × 15 s maximal** (3 min easy)                                                    | 45–60 min | 35–50      | Race week · 1× (the day before)      | Taper convention. See [planning-calendar-and-wellness.md §2.2](planning-calendar-and-wellness.md) — cut volume 41–60 %, hold intensity |

### Notation & variants

| #   | Workout Notation                                                                                                                                | Progression                                    | Regression                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| H1  | `20 min warm-up → 5 min @ RPE 10 → 10 min @ 50% FTP · Z1 → 20 min @ RPE 9–10 → 10 min cool-down` ¶                                              | The test does not progress — the _result_ does | Use the ramp test (H2) instead; 20 min all-out pacing is a learned skill beginners fail at |
| H2  | `10 min warm-up → 20 min @ RPE 6–10 → 10 min cool-down` ¶ — **a ramp is not expressible**; this renders as a flat step with a wide RPE band     | —                                              | —                                                                                          |
| H3  | `15 min @ 60% FTP · Z2 → 3 × (3 min @ 95–100% FTP · Z4 → 3 min @ 55% FTP · Z1) → 3 × (15 s @ RPE 10 → 3 min @ 55% FTP · Z1) → 10 min cool-down` | —                                              | Drop to 2 × 3 min                                                                          |

**H2 exposes a second structural gap: there is no ramp step.** The repo's own
planning research already derived the correct effective-IF closed form for a
ramp (`sqrt((a² + ab + b²)/3)`,
[planning-calendar-and-wellness.md §1.4](planning-calendar-and-wellness.md)) and
noted that _every_ published structured-workout format carries a ramp target. A
ramp test is the single most common cycling session that cannot be written down
here.

---

## 11. The contested bits, in detail

### 11.1 Sweet spot: origin, definition, and the absence of evidence

**Origin.** The best-documented account is that **Frank Overton (FasCat
Coaching) coined the term in January 2005**, while in a private beta group of
coaches and scientists testing Andrew Coggan's power-based impulse-response
performance model. The underlying figure is two curves — training
effect/adaptation and physiological strain — with "sweet spot" the region
producing the greatest adaptation for the least strain. Coggan is consistently
credited with the _levels_ and the model; Overton with the _name_.

_Uncertainty, stated plainly:_ this is a **self-attribution by the party who
benefits from it**, and I could not verify from an independent primary source
which of the two produced the original adaptations-vs-strain chart or the "Level
3.5" shorthand. The searchable record has laundered the story through coaching
blogs. Treat the chart's authorship as unresolved.

**Why the numbers float.** Coggan's levels are L3 Tempo **76–90 %** and L4
Lactate Threshold **91–105 %**
([zones-and-thresholds.md §2.1](zones-and-thresholds.md)). Sweet spot is
_definitionally a straddle of the L3/L4 boundary_ — it is not a Coggan zone.
Competing definitions:

| Range            | Attributed to                                                                     | Note                                                                                         |
| ---------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **84–97 % FTP**  | Overton / FasCat                                                                  | The widest, and the one tied to the original adaptation-per-strain argument                  |
| **88–94 % FTP**  | An indoor training platform (unattributed in its own publication; not named here) | Described as "a gray area between Tempo and Threshold"; makes no reference to Coggan's zones |
| 88–93 %, 83–97 % | Circulating in coaching media                                                     | Untraceable to a primary author; drift, not doctrine                                         |

The spread exists because **no physiological landmark is being described**.
Nobody measured a breakpoint at 88 % or 94 %. Each publisher picks a width that
suits its product: narrow reads as harder and more threshold-like, wide is more
prescribable.

**The evidence.** PubMed for `"sweet spot" training cycling` returns **zero
relevant hits**. Europe PMC for
`"sweet spot" AND (FTP OR "functional threshold power" OR cyclists)` returns 45
records, **none** studying sweet-spot training. There is no study establishing
that 88–94 % FTP is qualitatively different from 85 % or 97 %.

**What _is_ evidenced** is the adjacent practice, from Rønnestad's group, framed
as moderate-intensity interval (MIT) blocks:

- **Mølmen et al., _MSSE_ 2025** (PMID 40101160): 30 well-trained cyclists,
  crossover. A MIT microcycle of **6 sessions in 7 days, 5–7 × 10–14 min at Borg
  14–15** (measured: 66 % P<sub>VO2max</sub>, 85 % HRmax, 2.8 mmol·L⁻¹) beat
  time-matched, TRIMP-matched mostly-easy training on power at 4 mmol (+4.0 % vs
  −1.3 %), P<sub>VO2max</sub> (+2.5 % vs −0.7 %) and VO₂max (+2.0 % vs 0.0 %).
  15-min power was not significantly different.
- **Rønnestad et al., _Eur J Sport Sci_ 2025** (PMID 41169000): MIT block vs HIT
  block, 22 cyclists. **Both improved 15-min power equally** (4.9 % vs 2.8 %, p
  = 0.44); MIT better for power at 4 mmol, HIT trending better for sprint power.

Read honestly: **sub-threshold interval blocks work and are not inferior to
harder work for TT-type performance.** That supports the practice. It gives no
support at all to a specific 88–94 % window, and note the second finding cuts
against the whole "sweet spot is uniquely efficient" framing — so did HIT.

**Product consequence.** Sweet spot must never be shipped as a _band_ in
`coggan-power-7`; it straddles two bands by construction. If it ships at all it
ships as an **archetype label** with an explicitly stated range and honest
provenance ("a coaching heuristic; no primary literature").

### 11.2 Over-unders and the lactate-clearance story

The rationale is uniform across coaching sources: the overs produce lactate, the
unders train clearance. Every link in the underlying chain is real:

- **The lactate shuttle is solid.** Brooks, _Cell Metabolism_ 2018 (PMID
  29617642): lactate forms continuously under aerobic conditions and shuttles
  between cells as fuel, gluconeogenic precursor and signalling molecule.
- **MCT1/MCT4 are trainable.** Dubouchaud, Butterfield, Wolfel, Bergman &
  Brooks, _AJP-Endo_ 2000 (PMID 10751188): 9 weeks of cycling **at a steady 75 %
  VO₂peak** raised muscle MCT1 +90 %, sarcolemmal MCT1 +60 %, mitochondrial MCT1
  +78 %, sarcolemmal MCT4 +47 %.
- **MCT1 tracks removal.** Thomas et al., _J Appl Physiol_ 2005 (PMID 15531559):
  MCT1 content correlated with the slow-phase velocity constant of blood lactate
  removal (r = 0.70).

**Where the chain breaks.** Every one of those studies concerns _chronic
endurance training_ raising transporter content, and Dubouchaud's protocol was
**steady-state riding, not over-unders**. There is **no study showing that
alternating above and below threshold produces greater lactate-transport or
clearance adaptation than a work-matched constant-power interval.** A screen of
277 Europe PMC records on varied vs constant-power intervals in cyclists turned
up no such comparison.

The defensible steel-man is different from the one coaches state: surging raises
average VO₂ and time at a high fraction of VO₂max for a given mean power — which
is **Bossi's mechanism (D6), not a lactate-handling mechanism**. If trainm8
describes over-unders in-product, that is the description to use.

### 11.3 Zone 2, PGC-1α, and the polarized-base argument

Two claims are routinely made for endurance riding and they have very different
support.

**Claim 1: "zone 2 is uniquely/optimally mitochondrial." Not supported by human
molecular data — the data point the other way.**

- **San Millán & Brooks 2018** (_Sports Medicine_, PMID 28623613), the paper
  everyone cites, is a **cross-sectional descriptive study** comparing
  professionals, moderately active people and metabolic-syndrome patients,
  showing FATox and blood lactate are inversely correlated (r = −0.76 pooled).
  It is not a training intervention, it does not show zone 2 causes
  mitochondrial adaptation, and it does not identify an optimal training
  intensity. Reading it as an intervention is a category error.
- **Granata, Oliveira, Little, Renner & Bishop, _FASEB J_ 2016** (PMID
  26572168): 4 weeks, three groups — SIT, HIIT, and **sub-lactate- threshold
  continuous training** work-matched to HIIT. Maximal mitochondrial respiration
  rose **only after SIT** (+25 %); PGC-1α, p53 and PHF20 rose **only after SIT**
  (+60–90 %). The sub-threshold group showed nothing.
- **MacInnis & Gibala, _J Physiol_ 2017** (PMID 27748956): mitochondrial
  biogenesis signalling "depends largely on exercise intensity"; increases in
  mitochondrial content are if anything superior after HIIT vs work-matched
  MICT.

The honest case for endurance riding is the **load-management** one: it is the
intensity at which large volumes are recoverable, and volume is the consistent
signature of successful endurance athletes. That is a strong argument. It is not
a molecular one.

**Claim 2: "base needs three months of easy-only riding." No evidence exists
either way, and what exists points against it.** No trial tests a 3-month
exclusively-LIT block against an alternative. Mølmen 2025 showed a _single week_
of moderate-intensity intervals beat TRIMP-matched mostly-easy training on
several markers **during the general preparation phase** — exactly the period
base dogma reserves for easy riding. The 3-month prescription is tradition, not
a tested claim.

**On polarized vs pyramidal, this document defers entirely to
[intensity-distribution.md §4](intensity-distribution.md)**, which already
carries the Rosenblat 2025 IPD network meta-analysis (no POL/PYR difference for
VO₂max or TT), the 2022 MSSE point/counterpoint, and the observational
marathon-scale data. Two cycling-specific additions worth recording here:

- **Galán-Rioja, Gonzalez-Ravé, González-Mohíno & Seiler, _IJSPP_ 2023** (PMID
  36640771), a cyclist-specific systematic review of 7 studies: **"No evidence
  is currently available favoring a specific periodization model during 8 to 12
  weeks in trained road cyclists."**
- **Filipas, Bonato, Gallo & Codella 2022** (_SJMSS_, PMID 34792817): four
  16-week sequences, all effective, **PYR → POL maximised gains** — supporting
  _sequencing_ over model dogma.

### 11.4 Torque work and cadence: what the trials actually found

The standard F1 prescription (5–10 min at 50–60 rpm at 80–90 % FTP) has **no
experimental provenance** — the training studies used different parameters
entirely, and they conflict:

| Study                                                                 | Protocol                                        | Result                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Paton & Hopkins, _JSCR_ 2005                                          | explosive + high-resistance intervals           | substantial sprint and endurance gains                                                                                       |
| Paton, Hopkins & Cook, _JSCR_ 2009                                    | 4 wk, 60–70 vs 110–120 rpm                      | LC "probably more effective"; mechanism unclear                                                                              |
| Nimmerichter, Eston, Bachl & Williams, _EJAP_ 2012                    | 4 wk, 60 rpm uphill vs 100 rpm flat             | favoured LC — but confounds gradient with cadence                                                                            |
| **Kristoffersen, Gundersen, Leirdal & Iversen, _Front Physiol_ 2014** | **12 wk, 40 rpm, 73–82 % HRmax, 2×/wk, n = 22** | **Null. No gain in VO₂max, performance, or leg strength. The freely-chosen-cadence control improved VO₂max and power at LT** |
| Ludyga, Gronwald & Hottenrott, _JSAMS_ 2016 / _JSS_ 2017              | 4 wk HC vs LC                                   | endurance gains **identical**; only EEG differed                                                                             |
| Whitty, Murphy, Coutts & Watsford, _APNM_ 2016                        | 6 wk, ±20 % preferred cadence                   | HC raised freely-chosen cadence 92 → 101 rpm; LC improved short TT more                                                      |
| Hebisz & Hebisz, _PLoS One_ 2024                                      | SIT+HIIT at 50–70 vs > 80 rpm                   | favoured low cadence                                                                                                         |

**Read sceptically.** "Low cadence" spans 40–70 rpm across these; interventions
run 4–12 weeks; several use magnitude-based inference, a method since largely
discredited for inflating positive findings. The **longest study, with the
largest n, a proper freely-chosen-cadence comparator and conventional
statistics, found nothing** — including no strength gain, which is the specific
claim F1 makes.

**The force argument is sound.** At 300 W and 60 rpm mean crank torque is
roughly 48 N·m; peak pedal force is a small fraction of a maximal squat and is
repeated for hundreds of cycles. That is an endurance stimulus, not a strength
stimulus — consistent with Kristoffersen's null on leg strength.

**Critically, no study isolates force from power.** Almost all compare LC to HC,
not LC to _self-selected cadence at matched power_. The actual question — does
big-gear work add anything over the same power at 90 rpm? — is **unanswered**,
with the one 12-week attempt returning no.

**The evidenced alternative is gym work**, and it is a coherent, replicated
literature: Mujika, Rønnestad & Martin, _IJSPP_ 2016; Rønnestad, Hansen, Hollan
& Ellefsen, _SJMSS_ 2015 (25 weeks); Rønnestad, Hansen & Nygaard, _J Sports Sci_
2017; Vikmoen et al., _SJMSS_ 2016 and _Physiol Rep_ 2017 (largest effects
**after prolonged submaximal work** — the durability context). Protocol
reference: 4 leg exercises, 3 × 4–10 RM, twice weekly, 11 weeks (Vikmoen et al.,
_EJAP_ 2020).

**Cadence generally.**

- Economy-optimal cadence is **load-dependent**, not fixed at 60 rpm: lowest VO₂
  shifted from 60 rpm at 0 W to **80 rpm at 350 W** (Foss & Hallén, _EJAP_
  2004).
- In ~30-min TTs, finishing times were **3.5 % / 1.7 % / 10.2 % slower at 60 /
  100 / 120 rpm** relative to 80 rpm, and gross efficiency was also best at 80
  rpm — elite cyclists **perform best at their most efficient cadence** (Foss &
  Hallén, _EJAP_ 2005). This substantially weakens the folk story that pros spin
  fast despite inefficiency.
- The freely-chosen/economical gap is largest in **non-cyclists** (≈ 80 vs 50
  rpm) and selection tracks minimising **muscle strain and mechanical load**,
  not metabolic economy (Whitty et al., _EJAP_ 2009).
- **Low cadence recruits more type II, not less** — the opposite of the folk
  claim: type II glycogen depletion was significantly greater at 50 rpm than 100
  rpm at ~85 % VO₂max (Ahlquist, Bassett, Sufit, Nagle & Thomas, _EJAP_ 1992; n
  = 8, single session).
- Across 177 professionals, **cadence showed no meaningful difference between
  performance levels**; differences in mean-maximal power were driven by
  **torque** (Leo, Mateo-March, Valenzuela, … Lucia, _IJSPP_ 2023).

**Verdict for the library:** keep F1–F3 as _skill and comfort_ sessions with
honest labels. Do not describe F1 as strength work. F4 should ship, if at all,
flagged as unevidenced.

### 11.5 Indoor vs outdoor

| Difference                      | Mechanism                                                                                                                                                                                                                                                                  | Consequence for a training app                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VI ≈ 1.00–1.02 in ERG**       | Power is servo-clamped; the fluctuation NP is designed to detect has been engineered away                                                                                                                                                                                  | For the _same average power_, NP, IF and TSS all run **higher outdoors** (VI 1.05–1.25+). Not a metric bug — the surges genuinely cost more          |
| **No freewheeling indoors**     | A trainer needs continuous torque to hold flywheel speed; outdoors, descents and coasting can be 10–20 %+ of elapsed time                                                                                                                                                  | A 60-min indoor ride has materially higher **TSS density** than 60 min outdoors. Comparing raw durations across environments understates indoor load |
| **Thermal load**                | Without ~30 km/h of convective airflow, skin temperature rises, cutaneous blood flow increases, stroke volume falls, HR drifts up at the same power. Mieras, Heesch & Slivka, _JSCR_ 2014 measured **cooler skin temperature outdoors** and a larger core-to-skin gradient | **hrTSS systematically overstates indoor sessions** relative to power-based TSS. The ADR 0008 fallback ladder is environment-blind                   |
| **Cadence-independence in ERG** | The trainer holds power regardless of cadence                                                                                                                                                                                                                              | Excellent for isolating cadence (F2/F3); **bad for the pacing skill outdoor riding demands**                                                         |
| **Measured power difference**   | Contested — see below                                                                                                                                                                                                                                                      | Do **not** apply a global correction factor                                                                                                          |
| **Variability**                 | Jeffries, Waldron, Patterson & Galna, _IJSPP_ 2019, n = 20 competitive cyclists: greater magnitude of power-output variability **outdoors**                                                                                                                                | The empirical basis for the VI argument above                                                                                                        |

**The "indoor FTP is ~5 % lower" rule is folklore.** The peer-reviewed picture
is heterogeneous and points at habituation, not physics:

- Mieras et al. 2014: 40 km at matched RPE, **outdoor 208 W vs lab 163 W** (+27
  %) in recreationally trained men — a much larger gap than 5 %.
- Vinetti et al., _JSCR_ 2023: **field FTP exceeded lab FTP** in junior road
  cyclists.
- **Kowalski, Sadowska & Wiecha 2024** (n = 43 well-trained triathletes): **no
  significant group-level difference** in sprint power or FTP indoors vs
  outdoors, but high individual variability, with the direction and size of the
  gap predicted by **training-environment history** and BMI (R² 0.80 / 0.68).
- Smith, Davison, Balmer & Bird, _IJSM_ 2001: mean power is highly reproducible
  in **both** settings, so the difference is not a measurement artefact.

**So: the indoor/outdoor delta is athlete-specific and partly a habituation
artefact. Model it per athlete or not at all.** And note the uncomfortable
corollary of Bossi 2020 — constant power is the _inferior_ stimulus for time at
VO₂max — so an app that silently defaults intervals to ERG is defaulting to the
weaker version of its own VO₂max sessions.

### 11.6 Climbing

- **Standing does not cost efficiency.** Millet, Tronche, Fuster & Candau,
  _MSSE_ 2002: 6-min trials at 75 % peak power — **no significant difference**
  in gross efficiency or economy across level-seated, uphill-seated and
  uphill-standing. Heart rate was significantly higher standing, and short-term
  peak power was much higher standing (**803 ± 103 W vs 635 ± 123 W**, +26 %).
  The reading: stand for surges and steep pitches; standing is not "wasteful",
  but it does raise cardiovascular strain at matched power.
- **Position switching has a small measured basis.** Carlsson, Lindblom &
  Carlsson, _Front Sports Act Living_ 2024: 10 elite cyclists, 6.8 % gradient,
  5-min tests — continuous standing, continuous seated, and **alternating every
  10 s**. No difference in VO₂, metabolic rate or gross efficiency, but
  **significantly lower post-exercise blood lactate in the alternating
  condition** (n = 10, single session). This is the citation for G3.
- **Gradient and cadence both reduce gross efficiency in the field.**
  Nimmerichter et al., _IJSPP_ 2015: **20.6 % at 60 rpm vs 18.1 % at 90 rpm** (P
  < .001), efficiency falling with cadence and gradient. Mildly in tension with
  Millet 2002; treat gradient effects on economy as small and
  cadence-confounded.
- **Hill repeats have no dedicated evidence base.** The only training study
  (Nimmerichter 2012) confounds gradient with cadence. Hill repeats are best
  justified as (a) terrain enforcing steady power with no coasting, (b) event
  specificity, and (c) the standing-power headroom Millet documented — **not**
  as a distinct physiological stimulus.

---

## 12. Programming: phase × goal × level

### Which archetypes dominate which phase

| Phase               | Dominant rows                             | Quality sessions/wk         | Notes                                                                                                                              |
| ------------------- | ----------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Base**            | A1–A3, B1–B2, B5, C2, F1–F3, D3, E4       | 1–2                         | Volume is the point. Note §11.3: "easy only" is tradition, not evidence — a MIT block (B4) in general prep is defensible           |
| **Build**           | B2–B4, C1–C4, C6, D1, D4–D6, E1–E2, G1–G2 | 2–3                         | The archetype-densest phase; where every named protocol lives                                                                      |
| **Peak / specific** | C5, D1, D6, E6, G3–G5, G7                 | 2–3                         | Sessions converge on event demands. Volume plateaus, specificity rises                                                             |
| **Taper**           | A1–A2 (shortened), reduced D2/C1, E4      | 1–2, sharp and short        | Cut **volume** 41–60 %, hold intensity and frequency — [planning-calendar-and-wellness.md §2.2](planning-calendar-and-wellness.md) |
| **Race week**       | A1, H3, one reduced E6/G7                 | 1 (a primer, not a workout) | Nothing here builds fitness                                                                                                        |

### Which archetypes dominate which goal

| Goal                | Signature sessions           | De-emphasised                                                                           |
| ------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| **Road racing**     | E1–E2, E6, G7, D4, C3–C4, A3 | Very long steady TT-position work                                                       |
| **Gran fondo**      | A2, A4, G5, B3, C5, G2       | E3, G7, most anaerobic work                                                             |
| **Time trial**      | C1, C5, G4, D1, B3           | E4–E5, G7; anything unseated                                                            |
| **Triathlon**       | G6, C5, B2–B3, A2, D1        | E3–E5, G7 — sprint work has low transfer and high recovery cost against a run/swim load |
| **General fitness** | A2, B1–B2, D2, E4, F2        | Block structures, D4 at full dose, E3                                                   |

### Level scaling

| Level            | Volume    | Quality/wk               | Rows to avoid                           | How to regress                                                                            |
| ---------------- | --------- | ------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Beginner**     | < 5 h/wk  | 1–2                      | B4 in block form, D3, D4, E1–E3, G5, H1 | Cut rep count first, then rep length, then lengthen recovery. **Never soften the anchor** |
| **Intermediate** | 5–10 h/wk | 2–3                      | B4 in block form; D4 at 5 series        | Reduce sets before intensity                                                              |
| **Advanced**     | 10 h+/wk  | 3, or a block microcycle | —                                       | Extend duration → add reps → shorten recovery → raise intensity, in that order            |

**One caution on progression, from Seiler himself.** His 2010 review
(PMID 20861519) concludes that "training intensification studies performed on
already well-trained athletes do not provide any convincing evidence that a
greater emphasis on high-intensity interval training in this highly trained
athlete population gives long-term performance gains." An app whose progression
logic only ever adds intensity is progressing against the evidence.

**The regression rule, stated once.** Every regression here reduces _volume or
density_, never the anchor. That is what makes the anchor portable: a 180 W and
a 380 W rider doing `4 × 8 min at maximal sustainable even effort` are doing the
same session. Drop one to 85 % FTP and they are not — they are doing a tempo
ride with extra steps.

**Block periodization did not survive scaling up — state this plainly.** The
model is real and published: Rønnestad, Hansen & Ellefsen, _SJMSS_ 2014
(PMID 22646668) gave the block arm **five HIT sessions in week 1 then one per
week for weeks 2–4**, against two per week for four weeks in the traditional
arm, with matched HIT and LIT totals; the block arm gained VO₂max +4.6 %,
W<sub>max</sub> +2.1 % and power @ 2 mM +10 % while the traditional arm changed
on **nothing**. The 12-week version (PMID 23134196) repeated a five-HIT week
every fourth week and again favoured blocks (VO₂max +8.8 % vs +3.7 %).

Three problems. **(1) A taper-timing confound that cannot be separated from the
independent variable.** The block arm's final three weeks are one HIT session
per week — functionally a reduced-load lead-in to the post-test — while the
traditional arm is tested straight off a normal two-HIT week. **(2) The control
arm improving by literally nothing over four weeks is implausible** and suggests
residual fatigue at testing. **(3) n = 10 vs 9, and n = 8 vs 7.**

The two adequately powered tests are null. **Sylta et al., _MSSE_ 2016** (PMID
27300278; **n = 63 cyclists, 12 weeks**, three HIT sequencing models at matched
load, authors include Rønnestad, Sandbakk and Seiler) — all groups improved 5–10
% in 40-min power, **no differences between groups**; sequencing "has little or
no effect on training adaptation when the overall training load is the same".
**Almquist et al., _Front Physiol_ 2022** (PMID 35299664) — 12 weeks block vs
traditional, both +9 % on 5-min TT and +8 % on 40-min TT, **no difference**,
VO₂peak unchanged in both.

What the field has repositioned to is narrower and better supported: **a shock
microcycle followed by ~6 days of reduced load produces a measurable bump** —
and that now looks achievable with _moderate_-intensity blocks too (Mølmen 2025;
Rønnestad et al. 2025, where MIT beat HIT on power @ 4 mM). Which is closer to a
taper claim than a periodization claim. Add the cyclist-specific review finding
**no periodization model favoured over 8–12 weeks** (Galán-Rioja et al. 2023),
and blocks are a legitimate option, not a settled superiority. **A plan
generator must not present block periodization as the evidenced default.**

---

## 13. Implications for trainm8

The template-catalogue argument (`WorkoutTemplate` as a seeded, cited,
archetype-tagged entity distinct from `WorkoutSession`) is made in full in
[workouts-running.md §13.1–13.2](workouts-running.md) and applies unchanged.
This section records only what is **new or different on the bike**.

### 13.1 Nested repeats are the blocking structural gap

`BlockSchema` (`app/utils/workout-schema.ts:192`) is
`{ name?, repeatCount, steps[] }` and `WorkoutStructureSchema` holds a **flat
array of blocks**. One repeat level. The sessions this makes unauthorable are
not exotic:

| Row                 | Real structure                              | Why it matters                                         |
| ------------------- | ------------------------------------------- | ------------------------------------------------------ |
| D4 Rønnestad 30/15  | `3 × (13 × 30 s work, 12 × 15 s relief)`    | The most-cited cycling interval protocol of the decade |
| C3/C4 over-unders   | `3 × (6 × (2 min over → 2 min under))`      | Renders as 27 tokens unrolled                          |
| C6 broken threshold | `2 × (4 × (6 min → 1 min))`                 |                                                        |
| E1/E2 sets of reps  | `2 × (5 × (1 min → 3 min))`                 | Any set-of-sets session                                |
| G7 micro-bursts     | `3 × (8 × (15 s → 45 s))`                   |                                                        |
| A3 sprints in LIT   | `3 × (3 × (30 s → 4 min))` inside a Z2 ride |                                                        |

Six of forty-one rows — and they include the most-cited ones. The fix is either
a self-referential `Block` (`children: Block[]`) or a `group` step kind; the
notation already renders group parens (`3 × (3 min Threshold → 1 min Easy)`,
`app/utils/workout-notation.test.ts:180`) so the **renderer needs recursion, not
new vocabulary**. The repo's own planning research reached the same conclusion
from the format survey: _"Repeats wrap an arbitrary list, never a fused pair"_
([planning-calendar-and-wellness.md §1.3](planning-calendar-and-wellness.md)).

### 13.2 The intensity union needs three more members and one _shape_ change

`IntensityTargetSchema` (`app/utils/workout-schema.ts:57`) has seven kinds.
Missing, in priority order:

1. **A generalised power-percentage anchor.** Today `powerPct` implicitly means
   FTP. It should carry an explicit anchor:
   `{ kind: 'powerPct', anchor: 'ftp' | 'map' | 'cp' | 'p5min' | 'p20min', minPct, maxPct }`.
   Renders as `@ 105% FTP`, `@ 90% MAP`, `@ 110% CP`. The resolver work is
   small; the honesty payoff is large, because **CP ≠ FTP** and silently
   resolving a CP-anchored protocol against FTP fabricates the prescription.
   `p5min` / `p20min` are already derivable — `app/utils/personal-records.ts`
   computes best efforts.
2. **An `open` / self-paced target with a constraint.**
   `{ kind: 'openEffort', constraint: 'maximalSustainableEven' | 'allOut', rpeHint? }`.
   Seiler's entire 4×4/4×8/4×16 result, Rønnestad's short/long comparison, the
   Wingate protocol and both field tests are self-paced. Today they degrade to
   `@ RPE 9`, which loses the _even-effort-across-all-reps_ constraint that
   **is** the protocol. `planned-tss.ts` already has an `open` step outcome that
   contributes nothing and does not penalise confidence — the scaffolding
   exists.
3. **A `ramp` target** (`{ kind: 'ramp', from, to }`). Every published
   structured-workout format has one; the correct effective IF is already
   derived in
   [planning-calendar-and-wellness.md §1.4](planning-calendar-and-wellness.md).
   Without it a ramp test (H2) and every honest warm-up are unwriteable.
4. **RPE needs a scale discriminator.** `rpe` is `min(1).max(10)` — CR10 only.
   Rønnestad's MIT protocol prescribes **Borg 6–20, 14–15**. Storing that as
   "RPE 5" is a silent, uncited conversion. Add `scale: 'cr10' | 'borg620'`.

### 13.3 Cadence is a prescription, not telemetry

`CardioStepSchema` has no cadence field, yet six rows in this library (F1–F4,
E5, G3) have cadence or body position as their **defining parameter** — the
thing that distinguishes them from an otherwise-identical step. F2's notation
renders four identical tokens for four different rungs. Meanwhile
`ActivityStream` already stores `cadenceAvg` (`prisma/schema.prisma:738`), so
the _measured_ side exists and the _prescribed_ side does not, which means these
sessions can never be verified against their recording (ADR 0034).

Minimum viable: `cadenceRpmMin/Max` on a cardio step, rendering as a facet
(`6 min @ 80–90% FTP · Z3 · 50–60 rpm`). A `position: 'seated' | 'standing'`
enum would additionally unblock G3, but cadence is the higher-yield half.

**Ship it with honest copy.** §11.4 is unambiguous: the evidence for cadence and
torque work as _performance levers_ is weak-to-null. The field is needed for
**prescription fidelity** — so the app can say what the session actually is —
not because low cadence is a proven stimulus. Any seeded F1 description that
says "builds strength" is contradicted by the best trial in the literature.

### 13.4 Recovery intensity is a protocol variable, and planned TSS prices it at zero

`RestStepSchema` (`app/utils/workout-schema.ts:179`) permits only `durationSec`
and `notes` — a rest step **cannot carry an intensity**. And
`app/utils/load/planned-tss.ts:92` classifies every non-cardio step as `open`,
contributing zero TSS with no confidence penalty.

Both are wrong for cycling intervals. Skiba et al., _MSSE_ 2012 established that
the time constant of W′ reconstitution correlates negatively with (CP − recovery
power): **how far below threshold you recover determines how much W′ comes
back**, and therefore whether the next rep is completable. "4 min at 55 % FTP"
and "4 min at 75 % FTP" are different sessions. Concretely: 4 × 4 min of
recovery at 50 % FTP is 16 min at IF 0.5 ≈ **7 TSS** that the planner currently
records as 0 — small per session, systematic across a plan.

Two options: allow an intensity on rest steps, or (cleaner, and consistent with
the discriminated union) drop `rest` for cardio recoveries and author them as
cardio steps with a low target, keeping `rest` for genuinely passive strength
rests. The Token Sentence already handles both — `4 × 8 min (4 min rest)` and
`4 × (8 min @ 105% FTP · Z4 → 4 min @ 55% FTP · Z1)`. The library above uses the
second form deliberately.

### 13.5 Execution mode belongs on the session

Indoor-ERG, indoor-free and outdoor are not cosmetic (§11.5). They change VI and
therefore NP/IF/TSS; they change TSS _density_ per elapsed minute because
coasting disappears; and they change HR at matched power, which biases `hrTSS` —
the ADR 0008 fallback rung — upward indoors. A single `executionMode` enum on
the Workout (planned) and the Recording (actual) lets the app:

- explain a VI of 1.01 as ERG rather than as flawless pacing;
- label an indoor 60-min ride's higher TSS-per-hour honestly;
- flag when a plan's power-anchored prescription is being executed in an
  environment where HR would mislead;
- **and refuse to apply a global indoor FTP correction**, which Kowalski 2024
  shows is not defensible. If a correction is ever offered it must be
  per-athlete and derived from that athlete's own paired data.

There is also a product-design consequence worth stating: if intervals default
to ERG, they default to constant power, and Bossi 2020 says constant power is
the **weaker** VO₂max stimulus. A "let the power vary within the interval"
option is a real feature, not a UI preference.

### 13.6 Secondary implications

- **Goal-event power is the bike's `racePace`.** G4/G5/G7 want "% of goal event
  power". ADR 0009 already makes Event the plan anchor; a `goalPowerW` (or goal
  duration + goal power) on the Event resolves it honestly and degrades to the
  bare authored form when absent, exactly as `powerPct` does without FTP
  (`app/utils/workout-notation.test.ts:396`).
- **Self-paced sessions will read as non-adherent.** A correctly executed D1
  deviates from any authored power target by design. Sessions need an
  effort-anchored flag that suppresses power-based adherence scoring (ADR 0019)
  and structure verification (ADR 0034) — the same conclusion the running
  library reached for hills, arrived at from a different direction.
- **Sweet spot must not become a zone band.** `coggan-power-7` is a fixed
  seven-band recipe and sweet spot straddles Z3/Z4. If it appears in the product
  it is an **archetype tag** carrying its own stated range and a provenance line
  saying it is a coaching heuristic with no primary literature.
- **A `citationConfidence` or `evidenceGrade` on a template is genuinely needed
  here.** This library spans "randomised controlled protocol with a DOI" (D1,
  D2, D4, B4) and "widely practised, contradicted by the only good trial" (F1).
  Presenting both as "cited" flattens a distinction the athlete deserves — and
  it is the same honesty bar ADR 0033 already sets for detection confidence.
- **Strength templates should cross-reference this library.** ADR 0047 has
  strength progressing by anchor and ramp; the cycling-relevant protocol is
  concrete and published (4 leg exercises, 3 × 4–10 RM, 2×/wk, 11 weeks —
  Vikmoen et al. 2020) and is the **evidenced substitute** for F1, not a
  separate concern. ADR 0046's refusal to price strength in TSS stands.

### ADRs this research challenges

| ADR                                                  | What it decided                                                                 | What the evidence says                                                                                                                                                                 | Verdict                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **0007** Step as a discriminated union               | Blocks hold a flat ordered list of steps; `IntensityTarget` is a 7-member union | Blocks must **nest** — 6 of 41 rows, including the most-cited ones, are set-of-sets. The union needs an anchored `powerPct`, an `openEffort` target and a `ramp` target                | **Amend**                |
| **0007** Rest step carries only duration             | `rest` → only `durationSec` and `notes`                                         | Recovery _intensity_ is a protocol variable (W′ reconstitution scales with CP − recovery power). Either allow intensity on rest, or reserve `rest` for passive strength rests          | **Amend**                |
| **0027** Text-first authoring                        | Render, never parse; one repeat level; en-GB glue                               | The render-never-parse invariant holds and is correct. The **renderer needs recursion** for nested groups; group-paren rendering already exists                                        | **Amend**                |
| **0002** Step quantification                         | Duration XOR distance                                                           | No **cadence** and no **gradient/position** parameter. Six rows have cadence as their defining variable, and `ActivityStream.cadenceAvg` already exists on the measured side           | **Amend**                |
| **0005** Athlete Profile & thresholds                | Per-discipline FTP / LTHR / threshold pace / CSS                                | Cycling needs **MAP** and **CP + W′** as first-class anchors (CP ≠ FTP, and the gap widens with fitness), plus a goal-event power on the Event                                         | **Amend**                |
| **0006** Zone system in code                         | Immutable recipe constants, bands declare a Training Zone                       | Correct, and sweet spot proves it: a construct that straddles Z3/Z4 must be an **archetype label**, never a band. Also reconfirms the gapped-edge defect in `coggan-power-7`           | **Amend**                |
| **0008** TSS triad, HR-first fallback                | hrTSS when power is absent                                                      | The ladder is **environment-blind**: HR runs high indoors from thermal load, so hrTSS systematically overstates indoor sessions relative to power TSS                                  | **Amend**                |
| **0019** Planned TSS & adherence                     | Midpoint IF per step, summed; asymmetric adherence bands                        | Rest steps price at zero although recovery valleys carry real load; and self-paced sessions (D1, D3, D5, E3, H1) cannot be adherence-scored against a power target at all              | **Amend**                |
| **0024** Normalized Power                            | NP computed from the activity stream                                            | Correct — and the interpretation needs an execution mode: **VI ≈ 1.00 in ERG by construction**, so a low VI is an environment fact, not a pacing achievement                           | **Amend**                |
| **0016** AI plan generation                          | Cardio-only V1, preview → approve                                               | Generation should retrieve from a cited template catalogue and substitute anchors. Additionally the model must not invent sweet-spot/torque rationales the literature does not support | **Amend**                |
| **0034** Detected-structure plan verification        | Verify detected structure against the plan                                      | Invalid for self-paced and effort-anchored sessions; and cadence-defined sessions cannot be verified at all because the prescription has nowhere to live                               | **Amend**                |
| **0032** Structure detection auto-import             | Detect intervals from the recording                                             | Nested structure (3 series × 13 reps) will be detected as 39 flat reps until `Block` nests — detection and authoring share the same shape limit                                        | **Amend**                |
| **0033** Detection-confidence honesty bar            | Three-state confidence, never fabricate                                         | Exactly the right bar for this library's own evidence spread, from randomised protocol to contradicted convention. Extend it to template citations                                     | **Confirm** (and extend) |
| **0009** Event as plan anchor                        | Event anchors the plan                                                          | Event is the natural home for **goal event power** — the bike's portable race anchor                                                                                                   | **Confirm** (and extend) |
| **0023** Shared display formatting                   | One en-GB house format                                                          | New anchor kinds render through the same layer with no structural change                                                                                                               | **Confirm**              |
| **0046** No load number spans incommensurable tracks | Strength carries no TSS                                                         | Reconfirmed from the cycling side: G6's bike TSS and run rTSS must not be summed, and Barranco-Gil 2024 shows even work-matched cycling sessions are not fatigue-matched               | **Confirm**              |
| **0047** Strength progresses by anchor and ramp      | Anchor + ramp progression                                                       | The cycling-specific strength protocol is published and concrete (Vikmoen 2020: 4 leg exercises, 3 × 4–10 RM, 2×/wk, 11 wk) and is the evidenced substitute for on-bike torque work    | **Confirm**              |

---

## 14. Uncertainty and limitations

- **TSS values are estimates**, computed from notional midpoint IF for an
  intermediate rider. ±25 % at best, and materially different indoor vs outdoor.
  Never surface as precise.
- **TSS is a poor model for E3/E4/E5.** Quadratic IF over a 30 s-smoothed series
  cannot price a 10 s sprint. Work-matched is not fatigue-matched (Barranco-Gil
  et al. 2024).
- **The sweet-spot origin story is a self-attribution** and the authorship of
  the original adaptations-vs-strain chart could not be independently verified.
- **The 30/15 protocol's exact parameters differ between the 2015 and 2021
  papers** (3 × 13 vs 5 × 12). Both are given. The 2015 trial had small, unequal
  groups (n = 9 vs 7), and its between-group performance p-values were mostly
  > 0.05.
- **The 30/15 mechanism failed to replicate under self-pacing** (Appelhans,
  Rønnestad & Skovereng 2025) and reverses in runners (Fleckenstein 2025), while
  the largest meta-analysis of interval programming favours _longer_ work bouts
  (Rosenblat 2021). Seed D4 as a well-documented protocol, not as an established
  optimum.
- **Seiler 2013's between-bout recovery duration could not be verified.** The
  abstract does not state it; secondary sources commonly report 2 min. Treat the
  2 min in D1–D3 as unconfirmed.
- **Both Seiler 2013 and Helgerud 2007 were run in sub-elite populations**
  (VO₂peak 52 and 55–60 mL·kg⁻¹·min⁻¹), and Helgerud 2007 is a **running**
  study. Their effect sizes should not be quoted at trained cyclists.
- **Block periodization's two positive trials carry a taper-timing confound**
  and the two adequately powered tests (Sylta 2016, n = 63; Almquist 2022) are
  null. §12.
- **D6's notated structure is a reconstruction of Bossi's _principle_, not the
  published waveform.** The paper reports varied vs constant at matched mean
  power and duration; the specific 15 s/45 s pattern here is illustrative.
- **The block-periodization literature has a taper confound** and the same
  research group now reports that moderate-intensity blocks work too. Blocks are
  an option, not a proven superiority.
- **F1's 50–60 rpm / 80–90 % FTP prescription has no experimental provenance.**
  It is coaching convention; the trials used 40–70 rpm and disagree with each
  other.
- **Several sources in §11 were verified through bibliographic records (Europe
  PMC / PubMed) rather than full text**, because web-search quota was exhausted
  mid-research. Two commonly cited works — Coast & Welch 1985 and Lucía et al.
  2001 on Tour de France cadence — could **not** be verified and are therefore
  not relied on. Peveler's indoor/outdoor bike-fit work is likewise unverified
  and excluded. Re-check every DOI and PMID below before any of them is surfaced
  in-product.
- **Exact protocol parameters for Seiler 2013 and Helgerud 2007 are carried over
  from [workouts-running.md](workouts-running.md)**, where they were verified in
  the same pass.
- **No competitor training product or indoor-training platform is named anywhere
  in this document**, per the research brief and the convention in
  [README.md](README.md). Coaches, coaching businesses, books, published
  protocols and file formats are named freely.

---

## References

**Interval protocols and periodization**

- Seiler S, Jøranson K, Olesen BV, Hetlelid KJ. Adaptations to aerobic interval
  training: interactive effects of exercise intensity and total work duration.
  _Scand J Med Sci Sports._ 2013;23(1):74–83.
  doi:[10.1111/j.1600-0838.2011.01351.x](https://doi.org/10.1111/j.1600-0838.2011.01351.x)
- Helgerud J, Høydal K, Wang E, et al. Aerobic high-intensity intervals improve
  V̇O2max more than moderate training. _Med Sci Sports Exerc._
  2007;39(4):665–671.
  doi:[10.1249/mss.0b013e3180304570](https://doi.org/10.1249/mss.0b013e3180304570)
- Rønnestad BR, Hansen J. Optimizing interval training at power output
  associated with peak oxygen uptake in well-trained cyclists. _J Strength Cond
  Res._ 2016;30(4):999–1006. PMID 23942167. — the acute study that produced the
  2:1 work:relief ratio.
- Rønnestad BR, Hansen J, Vegge G, Tønnessen E, Slettaløkken G. Short intervals
  induce superior training adaptations compared with long intervals in cyclists
  — an effort-matched approach. _Scand J Med Sci Sports._ 2015;25(2):143–151.
  doi:10.1111/sms.12165.
- Rønnestad BR, et al. Superior performance improvements in elite cyclists
  following short-interval vs effort-matched long-interval training. _Scand J
  Med Sci Sports._ 2020. PMID 31977120.
- Rønnestad BR, Øfsteng SJ, Zambolin F, Raastad T, Hammarström D. Effects of
  short-interval vs long-interval training on VO2max in a 1-week microcycle.
  _Int J Sports Physiol Perform._ 2021. PMID 33735833.
- Rønnestad BR, et al. The higher the fraction of maximal oxygen uptake during
  interval training, the greater the cycling performance gain. _Eur J Sport
  Sci._ 2024.
- Odden I, et al. Fraction of VO2max achieved during interval sessions predicts
  adaptation across 21 sessions of 5 × 8 min. _Eur J Sport Sci._ 2024.
  PMID 39385317.
- Bossi AH, Mesquida C, Passfield L, Rønnestad BR, Hopker JG. Optimizing
  interval training through power-output variation within the work intervals.
  _Int J Sports Physiol Perform._ 2020;15(7):982–989. PMID 32244222.
- Mølmen KS, et al. A moderate-intensity interval training block improves
  endurance performance in well-trained cyclists. _Med Sci Sports Exerc._ 2025.
  PMID 40101160.
- Rønnestad BR, et al. Block training with moderate- or high-intensity intervals
  both improve endurance performance. _Eur J Sport Sci._ 2025. PMID 41169000.
- Appelhans D, Rønnestad BR, Skovereng K. Fixed versus self-paced short and long
  intervals: time at high fraction of VO2max. _Int J Sports Physiol Perform._
  2025;20(6):848–855. PMID 40328438.
- Fleckenstein D, Braunstein H, Walter N. Time spent above 90 % VO2max during
  short versus long intervals in highly trained middle-distance runners. _Front
  Sports Act Living._ 2025;6:1507957. PMID 39835194.
- Rosenblat MA, Lin E, da Costa BR, Thomas SG. Programming interval training to
  optimize time-trial performance: a systematic review and meta-analysis.
  _Sports Med._ 2021;51(8):1687–1714. PMID 33826121.
- Rønnestad BR, Hansen J, Ellefsen S. Block periodization of high-intensity
  aerobic intervals provides superior training effects in trained cyclists.
  _Scand J Med Sci Sports._ 2014;24(1):34–42. PMID 22646668.
- Rønnestad BR, Hansen J, Thyli V, et al. 12 weeks of block periodization
  increases training-induced physiological adaptation in well-trained cyclists.
  _Scand J Med Sci Sports._ 2014;24(2):327–335. PMID 23134196.
- Sylta Ø, Tønnessen E, Hammarström D, et al. The effect of different
  high-intensity periodization models on endurance adaptations. _Med Sci Sports
  Exerc._ 2016;48(11):2165–2174. PMID 27300278.
- Almquist NW, Eriksen HB, Wilhelmsen M, et al. No differences between 12 weeks
  of block- vs. traditional-periodized training in performance adaptations in
  trained cyclists. _Front Physiol._ 2022;13:837634. PMID 35299664.
- Buchheit M, Laursen PB. High-intensity interval training, solutions to the
  programming puzzle. Part I: cardiopulmonary emphasis. _Sports Med._
  2013;43(5):313–338. PMID 23539308. Part II: anaerobic energy, neuromuscular
  load and practical applications. _Sports Med._ 2013;43(10):927–954.
  PMID 23832851.
- Seiler S, Kjerland GØ. Quantifying training intensity distribution in elite
  endurance athletes: is there evidence for an "optimal" distribution? _Scand J
  Med Sci Sports._ 2006;16(1):49–56. PMID 16430681.
- Seiler S. What is best practice for training intensity and duration
  distribution in endurance athletes? _Int J Sports Physiol Perform._
  2010;5(3):276–291. PMID 20861519.
- Galán-Rioja MÁ, Gonzalez-Ravé JM, González-Mohíno F, Seiler S. Training
  periodization, methods, intensity distribution and volume in trained cyclists:
  a systematic review. _Int J Sports Physiol Perform._ 2023. PMID 36640771.
- Filipas L, Bonato M, Gallo G, Codella R. Effects of 16 weeks of pyramidal and
  polarized training intensity distributions in well-trained endurance runners.
  _Scand J Med Sci Sports._ 2022. PMID 34792817.

**Sprint, strength and neuromuscular**

- Burgomaster KA, Hughes SC, Heigenhauser GJF, Bradwell SN, Gibala MJ. Six
  sessions of sprint interval training increases muscle oxidative potential and
  cycle endurance capacity in humans. _J Appl Physiol._ 2005;98(6):1985–1990.
- Burgomaster KA, Howarth KR, Phillips SM, et al. Similar metabolic adaptations
  during exercise after low volume sprint interval and traditional endurance
  training in humans. _J Physiol._ 2008;586(1):151–160.
- Almquist NW, Ettema G, Hopker J, Sandbakk Ø, Rønnestad BR. The effect of 30-s
  sprints during prolonged low-intensity cycling on gross efficiency, EMG and
  pedaling technique. _Int J Sports Physiol Perform._ 2019.
- Almquist NW, Wilhelmsen M, Ellefsen S, Sandbakk Ø, Rønnestad BR. Effects of
  including sprints in LIT sessions during a 14-d camp. _Med Sci Sports
  Exerc._ 2021.
- Taylor M, Almquist NW, Rønnestad BR, et al. Effects of including sprints
  during prolonged low-intensity cycling in the transition period. _Int J Sports
  Physiol Perform._ 2021.
- Mujika I, Rønnestad BR, Martin DT. Effects of increased muscle strength and
  muscle mass on endurance-cycling performance. _Int J Sports Physiol
  Perform._ 2016.
- Rønnestad BR, Hansen EA, Raastad T. Effect of heavy strength training on thigh
  muscle cross-sectional area, performance determinants, and performance in
  well-trained cyclists. _Eur J Appl Physiol._ 2010;108(5):965–975.
  PMID 19960350. — 4 lower-body exercises, 3 × 4–10 RM, twice weekly, 12 weeks.
- Rønnestad BR, Hansen J, Hollan I, Ellefsen S. Strength training improves
  performance and pedaling characteristics in elite cyclists. _Scand J Med Sci
  Sports._ 2015;25(1):e89–e98. PMID 24862305. — 25 weeks; peak crank torque
  shifted earlier in the stroke; no change in VO₂max or economy.
- Vikmoen O, Ellefsen S, Trøen Ø, et al. Strength training improves cycling
  performance, fractional utilization of VO2max and cycling economy in female
  cyclists. _Scand J Med Sci Sports._ 2016.
- Vikmoen O, et al. Heavy strength training improves running and cycling
  performance following prolonged submaximal work. _Physiol Rep._ 2017.
- Vikmoen O, et al. Sex differences and concurrent-training effects of 11 weeks
  of heavy strength training. _Eur J Appl Physiol._ 2020.
- Biddle SJH, Batterham AM. High-intensity interval exercise training for public
  health: a big HIT or shall we HIT it on the head? _Int J Behav Nutr Phys Act._
  2015;12:95.
- Jung ME, Little JP, Batterham AM. Commentary: Why sprint interval training is
  inappropriate for a largely sedentary population. _Front Psychol._ 2015.

**Cadence, torque and climbing**

- Kristoffersen M, Gundersen H, Leirdal S, Iversen VV. Low cadence interval
  training at moderate intensity does not improve cycling performance in highly
  trained veteran cyclists. _Front Physiol._ 2014;5:34.
- Paton CD, Hopkins WG, Cook C. Effects of low- vs. high-cadence interval
  training on cycling performance. _J Strength Cond Res._ 2009.
- Nimmerichter A, Eston RG, Bachl N, Williams C. Longitudinal monitoring of
  power output and heart rate profiles in elite cyclists. _Eur J Appl
  Physiol._ 2012.
- Whitty AG, Murphy AJ, Coutts AJ, Watsford ML. The effect of low- vs
  high-cadence interval training on the freely chosen cadence and performance in
  endurance-trained cyclists. _Appl Physiol Nutr Metab._ 2016.
- Ludyga S, Gronwald T, Hottenrott K. Effects of high vs. low cadence training
  on cyclists' brain cortical activity during exercise. _J Sci Med Sport._ 2016;
  and _J Sports Sci._ 2017.
- Foss Ø, Hallén J. The most economical cadence increases with increasing
  workload. _Eur J Appl Physiol._ 2004;92(4–5):443–451.
- Foss Ø, Hallén J. Cadence and performance in elite cyclists. _Eur J Appl
  Physiol._ 2005;93(4):453–462.
- Whitty AG, et al. Factors associated with the selection of the freely chosen
  cadence in non-cyclists. _Eur J Appl Physiol._ 2009.
- Ahlquist LE, Bassett DR, Sufit R, Nagle FJ, Thomas DP. The effect of pedaling
  frequency on glycogen depletion rates in type I and type II quadriceps muscle
  fibers during submaximal cycling exercise. _Eur J Appl Physiol Occup Physiol._
  1992;65(4):360–364.
- Leo P, Mateo-March M, Valenzuela PL, et al. Influence of torque and cadence on
  power output production in cyclists. _Int J Sports Physiol Perform._ 2023.
- Nimmerichter A, et al. Field-based gross efficiency at different cadences and
  gradients. _Int J Sports Physiol Perform._ 2015.
- Millet GP, Tronche C, Fuster N, Candau R. Level ground and uphill cycling
  efficiency in seated and standing positions. _Med Sci Sports Exerc._
  2002;34(10):1645–1652.
- Carlsson T, Lindblom H, Carlsson M. Physiological responses to alternating
  seated and standing position during uphill cycling. _Front Sports Act
  Living._ 2024.

**Critical power, W′ and load**

- Jones AM, Vanhatalo A. The 'critical power' concept: applications to sports
  performance with a focus on intermittent high-intensity exercise. _Sports
  Med._ 2017;47(Suppl 1):65–78.
- Poole DC, Burnley M, Vanhatalo A, Rossiter HB, Jones AM. Critical power: an
  important fatigue threshold in exercise physiology. _Med Sci Sports Exerc._
  2016;48(11):2320–2334.
- Skiba PF, Chidnok W, Vanhatalo A, Jones AM. Modeling the expenditure and
  reconstitution of work capacity above critical power. _Med Sci Sports Exerc._
  2012;44(8):1526–1532.
- Skiba PF, Clarke DC. The W′ balance model: mathematical and methodological
  considerations. _Int J Sports Physiol Perform._ 2021.
- Clark IE, Vanhatalo A, et al. Dynamics of the power–duration relationship
  during prolonged endurance exercise. _Med Sci Sports Exerc._ 2018; _J Appl
  Physiol._ 2019.
- Barranco-Gil D, Alejo LB, et al. Intensity matters: effect of different
  work-matched efforts on subsequent performance in cyclists. _Int J Sports
  Physiol Perform._ 2024.

**Metabolism and intensity**

- San Millán I, Brooks GA. Assessment of metabolic flexibility by means of
  measuring blood lactate, fat and carbohydrate oxidation responses to exercise
  in professional endurance athletes and less-fit individuals. _Sports Med._
  2018;48(2):467–479. PMID 28623613.
- Granata C, Oliveira RSF, Little JP, Renner K, Bishop DJ. Training intensity
  modulates changes in PGC-1α and p53 protein content and mitochondrial
  respiration, but not markers of mitochondrial content in human skeletal
  muscle. _FASEB J._ 2016;30(2):959–970. PMID 26572168.
- MacInnis MJ, Gibala MJ. Physiological adaptations to interval training and the
  role of exercise intensity. _J Physiol._ 2017;595(9):2915–2930. PMID 27748956.
- Brooks GA. The science and translation of lactate shuttle theory. _Cell
  Metab._ 2018;27(4):757–785. PMID 29617642.
- Dubouchaud H, Butterfield GE, Wolfel EE, Bergman BC, Brooks GA. Endurance
  training, expression, and physiology of LDH, MCT1, and MCT4 in human skeletal
  muscle. _Am J Physiol Endocrinol Metab._ 2000;278(4):E571–E579. PMID 10751188.
- Thomas C, Perrey S, Lambert K, Hugon G, Mornet D, Mercier J. Monocarboxylate
  transporters, blood lactate removal after supramaximal exercise, and fatigue
  indexes in humans. _J Appl Physiol._ 2005;98(3):804–809. PMID 15531559.

**Indoor vs outdoor**

- Mieras ME, Heesch MWS, Slivka DR. Physiological and psychological responses to
  outdoor vs. laboratory cycling. _J Strength Cond Res._ 2014;28(8):2324–2329.
- Jeffries O, Waldron M, Patterson SD, Galna B. An analysis of variability in
  power output during indoor and outdoor cycling time trials. _Int J Sports
  Physiol Perform._ 2019.
- Kowalski T, Sadowska D, Wiecha S. Differences between indoor and outdoor
  cycling performance in well-trained triathletes. _J Sports Med Phys
  Fitness._ 2024.
- Vinetti G, et al. Functional threshold power field test exceeds laboratory
  performance in junior road cyclists. _J Strength Cond Res._ 2023.
- Smith MF, Davison RCR, Balmer J, Bird SR. Reliability of mean power recorded
  during indoor and outdoor self-paced 40 km cycling time-trials. _Int J Sports
  Med._ 2001;22(4):270–274.

**Books and coaching sources**

- Allen H, Coggan A. _Training and Racing with a Power Meter._ VeloPress, 2006
  (3rd ed. 2019). — the seven levels, the 20-minute FTP test protocol.
- Overton F (FasCat Coaching). Sweet Spot Training. —
  https://fascatcoaching.com/blogs/training-tips/sweet-spot-training
- Overton F (FasCat Coaching). Over-Under Intervals. —
  https://fascatcoaching.com/blogs/training-tips/over-under-intervals
- Maunder E, Seiler S, Mildenhall MJ, Kilding AE, Plews DJ. The importance of
  'durability' in the physiological profiling of endurance athletes. _Sports
  Med._ 2021;51(8):1619–1628.

**Repo cross-references**

- [zones-and-thresholds.md](zones-and-thresholds.md) — Coggan levels, FTP vs CP,
  the gapped-band defect in `coggan-power-7`.
- [intensity-distribution.md](intensity-distribution.md) — the full polarized /
  pyramidal / threshold evidence base and the session-goal vs time-in-zone fork.
- [training-load-and-fitness-model.md](training-load-and-fitness-model.md) —
  TSS/IF definitions, CTL/ATL/TSB.
- [planning-calendar-and-wellness.md](planning-calendar-and-wellness.md) —
  structured-workout primitives across FIT/TCX/.zwo, the writable DSL grammar,
  planned-load estimation, the taper rule.
- [workouts-running.md](workouts-running.md) — the sibling library; the
  `WorkoutTemplate` catalogue argument and the `racePace` anchor gap.
