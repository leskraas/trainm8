import { invariant } from '@epic-web/invariant'
import { describe, expect, test } from 'vitest'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import {
	type WeekChangeData,
	type WeekChangeProposal,
} from '#app/utils/load/week-change-card.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { buildTimelineHero, buildTimelineSeason } from './presenter.ts'
import {
	buildWeekChangeCard,
	easedLine,
	roundVolumeLine,
} from './week-change.ts'

const DAY = 24 * 60 * 60 * 1000
// Wednesday 20 February 2030, at local noon. A midweek anchor is what makes the
// Monday-first week bucketing worth testing: a Sunday or a Monday would hide an
// off-by-one.
const NOW = new Date('2030-02-20T12:00:00')
// The Monday and Sunday of that week, in UTC (the tests run with timezone 'UTC').
const THIS_MONDAY = '2030-02-18'
const LAST_MONDAY = '2030-02-11'

type Workout = NonNullable<LedgerSession['workout']>
type WorkoutStep = Workout['blocks'][number]['steps'][number]

function step(overrides: Partial<WorkoutStep> = {}): WorkoutStep {
	return {
		id: 'step-1',
		kind: 'cardio',
		notes: null,
		discipline: 'run',
		intensity: null,
		intensityHrMin: null,
		intensityHrMax: null,
		intensityPowerMin: null,
		intensityPowerMax: null,
		intensityPaceMin: null,
		intensityPaceMax: null,
		orderIndex: 0,
		durationSec: 3000,
		distanceM: null,
		verticalM: null,
		gradePct: null,
		cadenceRpmMin: null,
		cadenceRpmMax: null,
		rest: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
		...overrides,
	}
}

function workout(overrides: Partial<Workout> = {}): Workout {
	return {
		id: 'workout-1',
		title: 'Easy run',
		description: null,
		discipline: 'run',
		intent: 'endurance',
		archetype: null,
		blocks: [
			{
				id: 'block-1',
				name: 'Main',
				orderIndex: 0,
				repeatCount: 1,
				seriesRepeatCount: 1,
				betweenSeriesRestSec: null,
				sendOff: null,
				steps: [step()],
			},
		],
		...overrides,
	}
}

function session(overrides: Partial<LedgerSession> = {}): LedgerSession {
	return {
		id: 'session-1',
		scheduledAt: NOW,
		status: 'completed',
		source: 'authored',
		adoptedAt: null,
		releasedAt: null,
		countsInNoTrack: false,
		tssValue: 50,
		plannedTssValue: 50,
		plannedTssConfidence: 'full',
		replanReason: null,
		workout: workout(),
		recording: {
			id: 'recording-1',
			discipline: 'run',
			durationSec: 3000,
			distanceM: 9200,
			startedAt: NOW,
			endedAt: NOW,
			phaseBarsJson: null,
			linkAnsweredAt: null,
			unlinkedFromSessionId: null,
		},
		sessionLog: null,
		setLogs: [],
		...overrides,
	}
}

/** A session at a fixed offset in days from `NOW`, keeping local noon. */
function on(
	days: number,
	overrides: Partial<LedgerSession> = {},
): LedgerSession {
	return session({
		id: `session-${days}`,
		scheduledAt: new Date(NOW.getTime() + days * DAY),
		...overrides,
	})
}

/** A 12-week plan that began 4 weeks ago, so weeks before it read as imported. */
function plan(overrides: Partial<ActivePlan> = {}): ActivePlan {
	return {
		eventId: 'event-1',
		eventName: 'Spring Half',
		eventDate: new Date(NOW.getTime() + 8 * 7 * DAY),
		planStart: new Date(NOW.getTime() - 4 * 7 * DAY),
		phases: [
			{ name: 'Base', weeks: 4 },
			{ name: 'Build', weeks: 6 },
			{ name: 'Taper', weeks: 2 },
		],
		weeklyTss: Array<number>(12).fill(300),
		round: null,
		tracks: [],
		// Base and Build at 3:1, then the taper — the rhythm `weekRole` reads.
		weekRoles: [
			...(['loading', 'loading', 'loading', 'recovery'] as const),
			...(['loading', 'loading', 'loading', 'recovery'] as const),
			...(['loading', 'loading'] as const),
			...(['taper', 'taper'] as const),
		],
		fillsWeeks: true,
		loadBasis: {
			tracks: [
				{
					discipline: 'run',
					currency: 'km',
					contributes: true,
					marker: 'derived',
				},
			],
			conventions: ['minutes-in-zone-per-session'],
			formulae: ['rTSS'],
			substitutions: [],
		},
		...overrides,
	}
}

function season(ledger: LedgerSession[], activePlan: ActivePlan | null = null) {
	return buildTimelineSeason({ ledger, now: NOW, timezone: 'UTC', activePlan })
}

/** `YYYY-MM-DD`, `days` later. */
function nextDay(key: string, days: number): string {
	const date = new Date(`${key}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

/**
 * The days of a week that actually carry a session. Forward of today every day
 * is a row (ADR 0065 §1), so "which days have something on them" is a question
 * about the sessions rather than about the row count.
 */
function withSessions(week: {
	rows: Array<{ key: string; sessions: unknown[] }>
}) {
	return week.rows
		.filter((day) => day.sessions.length > 0)
		.map((day) => day.key)
}

// ---------------------------------------------------------------------------
// The season's weeks
// ---------------------------------------------------------------------------

describe('the season is every week, with no holes', () => {
	test('a week is keyed by its Monday, whatever day the session fell on', () => {
		const result = season([on(0)])
		expect(result.weeks.map((week) => week.key)).toEqual([THIS_MONDAY])
	})

	test('sessions land in the week that contains them', () => {
		const result = season([on(-7), on(0)])
		expect(result.weeks.map((week) => week.key)).toEqual([
			LAST_MONDAY,
			THIS_MONDAY,
		])
		expect(withSessions(result.weeks[0]!)).toEqual(['2030-02-13'])
		expect(withSessions(result.weeks[1]!)).toEqual(['2030-02-20'])
	})

	test('an empty week between two full ones is still rendered', () => {
		// The strip is an overview, and an overview with holes in it is not one.
		const result = season([on(-14), on(0)])
		expect(result.weeks).toHaveLength(3)
		// Seven days behind today with nothing on any of them: one band, and no
		// rows of its own until the athlete opens it (#500).
		expect(withSessions(result.weeks[1]!)).toEqual([])
		expect(result.weeks[1]?.rows).toHaveLength(7)
		expect(result.weeks[1]?.bands.map((band) => band.summaryLabel)).toEqual([
			'7 dager · ingenting logget',
		])
	})

	test('this week always exists, even with nothing in it', () => {
		const result = season([on(-21)])
		expect(result.weeks[result.weeks.length - 1]?.key).toBe(THIS_MONDAY)
		expect(result.weeks[result.weeks.length - 1]?.isNow).toBe(true)
	})

	test('an athlete with no sessions at all still gets this week', () => {
		const result = season([])
		expect(result.weeks).toHaveLength(1)
		expect(result.weeks[0]?.isNow).toBe(true)
		expect(result.todayWeekIndex).toBe(0)
	})

	test('the plan can start before anything was logged', () => {
		const result = season([on(0)], plan())
		expect(result.weeks[0]?.key).toBe('2030-01-21')
		// …and runs to its last week, written or not (#505 story 27).
		expect(result.weeks).toHaveLength(12)
	})

	test('rows inside a week are chronological, whatever order they arrive in', () => {
		const result = season([on(2), on(-2), on(0)])
		const thisWeek = result.weeks.find((week) => week.isNow)!
		// The order is the calendar's, not the ledger's — and forward of today it
		// is the calendar even where the ledger has nothing to say.
		expect(thisWeek.rows.map((row) => row.dayLabel)).toEqual([
			'man',
			'tir',
			'ons',
			'tor',
			'fre',
			'lør',
			'søn',
		])
		expect(withSessions(thisWeek)).toEqual([
			'2030-02-18',
			'2030-02-20',
			'2030-02-22',
		])
	})

	test("today's week is found by index, and the window grows from there", () => {
		expect(season([on(-7), on(0)]).todayWeekIndex).toBe(1)
		// Nothing on today does not move it: the index is a fact about the
		// calendar, which is what the old session-keyed anchor was not.
		expect(season([on(-7), on(2)]).todayWeekIndex).toBe(1)
	})
})

// ---------------------------------------------------------------------------
// The stream's rows are days (ADR 0065 §1)
// ---------------------------------------------------------------------------

describe('a row is a day, and a day owns its sessions', () => {
	test('a day names itself, and the session on it hangs off that name', () => {
		const day = season([on(0)]).weeks[0]!.rows.find((row) => row.isToday)!
		expect(day.key).toBe('2030-02-20')
		expect(day.dayLabel).toBe('ons')
		expect(day.isToday).toBe(true)
		expect(day.sessions.map((session) => session.id)).toEqual(['session-0'])
	})

	test('two sessions on one day are one day with two sessions', () => {
		// A morning run and an evening lift belong to one date, not to two rows
		// that happen to share one — which is what lets the gutter be said once.
		const result = season([
			on(0, { id: 'morning', scheduledAt: new Date('2030-02-20T06:30:00') }),
			on(0, { id: 'evening', scheduledAt: new Date('2030-02-20T18:00:00') }),
		])
		const thisWeek = result.weeks.find((week) => week.isNow)!
		expect(withSessions(thisWeek)).toEqual(['2030-02-20'])
		const today = thisWeek.rows.find((day) => day.isToday)!
		expect(today.sessions.map((session) => session.id)).toEqual([
			'morning',
			'evening',
		])
	})

	test('a day holding two sessions still counts as two in the week header', () => {
		// The rollup counts sessions; only the rows collapsed onto one date.
		const result = season([on(-7, { id: 'a' }), on(-7, { id: 'b' })])
		expect(withSessions(result.weeks[0]!)).toHaveLength(1)
		expect(result.weeks[0]?.loadLine).toBe('2 av 2 gjort · 100 av 100 TSS')
	})

	test('days come out in calendar order, whatever order they arrive in', () => {
		const result = season([on(2), on(-2), on(0)])
		const thisWeek = result.weeks.find((week) => week.isNow)!
		expect(thisWeek.rows.map((day) => day.key)).toEqual([
			'2030-02-18',
			'2030-02-19',
			'2030-02-20',
			'2030-02-21',
			'2030-02-22',
			'2030-02-23',
			'2030-02-24',
		])
	})

	test("a day boundary is the athlete's, not UTC's", () => {
		// 23:30Z on the Wednesday is already Thursday in Oslo, and the row has to
		// be the one the athlete will actually train on.
		const ledger = [
			on(0, { id: 'late', scheduledAt: new Date('2030-02-20T23:30:00Z') }),
		]
		const utc = buildTimelineSeason({ ledger, now: NOW, timezone: 'UTC' })
		const oslo = buildTimelineSeason({
			ledger,
			now: NOW,
			timezone: 'Europe/Oslo',
		})
		const holding = (result: ReturnType<typeof buildTimelineSeason>) =>
			result.weeks[0]?.rows.find((day) =>
				day.sessions.some((session) => session.id === 'late'),
			)
		expect(holding(utc)?.key).toBe('2030-02-20')
		expect(holding(utc)?.dayLabel).toBe('ons')
		expect(holding(utc)?.isToday).toBe(true)
		expect(holding(oslo)?.key).toBe('2030-02-21')
		expect(holding(oslo)?.dayLabel).toBe('tor')
		expect(holding(oslo)?.isToday).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// Every day from today forward is a row (ADR 0065 §1, #497)
// ---------------------------------------------------------------------------

describe('from today forward, every day is a row', () => {
	test('the rest of this week renders even with nothing written in it', () => {
		// NOW is Wednesday: today plus Thursday through Sunday are all rows of the
		// model. Monday and Tuesday are behind today, so they are the week's past
		// band; Thursday to Sunday are free, so they fold into one short row
		// (#505 story 30). Today stays a row of its own whatever it holds.
		const thisWeek = season([]).weeks.find((week) => week.isNow)!
		expect(thisWeek.rows.map((day) => day.key)).toEqual([
			'2030-02-18',
			'2030-02-19',
			'2030-02-20',
			'2030-02-21',
			'2030-02-22',
			'2030-02-23',
			'2030-02-24',
		])
		const banded = new Set(thisWeek.bands.flatMap((band) => band.dayKeys))
		expect(
			thisWeek.rows.map((day) => day.key).filter((key) => !banded.has(key)),
		).toEqual(['2030-02-20'])
		expect(thisWeek.rows.every((day) => day.sessions.length === 0)).toBe(true)
	})

	test('a week wholly ahead of today is seven rows, session or not', () => {
		const result = season([on(9)])
		const next = result.weeks[result.weeks.length - 1]!
		expect(next.key).toBe('2030-02-25')
		expect(next.rows).toHaveLength(7)
		expect(withSessions(next)).toEqual(['2030-03-01'])
	})

	test('every day from today to the forward horizon has a row', () => {
		// The horizon is the season's far end — the last week the strip carries,
		// which is the date the End Cap names. Nothing between today and it may be
		// missing, or the grid has a hole in it.
		const result = season([on(0), on(20)], plan())
		const days = new Set(
			result.weeks.flatMap((week) => week.rows).map((day) => day.key),
		)
		const horizon = nextDay(result.weeks[result.weeks.length - 1]!.key, 6)
		// The plan's last week, now that the season runs to the end of the plan.
		expect(horizon).toBe('2030-04-14')
		for (let key = result.todayKey; key <= horizon; key = nextDay(key, 1)) {
			expect(days).toContain(key)
		}
	})

	test('today is a row on a day with nothing on it at all', () => {
		// The whole point: with a row on today the landing, the hero's collapse
		// threshold and the back-to-today pill need no fallback (ADR 0065 §1).
		const result = season([on(-1), on(2)])
		const today = result.weeks[result.todayWeekIndex]?.rows.find(
			(day) => day.key === result.todayKey,
		)
		expect(today).toBeDefined()
		expect(today?.isToday).toBe(true)
		expect(today?.sessions).toEqual([])
	})

	test('an empty day still names itself, so the gutter reads as a date', () => {
		const saturday = season([]).weeks[0]!.rows.find(
			(day) => day.key === '2030-02-23',
		)!
		expect(saturday.dayLabel).toBe('lør')
		expect(saturday.dateLabel).toBe('23')
	})

	test('an empty day outside the current week states its month too', () => {
		const next = season([on(9)]).weeks[1]!.rows[0]!
		expect(next.key).toBe('2030-02-25')
		expect(next.dateLabel).toBe('25. feb')
	})

	test('no empty day claims to be a rest day — nothing prescribes one', () => {
		// `Rest day` is written only where the Plan Outline prescribes recovery,
		// and nothing in the model does: `rhythm` is week-granular and
		// `trainableWeekdays` is availability. So the honest answer on every empty
		// day, plan or no plan, is no label at all (ADR 0065 §4).
		for (const result of [season([]), season([on(0)], plan())]) {
			const empty = result.weeks
				.flatMap((week) => week.rows)
				.filter((day) => day.sessions.length === 0)
			expect(empty.length).toBeGreaterThan(0)
			expect(empty.every((day) => day.restPrescribed === false)).toBe(true)
		}
	})
})

// ---------------------------------------------------------------------------
// Behind today, runs of empty days collapse into one band (ADR 0065 §3, #500)
// ---------------------------------------------------------------------------

describe('behind today, a run of empty days is one band', () => {
	/** Every band behind today, first day first. */
	function bands(result: ReturnType<typeof season>) {
		return result.weeks
			.flatMap((week) => week.bands)
			.filter((band) => band.kind === 'past')
	}

	test('a run states the count and the dates it stands for', () => {
		// Tuesday the 12th through Sunday the 17th: six days with nothing on any
		// of them, between a session on the Monday and this week.
		const result = season([on(-9), on(0)])
		expect(bands(result).map((band) => band.summaryLabel)).toEqual([
			'6 dager · ingenting logget',
			'2 dager · ingenting logget',
		])
		const [lastWeek] = bands(result)
		expect(lastWeek?.key).toBe('2030-02-12')
		expect(lastWeek?.daysLabel).toBe('12–17')
		expect(lastWeek?.monthLabel).toBe('feb')
		expect(lastWeek?.rangeLabel).toBe('12.–17. feb')
	})

	test('the days it covers are still rows, so it has something to expand into', () => {
		const band = bands(season([on(-9), on(0)]))[0]!
		expect(band.dayKeys).toEqual([
			'2030-02-12',
			'2030-02-13',
			'2030-02-14',
			'2030-02-15',
			'2030-02-16',
			'2030-02-17',
		])
		const rows = new Set(
			season([on(-9), on(0)])
				.weeks.flatMap((week) => week.rows)
				.map((day) => day.key),
		)
		for (const key of band.dayKeys) expect(rows).toContain(key)
	})

	test('a single empty day behind today is a day, not a one-day band', () => {
		// Monday has a session and Wednesday is today, so Tuesday is a run of one.
		// A band over one row says no more than the row does, and asks for a tap
		// to say it.
		const result = season([on(-2), on(0)])
		const thisWeek = result.weeks.find((week) => week.isNow)!
		expect(thisWeek.bands.filter((band) => band.kind === 'past')).toEqual([])
		expect(thisWeek.rows.map((day) => day.key)).toContain('2030-02-19')
	})

	test('a day with a session on it breaks the run', () => {
		// Monday empty, Tuesday trained, Wednesday and Thursday empty, then today:
		// two runs of two, never one run of five with a session inside it.
		const result = season([on(-6), on(0)])
		const lastWeek = result.weeks[0]!
		expect(lastWeek.bands.map((band) => band.dayKeys)).toEqual([
			['2030-02-11', '2030-02-12', '2030-02-13'],
			['2030-02-15', '2030-02-16', '2030-02-17'],
		])
	})

	test('forward of today only free days fold, and today itself never does', () => {
		// Ahead of today a run of free days is a short row of its own kind
		// (#505 story 30); the past band's `nothing logged` never speaks there.
		const result = season([on(-1), on(0)], plan())
		const all = result.weeks.flatMap((week) => week.bands)
		for (const band of all) {
			expect(band.dayKeys).not.toContain(result.todayKey)
			expect(band.kind).toBe(
				band.dayKeys[0]! < result.todayKey ? 'past' : 'free',
			)
		}
		expect(
			bands(result)
				.flatMap((band) => band.dayKeys)
				.every((key) => key < result.todayKey),
		).toBe(true)
	})

	test('a run stops at the week boundary, because a week block is what mounts', () => {
		// Sixteen empty days back would be one run on the calendar. The stream
		// mounts, windows and anchors on *weeks*, so a band that spanned two of
		// them would have to live in a week that is not loaded.
		const result = season([on(-17), on(0)])
		const runs = bands(result)
		expect(runs.length).toBeGreaterThan(1)
		for (const band of runs) {
			expect(band.dayKeys.length).toBeLessThanOrEqual(7)
			const week = result.weeks.find((w) => w.bands.includes(band))!
			expect(band.dayKeys.every((key) => key >= week.key)).toBe(true)
			expect(band.dayKeys.every((key) => key <= nextDay(week.key, 6))).toBe(
				true,
			)
		}
	})

	test('a run crossing a month names both months', () => {
		// Thirty-one days back is January; the run that ends this week starts in
		// one month and finishes in the next.
		const crossing = bands(season([on(-31), on(0)])).find((band) =>
			band.monthLabel.includes('–'),
		)
		expect(crossing?.monthLabel).toBe('jan–feb')
		expect(crossing?.rangeLabel).toContain(' – ')
	})

	test("nothing behind the query's own reach is built, or spoken for", () => {
		// The band claims a day was empty. Half a year back the query stopped
		// asking, and "nothing was fetched" is not "nothing was logged" (#500).
		const result = season([on(-190), on(0)])
		const days = result.weeks.flatMap((week) => week.rows).map((day) => day.key)
		const reach = nextDay(result.todayKey, -182)
		expect(days.filter((key) => key < reach)).toEqual(['2029-08-14'])
		expect(
			bands(result)
				.flatMap((band) => band.dayKeys)
				.some((key) => key < reach),
		).toBe(false)
	})

	test('a session older than the reach still gets its row', () => {
		// What the reach bounds is the claim that a day was empty — never a day
		// the caller actually handed us.
		const result = season([on(-190), on(0)])
		const day = result.weeks[0]!.rows.find((row) => row.sessions.length > 0)
		expect(day?.key).toBe('2029-08-14')
	})
})

describe("the near end states the query's reach, not the end of a history", () => {
	test('it names the day the reach starts, and how long a reach that is', () => {
		const result = season([on(-9), on(0)])
		expect(result.reachesBackToLabel).toBe('22. aug')
		expect(result.reachWeeks).toBe(26)
	})

	test('the earliest logged day is still named — as what it is', () => {
		// A fact about the reach, not about the athlete: the first session *in the
		// window*. The cap says which it is; the presenter only has to hand over
		// both dates rather than one dressed as the other.
		const result = season([on(-9), on(0)])
		expect(result.loggedFromLabel).toBe('11. feb')
		expect(season([]).loggedFromLabel).toBeNull()
		expect(season([]).reachesBackToLabel).toBe('22. aug')
	})
})

describe('the strip never speaks for a day the query did not fetch', () => {
	// The stream-axis half of this is #500's bands (ADR 0075 §2); this is the
	// strip axis, which was missed. A week cell entirely behind the reach used to
	// render seven `empty` dots and a `Nothing written` header — above the start
	// cap saying the screen only reads back to that date (#497 AC 6).
	const OLD_PLAN = plan({ planStart: new Date(NOW.getTime() - 300 * DAY) })
	// 182 days behind NOW is Wednesday 22 August 2029; its week opens on the
	// Monday before.
	const REACH_MONDAY = '2029-08-20'

	test('a week entirely behind the reach is not a cell at all', () => {
		const result = season([on(0)], OLD_PLAN)
		expect(result.weeks[0]?.key).toBe(REACH_MONDAY)
		expect(result.weeks.some((week) => week.key < REACH_MONDAY)).toBe(false)
	})

	test('the week the reach lands in builds only the days that were fetched', () => {
		// Monday and Tuesday are behind the reach: nothing was fetched for them,
		// so they are not days of the model at all, and no band or bar can claim
		// they were blank (#497 AC 6).
		const result = season([on(-179)], OLD_PLAN)
		const reachWeek = result.weeks[0]!
		const built = new Set(reachWeek.rows.map((row) => row.key))
		expect([...built]).toEqual([
			'2029-08-22',
			'2029-08-23',
			'2029-08-24',
			'2029-08-25',
			'2029-08-26',
		])
		for (const band of reachWeek.bands) {
			for (const key of band.dayKeys) expect(built).toContain(key)
		}
	})

	test('a session behind the reach still gets its week, however old it is', () => {
		// The reach bounds the claim that a day was empty, never a day the caller
		// actually handed us — the same exception `buildWeek` makes for rows, so
		// nothing the query returned can be dropped off the screen entirely.
		const result = season([on(-200)])
		expect(result.weeks[0]?.key).toBe('2029-07-30')
		expect(result.weeks[0]?.rows.map((day) => day.key)).toEqual(['2029-08-04'])
	})
})

describe('the landing anchor is a day, not a session', () => {
	test('it names today even when nothing at all is scheduled on today', () => {
		// The anchor the stream lands on is now a fact about the calendar, so a
		// rest day cannot take it away (ADR 0065 §1).
		expect(season([on(-1), on(2)]).todayKey).toBe('2030-02-20')
		expect(season([]).todayKey).toBe('2030-02-20')
	})

	test("it is the key of today's own row in today's week", () => {
		const result = season([on(-7), on(0)])
		const anchored = result.weeks[result.todayWeekIndex]?.rows.find(
			(day) => day.key === result.todayKey,
		)
		expect(anchored?.isToday).toBe(true)
		expect(anchored?.sessions.map((session) => session.id)).toEqual([
			'session-0',
		])
	})

	test('the anchor is one day even when today holds two sessions', () => {
		const result = season([
			on(0, { id: 'morning', scheduledAt: new Date('2030-02-20T06:30:00') }),
			on(0, { id: 'evening', scheduledAt: new Date('2030-02-20T18:00:00') }),
		])
		expect(
			result.weeks[result.todayWeekIndex]?.rows.filter((day) => day.isToday),
		).toHaveLength(1)
	})
})

// ---------------------------------------------------------------------------
// Imported weeks and the plan-start line
// ---------------------------------------------------------------------------

describe('weeks before the plan are imported history', () => {
	test('a week before the plan started is imported', () => {
		const result = season([on(-35), on(0)], plan())
		expect(result.weeks[0]?.imported).toBe(true)
		expect(result.weeks[0]?.kindLabel).toBe('før planen')
	})

	test("the plan's own first week carries the line, once", () => {
		const result = season([on(-35), on(0)], plan())
		const marked = result.weeks.filter((week) => week.planStart)
		expect(marked).toHaveLength(1)
		expect(marked[0]?.key).toBe('2030-01-21')
	})

	test('with no plan, nothing is imported — there was never a plan to predate', () => {
		const result = season([on(-35), on(0)])
		expect(result.weeks.every((week) => !week.imported)).toBe(true)
		expect(result.weeks.every((week) => !week.planStart)).toBe(true)
	})

	test('a phase is numbered by position within itself', () => {
		const result = season([on(0)], plan())
		// The plan began 4 weeks ago with a 4-week Base, so this week is Build's
		// first — a hard week in its 3:1.
		expect(result.weeks.find((week) => week.isNow)?.kindLabel).toBe(
			'Build · hard uke',
		)
	})

	test('the strip names a week the way its header does', () => {
		const result = season([on(-35), on(0)], plan())
		const now = result.strip.weeks.find((week) => week.isNow)!
		expect(now.label).toMatch(/^Denne uka, 18\.–24\. feb, Build · hard uke, /)
		expect(result.strip.weeks[0]?.label).toContain('før planen')
	})
})

// ---------------------------------------------------------------------------
// Week labels and rollups
// ---------------------------------------------------------------------------

describe('what a week header says', () => {
	test('the range names the month once when both ends share it', () => {
		const result = season([on(0)])
		expect(result.weeks[0]?.rangeLabel).toBe('18.–24. feb')
	})

	test('a week crossing a month names both', () => {
		const result = season([on(7)])
		const week = result.weeks[result.weeks.length - 1]!
		expect(week.rangeLabel).toBe('25. feb – 3. mar')
	})

	test('a past week counts what was done against what was there', () => {
		const result = season([
			on(-7, { id: 'a' }),
			on(-6, { id: 'b', status: 'missed', tssValue: null }),
		])
		expect(result.weeks[0]?.loadLine).toBe(
			'1 av 2 gjort · 1 ikke gjort · 50 av 100 TSS',
		)
	})

	test('an imported week counts sessions, since there was nothing to count against', () => {
		const result = season([on(-35), on(0)], plan())
		expect(result.weeks[0]?.loadLine).toBe('1 økt · 50 TSS')
	})

	test('a future week counts what is asked for', () => {
		const result = season([
			on(0),
			on(9, { status: 'scheduled', tssValue: null }),
			on(10, { id: 'later', status: 'scheduled', tssValue: null }),
		])
		const future = result.weeks[result.weeks.length - 1]!
		expect(future.loadLine).toBe('2 økter planlagt · 100 TSS')
	})

	test('an empty week says so rather than showing a zero', () => {
		const result = season([on(-14), on(0)])
		expect(result.weeks[1]?.loadLine).toBe('Ingenting logget')
	})

	test('planned and actual are summed independently, never zero-filled', () => {
		const result = season([
			on(-7, { id: 'a', tssValue: 60, plannedTssValue: null }),
			on(-6, { id: 'b', tssValue: null, plannedTssValue: 40 }),
		])
		expect(result.weeks[0]?.doneTss).toBe(60)
		expect(result.weeks[0]?.plannedTss).toBe(40)
	})

	test('a week with nothing recorded reads its actual as absent, not as zero', () => {
		const result = season([
			on(6, { status: 'scheduled', tssValue: null, plannedTssValue: 42 }),
		])
		const week = result.weeks[result.weeks.length - 1]!
		expect(week.doneTss).toBeNull()
		expect(week.plannedTss).toBe(42)
	})
})

// ---------------------------------------------------------------------------
// The caps at both ends
// ---------------------------------------------------------------------------

describe('both ends of the season are stated', () => {
	test('the near end names the day the history starts', () => {
		const result = season([on(-35), on(0)], plan())
		expect(result.loggedFromLabel).toBe('16. jan')
	})

	test('an athlete with no history has no date to name', () => {
		expect(season([]).loggedFromLabel).toBeNull()
	})

	test('the far end names the day the plan is written through', () => {
		const result = season([on(0), on(20)], plan())
		expect(result.endCap.writtenThroughLabel).toBe('12. mar')
	})

	test('the weeks between the last written one and race day are counted', () => {
		// Race day is 8 weeks out (week of 15 Apr); the last session is 20 days out
		// (week of 11 Mar). Five whole weeks sit between the two Mondays.
		const result = season([on(0), on(20)], plan())
		expect(result.endCap.unwrittenWeeks).toBe(5)
		expect(result.endCap.eventName).toBe('Spring Half')
		expect(result.endCap.eventDateLabel).toBe('17. apr')
	})

	test('a plan written all the way to race week has nothing left to write', () => {
		const result = season([on(0), on(8 * 7)], plan())
		expect(result.endCap.unwrittenWeeks).toBe(0)
	})

	test('with no plan there is no race day and nothing unwritten', () => {
		const result = season([on(0)])
		expect(result.endCap.unwrittenWeeks).toBe(0)
		expect(result.endCap.eventDateLabel).toBeNull()
	})
})

describe('the header label', () => {
	test('it names today and where in the plan today falls', () => {
		expect(season([on(0)], plan()).headerLabel).toBe(
			'ons 20. feb · uke 5 av 12',
		)
	})

	test('with no plan it says only what it knows', () => {
		expect(season([on(0)]).headerLabel).toBe('ons 20. feb')
	})

	test('an open-ended plan says which round today is in, and that it has no end', () => {
		// The round is counted on the server, in the Athlete Timezone (#505 story 9).
		const openEnded = plan({
			eventId: null,
			eventName: null,
			eventDate: null,
			phases: [
				{ name: 'Blokk 1', weeks: 4 },
				{ name: 'Blokk 2', weeks: 4 },
			],
			round: 2,
		})
		expect(season([on(0)], openEnded).headerLabel).toBe(
			'ons 20. feb · blokk 2 av ∞',
		)
	})
})

describe('an open-ended plan never invents a race day (ADR 0079)', () => {
	const openEnded = plan({
		eventId: null,
		eventName: null,
		eventDate: null,
		round: 1,
	})

	test('the end cap names no race and counts no unwritten weeks to one', () => {
		const result = season([on(0)], openEnded)
		expect(result.endCap).toMatchObject({
			eventName: null,
			eventDateLabel: null,
			unwrittenWeeks: 0,
		})
	})
})

// ---------------------------------------------------------------------------
// The hero
// ---------------------------------------------------------------------------

const TRUSTED: TsbTrust = {
	trustworthy: true,
	daysOfHistory: 60,
	requiredDays: 42,
}
const COLD: TsbTrust = {
	trustworthy: false,
	daysOfHistory: 9,
	requiredDays: 42,
}
const NO_NUDGE: SessionNudge = { outcome: 'none', reason: '' } as SessionNudge

function hero({
	ledger,
	trust = TRUSTED,
	current = { ctl: 60, atl: 56, tsb: 4 },
	activePlan = plan(),
	sustained = null,
	nudge = NO_NUDGE,
}: {
	ledger: LedgerSession[]
	trust?: TsbTrust
	current?: { ctl: number; atl: number; tsb: number } | null
	activePlan?: ActivePlan | null
	sustained?: SustainedDeviation | null
	nudge?: SessionNudge
}) {
	return buildTimelineHero({
		ledger,
		now: NOW,
		timezone: 'UTC',
		thresholds: {},
		activePlan,
		current,
		trust,
		sustained,
		nudge,
	})
}

describe("the hero is today's session and the verdict on it", () => {
	const planned = on(0, {
		status: 'scheduled',
		scheduledAt: new Date('2030-02-20T18:00:00'),
		tssValue: null,
		plannedTssValue: 91,
		workout: workout({ title: 'Threshold 4 × 8 min' }),
	})

	test('with nothing ahead there is no hero at all', () => {
		expect(hero({ ledger: [on(-1)] })).toBeNull()
	})

	test('the kicker says when, which discipline, and how far to race day', () => {
		expect(hero({ ledger: [planned] })?.kicker).toBe(
			'I dag · Løping · 8 uker til løpsdagen',
		)
	})

	test('the countdown drops to days inside the last week', () => {
		const soon = plan({ eventDate: new Date(NOW.getTime() + 3 * DAY) })
		expect(hero({ ledger: [planned], activePlan: soon })?.kicker).toBe(
			'I dag · Løping · 3 dager til løpsdagen',
		)
	})

	test('with no plan the kicker says only what it knows', () => {
		expect(hero({ ledger: [planned], activePlan: null })?.kicker).toBe(
			'I dag · Løping',
		)
	})

	test('an open-ended plan has no countdown in the kicker', () => {
		const openEnded = plan({
			eventId: null,
			eventName: null,
			eventDate: null,
			round: 1,
		})
		expect(hero({ ledger: [planned], activePlan: openEnded })?.kicker).toBe(
			'I dag · Løping',
		)
	})

	test('a session later this week is named by its weekday, not called today', () => {
		const later = on(2, { status: 'scheduled', tssValue: null })
		expect(hero({ ledger: [later] })?.kicker).toMatch(/^Fredag · Løping/)
	})

	test("tomorrow's session is called tomorrow", () => {
		const later = on(1, { status: 'scheduled', tssValue: null })
		expect(hero({ ledger: [later] })?.kicker).toMatch(/^I morgen · Løping/)
	})

	test('past the coming week a weekday would be ambiguous, so the date is used', () => {
		const later = on(8, { status: 'scheduled', tssValue: null })
		expect(hero({ ledger: [later] })?.kicker).toMatch(/^28\. feb · Løping/)
	})

	test('the facts are the ones that resolved', () => {
		expect(hero({ ledger: [planned] })?.facts).toEqual(['50 min', '91 TSS'])
	})

	test('the verdict states Form, its reading, and what to do about it', () => {
		const verdict = hero({ ledger: [planned] })?.verdict
		expect(verdict).toMatch(/^Form \+4, /)
		expect(verdict).toContain(' — ')
	})

	test('a cold start never shows a Form number', () => {
		const verdict = hero({ ledger: [planned], trust: COLD })?.verdict
		expect(verdict).toBe('Formen kan leses etter 42 dager — dag 9/42.')
		expect(verdict).not.toMatch(/Form [+-]/)
	})

	test('no TSB at all is a cold start too, however long the history', () => {
		const verdict = hero({ ledger: [planned], current: null })?.verdict
		expect(verdict).not.toMatch(/Form [+-]/)
	})

	test("the collapsed header carries the title and the day's shape", () => {
		expect(hero({ ledger: [planned] })?.collapsed).toEqual({
			title: 'Threshold 4 × 8 min',
			summary: 'I dag · 50 min · 91 TSS',
		})
	})

	test('the CTA label and destination both come from the presenter', () => {
		const cta = hero({ ledger: [planned] })?.cta
		expect(cta?.to).toContain('/training/sessions/')
		expect(cta?.label.length).toBeGreaterThan(0)
	})
})

describe('the hero stays honest about today (#493)', () => {
	// The three days the hero has to tell apart, each with the same session
	// waiting on Friday so only today differs between them.
	const friday = on(2, {
		id: 'friday',
		status: 'scheduled',
		tssValue: null,
		plannedTssValue: 55,
		workout: workout({ title: 'Threshold 4 × 8 min' }),
	})
	const todayToCome = on(0, {
		id: 'today',
		status: 'scheduled',
		scheduledAt: new Date('2030-02-20T18:00:00'),
		tssValue: null,
		plannedTssValue: 91,
		workout: workout({ title: 'Tempo 3 × 10 min' }),
	})
	const todayCompleted = on(0, {
		id: 'today',
		status: 'completed',
		scheduledAt: new Date('2030-02-20T06:00:00'),
		tssValue: 88,
		plannedTssValue: 91,
		workout: workout({ title: 'Tempo 3 × 10 min' }),
	})

	test('today still to come: the kicker says today and the heading is the session', () => {
		const result = hero({ ledger: [todayToCome, friday] })
		expect(result?.kicker).toMatch(/^I dag · Løping/)
		expect(result?.title).toBe('Tempo 3 × 10 min')
		expect(result?.next).toBeNull()
	})

	test('today empty: the heading says so and Friday is a fact, not the headline', () => {
		const result = hero({ ledger: [friday] })
		expect(result?.title).toBe('Ingenting i dag')
		expect(result?.next).toBe('Neste · Threshold 4 × 8 min')
		expect(result?.kicker).not.toMatch(/Today/)
		expect(result?.kicker).toMatch(/^Fredag · Løping/)
	})

	test("today completed: the hero never headlines a future session as today's", () => {
		const result = hero({ ledger: [todayCompleted, friday] })
		expect(result?.title).toBe('I dag er gjort')
		expect(result?.next).toBe('Neste · Threshold 4 × 8 min')
		expect(result?.kicker).toMatch(/^Fredag · Løping/)
	})

	test('today missed says that, rather than claiming today was empty', () => {
		const missed = on(0, {
			id: 'today',
			status: 'scheduled',
			scheduledAt: new Date('2030-02-20T06:00:00'),
			tssValue: null,
			plannedTssValue: 91,
		})
		expect(hero({ ledger: [missed, friday] })?.title).toBe(
			'Ingenting igjen i dag',
		)
	})

	test('the collapsed summary names the day too, so it cannot imply today', () => {
		expect(hero({ ledger: [friday] })?.collapsed.summary).toMatch(/^Fredag · /)
	})

	test('the hero and the stream row agree on which day the session is', () => {
		const ledger = [todayCompleted, friday]
		const result = hero({ ledger })
		const days = season(ledger).weeks.flatMap((week) => week.rows)
		// A stream row is a day rather than a session since #495, and `dayLabel`
		// and `isToday` moved with it — so the row this is checked against is the
		// day carrying the session, not the session itself.
		const day = days.find((candidate) =>
			candidate.sessions.some((session) => session.id === 'friday'),
		)
		// The kicker's first word is the row's own weekday, and neither of them
		// calls it today.
		expect(result?.kicker.split(' · ')[0]).toBe('Fredag')
		expect(day?.dayLabel).toBe('fre')
		expect(day?.isToday).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// A lifting row and the week header read the same number (#491)
// ---------------------------------------------------------------------------

describe('every planned session says whose it is (#505 story 29)', () => {
	/** The planned session `id`, as the stream will render it. */
	function planned(overrides: Partial<LedgerSession>) {
		const result = season([
			on(2, {
				id: 'ahead',
				status: 'scheduled',
				tssValue: null,
				recording: null,
				...overrides,
			}),
		])
		return result.weeks
			.flatMap((week) => week.rows)
			.flatMap((day) => day.sessions)
			.find((row) => row.id === 'ahead')!
	}

	test('a session the athlete wrote is theirs', () => {
		expect(planned({ source: 'authored' })).toMatchObject({
			owner: 'athlete',
			ownerLabel: 'din økt',
		})
	})

	test('a session the plan laid is the app’s', () => {
		expect(planned({ source: 'generated' })).toMatchObject({
			owner: 'machine',
			ownerLabel: 'appens økt',
		})
	})

	test('a plan session the athlete edited is theirs now', () => {
		expect(
			planned({ source: 'generated', adoptedAt: new Date('2030-02-19') }),
		).toMatchObject({ owner: 'athlete', ownerLabel: 'din økt' })
	})

	test('a done or missed session is history, and carries no mark', () => {
		// Nothing changes a session that already happened, so whose it is no
		// longer tells the athlete anything.
		const result = season([
			on(-1, { id: 'done', source: 'generated' }),
			on(-2, {
				id: 'missed',
				source: 'authored',
				status: 'scheduled',
				tssValue: null,
				recording: null,
			}),
		])
		const rows = result.weeks
			.flatMap((week) => week.rows)
			.flatMap((day) => day.sessions)
		expect(rows.find((row) => row.id === 'done')).toMatchObject({
			owner: 'machine',
			ownerLabel: null,
		})
		expect(rows.find((row) => row.id === 'missed')).toMatchObject({
			status: 'missed',
			owner: 'athlete',
			ownerLabel: null,
		})
	})
})

describe('a lifting row reconciles with the week header it sits under', () => {
	/** A completed lifting session with `logged` working sets and an sRPE figure. */
	function lifting(days: number, tssValue: number | null) {
		return on(days, {
			id: `lift-${days}`,
			tssValue,
			// A lifting session has no Planned TSS by decision (ADR 0046 §2), which
			// is why the week's planned side must not move when one is added.
			plannedTssValue: null,
			plannedTssConfidence: null,
			recording: null,
			workout: workout({ discipline: 'strength', title: 'Workout A' }),
			setLogs: [
				{
					load: JSON.stringify({ kind: 'external', kg: 82.5 }),
					reps: 5,
					repsLeft: null,
					durationSec: null,
					exerciseId: 'ex-squat',
					exercise: { name: 'Back Squat' },
				},
			],
		})
	}

	test('the sRPE figure the row prints is the one the week header summed', () => {
		const result = season([
			on(-7, { id: 'run', tssValue: 60 }),
			lifting(-6, 78),
		])
		const week = result.weeks[0]!
		// One number, summed once: 60 from the run and 78 from the gym.
		expect(week.doneTss).toBe(138)
		// A stream row is a day since #495, so the lifting session is found
		// among the sessions its day carries.
		const lift = week.rows
			.flatMap((day) => day.sessions)
			.find((s) => s.discipline === 'strength')!
		expect(lift.internalLoad).toContain('sRPE 78')
		expect(week.loadLine).toContain('138 av 50 TSS')
	})

	test('naming the figure sRPE moves no rollup — only what the row calls it', () => {
		// The same ledger, read with and without a lifting session in it. The gym
		// session adds its figure to the actual side and nothing to the planned
		// side, which is what "no session tonnage was invented" looks like from
		// the week header (ADR 0058 §3).
		const withoutLift = season([on(-7, { id: 'run', tssValue: 60 })]).weeks[0]!
		const withLift = season([
			on(-7, { id: 'run', tssValue: 60 }),
			lifting(-6, 78),
		]).weeks[0]!
		expect(withLift.plannedTss).toBe(withoutLift.plannedTss)
		expect(withLift.doneTss! - withoutLift.doneTss!).toBe(78)
	})

	test('a lifting session with no figure adds nothing to either side', () => {
		const withoutLift = season([on(-7, { id: 'run', tssValue: 60 })]).weeks[0]!
		const withLift = season([
			on(-7, { id: 'run', tssValue: 60 }),
			lifting(-6, null),
		]).weeks[0]!
		expect(withLift.doneTss).toBe(withoutLift.doneTss)
		expect(withLift.plannedTss).toBe(withoutLift.plannedTss)
		// And the row says what it lifted regardless — the kilos are not the load.
		const lift = withLift.rows
			.flatMap((day) => day.sessions)
			.find((s) => s.discipline === 'strength')!
		expect(lift.externalLoad).toBe('Back Squat 82.5 × 5')
	})
})

describe('a week header carries three numbers per track, in its own unit (#505 stories 20–26)', () => {
	// The plan began on the Monday four weeks back, so this week is plan week 4.
	const THIS_WEEK = 4
	const runTargets = [30, 33, 36, 27, 40, 44, 48, 36, 50, 54, 30, 20]

	function planWithTracks() {
		return plan({
			tracks: [
				{
					trackId: 'track-run',
					discipline: 'run',
					currency: 'km',
					targets: runTargets,
					overridden: runTargets.map(() => false),
					sessionTargets: null,
				},
				{
					trackId: 'track-lift',
					discipline: 'strength',
					currency: 'sets',
					targets: Array<number>(12).fill(24),
					overridden: Array<boolean>(12).fill(false),
					sessionTargets: Array<number>(12).fill(2),
				},
			],
		})
	}

	function distanceRun(km: number) {
		return workout({
			blocks: [
				{
					id: `block-${km}`,
					name: 'Main',
					orderIndex: 0,
					repeatCount: 1,
					seriesRepeatCount: 1,
					betweenSeriesRestSec: null,
					sendOff: null,
					steps: [step({ distanceM: km * 1000, durationSec: null })],
				},
			],
		})
	}

	function setRow(id: string) {
		return {
			id,
			kind: 'reps',
			orderIndex: 0,
			load: null,
			weightKg: null,
			pct1RM: null,
			effortCap: null,
			tempo: null,
			reps: 8,
			durationSec: null,
			terminationRir: null,
			velocityLossPct: null,
		}
	}

	function lift(days: number, logged: number) {
		return on(days, {
			id: `lift-${days}`,
			status: logged > 0 ? 'completed' : 'scheduled',
			recording: null,
			plannedTssValue: null,
			workout: workout({
				discipline: 'strength',
				title: 'Workout A',
				blocks: [
					{
						id: 'block-lift',
						name: 'Main',
						orderIndex: 0,
						repeatCount: 1,
						seriesRepeatCount: 1,
						betweenSeriesRestSec: null,
						sendOff: null,
						steps: [
							step({
								kind: 'strength',
								discipline: 'strength',
								durationSec: null,
								sets: Array.from({ length: 12 }, (_, i) => setRow(`set-${i}`)),
							}),
						],
					},
				],
			}),
			setLogs: Array.from({ length: logged }, () => ({
				load: JSON.stringify({ kind: 'external', kg: 60 }),
				reps: 8,
				repsLeft: null,
				durationSec: null,
				exerciseId: 'ex-squat',
				exercise: { name: 'Back Squat' },
			})),
		})
	}

	function thisWeek() {
		const result = season(
			[
				// Monday: 10 km asked, 10.4 km done.
				on(-2, {
					id: 'mon',
					workout: distanceRun(10),
					recording: {
						id: 'rec-mon',
						discipline: 'run',
						durationSec: 3120,
						distanceM: 10400,
						startedAt: NOW,
						endedAt: NOW,
						phaseBarsJson: null,
						linkAnsweredAt: null,
						unlinkedFromSessionId: null,
					},
				}),
				// Tuesday: a lift with 12 sets logged of 12.
				lift(-1, 12),
				// Thursday: 12 km ahead.
				on(1, {
					id: 'thu',
					status: 'scheduled',
					workout: distanceRun(12),
					recording: null,
				}),
				// Saturday: a long run with no distance prescribed.
				on(3, { id: 'sat', status: 'scheduled', recording: null }),
				// Sunday: a second lift, not done yet.
				lift(4, 0),
				// A ride to work: no bike track, so it counts in nothing.
				on(-1, {
					id: 'commute',
					workout: null,
					recording: {
						id: 'rec-bike',
						discipline: 'bike',
						durationSec: 1800,
						distanceM: 9000,
						startedAt: NOW,
						endedAt: NOW,
						phaseBarsJson: null,
						linkAnsweredAt: null,
						unlinkedFromSessionId: null,
					},
				}),
			],
			planWithTracks(),
		)
		return result.weeks.find((w) => w.key === THIS_MONDAY)!
	}

	test('a runner’s track reads km: target, planned and done', () => {
		const run = thisWeek().tracks.find((t) => t.trackId === 'track-run')!
		expect(run).toMatchObject({
			currency: 'km',
			target: runTargets[THIS_WEEK],
			planned: 22,
			actual: 10.4,
		})
		// The long run with no km is counted beside the sum, not as zero.
		expect(run.plannedUnmeasuredLabel).toBe('+1 uten km')
		expect(run.pace?.actualSecPerKm).toBe(300)
	})

	test('a lifter’s track reads sets, and sessions against the Strength Frequency', () => {
		const lifting = thisWeek().tracks.find((t) => t.trackId === 'track-lift')!
		expect(lifting).toMatchObject({
			currency: 'sets',
			target: 24,
			planned: 24,
			actual: 12,
			sessions: { target: 2, planned: 2, done: 1 },
		})
	})

	test('on a Wednesday the week is graded through Tuesday only', () => {
		const run = thisWeek().tracks.find((t) => t.trackId === 'track-run')!
		expect(run.grade).toMatchObject({
			status: 'on',
			gradedThroughKey: nextDay(THIS_MONDAY, 1),
			reference: 10,
		})
	})

	test('a ride with no track to count in is Annet, apart from the tracks', () => {
		expect(thisWeek().otherTrack).toMatchObject({
			label: 'Annet',
			sessions: 1,
			done: 1,
		})
	})

	test('a Planned TSS of 0 is unresolved on both the TSS line and a TSS track', () => {
		const tssPlan = plan({
			tracks: [
				{
					trackId: 'track-run',
					discipline: 'run',
					currency: 'tss',
					targets: Array<number>(12).fill(300),
					overridden: Array<boolean>(12).fill(false),
					sessionTargets: null,
				},
			],
		})
		const week = season(
			[
				on(1, {
					id: 'thu',
					status: 'scheduled',
					recording: null,
					plannedTssValue: 0,
				}),
			],
			tssPlan,
		).weeks.find((w) => w.key === THIS_MONDAY)!
		expect(week.plannedTss).toBeNull()
		expect(week.tracks[0]).toMatchObject({
			planned: null,
			plannedUnmeasuredLabel: '+1 uten TSS',
		})
	})

	test('without a plan there are no tracks to read', () => {
		const week = season([on(-2, { id: 'mon' })]).weeks.find(
			(w) => w.key === THIS_MONDAY,
		)!
		expect(week.tracks).toEqual([])
		expect(week.otherTrack).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// I dag: the week model a printed plan reads like (#505 S9)
// ---------------------------------------------------------------------------

describe('a week header says which week, what kind, and its numbers (#505 stories 19, 23)', () => {
	// Plan weeks, Monday first: the plan began on 21 Jan (plan week 0), so this
	// week (18 Feb) is Build 1 and 11 Mar is Build 4, its recovery week.
	const runTargets = [30, 33, 36, 27, 40, 44, 48, 36, 50, 54, 30, 20]
	const runPlan = () =>
		plan({
			tracks: [
				{
					trackId: 'track-run',
					discipline: 'run',
					currency: 'km',
					targets: runTargets,
					overridden: runTargets.map(() => false),
					sessionTargets: null,
				},
			],
		})
	const kmRun = (km: number) =>
		workout({
			blocks: [
				{
					id: `block-${km}`,
					name: 'Main',
					orderIndex: 0,
					repeatCount: 1,
					seriesRepeatCount: 1,
					betweenSeriesRestSec: null,
					sendOff: null,
					steps: [step({ distanceM: km * 1000, durationSec: null })],
				},
			],
		})
	const byKey = (result: ReturnType<typeof season>, key: string) =>
		result.weeks.find((week) => week.key === key)!

	test('the three weeks around today are named by where they sit, every other by its number', () => {
		const result = season([on(-14), on(0), on(7), on(14)])
		expect(byKey(result, nextDay(THIS_MONDAY, -14)).relativeName).toBe('Uke 6')
		expect(byKey(result, LAST_MONDAY).relativeName).toBe('Forrige uke')
		expect(byKey(result, THIS_MONDAY).relativeName).toBe('Denne uka')
		expect(byKey(result, nextDay(THIS_MONDAY, 7)).relativeName).toBe(
			'Neste uke',
		)
		expect(byKey(result, nextDay(THIS_MONDAY, 14)).relativeName).toBe('Uke 10')
	})

	test('a plan week names its phase and whether it is a hard or an easy week', () => {
		const result = season([on(0)], runPlan())
		expect(byKey(result, THIS_MONDAY)).toMatchObject({
			phaseName: 'Build',
			role: 'loading',
			roleLabel: 'hard uke',
		})
		expect(byKey(result, nextDay(THIS_MONDAY, 21))).toMatchObject({
			phaseName: 'Build',
			role: 'recovery',
			roleLabel: 'lett uke',
		})
	})

	test('a week before the plan or with no plan has no phase and no rhythm to name', () => {
		const result = season([on(-42), on(0)], runPlan())
		expect(result.weeks[0]).toMatchObject({
			phaseName: null,
			role: null,
			roleLabel: null,
		})
		expect(byKey(season([on(0)]), THIS_MONDAY).role).toBeNull()
	})

	test('a track reads target, planned and done side by side, in its own unit', () => {
		const week = byKey(
			season(
				[
					on(-2, {
						id: 'mon',
						workout: kmRun(10),
						recording: {
							id: 'rec',
							discipline: 'run',
							durationSec: 3000,
							distanceM: 10400,
							startedAt: NOW,
							endedAt: NOW,
							phaseBarsJson: null,
							linkAnsweredAt: null,
							unlinkedFromSessionId: null,
						},
					}),
					on(1, {
						id: 'thu',
						status: 'scheduled',
						workout: kmRun(12),
						recording: null,
					}),
				],
				runPlan(),
			),
			THIS_MONDAY,
		)
		expect(week.tracks[0]).toMatchObject({
			name: 'Løping',
			unit: 'km',
			figures: { target: '40', planned: '22', done: '10.4' },
			// Graded through Tuesday only: Monday's 10 of 10 is on plan.
			gradeLabel: 'i rute',
			// 22 planned against a target of 40 is more than 10 % off.
			driftLabel: 'planlagt er mer enn 10 % unna målet',
			paceLabel: 'snitt 4:48 /km',
		})
	})

	test('a Monday is never graded, so the header carries no verdict yet', () => {
		const monday = new Date('2030-02-18T12:00:00')
		const result = buildTimelineSeason({
			ledger: [],
			now: monday,
			timezone: 'UTC',
			activePlan: runPlan(),
		})
		expect(byKey(result, THIS_MONDAY).tracks[0]?.gradeLabel).toBeNull()
	})
})

describe('past weeks fold above today, one line each (#505 story 31)', () => {
	const runTargets = Array<number>(12).fill(46)
	const runPlan = () =>
		plan({
			tracks: [
				{
					trackId: 'track-run',
					discipline: 'run',
					currency: 'km',
					targets: runTargets,
					overridden: runTargets.map(() => false),
					sessionTargets: null,
				},
			],
		})
	const ran = (days: number, km: number, plannedKm: number) =>
		on(days, {
			id: `run-${days}`,
			workout: workout({
				blocks: [
					{
						id: `block-${days}`,
						name: 'Main',
						orderIndex: 0,
						repeatCount: 1,
						seriesRepeatCount: 1,
						betweenSeriesRestSec: null,
						sendOff: null,
						steps: [step({ distanceM: plannedKm * 1000, durationSec: null })],
					},
				],
			}),
			recording: {
				id: `rec-${days}`,
				discipline: 'run',
				durationSec: km * 330,
				distanceM: km * 1000,
				startedAt: NOW,
				endedAt: NOW,
				phaseBarsJson: null,
				linkAnsweredAt: null,
				unlinkedFromSessionId: null,
			},
		})

	test('a closed week folds to what was done against its target, and the verdict', () => {
		const result = season([ran(-9, 20, 23), ran(-8, 15, 23), on(0)], runPlan())
		const last = result.weeks.find((week) => week.key === LAST_MONDAY)!
		expect(last.shape).toBe('folded')
		expect(last.foldLabel).toBe('35 av 46 km · under')
	})

	test('this week and every week ahead stay open', () => {
		const result = season([on(0), on(7)], runPlan())
		expect(
			result.weeks
				.filter((week) => week.key >= THIS_MONDAY)
				.slice(0, 2)
				.map((week) => week.shape),
		).toEqual(['open', 'open'])
	})

	test('a folded week with no track to read counts its sessions instead', () => {
		const result = season([
			on(-9),
			on(-8, { status: 'missed', tssValue: null }),
			on(0),
		])
		const last = result.weeks.find((week) => week.key === LAST_MONDAY)!
		expect(last.shape).toBe('folded')
		expect(last.foldLabel).toBe('1 av 2 gjort · 1 ikke gjort · 50 av 100 TSS')
	})

	test('a folded week with nothing in it says so, never a zero', () => {
		const result = season([on(-14), on(0)])
		expect(
			result.weeks.find((week) => week.key === LAST_MONDAY)!.foldLabel,
		).toBe('Ingenting logget')
	})
})

describe('weeks past the Planning Horizon collapse, and keep the athlete’s own sessions (#505 stories 27–28)', () => {
	// On Wednesday 20 Feb the last closed week is 11 Feb, so the horizon is the
	// week of 25 Feb: next week is concrete and the week after collapses.
	const HORIZON = nextDay(THIS_MONDAY, 7)
	const PAST_HORIZON = nextDay(THIS_MONDAY, 14)
	const runTargets = [30, 33, 36, 27, 40, 44, 58, 36, 50, 54, 30, 20]
	const runPlan = (overrides: Partial<ActivePlan> = {}) =>
		plan({
			tracks: [
				{
					trackId: 'track-run',
					discipline: 'run',
					currency: 'km',
					targets: runTargets,
					overridden: runTargets.map(() => false),
					sessionTargets: null,
				},
			],
			...overrides,
		})

	test('the season runs to the plan’s last week, so its shape is all there', () => {
		const result = season([on(0)], runPlan())
		expect(result.weeks.at(-1)?.key).toBe('2030-04-08')
		expect(result.horizonWeekKey).toBe(HORIZON)
	})

	test('a week past the horizon is one line: week, phase, target, and when it fills', () => {
		const result = season([on(0)], runPlan())
		const week = result.weeks.find((w) => w.key === PAST_HORIZON)!
		expect(week.shape).toBe('collapsed')
		expect(week.foldLabel).toBe(
			'Uke 10 · Build · mål 58 km · fylles søndag kveld i uke 8',
		)
		expect(result.weeks.find((w) => w.key === HORIZON)!.shape).toBe('open')
	})

	test('a plan with nothing to fill from does not promise it will fill', () => {
		const result = season([on(0)], runPlan({ fillsWeeks: false }))
		expect(result.weeks.find((w) => w.key === PAST_HORIZON)!.foldLabel).toBe(
			'Uke 10 · Build · mål 58 km · ingen økter lagt inn ennå',
		)
	})

	test('the athlete’s own session far ahead still shows in the collapsed week', () => {
		const result = season(
			[
				on(0),
				on(15, {
					id: 'group-run',
					status: 'scheduled',
					source: 'authored',
					recording: null,
					workout: workout({ title: 'Langtur med gjengen' }),
				}),
			],
			runPlan(),
		)
		const week = result.weeks.find((w) => w.key === PAST_HORIZON)!
		expect(week.shape).toBe('collapsed')
		expect(
			week.rows.flatMap((day) => day.sessions.map((s) => s.title)),
		).toEqual(['Langtur med gjengen'])
		// Only the day that holds it is shown; the rest of the week is the line.
		expect(week.shownDayKeys).toEqual([nextDay(PAST_HORIZON, 3)])
	})

	test('a week the plan already laid is written, so it stays open', () => {
		const result = season(
			[
				on(0),
				on(15, {
					id: 'laid',
					status: 'scheduled',
					source: 'generated',
					recording: null,
				}),
			],
			runPlan(),
		)
		expect(result.weeks.find((w) => w.key === PAST_HORIZON)!.shape).toBe('open')
	})

	test('without a plan nothing collapses — there is nothing to fill a week from', () => {
		const result = season([on(0), on(21)])
		expect(result.weeks.every((week) => week.shape !== 'collapsed')).toBe(true)
		expect(result.horizonWeekKey).toBeNull()
	})
})

describe('free days ahead fold into short rows (#505 story 30)', () => {
	test('a run of free days ahead of today is one band that opens into its days', () => {
		// Wednesday today, Thursday written, Friday to Sunday free.
		const result = season([on(0), on(1)])
		const week = result.weeks.find((w) => w.key === THIS_MONDAY)!
		const free = week.bands.filter((band) => band.kind === 'free')
		expect(free).toHaveLength(1)
		expect(free[0]).toMatchObject({
			dayKeys: [
				nextDay(THIS_MONDAY, 4),
				nextDay(THIS_MONDAY, 5),
				nextDay(THIS_MONDAY, 6),
			],
			summaryLabel: '3 ledige dager',
		})
		// The days are still rows, so the band has something to open into.
		expect(week.rows.map((day) => day.key)).toContain(nextDay(THIS_MONDAY, 5))
	})

	test('today is never folded, even with nothing on it — it is the landing', () => {
		const result = season([on(-1)])
		const week = result.weeks.find((w) => w.key === THIS_MONDAY)!
		for (const band of week.bands) {
			expect(band.dayKeys).not.toContain(nextDay(THIS_MONDAY, 2))
		}
		expect(week.bands.find((b) => b.kind === 'free')?.dayKeys[0]).toBe(
			nextDay(THIS_MONDAY, 3),
		)
	})

	test('a single free day between two written ones stays a day', () => {
		const result = season([on(0), on(1), on(3), on(4)])
		const week = result.weeks.find((w) => w.key === THIS_MONDAY)!
		expect(week.bands.filter((b) => b.kind === 'free')).toEqual([])
	})

	test('behind today a run is still the past band, in the same words', () => {
		const result = season([on(0)])
		const past = result.weeks
			.find((w) => w.key === THIS_MONDAY)!
			.bands.find((b) => b.kind === 'past')
		expect(past?.summaryLabel).toBe('2 dager · ingenting logget')
	})
})

describe('the season strip (#505 stories 17–18, 26)', () => {
	const runTargets = [30, 33, 36, 27, 40, 44, 48, 36, 50, 54, 30, 20]
	const runPlan = () =>
		plan({
			tracks: [
				{
					trackId: 'track-run',
					discipline: 'run',
					currency: 'km',
					targets: runTargets,
					overridden: runTargets.map(() => false),
					sessionTargets: null,
				},
			],
		})
	const kmRun = (km: number) =>
		workout({
			blocks: [
				{
					id: `block-${km}`,
					name: 'Main',
					orderIndex: 0,
					repeatCount: 1,
					seriesRepeatCount: 1,
					betweenSeriesRestSec: null,
					sendOff: null,
					steps: [step({ distanceM: km * 1000, durationSec: null })],
				},
			],
		})

	test('every week of the season is in the strip, in order', () => {
		const result = season([on(0)], runPlan())
		expect(result.strip.weeks.map((week) => week.key)).toEqual(
			result.weeks.map((week) => week.key),
		)
		expect(result.strip.unit).toBe('km')
	})

	test('a bar is the larger of target and planned, against the season’s largest', () => {
		// 60 km laid against a target of 40 this week: overplanning shows.
		const result = season(
			[
				on(1, {
					id: 'big',
					status: 'scheduled',
					recording: null,
					workout: kmRun(60),
				}),
			],
			runPlan(),
		)
		const strip = result.strip.weeks
		const now = strip.find((week) => week.key === THIS_MONDAY)!
		expect(now.value).toBe(60)
		expect(now.height).toBe(1)
		// A week with nothing laid is drawn at its target, exactly — never floored.
		const build4 = strip.find((week) => week.key === nextDay(THIS_MONDAY, 21))!
		expect(build4.value).toBe(36)
		expect(build4.height).toBe(36 / 60)
	})

	test('it marks the current week and each week’s rhythm', () => {
		const strip = season([on(0)], runPlan()).strip.weeks
		expect(strip.filter((week) => week.isNow).map((w) => w.key)).toEqual([
			THIS_MONDAY,
		])
		expect(strip.find((w) => w.key === nextDay(THIS_MONDAY, 21))!.role).toBe(
			'recovery',
		)
	})

	test('a week with no figure draws no bar and says so', () => {
		const strip = season([on(0)], runPlan()).strip.weeks
		// Before the plan there is no target and nothing was planned in km.
		const before = season([on(-42), on(0)], runPlan()).strip.weeks[0]!
		expect(before.value).toBeNull()
		expect(before.height).toBeNull()
		expect(before.label).toContain('ingen tall')
		expect(strip.length).toBeGreaterThan(0)
	})

	test('without a plan the strip reads load, as the week did before', () => {
		const result = season([
			on(-7, { tssValue: 80, plannedTssValue: 80 }),
			on(0),
		])
		expect(result.strip.unit).toBe('TSS')
		expect(result.strip.weeks.find((w) => w.key === LAST_MONDAY)!.height).toBe(
			1,
		)
	})
})

describe('a done session can be counted in Annet from its row (#505 story 33)', () => {
	const runPlan = () =>
		plan({
			tracks: [
				{
					trackId: 'track-run',
					discipline: 'run',
					currency: 'km',
					targets: Array<number>(12).fill(40),
					overridden: Array<boolean>(12).fill(false),
					sessionTargets: null,
				},
			],
		})
	const rowOf = (result: ReturnType<typeof season>, id: string) =>
		result.weeks
			.flatMap((week) => week.rows)
			.flatMap((day) => day.sessions)
			.find((s) => s.id === id)!

	test('a done run in a plan with a run track offers to count it in Annet', () => {
		const result = season([on(-1, { id: 'run' })], runPlan())
		expect(rowOf(result, 'run').annet).toEqual({
			inAnnet: false,
			actionLabel: 'Tell i Annet',
		})
	})

	test('a session the athlete put in Annet says so, and offers the way back', () => {
		const result = season(
			[on(-1, { id: 'commute', countsInNoTrack: true })],
			runPlan(),
		)
		expect(rowOf(result, 'commute').annet).toEqual({
			inAnnet: true,
			actionLabel: 'Tell i sporet',
		})
		// And the week counts it in Annet, not in the run track.
		const week = result.weeks.find((w) => w.key === THIS_MONDAY)!
		expect(week.otherTrack?.sessions).toBe(1)
	})

	test('a planned session, or one with no track to leave, offers nothing', () => {
		const result = season(
			[
				on(1, { id: 'planned', status: 'scheduled', recording: null }),
				on(-1, { id: 'any' }),
			],
			null,
		)
		expect(rowOf(result, 'planned').annet).toBeNull()
		// Without a plan there is no track for the tap to take it out of.
		expect(rowOf(result, 'any').annet).toBeNull()
	})
})

describe('the review’s edges (#505 S9)', () => {
	const runTrack = (targets: number[]) => ({
		trackId: 'track-run',
		discipline: 'run' as const,
		currency: 'km' as const,
		targets,
		overridden: targets.map(() => false),
		sessionTargets: null,
	})
	const liftTrack = (targets: number[]) => ({
		trackId: 'track-lift',
		discipline: 'strength' as const,
		currency: 'sets' as const,
		targets,
		overridden: targets.map(() => false),
		sessionTargets: targets.map(() => 2),
	})

	test('a week’s relative name turns over at the athlete’s midnight, not UTC’s', () => {
		// Sunday 24 Feb, 23:30 in Oslo — still Sunday there, and still this week.
		const sundayNight = new Date('2030-02-24T22:30:00Z')
		// Half past midnight in Oslo — already Monday, a new week.
		const mondayMorning = new Date('2030-02-24T23:30:00Z')
		const names = (now: Date) =>
			Object.fromEntries(
				buildTimelineSeason({
					ledger: [],
					now,
					timezone: 'Europe/Oslo',
				}).weeks.map((week) => [week.key, week.relativeName]),
			)
		expect(names(sundayNight)).toMatchObject({ '2030-02-18': 'Denne uka' })
		expect(names(mondayMorning)).toMatchObject({ '2030-02-25': 'Denne uka' })
		expect(
			buildTimelineSeason({
				ledger: [on(-3)],
				now: mondayMorning,
				timezone: 'Europe/Oslo',
			}).weeks.find((week) => week.key === '2030-02-18')?.relativeName,
		).toBe('Forrige uke')
	})

	test('a week with nothing written in it carries no ≠ — it is unwritten, not off-plan', () => {
		const result = season(
			[on(0)],
			plan({ tracks: [runTrack(Array(12).fill(40))] }),
		)
		const next = result.weeks.find(
			(week) => week.key === nextDay(THIS_MONDAY, 7),
		)!
		// Nothing planned against a target of 40 is far off it…
		expect(next.tracks[0]?.driftMark).toBe(true)
		// …but a week with no sessions is not overplanned or underplanned.
		expect(next.tracks[0]?.driftLabel).toBeNull()
	})

	test('a track with no target, nothing planned and nothing done is left out of the header', () => {
		const result = season(
			[on(0)],
			plan({
				tracks: [runTrack(Array(12).fill(40)), liftTrack(Array(12).fill(0))],
			}),
		)
		const week = result.weeks.find((w) => w.key === THIS_MONDAY)!
		expect(week.tracks.map((t) => [t.trackId, t.hasFigures])).toEqual([
			['track-run', true],
			['track-lift', false],
		])
		// The strip's lifting dot reads the same rule.
		expect(result.strip.weeks.find((w) => w.isNow)?.strength).toBe(false)
	})

	test('a folded week whose target is 0 states only what was done, never “x av 0 km”', () => {
		const ran = on(-9, {
			id: 'ran',
			recording: {
				id: 'rec',
				discipline: 'run',
				durationSec: 3600,
				distanceM: 12_000,
				startedAt: NOW,
				endedAt: NOW,
				phaseBarsJson: null,
				linkAnsweredAt: null,
				unlinkedFromSessionId: null,
			},
		})
		const result = season(
			[ran, on(0)],
			plan({ tracks: [runTrack(Array(12).fill(0))] }),
		)
		const last = result.weeks.find((week) => week.key === LAST_MONDAY)!
		expect(last.foldLabel).toBe('12 km gjort')
		expect(last.foldLabel).not.toContain('av 0')
	})
})

describe('"lås opp" is offered on the athlete’s own planned sessions only (#505 story 55)', () => {
	function rowOf(overrides: Partial<LedgerSession>, days = 2) {
		return season([
			on(days, {
				id: 'row',
				status: 'scheduled',
				tssValue: null,
				recording: null,
				...overrides,
			}),
		])
			.weeks.flatMap((week) => week.rows)
			.flatMap((day) => day.sessions)
			.find((row) => row.id === 'row')!
	}

	test('the athlete’s own planned session can be handed back', () => {
		expect(rowOf({ source: 'authored' }).release).toEqual({
			actionLabel: 'Lås opp',
			note: 'Gi økta tilbake til appen, så den kan justere den igjen.',
		})
	})

	test('the app’s session, a released one and history are not offered it', () => {
		expect(rowOf({ source: 'generated' }).release).toBeNull()
		expect(
			rowOf({ source: 'authored', releasedAt: new Date('2030-02-19') }).release,
		).toBeNull()
		expect(rowOf({ source: 'authored' }, -2).release).toBeNull()
	})
})

describe('the Ukeskiftet card (#505 stories 4–6, 42–55)', () => {
	// NOW is Wednesday: the closed week is last week, the coming one this week.
	function card(
		proposals: WeekChangeProposal[],
		{
			ledger = [] as LedgerSession[],
			activePlan = null as ActivePlan | null,
			eased = null as WeekChangeData['eased'],
			open = true,
		} = {},
	) {
		const { weeks } = season(ledger, activePlan)
		return buildWeekChangeCard({
			data: {
				closedWeekKey: LAST_MONDAY,
				comingWeekKey: THIS_MONDAY,
				reason: 'Forrige uke gikk som planlagt.',
				open,
				proposals,
				eased,
			},
			weeks,
			ledger,
			activePlan,
			now: NOW,
			timezone: 'UTC',
		})!
	}

	const machineTarget = {
		id: 'target',
		title: 'Terskel',
		discipline: 'run',
		dayKey: '2030-02-21',
		owner: 'machine' as const,
		status: 'planned' as const,
	}

	function proposal(
		overrides: Partial<WeekChangeProposal> = {},
	): WeekChangeProposal {
		return {
			id: 'p1',
			payload: { kind: 'scale', factor: 0.9 },
			reason: 'Forrige uke ble 25 % tyngre enn planlagt.',
			loadDirection: 'keeps-or-reduces',
			scope: null,
			answer: 'pending',
			answeredAt: null,
			appliedAt: null,
			targetWeekKey: THIS_MONDAY,
			target: machineTarget,
			other: null,
			...overrides,
		}
	}

	test('there is no card without a closed week’s Week Replan', () => {
		expect(
			buildWeekChangeCard({
				data: null,
				weeks: [],
				ledger: [],
				activePlan: null,
				now: NOW,
				timezone: 'UTC',
			}),
		).toBeNull()
	})

	test('an unanswered proposal asks, with what it proposes and why', () => {
		const [view] = card([proposal()]).proposals
		expect(view).toMatchObject({
			state: 'answerable',
			stateLabel: null,
			confirmation: null,
			headline: '«Terskel» torsdag ca. 10 % kortere',
			reason: 'Forrige uke ble 25 % tyngre enn planlagt.',
			ownLabel: null,
			scope: null,
			round: null,
		})
	})

	test('a proposal on the athlete’s own session says it is theirs', () => {
		const [view] = card([
			proposal({ target: { ...machineTarget, owner: 'athlete' } }),
		]).proposals
		expect(view!.ownLabel).toBe('din økt')
	})

	test('"keep" is a real proposal with its reason, answerable like any other', () => {
		const [view] = card([
			proposal({
				payload: { kind: 'keep' },
				target: null,
				reason: 'Forrige uke gikk som planlagt. Denne uka står som den er.',
			}),
		]).proposals
		expect(view).toMatchObject({
			kind: 'keep',
			headline: 'Uka står som planlagt',
			reason: 'Forrige uke gikk som planlagt. Denne uka står som den er.',
			state: 'answerable',
		})
	})

	test('a move asks for its reach; a make-up does not', () => {
		const [move, makeUp] = card([
			proposal({
				id: 'move',
				payload: {
					kind: 'move',
					fromDate: '2030-02-21',
					toDate: '2030-02-22',
					makeUp: false,
				},
				scope: 'this-time',
			}),
			proposal({
				id: 'make-up',
				payload: {
					kind: 'move',
					fromDate: '2030-02-13',
					toDate: '2030-02-23',
					makeUp: true,
				},
				loadDirection: 'adds',
				target: { ...machineTarget, dayKey: '2030-02-13', status: 'missed' },
			}),
		]).proposals
		expect(move).toMatchObject({
			headline: 'Flytt «Terskel» fra torsdag til fredag',
			scope: {
				options: [
					{ value: 'this-time', label: 'bare denne gangen' },
					{ value: 'from-now-on', label: 'fra nå av' },
				],
			},
		})
		expect(makeUp).toMatchObject({
			headline: 'Ta igjen «Terskel» lørdag',
			addsLoad: true,
			scope: null,
		})
	})

	test('what silence applied this morning reads as done, not answerable', () => {
		const [today, yesterday] = card([
			proposal({ id: 'today', appliedAt: new Date('2030-02-20T06:00:00Z') }),
			proposal({
				id: 'yesterday',
				appliedAt: new Date('2030-02-19T06:00:00Z'),
			}),
		]).proposals
		expect(today).toMatchObject({
			state: 'silenced',
			stateLabel: 'Gjort i morges',
			confirmation: '«Terskel» er gjort ca. 10 % kortere. Ukemålet står.',
		})
		expect(yesterday).toMatchObject({
			state: 'silenced',
			stateLabel: 'Gjort tirsdag morgen',
		})
	})

	test('an answer says what changed, and what did not', () => {
		const [fromNowOn, declined, tooLate] = card([
			proposal({
				id: 'a',
				payload: {
					kind: 'move',
					fromDate: '2030-02-21',
					toDate: '2030-02-22',
					makeUp: false,
				},
				scope: 'from-now-on',
				answer: 'accepted',
				appliedAt: NOW,
			}),
			proposal({ id: 'b', answer: 'declined' }),
			proposal({ id: 'c', answer: 'accepted', appliedAt: null }),
		]).proposals
		expect(fromNowOn).toMatchObject({
			state: 'accepted',
			stateLabel: 'Du sa ok',
			confirmation:
				'«Terskel» er flyttet til fredag, også de neste ukene. Ukemålet står.',
		})
		expect(declined).toMatchObject({
			state: 'declined',
			stateLabel: 'Du sa nei takk',
			confirmation: '«Terskel» står som den var. Ukemålet står.',
		})
		expect(tooLate!.confirmation).toBe(
			'Økta var allerede passert eller borte, så ingenting ble endret.',
		)
	})

	test('the next round shows its volume change and the factor the athlete may change', () => {
		const [view] = card([
			proposal({
				payload: {
					kind: 'add-phase',
					outlineId: 'o',
					afterPhaseId: 'p',
					name: 'Blokk 5',
					weeks: 4,
					rhythm: '3:1',
					factor: 1.05,
				},
				loadDirection: 'adds',
				target: null,
			}),
		]).proposals
		expect(view).toMatchObject({
			headline: 'Blokk 5: 4 uker, +5 % volum',
			addsLoad: true,
			round: { factor: 1.05, min: 0.5, max: 1.5, step: 0.05 },
		})
	})

	test('the week that went: plan against done per track, missed and extra sessions', () => {
		const run = workout({
			title: 'Langtur',
			blocks: [
				{
					id: 'b',
					name: 'Main',
					orderIndex: 0,
					repeatCount: 1,
					seriesRepeatCount: 1,
					betweenSeriesRestSec: null,
					sendOff: null,
					steps: [step({ distanceM: 10000, durationSec: null })],
				},
			],
		})
		const ledger = [
			on(-7, { id: 'done', workout: run }),
			on(-6, {
				id: 'missed',
				status: 'scheduled',
				tssValue: null,
				recording: null,
				workout: workout({ title: 'Terskel' }),
			}),
			on(-5, { id: 'extra', workout: null, plannedTssValue: null }),
		]
		const targets = Array<number>(12).fill(30)
		const { review } = card([proposal()], {
			ledger,
			activePlan: plan({
				tracks: [
					{
						trackId: 'track-run',
						discipline: 'run',
						currency: 'km',
						targets,
						overridden: targets.map(() => false),
						sessionTargets: null,
					},
				],
			}),
		})
		expect(review).toMatchObject({ weekName: 'Forrige uke' })
		expect(review!.tracks).toHaveLength(1)
		expect(review!.tracks[0]).toMatchObject({
			name: 'Løping',
			unit: 'km',
			// Done is what was recorded: the run and the extra ride, 9.2 km each.
			figures: { target: '30', done: '18.4' },
		})
		expect(review!.missed.map((s) => s.title)).toEqual(['Terskel'])
		expect(review!.extras.map((s) => s.id)).toEqual(['extra'])
	})

	test('"Gjør uka lettere" is offered once a week, with the number it moves', () => {
		const targets = Array<number>(12).fill(30)
		const activePlan = plan({
			tracks: [
				{
					trackId: 'track-run',
					discipline: 'run',
					currency: 'km',
					targets,
					overridden: targets.map(() => false),
					sessionTargets: null,
				},
			],
		})
		const ahead = on(2, {
			id: 'ahead',
			status: 'scheduled',
			tssValue: null,
			recording: null,
			workout: workout({
				blocks: [
					{
						id: 'b',
						name: 'Main',
						orderIndex: 0,
						repeatCount: 1,
						seriesRepeatCount: 1,
						betweenSeriesRestSec: null,
						sendOff: null,
						steps: [step({ distanceM: 12000, durationSec: null })],
					},
				],
			}),
		})
		expect(card([proposal()], { ledger: [ahead], activePlan }).ease).toEqual({
			weekKey: THIS_MONDAY,
			state: 'offered',
			plannedLabel: 'Denne uka: 12 km planlagt',
			currency: 'km',
			resultLabel: null,
		})
		// Done, with the numbers kept from the tap: after a reload too.
		expect(
			card([proposal()], {
				ledger: [ahead],
				activePlan,
				eased: {
					at: NOW,
					volumes: {
						before: { distanceM: 12000, durationMin: 60, plannedTss: 70 },
						after: { distanceM: 10200, durationMin: 51, plannedTss: 60 },
					},
				},
			}).ease,
		).toMatchObject({
			state: 'done',
			resultLabel: 'Uka: 12 → 10,2 km planlagt. Ukemålet står.',
		})
	})

	test('the eased week is said in the track’s unit, never in metres or minutes', () => {
		const before = { distanceM: 44000, durationMin: 240, plannedTss: 300 }
		const after = { distanceM: 37400, durationMin: 204, plannedTss: 255 }
		expect(easedLine(before, after, 'km')).toBe(
			'Uka: 44 → 37,4 km planlagt. Ukemålet står.',
		)
		expect(easedLine(before, after, 'hours')).toBe(
			'Uka: 4 → 3,4 t planlagt. Ukemålet står.',
		)
		expect(easedLine(before, before, 'km')).toBe(
			'Det var ingen økter igjen å gjøre lettere. Ukemålet står.',
		)
	})

	test('a proposal whose session has passed says "for sent" and asks nothing', () => {
		const [passed, gone, makeUpLate] = card([
			proposal({ id: 'a', target: { ...machineTarget, status: 'missed' } }),
			proposal({ id: 'b', target: null }),
			proposal({
				id: 'c',
				payload: {
					kind: 'move',
					fromDate: '2030-02-13',
					toDate: '2030-02-19',
					makeUp: true,
				},
				loadDirection: 'adds',
				target: { ...machineTarget, dayKey: '2030-02-13', status: 'missed' },
			}),
		]).proposals
		for (const view of [passed, gone, makeUpLate]) {
			expect(view).toMatchObject({
				state: 'too-late',
				stateLabel: 'For sent',
				confirmation:
					'Økta er allerede passert, så forslaget kan ikke brukes lenger. Ingenting er endret.',
			})
		}
	})

	test('the heading names the week the proposals are for, and a line on top says how many wait', () => {
		const view = card([
			proposal({ id: 'a' }),
			proposal({ id: 'b' }),
			proposal({ id: 'c', answer: 'declined' }),
		])
		// NOW is Wednesday: the week the proposals land in has begun.
		expect(view.proposalsHeading).toBe('Forslag for denne uka')
		expect(view.waitingLabel).toBe('Ukeskiftet: 2 forslag venter')
		expect(
			card([proposal({ answer: 'accepted', appliedAt: NOW })]).waitingLabel,
		).toBeNull()

		const sunday = buildWeekChangeCard({
			data: {
				closedWeekKey: THIS_MONDAY,
				comingWeekKey: nextDay(THIS_MONDAY, 7),
				reason: 'Uka er ferdig.',
				open: true,
				proposals: [],
				eased: null,
			},
			weeks: [],
			ledger: [],
			activePlan: null,
			now: NOW,
			timezone: 'UTC',
		})!
		expect(sunday.proposalsHeading).toBe('Forslag for neste uke')
	})

	test('the next round says its peak week before → after in the lead track’s unit', () => {
		const targets = [30, 33, 36, 27, 40, 44, 48, 36, 50, 54, 30, 20]
		const [view] = card(
			[
				proposal({
					payload: {
						kind: 'add-phase',
						outlineId: 'o',
						afterPhaseId: 'p',
						name: 'Blokk 4',
						weeks: 4,
						rhythm: '3:1',
						factor: 1.05,
					},
					loadDirection: 'adds',
					target: null,
				}),
			],
			{
				activePlan: plan({
					tracks: [
						{
							trackId: 'track-run',
							discipline: 'run',
							currency: 'km',
							targets,
							overridden: targets.map(() => false),
							sessionTargets: null,
						},
					],
				}),
			},
		).proposals
		// The plan's last phase is two weeks (30, 20): its peak is 30 km.
		expect(view!.round!.peak).toEqual({ value: 30, currency: 'km' })
		expect(roundVolumeLine(view!.round!.peak!, 1.05)).toBe(
			'Toppuka: 30 → 31,5 km',
		)
		expect(roundVolumeLine(view!.round!.peak!, 0.9)).toBe('Toppuka: 30 → 27 km')
	})
})

describe('imports on the row: ekstra, hva var dette?, Angre kobling, Gjort (#505 stories 78–82)', () => {
	const runPlan = () =>
		plan({
			tracks: [
				{
					trackId: 'track-run',
					discipline: 'run',
					currency: 'km',
					targets: Array<number>(12).fill(40),
					overridden: Array<boolean>(12).fill(false),
					sessionTargets: null,
				},
			],
		})
	const rowsOf = (result: ReturnType<typeof season>) =>
		result.weeks.flatMap((week) => week.rows).flatMap((day) => day.sessions)
	const rowOf = (result: ReturnType<typeof season>, id: string) =>
		rowsOf(result).find((s) => s.id === id)!
	const recording = (
		id: string,
		overrides: Partial<NonNullable<LedgerSession['recording']>> = {},
	) => ({
		id,
		discipline: 'run',
		durationSec: 3000,
		distanceM: 9200,
		startedAt: NOW,
		endedAt: NOW,
		phaseBarsJson: null,
		linkAnsweredAt: null,
		unlinkedFromSessionId: null,
		...overrides,
	})
	/** Yesterday's run, recorded with no plan behind it. */
	const ekstra = (overrides: Partial<LedgerSession> = {}) =>
		on(-1, {
			id: 'ekstra',
			source: 'recorded',
			workout: null,
			recording: recording('import-1'),
			...overrides,
		})
	/** A planned run that day with no Recording yet. */
	const plannedRun = (id: string, title: string) =>
		on(-1, {
			id,
			status: 'scheduled',
			source: 'generated',
			recording: null,
			workout: workout({ id: `w-${id}`, title }),
		})

	test('a recorded session with no plan reads ekstra; a planned one does not', () => {
		const result = season(
			[ekstra(), on(-2, { id: 'linked', recording: recording('import-2') })],
			runPlan(),
		)
		expect(rowOf(result, 'ekstra').extraLabel).toBe('ekstra')
		expect(rowOf(result, 'linked').extraLabel).toBeNull()
	})

	test('an ekstra that fits nothing that day is not asked about', () => {
		const result = season([ekstra()], runPlan())
		expect(rowOf(result, 'ekstra').importLink).toBeNull()
	})

	test('an ekstra on a day with unrecorded planned runs asks hva var dette?, with each as an answer', () => {
		const result = season(
			[
				ekstra(),
				plannedRun('morning', '10 km rolig'),
				plannedRun('evening', '6 km rolig'),
				// A ride that day is not a run: not an answer.
				on(-1, {
					id: 'ride',
					status: 'scheduled',
					recording: null,
					workout: workout({ id: 'w-ride', discipline: 'bike' }),
				}),
			],
			runPlan(),
		)
		expect(rowOf(result, 'ekstra').importLink).toEqual({
			kind: 'ask',
			importId: 'import-1',
			question: 'Hva var dette?',
			note: 'Det lå 2 planlagte økter denne dagen, og vi vet ikke hvilken.',
			options: [
				{ sessionId: 'morning', label: 'Det var 10 km rolig' },
				{ sessionId: 'evening', label: 'Det var 6 km rolig' },
			],
			keepLabel: 'En ekstra økt',
			annetLabel: 'Annet, teller ikke',
		})
	})

	test('once answered, in Annet, or with no track to leave, the question changes or goes', () => {
		const answered = season(
			[
				ekstra({
					recording: recording('import-1', { linkAnsweredAt: NOW }),
				}),
				plannedRun('morning', '10 km rolig'),
			],
			runPlan(),
		)
		expect(rowOf(answered, 'ekstra').importLink).toBeNull()

		const inAnnet = season(
			[ekstra({ countsInNoTrack: true }), plannedRun('morning', '10 km')],
			runPlan(),
		)
		expect(rowOf(inAnnet, 'ekstra').importLink).toBeNull()

		// No plan, no track: Annet would change nothing, so it is not offered.
		const noPlan = season([ekstra(), plannedRun('morning', '10 km rolig')])
		expect(rowOf(noPlan, 'ekstra').importLink).toMatchObject({
			kind: 'ask',
			annetLabel: null,
		})
	})

	test('an ekstra from more than two weeks back is not asked about', () => {
		const old = (overrides: Partial<LedgerSession>) =>
			on(-15, {
				status: 'scheduled',
				recording: null,
				source: 'generated',
				...overrides,
			})
		const result = season(
			[
				on(-15, {
					id: 'ekstra',
					source: 'recorded',
					workout: null,
					recording: recording('import-1'),
				}),
				old({ id: 'old-plan', workout: workout({ id: 'w-old' }) }),
			],
			runPlan(),
		)
		expect(rowOf(result, 'ekstra').extraLabel).toBe('ekstra')
		expect(rowOf(result, 'ekstra').importLink).toBeNull()
	})

	test('an adopted detected session is the athlete’s, not an ekstra', () => {
		const result = season(
			[
				on(-1, {
					id: 'adopted',
					source: 'detected',
					adoptedAt: NOW,
					recording: recording('import-1'),
				}),
			],
			runPlan(),
		)
		expect(rowOf(result, 'adopted').extraLabel).toBeNull()
		expect(rowOf(result, 'adopted').importLink).toMatchObject({ kind: 'undo' })
	})

	test('a planned session holding an import offers Angre kobling', () => {
		const result = season(
			[on(-1, { id: 'linked', recording: recording('import-2') })],
			runPlan(),
		)
		expect(rowOf(result, 'linked').importLink).toMatchObject({
			kind: 'undo',
			importId: 'import-2',
			actionLabel: 'Angre kobling',
		})
	})

	test('after Angre kobling the ekstra offers Koble igjen to the session it came from, while that one is free', () => {
		const undone = ekstra({
			recording: recording('import-1', {
				linkAnsweredAt: NOW,
				unlinkedFromSessionId: 'morning',
			}),
		})
		const result = season(
			[undone, plannedRun('morning', '10 km rolig')],
			runPlan(),
		)
		expect(rowOf(result, 'ekstra').importLink).toEqual({
			kind: 'relink',
			importId: 'import-1',
			actionLabel: 'Koble igjen',
			label: 'Koble igjen til 10 km rolig',
			note: 'Tilbake til 10 km rolig.',
		})
		// The plan's session took another import since: nothing to go back to.
		const taken = season(
			[
				undone,
				on(-1, {
					id: 'morning',
					recording: recording('import-3'),
					workout: workout({ id: 'w-morning', title: '10 km rolig' }),
				}),
			],
			runPlan(),
		)
		expect(rowOf(taken, 'ekstra').importLink).toBeNull()
	})

	test('Gjort with no numbers says the numbers come from the import, when one is connected', () => {
		const doneByHand = on(-1, {
			id: 'done',
			status: 'completed',
			recording: null,
			tssValue: null,
		})
		const connected = buildTimelineSeason({
			ledger: [doneByHand],
			now: NOW,
			timezone: 'UTC',
			activePlan: runPlan(),
			importConnected: true,
		})
		expect(rowOf(connected, 'done').doneNote).toBe(
			'Gjort · tallene kommer fra importen',
		)
		// Without a connection nothing will bring them, and the row says so.
		expect(rowOf(season([doneByHand], runPlan()), 'done').doneNote).toBe(
			'Gjort · uten tall, ingen import er koblet til',
		)
		// A session with a Recording has its numbers; so has one an RPE priced.
		expect(rowOf(season([on(-1, { id: 'rec' })]), 'rec').doneNote).toBeNull()
		expect(
			rowOf(
				season([on(-1, { id: 'rpe', recording: null, tssValue: 40 })]),
				'rpe',
			).doneNote,
		).toBeNull()
	})

	test('Gjort is offered on a run whose day has begun and that has no Recording', () => {
		const result = season(
			[
				plannedRun('yesterday', '10 km rolig'),
				on(0, {
					id: 'today',
					status: 'scheduled',
					recording: null,
				}),
				on(2, { id: 'ahead', status: 'scheduled', recording: null }),
				on(-2, { id: 'recorded' }),
			],
			runPlan(),
		)
		expect(rowOf(result, 'yesterday').markDone).toEqual({
			actionLabel: 'Gjort',
			label: 'Merk 10 km rolig som gjort',
		})
		expect(rowOf(result, 'today').markDone).not.toBeNull()
		expect(rowOf(result, 'ahead').markDone).toBeNull()
		expect(rowOf(result, 'recorded').markDone).toBeNull()
	})
})

describe('the quick strength log under a strength session’s row (#505 stories 83–84)', () => {
	const rowOf = (result: ReturnType<typeof season>, id: string) =>
		result.weeks
			.flatMap((week) => week.rows)
			.flatMap((day) => day.sessions)
			.find((row) => row.id === id)!

	/** A gym day `days` from NOW: two prescribed sets, `logged` working sets in. */
	function gymDay(
		days: number,
		{
			status = 'scheduled',
			logged = 0,
			sets = 2,
		}: { status?: string; logged?: number; sets?: number } = {},
	) {
		return on(days, {
			id: `gym${days}`,
			status,
			recording: null,
			tssValue: null,
			plannedTssValue: null,
			workout: workout({
				discipline: 'strength',
				title: 'Styrke A',
				blocks: [
					{
						id: 'block-gym',
						name: 'Main',
						orderIndex: 0,
						repeatCount: 1,
						seriesRepeatCount: 1,
						betweenSeriesRestSec: null,
						sendOff: null,
						steps: [
							step({
								kind: 'strength',
								discipline: 'strength',
								durationSec: null,
								sets: Array.from({ length: sets }, (_, i) => ({
									id: `set-${i}`,
									kind: 'reps',
									orderIndex: i,
									load: JSON.stringify({ kind: 'absolute', kg: 60 }),
									weightKg: null,
									pct1RM: null,
									effortCap: null,
									tempo: null,
									reps: 5,
									durationSec: null,
									terminationRir: null,
									velocityLossPct: null,
								})),
							}),
						],
					},
				],
			}),
			setLogs: Array.from({ length: logged }, () => ({
				load: JSON.stringify({ kind: 'external', kg: 60 }),
				reps: 5,
				repsLeft: null,
				durationSec: null,
				exerciseId: 'ex-squat',
				exercise: { name: 'Back Squat' },
			})),
		})
	}

	test('offered on a planned gym day from today back a week, and named for it', () => {
		const result = season([
			gymDay(0),
			gymDay(-1),
			gymDay(-6),
			gymDay(-7),
			gymDay(1),
		])
		expect(rowOf(result, 'gym0').strengthLog).toEqual({
			heading: 'Logg økta',
			label: 'Logg Styrke A',
			asPlannedLabel: 'Logg Styrke A som planlagt',
		})
		// Yesterday's reads "ikke gjort" until it is logged — and is offered.
		expect(rowOf(result, 'gym-1').status).toBe('missed')
		expect(rowOf(result, 'gym-1').strengthLog).not.toBeNull()
		expect(rowOf(result, 'gym-6').strengthLog).not.toBeNull()
		// Past the week's reach, and a day that has not begun: not offered.
		expect(rowOf(result, 'gym-7').strengthLog).toBeNull()
		expect(rowOf(result, 'gym1').strengthLog).toBeNull()
	})

	test('not offered once logged, once started in the runner, or with nothing planned', () => {
		const result = season([
			gymDay(0, { status: 'completed', logged: 2 }),
			gymDay(-1, { logged: 1 }),
			gymDay(-2, { sets: 0 }),
		])
		expect(rowOf(result, 'gym0').strengthLog).toBeNull()
		expect(rowOf(result, 'gym-1').strengthLog).toBeNull()
		expect(rowOf(result, 'gym-2').strengthLog).toBeNull()
	})

	test('offered on a gym day an import marked done: it brought no sets', () => {
		const result = season([gymDay(-1, { status: 'completed' })])
		expect(rowOf(result, 'gym-1').status).toBe('completed')
		expect(rowOf(result, 'gym-1').strengthLog).not.toBeNull()
	})

	test('a repeated block is still offered: the log itself sends it to the runner', () => {
		const repeated = gymDay(0)
		const block = repeated.workout?.blocks[0]
		invariant(block, 'the gym day has its block')
		block.repeatCount = 2
		expect(rowOf(season([repeated]), 'gym0').strengthLog).not.toBeNull()
	})

	test('never on a run, and never as Gjort: a gym day is logged, not marked', () => {
		const result = season([
			gymDay(0),
			on(0, { id: 'run', status: 'scheduled', recording: null }),
		])
		expect(rowOf(result, 'run').strengthLog).toBeNull()
		expect(rowOf(result, 'gym0').markDone).toBeNull()
	})

	test('logged, the row reads done with its sets counted', () => {
		const result = season([gymDay(0, { status: 'completed', logged: 2 })])
		const row = rowOf(result, 'gym0')
		expect(row.status).toBe('completed')
		expect(row.chips.find((chip) => chip.id === 'sets')?.label).toMatch(
			/2 \/ 2/,
		)
	})
})

describe('a day is not graded before it is over (#505 story 24)', () => {
	test('a session earlier today still reads planned; yesterday’s reads ikke gjort', () => {
		const result = season([
			session({
				id: 'morning',
				scheduledAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
				status: 'scheduled',
				recording: null,
				tssValue: null,
			}),
			on(-1, {
				id: 'yesterday',
				status: 'scheduled',
				recording: null,
				tssValue: null,
			}),
		])
		const rows = result.weeks
			.flatMap((week) => week.rows)
			.flatMap((day) => day.sessions)
		expect(rows.find((row) => row.id === 'morning')?.status).toBe('planned')
		expect(rows.find((row) => row.id === 'yesterday')?.status).toBe('missed')
	})
})
