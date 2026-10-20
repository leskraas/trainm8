import { readFileSync, writeFileSync } from 'node:fs'
import { invariant } from '@epic-web/invariant'
import {
	type ActivityStream,
	downsampleStream,
} from '#app/utils/activity-stream.ts'
import { analyze } from '#app/utils/structure-detection/analyze.ts'
import { STRUCTURE_DETECTION_ENGINE_VERSION } from '#app/utils/structure-detection/constants.ts'
import {
	autoLaps,
	workoutStepLaps,
} from '#app/utils/structure-detection/eval/label.ts'
import {
	type ActivityScore,
	aggregate,
	readPrediction,
	type Scoreboard,
	scoreActivity,
} from '#app/utils/structure-detection/eval/score.ts'
import {
	type CorpusActivity,
	type DetectionCorpus,
} from '#app/utils/structure-detection/eval/types.ts'
import { type Lap } from '#app/utils/structure-detection/types.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/resolve.ts'
import { type FitBoard, fitScoreboard } from './detection/fit-eval.ts'

/**
 * The detection scoreboard (map #600, tickets #605, #625), the one tool that
 * scores Structure Detection: run the pure `analyze` engine over the frozen,
 * labelled corpus in `tests/fixtures/detection/` and print how it scores, per
 * profile, per edge source, and under threshold changes: the Detection
 * Confidence grades (ADR 0033) and the classification ladder (ADR 0035). The
 * FIT half (`detection/fit-eval.ts`) scores the owner's FIT files at 1 s, on
 * the production grid, at 15 s and with their own laps, for the shipped
 * engine and the #609 v3 prototype. Every engine version bump attaches this
 * table.
 *
 *   npm run detection:eval                 # the tables
 *   npm run detection:eval -- --verbose    # plus one row per labelled session
 *   npm run detection:eval -- --json out.json
 */

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const jsonOut = args.includes('--json')
	? args[args.indexOf('--json') + 1]
	: null

const corpus = JSON.parse(
	readFileSync('tests/fixtures/detection/corpus.json', 'utf8'),
) as DetectionCorpus

const engineVersion = STRUCTURE_DETECTION_ENGINE_VERSION

const profile = (name: string) => {
	const p = corpus.profiles.find((x) => x.name === name)
	invariant(p, `No profile "${name}" in the corpus`)
	return p.profile
}

type LapSource = 'stored' | 'workout-step' | 'auto-1km'
type Variant = {
	name: string
	profile: string
	/** Channels removed from the stream, to see a device without them. */
	drop?: Array<'power' | 'pace'>
	/** Re-bucket the stream coarser, the way ingest downsamples a longer session. */
	resolutionSec?: number
	laps: LapSource
}

const VARIANTS: Variant[] = [
	{ name: 'shipped: seed profile, stream', profile: 'seed', laps: 'stored' },
	{ name: 'label pace, stream', profile: 'label-pace', laps: 'stored' },
	{ name: 'label power, stream', profile: 'label-power', laps: 'stored' },
	{ name: 'HR rung, stream', profile: 'hr', laps: 'stored' },
	{
		name: 'label pace, no power meter',
		profile: 'label-pace',
		drop: ['power'],
		laps: 'stored',
	},
	{
		name: 'label power, stream at 10 s',
		profile: 'label-power',
		resolutionSec: 10,
		laps: 'stored',
	},
	{
		name: 'label power, stream at 15 s',
		profile: 'label-power',
		resolutionSec: 15,
		laps: 'stored',
	},
	{
		name: 'label power, workout-step laps*',
		profile: 'label-power',
		laps: 'workout-step',
	},
	{
		name: 'label power, 1 km auto-laps*',
		profile: 'label-power',
		laps: 'auto-1km',
	},
	{
		name: 'seed profile, workout-step laps*',
		profile: 'seed',
		laps: 'workout-step',
	},
]

function lapsFor(a: CorpusActivity, source: LapSource): Lap[] | undefined {
	if (source === 'stored') return a.laps ?? undefined
	if (source === 'auto-1km') return autoLaps(a.stream)
	// A watch only records step laps for a session run as a structured workout.
	return a.label.kind === 'structured'
		? workoutStepLaps(a.stream, a.label.work)
		: undefined
}

function streamFor(a: CorpusActivity, v: Variant): ActivityStream {
	let s: ActivityStream = { ...a.stream }
	for (const c of v.drop ?? []) delete s[c]
	if (v.resolutionSec) {
		const { timeSec, ...channels } = s
		s = downsampleStream(
			{ time: timeSec, ...channels },
			{ resolutionSec: v.resolutionSec },
		)!
	}
	return s
}

function run(
	v: Variant,
	p: DisciplineProfileForResolver = profile(v.profile),
): ActivityScore[] {
	return corpus.activities.map((a) => {
		const stream = streamFor(a, v)
		const detected = analyze({
			stream,
			discipline: a.discipline,
			profile: p,
			laps: lapsFor(a, v.laps),
		})
		return scoreActivity(a.label, readPrediction(detected, stream))
	})
}

/**
 * Scale every run threshold at once, so whichever rung the classifier picks
 * (ADR 0035) moves by `k` without this script repeating its ladder.
 */
function scaled(p: DisciplineProfileForResolver, k: number) {
	const r = (x: number | null) => (x == null ? null : Math.round(x * k))
	return {
		...p,
		runPowerThresholdW: r(p.runPowerThresholdW),
		thresholdPaceSecPerKm: r(p.thresholdPaceSecPerKm),
		lthr: r(p.lthr),
	}
}

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)} %`)
const sec = (x: number | null) => (x == null ? '–' : `${Math.round(x)} s`)
const frac = (n: number, d: number) => `${n}/${d}`

const boards = VARIANTS.map((v) => {
	const scores = run(v)
	return { v, scores, board: aggregate(scores) }
})

const out: string[] = []
const first = boards[0]!.board
out.push(
	`## Detection scoreboard — engine v${engineVersion}, corpus frozen ${corpus.frozenAt}`,
	'',
	`${first.activities} real runs (${corpus.from}): ${first.positives} structured (from the athlete's title or word), ${first.negatives} hand-labelled unstructured, ${first.unlabelled} unlabelled (never scored). Streams at stored resolution (5–6 s), no laps; the 1 s streams and real laps are in the FIT half below. * = laps synthesised from the labels, not recorded.`,
	'',
	'### The structured claim',
	'',
	'| Variant | ≥high P / R | ≥medium P / R | any grade P / R | false claims | unlabelled claimed |',
	'|---|---|---|---|---|---|',
)
for (const { v, board } of boards) {
	const [h, m, l] = board.claims
	out.push(
		`| ${v.name} | ${pct(h!.precision)} / ${frac(h!.truePositives, h!.positives)} | ${pct(m!.precision)} / ${frac(m!.truePositives, m!.positives)} | ${pct(l!.precision)} / ${frac(l!.truePositives, l!.positives)} | ${frac(l!.falsePositives, board.negatives)} | ${frac(board.unlabelledClaimed, board.unlabelled)} |`,
	)
}
out.push(
	'',
	'### The shape, on the structured sessions',
	'',
	'| Variant | reps exact | mean \\|Δreps\\| | boundary F1 @10 s | boundary error median / P90 | work duration error | recovery duration error | intensity error |',
	'|---|---|---|---|---|---|---|---|',
)
for (const { v, board } of boards) {
	out.push(
		`| ${v.name} | ${frac(board.repsExact, board.positives)} | ${board.repsAbsErrorMean?.toFixed(1) ?? '–'} | ${pct(board.boundaryF1)} | ${sec(board.boundaryErrorMedianSec)} / ${sec(board.boundaryErrorP90Sec)} | ${sec(board.workDurationErrorMedianSec)} | ${sec(board.recoveryDurationErrorMedianSec)} | ${pct(board.intensityErrorMedian)} |`,
	)
}
out.push(
	'',
	'Boundary error is over edges matched within 60 s; durations and intensity are medians over detected structured sessions.',
	`Read with care: ${first.positives} positives from one athlete, so one session moves recall by ${Math.round(100 / first.positives)} points. The label-pace and label-power thresholds are medians of labelled reps scored on the same corpus, so they flatter recall and robustness; only seed and hr are free of that. The true work windows are themselves a fit to power, so boundary and intensity errors measure agreement with that fit, and the low-contrast placements (work/recovery power under 1.5, see labels) are the least certain.`,
	'',
	'### Threshold robustness',
	'',
	`How many of the ${first.activities} verdicts (structured or not) flip when the classifying threshold moves.`,
	'',
	'| Profile | structured at ×1.00 | ×0.90 | ×0.95 | ×1.05 | ×1.10 |',
	'|---|---|---|---|---|---|',
)
const robust: Record<
	string,
	Record<string, { structured: number; flips: number }>
> = {}
for (const name of ['seed', 'label-pace', 'label-power', 'hr']) {
	const v: Variant = { name, profile: name, laps: 'stored' }
	const base = run(v).map((s) => s.prediction.structured)
	const row: Record<string, { structured: number; flips: number }> = {}
	for (const k of [0.9, 0.95, 1.05, 1.1]) {
		const verdicts = run(v, scaled(profile(name), k)).map(
			(s) => s.prediction.structured,
		)
		row[k.toFixed(2)] = {
			structured: verdicts.filter(Boolean).length,
			flips: verdicts.filter((x, i) => x !== base[i]).length,
		}
	}
	robust[name] = row
	const cell = (k: string) => `${row[k]!.structured} (${row[k]!.flips} flip)`
	out.push(
		`| ${name} | ${base.filter(Boolean).length} | ${cell('0.90')} | ${cell('0.95')} | ${cell('1.05')} | ${cell('1.10')} |`,
	)
}
out.push(
	'',
	'Profiles:',
	...corpus.profiles.map((p) => `- **${p.name}**: ${p.provenance}`),
)

if (verbose) {
	for (const { v, scores } of boards) {
		out.push(
			'',
			`### ${v.name}`,
			'',
			'| Session | truth | detected | grade | reps | work | recovery | edges @10 s |',
			'|---|---|---|---|---|---|---|---|',
		)
		scores.forEach((s, i) => {
			const a = corpus.activities[i]!
			if (a.label.kind !== 'structured' && !s.prediction.structured) return
			const truth =
				a.label.kind === 'structured'
					? `${a.label.reps}×${a.label.workSec}/${a.label.recoverySec}`
					: a.label.kind
			const p = s.prediction
			out.push(
				`| ${a.title} | ${truth} | ${p.structured ? 'yes' : 'no'} | ${p.grade ?? '–'} | ${p.reps} | ${sec(p.work?.durationSec ?? null)} | ${sec(p.recoverySec)} | ${s.edges ? frac(s.edges.matched, s.edges.truth) : '–'} |`,
			)
		})
	}
}

const fit = fitScoreboard(corpus, 'label-power')
out.push(...fit.lines)

console.log(out.join('\n'))

if (jsonOut) {
	const json: {
		engineVersion: string
		frozenAt: string
		variants: Array<{ variant: Variant; board: Scoreboard }>
		robustness: typeof robust
		fit: { boards: FitBoard[]; shortReps: unknown[] }
	} = {
		engineVersion,
		frozenAt: corpus.frozenAt,
		variants: boards.map(({ v, board }) => ({ variant: v, board })),
		robustness: robust,
		fit: { boards: fit.boards, shortReps: fit.shortReps },
	}
	writeFileSync(jsonOut, JSON.stringify(json, null, '\t') + '\n')
}
