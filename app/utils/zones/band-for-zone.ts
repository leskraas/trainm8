import { type TrainingZone } from '../session-profile.ts'
import { type ZoneBand, type ZoneRecipe } from './types.ts'

/**
 * The band the recipe declares for `zone`, or the nearest declared band with the
 * substitution named.
 *
 * Absence of a declaration is a **positive statement** (ADR 0045 §3), of two
 * kinds: Daniels' `R` and Stryd's `Z5` are neuromuscular and are not positions on
 * this axis at all, while `css-3` declares no 3 and no 5 because three bands
 * cannot express five zones. Either way a consumer substitutes and *says so*.
 *
 * Ties break toward the band nearest zone 4, then toward the lower zone. A
 * quality session read down into an aerobic band would make the mix nearly
 * invisible in the reading, which is the whole point of a mix-aware conversion;
 * threshold is the honest place to land, and where that is not the tie-breaker
 * conservative is (§3).
 *
 * It lives beside the recipes rather than in the Volume Conversion because the
 * resolver reads a canonical zone label through it too (#614).
 */
export function bandForZone(
	recipe: ZoneRecipe,
	zone: TrainingZone,
): { band: ZoneBand; declaredZone: TrainingZone; substituted: boolean } | null {
	const declared = recipe.zones.flatMap((band) =>
		band.zone == null ? [] : [{ band, declaredZone: band.zone }],
	)
	if (declared.length === 0) return null

	// The first band declaring the zone, not the last: `coggan-power-7` declares 5
	// three times (Z5, Z6, Z7) and Z5 is the VO₂ max band the ladder means.
	const exact = declared.find((entry) => entry.declaredZone === zone)
	if (exact) return { ...exact, substituted: false }

	const nearest = declared.reduce((best, entry) =>
		substitutionRank(entry.declaredZone, zone) <
		substitutionRank(best.declaredZone, zone)
			? entry
			: best,
	)
	return { ...nearest, substituted: true }
}

/** Lower sorts first: nearest the requested zone, then nearest threshold, then lower. */
function substitutionRank(declared: TrainingZone, requested: TrainingZone) {
	return (
		Math.abs(declared - requested) * 100 +
		Math.abs(declared - 4) * 10 +
		declared
	)
}
