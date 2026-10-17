# `'other'` Discipline as import-only fifth value

Status: Accepted · **Amended by §A below (spec #558, ticket #567)**: `other` is
plannable as a **Simple Activity**, with an Activity Kind and an Effort Word,
time and hardness only. Imports of `other` still land in **Annet** and are never
auto-linked.

> **Revisit — Amend.** Refusing to invent load for an unmapped activity is
> confirmed, but tying that refusal to authorability conflates "may I plan it?"
> with "may it contribute load?": XC skiing, rowing, ski touring and
> aqua-jogging need a **plannable but load-silent** discipline, the same shape
> ADR 0046 §2 gave strength. Rowing arrives with a better portable anchor than
> several first-class disciplines have — the 2 000 m split, a measured maximal
> effort over a fixed distance on a standard device. See
> [`docs/research/workouts-strength-and-other.md`](../research/workouts-strength-and-other.md).

External training services expose far more activity types than trainm8 models.
Strava alone categorizes ~30 types (`Hike`, `Walk`, `Yoga`, `Crossfit`,
`EBikeRide`, `AlpineSki`, `RockClimbing`, …). Trainm8's **Discipline**
vocabulary is `run | bike | swim | strength` — a deliberately tight
triathlon/multisport scope, with load formulas (ADR 0008) calibrated to it.

When an **Activity Import** arrives that does not map cleanly to one of the four
canonical Disciplines, we must choose between dropping it, mismapping it to the
nearest neighbor, expanding the Discipline vocabulary, or assigning it to an
"other" bucket.

## Decision

Introduce `'other'` as a fifth Discipline value, **import-only**:

- Activity Imports may carry `discipline = 'other'`.
- **Workout Templates** and planned **Steps** may not — `'other'` is invalid for
  authoring.
- Activity Imports marked `'other'` do not auto-promote during Backfill and do
  not contribute to TSS / Training Load. They appear in the import inbox so the
  athlete can promote them manually if she wants a record on the Session Ledger.
- The provider→Discipline mapping table is private to each provider's
  integration folder (ADR 0014). Anything outside the four-canonical set
  collapses to `'other'`.

We do **not** expand the Discipline vocabulary with new first-class values
(`hike`, `nordicSki`, `row`, etc.) in this ADR. That decision is deferred until
a concrete athlete-profile demand exists.

## Considered options

- **Discard unmodeled activities silently**: Rejected — the athlete sees her
  Hike in Strava and not in trainm8, with no explanation. Silence is worse than
  visible-but-non-contributing.
- **Map to the nearest canonical Discipline (Hike → run, Yoga → strength,
  EBikeRide → bike)**: Rejected — actively harmful. `rTSS` pace math on a Hike
  misrepresents stress; bike Coggan TSS on an e-bike is meaningless; yoga is not
  strength training in any load-relevant sense. GLOSSARY.md's Unavailable Metric
  rule explicitly bans inventing data, and mismapped TSS is invented data
  flowing straight into CTL/ATL/TSB.
- **Expand the Discipline vocabulary with new first-class values now**: Rejected
  as premature. Each new Discipline forces a Load Formula decision (ADR 0008
  amendment), Step-authoring UI work, a Discipline Filter slot, a Discipline
  Allocation row, and ongoing planning UX. Doing this speculatively in the
  absence of athletes who actually plan hikes/skis is the kind of upfront-flex
  CLAUDE.md tells us to refuse.
- **Athlete picks the mapping per import**: Rejected for V1 as default —
  reasonable as a future opt-in, but unacceptable friction as the only path.

## Consequences

- `Discipline` enum gains the value `'other'`, but Zod / form schemas for
  Workout Template authoring continue to enforce the four canonical values
  (run/bike/swim/strength). Validation is split between "input domain" and
  "import domain".
- `'other'` Activity Imports are excluded from `autoMatchImport()` — they cannot
  match a planned Workout Session because no planned Session can have
  `discipline = 'other'`.
- `'other'` Activity Imports do not pass the discipline-gated TSS formulas in
  ADR 0008. The `tssValue` for these imports is `null` (Unavailable Metric),
  consistent with the existing fallback chain. The LoadSnapshot row for the day
  still exists; the import does not contribute.
- The **Discipline Filter** in the Upcoming Ledger does not surface `'other'` as
  a filter option — it is not a plannable Discipline. The import inbox UI may
  surface `'other'` distinctly so the athlete can see what was imported but not
  loaded.
- A **Discipline Allocation** chart that aggregates upcoming sessions remains
  unaffected (`'other'` cannot appear there).
- The provider-side mapping decision for ambiguous activities (e.g., does
  `EBikeRide` belong in `bike` or `'other'`?) is intentionally local to each
  provider's `discipline-map.ts`. The default for Strava is
  `EBikeRide → 'other'` because the motor breaks the watts/HR relationship that
  bike-specific TSS relies on. Future override per athlete is possible but out
  of scope here.
- Expanding the Discipline vocabulary later (e.g., adding `hike`) remains an
  open option but requires its own ADR with a Load Formula decision.

## §A — Amendment (spec #558, #567): `other` is plannable as a Simple Activity

The Revisit note above asked for a plannable but load-silent discipline. Spec
#558 needs one now: the athlete who climbs, skis _langrenn_, hikes or does yoga
wants those days in the plan and in the week's hours. We make `other` itself
plannable instead of adding a Discipline per activity.

1. **A Simple Activity is a Workout Session on `other`.** Its Workout carries an
   **Activity Kind** (_langrenn_, _fjelltur_, _klatring_, _yoga og
   bevegelighet_, open for more) and an **Effort Word** (_rolig_ / _middels_ /
   _hard_). Its structure is exactly one step of duration, with no Intensity
   Target. A Workout on `other` without both is invalid, and so is a step on
   `other` that is not a Simple Activity's one timed step. "Workouts and planned
   Steps may not use `other`" now holds for everything except this one shape.
2. **Time and hardness only.** Planned TSS, Training Load contribution, zones,
   pace, power and planned distance are **Unavailable Metrics** with the reason
   _enkel aktivitet_, shown as _ikke målt_ and never as a number. The Effort
   Word is never converted into a Training Zone, an Intensity Target or RPE. The
   Workout's intent is the Simple Activity's own value, which maps to no zone,
   so no zone can come in through the intent either.
3. **Volume.** Planned Volume counts a Simple Activity's planned minutes in
   hours. Actual Volume counts the planned minutes when it is marked _Gjort_ by
   hand, and a linked import's duration when one is linked.
4. **Imports are unchanged.** An import of `other` still lands on a session of
   its own in **Annet**, is never auto-linked to a plan (`autoMatchImport` still
   skips it), and contributes no TSS. The athlete may link it by hand to a
   planned Simple Activity on the same day, and undo that link. A planned Simple
   Activity is not in Annet; it sits on the plan's track on `other` where there
   is one.

### Considered options

- **A Discipline per activity (`climb`, `ski`, `hike`)**: rejected. Every switch
  on Discipline (zones, thresholds, TSS formulas, PRs, Structure Detection,
  import mapping) would need an honest "not available" branch for each new
  value. One plannable `other` needs it once.
- **Effort Word as an intent or a zone**: rejected. A hard climb is not a zone-5
  run, and storing it as one would put a guessed zone into every reader of
  intensity.

### Consequences

- The import-domain / authoring-domain split stays: the authoring form schemas
  still offer only run, bike, swim and strength. A Simple Activity is written
  through its own shape, not through the step editor.
- One hours track on `other` holds all of an athlete's Simple Activities (spec
  #558, built with the start in #572), which keeps one Training Track per
  Discipline (ADR 0044).
- Auto-linking imports to Simple Activities stays out of scope until an import
  can name its Activity Kind.
