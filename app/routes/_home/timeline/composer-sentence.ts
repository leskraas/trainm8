/**
 * A saved session said back as a line the composer's reader takes — so a pick
 * from **Bibliotek** or **Kopier** arrives in the line as tokens the athlete
 * can adjust, not as a sealed copy (owner decision 1, round 2; prototype C).
 *
 * The writing line's reader (`parseWorkoutSentence`) is the only judge: a
 * sentence is offered only when reading it back gives exactly the structure it
 * was made from. Anything the line cannot say — a strength step, a cadence, a
 * second step inside a repeat, a power target — returns `null`, and the
 * composer places that session whole instead, through the server's own copy
 * (`placeCatalogueSession`, `copySessionToDay`). Nothing is approximated: a
 * sentence that would save something else than the source is not a sentence
 * we offer.
 *
 * Consumes the reader through its exported API only; the grammar it writes is
 * the small one the reader documents (`6x1000 m terskel p 90 s`, `45 min
 * rolig`, `4:30/km`). The zone words are the reader's own vocabulary.
 */
import { type SummedWorkout } from '#app/utils/plan-outline/week-sum.ts'
import {
	type CardioDiscipline,
	type IntensityTarget,
	isCardioDiscipline,
} from '#app/utils/workout-schema.ts'
import { parseWorkoutSentence } from '#app/utils/workout-sentence.ts'
import { ZONE_WORDS } from '#app/utils/zones/words.ts'

/**
 * The words the reader stores as each zone — its own vocabulary, round-tripped.
 * A stored code (`Z4`, from before the reader wrote words, #627) has no word the
 * reader would store it back as, so that session is placed whole.
 */
const STORED_ZONE_WORDS: ReadonlySet<string> = new Set(
	Object.values(ZONE_WORDS),
)

type Block = SummedWorkout['blocks'][number]
type Step = Block['steps'][number]

/** `1000 m` for an interval, `10 km` for a run: how a track athlete says it. */
function distanceWords(metres: number): string {
	return metres >= 2000 && metres % 1000 === 0
		? `${metres / 1000} km`
		: `${metres} m`
}

function durationWords(seconds: number): string {
	if (seconds % 60 !== 0) return `${seconds} s`
	return `${seconds / 60} min`
}

function clock(secPerKm: number): string {
	const whole = Math.round(secPerKm)
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function intensityWords(intensity: IntensityTarget | undefined): string | null {
	if (!intensity) return ''
	if (intensity.kind === 'zoneLabel')
		return STORED_ZONE_WORDS.has(intensity.label) ? intensity.label : null
	if (intensity.kind === 'pace') {
		const max = intensity.maxSecPerKm
		return max != null
			? `${clock(intensity.minSecPerKm)}-${clock(max)}/km`
			: `${clock(intensity.minSecPerKm)}/km`
	}
	return null
}

function quantityWords(step: Step): string | null {
	if (step.kind !== 'cardio') return null
	if (step.distanceM != null && step.durationSec == null)
		return distanceWords(step.distanceM)
	if (step.durationSec != null && step.distanceM == null)
		return durationWords(step.durationSec)
	return null
}

function blockWords(block: Block): string | null {
	const [first, second, ...more] = block.steps
	if (!first || more.length > 0) return null
	// A rest on its own joins the repeat before it when read back, so it is
	// said the way the reader takes it: `1 min pause`.
	if (first.kind === 'rest') {
		if (second || block.repeatCount !== 1 || first.durationSec == null)
			return null
		return `${durationWords(first.durationSec)} pause`
	}
	const quantity = quantityWords(first)
	if (quantity == null || first.kind !== 'cardio') return null
	const intensity = intensityWords(first.intensity)
	if (intensity == null) return null
	if (second && (second.kind !== 'rest' || second.durationSec == null))
		return null
	const repeat = block.repeatCount > 1 ? `${block.repeatCount}x` : ''
	const rest =
		second?.kind === 'rest' && second.durationSec != null
			? ` p ${durationWords(second.durationSec)}`
			: ''
	return `${repeat}${quantity}${intensity ? ` ${intensity}` : ''}${rest}`
}

/** The fields the reader writes, in a stable order, for a strict comparison. */
function plain(workout: SummedWorkout) {
	return workout.blocks.map((block) => ({
		repeatCount: block.repeatCount,
		steps: block.steps.map((step) =>
			step.kind === 'rest'
				? { kind: 'rest', durationSec: step.durationSec ?? null }
				: step.kind === 'cardio'
					? {
							kind: 'cardio',
							discipline: step.discipline,
							distanceM: step.distanceM ?? null,
							durationSec: step.durationSec ?? null,
							intensity: step.intensity ?? null,
						}
					: { kind: step.kind },
		),
	}))
}

/**
 * The line that reads back to exactly `workout`, or null when the line
 * cannot say it. `seriesRepeatCount` and the other block extras are not in
 * `SummedWorkout`'s shape for the line, so a block carrying one is refused by
 * the comparison rather than silently flattened.
 */
export function structureSentence(workout: SummedWorkout): string | null {
	if (!isCardioDiscipline(workout.discipline)) return null
	if (workout.blocks.length === 0) return null
	if (
		workout.blocks.some(
			(block) =>
				(block as { seriesRepeatCount?: number | null }).seriesRepeatCount !=
					null &&
				(block as { seriesRepeatCount?: number | null }).seriesRepeatCount !==
					1,
		)
	)
		return null
	const parts = workout.blocks.map(blockWords)
	if (parts.some((part) => part == null)) return null
	const sentence = parts.join(' + ')
	const read = parseWorkoutSentence(sentence, {
		discipline: workout.discipline as CardioDiscipline,
	})
	if (!read.structure) return null
	return JSON.stringify(plain(read.structure)) ===
		JSON.stringify(plain(workout))
		? sentence
		: null
}
