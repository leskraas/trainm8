import { type ActivityStream, isNum } from '../../activity-stream.ts'
import { type Lap } from '../types.ts'

/**
 * Ground truth for the detection scoreboard: read a rep scheme from the
 * athlete's title, then place it on the stream.
 */

export type TitleScheme = {
	reps: number
	workSec: number
	/** `null` when the title gives no recovery ("i3 5x6min"). */
	recoverySec: number | null
}

/**
 * Read a repeat scheme from an athlete's title: "i3 20x45/15", "15x45/15",
 * "i3 10x3 min, p:60", "i3 5x6min". Anything else is `null`, never a guess.
 */
export function parseTitleScheme(title: string): TitleScheme | null {
	const shortReps = /(\d+)\s*x\s*(\d+)\s*\/\s*(\d+)/i.exec(title)
	if (shortReps) {
		return {
			reps: Number(shortReps[1]),
			workSec: Number(shortReps[2]),
			recoverySec: Number(shortReps[3]),
		}
	}
	const minuteReps = /(\d+)\s*x\s*(\d+)\s*min/i.exec(title)
	if (minuteReps) {
		const pause = /p\s*:\s*(\d+)/i.exec(title)
		return {
			reps: Number(minuteReps[1]),
			workSec: Number(minuteReps[2]) * 60,
			recoverySec: pause ? Number(pause[1]) : null,
		}
	}
	return null
}

/** Recoveries tried when the title gives none: 30 s to 5 min in 15 s steps. */
const RECOVERY_CANDIDATES = Array.from({ length: 19 }, (_, i) => 30 + i * 15)

export type TemplateFit = {
	recoverySec: number
	work: Lap[]
	/** Mean work ÷ mean recovery on the fitted channel. */
	contrast: number
}

/**
 * Place a known rep scheme on the stream: slide its square wave across every
 * start second (and every candidate recovery, when the title has none) and keep
 * the placement where mean work power most exceeds mean recovery power. Power
 * is used because it moves within a second of the athlete; speed (from pace)
 * stands in when there is no power. `null` when the stream is shorter than the
 * scheme or has neither channel.
 */
export function fitTemplate(
	stream: ActivityStream,
	scheme: TitleScheme,
): TemplateFit | null {
	const values =
		stream.power ??
		stream.pace?.map((p) => (isNum(p) && p > 0 ? 1000 / p : null))
	if (!values) return null
	const end = stream.timeSec[stream.timeSec.length - 1] ?? 0
	let best: { score: number; t0: number; recoverySec: number } | null = null
	for (const recoverySec of scheme.recoverySec != null
		? [scheme.recoverySec]
		: RECOVERY_CANDIDATES) {
		const period = scheme.workSec + recoverySec
		const span = scheme.reps * period - recoverySec
		for (let t0 = 0; t0 + span <= end; t0++) {
			const m = phaseMeans(
				stream.timeSec,
				values,
				t0,
				span,
				period,
				scheme.workSec,
			)
			if (!m) continue
			const score = m.work - m.recovery
			if (!best || score > best.score) best = { score, t0, recoverySec }
		}
	}
	if (!best) return null
	const period = scheme.workSec + best.recoverySec
	const span = scheme.reps * period - best.recoverySec
	const m = phaseMeans(
		stream.timeSec,
		values,
		best.t0,
		span,
		period,
		scheme.workSec,
	)!
	return {
		recoverySec: best.recoverySec,
		work: Array.from({ length: scheme.reps }, (_, i) => ({
			startSec: best.t0 + i * period,
			endSec: best.t0 + i * period + scheme.workSec,
		})),
		contrast: m.work / m.recovery,
	}
}

function phaseMeans(
	timeSec: number[],
	values: Array<number | null>,
	t0: number,
	span: number,
	period: number,
	workSec: number,
): { work: number; recovery: number } | null {
	let ws = 0
	let wn = 0
	let rs = 0
	let rn = 0
	for (let i = 0; i < timeSec.length; i++) {
		const rel = timeSec[i]! - t0
		if (rel < 0) continue
		if (rel >= span) break
		const v = values[i]
		if (!isNum(v)) continue
		if (rel % period < workSec) {
			ws += v
			wn++
		} else {
			rs += v
			rn++
		}
	}
	if (wn === 0 || rn === 0) return null
	return { work: ws / wn, recovery: rs / rn }
}

/**
 * Mean of each channel inside the given windows. Pace is averaged as speed and
 * turned back into s/km, so a slow sample cannot outweigh a fast one.
 */
export function windowMeans(
	stream: ActivityStream,
	windows: Lap[],
): { power?: number; pace?: number; heartrate?: number } {
	const inside = (t: number) =>
		windows.some((w) => t >= w.startSec && t < w.endSec)
	const mean = (vals: Array<number | null> | undefined) => {
		if (!vals) return undefined
		const xs = vals.filter((v, i) => isNum(v) && inside(stream.timeSec[i]!))
		return xs.length
			? (xs as number[]).reduce((a, b) => a + b, 0) / xs.length
			: undefined
	}
	const speed = mean(
		stream.pace?.map((p) => (isNum(p) && p > 0 ? 1000 / p : null)),
	)
	return {
		power: mean(stream.power),
		pace: speed ? 1000 / speed : undefined,
		heartrate: mean(stream.heartrate),
	}
}

/**
 * The laps a watch records when the athlete runs the scheme as a structured
 * workout: warm-up, every work and recovery step, cool-down. Synthesised from
 * the label, so it scores the lap path's ceiling, not a real device.
 */
export function workoutStepLaps(stream: ActivityStream, work: Lap[]): Lap[] {
	const end = stream.timeSec[stream.timeSec.length - 1]! + stream.resolutionSec
	const laps: Lap[] = []
	let cursor = stream.timeSec[0] ?? 0
	for (const w of work) {
		if (w.startSec > cursor) laps.push({ startSec: cursor, endSec: w.startSec })
		laps.push(w)
		cursor = w.endSec
	}
	if (end > cursor) laps.push({ startSec: cursor, endSec: end })
	return laps
}

/** Every-kilometre auto-laps, integrated from the pace channel. */
export function autoLaps(stream: ActivityStream, everyM = 1000): Lap[] {
	if (!stream.pace) return []
	const res = stream.resolutionSec
	const laps: Lap[] = []
	let start = stream.timeSec[0] ?? 0
	let dist = 0
	for (let i = 0; i < stream.timeSec.length; i++) {
		const p = stream.pace[i]
		if (isNum(p) && p > 0) dist += (res * 1000) / p
		if (dist >= everyM) {
			const t = stream.timeSec[i]! + res
			laps.push({ startSec: start, endSec: t })
			start = t
			dist -= everyM
		}
	}
	const end = stream.timeSec[stream.timeSec.length - 1]! + res
	if (end > start) laps.push({ startSec: start, endSec: end })
	return laps
}
