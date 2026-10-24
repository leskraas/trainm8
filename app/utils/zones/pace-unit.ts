import { type IntensityTarget } from '../workout-schema.ts'
import { resolvedPaceUnit } from './resolve.ts'

/**
 * A resolved pace in the unit its discipline's distance runs in: sec/100 m for
 * swim, sec/km for everything else. The resolver names the unit it handed the
 * pace back in (`resolvedPaceUnit`); a swim pace it gave per km is divided by
 * ten (1 km = 10 × 100 m) rather than read as sec/100 m (#613). Every swim
 * recipe is CSS-anchored, so a swim's band paces are per 100 m already.
 */
export function paceInDistanceUnit(
	paceSec: number,
	discipline: string | null | undefined,
	targetKind: IntensityTarget['kind'] | null | undefined,
): number {
	if (discipline !== 'swim') return paceSec
	return resolvedPaceUnit(targetKind, 'css') === 'secPerKm'
		? paceSec / 10
		: paceSec
}

/** The seconds a distance takes at a resolved pace (see `paceInDistanceUnit`). */
export function distanceDurationSec(
	distanceM: number,
	paceSec: number,
	discipline: string | null | undefined,
	targetKind: IntensityTarget['kind'] | null | undefined,
): number {
	const pace = paceInDistanceUnit(paceSec, discipline, targetKind)
	return discipline === 'swim'
		? (distanceM / 100) * pace
		: (distanceM / 1000) * pace
}
