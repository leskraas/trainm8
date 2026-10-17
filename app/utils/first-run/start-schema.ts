// The simple start's answers (#563): the field schemas that read them from a
// form and from the URL alike, so a reloaded, shared or tampered address is
// held to the same rules as the form. The answers travel in the URL from
// screen to screen, and back, until the plan is made.

import { z } from 'zod/v3'
import {
	FIRST_RUN_LABELS,
	SIMPLE_START_LABELS,
	START_SIMPLE_ACTIVITY_LABELS,
} from '../labels.ts'
import { PRESET_FAMILIES } from '../plan-outline/presets.ts'
import {
	patternWeekdaysOf,
	type PatternWeekday,
} from '../plan-outline/week-pattern.ts'
import { ACTIVITY_KINDS, type ActivityKind } from '../simple-activity.ts'
import { CARDIO_DISCIPLINES, type CardioDiscipline } from '../workout-schema.ts'
import {
	MAX_START_HOURS,
	MIN_START_HOURS,
	START_HOURS_STEP,
	TRAINING_LEVELS,
	type TrainingLevel,
} from './start-draft.ts'

const M = SIMPLE_START_LABELS.messages

/**
 * Monday-first weekdays (0 = mandag), each once and in week order. A form
 * sends an array (or one value when one box is ticked), the URL a comma list.
 */
export const DaysSchema = z.preprocess(
	(value) =>
		typeof value === 'string' ? value.split(',').filter(Boolean) : value,
	z
		.array(z.coerce.number().int().min(0).max(6), {
			errorMap: () => ({ message: FIRST_RUN_LABELS.messages.daysRequired }),
		})
		.min(1, FIRST_RUN_LABELS.messages.daysRequired)
		.transform(patternWeekdaysOf),
)

export const LevelSchema = z.enum(TRAINING_LEVELS, {
	errorMap: () => ({ message: M.levelRequired }),
})

/** Hours a week: 1 to 20, in half hours. */
export const StartHoursSchema = z.coerce
	.number({ errorMap: () => ({ message: M.hoursRequired }) })
	.min(MIN_START_HOURS, M.hoursMin)
	.max(MAX_START_HOURS, M.hoursMax)
	.refine((hours) => Number.isInteger(hours / START_HOURS_STEP), M.hoursStep)

export const StartDisciplineSchema = z.enum(CARDIO_DISCIPLINES, {
	errorMap: () => ({ message: M.disciplineRequired }),
})

/**
 * The **Simple Activities** picked (#572), each once and in the order picked:
 * the order decides which goes first when the week has no room for all. A
 * form sends an array (or one value), the URL a comma list.
 */
export const StartActivitiesSchema = z.preprocess(
	(value) =>
		typeof value === 'string'
			? value.split(',').filter(Boolean)
			: value == null
				? []
				: value,
	z.array(z.enum(ACTIVITY_KINDS)).transform((kinds) => [...new Set(kinds)]),
)

/**
 * _Hvor er du nå?_ and the hours. The hours may be missing (no script ran the
 * stepper), and then the level's own are taken. The later screen's answers,
 * when the athlete came back, ride along unchanged.
 */
export const LevelStepSchema = z.object({
	level: LevelSchema,
	hours: StartHoursSchema.optional(),
	discipline: StartDisciplineSchema.optional(),
	activities: StartActivitiesSchema.optional(),
	days: DaysSchema.optional(),
})

/**
 * _Hva liker du å trene?_: the main sport and the days, with the level. The
 * main sport may be left out where a Simple Activity is picked (#572).
 */
const ActivitiesStepFields = z.object({
	level: LevelSchema,
	hours: StartHoursSchema,
	discipline: StartDisciplineSchema.optional(),
	activities: StartActivitiesSchema.optional(),
	days: DaysSchema,
})

/** Something to lay: a main sport, or at least one Simple Activity. */
function somethingPicked(
	answers: { discipline?: CardioDiscipline; activities?: ActivityKind[] },
	context: z.RefinementCtx,
) {
	if (answers.discipline || (answers.activities ?? []).length > 0) return
	context.addIssue({
		code: z.ZodIssueCode.custom,
		path: ['discipline'],
		message: START_SIMPLE_ACTIVITY_LABELS.nothingPicked,
	})
}

export const ActivitiesStepSchema =
	ActivitiesStepFields.superRefine(somethingPicked)

/**
 * _Velg denne_: every answer, and the family of the card picked. Which
 * families are shown is the draft's to say (`draftStart`), so any preset
 * family reads here and the plan writer refuses one not shown.
 */
export const StartChoiceSchema = ActivitiesStepFields.extend({
	family: z.enum(PRESET_FAMILIES),
}).superRefine(somethingPicked)

export type StartAnswersSoFar = {
	level?: TrainingLevel
	hours?: number
	discipline?: CardioDiscipline
	activities?: ActivityKind[]
	days?: PatternWeekday[]
}

/** Empty URL values read as absent, so `?hours=` is no answer, not zero. */
function present(value: string | null): string | undefined {
	return value == null || value === '' ? undefined : value
}

/**
 * The answers given so far, from the URL: each field read by its own schema,
 * and kept only where it reads.
 */
export function readStartAnswers(search: URLSearchParams): StartAnswersSoFar {
	const level = LevelSchema.safeParse(present(search.get('level')))
	const hours = StartHoursSchema.safeParse(present(search.get('hours')))
	const discipline = StartDisciplineSchema.safeParse(
		present(search.get('discipline')),
	)
	const days = DaysSchema.safeParse(search.get('days') ?? '')
	const activities = StartActivitiesSchema.safeParse(
		search.get('activities') ?? '',
	)
	return {
		...(level.success ? { level: level.data } : {}),
		...(hours.success ? { hours: hours.data } : {}),
		...(discipline.success ? { discipline: discipline.data } : {}),
		...(activities.success && activities.data.length > 0
			? { activities: activities.data }
			: {}),
		...(days.success ? { days: days.data } : {}),
	}
}

/** The answers so far as a query string, in a fixed order. */
export function startSearch(answers: StartAnswersSoFar): string {
	const params = new URLSearchParams()
	if (answers.level) params.set('level', answers.level)
	if (answers.hours != null) params.set('hours', String(answers.hours))
	if (answers.discipline) params.set('discipline', answers.discipline)
	if (answers.activities && answers.activities.length > 0) {
		params.set('activities', answers.activities.join(','))
	}
	if (answers.days && answers.days.length > 0) {
		params.set('days', answers.days.join(','))
	}
	return params.toString()
}
