import { expect, test } from 'vitest'
import { type ActivityStream } from '../../activity-stream.ts'
import { type DetectedStructure, type Lap } from '../types.ts'
import {
	autoLaps,
	fitTemplate,
	lapSets,
	parseTitleScheme,
	workoutStepLaps,
} from './label.ts'
import {
	aggregate,
	matchEdges,
	readPrediction,
	scoreActivity,
} from './score.ts'
import { type StructuredLabel } from './types.ts'

// ── The detection scoreboard's own arithmetic (ticket #605) ─────────────────

/** 5 s samples: `warmSec` easy, then `reps` × work/recovery, then easy to `endSec`. */
function squareWave(
	warmSec: number,
	reps: number,
	workSec: number,
	recoverySec: number,
	endSec: number,
): ActivityStream {
	const timeSec: number[] = []
	const power: number[] = []
	const period = workSec + recoverySec
	for (let t = 0; t < endSec; t += 5) {
		const rel = t - warmSec
		const inWork = rel >= 0 && rel < reps * period && rel % period < workSec
		timeSec.push(t)
		power.push(inWork ? 400 : 250)
	}
	return { resolutionSec: 5, timeSec, power, pace: power.map(() => 300) }
}

test('reads the rep schemes athletes write in titles', () => {
	expect(parseTitleScheme('i3 20x45/15')).toEqual({
		reps: 20,
		workSec: 45,
		recoverySec: 15,
	})
	expect(parseTitleScheme('i3 10x3 min, p:60')).toEqual({
		reps: 10,
		workSec: 180,
		recoverySec: 60,
	})
	expect(parseTitleScheme('i3 5x6min')).toEqual({
		reps: 5,
		workSec: 360,
		recoverySec: null,
	})
	expect(parseTitleScheme('3x Songsvann med Gustav')).toBeNull()
	expect(parseTitleScheme('Morning Run')).toBeNull()
})

test('places a known scheme on the stream, finding a recovery the title omits', () => {
	const stream = squareWave(600, 5, 360, 90, 3600)
	const fit = fitTemplate(stream, { reps: 5, workSec: 360, recoverySec: null })!
	expect(fit.recoverySec).toBe(90)
	expect(fit.work[0]!.startSec).toBeGreaterThan(595)
	expect(fit.work[0]!.startSec).toBeLessThanOrEqual(600)
	expect(fit.work).toHaveLength(5)
	expect(fit.contrast).toBeCloseTo(1.6, 1)
})

test('synthesised laps tile the whole stream', () => {
	const stream = squareWave(600, 3, 180, 60, 1800)
	const laps = workoutStepLaps(stream, [
		{ startSec: 600, endSec: 780 },
		{ startSec: 840, endSec: 1020 },
	])
	expect(laps[0]).toEqual({ startSec: 0, endSec: 600 })
	expect(laps.at(-1)!.endSec).toBe(1800)
	// 300 s/km for 1800 s is 6 km: six laps.
	expect(autoLaps(stream)).toHaveLength(6)
})

test('edges pair one-to-one within the tolerance, most pairs first', () => {
	expect(matchEdges([100, 200], [102, 104, 260], 10)).toEqual([2])
	expect(matchEdges([100, 110], [105], 10)).toEqual([5])
	// 45/15 reps drawn 9 s late: closest-first would pair 660↔654 and strand two.
	const truth = [600, 645, 660, 705, 720, 765]
	expect(
		matchEdges(
			truth,
			truth.map((t) => t + 9),
			10,
		),
	).toEqual([9, 9, 9, 9, 9, 9])
})

const label: StructuredLabel = {
	kind: 'structured',
	source: 'title',
	title: '3x3 min, p:60',
	reps: 3,
	workSec: 180,
	recoverySec: 60,
	work: [
		{ startSec: 600, endSec: 780 },
		{ startSec: 840, endSec: 1020 },
		{ startSec: 1080, endSec: 1260 },
	],
	workValue: { power: 400 },
	contrast: 1.6,
}

const cardio = (durationSec: number, minW: number) => ({
	kind: 'cardio' as const,
	discipline: 'run' as const,
	durationSec,
	intensity: { kind: 'power' as const, minW },
})

test('reads the main set, its work and recovery, and the drawn edges', () => {
	const detected: DetectedStructure = {
		confidence: 'high',
		structure: {
			discipline: 'run',
			blocks: [
				{ repeatCount: 1, steps: [cardio(600, 250)] },
				{ repeatCount: 3, steps: [cardio(180, 410), cardio(60, 240)] },
			],
		},
	}
	const stream = squareWave(600, 3, 180, 60, 1800)
	const p = readPrediction(detected, stream)
	expect(p).toMatchObject({
		structured: true,
		grade: 'high',
		reps: 3,
		work: { durationSec: 180, value: 410, channel: 'power' },
		recoverySec: 60,
	})
	expect(p.edges.slice(0, 3)).toEqual([600, 780, 840])

	const s = scoreActivity(label, p)
	expect(s.reps).toEqual({ truth: 3, predicted: 3 })
	expect(s.edges!.matched).toBe(6)
	expect(s.intensityError).toBeCloseTo(0.025)
})

test('precision counts false claims on unstructured sessions; unlabelled never count', () => {
	const stream = squareWave(0, 0, 1, 1, 100)
	const yes = readPrediction(
		{
			confidence: 'medium',
			structure: {
				discipline: 'run',
				blocks: [{ repeatCount: 1, steps: [cardio(100, 300)] }],
			},
		},
		stream,
	)
	const no = readPrediction(null, stream)
	const board = aggregate([
		scoreActivity(label, yes),
		scoreActivity(label, no),
		scoreActivity({ kind: 'unstructured', reason: 'steady', note: '' }, yes),
		scoreActivity({ kind: 'unlabelled', note: '' }, yes),
	])
	const anyGrade = board.claims.find((c) => c.atLeast === 'low')!
	expect(anyGrade).toMatchObject({
		truePositives: 1,
		falsePositives: 1,
		positives: 2,
	})
	expect(anyGrade.precision).toBe(0.5)
	expect(board.claims.find((c) => c.atLeast === 'high')!.truePositives).toBe(0)
	expect(board.unlabelledClaimed).toBe(1)
	expect(board.repsExact).toBe(0)
})

// ── The FIT half's lap labels (#625) ────────────────────────────────────────

/** Laps from durations, laid end to end; `r` marks a recovery lap. */
function lapsOf(spec: string): Array<Lap & { intensity: string }> {
	let t = 0
	return spec.split(' ').map((s) => {
		const d = Number(s.slice(1))
		const lap = {
			startSec: t,
			endSec: t + d,
			intensity: s.startsWith('r') ? 'recovery' : 'active',
		}
		t += d
		return lap
	})
}

test('reads the titles Intervals.icu and file names write', () => {
	expect(parseTitleScheme('Oslo - i4 30x45(15p)')).toEqual({
		reps: 30,
		workSec: 45,
		recoverySec: 15,
	})
	expect(parseTitleScheme('i4 10x2.5 min ter')?.workSec).toBe(150)
	expect(parseTitleScheme('3 x 10 minutter terskel')?.workSec).toBe(600)
	expect(parseTitleScheme('i34 10x1km Tømmerrunden')).toBeNull()
	expect(parseTitleScheme('5x400m')).toBeNull()
})

test('a step set drops the warm-up and cool-down a re-encoded file writes as active', () => {
	// "i3 10x3min": warm-up 148 s, a 2 s step-change lap, 10 × 180/60, cool-down 34 s.
	const reps = Array.from({ length: 9 }, () => 'A180 r60').join(' ')
	const sets = lapSets(lapsOf(`A148 r2 ${reps} A180 A34`), () => null)
	expect(sets).toHaveLength(1)
	expect(sets[0]!.kind).toBe('step')
	expect(sets[0]!.work).toHaveLength(10)
	expect(sets[0]!.work[0]).toEqual({ startSec: 150, endSec: 330 })
	expect(sets[0]!.recovery.every((r) => r.endSec - r.startSec === 60)).toBe(
		true,
	)
})

test('reps lapped by hand read as a set when they alternate, and work is the harder', () => {
	const reps = Array.from({ length: 6 }, () => 'A46 A15').join(' ')
	const hard = (l: Lap) => (l.endSec - l.startSec === 46 ? 420 : 250)
	const [set] = lapSets(lapsOf(`A1365 ${reps} A46 A176`), hard)
	expect(set!.kind).toBe('manual')
	expect(set!.work).toHaveLength(7)
	expect(set!.work.every((w) => w.endSec - w.startSec === 46)).toBe(true)
	// Equal 1 km auto-laps are no set.
	expect(lapSets(lapsOf('A300 A305 A298 A302 A299 A301'), () => 300)).toEqual(
		[],
	)
})

test('a multi-set workout keeps one set per run of equal reps', () => {
	const laps = lapsOf(
		'A600 A180 r60 A180 r60 A180 r120 A60 r60 A60 r60 A60 A500',
	)
	expect(lapSets(laps, () => null).map((s) => s.work.length)).toEqual([3, 3])
})

/** Hardness by lap length: reps hard, recoveries and the warm-up easy. */
const effort =
	(easy: (sec: number, n: number) => boolean) => (laps: Lap[]) => (l: Lap) => {
		const n = laps.findIndex((x) => x.startSec === l.startSec)
		return easy(l.endSec - l.startSec, n) ? 250 : 400
	}

test('a multi-length workout keeps its opening long rep; only the easy warm-up goes', () => {
	// "3x3m2x1m4x4": warm-up, then 3 × (1 × 3′, 2 × 90″, 4 × 45″), 60 s
	// recoveries (75–82 s after the 3′), 180 s between rounds, cool-down.
	const round = 'A180 r80 A90 r60 A90 r60 A45 r60 A45 r60 A45 r60 A45'
	const laps = lapsOf(`A169 r75 ${round} r180 ${round} r180 ${round} A544`)
	// The warm-up (n = 0), recoveries and cool-down are easy.
	const hard = effort((sec, n) => n === 0 || n % 2 === 1 || sec > 500)(laps)
	const sets = lapSets(laps, hard)
	expect(sets.map((s) => s.work.length)).toEqual([1, 2, 4, 1, 2, 4, 1, 2, 4])
	expect(sets.flatMap((s) => s.work)).toHaveLength(21)
	expect(sets[0]!.work[0]!.endSec - sets[0]!.work[0]!.startSec).toBe(180)
})

test('a warm-up before equal timed reps is dropped even when it is not easy', () => {
	// "10x3.5 min": a 241 s warm-up at rep-like effort, a normal 61 s
	// recovery, then 10 × 210/60.
	const reps = Array.from({ length: 9 }, () => 'A210 r60').join(' ')
	const laps = lapsOf(`A241 r61 ${reps} A210 A389`)
	const sets = lapSets(laps, () => null)
	expect(sets).toHaveLength(1)
	expect(sets[0]!.work).toHaveLength(10)
	expect(sets[0]!.work.every((w) => w.endSec - w.startSec === 210)).toBe(true)
})
