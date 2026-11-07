# Spec review, PR #691 at 4ea4dcf against issue #472 (bredvid-code-review, Spec axis, run inline)

Issue #472 is labelled `ready-for-human` (triage 2026-10-24), but carries Design, Architecture and Decisions sections settled by the factory under autonomy `full`.

| # | Criterion | Verdict | Where |
|---|---|---|---|
| 1 | Target and Planned per track, labelled, in currency | met | route `TrackFigureLine`; route test "a week card shows each track's target and planned figure" |
| 2 | Preview = Sesong, one function, test | met | generate.server.test.ts "a preview week's Planned Volume is the one Sesong reads" |
| 3 | Unmeasured counted apart | met | `wordTrackWeek` + `unmeasuredCountLabel`; route test |
| 4 | All unmeasured -> no 0 km | met | `figureNotes.planned`; route test |
| 5 | Nothing placed -> 0, unfilled lines kept | met | route test |
| 6 | ≠ by DRIFT_TOLERANCE, per-week gate | met | `wordTrackWeek` driftLabel; route test |
| 7 | null target -> — plus planned | met | route test |
| 8 | Hours track times distance via thresholds | met | week-volumes.test.ts "an hours figure times a distance step" |
| 9 | One sentence, labels.ts | met | `PLAN_GENERATE_LABELS.placedAsPublished`; route test |
| 10 | No rescale, test | met | generate.server.test.ts "a placed session is not rescaled" |
| 11 | Answer change regenerates, approval server-side | met | unchanged loader/action; preview computed in `previewSeason` |
| 12 | 390 wide, figures wrap as unit, SR labels | met in code (subgrid, nowrap groups, `role=img` ≠); needs a real phone |

## Finding S1 (medium): the "already in week" line counts sessions the planned figure does not

`app/utils/plan-generation/planned-volume.ts:602` sets `existingSessions: theirs.length`, every existing session in the week. `buildWeekVolumes` (week-volumes.ts:543-571) only puts a session on a track when its discipline is a track's and `countsInNoTrack` is false; `trackWeek` (week-volumes.ts:654) only counts it toward planned when it has a prescription. An athlete with a strength session (or a yoga/`other` session, or one marked "counts in no track", or a recording-only row) in a run-only season's week sees «Planlagt teller også med 1 økt du allerede har denne uka.» while no planned figure counts it. That contradicts the Decision's own words ("names which figure it explains") and ADR 0112 §4.
Fix: count only the existing sessions that some track's planned figure reads (discipline on a season track, not `countsInNoTrack`, `prescribed != null`). Test first in a pure `planned-volume.test.ts`.
