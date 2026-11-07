-- **A plan holds its own copy of every Workout its Week Pattern days use**
-- (#665, ADR 0112). A Week Pattern day held its Workout by reference, and the
-- row was usually a Workout Session's own (ADR 0003): editing the session
-- changed the pattern, and deleting it failed on `WeekPatternDay_kind_fields`.
--
-- Schema:
--
-- - `Workout.heldByOutlineId`, a foreign key to `PlanOutline` with
--   `ON DELETE CASCADE`: the **Held Workout** mark. A held row is the plan's
--   private copy, and its days may share it (ADR 0112 §2).
-- - `Workout_held_is_athletes`: a held row is athlete-authored. An
--   implication only, and it does not require `ownerId`: the owner's
--   `SET NULL` and the plan's cascade run in an order SQLite ties to table
--   order, and a CHECK on the owner made a plain user delete fail (ADR 0112 §6).
-- - `WeekPatternDay.workoutId` is `ON DELETE NO ACTION`, no longer
--   `SET NULL`: checked at the end of the statement, so a cascade that removes
--   a plan's days and its held rows passes in any order (ADR 0112 §7).
--
-- SQLite cannot add a CHECK or change a foreign key in place, so both tables
-- are rebuilt the way Prisma redefines one, and every CHECK Prisma does not
-- model is written again by hand, word for word, as
-- `20260814120000_strength_anchors_programs_and_variants` and
-- `20261018100000_lifting_is_laid_per_week` did. The two composite unique
-- indexes `CatalogueEntry` points at are kept.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WeekPatternDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekday" INTEGER CHECK ("weekday" BETWEEN 0 AND 6),
    "orderInDay" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('fixed', 'share', 'lifting')),
    "weight" REAL,
    "workoutId" TEXT,
    "patternId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    CONSTRAINT "WeekPatternDay_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "WeekPatternDay_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WeekPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WeekPatternDay_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "TrainingTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- A fixed day is a Workout stamped as authored; a share day carries a
    -- weight; both fall on a weekday. A lifting slot is the session it copies
    -- and falls on no weekday until the stamp lays it.
    CONSTRAINT "WeekPatternDay_kind_fields" CHECK (
        ("kind" = 'fixed' AND "weekday" IS NOT NULL AND "workoutId" IS NOT NULL AND "weight" IS NULL)
        OR ("kind" = 'share' AND "weekday" IS NOT NULL AND "weight" IS NOT NULL AND "weight" > 0)
        OR ("kind" = 'lifting' AND "weekday" IS NULL AND "workoutId" IS NOT NULL AND "weight" IS NULL)
    )
);
INSERT INTO "new_WeekPatternDay" ("id", "kind", "orderInDay", "patternId", "trackId", "weekday", "weight", "workoutId") SELECT "id", "kind", "orderInDay", "patternId", "trackId", "weekday", "weight", "workoutId" FROM "WeekPatternDay";
DROP TABLE "WeekPatternDay";
ALTER TABLE "new_WeekPatternDay" RENAME TO "WeekPatternDay";
CREATE INDEX "WeekPatternDay_trackId_idx" ON "WeekPatternDay"("trackId");
CREATE INDEX "WeekPatternDay_workoutId_idx" ON "WeekPatternDay"("workoutId");
CREATE UNIQUE INDEX "WeekPatternDay_patternId_weekday_orderInDay_key" ON "WeekPatternDay"("patternId", "weekday", "orderInDay");
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
    "activityKind" TEXT,
    "effortWord" TEXT,
    -- Asserted, never inferred from `ownerId IS NULL`.
    "authorship" TEXT NOT NULL DEFAULT 'athlete' CHECK ("authorship" IN ('system', 'athlete')),
    -- Who may read it. `public` is reachable from #452 onward and only through
    -- the publish flow, which owes an Attribution for every row it writes here.
    "visibility" TEXT NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('private', 'public')),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT,
    "copiedFromId" TEXT,
    "heldByOutlineId" TEXT,
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
    -- A Held Workout is the athlete's copy, never trainm8's (ADR 0112 §6). The
    -- implication only: the owner is written by the app and not required here,
    -- because the owner's SET NULL may run before the plan's cascade.
    CONSTRAINT "Workout_held_is_athletes" CHECK ("heldByOutlineId" IS NULL OR "authorship" = 'athlete'),
    CONSTRAINT "Workout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Workout_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "Workout" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Workout_heldByOutlineId_fkey" FOREIGN KEY ("heldByOutlineId") REFERENCES "PlanOutline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Workout" ("activityKind", "archetype", "authorship", "copiedFromId", "createdAt", "description", "discipline", "effortWord", "id", "intent", "ownerId", "strengthGoal", "title", "updatedAt", "visibility") SELECT "activityKind", "archetype", "authorship", "copiedFromId", "createdAt", "description", "discipline", "effortWord", "id", "intent", "ownerId", "strengthGoal", "title", "updatedAt", "visibility" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE INDEX "Workout_ownerId_idx" ON "Workout"("ownerId");
CREATE INDEX "Workout_copiedFromId_idx" ON "Workout"("copiedFromId");
CREATE INDEX "Workout_heldByOutlineId_idx" ON "Workout"("heldByOutlineId");
CREATE UNIQUE INDEX "Workout_id_authorship_key" ON "Workout"("id", "authorship");
CREATE UNIQUE INDEX "Workout_id_authorship_archetype_key" ON "Workout"("id", "authorship", "archetype");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Existing plans (ADR 0112 §8). This is athlete data, not corpus: nothing is
-- seeded, and `production-seed-data.md`'s dump procedure does not apply.
--
-- For each plan, each Workout its days use is either:
--
-- - **marked held** in place, when nothing but that plan's days uses it: the
--   athlete's own private row, with no session, no other plan's day, no
--   Catalogue Entry, Attribution, save or Program day on it; or
-- - **deep-copied** once for the plan (Workout, WorkoutBlock, WorkoutStep,
--   ExerciseSet), owned by the plan's athlete, `copiedFromId` at the source,
--   and the plan's days repointed at the copy. That is every row a session, a
--   Stock Workout or another plan shares.
--
-- The copy carries exactly the columns `copyWorkout` does
-- (`workoutCopySelect`): `visibility` and `strengthGoal` are not carried, and
-- `authorship` is the athlete's. Every new id is the source row's id and the
-- plan's id joined by a dot, so one `INSERT … SELECT` per table chains the
-- copy with no mapping table, and the next stamped week is the one before
-- (`held-workouts-migration.server.test.ts`).
--
-- The statements below the marker are what that test runs.
-- backfill
CREATE TABLE "_HeldWorkoutBackfill" (
    "outlineId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "copy" INTEGER NOT NULL,
    PRIMARY KEY ("outlineId", "workoutId")
);

INSERT INTO "_HeldWorkoutBackfill" ("outlineId", "workoutId", "copy")
SELECT DISTINCT p."outlineId", w."id",
    CASE WHEN w."authorship" = 'athlete'
        AND w."ownerId" = o."athleteId"
        AND w."visibility" = 'private'
        AND w."heldByOutlineId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "WorkoutSession" s WHERE s."workoutId" = w."id")
        AND NOT EXISTS (
            SELECT 1 FROM "WeekPatternDay" od
            JOIN "WeekPattern" op ON op."id" = od."patternId"
            WHERE od."workoutId" = w."id" AND op."outlineId" <> p."outlineId"
        )
        AND NOT EXISTS (SELECT 1 FROM "CatalogueEntry" e WHERE e."workoutId" = w."id")
        AND NOT EXISTS (SELECT 1 FROM "Attribution" a WHERE a."workoutId" = w."id")
        AND NOT EXISTS (SELECT 1 FROM "CatalogueSave" cs WHERE cs."workoutId" = w."id")
        AND NOT EXISTS (SELECT 1 FROM "StrengthProgramDay" pd WHERE pd."workoutId" = w."id")
    THEN 0 ELSE 1 END
FROM "WeekPatternDay" d
JOIN "WeekPattern" p ON p."id" = d."patternId"
JOIN "PlanOutline" o ON o."id" = p."outlineId"
JOIN "Workout" w ON w."id" = d."workoutId"
WHERE w."heldByOutlineId" IS NULL OR w."heldByOutlineId" <> p."outlineId";

INSERT INTO "Workout" ("id", "title", "description", "discipline", "intent", "archetype", "activityKind", "effortWord", "authorship", "visibility", "createdAt", "updatedAt", "ownerId", "copiedFromId", "heldByOutlineId")
SELECT w."id" || '.' || h."outlineId", w."title", w."description", w."discipline", w."intent", w."archetype", w."activityKind", w."effortWord", 'athlete', 'private',
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
    o."athleteId", w."id", h."outlineId"
FROM "_HeldWorkoutBackfill" h
JOIN "Workout" w ON w."id" = h."workoutId"
JOIN "PlanOutline" o ON o."id" = h."outlineId"
WHERE h."copy" = 1;

INSERT INTO "WorkoutBlock" ("id", "name", "orderIndex", "repeatCount", "seriesRepeatCount", "betweenSeriesRestSec", "sendOff", "workoutId")
SELECT b."id" || '.' || h."outlineId", b."name", b."orderIndex", b."repeatCount", b."seriesRepeatCount", b."betweenSeriesRestSec", b."sendOff", b."workoutId" || '.' || h."outlineId"
FROM "_HeldWorkoutBackfill" h
JOIN "WorkoutBlock" b ON b."workoutId" = h."workoutId"
WHERE h."copy" = 1;

INSERT INTO "WorkoutStep" ("id", "kind", "notes", "orderIndex", "discipline", "intensity", "durationSec", "distanceM", "verticalM", "gradePctMin", "gradePctMax", "cadenceRpmMin", "cadenceRpmMax", "rest", "exerciseId", "restBetweenSetsSec", "intensityHrMin", "intensityHrMax", "intensityPowerMin", "intensityPowerMax", "intensityPaceMin", "intensityPaceMax", "blockId")
SELECT s."id" || '.' || h."outlineId", s."kind", s."notes", s."orderIndex", s."discipline", s."intensity", s."durationSec", s."distanceM", s."verticalM", s."gradePctMin", s."gradePctMax", s."cadenceRpmMin", s."cadenceRpmMax", s."rest", s."exerciseId", s."restBetweenSetsSec", s."intensityHrMin", s."intensityHrMax", s."intensityPowerMin", s."intensityPowerMax", s."intensityPaceMin", s."intensityPaceMax", s."blockId" || '.' || h."outlineId"
FROM "_HeldWorkoutBackfill" h
JOIN "WorkoutBlock" b ON b."workoutId" = h."workoutId"
JOIN "WorkoutStep" s ON s."blockId" = b."id"
WHERE h."copy" = 1;

INSERT INTO "ExerciseSet" ("id", "orderIndex", "kind", "load", "weightKg", "pct1RM", "effortCap", "tempo", "reps", "durationSec", "terminationRir", "velocityLossPct", "stepId")
SELECT e."id" || '.' || h."outlineId", e."orderIndex", e."kind", e."load", e."weightKg", e."pct1RM", e."effortCap", e."tempo", e."reps", e."durationSec", e."terminationRir", e."velocityLossPct", e."stepId" || '.' || h."outlineId"
FROM "_HeldWorkoutBackfill" h
JOIN "WorkoutBlock" b ON b."workoutId" = h."workoutId"
JOIN "WorkoutStep" s ON s."blockId" = b."id"
JOIN "ExerciseSet" e ON e."stepId" = s."id"
WHERE h."copy" = 1;

UPDATE "WeekPatternDay"
SET "workoutId" = "workoutId" || '.' || (SELECT p."outlineId" FROM "WeekPattern" p WHERE p."id" = "WeekPatternDay"."patternId")
WHERE EXISTS (
    SELECT 1 FROM "_HeldWorkoutBackfill" h
    JOIN "WeekPattern" p ON p."outlineId" = h."outlineId"
    WHERE p."id" = "WeekPatternDay"."patternId"
        AND h."workoutId" = "WeekPatternDay"."workoutId"
        AND h."copy" = 1
);

UPDATE "Workout"
SET "heldByOutlineId" = (
    SELECT h."outlineId" FROM "_HeldWorkoutBackfill" h
    WHERE h."workoutId" = "Workout"."id" AND h."copy" = 0
)
WHERE "id" IN (SELECT "workoutId" FROM "_HeldWorkoutBackfill" WHERE "copy" = 0);

DROP TABLE "_HeldWorkoutBackfill";
