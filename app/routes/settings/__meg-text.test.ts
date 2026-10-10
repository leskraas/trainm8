import { expect, test } from 'vitest'
import { z } from 'zod'
import { UsernameSchema } from '#app/utils/user-validation.ts'
import {
	megZodErrorMap,
	nbDecimal,
	nbErrors,
	nbKg,
	nbSeconds,
} from './__meg-text.ts'

test('a shared English validation message reads in Norwegian at the field', () => {
	const result = UsernameSchema.safeParse('ab')
	expect(result.success).toBe(false)
	const messages = result.error!.issues.map((issue) => issue.message)
	expect(nbErrors(messages)).toEqual([
		'Brukernavnet er for kort (minst 3 tegn).',
	])
})

test('a message Meg already wrote in Norwegian passes through untouched', () => {
	expect(nbErrors(['Feil passord.', null, undefined])).toEqual([
		'Feil passord.',
	])
})

test("Zod's own defaults are Norwegian under the Meg error map", () => {
	const schema = z.object({
		weightKg: z.number().positive().max(500),
		maxHr: z.number().int().min(80),
		name: z.string(),
	})
	const result = schema.safeParse(
		{ weightKg: 600, maxHr: 70.5, name: undefined },
		{ errorMap: megZodErrorMap },
	)
	const byPath = Object.fromEntries(
		result.error!.issues.map((issue) => [issue.path.join('.'), issue.message]),
	)
	expect(byPath.weightKg).toBe('Tallet kan være høyst 500.')
	expect(byPath.maxHr).toMatch(/helt tall|minst 80/)
	expect(byPath.name).toBe('Fyll inn feltet.')
})

test('kilos and decimals use the Norwegian comma, never rounding what was stored', () => {
	expect(nbKg(61.25)).toBe('61,25')
	expect(nbKg(140)).toBe('140')
	expect(nbDecimal(0.97, 2)).toBe('0,97')
	expect(nbDecimal(10.2)).toBe('10,2')
})

test('effort lengths read as seconds or minutes', () => {
	expect(nbSeconds(30)).toBe('30 s')
	expect(nbSeconds(1200)).toBe('20 min')
})
