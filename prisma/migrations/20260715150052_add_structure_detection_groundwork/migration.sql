-- AlterTable
ALTER TABLE "ActivityImport" ADD COLUMN "lapsJson" TEXT;

-- CreateTable
CREATE TABLE "WorkoutDetection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "structureJson" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activityImportId" TEXT NOT NULL,
    CONSTRAINT "WorkoutDetection_activityImportId_fkey" FOREIGN KEY ("activityImportId") REFERENCES "ActivityImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    CONSTRAINT "Workout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Workout" ("createdAt", "description", "discipline", "id", "intent", "ownerId", "title", "updatedAt") SELECT "createdAt", "description", "discipline", "id", "intent", "ownerId", "title", "updatedAt" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE INDEX "Workout_ownerId_idx" ON "Workout"("ownerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutDetection_activityImportId_key" ON "WorkoutDetection"("activityImportId");
