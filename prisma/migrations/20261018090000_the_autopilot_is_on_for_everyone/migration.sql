-- The autopilot is on for everyone (#583, spec #558, ADR 0100).
--
-- `AthleteProfile.autopilot` now defaults to true, so a new athlete starts on
-- it, and every athlete here is switched on. This is the data migration the
-- ticket asks for: it ships as a migration, never as seed data.
--
-- `AthleteProfile.autopilotIntroPending` marks an athlete the switch is news
-- to — one who had a plan and was on _Spør meg først_ — so their first notice
-- carries the one-time line (`WeekReplan.autopilotIntro`, claimed at that
-- close). A new athlete never had the old behaviour and gets no such line.
--
-- SQLite cannot change a column default in place, so AthleteProfile is
-- rebuilt with every column it has at this point. WeekReplan only gains a
-- column: a plain ADD COLUMN, no rebuild. The data step is below the
-- `-- backfill` marker, which `autopilot-for-everyone.server.test.ts` runs.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AthleteProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birthdate" DATETIME,
    "weightKg" REAL,
    "heightCm" REAL,
    "sex" TEXT,
    "preferredUnits" TEXT NOT NULL DEFAULT 'metric',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "autopilot" BOOLEAN NOT NULL DEFAULT true,
    "autopilotIntroPending" BOOLEAN NOT NULL DEFAULT false,
    "trainableWeekdays" TEXT,
    "defaultTrainingTime" TEXT,
    "weeklyCapacityHours" REAL,
    "trainingLevel" TEXT,
    "strengthPerWeek" INTEGER,
    "sessionPreferences" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AthleteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AthleteProfile" ("autopilot", "birthdate", "createdAt", "defaultTrainingTime", "heightCm", "id", "preferredUnits", "sessionPreferences", "sex", "strengthPerWeek", "timezone", "trainableWeekdays", "trainingLevel", "updatedAt", "userId", "weekStartsOn", "weeklyCapacityHours", "weightKg") SELECT "autopilot", "birthdate", "createdAt", "defaultTrainingTime", "heightCm", "id", "preferredUnits", "sessionPreferences", "sex", "strengthPerWeek", "timezone", "trainableWeekdays", "trainingLevel", "updatedAt", "userId", "weekStartsOn", "weeklyCapacityHours", "weightKg" FROM "AthleteProfile";
DROP TABLE "AthleteProfile";
ALTER TABLE "new_AthleteProfile" RENAME TO "AthleteProfile";
CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- AlterTable
ALTER TABLE "WeekReplan" ADD COLUMN "autopilotIntro" BOOLEAN NOT NULL DEFAULT false;

-- backfill
-- News only to an athlete who was on _Spør meg først_ with a plan.
UPDATE "AthleteProfile" SET "autopilotIntroPending" = true
WHERE "autopilot" = false
  AND EXISTS (SELECT 1 FROM "PlanOutline" WHERE "PlanOutline"."athleteId" = "AthleteProfile"."userId");
-- Every athlete here is switched on.
UPDATE "AthleteProfile" SET "autopilot" = true WHERE "autopilot" = false;
