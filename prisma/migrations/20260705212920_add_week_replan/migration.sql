-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN "replanReason" TEXT;

-- CreateTable
CREATE TABLE "WeekReplan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "adherenceRatio" REAL,
    "tsb" REAL,
    "appliedScale" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "athleteId" TEXT NOT NULL,
    CONSTRAINT "WeekReplan_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WeekReplan_athleteId_idx" ON "WeekReplan"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "WeekReplan_athleteId_weekKey_key" ON "WeekReplan"("athleteId", "weekKey");
