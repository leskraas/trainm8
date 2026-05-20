-- AlterTable
ALTER TABLE "ActivityImport" ADD COLUMN "tssConfidence" TEXT;
ALTER TABLE "ActivityImport" ADD COLUMN "tssFormula" TEXT;
ALTER TABLE "ActivityImport" ADD COLUMN "tssValue" REAL;

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN "tssConfidence" TEXT;
ALTER TABLE "WorkoutSession" ADD COLUMN "tssFormula" TEXT;
ALTER TABLE "WorkoutSession" ADD COLUMN "tssValue" REAL;

-- CreateTable
CREATE TABLE "LoadSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "athleteId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "tssTotal" REAL NOT NULL DEFAULT 0,
    "tssByDiscipline" TEXT NOT NULL DEFAULT '{}',
    "ctl" REAL NOT NULL DEFAULT 0,
    "atl" REAL NOT NULL DEFAULT 0,
    "tsb" REAL NOT NULL DEFAULT 0,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoadSnapshot_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DisciplineProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discipline" TEXT NOT NULL,
    "maxHr" INTEGER,
    "lthr" INTEGER,
    "ftp" INTEGER,
    "thresholdPaceSecPerKm" INTEGER,
    "cssSecPer100m" INTEGER,
    "zoneSystem" TEXT,
    "zoneOverrides" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "preferCogganTss" BOOLEAN NOT NULL DEFAULT false,
    "preferRTSS" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    CONSTRAINT "DisciplineProfile_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DisciplineProfile" ("athleteProfileId", "createdAt", "cssSecPer100m", "discipline", "enabled", "ftp", "id", "lthr", "maxHr", "thresholdPaceSecPerKm", "updatedAt", "zoneOverrides", "zoneSystem") SELECT "athleteProfileId", "createdAt", "cssSecPer100m", "discipline", "enabled", "ftp", "id", "lthr", "maxHr", "thresholdPaceSecPerKm", "updatedAt", "zoneOverrides", "zoneSystem" FROM "DisciplineProfile";
DROP TABLE "DisciplineProfile";
ALTER TABLE "new_DisciplineProfile" RENAME TO "DisciplineProfile";
CREATE INDEX "DisciplineProfile_athleteProfileId_idx" ON "DisciplineProfile"("athleteProfileId");
CREATE UNIQUE INDEX "DisciplineProfile_athleteProfileId_discipline_key" ON "DisciplineProfile"("athleteProfileId", "discipline");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LoadSnapshot_athleteId_idx" ON "LoadSnapshot"("athleteId");

-- CreateIndex
CREATE INDEX "LoadSnapshot_athleteId_date_idx" ON "LoadSnapshot"("athleteId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LoadSnapshot_athleteId_date_key" ON "LoadSnapshot"("athleteId", "date");
