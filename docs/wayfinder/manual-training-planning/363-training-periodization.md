# Training periodization — macro, meso, and micro cycles (#363)

Research note feeding the design of the MANUAL training-planning feature (and,
later, AI **Plan Generation**). Sources are primary/high-trust where reachable:
publisher pages, peer-reviewed papers (PubMed/journal), and first-party product
docs. Where a page was paywalled or blocked to the fetcher, that is stated and
the best available primary summary is cited instead.

## TL;DR

Periodization is a **three-level nest**: a **macrocycle** (the whole season /
annual plan, working toward a peak), split into **mesocycles** (focused blocks of
~2–6 weeks, usually 3–6, each with one dominant adaptation goal), split into
**microcycles** (almost always a **calendar week** of sessions). The app's
existing **Plan Outline** — "base / build / peak / taper, with a weekly load
pattern per phase, stored on the Event" — already *is* a macrocycle expressed as
an ordered list of mesocycle-phases, and its per-phase weekly-load pattern is the
microcycle layer. So Trainm8 is not missing the hierarchy; it is missing (a) an
authored, per-week **load target** the athlete controls, (b) intra-mesocycle
**loading vs recovery week** structure (3:1 / 2:1), and (c) an explicit **taper**
distinct from "peak". Every self-coaching platform surveyed (TrainingPeaks ATP,
intervals.icu ATP builder) converges on the same MANUAL authoring surface: the
athlete sets **events + priorities**, picks a **volume currency** (weekly hours
*or* weekly TSS/load), and the tool lays down **phases + per-week targets working
backward from the A-race**, then the athlete fills the week with concrete
workouts to hit each week's number. That is almost exactly the ADR 0018 Plan
Outline model, and it is the recommended V1 shape. Intensity distribution
(polarized/pyramidal, Seiler 80/20) belongs at the **workout-prescription** level,
not the plan structure — defer it as an authored plan attribute.

## 1. The macrocycle → mesocycle → microcycle hierarchy

**The nest (largest to smallest): macrocycle → mesocycle → microcycle → training
day/session → training unit.** The NSCA states the annual plan decomposes exactly
this way and that "each macrocycle is then subdivided into three periods:
preparation, competition, and transition" [NSCA, "Hierarchical Structure of
Periodization Cycles",
https://www.nsca.com/education/articles/kinetic-select/hierarchical-structure-of-periodization-cycles/].

Typical durations (converged across sources):

- **Macrocycle** — the whole season / annual plan, oriented toward peaking for
  the goal competition. TrainingPeaks: "your overall season or long-term training
  plan … one year"
  [https://www.trainingpeaks.com/blog/macrocycles-mesocycles-and-microcycles-understanding-the-3-cycles-of-periodization/].
- **Mesocycle** — a focused block targeting one dominant adaptation (aerobic
  endurance, threshold, race-specific intensity). **~3–6 weeks**, containing
  **two to six microcycles** (NSCA; TrainingPeaks "approximately three to six
  weeks").
- **Microcycle** — "the shortest training cycle … typically lasts one week"
  (TrainingPeaks). NSCA: "each microcycle is made up of both training days and
  sessions, which contain the individual training units." In practice a
  microcycle = a **calendar week** of sessions.

**Terminology wrinkle worth recording.** Bompa's own text uses *macrocycle* for
what most coaches (and TrainingPeaks, and this app) call a *mesocycle* — "Bompa
uses the term macrocycle and most coaches are used to using the term mesocycle;
it is a group of microcycles with the same training direction and can last
anywhere from 2–6 weeks" [Morland Strength summary of Bompa Ch. 6,
https://morlandstrength.com/2017/12/01/topic-76-periodization-as-planning-and-programming-of-sport-training-ch-6/].
Anchor: **Bompa & Buzzichelli, *Periodization: Theory and Methodology of
Training*, 6th ed. (Human Kinetics, 2019), ISBN 9781492544807** — the definitive
text, organized into training theory, planning/periodization, and training
methods [publisher page,
https://us.humankinetics.com/products/periodization-6th-edition; the Human
Kinetics excerpt pages returned HTTP 429/403 to the fetcher, so durations above
are cited from the NSCA and TrainingPeaks primary summaries rather than the book
page directly]. **For V1 we should use the common convention (macro = season,
meso = 3–6 wk block, micro = week), which is what TrainingPeaks, intervals.icu,
and the app's existing vocabulary already assume** — not Bompa's literal naming.

## 2. Phase models

### Traditional / linear periodization (Bompa)

A macrocycle divides into three **periods**: **preparatory**, **competitive**,
**transition**, each further split into subphases (general preparation, specific
preparation, precompetition, competition, transition) [NSCA, above; Human Kinetics
excerpt "Basic steps in the periodization training process",
https://us.humankinetics.com/blogs/excerpt/basic-steps-in-the-periodization-training-process —
page 429'd to the fetcher; content confirmed via search snippet and NSCA]. The
defining trait is **linear progression from general to specific** and from high
volume/low intensity toward low volume/high intensity as the season nears the
peak.

### Block periodization (Issurin)

Issurin's model replaces the "simultaneous development of many abilities" of the
traditional/mixed model with **consecutive development of a minimal number of
targeted abilities**, using **specialized mesocycle-blocks of 2–4 weeks** that
concentrate a highly focused workload [Issurin, "New Horizons for the Methodology
and Physiology of Training Periodization," *Sports Medicine* 40(3):189–206, 2010,
https://link.springer.com/article/10.2165/11319770-000000000-00000 —
paywalled/redirect to auth; abstract via Springer + open PDF mirror
https://www.hmmrmedia.com/wp-content/uploads/2015/08/new-horizons-periodization.pdf].
The three block types:

- **Accumulation** — voluminous, extensive workloads (basic abilities: aerobic
  base, strength endurance); stimulates mitochondrial biogenesis in slow-twitch
  fibres.
- **Transmutation** — lower-volume, intense, sport-specific work targeting
  fast-twitch fibres.
- **Realization** — event-specific pre-competition work and peaking (a taper-like
  block).

A full **accumulation → transmutation → realization** sequence is one *training
stage*, typically **~8–12 weeks**, and the ordering exploits **residual training
effects** — adaptations that persist after a stimulus is withdrawn — so a later
block builds on the retained fitness of the earlier one [Issurin, "Block
periodization versus traditional training theory: a review," *J Sports Med Phys
Fitness* 48(1):65–75, 2008, https://pubmed.ncbi.nlm.nih.gov/18212712/; "Biological
Background of Block Periodized Endurance Training: A Review," *Sports Medicine*,
2019, https://pubmed.ncbi.nlm.nih.gov/30411234/]. Issurin's critique of the
traditional model: it can't deliver multiple seasonal peaks, and mixed
concurrent training produces "conflicting training responses" from incompatible
workloads.

### Reverse periodization

Starts with **high-intensity / low-volume** and progresses toward
**lower-intensity / higher-volume** (the inverse of the linear endurance model),
used when the goal event or season timing inverts the usual demand curve
[Ramos-Campo et al., "Effectiveness of Reverse vs. Traditional Linear Training
Periodization in Triathlon," *IJERPH* 16(15):2807, 2019,
https://pmc.ncbi.nlm.nih.gov/articles/PMC6696421/]. Evidence is mixed: a
systematic review found reverse periodization does **not** produce superior gains
in swimming, running, muscular endurance, max strength, or VO₂max versus
traditional or block models [Kong et al., "Reverse Periodization for Improving
Sports Performance: A Systematic Review," *Sports Medicine – Open* 8:56, 2022,
https://pmc.ncbi.nlm.nih.gov/articles/PMC9023617/]. **Niche; defer.**

### Joe Friel's Annual Training Plan (ATP) phases

Friel's model — the one the app already leans on via **Event Priority** (A/B/C)
and the base/build/peak vocabulary — divides the season into: **Transition** →
**Preparation (Prep)** → **Base** (often Base 1–3) → **Build** (Build 1–2) →
**Peak** → **Race** → (back to Transition). Indicative durations from Friel's
published structure: Transition 1–6 wk, Prep 3–4 wk, Base 8–12 wk, Build 6–8 wk,
Peak 1–2 wk, Race the event week [Friel, *The Cyclist's Training Bible* /
*The Triathlete's Training Bible*; summarized structure per Roadman Cycling's
Friel guide, https://roadmancycling.com/blog/cycling-periodisation-friel-lorang-johnson,
and Friel's own "The Transition Period," TrainingPeaks,
https://www.trainingpeaks.com/blog/the-transition-period-by-joe-friel/, which
defines Transition as ~3–4 wk of rest/recovery linking two annual plans]. Friel
plans **backward from the A-race**: race minus ~2 wk taper, minus ~3 wk peak,
minus ~10 wk build, minus ~14 wk base.

**App alignment:** the existing **Plan Outline** speaks **base / build / peak /
taper**. That maps cleanly onto Friel's Base → Build → Peak, with "taper" naming
what Friel calls Peak (the volume-reducing sharpening block) and Issurin calls
Realization. Prep and Transition are the two Friel phases the app does *not* yet
name.

## 3. Intra-mesocycle load progression

### Loading vs recovery weeks (3:1 and 2:1)

The standard microcycle pattern within a mesocycle is **3 loading weeks : 1
recovery week (3:1)**, with **2:1** for older athletes or those under high life
stress. Friel: "use 3:1 mesocycles (3 weeks loading, 1 week recovery) to prevent
overtraining, while older athletes … may benefit from 2:1 mesocycles"; "most
serious athletes need a recovery week after about two to five weeks of hard
training," and a recovery week is "only short duration workouts at low intensity
for two or three days" [Friel, "Recovery Week Design,"
https://joefrieltraining.com/recovery-week-design/, and "Aging: Matching the
Mesocycle to Your Recovery," https://joefrieltraining.com/aging-matching-the-mesocycle-to-your-recovery/].
intervals.icu's ATP builder encodes this directly: default **3:1 with a 30%
volume reduction** on the recovery week [intervals.icu ATP builder,
https://www.intervals.icu/features/annual-training-plan/ and forum announcement
https://forum.intervals.icu/t/annual-training-plan-builder/122085].

### Progressive overload & ramp rate

Week-to-week and block-to-block volume rises by a modest increment (intervals.icu
default **5% progression**). TrainingPeaks manages this as a **CTL ramp rate** and
"will warn you if you put the ramp rate too high" [TrainingPeaks, "A Look at
Planning by TSS with the New ATP,"
https://www.trainingpeaks.com/learn/articles/a-look-at-planning-by-tss-with-the-new-atp/].
This is the same idea the app already enforces defensively in **Week Replan**
(downward-only volume rescale) — but progressive *overload* is the upward
counterpart the current model lacks as an authored intent.

### Taper science

The taper is "a progressive nonlinear reduction of the training load … to reduce
physiological and psychological stress … and optimize performance," best achieved
by **maintaining intensity, cutting volume ~60–90%, and reducing frequency no
more than ~20%**, over an optimal window of **4 to >28 days**; progressive
(nonlinear) tapers beat step tapers, and performance typically improves ~3%
(range 0.5–6%) [Mujika & Padilla, "Scientific Bases for Precompetition Tapering
Strategies," *Med Sci Sports Exerc* 35(7):1182–1187, 2003,
https://journals.lww.com/acsm-msse/fulltext/2003/07000/scientific_bases_for_precompetition_tapering.17.aspx
(paywalled; abstract + open PDF mirror http://robin.candau.free.fr/Mujika_Padilla.pdf)].
The meta-analysis is more prescriptive: **a 2-week taper with training volume
exponentially reduced by 41–60%, holding intensity and frequency constant**, gives
the largest performance effect [Bosquet et al., "Effects of Tapering on
Performance: A Meta-Analysis," *Med Sci Sports Exerc* 39(8):1358–1365, 2007,
https://pubmed.ncbi.nlm.nih.gov/17762369/]. **Key design takeaway: intensity is
held, volume falls — so a taper is a volume-shaped plan attribute, exactly the
axis Week Replan already scales.**

## 4. Intensity distribution models

Endurance training intensity distribution (TID) describes how training *time* is
split across intensity zones:

- **Polarized** — ~**80% low intensity (below aerobic/LT1) + ~20% high (above
  LT2)**, with little in the middle [Seiler, "What Is Best Practice for Training
  Intensity and Duration Distribution in Endurance Athletes?," *IJSPP*
  5(3):276–291, 2010, https://pubmed.ncbi.nlm.nih.gov/20861519/: elite athletes
  training 10–13×/week do "about 80% of training sessions … at low intensity
  (< 2 mM lactate), with about 20% dominated by high-intensity work"].
- **Pyramidal** — most volume low, a moderate slice at threshold, least at high
  intensity (e.g. 70/20/10) [8020 Endurance summary of Seiler,
  https://www.8020endurance.com/allaboutintensitybalance/].
- **Threshold** — a larger share at moderate/threshold intensity.

The **~80/20 easy:hard split** is the robust, widely-supported heuristic (Seiler;
Fitzgerald's *80/20 Running* popularization). Polarized vs pyramidal is
phase-dependent (pyramidal common in base/build, polarized nearer competition) and
still debated.

**Where does TID belong — plan structure or workout prescription?** It is an
**emergent property of the mix of workouts**, computed *from* prescribed session
intensities and durations, not a field the athlete sets at the phase/week level.
The app already models intensity where it lives — the **Intensity Target** on each
**Step** (zone label + metric model) — so TID is a *report/target ratio* derived
across a **Training Week** or phase, not a new structural primitive. For V1 the
honest position: TID is **workout-prescription level**; a plan-level "target
distribution" is at most a soft authored preference (defer). This mirrors the
app's existing rule that **Discipline Allocation** is a derived load view, not an
authored allocation.

## 5. How self-coaching platforms model MANUAL planning

Consistent pattern across every platform: the athlete authors **events +
priorities + a volume currency + phases**, the tool computes **per-week targets
working backward from the A-race**, and concrete workouts are matched to weeks
**manually** (the plan is targets, not auto-generated sessions).

### TrainingPeaks Annual Training Plan (ATP)

The athlete authors: **event(s) with date + priority (one A-event required for
automatic periodization)**, then picks one of **three methodologies — average
weekly hours, average weekly TSS, or target event Fitness (CTL)** [TrainingPeaks
Help Center, "How do I set up my ATP" (204073724) and "Annual Training Plan
Methodologies" (224662768) — both returned 403 to the fetcher; content from
Help-Center search snippets and https://www.trainingpeaks.com/learn/articles/a-look-at-planning-by-tss-with-the-new-atp/].
Behavior:

- **Weekly hours** — the ATP gives a weekly training-hour goal; the athlete sizes
  each week's workouts to hit it.
- **Weekly TSS** — "by entering a weekly average TSS the ATP will automatically
  calculate and give you weekly TSS targets and will model future Fitness,
  Fatigue and Form in the Performance Management Chart."
- **Target CTL** — enter the CTL you want on race day and the ATP
  **back-calculates the required weekly TSS**.
- **Phases** — automatic periodization uses **Joe Friel's methodology via a
  lookup table** to assign periods (linear, general → specific).
- **Calendar relationship** — the ATP writes a **weekly target onto the calendar**
  (right side of each week); the athlete then chooses/creates workouts whose TSS
  or duration meets that week's number. TrainingPeaks notes athletes find TSS
  targets harder to comply with than duration/distance.

### intervals.icu (ATP builder — beta, ~Feb 2026)

The athlete configures **A/B/C races, phase structure (auto from race date *or*
manual Base/Build/Peak durations), weekly hours (3–35 h), target metric
(load/time/distance per sport), progression rate (default 5%), recovery cadence
(default 3:1, 30% cut), and taper length**; the tool generates **weekly
load/time/distance targets + colored phase blocks working backward from the
race**, shown as a live preview with race markers. **Workouts are matched
manually** (drag-and-drop from the library onto the timeline); plans are
**per-sport**, not integrated multisport
[https://www.intervals.icu/features/annual-training-plan/;
https://forum.intervals.icu/t/annual-training-plan-builder/122085;
https://forum.intervals.icu/t/weekly-targets-load-duration-distance/60787].

### Others (brief)

- **Garmin Connect / Garmin Coach** — *adaptive daily* plans that adjust each day
  from performance/recovery/sleep metrics; a different paradigm (device-driven
  auto-adaptation) rather than athlete-authored macro structure
  [https://www.garmin.com/en-US/blog/fitness/garmin-training-plans-for-runners/].
- **Final Surge** — plans **1–52 weeks**; the athlete/coach builds structured
  workouts with **multiple target types (HR/power/pace)** and Final Surge resolves
  the correct target per athlete's settings — an authoring model close to the
  app's **Intensity Target** metric-model union
  [https://support.finalsurge.com/hc/en-us/articles/360041370453-Creating-Structured-Workouts].

## 6. Gap analysis against Trainm8's existing vocabulary

Read against `CONTEXT.md` and ADR 0018 (Plan card) / ADR 0025 (Week Replan):

**Already covered:**

| Periodization concept | Existing app concept |
|---|---|
| Macrocycle (season toward a peak) | **Plan Outline** ("periodized phase structure spanning the full horizon," stored on the **Event**) + **Target Event** |
| Mesocycle / phases | **Plan Outline** phases — **base / build / peak / taper**, "with a weekly load pattern per phase" |
| Microcycle (week) | **Training Week** (Mon–Sun, Athlete Timezone) + the per-phase **weekly load pattern** |
| A/B/C priority + peak/taper | **Event Priority** (Friel-standard A/B/C; A drives full taper, B a light week, C folded in) |
| Per-week volume currency (TSS) | **Planned TSS**, **TSS**, **CTL** — and **Fitness Projection** already "replays the active Plan Outline's per-phase weekly-load pattern through the 42-day CTL EWMA" and converts weekly hours → daily TSS (≈60 TSS/endurance-hour, IF≈0.77) |
| Backward-from-race planning | **Plan Generation** anchors to the **Target Event**; Plan card shows "week N of M" + countdown |
| Downward load adjustment / recovery response | **Week Replan** (persistent, at-most-once, volume-only downward rescale) |
| Progression modeled as CTL ramp | **Fitness Projection** (forward CTL curve from the Outline) |

**Gaps (what MANUAL planning would add):**

1. **Authored per-week load target the athlete controls.** Today the weekly-load
   pattern lives *inside* the Plan Outline as generation input and projection
   fodder; there is no surface where the athlete directly sets "week N = X hours /
   Y TSS." This is the single most universal MANUAL-planning primitive (TP ATP,
   intervals.icu). **Fits existing vocabulary as an authored extension of the Plan
   Outline's "weekly load pattern."**
2. **Intra-mesocycle loading vs recovery structure (3:1 / 2:1).** The Outline has
   per-phase patterns but no explicit "every 4th week is a recovery week at −30%"
   concept. **Week Replan** softens *reactively*; there is no *planned* recovery
   week. Gap.
3. **Explicit taper as a volume-shaped block.** The Outline names "taper" but the
   model has no taper *rule* (hold intensity, cut volume ~40–60% over ~2 weeks).
   The science (Mujika/Bosquet) and Event Priority A ("full taper") both point to
   making taper a first-class, volume-only shaping — which conveniently reuses the
   **Week Replan** volume-scaling machinery (scale Step Quantities, not Intensity
   Targets).
4. **Prep and Transition phases.** The Outline's base/build/peak/taper omits
   Friel's **Prep** (pre-base) and **Transition** (off-season recovery link). Minor
   gap; likely deferrable for V1.
5. **Progressive overload as authored intent.** Only the *downward* volume rule
   (Week Replan) exists; there is no authored *upward* ramp rate. Gap, but
   Fitness Projection already implies the ramp — could surface it.
6. **Block-periodization / reverse / TID selection.** No representation, and none
   needed for V1 (see recommendation).

## Recommendation for Trainm8 V1

Design the MANUAL training-planning feature as **direct authoring of the existing
Plan Outline**, adopting the platform-convergent model (events + priorities +
volume currency + backward-from-race phases + per-week targets), and reusing the
app's existing load and volume-scaling machinery rather than inventing new
primitives.

**Support in V1:**

1. **The macro → meso → micro nest, using the common convention** (macro = season
   to the **Target Event**, meso = **Plan Outline** phase, micro = **Training
   Week**). Do **not** adopt Bompa's literal "macrocycle = 2–6 wk" naming — the
   app, TP, and intervals.icu all use macro = season.
2. **Author the Plan Outline directly.** Let the **Self-Coaching Athlete** set the
   ordered phases (**base / build / peak / taper**) and each phase's duration,
   anchored backward from the **Target Event** (Friel/TP/intervals.icu pattern).
   Keep it a property of the **Event**, as ADR 0018 already has it.
3. **A per-week load target the athlete controls**, expressed in the currency the
   app already speaks — **weekly TSS** (and/or weekly hours), consistent with
   **Planned TSS** and **Fitness Projection**'s ≈60-TSS/hour assumption. This is
   the authored form of the Outline's "weekly load pattern."
4. **Planned loading/recovery microcycle structure: a 3:1 default (with 2:1
   option) and a recovery-week volume cut (~30%).** This is the one intra-meso
   structure every platform ships; it composes with — and is the *planned*
   counterpart to — the reactive **Week Replan**.
5. **A first-class taper**: hold **Intensity Targets**, cut **Step Quantities**
   (volume) ~40–60% over ~2 weeks before an **A-priority Event**, reusing the
   Week Replan volume-only scaling rule. Grounded in Mujika/Padilla + Bosquet.
6. **Keep intensity where it already lives** — per-**Step Intensity Target** — and
   treat **intensity distribution (80/20 / polarized / pyramidal) as a derived
   report** over a Training Week or phase, not an authored structural field.

**Defer for V1:**

- **Block periodization** (accumulation/transmutation/realization) and **reverse
  periodization** — evidence is niche/mixed and neither maps to the current
  base/build/peak Outline; the linear Friel model the app already encodes is the
  right V1 default.
- **Authored intensity-distribution targets** at the plan level (polarized vs
  pyramidal selection) — surface as a derived metric first; make it authorable
  only if athletes ask.
- **Prep and Transition phases** — add later if the base/build/peak/taper set
  proves too coarse.
- **Progressive-overload ramp rate as an explicit authored knob** — Fitness
  Projection already implies the ramp; expose only if per-week targets alone
  prove insufficient.

**One-line essence:** V1 = let the athlete author the Plan Outline the way
TrainingPeaks/intervals.icu let them author an ATP — phases + per-week TSS/hour
targets backward from the A-race, with a 3:1 loading/recovery default and a
volume-only taper — all phrased in the app's existing **Plan Outline / Training
Week / Planned TSS / Event Priority** vocabulary; defer block/reverse periodization
and plan-level intensity-distribution targets.

## Sources

Hierarchy & Bompa:
- NSCA, "Hierarchical Structure of Periodization Cycles": https://www.nsca.com/education/articles/kinetic-select/hierarchical-structure-of-periodization-cycles/
- TrainingPeaks, "Macrocycles, Mesocycles and Microcycles": https://www.trainingpeaks.com/blog/macrocycles-mesocycles-and-microcycles-understanding-the-3-cycles-of-periodization/
- Bompa & Buzzichelli, *Periodization: Theory and Methodology of Training*, 6th ed., Human Kinetics 2019 (ISBN 9781492544807): https://us.humankinetics.com/products/periodization-6th-edition (excerpt pages 429'd/403'd to fetcher)
- Morland Strength summary of Bompa Ch. 6 (terminology note): https://morlandstrength.com/2017/12/01/topic-76-periodization-as-planning-and-programming-of-sport-training-ch-6/

Phase models:
- Issurin 2010, *Sports Medicine* 40(3):189–206 (paywalled; open PDF mirror): https://link.springer.com/article/10.2165/11319770-000000000-00000 · https://www.hmmrmedia.com/wp-content/uploads/2015/08/new-horizons-periodization.pdf
- Issurin 2008, "Block periodization versus traditional training theory: a review," *J Sports Med Phys Fitness* 48(1):65–75: https://pubmed.ncbi.nlm.nih.gov/18212712/
- "Biological Background of Block Periodized Endurance Training: A Review," 2019: https://pubmed.ncbi.nlm.nih.gov/30411234/
- Friel, "The Transition Period" (TrainingPeaks): https://www.trainingpeaks.com/blog/the-transition-period-by-joe-friel/
- Ramos-Campo et al. 2019, reverse vs linear in triathlon, *IJERPH* 16(15):2807: https://pmc.ncbi.nlm.nih.gov/articles/PMC6696421/
- Kong et al. 2022, "Reverse Periodization … Systematic Review," *Sports Medicine – Open*: https://pmc.ncbi.nlm.nih.gov/articles/PMC9023617/

Load progression & taper:
- Friel, "Recovery Week Design": https://joefrieltraining.com/recovery-week-design/
- Friel, "Aging: Matching the Mesocycle to Your Recovery": https://joefrieltraining.com/aging-matching-the-mesocycle-to-your-recovery/
- Mujika & Padilla 2003, *Med Sci Sports Exerc* 35(7):1182–1187 (paywalled; open PDF mirror): https://journals.lww.com/acsm-msse/fulltext/2003/07000/scientific_bases_for_precompetition_tapering.17.aspx · http://robin.candau.free.fr/Mujika_Padilla.pdf
- Bosquet et al. 2007, "Effects of Tapering on Performance: A Meta-Analysis," *Med Sci Sports Exerc* 39(8):1358–1365: https://pubmed.ncbi.nlm.nih.gov/17762369/

Intensity distribution:
- Seiler 2010, "What Is Best Practice for Training Intensity and Duration Distribution in Endurance Athletes?," *IJSPP* 5(3):276–291: https://pubmed.ncbi.nlm.nih.gov/20861519/
- 8020 Endurance, "All About (Intensity) Balance": https://www.8020endurance.com/allaboutintensitybalance/

Platforms (first-party):
- TrainingPeaks Help Center, "How do I set up my ATP" (204073724) & "Annual Training Plan Methodologies" (224662768) — 403 to fetcher; content via Help-Center search + learn articles
- TrainingPeaks, "A Look at Planning by TSS with the New ATP": https://www.trainingpeaks.com/learn/articles/a-look-at-planning-by-tss-with-the-new-atp/
- intervals.icu, "Annual Training Plan Builder": https://www.intervals.icu/features/annual-training-plan/
- intervals.icu forum, ATP builder announcement: https://forum.intervals.icu/t/annual-training-plan-builder/122085
- intervals.icu forum, weekly targets: https://forum.intervals.icu/t/weekly-targets-load-duration-distance/60787
- Garmin Coach adaptive plans: https://www.garmin.com/en-US/blog/fitness/garmin-training-plans-for-runners/
- Final Surge, "Creating Structured Workouts": https://support.finalsurge.com/hc/en-us/articles/360041370453-Creating-Structured-Workouts

Project context:
- `/home/user/trainm8/CONTEXT.md` — Plan Outline, Target Event, Event Priority, Training Week, Week Replan, Fitness Projection, Weekly Plan Adherence, Training Availability, Plan Generation, Intensity Target.
- `/home/user/trainm8/docs/adr/0018-plan-card-on-home.md` — active plan = nearest Target Event with a Plan Outline; arc signals (phase, week N of M).
- `/home/user/trainm8/docs/adr/0025-adaptive-week-replan.md` — persistent, at-most-once, volume-only downward rescale; Step Quantities scale, Intensity Targets do not.
