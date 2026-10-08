// The first run's forms and the answers it carries from step to step (#505
// stories 63–69). The answers travel in the URL, so a step can be reloaded,
// gone back to, or shared with no state on the server until the plan is made.
// One set of field schemas reads them from a form and from the URL alike, so
// a tampered URL is held to the same rules as the form.

import { z } from 'zod'
import { addDays } from '../athlete-calendar.ts'
import { MAX_PLAN_WEEKS } from '../plan-outline/authoring-schema.ts'
import { PRESET_FAMILIES, type PresetFamily } from '../plan-outline/presets.ts'
import {
	patternWeekdaysOf,
	type PatternWeekday,
} from '../plan-outline/week-pattern.ts'
import { CARDIO_DISCIPLINES, type CardioDiscipline } from '../workout-schema.ts'

const DisciplineSchema = z.enum(CARDIO_DISCIPLINES, {
	errorMap: () => ({ message: 'Velg en aktivitet' }),
})

const HoursSchema = z.coerce
	.number({ errorMap: () => ({ message: 'Skriv hvor mange timer i uka' }) })
	.positive('Mer enn null timer i uka')
	.max(40, 'Høyst 40 timer i uka')

/**
 * Monday-first weekdays (0 = mandag), each once and in week order. A form
 * sends an array (or one value when one box is ticked), the URL a comma list.
 */
const DaysSchema = z.preprocess(
	(value) =>
		typeof value === 'string' ? value.split(',').filter(Boolean) : value,
	z
		.array(z.coerce.number().int().min(0).max(6), {
			errorMap: () => ({ message: 'Velg minst én dag' }),
		})
		.min(1, 'Velg minst én dag')
		.transform(patternWeekdaysOf),
)

/** The fields every step shares: the sport, the hours and the days. */
const AnswerFieldsSchema = z.object({
	discipline: DisciplineSchema,
	hours: HoursSchema,
	days: DaysSchema,
})

/** Why a race date cannot be planned toward, said on the date field. */
export const EVENT_DATE_MESSAGES = {
	missing: 'Velg en dato',
	invalid: 'Velg en dato som finnes i kalenderen',
	tooSoon: 'Velg en dato etter neste uke, så det blir uker å trene mot den.',
	tooFar: `Velg en dato innen ${MAX_PLAN_WEEKS} uker – lenger kan ikke en plan være.`,
} as const

/** Whether `YYYY-MM-DD` names a real day: 2026-02-30 and 2026-99-99 do not. */
export function isCalendarDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
	const date = new Date(`${value}T00:00:00.000Z`)
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

/**
 * What is wrong with a race date, judged against today, or null. The bounds
 * here are the outer ones the plan can never cross — after this week, within
 * the longest plan — and the server, which knows the plan's first week,
 * holds the exact ones (`readFirstRunPlan`).
 */
export function eventDateProblem(
	value: string | undefined,
	today: string,
): string | null {
	if (!value) return EVENT_DATE_MESSAGES.missing
	if (!isCalendarDate(value)) return EVENT_DATE_MESSAGES.invalid
	if (value <= addDays(today, 6)) return EVENT_DATE_MESSAGES.tooSoon
	if (value > addDays(today, 7 * MAX_PLAN_WEEKS)) {
		return EVENT_DATE_MESSAGES.tooFar
	}
	return null
}

function todayKey(): string {
	return new Date().toISOString().slice(0, 10)
}

/** "Noe er feil": the pre-fill, set right (story 63). */
export const FindingCorrectionSchema = AnswerFieldsSchema

export const GOALS = ['active', 'event'] as const

/** The three questions (story 64), plus the sport the plan is for. */
export const QuestionsSchema = AnswerFieldsSchema.extend({
	goal: z.enum(GOALS, {
		errorMap: () => ({ message: 'Velg hva du trener mot' }),
	}),
	eventName: z.string().trim().max(120).optional(),
	eventDate: z.string().optional(),
}).superRefine((answers, ctx) => {
	if (answers.goal !== 'event') return
	if (!answers.eventName) {
		ctx.addIssue({
			code: 'custom',
			path: ['eventName'],
			message: 'Skriv hva løpet heter',
		})
	}
	const problem = eventDateProblem(answers.eventDate, todayKey())
	if (problem) {
		ctx.addIssue({ code: 'custom', path: ['eventDate'], message: problem })
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
 * race is too close or too far to plan toward, the goal could not carry a
 * plan, or the answers lay no session.
 */
export const FIRST_RUN_PLAN_REFUSALS = [
	'plan-already-active',
	'event-too-soon',
	'event-too-far',
	'goal-unavailable',
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

const AnswersSearchSchema = AnswerFieldsSchema.extend({
	goal: z.enum(GOALS),
	name: z.string().trim().min(1).max(120).optional(),
	date: z.string().optional(),
	family: z.enum(PRESET_FAMILIES).optional(),
})

/**
 * The answers in the URL, or null where they are missing or malformed — a
 * race date included, held to the form's own rules.
 */
export function readAnswers(
	search: URLSearchParams,
	today: string = todayKey(),
): FirstRunAnswers | null {
	const parsed = AnswersSearchSchema.safeParse(Object.fromEntries(search))
	if (!parsed.success) return null
	const { goal, name, date, family, ...fields } = parsed.data
	if (goal === 'event') {
		if (!name || !date || eventDateProblem(date, today)) return null
		return {
			...fields,
			goal: { kind: 'event', name, date },
			family: family ?? null,
		}
	}
	return { ...fields, goal: { kind: 'active' }, family: family ?? null }
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

/**
 * The corrections "Noe er feil" passes on to the questions, from the URL:
 * each field read by the shared schema, and kept only where it reads.
 */
export function readCorrections(search: URLSearchParams): {
	discipline?: CardioDiscipline
	hours?: number
	days?: PatternWeekday[]
} {
	const { shape } = AnswerFieldsSchema
	const discipline = shape.discipline.safeParse(search.get('discipline'))
	const hours = shape.hours.safeParse(search.get('hours') ?? undefined)
	const days = shape.days.safeParse(search.get('days') ?? '')
	return {
		...(discipline.success ? { discipline: discipline.data } : {}),
		...(hours.success ? { hours: hours.data } : {}),
		...(days.success ? { days: days.data } : {}),
	}
}
