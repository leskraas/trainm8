import { z } from 'zod'
import { DISCIPLINES, type Discipline } from './workout-schema.ts'

export const EVENT_KINDS = ['race', 'time-trial', 'fitness-goal'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
	race: 'Race',
	'time-trial': 'Time Trial',
	'fitness-goal': 'Fitness Goal',
}

export const EVENT_PRIORITIES = ['A', 'B', 'C'] as const
export type EventPriority = (typeof EVENT_PRIORITIES)[number]

export const EVENT_STATUSES = ['planned', 'completed', 'cancelled'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
	planned: 'Planned',
	completed: 'Completed',
	cancelled: 'Cancelled',
}

export const EventTargetSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('time'), seconds: z.number().int().positive() }),
	z.object({ kind: z.literal('pace'), secPerKm: z.number().positive() }),
	z.object({
		kind: z.literal('distance'),
		meters: z.number().int().positive(),
	}),
	z.object({ kind: z.literal('placement'), position: z.number().int().min(1) }),
	z.object({ kind: z.literal('finish') }),
	z.object({ kind: z.literal('qualitative'), description: z.string().min(1) }),
])
export type EventTarget = z.infer<typeof EventTargetSchema>

export const EventAuthoringSchema = z
	.object({
		name: z
			.string()
			.min(1, 'Name is required')
			.max(120, 'Name must be 120 characters or fewer'),
		kind: z.enum(EVENT_KINDS, {
			errorMap: () => ({ message: 'Please select an event kind' }),
		}),
		priority: z.enum(EVENT_PRIORITIES, {
			errorMap: () => ({ message: 'Please select a priority' }),
		}),
		startDate: z.coerce.date({
			errorMap: () => ({ message: 'A valid start date is required' }),
		}),
		endDate: z.coerce.date().nullable().optional(),
		disciplines: z
			.array(z.enum(DISCIPLINES))
			.min(1, 'At least one discipline is required'),
		target: EventTargetSchema.nullable().optional(),
		location: z.string().max(120).nullable().optional(),
		status: z.enum(EVENT_STATUSES).default('planned'),
		notes: z.string().max(2000).nullable().optional(),
		resultSessionId: z.string().nullable().optional(),
	})
	.refine((data) => !data.endDate || data.endDate >= data.startDate, {
		message: 'End date must be on or after start date',
		path: ['endDate'],
	})

export type EventAuthoringInput = z.infer<typeof EventAuthoringSchema>

export function parseEventDisciplines(raw: string): Discipline[] {
	try {
		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) return []
		return parsed.filter((d): d is Discipline =>
			(DISCIPLINES as readonly string[]).includes(d as string),
		)
	} catch {
		return []
	}
}

export function parseEventTarget(raw: string | null): EventTarget | null {
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as unknown
		const result = EventTargetSchema.safeParse(parsed)
		return result.success ? result.data : null
	} catch {
		return null
	}
}
