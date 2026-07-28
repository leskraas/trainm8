import { type ZoneBand, type ZoneRecipe } from './types.ts'

// Each band carries a plain-words `description` — the canonical spelling-out of
// the zone code (#180). Display captions codes with it ("E — easy/endurance")
// so athletes never face a bare single letter.
//
// Each band also declares the app's **Training Zone** it is (`zone`), so nothing
// downstream has to infer it from the band's position or its wording (ADR 0045
// §3). A band with no `zone` is deliberately off the five-zone metabolic axis, or
// sits in a recipe too coarse to express that zone; see `ZoneBand.zone`.

export const COGGAN_POWER_7: ZoneRecipe = {
	id: 'coggan-power-7',
	discipline: 'bike',
	anchor: 'ftp',
	zones: [
		{
			label: 'Z1',
			minRatio: 0,
			maxRatio: 0.55,
			description: 'active recovery',
			zone: 1,
		},
		{
			label: 'Z2',
			minRatio: 0.56,
			maxRatio: 0.75,
			description: 'endurance',
			zone: 2,
		},
		{
			label: 'Z3',
			minRatio: 0.76,
			maxRatio: 0.9,
			description: 'tempo',
			zone: 3,
		},
		{
			label: 'Z4',
			minRatio: 0.91,
			maxRatio: 1.05,
			description: 'threshold',
			zone: 4,
		},
		{
			label: 'Z5',
			minRatio: 1.06,
			maxRatio: 1.2,
			description: 'VO₂ max',
			zone: 5,
		},
		// Z6 and Z7 sit above VO₂ max on the same axis, so they declare 5 rather
		// than nothing: the ladder has five steps and this recipe has seven bands.
		{
			label: 'Z6',
			minRatio: 1.21,
			maxRatio: 1.5,
			description: 'anaerobic capacity',
			zone: 5,
		},
		{
			label: 'Z7',
			minRatio: 1.51,
			description: 'neuromuscular power',
			zone: 5,
		},
	],
}

export const FRIEL_HR_5_BIKE: ZoneRecipe = {
	id: 'friel-hr-5-bike',
	discipline: 'bike',
	anchor: 'lthr',
	zones: [
		{
			label: 'Z1',
			minRatio: 0,
			maxRatio: 0.8,
			description: 'recovery',
			zone: 1,
		},
		{
			label: 'Z2',
			minRatio: 0.81,
			maxRatio: 0.89,
			description: 'aerobic endurance',
			zone: 2,
		},
		{
			label: 'Z3',
			minRatio: 0.9,
			maxRatio: 0.93,
			description: 'tempo',
			zone: 3,
		},
		{
			label: 'Z4',
			minRatio: 0.94,
			maxRatio: 0.99,
			description: 'sub-threshold',
			zone: 4,
		},
		{ label: 'Z5', minRatio: 1.0, description: 'above threshold', zone: 5 },
	],
}

export const FRIEL_HR_5_RUN: ZoneRecipe = {
	id: 'friel-hr-5-run',
	discipline: 'run',
	anchor: 'lthr',
	zones: [
		{
			label: 'Z1',
			minRatio: 0,
			maxRatio: 0.84,
			description: 'recovery',
			zone: 1,
		},
		{
			label: 'Z2',
			minRatio: 0.85,
			maxRatio: 0.89,
			description: 'aerobic endurance',
			zone: 2,
		},
		{
			label: 'Z3',
			minRatio: 0.9,
			maxRatio: 0.94,
			description: 'tempo',
			zone: 3,
		},
		{
			label: 'Z4',
			minRatio: 0.95,
			maxRatio: 0.99,
			description: 'sub-threshold',
			zone: 4,
		},
		{ label: 'Z5', minRatio: 1.0, description: 'above threshold', zone: 5 },
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
		// `E` spans both of our easy zones — Daniels has no separate recovery pace.
		// It declares 2 rather than 1 so the common reading (the aerobic bucket) is
		// exact; a consumer asking for zone 1 substitutes it and says so.
		{
			label: 'E',
			minRatio: 1.29,
			maxRatio: 1.74,
			description: 'easy/endurance',
			zone: 2,
		},
		{
			label: 'M',
			minRatio: 1.15,
			maxRatio: 1.28,
			description: 'marathon pace',
			zone: 3,
		},
		// `T` is threshold and sits *third*, which is exactly why `zone` is declared
		// rather than read off the band's position (ADR 0045 §3).
		{
			label: 'T',
			minRatio: 1.0,
			maxRatio: 1.14,
			description: 'threshold',
			zone: 4,
		},
		{
			label: 'I',
			minRatio: 0.88,
			maxRatio: 0.99,
			description: 'interval (VO₂ max)',
			zone: 5,
		},
		// `R` is neuromuscular: high *mechanical* intensity at low metabolic strain,
		// which ADR 0042 §7 kept off the five-zone axis. No `zone` on purpose.
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
		// Like Daniels' `E`, Stryd's `Z1` is the one aerobic band and covers both
		// easy zones, so it declares 2.
		{ label: 'Z1', minRatio: 0, maxRatio: 0.8, description: 'easy', zone: 2 },
		{
			label: 'Z2',
			minRatio: 0.81,
			maxRatio: 0.9,
			description: 'moderate',
			zone: 3,
		},
		{
			label: 'Z3',
			minRatio: 0.91,
			maxRatio: 1.0,
			description: 'threshold',
			zone: 4,
		},
		{
			label: 'Z4',
			minRatio: 1.01,
			maxRatio: 1.15,
			description: 'interval (VO₂ max)',
			zone: 5,
		},
		// Neuromuscular, off the axis — the same call as Daniels' `R`.
		{ label: 'Z5', minRatio: 1.16, description: 'repetition (speed)' },
	],
}

// CSS 3-zone model. minRatio=0 means no faster limit (unbounded fast); no maxRatio means unbounded slow.
export const CSS_3: ZoneRecipe = {
	id: 'css-3',
	discipline: 'swim',
	anchor: 'css',
	zones: [
		{ label: 'Z1', minRatio: 1.25, description: 'easy aerobic', zone: 1 },
		{
			label: 'Z2',
			minRatio: 1.0,
			maxRatio: 1.25,
			description: 'aerobic endurance',
			zone: 2,
		},
		// CSS *is* the threshold, so the band that opens there is zone 4. Three bands
		// cannot express five zones: this recipe declares no 3 and no 5, and a
		// consumer asking for either substitutes this band and names the
		// substitution rather than pretending (ADR 0045 §3).
		{
			label: 'Z3',
			minRatio: 0,
			maxRatio: 1.0,
			description: 'CSS and faster',
			zone: 4,
		},
	],
}

// Olympiatoppen's intensity scale (OLT-skala, <https://olt-skala.nif.no>), the
// Norwegian Olympic Federation's five heart-rate zones. Anchored on **maxHr**
// (%HFmax) rather than LTHR, which is what the published table states — so a load
// formula wanting an intensity factor against LTHR scales by `maxHr / lthr`, both
// of which Discipline Profile stores.
//
// The scale's own band names say how hard a zone *feels* ("behagelig
// anstrengende"), carrying no physiological word to match on — which is the
// clearest case for declaring `zone` outright (ADR 0045 §3). Glossed to English
// here to match the rest of the recipe vocabulary.
//
// I-6 to I-8 exist on the published scale but define no heart-rate range at all
// (they are RPE/anaerobic), so they cannot be expressed as ratios to an HR anchor
// and are absent rather than invented.
const OLT_HR_5_ZONES = [
	{
		label: 'I-1',
		minRatio: 0.55,
		maxRatio: 0.72,
		description: 'very easy',
		zone: 1,
	},
	{
		label: 'I-2',
		minRatio: 0.72,
		maxRatio: 0.82,
		description: 'fairly easy',
		zone: 2,
	},
	{
		label: 'I-3',
		minRatio: 0.82,
		maxRatio: 0.87,
		description: 'comfortably hard',
		zone: 3,
	},
	{
		label: 'I-4',
		minRatio: 0.87,
		maxRatio: 0.92,
		description: 'hard',
		zone: 4,
	},
	{ label: 'I-5', minRatio: 0.92, description: 'very hard', zone: 5 },
] as const satisfies readonly ZoneBand[]

export const OLT_HR_5_RUN: ZoneRecipe = {
	id: 'olt-hr-5-run',
	discipline: 'run',
	anchor: 'maxHr',
	zones: [...OLT_HR_5_ZONES],
}

export const OLT_HR_5_BIKE: ZoneRecipe = {
	id: 'olt-hr-5-bike',
	discipline: 'bike',
	anchor: 'maxHr',
	zones: [...OLT_HR_5_ZONES],
}

// Order matters: `listRecipesForDiscipline(d)[0]` is the editor's fallback when an
// athlete has chosen no zone system, so new recipes append rather than insert.
// Swim is deliberately not offered an OLT variant — ADR 0008 rejected HR for swim
// (a strap slips, wrist HR fails submerged), and CSS is the domain standard there.
export const BUILT_IN_RECIPES: ZoneRecipe[] = [
	COGGAN_POWER_7,
	STRYD_RUN_POWER_5,
	FRIEL_HR_5_BIKE,
	FRIEL_HR_5_RUN,
	DANIELS_PACE_5,
	CSS_3,
	OLT_HR_5_RUN,
	OLT_HR_5_BIKE,
]
