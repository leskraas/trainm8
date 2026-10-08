// The first run's forms and the answers it carries from step to step (#505
// stories 63–69). The answers travel in the URL, so a step can be reloaded,
// gone back to, or shared with no state on the server until the plan is made.

import { z } from 'zod'
import { PRESET_FAMILIES, type PresetFamily } from '../plan-outline/presets.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { CARDIO_DISCIPLINES, type CardioDiscipline } from '../workout-schema.ts'

const DisciplineSchema = z.enum(CARDIO_DISCIPLINES, {
	errorMap: () => ({ message: 'Velg en aktivitet' }),
})

const HoursSchema = z.coerce
	.number({ errorMap: () => ({ message: 'Skriv hvor mange timer i uka' }) })
	.positive('Mer enn null timer i uka')
	.max(40, 'Høyst 40 timer i uka')

/** Monday-first weekdays (0 = mandag), de-duplicated and in week order. */
const DaysSchema = z
	.array(z.coerce.number().int().min(0).max(6), {
		errorMap: () => ({ message: 'Velg minst én dag' }),
	})
	.min(1, 'Velg minst én dag')
	.transform(
		(days) => [...new Set(days)].sort((a, b) => a - b) as PatternWeekday[],
	)

const DateSchema = z
	.string({ errorMap: () => ({ message: 'Velg en dato' }) })
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Velg en dato')

/** "Noe er feil": the pre-fill, set right (story 63). */
export const FindingCorrectionSchema = z.object({
	discipline: DisciplineSchema,
	hours: HoursSchema,
	days: DaysSchema,
})

export const GOALS = ['active', 'event'] as const

/** The three questions (story 64), plus the sport the plan is for. */
export const QuestionsSchema = z
	.object({
		discipline: DisciplineSchema,
		goal: z.enum(GOALS, {
			errorMap: () => ({ message: 'Velg hva du trener mot' }),
		}),
		eventName: z.string().trim().max(120).optional(),
		eventDate: z.string().optional(),
		hours: HoursSchema,
		days: DaysSchema,
	})
	.superRefine((answers, ctx) => {
		if (answers.goal !== 'event') return
		if (!answers.eventName) {
			ctx.addIssue({
				code: 'custom',
				path: ['eventName'],
				message: 'Skriv hva løpet heter',
			})
		}
		if (!DateSchema.safeParse(answers.eventDate).success) {
			ctx.addIssue({
				code: 'custom',
				path: ['eventDate'],
				message: 'Velg en dato',
			})
		}
	})

/** The philosophy switch on the plan screen (story 67). */
export const FamilySwitchSchema = z.object({
	family: z.enum(PRESET_FAMILIES, {
		errorMap: () => ({ message: 'Velg en filosofi' }),
	}),
})

/**
 * Why the first run's plan cannot be made: the athlete has one already, the
 * race is too close to lay weeks toward, or the answers lay no session.
 */
export const FIRST_RUN_PLAN_REFUSALS = [
	'plan-already-active',
	'event-too-soon',
	'nothing-to-lay',
] as const
export type FirstRunPlanRefusal = (typeof FIRST_RUN_PLAN_REFUSALS)[number]

export const FIRST_RUN_CREATE_INTENTS = ['create', 'self'] as const

/** The last screen's two ways out: I dag, or Sesong to set it up yourself. */
export const FirstRunCreateSchema = z.object({
	intent: z.enum(FIRST_RUN_CREATE_INTENTS),
})

export type FirstRunGoal =
	| { kind: 'active' }
	| { kind: 'event'; name: string; date: string }

/** Everything the plan is made from, as the URL carries it. */
export type FirstRunAnswers = {
	discipline: CardioDiscipline
	hours: number
	days: PatternWeekday[]
	goal: FirstRunGoal
	/** The philosophy the athlete switched to, or null to take the proposal. */
	family: PresetFamily | null
}

const AnswersSearchSchema = z.object({
	discipline: DisciplineSchema,
	hours: HoursSchema,
	days: z
		.string()
		.transform((value) => value.split(',').filter(Boolean))
		.pipe(DaysSchema),
	goal: z.enum(GOALS),
	name: z.string().trim().min(1).max(120).optional(),
	date: DateSchema.optional(),
	family: z.enum(PRESET_FAMILIES).optional(),
})

/** The answers in the URL, or null where they are missing or malformed. */
export function readAnswers(search: URLSearchParams): FirstRunAnswers | null {
	const parsed = AnswersSearchSchema.safeParse(Object.fromEntries(search))
	if (!parsed.success) return null
	const { goal, name, date, family, ...rest } = parsed.data
	if (goal === 'event' && (!name || !date)) return null
	return {
		...rest,
		goal:
			goal === 'event' && name && date
				? { kind: 'event', name, date }
				: { kind: 'active' },
		family: family ?? null,
	}
}

/** The answers as the next step's query string. */
export function answersSearch(answers: FirstRunAnswers): string {
	const params = new URLSearchParams({
		discipline: answers.discipline,
		hours: String(answers.hours),
		days: answers.days.join(','),
		goal: answers.goal.kind,
	})
	if (answers.goal.kind === 'event') {
		params.set('name', answers.goal.name)
		params.set('date', answers.goal.date)
	}
	if (answers.family) params.set('family', answers.family)
	return params.toString()
}

/** The corrections "Noe er feil" passes on to the questions, from the URL. */
export function readCorrections(search: URLSearchParams): {
	discipline?: CardioDiscipline
	hours?: number
	days?: PatternWeekday[]
} {
	const discipline = DisciplineSchema.safeParse(search.get('discipline'))
	const hours = HoursSchema.safeParse(search.get('hours') ?? undefined)
	const days = DaysSchema.safeParse(
		(search.get('days') ?? '').split(',').filter(Boolean),
	)
	return {
		...(discipline.success ? { discipline: discipline.data } : {}),
		...(hours.success ? { hours: hours.data } : {}),
		...(days.success ? { days: days.data } : {}),
	}
}
