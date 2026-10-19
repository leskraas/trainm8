# Design D: one segment sequence for plan and recording

**Constraint.** A Workout Reading is a time-ordered sequence of **Reading Segments**.
A planned Workout and a recording's Activity Intervals both produce it, through two
adapters (`readWorkout`, `readRecording`) onto one seam. The drawing, the totals,
the work summary and the planned-vs-done mapping all take that one type. There is
one zone function and one totals function, and every one of the ~15 readers in
findings §3 becomes a consumer of the same value.
(Naming: GLOSSARY says not to call the Workout Shape a "timeline", so the type is
`WorkoutReading`/`ReadingSegment`. It is unrelated to the detection engine's
internal `Segment`, `segments.ts:27`.)

## 1. Interface (`app/utils/workout-reading.ts`)

```ts
export type Provenance = 'authored' | 'generated' | 'convention' | 'detected' | 'measured' | 'unstated'
export type UnavailableCode =
  | 'no-target' | 'unreadable-target' | 'no-zone-system' | 'no-threshold'      // fixable: settings when anchor known
  | 'label-not-in-recipe' | 'no-pace-for-distance' | 'unknowable-rest'         // toHr / act rest
  | 'vertical-unpriced' | 'simple-activity' | 'strength-track' | 'below-gate' | 'no-channel' | 'no-steps'
export type Unavailable = { kind: 'unavailable'; code: UnavailableCode; words: string /* nb, labels.ts */; fixInSettings: boolean }
export type Reading<T> = { kind: 'value'; value: T; source: Provenance } | Unavailable

export type DurationSource = 'authored' | 'paced' | 'estimated' | 'measured'
/** 'nominal' is unavailable by construction: a nominal width can only be used for drawing. */
export type Duration =
  | { kind: 'value'; sec: number; source: DurationSource }
  | (Unavailable & { nominalSec: number })            // drawing width only, never summed

export type SegmentRole = 'warmUp' | 'work' | 'recovery' | 'coolDown' | 'steady' | 'pause' | 'other'
export type Channel = 'power' | 'pace' | 'heartRate' | 'rpe' | 'label' | 'lactate'

export type SegmentIntensity = {
  channel: Channel | null
  /** Recipe band, primary (ADR 0045 §3). Declared zone first; `substituted` when bandForZone had to substitute. */
  zone: Reading<TrainingZone>
  band: Reading<{ recipeId: string; label: string; substituted: boolean }>
  /** pctToZone on the ratio (ADR 0035): the archetype reader's facet. */
  canonicalZone: Reading<TrainingZone>
  /** Fraction of the anchor threshold, in the *speed* domain for pace. Plan: target midpoint. Recording: measured mean. */
  ratio: Reading<{ value: number; anchor: ZoneAnchor }>
  /** Concrete values: plan = resolved target range, recording = measured mean (min === max). */
  range: Reading<{ min: number; max: number | null; unit: 'W' | 'secPer100m' | 'secPerKm' | 'bpm' }>
}

export type PlanKey = { stepId: string; repIndex: number; slot: 'step' | 'seriesRest' | 'sendOffRest' }

export type ReadingSegment = {
  id: string                       // plan: `${stepId}#${repIndex}` / `${blockId}~series${k}` ; recording: intervalId
  index: number
  discipline: Discipline
  role: Reading<SegmentRole>
  startSec: Reading<number>        // plan: value only while every earlier duration is a value
  duration: Duration
  distanceM: Reading<number>
  intensity: SegmentIntensity
  origin:
    | { side: 'plan'; key: PlanKey; blockId: string; seriesIndex: number; target: IntensityTarget | null; synthetic: boolean }
    | { side: 'recording'; intervalId: string; interval: IntervalOrigin; planned: PlanKey | null }
}

export type RepeatGroup = { startIndex: number; span: number; repeatCount: number; level: 'rep' | 'series'; source: Provenance }
export type Total = { kind: 'value'; value: number; complete: boolean; missing: string[] /* segment ids */ } | Unavailable

export type MainSet = {
  groupIndex: number
  channel: Channel | null
  reps: { segmentId: string; durationSec: Reading<number>; zone: Reading<TrainingZone>; canonicalZone: Reading<TrainingZone> }[]
  recoverySec: Total                // incl. synthetic series and send-off rest
  durationCV: Reading<number>       // plan: from authored reps; recording: from the reps as done
}

export type WorkoutReading = {
  side: 'plan' | 'recording'
  kind: 'structured' | 'simple-activity' | 'strength' | 'unstructured' | 'empty'
  segments: ReadingSegment[]
  groups: RepeatGroup[]
  totals: { durationSec: Total; distanceM: Total; workSec: Total }
  work: { hardest: Reading<string>; headline: Reading<string>; mainSet: MainSet | null }   // segment ids
  /** Each distinct reason, once, in segment order: the text under a hatched drawing. */
  reasons: Unavailable[]
}

export function readWorkout(workout: ReadableWorkout, thresholds: DisciplineThresholdMap): WorkoutReading
export function readRecording(recording: ReadableRecording, thresholds: DisciplineThresholdMap): WorkoutReading
export function mapPlanned(plan: WorkoutReading, done: WorkoutReading): PlannedMapping
export type PlannedMapping = {
  pairs: { done: ReadingSegment; plan: ReadingSegment | null }[]   // in done order
  unvisited: ReadingSegment[]                                     // plan segments no interval maps to
}
```

`ReadableWorkout` is structural: `{ discipline, intent?, effortWord?, blocks: { id?, name?, orderIndex?, repeatCount, seriesRepeatCount?, betweenSeriesRestSec?, sendOff?, steps: {…stored or authored fields} }[] }`.
It accepts the Prisma row, a `WorkoutStructure` and the editor's `NotationInput`. Missing ids become positional (`b0s1`).
`ReadableRecording = { discipline, totals: { elapsedSec, movingSec?, distanceM? }, intervals: IntervalLike[] | null, gate: DetectionGrade | null }`.
Each `IntervalLike` carries `startSec`, `endSec`, `role?`, `origin`, `parentGroupId?`, `plannedStepId?`, `plannedRepIndex?`, `plannedSlot?` and `metrics?` (mean power, speed, HR).

**Invariants**
1. Ordering: plan segments come in block `orderIndex` order → series → rep → step `orderIndex`. A `sendOffRest` follows each rep and a `seriesRest` follows every series except the last. Recording segments are sorted by `startSec`, never overlap, and cover `[0, elapsedSec)`; gaps become `pause` segments with `source: measured`.
2. `intensity.zone` never comes from `Workout.intent`, the intensity of neighbouring steps, or population defaults. The same `(channel, ratio, profile)` gives the same zone on both sides, because one function places both.
3. A `Duration` of kind `unavailable` never enters a `Total`. When it is left out, `complete: false` and its id goes into `missing`. A Total is `unavailable` only when no segment has a value.
4. `groups[i]` spans exactly the segments its block or interval group expanded into. Series groups contain rep groups.
5. `reasons` is deduplicated by `code` + `words`. Every `Unavailable` on a segment also appears there.
6. `PlanKey.repIndex` is a flat index over `blockRepeatTotal` (0…38 for `3 × 13`), and `seriesIndex = floor(repIndex / repeatCount)`.

**Error modes.** The module is total and never throws on stored data. Unparseable intensity JSON gives `unreadable-target`. A workout with no blocks gives `kind: 'empty'`, no segments, and every Total `no-steps`. A recording without intervals or metrics gives one whole-session segment whose zone is `no-channel`. `mapPlanned` called with two plans, or a plan key the plan does not contain (the step was edited away), gives `plan: null`. It does not throw.

## 2. Usage

```ts
// Profil drawing: one component, both sides
const r = readWorkout(session.workout, thresholds)        // or readRecording(import, thresholds)
r.segments.map(s => ({
  width: s.duration.kind === 'value' ? s.duration.sec : s.duration.nominalSec,
  dashedTop: s.duration.kind !== 'value' || !['authored', 'measured'].includes(s.duration.source),
  fill: s.discipline === 'strength' ? 'track' : s.intensity.zone.kind === 'value' ? `z${s.intensity.zone.value}` : 'hatched',
  height: s.intensity.zone.kind === 'value' ? s.intensity.zone.value : null,
}))
r.groups.filter(g => g.level === 'rep').map(g => bracket(g, `${g.repeatCount} ×`))
caption(r.reasons[0]?.words)                               // said once
// kind 'simple-activity' → one neutral bar (zone code simple-activity). A recording below the gate → one segment,
// role unavailable (below-gate), zone from its measured mean: the same render path.

// Planned TSS: the expansion, pacing and swim units are no longer its business
const parts = plan.segments.map(s => s.duration.kind === 'value' && s.intensity.ratio.kind === 'value'
  ? tssFor(s.intensity.ratio.value.anchor, s.duration.sec, s.intensity.ratio.value.value, s.intensity.range, dp) : null)
// confidence 'partial' iff some cardio segment is null; null iff none contribute

// Headline target / effort word
const h = r.work.headline.kind === 'value' ? seg(r, r.work.headline.value) : null
formatIntensityTarget(h.origin.target, thresholds[h.discipline])         // plan side
const hard = r.work.hardest.kind === 'value' ? seg(r, r.work.hardest.value).intensity.zone : null
effortWord = workout.effortWord ?? (hard?.kind === 'value' ? effortWordOfZone(hard.value) : null)

// Archetype readMainSet → reads MainSet directly; canonicalZone, all 39 reps, and a real durationCV
readMainSetFromReading(r.work.mainSet, grade)

// Session summary totals
const t = r.totals.durationSec
t.kind === 'unavailable' ? '—' : t.complete ? fmtMin(t.value) : `minst ${fmtMin(t.value)}`

// Planned vs done: the plan as a dashed outline over each executed segment it maps to
for (const { done, plan } of mapPlanned(readWorkout(w, th), readRecording(imp, th)).pairs)
  drawSolid(done); if (plan) drawOutline(done /* x, width */, plan.intensity.zone /* height */)
```

## 3. Hidden behind the seam
- Expansion: block order, two repeat levels, flat rep index, and the synthetic `seriesRest`/`sendOffRest` (residual = send-off cycle − paced swim time; anchored send-off = CSS + allowance per 100 m).
- Parsing stored targets, including legacy bare labels (`parseAuthoredIntensity`).
- **One placement function** `place(channel, value | target, profile)`. Recipe-anchor shortcuts for `%`, `pacePct` reciprocal and lactate bands; otherwise resolve to concrete values (`resolveIntensity`) → ratio → recipe band with declared zone first, then `pctToZone` for `canonicalZone`. Canonical labels (`Z2`, `threshold`) that the recipe lacks go through `bandForZone` with `substituted: true` and `source: convention`. Midpoint, not `minPct`, everywhere.
- Pacing: distance → time from the step's own pace target (`paced`), else the athlete's band pace for the step's zone (`estimated`), else unavailable with a nominal width. Swim pace is converted to sec/100 m in one place. Rest Spec forms: `time` is authored, `distance` is estimated at recovery pace, `act`/`toHr` are unavailable. Strength sets use the strip's estimate.
- Role derivation: EN+NB block-name synonyms (`warmUp/wu/oppvarming`, `coolDown/cd/nedjogg`, …), rest steps, the hardest step of the main set, an easier sibling as `recovery`, flank position. Recording side: interval role above the ADR 0033 gate or from a workout-step device lap, otherwise `below-gate`.
- Work summary rules: hardest = max zone. Headline = the `work`-role step with the largest summed duration, else `steady`, else any; ties go to the earliest. Main set = the group with the most reps.
- Recording channel choice: the recipe anchor's channel when measured, else power > pace (speed-domain mean) > HR. HR never sets edges.
- Norwegian reason words and their deduplication (`labels.ts`).

## 4. Dependencies and the two adapters
The module is pure and in-process. Its only inputs are the two `Readable*` values and the `DisciplineThresholdMap` that `getDisciplineThresholds` already loads. Recipes are code (`getRecipe`). Nothing touches the DB or the clock, so it runs in presenters and on the client.

```
readWorkout   ─┐  plan adapter: expand + pace + derive role       ─┐
               ├─→ RawSegment[] { role, duration, channel+value|target } ─→ core: place() · groups · totals · work · reasons
readRecording ─┘  recording adapter: intervals|whole-session + pauses ─┘
```
Both adapters are real, so the seam is real. The core sees one `RawSegment` and never asks which side it came from. Until the `ActivityInterval` table exists, `readRecording` adapts what is stored today: import totals plus one whole-session interval (decision §7.4), and detected structure once the engine emits per-rep segments. Tests run through the interface with plain values. The first test file is the disagreement table below, and the second is the seven worst cases from §9 (39 reps, swim on CSS, no thresholds, autopilot day, 41 bars, Simple Activity, strength).

## 5. Trade-offs

**High leverage.** There is one zone answer per `(channel, value)` on both sides, which removes the Block row "HR %LTHR on Coggan power cut-points" (`recording-profile.ts:56`). One expansion with synthetic rests means four duration readers become one `Total`. Planned TSS, the shape strip, `sessionMetricTarget`, `readEffortWord`, `sessionZone`, `isKeySession`, `structureAdherence` (its `ZONE_ORDINALS` go away), `dashboard.ts` sums, `prescribedTotal`/`prescribedSeconds` and `totalsOf` all shrink to short folds over `segments`. Because both sides are the same type, the planned-vs-done outline is a join on keys, and the drawing is one component with a `side` flag. The archetype reader gets per-rep recordings (a real `durationCV`), so the fartlek branch becomes reachable.

**Thin.** Planned TSS still needs a formula per anchor and the `prefer*` flags. The reader gives the ratio, not the load. Actual TSS comes from the stream (NP, rTSS over samples), not from segment means, so load does not get the symmetry. `scaleStepQuantities` is a writer and only gains role awareness by reading `role`. Strength gets segments for drawing and nothing more.

**Where the symmetry breaks (honestly).**
1. *Time.* Plan durations can have holes (`toHr`, `act`, `verticalM`) and nominal widths. Recording durations are always measured and contiguous, with `pause` segments that the plan never has. A plan's `startSec` dies at its first hole, while a recording's never does.
2. *Intensity.* A plan states a range in an authored channel (or RPE, label or lactate, which has no channel value). A recording has a mean in a channel the module chose. A mean of a below-gate 45/15 session hides everything. Plan and done can be zoned from different channels (plan @ HR, done by power). The outline shows this; it is not a comparison.
3. *Roles and groups.* On the plan side these always come from convention. On the recording side they are detected, or unavailable below the gate, and series-level groups are almost never detected.
4. *Identity.* Plan ids are derived (`stepId#rep`). An edit or `copyWorkout` makes new step ids, so a stored `plannedStepId` dangles (SET NULL, as with `ExerciseSetLog`) and maps to `null`. Synthetic rests have no step, so the #601 key needs a third column, **`plannedSlot`**. That is the one addition this design asks of the Activity Interval.
5. *Totals.* A recording's `durationSec` total must equal the import's elapsed time (the invariant), and moving time is `durationSec − pause`. The plan side has no notion of moving.
6. *Swim and strength execution.* There is no swim detection (lengths later) and strength execution is `ExerciseSetLog`, so `readRecording` returns `unstructured` or `kind: 'strength'` with no intensity.
7. *Regression on purpose.* Legacy autopilot days (one volume step, zone only in `intent`) read as hatched with `no-target`, and their effort word becomes null. Today they get an intent bar. Decision §7.3 fixes the data, not the reader.

**Findings §3 disagreements under this design**

| Input | Resolution |
|---|---|
| `powerPct 88–94`, Coggan | One `place()` at the 91 % midpoint gives `zone` 4 (Coggan band Z4) and `canonicalZone` 4. Home, effort word and editor agree. |
| `hrBpm 160`, LTHR 170 | ratio 0.94. `zone` = the HR recipe's band and `canonicalZone` = 4. Where they differ, they are two named facets, not two readers. Never null when LTHR is set. |
| `pace 4:00`, T 4:00 | ratio 1.0 gives Daniels `T`, declared zone 4. The effort word is *hard*, and `readPlacement` reads zone 4, so the `'rolig'` fallback is gone. |
| Notation chip vs facet | Both read `segment.intensity.zone` from the same reading of the draft. |
| `15′Z2 + 6×(1 km@3:40 + 90″) + 10′Z1` | Reps are paced at 220 s (dashed top). Total = 56 min, `complete`. Headline = the 1 km @ 3:40 because its role is `work`. |
| `3 × (13 × 30/15)` + 6′ | 78 step segments + 2 `seriesRest`. Groups are `3 ×` over `13 ×`. Main set has 39 reps and `recoverySec` includes 12′. |
| Swim `pace` | Converted to sec/100 m once, in pacing. The strip, TSS and totals get the same right length. |
| Run `Z2`/`threshold` on `daniels-pace-5` | Exact label miss → canonical zone → `bandForZone` (E, T) with `substituted`, `source: convention`. A pace range is there for a default runner. |

Also from §3: `raceAnchorPacesFor` still has no callers, so `racePace` stays `no-threshold` (honest, not fixed here). `verticalM` is unavailable with a nominal width. The reader computes ranges at read time, so the stale cached `WorkoutStep.intensity*` columns stop mattering.
