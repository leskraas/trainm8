-- A Load Recompute Notice may carry no CTL pair (#463, ADR 0114).
--
-- `ctlBefore`/`ctlAfter` were `REAL NOT NULL`, so a correction with no CTL
-- movement to name had to invent one. The swim-pace backfill (ADR 0107 §2)
-- stored today's CTL on both sides, or `0` on both sides for a swimmer with no
-- Load Snapshots: a fabricated figure that reached the athlete's data export. A
-- prescription correction (ADR 0006's #444/#447 amendment) has no pair at all.
-- Both columns become nullable, and absent means "no CTL movement to name",
-- not an Unavailable Metric.
--
-- **The pair is both-or-neither.** A row with one side null means nothing, so
-- a hand-written CHECK refuses it.
-- `app/utils/load/recompute-notice.constraints.test.ts` pins it: a SQLite
-- table rebuild carries no CHECK
-- forward, so a later rebuild must restore it by hand, along with the unique
-- `(athleteId, kind)` index and the cascade, as this one does. The data step
-- is below the `-- backfill` marker; `recompute-notice.migration.test.ts` runs
-- the whole file against the old table.
--
-- **Every row is copied.** The `INSERT … SELECT` keeps each row's id, kind,
-- pair, `createdAt` and `dismissedAt`; none is dropped or duplicated.
--
-- **The swim placeholders go absent.** A `swim-rest-left-the-pace` row whose
-- two figures are equal is exactly the `latestCtl` placeholder and never a
-- measurement: `widestCtlMovement` only returns a pair that moved by at least
-- the noise floor. Those rows get NULL on both sides. Every
-- `strength-left-the-triad` row, and every swim row whose figures differ, keeps
-- its pair.
--
-- **No displayed number moves, so no Load Recompute Notice is owed**
-- (`docs/agents/production-seed-data.md` trap 5). An equal pair already showed
-- no movement line, and an absent pair shows none either. Nothing is seeded.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LoadRecomputeNotice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "ctlBefore" REAL,
    "ctlAfter" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" DATETIME,
    "athleteId" TEXT NOT NULL,
    CONSTRAINT "LoadRecomputeNotice_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoadRecomputeNotice_ctl_pair_both_or_neither" CHECK (("ctlBefore" IS NULL) = ("ctlAfter" IS NULL))
);
INSERT INTO "new_LoadRecomputeNotice" ("athleteId", "createdAt", "ctlAfter", "ctlBefore", "dismissedAt", "id", "kind") SELECT "athleteId", "createdAt", "ctlAfter", "ctlBefore", "dismissedAt", "id", "kind" FROM "LoadRecomputeNotice";
DROP TABLE "LoadRecomputeNotice";
ALTER TABLE "new_LoadRecomputeNotice" RENAME TO "LoadRecomputeNotice";
CREATE UNIQUE INDEX "LoadRecomputeNotice_athleteId_kind_key" ON "LoadRecomputeNotice"("athleteId", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- backfill
UPDATE "LoadRecomputeNotice"
SET "ctlBefore" = NULL, "ctlAfter" = NULL
WHERE "kind" = 'swim-rest-left-the-pace' AND "ctlBefore" = "ctlAfter";
