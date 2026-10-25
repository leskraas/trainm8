-- Grade is a band (#466).
--
-- `WorkoutStep.gradePct` was a scalar, and every hill row in the research
-- states a band — `6–10 %`, `4–7 %`, a controlled `3–6 %` descent — so the
-- column could not hold what the corpus says and stayed null. It becomes a
-- signed min/max pair, the way cadence already is (`cadenceRpmMin` /
-- `cadenceRpmMax`).
--
-- **No stored number moves.** A step that stated one grade keeps it, as a band
-- whose two ends are that grade: the scalar is copied to both ends, so every
-- reader sees the same number it saw before. No load, duration or adherence
-- figure reads grade, so no Load Recompute Notice is owed.
--
-- **No data ships here.** This is a schema change only; nothing is seeded.
-- The Catalogue's hill rows gain their grade band in the corpus source
-- (`app/utils/catalogue-corpus.run.ts`), which reaches a database through the
-- Catalogue seed and not through a migration (`catalogue-seed.server.ts`
-- says why).
--
-- SQLite cannot drop a column in place under Prisma's diffing, so the table is
-- redefined the way Prisma generates it, with the copy written into the INSERT.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkoutStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'cardio',
    "notes" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "discipline" TEXT,
    "intensity" TEXT,
    "durationSec" INTEGER,
    "distanceM" INTEGER,
    "verticalM" INTEGER,
    "gradePctMin" REAL,
    "gradePctMax" REAL,
    "cadenceRpmMin" INTEGER,
    "cadenceRpmMax" INTEGER,
    "rest" TEXT,
    "exerciseId" TEXT,
    "restBetweenSetsSec" INTEGER,
    "intensityHrMin" INTEGER,
    "intensityHrMax" INTEGER,
    "intensityPowerMin" INTEGER,
    "intensityPowerMax" INTEGER,
    "intensityPaceMin" INTEGER,
    "intensityPaceMax" INTEGER,
    "blockId" TEXT NOT NULL,
    CONSTRAINT "WorkoutStep_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "WorkoutBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutStep_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkoutStep" ("blockId", "cadenceRpmMax", "cadenceRpmMin", "discipline", "distanceM", "durationSec", "exerciseId", "gradePctMax", "gradePctMin", "id", "intensity", "intensityHrMax", "intensityHrMin", "intensityPaceMax", "intensityPaceMin", "intensityPowerMax", "intensityPowerMin", "kind", "notes", "orderIndex", "rest", "restBetweenSetsSec", "verticalM") SELECT "blockId", "cadenceRpmMax", "cadenceRpmMin", "discipline", "distanceM", "durationSec", "exerciseId", "gradePct", "gradePct", "id", "intensity", "intensityHrMax", "intensityHrMin", "intensityPaceMax", "intensityPaceMin", "intensityPowerMax", "intensityPowerMin", "kind", "notes", "orderIndex", "rest", "restBetweenSetsSec", "verticalM" FROM "WorkoutStep";
DROP TABLE "WorkoutStep";
ALTER TABLE "new_WorkoutStep" RENAME TO "WorkoutStep";
CREATE INDEX "WorkoutStep_blockId_idx" ON "WorkoutStep"("blockId");
CREATE INDEX "WorkoutStep_exerciseId_idx" ON "WorkoutStep"("exerciseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
