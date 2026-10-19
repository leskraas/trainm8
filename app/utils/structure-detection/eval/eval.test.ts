import { expect, test } from 'vitest'
import { type ActivityStream } from '../../activity-stream.ts'
import { type DetectedStructure } from '../types.ts'
import {
	autoLaps,
	fitTemplate,
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
	expect(s.edges!.within10).toBe(6)
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
