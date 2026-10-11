/**
 * **The Norwegian names of the lifts Norwegian athletes write most** (owner
 * decision 9, #505 round 2): `knebøy` is what the athlete types and searches
 * for, and the exercise database names the movement `Back Squat`.
 *
 * Each word is an **Exercise Alias** with `locale: 'nb'` — search-only, never a
 * second identity (ADR 0061): nothing is logged against an alias, the history
 * stays on the exercise. They name the **movement**, so `variantId` stays null,
 * which is also what lets the writing line's reader take them
 * (`readSentenceExercises` reads movement aliases only).
 *
 * Content, and so seeded rather than hand-written in SQL: `seedExercises` writes
 * these, and migration `20261011120000` ships the seeder's output to production
 * (`docs/agents/production-seed-data.md`). Keyed by the corpus's stable ids.
 *
 * Two rules the test holds this table to: every word is unique across the
 * whole corpus (a word naming two lifts would make the reader pick by name
 * order), and where the reader already knows a word (`LIFT_WORDS` in
 * `workout-sentence.ts`) it names the same lift here.
 */
export const NB_EXERCISE_ALIASES: Readonly<Record<string, readonly string[]>> =
	{
		// ── Knebøy ────────────────────────────────────────────────────────────
		ex_bb_back_squat: ['knebøy', 'stangknebøy'],
		ex_bb_front_squat: ['frontknebøy', 'front knebøy'],
		ex_db_goblet_squat: ['gobletknebøy'],
		ex_bw_squat: ['knebøy uten vekt'],
		ex_db_split_squat: ['splittknebøy'],
		ex_db_rfe_split_squat: ['bulgarsk utfall', 'bulgarsk splittknebøy'],
		ex_db_lunge: ['utfall', 'utfall med manualer'],
		ex_bb_lunge: ['utfall med stang'],
		ex_mc_leg_press: ['beinpress', 'benpress'],
		ex_mc_leg_ext: ['beinspark'],
		ex_mc_leg_curl: ['lårcurl'],
		ex_mc_calf_raise: ['sittende tåhev'],
		// ── Markløft og hofte ─────────────────────────────────────────────────
		ex_bb_deadlift: ['markløft'],
		ex_bb_rdl: ['rumensk markløft', 'strak markløft'],
		ex_bb_sumo_dl: ['sumomarkløft'],
		ex_bb_hip_thrust: ['hoftehev', 'seteløft'],
		ex_fedb_power_clean: ['frivending'],
		// ── Press ─────────────────────────────────────────────────────────────
		ex_bb_bench: ['benkpress', 'benk'],
		ex_db_bench: ['manualbenk', 'benkpress med manualer'],
		ex_bb_incline_bench: ['skrå benkpress', 'skråbenk'],
		ex_bb_ohp: ['militærpress', 'skulderpress', 'stående press'],
		ex_fedb_dumbbell_shoulder_press: ['skulderpress med manualer'],
		ex_bw_pushup: ['armhevinger', 'armheving'],
		ex_fedb_triceps_pushdown: ['tricepspress i kabel'],
		// ── Trekk ─────────────────────────────────────────────────────────────
		ex_bb_row: ['roing', 'stangroing'],
		ex_db_row: ['hantelroing', 'manualroing'],
		ex_mc_seated_row: ['sittende roing', 'kabelroing'],
		ex_mc_lat_pulldown: ['nedtrekk'],
		ex_bw_chinup: ['chins'],
		ex_fedb_barbell_shrug: ['skuldertrekk'],
		// ── Armer og skuldre ──────────────────────────────────────────────────
		ex_db_lateral_raise: ['sidehev'],
		ex_db_bicep_curl: ['bicepscurl'],
		ex_fedb_hammer_curls: ['hammercurl'],
		// ── Kjerne og bæring ──────────────────────────────────────────────────
		ex_bw_plank: ['planke'],
		ex_fedb_hanging_leg_raise: ['hengende beinhev'],
		ex_fedb_farmers_walk: ['bondegange'],
	}

/** The locale every alias above is stored under. */
export const NB_ALIAS_LOCALE = 'nb'
