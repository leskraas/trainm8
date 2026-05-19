-- CreateTable
CREATE TABLE "ActivityImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "athleteId" TEXT NOT NULL,
    "externalProvider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "distanceM" REAL,
    "discipline" TEXT NOT NULL,
    "hrAvg" REAL,
    "powerAvg" REAL,
    "paceAvgSecPerKm" REAL,
    "polyline" TEXT,
    "rawJson" TEXT NOT NULL,
    "promotedSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityImport_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityImport_promotedSessionId_fkey" FOREIGN KEY ("promotedSessionId") REFERENCES "WorkoutSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkoutSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT,
    "recordingId" TEXT,
    CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSession_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSession_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "ActivityImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkoutSession" ("createdAt", "id", "scheduledAt", "status", "updatedAt", "userId", "workoutId") SELECT "createdAt", "id", "scheduledAt", "status", "updatedAt", "userId", "workoutId" FROM "WorkoutSession";
DROP TABLE "WorkoutSession";
ALTER TABLE "new_WorkoutSession" RENAME TO "WorkoutSession";
CREATE INDEX "WorkoutSession_userId_idx" ON "WorkoutSession"("userId");
CREATE INDEX "WorkoutSession_userId_scheduledAt_idx" ON "WorkoutSession"("userId", "scheduledAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ActivityImport_athleteId_idx" ON "ActivityImport"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityImport_externalProvider_externalId_key" ON "ActivityImport"("externalProvider", "externalId");
