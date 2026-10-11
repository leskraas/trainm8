import { expect, test } from 'vitest'
import { kiloField, optionalKiloField, parseKiloInput } from './kilo-input.ts'

test('a Norwegian decimal comma is the same kilo as a decimal point', () => {
	expect(parseKiloInput('62,5')).toBe(62.5)
	expect(parseKiloInput('62.5')).toBe(62.5)
	expect(parseKiloInput('61,25')).toBe(61.25)
	expect(parseKiloInput(' 100 ')).toBe(100)
	// The unit the field already states, typed anyway.
	expect(parseKiloInput('82,5 kg')).toBe(82.5)
	expect(parseKiloInput('0')).toBe(0)
})

test('anything that is not one number is no kilo at all, never a guessed one', () => {
	// `625` is what `type=number` made of `62,5`: ten times the weight.
	for (const typed of [
		'',
		' ',
		'abc',
		'-5',
		'62,,5',
		'6,2,5',
		'1.000,5',
		'1 000',
		',5',
		'5,',
		'Infinity',
		'1e3',
	]) {
		expect({ typed, kg: parseKiloInput(typed) }).toEqual({ typed, kg: null })
	}
})

test('the zod field reads the comma and says what it takes in words', () => {
	const field = kiloField('A weight has to be a positive number of kilos.')

	expect(field.parse('62,5')).toBe(62.5)
	const refused = field.safeParse('62,5,0')
	expect(refused.success).toBe(false)
	expect(refused.error?.issues[0]?.message).toBe(
		'A weight has to be a positive number of kilos.',
	)
	// Zero is a number but not a weight.
	expect(field.safeParse('0').success).toBe(false)
})

test('the optional field reads a blank as not given, and still refuses a typo', () => {
	const field = optionalKiloField('No.')

	expect(field.parse('')).toBeNull()
	expect(field.parse('  ')).toBeNull()
	expect(field.parse('2,5')).toBe(2.5)
	expect(field.safeParse('2,5,0').error?.issues[0]?.message).toBe('No.')
})
