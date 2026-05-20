import { type ZoneRecipe } from './types.ts'

export const COGGAN_POWER_7: ZoneRecipe = {
	id: 'coggan-power-7',
	discipline: 'bike',
	anchor: 'ftp',
	zones: [
		{ label: 'Z1', minRatio: 0, maxRatio: 0.55 },
		{ label: 'Z2', minRatio: 0.56, maxRatio: 0.75 },
		{ label: 'Z3', minRatio: 0.76, maxRatio: 0.9 },
		{ label: 'Z4', minRatio: 0.91, maxRatio: 1.05 },
		{ label: 'Z5', minRatio: 1.06, maxRatio: 1.2 },
		{ label: 'Z6', minRatio: 1.21, maxRatio: 1.5 },
		{ label: 'Z7', minRatio: 1.51 },
	],
}

export const FRIEL_HR_5_BIKE: ZoneRecipe = {
	id: 'friel-hr-5-bike',
	discipline: 'bike',
	anchor: 'lthr',
	zones: [
		{ label: 'Z1', minRatio: 0, maxRatio: 0.8 },
		{ label: 'Z2', minRatio: 0.81, maxRatio: 0.89 },
		{ label: 'Z3', minRatio: 0.9, maxRatio: 0.93 },
		{ label: 'Z4', minRatio: 0.94, maxRatio: 0.99 },
		{ label: 'Z5', minRatio: 1.0 },
	],
}

export const FRIEL_HR_5_RUN: ZoneRecipe = {
	id: 'friel-hr-5-run',
	discipline: 'run',
	anchor: 'lthr',
	zones: [
		{ label: 'Z1', minRatio: 0, maxRatio: 0.84 },
		{ label: 'Z2', minRatio: 0.85, maxRatio: 0.89 },
		{ label: 'Z3', minRatio: 0.9, maxRatio: 0.94 },
		{ label: 'Z4', minRatio: 0.95, maxRatio: 0.99 },
		{ label: 'Z5', minRatio: 1.0 },
	],
}

// Jack Daniels Running Formula pace zones relative to T pace (thresholdPaceSecPerKm).
// Ratios > 1 = slower than threshold; ratios < 1 = faster than threshold.
// minRatio = fastest end of zone; maxRatio = slowest end of zone.
export const DANIELS_PACE_5: ZoneRecipe = {
	id: 'daniels-pace-5',
	discipline: 'run',
	anchor: 'thresholdPace',
	zones: [
		{ label: 'E', minRatio: 1.29, maxRatio: 1.74 },
		{ label: 'M', minRatio: 1.15, maxRatio: 1.28 },
		{ label: 'T', minRatio: 1.0, maxRatio: 1.14 },
		{ label: 'I', minRatio: 0.88, maxRatio: 0.99 },
		{ label: 'R', minRatio: 0.75, maxRatio: 0.87 },
	],
}

// CSS 3-zone model. minRatio=0 means no faster limit (unbounded fast); no maxRatio means unbounded slow.
export const CSS_3: ZoneRecipe = {
	id: 'css-3',
	discipline: 'swim',
	anchor: 'css',
	zones: [
		{ label: 'Z1', minRatio: 1.25 },
		{ label: 'Z2', minRatio: 1.0, maxRatio: 1.25 },
		{ label: 'Z3', minRatio: 0, maxRatio: 1.0 },
	],
}

export const BUILT_IN_RECIPES: ZoneRecipe[] = [
	COGGAN_POWER_7,
	FRIEL_HR_5_BIKE,
	FRIEL_HR_5_RUN,
	DANIELS_PACE_5,
	CSS_3,
]
