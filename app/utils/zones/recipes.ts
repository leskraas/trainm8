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
	name: 'Coggan power — 7 zones',
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
	name: 'Friel heart rate — 5 zones',
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
	name: 'Friel heart rate — 5 zones',
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
//
// **Corrected in place (#447), not re-versioned.** The original bands were the
// reciprocals of Daniels' documented `%VO₂max` fractions, tiled so `T` opened at
// 1.00. That reciprocal is an arithmetic error: the oxygen-cost curve has a
// negative intercept, so pace does not scale as `1/(%VO₂max)`. The published pace
// table and a proper inversion of that curve agree with each other and not with
// the reciprocal, which put the three aerobic bands roughly one step slow — `E`
// priced easy running about 90 s/km slower than Daniels' own table. Bounds here
// sit midway between the citable band centres (`E` 1.20, `M` 1.08, `T` 1.00,
// `I` 0.92, `R` 0.85); workings and sources in
// `docs/wayfinder/plan-builder-mobile-ux/390-daniels-pace-ratios.md` §1–§5.
//
// ADR 0006 requires a *changed* recipe to take a new id. This recipe never
// matched the source it is named after, so it is a **defect** rather than a
// preference change and is corrected where it stands — see ADR 0006's amendment,
// and #444 for why a `-v2` would have fixed the bug for nobody (nothing but the
// seed writes `zoneSystem`, there is no recipe picker, and `classify.ts` hardcodes
// this recipe as the detection default for every runner regardless of choice).
// `zone` declarations are unchanged.
export const DANIELS_PACE_5: ZoneRecipe = {
	id: 'daniels-pace-5',
	name: 'Daniels pace — 5 zones',
	discipline: 'run',
	anchor: 'thresholdPace',
	zones: [
		// `E` spans both of our easy zones — Daniels has no separate recovery pace.
		// It declares 2 rather than 1 so the common reading (the aerobic bucket) is
		// exact; a consumer asking for zone 1 substitutes it and says so.
		{
			label: 'E',
			minRatio: 1.15,
			maxRatio: 1.31,
			description: 'easy/endurance',
			zone: 2,
		},
		{
			label: 'M',
			minRatio: 1.05,
			maxRatio: 1.14,
			description: 'marathon pace',
			zone: 3,
		},
		// `T` is threshold and sits *third*, which is exactly why `zone` is declared
		// rather than read off the band's position (ADR 0045 §3).
		{
			label: 'T',
			minRatio: 0.97,
			maxRatio: 1.04,
			description: 'threshold',
			zone: 4,
		},
		{
			label: 'I',
			minRatio: 0.9,
			maxRatio: 0.96,
			description: 'interval (VO₂ max)',
			zone: 5,
		},
		// `R` is neuromuscular: high *mechanical* intensity at low metabolic strain,
		// which ADR 0042 §7 kept off the five-zone axis. No `zone` on purpose.
		{
			label: 'R',
			minRatio: 0.8,
			maxRatio: 0.89,
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
	name: 'Stryd running power — 5 zones',
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
	name: 'CSS — 3 zones',
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
		// substitution rather than pretending (ADR 0045 §3). `css-5` below is the
		// five-band alternative for a swimmer who needs zones 3 and 5 priced apart;
		// this recipe is kept unedited so no existing athlete is silently
		// re-resolved (ADR 0006).
		{
			label: 'Z3',
			minRatio: 0,
			maxRatio: 1.0,
			description: 'CSS and faster',
			zone: 4,
		},
	],
}

// CSS 5-zone model — the swim recipe that can express all five **Training
// Zones** (#392). `css-3` cannot: two of the three zones a Quality Session Mix
// authors (3–5) have no band there, so a swimmer's zone-3 and zone-5 work both
// price at threshold, under-costing VO₂ max and over-costing tempo.
//
// **Source.** The 80/20 Endurance `Swim (%CV)` scale, already in the repo at
// `docs/wayfinder/manual-training-planning/intensity-load-and-volume-reference.md`
// §4 (read from the live 8020endurance calculator). It is stated as speed
// percentages of critical velocity, so each figure is inverted to a pace ratio
// (pace = 1 / speed) and 80/20's seven bands collapse onto our five:
//
//   zone 1 ← 80/20 zone 1   75–84 %CV   → 1.19–1.33
//   zone 2 ← 80/20 zone 2   84–91 %CV   → 1.10–1.19
//   zone 3 ← 80/20 zone X   91–96 %CV   → 1.04–1.10   the "moderate rut"
//   zone 4 ← 80/20 3 + Y    96–102 %CV  → 0.98–1.04   CSS itself sits here
//   zone 5 ← 80/20 4 + 5    >102 %CV    → <0.98
//
// Swim zones are more often stated *additively* (CSS + 6 s /100 m for endurance),
// and the two conventions disagree about easy swimming materially rather than
// marginally: the additive zone 1 (CSS + 10–12 s) is ≈1.12 × CSS at a 1:30 CSS
// against 1.19–1.33 here. Choosing the %CV scale is therefore a choice of source,
// not a rounding choice between equivalent ones, and it is the one this repo
// already cites — which also keeps `ZoneBand` multiplicative, so nothing in
// `resolve.ts` or the shared type changes for one recipe (#392 weighed both).
// The cost is that a ratio band is not a fixed seconds-per-100 m offset:
// 1.10 × CSS is CSS + 7.5 s at a 1:15 CSS and CSS + 11 s at 1:50.
//
// Bands run easy → hard like every other recipe, so `minRatio` is each band's
// *fast* edge and `maxRatio` its slow edge. Bounds are contiguous rather than
// gapped, so no swim pace falls between two bands. Only Z5 is open-ended, because
// only 80/20's top band is (>102 %CV); Z1 keeps the source's 75 %CV floor as a
// 1.33 ceiling rather than running unbounded slow like `css-3`'s Z1 — so every
// band resolves to a two-sided pace range, and ADR 0045 §3's representative ratio
// is a real midpoint (1.26) instead of the band's hardest edge, which would price
// easy swim volume at the top of zone 1. Recovery swimming slower than 1.33 × CSS
// is outside every band by construction; a consumer bucketing a measured pace
// takes the nearest band and still lands on Z1.
export const CSS_5: ZoneRecipe = {
	id: 'css-5',
	name: 'CSS — 5 zones',
	discipline: 'swim',
	anchor: 'css',
	zones: [
		{
			label: 'Z1',
			minRatio: 1.19,
			maxRatio: 1.33,
			description: 'easy aerobic',
			zone: 1,
		},
		{
			label: 'Z2',
			minRatio: 1.1,
			maxRatio: 1.19,
			description: 'aerobic endurance',
			zone: 2,
		},
		{
			label: 'Z3',
			minRatio: 1.04,
			maxRatio: 1.1,
			description: 'moderate',
			zone: 3,
		},
		// CSS is the threshold and this is the band it sits in, named so a swimmer
		// can see where their tested pace lands.
		{
			label: 'Z4',
			minRatio: 0.98,
			maxRatio: 1.04,
			description: 'threshold (CSS)',
			zone: 4,
		},
		{
			label: 'Z5',
			minRatio: 0,
			maxRatio: 0.98,
			description: 'VO₂ max',
			zone: 5,
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
	name: 'Olympiatoppen heart rate — 5 zones',
	discipline: 'run',
	anchor: 'maxHr',
	zones: [...OLT_HR_5_ZONES],
}

export const OLT_HR_5_BIKE: ZoneRecipe = {
	id: 'olt-hr-5-bike',
	name: 'Olympiatoppen heart rate — 5 zones',
	discipline: 'bike',
	anchor: 'maxHr',
	zones: [...OLT_HR_5_ZONES],
}

// Order is the picker's display order on /settings/training, and nothing more.
// It used to be load-bearing — `listRecipesForDiscipline(d)[0]` was the editor's
// fallback for an athlete who had chosen no zone system — but since #454 every
// cardio Discipline Profile carries a recipe, and the one fallback left reads
// `DEFAULT_ZONE_RECIPES` (`./defaults.ts`) so the editor cannot offer one ladder
// while the athlete's settings show another. Appending a recipe is therefore safe;
// promoting one to a *default* is the change that needs the argument, and that
// argument lives beside the defaults.
// Swim is deliberately not offered an OLT variant — ADR 0008 rejected HR for swim
// (a strap slips, wrist HR fails submerged), and CSS is the domain standard there.
export const BUILT_IN_RECIPES: ZoneRecipe[] = [
	COGGAN_POWER_7,
	STRYD_RUN_POWER_5,
	FRIEL_HR_5_BIKE,
	FRIEL_HR_5_RUN,
	DANIELS_PACE_5,
	CSS_3,
	CSS_5,
	OLT_HR_5_RUN,
	OLT_HR_5_BIKE,
]
