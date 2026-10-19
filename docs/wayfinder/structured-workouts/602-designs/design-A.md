# Design A — the Workout Reading, minimal interface (two entry points)

Commitment: **two entry points, one output type.** `readWorkout` reads a plan,
`readRecording` reads Activity Intervals into the *same* `WorkoutReading`. No
options bag, no projection helpers, no per-question functions. A caller learns
one data type and folds it; every hard rule (zone, duration, role, synthetic
rest, headline, totals) is decided once, behind the seam. The output is plain
serialisable data (no methods, no closures), so a presenter can compute it and
a loader can ship it to the client unchanged.

## 1. Interface (`app/utils/workout-reading.ts`)

```ts
export function readWorkout(
  workout: WorkoutInput | null,          // persisted row tree OR editor draft (structural)
  thresholds: DisciplineThresholdMap,    // getDisciplineThresholds(), already isomorphic
): WorkoutReading

export function readRecording(
  intervals: readonly ActivityIntervalInput[], // future Activity Interval rows, any order
  thresholds: DisciplineThresholdMap,
  plan?: WorkoutReading,                 // when given, each step resolves its planned counterpart
): WorkoutReading

// ---- provenance and the honest number --------------------------------------
export type Provenance = 'authored' | 'generated' | 'convention' | 'detected' | 'measured' | 'unstated'

export type Unavailable = {
  kind: 'unavailable'
  code: UnavailableCode
  /** unresolved = something was authored but cannot be read (draw hatched);
   *  unstated = nothing was authored (draw neutral);
   *  not-applicable = the question has no answer here (strength: track colour). */
  class: 'unresolved' | 'unstated' | 'not-applicable'
  say: string                 // nb human words, e.g. "Terskelfart mangler i innstillingene"
  fix?: { threshold: ThresholdName; discipline: CardioDiscipline } // fixable in Training Settings
}
export type UnavailableCode =
  | 'no-threshold' | 'no-zone-system' | 'label-not-a-zone' | 'no-lactate-band'
  | 'no-intensity' | 'unknowable-rest' | 'no-pace' | 'vertical-unsupported'
  | 'malformed' | 'strength' | 'simple-activity'

export type Reading<T, S extends Provenance = Provenance> =
  | { kind: 'value'; value: T; source: S }
  | Unavailable

// ---- the step -----------------------------------------------------------------
export type StepRole = 'warm-up' | 'work' | 'recovery' | 'cool-down' | 'steady' | 'between-series'
export type DurationSource = 'authored' | 'paced' | 'estimated' | 'measured'

export type ReadStep = {
  index: number                 // position in reading.steps; all cross-references use it
  key: string                   // stable: `${stepId}#${repIndex}`; draft: `b${i}.s${j}#${rep}`;
                                // synthetic: `${blockKey}~series#${s}` | `${stepKey}~sendoff`
  stepId: string | null         // null for synthetic steps and recording intervals
  repIndex: number              // 0-based over seriesRepeatCount × repeatCount
  series: { index: number; of: number } | null
  blockIndex: number
  blockName: string | null
  kind: 'cardio' | 'rest' | 'strength'
  synthetic: null | 'between-series-rest' | 'send-off-residual'
  discipline: Discipline
  role: Reading<StepRole>       // authored (block-name synonym) | convention (position/rest) | detected
  target: IntensityTarget | null        // authored, parsed once; null on a recording
  measured: MeasuredAverages | null     // null on a plan
  display: DisplayTarget | null         // headline text ("4:00–4:10 /km", "Z2 · rolig")
  zone: Reading<TrainingZone>           // recipe band (ADR 0045 §3) — what the athlete sees
  canonicalZone: Reading<TrainingZone>  // pctToZone of channel ratio (ADR 0035) — what readers compare
  duration: Reading<number, DurationSource> & { widthSec: number } // widthSec = value, or NOMINAL_WIDTH_SEC
  distanceM: Reading<number, 'authored' | 'paced' | 'measured'>
  offsetSec: number             // Σ widthSec before this step: the drawing axis, a clock
                                // only while every earlier duration is a value
  planned: number | null        // recording only: index into `plan.steps` (plannedStepId+plannedRepIndex)
}

export type RepeatBracket = {
  startIndex: number; span: number; count: number
  level: 'rep' | 'series'       // `3 × (13 × …)` gives one series bracket over three rep brackets
}

export type Total = { value: number; complete: boolean; missing: number } // value = Σ of known parts

export type WorkoutReading = {
  origin: 'plan' | 'recording'
  form: 'structured' | 'simple-activity' | 'strength' | 'empty'
  steps: ReadStep[]             // execution order, repeats unrolled, synthetic rests inserted
  brackets: RepeatBracket[]
  totals: { durationSec: Total; distanceM: Total; workSec: Total }
  work: {
    hardest: number | null      // highest zone (tie: longer, then earlier); null if no zone resolves
    headline: number | null     // the step that names the session (see §3)
    mainSet: MainSet | null
  }
  notices: Unavailable[]        // distinct reasons, first-occurrence order — "said once in text"
}

export type MainSet = {
  blockIndex: number
  workIndices: number[]         // every work rep, all series
  reps: number                  // seriesRepeatCount × repeatCount
  series: number
  recoveryPerRepSec: Reading<number, DurationSource>
  betweenSeriesRestSec: Reading<number, 'authored'> | null
  channel: 'power' | 'pace' | 'heartRate'
}
```

Recording input (hypothetical until the execution layer ships):
`ActivityIntervalInput = { id; startSec; endSec; discipline; distanceM?; avgPowerW?;
avgHr?; avgPaceSecPerKm?; role?: { value: StepRole; source: 'detected' | 'authored' };
plannedStepId?: string | null; plannedRepIndex?: number | null }`.

**Invariants.**
1. Total: never throws on stored data. Malformed JSON → `unavailable/malformed`; a
   legacy bare string is read as a `zoneLabel` (as `parseAuthoredIntensity` does).
2. No zeros: every number is a value or an `Unavailable`. `widthSec` is the one
   always-present number and is a drawing weight, never summed into `totals`.
3. Never reads `Workout.intent`. A step with no target has `zone.class = 'unstated'`.
4. `steps[i].index === i`; `brackets`, `work`, `planned` refer by index; indices are
   valid only within the reading that produced them.
5. Ordering: blocks by `orderIndex`, then series, then reps, then steps by
   `orderIndex`; a `between-series-rest` follows each series but the last; a
   `send-off-residual` follows each work step of a send-off block.
6. `totals.*.complete` is true iff no contributing step is unavailable; `missing`
   counts the unavailable ones. `workSec` sums steps whose role is `work`.
7. Same inputs → structurally equal output (pure; no clock, no IO, no randomness).
8. `readRecording` steps always have `duration.source = 'measured'`; `zone` comes
   from `measured` through the same recipe/canonical rules; `target` is null.
9. `planned` is null when `plan` is absent or the interval's key is not in it.

## 2. Usage

```ts
// Profil drawing (#601 A) — the whole decision tree is four lines of style
const r = readWorkout(workout, thresholds)
r.steps.map(s => ({
  x: s.offsetSec, w: s.duration.widthSec,
  h: s.zone.kind === 'value' ? ZONE_H[s.zone.value] : REST_H,
  fill: s.zone.kind === 'value' ? 'zone' : s.zone.class === 'unresolved' ? 'hatched'
      : s.zone.class === 'not-applicable' ? 'track' : 'neutral',
  dashedTop: s.duration.kind === 'unavailable' || s.duration.source !== 'authored',
}))
r.brackets.map(b => bracket(b.startIndex, b.span, `${b.count} ×`))
caption(r.notices[0]?.say)        // reason said once, not per bar
// Simple Activity: form 'simple-activity', one step, zone class 'unstated' → one neutral bar.

// Planned TSS — a fold; the reader owns duration, swim units, series rest, resolution
let tss = 0, missing = 0
for (const s of r.steps) {
  if (s.kind !== 'cardio' && !s.synthetic) continue
  const t = s.duration.kind === 'value' && s.display ? priceStep(s, profiles) : null // formulas.ts
  t == null ? missing++ : (tss += t)
}
// confidence = missing ? 'partial' : 'full'; synthetic rests price at their zone or 0-stress by formula

// Headline target / Effort Word
const h = r.work.headline != null ? r.steps[r.work.headline] : null
const headline = h?.display ?? null                    // replaces sessionMetricTarget
const hz = r.work.hardest != null ? r.steps[r.work.hardest].zone : null
const word = hz?.kind === 'value' ? effortWordOfZone(hz.value) : null // stored Effort Word read first, outside

// Archetype readMainSet — geometry and canonical zones come pre-read
const m = r.work.mainSet
const reading = m && {
  reps: m.workIndices.map(i => ({ durationSec: val(r.steps[i].duration),
                                  zone: val(r.steps[i].canonicalZone) })),
  recoverySec: val(m.recoveryPerRepSec) * m.reps, channel: m.channel, durationCV: null, grade,
}

// Totals in the session summary
const d = r.totals.durationSec
text = d.complete ? fmtMin(d.value) : d.value > 0 ? `≥ ${fmtMin(d.value)}` : '—'

// Planned vs done outline
const plan = readWorkout(session.workout, thresholds)
const done = readRecording(intervals, thresholds, plan)
done.steps.forEach(s => {
  drawSolid(s)                                        // same Profil code path as the plan
  if (s.planned != null) drawDashedOutline(plan.steps[s.planned], over(s)) // no verdict
})
```

## 3. What the implementation hides

- Expansion (`expandWorkoutSteps`, `deriveRepeatGroups`) with both repeat levels,
  and insertion of synthetic `betweenSeriesRestSec` and send-off residual steps
  (cycle − work, where cycle is `intervalSec` or `(CSS + allowance) × d/100`; unavailable without CSS or a paced work time).
- Parsing of `intensity` / `rest` JSON and legacy strings; ignores the stale cached
  `WorkoutStep.intensity*` columns and resolves from `thresholds` at read time.
- Zone: `zoneEquivalent`'s recipe-band logic (declared zone first, position only
  where the band declares none, midpoint ratio); canonical labels (`Z2`,
  `threshold`) missing from the recipe go through `bandForZone` with source
  `convention`; `canonicalZone` is `pctToZone(midpoint ratio)` on the target's own
  channel (run power on CP, swim pace on CSS, bpm on LTHR) — `readMainSet`'s rule.
- Duration: authored seconds; distance via the step's resolved pace (`paced`), or
  via threshold pace × the zone's band (`estimated`); pace kept internally as
  sec/m so swim is per 100 m by construction; strength via `SECONDS_PER_REP` /
  `AMRAP_SET_SEC` (`estimated`); `toHr`/`act` rest → `unknowable-rest`; vertical →
  `vertical-unsupported`.
- Role: block-name synonyms EN+NB (`warmUp`, `wu`, `oppvarming`, `coolDown`, `cd`,
  `nedjogg`, …) → `authored`; rest steps → `recovery`; the main set's hardest step
  → `work`; leading/trailing easier flank blocks → `warm-up`/`cool-down`
  (`convention`); a single-step workout → `steady`.
- Main set: the block with most reps (`blockRepeatTotal`, so 39 not 13); headline =
  the main set's work step, else the longest `work`-role step by paced/authored
  time × reps, never a warm-up/cool-down while a work step exists.
- Notices: dedupe of reasons via `nbUnavailableReason`; `fix` only where Training
  Settings can actually fix it (the `unresolvedThresholdReasons` rule).
- Recording: interval sort, role pass-through, measured-average zoning, and the
  `plannedStepId#plannedRepIndex` → plan index join.

## 4. Dependency strategy

All in-process and pure: `workout-schema` (types, `blockRepeatTotal`,
`restStepSpec`), `zones/*` (`resolveIntensity`, `getRecipe`), `bandForZone`,
`pctToZone`, `formatIntensityTarget`, `labels`. No ports, no injected strategies:
thresholds are already data, loaded server-side by `getDisciplineThresholds`
(which must add `raceAnchorPaces`) and shipped to the client. Tests run against
the two entry points with literal fixtures; the §3 disagreement table is the first
table-driven test file. `ReadStep` has two producers (plan, recording), so the
step type is a real seam, not a hypothetical one. The old readers become one-line
adapters over the reading during migration, then go.

## 5. Trade-offs

**High leverage.** Every one of the ~15 readers collapses into a field access or
a short fold; the drawing rules from #601 fall out of `zone.class` and
`duration.source` with no knowledge of targets, recipes or units. Two entry points
mean a new caller has nothing to choose; planned-vs-done reuses the Profil code
path because both sides are the same type.

**Thin / costs.**
- Over-computation: a caller wanting one bit (`isKeySession`, the Effort Word)
  pays for the whole reading — O(unrolled steps), ~80 for a 39-rep series; cheap,
  and memoisable by the caller since it is pure. Acceptable; flagged if lists of
  hundreds of sessions render on the client.
- Planned TSS stays outside: load formulas and `preferCogganTss/preferRTSS` are
  not reading. The fold is short but every load consumer must write it the same;
  if a second one appears, that is the signal for a third entry point
  (`priceReading`), not for options on these two.
- One shape for plan and recording carries nullable halves (`target` vs
  `measured`, `planned`). Provenance tells them apart; the price is a wider type.
- No options means nb-only `say` words and fixed nominal widths; another locale
  would change the module, not the call.
- Synthetic steps lack a `stepId`, so v1 Activity Intervals cannot map to a
  between-series rest; they read as unplanned until intervals store a step key.

**Position on readRecording:** same step type. The drawing, totals and main-set
summary are identical questions of a plan and of a recording; a separate shape
would duplicate them and reopen the disagreement problem on the done side.

**The §3 disagreements under this design**

| Input | Resolves to |
|---|---|
| `powerPct 88–94`, Coggan | `zone` 4 (band at midpoint 91 %), `canonicalZone` 4 (midpoint); Home, effort word (*hard*) and editor all read the same field |
| `hrBpm 160`, LTHR 170 | `zone` = athlete's HR-recipe band (3 on Friel), `canonicalZone` 4 (94 %); no null — two named facets, not two answers to one question |
| `pace 4:00`, T 4:00 | `zone` 4 (Daniels `T` declares 4), `canonicalZone` 4; `readPlacement` gets a value, the `'rolig'` fallback is dead code |
| one token, chip vs facet | both read `steps[i].zone`; there is only one |
| `15 min Z2 + 6×(1 km @3:40 + 90 s) + 10 min Z1` | reps `paced` 220 s; total 56 min `complete`; widths non-zero, dashed top on reps; headline = the 1 km rep |
| `3 × (13 × 30/15)` + 6 min | 39 work reps, 2 synthetic rests, total 2475 s; brackets `3 ×` over `13 ×`; `mainSet.reps` 39 |
| swim step with `pace` | duration from sec/m: 100 m at 1:40/100 m = 100 s, not 1000 s |
| `Z2`/`threshold` on `daniels-pace-5` | `bandForZone` → `E` / `T`, source `convention`; pace range resolves for a default runner |
