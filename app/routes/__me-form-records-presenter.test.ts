/**
 * Meg's Form and Rekorder readings — moved from the home hero's panes (#505),
 * with the honesty rules they had there: Form is refused on a cold start and
 * said out loud instead (ADR 0008/0010), every "ikke målt" gives its reason
 * (story 71), trust is shown, and no number is invented where there is none.
 */
import { expect, test } from 'vitest'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import {
	buildFormReading,
	buildRecordLines,
} from './__me-form-records-presenter.ts'

const TRUSTED: TsbTrust = {
	trustworthy: true,
	daysOfHistory: 60,
	requiredDays: 42,
}
const COLD: TsbTrust = {
	trustworthy: false,
	daysOfHistory: 12,
	requiredDays: 42,
}

function form(
	overrides: Partial<Parameters<typeof buildFormReading>[0]> = {},
): ReturnType<typeof buildFormReading> {
	return buildFormReading({
		current: { ctl: 62, atl: 58, tsb: 4, date: '2030-02-20' },
		trust: TRUSTED,
		...overrides,
	})
}

// ── Form ──

test('the triad reads Kondisjon, Tretthet and Form, in that order', () => {
	const stats = form().stats
	expect(stats.map((stat) => stat.legend.short)).toEqual([
		'Kondisjon',
		'Tretthet',
		'Form',
	])
	// The stored numbers, rounded as they always were; Form signed the way the
	// coach's sentence writes it.
	expect(stats.map((stat) => stat.value)).toEqual(['62', '58', '+4'])
	expect(
		form({ current: { ctl: 61.6, atl: 70.2, tsb: -8.6 } }).stats.map(
			(stat) => stat.value,
		),
	).toEqual(['62', '70', '−9'])
})

test('every abbreviation carries the full term it stands for (#181)', () => {
	expect(form().stats.map((stat) => stat.legend.term)).toEqual([
		'Kondisjon (CTL)',
		'Tretthet (ATL)',
		'Form (TSB)',
	])
})

test('a trusted reading says what it stands on and when it was computed', () => {
	const reading = form()
	expect(reading.unmeasured).toBeNull()
	expect(reading.baseline).toBeNull()
	expect(reading.state).toBe('i balanse')
	expect(reading.trust).toBe(
		'Bygger på 60 dager med belastning · regnet ut 20. feb',
	)
})

test('Form reads as a state in the coach’s words', () => {
	expect(form({ current: { ctl: 60, atl: 40, tsb: 20 } }).state).toBe('uthvilt')
	expect(form({ current: { ctl: 60, atl: 90, tsb: -30 } }).state).toBe('sliten')
})

test('a cold start keeps the two averages, refuses Form, and says why', () => {
	const reading = form({ trust: COLD })
	expect(reading.stats.map((stat) => stat.value)).toEqual(['62', '58', null])
	expect(reading.unmeasured).toBe(
		'Formen er ikke målt ennå: den trenger 42 dager med belastning, og du har 12. Kondisjon og tretthet kan leses fra første dag.',
	)
	// No state read off a number the section refuses to print.
	expect(reading.state).toBeNull()
	expect(reading.trust).toBeNull()
})

test('below the gate the reading carries how far along it is', () => {
	expect(form({ trust: COLD }).baseline).toEqual({
		day: 12,
		required: 42,
		label: 'dag 12 av 42',
	})
})

test('with no load computed every number is missing, for one stated reason', () => {
	const reading = form({ current: null, trust: COLD })
	expect(reading.stats.map((stat) => stat.value)).toEqual([null, null, null])
	expect(reading.unmeasured).toBe(
		'Ikke målt ennå: ingen treningsbelastning er regnet ut. Den kommer når du har logget økter.',
	)
	expect(reading.baseline?.label).toBe('dag 12 av 42')
})

test('past the gate with no snapshot, the missing numbers still give a reason', () => {
	// The hero was silent here; Meg says why (story 71).
	const reading = form({ current: null })
	expect(reading.stats.map((stat) => stat.value)).toEqual([null, null, null])
	expect(reading.unmeasured).toMatch(/^Ikke målt ennå/)
	expect(reading.baseline).toBeNull()
	expect(reading.trust).toBeNull()
})

test('a reading with no date still states its history, without a made-up day', () => {
	expect(form({ current: { ctl: 62, atl: 58, tsb: 4 } }).trust).toBe(
		'Bygger på 60 dager med belastning',
	)
})

test('the fitness trend reads off the snapshots, from the day they start', () => {
	expect(
		form({
			snapshots: [
				{ date: '2030-01-04', ctl: 51 },
				{ date: '2030-02-01', ctl: 58 },
				{ date: '2030-02-20', ctl: 62 },
			],
		}).trend,
	).toBe('Kondisjon 51 → 62 siden 4. jan')
})

test('one snapshot is not a trend, and the other end is not invented', () => {
	expect(
		form({ snapshots: [{ date: '2030-02-20', ctl: 62 }] }).trend,
	).toBeNull()
	expect(form({ snapshots: [] }).trend).toBeNull()
})

// ── Rekorder ──

const RECORDS: PersonalRecord[] = [
	{
		discipline: 'run',
		kind: 'farthest',
		value: 21_100,
		sessionId: 'session-1',
		achievedAt: new Date('2030-02-10T09:00:00Z'),
		previousValue: 10_000,
		delta: 11_100,
	},
	{
		discipline: 'swim',
		kind: 'farthest',
		value: 1_500,
		sessionId: 'session-2',
		achievedAt: new Date('2030-01-20T09:00:00Z'),
		previousValue: null,
		delta: null,
	},
]

test('records are written the Norwegian way: decimal comma, spaced thousands', () => {
	expect(buildRecordLines(RECORDS)).toEqual([
		{
			discipline: 'run',
			disciplineLabel: 'Løping',
			label: 'Lengste løpetur',
			value: '21,1 km',
			gain: '+11,1 km over forrige beste',
			setOn: 'satt 10. feb 2030',
		},
		{
			discipline: 'swim',
			disciplineLabel: 'Svømming',
			label: 'Lengste svømmeøkt',
			// No-break spaces: the figure and its unit never part at a line end.
			value: '1 500 m',
			gain: 'Første registrerte',
			setOn: 'satt 20. jan 2030',
		},
	])
})

test('a whole kilometre is written whole, not with a trailing zero', () => {
	const whole: PersonalRecord = { ...RECORDS[0]!, value: 15_004, delta: 4_500 }
	const line = buildRecordLines([whole])[0]!
	expect(line.value).toBe('15 km')
	expect(line.gain).toBe('+4,5 km over forrige beste')
})

test('a very long record groups its thousands, so it is never misread', () => {
	const tour: PersonalRecord = {
		...RECORDS[0]!,
		discipline: 'bike',
		value: 1_204_480,
		delta: 954,
	}
	const line = buildRecordLines([tour])[0]!
	expect(line.value).toBe('1\u00a0204,5 km')
	// Under a kilometre the gain is metres, never `+1 km`.
	expect(line.gain).toBe('+954 m over forrige beste')
})

test('the day a record was set is read in the athlete’s zone', () => {
	const late: PersonalRecord = {
		...RECORDS[0]!,
		achievedAt: new Date('2030-02-10T23:30:00Z'),
	}
	expect(buildRecordLines([late], 'Europe/Oslo')[0]!.setOn).toBe(
		'satt 11. feb 2030',
	)
})

test('no qualifying effort is an empty list, never a fabricated zero', () => {
	expect(buildRecordLines([])).toEqual([])
})
