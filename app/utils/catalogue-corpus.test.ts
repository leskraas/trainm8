import { describe, expect, test } from 'vitest'
import { CATALOGUE_CORPUS } from './catalogue-corpus.all.ts'
import { HAND_WRITTEN_NOTICE } from './catalogue-corpus.ts'
import {
	CATALOGUE_GOAL_EVENTS,
	CATALOGUE_LEVELS,
	CATALOGUE_PHASES,
	SESSION_ARCHETYPES,
	readCitation,
} from './catalogue.ts'
import { RUN_CORPUS } from './catalogue-corpus.run.ts'
import {
	WORKOUT_INTENTS,
	WorkoutStructureSchema,
	blockRepeatTotal,
} from './workout-schema.ts'

describe('every corpus row is structurally valid', () => {
	test.each(CATALOGUE_CORPUS.map((s) => [s.key, s] as const))(
		'%s parses as a Workout structure',
		(_key, session) => {
			const parsed = WorkoutStructureSchema.safeParse({
				discipline: session.discipline,
				blocks: session.blocks,
			})
			expect(parsed.success ? null : parsed.error.issues).toBeNull()
		},
	)
})

test('every row states a vocabulary the schema knows', () => {
	for (const session of CATALOGUE_CORPUS) {
		expect(SESSION_ARCHETYPES).toContain(session.archetype)
		expect(WORKOUT_INTENTS).toContain(session.intent)
		if (session.level != null) expect(CATALOGUE_LEVELS).toContain(session.level)
		for (const phase of session.phases) expect(CATALOGUE_PHASES).toContain(phase)
		for (const goal of session.goalEvents)
			expect(CATALOGUE_GOAL_EVENTS).toContain(goal)
	}
})

test('keys and titles are unique — the seed is keyed on one and read by the other', () => {
	const keys = CATALOGUE_CORPUS.map((s) => s.key)
	const titles = CATALOGUE_CORPUS.map((s) => s.title)
	expect(new Set(keys).size).toBe(keys.length)
	expect(new Set(titles).size).toBe(titles.length)
})

test('a progression edge names a row that exists', () => {
	const keys = new Set(CATALOGUE_CORPUS.map((s) => s.key))
	for (const session of CATALOGUE_CORPUS) {
		if (session.progressesTo) expect(keys).toContain(session.progressesTo)
		if (session.regressesTo) expect(keys).toContain(session.regressesTo)
		expect(session.progressesTo).not.toBe(session.key)
		expect(session.regressesTo).not.toBe(session.key)
	}
})

describe('provenance and citation are the same statement', () => {
	test('a corpus row carries a whole Citation', () => {
		for (const session of CATALOGUE_CORPUS) {
			if (session.provenance !== 'corpus') continue
			expect(session.citation, session.key).not.toBeNull()
			// Whole, not a fragment: `readCitation` reports a partial one as absent
			// and the schema's CHECK would reject it outright.
			expect(
				readCitation({
					citationAuthor: session.citation!.author,
					citationWork: session.citation!.work,
					citationYear: session.citation!.year,
					citationLocator: session.citation!.locator,
				}),
				session.key,
			).not.toBeNull()
			expect(session.citation!.author.trim().length).toBeGreaterThan(0)
			expect(session.citation!.work.trim().length).toBeGreaterThan(0)
		}
	})

	test('a hand-written row claims no source and says so', () => {
		for (const session of CATALOGUE_CORPUS) {
			if (session.provenance !== 'hand-written') continue
			expect(session.citation, session.key).toBeNull()
			expect(session.description, session.key).toContain(HAND_WRITTEN_NOTICE)
		}
	})
})

describe('the running corpus is the research corpus, hole included', () => {
	test('archetypes A–H seed all 46 tabled rows', () => {
		const transcribed = RUN_CORPUS.filter((s) => s.provenance === 'corpus')
		expect(transcribed).toHaveLength(46)
	})

	/**
	 * `docs/research/README.md` advertises "46 sessions across 9 archetypes" and
	 * the tables cover eight. The ninth is written rather than retrieved, and the
	 * Catalogue must never quietly hold eight while claiming nine — so the rows
	 * that close the hole are pinned here, by the phases they exist to cover.
	 */
	test('archetype I is present, hand-written, and covers taper and race week', () => {
		const handWritten = RUN_CORPUS.filter(
			(s) => s.provenance === 'hand-written',
		)
		expect(handWritten.map((s) => s.key)).toEqual([
			'run-I1',
			'run-I2',
			'run-I3',
		])
		const phases = new Set(handWritten.flatMap((s) => s.phases))
		expect(phases).toContain('taper')
		expect(phases).toContain('race-week')
	})

	test('nothing outside archetype I is hand-written', () => {
		const handWrittenKeys = CATALOGUE_CORPUS.filter(
			(s) => s.provenance === 'hand-written',
		).map((s) => s.key)
		for (const key of handWrittenKeys) expect(key).toMatch(/-I\d+$/)
	})

	/**
	 * Billat 30/30's anchor is `% vVO2max`, which no `IntensityTarget` kind
	 * expresses. The work bout therefore states no intensity at all rather than
	 * borrowing a different anchor family — an **Unavailable Metric**, and the
	 * one deliberate absence in the corpus.
	 */
	test('an unexpressible anchor is left absent, not substituted', () => {
		const billat = RUN_CORPUS.find((s) => s.key === 'run-D3')!
		const work = billat.blocks[1]!.steps[0]!
		expect(work.kind).toBe('cardio')
		expect('intensity' in work ? work.intensity : undefined).toBeUndefined()
		expect(billat.description).toContain('vVO2max')
	})

	test('an outer series is a series, so its reps are counted twice over', () => {
		const ladder = RUN_CORPUS.find((s) => s.key === 'run-D6')!
		expect(blockRepeatTotal(ladder.blocks[1]!)).toBe(2)
	})
})

test('a Catalogue row never ships an absolute send-off', () => {
	// `8 × 100 @ 1:40` is a moderate set at 1:20/100 m and impossible at
	// 2:10/100 m — a shared corpus ships anchored send-offs only.
	for (const session of CATALOGUE_CORPUS) {
		for (const block of session.blocks) {
			if (block.sendOff) expect(block.sendOff.kind).toBe('anchored')
		}
	}
})
