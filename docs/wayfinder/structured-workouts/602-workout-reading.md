# The Workout Reading: the locked interface

The resolution asset for the ticket *Lock the Workout Reading interface* (#602)
on the map *structured workouts everywhere* (#600). It was locked with the
owner on 2026-10-19. Method: `/codebase-design` *Design It Twice*, with four
parallel designs (minimal, flexible, most common caller, shared timeline).
They are kept in `602-designs/`, and this file is the hybrid that won. Code
references are to `b0e81ba`.

## Entry points

The module is `app/utils/workout-reading.ts`. It is pure and isomorphic: no
I/O, no clock and no locale, so it runs in presenters and on the client.

```ts
readWorkout(workout: ReadableWorkout, thresholds: DisciplineThresholdMap): WorkoutReading
readRecording(intervals: readonly ActivityIntervalInput[], thresholds: DisciplineThresholdMap,
              plan?: WorkoutReading): WorkoutReading
```

`ReadableWorkout` is structural, so the stored row tree, a `WorkoutStructure`
and the editor's draft all fit. A draft without ids gets positional ids
(`b0s1`). `thresholds` is **required**: a silent default is how today's
readers drifted apart. A caller that can't load thresholds has a bug to fix.

There is no `extend()`, no options argument, no `readTarget` and no
`orNull`/`valueOr` helper. The editor's chip reads the draft as a workout.

## Types

```ts
type Provenance = 'authored' | 'generated' | 'convention' | 'detected' | 'measured' | 'unstated'

type Unavailable = {
  kind: 'unavailable'
  code: UnavailableCode              // typed; words come from labels.ts at the surface
  class: 'unresolved'                // something was authored but can't be read → hatched
       | 'unstated'                  // nothing was authored → neutral
       | 'not-applicable'            // strength, Simple Activity → fixed look
  fix: 'training-settings' | null    // only when entering a threshold would cure it
}
type UnavailableCode =
  | 'no-intensity' | 'unreadable-target' | 'no-threshold' | 'no-zone-system'
  | 'label-not-in-recipe' | 'no-pace' | 'unknowable-rest' | 'vertical-unsupported'
  | 'strength' | 'simple-activity' | 'below-gate' | 'no-steps'

type Reading<T> = { kind: 'value'; value: T; provenance: Provenance } | Unavailable

type DurationSource = 'authored' | 'paced' | 'estimated' | 'measured'
type Duration =
  | { kind: 'value'; sec: number; source: DurationSource; provenance: Provenance }
  | (Unavailable & { nominalSec: number })   // drawing width only, never summed

type Total =
  | { kind: 'value'; value: number; complete: boolean; missing: StepKey[] }
  | Unavailable                              // only when no step has a value

type StepRole = 'warm-up' | 'work' | 'recovery' | 'cool-down' | 'steady'

type StepKey = {                             // what an Activity Interval maps to (#603)
  stepId: string | null                      // null for a synthetic rest
  blockId: string
  repIndex: number                           // flat over blockRepeatTotal: 0…38 for 3 × 13
  slot: 'step' | 'seriesRest' | 'sendOffRest'
}

type ExecutedStep = {
  index: number                              // = position in steps[]; all refs use it
  key: StepKey
  blockIndex: number; blockName: string | null
  series: { index: number; of: number } | null
  kind: 'cardio' | 'rest' | 'strength'
  synthetic: null | 'between-series-rest' | 'send-off-residual'
  discipline: Discipline
  role: Reading<StepRole>
  target: IntensityTarget | null             // plan: parsed authored target
  measured: MeasuredAverages | null          // recording: interval averages
  range: Reading<ResolvedRange>              // resolved live, never from the cached columns
  zone: Reading<TrainingZone>                // recipe band: what the athlete sees (ADR 0045 §3)
  canonicalZone: Reading<TrainingZone>       // pctToZone: what readers compare (ADR 0035)
  duration: Duration
  distanceM: Reading<number>
  startSec: Reading<number>                  // unavailable after the first unknown duration
  planned: number | null                     // recording only: index into plan.steps
}

type RepeatBracket = { startIndex: number; span: number; count: number; level: 'rep' | 'series' }

type WorkoutReading = {
  origin: 'plan' | 'recording'
  form: 'structured' | 'simple-activity' | 'strength' | 'empty'
  summary: {                                 // 27 of 36 call sites stop here
    duration: Total                          // seconds, synthetic rests included
    distance: Total                          // metres, authored or measured only
    zone: Reading<TrainingZone>              // hardest work step's zone
    effort: Reading<EffortWord>              // authored Effort Word first, else from zone
    headline: number | null                  // index of the step that names the session
  }
  steps: ExecutedStep[]                      // execution order
  brackets: RepeatBracket[]
  work: { hardest: number | null; mainSet: MainSet | null }
  notices: Unavailable[]                     // distinct reasons, first-occurrence order
}

type MainSet = {
  blockIndex: number
  workIndices: number[]                      // every work rep, all series
  reps: number; series: number               // reps = seriesRepeatCount × repeatCount
  recoveryPerRepSec: Reading<number>
  betweenSeriesRestSec: Reading<number> | null
  channel: 'power' | 'pace' | 'heartRate' | null
}
```

The output is plain data with no methods or closures, so a loader can send it
to the client unchanged.

## Invariants

1. **Total.** The reader never throws on stored data. Malformed JSON gives
   `unreadable-target`. A legacy bare string is read as a zone label.
2. **No zeros.** Every number is a value or `Unavailable`. A nominal width is
   a drawing weight and never enters a `Total`.
3. **Never `intent`.** `Workout.intent` is read only to recognise
   `simple-activity`, never for zone. A step with no target is `no-intensity`,
   with class `unstated`.
4. **Order.** Blocks come by `orderIndex`, then series, then reps, then steps by
   `orderIndex`. A between-series rest follows each series except the last. A
   send-off residual follows each rep's work step.
5. **One placement function** gives `zone` and `canonicalZone` from the same
   ratio for plan and recording. The ratio is the **midpoint** of a range:
   `zoneEquivalent` already does this (`zone-equivalent.ts:195`). Today
   `readMainSet` reads `minW` for power but `minSecPerKm` for pace
   (`read-structure.ts:155-170`), which is the low end for one and the fast end
   for the other. Some archetypes will reclassify, and the PR says so.
6. **Canonical labels missing from the recipe** (`Z2`, `threshold` on
   `daniels-pace-5`) go through `bandForZone` with provenance `convention`.
   `bandForZone` moves from `plan-outline/volume-conversion.ts` to `zones/`.
7. **Units.** Pace is converted to m/s inside, in one place, so swim's
   per-100 m can't be read as per km.
8. **Durations, in order:** authored → `paced` (distance ÷ the step's own
   target speed) → `estimated` (the athlete's band pace for the step's zone,
   strength set estimates, a distance rest at recovery pace) → unavailable with
   `nominalSec`. `toHr`/`act` rest is `unknowable-rest`. `verticalM` is
   `vertical-unsupported`.
9. **Totals.** `value` is the sum of known durations. `complete` is true only
   when `missing` is empty. Surfaces write an incomplete total as `≥ 34 min`.
10. **Roles.** A block-name synonym in EN or NB (`warm-up`/`warmUp`/`wu`/
    `oppvarming`/`innjogg`, `cool-down`/`coolDown`/`cd`/`nedjogg`/`utjogg`)
    gives `authored`. A rest step gives `recovery`, the main set's hardest step
    gives `work`, an easier flank block before or after the main set gives
    `warm-up`/`cool-down`, and a single-step workout gives `steady`, all with
    `convention`. A synthetic rest is `recovery` with `convention`.
11. **Work.** `hardest` is the highest `zone`; ties go to the longer step, then
    the earlier. The headline is the `work` step with the most time × reps, and
    is never a warm-up or cool-down while a work step exists. The main set is
    the block with the most reps (`blockRepeatTotal`, so 39, not 13).
12. **Recording.** Duration is `measured`. Zone is read from the measured
    average through the same placement function, on the recipe anchor's
    channel when it was measured, otherwise power > pace > heart rate. Role
    comes from the interval when it has one (above the ADR 0033 gate, or a
    workout-step device lap); otherwise it is `below-gate`. `planned` is set
    when the interval's `StepKey` is in `plan`.
13. **Pure.** The same input always gives a structurally equal output.

## Who reads what

| Today's reader | Becomes |
|---|---|
| `sumBlockDurationMin/DistanceM`, `prescribedTotal`, `prescribedSeconds`, `totalsOf` | `summary.duration` / `summary.distance` |
| `deriveSessionProfile`, `deriveShapeStrip`, the telemetry planned bands | The Profil component takes the reading |
| `sessionZone`, `readEffortWord`, `isKeySession`, the title's intensity word | `summary.zone` / `summary.effort` |
| `zoneEquivalent`, `intensityTargetToZone` in the notation | `steps[i].zone` of the draft's reading |
| `sessionMetricTarget` | `steps[summary.headline]` |
| `readMainSet`, `structureAdherence` (`ZONE_ORDINALS` go) | `work.mainSet` + `canonicalZone` |
| `computePlannedTss` | A fold over `steps` in `load/`; the formulas stay there |
| `readPlacement`'s `'rolig'` fallback | Removed; it handles `unavailable` |

The cached `WorkoutStep.intensity*` columns stop being read and retire in the
same release.

## Rollout (owner, 2026-10-19)

- **One release, one Load Recompute Notice** (ADR 0006). Every reader moves
  at once, rather than leaving screens that disagree with each other in
  between. Planned TSS changes: swim gets 10× shorter, and series and send-off
  rests are counted.
- **Today's stamped share days.** They are one step without a zone, so they
  would draw hatched. *Give the autopilot's quality days a real shape* (#606)
  re-stamps the non-past, unedited generated days in the same migration. Past
  days stay hatched, honestly.

## First test file: the findings §3 disagreements

| Input | Reading |
|---|---|
| `powerPct 88–94`, Coggan | zone 4 and canonical 4 (midpoint 91 %), everywhere |
| `hrBpm 160`, LTHR 170 | zone = the HR recipe's band, canonical 4 (94 %); never null when LTHR is set |
| `pace 4:00`, T 4:00 | zone 4 (Daniels `T` declares 4), effort *hard*; no `'rolig'` |
| One token, chip vs facet | Both read the same `steps[i].zone` |
| `15′ Z2 + 6×(1 km @3:40 + 90″) + 10′ Z1` | Reps `paced` 220 s; 56 min `complete`; headline = the 1 km rep |
| `3 × (13 × 30/15)` + 6′ between series | 39 reps + 2 synthetic rests = 2475 s; brackets `3 ×` over `13 ×`; `mainSet.reps` 39 |
| Swim step with `pace` | 100 m at 1:40 = 100 s, not 1000 s |
| `Z2`/`threshold` on `daniels-pace-5` | `bandForZone` → E / T, `convention`; a default runner gets a pace range |

Second test file: the seven worst cases on the #601 canvas.

## Handed on

- **Decide the Activity Interval model (#603):** the mapping key is `StepKey`,
  which is the #601 key plus `slot`, because synthetic rests have no step. A
  stored `stepId` dangles after an edit or `copyWorkout` (SET NULL, as on
  `ExerciseSetLog`), and then reads as unplanned.
- **Give the autopilot's quality days a real shape (#606):** re-stamp the
  non-past, unedited generated days.
- **`raceAnchorPacesFor`** has no callers, so `racePace` stays `no-threshold`
  until `getDisciplineThresholds` loads race anchors. That's a fix outside
  the reader.
