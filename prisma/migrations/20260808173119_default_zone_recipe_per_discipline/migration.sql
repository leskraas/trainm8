-- Give every discipline a Zone Recipe by default (#454, #436's decision, ADR 0006).
--
-- `DisciplineProfile.zoneSystem` has been written by nothing but `prisma/seed.ts`
-- since it was added, so on every real account it is null — which short-circuits
-- `resolveIntensity` before any band is consulted, makes every Volume Conversion
-- that needs a recipe an Unavailable Metric, and leaves #447's corrected Daniels
-- ratios reaching nobody. This migration fills that column, and records *how* it
-- was filled.
--
-- A recipe is **shape, not size**: it says which ladder the athlete's own numbers
-- are read on and fabricates no number about them. No threshold is touched here,
-- and none ever will be by a migration — FTP, threshold pace, CSS, LTHR and max HR
-- stay manual-only, and their absence stays an Unavailable Metric.

-- AlterTable
ALTER TABLE "DisciplineProfile" ADD COLUMN "zoneSystemSource" TEXT;

-- A recipe id that is already there was put there deliberately (today: only by the
-- seed), so it is the athlete's and is not relabelled as something the app chose.
UPDATE "DisciplineProfile"
SET "zoneSystemSource" = 'athlete'
WHERE "zoneSystem" IS NOT NULL;

-- Backfill the per-discipline default onto every row that has no recipe. This moves
-- nobody's numbers: a null `zoneSystem` resolved to Unavailable, so there is no
-- figure anyone has already read for it to change, and no Load Recompute Notice is
-- owed (ADR 0006's amendment states the test).
UPDATE "DisciplineProfile"
SET "zoneSystem" = 'daniels-pace-5', "zoneSystemSource" = 'default'
WHERE "zoneSystem" IS NULL AND "discipline" = 'run';

UPDATE "DisciplineProfile"
SET "zoneSystem" = 'coggan-power-7', "zoneSystemSource" = 'default'
WHERE "zoneSystem" IS NULL AND "discipline" = 'bike';

UPDATE "DisciplineProfile"
SET "zoneSystem" = 'css-5', "zoneSystemSource" = 'default'
WHERE "zoneSystem" IS NULL AND "discipline" = 'swim';

-- Strength is left alone on purpose: no recipe ships for it, so it keeps a null
-- `zoneSystem` *and* a null source (ADR 0046 — lactate thresholds do not order a
-- set of squats).

-- Rows are only half the problem. The single app-code writer of this table is
-- `setDisciplineThresholds`, so an athlete who has never opened /settings/training
-- has no DisciplineProfile rows at all — and a default that only lands on rows that
-- exist would still leave every one of those accounts resolving to Unavailable.
-- Lay down the three cardio rows for every AthleteProfile that is missing them,
-- carrying the recipe and nothing else: every threshold column stays null, which is
-- exactly what "the athlete has not told us their FTP" means.
--
-- Idempotent by the NOT EXISTS guard, so re-running adds no duplicates.
INSERT INTO "DisciplineProfile" ("id", "discipline", "zoneSystem", "zoneSystemSource", "enabled", "preferCogganTss", "preferRTSS", "createdAt", "updatedAt", "athleteProfileId")
SELECT lower(hex(randomblob(16))), 'run', 'daniels-pace-5', 'default', true, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ap."id"
FROM "AthleteProfile" ap
WHERE NOT EXISTS (
    SELECT 1 FROM "DisciplineProfile" dp
    WHERE dp."athleteProfileId" = ap."id" AND dp."discipline" = 'run'
);

INSERT INTO "DisciplineProfile" ("id", "discipline", "zoneSystem", "zoneSystemSource", "enabled", "preferCogganTss", "preferRTSS", "createdAt", "updatedAt", "athleteProfileId")
SELECT lower(hex(randomblob(16))), 'bike', 'coggan-power-7', 'default', true, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ap."id"
FROM "AthleteProfile" ap
WHERE NOT EXISTS (
    SELECT 1 FROM "DisciplineProfile" dp
    WHERE dp."athleteProfileId" = ap."id" AND dp."discipline" = 'bike'
);

INSERT INTO "DisciplineProfile" ("id", "discipline", "zoneSystem", "zoneSystemSource", "enabled", "preferCogganTss", "preferRTSS", "createdAt", "updatedAt", "athleteProfileId")
SELECT lower(hex(randomblob(16))), 'swim', 'css-5', 'default', true, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ap."id"
FROM "AthleteProfile" ap
WHERE NOT EXISTS (
    SELECT 1 FROM "DisciplineProfile" dp
    WHERE dp."athleteProfileId" = ap."id" AND dp."discipline" = 'swim'
);
