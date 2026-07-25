# Volume continuity, progressive overload, and intensity as authored intent

Research backing [#374](https://github.com/leskraas/trainm8/issues/374) — "Decide
how a block's opening volume relates to the block before it". Five parallel
investigations against primary sources: platform documentation, peer-reviewed
sport science, and writing by the originators of each methodology.

Companion to [`363-training-periodization.md`](./363-training-periodization.md),
which this note extends on gap 5 ("progressive overload as authored intent").

**Sourcing note.** Several vendor help centres (TrainingPeaks, TrainerRoad,
Final Surge, RP Strength, Xert) return 403/429 to automated fetching; their
article bodies were read through the vendors' own public Zendesk/Discourse APIs
or Wayback snapshots, with canonical URLs cited. Claims that could not be
established from a primary source are labelled as such throughout rather than
inferred.

---

## 1. The decisive arithmetic: volume is not load

TSS is defined so that one hour at threshold equals 100, via
`TSS = IF² × hours × 100`
([TrainingPeaks](https://www.trainingpeaks.com/learn/articles/how-to-plan-your-season-with-training-stress-score/)).

**Hours enter linearly; intensity enters squared.** TrainingPeaks' own
easy/moderate/hard scale is 30 / 60 / 90 TSS per hour — a **3× spread** on the
axis a flat conversion collapses. Two 10-hour weeks can legitimately be 300 and
900 TSS.

Coggan's IF-by-session-type table, converted at `100 × IF²`
([source](https://www.trainingpeaks.com/learn/articles/normalized-power-intensity-factor-training-stress/)):

| Session type | IF | TSS/hour |
| --- | --- | --- |
| Recovery | <0.75 | <56 |
| Endurance | 0.75–0.85 | 56–72 |
| Tempo, interval workouts | 0.85–0.95 | 72–90 |
| Threshold intervals, 40 km TT | 0.95–1.05 | 90–110 |

Whole-session TSS/hour **saturates around 90–110** — a VO2max session does not
sit at a VO2max IF, because warm-up, recoveries and cool-down are inside it.

**The error dwarfs the signal.** A base→build intensity shift at constant hours
moves weekly load roughly 30%. The progression rates the field plans around are
5%/week (intervals.icu default) and 3–8 CTL points/week (TrainingPeaks). A flat
conversion therefore injects noise several times larger than the quantity being
controlled — silently, because the hours line looks perfectly smooth.

### `TSS_PER_ENDURANCE_HOUR = 60` is folklore

No primary source was found for it. TrainingPeaks' own published flat conversion
is **hours × 50**
([source](https://www.trainingpeaks.com/blog/quantify-fitness-goals/)), and 60 is
their *moderate* value, not their endurance value. Sport changes it as much as
intensity: weekly-average IF is ~0.83–0.9 for runners but ~0.6–0.7 for cyclists,
i.e. **≈69–81 vs ≈36–49 TSS/hour** for identical hours.

TrainingPeaks grades its own estimation methods for accuracy: per-minute-by-sport
**2/10**, easy/moderate/hard **2/10**, `IF² × hours` **5/10** (same source).

### The vendor that invented TSS says planning in hours is the weak path

> "Planning your training based on time is easy, but **only takes half of the
> equation into account by ignoring intensity**."
>
> "Since an ATP by duration does not take workload intensity into account, it is
> the **least precise** ATP planning method. We recommend planning an ATP by
> duration **for beginners**."
> — [TrainingPeaks](https://www.trainingpeaks.com/learn/articles/the-comprehensive-guide-to-creating-an-annual-training-plan/)

---

## 2. What the field actually authors

Ten endurance platforms surveyed. The authoring primitive splits three ways,
with almost nothing in between.

| Platform | Unit | Progression primitive | Phase-boundary opening volume |
| --- | --- | --- | --- |
| **TrainingPeaks ATP** | hours **or** weekly TSS **or** event CTL (no distance) | Absolute per-week, generated from a lookup table then typed/dragged. Ramp rate is *observed*, not authored | Absolute, from a period lookup table |
| **intervals.icu ATP Builder** (beta) | load / time (3–35 h/wk) / distance, any combination, per sport | **Rate, and only a rate** — week-to-week (default 5%) **plus a mesocycle-to-mesocycle rate** plus a plateau control | **Derived** from the mesocycle rate. *What it is relative to is undocumented* |
| **Joe Friel (method)** | annual hours → weekly hours per period | Absolute, table lookup. Rates appear only as coaching heuristics (+10%/wk novice; 5–8 CTL/wk) | Absolute — a cell in an (annual hours × period) table |
| **TrainerRoad** | days/wk × per-workout duration (no weekly volume field) | **Categorical rate** — 5-level Training Approach ("smaller jumps in load") | **Re-derived from training history** at each boundary |
| **Runna** | distance only; time explicitly refused | **Categorical rate** — Progressive / Steady / Gradual, their words: "your build rate" | Sawtooth, stated: "build, build, deload. Then build again from a slightly higher base" |
| **Coros** | distance (Distance/Time/Load are interchangeable *views*) | None — target-time slider + intensity level | Not published |
| **Final Surge** | per-workout distance + duration; weekly is a rollup | None | Phase is a date-range colour label carrying no volume |
| **Today's Plan** *(defunct)* | per-workout prescription; T-Score derived | None | "just blocks of weeks highlighted … with a different colour" |
| **WKO5** | analysis only, no season authoring | — | No phase object exists |
| **Garmin Coach** | running = distance, cycling = time | Not established | Not established |

### Convergences

1. **The deload is never the base for the next step.** Where a reference is
   stated it is the **loading peak**: TrainerRoad's recovery week is "roughly
   half the stress of your current phase's toughest week"; Runna resumes "from a
   slightly higher base". *No platform in the survey resumes progression from the
   deload week.* This is the strongest single convergence found.
2. **The 3:1 / 4:1 loading:recovery mesocycle is near-universal**, and the
   numbers cluster tightly (intervals.icu default 3:1 −30%; TrainerRoad every
   4–6 wk; Coros 3–4 wk; Friel every 3rd or 4th week by age).
3. **Steepness guards are advisory everywhere. Nobody blocks on a ramp figure.**
   Where a number is published it is a rate of change of a *smoothed load
   average*, not of raw weekly volume: TrainingPeaks 3–8 CTL/wk, Friel 5–8
   (>10 for at most a week), WKO5's user-set alert in TSS/day, Garmin's 0.8–1.4
   load ratio, Coros's ≥150% Intensity Trend.
4. **Platforms that want safety constrain the input space, not the ramp.** Runna
   is the only genuinely blocking regime and it blocks *inputs* — mileage bounds
   by ability × days, a "double build limit", taper-too-short.
5. **Taper depth and length are derived from event priority or race distance**,
   never typed as a volume number.
6. **A "phase" alone carries no volume in the manual-authoring tools.** Final
   Surge, Today's Plan and the Coros Training Hub all chose phase-as-annotation.
7. **Nobody models hours and load as independent axes at the weekly-planning
   layer.** Units are treated as interchangeable views; TrainingPeaks bridges
   hours↔TSS at ≈50 TSS/h in its own annual-volume table. The sole exception is
   WKO5's CIL/CTL pair, and it is analysis-only.

### Divergences worth knowing

- **Distance as a first-class planning unit is a running/consumer thing.**
  intervals.icu, Runna and Coros support it; **TrainingPeaks' ATP does not offer
  distance at all**. A cycling-heritage data model that omits distance will not
  serve runners.
- **Whether the taper holds intensity is genuinely contested**, not a
  documentation gap. Held: Friel, TrainerRoad, and the evidence base. Not held:
  Runna ("hard sessions are reduced or removed"). Coros contradicts itself
  across two official pages.
- **Deload as a scale factor vs a transformation.** intervals.icu uses one
  scalar (−30%). **Runna is the most sophisticated**: hard sessions cut more than
  easy, long run cut by ability, *plus one fewer run* — a deload is a
  transformation over session types, not a multiplier.
- **The Coros natural experiment.** The same vendor's *generated* marathon plan
  has phases, a load rhythm and a taper; its *athlete-authored* Training Hub has
  no volume field, no ramp, no deload type and no taper primitive. An athlete
  authoring manually gets zero periodization scaffolding. That gap is precisely
  the space this map occupies.
- **Today's Plan shipped an automatic taper week and deliberately removed it**
  (release notes, June 2018) — rare negative evidence about auto-periodization.

---

## 3. Progression thresholds: weaker evidence than the numbers suggest

- **The 10% rule has a failed RCT behind it.** Buist et al. 2008 (n=532, level 1)
  randomised novice runners to a 13-week graded programme built on the 10% rule
  vs a standard 8-week programme: injury incidence **20.8% vs 20.3%, P=.90**
  ([PubMed](https://pubmed.ncbi.nlm.nih.gov/17940147/)).
- **Nielsen et al. 2014**'s primary outcome was also null; the >30% subgroup
  signal was non-significant (HR 1.59, 95% CI 0.96–2.66, P=.07), and the
  authors' own advice is **<30%**, not <10%
  ([PubMed](https://pubmed.ncbi.nlm.nih.gov/25155475/)).
- **Gabbett himself** calls <10% "more of a *guide* than a *rule*".
- **ACWR should never be a planning constraint.** Impellizzeri et al. 2020:
  "**There is no evidence supporting the use of ACWR in training-load-management
  systems** or for training recommendations aimed at reducing injury risk"
  ([PubMed](https://pubmed.ncbi.nlm.nih.gov/32502973/)). The 0.8–1.3 "sweet spot"
  "was not apparent in the two original studies" and is the subject of a formal
  retraction request ([SportRxiv](https://osf.io/preprints/sportrxiv/gs8yu)).
- intervals.icu's citation of Gabbett for precise risk percentages over-claims:
  those figures are Gabbett's **self-declared unpublished observations** in
  session-RPE units from professional rugby league.

**Conclusion:** a 5–8%/week default is defensible as a conservative *convention*.
It must not be presented to athletes as evidence-based injury prevention.

**Taper — the one well-evidenced number.** Bosquet et al. 2007: a **2-week taper
with volume reduced 41–60%** maximises performance gains, and optimally
"**without any modification of either training intensity … or frequency**"
([PubMed](https://pubmed.ncbi.nlm.nih.gov/17762369/)).

---

## 4. Intensity as authored intent

### No platform lets an athlete author a target intensity distribution

TID is universally an **emergent, post-hoc statistic**. intervals.icu computes a
Polarization Index in seven places but accepts no distribution target; two
feature requests for exactly this are unanswered. TrainingPeaks has no field —
third-party plan authors encode TID in the plan **title**
(`80:20 Polarized Seiler Plan … (TID = 80:4:16)`). 80/20 Endurance's own coach
calls the absence "a real hole in the process".

### The originators argue against building one

> "In training organization, the unit of stress perceived and responded to by the
> athlete is **the stress of entire training sessions or perhaps training days,
> not minutes in any given heart rate zone**."
> — Seiler 2010, *IJSPP* 5(3):276–291

> "**Forget about 80/20 per se and concentrate instead on planning out your weeks
> by session type** … elite endurance athletes end up spending very close to 80
> percent of their training time at low intensity **without ever actually
> thinking about time-based intensity distribution**."
> — [80/20 Endurance](https://www.8020endurance.com/how-to-train-80-20-without-really-trying/)

Also: the unit changes the answer by ~3×. On the same elite XC-ski training,
time-in-zone gave 96.1/2.9/1.1 while the session-goal method gave 86.6/11.1/2.4
([PubMed](https://pubmed.ncbi.nlm.nih.gov/24408353/)). A `targetDistribution:
[80,5,15]` field without a unit tag is a latent bug.

### Quality-session count is the best-evidenced intensity primitive

- **Seiler 2010:** "For an athlete training 10 to 14 times per week … **two to
  three** of these sessions would be ThT or HIT bouts. **Additional increases in
  HIT frequency do not induce further improvements** and tend to induce symptoms
  of overreaching."
- **Twelve Norwegian world-class coaches** (380+ international medals): "2–3
  weekly *key workout* days consisting of 3–5 intensive training sessions"
  ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12031707/)).
- **Jack Daniels** names plans by it — the marathon "2Q" programme.
- **80/20 Endurance:** "Devote roughly **one out of every three** training
  sessions to moderate or high intensity."

**The decisive study.** Tønnessen, Hisdal & Rønnestad 2020 randomised elite
athletes to 2 vs 4 interval sessions/week, **matched for total weekly volume
*and* for total zone-3 time (136 min in both arms)**. The 2-session group
improved 8 km rollerski TT, economy and %VO2max at threshold; the 4-session
group improved **nothing** significantly
([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7246952/)).

> Same volume. Same intensity distribution. Opposite outcome. Neither a volume
> target nor a distribution target can express that difference. A session count
> can.

Rønnestad 2014 closes the other door: two arms matched on **both** total volume
**and** zone distribution still produced significantly different VO2max
outcomes, because concentration and sequencing differed. A distribution target
under-determines the plan.

### Xert has already shipped the two-axis model

The only surveyed platform separating the axes explicitly:

- **Improvement Rate** — the volume knob, as a *named rate*: Off-Season −2,
  Taper −1, Maintenance 0, Slow 1, Moderate 2/3, Aggressive 4/5, Extreme 6/7
  weekly XSS ramp.
- **Polarization Level** — a slider for **hard days : easy days, 1:1 → 5:1**.
  "Higher polarization (4:1 or 5:1) results in harder workouts on a less frequent
  basis."

That second control is the quality-session-count primitive, shipped.

### Intensity blocks: how much lower is their volume?

Concrete published numbers (Rønnestad 2025, well-trained cyclists): low-intensity
volume during the block vs the preceding weeks fell **7:58 → 4:43 (−41%)** for a
MIT block and **7:16 → 4:04 (−44%)** for a HIT block. At season scale, Tønnessen
2014 found **−32 ± 15%** volume from general preparation to peaking while HIT
time held constant in absolute terms and HIT *session frequency* rose 40%.

**So a volume drop at an intensity block boundary is normal, intentional, and
sizeable.** The distribution shifts because low-intensity volume is *withdrawn*,
not because hard work is added.

---

## 5. Strength is a different quantity, not a lossy version of the same one

### The volume currency is sets per muscle group per week. Hours is never used.

- **WHO 2020 guidelines** dose aerobic activity in **minutes** and
  muscle-strengthening in **days**, stating there is "**insufficient evidence to
  specify a specific duration**" for the latter
  ([NCBI](https://www.ncbi.nlm.nih.gov/books/NBK566046/)).
- **ACSM 2026 Position Stand** (overview of 137 systematic reviews) prescribes
  entirely in %1RM, sets, reps and sessions/week — no duration parameter — and
  finds **time under tension** does not consistently affect outcomes
  ([PubMed](https://pubmed.ncbi.nlm.nih.gov/41843416/)).
- Every strength app surveyed counts sets per muscle group (Hevy, Boostcamp, RP).
- For **maximal strength** the currency differs again: number of lifts at an
  intensity zone (Prilepin), not hypertrophy sets.

### One shared currency across endurance and strength is structurally impossible

1. **Different physical dimension.** TSS is an integral over time of intensity;
   sets/week is a dimensionless count with no time factor. There is no
   conversion, only an assumption.
2. **Different unit of attribution.** TSS is a whole-organism scalar; strength
   volume is per muscle group, with fractional counting for indirect sets. A
   scalar cannot express "quads at MRV, chest at MEV".
3. **Different fatigue construct** — which is why Issurin separates them into
   distinct blocks in the first place.

TrainingPeaks' only path for strength is hours × assumed intensity, and its own
expert users describe the result as invalid.

### Strength authors two landmarks and a duration, not a rate

Renaissance Periodization's mesocycle: start at **MEV**, interpolate to **MRV**
over the block — "10 sets in week 1, 13 in week 2, 16 in week 3, and 20 in week
4". MEV/MAV/MRV are **athlete attributes**, per muscle, that ratchet upward
between mesocycles.

### The strength block boundary is a deliberate discontinuity

- RP: mesocycle 1 closes at ~21 sets, mesocycle 2 **opens at ~16** — a ~24% drop,
  with a rising baseline across cycles (12→21, then 16→25, then 21→30).
- JTS block periodization: **75 → 50 barbell reps** at the boundary (−33%) with
  intensity up 10 percentage points — "the volume is reduced and the weights are
  increased".
- Deload magnitude is explicitly **relative to the previous block**: Bell et al.
  specify 25–45% / 40–60% / 60–90% reductions where "'normal' training volume
  refers to the volume undertaken in the **previous training block**".

**Therefore a planner must not warn on, auto-correct, or flag a volume drop at a
block boundary.** It is the intended behaviour.

---

## 6. What this evidence decided

Mapped onto [#374](https://github.com/leskraas/trainm8/issues/374)'s questions
and recorded in [ADR 0040](../../adr/0040-volume-continuity-and-authored-overload.md):

| Question | Answer | Load-bearing evidence |
| --- | --- | --- |
| Ramp over loading weeks or all weeks? | **Loading weeks**; recovery and taper are multiplicative roles | Convergence 1 — no platform resumes from the deload week |
| Absolute or relative opening volume? | **Relative** — derived, never stored | intervals.icu's mesocycle rate is the only shipped precedent |
| Reference point? | **The previous loading week** — no choice to make | Falls out of treating recovery as a role |
| Boundary step? | **Optional, authored, default 0** | RP 21→16; JTS 75→50; Rønnestad −41% |
| Authored ramp rate? | **Yes, per block** — the primary authored number | intervals.icu; Xert's Improvement Rate |
| Guard: warning or constraint? | **Warning only** | Convergence 3 — nobody blocks |
| Guard threshold source? | Convention, not evidence — say so | Buist 2008 null RCT |
| Volume alone sufficient? | **No** — add quality-session count per block | Tønnessen 2020 |
| Intensity distribution target? | **No** — do not build one | Seiler; 80/20's own authors |
| Arithmetic unit? | **Unit-free percentages**; hours only where units must meet | A percentage is invariant under conversion |
| Strength in hours? | **No** — hours is calendar cost, not dose | WHO; ACSM 2026 |

---

## 7. Open questions this research did not settle

- **What intervals.icu's mesocycle-to-mesocycle rate is relative to** — previous
  block's peak, last loading week, or mean. The parameter is documented; its
  reference is not. We are deciding something nobody has published.
- **TrainingPeaks' ATP rest-week depth** — the period lookup table's contents are
  not published.
- **Whether Xert's daily target Focus can be overridden** in the web UI, which is
  the crux of whether Xert counts as fully athlete-authored.
- **RP's per-muscle MV/MEV/MAV/MRV numeric tables** — reachable only via a
  secondary aggregator; re-verify before using as seed data.
- **Runna's per-week ceiling percentage** — the mechanism is published, the
  number is not.
- **Whether hours↔km should use a stored athlete pace** rather than a constant.
  Owned by [#372](https://github.com/leskraas/trainm8/issues/372).
