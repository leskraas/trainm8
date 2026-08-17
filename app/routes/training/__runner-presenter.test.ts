import { expect, test } from 'vitest'
import { type LiftOutcome } from '#app/utils/strength/program-engine.ts'
import { type PlateInventory } from '#app/utils/strength/plates.ts'
import { type LogRow } from '#app/utils/strength-log.server.ts'
import {
	buildOutcomePanel,
	buildPlateLine,
	buildResolutionDetail,
	buildTargetText,
} from './__runner-presenter.ts'

function row(overrides: Partial<LogRow> = {}): LogRow {
	return {
		orderIndex: 0,
		exerciseSetId: 'set-1',
		prescribedReps: 5,
		prescribedDurationSec: null,
		prescribedLoad: { kind: 'absolute', kg: 100 },
		resolvedLoad: null,
		warmupRung: null,
		logged: null,
		ghost: null,
		...overrides,
	}
}

const gym: PlateInventory = {
	bars: [{ label: 'Olympic', weightKg: 20 }],
	plates: [
		{ weightKg: 20, count: 2 },
		{ weightKg: 10, count: 2 },
		{ weightKg: 5, count: 1 },
		{ weightKg: 2.5, count: 1 },
	],
	fixedDumbbellsKg: null,
}

// ——— The row's target ————————————————————————————————————————————————————

test('an absolute load reads as itself, and is not resolved twice', () => {
	expect(
		buildTargetText(
			row({
				resolvedLoad: {
					kind: 'resolved',
					kg: 100,
					kgMax: null,
					basis: {
						construct: 'authored',
						protocol: null,
						confidence: null,
						anchorValueKg: null,
						anchorReps: null,
						effectiveAtISO: null,
						text: 'as prescribed',
					},
				},
			}),
		),
	).toBe('5 reps · 100 kg')
})

test('an unresolved percentage renders the authored form plus its stated absence, never a number', () => {
	const text = buildTargetText(
		row({
			prescribedLoad: { kind: 'pct1RM', minPct: 85 },
			resolvedLoad: {
				kind: 'unavailable',
				reason: 'no-anchor',
				authored: { kind: 'pct1RM', minPct: 85 },
				text: 'no 1RM on file for this lift',
				fix: 'Record a 1RM for this lift.',
			},
		}),
	)

	expect(text).toContain('85% 1RM')
	expect(text).toContain('no 1RM on file')
	// The failure this rule exists to prevent: any kilo at all beside an anchor
	// nobody has.
	expect(text).not.toMatch(/\d+(\.\d+)?\s*kg/)
})

test('a resolved percentage carries the athlete’s own kilos after the authored form', () => {
	expect(
		buildTargetText(
			row({
				prescribedLoad: { kind: 'pct1RM', minPct: 85 },
				resolvedLoad: {
					kind: 'resolved',
					kg: 119,
					kgMax: null,
					basis: {
						construct: 'oneRm',
						protocol: 'tested',
						confidence: null,
						anchorValueKg: 140,
						anchorReps: null,
						effectiveAtISO: '2026-06-01T00:00:00.000Z',
						text: '85 % of your tested 140 kg 1RM',
					},
				},
			}),
		),
	).toBe('5 reps · 85% 1RM · 119 kg')
})

test('the provenance of an absence is the fix, so the detail has somewhere to send you', () => {
	expect(
		buildResolutionDetail({
			kind: 'unavailable',
			reason: 'no-anchor',
			authored: { kind: 'repMax', reps: 8 },
			text: 'no 8RM on file for this lift',
			fix: 'Record the heaviest load you can lift for exactly 8 reps.',
		}),
	).toEqual({
		text: 'no 8RM on file for this lift',
		fix: 'Record the heaviest load you can lift for exactly 8 reps.',
	})
})

// ——— The plate line ——————————————————————————————————————————————————————

test('the plate line is what goes on one side, heaviest first', () => {
	expect(
		buildPlateLine({ loadNumber: '100', inventory: gym, options: {} }),
	).toMatchObject({ kind: 'plates', text: '20 · 20' })
})

test('an empty input has nothing to solve, and is not a zero', () => {
	expect(
		buildPlateLine({ loadNumber: '', inventory: gym, options: {} }),
	).toBeNull()
	expect(
		buildPlateLine({ loadNumber: 'abc', inventory: gym, options: {} }),
	).toBeNull()
})

test('a gym nobody has described gets no plate line rather than an invented rack', () => {
	expect(
		buildPlateLine({ loadNumber: '100', inventory: null, options: {} }),
	).toBeNull()
})

test('a rack that cannot make the number says which number it can make', () => {
	const line = buildPlateLine({
		loadNumber: '101',
		inventory: gym,
		options: {},
	})

	expect(line?.kind).toBe('nearest')
	expect(line && 'note' in line ? line.note : '').toMatch(/Your gym makes/)
})

test('a machine level has no plates and no honest kilo, so it is given neither', () => {
	const line = buildPlateLine({
		loadNumber: '7',
		inventory: gym,
		options: { kind: 'stackLevel' },
	})

	expect(line).toEqual({
		kind: 'unavailable',
		note: 'A stack level has no kilos — this progresses against itself only.',
	})
})

test('a band and an unloaded hold refuse the same way', () => {
	expect(
		buildPlateLine({
			loadNumber: '1',
			inventory: gym,
			options: { kind: 'band' },
		}),
	).toMatchObject({ kind: 'unavailable' })
	expect(
		buildPlateLine({
			loadNumber: '1',
			inventory: gym,
			options: { kind: 'unloaded' },
		}),
	).toMatchObject({ kind: 'unavailable' })
})

// ——— What you lift next time —————————————————————————————————————————————

const names = { 'ex-squat': 'Back squat' }

test('an increment says which two numbers moved', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: 'barbell',
			kind: 'incremented',
			fromKg: 100,
			toKg: 102.5,
			reason: 'You made all 25 prescribed reps.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]).toMatchObject({
		headline: 'Back squat 100 kg → 102.5 kg',
		isNotice: false,
	})
})

test('a repeat states the Stall Count, and only where it is non-zero', () => {
	const repeat = (stallCount: number): LiftOutcome => ({
		exerciseId: 'ex-squat',
		equipment: null,
		kind: 'repeated',
		weightKg: 100,
		stallCount,
		reason: 'You came up short, so the weight repeats.',
		appliedAtISO: '2026-08-14T09:00:00.000Z',
	})

	expect(buildOutcomePanel([repeat(1)], names)[0]?.label).toBe('Stall Count 1')
	expect(buildOutcomePanel([repeat(0)], names)[0]?.label).toBeNull()
})

test('a Stall Cut is a notice with a reason, and it is labelled Stall Cut and never a deload', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'stalled',
			response: 'stallCut',
			moved: 'workingWeight',
			fromKg: 100,
			toKg: 90,
			reason: 'You missed this lift three sessions in a row.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	const item = buildOutcomePanel(outcomes, names)[0]!
	expect(item.isNotice).toBe(true)
	expect(item.label).toBe('Stall Cut')
	expect(item.reason).toBe('You missed this lift three sessions in a row.')
	expect(item.headline).toBe('Back squat 100 kg → 90 kg')
	expect(JSON.stringify(item).toLowerCase()).not.toContain('deload')
})

test('a Stall Response that moved a training max says so, because a training max is not the squat', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'stalled',
			response: 'weightRollback',
			moved: 'trainingMax',
			fromKg: 130,
			toKg: 117,
			reason: 'Two cycles missed, so the training max comes back 10 %.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]?.headline).toBe(
		'Back squat training max 130 kg → 117 kg',
	)
})

test('a lift nobody logged is skipped, and is not reported as a failure', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'skipped',
			weightKg: 100,
			reason: 'No sets logged for this lift.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]).toMatchObject({
		headline: 'Back squat unchanged at 100 kg',
		isNotice: false,
	})
})
