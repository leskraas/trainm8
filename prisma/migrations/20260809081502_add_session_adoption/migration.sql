-- Separate **adoption** from **origin** on a Workout Session (#460, resolving
-- #458 and the live defect #459).
--
-- `source` stops doing two jobs. It keeps its origin value for the life of the
-- session; the athlete's takeover moves to `adoptedAt`, so re-detection
-- eligibility becomes `source = 'detected' AND adoptedAt IS NULL` — a question
-- that could not be asked while the takeover overwrote the origin.
--
-- **No backfill is possible, and that is the honest answer.** A session that
-- adopted under the old rule was rewritten to `authored`, so it is now
-- indistinguishable from one the athlete wrote by hand. Stamping a guessed
-- `adoptedAt` onto every `authored` session would invent provenance the database
-- no longer holds, so every row starts NULL and the lineage begins from the next
-- edit forward.
--
-- Dropped with it: `generationId`, `generatedByModel` and `generatedAt`. All
-- three were written by nothing and read by nothing — Plan Generation was
-- deleted (ADR 0044) and generation is deterministic anyway (#386), which makes
-- a model id meaningless by construction. ADR 0016's regeneration rule survives
-- unchanged in substance, expressed as `adoptedAt IS NULL` rather than as a
-- destroyed origin; when a regeneration batch returns it brings its own batch
-- key rather than inheriting a column that never held one.
--
-- SQLite cannot drop a column in place, so this is a table rebuild. The table
-- carries no CHECK constraints to carry forward (unlike `Workout`); the three
-- indexes are recreated below.
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
    "plannedTssValue" REAL,
    "plannedTssConfidence" TEXT,
    "replanReason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'authored',
    "adoptedAt" DATETIME,
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
INSERT INTO "new_WorkoutSession" ("createdAt", "id", "plannedTssConfidence", "plannedTssValue", "recordingId", "replanReason", "scheduledAt", "source", "status", "targetEventId", "tssConfidence", "tssFormula", "tssValue", "updatedAt", "userId", "workoutId") SELECT "createdAt", "id", "plannedTssConfidence", "plannedTssValue", "recordingId", "replanReason", "scheduledAt", "source", "status", "targetEventId", "tssConfidence", "tssFormula", "tssValue", "updatedAt", "userId", "workoutId" FROM "WorkoutSession";
DROP TABLE "WorkoutSession";
ALTER TABLE "new_WorkoutSession" RENAME TO "WorkoutSession";
CREATE INDEX "WorkoutSession_userId_idx" ON "WorkoutSession"("userId");
CREATE INDEX "WorkoutSession_userId_scheduledAt_idx" ON "WorkoutSession"("userId", "scheduledAt");
CREATE INDEX "WorkoutSession_targetEventId_idx" ON "WorkoutSession"("targetEventId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
