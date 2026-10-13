/**
 * The composer's posts and reads, as schemas (#505 S11, round 2 owner
 * decisions 1–5): the action's `write-session`, `place-session` and
 * `copy-session` intents, what every one of them may add (Annet, _Allerede
 * gjort_, a note), and the week-sum and sources resources' parameters.
 */
import { z } from 'zod/v3'
import { DayKeySchema } from './calendar-key-schema.ts'
import { DISCIPLINES } from './workout-schema.ts'
import { MAX_SENTENCE_LENGTH } from './workout-sentence.ts'

/** The longest note the composer's "Gjør grundigere" takes. */
export const MAX_COMPOSER_NOTE_LENGTH = 1000

/** A checkbox-ish flag as a form posts it: `'true'` or absent. */
const Flag = z.preprocess(
	(value) => value === 'true' || value === 'on' || value === true,
	z.boolean(),
)

/**
 * What every composer write may say beside its session: count it in **Annet**
 * (owner decision 4), write it **already done** on a past day (decision 5), and
 * a note from the full snap. Absent means no, no and none.
 */
export const ComposerExtrasSchema = z.object({
	annet: Flag.optional(),
	done: Flag.optional(),
	notes: z.preprocess(
		(value) => (typeof value === 'string' ? value.trim() : value),
		z.string().max(MAX_COMPOSER_NOTE_LENGTH).optional(),
	),
})
export type ComposerExtras = z.infer<typeof ComposerExtrasSchema>

/**
 * Where the write lands for the athlete. `row` (the default): the reply
 * flashes the week's sum. `toast`: the composer's — the reply carries the
 * week's sum instead of flashing it, so the client's toast can say it *and*
 * carry Angre (ADR 0088, amending ADR 0076).
 */
const Landing = z.enum(['row', 'toast']).optional()

export const WriteSessionSchema = ComposerExtrasSchema.extend({
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
	landing: Landing,
})

/** A Catalogue session put on a day from the composer's Bibliotek. */
export const PlaceSessionSchema = ComposerExtrasSchema.extend({
	intent: z.literal('place-session'),
	date: DayKeySchema,
	workoutId: z.string().min(1),
})

/** Another day's session copied onto a day from the composer's Kopier. */
export const CopySessionSchema = ComposerExtrasSchema.extend({
	intent: z.literal('copy-session'),
	date: DayKeySchema,
	sessionId: z.string().min(1),
})

export const WeekSumQuerySchema = z.object({ day: DayKeySchema })

/** The composer's sources: the day they are for, and how far back Kopier reads. */
export const ComposerSourcesQuerySchema = z.object({
	day: DayKeySchema,
	discipline: z.enum(['run', 'bike', 'swim', 'strength']).optional(),
	/** Kopier's week: 1 is the week before the day's (the default), 2 the one before. */
	weeksBack: z.coerce.number().int().min(1).max(26).optional(),
})
