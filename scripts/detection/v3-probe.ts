/* eslint-disable */
/**
 * EVAL-ONLY. NOT THE SHIPPED ENGINE. NOTHING IN app/ MAY IMPORT THIS.
 *
 * The throwaway detection-v3 prototype from ticket #609, copied unchanged
 * (apart from this header and the `V3` options at the end) from
 * `origin/research/structured-workouts:docs/wayfinder/structured-workouts/609-probe/v3.ts`
 * so `npm run detection:eval` can score it beside the shipped v2 engine on
 * the FIT corpus (#625) without merging the research branch. Every candidate
 * change is a flag; `V3` is the combination `609-detection-v3.md` decided
 * (`609-probe/v3final.ts`). Delete this file when v3 is built for real.
 */
import { type ActivityStream } from '#app/utils/activity-stream.ts'
import {
	type Classifier,
	resolveClassifier,
} from '#app/utils/structure-detection/classify.ts'
import { PACE_CLAMP_SEC_PER_KM } from '#app/utils/structure-detection/constants.ts'
import { gradeConfidence } from '#app/utils/structure-detection/grade.ts'
import { mineStructure } from '#app/utils/structure-detection/mine.ts'
import {
	type Segment,
	buildSegments,
} from '#app/utils/structure-detection/segments.ts'
import {
	isNum,
	median,
	peltMulti,
	robustNormalize,
	rollingMedian,
	splitAtPauses,
	trimmedMean,
} from '#app/utils/structure-detection/signal.ts'
import {
	type DetectedStructure,
	type DetectionGrade,
	type Lap,
} from '#app/utils/structure-detection/types.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/resolve.ts'

export type TypedLap = Lap & {
	intensity: 'warmup' | 'active' | 'rest' | 'cooldown'
	stepIndex: number
}

export type Opts = {
	/** (a) build from typed workout-step laps when present. */
	typedLaps: boolean
	/** Segmentation: 'v2' = shipped buildSegments; 'tuned' = the knobs below. */
	seg: 'v2' | 'tuned'
	medianWindow: number
	penaltyFactor: number
	minSegSec: number
	/** (d) edge on speed instead of pace, and average pace as speed. */
	speed: boolean
	/** (b) 'v2' = 2-means + band gate; 'contrast' = contrast + periodicity. */
	gate: 'v2' | 'contrast'
	/** (c) 'v2' = ±12 % cluster, one cluster, mean, first recovery; 'every' = every rep. */
	emit: 'v2' | 'every'
	/** contrast gate margins (relative). */
	repMargin: number
	flankMargin: number
	walkFrac: number
	maxDurCv: number
	noiseScale: boolean
	minK: number
	requireFlanks: boolean
	refine: boolean
	lapsBoth: boolean
	/** allow a single sustained block to claim structure. */
	sustained: boolean
	/** (4) snap edges to the steepest power step within ±1 sample. */
	snap: boolean
	/** trim rep 1 / last rep that swallowed a flank. */
	trimFlankReps: boolean
}

export const V2_OPTS: Opts = {
	typedLaps: false,
	seg: 'v2',
	medianWindow: 5,
	penaltyFactor: 8,
	minSegSec: 10,
	speed: false,
	gate: 'v2',
	emit: 'v2',
	repMargin: 0.15,
	flankMargin: 0.08,
	walkFrac: 0.65,
	maxDurCv: 0.3,
	sustained: true,
	snap: false,
	trimFlankReps: false,
	noiseScale: false,
	minK: 2,
	requireFlanks: false,
	refine: false,
	lapsBoth: false,
}

export type Interval = {
	role: 'warmup' | 'work' | 'recovery' | 'cooldown'
	startSec: number
	endSec: number
	value: number
	set: number
}

export type V3Result = {
	detected: DetectedStructure | null
	intervals: Interval[]
	kind?: string
	parts?: Record<string, number>
}

type Seg = {
	startSec: number
	endSec: number
	dur: number
	/** hardness on the edge channel: W or m/s (higher = harder). */
	h: number
	/** value on the classifying channel (W, s/km or bpm). */
	value: number
	start: number
	end: number
}

const clamp = (p: number) =>
	Math.max(PACE_CLAMP_SEC_PER_KM[0], Math.min(PACE_CLAMP_SEC_PER_KM[1], p))

function hardnessChannel(stream: ActivityStream): Array<number | null> | null {
	if (stream.power && stream.power.filter(isNum).length > 2) return stream.power
	if (stream.pace)
		return stream.pace.map((p) => (isNum(p) && p > 0 ? 1000 / clamp(p) : null))
	return null
}

function classifyValue(
	stream: ActivityStream,
	cl: Classifier,
	start: number,
	end: number,
	speed: boolean,
): number | null {
	const raw =
		cl.channel === 'power'
			? stream.power
			: cl.channel === 'pace'
				? stream.pace
				: stream.heartrate
	if (!raw) return null
	let xs = raw.slice(start, end).filter(isNum)
	if (!xs.length) return null
	if (cl.channel === 'pace') {
		xs = xs.map(clamp)
		if (speed) {
			const sp = xs.map((p) => 1000 / p)
			return 1000 / (sp.reduce((a, b) => a + b, 0) / sp.length)
		}
	}
	return trimmedMean(
		rollingMedian(
			xs,
			Math.min(5, xs.length % 2 ? xs.length : xs.length - 1 || 1),
		),
	)
}

function meanOf(xs: Array<number | null>): number | null {
	const r = xs.filter(isNum)
	return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null
}

function idxAtOrAfter(t: number[], sec: number) {
	for (let i = 0; i < t.length; i++) if (t[i]! >= sec) return i
	return t.length
}

function mkSeg(
	stream: ActivityStream,
	cl: Classifier,
	hc: Array<number | null>,
	start: number,
	end: number,
	o: Opts,
	startSec?: number,
	endSec?: number,
): Seg | null {
	const res = stream.resolutionSec
	const h = meanOf(hc.slice(start, end))
	const value = classifyValue(stream, cl, start, end, o.speed)
	if (h == null || value == null) return null
	const s0 = startSec ?? stream.timeSec[start]!
	const s1 = endSec ?? s0 + (end - start) * res
	return { start, end, startSec: s0, endSec: s1, dur: s1 - s0, h, value }
}

/** Tuned stream segmentation (d). */
function tunedSegments(
	stream: ActivityStream,
	cl: Classifier,
	hc: Array<number | null>,
	o: Opts,
): Seg[] {
	const res = stream.resolutionSec
	const chans: Array<Array<number | null>> = []
	if (stream.power && stream.power.filter(isNum).length > 2)
		chans.push(stream.power)
	if (stream.pace)
		chans.push(
			o.speed
				? stream.pace.map((p) => (isNum(p) && p > 0 ? 1000 / clamp(p) : null))
				: stream.pace.map((p) => (isNum(p) ? clamp(p) : null)),
		)
	const any = stream.timeSec.map((_, i) =>
		chans.some((c) => isNum(c[i])) ? 1 : null,
	)
	const segs: Seg[] = []
	for (const [bs, be] of splitAtPauses(any)) {
		const sigs: number[][] = []
		for (const c of chans) {
			const sl = c.slice(bs, be)
			const real = sl.filter(isNum)
			if (real.length < 2) continue
			const fill = median(real)
			const filled = sl.map((v) => (isNum(v) ? v : fill))
			const den =
				o.medianWindow > 1 ? rollingMedian(filled, o.medianWindow) : filled
			if (o.noiseScale) {
				// scale by sample-to-sample noise (MAD of first differences / √2), so
				// the penalty is in noise units, not in units of the session's spread
				const d = den.slice(1).map((v, i) => Math.abs(v - den[i]!))
				const sd = (1.4826 * median(d)) / Math.SQRT2 || 1
				const m = median(den)
				sigs.push(den.map((v) => (v - m) / sd))
			} else sigs.push(robustNormalize(den))
		}
		if (!sigs.length) continue
		const minSize = Math.max(1, Math.round(o.minSegSec / res))
		const pen = o.penaltyFactor * Math.log(be - bs) * sigs.length
		let s = 0
		for (const cp of peltMulti(sigs, pen, minSize)) {
			const g = mkSeg(stream, cl, hc, bs + s, bs + cp, o)
			if (g) segs.push(g)
			s = cp
		}
	}
	return segs
}

function v2Segments(
	stream: ActivityStream,
	cl: Classifier,
	hc: Array<number | null>,
	laps: Lap[] | undefined,
	o: Opts,
): { segs: Seg[]; v2: Segment[]; movingSec: number } | null {
	const sg = buildSegments(stream, 'run', cl, laps)
	if (!sg) return null
	const segs = sg.segments.map((s) => {
		const h = meanOf(hc.slice(s.start, s.end)) ?? 0
		const value = o.speed
			? (classifyValue(stream, cl, s.start, s.end, true) ?? s.value)
			: s.value
		return {
			start: s.start,
			end: s.end,
			startSec: s.startSec,
			endSec: s.endSec,
			dur: s.durationSec,
			h,
			value,
		}
	})
	return { segs, v2: sg.segments, movingSec: sg.movingSec }
}

function lapSegments(
	stream: ActivityStream,
	cl: Classifier,
	hc: Array<number | null>,
	laps: Lap[],
	o: Opts,
): Seg[] {
	const out: Seg[] = []
	for (const l of laps) {
		const a = idxAtOrAfter(stream.timeSec, l.startSec)
		const b = idxAtOrAfter(stream.timeSec, l.endSec)
		if (b <= a) continue
		const g = mkSeg(stream, cl, hc, a, b, o, l.startSec, l.endSec)
		if (g) out.push(g)
	}
	return out
}

// ---------------------------------------------------------------------------
// Output helpers

function toDetected(
	cl: Classifier,
	intervals: Interval[],
	t0: number,
	grade: DetectionGrade,
): DetectedStructure {
	// Structure as it would be materialized: warm-up, one repeat block per set
	// (median work / recovery), series rests, cool-down. Flanks in elapsed time
	// so the drawn edges line up with the stream.
	const blocks: Array<{ repeatCount: number; steps: any[] }> = []
	const step = (dur: number, v: number) => ({
		kind: 'cardio',
		discipline: 'run',
		durationSec: Math.max(1, Math.round(dur)),
		intensity: cl.measuredTarget(v),
	})
	const work = intervals.filter((i) => i.role === 'work')
	const sets = [...new Set(work.map((w) => w.set))]
	let cursor = t0
	const firstWork = work[0]!
	if (firstWork.startSec - t0 > 0) {
		blocks.push({
			repeatCount: 1,
			steps: [step(firstWork.startSec - t0, intervals[0]!.value)],
		})
		cursor = firstWork.startSec
	}
	for (const s of sets) {
		const ws = work.filter((w) => w.set === s)
		const recs = intervals.filter((i) => i.role === 'recovery' && i.set === s)
		const wd = median(ws.map((w) => w.endSec - w.startSec))
		const wv = median(ws.map((w) => w.value))
		const steps = [step(wd, wv)]
		if (recs.length)
			steps.push(
				step(
					median(recs.map((r) => r.endSec - r.startSec)),
					median(recs.map((r) => r.value)),
				),
			)
		if (ws.length === 1)
			blocks.push({
				repeatCount: 1,
				steps: [step(ws[0]!.endSec - ws[0]!.startSec, wv)],
			})
		else blocks.push({ repeatCount: ws.length, steps })
		cursor = ws[ws.length - 1]!.endSec
		const nextSet = work.find((w) => w.set > s)
		if (nextSet) {
			blocks.push({
				repeatCount: 1,
				steps: [step(nextSet.startSec - cursor, wv * 0.8)],
			})
		}
	}
	const cd = intervals.filter((i) => i.role === 'cooldown')
	if (cd.length)
		blocks.push({
			repeatCount: 1,
			steps: [step(cd[cd.length - 1]!.endSec - cursor, cd[0]!.value)],
		})
	return { structure: { discipline: 'run', blocks } as any, confidence: grade }
}

function intervalsFromV2(
	blocks: {
		repeat: number
		steps: { role: string; durationSec: number; value: number }[]
	}[],
	t0: number,
): Interval[] {
	const out: Interval[] = []
	let t = t0
	for (const b of blocks)
		for (let r = 0; r < b.repeat; r++)
			for (const s of b.steps) {
				out.push({
					role: s.role as any,
					startSec: t,
					endSec: t + s.durationSec,
					value: s.value,
					set: 0,
				})
				t += s.durationSec
			}
	return out
}

// ---------------------------------------------------------------------------
// (a) typed laps

function fromTypedLaps(
	stream: ActivityStream,
	cl: Classifier,
	hc: Array<number | null>,
	laps: TypedLap[],
	o: Opts,
): V3Result | null {
	const actives = laps.filter((l) => l.intensity === 'active')
	if (actives.length < 2) return null
	const intervals: Interval[] = []
	// Group: a run of active laps sharing a step index (or, without one, a
	// duration within 10 % / 5 s), separated only by rest laps, is one set.
	let set = 0
	let prevActive: TypedLap | null = null
	for (const l of laps) {
		const a = idxAtOrAfter(stream.timeSec, l.startSec)
		const b = idxAtOrAfter(stream.timeSec, l.endSec)
		const v = classifyValue(stream, cl, a, b, o.speed) ?? 0
		if (l.intensity === 'active') {
			if (prevActive) {
				const same = prevActive.stepIndex === l.stepIndex
				if (!same) set++
			}
			prevActive = l
			intervals.push({
				role: 'work',
				startSec: l.startSec,
				endSec: l.endSec,
				value: v,
				set,
			})
		} else if (l.intensity === 'rest') {
			intervals.push({
				role: 'recovery',
				startSec: l.startSec,
				endSec: l.endSec,
				value: v,
				set,
			})
		} else {
			intervals.push({
				role: l.intensity,
				startSec: l.startSec,
				endSec: l.endSec,
				value: v,
				set,
			})
		}
	}
	const grade: DetectionGrade = cl.hrCapped ? 'medium' : 'high'
	return {
		detected: toDetected(cl, intervals, stream.timeSec[0] ?? 0, grade),
		intervals,
		kind: 'typed',
	}
}

// ---------------------------------------------------------------------------
// (b) + (c) contrast + periodicity miner, every rep emitted

type Run = {
	a: number
	b: number
	startSec: number
	endSec: number
	dur: number
	h: number
	value: number
	walk: boolean
	work: boolean
}

function mergeRuns(
	segs: Seg[],
	isW: (s: Seg) => boolean,
	walkH: number,
): Run[] {
	const runs: Run[] = []
	segs.forEach((s, i) => {
		const w = isW(s)
		const last = runs[runs.length - 1]
		const contiguous = last && Math.abs(s.startSec - last.endSec) < 1e-6 + 30
		if (last && last.work === w && contiguous) {
			last.h = (last.h * last.dur + s.h * s.dur) / (last.dur + s.dur)
			last.value =
				(last.value * last.dur + s.value * s.dur) / (last.dur + s.dur)
			last.dur += s.dur
			last.endSec = s.endSec
			last.b = i
		} else {
			runs.push({
				a: i,
				b: i,
				startSec: s.startSec,
				endSec: s.endSec,
				dur: s.dur,
				h: s.h,
				value: s.value,
				walk: s.h < walkH,
				work: w,
			})
		}
	})
	return runs
}

const cvOf = (xs: number[]) => {
	if (xs.length < 2) return 0
	const m = xs.reduce((a, b) => a + b, 0) / xs.length
	return m
		? Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / xs.length) / m
		: 1
}

function weightedMedian(items: Array<{ v: number; w: number }>): number | null {
	const s = items.filter((x) => x.w > 0).sort((a, b) => a.v - b.v)
	const tot = s.reduce((a, x) => a + x.w, 0)
	if (!tot) return null
	let acc = 0
	for (const x of s) {
		acc += x.w
		if (acc >= tot / 2) return x.v
	}
	return s[s.length - 1]!.v
}

type Chain = {
	reps: Run[]
	recs: Run[]
	score: number
	parts: Record<string, number>
}

function mineContrast(
	segs: Seg[],
	o: Opts,
	gateFn: ((s: Seg) => boolean) | null,
): Chain | null {
	if (segs.length < 3) return null
	const sessionMed = weightedMedian(segs.map((s) => ({ v: s.h, w: s.dur })))!
	const walkH = o.walkFrac * sessionMed
	const taus = gateFn
		? [null]
		: [...new Set(segs.map((s) => s.h))].sort((a, b) => a - b)
	let best: Chain | null = null
	for (const tau of taus) {
		const isW = gateFn ?? ((s: Seg) => s.h >= tau! && s.h >= walkH)
		const runs = mergeRuns(segs, isW, walkH)
		// work runs shorter than 20 s are noise, fold them into easy
		const ws = runs
			.map((r, i) => ({ r, i }))
			.filter(({ r }) => r.work && r.dur >= 20)
		// chains of consecutive work runs where everything between is easier by the margin
		let cur: { reps: Run[]; recs: Run[] } = { reps: [], recs: [] }
		const chains: Array<{ reps: Run[]; recs: Run[] }> = []
		for (let j = 0; j < ws.length; j++) {
			const { r, i } = ws[j]!
			if (cur.reps.length === 0) {
				cur.reps.push(r)
				continue
			}
			const prev = cur.reps[cur.reps.length - 1]!
			const prevI = ws[j - 1]!.i
			const between = runs.slice(prevI + 1, i)
			const recDur = r.startSec - prev.endSec
			const recH = between.length
				? between.reduce((a, x) => a + x.h * x.dur, 0) /
					Math.max(
						1,
						between.reduce((a, x) => a + x.dur, 0),
					)
				: prev.h
			const meanRep = cur.reps.reduce((a, x) => a + x.dur, 0) / cur.reps.length
			const okRec =
				between.length > 0 &&
				recH * (1 + o.repMargin) <= Math.min(prev.h, r.h) &&
				recDur <= Math.max(3 * meanRep, 240)
			const okDur =
				Math.abs(r.dur - meanRep) / meanRep <= 0.6 || cur.reps.length === 1
			if (okRec && okDur) {
				cur.reps.push(r)
				cur.recs.push({
					...between[0]!,
					startSec: prev.endSec,
					endSec: r.startSec,
					dur: recDur,
					h: recH,
				})
			} else {
				chains.push(cur)
				cur = { reps: [r], recs: [] }
			}
		}
		if (cur.reps.length) chains.push(cur)
		for (const ch of chains) {
			if (ch.reps.length < o.minK) continue
			const c = scoreChain(ch, segs, walkH, o)
			if (c && (!best || c.score > best.score)) best = c
		}
	}
	return best
}

function scoreChain(
	ch: { reps: Run[]; recs: Run[] },
	segs: Seg[],
	walkH: number,
	o: Opts,
): Chain | null {
	const reps = ch.reps
	const k = reps.length
	const durs = reps.map((r) => r.dur)
	// ignore the first / last rep in the duration CV (they absorb flank ramps)
	const inner = k > 4 ? durs.slice(1, -1) : durs
	const durCv = cvOf(inner)
	if (durCv > o.maxDurCv) return null
	const repH = weightedMedian(reps.map((r) => ({ v: r.h, w: r.dur })))!
	const recH = weightedMedian(ch.recs.map((r) => ({ v: r.h, w: r.dur })))!
	const contrast = repH / recH
	if (contrast < 1 + o.repMargin) return null
	// flanks: moving (non-walk) time outside the chain span
	const s0 = reps[0]!.startSec
	const s1 = reps[k - 1]!.endSec
	const flank = segs.filter(
		(s) => (s.endSec <= s0 || s.startSec >= s1) && s.h >= walkH,
	)
	const flankDur = flank.reduce((a, s) => a + s.dur, 0)
	const flankH = weightedMedian(flank.map((s) => ({ v: s.h, w: s.dur })))
	let flankContrast = Infinity
	if (flankH != null && flankDur >= 120) {
		flankContrast = repH / flankH
		if (flankContrast < 1 + o.flankMargin) return null
	} else if (o.requireFlanks) {
		// no moving easy time outside the set: nothing shows the work is harder
		// than the athlete's easy running (a steady run cut by stops looks like this),
		// so only a strictly periodic set may stand without flanks
		const rc = cvOf(ch.recs.map((r) => r.dur))
		if (!(k >= 4 && durCv <= 0.1 && rc <= 0.35)) return null
	}
	const recDurs = ch.recs.map((r) => r.dur)
	const recCv = cvOf(recDurs)
	const regularity = Math.max(0, 1 - 2 * durCv) * Math.max(0.3, 1 - recCv)
	const workTime = durs.reduce((a, b) => a + b, 0)
	const score = workTime * regularity * Math.min(1, k / 3)
	return {
		reps,
		recs: ch.recs,
		score,
		parts: {
			k,
			durCv: round(durCv),
			recCv: round(recCv),
			contrast: round(contrast),
			flankContrast: round(Math.min(flankContrast, 9)),
		},
	}
}

const round = (x: number) => Math.round(x * 100) / 100

function chainGrade(c: Chain, hrCapped: boolean): DetectionGrade {
	const { k, durCv, recCv, contrast, flankContrast } = c.parts as any
	let g: DetectionGrade = 'low'
	if (k >= 3 && durCv <= 0.25) g = 'medium'
	if (
		k >= 4 &&
		durCv <= 0.15 &&
		recCv <= 0.5 &&
		contrast >= 1.25 &&
		flankContrast >= 1.1
	)
		g = 'high'
	return gradeConfidence(
		g === 'high' ? 0.9 : g === 'medium' ? 0.5 : 0.1,
		hrCapped,
	)
}

function trimReps(c: Chain, segs: Seg[]) {
	const k = c.reps.length
	if (k < 3) return
	const med = median(c.reps.map((r) => r.dur))
	const first = c.reps[0]!
	if (first.dur > 1.4 * med) {
		first.startSec = first.endSec - med
		first.dur = med
	}
	const last = c.reps[k - 1]!
	if (last.dur > 1.4 * med) {
		last.endSec = last.startSec + med
		last.dur = med
	}
}

function snapEdges(
	stream: ActivityStream,
	hc: Array<number | null>,
	iv: Interval[],
) {
	const res = stream.resolutionSec
	const t = stream.timeSec
	const snap = (sec: number, up: boolean) => {
		const i = idxAtOrAfter(t, sec)
		let best = sec
		let bestD = 0
		for (let j = Math.max(1, i - 1); j <= Math.min(t.length - 1, i + 1); j++) {
			const a = hc[j - 1]
			const b = hc[j]
			if (!isNum(a) || !isNum(b)) continue
			const d = up ? b - a : a - b
			if (d > bestD) {
				bestD = d
				best = t[j]! - res / 2
			}
		}
		return best
	}
	for (const w of iv)
		if (w.role === 'work') {
			w.startSec = snap(w.startSec, true)
			w.endSec = snap(w.endSec, false)
		}
}

function chainIntervals(
	c: Chain,
	segs: Seg[],
	t0: number,
	tEnd: number,
	set = 0,
): Interval[] {
	const iv: Interval[] = []
	const first = c.reps[0]!
	const last = c.reps[c.reps.length - 1]!
	const flankVal = (from: number, to: number) => {
		const xs = segs.filter((s) => s.startSec >= from - 1 && s.endSec <= to + 1)
		return xs.length ? median(xs.map((s) => s.value)) : first.value
	}
	if (first.startSec - t0 > 0)
		iv.push({
			role: 'warmup',
			startSec: t0,
			endSec: first.startSec,
			value: flankVal(t0, first.startSec),
			set,
		})
	c.reps.forEach((r, j) => {
		iv.push({
			role: 'work',
			startSec: r.startSec,
			endSec: r.endSec,
			value: r.value,
			set,
		})
		const next = c.reps[j + 1]
		if (next)
			iv.push({
				role: 'recovery',
				startSec: r.endSec,
				endSec: next.startSec,
				value: c.recs[j]?.value ?? r.value * 0.7,
				set,
			})
	})
	if (tEnd - last.endSec > 0)
		iv.push({
			role: 'cooldown',
			startSec: last.endSec,
			endSec: tEnd,
			value: flankVal(last.endSec, tEnd),
			set,
		})
	return iv
}

/** v2-style emission from a contrast chain: ±12 % cluster, biggest cluster, mean, first recovery. */
function v2EmitFromChain(c: Chain): Chain {
	const clusters: Run[][] = []
	for (const r of c.reps) {
		const cl = clusters.find((x) => {
			const d = x.reduce((a, y) => a + y.dur, 0) / x.length
			const v = x.reduce((a, y) => a + y.h, 0) / x.length
			return Math.abs(r.dur - d) / d <= 0.3 && Math.abs(r.h - v) / v <= 0.12
		})
		if (cl) cl.push(r)
		else clusters.push([r])
	}
	const big = clusters.sort((a, b) => b.length - a.length)[0]!
	const md = big.reduce((a, y) => a + y.dur, 0) / big.length
	const rd = c.recs.length ? c.recs[0]!.dur : 0
	// lay the kept reps end to end from the first kept rep, as v2 does
	const reps: Run[] = []
	const recs: Run[] = []
	let t = big[0]!.startSec
	for (let i = 0; i < big.length; i++) {
		reps.push({ ...big[i]!, startSec: t, endSec: t + md, dur: md })
		t += md
		if (i < big.length - 1) {
			recs.push({
				...(c.recs[0] ?? big[i]!),
				startSec: t,
				endSec: t + rd,
				dur: rd,
			})
			t += rd
		}
	}
	return { ...c, reps, recs, parts: { ...c.parts, k: big.length } }
}

function mineSustained(segs: Seg[], o: Opts, movingSec: number): Chain | null {
	const sessionMed = weightedMedian(segs.map((s) => ({ v: s.h, w: s.dur })))!
	const walkH = o.walkFrac * sessionMed
	let best: Chain | null = null
	for (const tau of [...new Set(segs.map((s) => s.h))]) {
		const runs = mergeRuns(segs, (s) => s.h >= tau, walkH).filter(
			(r) => r.work && r.dur >= 300 && r.dur / movingSec >= 0.1,
		)
		for (const r of runs) {
			const before = segs.filter((s) => s.endSec <= r.startSec && s.h >= walkH)
			const after = segs.filter((s) => s.startSec >= r.endSec && s.h >= walkH)
			const bd = before.reduce((a, s) => a + s.dur, 0)
			const ad = after.reduce((a, s) => a + s.dur, 0)
			if (bd < 300 || ad < 120) continue // needs a real warm-up and some cool-down
			const bh = weightedMedian(before.map((s) => ({ v: s.h, w: s.dur })))!
			const ah = weightedMedian(after.map((s) => ({ v: s.h, w: s.dur })))!
			const fc = Math.min(r.h / bh, r.h / ah)
			if (fc < 1 + o.repMargin) continue
			const score = r.dur * (fc - 1)
			if (!best || score > best.score)
				best = {
					reps: [r],
					recs: [],
					score,
					parts: { k: 1, flankContrast: round(fc) },
				}
		}
	}
	return best
}

// ---------------------------------------------------------------------------

export function analyzeV3(
	stream: ActivityStream,
	profile: DisciplineProfileForResolver,
	laps: Lap[] | TypedLap[] | undefined,
	o: Opts,
): V3Result {
	const none: V3Result = { detected: null, intervals: [] }
	const cl = resolveClassifier('run', profile, stream)
	if (!cl) return none
	const hc = hardnessChannel(stream)
	if (!hc) return none
	const t0 = stream.timeSec[0] ?? 0
	const tEnd = stream.timeSec[stream.timeSec.length - 1]! + stream.resolutionSec

	const typed = laps && laps.length && 'intensity' in (laps[0] as any)
	if (typed && o.typedLaps) {
		const r = fromTypedLaps(stream, cl, hc, laps as TypedLap[], o)
		if (r) return r
	}
	const plainLaps = laps?.map((l) => ({
		startSec: l.startSec,
		endSec: l.endSec,
	}))

	// segmentation
	let segs: Seg[]
	let v2segs: Segment[] | null = null
	let movingSec: number
	if (plainLaps && plainLaps.length) {
		if (o.gate === 'v2' && o.emit === 'v2' && !o.speed) {
			// exact v2 on laps
			const sg = buildSegments(stream, 'run', cl, plainLaps)
			if (!sg) return none
			const hyp = mineStructure(sg, cl)
			if (!hyp) return none
			return {
				detected: {
					structure: v2Struct(hyp.blocks, cl),
					confidence: gradeConfidence(hyp.score, cl.hrCapped),
				},
				intervals: intervalsFromV2(hyp.blocks, t0),
				kind: hyp.kind,
			}
		}
		segs = lapSegments(stream, cl, hc, plainLaps, o)
		movingSec = segs.reduce((a, s) => a + s.dur, 0)
	} else if (o.seg === 'v2') {
		const r = v2Segments(stream, cl, hc, undefined, o)
		if (!r) return none
		segs = r.segs
		v2segs = r.v2
		movingSec = r.movingSec
	} else {
		segs = tunedSegments(stream, cl, hc, o)
		movingSec = segs.reduce((a, s) => a + s.dur, 0)
	}
	if (!segs.length) return none
	if ((globalThis as any).__dbg) (globalThis as any).__segs = segs

	if (o.gate === 'v2') {
		// v2 two-means + band gate and v2 miner on these segments
		const asV2: Segment[] =
			v2segs && !o.speed
				? v2segs
				: segs.map((s) => ({
						start: s.start,
						end: s.end,
						startSec: s.startSec,
						endSec: s.endSec,
						durationSec: s.dur,
						value: s.value,
						band: cl.bandIndex(s.value),
						interior: [s.value],
					}))
		const hyp = mineStructure(
			{ segments: asV2, movingSec, edgeSource: 'stream' },
			cl,
		)
		if (!hyp) return none
		if (o.emit === 'v2') {
			return {
				detected: {
					structure: v2Struct(hyp.blocks, cl),
					confidence: gradeConfidence(hyp.score, cl.hrCapped),
				},
				intervals: intervalsFromV2(hyp.blocks, t0),
				kind: hyp.kind,
			}
		}
		// (c) alone: keep the v2 verdict and work level, re-emit every rep by
		// alternation around the v2 hard/easy split.
		const workBlock = hyp.blocks.find((b) =>
			b.steps.some((s) => s.role === 'work'),
		)!
		const workV = workBlock.steps.find((s) => s.role === 'work')!.value
		const easyV = hyp.blocks
			.find((b) => b.steps.some((s) => s.role === 'recovery'))
			?.steps.find((s) => s.role === 'recovery')?.value
		const inv = cl.inverted
		const mid =
			easyV != null ? (workV + easyV) / 2 : inv ? workV * 1.08 : workV * 0.92
		const gateFn = (s: Seg) => (inv ? s.value <= mid : s.value >= mid)
		const c = mineContrast(
			segs,
			{ ...o, repMargin: 0.0, flankMargin: -1, maxDurCv: 1 },
			gateFn,
		)
		if (!c || hyp.kind === 'sustained') {
			return {
				detected: {
					structure: v2Struct(hyp.blocks, cl),
					confidence: gradeConfidence(hyp.score, cl.hrCapped),
				},
				intervals: intervalsFromV2(hyp.blocks, t0),
				kind: hyp.kind,
			}
		}
		if (o.trimFlankReps) trimReps(c, segs)
		const iv = chainIntervals(c, segs, t0, tEnd)
		if (o.snap) snapEdges(stream, hc, iv)
		return {
			detected: toDetected(cl, iv, t0, gradeConfidence(hyp.score, cl.hrCapped)),
			intervals: iv,
			kind: 'motif',
			parts: c.parts,
		}
	}

	// (b) contrast + periodicity gate
	let c = mineContrast(segs, o, null)
	if (o.lapsBoth && plainLaps && plainLaps.length && o.seg === 'tuned') {
		const ss = tunedSegments(stream, cl, hc, o)
		const cs = mineContrast(ss, o, null)
		if (cs && (!c || cs.score > c.score)) {
			c = cs
			segs = ss
		}
	}
	if (c && o.refine) {
		// second pass: re-cut every rep at the midpoint between the work and
		// recovery levels, so a rep's fading tail or ramped start stays in it
		const repH = weightedMedian(c.reps.map((r) => ({ v: r.h, w: r.dur })))!
		const recH = weightedMedian(c.recs.map((r) => ({ v: r.h, w: r.dur })))!
		const mid = (repH + recH) / 2
		const s0 = c.reps[0]!.startSec
		const s1 = c.reps[c.reps.length - 1]!.endSec
		const c2 = mineContrast(segs, o, (s) => s.h >= mid)
		if (
			c2 &&
			c2.reps.length >= c.reps.length &&
			c2.reps[0]!.startSec < s1 &&
			c2.reps[c2.reps.length - 1]!.endSec > s0
		)
			c = c2
	}
	let kind = 'motif'
	if (!c && o.sustained) {
		c = mineSustained(segs, o, movingSec)
		kind = 'sustained'
	}
	if (!c) return none
	let grade: DetectionGrade =
		kind === 'sustained' ? 'low' : chainGrade(c, cl.hrCapped)
	if (o.emit === 'v2' && kind === 'motif') c = v2EmitFromChain(c)
	else if (o.trimFlankReps && kind === 'motif') trimReps(c, segs)
	const iv = chainIntervals(c, segs, t0, tEnd)
	if (o.snap) snapEdges(stream, hc, iv)
	return {
		detected: toDetected(cl, iv, t0, grade),
		intervals: iv,
		kind,
		parts: c.parts,
	}
}

function v2Struct(blocks: any[], cl: Classifier) {
	return {
		discipline: 'run',
		blocks: blocks.map((b: any) => ({
			repeatCount: b.repeat,
			steps: b.steps.map((s: any) => ({
				kind: 'cardio',
				discipline: 'run',
				durationSec: Math.max(1, Math.round(s.durationSec)),
				intensity: cl.measuredTarget(s.value),
			})),
		})),
	} as any
}

/** The v3 the #609 note decided: tuned segmentation, contrast gate, every rep (`609-probe/v3final.ts`). */
export const V3: Opts = {
	...V2_OPTS,
	seg: 'tuned',
	minSegSec: 10,
	speed: true,
	penaltyFactor: 0.5,
	medianWindow: 1,
	gate: 'contrast',
	minK: 3,
	requireFlanks: true,
	sustained: false,
	emit: 'every',
}
