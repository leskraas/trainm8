import { expect, test } from 'vitest'
import { thresholdValueDisplay } from './history.tsx'

test('threshold pace history values render as mm:ss /km', () => {
	expect(thresholdValueDisplay('thresholdPace', 245)).toEqual({
		value: '4:05',
		unit: '/km',
	})
})

test('CSS history values render as mm:ss /100m', () => {
	expect(thresholdValueDisplay('css', 95)).toEqual({
		value: '1:35',
		unit: '/100m',
	})
})

test('non-pace thresholds keep their raw number and unit', () => {
	expect(thresholdValueDisplay('ftp', 250)).toEqual({
		value: '250',
		unit: 'W',
	})
	expect(thresholdValueDisplay('maxHr', 190)).toEqual({
		value: '190',
		unit: 'bpm',
	})
})
