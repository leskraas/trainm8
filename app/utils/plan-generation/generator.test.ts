import { expect, test } from 'vitest'
import { DETERMINISTIC_GENERATOR_ID } from './deterministic.ts'
import {
	DETERMINISTIC_SEASON_GENERATOR,
	generateSeason,
	type SeasonGenerator,
} from './generator.ts'
import { type RetrievableEntry } from './retrieval.ts'
import { type GeneratedSeason, type SeasonRequest } from './season.ts'

const REQUEST: SeasonRequest = {
	presetKey: 'masters-2-1-short',
	startWeekKey: '2026-01-05',
	eventWeekKey: '2026-03-30',
	tracks: [{ discipline: 'run', currency: 'km', anchorValue: 30 }],
	strengthDisciplines: ['strength'],
	trainableWeekdays: null,
	goalEvent: null,
	intent: 'first-season',
	weeklyCapacityHours: null,
}

test('the seam produces a payload through the deterministic implementation by default', () => {
	const season = generateSeason(REQUEST, [])
	expect(season.generatorId).toBe(DETERMINISTIC_GENERATOR_ID)
	expect(season.presetKey).toBe('masters-2-1-short')
	// The implementation behind the seam is the real one, not a stub: it produces
	// a whole season, and it declines the strength track by name.
	expect(season.weeks.length).toBeGreaterThan(0)
	expect(season.unavailable).toEqual([
		{ reading: 'strength-track', discipline: 'strength' },
	])
})

test('a second implementation is substitutable without touching any caller', () => {
	// What a model implementation will be, minus the model: the seam's contract is
	// a request and a corpus in, one typed payload out.
	const calls: Array<{ request: SeasonRequest; corpus: number }> = []
	const stub: SeasonGenerator = {
		id: 'stub',
		generate(request, corpus): GeneratedSeason {
			calls.push({ request, corpus: corpus.length })
			return {
				generatorId: 'stub',
				presetKey: request.presetKey,
				startWeekKey: request.startWeekKey,
				eventWeekKey: request.eventWeekKey,
				phases: [],
				tracks: request.tracks,
				weeks: [],
				sessions: [],
				unfilled: [],
				unavailable: [],
				weekdaySource: 'default',
				levelFloor: 'beginner',
				goalEvent: null,
			}
		},
	}
	const corpus: RetrievableEntry[] = []
	expect(generateSeason(REQUEST, corpus, stub).generatorId).toBe('stub')
	expect(calls).toEqual([{ request: REQUEST, corpus: 0 }])
})

test('the shipped generator names itself', () => {
	expect(DETERMINISTIC_SEASON_GENERATOR.id).toBe(DETERMINISTIC_GENERATOR_ID)
})
