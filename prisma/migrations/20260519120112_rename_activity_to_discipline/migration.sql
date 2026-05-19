/*
  Warnings:

  - You are about to drop the column `activityType` on the `Workout` table. All the data in the column will be lost.
  - You are about to drop the column `activity` on the `WorkoutStep` table. All the data in the column will be lost.
  - Added the required column `discipline` to the `Workout` table without a default value. This is not possible if the table is not empty.
  - Added the required column `discipline` to the `WorkoutStep` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    CONSTRAINT "Workout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Workout" ("createdAt", "description", "id", "ownerId", "title", "updatedAt") SELECT "createdAt", "description", "id", "ownerId", "title", "updatedAt" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE INDEX "Workout_ownerId_idx" ON "Workout"("ownerId");
CREATE TABLE "new_WorkoutStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "intensity" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "durationSec" INTEGER,
    "distanceM" INTEGER,
    "blockId" TEXT NOT NULL,
    CONSTRAINT "WorkoutStep_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "WorkoutBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkoutStep" ("blockId", "description", "distanceM", "durationSec", "id", "intensity", "orderIndex") SELECT "blockId", "description", "distanceM", "durationSec", "id", "intensity", "orderIndex" FROM "WorkoutStep";
DROP TABLE "WorkoutStep";
ALTER TABLE "new_WorkoutStep" RENAME TO "WorkoutStep";
CREATE INDEX "WorkoutStep_blockId_idx" ON "WorkoutStep"("blockId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
