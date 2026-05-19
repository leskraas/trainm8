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

export const TARGET_KINDS = [
	{ value: '', label: 'No target' },
	{ value: 'finish', label: 'Finish' },
	{ value: 'time', label: 'Time' },
	{ value: 'pace', label: 'Pace' },
	{ value: 'distance', label: 'Distance' },
	{ value: 'placement', label: 'Placement' },
	{ value: 'qualitative', label: 'Qualitative' },
] as const

export const EventFormSchema = z.object({
	name: z.string().min(1, 'Name is required').max(120),
	kind: z.enum(EVENT_KINDS),
	priority: z.enum(EVENT_PRIORITIES),
	startDate: z.string().min(1, 'Start date is required'),
	endDate: z.string().optional(),
	location: z.string().optional(),
	notes: z.string().optional(),
	targetKind: z.string().optional(),
	targetSeconds: z.string().optional(),
	targetSecPerKm: z.string().optional(),
	targetMeters: z.string().optional(),
	targetPosition: z.string().optional(),
	targetDescription: z.string().optional(),
})
export type EventFormValues = z.infer<typeof EventFormSchema>

export function buildEventTarget(values: EventFormValues): EventTarget | null {
	const {
		targetKind,
		targetSeconds,
		targetSecPerKm,
		targetMeters,
		targetPosition,
		targetDescription,
	} = values
	if (targetKind === 'time' && targetSeconds)
		return { kind: 'time', seconds: Number(targetSeconds) }
	if (targetKind === 'pace' && targetSecPerKm)
		return { kind: 'pace', secPerKm: Number(targetSecPerKm) }
	if (targetKind === 'distance' && targetMeters)
		return { kind: 'distance', meters: Number(targetMeters) }
	if (targetKind === 'placement' && targetPosition)
		return { kind: 'placement', position: Number(targetPosition) }
	if (targetKind === 'finish') return { kind: 'finish' }
	if (targetKind === 'qualitative' && targetDescription)
		return { kind: 'qualitative', description: targetDescription }
	return null
}

export function buildEventAuthoringInput(
	values: EventFormValues,
	disciplines: string[],
) {
	return {
		name: values.name,
		kind: values.kind,
		priority: values.priority,
		startDate: new Date(values.startDate),
		endDate: values.endDate ? new Date(values.endDate) : null,
		disciplines,
		target: buildEventTarget(values),
		location: values.location || null,
		notes: values.notes || null,
		status: 'planned' as const,
	}
}

export function eventStatusVariant(
	status: EventStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
	if (status === 'completed') return 'default'
	if (status === 'cancelled') return 'destructive'
	return 'secondary'
}
