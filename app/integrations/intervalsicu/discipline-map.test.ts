import { expect, test } from 'vitest'
import { intervalsIcuTypeToDiscipline } from './discipline-map.ts'

// Table-driven (#204): the mapping is data, so the test reads as the spec.
test.each([
	// Run family
	['Run', 'run'],
	['TrailRun', 'run'],
	['VirtualRun', 'run'],
	// Bike family (real, modeled rides; EBike is intentionally 'other')
	['Ride', 'bike'],
	['GravelRide', 'bike'],
	['MountainBikeRide', 'bike'],
	['VirtualRide', 'bike'],
	// Swim family
	['Swim', 'swim'],
	['OpenWaterSwim', 'swim'],
	// Strength family
	['WeightTraining', 'strength'],
	['Workout', 'strength'],
	['Crossfit', 'strength'],
] as const)('maps modeled type %s to %s', (icuType, discipline) => {
	expect(intervalsIcuTypeToDiscipline(icuType)).toBe(discipline)
})

test.each([
	// Unmodeled types collapse to 'other' (ADR 0015): import-only, never
	// auto-promoted, never feeding TSS or Training Load.
	'Yoga',
	'Hike',
	'Walk',
	'EBikeRide',
	'AlpineSki',
	'NordicSki',
	'Rowing',
	'SomethingBrandNew',
	'',
])('collapses unmodeled type %j to "other"', (icuType) => {
	expect(intervalsIcuTypeToDiscipline(icuType)).toBe('other')
})
