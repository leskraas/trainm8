import { type PaceUnit } from './resolve.ts'

/** A pace given in one unit, in another: 1 km is 10 × 100 m. */
export function paceIn(paceSec: number, from: PaceUnit, to: PaceUnit): number {
	if (from === to) return paceSec
	return from === 'secPerKm' ? paceSec / 10 : paceSec * 10
}

/**
 * A resolved pace in the unit its discipline's distance runs in: sec/100 m for
 * swim, sec/km for everything else. `unit` is the one the resolver handed the
 * pace back in (`ResolvedIntensity.paceUnit`), so a swim pace it gave per km is
 * divided by ten rather than read as sec/100 m (#613); null for a pace already
 * in the discipline's unit (a threshold read straight off the profile).
 */
export function paceInDistanceUnit(
	paceSec: number,
	discipline: string | null | undefined,
	unit: PaceUnit | null | undefined,
): number {
	const distanceUnit: PaceUnit =
		discipline === 'swim' ? 'secPer100m' : 'secPerKm'
	return unit ? paceIn(paceSec, unit, distanceUnit) : paceSec
}

/** The seconds a distance takes at a resolved pace (see `paceInDistanceUnit`). */
export function distanceDurationSec(
	distanceM: number,
	paceSec: number,
	discipline: string | null | undefined,
	unit: PaceUnit | null | undefined,
): number {
	const pace = paceInDistanceUnit(paceSec, discipline, unit)
	return discipline === 'swim'
		? (distanceM / 100) * pace
		: (distanceM / 1000) * pace
}
