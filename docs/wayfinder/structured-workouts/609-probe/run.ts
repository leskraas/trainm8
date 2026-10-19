import { readFileSync, writeFileSync } from 'node:fs'
import { analyze } from '#app/utils/structure-detection/analyze.ts'
import { downsampleStream, type ActivityStream } from '#app/utils/activity-stream.ts'
import { autoLaps, workoutStepLaps } from '#app/utils/structure-detection/eval/label.ts'
import { aggregate, matchEdges, readPrediction, scoreActivity, labelEdges, quantile } from '#app/utils/structure-detection/eval/score.ts'
import { type DetectionCorpus, type CorpusActivity } from '#app/utils/structure-detection/eval/types.ts'
import { type Lap } from '#app/utils/structure-detection/types.ts'
import { analyzeV3, type Opts, type TypedLap, V2_OPTS } from './v3.ts'

export const corpus = JSON.parse(readFileSync('tests/fixtures/detection/corpus.json', 'utf8')) as DetectionCorpus
export const profile = (n: string) => corpus.profiles.find((p) => p.name === n)!.profile

export type LapSrc = 'none' | 'typed' | 'typed-jitter' | 'untyped' | 'auto-1km'

let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

function typedLaps(a: CorpusActivity, jitter: boolean): TypedLap[] | undefined {
	if (a.label.kind !== 'structured') return undefined
	const laps = workoutStepLaps(a.stream, a.label.work)
	const work = new Set(a.label.work.map((w) => w.startSec))
	const firstW = a.label.work[0]!.startSec
	const lastW = a.label.work[a.label.work.length - 1]!.endSec
	const out: TypedLap[] = laps.map((l) => {
		const intensity = work.has(l.startSec) ? 'active' : l.endSec <= firstW ? 'warmup' : l.startSec >= lastW ? 'cooldown' : 'rest'
		const stepIndex = { warmup: 0, active: 1, rest: 2, cooldown: 3 }[intensity]
		return { ...l, intensity, stepIndex } as TypedLap
	})
	if (jitter) {
		// a real watch: each step edge lands within ±3 s of the plan
		for (let i = 1; i < out.length; i++) {
			const d = Math.round((rnd() - 0.5) * 6)
			out[i]!.startSec += d
			out[i - 1]!.endSec += d
		}
	}
	return out
}

export function lapsFor(a: CorpusActivity, src: LapSrc): Lap[] | TypedLap[] | undefined {
	if (src === 'none') return a.laps ?? undefined
	if (src === 'auto-1km') return autoLaps(a.stream)
	if (src === 'untyped') return a.label.kind === 'structured' ? workoutStepLaps(a.stream, a.label.work) : undefined
	return typedLaps(a, src === 'typed-jitter')
}

export type Variant = { name: string; profile: string; laps: LapSrc; opts: Opts | 'shipped'; res?: number; dropPower?: boolean }

export function runVariant(v: Variant, prof = profile(v.profile), only?: (a: CorpusActivity) => boolean) {
	seed = 7
	const acts = only ? corpus.activities.filter(only) : corpus.activities
	return acts.map((a0) => {
		let a = a0
		const laps = lapsFor(a, v.laps)
		let stream: ActivityStream = { ...a.stream }
		if (v.dropPower) delete stream.power
		if (v.res) {
			const { timeSec, ...ch } = stream
			stream = downsampleStream({ time: timeSec, ...ch } as any, { resolutionSec: v.res })!
		}
		a = { ...a, stream }
		let detected
		let ivEdges: number[] = []
		let parts: any
		if (v.opts === 'shipped') {
			detected = analyze({ stream: a.stream, discipline: 'run', profile: prof, laps: laps as Lap[] | undefined })
		} else {
			const r = analyzeV3(a.stream, prof, laps, v.opts)
			detected = r.detected
			ivEdges = r.intervals.filter((i) => i.role === 'work').flatMap((i) => [i.startSec, i.endSec])
			parts = r.parts
		}
		const pred = readPrediction(detected, a.stream)
		const s = scoreActivity(a.label, pred)
		let iv: { truth: number; predicted: number; hits: number } | undefined
		if (a.label.kind === 'structured') {
			const truth = labelEdges(a.label)
			const pe = v.opts === 'shipped' ? pred.edges : ivEdges
			iv = { truth: truth.length, predicted: pe.length, hits: matchEdges(truth, pe, 10).length }
		}
		return { a, s, iv, parts }
	})
}

export function summarize(rows: ReturnType<typeof runVariant>) {
	const b = aggregate(rows.map((r) => r.s))
	const pos = rows.filter((r) => r.iv)
	const T = pos.reduce((x, r) => x + r.iv!.truth, 0)
	const P = pos.reduce((x, r) => x + r.iv!.predicted, 0)
	const H = pos.reduce((x, r) => x + r.iv!.hits, 0)
	return { ...b, ivF1: T + P ? (2 * H) / (T + P) : null }
}

const pct = (x: number | null | undefined) => (x == null ? '–' : `${Math.round(x * 100)} %`)

export function row(name: string, b: ReturnType<typeof summarize>, flips?: string) {
	const [h, m, l] = b.claims
	const pr = (c: any) => `${pct(c.precision)} / ${c.truePositives}/${c.positives}`
	return `| ${name} | ${pr(h)} | ${pr(m)} | ${pr(l)} | ${l!.falsePositives}/${b.negatives} | ${b.unlabelledClaimed}/${b.unlabelled} | ${b.repsExact}/${b.positives} | ${b.repsAbsErrorMean?.toFixed(1)} | ${pct(b.boundaryF1)} | ${pct(b.ivF1)} | ${b.boundaryErrorMedianSec == null ? '–' : Math.round(b.boundaryErrorMedianSec)} s | ${pct(b.intensityErrorMedian)} | ${flips ?? ''} |`
}

export const HEADER = '| Variant | high P / R | ≥medium P / R | any P / R | false claims | unlabelled claimed | reps exact | mean \\|Δreps\\| | boundary F1 (drawn) | boundary F1 (intervals) | edge err median | intensity err | flips ±10 % (pace / power) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|'

export function flips(v: Variant): string {
	const out: string[] = []
	for (const pn of ['label-pace', 'label-power']) {
		const p = profile(pn)
		const base = runVariant({ ...v, profile: pn }, p).map((r) => r.s.prediction.structured)
		let worst = 0
		for (const k of [0.9, 0.95, 1.05, 1.1]) {
			const q = { ...p }
			if (pn === 'label-power') q.runPowerThresholdW = Math.round(p.runPowerThresholdW! * k)
			else q.thresholdPaceSecPerKm = Math.round(p.thresholdPaceSecPerKm! * k)
			const vv = runVariant({ ...v, profile: pn }, q).map((r) => r.s.prediction.structured)
			worst = Math.max(worst, vv.filter((x, i) => x !== base[i]).length)
		}
		out.push(String(worst))
	}
	return out.join(' / ')
}

export const T: Opts = {
	...V2_OPTS,
	seg: 'tuned',
	medianWindow: 1,
	penaltyFactor: 2,
	minSegSec: 10,
	speed: true,
}
