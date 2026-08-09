-- Performance Result (#449, ADR 0007): one dated maximal performance per
-- athlete — the queryable history a **Race Equivalence** resolves a `racePace`
-- Intensity Target from, and the table
-- `docs/research/portable-intensity-anchors.md` §7.2 calls "the single blocker
-- for the whole feature".
--
-- Additive only. Nothing else in this migration: `pacePct`, `lactate`,
-- `racePace` and `powerPct.ref` all live inside the authored Intensity Target
-- JSON on `WorkoutStep`, so no stored row moves and no column changes shape.
CREATE TABLE "PerformanceResult" (
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
    CONSTRAINT "PerformanceResult_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PerformanceResult_athleteProfileId_idx" ON "PerformanceResult"("athleteProfileId");

CREATE INDEX "PerformanceResult_athleteProfileId_discipline_distanceM_occurredAt_idx" ON "PerformanceResult"("athleteProfileId", "discipline", "distanceM", "occurredAt");
