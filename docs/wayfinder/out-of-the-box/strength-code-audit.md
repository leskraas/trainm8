# Strength code audit — the state after slice 1 (`ExerciseSetLog`)

A read-only map of the repo as it stands on 2026-08-14, written for whoever
builds slices 2–5 of the strength tracker
([`strength-destination.md`](./strength-destination.md) build order): the
`ExerciseThreshold` referent, strength PRs + per-exercise history, the
outcome-indexed program engine, and the exercise database seed.

Slice 1 shipped as **ADR 0056**
(`a-strength-actual-is-logged-in-app-and-a-kilo-is-not-a-kilo`) with migration
`20260813140000_exercise_set_log`.

---

## 1. Prisma schema — the strength-relevant shape

`prisma/schema.prisma`, 1526 lines, SQLite. Every enum-ish field is a `String`
with a documented vocabulary plus a CHECK in the migration; **this repo does not
use Prisma enums and does not use triggers** (stated reason: a trigger would be
invisible in the schema file and lost to a later table rebuild). Cross-table
invariants are enforced by carrying the parent's discriminator into the child
and using a composite foreign key.

### 1.1 `Exercise` — six columns, and the one open bug

```prisma
model Exercise {
  id                 String  @id @default(cuid())
  name               String
  primaryMuscle      String // MuscleGroup: chest | back | shoulders | biceps | triceps | forearms | abs | obliques | lower-back | glutes | quads | hamstrings | calves | hip-flexors | full-body
  equipment          String? // e.g. "barbell" | "dumbbell" | "bodyweight" | "machine" | "cable"
  isCompound         Boolean @default(false)
  createdByAthleteId String? // null for seed/catalog entries

  createdBy User?            @relation(fields: [createdByAthleteId], references: [id], onDelete: SetNull)
  steps     WorkoutStep[]
  /// Every set ever logged against this movement — the per-exercise history the
  /// ghost and the strength records read.
  setLogs   ExerciseSetLog[]

  @@index([createdByAthleteId])
}
```

No `authorship`, no movement pattern, no laterality, no load semantics, no
default equipment, no aliases, no `bodyweightFraction`. `MUSCLE_GROUPS` lives in
`app/utils/workout-schema.ts:32`.

### 1.2 `ExerciseSet` — the prescription (unchanged by slice 1)

```prisma
model ExerciseSet {
  id         String @id @default(cuid())
  orderIndex Int
  kind       String   // "reps" | "timed" | "amrap" | "toRir" | "velocityLoss"

  load     String?  // JSON: LoadTarget union
  weightKg Float?   // legacy projection, one release only
  pct1RM   Float?   // legacy projection

  effortCap String? // JSON: EffortCap union
  tempo     String? // "3-0-3"; "X" = maximal intent

  reps            Int?
  durationSec     Int?
  terminationRir  Float? // kind = "toRir"
  velocityLossPct Float? // kind = "velocityLoss"

  step   WorkoutStep      @relation(fields: [stepId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  stepId String
  logs   ExerciseSetLog[]

  @@index([stepId])
}
```

Note `logs` is **many**, not one: a set prescribed once can be answered on every
occurrence of a Workout scheduled more than once.

### 1.3 `ExerciseSetLog` — slice 1's whole contribution

```prisma
model ExerciseSetLog {
  id         String @id @default(cuid())
  orderIndex Int

  role      String  @default("working")     // warmup | working | backoff
  outcome   String  @default("completed")   // completed | abandoned
  toFailure Boolean @default(false)

  load         String   // JSON: LoadValue union (strength-log.ts) — NOT weightKg
  effectiveKg  Float?   // baked at log time; null where no honest kilo exists
  bodyweightKg Float?   // the bodyweight the bake used; null when irrelevant

  reps         Int?
  repsLeft     Int?     // the other side of a unilateral set
  durationSec  Int?
  rir          Float?
  restTakenSec Int?

  completedAt DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  session       WorkoutSession @relation(fields: [sessionId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  sessionId     String
  step          WorkoutStep    @relation(fields: [stepId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  stepId        String
  exerciseSet   ExerciseSet?   @relation(fields: [exerciseSetId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  exerciseSetId String?
  exercise      Exercise?      @relation(fields: [exerciseId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  exerciseId    String?

  @@unique([sessionId, stepId, orderIndex])
  @@index([sessionId])
  @@index([stepId])
  @@index([exerciseId, completedAt])
}
```

Load-bearing facts for the next slices:

- `@@unique([sessionId, stepId, orderIndex])` is what makes the save an
  **upsert** (a between-sets double-tap cannot log a set twice).
- `@@index([exerciseId, completedAt])` was added _for_ per-exercise history and
  strength records — slice 3's read path is already indexed.
- `exerciseId` is **denormalized from the Step** so per-exercise history is one
  query and survives the Step being edited away.
- `exerciseSetId` is nullable on purpose (a sixth set nobody prescribed).
- `effectiveKg` is **baked, never recomputed** — a bodyweight-derived load
  depends on the bodyweight _then_. Any PR/1RM derivation in slices 2–3 must
  read `effectiveKg`, not re-derive from `load` + today's bodyweight.
- There are **no** `intraRestSec`/segment columns: drop sets, myo-reps, clusters
  and rest-pause remain unloggable and ADR 0056 states that as an absence.

Migration `prisma/migrations/20260813140000_exercise_set_log/migration.sql` is
one `CREATE TABLE` + four indexes, heavily commented, with an explicit "Nobody's
numbers move… No Load Recompute Notice is owed" paragraph — that paragraph is a
**convention**: every migration in this repo argues whether it owes a
`LoadRecomputeNotice`.

### 1.4 `WorkoutStep` / `WorkoutBlock` — where a lift hangs

```prisma
model WorkoutStep {
  id         String  @id @default(cuid())
  kind       String  @default("cardio") // "cardio" | "strength" | "rest"
  notes      String?
  orderIndex Int

  discipline  String?  // cardio-only
  intensity   String?  // JSON: IntensityTarget
  durationSec Int?
  distanceM   Int?
  verticalM   Int?
  gradePct      Float?
  cadenceRpmMin Int?
  cadenceRpmMax Int?
  rest String?         // JSON: RestSpec (rest-only)

  // strength-only fields
  exerciseId         String?
  restBetweenSetsSec Int?

  intensityHrMin Int?  // …Max/Power/Pace — resolved ranges, filled by a job
  block    WorkoutBlock     @relation(...)
  blockId  String
  exercise Exercise?        @relation(fields: [exerciseId], references: [id])
  sets     ExerciseSet[]
  setLogs  ExerciseSetLog[]
  @@index([blockId]) @@index([exerciseId])
}
```

`WorkoutBlock` carries `repeatCount`, `seriesRepeatCount`,
`betweenSeriesRestSec`, `sendOff` (JSON `SendOff`). **A strength step has no
per-side flag, no ground-contact count and no distance termination** — the
strength corpus header (`catalogue-corpus.strength.ts`) enumerates these four
gaps explicitly.

### 1.5 `Workout` — authorship, visibility, archetype, lineage

Key columns (full prose in the schema, lines 166–288):

```prisma
model Workout {
  id String @id @default(cuid())
  title String
  description String?
  discipline String   // "run" | "swim" | "bike" | "strength"
  intent     String   // WORKOUT_INTENTS
  archetype  String?  // SESSION_ARCHETYPES, authored, never a reading (ADR 0055)
  authorship String @default("athlete")  // 'system' | 'athlete' — ASSERTED
  visibility String @default("private")  // 'private' | 'public'  (ADR 0037/0051/0052)
  owner   User?  @relation(..., onDelete: SetNull)
  ownerId String?
  blocks   WorkoutBlock[]
  sessions WorkoutSession[]
  patternDays WeekPatternDay[]
  copiedFrom   Workout?  @relation("WorkoutLineage", ..., onDelete: SetNull)
  copiedFromId String?
  copies       Workout[] @relation("WorkoutLineage")
  catalogueEntry CatalogueEntry?
  attribution    Attribution?
  reports        WorkoutReport[]
  catalogueSaves CatalogueSave[]
  @@unique([id, authorship])
  @@unique([id, authorship, archetype])
  @@index([ownerId]) @@index([copiedFromId])
}
```

`Workout.authorship` is the **worked precedent for fixing `Exercise`** (#469):
asserted, never inferred from `ownerId IS NULL`, with the migration enforcing
the _implication_ `authorship = 'system' ⟹ ownerId IS NULL` and not the
biconditional, so an orphaned athlete-authored row stays expressible.

### 1.6 `WorkoutSession`

```prisma
model WorkoutSession {
  id            String   @id @default(cuid())
  scheduledAt   DateTime // stored UTC
  status        String   @default("scheduled") // scheduled | completed | skipped | missed
  tssValue      Float?
  tssFormula    String?  // coggan | hrTSS | rTSS | sTSS | sRPE
  tssConfidence String?  // high | medium | low
  plannedTssValue      Float?
  plannedTssConfidence String?
  replanReason String?
  source    String    @default("authored") // authored | generated | recorded | detected
  adoptedAt DateTime?
  user User @relation(...); userId String
  workout   Workout? @relation(...); workoutId String?   // nullable: recording-only
  recording ActivityImport? @relation("SessionRecording", ...); recordingId String?
  sessionLog SessionLog?
  targetEvent Event? @relation("TargetEvent", ...); targetEventId String?
  setLogs   ExerciseSetLog[]
  @@index([userId]) @@index([userId, scheduledAt]) @@index([targetEventId])
}
```

A strength session's TSS is still `sRPE` at `confidence: 'low'` — see
`app/utils/load/strength-tss-backfill.server.ts`. **Nothing yet recomputes a
strength session's load from its logged sets**; that is unclaimed territory and
would owe a Load Recompute Notice if it changed stored numbers.

### 1.7 `AthleteProfile`, `DisciplineProfile`, `ThresholdEvent`, `PerformanceResult`

`AthleteProfile`:
`birthdate, weightKg, heightCm, sex, preferredUnits, weekStartsOn, timezone, trainableWeekdays (JSON), defaultTrainingTime, weeklyCapacityHours`,
`userId @unique`, and `disciplineProfiles`, `thresholdEvents`,
`performanceResults`. **`weightKg` is the bodyweight the set log bakes against**
and it is a single current value — there is no bodyweight history table.

`DisciplineProfile` is keyed:

```prisma
  @@unique([athleteProfileId, discipline])
```

which is _the_ structural reason `ExerciseThreshold` must be a new table: a
squat 1RM and a deadlift 1RM would be the same row. It carries
`maxHr, lthr, ftp, runPowerThresholdW, thresholdPaceSecPerKm, cssSecPer100m, zoneSystem, zoneSystemSource, zoneOverrides, enabled, preferCogganTss, preferRTSS`.
Strength is a legal `discipline` value here and has **no** column that means
anything.

`ThresholdEvent` is the append-only history and is the **shape slice 2 should
mirror**:

```prisma
model ThresholdEvent {
  id           String   @id @default(cuid())
  discipline   String
  kind         String   // maxHr | lthr | ftp | runPower | thresholdPace | css | weight
  valueNumeric Float
  source       String   @default("manual")
  construct    String?  // ThresholdConstruct — WHAT was measured
  protocol     String?  // ThresholdProtocol — HOW it was arrived at
  confidence   String?  // high | medium | low; null when the athlete typed it
  effectiveAt  DateTime @default(now())
  createdAt    DateTime @default(now())
  athleteProfile   AthleteProfile @relation(...)
  athleteProfileId String
  @@index([athleteProfileId]) @@index([athleteProfileId, discipline])
}
```

The two-axis provenance (`construct` × `protocol`, plus an ordinal `confidence`
that is **null when the athlete typed the number**) is ADR 0054's, added by
migration `20260813120000_threshold_provenance_construct_and_protocol`.
`strength-destination.md` layer 1 asks for exactly this on `ExerciseThreshold`
with `construct ∈ {oneRm, estimatedOneRm, repMax}` and
`protocol ∈ {tested, epley, brzycki, mayhew, wathen, rep-max-observed, athlete-stated}`,
plus a **required `reps`** on any estimate.

`PerformanceResult`
(`discipline, distanceM, timeSec, occurredAt, source, verified`) is the cardio
analogue of a strength PR datum — _raw dated performances stored_, with the
_record_ derived over them. That distinction (`PerformanceResult` vs Personal
Record) is the vocabulary slice 3 should reuse.

### 1.8 Plan / season models (`PlanOutline` → `TrainingTrack` → segments)

- `PlanOutline` — 1:1 with `Event`, `startWeekKey` (Monday, `YYYY-MM-DD`),
  `phases`, `tracks`, `patterns`.
- `PlanOutlinePhase` —
  `orderIndex, name, weeks, rhythm ('3:1'|'2:1'|'none'), tapers`; contiguity is
  structural (no dates of its own).
- `TrainingTrack` — `discipline`, `currency ('km'|'hours'|'tss'|'sets')`,
  `@@unique([outlineId, discipline])`. `'sets'` means **total working sets per
  week, systemic, never per muscle group**.
- `SeasonAnchorSegment` — `fromWeekKey`, `value`,
  `@@unique([trackId, fromWeekKey])`.
- `TrainingTrackSegment` — one table, two kinds, the `WorkoutStep.kind` idiom:
  - both: `ramp` (% per loading week), `boundaryStep`
  - endurance-only: `phaseId`, `recoveryCut`, `taperCut`, `mix`
  - **strength-only**: `startWeekKey`, `weeks`, `goal`
    (`hypertrophy|maximal-strength|power`), `sessionsPerWeek`, `deloadCut`,
    `deloadWeeks`
  - `@@unique([trackId, phaseId])`, `@@unique([trackId, startWeekKey])`,
    `@@unique([id, kind])`
  - the per-kind CHECK is named `TrainingTrackSegment_kind_position`.
- `QualitySessionMixEntry` carries `segmentKind` pinned to `'endurance'` by
  CHECK
  - composite FK — the pattern to copy if a program-engine table must hang off
    only one kind of parent.
- `WeekPattern` / `WeekPatternDay` — the stampable microcycle;
  `kind ('fixed'|'share')`, `weight`, `workoutId`, `trackId`.

**This is the calendar-indexed layer.** ADR 0047 progresses strength by anchor +
ramp over weeks. The program engine slice is _outcome-indexed_ and, per
`strength-destination.md`, ADR 0047 gets a **scope** rather than a supersede.

### 1.9 Catalogue models

`CatalogueEntry` (membership, 1:1 with Workout via a **three-column** FK
`[workoutId, workoutAuthorship, archetype] → Workout[id, authorship, archetype]`),
`CatalogueEntryPhase`, `CatalogueEntryGoalEvent`, `CatalogueSave` (collection),
`Attribution` (publish record of a community row), `WorkoutReport` (moderation).
`CatalogueEntry` also carries the four citation columns, `level`, the
`progressesTo`/`regressesTo` edges and `retiredAt`.

Relevant to the program engine: **a program is not a Catalogue row**
(`strength-destination.md` says the research rejects that, firmly), but the
Catalogue's constructions — asserted discriminator + composite FK, retirement
not deletion, rows-not-JSON for multi-valued facets — are the house style for
any new table.

---

## 2. The strength domain code

### 2.1 `app/utils/workout-schema.ts` (661 lines) — the prescription vocabulary

All unions are **zod discriminated unions**, exported alongside a `z.infer`
type. Vocabularies are `as const` string tuples plus a `(typeof X)[number]` type
— never TS enums.

```ts
export const LoadTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('absolute'), kg: z.number().positive() }),
  z.object({ kind: z.literal('pct1RM'), minPct: …, maxPct: ….optional() }),
  z.object({ kind: z.literal('repMax'), reps: z.number().int().positive() }),  // "@ 8RM"
  z.object({ kind: z.literal('bodyweight'), addedKg: z.number().optional() }), // signed
  z.object({ kind: z.literal('pctBodyweight'), pct: z.number().positive().max(500) }),
  z.object({ kind: z.literal('velocity'), minMs: …, maxMs: ….optional() }),
])
export type LoadTarget = z.infer<typeof LoadTargetSchema>

export const EffortCapSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rir'), min: z.number().min(0).max(10), max: ….optional() }),
  z.object({ kind: z.literal('rpe'), min: z.number().min(1).max(10), max: ….optional() }), // Zourdos
])

export const EXERCISE_SET_KINDS = ['reps','timed','amrap','toRir','velocityLoss'] as const
/** The three kinds the session editor can author today. */
export const EDITABLE_EXERCISE_SET_KINDS = ['reps','timed','amrap'] as const
```

`tempo` is a plain string with a regex: `/^[0-9X]+-[0-9X]+-[0-9X]+$/`.

Set schemas are built from a shared `ExerciseSetBaseFields` spread plus per-kind
required quantities, wrapped in `withLoadRules()` which applies two refinements:
`weightKg XOR pct1RM`, and `load XOR (weightKg|pct1RM)`. Then
`ExerciseSetSchema = z.union([Reps, Timed, Amrap, ToRir, VelocityLoss])` — a
plain union, not `discriminatedUnion`, because the members are already refined.

`StrengthStepSchema` requires `exerciseId` and `sets.min(1)`.
`WorkoutAuthoringSchema` (line 642) is the Conform-backed editor payload — **its
round trip drops `load`, `effortCap` and `tempo`**, which is why both
`catalogue-seed.server.ts` and `strength-log.server.ts` bypass it. Any new write
path that carries a load must bypass it too, or add the fields there first.

### 2.2 `app/utils/workout-notation.ts` (1240 lines) — rendering

`setLoadText(set: NotationSet): string | null` (line 718) is private to the
module and renders all six `LoadTarget` members, falling back to the legacy
`weightKg`/`pct1RM` pair. Its doc comment is the standing statement of the
layer-1 gap:

> Nothing here resolves a load against the athlete. `@ 8RM` and `@ 85 % 1RM` are
> shown **as authored**, because the referent does not exist yet… Printing the
> prescription as written is the honest state until an `ExerciseThreshold`
> lands.

`formatSetsSummary(sets)` collapses uniform sets to `5 × 5 @ 80 kg` and lists
mixed ones `5 @ 80 kg / 3 @ 90 kg`. Exported entry points:
`workoutToNotationInput`, `draftToNotationInput`, `notationInputToWorkout`,
`deriveWorkoutNotation`, `tokenText`, `notationSegments`, `stepSentence`,
`blockSentence`, `notationSentence`. Separators live in `NOTATION_SEPARATORS`.
**When slice 2 lands, resolution belongs here** (or in a thin resolver the
notation calls) — `setLoadText` is the single choke point for prescription load
text.

### 2.3 `app/utils/strength-log.ts` (318 lines) — the pure performance layer

Zero imports beyond `zod`. No clock, no `prisma`.

```ts
export const SET_ROLES    = ['warmup', 'working', 'backoff'] as const
export const SET_OUTCOMES = ['completed', 'abandoned'] as const

export const LoadValueSchema = z.discriminatedUnion('kind', [
  { kind: 'external',       kg }                         // barbell total incl. bar
  { kind: 'perSide',        kg, sides: z.literal(2) }     // per hand
  { kind: 'bodyweight' }
  { kind: 'bodyweightPlus', addedKg }
  { kind: 'assisted',       assistKg }                    // positive = less work
  { kind: 'stackLevel',     level: int, label?: ≤40 }     // ORDINAL, no mass
  { kind: 'band',           band: string }                // non-linear force curve
  { kind: 'unloaded' }
])
export type LoadValue = z.infer<typeof LoadValueSchema>
```

Exported functions — these are the seams slices 2–5 extend:

| Export                      | Signature                                                                       | Notes                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `effectiveLoadKg`           | `(load: LoadValue, bodyweightKg: number \| null) => number \| null`             | Refuses on `stackLevel`, `band`, `unloaded`, and on any bodyweight-derived kind with no bodyweight. `assisted` returns `null` rather than ≤ 0.                           |
| `loadValueText`             | `(load: LoadValue) => string`                                                   | Table-cell text, never a sentence. `perSide` renders `2 × 32 kg`.                                                                                                        |
| `isMissedSet`               | `({outcome, reps, prescribedReps}) => boolean`                                  | Derived, never stored; an abandoned set is not "missed".                                                                                                                 |
| `countsTowardWork`          | `({role, outcome}) => boolean`                                                  | `role === 'working' && outcome === 'completed'` — **the one gate every strength aggregate shares**. PRs, 1RM estimation and hard-set counts must all route through this. |
| `ghostsForRows`             | `(previous: LoggedSet[], rowCount: number) => Array<SetGhost \| null>`          | Positional matching; warm-ups and abandoned sets dropped first; extra rows borrow the last ghost flagged `extrapolated`.                                                 |
| `strengthSummaryCount`      | `(sessions: Array<{loggedWorkingSets:number}>) => StrengthSummaryCount \| null` | `null` when nothing is materialized — never `0 of 0`.                                                                                                                    |
| `strengthSummaryCountLabel` | `(count \| null) => string`                                                     | One phrase, names the track.                                                                                                                                             |

Types: `SetRole`, `SetOutcome`, `LoadValue`, `LoggedSet`, `SetGhost`,
`StrengthSummaryCount`.

### 2.4 `app/utils/strength-log.server.ts` (484 lines) — queries and writes only

Header states the split rule verbatim: _"every rule about what a load means,
what a ghost matches and what counts as work lives in the pure
`strength-log.ts`. This file queries and writes and decides nothing."_

- `parseLoadValue(raw)` / `parseLoadTarget(raw)` — parse-don't-trust at the
  seam; `safeParse` inside a `try`, `null` on failure.
- `setLogSelect` — a `satisfies Prisma.ExerciseSetLogSelect` const, with
  `SetLogRow = Prisma.ExerciseSetLogGetPayload<{select: typeof setLogSelect}>`.
  This is the house idiom for a reusable select.
- **View types** (the loader contract):
  `LogRow { orderIndex, exerciseSetId, prescribedReps, prescribedDurationSec, prescribedLoad: LoadTarget|null, logged: {...}|null, ghost: SetGhost|null }`,
  `LogExercise { stepId, exerciseId, name, restBetweenSetsSec, rows }`,
  `StrengthLogView { sessionId, sessionTitle, scheduledAt, status, bodyweightKg, exercises }`.
- `getStrengthLogView(userId, sessionId): Promise<StrengthLogView | null>` — one
  nested session query (blocks → steps `where: {kind:'strength'}` → sets), one
  `athleteProfile` read for `weightKg`, one `exerciseSetLog.findMany`, plus one
  ghost query per distinct exercise. `null` = not this athlete's.
  `rowCount = max(prescribed sets, max loggedOrderIndex+1, 1)`.
- `previousSessionSets(userId, exerciseId, before)` — "last session **containing
  this exercise**", ordered by `scheduledAt desc` (not `completedAt`), via
  `setLogs: { some: { exerciseId } }`. This is the query slice 3's per-exercise
  history generalizes.
- `saveLoggedSet(input: SaveLoggedSetInput): Promise<SaveLoggedSetResult>` —
  result is a tagged union
  `{ok:true;id} | {ok:false;reason:'not-found'|'not-strength'}`. Ownership is
  checked **against the session, not the Step** (a Catalogue Workout's Step is
  reachable by everyone). Bakes `effectiveKg` and stores `bodyweightKg` only for
  the three bodyweight-dependent kinds. Upserts on
  `sessionId_stepId_orderIndex`; `completedAt` is left alone on update.
- `clearLoggedSet(...)` — `deleteMany` scoped by `session: { userId }`, returns
  `boolean`. Deletion, not a tombstone.
- `getStrengthSummaryCount(userId, now = new Date())` — week bounds via
  `weekBoundsUTC(now, profile.timezone ?? 'UTC')`, counts sessions whose workout
  discipline is `strength`, numerator = at least one
  `role:'working', outcome:'completed'` log.

### 2.5 Other strength-adjacent modules

- `app/utils/plan-outline/strength-goal.ts` — `STRENGTH_PRESCRIPTIONS`: the
  `%1RM` band and rep range each Strength Goal derives (hypertrophy 70–85/6–12
  ACSM 2009; maximal-strength 80–100/1–6 and power 30–70/3–6 ACSM 2026). Its
  header states the hard boundary: **nothing here derives sets per week from the
  goal**, and ACSM's set counts are recorded as evidence and deliberately not
  exported.
- `app/utils/load/strength-tss-backfill.server.ts` — the sRPE path.
- `app/utils/catalogue-corpus.strength.ts` — 25 corpus sessions + the
  `STRENGTH_EXERCISES` array (29 rows, stable `ex_*` ids) the seed upserts.
- `app/utils/workout.server.ts` — `getExerciseCatalog`, `getRecentExerciseIds`,
  `createCustomExercise`, and `legacyLoadColumns(set)` (line 29 — mirrors an
  `absolute`/`pct1RM` `LoadTarget` into the legacy `weightKg`/`pct1RM` columns;
  the other four members mirror into nothing).
- `app/routes/training/__exercise-combobox.tsx` + `__sets-popover.tsx` — the
  authoring controls.

---

## 3. The logging surface built in slice 1

### 3.1 Route

`app/routes/training/sessions.$sessionId_.log.tsx` (950 lines) → URL
`/training/sessions/:sessionId/log`. The trailing `_` on `$sessionId_` opts the
child out of the parent layout (`sessions.$sessionId.tsx` is the detail route).

Entry point: `app/routes/training/sessions.$sessionId.tsx:588`, a `Link` shown
only when `session.workout?.discipline === 'strength'`, labelled `'Sets logged'`
/ `'Log your sets'` off a `loggedSetCount`.

### 3.2 Loader / action contracts

```ts
export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const view = await getStrengthLogView(userId, params.sessionId)
	if (!view) throw new Response('Not found', { status: 404 })
	return view // StrengthLogView, returned bare
}
```

The action is **not** Conform. It is `intent`-dispatched with a local zod schema
over `Object.fromEntries(formData)`:

```ts
const LogSetSchema = z.object({
	stepId: z.string().min(1),
	orderIndex: z.coerce.number().int().min(0),
	role: z.enum(SET_ROLES).default('working'),
	loadKind: z.enum(LOAD_KINDS),
	loadNumber: optionalNumber, // '' → null, then Number.isFinite check
	loadLabel: z.string().max(40).optional(),
	reps: optionalNumber,
	repsLeft: optionalNumber,
	durationSec: optionalNumber,
	rir: optionalNumber,
	restTakenSec: optionalNumber,
	toFailure: z.string().optional(),
	abandoned: z.string().optional(),
})
```

`intent === 'clear-set'` → `clearLoggedSet`, else parse →
`toLoadValue(kind, num, label)` (returns `null` rather than guessing `0 kg`) →
`saveLoggedSet`. Errors come back as `data({ error }, 400|404)`; success as
`{ ok: true, id }`. Rows submit through `useFetcher`, one fetcher per row — no
`<Form>`, no redirect.

`LOAD_KINDS` in the route drops `perSide` from the picker (needs exercise load
semantics) — the stored union keeps all eight.

### 3.3 JSX structure

```
<main class="container mx-auto max-w-2xl py-6 pb-28">
  <PageHeader title="Log your sets" back={{to:/training/sessions/:id, label:'the session'}} />
  <p>{sessionTitle}</p>
  {exercises.length === 0 ? <p>This session has no lifts to log.</p> :
    <div class="space-y-8">
      <ExerciseGrid> per exercise:
        <section aria-labelledby="ex-{stepId}">
          <h2>{exercise.name}</h2> + <Button>Fill from last time</Button>   // bumps a counter
          <Select> "How this is loaded" → LOAD_KIND_LABELS  // per-exercise, not per-row
            + caveat line for stackLevel/band ("No kilos — this progresses against itself only.")
            + caveat when bodyweight-dependent and bodyweightKg == null
          <ul class="space-y-3">
            <SetRow> per row:
              <li data-set-row={orderIndex} class=border tinted by logged/abandoned>
                <div class="flex items-end gap-2">
                  <span>{orderIndex+1}</span>
                  [load number Input, label = LOAD_KIND_NUMBER[kind]]   // omitted when kind needs none
                  [band Input when kind === 'band']
                  [reps | seconds Input]        // 'seconds' iff prescribed duration & no prescribed reps
                  <Button size=icon aria-label="Log set N"><Icon name="check"/></Button>
                  <RowMore …/>                  // Popover: role chips, RIR chips 0–4,
                                                //   repsLeft input, to-failure toggle,
                                                //   "Racked it — abandoned", "Un-log this set"
                </div>
                <div class="pl-10">  Target {prescriptionText} ·
                     <button>Last time {loadValueText(ghost.load)} × {reps}{' (beyond last time)'}</button> ·
                     "Under target" · "Abandoned" · "To failure" · "Warm-up" · "No kilos recorded"
                </div>
                {error && <p role="alert">}
  <RestTimerBar deadline …/>   // fixed bottom bar, wall-clock deadline, ±15s, dismiss
```

Design rules encoded here and worth preserving in slice 4's "run the session"
UI: the ghost is **text with an explicit tap to fill** (never a prefilled
input); the rest timer is a **bar, auto-started by completing a set**, derived
from a wall-clock deadline on every tick; touch targets are ~44 px via
`after:absolute after:-inset-1` (ADR 0028); popover width is
`w-[min(16rem,calc(100vw-2rem))]` — never a fixed `16rem`, which pushes the page
sideways at 390 px.

### 3.4 Tests covering slice 1

| File                                                          | Kind                                                  | Count |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----- |
| `app/utils/strength-log.test.ts`                              | pure unit, no DB                                      | 15    |
| `app/utils/strength-log.server.test.ts`                       | real SQLite via Prisma                                | 10    |
| `app/routes/training/sessions.$sessionId_.log.route.test.tsx` | `createRoutesStub` + RTL, `@vitest-environment jsdom` | 12    |

The route test imports the **default export component** and stubs the route:

```tsx
const App = createRoutesStub([
	{
		path: '/training/sessions/:sessionId/log',
		Component: (props) => <SetLogRoute {...(props as any)} />,
		loader: () => view(overrides),
		action: async ({ request }) => {
			submitted(Object.fromEntries(await request.formData()))
			return { ok: true }
		},
		HydrateFallback: () => <div>Loading...</div>,
	},
])
render(<App initialEntries={['/training/sessions/sess-1/log']} />)
```

Test names are **sentences that state the rule**, not `it('renders')` — e.g.
`'logging is an upsert, so the between-sets double-tap cannot log a set twice'`,
`'a stack level and a band have no honest kilo, and none is invented'`. Match
this style; reviewers here treat it as a hard convention.

---

## 4. Repo conventions an implementer must follow

**Stack.** React Router v7 framework mode on an Epic Stack base. Vite + Tailwind
v4 + Prisma 6 (SQLite, LiteFS in prod) + Conform/zod + shadcn-derived components
on Base UI (`@base-ui/react`). Package name `trainm8-085d`; `"type": "module"`;
imports use the `#app/*` and `#tests/*` subpath aliases and **explicit
`.ts`/`.tsx` extensions**. Tabs, single quotes, no semicolons
(`@epic-web/config/prettier`).

**Routing.** `app/routes.ts` uses `react-router-auto-routes`:

```ts
export default autoRoutes({
	ignoredRouteFiles: [
		'.*',
		'**/*.css',
		'**/*.test.{js,jsx,ts,tsx}',
		'**/__*.*',
		'**/*.server.*',
		'**/*.client.*',
	],
})
```

So: `.` = URL segment separator, `$param` = dynamic, trailing `_` = opt out of
the parent layout, `__name.tsx` = colocated non-route module (the whole
`__exercise-combobox.tsx` / `__sets-popover.tsx` family), `*.test.tsx`
colocated, `*.server.ts` colocated but never routed. Types come from
`./+types/<route>.ts` (`Route.LoaderArgs`, `Route.ActionArgs`,
`Route.ComponentProps`, `Route.MetaFunction`) and are generated by
`react-router typegen`.

**Loaders/actions.** `const userId = await requireUserId(request)` first,
always. Return plain objects or the domain view type;
`throw new Response('Not found', {status: 404})` for missing;
`data(payload, status)` for a rendered error. Multi-intent actions read
`formData.get('intent')`. Two form idioms coexist:

- **Conform + zod** for authored forms —
  `useForm({ id, constraint: getZodConstraint(Schema), lastResult, onValidate: ({formData}) => parseWithZod(formData, {schema}) })`
  with `<Form method="POST" {...getFormProps(form)}>` (see `SessionLogForm` in
  `sessions.$sessionId.tsx`).
- **`useFetcher` + a local zod schema** for per-row, no-navigation writes — the
  set log. Use this shape for anything that saves one number mid-session.

**Module layout under `app/utils/`.** The split is `x.ts` (pure) / `x.server.ts`
(queries + writes) / `x.test.ts` / `x.server.test.ts`. Bigger concerns get a
**directory** with the same discipline: `plan-generation/`, `plan-outline/`,
`profile-analysis/`, `load/`, `archetype-classification/`, `jobs/`. A directory
typically has `types.ts`, `constants.ts` (every magic number named, with its
citation in a comment), pure rule modules, and one `*.server.ts` that assembles
input and writes output. **Purity is a stated contract**: "reads no clock (`now`
is an argument), no random source, mutates nothing, cannot query" (ADR 0053 §2).
A strength progression engine belongs in `app/utils/strength-program/` under
exactly this rule — the next weight must be a pure function of logged state.

**Presenter pattern.** `app/routes/_home/cockpit/presenter.ts` +
`presenter.test.ts`: pure `build*` functions mapping loader domain data onto
view models so the components stay dumb and the mapping is unit-testable
(`buildTodayCard`, `buildWeekTimeline`, `buildProofStrip`, …). Only the cockpit
has one today; a strength dashboard/history surface is the natural second.

**Testing.** Vitest (`npm run test`, `npm run test -- --run`), config inside
`vite.config.ts`: `include: ['./app/**/*.test.{ts,tsx}']`, setup
`tests/setup/setup-test-env.ts`, global setup `tests/setup/global-setup.ts`,
`testTimeout: 30_000`. `tests/setup/db-setup.ts` copies a base SQLite file per
vitest pool in `beforeEach` after `prisma.$disconnect()` — **server tests hit a
real database**, no mocking of Prisma. `setup-test-env.ts` makes any
`console.error`/`console.warn` **throw**. Helpers live in `#tests/db-utils.ts`
(`createUser`, `createPassword`). Testing preference, in order: pure function
tests at the highest seam that still has no IO → `*.server.test.ts` against real
SQLite → route tests via `createRoutesStub` + Testing Library. Playwright e2e
exists (`npm run test:e2e:run`) but is thin.

**Migrations.** Hand-authored SQL under
`prisma/migrations/<UTC-ish timestamp>_<snake_name>/migration.sql` — recent ones
use round hand-written stamps (`20260813140000`). Every migration opens with a
prose comment: what it changes, why, which ADR/research it implements, and an
explicit paragraph on whether **any stored number moves** (a
`LoadRecomputeNotice` is owed if so). Vocabulary constraints ship as CHECKs, and
cross-table rules ship as a carried discriminator + composite FK. **One SQLite
file — never write two migrations in parallel worktrees.**

**Seeds.** `prisma/seed.ts` is the reset-time script (kody's replayed real
Strava history + synthetic future). `app/utils/catalogue-seed.server.ts` exports
`seedCatalogue(prisma, corpus)` — idempotent upserts keyed by stable ids
(`stockEntryId(key)`, `ex_*` for exercises), two passes so progression edges can
point at rows written in pass 1, returning a counts summary. It deliberately
bypasses `WorkoutAuthoringSchema`. `prisma/seed-athlete-levels.ts` is additive
and idempotent, run with `npx tsx prisma/seed-athlete-levels.ts`, and is _not_
wired into `seed.ts`. An exercise-database seed (slice 5) should follow
`seedCatalogue`'s shape: stable ids, upsert, idempotent, returns counts.

**Icons.** SVGs live in `other/svg-icons/`, are pulled with the **Sly CLI** from
`iconify:tabler` (`other/sly/sly.json`, transformer `transform-icon.ts`), and
are compiled to a sprite by `vite-plugin-icons-spritesheet`
(`inputDir: './other/svg-icons'`, `outputDir: './app/components/ui/icons'`,
`fileName: 'sprite.svg'`, `withTypes: true`). Use
`<Icon name="check" size="md" />` from `#app/components/ui/icon.tsx` — **never**
import from `lucide-react` or `@tabler/icons-react` (shadcn's generator emits
those; strip them). There is already a `barbell.svg`. The repo's `icon-workflow`
skill covers this.

**UI kit.** `app/components/ui/` — shadcn components adapted onto Base UI:
`button` (+`buttonVariants`), `input`, `select`, `popover`, `card`, `badge`,
`table`, `tabs`, `tooltip`, `checkbox`, `field`, `label`, `textarea`,
`status-button`, `alert`, `alert-dialog`, `dropdown-menu`, `command`, `sonner`.
Shared app components: `page-header.tsx` (`PageHeader`, `PageHeaderHandle`),
`error-boundary.tsx` (`export { GeneralErrorBoundary as ErrorBoundary }` at the
bottom of every route). Text sizes are the repo's own tokens (`text-body-xs`,
`text-body-sm`), and `cn()` comes from `#app/utils/misc.tsx`.

**Docs discipline.** A decision goes in `docs/adr/NNNN-sentence-case-title.md`
(Status / Context / Decision numbered sections / Considered options /
Consequences). Vocabulary goes in `CONTEXT.md`'s glossary — **Exercise Set
Log**, **Load Value**, **Effective Load**, **Set Ghost**, **Load Target**,
**Effort Cap**, **Strength Goal**, **Strength Frequency**, **Strength Summary
Count** are all already defined there, along with an invariants list around
line 2002. Use those exact terms. `docs/research/` holds the primary-source
corpus; the three strength documents are `strength-anchors-and-progression.md`,
`strength-program-stronglifts-and-kin.md`, `strength-tracker-surfaces.md`.

---

## 5. Existing seams worth reusing

**For progression logic (slice 4).**

- `app/utils/strength-log.ts` — `countsTowardWork` is the qualification gate; a
  progression rule that counts "25 of 25 reps" must be expressed over
  `LoggedSet[]` filtered by it. `LoggedSet` and `ghostsForRows` show the shape a
  pure strength module takes: arrays in, decisions out, no IO.
- `app/utils/plan-generation/deterministic.ts` + `generator.ts` +
  `generate.server.ts` — the precedent for "pure engine behind a server seam,
  deterministic, `now` injected", plus `provenance.ts` for recording _why_ the
  engine chose what it chose. A program engine should mirror this trio.
- `app/utils/plan-outline/derive.ts` / `ramp-guard.ts` / `strength-goal.ts` —
  pure rule modules with their constants and citations inline; the calendar-side
  counterpart the outcome-indexed engine must not duplicate or contradict.
- `app/utils/load/session-nudge.ts` and `load/coach.ts` — pure "here is what to
  do next, and here is why" recommendation shapes, already rendered by the
  cockpit.

**For threshold estimation (slice 2).**

- `app/utils/profile-analysis/` is the whole blueprint. `types.ts` defines
  `ThresholdEstimate` as a **discriminated union of `estimate | refusal`** — "we
  did not look" and "we looked and there is nothing" are different statements —
  each carrying an `EstimateBasis`
  (`activityCount, contributingCount, fromISO, toISO, latestISO, durationsUsedSec, durationsRefusedSec, rSquared`)
  so the derivation can be _shown_. `ESTIMATE_REFUSALS` is a closed vocabulary.
  `CONSTRUCT_COLUMN` / `CONSTRUCT_EVENT_KIND` map a construct to the column it
  lands in and the event kind it is filed under. `confidence.ts` scores and
  grades on ADR 0033's ordinal `high|medium|low`.
- `estimate.ts:estimateProfile(input: AnalysisInput): ThresholdEstimate[]` —
  pure, `now` injected. `analyze.server.ts` supplies `readAnalysisActivities`,
  `analyseProfile`, `findEstimate`, `acceptancePlan`.
- `app/routes/settings/training/analyze.tsx` — the **propose → show derivation →
  athlete accepts** surface, with the rule that the action **re-runs the
  analysis server-side rather than trusting the posted value**. A 1RM proposal
  screen should be this screen with a different noun.
- `ThresholdEvent` + `app/utils/athlete.server.ts:setDisciplineThresholds` — the
  append-only history + current-value write pair to imitate for
  `ExerciseThreshold`.

**For PRs and per-exercise history (slice 3).**

- `app/utils/personal-records.ts` —
  `detectPersonalRecords(efforts: PrEffort[]): PersonalRecord[]`, pure,
  derived-never-authored, with `previousValue`/`delta` built in and a
  `BenchmarkKind` union explicitly left open for more kinds.
  `personal-records.server.ts:getPersonalRecords` assembles it;
  `cockpit/presenter.ts:buildProofStrip` renders it. Strength records are
  `BenchmarkKind` extensions over `ExerciseSetLog` rows — and unlike the cardio
  ladder they need **no stream tier**: the set row is the measurement.
- `previousSessionSets` in `strength-log.server.ts` is the per-exercise history
  query in miniature; generalize it rather than writing a second one. The
  `@@index([exerciseId, completedAt])` is already there.
- `PerformanceResult` is the vocabulary precedent: raw dated results stored,
  records derived over them.

**For the exercise database (slice 5).**

- `catalogue-corpus.strength.ts:STRENGTH_EXERCISES` (29 rows, stable `ex_*` ids)
  - `catalogue-seed.server.ts`'s upsert loop is the existing seed path.
- `workout.server.ts:getExerciseCatalog` / `getRecentExerciseIds` /
  `createCustomExercise` are the three read/write points a bigger catalogue must
  keep working; `__exercise-combobox.tsx` is the picker.
- `catalogue.server.ts:listCatalogue` is the **corrected** query shape (reads
  asserted authorship, with a test proving an orphaned athlete-authored entry is
  not served as stock) — copy it when `Exercise` gains `authorship`.

---

## 6. Known debts on the path

1. **#469 — `Exercise` has the `ownerId` bug `Workout` had.**
   `getExerciseCatalog` infers stock from null:

   ```ts
   where: {
   	OR: [{ createdByAthleteId: null }, { createdByAthleteId: userId }]
   }
   ```

   An athlete authors a custom exercise, deletes their account,
   `onDelete: SetNull` nulls the column, and the row is served to **every**
   athlete as a trainm8-authored catalog entry. Named in ADR 0051 §2 as the
   evidence for asserted authorship and deliberately left standing by #448. The
   fix is a second table rebuild plus an `authorship` column; the `Workout`
   rebuild in #448 is the worked precedent (row counts + a byte-identical
   SHA-256 over carried columns). The 29 seeded strength exercises are genuinely
   trainm8-authored and the schema cannot say so. **Slice 5 touches this table
   anyway — that is the moment to fix it, as its own PR.**

2. **`Exercise`'s six columns.** No movement pattern, no laterality, no load
   semantics (which is why `perSide` is in the union and out of the picker), no
   default equipment, no aliases, no bodyweight fraction. ADR 0047 §2 already
   cites the thinness as the blocker for per-muscle volume.
   `strength-destination.md` recommends the progression key be
   **`(exerciseId, equipment)`** so barbell and dumbbell bench progress
   separately without exploding the picker.

3. **`SESSION_ARCHETYPES` has no strength member.** All sixteen values
   (`recovery, easy, long, steady, tempo, threshold, sub-threshold, vo2max-long, vo2max-short, anaerobic, neuromuscular, fartlek, race-simulation, test, brick, technique`)
   are endurance. The strength corpus files every heavy squat day as
   `neuromuscular` or `technique` and its own header calls that _"the nearest
   honest member and not a good fit."_ ADR 0055 just made `archetype` an
   **authored column on `Workout`** with a three-column FK into
   `CatalogueEntry`, so growing the vocabulary now means touching a CHECK and
   that FK. The open decision: does `SESSION_ARCHETYPES` grow a strength arm, or
   does strength keep its own axis via **Strength Goal**?

4. **The `deload` collision.** In the StrongLifts family it means a **per-lift
   −10 % cut on failure**; in ADR 0047 it means a **planned −50 % week** in a
   season segment (`TrainingTrackSegment.deloadCut`, `deloadWeeks`, live in
   `training.server.ts` and `plan-outline/derive.ts`). ADR 0056 §8 settled it in
   advance: **ADR 0047 keeps `deload` for the planned week; the per-lift cut on
   failure will be named something else.** Pick that name in the program-engine
   ADR and put it in `CONTEXT.md`'s glossary before writing code.

5. **`pct1RM` and `repMax` still resolve to nothing.** `setLoadText` renders all
   six members correctly and resolves none. `DisciplineProfile`'s
   `@@unique([athleteProfileId, discipline])` makes this unfixable with a
   column.

6. **No strength load recompute.** A completed strength session's TSS is still
   `sRPE` at `confidence: 'low'` even when every set is logged. Changing that
   rewrites stored numbers and therefore owes a `LoadRecomputeNotice` (and #463
   is open about widening that model).

7. **Four set shapes remain unloggable** (drop sets, myo-reps, clusters,
   rest-pause) — one `intraRestSec`-shaped column, not four `kind`s, per
   ADR 0056. **Supersets/circuits have no container** on either side.

8. **Research caveats the program engine must not launder**, from
   `strength-destination.md`: the "5×5 → 3×5 → 1×5 after two deloads" ladder is
   **not** an official StrongLifts rule; "three fails then cut 10 %" has no
   trial of any kind (the two controlled deload trials found no benefit, one a
   strength cost); the training max has no evidence base (adopt as a product
   convention or not at all); RIR-prescribed load does not beat
   percentage-prescribed load; velocity-based 1RM needs a barbell sensor and
   carries SEE ≈ 9.8 % — **do not build it**; session tonnage and streaks are
   vanity and are rejected, not deferred. Failure has **three** structurally
   different remedies (percentage cut, reset to a past weight, re-estimation of
   a derived anchor) and collapsing them into a percentage loses two.

9. **Pre-existing test failures** unrelated to strength: `imports.upload` tests
   fail on `main` itself (environment-dependent).

---

## 7. How to run things

```bash
# dev server (MSW mocks on), http://localhost:3000
npm run dev
npm run dev:no-mocks

# tests
npm run test                 # vitest watch
npm run test -- --run        # single pass — the CI bar
npm run coverage
npm run test:e2e:run         # playwright, headless (builds first)

# types + lint
npm run typecheck            # react-router typegen && tsc
npm run lint
npm run format

# everything
npm run validate             # test --run, lint, typecheck, e2e

# database
npx prisma migrate dev --name <snake_name>   # then hand-edit the generated SQL
npx prisma migrate deploy                    # prod / after pulling
npx prisma generate --sql
npm run db:reset-local                       # backs up data.db, resets, reseeds
npm run db:studio
npx tsx prisma/seed-athlete-levels.ts        # additive, idempotent level athletes

# first-time / after a fresh worktree
cp .env.example .env && npx prisma migrate deploy && npm run db:reset-local
npm run setup                # build + migrate deploy + generate --sql + playwright install
```

Dev logins: `kody` from `prisma/seed.ts`; five history-only athletes
(bea/rune/ida/arne/tora) from `seed-athlete-levels.ts`, with a dev-only athlete
switcher at `/dev/athletes` (`app/utils/dev-athletes.server.ts`,
`app/components/dev-athlete-switcher.tsx`).
