/**
 * The running corpus — `docs/research/workouts-running.md`, archetypes A–H
 * transcribed row for row (46 sessions), plus archetype **I**, which is written
 * rather than retrieved.
 *
 * ## The hole, said out loud
 *
 * `docs/research/README.md` advertises *"46 sessions across 9 archetypes"*. The
 * document's tables cover **eight** (A–H, 46 rows). The ninth — tune-up and
 * race-week primers — exists only in §12's programming matrix, which schedules
 * `I1` in the taper and `I2–I3` in race week, and as `tuneUp` in §13.2's field
 * table. **There is nothing to retrieve.**
 *
 * A Catalogue that shipped A–H and called itself complete would leave a hole in
 * exactly the week before the Target Event — the week a plan can least afford
 * one, and the week an athlete is most likely to look. So the three archetype-I
 * rows below are **hand-written**: `provenance: 'hand-written'`,
 * `citation: null`, and every description opens with
 * {@link HAND_WRITTEN_NOTICE}. They are the only rows in the whole corpus with
 * no source, and the schema lets a **Stock Workout** carry no Citation
 * precisely so that this can be stated rather than faked.
 *
 * ## What the transcription cost
 *
 * Three losses, each written into the affected row's description too:
 *
 * - **`% vVO2max` has no anchor kind.** D3 (Billat 30/30) is prescribed at
 *   100 % / 50 % of velocity at VO2max, and F5 at 95 % of maximal speed.
 *   Neither is expressible, and substituting a different anchor family would
 *   breach `workout-taxonomy.md` §13's rule about named protocols. D3's work
 *   bout therefore carries **no intensity target at all** — an Unavailable
 *   Metric — rather than a borrowed one.
 * - **`gradePct` is a scalar and every hill row states a band.** F4 is "a 6–10 %
 *   hill", G1 "4–7 %", G5 "a controlled 3–6 % descent". A single number would
 *   be a midpoint nobody prescribed, so the grade lives in the step's notes and
 *   the column stays null. Cadence got a min/max pair; grade did not.
 * - **A two-a-day is not a container the model has.** A4 and E5 are one
 *   *session pair*, AM and PM. They seed as one Workout with blocks named `AM`
 *   and `PM`, and their descriptions say to schedule them as two sessions.
 */
import {
	block,
	hours,
	hrPct,
	km,
	lactate,
	min,
	pacePct,
	racePace,
	rest,
	restAs,
	rpe,
	run,
	zone,
	type CorpusSession,
} from './catalogue-corpus.ts'
import {
	BAKKEN,
	BILLAT_2000,
	CANOVA,
	CANOVA_RECONSTRUCTION,
	DANIELS,
	GIOVANELLI_2016,
	HANSONS,
	HAUGEN_2021,
	HUDSON,
	LYDIARD,
	MAGNESS,
	PFITZINGER,
	SEILER_2013,
	TONNESSEN_2024,
	VERNILLO_2017,
	HELGERUD_2007,
} from './catalogue-corpus.citations.ts'
import { HAND_WRITTEN_NOTICE } from './catalogue-corpus.ts'

/** `2 km warm-up`, as its own named block — the frame every quality row shares. */
const warmUpKm = (k: number) =>
	block([run({ distanceM: km(k), intensity: zone('easy') })], {
		name: 'warm-up',
	})
const warmUpMin = (m: number) =>
	block([run({ durationSec: min(m), intensity: zone('easy') })], {
		name: 'warm-up',
	})
const coolDownKm = (k: number) =>
	block([run({ distanceM: km(k), intensity: zone('easy') })], {
		name: 'cool-down',
	})
const coolDownMin = (m: number) =>
	block([run({ durationSec: min(m), intensity: zone('easy') })], {
		name: 'cool-down',
	})

/** Recovery that is an act rather than a clock: "jog back down the hill". */
const jogBack = restAs({ kind: 'act', act: 'jogBack' })

export const RUN_CORPUS: CorpusSession[] = [
	// ——— A · Easy & recovery (rolig / restitusjon) ———————————————————————
	{
		key: 'run-A1',
		title: 'Recovery run (restitusjonsjogg)',
		description:
			'Circulation, with no adaptive stimulus intended — the slow edge of easy, RPE 2–3 and under 70 % HRmax. Never progressed: progress the day around it. Bakken calls the Norwegian version "under 1.0 mmol".',
		discipline: 'run',
		intent: 'recovery',
		archetype: 'recovery',
		level: null,
		phases: ['base', 'build', 'peak', 'taper', 'race-week'],
		goalEvents: [],
		provenance: 'corpus',
		citation: DANIELS,
		blocks: [block([run({ durationSec: min(30), intensity: zone('easy') })])],
	},
	{
		key: 'run-A2',
		title: 'Easy run (rolig tur)',
		description:
			'The 75–85 % of weekly volume that is not the workout: mitochondrial and capillary density, fat oxidation, tendon load tolerance. Conversational — RPE 3–4, 65–79 % HRmax. Casado et al. found the volume of easy running among the best predictors of world-class distance performance, so this is not filler.',
		discipline: 'run',
		intent: 'endurance',
		archetype: 'easy',
		level: null,
		phases: ['base', 'build', 'peak', 'taper', 'race-week'],
		goalEvents: [],
		provenance: 'corpus',
		citation: DANIELS,
		progressesTo: 'run-A3',
		blocks: [block([run({ durationSec: min(60), intensity: zone('easy') })])],
	},
	{
		key: 'run-A3',
		title: 'Easy run with strides (rolig med stigningsløp)',
		description:
			'Aerobic volume with a neuromuscular touch, keeping repetition mechanics alive through base. Strides are timed rather than measured — a 100 m stride is a time trial for a slow runner and a jog for a fast one — and run at about mile effort, smooth and relaxed, never maximal.',
		discipline: 'run',
		intent: 'endurance',
		archetype: 'easy',
		level: null,
		phases: ['base', 'build', 'taper'],
		goalEvents: [],
		provenance: 'corpus',
		citation: DANIELS,
		blocks: [
			block([run({ durationSec: min(50), intensity: zone('easy') })]),
			block(
				[
					run({ durationSec: 20, intensity: racePace('1500m') }),
					rest(60),
				],
				{ name: 'strides', repeat: 6 },
			),
		],
	},
	{
		key: 'run-A4',
		title: 'Double easy day (dobbeltøkt rolig)',
		description:
			'Volume without a single long stress, and the precondition for double-threshold days. This is a session *pair*, not one run: trainm8 has no two-a-day container, so the AM and PM halves are named blocks here and should be scheduled as two sessions several hours apart. Inappropriate below ~80 km/week.',
		discipline: 'run',
		intent: 'endurance',
		archetype: 'easy',
		level: 'advanced',
		phases: ['base', 'build'],
		goalEvents: ['marathon'],
		provenance: 'corpus',
		citation: BAKKEN,
		progressesTo: 'run-C3',
		regressesTo: 'run-A2',
		blocks: [
			block([run({ durationSec: min(50), intensity: zone('easy') })], {
				name: 'AM',
			}),
			block([run({ durationSec: min(35), intensity: zone('easy') })], {
				name: 'PM',
			}),
		],
	},
	{
		key: 'run-A5',
		title: 'Capped aerobic base run (langkjøring med tak)',
		description:
			"Lydiard's aerobic ceiling — steady, and strictly sub-threshold. The cap is the method: extend to 100 minutes before raising the intensity.",
		discipline: 'run',
		intent: 'endurance',
		archetype: 'steady',
		level: null,
		phases: ['base'],
		goalEvents: [],
		provenance: 'corpus',
		citation: LYDIARD,
		blocks: [
			block([
				run({
					durationSec: min(70),
					intensity: hrPct('max', 80, 88),
					notes: 'Hard cap at LTHR − 10 bpm.',
				}),
			]),
		],
	},

	// ——— B · Long run (langtur) ————————————————————————————————————————
	{
		key: 'run-B1',
		title: 'Classic long run (langtur)',
		description:
			'Glycogen storage, capillarisation, musculoskeletal durability and mental duration. Cap it at 25–30 % of weekly volume — a coaching convention repeated across Daniels, Pfitzinger and Hansons with no controlled trial behind it, so treat the cap as heuristic.',
		discipline: 'run',
		intent: 'endurance',
		archetype: 'long',
		level: null,
		phases: ['base', 'build'],
		goalEvents: ['hm', 'marathon', 'trail', 'ultra'],
		provenance: 'corpus',
		citation: LYDIARD,
		progressesTo: 'run-B2',
		blocks: [block([run({ durationSec: hours(2), intensity: zone('easy') })])],
	},
	{
		key: 'run-B2',
		title: 'Progression long run (progressiv langtur)',
		description:
			'Three equal thirds — easy, the top of easy, then marathon pace — which teaches pacing and the fat-to-carbohydrate transition and adds quality without a second hard day.',
		discipline: 'run',
		intent: 'endurance',
		archetype: 'long',
		level: null,
		phases: ['base', 'build'],
		goalEvents: ['hm', 'marathon'],
		provenance: 'corpus',
		citation: HUDSON,
		blocks: [
			block([run({ durationSec: min(40), intensity: zone('easy') })]),
			block([run({ durationSec: min(40), intensity: hrPct('lthr', 85, 92) })]),
			block([run({ durationSec: min(30), intensity: racePace('marathon') })]),
		],
	},
	{
		key: 'run-B3',
		title: 'Long run with marathon finish (langtur med marsjfart)',
		description:
			'Race-specific fatigue resistance for the half and the marathon: easy for the first two thirds, then 20–40 minutes at goal marathon pace before an easy release.',
		discipline: 'run',
		intent: 'endurance',
		archetype: 'long',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['hm', 'marathon'],
		provenance: 'corpus',
		citation: PFITZINGER,
		blocks: [
			block([run({ durationSec: min(70), intensity: zone('easy') })]),
			block([run({ durationSec: min(30), intensity: racePace('marathon') })]),
			block([run({ durationSec: min(10), intensity: zone('easy') })]),
		],
	},
	{
		key: 'run-B4',
		title: 'Canova specific long run',
		description:
			"Canova's extension principle — the long run *is* the race-specific session. Progress by raising 95 % towards 100 % and shortening the floats, and raise the percentage last. Band edges (95 % vs 96 %) are approximate: the primary text is out of print and the percentages lean on a modern reconstruction.",
		discipline: 'run',
		intent: 'race',
		archetype: 'long',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: ['marathon'],
		provenance: 'corpus',
		citation: CANOVA,
		blocks: [
			block([run({ distanceM: km(4), intensity: zone('easy') })], {
				name: 'warm-up',
			}),
			block(
				[
					run({ distanceM: km(4), intensity: racePace('marathon', 95) }),
					run({ distanceM: km(2), intensity: racePace('marathon', 90) }),
				],
				{ repeat: 5 },
			),
			block([run({ distanceM: km(3), intensity: zone('easy') })], {
				name: 'cool-down',
			}),
		],
	},
	{
		key: 'run-B5',
		title: 'Capped long run (Hansons)',
		description:
			'Cumulative fatigue across a fatigued week rather than one heroic effort. The cap is the method — it does not progress; add load elsewhere in the week.',
		discipline: 'run',
		intent: 'endurance',
		archetype: 'long',
		level: null,
		phases: ['build', 'peak'],
		goalEvents: ['marathon'],
		provenance: 'corpus',
		citation: HANSONS,
		blocks: [
			block([run({ durationSec: min(135), intensity: zone('easy') })]),
		],
	},
	{
		key: 'run-B6',
		title: 'Medium-long run (mellomlang tur)',
		description:
			"A second aerobic pillar mid-week and the marathoner's under-rated session. Pfitzinger's signature progression is two of these per week; the quality variant embeds 15–20 minutes at marathon pace in the middle.",
		discipline: 'run',
		intent: 'endurance',
		archetype: 'long',
		level: null,
		phases: ['base', 'build'],
		goalEvents: ['hm', 'marathon'],
		provenance: 'corpus',
		citation: PFITZINGER,
		blocks: [block([run({ durationSec: min(80), intensity: zone('easy') })])],
	},

	// ——— C · Threshold & tempo (terskel) ————————————————————————————————
	{
		key: 'run-C1',
		title: 'Continuous tempo (terskelløp)',
		description:
			'The classic "comfortably hard" — about one-hour race pace, 88–92 % HRmax, RPE 6–7 — run to raise lactate-threshold velocity. Progress 25 → 30 → 40 minutes, then move to cruise intervals for more total time at threshold.',
		discipline: 'run',
		intent: 'threshold',
		archetype: 'threshold',
		level: null,
		phases: ['base', 'build'],
		goalEvents: ['5k', '10k', 'hm', 'marathon'],
		provenance: 'corpus',
		citation: DANIELS,
		progressesTo: 'run-C2',
		blocks: [
			warmUpKm(2),
			block([run({ durationSec: min(25), intensity: zone('threshold') })]),
			coolDownKm(2),
		],
	},
	{
		key: 'run-C2',
		title: 'Cruise intervals (terskeldrag)',
		description:
			'The same lactate-threshold stimulus as a continuous tempo with more total time at threshold and less psychological cost. The float is deliberately short — a minute of easy running, not a recovery.',
		discipline: 'run',
		intent: 'threshold',
		archetype: 'threshold',
		level: null,
		phases: ['base', 'build', 'peak', 'taper'],
		goalEvents: ['5k', '10k', 'hm', 'marathon'],
		provenance: 'corpus',
		citation: DANIELS,
		blocks: [
			warmUpKm(2),
			block(
				[
					run({ durationSec: min(6), intensity: zone('threshold') }),
					rest(60),
				],
				{ repeat: 5 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-C3',
		title: 'Double threshold, morning (dobbel terskel, morgen)',
		description:
			'The Norwegian model is a *sub*-threshold model: Bakken prescribes measured blood lactate of 2.3–2.8 mmol/L for the morning dose — below the 4 mmol convention — as intervals rather than continuous running. The lactate is the authored anchor and the pace is a derived facet, which is the right way round: lactate sets the pace, not the other way about. It resolves to a pace only for an athlete on a recipe that publishes lactate; on the default runner recipe it reads as its bare anchor, which is correct rather than broken. Presupposes the double-easy volume base and is inappropriate below ~80 km/week.',
		discipline: 'run',
		intent: 'threshold',
		archetype: 'sub-threshold',
		level: 'advanced',
		phases: ['base', 'build'],
		goalEvents: ['5k', '10k', 'hm'],
		provenance: 'corpus',
		citation: BAKKEN,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({ durationSec: min(6), intensity: lactate(2.3, 2.8) }),
					rest(60),
				],
				{ repeat: 5 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-C4',
		title: 'Double threshold, evening (dobbel terskel, kveld)',
		description:
			'The second dose of the same day, at slightly higher measured lactate (2.8–3.0 mmol/L) over shorter reps. Bakken documents three interchangeable formats — 10–12 × 1000 m, 25 × 400 m, or 20 × (45 s on / 15 s off); this is the first. Seeding it as a bare Threshold zone label would be the overclaim the honesty rule exists to stop, so the anchor is the lactate the source actually prescribes.',
		discipline: 'run',
		intent: 'threshold',
		archetype: 'sub-threshold',
		level: 'advanced',
		phases: ['base', 'build'],
		goalEvents: ['5k', '10k', 'hm'],
		provenance: 'corpus',
		citation: TONNESSEN_2024,
		blocks: [
			warmUpKm(2),
			block(
				[
					run({ distanceM: 1000, intensity: lactate(2.8, 3.0) }),
					rest(60),
				],
				{ repeat: 10 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-C5',
		title: 'Threshold run with full frame (Pfitzinger)',
		description:
			'Marathon-oriented lactate-threshold development inside a substantial aerobic frame — 15k-to-half-marathon effort held for 20–40 minutes between 3 km of easy running either side.',
		discipline: 'run',
		intent: 'threshold',
		archetype: 'threshold',
		level: null,
		phases: ['build'],
		goalEvents: ['hm', 'marathon'],
		provenance: 'corpus',
		citation: PFITZINGER,
		blocks: [
			warmUpKm(3),
			block([run({ durationSec: min(30), intensity: zone('threshold') })]),
			coolDownKm(3),
		],
	},
	{
		key: 'run-C6',
		title: 'Hansons tempo (marsjfart)',
		description:
			'Goal marathon pace rehearsed on tired legs inside a fatigued week — explicitly *not* a lactate session, which is why it is anchored on race pace rather than on threshold. Progress 6 → 8 → 10 → 16 km.',
		discipline: 'run',
		intent: 'tempo',
		archetype: 'tempo',
		level: null,
		phases: ['build', 'peak'],
		goalEvents: ['marathon'],
		provenance: 'corpus',
		citation: HANSONS,
		blocks: [
			warmUpKm(3),
			block([run({ distanceM: km(10), intensity: racePace('marathon', 100) })]),
			coolDownKm(2),
		],
	},
	{
		key: 'run-C7',
		title: 'Floating threshold (flytende terskel)',
		description:
			'Sustained sub-threshold time via micro-floats, holding lactate 0.4–0.8 mmol under the athlete\'s own threshold. Anchored on % of threshold pace rather than on an absolute lactate, because "0.4–0.8 under" is a relation and not a number — stating an mmol figure here would invent one.',
		discipline: 'run',
		intent: 'threshold',
		archetype: 'sub-threshold',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: ['10k', 'hm'],
		provenance: 'corpus',
		citation: BAKKEN,
		blocks: [
			warmUpKm(2),
			block(
				[
					run({ durationSec: min(8), intensity: pacePct(96) }),
					run({ durationSec: min(2), intensity: pacePct(88) }),
				],
				{ repeat: 3 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-C8',
		title: 'Threshold ladder (stigende terskel)',
		description:
			'A progressive lactate rise from about 2.0 to 3.0 mmol/L — a controlled way to find the ceiling. Each rung is 6 minutes; the percentages are of threshold *speed*, so 94 % is slower than threshold and 102 % faster.',
		discipline: 'run',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['5k', '10k', 'hm'],
		provenance: 'corpus',
		citation: BAKKEN,
		blocks: [
			warmUpKm(3),
			block([
				run({ durationSec: min(6), intensity: pacePct(94) }),
				rest(60),
				run({ durationSec: min(6), intensity: pacePct(97) }),
				rest(60),
				run({ durationSec: min(6), intensity: pacePct(100) }),
				rest(60),
				run({ durationSec: min(6), intensity: pacePct(102) }),
			]),
			coolDownKm(2),
		],
	},

	// ——— D · VO2max intervals (intervall / harde drag) ————————————————————
	{
		key: 'run-D1',
		title: 'Helgerud 4 × 4 (fire ganger fire)',
		description:
			'The reference HIIT protocol, and HR-anchored on purpose: Helgerud prescribed 90–95 % HRmax, not a pace. Re-expressing it as a pace zone would break the citation. HR lag means the first rep reads low — the protocol accepts that. Progress by adding a rep or shortening the recovery; never raise the intensity, because the ceiling *is* the protocol.',
		discipline: 'run',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: null,
		phases: ['build', 'peak'],
		goalEvents: ['3k', '5k', '10k'],
		provenance: 'corpus',
		citation: HELGERUD_2007,
		blocks: [
			warmUpMin(10),
			block(
				[
					run({ durationSec: min(4), intensity: hrPct('max', 90, 95) }),
					run({ durationSec: min(3), intensity: hrPct('max', 70) }),
				],
				{ repeat: 4 },
			),
			coolDownMin(10),
		],
	},
	{
		key: 'run-D2',
		title: 'Seiler 4 × 8 (fire ganger åtte)',
		description:
			"The dose-and-intensity sweet spot: 4 × 8 out-gained both 4 × 4 and 4 × 16. The finding is about duration, not intensity — Seiler's groups ran at *self-selected maximal sustainable* effort, so a fixed percentage of anything misses the mechanism. The anchor is therefore RPE 8: the hardest even effort holdable for all four reps, which is roughly 10k effort and about 95–100 % of threshold pace.",
		discipline: 'run',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: ['5k', '10k', 'hm'],
		provenance: 'corpus',
		citation: SEILER_2013,
		blocks: [
			warmUpMin(15),
			block(
				[
					run({ durationSec: min(8), intensity: rpe(8) }),
					rest(min(2)),
				],
				{ repeat: 4 },
			),
			coolDownMin(10),
		],
	},
	{
		key: 'run-D3',
		title: 'Billat 30/30 (tretti-tretti)',
		description:
			"Maximal time *at* VO2max for minimal lactate cost, and an excellent first VO2max session. Billat's anchor is velocity at VO2max — 100 % vVO2max on, 50 % off — and trainm8 has no vVO2max anchor kind, so the work bout here states its structure and leaves its intensity **unavailable** rather than borrowing a different anchor family. A protocol carries its own anchor or it is not that protocol; the recovery is an honest easy jog.",
		discipline: 'run',
		intent: 'vo2max',
		archetype: 'vo2max-short',
		level: null,
		phases: ['build'],
		goalEvents: ['3k', '5k', '10k'],
		provenance: 'corpus',
		citation: BILLAT_2000,
		blocks: [
			warmUpMin(15),
			block(
				[
					run({
						durationSec: 30,
						notes: '100 % vVO2max — no anchor kind expresses this.',
					}),
					run({ durationSec: 30, intensity: zone('easy') }),
				],
				{ repeat: 16 },
			),
			coolDownMin(10),
		],
	},
	{
		key: 'run-D4',
		title: 'Daniels interval reps (1000 m)',
		description:
			"Classic VO2max development at Daniels' `I` — about 3–5 k race pace, stated here as 5 k pace because that is the race an athlete is likeliest to have on record. Cap interval work at 8 % of weekly volume or 10 % of the session.",
		discipline: 'run',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: null,
		phases: ['build', 'peak'],
		goalEvents: ['3k', '5k', '10k'],
		provenance: 'corpus',
		citation: DANIELS,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({ distanceM: 1000, intensity: racePace('5k') }),
					rest(min(3)),
				],
				{ repeat: 5 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-D5',
		title: 'Six times three minutes (treminuttere)',
		description:
			'Shorter reps for athletes who over-pace four-minute reps, and hill-friendly. Anchored on 92–95 % HRmax, which is what the session models state and what survives being run uphill.',
		discipline: 'run',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: null,
		phases: ['build'],
		goalEvents: ['3k', '5k', '10k'],
		provenance: 'corpus',
		citation: TONNESSEN_2024,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({ durationSec: min(3), intensity: hrPct('max', 92, 95) }),
					rest(min(2)),
				],
				{ repeat: 6 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-D6',
		title: 'Broken 5k ladder (pyramidedrag)',
		description:
			'Pace-change tolerance plus VO2max with a race-simulation flavour: 1-2-3-2-1 minutes with equal jog recovery, twice through. The two passes are an outer series rather than a longer block, so the arithmetic prices ten reps and not five.',
		discipline: 'run',
		intent: 'vo2max',
		archetype: 'vo2max-short',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: ['3k', '5k'],
		provenance: 'corpus',
		citation: HUDSON,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({ durationSec: min(1), intensity: racePace('5k') }),
					rest(min(1)),
					run({ durationSec: min(2), intensity: racePace('5k') }),
					rest(min(2)),
					run({ durationSec: min(3), intensity: racePace('5k') }),
					rest(min(3)),
					run({ durationSec: min(2), intensity: racePace('5k') }),
					rest(min(2)),
					run({ durationSec: min(1), intensity: racePace('5k') }),
					rest(min(1)),
				],
				{ series: 2 },
			),
			coolDownKm(2),
		],
	},

	// ——— E · Race-specific, the Canova percentage system ————————————————
	{
		key: 'run-E1',
		title: '5k special endurance',
		description:
			'Support race pace from below: 95 % of 5 k pace extends the duration an athlete can hold near race speed. Progress 95 → 98 → 100 % and shrink the jog. Resolves against a stored 5 k **Performance Result**; with none on record it reads as its bare portable form rather than as a fabricated pace.',
		discipline: 'run',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: ['5k'],
		provenance: 'corpus',
		citation: CANOVA,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({ distanceM: km(2), intensity: racePace('5k', 95) }),
					rest(min(3)),
				],
				{ repeat: 4 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-E2',
		title: '10k specific',
		description:
			'Exact race pace rehearsed at fractional race volume. Canova progresses this by *shrinking the recovery* rather than by raising the pace.',
		discipline: 'run',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: ['10k'],
		provenance: 'corpus',
		citation: CANOVA,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({ distanceM: km(2), intensity: racePace('10k', 100) }),
					rest(min(3)),
				],
				{ repeat: 5 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-E3',
		title: 'Half-marathon specific',
		description:
			'Long specific volume near race pace — three 5 km reps at 100–102 % of half-marathon pace, merging towards 15 km continuous at 98–100 % as the block progresses.',
		discipline: 'run',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'intermediate',
		phases: ['peak'],
		goalEvents: ['hm'],
		provenance: 'corpus',
		citation: CANOVA,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({ distanceM: km(5), intensity: racePace('hm', 100, 102) }),
					rest(min(3)),
				],
				{ repeat: 3 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-E4',
		title: 'Marathon alternations (cambio ritmo)',
		description:
			'The signature Canova session: race-pace stress with 90 % floats instead of rest, run unbroken. Note the asymmetry that makes this archetype the argument for a race-pace anchor — for a marathoner 105 % of marathon pace is *faster* than race pace and 90 % is a float, not a recovery. The hard progression is raising the floats, not the reps.',
		discipline: 'run',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: ['marathon'],
		provenance: 'corpus',
		citation: CANOVA_RECONSTRUCTION,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({ distanceM: km(1), intensity: racePace('marathon', 105) }),
					run({ distanceM: km(1), intensity: racePace('marathon', 90) }),
				],
				{ repeat: 10 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-E5',
		title: 'Canova special block',
		description:
			'Two specific sessions in one day on partially depleted glycogen, five to seven hours apart. This is a session *pair* — trainm8 has no two-a-day container, so the halves are named blocks and should be scheduled as two sessions. Elite and advanced only.',
		discipline: 'run',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: ['marathon'],
		provenance: 'corpus',
		citation: CANOVA,
		blocks: [
			block(
				[
					run({ distanceM: km(2), intensity: zone('easy') }),
					run({ distanceM: km(8), intensity: racePace('marathon', 95, 100) }),
					run({ distanceM: km(2), intensity: zone('easy') }),
				],
				{ name: 'AM' },
			),
			block([run({ distanceM: km(3), intensity: zone('easy') })], {
				name: 'PM warm-up',
			}),
			block(
				[
					run({ distanceM: km(1), intensity: racePace('marathon', 102, 105) }),
					rest(min(2)),
				],
				{ name: 'PM', repeat: 10 },
			),
			block([run({ distanceM: km(2), intensity: zone('easy') })], {
				name: 'PM cool-down',
			}),
		],
	},
	{
		key: 'run-E6',
		title: 'Extension long run at 90–95 % marathon pace',
		description:
			"Canova's extension principle in its plainest form: hold near-race speed for progressively longer, 18 → 25 → 30 km. Extend the distance first and raise the percentage last.",
		discipline: 'run',
		intent: 'race',
		archetype: 'race-simulation',
		level: 'advanced',
		phases: ['peak'],
		goalEvents: ['marathon'],
		provenance: 'corpus',
		citation: CANOVA,
		blocks: [
			block([run({ distanceM: km(25), intensity: racePace('marathon', 92) })]),
		],
	},

	// ——— F · Speed, repetition & neuromuscular ————————————————————————
	{
		key: 'run-F1',
		title: 'Strides (stigningsløp)',
		description:
			'Fast-fibre recruitment, economy and mechanics at near-zero metabolic cost — timed rather than measured, at about mile effort, with full recovery. A stride that leaves you breathing hard was a rep. Do not price these into the session load beyond a few points and do not count them as a quality session; they are one of the very few things that go *up* during a taper.',
		discipline: 'run',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: null,
		phases: ['base', 'build', 'peak', 'taper', 'race-week'],
		goalEvents: [],
		provenance: 'corpus',
		citation: DANIELS,
		blocks: [
			block([run({ durationSec: min(50), intensity: zone('easy') })]),
			block([run({ durationSec: 20, intensity: racePace('1500m') }), rest(60)], {
				name: 'strides',
				repeat: 8,
			}),
		],
	},
	{
		key: 'run-F2',
		title: 'Repetition reps, 200 m',
		description:
			'Speed and running economy without the VO2max cost. The recovery is a full 200 m jog and it matters — shortening it turns the session into an interval workout. Cap repetition work at 5 % of weekly volume.',
		discipline: 'run',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: null,
		phases: ['base', 'taper'],
		goalEvents: ['1500m', '3k', '5k'],
		provenance: 'corpus',
		citation: DANIELS,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({ distanceM: 200, intensity: racePace('1500m') }),
					restAs({ kind: 'distance', distanceM: 200 }, 'Jog, full recovery.'),
				],
				{ repeat: 10 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-F3',
		title: 'Repetition reps, 400 m',
		description:
			'The same speed and economy work with more speed-endurance. Three minutes standing or a 400 m jog between reps — full recovery either way.',
		discipline: 'run',
		intent: 'anaerobic',
		archetype: 'anaerobic',
		level: 'intermediate',
		phases: ['base', 'peak'],
		goalEvents: ['1500m', '3k', '5k'],
		provenance: 'corpus',
		citation: DANIELS,
		blocks: [
			warmUpKm(3),
			block(
				[run({ distanceM: 400, intensity: racePace('1500m') }), rest(min(3))],
				{ repeat: 6 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-F4',
		title: 'Hill sprints (bakkesprint)',
		description:
			'A maximal-force, low-impact strength stimulus that is also injury-prophylactic. Run up a 6–10 % hill — the grade is a band, and a step carries one grade number, so it is stated here rather than stored. Walk down and take a full two minutes; introduce in base and maintain year-round.',
		discipline: 'run',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: null,
		phases: ['base', 'build', 'peak'],
		goalEvents: [],
		provenance: 'corpus',
		citation: MAGNESS,
		blocks: [
			block([run({ durationSec: min(40), intensity: zone('easy') })]),
			block(
				[
					run({
						durationSec: 10,
						intensity: rpe(10),
						notes: 'Maximal, up a 6–10 % hill.',
					}),
					rest(min(2)),
				],
				{ name: 'hill sprints', repeat: 8 },
			),
		],
	},
	{
		key: 'run-F5',
		title: 'Flying 30s (flyvende tretti)',
		description:
			'Top-end speed on the flat from a 30 m rolling entry. The source prescribes 95 % of maximal speed, which trainm8 has no anchor for; RPE 9 is the research library\'s own rendering of it and is stated as such rather than as the protocol\'s number.',
		discipline: 'run',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['base', 'taper'],
		goalEvents: ['1500m'],
		provenance: 'corpus',
		citation: HAUGEN_2021,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({
						durationSec: 30,
						intensity: rpe(9),
						notes: '95 % of maximal speed after a 30 m rolling entry.',
					}),
					rest(min(3)),
				],
				{ repeat: 5 },
			),
			coolDownKm(2),
		],
	},

	// ——— G · Hills (bakke) —————————————————————————————————————————————
	{
		key: 'run-G1',
		title: 'Long hill reps (bakkedrag)',
		description:
			'A VO2max stimulus at lower impact than flat intervals, plus specific strength. Uphill, pace is not a legitimate target — this is anchored on HR, and that is a prescription decision rather than a data limitation. Run on 4–7 % grade; the recovery is the jog back down and takes as long as the hill takes.',
		discipline: 'run',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: null,
		phases: ['base', 'build'],
		goalEvents: ['5k', '10k', 'trail'],
		provenance: 'corpus',
		citation: LYDIARD,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({
						durationSec: min(3),
						intensity: hrPct('max', 92, 95),
						notes: 'Uphill, 4–7 % grade.',
					}),
					jogBack,
				],
				{ repeat: 6 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-G2',
		title: 'Short hill reps (korte bakkedrag)',
		description:
			'Anaerobic power and mechanics — the bridge between hill sprints and long hill reps. Effort-anchored, because uphill pace means nothing.',
		discipline: 'run',
		intent: 'anaerobic',
		archetype: 'anaerobic',
		level: null,
		phases: ['base', 'build'],
		goalEvents: ['1500m', '3k', '5k', 'trail'],
		provenance: 'corpus',
		citation: HUDSON,
		blocks: [
			warmUpKm(3),
			block([run({ durationSec: 75, intensity: rpe(8) }), jogBack], {
				repeat: 10,
			}),
			coolDownKm(2),
		],
	},
	{
		key: 'run-G3',
		title: 'Hilly tempo (kupert terskel)',
		description:
			'Threshold *effort* on rolling terrain, with pace allowed to vary widely — the whole point is that effort is held constant while pace floats, which makes a pace target actively wrong here. Expect this session to score as a pace miss when it is executed perfectly: adherence does not yet know which channel a prescription anchored on.',
		discipline: 'run',
		intent: 'threshold',
		archetype: 'threshold',
		level: null,
		phases: ['build'],
		goalEvents: ['hm', 'marathon', 'trail'],
		provenance: 'corpus',
		citation: PFITZINGER,
		blocks: [
			warmUpKm(2),
			block([
				run({
					durationSec: min(35),
					intensity: rpe(6, 7),
					notes: 'Rolling terrain. Ignore pace entirely.',
				}),
			]),
			coolDownKm(2),
		],
	},
	{
		key: 'run-G4',
		title: 'Lydiard hill circuit (bakketrening)',
		description:
			'Springing and bounding plus running as one continuous strength circuit — bound a steep 200 m, jog to the top, stride 200 m on the flat, jog down, repeat. Run as a hill phase: two or three times a week for three or four weeks in late base.',
		discipline: 'run',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['base'],
		goalEvents: ['1500m', '3k', '5k'],
		provenance: 'corpus',
		citation: LYDIARD,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({
						distanceM: 200,
						intensity: rpe(9),
						notes: 'Bounding up a steep hill.',
					}),
					rest(min(3)),
					run({ distanceM: 200, intensity: racePace('1500m') }),
					rest(min(3)),
				],
				{ name: 'circuit', repeat: 4 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-G5',
		title: 'Downhill reps (utforløp)',
		description:
			'Eccentric loading, and mandatory preparation for a downhill-heavy race. Run a controlled 3–6 % descent at about 10 k effort. Anchor on RPE with a hard cap on volume: HR reads misleadingly low on a descent and grade-adjusted pace systematically under-prices descent load, because eccentric damage has no metabolic signature. Progress slowly — the soreness is severe and delayed.',
		discipline: 'run',
		intent: 'neuromuscular',
		archetype: 'neuromuscular',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['trail', 'ultra'],
		provenance: 'corpus',
		citation: VERNILLO_2017,
		blocks: [
			warmUpKm(3),
			block(
				[
					run({
						durationSec: 90,
						intensity: rpe(7),
						notes: 'Controlled 3–6 % descent.',
					}),
					jogBack,
				],
				{ repeat: 8 },
			),
			coolDownKm(2),
		],
	},

	// ——— H · Trail & vertical ————————————————————————————————————————
	{
		key: 'run-H1',
		title: 'Vertical repeats (høydemeterdrag)',
		description:
			'Climbing-specific VO2max and muscular endurance, measured in vertical metres rather than in time or ground distance — which is what the third Step Quantity exists for. The recovery is the descent.',
		discipline: 'run',
		intent: 'vo2max',
		archetype: 'vo2max-long',
		level: 'intermediate',
		phases: ['build'],
		goalEvents: ['trail', 'ultra'],
		provenance: 'corpus',
		citation: GIOVANELLI_2016,
		blocks: [
			warmUpMin(15),
			block([run({ verticalM: 200, intensity: rpe(7) }), jogBack], {
				repeat: 5,
			}),
			coolDownMin(10),
		],
	},
	{
		key: 'run-H2',
		title: 'Power-hike intervals (gangintervall)',
		description:
			'Race-specific for steep courses: above roughly 15–20 % grade, uphill walking is as economical as or more economical than running, so power-hiking is the prescription and not a failure to run.',
		discipline: 'run',
		intent: 'threshold',
		archetype: 'threshold',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['trail', 'ultra'],
		provenance: 'corpus',
		citation: GIOVANELLI_2016,
		blocks: [
			warmUpMin(15),
			block(
				[
					run({
						durationSec: min(4),
						intensity: hrPct('max', 85, 90),
						notes: 'Steep power-hike.',
					}),
					rest(min(2)),
				],
				{ repeat: 6 },
			),
			coolDownMin(10),
		],
	},
	{
		key: 'run-H3',
		title: 'Technical descent reps (teknisk utfor)',
		description:
			'A *skill* session, not a load session: descent technique and eccentric tolerance at controlled effort. Progress by running more technical terrain, never by running it faster.',
		discipline: 'run',
		intent: 'technique',
		archetype: 'technique',
		level: 'intermediate',
		phases: ['build', 'peak'],
		goalEvents: ['trail', 'ultra'],
		provenance: 'corpus',
		citation: VERNILLO_2017,
		blocks: [
			warmUpMin(15),
			block(
				[
					run({
						durationSec: min(3),
						intensity: rpe(6, 7),
						notes: 'Technical descent, controlled.',
					}),
					rest(min(4)),
				],
				{ repeat: 5 },
			),
			coolDownMin(10),
		],
	},
	{
		key: 'run-H4',
		title: 'Long mountain run (fjelltur)',
		description:
			'Time on feet, fuelling rehearsal and terrain durability, with 800–2000 vertical metres and every steep section deliberately hiked. The vertical is a *parameter* here rather than the quantity — a mountain long run has both a duration and a climb, and the model makes the two mutually exclusive — so the climb is stated and not stored.',
		discipline: 'run',
		intent: 'endurance',
		archetype: 'long',
		level: 'intermediate',
		phases: ['base', 'build'],
		goalEvents: ['trail', 'ultra'],
		provenance: 'corpus',
		citation: VERNILLO_2017,
		blocks: [
			block([
				run({
					durationSec: hours(4),
					intensity: zone('easy'),
					notes: 'Target ~1500 vertical metres. Hike the steep sections.',
				}),
			]),
		],
	},
	{
		key: 'run-H5',
		title: 'Uphill time trial / VK test (motbakketest)',
		description:
			'A portable fitness test where flat pace tests are impossible: sustain a maximal climb and record vertical metres per hour. The test does not progress — the comparison against the previous test is the result. Bookend a block with it, two or three times a season.',
		discipline: 'run',
		intent: 'test',
		archetype: 'test',
		level: null,
		phases: ['base', 'peak'],
		goalEvents: ['trail', 'ultra'],
		provenance: 'corpus',
		citation: GIOVANELLI_2016,
		blocks: [
			warmUpMin(20),
			block([
				run({
					durationSec: min(25),
					intensity: rpe(9),
					notes: 'Sustained maximal climb — record vertical metres per hour.',
				}),
			]),
			coolDownMin(15),
		],
	},

	// ——— I · Tune-up & race week — HAND-WRITTEN, NOT RETRIEVED ————————————
	{
		key: 'run-I1',
		title: 'Race-pace tune-up (formtest)',
		description: `${HAND_WRITTEN_NOTICE} A short, sharp rehearsal of goal race pace during the taper, at a fraction of race volume: enough to confirm the pace feels right, far too little to cost freshness. Taper rule of thumb — cut volume 40–60 %, keep the intensity and the frequency.`,
		discipline: 'run',
		intent: 'race',
		archetype: 'race-simulation',
		level: null,
		phases: ['taper'],
		goalEvents: ['5k', '10k', 'hm', 'marathon'],
		provenance: 'hand-written',
		citation: null,
		blocks: [
			warmUpKm(2),
			block(
				[run({ distanceM: 1000, intensity: racePace('10k', 100) }), rest(min(3))],
				{ repeat: 3 },
			),
			coolDownKm(2),
		],
	},
	{
		key: 'run-I2',
		title: 'Race-week primer (åpner)',
		description: `${HAND_WRITTEN_NOTICE} Two or three days out: a short easy run with a handful of race-pace touches to restore rhythm. Nothing here builds fitness — the goal is freshness plus rhythm, and the session is a primer rather than a workout.`,
		discipline: 'run',
		intent: 'race',
		archetype: 'race-simulation',
		level: null,
		phases: ['race-week'],
		goalEvents: ['5k', '10k', 'hm', 'marathon'],
		provenance: 'hand-written',
		citation: null,
		blocks: [
			block([run({ durationSec: min(15), intensity: zone('easy') })], {
				name: 'warm-up',
			}),
			block(
				[run({ durationSec: min(1), intensity: racePace('10k', 100) }), rest(min(2))],
				{ repeat: 4 },
			),
			block([run({ durationSec: min(10), intensity: zone('easy') })], {
				name: 'cool-down',
			}),
		],
	},
	{
		key: 'run-I3',
		title: 'Shakeout (utrulling)',
		description: `${HAND_WRITTEN_NOTICE} The day before, or the morning of: twenty easy minutes and four strides, to move without accumulating anything. Strides are the one intensity that belongs in race week.`,
		discipline: 'run',
		intent: 'recovery',
		archetype: 'race-simulation',
		level: null,
		phases: ['race-week'],
		goalEvents: ['5k', '10k', 'hm', 'marathon'],
		provenance: 'hand-written',
		citation: null,
		blocks: [
			block([run({ durationSec: min(20), intensity: zone('easy') })]),
			block([run({ durationSec: 20, intensity: racePace('1500m') }), rest(60)], {
				name: 'strides',
				repeat: 4,
			}),
		],
	},
]
