import { expect, test } from 'vitest'
import { planStartAnswers, type PlanStartInputs } from './plan-start-options.ts'

// _Bytt treningsform_'s answers (#581): what the athlete keeps, read back as
// the start's answers.

const week = (weekKey: string, role: string, run: number) => ({
	weekKey,
	role,
	targets: [
		{ discipline: 'run', currency: 'hours', value: run },
		{ discipline: 'strength', currency: 'sets', value: 12 },
	],
})

const BASE: PlanStartInputs = {
	level: 'experienced',
	preferences: ['long'],
	tracks: [
		{ discipline: 'run', currency: 'hours', anchors: [] },
		{ discipline: 'bike', currency: 'hours', anchors: [] },
		{ discipline: 'strength', currency: 'sets', anchors: [] },
	],
	weeks: [
		week('2030-01-07', 'loading', 5),
		week('2030-01-14', 'recovery', 3),
		week('2030-01-21', 'loading', 5.5),
	],
	fromWeekKey: '2030-01-14',
	days: [0, 2, 4, 6],
	patternDays: [0, 4],
	activities: [],
	strength: null,
	capacityHours: 8,
}

test('the hours are the next hard week’s, not an easy week’s, from the week a switch begins', () => {
	expect(planStartAnswers(BASE)).toEqual({
		level: 'experienced',
		discipline: 'run',
		otherSports: ['bike'],
		activities: [],
		hours: 5.5,
		days: [0, 2, 4, 6],
		startWeekKey: '2030-01-14',
		strength: null,
		preferences: ['long'],
	})
})

test('a Simple Activity’s time is in the hours, as it is in the start', () => {
	const answers = planStartAnswers({
		...BASE,
		activities: [
			{ kind: 'climb', minutes: 90 },
			{ kind: 'climb', minutes: 90 },
		],
	})
	expect(answers?.activities).toEqual(['climb'])
	expect(answers?.hours).toBe(7)
})

test('days never said are the days the plan lays on, and an unsaid level is a mosjonist', () => {
	const answers = planStartAnswers({ ...BASE, days: [], level: null })
	expect(answers?.days).toEqual([0, 4])
	expect(answers?.level).toBe('recreational')
})

test('a plan that only lifts has no options to show', () => {
	expect(
		planStartAnswers({
			...BASE,
			tracks: [{ discipline: 'strength', currency: 'sets', anchors: [] }],
		}),
	).toBeNull()
})

test('a retired track is not one of the plan’s activities: its sport is never laid again', () => {
	const retired = (from: string) => [
		{ fromWeekKey: '2030-01-07', value: 2 },
		{ fromWeekKey: from, value: 0 },
	]
	const answers = planStartAnswers({
		...BASE,
		tracks: [
			{ discipline: 'run', currency: 'hours', anchors: [] },
			{ discipline: 'bike', currency: 'hours', anchors: retired('2030-01-14') },
			{
				discipline: 'other',
				currency: 'hours',
				anchors: retired('2030-01-14'),
			},
		],
		activities: [{ kind: 'climb', minutes: 90 }],
	})
	expect(answers?.otherSports).toEqual([])
	expect(answers?.activities).toEqual([])
	// Retired from a later week, it is still the plan's at this one.
	expect(
		planStartAnswers({
			...BASE,
			tracks: [
				{ discipline: 'run', currency: 'hours', anchors: [] },
				{
					discipline: 'bike',
					currency: 'hours',
					anchors: retired('2030-02-04'),
				},
			],
		})?.otherSports,
	).toEqual(['bike'])
})
