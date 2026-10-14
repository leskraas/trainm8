import { expect, test } from 'vitest'
import { fitFileKey } from './fit-file-key.ts'

// ADR 0096 §1: `fit:<manufacturer>:<product|->:<serial_number|->:<time_created>`
// from the FIT `file_id` message, `time_created` in Unix seconds UTC.

const RUN_STARTED = new Date('2026-06-01T07:30:00Z') // 1780299000

test('an activity file is keyed by manufacturer, product, serial and creation second', () => {
	expect(
		fitFileKey({
			type: 'activity',
			manufacturer: 'garmin',
			product: 4315,
			serialNumber: 3412345678,
			timeCreated: RUN_STARTED,
		}),
	).toBe('fit:1:4315:3412345678:1780299000')
})

test('a missing product or serial number is written as a dash', () => {
	expect(
		fitFileKey({
			type: 'activity',
			manufacturer: 'coros',
			timeCreated: RUN_STARTED,
		}),
	).toBe('fit:294:-:-:1780299000')
})

test('a manufacturer the SDK has no name for keeps its number', () => {
	expect(
		fitFileKey({
			type: 'activity',
			manufacturer: 65000,
			product: 7,
			serialNumber: 1,
			timeCreated: RUN_STARTED,
		}),
	).toBe('fit:65000:7:1:1780299000')
})

test('fractional creation times key to the whole second', () => {
	expect(
		fitFileKey({
			type: 'activity',
			manufacturer: 'garmin',
			product: 4315,
			serialNumber: 3412345678,
			timeCreated: new Date('2026-06-01T07:30:00.900Z'),
		}),
	).toBe('fit:1:4315:3412345678:1780299000')
})

test('a file that is not an activity has no key', () => {
	expect(
		fitFileKey({
			type: 'workout',
			manufacturer: 'garmin',
			product: 4315,
			serialNumber: 3412345678,
			timeCreated: RUN_STARTED,
		}),
	).toBeNull()
})

test('a file without a manufacturer or a creation time has no key', () => {
	expect(fitFileKey({ type: 'activity', timeCreated: RUN_STARTED })).toBeNull()
	expect(fitFileKey({ type: 'activity', manufacturer: 'garmin' })).toBeNull()
	expect(fitFileKey(null)).toBeNull()
})
