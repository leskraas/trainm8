-- One activity is one row (ADR 0096 §3-§5, #547).
--
-- `ActivityImportAlias` records every other source that delivered an activity
-- trainm8 already holds, so a second source becomes an alias instead of a
-- second session. `ActivityFile` keeps an import's original FIT bytes
-- (`fetchedVia`: how they reached trainm8). `fitHarvestedAt` marks an
-- Intervals.icu import whose original file the harvest has asked for. The
-- `fitFileKey` indexes serve the dedupe lookup on the FIT key. No backfill:
-- the harvest fills the keys and files.

-- AlterTable
ALTER TABLE "ActivityImport" ADD COLUMN "fitHarvestedAt" DATETIME;

-- CreateTable
CREATE TABLE "ActivityImportAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityImportId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "externalProvider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "originPlatform" TEXT NOT NULL DEFAULT 'unknown',
    "deviceName" TEXT,
    "fitFileKey" TEXT,
    "matchedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityImportAlias_activityImportId_fkey" FOREIGN KEY ("activityImportId") REFERENCES "ActivityImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityImportAlias_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityImportId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fetchedVia" TEXT NOT NULL,
    "bytes" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityFile_activityImportId_fkey" FOREIGN KEY ("activityImportId") REFERENCES "ActivityImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ActivityImportAlias_activityImportId_idx" ON "ActivityImportAlias"("activityImportId");

-- CreateIndex
CREATE INDEX "ActivityImportAlias_athleteId_fitFileKey_idx" ON "ActivityImportAlias"("athleteId", "fitFileKey");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityImportAlias_athleteId_externalProvider_externalId_key" ON "ActivityImportAlias"("athleteId", "externalProvider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityFile_activityImportId_key" ON "ActivityFile"("activityImportId");

-- CreateIndex
CREATE INDEX "ActivityImport_athleteId_fitFileKey_idx" ON "ActivityImport"("athleteId", "fitFileKey");

