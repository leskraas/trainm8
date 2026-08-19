-- Make `Exercise.unilateral` **nullable**, so an exercise nobody authored says it
-- does not know its laterality instead of asserting it is bilateral (ADR 0061;
-- ADR 0008's Unavailable Metric; ADR 0056 §3).
--
-- **No stored number moves.** Nothing here touches a load, a rep, an effective
-- kilo, an anchor or any other measured quantity, and no athlete's history reads
-- differently afterwards. The only column that changes is `Exercise.unilateral`,
-- on rows nobody authored: a `false` the column default wrote becomes NULL, and
-- on three rows it becomes the `true` the corpus already states (rule 2 below).
-- No `true` is lost and no authored `false` is lost.
--
-- ## What was wrong
--
-- `20260814120000` gave the column `BOOLEAN NOT NULL DEFAULT false`, and the
-- Slice 6 seed then wrote ~798 rows through it. Only the 44 rows in
-- `AUTHORED_LIFTS` (`app/utils/exercise-corpus.ts`) state laterality; the ~704
-- vendored `free-exercise-db` rows and the `catalogue-corpus.strength.ts` rows
-- carry no such fact — no open dataset does — and every one of them took the
-- default. So the database says a concentration curl is bilateral with exactly
-- the confidence it says a barbell back squat is, and one of those two sentences
-- was written by a person while the other was written by a column default.
--
-- That is the failure this repo has a name for: an absence became a claim. The
-- fix is the same one `movementPattern` and `secondaryMuscles` already have in
-- this very table — the column is nullable, NULL means *nobody stated one*, and
-- nothing downstream may read NULL as `false`.
--
-- ## How an authored row is told from a defaulted one
--
-- Three rules, and they are exhaustive:
--
-- 1. **A `true` was always a statement.** `false` was the default, so no row
--    could arrive at `true` except by somebody authoring it. Every `true` is
--    carried over unchanged.
-- 2. **The ids `AUTHORED_LIFTS` states as unilateral are set to `true`.** Eight
--    of them, and three (`ex_db_rfe_split_squat`, `ex_db_suitcase_carry`,
--    `ex_mc_pallof_press`) reached this database through
--    `catalogue-corpus.strength.ts`, which writes no laterality — so they are
--    sitting on the default `false` while the corpus says otherwise. Restating
--    them here is transcription of an authored fact, not a reading of a name.
-- 3. **A `false` is a statement only for the ids listed after that** — the 36
--    members of `AUTHORED_LIFTS` that state `unilateral: false`, transcribed as
--    literals because the list is content and this file cannot import it. Every
--    other `false` in the table is the column default and becomes NULL.
--
-- Both id lists are transcribed from `AUTHORED_LIFTS` as of this migration; the
-- seed is what keeps them current, and re-seeding is a no-op against these rows.
--
-- The list is the *conservative* reading: an id not on it becomes NULL even
-- where the movement's name makes the answer obvious ("Single-leg calf raise",
-- "Suitcase carry"). Reading a name is authoring, and this migration does not
-- author — `exercise-corpus.ts` does, and re-seeding restates any of these rows
-- the moment somebody writes the fact down.
--
-- The column keeps **no default**, so a row created without stating laterality —
-- `createCustomExercise` is one — lands on NULL rather than on a fresh claim.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    -- Canonical and equipment-free by intent — "Bench Press", with the equipment
    -- on the variant. The 94 rows carried over predate that rule and keep the names
    -- their seed gave them; the Slice 6 corpus is what re-authors them.
    "name" TEXT NOT NULL,
    "primaryMuscle" TEXT NOT NULL,
    -- JSON array of `MuscleGroup`. NULL = nobody stated any, distinct from `[]`.
    "secondaryMuscles" TEXT,
    -- The **legacy** equipment string, kept readable beside `ExerciseVariant` for
    -- one release the way ADR 0047's retired columns were. Deliberately *not*
    -- CHECK-constrained to `EQUIPMENT_IDS`: the real referent is the variant's
    -- `equipment`, and pinning a column that is on its way out would be a
    -- constraint two releases long.
    "equipment" TEXT,
    "isCompound" BOOLEAN NOT NULL DEFAULT false,
    -- The filter axis the picker needs at 390 px — `MOVEMENT_PATTERNS`. Twelve
    -- biomechanical patterns and not FIT's 53-member `exerciseCategory`, which does
    -- not fit as chips on a phone and half of whose members (`warm_up`, `cardio`,
    -- `unknown`) are not patterns at all. NULL means nobody stated one.
    "movementPattern" TEXT CHECK ("movementPattern" IS NULL OR "movementPattern" IN (
        'squat', 'hinge', 'lunge', 'horizontal-push', 'vertical-push',
        'horizontal-pull', 'vertical-pull', 'hip-extension', 'carry', 'rotation',
        'core', 'isolation'
    )),
    -- So the log asks for the other side's reps only where that means something.
    -- **NULL means nobody stated it**, and it is the honest answer for every row
    -- no author has reached. Nullable and with no default, so the next unauthored
    -- row does not quietly re-acquire the claim this migration removes.
    "unilateral" BOOLEAN,
    -- **Discovery only, never identity.** If this were identity, two histories
    -- would merge and could not be separated again.
    "variationGroupId" TEXT,
    -- Asserted, never inferred from `createdByAthleteId IS NULL` (#469).
    "authorship" TEXT NOT NULL DEFAULT 'athlete' CHECK ("authorship" IN ('system', 'athlete')),
    "createdByAthleteId" TEXT,
    -- The implication, not the biconditional — `Workout`'s worked precedent (#448).
    -- trainm8 never claims an athlete's movement, and an athlete-authored row whose
    -- author deleted their account stays expressible instead of being promoted into
    -- the shared catalog for everybody.
    CONSTRAINT "Exercise_system_has_no_author" CHECK ("authorship" <> 'system' OR "createdByAthleteId" IS NULL),
    CONSTRAINT "Exercise_createdByAthleteId_fkey" FOREIGN KEY ("createdByAthleteId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Exercise" ("id", "name", "primaryMuscle", "secondaryMuscles", "equipment", "isCompound", "movementPattern", "unilateral", "variationGroupId", "authorship", "createdByAthleteId")
SELECT "id", "name", "primaryMuscle", "secondaryMuscles", "equipment", "isCompound", "movementPattern",
       CASE
           -- Rule 1: `true` was never the default, so somebody wrote it.
           WHEN "unilateral" THEN true
           -- Rule 2: the authored unilateral lifts, by id — including the three
           -- that arrived from the strength catalogue on the default `false`.
           WHEN "id" IN (
               'ex_bb_lunge', 'ex_db_lunge', 'ex_db_split_squat',
               'ex_db_rfe_split_squat', 'ex_db_step_up', 'ex_db_row',
               'ex_db_suitcase_carry', 'ex_mc_pallof_press'
           ) THEN true
           -- Rule 3: the authored bilateral lifts, by id.
           WHEN "id" IN (
               'ex_bb_back_squat', 'ex_bb_front_squat', 'ex_db_goblet_squat',
               'ex_bw_squat', 'ex_mc_leg_press', 'ex_bb_deadlift', 'ex_bb_sumo_dl',
               'ex_bb_rdl', 'ex_db_rdl', 'ex_bb_good_morning',
               'ex_fedb_power_clean', 'ex_bb_hip_thrust', 'ex_bb_bench',
               'ex_db_bench', 'ex_bb_incline_bench', 'ex_db_incline_bench',
               'ex_fedb_close_grip_barbell_bench_press', 'ex_bw_pushup',
               'ex_bb_ohp', 'ex_db_ohp', 'ex_bw_dip', 'ex_bb_row',
               'ex_bb_pendlay_row', 'ex_mc_seated_row', 'ex_bw_inverted_row',
               'ex_bw_pullup', 'ex_bw_chinup', 'ex_mc_lat_pulldown',
               'ex_fedb_barbell_curl', 'ex_db_bicep_curl', 'ex_mc_tricep_pushdown',
               'ex_db_lateral_raise', 'ex_mc_leg_curl', 'ex_mc_leg_ext',
               'ex_bw_plank', 'ex_mc_calf_raise'
           ) THEN false
           -- Everything else: the column default spoke, not a person.
           ELSE NULL
       END,
       "variationGroupId", "authorship", "createdByAthleteId"
  FROM "Exercise";
DROP TABLE "Exercise";
ALTER TABLE "new_Exercise" RENAME TO "Exercise";
CREATE INDEX "Exercise_createdByAthleteId_idx" ON "Exercise"("createdByAthleteId");
CREATE INDEX "Exercise_movementPattern_idx" ON "Exercise"("movementPattern");
CREATE INDEX "Exercise_variationGroupId_idx" ON "Exercise"("variationGroupId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
