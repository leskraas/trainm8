import { type ActivityStream } from '../activity-stream.ts'
import { type Classifier } from './classify.ts'
import {
	type ClassifyChannel,
	DISCIPLINE_KNOBS,
	EDGE_CHANNEL_PREFERENCE,
	HR_LEAD_IN_SEC,
	PACE_CLAMP_SEC_PER_KM,
	RESPONSIVE_EDGE_MIN_SEG_SEC,
} from './constants.ts'
import {
	type Channel,
	isNum,
	median,
	peltMulti,
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

function channelOf(
	stream: ActivityStream,
	channel: Classifier['channel'],
): Channel | undefined {
	return channel === 'power'
		? stream.power
		: channel === 'pace'
			? stream.pace
			: stream.heartrate
}

/**
 * The edge channels PELT fuses to cut segments: every channel present for the
 * discipline, most-responsive first (`EDGE_CHANNEL_PREFERENCE`, #333). A channel
 * counts as present only when it carries at least two real readings — an empty or
 * all-`null` column is dropped so a run with a dead power meter falls back to
 * pace alone. The head of the list is the *primary* channel (pause splitting +
 * the segmentation floor key off it); the rest are fused into the changepoint
 * cost. Empty when nothing is usable (the caller then has nothing to segment).
 */
function pickEdgeChannels(
	stream: ActivityStream,
	discipline: DetectionDiscipline,
): Array<{ channel: ClassifyChannel; values: Channel }> {
	const picked: Array<{ channel: ClassifyChannel; values: Channel }> = []
	for (const channel of EDGE_CHANNEL_PREFERENCE[discipline]) {
		const values = channelOf(stream, channel)
		if (values && values.filter(isNum).length >= 2)
			picked.push({ channel, values })
	}
	return picked
}

/**
 * Denoise + robust-normalize one edge channel over the block `[bs, be)` into a
 * fusion-ready, index-aligned signal. Gaps are filled with the block median (a
 * neutral value that contributes no changepoint) so every fused channel keeps the
 * same length; pace is clamped for GPS spikes first. Returns `null` when the
 * channel carries fewer than two real readings in the block (nothing to fuse).
 */
function normalizeBlock(
	edge: { channel: ClassifyChannel; values: Channel },
	bs: number,
	be: number,
	medianWindow: number,
): number[] | null {
	const isPace = edge.channel === 'pace'
	const slice = edge.values.slice(bs, be)
	const real = clampPace(slice.filter(isNum), isPace)
	if (real.length < 2) return null
	const fill = median(real)
	const filled = slice.map((v) =>
		isNum(v) ? (isPace ? clampPace([v], true)[0]! : v) : fill,
	)
	return robustNormalize(rollingMedian(filled, medianWindow))
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
	const real = clampPace(classifyRaw.slice(start, end).filter(isNum), isPace)
	if (real.length === 0) return null

	const denoised = rollingMedian(
		real,
		DISCIPLINE_KNOBS[discipline].medianWindow,
	)
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

	// Stream-edged path: fused multivariate PELT (#333) on the denoised,
	// robust-normalized edge channels — every responsive channel present, cut
	// jointly so a boundary lands where power OR pace shifts, and more confidently
	// where they agree. Edges are decoupled from classification: power (bike, or a
	// run with running power) resolves the short recoveries GPS pace smears, while
	// each segment is still labelled on the classifying channel (ADR 0035). A run
	// with no power fuses pace alone — identical to the old single-channel path.
	const edges = pickEdgeChannels(stream, discipline)
	if (edges.length === 0) return null
	const knobs = DISCIPLINE_KNOBS[discipline]
	const segments: Segment[] = []

	// A pause is where *every* edge channel drops (the device stopped) — not a
	// single-channel dropout (a running-power meter can gap while GPS pace still
	// reads), which must not fragment the activity. Split on this any-present mask.
	const anyPresent: Channel = stream.timeSec.map((_, i) =>
		edges.some((e) => isNum(e.values[i])) ? 1 : null,
	)
	for (const [bs, be] of splitAtPauses(anyPresent)) {
		// Only the channels that actually carry data *in this block* are fused;
		// gaps are filled with the block median (neutral, adds no changepoint) so
		// the surviving signals stay the same length.
		const surviving = edges.flatMap((e) => {
			const z = normalizeBlock(e, bs, be, knobs.medianWindow)
			return z ? [{ channel: e.channel, z }] : []
		})
		if (surviving.length === 0) continue
		// The floor keys off the most responsive channel that survived *this*
		// block (preference order is preserved): power is clean enough for the fine
		// micro-interval floor — the PELT penalty, not the floor, governs — while a
		// block that fell back to pace alone keeps the coarser floor so GPS wobble
		// does not over-segment.
		const minSegSec =
			surviving[0]!.channel === 'pace'
				? knobs.minSegSec
				: RESPONSIVE_EDGE_MIN_SEG_SEC
		const minSize = Math.max(2, Math.round(minSegSec / res))
		const signals = surviving.map((s) => s.z)
		// Pool cost grows with the channel count, so scale the penalty to match.
		const penalty = knobs.penaltyFactor * Math.log(be - bs) * signals.length
		let segStart = 0
		for (const cp of peltMulti(signals, penalty, minSize)) {
			const seg = label(bs + segStart, bs + cp)
			if (seg) segments.push(seg)
			segStart = cp
		}
	}

	return finish(segments, 'stream')
}
