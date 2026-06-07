-- AlterTable
ALTER TABLE "Event" ADD COLUMN "planOutline" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkoutSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "tssValue" REAL,
    "tssFormula" TEXT,
    "tssConfidence" TEXT,
    "source" TEXT NOT NULL DEFAULT 'authored',
    "generationId" TEXT,
    "generatedByModel" TEXT,
    "generatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT,
    "recordingId" TEXT,
    "targetEventId" TEXT,
    CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSession_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSession_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "ActivityImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSession_targetEventId_fkey" FOREIGN KEY ("targetEventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkoutSession" ("createdAt", "id", "recordingId", "scheduledAt", "status", "tssConfidence", "tssFormula", "tssValue", "updatedAt", "userId", "workoutId") SELECT "createdAt", "id", "recordingId", "scheduledAt", "status", "tssConfidence", "tssFormula", "tssValue", "updatedAt", "userId", "workoutId" FROM "WorkoutSession";
DROP TABLE "WorkoutSession";
ALTER TABLE "new_WorkoutSession" RENAME TO "WorkoutSession";
CREATE INDEX "WorkoutSession_userId_idx" ON "WorkoutSession"("userId");
CREATE INDEX "WorkoutSession_userId_scheduledAt_idx" ON "WorkoutSession"("userId", "scheduledAt");
CREATE INDEX "WorkoutSession_targetEventId_idx" ON "WorkoutSession"("targetEventId");
CREATE INDEX "WorkoutSession_generationId_idx" ON "WorkoutSession"("generationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
