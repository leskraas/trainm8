// The first run's forms and the answers it carries from step to step (#505
// stories 63–69). The answers travel in the URL, so a step can be reloaded,
// gone back to, or shared with no state on the server until the plan is made.
// One set of field schemas reads them from a form and from the URL alike, so
// a tampered URL is held to the same rules as the form.

import { z } from 'zod'
import { addDays, isCalendarDay } from '../athlete-calendar.ts'
import { EVENT_DATE_LABELS, FIRST_RUN_LABELS } from '../labels.ts'
import { MAX_PLAN_WEEKS } from '../plan-outline/authoring-schema.ts'
import { OpenEndedFieldsSchema } from '../plan-outline/open-ended-schema.ts'
import { PRESET_FAMILIES, type PresetFamily } from '../plan-outline/presets.ts'
import {
	patternWeekdaysOf,
	type PatternWeekday,
} from '../plan-outline/week-pattern.ts'
import { type CardioDiscipline } from '../workout-schema.ts'

const M = FIRST_RUN_LABELS.messages

/**
 * Monday-first weekdays (0 = mandag), each once and in week order. A form
 * sends an array (or one value when one box is ticked), the URL a comma list.
 */
const DaysSchema = z.preprocess(
	(value) =>
		typeof value === 'string' ? value.split(',').filter(Boolean) : value,
	z
		.array(z.coerce.number().int().min(0).max(6), {
			errorMap: () => ({ message: M.daysRequired }),
		})
		.min(1, M.daysRequired)
		.transform(patternWeekdaysOf),
)

/**
 * The fields every step shares: the sport and the hours — the open-ended
 * plan's own two questions, the same ones _Hold meg aktiv_ asks — and the days.
 */
const AnswerFieldsSchema = OpenEndedFieldsSchema.extend({ days: DaysSchema })

/** Why a race date cannot be planned toward. */
export const EVENT_DATE_PROBLEMS = [
	'missing',
	'invalid',
	'too-soon',
	'too-far',
] as const
export type EventDateProblem = (typeof EVENT_DATE_PROBLEMS)[number]

/**
 * The day the first run judges a race date against, in the Athlete Timezone,
 * passed in by the route (`readFirstRunCalendar`) so the server's clock and the
 * browser's never decide it.
 */
export type FirstRunCalendar = { today: string; timezone: string }

/**
 * What is wrong with a race date, judged against today, or null. The bounds
 * here are the outer ones the plan can never cross — after this week, within
 * the longest plan — and the server, which knows the plan's first week,
 * holds the exact ones (`readFirstRunPlan`).
 */
export function eventDateProblem(
	value: string | undefined,
	{ today, timezone }: FirstRunCalendar,
): EventDateProblem | null {
	if (!value) return 'missing'
	if (!isCalendarDay(value, timezone)) return 'invalid'
	if (value <= addDays(today, 6)) return 'too-soon'
	if (value > addDays(today, 7 * MAX_PLAN_WEEKS)) return 'too-far'
	return null
}

/** "Noe er feil": the pre-fill, set right (story 63). */
export const FindingCorrectionSchema = AnswerFieldsSchema

export const GOALS = ['active', 'event'] as const

/** The three questions (story 64), plus the sport the plan is for. */
export function questionsSchema(calendar: FirstRunCalendar) {
	return AnswerFieldsSchema.extend({
		goal: z.enum(GOALS, {
			errorMap: () => ({ message: M.goalRequired }),
		}),
		eventName: z.string().trim().max(120).optional(),
		eventDate: z.string().optional(),
	}).superRefine((answers, ctx) => {
		if (answers.goal !== 'event') return
		if (!answers.eventName) {
			ctx.addIssue({
				code: 'custom',
				path: ['eventName'],
				message: M.eventNameRequired,
			})
		}
		const problem = eventDateProblem(answers.eventDate, calendar)
		if (problem) {
			ctx.addIssue({
				code: 'custom',
				path: ['eventDate'],
				message: EVENT_DATE_LABELS[problem],
			})
		}
	})
}

/** The philosophy switch on the plan screen (story 67). */
export const FamilySwitchSchema = z.object({
	family: z.enum(PRESET_FAMILIES, {
		errorMap: () => ({ message: M.familyRequired }),
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
	calendar: FirstRunCalendar,
): FirstRunAnswers | null {
	const parsed = AnswersSearchSchema.safeParse(Object.fromEntries(search))
	if (!parsed.success) return null
	const { goal, name, date, family, ...fields } = parsed.data
	if (goal === 'event') {
		if (!name || !date || eventDateProblem(date, calendar)) return null
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
