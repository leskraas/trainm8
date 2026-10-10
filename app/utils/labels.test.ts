import { expect, test } from 'vitest'

import { APP_TABS } from './app-tabs.ts'
import { CONNECTION_HUB_STATUSES } from './connection-hub-status.ts'
import {
	EVENT_KINDS,
	EVENT_PRIORITIES,
	EVENT_STATUSES,
} from './event-schema.ts'
import { EVENT_DATE_PROBLEMS } from './first-run/first-run-schema.ts'
import {
	IMPORT_LINK_REFUSALS,
	MARK_DONE_REFUSALS,
} from './import-link-schema.ts'
import {
	APP_TAB_LABELS,
	CONVERSION_CONVENTION_LABELS,
	CONNECTION_HUB_STATUS_LABELS,
	NB_EVENT_KIND_LABELS,
	SEASON_EVENTS_LABELS,
	quotedSession,
	roundFactorLabel,
	silencedLabel,
	WEEK_CHANGE_LABELS,
	WEEK_HOLD_REASON_LABELS,
	RECOMPUTE_NOTICE_LABELS,
	EVENT_DATE_LABELS,
	PAGE_HEADER_LABELS,
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
	PHILOSOPHY_DESCRIPTIONS,
	PHILOSOPHY_LABELS,
	plainMixSentence,
	providerLabel,
	RHYTHM_LABELS,
	RHYTHM_SUMMARY_LABELS,
	NB_WEEKDAY_LABELS,
	SESSION_OWNER_LABELS,
	IMPORT_LINK_REFUSAL_LABELS,
	MARK_DONE_REFUSAL_LABELS,
	QUICK_LOG_LABELS,
	QUICK_LOG_REFUSAL_LABELS,
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
	NB_VOLUME_UNITS,
	UNMEASURED_REASON_LABELS,
	VOLUME_GRADE_LABELS,
	unmeasuredCountLabel,
	strengthPartialLabel,
	NB_DISCIPLINE_LABELS,
	HORIZON_LABELS,
	horizonFillLabel,
	HELD_NUMBER_LABELS,
	seasonEditSentence,
	weekRiseSentence,
} from './labels.ts'
import { LOAD_RECOMPUTE_KINDS } from './load/recompute-notice.ts'
import { INSUFFICIENT_DATA_WHYS, NO_CHANGE_WHYS } from './load/week-replan.ts'
import { MAX_PLAN_WEEKS } from './plan-outline/authoring-schema.ts'
import {
	RHYTHMS,
	STRENGTH_GOALS,
	VOLUME_CURRENCIES,
} from './plan-outline/derive.ts'
// The readings a strength plan cannot state are the domain's list (ADR 0047 §5);
// this file pins one worded sentence to each of them. A pure module, so the label
// seam's test stays the leaf it is and drags no database in.
import { PRESET_FAMILIES } from './plan-outline/presets.ts'
import { HELD_NUMBERS } from './plan-outline/season-edit.ts'
import { UNAVAILABLE_READINGS } from './plan-outline/unavailable-readings.ts'
// The conventions the Volume Conversion stacks are the domain's tuple (ADR 0045
// §10); this file pins one noun phrase to each of them.
import { CONVENTION_IDS } from './plan-outline/volume-conversion.ts'
import {
	calendarWeekdayOf,
	PATTERN_DAY_KINDS,
	PATTERN_WEEKDAYS,
} from './plan-outline/week-pattern.ts'
import {
	UNMEASURED_REASONS,
	VOLUME_GRADES,
} from './plan-outline/week-volumes.ts'
// A value import, which `labels.ts` itself may not make: only that module is the
// runtime leaf, and pinning its Monday-first list against the canonical mapping is
// the whole reason this file reaches for the function.
import { SESSION_OWNERS } from './session-ownership.ts'
import { QUICK_LOG_REFUSALS } from './strength-quick-log.ts'
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

test('every session owner has a label of its own', () => {
	for (const owner of SESSION_OWNERS) {
		expect(SESSION_OWNER_LABELS[owner]).toBeTruthy()
	}
	expect(new Set(Object.values(SESSION_OWNER_LABELS)).size).toBe(
		SESSION_OWNERS.length,
	)
})

test('every branch that holds a week has its own reason, so "keep" always says why (#505 story 50)', () => {
	const facts = {
		over: '25 %',
		under: '20 %',
		tsb: '−12',
		requiredDays: 42,
		daysOfHistory: 10,
	}
	const whys = [...NO_CHANGE_WHYS, ...INSUFFICIENT_DATA_WHYS]
	for (const why of whys) {
		expect(WEEK_HOLD_REASON_LABELS[why](facts)).toBeTruthy()
	}
	expect(
		new Set(whys.map((why) => WEEK_HOLD_REASON_LABELS[why](facts))).size,
	).toBe(whys.length)
	expect(WEEK_HOLD_REASON_LABELS['form-untrusted'](facts)).toBe(
		'Forrige uke ble 25 % tyngre enn planlagt, men formtallet er først til å stole på etter 42 dager (dag 10 av 42). Vi endrer ingenting ennå.',
	)
})

test('every Load Recompute Notice kind has its own words, so none renders blank', () => {
	for (const kind of LOAD_RECOMPUTE_KINDS) {
		expect(RECOMPUTE_NOTICE_LABELS.copy[kind].kicker).toBeTruthy()
		expect(RECOMPUTE_NOTICE_LABELS.copy[kind].explanation).toBeTruthy()
	}
})

test('every race-date problem is said on the field, the longest plan named right', () => {
	for (const problem of EVENT_DATE_PROBLEMS) {
		expect(EVENT_DATE_LABELS[problem]).toBeTruthy()
	}
	expect(EVENT_DATE_LABELS['too-far']).toContain(`${MAX_PLAN_WEEKS} uker`)
})

test('the page header names the screen it goes back to, in Norwegian', () => {
	expect(PAGE_HEADER_LABELS.back(APP_TAB_LABELS.me)).toBe('Tilbake til Meg')
})

test('the Norwegian weekdays run Monday first, seven distinct names', () => {
	expect(NB_WEEKDAY_LABELS).toHaveLength(7)
	expect(new Set(NB_WEEKDAY_LABELS).size).toBe(7)
	expect(NB_WEEKDAY_LABELS[0]).toBe('mandag')
	expect(NB_WEEKDAY_LABELS[6]).toBe('søndag')
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

test('every philosophy has its own name and a plain description, in the spec’s words', () => {
	for (const family of PRESET_FAMILIES) {
		expect(PHILOSOPHY_LABELS[family]).toBeTruthy()
		expect(PHILOSOPHY_DESCRIPTIONS[family]).toBeTruthy()
		// Plain words: no zone codes.
		expect(PHILOSOPHY_DESCRIPTIONS[family]).not.toMatch(/\bZ\d|sone \d/i)
	}
	expect(new Set(Object.values(PHILOSOPHY_LABELS)).size).toBe(
		PRESET_FAMILIES.length,
	)
	expect(PHILOSOPHY_LABELS).toMatchObject({
		classic: 'Klassisk 3:1',
		masters: 'Masters 2:1',
		polarized: 'Polarisert 80/20',
		threshold: 'Terskelfokus',
	})
	expect(plainMixSentence([])).toBe('ingen harde økter')
	expect(
		plainMixSentence([
			{ zone: 3, sessionsPerWeek: 1 },
			{ zone: 4, sessionsPerWeek: 1 },
		]),
	).toBe('1 tempo + 1 terskel i uka')
})

test('every week-number code has its own Norwegian words, so no "ikke målt" goes without a reason', () => {
	const maps: Array<[readonly string[], Record<string, string>]> = [
		[VOLUME_CURRENCIES, NB_VOLUME_UNITS],
		[UNMEASURED_REASONS, UNMEASURED_REASON_LABELS],
		[VOLUME_GRADES, VOLUME_GRADE_LABELS],
	]
	for (const [codes, labels] of maps) {
		for (const code of codes) expect(labels[code]).toBeTruthy()
		expect(new Set(Object.values(labels)).size).toBe(codes.length)
	}
	expect(unmeasuredCountLabel(2, 'km')).toBe('+2 uten km')
	expect(strengthPartialLabel(3)).toBe('til og med torsdag · resten ikke målt')
})

test('every sport a week header names has its own Norwegian word, and the horizon says what lies past it (#505 S9, ADR 0086)', () => {
	for (const discipline of DISCIPLINES) {
		expect(NB_DISCIPLINE_LABELS[discipline]).toBeTruthy()
	}
	expect(new Set(Object.values(NB_DISCIPLINE_LABELS)).size).toBe(
		DISCIPLINES.length,
	)
	expect(horizonFillLabel(39)).toBe('fylles søndag kveld i uke 39')
	expect(HORIZON_LABELS.plan).toBe('herfra bare mål, ingen økter ennå')
	expect(HORIZON_LABELS.name).toBe('Horisont')
})

test('the Ukeskiftet card says a round’s volume, silence and its answers in the spec’s words (#505 S10)', () => {
	expect(roundFactorLabel(1)).toBe('samme volum')
	expect(roundFactorLabel(1.05)).toBe('+5 % volum')
	expect(roundFactorLabel(0.9)).toBe('−10 % volum')
	expect(silencedLabel(true, 0)).toBe('Gjort i morges')
	expect(silencedLabel(false, 0)).toBe('Gjort mandag morgen')
	expect(quotedSession(null)).toBe('økta')
	expect(WEEK_CHANGE_LABELS.ok).toBe('Ok')
	expect(WEEK_CHANGE_LABELS.no).toBe('Nei takk')
})

test('every refusal on an import row is said in words (#505 stories 80–82)', () => {
	for (const reason of IMPORT_LINK_REFUSALS) {
		expect(IMPORT_LINK_REFUSAL_LABELS[reason]).toBeTruthy()
	}
	for (const reason of MARK_DONE_REFUSALS) {
		expect(MARK_DONE_REFUSAL_LABELS[reason]).toBeTruthy()
	}
})

test('the quick strength log speaks the spec’s words, and every refusal is said (#505 stories 83–84)', () => {
	expect(QUICK_LOG_LABELS.asPlanned).toBe('Som planlagt')
	expect(QUICK_LOG_LABELS.edit).toBe('Endre')
	for (const reason of QUICK_LOG_REFUSALS) {
		expect(QUICK_LOG_REFUSAL_LABELS[reason]).toBeTruthy()
	}
	// A weight in the load's own semantics, as `formatKg` writes the kilo.
	expect(QUICK_LOG_LABELS.load('external', '82.5')).toBe('82.5 kg')
	expect(QUICK_LOG_LABELS.load('bodyweightPlus', '15')).toBe(
		'kroppsvekt + 15 kg',
	)
})

test('every Sesong edit message says which numbers did not move, in the spec’s words', () => {
	for (const held of HELD_NUMBERS) expect(HELD_NUMBER_LABELS[held]).toBeTruthy()
	expect(
		seasonEditSentence(
			{
				kind: 'week-target',
				weekNumber: 42,
				before: '40',
				after: '46',
				unit: 'km',
				revert: false,
			},
			['phase', 'other-weeks'],
		),
	).toBe('Uke 42: mål 40 → 46 km. Fasen og de andre ukene står som før.')
	expect(
		seasonEditSentence(
			{
				kind: 'phase',
				name: { before: 'Base', after: 'Base' },
				weeks: { before: 4, after: 6 },
				rhythm: { before: '3:1', after: '3:1' },
				tapers: { before: false, after: false },
			},
			['phase-name', 'plan-start', 'other-phases'],
		),
	).toBe(
		'Base: 4 → 6 uker. Navnet, starten på planen og de andre fasene står som før.',
	)
	expect(
		seasonEditSentence(
			{
				kind: 'easy-week',
				phaseName: 'Blokk 1',
				weekNumber: 43,
				previousWeekNumber: 44,
			},
			['phase-length'],
		),
	).toBe(
		'Blokk 1: den lette uka flyttes fra uke 44 til uke 43. Lengden på fasen står som før.',
	)
	expect(
		seasonEditSentence(
			{
				kind: 'phase',
				name: { before: 'Base', after: 'Grunn' },
				weeks: { before: 4, after: 4 },
				rhythm: { before: '3:1', after: '2:1' },
				tapers: { before: false, after: false },
			},
			['phase-length'],
		),
	).toBe(
		'«Base» heter nå «Grunn» og går nå 2:1 (var 3:1). Lengden på fasen står som før.',
	)
	expect(
		seasonEditSentence(
			{
				kind: 'week-target',
				weekNumber: 42,
				before: '46',
				after: '40',
				unit: 'km',
				revert: true,
			},
			['phase', 'other-weeks'],
		),
	).toBe(
		'Uke 42: tilbake til planens mål, 46 → 40 km. Fasen og de andre ukene står som før.',
	)
	expect(weekRiseSentence(43, '42', '50', 'km', 0.1905)).toBe(
		'Uke 43: 42 → 50 km, +19 % over forrige harde uke.',
	)
})

test('every tab has its name in the spec’s own words', () => {
	expect(APP_TABS.map((tab) => APP_TAB_LABELS[tab])).toEqual([
		'I dag',
		'Sesong',
		'Bibliotek',
		'Meg',
	])
})

test('Meg names every state of the intervals.icu connection in words (ADR 0083)', () => {
	for (const state of CONNECTION_HUB_STATUSES) {
		expect(CONNECTION_HUB_STATUS_LABELS[state]).toBeTruthy()
	}
	expect(new Set(Object.values(CONNECTION_HUB_STATUS_LABELS)).size).toBe(
		CONNECTION_HUB_STATUSES.length,
	)
	for (const kind of EVENT_KINDS) {
		expect(NB_EVENT_KIND_LABELS[kind]).toBeTruthy()
	}
	expect(SEASON_EVENTS_LABELS.comingUp(0)).toBe('ingen kommende')
	expect(SEASON_EVENTS_LABELS.comingUp(2)).toBe('2 kommende')
})
