/**
 * The one schema of _Legg til et løp_ (#505 stories 7–8, ADR 0079 §4), read by
 * the plan page's form on the client and by its action on the server.
 *
 * Two ways in, and exactly one of them: an upcoming Event the athlete already
 * has, or a race named and dated on the spot — whose name and date are the
 * Event form's own fields (`EventFormSchema`), so a race made here is held to
 * the rules of one made on the Events page. The output says which, so the
 * action never has to guess from what is blank.
 */

import { z } from 'zod'
import { DAY_KEY_PATTERN } from '#app/utils/calendar-key-schema.ts'
import { EventFormSchema } from '#app/utils/event-schema.ts'
import { ATTACH_EVENT_LABELS } from '#app/utils/labels.ts'

export const AttachEventFormSchema = z
	.object({
		intent: z.literal('attach-event'),
		outlineId: z.string().min(1),
		eventId: z.string().min(1).optional(),
		name: EventFormSchema.shape.name.optional(),
		startDate: EventFormSchema.shape.startDate
			.regex(DAY_KEY_PATTERN, ATTACH_EVENT_LABELS.dateMissing)
			.optional(),
	})
	.superRefine((value, ctx) => {
		const naming = value.name != null || value.startDate != null
		if (value.eventId != null && naming) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['eventId'],
				message: ATTACH_EVENT_LABELS.notBoth,
			})
			return
		}
		if (value.eventId == null && !naming) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: ATTACH_EVENT_LABELS.pickOne,
			})
			return
		}
		if (value.eventId != null) return
		if (value.name == null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['name'],
				message: ATTACH_EVENT_LABELS.nameMissing,
			})
		}
		if (value.startDate == null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['startDate'],
				message: ATTACH_EVENT_LABELS.dateMissing,
			})
		}
	})
	.transform(({ outlineId, eventId, name, startDate }) => ({
		outlineId,
		choice:
			eventId != null
				? { kind: 'event' as const, eventId }
				: {
						kind: 'race' as const,
						name: name ?? '',
						startDate: new Date(startDate ?? ''),
					},
	}))
