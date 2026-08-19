/**
 * The swimming corpus — `docs/research/workouts-swimming.md` §3, all 36 rows
 * across its eight groups.
 *
 * (The document's own header says "32 sessions" and `README.md` says "~30";
 * §3.A–§3.H actually table **36**. Every one of them is here, and the count is
 * stated rather than repeated.)
 *
 * ## The send-off is the point
 *
 * Swimming's universal form is the **cycle time a set leaves on**, where the
 * rest is whatever is left after the swim. The research's own rendering had to
 * flatten `on (CSS + 12 s)` into `12 s rest`, "which is only correct if the
 * swimmer hits target pace exactly" — and a set that leaves on the same clock
 * gets *harder* as the swimmer tires, which a fixed rest cannot express at all.
 * Every row whose source states a send-off carries an **anchored** one here,
 * resolved against the athlete's own CSS. No absolute send-off is seeded:
 * `8 × 100 @ 1:40` is a moderate aerobic set at 1:20/100 m and physically
 * impossible at 2:10/100 m, so it cannot be shared.
 *
 * ## Zone labels here are `css-5` band labels, and that is deliberate
 *
 * `Z1`–`Z5` are the labels the swim recipes actually carry, so they resolve to
 * a concrete pace for a swimmer on `css-5` (or `css-3`) *and* map to a Training
 * Zone for everyone else through the `Z<n>` form. That is the one place in the
 * corpus where a zone label is portable.
 *
 * ## What is still lost, and named on each row
 *
 * - **No stroke, mode or equipment dimension.** `pull with buoy and band`,
 *   `kick on a board`, `drill`, `snorkel`, `heads-up` — none of it is storable,
 *   so it lives in the step's notes. B3 and the whole of §3.F are the sessions
 *   this costs most: a band-and-buoy pull set is both slower and harder than
 *   swimming, so pricing it at swim pace is wrong in both directions.
 * - **`css-5`'s Z5 is unbounded fast**, so an all-out 25 and a 400-pace 50 are
 *   the same authored target. Where the source names a race distance the row
 *   says so in its notes; the model has no swim race-pace anchor.
 * - **A ratio rest (`1:1 with the swim time`) is not a Rest Spec form.** D2's
 *   rest is prescribed as a ratio; a fixed 90 s is right only for a 1:30
 *   swimmer, so the row states the ratio in its notes and leaves the number the
 *   research chose.
 */
import {
	CRAIG_PENDERGAST_1979,
	FRIEL_TRIATHLETE,
	MAGLISCHO,
	MUJIKA_PADILLA_2003,
	PYNE_2001,
	SWEETENHAM,
	SWIM_SMOOTH,
	WAKAYOSHI_1992,
} from './catalogue-corpus.citations.ts'
import {
	CONVENTION_NOTICE,
	block,
	min,
	rest,
	restAs,
	rpe,
	run,
	swim,
	zone,
	type CorpusSession,
} from './catalogue-corpus.ts'

const wu = (m: number) =>
	block([swim({ distanceM: m, intensity: zone('Z2') })], { name: 'warm-up' })
const cd = (m: number) =>
	block([swim({ distanceM: m, intensity: zone('Z1') })], { name: 'cool-down' })
/** `on (CSS + n)` — the portable send-off, resolved against the swimmer's CSS. */
const onCss = (allowanceSecPer100m: number) =>
	({ kind: 'anchored', anchor: 'css', allowanceSecPer100m }) as const

export const SWIM_CORPUS: CorpusSession[] = [
	// ——— A · Tests and benchmarks ————————————————————————————————————————
	{
		key: 'swim-A1',
		title: 'CSS test (400/200)',
		description:
			'Establishes CSS, the anchor every other swim row is a ratio of: CSS is the gradient between the 400 and the 200 time. Both trials are **maximal-effort tests**, and the model has no way to say "swim this as fast as you can and record the time" — so they are authored as the fastest band, which resolves to a pace range the swimmer is meant to *exceed* rather than hold. Note also that CSS is not the same construct as maximal lactate steady state.',
		discipline: 'swim',
		intent: 'test',
		archetype: 'test',
		level: null,
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: WAKAYOSHI_1992,
		blocks: [
			wu(600),
			block([
				swim({
					distanceM: 400,
					intensity: zone('Z5'),
					notes: 'Time trial, all out.',
				}),
				swim({ distanceM: 100, intensity: zone('Z1') }),
				swim({ durationSec: min(10), intensity: zone('Z1') }),
				swim({
					distanceM: 200,
					intensity: zone('Z5'),
					notes: 'Time trial, all out.',
				}),
			]),
			cd(300),
		],
	},
	{
		key: 'swim-A2',
		title: 'T-30',
		description:
			"Threshold pace from one long continuous maximal swim — count the distance, and record the last ten minutes' average heart rate as a swim LTHR.",
		discipline: 'swim',
		intent: 'test',
		archetype: 'test',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: SWEETENHAM,
		blocks: [
			wu(600),
			block([
				swim({
					durationSec: min(30),
					intensity: zone('Z4'),
					notes: 'Maximal sustainable; count the distance.',
				}),
			]),
			cd(300),
		],
	},
	{
		key: 'swim-A3',
		title: 'T-20 / 1500 time trial',
		description:
			'A shorter threshold benchmark, and a race rehearsal for the 1500 m swim.',
		discipline: 'swim',
		intent: 'test',
		archetype: 'test',
		level: null,
		phases: ['base', 'peak'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: SWEETENHAM,
		blocks: [
			wu(800),
			block([swim({ durationSec: min(20), intensity: zone('Z5') })]),
			cd(300),
		],
	},
	{
		key: 'swim-A4',
		title: '7 × 200 incremental step test',
		description:
			"A pace, heart-rate and (where available) lactate curve, swum from easy to all-out to find the deflection. The protocol's rule is that **each 200 is about 4 s/100 faster than the last**, which the model cannot state — the steps below are the research's own zone approximation of that ramp, and two pairs of them are indistinguishable although the protocol requires them to differ.",
		discipline: 'swim',
		intent: 'test',
		archetype: 'test',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: PYNE_2001,
		blocks: [
			wu(400),
			block([
				swim({ distanceM: 200, intensity: zone('Z1') }),
				swim({ distanceM: 200, intensity: zone('Z2') }),
				swim({ distanceM: 200, intensity: zone('Z2') }),
				swim({ distanceM: 200, intensity: zone('Z3') }),
				swim({ distanceM: 200, intensity: zone('Z4') }),
				swim({ distanceM: 200, intensity: zone('Z4') }),
				swim({ distanceM: 200, intensity: zone('Z5') }),
			]),
			cd(300),
		],
	},

	// ——— B · Aerobic and endurance ————————————————————————————————————
	{
		key: 'swim-B1',
		title: 'Straight swim',
		description:
			'Continuous aerobic base and pacing discipline — the simplest session there is, and the aerobic-maintenance category of the classic energy-system taxonomy.',
		discipline: 'swim',
		intent: 'endurance',
		archetype: 'easy',
		level: null,
		phases: ['base', 'build', 'peak', 'taper'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(400),
			block([swim({ distanceM: 2000, intensity: zone('Z2') })]),
			cd(200),
		],
	},
	{
		key: 'swim-B2',
		title: 'Aerobic pyramid',
		description: `${CONVENTION_NOTICE} Aerobic volume with attention resets — a beginner's first structured set. The pyramid needs seven hand-authored steps because the model has no ladder primitive.`,
		discipline: 'swim',
		intent: 'endurance',
		archetype: 'easy',
		level: 'beginner',
		phases: ['base'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(400),
			block([
				swim({ distanceM: 100, intensity: zone('Z2') }),
				rest(20),
				swim({ distanceM: 200, intensity: zone('Z2') }),
				rest(20),
				swim({ distanceM: 300, intensity: zone('Z2') }),
				rest(20),
				swim({ distanceM: 400, intensity: zone('Z2') }),
				rest(20),
				swim({ distanceM: 300, intensity: zone('Z2') }),
				rest(20),
				swim({ distanceM: 200, intensity: zone('Z2') }),
				rest(20),
				swim({ distanceM: 100, intensity: zone('Z2') }),
			]),
			cd(200),
		],
	},
	{
		key: 'swim-B3',
		title: 'Long pull set',
		description:
			'Aerobic volume with upper-body emphasis and body-position feedback. **The equipment is the session and the model cannot hold it**: pull with a buoy and a band is both slower and harder than swimming, so pricing this at swim pace is wrong in both directions.',
		discipline: 'swim',
		intent: 'endurance',
		archetype: 'steady',
		level: 'intermediate',
		phases: ['base'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(400),
			block(
				[
					swim({
						distanceM: 600,
						intensity: zone('Z2'),
						notes: 'Pull, with buoy and band.',
					}),
					rest(30),
				],
				{ repeat: 3 },
			),
			cd(200),
		],
	},
	{
		key: 'swim-B4',
		title: 'The thirty hundreds',
		description: `${CONVENTION_NOTICE} The canonical aerobic-endurance monolith: it teaches pace repeatability, and the send-off is what enforces it — the set leaves on the clock, so falling off pace costs rest rather than time.`,
		discipline: 'swim',
		intent: 'endurance',
		archetype: 'steady',
		level: 'advanced',
		phases: ['base'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(400),
			block([swim({ distanceM: 100, intensity: zone('Z2') })], {
				repeat: 30,
				sendOff: onCss(12),
			}),
			cd(200),
		],
	},
	{
		key: 'swim-B5',
		title: 'Negative-split 800s',
		description: `${CONVENTION_NOTICE} Aerobic endurance plus pacing control under fatigue: the second 400 of each rep is faster than the first.`,
		discipline: 'swim',
		intent: 'endurance',
		archetype: 'steady',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(400),
			block(
				[
					swim({ distanceM: 400, intensity: zone('Z2') }),
					swim({ distanceM: 400, intensity: zone('Z3') }),
					rest(45),
				],
				{ repeat: 3 },
			),
			cd(200),
		],
	},

	// ——— C · Threshold / CSS ——————————————————————————————————————————
	{
		key: 'swim-C1',
		title: 'CSS hundreds',
		description:
			'The reference threshold set: hold CSS exactly, on a send-off ten seconds per hundred slower than it.',
		discipline: 'swim',
		intent: 'threshold',
		archetype: 'threshold',
		level: null,
		phases: ['base', 'build'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: SWIM_SMOOTH,
		progressesTo: 'swim-C2',
		blocks: [
			wu(600),
			block([swim({ distanceM: 100, intensity: zone('Z4') })], {
				repeat: 10,
				sendOff: onCss(10),
			}),
			cd(400),
		],
	},
	{
		key: 'swim-C2',
		title: 'Red Mist',
		description:
			"Sustained threshold volume — the squad's hardest aerobic session. Twice the reps of the reference set on half the allowance.",
		discipline: 'swim',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'advanced',
		phases: ['build'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: SWIM_SMOOTH,
		regressesTo: 'swim-C1',
		blocks: [
			wu(600),
			block([swim({ distanceM: 100, intensity: zone('Z4') })], {
				repeat: 20,
				sendOff: onCss(5),
			}),
			cd(400),
		],
	},
	{
		key: 'swim-C3',
		title: 'Threshold descending ladder',
		description: `${CONVENTION_NOTICE} Threshold with a within-set intensity gradient: each rep is shorter and faster than the last, which survives here only because the descent was hand-expanded into four differently-zoned steps.`,
		discipline: 'swim',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(600),
			block(
				[
					swim({ distanceM: 200, intensity: zone('Z3') }),
					rest(15),
					swim({ distanceM: 150, intensity: zone('Z4') }),
					rest(15),
					swim({ distanceM: 100, intensity: zone('Z4') }),
					rest(15),
					swim({ distanceM: 50, intensity: zone('Z5') }),
					rest(45),
				],
				{ repeat: 4 },
			),
			cd(400),
		],
	},
	{
		key: 'swim-C4',
		title: 'Broken 1000',
		description: `${CONVENTION_NOTICE} Threshold-plus, and a race rehearsal for the 1000 and the 1500: ten hundreds swum with micro-rests and **timed as one continuous thousand**. That last part is what the model cannot say — this row and the reference threshold set render identically even though one is a broken swim and the other is ten discrete efforts.`,
		discipline: 'swim',
		intent: 'threshold',
		archetype: 'race-simulation',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['1500m'],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(600),
			block([swim({ distanceM: 100, intensity: zone('Z4') }), rest(10)], {
				repeat: 10,
			}),
			cd(300),
		],
	},
	{
		key: 'swim-C5',
		title: 'Threshold pyramid',
		description: `${CONVENTION_NOTICE} Threshold volume in varied rep lengths, which resists pace-locking. The rest scales with the distance swum — five seconds per hundred.`,
		discipline: 'swim',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(600),
			block(
				[
					swim({ distanceM: 400, intensity: zone('Z4') }),
					rest(20),
					swim({ distanceM: 300, intensity: zone('Z4') }),
					rest(15),
					swim({ distanceM: 200, intensity: zone('Z4') }),
					rest(10),
					swim({ distanceM: 100, intensity: zone('Z4') }),
					rest(45),
				],
				{ repeat: 2 },
			),
			cd(400),
		],
	},
	{
		key: 'swim-C6',
		title: 'CSS sandwich',
		description:
			'Teaches the *difference* between just-under and just-over threshold, alternating CSS + 4 s and CSS − 2 s. Those offsets are the prescription and the model has no additive-offset target kind, so the alternation is authored as adjacent zones and the resolved ranges will be wider than the session asks for.',
		discipline: 'swim',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(600),
			block(
				[
					swim({
						distanceM: 200,
						intensity: zone('Z3'),
						notes: 'CSS + 4 s/100.',
					}),
					rest(20),
					swim({
						distanceM: 200,
						intensity: zone('Z5'),
						notes: 'CSS − 2 s/100.',
					}),
					rest(20),
				],
				{ repeat: 4 },
			),
			cd(400),
		],
	},

	// ——— D · VO₂ max ————————————————————————————————————————————————
	{
		key: 'swim-D1',
		title: 'Fifties at 400 pace',
		description:
			'High aerobic power on short recoveries — the classic overload-endurance set. "400 pace" is the anchor and the swim zone band cannot express it: the fastest band is unbounded, so this and an all-out 25 are the same authored target.',
		discipline: 'swim',
		intent: 'vo2max',
		archetype: 'vo2max-short',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(600),
			block([swim({ distanceM: 50, intensity: zone('Z5') }), rest(15)], {
				repeat: 16,
			}),
			block([swim({ distanceM: 400, intensity: zone('Z1') })]),
			cd(200),
		],
	},
	{
		key: 'swim-D2',
		title: 'VO₂ hundreds',
		description:
			"Time at or near VO2 max at goal 200 pace. **The rest is prescribed as 1:1 with the swim time** — a ratio, not a duration, and the model has no ratio rest — so the ninety seconds below is right only for a 1:30 swimmer and is the research's own approximation.",
		discipline: 'swim',
		intent: 'vo2max',
		archetype: 'vo2max-short',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(800),
			block(
				[
					swim({
						distanceM: 100,
						intensity: zone('Z5'),
						notes: 'Goal 200 pace.',
					}),
					restAs(
						{ kind: 'time', durationSec: 90 },
						'Prescribed as 1:1 with the swim time.',
					),
				],
				{ repeat: 10 },
			),
			cd(500),
		],
	},
	{
		key: 'swim-D3',
		title: 'Max-aerobic 75s',
		description: `${CONVENTION_NOTICE} VO2 max work at a distance that is hard to pace-cheat: too long to sprint, too short to settle.`,
		discipline: 'swim',
		intent: 'vo2max',
		archetype: 'vo2max-short',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(600),
			block([swim({ distanceM: 75, intensity: zone('Z5') }), rest(45)], {
				repeat: 8,
			}),
			cd(400),
		],
	},
	{
		key: 'swim-D4',
		title: 'Five two-hundreds',
		description:
			'Sustained VO2 work for distance swimmers — the classic broken thousand, swum hard at goal 400 pace.',
		discipline: 'swim',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(800),
			block(
				[
					swim({
						distanceM: 200,
						intensity: zone('Z5'),
						notes: 'Goal 400 pace.',
					}),
					rest(60),
				],
				{ repeat: 5 },
			),
			cd(400),
		],
	},

	// ——— E · Sprint, speed and lactate tolerance ————————————————————————
	{
		key: 'swim-E1',
		title: 'Alactic 25s',
		description:
			'Pure speed and neuromuscular work with no lactate accumulation — the recovery is long precisely so that it stays alactic. Note that the load model **under-prices** every session in this group: the sprint volume is tiny and swim load has no anaerobic term, so this will score below a steady aerobic swim.',
		discipline: 'swim',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: null,
		phases: ['build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(800),
			block([swim({ distanceM: 25, intensity: zone('Z5') })], {
				repeat: 12,
				sendOff: onCss(0),
			}),
			cd(600),
		],
	},
	{
		key: 'swim-E2',
		title: 'Lactate production 50s',
		description:
			'Drives peak blood lactate — anaerobic capacity, and once a week at most. All-out on a long cycle.',
		discipline: 'swim',
		intent: 'anaerobic',
		archetype: 'anaerobic',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(800),
			block([swim({ distanceM: 50, intensity: zone('Z5') }), rest(90)], {
				repeat: 6,
			}),
			cd(700),
		],
	},
	{
		key: 'swim-E3',
		title: 'Broken 100s',
		description:
			"Lactate tolerance at race speed — the 100 m specialist's session, swum as four all-out quarters with ten seconds between them.",
		discipline: 'swim',
		intent: 'anaerobic',
		archetype: 'anaerobic',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(800),
			block(
				[
					swim({ distanceM: 25, intensity: zone('Z5') }),
					rest(10),
					swim({ distanceM: 25, intensity: zone('Z5') }),
					rest(10),
					swim({ distanceM: 25, intensity: zone('Z5') }),
					rest(10),
					swim({ distanceM: 25, intensity: zone('Z5') }),
					rest(min(4)),
				],
				{ repeat: 4 },
			),
			cd(600),
		],
	},
	{
		key: 'swim-E4',
		title: 'Race-pace fifties',
		description:
			'Rehearses goal 100 or 200 pace at low fatigue — race-pace training as a category in its own right, rather than as a by-product of a hard set.',
		discipline: 'swim',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'intermediate',
		phases: ['peak', 'taper'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(700),
			block(
				[
					swim({
						distanceM: 50,
						intensity: zone('Z5'),
						notes: 'Goal 100 pace.',
					}),
					rest(20),
				],
				{ repeat: 20 },
			),
			cd(500),
		],
	},

	// ——— F · Technique and skills ————————————————————————————————————
	{
		key: 'swim-F1',
		title: 'Drill–swim contrast',
		description:
			"Transfers a drill's feel into whole-stroke swimming, alternating 25 drill and 25 swim across four drills. **The drills are the session and none of them is storable** — catch-up, single-arm, fingertip-drag and sculling all live in the notes, and the 25/25 alternation is lost with them.",
		discipline: 'swim',
		intent: 'technique',
		archetype: 'technique',
		level: null,
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: SWIM_SMOOTH,
		blocks: [
			wu(400),
			block(
				[
					swim({
						distanceM: 50,
						intensity: zone('Z1'),
						notes:
							'25 drill / 25 swim — catch-up, single-arm, fingertip-drag, sculling.',
					}),
					rest(15),
				],
				{ name: 'drill', repeat: 16 },
			),
			block(
				[
					swim({
						distanceM: 100,
						intensity: zone('Z2'),
						notes: 'Hold the feel from the drill.',
					}),
				],
				{ repeat: 8 },
			),
			cd(200),
		],
	},
	{
		key: 'swim-F2',
		title: 'Swim golf (SWOLF)',
		description: `${CONVENTION_NOTICE} Efficiency: minimise time plus strokes, and aim to hold the score while the split drops. **The stroke count is the entire point of the session and there is nowhere to put it**, so this row renders as twelve ordinary hundreds.`,
		discipline: 'swim',
		intent: 'technique',
		archetype: 'technique',
		level: null,
		phases: ['base'],
		goalEvents: [],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(400),
			block(
				[
					swim({
						distanceM: 100,
						intensity: zone('Z3'),
						notes: 'Count strokes and note the time; score = sum.',
					}),
					rest(20),
				],
				{ repeat: 12 },
			),
			cd(400),
		],
	},
	{
		key: 'swim-F3',
		title: 'Stroke-rate ladder',
		description:
			'Finds and extends the personal trade-off between stroke rate and distance per stroke, in four sets of three at baseline −4, −0, +4 and +8 strokes per minute. Those four targets are the only thing distinguishing the sub-sets and the model cannot hold them, so they are in the notes.',
		discipline: 'swim',
		intent: 'technique',
		archetype: 'technique',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: [],
		provenance: 'corpus',
		citation: CRAIG_PENDERGAST_1979,
		blocks: [
			wu(600),
			block(
				[
					swim({
						distanceM: 100,
						intensity: zone('Z4'),
						notes: 'Stroke rate: baseline −4, then −0, then +4, then +8 spm.',
					}),
					rest(20),
				],
				{ repeat: 3, series: 4 },
			),
			cd(400),
		],
	},
	{
		key: 'swim-F4',
		title: 'Kick and body position',
		description:
			'Kick propulsion, ankle mobility and horizontal position. The board, the streamline-on-back and the vertical kick are three different exercises the model records as one, and the snorkel on the swim set is likewise unstorable.',
		discipline: 'swim',
		intent: 'technique',
		archetype: 'technique',
		level: null,
		phases: ['base'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGLISCHO,
		blocks: [
			wu(400),
			block(
				[
					swim({
						distanceM: 50,
						intensity: rpe(6, 7),
						notes: 'Kick — alternate board, streamline on back, vertical.',
					}),
					rest(20),
				],
				{ name: 'kick', repeat: 20 },
			),
			block(
				[
					swim({
						distanceM: 50,
						intensity: zone('Z2'),
						notes: 'With snorkel.',
					}),
				],
				{ repeat: 12 },
			),
			cd(200),
		],
	},

	// ——— G · Open water ——————————————————————————————————————————————
	{
		key: 'swim-G1',
		title: 'Sighting set',
		description:
			'Sight without wrecking the stroke, and hold a line: twice per 25, eyes up and mouth in, with every fourth hundred swum heads-up. **The sighting is not storable**, so this row and the drafting set render identically.',
		discipline: 'swim',
		intent: 'technique',
		archetype: 'technique',
		level: null,
		phases: ['build', 'peak'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: SWIM_SMOOTH,
		blocks: [
			wu(600),
			block(
				[
					swim({
						distanceM: 100,
						intensity: zone('Z3'),
						notes: 'Sight twice per 25; every 4th hundred heads-up.',
					}),
					rest(20),
				],
				{ repeat: 12 },
			),
			cd(400),
		],
	},
	{
		key: 'swim-G2',
		title: 'Drafting set',
		description: `${CONVENTION_NOTICE} Sit on the feet and on the hip, and learn what the saving is worth. The drag reduction behind a lead swimmer is well established; this particular set is squad practice.`,
		discipline: 'swim',
		intent: 'technique',
		archetype: 'technique',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['1500m'],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(600),
			block(
				[
					swim({
						distanceM: 100,
						intensity: zone('Z3'),
						notes:
							'In pairs, rotating: 4 on the feet, 4 on the hip, 4 leading.',
					}),
					rest(20),
				],
				{ repeat: 12 },
			),
			cd(400),
		],
	},
	{
		key: 'swim-G3',
		title: 'Beach starts and exits',
		description: `${CONVENTION_NOTICE} Dolphin dives, run-in and run-out, and tight buoy turns. The 20 m run is a real step — a per-step discipline override is exactly what a brick needs — but the dive and the turn have no representation at all.`,
		discipline: 'swim',
		intent: 'technique',
		archetype: 'technique',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: ['1500m'],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(600),
			block(
				[
					swim({
						distanceM: 60,
						intensity: zone('Z5'),
						notes: 'Dolphin-dive entry, then hard to the buoy.',
					}),
					swim({
						distanceM: 60,
						intensity: zone('Z3'),
						notes: 'Tight turn around the buoy.',
					}),
					run({ distanceM: 20, intensity: rpe(7), notes: 'Exit and run.' }),
					rest(90),
				],
				{ repeat: 10 },
			),
			cd(600),
		],
	},
	{
		key: 'swim-G4',
		title: 'Pack swim',
		description: `${CONVENTION_NOTICE} Contact tolerance, bilateral breathing in wash, and staying calm — swum three abreast in one lane with deliberate contact, rotating positions.`,
		discipline: 'swim',
		intent: 'endurance',
		archetype: 'technique',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: ['1500m'],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(600),
			block(
				[
					swim({
						distanceM: 250,
						intensity: zone('Z3'),
						notes: 'Three abreast, rotating positions, deliberate contact.',
					}),
					rest(45),
				],
				{ repeat: 6 },
			),
			cd(400),
		],
	},
	{
		key: 'swim-G5',
		title: 'Open-water continuous',
		description:
			'Race-specific continuous aerobic swimming with no walls, sighting every eight to ten strokes, in a wetsuit if the race is wetsuit-legal. **The row cannot record that it is open water in a wetsuit**, so its pace will be compared against a pool-derived CSS that does not apply to it.',
		discipline: 'swim',
		intent: 'endurance',
		archetype: 'long',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: SWIM_SMOOTH,
		blocks: [
			wu(400),
			block([
				swim({
					distanceM: 3000,
					intensity: zone('Z2'),
					notes: 'Open water; sight every 8–10 strokes; wetsuit if legal.',
				}),
			]),
			cd(200),
		],
	},

	// ——— H · Triathlon-specific ————————————————————————————————————————
	{
		key: 'swim-H1',
		title: 'Race-start surge',
		description:
			'Survive the first two hundred metres and settle into race pace: a hundred at 100-pace straight into two hundred at race pace, with no rest between them.',
		discipline: 'swim',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: FRIEL_TRIATHLETE,
		blocks: [
			wu(700),
			block(
				[
					swim({
						distanceM: 100,
						intensity: zone('Z5'),
						notes: 'Goal 100 pace.',
					}),
					swim({
						distanceM: 200,
						intensity: zone('Z3'),
						notes: 'Race pace, no rest.',
					}),
					rest(60),
				],
				{ repeat: 6 },
			),
			cd(400),
		],
	},
	{
		key: 'swim-H2',
		title: 'Broken race simulation',
		description: `${CONVENTION_NOTICE} Rehearses the whole 1500 at race intensity as three descending 500s. "Descending" is the instruction and the model cannot state it, so the three reps read identically.`,
		discipline: 'swim',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: ['1500m'],
		provenance: 'convention',
		citation: null,
		blocks: [
			wu(700),
			block(
				[
					swim({
						distanceM: 500,
						intensity: zone('Z4'),
						notes: 'Descend each rep.',
					}),
					rest(20),
				],
				{ repeat: 3 },
			),
			cd(400),
		],
	},
	{
		key: 'swim-H3',
		title: 'Swim-exit brick',
		description:
			'Practises the swim-to-transition change with an elevated heart rate — out of the pool, run, and back in with no rest. This is the session the step model handles best: a per-step discipline makes the swim-to-run brick natural.',
		discipline: 'swim',
		intent: 'endurance',
		archetype: 'brick',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: FRIEL_TRIATHLETE,
		blocks: [
			wu(400),
			block(
				[
					swim({ distanceM: 300, intensity: zone('Z3') }),
					run({
						distanceM: 400,
						intensity: zone('easy'),
						notes: 'Straight out of the water.',
					}),
				],
				{ repeat: 4 },
			),
			cd(200),
		],
	},
	{
		key: 'swim-H4',
		title: 'Taper sharpener',
		description:
			'Keeps speed while shedding fatigue: low volume with race-pace touches. Taper principle — cut the volume, keep the intensity. The two sub-sets are at goal 200 and goal 100 pace and read identically here, because the fastest swim band is unbounded.',
		discipline: 'swim',
		intent: 'race',
		archetype: 'race-simulation',
		level: null,
		phases: ['taper', 'race-week'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: MUJIKA_PADILLA_2003,
		blocks: [
			wu(600),
			block(
				[
					swim({
						distanceM: 50,
						intensity: zone('Z5'),
						notes: 'Goal 200 pace.',
					}),
					rest(45),
				],
				{ repeat: 6 },
			),
			block(
				[
					swim({
						distanceM: 50,
						intensity: zone('Z5'),
						notes: 'Goal 100 pace.',
					}),
					rest(60),
				],
				{ repeat: 4 },
			),
			cd(400),
		],
	},
]
