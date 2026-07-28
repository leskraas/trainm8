import { expect, test } from 'vitest'
import { type TrainingZone } from '../session-profile.ts'
import {
	BUILT_IN_RECIPES,
	getRecipe,
	listRecipesForDiscipline,
	resolveIntensity,
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

test('adding OLT leaves each discipline’s editor fallback recipe unchanged', () => {
	// `editorZoneRecipe` takes the first recipe for the discipline when an athlete
	// has chosen no zone system, so appending must not reorder these.
	expect({
		bike: listRecipesForDiscipline('bike')[0]?.id,
		run: listRecipesForDiscipline('run')[0]?.id,
		swim: listRecipesForDiscipline('swim')[0]?.id,
	}).toEqual({
		bike: 'coggan-power-7',
		run: 'stryd-run-power-5',
		swim: 'css-3',
	})
})

test('swim is offered no HR recipe — ADR 0008 rejected HR for swim', () => {
	const anchors = listRecipesForDiscipline('swim').map((r) => r.anchor)
	expect(anchors).not.toContain('maxHr')
	expect(anchors).not.toContain('lthr')
})
