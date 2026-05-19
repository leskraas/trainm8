# TSS triad as load math, HR-first per-discipline defaults

Training load uses the Coggan TSS triad: per-session TSS, plus CTL (42-day
exponentially weighted average of daily TSS, "fitness"), ATL (7-day EWMA,
"fatigue"), and TSB = CTL − ATL ("form"). Per-session TSS is computed from heart
rate by default for cardio (`hrTSS`), from CSS for swim (`sTSS`), and from RPE
for strength (`sRPE`). Athletes who own a power meter or measure threshold pace
may opt in to Coggan TSS (bike) or rTSS (run) on their Discipline Profile.

## Considered options

- **Per-discipline canonical formulas by default (Coggan TSS bike + rTSS run +
  sTSS swim)**: Rejected — pace-based rTSS over hilly terrain misrepresents
  stress, and Coggan TSS and hrTSS for the same ride often diverge 10–20%.
  Mixing formulas across disciplines breaks the cross-discipline comparability
  of the CTL number, which is the whole point of having one fitness signal.
- **Pure sRPE for all disciplines**: Rejected — too subjective for AI plan
  generation. HR and CSS data, when present, give a far more reliable signal.
- **On-the-fly load computation in UI**: Rejected — CTL/ATL/TSB are time series;
  computing them per page render is wasteful and yields inconsistent values
  across views.
- **hrTSS for swim too**: Rejected — HR underwater is unreliable for most
  amateurs (chest strap slips, wrist HR fails submerged). Swim would degrade to
  sRPE in practice. CSS-based sTSS is the domain standard for swim load and
  works without HR.

## Consequences

- A `LoadSnapshot` table materializes daily TSS totals (athlete timezone),
  tssByDiscipline split, and CTL/ATL/TSB. Computed by a background job triggered
  on session log, import promotion, or threshold change.
- Provenance is stored on each session contribution (on the originating Workout
  Session or Activity Import):
  `{ formula: 'coggan' | 'hrTSS' | 'rTSS' | 'sTSS' | 'sRPE', confidence: 'high' | 'medium' | 'low' }`.
  Lets the UI explain "this ride is 87 TSS via hrTSS (medium confidence)".
- Fixed 42-day CTL and 7-day ATL time constants in v1.
- Day boundaries use `AthleteProfile.timezone`, not UTC.
- Fallback chain: HR data + LTHR/maxHR → `hrTSS`; else RPE in Session Log →
  `sRPE`; else Unavailable Metric (the LoadSnapshot row still exists but this
  session does not contribute).
- AI plan generation receives current CTL/ATL/TSB and recent daily TSS as
  context for intensity decisions.
- Strength TSS via sRPE is intentionally rough and is surfaced in
  `tssByDiscipline` separately from cardio, so UI can present it differently.
- When an athlete adds a power meter or threshold pace later, the system offers
  to recompute historical LoadSnapshots with the new formula but never
  auto-switches silently.
