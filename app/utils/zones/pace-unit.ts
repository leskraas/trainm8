import { type IntensityTarget } from '../workout-schema.ts'

/**
 * The target kinds the resolver hands back in sec/km whatever the discipline:
 * a `pace` target is authored in sec/km, and `pacePct`/`racePace` are read off
 * a sec/km anchor. A recipe band on `css` (a `zoneLabel` or `lactate` target)
 * resolves in sec/100 m already.
 */
const SEC_PER_KM_KINDS: ReadonlySet<IntensityTarget['kind']> = new Set<
	IntensityTarget['kind']
>(['pace', 'pacePct', 'racePace'])

/**
 * A resolved pace in the unit its discipline's distance runs in: sec/100 m for
 * swim, sec/km for everything else. A swim step's sec/km target is divided by
 * ten (1 km = 10 × 100 m) rather than read as sec/100 m (#613).
 */
export function paceInDistanceUnit(
	paceSec: number,
	discipline: string | null | undefined,
	targetKind: IntensityTarget['kind'] | null | undefined,
): number {
	if (discipline === 'swim' && targetKind && SEC_PER_KM_KINDS.has(targetKind)) {
		return paceSec / 10
	}
	return paceSec
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
