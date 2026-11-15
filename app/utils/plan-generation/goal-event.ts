import { CATALOGUE_GOAL_EVENTS, type CatalogueGoalEvent } from '../catalogue.ts'
import { parseEventTarget } from '../event-schema.ts'
import { RACE_ANCHOR_DISTANCE_M, type RaceAnchor } from '../workout-schema.ts'

/**
 * The **Catalogue** goal event an Event names, or `null`.
 *
 * Only an **Event Target** of kind `distance` (or a `time` over a distance)
 * says a distance at all, and it is
 * matched **exactly** against the race anchors' metres — nothing rounds, so a
 * 4.8 km parkrun is not a 5k, on the rule `RACE_ANCHOR_DISTANCE_M` already states.
 * `trail` and `ultra` are in the vocabulary and are not produced here: no field on
 * an Event says a race is a trail race, and reading one off a distance would be a
 * guess wearing a filter's clothes.
 *
 * `null` does not narrow retrieval (see `matchesCriteria`), which is what keeps a
 * bike season — whose rows are unscoped by goal event — retrievable at all.
 */
export function goalEventFor(target: string | null): CatalogueGoalEvent | null {
	const parsed = parseEventTarget(target)
	// A finish time over a distance names the distance too.
	const meters =
		parsed?.kind === 'distance'
			? parsed.meters
			: parsed?.kind === 'time'
				? parsed.meters
				: undefined
	if (meters == null) return null
	for (const anchor of Object.keys(RACE_ANCHOR_DISTANCE_M) as RaceAnchor[]) {
		if (RACE_ANCHOR_DISTANCE_M[anchor] === meters) {
			return (CATALOGUE_GOAL_EVENTS as readonly string[]).includes(anchor)
				? (anchor as CatalogueGoalEvent)
				: null
		}
	}
	return null
}
