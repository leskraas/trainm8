/**
 * Completeness for the Workout Detail View's section of `labels.ts` (#505
 * round 2, ADR 0081): every enum the detail view, the full editor and the
 * runner name has a Norwegian word, so none renders blank or in English.
 * Kept beside `labels.test.ts` rather than in it, so each area's PR adds its
 * own file and never reorders another's.
 */
import { expect, test } from 'vitest'
import { SESSION_ARCHETYPES } from './catalogue.ts'
import {
	NB_INTENT_LABELS,
	NB_SESSION_ARCHETYPE_LABELS,
	NB_STEP_KIND_LABELS,
	SESSION_ARCHETYPE_LABELS,
	WORKOUT_DETAIL_LABELS,
	nbConfidenceLabel,
	nbEquipmentLabel,
	nbKgLabel,
	nbMuscleLabel,
	nbSessionStatusLabel,
} from './labels.ts'
import {
	MUSCLE_GROUPS,
	STEP_KINDS,
	WORKOUT_INTENTS,
} from './workout-schema.ts'

test('every Session Archetype has its own Norwegian word', () => {
	for (const archetype of SESSION_ARCHETYPES) {
		expect(NB_SESSION_ARCHETYPE_LABELS[archetype]).toBeTruthy()
	}
	expect(new Set(Object.values(NB_SESSION_ARCHETYPE_LABELS)).size).toBe(
		SESSION_ARCHETYPES.length,
	)
	// Both registers name the same set, so a new archetype cannot land in one.
	expect(Object.keys(NB_SESSION_ARCHETYPE_LABELS).sort()).toEqual(
		Object.keys(SESSION_ARCHETYPE_LABELS).sort(),
	)
})

test('every workout intent and step kind has a Norwegian word', () => {
	for (const intent of WORKOUT_INTENTS) {
		expect(NB_INTENT_LABELS[intent]).toBeTruthy()
	}
	for (const kind of STEP_KINDS) expect(NB_STEP_KIND_LABELS[kind]).toBeTruthy()
})

test('a session status reads as I dag says it, and an unknown one is never raw', () => {
	expect(nbSessionStatusLabel('scheduled')).toBe('Planlagt')
	expect(nbSessionStatusLabel('completed')).toBe('Gjort')
	expect(nbSessionStatusLabel('missed')).toBe('Ikke gjort')
	expect(nbSessionStatusLabel('paused')).toBe('Paused')
})

test('every primary muscle has a Norwegian name, distinct from the others', () => {
	const names = MUSCLE_GROUPS.map(nbMuscleLabel)
	for (const name of names) expect(name).toMatch(/^[A-ZÆØÅ]/)
	expect(new Set(names).size).toBe(MUSCLE_GROUPS.length)
	// An unknown slug is readable, never `lower-back` raw.
	expect(nbMuscleLabel('upper-traps')).toBe('Upper traps')
	expect(nbEquipmentLabel('barbell')).toBe('Stang')
	expect(nbEquipmentLabel('sled-push')).toBe('Sled push')
})

test('confidence reads in one Norwegian word', () => {
	expect(nbConfidenceLabel('high')).toBe('høy')
	expect(nbConfidenceLabel('medium')).toBe('middels')
	expect(nbConfidenceLabel('low')).toBe('lav')
})

test('kilos are written with a decimal comma, a whole number left whole', () => {
	expect(nbKgLabel(82.5)).toBe('82,5 kg')
	expect(nbKgLabel(100)).toBe('100 kg')
	expect(nbKgLabel(61.25)).toBe('61,25 kg')
})

test('the archetype card says a reading is not the stored type, instead of "no archetype"', () => {
	const sentence = WORKOUT_DETAIL_LABELS.vsLast.readOnly('Terskel')
	expect(sentence).toContain('terskel')
	expect(sentence).not.toMatch(/ingen økttype,/i)
	expect(WORKOUT_DETAIL_LABELS.vsLast.kind('Terskel', 'Sykling')).toBe(
		'terskeløkt i sykling',
	)
})
