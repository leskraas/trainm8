/**
 * The open-ended plan's two questions (ADR 0079, #505 story 1): which endurance
 * Discipline, and how many hours a week. Endurance only, because the plan's one
 * track is measured in hours, and a strength track speaks sets (ADR 0043 §2).
 *
 * One schema for both places that ask them — _Hold meg aktiv_ on Sesong's plan
 * creation and the first run's questions — so the two can never hold an answer
 * to different rules.
 */

import { z } from 'zod/v3'
import { OPEN_ENDED_FORM_LABELS } from '../labels.ts'
import { CARDIO_DISCIPLINES } from '../workout-schema.ts'

/** The most hours a week either form takes. */
export const MAX_WEEKLY_HOURS = 40

const L = OPEN_ENDED_FORM_LABELS

export const OpenEndedFieldsSchema = z.object({
	discipline: z.enum(CARDIO_DISCIPLINES, {
		errorMap: () => ({ message: L.disciplineRequired }),
	}),
	hours: z.coerce
		.number({ errorMap: () => ({ message: L.hoursRequired }) })
		.positive(L.hoursPositive)
		.max(MAX_WEEKLY_HOURS, L.hoursMax),
})
