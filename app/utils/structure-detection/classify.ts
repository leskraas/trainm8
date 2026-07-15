import { type ActivityStream } from '../activity-stream.ts'
import { type IntensityTarget } from '../workout-schema.ts'
import {
	COGGAN_POWER_7,
	DANIELS_PACE_5,
	FRIEL_HR_5_BIKE,
	FRIEL_HR_5_RUN,
	getRecipe,
} from '../zones/index.ts'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import {
	type ZoneAnchor,
	type ZoneBand,
	type ZoneRecipe,
} from '../zones/types.ts'
import { type ClassifyChannel } from './constants.ts'
import { type DetectionDiscipline } from './types.ts'

/**
 * Zone classification for detection (ADR 0035): the *inverse* of authoring's
 * `deriveMetricTarget`. Authoring bakes a `zoneLabel → range` because there is no
 * measured number; detection *has* the measured value and places it in the band
 * that contains it, on the discipline's anchor channel — bike → power, run →
 * pace, HR only as a fallback. The zone label is a display-time derivation from
 * the stored concrete value, never persisted; so the engine stores the concrete
 * measured metric and only computes a *band index* internally (for the
 * band-separation honesty gate).
 */
export type Classifier = {
	/** Which channel intensity is read from — fixes the HR grade cap below. */
	channel: ClassifyChannel
	/**
	 * The hardness rank (zone index, easy→hard) of a measured value against the
	 * athlete's inverted recipe. Higher = harder. The band-separation gate reads
	 * the difference between the work and easy ranks.
	 */
	bandIndex: (value: number) => number
	/**
	 * The concrete measured **Intensity Target** to store for a segment — an
	 * absolute `power` (W) / `pace` (s/km) / `hrBpm`. The zone label is *not*
	 * stored; it is re-derived at display time through the athlete's current
	 * recipe (ADR 0035).
	 */
	measuredTarget: (value: number) => IntensityTarget
	/**
	 * True when intensity is classified on HR (the anchor threshold was missing
	 * and the ladder fell to HR). Caps Detection Confidence at `medium` (ADR
	 * 0024/0033) — HR lag and cardiac drift make the label shaky.
	 */
	hrCapped: boolean
	/**
	 * Value direction: pace/CSS are inverted (a *smaller* value is harder);
	 * power/HR are not. Lets the miner compare raw values by effort without
	 * re-deriving bands for every comparison.
	 */
	inverted: boolean
}

/** Parse the athlete's per-zone override ratios, tolerant of a malformed blob. */
function parseOverrides(
	json: string | null,
): Record<string, { minRatio: number; maxRatio?: number }> | null {
	if (!json) return null
	try {
		return JSON.parse(json) as Record<
			string,
			{ minRatio: number; maxRatio?: number }
		>
	} catch {
		return null
	}
}

/** The recipe zones with the athlete's per-label overrides applied, easy→hard. */
function effectiveBands(
	recipe: ZoneRecipe,
	overrides: Record<string, { minRatio: number; maxRatio?: number }> | null,
): ZoneBand[] {
	if (!overrides) return recipe.zones
	return recipe.zones.map((band) => {
		const o = overrides[band.label]
		return o ? { ...band, minRatio: o.minRatio, maxRatio: o.maxRatio } : band
	})
}

/**
 * The hardness rank of a value against a recipe (easy→hard zone order). Pace/CSS
 * recipes are inverted (a smaller ratio = faster = harder); power/HR recipes are
 * not. Boundary gaps between bands are treated as cutoffs so no ratio falls
 * between two bands.
 */
function bandIndexFor(
	bands: ZoneBand[],
	inverted: boolean,
	value: number,
	anchor: number,
): number {
	const ratio = value / anchor
	if (inverted) {
		// Larger ratio = slower = easier; bands are ordered easy→hard, so classify
		// by each band's easy (fast-edge) lower bound.
		for (let i = 0; i < bands.length; i++) {
			if (ratio >= bands[i]!.minRatio) return i
		}
		return bands.length - 1
	}
	for (let i = 0; i < bands.length; i++) {
		if (ratio <= (bands[i]!.maxRatio ?? Infinity)) return i
	}
	return bands.length - 1
}

const isInverted = (anchor: ZoneAnchor) =>
	anchor === 'thresholdPace' || anchor === 'css'

/** The built-in default recipe for a discipline's power/pace anchor channel. */
function defaultAnchorRecipe(discipline: DetectionDiscipline): ZoneRecipe {
	return discipline === 'bike' ? COGGAN_POWER_7 : DANIELS_PACE_5
}

/** The built-in default HR recipe for a discipline (LTHR-anchored). */
function defaultHrRecipe(discipline: DetectionDiscipline): ZoneRecipe {
	return discipline === 'bike' ? FRIEL_HR_5_BIKE : FRIEL_HR_5_RUN
}

function athleteRecipe(profile: DisciplineProfileForResolver) {
	return profile.zoneSystem ? getRecipe(profile.zoneSystem) : undefined
}

/**
 * Resolve how this activity's intensity is classified, walking the ADR 0035
 * ladder: the discipline's anchor channel (power/pace) with its threshold first,
 * else HR (LTHR / a maxHR-anchored recipe), else `null` — an honest no-detection
 * (never a guessed zone, never a population-default threshold).
 *
 * The chosen recipe is the athlete's own when it is anchored on the classifying
 * channel (with their overrides); otherwise the discipline's built-in default,
 * so the athlete's *threshold* always drives the bands even when they configured
 * a recipe for a different channel.
 */
export function resolveClassifier(
	discipline: DetectionDiscipline,
	profile: DisciplineProfileForResolver,
	stream: ActivityStream,
): Classifier | null {
	const recipe = athleteRecipe(profile)
	const overrides = parseOverrides(profile.zoneOverrides)

	// 1. Anchor channel: bike → power / FTP, run → pace / threshold pace.
	const anchorChannel: ClassifyChannel =
		discipline === 'bike' ? 'power' : 'pace'
	const anchorThreshold =
		discipline === 'bike' ? profile.ftp : profile.thresholdPaceSecPerKm
	const anchorRecipe =
		recipe &&
		recipe.anchor === (discipline === 'bike' ? 'ftp' : 'thresholdPace')
			? recipe
			: defaultAnchorRecipe(discipline)

	if (anchorThreshold != null && stream[anchorChannel] != null) {
		const bands = effectiveBands(
			anchorRecipe,
			recipe === anchorRecipe ? overrides : null,
		)
		const inverted = isInverted(anchorRecipe.anchor)
		return {
			channel: anchorChannel,
			bandIndex: (value) =>
				bandIndexFor(bands, inverted, value, anchorThreshold),
			measuredTarget: (value) =>
				anchorChannel === 'power'
					? { kind: 'power', minW: Math.max(1, Math.round(value)) }
					: { kind: 'pace', minSecPerKm: Math.max(1, Math.round(value)) },
			hrCapped: false,
			inverted,
		}
	}

	// 2. HR fallback — LTHR (or a maxHR-anchored recipe). Requires an HR channel.
	// The ADR 0035 ladder allows "maxHR via Tanaka"; Tanaka needs the athlete's
	// age, which is deliberately not part of the pure `DisciplineProfileForResolver`
	// input. The caller supplies `maxHr` already resolved — a stored value or a
	// Tanaka age-estimate computed upstream (ADR 0005, "never materialized") — so
	// the engine reads it honestly and never fabricates an age itself.
	if (stream.heartrate != null) {
		const hrRecipe =
			recipe && (recipe.anchor === 'lthr' || recipe.anchor === 'maxHr')
				? recipe
				: defaultHrRecipe(discipline)
		const hrAnchor = hrRecipe.anchor === 'maxHr' ? profile.maxHr : profile.lthr
		if (hrAnchor != null) {
			const bands = effectiveBands(
				hrRecipe,
				recipe === hrRecipe ? overrides : null,
			)
			return {
				channel: 'heartrate',
				bandIndex: (value) => bandIndexFor(bands, false, value, hrAnchor),
				measuredTarget: (value) => ({
					kind: 'hrBpm',
					min: Math.max(40, Math.round(value)),
				}),
				hrCapped: true,
				inverted: false,
			}
		}
	}

	// 3. No resolvable threshold on any channel → honest no-detection.
	return null
}
