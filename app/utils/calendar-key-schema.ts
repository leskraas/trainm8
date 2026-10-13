/**
 * The calendar's keys as schemas, for every form, payload and query that
 * carries one: a day as `YYYY-MM-DD`, and a Training Week by its Monday. One
 * definition, so a key the writing line accepts is one the week change and a
 * stored proposal accept too.
 *
 * The shape only: whether a day exists in the athlete's calendar is
 * `isCalendarDay`'s call, which needs the Athlete Timezone.
 */

import { z } from 'zod/v3'
import { weekdayIndex } from './athlete-calendar.ts'

/** `YYYY-MM-DD`. */
export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const DayKeySchema = z.string().regex(DAY_KEY_PATTERN)

/** A Training Week, named by its Monday (ADR 0019). */
export const WeekKeySchema = DayKeySchema.refine(
	(key) => weekdayIndex(key) === 0,
	'A week is named by its Monday',
)
