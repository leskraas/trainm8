/**
 * Getting started and the plan before it exists: the athlete's answers as
 * stored on their profile, the plan styles those answers offer (the same
 * draft the plan is made from), and making the plan.
 */
import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { parseTrainableWeekdays } from '#app/utils/athlete-schema.ts'
import { readStartAnswersOf } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { readFirstRunFindings } from '#app/utils/first-run/findings.server.ts'
import { startPrefill } from '#app/utils/first-run/first-run.ts'
import {
	createFirstRunPlan,
	readPlanStartWeekKey,
} from '#app/utils/first-run/plan.server.ts'
import {
	draftStart,
	levelDefaults,
	MAX_START_HOURS,
	MIN_START_HOURS,
	START_HOURS_STEP,
	STRENGTH_PER_WEEK_CHOICES,
	type StartDraft,
	type StartOption as DomainStartOption,
	startWeekOf,
	type StartWeek,
	type TrainingLevel,
} from '#app/utils/first-run/start-draft.ts'
import {
	LevelSchema,
	SportsSchema,
	StartActivitiesSchema,
} from '#app/utils/first-run/start-schema.ts'
import { readStartStrength } from '#app/utils/first-run/start-strength.server.ts'
import { readHomePlace } from '#app/utils/home-place.server.ts'
import {
	FINDING_ABSENCE_LABELS,
	FIRST_RUN_LABELS,
	hoursEstimateLabel,
	NB_DISCIPLINE_LABELS,
	NB_WEEK_ROLE_LABELS,
	nbHoursWords,
	nbDurationLabel,
	nbPhaseName,
	PHILOSOPHY_LABELS,
	SESSION_PREFERENCE_LABELS,
	SIMPLE_ACTIVITY_LABELS,
	SIMPLE_START_LABELS,
	START_HISTORY_LABELS,
	START_OPTION_LABELS,
	START_SIMPLE_ACTIVITY_LABELS,
} from '#app/utils/labels.ts'
import {
	previewAttachEvent,
	type AttachEventPreview,
} from '#app/utils/plan-outline/attach-event.ts'
import {
	weekViews,
	type WeekView,
} from '#app/utils/plan-outline/outline-preview.ts'
import { weekKeyAt } from '#app/utils/plan-outline/week-keys.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { type CardioDiscipline } from '#app/utils/workout-schema.ts'
import {
	type AthleteSetup,
	EXPERIENCE_LEVELS,
	type ExperienceLevel,
	OTHER_ACTIVITIES,
	type OtherActivity,
	type OutlookWeek,
	type PlanPhase,
	type PlanPreviewOutput,
	type PlanStyle,
	type PreviewWeek,
	SESSION_PREFERENCES,
	type SetupQuestion,
	type SetupState,
	type Sport,
	SPORTS,
	type StartOption,
	type StartOptionsOutput,
	type Weekday,
} from '../setup.types.ts'
import {
	effortOf,
	patternDaysOf,
	weekdayOfPattern,
	weekdaysOfCalendar,
	otherWeekdays,
} from './common.ts'

function parseJsonList(raw: string | null | undefined): unknown {
	if (raw == null) return null
	try {
		return JSON.parse(raw) as unknown
	} catch {
		return null
	}
}

/** The athlete's answers, each read by the start's own schema. */
export async function readAnswers(userId: string): Promise<AthleteSetup> {
	const [user, profile, start, homePlace] = await Promise.all([
		prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: { name: true, username: true },
		}),
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: {
				sports: true,
				simpleActivities: true,
				trainingLevel: true,
				currentWeeklyHours: true,
				trainableWeekdays: true,
				weeklyCapacityHours: true,
				strengthPerWeek: true,
				sessionPreferences: true,
				timezone: true,
				autopilot: true,
				defaultTrainingTime: true,
			},
		}),
		readStartAnswersOf(userId),
		readHomePlace(userId),
	])
	const storedSports = parseJsonList(profile?.sports)
	const sportsRead =
		storedSports == null ? null : SportsSchema.safeParse(storedSports)
	// SportsSchema orders by the fixed order; the stored order keeps the main first.
	const sports =
		sportsRead?.success && Array.isArray(storedSports)
			? (storedSports as string[]).filter((s): s is Sport =>
					(SPORTS as readonly string[]).includes(s),
				)
			: null
	const storedActivities = parseJsonList(profile?.simpleActivities)
	const activities =
		storedActivities == null
			? null
			: StartActivitiesSchema.safeParse(storedActivities)
	const level = LevelSchema.safeParse(profile?.trainingLevel)
	const days =
		profile?.trainableWeekdays == null
			? null
			: weekdaysOfCalendar(parseTrainableWeekdays(profile.trainableWeekdays))
	return {
		displayName: user.name,
		username: user.username,
		sports,
		mainSport: sports?.[0] ?? null,
		otherActivities: activities?.success
			? (activities.data as OtherActivity[])
			: null,
		level: level.success ? level.data : null,
		currentHoursPerWeek: profile?.currentWeeklyHours ?? null,
		availability: {
			days,
			blockedDays: days ? otherWeekdays(days) : null,
			hoursPerWeek: profile?.weeklyCapacityHours ?? null,
		},
		strengthPerWeek: profile?.strengthPerWeek ?? null,
		sessionPreferences:
			profile?.sessionPreferences == null ? null : start.preferences,
		timezone: profile?.timezone ?? 'UTC',
		homePlace,
		adjustAutomatically: profile?.autopilot ?? true,
		defaultTrainingTime: profile?.defaultTrainingTime ?? null,
	}
}

function missingOf(answers: AthleteSetup): SetupQuestion[] {
	const missing: SetupQuestion[] = []
	if (
		(answers.sports ?? []).length === 0 &&
		(answers.otherActivities ?? []).length === 0
	) {
		missing.push('sports')
	}
	if (!answers.level) missing.push('level')
	return missing
}

const LEVEL_WORDS = SIMPLE_START_LABELS.levels

export async function readSetupState(
	userId: string,
	now: Date,
): Promise<SetupState> {
	const [answers, active, reading] = await Promise.all([
		readAnswers(userId),
		findActiveOutline(userId, now),
		readFirstRunFindings(userId, now),
	])
	const missing = missingOf(answers)
	const prefill = startPrefill(reading.findings)
	const importing = reading.connection === 'importing'
	const volume = reading.findings.volume
	const defaults = answers.level ? levelDefaults(answers.level) : null
	return {
		answers,
		missing,
		readyForPlans: missing.length === 0 && !active,
		hasPlan: Boolean(active),
		suggested: defaults
			? {
					currentHoursPerWeek: defaults.hours,
					days: defaults.days.map(weekdayOfPattern),
					strengthPerWeek: defaults.strengthPerWeek,
				}
			: null,
		fromHistory: {
			importing,
			hoursPerWeek: volume.measured
				? { value: prefill.hours }
				: { value: null, why: FINDING_ABSENCE_LABELS[volume.reason] },
			days: prefill.days ? prefill.days.map(weekdayOfPattern) : null,
			note: importing
				? START_HISTORY_LABELS.importing
				: prefill.hours != null || prefill.days != null
					? [
							START_HISTORY_LABELS.fromHistory(
								prefill.hours != null ? nbHoursWords(prefill.hours) : null,
								prefill.days ? prefill.days.length + ' dager' : null,
							),
							volume.measured ? hoursEstimateLabel(volume.value) : null,
						]
							.filter(Boolean)
							.join(' ')
					: null,
		},
		choices: {
			sports: SPORTS.map((id) => ({ id, label: NB_DISCIPLINE_LABELS[id] })),
			otherActivities: OTHER_ACTIVITIES.map((id) => ({
				id,
				label: SIMPLE_ACTIVITY_LABELS.kind[id],
			})),
			levels: EXPERIENCE_LEVELS.map((id) => ({
				id,
				label: `${LEVEL_WORDS[id].name}: ${LEVEL_WORDS[id].description}`,
			})),
			sessionPreferences: SESSION_PREFERENCES.map((id) => ({
				id,
				label: SESSION_PREFERENCE_LABELS.options[id].name,
			})),
			strengthPerWeek: [0, ...STRENGTH_PER_WEEK_CHOICES],
			hoursPerWeek: {
				min: MIN_START_HOURS,
				max: MAX_START_HOURS,
				step: START_HOURS_STEP,
			},
		},
	}
}

// ── The draft ────────────────────────────────────────────────────────────────

export type DraftRefusal = {
	code: 'not-ready' | 'has-plan' | 'no-days' | 'nothing-to-lay'
	message: string
}

type ResolvedStart = {
	answers: AthleteSetup
	level: TrainingLevel
	hours: number
	days: Weekday[]
	main: CardioDiscipline | undefined
	otherSports: CardioDiscipline[]
	activities: OtherActivity[]
	strength: number | null
	assumed: StartOptionsOutput['assumed']
	startWeekKey: string
	start: StartDraft
	liftingSession: { title: string; lifts: readonly string[] } | null
}

/**
 * The answers resolved into the draft every plan style is read from — the
 * same `draftStart` the plan is made with. Missing hours and days come from
 * history, else the level's suggestion, and are reported as assumed.
 */
export async function resolveStart(
	userId: string,
	now: Date,
): Promise<
	{ ok: true; value: ResolvedStart } | { ok: false; refusal: DraftRefusal }
> {
	const answers = await readAnswers(userId)
	const missing = missingOf(answers)
	if (missing.length > 0) {
		return {
			ok: false,
			refusal: {
				code: 'not-ready',
				message:
					missing.includes('sports') && missing.includes('level')
						? 'Si hva du trener og hvor erfaren du er først.'
						: missing.includes('sports')
							? 'Si hva du trener først.'
							: 'Si hvor erfaren du er først.',
			},
		}
	}
	if (await findActiveOutline(userId, now)) {
		return {
			ok: false,
			refusal: { code: 'has-plan', message: 'Du har allerede en plan.' },
		}
	}
	const level = answers.level!
	const defaults = levelDefaults(level)
	const assumed: StartOptionsOutput['assumed'] = []
	let hours = answers.currentHoursPerWeek
	let days = answers.availability.days
	if (hours == null || days == null) {
		const reading = await readFirstRunFindings(userId, now)
		const prefill = startPrefill(reading.findings)
		if (hours == null) {
			hours = prefill.hours ?? defaults.hours
			assumed.push({
				question: 'currentHoursPerWeek',
				value: hours,
				from: prefill.hours != null ? 'history' : 'level',
			})
		}
		if (days == null) {
			const pattern = prefill.days ?? defaults.days
			days = pattern.map(weekdayOfPattern)
			assumed.push({
				question: 'days',
				value: days,
				from: prefill.days != null ? 'history' : 'level',
			})
		}
	}
	if (days.length === 0) {
		return {
			ok: false,
			refusal: {
				code: 'no-days',
				message: 'Velg minst én dag du kan trene.',
			},
		}
	}
	const [main, ...otherSports] = answers.sports ?? []
	const activities = answers.otherActivities ?? []
	const startWeekKey = await readPlanStartWeekKey(userId, now)
	const strength = answers.strengthPerWeek
	const lifting = strength != null ? await readStartStrength(userId, now) : null
	const start = draftStart({
		level,
		discipline: main,
		otherSports,
		activities,
		hours,
		days: patternDaysOf(days),
		startWeekKey,
		strength:
			lifting && strength != null
				? { perWeek: strength, session: lifting.session }
				: null,
		preferences: answers.sessionPreferences ?? [],
	})
	if (!start || start.options.length === 0) {
		return {
			ok: false,
			refusal: {
				code: 'nothing-to-lay',
				message:
					'Med disse svarene ble det ingen økter å legge. Velg flere dager eller mer tid i uka.',
			},
		}
	}
	return {
		ok: true,
		value: {
			answers,
			level,
			hours,
			days,
			main,
			otherSports,
			activities,
			strength: lifting ? strength : null,
			assumed,
			startWeekKey,
			start,
			liftingSession: lifting?.session ?? null,
		},
	}
}

function previewWeek(week: StartWeek, weekStart: string): PreviewWeek {
	const minutesByEffort = {
		easy: week.minutesByEffort.rolig,
		moderate: week.minutesByEffort.middels,
		hard: week.minutesByEffort.hard,
	}
	return {
		weekStart,
		days: week.days.map((day) => ({
			date: addDays(weekStart, day.weekday),
			weekday: weekdayOfPattern(day.weekday),
			sessions: day.sessions.map((session) => ({
				title: session.title,
				sport:
					session.discipline as PreviewWeek['days'][number]['sessions'][number]['sport'],
				minutes: session.minutes,
				effort: effortOf(session.effort),
			})),
			strength: day.lifting.map((lift) => ({
				title: lift.title,
				lifts: [...lift.lifts],
			})),
		})),
		totals: {
			minutes: week.minutes,
			sessions: week.sessionCount,
			hardSessions: week.hardSessions,
			strengthSessions: week.strengthSessions,
			minutesByEffort,
		},
	}
}

const O = START_OPTION_LABELS

function styleOf(option: DomainStartOption): PlanStyle {
	return option.family as PlanStyle
}

function optionOf(
	option: DomainStartOption,
	index: number,
	resolved: ResolvedStart,
): StartOption {
	const style = styleOf(option)
	const plain = O.plain[style]
	const badge =
		index === 0 && resolved.start.badge ? O.badge[resolved.start.badge] : null
	const strengthNotes: string[] = []
	if (resolved.strength != null) {
		strengthNotes.push(O.strengthChoice(resolved.strength))
		if (option.week.strengthSessions < resolved.strength) {
			strengthNotes.push(
				O.strengthFewer(option.week.strengthSessions, resolved.strength),
			)
		}
	}
	return {
		style,
		name: plain.name,
		why: plain.why,
		styleName: O.familyName(PHILOSOPHY_LABELS[style]),
		badge,
		firstWeek: previewWeek(option.week, resolved.startWeekKey),
		shortOfHours:
			option.shortOfHours == null
				? null
				: {
						minutes: option.shortOfHours,
						note: (option.shortByPreference
							? SESSION_PREFERENCE_LABELS.shortOfHours
							: O.shortOfHours)(
							nbDurationLabel(option.shortOfHours * 60),
							nbHoursWords(resolved.hours),
						),
					},
		notFitted: option.notFitted
			? START_SIMPLE_ACTIVITY_LABELS.notFitted(
					option.notFitted.kinds,
					option.notFitted.room,
				)
			: null,
		strengthNotes,
	}
}

function notesOf(resolved: ResolvedStart): string[] {
	const { start, level } = resolved
	const sessionCap = levelDefaults(level).sessionCap
	const notes: string[] = []
	if (start.simpleOnly) notes.push(START_SIMPLE_ACTIVITY_LABELS.simpleOnly)
	if (start.sportsLeftOut.length > 0) {
		notes.push(
			O.sportsLeftOut(
				start.daysUsed,
				start.sportsLeftOut.map((sport) =>
					NB_DISCIPLINE_LABELS[sport].toLowerCase(),
				),
			),
		)
	}
	if (start.merged > 0) notes.push(O.merged(start.options.length))
	if (start.strengthCapped != null) {
		notes.push(O.strengthTakesDays(sessionCap, start.strengthCapped))
	} else if (start.capped) {
		notes.push(SIMPLE_START_LABELS.activities.beginnerCap(sessionCap))
	} else if (start.restDayKept) {
		notes.push(SIMPLE_START_LABELS.activities.restDay)
	} else if (start.daysUsed < start.daysPicked) {
		notes.push(
			FIRST_RUN_LABELS.weeks.fewerDays(start.daysPicked, start.daysUsed),
		)
	}
	const prefs = resolved.answers.sessionPreferences ?? []
	if (prefs.includes('short') && prefs.includes('long')) {
		notes.push(SESSION_PREFERENCE_LABELS.shortAndLong)
	}
	return notes
}

export function startOptionsOf(resolved: ResolvedStart): StartOptionsOutput {
	return {
		startsOn: resolved.startWeekKey,
		assumed: resolved.assumed,
		notes: notesOf(resolved),
		options: resolved.start.options.map((option, index) =>
			optionOf(option, index, resolved),
		),
	}
}

export function pickOption(
	resolved: ResolvedStart,
	style: PlanStyle | undefined,
): DomainStartOption | null {
	const options = resolved.start.options
	return style
		? (options.find((option) => option.family === style) ?? null)
		: (options[0] ?? null)
}

function outlookOf(
	views: WeekView[],
	startWeekKey: string,
	fromIndex = 0,
): OutlookWeek[] {
	return views.slice(fromIndex).map((view, offset) => {
		const hoursTargets = view.targets.filter(
			(target) => target.currency === 'hours',
		)
		const unpriced = hoursTargets.some((target) => target.value == null)
		const hours = unpriced
			? null
			: Math.round(
					hoursTargets.reduce((sum, target) => sum + (target.value ?? 0), 0) *
						10,
				) / 10
		return {
			weekStart: weekKeyAt(startWeekKey, fromIndex + offset),
			phase: nbPhaseName(view.phaseName),
			role: view.role,
			roleLabel: NB_WEEK_ROLE_LABELS[view.role],
			hours,
			...(unpriced ? { why: 'Kan ikke regnes ut for denne uka.' } : {}),
		}
	})
}

function phasesOf(
	phases: ReadonlyArray<{ name: string; weeks: number; fromWeekKey: string }>,
): PlanPhase[] {
	return phases.map((phase) => ({
		name: nbPhaseName(phase.name),
		weeks: phase.weeks,
		from: phase.fromWeekKey,
	}))
}

/** The Event target a plan would run toward, as the attach reads it. */
export type GoalTarget = { name: string; dayKey: string; weekKey: string }

/**
 * How an open-ended plan would run toward a goal (the computation the
 * attach itself runs), before or after the plan exists.
 */
export function towardGoalOf(preview: AttachEventPreview): {
	phases: PlanPhase[]
	outlook: OutlookWeek[]
} {
	return {
		phases: phasesOf(preview.phases.after),
		outlook: preview.weeks.flatMap((week) =>
			week.after ? outlookOf([week.after], week.weekKey) : [],
		),
	}
}

const ATTACH_PROBLEMS: Record<string, string> = {
	'outline-not-found': 'Planen kan ikke legges mot målet.',
	'event-too-soon':
		'Løpet er denne uka, så det er ingen uker igjen å bygge mot det.',
	'plan-too-long': 'Løpet er mer enn to år fram. Velg et mål innen to år.',
}

export function planPreviewOf(
	resolved: ResolvedStart,
	option: DomainStartOption,
	goal: GoalTarget | null,
	now: Date,
	timezone: string,
): PlanPreviewOutput {
	const style = styleOf(option)
	const plain = O.plain[style]
	const lifting =
		resolved.liftingSession && option.strengthDays.length > 0
			? { days: option.strengthDays, session: resolved.liftingSession }
			: null
	const weeks = option.draft.weeks.map((week, index) =>
		previewWeek(
			startWeekOf({ ...option.draft, weeks: [week] }, lifting),
			weekKeyAt(resolved.startWeekKey, index),
		),
	)
	const views = weekViews(option.draft.rows)
	let phaseFrom = resolved.startWeekKey
	const phases: PlanPhase[] = option.draft.phases.map((phase) => {
		const from = phaseFrom
		phaseFrom = weekKeyAt(phaseFrom, phase.weeks)
		return { name: nbPhaseName(phase.name), weeks: phase.weeks, from }
	})
	let towardGoal: PlanPreviewOutput['towardGoal'] = null
	if (goal) {
		const preview = previewAttachEvent(
			{ ...option.draft.rows, family: style },
			goal,
			weekMonday(now, timezone),
		)
		towardGoal = preview.ok
			? {
					goal: { name: goal.name, date: goal.dayKey },
					...towardGoalOf(preview),
					problem: null,
				}
			: {
					goal: { name: goal.name, date: goal.dayKey },
					phases: [],
					outlook: [],
					problem:
						ATTACH_PROBLEMS[preview.reason] ??
						'Planen kan ikke legges mot målet.',
				}
	}
	return {
		style,
		name: plain.name,
		why: plain.why,
		startsOn: resolved.startWeekKey,
		weeks,
		phases,
		outlook: outlookOf(views, resolved.startWeekKey),
		towardGoal,
		notes: notesOf(resolved),
	}
}

/** Make the plan the chosen style showed (or the first). */
export async function createPlanFrom(
	userId: string,
	resolved: ResolvedStart,
	style: PlanStyle | undefined,
	now: Date,
) {
	return createFirstRunPlan(
		userId,
		{
			level: resolved.level,
			discipline: resolved.main,
			otherSports: resolved.otherSports,
			activities: resolved.activities,
			hours: resolved.hours,
			days: patternDaysOf(resolved.days),
			family: style ?? null,
			...(resolved.strength != null ? { strength: resolved.strength } : {}),
			preferences: resolved.answers.sessionPreferences ?? [],
		},
		now,
	)
}

export function isExperienceLevel(value: string): value is ExperienceLevel {
	return (EXPERIENCE_LEVELS as readonly string[]).includes(value)
}
