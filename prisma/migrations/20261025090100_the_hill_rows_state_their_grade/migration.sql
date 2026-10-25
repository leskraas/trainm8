-- The Catalogue's hill rows state their grade band (#466).
--
-- `20261025090000_grade_is_a_band` made grade a signed band. The corpus source
-- (`catalogue-corpus.run.ts`, `catalogue-corpus.strength.ts`) now gives four
-- hill rows their band, but nothing seeds in production
-- (`docs/agents/production-seed-data.md`), so a Stock Workout already in a
-- database gains it here.
--
-- **No stored number moves.** Grade feeds no load, duration, TSS or adherence
-- figure, so no Load Recompute Notice is owed. What changes is a step's two
-- grade columns, the note that used to carry the grade as prose, and two
-- descriptions that said the grade could not be stored.
--
-- **Bounded and guarded, so it is a no-op wherever there is nothing to do.**
-- Each row is keyed the way the Catalogue seed keys it: the Stock Workout's
-- stable id `stock_<corpus key>` (`stockWorkoutId`), its `authorship =
-- 'system'`, and the step's block and step position, which the seed writes
-- from the corpus order. Each `UPDATE` touches a column only while it still
-- holds what the old corpus wrote: the grade only where both ends are NULL,
-- a note only while it is the exact old text, a description only while it
-- contains the exact old sentence. A database with no Catalogue (production
-- today) matches nothing; a database seeded from the new corpus already holds
-- the new values and matches nothing; an athlete's copy is `authorship =
-- 'athlete'` with another id and is never touched.
--
-- G4's "steep" hill states no number and is left as prose.

-- run-F4 · Hill sprints: 8 × 10 s up a 6–10 % hill.
UPDATE "WorkoutStep" SET "gradePctMin" = 6, "gradePctMax" = 10
WHERE "gradePctMin" IS NULL AND "gradePctMax" IS NULL
  AND "orderIndex" = 0
  AND "blockId" IN (SELECT b."id" FROM "WorkoutBlock" b JOIN "Workout" w ON w."id" = b."workoutId"
    WHERE w."id" = 'stock_run-F4' AND w."authorship" = 'system' AND b."orderIndex" = 1);
UPDATE "WorkoutStep" SET "notes" = 'Maximal.'
WHERE "notes" = 'Maximal, up a 6–10 % hill.'
  AND "orderIndex" = 0
  AND "blockId" IN (SELECT b."id" FROM "WorkoutBlock" b JOIN "Workout" w ON w."id" = b."workoutId"
    WHERE w."id" = 'stock_run-F4' AND w."authorship" = 'system' AND b."orderIndex" = 1);
UPDATE "Workout" SET "description" = REPLACE("description",
  'Run up a 6–10 % hill — the grade is a band, and a step carries one grade number, so it is stated here rather than stored. Walk down',
  'Run up a 6–10 % hill. Walk down')
WHERE "id" = 'stock_run-F4' AND "authorship" = 'system'
  AND instr("description", 'Run up a 6–10 % hill — the grade is a band, and a step carries one grade number, so it is stated here rather than stored. Walk down') > 0;

-- run-G1 · Long hill reps: 6 × 3 min on 4–7 %. The note said only the grade.
UPDATE "WorkoutStep" SET "gradePctMin" = 4, "gradePctMax" = 7
WHERE "gradePctMin" IS NULL AND "gradePctMax" IS NULL
  AND "orderIndex" = 0
  AND "blockId" IN (SELECT b."id" FROM "WorkoutBlock" b JOIN "Workout" w ON w."id" = b."workoutId"
    WHERE w."id" = 'stock_run-G1' AND w."authorship" = 'system' AND b."orderIndex" = 1);
UPDATE "WorkoutStep" SET "notes" = NULL
WHERE "notes" = 'Uphill, 4–7 % grade.'
  AND "orderIndex" = 0
  AND "blockId" IN (SELECT b."id" FROM "WorkoutBlock" b JOIN "Workout" w ON w."id" = b."workoutId"
    WHERE w."id" = 'stock_run-G1' AND w."authorship" = 'system' AND b."orderIndex" = 1);

-- run-G5 · Downhill reps: a controlled 3–6 % descent, signed low to high.
UPDATE "WorkoutStep" SET "gradePctMin" = -6, "gradePctMax" = -3
WHERE "gradePctMin" IS NULL AND "gradePctMax" IS NULL
  AND "orderIndex" = 0
  AND "blockId" IN (SELECT b."id" FROM "WorkoutBlock" b JOIN "Workout" w ON w."id" = b."workoutId"
    WHERE w."id" = 'stock_run-G5' AND w."authorship" = 'system' AND b."orderIndex" = 1);
UPDATE "WorkoutStep" SET "notes" = 'Controlled.'
WHERE "notes" = 'Controlled 3–6 % descent.'
  AND "orderIndex" = 0
  AND "blockId" IN (SELECT b."id" FROM "WorkoutBlock" b JOIN "Workout" w ON w."id" = b."workoutId"
    WHERE w."id" = 'stock_run-G5' AND w."authorship" = 'system' AND b."orderIndex" = 1);

-- strength-S19 · Maximal hill sprints: 8 × 8 s on 6–10 %.
UPDATE "WorkoutStep" SET "gradePctMin" = 6, "gradePctMax" = 10
WHERE "gradePctMin" IS NULL AND "gradePctMax" IS NULL
  AND "orderIndex" = 0
  AND "blockId" IN (SELECT b."id" FROM "WorkoutBlock" b JOIN "Workout" w ON w."id" = b."workoutId"
    WHERE w."id" = 'stock_strength-S19' AND w."authorship" = 'system' AND b."orderIndex" = 1);
UPDATE "WorkoutStep" SET "notes" = 'Maximal.'
WHERE "notes" = 'Maximal, uphill on 6–10 % grade.'
  AND "orderIndex" = 0
  AND "blockId" IN (SELECT b."id" FROM "WorkoutBlock" b JOIN "Workout" w ON w."id" = b."workoutId"
    WHERE w."id" = 'stock_strength-S19' AND w."authorship" = 'system' AND b."orderIndex" = 1);
UPDATE "Workout" SET "description" = REPLACE("description",
  'The grade is a 6–10 % band, which a single grade column cannot hold, so it is stated rather than stored.',
  'The grade is a 6–10 % band.')
WHERE "id" = 'stock_strength-S19' AND "authorship" = 'system'
  AND instr("description", 'The grade is a 6–10 % band, which a single grade column cannot hold, so it is stated rather than stored.') > 0;
