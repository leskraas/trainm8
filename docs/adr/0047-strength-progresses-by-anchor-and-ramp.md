# Strength progresses by anchor and ramp, not between Volume Landmarks

ADR 0041 split volume onto parallel **Training Tracks** and gave the two tracks
**different progression rules**: endurance a rate (**Volume Ramp**), strength
"two landmarks and a duration, interpolated" between **Volume Landmarks** (MV <
MEV < MAV < MRV). ADR 0042 §10 then left the strength track's emphasis
vocabulary open, and ADR 0041 §4 left its granularity open, on the grounds that
the two are entangled: ACSM's hypertrophy / strength / power are positions on a
volume–intensity trade-off, so whether a segment authors a `%1RM` band _beside_
the landmarks or authors a goal _from which_ they derive is a real modelling
decision.

**#384** is those two deferrals merged, with **#381** (granularity) and
**#387**'s shape half folded in. It asks one question: **what does a strength
Training Track segment author?**

The answer turns out to be none of the three options the ticket framed, because
**#380 removed the premise all three shared**. Every option — a band beside the
landmarks, a goal deriving them, Prilepin's chart replacing them — assumed the
landmark pair was the strength track's volume expression, and the research found
that pair is not something the repo can stand on. So the decision taken here is
the fourth option: **strength progresses by the same machinery as endurance** —
a **Season Anchor** plus a **Volume Ramp** — and **Volume Landmarks are
retired**.

That makes this ADR the sharpest application yet of map #362's standing rule
that newer documentation supersedes older, and the first time a **research
asset** rather than an ADR is the superseding document. It retires a term three
ADRs and a shipped schema were built on.

## Evidence

All from
[#380's findings](../wayfinder/manual-training-planning/380-strength-volume-landmarks.md),
which corrected the reference file rather than confirming it. The reference
file's §8 per-muscle numbers are **wrong, not merely unverified**, and must not
be read.

### The landmark taxonomy is one vendor's, and its load-bearing member has no anchor

- **MV / MEV / MAV / MRV appears in zero position stands.** The full text of the
  ACSM 2009 Position Stand was extracted and searched: "maintenance volume" 0,
  "minimum effective" 0, "maximum adaptive" 0, "maximum recoverable" 0. The
  **ACSM 2026 Position Stand** — an overview of 137 systematic reviews
  and >30,000 participants — carries no landmark vocabulary either.
- **It appears in zero PubMed-indexed resistance-training papers.** A phrase
  search for "maximum recoverable volume" returns 18 records, **none about
  resistance training**. Sousa et al.
  ([PMC11057610](https://pmc.ncbi.nlm.nih.gov/articles/PMC11057610/)), a paper
  whose whole subject is recoverable volume within a microcycle, uses none of
  the four terms.
- **Every non-RP source traces back to Israetel.** No independent origin, no
  independent numbers, no second vendor with its own table.
- **MRV has no empirical anchor at all.** Ralston et al. 2017 identifies no
  upper limit at which strength gain declines; Pelland et al. find volume's
  effect on both hypertrophy and strength has a **100% posterior probability of
  a positive slope** with diminishing returns but **no maximum**. This is not
  "no per-muscle number" — it is no evidence that a locatable recoverable
  maximum exists as a dose-response feature.

MRV is the landmark ADR 0041 §4 leaned on hardest: it made a strength segment's
length "a consequence — as long as it takes to hit systemic MRV". **A mechanism
whose stopping condition does not exist cannot be the mechanism.**

### The shape RP publishes is not the shape ADR 0041 assumed

Retrieved first-party from `help.rpstrength.com` via the vendor's public Zendesk
API (all 14 muscle guides, last updated Aug 2025):

- **MRV is `f(muscle, weekly frequency)`**, rising 50–75% across the 2× → 5–6×
  range, and explicitly flat for hamstrings, forearms and abs.
- **MAV is per _session_, not per week** — identical boilerplate on all 14
  pages, self-described as "still speculative".
- **Five muscles have MEV = 0** and six have MV = 0 (glutes: "the minimum
  effective volume for most individuals is actually ZERO sets per week").
- **RP's own two surfaces disagree by up to 2×.** The blog tables and the
  help-centre prose are both first-party, both current, and irreconcilable —
  quads MRV 14–18 versus 18–30 — with no statement of which supersedes which.

So four scalars per muscle **loses information and asserts values the source
never made**.

### What _is_ citable, and what it is not per-muscle

| Finding                                   | Figure                                              | Source                                                                                       |
| ----------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Hypertrophy, weekly sets per muscle group | **12–20** (quadriceps and biceps brachii, at 2×/wk) | Baz-Valle et al. 2022, _JSCR_ — [PubMed 35291645](https://pubmed.ncbi.nlm.nih.gov/35291645/) |
| Hypertrophy, practical synthesis          | **10–20 sets/muscle/wk**                            | [PMC11057610](https://pmc.ncbi.nlm.nih.gov/articles/PMC11057610/)                            |
| Strength, practical synthesis             | **5+ sets/movement/wk**                             | same, citing Ralston et al. 2017                                                             |
| Hypertrophy                               | **≥10 sets/wk**                                     | ACSM 2026, [PubMed 41843416](https://pubmed.ncbi.nlm.nih.gov/41843416/)                      |

Note the **unit change between the two goals** — hypertrophy is per _muscle
group_, strength is per _movement_ — and note that the one muscle-specific
result covers **two muscles at one frequency**. There is no citable 14-row
table.

### The three ACSM goals, with prescriptions attached

ACSM 2026 (Currier et al., _MSSE_ 58(4):851–872, doi
[10.1249/MSS.0000000000003897](https://pubmed.ncbi.nlm.nih.gov/41843416/)):
**strength** ≥80% 1RM, 2–3 sets, ≥2 sessions/wk · **hypertrophy** ≥10 sets/wk ·
**power** 30–70% 1RM, ≤24 repetitions·sets. Issurin's accumulation →
transmutation → realization and JTS's volume phase (70%+) → transition phase
(80%+) both shift the **goal** across a season with the band as its consequence.

### Frequency has evidence; the ratchet has evidence against it

Pelland et al., _Sports Medicine_ 56(2):481–505, 2026, doi
[10.1007/s40279-025-02344-w](https://link.springer.com/article/10.1007/s40279-025-02344-w)
(67 studies, 2058 participants):

|                     | Hypertrophy                                      | Strength                                                 |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Volume slope > 0    | 100% posterior probability                       | 100%, diminishing returns "considerably more pronounced" |
| Frequency slope > 0 | **<100%** — "compatible with negligible effects" | **100%**, with diminishing returns                       |

And the two trials that tested rising-baseline volume directly, both randomising
trained lifters to raise volume _relative to their own previous habitual volume_
versus maintain it:

- **Barsuhn et al., _J Appl Physiol_ 138(1):259–269, 2025** — 55 trained men, 8
  weeks, +30% or +60% vs maintenance. **No between-group difference in muscle
  size**; 1RM **greater in the maintenance group** (174.7 vs 159.0 and 149.0
  kg). [PubMed 39665246](https://pubmed.ncbi.nlm.nih.gov/39665246/)
- **Enes et al., _Eur J Appl Physiol_, 2024** — "Increasing set volume relative
  to baseline does not augment skeletal muscle adaptations when compared to
  maintenance of baseline training volume". doi
  [10.1007/s00421-024-05655-4](https://link.springer.com/article/10.1007/s00421-024-05655-4)

⚠️ Both were retrieved from abstract and title rather than full text
(`journals.physiology.org` → 403), so they corroborate §7 below rather than
carrying it.

### Prilepin's chart is a landmark model, and is not usable as one

Prilepin's chart _is_ structurally floor / optimum / ceiling per intensity band
— closer to MEV/MAV/MRV than anything in the hypertrophy literature. But its
unit is **reps per session within a `%1RM` band**, not weekly sets, so it does
not compose with a `sets` currency; Hristov's document is **self-published and
not peer-reviewed**; the Russian original was unreachable; its effectiveness has
no peer-reviewed test; and **multiple mutually inconsistent published renderings
exist** — including one in this repo's own reference file, whose bands (70–80 /
80–90 / 86–90 / ≥91, from a vendor blog) differ from Hristov's (<70 / 70–79 /
80–89 / >89, optima 24/18/15/7). Authoring a band means picking a rendering.

## Decision

### 1. A strength segment progresses by anchor and ramp

**The landmark pair is dropped as the strength track's volume expression.** A
strength track derives its weekly target the way an endurance track does — from
the track's **Season Anchor** plus the segment's **Volume Ramp** and **Block
Boundary Step**, by ADR 0040 §3's indexed formula.

Two structural findings made this the answer rather than a simplification:

- **A strength track already carried two competing volume expressions.**
  `SeasonAnchorSegment` hangs off `TrainingTrack`, not off the segment, and
  carries no unit (ADR 0043) — so a `sets` track already had an authored anchor
  in sets/wk, _and_ `fromLandmark`/`toLandmark` on the segment. One of the two
  had to go.
- **ADR 0043 §4 had already resolved that duplication in the anchor's favour
  without noticing.** It reads a strength **Season Span** as
  `anchor → peak loading week`, giving `12 → 21 sets/wk` in the same breath as
  `55 → 78 km/wk`: "Same form, different currency, no conversion." That is the
  anchor-and-ramp form. Under this ADR that reading becomes _literally_ true
  rather than coincidentally shaped.

The interpolation ADR 0041 §4 specified is therefore replaced, not
reinterpreted. Segment length becomes plainly **authored** (`weeks`) rather than
a consequence of reaching a ceiling.

**The guard cannot be a level, and does not need to be.** Under §2's scalar
there is no citable absolute band — 10–20 is _per muscle group_, and even ADR
0043 §4's `12 → 21` is lifted from RP's _per-arm-muscle_ figure. But ADR 0043 §2
already pre-fills the anchor from "the least-derived unit that can express the
athlete's history", which for a lifter is their own logged sets/wk. The anchor
is therefore **athlete-relative by construction**, and the guard belongs on the
**ramp rate**, exactly where ADR 0040 §12 put endurance's — warns, never blocks,
stated as convention. That is also the only thing the evidence positively
supports: Barsuhn and Enes both tested _rate of increase relative to the
athlete's own baseline_.

### 2. The Volume Currency is systemic sets per week, a scalar

`sets` means **total working sets per week**, not sets per muscle group and not
sets per movement. ADR 0043's consequence that "a per-muscle 'sets per muscle
group per week' is **one** Volume Currency whose value is a vector, not several
currencies" stands as a statement about representability; the vector is declined
on other grounds.

- **The citable numbers are not per-muscle.** See Evidence. There is no citable
  14-row table, only RP's, which disagrees with itself.
- **A vector cannot be read back.** Comparing a per-muscle target against what
  the athlete did requires an exercise→muscle attribution map with fractional
  weights. Pelland defines direct/indirect relative to the **measured outcome**,
  not anatomy, and publishes no map; nobody surveyed does. It would be ours,
  unsourced, and load-bearing. `Exercise.primaryMuscle` exists but is
  **primary-only, with no secondary muscles and no weights** — which is
  precisely the "total" quantification method Pelland found empirically _worse_
  than fractional counting.
- **The authoring cost lands before the first plan exists** — 14 numbers per
  dated anchor segment, for figures the source calls "starting points, not
  gospel".
- **It is the wrong layer.** Higher levels give guidelines and the concrete
  sessions are the plan's final truth (ADR 0040 §1/§3). Which muscles get worked
  is a session and **Week Pattern** concern; the season guideline is _how much
  lifting_.

**Accepted cost, stated plainly:** the specialization case — "this is an arm
block, quads at maintenance" — has **no home at the guideline layer**. The
lifter expresses it by which exercises they schedule. If per-muscle ever lands,
it lands on the _emphasis_ axis and not the volume axis: RP's own shipped
control for this is a three-level per-muscle selector (Emphasize / Grow /
Maintain) that picks a band, not a number.

### 3. The segment authors a goal; the band and rep range derive from it

A strength **Training Track segment** authors a **Strength Goal** —
`hypertrophy | maximal-strength | power`, ACSM 2026's three under the field's
own term for the middle one — and the `%1RM` band and rep range are **derived**
from it. This closes ADR 0042 §10, and it takes that section's option B.

- **A band is a strictly worse discriminator than the goal.** ACSM's strength
  prescription is ≥80% 1RM, and hypertrophy occurs perfectly well at 80%+ too.
  What separates the two goals is the **volume**, not the band — so an authored
  band _cannot express the distinction_, while an authored goal can. This
  defeats the band option on its own terms, independent of coherence.
- **The source quality is lopsided** — ACSM 2026 against a self-published table
  with multiple inconsistent renderings and no peer-reviewed test.
- **It is derive-don't-store**: one authored token, two derived consequences.
- **The domain authors the goal.** Issurin and JTS both shift the goal and let
  the band follow.
- **The check is free.** `ExerciseSet.pct1RM` already exists as a first-class
  authored quantity, mutually exclusive with `weightKg`, so a session at 60%
  inside a `maximal-strength` segment raises ADR 0042 §9's soft warning with no
  schema change and no new mechanism.

**The goal derives the intensity side only — never sets/wk.** ACSM's hypertrophy
prescription is "≥10 sets/wk", a _volume_ number. Deriving that from the goal
would re-create exactly the two-sources-for-one-number conflict §1 removed. The
anchor and ramp own volume; the goal owns the band and the rep range. This
boundary is stated explicitly because an implementer reading ACSM would
otherwise wire the set counts in.

**This reduces incoherence without eliminating it.** 30 sets/wk at 90% 1RM is no
longer _authorable_, because the band is not authored. But `power` (30–70% 1RM,
≤24 repetitions·sets) alongside a 60 sets/wk anchor remains authorable, and that
is a guard — warns, never blocks — not a structural impossibility.

**The asymmetry with ADR 0042 §5 is apparent, not real.** That section _derives_
the endurance emphasis label and forbids authoring it. Here the label is
authored. The principle behind §5 is lie-prevention — "no segment can be named
for work it does not contain" — and when the goal is the **source** the band
derives from, it cannot lie about the content; it _is_ the content. The
mechanism inverts; the principle holds.

**And ADR 0042 §3's exclusion of `speed` inverts rather than extending.** That
section dropped `speed` because neuromuscular work is high _mechanical_
intensity at low _metabolic_ strain, with no position on the zone axis. The
strength axis is `%1RM` — **mechanical** — so `power` has a native position on
it (ACSM's 30–70%). The two ADRs agree rather than needing a carve-out.

### 4. The segment authors sessions per week

A strength segment authors a **sessions-per-week** frequency. This is #391's
option 1, which ADR 0046 §3 explicitly declined to give and routed here: "It is
very likely the right answer and it is not this ADR's to give."

- **It is the only strength parameter with primary-source frequency evidence.**
  Pelland finds frequency's slope > 0 with **100% posterior probability for
  strength**; ACSM prescribes ≥2 sessions/wk. MRV never had this.
- **Endurance already authors frequency.** The **Quality Session Mix** is
  literally `TrainingZone → sessions/week`. This was the third
  strength/endurance asymmetry with no evidentiary basis behind it.
- **It closes ADR 0046 §4's open denominator.** The strength **Summary Count**
  read "—" for any unmaterialized week because planned sessions only exist once
  materialized. An authored frequency supplies the denominator **at the
  guideline layer**.
- **It delivers a fit check with no conversion at all.** ADR 0045 §8's surviving
  days-against-days comparison — session count against `trainableWeekdays` — was
  endurance-only "for the same reason §4 is: strength authors no session count".
  Both halves are now stored.
- Even the retired vendor model treated frequency as first-class: MRV was
  `f(muscle, frequency)`. Having dropped MRV, the residue is that frequency is
  the axis that moved everything else.

### 5. Hours calendar cost stays Unavailable; ADR 0046 §3 stands on a replaced reason

**ADR 0046 §3's correction holds: a cross-track hours total remains an
Unavailable Metric once a plan has a strength track.** But its _stated reason_
is now false and is replaced.

§3 said a strength segment "authors nothing multiplicable into hours — no
sessions per week, no duration per session". After §4 the first clause is wrong.
The correction survives on the **second** multiplicand alone, and on a second
ground §3 itself supplied:

- **No non-sparse duration source.** A constant time-per-session falls to ADR
  0045's stability rule (already closed by §3). Deriving duration from the
  prescription needs a tempo constant this repo does not store _and_ needs
  materialized sessions the guideline layer may not read (ADR 0043 §3). What
  remains is the athlete's own median recorded strength-session duration —
  `ActivityImport.durationSec` is non-null and `discipline` includes `strength`
  — but that is **sparse and watch-biased**, Unavailable for exactly the
  hand-logging pure lifter ADR 0041 §3 went out of its way to serve.
- **The consumer does not exist.** ADR 0046 §3 established that **Training
  Availability** stores `trainableWeekdays` and `defaultTrainingTime` and never
  a capacity, so "a hybrid athlete is not losing a 'does my week fit' answer
  that a pure runner has; nobody has it." Deriving strength hours would buy one
  half of a comparison whose other half is
  [#396](https://github.com/leskraas/trainm8/issues/396)'s.

So ADR 0046 §3's Downstream prediction that the row would be "reversed for free"
is **half right**: §4 supplies one multiplicand and delivers the
days-against-days check, and the hours row is not reversed. What changes is that
the route is now **scoped rather than closed** — if #396 lands a capacity, hours
becomes a one-step question with the athlete-median route already argued, and
ADR 0043 §6's row can be restored then on a stated athlete-relative source
rather than a constant.

**ADR 0043 §10's "no new Athlete Profile value" posture survives this ADR
untouched.** The anchor pre-fill (§7) needs no stored attribute.

### 6. A strength segment stays dated and floats free of the phases

`startWeekKey` + `weeks`, unaligned to the **Plan Outline** phases, as ADR 0044
built it. **The decision is unchanged; its justification is replaced**, because
ADR 0041 §4 rested it on MRV: "RP's mesocycle length is a consequence of
reaching MRV, not a choice, so forcing a strength segment to end where an
endurance phase ends imposes an alignment the domain rejects." With MRV gone,
that argument evaporates. Three grounds survive independently:

- **Issurin's decoupling argument is about deload _timing_, not about MRV.** A
  strength deload landing because the _running_ phase ended is the coupling
  Issurin separates blocks to avoid, whatever sets the mesocycle's length.
- **Sub-phase gaps are a real authored state.** Phase-aligned segmentation can
  express "no lifting this phase" by absence, but not "lifting in weeks 1–8 of a
  12-week Base". A 4–8 week mesocycle plus a deload has no reason to divide an
  endurance phase, and forcing it to would make the athlete restructure their
  running to fit their lifting.
- **It is already built**, and reversing costs a migration for simplification
  partly banked elsewhere in this ADR.

`weeks` keeps its shape on new and simpler grounds: not "an end date would store
a consequence" — there is no consequence now — but plain representation,
start-plus- length being equivalent to start-plus-end with length the one an
athlete edits.

**A strength segment needs its own week-role logic**, as ADR 0044 §4 already had
it ignore the phase rhythm entirely. Deload placement comes from `deloadWeeks`
at the segment's tail, not from `roleFactor`'s 3:1 rhythm, and the ramp steps
over loading weeks only so a deload week never advances the index (ADR 0040 §3).

**A strength track needs no taper mechanism.** Peaking is expressible as a
negative **Block Boundary Step**, a tail deload, or ending the segment before
the event — a gap being a meaningful state is exactly why segments stay
floating.

### 7. No upward ratchet, in any form

**The app never proposes a higher opening volume for a new block, and never
treats a flat anchor across blocks as an incomplete plan.** The athlete may
author one.

- **This is a refusal to build, not a removal.** The ratchet lived on
  per-athlete landmark numbers, and §1 leaves none. The burden of proof sits
  with anyone who wants a mechanism.
- **The athlete already has the expressive power, with no feature.**
  `SeasonAnchorSegment` is a _list_ of dated `(fromWeekKey, value)` rows, built
  so re-anchoring never rewrites weeks already lived (ADR 0040 §5). That works
  upward as readily as downward; "ratcheting" is authoring another anchor.
- **The two trials aimed at exactly this are null-to-adverse** (Barsuhn, Enes),
  corroborating rather than carrying the decision, since both were read from
  abstract only.
- **The error is asymmetric in the harmful direction.** A nudge upward is wrong
  most expensively for the lifter already at their limit — the same shape as ADR
  0046 §2's finding that `sRPE` only ever _added_ TSS, biasing readiness toward
  "go hard" for exactly the athlete whose extra fatigue was real.

**Seeding needs no stored attribute.** ADR 0043 §2's **Season Anchor** pre-fill
— the athlete's own logged sets/wk, offered at authoring time and accepted or
overridden — is a pre-fill, not a live derivation, so ADR 0040 §6's limit is
satisfied. #387's seeding question is answered by the pre-fill rather than by a
table, and #380's finding that a first-time lifter sits outside RP's published
scope entirely becomes moot: there is no table to seed.

### 8. Volume Landmarks are retired

**MV / MEV / MAV / MRV leaves the domain model.** `CONTEXT.md`'s entry is marked
_Retired_ in the existing idiom, and the reason is kept rather than the term — a
future reader will meet the vocabulary everywhere in strength-training material
and is owed an account of why this app declined it.

The account is the Evidence section: vendor-only, self-inconsistent by up to 2×,
published in a shape four scalars cannot represent, with its load-bearing member
absent from the indexed literature and unanchored by any meta-analysis.

**This is map #362's newest-supersedes-older rule applied by a research asset**,
which the map anticipated — the rule "applies to research assets as much as to
ADRs, which is how #380 corrected the reference file." Here it goes one step
further and retires a term three ADRs and a shipped migration were built on.

## Consequences

### What a strength track authors, in full

| Level   | Field                            | Status                                                                    |
| ------- | -------------------------------- | ------------------------------------------------------------------------- |
| Track   | `currency: 'sets'`               | systemic sets/week, scalar (§2), fixed for the track's life (ADR 0043 §2) |
| Track   | `anchors: SeasonAnchorSegment[]` | dated `(fromWeekKey, value)` in sets/wk, pre-filled from logged history   |
| Segment | `startWeekKey`, `weeks`          | dated, floats free of the phases (§6)                                     |
| Segment | `ramp`, `boundaryStep`           | **now shared with endurance**, no longer endurance-only (§1)              |
| Segment | `goal`                           | **new** — `hypertrophy \| maximal-strength \| power` (§3)                 |
| Segment | `sessionsPerWeek`                | **new** (§4)                                                              |
| Segment | `deloadCut`, `deloadWeeks`       | unchanged; convention −50% over 1 week (Bell 2025)                        |
| Segment | `fromLandmark`, `toLandmark`     | **dropped** (§1, §8)                                                      |

Derived and never stored: the weekly sets target (ADR 0040 §3's formula, with
§6's week roles); the `%1RM` band and rep range (§3); the **Season Span**; the
strength **Summary Count**'s denominator; the days-against-days fit check.

Still **Unavailable**, unchanged from ADR 0046: hours calendar cost (§5),
combined cross-track load, strength's CTL/ATL/TSB contribution, strength
**Planned TSS**, and **Week Replan** for strength.

### What this supersedes and corrects

- **ADR 0041 §4 is substantially superseded.** Four of its five rows fall: the
  progression rule (§1), the hard named bounds (§8), segment length as a
  consequence (§1, §6), and the post-deload resume "back near MEV" (now a
  negative **Block Boundary Step**). The row that survives is the boundary being
  discontinuous by design and never flagged — and it stops being a strength
  carve-out, because ADR 0040 §4 already says an authored step is intent the
  ramp guard stays silent on. Its "Left open" granularity note is closed by §2.
- **ADR 0041 §5's "hours remain a strength track's calendar cost"** was already
  narrowed to an aspiration by ADR 0046 §3; §5 above leaves it there and
  replaces the reason.
- **ADR 0042 §10 is closed** by §3, taking its option B.
- **ADR 0043 §4's `12 → 21 sets/wk` becomes literally true** (§1). §6's `hours`
  row is untouched (§5). §10's no-new-Athlete-Profile-value posture survives.
- **ADR 0044's schema changes**, and its §1 no-migration claim is **narrowed
  rather than reversed**: false in the letter — two columns dropped, two added —
  and true in the substance, since the per-muscle child table it was worried
  about never happens.
- **ADR 0046 §3's stated reason is replaced and its "reversed for free"
  prediction is corrected to half right** (§5). Its §4 denominator hole is
  closed by §4.
- **ADR 0040 §5's Season Anchor now serves both tracks**, and §12's ramp guard
  gains a second track to guard.
- **#381 and #387 are answered here**, as the ticket recorded: granularity by
  §2, landmark storage and ratcheting by §7 and §8 — the latter by dissolving
  the subject rather than by re-litigating the recorded answer.

### Accepted costs

- **The specialization case has no guideline-layer home** (§2) — the largest
  single cost here, and the one a strength-focused athlete is most likely to
  notice.
- **A hybrid athlete still gets no hours figure** (§5), now for a narrower
  reason.
- **A `sets` figure that is neither per-muscle nor per-movement is ours.** No
  source publishes a systemic weekly set count; it is countable and readable
  from the athlete's own log, which is what makes it defensible, but no citable
  range attaches to it and none may be presented as if one did.
- **Incoherent goal/volume combinations stay authorable** (§3), covered by a
  guard.
- **Retiring a term three ADRs were built on costs reader trust in those ADRs.**
  Mitigated by forward pointers rather than silent edits, but a reader who knows
  ADR 0041 will find its most distinctive table mostly gone.
- **Two new authored fields** where ADR 0041 had the landmark pair — a wash in
  count, not in concepts.

### Downstream

- **The migration is two columns dropped and two added, and is free to run**:
  #367 deleted existing outlines and nothing can author one yet. Per the
  boundary map #362 held for ADR 0045, the schema and code **land with the
  manual planning surface** rather than ahead of it — this change is not
  destructive-without-its-replacement, which was #367's ground for the one
  exception. The retired columns stay in `prisma/schema.prisma` with a pointer
  here until then, as `TSS_PER_PLANNED_HOUR = 60` does for ADR 0045.
- **The implementation note on #384 reverses.** It asked for a guard making a
  strength week read as an **Unavailable Metric** _by construction_. A strength
  week now has a real derived target, so `weekTarget` in
  `app/utils/plan-outline/derive.ts` needs a genuine strength branch,
  `TrackSpec.segments` becomes a discriminated union instead of
  `EnduranceSegmentSpec[]`, and the `isEndurance` filter in
  `app/utils/plan-outline/from-rows.ts` is replaced by a real path rather than
  hardened. `VOLUME_LANDMARKS` is deleted.
- **`CONTEXT.md`** needs: **Volume Landmarks** marked _Retired_; **Block
  Boundary Step**'s strength carve-out removed; **Volume Ramp**'s "an endurance
  rule specifically" corrected; **Volume Currency**'s `sets` sharpened to a
  systemic scalar; and new entries for the **Strength Goal** and the strength
  frequency.
- **What materializes a strength session is not settled here.** §4 supplies the
  **Summary Count**'s denominator at the guideline layer, which was the part ADR
  0046 routed to this ticket; the materialization strategy itself — fully up
  front versus near-term-only — remains recorded as fog on map #362 and is
  treated as an implementation choice for the surface.
- **A strength-native fatigue model** stays where ADR 0046 §2 left it: out of
  scope, for want of a source for its time constants.

## Status

Accepted for the manual planning foundation (#384, absorbing #381 and #387;
parent map #362 — the last decision on that map).

**Supersedes** ADR 0041 §4's progression rule, bounds, segment-length and
post-deload rows, and retires **Volume Landmarks** from the domain model.
**Closes** ADR 0042 §10 and ADR 0041 §4's "Left open" granularity note.
**Corrects** ADR 0046 §3's stated reason and its reversed-for-free prediction,
and **closes** ADR 0046 §4's open denominator. **Narrows** ADR 0044 §1's
no-migration claim. **Confirms unchanged** ADR 0043 §2, §6 and §10, ADR 0040 §3
and §5, and ADR 0042 §5 and §9. The schema and code land with the manual
planning surface.
