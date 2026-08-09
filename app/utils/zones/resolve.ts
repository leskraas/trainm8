import {
	powerPctRef,
	type IntensityTarget,
	type RaceAnchor,
} from '../workout-schema.ts'
import { BUILT_IN_RECIPES } from './recipes.ts'
import { type ZoneAnchor, type ZoneBand, type ZoneRecipe } from './types.ts'

function getRecipe(id: string) {
	return BUILT_IN_RECIPES.find((r) => r.id === id)
}

/**
 * The athlete's own pace for each **Race Anchor** they have a **Performance
 * Result** for, in seconds per km — the top rung of the **Race Equivalence**
 * ladder, and the only rung this repo can walk today. Built server-side by
 * `raceAnchorPaces()`; an absent key means "no result on record for that
 * distance", which is what a `racePace` target degrades on.
 */
export type RaceAnchorPaces = Partial<Record<RaceAnchor, number>>

export type DisciplineProfileForResolver = {
	lthr: number | null
	maxHr: number | null
	ftp: number | null
	runPowerThresholdW: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
	zoneSystem: string | null
	zoneOverrides: string | null
	/**
	 * Optional rather than required, so the ~15 places that already build this
	 * shape keep compiling and simply resolve a `racePace` target to an honest
	 * Unavailable Metric until they are handed the athlete's results.
	 */
	raceAnchorPaces?: RaceAnchorPaces | null
}

export type ResolvedIntensity = {
	hrMin?: number
	hrMax?: number
	powerMin?: number
	powerMax?: number
	paceMin?: number
	paceMax?: number
	unavailable?: string
	/**
	 * Whether the concrete range is a **translation** rather than arithmetic on
	 * a number the athlete authored — a lactate target read through a published
	 * band, or a race pace read off a dated result. Display renders `≈` when
	 * this is set, per the house rule that the portable name is primary and the
	 * number is the facet (CONTEXT.md **Target Resolution**). Multiplying a
	 * threshold by a percentage is *not* approximate and does not set it.
	 */
	approximate?: boolean
}

/** The athlete's word for a `powerPct` reference. `map` and `cp` are named
 * rather than resolved for bike: the app holds no maximal aerobic power at all,
 * and cycling critical power is a distinct construct from FTP (256 ± 50 W
 * against 249 ± 44 W; the authors say do not interchange them) — so a target
 * anchored there is an Unavailable Metric rather than FTP wearing a new label. */
function powerRefLabel(ref: 'ftp' | 'map' | 'cp'): string {
	switch (ref) {
		case 'ftp':
			return 'FTP'
		case 'map':
			return 'MAP'
		case 'cp':
			return 'critical power'
	}
}

/** The stored threshold a `powerPct` reference reads. Running critical power is
 * the one CP the profile holds (ADR 0038); MAP is unmodelled everywhere. */
function powerRefValue(
	ref: 'ftp' | 'map' | 'cp',
	profile: DisciplineProfileForResolver,
): number | null {
	switch (ref) {
		case 'ftp':
			return profile.ftp
		case 'cp':
			return profile.runPowerThresholdW
		case 'map':
			return null
	}
}

/** The athlete's word for a race anchor, as the notation writes it. */
export function raceAnchorLabel(event: RaceAnchor): string {
	return event === 'hm' ? 'half-marathon' : event
}

/**
 * The band a lactate reading lands in, or null when this recipe's source
 * publishes no lactate that covers it.
 *
 * Matching is on the authored range's **midpoint**, and ties go to the easier
 * (earlier) band — Olympiatoppen's own table overlaps at 1.5–2.0 mmol, so a
 * rule is needed and pretending the source is disjoint is not one. A reading
 * outside every declared band resolves to nothing rather than to the nearest,
 * because lactate above the last declared band is exactly where the sources
 * stop speaking.
 */
function bandForLactate(
	bands: ZoneBand[],
	minMmol: number,
	maxMmol: number | undefined,
): ZoneBand | null {
	const midpoint = maxMmol != null ? (minMmol + maxMmol) / 2 : minMmol
	return (
		bands.find(
			(band) =>
				band.lactateMmolMin != null &&
				band.lactateMmolMax != null &&
				midpoint >= band.lactateMmolMin &&
				midpoint <= band.lactateMmolMax,
		) ?? null
	)
}

function getAnchorValue(
	anchor: ZoneAnchor,
	profile: DisciplineProfileForResolver,
): number | null {
	switch (anchor) {
		case 'ftp':
			return profile.ftp
		case 'runPower':
			return profile.runPowerThresholdW
		case 'lthr':
			return profile.lthr
		case 'maxHr':
			return profile.maxHr
		case 'thresholdPace':
			return profile.thresholdPaceSecPerKm
		case 'css':
			return profile.cssSecPer100m
		case 'rpe':
			return null
	}
}

/** The athlete's word for the **Threshold** a recipe is a ratio table over. */
export function anchorLabel(anchor: ZoneAnchor): string {
	switch (anchor) {
		case 'ftp':
			return 'FTP'
		case 'runPower':
			return 'run power'
		case 'lthr':
			return 'LTHR'
		case 'maxHr':
			return 'max HR'
		case 'thresholdPace':
			return 'threshold pace'
		case 'css':
			return 'CSS'
		case 'rpe':
			return 'RPE'
	}
}

function applyBand(
	anchor: ZoneAnchor,
	anchorValue: number,
	band: ZoneBand,
): ResolvedIntensity {
	// minRatio=0 means no lower bound (no faster/weaker limit)
	const minVal =
		band.minRatio > 0 ? Math.round(anchorValue * band.minRatio) : undefined
	const maxVal =
		band.maxRatio != null ? Math.round(anchorValue * band.maxRatio) : undefined

	switch (anchor) {
		case 'ftp':
		case 'runPower':
			return { powerMin: minVal, powerMax: maxVal }
		case 'lthr':
		case 'maxHr':
			return { hrMin: minVal, hrMax: maxVal }
		case 'thresholdPace':
		case 'css':
			return { paceMin: minVal, paceMax: maxVal }
		case 'rpe':
			return {}
	}
}

export function resolveIntensity(
	authored: IntensityTarget,
	profile: DisciplineProfileForResolver,
): ResolvedIntensity {
	switch (authored.kind) {
		case 'rpe':
			// RPE is a subjective scale that does not map to metric ranges
			return {}

		case 'hrBpm':
			return { hrMin: authored.min, hrMax: authored.max }

		case 'hrPct': {
			const anchor = authored.ref === 'max' ? profile.maxHr : profile.lthr
			if (!anchor) {
				return {
					unavailable: `${authored.ref === 'max' ? 'Max HR' : 'LTHR'} is not configured`,
				}
			}
			return {
				hrMin: Math.round(anchor * (authored.minPct / 100)),
				hrMax:
					authored.maxPct != null
						? Math.round(anchor * (authored.maxPct / 100))
						: undefined,
			}
		}

		case 'power':
			return { powerMin: authored.minW, powerMax: authored.maxW }

		case 'powerPct': {
			const ref = powerPctRef(authored)
			const anchor = powerRefValue(ref, profile)
			if (!anchor) {
				return { unavailable: `${powerRefLabel(ref)} is not configured` }
			}
			return {
				powerMin: Math.round(anchor * (authored.minPct / 100)),
				powerMax:
					authored.maxPct != null
						? Math.round(anchor * (authored.maxPct / 100))
						: undefined,
			}
		}

		case 'pace':
			return { paceMin: authored.minSecPerKm, paceMax: authored.maxSecPerKm }

		case 'pacePct': {
			if (!profile.thresholdPaceSecPerKm) {
				return { unavailable: 'Threshold pace is not configured' }
			}
			// The percentage is of threshold *speed*, so pace divides: the slow
			// (easy) edge comes from `minPct` and the fast edge from `maxPct`.
			return paceFromSpeedPct(
				profile.thresholdPaceSecPerKm,
				authored.minPct,
				authored.maxPct,
			)
		}

		case 'racePace': {
			const anchorPace = profile.raceAnchorPaces?.[authored.event]
			if (!anchorPace) {
				return {
					unavailable: `No ${raceAnchorLabel(authored.event)} result on record`,
				}
			}
			const resolved = paceFromSpeedPct(
				anchorPace,
				authored.minPct ?? 100,
				authored.maxPct,
			)
			// A dated race is not today's fitness, and a percentage of it is a
			// prescription rather than a measurement — the number wears `≈`.
			return { ...resolved, approximate: true }
		}

		case 'lactate': {
			const found = recipeBands(profile)
			if ('unavailable' in found) return found
			const { recipe, bands } = found
			if (!bands.some((band) => band.lactateMmolMin != null)) {
				return {
					unavailable: `${recipe.name} does not publish blood lactate`,
				}
			}
			const band = bandForLactate(bands, authored.minMmol, authored.maxMmol)
			if (!band) {
				return {
					unavailable: `No band in ${recipe.name} covers ${formatMmol(authored.minMmol, authored.maxMmol)}`,
				}
			}
			const anchorValue = getAnchorValue(recipe.anchor, profile)
			if (!anchorValue) {
				return {
					unavailable: `${anchorLabel(recipe.anchor)} is not configured`,
				}
			}
			// The one stored value is the lactate; this range is the *derived
			// facet*, read through a published band rather than computed from a
			// number the athlete typed — so it is approximate by construction.
			return {
				...applyBand(recipe.anchor, anchorValue, band),
				approximate: true,
			}
		}

		case 'zoneLabel': {
			const found = recipeBands(profile)
			if ('unavailable' in found) return found
			const { recipe, bands } = found
			const band = bands.find((z) => z.label === authored.label)
			if (!band) {
				return {
					unavailable: `Zone ${authored.label} not found in recipe ${recipe.id}`,
				}
			}

			const anchorValue = getAnchorValue(recipe.anchor, profile)
			if (!anchorValue) {
				return {
					unavailable: `${anchorLabel(recipe.anchor)} is not configured`,
				}
			}

			return applyBand(recipe.anchor, anchorValue, band)
		}
	}
}

/** `2.5–3.0 mmol/L`, or `2.5 mmol/L` for a single value. */
export function formatMmol(min: number, max: number | undefined): string {
	const one = (value: number) => value.toFixed(1)
	return max != null && max !== min
		? `${one(min)}–${one(max)} mmol/L`
		: `${one(min)} mmol/L`
}

/**
 * A pace band from a percentage of an anchor's **speed**. `minPct` is the easy
 * edge, so it produces the *slow* bound; a target with no upper percentage is a
 * single pace, not an open-ended one.
 */
function paceFromSpeedPct(
	anchorSecPerKm: number,
	minPct: number,
	maxPct: number | undefined,
): ResolvedIntensity {
	const slow = Math.round(anchorSecPerKm / (minPct / 100))
	const fast =
		maxPct != null ? Math.round(anchorSecPerKm / (maxPct / 100)) : slow
	return { paceMin: fast, paceMax: slow }
}

/**
 * The athlete's recipe and its bands with their own per-zone overrides applied
 * — the one lookup both `zoneLabel` and `lactate` resolve through, so the two
 * cannot disagree about which ladder the athlete is on.
 */
type ZoneOverrides = Record<string, { minRatio: number; maxRatio?: number }>

/** The athlete's per-band ratio overrides, or null when absent or malformed. */
function parseZoneOverrides(json: string | null): ZoneOverrides | null {
	if (!json) return null
	try {
		return JSON.parse(json) as ZoneOverrides
	} catch {
		// malformed overrides — the recipe's own bands stand
		return null
	}
}

function recipeBands(
	profile: DisciplineProfileForResolver,
): { recipe: ZoneRecipe; bands: ZoneBand[] } | { unavailable: string } {
	const recipeId = profile.zoneSystem
	if (!recipeId) {
		return { unavailable: 'No zone system configured for this discipline' }
	}
	const recipe = getRecipe(recipeId)
	if (!recipe) return { unavailable: `Unknown zone recipe: ${recipeId}` }

	const overrides = parseZoneOverrides(profile.zoneOverrides)
	const bands = overrides
		? recipe.zones.map((band) => {
				const override = overrides[band.label]
				// An override restates a band's *ratios* wholly (an omitted
				// `maxRatio` means open-ended); it carries no lactate and no wording
				// of its own, so the recipe's stay.
				return override
					? {
							...band,
							minRatio: override.minRatio,
							maxRatio: override.maxRatio,
						}
					: band
			})
		: recipe.zones
	return { recipe, bands }
}
