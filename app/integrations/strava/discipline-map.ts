/**
 * Maps a Strava activity type to a trainm8 Discipline. This table is private to
 * the Strava integration (ADR 0014) — each provider owns its own mapping.
 *
 * Anything trainm8 does not model as a first-class discipline collapses to
 * `'other'` (CONTEXT.md): hikes, yoga, e-bike rides, alpine ski, etc. Imports
 * marked `'other'` do not auto-promote and do not contribute to TSS or Training
 * Load.
 *
 * Strava activity `type`/`sport_type` reference:
 * https://developers.strava.com/docs/reference/#api-models-ActivityType
 */
export type Discipline = 'run' | 'bike' | 'swim' | 'strength' | 'other'

const STRAVA_TYPE_TO_DISCIPLINE: Record<string, Discipline> = {
	// Run family
	Run: 'run',
	TrailRun: 'run',
	VirtualRun: 'run',

	// Bike family (real, modeled rides; EBike is intentionally 'other')
	Ride: 'bike',
	GravelRide: 'bike',
	MountainBikeRide: 'bike',
	VirtualRide: 'bike',

	// Swim
	Swim: 'swim',

	// Strength
	WeightTraining: 'strength',
	Workout: 'strength',
	Crossfit: 'strength',
}

/**
 * Resolve a Strava `sport_type` (preferred) or legacy `type` to a Discipline.
 * Unknown or unmodeled types fall back to `'other'`.
 */
export function stravaTypeToDiscipline(stravaType: string): Discipline {
	return STRAVA_TYPE_TO_DISCIPLINE[stravaType] ?? 'other'
}
