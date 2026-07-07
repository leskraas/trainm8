/**
 * Maps an Intervals.icu activity type to a trainm8 Discipline. This table is
 * private to the Intervals.icu integration (ADR 0014) — each provider owns its
 * own mapping, even where the vocabularies happen to overlap (Intervals.icu
 * reuses much of Strava's activity-type vocabulary, but the two must be free
 * to drift independently).
 *
 * Anything trainm8 does not model as a first-class discipline collapses to
 * `'other'` (ADR 0015, CONTEXT.md): yoga, hikes, e-bike rides, skiing, rowing,
 * etc. Imports marked `'other'` do not auto-promote and do not contribute to
 * TSS or Training Load.
 */
export type Discipline = 'run' | 'bike' | 'swim' | 'strength' | 'other'

const INTERVALSICU_TYPE_TO_DISCIPLINE: Record<string, Discipline> = {
	// Run family
	Run: 'run',
	TrailRun: 'run',
	VirtualRun: 'run',

	// Bike family (real, modeled rides; EBike is intentionally 'other')
	Ride: 'bike',
	GravelRide: 'bike',
	MountainBikeRide: 'bike',
	VirtualRide: 'bike',

	// Swim family
	Swim: 'swim',
	OpenWaterSwim: 'swim',

	// Strength family
	WeightTraining: 'strength',
	Workout: 'strength',
	Crossfit: 'strength',
}

/**
 * Resolve an Intervals.icu activity `type` to a Discipline. Unknown or
 * unmodeled types fall back to `'other'`.
 */
export function intervalsIcuTypeToDiscipline(icuType: string): Discipline {
	return INTERVALSICU_TYPE_TO_DISCIPLINE[icuType] ?? 'other'
}
