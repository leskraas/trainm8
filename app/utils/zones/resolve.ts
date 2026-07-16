import { type IntensityTarget } from '../workout-schema.ts'
import { BUILT_IN_RECIPES } from './recipes.ts'
import { type ZoneAnchor, type ZoneBand } from './types.ts'

function getRecipe(id: string) {
	return BUILT_IN_RECIPES.find((r) => r.id === id)
}

export type DisciplineProfileForResolver = {
	lthr: number | null
	maxHr: number | null
	ftp: number | null
	runPowerThresholdW: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
	zoneSystem: string | null
	zoneOverrides: string | null
}

export type ResolvedIntensity = {
	hrMin?: number
	hrMax?: number
	powerMin?: number
	powerMax?: number
	paceMin?: number
	paceMax?: number
	unavailable?: string
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

function anchorLabel(anchor: ZoneAnchor): string {
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
			if (!profile.ftp) return { unavailable: 'FTP is not configured' }
			return {
				powerMin: Math.round(profile.ftp * (authored.minPct / 100)),
				powerMax:
					authored.maxPct != null
						? Math.round(profile.ftp * (authored.maxPct / 100))
						: undefined,
			}
		}

		case 'pace':
			return { paceMin: authored.minSecPerKm, paceMax: authored.maxSecPerKm }

		case 'zoneLabel': {
			const recipeId = profile.zoneSystem
			if (!recipeId) {
				return { unavailable: 'No zone system configured for this discipline' }
			}
			const recipe = getRecipe(recipeId)
			if (!recipe) {
				return { unavailable: `Unknown zone recipe: ${recipeId}` }
			}

			// Per-athlete zone overrides take precedence over recipe defaults
			let band: ZoneBand | undefined
			if (profile.zoneOverrides) {
				try {
					const overrides = JSON.parse(profile.zoneOverrides) as Record<
						string,
						{ minRatio: number; maxRatio?: number }
					>
					const override = overrides[authored.label]
					if (override) {
						band = { label: authored.label, ...override }
					}
				} catch {
					// malformed overrides — fall through to recipe lookup
				}
			}

			if (!band) {
				band = recipe.zones.find((z) => z.label === authored.label)
			}

			if (!band) {
				return {
					unavailable: `Zone ${authored.label} not found in recipe ${recipeId}`,
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
