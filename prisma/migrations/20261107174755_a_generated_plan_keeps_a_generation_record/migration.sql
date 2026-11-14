-- **A generated plan keeps a Generation Record** (ADR 0117, #686).
--
-- **No stored number moves.** This adds two tables and writes one
-- `GenerationRecord` row per plan Plan Generation made before the record
-- existed. No session, workout, target, load, Planned TSS or any row an athlete
-- authored is touched, so every athlete's numbers read exactly the same
-- afterwards and no Load Recompute Notice is owed.
--
-- ## The data part (ADR 0117 §5)
--
-- A Plan Outline was made by Plan Generation when it runs toward an Event, has
-- no Week Pattern day, and holds a `generated` session whose Workout was copied
-- from a `system` Workout with a Catalogue Entry. Each such plan gets a record
-- with generator id `deterministic-v1` (the only one there has been) and **no**
-- preset key and **no** intent, because neither was recorded: a null intent is
-- read as the default (`deliberately-building`), never written as if chosen.
-- No `GenerationRecordDay` rows: the days are weekdays in the athlete's
-- timezone, which SQLite cannot compute; the plan's first re-lay freezes them
-- from its own sessions in the same run.
--
-- The CHECKs state each column's vocabulary (`GENERATION_INTENTS`, the cardio
-- Disciplines, a Monday-first weekday, the day's role), as the plan's other
-- tables do: a bad write fails here rather than placing on the wrong day.
--
-- Deterministic and re-runnable: the id is `'genrec_' || outline.id`, the
-- timestamp a fixed epoch, and `INSERT OR IGNORE` (per
-- `docs/agents/production-seed-data.md`) never clobbers a record approval
-- already wrote. Applied twice to a throwaway database holding one generated,
-- one stamped and one authored plan: one record both times, equal counts.

-- CreateTable
CREATE TABLE "GenerationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outlineId" TEXT NOT NULL,
    "generatorId" TEXT NOT NULL,
    "presetKey" TEXT,
    "intent" TEXT CHECK ("intent" IS NULL OR "intent" IN ('first-season', 'returning-from-injury', 'deliberately-building')),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationRecord_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "PlanOutline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationRecordDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL CHECK ("discipline" IN ('run', 'swim', 'bike')),
    "weekday" INTEGER NOT NULL CHECK ("weekday" BETWEEN 0 AND 6),
    "role" TEXT NOT NULL CHECK ("role" IN ('long', 'ordinary')),
    CONSTRAINT "GenerationRecordDay_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "GenerationRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GenerationRecord_outlineId_key" ON "GenerationRecord"("outlineId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationRecordDay_recordId_discipline_weekday_key" ON "GenerationRecordDay"("recordId", "discipline", "weekday");


-- Plans Plan Generation made before this record existed (ADR 0117 §5).
INSERT OR IGNORE INTO "GenerationRecord" ("id", "outlineId", "generatorId", "presetKey", "intent", "createdAt")
SELECT 'genrec_' || o."id", o."id", 'deterministic-v1', NULL, NULL, '2026-11-07 00:00:00'
FROM "PlanOutline" o
WHERE o."eventId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "WeekPattern" p
    JOIN "WeekPatternDay" d ON d."patternId" = p."id"
    WHERE p."outlineId" = o."id"
  )
  AND EXISTS (
    SELECT 1 FROM "WorkoutSession" s
    JOIN "Workout" w ON w."id" = s."workoutId"
    JOIN "Workout" src ON src."id" = w."copiedFromId"
    JOIN "CatalogueEntry" c ON c."workoutId" = src."id"
    WHERE s."planOutlineId" = o."id"
      AND s."source" = 'generated'
      AND src."authorship" = 'system'
  );
