import { expect, test } from 'vitest'
import { DEFAULT_TRAINING_TIME, trainingTimeOf } from './athlete-schema.ts'

test('trainingTimeOf: the athlete’s own time, else the documented 07:00', () => {
	expect(trainingTimeOf({ defaultTrainingTime: '17:30' })).toBe('17:30')
	expect(trainingTimeOf({ defaultTrainingTime: null })).toBe(
		DEFAULT_TRAINING_TIME,
	)
	expect(trainingTimeOf(null)).toBe('07:00')
	expect(trainingTimeOf(undefined)).toBe('07:00')
})
