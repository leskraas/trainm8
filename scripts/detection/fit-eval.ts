import { existsSync, readFileSync } from 'node:fs'
import { invariant } from '@epic-web/invariant'
import {
	type ActivityStream,
	downsampleStream,
	type RawStream,
} from '#app/utils/activity-stream.ts'
import { analyze } from '#app/utils/structure-detection/analyze.ts'
import {
	type DeviceLap,
	oneSecondStream,
	readFitFile,
} from '#app/utils/structure-detection/eval/fit.ts'
import {
	type ActivityScore,
	aggregate,
	BOUNDARY_SEARCH_SEC,
	BOUNDARY_TOLERANCE_SEC,
	labelEdges,
	matchEdges,
	quantile,
	readPrediction,
	type Scoreboard,
	scoreActivity,
} from '#app/utils/structure-detection/eval/score.ts'
import {
	type DetectionCorpus,
	type FitCorpusActivity,
	type StructuredLabel,
} from '#app/utils/structure-detection/eval/types.ts'
import { type Lap } from '#app/utils/structure-detection/types.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/resolve.ts'
import { fitPath } from './fit-dir.ts'
import { analyzeV3, type TypedLap, V3 } from './v3-probe.ts'

/**
 * The FIT half of the detection scoreboard (#625): the owner's real FIT files
 * scored at 1 s, on the production grid, at 15 s, and with the files' own
 * laps, by the shipped engine (v2) and by the #609 v3 prototype
 * (`v3-probe.ts`, eval-only). Labels come from the laps
 * (`npm run detection:corpus`), so boundary and intensity errors are measured
 * against edges the watch or the athlete set, not against a fit to power.
 */

export type Engine = 'v2' | 'v3*'
type Resolution = '1 s' | 'grid' | '15 s'
type LapMode = 'none' | 'typed' | 'edges'
export type FitVariant = {
	key: string
	name: string
	resolution: Resolution
	laps: LapMode
}

export const FIT_VARIANTS: FitVariant[] = [
	{
		key: 'a',
		name: '(a) 1 s stream, no laps',
		resolution: '1 s',
		laps: 'none',
	},
	{
		key: 'b',
		name: '(b) production grid (5–6 s), no laps',
		resolution: 'grid',
		laps: 'none',
	},
	{ key: 'c', name: '(c) 15 s, no laps', resolution: '15 s', laps: 'none' },
	{
		key: 'd',
		name: '(d) grid + file laps with their roles',
		resolution: 'grid',
		laps: 'typed',
	},
	{
		key: 'e',
		name: '(e) grid + file laps, edges only',
		resolution: 'grid',
		laps: 'edges',
	},
]

type Loaded = {
	a: FitCorpusActivity
	streams: Record<Resolution, ActivityStream>
}

function load(a: FitCorpusActivity): Loaded | null {
	if (!existsSync(fitPath(a.file))) return null
	const [, si] = a.id.split('#')
	const file = readFitFile(new Uint8Array(readFileSync(fitPath(a.file))))
	const session = file.sessions[si ? Number(si) : 0]
	invariant(session, `No session for ${a.id} in ${a.file}`)
	const raw: RawStream | null = session.raw
	if (!raw) return null
	const one = oneSecondStream(raw)
	const grid = downsampleStream(raw)
	const coarse = downsampleStream(raw, { resolutionSec: 15 })
	if (!one || !grid || !coarse) return null
	const strip = ({
		sampleCount: _,
		...s
	}: ActivityStream & { sampleCount: number }) => s
	return {
		a,
		streams: { '1 s': one, grid: strip(grid), '15 s': strip(coarse) },
	}
}

/** The 1 s recovery lap many files end with is a writer artefact, not a step. */
const MIN_STEP_LAP_SEC = 5

/**
 * A session's laps as the engine takes them. `typed` passes FIT `intensity` as
 * the step role (v3's typed-lap path) when the file reads as a workout ran (a
 * rest or recovery lap of at least 5 s); the files carry no `wkt_step_index`,
 * so the step index is left at 0. A lone lap is dropped, as FIT ingest does.
 */
function lapsFor(
	laps: DeviceLap[],
	mode: LapMode,
	engine: Engine,
): Lap[] | TypedLap[] | undefined {
	if (mode === 'none' || laps.length < 2) return undefined
	const plain = laps.map((l) => ({ startSec: l.startSec, endSec: l.endSec }))
	if (mode === 'edges' || engine === 'v2') return plain
	const workout = laps.some(
		(l) =>
			(l.intensity === 'rest' || l.intensity === 'recovery') &&
			l.endSec - l.startSec >= MIN_STEP_LAP_SEC,
	)
	if (!workout) return plain
	return laps.map((l) => ({
		startSec: l.startSec,
		endSec: l.endSec,
		intensity:
			l.intensity === 'rest' || l.intensity === 'recovery'
				? 'rest'
				: l.intensity === 'warmup' || l.intensity === 'cooldown'
					? l.intensity
					: 'active',
		stepIndex: l.wktStepIndex ?? 0,
	}))
}

type Scored = {
	score: ActivityScore
	/** v3's per-rep work edges, matched to the truth (v2 draws only medians). */
	perRep?: { truth: number; predicted: number; hits: number; errors: number[] }
}

function run(
	loaded: Loaded[],
	engine: Engine,
	v: FitVariant,
	profile: DisciplineProfileForResolver,
): Scored[] {
	return loaded.map(({ a, streams }) => {
		const stream = streams[v.resolution]
		const laps = lapsFor(a.laps, v.laps, engine)
		if (engine === 'v2') {
			const detected = analyze({
				stream,
				discipline: a.discipline,
				profile,
				laps: laps as Lap[] | undefined,
			})
			return { score: scoreActivity(a.label, readPrediction(detected, stream)) }
		}
		// v3 reads lap roles only when told to (`typedLaps`, #609 change (a)).
		const r = analyzeV3(stream, profile, laps, {
			...V3,
			typedLaps: v.laps === 'typed',
		})
		const score = scoreActivity(a.label, readPrediction(r.detected, stream))
		if (a.label.kind !== 'structured') return { score }
		const truth = labelEdges(a.label)
		const predicted = r.detected
			? r.intervals
					.filter((i) => i.role === 'work')
					.flatMap((i) => [i.startSec, i.endSec])
			: []
		return {
			score,
			perRep: {
				truth: truth.length,
				predicted: predicted.length,
				hits: matchEdges(truth, predicted, BOUNDARY_TOLERANCE_SEC).length,
				errors: matchEdges(truth, predicted, BOUNDARY_SEARCH_SEC),
			},
		}
	})
}

/** Wilson 95 % interval for k of n, as "[lo–hi %]". */
export function wilson(k: number, n: number): string {
	if (n === 0) return '–'
	const z = 1.96
	const p = k / n
	const d = 1 + (z * z) / n
	const c = p + (z * z) / (2 * n)
	const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
	return `${Math.round(((c - h) / d) * 100)}–${Math.round(((c + h) / d) * 100)} %`
}

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)} %`)
const sec = (x: number | null) => (x == null ? '–' : `${Math.round(x)} s`)

export type FitBoard = {
	engine: Engine
	variant: FitVariant
	board: Scoreboard
	perRepF1: number | null
	perRepErrorMedianSec: number | null
}

export function fitScoreboard(
	corpus: DetectionCorpus,
	profileName: string,
): { lines: string[]; boards: FitBoard[]; shortReps: unknown[] } {
	const profile = corpus.profiles.find((p) => p.name === profileName)?.profile
	invariant(profile, `No profile "${profileName}"`)
	const loaded = corpus.fit.map(load).filter((x): x is Loaded => x != null)
	const missing = corpus.fit.length - loaded.length
	const sum = corpus.fitSummary
	const excluded = Object.entries(sum.excluded).sort((a, b) => b[1] - a[1])
	const excludedCount = excluded.reduce((n, [, k]) => n + k, 0)
	const all: Array<{ engine: Engine; v: FitVariant; scored: Scored[] }> = []
	for (const engine of ['v2', 'v3*'] as const) {
		for (const v of FIT_VARIANTS) {
			// v2's laps carry edges only, so (d) is (e) for it.
			if (engine === 'v2' && v.laps === 'typed') continue
			all.push({ engine, v, scored: run(loaded, engine, v, profile) })
		}
	}

	const boards: FitBoard[] = all.map(({ engine, v, scored }) => {
		const reps = scored.flatMap((s) => (s.perRep ? [s.perRep] : []))
		const t = reps.reduce((x, r) => x + r.truth, 0)
		const p = reps.reduce((x, r) => x + r.predicted, 0)
		const h = reps.reduce((x, r) => x + r.hits, 0)
		return {
			engine,
			variant: v,
			board: aggregate(scored.map((s) => s.score)),
			perRepF1: engine === 'v2' ? null : t + p ? (2 * h) / (t + p) : null,
			perRepErrorMedianSec:
				engine === 'v2'
					? null
					: quantile(
							reps.flatMap((r) => r.errors),
							0.5,
						),
		}
	})

	const b0 = boards[0]!.board
	const lines: string[] = [
		'',
		`## FIT corpus — ${loaded.length} labelled real sessions at 1 s with their own laps (#625)`,
		'',
		`${b0.positives} structured (labelled from the files' laps: step laps, or reps the athlete lapped by hand) and ${b0.negatives} unstructured (the Strava hand label of the same session, or an easy-run title)${missing ? `; ${missing} labelled sessions skipped, their FIT file not on disk` : ''}. Built from ${sum.files} files of the owner's bulk export; ${sum.unlabelled} run/bike sessions are unlabelled and ${excludedCount} are other sports (${excluded.map(([k, n]) => `${k} ${n}`).join(', ')}), and neither kind is kept or scored. Profile \`${profileName}\`. v3* is the #609 prototype (\`scripts/detection/v3-probe.ts\`), eval-only, not the shipped engine. The files are Intervals.icu's bulk export (\`download-fit-files\`), files it generated: no \`wkt_step_index\`, no \`workout_step\`, warm-up and cool-down written \`active\`, so (d) feeds v3 the lap's \`intensity\` as its role and no step index. v2's laps carry no role, so its (d) is its (e).`,
		'',
		'### The structured claim',
		'',
		`Wilson 95 % intervals in brackets. A claim at \`high\` is v3's structured claim; v2 claims at any grade.`,
		'',
		'| Engine | Variant | recall at high | false claims at high | recall, any grade | false claims, any grade |',
		'|---|---|---|---|---|---|',
	]
	for (const { engine, variant, board } of boards) {
		const [hi, , any] = board.claims
		lines.push(
			`| ${engine} | ${variant.name} | ${hi!.truePositives}/${board.positives} [${wilson(hi!.truePositives, board.positives)}] | ${hi!.falsePositives}/${board.negatives} [${wilson(hi!.falsePositives, board.negatives)}] | ${any!.truePositives}/${board.positives} [${wilson(any!.truePositives, board.positives)}] | ${any!.falsePositives}/${board.negatives} [${wilson(any!.falsePositives, board.negatives)}] |`,
		)
	}
	lines.push(
		'',
		'### The shape, on the structured sessions',
		'',
		'Edges against the lap truth. "Drawn" lays the stored structure end to end (what both engines store today); "per rep" is v3\'s own rep edges (Activity Intervals, #603).',
		'',
		'| Engine | Variant | reps exact | mean \\|Δreps\\| | boundary F1 @10 s, drawn | boundary error median / P90, drawn | per-rep F1 @10 s | per-rep error median | intensity error |',
		'|---|---|---|---|---|---|---|---|---|',
	)
	for (const {
		engine,
		variant,
		board,
		perRepF1,
		perRepErrorMedianSec,
	} of boards) {
		lines.push(
			`| ${engine} | ${variant.name} | ${board.repsExact}/${board.positives} | ${board.repsAbsErrorMean?.toFixed(1) ?? '–'} | ${pct(board.boundaryF1)} | ${sec(board.boundaryErrorMedianSec)} / ${sec(board.boundaryErrorP90Sec)} | ${pct(perRepF1)} | ${sec(perRepErrorMedianSec)} | ${pct(board.intensityErrorMedian)} |`,
		)
	}

	// #610: do short reps need a full-resolution stream?
	const shortIdx = loaded
		.map((l, i) => ({ l, i }))
		.filter(
			({ l }) => l.a.label.kind === 'structured' && l.a.label.workSec <= 60,
		)
	const res: Array<{ key: string; name: string }> = [
		{ key: 'a', name: '1 s' },
		{ key: 'b', name: 'grid' },
		{ key: 'c', name: '15 s' },
	]
	const cell = (s: Scored, engine: Engine) => {
		const p = s.score.prediction
		if (!p.structured) return '–'
		const errs = engine === 'v2' ? s.score.edges!.errors : s.perRep!.errors
		const e = quantile(errs, 0.5)
		const ie = s.score.intensityError
		return `${p.grade} ${p.reps}× ±${e == null ? '–' : Math.round(e)} s${ie == null ? '' : ` ${Math.round(ie * 100)}%`}`
	}
	lines.push(
		'',
		`### Do short reps need a full-resolution stream? (#610)`,
		'',
		`The ${shortIdx.length} structured sessions with work of 60 s or less. Each cell: grade, reps found, median boundary error against the laps (drawn for v2, per rep for v3*), intensity error. "–" = no structure claimed.`,
		'',
		`| Session | truth | ${(['v2', 'v3*'] as const).flatMap((e) => res.map((r) => `${e} ${r.name}`)).join(' | ')} |`,
		`|---|---|${(['v2', 'v3*'] as const).flatMap(() => res.map(() => '---')).join('|')}|`,
	)
	const pick = (engine: Engine, key: string) =>
		all.find((x) => x.engine === engine && x.v.key === key)!.scored
	const shortRows: unknown[] = []
	for (const { l, i } of shortIdx) {
		const lab = l.a.label as StructuredLabel
		const cells = (['v2', 'v3*'] as const).flatMap((e) =>
			res.map((r) => cell(pick(e, r.key)[i]!, e)),
		)
		shortRows.push({ id: l.a.id, title: l.a.title, cells })
		lines.push(
			`| ${l.a.id} ${l.a.title} | ${lab.reps}×${lab.workSec}/${lab.recoverySec} | ${cells.join(' | ')} |`,
		)
	}
	const agg = (engine: Engine, key: string) => {
		const s = shortIdx.map(({ i }) => pick(engine, key)[i]!)
		const found = s.filter((x) => x.score.prediction.structured)
		const high = s.filter((x) => x.score.prediction.grade === 'high')
		const exact = s.filter(
			(x) => x.score.reps!.predicted === x.score.reps!.truth,
		).length
		const errs = s.flatMap((x) =>
			engine === 'v2' ? x.score.edges!.errors : x.perRep!.errors,
		)
		const hits = s.reduce(
			(n, x) => n + (engine === 'v2' ? x.score.edges!.matched : x.perRep!.hits),
			0,
		)
		const truth = s.reduce((n, x) => n + x.score.edges!.truth, 0)
		const ie = quantile(
			found.flatMap((x) =>
				x.score.intensityError == null ? [] : [x.score.intensityError],
			),
			0.5,
		)
		return `found ${found.length}/${s.length} (high ${high.length}); reps exact ${exact}; edges within 10 s ${hits}/${truth}; boundary error median ${sec(quantile(errs, 0.5))}, P90 ${sec(quantile(errs, 0.9))}; intensity error ${pct(ie)}`
	}
	lines.push('', 'Aggregate:', '')
	for (const e of ['v2', 'v3*'] as const) {
		for (const r of res) lines.push(`- **${e}, ${r.name}:** ${agg(e, r.key)}`)
	}
	return { lines, boards, shortReps: shortRows }
}
