-- A Simple Activity is a planned session (ADR 0015 §A, #567, spec #558).
--
-- A Workout on Discipline `other` may now be planned, as a Simple Activity: it
-- carries an Activity Kind and an Effort Word, and one timed step. Both are
-- NULL on every other Workout. No backfill: no stored Workout is on `other`.

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN "activityKind" TEXT;
ALTER TABLE "Workout" ADD COLUMN "effortWord" TEXT;
