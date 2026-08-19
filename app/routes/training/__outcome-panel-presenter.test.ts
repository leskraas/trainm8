import { expect, test } from 'vitest'
import { type PlateInventory } from '#app/utils/strength/plates.ts'
import { type LiftOutcome } from '#app/utils/strength/program-engine.ts'
import {
	buildCutFeasibilityNote,
	buildOutcomePanelView,
} from './__outcome-panel-presenter.ts'

const names = { 'ex-squat': 'Squat', 'ex-bench': 'Bench Press' }

/** The rack the handoff's own sentence was written against: it can make 55 kg
 * and cannot make 54 kg. */
const gym: PlateInventory = {
	bars: [{ label: 'Olympic', weightKg: 20 }],
	plates: [
		{ weightKg: 20, count: 2 },
		{ weightKg: 10, count: 2 },
		{ weightKg: 5, count: 2 },
		{ weightKg: 2.5, count: 2 },
	],
	fixedDumbbellsKg: null,
}

const progressed: LiftOutcome = {
	exerciseId: 'ex-squat',
	equipment: null,
	kind: 'incremented',
	standsAtKg: 85,
	fromKg: 82.5,
	toKg: 85,
	reason: 'All 5 sets of 5 reps. StrongLifts adds 2.5 kg.',
	appliedAtISO: '2026-08-19T09:00:00.000Z',
}

const held: LiftOutcome = {
	exerciseId: 'ex-bench',
	equipment: null,
	kind: 'repeated',
	standsAtKg: 60,
	weightKg: 60,
	stallCount: 1,
	reason: 'A set came up short, so the weight repeats.',
	appliedAtISO: '2026-08-19T09:00:00.000Z',
}

const notLogged: LiftOutcome = {
	exerciseId: 'ex-squat',
	equipment: null,
	kind: 'skipped',
	standsAtKg: 82.5,
	weightKg: 82.5,
	reason: 'Nothing was logged for this lift, so the program did not read it.',
	appliedAtISO: '2026-08-19T09:00:00.000Z',
}

const stallCut: LiftOutcome = {
	exerciseId: 'ex-bench',
	equipment: null,
	kind: 'stalled',
	response: 'stallCut',
	moved: 'workingWeight',
	standsAtKg: 54,
	fromKg: 60,
	toKg: 54,
	reason:
		'You came up short on this lift three sessions in a row, so the program takes the weight down 10 % and you build it again.',
	appliedAtISO: '2026-08-19T09:00:00.000Z',
}

// ——— The four kinds, each with its own tone ———————————————————————————————

test('each outcome kind carries the tone its panel is drawn in', () => {
	const [a, b, c, d] = buildOutcomePanelView(
		[progressed, held, notLogged, stallCut],
		names,
		'StrongLifts 5×5',
	)

	expect(a?.tone).toBe('progressed')
	expect(b?.tone).toBe('held')
	expect(c?.tone).toBe('notLogged')
	expect(d?.tone).toBe('cut')
})

test('a notice the app could not act on is not dressed as a cut', () => {
	const unverifiable: LiftOutcome = {
		exerciseId: 'ex-squat',
		equipment: null,
		kind: 'unverifiable',
		standsAtKg: 90,
		prescribedKg: 90,
		weightKg: 90,
		unreadableSetCount: 5,
		gradedSetCount: 5,
		loggedLoadKind: null,
		unreadableReason: 'noKiloLogged',
		stallCount: 0,
		reason: 'All 5 sets record no kilos.',
		appliedAtISO: '2026-08-19T09:00:00.000Z',
	}

	const item = buildOutcomePanelView(
		[unverifiable],
		names,
		'StrongLifts 5×5',
	)[0]

	expect(item?.tone).toBe('notice')
	expect(item?.isNotice).toBe(true)
	expect(item?.provenance).toBeNull()
})

test('the sentences are the shipped builder’s, and read where the lift now stands', () => {
	// `weightKg` is what this session was stamped at; `standsAtKg` is where the
	// lift stands after the fold. "Stays at" is a sentence about the second.
	const item = buildOutcomePanelView(
		[{ ...held, standsAtKg: 77.5, weightKg: 60 }],
		names,
		'StrongLifts 5×5',
	)[0]

	expect(item?.headline).toBe('Bench Press stays at 77.5 kg')
	expect(item?.reason).toBe('A set came up short, so the weight repeats.')
})

test('the lift a panel is about is reachable, and the cut names the weight it moved to', () => {
	const [progress, cut] = buildOutcomePanelView(
		[progressed, stallCut],
		names,
		'StrongLifts 5×5',
	)

	expect(progress?.exerciseId).toBe('ex-squat')
	expect(progress?.movedToKg).toBeNull()
	expect(cut?.exerciseId).toBe('ex-bench')
	expect(cut?.movedToKg).toBe(54)
})

// ——— The Stall Cut's provenance ———————————————————————————————————————————

test('a Stall Cut carries the program’s own provenance, in the percentage it actually cut', () => {
	const item = buildOutcomePanelView([stallCut], names, 'StrongLifts 5×5')[0]

	expect(item?.provenance).toBe(
		'The 10 % cut is StrongLifts 5×5’s own published convention. No trial supports it.',
	)
})

test('a session that belongs to no named program still says the cut is convention', () => {
	const item = buildOutcomePanelView([stallCut], names, null)[0]

	expect(item?.provenance).toBe(
		'The 10 % cut is the program’s own published convention. No trial supports it.',
	)
})

test('nothing but a cut carries a provenance line', () => {
	const items = buildOutcomePanelView(
		[progressed, held, notLogged],
		names,
		'StrongLifts 5×5',
	)

	expect(items.map((item) => item.provenance)).toEqual([null, null, null])
})

test('the word deload appears in nothing this presenter produces', () => {
	const items = buildOutcomePanelView(
		[progressed, held, notLogged, stallCut],
		names,
		'StrongLifts 5×5',
	)

	expect(JSON.stringify(items)).not.toMatch(/deload/i)
})

// ——— The weight the gym can actually make —————————————————————————————————

test('a rack that cannot make the cut weight says which weight it can make', () => {
	expect(buildCutFeasibilityNote({ kg: 54, inventory: gym, options: {} })).toBe(
		'Your gym makes 55 kg, not 54 kg.',
	)
})

test('a rack that can make the cut weight says nothing', () => {
	expect(
		buildCutFeasibilityNote({ kg: 55, inventory: gym, options: {} }),
	).toBeNull()
})

test('a gym nobody has described says nothing rather than inventing a rack', () => {
	expect(
		buildCutFeasibilityNote({ kg: 54, inventory: null, options: {} }),
	).toBeNull()
	expect(
		buildCutFeasibilityNote({ kg: null, inventory: gym, options: {} }),
	).toBeNull()
})
