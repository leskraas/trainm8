// The first run's forms and the answers it carries from step to step (#505
// stories 63–69). The answers travel in the URL, so a step can be reloaded,
// gone back to, or shared with no state on the server until the plan is made.
// One set of field schemas reads them from a form and from the URL alike, so
// a tampered URL is held to the same rules as the form.

import { z } from 'zod/v3'
import { addDays, isCalendarDay } from '../athlete-calendar.ts'
import { EVENT_DATE_LABELS, FIRST_RUN_LABELS } from '../labels.ts'
import { MAX_PLAN_WEEKS } from '../plan-outline/authoring-schema.ts'
import { OpenEndedFieldsSchema } from '../plan-outline/open-ended-schema.ts'
import { PRESET_FAMILIES, type PresetFamily } from '../plan-outline/presets.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { type CardioDiscipline } from '../workout-schema.ts'
import { type TrainingLevel } from './start-draft.ts'
import {
	DaysSchema,
	LevelSchema,
	StartHoursSchema,
	startSearch,
} from './start-schema.ts'

const M = FIRST_RUN_LABELS.messages

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
 * plan, the answers lay no session, or the way to train picked is not one of
 * the **Start Options** these answers show (a merged or tampered one).
 */
export const FIRST_RUN_PLAN_REFUSALS = [
	'plan-already-active',
	'event-too-soon',
	'event-too-far',
	'goal-unavailable',
	'nothing-to-lay',
	'option-unavailable',
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
	/**
	 * The **Training Level**, where the answers came from the simple start
	 * (#563): it proposes the level's first family and caps the sessions.
	 */
	level?: TrainingLevel
}

const AnswersSearchSchema = AnswerFieldsSchema.extend({
	goal: z.enum(GOALS),
	name: z.string().trim().min(1).max(120).optional(),
	date: z.string().optional(),
	family: z.enum(PRESET_FAMILIES).optional(),
	level: LevelSchema.optional(),
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
	const { goal, name, date, family, level, ...fields } = parsed.data
	// The simple start's hours are held to its own bounds (1–20, in halves).
	if (level && !StartHoursSchema.safeParse(fields.hours).success) return null
	const fromLevel = level ? { level } : {}
	if (goal === 'event') {
		if (!name || !date || eventDateProblem(date, calendar)) return null
		return {
			...fields,
			goal: { kind: 'event', name, date },
			family: family ?? null,
			...fromLevel,
		}
	}
	return {
		...fields,
		goal: { kind: 'active' },
		family: family ?? null,
		...fromLevel,
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
	if (answers.level) params.set('level', answers.level)
	return params.toString()
}

/**
 * The questions these answers came from, with the answers in hand: the
 * simple start's last question where there is a Training Level, else the old
 * first run's three questions.
 */
export function questionsPath(answers: FirstRunAnswers): string {
	if (answers.level) {
		return `/start/trening?${startSearch({
			level: answers.level,
			hours: answers.hours,
			discipline: answers.discipline,
			days: answers.days,
		})}`
	}
	return `/start/sporsmal?${answersSearch({ ...answers, family: null })}`
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
