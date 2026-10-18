import { expect, test } from 'vitest'
import {
	availabilityFitWarnings,
	dayClashWarnings,
	hoursFitWarnings,
	weeklyEnduranceHours,
	weekSessionDemand,
	type FitSegment,
	type HoursFitTrack,
} from './availability-fit.ts'
import { type PhaseSpec } from './derive.ts'
import { type QualitySessionMixEntry } from './quality-mix.ts'
import { type StampDay, type StampTrack, type StampWeekInput } from './stamp.ts'

/** A phase of `weeks` with no rhythm — the roles decide nothing about a fit check. */
function phase(weeks: number): PhaseSpec {
	return { weeks, rhythm: 'none', tapers: false }
}

function mix(
	...entries: [zone: 3 | 4 | 5, sessionsPerWeek: number][]
): QualitySessionMixEntry[] {
	return entries.map(([zone, sessionsPerWeek]) => ({ zone, sessionsPerWeek }))
}

function endurance(
	phaseIndex: number,
	...entries: [zone: 3 | 4 | 5, sessionsPerWeek: number][]
): FitSegment {
	return { kind: 'endurance', phaseIndex, mix: mix(...entries) }
}

function strength(
	startWeekIndex: number,
	weeks: number,
	sessionsPerWeek: number | null,
): FitSegment {
	return { kind: 'strength', startWeekIndex, weeks, sessionsPerWeek }
}

test('a week asks for its phase’s quality sessions plus the covering segment’s Strength Frequency', () => {
	// The two halves ADR 0047 §4 says are now both stored: the derived **Quality
	// Session Count** and the authored **Strength Frequency**.
	const demand = weekSessionDemand(
		[phase(4)],
		[endurance(0, [4, 2], [5, 1]), strength(0, 4, 3)],
		2,
	)

	expect(demand).toEqual({ qualitySessions: 3, strengthSessions: 3 })
})

test('a week in a gap between strength segments asks for zero lifting sessions, not an Unavailable Metric', () => {
	// The gap is the authored "no lifting these weeks" state, exactly as it is for
	// the volume target (ADR 0047 §6) — a positive statement, never a hole.
	const segments = [endurance(0, [4, 1]), strength(0, 2, 3), strength(4, 2, 3)]

	expect(weekSessionDemand([phase(6)], segments, 2)).toEqual({
		qualitySessions: 1,
		strengthSessions: 0,
	})
})

test('a week outside the plan has no demand at all', () => {
	const segments = [endurance(0, [4, 2])]

	expect(weekSessionDemand([phase(4)], segments, 4)).toBeNull()
	expect(weekSessionDemand([phase(4)], segments, -1)).toBeNull()
})

test('a strength segment that authors no frequency leaves its weeks uncheckable', () => {
	// Unlike a gap, a segment with no **Strength Frequency** is a week the check has
	// no second number for. Declining beats counting it as zero, which would read as
	// "no lifting" for a week the athlete did author lifting in.
	expect(
		weekSessionDemand(
			[phase(4)],
			[endurance(0, [4, 2]), strength(0, 4, null)],
			1,
		),
	).toBeNull()
})

test('every track’s segment for the week counts, because a session is a session', () => {
	// A plan carries one track per Discipline (ADR 0043 §1), so a triathlete's week
	// is the sum of its tracks' sessions. Days against days can only be asked of the
	// whole week — a per-track figure answers a question nobody has.
	const demand = weekSessionDemand(
		[phase(4)],
		[endurance(0, [4, 2]), endurance(0, [5, 1]), strength(0, 4, 2)],
		0,
	)

	expect(demand).toEqual({ qualitySessions: 3, strengthSessions: 2 })
})

test('two strength segments holding one week resolve to the later-opening one', () => {
	// The authoring service refuses an overlap; this is only here so the reading can
	// never depend on row order, matching `strengthWeekTarget`'s own tie-break.
	const demand = weekSessionDemand(
		[phase(6)],
		[strength(2, 4, 4), strength(0, 4, 2)],
		3,
	)

	expect(demand).toEqual({ qualitySessions: 0, strengthSessions: 4 })
})

test('a week asking for more sessions than there are trainable weekdays warns', () => {
	const warnings = availabilityFitWarnings(
		[phase(2)],
		[endurance(0, [4, 2]), strength(0, 2, 3)],
		4,
	)

	expect(warnings).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 1,
			qualitySessions: 2,
			strengthSessions: 3,
			trainableWeekdays: 4,
		},
	])
})

test('a week that fills every trainable weekday exactly is silent', () => {
	// Equality is a plan, not a mistake: two sessions can share a day, and the day
	// list is a setting rather than a fact about the athlete's week (ADR 0045 §8).
	expect(
		availabilityFitWarnings(
			[phase(2)],
			[endurance(0, [4, 2]), strength(0, 2, 2)],
			4,
		),
	).toEqual([])
})

test('an athlete who never set their Training Availability gets no warnings at all', () => {
	expect(
		availabilityFitWarnings(
			[phase(4)],
			[endurance(0, [4, 4]), strength(0, 4, 4)],
			null,
		),
	).toEqual([])
})

test('an endurance-only plan still gets the check, with no lifting in it', () => {
	const warnings = availabilityFitWarnings(
		[phase(3)],
		[endurance(0, [4, 5])],
		3,
	)

	expect(warnings).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 2,
			qualitySessions: 5,
			strengthSessions: 0,
			trainableWeekdays: 3,
		},
	])
})

test('consecutive weeks asking the same thing collapse into one span', () => {
	// A strength segment floats free of the phases, so the check can only be
	// per-week — and a per-week list would say the same sentence eight times. The
	// span is the reading; the surface names the weeks it covers.
	const warnings = availabilityFitWarnings(
		[phase(8)],
		[endurance(0, [4, 3]), strength(0, 8, 3)],
		5,
	)

	expect(warnings).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 7,
			qualitySessions: 3,
			strengthSessions: 3,
			trainableWeekdays: 5,
		},
	])
})

test('a change in what the weeks ask opens a new span', () => {
	const warnings = availabilityFitWarnings(
		[phase(2), phase(2)],
		[endurance(0, [4, 4]), endurance(1, [4, 5]), strength(0, 4, 1)],
		4,
	)

	expect(warnings).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 1,
			qualitySessions: 4,
			strengthSessions: 1,
			trainableWeekdays: 4,
		},
		{
			fromWeekIndex: 2,
			toWeekIndex: 3,
			qualitySessions: 5,
			strengthSessions: 1,
			trainableWeekdays: 4,
		},
	])
})

test('weeks that fit break the span, so two stretches never read as one', () => {
	const warnings = availabilityFitWarnings(
		[phase(5)],
		[endurance(0, [4, 3]), strength(0, 1, 3), strength(4, 1, 3)],
		4,
	)

	expect(warnings.map((w) => [w.fromWeekIndex, w.toWeekIndex])).toEqual([
		[0, 0],
		[4, 4],
	])
})

test('an uncheckable week breaks the span rather than being spanned over', () => {
	const warnings = availabilityFitWarnings(
		[phase(3)],
		[
			endurance(0, [4, 5]),
			strength(0, 1, 1),
			strength(1, 1, null),
			strength(2, 1, 1),
		],
		4,
	)

	expect(warnings.map((w) => [w.fromWeekIndex, w.toWeekIndex])).toEqual([
		[0, 0],
		[2, 2],
	])
})

test('the fit warning carries the counts, the span and no wording', () => {
	const [warning] = availabilityFitWarnings(
		[phase(1)],
		[endurance(0, [3, 4]), strength(0, 1, 2)],
		2,
	)

	expect(Object.keys(warning!).sort()).toEqual([
		'fromWeekIndex',
		'qualitySessions',
		'strengthSessions',
		'toWeekIndex',
		'trainableWeekdays',
	])
})

test('the check never blocks: an impossible week is still only a warning', () => {
	// Nothing here returns a validation error and no write path may consult it
	// (ADR 0042 §9, ADR 0045 §8). The whole reading is advisory.
	expect(() =>
		availabilityFitWarnings([phase(1)], [strength(0, 1, 14)], 0),
	).not.toThrow()
	expect(availabilityFitWarnings([phase(1)], [strength(0, 1, 14)], 0)).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 0,
			qualitySessions: 0,
			strengthSessions: 14,
			trainableWeekdays: 0,
		},
	])
})

// ── hours against hours: the Weekly Capacity check (ADR 0050) ─────────────────

/**
 * A track authored **in hours**, so `weeklyEnduranceHours` quotes the athlete
 * rather than deriving anything. That keeps these tests about the *check* — the
 * conversion has its own suite, and a fixture needing a recipe and a threshold
 * would make a fit-check test fail for an intensity reason.
 */
function hoursTrack(
	...weeks: Array<number | null>
): HoursFitTrack & { discipline: 'run' } {
	return {
		discipline: 'run',
		currency: 'hours',
		targets: weeks.map((value) => ({ value })),
		segments: [{ phaseIndex: 0, mix: [] }],
	}
}

test('a week’s endurance hours are summed across the tracks', () => {
	const hours = weeklyEnduranceHours({
		phases: [phase(2)],
		tracks: [
			hoursTrack(5, 6),
			{ ...hoursTrack(3, 4), discipline: 'bike' as const },
		],
		contexts: {},
	})

	expect(hours).toEqual([8, 10])
})

test('one track the conversion cannot price sinks the whole week, never a partial sum', () => {
	// ADR 0046 §2: a total over *some* of the athlete's Disciplines would be read as
	// their whole week. `km` with no threshold pace closes the distance gate.
	const hours = weeklyEnduranceHours({
		phases: [phase(1)],
		tracks: [hoursTrack(5), { ...hoursTrack(40), currency: 'km' as const }],
		contexts: {},
	})

	expect(hours).toEqual([null])
})

test('a strength track prices no hours in either direction and does not gate the endurance ones', () => {
	// ADR 0047 §5 / ADR 0050 §3: lifting has sessions per week and no per-session
	// duration, so it is skipped rather than declined — a hybrid athlete keeps the
	// hours check on the endurance half of their week.
	const hours = weeklyEnduranceHours({
		phases: [phase(1)],
		tracks: [
			hoursTrack(6),
			{
				discipline: 'strength' as const,
				currency: 'sets' as const,
				targets: [{ value: 60 }],
				segments: [],
			},
		],
		contexts: {},
	})

	expect(hours).toEqual([6])
})

test('a plan with no endurance track has no hours at all, never zero hours', () => {
	const hours = weeklyEnduranceHours({
		phases: [phase(2)],
		tracks: [],
		contexts: {},
	})

	expect(hours).toEqual([null, null])
})

test('a week with no Season Anchor in force is declined rather than counted as nothing', () => {
	const hours = weeklyEnduranceHours({
		phases: [phase(3)],
		tracks: [hoursTrack(5, null, 7)],
		contexts: {},
	})

	expect(hours).toEqual([5, null, 7])
})

test('an unset Weekly Capacity yields no warnings — unavailable, never passing', () => {
	expect(hoursFitWarnings([20, 30, 40], null)).toEqual([])
})

test('equality is silent: a week that spends exactly the capacity is the plan', () => {
	expect(hoursFitWarnings([8, 8.1], 8)).toEqual([
		{
			fromWeekIndex: 1,
			toWeekIndex: 1,
			peakHours: 8.1,
			weeklyCapacityHours: 8,
		},
	])
})

test('contiguous over-capacity weeks are one warning carrying the worst of them', () => {
	const [warning, ...rest] = hoursFitWarnings([9, 11, 10], 8)

	expect(rest).toEqual([])
	expect(warning).toEqual({
		fromWeekIndex: 0,
		toWeekIndex: 2,
		peakHours: 11,
		weeklyCapacityHours: 8,
	})
})

test('a week that fits breaks the span rather than being spanned over', () => {
	expect(
		hoursFitWarnings([9, 7, 9], 8).map((w) => [w.fromWeekIndex, w.toWeekIndex]),
	).toEqual([
		[0, 0],
		[2, 2],
	])
})

test('a week the conversion could not price breaks the span rather than being claimed', () => {
	// No span may claim a week it did not check — the same rule the days check's
	// uncheckable lifting week follows.
	expect(
		hoursFitWarnings([9, null, 9], 8).map((w) => [
			w.fromWeekIndex,
			w.toWeekIndex,
		]),
	).toEqual([
		[0, 0],
		[2, 2],
	])
})

test('a plan whose hours are all Unavailable gets no hours warnings, and keeps the days check', () => {
	// ADR 0050 §5: the days check is the one a plan with no readable hours still has.
	expect(hoursFitWarnings([null, null], 8)).toEqual([])
	expect(
		availabilityFitWarnings([phase(2)], [endurance(0, [4, 5])], 3),
	).toHaveLength(1)
})

test('the hours warning carries the span, the two figures and no wording', () => {
	const [warning] = hoursFitWarnings([12], 8)

	expect(Object.keys(warning!).sort()).toEqual([
		'fromWeekIndex',
		'peakHours',
		'toWeekIndex',
		'weeklyCapacityHours',
	])
})

test('the two checks are independent: a week can miss one without missing the other', () => {
	// Four trainable days and two sessions a week fits; 12 h against an 8 h capacity
	// does not. Neither check knows about the other (ADR 0050 §5).
	const days = availabilityFitWarnings([phase(1)], [endurance(0, [4, 2])], 4)
	const hours = hoursFitWarnings(
		weeklyEnduranceHours({
			phases: [phase(1)],
			tracks: [hoursTrack(12)],
			contexts: {},
		}),
		8,
	)

	expect(days).toEqual([])
	expect(hours).toHaveLength(1)
})

test('the comparison is made at the precision the athlete reads, so no warning prints two equal numbers', () => {
	// 8.04 h against an 8 h capacity would render "8.0 h/wk … capacity is 8.0 h/wk",
	// which reads as a defect. Rounded, it fits — and 8.06 does not.
	expect(hoursFitWarnings([8.04], 8)).toEqual([])
	expect(hoursFitWarnings([8.06], 8)?.[0]?.peakHours).toBe(8.1)
})

// ---------------------------------------------------------------------------
// Days read as days (#594, ADR 0104 §6): the laid week's clashes
// ---------------------------------------------------------------------------

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

const RUN: StampTrack = { trackId: 'run', discipline: 'run', currency: 'km' }
const RIDE: StampTrack = { trackId: 'ride', discipline: 'bike', currency: 'km' }
const LIFT: StampTrack = {
	trackId: 'lift',
	discipline: 'strength',
	currency: 'sets',
}
/** A Simple Activity's track: `other`, which is no `Discipline` (ADR 0015). */
const SKI = {
	trackId: 'ski',
	discipline: 'other',
	currency: 'hours',
} as unknown as StampTrack

/** A fixed day: its Workout is the session, its zone what it asks for. */
function fixedDay(
	trackId: string,
	weekday: Weekday,
	extra: Partial<StampDay> = {},
): StampDay {
	return {
		dayId: `${trackId}-fixed-${weekday}`,
		weekday,
		orderInDay: 0,
		trackId,
		kind: 'fixed',
		volume: 5,
		workoutId: `${trackId}-w-${weekday}`,
		shapeVolume: null,
		...extra,
	} as StampDay
}

/** A bare share day; the heaviest of a track's is its long day. */
function shareDay(trackId: string, weekday: Weekday, weight = 1): StampDay {
	return {
		dayId: `${trackId}-share-${weekday}`,
		weekday,
		orderInDay: 0,
		trackId,
		kind: 'share',
		weight,
		workoutId: null,
		shapeVolume: null,
	} as StampDay
}

/** `count` plan weeks, every track at a target of 40. */
function planWeeks(
	count: number,
	tracks: readonly StampTrack[],
	mixFor: (week: number) => StampWeekInput['mixes'] = () => [],
): StampWeekInput[] {
	return Array.from({ length: count }, (_, index) => ({
		weekKey: `week-${index}`,
		weekInPlan: index + 1,
		targets: tracks.map((track) => ({ trackId: track.trackId, value: 40 })),
		mixes: mixFor(index),
	}))
}

function clashes(days: StampDay[], tracks: StampTrack[], weeks = 1) {
	return dayClashWarnings({ days, tracks, weeks: planWeeks(weeks, tracks) })
}

test('lifting on a hard day warns, naming the day', () => {
	expect(
		clashes(
			[fixedDay('run', 1, { zone: 4 }), fixedDay('lift', 1)],
			[RUN, LIFT],
		),
	).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 0,
			reason: 'lifting-on-hard-day',
			weekday: 1,
			pinned: true,
		},
	])
})

test('lifting the day before a hard day warns on the lifting day', () => {
	expect(
		clashes(
			[fixedDay('lift', 0), fixedDay('run', 1, { zone: 4 })],
			[RUN, LIFT],
		).map(({ reason, weekday }) => [reason, weekday]),
	).toEqual([['lifting-before-hard-day', 0]])
})

test('lifting on the long day warns', () => {
	expect(
		clashes(
			[shareDay('run', 1), shareDay('run', 6, 2), fixedDay('lift', 6)],
			[RUN, LIFT],
		).map(({ reason, weekday }) => [reason, weekday]),
	).toEqual([['lifting-on-long-day', 6]])
})

test('two hard days in a row across tracks warn, a hard Simple Activity among them', () => {
	// A `hard` _Langrenn_ Thursday after the run's threshold Wednesday: the
	// Simple Activity reads by its own Effort Word, not by a zone.
	expect(
		clashes(
			[fixedDay('run', 2, { zone: 4 }), fixedDay('ski', 3, { effort: 'hard' })],
			[RUN, SKI],
		).map(({ reason, weekday }) => [reason, weekday]),
	).toEqual([['hard-days-in-a-row', 2]])
})

test('a clash on a Simple Activity’s day says it comes from the athlete’s choice', () => {
	// _Langrenn_ is on the days the athlete gave it, with no _La appen
	// velge_ (#598): a hard Saturday before the run's Sunday intervals.
	expect(
		clashes(
			[fixedDay('ski', 5, { effort: 'hard' }), fixedDay('run', 6, { zone: 4 })],
			[RUN, SKI],
		),
	).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 0,
			reason: 'hard-days-in-a-row',
			weekday: 5,
			pinned: true,
		},
	])
})

test('a clash on a track’s Pinned days says it comes from the athlete’s choice', () => {
	// The ride pinned to Thursday, its intervals laid there, after the run's
	// threshold Wednesday the athlete authored (#598).
	const laid = (pinned: boolean) =>
		clashes(
			[fixedDay('run', 2, { zone: 4 }), fixedDay('ride', 3, { zone: 4 })],
			[RUN, { ...RIDE, pinned }],
		)
	expect(laid(true)).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 0,
			reason: 'hard-days-in-a-row',
			weekday: 2,
			pinned: true,
		},
	])
	expect(laid(false)[0]?.pinned).toBe(false)
})

test('two hard sessions on one day warn, a middels one counting as hard', () => {
	expect(
		clashes(
			[fixedDay('run', 1, { zone: 4 }), fixedDay('ride', 1, { zone: 3 })],
			[RUN, RIDE],
		).map(({ reason, weekday }) => [reason, weekday]),
	).toEqual([['two-hard-sessions', 1]])
})

test('two long sessions on one day warn', () => {
	expect(
		clashes(
			[
				shareDay('run', 1),
				shareDay('run', 6, 2),
				shareDay('ride', 2),
				shareDay('ride', 6, 2),
			],
			[RUN, RIDE],
		).map(({ reason, weekday }) => [reason, weekday]),
	).toEqual([['two-long-sessions', 6]])
})

test('a rolig week with lifting away from it says nothing', () => {
	expect(
		clashes(
			[
				shareDay('run', 1),
				shareDay('run', 6, 2),
				fixedDay('lift', 3),
				fixedDay('ski', 4, { effort: 'rolig' }),
			],
			[RUN, LIFT, SKI],
		),
	).toEqual([])
})

test('the hard days are read as the stamp lays the mix, and a clash spans the weeks that hold it', () => {
	// Tuesday and a long Sunday: from the third week on, the one threshold
	// session has nowhere to go but Tuesday — where the athlete's fixed
	// lifting already is. The stamp steps around lifting where it can
	// (ADR 0104 §2); the check says so where it cannot.
	const tracks = [RUN, LIFT]
	const warnings = dayClashWarnings({
		days: [shareDay('run', 1), shareDay('run', 6, 2), fixedDay('lift', 1)],
		tracks,
		weeks: planWeeks(5, tracks, (week) =>
			week >= 2
				? [{ trackId: 'run', mix: [{ zone: 4, sessionsPerWeek: 1 }] }]
				: [],
		),
	})

	expect(warnings).toEqual([
		{
			fromWeekIndex: 2,
			toWeekIndex: 4,
			reason: 'lifting-on-hard-day',
			weekday: 1,
			pinned: true,
		},
	])
})

test('the check sees where a week’s lifting slots land, and the app’s choice is not the athlete’s', () => {
	// The athlete trains only on Tuesday, the run's threshold day. The app has
	// nowhere else to lift, and says so — as its own choice, not a pinned day
	// (#597).
	const tracks = [RUN, LIFT]
	expect(
		dayClashWarnings({
			days: [fixedDay('run', 1, { zone: 4 })],
			lifting: [{ dayId: 'slot-0', trackId: 'lift', workoutId: 'w-lift' }],
			liftingDays: [1],
			tracks,
			weeks: planWeeks(1, tracks),
		}),
	).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 0,
			reason: 'lifting-on-hard-day',
			weekday: 1,
			pinned: false,
		},
	])
})

test('a day clash carries the day and the reason, never a figure spanning tracks', () => {
	// ADR 0046: no load, fatigue or hours number across tracks — the warning
	// is a kind of day and a span of weeks, nothing to add up.
	const [warning] = clashes(
		[fixedDay('run', 1, { zone: 4 }), fixedDay('lift', 1)],
		[RUN, LIFT],
	)

	expect(Object.keys(warning!).sort()).toEqual([
		'fromWeekIndex',
		'pinned',
		'reason',
		'toWeekIndex',
		'weekday',
	])
})
