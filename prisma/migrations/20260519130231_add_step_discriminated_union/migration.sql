/*
  Issue #47 — Step discriminated union + Exercise catalog

  Changes:
  - WorkoutStep: add kind discriminator, rename description→notes, make discipline nullable
  - Exercise: new catalog model (seed + athlete-custom)
  - ExerciseSet: 1:N child of WorkoutStep for strength steps
  - Backfill: existing rest rows → kind='rest'; strength rows → kind='strength'+placeholder exercise; others → kind='cardio'
*/

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "primaryMuscle" TEXT NOT NULL,
    "equipment" TEXT,
    "isCompound" BOOLEAN NOT NULL DEFAULT false,
    "createdByAthleteId" TEXT,
    CONSTRAINT "Exercise_createdByAthleteId_fkey" FOREIGN KEY ("createdByAthleteId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExerciseSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "weightKg" REAL,
    "pct1RM" REAL,
    "reps" INTEGER,
    "durationSec" INTEGER,
    "stepId" TEXT NOT NULL,
    CONSTRAINT "ExerciseSet_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkoutStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Seed exercise catalog (~65 entries, createdByAthleteId=null for public catalog)
-- Placeholder for existing strength-via-prose rows
INSERT INTO "Exercise" ("id","name","primaryMuscle","equipment","isCompound") VALUES
  ('ex_needs_structure','Needs structure','full-body',NULL,false);

-- Barbell compound lifts — lower body
INSERT INTO "Exercise" ("id","name","primaryMuscle","equipment","isCompound") VALUES
  ('ex_bb_back_squat','Back Squat','quads','barbell',true),
  ('ex_bb_front_squat','Front Squat','quads','barbell',true),
  ('ex_bb_deadlift','Deadlift','hamstrings','barbell',true),
  ('ex_bb_rdl','Romanian Deadlift','hamstrings','barbell',true),
  ('ex_bb_sumo_dl','Sumo Deadlift','glutes','barbell',true),
  ('ex_bb_hip_thrust','Hip Thrust','glutes','barbell',true),
  ('ex_bb_lunge','Barbell Lunge','quads','barbell',true),
  ('ex_bb_good_morning','Good Morning','hamstrings','barbell',true);

-- Barbell compound lifts — upper body
INSERT INTO "Exercise" ("id","name","primaryMuscle","equipment","isCompound") VALUES
  ('ex_bb_bench','Bench Press','chest','barbell',true),
  ('ex_bb_incline_bench','Incline Bench Press','chest','barbell',true),
  ('ex_bb_ohp','Overhead Press','shoulders','barbell',true),
  ('ex_bb_row','Barbell Row','back','barbell',true),
  ('ex_bb_pendlay_row','Pendlay Row','back','barbell',true),
  ('ex_bb_pullover','Barbell Pullover','back','barbell',true);

-- Dumbbell exercises
INSERT INTO "Exercise" ("id","name","primaryMuscle","equipment","isCompound") VALUES
  ('ex_db_goblet_squat','Goblet Squat','quads','dumbbell',true),
  ('ex_db_split_squat','Dumbbell Split Squat','quads','dumbbell',true),
  ('ex_db_rdl','Dumbbell RDL','hamstrings','dumbbell',true),
  ('ex_db_bench','Dumbbell Bench Press','chest','dumbbell',true),
  ('ex_db_incline_bench','Dumbbell Incline Press','chest','dumbbell',true),
  ('ex_db_fly','Dumbbell Fly','chest','dumbbell',false),
  ('ex_db_row','Dumbbell Row','back','dumbbell',true),
  ('ex_db_ohp','Dumbbell Overhead Press','shoulders','dumbbell',true),
  ('ex_db_lateral_raise','Lateral Raise','shoulders','dumbbell',false),
  ('ex_db_front_raise','Front Raise','shoulders','dumbbell',false),
  ('ex_db_bicep_curl','Bicep Curl','biceps','dumbbell',false),
  ('ex_db_hammer_curl','Hammer Curl','biceps','dumbbell',false),
  ('ex_db_tricep_kickback','Tricep Kickback','triceps','dumbbell',false),
  ('ex_db_lunge','Dumbbell Lunge','quads','dumbbell',true),
  ('ex_db_step_up','Dumbbell Step Up','glutes','dumbbell',true),
  ('ex_db_shrug','Dumbbell Shrug','shoulders','dumbbell',false);

-- Bodyweight exercises
INSERT INTO "Exercise" ("id","name","primaryMuscle","equipment","isCompound") VALUES
  ('ex_bw_squat','Bodyweight Squat','quads','bodyweight',true),
  ('ex_bw_lunge','Bodyweight Lunge','quads','bodyweight',true),
  ('ex_bw_pushup','Push-up','chest','bodyweight',true),
  ('ex_bw_wide_pushup','Wide Push-up','chest','bodyweight',true),
  ('ex_bw_dip','Dip','triceps','bodyweight',true),
  ('ex_bw_pullup','Pull-up','back','bodyweight',true),
  ('ex_bw_chinup','Chin-up','biceps','bodyweight',true),
  ('ex_bw_inverted_row','Inverted Row','back','bodyweight',true),
  ('ex_bw_plank','Plank','abs','bodyweight',false),
  ('ex_bw_side_plank','Side Plank','obliques','bodyweight',false),
  ('ex_bw_crunch','Crunch','abs','bodyweight',false),
  ('ex_bw_leg_raise','Leg Raise','abs','bodyweight',false),
  ('ex_bw_glute_bridge','Glute Bridge','glutes','bodyweight',false),
  ('ex_bw_single_leg_rdl','Single-Leg RDL','hamstrings','bodyweight',true),
  ('ex_bw_nordic_curl','Nordic Hamstring Curl','hamstrings','bodyweight',false),
  ('ex_bw_calf_raise','Calf Raise','calves','bodyweight',false),
  ('ex_bw_hip_flexor_stretch','Hip Flexor Stretch','hip-flexors','bodyweight',false);

-- Machine exercises
INSERT INTO "Exercise" ("id","name","primaryMuscle","equipment","isCompound") VALUES
  ('ex_mc_leg_press','Leg Press','quads','machine',true),
  ('ex_mc_hack_squat','Hack Squat','quads','machine',true),
  ('ex_mc_leg_curl','Leg Curl','hamstrings','machine',false),
  ('ex_mc_leg_ext','Leg Extension','quads','machine',false),
  ('ex_mc_hip_thrust','Machine Hip Thrust','glutes','machine',false),
  ('ex_mc_seated_row','Seated Cable Row','back','machine',true),
  ('ex_mc_lat_pulldown','Lat Pulldown','back','machine',true),
  ('ex_mc_chest_press','Machine Chest Press','chest','machine',true),
  ('ex_mc_shoulder_press','Machine Shoulder Press','shoulders','machine',true),
  ('ex_mc_lateral_raise','Machine Lateral Raise','shoulders','machine',false),
  ('ex_mc_bicep_curl','Machine Bicep Curl','biceps','machine',false),
  ('ex_mc_tricep_pushdown','Tricep Pushdown','triceps','cable',false),
  ('ex_mc_face_pull','Face Pull','shoulders','cable',false),
  ('ex_mc_cable_fly','Cable Fly','chest','cable',false),
  ('ex_mc_ab_crunch','Ab Crunch Machine','abs','machine',false),
  ('ex_mc_back_ext','Back Extension','lower-back','machine',false),
  ('ex_mc_calf_raise','Seated Calf Raise','calves','machine',false);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkoutStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'cardio',
    "notes" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "discipline" TEXT,
    "intensity" TEXT,
    "durationSec" INTEGER,
    "distanceM" INTEGER,
    "exerciseId" TEXT,
    "restBetweenSetsSec" INTEGER,
    "intensityHrMin" INTEGER,
    "intensityHrMax" INTEGER,
    "intensityPowerMin" INTEGER,
    "intensityPowerMax" INTEGER,
    "intensityPaceMin" INTEGER,
    "intensityPaceMax" INTEGER,
    "blockId" TEXT NOT NULL,
    CONSTRAINT "WorkoutStep_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "WorkoutBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutStep_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Backfill:
--   discipline='rest'     → kind='rest',     discipline=NULL
--   discipline='strength' → kind='strength', discipline=NULL, exerciseId=placeholder, notes includes needsStructure flag
--   others                → kind='cardio',   discipline preserved
INSERT INTO "new_WorkoutStep" (
  "id","blockId","orderIndex","kind","notes","discipline","intensity","durationSec","distanceM","exerciseId"
)
SELECT
  "id",
  "blockId",
  "orderIndex",
  CASE
    WHEN "discipline" = 'rest'     THEN 'rest'
    WHEN "discipline" = 'strength' THEN 'strength'
    ELSE 'cardio'
  END,
  CASE
    WHEN "discipline" = 'strength'
      THEN COALESCE('needsStructure: true' || CASE WHEN "description" IS NOT NULL AND "description" != '' THEN '; ' || "description" ELSE '' END, 'needsStructure: true')
    ELSE "description"
  END,
  CASE
    WHEN "discipline" IN ('rest','strength') THEN NULL
    ELSE "discipline"
  END,
  "intensity",
  "durationSec",
  "distanceM",
  CASE WHEN "discipline" = 'strength' THEN 'ex_needs_structure' ELSE NULL END
FROM "WorkoutStep";

DROP TABLE "WorkoutStep";
ALTER TABLE "new_WorkoutStep" RENAME TO "WorkoutStep";
CREATE INDEX "WorkoutStep_blockId_idx" ON "WorkoutStep"("blockId");
CREATE INDEX "WorkoutStep_exerciseId_idx" ON "WorkoutStep"("exerciseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Exercise_createdByAthleteId_idx" ON "Exercise"("createdByAthleteId");

-- CreateIndex
CREATE INDEX "ExerciseSet_stepId_idx" ON "ExerciseSet"("stepId");
