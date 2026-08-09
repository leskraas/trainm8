import { describe, expect, test } from 'vitest'
import { CATALOGUE_CORPUS } from './catalogue-corpus.all.ts'
import { RUN_CORPUS } from './catalogue-corpus.run.ts'
import { CONVENTION_NOTICE, HAND_WRITTEN_NOTICE } from './catalogue-corpus.ts'
import {
	CATALOGUE_GOAL_EVENTS,
	CATALOGUE_LEVELS,
	CATALOGUE_PHASES,
	SESSION_ARCHETYPES,
	readCitation,
} from './catalogue.ts'
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
	const unknown = CATALOGUE_CORPUS.flatMap((s) => [
		...(SESSION_ARCHETYPES.includes(s.archetype) ? [] : [`${s.key} archetype`]),
		...(WORKOUT_INTENTS.includes(s.intent) ? [] : [`${s.key} intent`]),
		...(s.level == null || CATALOGUE_LEVELS.includes(s.level)
			? []
			: [`${s.key} level`]),
		...s.phases
			.filter((p) => !CATALOGUE_PHASES.includes(p))
			.map((p) => `${s.key} phase ${p}`),
		...s.goalEvents
			.filter((g) => !CATALOGUE_GOAL_EVENTS.includes(g))
			.map((g) => `${s.key} goal ${g}`),
	])
	expect(unknown).toEqual([])
})

test('keys and titles are unique — the seed is keyed on one and read by the other', () => {
	const keys = CATALOGUE_CORPUS.map((s) => s.key)
	const titles = CATALOGUE_CORPUS.map((s) => s.title)
	expect(new Set(keys).size).toBe(keys.length)
	expect(new Set(titles).size).toBe(titles.length)
})

test('a progression edge names a row that exists', () => {
	const keys = new Set(CATALOGUE_CORPUS.map((s) => s.key))
	const dangling = CATALOGUE_CORPUS.flatMap((s) =>
		[s.progressesTo, s.regressesTo]
			.filter((target) => target != null)
			.filter((target) => !keys.has(target) || target === s.key)
			.map((target) => `${s.key} → ${target}`),
	)
	expect(dangling).toEqual([])
})

describe('provenance and citation are the same statement', () => {
	test('a corpus row carries a whole Citation', () => {
		// Whole, not a fragment: `readCitation` reports a partial one as absent
		// and the schema's CHECK would reject it outright.
		const broken = CATALOGUE_CORPUS.filter(
			(s) =>
				s.provenance === 'corpus' &&
				(s.citation == null ||
					readCitation({
						citationAuthor: s.citation.author,
						citationWork: s.citation.work,
						citationYear: s.citation.year,
						citationLocator: s.citation.locator,
					}) == null),
		).map((s) => s.key)
		expect(broken).toEqual([])
	})

	test('a hand-written row claims no source and says so', () => {
		const handWritten = CATALOGUE_CORPUS.filter(
			(s) => s.provenance === 'hand-written',
		)
		expect(handWritten.length).toBeGreaterThan(0)
		const wrong = handWritten
			.filter(
				(s) =>
					s.citation != null || !s.description.includes(HAND_WRITTEN_NOTICE),
			)
			.map((s) => s.key)
		expect(wrong).toEqual([])
	})

	/**
	 * The research's Source column says "coaching convention" or "standard
	 * practice" for a real minority of rows. Naming the nearest paper on those
	 * would put a citation on a session its author never wrote — the same failure
	 * ADR 0051 §4 makes structurally impossible for community content.
	 */
	test('a convention row claims no source and says so', () => {
		const convention = CATALOGUE_CORPUS.filter(
			(s) => s.provenance === 'convention',
		)
		expect(convention.length).toBeGreaterThan(0)
		const wrong = convention
			.filter(
				(s) => s.citation != null || !s.description.includes(CONVENTION_NOTICE),
			)
			.map((s) => s.key)
		expect(wrong).toEqual([])
	})
})

describe('the running corpus is the research corpus, hole included', () => {
	test('archetypes A–H seed all 46 tabled rows', () => {
		const tabled = RUN_CORPUS.filter((s) => s.provenance !== 'hand-written')
		expect(tabled).toHaveLength(46)
	})

	/**
	 * `docs/research/README.md` advertises "46 sessions across 9 archetypes" and
	 * the tables cover eight. The ninth is written rather than retrieved, and the
	 * Catalogue must never quietly hold eight while claiming nine — so the rows
	 * that close the hole are pinned here, by the phases they exist to cover.
	 */
	test('archetype I is present, hand-written, and covers taper and race week', () => {
		const handWritten = RUN_CORPUS.filter((s) => s.provenance === 'hand-written')
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
		expect(handWrittenKeys.filter((key) => !/-I\d+$/.test(key))).toEqual([])
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
	const absolute = CATALOGUE_CORPUS.filter((s) =>
		s.blocks.some((b) => b.sendOff != null && b.sendOff.kind !== 'anchored'),
	).map((s) => s.key)
	expect(absolute).toEqual([])
})
