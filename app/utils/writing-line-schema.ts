/**
 * The writing line's posts and reads, as schemas (#505 S11): the action's
 * `write-session` intent and the week-sum resource's `day` parameter.
 */
import { z } from 'zod'
import { DayKeySchema } from './calendar-key-schema.ts'
import { DISCIPLINES } from './workout-schema.ts'
import { MAX_SENTENCE_LENGTH } from './workout-sentence.ts'

export const WriteSessionSchema = z.object({
	intent: z.literal('write-session'),
	date: DayKeySchema,
	/**
	 * The chip; empty when none is chosen and the sentence names its sport.
	 * Styrke included: a sentence of lifts is read under it (ADR 0089).
	 */
	discipline: z.preprocess(
		(value) => (value === '' ? undefined : value),
		z.enum(DISCIPLINES).optional(),
	),
	sentence: z.string().trim().min(1).max(MAX_SENTENCE_LENGTH),
	/**
	 * Where the write lands for the athlete. `row` (the default): the tapped
	 * day's draft, whose row opens as its Token Sentence with Angre. `toast`:
	 * "+ Ny" → "Skriv en økt", whose day may be anywhere in the list — the
	 * reply carries the week's sum instead of flashing it, so the client's
	 * toast can say it *and* carry Angre (ADR 0082 S11, ADR 0076).
	 */
	landing: z.enum(['row', 'toast']).optional(),
})

export const WeekSumQuerySchema = z.object({ day: DayKeySchema })
