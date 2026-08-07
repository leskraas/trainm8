# Endurance training platform research

Thirteen research documents covering how a best-in-class endurance training
platform analyses workouts, models load and fitness, defines zones, plans
training, detects structure in recorded activity, and prescribes sessions across
running, cycling, swimming and strength.

Written from **primary sources**: peer-reviewed papers with DOIs, the coaches
and scientists who defined each model, official file-format specifications, and
open-source implementations. Findings are recorded vendor-neutrally — no product
is named. Where a formula is reverse-engineered rather than published, the
document says so.

## The documents

| Document                                                                           | Covers                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [training-load-and-fitness-model.md](training-load-and-fitness-model.md)           | TSS / hrTSS / rTSS / TRIMP / sRPE, the CTL·ATL·TSB impulse-response model, form zones, ramp rate, monotony and strain                                                                                              |
| [activity-analysis-metrics.md](activity-analysis-metrics.md)                       | Normalized Power, IF, VI, GAP, HR recovery, decoupling, efficiency factor, W'bal, mean-maximal curve, energy and CHO estimates                                                                                     |
| [zones-and-thresholds.md](zones-and-thresholds.md)                                 | Coggan / Friel / Daniels / Seiler / Olympiatoppen zone tables, FTP · eFTP · CP · LTHR · CSS, automatic threshold estimation, time-in-zone                                                                          |
| [intensity-distribution.md](intensity-distribution.md)                             | Three-zone TID, polarized / pyramidal / threshold archetypes, the Polarization Index, the contested evidence base                                                                                                  |
| [planning-calendar-and-wellness.md](planning-calendar-and-wellness.md)             | Structured-workout primitives across FIT / TCX / .zwo, a writable DSL grammar, periodization and taper, HRV-guided training                                                                                        |
| [interval-detection-and-data-platform.md](interval-detection-and-data-platform.md) | Change-point interval detection, per-interval metrics, plan alignment, stream storage, field registry, the analysis surfaces                                                                                       |
| [platform-capability-inventory.md](platform-capability-inventory.md)               | ~72 capabilities across 9 surfaces, each rated Have / Partial / Missing against this repo, with a prioritised shortlist                                                                                            |
| [portable-intensity-anchors.md](portable-intensity-anchors.md)                     | The velocity–duration curve, Riegel / Daniels–Gilbert VDOT / Critical Speed / Cameron race-equivalence, the 2k split and other cross-sport anchors, a six-variant target union, and resolution timing + provenance |
| [workout-taxonomy.md](workout-taxonomy.md)                                         | 16 session archetypes, Norwegian terminology and name collisions, session grammar, the named published protocols, archetype↔load, and an archetype classifier                                                      |

### The sport libraries

Concrete, citable example sessions. Every session is written in **portable
anchors** — never an absolute pace, wattage or kilo — and also in this repo's
Workout Notation, so the libraries can seed a starter catalogue directly.

| Document                                                         | Covers                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [workouts-running.md](workouts-running.md)                       | 46 sessions across 9 archetypes; Canova's percentage-of-race-pace system, hills, strides, trail/vertical, treadmill |
| [workouts-cycling.md](workouts-cycling.md)                       | 41 sessions across 8 archetypes; sweet spot, over-unders, Rønnestad 30/15, torque work, indoor vs outdoor           |
| [workouts-swimming.md](workouts-swimming.md)                     | ~30 sessions; pool-set notation, send-off as an intensity mechanism, CSS tests, equipment and stroke, open water    |
| [workouts-strength-and-other.md](workouts-strength-and-other.md) | 25 strength sessions across 4 phases; plus XC skiing, rowing's 2k split as a design pattern, and cross-training     |

Each document ends with **Implications for trainm8** and an **ADRs this research
challenges** table (Confirm / Amend / Supersede).

## The portability problem

The sport libraries share one requirement: a prescription must mean the same
thing for every athlete. `4:20/km` does not travel; `5k pace`,
`85 % of threshold`, `RIR 2` do. Three findings govern this, and
[portable-intensity-anchors.md](portable-intensity-anchors.md) is the document
the libraries defer to.

- **Model choice barely matters; the exponent is everything.** Riegel@1.06 and
  Daniels VDOT differ by 32 s on a 3:11 marathon. But the empirical exponent for
  recreational runners is ~1.10–1.15, and 1.06 → 1.15 moves that same marathon
  prediction from 3:11:49 to 3:52:25. Hence: distance ratio ≤ 2 high confidence,
  ≤ 4 medium, > 4 low.
- **Percentages need a named anchor.** `powerPct` silently means % FTP, but the
  interval literature anchors on MAP and the critical-power literature on CP —
  and CP ≠ FTP. A bare percentage is not portable.
- **`% 1RM` is not the portable strength anchor below ~85 %.** Endurance runners
  managed 39.9 ± 17.6 reps at 70 % 1RM where weightlifters managed 17.9 ± 2.8,
  with no difference at 90 %. RIR travels; `% 1RM` travels only in the heavy
  band.

Resolution needs **two stamps, not one**: re-resolve at view time for scheduled
sessions, freeze at completion for history. Freeze-only makes a 16-week plan get
easier as the athlete improves; re-resolve-only rewrites past adherence.

## Consolidated ADR verdicts

Existing ADRs were treated as revisable, not as constraints. The research
recommends the correct design and names the decision to replace where the two
conflict.

### Supersede

| ADR                                                      | Raised by              | Reason                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0020** Downsampled activity stream                     | 3 documents            | The display grid is being used as the analysis grid. `res = max(5, ceil(span/999))` caps interval detection at ~19 s on a 5 h ride and biases short power peaks low. Two tiers: full-resolution analysis blob, derived display grid. |
| **0017** Consolidate surfaces onto home                  | Capability inventory   | Right for reading, wrong for planning. Six calendar capabilities each need a grid.                                                                                                                                                   |
| **0010** One Form number                                 | Planning & wellness    | Subjective wellness outperforms objective markers (Saw 2016); readiness must be a multi-signal record, not TSB alone.                                                                                                                |
| **0008** Run fallback chain pace → HR                    | Load model             | Contradicts ADR 0038. A running-power rung belongs above `rTSS`.                                                                                                                                                                     |
| **0005** `ThresholdEvent.source: manual\|inferred\|auto` | Zones                  | Wrong axis. Record the _protocol_ and the _construct_ (FTP vs CP), which are not interchangeable.                                                                                                                                    |
| **0031** One currency on the Trends tab                  | Intensity distribution | `TSS = IF² × hours × 100`, so TSS-weighting squares intensity into the distribution. TID is time-denominated or it is wrong.                                                                                                         |

### Confirmed by independent evidence

ADR **0046** (no cross-currency load number, strength carries no TSS) —
confirmed from the physiology side by three documents; no source anywhere prices
lifting in TSS, and the reason is structural. The strength library assessed the
three alternatives and rejected two: tonnage is kg-denominated and inverts the
portability thesis, sRPE is reliable but is just `hours × assumed intensity`;
hard-set counting wins, which ADR **0047** §2 already chose.

Also confirmed: ADR **0008**'s Unavailable Metric, ADR **0033**'s confidence
vocabulary, ADR **0019**'s adherence bands, ADR **0024**'s Normalized Power edge
cases, ADR **0035**/**0038**'s anchor-priority ladder, ADR **0006**'s
recipes-as-immutable-constants, ADR **0040**'s derived-not-authored
distribution, ADR **0047** §4's strength frequency, and ADR **0007**'s
`kind:'strength'` step shape.

The remainder are marked **Amend** in the per-document tables — mechanism
correct, scope or stored fields incomplete.

### One verdict withdrawn on review

The running library argued ADR **0027** A2 should be superseded because "no
truthful race-pace model exists" is false — three validated models do exist. A
citation-verification pass read the ADR and found the claim is scoped by its own
parenthetical: _"no race-pace **reference on the athlete**"_. That is about this
repo's data, not the literature, and it was correct. Downgraded to **Amend**: a
wording change from "no race-pace model" to "no race-pace reference", and the
real blocker is a missing `PerformanceResult` table — a data gap, not a science
gap.

## Defects and blockers found in shipped code

These are not recommendations; they are things currently wrong or currently
impossible.

1. **Gapped zone band edges.** `app/utils/zones/recipes.ts` — `coggan-power-7`
   has `maxRatio 0.55` then `minRatio 0.56`, a 1 %-wide hole between every pair.
   Same in `friel-hr-5-*`, `daniels-pace-5`, `stryd-run-power-5`. Harmless for
   authoring targets; a bug the moment measured samples are bucketed into
   time-in-zone. `css-5` already enforces contiguity.
2. **`ThresholdEvent.effectiveAt` is written but never read.** Zone resolution
   uses the current `DisciplineProfile`, so raising an FTP retroactively
   reclassifies training history. `DisciplineProfile.zoneSystem` has no history
   at all, so even a correct temporal join cannot reconstruct which recipe was
   in force.
3. **A GPX run import is undetectable by construction.** The parser emits HR
   only → pace absent → HR cannot set edges → structure detection always returns
   _absent_.
4. **`ActivityStream` carries no distance or altitude channel**, which makes
   GAP, NGP, elevation and distance-based personal records impossible rather
   than merely unbuilt.
5. **No per-interval entity exists.** `WorkoutDetection.structureJson` is a
   prescription shape with nowhere to put avg HR, distance, cadence or mean ± SD
   across a set — so `lapsJson` stays stored and unread.
6. **`@garmin/fitsdk` cannot parse compressed-timestamp FIT files.** Both
   official SDKs throw. Worth a test fixture.
7. **`pct1RM` is shipped and resolves to nothing.** No 1RM is stored anywhere,
   and because 1RM is per _exercise_, `DisciplineProfile`'s
   `[athleteProfileId, discipline]` unique key structurally cannot hold it.
8. **`WORKOUT_INTENTS` (`workout-schema.ts:37`) is the intensity axis
   mislabelled as archetype.** Six of its fifteen members are verbatim the
   zone-label strings `zoneLabelToZone()` maps to `TrainingZone` 1–5
   (`session-profile.ts:76`), so a recovery jog, an easy run and a 3 h long run
   are all `intent: 'endurance'`. There is no value for long, fartlek, brick,
   steady or race simulation. ADR 0042 caught the identical conflation at phase
   scope.
9. **Planned TSS prices interval recovery valleys at zero**, though W′
   reconstitution depends on recovery power — so `30/15` with hard relief and
   `30/15` with soft-pedalling score identically.

## What the authoring model cannot currently say

The four sport libraries were written independently and converged on the same
conclusion: the target and step model cannot express a portable prescription.
Each gap below makes specific, well-evidenced sessions unauthorable.

| Gap                                                                               | Consequence                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IntensityTargetSchema` has `powerPct` but **no `pacePct` and no race-pace kind** | ~⅓ of the running library — all of Canova, the whole Norwegian sub-threshold family — is unauthorable except by baking absolute paces per athlete                                                                     |
| `powerPct` **silently means % FTP**                                               | Sessions anchored on MAP or CP cannot be stated; CP ≠ FTP                                                                                                                                                             |
| `BlockSchema` has **one repeat level**                                            | Set-of-sets is unrepresentable. `3 × (13 × 30/15)` — the best-studied cycling interval protocol — needs renderer recursion, not new vocabulary                                                                        |
| **No `verticalM`, no `gradePct`** on a step                                       | Vertical repeats, mountain long runs and VK tests are literally unrepresentable; every hill session loses its defining parameter. Requested independently by two documents                                            |
| **Rest has one form** (fixed duration)                                            | Swim send-off makes rest _implied_ (interval minus swim time); "jog back" and "until HR < 120" are also standard. A `RestSpec` union is needed                                                                        |
| **No stroke, equipment or exercise dimension**                                    | Pull/kick/drill, paddles and fins are part of a swim step's identity, not a note                                                                                                                                      |
| `ExerciseSet` **never got the union treatment `WorkoutStep` got**                 | `weightKg XOR pct1RM` + `kind: reps\|timed\|amrap` collapses three orthogonal axes — load, effort cap, termination. Rønnestad's `10RM → 4RM`, the best-evidenced strength protocol in the literature, is unauthorable |

ADR **0007**'s `kind:'strength'` step is _confirmed correct_ — the mismatch is
one level down, in `ExerciseSet`. And ADR **0027**'s render-never-parse survives
every one of these: each addition is one more token in the sentence.

## Claims the research declined to launder

Popular practices whose evidence does not support how they are usually sold.
Recorded so the app does not repeat them with false confidence.

- **Sweet spot has zero peer-reviewed hits** in PubMed or Europe PMC. Coined c.
  2005; it straddles Coggan L3/L4 by construction, which is why 84–97, 88–94,
  88–93 and 83–97 all circulate. It must never be a zone band.
- **Zone 2's mitochondrial story is the weakest claim in the cycling library.**
  The popular citation is cross-sectional, and Granata 2016 / MacInnis & Gibala
  2017 favour higher intensities for PGC-1α. The honest case for Z2 is load
  management.
- **Block periodization did not scale.** The two positive trials carry a
  taper-timing confound; Sylta 2016 (n = 63) and Almquist 2022 are null. A plan
  generator must not default to it.
- **Torque/low-cadence work**: a 12-week 40 rpm trial found no gain in VO₂max,
  performance _or leg strength_, while the free-cadence control improved.
- **Over-unders' lactate-clearance rationale is extrapolated** from steady-state
  training; no work-matched oscillating-vs-constant trial exists.
- **Even Rønnestad 30/15's advantage vanishes** when both formats are self-paced
  (2025), and a 2021 meta-analysis favours longer bouts.
- **The Daniels–Gilbert VDOT equations are not published.** _Oxygen Power_
  (1979) is absent from every catalogue checked. The concept is theirs; the two
  circulating equations are a community reverse-engineering of his tables —
  which is why E/M paces do not reproduce cleanly.
- **Cameron's model has no primary publication**; it is an unsourced 1990s
  internet formula.
- **Rowing's `2k + 22 s` band offsets are scale-dependent** and have no
  peer-reviewed source: UT2 is 54 % of 2k power for a 1:45 rower and 64 % for a
  2:15 rower. Swim's `CSS + 10 s` shares the flaw. Store ratios, not offsets.
- **Tabata's actual protocol** was 170 % VO₂max on a braked cycle ergometer, 5
  d/wk for 6 weeks. The app must never generate a session named after a protocol
  whose intensity anchor it did not reproduce.

## Corrections to widely-repeated formulas

- **CTL/ATL are first-order exponential filters, not N-day averages.**
  `CTL_t = CTL_{t−1}·e^(−1/42) + TSS_t·(1−e^(−1/42))`. Three incompatible EWMA
  conventions circulate; a stdlib `ewm(span=42)` call is ~2× too fast and would
  silently produce a wrong CTL.
- **Polarization Index** is `log10(100 × z1/z2 × z3)` on fractions. The commonly
  quoted `log10(Z1×Z3×100/Z2)` inflates PI by ~2.0.
- **CP ≠ FTP.** 256 ± 50 W vs 249 ± 44 W, limits of agreement −19 to +33 W, and
  the gap widens with fitness. The authors state they should not be used
  interchangeably.
- **80/20 is a session-goal target** and must not be applied to a time-in-zone
  number. The same 570 sessions read 96/3/1 by time-in-zone and 87/11/2 by
  session goal.
- **Ramp steps**: midpoint IF under-reports planned load. The closed form is
  `IF_eff = sqrt((a²+ab+b²)/3)`.
- **CTL convergence**: one time constant reaches only ~63 % of true value.
  Honest convergence is 3τ ≈ 126 days, not the 42 implied by
  `BACKFILL_MIN_DAYS`.

## Things deliberately not recommended

- **ACWR** — mathematically coupled, arbitrary windows, ratio blow-up at low
  chronic load, and a formal retraction request in BJSM. Foster monotony and
  strain are the cheap published alternative covering the same TSB blind spot.
- **Custom CTL/ATL time constants** — steady-state CTL equals mean daily TSS for
  any time constant, so this buys responsiveness only, while invalidating every
  published TSB and ramp threshold and forcing a full-history recompute.
- **A composite readiness score** — subjective measures outperform objective
  ones, so the usual weighting is backwards.
- **A decay function for stale auto-estimated thresholds** — no literature
  validates any such function. Freeze and flag as stale instead of fabricating a
  decline.
