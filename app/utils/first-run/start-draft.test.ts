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

// The Start Options (#566): the level's three families, each a real first
// week, ranked, and never two that lay the same week.

/** Every way to pick `count` of the seven days, Monday first. */
function daySets(count: number): Array<Array<0 | 1 | 2 | 3 | 4 | 5 | 6>> {
	const sets: Array<Array<0 | 1 | 2 | 3 | 4 | 5 | 6>> = []
	const walk = (from: number, picked: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>) => {
		if (picked.length === count) {
			sets.push([...picked])
			return
		}
		for (let day = from; day < 7; day++) {
			walk(day + 1, [...picked, day as 0 | 1 | 2 | 3 | 4 | 5 | 6])
		}
	}
	walk(0, [])
	return sets
}

/** A first week as the athlete reads it, day for day. */
function shown(option: { week: { days: unknown[] } }) {
	return JSON.stringify(option.week.days)
}

test('for every level and day count the options are the level’s families, ranked, and no two lay the same week', () => {
	for (const level of TRAINING_LEVELS) {
		const { hours } = levelDefaults(level)
		for (let count = 1; count <= 7; count++) {
			for (const days of daySets(count)) {
				const made = start({ level, hours, days })
				const families = made.options.map((option) => option.family)
				// In the level's order (no preference ranks them yet), Masters never.
				expect(
					startFamilies(level).filter((family) => families.includes(family)),
				).toEqual(families)
				expect(families).not.toContain('masters')
				// Merged options are counted, so the three are all accounted for.
				expect(made.options.length + made.merged).toBe(3)
				const weeks = made.options.map(shown)
				expect(new Set(weeks).size).toBe(weeks.length)
			}
		}
	}
})

test('a Nybegynner on the level’s own week sees three ways, Stor base first and all easy', () => {
	const { hours, days } = levelDefaults('beginner')
	const made = start({ level: 'beginner', hours, days })
	expect(made.options.map((option) => option.family)).toEqual([
		'big-base',
		'polarized',
		'classic',
	])
	expect(made.merged).toBe(0)
	const base = made.options[0]!.week
	expect(base.hardSessions).toBe(0)
	expect(
		base.days.flatMap((day) => day.sessions.map((session) => session.effort)),
	).toEqual(['easy', 'easy', 'easy'])
	expect(base.minutesByEffort).toEqual({ easy: 180, moderate: 0, hard: 0 })
})

test('one day leaves no hard session, so every way lays the same week and they merge into one', () => {
	const made = start({ level: 'experienced', hours: 2, days: [5] })
	expect(made.options).toHaveLength(1)
	expect(made.options[0]!.family).toBe('polarized')
	expect(made.merged).toBe(2)
})

test('each option’s first week holds every day, its effort words, the effort time, the total and the hard sessions', () => {
	const made = start({ level: 'recreational', hours: 5, days: [0, 2, 4, 5] })
	const byFamily = Object.fromEntries(
		made.options.map((option) => [option.family, option.week]),
	)
	for (const week of Object.values(byFamily)) {
		expect(week.days.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
		// tirsdag and søndag are fri.
		expect(week.days[1]!.sessions).toEqual([])
		expect(week.days[6]!.sessions).toEqual([])
		expect(week.minutes).toBe(300)
		expect(
			week.minutesByEffort.easy +
				week.minutesByEffort.moderate +
				week.minutesByEffort.hard,
		).toBe(300)
		// The long day is lørdag, and it is easy.
		expect(week.days[5]!.sessions[0]).toMatchObject({
			title: 'Langtur · Løping',
			effort: 'easy',
		})
	}
	// Polarisert: one very hard session. Terskelfokus: one tempo, one
	// threshold. Klassisk: one tempo, nothing harder.
	expect(byFamily.polarized).toMatchObject({ hardSessions: 1 })
	expect(byFamily.polarized!.minutesByEffort.moderate).toBe(0)
	expect(byFamily.threshold).toMatchObject({ hardSessions: 1 })
	expect(byFamily.threshold!.minutesByEffort.moderate).toBeGreaterThan(0)
	expect(byFamily.classic).toMatchObject({ hardSessions: 0 })
	expect(byFamily.classic!.minutesByEffort.moderate).toBeGreaterThan(0)
})

test('week 1 of every option adds up to the hours given, or the option says by how much it falls short', () => {
	for (const level of TRAINING_LEVELS) {
		for (const hours of [1, 2.5, 4, 7.5, 13, 20]) {
			for (let count = 1; count <= 7; count++) {
				const made = start({ level, hours, days: daySets(count)[0]! })
				for (const option of made.options) {
					if (option.shortOfHours == null) {
						expect(Math.abs(option.week.minutes - hours * 60)).toBeLessThan(
							option.week.sessionCount,
						)
					} else {
						expect(option.shortOfHours).toBe(option.week.minutes)
					}
				}
			}
		}
	}
})

test('with no Session Preference no card claims Passer deg best; a beginner’s Stor base is recommended for the level', () => {
	const { hours, days } = levelDefaults('beginner')
	expect(start({ level: 'beginner', hours, days }).badge).toBe('level')
	for (const level of TRAINING_LEVELS.filter((l) => l !== 'beginner')) {
		const defaults = levelDefaults(level)
		expect(start({ level, ...defaults }).badge).toBeNull()
	}
})

test('the start says how many of the chosen days the plan uses', () => {
	// 1,5 t cannot fill four days without a session under half an hour.
	const made = start({ level: 'recreational', hours: 1.5, days: [0, 2, 4, 5] })
	expect(made.daysPicked).toBe(4)
	expect(made.daysUsed).toBe(2)
	expect(start().daysUsed).toBe(4)
})
