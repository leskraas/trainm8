/**
 * The cycling corpus — `docs/research/workouts-cycling.md`, 41 sessions across
 * archetypes A–H.
 *
 * ## Four things this transcription had to decide
 *
 * - **Every percentage names its reference.** `powerPct` silently meant % FTP;
 *   the interval literature anchors on **MAP** and the critical-power
 *   literature on **CP**, and CP ≠ FTP (256 ± 50 W vs 249 ± 44 W, and the gap
 *   widens with fitness). Every row here states `ftp`, and the rows whose
 *   source actually anchors on MAP say so in their description rather than
 *   silently restating it as FTP.
 * - **Nested repeats are used where the source has them.** `3 × (13 × 30/15)`
 *   is `series: 3` over `repeat: 13`, not a flattened 39. The research called
 *   this "the blocking structural gap" and it is no longer one.
 * - **Cadence is a prescription, and it is stored.** Six rows have cadence as
 *   their defining variable. Before the cadence columns existed, F2's four
 *   rungs rendered as four identical tokens — "the honest output of a structure
 *   that cannot say what the session is about". They now differ.
 * - **No goal events.** `CATALOGUE_GOAL_EVENTS` is a list of running distances.
 *   The cycling library's goals are road racing, gran fondo, time trial,
 *   triathlon and general fitness, and none of them is expressible — so every
 *   row here is unscoped by goal, which is a positive statement ("not scoped")
 *   and not a gap in the transcription. Giving cycling its events is
 *   outstanding work.
 *
 * ## What could not be said
 *
 * - **A ramp is not a step.** H2's ramp test is the single most common cycling
 *   session that cannot be written down, so it is seeded as the flat wide-RPE
 *   step the research itself wrote, with the ramp in its description.
 * - **Borg 6–20 is not CR10.** B4's protocol prescribes Borg 14–15;
 *   `IntensityTargetSchema` stores CR10 only. The row states the RPE the
 *   research converted to and names the original scale in its description.
 * - **Relief intensity has no home on a rest step.** Rønnestad's relief is at
 *   50 % of the *work* power, not soft-pedalling — a protocol variable, and one
 *   of the nine an interval prescription has. Where the relief has a stated
 *   intensity it is seeded as a cardio step rather than a rest, so the number
 *   survives.
 */
import {
	ALLEN_COGGAN,
	ALMQUIST_SPRINTS,
	BOSSI_VARIABLE,
	BURGOMASTER_SIT,
	HELGERUD_2007,
	JONES_VANHATALO_CP,
	MAUNDER_DURABILITY,
	MILLET_STANDING,
	MOLMEN_MIT,
	RONNESTAD_SHORT_INTERVALS,
	SEILER_2013,
} from './catalogue-corpus.citations.ts'
import {
	CONVENTION_NOTICE,
	bike,
	block,
	hours,
	hrPct,
	min,
	powerPct,
	rest,
	rpe,
	run,
	type CorpusSession,
} from './catalogue-corpus.ts'

const warmUp = (m: number) =>
	block([bike({ durationSec: min(m), intensity: powerPct('ftp', 55, 65) })], {
		name: 'warm-up',
	})
const coolDown = (m: number) =>
	block([bike({ durationSec: min(m), intensity: powerPct('ftp', 50, 55) })], {
		name: 'cool-down',
	})
/** A relief step with a stated power — a cardio step, not a rest, so the
 * relief intensity the protocol specifies is not thrown away. */
const relief = (durationSec: number, pct: number) =>
	bike({ durationSec, intensity: powerPct('ftp', pct) })

export const BIKE_CORPUS: CorpusSession[] = [
	// ——— A · Endurance & recovery ————————————————————————————————————————
	{
		key: 'bike-A1',
		title: 'Recovery spin',
		description:
			'Circulation without stimulus — the day-after ride. Cadence self-selected and no intervals of any kind. A recovery ride that progresses is not a recovery ride.',
		discipline: 'bike',
		intent: 'recovery',
		archetype: 'recovery',
		level: null,
		phases: ['base', 'build', 'peak', 'taper', 'race-week'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ALLEN_COGGAN,
		blocks: [
			block([bike({ durationSec: min(45), intensity: powerPct('ftp', 45, 55) })]),
		],
	},
	{
		key: 'bike-A2',
		title: 'Endurance ride (langtur)',
		description:
			'Aerobic base, capillarisation, fat oxidation, durability. Note that the *molecular* case for "zone 2" is much weaker than folklore suggests — the popular mitochondrial citation is cross-sectional, and higher intensities favour PGC-1α. The honest case for this ride is load management: it is the intensity at which large volumes are recoverable, and the volume is the driver.',
		discipline: 'bike',
		intent: 'endurance',
		archetype: 'easy',
		level: null,
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ALLEN_COGGAN,
		blocks: [
			block([bike({ durationSec: hours(3), intensity: powerPct('ftp', 60, 75) })]),
		],
	},
	{
		key: 'bike-A3',
		title: 'Endurance ride with sprints',
		description:
			'A neuromuscular and anaerobic stimulus inside a low-intensity ride at almost no aerobic cost. The published protocols use **30-second** sprints — glycolytic, Wingate-like — not the 5–15 s effort coaching software labels "neuromuscular"; extending the finding to a 10 s max sprint is an extrapolation, not a result. The strongest outcomes also come from the transition period, an unusually favourable context.',
		discipline: 'bike',
		intent: 'endurance',
		archetype: 'fartlek',
		level: 'intermediate',
		phases: ['base'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ALMQUIST_SPRINTS,
		blocks: [
			block([bike({ durationSec: min(30), intensity: powerPct('ftp', 65) })]),
			block(
				[
					bike({ durationSec: 30, intensity: rpe(10) }),
					relief(min(4), 60),
				],
				{ name: 'sprints', repeat: 3, series: 3, betweenSeriesRestSec: min(10) },
			),
			block([bike({ durationSec: min(90), intensity: powerPct('ftp', 65) })]),
		],
	},
	{
		key: 'bike-A4',
		title: 'Durability ride (tempo finish)',
		description:
			'Trains performance *after* accumulated work — the fatigue-resistance quality fondos and stage races actually select on. Fuel deliberately; the finish is the session.',
		discipline: 'bike',
		intent: 'endurance',
		archetype: 'long',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAUNDER_DURABILITY,
		blocks: [
			block([bike({ durationSec: hours(3), intensity: powerPct('ftp', 62, 72) })]),
			block([bike({ durationSec: min(35), intensity: powerPct('ftp', 85, 92) })]),
		],
	},

	// ——— B · Tempo & sweet spot ————————————————————————————————————————
	{
		key: 'bike-B1',
		title: 'Tempo ride',
		description:
			'Classic steady state: aerobic development at higher density than an endurance ride, for time-limited riders.',
		discipline: 'bike',
		intent: 'tempo',
		archetype: 'tempo',
		level: null,
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ALLEN_COGGAN,
		blocks: [
			warmUp(15),
			block(
				[
					bike({ durationSec: min(20), intensity: powerPct('ftp', 78, 88) }),
					relief(min(5), 55),
				],
				{ repeat: 3 },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-B2',
		title: 'Sweet spot intervals',
		description: `${CONVENTION_NOTICE} The band is a coaching heuristic and not a landmark: nobody measured a physiological breakpoint at 88 % or 94 % FTP, and 84–97, 88–94, 88–93 and 83–97 % all circulate — which is what happens when a term straddles two zones by construction. "Sweet spot" has zero peer-reviewed hits in PubMed or Europe PMC. It must never be a zone band; it is a session.`,
		discipline: 'bike',
		intent: 'tempo',
		archetype: 'sub-threshold',
		level: null,
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(15), intensity: powerPct('ftp', 88, 94) }),
					relief(min(5), 55),
				],
				{ repeat: 3 },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-B3',
		title: 'Extended sweet spot',
		description: `${CONVENTION_NOTICE} The same stimulus over longer continuous exposure — fondo and time-trial specific. The band's provenance problem is the same as the shorter version's.`,
		discipline: 'bike',
		intent: 'tempo',
		archetype: 'sub-threshold',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(30), intensity: powerPct('ftp', 88, 94) }),
					relief(min(10), 55),
				],
				{ repeat: 2 },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-B4',
		title: 'Rønnestad moderate-intensity session',
		description:
			'The one sub-threshold protocol with a controlled trial behind it. The published anchor is **Borg 14–15 on the 6–20 scale** (≈ 66 % of power at VO2max, ~85 % HRmax, ~2.8 mmol/L, roughly 88–95 % FTP); trainm8 stores the CR10 scale only, so the RPE below is the research library\'s conversion and not the protocol\'s own number. The *block* form is six such sessions in seven days — and never for a beginner.',
		discipline: 'bike',
		intent: 'threshold',
		archetype: 'sub-threshold',
		level: 'intermediate',
		phases: ['base'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MOLMEN_MIT,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(12), intensity: rpe(5, 6) }),
					relief(min(3), 55),
				],
				{ repeat: 6 },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-B5',
		title: 'Progressive endurance ride',
		description: `${CONVENTION_NOTICE} Rehearses negative-split pacing and ends near threshold on accumulated fatigue. Four continuous 25-minute rungs with no recovery between them.`,
		discipline: 'bike',
		intent: 'endurance',
		archetype: 'steady',
		level: null,
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(15),
			block([
				bike({ durationSec: min(25), intensity: powerPct('ftp', 62, 68) }),
				bike({ durationSec: min(25), intensity: powerPct('ftp', 72, 78) }),
				bike({ durationSec: min(25), intensity: powerPct('ftp', 82, 88) }),
				bike({ durationSec: min(25), intensity: powerPct('ftp', 90, 94) }),
			]),
			coolDown(10),
		],
	},

	// ——— C · Threshold & over-unders ————————————————————————————————————
	{
		key: 'bike-C1',
		title: 'Two times twenty',
		description:
			'The reference threshold session: raise power at maximal lactate steady state.',
		discipline: 'bike',
		intent: 'threshold',
		archetype: 'threshold',
		level: null,
		phases: ['build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ALLEN_COGGAN,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(20), intensity: powerPct('ftp', 95, 105) }),
					relief(min(10), 55),
				],
				{ repeat: 2 },
			),
			coolDown(15),
		],
	},
	{
		key: 'bike-C2',
		title: 'Three times twelve threshold',
		description:
			'The same stimulus with more reps and a lower per-rep psychological cost.',
		discipline: 'bike',
		intent: 'threshold',
		archetype: 'threshold',
		level: null,
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ALLEN_COGGAN,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(12), intensity: powerPct('ftp', 98, 102) }),
					relief(min(4), 55),
				],
				{ repeat: 3 },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-C3',
		title: 'Over-unders (criss-cross)',
		description: `${CONVENTION_NOTICE} Tolerance of surges around threshold. The lactate-clearance rationale usually given for this session is **extrapolated** from steady-state training — no work-matched oscillating-versus-constant trial exists — so the defensible claim is surge tolerance, not clearance. The nested shape is now real: three series of six alternating minutes, rather than eighteen unrolled steps.`,
		discipline: 'bike',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(2), intensity: powerPct('ftp', 95) }),
					bike({ durationSec: min(2), intensity: powerPct('ftp', 105) }),
				],
				{ repeat: 3, series: 3, betweenSeriesRestSec: min(6) },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-C4',
		title: 'Sharp over-unders',
		description: `${CONVENTION_NOTICE} A larger oscillation over a shorter dwell — race-surge specific. Six one-minute pairs per series, three series.`,
		discipline: 'bike',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(1), intensity: powerPct('ftp', 110) }),
					bike({ durationSec: min(1), intensity: powerPct('ftp', 90) }),
				],
				{ repeat: 6, series: 3, betweenSeriesRestSec: min(6) },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-C5',
		title: 'Long steady state',
		description: `${CONVENTION_NOTICE} Time-trial and fondo specific: continuous sub-threshold power held in the intended race position. The position is the point — ride it aero.`,
		discipline: 'bike',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block([
				bike({
					durationSec: min(45),
					intensity: powerPct('ftp', 88, 95),
					notes: 'In the intended race position throughout.',
				}),
			]),
			coolDown(15),
		],
	},
	{
		key: 'bike-C6',
		title: 'Broken threshold',
		description: `${CONVENTION_NOTICE} Accumulates more time at threshold than a continuous effort of the same intensity, by breaking it with micro-recoveries — the same mechanism the short-interval literature exploits. Two series of four.`,
		discipline: 'bike',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(6), intensity: powerPct('ftp', 100, 105) }),
					relief(min(1), 55),
				],
				{ repeat: 4, series: 2, betweenSeriesRestSec: min(8) },
			),
			coolDown(10),
		],
	},

	// ——— D · VO₂max ———————————————————————————————————————————————————
	{
		key: 'bike-D1',
		title: 'Seiler 4 × 8',
		description:
			"The dose-and-intensity optimum of the 4 × 4 / 4 × 8 / 4 × 16 comparison. All three arms were **self-paced at maximal tolerable intensity**, so prescribing a fixed % FTP misses the mechanism entirely — the anchor is the hardest even power holdable for all four reps, which trainm8 can only approximate as RPE 8. Scope caveat: n = 35 across four arms over 7 weeks in trained recreational riders; an 11 % composite gain does not transfer to an elite.",
		discipline: 'bike',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: SEILER_2013,
		blocks: [
			warmUp(20),
			block([bike({ durationSec: min(8), intensity: rpe(8) }), rest(min(2))], {
				repeat: 4,
			}),
			coolDown(10),
		],
	},
	{
		key: 'bike-D2',
		title: 'Seiler 4 × 4 / Helgerud 4 × 4',
		description:
			'The highest-intensity arm, and the reference HIIT protocol in the wider literature. Helgerud prescribed 90–95 % HRmax — note that his study was a **running** study in moderately trained men, not a cycling one, which is a real limit on how far the number travels to a bike.',
		discipline: 'bike',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: null,
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: HELGERUD_2007,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(4), intensity: hrPct('max', 90, 95) }),
					bike({ durationSec: min(3), intensity: hrPct('max', 70) }),
				],
				{ repeat: 4 },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-D3',
		title: 'Seiler 4 × 16',
		description:
			"The high-volume, lower-intensity arm — seeded because knowing what *did not* win is part of the citation. Self-paced at maximal tolerable intensity, which for this duration landed the trial's riders around 88 % HRpeak.",
		discipline: 'bike',
		intent: 'vo2max',
		archetype: 'threshold',
		level: 'advanced',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: SEILER_2013,
		blocks: [
			warmUp(20),
			block([bike({ durationSec: min(16), intensity: rpe(7) }), rest(min(2))], {
				repeat: 4,
			}),
			coolDown(10),
		],
	},
	{
		key: 'bike-D4',
		title: 'Rønnestad 30/15',
		description:
			'Three series of thirteen 30-second bouts with twelve 15-second reliefs — a series is 9.5 minutes continuous, which is why "13 × (30/15)" overstates it. **Seed it, but not as settled.** No paper prescribes a % FTP: the anchor is power at VO2max in the acute study and self-paced maximal average power in the trials, and the relief is at 50 % of the *work* power rather than soft-pedalling. Every positive trial is from one lab with n = 7–9 per arm; a 2025 replication found the advantage only under fixed pacing and it vanished when both formats were self-paced; a 2021 meta-analysis of 29 studies points toward *longer* bouts.',
		discipline: 'bike',
		intent: 'vo2max',
		archetype: 'vo2max-short',
		level: 'advanced',
		phases: ['build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: RONNESTAD_SHORT_INTERVALS,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: 30, intensity: rpe(9) }),
					relief(15, 65),
				],
				{ repeat: 13, series: 3, betweenSeriesRestSec: min(3) },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-D5',
		title: 'Rønnestad long-interval comparator',
		description:
			'The effort-matched long-interval arm: four times five minutes at maximal sustainable average power with 2.5 minutes of recovery at half the work power. A hard, legitimate session and the honest control — framing the short-interval result as "30/15 beats threshold intervals" is simply wrong, because *this* was the comparator.',
		discipline: 'bike',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: 'advanced',
		phases: ['build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: RONNESTAD_SHORT_INTERVALS,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(5), intensity: rpe(9) }),
					relief(150, 50),
				],
				{ repeat: 4 },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-D6',
		title: 'Variable-intensity VO₂max',
		description:
			'Power that **oscillates** around the mean rather than being held flat, which raised time at ≥ 90 % VO2max by about 43 % against constant power at matched mean power and duration. One acute crossover, n = 14, on a surrogate outcome — no training intervention has shown it converts to superior adaptation, and part of the effect is attributed to the oxygen cost of breathing. The waveform below is a reconstruction of the principle, not the published one.',
		discipline: 'bike',
		intent: 'vo2max',
		archetype: 'vo2max-short',
		level: 'advanced',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: BOSSI_VARIABLE,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: 15, intensity: powerPct('ftp', 130) }),
					bike({ durationSec: 45, intensity: powerPct('ftp', 95) }),
				],
				{ repeat: 5, series: 4, betweenSeriesRestSec: min(5) },
			),
			coolDown(10),
		],
	},

	// ——— E · Anaerobic capacity & neuromuscular ————————————————————————
	{
		key: 'bike-E1',
		title: 'Anaerobic capacity reps',
		description:
			"Deplete and reload W′, and raise tolerance to work above critical power. Note that 120–130 % FTP is roughly 115–125 % of CP — the two are not interchangeable, and the source's framing is the critical-power one.",
		discipline: 'bike',
		intent: 'anaerobic',
		archetype: 'anaerobic',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: JONES_VANHATALO_CP,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: min(1), intensity: powerPct('ftp', 120, 130) }),
					relief(min(3), 45),
				],
				{ repeat: 5, series: 2, betweenSeriesRestSec: min(8) },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-E2',
		title: '30/30s',
		description: `${CONVENTION_NOTICE} Repeated supra-threshold surges on incomplete recovery — criterium specific.`,
		discipline: 'bike',
		intent: 'anaerobic',
		archetype: 'anaerobic',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: 30, intensity: powerPct('ftp', 130) }),
					relief(30, 50),
				],
				{ repeat: 10, series: 2, betweenSeriesRestSec: min(5) },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-E3',
		title: 'Wingate sprint-interval training',
		description:
			'A maximal glycolytic stimulus at minimal time cost. Two cautions: the load model **badly under-prices** this — a 30-second all-out effort barely registers in a 30-second smoothed power series, so the TSS will read like an easy ride while the cost is nothing of the kind — and the most-dropped finding of the original study is that VO2peak did **not** change despite doubled endurance capacity.',
		discipline: 'bike',
		intent: 'anaerobic',
		archetype: 'anaerobic',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: BURGOMASTER_SIT,
		blocks: [
			warmUp(15),
			block([bike({ durationSec: 30, intensity: rpe(10) }), rest(min(4))], {
				repeat: 5,
			}),
			coolDown(10),
		],
	},
	{
		key: 'bike-E4',
		title: 'Neuromuscular sprints',
		description: `${CONVENTION_NOTICE} Peak power, recruitment and bike handling under load, from a rolling start inside an endurance ride. Planned load under-prices this the same way it under-prices every very short effort.`,
		discipline: 'bike',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: null,
		phases: ['base', 'build', 'peak', 'taper'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([bike({ durationSec: min(30), intensity: powerPct('ftp', 65) })]),
			block(
				[
					bike({
						durationSec: 10,
						intensity: rpe(10),
						notes: 'From a rolling ~30 km/h start.',
					}),
					relief(min(5), 60),
				],
				{ name: 'sprints', repeat: 8 },
			),
			coolDown(15),
		],
	},
	{
		key: 'bike-E5',
		title: 'Standing-start power efforts',
		description: `${CONVENTION_NOTICE} Torque and recruitment from near-standstill — race-start and attack specific. Big gear, standing, from about 10 km/h.`,
		discipline: 'bike',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(25),
			block(
				[
					bike({
						durationSec: 8,
						intensity: rpe(10),
						cadenceRpmMin: 40,
						cadenceRpmMax: 60,
						notes: 'Standing, big gear, from ~10 km/h.',
					}),
					relief(min(4), 55),
				],
				{ repeat: 8 },
			),
			coolDown(15),
		],
	},
	{
		key: 'bike-E6',
		title: 'Attack repeats',
		description: `${CONVENTION_NOTICE} Race-realistic: a hard surge followed by continued sub-threshold riding rather than by rest, which is what actually happens after an attack.`,
		discipline: 'bike',
		intent: 'anaerobic',
		archetype: 'race-simulation',
		level: 'intermediate',
		phases: ['peak', 'race-week'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: 30, intensity: powerPct('ftp', 150) }),
					bike({ durationSec: 270, intensity: powerPct('ftp', 88, 92) }),
					relief(min(5), 55),
				],
				{ repeat: 5 },
			),
			coolDown(10),
		],
	},

	// ——— F · Torque & cadence ————————————————————————————————————————
	{
		key: 'bike-F1',
		title: 'Big-gear torque intervals',
		description: `${CONVENTION_NOTICE} Sold as on-bike strength endurance; what is defensible is low-cadence pacing tolerance and position-specific comfort. **The claim is contradicted by the cleanest trial available**: twelve weeks of 40 rpm work found no gain in VO2max, performance *or leg strength*, while the free-cadence control improved. Seeded because a library that omits it should do so deliberately — the cadence is the prescription and is stored as one.`,
		discipline: 'bike',
		intent: 'tempo',
		archetype: 'technique',
		level: 'intermediate',
		phases: ['base'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({
						durationSec: min(6),
						intensity: powerPct('ftp', 80, 90),
						cadenceRpmMin: 50,
						cadenceRpmMax: 60,
						notes: 'Seated throughout.',
					}),
					relief(min(4), 55),
				],
				{ repeat: 5 },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-F2',
		title: 'Cadence ladder',
		description: `${CONVENTION_NOTICE} A *skill* session to broaden the comfortable cadence range: four rungs at constant power where the only thing that changes is leg speed. Before cadence was a stored prescription these four steps rendered as four identical tokens — the honest output of a structure that could not say what the session was about.`,
		discipline: 'bike',
		intent: 'technique',
		archetype: 'technique',
		level: null,
		phases: ['base'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({
						durationSec: min(2),
						intensity: powerPct('ftp', 65),
						cadenceRpmMin: 70,
						cadenceRpmMax: 70,
					}),
					bike({
						durationSec: min(2),
						intensity: powerPct('ftp', 65),
						cadenceRpmMin: 85,
						cadenceRpmMax: 85,
					}),
					bike({
						durationSec: min(2),
						intensity: powerPct('ftp', 65),
						cadenceRpmMin: 100,
						cadenceRpmMax: 100,
					}),
					bike({
						durationSec: min(2),
						intensity: powerPct('ftp', 65),
						cadenceRpmMin: 115,
						cadenceRpmMax: 115,
					}),
					relief(min(3), 55),
				],
				{ repeat: 4 },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-F3',
		title: 'High-cadence spin-ups',
		description: `${CONVENTION_NOTICE} Neuromuscular smoothness at high leg speed, ramped inside an endurance ride.`,
		discipline: 'bike',
		intent: 'technique',
		archetype: 'technique',
		level: null,
		phases: ['base'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([bike({ durationSec: min(30), intensity: powerPct('ftp', 65) })]),
			block(
				[
					bike({
						durationSec: 30,
						intensity: powerPct('ftp', 65),
						cadenceRpmMin: 120,
						cadenceRpmMax: 130,
						notes: 'Ramp up to the cadence, do not jump to it.',
					}),
					relief(90, 60),
				],
				{ repeat: 8 },
			),
			block([bike({ durationSec: min(20), intensity: powerPct('ftp', 65) })]),
		],
	},
	{
		key: 'bike-F4',
		title: 'Single-leg drills',
		description: `${CONVENTION_NOTICE} Claimed to improve pedalling efficiency. **The evidence is essentially none** — no trial supports a transfer to two-legged efficiency — and this row is seeded so that a Catalogue which contains it does so with that stated, rather than by omitting it silently.`,
		discipline: 'bike',
		intent: 'technique',
		archetype: 'technique',
		level: null,
		phases: ['base'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({
						durationSec: 30,
						intensity: powerPct('ftp', 60),
						notes: 'Left leg only.',
					}),
					bike({
						durationSec: 30,
						intensity: powerPct('ftp', 60),
						notes: 'Right leg only.',
					}),
					bike({ durationSec: min(1), intensity: powerPct('ftp', 65) }),
					relief(min(2), 55),
				],
				{ repeat: 4 },
			),
			coolDown(10),
		],
	},

	// ——— G · Climbing, TT & race-specific ————————————————————————————
	{
		key: 'bike-G1',
		title: 'Climbing VO₂max repeats',
		description: `${CONVENTION_NOTICE} A VO2max stimulus with the terrain enforcing steady power — no coasting, which is why a climb is a better place for this than the flat.`,
		discipline: 'bike',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({
						durationSec: min(4),
						intensity: powerPct('ftp', 110, 118),
						notes: 'Uphill.',
					}),
					relief(min(5), 50),
				],
				{ repeat: 5 },
			),
			coolDown(15),
		],
	},
	{
		key: 'bike-G2',
		title: 'Sustained climb threshold',
		description: `${CONVENTION_NOTICE} Climb-specific threshold in the position the event demands. Seated; descend to recover.`,
		discipline: 'bike',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({
						durationSec: min(15),
						intensity: powerPct('ftp', 95, 102),
						notes: 'Uphill, seated.',
					}),
					relief(min(8), 50),
				],
				{ repeat: 3 },
			),
			coolDown(15),
		],
	},
	{
		key: 'bike-G3',
		title: 'Seated and standing alternation',
		description:
			'Rehearses the position switching every climber actually does, which lowers post-effort lactate at matched oxygen cost and efficiency. The standing and seated minutes are identical in power and differ only in position — which the step notes carry, because position is not a field the model has.',
		discipline: 'bike',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MILLET_STANDING,
		blocks: [
			warmUp(20),
			block(
				[
					bike({
						durationSec: min(1),
						intensity: powerPct('ftp', 95, 100),
						notes: 'Standing.',
					}),
					bike({
						durationSec: min(2),
						intensity: powerPct('ftp', 95, 100),
						notes: 'Seated.',
					}),
				],
				{ repeat: 2, series: 4, betweenSeriesRestSec: min(5) },
			),
			coolDown(10),
		],
	},
	{
		key: 'bike-G4',
		title: 'Time-trial race-pace session',
		description: `${CONVENTION_NOTICE} Rehearse goal power, position, pacing and fuelling at once, in full aero position. The *portable* anchor here is **% of goal-event power**, which trainm8 cannot express — the cycling analogue of the running library's race-pace gap, and arguably more tractable because a goal power is one number on an Event. The band below is the FTP approximation the research gives for a 40 km time trial, not the athlete's goal power.`,
		discipline: 'bike',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({
						durationSec: min(20),
						intensity: powerPct('ftp', 95, 100),
						notes: 'Full aero position.',
					}),
					relief(min(10), 55),
				],
				{ repeat: 2 },
			),
			coolDown(15),
		],
	},
	{
		key: 'bike-G5',
		title: 'Gran fondo simulation',
		description: `${CONVENTION_NOTICE} Durability plus repeated climbing efforts on accumulated fatigue, fuelled to plan — the efforts are spaced across the ride rather than clustered.`,
		discipline: 'bike',
		intent: 'endurance',
		archetype: 'race-simulation',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([bike({ durationSec: min(60), intensity: powerPct('ftp', 65) })]),
			block(
				[
					bike({ durationSec: min(12), intensity: powerPct('ftp', 88, 95) }),
					bike({ durationSec: min(45), intensity: powerPct('ftp', 65) }),
				],
				{ repeat: 4 },
			),
			block([bike({ durationSec: min(30), intensity: powerPct('ftp', 62) })]),
		],
	},
	{
		key: 'bike-G6',
		title: 'Triathlon brick',
		description: `${CONVENTION_NOTICE} Bike-to-run transition specificity and run economy under cycling fatigue. Steady and aero on the bike with no surges, then straight into the run with a transition under five minutes — the run step overrides the workout's discipline, which is what a brick is.`,
		discipline: 'bike',
		intent: 'endurance',
		archetype: 'brick',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([bike({ durationSec: min(15), intensity: powerPct('ftp', 60) })], {
				name: 'warm-up',
			}),
			block([bike({ durationSec: min(75), intensity: powerPct('ftp', 78, 85) })]),
			block([run({ durationSec: min(20), intensity: rpe(4, 5) })], {
				name: 'off the bike',
			}),
		],
	},
	{
		key: 'bike-G7',
		title: 'Criterium simulation',
		description: `${CONVENTION_NOTICE} Repeated supra-threshold surges from a sub-threshold floor — eight surge-and-settle pairs per series, three series.`,
		discipline: 'bike',
		intent: 'anaerobic',
		archetype: 'race-simulation',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			warmUp(20),
			block(
				[
					bike({ durationSec: 15, intensity: powerPct('ftp', 200) }),
					bike({ durationSec: 45, intensity: powerPct('ftp', 85) }),
				],
				{ repeat: 8, series: 3, betweenSeriesRestSec: min(6) },
			),
			coolDown(10),
		],
	},

	// ——— H · Tests, taper & race week ————————————————————————————————
	{
		key: 'bike-H1',
		title: '20-minute FTP test',
		description:
			'Establishes the anchor everything else is a ratio of: FTP is 0.95 × the 20-minute mean power. The five-minute opener is there to blunt the anaerobic contribution to the main effort. The test does not progress — the *result* does.',
		discipline: 'bike',
		intent: 'test',
		archetype: 'test',
		level: 'intermediate',
		phases: ['base', 'build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: ALLEN_COGGAN,
		blocks: [
			block(
				[
					bike({ durationSec: min(20), intensity: powerPct('ftp', 55, 65) }),
					bike({
						durationSec: min(1),
						intensity: powerPct('ftp', 70),
						cadenceRpmMin: 100,
						cadenceRpmMax: 110,
					}),
				],
				{ name: 'warm-up', repeat: 3 },
			),
			block([bike({ durationSec: min(5), intensity: rpe(10) })], {
				name: 'opener',
			}),
			block([bike({ durationSec: min(10), intensity: powerPct('ftp', 50) })]),
			block([bike({ durationSec: min(20), intensity: rpe(9, 10) })], {
				name: 'the test',
			}),
			coolDown(10),
		],
	},
	{
		key: 'bike-H2',
		title: 'Ramp test to MAP',
		description: `${CONVENTION_NOTICE} Establishes maximal aerobic power — the anchor the short-interval literature actually uses, and one trainm8 has no field for. **A ramp is not a step the model has**: the real protocol raises power continuously (for example +25 W per minute from 100 W) to volitional exhaustion, and the flat wide-RPE step below is the research library's own rendering of that. Record the final one-minute mean power as MAP.`,
		discipline: 'bike',
		intent: 'test',
		archetype: 'test',
		level: null,
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([bike({ durationSec: min(10), intensity: powerPct('ftp', 55) })], {
				name: 'warm-up',
			}),
			block([
				bike({
					durationSec: min(20),
					intensity: rpe(6, 10),
					notes: 'Ramp +25 W/min from 100 W to volitional exhaustion.',
				}),
			]),
			coolDown(10),
		],
	},
	{
		key: 'bike-H3',
		title: 'Race-week opener',
		description: `${CONVENTION_NOTICE} Restores neuromuscular sharpness without adding fatigue — the day-before ride. Nothing here builds fitness.`,
		discipline: 'bike',
		intent: 'race',
		archetype: 'race-simulation',
		level: null,
		phases: ['race-week'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			block([bike({ durationSec: min(15), intensity: powerPct('ftp', 60) })], {
				name: 'warm-up',
			}),
			block(
				[
					bike({ durationSec: min(3), intensity: powerPct('ftp', 95, 100) }),
					relief(min(3), 55),
				],
				{ repeat: 3 },
			),
			block(
				[bike({ durationSec: 15, intensity: rpe(10) }), relief(min(3), 55)],
				{ name: 'openers', repeat: 3 },
			),
			coolDown(10),
		],
	},
]
