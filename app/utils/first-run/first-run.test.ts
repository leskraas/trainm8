import { expect, test } from 'vitest'
import {
	familyChoiceSentence,
	FINDING_ABSENCE_LABELS,
	FIRST_RUN_REFUSAL_LABELS,
	hoursEstimateLabel,
	nbWeekdayList,
} from '#app/utils/labels.ts'
import { type LoggedVolume } from '#app/utils/plan-outline/proposal.ts'
import { FIRST_RUN_PLAN_REFUSALS } from './first-run-schema.ts'
import {
	buildFindings,
	FINDING_ABSENCES,
	chooseFamily,
	questionPrefill,
	typicalWeekdays,
	weeklyHoursEstimate,
	type FamilyChoiceInputs,
} from './first-run.ts'

// The first run's pure half (#505 stories 62–71): what the history says, the
// hours arithmetic it shows, and which philosophy it picks, and why.

function volume(overrides: Partial<LoggedVolume>): LoggedVolume {
	return {
		discipline: 'run',
		sessions: 0,
		weeksTrained: 0,
		km: null,
		hours: null,
		sets: null,
		...overrides,
	}
}

const NONE: LoggedVolume[] = [
	volume({ discipline: 'run' }),
	volume({ discipline: 'bike' }),
	volume({ discipline: 'swim' }),
	volume({ discipline: 'strength' }),
]

function withVolumes(...overrides: LoggedVolume[]): LoggedVolume[] {
	return NONE.map(
		(empty) =>
			overrides.find((v) => v.discipline === empty.discipline) ?? empty,
	)
}

// 43 km a week at 5:35 a km for four weeks: 172 km in 172 × 335 s.
const RUNNER = volume({
	discipline: 'run',
	sessions: 16,
	weeksTrained: 4,
	km: 172,
	hours: (172 * 335) / 3600,
})

test('the hours estimate shows its arithmetic: 43 km/uke à 5:35 ≈ 4 t', () => {
	const estimate = weeklyHoursEstimate(withVolumes(RUNNER))

	expect(estimate).toEqual({
		parts: [
			{
				discipline: 'run',
				kind: 'pace',
				kmPerWeek: 43,
				paceSecPerKm: 335,
				hours: (43 * 335) / 3600,
			},
		],
		hours: 4,
	})
	expect(hoursEstimateLabel(estimate!)).toBe('43 km/uke à 5:35 ≈ 4 t')
})

test('a sport with no distance is reckoned in sessions, and the parts add up', () => {
	const estimate = weeklyHoursEstimate(
		withVolumes(
			RUNNER,
			volume({ discipline: 'bike', sessions: 8, weeksTrained: 4, hours: 10 }),
		),
	)

	// Two rides a week of 1 t 15 min on top of the runner's 4 t.
	expect(estimate?.hours).toBe(6.5)
	expect(hoursEstimateLabel(estimate!)).toBe(
		'43 km/uke à 5:35 + 2 økter/uke à 1 t 15 min ≈ 6,5 t',
	)
})

test('no endurance history gives no estimate rather than a guess', () => {
	expect(weeklyHoursEstimate(NONE)).toBeNull()
	// Lifting has no duration to price.
	expect(
		weeklyHoursEstimate(
			withVolumes(volume({ discipline: 'strength', sessions: 4, sets: 40 })),
		),
	).toBeNull()
})

test('typical days are the weekdays trained in at least two weeks', () => {
	expect(
		typicalWeekdays([
			{ weekKey: '2026-09-07', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 3 },
			{ weekKey: '2026-09-21', weekday: 6 },
			{ weekKey: '2026-09-28', weekday: 6 },
			{ weekKey: '2026-09-28', weekday: 6 },
		]),
	).toEqual([1, 6])
	// One-off days only: every day trained, rather than none.
	expect(
		typicalWeekdays([
			{ weekKey: '2026-09-07', weekday: 4 },
			{ weekKey: '2026-09-14', weekday: 2 },
		]),
	).toEqual([2, 4])
	expect(typicalWeekdays([])).toEqual([])
})

test('Dette fant vi reads the most-trained sport, the volume, the days and the lifting', () => {
	const findings = buildFindings({
		connection: 'ready',
		volumes: withVolumes(
			RUNNER,
			volume({ discipline: 'bike', sessions: 2, weeksTrained: 2, hours: 3 }),
			volume({
				discipline: 'strength',
				sessions: 4,
				weeksTrained: 4,
				sets: 48,
			}),
		),
		weeksTrained: 4,
		sessionDays: [
			{ weekKey: '2026-09-07', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 1 },
		],
	})

	expect(findings.discipline).toEqual({
		measured: true,
		value: { discipline: 'run', sessions: 16, weeksTrained: 4 },
	})
	expect(findings.volume.measured && findings.volume.value.hours).toBe(5)
	expect(findings.days).toEqual({ measured: true, value: [1] })
	expect(findings.strength).toEqual({
		measured: true,
		value: { sessionsPerWeek: 1 },
	})
	expect(findings.weeksTrained).toBe(4)
})

test('every ikke målt carries its reason (story 71)', () => {
	const skipped = buildFindings({
		connection: 'none',
		volumes: NONE,
		weeksTrained: 0,
		sessionDays: [],
	})
	expect(skipped.discipline).toEqual({
		measured: false,
		reason: 'not-connected',
	})
	expect(skipped.volume).toEqual({ measured: false, reason: 'not-connected' })
	expect(skipped.days).toEqual({ measured: false, reason: 'not-connected' })
	expect(skipped.strength).toEqual({ measured: false, reason: 'not-connected' })
	expect(skipped.weeksTrained).toBeNull()

	const importing = buildFindings({
		connection: 'importing',
		volumes: NONE,
		weeksTrained: 0,
		sessionDays: [],
	})
	expect(importing.volume).toEqual({ measured: false, reason: 'importing' })

	const quiet = buildFindings({
		connection: 'ready',
		volumes: NONE,
		weeksTrained: 0,
		sessionDays: [],
	})
	expect(quiet.days).toEqual({ measured: false, reason: 'no-sessions' })

	// Sessions with no recorded duration: the sport reads, the hours do not.
	const noClock = buildFindings({
		connection: 'ready',
		volumes: withVolumes(volume({ discipline: 'swim', sessions: 3 })),
		weeksTrained: 2,
		sessionDays: [{ weekKey: '2026-09-07', weekday: 2 }],
	})
	expect(noClock.discipline.measured).toBe(true)
	expect(noClock.volume).toEqual({ measured: false, reason: 'no-duration' })
})

test('the questions are pre-filled from the findings, and a correction wins', () => {
	const findings = buildFindings({
		connection: 'ready',
		volumes: withVolumes(RUNNER),
		weeksTrained: 4,
		sessionDays: [
			{ weekKey: '2026-09-07', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 5 },
			{ weekKey: '2026-09-21', weekday: 5 },
		],
	})

	expect(questionPrefill(findings, {})).toEqual({
		discipline: 'run',
		hours: 4,
		days: [1, 5],
		daysSource: 'history',
	})
	expect(
		questionPrefill(findings, { discipline: 'bike', hours: 6, days: [0, 2] }),
	).toEqual({
		discipline: 'bike',
		hours: 6,
		days: [0, 2],
		daysSource: 'corrected',
	})

	// Nothing to read: the convention's days, named as such, and no hours.
	const none = buildFindings({
		connection: 'none',
		volumes: NONE,
		weeksTrained: 0,
		sessionDays: [],
	})
	expect(questionPrefill(none, {})).toEqual({
		discipline: 'run',
		hours: null,
		days: [1, 3, 5, 6],
		daysSource: 'default',
	})
})

const STEADY: FamilyChoiceInputs = {
	goal: 'active',
	weeksToEvent: null,
	weeklyHours: 5,
	days: 4,
	age: 35,
	weeksTrained: 4,
}

test.each([
	[{}, 'classic', 'steady'],
	[{ age: 52 }, 'masters', 'older-athlete'],
	[{ weeksTrained: 1 }, 'classic', 'little-history'],
	[{ weeksTrained: null }, 'classic', 'little-history'],
	[{ days: 2 }, 'classic', 'few-days'],
	[{ weeklyHours: 3 }, 'classic', 'few-hours'],
	[{ weeklyHours: 8 }, 'polarized', 'many-hours'],
	[{ goal: 'event', weeksToEvent: 30 }, 'big-base', 'long-run-up'],
	[{ goal: 'event', weeksToEvent: 12 }, 'threshold', 'race-on-limited-time'],
	[
		{ goal: 'event', weeksToEvent: 12, weeklyHours: 9 },
		'polarized',
		'many-hours',
	],
] as const)('chooseFamily %j → %s because %s', (overrides, family, code) => {
	const choice = chooseFamily({ ...STEADY, ...overrides })
	expect(choice.family).toBe(family)
	expect(choice.reason.code).toBe(code)
})

test('the reason is said in plain words, with no zone codes (story 70)', () => {
	const sentences = [
		chooseFamily(STEADY),
		chooseFamily({ ...STEADY, age: 61 }),
		chooseFamily({ ...STEADY, weeksTrained: 2 }),
		chooseFamily({ ...STEADY, weeksTrained: null }),
		chooseFamily({ ...STEADY, days: 2 }),
		chooseFamily({ ...STEADY, weeklyHours: 2.5 }),
		chooseFamily({ ...STEADY, weeklyHours: 10 }),
		chooseFamily({ ...STEADY, goal: 'event', weeksToEvent: 30 }),
		chooseFamily({ ...STEADY, goal: 'event', weeksToEvent: 10 }),
	].map(familyChoiceSentence)

	for (const sentence of sentences) {
		expect(sentence).toMatch(/^Vi valgte .+ fordi /)
		expect(sentence).not.toMatch(/\b[ZI][1-5]\b|zone|sone \d/i)
	}
	expect(sentences[1]).toBe(
		'Vi valgte Masters 2:1 fordi du er 61 år. Da trenger kroppen hvile oftere, så hver tredje uke er lett.',
	)
	expect(sentences[6]).toBe(
		'Vi valgte Polarisert 80/20 fordi du har 10 t i uka. Med så mye tid lønner det seg å trene det meste rolig og litt veldig hardt.',
	)
})

test('every ikke målt and every refusal has its own words (story 71)', () => {
	for (const reason of FINDING_ABSENCES) {
		expect(FINDING_ABSENCE_LABELS[reason]).toMatch(/^Ikke målt/)
	}
	for (const reason of FIRST_RUN_PLAN_REFUSALS) {
		expect(FIRST_RUN_REFUSAL_LABELS[reason]).toBeTruthy()
	}
	expect(nbWeekdayList([1, 3, 5])).toBe('tirsdag, torsdag og lørdag')
	expect(nbWeekdayList([6])).toBe('søndag')
})
