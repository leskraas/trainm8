/**
 * The home timeline's data model: one bi-directional season, week by week.
 *
 * The screen is a single stream anchored on today, so this presenter answers two
 * questions at once. Vertically it is a list of **weeks**, each with its own
 * header and its own chronological rows — the reading axis. Horizontally the
 * same weeks are a strip of per-week rollups — the navigation axis. Both come
 * from one array, because a strip built from a second derivation could disagree
 * with the stream about what a week contains, and an overview that disagrees
 * with the thing it overviews is worse than no overview.
 *
 * The strip renders the **whole season**; the stream renders a window around
 * today that grows as the athlete reads. That is why the week list here is
 * complete and unfiltered: windowing is the component's business, and a strip
 * with holes in it is not an overview.
 *
 * Everything is derived, nothing is fetched: the same `LedgerSession[]` the
 * ledger already ships feeds all of it, through `toSessionLedgerEntry` for
 * status and load and `buildLedgerRows`' own profile rule for the shape bars.
 */
import {
	addDays,
	dayBoundsUTC,
	localDate,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import {
	formatDateSpan,
	formatDayDate,
	formatDayMonth,
	formatDayOfMonth,
	formatLoad,
	formatSigned,
	formatTss,
	formatWeekday,
	formatWeekdayShort,
	formatWeeks,
	roundLoad,
} from '#app/utils/format.ts'
import {
	type DisciplineThresholdMap,
	targetText,
} from '#app/utils/intensity-target.ts'
import {
	reconcileCoach,
	type SustainedDeviation,
} from '#app/utils/load/coach.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import {
	buildLedgerRows,
	type SessionRow,
} from '#app/utils/session-ledger-rows.ts'
import {
	deriveSessionProfile,
	type ProfileBar,
	type ProfileBarGroup,
} from '#app/utils/session-profile.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import {
	deriveLedgerStatus,
	type LedgerStatus,
	getDisciplineLabel,
} from '#app/utils/training.ts'
import {
	buildPhaseBands,
	buildPlanContext,
	buildTodayCard,
} from '../cockpit/presenter.ts'
import {
	buildRowContent,
	type RowChip,
	type RowWeekContext,
} from './row-content.ts'

/** How a day reads as a dot in a strip cell. */
export type DayDot = 'empty' | 'done' | 'planned' | 'missed' | 'today'

/** One session, as the stream renders it. */
export type TimelineRow = {
	id: string
	/** The Workout Detail View — where a tapped row goes. */
	to: string
	/** `WED` — the weekday, in the athlete's own timezone. */
	dayLabel: string
	/** `19 Aug` for a past week, `19` inside the current one. */
	dateLabel: string
	discipline: string
	disciplineLabel: string
	title: string
	status: LedgerStatus
	isToday: boolean
	bars: ProfileBar[]
	groups: ProfileBarGroup[]
	/** Line 1 — external load: what was done, or what is being asked for. */
	externalLoad: string | null
	/** Line 2 — internal load: what it cost, or what to hold it to. */
	internalLoad: string | null
	chips: RowChip[]
}

/** One training week, on both axes at once. */
export type TimelineWeek = {
	/** The week's Monday as `YYYY-MM-DD` — the Week Replan's own key (ADR 0025). */
	key: string
	/** `17–23 August` — the stream's week header. */
	rangeLabel: string
	/** `17–23 Aug` — the strip cell, where 124px is all there is. */
	stripLabel: string
	/** `Build 3 · This week`, or `Before this plan · Imported`. */
	phaseLabel: string
	/** `this week`, `build 3`, `imported` — the strip cell's one quiet word. */
	stripPhaseLabel: string
	/** `2 of 5 done · 48 of 312 TSS` — never a fabricated side. */
	statsLabel: string
	/** Summed Planned TSS across the week; null when nothing resolved. */
	plannedTss: number | null
	/** Summed actual TSS across the week; null when nothing was recorded. */
	doneTss: number | null
	/** Before the plan began: history the athlete brought with them. */
	imported: boolean
	/** The plan's own first week — the one that carries the "history above" line. */
	planStart: boolean
	/** The week today falls in. */
	isNow: boolean
	/** Seven dots, Monday first. */
	dayDots: DayDot[]
	rows: TimelineRow[]
}

/** The far end of the season, stated rather than left as an empty scroll. */
export type TimelineEndCap = {
	/** `20 September` — the last day anything is written for. */
	writtenThroughLabel: string
	/** Plan weeks past that with no sessions in them; 0 when the plan is written. */
	unwrittenWeeks: number
	eventName: string | null
	/** `25 Oct` — race day, when there is a plan anchored to one. */
	eventDateLabel: string | null
}

export type TimelineSeason = {
	/** Every week of the season, earliest first. The strip renders all of them. */
	weeks: TimelineWeek[]
	/** Index into `weeks` of the week today falls in; the window grows from here. */
	todayWeekIndex: number
	/** Today's session, the stream's landing anchor; null when today is a rest day. */
	todayRowId: string | null
	/**
	 * The heaviest planned week in the season — the scale every strip load bar is
	 * drawn against, so the bars compare weeks to the season rather than each to
	 * itself. At least 1, so the arithmetic cannot divide by zero.
	 */
	heaviestPlannedTss: number
	/** `7 July` — the first day anything is logged for. */
	loggedFromLabel: string | null
	/** `Wed 19 Aug · week 3 of 12` — the header's one line of orientation. */
	headerLabel: string
	endCap: TimelineEndCap
}

const DAYS_IN_WEEK = 7

export function buildTimelineSeason({
	ledger,
	now = new Date(),
	timezone = 'UTC',
	activePlan = null,
}: {
	ledger: LedgerSession[]
	now?: Date
	timezone?: string
	activePlan?: ActivePlan | null
}): TimelineSeason {
	const todayKey = localDate(now, timezone)
	const nowMonday = weekMonday(now, timezone)
	// The ledger's own row builder decides what a row *is* (status, load, band,
	// profile bars), so the stream and the Session Ledger can never disagree
	// about a session. Its `now` divider is dropped here: the week headers and
	// today's own row already say where the boundary is, twice over.
	const ledgerRows = buildLedgerRows(ledger, now).filter(
		(row): row is SessionRow => row.kind === 'session',
	)
	// Weeks are bucketed by the Athlete Calendar, the same Monday–Sunday windows
	// Weekly Plan Adherence uses — and identically on server and client, so the
	// stream cannot hydrate into a different shape than it rendered.
	const byWeek = new Map<string, SessionRow[]>()
	for (const row of ledgerRows) {
		const key = weekMonday(new Date(row.session.scheduledAt), timezone)
		const bucket = byWeek.get(key) ?? []
		bucket.push(row)
		byWeek.set(key, bucket)
	}

	const planStartMonday = activePlan
		? weekMonday(new Date(activePlan.planStart), timezone)
		: null
	const mondays = seasonMondays({
		sessionWeeks: [...byWeek.keys()],
		nowMonday,
		planStartMonday,
	})
	const phases = phaseLookup(activePlan, now, timezone)

	const weeks = mondays.map((monday) =>
		buildWeek({
			monday,
			// Rows are chronological, always: an unplanned session that landed in a
			// past week goes in by weekday rather than being appended to the end.
			rows: (byWeek.get(monday) ?? [])
				.slice()
				.sort(
					(a, b) =>
						new Date(a.session.scheduledAt).getTime() -
						new Date(b.session.scheduledAt).getTime(),
				),
			todayKey,
			nowMonday,
			timezone,
			imported: planStartMonday != null && monday < planStartMonday,
			planStart: monday === planStartMonday,
			phase: phases.get(monday) ?? null,
		}),
	)

	const todayWeekIndex = Math.max(
		0,
		weeks.findIndex((week) => week.isNow),
	)
	const todayRow = weeks[todayWeekIndex]?.rows.find((row) => row.isToday)
	const firstLogged = ledger[0]

	return {
		weeks,
		todayWeekIndex,
		todayRowId: todayRow?.id ?? null,
		heaviestPlannedTss: Math.max(
			1,
			...weeks.map((week) => week.plannedTss ?? week.doneTss ?? 0),
		),
		loggedFromLabel: firstLogged
			? formatDayMonth(new Date(firstLogged.scheduledAt), timezone)
			: null,
		headerLabel: headerLabel(activePlan, now, timezone),
		endCap: buildEndCap({ ledger, activePlan, timezone, mondays }),
	}
}

/**
 * `Wed 19 Aug · week 3 of 12` — today's date, and where in the plan it falls.
 * The plan half is dropped rather than faked when there is no plan: "week 3 of
 * 12" with nothing to count against is a claim, not a label.
 */
function headerLabel(
	activePlan: ActivePlan | null,
	now: Date,
	timezone: string,
): string {
	const today = formatDayDate(now, timezone)
	// Weekly Plan Adherence is not needed for the arc position, so the ratio it
	// would carry is deliberately not fetched for this one label.
	const plan = buildPlanContext(activePlan, null, now)
	return plan
		? `${today} · week ${plan.weekInPlan} of ${plan.totalWeeks}`
		: today
}

/**
 * The Mondays the season spans: from the earliest week that has anything in it
 * (or the plan's first week, whichever is earlier) through the latest, always
 * including this one. Empty weeks in the middle are kept — a season with holes
 * in the strip would read as a season with holes in it.
 */
function seasonMondays({
	sessionWeeks,
	nowMonday,
	planStartMonday,
}: {
	sessionWeeks: string[]
	nowMonday: string
	planStartMonday: string | null
}): string[] {
	const anchors = [...sessionWeeks, nowMonday]
	if (planStartMonday) anchors.push(planStartMonday)
	const first = anchors.reduce((a, b) => (a < b ? a : b))
	const last = anchors.reduce((a, b) => (a > b ? a : b))
	const mondays: string[] = []
	for (let monday = first; monday <= last; monday = addDays(monday, 7)) {
		mondays.push(monday)
	}
	return mondays
}

/**
 * Which phase each week of the plan sits in, and where in that phase it sits —
 * `Build 3` is the third week of the Build phase, counted by position and never
 * by name, because a season with two A-races runs Base twice (ADR 0044 §2).
 */
function phaseLookup(
	activePlan: ActivePlan | null,
	now: Date,
	timezone: string,
): Map<string, { name: string; weekInPhase: number }> {
	const lookup = new Map<string, { name: string; weekInPhase: number }>()
	for (const band of buildPhaseBands(activePlan, now)) {
		let monday = weekMonday(band.start, timezone)
		const endMonday = weekMonday(new Date(band.end.getTime() - 1), timezone)
		let weekInPhase = 1
		while (monday <= endMonday) {
			lookup.set(monday, { name: band.name, weekInPhase })
			monday = addDays(monday, 7)
			weekInPhase += 1
		}
	}
	return lookup
}

function buildWeek({
	monday,
	rows: sessionRows,
	todayKey,
	nowMonday,
	timezone,
	imported,
	planStart,
	phase,
}: {
	monday: string
	rows: SessionRow[]
	todayKey: string
	nowMonday: string
	timezone: string
	imported: boolean
	planStart: boolean
	phase: { name: string; weekInPhase: number } | null
}): TimelineWeek {
	const isNow = monday === nowMonday
	const start = dayBoundsUTC(monday, timezone).start
	const end = dayBoundsUTC(addDays(monday, DAYS_IN_WEEK - 1), timezone).start
	const week = { imported, isNow }

	const rows = sessionRows.map((row) =>
		buildRow({ row, week, todayKey, timezone, sameMonth: isNow }),
	)

	let done = 0
	let missed = 0
	let doneTss: number | null = null
	let plannedTss: number | null = null
	const dayDots: DayDot[] = Array.from({ length: DAYS_IN_WEEK }, () => 'empty')
	sessionRows.forEach((sessionRow, index) => {
		const { entry } = sessionRow
		if (entry.status === 'completed') done += 1
		if (entry.status === 'missed') missed += 1
		// Planned and actual are summed independently (ADR 0030): a week that was
		// planned but never trustworthily recorded still carries its planned load
		// while its actual reads honestly absent.
		if (entry.load != null) doneTss = (doneTss ?? 0) + entry.load
		if (entry.plannedTss != null && entry.plannedTss > 0) {
			plannedTss = (plannedTss ?? 0) + entry.plannedTss
		}
		const slot = weekdayIndex(new Date(entry.scheduledAt), timezone)
		dayDots[slot] = strongerDot(dayDots[slot]!, dotFor(rows[index]!))
	})

	return {
		key: monday,
		rangeLabel: formatDateSpan(start, end, timezone),
		stripLabel: formatDateSpan(start, end, timezone, { month: 'short' }),
		phaseLabel: weekPhaseLabel({ imported, isNow, planStart, phase }),
		stripPhaseLabel: stripPhaseLabel({ imported, isNow, phase }),
		statsLabel: weekStatsLabel({
			imported,
			past: monday < nowMonday,
			isNow,
			total: sessionRows.length,
			done,
			missed,
			doneTss: doneTss != null ? roundLoad(doneTss) : null,
			plannedTss: plannedTss != null ? roundLoad(plannedTss) : null,
		}),
		plannedTss: plannedTss != null ? roundLoad(plannedTss) : null,
		doneTss: doneTss != null ? roundLoad(doneTss) : null,
		imported,
		planStart,
		isNow,
		dayDots,
		rows,
	}
}

function buildRow({
	row,
	week,
	todayKey,
	timezone,
	sameMonth,
}: {
	row: SessionRow
	week: RowWeekContext
	todayKey: string
	timezone: string
	/** Inside the current week the month is the header's job, not the row's. */
	sameMonth: boolean
}): TimelineRow {
	const { session, entry } = row
	const scheduledAt = new Date(session.scheduledAt)
	const isToday = localDate(scheduledAt, timezone) === todayKey
	const content = buildRowContent(row, week, { isToday })
	return {
		id: session.id,
		to: `/training/sessions/${session.id}`,
		dayLabel: formatWeekdayShort(scheduledAt, timezone),
		// Outside the current week a row states its own month, so a row lifted out
		// of context still reads as a date.
		dateLabel: sameMonth
			? formatDayOfMonth(scheduledAt, timezone)
			: formatDayMonth(scheduledAt, timezone),
		discipline: entry.discipline,
		disciplineLabel: getDisciplineLabel(entry.discipline),
		title: entry.title ?? `${getDisciplineLabel(entry.discipline)} recording`,
		status: entry.status,
		isToday,
		bars: row.bars,
		groups: row.groups,
		externalLoad: content.externalLoad,
		internalLoad: content.internalLoad,
		chips: content.chips,
	}
}

/** Monday-first weekday index of an instant, in the athlete's own timezone. */
function weekdayIndex(instant: Date, timezone: string): number {
	const day = new Date(
		`${localDate(instant, timezone)}T00:00:00.000Z`,
	).getUTCDay()
	return (day + 6) % 7
}

function dotFor(row: TimelineRow): DayDot {
	if (row.isToday) return 'today'
	if (row.status === 'missed') return 'missed'
	if (row.status === 'completed') return 'done'
	return 'planned'
}

/**
 * Two sessions can share a day, and the dot has room for one story. The louder
 * one wins: a miss the athlete needs to see outranks a session they completed,
 * and today outranks everything.
 */
const DOT_RANK: Record<DayDot, number> = {
	empty: 0,
	planned: 1,
	done: 2,
	missed: 3,
	today: 4,
}

function strongerDot(a: DayDot, b: DayDot): DayDot {
	return DOT_RANK[b] > DOT_RANK[a] ? b : a
}

function weekPhaseLabel({
	imported,
	isNow,
	planStart,
	phase,
}: {
	imported: boolean
	isNow: boolean
	planStart: boolean
	phase: { name: string; weekInPhase: number } | null
}): string {
	// An imported week says what it is instead of borrowing a phase it predates.
	if (imported) return 'Before this plan · Imported'
	const parts: string[] = []
	if (phase) parts.push(`${phase.name} ${phase.weekInPhase}`)
	if (isNow) parts.push('This week')
	else if (planStart) parts.push('The plan starts here')
	return parts.join(' · ')
}

function stripPhaseLabel({
	imported,
	isNow,
	phase,
}: {
	imported: boolean
	isNow: boolean
	phase: { name: string; weekInPhase: number } | null
}): string {
	if (imported) return 'imported'
	if (isNow) return 'this week'
	return phase ? `${phase.name.toLowerCase()} ${phase.weekInPhase}` : ''
}

/**
 * What the week header says happened. Three readings, because a week in the past
 * and a week still to come are not the same question: history counts what was
 * done, the future counts what is asked for, and an imported week counts only
 * sessions, since there was never a plan to count them against.
 */
function weekStatsLabel({
	imported,
	past,
	isNow,
	total,
	done,
	missed,
	doneTss,
	plannedTss,
}: {
	imported: boolean
	past: boolean
	isNow: boolean
	total: number
	done: number
	missed: number
	doneTss: number | null
	plannedTss: number | null
}): string {
	if (total === 0) {
		return plannedTss != null
			? `Nothing written · ${formatTss(plannedTss)}`
			: 'Nothing written'
	}
	const sessions = `${total} ${total === 1 ? 'session' : 'sessions'}`
	if (imported) {
		return join(sessions, doneTss != null ? formatTss(doneTss) : null)
	}
	if (past || isNow) {
		const progress = `${done} of ${total} done`
		const missedClause = missed > 0 ? `${missed} missed` : null
		return join(progress, missedClause, loadClause(doneTss, plannedTss))
	}
	return join(`${total} planned`, loadClause(null, plannedTss))
}

/** `48 of 312 TSS`, or whichever single side exists. Never a zero-filled pair. */
function loadClause(
	doneTss: number | null,
	plannedTss: number | null,
): string | null {
	if (doneTss != null && plannedTss != null) {
		return `${formatLoad(doneTss)} of ${formatTss(plannedTss)}`
	}
	if (doneTss != null) return formatTss(doneTss)
	if (plannedTss != null) return formatTss(plannedTss)
	return null
}

function join(...parts: Array<string | null>): string {
	return parts.filter((part): part is string => !!part).join(' · ')
}

/**
 * The far end of the stream. The plan is written through some date and sketched
 * past it, and saying which is which is the whole point of the cap: an athlete
 * who scrolls into empty weeks should be told the weeks are unwritten, not left
 * wondering whether the app lost them.
 */
function buildEndCap({
	ledger,
	activePlan,
	timezone,
	mondays,
}: {
	ledger: LedgerSession[]
	activePlan: ActivePlan | null
	timezone: string
	mondays: string[]
}): TimelineEndCap {
	const last = ledger[ledger.length - 1]
	const lastMonday = mondays[mondays.length - 1]!
	const eventDate = activePlan ? new Date(activePlan.eventDate) : null
	// Whole weeks of the plan past the last one anything is written for. Counted
	// from Mondays so a race mid-week counts its own week as unwritten.
	const unwrittenWeeks = eventDate
		? Math.max(
				0,
				Math.round(
					(new Date(
						`${weekMonday(eventDate, timezone)}T00:00:00.000Z`,
					).getTime() -
						new Date(`${lastMonday}T00:00:00.000Z`).getTime()) /
						(7 * 24 * 60 * 60 * 1000),
				),
			)
		: 0
	return {
		writtenThroughLabel: last
			? formatDayMonth(new Date(last.scheduledAt), timezone)
			: formatDayMonth(
					dayBoundsUTC(addDays(lastMonday, DAYS_IN_WEEK - 1), timezone).start,
					timezone,
				),
		unwrittenWeeks,
		eventName: activePlan?.eventName ?? null,
		eventDateLabel: eventDate ? formatDayMonth(eventDate, timezone) : null,
	}
}

// ---------------------------------------------------------------------------
// The hero — today's session, and the one sentence that says whether to do it
// ---------------------------------------------------------------------------

/**
 * The hero above the stream: what today asks for, and the coach's verdict on it.
 *
 * It is the decision strip's content in the timeline's shape — the same
 * `buildTodayCard` session, the same reconciled coach voice, the same honestly
 * named CTA. Nothing new is computed about the session here; only how it reads.
 *
 * The hero is anchored on **today** and never moves off it: the strip and the
 * stream travel, this does not. `buildTodayCard` answers "what is the next
 * thing to do", which on a rest day — or once today's session is logged — is a
 * session days away. So two things are said rather than one: the kicker names
 * the day that session is *actually* on (`Today`, `Tomorrow`, `Friday`), and
 * the heading states today's own standing. A session that is not today's is
 * demoted from the headline to a fact, because a heading that reads `TODAY`
 * above Friday's intervals answers the screen's one question wrongly (#493).
 */
export type TimelineHero = {
	/** `Today · Run · 9 weeks to race day` — rendered as the kicker. */
	kicker: string
	/** Today's session, or — when today holds none — what today actually is. */
	title: string
	/**
	 * `Next up · Threshold 4 × 8 min` — the session the rest of the hero
	 * describes, when the heading is about today rather than about it. Null when
	 * the hero is showing today's own session, which the heading already names.
	 */
	next: string | null
	bars: ProfileBar[]
	groups: ProfileBarGroup[]
	/** `62 min`, `91 TSS`, `4:05–4:12 /km` — only the ones that resolved. */
	facts: string[]
	/** The one sentence: Form, its reading, and what to do about it. */
	verdict: string
	/** The single honest action, label and destination both from the presenter. */
	cta: { label: string; to: string }
	/** What the collapsed header shows instead of the whole hero. */
	collapsed: { title: string; summary: string }
}

export function buildTimelineHero({
	ledger,
	now = new Date(),
	timezone = 'UTC',
	thresholds = {},
	activePlan = null,
	current,
	trust,
	sustained = null,
	nudge,
}: {
	ledger: LedgerSession[]
	now?: Date
	timezone?: string
	thresholds?: DisciplineThresholdMap
	activePlan?: ActivePlan | null
	current: LoadTriad | null
	trust: TsbTrust
	sustained?: SustainedDeviation | null
	nudge?: SessionNudge
}): TimelineHero | null {
	const today = buildTodayCard(ledger, now, thresholds, timezone)
	if (!today) return null
	const profile = deriveSessionProfile(
		ledger.find((session) => session.id === today.id)?.workout ?? null,
	)
	const target = targetText(today.target)
	const facts = [
		today.durationMin != null ? `${today.durationMin} min` : null,
		today.plannedTss != null ? formatTss(today.plannedTss) : null,
		target,
		// A lifting session has no TSS and no pace; its lifts are its facts.
		...(today.lifts ?? []).map((lift) =>
			lift.loadLabel
				? `${lift.name} ${lift.scheme} · ${lift.loadLabel}`
				: `${lift.name} ${lift.scheme}`,
		),
	].filter((fact): fact is string => !!fact)
	// The day the session is actually on — the kicker's first word, and the one
	// the stream's own row for this session carries. Both read it off the same
	// instant in the same Athlete Timezone, so they cannot disagree about which
	// day it is.
	const when = dayName(today.date, now, timezone)
	return {
		kicker: join(
			when,
			today.disciplineLabel,
			activePlan ? raceCountdown(activePlan, now) : null,
		),
		// The headline belongs to today. Only when the session shown *is* today's
		// does it get to be the title; otherwise today speaks for itself and the
		// session drops to the line below.
		title: today.isToday ? today.title : todayStanding(ledger, now, timezone),
		next: today.isToday ? null : `Next up · ${today.title}`,
		bars: profile.bars,
		groups: profile.groups,
		facts,
		verdict: coachVerdict({ current, trust, sustained, nudge }),
		cta: { label: today.cta, to: today.ctaTo },
		collapsed: {
			// Collapsed, the row is the thing its button opens, so the session keeps
			// the title there — with the day beside it, which is what stops the
			// summary from implying today.
			title: today.title,
			summary: join(when, ...facts.slice(0, 2)),
		},
	}
}

/**
 * `Today`, `Tomorrow`, `Friday`, `22 Feb` — the day a session falls on, named
 * the way an athlete would name it. A weekday alone is unambiguous only inside
 * the next six days; past that it could be either of two Fridays, so the date
 * is the honest answer.
 */
function dayName(date: Date, now: Date, timezone: string): string {
	const todayKey = localDate(now, timezone)
	const key = localDate(date, timezone)
	if (key === todayKey) return 'Today'
	if (key === addDays(todayKey, 1)) return 'Tomorrow'
	if (key > todayKey && key <= addDays(todayKey, DAYS_IN_WEEK - 1)) {
		return formatWeekday(date, timezone)
	}
	return formatDayMonth(date, timezone)
}

/**
 * What today itself holds, as the heading states it when the session on show is
 * not today's. Read straight off the ledger through the ledger's own status
 * rule, so "done" here means exactly what a completed row means in the stream.
 *
 * There is deliberately no `still to come` case: a planned session today is the
 * earliest planned session there is, so `buildTodayCard` would have picked it
 * and the heading would be its title.
 */
function todayStanding(
	ledger: LedgerSession[],
	now: Date,
	timezone: string,
): string {
	const todayKey = localDate(now, timezone)
	const statuses = ledger
		.filter(
			(session) =>
				localDate(new Date(session.scheduledAt), timezone) === todayKey,
		)
		.map((session) =>
			deriveLedgerStatus(
				{ status: session.status, scheduledAt: new Date(session.scheduledAt) },
				now,
			),
		)
	if (statuses.includes('completed')) return 'Today is done'
	if (statuses.length > 0) return 'Nothing left on today'
	return 'Nothing on today'
}

/** `9 weeks to race day`, counted in whole weeks the way an athlete counts them. */
function raceCountdown(activePlan: ActivePlan, now: Date): string | null {
	const days = Math.ceil(
		(new Date(activePlan.eventDate).getTime() - now.getTime()) /
			(24 * 60 * 60 * 1000),
	)
	if (days <= 0) return null
	if (days <= DAYS_IN_WEEK) {
		return `${days} ${days === 1 ? 'day' : 'days'} to race day`
	}
	return `${formatWeeks(Math.round(days / DAYS_IN_WEEK))} to race day`
}

/**
 * The coach's one line, with the Coach card's honesty rules kept verbatim: a
 * cold start never shows a Form number (ADR 0008/0010), Form and sustained
 * adherence reconcile into a single voice (#120) rather than talking over each
 * other, and a Session Nudge's reason replaces the generic recommendation when
 * the coach actually did something to the next session (#157/#158/#187).
 */
function coachVerdict({
	current,
	trust,
	sustained,
	nudge,
}: {
	current: LoadTriad | null
	trust: TsbTrust
	sustained: SustainedDeviation | null
	nudge?: SessionNudge
}): string {
	const tsb = current?.tsb ?? null
	const coldStart = !trust.trustworthy || tsb == null
	const coach = reconcileCoach(
		coldStart ? null : readinessFromTsb(tsb),
		sustained,
	)
	const nudgeReason = nudge && nudge.outcome !== 'none' ? nudge.reason : null
	if (coldStart) {
		return (
			nudgeReason ??
			(coach?.source === 'adherence'
				? coach.recommendation
				: `Your Form reading is reliable after ${trust.requiredDays} days — day ${trust.daysOfHistory}/${trust.requiredDays}.`)
		)
	}
	const reading = `Form ${formatSigned(tsb)}, ${coach!.label.toLowerCase()}`
	return `${reading} — ${nudgeReason ?? coach!.recommendation}`
}
