import { expect, test } from 'vitest'
import { CONVENTION_NOTICE } from '../catalogue-corpus.ts'
import {
	archetypesForSlot,
	matchesCriteria,
	retrieveSession,
	ZONE_ARCHETYPES,
	type RetrievableEntry,
} from './retrieval.ts'

function entry(overrides: Partial<RetrievableEntry> = {}): RetrievableEntry {
	return {
		entryId: 'stockentry_run-A1',
		workoutId: 'stock_run-A1',
		title: 'Easy run',
		description: `${CONVENTION_NOTICE} 45 min easy.`,
		discipline: 'run',
		authorship: 'system',
		archetype: 'easy',
		level: null,
		phases: [],
		goalEvents: [],
		citationAuthor: null,
		citationWork: null,
		citationYear: null,
		citationLocator: null,
		...overrides,
	}
}

const base = {
	discipline: 'run',
	cataloguePhase: 'base' as const,
	goalEvent: null,
	level: 'intermediate' as const,
}

test('an unscoped row matches every phase and every goal event', () => {
	expect(
		matchesCriteria(entry(), { ...base, archetype: 'easy', cataloguePhase: 'peak' }),
	).toBe(true)
	expect(
		matchesCriteria(entry(), { ...base, archetype: 'easy', goalEvent: 'marathon' }),
	).toBe(true)
})

test('a phase-scoped row matches only its phases', () => {
	const scoped = entry({ phases: ['taper', 'race-week'] })
	expect(matchesCriteria(scoped, { ...base, archetype: 'easy' })).toBe(false)
	expect(
		matchesCriteria(scoped, {
			...base,
			archetype: 'easy',
			cataloguePhase: 'race-week',
		}),
	).toBe(true)
})

test('a null goal event does not narrow — which is what keeps cycling retrievable', () => {
	// Cycling rows are unscoped by goal event (CATALOGUE_GOAL_EVENTS is running
	// distances only), and a bike Event names no distance the corpus scopes by.
	const bike = entry({ discipline: 'bike', goalEvents: [] })
	expect(
		matchesCriteria(bike, { ...base, discipline: 'bike', archetype: 'easy' }),
	).toBe(true)
	// And a goal-event-scoped run row is still reachable when nothing was asked.
	const run = entry({ goalEvents: ['5k', '10k'] })
	expect(matchesCriteria(run, { ...base, archetype: 'easy' })).toBe(true)
	expect(
		matchesCriteria(run, { ...base, archetype: 'easy', goalEvent: 'marathon' }),
	).toBe(false)
})

test('a level is a floor, so an advanced row is out of reach at intermediate', () => {
	expect(
		matchesCriteria(entry({ level: 'advanced' }), { ...base, archetype: 'easy' }),
	).toBe(false)
	expect(
		matchesCriteria(entry({ level: 'beginner' }), { ...base, archetype: 'easy' }),
	).toBe(true)
	expect(
		matchesCriteria(entry({ level: 'intermediate' }), {
			...base,
			archetype: 'easy',
			level: 'beginner',
		}),
	).toBe(false)
})

test('generation places no community row, however well it matches', () => {
	const community = entry({ authorship: 'athlete', entryId: 'e_community' })
	expect(matchesCriteria(community, { ...base, archetype: 'easy' })).toBe(false)
	expect(
		retrieveSession([community], {
			...base,
			archetypes: ['easy'],
			rotation: 0,
		}),
	).toBeNull()
})

test('a row that cannot say where it came from is never placed', () => {
	const unsourced = entry({ description: 'no notice, no citation' })
	expect(matchesCriteria(unsourced, { ...base, archetype: 'easy' })).toBe(false)
})

test('preference order is a cliff: the first archetype with any candidate wins', () => {
	const tempo = entry({ entryId: 'e_tempo', archetype: 'tempo' })
	const steady = entry({ entryId: 'e_steady', archetype: 'steady' })
	// Rotation 1 would be the second row of a blended pool; it is the *only* row
	// of the tempo pool instead, because `steady` is never consulted.
	const chosen = retrieveSession([steady, tempo], {
		...base,
		archetypes: ZONE_ARCHETYPES[3],
		rotation: 1,
	})
	expect(chosen?.entryId).toBe('e_tempo')
})

test('the choice is an index into a list sorted by entry id, so it is reproducible', () => {
	const rows = [
		entry({ entryId: 'e_c' }),
		entry({ entryId: 'e_a' }),
		entry({ entryId: 'e_b' }),
	]
	const picks = [0, 1, 2, 3, 4].map(
		(rotation) =>
			retrieveSession(rows, { ...base, archetypes: ['easy'], rotation })
				?.entryId,
	)
	expect(picks).toEqual(['e_a', 'e_b', 'e_c', 'e_a', 'e_b'])
	// Row order in the input is irrelevant: the sort is on the stable seeded id.
	const shuffled = [rows[1]!, rows[2]!, rows[0]!]
	expect(
		retrieveSession(shuffled, { ...base, archetypes: ['easy'], rotation: 1 })
			?.entryId,
	).toBe('e_b')
})

test('an empty corpus gives nothing rather than a substitute', () => {
	expect(
		retrieveSession([], { ...base, archetypes: ['easy'], rotation: 0 }),
	).toBeNull()
})

test('no quality zone can reach a neuromuscular or technique row', () => {
	// Zones order metabolic strain and sprint work has no position on the ladder
	// (ADR 0042 §7) — which is also what keeps the strength corpus, filed under
	// `neuromuscular` and `technique`, out of an endurance week.
	const reachable = new Set(Object.values(ZONE_ARCHETYPES).flat())
	expect(reachable.has('neuromuscular')).toBe(false)
	expect(reachable.has('technique')).toBe(false)
	for (const slot of ['long', 'ordinary', 'race-week'] as const) {
		for (const archetype of archetypesForSlot(slot, null)) {
			expect(['neuromuscular', 'technique']).not.toContain(archetype)
		}
	}
})

test('a quality slot with no zone asks for nothing', () => {
	expect(archetypesForSlot('quality', null)).toEqual([])
})
