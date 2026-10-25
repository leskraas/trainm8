/**
 * **The reps a workout is drawn with** — the one walk the Workout Shape
 * (`deriveSessionProfile`) and the telemetry card's planned bands both read, so
 * they draw the same steps in the same order and collapse a dense plan by the
 * same rule.
 *
 * A plan is drawn rep by rep while that fits: blocks in order, each repeated
 * `blockRepeatTotal` times, steps in order. Past {@link MAX_DRAWN_STEPS} the
 * blocks with the most reps are thinned to a common number of reps — the most
 * that fits — and each drawn rep carries its share of the block's time, so
 * width stays time. A thinned block still reads as its work and its
 * recoveries, each in its own target, never as one sustained effort; a block
 * with few reps beside a huge one keeps every rep; and which block comes first
 * makes no difference (#638).
 */
import { blockRepeatTotal } from './workout-schema.ts'

/** More steps than any chart or profile has pixels for: `100 × 100 × 10 s`
 * is 10 000 reps. */
export const MAX_DRAWN_STEPS = 400

type RepSet = { kind: string; durationSec?: number | null }

/** What a step needs to be drawn: where it sits, and how long it lasts. */
type RepStep = {
	id: string
	orderIndex: number
	kind: string
	durationSec?: number | null
	restBetweenSetsSec?: number | null
	sets?: ReadonlyArray<RepSet>
}

type RepBlock<S extends RepStep> = {
	orderIndex: number
	repeatCount: number
	seriesRepeatCount?: number | null
	steps: ReadonlyArray<S>
}

/** One drawn step: its step, and the time it stands for (one rep's, times
 * the reps each drawn rep stands for). */
export type DrawnStep<S> = { id: string; step: S; durationSec: number }

/** A `× N` bracket over the drawn steps of a block that repeats. */
export type DrawnGroup = {
	/** Index of the first drawn step the group spans. */
	startIndex: number
	/** Number of consecutive drawn steps it spans. */
	span: number
	/** The block's repeat count, every rep, drawn or not. */
	repeatCount: number
}

/** A step's Step Duration: a strength step's timed sets and the rests between
 * them, any other step its `durationSec`. */
export function stepDurationSec(step: RepStep): number {
	if (step.kind === 'strength') {
		const sets = step.sets ?? []
		const setsDuration = sets.reduce(
			(sum, s) =>
				sum + (s.kind === 'timed' && s.durationSec ? s.durationSec : 0),
			0,
		)
		const restContribution =
			step.restBetweenSetsSec && sets.length > 1
				? step.restBetweenSetsSec * (sets.length - 1)
				: 0
		return setsDuration + restContribution
	}
	return step.durationSec ?? 0
}

/**
 * `read` memoized per step: a drawn rep repeats its step, so whatever a
 * reader derives from a step (its zone, its target band) is worked out once
 * per step, not once per rep. Keyed by the step itself.
 */
export function perStep<S, T>(read: (step: S) => T): (step: S) => T {
	const memo = new Map<S, T>()
	return (step) => {
		if (!memo.has(step)) memo.set(step, read(step))
		return memo.get(step)!
	}
}

const byOrder = (a: { orderIndex: number }, b: { orderIndex: number }) =>
	a.orderIndex - b.orderIndex

/**
 * The most reps any block may be drawn with so the whole plan fits in `max`
 * steps: every rep when it fits, else the largest common cap (at least 1).
 */
function repCap(
	blocks: ReadonlyArray<{ reps: number; width: number }>,
	max: number,
): number {
	const drawnAt = (cap: number) =>
		blocks.reduce((sum, b) => sum + Math.min(b.reps, cap) * b.width, 0)
	const most = blocks.reduce((m, b) => Math.max(m, b.reps), 1)
	if (drawnAt(most) <= max) return most
	let lo = 1
	let hi = most
	while (lo < hi) {
		// Arithmetic, not `>> 1`: reps × series can pass 2³¹ and wrap a bitwise
		// midpoint, which then never moves.
		const mid = Math.floor((lo + hi + 1) / 2)
		if (drawnAt(mid) <= max) lo = mid
		else hi = mid - 1
	}
	return lo
}

/** The steps a workout is drawn with, and the `× N` brackets over them. */
export function workoutReps<S extends RepStep>(
	workout: { blocks: ReadonlyArray<RepBlock<S>> } | null,
	max: number = MAX_DRAWN_STEPS,
): { steps: DrawnStep<S>[]; groups: DrawnGroup[] } {
	if (!workout) return { steps: [], groups: [] }
	const blocks = workout.blocks
		.slice()
		.sort(byOrder)
		.map((block) => {
			const steps = block.steps.slice().sort(byOrder)
			return { steps, reps: blockRepeatTotal(block), width: steps.length }
		})
	const cap = repCap(blocks, max)
	const steps: DrawnStep<S>[] = []
	const groups: DrawnGroup[] = []
	for (const block of blocks) {
		const drawnReps = Math.min(block.reps, cap)
		const weight = block.reps / drawnReps
		const start = steps.length
		for (let r = 0; r < drawnReps; r++) {
			for (const step of block.steps) {
				steps.push({
					id: block.reps > 1 ? `${step.id}-r${r}` : step.id,
					step,
					durationSec: stepDurationSec(step) * weight,
				})
			}
		}
		if (block.reps > 1 && block.width > 0) {
			groups.push({
				startIndex: start,
				span: steps.length - start,
				repeatCount: block.reps,
			})
		}
	}
	return { steps, groups }
}
