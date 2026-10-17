-- **The start's full-body Stock Workout, shipped to production** (#574, spec
-- #558, ADR 0103).
--
-- **No stored number moves.** Nothing here touches a load, a rep, a 1RM, a
-- working weight, a set log, a session, or any row an athlete authored. It is
-- additive corpus content: one system-authored `Workout`, the Catalogue's
-- `strength-S1` row (_Anatomical adaptation, full body A_, ACSM 2026), with its
-- one block, five lifts and fifteen prescribed sets. No Load Recompute Notice
-- is owed.
--
-- ## Why
--
-- Picking _styrke_ in the First Run lays lifting days. Where the athlete has no
-- strength session of their own to copy, each lifting day copies this Workout
-- (`START_STOCK_STRENGTH_KEY` in `app/utils/first-run/start-strength.server.ts`).
-- Production applies `prisma migrate deploy` at boot and never seeds
-- (`docs/agents/production-seed-data.md`), and the Catalogue corpus has never
-- shipped, so without this file a new athlete's lifting day would have nothing
-- to copy.
--
-- ## How it was made
--
-- A fresh, empty SQLite file; `prisma migrate deploy` (every migration up to
-- `20261017185740`); then `seedCatalogue` with the `strength-S1` corpus row and
-- nothing else — no `prisma/seed.ts`, no demo user, no athlete row. The seeder
-- (`app/utils/catalogue-seed.server.ts`) stays the source of truth; this file is
-- its output for one Workout. Dumped: the `Workout` row `stock_strength-S1`
-- (asserted `authorship = 'system'`, `ownerId` NULL) and its `WorkoutBlock`,
-- `WorkoutStep` and `ExerciseSet` subtree. Its five exercises
-- (`ex_db_goblet_squat`, `ex_bw_pushup`, `ex_bb_rdl`, `ex_db_row`,
-- `ex_bw_plank`) are already in production from `20260818120000`.
--
-- **No `CatalogueEntry` row, deliberately.** The Catalogue as a browse surface
-- has not shipped to production, and one entry there alone would be a
-- Catalogue of one. The Workout keeps the id the seeder gives it, so a later
-- shipment of the whole corpus adopts this row instead of duplicating it.
--
-- ## Re-runnable, and safe on a seeded database
--
-- `INSERT OR IGNORE` throughout, with the guards `20260818120000` uses: the
-- block inserts only where the Workout has no other block (a development
-- database seeded with the whole Catalogue already holds this Workout with its
-- own block), a step only where its block exists, a set only where its step
-- does, so a skipped block skips its whole subtree. Applied to an empty
-- database twice with identical counts, and to a database already seeded with
-- the Catalogue without failing or duplicating. `createdAt`/`updatedAt` are
-- stamped at a fixed 1792195200000 (2026-10-17T00:00:00Z).

-- Workout (1 row)
INSERT OR IGNORE INTO "Workout" ("id", "title", "description", "discipline", "intent", "archetype", "strengthGoal", "authorship", "visibility", "createdAt", "updatedAt", "ownerId", "copiedFromId", "activityKind", "effortWord") VALUES ('stock_strength-S1', 'Anatomical adaptation, full body A', 'Builds tissue tolerance and movement competence so the max-strength phase can be loaded safely. Connective tissue adapts more slowly than muscle, so this phase exists mostly for tendon and secondarily for technique. Never to failure; place it in general preparation, when endurance volume is lowest.', 'strength', 'strength-endurance', 'technique', NULL, 'system', 'private', 1792195200000, 1792195200000, NULL, NULL, NULL, NULL);

-- WorkoutBlock (1 row)
INSERT OR IGNORE INTO "WorkoutBlock" ("id", "name", "orderIndex", "repeatCount", "seriesRepeatCount", "betweenSeriesRestSec", "sendOff", "workoutId") SELECT 'cmvcm77wd00087d4mz7hm0yhf', NULL, 0, 1, 1, NULL, NULL, 'stock_strength-S1' WHERE NOT EXISTS (SELECT 1 FROM "WorkoutBlock" WHERE "workoutId" = 'stock_strength-S1' AND "id" <> 'cmvcm77wd00087d4mz7hm0yhf');

-- WorkoutStep (5 rows)
INSERT OR IGNORE INTO "WorkoutStep" ("id", "kind", "notes", "orderIndex", "discipline", "intensity", "durationSec", "distanceM", "exerciseId", "restBetweenSetsSec", "intensityHrMin", "intensityHrMax", "intensityPowerMin", "intensityPowerMax", "intensityPaceMin", "intensityPaceMax", "blockId", "cadenceRpmMax", "cadenceRpmMin", "gradePct", "rest", "verticalM") SELECT 'cmvcm77wd000a7d4mzf5kb2qz', 'strength', NULL, 0, NULL, NULL, NULL, NULL, 'ex_db_goblet_squat', 90, NULL, NULL, NULL, NULL, NULL, NULL, 'cmvcm77wd00087d4mz7hm0yhf', NULL, NULL, NULL, NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutBlock" WHERE "id" = 'cmvcm77wd00087d4mz7hm0yhf');
INSERT OR IGNORE INTO "WorkoutStep" ("id", "kind", "notes", "orderIndex", "discipline", "intensity", "durationSec", "distanceM", "exerciseId", "restBetweenSetsSec", "intensityHrMin", "intensityHrMax", "intensityPowerMin", "intensityPowerMax", "intensityPaceMin", "intensityPaceMax", "blockId", "cadenceRpmMax", "cadenceRpmMin", "gradePct", "rest", "verticalM") SELECT 'cmvcm77wi000e7d4m4nwvg6mx', 'strength', NULL, 1, NULL, NULL, NULL, NULL, 'ex_bw_pushup', 90, NULL, NULL, NULL, NULL, NULL, NULL, 'cmvcm77wd00087d4mz7hm0yhf', NULL, NULL, NULL, NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutBlock" WHERE "id" = 'cmvcm77wd00087d4mz7hm0yhf');
INSERT OR IGNORE INTO "WorkoutStep" ("id", "kind", "notes", "orderIndex", "discipline", "intensity", "durationSec", "distanceM", "exerciseId", "restBetweenSetsSec", "intensityHrMin", "intensityHrMax", "intensityPowerMin", "intensityPowerMax", "intensityPaceMin", "intensityPaceMax", "blockId", "cadenceRpmMax", "cadenceRpmMin", "gradePct", "rest", "verticalM") SELECT 'cmvcm77wi000i7d4mkq3agnb3', 'strength', NULL, 2, NULL, NULL, NULL, NULL, 'ex_bb_rdl', 90, NULL, NULL, NULL, NULL, NULL, NULL, 'cmvcm77wd00087d4mz7hm0yhf', NULL, NULL, NULL, NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutBlock" WHERE "id" = 'cmvcm77wd00087d4mz7hm0yhf');
INSERT OR IGNORE INTO "WorkoutStep" ("id", "kind", "notes", "orderIndex", "discipline", "intensity", "durationSec", "distanceM", "exerciseId", "restBetweenSetsSec", "intensityHrMin", "intensityHrMax", "intensityPowerMin", "intensityPowerMax", "intensityPaceMin", "intensityPaceMax", "blockId", "cadenceRpmMax", "cadenceRpmMin", "gradePct", "rest", "verticalM") SELECT 'cmvcm77wi000m7d4m5wil5gug', 'strength', 'Single-arm, each side.', 3, NULL, NULL, NULL, NULL, 'ex_db_row', 60, NULL, NULL, NULL, NULL, NULL, NULL, 'cmvcm77wd00087d4mz7hm0yhf', NULL, NULL, NULL, NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutBlock" WHERE "id" = 'cmvcm77wd00087d4mz7hm0yhf');
INSERT OR IGNORE INTO "WorkoutStep" ("id", "kind", "notes", "orderIndex", "discipline", "intensity", "durationSec", "distanceM", "exerciseId", "restBetweenSetsSec", "intensityHrMin", "intensityHrMax", "intensityPowerMin", "intensityPowerMax", "intensityPaceMin", "intensityPaceMax", "blockId", "cadenceRpmMax", "cadenceRpmMin", "gradePct", "rest", "verticalM") SELECT 'cmvcm77wi000q7d4mpe2yyl46', 'strength', NULL, 4, NULL, NULL, NULL, NULL, 'ex_bw_plank', 60, NULL, NULL, NULL, NULL, NULL, NULL, 'cmvcm77wd00087d4mz7hm0yhf', NULL, NULL, NULL, NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutBlock" WHERE "id" = 'cmvcm77wd00087d4mz7hm0yhf');

-- ExerciseSet (15 rows)
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77we000b7d4m6npxtyb6', 0, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wd000a7d4mzf5kb2qz', '{"kind":"rir","min":4}', NULL, '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wd000a7d4mzf5kb2qz');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77we000c7d4mtlla4hfv', 1, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wd000a7d4mzf5kb2qz', '{"kind":"rir","min":4}', NULL, '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wd000a7d4mzf5kb2qz');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000d7d4mrpj8k6l7', 2, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wd000a7d4mzf5kb2qz', '{"kind":"rir","min":4}', NULL, '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wd000a7d4mzf5kb2qz');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000f7d4mr6es4cew', 0, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wi000e7d4m4nwvg6mx', '{"kind":"rir","min":3}', '{"kind":"bodyweight"}', '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000e7d4m4nwvg6mx');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000g7d4mo9g8dy2e', 1, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wi000e7d4m4nwvg6mx', '{"kind":"rir","min":3}', '{"kind":"bodyweight"}', '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000e7d4m4nwvg6mx');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000h7d4mi5zwhrmq', 2, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wi000e7d4m4nwvg6mx', '{"kind":"rir","min":3}', '{"kind":"bodyweight"}', '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000e7d4m4nwvg6mx');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000j7d4mktivjqgm', 0, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wi000i7d4mkq3agnb3', '{"kind":"rir","min":4}', NULL, '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000i7d4mkq3agnb3');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000k7d4mjpbtn0od', 1, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wi000i7d4mkq3agnb3', '{"kind":"rir","min":4}', NULL, '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000i7d4mkq3agnb3');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000l7d4ml55ubohy', 2, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wi000i7d4mkq3agnb3', '{"kind":"rir","min":4}', NULL, '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000i7d4mkq3agnb3');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000n7d4m7a5snd4y', 0, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wi000m7d4m5wil5gug', '{"kind":"rir","min":3}', NULL, '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000m7d4m5wil5gug');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000o7d4mkrfhqgb8', 1, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wi000m7d4m5wil5gug', '{"kind":"rir","min":3}', NULL, '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000m7d4m5wil5gug');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000p7d4mis9hrj57', 2, 'reps', NULL, NULL, 12, NULL, 'cmvcm77wi000m7d4m5wil5gug', '{"kind":"rir","min":3}', NULL, '2-0-2', NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000m7d4m5wil5gug');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000r7d4mi9ohxrem', 0, 'timed', NULL, NULL, NULL, 45, 'cmvcm77wi000q7d4mpe2yyl46', NULL, '{"kind":"bodyweight"}', NULL, NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000q7d4mpe2yyl46');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000s7d4mugv8g008', 1, 'timed', NULL, NULL, NULL, 45, 'cmvcm77wi000q7d4mpe2yyl46', NULL, '{"kind":"bodyweight"}', NULL, NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000q7d4mpe2yyl46');
INSERT OR IGNORE INTO "ExerciseSet" ("id", "orderIndex", "kind", "weightKg", "pct1RM", "reps", "durationSec", "stepId", "effortCap", "load", "tempo", "terminationRir", "velocityLossPct") SELECT 'cmvcm77wi000t7d4myyor84sa', 2, 'timed', NULL, NULL, NULL, 45, 'cmvcm77wi000q7d4mpe2yyl46', NULL, '{"kind":"bodyweight"}', NULL, NULL, NULL WHERE EXISTS (SELECT 1 FROM "WorkoutStep" WHERE "id" = 'cmvcm77wi000q7d4mpe2yyl46');
