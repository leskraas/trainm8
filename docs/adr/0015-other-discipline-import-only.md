# `'other'` Discipline as import-only fifth value

External training services expose far more activity types than trainm8 models.
Strava alone categorizes ~30 types (`Hike`, `Walk`, `Yoga`, `Crossfit`,
`EBikeRide`, `AlpineSki`, `RockClimbing`, …). Trainm8's **Discipline**
vocabulary is `run | bike | swim | strength` — a deliberately tight
triathlon/multisport scope, with load formulas (ADR 0008) calibrated to it.

When an **Activity Import** arrives that does not map cleanly to one of the
four canonical Disciplines, we must choose between dropping it, mismapping it
to the nearest neighbor, expanding the Discipline vocabulary, or assigning it
to an "other" bucket.

## Decision

Introduce `'other'` as a fifth Discipline value, **import-only**:

- Activity Imports may carry `discipline = 'other'`.
- **Workout Templates** and planned **Steps** may not — `'other'` is invalid
  for authoring.
- Activity Imports marked `'other'` do not auto-promote during Backfill and do
  not contribute to TSS / Training Load. They appear in the import inbox so
  the athlete can promote them manually if she wants a record on the Session
  Ledger.
- The provider→Discipline mapping table is private to each provider's
  integration folder (ADR 0014). Anything outside the four-canonical set
  collapses to `'other'`.

We do **not** expand the Discipline vocabulary with new first-class values
(`hike`, `nordicSki`, `row`, etc.) in this ADR. That decision is deferred
until a concrete athlete-profile demand exists.

## Considered options

- **Discard unmodeled activities silently**: Rejected — the athlete sees her
  Hike in Strava and not in trainm8, with no explanation. Silence is worse
  than visible-but-non-contributing.
- **Map to the nearest canonical Discipline (Hike → run, Yoga → strength,
  EBikeRide → bike)**: Rejected — actively harmful. `rTSS` pace math on a
  Hike misrepresents stress; bike Coggan TSS on an e-bike is meaningless;
  yoga is not strength training in any load-relevant sense. CONTEXT.md's
  Unavailable Metric rule explicitly bans inventing data, and mismapped TSS
  is invented data flowing straight into CTL/ATL/TSB.
- **Expand the Discipline vocabulary with new first-class values now**:
  Rejected as premature. Each new Discipline forces a Load Formula decision
  (ADR 0008 amendment), Step-authoring UI work, a Discipline Filter slot, a
  Discipline Allocation row, and ongoing planning UX. Doing this speculatively
  in the absence of athletes who actually plan hikes/skis is the kind of
  upfront-flex CLAUDE.md tells us to refuse.
- **Athlete picks the mapping per import**: Rejected for V1 as default —
  reasonable as a future opt-in, but unacceptable friction as the only path.

## Consequences

- `Discipline` enum gains the value `'other'`, but Zod / form schemas for
  Workout Template authoring continue to enforce the four canonical values
  (run/bike/swim/strength). Validation is split between "input domain" and
  "import domain".
- `'other'` Activity Imports are excluded from `autoMatchImport()` — they
  cannot match a planned Workout Session because no planned Session can have
  `discipline = 'other'`.
- `'other'` Activity Imports do not pass the discipline-gated TSS formulas in
  ADR 0008. The `tssValue` for these imports is `null` (Unavailable Metric),
  consistent with the existing fallback chain. The LoadSnapshot row for the
  day still exists; the import does not contribute.
- The **Discipline Filter** in the Upcoming Ledger does not surface `'other'`
  as a filter option — it is not a plannable Discipline. The import inbox UI
  may surface `'other'` distinctly so the athlete can see what was imported
  but not loaded.
- A **Discipline Allocation** chart that aggregates upcoming sessions remains
  unaffected (`'other'` cannot appear there).
- The provider-side mapping decision for ambiguous activities (e.g., does
  `EBikeRide` belong in `bike` or `'other'`?) is intentionally local to each
  provider's `discipline-map.ts`. The default for Strava is `EBikeRide →
  'other'` because the motor breaks the watts/HR relationship that
  bike-specific TSS relies on. Future override per athlete is possible but
  out of scope here.
- Expanding the Discipline vocabulary later (e.g., adding `hike`) remains an
  open option but requires its own ADR with a Load Formula decision.
