# A generated week's Planned Volume is read outside the seam, as Sesong will read it after approval

Status: Accepted · Resolves the reading behind #472 · **Clarifies
[ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md) §6**
("the payload carries both"): the **payload** carries the Week Targets and the
placed sessions; the sum of those sessions is a **reading** of the payload, not
a field the generator fills.

## Context

ADR 0053 §6 places every retrieved session as its source published it, so a
generated week's **Week Target** and the sum of its sessions are two numbers.
The generate preview (`/training/plan/generate/:eventId`) showed only the first.
Since #505, _Sesong_ and _I dag_ read the second, **Planned Volume**, through
one model (`week-volumes.ts`: `volumeSessionOf` → `buildWeekVolumes`, worded by
`wordTrackWeek`). #472 shows it on the preview too, and asks that the preview's
figure be the one _Sesong_ shows for the same week right after approval.

Three things had to be decided: where the sum is computed, what it is computed
from, and which sessions it covers.

## Decision

1. **Read outside the seam, on the server side of `previewSeason`.** The
   `SeasonGenerator` and `GeneratedSeason` do not change. `previewSeason` reads
   the payload it got back through the week model and returns the per-week,
   per-track figures on its result, beside `season`. Planned Volume is a
   measurement of what was placed, and a measurement made by the thing being
   measured is not one. A model behind the seam later gets the same figures for
   free, and cannot state a sum its own sessions do not hold. Because the
   figures are on `previewSeason`'s result and not computed in the route, every
   reader of that read (the route today, a `preview_season` action under ADR
   0092 and ADR 0093 later) gets the same numbers.
2. **Read from the stored Stock Workout rows that approval copies.** The read
   uses `stockWorkoutSelect` (`workoutCopySelect`, the columns a copy writes,
   plus the block and step ids the Workout Shape keys its planned zones by,
   which a copy never writes), through `readStockWorkouts`, the one reader in
   `write-sessions.server.ts` that approval and a re-lay
   ([ADR 0120](./0120-a-generated-plan-keeps-a-generation-record-and-its-weeks-are-laid-again-by-the-generator.md))
   copy from too, so the preview and the approval cannot read different rows. It
   does not use the TypeScript corpus, whose structured Intensity Targets
   `fixedDayVolume` cannot read. Thresholds are `getDisciplineThresholds`, as on
   _Sesong_. Nothing is resolved, rescaled or written (ADR 0053 §6, §8).
3. **One per-session reading, split from the ledger row.** `volumeSessionOf`
   takes a whole `LedgerSession` (recording, set logs, Planned TSS). A session
   that is only previewed has none of these. The prescription half moves into
   its own function in `week-volumes.ts`, taking the Workout (discipline,
   intent, blocks) and the thresholds. `volumeSessionOf` calls it for its
   `prescribed` and `plannedZones`, and the preview calls it for each placed
   session. A fake `LedgerSession` built for the preview is the workaround this
   rules out.
4. **The week as approval would leave it.** **Planned Volume** is the sum of a
   week's sessions, all of them, and approval deletes none of the athlete's
   sessions. So a preview week's figure covers the sessions the generator placed
   **and** the athlete's sessions already in that week (hand-written, imported,
   or laid by another plan), read through `volumeSessionOf` exactly as _Sesong_
   reads them, with one ledger read over the season's span. A figure over the
   placed sessions alone would differ from _Sesong_ the moment the athlete has
   one session in a future week, which is the broken promise #472 exists to
   remove. Where a week holds such sessions, the card says how many, in words
   from `labels.ts`, so the figure is never larger than the rows it sits above
   without a reason.
5. **One model, one wording.** Each preview week goes through `buildWeekVolumes`
   with the generated targets as its `PlanTrackTargets`, and each track through
   `wordTrackWeek` with `hasSessions` set over the whole week, as _Sesong_ does.
   The `≠` rule (`drift`, `DRIFT_TOLERANCE`), the unmeasured counts and the
   empty-week rule are not copied into the route.

## Considered options

- **Put the planned sum on `GeneratedSeason`, filled by the generator.** That is
  a literal reading of §6's "the payload carries both". Rejected: the generator
  would need the blocks and the thresholds as inputs, every implementation
  behind the seam would have to re-implement the week model, and a model
  implementation could state a figure its sessions do not add up to.
- **Compute it in the route loader.** Rejected: a second reader of the preview
  would have to repeat it, which is what ADR 0092 rules out.
- **Session-size metadata on `CatalogueEntry`.** Rejected in #472's spec: a
  second source of truth beside the blocks, and a schema change and corpus
  migration.
- **Sum only the placed sessions.** Rejected, see §4.
- **Read it inside the generator and carry it on the payload, as
  [ADR 0116](./0116-a-generated-weeks-placed-hours-are-a-floor-carried-on-the-payload.md)
  §2 does for Placed Hours.** ADR 0116 rejected pricing placed sessions "after
  generation, from a second query" for Placed Hours, and its Consequences say
  #472 reads Planned Volume "from the same per-session reading". This ADR keeps
  that reading (`prescribedDuration` through the athlete's thresholds, inside
  `fixedDayVolume`) and departs from ADR 0116 on the layer only, for two reasons
  that do not hold for Placed Hours. Placed Hours is a statement the generation
  makes about its own placement, checked against the capacity inside the seam
  (`hoursFitWarnings`); Planned Volume is _Sesong_'s figure, and it covers the
  athlete's own sessions (§4), which the pure generator never sees. So the two
  sibling figures sit in different layers on purpose; ADR 0116 is not
  superseded, and its rejected option still holds for Placed Hours.

## Consequences

- A generated **TSS** track would read every placed session as unmeasured in the
  preview, because Planned TSS is materialized only on approval
  (`recomputePlannedTssForSession`). No generated track is in TSS today
  (`proposeTrack` never proposes TSS, since `totalIn` has no TSS history). The
  day one can be, the preview has to resolve Planned TSS through the same pure
  function first.
- `previewSeason` gains two reads (the placed Stock Workouts and the athlete's
  sessions over the season's span) and still writes nothing.
- A test pins preview = _Sesong_: approve unchanged, read the week through
  _Sesong_'s reader, and compare it with the preview's figure for that week,
  with at least one session the athlete already had in that week.
