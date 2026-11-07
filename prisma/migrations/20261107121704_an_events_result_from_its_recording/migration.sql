-- AlterTable
ALTER TABLE "Event" ADD COLUMN "distanceM" INTEGER;

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN "plannedTssOrigins" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PerformanceResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discipline" TEXT NOT NULL,
    "distanceM" INTEGER NOT NULL,
    "timeSec" INTEGER NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "eventId" TEXT,
    "activityImportId" TEXT,
    CONSTRAINT "PerformanceResult_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PerformanceResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PerformanceResult_activityImportId_fkey" FOREIGN KEY ("activityImportId") REFERENCES "ActivityImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PerformanceResult" ("athleteProfileId", "createdAt", "discipline", "distanceM", "id", "occurredAt", "source", "timeSec", "updatedAt", "verified") SELECT "athleteProfileId", "createdAt", "discipline", "distanceM", "id", "occurredAt", "source", "timeSec", "updatedAt", "verified" FROM "PerformanceResult";
DROP TABLE "PerformanceResult";
ALTER TABLE "new_PerformanceResult" RENAME TO "PerformanceResult";
CREATE UNIQUE INDEX "PerformanceResult_eventId_key" ON "PerformanceResult"("eventId");
CREATE INDEX "PerformanceResult_athleteProfileId_idx" ON "PerformanceResult"("athleteProfileId");
CREATE INDEX "PerformanceResult_athleteProfileId_discipline_distanceM_occurredAt_idx" ON "PerformanceResult"("athleteProfileId", "discipline", "distanceM", "occurredAt");
CREATE INDEX "PerformanceResult_activityImportId_idx" ON "PerformanceResult"("activityImportId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
