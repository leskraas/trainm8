/**
 * **A stored generated plan, as the generator's request** (ADR 0119 §2).
 *
 * The bridge between a Plan Outline's rows (`from-rows.ts`) plus its
 * **Generation Record**, and what `SeasonGenerator.placeWeeks` takes. Pure: the
 * caller reads the rows, this states what they mean to the placement.
 *
 * The record says nothing the rows already hold. The phases, rhythms, easy
 * weeks, tapers and each track's **Quality Session Mix** are the plan's own as
 * it now stands, so an edited plan is laid as edited; the days and the intent
 * are the record's, frozen at approval; the goal event is read off the Event.
 */
import { goalEventFor } from '../plan-generation/goal-event.ts'
import {
	DEFAULT_GENERATION_INTENT,
	GENERATION_INTENTS,
	INTENT_LEVEL_FLOOR,
	type GeneratedDay,
	type GenerationIntent,
	type PlaceWeeksRequest,
} from '../plan-generation/season.ts'
import { CARDIO_DISCIPLINES, isCardioDiscipline } from '../workout-schema.ts'
import { phaseSpecs, resolvedTracks, type OutlineRows } from './from-rows.ts'
import { isPatternWeekday } from './week-pattern.ts'

/** A Generation Record as the placement reads it. */
export type GenerationRecordRows = {
	intent: string | null
	days: ReadonlyArray<{ discipline: string; weekday: number; role: string }>
}

/**
 * A record's stored days, read once into the generator's terms. The database's
 * CHECKs hold each column to its vocabulary, so nothing is dropped here but a
 * row that could never have been written.
 */
export function recordedDays(
	days: GenerationRecordRows['days'],
): GeneratedDay[] {
	return days.flatMap((day) => {
		const discipline = CARDIO_DISCIPLINES.find((d) => d === day.discipline)
		if (!discipline || !isPatternWeekday(day.weekday)) return []
		return [
			{
				discipline,
				weekday: day.weekday,
				role: day.role === 'long' ? ('long' as const) : ('ordinary' as const),
			},
		]
	})
}

/** A stored intent, or the default for one never recorded (or unknown). */
export function recordedIntent(intent: string | null): GenerationIntent {
	return (GENERATION_INTENTS as readonly string[]).includes(intent ?? '')
		? (intent as GenerationIntent)
		: DEFAULT_GENERATION_INTENT
}

/**
 * The request that places `weekIndices` of a stored generated plan. A track
 * with no stored days places nothing (a track added after approval, or
 * strength: ADR 0119's consequences), so it is left out.
 */
export function storedPlaceWeeksRequest(
	rows: OutlineRows,
	record: GenerationRecordRows,
	eventTarget: string | null,
	weekIndices: readonly number[],
): PlaceWeeksRequest {
	const phases = phaseSpecs(rows)
	const recorded = recordedDays(record.days)
	return {
		startWeekKey: rows.startWeekKey,
		phases,
		tracks: resolvedTracks(rows).flatMap((track) => {
			const discipline = track.discipline
			if (!isCardioDiscipline(discipline)) return []
			const days = recorded.flatMap((day) =>
				day.discipline === discipline
					? [{ weekday: day.weekday, role: day.role }]
					: [],
			)
			if (days.length === 0) return []
			return [
				{
					discipline,
					mixes: phases.map(
						(_, phaseIndex) =>
							track.segments.find(
								(segment) => segment.phaseIndex === phaseIndex,
							)?.mix ?? [],
					),
					days,
				},
			]
		}),
		goalEvent: goalEventFor(eventTarget),
		level: INTENT_LEVEL_FLOOR[recordedIntent(record.intent)],
		weekIndices,
	}
}
