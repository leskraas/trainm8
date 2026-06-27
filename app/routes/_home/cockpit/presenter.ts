// The Cockpit home (PR #128 "road to race" redesign) reads top-to-bottom the
// way an athlete opens the app: Orient → Act → Week → Analyse → History. These
// pure builders map the loader's domain data onto the view-models each zone
// renders, so the presentation stays dumb and the mapping is unit-testable.
//
// Every builder honours the Unavailable Metric principle (CONTEXT.md, ADR 0008):
// a value the model can't truthfully produce is surfaced as `null`, never a
// fabricated number. The fitness *projection*, pace/HR/power targets, and
// Personal Records the prototype mocked are deliberately absent here — they
// need modelling first (tracked as follow-up issues).

import { isoDayKey, planArc } from '#app/utils/dashboard.ts'
import {
	type AdherenceBand,
	type WeeklyAdherence,
} from '#app/utils/load/adherence.ts'
import {
	type ProfileBar,
	deriveSessionProfile,
} from '#app/utils/session-profile.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import {
	type LedgerStatus,
	getDisciplineLabel,
	toSessionLedgerEntry,
} from '#app/utils/training.ts'

const DAY_MS = 24 * 60 * 60 * 1000

function startOfLocalDay(d: Date): Date {
	const r = new Date(d)
	r.setHours(0, 0, 0, 0)
	return r
}

/** Monday 00:00 of the calendar week containing `now` (weeks start Monday). */
export function startOfWeekMonday(now: Date): Date {
	const day = startOfLocalDay(now)
	const sinceMonday = (day.getDay() + 6) % 7 // getDay: 0=Sun..6=Sat
	return new Date(day.getTime() - sinceMonday * DAY_MS)
}

// ---------------------------------------------------------------------------
// Today (Act) — the next planned session, today's prescription when it's today.
// ---------------------------------------------------------------------------
export type TodayCard = {
	id: string
	/** True when the session falls on today's date; otherwise it's the next one up. */
	isToday: boolean
	date: Date
	discipline: string
	disciplineLabel: string
	title: string
	durationMin: number | null
	plannedTss: number | null
	/** Zone profile bars derived from the workout's real steps (may be empty). */
	profile: ProfileBar[]
}

function sessionTitle(discipline: string, title: string | null): string {
	return title ?? `${getDisciplineLabel(discipline)} session`
}

export function buildTodayCard(
	ledger: LedgerSession[],
	now: Date = new Date(),
): TodayCard | null {
	const todayStart = startOfLocalDay(now).getTime()
	const next = ledger
		.map((session) => ({ session, entry: toSessionLedgerEntry(session, now) }))
		.filter(
			({ session, entry }) =>
				entry.status === 'planned' &&
				new Date(session.scheduledAt).getTime() >= todayStart,
		)
		.sort(
			(a, b) =>
				new Date(a.session.scheduledAt).getTime() -
				new Date(b.session.scheduledAt).getTime(),
		)[0]
	if (!next) return null
	const { session, entry } = next
	return {
		id: session.id,
		isToday: isoDayKey(new Date(session.scheduledAt)) === isoDayKey(now),
		date: new Date(session.scheduledAt),
		discipline: entry.discipline,
		disciplineLabel: getDisciplineLabel(entry.discipline),
		title: sessionTitle(entry.discipline, entry.title),
		durationMin: entry.durationMin,
		plannedTss: entry.plannedTss,
		profile: deriveSessionProfile(session.workout).bars,
	}
}

// ---------------------------------------------------------------------------
// Week (Mon→Sun timeline) — one cell per day, status-aware.
// ---------------------------------------------------------------------------
export type WeekDayCell = {
	date: Date
	isToday: boolean
	/** `rest` when the day has no session; otherwise the ledger status. */
	state: LedgerStatus | 'rest'
	session: {
		id: string
		discipline: string
		disciplineLabel: string
		title: string
		durationMin: number | null
		/** Actual TSS for a completed day, else the planned TSS; null when neither. */
		tss: number | null
		profile: ProfileBar[]
	} | null
}

export function buildWeekTimeline(
	ledger: LedgerSession[],
	now: Date = new Date(),
): WeekDayCell[] {
	const weekStart = startOfWeekMonday(now)
	const todayKey = isoDayKey(now)

	const byDay = new Map<string, LedgerSession[]>()
	for (const session of ledger) {
		const key = isoDayKey(new Date(session.scheduledAt))
		const bucket = byDay.get(key) ?? []
		bucket.push(session)
		byDay.set(key, bucket)
	}

	return Array.from({ length: 7 }, (_, i) => {
		const date = new Date(weekStart.getTime() + i * DAY_MS)
		const key = isoDayKey(date)
		const isToday = key === todayKey
		const sessions = (byDay.get(key) ?? []).sort(
			(a, b) =>
				new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
		)
		const first = sessions[0]
		if (!first) {
			return { date, isToday, state: 'rest' as const, session: null }
		}
		const entry = toSessionLedgerEntry(first, now)
		return {
			date,
			isToday,
			state: entry.status,
			session: {
				id: first.id,
				discipline: entry.discipline,
				disciplineLabel: getDisciplineLabel(entry.discipline),
				title: sessionTitle(entry.discipline, entry.title),
				durationMin: entry.durationMin,
				tss: entry.status === 'completed' ? entry.load : entry.plannedTss,
				profile: deriveSessionProfile(first.workout).bars,
			},
		}
	})
}

// ---------------------------------------------------------------------------
// Recent (Analyse) — completed sessions, planned vs actual with adherence band.
// ---------------------------------------------------------------------------
export type RecentCompareRow = {
	id: string
	date: Date
	discipline: string
	disciplineLabel: string
	title: string
	plannedTss: number | null
	actualTss: number | null
	/** null unless both planned & actual TSS exist — never a fabricated band. */
	band: AdherenceBand | null
}

export function buildRecentCompare(
	ledger: LedgerSession[],
	now: Date = new Date(),
	limit = 4,
): RecentCompareRow[] {
	return ledger
		.map((session) => ({ session, entry: toSessionLedgerEntry(session, now) }))
		.filter(({ entry }) => entry.status === 'completed')
		.sort(
			(a, b) =>
				new Date(b.session.scheduledAt).getTime() -
				new Date(a.session.scheduledAt).getTime(),
		)
		.slice(0, limit)
		.map(({ session, entry }) => ({
			id: session.id,
			date: new Date(session.scheduledAt),
			discipline: entry.discipline,
			disciplineLabel: getDisciplineLabel(entry.discipline),
			title: sessionTitle(entry.discipline, entry.title),
			plannedTss: entry.plannedTss,
			actualTss: entry.load,
			band: entry.adherence,
		}))
}

// ---------------------------------------------------------------------------
// The build (Analyse) — trailing weekly planned-vs-actual TSS. Honest about the
// window: only weeks up to and including the current one (future planned load
// isn't modelled, so we don't draw it). A week with no resolvable planned load
// comes back null and renders as a gap, never a zero.
// ---------------------------------------------------------------------------
export type WeeklyBuildBar = {
	weekStart: Date
	isCurrent: boolean
	plannedTss: number | null
	actualTss: number | null
}

export function buildWeeklyBuild(
	weeks: Array<WeeklyAdherence | null>,
	now: Date = new Date(),
): WeeklyBuildBar[] {
	// `getRecentWeeklyAdherence` returns oldest-first with the current week last.
	const currentWeekStart = startOfWeekMonday(now)
	const n = weeks.length
	return weeks.map((week, i) => ({
		weekStart: new Date(currentWeekStart.getTime() - (n - 1 - i) * 7 * DAY_MS),
		isCurrent: i === n - 1,
		plannedTss: week ? Math.round(week.totalPlanned) : null,
		actualTss: week ? Math.round(week.totalActual) : null,
	}))
}

// ---------------------------------------------------------------------------
// Plan context (Orient) — the road-to-race signals beside the Form hero. Null
// when there's no active plan (the "road to race" frame collapses; the page
// falls back to the plan-less surface).
// ---------------------------------------------------------------------------
export type PlanContext = {
	eventId: string
	eventName: string
	daysToEvent: number
	phase: string
	weekInPlan: number
	totalWeeks: number
	/** This week's actual/planned load as a percentage; null when unavailable. */
	weekLoadPct: number | null
}

export function buildPlanContext(
	activePlan: ActivePlan | null,
	weeklyAdherence: WeeklyAdherence | null,
	now: Date = new Date(),
): PlanContext | null {
	if (!activePlan) return null
	const eventDate = new Date(activePlan.eventDate)
	const arc = planArc(activePlan.phases, eventDate, now)
	const daysToEvent = Math.max(
		0,
		Math.ceil((eventDate.getTime() - now.getTime()) / DAY_MS),
	)
	return {
		eventId: activePlan.eventId,
		eventName: activePlan.eventName,
		daysToEvent,
		phase: arc.phase,
		weekInPlan: arc.weekInPlan,
		totalWeeks: arc.totalWeeks,
		weekLoadPct: weeklyAdherence
			? Math.round(weeklyAdherence.ratio * 100)
			: null,
	}
}

// ---------------------------------------------------------------------------
// Fitness phase bands (Act) — the periodized phases as absolute date ranges so
// the FitnessJourney can position them on its time axis. Empty without a plan.
// ---------------------------------------------------------------------------
export type PhaseBand = {
	name: string
	start: Date
	end: Date
	isCurrent: boolean
}

export function buildPhaseBands(
	activePlan: ActivePlan | null,
	now: Date = new Date(),
): PhaseBand[] {
	if (!activePlan) return []
	const eventDate = new Date(activePlan.eventDate)
	const totalWeeks = activePlan.phases.reduce((sum, p) => sum + p.weeks, 0)
	const planStart = new Date(eventDate.getTime() - totalWeeks * 7 * DAY_MS)
	const currentPhase = planArc(activePlan.phases, eventDate, now).phase
	let cumulativeWeeks = 0
	return activePlan.phases.map((phase) => {
		const start = new Date(planStart.getTime() + cumulativeWeeks * 7 * DAY_MS)
		cumulativeWeeks += phase.weeks
		const end = new Date(planStart.getTime() + cumulativeWeeks * 7 * DAY_MS)
		return {
			name: phase.name,
			start,
			end,
			isCurrent: phase.name === currentPhase,
		}
	})
}
