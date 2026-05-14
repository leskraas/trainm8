import { expect, test } from 'vitest'
import {
	getActivityLabel,
	getStatusLabel,
	getStatusVariant,
} from './training.ts'

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

test('getActivityLabel capitalizes activity types', () => {
	expect(getActivityLabel('run')).toBe('Run')
	expect(getActivityLabel('swim')).toBe('Swim')
	expect(getActivityLabel('strength')).toBe('Strength')
	expect(getActivityLabel('rest')).toBe('Rest')
})

test('getActivityLabel maps bike to Ride', () => {
	expect(getActivityLabel('bike')).toBe('Ride')
})
