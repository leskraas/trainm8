# Reference: intensity, load and volume figures

Extracted reference data from the #374 research, kept **separate from the decision
evidence** in [`374-volume-continuity-and-progressive-overload.md`](./374-volume-continuity-and-progressive-overload.md).
That note argues a decision (ADR 0040) and should stay as it is. This file is the
lookup table: figures, formulas and vocabulary that will be wanted by tickets not
yet written, and that are **expensive to re-derive** because several sources sit
behind bot challenges (see §9).

**Read the caveats.** Nothing here is a decision. Several figures carry
qualifications that matter more than the number, and the numbers whose provenance
is weak are marked ⚠️.

---

## 1. Training intensity distribution — the three-zone frame

Bounded by the two physiological turn points (LT1/VT1 and LT2/VT2):

| Zone | Definition |
| --- | --- |
| Z1 | ≥50% VO₂max to the first lactate/ventilatory threshold |
| Z2 | Between the first and second threshold |
| Z3 | Above the second threshold; near/at maximum VO₂max |

Source: Treff et al. 2019, *Front. Physiol.* —
<https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2019.00707/full>

### Published splits (Z1 / Z2 / Z3)

| Model | Split | Source |
| --- | --- | --- |
| **Polarized** | 75–80 / 5 / 15–20 | Seiler & Tønnessen 2009, *Sportscience* — <https://www.sportsci.org/2009/ss.htm> |
| **Polarized** | 75–80 / <10 / 15–20 | Meta-analysis — <https://pmc.ncbi.nlm.nih.gov/articles/PMC11329428/> |
| **Pyramidal** | ~80 / ≤10 / 5–10 | 2025 review — <https://pmc.ncbi.nlm.nih.gov/articles/PMC12568352/> |
| **Threshold** | 30–50 / **40–60** / ~10 | same 2025 review |

**The defining relation matters more than the numbers.** Polarized requires
Z1 > Z3 > Z2 with Z2 small; pyramidal requires Z1 > Z2 > Z3; threshold puts the
mass in Z2.

### Seiler's 5-zone scale (Norwegian Olympic Federation)

| Zone | %VO₂max | Lactate (mM) |
| --- | --- | --- |
| Z1 | 45–65 | 0.8–1.5 |
| Z2 | 66–80 | 1.5–2.5 |
| Z3 | 81–87 | 2.5–4 |
| Z4 | 88–93 | 4–6 |
| Z5 | 94–100 | 6–10 |

Source: Seiler & Tønnessen 2009 — <https://www.sportsci.org/2009/ss.htm>

### TID varies by phase — it is not a season constant

| Phase | Z1 share | Source |
| --- | --- | --- |
| General preparation | 78–91% (Z2 2–11%, Z3 2–9%) | 2025 review, PMC12568352 |
| Specific preparation | 70–85% (Z2 10–20%, Z3 5–10%; up to 11–15% Z3 in triathlon) | same |
| Preparation (earlier survey) | 84–95% | Stöggl & Sperlich 2015 — <https://pmc.ncbi.nlm.nih.gov/articles/PMC4621419/> |
| Pre-competition | 70–91% | same |
| Competition | cyclists ~77/15/8; XC skiers still pyramidal at ~88% Z1 | PMC12568352 |

Seiler 2010 on Norwegian XC skiers: "the overall intensity distribution **became
more polarized as athletes approached competition**."

Tønnessen et al. 2014, elite XC skiers/biathletes in their gold-medal year: from
general preparation to peaking, **HVLIT fell 21%** and **HIT — especially zone 5 —
rose 40%**, while total volume fell **−32 ± 15%** (p<.01) and HIT time held roughly
constant in absolute terms. So the distribution shifts mainly because low-intensity
volume is *withdrawn*. <https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0101796>

### No TID is universally best

Meta-analysis (PMC11329428): polarized superior for VO₂peak only modestly and
conditionally — SMD 0.24 (95% CI 0.01–0.48, p=0.040) overall; SMD 0.40 for
interventions <12 weeks; SMD 0.46 in highly trained athletes; and **no advantage
for time-trial performance** (SMD −0.01, CI −0.28–0.25).

Fitzgerald calls 80/20 "a **population optimum**" and "a **narrow range rather
than a precise ratio**" — <https://www.8020endurance.com/allaboutintensitybalance/>

---

## 2. Polarization Index — a single auditable scalar

```
PI = log₁₀( Z1 / Z2 × Z3 × 100 )
PI > 2.00  ⇒ polarized
PI ≤ 2.00  ⇒ non-polarized
```

Worked examples from the originating paper: `80-0-20 → 3.18`; `60-14-26 → 2.05`;
`74-11-15 → 2.00` (borderline); `80-17-1 → 0.91`. A modified form handles Z2 = 0.

Source: Treff et al. 2019 (URL in §1). Shipped by intervals.icu in seven places
(activity summary, zones popup, activity-list column/filter, weekly calendar
summary, planned-workout dialogs, `/totals`, and as a plottable series) —
<https://forum.intervals.icu/t/polarization-index-added/49877>

**Relevant because ADR 0040 keeps distribution as a derived metric.** If we ever
surface it, this is the published formula with a published threshold.

---

## 3. Measuring TID: the unit changes the answer by ~3×

On the **same** elite XC-ski training:

| Method | Z1 / Z2 / Z3 |
| --- | --- |
| Time-in-zone (TIZ) | 96.1 / 2.9 / 1.1 |
| Session-goal (SG) | 86.6 / 11.1 / 2.4 |

Published TIZ→SG conversion factors: 0.9/1.1 in the low-intensity range, **3.0/0.33
in the high-intensity range**. Sylta, Tønnessen & Seiler —
<https://pubmed.ncbi.nlm.nih.gov/24408353/>

**So "80/20" is ambiguous until you say 80% of what.** Seiler's canonical phrasing
is by *sessions*; 80/20 Endurance's plans are built on *time*. A field named
`targetDistribution: [80,5,15]` without a unit tag is a latent bug.

Seiler's methodological position, and the reason ADR 0040 authors a session count
rather than zone minutes:

> "Nominally allocating each training session to an intensity zone based on the
> intensity of the primary part of the workout, the '**session goal approach**,'
> yields better matching between heart rate analysis and athlete perception of
> session effort … **Typical software-based heart rate analysis methods overestimate
> the amount of time spent training at low intensity** and underestimate the time
> spent at very high workloads."
> — Seiler 2010, *IJSPP* 5(3):276–291

### Six documented miscounting traps

If TID measurement is ever built, these are the known failure modes:

1. **Count the whole interval block, including recoveries, as high intensity.** An
   8×1 min session with 2 min recoveries produces ~24 min of high-intensity HR time
   for 8 min of high-intensity power. ⚠️ Warm-up/cool-down accounting is *not*
   addressed in any source found.
2. **HR over-reports time in middle zones**, because BPM must pass through them on
   the way up and down. 80/20's own coach: "**something like 70/30 in the chart is
   about 'real' 80/20 when using that chart for HR**". Hence power > pace > HR.
3. **Never mix intensity metrics** when measuring TID (Fitzgerald).
4. **Swim distance ≠ time** — 75% of distance ≈ 80% of time.
5. **Intensity blindness** is an execution failure, not an arithmetic one: athletes
   believing they are easy are in fact at moderate intensity.
6. ⚠️ **Integer-only zone boundaries in TrainingPeaks** ("we can only use 81-90%
   for Zone 2") — search-snippet only, forum page unreachable.

---

## 4. The 80/20 seven-zone system

Zones 1, 2, **X**, 3, **Y**, 4, 5 — X and Y were originally deliberate *gaps*, to
stop low intensity bleeding into moderate and to force a commitment between
moderate and high. **Zone X is the "moderate-intensity rut"** and avoiding it is the
stated point of the method.

| Zone | %LTHR | Run pace (%TP) | Bike power (%FTP) | Run power (%rFTP) | Swim (%CV) |
| --- | --- | --- | --- | --- | --- |
| 1 | 72–81 | 60–76 | 50–70 | 50–76 | 75–84 |
| 2 | 81–90 | 76–87 | 70–83 | 76–88 | 84–91 |
| **X** | **90–95** | **87–93** | **83–91** | **88–94** | **91–96** |
| 3 | 95–100 | 93–100 | 91–100 | 94–100 | 96–100 |
| **Y** | **100–102** | **100–102** | **100–102** | **100–103** | **100–102** |
| 4 | 102–105 | 102–115 | 102–110 | 103–120 | 102–106 |
| 5 | >105 | >115 | >110 | >120 | >106 |

Read from the live calculator: <https://www.8020endurance.com/80-20-zone-calculator/>

**The 80/20 cut sits at the top of Zone 2 — the bottom of Zone X, not Zone 3**:
"80% of your time in Zones 1 and 2, and 20% in the other 5". Physiologically that
is VT1, ≈77% of maximum heart rate.

Honesty note from the authors: the Z2/X boundary "is empirical", but the Z1/Z2 line
is "a **best-guess** from Coach Matt and Coach David".

**Ratio shifts by phase**: "during off-season and early base training, it's best to
do somewhat **less than 20 percent**" at moderate/high; for 70.3/IM race-specific
blocks, "we write those weeks at **85/15**, and assume that the athletes who
incorporate Zone X in racing are **70/30** for those weeks".

---

## 5. Quality-session guidance

The primitive ADR 0040 adopted. Published numbers:

| Source | Guidance |
| --- | --- |
| **Seiler 2010** | "For an athlete training 10 to 14 times per week … **two to three** of these sessions would be ThT or HIT bouts. **Additional increases in HIT frequency do not induce further improvements** and tend to induce symptoms of overreaching/overtraining." |
| **Seiler & Tønnessen 2009** | "An elite athlete training 10-12 times per week is therefore likely to dedicate **1-3 sessions weekly** to training at or above maximum lactate steady state." |
| **Norwegian world-class coaches** (12 coaches, 380+ international medals) | "**2–3 weekly 'key workout' days** consisting of **3–5 intensive training sessions**"; "hard–easy rhythmicity"; all-out sessions only in the last 3–6 weeks before the main competition — <https://pmc.ncbi.nlm.nih.gov/articles/PMC12031707/>, <https://pmc.ncbi.nlm.nih.gov/articles/PMC11560996/> |
| **Jack Daniels** | Plans named by the count — the marathon "**2Q**" programme has two quality workouts per week |
| **Marius Bakken** (Norwegian double-threshold originator) | "twice-a-week two threshold sessions and usually once a week a session with different stimuli … an '**X element**'", on ~180 km/wk |
| **80/20 Endurance** | "Devote roughly **one out of every three** training sessions to moderate or high intensity." 13 runs/wk → 3 hard; 6–7 runs/wk → 2 hard |
| **Seiler, at low frequency** | 3 days/wk → "two low-intensity and one high"; 4 days/wk → "three low and one high versus two low and two high(-ish)" |
| **Xert** (shipped control) | **Polarization Level** slider, hard:easy days from **1:1 to 5:1** |

### Session frequency is an independent variable even at matched volume and matched zone time

Tønnessen, Hisdal & Rønnestad 2020, *IJERPH* 17(9):3190 —
<https://pmc.ncbi.nlm.nih.gov/articles/PMC7246952/>

Elite endurance athletes randomised to **2 vs 4 interval sessions/week**, matched
for total weekly volume **and** both completing **136 minutes** in zone 3. The
2-session arm (8×8 min and 6×12 min) improved 8 km rollerski TT (p=0.04), exercise
economy (p=0.01) and %VO₂max at anaerobic threshold (p=0.04). The 4-session arm
improved **nothing** significantly.

Corroborating dose-response: 2–3 weekly 4×4 min HIIT sessions improve VO₂max with
"no clear additional benefit from increasing the frequency to three sessions per
week" — <https://pmc.ncbi.nlm.nih.gov/articles/PMC12451023/>

### And a distribution target is still under-determined

Rønnestad, Hansen & Ellefsen 2014: block vs traditional organisation, where "**the
total training volume and intensity was similar between the two modes**" and "the
distribution of this training within the training zones **were similar between
groups**" — yet BP gained VO₂max +4.6 ± 3.7% and Wmax +2.1 ± 2.8% with **no
significant change in TRAD**.
<https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1600-0838.2012.01485.x>

Rønnestad 2022, 12-week load-matched: 7.5 ± 2.0 vs 8.0 ± 2.7 h/wk (p=0.571)
described two structurally unrecognisable plans.
<https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2022.837634/full>

---

## 6. Volume of an intensity-led block

Rønnestad 2025 crossover, well-trained cyclists (VO₂max 70.5 mL·min⁻¹·kg⁻¹) —
<https://pmc.ncbi.nlm.nih.gov/articles/PMC12575440/>

| Block | Z1 volume, preceding weeks | Z1 volume, in block | Change |
| --- | --- | --- | --- |
| MIT (6 sessions / 7 days; 5–7 × 10–14 min) | 7:58 | 4:43 | **≈ −41%** |
| HIT (5 sessions / 6 days; 5 × 8.75 min) | 7:16 | 4:04 | **≈ −44%** |

Total work-interval duration 7h04 (MIT) vs 3h42 (HIT) — the blocks were
deliberately *not* volume-matched to each other.

Season-scale volume reduction as intensity rises:

- Systematic review, trained cyclists: traditional periodization runs
  **7.5–10.76 h·wk⁻¹**, block periodization **8.75–11.68 h·wk⁻¹** —
  <https://pubmed.ncbi.nlm.nih.gov/36640771/>
- Norwegian world-class coaches, long-distance running: **13–16 h/wk (prep) →
  11–14 h/wk (competition)**
- Tønnessen 2014: **−32 ± 15%** general preparation → peaking

---

## 7. Deload and taper specifications

### Endurance taper — the best-evidenced number in the whole survey

Bosquet et al. 2007 meta-analysis: a **2-week taper with training volume
exponentially reduced 41–60%** is "the most efficient strategy to maximize
performance gains", and optimally "**without any modification of either training
intensity … or frequency**". <https://pubmed.ncbi.nlm.nih.gov/17762369/>

Mujika & Padilla 2003: a taper is "a progressive nonlinear reduction of the
training load", best achieved by **maintaining intensity, cutting volume ~60–90%,
reducing frequency no more than ~20%**, over **4 to >28 days**; progressive tapers
beat step tapers; performance improves ~3% (range 0.5–6%).

### Strength deload — Bell et al. 2025 specification

<https://shura.shu.ac.uk/35313/3/Bell-APracticalApproach(AM).pdf>

| Parameter | Specification |
| --- | --- |
| Approach | "A **single step reduction** in overall training load at the beginning of the deload" |
| Volume, low recovery needs | reduced **≤25–45%** relative to normal training volume\* |
| Volume, moderate | reduced **40–60%**\* |
| Volume, high | reduced **60–90%**\* |
| Mechanism | fewer repetitions per set, or fewer sets per session, or both |
| Intensity | decrease **~10% of %RM** while maintaining reps, and/or **1–3 RIR** |
| Frequency | "will generally remain unchanged" |
| Duration | 5–7 days structured; a reactive deload "may be a single training session" |

\* **"'Normal' training volume refers to the volume undertaken in the previous
training block"** — i.e. the deload magnitude is natively *relative*.

Survey data (344+ strength/physique athletes): deload duration **6.4 ± 1.7 days**,
every **5.6 ± 2.3 weeks** — <https://pubmed.ncbi.nlm.nih.gov/38499934/>

Coach practice: volume cut "30 to >50%" (physique ~25%, strength 50%+); load cut
~10%; sets to at least 4 RIR.

### Endurance recovery-week cut

intervals.icu default **3:1 with −30% volume**, citing a **25–40%** range (Bompa &
Haff 2009; Issurin 2010).

**Runna's is a transformation, not a scalar** — hard sessions cut more than easy
ones, the long run cut by ability, **plus one fewer run**. Flagged to #367.

---

## 8. Strength volume currency

### The unit

**Sets per muscle group per week.** ACSM 2026 Position Stand (137 systematic
reviews, >30,000 participants): strength enhanced by "≥80% 1RM … **2-3 sets** … **≥2
sessions/wk**"; hypertrophy by "higher volumes (**≥10 sets/wk**)"; power by
"low-to-moderate volume (**≤24 repetitions⋅sets**)" —
<https://pubmed.ncbi.nlm.nih.gov/41843416/>

Umbrella review: "**at least 10 weekly sets per muscle group** is necessary to
maximize increases in muscle mass" —
<https://pmc.ncbi.nlm.nih.gov/articles/PMC9302196/>

Pelland et al. dose-response meta-regression introduces **fractional set counting**
(direct set = 1.0, indirect = 0.5), with "diminishing returns" —
<https://sportrxiv.org/index.php/server/preprint/view/460>

**Rejected alternatives**, with reasons: *tonnage* is not mechanical work and cannot
be attributed per muscle; *time under tension* is explicitly found non-influential
by ACSM 2026 and by rep-duration meta-analyses (0.5–8 s equivalent); *sRPE ×
duration* is a monitoring output with weak resistance-training validity (r as low as
0.25) that nobody authors plans in.

**For maximal strength the currency differs**: number of lifts (reps) within an
intensity band. Prilepin's chart, from training logs of >1,000 elite Soviet
weightlifters: 70–80% → 3–6 reps/set, 12–24 reps/session; 80–90% → 2–4 reps/set;
86–90% → 1–2 reps/set, 4–10 total; ≥91% → 1–3 reps.
<https://torokhtiy.com/blogs/guides/prilepins-chart>

### RP volume landmarks

- **MV** (Maintenance Volume) — "keeps the muscle you have"; ≈**4–8 sets/wk**
- **MEV** (Minimum Effective Volume) — the least that produces measurable gains;
  "generally **8–12 weekly sets** for most major muscle groups"
- **MAV** (Maximum Adaptive Volume) — a *zone* between MEV and MRV, not a point
- **MRV** (Maximum Recoverable Volume) — "the maximum you can train with regularly
  and still barely recover from … **doing more than this would cause worse results
  than doing less**"

⚠️ **Superseded and corrected by [#380's findings](./380-strength-volume-landmarks.md)
— do not use the numbers below.** They came from a secondary aggregator (chest
MV 8 / MEV 10 / MAV 12–20 / MRV 22; calves MV 6 / MEV 8 / MAV 12–16 / MRV 20) and
**do not match RP's published text for those muscles** — the aggregator appears to
have mixed chest with *back* and used an older vintage. The 403/429 walls also have
a workaround: `help.rpstrength.com` serves full article bodies through the vendor's
own public Zendesk API, and all 14 per-muscle guides have now been retrieved
first-party. Read §2 of the #380 note instead.

Two structural corrections travel with the numbers, and they matter more than the
numbers do: **MRV is not a scalar** — RP publishes it as a function of weekly
frequency — **MAV is per session**, not per week, and **MEV = 0** for five muscles.
Four scalar attributes per muscle cannot represent that.

### The strength mesocycle ramp — two landmarks and a duration

> "if you know you'll be training for 4 weeks before your deload, you can do **10
> sets in week 1, 13 sets in week 2, 16 sets in week 3, and 20 sets in week 4**.
> Much like you'd plan a strength mesocycle that goes from 70%1RM to 80%1RM by
> spacing out the increments weekly, **you do the same thing for volume between MEV
> and MRV**."

Block length is a **consequence**, not a choice: "lasts as long as it takes to hit
systemic MRV" — 3–4 weeks (very advanced) to 12 weeks (beginners), and RP's own app
caps it at ~6 accumulating weeks.

**The sawtooth with a rising baseline** — the single most important structural
figure here:

> "Mesocycle 1: Start with ~12 weekly sets per arm muscle and build up to ~21 sets.
> Mesocycle 2: Start with ~16 weekly sets and build up to ~25 sets. Mesocycle 3:
> Start with ~21 weekly sets and build up to ~30 sets."

Meso 2 **opens at 16 after Meso 1 closed at 21** — a deliberate ~24% drop. A
planner must not flag it.

### Block-boundary volume drops in strength

- **JTS block periodization**: volume phase "75 barbell reps spread across 3 major
  exercises" at 70%+ → transition phase "**50 barbell reps**" at 80%+ — a −33%
  volume cut with a +10pp intensity rise. "The volume is reduced and the weights are
  increased." <https://www.jtsstrength.com/bastardized-block-periodization/>
- **Issurin's taxonomy**: accumulation (basic abilities, extensive volume) →
  transmutation (sport-specific, intensive stress) → realization (recovery and
  peaking); blocks of **2–4 weeks**, three blocks forming a ~2-month stage, 5–7
  stages per year. The volume/intensity trade at the boundary is the design, because
  concurrent high-volume basic and high-intensity specific work "evokes conflicting
  physiological reactions".
- **RP resensitization**: a whole mesocycle **at MV** with 2× frequency is a
  legitimate phase — a block whose opening volume is *lower than the previous
  block's opening volume*, deliberately.

### Autoregulation is optional

Meta-analysis found **no significant 1RM advantage** for autoregulated over
standardized load prescription (MD 2.07 kg, 95% CI −0.32 to 4.46, p=0.09,
SMD 0.21) — <https://pmc.ncbi.nlm.nih.gov/articles/PMC8762534/>. If a feedback hook
is wanted later, the two documented shapes are RP's subjective triple (pump /
soreness / workload perception) and Helms' **RPE stops** (sets continue to a target
RPE, letting set count float) — <https://pubmed.ncbi.nlm.nih.gov/29786623/>

---

## 9. Platform vocabulary and status

### Xert — the only surveyed platform with two orthogonal authored axes

| Control | What it does |
| --- | --- |
| **Improvement Rate** | The volume axis, as a named rate: Off-Season −2, Taper −1, Maintenance 0, Slow 1, Moderate 2/3, Aggressive 4/5, Extreme 6/7 weekly XSS ramp |
| **Polarization Level** | Hard:easy day ratio, **1:1 → 5:1** |
| **Athlete Type** | 12 types mapped to focus durations (Power Sprinter 20 s … Triathlete 3 h); "your Training Load balance (Low / High / Peak) will shift toward your chosen Focus" |
| **Specificity Rating** | How concentrated the strain is: **Pure** 100–67%, **Mixed** 67–33%, **Polar** 33–0% |
| **XSSR Preference** | Strain density, 50–150, default 100 |
| **Recovery Demands** | Slider |

**XSS** normalizes so one hour at threshold = 100, split **Low / High / Peak**
(Threshold Power / High-Intensity Energy / Peak Power). **Focus Duration** is a work
allocation ratio — a 4-minute focus is **70/26/4** Low/High/Peak. Daily targets are
issued per energy system and compliance scored per system (On / Slightly Off / Off
Target). Manual override of L/H/P XSS targets exists at the device field.

Xert explicitly rejects time-in-zone as the accounting unit: "time-in-zones,
weighted average power and total work miss this important information".
Docs: <https://www.baronbiosys.com/glossary/>

### Status flags worth knowing before citing

- **Today's Plan is defunct.** `todaysplan.com.au` serves only a shutdown notice;
  Final Surge completed a data import of its users. All evidence is Wayback. It
  shipped an automatic taper week and **deliberately removed it** (release notes,
  June 2018) — rare negative evidence about auto-periodization.
- **intervals.icu's ATP Builder is beta and Premium-only**, cannot be edited after
  generation (delete and rebuild), and has a known double-counting bug when weekly
  targets and planned workouts coexist. Its model is the most interesting in the
  survey; its implementation is the least settled.
- **WKO5 is analysis-only** and one-way (it does not upload to TrainingPeaks). Its
  unique contribution: **CIL** (Chronic Intensity Load), an IF-driven 42-day
  analogue of CTL, which makes "volume down, intensity held" *measurable as a
  divergence between two load series* rather than a single scalar cut. Worth
  remembering if Fitness Projection ever needs to represent a taper honestly.
- **Stryd's "Training Distribution" is not TID** — it is a peer-percentile
  comparison across four capability buckets (Fitness, Muscle Power, Fatigue
  Resistance, Endurance). False friend.

### Sources that resist automated fetching

Recorded so a future session does not re-spend the effort:

| Host | Behaviour | Workaround that worked |
| --- | --- | --- |
| `help.trainingpeaks.com` | HTTP 403 (Cloudflare) | Vendor's own public Zendesk API: `/api/v2/help_center/en-us/articles/<id>.json`; or the `/learn` and `/blog` articles |
| `support.trainerroad.com` | Cloudflare challenge | Same Zendesk API pattern |
| `support.finalsurge.com` | — | `finalsurge.zendesk.com/api/v2/help_center/...` (also allows enumerating the full 60-article catalogue) |
| `rpstrength.com` | HTTP 429 | Search snippets only — figures unverified |
| `help.rpstrength.com` | HTTP 403 | Not readable |
| Xert Zendesk | HTTP 403 | `baronbiosys.com` glossary pages instead |
| `8020endurance.com` + forum | SiteGround bot challenge | Wayback snapshots of canonical URLs |
| `bjsm.bmj.com`, `journals.humankinetics.com` | Paywall / 403 | PMC free copies; SportRxiv preprints; PubMed abstracts |
| `todaysplan.com.au` | Site shut down | Wayback only |
| `intervals.icu` feature pages | Thin — **do not** contain the numbers | Forum announcement threads via the Discourse JSON API |

⚠️ **A specific trap**: an early fetch appeared to return intervals.icu's 5% default
and injury-risk percentages from `intervals.icu/features/annual-training-plan/`.
Raw retrieval proved that page contains **no such text** — the figures live in the
forum announcement post. Do not trust secondary summaries of intervals.icu defaults
without hitting the forum thread.

---

## 10. Claims to handle with care

- **intervals.icu cites Gabbett 2016 for precise risk percentages** ("<10% keeps
  injury risk low ~7.5%, >15% pushes it to ~21%"). Those figures are Gabbett's
  **self-declared unpublished observations**, in session-RPE units, from
  professional rugby league preseason. The "~7.5%" appears nowhere in Gabbett — it
  is read off a figure.
- **The ACWR 0.8–1.3 "sweet spot"** "was not apparent in the two original studies"
  and is the subject of a formal retraction request to BJSM. Impellizzeri et al.
  2020: "**There is no evidence supporting the use of ACWR in
  training-load-management systems.**" A randomised chronic denominator was as
  associated with injury as the real one. Never a planning gate.
- **The 10% rule** has a failed RCT (Buist 2008, n=532: 20.8% vs 20.3%, P=.90);
  Nielsen 2014's primary outcome was null and its authors advise <30%.
- ⚠️ **80/20 varying its ratio by phase as 90/10 → 70/30** was asserted by a search
  snippet; 80/20's own text presents those as *individual athlete variation*. The
  phase variation that *is* sourced is "<20% hard in early base" and the 85/15 →
  70/30 IM race-specific figure (§4).
- ⚠️ **Jack Daniels' percentage caps per intensity type** (e.g. threshold ≤10% of
  weekly mileage) are widely repeated but the high-trust source reached "provides no
  explicit percentages of weekly mileage". Check the book.
- ⚠️ **Seiler's Hierarchy of Endurance Training Needs** (volume and frequency at the
  base, intensity distribution a layer above) rests on search-indexed excerpts, not
  a verified full reading. Probable, not confirmed.
- ⚠️ **Andy Coggan on whether strength should be scored in TSS** — only a community
  paraphrase was available, no primary statement.
