import { expect, test } from 'vitest'
import { ACTIVITY_KINDS, type ActivityKind } from '../simple-activity.ts'
import {
	draftStart,
	levelDefaults,
	SIMPLE_ACTIVITY_DEFAULTS,
	TRAINING_LEVELS,
	type StartAnswers,
	type StartOption,
} from './start-draft.ts'

// Simple Activities in the simple start (#572): _langrenn_, _fjelltur_,
// _klatring_ and _yoga og bevegelighet_ picked beside the main sport, or
// alone. The answers in, the Start Options out — each Simple Activity a fixed
// day on one hours track on `other`, counted in week 1's hours, or named as
// _Fikk ikke plass_.

const START = '2030-01-14'

function start(overrides: Partial<StartAnswers> = {}) {
	const made = draftStart({
		level: 'recreational',
		discipline: 'run',
		activities: ['climb', 'yoga-mobility'],
		hours: 5,
		days: [0, 2, 4, 5],
		startWeekKey: START,
		...overrides,
	})
	if (!made) throw new Error('no draft')
	return made
}

const TITLE: Record<ActivityKind, string> = {
	'cross-country-ski': 'Langrenn',
	hike: 'Fjelltur',
	climb: 'Klatring',
	'yoga-mobility': 'Yoga og bevegelighet',
}

/** The Simple Activities a first week lays, by weekday. */
function simpleSessions(option: StartOption) {
	return option.week.days.flatMap((day) =>
		day.sessions
			.filter((session) => session.discipline === 'other')
			.map((session) => ({ weekday: day.weekday, ...session })),
	)
}

test('every Simple Activity shares one hours track on other, with no mix, each a fixed day with its kind, Effort Word and time', () => {
	for (const option of start().options) {
		const simple = option.draft.tracks.filter(
			(track) => track.discipline === 'other',
		)
		expect(simple).toHaveLength(1)
		expect(simple[0]).toMatchObject({ currency: 'hours', mix: 'none' })
		// Two of its hours are the climb and the yoga, so week 1 asks it for them.
		expect(simple[0]!.anchor).toBe(2)
		const rows = option.draft.rows.tracks.find(
			(track) => track.id === simple[0]!.trackId,
		)!
		expect(rows.segments.every((segment) => segment.mix.length === 0)).toBe(
			true,
		)

		expect(
			option.draft.simpleActivities.map(({ kind, effortWord, minutes }) => ({
				kind,
				effortWord,
				minutes,
			})),
		).toEqual([
			{ kind: 'climb', effortWord: 'middels', minutes: 90 },
			{ kind: 'yoga-mobility', effortWord: 'rolig', minutes: 30 },
		])
		const laid = option.draft.weeks[0]!.sessions.filter(
			(session) => session.trackId === simple[0]!.trackId,
		)
		expect(laid.map((session) => session.kind)).toEqual(['fixed', 'fixed'])

		expect(
			simpleSessions(option).map(({ title, minutes, effort }) => ({
				title,
				minutes,
				effort,
			})),
		).toEqual([
			{ title: 'Klatring', minutes: 90, effort: 'moderate' },
			{ title: 'Yoga og bevegelighet', minutes: 30, effort: 'easy' },
		])
		// A day of its own: never beside a run.
		for (const day of option.week.days) {
			const kinds = new Set(day.sessions.map((session) => session.discipline))
			expect(kinds.size).toBeLessThanOrEqual(1)
		}
	}
})

test('week 1 of every option adds up to the hours across every track, Simple Activities included', () => {
	const made = start()
	expect(made.options.length).toBeGreaterThan(1)
	for (const option of made.options) {
		expect(option.week.minutes).toBe(5 * 60)
		expect(option.shortOfHours).toBeNull()
		expect(option.notFitted).toBeNull()
		// The run keeps the rest: three hours on the two days left.
		const run = option.week.days.flatMap((day) =>
			day.sessions.filter((session) => session.discipline === 'run'),
		)
		expect(run).toHaveLength(2)
		expect(run.reduce((sum, session) => sum + session.minutes, 0)).toBe(180)
	}
})

test('for every level and every activity, nothing picked goes missing: each is laid or said not to fit', () => {
	for (const level of TRAINING_LEVELS) {
		const { hours, days } = levelDefaults(level)
		for (const kinds of [
			[...ACTIVITY_KINDS],
			['hike'],
			['yoga-mobility', 'cross-country-ski'],
		] as ActivityKind[][]) {
			const made = start({ level, hours, days, activities: kinds })
			for (const option of made.options) {
				const laid = option.draft.simpleActivities.map((a) => a.kind)
				const missing = option.notFitted?.kinds ?? []
				expect([...laid, ...missing].sort()).toEqual([...kinds].sort())
				// Week 1 is the hours, or the card says what it comes to.
				if (option.shortOfHours == null) {
					expect(Math.abs(option.week.minutes - hours * 60)).toBeLessThan(
						Math.max(1, option.week.sessionCount),
					)
				} else {
					expect(option.shortOfHours).toBe(option.week.minutes)
				}
			}
		}
	}
})

test('an activity with no day left is named, with another day as what makes room', () => {
	// A beginner's three days: the run keeps two, so the climb takes the third.
	const made = start({
		level: 'beginner',
		hours: 3,
		days: [0, 2, 4],
		activities: ['climb', 'yoga-mobility'],
	})
	for (const option of made.options) {
		expect(option.draft.simpleActivities.map((a) => a.kind)).toEqual(['climb'])
		expect(option.notFitted).toEqual({
			kinds: ['yoga-mobility'],
			room: 'days',
		})
		expect(option.week.minutes).toBe(180)
	}
	// One more day, and it comes in.
	const roomier = start({
		level: 'beginner',
		hours: 3,
		days: [0, 2, 4, 6],
		activities: ['climb', 'yoga-mobility'],
	})
	expect(roomier.options[0]!.notFitted).toBeNull()
})

test('an activity the hours cannot hold is named, with more time as what makes room, and the sport keeps its hour', () => {
	const made = start({ hours: 2.5, activities: ['hike'] })
	for (const option of made.options) {
		expect(option.draft.simpleActivities).toEqual([])
		expect(option.notFitted).toEqual({ kinds: ['hike'], room: 'hours' })
		expect(option.week.minutes).toBe(150)
	}
	const enough = start({ hours: 3, activities: ['hike'] })
	expect(enough.options[0]!.notFitted).toBeNull()
	expect(enough.options[0]!.week.minutes).toBe(180)
})

test('the level’s session cap is a total across the tracks: a beginner gets four sessions, activities counted', () => {
	const made = start({
		level: 'beginner',
		hours: 4,
		days: [0, 1, 2, 3, 4, 5, 6],
		activities: ['climb', 'yoga-mobility', 'hike'],
	})
	for (const option of made.options) {
		expect(option.week.sessionCount).toBe(4)
		expect(option.draft.simpleActivities.map((a) => a.kind)).toEqual([
			'climb',
			'yoga-mobility',
		])
		expect(option.notFitted).toEqual({ kinds: ['hike'], room: 'days' })
	}
	expect(made.capped).toBe(true)
})

test('with no endurance sport there is one simple week, the activities spread over it, adding up to the hours', () => {
	const made = start({
		discipline: null,
		activities: ['climb', 'yoga-mobility'],
		hours: 4,
		days: [0, 1, 2, 3, 4],
	})
	expect(made.simpleOnly).toBe(true)
	expect(made.options).toHaveLength(1)
	expect(made.merged).toBe(0)
	const [option] = made.options
	expect(option!.draft.tracks.map((track) => track.discipline)).toEqual([
		'other',
	])
	expect(option!.week.minutes).toBe(240)
	expect(option!.shortOfHours).toBeNull()
	const laid = simpleSessions(option!)
	// In proportion to their own times, 90 to 30, in five-minute steps.
	expect(laid.map(({ title, minutes }) => [title, minutes])).toEqual([
		['Klatring', 180],
		['Yoga og bevegelighet', 60],
	])
	// Not side by side: a rest day at least between them.
	expect(Math.abs(laid[0]!.weekday - laid[1]!.weekday)).toBeGreaterThan(1)
	expect(option!.week.hardSessions).toBe(0)
})

test('with no endurance sport and no activity, there is nothing to lay', () => {
	expect(
		draftStart({
			level: 'recreational',
			discipline: null,
			activities: [],
			hours: 5,
			days: [0, 2],
			startWeekKey: START,
		}),
	).toBeNull()
})

test('the start’s Simple Activities are planned with a time and an Effort Word, never a zone', () => {
	for (const kind of ACTIVITY_KINDS) {
		expect(SIMPLE_ACTIVITY_DEFAULTS[kind].minutes).toBeGreaterThan(0)
		expect(['rolig', 'middels', 'hard']).toContain(
			SIMPLE_ACTIVITY_DEFAULTS[kind].effortWord,
		)
		const option = start({ activities: [kind] }).options[0]!
		expect(simpleSessions(option).map((session) => session.title)).toEqual([
			TITLE[kind],
		])
		for (const session of option.draft.weeks[0]!.sessions) {
			if (session.trackId !== option.draft.tracks.at(-1)!.trackId) continue
			expect(session.zone).toBeNull()
		}
	}
})
