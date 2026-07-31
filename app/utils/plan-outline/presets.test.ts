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
	findPreset,
	presetPhaseSpecs,
	presetProfile,
	presetSegmentSpecs,
	presetWeeks,
	type PeriodizationPreset,
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

describe('what ships', () => {
	test('three presets, the Friel-family shapes', () => {
		expect(PRESET_KEYS).toEqual(['classic-linear', 'masters-2-1', 'big-base'])
		expect(PERIODIZATION_PRESETS.map((p) => p.key)).toEqual([...PRESET_KEYS])
	})

	test('a preset is found by key, and an unknown key is not one', () => {
		expect(findPreset('masters-2-1')?.name).toMatch(/masters/i)
		expect(findPreset('block')).toBeNull()
		expect(findPreset('')).toBeNull()
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
						anchors: [
							{ fromWeekIndex: 0, value: PRESET_PROFILE_ANCHOR },
						],
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

describe('the three shapes are three different pictures', () => {
	const byKey = (key: string) => findPreset(key) as PeriodizationPreset

	test('masters recovers more often than classic over a comparable season', () => {
		const recoveryShare = (preset: PeriodizationPreset) => {
			const phases = presetPhaseSpecs(preset)
			const weeks = totalWeeks(phases)
			const recovery = Array.from({ length: weeks }, (_, w) =>
				weekRole(phases, w),
			).filter((role) => role === 'recovery').length
			return recovery / weeks
		}
		expect(recoveryShare(byKey('masters-2-1'))).toBeGreaterThan(
			recoveryShare(byKey('classic-linear')),
		)
	})

	test('big base spends more of its season in the opening phase than classic does', () => {
		const baseShare = (preset: PeriodizationPreset) =>
			preset.phases[0]!.weeks / presetWeeks(preset)
		expect(baseShare(byKey('big-base'))).toBeGreaterThan(
			baseShare(byKey('classic-linear')),
		)
	})

	test('big base steps volume down entering its intensity-led block', () => {
		const preset = byKey('big-base')
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
	})

	test('classic and masters keep climbing across the boundary they author no step on', () => {
		for (const key of ['classic-linear', 'masters-2-1']) {
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
})
