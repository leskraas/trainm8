import { expect, test } from 'vitest'
import { imageBlocksWithGradeBand } from './juster.server.ts'

type Blocks = Parameters<typeof imageBlocksWithGradeBand>[0]

/** One block of one cardio step, its grade columns as the image stored them. */
function imageWith(grade: Record<string, number | null>): Blocks {
	return [
		{
			name: null,
			orderIndex: 0,
			repeatCount: 1,
			seriesRepeatCount: 1,
			betweenSeriesRestSec: null,
			sendOff: null,
			steps: [
				{
					kind: 'cardio',
					notes: null,
					orderIndex: 0,
					discipline: 'run',
					intensity: null,
					durationSec: 90,
					distanceM: null,
					verticalM: null,
					cadenceRpmMin: null,
					cadenceRpmMax: null,
					rest: null,
					exerciseId: null,
					restBetweenSetsSec: null,
					intensityHrMin: null,
					intensityHrMax: null,
					intensityPowerMin: null,
					intensityPowerMax: null,
					intensityPaceMin: null,
					intensityPaceMax: null,
					sets: [],
					...grade,
				} as unknown as Blocks[number]['steps'][number],
			],
		},
	]
}

test('an image stored before grade was a band puts its grade back at both ends (#466)', () => {
	const [step] = imageBlocksWithGradeBand(imageWith({ gradePct: 4.5 }))[0]!
		.steps
	expect(step).toMatchObject({ gradePctMin: 4.5, gradePctMax: 4.5 })
})

test('an image stored since passes as it is', () => {
	const [step] = imageBlocksWithGradeBand(
		imageWith({ gradePctMin: 4, gradePctMax: 7 }),
	)[0]!.steps
	expect(step).toMatchObject({ gradePctMin: 4, gradePctMax: 7 })
})
