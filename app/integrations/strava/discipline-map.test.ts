import { expect, test } from 'vitest'
import { stravaTypeToDiscipline } from './discipline-map.ts'

test('maps modeled Strava types to disciplines', () => {
	expect(stravaTypeToDiscipline('Run')).toBe('run')
	expect(stravaTypeToDiscipline('TrailRun')).toBe('run')
	expect(stravaTypeToDiscipline('Ride')).toBe('bike')
	expect(stravaTypeToDiscipline('MountainBikeRide')).toBe('bike')
	expect(stravaTypeToDiscipline('Swim')).toBe('swim')
	expect(stravaTypeToDiscipline('WeightTraining')).toBe('strength')
})

test('collapses unmodeled types to "other"', () => {
	// Hike, Yoga, EBike etc. are not modeled disciplines (CONTEXT.md).
	expect(stravaTypeToDiscipline('Hike')).toBe('other')
	expect(stravaTypeToDiscipline('Yoga')).toBe('other')
	expect(stravaTypeToDiscipline('EBikeRide')).toBe('other')
	expect(stravaTypeToDiscipline('AlpineSki')).toBe('other')
	expect(stravaTypeToDiscipline('SomethingBrandNew')).toBe('other')
})
