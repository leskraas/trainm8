import { expect, test } from 'vitest'
import { MAX_DRAWN_STEPS, workoutReps } from './workout-reps.ts'

type Step = {
	id: string
	orderIndex: number
	kind: string
	durationSec: number | null
}

function block(
	id: string,
	orderIndex: number,
	reps: number,
	steps: Array<[string, number]>,
) {
	return {
		id,
		orderIndex,
		repeatCount: reps,
		seriesRepeatCount: null,
		steps: steps.map(
			([stepId, durationSec], i): Step => ({
				id: stepId,
				orderIndex: i,
				kind: 'cardio',
				durationSec,
			}),
		),
	}
}

const total = (steps: Array<{ durationSec: number }>) =>
	steps.reduce((sum, s) => sum + s.durationSec, 0)

test('a workout that fits draws every rep', () => {
	const { steps, groups } = workoutReps({
		blocks: [
			block('wu', 0, 1, [['wu', 600]]),
			block('main', 1, 3, [
				['on', 60],
				['off', 30],
			]),
		],
	})
	expect(steps.map((s) => s.id)).toEqual([
		'wu',
		'on-r0',
		'off-r0',
		'on-r1',
		'off-r1',
		'on-r2',
		'off-r2',
	])
	expect(steps.map((s) => s.durationSec)).toEqual([600, 60, 30, 60, 30, 60, 30])
	expect(groups).toEqual([{ startIndex: 1, span: 6, repeatCount: 3 }])
})

test('a block too long to draw rep by rep keeps its work and its recoveries apart', () => {
	// 10 000 reps of 10 s on, 10 s off: thinned to the reps that fit, each
	// carrying its share of the block's time, still on, off, on, off.
	const { steps, groups } = workoutReps({
		blocks: [
			block('main', 0, 10_000, [
				['on', 10],
				['off', 10],
			]),
		],
	})
	expect(steps.length).toBeLessThanOrEqual(MAX_DRAWN_STEPS)
	expect(steps.length).toBeGreaterThan(2)
	expect(steps.slice(0, 4).map((s) => s.step.id)).toEqual([
		'on',
		'off',
		'on',
		'off',
	])
	// Width is time: the drawn reps add up to all 10 000.
	expect(total(steps)).toBeCloseTo(200_000)
	expect(groups).toEqual([
		{ startIndex: 0, span: steps.length, repeatCount: 10_000 },
	])
})

test('a big block is thinned, never the small one beside it, whichever comes first', () => {
	const small = (orderIndex: number) =>
		block('small', orderIndex, 5, [
			['s-on', 60],
			['s-off', 60],
		])
	const big = (orderIndex: number) =>
		block('big', orderIndex, 5000, [
			['b-on', 10],
			['b-off', 10],
		])
	for (const blocks of [
		[small(0), big(1)],
		[big(0), small(1)],
	]) {
		const { steps } = workoutReps({ blocks })
		expect(steps.length).toBeLessThanOrEqual(MAX_DRAWN_STEPS)
		// The small block keeps every one of its 5 reps.
		expect(steps.filter((s) => s.step.id === 's-on')).toHaveLength(5)
		expect(total(steps.filter((s) => s.step.id.startsWith('s-')))).toBeCloseTo(
			600,
		)
		expect(total(steps.filter((s) => s.step.id.startsWith('b-')))).toBeCloseTo(
			100_000,
		)
	}
})

test('no workout draws nothing', () => {
	expect(workoutReps(null)).toEqual({ steps: [], groups: [] })
})
