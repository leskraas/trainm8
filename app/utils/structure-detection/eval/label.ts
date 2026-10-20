import { type ActivityStream, isNum } from '../../activity-stream.ts'
import { type Lap } from '../types.ts'
import { type ChannelMeans } from './types.ts'

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
	// "20x45/15", and Intervals.icu's "30x45(15p)" (15 s pause).
	const shortReps =
		/(\d+)\s*x\s*(\d+)\s*(?:\/\s*(\d+)|\(\s*(\d+)\s*p?\s*\))/i.exec(title)
	if (shortReps) {
		return {
			reps: Number(shortReps[1]),
			workSec: Number(shortReps[2]),
			recoverySec: Number(shortReps[3] ?? shortReps[4]),
		}
	}
	// "10x3min", "6x6 min", "10x2.5 min", "3 x 10 minutter"; a bare "m" is minutes
	// only below 60 ("5x400m" is metres).
	const minuteReps =
		/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*m(?:in[a-z]*)?(?![a-z])/i.exec(title)
	if (minuteReps && Number(minuteReps[2]!.replace(',', '.')) < 60) {
		const pause = /p\s*:\s*(\d+)/i.exec(title)
		return {
			reps: Number(minuteReps[1]),
			workSec: Math.round(Number(minuteReps[2]!.replace(',', '.')) * 60),
			recoverySec: pause ? Number(pause[1]) : null,
		}
	}
	return null
}

/** Recoveries tried when the title gives none: 30 s to 5 min in 15 s steps. */
const RECOVERY_CANDIDATES = Array.from({ length: 19 }, (_, i) => 30 + i * 15)

/** Pace as speed (m/s), so it averages and compares the way power does. */
function speedOf(pace: Array<number | null>): Array<number | null> {
	return pace.map((p) => (isNum(p) && p > 0 ? 1000 / p : null))
}

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
	const values = stream.power ?? (stream.pace && speedOf(stream.pace))
	if (!values) return null
	const end = stream.timeSec[stream.timeSec.length - 1] ?? 0
	let best: {
		t0: number
		recoverySec: number
		period: number
		means: PhaseMeans
	} | null = null
	for (const recoverySec of scheme.recoverySec != null
		? [scheme.recoverySec]
		: RECOVERY_CANDIDATES) {
		const period = scheme.workSec + recoverySec
		const span = scheme.reps * period - recoverySec
		for (let t0 = 0; t0 + span <= end; t0++) {
			const means = phaseMeans(stream.timeSec, values, {
				t0,
				span,
				period,
				workSec: scheme.workSec,
			})
			if (!means) continue
			if (
				!best ||
				means.work - means.recovery > best.means.work - best.means.recovery
			) {
				best = { t0, recoverySec, period, means }
			}
		}
	}
	if (!best) return null
	const { t0, period, means } = best
	return {
		recoverySec: best.recoverySec,
		work: Array.from({ length: scheme.reps }, (_, i) => ({
			startSec: t0 + i * period,
			endSec: t0 + i * period + scheme.workSec,
		})),
		contrast: means.work / means.recovery,
	}
}

/** One placement of a square wave: `span` seconds from `t0`, work first in each `period`. */
type Placement = { t0: number; span: number; period: number; workSec: number }

type PhaseMeans = { work: number; recovery: number }

function phaseMeans(
	timeSec: number[],
	values: Array<number | null>,
	{ t0, span, period, workSec }: Placement,
): PhaseMeans | null {
	let workSum = 0
	let workCount = 0
	let recoverySum = 0
	let recoveryCount = 0
	for (let i = 0; i < timeSec.length; i++) {
		const rel = timeSec[i]! - t0
		if (rel < 0) continue
		if (rel >= span) break
		const v = values[i]
		if (!isNum(v)) continue
		if (rel % period < workSec) {
			workSum += v
			workCount++
		} else {
			recoverySum += v
			recoveryCount++
		}
	}
	if (workCount === 0 || recoveryCount === 0) return null
	return { work: workSum / workCount, recovery: recoverySum / recoveryCount }
}

/**
 * Mean of each channel inside the given windows. Pace is averaged as speed and
 * turned back into s/km, so a slow sample cannot outweigh a fast one.
 */
export function windowMeans(
	stream: ActivityStream,
	windows: Lap[],
): ChannelMeans {
	const inside = (t: number) =>
		windows.some((w) => t >= w.startSec && t < w.endSec)
	const mean = (vals: Array<number | null> | undefined) => {
		if (!vals) return undefined
		const xs = vals.filter((v, i) => isNum(v) && inside(stream.timeSec[i]!))
		return xs.length
			? (xs as number[]).reduce((a, b) => a + b, 0) / xs.length
			: undefined
	}
	const speed = mean(stream.pace && speedOf(stream.pace))
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
export function autoLaps(stream: ActivityStream): Lap[] {
	if (!stream.pace) return []
	const res = stream.resolutionSec
	const laps: Lap[] = []
	let start = stream.timeSec[0] ?? 0
	let dist = 0
	for (let i = 0; i < stream.timeSec.length; i++) {
		const p = stream.pace[i]
		if (isNum(p) && p > 0) dist += (res * 1000) / p
		if (dist >= 1000) {
			const t = stream.timeSec[i]! + res
			laps.push({ startSec: start, endSec: t })
			start = t
			dist -= 1000
		}
	}
	const end = stream.timeSec[stream.timeSec.length - 1]! + res
	if (end > start) laps.push({ startSec: start, endSec: end })
	return laps
}

/** A lap as a FIT file writes it, with the role the watch gave it. */
export type RoleLap = Lap & { intensity: string | null }

/** A rep set read off a session's own laps. */
export type LapSet = {
	/**
	 * `step`: active laps alternating with rest/recovery laps, the way a watch
	 * writes a structured workout's steps. `manual`: laps that are all active
	 * but alternate in duration or effort, the way an athlete lapping each rep
	 * by hand writes them.
	 */
	kind: 'step' | 'manual'
	work: Lap[]
	recovery: Lap[]
}

/**
 * A step set's first or last active lap is not a rep when it is further from
 * the reps next to it than the reps vary among themselves: 5 % plus four
 * times their relative spread (median absolute deviation), at most 20 %. Timed
 * steps (all reps 210 s) refuse a 241 s warm-up; distance or hand-timed reps
 * keep their natural spread.
 */
const END_REP_TOLERANCE_MIN = 0.05
const END_REP_TOLERANCE_MAX = 0.2
const END_REP_SPREAD_FACTOR = 4
/** …and never closer than this, for sprints of a few seconds. */
const END_REP_SLACK_SEC = 2
/** …nor is one next to a recovery this far from the median recovery. */
const END_RECOVERY_TOLERANCE = 0.25
const END_RECOVERY_SLACK_SEC = 5
/** A rep this close to the median is a rep whatever its recovery. */
const EXACT_REP_TOLERANCE = 0.05
/** Reps within this fraction of each other belong to one set of a multi-set workout… */
const REP_DURATION_TOLERANCE = 0.15
/** …when the sets' reps differ by this ratio; less is one set of uneven (distance) reps. */
const MULTI_SET_RATIO = 1.5
/** A hand-lapped rep or recovery may differ from its median by this fraction, or this many seconds. */
const MANUAL_DURATION_TOLERANCE = 0.2
const MANUAL_DURATION_SLACK_SEC = 5
/** Hand laps read as reps when their lengths, or their efforts, alternate by this ratio… */
const MANUAL_ALTERNATION_RATIO = 1.3
/** …and the harder of the two is at least this much harder. */
const MANUAL_MIN_HARD_RATIO = 1.1
const MIN_REPS = 3
const MIN_MANUAL_REPS = 4
const MANUAL_CLEAR_HARD_RATIO = 1.5

const lapSec = (l: Lap) => l.endSec - l.startSec
/** A lap role a watch writes for the recovery between reps. */
export const isRestIntensity = (intensity: string | null) =>
	intensity === 'rest' || intensity === 'recovery'
const isRest = (l: RoleLap) => isRestIntensity(l.intensity)
const medianOf = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b)
	const m = Math.floor(s.length / 2)
	return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const near = (d: number, ref: number, frac: number, slackSec = 0) =>
	Math.abs(d - ref) <= Math.max(frac * ref, slackSec)

/**
 * The rep sets in a session's laps: the independent truth the detection
 * scoreboard's FIT sessions are labelled from (#625), since lap edges are set
 * by the watch's step timer or the athlete's button, not by the power channel
 * the engine segments on.
 *
 * - **Step sets** need no signal at all: a run of active laps separated by
 *   rest or recovery laps. A first or last active lap far from the set's
 *   median duration is the warm-up or cool-down (Intervals.icu writes those as
 *   `active`) or a rep cut short, and is dropped.
 * - **Manual sets** are laps that are all active but alternate between two
 *   durations, or between two efforts at one duration (hill reps lapped at the
 *   top and bottom). The edges are still the athlete's; which of the two is the
 *   work is read from `hardness` (mean power, or speed), the one place a
 *   signal enters, so a manual set with no clear difference is no set.
 *
 * A set needs at least three reps.
 */
export function lapSets(
	laps: RoleLap[],
	hardness: (lap: Lap) => number | null,
): LapSet[] {
	const sets: LapSet[] = []
	const used = new Set<number>()

	for (let i = 0; i < laps.length; i++) {
		if (isRest(laps[i]!)) continue
		let j = i
		while (
			j + 2 < laps.length &&
			isRest(laps[j + 1]!) &&
			!isRest(laps[j + 2]!)
		) {
			j += 2
		}
		if (j === i) continue
		// laps[i..j] alternate active, rest, active, …, active. A first or last
		// active lap far from the reps next to it, or not quite them and next
		// to a recovery far from the median recovery, is the warm-up or
		// cool-down (written `active`) or a rep cut short.
		const span = laps.slice(i, j + 1)
		const restMed = medianOf(span.filter((_, k) => k % 2 === 1).map(lapSec))
		// An end lap easier than halfway from the median recovery to the median
		// rep is a cool-down whatever its length (distance reps vary).
		const hard = (k: number) => hardness(laps[k]!)
		const known = (xs: Array<number | null>) =>
			xs.filter((x): x is number => x != null)
		const repHard = known(span.map((_, k) => (k % 2 ? null : hard(i + k))))
		const restHard = known(span.map((_, k) => (k % 2 ? hard(i + k) : null)))
		const easyBelow =
			repHard.length && restHard.length
				? (medianOf(repHard) + medianOf(restHard)) / 2
				: null
		// The median of the (up to) three reps inward of an end rep, so a
		// multi-set workout's first set is not judged by its last.
		const inward = (rep: number, step: number) => {
			const xs: number[] = []
			for (let k = rep + step; k >= i && k <= j && xs.length < 3; k += step)
				xs.push(lapSec(laps[k]!))
			return xs.length ? medianOf(xs) : lapSec(laps[rep]!)
		}
		const repSecs = span.filter((_, k) => k % 2 === 0).map(lapSec)
		const repMed = medianOf(repSecs)
		const spread = medianOf(repSecs.map((d) => Math.abs(d - repMed))) / repMed
		const endTolerance = Math.min(
			END_REP_TOLERANCE_MAX,
			END_REP_TOLERANCE_MIN + END_REP_SPREAD_FACTOR * spread,
		)
		const bad = (rep: number, rest: number) => {
			const d = lapSec(laps[rep]!)
			const ref = inward(rep, rest > rep ? 2 : -2)
			return (
				!near(d, ref, endTolerance, END_REP_SLACK_SEC) ||
				(easyBelow != null && (hard(rep) ?? Infinity) < easyBelow) ||
				(!near(d, ref, EXACT_REP_TOLERANCE, END_REP_SLACK_SEC) &&
					!near(
						lapSec(laps[rest]!),
						restMed,
						END_RECOVERY_TOLERANCE,
						END_RECOVERY_SLACK_SEC,
					))
			)
		}
		let a = i
		let b = j
		while (a < b && bad(a, a + 1)) a += 2
		while (b > a && bad(b, b - 1)) b -= 2
		const chain = laps.slice(a, b + 1)
		if (chain.filter((_, k) => k % 2 === 0).length < MIN_REPS) continue
		// A multi-set workout (3×3′, 2×1′, 4×45″) keeps one set per run of
		// equal reps; a lone odd rep inside one set stays in it.
		const runs: number[][] = []
		for (let k = 0; k < chain.length; k += 2) {
			const run = runs[runs.length - 1]
			const ref = run && medianOf(run.map((n) => lapSec(chain[n]!)))
			if (run && near(lapSec(chain[k]!), ref!, REP_DURATION_TOLERANCE))
				run.push(k)
			else runs.push([k])
		}
		const runMedians = runs
			.filter((r) => r.length >= 2)
			.map((r) => medianOf(r.map((n) => lapSec(chain[n]!))))
		const multi =
			runMedians.length >= 2 &&
			Math.max(...runMedians) / Math.min(...runMedians) >= MULTI_SET_RATIO
		for (const run of multi ? runs : [runs.flat()]) {
			sets.push({
				kind: 'step',
				work: run.map((k) => plain(chain[k]!)),
				recovery: run.slice(0, -1).map((k) => plain(chain[k + 1]!)),
			})
		}
		for (let k = i; k <= j; k++) used.add(k)
		i = j
	}

	for (let i = 0; i + 1 < laps.length; i++) {
		if (used.has(i) || used.has(i + 1)) continue
		const even = [lapSec(laps[i]!)]
		const odd = [lapSec(laps[i + 1]!)]
		let k = i + 2
		for (; k < laps.length && !used.has(k); k++) {
			const group = (k - i) % 2 === 0 ? even : odd
			if (
				!near(
					lapSec(laps[k]!),
					medianOf(group),
					MANUAL_DURATION_TOLERANCE,
					MANUAL_DURATION_SLACK_SEC,
				)
			)
				break
			group.push(lapSec(laps[k]!))
		}
		const chain = laps.slice(i, k)
		if (chain.length < 2 * MIN_REPS - 1) continue
		const h = (parity: number) => {
			const xs = chain
				.filter((_, n) => n % 2 === parity)
				.map((l) => ({ v: hardness(l), w: lapSec(l) }))
				.filter((x): x is { v: number; w: number } => x.v != null)
			const w = xs.reduce((s, x) => s + x.w, 0)
			return w ? xs.reduce((s, x) => s + x.v * x.w, 0) / w : null
		}
		const h0 = h(0)
		const h1 = h(1)
		if (h0 == null || h1 == null) continue
		const hardRatio = Math.max(h0, h1) / Math.min(h0, h1)
		const durationRatio =
			Math.max(medianOf(even), medianOf(odd)) /
			Math.min(medianOf(even), medianOf(odd))
		// Two lap lengths that alternate, or two efforts that do.
		if (hardRatio < MANUAL_MIN_HARD_RATIO) continue
		if (
			durationRatio < MANUAL_ALTERNATION_RATIO &&
			hardRatio < MANUAL_ALTERNATION_RATIO
		)
			continue
		const workParity = h0 > h1 ? 0 : 1
		// Start and end the set on a rep.
		const first = workParity
		const last =
			(chain.length - 1 - workParity) % 2 === 0
				? chain.length - 1
				: chain.length - 2
		const set = chain.slice(first, last + 1)
		const work = set.filter((_, n) => n % 2 === 0)
		// Three hand laps that alternate can be hills or traffic; four, or
		// three with a clear effort, are reps.
		if (
			work.length < MIN_REPS ||
			(work.length < MIN_MANUAL_REPS && hardRatio < MANUAL_CLEAR_HARD_RATIO)
		)
			continue
		sets.push({
			kind: 'manual',
			work: work.map(plain),
			recovery: set.filter((_, n) => n % 2 === 1).map(plain),
		})
		for (let n = i; n < k; n++) used.add(n)
		i = k - 1
	}

	return sets.sort((x, y) => x.work[0]!.startSec - y.work[0]!.startSec)
}

function plain(l: Lap): Lap {
	return { startSec: l.startSec, endSec: l.endSec }
}
