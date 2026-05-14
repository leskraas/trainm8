import { expect, test } from 'vitest'
import { getStatusLabel, getStatusVariant } from './training.ts'

test('getStatusVariant maps known statuses to badge variants', () => {
	expect(getStatusVariant('scheduled')).toBe('secondary')
	expect(getStatusVariant('completed')).toBe('default')
	expect(getStatusVariant('skipped')).toBe('outline')
	expect(getStatusVariant('missed')).toBe('destructive')
})

test('getStatusVariant maps unknown statuses to ghost', () => {
	expect(getStatusVariant('cancelled')).toBe('ghost')
})

test('getStatusLabel returns capitalized label for unknown status', () => {
	expect(getStatusLabel('cancelled')).toBe('Cancelled')
})

test('getStatusLabel handles empty string gracefully', () => {
	expect(getStatusLabel('')).toBe('')
})
