/**
 * The home timeline's data model: one bi-directional season, week by week.
 *
 * The screen is a single stream anchored on today, so this presenter answers two
 * questions at once. Vertically it is a list of **weeks**, each with its own
 * header and its own chronological **days** — the reading axis. Horizontally the
 * same weeks are a strip of per-week rollups — the navigation axis. Both come
 * from one array, because a strip built from a second derivation could disagree
 * with the stream about what a week contains, and an overview that disagrees
 * with the thing it overviews is worse than no overview.
 *
 * A row is a day and a day owns zero or more sessions (ADR 0065 §1), and **from
 * today forward every day is a row** whether anything is on it or not: the grid
 * exists before the content does. Behind today the days are built too, back as
 * far as the query itself reaches, but a **run** of consecutive empty ones is
 * handed over as a band the stream collapses into a single row (ADR 0065 §3).
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
	localTimeUTC,
	weekdayIndex,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import {
	formatDateSpan,
	formatDayDate,
	formatDayMonth,
	formatDayOfMonth,
	formatLoad,
	formatMonthShort,
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
	ANNET_TRACK_LABELS,
	SESSION_OWNER_LABELS,
	strengthPartialLabel,
	unmeasuredCountLabel,
	ZONE_INTENT_NOTE,
} from '#app/utils/labels.ts'
import {
	reconcileCoach,
	type SustainedDeviation,
} from '#app/utils/load/coach.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import { lastClosedWeekKey } from '#app/utils/load/week-change.ts'
import {
	buildWeekVolumes,
	type OtherWeekVolume,
	type PlanTrackTargets,
	type TrackWeekVolume,
	volumeSessionOf,
} from '#app/utils/plan-outline/week-volumes.ts'
import {
	buildLedgerRows,
	type SessionRow,
} from '#app/utils/session-ledger-rows.ts'
import {
	type SessionOwner,
	sessionOwner,
} from '#app/utils/session-ownership.ts'
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
} from '../presenter.ts'
import {
	buildRowContent,
	type RowChip,
	type RowWeekContext,
} from './row-content.ts'

/**
 * How far back home's own query reaches — half a year, the bound
 * `getSessionLedger` is called with on this route.
 *
 * It lives here rather than in the loader because two things have to agree
 * about it and neither of them is the query: the **start cap** states this
 * bound instead of claiming the athlete's history starts there, and no day
 * behind it is built at all (ADR 0075 §2 and §3). A band saying
 * `9 days · nothing logged` over dates the query never asked about would be a
 * fabrication, and this is the line between "nothing was logged" and "nothing
 * was fetched".
 */
export const TIMELINE_TRAILING_DAYS = 182

/**
 * How a day reads as a dot in a strip cell.
 *
 * `unfetched` is not a quieter `empty`, it is a different statement: the query
 * never asked about that day, so the strip has nothing to say about it. `empty`
 * claims the day was logged as blank, and a cell that made that claim about a
 * date behind the query's reach would be fabricating a fact (ADR 0075 §2) — the
 * same fabrication the stream's own bands are forbidden from making.
 */
export type DayDot =
	| 'unfetched'
	| 'empty'
	| 'done'
	| 'planned'
	| 'missed'
	| 'today'

/** One session, as the stream renders it inside the day that owns it. */
export type TimelineSession = {
	id: string
	/** The Workout Detail View — where a tapped session goes. */
	to: string
	discipline: string
	disciplineLabel: string
	title: string
	status: LedgerStatus
	bars: ProfileBar[]
	groups: ProfileBarGroup[]
	/** Line 1 — external load: what was done, or what is being asked for. */
	externalLoad: string | null
	/** Line 2 — internal load: what it cost, or what to hold it to. */
	internalLoad: string | null
	chips: RowChip[]
	/**
	 * Whose session this is — the athlete's own, or the app's to change
	 * (`session-ownership.ts`, ADR 0080). Ownership is what decides which
	 * sessions the app may touch, so the athlete gets to see it (#505).
	 */
	owner: SessionOwner
	/**
	 * `din økt` / `appens økt` — the mark's own words, on a planned row only.
	 * A done or missed session is history that nothing changes any more, so
	 * whose it was tells the athlete nothing and the row stays quiet.
	 */
	ownerLabel: string | null
}

/**
 * One day of the season — **the stream's row** (ADR 0065 §1).
 *
 * A day owns zero or more sessions. That is the whole answer to "two sessions on
 * one day": a morning run and an evening lift are two sessions under one date
 * gutter, not two unrelated rows that happen to share a date. It is also what
 * lets a day with *nothing* on it be addressable at all — the row exists before
 * its content does, the way a spreadsheet cell does.
 *
 * **Every day the query reached is built**, session or not — forward to the
 * horizon and back to `TIMELINE_TRAILING_DAYS`. Behind today a *run* of empty
 * ones is not rendered as rows, though: the week hands the stream a
 * {@link TimelineBand} over it, and the rows stay in the model so expanding the
 * band has something to expand into (ADR 0065 §3).
 */
export type TimelineDay = {
	/** `YYYY-MM-DD` in the athlete's own timezone — the day's own identity. */
	key: string
	/** `WED` — the weekday, in the athlete's own timezone. */
	dayLabel: string
	/** `19 Aug` for a past week, `19` inside the current one. */
	dateLabel: string
	isToday: boolean
	/**
	 * The **Plan Outline** prescribes recovery on this day, which is the only
	 * licence the row has to say `Rest day` (ADR 0065 §4).
	 *
	 * It is always `false` today, and deliberately so: nothing in the model
	 * prescribes recovery per *day*. `PlanOutlinePhase.rhythm` (`3:1` / `2:1` /
	 * `none`) names which **weeks** of a phase are recovery weeks, and a recovery
	 * week is a week of lighter sessions rather than a week of rest days;
	 * `AthleteProfile.trainableWeekdays` is **Training Availability**, and a day
	 * the athlete cannot train is not a day the plan asked them to recover on.
	 * Deriving the label from either would be the app inventing a fact about the
	 * athlete's training, on the majority of rows. So every empty day is blank
	 * until the Outline can say *"this day is recovery"* — and whoever gives it
	 * that can produce this flag without touching the timeline.
	 */
	restPrescribed: boolean
	/**
	 * Chronological. Zero of them is a legal day: forward of today that is the
	 * empty cell the athlete writes into.
	 */
	sessions: TimelineSession[]
}

/**
 * A run of consecutive empty days behind today, as **one row** — `4–10` ·
 * `7 days · nothing logged` — that expands in place into the days it covers.
 *
 * Two reasons it exists, and the second is the load-bearing one (ADR 0065 §3):
 * the band **states the fact the blank rows only imply**, and it keeps stream
 * height behind the reader stable, which is what the scroll module's growth
 * compensation depends on.
 *
 * A run of **one** is not a band — a single empty day behind today is just a
 * day, because collapsing one row into one row states nothing and costs a tap.
 * A run stops at the week's edge: a week block is the unit the stream mounts,
 * windows and anchors on, so a band that spanned two of them would have to
 * exist in a week that is not loaded (ADR 0075 §1 and §4, amending 0065 §3's
 * nine-day example).
 */
export type TimelineBand = {
	/** The run's first day, `YYYY-MM-DD` — the band's own identity. */
	key: string
	/** Every day the run covers, in order. They are rows of the week too. */
	dayKeys: string[]
	/** `4–10` — the day numbers, in the gutter every row aligns to. */
	daysLabel: string
	/** `Aug`, or `Jul–Aug` where the run crosses a month. */
	monthLabel: string
	/** `7 days · nothing logged` — what the band says that the blanks do not. */
	summaryLabel: string
	/** `4–10 August` — the range as the control's own name says it. */
	rangeLabel: string
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
	/**
	 * Seven dots, Monday first — one per calendar day, and only the days that
	 * were actually built read as `empty`. A day behind the query's reach reads
	 * as `unfetched`, so the strip and the stream agree about which days are
	 * empty (#497 AC 6) instead of the strip inventing seven blanks over dates
	 * nobody asked about.
	 */
	dayDots: DayDot[]
	/**
	 * The week's days, earliest first — a row is a day, not a session. All seven
	 * from today forward; behind today, every day the query reached.
	 */
	rows: TimelineDay[]
	/**
	 * The runs of empty days behind today that render as one row until they are
	 * expanded. Every day named here is also in `rows`: the band is a *view* on
	 * them, so the stream can expand it without asking for anything more.
	 */
	bands: TimelineBand[]
	/**
	 * The three week numbers per **Training Track** of the active plan — Week
	 * Target, Planned Volume, Actual Volume — each in the track's own Volume
	 * Currency (#505 stories 20–26, 34, 85; `week-volumes.ts`). Empty without a
	 * plan: there is no track to read a week in.
	 */
	tracks: TimelineTrackWeek[]
	/** Annet: sessions that count in nothing (#505 story 33), or null. */
	otherTrack: TimelineOtherTrack | null
}

/**
 * One track's week as the header reads it: the pure model's numbers and codes
 * (`week-volumes.ts`), with the words put on here, at the edge (ADR 0081).
 */
export type TimelineTrackWeek = TrackWeekVolume & {
	/** `+2 uten km`, or null when every planned session has a number. */
	plannedUnmeasuredLabel: string | null
	actualUnmeasuredLabel: string | null
	/** `til og med torsdag · resten ikke målt`, or null. */
	partialLabel: string | null
	/** `hensikt, ikke en måling` beside a planned zone split, or null. */
	zoneIntentNote: string | null
}

/** Annet, with its name and what it says about itself. */
export type TimelineOtherTrack = OtherWeekVolume & {
	label: string
	note: string
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
	/**
	 * Today, as `YYYY-MM-DD` in the athlete's own timezone — **the stream's
	 * landing anchor**. It names a day rather than a session, so it is a fact
	 * about the calendar instead of a fact about what happens to be scheduled,
	 * and because every day from today forward is a row there is always a node
	 * carrying it — on a rest day too. That is what lets the landing, the hero's
	 * collapse threshold and the back-to-today pill work with no fallback and no
	 * special case anywhere (ADR 0065 §1).
	 */
	todayKey: string
	/**
	 * The heaviest planned week in the season — the scale every strip load bar is
	 * drawn against, so the bars compare weeks to the season rather than each to
	 * itself. At least 1, so the arithmetic cannot divide by zero.
	 */
	heaviestPlannedTss: number
	/** `7 Jul` — the first day anything is logged for, inside the reach below. */
	loggedFromLabel: string | null
	/** `22 Feb` — the earliest day home's own query reaches. */
	reachesBackToLabel: string
	/** `26 weeks` — how much of the athlete's history that reach is. */
	reachLabel: string
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
	// The earliest day this screen knows anything about. Behind it the query
	// asked nothing, so nothing behind it is built and no band speaks for it.
	const reachesBackKey = addDays(todayKey, -TIMELINE_TRAILING_DAYS)
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
		// The week the reach lands in is the earliest one the strip may draw:
		// behind it there is nothing to draw a cell *about*.
		reachMonday: weekMonday(middayOf(reachesBackKey, timezone), timezone),
	})
	const phases = phaseLookup(activePlan, now, timezone)
	const tracks = activePlan?.tracks ?? []
	// The week the Week Replan has closed (Sunday 20:00 local): on Sunday
	// evening this week grades through Sunday, as Ukeskiftet reads it.
	const closedThrough = lastClosedWeekKey(now, timezone)

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
			reachesBackKey,
			nowMonday,
			timezone,
			imported: planStartMonday != null && monday < planStartMonday,
			planStart: monday === planStartMonday,
			phase: phases.get(monday) ?? null,
			planStartMonday,
			tracks,
			closed: monday <= closedThrough,
		}),
	)

	const todayWeekIndex = Math.max(
		0,
		weeks.findIndex((week) => week.isNow),
	)
	const firstLogged = ledger[0]

	return {
		weeks,
		todayWeekIndex,
		todayKey,
		heaviestPlannedTss: Math.max(
			1,
			...weeks.map((week) => week.plannedTss ?? week.doneTss ?? 0),
		),
		loggedFromLabel: firstLogged
			? formatDayMonth(new Date(firstLogged.scheduledAt), timezone)
			: null,
		reachesBackToLabel: formatDayMonth(
			middayOf(reachesBackKey, timezone),
			timezone,
		),
		reachLabel: formatWeeks(Math.round(TIMELINE_TRAILING_DAYS / DAYS_IN_WEEK)),
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
	if (!plan) return today
	// An open-ended plan has no "of 12" to count to; it says which round it is in
	// and that it has no end (#505 story 9, ADR 0079).
	return plan.blockLabel
		? `${today} · ${plan.blockLabel}`
		: `${today} · week ${plan.weekInPlan} of ${plan.totalWeeks}`
}

/**
 * The Mondays the season spans: from the earliest week that has anything in it
 * (or the plan's first week, whichever is earlier) through the latest, always
 * including this one. Empty weeks in the middle are kept — a season with holes
 * in the strip would read as a season with holes in it.
 *
 * **Clamped to the query's reach.** A plan that began a year ago anchors the
 * season a year back, and every week between there and the reach would render
 * as a cell full of `empty` dots over dates nothing was ever fetched for — the
 * strip-axis form of the fabrication ADR 0075 §2 forbids, and the one #500 fixed
 * on the stream axis only. So a week entirely behind the reach is not drawn at
 * all; the **start cap** is what states where the screen stops reading.
 *
 * The exception is the same one `buildWeek` makes for rows: a week the caller
 * actually handed sessions for is kept whatever the reach says, because what the
 * reach bounds is the claim that a day was empty, never a day we were given.
 */
function seasonMondays({
	sessionWeeks,
	nowMonday,
	planStartMonday,
	reachMonday,
}: {
	sessionWeeks: string[]
	nowMonday: string
	planStartMonday: string | null
	/** The Monday of the week the query's earliest day falls in. */
	reachMonday: string
}): string[] {
	const anchors = [...sessionWeeks, nowMonday]
	if (planStartMonday) anchors.push(planStartMonday)
	const first = anchors.reduce((a, b) => (a < b ? a : b))
	const last = anchors.reduce((a, b) => (a > b ? a : b))
	const withSessions = new Set(sessionWeeks)
	const mondays: string[] = []
	for (let monday = first; monday <= last; monday = addDays(monday, 7)) {
		if (monday >= reachMonday || withSessions.has(monday)) mondays.push(monday)
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
	reachesBackKey,
	nowMonday,
	timezone,
	imported,
	planStart,
	phase,
	planStartMonday,
	tracks,
	closed,
}: {
	monday: string
	rows: SessionRow[]
	todayKey: string
	/** The earliest day the query reached — see `TIMELINE_TRAILING_DAYS`. */
	reachesBackKey: string
	nowMonday: string
	timezone: string
	imported: boolean
	planStart: boolean
	phase: { name: string; weekInPhase: number } | null
	planStartMonday: string | null
	tracks: readonly PlanTrackTargets[]
	closed: boolean
}): TimelineWeek {
	const isNow = monday === nowMonday
	const start = dayBoundsUTC(monday, timezone).start
	const end = dayBoundsUTC(addDays(monday, DAYS_IN_WEEK - 1), timezone).start
	const week = { imported, isNow }

	// The week's rows are its **days**, and a day owns its sessions (ADR 0065 §1).
	// Every day from today forward earns a row whether anything is on it or not —
	// that is the grid, and it is what puts a node on today on a rest day. Behind
	// today the days are built as well, back to the day the query reaches and no
	// further: a day the query never asked about is not a day with nothing on it.
	// A session older than that still gets its row — what the reach bounds is the
	// claim that a day was empty, never a day the caller actually handed us.
	// Which of those past days the stream actually *shows* is the bands' business.
	const byDay = bucketByDay(sessionRows, timezone)
	const rows = weekDayKeys(monday)
		.filter((key) => key >= reachesBackKey || byDay.has(key))
		.map((key) =>
			buildDay({
				key,
				rows: byDay.get(key) ?? [],
				week,
				todayKey,
				timezone,
				sameMonth: isNow,
			}),
		)
	const bands = buildBands(rows, todayKey, timezone)
	const volumes = buildWeekVolumes({
		weekKey: monday,
		todayKey,
		planStartWeekKey: planStartMonday,
		tracks,
		closed,
		sessions: sessionRows.map(({ session, entry }) =>
			volumeSessionOf(session, {
				dayKey: localDate(new Date(session.scheduledAt), timezone),
				status: entry.status,
			}),
		),
	})

	// The stats line stays its own tally, deliberately: it is the week's
	// **load** — every session, Annet included, in TSS (ADR 0030) — where the
	// tracks above are **volume** per track in each track's currency and leave
	// Annet out. Training Load is physiological, so a commute the athlete put in
	// Annet still costs what it cost. Both read a Planned TSS of 0 or less as
	// unresolved (`volumeSessionOf` matches the check below).
	let done = 0
	let missed = 0
	let doneTss: number | null = null
	let plannedTss: number | null = null
	for (const { entry } of sessionRows) {
		if (entry.status === 'completed') done += 1
		if (entry.status === 'missed') missed += 1
		// Planned and actual are summed independently (ADR 0030): a week that was
		// planned but never trustworthily recorded still carries its planned load
		// while its actual reads honestly absent.
		if (entry.load != null) doneTss = (doneTss ?? 0) + entry.load
		if (entry.plannedTss != null && entry.plannedTss > 0) {
			plannedTss = (plannedTss ?? 0) + entry.plannedTss
		}
	}
	// One dot per day, read off the day itself rather than off a session's date —
	// the strip and the stream cannot disagree about which days are empty when
	// they are both looking at the same list of days.
	//
	// Which is also why the slots start at `unfetched` and only a **built** day
	// turns one into `empty`: the earliest week of the season is covered by the
	// query for part of the week and not at all for the rest, and seven blanks
	// over the part nobody asked about is a claim the screen may not make
	// (ADR 0075 §2).
	const dayDots: DayDot[] = Array.from(
		{ length: DAYS_IN_WEEK },
		() => 'unfetched',
	)
	for (const day of rows) {
		const slot = weekdayIndex(day.key)
		// The day exists in the model, so the dot may now speak for it.
		dayDots[slot] = 'empty'
		// Today marks itself, session or not: the strip's "you are here" is a fact
		// about the calendar, the same one the stream lands on. Reading it off a
		// session is how the strip lost its today dot on a rest day.
		if (day.isToday) {
			dayDots[slot] = 'today'
			continue
		}
		for (const session of day.sessions) {
			dayDots[slot] = strongerDot(dayDots[slot]!, dotFor(session))
		}
	}

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
		bands,
		tracks: volumes.tracks.map(wordTrackWeek),
		otherTrack: volumes.other
			? {
					...volumes.other,
					label: ANNET_TRACK_LABELS.name,
					note: ANNET_TRACK_LABELS.note,
				}
			: null,
	}
}

/** The words a track's week header carries, put on the model's codes. */
function wordTrackWeek(track: TrackWeekVolume): TimelineTrackWeek {
	return {
		...track,
		plannedUnmeasuredLabel:
			track.plannedUnmeasuredCount > 0
				? unmeasuredCountLabel(track.plannedUnmeasuredCount, track.currency)
				: null,
		actualUnmeasuredLabel:
			track.actualUnmeasuredCount > 0
				? unmeasuredCountLabel(track.actualUnmeasuredCount, track.currency)
				: null,
		partialLabel: track.partial
			? strengthPartialLabel(track.partial.measuredThroughWeekday)
			: null,
		zoneIntentNote: track.zones?.planned ? ZONE_INTENT_NOTE : null,
	}
}

/**
 * The week's runs of consecutive empty days behind today, as bands.
 *
 * Maximal runs, in calendar order, and **two days is the shortest one there
 * is** — a single empty day behind today stays a day, because a band over one
 * row says no more than the row does and asks for a tap to say it.
 *
 * A day the **Plan Outline** prescribes recovery on breaks the run rather than
 * joining it: `Rest day` is a statement the plan made, and `nothing logged`
 * would swallow it. Nothing produces that flag yet (ADR 0065 §4), so today
 * every empty day behind today is band material — but the rule is written where
 * it belongs rather than waiting to be discovered by whoever gives it a
 * producer.
 */
function buildBands(
	days: TimelineDay[],
	todayKey: string,
	timezone: string,
): TimelineBand[] {
	const bands: TimelineBand[] = []
	let run: TimelineDay[] = []
	const close = () => {
		if (run.length > 1) bands.push(bandOf(run, timezone))
		run = []
	}
	for (const day of days) {
		const collapsible =
			day.key < todayKey && day.sessions.length === 0 && !day.restPrescribed
		if (!collapsible) {
			close()
			continue
		}
		// Only *consecutive* days collapse. Inside one week the row order is the
		// calendar's, so the run breaks wherever a day is missing from it — which
		// is what the query's own reach leaves behind in the earliest week.
		if (run.length > 0 && day.key !== addDays(run[run.length - 1]!.key, 1)) {
			close()
		}
		run.push(day)
	}
	close()
	return bands
}

function bandOf(run: TimelineDay[], timezone: string): TimelineBand {
	const first = middayOf(run[0]!.key, timezone)
	const last = middayOf(run[run.length - 1]!.key, timezone)
	const fromMonth = formatMonthShort(first, timezone)
	const toMonth = formatMonthShort(last, timezone)
	return {
		key: run[0]!.key,
		dayKeys: run.map((day) => day.key),
		daysLabel: `${formatDayOfMonth(first, timezone)}–${formatDayOfMonth(last, timezone)}`,
		monthLabel: fromMonth === toMonth ? toMonth : `${fromMonth}–${toMonth}`,
		// The count first, because the count is the fact. `nothing logged` and not
		// `nothing planned`: what the band knows is that no session sits on these
		// dates, which is a statement about the record and not about the plan.
		summaryLabel: `${run.length} days · nothing logged`,
		rangeLabel: formatDateSpan(first, last, timezone),
	}
}

/** The week's seven calendar days, Monday first. */
function weekDayKeys(monday: string): string[] {
	return Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
		addDays(monday, index),
	)
}

/**
 * The week's sessions, bucketed by the day they belong to. The bucket key is the
 * **Athlete Calendar** day (`localDate`), the same boundary the week itself is
 * cut on: a session at 23:30 belongs to the evening the athlete trained it, not
 * to whichever UTC date it happens to carry.
 *
 * A map rather than a sorted list, because the day order now comes from the
 * calendar and not from what happens to be scheduled — which is the whole point
 * of the grid.
 */
function bucketByDay(
	rows: SessionRow[],
	timezone: string,
): Map<string, SessionRow[]> {
	const byDay = new Map<string, SessionRow[]>()
	for (const row of rows) {
		const key = localDate(new Date(row.session.scheduledAt), timezone)
		const bucket = byDay.get(key) ?? []
		bucket.push(row)
		byDay.set(key, bucket)
	}
	return byDay
}

function buildDay({
	key,
	rows,
	week,
	todayKey,
	timezone,
	sameMonth,
}: {
	key: string
	rows: SessionRow[]
	week: RowWeekContext
	todayKey: string
	timezone: string
	/** Inside the current week the month is the header's job, not the row's. */
	sameMonth: boolean
}): TimelineDay {
	const isToday = key === todayKey
	const midday = middayOf(key, timezone)
	return {
		key,
		dayLabel: formatWeekdayShort(midday, timezone),
		// Outside the current week a row states its own month, so a row lifted out
		// of context still reads as a date.
		dateLabel: sameMonth
			? formatDayOfMonth(midday, timezone)
			: formatDayMonth(midday, timezone),
		isToday,
		// The Plan Outline has no per-day recovery statement to read, so this is
		// the only honest answer — see the field's own note. The row's `Rest day`
		// branch exists and waits for a producer rather than being faked from
		// week-granular rhythm or from availability (ADR 0065 §4).
		restPrescribed: false,
		sessions: rows.map((row) => buildSession({ row, week, isToday })),
	}
}

/**
 * An instant inside the local day `key`, for formatting the day's own labels.
 * Local **noon**, not local midnight: midnight is the one wall-clock time a
 * spring-forward day can be missing, and a gutter that reads as the day before
 * once a year is a poor trade for a rounder number.
 */
function middayOf(key: string, timezone: string): Date {
	return localTimeUTC(key, '12:00', timezone)
}

function buildSession({
	row,
	week,
	isToday,
}: {
	row: SessionRow
	week: RowWeekContext
	/** A property of the day, so every session on it agrees about it. */
	isToday: boolean
}): TimelineSession {
	const { session, entry } = row
	const content = buildRowContent(row, week, { isToday })
	const owner = sessionOwner(session)
	return {
		id: session.id,
		to: `/training/sessions/${session.id}`,
		discipline: entry.discipline,
		disciplineLabel: getDisciplineLabel(entry.discipline),
		title: entry.title ?? `${getDisciplineLabel(entry.discipline)} recording`,
		status: entry.status,
		bars: row.bars,
		groups: row.groups,
		externalLoad: content.externalLoad,
		internalLoad: content.internalLoad,
		chips: content.chips,
		owner,
		ownerLabel: entry.status === 'planned' ? SESSION_OWNER_LABELS[owner] : null,
	}
}

function dotFor(session: TimelineSession): DayDot {
	if (session.status === 'missed') return 'missed'
	if (session.status === 'completed') return 'done'
	return 'planned'
}

/**
 * Two sessions can share a day, and the dot has room for one story. The louder
 * one wins: a miss the athlete needs to see outranks a session they completed,
 * and today outranks everything.
 */
const DOT_RANK: Record<DayDot, number> = {
	// Never compared against: a slot is lifted off `unfetched` the moment a day
	// is there to speak for it, and a session cannot arrive on a day that is not.
	unfetched: -1,
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
	const eventDate = activePlan?.eventDate
		? new Date(activePlan.eventDate)
		: null
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
	// An open-ended plan has no race day (ADR 0079), so there is nothing to count.
	if (!activePlan.eventDate) return null
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
