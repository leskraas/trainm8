import { type ActivityStream } from '../activity-stream.ts'
import { type Classifier } from './classify.ts'
import {
	DISCIPLINE_KNOBS,
	HR_LEAD_IN_SEC,
	PACE_CLAMP_SEC_PER_KM,
} from './constants.ts'
import {
	type Channel,
	isNum,
	pelt,
	rollingMedian,
	robustNormalize,
	splitAtPauses,
	trimmedMean,
} from './signal.ts'
import { type DetectionDiscipline, type Lap } from './types.ts'

/**
 * A bounded stretch of the activity, edged by PELT (or provider laps) and
 * labelled with a representative intensity on the classifying channel.
 */
export type Segment = {
	/** Sample index range `[start, end)` into the stream (all channels aligned). */
	start: number
	end: number
	startSec: number
	endSec: number
	durationSec: number
	/** Representative intensity on the classifying channel (robust median). */
	value: number
	/** Hardness rank of `value` against the athlete's inverted recipe. */
	band: number
	/**
	 * The denoised, lead-in-trimmed classifying-channel interior samples — kept so
	 * short reps can pool their siblings' interiors when HR is the classifying
	 * channel (ADR 0035).
	 */
	interior: number[]
}

export type Segmentation = {
	segments: Segment[]
	/** Total moving time (sum of segment durations, pauses excluded), in seconds. */
	movingSec: number
	/** Where the edges came from — laps never raise the grade ceiling (ADR 0033). */
	edgeSource: 'stream' | 'laps'
}

function channelOf(stream: ActivityStream, channel: Classifier['channel']): Channel | undefined {
	return channel === 'power'
		? stream.power
		: channel === 'pace'
			? stream.pace
			: stream.heartrate
}

function clampPace(values: number[], isPace: boolean): number[] {
	if (!isPace) return values
	const [lo, hi] = PACE_CLAMP_SEC_PER_KM
	return values.map((v) => Math.max(lo, Math.min(hi, v)))
}

/**
 * The representative value + settled interior for one segment on the classifying
 * channel. Denoises (rolling median), clamps GPS pace spikes, and — when HR is
 * the classifying channel — trims the ~30 s lead-in so cardiac lag does not drag
 * the label (ADR 0035). Returns `null` when the segment carries no real reading.
 */
function classifyInterior(
	classifyRaw: Channel,
	start: number,
	end: number,
	classifier: Classifier,
	discipline: DetectionDiscipline,
	resolutionSec: number,
): { value: number; interior: number[] } | null {
	const isPace = classifier.channel === 'pace'
	const real = clampPace(
		classifyRaw.slice(start, end).filter(isNum),
		isPace,
	)
	if (real.length === 0) return null

	const denoised = rollingMedian(real, DISCIPLINE_KNOBS[discipline].medianWindow)
	let interior = denoised
	if (classifier.channel === 'heartrate') {
		const leadIn = Math.round(HR_LEAD_IN_SEC / resolutionSec)
		// Trim the lead-in only when a settled interior would remain.
		if (denoised.length > leadIn + 1) interior = denoised.slice(leadIn)
	}
	return { value: trimmedMean(interior), interior }
}

/** Elapsed-second → sample index (first sample at or after `sec`). */
function indexAtOrAfter(timeSec: number[], sec: number): number {
	for (let i = 0; i < timeSec.length; i++) if (timeSec[i]! >= sec) return i
	return timeSec.length
}

/**
 * Cut the activity into intensity-labelled segments. Edges come from provider
 * laps when supplied (they rescue short/in-zone reps the stream is blind to,
 * #328/#330) — otherwise from PELT on the discipline's denoised anchor channel
 * (bike → power, run → median-filtered pace; HR never sets edges). Splits at
 * `null` pauses and never interpolates across one (ADR 0020). Returns `null`
 * when there is no edge channel and no laps — nothing to segment.
 */
export function buildSegments(
	stream: ActivityStream,
	discipline: DetectionDiscipline,
	classifier: Classifier,
	laps: Lap[] | undefined,
): Segmentation | null {
	const res = stream.resolutionSec
	if (!(res > 0)) return null
	const classifyRaw = channelOf(stream, classifier.channel)
	if (!classifyRaw) return null

	const finish = (segments: Segment[], edgeSource: 'stream' | 'laps') => {
		if (segments.length === 0) return null
		const movingSec = segments.reduce((a, s) => a + s.durationSec, 0)
		return { segments, movingSec, edgeSource }
	}

	const label = (start: number, end: number): Segment | null => {
		const interior = classifyInterior(
			classifyRaw,
			start,
			end,
			classifier,
			discipline,
			res,
		)
		if (!interior) return null
		return {
			start,
			end,
			startSec: stream.timeSec[start] ?? start * res,
			endSec: (stream.timeSec[start] ?? start * res) + (end - start) * res,
			durationSec: (end - start) * res,
			value: interior.value,
			band: classifier.bandIndex(interior.value),
			interior: interior.interior,
		}
	}

	// Lap-edged path: each lap is a segment boundary (ground-truth edges).
	if (laps && laps.length > 0) {
		const segments: Segment[] = []
		for (const lap of laps) {
			if (!(lap.endSec > lap.startSec)) continue
			const start = indexAtOrAfter(stream.timeSec, lap.startSec)
			const end = indexAtOrAfter(stream.timeSec, lap.endSec)
			if (end <= start) continue
			const seg = label(start, end)
			if (seg) {
				// Prefer the provider's own lap bounds for timing.
				seg.startSec = lap.startSec
				seg.endSec = lap.endSec
				seg.durationSec = lap.endSec - lap.startSec
				segments.push(seg)
			}
		}
		return finish(segments, 'laps')
	}

	// Stream-edged path: PELT on the denoised, robust-normalized anchor channel.
	const edge = discipline === 'bike' ? stream.power : stream.pace
	if (!edge) return null
	const knobs = DISCIPLINE_KNOBS[discipline]
	const minSize = Math.max(2, Math.round(knobs.minSegSec / res))
	const segments: Segment[] = []

	for (const [bs, be] of splitAtPauses(edge)) {
		const raw = clampPace(
			edge.slice(bs, be).filter(isNum),
			discipline === 'run',
		)
		if (raw.length < 2) continue
		const z = robustNormalize(rollingMedian(raw, knobs.medianWindow))
		const penalty = knobs.penaltyFactor * Math.log(z.length)
		let segStart = 0
		for (const cp of pelt(z, penalty, minSize)) {
			const seg = label(bs + segStart, bs + cp)
			if (seg) segments.push(seg)
			segStart = cp
		}
	}

	return finish(segments, 'stream')
}
