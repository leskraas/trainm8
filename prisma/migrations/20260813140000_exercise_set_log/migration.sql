-- Give the strength track a performance side (ADR 0056;
-- docs/research/strength-tracker-surfaces.md §3 and §5;
-- docs/wayfinder/out-of-the-box/strength-destination.md layer 2).
--
-- There was none. `ExerciseSet` is a child of the *prescription* — no
-- `actualReps`, no `completedAt`, nothing — and no import path anywhere carries a
-- set: Strava and Intervals.icu both collapse `WeightTraining | Workout |
-- Crossfit` into a whole-activity summary, and FIT/TCX/GPX carry no set-by-set
-- data either. So a completed strength session's entire actual was
-- `sRPE = (durationSec / 3600) × rpe × 15`, which means an athlete could plan
-- `5 × 5 squat @ 100 kg` and record "it felt like an 8". `GOAL.md`'s
-- no-in-app-recorder non-goal is scoped to cardio in the same change, because
-- applied to strength it did not defer the plan↔actual loop, it foreclosed it.
--
-- A separate table rather than columns on `ExerciseSet`. The surveyed trackers
-- (liftosaur's `ISet`, wger's `WorkoutLog`) put target and actual in one row and
-- are right for their schema: there a program instance is per athlete per day.
-- Here `Workout` is 1:N with `WorkoutSession`, and a Catalogue member is a
-- Workout owned by nobody and read by everyone — so performed reps on
-- `ExerciseSet` would write one athlete's performance into shared corpus
-- content. The join is the price of the Catalogue.
--
-- `load` is a `LoadValue` union in JSON and **not** a `weightKg REAL`, which is
-- silently wrong on five equipment classes: an assisted machine's number
-- subtracts, a dumbbell's is per hand, a bodyweight movement's load is the
-- athlete, a machine stack's level is an ordinal with no mass behind it, and a
-- band has no kilos at all. `effectiveKg` is the derived kilo, baked at log time
-- and NULL where no honest one exists — recomputing it later would rewrite a
-- two-year-old weighted-dip record after a bodyweight change.
--
-- Nobody's numbers move. The table is new and empty, no existing column is read
-- or rewritten, and no stored figure changes value. No Load Recompute Notice is
-- owed.

-- CreateTable
CREATE TABLE "ExerciseSetLog" (
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
    CONSTRAINT "ExerciseSetLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkoutStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_exerciseSetId_fkey" FOREIGN KEY ("exerciseSetId") REFERENCES "ExerciseSet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExerciseSetLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- The occurrence, the exercise slot within it, and the position in the set list.
-- This is what makes a save from the logging grid an upsert rather than an
-- insert, so a double-tap between sets cannot log the same set twice.
CREATE UNIQUE INDEX "ExerciseSetLog_sessionId_stepId_orderIndex_key" ON "ExerciseSetLog"("sessionId", "stepId", "orderIndex");
CREATE INDEX "ExerciseSetLog_sessionId_idx" ON "ExerciseSetLog"("sessionId");
CREATE INDEX "ExerciseSetLog_stepId_idx" ON "ExerciseSetLog"("stepId");
-- Per-exercise history, newest first — the Set Ghost's "last time you did this
-- lift" and, later, the strength records.
CREATE INDEX "ExerciseSetLog_exerciseId_completedAt_idx" ON "ExerciseSetLog"("exerciseId", "completedAt");
