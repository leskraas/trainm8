import { expect, test } from 'vitest'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import {
	draftStart,
	levelDefaults,
	startStrengthPerWeek,
	TRAINING_LEVELS,
	weekSketch,
	type StartAnswers,
	type StartWeek,
} from './start-draft.ts'

// Strength in the start (#574, spec #558, ADR 0103): picking _styrke_ asks
// one tap — 1, 2 or 3 a week — and every Start Option lays that many lifting
// days on the athlete's days, away from the hard endurance days, showing the
// session's lifts and never counted in the hours.

const START = '2030-01-14'

const SESSION = {
	title: 'Helkropp A',
	lifts: ['Goblet squat 3×12', 'Armhevinger 3×12', 'Planke 3 sett'],
}

function start(
	overrides: Partial<StartAnswers> = {},
): NonNullable<ReturnType<typeof draftStart>> {
	const made = draftStart({
		level: 'recreational',
		discipline: 'run',
		hours: 5,
		days: [0, 2, 4, 5],
		startWeekKey: START,
		strength: { perWeek: 2, session: SESSION },
		...overrides,
	})
	if (!made) throw new Error('no draft')
	return made
}

function liftingDays(week: StartWeek): PatternWeekday[] {
	return week.days
		.filter((day) => day.lifting.length > 0)
		.map((day) => day.weekday)
}

function hardDays(week: StartWeek): PatternWeekday[] {
	return week.days
		.filter((day) => day.sessions.some((session) => session.effort !== 'easy'))
		.map((day) => day.weekday)
}

test('the tap is pre-set from lifting history where there is some, else by the Training Level', () => {
	expect(startStrengthPerWeek('beginner', null)).toBe(1)
	expect(startStrengthPerWeek('recreational', null)).toBe(1)
	expect(startStrengthPerWeek('experienced', null)).toBe(2)
	expect(startStrengthPerWeek('competitive', null)).toBe(2)
	expect(startStrengthPerWeek('beginner', 3)).toBe(3)
	// History outside the tap's range is held to it.
	expect(startStrengthPerWeek('competitive', 5)).toBe(3)
	expect(startStrengthPerWeek('beginner', 0)).toBe(1)
})

test('every Start Option lays strength days at the chosen frequency, on the days picked', () => {
	for (const perWeek of [1, 2, 3]) {
		const made = start({
			days: [0, 1, 2, 3, 4, 5],
			strength: { perWeek, session: SESSION },
		})
		for (const option of made.options) {
			expect(option.week.strengthSessions).toBe(perWeek)
			expect(liftingDays(option.week)).toEqual(option.strengthDays)
			for (const day of option.strengthDays) {
				expect([0, 1, 2, 3, 4, 5]).toContain(day)
			}
		}
	}
})

test('lifting days land away from the hard endurance days', () => {
	for (const level of TRAINING_LEVELS) {
		const { hours, days } = levelDefaults(level)
		const made = start({
			level,
			hours,
			days,
			strength: { perWeek: 2, session: SESSION },
		})
		for (const option of made.options) {
			const hard = hardDays(option.week)
			const free = days.filter((day) => !hard.includes(day)).length
			const onHard = option.strengthDays.filter((day) => hard.includes(day))
			// Only where the days left no other choice.
			expect(onHard).toHaveLength(
				Math.max(0, option.strengthDays.length - free),
			)
		}
	}
})

test('a strength day shows its lifts, not minutes, and the hours stay the endurance hours', () => {
	const without = start({ strength: null })
	const made = start()
	for (const [index, option] of made.options.entries()) {
		const plain = without.options[index]!
		expect(option.week.minutes).toBe(plain.week.minutes)
		expect(option.week.sessionCount).toBe(plain.week.sessionCount)
		expect(option.shortOfHours).toBe(plain.shortOfHours)
		for (const day of option.week.days) {
			for (const lift of day.lifting) expect(lift).toEqual(SESSION)
		}
	}
})

test('without styrke nothing is lifted', () => {
	const made = start({ strength: null })
	for (const option of made.options) {
		expect(option.strengthDays).toEqual([])
		expect(option.week.strengthSessions).toBe(0)
	}
})

test('the level’s session cap is the whole week’s: a beginner lifting once gets three endurance sessions', () => {
	const made = start({
		level: 'beginner',
		hours: 4,
		days: [0, 1, 2, 3, 4, 5],
		strength: { perWeek: 1, session: SESSION },
	})
	for (const option of made.options) {
		expect(option.week.sessionCount + option.week.strengthSessions).toBe(4)
	}
	expect(made.capped).toBe(true)
})

test('more lifts than days picked lifts once on each day', () => {
	const made = start({
		hours: 2,
		days: [3],
		strength: { perWeek: 3, session: SESSION },
	})
	expect(made.options[0]!.strengthDays).toEqual([3])
})

test('the Week Sketch carries the top option’s lifting days', () => {
	const made = start()
	expect(liftingDays(weekSketch(made))).toEqual(made.options[0]!.strengthDays)
})

test('where the lifts take endurance days, the draft says how many endurance sessions are left', () => {
	const made = start({
		level: 'experienced',
		hours: 7,
		days: [0, 1, 3, 4, 6],
		strength: { perWeek: 3, session: SESSION },
	})
	expect(made.strengthCapped).toBe(3)
	expect(
		start({ strength: { perWeek: 1, session: SESSION } }).strengthCapped,
	).toBeNull()
})

test('with several endurance sports the lifts come out of the same session cap', () => {
	const made = start({
		level: 'beginner',
		hours: 5,
		days: [0, 1, 2, 3, 4, 5],
		otherSports: ['bike'],
		strength: { perWeek: 1, session: SESSION },
	})
	for (const option of made.options) {
		expect(option.week.strengthSessions).toBe(1)
		expect(option.week.sessionCount + option.week.strengthSessions).toBe(4)
	}
})
