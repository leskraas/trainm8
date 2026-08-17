import { expect, test } from 'vitest'
import {
	type Anchor,
	type ResolveContext,
	loadResolutionText,
	resolveAnchor,
	resolveLoadTarget,
} from './anchors.ts'

// ——— The fixtures ————————————————————————————————————————————————————————

const TODAY = '2026-03-20T10:00:00.000Z'

function anchor(overrides: Partial<Anchor> = {}): Anchor {
	return {
		construct: 'oneRm',
		valueKg: 140,
		reps: null,
		protocol: 'tested',
		confidence: 'high',
		effectiveAtISO: '2026-02-01T00:00:00.000Z',
		...overrides,
	}
}

function ctx(overrides: Partial<ResolveContext> = {}): ResolveContext {
	return {
		anchors: [anchor()],
		bodyweightKg: 80,
		asOfISO: TODAY,
		...overrides,
	}
}

// ——— As-of resolution ————————————————————————————————————————————————————

test('the latest anchor effective on or before the day asked about is the one that resolves', () => {
	const found = resolveAnchor(
		[
			anchor({ valueKg: 130, effectiveAtISO: '2026-01-01T00:00:00.000Z' }),
			anchor({ valueKg: 140, effectiveAtISO: '2026-02-01T00:00:00.000Z' }),
		],
		'oneRm',
		null,
		TODAY,
	)
	expect(found?.valueKg).toBe(140)
})

test('an anchor effective after the day asked about is invisible to that day, so an old session still reads against the anchor it was prescribed from', () => {
	const found = resolveAnchor(
		[
			anchor({ valueKg: 130, effectiveAtISO: '2026-01-01T00:00:00.000Z' }),
			anchor({ valueKg: 140, effectiveAtISO: '2026-02-01T00:00:00.000Z' }),
		],
		'oneRm',
		null,
		'2026-01-15T00:00:00.000Z',
	)
	expect(found?.valueKg).toBe(130)
})

test('an athlete with no anchors of that construct resolves to nothing rather than to the nearest one', () => {
	expect(resolveAnchor([anchor()], 'repMax', 5, TODAY)).toBeNull()
})

// ——— % 1RM ———————————————————————————————————————————————————————————————

test('85 % of a tested 140 kg squat resolves to 119 kg and names the anchor it used', () => {
	const resolution = resolveLoadTarget({ kind: 'pct1RM', minPct: 85 }, ctx())
	expect(resolution.kind).toBe('resolved')
	if (resolution.kind !== 'resolved') return
	expect(resolution.kg).toBe(119)
	expect(resolution.basis).toMatchObject({
		construct: 'oneRm',
		protocol: 'tested',
		confidence: 'high',
		anchorValueKg: 140,
	})
	expect(loadResolutionText(resolution)).toContain('119 kg')
})

test('a percentage resolved from an estimate names the formula and the reps it was read from, so the number stays reconstructible', () => {
	const resolution = resolveLoadTarget(
		{ kind: 'pct1RM', minPct: 80 },
		ctx({
			anchors: [
				anchor({
					construct: 'estimatedOneRm',
					valueKg: 120,
					reps: 8,
					protocol: 'epley',
					confidence: 'low',
				}),
			],
		}),
	)
	expect(resolution.kind).toBe('resolved')
	if (resolution.kind !== 'resolved') return
	expect(resolution.kg).toBe(96)
	expect(resolution.basis).toMatchObject({
		construct: 'estimatedOneRm',
		protocol: 'epley',
		anchorReps: 8,
		confidence: 'low',
	})
	expect(loadResolutionText(resolution)).toContain('epley')
})

test('a tested 1RM is preferred over an estimate of the same day, because one of them is a measurement', () => {
	const resolution = resolveLoadTarget(
		{ kind: 'pct1RM', minPct: 100 },
		ctx({
			anchors: [
				anchor({ valueKg: 140, effectiveAtISO: '2026-02-01T00:00:00.000Z' }),
				anchor({
					construct: 'estimatedOneRm',
					valueKg: 150,
					reps: 8,
					protocol: 'epley',
					confidence: 'low',
					effectiveAtISO: '2026-02-01T00:00:00.000Z',
				}),
			],
		}),
	)
	expect(resolution.kind === 'resolved' && resolution.kg).toBe(140)
})

test('a percentage range resolves to a range, not quietly to its bottom end', () => {
	const resolution = resolveLoadTarget(
		{ kind: 'pct1RM', minPct: 80, maxPct: 85 },
		ctx(),
	)
	expect(resolution.kind).toBe('resolved')
	if (resolution.kind !== 'resolved') return
	expect(resolution.kg).toBe(112)
	expect(resolution.kgMax).toBe(119)
})

test('a percentage with no 1RM and no estimate on file states the absence and what would fix it', () => {
	const resolution = resolveLoadTarget(
		{ kind: 'pct1RM', minPct: 85 },
		ctx({ anchors: [] }),
	)
	expect(resolution.kind).toBe('unavailable')
	if (resolution.kind !== 'unavailable') return
	expect(resolution.reason).toBe('no-anchor')
	expect(resolution.fix.length).toBeGreaterThan(10)
})

// ——— repMax is a peer, not a derivative ——————————————————————————————————

test('an 8RM cannot be fabricated from a 5RM, so it refuses', () => {
	const resolution = resolveLoadTarget(
		{ kind: 'repMax', reps: 8 },
		ctx({
			anchors: [
				anchor({
					construct: 'repMax',
					reps: 5,
					valueKg: 120,
					protocol: 'rep-max-observed',
					confidence: 'high',
				}),
			],
		}),
	)
	expect(resolution.kind).toBe('unavailable')
	if (resolution.kind !== 'unavailable') return
	expect(resolution.reason).toBe('no-anchor')
})

test('an 8RM on file at exactly eight reps resolves without touching a 1RM', () => {
	const resolution = resolveLoadTarget(
		{ kind: 'repMax', reps: 8 },
		ctx({
			anchors: [
				anchor({
					construct: 'repMax',
					reps: 8,
					valueKg: 70,
					protocol: 'rep-max-observed',
					confidence: 'high',
				}),
			],
		}),
	)
	expect(resolution.kind).toBe('resolved')
	if (resolution.kind !== 'resolved') return
	expect(resolution.kg).toBe(70)
	expect(resolution.basis.construct).toBe('repMax')
})

test('an 8RM is not round-tripped through a 1RM and back, so a tested 1RM alone does not resolve it', () => {
	// Every conversion to 1RM and back is a round trip through a ±10 % transform,
	// twice, and `@ 8RM` is already a complete instruction.
	const resolution = resolveLoadTarget({ kind: 'repMax', reps: 8 }, ctx())
	expect(resolution.kind === 'unavailable' && resolution.reason).toBe(
		'no-anchor',
	)
})

// ——— Bodyweight ———————————————————————————————————————————————————————————

test('bodyweight, bodyweight + 20 kg and % bodyweight all resolve against the athlete on file', () => {
	const bare = resolveLoadTarget({ kind: 'bodyweight' }, ctx())
	expect(bare.kind === 'resolved' && bare.kg).toBe(80)
	const weighted = resolveLoadTarget({ kind: 'bodyweight', addedKg: 20 }, ctx())
	expect(weighted.kind === 'resolved' && weighted.kg).toBe(100)
	const pct = resolveLoadTarget({ kind: 'pctBodyweight', pct: 75 }, ctx())
	expect(pct.kind === 'resolved' && pct.kg).toBe(60)
})

test('a bodyweight-derived prescription with no bodyweight on file says so plainly rather than showing a number nobody measured', () => {
	const noWeight = ctx({ bodyweightKg: null })
	for (const target of [
		{ kind: 'bodyweight' } as const,
		{ kind: 'bodyweight', addedKg: 20 } as const,
		{ kind: 'pctBodyweight', pct: 75 } as const,
	]) {
		const resolution = resolveLoadTarget(target, noWeight)
		expect(resolution.kind).toBe('unavailable')
		if (resolution.kind !== 'unavailable') continue
		expect(resolution.reason).toBe('no-bodyweight')
		expect(resolution.fix).toContain('bodyweight')
	}
})

test('an assist heavier than the athlete is not a lighter set, it is a number that cannot be true', () => {
	const resolution = resolveLoadTarget(
		{ kind: 'bodyweight', addedKg: -90 },
		ctx(),
	)
	expect(resolution.kind === 'unavailable' && resolution.reason).toBe(
		'not-resolvable',
	)
})

// ——— The permanent refusal ————————————————————————————————————————————————

test('velocity is authorable and athlete-reported, so it is permanently not app-computed', () => {
	const resolution = resolveLoadTarget({ kind: 'velocity', minMs: 0.4 }, ctx())
	expect(resolution.kind).toBe('unavailable')
	if (resolution.kind !== 'unavailable') return
	expect(resolution.reason).toBe('not-resolvable')
})

// ——— The rest of the contract ————————————————————————————————————————————

test('an absolute load passes through and still states where its number came from', () => {
	const resolution = resolveLoadTarget({ kind: 'absolute', kg: 102.5 }, ctx())
	expect(resolution.kind).toBe('resolved')
	if (resolution.kind !== 'resolved') return
	expect(resolution.kg).toBe(102.5)
	expect(resolution.basis.construct).toBe('authored')
	expect(resolution.basis.confidence).toBeNull()
})

test('an anchor the athlete typed carries no confidence grade into the resolution', () => {
	const resolution = resolveLoadTarget(
		{ kind: 'pct1RM', minPct: 90 },
		ctx({
			anchors: [
				// ADR 0054: the app does not grade a figure somebody stated about
				// themselves — not even if a caller hands one over.
				anchor({
					protocol: 'athlete-stated',
					confidence: 'high',
					valueKg: 100,
				}),
			],
		}),
	)
	expect(resolution.kind).toBe('resolved')
	if (resolution.kind !== 'resolved') return
	expect(resolution.basis.confidence).toBeNull()
})

test('an unavailable resolution carries the authored form, so no caller can render a kilo the anchors do not support', () => {
	const resolution = resolveLoadTarget(
		{ kind: 'repMax', reps: 8 },
		ctx({ anchors: [] }),
	)
	expect(resolution.kind).toBe('unavailable')
	if (resolution.kind !== 'unavailable') return
	// The authored form plus the stated absence, and structurally no `kg` to read.
	expect(resolution.authored).toEqual({ kind: 'repMax', reps: 8 })
	expect(resolution).not.toHaveProperty('kg')
	expect(loadResolutionText(resolution)).not.toMatch(/\d+(\.\d+)? kg/)
})
