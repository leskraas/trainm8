import { type Classifier } from './classify.ts'
import {
	ALTERNATION_BROKEN,
	ALTERNATION_EASIER_MARGIN,
	CV_DURATION_SHARPNESS,
	CV_INTENSITY_SHARPNESS,
	K_FACTOR_STRONG,
	K_FACTOR_WEAK_MULTIPLIER,
	MIN_BAND_SEPARATION,
	MIN_MOTIF_COVERAGE,
	MIN_SUSTAINED_COVERAGE,
	MIN_SUSTAINED_SEC,
	MIN_WARMUP_COOLDOWN_SEC,
	MIN_WORK_SEC,
	MOTIF_SCORE_WEIGHTS,
	PAUSE_STITCH_MAX_GAP_SEC,
	PAUSE_STITCH_VALUE_TOL,
	REC_SANITY_ABS_CEILING_SEC,
	REC_SANITY_WORK_MULTIPLE,
	REP_CLUSTER_DURATION_TOL,
	REP_CLUSTER_VALUE_TOL,
	SUSTAINED_SCORE_BASE,
	SUSTAINED_SCORE_COVERAGE_WEIGHT,
	TWO_MEANS_MAX_ITERATIONS,
	VALUE_MARGIN_GATE,
} from './constants.ts'
import { type Segment, type Segmentation } from './segments.ts'
import { mean, median } from './signal.ts'

/**
 * Repeat mining, the band-separation honesty gate, and hypothesis scoring — the
 * hard, tunable half of the pipeline (#330: "the segmentation is the easy part").
 * The engine may weigh several hypotheses internally, but only the single
 * winning one is returned; "candidate structure" is engine-internal, never a
 * domain entity (ADR 0032).
 */

export type StepRole = 'warmup' | 'work' | 'recovery' | 'cooldown'

export type StepPlan = {
	role: StepRole
	durationSec: number
	/** Representative measured value on the classifying channel (→ Intensity Target). */
	value: number
}

export type BlockPlan = { repeat: number; steps: StepPlan[] }

/**
 * The winning structured hypothesis: the block layout to materialize plus the
 * internal 0–1 score (never stored — only its graded label; ADR 0032/0033) and
 * the components behind it, for a build-time audit.
 */
export type Hypothesis = {
	kind: 'motif' | 'sustained'
	blocks: BlockPlan[]
	score: number
	scoreParts: Record<string, number>
}

/** Median of the pooled settled interiors of every segment in a rep cluster. */
function pooledInteriorMedian(segs: Segment[], cl: Rep[]): number | null {
	const pooled = cl.flatMap((r) =>
		segs.slice(r.i0, r.i + 1).flatMap((s) => s.interior),
	)
	return pooled.length ? median(pooled) : null
}

/** Coefficient of variation (std / mean); 1 when the mean is zero. */
function cv(xs: number[]): number {
	const m = mean(xs)
	if (!m) return 1
	return Math.sqrt(mean(xs.map((v) => (v - m) ** 2))) / m
}

/** Duration-weighted 2-means over segment values → two intensity levels. */
function twoMeans(segs: Segment[]): {
	centroids: [number, number]
	assign: number[]
} {
	const values = segs.map((s) => s.value)
	let c0 = Math.min(...values)
	let c1 = Math.max(...values)
	let assign = segs.map(() => 0)
	for (let iter = 0; iter < TWO_MEANS_MAX_ITERATIONS; iter++) {
		assign = segs.map((s) =>
			Math.abs(s.value - c1) <= Math.abs(s.value - c0) ? 1 : 0,
		)
		const weighted = (cluster: number): number | null => {
			let num = 0
			let den = 0
			segs.forEach((s, i) => {
				if (assign[i] === cluster) {
					num += s.value * s.durationSec
					den += s.durationSec
				}
			})
			return den ? num / den : null
		}
		const n0 = weighted(0)
		const n1 = weighted(1)
		if (n0 == null || n1 == null) break
		if (n0 === c0 && n1 === c1) break
		c0 = n0
		c1 = n1
	}
	return { centroids: [c0, c1], assign }
}

/** One logical work rep (segments split only by a short pause are stitched). */
type Rep = {
	/** First and last constituent segment indices (differ only when stitched). */
	i0: number
	i: number
	startSec: number
	endSec: number
	durationSec: number
	value: number
}

/** Warm-up / cool-down blocks flanking a `[firstIdx, lastIdx]` work span. */
function flankBlocks(
	segs: Segment[],
	firstIdx: number,
	lastIdx: number,
): { warmup: BlockPlan[]; cooldown: BlockPlan[] } {
	const spanTime = (from: number, to: number) =>
		segs.slice(from, to).reduce((a, s) => a + s.durationSec, 0)
	const warmupTime = spanTime(0, firstIdx)
	const cooldownTime = spanTime(lastIdx + 1, segs.length)
	const warmup: BlockPlan[] =
		warmupTime >= MIN_WARMUP_COOLDOWN_SEC
			? [
					{
						repeat: 1,
						steps: [
							{
								role: 'warmup',
								durationSec: warmupTime,
								value: segs[0]!.value,
							},
						],
					},
				]
			: []
	const cooldown: BlockPlan[] =
		cooldownTime >= MIN_WARMUP_COOLDOWN_SEC
			? [
					{
						repeat: 1,
						steps: [
							{
								role: 'cooldown',
								durationSec: cooldownTime,
								value: segs[segs.length - 1]!.value,
							},
						],
					},
				]
			: []
	return { warmup, cooldown }
}

/**
 * Mine the winning structured hypothesis, or `null` for steady / formless
 * activity. The band-separation gate is the honesty line (ADR 0033): a work
 * level counts only if it sits ≥1 zone above the easy/baseline band. A single
 * sustained elevated block clears the gate; repeats are not required.
 */
export function mineStructure(
	segmentation: Segmentation,
	classifier: Classifier,
): Hypothesis | null {
	const segs = segmentation.segments
	if (segs.length === 0) return null
	const inv = classifier.inverted
	const harder = (a: number, b: number) => (inv ? a < b : a > b)

	// --- honesty gate: are there two genuinely separated intensity levels? ----
	const { centroids, assign } = twoMeans(segs)
	const [c0, c1] = centroids
	const hardCluster = harder(c0, c1) ? 0 : 1
	const cHard = hardCluster === 0 ? c0 : c1
	const cEasy = hardCluster === 0 ? c1 : c0
	const margin = Math.abs(cEasy - cHard) / ((cEasy + cHard) / 2 || 1)
	const bandSep = classifier.bandIndex(cHard) - classifier.bandIndex(cEasy)
	if (margin < VALUE_MARGIN_GATE[classifier.channel]) return null
	if (bandSep < MIN_BAND_SEPARATION) return null

	// --- work reps: hard-cluster segments, long enough, pause-stitched --------
	const workSegs = segs
		.map((s, i) => ({ s, i }))
		.filter(
			({ s, i }) => assign[i] === hardCluster && s.durationSec >= MIN_WORK_SEC,
		)
	const reps: Rep[] = []
	for (const { s, i } of workSegs) {
		const prev = reps[reps.length - 1]
		const gap = prev ? s.startSec - prev.endSec : Infinity
		const contiguous = prev ? i - prev.i === 1 : false
		const similar =
			prev != null &&
			Math.abs(s.value - prev.value) / ((s.value + prev.value) / 2) <
				PAUSE_STITCH_VALUE_TOL
		if (prev && contiguous && gap < PAUSE_STITCH_MAX_GAP_SEC && similar) {
			// One physical rep split by a pause — extend the previous rep.
			prev.value =
				(prev.value * prev.durationSec + s.value * s.durationSec) /
				(prev.durationSec + s.durationSec)
			prev.durationSec += s.durationSec
			prev.endSec = s.endSec
			prev.i = i
		} else {
			reps.push({
				i0: i,
				i,
				startSec: s.startSec,
				endSec: s.endSec,
				durationSec: s.durationSec,
				value: s.value,
			})
		}
	}
	if (reps.length === 0) return null

	const candidates: Hypothesis[] = []
	const motif = mineMotif(segs, reps, classifier)
	if (motif) candidates.push(motif)
	const sustained = mineSustained(segs, reps, segmentation.movingSec)
	if (sustained) candidates.push(sustained)

	if (candidates.length === 0) return null
	return candidates.sort((a, b) => b.score - a.score)[0]!
}

/** The best k×(work+recovery) motif among duration/value-clustered reps. */
function mineMotif(
	segs: Segment[],
	reps: Rep[],
	classifier: Classifier,
): Hypothesis | null {
	if (reps.length < 2) return null
	const inv = classifier.inverted
	const easier = (a: number, b: number) =>
		inv
			? a >= b * (1 + ALTERNATION_EASIER_MARGIN)
			: a <= b * (1 - ALTERNATION_EASIER_MARGIN)

	// Cluster reps by duration (±tol) and value (±tol).
	const clusters: Rep[][] = []
	for (const w of reps) {
		const cl = clusters.find((c) => {
			const refDur = mean(c.map((x) => x.durationSec))
			const refVal = mean(c.map((x) => x.value))
			return (
				Math.abs(w.durationSec - refDur) / refDur <= REP_CLUSTER_DURATION_TOL &&
				Math.abs(w.value - refVal) / refVal <= REP_CLUSTER_VALUE_TOL
			)
		})
		if (cl) cl.push(w)
		else clusters.push([w])
	}

	let best: Hypothesis | null = null
	for (const cl of clusters) {
		if (cl.length < 2) continue
		const k = cl.length
		const durs = cl.map((x) => x.durationSec)
		const vals = cl.map((x) => x.value)
		const regularity = Math.max(0, 1 - cv(durs) * CV_DURATION_SHARPNESS)
		const intensityTightness = Math.max(
			0,
			1 - cv(vals) * CV_INTENSITY_SHARPNESS,
		)

		// Recoveries = segments strictly between consecutive reps; each must be
		// meaningfully easier than the rep it follows (value-based alternation).
		const recDurs: number[] = []
		let alternating = true
		for (let j = 0; j < cl.length - 1; j++) {
			const between = segs.slice(
				cl[j]!.i + 1,
				Math.max(cl[j]!.i + 1, cl[j + 1]!.i0),
			)
			if (
				between.length === 0 ||
				!between.every((s) => easier(s.value, cl[j]!.value))
			) {
				alternating = false
				break
			}
			recDurs.push(between.reduce((a, s) => a + s.durationSec, 0))
		}
		const alternation = alternating ? 1 : ALTERNATION_BROKEN

		const workDurMean = mean(durs)
		const recDurMean = recDurs.length ? mean(recDurs) : 0
		// Recovery-sanity gate: a recovery dwarfing the work is not an interval set.
		if (
			recDurMean > 0 &&
			recDurMean >
				Math.max(
					REC_SANITY_WORK_MULTIPLE * workDurMean,
					REC_SANITY_ABS_CEILING_SEC,
				)
		) {
			continue
		}

		const motifTime = workDurMean * k + recDurs.reduce((a, b) => a + b, 0)
		const spanTime = segs
			.slice(cl[0]!.i0, cl[cl.length - 1]!.i + 1)
			.reduce((a, s) => a + s.durationSec, 0)
		const coverage = spanTime > 0 ? Math.min(1, motifTime / spanTime) : 0
		// Minimum-coverage floor gate.
		if (coverage < MIN_MOTIF_COVERAGE) continue

		const kFactor = k >= K_FACTOR_STRONG ? 1 : K_FACTOR_WEAK_MULTIPLIER
		const w = MOTIF_SCORE_WEIGHTS
		const score =
			(w.regularity * regularity +
				w.intensityTightness * intensityTightness +
				w.alternation * alternation +
				w.coverage * coverage) *
			kFactor

		// Pool sibling reps' settled interiors when HR is the classifying channel
		// (ADR 0035): reps clustered as the same motif share a steady state, so a
		// rep too short to leave a stable interior on its own borrows its
		// cluster-mates' — the pooled median is a steadier label than any one short
		// rep's. Power/pace reps are already stable, so their mean value stands.
		const workValue =
			classifier.channel === 'heartrate'
				? (pooledInteriorMedian(segs, cl) ?? mean(vals))
				: mean(vals)
		const recBetween = segs.slice(
			cl[0]!.i + 1,
			Math.max(cl[0]!.i + 1, cl[1]!.i0),
		)
		const recValue = recBetween.length
			? mean(recBetween.map((s) => s.value))
			: null

		const workSteps: StepPlan[] = [
			{ role: 'work', durationSec: workDurMean, value: workValue },
		]
		if (recDurMean > 0 && recValue != null) {
			workSteps.push({
				role: 'recovery',
				durationSec: recDurMean,
				value: recValue,
			})
		}
		const { warmup, cooldown } = flankBlocks(
			segs,
			cl[0]!.i0,
			cl[cl.length - 1]!.i,
		)
		const hyp: Hypothesis = {
			kind: 'motif',
			blocks: [...warmup, { repeat: k, steps: workSteps }, ...cooldown],
			score,
			scoreParts: {
				k,
				regularity: round2(regularity),
				intensityTightness: round2(intensityTightness),
				alternation,
				coverage: round2(coverage),
			},
		}
		if (!best || hyp.score > best.score) best = hyp
	}
	return best
}

/** A single sustained elevated block — the no-repeats path that still clears the gate. */
function mineSustained(
	segs: Segment[],
	reps: Rep[],
	movingSec: number,
): Hypothesis | null {
	const longest = reps.reduce((a, b) => (b.durationSec > a.durationSec ? b : a))
	if (longest.durationSec < MIN_SUSTAINED_SEC) return null
	const coverage = movingSec > 0 ? longest.durationSec / movingSec : 0
	if (coverage < MIN_SUSTAINED_COVERAGE) return null

	const score =
		SUSTAINED_SCORE_BASE +
		SUSTAINED_SCORE_COVERAGE_WEIGHT * Math.min(1, coverage)
	const { warmup, cooldown } = flankBlocks(segs, longest.i0, longest.i)
	return {
		kind: 'sustained',
		blocks: [
			...warmup,
			{
				repeat: 1,
				steps: [
					{
						role: 'work',
						durationSec: longest.durationSec,
						value: longest.value,
					},
				],
			},
			...cooldown,
		],
		score,
		scoreParts: { coverage: round2(coverage) },
	}
}

const round2 = (n: number) => Math.round(n * 100) / 100
