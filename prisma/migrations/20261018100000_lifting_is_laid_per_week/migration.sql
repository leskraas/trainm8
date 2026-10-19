-- **Lifting is laid per week** (#591, ADR 0104 §3): a third Week Pattern day
-- kind, `lifting`, a **lifting slot** the stamp places each week after that
-- week's endurance mix, away from its hard days. A slot carries the strength
-- session it copies and **no weekday**: nobody chose one, so `weekday` becomes
-- nullable, and the CHECK holds it `NULL` on a slot and on a slot only.
--
-- **No stored row changes.** SQLite cannot alter a CHECK or a column's
-- nullability in place, so the table is rebuilt the way Prisma redefines one:
-- a new table, every row copied across column for column — same `id`, same
-- `weekday`, `orderInDay`, `kind`, `weight`, `workoutId`, `patternId` and
-- `trackId` — the old one dropped and the new one renamed. Every existing
-- `fixed` day, a strength day from the first run or the strength offer among
-- them, stays `fixed` on its weekday: it is read as a **Pinned day** and is
-- never moved (ADR 0104 §4). Nothing is migrated to `lifting`.
--
-- **No stored number moves**, and no Load Recompute Notice is owed: no
-- session, load or volume is touched.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WeekPatternDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekday" INTEGER CHECK ("weekday" BETWEEN 0 AND 6),
    "orderInDay" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('fixed', 'share', 'lifting')),
    "weight" REAL,
    "workoutId" TEXT,
    "patternId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    CONSTRAINT "WeekPatternDay_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WeekPatternDay_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WeekPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WeekPatternDay_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "TrainingTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- A fixed day is a Workout stamped as authored; a share day carries a
    -- weight; both fall on a weekday. A lifting slot is the session it copies
    -- and falls on no weekday until the stamp lays it.
    CONSTRAINT "WeekPatternDay_kind_fields" CHECK (
        ("kind" = 'fixed' AND "weekday" IS NOT NULL AND "workoutId" IS NOT NULL AND "weight" IS NULL)
        OR ("kind" = 'share' AND "weekday" IS NOT NULL AND "weight" IS NOT NULL AND "weight" > 0)
        OR ("kind" = 'lifting' AND "weekday" IS NULL AND "workoutId" IS NOT NULL AND "weight" IS NULL)
    )
);
INSERT INTO "new_WeekPatternDay" ("id", "weekday", "orderInDay", "kind", "weight", "workoutId", "patternId", "trackId")
SELECT "id", "weekday", "orderInDay", "kind", "weight", "workoutId", "patternId", "trackId" FROM "WeekPatternDay";
DROP TABLE "WeekPatternDay";
ALTER TABLE "new_WeekPatternDay" RENAME TO "WeekPatternDay";
CREATE INDEX "WeekPatternDay_trackId_idx" ON "WeekPatternDay"("trackId");
CREATE INDEX "WeekPatternDay_workoutId_idx" ON "WeekPatternDay"("workoutId");
CREATE UNIQUE INDEX "WeekPatternDay_patternId_weekday_orderInDay_key" ON "WeekPatternDay"("patternId", "weekday", "orderInDay");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
