import { describe, expect, test } from 'vitest'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { buildTimelineHero, buildTimelineSeason } from './presenter.ts'

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
		expect(result.weeks[1]?.rows).toEqual([])
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
		expect(result.weeks).toHaveLength(5)
	})

	test('rows inside a week are chronological, whatever order they arrive in', () => {
		const result = season([on(2), on(-2), on(0)])
		const thisWeek = result.weeks.find((week) => week.isNow)!
		// The order is the calendar's, not the ledger's — and forward of today it
		// is the calendar even where the ledger has nothing to say.
		expect(thisWeek.rows.map((row) => row.dayLabel)).toEqual([
			'Mon',
			'Wed',
			'Thu',
			'Fri',
			'Sat',
			'Sun',
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
		const day = season([on(0)]).weeks[0]!.rows[0]!
		expect(day.key).toBe('2030-02-20')
		expect(day.dayLabel).toBe('Wed')
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
		expect(result.weeks[0]?.rows).toHaveLength(1)
		expect(result.weeks[0]?.statsLabel).toBe('2 of 2 done · 100 of 100 TSS')
	})

	test('days come out in calendar order, whatever order they arrive in', () => {
		const result = season([on(2), on(-2), on(0)])
		const thisWeek = result.weeks.find((week) => week.isNow)!
		expect(thisWeek.rows.map((day) => day.key)).toEqual([
			'2030-02-18',
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
		expect(holding(utc)?.dayLabel).toBe('Wed')
		expect(holding(utc)?.isToday).toBe(true)
		expect(holding(oslo)?.key).toBe('2030-02-21')
		expect(holding(oslo)?.dayLabel).toBe('Thu')
		expect(holding(oslo)?.isToday).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// Every day from today forward is a row (ADR 0065 §1, #497)
// ---------------------------------------------------------------------------

describe('from today forward, every day is a row', () => {
	test('the rest of this week renders even with nothing written in it', () => {
		// NOW is Wednesday: today plus Thursday through Sunday.
		const thisWeek = season([]).weeks.find((week) => week.isNow)!
		expect(thisWeek.rows.map((day) => day.key)).toEqual([
			'2030-02-20',
			'2030-02-21',
			'2030-02-22',
			'2030-02-23',
			'2030-02-24',
		])
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
		expect(horizon).toBe('2030-03-17')
		for (let key = result.todayKey; key <= horizon; key = nextDay(key, 1)) {
			expect(days).toContain(key)
		}
	})

	test('behind today nothing changes — only days with sessions on them', () => {
		// The past band is #500's. Until then a past week says exactly what it
		// said before, so nine blank rows never get between the reader and their
		// history — and the growth compensation never sees a run expand above it.
		const result = season([on(-2), on(0)])
		const thisWeek = result.weeks.find((week) => week.isNow)!
		const past = thisWeek.rows.filter((day) => day.key < result.todayKey)
		expect(past.map((day) => day.key)).toEqual(['2030-02-18'])
		expect(season([on(-14), on(0)]).weeks[0]?.rows).toHaveLength(1)
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
		expect(saturday.dayLabel).toBe('Sat')
		expect(saturday.dateLabel).toBe('23')
	})

	test('an empty day outside the current week states its month too', () => {
		const next = season([on(9)]).weeks[1]!.rows[0]!
		expect(next.key).toBe('2030-02-25')
		expect(next.dateLabel).toBe('25 Feb')
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
		expect(result.weeks[0]?.phaseLabel).toBe('Before this plan · Imported')
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
		// The plan began 4 weeks ago with a 4-week Base, so this week is Build 1.
		expect(result.weeks.find((week) => week.isNow)?.phaseLabel).toBe(
			'Build 1 · This week',
		)
	})

	test('the strip says the same thing in one quiet word', () => {
		const result = season([on(-35), on(0)], plan())
		expect(result.weeks[0]?.stripPhaseLabel).toBe('imported')
		expect(result.weeks.find((week) => week.isNow)?.stripPhaseLabel).toBe(
			'this week',
		)
		expect(result.weeks[1]?.stripPhaseLabel).toBe('base 1')
	})
})

// ---------------------------------------------------------------------------
// Week labels and rollups
// ---------------------------------------------------------------------------

describe('what a week header says', () => {
	test('the range names the month once when both ends share it', () => {
		const result = season([on(0)])
		expect(result.weeks[0]?.rangeLabel).toBe('18–24 February')
		expect(result.weeks[0]?.stripLabel).toBe('18–24 Feb')
	})

	test('a week crossing a month names both', () => {
		const result = season([on(7)])
		const week = result.weeks[result.weeks.length - 1]!
		expect(week.rangeLabel).toBe('25 February – 3 March')
	})

	test('a past week counts what was done against what was there', () => {
		const result = season([
			on(-7, { id: 'a' }),
			on(-6, { id: 'b', status: 'missed', tssValue: null }),
		])
		expect(result.weeks[0]?.statsLabel).toBe(
			'1 of 2 done · 1 missed · 50 of 100 TSS',
		)
	})

	test('an imported week counts sessions, since there was nothing to count against', () => {
		const result = season([on(-35), on(0)], plan())
		expect(result.weeks[0]?.statsLabel).toBe('1 session · 50 TSS')
	})

	test('a future week counts what is asked for', () => {
		const result = season([
			on(0),
			on(9, { status: 'scheduled', tssValue: null }),
			on(10, { id: 'later', status: 'scheduled', tssValue: null }),
		])
		const future = result.weeks[result.weeks.length - 1]!
		expect(future.statsLabel).toBe('2 planned · 100 TSS')
	})

	test('an empty week says so rather than showing a zero', () => {
		const result = season([on(-14), on(0)])
		expect(result.weeks[1]?.statsLabel).toBe('Nothing written')
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

describe('the day dots', () => {
	test('seven slots, Monday first', () => {
		const result = season([on(0)])
		// NOW is a Wednesday: the third slot.
		expect(result.weeks[0]?.dayDots).toEqual([
			'empty',
			'empty',
			'today',
			'empty',
			'empty',
			'empty',
			'empty',
		])
	})

	test('a done day, a planned day and a missed day each read differently', () => {
		const result = season([
			on(-7, { id: 'done' }),
			on(-6, { id: 'missed', status: 'missed' }),
			on(1, { id: 'planned', status: 'scheduled' }),
		])
		expect(result.weeks[0]?.dayDots.slice(2, 4)).toEqual(['done', 'missed'])
		const thisWeek = result.weeks.find((week) => week.isNow)!
		expect(thisWeek.dayDots[3]).toBe('planned')
	})

	test('two sessions on one day: the louder story wins the dot', () => {
		// A dot has room for one story, and a miss is the one the athlete needs.
		const result = season([
			on(-7, { id: 'done' }),
			on(-7, { id: 'missed', status: 'missed' }),
		])
		expect(result.weeks[0]?.dayDots[2]).toBe('missed')
	})

	test('today outranks everything on its own day', () => {
		const result = season([
			on(0, { id: 'done' }),
			on(0, { id: 'missed', status: 'missed' }),
		])
		expect(result.weeks[0]?.dayDots[2]).toBe('today')
	})

	test('today marks itself even with nothing on it', () => {
		// The strip's "you are here" is a fact about the calendar, the same one the
		// stream lands on. Read off a session it disappeared on a rest day —
		// exactly when the athlete most needs to see where today is.
		expect(season([on(-1), on(2)]).weeks[0]?.dayDots[2]).toBe('today')
		expect(season([]).weeks[0]?.dayDots[2]).toBe('today')
	})

	test('the dots and the rows agree about which days are empty', () => {
		// One day list feeds both axes, so an overview cannot disagree with the
		// thing it overviews (ADR 0065, consequences). Every dot that says
		// "nothing" is a row with no sessions, and every row with no sessions
		// either says nothing or says today.
		const result = season([
			on(-1),
			on(1, { status: 'scheduled' }),
			on(3, { status: 'missed' }),
		])
		const thisWeek = result.weeks.find((week) => week.isNow)!
		const byKey = new Map(thisWeek.rows.map((day) => [day.key, day]))
		thisWeek.dayDots.forEach((dot, index) => {
			const day = byKey.get(nextDay(thisWeek.key, index))
			if (dot === 'empty') expect(day?.sessions ?? []).toEqual([])
			else if (dot !== 'today') expect(day?.sessions.length).toBeGreaterThan(0)
		})
		expect(thisWeek.dayDots).toEqual([
			'empty',
			'done',
			'today',
			'planned',
			'empty',
			'missed',
			'empty',
		])
	})
})

describe('the strip load-bar scale', () => {
	test('the heaviest planned week in the season is the scale', () => {
		const result = season([
			on(-7, { id: 'light', plannedTssValue: 100 }),
			on(0, { id: 'heavy', plannedTssValue: 260 }),
		])
		expect(result.heaviestPlannedTss).toBe(260)
	})

	test('a season with no planned load still has a scale, so nothing divides by zero', () => {
		const result = season([
			on(0, { tssValue: null, plannedTssValue: null, status: 'scheduled' }),
		])
		expect(result.heaviestPlannedTss).toBe(1)
	})
})

// ---------------------------------------------------------------------------
// The caps at both ends
// ---------------------------------------------------------------------------

describe('both ends of the season are stated', () => {
	test('the near end names the day the history starts', () => {
		const result = season([on(-35), on(0)], plan())
		expect(result.loggedFromLabel).toBe('16 Jan')
	})

	test('an athlete with no history has no date to name', () => {
		expect(season([]).loggedFromLabel).toBeNull()
	})

	test('the far end names the day the plan is written through', () => {
		const result = season([on(0), on(20)], plan())
		expect(result.endCap.writtenThroughLabel).toBe('12 Mar')
	})

	test('the weeks between the last written one and race day are counted', () => {
		// Race day is 8 weeks out (week of 15 Apr); the last session is 20 days out
		// (week of 11 Mar). Five whole weeks sit between the two Mondays.
		const result = season([on(0), on(20)], plan())
		expect(result.endCap.unwrittenWeeks).toBe(5)
		expect(result.endCap.eventName).toBe('Spring Half')
		expect(result.endCap.eventDateLabel).toBe('17 Apr')
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
			'Wed 20 Feb · week 5 of 12',
		)
	})

	test('with no plan it says only what it knows', () => {
		expect(season([on(0)]).headerLabel).toBe('Wed 20 Feb')
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
			'Today · Run · 8 weeks to race day',
		)
	})

	test('the countdown drops to days inside the last week', () => {
		const soon = plan({ eventDate: new Date(NOW.getTime() + 3 * DAY) })
		expect(hero({ ledger: [planned], activePlan: soon })?.kicker).toBe(
			'Today · Run · 3 days to race day',
		)
	})

	test('with no plan the kicker says only what it knows', () => {
		expect(hero({ ledger: [planned], activePlan: null })?.kicker).toBe(
			'Today · Run',
		)
	})

	test('a session later this week is named by its weekday, not called today', () => {
		const later = on(2, { status: 'scheduled', tssValue: null })
		expect(hero({ ledger: [later] })?.kicker).toMatch(/^Friday · Run/)
	})

	test("tomorrow's session is called tomorrow", () => {
		const later = on(1, { status: 'scheduled', tssValue: null })
		expect(hero({ ledger: [later] })?.kicker).toMatch(/^Tomorrow · Run/)
	})

	test('past the coming week a weekday would be ambiguous, so the date is used', () => {
		const later = on(8, { status: 'scheduled', tssValue: null })
		expect(hero({ ledger: [later] })?.kicker).toMatch(/^28 Feb · Run/)
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
		expect(verdict).toBe(
			'Your Form reading is reliable after 42 days — day 9/42.',
		)
		expect(verdict).not.toMatch(/Form [+-]/)
	})

	test('no TSB at all is a cold start too, however long the history', () => {
		const verdict = hero({ ledger: [planned], current: null })?.verdict
		expect(verdict).not.toMatch(/Form [+-]/)
	})

	test("the collapsed header carries the title and the day's shape", () => {
		expect(hero({ ledger: [planned] })?.collapsed).toEqual({
			title: 'Threshold 4 × 8 min',
			summary: 'Today · 50 min · 91 TSS',
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
		expect(result?.kicker).toMatch(/^Today · Run/)
		expect(result?.title).toBe('Tempo 3 × 10 min')
		expect(result?.next).toBeNull()
	})

	test('today empty: the heading says so and Friday is a fact, not the headline', () => {
		const result = hero({ ledger: [friday] })
		expect(result?.title).toBe('Nothing on today')
		expect(result?.next).toBe('Next up · Threshold 4 × 8 min')
		expect(result?.kicker).not.toMatch(/Today/)
		expect(result?.kicker).toMatch(/^Friday · Run/)
	})

	test("today completed: the hero never headlines a future session as today's", () => {
		const result = hero({ ledger: [todayCompleted, friday] })
		expect(result?.title).toBe('Today is done')
		expect(result?.next).toBe('Next up · Threshold 4 × 8 min')
		expect(result?.kicker).toMatch(/^Friday · Run/)
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
			'Nothing left on today',
		)
	})

	test('the collapsed summary names the day too, so it cannot imply today', () => {
		expect(hero({ ledger: [friday] })?.collapsed.summary).toMatch(/^Friday · /)
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
		expect(result?.kicker.split(' · ')[0]).toBe('Friday')
		expect(day?.dayLabel).toBe('Fri')
		expect(day?.isToday).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// A lifting row and the week header read the same number (#491)
// ---------------------------------------------------------------------------

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
		expect(week.statsLabel).toContain('138 of 50 TSS')
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
