import { describe, expect, test } from 'vitest'
import { MAX_PLAN_WEEKS } from './authoring-schema.ts'
import {
	DEFAULT_RECOVERY_CUT,
	VOLUME_CURRENCIES,
	totalWeeks,
	weekRole,
	weekTargets,
} from './derive.ts'
import {
	PERIODIZATION_PRESETS,
	PRESET_KEYS,
	PRESET_PROFILE_ANCHOR,
	PRESET_RAMP,
	presetFor,
	presetPhaseSpecs,
	presetProfile,
	presetSegmentSpecs,
	presetWeeks,
	type PeriodizationPreset,
	type PresetKey,
} from './presets.ts'
import { RAMP_GUARD_MAX } from './ramp-guard.ts'

const round = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10)

/** Every key appearing anywhere in a value, however deeply nested. */
function deepKeys(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(deepKeys)
	if (value && typeof value === 'object') {
		return Object.entries(value).flatMap(([key, child]) => [
			key,
			...deepKeys(child),
		])
	}
	return []
}

/** The three families, each as its short, standard and long variant. */
const FAMILIES = {
	classic: ['classic-linear-short', 'classic-linear', 'classic-linear-long'],
	masters: ['masters-2-1-short', 'masters-2-1', 'masters-2-1-long'],
	bigBase: ['big-base-short', 'big-base', 'big-base-long'],
} as const satisfies Record<string, readonly PresetKey[]>

describe('what ships', () => {
	test('nine presets: three families at three lengths each', () => {
		expect(PRESET_KEYS).toEqual([
			'classic-linear-short',
			'classic-linear',
			'classic-linear-long',
			'masters-2-1-short',
			'masters-2-1',
			'masters-2-1-long',
			'big-base-short',
			'big-base',
			'big-base-long',
		])
		expect(PERIODIZATION_PRESETS.map((p) => p.key)).toEqual([...PRESET_KEYS])
	})

	test('every shape has a distinct name — the athlete picks by it', () => {
		const names = PERIODIZATION_PRESETS.map((preset) => preset.name)
		expect(new Set(names).size).toBe(names.length)
	})

	test('a family is one shape at three lengths, differing in nothing else', () => {
		for (const keys of Object.values(FAMILIES)) {
			const [short, standard, long] = keys.map(presetFor)
			for (const variant of [short!, long!]) {
				// Same blocks, same rhythm, same climb, same quality — length only.
				expect(variant.phases.map((phase) => phase.name)).toEqual(
					standard!.phases.map((phase) => phase.name),
				)
				expect(
					variant.phases.map(({ weeks: _weeks, ...shape }) => shape),
				).toEqual(standard!.phases.map(({ weeks: _weeks, ...shape }) => shape))
			}
			// And they really are three different lengths, in order.
			const weeks = keys.map((key) => presetWeeks(presetFor(key)))
			expect(weeks[0]).toBeLessThan(weeks[1]!)
			expect(weeks[1]).toBeLessThan(weeks[2]!)
		}
	})

	test('every run-in from 10 to 27 weeks is within two weeks of a shipped shape', () => {
		// The reason nine shapes ship rather than three. A shape still stretches
		// nothing, so coverage is a property of *how many shapes there are* — and the
		// remainder is what the documented shortening rule absorbs. Two weeks is the
		// worst case across this band; the band itself is what a season-length run-in
		// looks like.
		const lengths = PERIODIZATION_PRESETS.map((preset) => presetWeeks(preset))
		const worst = Array.from({ length: 18 }, (_, index) => {
			const runIn = index + 10
			const nearest = Math.min(
				...lengths.map((length) => Math.abs(length - runIn)),
			)
			return { runIn, nearest }
		}).filter(({ nearest }) => nearest > 2)

		expect(worst).toEqual([])
	})

	test('the Peak and the Taper hold at two weeks in every shape', () => {
		// Shortening a season shortens the run-up to the Event, never the sharpening
		// at the end — the same ordering the fitting rule states, expressed in what
		// ships rather than in what a resize does.
		for (const preset of PERIODIZATION_PRESETS) {
			expect(preset.phases.at(-1)?.weeks).toBe(2)
			expect(preset.phases.at(-2)?.weeks).toBe(2)
		}
	})

	test('every key names a preset, and it is the one it names', () => {
		for (const key of PRESET_KEYS) {
			expect(presetFor(key).key).toBe(key)
		}
		expect(presetFor('masters-2-1').name).toMatch(/masters/i)
	})

	test('every preset fits inside a plan', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			expect(presetWeeks(preset)).toBeGreaterThan(0)
			expect(presetWeeks(preset)).toBeLessThanOrEqual(MAX_PLAN_WEEKS)
		}
	})

	test('a preset opens with a phase that loads and closes with one that tapers', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			expect(preset.phases.at(0)?.tapers).toBe(false)
			expect(preset.phases.at(-1)?.tapers).toBe(true)
		}
	})
})

describe('a preset is shape, never size', () => {
	test('no preset carries a Volume Currency, an anchor value or a start week', () => {
		const keys = new Set(deepKeys(PERIODIZATION_PRESETS))
		expect(keys.has('currency')).toBe(false)
		expect(keys.has('anchorValue')).toBe(false)
		expect(keys.has('anchors')).toBe(false)
		expect(keys.has('startWeekKey')).toBe(false)
	})

	test('every preset leaves recoveryCut and taperCut unset, so the convention applies', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			for (const segment of presetSegmentSpecs(preset)) {
				expect(segment.recoveryCut).toBeNull()
				expect(segment.taperCut).toBeNull()
			}
		}
	})

	test('phases are fixed length: a preset never reads a horizon', () => {
		// `presetWeeks` takes the preset and nothing else. A preset that could stretch
		// would need a run-in to stretch to, and there is nowhere to pass one.
		expect(presetWeeks(PERIODIZATION_PRESETS[0]!)).toBe(
			presetWeeks(PERIODIZATION_PRESETS[0]!),
		)
		for (const preset of PERIODIZATION_PRESETS) {
			expect(presetWeeks(preset)).toBe(totalWeeks(presetPhaseSpecs(preset)))
		}
	})
})

describe('the ramps are the convention', () => {
	test('no preset ships a ramp its own guard would warn about', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			for (const segment of presetSegmentSpecs(preset)) {
				if (segment.ramp != null) {
					expect(segment.ramp).toBeLessThanOrEqual(RAMP_GUARD_MAX)
					expect(segment.ramp).toBeGreaterThan(0)
				}
			}
		}
	})

	test('the ramp a preset authors is the ~5%/week convention', () => {
		expect(PRESET_RAMP).toBeCloseTo(0.05, 10)
		const authored = PERIODIZATION_PRESETS.flatMap((preset) =>
			presetSegmentSpecs(preset)
				.map((segment) => segment.ramp)
				.filter((ramp): ramp is number => ramp != null),
		)
		expect(authored.length).toBeGreaterThan(0)
		expect(new Set(authored)).toEqual(new Set([PRESET_RAMP]))
	})

	test('a boundary step is only ever a deliberate drop', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			for (const segment of presetSegmentSpecs(preset)) {
				if (segment.boundaryStep != null) {
					expect(segment.boundaryStep).toBeLessThan(0)
				}
			}
		}
	})
})

describe('the Quality Session Mix each preset authors', () => {
	test('zones 3–5 only, never twice, never fewer than one session', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			for (const phase of preset.phases) {
				const zones = phase.mix.map((entry) => entry.zone)
				expect(new Set(zones).size).toBe(zones.length)
				for (const entry of phase.mix) {
					expect([3, 4, 5]).toContain(entry.zone)
					expect(entry.sessionsPerWeek).toBeGreaterThanOrEqual(1)
				}
			}
		}
	})

	test('the tapering phase authors an empty mix, which is a positive statement', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			expect(preset.phases.at(-1)?.mix).toEqual([])
		}
	})

	test('intensity climbs as the season does: zone 3 in the opening phase, zone 5 by the peak', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			expect(preset.phases.at(0)?.mix.map((e) => e.zone)).toEqual([3])
			const zones = preset.phases.flatMap((p) => p.mix.map((e) => e.zone))
			expect(zones).toContain(5)
		}
	})
})

describe('the preview is drawn through the real derivation', () => {
	test('one value per week of the preset', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			expect(presetProfile(preset)).toHaveLength(presetWeeks(preset))
		}
	})

	test('no week of a preset is Unavailable', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			for (const week of presetProfile(preset)) {
				expect(week).not.toBeNull()
			}
		}
	})

	test('the profile opens at the anchor', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			expect(presetProfile(preset)[0]).toBeCloseTo(PRESET_PROFILE_ANCHOR, 10)
		}
	})

	test('the profile is unit-free — the same numbers in every currency', () => {
		// A preset carries no Volume Currency, so nothing about the picture may
		// depend on one. `presetProfile` has to hand the derivation *some* currency
		// because `TrackSpec` demands one; this pins that the choice cannot show.
		for (const preset of PERIODIZATION_PRESETS) {
			for (const currency of VOLUME_CURRENCIES) {
				expect(
					weekTargets(presetPhaseSpecs(preset), {
						currency,
						anchors: [{ fromWeekIndex: 0, value: PRESET_PROFILE_ANCHOR }],
						segments: presetSegmentSpecs(preset),
						overrides: [],
					}),
				).toEqual(presetProfile(preset))
			}
		}
	})

	test('a recovery week dips by the documented convention, not by a stored number', () => {
		// The dip is `DEFAULT_RECOVERY_CUT` because the preset left `recoveryCut`
		// unset — the clearest evidence that the picture came through the real
		// derivation rather than from a hand-drawn shape.
		for (const preset of PERIODIZATION_PRESETS) {
			const phases = presetPhaseSpecs(preset)
			const profile = presetProfile(preset)
			const recovery = profile.findIndex(
				(_, week) => weekRole(phases, week) === 'recovery',
			)
			expect(recovery).toBeGreaterThan(0)
			const previousLoading = profile[recovery - 1]!
			expect(round(profile[recovery]!)).toBe(
				round(previousLoading * (1 - DEFAULT_RECOVERY_CUT)),
			)
		}
	})

	test('the taper descends across its weeks rather than dropping in the last one', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			const phases = presetPhaseSpecs(preset)
			const profile = presetProfile(preset)
			const taper = profile
				.map((value, week) => ({ value: value!, week }))
				.filter(({ week }) => weekRole(phases, week) === 'taper')
			expect(taper.length).toBeGreaterThan(1)
			for (let i = 1; i < taper.length; i++) {
				expect(taper[i]!.value).toBeLessThan(taper[i - 1]!.value)
			}
		}
	})

	test('the profile ends below its own peak — every preset arrives rested', () => {
		for (const preset of PERIODIZATION_PRESETS) {
			const profile = presetProfile(preset).map((v) => v!)
			expect(profile.at(-1)!).toBeLessThan(Math.max(...profile))
		}
	})
})

describe('the three families are three different pictures', () => {
	const byKey = (key: PresetKey) => presetFor(key)
	/** The three families lined up at the same length, short to long. */
	const AT_EACH_LENGTH = [0, 1, 2] as const

	test('masters recovers more often than classic at every length', () => {
		const recoveryShare = (preset: PeriodizationPreset) => {
			const phases = presetPhaseSpecs(preset)
			const weeks = totalWeeks(phases)
			const recovery = Array.from({ length: weeks }, (_, w) =>
				weekRole(phases, w),
			).filter((role) => role === 'recovery').length
			return recovery / weeks
		}
		for (const length of AT_EACH_LENGTH) {
			expect(recoveryShare(byKey(FAMILIES.masters[length]))).toBeGreaterThan(
				recoveryShare(byKey(FAMILIES.classic[length])),
			)
		}
	})

	test('big base spends more of its season in the opening phase than classic does, at every length', () => {
		const baseShare = (preset: PeriodizationPreset) =>
			preset.phases[0]!.weeks / presetWeeks(preset)
		for (const length of AT_EACH_LENGTH) {
			expect(baseShare(byKey(FAMILIES.bigBase[length]))).toBeGreaterThan(
				baseShare(byKey(FAMILIES.classic[length])),
			)
		}
	})

	test('every big base steps volume down entering its intensity-led block', () => {
		for (const key of FAMILIES.bigBase) {
			const preset = byKey(key)
			const phases = presetPhaseSpecs(preset)
			const profile = presetProfile(preset)
			const buildOpens = phases[0]!.weeks
			// The week the second phase opens on sits below the loading week before it:
			// an authored Block Boundary Step, which is intent and never a defect.
			const lastOfBase = profile
				.slice(0, buildOpens)
				.filter((_, week) => weekRole(phases, week) === 'loading')
				.at(-1)!
			expect(profile[buildOpens]!).toBeLessThan(lastOfBase)
		}
	})

	test('classic and masters keep climbing across the boundary they author no step on', () => {
		for (const key of [...FAMILIES.classic, ...FAMILIES.masters]) {
			const preset = byKey(key)
			const phases = presetPhaseSpecs(preset)
			const profile = presetProfile(preset)
			const buildOpens = phases[0]!.weeks
			const lastOfBase = profile
				.slice(0, buildOpens)
				.filter((_, week) => weekRole(phases, week) === 'loading')
				.at(-1)!
			expect(profile[buildOpens]!).toBeGreaterThan(lastOfBase)
		}
	})

	test('the shortest shape the app ships is a masters one, and it recovers', () => {
		// A 2:1 block still recovers at three weeks where a 3:1 block needs four, so
		// the family that compresses furthest is the one whose rhythm survives being
		// compressed. A shape whose named rhythm never appeared in it would be a
		// shape lying about itself.
		const shortest = PERIODIZATION_PRESETS.reduce((best, preset) =>
			presetWeeks(preset) < presetWeeks(best) ? preset : best,
		)
		expect(shortest.key).toBe('masters-2-1-short')
		const phases = presetPhaseSpecs(shortest)
		const roles = Array.from({ length: presetWeeks(shortest) }, (_, week) =>
			weekRole(phases, week),
		)
		expect(roles).toContain('recovery')
	})
})
