# Per-week volume is derived from an authored ramp, not stored as values

The clean-room prototype for the manual planning surface (#366, variant F) gave
every Plan Outline phase an **absolute** opening volume — `baseHours` — and
ramped its weeks from there with a hardcoded 5% progression. That is the obvious
model, and it produced a defect immediately: a **+50% week-over-week jump** at the
Base→Build boundary of the seeded plan and **+20.7%** at Build→Peak, because a
block's last week is a −30% recovery week and the next block opens at its own
independent number.

The instructive part was the failed fix. Easing the single offending week back
onto the ramp works, and the guard then re-fires on the *next* week, because the
block's remaining weeks still ramp from the unchanged absolute base. Smoothing one
week only moves the cliff.

#363 had already flagged the underlying hole as gap 5, "progressive overload as
authored intent": the app has a *downward* volume rule (Week Replan, ADR 0025) and
no upward counterpart. So the cliff and the missing ramp are one question.

Research for #374 ([note](../wayfinder/manual-training-planning/374-volume-continuity-and-progressive-overload.md))
surveyed ten endurance platforms, the strength-periodization literature, and the
intensity-distribution literature. Two findings reframed the decision:

- **The strongest convergence in the survey**: where a deload's reference is
  stated it is the *loading peak*, and **no platform resumes progression from the
  deload week**. The +50% was not merely a bug — it was measuring the wrong pair
  of weeks.
- **Volume alone cannot express progressive overload.** `TSS = IF² × hours × 100`,
  so hours enter linearly and intensity squared. Tønnessen et al. 2020 randomised
  elite athletes to 2 vs 4 interval sessions per week, matched for total volume
  *and* for total zone-3 minutes; the 2-session arm improved on three measures,
  the 4-session arm on none. Same volume, same distribution, opposite outcome.

## Decision

### The volume model

1. **Per-week volume is derived, never stored.** A season carries one anchor and
   each block carries a **rate**; every week's target is computed. Nothing stores
   a week's number, so nothing can go stale. This is the general principle the
   codebase already applies ad hoc — "derived, never authored" (ADR 0021), the
   Plan card as a view over Events (ADR 0018) — named and applied here.

   The rejected alternative was to *seed* a block's opening volume from the
   previous block at creation time and store the result. That is the worst of both:
   it computes a number from other data and **throws the relation away**, so it
   goes stale silently and unrecoverably.

2. **The ramp steps over loading weeks. Recovery and taper are multiplicative
   roles, not sequence participants.** A recovery week is `last loading week ×
   (1 − cut)` and contributes nothing to the progression; the next loading week
   resumes one step above the last *loading* week.

3. **Expressed as a pure indexed function, not a stateful fold:**

   ```
   target(w) = anchor(w)
             × Π (1 + rampᵦ) over the loading weeks before w
             × (1 + boundaryStepᵦ) for each block boundary crossed
             × roleFactor(w)          // 1.0 load · (1 − cut) recovery · taper cut
   ```

   `loadIndex(w)` — the number of loading weeks before `w` — is arithmetic from the
   block's rhythm, not a running counter. So week 37 computes without computing
   weeks 1–36: random access, no order dependence, testable per week in isolation.
   This also removes the prototype's one stateful wart, where a recovery week
   *carried* a value read from a previous loop iteration.

   That the rhythm affects accumulated progression is correct, not a coupling to
   engineer away: 2:1 inserts more recovery weeks, so fewer loading weeks
   accumulate ramp, so a masters athlete on 2:1 genuinely builds more slowly over
   the same calendar time.

4. **A block authors an optional boundary step, default `0`.** The boundary is
   ordinarily just another ramp step, which makes the cliff unrepresentable. But a
   deliberate volume *drop* entering an intensity block must be expressible, and a
   negative ramp models it wrongly (volume would keep falling through the block).
   Published magnitudes: Renaissance Periodization opens mesocycle 2 at ~16 sets
   after closing mesocycle 1 at ~21 (−24%); JTS cuts 75 → 50 barbell reps (−33%)
   while raising intensity 10 percentage points; Rønnestad 2025 measured
   low-intensity volume falling 7:58 → 4:43 (−41%) entering an interval block.

   An authored boundary step is **intent**, and the guard stays silent on it.

5. **The anchor is an ordered list of dated segments, not one number.** Lowering
   the anchor mid-season must not rewrite the volume of weeks already lived — the
   chart would draw a past that did not happen, which the app's honesty rules
   forbid (Unavailable Metric; "never a fabricated ratio", CONTEXT.md). Re-anchoring
   is an explicit dated act: `(fromWeek, value, unit)`. `loadIndex` **resets** at a
   new segment — a new anchor starts the product from itself, or the athlete
   inherits the progression they just said they could not sustain.

   _Amended by ADR 0043 (#372): a segment is `(fromWeek, value)` — it carries no
   unit. The unit is the **Training Track**'s **Volume Currency**, fixed for the
   track's life, so a re-anchor changes value only. This is a simplification: a
   re-anchor that also changed unit would need a conversion to be comparable with
   what it replaced._

   Weekly Plan Adherence is unaffected either way: it is
   `sum(actual TSS) / sum(Planned TSS)` over Workout Sessions (ADR 0019) and never
   reads the Outline.

6. **The athlete's first anchor value is authored, pre-filled from actuals.** The
   field is seeded from recent training with the derivation shown ("your last 4
   weeks averaged 5.8 h"), then it is the athlete's number. Deriving it live from
   imported activity would make a plan mutate from data arriving in the
   background — the failure ADR 0025 exists to prevent.

### The intensity model

7. **A block authors a second number: its count of quality sessions per week.**
   Volume alone is half a decision about progressive overload. This integer is the
   axis that distinguishes a hard week from an easy week at identical volume, and
   it is the best-evidenced intensity primitive in the literature — Seiler's "two
   to three" of 10–14 weekly sessions; the Norwegian world-class coaches' "2–3 key
   workout days consisting of 3–5 intensive sessions"; Daniels naming plans by it
   ("2Q"); Xert shipping it as a **Polarization Level** slider from 1:1 to 5:1
   hard:easy days.

8. **No authored intensity distribution.** Not a target split, not a Polarization
   Index goal. No surveyed platform accepts one — intervals.icu computes the index
   in seven places and takes no target; TrainingPeaks has no field, so third-party
   authors encode TID in the plan *title*. The originators argue against it:
   Seiler, "the unit of stress perceived and responded to by the athlete is the
   stress of entire training sessions … not minutes in any given heart rate zone";
   80/20 Endurance's own authors, "forget about 80/20 per se and concentrate
   instead on planning out your weeks by session type". Distribution stays a
   *derived* metric.

   A distribution target would also be under-determined: Rønnestad 2014 matched
   two arms on both volume and zone distribution and still got different outcomes.

9. **A flat TSS-per-hour is retired as a planning conversion.**
   `TSS_PER_ENDURANCE_HOUR = 60` is folklore — no primary source was found, and
   TrainingPeaks' own published flat figure is hours × **50**, with 60 being their
   *moderate* value. With volume and quality-session count both authored, planned
   load is a function of two numbers rather than one scalar assumption. The
   remaining conversion error is stated, not hidden.

   _No successor was named here, and the constant is still shipped:
   `TSS_PER_PLANNED_HOUR = 60` in `app/utils/load/fitness-projection.ts`, with a
   test pinning the value. ADR 0043 (#372) adds a hard requirement — the successor
   **must be mix-aware**, a function of volume and the **Quality Session Mix** —
   and hands the mechanism to #385._

### Units

10. **The ramp and the boundary step are unit-free percentages.** +5% in km is +5%
    in hours, so a runner authoring a season of km blocks never meets an hour.
    Each block authors in its own currency (#366); each anchor segment carries its
    own unit.

    Hours is the **reconciliation** unit, needed at exactly three places: a
    boundary between blocks with different units, the season total and chart axis
    (owned by #372), and the load projection. It is not the storage unit for
    everything.

    _Amended by ADR 0043 (#372): hours is **not** a reconciliation unit, and two of
    the three places are gone. A boundary between differing units cannot occur —
    **Volume Currency** belongs to the track, so a track has one currency. The
    season total and chart axis need no shared unit either: the headline is a
    per-track **Season Span** and one chart axis is one track in one currency. Only
    the load projection remains a conversion site (#385). Hours keeps two roles: a
    legitimate **Volume Currency**, and every track's calendar cost against
    **Training Availability**._

11. **Hours is calendar cost for a strength block, not its dose.** The WHO
    guidelines dose aerobic work in minutes and muscle-strengthening in *days*,
    stating there is "insufficient evidence to specify a specific duration"; the
    ACSM 2026 Position Stand prescribes strength entirely in %1RM, sets, reps and
    sessions/week and finds time under tension non-influential. Strength volume is
    sets per muscle group per week — a dimensionless count, per muscle, with no
    time factor — so it is a *different quantity*, not a lossy version of hours.
    What follows for the Outline is #373's to decide; this ADR only records that
    hours must not be treated as strength dose.

### The guard

12. **The ramp guard warns and never blocks**, and its subject is the **authored**
    numbers — a block's ramp and its boundary step — not a week-over-week diff. It
    therefore stops firing on a recovery-week rebound or a taper cut, both of which
    are false positives today.

    Precedent runs one way: no platform in the survey blocks on a ramp figure.
    TrainingPeaks warns via an advisory pop-up with a user-adjustable threshold;
    WKO5's alert levels are user-supplied. The one blocking regime found (Runna)
    constrains *inputs*, never a ramp number. ADR 0025 does constrain Week Replan
    to downward-only — but that is the machine acting on the athlete's behalf,
    which is a different thing from the athlete authoring their own plan.

13. **The threshold is one documented constant in code, sourced and honest about
    its status.** It is currently duplicated across four prototype files
    (`RAMP_WARN = 8`, `RAMP_HOT = 12`). Precedent for the location: ADR 0006 puts
    zone-system recipes in code rather than the database, because they are domain
    knowledge and not athlete data.

    It must not be presented as injury prevention. The 10% rule has a **failed
    RCT** behind it (Buist et al. 2008, n=532: 20.8% vs 20.3%, P=.90); Nielsen et
    al. 2014's primary outcome was also null and its authors' advice is <30%;
    Gabbett calls <10% "more of a guide than a rule". A 5–8%/week default is a
    conservative convention, and the copy should say so. **ACWR must never become a
    planning constraint** — "there is no evidence supporting the use of ACWR in
    training-load-management systems" (Impellizzeri et al. 2020), and its
    0.8–1.3 "sweet spot" is the subject of a formal retraction request.

## Consequences

- **The cliff becomes unrepresentable rather than guarded-against.** There is no
  jump because there is nothing to jump from; the +50% cannot be expressed.
- **Presets stop carrying magic numbers.** `SEASON_TEMPLATES`' `baseHours: 6.5 /
  7.5 / 7` are three absolute numbers that *are* the seeded plan's cliff. A preset
  becomes a shape — rhythm, weeks, focus, ramp, boundary step, quality-session
  count. This is what #371 must encode.
- **Editing the anchor moves the whole season from that segment forward.** One
  legible knob, unlike "I edited block 2 and blocks 3–5 moved".
- **We are ahead of the field on the second axis, deliberately.** The survey found
  that nobody models volume and load as independent axes at the weekly-planning
  layer; most pair volume with a *focus label*. The science supports the session
  count and Xert has shipped it, but this is a considered lead, not a convention
  to follow.
- **Accepted limitation: km and hours diverge exactly when the quality-session
  count changes.** Faster running covers more km per hour, so adding a quality
  session at constant km reduces total hours. The two units are not interchangeable
  across an intensity change — another reason each block authors in its own unit.
- **Accepted limitation: continuity across a mixed-unit boundary is only as good
  as the pace assumption** (`KM_PER_HOUR = 10` today). Whether that becomes a
  stored Athlete Profile value is #372's. _Answered by ADR 0043: **no**, and the
  mixed-unit boundary itself is gone. `KM_PER_HOUR` is removed with nothing stored
  in its place — the remaining km↔hours need is calendar cost, computed from the
  existing `thresholdPaceSecPerKm` plus the **Quality Session Mix**, because a
  single stored pace has exactly the defect the bullet above describes._
- **Known simplification: the recovery role is a scalar cut.** Runna's deload is
  the most sophisticated found — hard sessions cut more than easy, long run cut by
  ability, *plus one fewer run*. With a quality-session count now in the model, a
  recovery week arguably ought to reduce that count too. Left to #367 as part of
  how recovery weeks are expressed.
- **`Focus` needs splitting.** The prototype's enum mixes intensity emphasis
  (endurance / threshold / vo2max / speed) with modality (strength), so the model
  cannot express "a threshold block that also carries strength work" — the normal
  case in every source surveyed.

## Not decided here

- The **stored shape** of the extended Plan Outline and its migration — #367. This
  ADR settles that per-week targets are stored as **neither values nor offsets**:
  they are computed from an anchor plus per-block rates. What #367 stores is the
  anchor segments, the rates, the boundary steps and the quality-session counts.
- The **season headline unit** and whether the km↔hours pace becomes an Athlete
  Profile value — #372. _Both decided in ADR 0043: a per-track **Season Span** in
  the track's own **Volume Currency**, and no stored pace value._
- What a **no-load block** is and what it does to the load-derived surfaces —
  #373.
- Which **presets** ship and what they encode — #371.

## Status

Accepted for the manual planning foundation (#374, parent map #362). Extends
ADR 0039 (manual planning authors the Plan Outline) and closes #363's gap 5.
Constrains #367, #371, #372 and #373. Full evidence base with citations in
[`docs/wayfinder/manual-training-planning/374-volume-continuity-and-progressive-overload.md`](../wayfinder/manual-training-planning/374-volume-continuity-and-progressive-overload.md).
