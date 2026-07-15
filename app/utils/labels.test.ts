import { expect, test } from 'vitest'

import {
	EVENT_KINDS,
	EVENT_PRIORITIES,
	EVENT_STATUSES,
} from './event-schema.ts'
import {
	DISCIPLINE_LABELS,
	EVENT_KIND_LABELS,
	EVENT_PRIORITY_LABELS,
	EVENT_STATUS_LABELS,
	getDisciplineLabel,
	getStatusLabel,
	INTENSITY_KIND_LABELS,
	INTENT_LABELS,
	providerLabel,
	STEP_KIND_LABELS,
	TARGET_KIND_LABELS,
} from './labels.ts'
import {
	DISCIPLINES,
	IntensityTargetSchema,
	STEP_KINDS,
	WORKOUT_INTENTS,
} from './workout-schema.ts'

// The label seam's core promise (#281): every enum value surfaced to athletes
// has a display label, so nothing ever renders raw. These guard against a new
// enum member being added without a label.

test('every discipline has a label', () => {
	for (const value of DISCIPLINES) {
		expect(DISCIPLINE_LABELS[value]).toBeTruthy()
	}
})

test('every workout intent has a label', () => {
	for (const value of WORKOUT_INTENTS) {
		expect(INTENT_LABELS[value]).toBeTruthy()
	}
})

test('every step kind has a label', () => {
	for (const value of STEP_KINDS) {
		expect(STEP_KIND_LABELS[value]).toBeTruthy()
	}
})

test('every intensity-target kind has a label', () => {
	const kinds = IntensityTargetSchema.options.map(
		(option) => option.shape.kind.value,
	)
	for (const kind of kinds) {
		expect(INTENSITY_KIND_LABELS[kind]).toBeTruthy()
	}
})

test('every event kind, priority, and status has a label', () => {
	for (const value of EVENT_KINDS) expect(EVENT_KIND_LABELS[value]).toBeTruthy()
	for (const value of EVENT_PRIORITIES)
		expect(EVENT_PRIORITY_LABELS[value]).toBeTruthy()
	for (const value of EVENT_STATUSES)
		expect(EVENT_STATUS_LABELS[value]).toBeTruthy()
})

test('the empty target kind reads as "No target"', () => {
	expect(TARGET_KIND_LABELS['']).toBe('No target')
})

test('getDisciplineLabel calls a bike a Ride but keeps the others', () => {
	expect(getDisciplineLabel('bike')).toBe('Ride')
	expect(getDisciplineLabel('run')).toBe('Run')
	expect(getDisciplineLabel('swim')).toBe('Swim')
	expect(getDisciplineLabel('strength')).toBe('Strength')
	// Unknown values (e.g. an `other` recording) are capitalized, never raw.
	expect(getDisciplineLabel('other')).toBe('Other')
})

test('getStatusLabel capitalizes an open-ended status', () => {
	expect(getStatusLabel('scheduled')).toBe('Scheduled')
	expect(getStatusLabel('completed')).toBe('Completed')
})

test('providerLabel names known providers and falls back for unknown ones', () => {
	expect(providerLabel('strava')).toBe('Strava')
	expect(providerLabel('intervalsicu')).toBe('Intervals.icu')
	expect(providerLabel('newprovider')).toBe('Newprovider')
})
