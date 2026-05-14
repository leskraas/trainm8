-- AlterTable
ALTER TABLE "WorkoutStep" ADD COLUMN "distanceM" INTEGER;
ALTER TABLE "WorkoutStep" ADD COLUMN "durationSec" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkoutBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "workoutId" TEXT NOT NULL,
    CONSTRAINT "WorkoutBlock_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkoutBlock" ("id", "name", "orderIndex", "workoutId") SELECT "id", "name", "orderIndex", "workoutId" FROM "WorkoutBlock";
DROP TABLE "WorkoutBlock";
ALTER TABLE "new_WorkoutBlock" RENAME TO "WorkoutBlock";
CREATE INDEX "WorkoutBlock_workoutId_idx" ON "WorkoutBlock"("workoutId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
