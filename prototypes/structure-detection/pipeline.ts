/**
 * PROTOTYPE — throwaway (wayfinder #330, map #326). Delete or absorb.
 *
 * The #327-recommended segmentation pipeline, hand-rolled:
 *   1. split the stream at `null` pause gaps (never interpolate across)
 *   2. edge channel: power (bike) / median-filtered pace (run)
 *   3. rolling-median denoise
 *   4. PELT, L2 cost — exact changepoint detection with a dwell floor
 *   5. zone-band labelling from the athlete's recipe + threshold
 *   6. repeat-mining: cluster work segments, emit ranked candidate structures
 */

export type Channel = Array<number | null>

export type Stream = {
	resolutionSec: number
	timeSec: number[]
	power?: Channel
	heartrate?: Channel
	pace?: Channel
}

export type Knobs = {
	/** rolling-median window, samples (odd) */
	medianWindow: number
	/** minimum segment dwell, seconds — the anti-flicker floor */
	minSegSec: number
	/** PELT penalty = penaltyFactor · log(n), on the unit-variance signal */
	penaltyFactor: number
	/** merge adjacent segments whose means sit in the same zone band */
	mergeSameBand: boolean
}

export const DEFAULT_KNOBS: Knobs = {
	medianWindow: 5,
	minSegSec: 25,
	penaltyFactor: 8,
	mergeSameBand: true,
}

/** Display/analysis clamp for GPS pace spikes (sec/km). */
export const PACE_CLAMP: [number, number] = [120, 900]

// ---------------------------------------------------------------- utilities

const isNum = (v: number | null | undefined): v is number =>
	v != null && Number.isFinite(v)

export function rollingMedian(values: number[], window: number): number[] {
	const half = Math.floor(window / 2)
	return values.map((_, i) => {
		const lo = Math.max(0, i - half)
		const hi = Math.min(values.length, i + half + 1)
		const w = values.slice(lo, hi).sort((a, b) => a - b)
		const m = Math.floor(w.length / 2)
		return w.length % 2 ? w[m]! : (w[m - 1]! + w[m]!) / 2
	})
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// ------------------------------------------------------------ pause splits

/** Contiguous index ranges [start, end) where the edge channel has readings. */
export function splitAtPauses(edge: Channel): Array<[number, number]> {
	const blocks: Array<[number, number]> = []
	let start: number | null = null
	for (let i = 0; i <= edge.length; i++) {
		const real = i < edge.length && isNum(edge[i])
		if (real && start == null) start = i
		if (!real && start != null) {
			blocks.push([start, i])
			start = null
		}
	}
	return blocks
}

// -------------------------------------------------------------------- PELT

/**
 * Textbook PELT with L2 (piecewise-constant) cost (Killick et al. 2012).
 * Input is z-normalized so `penalty` is scale-free. Returns changepoint
 * indices (segment end positions, exclusive), last one = n.
 */
export function pelt(signal: number[], penalty: number, minSize: number): number[] {
	const n = signal.length
	if (n < 2 * minSize) return [n]
	// prefix sums for O(1) segment cost: cost(a,b) = ss - s²/len
	const s = new Float64Array(n + 1)
	const ss = new Float64Array(n + 1)
	for (let i = 0; i < n; i++) {
		s[i + 1] = s[i]! + signal[i]!
		ss[i + 1] = ss[i]! + signal[i]! * signal[i]!
	}
	const segCost = (a: number, b: number) => {
		const len = b - a
		const sum = s[b]! - s[a]!
		return ss[b]! - ss[a]! - (sum * sum) / len
	}

	const F = new Float64Array(n + 1).fill(Infinity)
	F[0] = -penalty
	const prev = new Int32Array(n + 1).fill(0)
	let candidates: number[] = [0]

	for (let t = minSize; t <= n; t++) {
		let best = Infinity
		let bestTau = 0
		for (const tau of candidates) {
			if (t - tau < minSize) continue
			const c = F[tau]! + segCost(tau, t) + penalty
			if (c < best) {
				best = c
				bestTau = tau
			}
		}
		F[t] = best
		prev[t] = bestTau
		// PELT prune: drop tau that can never win again
		candidates = candidates.filter(
			(tau) => t - tau < minSize || F[tau]! + segCost(tau, t) <= F[t]!,
		)
		candidates.push(t - minSize + 1 > 0 ? t - minSize + 1 : 0)
		candidates = [...new Set(candidates)].filter((tau) => tau <= t)
	}

	const cps: number[] = []
	let t = n
	while (t > 0) {
		cps.push(t)
		t = prev[t]!
	}
	return cps.reverse()
}

// ---------------------------------------------------------- zone labelling

export type ZoneBand = { label: string; minRatio: number; maxRatio?: number }

/** Ordered easy→hard, index = hardness rank. */
export type Recipe = {
	anchor: 'ftp' | 'thresholdPace' | 'lthr'
	/** ratio orientation: pace ratios are inverted (lower ratio = harder) */
	inverted: boolean
	zones: ZoneBand[]
}

export const COGGAN_POWER: Recipe = {
	anchor: 'ftp',
	inverted: false,
	zones: [
		{ label: 'Z1', minRatio: 0, maxRatio: 0.55 },
		{ label: 'Z2', minRatio: 0.56, maxRatio: 0.75 },
		{ label: 'Z3', minRatio: 0.76, maxRatio: 0.9 },
		{ label: 'Z4', minRatio: 0.91, maxRatio: 1.05 },
		{ label: 'Z5', minRatio: 1.06, maxRatio: 1.2 },
		{ label: 'Z6', minRatio: 1.21, maxRatio: 1.5 },
		{ label: 'Z7', minRatio: 1.51 },
	],
}

/** Daniels pace zones, reordered easy→hard (E, M, T, I, R). */
export const DANIELS_PACE: Recipe = {
	anchor: 'thresholdPace',
	inverted: true,
	zones: [
		{ label: 'E', minRatio: 1.29, maxRatio: 1.74 },
		{ label: 'M', minRatio: 1.15, maxRatio: 1.28 },
		{ label: 'T', minRatio: 1.0, maxRatio: 1.14 },
		{ label: 'I', minRatio: 0.88, maxRatio: 0.99 },
		{ label: 'R', minRatio: 0.75, maxRatio: 0.87 },
	],
}

/** Hardness rank (zone index) for a measured value against the anchor.
 * Boundary gaps in the recipes (e.g. Daniels M max 1.28 / E min 1.29) are
 * treated as cutoffs so no ratio falls between bands. */
export function bandIndex(recipe: Recipe, value: number, anchor: number): number {
	const ratio = value / anchor
	if (recipe.inverted) {
		// pace: larger ratio = slower = easier; classify by each band's fast edge
		for (let i = 0; i < recipe.zones.length; i++) {
			if (ratio >= recipe.zones[i]!.minRatio) return i
		}
		return recipe.zones.length - 1
	}
	for (let i = 0; i < recipe.zones.length; i++) {
		const z = recipe.zones[i]!
		if (ratio <= (z.maxRatio ?? Infinity)) return i
	}
	return recipe.zones.length - 1
}

// ----------------------------------------------------------------- segments

export type Segment = {
	/** sample index range [start, end) into the full stream */
	start: number
	end: number
	startSec: number
	endSec: number
	durationSec: number
	/** mean of the raw (unfiltered) edge channel */
	value: number
	band: number
	bandLabel: string
	/** mean HR skipping the first ~30 s (lag dodge); null if no HR channel */
	hr: number | null
}

export type Analysis = {
	segments: Segment[]
	pauses: Array<{ startSec: number; endSec: number }>
	candidates: Candidate[]
	knobs: Knobs
	edgeChannel: 'power' | 'pace'
	anchor: number
	recipe: Recipe
}

export function analyze(
	stream: Stream,
	discipline: 'run' | 'bike',
	thresholds: { ftp?: number; thresholdPaceSecPerKm?: number },
	knobs: Knobs = DEFAULT_KNOBS,
): Analysis | null {
	const res = stream.resolutionSec
	const edgeName = discipline === 'bike' ? 'power' : 'pace'
	const recipe = discipline === 'bike' ? COGGAN_POWER : DANIELS_PACE
	const anchor =
		discipline === 'bike' ? thresholds.ftp : thresholds.thresholdPaceSecPerKm
	const edge = stream[edgeName]
	if (!edge || !anchor) return null

	const minSize = Math.max(2, Math.round(knobs.minSegSec / res))
	const blocks = splitAtPauses(edge)
	const segments: Segment[] = []
	const pauses: Array<{ startSec: number; endSec: number }> = []

	let lastEnd: number | null = null
	for (const [bs, be] of blocks) {
		if (lastEnd != null)
			pauses.push({
				startSec: stream.timeSec[lastEnd - 1]!,
				endSec: stream.timeSec[bs]!,
			})
		lastEnd = be

		let raw = edge.slice(bs, be) as number[]
		if (edgeName === 'pace')
			raw = raw.map((v) => Math.max(PACE_CLAMP[0], Math.min(PACE_CLAMP[1], v)))
		const filtered = rollingMedian(raw, knobs.medianWindow)
		// robust normalization (median/MAD) so GPS spikes don't deflate the
		// penalty's scale the way plain z-normalization did
		const srt = [...filtered].sort((a, b) => a - b)
		const med = srt[Math.floor(srt.length / 2)]!
		const madSrt = filtered
			.map((v) => Math.abs(v - med))
			.sort((a, b) => a - b)
		const scale = 1.4826 * madSrt[Math.floor(madSrt.length / 2)]! || 1
		const z = filtered.map((v) => (v - med) / scale)
		const penalty = knobs.penaltyFactor * Math.log(z.length)
		const cps = pelt(z, penalty, minSize)

		let segStart = 0
		for (const cp of cps) {
			const start = bs + segStart
			const end = bs + cp
			const value = mean(raw.slice(segStart, cp))
			const band = bandIndex(recipe, value, anchor)
			// HR mean skipping the first 30 s of the segment (lag)
			let hr: number | null = null
			const hrCh = stream.heartrate
			if (hrCh) {
				const skip = Math.min(Math.round(30 / res), Math.floor((cp - segStart) / 2))
				const hrVals = hrCh.slice(start + skip, end).filter(isNum)
				hr = hrVals.length ? Math.round(mean(hrVals)) : null
			}
			segments.push({
				start,
				end,
				startSec: stream.timeSec[start]!,
				endSec: stream.timeSec[end - 1]! + res,
				durationSec: (cp - segStart) * res,
				value,
				band,
				bandLabel: recipe.zones[band]!.label,
				hr,
			})
			segStart = cp
		}
	}

	const merged = knobs.mergeSameBand
		? mergeCloseValues(segments, recipe.inverted)
		: segments
	const candidates = mineCandidates(merged, recipe, anchor)
	return {
		segments: merged,
		pauses,
		candidates,
		knobs,
		edgeChannel: edgeName,
		anchor,
		recipe,
	}
}

/**
 * Merge adjacent segments whose means are close in *value* (< 6 % relative).
 * Zone bands are deliberately NOT the merge criterion: a mis-set threshold
 * makes real reps straddle a band boundary, and a band-based merge then erases
 * structure PELT correctly found. Bands stay as labels only.
 */
function mergeCloseValues(segs: Segment[], _inverted: boolean): Segment[] {
	const out: Segment[] = []
	for (const s of segs) {
		const last = out[out.length - 1]
		const close =
			last != null &&
			Math.abs(last.value - s.value) / ((last.value + s.value) / 2) < 0.06
		// only merge across contiguous samples (not across a pause)
		if (last && close && last.end === s.start) {
			const total = last.durationSec + s.durationSec
			last.value =
				(last.value * last.durationSec + s.value * s.durationSec) / total
			last.durationSec = total
			last.end = s.end
			last.endSec = s.endSec
			last.hr = s.hr ?? last.hr
		} else {
			out.push({ ...s })
		}
	}
	return out
}

// ------------------------------------------------------------ repeat mining

export type CandidateStep = {
	role: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'steady'
	durationSec: number
	bandLabel: string
	value: number
}

export type Candidate = {
	/** human notation, e.g. "warm-up 12:30 E → 4 × (4:00 I + 2:00 E) → cool-down" */
	notation: string
	score: number
	scoreParts: Record<string, number>
	blocks: Array<{ repeat: number; steps: CandidateStep[] }>
	/** which segment indices the motif's work reps cover (for highlighting) */
	workSegs: number[]
}

const fmtDur = (sec: number) => {
	const m = Math.floor(sec / 60)
	const s = Math.round(sec % 60)
	return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`
}

/**
 * Mine k×(work+recovery) motifs — value-based, not band-based: a mis-set
 * threshold shifts every band, but the *relative* contrast between work and
 * easy levels survives. Work = segments meaningfully harder than the
 * activity's easy level (duration-weighted 30th-percentile value). Cluster
 * work segments by duration tolerance, stitch reps split by a pause, look for
 * alternation, score regularity + coverage with k and recovery-sanity guards.
 * Always emits a "steady/no-structure" candidate so ranking is never empty.
 */
export function mineCandidates(
	segs: Segment[],
	recipe: Recipe,
	anchor: number,
): Candidate[] {
	if (segs.length === 0) return []
	const inverted = recipe.inverted
	const total = segs.reduce((a, s) => a + s.durationSec, 0)

	// duration-weighted 2-means over segment values → easy vs hard levels.
	// A percentile fails here: real recoveries are often short walks far easier
	// than the warmup, dragging any quantile onto the work level.
	const kmeans2 = () => {
		let cEasy = inverted
			? Math.max(...segs.map((s) => s.value))
			: Math.min(...segs.map((s) => s.value))
		let cHard = inverted
			? Math.min(...segs.map((s) => s.value))
			: Math.max(...segs.map((s) => s.value))
		let assign: boolean[] = []
		for (let iter = 0; iter < 12; iter++) {
			assign = segs.map(
				(s) => Math.abs(s.value - cHard) < Math.abs(s.value - cEasy),
			)
			const wsum = (pick: boolean) => {
				let num = 0
				let den = 0
				segs.forEach((s, i) => {
					if (assign[i] === pick) {
						num += s.value * s.durationSec
						den += s.durationSec
					}
				})
				return den ? num / den : null
			}
			const ne = wsum(false)
			const nh = wsum(true)
			if (ne == null || nh == null) break
			if (ne === cEasy && nh === cHard) break
			cEasy = ne
			cHard = nh
		}
		return { cEasy, cHard, assign }
	}
	const { cEasy, cHard, assign } = kmeans2()
	// Two gates decide whether there is any structure to mine:
	//  1. value margin — the two levels must actually be apart (pace ≥8 %,
	//     power ≥15 %), else 2-means just split noise.
	//  2. zone-band separation — the hard level must sit at least one zone
	//     above the easy level. This is the real discriminator: GPS pace wobble
	//     on an easy run clears the value margin but stays inside one zone,
	//     while a genuine interval crosses a zone boundary. Threshold-dependent
	//     by design (detection labels bands anyway) and honestly degrades when
	//     thresholds are missing (analyze() returns null without an anchor).
	const margin = Math.abs(cEasy - cHard) / ((cEasy + cHard) / 2)
	const marginGate = inverted ? 0.08 : 0.15
	const bandSep = bandIndex(recipe, cHard, anchor) - bandIndex(recipe, cEasy, anchor)
	const structured = margin >= marginGate && bandSep >= 1
	const isWork = (v: number, i?: number) =>
		structured &&
		(i != null
			? assign[i]!
			: Math.abs(v - cHard) < Math.abs(v - cEasy))

	// stitch reps split only by a pause (< 3 min gap, similar value) back into
	// one logical rep before clustering — the ground-truth mid-rep pause case
	type Rep = {
		s: Segment
		/** first and last constituent segment indices (differ when stitched) */
		i0: number
		i: number
		durationSec: number
		value: number
	}
	const workRaw = segs
		.map((s, i) => ({ s, i }))
		.filter(({ s, i }) => isWork(s.value, i) && s.durationSec >= 30)
	const workIdx: Rep[] = []
	for (const w of workRaw) {
		const prev = workIdx[workIdx.length - 1]
		const gap = prev ? w.s.startSec - prev.s.endSec : Infinity
		const contiguousIdx = prev ? w.i - prev.i === 1 : false
		const similar =
			prev &&
			Math.abs(w.s.value - prev.value) / ((w.s.value + prev.value) / 2) < 0.08
		if (prev && contiguousIdx && gap < 180 && similar) {
			// same physical rep, split by a pause: extend
			prev.value =
				(prev.value * prev.durationSec + w.s.value * w.s.durationSec) /
				(prev.durationSec + w.s.durationSec)
			prev.durationSec += w.s.durationSec
			prev.s = { ...prev.s, end: w.s.end, endSec: w.s.endSec }
			prev.i = w.i
		} else {
			workIdx.push({
				s: w.s,
				i0: w.i,
				i: w.i,
				durationSec: w.s.durationSec,
				value: w.s.value,
			})
		}
	}

	const candidates: Candidate[] = []

	// --- steady candidate (always present)
	{
		const dominant = segs.reduce((a, b) =>
			a.durationSec >= b.durationSec ? a : b,
		)
		candidates.push({
			notation: `steady ${fmtDur(total)} @ ${dominant.bandLabel}`,
			score: workIdx.length === 0 ? 0.6 : 0.15,
			scoreParts: { steadyPrior: workIdx.length === 0 ? 0.6 : 0.15 },
			blocks: [
				{
					repeat: 1,
					steps: [
						{
							role: 'steady',
							durationSec: total,
							bandLabel: dominant.bandLabel,
							value: dominant.value,
						},
					],
				},
			],
			workSegs: [],
		})
	}

	if (workIdx.length >= 2) {
		// cluster stitched reps by duration (±30 %) and value similarity (±12 %)
		const clusters: Rep[][] = []
		for (const w of workIdx) {
			const c = clusters.find((cl) => {
				const refDur = mean(cl.map((x) => x.durationSec))
				const refVal = mean(cl.map((x) => x.value))
				return (
					Math.abs(w.durationSec - refDur) / refDur <= 0.3 &&
					Math.abs(w.value - refVal) / refVal <= 0.12
				)
			})
			if (c) c.push(w)
			else clusters.push([w])
		}

		for (const cl of clusters) {
			if (cl.length < 2) continue
			const k = cl.length
			const durs = cl.map((x) => x.durationSec)
			const vals = cl.map((x) => x.value)
			const cv = (xs: number[]) => {
				const m = mean(xs)
				return m ? Math.sqrt(mean(xs.map((v) => (v - m) ** 2))) / m : 1
			}
			const regularity = Math.max(0, 1 - cv(durs) * 2) // cv 0 → 1, cv .5 → 0
			const intensityTightness = Math.max(0, 1 - cv(vals) * 4)

			// recoveries = segments strictly between consecutive reps; every
			// between-segment must be meaningfully easier than the rep (value-based)
			const recDurs: number[] = []
			let alternating = true
			for (let j = 0; j < cl.length - 1; j++) {
				const a = cl[j]!.i
				const b = cl[j + 1]!.i0
				const between = segs.slice(a + 1, Math.max(a + 1, b))
				const easier = (s: Segment) =>
					inverted
						? s.value >= cl[j]!.value * 1.05
						: s.value <= cl[j]!.value * 0.95
				if (between.length === 0 || !between.every(easier)) {
					alternating = false
					break
				}
				recDurs.push(between.reduce((x, s) => x + s.durationSec, 0))
			}
			const alternation = alternating ? 1 : 0.3

			const motifTime =
				durs.reduce((a, b) => a + b, 0) + recDurs.reduce((a, b) => a + b, 0)
			const firstIdx = cl[0]!.i0
			const lastIdx = cl[cl.length - 1]!.i
			const spanTime = segs
				.slice(firstIdx, lastIdx + 1)
				.reduce((a, s) => a + s.durationSec, 0)
			const coverage = spanTime > 0 ? Math.min(1, motifTime / spanTime) : 0

			// guards: k = 2 is weak evidence; a "recovery" dwarfing the work
			// (e.g. 33 min between two 36 s spikes) is not an interval set
			const workDurMean = mean(durs)
			const recDurMean = recDurs.length ? mean(recDurs) : 0
			const kFactor = k >= 3 ? 1 : 0.55
			const recSanity =
				recDurMean === 0 || recDurMean <= Math.max(3 * workDurMean, 600)
					? 1
					: 0.3

			const score =
				(0.35 * regularity +
					0.2 * intensityTightness +
					0.25 * alternation +
					0.2 * coverage) *
				kFactor *
				recSanity

			const workDur = workDurMean
			const recDur = recDurMean
			const bandLabel = cl[0]!.s.bandLabel
			const recBand = segs[cl[0]!.i + 1]

			const warmupTime = segs
				.slice(0, firstIdx)
				.reduce((a, s) => a + s.durationSec, 0)
			const cooldownTime = segs
				.slice(lastIdx + 1)
				.reduce((a, s) => a + s.durationSec, 0)

			const parts: string[] = []
			if (warmupTime >= 120) parts.push(`warm-up ${fmtDur(warmupTime)}`)
			parts.push(
				recDur
					? `${k} × (${fmtDur(workDur)} @ ${bandLabel} + ${fmtDur(recDur)} ${recBand?.bandLabel ?? 'easy'})`
					: `${k} × ${fmtDur(workDur)} @ ${bandLabel}`,
			)
			if (cooldownTime >= 120) parts.push(`cool-down ${fmtDur(cooldownTime)}`)

			const blocks: Candidate['blocks'] = []
			if (warmupTime >= 120)
				blocks.push({
					repeat: 1,
					steps: [
						{
							role: 'warmup',
							durationSec: warmupTime,
							bandLabel: segs[0]!.bandLabel,
							value: segs[0]!.value,
						},
					],
				})
			const workSteps: CandidateStep[] = [
				{ role: 'work', durationSec: workDur, bandLabel, value: mean(vals) },
			]
			if (recDur)
				workSteps.push({
					role: 'recovery',
					durationSec: recDur,
					bandLabel: recBand?.bandLabel ?? '?',
					value: recBand?.value ?? 0,
				})
			blocks.push({ repeat: k, steps: workSteps })
			if (cooldownTime >= 120)
				blocks.push({
					repeat: 1,
					steps: [
						{
							role: 'cooldown',
							durationSec: cooldownTime,
							bandLabel: segs[segs.length - 1]!.bandLabel,
							value: segs[segs.length - 1]!.value,
						},
					],
				})

			candidates.push({
				notation: parts.join(' → '),
				score: Math.round(score * 100) / 100,
				scoreParts: {
					regularity: Math.round(regularity * 100) / 100,
					intensityTightness: Math.round(intensityTightness * 100) / 100,
					alternation,
					coverage: Math.round(coverage * 100) / 100,
				},
				blocks,
				workSegs: cl.map((x) => x.i),
			})
		}
	}

	return candidates.sort((a, b) => b.score - a.score).slice(0, 3)
}
