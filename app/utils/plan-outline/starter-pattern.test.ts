import { expect, test } from 'vitest'
import { planStamp, type StampDay } from './stamp.ts'
import {
	DEFAULT_TRAINING_WEEKDAYS,
	proposeStarterPattern,
	type StarterTrack,
} from './starter-pattern.ts'
import { patternWeekdaysOfCalendar } from './week-pattern.ts'

const RUN: StarterTrack = {
	trackId: 'track-run',
	discipline: 'run',
	sessionsPerWeek: null,
}
const LIFT: StarterTrack = {
	trackId: 'track-strength',
	discipline: 'strength',
	sessionsPerWeek: 2,
}

test('the athlete’s own training days become the week, long day last', () => {
	// Sunday-first as stored: Tue, Thu, Sun.
	const proposal = proposeStarterPattern({
		trainableWeekdays: [2, 4, 0],
		tracks: [RUN],
	})

	expect(proposal?.source).toBe('availability')
	// Monday-first as a Training Week runs: Tue (1), Thu (3), Sun (6).
	expect(proposal?.days).toEqual([
		{ weekday: 1, trackId: 'track-run', weight: 1, role: 'ordinary' },
		{ weekday: 3, trackId: 'track-run', weight: 1, role: 'ordinary' },
		{ weekday: 6, trackId: 'track-run', weight: 2, role: 'long' },
	])
})

test('an athlete who never said falls back to the default, and it says so', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: null,
		tracks: [RUN],
	})

	expect(proposal?.source).toBe('default')
	expect(proposal?.days.map((day) => day.weekday)).toEqual(
		DEFAULT_TRAINING_WEEKDAYS,
	)
})

test('an athlete who says they train on no days is taken at their word', () => {
	expect(
		proposeStarterPattern({ trainableWeekdays: [], tracks: [RUN] }),
	).toBeNull()
})

test('a plan with no tracks has no week to propose', () => {
	expect(
		proposeStarterPattern({ trainableWeekdays: [2, 4], tracks: [] }),
	).toBeNull()
})

test('lifting is proposed as slots beside the endurance week, on no weekday', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: [2, 4, 0],
		tracks: [RUN, LIFT],
	})

	// Two, because that is what the block authors — and on no day of their
	// own: the stamp lays each week's lifts away from that week's hard days
	// (ADR 0104 §3), not from the front of the week.
	expect(proposal?.lifting).toEqual([
		{ trackId: 'track-strength' },
		{ trackId: 'track-strength' },
	])
	expect(
		proposal?.days.filter((day) => day.trackId === 'track-strength'),
	).toEqual([])
	// And the run week is untouched by their presence: no figure crosses the two
	// tracks in either direction.
	expect(
		proposal?.days.filter((day) => day.trackId === 'track-run'),
	).toHaveLength(3)
})

test('a lifter who trains more often than they are available gets what fits', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: [2],
		tracks: [{ ...LIFT, sessionsPerWeek: 4 }],
	})

	expect(proposal?.lifting).toHaveLength(1)
	expect(proposal?.days).toEqual([])
})

test('the starter week lifts on neither a hard day nor the day before one, where the days allow', () => {
	// Mon, Wed, Thu, Fri, Sun (Sunday-first as stored).
	const trainableWeekdays = [1, 3, 4, 5, 0]
	const proposal = proposeStarterPattern({
		trainableWeekdays,
		tracks: [{ ...RUN, hardSessions: 1 }, LIFT],
	})
	const days: StampDay[] = proposal!.days.map((day, index) => ({
		dayId: `day-${index}`,
		weekday: day.weekday,
		orderInDay: 0,
		trackId: day.trackId,
		kind: 'share',
		weight: day.weight,
		workoutId: null,
		shapeVolume: null,
	}))
	const [week] = planStamp({
		days,
		lifting: proposal!.lifting.map((slot, index) => ({
			dayId: `lift-${index}`,
			trackId: slot.trackId,
			workoutId: 'w-lift',
			orderInDay: index,
		})),
		liftingDays: patternWeekdaysOfCalendar(trainableWeekdays),
		tracks: [
			{ trackId: 'track-run', discipline: 'run', currency: 'hours' },
			{ trackId: 'track-strength', discipline: 'strength', currency: 'sets' },
		],
		weeks: [
			{
				weekKey: '2030-01-14',
				weekInPlan: 1,
				targets: [
					{ trackId: 'track-run', value: 5 },
					{ trackId: 'track-strength', value: 12 },
				],
				mixes: [
					{ trackId: 'track-run', mix: [{ zone: 4, sessionsPerWeek: 1 }] },
				],
			},
		],
	})
	const hard = week!.sessions
		.filter((session) => session.zone != null)
		.map((session) => session.weekday)
	const lifts = week!.sessions
		.filter((session) => session.trackId === 'track-strength')
		.map((session) => session.weekday)

	expect(hard).toHaveLength(1)
	expect(lifts).toHaveLength(2)
	for (const day of hard) {
		expect(lifts).not.toContain(day)
		expect(lifts).not.toContain((day + 6) % 7)
	}
	// The old rule's days, the first two of the week, are not what it lays.
	expect(lifts).not.toEqual([0, 2])
})

const BIKE: StarterTrack = {
	trackId: 'track-bike',
	discipline: 'bike',
	sessionsPerWeek: null,
}
const SWIM: StarterTrack = {
	trackId: 'track-swim',
	discipline: 'swim',
	sessionsPerWeek: null,
}

/** Every day of the week, Sunday-first as Training Availability stores it. */
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

function daysOf(
	proposal: ReturnType<typeof proposeStarterPattern>,
	trackId: string,
) {
	return (proposal?.days ?? [])
		.filter((day) => day.trackId === trackId)
		.map((day) => day.weekday)
}

function longDayOf(
	proposal: ReturnType<typeof proposeStarterPattern>,
	trackId: string,
) {
	return proposal?.days.find(
		(day) => day.trackId === trackId && day.role === 'long',
	)?.weekday
}

test('a run and bike week has one endurance session a day', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: EVERY_DAY,
		tracks: [{ ...RUN, hardSessions: 2 }, BIKE],
	})

	const weekdays = proposal?.days.map((day) => day.weekday) ?? []
	expect(weekdays).toHaveLength(7)
	expect(new Set(weekdays).size).toBe(7)
})

test('a run and bike week has its long days on different days, as far apart as the week allows', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: EVERY_DAY,
		tracks: [{ ...RUN, hardSessions: 2 }, BIKE],
	})

	// The run carries the mix and keeps the last day as its long one; the
	// ride's is three days round the wheel from Sunday, the earlier of the two.
	expect(longDayOf(proposal, 'track-run')).toBe(6)
	expect(longDayOf(proposal, 'track-bike')).toBe(2)
})

test('the track carrying the mix keeps the long day and room for its hard sessions', () => {
	// Listed second: the mix decides, not the order.
	const proposal = proposeStarterPattern({
		trainableWeekdays: [1, 2, 4, 6, 0],
		tracks: [BIKE, { ...RUN, hardSessions: 3 }],
	})

	expect(longDayOf(proposal, 'track-run')).toBe(6)
	// Three hard sessions and the long day: four of the five days.
	expect(daysOf(proposal, 'track-run')).toHaveLength(4)
	expect(daysOf(proposal, 'track-bike')).toHaveLength(1)
})

test('where two tracks carry a mix, only the main one keeps its hard sessions', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: EVERY_DAY,
		tracks: [
			{ ...BIKE, hardSessions: 2, weeklyShare: 3 },
			{ ...RUN, hardSessions: 2, weeklyShare: 6 },
		],
	})

	// Level on hard sessions, so the larger week's run carries the mix.
	expect(proposal?.mixTrackId).toBe('track-run')
})

test('with no track carrying a mix, none keeps one', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: EVERY_DAY,
		tracks: [RUN, BIKE],
	})

	expect(proposal?.mixTrackId).toBeNull()
})

test('the other tracks are dealt the days left in turn, spread through the week', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: EVERY_DAY,
		tracks: [{ ...RUN, hardSessions: 1 }, BIKE, SWIM],
	})

	expect(longDayOf(proposal, 'track-run')).toBe(6)
	const longDays = [
		longDayOf(proposal, 'track-run'),
		longDayOf(proposal, 'track-bike'),
		longDayOf(proposal, 'track-swim'),
	]
	expect(new Set(longDays).size).toBe(3)
	// Seven days over three sports: the run's even share, and two each.
	expect(daysOf(proposal, 'track-run')).toHaveLength(3)
	expect(daysOf(proposal, 'track-bike')).toHaveLength(2)
	expect(daysOf(proposal, 'track-swim')).toHaveLength(2)
	expect(new Set(proposal?.days.map((day) => day.weekday)).size).toBe(7)
})

test('with no track carrying a mix, the largest weekly share is the main track', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: EVERY_DAY,
		tracks: [
			{ ...RUN, weeklyShare: 3 },
			{ ...BIKE, weeklyShare: 6 },
		],
	})

	expect(longDayOf(proposal, 'track-bike')).toBe(6)
	expect(daysOf(proposal, 'track-bike').length).toBeGreaterThanOrEqual(
		daysOf(proposal, 'track-run').length,
	)
})

test('more tracks than days: each day gets one, the main track first', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: [0],
		tracks: [BIKE, { ...RUN, hardSessions: 2 }],
	})

	expect(proposal?.days).toEqual([
		{ weekday: 6, trackId: 'track-run', weight: 2, role: 'long' },
	])
})

test('a track that names its own days keeps to them, long day last', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: [2, 3, 4, 6, 0],
		tracks: [
			{ ...RUN, weekdays: [1, 3, 6] },
			{ ...BIKE, weekdays: [2, 5] },
		],
	})

	expect(daysOf(proposal, 'track-run')).toEqual([1, 3, 6])
	expect(daysOf(proposal, 'track-bike')).toEqual([2, 5])
	expect(longDayOf(proposal, 'track-bike')).toBe(5)
})

test('two tracks that name the same last day do not both go long on it', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: EVERY_DAY,
		tracks: [
			{ ...RUN, weekdays: [1, 3, 6] },
			{ ...BIKE, weekdays: [2, 4, 6] },
		],
	})

	expect(daysOf(proposal, 'track-bike')).toEqual([2, 4, 6])
	expect(longDayOf(proposal, 'track-run')).toBe(6)
	expect(longDayOf(proposal, 'track-bike')).toBe(4)
})

test('the other tracks are dealt around a track that names its own days', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: EVERY_DAY,
		tracks: [
			{ ...RUN, hardSessions: 2 },
			{ ...BIKE, weekdays: [2, 5] },
		],
	})

	expect(daysOf(proposal, 'track-bike')).toEqual([2, 5])
	expect(daysOf(proposal, 'track-run')).toEqual([0, 1, 3, 4, 6])
	expect(longDayOf(proposal, 'track-run')).toBe(6)
})

test('a strength track on its Pinned days lifts on those days, not in slots', () => {
	// Mon, Tue, Thu, Sat, Sun (Sunday-first as stored).
	const proposal = proposeStarterPattern({
		trainableWeekdays: [1, 2, 4, 6, 0],
		tracks: [RUN, { ...LIFT, weekdays: [1, 3] }],
	})

	expect(proposal?.lifting).toEqual([])
	expect(proposal?.pinnedLifting).toEqual([
		{ trackId: 'track-strength', weekday: 1 },
		{ trackId: 'track-strength', weekday: 3 },
	])
})

test('a Pinned lifting day outside Training Availability is not laid', () => {
	// Tue and Thu (Sunday-first as stored): Monday-first 1 and 3.
	const proposal = proposeStarterPattern({
		trainableWeekdays: [2, 4],
		tracks: [{ ...LIFT, weekdays: [1, 5] }],
	})

	expect(proposal?.pinnedLifting).toEqual([
		{ trackId: 'track-strength', weekday: 1 },
	])
})
