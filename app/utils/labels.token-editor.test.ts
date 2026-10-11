/**
 * The token-sentence editor's chrome in Norwegian (#505 round 2, ADR 0081):
 * the words around the sentence — menus, steppers, the live region, the
 * validation count — and the two English sources it reads on display only.
 */
import { expect, test } from 'vitest'
import {
	nbUnavailableReason,
	NB_SET_KIND_LABELS,
	TOKEN_EDITOR_CONTROL_LABELS,
	TOKEN_EDITOR_EMPTY_LABELS,
	TOKEN_EDITOR_MENU_LABELS,
	TOKEN_EDITOR_REPAIR_LABELS,
	TOKEN_EDITOR_SETS_LABELS,
	TOKEN_EDITOR_TOKEN_NAMES,
} from './labels.ts'

test('the validation count agrees in number', () => {
	expect(TOKEN_EDITOR_REPAIR_LABELS.errorCount(1)).toBe('1 ting må rettes')
	expect(TOKEN_EDITOR_REPAIR_LABELS.errorCount(4)).toBe('4 ting må rettes')
})

test('a token is named by what it says, then where it sits', () => {
	const N = TOKEN_EDITOR_TOKEN_NAMES
	expect(`${N.duration('6 min')}, ${N.inStep(1, 2, 1, 3)}`).toBe(
		'6 min varighet, steg 1 av 2, blokk 1 av 3',
	)
	expect(`${N.repeat(4)}, ${N.inBlock(2, 3)}`).toBe(
		'gjentas 4 ganger, blokk 2 av 3',
	)
	expect(N.sets('3 × 8 @ 80 kg')).toBe('sett: 3 × 8 @ 80 kg')
})

test('a stepper sentence reads with its noun in place', () => {
	const C = TOKEN_EDITOR_CONTROL_LABELS
	expect(C.decrease(C.stepper.rest)).toBe('Senk pausen')
	expect(C.value(C.stepper.duration)).toBe('Verdi for varigheten')
	expect(C.valueSet(C.stepper.duration, '7 min')).toBe(
		'Varigheten er satt til 7 min',
	)
})

test('a kind switch names the kind in lower case after its verb', () => {
	expect(TOKEN_EDITOR_MENU_LABELS.makeKind('Styrke')).toBe('⇄ Gjør til styrke')
	expect(TOKEN_EDITOR_MENU_LABELS.announce.stepKind('Pause')).toBe(
		'Steget er nå pause',
	)
})

test('a load announces in its own unit', () => {
	expect(TOKEN_EDITOR_SETS_LABELS.loadSet('82.5', 'kg')).toBe(
		'Belastningen er satt til 82.5 kg',
	)
	expect(TOKEN_EDITOR_SETS_LABELS.loadSet('75', 'pct')).toBe(
		'Belastningen er satt til 75 % 1RM',
	)
})

test('every set kind and every step kind hint has a Norwegian word', () => {
	for (const word of Object.values(NB_SET_KIND_LABELS)) {
		expect(word).not.toMatch(/^(Reps|Timed|To RIR|Velocity loss)$/)
	}
	for (const hint of Object.values(TOKEN_EDITOR_EMPTY_LABELS.hints)) {
		expect(hint).toMatch(/^starter som /)
	}
})

test("the resolver's missing-threshold sentence reads in Norwegian", () => {
	expect(nbUnavailableReason('threshold pace is not configured')).toBe(
		'terskelfart mangler i innstillingene',
	)
	expect(nbUnavailableReason('Max HR is not configured')).toBe(
		'makspuls mangler i innstillingene',
	)
	expect(nbUnavailableReason('FTP is not configured')).toBe(
		'FTP mangler i innstillingene',
	)
	expect(nbUnavailableReason('No zone system selected')).toBe(
		'ingen sonesystem valgt i innstillingene',
	)
	// A threshold nobody has named yet keeps its name; any other sentence
	// passes through untouched.
	expect(nbUnavailableReason('W′ is not configured')).toBe(
		'W′ mangler i innstillingene',
	)
	expect(nbUnavailableReason('something else')).toBe('something else')
})
