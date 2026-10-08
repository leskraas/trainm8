-- Imports on I dag (#505 stories 78–82, ADR 0049 as amended).
--
-- 1. `ActivityImport.linkAnsweredAt` — when the athlete answered for an import
--    ("hva var dette?", Angre kobling, Koble igjen). Null on every existing
--    row: nobody has answered yet.
-- 2. `ActivityImport.unlinkedFromSessionId` — the planned session an Angre
--    kobling lifted the import off, so Koble igjen can put it back. FK, set
--    null when that session is deleted. Null on every existing row.
-- 3. `WorkoutSession.markedDoneAt` — the athlete marked the session done by
--    hand (Gjort). Null on every existing row.
-- 4. A correction, and the one place a number can move: a planned session
--    that holds a Recording is done. Linking a Recording onto a planned session
--    never set its status, so a matched session in the past read as "ikke
--    gjort" on I dag and was left out of the Actual Volume, while Training Load
--    already counted its import. Every session holding a Recording now reads
--    `completed`. No TSS or snapshot is rewritten here; the next load
--    recompute prices those sessions from the same import Training Load
--    already counted, so the load itself does not move. No corpus data ships.

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN "markedDoneAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActivityImport" (
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
    "hrMax" REAL,
    "powerAvg" REAL,
    "powerMax" REAL,
    "powerWeightedAvg" REAL,
    "cadenceAvg" REAL,
    "paceAvgSecPerKm" REAL,
    "speedMaxMps" REAL,
    "elevationGainM" REAL,
    "kilojoules" REAL,
    "polyline" TEXT,
    "phaseBarsJson" TEXT,
    "lapsJson" TEXT,
    "rawJson" TEXT NOT NULL,
    "promotedSessionId" TEXT,
    "linkAnsweredAt" DATETIME,
    "unlinkedFromSessionId" TEXT,
    "tssValue" REAL,
    "tssFormula" TEXT,
    "tssConfidence" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityImport_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityImport_promotedSessionId_fkey" FOREIGN KEY ("promotedSessionId") REFERENCES "WorkoutSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityImport_unlinkedFromSessionId_fkey" FOREIGN KEY ("unlinkedFromSessionId") REFERENCES "WorkoutSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ActivityImport" ("athleteId", "cadenceAvg", "createdAt", "discipline", "distanceM", "durationSec", "elevationGainM", "endedAt", "externalId", "externalProvider", "hrAvg", "hrMax", "id", "kilojoules", "lapsJson", "paceAvgSecPerKm", "phaseBarsJson", "polyline", "powerAvg", "powerMax", "powerWeightedAvg", "promotedSessionId", "rawJson", "speedMaxMps", "startedAt", "tssConfidence", "tssFormula", "tssValue") SELECT "athleteId", "cadenceAvg", "createdAt", "discipline", "distanceM", "durationSec", "elevationGainM", "endedAt", "externalId", "externalProvider", "hrAvg", "hrMax", "id", "kilojoules", "lapsJson", "paceAvgSecPerKm", "phaseBarsJson", "polyline", "powerAvg", "powerMax", "powerWeightedAvg", "promotedSessionId", "rawJson", "speedMaxMps", "startedAt", "tssConfidence", "tssFormula", "tssValue" FROM "ActivityImport";
DROP TABLE "ActivityImport";
ALTER TABLE "new_ActivityImport" RENAME TO "ActivityImport";
CREATE INDEX "ActivityImport_athleteId_idx" ON "ActivityImport"("athleteId");
CREATE UNIQUE INDEX "ActivityImport_externalProvider_externalId_key" ON "ActivityImport"("externalProvider", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 4. A session holding a Recording is done.
UPDATE "WorkoutSession" SET "status" = 'completed'
WHERE "recordingId" IS NOT NULL AND "status" <> 'completed';
