/**
 * The writing line's posts and reads, as schemas (#505 S11): the action's
 * `write-session` intent and the week-sum resource's `day` parameter.
 */
import { z } from 'zod'
import { CARDIO_DISCIPLINES } from './workout-schema.ts'
import { MAX_SENTENCE_LENGTH } from './workout-sentence.ts'

/** `YYYY-MM-DD` — the shape. Whether it is a real day is the calendar's call. */
export const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const WriteSessionSchema = z.object({
	intent: z.literal('write-session'),
	date: DayKeySchema,
	/** The chip; empty when none is chosen and the sentence names its sport. */
	discipline: z.preprocess(
		(value) => (value === '' ? undefined : value),
		z.enum(CARDIO_DISCIPLINES).optional(),
	),
	sentence: z.string().trim().min(1).max(MAX_SENTENCE_LENGTH),
})

export const WeekSumQuerySchema = z.object({ day: DayKeySchema })
