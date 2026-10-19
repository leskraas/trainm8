# Design C: the Workout Reading, built for the most common caller

Constraint: **the default case is trivial.** The three questions most callers ask are answered as
fields on the reading, already resolved: *how long*, *draw it*, *how hard*. Everything else
(steps, roles, main set, bands, ranges) stays one property deeper, so it is available without
getting in the way.

## 0. Caller-frequency count (non-test call sites, repo at HEAD)

| Question the caller asks | Today's readers (call sites) | Sites |
|---|---|---|
| **How long / how far** (session totals) | `sumBlockDurationMin` ×6 (session-review, training.ts, juster ×3, + distance twin), `sumBlockDistanceM` (row-content, session-review), `prescribedTotal` ×2, `prescribedSeconds`, `totalsOf` | **11** |
| **Draw it** (Workout Shape / bars / bands) | `deriveSessionProfile` (ledger rows, week-volumes, home presenter, telemetry), `deriveShapeStrip` (editor, session page), `expandWorkoutSteps` for planned bands + channel pick (telemetry ×2) | **9** |
| **How hard** (session zone / effort word / key) | `sessionZone` ×3 (training.server, stamp ×2), `readEffortWord` ×2 (placement, calm-today), `isKeySession`, title `intensityWord` | **7** |
| Zone of *one* Intensity Target (editor chip/facet/popover) | `zoneEquivalent` + `intensityTargetToZone` in notation ×2, popover | 3 |
| Headline target | `sessionMetricTarget` (home presenter, session page) | 2 |
| Main set / per-rep geometry | `readMainSet`, `structureAdherence` | 2 |
| Planned TSS | `readPlannedTss` | 1 |
| Raw step walk (eased-prescription compare) | `expandWorkoutSteps` in home presenter | 1 |

That is about 36 sites. **27 of them (75 %) ask one of three questions**, so those three are
top-level fields. The other 9 split across five rarer needs, and those go one level down.

## 1. Interface (`app/utils/workout-reading.ts`)

```ts
// ── Reading: a value or an honest absence (never a zero) ─────────────────────
export type Provenance = 'authored' | 'generated' | 'convention' | 'detected' | 'measured' | 'unstated'
export type Unavailable = {
  kind: 'unavailable'
  code: 'no-workout' | 'simple-activity' | 'strength' | 'no-intensity' | 'unreadable-target'
      | 'thresholds-not-loaded' | 'no-threshold' | 'no-zone-system' | 'label-not-in-recipe'
      | 'no-quantity' | 'unknowable-rest' | 'no-pace'
  words: string                    // nb sentence, said once by the surface
  fix: 'training-settings' | null  // only when entering a threshold would cure it
}
export type Reading<T> = { kind: 'value'; value: T; provenance: Provenance } | Unavailable
export const orNull = <T>(r: Reading<T>): T | null => (r.kind === 'value' ? r.value : null)

// ── Totals: a value that knows whether it is whole ───────────────────────────
export type DurationSource = 'authored' | 'paced' | 'estimated' | 'nominal'
export type Total = Reading<number> & ( { kind: 'unavailable' } | {
  kind: 'value'
  complete: boolean            // false ⇒ value is a floor; surfaces write "≥ 34 min"
  missing: Unavailable[]       // one per distinct reason the floor is short, deduped
  source: Exclude<DurationSource, 'nominal'> // weakest source that contributed
})

// ── Entry point 1: the one everyone calls ───────────────────────────────────
export function readWorkout(
  workout: ReadableWorkout | null,
  thresholds: DisciplineThresholdMap | null, // null = "I didn't load them", a distinct reason
): WorkoutReading

export type WorkoutReading = {
  kind: 'structured' | 'simple' | 'strength' | 'empty'
  // ▼ the default case: 27 of 36 callers stop here
  duration: Total                 // seconds, incl. synthetic rests
  distance: Total                 // metres, authored distances only (never inverted from pace)
  zone: Reading<TrainingZone>     // the session's zone = hardest work step's recipe-band zone
  effort: Reading<EffortWord>     // authored Effort Word first, else effortWordOfZone(zone)
  shape: Shape                    // drawing-ready "A · Profil" model
  headline: Headline | null       // the target a card shows (null: nothing authored)
  // ▼ reachable, not in the way
  work: WorkSummary
  steps: readonly ReadStep[]      // executed order, 1:1 with shape.bars
}

export type Headline = { step: ReadStep; display: DisplayTarget } // DisplayTarget from intensity-target.ts

export type Shape = {
  bars: readonly ShapeBar[]
  brackets: readonly { start: number; span: number; count: number; level: 'rep' | 'series' }[]
  note: string | null             // the one hatched/unavailable reason, said once in text
}
export type ShapeBar = {
  stepId: string                  // = steps[i].id
  widthSec: number                // > 0 always; NOMINAL_WIDTH_SEC when duration unavailable
  edge: 'solid' | 'dashed'        // dashed ⇔ durationSource ≠ 'authored'
  fill: { kind: 'zone'; zone: TrainingZone } | { kind: 'hatched' } | { kind: 'rest' }
      | { kind: 'neutral' } /* Simple Activity */ | { kind: 'track' } /* strength */
}

export type StepRole = 'warm-up' | 'work' | 'recovery' | 'cool-down' | 'steady' | 'rest'
export type ReadStep = {
  id: string                      // stepId | `${stepId}-r${repIndex}` | `b${i}-series-rest-${n}` | `b${i}-sendoff-${rep}`
  stepId: string | null           // null on synthetic steps
  repIndex: number                // 0-based across both repeat levels = future plannedRepIndex
  seriesIndex: number
  blockIndex: number
  synthetic: null | 'between-series-rest' | 'send-off-rest'
  kind: 'cardio' | 'rest' | 'strength'
  discipline: string
  role: StepRole; roleSource: 'named' | 'rest-step' | 'main-set' | 'flank' | 'synthetic'
  target: IntensityTarget | null  // parsed authored target
  zone: Reading<TrainingZone>     // recipe band's declared zone (ADR 0045 §3)
  canonicalZone: Reading<TrainingZone> // pctToZone of target midpoint (ADR 0035)
  band: { recipeId: string; label: string; substituted: boolean } | null
  range: ResolvedIntensity | null // concrete hr/power/pace, resolved live (not cached columns)
  durationSec: Reading<number>; durationSource: DurationSource
  distanceM: number | null
  startSec: number | null         // cumulative; null once any earlier step is unknown
  measured?: MeasuredFacet        // only on readRecording output (§1b)
  planned?: { stepId: string; repIndex: number } // only on readRecording output
}

export type WorkSummary = {
  hardest: ReadStep | null        // max zone among work steps; ties → longer, then earlier
  headline: ReadStep | null       // = headline.step
  mainSet: MainSet | null         // null when no block repeats
}
export type MainSet = {
  blockIndex: number; reps: number /* both levels */; series: number
  work: ReadStep                  // first-rep instance; canonicalZone feeds archetypes
  recoveryPerRepSec: Reading<number>; betweenSeriesRestSec: number | null
  steps: readonly ReadStep[]      // the slice of `steps` the block expands into
}

// ── Entry point 2: one target, outside a workout (editor chip, popover) ─────
export function readTarget(target: IntensityTarget, discipline: string,
  thresholds: DisciplineThresholdMap | null,
): Pick<ReadStep, 'zone' | 'canonicalZone' | 'band' | 'range'>

// ── Input: structural, so the row tree, an editor draft and a detection all fit ─
export type ReadableWorkout = {
  discipline: string; source?: 'authored' | 'generated' | 'recorded' | 'detected'
  intent?: string | null          // read ONLY to recognise 'simple-activity'; never for zone
  effortWord?: string | null
  blocks: readonly { id?: string; name?: string | null; orderIndex?: number
    repeatCount: number; seriesRepeatCount?: number | null
    betweenSeriesRestSec?: number | null; sendOff?: SendOff | string | null
    steps: readonly { id?: string; orderIndex?: number; kind: string; discipline?: string | null
      intensity?: IntensityTarget | string | null; durationSec?: number | null
      distanceM?: number | null; rest?: RestSpec | string | null; sets?: readonly unknown[]
      restBetweenSetsSec?: number | null }[] }[]
}
```

### 1b. Recording counterpart. Position: **same `ReadStep` type, same `WorkoutReading`**

```ts
export function readRecording(intervals: readonly ActivityIntervalInput[],
  thresholds: DisciplineThresholdMap | null, plan?: WorkoutReading): WorkoutReading
export function planOutline(plan: WorkoutReading, done: WorkoutReading):
  readonly { doneIndex: number; plannedStepId: string; plannedRepIndex: number; plannedWidthSec: number; plannedZone: Reading<TrainingZone> }[]
```

The callers of a recording ask the same top three questions: *how long was it, draw it, how hard
was it*. A separate shape would give those callers a second set of one-liners to learn. In a
recording reading, `zone` is read from the measured average (`provenance: 'measured'`), `headline`
is null, `role` is optional (it falls back to `'steady'` when the interval has no role), and
`durationSource` is `'authored'` because a measured duration is exact. A recording below the
detection gate gives one interval, which becomes one role-less step and one bar. `planOutline` is
the only part that knows both readings. It joins them on `planned.stepId + planned.repIndex`, which
is the same key `ReadStep.id` already uses. It returns a mapping only, with no verdict (ADR 0034).

### Invariants
- **Order**: blocks by `orderIndex` (array order if it is absent), then series, then reps, then
  steps by `orderIndex`. A send-off residual follows each rep except the last rep of a series. A
  between-series rest follows each series except the last.
- `shape.bars.length === steps.length`, and `shape.bars[i].stepId === steps[i].id`. Brackets index
  into both.
- `duration.value === Σ steps[i].durationSec` over the known steps. `complete` is true only when
  every step's duration is a value. Nominal width never enters a total.
- `zone` never reads `intent`. It is unavailable only when no work step resolves. When some work
  steps resolve and others do not, the value is the maximum of the resolved zones, and `shape.note`
  names the unresolved ones.
- **Error modes**: the function is total and never throws. Unparseable intensity JSON is read as a
  legacy zone label first; if that also fails, it gives `'unreadable-target'`. A `null` workout
  gives `kind:'empty'` with every Reading `'no-workout'`. Pure and isomorphic, with no I/O.

## 2. Usage

```ts
// Totals in the session summary (11 sites today → this)
const { duration, distance } = readWorkout(workout, thresholds)
minutes = duration.kind === 'value' ? Math.round(duration.value / 60) : null
prefix  = duration.kind === 'value' && !duration.complete ? '≥ ' : ''
// juster/training.ts that only want a number: orNull(readWorkout(w, t).duration)

// Headline target and effort word (I dag, Week, session page)
const r = readWorkout(session.workout, thresholds)
card.target = r.headline?.display ?? null
card.effort = orNull(r.effort)             // placement must handle null; no 'rolig' fallback
const isKey = (orNull(r.zone) ?? 0) > 2    // session-nudge

// Profil drawing (#601 A): the drawing only maps the model to pixels
<ProfileShape shape={readWorkout(workout, thresholds).shape} size="row" />
//   bar: flex-grow = widthSec; height/hue from fill.zone; dashed top if edge==='dashed';
//   hatched pattern for fill 'hatched'; brackets → `6 ×` (full size only); note → caption.

// Planned TSS: the formulas stay in planned-tss.ts and the reader supplies inputs
const r = readWorkout(workout, thresholds)
for (const s of r.steps) if (s.kind === 'cardio' && s.range && s.durationSec.kind === 'value')
  tss += stepTss({ discipline: s.discipline, durationSec: s.durationSec.value, ...mids(s.range), dp })
confidence = r.steps.some(s => s.target && !s.range) ? 'partial' : 'full'

// Archetype readMainSet
const m = readWorkout(workout, thresholds).work.mainSet
if (!m) return null
return { reps: Array.from({ length: m.reps }, () => ({ durationSec: orNull(m.work.durationSec),
  zone: orNull(m.work.canonicalZone) })), recoverySec: orNull(m.recoveryPerRepSec), … }

// Planned vs done outline (session page telemetry)
const plan = readWorkout(workout, thresholds)
const done = readRecording(intervals, thresholds, plan)
<ProfileShape shape={done.shape} outline={planOutline(plan, done)} />

// Editor chip / popover (one target, no workout)
const chipZone = orNull(readTarget(target, discipline, thresholds).zone)
```

## 3. What the implementation hides
- Parsing: intensity stored as a JSON string, a legacy bare label, or a parsed draft; `rest` and
  `sendOff` stored as JSON or as objects; strength `sets`.
- Ordering, both repeat levels (`blockRepeatTotal`), stable ids, and the synthetic between-series
  and send-off rests (a residual is `sendOff − rep work time`, unavailable if the work time is
  unknown).
- **Role derivation**: block-name synonyms (EN and NB: `warmUp/wu/oppvarming/innjogg`,
  `coolDown/cd/nedjogg/utjogg`), rest steps, main set membership, and flanks (an unnamed first or
  last block easier than the main set).
- **Zone**: recipe lookup, band membership of the target midpoint, canonical labels on non-Z
  recipes through `bandForZone` (with a `substituted` flag), lactate bands, the `pctToZone`
  canonical facet, and RPE as `convention`.
- **Units**: a swim `pace` target is converted from sec/km to sec/100 m once, at the parse. The
  resolver, durations and TSS inputs all see the same unit.
- **Durations**: authored first. A distance step is `paced` through its own resolved target, else
  `estimated` through its band or the discipline's threshold pace. Rest is `time`, or a distance or
  act through the surrounding pace (`estimated`); HR recovery is `unknowable-rest`. Strength is
  `estimated` (SECONDS_PER_REP / AMRAP_SET_SEC).
- **Headline**: among work-role cardio steps with a target, the longest by derived duration ×
  reps, ties to the earlier step. If there is no work role, it falls back to all targeted steps.
- Reason wording in nb (from `labels.ts`), deduped so the surface says each reason once.

## 4. Dependencies
In-process and pure. The module imports `workout-schema` (schemas, `blockRepeatTotal`,
`restStepSpec`), `zones/` (recipes, `resolveIntensity`), `intensity-target` (`formatIntensityTarget`
for the headline), `effort-word` (`effortWordOfZone`), and `bandForZone`, which should **move from
`plan-outline/volume-conversion.ts` into `zones/`** so the reader does not depend on plan-outline.
Thresholds are a value passed in. Loading stays at `getDisciplineThresholds` on the server, and
presenters pass the result down to the client. There are no ports: nothing to substitute, and tests
call it directly with literal workouts and thresholds. `readRecording` takes plain
`ActivityIntervalInput` literals until the execution layer exists. The old readers become thin
wrappers over the reading and are then deleted. `expandWorkoutSteps` is absorbed into the module.

## 5. Trade-offs

**High leverage.** `duration`/`distance` replace four totals implementations with three
answers between them, at 11 sites. `shape` replaces two shape derivations and a band walk (9
sites), and it guarantees the strip, the ledger bars and the telemetry overlay draw the same
steps. `zone`/`effort` replace five zone semantics with one (7 sites). A caller of the top three
needs to learn `readWorkout`, `orNull` and `complete`, and nothing else.

**Thin, on purpose.**
- `headline` serves 2 callers, `work.mainSet` 1, and Planned TSS 1. They sit on the reading
  because the hard logic behind them (role, derived duration) already lives here.
- `readTarget` is a small sibling. The editor needs a zone for a target that belongs to no workout
  yet.
- The cost of a fat output: every call computes every field, eagerly. This is cheap, because a
  workout has fewer than 200 steps, and a ledger of about 60 sessions is microseconds of work. The
  output is plain data and JSON-safe, so presenters can ship slices of it.
- The risk: callers reach for `steps` and rebuild an analysis the module already owns.
  `work.*` exists to absorb that pressure.
- Requiring a `thresholds` argument forces about 10 of today's threshold-free callers to load them.
  That cost is the fix: it is the reason they disagree today.
- **Rejected**: optional thresholds. A silent default is exactly how today's readers drifted
  apart.

**The findings §3 disagreement table under this design** (each row becomes a first test):

| Input | Resolves to |
|---|---|
| `powerPct 88–94`, Coggan | Every reader reads the band at the midpoint (91 %), giving **Z4** for both `zone` and `canonicalZone`. Home, effort word and editor agree. The rule changes from `minPct` to the midpoint. |
| `hrBpm 160`, LTHR 170 | `zone` is the declared zone of the HR recipe's band (no longer null). `canonicalZone = pctToZone(94) = 4`. Session profile, editor and archetype stop disagreeing on whether a zone exists at all. |
| `pace 4:00`, T 4:00 | **Z4**, effort `hard`. The `readPlacement` fallback to `'rolig'` loses its trigger: with `effort` unavailable, it must handle `null` explicitly. |
| Notation chip vs facet | Both read `readTarget(...).zone`, so there is one answer. |
| `15′ Z2 + 6×(1 km @3:40 + 90″) + 10′ Z1` | With threshold pace: 25′ + 6×(220 s paced + 90 s) = **56 min**, `complete`, `source:'paced'`, reps drawn with a dashed edge. Without thresholds: **≥ 34 min**, `complete:false`, `missing:[no-pace]`. The headline is the 1 km rep (work role), not the warm-up. |
| `3 × (13 × 30/15)` + 6′ between series | 39 reps and 2 synthetic rests: 39×45 + 2×360 = **2475 s**. `mainSet.reps = 39`, `series = 3`. Brackets `3 ×` (series) over `13 ×` (rep). |
| Swim step with `pace` | Normalised to sec/100 m at the parse, so the shape width and TSS duration are correct (the 10× bug is fixed in one place). |
| `Z2`/`threshold` on `daniels-pace-5` | Label not in the recipe, so it maps to a canonical zone, then `bandForZone`, giving the E or T band with `substituted:true`. The range resolves for a default runner. |

**Positions on the open points.** I chose `readRecording` returning the same type, because the
callers of a recording ask the same three questions (§1b). A step role is derived and comes with
`roleSource`, so a stored override column can come later without an interface change (`'stored'`
is added to `roleSource`). Not covered here: `verticalM` durations (`no-quantity` until a
vertical-pace exists), `racePace` (`no-threshold` until `raceAnchorPacesFor` has callers), and the
`scaleStepQuantities` writer (it should read roles from here, but it is a writer and stays outside).
