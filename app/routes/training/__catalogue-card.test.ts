import { expect, test } from 'vitest'
import {
	CONVENTION_NOTICE,
	HAND_WRITTEN_NOTICE,
} from '#app/utils/catalogue-corpus.ts'
import { buildCatalogueCard, catalogueBlurb } from './__catalogue-card.ts'

test('the prose loses its markdown asterisks, not its words', () => {
	expect(
		catalogueBlurb('Builds by *shrinking the recovery*, not the **result**.'),
	).toBe('Builds by shrinking the recovery, not the result.')
})

test('a notice the provenance slot already states is not said twice', () => {
	expect(catalogueBlurb(`${CONVENTION_NOTICE} Run it easy.`)).toBe(
		'Run it easy.',
	)
	expect(catalogueBlurb(HAND_WRITTEN_NOTICE)).toBeNull()
	expect(catalogueBlurb('   ')).toBeNull()
	expect(catalogueBlurb(null)).toBeNull()
})

const intervals = {
	discipline: 'run',
	blocks: [
		{
			orderIndex: 0,
			repeatCount: 1,
			steps: [
				{
					kind: 'cardio',
					orderIndex: 0,
					discipline: 'run',
					intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z2' }),
					durationSec: 600,
					distanceM: null,
					sets: [],
				},
			],
		},
		{
			orderIndex: 1,
			repeatCount: 5,
			steps: [
				{
					kind: 'cardio',
					orderIndex: 0,
					discipline: 'run',
					intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z4' }),
					durationSec: 180,
					distanceM: null,
					sets: [],
				},
				{
					kind: 'rest',
					orderIndex: 1,
					discipline: 'run',
					intensity: null,
					durationSec: 60,
					distanceM: null,
					sets: [],
				},
			],
		},
	],
}

test('a card leads with the session: its sentence, then minutes and the level', () => {
	const card = buildCatalogueCard({
		workout: intervals,
		level: 'Viderekommen',
	})
	expect(card.sentence).toContain('5 ×')
	// 10 min + 5 × (3 + 1) min = 30 min; no step states a distance, so no km.
	expect(card.figures).toEqual(['30 min', 'Viderekommen og opp'])
})

test('a run that states its distance says its km first', () => {
	const card = buildCatalogueCard({
		workout: {
			discipline: 'run',
			blocks: [
				{
					orderIndex: 0,
					repeatCount: 1,
					steps: [
						{
							kind: 'cardio',
							orderIndex: 0,
							discipline: 'run',
							intensity: null,
							durationSec: 3000,
							distanceM: 10000,
							sets: [],
						},
					],
				},
			],
		},
		level: null,
	})
	expect(card.figures).toEqual(['10 km', '50 min'])
})

test('a card with no structure says nothing rather than zeros', () => {
	expect(
		buildCatalogueCard({
			workout: { discipline: 'run', blocks: [] },
			level: null,
		}),
	).toEqual({ sentence: null, figures: [] })
})
