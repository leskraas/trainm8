import { expect, test } from 'vitest'
import {
	CATALOGUE_CORPUS,
	stockEntryId,
	stockWorkoutId,
} from '../catalogue-corpus.all.ts'
import { PERIODIZATION_PRESETS, presetFor } from '../plan-outline/presets.ts'
import {
	cataloguePhaseFor,
	generateDeterministicSeason,
	mixZones,
	slotsForWeek,
	strengthUnavailable,
} from './deterministic.ts'
import { type RetrievableEntry } from './retrieval.ts'
import { type SeasonRequest } from './season.ts'

/** The shipped corpus, in the shape retrieval reads — the real rows, no database. */
const CORPUS: RetrievableEntry[] = CATALOGUE_CORPUS.map((session) => ({
	entryId: stockEntryId(session.key),
	workoutId: stockWorkoutId(session.key),
	title: session.title,
	description: session.description,
	discipline: session.discipline,
	authorship: 'system',
	archetype: session.archetype,
	level: session.level,
	phases: session.phases,
	goalEvents: session.goalEvents,
	citationAuthor: session.citation?.author ?? null,
	citationWork: session.citation?.work ?? null,
	citationYear: session.citation?.year ?? null,
	citationLocator: session.citation?.locator ?? null,
}))

function request(overrides: Partial<SeasonRequest> = {}): SeasonRequest {
	return {
		presetKey: 'classic-linear',
		startWeekKey: '2026-01-05',
		eventWeekKey: '2026-05-11',
		tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
		strengthDisciplines: [],
		trainableWeekdays: null,
		goalEvent: '10k',
		intent: 'deliberately-building',
		weeklyCapacityHours: 6,
		...overrides,
	}
}

test('the same request produces the same season, twice', () => {
	const first = generateDeterministicSeason(request(), CORPUS)
	const second = generateDeterministicSeason(request(), CORPUS)
	expect(second).toEqual(first)
	// Not merely the same set: the same array, in the same order.
	expect(second.sessions.map((s) => s.entryId)).toEqual(
		first.sessions.map((s) => s.entryId),
	)
})

test('the corpus arriving in a different order changes nothing', () => {
	const plain = generateDeterministicSeason(request(), CORPUS)
	const reversed = generateDeterministicSeason(request(), [...CORPUS].reverse())
	expect(reversed.sessions).toEqual(plain.sessions)
})

test('the request is not mutated, so two calls on one object cannot diverge', () => {
	const input = request()
	const snapshot = structuredClone(input)
	generateDeterministicSeason(input, CORPUS)
	expect(input).toEqual(snapshot)
})

test('a season spans the shape it was given, week for week', () => {
	const season = generateDeterministicSeason(request(), CORPUS)
	const preset = presetFor('classic-linear')
	expect(season.weeks).toHaveLength(
		preset.phases.reduce((total, phase) => total + phase.weeks, 0),
	)
	expect(season.weeks[0]!.weekKey).toBe('2026-01-05')
	expect(season.weeks[1]!.weekKey).toBe('2026-01-12')
	expect(season.phases.map((phase) => phase.name)).toEqual([
		'Base',
		'Build',
		'Peak',
		'Taper',
	])
})

test('every placed session carries a provenance, and none is unsourced', () => {
	const season = generateDeterministicSeason(request(), CORPUS)
	expect(season.sessions.length).toBeGreaterThan(0)
	for (const session of season.sessions) {
		expect(session.provenance.kind).not.toBe('unsourced')
	}
})

test('generation places no community row', () => {
	const community: RetrievableEntry = {
		...CORPUS[0]!,
		entryId: 'e_aaa_community',
		workoutId: 'w_community',
		authorship: 'athlete',
		archetype: 'easy',
		phases: [],
		goalEvents: [],
		level: null,
	}
	const season = generateDeterministicSeason(request(), [community, ...CORPUS])
	expect(
		season.sessions.filter((s) => s.provenance.kind === 'community'),
	).toEqual([])
})

test('a strength Discipline is an Unavailable Metric, never a fabricated track', () => {
	const season = generateDeterministicSeason(
		request({ strengthDisciplines: ['strength'] }),
		CORPUS,
	)
	expect(season.unavailable).toEqual([
		{ reading: 'strength-track', discipline: 'strength' },
	])
	// The endurance tracks generated; the strength one is empty and named.
	expect(season.tracks.map((track) => track.discipline)).toEqual(['run'])
	expect(season.sessions.every((s) => s.discipline === 'run')).toBe(true)
})

test('no shipped preset carries a strength segment, which is why it is Unavailable', () => {
	// The constraint the Unavailable rests on, asserted against what actually
	// ships rather than restated in prose: a preset has no strength arm at all,
	// so `startWeekKey`, `weeks`, `goal` and `sessionsPerWeek` have no source.
	for (const preset of PERIODIZATION_PRESETS) {
		for (const phase of preset.phases) {
			expect(Object.keys(phase)).not.toContain('strength')
			expect(Object.keys(phase)).not.toContain('sessionsPerWeek')
		}
	}
	expect(strengthUnavailable([])).toEqual([])
})

test('a Catalogue phase is read off the block position, never off its name', () => {
	const shape = [
		{ tapers: false },
		{ tapers: false },
		{ tapers: false },
		{ tapers: true },
	]
	expect(shape.map((_, index) => cataloguePhaseFor(shape, index))).toEqual([
		'base',
		'build',
		'peak',
		'taper',
	])
	// A season that never sharpens is base throughout its one block.
	expect(cataloguePhaseFor([{ tapers: false }], 0)).toBe('base')
})

test('quality sessions land only in loading weeks', () => {
	const days = [
		{ role: 'ordinary' as const },
		{ role: 'ordinary' as const },
		{ role: 'long' as const },
	]
	expect(
		slotsForWeek(days, [4, 4], { isFinalWeek: false, isLoadingWeek: true }),
	).toEqual([
		{ slot: 'quality', zone: 4 },
		{ slot: 'quality', zone: 4 },
		{ slot: 'long', zone: null },
	])
	expect(
		slotsForWeek(days, [4, 4], { isFinalWeek: false, isLoadingWeek: false }),
	).toEqual([
		{ slot: 'ordinary', zone: null },
		{ slot: 'ordinary', zone: null },
		{ slot: 'long', zone: null },
	])
})

test('the final week is race week for every day of it', () => {
	const days = [{ role: 'ordinary' as const }, { role: 'long' as const }]
	expect(
		slotsForWeek(days, [5], { isFinalWeek: true, isLoadingWeek: true }),
	).toEqual([
		{ slot: 'race-week', zone: null },
		{ slot: 'race-week', zone: null },
	])
	const season = generateDeterministicSeason(request(), CORPUS)
	const lastWeek = season.weeks.at(-1)!
	const placed = season.sessions.filter(
		(s) => s.weekIndex === lastWeek.weekIndex,
	)
	expect(placed.length).toBeGreaterThan(0)
	expect(placed.every((s) => s.slot === 'race-week')).toBe(true)
})

test('a recovery week keeps its rhythm: the 4th week of a 3:1 base carries no quality', () => {
	const season = generateDeterministicSeason(request(), CORPUS)
	const recovery = season.weeks.find((week) => week.role === 'recovery')!
	expect(recovery.weekIndex).toBe(3)
	const placed = season.sessions.filter(
		(s) => s.weekIndex === recovery.weekIndex,
	)
	expect(placed.every((s) => s.slot !== 'quality')).toBe(true)
})

test('the mix expands ascending by zone, the order every other surface states it in', () => {
	expect(mixZones(presetFor('classic-linear'), 2)).toEqual([4, 5])
	expect(mixZones(presetFor('classic-linear'), 3)).toEqual([])
})

test('a track with no Season Anchor prices every week Unavailable and still retrieves', () => {
	const season = generateDeterministicSeason(
		request({
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: null }],
		}),
		CORPUS,
	)
	expect(season.weeks.every((week) => week.targets[0]!.value == null)).toBe(
		true,
	)
	expect(season.sessions.length).toBeGreaterThan(0)
})

test('the weekly volume climbs across a block and drops in its recovery week', () => {
	const season = generateDeterministicSeason(request(), CORPUS)
	const value = (index: number) => season.weeks[index]!.targets[0]!.value!
	expect(value(0)).toBe(40)
	expect(value(1)).toBeGreaterThan(value(0))
	expect(value(3)).toBeLessThan(value(2))
})

test('a slot the corpus has nothing for is stated, not backfilled', () => {
	// One easy row and nothing else: every quality and long slot goes unfilled and
	// says which archetypes it wanted.
	const thin = CORPUS.filter(
		(entry) => entry.discipline === 'run' && entry.archetype === 'easy',
	)
	const season = generateDeterministicSeason(request(), thin)
	expect(season.unfilled.length).toBeGreaterThan(0)
	const quality = season.unfilled.find((slot) => slot.zone === 3)
	expect(quality?.archetypes).toContain('tempo')
	const threshold = season.unfilled.find((slot) => slot.zone === 4)
	expect(threshold?.archetypes).toContain('threshold')
	expect(season.sessions.every((s) => s.archetype === 'easy')).toBe(true)
})

test('an athlete with no availability gets the stated default, and it says so', () => {
	expect(generateDeterministicSeason(request(), CORPUS).weekdaySource).toBe(
		'default',
	)
	const own = generateDeterministicSeason(
		request({ trainableWeekdays: [1, 2, 4, 6] }),
		CORPUS,
	)
	expect(own.weekdaySource).toBe('availability')
})

test('an athlete who says they train on no days gets no sessions, not invented ones', () => {
	const season = generateDeterministicSeason(
		request({ trainableWeekdays: [] }),
		CORPUS,
	)
	expect(season.sessions).toEqual([])
	// The season itself is still produced: the shape and its weeks are real.
	expect(season.weeks.length).toBeGreaterThan(0)
})

test('the intent picks the level floor as a stated convention, and never advanced', () => {
	expect(
		generateDeterministicSeason(request({ intent: 'first-season' }), CORPUS)
			.levelFloor,
	).toBe('beginner')
	expect(
		generateDeterministicSeason(
			request({ intent: 'returning-from-injury' }),
			CORPUS,
		).levelFloor,
	).toBe('beginner')
	expect(
		generateDeterministicSeason(
			request({ intent: 'deliberately-building' }),
			CORPUS,
		).levelFloor,
	).toBe('intermediate')
})

test('every shipped shape generates a season without throwing', () => {
	for (const preset of PERIODIZATION_PRESETS) {
		const season = generateDeterministicSeason(
			request({ presetKey: preset.key }),
			CORPUS,
		)
		expect(season.weeks.length).toBeGreaterThan(0)
		expect(season.generatorId).toBe('deterministic-v1')
	}
})

test('a bike season retrieves, though no cycling row is scoped by goal event', () => {
	const season = generateDeterministicSeason(
		request({
			tracks: [{ discipline: 'bike', currency: 'hours', anchorValue: 6 }],
			goalEvent: null,
		}),
		CORPUS,
	)
	expect(season.sessions.length).toBeGreaterThan(0)
	expect(season.sessions.every((s) => s.discipline === 'bike')).toBe(true)
})
