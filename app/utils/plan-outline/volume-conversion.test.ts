import { readFileSync } from 'node:fs'
import { expect, test, describe } from 'vitest'
import { coggan, hrTSS, rTSS, sTSS } from '../load/formulas.ts'
import {
	COGGAN_POWER_7,
	CSS_3,
	CSS_5,
	DANIELS_PACE_5,
	FRIEL_HR_5_RUN,
	OLT_HR_5_RUN,
	STRYD_RUN_POWER_5,
} from '../zones/recipes.ts'
import {
	bandForZone,
	bandIntensityFactor,
	conversionRecipe,
	convertWeeklyVolume,
	EASY_PACE_RATIO,
	MINUTES_IN_ZONE_PER_SESSION,
	representativeRatio,
	type ConversionProfile,
	type DerivationStep,
	type VolumeConversion,
	type VolumeConversionInput,
} from './volume-conversion.ts'

// ── fixtures ──────────────────────────────────────────────────────────────────
// The ADR 0045 §7 athlete: an Olympiatoppen runner, maxHr 195 / LTHR 172, with a
// 4:00/km threshold pace. Every field spelled out, nulls included, so a reader
// can see what the conversion is and is not allowed to read.

const OLT_RUNNER: ConversionProfile = {
	lthr: 172,
	maxHr: 195,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
}

const SWIMMER: ConversionProfile = {
	lthr: null,
	maxHr: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: 90, // 1:30 / 100 m → 4 km/h at CSS
}

const CYCLIST: ConversionProfile = {
	lthr: 160,
	maxHr: 190,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
}

function runInput(
	over: Partial<VolumeConversionInput> = {},
): VolumeConversionInput {
	return {
		discipline: 'run',
		currency: 'hours',
		volume: 5,
		mix: [{ zone: 4, sessionsPerWeek: 2 }],
		recipe: OLT_HR_5_RUN,
		profile: OLT_RUNNER,
		...over,
	}
}

function value(reading: VolumeConversion['hours']): number {
	if (!reading.available) throw new Error(`unavailable: ${reading.reason}`)
	return reading.value
}

function step(conversion: VolumeConversion, id: string): DerivationStep {
	const found = conversion.derivation.steps.find((s) => s.id === id)
	if (!found) throw new Error(`no derivation step ${id}`)
	return found
}

// ── §7's worked example, the one number the ADR commits to ────────────────────

test('ADR 0045 §7 reproduces: 400 TSS/wk, { z4: 2 }, 4:00/km ⇒ 4.84 h and 63.2 km', () => {
	const conversion = convertWeeklyVolume(
		runInput({ currency: 'tss', volume: 400 }),
	)

	expect(conversion.tss).toEqual({
		available: true,
		value: 400,
		marker: 'authored',
	})
	expect(value(conversion.hours)).toBeCloseTo(4.84, 2)
	expect(value(conversion.km)).toBeCloseTo(63.2, 1)
})

test('§7: each intermediate number in the worked chain', () => {
	const conversion = convertWeeklyVolume(
		runInput({ currency: 'tss', volume: 400 }),
	)

	// quality hours = 2 × 35 min
	expect(step(conversion, 'quality-hours').value).toBeCloseTo(1.17, 2)
	// I-4 → 103.0 TSS/h, I-2 → 76.2 TSS/h, both via maxHr / LTHR
	expect(step(conversion, 'tss-per-hour:z4').value).toBeCloseTo(103.0, 1)
	expect(step(conversion, 'tss-per-hour:easy').value).toBeCloseTo(76.2, 1)
	// the implied easy IF the ADR's derivation panel shows
	expect(step(conversion, 'if:easy').value).toBeCloseTo(0.873, 3)
	// easy hours = 280 ÷ 76.2
	expect(step(conversion, 'easy-hours').value).toBeCloseTo(3.67, 2)
	// 15 km/h at threshold, 12.45 km/h easy
	expect(step(conversion, 'speed:quality').value).toBeCloseTo(15, 6)
	expect(step(conversion, 'speed:easy').value).toBeCloseTo(12.45, 6)

	const quality = conversion.buckets.find((b) => b.kind === 'quality')!
	const easy = conversion.buckets.find((b) => b.kind === 'easy')!
	expect(quality.tss).toBeCloseTo(120, 0)
	expect(quality.km).toBeCloseTo(17.5, 1)
	expect(easy.tss).toBeCloseTo(280, 0)
	expect(easy.km).toBeCloseTo(45.7, 1)
})

test("§7's implied easy pace lands on Daniels' own table (4:48 for a 4:00 threshold)", () => {
	const conversion = convertWeeklyVolume(
		runInput({ currency: 'tss', volume: 400 }),
	)
	const easySecPerKm = 3600 / step(conversion, 'speed:easy').value
	expect(easySecPerKm).toBeCloseTo(289, 0) // 4:49/km
})

// ── §1: one decomposition, one easy bucket plus one per mix zone ──────────────

test('a week decomposes into one easy bucket plus one bucket per mix zone', () => {
	const conversion = convertWeeklyVolume(
		runInput({
			volume: 8,
			mix: [
				{ zone: 3, sessionsPerWeek: 1 },
				{ zone: 5, sessionsPerWeek: 2 },
			],
		}),
	)

	expect(conversion.buckets.map((b) => `${b.kind}:${b.zone}`)).toEqual([
		'quality:3',
		'quality:5',
		'easy:2',
	])
	expect(conversion.buckets.filter((b) => b.kind === 'easy')).toHaveLength(1)
	// the buckets sum to the week, in every currency the gate is open for
	const sum = (pick: (b: VolumeConversion['buckets'][number]) => number) =>
		conversion.buckets.reduce((total, b) => total + pick(b), 0)
	expect(sum((b) => b.hours)).toBeCloseTo(value(conversion.hours), 6)
	expect(sum((b) => b.tss)).toBeCloseTo(value(conversion.tss), 6)
	expect(sum((b) => b.km!)).toBeCloseTo(value(conversion.km), 6)
})

test('an empty mix is a positive statement: the easy bucket alone', () => {
	const conversion = convertWeeklyVolume(runInput({ mix: [] }))

	expect(conversion.buckets).toHaveLength(1)
	expect(conversion.buckets[0]!.kind).toBe('easy')
	expect(step(conversion, 'quality-hours').value).toBe(0)
	expect(value(conversion.hours)).toBe(5)
})

test('a zero dose contributes no bucket, as it contributes no emphasis term', () => {
	const conversion = convertWeeklyVolume(
		runInput({ mix: [{ zone: 4, sessionsPerWeek: 0 }] }),
	)
	expect(conversion.buckets).toHaveLength(1)
})

// ── §7: all six directions agree, because they project one decomposition ──────

describe('all six directions across km / hours / TSS', () => {
	const mix = [{ zone: 4, sessionsPerWeek: 2 }] as const
	const authoredHours = 5

	// One decomposition read three ways, then each reading re-authored and read
	// back: six cells, one set of numbers.
	const fromHours = convertWeeklyVolume(
		runInput({ currency: 'hours', volume: authoredHours, mix: [...mix] }),
	)
	const km = value(fromHours.km)
	const tss = value(fromHours.tss)

	test('hours → km → hours round-trips', () => {
		const back = convertWeeklyVolume(
			runInput({ currency: 'km', volume: km, mix: [...mix] }),
		)
		expect(value(back.hours)).toBeCloseTo(authoredHours, 6)
		expect(value(back.tss)).toBeCloseTo(tss, 6)
	})

	test('hours → TSS → hours round-trips', () => {
		const back = convertWeeklyVolume(
			runInput({ currency: 'tss', volume: tss, mix: [...mix] }),
		)
		expect(value(back.hours)).toBeCloseTo(authoredHours, 6)
		expect(value(back.km)).toBeCloseTo(km, 6)
	})

	test('km → TSS agrees with hours → TSS, so no two readings disagree', () => {
		const fromKm = convertWeeklyVolume(
			runInput({ currency: 'km', volume: km, mix: [...mix] }),
		)
		const fromTss = convertWeeklyVolume(
			runInput({ currency: 'tss', volume: tss, mix: [...mix] }),
		)
		expect(value(fromKm.tss)).toBeCloseTo(tss, 6)
		expect(value(fromTss.km)).toBeCloseTo(km, 6)
		expect(value(fromKm.hours)).toBeCloseTo(value(fromTss.hours), 6)
	})
})

// ── §2: absolute minutes, so TSS is affine and not proportional in volume ─────

test('minutes in zone are absolute, not a share of the week', () => {
	const small = convertWeeklyVolume(runInput({ volume: 4 }))
	const large = convertWeeklyVolume(runInput({ volume: 12 }))

	// The quality bucket stands still while the ramp fills the easy bucket.
	const qualityHours = (c: VolumeConversion) =>
		c.buckets
			.filter((b) => b.kind === 'quality')
			.reduce((t, b) => t + b.hours, 0)
	expect(qualityHours(small)).toBeCloseTo(qualityHours(large), 6)
	expect(qualityHours(small)).toBeCloseTo(70 / 60, 6)
})

test('TSS is affine in volume, never proportional — the two curves differ in slope', () => {
	const at = (hours: number) =>
		value(convertWeeklyVolume(runInput({ volume: hours })).tss)

	// Proportional would mean TSS/hour is constant. It is not.
	expect(at(4) / 4).not.toBeCloseTo(at(12) / 12, 3)
	// Affine: equal volume steps cost equal TSS, at the easy bucket's rate.
	const slope = (at(12) - at(11)) / 1
	expect(at(9) - at(8)).toBeCloseTo(slope, 6)
	expect(slope).toBeCloseTo(76.2, 1)
	// …with a non-zero intercept, which is what makes it affine rather than linear.
	expect(at(12) - 12 * slope).toBeGreaterThan(0)
})

test('a fractional rule would have been the volume curve rescaled — it is not', () => {
	const doubled = value(convertWeeklyVolume(runInput({ volume: 10 })).tss)
	const single = value(convertWeeklyVolume(runInput({ volume: 5 })).tss)
	expect(doubled).toBeLessThan(2 * single)
})

// ── §3: the representative ratio ─────────────────────────────────────────────

describe('representativeRatio', () => {
	test('a band bounded on both sides reads its midpoint', () => {
		expect(representativeRatio(COGGAN_POWER_7.zones[1]!)).toBeCloseTo(0.655, 6)
		expect(representativeRatio(OLT_HR_5_RUN.zones[1]!)).toBeCloseTo(0.77, 6)
	})

	test('an open-bottomed band reads the edge nearest threshold, not a meaningless midpoint', () => {
		// stryd Z1 spans 0–0.8 → 0.8, never 0.4
		expect(representativeRatio(STRYD_RUN_POWER_5.zones[0]!)).toBeCloseTo(0.8, 6)
	})

	test('an open-topped band reads its floor, so zone 5 is priced conservatively', () => {
		// friel Z5 is ≥ 1.0 → 1.0
		expect(representativeRatio(FRIEL_HR_5_RUN.zones[4]!)).toBeCloseTo(1.0, 6)
		// css-3 Z1 is unbounded *slow*, so nearest threshold is still its minRatio
		expect(representativeRatio(CSS_3.zones[0]!)).toBeCloseTo(1.25, 6)
	})
})

// ── §4: intensity through the athlete's own anchor and Load Formula ───────────

describe('a band ratio becomes an intensity factor by its own Load Formula', () => {
	// Each case pins `bandIntensityFactor` against the real formula at one hour, so
	// planned and actual TSS cannot drift apart — the commensurability §4 protects.
	const tssPerHour = (
		ratio: number,
		anchor: Parameters<typeof bandIntensityFactor>[0],
		profile: ConversionProfile,
	) => {
		const factor = bandIntensityFactor(anchor, ratio, profile)!
		return factor * factor * 100
	}

	test('maxHr (Olympiatoppen) scales by maxHr / LTHR, both stored', () => {
		const ratio = representativeRatio(OLT_HR_5_RUN.zones[3]!) // I-4 → 0.895
		expect(tssPerHour(ratio, 'maxHr', OLT_RUNNER)).toBeCloseTo(
			hrTSS({ durationSec: 3600, hrAvg: ratio * 195, lthr: 172 }).tss,
			6,
		)
	})

	test('lthr is direct', () => {
		const ratio = representativeRatio(FRIEL_HR_5_RUN.zones[3]!)
		expect(tssPerHour(ratio, 'lthr', OLT_RUNNER)).toBeCloseTo(
			hrTSS({ durationSec: 3600, hrAvg: ratio * 172, lthr: 172 }).tss,
			6,
		)
	})

	test('ftp and runPower are direct', () => {
		const ftpRatio = representativeRatio(COGGAN_POWER_7.zones[3]!)
		expect(tssPerHour(ftpRatio, 'ftp', CYCLIST)).toBeCloseTo(
			coggan({ durationSec: 3600, np: ftpRatio * 250, ftp: 250 }).tss,
			6,
		)
		const powerRatio = representativeRatio(STRYD_RUN_POWER_5.zones[2]!)
		expect(tssPerHour(powerRatio, 'runPower', OLT_RUNNER)).toBeCloseTo(
			coggan({ durationSec: 3600, np: powerRatio * 300, ftp: 300 }).tss,
			6,
		)
	})

	test('thresholdPace and css invert, because those recipes store the slow end first', () => {
		const paceRatio = representativeRatio(DANIELS_PACE_5.zones[2]!) // T → 1.07
		expect(tssPerHour(paceRatio, 'thresholdPace', OLT_RUNNER)).toBeCloseTo(
			rTSS({
				durationSec: 3600,
				paceAvgSecPerKm: paceRatio * 240,
				thresholdPaceSecPerKm: 240,
			}).tss,
			6,
		)
		const cssRatio = representativeRatio(CSS_5.zones[3]!)
		expect(tssPerHour(cssRatio, 'css', SWIMMER)).toBeCloseTo(
			sTSS({
				durationSec: 3600,
				paceAvgSecPer100m: cssRatio * 90,
				cssSecPer100m: 90,
			}).tss,
			6,
		)
	})

	test('rpe has no threshold to form a ratio against', () => {
		expect(bandIntensityFactor('rpe', 0.8, OLT_RUNNER)).toBeNull()
	})

	test('the derivation names which Load Formula it read through', () => {
		expect(convertWeeklyVolume(runInput()).derivation.formula).toBe('hrTSS')
		expect(
			convertWeeklyVolume(runInput({ recipe: DANIELS_PACE_5 })).derivation
				.formula,
		).toBe('rTSS')
	})

	test("the athlete's own zone overrides keep the band's zone declaration", () => {
		const recipe = conversionRecipe({
			zoneSystem: 'olt-hr-5-run',
			zoneOverrides: JSON.stringify({
				'I-4': { minRatio: 0.89, maxRatio: 0.94 },
			}),
		})!
		const band = recipe.zones.find((z) => z.label === 'I-4')!
		expect(band.zone).toBe(4)
		expect(representativeRatio(band)).toBeCloseTo(0.915, 6)
		// an athlete widening their threshold band has not said it stopped being one
		expect(bandForZone(recipe, 4)!.substituted).toBe(false)
	})

	test('a malformed override reads as none rather than as a broken recipe', () => {
		const recipe = conversionRecipe({
			zoneSystem: 'olt-hr-5-run',
			zoneOverrides: '{not json',
		})!
		expect(representativeRatio(recipe.zones[3]!)).toBeCloseTo(0.895, 6)
	})
})

// ── §3: an undeclared zone substitutes, and the substitution is named ─────────

describe('a zone the recipe does not declare', () => {
	const swimInput = (mix: VolumeConversionInput['mix']) =>
		convertWeeklyVolume({
			discipline: 'swim',
			currency: 'hours',
			volume: 4,
			mix,
			recipe: CSS_3,
			profile: SWIMMER,
		})

	test("css-3's { z5: 1 } is read at its CSS-and-faster band, and says so", () => {
		const conversion = swimInput([{ zone: 5, sessionsPerWeek: 1 }])
		expect(conversion.derivation.substitutions).toEqual([
			{ requested: 5, recipeId: 'css-3', band: 'Z3', declaredZone: 4 },
		])
		const source = step(conversion, 'if:z5').source
		expect(source).toMatchObject({
			kind: 'recipe-band',
			band: 'Z3',
			bandDescription: 'CSS and faster',
			declaredZone: 4,
			substitutedFor: 5,
		})
	})

	test('a tie breaks toward threshold, never down into an aerobic band', () => {
		// css-3 declares 1, 2 and 4 — zone 3 is equidistant from 2 and 4.
		const conversion = swimInput([{ zone: 3, sessionsPerWeek: 1 }])
		expect(conversion.derivation.substitutions[0]).toMatchObject({
			requested: 3,
			declaredZone: 4,
		})
	})

	test('a declared zone is never substituted, and the first band declaring it wins', () => {
		const conversion = swimInput([{ zone: 4, sessionsPerWeek: 1 }])
		expect(conversion.derivation.substitutions).toEqual([])
		// coggan declares 5 three times (Z5, Z6, Z7); Z5 is the VO₂ max band meant
		expect(bandForZone(COGGAN_POWER_7, 5)!.band.label).toBe('Z5')
	})

	test('a recipe whose bands declare nothing has no intensity to read', () => {
		const conversion = convertWeeklyVolume(
			runInput({
				currency: 'km',
				volume: 50,
				recipe: { id: 'bare', discipline: 'run', anchor: 'lthr', zones: [] },
			}),
		)
		expect(conversion.tss).toEqual({
			available: false,
			reason: 'no-intensity-source',
		})
		// …and the distance leg is untouched, because the gate is per reading
		expect(value(conversion.hours)).toBeGreaterThan(0)
	})
})

// ── §5: the easy ratio, constant only where it is stable ──────────────────────

test('the easy ratio is 0.83 running and 0.93 swimming, and cycling has none', () => {
	expect(EASY_PACE_RATIO).toEqual({ run: 0.83, swim: 0.93 })
	expect(EASY_PACE_RATIO.bike).toBeUndefined()
})

test('a run week prices easy volume at 0.83 of threshold speed', () => {
	const conversion = convertWeeklyVolume(runInput())
	expect(step(conversion, 'easy-pace-ratio').value).toBe(0.83)
	expect(step(conversion, 'speed:easy').value).toBeCloseTo(0.83 * 15, 6)
})

test('a swim week prices easy volume at 0.93 of CSS speed', () => {
	const conversion = convertWeeklyVolume({
		discipline: 'swim',
		currency: 'hours',
		volume: 4,
		mix: [{ zone: 4, sessionsPerWeek: 1 }],
		recipe: CSS_3,
		profile: SWIMMER,
	})
	// CSS 1:30/100 m is 4 km/h; easy is 3.72 km/h
	expect(step(conversion, 'speed:quality').value).toBeCloseTo(4, 6)
	expect(step(conversion, 'speed:easy').value).toBeCloseTo(3.72, 6)
})

describe("cycling distance comes from the athlete's own ride window", () => {
	const bikeInput = (
		rideWindow: VolumeConversionInput['rideWindow'],
	): VolumeConversionInput => ({
		discipline: 'bike',
		currency: 'hours',
		volume: 10,
		mix: [{ zone: 4, sessionsPerWeek: 1 }],
		recipe: COGGAN_POWER_7,
		profile: CYCLIST,
		rideWindow,
	})

	test('the window sets the speed, and names itself in the derivation', () => {
		const conversion = convertWeeklyVolume(
			bikeInput({
				fromWeekKey: '2026-06-01',
				weeks: 4,
				rides: 11,
				km: 852,
				hours: 30,
			}),
		)
		expect(step(conversion, 'speed:easy').value).toBeCloseTo(28.4, 6)
		expect(step(conversion, 'speed:easy').source).toEqual({
			kind: 'ride-window',
			fromWeekKey: '2026-06-01',
			weeks: 4,
			rides: 11,
		})
		expect(value(conversion.km)).toBeCloseTo(284, 6)
	})

	test('an empty window closes the gate rather than falling back to a constant', () => {
		for (const empty of [
			null,
			undefined,
			{ fromWeekKey: '2026-06-01', weeks: 4, rides: 0, km: 0, hours: 0 },
		]) {
			const conversion = convertWeeklyVolume(bikeInput(empty))
			expect(conversion.km).toEqual({
				available: false,
				reason: 'no-ride-history',
			})
			// hours ↔ TSS is untouched: the gate is per reading, not per track
			expect(conversion.hours.available).toBe(true)
			expect(conversion.tss.available).toBe(true)
		}
	})

	test('no ride window, no easy-pace-ratio convention — nothing is invented', () => {
		const conversion = convertWeeklyVolume(
			bikeInput({
				fromWeekKey: '2026-06-01',
				weeks: 4,
				rides: 11,
				km: 852,
				hours: 30,
			}),
		)
		expect(
			conversion.derivation.steps.some((s) => s.id === 'easy-pace-ratio'),
		).toBe(false)
	})
})

// ── §6: the gate is per reading, not per track ───────────────────────────────

describe('the honesty gate sits per reading', () => {
	const noPace: ConversionProfile = {
		...OLT_RUNNER,
		thresholdPaceSecPerKm: null,
	}

	test('a run track with no threshold pace keeps hours ↔ TSS and loses distance only', () => {
		const fromHours = convertWeeklyVolume(runInput({ profile: noPace }))
		expect(fromHours.hours).toEqual({
			available: true,
			value: 5,
			marker: 'authored',
		})
		expect(value(fromHours.tss)).toBeGreaterThan(0)
		expect(fromHours.km).toEqual({
			available: false,
			reason: 'no-threshold-pace',
		})

		const fromTss = convertWeeklyVolume(
			runInput({ currency: 'tss', volume: 400, profile: noPace }),
		)
		expect(value(fromTss.hours)).toBeCloseTo(4.84, 2)
		expect(fromTss.km.available).toBe(false)
	})

	test('a km-authored track with no pace source loses both other readings', () => {
		const conversion = convertWeeklyVolume(
			runInput({ currency: 'km', volume: 55, profile: noPace }),
		)
		expect(conversion.km).toEqual({
			available: true,
			value: 55,
			marker: 'authored',
		})
		expect(conversion.hours).toEqual({
			available: false,
			reason: 'no-threshold-pace',
		})
		expect(conversion.tss).toEqual({
			available: false,
			reason: 'no-threshold-pace',
		})
	})

	test('a swim track with no CSS says so in its own words', () => {
		const conversion = convertWeeklyVolume({
			discipline: 'swim',
			currency: 'hours',
			volume: 4,
			mix: [],
			recipe: CSS_3,
			profile: { ...SWIMMER, cssSecPer100m: null },
		})
		expect(conversion.km).toEqual({
			available: false,
			reason: 'no-critical-swim-speed',
		})
	})

	test('no zone system loses TSS and keeps km ↔ hours, which needs no recipe', () => {
		const conversion = convertWeeklyVolume(
			runInput({ currency: 'km', volume: 55, recipe: null }),
		)
		expect(conversion.tss).toEqual({
			available: false,
			reason: 'no-zone-recipe',
		})
		expect(value(conversion.hours)).toBeGreaterThan(0)
		expect(conversion.derivation.formula).toBeNull()
	})

	test('an Olympiatoppen recipe with no stored LTHR cannot form an intensity factor', () => {
		const conversion = convertWeeklyVolume(
			runInput({ profile: { ...OLT_RUNNER, lthr: null } }),
		)
		expect(conversion.tss).toEqual({
			available: false,
			reason: 'no-heart-rate-anchor',
		})
		// the distance leg still reads: it needs a pace, not a heart rate
		expect(value(conversion.km)).toBeGreaterThan(0)
	})

	test('`sets` produces no reading in any direction', () => {
		for (const input of [
			{ discipline: 'strength' as const, currency: 'sets' as const },
			{ discipline: 'run' as const, currency: 'sets' as const },
		]) {
			const conversion = convertWeeklyVolume(runInput({ ...input, volume: 18 }))
			for (const reading of [conversion.km, conversion.hours, conversion.tss]) {
				expect(reading).toEqual({
					available: false,
					reason: 'sets-has-no-reading',
				})
			}
			expect(conversion.buckets).toEqual([])
			expect(conversion.derivation.steps).toEqual([])
		}
	})
})

// ── §9: authored | derived, and never a Load Confidence ──────────────────────

test('every reading carries authored or derived, and only the authored one says authored', () => {
	const conversion = convertWeeklyVolume(runInput({ currency: 'hours' }))
	expect(conversion.hours).toMatchObject({ marker: 'authored' })
	expect(conversion.km).toMatchObject({ marker: 'derived' })
	expect(conversion.tss).toMatchObject({ marker: 'derived' })
})

test('no reading carries a Load Confidence grade', () => {
	const conversion = convertWeeklyVolume(runInput({ currency: 'tss' }))
	const serialised = JSON.stringify(conversion)
	expect(serialised).not.toContain('confidence')
	// …and none of Load Confidence's three words leaks in as a value
	for (const grade of ['"high"', '"medium"', '"low"']) {
		expect(serialised).not.toContain(grade)
	}
})

// ── §10: structured data, and every non-authored number names its source ─────

describe('the derivation', () => {
	const cases: Array<[string, VolumeConversion]> = [
		['hours authored', convertWeeklyVolume(runInput({ currency: 'hours' }))],
		[
			'tss authored',
			convertWeeklyVolume(runInput({ currency: 'tss', volume: 400 })),
		],
		[
			'km authored',
			convertWeeklyVolume(runInput({ currency: 'km', volume: 55 })),
		],
		[
			'with a substitution',
			convertWeeklyVolume({
				discipline: 'swim',
				currency: 'hours',
				volume: 4,
				mix: [{ zone: 5, sessionsPerWeek: 1 }],
				recipe: CSS_3,
				profile: SWIMMER,
			}),
		],
	]

	test.each(cases)(
		'%s: every number that is not authored names its source',
		(_name, conversion) => {
			const authored = conversion.derivation.steps.filter(
				(s) => s.source.kind === 'authored',
			)
			expect(authored).toHaveLength(1)

			const ids = new Set(conversion.derivation.steps.map((s) => s.id))
			for (const s of conversion.derivation.steps) {
				expect(typeof s.value).toBe('number')
				expect(Number.isFinite(s.value)).toBe(true)
				expect(s.source.kind).toBeTruthy()
				expect(s.unit).toBeTruthy()
				// arithmetic names the steps it combined, and they all exist
				if (s.source.kind === 'arithmetic') {
					expect(s.source.from.length).toBeGreaterThan(0)
					for (const from of s.source.from) expect(ids.has(from)).toBe(true)
				}
			}
		},
	)

	test.each(cases)(
		'%s: no step is a preformatted string',
		(_name, conversion) => {
			for (const s of conversion.derivation.steps) {
				expect(typeof s.value).not.toBe('string')
			}
			expect(typeof conversion.derivation).toBe('object')
		},
	)

	test('the conventions are named as convention, never as measurement', () => {
		const conversion = convertWeeklyVolume(runInput())
		const conventions = conversion.derivation.steps.filter(
			(s) => s.source.kind === 'convention',
		)
		expect(
			conventions.map((s) =>
				s.source.kind === 'convention' ? s.source.convention : null,
			),
		).toEqual(['minutes-in-zone-per-session', 'easy-pace-ratio'])
		for (const s of conventions) {
			if (s.source.kind !== 'convention') throw new Error('unreachable')
			expect(s.source.citation.length).toBeGreaterThan(0)
		}
	})

	test('a stored threshold is named by its column, so the chain is checkable', () => {
		expect(
			step(convertWeeklyVolume(runInput()), 'speed:quality').source,
		).toEqual({ kind: 'threshold', field: 'thresholdPaceSecPerKm' })
	})

	test('minutes in zone are the documented absolute figures', () => {
		expect(MINUTES_IN_ZONE_PER_SESSION).toEqual({ 3: 45, 4: 35, 5: 20 })
	})
})

// ── §2: the soft warning, and nothing corrected ──────────────────────────────

describe('a mix whose quality volume alone exceeds the week', () => {
	// 20 km/wk with { z4: 2, z5: 1 } — the ADR's own example.
	const conversion = convertWeeklyVolume(
		runInput({
			currency: 'km',
			volume: 20,
			mix: [
				{ zone: 4, sessionsPerWeek: 2 },
				{ zone: 5, sessionsPerWeek: 1 },
			],
		}),
	)

	test('warns softly, with numbers and no wording', () => {
		expect(conversion.warnings).toEqual([
			{ currency: 'km', authored: 20, quality: 22.5 },
		])
	})

	test('the easy bucket floors at zero', () => {
		const easy = conversion.buckets.find((b) => b.kind === 'easy')!
		expect(easy.hours).toBe(0)
		expect(easy.km).toBe(0)
		expect(easy.tss).toBe(0)
	})

	test('nothing is corrected — the quality buckets keep their own volume', () => {
		const qualityKm = conversion.buckets
			.filter((b) => b.kind === 'quality')
			.reduce((total, b) => total + b.km!, 0)
		expect(qualityKm).toBeCloseTo(22.5, 6)
		// the authored figure is still the authored figure, unedited
		expect(conversion.km).toEqual({
			available: true,
			value: 20,
			marker: 'authored',
		})
	})

	test('an hours-authored week overflows in hours, and a TSS-authored one in TSS', () => {
		const hours = convertWeeklyVolume(
			runInput({
				currency: 'hours',
				volume: 1,
				mix: [{ zone: 3, sessionsPerWeek: 2 }],
			}),
		)
		expect(hours.warnings).toEqual([
			{ currency: 'hours', authored: 1, quality: 1.5 },
		])
		const tss = convertWeeklyVolume(
			runInput({
				currency: 'tss',
				volume: 50,
				mix: [{ zone: 4, sessionsPerWeek: 2 }],
			}),
		)
		expect(tss.warnings[0]).toMatchObject({ currency: 'tss', authored: 50 })
	})

	test('a week the mix fits inside warns about nothing', () => {
		expect(convertWeeklyVolume(runInput()).warnings).toEqual([])
	})
})

// ── §11: the conversion never reads a Week Pattern ───────────────────────────

test('the conversion never reads a Week Pattern', () => {
	// Structural, not a promise in a comment: no `share` weight can reach this
	// arithmetic, because no stored field says which weeks a pattern governs.
	for (const file of [
		'volume-conversion.ts',
		'volume-conversion.server.ts',
	] as const) {
		const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
		const imports = source.match(/^import[\s\S]*?from '[^']+'/gm) ?? []
		expect(imports.length).toBeGreaterThan(0)
		for (const line of imports) {
			expect(line).not.toMatch(/week-pattern/)
		}
	}
})
