import { expect, test } from 'vitest'
import { type TrainingZone } from '../session-profile.ts'
import { type CardioDiscipline } from '../workout-schema.ts'
import {
	BUILT_IN_RECIPES,
	DEFAULT_ZONE_RECIPES,
	defaultRecipeIdFor,
	getRecipe,
	listRecipesForDiscipline,
	resolveIntensity,
	zoneRecipeFieldsForNewProfile,
	type DisciplineProfileForResolver,
} from './index.ts'

/**
 * The `zone` declaration each band carries (ADR 0045 §3). These assertions are
 * the declaration itself, restated where a reviewer can see the whole ladder at
 * once — the reason the recipes live in code rather than the database (ADR 0006).
 */
const DECLARED: Record<string, Array<TrainingZone | undefined>> = {
	'coggan-power-7': [1, 2, 3, 4, 5, 5, 5],
	'stryd-run-power-5': [2, 3, 4, 5, undefined],
	'friel-hr-5-bike': [1, 2, 3, 4, 5],
	'friel-hr-5-run': [1, 2, 3, 4, 5],
	'daniels-pace-5': [2, 3, 4, 5, undefined],
	'css-3': [1, 2, 4],
	'css-5': [1, 2, 3, 4, 5],
	'olt-hr-5-run': [1, 2, 3, 4, 5],
	'olt-hr-5-bike': [1, 2, 3, 4, 5],
}

const declaredZonesOf = (id: string) =>
	getRecipe(id)!
		.zones.map((band) => band.zone)
		.filter((zone): zone is TrainingZone => zone != null)

test('every built-in recipe declares the Training Zone of each band', () => {
	const declared = Object.fromEntries(
		BUILT_IN_RECIPES.map((recipe) => [
			recipe.id,
			recipe.zones.map((band) => band.zone),
		]),
	)
	expect(declared).toEqual(DECLARED)
})

test('no recipe declares the same Training Zone on two bands', () => {
	// Coggan's Z5/Z6/Z7 all sit above VO₂ max, the one deliberate exception.
	const duplicating = BUILT_IN_RECIPES.map((recipe) => recipe.id)
		.filter((id) => id !== 'coggan-power-7')
		.filter(
			(id) => new Set(declaredZonesOf(id)).size !== declaredZonesOf(id).length,
		)
	expect(duplicating).toEqual([])
})

test('declared zones never descend as a recipe gets harder', () => {
	// Every recipe orders its bands easy → hard, whichever way its ratios run, so
	// a declaration that steps backwards is a mis-declaration.
	const descending = BUILT_IN_RECIPES.map((recipe) => recipe.id).filter(
		(id) => {
			const declared = declaredZonesOf(id)
			return (
				JSON.stringify([...declared].sort((a, b) => a - b)) !==
				JSON.stringify(declared)
			)
		},
	)
	expect(descending).toEqual([])
})

test('a neuromuscular band declares no zone — it is off the metabolic axis', () => {
	// ADR 0042 §7 dropped `speed` rather than mapping it: high mechanical
	// intensity at low metabolic strain has no position on zones 1–5.
	const topBands = ['daniels-pace-5', 'stryd-run-power-5'].map((id) => {
		const band = getRecipe(id)!.zones.at(-1)!
		return { id, description: band.description, zone: band.zone }
	})
	expect(topBands).toEqual([
		{
			id: 'daniels-pace-5',
			description: 'repetition (speed)',
			zone: undefined,
		},
		{
			id: 'stryd-run-power-5',
			description: 'repetition (speed)',
			zone: undefined,
		},
	])
})

test("daniels-pace-5 declares its threshold band, which is not the ladder's fourth", () => {
	const daniels = getRecipe('daniels-pace-5')!
	const index = daniels.zones.findIndex((band) => band.zone === 4)
	// Third position, fourth zone — the whole reason position cannot be trusted.
	expect({ index, label: daniels.zones[index]!.label }).toEqual({
		index: 2,
		label: 'T',
	})
})

test('css-3 is too coarse for zones 3 and 5, and says so by omission', () => {
	expect(declaredZonesOf('css-3')).toEqual([1, 2, 4])
})

/**
 * `css-5`'s bands are the 80/20 `Swim (%CV)` scale inverted to pace ratios —
 * pace = 1 / speed — with 80/20's seven bands collapsed onto the app's five
 * **Training Zones**. Source:
 * `docs/wayfinder/manual-training-planning/intensity-load-and-volume-reference.md`
 * §4, read from the live 8020endurance calculator. Restated here so a reviewer
 * can check the inversion without dividing percentages by hand.
 *
 * `pctCv` is the band's speed span as a percentage of critical velocity, easy
 * edge first. `null` at the hard end means the band is unbounded fast — only
 * 80/20's top band is, so only Z5 is. Every other bound is asserted, including
 * Z1's easy edge, so no figure here is unverified decoration.
 */
const CSS_5_FROM_PERCENT_CV = [
	{ label: 'Z1', pctCv: [75, 84] }, // 80/20 zone 1
	{ label: 'Z2', pctCv: [84, 91] }, // 80/20 zone 2
	{ label: 'Z3', pctCv: [91, 96] }, // 80/20 zone X, the "moderate-intensity rut"
	{ label: 'Z4', pctCv: [96, 102] }, // 80/20 zones 3 + Y — CSS itself sits here
	{ label: 'Z5', pctCv: [102, null] }, // 80/20 zones 4 + 5
] as const satisfies ReadonlyArray<{
	label: string
	pctCv: readonly [number, number | null]
}>

test('css-5 expresses all five Training Zones against CSS', () => {
	const recipe = getRecipe('css-5')!
	expect(recipe.discipline).toBe('swim')
	expect(recipe.anchor).toBe('css')
	expect(declaredZonesOf('css-5')).toEqual([1, 2, 3, 4, 5])
})

test('css-5 inverts the 80/20 %CV swim scale into pace ratios to CSS', () => {
	const bands = getRecipe('css-5')!.zones
	expect(bands.map((band) => band.label)).toEqual(
		CSS_5_FROM_PERCENT_CV.map((source) => source.label),
	)
	CSS_5_FROM_PERCENT_CV.forEach((source, index) => {
		const band = bands[index]!
		const [easyPct, hardPct] = source.pctCv
		// A CSS recipe is inverted: `minRatio` is the band's fast (hard) edge and
		// `maxRatio` its slow (easy) edge. Zone 5 is unbounded fast, so it carries
		// minRatio 0 rather than 1 / its top %CV.
		expect(band.minRatio).toBeCloseTo(hardPct == null ? 0 : 100 / hardPct, 2)
		expect(band.maxRatio).toBeCloseTo(100 / easyPct, 2)
	})
})

test('only css-5’s VO₂ max band is open-ended, because only the source’s is', () => {
	// `css-3` runs its easiest band unbounded slow; `css-5` keeps the source's
	// 75 %CV floor instead, so Z1 resolves to a two-sided pace range and ADR 0045
	// §3's representative ratio is a midpoint rather than the band's hardest edge.
	const openEnded = getRecipe('css-5')!
		.zones.filter((band) => band.minRatio === 0 || band.maxRatio == null)
		.map((band) => band.label)
	expect(openEnded).toEqual(['Z5'])
})

test('css-5 leaves no pace between two bands', () => {
	// `bucketRatio` and `bandIndexFor` both walk the bands in order, so a gap
	// would let a swim pace fall through the ladder.
	const bands = getRecipe('css-5')!.zones
	const joins = bands
		.slice(1)
		.map((band, index) => [bands[index]!.minRatio, band.maxRatio])
	expect(joins).toEqual([
		[1.19, 1.19],
		[1.1, 1.1],
		[1.04, 1.04],
		[0.98, 0.98],
	])
})

test('the Olympiatoppen scale is anchored on maxHr, per its published table', () => {
	for (const id of ['olt-hr-5-run', 'olt-hr-5-bike']) {
		const recipe = getRecipe(id)!
		expect(recipe.anchor).toBe('maxHr')
		expect(recipe.zones.map((band) => band.label)).toEqual([
			'I-1',
			'I-2',
			'I-3',
			'I-4',
			'I-5',
		])
		// I-5 is "≥92 % HFmax" — unbounded above, so it carries no ceiling.
		expect(recipe.zones.at(-1)?.maxRatio).toBeUndefined()
	}
})

test('an OLT zone label resolves to a heart-rate range from maxHr', () => {
	const profile: DisciplineProfileForResolver = {
		zoneSystem: 'olt-hr-5-run',
		maxHr: 195,
		lthr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneOverrides: null,
	}
	// I-4 is 87–92 % of 195 = 170–179 bpm, the published table's own row.
	expect(
		resolveIntensity({ kind: 'zoneLabel', label: 'I-4' }, profile),
	).toEqual({
		hrMin: 170,
		hrMax: 179,
	})
})

test('every discipline’s default recipe is one of that discipline’s own', () => {
	// The three defaults #454 stamps onto a Discipline Profile. Restated here so a
	// change to one is a change to this list, not a quiet edit inside a map: a
	// default is what every athlete who has never picked is reading their targets
	// against, and moving it re-resolves all of them.
	expect(DEFAULT_ZONE_RECIPES).toEqual({
		run: 'daniels-pace-5',
		bike: 'coggan-power-7',
		swim: 'css-5',
	})
	for (const [discipline, id] of Object.entries(DEFAULT_ZONE_RECIPES)) {
		expect(getRecipe(id)?.discipline).toBe(discipline)
		expect(listRecipesForDiscipline(discipline as CardioDiscipline)).toContain(
			getRecipe(id),
		)
	}
})

test('strength has no default recipe, and that is a statement rather than a gap', () => {
	// No recipe ships for strength at all — lactate thresholds do not order a set
	// of squats (ADR 0046) — so the profile keeps a null recipe *and* a null
	// source, distinguishable from a recipe the app chose.
	expect(defaultRecipeIdFor('strength')).toBeNull()
	expect(zoneRecipeFieldsForNewProfile('strength')).toEqual({
		zoneSystem: null,
		zoneSystemSource: null,
	})
})

test('a new profile takes the default; a submitted recipe is the athlete’s', () => {
	expect(zoneRecipeFieldsForNewProfile('run')).toEqual({
		zoneSystem: 'daniels-pace-5',
		zoneSystemSource: 'default',
	})
	// Picking the recipe that *is* the default is still picking it — the source
	// records the act, never a comparison against the default's value.
	expect(zoneRecipeFieldsForNewProfile('run', 'daniels-pace-5')).toEqual({
		zoneSystem: 'daniels-pace-5',
		zoneSystemSource: 'athlete',
	})
	expect(zoneRecipeFieldsForNewProfile('swim', 'css-3')).toEqual({
		zoneSystem: 'css-3',
		zoneSystemSource: 'athlete',
	})
})

test('every recipe carries a name the picker can render', () => {
	for (const recipe of BUILT_IN_RECIPES) {
		expect(recipe.name.length).toBeGreaterThan(0)
		expect(recipe.name).not.toBe(recipe.id)
	}
})

test('swim is offered no HR recipe — ADR 0008 rejected HR for swim', () => {
	const anchors = listRecipesForDiscipline('swim').map((r) => r.anchor)
	expect(anchors).not.toContain('maxHr')
	expect(anchors).not.toContain('lthr')
})
