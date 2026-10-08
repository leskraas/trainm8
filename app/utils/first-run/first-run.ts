// The **first run**'s reading of the athlete (#505 stories 61–71): what their
// history says ("Dette fant vi"), the hours arithmetic it shows, the three
// questions it pre-fills, and which philosophy it picks for them, and why.
//
// Pure: the history arrives as values read by `findings.server.ts`, and
// nothing here words anything. Every reading that has no number carries the
// reason it has none (story 71), as a code the surface words in `labels.ts`.

import { type PresetFamily } from '../plan-outline/presets.ts'
import {
	ANCHOR_WINDOW_WEEKS,
	type LoggedVolume,
} from '../plan-outline/proposal.ts'
import { DEFAULT_TRAINING_WEEKDAYS } from '../plan-outline/starter-pattern.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { isCardioDiscipline, type CardioDiscipline } from '../workout-schema.ts'

/** How far the athlete got linking intervals.icu, as the findings read it. */
export const FIRST_RUN_CONNECTIONS = ['none', 'importing', 'ready'] as const
export type FirstRunConnection = (typeof FIRST_RUN_CONNECTIONS)[number]

/**
 * Why a finding has no number. Each is a fact the athlete can act on:
 *
 * - `not-connected` — they skipped intervals.icu and logged nothing here.
 * - `importing` — the history is still on its way from intervals.icu.
 * - `no-sessions` — connected, and the last four weeks hold nothing.
 * - `no-duration` — sessions are there, but none recorded how long it took.
 * - `only-strength` — the history is lifting, with no endurance session to
 *   read a sport or hours from.
 */
export const FINDING_ABSENCES = [
	'not-connected',
	'importing',
	'no-sessions',
	'no-duration',
	'only-strength',
] as const
export type FindingAbsence = (typeof FINDING_ABSENCES)[number]

export type Finding<T> =
	| { measured: true; value: T }
	| { measured: false; reason: FindingAbsence }

/**
 * One sport's share of the weekly hours, with the arithmetic shown (story
 * 65). A run is reckoned in distance and pace — `43 km/uke à 5:35` — because
 * that is how a runner knows their week; any other sport in sessions and their
 * length. `hours` is computed from the figures **as shown**, so the sum the
 * athlete reads checks out.
 */
export type HoursPart =
	| {
			discipline: CardioDiscipline
			kind: 'pace'
			kmPerWeek: number
			paceSecPerKm: number
			hours: number
	  }
	| {
			discipline: CardioDiscipline
			kind: 'sessions'
			sessionsPerWeek: number
			secondsPerSession: number
			hours: number
	  }

/** The weekly hours the history adds up to, rounded to the half hour. */
export type HoursEstimate = { parts: HoursPart[]; hours: number }

/** Hours are offered to the nearest half hour, and never as nothing. */
export function roundToHalfHour(hours: number): number {
	return Math.max(0.5, Math.round(hours * 2) / 2)
}

/**
 * The weekly hours the last four weeks add up to, sport by sport, or null
 * where no endurance session recorded a duration. Lifting is left out: it has
 * no per-session duration to price (ADR 0047 §5).
 */
export function weeklyHoursEstimate(
	volumes: readonly LoggedVolume[],
): HoursEstimate | null {
	const parts: HoursPart[] = []
	for (const volume of volumes) {
		if (!isCardioDiscipline(volume.discipline)) continue
		if (volume.sessions === 0 || volume.hours == null || volume.hours <= 0) {
			continue
		}
		const discipline = volume.discipline
		if (discipline === 'run' && volume.km != null && volume.km > 0) {
			const kmPerWeek = Math.round(volume.km / ANCHOR_WINDOW_WEEKS)
			const paceSecPerKm = Math.round((volume.hours * 3600) / volume.km)
			if (kmPerWeek > 0) {
				parts.push({
					discipline,
					kind: 'pace',
					kmPerWeek,
					paceSecPerKm,
					hours: (kmPerWeek * paceSecPerKm) / 3600,
				})
				continue
			}
		}
		const sessionsPerWeek =
			Math.round((volume.sessions / ANCHOR_WINDOW_WEEKS) * 10) / 10
		const secondsPerSession =
			Math.round((volume.hours * 3600) / volume.sessions / 60) * 60
		parts.push({
			discipline,
			kind: 'sessions',
			sessionsPerWeek,
			secondsPerSession,
			hours: (sessionsPerWeek * secondsPerSession) / 3600,
		})
	}
	if (parts.length === 0) return null
	const total = parts.reduce((sum, part) => sum + part.hours, 0)
	return { parts, hours: roundToHalfHour(total) }
}

/** One completed session's place in the window: its week and its weekday. */
export type SessionDay = { weekKey: string; weekday: PatternWeekday }

/**
 * The days the athlete usually trains: every weekday trained in at least two
 * of the window's weeks — a habit, not a one-off. Where nothing repeats, every
 * day they trained, rather than none: a short history still says something.
 * Monday-first, ascending.
 */
export function typicalWeekdays(
	sessions: readonly SessionDay[],
): PatternWeekday[] {
	const weeksByDay = new Map<PatternWeekday, Set<string>>()
	for (const session of sessions) {
		const weeks = weeksByDay.get(session.weekday) ?? new Set<string>()
		weeks.add(session.weekKey)
		weeksByDay.set(session.weekday, weeks)
	}
	const all = [...weeksByDay.keys()].sort((a, b) => a - b)
	const habits = all.filter((day) => (weeksByDay.get(day)?.size ?? 0) >= 2)
	return habits.length > 0 ? habits : all
}

/** "Dette fant vi": what the history says, and why where it says nothing. */
export type FirstRunFindings = {
	/** The endurance sport with the most sessions — the plan's one track. */
	discipline: Finding<{
		discipline: CardioDiscipline
		sessions: number
		weeksTrained: number
	}>
	volume: Finding<HoursEstimate>
	days: Finding<PatternWeekday[]>
	/** Lifting sessions a week. Zero is a reading when there is history. */
	strength: Finding<{ sessionsPerWeek: number }>
	/** Weeks of the four with any training, or null with no history at all. */
	weeksTrained: number | null
}

export function buildFindings({
	connection,
	volumes,
	weeksTrained,
	sessionDays,
}: {
	connection: FirstRunConnection
	/** Every Discipline's last four weeks, as `readAnchorContext` reads them. */
	volumes: readonly LoggedVolume[]
	/** Weeks of the window with any completed session, any sport. */
	weeksTrained: number
	sessionDays: readonly SessionDay[]
}): FirstRunFindings {
	const hasHistory = volumes.some((volume) => volume.sessions > 0)
	const noHistory: FindingAbsence =
		connection === 'none'
			? 'not-connected'
			: connection === 'importing'
				? 'importing'
				: 'no-sessions'
	const absent = { measured: false as const, reason: noHistory }
	// Lifting with no endurance beside it: history, but not the kind the
	// sport and the hours are read from — never "no sessions".
	const noEndurance = hasHistory
		? { measured: false as const, reason: 'only-strength' as const }
		: absent

	const endurance = volumes
		.filter((volume) => isCardioDiscipline(volume.discipline))
		.filter((volume) => volume.sessions > 0)
		.sort((a, b) => b.sessions - a.sessions || (b.hours ?? 0) - (a.hours ?? 0))
	const lead = endurance[0]
	const estimate = weeklyHoursEstimate(volumes)
	const strength = volumes.find((volume) => volume.discipline === 'strength')
	const days = typicalWeekdays(sessionDays)

	return {
		discipline:
			lead && isCardioDiscipline(lead.discipline)
				? {
						measured: true,
						value: {
							discipline: lead.discipline,
							sessions: lead.sessions,
							weeksTrained: lead.weeksTrained,
						},
					}
				: noEndurance,
		volume: estimate
			? { measured: true, value: estimate }
			: lead
				? { measured: false, reason: 'no-duration' }
				: noEndurance,
		days: days.length > 0 ? { measured: true, value: days } : absent,
		strength: hasHistory
			? {
					measured: true,
					value: {
						sessionsPerWeek:
							Math.round(
								((strength?.sessions ?? 0) / ANCHOR_WINDOW_WEEKS) * 10,
							) / 10,
					},
				}
			: absent,
		weeksTrained: hasHistory ? weeksTrained : null,
	}
}

/** What "Noe er feil" lets the athlete set right before the questions. */
export type FindingCorrections = {
	discipline?: CardioDiscipline
	hours?: number
	days?: PatternWeekday[]
}

export type QuestionPrefill = {
	discipline: CardioDiscipline
	/** Null where nothing reads: the athlete says it themselves. */
	hours: number | null
	days: PatternWeekday[]
	/** Where the days came from, so the surface can say when they are a guess. */
	daysSource: 'history' | 'corrected' | 'default'
}

/**
 * The three questions' answers before the athlete touches them: a correction
 * where they made one, else the history, else — for the days only — the
 * starter pattern's stated convention, named as such on the surface.
 */
export function questionPrefill(
	findings: FirstRunFindings,
	corrections: FindingCorrections,
): QuestionPrefill {
	const days =
		corrections.days && corrections.days.length > 0
			? { days: corrections.days, daysSource: 'corrected' as const }
			: findings.days.measured
				? { days: findings.days.value, daysSource: 'history' as const }
				: {
						days: [...DEFAULT_TRAINING_WEEKDAYS],
						daysSource: 'default' as const,
					}
	return {
		discipline:
			corrections.discipline ??
			(findings.discipline.measured
				? findings.discipline.value.discipline
				: 'run'),
		hours:
			corrections.hours ??
			(findings.volume.measured ? findings.volume.value.hours : null),
		...days,
	}
}

// ── Which philosophy, and why (#505 stories 66, 70) ──────────────────────────

/** From this age a 2:1 rhythm's extra rest is offered first. */
export const MASTERS_FROM_AGE = 50
/** Fewer weeks trained of the last four than this reads as a fresh start. */
export const STEADY_WEEKS = 3
/** Fewer training days than this leaves no room for more than the classic. */
export const FEW_DAYS_BELOW = 3
/** Under this many hours a week, a steady climb is the honest plan. */
export const FEW_HOURS_BELOW = 4
/** From this many hours a week there is room for mostly easy and a little very hard. */
export const MANY_HOURS_FROM = 7
/** From this many weeks to the race there is time for a long base first. */
export const LONG_RUN_UP_WEEKS = 24

export type FamilyChoiceInputs = {
	goal: 'active' | 'event'
	/** Plan weeks up to and including the race week; null without a race. */
	weeksToEvent: number | null
	weeklyHours: number
	/** Training days a week. */
	days: number
	/** Whole years, or null where the athlete has not said their birthdate. */
	age: number | null
	/** Weeks of the last four with training; null with no history at all. */
	weeksTrained: number | null
}

/** Why a family was chosen, with the numbers the sentence says. */
export type FamilyReason =
	| { code: 'older-athlete'; age: number }
	| { code: 'little-history'; weeksTrained: number | null }
	| { code: 'few-days'; days: number }
	| { code: 'few-hours'; hours: number }
	| { code: 'long-run-up'; weeks: number }
	| { code: 'many-hours'; hours: number }
	| { code: 'race-on-limited-time'; hours: number }
	| { code: 'steady' }

export type FamilyChoice = { family: PresetFamily; reason: FamilyReason }

/**
 * The philosophy the first run proposes, and the one reason it says for it.
 *
 * A deterministic rule list, first match wins, ordered from what protects the
 * athlete to what serves the goal: rest first (age, then a thin history or
 * little room in the week), then the shape the time allows. Every family is
 * offered beside it, so this is a starting point and never a verdict.
 */
export function chooseFamily(inputs: FamilyChoiceInputs): FamilyChoice {
	const { age, weeksTrained, days, weeklyHours: hours } = inputs
	if (age != null && age >= MASTERS_FROM_AGE) {
		return { family: 'masters', reason: { code: 'older-athlete', age } }
	}
	if (weeksTrained == null || weeksTrained < STEADY_WEEKS) {
		return {
			family: 'classic',
			reason: { code: 'little-history', weeksTrained },
		}
	}
	if (days < FEW_DAYS_BELOW) {
		return { family: 'classic', reason: { code: 'few-days', days } }
	}
	if (hours < FEW_HOURS_BELOW) {
		return { family: 'classic', reason: { code: 'few-hours', hours } }
	}
	if (
		inputs.goal === 'event' &&
		inputs.weeksToEvent != null &&
		inputs.weeksToEvent >= LONG_RUN_UP_WEEKS
	) {
		return {
			family: 'big-base',
			reason: { code: 'long-run-up', weeks: inputs.weeksToEvent },
		}
	}
	if (hours >= MANY_HOURS_FROM) {
		return { family: 'polarized', reason: { code: 'many-hours', hours } }
	}
	if (inputs.goal === 'event') {
		return {
			family: 'threshold',
			reason: { code: 'race-on-limited-time', hours },
		}
	}
	return { family: 'classic', reason: { code: 'steady' } }
}

/** Whole years between a birthdate and today, or null where none is stored. */
export function ageOn(birthdate: Date | null, now: Date): number | null {
	if (!birthdate) return null
	let age = now.getUTCFullYear() - birthdate.getUTCFullYear()
	const before =
		now.getUTCMonth() < birthdate.getUTCMonth() ||
		(now.getUTCMonth() === birthdate.getUTCMonth() &&
			now.getUTCDate() < birthdate.getUTCDate())
	if (before) age -= 1
	return age
}
