-- The Simple Activities share a Training Track on `other` (#572, spec #558).
--
-- The start lays every Simple Activity on one hours track on Discipline
-- `other` (ADR 0015 §A): no Quality Session Mix and no zones, each activity a
-- fixed Week Pattern day. The track's Discipline vocabulary gains `other`;
-- nothing else changes. One track per Discipline still holds, so there is at
-- most one `other` track per plan. No backfill: no stored track is on `other`.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrainingTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discipline" TEXT NOT NULL CHECK ("discipline" IN ('run', 'swim', 'bike', 'strength', 'other')),
    "currency" TEXT NOT NULL CHECK ("currency" IN ('km', 'hours', 'tss', 'sets')),
    "outlineId" TEXT NOT NULL,
    CONSTRAINT "TrainingTrack_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "PlanOutline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TrainingTrack" ("id", "discipline", "currency", "outlineId") SELECT "id", "discipline", "currency", "outlineId" FROM "TrainingTrack";
DROP TABLE "TrainingTrack";
ALTER TABLE "new_TrainingTrack" RENAME TO "TrainingTrack";
CREATE UNIQUE INDEX "TrainingTrack_outlineId_discipline_key" ON "TrainingTrack"("outlineId", "discipline");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
