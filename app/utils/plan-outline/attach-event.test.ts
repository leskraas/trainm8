// Adding an Event to an open-ended plan, as a preview (#518, ADR 0079 §4):
// stored rows, the Event and the week being lived go in; what the athlete
// reads before confirming, and the edit that makes it so, come out. Pure — the
// same computation the apply runs, so what was shown is what lands.
//
// The plan opens Monday 31 Dec 2029 with two four-week rounds on 3:1. It is
// the week of 7 Jan (the plan's second); the race is on Sunday 10 Mar, whose
// week (4 Mar) is the plan's tenth.
import { expect, test } from 'vitest'
import { previewAttachEvent, type AttachEventOutline } from './attach-event.ts'
import { type SegmentRow } from './from-rows.ts'

const THIS_WEEK = '2030-01-07'
const RACE = { name: 'Vårløpet', dayKey: '2030-03-10', weekKey: '2030-03-04' }

function segment(phaseId: string): SegmentRow {
	return {
		id: `seg-${phaseId}`,
		kind: 'endurance',
		phaseId,
		ramp: null,
		boundaryStep: null,
		recoveryCut: null,
		taperCut: null,
		startWeekKey: null,
		weeks: null,
		goal: null,
		sessionsPerWeek: null,
		deloadCut: null,
		deloadWeeks: null,
		mix: [],
	}
}

function openEnded(
	overrides: Array<{ weekKey: string; value: number }> = [],
): AttachEventOutline {
	return {
		startWeekKey: '2029-12-31',
		family: null,
		phases: [
			{
				id: 'b1',
				orderIndex: 0,
				name: 'Blokk 1',
				weeks: 4,
				rhythm: '3:1',
				tapers: false,
			},
			{
				id: 'b2',
				orderIndex: 1,
				name: 'Blokk 2',
				weeks: 4,
				rhythm: '3:1',
				tapers: false,
			},
		],
		tracks: [
			{
				id: 'run',
				discipline: 'run',
				currency: 'km',
				anchors: [{ fromWeekKey: '2029-12-31', value: 30 }],
				segments: [segment('b1'), segment('b2')],
				overrides,
			},
		],
	}
}

test('the round being lived ends after this week, and the run-up is laid to the Event', () => {
	const preview = previewAttachEvent(openEnded(), RACE, THIS_WEEK)
	if (!preview.ok) throw new Error(preview.reason)

	expect(preview.event).toEqual(RACE)
	// Blokk 1 was four weeks; it ends after the two lived, this one included.
	expect(preview.ended).toEqual({
		name: 'Blokk 1',
		weeks: 2,
		wasWeeks: 4,
		lastWeekKey: THIS_WEEK,
	})
	// Blokk 2 never began: it goes.
	expect(preview.removed).toEqual(['Blokk 2'])
	expect(preview.fromWeekKey).toBe('2030-01-14')
	// Both sides from this week on: the rest of the rounds, then this week and
	// Klassisk's run-up fitted to the eight weeks left (the first block gives).
	expect(preview.phases.before.map((p) => [p.name, p.weeks])).toEqual([
		['Blokk 1', 3],
		['Blokk 2', 4],
	])
	expect(
		preview.phases.after.map((p) => [p.name, p.weeks, p.fromWeekKey]),
	).toEqual([
		['Blokk 1', 1, '2030-01-07'],
		['Build', 4, '2030-01-14'],
		['Peak', 2, '2030-02-11'],
		['Taper', 2, '2030-02-25'],
	])
	expect(preview.edit).toEqual({
		ending: { phaseId: 'b1', weeks: 2 },
		remove: ['b2'],
		add: [
			expect.objectContaining({ name: 'Build', weeks: 4, tapers: false }),
			expect.objectContaining({ name: 'Peak', weeks: 2, tapers: false }),
			expect.objectContaining({ name: 'Taper', weeks: 2, tapers: true }),
		],
	})
})

test('week by week from this week to the Event: what the plan reads now, and after', () => {
	const preview = previewAttachEvent(openEnded(), RACE, THIS_WEEK)
	if (!preview.ok) throw new Error(preview.reason)

	expect(preview.weeks.map((w) => w.weekKey)).toEqual([
		'2030-01-07',
		'2030-01-14',
		'2030-01-21',
		'2030-01-28',
		'2030-02-04',
		'2030-02-11',
		'2030-02-18',
		'2030-02-25',
		'2030-03-04',
	])
	// The week being lived reads the same on both sides.
	expect(preview.weeks[0]!.after).toEqual(preview.weeks[0]!.before)
	// Toward the Event the after side is the run-up's; the old plan ended
	// before the race week, and says so.
	expect(preview.weeks[1]!.after?.phaseName).toBe('Build')
	expect(preview.weeks.at(-1)).toMatchObject({
		before: null,
		after: { phaseName: 'Taper', role: 'taper' },
	})
	for (const week of preview.weeks) {
		for (const target of week.after?.targets ?? []) {
			expect(target).toMatchObject({ trackId: 'run', currency: 'km' })
		}
	}
})

test('it warns where the new plan rises more than 10 % in a week, and only from the first week laid', () => {
	expect(previewAttachEvent(openEnded(), RACE, THIS_WEEK)).toMatchObject({
		warnings: [],
	})

	// Hand-set weeks stay through the attach: a jump into 21 Jan is the new
	// plan's to warn on; the same jump into the week being lived is history.
	const preview = previewAttachEvent(
		openEnded([
			{ weekKey: '2030-01-07', value: 60 },
			{ weekKey: '2030-01-21', value: 60 },
		]),
		RACE,
		THIS_WEEK,
	)
	if (!preview.ok) throw new Error(preview.reason)
	expect(preview.warnings).toEqual([
		expect.objectContaining({
			trackId: 'run',
			weekKey: '2030-01-21',
			fromWeekKey: '2030-01-14',
			to: 60,
		}),
	])
})

test('the digest is stable, and changes with what would land', () => {
	const preview = previewAttachEvent(openEnded(), RACE, THIS_WEEK)
	if (!preview.ok) throw new Error(preview.reason)
	expect(previewAttachEvent(openEnded(), RACE, THIS_WEEK)).toMatchObject({
		digest: preview.digest,
	})
	// Another week begun, another race, or another name for it: not the same.
	for (const other of [
		previewAttachEvent(openEnded(), RACE, '2030-01-14'),
		previewAttachEvent(
			openEnded(),
			{ ...RACE, dayKey: '2030-03-17', weekKey: '2030-03-11' },
			THIS_WEEK,
		),
		previewAttachEvent(openEnded(), { ...RACE, name: 'Høstløpet' }, THIS_WEEK),
	]) {
		expect(other.ok && other.digest).not.toBe(preview.digest)
	}
})

test('an Event in this week leaves no week to lay toward it', () => {
	expect(
		previewAttachEvent(
			openEnded(),
			{ ...RACE, dayKey: '2030-01-12', weekKey: THIS_WEEK },
			THIS_WEEK,
		),
	).toEqual({ ok: false, reason: 'event-too-soon' })
})

test('an Event tomorrow, in next week, still gets its taper', () => {
	const preview = previewAttachEvent(
		openEnded(),
		{ ...RACE, dayKey: '2030-01-14', weekKey: '2030-01-14' },
		THIS_WEEK,
	)
	expect(preview).toMatchObject({
		ok: true,
		phases: {
			after: [
				{ name: 'Blokk 1', weeks: 1 },
				{ name: 'Taper', weeks: 1 },
			],
		},
	})
})

test('an Event so far out the plan would run past two years is refused', () => {
	// Week 104 is the last a plan may hold (`MAX_PLAN_WEEKS`).
	expect(
		previewAttachEvent(
			openEnded(),
			{ ...RACE, dayKey: '2031-12-28', weekKey: '2031-12-22' },
			THIS_WEEK,
		),
	).toMatchObject({ ok: true })
	expect(
		previewAttachEvent(
			openEnded(),
			{ ...RACE, dayKey: '2032-01-04', weekKey: '2031-12-29' },
			THIS_WEEK,
		),
	).toEqual({ ok: false, reason: 'plan-too-long' })
})

test('past the plan’s end, the last round runs on to this week and ends there', () => {
	const preview = previewAttachEvent(openEnded(), RACE, '2030-02-04')
	if (!preview.ok) throw new Error(preview.reason)
	// Week index 5, inside Blokk 2 (weeks 4–7): it ends after two weeks.
	expect(preview.ended).toMatchObject({ name: 'Blokk 2', weeks: 2 })
	expect(preview.removed).toEqual([])

	const later = previewAttachEvent(
		openEnded(),
		{ ...RACE, dayKey: '2030-04-14', weekKey: '2030-04-08' },
		'2030-03-04',
	)
	if (!later.ok) throw new Error(later.reason)
	// Week index 9, past the plan's eight: Blokk 2 runs on over the lived gap.
	expect(later.ended).toEqual({
		name: 'Blokk 2',
		weeks: 6,
		wasWeeks: 4,
		lastWeekKey: '2030-03-04',
	})
})
