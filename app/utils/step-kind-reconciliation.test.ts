/**
 * Step kind switching with set-aside reconciliation (workout-editor spec §4,
 * #255): the pure model behind the ⋮ Kind section and the sheet's Kind
 * select. The note always carries; a time quantity carries cardio ↔ rest;
 * every other authored value is set aside in-session and restored on
 * switch-back; untouched seeds are forgotten.
 */
import { describe, expect, test } from 'vitest'
import {
	previewKindSwitch,
	switchStepKind,
	type SwitchableStep,
} from './step-kind-reconciliation.ts'
import { emptySet, emptyStep } from './workout-authoring.ts'

function cardioStep(overrides: Partial<SwitchableStep> = {}): SwitchableStep {
	return { ...emptyStep(), ...overrides }
}

describe('switchStepKind — carry rules (§4.2)', () => {
	test('a time quantity carries cardio → rest', () => {
		const next = switchStepKind(cardioStep({ duration: '6 min' }), 'rest')
		expect(next.kind).toBe('rest')
		expect(next.duration).toBe('6 min')
		// Nothing else was authored, so nothing is set aside.
		expect(next.setAside).toBeUndefined()
	})

	test('a time quantity carries rest → cardio', () => {
		const rest = switchStepKind(cardioStep({ duration: '4 min' }), 'rest')
		const back = switchStepKind(rest, 'cardio')
		expect(back.kind).toBe('cardio')
		expect(back.duration).toBe('4 min')
	})

	test('the note always carries, every direction', () => {
		let step = cardioStep({ duration: '6 min', notes: 'easy spin' })
		for (const kind of ['strength', 'rest', 'cardio'] as const) {
			step = switchStepKind(step, kind)
			expect(step.notes).toBe('easy spin')
		}
	})

	test('a distance does not fit rest: set aside, rest seeds 1 min', () => {
		const next = switchStepKind(cardioStep({ distance: '2 km' }), 'rest')
		expect(next.duration).toBe('1 min')
		expect(next.distance).toBe('')
		expect(next.setAside?.cardio).toEqual({ distance: '2 km' })
	})
})

describe('switchStepKind — set aside and restore', () => {
	test('switch away and back restores authored cardio values', () => {
		const step = cardioStep({
			duration: '5 min',
			intensity: 'threshold',
			discipline: 'bike',
		})
		const strength = switchStepKind(step, 'strength')
		expect(strength.duration).toBe('')
		expect(strength.intensity).toBe('')
		expect(strength.discipline).toBe('')
		const back = switchStepKind(strength, 'cardio')
		expect(back.duration).toBe('5 min')
		expect(back.intensity).toBe('threshold')
		expect(back.discipline).toBe('bike')
		// Restored values leave the stash — it holds only what is set aside.
		expect(back.setAside).toBeUndefined()
	})

	test('switch away and back restores authored strength values', () => {
		const step = cardioStep({
			kind: 'strength',
			duration: '',
			exerciseId: 'ex-1',
			sets: [{ ...emptySet(), reps: '8', weightKg: '60' }],
			restBetweenSetsSec: '90',
		})
		const rest = switchStepKind(step, 'rest')
		expect(rest.exerciseId).toBe('')
		expect(rest.sets).toEqual([emptySet()])
		expect(rest.restBetweenSetsSec).toBe('')
		expect(rest.duration).toBe('1 min')
		const back = switchStepKind(rest, 'strength')
		expect(back.exerciseId).toBe('ex-1')
		expect(back.sets).toEqual([{ ...emptySet(), reps: '8', weightKg: '60' }])
		expect(back.restBetweenSetsSec).toBe('90')
	})

	test('untouched seeds are forgotten, not stashed', () => {
		// A fresh rest seed (1 min) switched away leaves no stash entry.
		const rest = cardioStep({ kind: 'rest', duration: '1 min' })
		const strength = switchStepKind(rest, 'strength')
		expect(strength.setAside).toBeUndefined()
		// A fresh strength seed likewise.
		const back = switchStepKind(
			cardioStep({ kind: 'strength', duration: '' }),
			'cardio',
		)
		expect(back.setAside).toBeUndefined()
		expect(back.duration).toBe('10 min')
	})

	test('a restore beats the carry: the authored time is set aside, never lost', () => {
		// cardio 5 min Z3 → strength (sets cardio aside) → rest, authored to
		// 4 min → cardio: brings back 5 min Z3 and sets the 4 min aside.
		let step = cardioStep({ duration: '5 min', intensity: 'threshold' })
		step = switchStepKind(step, 'strength')
		step = switchStepKind(step, 'rest')
		step = { ...step, duration: '4 min' }
		step = switchStepKind(step, 'cardio')
		expect(step.duration).toBe('5 min')
		expect(step.intensity).toBe('threshold')
		expect(step.setAside?.rest).toEqual({ duration: '4 min' })
		// And the 4 min comes back on the next switch to rest.
		const rest = switchStepKind(step, 'rest')
		expect(rest.duration).toBe('4 min')
	})

	test('a restored distance never coexists with a carried duration', () => {
		// cardio 2 km Z3 → strength → rest (seeds 1 min) → cardio: the stash
		// restores the distance, so the rest's untouched 1 min must not carry.
		let step = cardioStep({ distance: '2 km', intensity: 'threshold' })
		step = switchStepKind(step, 'strength')
		step = switchStepKind(step, 'rest')
		step = switchStepKind(step, 'cardio')
		expect(step.distance).toBe('2 km')
		expect(step.duration).toBe('')
	})
})

describe('switchStepKind — seeds', () => {
	test('cardio seeds 10 min when nothing carries or returns', () => {
		const next = switchStepKind(
			cardioStep({ kind: 'strength', duration: '' }),
			'cardio',
		)
		expect(next.duration).toBe('10 min')
	})

	test('strength seeds the default set when none return', () => {
		const next = switchStepKind(
			cardioStep({ duration: '6 min', sets: [] }),
			'strength',
		)
		expect(next.sets).toEqual([emptySet()])
	})

	test('same kind is a no-op', () => {
		const step = cardioStep({ duration: '6 min' })
		expect(switchStepKind(step, 'cardio')).toBe(step)
	})
})

describe('previewKindSwitch — the ⇄ rows tell the truth (§4.1)', () => {
	test('states what carries and what a fresh strength switch starts as', () => {
		const step = cardioStep({ duration: '6 min', notes: 'strides' })
		expect(previewKindSwitch(step, 'rest')).toBe('keeps 6 min, note')
		expect(previewKindSwitch(step, 'strength')).toBe(
			'starts as an exercise, 1 × 5 — keeps note — sets aside 6 min',
		)
	})

	test('states what is set aside for the step’s real values', () => {
		const step = cardioStep({ distance: '2 km', intensity: 'threshold' })
		expect(previewKindSwitch(step, 'rest')).toBe(
			'starts as 1 min of recovery — sets aside 2 km · Threshold',
		)
	})

	test('states what a switch back brings back', () => {
		const strength = switchStepKind(
			cardioStep({ duration: '5 min', intensity: 'threshold' }),
			'strength',
		)
		expect(previewKindSwitch(strength, 'cardio')).toBe(
			'brings back 5 min · Threshold',
		)
	})

	test('a stashed strength step reads as its exercise and set notation', () => {
		const step = cardioStep({
			kind: 'strength',
			duration: '',
			exerciseId: 'ex-1',
			sets: [{ ...emptySet(), reps: '8', weightKg: '60' }],
		})
		const rest = switchStepKind(step, 'rest')
		expect(
			previewKindSwitch(rest, 'strength', {
				exerciseNames: { 'ex-1': 'Deadlift' },
			}),
		).toBe('brings back Deadlift 1 × 8 @ 60 kg')
	})

	test('an empty step has nothing to carry', () => {
		expect(
			previewKindSwitch(cardioStep({ duration: '' }), 'rest'),
		).toBe('starts as 1 min of recovery')
	})
})
