import { expect, test } from 'vitest'
import { draftFirstRunPlan } from './draft.ts'
import {
	draftStart,
	levelDefaults,
	startFamilies,
	TRAINING_LEVELS,
	weekSketch,
} from './start-draft.ts'

// The simple start's draft (#558 S2, #563): the answers in — Training Level,
// hours, the main sport and the days — and the Start Options and the Week
// Sketch (_Uka di_) out, laid by the same draft the plan is made from.

const START = '2030-01-14'

function start(
	overrides: Partial<Parameters<typeof draftStart>[0]> = {},
): NonNullable<ReturnType<typeof draftStart>> {
	const made = draftStart({
		level: 'recreational',
		discipline: 'run',
		hours: 5,
		days: [0, 2, 4, 5],
		startWeekKey: START,
		...overrides,
	})
	if (!made) throw new Error('no draft')
	return made
}

test('each Training Level pre-fills the hours and days of the spec’s level table', () => {
	expect(levelDefaults('beginner')).toMatchObject({
		hours: 3,
		days: [0, 2, 4],
		sessionCap: 4,
	})
	expect(levelDefaults('recreational')).toMatchObject({
		hours: 5,
		days: [0, 2, 4, 5],
		sessionCap: 6,
	})
	expect(levelDefaults('experienced')).toMatchObject({
		hours: 7,
		days: [0, 1, 3, 4, 6],
		sessionCap: 6,
	})
	expect(levelDefaults('competitive')).toMatchObject({
		hours: 10,
		days: [0, 1, 2, 3, 5, 6],
		sessionCap: 6,
	})
})

test('a beginner is offered Stor base first, every other level Polarisert 80/20; Masters is never offered', () => {
	expect(startFamilies('beginner')).toEqual([
		'big-base',
		'polarized',
		'classic',
	])
	for (const level of TRAINING_LEVELS.filter((l) => l !== 'beginner')) {
		expect(startFamilies(level)).toEqual(['polarized', 'threshold', 'classic'])
	}
	for (const level of TRAINING_LEVELS) {
		expect(startFamilies(level)).not.toContain('masters')
	}
})

test('the Plan Start Week is the week the draft was given: the first week not yet begun', () => {
	const made = start()
	expect(made.startWeekKey).toBe(START)
	for (const option of made.options) {
		expect(option.draft.weeks[0]!.weekKey).toBe(START)
	}
})

test('the Week Sketch is the top Start Option’s first week, day for day and minute for minute', () => {
	for (const level of TRAINING_LEVELS) {
		const { hours, days } = levelDefaults(level)
		const made = start({ level, hours, days })
		const top = draftFirstRunPlan({
			family: startFamilies(level)[0]!,
			goal: { kind: 'active' },
			startWeekKey: START,
			discipline: 'run',
			weeklyHours: hours,
			days,
			sessionCap: levelDefaults(level).sessionCap,
		})!
		const sketch = weekSketch(made)
		expect(made.options[0]!.family).toBe(startFamilies(level)[0])
		expect(
			sketch.days.flatMap((day) =>
				day.sessions.map((session) => [day.weekday, session.minutes]),
			),
		).toEqual(
			top.weeks[0]!.sessions.map((session) => [
				session.weekday,
				Math.round(session.volume! * 60),
			]),
		)
	}
})

test('the Week Sketch adds up to the hours given, and counts its sessions', () => {
	const sketch = weekSketch(start({ hours: 4.5, days: [1, 3, 6] }))
	expect(sketch.days).toHaveLength(7)
	expect(sketch.sessionCount).toBe(3)
	expect(sketch.minutes).toBe(270)
	// The days not trained are free, the long day last.
	expect(sketch.days.map((day) => day.sessions.length)).toEqual([
		0, 1, 0, 1, 0, 0, 1,
	])
	expect(sketch.days[6]!.sessions[0]!.title).toBe('Langtur · Løping')
})

test('with nothing answered the Week Sketch is empty, seven free days', () => {
	const sketch = weekSketch(null)
	expect(sketch.days).toHaveLength(7)
	expect(sketch.sessionCount).toBe(0)
	expect(sketch.minutes).toBe(0)
	expect(draftStart({ ...baseAnswers(), days: [] })).toBeNull()
})

function baseAnswers() {
	return {
		level: 'recreational' as const,
		discipline: 'run' as const,
		hours: 5,
		days: [0, 2, 4, 5] as Array<0 | 1 | 2 | 3 | 4 | 5 | 6>,
		startWeekKey: START,
	}
}

test('a Nybegynner gets at most four sessions, on the days with the most rest between them', () => {
	const made = start({
		level: 'beginner',
		hours: 6,
		days: [0, 1, 2, 3, 4, 5, 6],
	})
	const sketch = weekSketch(made)
	expect(sketch.sessionCount).toBe(4)
	// Four of seven days cannot all sit apart; one pair of neighbours is the
	// least there can be, and the long Sunday stays.
	expect(made.options[0]!.draft.patternDays).toEqual([1, 3, 5, 6])
	expect(made.capped).toBe(true)

	// Five days, the level's own week plus two, lose the day that leaves the
	// rest most apart.
	expect(
		start({ level: 'beginner', hours: 6, days: [0, 1, 3, 4, 6] }).options[0]!
			.draft.patternDays,
	).toEqual([1, 3, 4, 6])
})

test('every level keeps one day fri when all seven days are picked', () => {
	for (const level of TRAINING_LEVELS) {
		const made = start({
			level,
			hours: 12,
			days: [0, 1, 2, 3, 4, 5, 6],
		})
		const sketch = weekSketch(made)
		expect(
			sketch.days.filter((day) => day.sessions.length === 0).length,
		).toBeGreaterThanOrEqual(1)
		expect(made.restDayKept).toBe(true)
	}
})

test('fewer than seven days, or a capped beginner, is not said to keep a rest day', () => {
	expect(start({ days: [0, 1, 2, 3, 4, 5] }).restDayKept).toBe(false)
	expect(start({ days: [0, 2, 4] }).capped).toBe(false)
})
