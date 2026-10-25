/**
 * The session composer's state, as plain data and pure functions (owner
 * decisions 1, 4, 5 and 11, round 2; ADR 0088): which day, which sport, which
 * source, what the line says, what was picked, whether it was already done —
 * and from that, what one tap on _Legg til_ would write.
 *
 * Nothing here renders or posts. `composer.tsx` draws it; the composer's
 * context posts what {@link composerPost} returns to home's own action. Kept
 * apart so every rule the composer follows — the stamp as the empty state, a
 * pick that writes whole until it is changed, Annet and _Allerede gjort_ — is
 * a unit test away.
 */
import { STAMP_SENTENCE } from '#app/utils/day-stamp.ts'
import { type ComposerSourceKey } from '#app/utils/labels.ts'
import { type SummedWorkout } from '#app/utils/plan-outline/week-sum.ts'
import {
	type CardioDiscipline,
	type Discipline,
	isCardioDiscipline,
} from '#app/utils/workout-schema.ts'
import {
	type ParsedSentence,
	parseWorkoutSentence,
	type SentenceExercise,
} from '#app/utils/workout-sentence.ts'
import { type ComposerSourceItem } from '../../resources/composer-sources.tsx'
import { structureSentence } from './composer-sentence.ts'

/** The sport row: the four tracks' sports and **Annet** (owner decision 4). */
export type ComposerSport = Discipline | 'annet'
export const COMPOSER_SPORTS: readonly ComposerSport[] = [
	'run',
	'bike',
	'swim',
	'strength',
	'annet',
]

/** A session the line was filled from: a Catalogue row or another day's. */
export type ComposerPick = {
	source: Extract<ComposerSourceKey, 'bibliotek' | 'kopier'>
	item: ComposerSourceItem
}

export type ComposerState = {
	dayKey: string
	/** Null where nothing is prefilled and the athlete has not chosen yet. */
	sport: ComposerSport | null
	source: ComposerSourceKey
	text: string
	pick: ComposerPick | null
	/** _Allerede gjort_ — only offered on a day before today. */
	done: boolean
	notes: string
}

export function initialComposerState({
	dayKey,
	todayKey,
	prefill,
}: {
	dayKey: string
	todayKey: string
	prefill: Discipline | null
}): ComposerState {
	return {
		dayKey,
		sport: prefill,
		source: 'skriv',
		text: '',
		pick: null,
		// A session written on a day gone by is, most of the time, the athlete
		// saying what they did: the switch starts on there, and is one tap off.
		done: dayKey < todayKey,
		notes: '',
	}
}

export type ComposerAction =
	| { type: 'day'; dayKey: string; todayKey: string }
	| { type: 'sport'; sport: ComposerSport }
	| { type: 'source'; source: ComposerSourceKey }
	| { type: 'text'; text: string }
	| { type: 'pick'; pick: ComposerPick }
	| { type: 'clear-pick' }
	| { type: 'done'; done: boolean }
	| { type: 'notes'; notes: string }
	| { type: 'reset'; state: ComposerState }

export function composerReducer(
	state: ComposerState,
	action: ComposerAction,
): ComposerState {
	switch (action.type) {
		case 'day': {
			if (action.dayKey === state.dayKey) return state
			const wasPast = state.dayKey < action.todayKey
			const isPast = action.dayKey < action.todayKey
			// Crossing today resets the switch to the new side's default; moving
			// between two past days keeps what the athlete chose.
			return {
				...state,
				dayKey: action.dayKey,
				done: isPast ? (wasPast ? state.done : true) : false,
			}
		}
		case 'sport':
			return { ...state, sport: action.sport }
		case 'source':
			return { ...state, source: action.source }
		case 'text':
			return { ...state, text: action.text }
		case 'pick':
			return {
				...state,
				pick: action.pick,
				source: 'skriv',
				text: action.pick.item.sentence ?? '',
				sport: isComposerDiscipline(action.pick.item.discipline)
					? action.pick.item.discipline
					: state.sport,
			}
		case 'clear-pick':
			return { ...state, pick: null, text: '' }
		case 'done':
			return { ...state, done: action.done }
		case 'notes':
			return { ...state, notes: action.notes }
		case 'reset':
			return action.state
	}
}

function isComposerDiscipline(value: string): value is Discipline {
	return (
		value === 'run' ||
		value === 'bike' ||
		value === 'swim' ||
		value === 'strength'
	)
}

/**
 * The chip as the reader takes it: a sport the line can say — Styrke too,
 * since the line names lifts (ADR 0089) — or none, for Annet.
 */
export function readerChip(sport: ComposerSport | null): Discipline | null {
	return sport != null && sport !== 'annet' ? sport : null
}

/** The chip the stamp can write: a cardio sport (no lift is read off a tap). */
export function stampChip(
	sport: ComposerSport | null,
): CardioDiscipline | null {
	return sport != null && sport !== 'annet' && isCardioDiscipline(sport)
		? sport
		: null
}

/**
 * The line, read for the chip the athlete has chosen — lifts named against
 * the athlete's exercise catalogue once it has arrived. Null until then: a
 * lift waits (`exercisesNeeded`) rather than reading as a typo.
 */
export function readLine(
	text: string,
	sport: ComposerSport | null,
	exercises: readonly SentenceExercise[] | null = null,
): ParsedSentence {
	return parseWorkoutSentence(text, {
		discipline: readerChip(sport),
		exercises: exercises ?? undefined,
	})
}

/**
 * Whether the composer should fetch the exercise catalogue: the Styrke chip
 * is on, or the line already names a lift under another chip. A run never
 * pays for eight hundred names it will not read.
 */
export function needsExercises(
	state: Pick<ComposerState, 'sport'>,
	parsed: ParsedSentence,
): boolean {
	return state.sport === 'strength' || parsed.exercisesNeeded
}

/** What one tap on _Legg til_ would write, or why nothing yet. */
export type ComposerPlan =
	/** The empty state: the stamp, `45 min rolig` in the chip's sport. */
	| { kind: 'stamp'; discipline: CardioDiscipline }
	| { kind: 'sentence'; parsed: ParsedSentence }
	/** A pick the athlete has not changed: placed or copied whole. */
	| { kind: 'pick'; pick: ComposerPick }
	| {
			kind: 'none'
			/**
			 * `strength`: the Styrke chip with an empty line — a lift has to be
			 * named. `exercises`: the line names lifts and the catalogue they
			 * are read against has not arrived yet.
			 */
			reason: 'no-sport' | 'strength' | 'annet' | 'unread' | 'exercises'
	  }

export function composerPlan(
	state: ComposerState,
	parsed: ParsedSentence,
): ComposerPlan {
	const text = state.text.trim()
	if (state.pick) {
		const untouched =
			state.pick.item.sentence == null
				? text === ''
				: text === state.pick.item.sentence
		if (untouched) return { kind: 'pick', pick: state.pick }
	}
	if (text === '') {
		const chip = stampChip(state.sport)
		if (chip) return { kind: 'stamp', discipline: chip }
		return {
			kind: 'none',
			reason:
				state.sport === 'strength'
					? 'strength'
					: state.sport === 'annet'
						? 'annet'
						: 'no-sport',
		}
	}
	if (parsed.structure) return { kind: 'sentence', parsed }
	return {
		kind: 'none',
		reason: parsed.exercisesNeeded ? 'exercises' : 'unread',
	}
}

/** The stamp's structure, read by the same reader the line uses. */
export function stampShape(discipline: CardioDiscipline): SummedWorkout | null {
	return parseWorkoutSentence(STAMP_SENTENCE, { discipline }).structure
}

/** The session a plan would write, for the week sum before → after. */
export function planShape(plan: ComposerPlan): SummedWorkout | null {
	switch (plan.kind) {
		case 'stamp':
			return stampShape(plan.discipline)
		case 'sentence':
			return plan.parsed.structure
		case 'pick':
			return plan.pick.item.summed
		case 'none':
			return null
	}
}

/** Whether the _Allerede gjort_ switch is offered: a day gone by. */
export function offersDone(state: ComposerState, todayKey: string): boolean {
	return state.dayKey < todayKey
}

/**
 * The post one tap on _Legg til_ sends to home's action, or null when the
 * plan writes nothing. Every write lands by toast (ADR 0088), so the reply
 * carries the week's sum for the client's toast and its Angre.
 */
export function composerPost(
	state: ComposerState,
	plan: ComposerPlan,
	{ todayKey }: { todayKey: string },
): Record<string, string> | null {
	const extras: Record<string, string> = {}
	if (state.sport === 'annet') extras.annet = 'true'
	if (state.done && offersDone(state, todayKey)) extras.done = 'true'
	if (state.notes.trim()) extras.notes = state.notes.trim()
	const date = state.dayKey
	switch (plan.kind) {
		case 'stamp':
			return {
				intent: 'stamp-day',
				date,
				discipline: plan.discipline,
				landing: 'toast',
				...extras,
			}
		case 'sentence':
			return {
				intent: 'write-session',
				date,
				discipline: readerChip(state.sport) ?? '',
				sentence: state.text.trim(),
				landing: 'toast',
				...extras,
			}
		case 'pick':
			return plan.pick.source === 'bibliotek'
				? {
						intent: 'place-session',
						date,
						workoutId: plan.pick.item.id,
						...extras,
					}
				: {
						intent: 'copy-session',
						date,
						sessionId: plan.pick.item.id,
						...extras,
					}
		case 'none':
			return null
	}
}

/**
 * One block of the line's structure, nudged — its repeat count or the rest
 * after its work — and said back as the line, so the deep editor's steppers
 * and the line never disagree. Null when the result is not a line the reader
 * takes (`structureSentence` refuses), in which case the stepper does
 * nothing.
 */
export function nudgeBlock(
	structure: SummedWorkout,
	blockIndex: number,
	patch: { repeatCount?: number; restSec?: number | null },
): string | null {
	const blocks = structure.blocks.map((block, index) => {
		if (index !== blockIndex) return block
		const repeatCount = patch.repeatCount ?? block.repeatCount
		let steps = block.steps
		if (patch.restSec !== undefined) {
			const work = steps.filter((step) => step.kind !== 'rest')
			steps =
				patch.restSec == null || patch.restSec <= 0
					? work
					: [...work, { kind: 'rest' as const, durationSec: patch.restSec }]
		}
		return { ...block, repeatCount: Math.max(1, repeatCount), steps }
	})
	return structureSentence({ ...structure, blocks })
}
