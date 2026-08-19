-- **A logged set outlives the prescription it answered.** `ExerciseSetLog.stepId`
-- becomes nullable and its foreign key becomes `ON DELETE SET NULL` (ADR 0056 §2).
--
-- **No stored number moves. No Load Recompute Notice is owed.** Nothing here
-- touches a load, a rep, an effective kilo, a bodyweight, a 1RM, a training max,
-- a working weight, a Stall Count, or any weight or stall history. Every value in
-- every `ExerciseSetLog` row is carried across byte for byte, including `stepId`
-- itself — no row is detached by this migration. The only change is what a
-- *future* deletion of a `WorkoutStep` does: it used to take the athlete's logged
-- sets with it, and now it leaves them standing with `stepId` NULL.
--
-- ## What was wrong
--
-- `20260813140000` gave the column `ON DELETE CASCADE`. The session-detail editor
-- saved an edit by deleting every `WorkoutBlock` of the Workout and re-creating
-- the subtree, so every Step got a **new id** on every save — and the cascade
-- then deleted every set the athlete had logged against the old ids. Changing one
-- step's exercise from a Dip to a bench press destroyed all five logged sets of
-- the session, with no warning and no undo.
--
-- ADR 0056 §2 had already reasoned the case out for the sibling column and got it
-- right: `exerciseSetId` is *"nullable on purpose"* with `SET NULL`, precisely so
-- that *"an athlete who felt good and did a sixth set has a real set with no
-- prescribed row to answer, and `SET NULL` keeps that set after a later edit
-- deletes the row it pointed at."* The identical care was simply not taken one
-- level up. It is taken here.
--
-- Two other changes ship with this one, and this migration is the floor under
-- both rather than the fix:
--
-- 1. `updateWorkoutSession` now **reconciles the subtree in place**, so an
--    ordinary edit keeps its Step ids and the cascade never fires at all.
-- 2. An edit that would change a Step's exercise, drop the Step, or change its
--    kind while sets are logged against it is **refused**, and the editor says so
--    before the athlete tries — silently re-pointing somebody's logged sets at a
--    lift they did not do would be its own lie.
--
-- This column is what covers every *other* path a Step can die by — deleting a
-- Workout, replacing a superseded generated one, a future cascade nobody has
-- written yet. On those paths the athlete keeps the sets they lifted.
--
-- ## The unique key does not change, and the double-tap guarantee holds
--
-- `(sessionId, stepId, orderIndex)` stays exactly as ADR 0056 §2 specified it,
-- and `saveLoggedSet` stays an upsert on it. The reason it is still sound with a
-- nullable column: **logging always names a live Step.** `saveLoggedSet` resolves
-- the Step row before it writes, so every row the upsert can create or match has
-- a non-null `stepId`, and the index constrains those rows exactly as before. The
-- between-sets double-tap is therefore still one row, unchanged.
--
-- A NULL `stepId` only ever arrives *later*, from a deletion, and such a row is
-- never an upsert target again — there is no live Step to name it by. SQLite
-- treats NULLs as distinct in a unique index, which is the property this relies
-- on twice over: several detached sets may share a `(sessionId, orderIndex)`, and
-- a detached set never collides with the live set that takes over its slot. It is
-- the same reasoning `ExerciseThreshold`'s nullable `reps` already rests on.
--
-- The **stable per-exercise discriminator a detached row still carries is
-- `exerciseId`**, denormalized at log time for exactly this reason (*"survives the
-- Step being edited away"*), so `(exerciseId, completedAt)` history, the records
-- and the anchors all read a detached set unchanged. What a detached set loses is
-- its place in a prescription, which is precisely the thing that no longer exists.
--
-- ## What an existing dev database needs, and what production will do
--
-- A dev database needs `npx prisma migrate deploy` and nothing else — no reset, no
-- re-seed, no backfill. Row counts before and after are identical.
--
-- Production has **no `ExerciseSetLog` rows at all**, so the table rebuild copies
-- zero rows and the change is schema-only there.
--
-- Re-running is safe and safe on partial prior state: the scratch table is dropped
-- first if a previous attempt left one, the rebuild is a straight copy of every
-- column, and the definition below is the target definition — so a second
-- application lands on the same table with the same rows.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "new_ExerciseSetLog";

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
    -- **Nullable, and `SET NULL` below.** The prescription slot this set answered.
    -- NULL means that slot is gone and the set is not: the athlete lifted it, and
    -- an edit to the prescription is not a claim that they did not. `exerciseId`
    -- below still says which lift it was, which is what every history, record and
    -- anchor reads. Logging always names a live Step, so the upsert key
    -- (sessionId, stepId, orderIndex) still constrains every row it can reach.
    "stepId" TEXT,
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
    CONSTRAINT "ExerciseSetLog_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkoutStep" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_exerciseSetId_fkey" FOREIGN KEY ("exerciseSetId") REFERENCES "ExerciseSet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ExerciseVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_ExerciseSetLog" ("id", "orderIndex", "role", "outcome", "toFailure", "load", "effectiveKg", "bodyweightKg", "reps", "repsLeft", "durationSec", "rir", "restTakenSec", "completedAt", "createdAt", "updatedAt", "sessionId", "stepId", "exerciseSetId", "exerciseId", "variantId")
SELECT "id", "orderIndex", "role", "outcome", "toFailure", "load", "effectiveKg", "bodyweightKg", "reps", "repsLeft", "durationSec", "rir", "restTakenSec", "completedAt", "createdAt", "updatedAt", "sessionId", "stepId", "exerciseSetId", "exerciseId", "variantId"
  FROM "ExerciseSetLog";
DROP TABLE "ExerciseSetLog";
ALTER TABLE "new_ExerciseSetLog" RENAME TO "ExerciseSetLog";
CREATE UNIQUE INDEX "ExerciseSetLog_sessionId_stepId_orderIndex_key" ON "ExerciseSetLog"("sessionId", "stepId", "orderIndex");
CREATE INDEX "ExerciseSetLog_sessionId_idx" ON "ExerciseSetLog"("sessionId");
CREATE INDEX "ExerciseSetLog_stepId_idx" ON "ExerciseSetLog"("stepId");
CREATE INDEX "ExerciseSetLog_exerciseId_completedAt_idx" ON "ExerciseSetLog"("exerciseId", "completedAt");
CREATE INDEX "ExerciseSetLog_variantId_completedAt_idx" ON "ExerciseSetLog"("variantId", "completedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
