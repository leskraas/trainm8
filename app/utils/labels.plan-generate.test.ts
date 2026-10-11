/**
 * The generated season's words (`PLAN_GENERATE_LABELS`, #505 round 2): every
 * answer and every refusal said, in Norwegian, and the counts read right at 1.
 * A file of its own beside `labels.test.ts`, as the section is its own in
 * `labels.ts`, so the area PRs that add to the shared test merge cleanly.
 */
import { expect, test } from 'vitest'
import { PLAN_GENERATE_LABELS, PLAN_SHAPE_STEP_LABELS } from './labels.ts'
import { type GenerationRefusal } from './plan-generation/generate.server.ts'
import { GENERATION_INTENTS } from './plan-generation/season.ts'

const L = PLAN_GENERATE_LABELS

const REFUSALS = [
	'event-not-found',
	'no-cardio-discipline',
	'anchor-missing',
	'event-past',
	'event-cancelled',
	'event-already-planned',
	'open-ended-already-active',
] as const satisfies readonly GenerationRefusal[]

test('every answer to «Hvor står du nå?» has its own sentence', () => {
	const sentences = GENERATION_INTENTS.map((intent) => L.intents[intent])
	expect(new Set(sentences).size).toBe(GENERATION_INTENTS.length)
	for (const sentence of sentences) {
		expect(sentence).not.toMatch(/\b(I am|This is|training)\b/)
	}
})

test('every refusal is said, and the ones the shape step shares read the same on both', () => {
	for (const reason of REFUSALS) {
		expect(L.refusals[reason]).toMatch(/\S/)
		expect(L.refusals[reason]).not.toMatch(/\b(event|plan has|season)\b/i)
	}
	for (const [reason, sentence] of Object.entries(
		PLAN_SHAPE_STEP_LABELS.refusals,
	)) {
		expect(L.refusals[reason as GenerationRefusal]).toBe(sentence)
	}
})

test('counts read right at one and at many', () => {
	expect(L.summary(1, 1)).toBe('1 økt over 1 uke')
	expect(L.summary(48, 18)).toBe('48 økter over 18 uker')
	expect(L.approve(1)).toBe('Legg denne økta i kalenderen')
	expect(L.approve(48)).toBe('Legg disse 48 øktene i kalenderen')
	expect(L.emptyDays(1)).toBe('1 treningsdag er tom.')
	expect(L.emptyDays(3)).toBe('3 treningsdager er tomme.')
	expect(L.remaining(1)).toBe('Én uke til')
	expect(L.remaining(23)).toBe('23 uker til')
})

test('an empty day names what it asked for, joined the Norwegian way', () => {
	expect(L.nothingToPlace(['terskel'], 'grunntrening')).toBe(
		'Ingenting å legge inn – terskel i grunntrening finnes ikke i katalogen for denne idretten.',
	)
	expect(
		L.nothingToPlace(['terskel', 'under terskel', 'tempo'], 'oppbygging'),
	).toContain('terskel, under terskel eller tempo i oppbygging')
})
