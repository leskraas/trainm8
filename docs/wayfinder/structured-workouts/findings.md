# Structured workouts everywhere — charting findings

Research asset for the wayfinder map _Structured workouts everywhere_. Written
2026-10-19 from eight read-only subagent sweeps of the repo at `b0e81ba` plus
one web sweep. Every claim carries a `file:line`; the ones the charting session
re-checked by hand are marked ✔.

## 1. The model today

```
WorkoutSession (hub, ADR 0004) — source authored|generated|recorded|detected
 ├─ workout?   → Workout ─< WorkoutBlock ─< WorkoutStep ─< ExerciseSet     PLAN
 ├─ recording? → ActivityImport (totals, lapsJson {startSec,endSec},
 │                phaseBarsJson, ActivityStream, WorkoutDetection.structureJson)  ACTUAL (cardio)
 ├─< ExerciseSetLog (keyed sessionId+stepId, SET NULL)                          ACTUAL (strength)
 └─ sessionLog? (text + RPE)
```

- Relational to the step, JSON leaves: `intensity`, `rest`, `sendOff`, `load`,
  `effortCap` (`prisma/schema.prisma:546-630`, `:814-880`).
- Canonical in-memory shape: `WorkoutStructureSchema`
  (`app/utils/workout-schema.ts:632`); all writes through `buildBlocksCreate`
  / `buildBlocksCopy` / `copyWorkout` (`app/utils/workout.server.ts:117,230,302`).
- Four overlapping "what kind of session" fields: `intent` (15 values, mixes
  zones/archetypes/strength goals, `workout-schema.ts:52`), `archetype` (16,
  FK-pinned to `CatalogueEntry`), `strengthGoal` (written once, read nowhere),
  `activityKind` (4, Simple Activities). `'simple-activity'` sits outside
  `WORKOUT_INTENTS` on purpose.
- Step role (warm-up/work/recovery/cool-down) exists only as free-text
  `WorkoutBlock.name` (`schema.prisma:548`). The corpus names it consistently
  (`warmUp`/`coolDown`/`wu`/`cd`); the writing line maps `oppvarming`/`nedjogg`
  to `Z1` and drops the role (`workout-sentence.ts:155-161`).

## 2. Write paths and whether they carry structure

| Path | Entry | Structure |
|---|---|---|
| Editor new/edit | `sessions.new.tsx:113`, `workout.server.ts:1434,1320` | yes; intensity optional per step (`workout-schema.ts:405`) |
| Day stamp on empty day | `day-stamp.ts:84` | one step `45 min · Z2` |
| Writing line | `day-stamp.server.ts:112` → `parseWorkoutSentence` | partial — `10 km` gets no intensity |
| Copy / catalogue place / copy week / replan move | `day-stamp.server.ts:173`, `catalogue.server.ts:464`, `copy-week.server.ts:112`, `week-replan-proposals.server.ts:624` | as source |
| Season generation | `plan-generation/generate.server.ts:568` | copies stock rows — **none in prod** (below) |
| **Week Pattern stamp, bare share day** (autopilot, first run, relays) | `plan-outline/stamp.server.ts:690-707` via `horizon-fill.server.ts`, `first-run/plan.server.ts:175`, `open-ended.server.ts:523` | **one step of volume, no intensity**; zone lives only in `Workout.intent` |
| Simple Activity | `simple-activity.server.ts:19` | one time step, no intensity (ADR 0015) |
| Strength program session | `strength-program.server.ts:1307` | yes (sets with kg) |
| **Import, no plan match** (ADR 0049) | `activity-import.server.ts:420-445` | **no Workout** (`workoutId null`, `source recorded`) |
| Structure detection materialise | `workout.server.ts:1501,1558,1625` | yes above the gate; `intent: 'endurance'` hard-coded (`:1517,:1579`) |

There is **no export** of planned structure anywhere (no FIT/ZWO writer, no
push); see map _agent-native trainm8_ W2 / ADR 0097.

## 3. Read paths — about fifteen readers, four zone semantics

`expandWorkoutSteps` (`session-profile.ts:191`) calls itself the single source
of truth; around it sit ~15 readers:

| Reader | file:line | thresholds? | note |
|---|---|---|---|
| `deriveSessionProfile` / `intensityTargetToZone` | `session-profile.ts:279,127` | no | uses `minPct`; absolute pace/HR/W → null; intent fallback per step |
| `zoneEquivalent` | `zone-equivalent.ts:167` | yes | recipe band midpoint |
| `deriveShapeStrip` | `shape-strip.ts:223` | yes | distance→time via pace |
| `structureAdherence` / `ZONE_ORDINALS` | `structure-adherence.ts:238,67` | no | own 7-step ladder |
| `sessionMetricTarget` | `intensity-target.ts:524` | yes | headline = longest `durationSec × reps` step |
| `readEffortWord` | `effort-word.ts:40` | no | hardest bar |
| `sessionZone` | `plan-outline/session-zone.ts:44` | no | intent only when no step zone |
| `readMainSet` | `archetype-classification/read-structure.ts:71` | yes | canonical `pctToZone` (ADR 0035); ignores `seriesRepeatCount` (`:120`) |
| `isKeySession` | `load/session-nudge.ts:116` | no | no intent fallback |
| `sumBlockDurationMin/DistanceM` | `dashboard.ts:55,83` | no | partial sums |
| `prescribedTotal` | `plan-outline/week-pattern.ts:429` | no | all-or-nothing |
| `prescribedSeconds` | `routes/training/__workout-detail-summary.ts:199` | no | all-or-nothing |
| `totalsOf` / `intentOf` | `workout-sentence.ts:1373,1358` | no | own logic |
| `computePlannedTss` | `load/planned-tss.ts:183` | yes | distance→time via resolved pace only |
| `scaleStepQuantities` (writer) | `load/week-replan.ts:171` | no | scales warm-up and reps alike |

Thresholds (`DisciplineThresholdMap`, loaded by `getDisciplineThresholds`,
`training.server.ts:2066`) and the resolver are **pure and isomorphic**, so a
single reader can run in presenters and on the client.

### Concrete disagreements

| Input | Reader A | Reader B |
|---|---|---|
| `powerPct 88–94 %`, Coggan | `intensityTargetToZone` → 3 (Home, effort word) | `zoneEquivalent` → 4 (editor) |
| `hrBpm 160`, LTHR 170 | session-profile → null | zone-equivalent → 3; `readMainSet` → 4 |
| `pace 4:00/km`, T-pace 4:00 | Shape, effort word, sessionZone → null → **`readPlacement` falls back to `'rolig'`** (`session-placement.ts:51`) ✔ | zone-equivalent → 4 |
| One token, one call | `workout-notation.ts:970` chip = zoneEquivalent | `:973` facet = intensityTargetToZone |
| `15 min Z2 + 6×(1 km @3:40 + 90 s) + 10 min Z1` | `sumBlockDurationMin` = 34 min | `prescribedTotal` = null; reps 0-width in Shape; **headline target = the warm-up** |
| `3 × (13 × 30/15 s)` + 6 min between series | arithmetic 39 passes | adherence/title/notation show 13; **no reader adds `betweenSeriesRestSec`** |
| Swim step with `pace` (sec/km) | zone-equivalent ÷10 for CSS | **shape-strip and planned TSS treat sec/km as sec/100 m → 10× too long** |
| Run labels `Z2`/`threshold` on default `daniels-pace-5` (E/M/T/I/R) | `resolveIntensity` exact match → "not found in recipe" → **no pace range for a default runner** | `bandForZone` (`volume-conversion.ts:482`) already maps canonical zone → band |

Other: `raceAnchorPacesFor` (`performance-result.server.ts:67`) has no callers
so `racePace` never resolves; no reader handles `verticalM`; the cached
`WorkoutStep.intensity*` columns are written only on a threshold change
(`athlete.server.ts:314` → `recomputeIntensityRanges`) ✔, so sessions created
after the last change have no target bands on the row or telemetry overlay.

## 4. The actual side

- `lapsJson` keeps only `{startSec,endSec}` (`activity-telemetry.server.ts:88`);
  Strava lap distance/elapsed, intervals.icu `WORK|RECOVERY` + `icu_groups`,
  FIT `lap.wkt_step_index`/`intensity`/`avg_cadence` are all dropped. The only
  reader is `detect-job.server.ts:148,170`.
- Original FIT bytes are now kept (`ActivityFile`, `ingest-fit.server.ts:122`),
  so FIT laps can be backfilled.
- `ActivityStream` holds `timeSec`, `power`, `heartrate`, `pace` only, ≥5 s,
  ≤1000 samples (ADR 0020); pace is a mean of sec/km.
- Detection runs for run/bike only (`structure-detection/types.ts:23`). The
  engine has a real per-segment array (`segments.ts:27`) and collapses it in
  `mine.ts` (reps averaged, recovery from the first rep only `:337-343`,
  warm-up/cool-down merged `:122`).
- `ExerciseSetLog` already is a strength execution layer (stepId SET NULL,
  ordinal) — the pattern to copy.
- Prior blueprint: `docs/research/interval-detection-and-data-platform.md`
  §1.5 (`ActivityInterval`: role, shape, origin `detected|device-lap|user|peak`,
  base + overlay), §1.6 (mapping, not verdict).

## 5. Bugs that are wrong today regardless of this map

1. ✔ New Strava activities never queue detection or phase bars: webhook create
   (`strava/webhook.server.ts:312`), sync (`sync.server.ts:96`), backfill
   (`backfill.server.ts:150`) → `ingestActivityStreams` → `persistActivityStream`
   (`strava/ingest.server.ts:468`), skipping `enrichImportTelemetry`.
2. TCX laps are stored as `TcxLapMarker[]` (`tcx-parser.server.ts:186`) and
   fail the detector's `{startSec,endSec}` parse (`detect-job.server.ts:57-71`),
   so TCX detection is always stream-only.
3. Swim `pace` steps are 10× too long in the Shape Strip and Planned TSS.
4. Canonical zone labels don't resolve on pace-band recipes (`zones/resolve.ts:300-309`).
5. Headline target picks the warm-up when reps are distance-quantified
   (`intensity-target.ts:524`).
6. `betweenSeriesRestSec` and `sendOff` residual rest are missing from every total.
7. ✔ The endurance catalogue (`catalogue-corpus.{run,bike,swim}.ts`, 126 rows)
   ships in no migration — only strength does
   (`20260818120000_…`, `20261017185741_…`) — so placement and season
   generation copy nothing in production unless it was seeded by hand.
8. ✔ The `WorkoutDetection` schema comment says nothing populates it; the
   detection job does.

## 6. ADRs this effort touches

| ADR | Action |
|---|---|
| 0091 §1 ("no intensity target is invented") | **amend** — stamped days store a real shape in the athlete's recipe band |
| 0034 §2, 0020 (no per-step) | **amend** — allow the executed→planned mapping, keep refusing the verdict |
| 0032 (structureless below the bar) | **amend** — every recording gets Activity Intervals; roles only above the gate |
| 0049 (Auto-Save Mirror = structureless) | clarify — intervals hang off the import, not a Workout |
| 0007 | additive — step role (derived first) |
| 0055, 0035, 0019, 0008, 0002, 0015, 0056, 0027, 0044 §7, 0033, 0098 | depend on, unchanged |
| 0020 (5 s grid) | in-scope fog — superseded by a full-resolution tier if short reps need it |

## 7. Decisions taken while charting (owner, 2026-10-19)

1. Destination is a spec: one deep reader + an execution layer + structured
   write paths. The map produces decisions, not code.
2. The guarantee lives in the **reader's output**; storage holds what was
   authored or measured.
3. Stamped share days **store** warm-up + work in the athlete's recipe band
   (`bandForZone`) + cool-down, sized by `MINUTES_IN_ZONE_PER_SESSION`
   (`volume-conversion.ts:82`); Planned TSS then prices them. Amends 0091 §1.
4. Recording-only sessions get no Workout; every recording with a stream or
   laps gets Activity Intervals (one whole-session interval below the gate).
5. Planned vs actual per step is a mapping without a verdict.
6. Step role is derived in the reader first; the writing line writes block
   names; a stored column only if overrides are needed.
7. Simple Activities stay one timed step without a zone.
8. Out of scope: export to the watch, physically merging the four kind fields,
   strength execution.
9. Today's bugs become separate `ready-for-agent` issues.
