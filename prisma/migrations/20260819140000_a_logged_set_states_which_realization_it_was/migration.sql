-- **A logged set states which realization it was.** `ExerciseSetLog` gains an
-- `equipment` column — the second half of the progression key
-- `(exerciseId, equipment)` — stamped at log time and backfilled here from the
-- variant each existing row already points at (ADR 0061).
--
-- **No stored number moves. No Load Recompute Notice is owed.** Nothing here
-- touches a load, a rep, an effective kilo, a bodyweight, a 1RM, a training max,
-- a working weight, a Stall Count, or any weight or stall history. Every existing
-- column of every existing row is left byte for byte as it stands.
--
-- The one column this migration writes is a **key, not a number**, and the
-- distinction is the reason no notice is owed. A Load Recompute Notice exists for
-- the case where an athlete's stored *quantity* changes underneath them — the
-- 104 kg dip that becomes 114 kg — because a number they read yesterday no longer
-- reads the same today. A key says *which bucket this set is filed under*, and the
-- value written here is precisely the bucket every reader was already computing
-- for that row a millisecond earlier, from the very same source (`variant.
-- equipment`, falling back to the legacy `Exercise.equipment` string). So no
-- record moves, no history curve changes shape, no Set Ghost picks a different
-- session and no program lift folds a different set. The reading is identical; only
-- its provenance changes, from *derived at read time* to *stated by the row*.
--
-- ## What was wrong
--
-- `ExerciseSetLog` baked `variantId` but not the equipment, so every reader
-- derived the key's second half at read time — `toLoggedWorkSets`
-- (`strength-program.server.ts`), `performedSetsForExercise`
-- (`strength-records.server.ts`) and the per-exercise history behind it. That made
-- `(exerciseId, equipment)` a function of a **mutable row** on a plain
-- `ExerciseVariant.equipment String` with no immutability constraint anywhere.
--
-- One statement was enough to prove it:
--
--     UPDATE "ExerciseVariant" SET equipment = 'dumbbell'
--      WHERE id = 'var_ex_bb_bench_press';
--
-- Eight barbell bench-press sessions silently moved to a dumbbell key, and the
-- records were rekeyed with them. Nothing repaired it and nothing announced it.
-- The seed could not heal it either: the default variant's id is `var_<exerciseId>`
-- with no equipment in it, so the corpus upsert's own guard passes once the barbell
-- row is gone and the replacement insert then collides on the taken primary key,
-- where `INSERT OR IGNORE` swallows the collision.
--
-- The stamp is the fix, and it is the fix rather than the write-path check because
-- **imports and hand-written rows bypass a check** — a row that states its own key
-- cannot be rekeyed by anybody. The refusal ships alongside it
-- (`saveExerciseVariant`): a variant's equipment may not change while an
-- `ExerciseSetLog` references it, checked in the write path and not in a trigger,
-- because a trigger is invisible in `schema.prisma`.
--
-- ## The backfill, and why it cannot be wrong
--
-- Two guarded `UPDATE`s, in this order, both restricted to `equipment IS NULL`:
--
-- 1. from `ExerciseVariant.equipment` for every row that names a variant — the
--    exact expression the readers used;
-- 2. from the legacy `Exercise.equipment` string for a row that names no variant —
--    the exact fallback `toEquipmentId` used for a set logged before variants were
--    stamped at all.
--
-- A row that can source neither is left NULL, which is the honest answer: it names
-- no equipment. That is the same value such a row effectively carried before, and
-- the readers bucket it as `other` (records) or as *contradicts no rule* (the
-- program fold), exactly as they did when it had no variant.
--
-- No vocabulary filtering happens here. `toEquipmentId` narrows a stored string to
-- `EQUIPMENT_IDS` at the read seam and answers `other` for anything else, so a
-- legacy string this app does not recognize reads the same after the backfill as
-- before it. Filtering in SQL would need the vocabulary transcribed into this file,
-- where it would go stale.
--
-- ## What an existing dev database needs, and what production will do
--
-- A dev database needs `npx prisma migrate deploy` and nothing else — no reset, no
-- re-seed, no manual backfill. Row counts are identical before and after, and every
-- `ExerciseSetLog` row that could name its equipment now does.
--
-- Production has **zero `ExerciseSetLog` rows**, so both `UPDATE`s match nothing
-- and the change is schema-only there. Nothing to announce to anybody.
--
-- ## Re-running, and partial prior state
--
-- Both `UPDATE`s are guarded on `equipment IS NULL`, so they only ever write a
-- stamp that is missing and a second application writes nothing at all — in
-- particular a stamp already standing on a row is never recomputed, which is the
-- property that matters: recomputing it from the variant is the very re-key this
-- migration exists to end.
--
-- `ALTER TABLE … ADD COLUMN` is the one statement SQLite cannot repeat. Re-applying
-- this file by hand therefore stops on `duplicate column name: equipment` **before
-- any row is touched**, leaving the database exactly as it was: safe to re-run in
-- the sense that matters, never half-applied and never wrong. Applied against
-- partial prior state — a database where some rows were stamped by the application
-- before this ran — the guards leave those stamps alone and fill only the rest.

-- AlterTable
ALTER TABLE "ExerciseSetLog" ADD COLUMN "equipment" TEXT;

-- Backfill 1: the variant the row already names. The expression the readers used.
UPDATE "ExerciseSetLog"
   SET "equipment" = (
         SELECT "v"."equipment" FROM "ExerciseVariant" "v"
          WHERE "v"."id" = "ExerciseSetLog"."variantId"
       )
 WHERE "equipment" IS NULL
   AND "variantId" IS NOT NULL;

-- Backfill 2: the legacy `Exercise.equipment` string, for a set logged before
-- variants were stamped. The readers' own fallback, and nothing beyond it.
UPDATE "ExerciseSetLog"
   SET "equipment" = (
         SELECT "e"."equipment" FROM "Exercise" "e"
          WHERE "e"."id" = "ExerciseSetLog"."exerciseId"
       )
 WHERE "equipment" IS NULL
   AND "exerciseId" IS NOT NULL;
