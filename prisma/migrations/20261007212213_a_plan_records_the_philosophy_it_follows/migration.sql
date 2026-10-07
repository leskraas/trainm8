-- **A plan records the philosophy it follows.** (#505 stories 10–14, ADR 0079.)
-- One nullable column on `PlanOutline`, nothing else:
--
-- - `family`: the Periodization Preset family the plan follows — 'classic',
--   'masters', 'big-base', 'polarized' or 'threshold'. Written when a shape is
--   picked or applied, when Hold meg aktiv makes a plan, and when the athlete
--   switches philosophy. The vocabulary is held in the app (`presetFamilyOf`),
--   which reads anything else as no family.
--
-- Existing rows read as null and are not backfilled: a plan that records no
-- family is read off its rhythm (3:1 Klassisk, 2:1 Masters), exactly as before
-- this column existed, so nothing an athlete sees changes.
--
-- **No stored number moves. No Load Recompute Notice is owed.** No existing
-- value is rewritten and no corpus data ships here.

-- AlterTable
ALTER TABLE "PlanOutline" ADD COLUMN "family" TEXT;
