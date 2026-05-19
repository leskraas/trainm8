-- CreateTable
CREATE TABLE "AthleteProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birthdate" DATETIME,
    "weightKg" REAL,
    "heightCm" REAL,
    "sex" TEXT,
    "preferredUnits" TEXT NOT NULL DEFAULT 'metric',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AthleteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisciplineProfile" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    CONSTRAINT "DisciplineProfile_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThresholdEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discipline" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "valueNumeric" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "effectiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "athleteProfileId" TEXT NOT NULL,
    CONSTRAINT "ThresholdEvent_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");

-- CreateIndex
CREATE INDEX "DisciplineProfile_athleteProfileId_idx" ON "DisciplineProfile"("athleteProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineProfile_athleteProfileId_discipline_key" ON "DisciplineProfile"("athleteProfileId", "discipline");

-- CreateIndex
CREATE INDEX "ThresholdEvent_athleteProfileId_idx" ON "ThresholdEvent"("athleteProfileId");

-- CreateIndex
CREATE INDEX "ThresholdEvent_athleteProfileId_discipline_idx" ON "ThresholdEvent"("athleteProfileId", "discipline");
