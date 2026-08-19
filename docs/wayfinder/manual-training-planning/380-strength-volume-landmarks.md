# Strength volume landmarks — MV / MEV / MAV / MRV (#380)

Research resolving [#380](https://github.com/leskraas/trainm8/issues/380) —
"verify the RP per-muscle volume landmark tables". Companion to
[`intensity-load-and-volume-reference.md`](./intensity-load-and-volume-reference.md)
§8, whose per-muscle figures this note **corrects**, and to
[`374-volume-continuity-and-progressive-overload.md`](./374-volume-continuity-and-progressive-overload.md)
§5, whose ratchet claim this note **qualifies**.

## What this settles

Four things, two of them reversals of what the reference file records.

1. **The RP figures are now readable from RP's own primary sources.** The
   429/403 walls recorded in §8 have a workaround: `help.rpstrength.com` serves
   its full article bodies through the vendor's own **public Zendesk API**,
   exactly the pattern already used for TrainingPeaks and Final Surge. All
   **14** per-muscle articles were retrieved. No figure in this note is
   second-hand.
2. **The numbers currently in §8 are wrong.** Chest MV 8 / MEV 10 / MAV 12–20 /
   MRV 22 and calves MV 6 / MEV 8 / MAV 12–16 / MRV 20 do not match RP's
   published text for those muscles. Delete them; §2 below replaces them.
3. **MRV is not a scalar.** In RP's own text MRV is a **function of weekly
   frequency**, and MAV is **per session**, not per week. A model that stores
   one number per muscle per landmark cannot represent what RP actually
   publishes.
4. **No source outside the RP ecosystem publishes this taxonomy, and two
   peer-reviewed trials contradict the mechanism ADR 0041 relies on.** The
   expected finding — that no primary source publishes per-muscle MV/MEV/MAV/MRV
   tables — is **confirmed for the peer-reviewed literature and for every
   position stand**, but is **wrong about RP itself**: RP publishes them in
   detail, twice, with two mutually inconsistent sets of numbers.

---

## 1. The fetch situation changed — RP is readable now

The reference file records `rpstrength.com` → 429 and `help.rpstrength.com`
→ 403. Re-tested 2026-07-28:

- `rpstrength.com/blogs/articles/...` now returns **200** to the WebFetch path
  and to `curl` with a browser User-Agent. Slugs are irregular — `calves`,
  `triceps`, `back`, `chest` resolve; `quad`, `biceps`, `calf` **301**;
  `hamstrings`, `glutes` **404**.
- `help.rpstrength.com` HTML still returns **403** (Zendesk bot wall), but
  `https://help.rpstrength.com/api/v2/help_center/en-us/articles/<id>.json`
  returns **200** with the complete article body, and
  `.../articles.json?per_page=100` **enumerates the whole 102-article
  catalogue**.

So the help centre is fully readable. Article IDs for the 14 muscle guides:
Chest 32433153518359 · Back 32433434201879 · Biceps 32433083158295 · Triceps
32433338498967 · Quads 32433057672599 · Hamstrings 32432689278999 · Glutes
32433132961431 · Calves 32433232143895 · Side Delts 32432645007255 · Rear Delts
32432607796631 · Front Delts 32433236733591 · Traps 32433317493911 · Forearms
32433321287447 · Abs 32433381453463. All were last updated **14–15 August
2025**.

---

## 2. What RP actually publishes, per muscle

Retrieved verbatim from `help.rpstrength.com` via the Zendesk API. **Weekly sets
of direct work**, for "intermediate-advanced" lifters. MRV is given as a series
across weekly session counts, because RP states it depends on frequency.

| Muscle      | MV    | MEV                                      | MRV @2×/wk                  | @3× | @4× | @5–6×     |
| ----------- | ----- | ---------------------------------------- | --------------------------- | --- | --- | --------- |
| Chest       | ~4    | ≥6                                       | ~20                         | ~25 | ~30 | ~35       |
| Back        | ~6    | ≥10                                      | ~20                         | ~25 | ~30 | ~35       |
| Biceps      | ~4    | ≥8                                       | ~20                         | ~25 | ~30 | ~35       |
| Triceps     | ~4 \* | ≥6 \*                                    | ~16                         | ~20 | ~25 | ~30       |
| Quads       | ~6    | ≥8                                       | ~18                         | ~22 | ~26 | ~30       |
| Hamstrings  | ~3    | ≥4                                       | ~12                         | ~16 | ~18 | no higher |
| Glutes      | **0** | **0** direct                             | ~12                         | ~18 | ~25 | ~30       |
| Calves      | ~6    | ≥8                                       | ~16                         | ~20 | ~25 | ~30–35    |
| Side delts  | ~6    | ≥8                                       | ~25                         | ~30 | ~35 | ~40       |
| Rear delts  | **0** | ≥6                                       | ~18                         | ~25 | ~30 | ~35       |
| Front delts | **0** | **0** direct                             | ~12                         | ~16 | ~16 | —         |
| Traps       | **0** | **0** direct (≥4 once training directly) | not numerically stated      |     |     |           |
| Forearms    | **0** | ~2 untrained / ~8 experienced            | ~15                         | ~20 | ~25 | no higher |
| Abs         | **0** | **0**                                    | ~25 regardless of frequency |     |     |           |

\* Triceps values are stated as "ON TOP OF" normal chest pressing.

**Three structural facts in that table that a per-muscle numeric model has to
handle:**

- **Five muscles have MEV = 0 and six have MV = 0.** Glutes: "The minimum
  effective volume for most individuals is actually ZERO sets per week." Abs:
  "Zero sets per week. Yep." Front delts, traps, rear delts and forearms are all
  maintained by compound work with no direct sets. A landmark model that assumes
  MV < MEV < MAV < MRV as a strict ordering of positive integers is not
  representable against RP's own data.
- **MRV rises with frequency by 50–75%** across the 2×→5–6× range for most
  muscles, and is explicitly flat for hamstrings, forearms and abs. So MRV is
  `f(muscle, weekly_frequency)`, not a per-muscle constant.
- **MAV is not a weekly number at all.** The MAV paragraph is _identical
  boilerplate on all 14 pages_ and is stated **per session**:

  > "the maximum adaptive volume of a single session of any trained muscle group
  > is **still speculative**, but research suggests it's probably **no lower
  > than 4 working sets per session and no higher than 12 working sets per
  > session** in most intermediates."

  RP's own conceptual article separately calls MAV "the progression zone between
  MEV and MRV" — i.e. a **zone, not a point**, which the reference file already
  records correctly. There is no per-muscle weekly MAV figure anywhere in RP's
  primary text.

### RP's second, inconsistent set of numbers

The public blog pages carry a **numeric summary table** with six columns — MV,
MEV, MAV, MRV, and two "Primary Priority" variants MAV\*P / MRV\*P. Read from
raw HTML (not a summarizer):

| Muscle  | MV  | MEV | MAV  | MRV   | MAV\*P | MRV\*P | Source                                                                               |
| ------- | --- | --- | ---- | ----- | ------ | ------ | ------------------------------------------------------------------------------------ |
| Chest   | 2–4 | 4–6 | 6–16 | 16–24 | 16–24  | 24–32+ | [live page](https://rpstrength.com/blogs/articles/chest-hypertrophy-training-tips)   |
| Calves  | 2–4 | 4–6 | 6–16 | 16–24 | 16–24  | 24–32+ | [live page](https://rpstrength.com/blogs/articles/calves-hypertrophy-training-tips)  |
| Triceps | 0–4 | 4–6 | 6–16 | 16–20 | 16–20  | 20–26+ | [live page](https://rpstrength.com/blogs/articles/triceps-hypertrophy-training-tips) |
| Quads   | 2–4 | 4–6 | 6–14 | 14–18 | 10–18  | 18–24+ | Wayback 2025 snapshot                                                                |

The tables are **not** present on the current `back`, `biceps`, `glutes` or
`hamstrings` pages — RP appears to have removed them from some articles.

**These do not reconcile with §2's help-centre figures.** Calves: blog MV 2–4 /
MEV 4–6 versus help-centre MV ~6 / MEV ≥8. Quads: blog MRV 14–18 versus
help-centre 18–30. Both surfaces are first-party, both current, and they
disagree by up to a factor of two. Scope note on both: "These are the landmarks
for serious, **intermediate** lifters. Folks who have been training (mostly)
whole body for **3–7 years**."

**Where the §8 numbers probably came from.** The aggregator's calves values (MV
6 / MEV 8 / MRV 20) match the _help-centre calves prose_ at 3×/week; its chest
values (MV 8 / MEV 10) match _back_, not chest. So §8 most likely blends a
muscle mix-up with an older table vintage. Either way: **not citable.**

### Training age and sex

- **Training age** is handled qualitatively only: "If you're a beginner, all
  your volume landmarks are likely **substantially lower**"; advanced landmarks
  "similar to the intermediate ones listed". No beginner or advanced numeric
  table exists on any RP surface reached. MEV growth with training age
  (untrained → advanced) is asserted only by secondary aggregators —
  **unverified**.
- **Sex** is not differentiated anywhere in RP's landmark material. Nor is there
  a primary basis to add it: a narrative review reports "relative strength gains
  and hypertrophic responses are **largely comparable** between sexes"
  ([Sport Sciences for Health, 2026](https://link.springer.com/article/10.1007/s11332-026-01650-8)),
  and the largest dose-response meta-regression was **79.1% male / 20.9%
  female** and did not model sex as a moderator (Pelland et al., §4). **A sex
  term in a landmark model would be invented, not cited.**

---

## 3. No source outside the RP ecosystem publishes the taxonomy

This is the cleanest negative result in the note.

**Position stands — zero occurrences.** The full text of the **ACSM 2009
Position Stand, "Progression Models in Resistance Training for Healthy Adults"**
(_Med Sci Sports Exerc_ 41(3):687–708,
[PDF](https://tourniquets.org/wp-content/uploads/PDFs/ACSM-Progression-models-in-resistance-training-for-healthy-adults-2009.pdf))
was extracted and searched: **"maintenance volume" 0, "minimum effective" 0,
"maximum adaptive" 0, "maximum recoverable" 0.** Its volume unit is _sets per
exercise per session_, not weekly sets per muscle, and it is explicitly
agnostic:

> "Although **little is known concerning the optimal number of sets performed
> per muscle group per session**, a meta-analysis of 37 studies has shown that
> **approximately eight sets per muscle group produced the largest effect size
> in athletes**."

Its prescriptions are per-exercise: novice hypertrophy "moderate loading …
70–85% of 1 RM … 8–12 repetitions per set for **1–3 sets per exercise**";
advanced "multiple sets per exercise (10–25 repetitions or more) in a periodized
manner". The **ACSM 2026 Position Stand** (Currier, D'Souza, Fiatarone Singh,
Lowisz, Rawson, Schoenfeld, Smith-Ryan, Steen, Thomas, Triplett, Washington,
Werner, Phillips; _MSSE_ 58(4):851–872, doi
[10.1249/MSS.0000000000003897](https://pubmed.ncbi.nlm.nih.gov/41843416/)), an
overview of 137 systematic reviews and >30,000 participants, likewise carries no
landmark vocabulary and no per-muscle table — only the aggregate figures §8
already records (strength ≥80% 1RM, 2–3 sets, ≥2 sessions/wk; hypertrophy ≥10
sets/wk; power 30–70% 1RM, ≤24 repetitions·sets).

**PubMed — zero resistance-training hits.** An E-utilities phrase search for
`"maximum recoverable volume"` returns **18 records, none of them about
resistance training** (adsorbent hydrogels, ferroelectric films, shape-memory
alloys, ventricular assist devices). The term **does not exist in the
PubMed-indexed exercise-science literature.**

**Peer-reviewed papers on exactly this topic decline to use it.** Sousa et al.,
"The Importance of Recovery in Resistance Training Microcycle Construction"
([PMC11057610](https://pmc.ncbi.nlm.nih.gov/articles/PMC11057610/)) — a paper
whose entire subject is recoverable volume within a microcycle — uses **none**
of MV/MEV/MAV/MRV, and concludes in plain ranges instead:

> "A wide range of **10–20 sets per muscle group per week** is associated with
> superior hypertrophy … a smaller but wide range of **5+ sets per movement per
> week** is associated with superior strength gains."

Note the **unit change**: hypertrophy is per _muscle group_, strength is per
_movement_. Same in Baz-Valle et al. 2022 (§4) and Ralston et al. 2017 (§6).

**Everything else traces back to Israetel.** Every non-RP source located
(Mesostrength, Arvo, Fitness Volt, APEC, GymPsycho, MaxFit, The Strength
Equation, assorted MEV/MAV/MRV calculators) is a downstream popularization that
credits Dr. Mike Israetel and Renaissance Periodization by name. **No
independent origin, no independent numbers, no second vendor with its own
table.**

**Conclusion for #381 and #384: the taxonomy is one vendor's, and the numbers
are one vendor's.** Adopting it is a vocabulary decision, not an evidence
decision.

---

## 4. What _is_ citable: generic per-muscle weekly ranges

These are primary, peer-reviewed, and quotable — but they are **ranges for a
generic muscle group**, not per-muscle values.

| Finding                                                                 | Figure                               | Source                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optimum weekly sets per muscle group for hypertrophy, young trained men | **12–20 weekly sets**                | Baz-Valle et al. 2022, _J Strength Cond Res_ — [PubMed](https://pubmed.ncbi.nlm.nih.gov/35291645/) · [PDF](https://bazmanscience.com/wp-content/uploads/2024/02/Baz-Valleetal.-2022-ASystematicReviewoftheEffectsofDifferentResistanceTrainingVolumesonMuscleHypertrophy.pdf) |
| Practical synthesis for hypertrophy                                     | **10–20 sets/muscle/wk**             | Sousa et al., [PMC11057610](https://pmc.ncbi.nlm.nih.gov/articles/PMC11057610/)                                                                                                                                                                                               |
| Practical synthesis for strength                                        | **5+ sets/movement/wk**              | same, citing Ralston et al. 2017                                                                                                                                                                                                                                              |
| Necessary to maximize muscle mass                                       | **≥10 weekly sets per muscle group** | Umbrella review, [PMC9302196](https://pmc.ncbi.nlm.nih.gov/articles/PMC9302196/)                                                                                                                                                                                              |
| ACSM 2026 hypertrophy                                                   | **≥10 sets/wk**                      | [PubMed 41843416](https://pubmed.ncbi.nlm.nih.gov/41843416/)                                                                                                                                                                                                                  |
| Largest effect size per muscle group per session                        | **~8 sets**                          | meta-analysis cited in ACSM 2009                                                                                                                                                                                                                                              |

Baz-Valle's caveats matter as much as its number. Its groups were **low <12 /
moderate 12–20 / high >20** weekly sets; the low arm had to be **dropped from
the meta-analysis** "due to the lack of groups performing training volumes of
less than 10 weekly sets per muscle group"; and the conclusion is scoped to two
muscles only —

> "it seems that the optimum training volume range for **quadriceps and biceps
> brachii** hypertrophy lays somewhere between 12–20 weekly sets when training
> each muscle group **twice per week**, without additional benefits of
> increasing training volume."

It contains **no** landmark vocabulary. ⚠️ **False-friend warning:** Baz-Valle
abbreviates its _moderate volume_ arm as **"MV"**. That is not Maintenance
Volume. A future reader skimming for "MV" in that paper will get the wrong
construct.

**The one thing the literature will not give you is a ceiling.** Ralston et al.
2017 identifies **no upper limit** at which strength gain declines. Pelland et
al. find volume's effect on both hypertrophy and strength has a **100% posterior
probability of a positive slope**, with diminishing returns but **no maximum**.
So **MRV has no empirical anchor at all** — not merely "no per-muscle number",
but no evidence that a locatable recoverable maximum exists as a dose-response
feature. MEV/MAV have generic support; MRV is the landmark with the weakest
standing.

---

## 5. Fractional set counting — verified, and the reference file needs amending

**Pelland, Remmert, Robinson, Hinson & Zourdos, "The Resistance Training Dose
Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency
on Muscle Hypertrophy and Strength Gains", _Sports Medicine_ 56(2):481–505,
2026** (epub 4 Dec 2025), doi
[10.1007/s40279-025-02344-w](https://link.springer.com/article/10.1007/s40279-025-02344-w)
· [PubMed](https://pubmed.ncbi.nlm.nih.gov/41343037/). 67 studies, 2058
participants (79.1% male), all models adjusted for intervention duration and
training status.

**Two corrections to §8, which cites only the SportRxiv preprint:**

1. It is **published**, in a Q1 journal. Cite the _Sports Medicine_ version.
2. §8 describes "**fractional set counting** (direct set = 1.0, indirect = 0.5)"
   as if it were a stated convention. It is not — it is the **winner of a
   three-way sensitivity analysis**:

   > "all contributing resistance training sets were classified as **direct or
   > indirect**, depending on their **specificity to the hypertrophy/strength
   > measurement**. Then, weekly set volume/frequency for indirect sets was
   > quantified as **1 for 'total,' 0.5 for 'fractional,' and 0 for 'direct.'**"
   >
   > "The **relative evidence for the 'fractional' quantification method was
   > strongest**; therefore, this quantification method was used for the primary
   > meta-regression models."

   So 0.5 for indirect sets is _empirically preferred over both alternatives_,
   which is a stronger claim than a convention — and the authors' own headline
   conclusion is that the distinction is load-bearing: "**Distinguishing between
   direct and indirect sets appears essential** for predicting adaptations."

**The attribution criterion is not anatomical.** Direct/indirect is defined by
"specificity to the **measurement**", i.e. relative to the outcome being
predicted, not by a fixed table of which muscles a lift trains. **Pelland
publishes no exercise→muscle attribution map.** A planner needs one; it will
have to be authored, and the honest label is "our map", not "Pelland's map".
RP's own material only gestures at this qualitatively (triceps MEV is "ON TOP OF
normal chest pressing"; glute MEV is 0 because squats engage them).

**Volume and frequency behave differently for the two goals** — relevant to #384
if one model is meant to serve both:

|                     | Hypertrophy                                      | Strength                           |
| ------------------- | ------------------------------------------------ | ---------------------------------- |
| Volume slope > 0    | posterior probability **100%**                   | **100%**                           |
| Diminishing returns | present                                          | **"considerably more pronounced"** |
| Frequency slope > 0 | **<100%** — "compatible with negligible effects" | **100%**, with diminishing returns |

Note the tension with RP: RP raises MRV steeply with frequency; Pelland finds
frequency's independent effect on **hypertrophy** may be negligible.

---

## 6. Maximal strength — Prilepin already _is_ a landmark model

The ticket asks whether Prilepin's chart is the whole story or whether a
landmark equivalent exists. **The answer is neither of the expected options:
Prilepin's chart is itself structurally a landmark model**, and a closer one to
MEV/MAV/MRV than anything in the hypertrophy literature.

Hristov, "How to Design Strength Training Programs using Prilepin's Table",
2005-02-10
([PDF](https://liftvault.com/wp-content/uploads/2024/02/prelipins.pdf), text
extracted directly from the PDF):

| Intensity %1RM | Rep range per set | Reps total (**range**) | **Optimal** reps |
| -------------- | ----------------- | ---------------------- | ---------------- |
| <70%           | 3–6               | 18–30                  | 24               |
| 70–79%         | 3–6               | 12–24                  | 18               |
| 80–89%         | 2–4               | 10–20                  | 15               |
| >89%           | 1–2               | 4–10                   | 7                |

Each row carries **a floor, a ceiling and an optimum** — and Hristov's gloss
maps them onto the landmark constructs almost exactly:

> "The optimal total is 18 reps. If you do **less than 12** total reps, the
> training stimulus would be **too weak to elicit positive strength
> adaptation**. If you perform **more than 24** reps, you are going to **slow
> down, and fatigue too much**."

That is MEV (12), MAV-as-a-point (18) and MRV (24), for one intensity band, in
one session. **The unit is reps per session within a %1RM band, not weekly sets
per muscle** — so it is not convertible to the hypertrophy currency, which is
the same conclusion #374 §5 already reached about strength being a different
quantity.

**Provenance, honestly.** Prilepin collected training logs of "more than 1000
World, Olympic, National and European weightlifting champions" during the 1960s
and 70s. Hristov's document is **self-published, not peer-reviewed**, and the
Russian original was not reached — `sportivnypress.com` (Charniga's translation
archive, the nearest thing to an English primary) **timed out at DNS**. And the
chart's own validity is untested: search results consistently report that "in
peer reviewed literature its effectiveness **has not been investigated**" ⚠️
_search-snippet only; the ResearchGate paper that appears to contain it
returned 403._

⚠️ **The reference file's Prilepin numbers are a different variant.** §8 records
bands 70–80 / 80–90 / 86–90 / ≥91 sourced from `torokhtiy.com`, a vendor blog.
Hristov gives four bands (<70 / 70–79 / 80–89 / >89) with optima 24/18/15/7.
Multiple mutually inconsistent published variants of "Prilepin's chart" exist.
**Do not treat any single rendering as canonical.**

---

## 7. Ratcheting between mesocycles — sourced, then contradicted

ADR 0041 records landmarks as athlete attributes that ratchet upward. Both
halves of that now have evidence, pointing opposite ways.

**The RP source is confirmed.** The "12→21, 16→25, 21→30" figure quoted in §8
and in #374 §5 is real and first-party — it is from
[_The New Blueprint for Massive Arms_](https://rpstrength.com/blogs/video-guides/the-new-blueprint-for-massive-arms):
"Mesocycle 1: Start with ~12 weekly sets per arm muscle and build up to ~21
sets. Mesocycle 2: Start with ~16 weekly sets and build up to ~25 sets.
Mesocycle 3: Start with ~21 weekly sets and build up to ~30 sets." It is scoped
to a **3-mesocycle arm specialization phase (~3–4 months)**, not a general law.
Keep the citation; narrow the claim.

**But RP's own app does not ratchet numerically.** The shipped mechanism is
per-session subjective feedback, not a stored per-muscle landmark that
increments:

> "the app takes feedback on how **pumped, sore, and beat up from volume** you
> feel and uses that to determine your future volume … it does these
> calculations **continuously**, such that every future session is influenced by
> your past feedback" — [help centre 32600173777815]

The only landmark-shaped _control_ RP exposes is a three-level per-muscle
**emphasis** selector, which chooses a **band**, not a number
([Muscle Emphasis Breakdown, 34825395726743](https://help.rpstrength.com/hc/en-us/articles/34825395726743-Muscle-Emphasis-Breakdown)):
**Emphasize** = "moving you from MEV … up to MRV"; **Grow** = "keeping you
closer to MEV"; **Maintain** = "keep you at MV". Mesocycle length is 4–8 weeks
typical, 8–12 for beginners, with the deload always the final week.

**And two peer-reviewed trials tested the ratchet premise directly and found
nothing.** Both randomised trained lifters to _increase volume relative to their
own previous habitual volume_ versus _maintain it_:

- **Barsuhn et al., _J Appl Physiol_ 138(1):259–269, 2025** — 55 trained men, 8
  weeks, previous weekly sets **+30%** or **+60%** vs maintenance. **No
  between-group difference in muscle size.** 1RM was _greater in the maintenance
  group_ (174.7 kg vs 159.0 and 149.0 kg).
  [PubMed](https://pubmed.ncbi.nlm.nih.gov/39665246/)
- **Enes et al., _Eur J Appl Physiol_, 2024** — title states the result:
  "**Increasing set volume relative to baseline does not augment skeletal muscle
  adaptations when compared to maintenance of baseline training volume** in
  recreationally trained individuals."
  [doi 10.1007/s00421-024-05655-4](https://link.springer.com/article/10.1007/s00421-024-05655-4)

**This is the most consequential finding in the note.** The one claim ADR 0041
most depends on — that opening volume should climb block over block — is the one
claim with _direct experimental evidence against it_, in exactly the design that
tests it. It is not that the evidence is missing; it is that it is
null-to-adverse. ⚠️ Both retrieved via abstract/search rather than full text
(`journals.physiology.org` → 403); the effect directions are from the abstracts
and the Enes title, and should be read in full before anything is built on them.

---

## 8. What could not be established

- **Any per-muscle MV/MEV/MAV/MRV table from a non-RP source.** Searched
  position stands, PubMed phrase search, and the recovery/microcycle literature.
  Does not exist.
- **Numeric landmark values for beginners or for advanced lifters.** RP states
  only that beginners' are "substantially lower". No table on any surface.
- **Any sex differentiation of landmarks**, from RP or from the literature.
- **A per-muscle weekly MAV figure.** RP's MAV is per-session boilerplate and
  self-described as "still speculative".
- **A trap MRV number.** The Traps article is prose-only on MRV.
- **Reconciliation of RP's two numeric sets.** The blog tables and the
  help-centre prose disagree by up to 2×. No RP statement explains which
  supersedes which, or when either was authored.
- **Which muscles a compound lift is attributed to, at what fraction.** Pelland
  defines direct/indirect relative to the _measured outcome_ and publishes no
  exercise→muscle map. Nobody surveyed publishes one.
- **An empirical MRV of any kind.** No meta-analysis locates an upper bound.
- **Prilepin's Russian original**, and any peer-reviewed test of the chart.
- **Full text of Barsuhn and Enes** (403/paywall), Schoenfeld & Grgic 2018 (402
  Payment Required), and the ResearchGate Prilepin study (403).

---

## 9. Sources that resist automated fetching

To be merged into the reference file's §9 table. **Two rows there are now wrong
and should be replaced.**

| Host                                 | Behaviour                                                                   | Workaround that worked                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `help.rpstrength.com`                | HTTP **403** on HTML (unchanged)                                            | ✅ **Public Zendesk API**: `/api/v2/help_center/en-us/articles/<id>.json`, and `/articles.json?per_page=100` enumerates all 102 articles. Supersedes "Not readable".                  |
| `rpstrength.com`                     | **No longer 429** — returns 200 to WebFetch and to `curl` with a browser UA | ✅ Direct fetch. Slug traps: `calves`/`triceps`/`back`/`chest` OK; `quad`/`biceps`/`calf` → 301; `hamstrings`/`glutes` → 404. Supersedes "Search snippets only".                      |
| `journals.lww.com`                   | HTTP **402 Payment Required**                                               | None found. Schoenfeld & Grgic 2018 _S&C Journal_ unread; use Baz-Valle 2022 or PMC11057610 for the same 10–20 range.                                                                 |
| `journals.physiology.org`            | HTTP **403**                                                                | PubMed abstract only.                                                                                                                                                                 |
| `researchgate.net`                   | HTTP **403** on all article pages                                           | Author-hosted PDF mirrors, or the journal's own PDF.                                                                                                                                  |
| `acsm.org` (science-spotlight pages) | HTTP **503**                                                                | PubMed record for the position stand itself.                                                                                                                                          |
| `www.sportivnypress.com`             | **DNS/connect timeout** (`getaddrinfo ETIMEOUT`)                            | None found. Charniga's Prilepin translations unreachable.                                                                                                                             |
| `archive.org/wayback/available`      | HTTP **429**                                                                | Use the **CDX API** (`/cdx/search/cdx?...&output=json&limit=-2&filter=statuscode:200`), then `web.archive.org/web/<ts>id_/<url>` for unmodified raw HTML. Rate-limit to ~1 req / 5 s. |

### ⚠️ Two tooling traps worth recording

1. **WebFetch refuses PDFs.** For four separate PDFs (ACSM 2009, Baz-Valle 2022,
   Pelland 2026, Hristov 2005) it reported the file "corrupted or improperly
   formatted" and declined. The PDFs were fine. **The binary is saved to disk**
   at the path WebFetch prints; a ~10-line `zlib.decompress` +
   `re.finditer(rb'\(...\)')` extractor recovers the text from all four. Do not
   accept "unreadable PDF". (`pypdf` installs but crashes in this environment —
   `cryptography`'s `_cffi_backend` is missing.)
2. **WebFetch's summarizer will invent a table.** Asked for the calves landmark
   row, it returned a well-formed table identical to chest's. Raw HTML later
   showed calves _does_ coincidentally match chest — but **quads does not**, so
   the answer was unfalsifiable at the time it was given. **Every number in §2
   of this note was read from raw HTML or a raw JSON body, never from a
   summary.** Treat any numeric table returned by a fetch summarizer as
   unverified.

---

## 10. What the decision tickets can and cannot rely on

**Can rely on:**

- RP's per-muscle landmarks exist, are first-party, are dated (Aug 2025), and
  are now **cheaply re-fetchable** via the Zendesk API. §2 is quotable as "what
  RP publishes".
- Generic peer-reviewed weekly ranges: **10–20 sets/muscle/wk** for hypertrophy
  (12–20 in Baz-Valle; ≥10 in ACSM 2026 and the umbrella review), **5+
  sets/movement/wk** for strength.
- **Fractional set counting**, with a real citation and a real empirical
  preference for 0.5 on indirect sets (Pelland et al. 2026, _Sports Medicine_).
- Prilepin's chart as a **floor/optimum/ceiling per intensity band** for maximal
  strength, in reps per session.
- MAV as a **zone**, and MRV as **frequency-dependent** — both from RP's own
  text.

**Cannot rely on:**

- The §8 chest and calves figures. **Wrong; delete.**
- Any landmark number as _measured_. RP's own framing: "averages based on our
  personal training experience", "food for thought or places to start, **not
  dogmatic scriptures**", "**starting points, not gospel**".
- A single number per muscle per landmark. MRV varies with frequency; MAV is
  per-session; five muscles have MEV = 0.
- MV < MEV < MAV < MRV as a strict positive ordering.
- Landmarks varying by training age or sex in any citable way.
- MRV as an evidence-based construct at all. No meta-analysis finds a ceiling.
- Upward ratcheting of opening volume between blocks. Two trials say it does not
  help; one says maintenance beat it on 1RM.

---

## What this means for #387 and #384

**#387 — can seed landmark values be offered to a first-time lifter?**

**Yes, but only as one vendor's starting estimates, and the caveat has to ship
with the numbers.** Three specific constraints:

1. **Use §2 (help centre), not §8, and not the blog tables.** §8's values are
   wrong. Where RP's two surfaces disagree, §2 is the one with per-muscle
   reasoning attached.
2. **A first-time lifter is outside the published scope.** Every RP figure is
   for "intermediate-advanced" lifters with **3–7 years** of whole-body
   training, and RP states beginners' landmarks are "substantially lower"
   without saying how much. Seeding an untrained user with intermediate MEVs
   prescribes more volume than the source supports. The defensible first-time
   seed is the **peer-reviewed generic floor — ~10 weekly sets per muscle
   group** (ACSM 2026 / umbrella review / Baz-Valle's lower bound), which is
   _goal-appropriate, primary, and not per-muscle_, rather than a 14-row table
   the source disclaims for that user.
3. **Provenance caveat, verbatim-grade:** these are one commercial vendor's
   experience-based estimates for intermediate lifters, not measured values, not
   peer-reviewed, and inconsistent between that vendor's own two publications.
   RP's own words — "starting points, not gospel" — are the right register. If
   the product cannot carry that caveat next to the number, it should not carry
   the number.

**#384 — can a per-muscle model be built on citable numbers?**

**No. A per-muscle landmark model can be built only on one vendor's taxonomy.**
That is a legitimate choice, but it must be made with eyes open:

- **The vocabulary is RP's.** MV/MEV/MAV/MRV appears in **zero** position stands
  and **zero** PubMed-indexed resistance-training papers. Adopting it means
  adopting a vendor's ontology as domain language — a `CONTEXT.md` / ADR
  decision, not an evidence one.
- **The citable numbers are not per-muscle.** The literature gives generic
  per-muscle-group ranges (10–20 sets/wk) and, in the one case where it _is_
  muscle-specific, covers **two muscles** (quadriceps, biceps brachii) at **one
  frequency** (2×/wk). There is no citable 14-row table.
- **The shape RP publishes is not the shape ADR 0041 assumes.** ADR 0041 has
  four scalar attributes per muscle. RP publishes MRV as `f(muscle, frequency)`,
  MAV as a per-session bound, and MEV = 0 for five muscles. Storing four scalars
  **loses information and creates values RP never asserted.** If per-muscle
  landmarks are kept, MRV needs the frequency dimension or an explicit fixed
  assumed frequency recorded as ours.
- **MRV is the weakest link and it is the one doing the most work.** It is the
  ceiling the mesocycle ramps toward, and it is the landmark with no empirical
  anchor: no meta-analysis locates a recoverable maximum, and the term is absent
  from the indexed literature.
- **The ratchet should probably not be built.** Barsuhn 2025 and Enes 2024 both
  tested "raise volume above your own previous baseline vs. hold it" and found
  no advantage, with maintenance ahead on 1RM in one. Read both in full first —
  but if they hold, a rising-baseline ratchet is a feature contradicted by the
  only two trials aimed at it, and ADR 0041 should record that.
- **Exercise→muscle attribution is unavoidably ours.** Fractional counting is
  citable; the attribution map is not. Pelland publishes none, and defines
  direct/indirect relative to the measured outcome rather than anatomy. Whatever
  map ships must be labelled as authored by us.

**The load-bearing recommendation for #381's granularity decision:** the
evidence does _not_ support per-muscle landmarks as a science-backed feature. It
supports either (a) a **systemic weekly-sets figure** with a citable 10–20
range, or (b) per-muscle landmarks **explicitly branded as RP-derived starting
estimates** with the caveat visible. What it does not support is per-muscle
numbers presented as established physiology.
