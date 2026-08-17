-- Give the strength track a **referent**, a **program**, a **gym** and a real
-- **exercise identity** (docs/specs/strength-module.md, slices 2, 4, 5 and 6;
-- ADR 0054 for threshold provenance; ADR 0056 for slice 1's stated absences;
-- docs/research/strength-anchors-and-progression.md,
-- strength-program-stronglifts-and-kin.md, strength-tracker-surfaces.md).
--
-- Slice 1 shipped the performance side: an athlete can log what they lifted. Four
-- things it could not do, and each one needs a table.
--
-- **One. The prescription had no referent.** `LoadTarget` ships six members and
-- `setLoadText` resolves none of them, so `@ 85 % 1RM` reaches the logging grid as
-- the literal string and the athlete does the arithmetic on their phone between
-- sets. This is not fixable with a column: `DisciplineProfile` is keyed
-- `[athleteProfileId, discipline]`, which makes a squat 1RM and a deadlift 1RM
-- *the same row*. It is a cardinality mismatch, which is why the gap survived
-- three ADRs. `ExerciseThreshold` is a new table, mirroring `ThresholdEvent`'s
-- shape — the same two-axis provenance (`construct` × `protocol`) plus an ordinal
-- `confidence` that is NULL where the athlete typed the number — and it is
-- **append-only**: an edit writes a new row with a later `effectiveAt`, so an old
-- session still reads against the anchor it was prescribed from. `repMax` is a
-- **peer** of `oneRm` and never a derivative, because converting an observed 8RM
-- up to a 1RM in order to render `@ 8RM` is a round trip through a ±10 % transform,
-- twice.
--
-- **Two. There was no program**, and a program is not any existing thing. A
-- Catalogue member is *one session* with `authorship: 'system'` and
-- `ownerId: NULL`, read by every athlete — so per-athlete mutable state (working
-- weight, stall count, cursor) on it would write one athlete's state into shared
-- corpus content, the exact reason ADR 0056 §2 refused to write performed reps onto
-- `ExerciseSet`. A Training Track segment is keyed by `startWeekKey` and
-- interpolates a weekly sets target from a season position: it is
-- **calendar-indexed**, and every program in this family is **outcome-indexed** —
-- you cannot stamp twelve weeks of StrongLifts into the calendar, because week 6's
-- weight is a function of week 5's log. So `StrengthProgram` (the authored rule)
-- and `ProgramInstance` + `ProgramLiftState` (the athlete's run) are new. ADR 0047
-- gets a scope note and not a supersede: where an Outline and a Program both exist,
-- the Outline owns the frequency and the Program owns the load.
--
-- The rule table is keyed **by lift**, because StrongLifts' own deadlift breaks its
-- program's rule on two axes at once — 1×5 rather than 5×5, and 10 lb rather than
-- 5 lb — so a program-level rule is provably wrong on day one. `ProgramLiftState`
-- exists because seven pieces of state cannot be derived from the log: the working
-- weight, the training max, the working fraction, the **Stall Count**, the current
-- (mutable) increment, the weight history a **Weight Rollback** reads, and the
-- stall history that answers *"why did my squat drop 10 kg?"*.
--
-- **Three. The plate calculator had no gym.** ADR 0056 recorded it as not built for
-- this reason: a greedy descent that assumes unlimited plates fails at 140 kg on a
-- gym with two 20s per side, so `PlateInventory` stores counts and the solver is a
-- bounded knapsack. Loadability stays **independent of the increment**, verbatim
-- from the reference product: *"if your increments are set to 5lb, then the weight
-- will increase by 5lb regardless of your plate setup."*
--
-- **Four. `Exercise` had six columns and an open authorship bug (#469).** No
-- movement pattern, no laterality, no load semantics — which is why `perSide` shipped
-- inside the stored `LoadValue` union and stayed out of the picker: nothing knew
-- whether a "32 kg dumbbell press" is 64 kg of work or a "32 kg goblet squat" is
-- 32 kg. And `getExerciseCatalog` infers stock from `createdByAthleteId IS NULL`, so
-- an athlete who authors a custom exercise and then deletes their account has that
-- row served to **every** athlete as trainm8-authored. `authorship` is now asserted
-- on `Workout`'s worked precedent (#448), enforcing the **implication**
-- `authorship = 'system' ⟹ createdByAthleteId IS NULL` and not the biconditional, so
-- an orphaned athlete-authored row stays expressible and stays out of the catalog.
-- `ExerciseVariant` carries the **Load Semantics** and is the row a history should
-- reference; an `ExerciseAlias` is search-only and **never a second identity**,
-- because the moment an alias can be logged against, one movement has two histories.
--
-- **On `Workout.strengthGoal` and the archetype it is meant to displace.**
-- `SESSION_ARCHETYPES` deliberately does not grow a strength arm: all sixteen
-- members are endurance readings whose classifier refuses without a Training Week
-- as context, and the strength corpus files every heavy squat day as `neuromuscular`
-- or `technique` — *"the nearest honest member and not a good fit"*, in its own
-- header's words. The mutual exclusion is written as an **implication**, the same
-- shape as `Workout_system_has_no_owner`: a stated Strength Goal forces
-- `archetype IS NULL` and `discipline = 'strength'`. The stronger reading —
-- `discipline = 'strength' ⟹ archetype IS NULL` — is **not** imposed here, and the
-- reason is structural: `CatalogueEntry.archetype` is NOT NULL and pinned to this
-- column by ADR 0055's three-column foreign key, so nulling the 24 strength corpus
-- rows' archetype would revoke their Catalogue membership. The corpus re-authoring
-- that closes it is its own change.
--
-- **Nobody's numbers move.** Six tables are new and empty. Every column added to an
-- existing table is new and either NULL or a stated default; no existing column is
-- read and rewritten with a different value; no threshold, TSS, CTL, ATL, TSB,
-- `effectiveKg` or `bodyweightKg` is touched. Two backfills write, and neither
-- changes a figure: `Exercise.authorship` records what the row already was (every
-- one of the 94 seeded rows has a NULL author and is genuinely trainm8-authored,
-- and there are no athlete-authored rows yet), and one default `ExerciseVariant`
-- per exercise is **derived from that exercise's own `equipment` string** so no
-- history is orphaned — the legacy column stays readable beside it for one release,
-- the way ADR 0047's retired columns were. The seeded load semantics are a
-- starting point the Slice 6 seed re-authors, not a measurement. **No Load
-- Recompute Notice is owed.**

-- ---------------------------------------------------------------------------
-- 1. `Workout` gains the strength channel's own axis.
-- ---------------------------------------------------------------------------

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    -- Session Archetype (CONTEXT.md, ADR 0055): what kind of session this
    -- prescription *is*. Authored; a reading is never stored. NULL means nobody
    -- stated one. The vocabulary is pinned here as well as on `CatalogueEntry`
    -- because a Workout outside the Catalogue reaches no other CHECK.
    "archetype" TEXT CHECK ("archetype" IS NULL OR "archetype" IN (
        'recovery', 'easy', 'long', 'steady', 'tempo', 'threshold', 'sub-threshold',
        'vo2max-long', 'vo2max-short', 'anaerobic', 'neuromuscular', 'fartlek',
        'race-simulation', 'test', 'brick', 'technique'
    )),
    -- Strength Goal (CONTEXT.md; `STRENGTH_GOALS` in plan-outline/derive.ts): the
    -- strength track's own axis, authored, so the corpus stops filing a heavy squat
    -- day under an endurance reading. Three members and not five — ADR 0047's own
    -- Revisit note proposes `anatomical-adaptation` and `maintenance`, and that is
    -- an amendment to ADR 0047 rather than a value smuggled in here.
    "strengthGoal" TEXT CHECK ("strengthGoal" IS NULL OR "strengthGoal" IN (
        'hypertrophy', 'maximal-strength', 'power'
    )),
    -- Asserted, never inferred from `ownerId IS NULL`.
    "authorship" TEXT NOT NULL DEFAULT 'athlete' CHECK ("authorship" IN ('system', 'athlete')),
    -- Who may read it. `public` is reachable from #452 onward and only through
    -- the publish flow, which owes an Attribution for every row it writes here.
    "visibility" TEXT NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('private', 'public')),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT,
    "copiedFromId" TEXT,
    -- The implication, not the biconditional: trainm8 never claims an athlete's
    -- session, and an orphaned athlete-authored row stays expressible.
    CONSTRAINT "Workout_system_has_no_owner" CHECK ("authorship" <> 'system' OR "ownerId" IS NULL),
    -- A fork is a copy of something else.
    CONSTRAINT "Workout_lineage_not_self" CHECK ("copiedFromId" IS NULL OR "copiedFromId" <> "id"),
    -- A Strength Goal is a statement about a strength session and about nothing
    -- else. Written as an implication so a strength Workout that states neither
    -- axis stays expressible.
    CONSTRAINT "Workout_strength_goal_is_strength" CHECK ("strengthGoal" IS NULL OR "discipline" = 'strength'),
    -- The two axes are mutually exclusive: a session states its Strength Goal or
    -- its Session Archetype, never both, because the second would be the endurance
    -- reading this column exists to stop the corpus from inventing.
    CONSTRAINT "Workout_strength_goal_excludes_archetype" CHECK ("strengthGoal" IS NULL OR "archetype" IS NULL),
    CONSTRAINT "Workout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Workout_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "Workout" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Workout" ("archetype", "authorship", "copiedFromId", "createdAt", "description", "discipline", "id", "intent", "ownerId", "title", "updatedAt", "visibility") SELECT "archetype", "authorship", "copiedFromId", "createdAt", "description", "discipline", "id", "intent", "ownerId", "title", "updatedAt", "visibility" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE INDEX "Workout_ownerId_idx" ON "Workout"("ownerId");
CREATE INDEX "Workout_copiedFromId_idx" ON "Workout"("copiedFromId");
CREATE UNIQUE INDEX "Workout_id_authorship_key" ON "Workout"("id", "authorship");
CREATE UNIQUE INDEX "Workout_id_authorship_archetype_key" ON "Workout"("id", "authorship", "archetype");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- No backfill. A Strength Goal is authored, and nothing in the schema today states
-- one to copy: `TrainingTrackSegment.goal` is a *season segment's* goal over weeks
-- and does not describe an individual session's shape, and deriving one from
-- `intent` would be the same fabrication ADR 0055's migration refused when it
-- declined to map `endurance` onto `easy`. Every strength Workout therefore keeps
-- its imperfect archetype until the corpus is re-authored, and says so.

-- ---------------------------------------------------------------------------
-- 2. What the athlete's gym owns. Created before `ExerciseVariant`, which
--    references it.
-- ---------------------------------------------------------------------------

CREATE TABLE "PlateInventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'My gym',
    -- JSON `{ label, weightKg }[]` — a 20 kg Olympic bar, a 15 kg women's bar, a
    -- trap bar. JSON rather than a child table: read only with its parent, written
    -- whole, never queried across athletes.
    "bars" TEXT NOT NULL DEFAULT '[]',
    -- JSON `{ weightKg, count }[]`, `count` being pairs owned. **Bounded** is the
    -- whole point: a greedy descent fails at 140 kg with only two 20s a side, and
    -- 2.5 kg plates plus a 0.5 kg microplate are exactly what breaks float
    -- accumulation, so the solver works over integer-scaled values within this list.
    "plates" TEXT NOT NULL DEFAULT '[]',
    -- JSON `number[]`. NULL = no rack stated, which is a different statement from a
    -- rack with nothing in it.
    "fixedDumbbellsKg" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    CONSTRAINT "PlateInventory_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlateInventory_athleteProfileId_name_key" ON "PlateInventory"("athleteProfileId", "name");
CREATE INDEX "PlateInventory_athleteProfileId_idx" ON "PlateInventory"("athleteProfileId");

-- No default inventory is written. An inventory the athlete never stated is a
-- guess about their gym wearing the shape of a fact, and the calculator's honest
-- answer with no inventory is to say it does not know what they own.

-- ---------------------------------------------------------------------------
-- 3. `Exercise` gets asserted authorship (#469) and the four facets it lacked.
-- ---------------------------------------------------------------------------

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    -- Canonical and equipment-free by intent — "Bench Press", with the equipment
    -- on the variant. The 94 rows carried over predate that rule and keep the names
    -- their seed gave them; the Slice 6 corpus is what re-authors them.
    "name" TEXT NOT NULL,
    "primaryMuscle" TEXT NOT NULL,
    -- JSON array of `MuscleGroup`. NULL = nobody stated any, distinct from `[]`.
    "secondaryMuscles" TEXT,
    -- The **legacy** equipment string, kept readable beside `ExerciseVariant` for
    -- one release the way ADR 0047's retired columns were. Deliberately *not*
    -- CHECK-constrained to `EQUIPMENT_IDS`: the real referent is the variant's
    -- `equipment`, and pinning a column that is on its way out would be a
    -- constraint two releases long.
    "equipment" TEXT,
    "isCompound" BOOLEAN NOT NULL DEFAULT false,
    -- The filter axis the picker needs at 390 px — `MOVEMENT_PATTERNS`. Twelve
    -- biomechanical patterns and not FIT's 53-member `exerciseCategory`, which does
    -- not fit as chips on a phone and half of whose members (`warm_up`, `cardio`,
    -- `unknown`) are not patterns at all. NULL means nobody stated one.
    "movementPattern" TEXT CHECK ("movementPattern" IS NULL OR "movementPattern" IN (
        'squat', 'hinge', 'lunge', 'horizontal-push', 'vertical-push',
        'horizontal-pull', 'vertical-pull', 'hip-extension', 'carry', 'rotation',
        'core', 'isolation'
    )),
    -- So the log asks for the other side's reps only where that means something.
    "unilateral" BOOLEAN NOT NULL DEFAULT false,
    -- **Discovery only, never identity.** If this were identity, two histories
    -- would merge and could not be separated again.
    "variationGroupId" TEXT,
    -- Asserted, never inferred from `createdByAthleteId IS NULL` (#469).
    "authorship" TEXT NOT NULL DEFAULT 'athlete' CHECK ("authorship" IN ('system', 'athlete')),
    "createdByAthleteId" TEXT,
    -- The implication, not the biconditional — `Workout`'s worked precedent (#448).
    -- trainm8 never claims an athlete's movement, and an athlete-authored row whose
    -- author deleted their account stays expressible instead of being promoted into
    -- the shared catalog for everybody.
    CONSTRAINT "Exercise_system_has_no_author" CHECK ("authorship" <> 'system' OR "createdByAthleteId" IS NULL),
    CONSTRAINT "Exercise_createdByAthleteId_fkey" FOREIGN KEY ("createdByAthleteId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- `authorship` records what each row already *is*, and the statement is checkable:
-- every existing row has a NULL author and every one of them came from
-- `catalogue-corpus.strength.ts`'s `ex_*` seed, so there is no athlete-authored row
-- to mislabel. The `CASE` is written out anyway rather than a flat `'system'`, so
-- the migration is correct on a database that has one.
INSERT INTO "new_Exercise" ("id", "name", "primaryMuscle", "equipment", "isCompound", "createdByAthleteId", "authorship")
SELECT "id", "name", "primaryMuscle", "equipment", "isCompound", "createdByAthleteId",
       CASE WHEN "createdByAthleteId" IS NULL THEN 'system' ELSE 'athlete' END
  FROM "Exercise";
DROP TABLE "Exercise";
ALTER TABLE "new_Exercise" RENAME TO "Exercise";
CREATE INDEX "Exercise_createdByAthleteId_idx" ON "Exercise"("createdByAthleteId");
CREATE INDEX "Exercise_movementPattern_idx" ON "Exercise"("movementPattern");
CREATE INDEX "Exercise_variationGroupId_idx" ON "Exercise"("variationGroupId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ---------------------------------------------------------------------------
-- 4. `ExerciseVariant` — the equipment realization, and the Load Semantics that
--    let `perSide` into the picker.
-- ---------------------------------------------------------------------------

CREATE TABLE "ExerciseVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exerciseId" TEXT NOT NULL,
    -- The other half of the progression key `(exerciseId, equipment)`, so barbell
    -- and dumbbell bench progress separately without exploding the picker.
    "equipment" TEXT NOT NULL CHECK ("equipment" IN (
        'barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'smith-machine',
        'trap-bar', 'ez-bar', 'bodyweight', 'assisted-machine', 'band',
        'medicine-ball', 'sled', 'suspension', 'other'
    )),
    -- NULL = the movement has no angle. A positive statement, not a gap.
    "angle" TEXT CHECK ("angle" IS NULL OR "angle" IN ('flat', 'incline', 'decline')),
    "displayName" TEXT NOT NULL,
    -- Load Semantics. Which member of the shipped `LoadValue` union this movement
    -- takes — the thing that was missing when `perSide` shipped in the union and
    -- stayed out of the picker, because nothing knew whether a "32 kg dumbbell
    -- press" is 64 kg of work or a "32 kg goblet squat" is 32 kg.
    "loadKind" TEXT NOT NULL CHECK ("loadKind" IN (
        'external', 'perSide', 'bodyweight', 'bodyweightPlus', 'assisted',
        'stackLevel', 'band', 'unloaded'
    )),
    -- What the empty implement weighs. NULL where there is no bar to be empty.
    "barKg" REAL,
    -- How many plates one jump consumes: 2 on a barbell, 1 on a single-horn
    -- machine. Also why the smallest achievable increment on a bar is
    -- `2 × smallestPlate` — which is a fact about loadability and deliberately not
    -- about the increment.
    "perSideMultiplier" INTEGER NOT NULL DEFAULT 2,
    -- A rack: the answer is the largest available weight ≤ target, stated honestly
    -- rather than as a number the rack cannot make.
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    -- More assist is *less* work. The sign belongs to the equipment and never to
    -- the number the athlete typed.
    "isAssisting" BOOLEAN NOT NULL DEFAULT false,
    -- A bodyweight movement's "bar" is the athlete, so the plate solver becomes an
    -- added-load calculator with no second code path.
    "useBodyweightForBar" BOOLEAN NOT NULL DEFAULT false,
    "inventoryProfileId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExerciseVariant_multiplier_is_one_or_two" CHECK ("perSideMultiplier" IN (1, 2)),
    CONSTRAINT "ExerciseVariant_bar_is_positive" CHECK ("barKg" IS NULL OR "barKg" > 0),
    CONSTRAINT "ExerciseVariant_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseVariant_inventoryProfileId_fkey" FOREIGN KEY ("inventoryProfileId") REFERENCES "PlateInventory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExerciseVariant_exerciseId_equipment_angle_key" ON "ExerciseVariant"("exerciseId", "equipment", "angle");
CREATE INDEX "ExerciseVariant_exerciseId_idx" ON "ExerciseVariant"("exerciseId");
CREATE INDEX "ExerciseVariant_inventoryProfileId_idx" ON "ExerciseVariant"("inventoryProfileId");

-- One default variant per existing exercise, **derived from that exercise's own
-- `equipment` string** so no logged set is orphaned. The id is `var_` + the
-- exercise's id, which is stable and re-derivable, so the Slice 6 seed upserts the
-- same rows rather than duplicating them.
--
-- `displayName` is the exercise's current name verbatim: the seeded names already
-- carry their equipment ("Barbell Back Squat"), so composing a new string here
-- would rename 94 rows to say what they already say.
--
-- The load semantics below are a **derivation from the equipment string, not a
-- measurement** — a starting point the Slice 6 corpus re-authors per movement. The
-- bar weight is the 20 kg Olympic bar, which is what a "barbell" means absent any
-- other statement; a dumbbell is `perSide` and fixed-increment; a bodyweight
-- movement's bar is the athlete. `medicine-ball`, `cable` and `machine` load
-- externally and consume one plate at a time.
INSERT INTO "ExerciseVariant" (
    "id", "exerciseId", "equipment", "angle", "displayName",
    "loadKind", "barKg", "perSideMultiplier",
    "isFixed", "isAssisting", "useBodyweightForBar",
    "inventoryProfileId", "isDefault", "createdAt", "updatedAt"
)
SELECT
    'var_' || "id",
    "id",
    COALESCE("equipment", 'other'),
    NULL,
    "name",
    CASE "equipment"
        WHEN 'dumbbell' THEN 'perSide'
        WHEN 'bodyweight' THEN 'bodyweight'
        ELSE 'external'
    END,
    CASE "equipment" WHEN 'barbell' THEN 20 ELSE NULL END,
    CASE WHEN "equipment" IN ('barbell', 'dumbbell') THEN 2 ELSE 1 END,
    CASE WHEN "equipment" = 'dumbbell' THEN true ELSE false END,
    false,
    CASE WHEN "equipment" = 'bodyweight' THEN true ELSE false END,
    NULL,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Exercise";

-- ---------------------------------------------------------------------------
-- 5. `ExerciseAlias` — search only. Never a second identity.
-- ---------------------------------------------------------------------------

CREATE TABLE "ExerciseAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exerciseId" TEXT NOT NULL,
    -- Set only where the alias names a specific realization ("DB bench"); NULL
    -- where it names the movement ("OHP", "military press").
    "variantId" TEXT,
    "text" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExerciseAlias_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseAlias_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ExerciseVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExerciseAlias_exerciseId_text_locale_key" ON "ExerciseAlias"("exerciseId", "text", "locale");
CREATE INDEX "ExerciseAlias_exerciseId_idx" ON "ExerciseAlias"("exerciseId");
CREATE INDEX "ExerciseAlias_variantId_idx" ON "ExerciseAlias"("variantId");
-- Search reads this column and nothing writes against it.
CREATE INDEX "ExerciseAlias_text_idx" ON "ExerciseAlias"("text");

-- ---------------------------------------------------------------------------
-- 6. `ExerciseSetLog` learns which variant the set was lifted on.
-- ---------------------------------------------------------------------------

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ExerciseSetLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderIndex" INTEGER NOT NULL,
    -- 'warmup' | 'working' | 'backoff'. Stored rather than inferred from a
    -- lighter load: a warm-up is excluded from records and hard-set counts and
    -- included in session duration, so it changes what the row means downstream.
    "role" TEXT NOT NULL DEFAULT 'working',
    -- 'completed' | 'abandoned'. Doing fewer reps than prescribed is still
    -- `completed` — the shortfall is visible in `reps`, and a `failed` flag beside
    -- a rep count is redundant state that can disagree with it. Missing the
    -- target, going to failure on purpose, and racking it are three different
    -- claims; only the third needs a column of its own.
    "outcome" TEXT NOT NULL DEFAULT 'completed',
    "toFailure" BOOLEAN NOT NULL DEFAULT false,
    "load" TEXT NOT NULL,
    "effectiveKg" REAL,
    "bodyweightKg" REAL,
    "reps" INTEGER,
    -- The other side of a unilateral set. 10 left and 8 right is one set with two
    -- rep counts; collapsing it to 9 invents a rep nobody did.
    "repsLeft" INTEGER,
    "durationSec" INTEGER,
    "rir" REAL,
    "restTakenSec" INTEGER,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    -- Nullable on purpose: an athlete who felt good and did a sixth set has a
    -- real set with no prescribed row to answer. `SET NULL` keeps that set after
    -- an edit deletes the prescription it once pointed at.
    "exerciseSetId" TEXT,
    "exerciseId" TEXT,
    -- The **Exercise Variant** the set was lifted on — the scope a record belongs
    -- to, so a lighter dumbbell day never reads as a regression against a barbell.
    -- Additive and nullable, and `SET NULL` rather than cascade: deleting a variant
    -- must never delete the sets somebody lifted on it.
    "variantId" TEXT,
    CONSTRAINT "ExerciseSetLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkoutStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_exerciseSetId_fkey" FOREIGN KEY ("exerciseSetId") REFERENCES "ExerciseSet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ExerciseVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- The variant is the default one just created for that exercise. Not a guess: it
-- is the same equipment string the row's exercise already carried, so the set is
-- attributed to the only realization the schema has ever known about it.
INSERT INTO "new_ExerciseSetLog" ("bodyweightKg", "completedAt", "createdAt", "durationSec", "effectiveKg", "exerciseId", "exerciseSetId", "id", "load", "orderIndex", "outcome", "reps", "repsLeft", "restTakenSec", "rir", "role", "sessionId", "stepId", "toFailure", "updatedAt", "variantId")
SELECT "bodyweightKg", "completedAt", "createdAt", "durationSec", "effectiveKg", "exerciseId", "exerciseSetId", "id", "load", "orderIndex", "outcome", "reps", "repsLeft", "restTakenSec", "rir", "role", "sessionId", "stepId", "toFailure", "updatedAt",
       CASE WHEN "exerciseId" IS NULL THEN NULL ELSE 'var_' || "exerciseId" END
  FROM "ExerciseSetLog";
DROP TABLE "ExerciseSetLog";
ALTER TABLE "new_ExerciseSetLog" RENAME TO "ExerciseSetLog";
CREATE UNIQUE INDEX "ExerciseSetLog_sessionId_stepId_orderIndex_key" ON "ExerciseSetLog"("sessionId", "stepId", "orderIndex");
CREATE INDEX "ExerciseSetLog_sessionId_idx" ON "ExerciseSetLog"("sessionId");
CREATE INDEX "ExerciseSetLog_stepId_idx" ON "ExerciseSetLog"("stepId");
CREATE INDEX "ExerciseSetLog_exerciseId_completedAt_idx" ON "ExerciseSetLog"("exerciseId", "completedAt");
-- Per-variant history, newest first — the index a variant-scoped record reads.
CREATE INDEX "ExerciseSetLog_variantId_completedAt_idx" ON "ExerciseSetLog"("variantId", "completedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ---------------------------------------------------------------------------
-- 7. `ExerciseThreshold` — the referent, per exercise, append-only.
-- ---------------------------------------------------------------------------

CREATE TABLE "ExerciseThreshold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    -- **What was measured** — the first provenance axis, ADR 0054's. `repMax` is a
    -- peer and not a derivative: `@ 8RM` is a complete instruction that needs no
    -- 1RM, and resolving it by converting up and back down is a ±10 % transform
    -- applied twice.
    "construct" TEXT NOT NULL CHECK ("construct" IN ('oneRm', 'estimatedOneRm', 'repMax')),
    "valueKg" REAL NOT NULL,
    -- The reps the value is *at*.
    "reps" INTEGER,
    -- **How it was arrived at** — the second axis. Berger is deliberately absent:
    -- systematically −17 %, and precise enough to look stable while being wrong.
    -- Brzycki, Lander and Adams are here only for parity with other apps and are
    -- gated to ≤ 10 reps like everything else, in the estimator rather than here —
    -- a rep gate is a property of a fit, not of a stored row.
    "protocol" TEXT NOT NULL CHECK ("protocol" IN (
        'tested', 'epley', 'brzycki', 'mayhew', 'wathen', 'lombardi', 'lander',
        'adams', 'rep-max-observed', 'athlete-stated', 'provider'
    )),
    -- ADR 0033's ordinal grade, never a bespoke 0–1 score and never a percentage.
    "confidence" TEXT CHECK ("confidence" IS NULL OR "confidence" IN ('high', 'medium', 'low')),
    "effectiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The set an estimate was read from, so the derivation can be *shown*. `SET
    -- NULL`, because an accepted estimate is the athlete's own number and losing
    -- the source set must not lose the anchor.
    "sourceSetLogId" TEXT,
    "exerciseId" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    -- A rep max and an estimate both mean two different things without their rep
    -- count; a tested single has none to state.
    CONSTRAINT "ExerciseThreshold_reps_required_on_estimate" CHECK (
        "construct" NOT IN ('repMax', 'estimatedOneRm') OR "reps" IS NOT NULL
    ),
    -- The app does not grade a figure somebody stated about themselves.
    CONSTRAINT "ExerciseThreshold_stated_is_ungraded" CHECK (
        "protocol" <> 'athlete-stated' OR "confidence" IS NULL
    ),
    CONSTRAINT "ExerciseThreshold_value_is_positive" CHECK ("valueKg" > 0),
    CONSTRAINT "ExerciseThreshold_reps_are_positive" CHECK ("reps" IS NULL OR "reps" > 0),
    CONSTRAINT "ExerciseThreshold_sourceSetLogId_fkey" FOREIGN KEY ("sourceSetLogId") REFERENCES "ExerciseSetLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExerciseThreshold_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseThreshold_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Append-only: an edit writes a new row with a later `effectiveAt` and nothing is
-- updated in place, so `effectiveAt` is part of the key rather than a column that
-- gets overwritten. SQLite treats NULLs as distinct in a unique index, so this
-- pins the rep-max rows exactly and leaves a tested `oneRm` guarded by its instant.
CREATE UNIQUE INDEX "ExerciseThreshold_athleteProfileId_exerciseId_construct_reps_effectiveAt_key" ON "ExerciseThreshold"("athleteProfileId", "exerciseId", "construct", "reps", "effectiveAt");
-- The as-of-date resolver's read: this athlete's anchors for this lift.
CREATE INDEX "ExerciseThreshold_athleteProfileId_exerciseId_idx" ON "ExerciseThreshold"("athleteProfileId", "exerciseId");
CREATE INDEX "ExerciseThreshold_sourceSetLogId_idx" ON "ExerciseThreshold"("sourceSetLogId");
CREATE INDEX "ExerciseThreshold_exerciseId_idx" ON "ExerciseThreshold"("exerciseId");

-- ---------------------------------------------------------------------------
-- 8. The Program: an authored definition, and an athlete's run of it.
-- ---------------------------------------------------------------------------

CREATE TABLE "StrengthProgram" (
    -- A stable seed id (`prog_stronglifts_5x5_basic`), not a cuid, so the seed is
    -- idempotent and re-runnable like every other seed in this repo.
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    -- The published edition within the family: StrongLifts Basic vs Plus, 5/3/1 vs
    -- 5s PRO. An axis and not a name, because the editions differ in their rules.
    "variantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    -- Asserted, with deliberately no owner column to infer it from.
    "authorship" TEXT NOT NULL DEFAULT 'system' CHECK ("authorship" IN ('system', 'athlete')),
    -- Which cursor this program advances. The *kind* is authored here; the
    -- *position* is per instance, and it is stored rather than counted.
    "cursorKind" TEXT NOT NULL CHECK ("cursorKind" IN ('alternatingDays', 'weekInCycle', 'weeklyRoles')),
    -- JSON `ProgramCursor` — where a fresh instance starts.
    "initialCursor" TEXT NOT NULL,
    -- The Citation, in the four columns `CatalogueEntry` already uses. A program
    -- whose every number is quoted has to say where from: a seeded "StrongLifts
    -- 5×5" that quietly uses 2 kg increments because they seemed more sensible is
    -- not StrongLifts.
    "citationAuthor" TEXT,
    "citationWork" TEXT,
    "citationYear" INTEGER,
    "citationLocator" TEXT,
    -- Where the source is not deterministic or not primary, said out loud rather
    -- than smoothed over — GreySkull's ≥ 10-rep double increment is
    -- reverse-engineered from secondary sources, nSuns publishes ranges on two of
    -- four rows, 5/3/1's fourth deload week is edition-dependent, and "three fails
    -- then cut 10 %" has no trial of any kind behind it.
    "provenanceNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "StrengthProgram_key_variantId_key" ON "StrengthProgram"("key", "variantId");

CREATE TABLE "StrengthProgramDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "programId" TEXT NOT NULL,
    -- The day's identity as the cursor names it — 'A', 'B', 'volume'. A lookup, so
    -- *"which day is next"* is never a count of logged sessions.
    "dayId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "workoutId" TEXT NOT NULL,
    -- The parent's discriminator carried into the child, pinned by the composite
    -- foreign key below — this repo's standing pattern for a cross-table invariant,
    -- in place of a trigger. A seeded program's day cannot come to point at an
    -- athlete's private Workout after an edit.
    "workoutAuthorship" TEXT NOT NULL DEFAULT 'system' CHECK ("workoutAuthorship" IN ('system', 'athlete')),
    CONSTRAINT "StrengthProgramDay_programId_fkey" FOREIGN KEY ("programId") REFERENCES "StrengthProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StrengthProgramDay_workoutId_workoutAuthorship_fkey" FOREIGN KEY ("workoutId", "workoutAuthorship") REFERENCES "Workout" ("id", "authorship") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StrengthProgramDay_programId_dayId_key" ON "StrengthProgramDay"("programId", "dayId");
CREATE INDEX "StrengthProgramDay_programId_idx" ON "StrengthProgramDay"("programId");
CREATE INDEX "StrengthProgramDay_workoutId_idx" ON "StrengthProgramDay"("workoutId");

CREATE TABLE "StrengthProgramLiftRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "programId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    -- The other half of the progression key. Nullable today and defaulted from
    -- `Exercise.equipment`; the variants sharpen the referent without changing the
    -- key's shape.
    "equipment" TEXT,
    "orderIndex" INTEGER NOT NULL,
    -- JSON `string[]` of `dayId`s. StrongLifts' squat is on both A and B; its bench
    -- is on A only.
    "dayIds" TEXT NOT NULL,
    -- What the engine prescribes. The Catalogue day shape is what *renders*; the
    -- pure engine cannot query, so it reads these. The seed writes the two to agree.
    -- Keyed by lift because StrongLifts' own deadlift is 1×5 inside a 5×5 program.
    "setCount" INTEGER NOT NULL,
    "repsPerSet" INTEGER NOT NULL,
    -- JSON `SetWeightSource[]`, one per set. One number per lift per session is
    -- authored and every other set is a function of it — Madcow's ramp, its 1×8
    -- back-off *"the weight from the 3rd set"*, Texas Method's Wednesday at ~80 %
    -- of Monday.
    "setWeightSources" TEXT NOT NULL,
    -- JSON `ProgressionTrigger`.
    "trigger" TEXT NOT NULL,
    -- JSON `SuccessPredicate`, evaluated over `countsTowardWork`-qualified sets
    -- only: warm-ups and abandoned sets are excluded here by the same one gate that
    -- excludes them from records and hard-set counts.
    "successPredicate" TEXT NOT NULL,
    -- JSON `Increment`. Four irreducible load bases, and deliberately no single
    -- `deltaKg` — collapsing them loses a program each.
    "increment" TEXT NOT NULL,
    -- 3 for StrongLifts; **1** for GreySkull and 5/3/1, where the response is
    -- immediate.
    "stallsBeforeResponse" INTEGER NOT NULL DEFAULT 3,
    -- JSON `StallResponse`. Three structurally different remedies and no shared
    -- `deloadPct`: one field would launder three operations into one.
    "stallResponse" TEXT NOT NULL,
    -- JSON `IncrementAdjustmentOnStall`. Starting Strength shrinks the increment
    -- *and* cuts the weight — two things at once, and it publishes both.
    "incrementAdjustmentOnStall" TEXT NOT NULL DEFAULT '{"kind":"unchanged"}',
    -- The program's own published start, pre-offered so the athlete answers one
    -- question per lift and is never asked again — StrongLifts' empty bar.
    "defaultStartKg" REAL,
    -- The program's other published seeding instruction: *"a weight you could lift
    -- for 10 reps"*. A rep count, because it needs no anchor.
    "startSeedRepMaxReps" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StrengthProgramLiftRule_sets_are_positive" CHECK ("setCount" > 0 AND "repsPerSet" > 0),
    CONSTRAINT "StrengthProgramLiftRule_stalls_are_positive" CHECK ("stallsBeforeResponse" > 0),
    CONSTRAINT "StrengthProgramLiftRule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "StrengthProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StrengthProgramLiftRule_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StrengthProgramLiftRule_programId_exerciseId_equipment_key" ON "StrengthProgramLiftRule"("programId", "exerciseId", "equipment");
CREATE INDEX "StrengthProgramLiftRule_programId_idx" ON "StrengthProgramLiftRule"("programId");
CREATE INDEX "StrengthProgramLiftRule_exerciseId_idx" ON "StrengthProgramLiftRule"("exerciseId");

CREATE TABLE "ProgramInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "programId" TEXT NOT NULL,
    -- Carried so a later definition edit cannot move somebody mid-run onto another
    -- edition's rules.
    "variantId" TEXT NOT NULL,
    "startedOn" DATETIME NOT NULL,
    -- `ended` and never a delete: stopping a program must not lose the sets logged
    -- under it.
    "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'paused', 'ended')),
    "endedAt" DATETIME,
    -- JSON `ProgramCursor` whose `kind` matches the definition's `cursorKind`.
    -- **Stored, never counted**: a skipped, back-filled or duplicated session must
    -- not desync a whole program. And the position ignores the calendar entirely —
    -- an instance paused for three months resumes exactly where it stopped, because
    -- no source in this family publishes a detraining rule and inventing one would
    -- be fiction.
    "cursor" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ProgramInstance_ended_has_a_date" CHECK ("status" <> 'ended' OR "endedAt" IS NOT NULL),
    CONSTRAINT "ProgramInstance_programId_fkey" FOREIGN KEY ("programId") REFERENCES "StrengthProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgramInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProgramInstance_userId_idx" ON "ProgramInstance"("userId");
CREATE INDEX "ProgramInstance_userId_status_idx" ON "ProgramInstance"("userId", "status");
CREATE INDEX "ProgramInstance_programId_idx" ON "ProgramInstance"("programId");

CREATE TABLE "ProgramLiftState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    -- The progression key is the **pair** `(exerciseId, equipment)`, so barbell and
    -- dumbbell bench progress separately.
    "equipment" TEXT,
    "currentWorkingWeightKg" REAL NOT NULL,
    -- **The unrounded intent beside the rounded weight.** The program says 70 % of
    -- 102.5 = 71.75 kg and the bar makes 72.5 kg; storing only the rounded number
    -- loses the intent and makes the next percentage compound the rounding error.
    "unroundedWorkingWeightKg" REAL,
    -- Authored state, and deliberately not an `ExerciseThreshold` construct: a 1RM
    -- computed for a chart may be recomputed freely, while a training max is state
    -- whose whole cycle is wrong if it is wrong, and it must not enter the record
    -- machinery (ADR 0021's carve-out).
    "trainingMaxKg" REAL,
    -- Explicit and visible, never a silent multiplier: 85 % of a 90 % training max
    -- is 76.5 % of the true 1RM, below the band where `% 1RM` is portable at all.
    -- The training max has no evidence base and ships as a documented product
    -- convention.
    "workingFraction" REAL,
    -- Consecutive sessions this lift has failed its predicate. **Stored, not
    -- derived at read time** — the two published counters differ, and the app's
    -- (consecutive incomplete sessions) is the one that survives an out-of-order
    -- log. Reset to 0 on any success.
    "stallCount" INTEGER NOT NULL DEFAULT 0,
    -- JSON `Increment`, and **mutable**: Starting Strength shrinks it at the same
    -- moment it cuts the weight, so the increment is state and not only a rule.
    "currentIncrement" TEXT NOT NULL,
    -- The three settings the reference product exposes per exercise. Columns rather
    -- than a JSON blob on the instance so a query can see them; the increment
    -- override *is* `currentIncrement`, so there is no second field to disagree
    -- with it. NULL = use the definition's rule.
    "stallCutPctOverride" REAL,
    "progressEveryNSessionsOverride" INTEGER,
    -- JSON `{ sessionId, weightKg, succeeded }[]`. A **Weight Rollback** needs a
    -- weight this lift actually used before, and no rule can reconstruct it. JSON
    -- rather than a child table: read only with its parent, appended in the same
    -- transaction that advances the state, never queried across athletes.
    "weightHistory" TEXT NOT NULL DEFAULT '[]',
    -- JSON `{ sessionId, fromKg, toKg, response }[]`. **Not needed to compute the
    -- next weight.** It exists to answer *"why did my squat drop 10 kg?"* honestly
    -- — the Load Recompute Notice pattern one level down, told once, with a reason,
    -- and never as an offer.
    "stallHistory" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProgramLiftState_weight_is_positive" CHECK ("currentWorkingWeightKg" > 0),
    CONSTRAINT "ProgramLiftState_stall_count_is_not_negative" CHECK ("stallCount" >= 0),
    -- A fraction and not a percent, stated once here so two call sites cannot read
    -- 0.9 and 90 from the same column.
    CONSTRAINT "ProgramLiftState_fraction_is_a_fraction" CHECK ("workingFraction" IS NULL OR ("workingFraction" > 0 AND "workingFraction" <= 1)),
    CONSTRAINT "ProgramLiftState_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ProgramInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgramLiftState_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProgramLiftState_instanceId_exerciseId_equipment_key" ON "ProgramLiftState"("instanceId", "exerciseId", "equipment");
CREATE INDEX "ProgramLiftState_instanceId_idx" ON "ProgramLiftState"("instanceId");
CREATE INDEX "ProgramLiftState_exerciseId_idx" ON "ProgramLiftState"("exerciseId");
