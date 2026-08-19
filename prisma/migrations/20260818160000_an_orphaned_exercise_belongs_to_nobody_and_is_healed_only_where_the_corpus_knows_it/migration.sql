-- **The orphaned exercises go back under trainm8's authorship, and get the
-- `ExerciseVariant` each of them never had** (#469).
--
-- **No stored number moves. No Load Recompute Notice is owed.** Nothing here
-- touches a load, a rep, an effective kilo, a bodyweight, a 1RM, a training
-- max, a working weight, a Stall Count, a weight or stall history, an
-- `ExerciseSetLog`, an `ExerciseSet` or any athlete-owned row of any kind. Two
-- writes only: an `Exercise.authorship` string on rows nobody owns, and new
-- `ExerciseVariant` rows for movements that had none. Every athlete's numbers
-- read exactly the same afterwards — what changes is that a lift they were
-- already scheduled to do can finally be *named* on screen.
--
-- ## The defect
--
-- `Exercise.authorship` defaults to `'athlete'`. `seedCatalogue` upserted the
-- 29 `STRENGTH_EXERCISES` its strength corpus needs with `createdByAthleteId:
-- null` and **no stated authorship**, so every one of them landed as
-- `authorship = 'athlete'` with no owner — an **orphan**: a row claiming to be
-- somebody's, belonging to nobody.
--
-- That is the exact shape of the bug `Workout` fixed in #448, and ADR 0056's
-- Consequences records it as still open on `Exercise`. `getExerciseCatalog`
-- serves `authorship = 'system' OR createdByAthleteId = <reader>`, and an
-- orphan is neither — correctly, since an orphan is not trainm8's to hand out.
-- So the rows were invisible to every athlete, and the exercise combobox cannot
-- name a selection it was never given: a scheduled strength session rendered
-- `Select exercise…` where its lead lift should be. Measured in the development
-- database: **29 orphan exercises, reached by 46 `WorkoutStep`s across 24
-- `Workout`s**, one of them a session's trap-bar deadlift.
--
-- And it could not heal itself. `seedExercises` deliberately skips any corpus
-- id already marked athlete-authored, so a corpus row never overwrites an
-- athlete's own movement. That guard is right, and it froze these rows wrong
-- forever.
--
-- ## Which orphans are healed, and how that was decided from the data
--
-- **An orphan is healed if and only if a shipped seed corpus knows its id.**
-- Not its name — its id, matched against the two in-repo corpora that write
-- `Exercise` rows: `STRENGTH_EXERCISES` in
-- `app/utils/catalogue-corpus.strength.ts` and `EXERCISE_CORPUS` in
-- `app/utils/exercise-corpus.ts`. A corpus id is a stable hand-written literal
-- (`ex_bb_trap_bar_deadlift`); an athlete's own exercise gets a cuid from
-- `createCustomExercise`, which no literal here can collide with. So a corpus
-- id in this state is a **mislabelled corpus row** — the seeder's own output,
-- with the seeder's own authorship missing — and it is put back to `'system'`
-- so the seeder can maintain it again.
--
-- An orphan the corpus has never heard of is **genuinely somebody's lost
-- data**: an exercise an athlete authored whose author then deleted their
-- account, leaving `onDelete: SetNull` to null the owner. **Nothing happens to
-- it here, and nothing should.** It stays `authorship = 'athlete'` with a null
-- owner, which is exactly what it is; it stays out of every athlete's catalog,
-- because it was never trainm8's to publish and no living athlete owns it; and
-- the sets logged against it keep their referent, because `ExerciseSetLog`'s
-- history reads the row directly and does not go through the catalog. Calling
-- it corpus content because its name looks generic would publish one athlete's
-- private movement to everybody — the worse of the two errors, and irreversible
-- once the seeder starts refreshing it.
--
-- All 29 orphans in the development database are corpus ids. The list below is
-- the whole of `STRENGTH_EXERCISES`, which is the set this defect could produce.
--
-- ## Every write is guarded on the orphan condition
--
-- Each statement requires `authorship = 'athlete' AND createdByAthleteId IS
-- NULL` — never `authorship = 'athlete'` alone, and never `createdByAthleteId
-- IS NULL` alone. A row an athlete authored **and still owns** is therefore
-- untouched whatever its id, including the collision case where an athlete's
-- own exercise happens to carry a corpus id. A row already `'system'` is
-- untouched too, so the file is idempotent: re-running it matches nothing the
-- first run left behind. `app/utils/exercise-seed.server.test.ts` proves both.
--
-- ## The variants
--
-- 26 of the 29 had **no `ExerciseVariant` row at all**, because the path that
-- created them wrote an `Exercise` and stopped. The progression key is
-- `(exerciseId, equipment)` and it resolves through that table, so those
-- movements had no realization to log a set or run a progression against.
--
-- The inserts below are `seedExercises`' own output, produced the way
-- `docs/agents/production-seed-data.md` prescribes: a fresh throwaway database
-- in `/tmp`, `prisma migrate deploy`, then `seedExercises` with the strength
-- corpus and nothing else, dumped with the `sqlite3` CLI. Load Semantics come
-- from `defaultVariantFor` — a 20 kg bar on a barbell lift, `bodyweight` with
-- the athlete as the bar on a bodyweight lift, `external` elsewhere — and ids
-- from `exerciseVariantId`, so the seeder lands on these very rows rather than
-- beside them. Timestamps are stamped at a fixed epoch, not at dump time.
--
-- Each insert is guarded twice: the parent must exist **and already be
-- `'system'`** (so a variant is never attached to a row this file declined to
-- heal), and no *other* row may already realize that `(exerciseId, equipment,
-- angle)`. `OR IGNORE` alone is not enough, because `angle` is NULL on all of
-- these and SQLite treats NULLs as distinct inside a unique index — the trap
-- `20260818120000` documents.
--
-- The three ids `EXERCISE_CORPUS` also carries — `ex_db_rfe_split_squat`,
-- `ex_db_suitcase_carry`, `ex_mc_pallof_press` — already have their variants
-- from `20260818120000` and are in the heal list only, not the insert list.
--
-- ## What each database needs
--
-- * **Production**: this is a **no-op**, and that is the honest statement
--   rather than an omission. Nothing seeds in production, and no migration ever
--   shipped these 29 rows — `20260818120000` carries the three that are also in
--   `EXERCISE_CORPUS` (already `'system'`, so the heal matches nothing) and
--   none of the other 26. With no orphan rows there is nothing to heal and no
--   parent for a variant to attach to, so every guard evaluates false and every
--   statement writes zero rows. It is deployed anyway, because it is the rule
--   the invariant needs the day a corpus row does reach production mislabelled.
--   Publishing the 26 corpus exercises to production is a separate question —
--   the strength Catalogue sessions that reference them are not in production
--   either — and is deliberately not smuggled in here.
-- * **An existing development database**: all prior migrations are applied and
--   the seeders have run, so this one does the real work — 29 rows healed and
--   26 variants written — on `npx prisma migrate deploy` (or the next
--   `npm run dev`). **No reset and no re-seed is required**, and a re-seed
--   afterwards is a no-op rather than a regression: the root cause is fixed in
--   `catalogue-seed.server.ts`, which now writes these rows through
--   `seedExercises` with `authorship: 'system'` asserted.
-- * **A fresh database**: cannot reach this state at all. The seeder that
--   produced it no longer produces it.

-- ── The heal ──────────────────────────────────────────────────────────────
-- Guarded on the orphan condition, both halves. An athlete-authored row with a
-- real owner is never matched, whatever its id.

UPDATE "Exercise"
SET "authorship" = 'system'
WHERE "authorship" = 'athlete'
  AND "createdByAthleteId" IS NULL
  AND "id" IN (
    'ex_bb_trap_bar_deadlift',
    'ex_bb_half_squat',
    'ex_bb_hang_power_clean',
    'ex_bb_mid_thigh_pull',
    'ex_bb_jump_squat',
    'ex_db_rfe_split_squat',
    'ex_db_half_kneeling_press',
    'ex_db_suitcase_carry',
    'ex_mc_single_leg_press',
    'ex_mc_hip_flexion',
    'ex_mc_double_poling_pull',
    'ex_mc_pallof_press',
    'ex_mc_hip_abduction',
    'ex_bw_hip_hinge',
    'ex_bw_heel_raise_straight',
    'ex_bw_heel_raise_bent',
    'ex_bw_single_leg_calf_raise',
    'ex_bw_single_leg_squat',
    'ex_bw_iso_split_squat_hold',
    'ex_bw_copenhagen',
    'ex_bw_dead_bug',
    'ex_bw_cmj',
    'ex_bw_drop_jump',
    'ex_bw_box_jump',
    'ex_bw_pogo_hop',
    'ex_bw_single_leg_hop',
    'ex_bw_hurdle_hop',
    'ex_mb_slam',
    'ex_mb_chest_pass'
  );

-- ── The variants the healed rows never had ────────────────────────────────
-- `seedExercises`' own output. The parent must already be `'system'`, so a row
-- this file declined to heal gains nothing.

INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bb_half_squat', 'ex_bb_half_squat', 'barbell', NULL, 'Half squat', 'external', 20.0, 2, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bb_half_squat' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bb_half_squat' AND "equipment" = 'barbell' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bb_half_squat');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bb_hang_power_clean', 'ex_bb_hang_power_clean', 'barbell', NULL, 'Hang power clean', 'external', 20.0, 2, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bb_hang_power_clean' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bb_hang_power_clean' AND "equipment" = 'barbell' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bb_hang_power_clean');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bb_jump_squat', 'ex_bb_jump_squat', 'barbell', NULL, 'Jump squat', 'external', 20.0, 2, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bb_jump_squat' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bb_jump_squat' AND "equipment" = 'barbell' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bb_jump_squat');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bb_mid_thigh_pull', 'ex_bb_mid_thigh_pull', 'barbell', NULL, 'Mid-thigh pull', 'external', 20.0, 2, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bb_mid_thigh_pull' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bb_mid_thigh_pull' AND "equipment" = 'barbell' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bb_mid_thigh_pull');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bb_trap_bar_deadlift', 'ex_bb_trap_bar_deadlift', 'barbell', NULL, 'Trap-bar deadlift', 'external', 20.0, 2, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bb_trap_bar_deadlift' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bb_trap_bar_deadlift' AND "equipment" = 'barbell' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bb_trap_bar_deadlift');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_box_jump', 'ex_bw_box_jump', 'bodyweight', NULL, 'Box jump-down to jump', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_box_jump' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_box_jump' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_box_jump');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_cmj', 'ex_bw_cmj', 'bodyweight', NULL, 'Countermovement jump', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_cmj' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_cmj' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_cmj');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_copenhagen', 'ex_bw_copenhagen', 'bodyweight', NULL, 'Copenhagen adduction', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_copenhagen' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_copenhagen' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_copenhagen');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_dead_bug', 'ex_bw_dead_bug', 'bodyweight', NULL, 'Dead bug', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_dead_bug' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_dead_bug' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_dead_bug');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_drop_jump', 'ex_bw_drop_jump', 'bodyweight', NULL, 'Drop jump', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_drop_jump' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_drop_jump' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_drop_jump');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_heel_raise_bent', 'ex_bw_heel_raise_bent', 'bodyweight', NULL, 'Bent-knee heel raise', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_heel_raise_bent' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_heel_raise_bent' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_heel_raise_bent');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_heel_raise_straight', 'ex_bw_heel_raise_straight', 'bodyweight', NULL, 'Straight-leg heel raise', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_heel_raise_straight' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_heel_raise_straight' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_heel_raise_straight');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_hip_hinge', 'ex_bw_hip_hinge', 'bodyweight', NULL, 'Hip hinge patterning', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_hip_hinge' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_hip_hinge' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_hip_hinge');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_hurdle_hop', 'ex_bw_hurdle_hop', 'bodyweight', NULL, 'Hurdle hop', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_hurdle_hop' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_hurdle_hop' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_hurdle_hop');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_iso_split_squat_hold', 'ex_bw_iso_split_squat_hold', 'bodyweight', NULL, 'Isometric split-squat hold', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_iso_split_squat_hold' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_iso_split_squat_hold' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_iso_split_squat_hold');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_pogo_hop', 'ex_bw_pogo_hop', 'bodyweight', NULL, 'Pogo hop', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_pogo_hop' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_pogo_hop' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_pogo_hop');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_single_leg_calf_raise', 'ex_bw_single_leg_calf_raise', 'bodyweight', NULL, 'Single-leg calf raise', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_single_leg_calf_raise' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_single_leg_calf_raise' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_single_leg_calf_raise');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_single_leg_hop', 'ex_bw_single_leg_hop', 'bodyweight', NULL, 'Single-leg hop', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_single_leg_hop' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_single_leg_hop' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_single_leg_hop');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_bw_single_leg_squat', 'ex_bw_single_leg_squat', 'bodyweight', NULL, 'Single-leg squat', 'bodyweight', NULL, 1, 0, 0, 1, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_bw_single_leg_squat' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_bw_single_leg_squat' AND "equipment" = 'bodyweight' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_bw_single_leg_squat');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_db_half_kneeling_press', 'ex_db_half_kneeling_press', 'dumbbell', NULL, 'Half-kneeling press', 'perSide', NULL, 2, 1, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_db_half_kneeling_press' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_db_half_kneeling_press' AND "equipment" = 'dumbbell' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_db_half_kneeling_press');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_mb_chest_pass', 'ex_mb_chest_pass', 'medicine-ball', NULL, 'Medicine-ball chest pass', 'external', NULL, 1, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_mb_chest_pass' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_mb_chest_pass' AND "equipment" = 'medicine-ball' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_mb_chest_pass');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_mb_slam', 'ex_mb_slam', 'medicine-ball', NULL, 'Medicine-ball slam', 'external', NULL, 1, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_mb_slam' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_mb_slam' AND "equipment" = 'medicine-ball' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_mb_slam');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_mc_double_poling_pull', 'ex_mc_double_poling_pull', 'cable', NULL, 'Cable double-poling pull', 'external', NULL, 1, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_mc_double_poling_pull' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_mc_double_poling_pull' AND "equipment" = 'cable' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_mc_double_poling_pull');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_mc_hip_abduction', 'ex_mc_hip_abduction', 'machine', NULL, 'Hip abduction', 'external', NULL, 1, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_mc_hip_abduction' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_mc_hip_abduction' AND "equipment" = 'machine' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_mc_hip_abduction');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_mc_hip_flexion', 'ex_mc_hip_flexion', 'machine', NULL, 'Hip flexion', 'external', NULL, 1, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_mc_hip_flexion' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_mc_hip_flexion' AND "equipment" = 'machine' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_mc_hip_flexion');
INSERT OR IGNORE INTO "ExerciseVariant" ("id", "exerciseId", "equipment", "angle", "displayName", "loadKind", "barKg", "perSideMultiplier", "isFixed", "isAssisting", "useBodyweightForBar", "inventoryProfileId", "isDefault", "createdAt", "updatedAt")
SELECT 'var_ex_mc_single_leg_press', 'ex_mc_single_leg_press', 'machine', NULL, 'Single-leg press', 'external', NULL, 1, 0, 0, 0, NULL, 1, 1787097600000, 1787097600000
WHERE EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = 'ex_mc_single_leg_press' AND "authorship" = 'system')
  AND NOT EXISTS (SELECT 1 FROM "ExerciseVariant" WHERE "exerciseId" = 'ex_mc_single_leg_press' AND "equipment" = 'machine' AND "angle" IS NULL AND "inventoryProfileId" IS NULL AND "id" <> 'var_ex_mc_single_leg_press');
