import { type ZoneRecipe } from './types.ts'

// Each band carries a plain-words `description` — the canonical spelling-out of
// the zone code (#180). Display captions codes with it ("E — easy/endurance")
// so athletes never face a bare single letter.

export const COGGAN_POWER_7: ZoneRecipe = {
	id: 'coggan-power-7',
	discipline: 'bike',
	anchor: 'ftp',
	zones: [
		{ label: 'Z1', minRatio: 0, maxRatio: 0.55, description: 'active recovery' },
		{ label: 'Z2', minRatio: 0.56, maxRatio: 0.75, description: 'endurance' },
		{ label: 'Z3', minRatio: 0.76, maxRatio: 0.9, description: 'tempo' },
		{ label: 'Z4', minRatio: 0.91, maxRatio: 1.05, description: 'threshold' },
		{ label: 'Z5', minRatio: 1.06, maxRatio: 1.2, description: 'VO₂ max' },
		{
			label: 'Z6',
			minRatio: 1.21,
			maxRatio: 1.5,
			description: 'anaerobic capacity',
		},
		{ label: 'Z7', minRatio: 1.51, description: 'neuromuscular power' },
	],
}

export const FRIEL_HR_5_BIKE: ZoneRecipe = {
	id: 'friel-hr-5-bike',
	discipline: 'bike',
	anchor: 'lthr',
	zones: [
		{ label: 'Z1', minRatio: 0, maxRatio: 0.8, description: 'recovery' },
		{
			label: 'Z2',
			minRatio: 0.81,
			maxRatio: 0.89,
			description: 'aerobic endurance',
		},
		{ label: 'Z3', minRatio: 0.9, maxRatio: 0.93, description: 'tempo' },
		{
			label: 'Z4',
			minRatio: 0.94,
			maxRatio: 0.99,
			description: 'sub-threshold',
		},
		{ label: 'Z5', minRatio: 1.0, description: 'above threshold' },
	],
}

export const FRIEL_HR_5_RUN: ZoneRecipe = {
	id: 'friel-hr-5-run',
	discipline: 'run',
	anchor: 'lthr',
	zones: [
		{ label: 'Z1', minRatio: 0, maxRatio: 0.84, description: 'recovery' },
		{
			label: 'Z2',
			minRatio: 0.85,
			maxRatio: 0.89,
			description: 'aerobic endurance',
		},
		{ label: 'Z3', minRatio: 0.9, maxRatio: 0.94, description: 'tempo' },
		{
			label: 'Z4',
			minRatio: 0.95,
			maxRatio: 0.99,
			description: 'sub-threshold',
		},
		{ label: 'Z5', minRatio: 1.0, description: 'above threshold' },
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
		{ label: 'E', minRatio: 1.29, maxRatio: 1.74, description: 'easy/endurance' },
		{ label: 'M', minRatio: 1.15, maxRatio: 1.28, description: 'marathon pace' },
		{ label: 'T', minRatio: 1.0, maxRatio: 1.14, description: 'threshold' },
		{
			label: 'I',
			minRatio: 0.88,
			maxRatio: 0.99,
			description: 'interval (VO₂ max)',
		},
		{
			label: 'R',
			minRatio: 0.75,
			maxRatio: 0.87,
			description: 'repetition (speed)',
		},
	],
}

// Stryd-style 5-zone running-power model relative to Critical Power
// (runPowerThresholdW). Non-inverted like Coggan (more watts = harder): minRatio
// is the zone's low (easy) edge, maxRatio its high edge; minRatio=0 = no floor,
// no maxRatio = unbounded up. Running CP is a distinct threshold from cycling FTP,
// so this anchors on `runPower`, never `ftp` (ADR 0038).
export const STRYD_RUN_POWER_5: ZoneRecipe = {
	id: 'stryd-run-power-5',
	discipline: 'run',
	anchor: 'runPower',
	zones: [
		{ label: 'Z1', minRatio: 0, maxRatio: 0.8, description: 'easy' },
		{ label: 'Z2', minRatio: 0.81, maxRatio: 0.9, description: 'moderate' },
		{ label: 'Z3', minRatio: 0.91, maxRatio: 1.0, description: 'threshold' },
		{
			label: 'Z4',
			minRatio: 1.01,
			maxRatio: 1.15,
			description: 'interval (VO₂ max)',
		},
		{ label: 'Z5', minRatio: 1.16, description: 'repetition (speed)' },
	],
}

// CSS 3-zone model. minRatio=0 means no faster limit (unbounded fast); no maxRatio means unbounded slow.
export const CSS_3: ZoneRecipe = {
	id: 'css-3',
	discipline: 'swim',
	anchor: 'css',
	zones: [
		{ label: 'Z1', minRatio: 1.25, description: 'easy aerobic' },
		{ label: 'Z2', minRatio: 1.0, maxRatio: 1.25, description: 'aerobic endurance' },
		{ label: 'Z3', minRatio: 0, maxRatio: 1.0, description: 'CSS and faster' },
	],
}

export const BUILT_IN_RECIPES: ZoneRecipe[] = [
	COGGAN_POWER_7,
	STRYD_RUN_POWER_5,
	FRIEL_HR_5_BIKE,
	FRIEL_HR_5_RUN,
	DANIELS_PACE_5,
	CSS_3,
]
