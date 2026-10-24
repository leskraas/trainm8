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
 * A row is a day and a day owns zero or more sessions (ADR 0065 §1), and **every
 * day is in the model** whether anything is on it or not: the grid exists
 * before the content does. Behind today the days are built back as far as the
 * query itself reaches. The stream draws every one of them (ADR 0086): I dag
 * reads like a calendar, so nothing folds — not a run of empty days, not a
 * closed week, not a week past the Planning Horizon. A week only says which
 * of three it is (`WeekShape`), and the stream tones it accordingly.
 *
 * The strip renders the **whole season**; the stream mounts every week up to
 * today and the weeks ahead as the athlete reads toward them. That is why the
 * week list here is complete and unfiltered: mounting is the component's
 * business, and a strip with holes in it is not an overview.
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
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { planArc } from '#app/utils/dashboard.ts'
import {
	formatNbDateSpan,
	formatNbDayDate,
	formatNbDayMonth,
	formatNbDayOfMonth,
	formatNbVolumeFigure,
	formatNbWeekdayShort,
	formatSigned,
	roundLoad,
} from '#app/utils/format.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import {
	ANNET_ACTION_LABELS,
	ANNET_TRACK_LABELS,
	BEFORE_PLAN_LABEL,
	eventCountdownWhen,
	IMPORT_LINK_LABELS,
	nbDurationLabel,
	TOP_LINE_LABELS,
	NB_READINESS_ADVICE,
	NB_READINESS_LABELS,
	NB_SESSION_CTA_LABELS,
	NB_WEEK_ROLE_LABELS,
	nbDisciplineLabel,
	nbPhaseName,
	nbSessionNoun,
	openEndedBlockLabel,
	PHILOSOPHY_LABELS,
	planWeekLabel,
	SESSION_OWNER_LABELS,
	SESSION_OWNER_NOTES,
	sessionVolumeLabel,
	VERDICT_LABELS,
	RELEASE_ACTION_LABELS,
} from '#app/utils/labels.ts'
import {
	reconcileCoach,
	type SustainedDeviation,
} from '#app/utils/load/coach.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import {
	horizonWeekKey,
	lastClosedWeekKey,
} from '#app/utils/load/week-change.ts'
import {
	type VolumeCurrency,
	type WeekRole,
} from '#app/utils/plan-outline/derive.ts'
import { weekIndexOf } from '#app/utils/plan-outline/week-keys.ts'
import {
	buildWeekVolumes,
	type OtherWeekVolume,
	type PlanTrackTargets,
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
	type ProfileBar,
	type ProfileBarGroup,
} from '#app/utils/session-profile.ts'
import {
	TIMELINE_HORIZON_DAYS,
	TIMELINE_TRAILING_DAYS,
} from '#app/utils/timeline-window.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { type LedgerStatus } from '#app/utils/training.ts'
import {
	buildPhaseBands,
	buildPlanContext,
	buildTodayCard,
} from '../presenter.ts'
import {
	buildImportFacts,
	NO_IMPORT_FACTS,
	type TimelineImportFacts,
} from './import-link.ts'
import {
	buildRowContent,
	type RowChip,
	type RowWeekContext,
} from './row-content.ts'
import { strengthLogOf, type TimelineStrengthLog } from './strength-log.ts'
import { buildStrip, type TimelineStrip } from './strip.ts'
import {
	beyondWeekNote,
	join,
	leadTrack,
	relativeWeekName,
	type TimelineTrackWeek,
	weekLoadLine,
	wordTrackWeek,
} from './week-words.ts'

export type { TimelineStrip, TimelineStripWeek } from './strip.ts'
export type { TimelineTrackWeek } from './week-words.ts'
export type { TimelineImportLink } from './import-link.ts'
export type { TimelineStrengthLog } from './strength-log.ts'

/**
 * How far back home's own query reaches — half a year, the bound
 * `getSessionLedger` is called with on this route. It lives with the rest of
 * the window in `timeline-window.ts` (the writing line reads it too) and is
 * re-exported here for the stream.
 *
 * Two things have to agree about it and neither of them is the query: the
 * **start cap** states this
 * bound instead of claiming the athlete's history starts there, and no day
 * behind it is built at all (ADR 0075 §2 and §3). A `fri` row over a date the
 * query never asked about would be a fabrication, and this is the line between
 * "nothing was logged" and "nothing was fetched".
 */
export { TIMELINE_TRAILING_DAYS }

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
	/**
	 * What the ownership glyph explains once, behind it (#505 D6): whose
	 * session this is and what that means. Null wherever `ownerLabel` is.
	 */
	ownerNote: string | null
	/**
	 * The session's own volume in its track's unit — `6,1 km`, `55 min`,
	 * `13 sett` — at the row's right edge (#505 D6). What was done on a done
	 * session, what is asked on a planned one, nothing on a missed one; null
	 * where the session has no number in that unit.
	 */
	volumeLabel: string | null
	/**
	 * The row's Annet action, or null where it would change nothing:
	 * `Tell i Annet` takes a done session out of the track it counts in, and
	 * `Tell i sporet` puts it back (#505 story 33, `setCountsInNoTrack`).
	 */
	annet: { inAnnet: boolean; actionLabel: string } | null
	/**
	 * "Lås opp" on one of the athlete's own planned sessions (#505 story 55):
	 * hand it back so the app may adjust it again (`releaseSession`). Null on
	 * the app's sessions, which are the app's already, and on history.
	 */
	release: { actionLabel: string; note: string } | null
	/**
	 * The quick strength log under a gym day's row (#505 stories 83–84):
	 * _Som planlagt_ in one tap, or _Endre_. Null where `canQuickLogStrength`
	 * says no — a run, a day not begun, a session logged or started.
	 */
	strengthLog: TimelineStrengthLog | null
} & TimelineImportFacts

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
 * season's end and back to `TIMELINE_TRAILING_DAYS` — and every one is a row
 * on I dag (ADR 0086). A day before the query's reach is not built: it is not
 * a day with nothing on it, it is a day nobody asked about (ADR 0075 §3).
 */
export type TimelineDay = {
	/** `YYYY-MM-DD` in the athlete's own timezone — the day's own identity. */
	key: string
	/** `ons` — the weekday, in the athlete's own timezone. */
	dayLabel: string
	/**
	 * `19. aug` outside the current week, `19` inside it — the day as its
	 * controls name it, so a cell lifted out of context still reads as a date.
	 */
	dateLabel: string
	/**
	 * `19` — the date alone, as the gutter prints it under the weekday (variant
	 * P). The week header above already says the month.
	 */
	dayOfMonth: string
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
 * Which of three kinds of week this is (ADR 0086). Every kind is drawn whole —
 * its header and all seven days — and the kind only sets the tone:
 *
 * - `past` — a week before this one: the record, muted, with its verdict.
 * - `open` — this week, and every week ahead that the Planning Horizon has
 *   reached or the plan has already laid.
 * - `beyond` — a week the plan has not laid and will not until the Planning
 *   Horizon reaches it: its header says its phase and target and when it is
 *   filled, its days are empty rows to write in, and the athlete's own
 *   sessions there show on their days (#505 stories 27–28). A **far** week —
 *   past the plan's end and past half a year (`TIMELINE_HORIZON_DAYS`), where
 *   the athlete may still write (#505 story 40) — is `beyond` too, and says
 *   that only what the athlete writes will be there.
 *
 * (Until ADR 0086 a closed week folded to one line and a week past the horizon
 * collapsed to one; the owner's calendar decision of 2026-10-10 ended both.)
 */
export type WeekShape = 'past' | 'open' | 'beyond'

/**
 * Which of the four phase colours (`phase-*` tokens, ADR 0085) a phase is
 * drawn in: a preset's stored name maps to its kind, and a phase the athlete
 * named themselves — `Blokk 4` — has no kind and is drawn neutral rather than
 * guessed at.
 */
export type PhaseTone = 'base' | 'build' | 'peak' | 'taper'

/** A plan week's phase: its display name, where in it the week sits, its colour. */
type WeekPhase = {
	name: string
	weekInPhase: number
	/** The phase's position in the outline — two phases may share a name. */
	index: number
	tone: PhaseTone | null
}

const PHASE_TONES: Record<string, PhaseTone> = {
	base: 'base',
	'big base': 'base',
	grunntrening: 'base',
	'stor base': 'base',
	build: 'build',
	oppbygging: 'build',
	peak: 'peak',
	spissing: 'peak',
	taper: 'taper',
	nedtrapping: 'taper',
}

/** A phase's colour from its stored (or Norwegian) name; null for its own name. */
export function phaseToneOf(name: string): PhaseTone | null {
	return PHASE_TONES[name.trim().toLowerCase()] ?? null
}

/** One training week, on both axes at once. */
export type TimelineWeek = {
	/** The week's Monday as `YYYY-MM-DD` — the Week Replan's own key (ADR 0025). */
	key: string
	/** `28. sep – 4. okt`, `5.–11. okt` — compact enough for one line at 390 px. */
	rangeLabel: string
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
	 * The week's days, earliest first — a row is a day, not a session. All seven
	 * from today forward; behind today, every day the query reached. The stream
	 * draws every one.
	 */
	rows: TimelineDay[]
	/**
	 * The three week numbers per **Training Track** of the active plan — Week
	 * Target, Planned Volume, Actual Volume — each in the track's own Volume
	 * Currency (#505 stories 20–26, 34, 85; `week-volumes.ts`). Empty without a
	 * plan: there is no track to read a week in.
	 */
	tracks: TimelineTrackWeek[]
	/** Annet: sessions that count in nothing (#505 story 33), or null. */
	otherTrack: TimelineOtherTrack | null
	/** `Forrige uke`, `Denne uka`, `Neste uke`, otherwise `Uke 41`. */
	relativeName: string
	/** The plan phase the week sits in, by its own name; null outside a plan. */
	phaseName: string | null
	/**
	 * The phase's colour (`phase-*`), or null outside a plan or for a named
	 * phase. Optional only so a hand-built week in a test may leave it out.
	 */
	phaseTone?: PhaseTone | null
	/** The phase's position in the outline, so the strip can draw its band. */
	phaseIndex?: number | null
	/** The week's role in its phase's rhythm — hard or easy; null outside a plan. */
	role: WeekRole | null
	/** `hard uke`, `lett uke`, `nedtrapping`. */
	roleLabel: string | null
	/**
	 * What kind of week it is, in the header's corner: `Oppbygging · hard uke`, or
	 * `før planen` for history the athlete brought with them. Null with neither.
	 */
	kindLabel: string | null
	shape: WeekShape
	/**
	 * The first `beyond` week of the season: the stream draws the horizon's
	 * divider above it (ADR 0086), once.
	 */
	opensHorizon: boolean
	/**
	 * The week's one muted sentence under its numbers (variant P): its sessions
	 * and load — `2 av 5 gjort · 48 av 312 TSS` — or, past the horizon, when it
	 * is filled (`fylles søndag kveld i uke 39`). Null where the header's
	 * numbers already say it all: a week with no track to read it in carries
	 * its load line as its numbers.
	 */
	summary: string | null
	/**
	 * The week's sessions and load in a line, in the header's Norwegian: `2 av 5
	 * gjort · 48 av 312 TSS`. What a week with no track to read it in says.
	 */
	loadLine: string
}

/** Annet, with its name and what it says about itself. */
export type TimelineOtherTrack = OtherWeekVolume & {
	label: string
	note: string
}

/** The far end of the season, stated rather than left as an empty scroll. */
export type TimelineEndCap = {
	/**
	 * What the season runs to: `none` — no plan, so the list is as long as
	 * what was written; `event` — a plan toward a race; `open-ended` — a plan
	 * with no race and no end (ADR 0079), which is a plan all the same and
	 * never reads as "no plan".
	 */
	plan: 'none' | 'event' | 'open-ended'
	/** `20. sep` — the last day anything is written for. */
	writtenThroughLabel: string
	/**
	 * Plan weeks past that with no sessions in them — to race week, or to the
	 * last week of an open-ended plan's last round; 0 when it is all written.
	 */
	unwrittenWeeks: number
	eventName: string | null
	/** `25. okt` — race day, when there is a plan anchored to one. */
	eventDateLabel: string | null
	/**
	 * `22. mar` — the Sunday an open-ended plan's last round ends on, where
	 * the next round takes over; null for any other plan.
	 */
	planEndLabel: string | null
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
	 * and because every day is a row there is always one carrying it — on a
	 * rest day too. That is what lets the landing and the I dag pill
	 * work with no fallback and no special case anywhere (ADR 0065 §1, ADR 0082
	 * §4 and §6).
	 */
	todayKey: string
	/** `7. jul` — the first day anything is logged for, inside the reach below. */
	loggedFromLabel: string | null
	/** `22. feb` — the earliest day home's own query reaches. */
	reachesBackToLabel: string
	/** How many weeks of the athlete's history that reach is. */
	reachWeeks: number
	/** `ons 19. aug · uke 3 av 12` — the header's one line of orientation. */
	headerLabel: string
	endCap: TimelineEndCap
	/**
	 * The last week the Planning Horizon reaches — `horizonWeekKey` of the last
	 * closed week. Null without a plan, which has nothing to fill a week from.
	 */
	horizonWeekKey: string | null
	/**
	 * The track the strip and the season table are read in (`leadTrack`) — one
	 * decision, made once, for both. Null without a plan.
	 */
	leadTrackId: string | null
	strip: TimelineStrip
	/** What I dag's top line says about the plan (ADR 0086). */
	topLine: TimelineTopLine
}

/**
 * I dag's top line, about the plan (#505 owner decision 3, ADR 0086): which
 * plan, and what it is counting towards.
 */
export type TimelineTopLine = {
	/**
	 * `Klassisk 3:1 · uke 9 av 10` — the plan's philosophy, or the current
	 * phase's name for a plan that records none, and where in a plan toward a
	 * race today falls. Null with no plan.
	 */
	planLabel: string | null
	/**
	 * `Halvmaraton om 12 uker` toward a race, `Blokk 3 av ∞` for an open-ended
	 * plan (#505 story 9). Null with no plan, where the line says so instead.
	 */
	goalLabel: string | null
	/**
	 * The goal in its two halves, for a line that may cut the race's name but
	 * never its countdown: `Halvmaraton` and `om 12 uker`; for an
	 * open-ended plan no name and `Blokk 3 av ∞`.
	 */
	goal: { name: string | null; when: string } | null
}

const DAYS_IN_WEEK = 7

export function buildTimelineSeason({
	ledger,
	now = new Date(),
	timezone = 'UTC',
	activePlan = null,
	importConnected = false,
	thresholds = {},
}: {
	ledger: LedgerSession[]
	now?: Date
	timezone?: string
	activePlan?: ActivePlan | null
	/**
	 * Whether an import source is connected (intervals.icu, Strava), so a done
	 * session with no numbers may say they are on their way (#505 story 82).
	 */
	importConnected?: boolean
	/** What a planned row's pace, watts and heart rate resolve against (#616). */
	thresholds?: DisciplineThresholdMap
}): TimelineSeason {
	const todayKey = localDate(now, timezone)
	const nowMonday = weekMonday(now, timezone)
	// The earliest day this screen knows anything about. Behind it the query
	// asked nothing, so nothing behind it is built and no row speaks for it.
	const reachesBackKey = addDays(todayKey, -TIMELINE_TRAILING_DAYS)
	// The ledger's own row builder decides what a row *is* (status, load, band,
	// profile bars), so the stream and the Session Ledger can never disagree
	// about a session. Its `now` divider is dropped here: the week headers and
	// today's own row already say where the boundary is, twice over.
	const ledgerRows = buildLedgerRows(ledger, now, timezone, thresholds).filter(
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
	// The plan's last week, so the season runs to the end of the plan and its
	// whole shape is there to read, written or not (#505 story 27).
	const planWeeks = activePlan
		? activePlan.phases.reduce((sum, phase) => sum + phase.weeks, 0)
		: 0
	const planEndMonday =
		planStartMonday != null && planWeeks > 0
			? addDays(planStartMonday, 7 * (planWeeks - 1))
			: null
	// Past this Monday a week is far: past the plan's end and past the half
	// year the stream draws in full (`TIMELINE_HORIZON_DAYS`).
	const halfYearMonday = weekMonday(
		middayOf(addDays(todayKey, TIMELINE_HORIZON_DAYS), timezone),
		timezone,
	)
	const farAfter =
		planEndMonday != null && planEndMonday > halfYearMonday
			? planEndMonday
			: halfYearMonday
	const mondays = seasonMondays({
		sessionWeeks: [...byWeek.keys()],
		nowMonday,
		planStartMonday,
		planEndMonday,
		// The week the reach lands in is the earliest one the strip may draw:
		// behind it there is nothing to draw a cell *about*.
		reachMonday: weekMonday(middayOf(reachesBackKey, timezone), timezone),
	})
	const phases = phaseLookup(activePlan, now, timezone)
	const tracks = activePlan?.tracks ?? []
	const leadTrackId = leadTrack(tracks)?.trackId ?? null
	// What each row says about imports (#505 stories 78–82): read across the
	// whole ledger, because a question reads its day and Koble igjen reads a
	// session that may sit anywhere on I dag.
	const importFacts = buildImportFacts(ledgerRows, {
		timezone,
		todayKey,
		importConnected,
		trackDisciplines: new Set(tracks.map((t) => t.discipline)),
	})
	// The week the Week Replan has closed (Sunday 20:00 local): on Sunday
	// evening this week grades through Sunday, as Ukeskiftet reads it.
	const closedThrough = lastClosedWeekKey(now, timezone)
	// The last week the week change has filled, or will by the next close
	// (`horizonWeekKey`). Only a plan fills weeks, so only a plan has one.
	const horizon = activePlan ? horizonWeekKey(closedThrough) : null

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
			role: planRole(activePlan, planStartMonday, monday),
			planStartMonday,
			tracks,
			closed: monday <= closedThrough,
			horizon,
			far: monday > farAfter,
			fillsWeeks: activePlan?.fillsWeeks ?? false,
			importFacts,
			thresholds,
		}),
	)

	const firstBeyond = weeks.find((week) => week.shape === 'beyond')
	if (firstBeyond) firstBeyond.opensHorizon = true
	const todayWeekIndex = Math.max(
		0,
		weeks.findIndex((week) => week.isNow),
	)
	const firstLogged = ledger[0]

	return {
		weeks,
		todayWeekIndex,
		todayKey,
		loggedFromLabel: firstLogged
			? formatNbDayMonth(new Date(firstLogged.scheduledAt), timezone)
			: null,
		reachesBackToLabel: formatNbDayMonth(
			middayOf(reachesBackKey, timezone),
			timezone,
		),
		reachWeeks: Math.round(TIMELINE_TRAILING_DAYS / DAYS_IN_WEEK),
		headerLabel: headerLabel(activePlan, now, timezone),
		endCap: buildEndCap({
			ledger,
			activePlan,
			timezone,
			mondays,
			planEndMonday,
			lastWrittenMonday: [...byWeek.keys(), nowMonday].reduce((a, b) =>
				a > b ? a : b,
			),
		}),
		horizonWeekKey: horizon,
		leadTrackId,
		strip: buildStrip(weeks, leadTrackId, {
			horizonWeekKey: horizon,
			eventWeekKey: activePlan?.eventDate
				? weekMonday(new Date(activePlan.eventDate), timezone)
				: null,
			eventName: activePlan?.eventName ?? null,
		}),
		topLine: buildTopLine(activePlan, now),
	}
}

/**
 * The plan half of the top line. The philosophy names the plan where it has
 * one; otherwise the phase it is in now does, which is the same name the week
 * header carries. The goal is the race and how far away it is, or the round
 * of an open-ended plan — never an invented end date (ADR 0079).
 */
export function buildTopLine(
	activePlan: ActivePlan | null,
	now: Date,
): TimelineTopLine {
	if (!activePlan) return { planLabel: null, goalLabel: null, goal: null }
	const eventDate = activePlan.eventDate ? new Date(activePlan.eventDate) : null
	const arc =
		activePlan.phases.length > 0
			? planArc(
					activePlan.phases,
					new Date(activePlan.planStart),
					eventDate,
					now,
				)
			: null
	const name = activePlan.family
		? PHILOSOPHY_LABELS[activePlan.family]
		: arc
			? nbPhaseName(arc.phase)
			: null
	// Toward a race the plan has a length to count in (`uke 9 av 10`); an
	// open-ended plan's position is its block, which the goal half says.
	const position =
		eventDate && arc ? planWeekLabel(arc.weekInPlan, arc.totalWeeks) : null
	const planLabel = [name, position].filter(Boolean).join(' · ') || null
	const goal = eventDate
		? {
				name: activePlan.eventName ?? TOP_LINE_LABELS.raceDay,
				when: eventCountdownWhen(
					Math.ceil(
						(eventDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
					),
				),
			}
		: activePlan.round != null
			? { name: null, when: capitalise(openEndedBlockLabel(activePlan.round)) }
			: null
	const goalLabel = goal
		? [goal.name, goal.when].filter(Boolean).join(' ')
		: null
	return { planLabel, goalLabel, goal }
}

function capitalise(text: string): string {
	return text ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text
}

/**
 * A plan week's role in its phase's rhythm (`weekRole`, read on the server),
 * or null for a week outside the plan — before it, after it, or with no plan.
 */
function planRole(
	activePlan: ActivePlan | null,
	planStartMonday: string | null,
	monday: string,
): WeekRole | null {
	if (!activePlan || planStartMonday == null) return null
	return activePlan.weekRoles[weekIndexOf(planStartMonday, monday)] ?? null
}

/**
 * `ons 19. aug · uke 3 av 12` — today's date, and where in the plan it falls.
 * The plan half is dropped rather than faked when there is no plan: "uke 3 av
 * 12" with nothing to count against is a claim, not a label.
 */
function headerLabel(
	activePlan: ActivePlan | null,
	now: Date,
	timezone: string,
): string {
	const today = formatNbDayDate(now, timezone)
	// Weekly Plan Adherence is not needed for the arc position, so the ratio it
	// would carry is deliberately not fetched for this one label.
	const plan = buildPlanContext(activePlan, null, now)
	if (!plan) return today
	// An open-ended plan has no "of 12" to count to; it says which round it is in
	// and that it has no end (#505 story 9, ADR 0079).
	return plan.blockLabel
		? `${today} · ${plan.blockLabel}`
		: `${today} · ${planWeekLabel(plan.weekInPlan, plan.totalWeeks)}`
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
	planEndMonday,
	reachMonday,
}: {
	sessionWeeks: string[]
	nowMonday: string
	planStartMonday: string | null
	/** The plan's last week: the season runs at least this far. */
	planEndMonday: string | null
	/** The Monday of the week the query's earliest day falls in. */
	reachMonday: string
}): string[] {
	const anchors = [...sessionWeeks, nowMonday]
	if (planStartMonday) anchors.push(planStartMonday)
	if (planEndMonday) anchors.push(planEndMonday)
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
 * the third week of Oppbygging is counted by position and never by name,
 * because a season with two A-races runs Base twice (ADR 0044 §2).
 *
 * The name is the display name (`nbPhaseName`): a preset's stored `Build`
 * reads `Oppbygging` on I dag (ADR 0081), and a phase the athlete named
 * themselves — `Blokk 4` — reads as they wrote it. The stored key is untouched.
 */
function phaseLookup(
	activePlan: ActivePlan | null,
	now: Date,
	timezone: string,
): Map<string, WeekPhase> {
	const lookup = new Map<string, WeekPhase>()
	for (const [index, band] of buildPhaseBands(activePlan, now).entries()) {
		let monday = weekMonday(band.start, timezone)
		const endMonday = weekMonday(new Date(band.end.getTime() - 1), timezone)
		let weekInPhase = 1
		while (monday <= endMonday) {
			lookup.set(monday, {
				name: nbPhaseName(band.name),
				weekInPhase,
				index,
				tone: phaseToneOf(band.name),
			})
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
	role,
	planStartMonday,
	tracks,
	closed,
	horizon,
	far,
	fillsWeeks,
	importFacts,
	thresholds,
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
	phase: WeekPhase | null
	role: WeekRole | null
	planStartMonday: string | null
	tracks: readonly PlanTrackTargets[]
	closed: boolean
	/** The last week the Planning Horizon reaches; null without a plan. */
	horizon: string | null
	/** Past the plan's end and the half year the stream draws in full. */
	far: boolean
	/** Whether the week change will fill a week once the horizon reaches it. */
	fillsWeeks: boolean
	importFacts: ReadonlyMap<string, TimelineImportFacts>
	thresholds: DisciplineThresholdMap
}): TimelineWeek {
	const isNow = monday === nowMonday
	const start = dayBoundsUTC(monday, timezone).start
	const end = dayBoundsUTC(addDays(monday, DAYS_IN_WEEK - 1), timezone).start
	const week = { imported, isNow }

	// The week's rows are its **days**, and a day owns its sessions (ADR 0065 §1).
	// Every day from today forward is built whether anything is on it or not —
	// that is the grid, and it is what puts a node on today on a rest day. Behind
	// today the days are built as well, back to the day the query reaches and no
	// further: a day the query never asked about is not a day with nothing on it.
	// A session older than that still gets its row — what the reach bounds is the
	// claim that a day was empty, never a day the caller actually handed us.
	// The stream shows every one of them (ADR 0086).
	const byDay = bucketByDay(sessionRows, timezone)
	const trackDisciplines = new Set<string>(tracks.map((t) => t.discipline))
	// The unit a session's own volume is said in: its track's, where the plan
	// has one for its sport (the first, as the week header reads it).
	const trackCurrencies = new Map<string, VolumeCurrency>()
	for (const track of tracks) {
		if (!trackCurrencies.has(track.discipline)) {
			trackCurrencies.set(track.discipline, track.currency)
		}
	}
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
				trackDisciplines,
				trackCurrencies,
				importFacts,
				thresholds,
			}),
		)
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
	// Whether some of the done load came from a session with no Planned TSS —
	// one the athlete added, a lifting session (ADR 0046 §2), an import. Then
	// the done sum is not a part of the planned one, and `176 av 85 TSS` would
	// read as a week done twice over when it was a week done differently.
	let unplannedLoad = false
	for (const { entry } of sessionRows) {
		if (entry.status === 'completed') done += 1
		if (entry.status === 'missed') missed += 1
		// Planned and actual are summed independently (ADR 0030): a week that was
		// planned but never trustworthily recorded still carries its planned load
		// while its actual reads honestly absent.
		const planned = entry.plannedTss != null && entry.plannedTss > 0
		if (entry.load != null) {
			doneTss = (doneTss ?? 0) + entry.load
			if (!planned) unplannedLoad = true
		}
		if (planned) plannedTss = (plannedTss ?? 0) + entry.plannedTss!
	}
	const relativeName = relativeWeekName(monday, nowMonday)
	const trackWeeks = volumes.tracks.map((track) =>
		wordTrackWeek(track, {
			ahead: monday > nowMonday,
			hasSessions: sessionRows.length > 0,
		}),
	)
	const loadLine = weekLoadLine({
		imported,
		past: monday < nowMonday,
		isNow,
		total: sessionRows.length,
		done,
		missed,
		doneTss: doneTss != null ? roundLoad(doneTss) : null,
		plannedTss: plannedTss != null ? roundLoad(plannedTss) : null,
		unplannedLoad,
	})
	// A week the plan has laid is written, whatever the horizon says: only a
	// week nothing but the athlete has written in is still the plan's to fill.
	const laid = sessionRows.some(
		({ session }) => sessionOwner(session) === 'machine',
	)
	const shape: WeekShape =
		monday < nowMonday
			? 'past'
			: !laid && ((horizon != null && monday > horizon && phase != null) || far)
				? 'beyond'
				: 'open'
	const phaseName = imported ? null : (phase?.name ?? null)
	const roleLabel = imported || role == null ? null : NB_WEEK_ROLE_LABELS[role]
	// A taper phase's taper week would read `Nedtrapping · nedtrapping`: the
	// role says nothing the phase's name has not, so it is said once.
	const kindRole =
		roleLabel != null &&
		phaseName != null &&
		roleLabel.toLowerCase() === phaseName.toLowerCase()
			? null
			: roleLabel

	return {
		key: monday,
		rangeLabel: formatNbDateSpan(start, end, timezone),
		plannedTss: plannedTss != null ? roundLoad(plannedTss) : null,
		doneTss: doneTss != null ? roundLoad(doneTss) : null,
		imported,
		planStart,
		isNow,
		rows,
		tracks: trackWeeks,
		otherTrack: volumes.other
			? {
					...volumes.other,
					label: ANNET_TRACK_LABELS.name,
					note: ANNET_TRACK_LABELS.note,
				}
			: null,
		relativeName,
		phaseName,
		phaseTone: imported ? null : (phase?.tone ?? null),
		phaseIndex: imported ? null : (phase?.index ?? null),
		role: imported ? null : role,
		roleLabel,
		kindLabel: imported ? BEFORE_PLAN_LABEL : join(phaseName, kindRole) || null,
		shape,
		// Set across the season once every week is built (`buildTimelineSeason`).
		opensHorizon: false,
		summary:
			shape === 'beyond'
				? beyondWeekNote({
						monday,
						fillsWeeks: fillsWeeks && phase != null,
						far: phase == null,
					})
				: trackWeeks.length > 0
					? loadLine
					: null,
		loadLine,
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
	trackDisciplines,
	trackCurrencies,
	importFacts,
	thresholds,
}: {
	key: string
	rows: SessionRow[]
	week: RowWeekContext
	todayKey: string
	timezone: string
	/** Inside the current week the month is the header's job, not the row's. */
	sameMonth: boolean
	/** The plan's tracks' sports: what a session can count in, or be taken out of. */
	trackDisciplines: ReadonlySet<string>
	trackCurrencies: ReadonlyMap<string, VolumeCurrency>
	importFacts: ReadonlyMap<string, TimelineImportFacts>
	thresholds: DisciplineThresholdMap
}): TimelineDay {
	const isToday = key === todayKey
	const midday = middayOf(key, timezone)
	return {
		key,
		dayLabel: formatNbWeekdayShort(midday, timezone),
		// Outside the current week a row states its own month, so a row lifted out
		// of context still reads as a date.
		dateLabel: sameMonth
			? formatNbDayOfMonth(midday, timezone)
			: formatNbDayMonth(midday, timezone),
		dayOfMonth: formatNbDayOfMonth(midday, timezone),
		isToday,
		// The Plan Outline has no per-day recovery statement to read, so this is
		// the only honest answer — see the field's own note. The row's `Rest day`
		// branch exists and waits for a producer rather than being faked from
		// week-granular rhythm or from availability (ADR 0065 §4).
		restPrescribed: false,
		sessions: rows.map((row) =>
			buildSession({
				row,
				week,
				isToday,
				dayKey: key,
				trackDisciplines,
				trackCurrencies,
				imports: importFacts.get(row.session.id) ?? NO_IMPORT_FACTS,
				strengthLog: strengthLogOf(row, { timezone, todayKey }),
				thresholds,
			}),
		),
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
	dayKey,
	trackDisciplines,
	trackCurrencies,
	imports,
	strengthLog,
	thresholds,
}: {
	row: SessionRow
	week: RowWeekContext
	/** A property of the day, so every session on it agrees about it. */
	isToday: boolean
	dayKey: string
	trackDisciplines: ReadonlySet<string>
	trackCurrencies: ReadonlyMap<string, VolumeCurrency>
	imports: TimelineImportFacts
	strengthLog: TimelineStrengthLog | null
	thresholds: DisciplineThresholdMap
}): TimelineSession {
	const { session, entry } = row
	const content = buildRowContent(row, week, { isToday, thresholds })
	const owner = sessionOwner(session)
	return {
		id: session.id,
		to: `/training/sessions/${session.id}`,
		discipline: entry.discipline,
		disciplineLabel: nbDisciplineLabel(entry.discipline),
		title:
			(imports.extraLabel ? ekstraTitle(session) : null) ??
			entry.title ??
			nbSessionNoun(entry.discipline),
		status: entry.status,
		bars: row.bars,
		groups: row.groups,
		externalLoad: content.externalLoad,
		internalLoad: content.internalLoad,
		chips: content.chips,
		owner,
		ownerLabel: entry.status === 'planned' ? SESSION_OWNER_LABELS[owner] : null,
		ownerNote: entry.status === 'planned' ? SESSION_OWNER_NOTES[owner] : null,
		volumeLabel: sessionVolume(
			session,
			entry.status,
			entry.discipline,
			dayKey,
			trackCurrencies,
		),
		annet: annetOf(
			session.countsInNoTrack,
			entry.status,
			entry.discipline,
			trackDisciplines,
		),
		release:
			entry.status === 'planned' && owner === 'athlete'
				? {
						actionLabel: RELEASE_ACTION_LABELS.action,
						note: RELEASE_ACTION_LABELS.note,
					}
				: null,
		...imports,
		strengthLog,
	}
}

/**
 * An ekstra's name, when nothing named it (audit PR D): the ledger names a
 * structureless recording in English (`57 min 12 s run`, `deriveRecordingTitle`,
 * which the Workout Detail View shares), so I dag names its own rows the
 * Norwegian way — the sport, then the minutes or the kilometres:
 * `Løping · 57 min`. A Workout's title, where an import carries one, stands.
 */
function ekstraTitle(session: LedgerSession): string | null {
	const recording = session.recording
	if (!recording || session.workout?.title) return null
	const minutes =
		recording.durationSec != null
			? Math.round(recording.durationSec / 60)
			: null
	const quantity =
		minutes != null && minutes > 0
			? nbDurationLabel(minutes * 60)
			: recording.distanceM != null && recording.distanceM > 0
				? `${formatNbVolumeFigure(recording.distanceM / 1000, 'km')} km`
				: null
	return IMPORT_LINK_LABELS.extraTitle(
		nbDisciplineLabel(recording.discipline),
		quantity,
	)
}

/**
 * A session's own volume, as its row's right edge says it (#505 D6): in its
 * track's unit where the plan has a track for its sport, else in sets for a
 * lift and in km — or minutes, where no distance is known — for anything
 * else. Read through `volumeSessionOf`, the week header's own reading, so a
 * row and its week cannot disagree about what the session is worth.
 *
 * A done session says what was **recorded**, never what was asked: a run done
 * with no distance yet says nothing rather than claiming the plan's 10 km. A
 * missed session says nothing — nothing was done.
 */
function sessionVolume(
	session: LedgerSession,
	status: LedgerStatus,
	discipline: string,
	dayKey: string,
	currencies: ReadonlyMap<string, VolumeCurrency>,
): string | null {
	if (status === 'missed') return null
	const read = volumeSessionOf(session, { dayKey, status })
	const figures = status === 'completed' ? read.recorded : read.prescribed
	if (!figures) return null
	const currency =
		currencies.get(discipline) ??
		(discipline === 'strength' ? 'sets' : figures.km != null ? 'km' : 'hours')
	const value = figures[currency]
	return value != null && value > 0 ? sessionVolumeLabel(value, currency) : null
}

/**
 * Whether the row offers to move the session in or out of Annet (#505 story
 * 33), and which way. Only where the tap changes a number: a done session in a
 * sport the plan has a track for, or one the athlete already put in Annet. A
 * planned session is not offered it — the bike ride to work is a thing that
 * happened — and a session in a sport with no track is in Annet anyway.
 */
function annetOf(
	countsInNoTrack: boolean,
	status: LedgerStatus,
	discipline: string,
	trackDisciplines: ReadonlySet<string>,
): TimelineSession['annet'] {
	if (countsInNoTrack) {
		return { inAnnet: true, actionLabel: ANNET_ACTION_LABELS.toTrack }
	}
	if (status === 'completed' && trackDisciplines.has(discipline)) {
		return { inAnnet: false, actionLabel: ANNET_ACTION_LABELS.toAnnet }
	}
	return null
}

/**
 * The far end of the stream. The plan is written through some date and sketched
 * past it, and saying which is which is the whole point of the cap: an athlete
 * who scrolls into empty weeks should be told the weeks are unwritten, not left
 * wondering whether the app lost them.
 *
 * An **open-ended** plan (ADR 0079) is a plan: it has no race to count to, so
 * its unwritten weeks are counted to the end of its last round — where the next
 * round is proposed and appended — and the cap says the plan has no end rather
 * than that there is no plan.
 */
function buildEndCap({
	ledger,
	activePlan,
	timezone,
	mondays,
	planEndMonday,
	lastWrittenMonday,
}: {
	ledger: LedgerSession[]
	activePlan: ActivePlan | null
	timezone: string
	mondays: string[]
	/** The plan's last week (the last round's, for an open-ended plan). */
	planEndMonday: string | null
	/**
	 * The last week anything is written in (or this week). The season itself
	 * runs on to the plan's end, so its last Monday is no longer the last one
	 * written — the unwritten weeks are counted from this one.
	 */
	lastWrittenMonday: string
}): TimelineEndCap {
	const last = ledger[ledger.length - 1]
	const lastMonday = mondays[mondays.length - 1]!
	const eventDate = activePlan?.eventDate
		? new Date(activePlan.eventDate)
		: null
	const plan: TimelineEndCap['plan'] = !activePlan
		? 'none'
		: eventDate
			? 'event'
			: 'open-ended'
	// The Monday of the last week the plan asks for: race week, or the
	// open-ended plan's last round. Counted from Mondays so a race mid-week
	// counts its own week as unwritten.
	const endMonday = eventDate
		? weekMonday(eventDate, timezone)
		: plan === 'open-ended'
			? planEndMonday
			: null
	const unwrittenWeeks =
		endMonday != null
			? Math.max(
					0,
					Math.round(
						(new Date(`${endMonday}T00:00:00.000Z`).getTime() -
							new Date(`${lastWrittenMonday}T00:00:00.000Z`).getTime()) /
							(7 * 24 * 60 * 60 * 1000),
					),
				)
			: 0
	return {
		plan,
		writtenThroughLabel: last
			? formatNbDayMonth(new Date(last.scheduledAt), timezone)
			: formatNbDayMonth(
					dayBoundsUTC(addDays(lastMonday, DAYS_IN_WEEK - 1), timezone).start,
					timezone,
				),
		unwrittenWeeks,
		eventName: activePlan?.eventName ?? null,
		eventDateLabel: eventDate ? formatNbDayMonth(eventDate, timezone) : null,
		planEndLabel:
			plan === 'open-ended' && planEndMonday != null
				? formatNbDayMonth(
						dayBoundsUTC(addDays(planEndMonday, DAYS_IN_WEEK - 1), timezone)
							.start,
						timezone,
					)
				: null,
	}
}

// ---------------------------------------------------------------------------
// Today's row — the session's action, and the one sentence about today
// ---------------------------------------------------------------------------

/**
 * What today's row carries beyond its sessions (ADR 0086), now that there is
 * no hero to carry it: the one honest action on today's own session (`Se
 * økta`, `Logg økta`), and the coach's one line.
 *
 * Built off `buildTodayCard`, as the hero was, so the action names the same
 * session the Session Nudge and the old decision strip did. That card answers
 * "what is the next thing to do", which on a rest day — or once today's
 * session is logged — is a session days away; its action belongs on *that*
 * session's row, not on today's, so the action is offered only when the
 * session it opens is today's (#493's rule, kept).
 */
export type TimelineTodayRow = {
	/** Today's session's action; null when the next session is not today's. */
	cta: { label: string; to: string; sessionId: string } | null
	/** The one sentence: Form, its reading, and what to do about it. */
	verdict: string
}

export function buildTodayRow({
	ledger,
	now = new Date(),
	timezone = 'UTC',
	thresholds = {},
	current,
	trust,
	sustained = null,
	nudge,
}: {
	ledger: LedgerSession[]
	now?: Date
	timezone?: string
	thresholds?: DisciplineThresholdMap
	current: LoadTriad | null
	trust: TsbTrust
	sustained?: SustainedDeviation | null
	nudge?: SessionNudge
}): TimelineTodayRow {
	const today = buildTodayCard(ledger, now, thresholds, timezone)
	return {
		cta:
			today && today.isToday
				? {
						label: NB_SESSION_CTA_LABELS[today.cta],
						to: today.ctaTo,
						sessionId: today.id,
					}
				: null,
		verdict: coachVerdict({ current, trust, sustained, nudge }),
	}
}

/**
 * The coach's one line, with the Coach card's honesty rules kept verbatim: a
 * cold start never shows a Form number (ADR 0008/0010), Form and sustained
 * adherence reconcile into a single voice (#120) rather than talking over each
 * other, and a Session Nudge's reason replaces the generic recommendation when
 * the coach actually did something to the next session (#157/#158/#187).
 */
export function coachVerdict({
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
	const readiness = coldStart ? null : readinessFromTsb(tsb)
	const coach = reconcileCoach(readiness, sustained)
	// What the coach did to the next session, said from the decision's own
	// fields rather than from its English reason sentence (ADR 0081).
	const action =
		nudge?.outcome === 'eased'
			? VERDICT_LABELS.eased(
					nudge.target.durationMin != null
						? `${nudge.target.durationMin} min`
						: null,
				)
			: null
	// The adherence voice, when sustained deviation leads the reconciliation.
	const adherence =
		coach?.source === 'adherence' && sustained
			? sustained.tone === 'over'
				? VERDICT_LABELS.sustainedOver(sustained.weeks)
				: VERDICT_LABELS.sustainedUnder(sustained.weeks)
			: null
	if (coldStart) {
		if (action) return `${action[0]!.toUpperCase()}${action.slice(1)}.`
		return (
			adherence ??
			VERDICT_LABELS.coldStart(trust.daysOfHistory, trust.requiredDays)
		)
	}
	const tone = readiness!.tone
	const reading = VERDICT_LABELS.form(
		formatSigned(tsb),
		NB_READINESS_LABELS[tone],
	)
	return `${reading} — ${action ?? adherence ?? NB_READINESS_ADVICE[tone]}`
}
