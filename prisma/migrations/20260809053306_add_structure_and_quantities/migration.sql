-- AlterTable
ALTER TABLE "ExerciseSet" ADD COLUMN "effortCap" TEXT;
ALTER TABLE "ExerciseSet" ADD COLUMN "load" TEXT;
ALTER TABLE "ExerciseSet" ADD COLUMN "tempo" TEXT;
ALTER TABLE "ExerciseSet" ADD COLUMN "terminationRir" REAL;
ALTER TABLE "ExerciseSet" ADD COLUMN "velocityLossPct" REAL;

-- AlterTable
ALTER TABLE "WorkoutStep" ADD COLUMN "cadenceRpmMax" INTEGER;
ALTER TABLE "WorkoutStep" ADD COLUMN "cadenceRpmMin" INTEGER;
ALTER TABLE "WorkoutStep" ADD COLUMN "gradePct" REAL;
ALTER TABLE "WorkoutStep" ADD COLUMN "rest" TEXT;
ALTER TABLE "WorkoutStep" ADD COLUMN "verticalM" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkoutBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "seriesRepeatCount" INTEGER NOT NULL DEFAULT 1,
    "betweenSeriesRestSec" INTEGER,
    "sendOff" TEXT,
    "workoutId" TEXT NOT NULL,
    CONSTRAINT "WorkoutBlock_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkoutBlock" ("id", "name", "orderIndex", "repeatCount", "workoutId") SELECT "id", "name", "orderIndex", "repeatCount", "workoutId" FROM "WorkoutBlock";
DROP TABLE "WorkoutBlock";
ALTER TABLE "new_WorkoutBlock" RENAME TO "WorkoutBlock";
CREATE INDEX "WorkoutBlock_workoutId_idx" ON "WorkoutBlock"("workoutId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
