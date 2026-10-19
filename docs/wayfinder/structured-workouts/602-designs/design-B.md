# Design B: the Workout Reading as an extensible reading pipeline

**Constraint:** keep the core fixed while consumers, recordings, stored role overrides, disciplines and target kinds get added. The core is a short pipeline: **Source adapter → expansion → role rules → target readers → facet providers → summaries**. Every stage after the source is a typed table the caller can extend. `readWorkout` is the default reader, built with the default tables.

## 1. Interface

```ts
// app/utils/workout-reading.ts — pure, isomorphic, no I/O
export type Provenance = 'authored' | 'generated' | 'convention' | 'detected' | 'measured' | 'unstated'

/** Typed reason. Wording happens once, in wordReason(), never at the call site. */
export type UnavailableReason =
  | { code: 'missing-threshold'; discipline: Discipline; threshold: ThresholdName }
  | { code: 'no-zone-system'; discipline: Discipline }
  | { code: 'label-not-in-recipe'; label: string; recipeId: string }
  | { code: 'not-on-zone-axis'; why: 'strength' | 'neuromuscular' | 'simple-activity' | 'rest' }
  | { code: 'no-target' } | { code: 'no-quantity' }
  | { code: 'rest-unknowable'; rest: RestSpec }        // toHr, act, ...
  | { code: 'depends-on'; stepKey: StepKey; inner: UnavailableReason } // sendOff residual
  | ExtensionReason                                     // open: interface merge, see §1.4

export type Reading<T, B = Basis> =
  | { kind: 'value'; value: T; provenance: Provenance; basis?: B }
  | { kind: 'unavailable'; reason: UnavailableReason }

export type Basis = { rule: string; recipeId?: string; band?: string; substituted?: boolean; approximate?: boolean }

export type DurationSource = 'authored' | 'paced' | 'estimated' | 'measured'
/** Unavailable duration still carries a nominal width for drawings. Totals never sum it. */
export type DurationReading =
  | { kind: 'value'; value: number; source: DurationSource; provenance: Provenance; basis?: Basis }
  | { kind: 'unavailable'; reason: UnavailableReason; nominalSec: number }

export type StepKey = string // `${stepId}@${occurrence}` or `syn:${kind}:${blockIndex}:${n}`; stable across reads
export type StepOrigin = 'authored' | 'synthetic:betweenSeries' | 'synthetic:sendOffResidual' | 'synthetic:whole'

export interface StepRoles { warmUp: 1; work: 1; recovery: 1; coolDown: 1; betweenSeries: 1; steady: 1; whole: 1 }
export type StepRole = keyof StepRoles                  // open via declaration merging

export type ReadStep = {
  key: StepKey
  stepId: string | null                                 // null for synthetic steps
  origin: StepOrigin
  address: { blockIndex: number; seriesIndex: number; repIndex: number; occurrence: number; stepIndex: number | null }
  kind: 'cardio' | 'rest' | 'strength'
  discipline: Discipline
  role: Reading<StepRole>                               // never unavailable in practice: worst case 'steady'/'unstated'
  target: IntensityTarget | null                        // authored (plan) or measured-as-target (execution)
  zone: Reading<TrainingZone>                           // recipe band primary (ADR 0045 §3)
  range: Reading<ResolvedRange>                         // concrete pace/power/hr, `approximate` → ≈
  duration: DurationReading
  distanceM: Reading<number>
  startSec: Reading<number>                             // unavailable after the first unknown duration
  facets: StepFacets                                    // canonicalZone and every later facet
  plannedRef?: { plannedStepId: string; plannedRepIndex: number; provenance: Provenance } // execution side
  measured?: MeasuredValues                             // execution side only
}
export interface StepFacets { canonicalZone: Reading<TrainingZone> } // ADR 0035 pctToZone; open

export type RepeatGroup = {                             // a tree: series contains reps
  level: 'series' | 'reps'; count: number
  firstIndex: number; span: number                      // indices into steps[], synthetic rests included
  blockIndex: number; children: RepeatGroup[]
}

export type Total = { kind: 'value'; value: number; complete: boolean; missing: StepKey[]; provenance: Provenance }
                  | { kind: 'unavailable'; reason: UnavailableReason }

export type WorkoutReading = {
  side: 'plan' | 'execution'
  shape: 'structured' | 'simpleActivity' | 'strength' | 'empty'
  discipline: Discipline
  steps: readonly ReadStep[]                            // execution order
  groups: readonly RepeatGroup[]
  totals: { durationSec: Total; distanceM: Total; workSec: Total; restSec: Total }
  work: { hardest: StepKey | null; headline: StepKey | null; mainSet: RepeatGroup | null }
  reasons: readonly UnavailableReason[]                 // deduped, so a surface says each one once
  summaries: WorkoutSummaries                           // open, filled by SummaryProviders
  step(key: StepKey): ReadStep | undefined
}
export interface WorkoutSummaries {}                    // e.g. effortWord, plannedTss register here
```

### 1.1 Entry points

```ts
export function createWorkoutReader(config?: ReaderConfig): WorkoutReader
export const defaultReader: WorkoutReader
export const readWorkout = defaultReader.read         // readWorkout(workout, thresholds, ctx?)
export const readRecording = defaultReader.readRecording
export function alignReadings(plan: WorkoutReading, done: WorkoutReading): StepAlignment[]
export function wordReason(r: UnavailableReason, locale?: 'nb' | 'en'): string

export interface WorkoutReader {
  read(w: WorkoutSourceInput, t: DisciplineThresholdMap, ctx?: ReadContext): WorkoutReading
  readRecording(r: RecordingInput, t: DisciplineThresholdMap, ctx?: ReadContext): WorkoutReading
  extend(config: ReaderConfig): WorkoutReader           // derive a reader; the parent stays unchanged
}
export type WorkoutSourceInput = PersistedWorkout | WorkoutStructure | NotationInput // structural types
export type ReadContext = { overrides?: StepOverrides; now?: never }                // overrides are data
export type StepOverrides = Record<string /*stepId*/, { role?: StepRole }>          // future stored column

export type ReaderConfig = {
  sources?: SourceAdapter[]                             // add a new input shape
  roleRules?: { before?: RoleRule[]; after?: RoleRule[] }
  targets?: Partial<TargetReaderMap>                    // replace one IntensityTarget kind's reader
  disciplines?: Partial<Record<Discipline, DisciplineRules>>
  facets?: FacetProvider[]
  summaries?: SummaryProvider[]
  synonyms?: Partial<Record<StepRole, string[]>>        // block-name vocabulary, EN+NB
}
```

### 1.2 Extension tables (the *only* things a caller can add)

```ts
type SourceAdapter<I = unknown> = { accepts(i: unknown): i is I; toTree(i: I): SourceTree }
type RoleRule = (c: RoleContext) => Reading<StepRole> | null      // first non-null wins
type TargetReaderMap = { [K in IntensityTarget['kind']]: TargetReader<Extract<IntensityTarget, { kind: K }>> }
type TargetReader<T> = {
  representative(t: T, c: TargetContext): Reading<{ channel: Channel; ratio: number }>  // ratio to the recipe anchor
  range(t: T, c: TargetContext): Reading<ResolvedRange>
  speedMps(t: T, c: TargetContext): Reading<number>               // for distance→time; units hidden here
}
type DisciplineRules = { paceUnitM: 1000 | 100; defaultSpeed(p: Profile): Reading<number>; onZoneAxis: boolean }
type FacetProvider<K extends keyof StepFacets = keyof StepFacets> = { key: K; read(s: ReadStepCore, c: TargetContext): StepFacets[K] }
type SummaryProvider<K extends keyof WorkoutSummaries = keyof WorkoutSummaries> = { key: K; read(r: CoreReading, t: DisciplineThresholdMap): WorkoutSummaries[K] }
```

`TargetReaderMap` is a mapped type over the schema union. If someone adds a target kind to `IntensityTargetSchema` and gives it no reader, the build fails. That is the compile-time guarantee that a new target kind can't quietly read as null.

### 1.3 Invariants

1. **Order.** `steps` follow blocks by `orderIndex`, then series, then reps, then steps by `orderIndex`. A synthetic `betweenSeries` rest goes after every series except the last. A `sendOffResidual` rest goes after every rep's work, including the last; it carries `role` = `recovery` with provenance `convention`.
2. **Keys.** `key` is stable for the same input and unique within a reading. `occurrence = seriesIndex × repeatCount + repIndex` is the `plannedRepIndex` that executions map to.
3. **No zeros.** Any number that isn't known is `unavailable` with a reason. Strength and rest steps have `zone` = `not-on-zone-axis`. `Workout.intent` is never read for zone. It doesn't even appear in `PersistedWorkout`'s picked fields.
4. **Zone.** `zone` is the recipe band the target's representative ratio falls in, using the band's declared zone, with `substituted` recorded in `basis`. `facets.canonicalZone` is `pctToZone(ratio × 100)` on the same ratio. Both come from one `representative()` call, so they can differ only by table, never by input. A canonical label (`Z2`, `threshold`) that isn't in the recipe goes through `bandForZone`.
5. **Duration ladder.** authored → `paced`: distance ÷ speed, where speed is the target's `speedMps`, else the discipline's `defaultSpeed` from threshold or CSS → `estimated`: strength sets, the Planned-TSS-style estimate → unavailable with `nominalSec`. Speed is always m/s inside, so `paceUnitM` lives in one place.
6. **Totals.** `value` is the sum of known durations. `complete` is true when `missing` is empty. A total is `unavailable` only when nothing is known. Nominal widths never count.
7. **Work.** `hardest` is the step with the highest `zone`, with ties going to longer. `headline` is the `work`-role step with the most effective time (duration × occurrences of its step), falling back to `hardest`. `mainSet` is the outermost group that holds the most `work`-role occurrences.
8. **Purity.** `read` is total (it never throws on stored data), deterministic, and has no clock, DB or locale. Text comes only from `wordReason`.

### 1.4 Error modes

Bad intensity JSON doesn't throw. It reads as `target: null` with `zone` set to `{ code: 'no-target' }` and a `reasons` entry. A legacy bare label is parsed as `zoneLabel`. A source no adapter accepts is the only throw (`UnknownWorkoutSource`), and that is a programming error. `ExtensionReason` is `{ code: \`x:${string}\`; data?: unknown }`. Extensions must namespace their codes, and `wordReason` falls back to a generic sentence for codes it doesn't know.

## 2. Usage

```ts
// Profil drawing (#601 "A · Profil")
const r = readWorkout(session.workout, thresholds)
r.steps.map(s => ({
  width: s.duration.kind === 'value' ? s.duration.value : s.duration.nominalSec,
  dashedTop: s.duration.kind !== 'value' || s.duration.source !== 'authored',
  zone: s.zone.kind === 'value' ? s.zone.value : null,
  hatched: s.kind === 'cardio' && s.zone.kind === 'unavailable',
  track: s.kind === 'strength' ? 'strength' : 'cardio',
}))
r.groups.filter(g => g.level === 'reps' || g.level === 'series')   // `6 ×` brackets, nested
caption(r.reasons.map(x => wordReason(x)))                           // reason said once
if (r.shape === 'simpleActivity') drawNeutralBar(r.totals.durationSec)

// Planned TSS: registered as a summary, so the TSS formulas stay in load/
const tssReader = defaultReader.extend({ summaries: [plannedTssSummary(profiles)] })
tssReader.read(w, thresholds).summaries.plannedTss // Reading<number> & { confidence }
// plannedTssSummary walks steps: duration.value × formula(range midpoint); a missing step → partial

// Headline target and Effort Word
const s = r.work.headline && r.step(r.work.headline)
const headline = s ? formatRange(s.range) : null                   // 1 km @3:40, not the warm-up
const effort = workout.effortWord ?? (r.work.hardest && zoneWord(r.step(r.work.hardest)!.zone))

// Archetype readMainSet: an adapter over the reading, in the canonical scale
const m = r.work.mainSet
const reps = m && r.steps.slice(m.firstIndex, m.firstIndex + m.span)
  .filter(x => x.role.kind === 'value' && x.role.value === 'work')
  .map(x => ({ durationSec: x.duration, zone: x.facets.canonicalZone }))  // 39 reps for 3×13

// Totals in the session summary
const t = r.totals.durationSec
t.kind === 'value' ? `${t.complete ? '' : '≥ '}${fmtMin(t.value)}` : null

// Planned vs done
const plan = readWorkout(session.workout, thresholds)
const done = readRecording(session.recording.intervals, thresholds)
for (const a of alignReadings(plan, done))   // { plan: ReadStep | null, done: ReadStep | null }
  if (a.plan && a.done) drawDashedOutline(a.plan, over(a.done))   // keyed by plannedStepId + plannedRepIndex

// Future stored role override: no change to the core
readWorkout(w, t, { overrides: { [stepId]: { role: 'work' } } })   // provenance 'authored'
```

## 3. What the implementation hides

- Two input shapes for one workout: Prisma rows with intensity as JSON strings and legacy labels, and parsed `WorkoutStructure`/`NotationInput` drafts. Both are adapters onto one `SourceTree`. With the recording as a third, that makes three adapters, so the seam is real.
- `blockRepeatTotal` and the series/rep split, and placement of synthetic steps, including the `sendOff` residual. That residual is `intervalSec` or (CSS + allowance) × distance/100, minus the work duration. If its input is unavailable, it is unavailable as `depends-on`.
- The role rules in order: override (`authored`), block-name synonyms (`wu`, `warmUp`, `oppvarming`, `cd`, `coolDown`, `nedjogg`, … → `convention`), a rest step means `recovery`, the easier step inside a repeated block means `recovery`, and flank position means a single-step block before or after the main set that is easier than it becomes `warmUp`/`coolDown`. Everything else is `work` (`convention`) or `steady` (`unstated`).
- The resolver (`resolveIntensity`), recipes (`getRecipe`, `bandForZone`, `bucketRatio`), pace inversion, `pacePct` reciprocity, `powerPct` refs, lactate bands, `racePace` anchors, and swim's per-100 m pace.
- Deduplicating reasons, stable keys, and the cumulative `startSec`.

## 4. Dependency strategy

Everything is pure and in-process: thresholds come in as a value (`getDisciplineThresholds` stays the loader in `training.server.ts`), and recipes are code. There are no ports. The extension tables are plain values merged in `extend()`. They are dependency injection by data, not interfaces over I/O. Stored overrides and Activity Intervals are loaded by the caller and passed in as data, so the reader never touches Prisma, and the client runs the same reader. The existing modules (`zone-equivalent`, `session-profile`'s expansion, `read-structure`'s `resolveZone`) are folded into the default `TargetReaderMap` and become private. Their callers move to `readWorkout`.

**Recordings (open question 11): same `ReadStep`, same reader.** `readRecording` has an `ActivityInterval[]` adapter. Each interval becomes one `ReadStep` with `duration.source = 'measured'`. Its measured average is turned into a target (`{ kind: 'pace', minSecPerKm: avg }`, `hrBpm`, `power`) and goes through the same `TargetReaderMap`, so plan and done get one zone meaning. That removes today's HR-on-Coggan-power bucketing (`recording-profile.ts:56`). `role` is the stored or detected role, or `unstated` below the detection gate (one `synthetic:whole` interval). `plannedRef` comes from the stored mapping. The cost is a few fields that mean less on that side (`target` is derived, `groups` are empty unless the detection groups them). That is the price of one drawing component and one `alignReadings`, instead of two shapes and an adapter between them.

## 5. Trade-offs

**Where leverage is high.** All ~15 readers in findings §3 become projections over one `steps[]`. Each extension case lands in one table:

| Change | Lands in |
|---|---|
| New consumer | a summary or facet provider, or plain code over `steps` |
| Recordings | a source adapter |
| Stored role overrides | `ctx.overrides`, read by the first role rule |
| New discipline (e.g. `ski`) | a `DisciplineRules` entry |
| New target kind | a `TargetReaderMap` entry, which the compiler forces |

**Where it is thin, and the costs.**
- `extend()` lets two surfaces build readers that disagree. Mitigation: config is allowed only in a module (`app/utils/readers.ts`), never in a route, and a test asserts that every registered reader gives the same `zone` as the default.
- Open interfaces (`StepFacets`, `WorkoutSummaries`, `StepRoles`) weaken exhaustiveness for consumers.
- Eager facets cost work on 41-bar phone renders. That should be cheap, but it hasn't been measured.
- The `Reading` wrapper makes every caller unwrap. A tiny `valueOr(reading, fallback)` would invite zeros, so it isn't provided. Callers branch instead.

**Findings §3 disagreements under this design.** Each row is a first test case.

| Input | Resolution |
|---|---|
| `powerPct 88–94`, Coggan | One `representative()`: midpoint 0.91 falls in Coggan Z4 (declared zone 4). `canonicalZone` is `pctToZone(91)` = 4. Home, the Effort Word and the editor all say 4. `readMainSet` moves from `minPct` to the midpoint, and that change is flagged in its PR. |
| `hrBpm 160`, LTHR 170 | Ratio 0.94 falls in the athlete's HR recipe band, giving one `zone`. `canonicalZone` is 4. The `null` from session-profile is gone. With no LTHR, both are `missing-threshold lthr`. |
| `pace 4:00`, T 4:00 | Ratio 1.0 falls in `daniels-pace-5` T, giving zone 4 everywhere. With no T-pace it is `unavailable`. `readPlacement` must handle that case instead of defaulting to `'rolig'`, because the type no longer offers a null to fall back on. |
| Chip vs facet (`workout-notation.ts:970/973`) | Both read `step.zone`. There is one call. |
| `15′ Z2 + 6×(1 km @3:40 + 90″) + 10′ Z1` | Reps are `paced` from the target's own speed: 3:40 per rep, no threshold needed. The total is 56 min with `complete: true`. Reps get dashed tops, not 0 width. `headline` is the 1 km rep (role `work`), not the warm-up. |
| `3×(13×30/15)` + 6′ between series | 78 authored occurrences (39 work + 39 rest) plus 2 `synthetic:betweenSeries` steps. The groups are series 3 ⊃ reps 13. The total is 39×45 + 2×360 = 2475 s. The main set holds 39 reps. |
| Swim `pace` | `DisciplineRules.swim.paceUnitM = 100`, and speed is m/s inside, so the 10× bug can't be written. |
| `Z2`/`threshold` on `daniels-pace-5` | The label isn't in the recipe, so the canonical label goes through `bandForZone`: E, or T. `range` is a value, and `basis` has `substituted: false`, or true with the band named. The default runner gets a pace range. |
