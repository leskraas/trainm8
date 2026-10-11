-- **The lifts answer to their Norwegian names** (owner decision 9, #505 round
-- 2): `knebøy` finds the Back Squat in Bibliotek's exercise search, and the
-- writing line reads it as the same lift.
--
-- **No stored number moves.** Nothing here touches a load, a rep, an effective
-- kilo, a 1RM, a training max, a working weight, a Stall Count, a weight or
-- stall history, a set log, or any row an athlete authored. It is additive
-- corpus content: 52 search-only `ExerciseAlias` rows with `locale = 'nb'`, each
-- naming a **movement** (`variantId` NULL) of a system-authored exercise.
-- Nothing is logged against an alias (ADR 0061), so no history can split, and
-- no Load Recompute Notice is owed.
--
-- ## Why a migration and not the seed
--
-- Production applies `prisma migrate deploy` at boot and never seeds
-- (`docs/agents/production-seed-data.md`). The seeder stays the source of
-- truth: the words live in `app/utils/exercise-aliases-nb.ts`, and
-- `seedExercises` (`app/utils/exercise-seed.server.ts`) writes them. This file
-- is that seeder's output for one moment; the next correction is another dump.
--
-- ## How it was made
--
-- A fresh, empty SQLite file; `prisma migrate deploy` (every migration up to
-- `20261011061500`); then `seedExercises` and nothing else — no `prisma/seed.ts`,
-- no demo user, no athlete row ever touched it. The `ExerciseAlias` rows with
-- `locale = 'nb'` were dumped, joined to `Exercise` and filtered to
-- `authorship = 'system'` with `createdByAthleteId` NULL (all 52 of 52 passed
-- the filter). Only `ExerciseAlias` is dumped: the seeder writes nothing else
-- new — every `Exercise` and `ExerciseVariant` row it touched is the one
-- `20260818120000` already ships, unchanged.
--
-- ## Conflict strategy
--
-- `INSERT OR IGNORE`, as in `20260818120000`: it survives the
-- `ExerciseAlias(exerciseId, text, locale)` unique index as well as the primary
-- key, and never clobbers a live row — a database that already carries one of
-- these words (a development database that was re-seeded) keeps its own row.
-- Every referenced exercise is a corpus row `20260818120000` inserts, so the
-- foreign key holds; were one missing, the insert would fail loudly, as it
-- should.
--
-- `createdAt` is stamped at a fixed 1791676800000 (2026-10-11T00:00:00Z) so the
-- file is deterministic. The ids are the temporary database's cuids.
--
-- Applied twice to a database built by `migrate deploy` from empty: 52 `nb`
-- aliases after the first run and 52 after the second, no failures.

INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx69l00097dgim1eo11me', 'ex_bb_back_squat', NULL, 'knebøy', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx69m000b7dgiy9z0jrc6', 'ex_bb_back_squat', NULL, 'stangknebøy', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6cj002h7dgihgv7zk9g', 'ex_bb_bench', NULL, 'benk', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6ci002f7dgiz93qvb6j', 'ex_bb_bench', NULL, 'benkpress', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6ao000x7dgib1r0wbrf', 'ex_bb_deadlift', NULL, 'markløft', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx69s000h7dgi0r580dda', 'ex_bb_front_squat', NULL, 'front knebøy', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx69r000f7dgi2xfa1aei', 'ex_bb_front_squat', NULL, 'frontknebøy', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6bj001l7dgicdoueuok', 'ex_bb_hip_thrust', NULL, 'hoftehev', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6bj001n7dgi0xuwzbdq', 'ex_bb_hip_thrust', NULL, 'seteløft', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6cx002r7dgi20pg12cf', 'ex_bb_incline_bench', NULL, 'skrå benkpress', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6cy002t7dgimfs87vl6', 'ex_bb_incline_bench', NULL, 'skråbenk', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6bm001p7dgikkai4sj6', 'ex_bb_lunge', NULL, 'utfall med stang', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6dp003h7dgi9yi10aza', 'ex_bb_ohp', NULL, 'militærpress', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6dq003j7dgicg9ov18o', 'ex_bb_ohp', NULL, 'skulderpress', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6du003l7dgikt9yxyh4', 'ex_bb_ohp', NULL, 'stående press', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6b300177dgihr2pifw9', 'ex_bb_rdl', NULL, 'rumensk markløft', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6b400197dgivpsq0q3v', 'ex_bb_rdl', NULL, 'strak markløft', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6ec003z7dgimanzwe2b', 'ex_bb_row', NULL, 'roing', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6ed00417dgi9p8d4v6x', 'ex_bb_row', NULL, 'stangroing', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6av00117dgiapmrzoo7', 'ex_bb_sumo_dl', NULL, 'sumomarkløft', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6fl004r7dgish8iek7i', 'ex_bw_chinup', NULL, 'chins', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6gr005l7dgiraav6pax', 'ex_bw_plank', NULL, 'planke', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6dg00377dgi8atfb6pg', 'ex_bw_pushup', NULL, 'armheving', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6df00357dgiei154yj0', 'ex_bw_pushup', NULL, 'armhevinger', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6a9000n7dgi1wis7s1o', 'ex_bw_squat', NULL, 'knebøy uten vekt', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6cp002n7dgixdssy8yk', 'ex_db_bench', NULL, 'benkpress med manualer', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6co002l7dgi1wdbbi1t', 'ex_db_bench', NULL, 'manualbenk', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6g400517dgi9398whku', 'ex_db_bicep_curl', NULL, 'bicepscurl', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx69z000j7dgi2vedm2tp', 'ex_db_goblet_squat', NULL, 'gobletknebøy', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6gd00597dgituj8wjm9', 'ex_db_lateral_raise', NULL, 'sidehev', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6bp001r7dgiznh1hamc', 'ex_db_lunge', NULL, 'utfall', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6bq001t7dgifn5lz9p0', 'ex_db_lunge', NULL, 'utfall med manualer', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6c300257dgi4gp6bytr', 'ex_db_rfe_split_squat', NULL, 'bulgarsk splittknebøy', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6c300237dgigvpxlucl', 'ex_db_rfe_split_squat', NULL, 'bulgarsk utfall', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6es00477dgilcclo0r5', 'ex_db_row', NULL, 'hantelroing', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6et00497dgiqoaepzpx', 'ex_db_row', NULL, 'manualroing', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6bu001x7dginssic39h', 'ex_db_split_squat', NULL, 'splittknebøy', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6m3005p7dgi9t1ykgpb', 'ex_fedb_barbell_shrug', NULL, 'skuldertrekk', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx72k005r7dgiqdf3r6rh', 'ex_fedb_dumbbell_shoulder_press', NULL, 'skulderpress med manualer', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx73x005t7dgika325xqo', 'ex_fedb_farmers_walk', NULL, 'bondegange', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx76e005v7dgig0kue8do', 'ex_fedb_hammer_curls', NULL, 'hammercurl', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx770005x7dgicqgm0ywp', 'ex_fedb_hanging_leg_raise', NULL, 'hengende beinhev', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6bf001h7dgi45mfnhk4', 'ex_fedb_power_clean', NULL, 'frivending', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx836005z7dgipj0ackwx', 'ex_fedb_triceps_pushdown', NULL, 'tricepspress i kabel', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6h0005n7dgilln96t0b', 'ex_mc_calf_raise', NULL, 'sittende tåhev', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6fs004v7dgiyv2t7iyz', 'ex_mc_lat_pulldown', NULL, 'nedtrekk', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6gj005d7dgik3zmhcjr', 'ex_mc_leg_curl', NULL, 'lårcurl', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6gn005h7dgivh3q4pri', 'ex_mc_leg_ext', NULL, 'beinspark', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6ae000p7dgi44rwjkpb', 'ex_mc_leg_press', NULL, 'beinpress', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6af000r7dgi70o60hj0', 'ex_mc_leg_press', NULL, 'benpress', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6ez004f7dgijs6u1zgg', 'ex_mc_seated_row', NULL, 'kabelroing', 'nb', 1791676800000);
INSERT OR IGNORE INTO "ExerciseAlias" ("id", "exerciseId", "variantId", "text", "locale", "createdAt") VALUES ('cmv3hx6ey004d7dgielxndkxp', 'ex_mc_seated_row', NULL, 'sittende roing', 'nb', 1791676800000);
