/**
 * The strength corpus — `docs/research/workouts-strength-and-other.md`, all 25
 * sessions across its four phases (S1–S25).
 *
 * ## What the **Load Target** union bought
 *
 * The best-evidenced session in the whole document — Rønnestad's cyclist
 * protocol — is written `10RM → 4RM`, and the research called it *"unauthorable
 * in trainm8 today"*. It is authorable now: `{ kind: 'repMax', reps }` is a
 * self-calibrating anchor that needs no 1RM test and sidesteps the portability
 * problem entirely (endurance runners manage 39.9 ± 17.6 reps at 70 % 1RM where
 * weightlifters manage 17.9 ± 2.8; `% 1RM` travels only above ~85 %). S8 and S9
 * seed at their first rung, `10RM`, because the ramp across twelve weeks *is*
 * the progression and a Catalogue row is one session.
 *
 * The velocity-capped and to-RIR set terminations arrived with the same change,
 * so S10 ends when mean velocity falls more than 10 % rather than at a rep count
 * nobody authored, and the **Effort Cap** is a separate axis from the load, so
 * `4 reps at 85 % 1RM stopping at RIR 2` states both.
 *
 * ## Four things this transcription still could not say
 *
 * - **There is no strength Session Archetype.** The sixteen values are all
 *   endurance archetypes: a heavy squat day has no member of its own. Every row
 *   here is filed as `neuromuscular` (force and rate-of-force work) or
 *   `technique` (anatomical adaptation, trunk, injury prevention), which is the
 *   nearest honest member and not a good fit. The research made the same
 *   complaint about the Strength Goal enum, which "cannot label 10 of these 25
 *   sessions".
 * - **`ExerciseSet` has no distance termination.** Bounding `3 × 20 m`,
 *   skipping `3 × 30 m` and the suitcase carry `3 × 30 m` are quantified in
 *   metres. They seed as cardio steps with a `distanceM` — the same compromise
 *   the running corpus's Lydiard hill circuit makes — which keeps the real
 *   quantity and loses the exercise identity to the step's notes.
 * - **There is no per-side notion.** `3 × 10/leg` and `3 × 8/side` seed as the
 *   authored rep count with the side stated in the notes. Doubling it would
 *   invent a number the source did not write.
 * - **Ground contacts are the plyometric dose and there is no field for them.**
 *   `≤ 120 contacts` is the cap that makes a plyometric session safe; it lives
 *   in the description.
 *
 * ## The one row where a missing field made the prescription *wrong*
 *
 * Heavy slow resistance (S4, S12) depends on **time under high load**, not on
 * rep count — the `3-0-3` tempo *is* the intervention. `ExerciseSet.tempo`
 * carries it. Note also that the protocol comes from the tendinopathy
 * rehabilitation literature; using it as a prophylactic primer for healthy
 * runners is an extrapolation, and each row says so.
 */
import {
	ACSM_2026,
	BLAGROVE_2018,
	DENADAI_2017,
	LOSNEGARD_2011,
	PAAVOLAINEN_1999,
	RONNESTAD_HEAVY_2010,
	RONNESTAD_MAINTENANCE_2010,
	SANCHEZ_MEDINA_2011,
} from './catalogue-corpus.citations.ts'
import {
	CONVENTION_NOTICE,
	block,
	min,
	rest,
	rpe,
	run,
	type CorpusSession,
	type CorpusStep,
} from './catalogue-corpus.ts'
import { type EquipmentId } from './strength-log.ts'
import { type MuscleGroup } from './workout-schema.ts'

/**
 * The **Exercises** this corpus needs that the shipped catalogue does not have.
 *
 * **Written by the exercise database's own seeder** (`seedExercises`, via
 * `STRENGTH_EXERCISE_CORPUS` in `catalogue-seed.server.ts`), which states
 * `authorship: 'system'` with `createdByAthleteId: null` and gives each row its
 * default **Exercise Variant**.
 *
 * They did not used to be. Until #469 they were upserted here with a null owner
 * and *no stated authorship*, so `Exercise.authorship`'s `@default("athlete")`
 * made every one of them an **orphan** — athlete-authored, owned by nobody.
 * `getExerciseCatalog` correctly refuses to serve such a row to anyone, which
 * is why a scheduled session's trap-bar deadlift rendered as an empty
 * `Select exercise…` picker, and `seedExercises`' skip-the-athlete-authored
 * guard then froze them that way forever. A null owner is safe to read only
 * because authorship is asserted beside it; these rows now assert it.
 */
export const STRENGTH_EXERCISES: Array<{
	id: string
	name: string
	primaryMuscle: MuscleGroup
	/** Never null. An **Exercise Variant** is keyed by equipment, so a row with
	 * no equipment has no realization to log a set against (#469). */
	equipment: EquipmentId
	isCompound: boolean
}> = [
	{ id: 'ex_bb_trap_bar_deadlift', name: 'Trap-bar deadlift', primaryMuscle: 'glutes', equipment: 'barbell', isCompound: true },
	{ id: 'ex_bb_half_squat', name: 'Half squat', primaryMuscle: 'quads', equipment: 'barbell', isCompound: true },
	{ id: 'ex_bb_hang_power_clean', name: 'Hang power clean', primaryMuscle: 'full-body', equipment: 'barbell', isCompound: true },
	{ id: 'ex_bb_mid_thigh_pull', name: 'Mid-thigh pull', primaryMuscle: 'back', equipment: 'barbell', isCompound: true },
	{ id: 'ex_bb_jump_squat', name: 'Jump squat', primaryMuscle: 'quads', equipment: 'barbell', isCompound: true },
	{ id: 'ex_db_rfe_split_squat', name: 'Rear-foot-elevated split squat', primaryMuscle: 'quads', equipment: 'dumbbell', isCompound: true },
	{ id: 'ex_db_half_kneeling_press', name: 'Half-kneeling press', primaryMuscle: 'shoulders', equipment: 'dumbbell', isCompound: true },
	{ id: 'ex_db_suitcase_carry', name: 'Suitcase carry', primaryMuscle: 'obliques', equipment: 'dumbbell', isCompound: true },
	{ id: 'ex_mc_single_leg_press', name: 'Single-leg press', primaryMuscle: 'quads', equipment: 'machine', isCompound: true },
	{ id: 'ex_mc_hip_flexion', name: 'Hip flexion', primaryMuscle: 'hip-flexors', equipment: 'machine', isCompound: false },
	{ id: 'ex_mc_double_poling_pull', name: 'Cable double-poling pull', primaryMuscle: 'back', equipment: 'cable', isCompound: true },
	{ id: 'ex_mc_pallof_press', name: 'Pallof press', primaryMuscle: 'obliques', equipment: 'cable', isCompound: false },
	{ id: 'ex_mc_hip_abduction', name: 'Hip abduction', primaryMuscle: 'glutes', equipment: 'machine', isCompound: false },
	{ id: 'ex_bw_hip_hinge', name: 'Hip hinge patterning', primaryMuscle: 'hamstrings', equipment: 'bodyweight', isCompound: true },
	{ id: 'ex_bw_heel_raise_straight', name: 'Straight-leg heel raise', primaryMuscle: 'calves', equipment: 'bodyweight', isCompound: false },
	{ id: 'ex_bw_heel_raise_bent', name: 'Bent-knee heel raise', primaryMuscle: 'calves', equipment: 'bodyweight', isCompound: false },
	{ id: 'ex_bw_single_leg_calf_raise', name: 'Single-leg calf raise', primaryMuscle: 'calves', equipment: 'bodyweight', isCompound: false },
	{ id: 'ex_bw_single_leg_squat', name: 'Single-leg squat', primaryMuscle: 'quads', equipment: 'bodyweight', isCompound: true },
	{ id: 'ex_bw_iso_split_squat_hold', name: 'Isometric split-squat hold', primaryMuscle: 'quads', equipment: 'bodyweight', isCompound: true },
	{ id: 'ex_bw_copenhagen', name: 'Copenhagen adduction', primaryMuscle: 'hip-flexors', equipment: 'bodyweight', isCompound: false },
	{ id: 'ex_bw_dead_bug', name: 'Dead bug', primaryMuscle: 'abs', equipment: 'bodyweight', isCompound: false },
	{ id: 'ex_bw_cmj', name: 'Countermovement jump', primaryMuscle: 'quads', equipment: 'bodyweight', isCompound: true },
	{ id: 'ex_bw_drop_jump', name: 'Drop jump', primaryMuscle: 'calves', equipment: 'bodyweight', isCompound: true },
	{ id: 'ex_bw_box_jump', name: 'Box jump-down to jump', primaryMuscle: 'quads', equipment: 'bodyweight', isCompound: true },
	{ id: 'ex_bw_pogo_hop', name: 'Pogo hop', primaryMuscle: 'calves', equipment: 'bodyweight', isCompound: false },
	{ id: 'ex_bw_single_leg_hop', name: 'Single-leg hop', primaryMuscle: 'calves', equipment: 'bodyweight', isCompound: true },
	{ id: 'ex_bw_hurdle_hop', name: 'Hurdle hop', primaryMuscle: 'calves', equipment: 'bodyweight', isCompound: true },
	{ id: 'ex_mb_slam', name: 'Medicine-ball slam', primaryMuscle: 'full-body', equipment: 'medicine-ball', isCompound: true },
	{ id: 'ex_mb_chest_pass', name: 'Medicine-ball chest pass', primaryMuscle: 'chest', equipment: 'medicine-ball', isCompound: true },
]

type SetSpec = {
	sets: number
	reps?: number
	durationSec?: number
	pct1RM?: number
	repMax?: number
	pctBodyweight?: number
	bodyweight?: boolean
	velocityMs?: [number, number]
	rir?: number
	tempo?: string
	terminationRir?: number
	velocityLossPct?: number
}

/** One strength step: an exercise, its sets, and the rest between them. */
function lift(
	exerciseId: string,
	spec: SetSpec,
	restBetweenSetsSec: number,
	notes?: string,
): CorpusStep {
	const load =
		spec.pct1RM != null
			? ({ kind: 'pct1RM', minPct: spec.pct1RM } as const)
			: spec.repMax != null
				? ({ kind: 'repMax', reps: spec.repMax } as const)
				: spec.pctBodyweight != null
					? ({ kind: 'pctBodyweight', pct: spec.pctBodyweight } as const)
					: spec.bodyweight
						? ({ kind: 'bodyweight' } as const)
						: spec.velocityMs != null
							? ({
									kind: 'velocity',
									minMs: spec.velocityMs[0],
									maxMs: spec.velocityMs[1],
								} as const)
							: undefined
	const common = {
		...(load == null ? {} : { load }),
		...(spec.rir == null
			? {}
			: { effortCap: { kind: 'rir' as const, min: spec.rir } }),
		...(spec.tempo == null ? {} : { tempo: spec.tempo }),
	}
	const one = (orderIndex: number) => {
		if (spec.velocityLossPct != null) {
			return {
				kind: 'velocityLoss' as const,
				orderIndex,
				velocityLossPct: spec.velocityLossPct,
				...common,
			}
		}
		if (spec.terminationRir != null) {
			return {
				kind: 'toRir' as const,
				orderIndex,
				terminationRir: spec.terminationRir,
				...common,
			}
		}
		if (spec.durationSec != null) {
			return {
				kind: 'timed' as const,
				orderIndex,
				durationSec: spec.durationSec,
				...common,
			}
		}
		return { kind: 'reps' as const, orderIndex, reps: spec.reps!, ...common }
	}
	return {
		kind: 'strength',
		exerciseId,
		restBetweenSetsSec,
		...(notes == null ? {} : { notes }),
		sets: Array.from({ length: spec.sets }, (_, i) => one(i)),
	}
}

/** A drill the source quantifies in metres — a cardio step, because a set has
 * no distance termination. The exercise's name moves into the notes, and the
 * step carries no intensity: the source states an exercise and a distance, not
 * an effort, and inventing one would be a number nobody prescribed. */
const overGround = (distanceM: number, notes: string): CorpusStep =>
	run({ distanceM, notes })

export const STRENGTH_CORPUS: CorpusSession[] = [
	// ——— Phase 1 · Anatomical adaptation ————————————————————————————————
	{
		key: 'strength-S1',
		title: 'Anatomical adaptation, full body A',
		description:
			'Builds tissue tolerance and movement competence so the max-strength phase can be loaded safely. Connective tissue adapts more slowly than muscle, so this phase exists mostly for tendon and secondarily for technique. Never to failure; place it in general preparation, when endurance volume is lowest.',
		discipline: 'strength',
		intent: 'strength-endurance',
		archetype: 'technique',
		level: 'beginner',
		phases: ['base'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ACSM_2026,
		progressesTo: 'strength-S6',
		blocks: [
			block([
				lift('ex_db_goblet_squat', { sets: 3, reps: 12, rir: 4, tempo: '2-0-2' }, 90),
				lift('ex_bw_pushup', { sets: 3, reps: 12, rir: 3, bodyweight: true, tempo: '2-0-2' }, 90),
				lift('ex_bb_rdl', { sets: 3, reps: 12, rir: 4, tempo: '2-0-2' }, 90),
				lift('ex_db_row', { sets: 3, reps: 12, rir: 3, tempo: '2-0-2' }, 60, 'Single-arm, each side.'),
				lift('ex_bw_plank', { sets: 3, durationSec: 45, bodyweight: true }, 60),
			]),
		],
	},
	{
		key: 'strength-S2',
		title: 'Anatomical adaptation, full body B — unilateral',
		description:
			'The unilateral counterpart: running is a single-leg activity, and the review evidence supports a unilateral bias in a runner\'s general preparation. Rep counts are per leg or per side as the source writes them — the model has no per-side notion, so doubling them would invent a number.',
		discipline: 'strength',
		intent: 'strength-endurance',
		archetype: 'technique',
		level: 'beginner',
		phases: ['base'],
		goalEvents: [],
		provenance: 'corpus',
		citation: BLAGROVE_2018,
		blocks: [
			block([
				lift('ex_db_split_squat', { sets: 3, reps: 10, rir: 4, tempo: '2-0-2' }, 90, 'Per leg.'),
				lift('ex_bw_single_leg_rdl', { sets: 3, reps: 10, rir: 4, tempo: '2-0-2' }, 90, 'Per leg.'),
				lift('ex_db_step_up', { sets: 3, reps: 10, rir: 4, tempo: '2-0-2' }, 90, 'Per leg.'),
				lift('ex_db_half_kneeling_press', { sets: 3, reps: 12, rir: 3, tempo: '2-0-2' }, 90),
				lift('ex_bw_side_plank', { sets: 3, durationSec: 30, bodyweight: true }, 60, 'Per side.'),
			]),
		],
	},
	{
		key: 'strength-S3',
		title: 'Anatomical adaptation, posterior chain',
		description: `${CONVENTION_NOTICE} Hinge patterning plus the posterior-chain work the injury-prevention literature supports. The hip thrust is loaded as a fraction of bodyweight and ramps 50 → 75 → 100 %; the Nordic curl progresses 2 × 5 → 3 × 6 → 3 × 8.`,
		discipline: 'strength',
		intent: 'strength-endurance',
		archetype: 'technique',
		level: 'beginner',
		phases: ['base'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([
				lift('ex_bw_hip_hinge', { sets: 3, reps: 12, rir: 5, bodyweight: true, tempo: '2-1-2' }, 90),
				lift('ex_bb_hip_thrust', { sets: 3, reps: 12, pctBodyweight: 50, tempo: '2-1-2' }, 90),
				lift('ex_mc_back_ext', { sets: 3, reps: 15, bodyweight: true, tempo: '2-1-2' }, 90),
				lift('ex_bw_nordic_curl', { sets: 2, reps: 5, bodyweight: true }, 120, 'Assisted.'),
				lift('ex_bw_calf_raise', { sets: 3, reps: 15, bodyweight: true, tempo: '2-1-2' }, 90),
			]),
		],
	},
	{
		key: 'strength-S4',
		title: "Runner's tendon primer (heavy slow resistance)",
		description: `${CONVENTION_NOTICE} **The 3-0-3 tempo is the intervention.** Tendon adaptation depends on time under high load, not on rep count — this is the one family in the Catalogue where a missing tempo makes the prescription wrong rather than incomplete. Note the extrapolation: the heavy-slow-resistance protocol comes from the tendinopathy *rehabilitation* literature (Achilles and patellar), and its use as a prophylactic primer for healthy runners is an extension of it, not a finding.`,
		discipline: 'strength',
		intent: 'strength-endurance',
		archetype: 'technique',
		level: null,
		phases: ['base'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		progressesTo: 'strength-S12',
		blocks: [
			block([
				lift('ex_bw_heel_raise_straight', { sets: 3, reps: 15, rir: 4, tempo: '3-0-3' }, 120),
				lift('ex_bw_heel_raise_bent', { sets: 3, reps: 15, rir: 4, tempo: '3-0-3' }, 120),
				lift('ex_mc_leg_press', { sets: 3, reps: 15, rir: 4, tempo: '3-0-3' }, 120),
				lift('ex_db_split_squat', { sets: 2, reps: 12, rir: 4, tempo: '3-0-3' }, 120, 'Per leg.'),
			]),
		],
	},
	{
		key: 'strength-S5',
		title: 'Anatomical adaptation, upper and pull',
		description:
			'The upper-body preparation skiing, rowing and swimming need, on the exercise selection the elite cross-country trial used. Progresses into the rep-max ramp of the maximal-strength phase.',
		discipline: 'strength',
		intent: 'strength-endurance',
		archetype: 'technique',
		level: 'beginner',
		phases: ['base'],
		goalEvents: [],
		provenance: 'corpus',
		citation: LOSNEGARD_2011,
		progressesTo: 'strength-S9',
		blocks: [
			block([
				lift('ex_mc_lat_pulldown', { sets: 3, reps: 12, rir: 4, tempo: '2-0-2' }, 90),
				lift('ex_mc_double_poling_pull', { sets: 3, reps: 15, rir: 4, tempo: '2-0-2' }, 90),
				lift('ex_mc_tricep_pushdown', { sets: 3, reps: 12, rir: 3, tempo: '2-0-2' }, 90),
				lift('ex_bb_row', { sets: 3, reps: 12, rir: 3, tempo: '2-0-2' }, 90),
				lift('ex_mc_pallof_press', { sets: 3, reps: 10 }, 60, 'Per side.'),
			]),
		],
	},

	// ——— Phase 2 · Maximal strength ————————————————————————————————————
	{
		key: 'strength-S6',
		title: 'Maximal strength A — squat',
		description:
			'The phase that produces the economy effect: maximal force and rate of force development, at or above 85 % 1RM, with maximal *intent* on the concentric regardless of the actual bar speed, and never to failure. Ramp 85 → 87 → 90 % across a four-week block, then reset five points down and add a set. Not within 24 hours before a key endurance session.',
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ACSM_2026,
		regressesTo: 'strength-S1',
		blocks: [
			block([
				lift('ex_bb_back_squat', { sets: 4, reps: 4, pct1RM: 85, rir: 2, tempo: '2-0-X' }, 240),
				lift('ex_db_rfe_split_squat', { sets: 3, reps: 6, rir: 2, tempo: '2-0-X' }, 180, 'Per leg.'),
				lift('ex_bw_calf_raise', { sets: 3, reps: 8, rir: 2, tempo: '2-0-X' }, 120),
				lift('ex_mc_pallof_press', { sets: 3, reps: 8 }, 60, 'Per side.'),
			]),
		],
	},
	{
		key: 'strength-S7',
		title: 'Maximal strength B — hinge',
		description:
			'The hinge counterpart to the squat day, on the same percentage ramp. Move from the trap bar to a conventional deadlift once the technique holds.',
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ACSM_2026,
		blocks: [
			block([
				lift('ex_bb_trap_bar_deadlift', { sets: 4, reps: 4, pct1RM: 85, rir: 2, tempo: '2-0-X' }, 240),
				lift('ex_bb_hip_thrust', { sets: 3, reps: 6, rir: 2, tempo: '2-0-X' }, 180),
				lift('ex_bw_single_leg_rdl', { sets: 3, reps: 6, rir: 3, tempo: '2-0-X' }, 180, 'Per leg.'),
				lift('ex_bw_nordic_curl', { sets: 3, reps: 6, bodyweight: true }, 180),
			]),
		],
	},
	{
		key: 'strength-S8',
		title: 'Rønnestad protocol',
		description:
			'The closest thing in the literature to a copy-and-run protocol with a measured performance outcome behind it — and its load anchor is a **rep max, not a percentage of 1RM**. That is the point: a rep-max reference self-calibrates, needs no 1RM test, and sidesteps the fact that `% 1RM` does not travel below about 85 %. The protocol *is* the progression: 10RM for weeks 1–3, 8RM for 4–6, 6RM for 7–9, 4RM for 10–12. This row seeds at the first rung.',
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: RONNESTAD_HEAVY_2010,
		blocks: [
			block([
				lift('ex_bb_half_squat', { sets: 3, reps: 10, repMax: 10, tempo: '2-0-X' }, 180),
				lift('ex_mc_single_leg_press', { sets: 3, reps: 10, repMax: 10, tempo: '2-0-X' }, 180, 'Per leg.'),
				lift('ex_mc_hip_flexion', { sets: 3, reps: 10, repMax: 10, tempo: '2-0-X' }, 120, 'Per leg.'),
				lift('ex_bw_calf_raise', { sets: 3, reps: 10, repMax: 10, tempo: '2-0-X' }, 120),
			]),
		],
	},
	{
		key: 'strength-S9',
		title: 'Upper-body maximal strength — ski, row, swim',
		description:
			'Heavy upper-body strength on the exercise selection the elite cross-country trial used, ramping on the same rep-max ladder as the cyclist protocol.',
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: LOSNEGARD_2011,
		blocks: [
			block([
				lift('ex_mc_lat_pulldown', { sets: 4, reps: 5, rir: 2, tempo: '2-0-X' }, 180),
				lift('ex_mc_double_poling_pull', { sets: 4, reps: 5, rir: 2, tempo: '2-0-X' }, 180),
				lift('ex_mc_tricep_pushdown', { sets: 3, reps: 6, rir: 2, tempo: '2-0-X' }, 180),
				lift('ex_bb_row', { sets: 3, reps: 6, rir: 2, tempo: '2-0-X' }, 180),
			]),
		],
	},
	{
		key: 'strength-S10',
		title: 'Heavy cluster singles, velocity-capped',
		description:
			'Three clusters of three singles at 88–92 % 1RM with twenty seconds between reps — and **the exercise stops when mean velocity falls more than 10 %**, not at a rep count. A velocity-loss set has no authored rep count by construction, which is exactly why inventing one for it would be a fabricated number. Add a cluster before adding load.',
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'neuromuscular',
		level: 'advanced',
		phases: ['build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: SANCHEZ_MEDINA_2011,
		blocks: [
			block(
				[
					lift('ex_bb_back_squat', { sets: 3, pct1RM: 90, velocityLossPct: 10, tempo: '2-0-X' }, 20, 'Singles, 20 s intra-cluster rest; maximal intent.'),
					rest(180),
				],
				{ name: 'clusters', repeat: 3 },
			),
		],
	},
	{
		key: 'strength-S11',
		title: 'Low-fatigue maximal strength',
		description: `${CONVENTION_NOTICE} **The default session**, and convention rather than protocol: it is derived from Doma's review finding that a resistance bout degrades the *next* endurance session — so this one buys most of the strength stimulus in about twenty-five minutes with no soreness intended. Deliberately not progressed into fatigue: add load only when the reps-in-reserve drift to 4.`,
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'neuromuscular',
		level: null,
		phases: ['base', 'build', 'peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([
				lift('ex_bb_back_squat', { sets: 3, reps: 3, pct1RM: 85, rir: 3, tempo: '2-0-X' }, 180),
				lift('ex_bb_trap_bar_deadlift', { sets: 3, reps: 3, pct1RM: 82, rir: 3, tempo: '2-0-X' }, 180),
				lift('ex_bw_calf_raise', { sets: 2, reps: 8, rir: 3, tempo: '2-0-X' }, 120),
			]),
		],
	},
	{
		key: 'strength-S12',
		title: 'Tendon-loading day (heavy slow resistance, loaded)',
		description: `${CONVENTION_NOTICE} The loaded stage of the heavy-slow-resistance ramp, tempo held at 3-0-3 throughout as the reps come down: 3 × 15 → 3 × 12 → 4 × 10 → 4 × 8 → 4 × 6. Same extrapolation caveat as the primer — the protocol is a rehabilitation one.`,
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'technique',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		regressesTo: 'strength-S4',
		blocks: [
			block([
				lift('ex_bw_heel_raise_straight', { sets: 4, reps: 6, rir: 2, tempo: '3-0-3' }, 180),
				lift('ex_bw_heel_raise_bent', { sets: 4, reps: 6, rir: 2, tempo: '3-0-3' }, 180),
				lift('ex_mc_leg_press', { sets: 4, reps: 6, rir: 2, tempo: '3-0-3' }, 180),
			]),
		],
	},
	{
		key: 'strength-S13',
		title: 'Unilateral maximal strength',
		description:
			"The one-legged bias of the cyclist protocol carried into a whole session, plus the adductor work running needs. Add external load before adding reps.",
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: RONNESTAD_HEAVY_2010,
		blocks: [
			block([
				lift('ex_db_rfe_split_squat', { sets: 4, reps: 5, rir: 2, tempo: '2-0-X' }, 180, 'Per leg.'),
				lift('ex_mc_single_leg_press', { sets: 4, reps: 5, rir: 2, tempo: '2-0-X' }, 180, 'Per leg.'),
				lift('ex_bw_single_leg_calf_raise', { sets: 3, reps: 8, rir: 2, tempo: '2-0-X' }, 180, 'Per leg.'),
				lift('ex_bw_copenhagen', { sets: 3, reps: 8, bodyweight: true }, 120, 'Per side.'),
			]),
		],
	},

	// ——— Phase 3 · Power and explosive ————————————————————————————————
	{
		key: 'strength-S14',
		title: 'Contrast pairs',
		description: `${CONVENTION_NOTICE} A heavy triple paired with jumps ninety seconds later — post-activation potentiation practice. Quality-limited, never fatigue-limited: shorten the intra-pair rest before adding a pair.`,
		discipline: 'strength',
		intent: 'strength-power',
		archetype: 'neuromuscular',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block(
				[
					lift('ex_bb_back_squat', { sets: 1, reps: 3, pct1RM: 85, tempo: '2-0-X' }, 90),
					rest(90),
					lift('ex_bw_cmj', { sets: 1, reps: 5, bodyweight: true }, 60, 'Maximal intent.'),
					rest(180),
				],
				{ name: 'contrast pairs', repeat: 4 },
			),
			block([lift('ex_bb_hip_thrust', { sets: 3, reps: 5, rir: 3 }, 180)]),
		],
	},
	{
		key: 'strength-S15',
		title: 'Plyometrics A — reactive, low',
		description:
			'The low-intensity reactive entry point, and the phase with the *largest* running-economy effect in the meta-analytic record. **Cap the session at 120 ground contacts** — the dose is contacts, and there is no field for it, so it is stated here. The bounds and skips are quantified in metres, which a set cannot terminate on, so they are steps rather than exercises.',
		discipline: 'strength',
		intent: 'strength-power',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: DENADAI_2017,
		progressesTo: 'strength-S16',
		blocks: [
			block([
				lift('ex_bw_pogo_hop', { sets: 3, reps: 20, bodyweight: true }, 90),
				overGround(20, 'Ankle bounds — 3 × 20 m.'),
				lift('ex_bw_box_jump', { sets: 3, reps: 6, bodyweight: true }, 90, 'From a 20 cm box.'),
				overGround(30, 'Skipping — 3 × 30 m.'),
			]),
		],
	},
	{
		key: 'strength-S16',
		title: 'Plyometrics B — high intensity',
		description:
			'The high-intensity reactive session: the original explosive-strength trial cut 5 km time with VO2max unchanged, which is the proof of concept for the whole phase. **Cap at 100 ground contacts.** Raise the box height only when contact time is unchanged.',
		discipline: 'strength',
		intent: 'strength-power',
		archetype: 'neuromuscular',
		level: 'advanced',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: PAAVOLAINEN_1999,
		regressesTo: 'strength-S15',
		blocks: [
			block([
				lift('ex_bw_drop_jump', { sets: 4, reps: 5, bodyweight: true }, 180, 'From 30–40 cm.'),
				overGround(20, 'Alternate-leg bounding — 4 × 20 m.'),
				lift('ex_bw_single_leg_hop', { sets: 3, reps: 8, bodyweight: true }, 120, 'Per leg.'),
				lift('ex_bw_hurdle_hop', { sets: 3, reps: 6, bodyweight: true }, 120),
			]),
		],
	},
	{
		key: 'strength-S17',
		title: 'Olympic-derivative power',
		description:
			'Power-band work inside the 30–70 % 1RM range, with **bar velocity as the real cap**: hold the velocity band and add load until the velocity falls out of it. The jump squat carries a velocity target rather than a percentage, because that is what governs the set.',
		discipline: 'strength',
		intent: 'strength-power',
		archetype: 'neuromuscular',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ACSM_2026,
		blocks: [
			block([
				lift('ex_bb_hang_power_clean', { sets: 5, reps: 3, velocityMs: [0.9, 1.1] }, 180, 'Target 0.9–1.1 m/s at 70–80 % 1RM.'),
				lift('ex_bb_mid_thigh_pull', { sets: 4, reps: 3, pct1RM: 80 }, 180),
				lift('ex_bb_jump_squat', { sets: 4, reps: 4, velocityMs: [1.0, 1.4] }, 180, 'At ~30 % 1RM; above 1.0 m/s.'),
			]),
		],
	},
	{
		key: 'strength-S18',
		title: 'Ballistic upper — ski, row, swim',
		description:
			'The power variant of the upper-body selection: ballistic throws and explosive pulls, progressed load first, then rate, then reps.',
		discipline: 'strength',
		intent: 'strength-power',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: LOSNEGARD_2011,
		blocks: [
			block([
				lift('ex_mb_slam', { sets: 5, reps: 5 }, 150),
				lift('ex_mc_double_poling_pull', { sets: 5, reps: 5, velocityMs: [0.8, 1.0] }, 150, 'Explosive.'),
				lift('ex_mc_lat_pulldown', { sets: 4, reps: 4, pct1RM: 60 }, 150, 'Explosive.'),
				lift('ex_mb_chest_pass', { sets: 4, reps: 5 }, 150),
			]),
		],
	},
	{
		key: 'strength-S19',
		title: 'Maximal hill sprints (the bridge)',
		description:
			'**Deliberately modelled as cardio, and that is the point.** It is a neuromuscular session with a strength purpose: it carries a run discipline, contributes running load, and would count toward endurance adherence — while the physiological intent belongs to the power phase. The classification problem is the session, not a defect in it. The grade is a 6–10 % band, which a single grade column cannot hold, so it is stated rather than stored.',
		discipline: 'run',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: null,
		phases: ['base', 'build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: DENADAI_2017,
		blocks: [
			block([run({ durationSec: min(10), intensity: rpe(3) })], {
				name: 'warm-up',
			}),
			block(
				[
					run({ durationSec: 8, intensity: rpe(10), notes: 'Maximal, uphill on 6–10 % grade.' }),
					rest(150),
				],
				{ repeat: 8 },
			),
			block([run({ durationSec: min(10), intensity: rpe(3) })], {
				name: 'cool-down',
			}),
		],
	},

	// ——— Phase 4 · In-season maintenance ————————————————————————————————
	{
		key: 'strength-S20',
		title: 'Minimum effective maintenance',
		description:
			'**One session per week is the maintenance dose, and one per fortnight is not enough** — a rare, directly actionable, directly citable number. Cyclists who lifted twice weekly through a twelve-week preparation and once weekly through a thirteen-week competitive period maintained thigh cross-sectional area and leg strength and kept improving sprint peak power, threshold power and 40-minute power against endurance-only controls. Do not progress it in-season; hold the relative load as the 1RM drifts.',
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'neuromuscular',
		level: null,
		phases: ['peak', 'taper'],
		goalEvents: [],
		provenance: 'corpus',
		citation: RONNESTAD_MAINTENANCE_2010,
		blocks: [
			block([
				lift('ex_bb_back_squat', { sets: 3, reps: 4, pct1RM: 85, rir: 2, tempo: '2-0-X' }, 180),
				lift('ex_bb_trap_bar_deadlift', { sets: 2, reps: 4, pct1RM: 82, rir: 2, tempo: '2-0-X' }, 180),
			]),
		],
	},
	{
		key: 'strength-S21',
		title: 'Race-week maintenance (taper-safe)',
		description: `${CONVENTION_NOTICE} Retains neural drive and adds no fatigue: under fifteen minutes, no soreness, and at least 72 hours before the race. This session exists in order *not* to progress.`,
		discipline: 'strength',
		intent: 'strength-max',
		archetype: 'neuromuscular',
		level: null,
		phases: ['race-week'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([
				lift('ex_bb_back_squat', { sets: 2, reps: 3, pct1RM: 80, rir: 4, tempo: '2-0-X' }, 180),
				lift('ex_bw_cmj', { sets: 2, reps: 3, bodyweight: true }, 120),
			]),
		],
	},
	{
		key: 'strength-S22',
		title: 'Maintenance with a plyometric top-up',
		description: `${CONVENTION_NOTICE} The maintenance dose plus the smallest useful plyometric one — **cap at 60 ground contacts**.`,
		discipline: 'strength',
		intent: 'strength-power',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['peak', 'taper'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		regressesTo: 'strength-S20',
		blocks: [
			block([
				lift('ex_bb_back_squat', { sets: 3, reps: 4, pct1RM: 85, rir: 2, tempo: '2-0-X' }, 180),
				lift('ex_bw_drop_jump', { sets: 3, reps: 5, bodyweight: true }, 120),
				overGround(20, 'Alternate-leg bounding — 3 × 20 m.'),
			]),
		],
	},
	{
		key: 'strength-S23',
		title: 'Travel maintenance, no equipment',
		description: `${CONVENTION_NOTICE} **This is the Catalogue's weakest row and is labelled as one.** Isometric training's effect on running economy was not significant in the meta-analysis (−2.20 ± 4.37 %, p = 0.324), and bodyweight-only work cannot reach the ≥ 85 % 1RM band the maximal-strength evidence rests on. It preserves some neural stimulus during travel; it is not a substitute for the real maintenance session and must not be presented as one.`,
		discipline: 'strength',
		intent: 'strength-endurance',
		archetype: 'technique',
		level: null,
		phases: ['peak', 'taper'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([
				lift('ex_bw_single_leg_squat', { sets: 3, reps: 8, rir: 2, bodyweight: true }, 120, 'Per leg.'),
				lift('ex_bw_nordic_curl', { sets: 3, reps: 6, bodyweight: true }, 120),
				lift('ex_bw_single_leg_calf_raise', { sets: 3, reps: 12, rir: 2, bodyweight: true }, 120, 'Per leg.'),
				lift('ex_bw_iso_split_squat_hold', { sets: 3, durationSec: 30, bodyweight: true }, 120),
			]),
		],
	},
	{
		key: 'strength-S24',
		title: 'Injury-prevention adjunct',
		description: `${CONVENTION_NOTICE} Drawn from the injury-prevention literature rather than the performance literature — which is a different claim, and worth keeping separate.`,
		discipline: 'strength',
		intent: 'strength-endurance',
		archetype: 'technique',
		level: null,
		phases: ['base', 'build', 'peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([
				lift('ex_bw_nordic_curl', { sets: 3, reps: 6, bodyweight: true }, 90),
				lift('ex_bw_copenhagen', { sets: 3, reps: 8, bodyweight: true }, 90, 'Per side.'),
				lift('ex_bw_single_leg_calf_raise', { sets: 3, reps: 15, bodyweight: true }, 90, 'Per leg.'),
				lift('ex_mc_hip_abduction', { sets: 3, reps: 15 }, 90, 'Per side.'),
			]),
		],
	},
	{
		key: 'strength-S25',
		title: 'Trunk and anti-rotation',
		description: `${CONVENTION_NOTICE} **The evidence here is weak** and the row says so: core work's transfer to endurance performance is not established. Progress by load, not by duration. The suitcase carry is quantified in metres, which a set cannot terminate on, so it is a step.`,
		discipline: 'strength',
		intent: 'strength-endurance',
		archetype: 'technique',
		level: null,
		phases: ['base', 'build', 'peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([
				lift('ex_mc_pallof_press', { sets: 3, reps: 10 }, 60, 'Per side.'),
				lift('ex_bw_side_plank', { sets: 3, durationSec: 45, bodyweight: true }, 60, 'Per side.'),
				lift('ex_bw_dead_bug', { sets: 3, reps: 10, bodyweight: true }, 60, 'Per side.'),
				overGround(30, 'Suitcase carry — 3 × 30 m per side.'),
			]),
		],
	},
]
