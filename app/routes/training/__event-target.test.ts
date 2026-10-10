import { expect, test } from 'vitest'
import {
	EVENT_KINDS,
	EVENT_PRIORITIES,
	EVENT_STATUSES,
	type EventTarget,
} from '#app/utils/event-schema.ts'
import {
	NB_EVENT_KIND_LABELS,
	NB_EVENT_PRIORITY_LABELS,
	NB_EVENT_STATUS_LABELS,
	NB_TARGET_KIND_LABELS,
	TARGET_KIND_LABELS,
} from '#app/utils/labels.ts'
import {
	eventDaysText,
	parseFinishTime,
	parseTargetKm,
	parseTargetPace,
	parseTargetPlacement,
	targetEntryOf,
	targetText,
} from './__event-target.ts'

test('a finish time reads as the clock an athlete types, with a phone pad’s . or , for :', () => {
	expect(parseFinishTime('3:30:00')).toBe(12600)
	expect(parseFinishTime('3.29.45')).toBe(12585)
	expect(parseFinishTime('42:30')).toBe(2550)
	expect(parseFinishTime('42,30')).toBe(2550)
	expect(parseFinishTime('3:75:00')).toBeNull()
	expect(parseFinishTime('fort')).toBeNull()
	expect(parseFinishTime('0:00')).toBeNull()
})

test('pace, distance and placement read Norwegian entries and refuse the rest', () => {
	expect(parseTargetPace('4:15')).toBe(255)
	expect(parseTargetPace('4.15')).toBe(255)
	expect(parseTargetKm('42,195')).toBe(42195)
	expect(parseTargetKm('10 km')).toBe(10000)
	expect(parseTargetKm('0')).toBeNull()
	expect(parseTargetPlacement('3')).toBe(3)
	expect(parseTargetPlacement('0')).toBeNull()
	expect(parseTargetPlacement('3.5')).toBeNull()
})

test('the edit form shows a stored target as words that read back to the same value', () => {
	const targets: EventTarget[] = [
		{ kind: 'time', seconds: 12585 },
		{ kind: 'pace', secPerKm: 255 },
		{ kind: 'distance', meters: 42195 },
		{ kind: 'placement', position: 3 },
	]
	const readers = {
		time: (e: ReturnType<typeof targetEntryOf>) =>
			parseFinishTime(e.targetTime),
		pace: (e: ReturnType<typeof targetEntryOf>) =>
			parseTargetPace(e.targetPace),
		distance: (e: ReturnType<typeof targetEntryOf>) =>
			parseTargetKm(e.targetDistance),
		placement: (e: ReturnType<typeof targetEntryOf>) =>
			parseTargetPlacement(e.targetPlacement),
	}
	expect(
		targets.map((t) =>
			readers[t.kind as keyof typeof readers](targetEntryOf(t)),
		),
	).toEqual([12585, 255, 42195, 3])
	expect(targetEntryOf(null).targetKind).toBe('')
})

test('a target reads in Norwegian, with a decimal comma', () => {
	expect(targetText({ kind: 'time', seconds: 12600 })).toBe('3:30:00')
	expect(targetText({ kind: 'pace', secPerKm: 255 })).toBe('4:15 /km')
	expect(targetText({ kind: 'distance', meters: 42195 })).toBe('42,2 km')
	expect(targetText({ kind: 'placement', position: 1 })).toBe('Vinne')
	expect(targetText({ kind: 'placement', position: 3 })).toBe('Topp 3')
	expect(targetText({ kind: 'finish' })).toBe('Fullføre')
})

test('an Event’s days read in Norwegian, a single day once', () => {
	const day = new Date('2026-10-24T00:00:00Z')
	expect(eventDaysText(day, null)).toBe('24. okt 2026')
	expect(eventDaysText(day, day)).toBe('24. okt 2026')
	expect(eventDaysText(day, new Date('2026-10-26T00:00:00Z'))).toBe(
		'24.–26. okt 2026',
	)
	expect(
		eventDaysText(
			new Date('2026-12-30T00:00:00Z'),
			new Date('2027-01-02T00:00:00Z'),
		),
	).toBe('30. des 2026 – 2. jan 2027')
})

test('every Event kind, priority, status and target kind has a Norwegian name', () => {
	for (const kind of EVENT_KINDS)
		expect(NB_EVENT_KIND_LABELS[kind]).toBeTruthy()
	for (const priority of EVENT_PRIORITIES)
		expect(NB_EVENT_PRIORITY_LABELS[priority]).toBeTruthy()
	for (const status of EVENT_STATUSES)
		expect(NB_EVENT_STATUS_LABELS[status]).toBeTruthy()
	expect(Object.keys(NB_TARGET_KIND_LABELS)).toEqual(
		Object.keys(TARGET_KIND_LABELS),
	)
})
