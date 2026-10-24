import { expect, test } from 'vitest'
import { buildDayStamp } from '../day-stamp.ts'
import { intensityTargetToZone } from '../session-profile.ts'
import { parseWorkoutSentence } from '../workout-sentence.ts'
import { zoneEquivalent } from '../zone-equivalent.ts'
import { BUILT_IN_RECIPES } from './recipes.ts'
import {
	type DisciplineProfileForResolver,
	resolveIntensity,
} from './resolve.ts'
import { ZONE_WORDS } from './words.ts'

/** A profile with every anchor set, so any recipe's bands resolve. */
function profileOn(zoneSystem: string): DisciplineProfileForResolver {
	return {
		lthr: 170,
		maxHr: 190,
		ftp: 280,
		runPowerThresholdW: 250,
		thresholdPaceSecPerKm: 240,
		cssSecPer100m: 95,
		zoneSystem,
		zoneOverrides: null,
	}
}

const ZONES = [1, 2, 3, 4, 5] as const

test('each Training Zone has one word, and the word reads back as its zone', () => {
	expect(ZONE_WORDS).toEqual({
		1: 'lett',
		2: 'rolig',
		3: 'moderat',
		4: 'terskel',
		5: 'hardt',
	})
	for (const zone of ZONES) {
		expect(
			intensityTargetToZone({ kind: 'zoneLabel', label: ZONE_WORDS[zone] }),
		).toBe(zone)
	}
})

// The recipes whose band codes mean a different declared zone than the code
// says: Stryd's `Z1` is zone 2, … `Z4` is zone 5; css-3's `Z3` is zone 4.
const collidingRecipes = BUILT_IN_RECIPES.filter((recipe) =>
	recipe.zones.some((band) => {
		const code = /^Z([1-5])$/.exec(band.label)?.[1]
		return code != null && band.zone != null && Number(code) !== band.zone
	}),
)

test('the colliding recipes are Stryd and css-3', () => {
	expect(collidingRecipes.map((recipe) => recipe.id).sort()).toEqual([
		'css-3',
		'stryd-run-power-5',
	])
})

for (const recipe of collidingRecipes) {
	test(`on ${recipe.id}, a zone word resolves to the band declaring that zone`, () => {
		const profile = profileOn(recipe.id)
		for (const zone of ZONES) {
			const word = { kind: 'zoneLabel' as const, label: ZONE_WORDS[zone] }
			expect(zoneEquivalent(word, profile).step).toBe(zone)
			const band = recipe.zones.find((z) => z.zone === zone)
			if (!band) continue // css-3 declares no 3 or 5: a named substitution
			const { substitution: _named, ...range } = resolveIntensity(word, profile)
			expect(range).toEqual(
				resolveIntensity({ kind: 'zoneLabel', label: band.label }, profile),
			)
		}
	})
}

test('typed terskel on Stryd resolves to zone 4; typed moderat on css-3 to zone 3', () => {
	const typed = (sentence: string) =>
		parseWorkoutSentence(sentence, { discipline: 'run' }).structure!.blocks[0]!
			.steps[0]!
	const terskel = typed('3x10 min terskel')
	const moderat = typed('20 min moderat')
	if (terskel.kind !== 'cardio' || moderat.kind !== 'cardio') throw new Error()

	const stryd = profileOn('stryd-run-power-5')
	expect(zoneEquivalent(terskel.intensity!, stryd).step).toBe(4)
	// Stryd's `Z3` is the band declaring zone 4.
	expect(resolveIntensity(terskel.intensity!, stryd)).toMatchObject(
		resolveIntensity({ kind: 'zoneLabel', label: 'Z3' }, stryd),
	)

	const css3 = profileOn('css-3')
	expect(zoneEquivalent(moderat.intensity!, css3).step).toBe(3)
	// css-3 declares no zone 3, so its range is the nearest band, and says so.
	expect(resolveIntensity(moderat.intensity!, css3).substitution).toMatch(
		/no zone 3/,
	)
})

test('the day stamp resolves to zone 2 on Stryd', () => {
	const stamp = buildDayStamp({
		discipline: 'run',
		scheduledAt: new Date('2026-08-23T05:00:00.000Z'),
	})
	const step = stamp.blocks[0]!.steps[0]!
	if (step.kind !== 'cardio') throw new Error()
	const stryd = profileOn('stryd-run-power-5')
	expect(zoneEquivalent(step.intensity!, stryd).step).toBe(2)
	expect(resolveIntensity(step.intensity!, stryd)).toMatchObject(
		resolveIntensity({ kind: 'zoneLabel', label: 'Z1' }, stryd),
	)
})
