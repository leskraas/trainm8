import { expect, test } from 'vitest'

import {
	EVENT_KINDS,
	EVENT_PRIORITIES,
	EVENT_STATUSES,
} from './event-schema.ts'
import {
	CONVERSION_CONVENTION_LABELS,
	DISCIPLINE_LABELS,
	EVENT_KIND_LABELS,
	EVENT_PRIORITY_LABELS,
	EVENT_STATUS_LABELS,
	getDisciplineLabel,
	getStatusLabel,
	INTENSITY_KIND_LABELS,
	INTENT_LABELS,
	NO_CONTRIBUTION_LABELS,
	PATTERN_DAY_KIND_LABELS,
	PATTERN_WEEKDAY_LABELS,
	providerLabel,
	RHYTHM_LABELS,
	RHYTHM_SUMMARY_LABELS,
	STEP_KIND_LABELS,
	STRENGTH_GOAL_LABELS,
	STRENGTH_GOAL_SENTENCE_LABELS,
	TARGET_KIND_LABELS,
	THRESHOLD_FIELD_LABELS,
	UNAVAILABLE_READING_LABELS,
	VOLUME_CURRENCY_LABELS,
	VOLUME_CURRENCY_UNITS,
	VOLUME_UNITS,
	WEEK_ROLE_LABELS,
	WEEKDAY_LABELS,
} from './labels.ts'
import {
	RHYTHMS,
	STRENGTH_GOALS,
	VOLUME_CURRENCIES,
} from './plan-outline/derive.ts'
// The readings a strength plan cannot state are the domain's list (ADR 0047 §5);
// this file pins one worded sentence to each of them. A pure module, so the label
// seam's test stays the leaf it is and drags no database in.
import { UNAVAILABLE_READINGS } from './plan-outline/unavailable-readings.ts'
// The conventions the Volume Conversion stacks are the domain's tuple (ADR 0045
// §10); this file pins one noun phrase to each of them.
import { CONVENTION_IDS } from './plan-outline/volume-conversion.ts'
// A value import, which `labels.ts` itself may not make: only that module is the
// runtime leaf, and pinning its Monday-first list against the canonical mapping is
// the whole reason this file reaches for the function.
import {
	calendarWeekdayOf,
	PATTERN_DAY_KINDS,
	PATTERN_WEEKDAYS,
} from './plan-outline/week-pattern.ts'
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

test('every Volume Currency has a long label and both unit suffixes', () => {
	for (const currency of VOLUME_CURRENCIES) {
		expect(VOLUME_CURRENCY_LABELS[currency]).toBeTruthy()
		expect(VOLUME_CURRENCY_UNITS[currency]).toBeTruthy()
		expect(VOLUME_UNITS[currency]).toBeTruthy()
	}
})

test('every week role and phase rhythm has a label', () => {
	for (const role of ['loading', 'recovery', 'taper'] as const) {
		expect(WEEK_ROLE_LABELS[role]).toBeTruthy()
	}
	for (const rhythm of RHYTHMS) expect(RHYTHM_LABELS[rhythm]).toBeTruthy()
})

test('every rhythm also has a summary register, terser than the teaching one', () => {
	for (const rhythm of RHYTHMS) {
		expect(RHYTHM_SUMMARY_LABELS[rhythm]).toBeTruthy()
		expect(RHYTHM_SUMMARY_LABELS[rhythm].length).toBeLessThanOrEqual(
			RHYTHM_LABELS[rhythm].length,
		)
	}
	// A phase with no recovery week still says so: blank would read as missing.
	expect(RHYTHM_SUMMARY_LABELS.none).toBe('No recovery')
})

test('every Strength Goal has a label, and the middle one names itself', () => {
	for (const goal of STRENGTH_GOALS) {
		expect(STRENGTH_GOAL_LABELS[goal]).toBeTruthy()
	}
	// Never "Strength", which would read "strength emphasis: strength" (ADR 0047 §3).
	expect(STRENGTH_GOAL_LABELS['maximal-strength']).toBe('Maximal strength')
})

test('every Strength Goal also has a mid-sentence register of its own', () => {
	for (const goal of STRENGTH_GOALS) {
		expect(STRENGTH_GOAL_SENTENCE_LABELS[goal]).toBeTruthy()
	}
	// The register is authored here, not derived from the other one at a call site:
	// `.toLowerCase()` on a label is a rule about English applied to display text.
	expect(STRENGTH_GOAL_SENTENCE_LABELS['maximal-strength']).toBe(
		'maximal strength',
	)
})

test('every Unavailable reading has a sentence that names what is missing', () => {
	for (const reading of UNAVAILABLE_READINGS) {
		const sentence = UNAVAILABLE_READING_LABELS[reading]
		expect(sentence).toBeTruthy()
		// The reason is the point: a bare "not available" hides which of the
		// athlete's own data would change it (Unavailable Metric, ADR 0047 §5).
		expect(sentence).toMatch(/Unavailable/)
		expect(sentence).toMatch(/ — /)
	}
	// Three readings, three distinct sentences — never one line over three dashes.
	expect(new Set(Object.values(UNAVAILABLE_READING_LABELS)).size).toBe(
		UNAVAILABLE_READINGS.length,
	)
})

test('every reason a Training Track feeds no load has a phrase of its own', () => {
	const phrases = Object.values(NO_CONTRIBUTION_LABELS)
	// Nine reasons, nine distinct phrases: the conversion's eight closed gates plus
	// "no Season Anchor", which the projection layer sees and the conversion cannot.
	expect(phrases).toHaveLength(9)
	expect(new Set(phrases).size).toBe(9)
	for (const phrase of phrases) {
		expect(phrase).toBeTruthy()
		// Mid-sentence register: the phrase finishes a sentence the surface builds
		// around it ("Run: no threshold pace is stored…"), so it never opens capital.
		expect(phrase[0]).toBe(phrase[0]!.toLowerCase())
		expect(phrase).not.toMatch(/\.$/)
	}
	// Each names the athlete's own missing datum where one exists, rather than only
	// that something is missing (Unavailable Metric, ADR 0008).
	expect(NO_CONTRIBUTION_LABELS['no-threshold-pace']).toMatch(/threshold pace/)
	expect(NO_CONTRIBUTION_LABELS['no-ride-history']).toMatch(/rides/)
})

test('every conversion convention has a noun phrase, named as a convention', () => {
	for (const id of CONVENTION_IDS) {
		expect(CONVERSION_CONVENTION_LABELS[id]).toBeTruthy()
	}
	// Named as conventions, never as measurements (ADR 0040 §13) — no "your" and no
	// physiological claim in either phrase.
	for (const phrase of Object.values(CONVERSION_CONVENTION_LABELS)) {
		expect(phrase).not.toMatch(/your/i)
	}
})

test('every stored threshold the conversion reads is named as the athlete’s own', () => {
	const phrases = Object.values(THRESHOLD_FIELD_LABELS)
	expect(phrases).toHaveLength(2)
	for (const phrase of phrases) {
		// The mirror of the convention rule above: a *stored* number is the
		// athlete's, and the derivation only becomes checkable if it says so.
		expect(phrase).toMatch(/^your /)
		expect(phrase[0]).toBe(phrase[0]!.toLowerCase())
	}
})

test('every Week Pattern weekday and day kind has a label', () => {
	for (const weekday of PATTERN_WEEKDAYS) {
		expect(PATTERN_WEEKDAY_LABELS[weekday]).toBeTruthy()
	}
	for (const kind of PATTERN_DAY_KINDS) {
		expect(PATTERN_DAY_KIND_LABELS[kind]).toBeTruthy()
	}
})

test('a pattern weekday is labelled Monday-first, ending on Sunday', () => {
	// A Training Week runs Monday–Sunday (ADR 0019), unlike the Sunday-first index
	// the athlete profile stores (ADR 0005).
	expect(PATTERN_WEEKDAY_LABELS[0]).toBe('Monday')
	expect(PATTERN_WEEKDAY_LABELS[6]).toBe('Sunday')
})

test('the Monday-first labels agree with calendarWeekdayOf, day for day', () => {
	// `labels.ts` may not import `calendarWeekdayOf` — it is a runtime leaf, and a
	// value import there recreates the schema cycle that kills server boot. So it
	// holds the inverse mapping as a local literal, and this is what stops the two
	// from drifting: every pattern weekday's label is the Sunday-first name of the
	// same day.
	for (const weekday of PATTERN_WEEKDAYS) {
		expect(PATTERN_WEEKDAY_LABELS[weekday]).toBe(
			WEEKDAY_LABELS[calendarWeekdayOf(weekday)],
		)
	}
})
