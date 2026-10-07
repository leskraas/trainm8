-- **A Plan Outline may be open-ended, and owns itself.** (#505, ADR 0079.)
--
-- - `PlanOutline.athleteId`: the plan's owner in its own column, because an
--   open-ended plan has no Event to read its owner through. Backfilled from
--   the anchoring Event's `athleteId`; every existing outline has an Event.
-- - `PlanOutline.eventId` becomes optional. Still unique: one plan per Event,
--   and SQLite lets any number of rows hold NULL. A NULL Event is an
--   open-ended plan: no Event and no end date.
-- - `WorkoutSession.planOutlineId` (FK, SET NULL on delete): the plan that laid
--   the session. Clearing, occupancy and counting scope by it, since an
--   open-ended plan has no `targetEventId` to scope by. Backfilled by joining
--   `targetEventId` to `PlanOutline.eventId`, so every session a plan laid
--   before today is scoped exactly as it was.
-- - `PlanOutlinePhase.recoveryWeekIndex`: which week of a phase is the easy
--   one, when the athlete chooses (#505 story 74). Null on every row, which
--   keeps the rhythm's own position.
--
-- **No stored number moves. No Load Recompute Notice is owed.** Only new
-- columns and their backfills; no TSS, volume, target or status is rewritten,
-- and no corpus data ships here.

-- AlterTable
ALTER TABLE "PlanOutlinePhase" ADD COLUMN "recoveryWeekIndex" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlanOutline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startWeekKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "athleteId" TEXT NOT NULL,
    "eventId" TEXT,
    CONSTRAINT "PlanOutline_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanOutline_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- The owner comes from the Event every existing outline anchors to.
INSERT INTO "new_PlanOutline" ("athleteId", "createdAt", "eventId", "id", "startWeekKey", "updatedAt") SELECT "Event"."athleteId", "PlanOutline"."createdAt", "PlanOutline"."eventId", "PlanOutline"."id", "PlanOutline"."startWeekKey", "PlanOutline"."updatedAt" FROM "PlanOutline" JOIN "Event" ON "Event"."id" = "PlanOutline"."eventId";
DROP TABLE "PlanOutline";
ALTER TABLE "new_PlanOutline" RENAME TO "PlanOutline";
CREATE UNIQUE INDEX "PlanOutline_eventId_key" ON "PlanOutline"("eventId");
CREATE INDEX "PlanOutline_athleteId_idx" ON "PlanOutline"("athleteId");
CREATE TABLE "new_WorkoutSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "tssValue" REAL,
    "tssFormula" TEXT,
    "tssConfidence" TEXT,
    "plannedTssValue" REAL,
    "plannedTssConfidence" TEXT,
    "replanReason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'authored',
    "adoptedAt" DATETIME,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT,
    "recordingId" TEXT,
    "targetEventId" TEXT,
    "planOutlineId" TEXT,
    CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSession_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSession_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "ActivityImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSession_targetEventId_fkey" FOREIGN KEY ("targetEventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSession_planOutlineId_fkey" FOREIGN KEY ("planOutlineId") REFERENCES "PlanOutline" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- A session anchored to an outlined Event was laid by that Event's plan.
INSERT INTO "new_WorkoutSession" ("adoptedAt", "createdAt", "id", "plannedTssConfidence", "plannedTssValue", "recordingId", "releasedAt", "replanReason", "scheduledAt", "source", "status", "targetEventId", "tssConfidence", "tssFormula", "tssValue", "updatedAt", "userId", "workoutId", "planOutlineId") SELECT "adoptedAt", "createdAt", "id", "plannedTssConfidence", "plannedTssValue", "recordingId", "releasedAt", "replanReason", "scheduledAt", "source", "status", "targetEventId", "tssConfidence", "tssFormula", "tssValue", "updatedAt", "userId", "workoutId", (SELECT "PlanOutline"."id" FROM "PlanOutline" WHERE "PlanOutline"."eventId" = "WorkoutSession"."targetEventId") FROM "WorkoutSession";
DROP TABLE "WorkoutSession";
ALTER TABLE "new_WorkoutSession" RENAME TO "WorkoutSession";
CREATE INDEX "WorkoutSession_userId_idx" ON "WorkoutSession"("userId");
CREATE INDEX "WorkoutSession_userId_scheduledAt_idx" ON "WorkoutSession"("userId", "scheduledAt");
CREATE INDEX "WorkoutSession_targetEventId_idx" ON "WorkoutSession"("targetEventId");
CREATE INDEX "WorkoutSession_planOutlineId_idx" ON "WorkoutSession"("planOutlineId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
