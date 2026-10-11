import { expect, test } from 'vitest'
import { thresholdValueDisplay } from './history.tsx'

test('threshold pace history values render as mm:ss /km', () => {
	expect(thresholdValueDisplay('thresholdPace', 245)).toEqual({
		value: '4:05',
		unit: '/km',
	})
})

test('CSS history values render as mm:ss /100 m', () => {
	expect(thresholdValueDisplay('css', 95)).toEqual({
		value: '1:35',
		unit: '/100 m',
	})
})

test('non-pace thresholds keep their number and a Norwegian unit', () => {
	expect(thresholdValueDisplay('ftp', 250)).toEqual({
		value: '250',
		unit: 'W',
	})
	expect(thresholdValueDisplay('maxHr', 190)).toEqual({
		value: '190',
		unit: 'slag/min',
	})
})

test('a weight reads with a decimal comma', () => {
	expect(thresholdValueDisplay('weight', 72.5)).toEqual({
		value: '72,5',
		unit: 'kg',
	})
})
