import { type ActivityStream } from '../../activity-stream.ts'
import { type DetectedStructure, type DetectionGrade } from '../types.ts'
import { type DetectionLabel, type StructuredLabel } from './types.ts'

/**
 * Score Structure Detection's output against a labelled corpus. Reads only what
 * `analyze` returns, the structure as it would be stored and drawn, so the
 * scoreboard measures the shipped engine, not its internals.
 */

type Channel = 'power' | 'pace' | 'heartrate'

/** What the engine claimed for one activity, read back from its structure. */
export type Prediction = {
	structured: boolean
	grade: DetectionGrade | null
	/** Reps in the main set: the most-repeated block, 1 for a sustained effort. */
	reps: number
	work: { durationSec: number; value: number; channel: Channel } | null
	recoverySec: number | null
	/**
	 * Every step edge, laid end to end from the stream's first sample, because
	 * the stored structure keeps durations only. A pause the engine skipped
	 * shifts every later edge, as it would in the drawing.
	 */
	edges: number[]
}

type Step = {
	durationSec: number
	value: number | null
	channel: Channel | null
}

function stepOf(step: unknown): Step {
	const s = step as {
		durationSec?: number
		intensity?: {
			kind: string
			minW?: number
			minSecPerKm?: number
			min?: number
		}
	}
	const t = s.intensity
	const read: [number | null, Channel | null] =
		t?.kind === 'power'
			? [t.minW ?? null, 'power']
			: t?.kind === 'pace'
				? [t.minSecPerKm ?? null, 'pace']
				: t?.kind === 'hrBpm'
					? [t.min ?? null, 'heartrate']
					: [null, null]
	return { durationSec: s.durationSec ?? 0, value: read[0], channel: read[1] }
}

/** Harder first: more power or HR, or a faster (smaller) pace. */
function harder(a: Step, b: Step): number {
	if (a.value == null) return 1
	if (b.value == null) return -1
	return a.channel === 'pace' ? a.value - b.value : b.value - a.value
}

export function readPrediction(
	detected: DetectedStructure | null,
	stream: ActivityStream,
): Prediction {
	if (!detected) {
		return {
			structured: false,
			grade: null,
			reps: 0,
			work: null,
			recoverySec: null,
			edges: [],
		}
	}
	const blocks = detected.structure.blocks.map((b) => ({
		repeat: b.repeatCount,
		steps: b.steps.map(stepOf),
	}))
	const edges: number[] = []
	let t = stream.timeSec[0] ?? 0
	for (const b of blocks) {
		for (let r = 0; r < b.repeat; r++) {
			for (const s of b.steps) {
				t += s.durationSec
				edges.push(t)
			}
		}
	}
	edges.pop()

	const main = [...blocks].sort((a, b) => b.repeat - a.repeat)[0]!
	const pool = main.repeat > 1 ? main.steps : blocks.flatMap((b) => b.steps)
	const work = [...pool].sort(harder)[0] ?? null
	const recovery =
		main.repeat > 1 ? (main.steps.find((s) => s !== work) ?? null) : null
	return {
		structured: true,
		grade: detected.confidence,
		reps: main.repeat > 1 ? main.repeat : 1,
		work:
			work && work.value != null && work.channel
				? {
						durationSec: work.durationSec,
						value: work.value,
						channel: work.channel,
					}
				: null,
		recoverySec: recovery?.durationSec ?? null,
		edges,
	}
}

/** A label's true edges: the start and end of every work window. */
export function labelEdges(label: StructuredLabel): number[] {
	return label.work.flatMap((w) => [w.startSec, w.endSec])
}

/**
 * Pair true and predicted edges one-to-one, closest first, within `tolSec`.
 * Returns the error of each matched pair.
 */
export function matchEdges(
	truth: number[],
	predicted: number[],
	tolSec: number,
): number[] {
	const pairs: Array<[number, number, number]> = []
	truth.forEach((a, i) =>
		predicted.forEach((b, j) => {
			const d = Math.abs(a - b)
			if (d <= tolSec) pairs.push([d, i, j])
		}),
	)
	pairs.sort((x, y) => x[0] - y[0])
	const usedT = new Set<number>()
	const usedP = new Set<number>()
	const errors: number[] = []
	for (const [d, i, j] of pairs) {
		if (usedT.has(i) || usedP.has(j)) continue
		usedT.add(i)
		usedP.add(j)
		errors.push(d)
	}
	return errors
}

/** Edges within this many seconds count as the same boundary. */
export const BOUNDARY_TOLERANCE_SEC = 10
/** Beyond this an edge counts as missed rather than misplaced. */
export const BOUNDARY_SEARCH_SEC = 60

export type ActivityScore = {
	label: DetectionLabel['kind']
	prediction: Prediction
	/** Present for structured labels only. */
	reps?: { truth: number; predicted: number }
	edges?: {
		truth: number
		predicted: number
		within10: number
		errors: number[]
	}
	workDurationErrorSec?: number
	recoveryDurationErrorSec?: number
	/** |measured − truth| ÷ truth on the channel the engine classified on. */
	intensityError?: number
}

export function scoreActivity(
	label: DetectionLabel,
	prediction: Prediction,
): ActivityScore {
	const score: ActivityScore = { label: label.kind, prediction }
	if (label.kind !== 'structured') return score
	const truth = labelEdges(label)
	score.reps = { truth: label.reps, predicted: prediction.reps }
	score.edges = {
		truth: truth.length,
		predicted: prediction.edges.length,
		within10: matchEdges(truth, prediction.edges, BOUNDARY_TOLERANCE_SEC)
			.length,
		errors: matchEdges(truth, prediction.edges, BOUNDARY_SEARCH_SEC),
	}
	if (prediction.work) {
		score.workDurationErrorSec = Math.abs(
			prediction.work.durationSec - label.workSec,
		)
		const truthValue = label.workValue[prediction.work.channel]
		if (truthValue) {
			score.intensityError =
				Math.abs(prediction.work.value - truthValue) / truthValue
		}
	}
	if (prediction.recoverySec != null) {
		score.recoveryDurationErrorSec = Math.abs(
			prediction.recoverySec - label.recoverySec,
		)
	}
	return score
}

const RANK: Record<DetectionGrade, number> = { low: 0, medium: 1, high: 2 }

export type ClaimScore = {
	atLeast: DetectionGrade
	truePositives: number
	falsePositives: number
	positives: number
	precision: number | null
	recall: number | null
}

export type Scoreboard = {
	activities: number
	positives: number
	negatives: number
	unlabelled: number
	/** Structured claims among unlabelled sessions: reported, never scored. */
	unlabelledClaimed: number
	claims: ClaimScore[]
	repsExact: number
	repsAbsErrorMean: number | null
	boundaryF1: number | null
	boundaryErrorMedianSec: number | null
	boundaryErrorP90Sec: number | null
	workDurationErrorMedianSec: number | null
	recoveryDurationErrorMedianSec: number | null
	intensityErrorMedian: number | null
}

export function quantile(xs: number[], q: number): number | null {
	if (xs.length === 0) return null
	const s = [...xs].sort((a, b) => a - b)
	const pos = (s.length - 1) * q
	const lo = Math.floor(pos)
	const hi = Math.ceil(pos)
	return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo)
}

export function aggregate(scores: ActivityScore[]): Scoreboard {
	const pos = scores.filter((s) => s.label === 'structured')
	const neg = scores.filter((s) => s.label === 'unstructured')
	const unl = scores.filter((s) => s.label === 'unlabelled')
	const claimed = (s: ActivityScore, g: DetectionGrade) =>
		s.prediction.structured && RANK[s.prediction.grade!] >= RANK[g]
	const claims = (['high', 'medium', 'low'] as const).map((g) => {
		const tp = pos.filter((s) => claimed(s, g)).length
		const fp = neg.filter((s) => claimed(s, g)).length
		return {
			atLeast: g,
			truePositives: tp,
			falsePositives: fp,
			positives: pos.length,
			precision: tp + fp ? tp / (tp + fp) : null,
			recall: pos.length ? tp / pos.length : null,
		}
	})
	const detectedPos = pos.filter((s) => s.prediction.structured)
	const truthEdges = pos.reduce((a, s) => a + s.edges!.truth, 0)
	const predEdges = pos.reduce((a, s) => a + s.edges!.predicted, 0)
	const hits = pos.reduce((a, s) => a + s.edges!.within10, 0)
	const errors = pos.flatMap((s) => s.edges!.errors)
	const defined = (xs: Array<number | undefined>) =>
		xs.filter((x): x is number => x != null)
	return {
		activities: scores.length,
		positives: pos.length,
		negatives: neg.length,
		unlabelled: unl.length,
		unlabelledClaimed: unl.filter((s) => s.prediction.structured).length,
		claims,
		repsExact: pos.filter((s) => s.reps!.predicted === s.reps!.truth).length,
		repsAbsErrorMean: pos.length
			? pos.reduce(
					(a, s) => a + Math.abs(s.reps!.predicted - s.reps!.truth),
					0,
				) / pos.length
			: null,
		boundaryF1:
			truthEdges + predEdges ? (2 * hits) / (truthEdges + predEdges) : null,
		boundaryErrorMedianSec: quantile(errors, 0.5),
		boundaryErrorP90Sec: quantile(errors, 0.9),
		workDurationErrorMedianSec: quantile(
			defined(detectedPos.map((s) => s.workDurationErrorSec)),
			0.5,
		),
		recoveryDurationErrorMedianSec: quantile(
			defined(detectedPos.map((s) => s.recoveryDurationErrorSec)),
			0.5,
		),
		intensityErrorMedian: quantile(
			defined(detectedPos.map((s) => s.intensityError)),
			0.5,
		),
	}
}
