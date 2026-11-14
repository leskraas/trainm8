import { expect, test } from 'vitest'
import { anchorInForceAt, editAnchorList } from './season-anchors.ts'

const anchors = [
	{ fromWeekKey: '2026-11-02', value: 45 },
	{ fromWeekKey: '2026-10-05', value: 40 },
]

test('an add on a new week adds a segment, earliest first', () => {
	expect(
		editAnchorList(anchors, {
			action: 'add',
			fromWeekKey: '2026-10-19',
			value: 42,
		}),
	).toEqual({
		ok: true,
		anchors: [
			{ fromWeekKey: '2026-10-05', value: 40 },
			{ fromWeekKey: '2026-10-19', value: 42 },
			{ fromWeekKey: '2026-11-02', value: 45 },
		],
		act: 'add',
		merged: false,
		before: null,
	})
})

test('an add on a week that has a segment edits it, and says so', () => {
	expect(
		editAnchorList(anchors, {
			action: 'add',
			fromWeekKey: '2026-11-02',
			value: 50,
		}),
	).toMatchObject({
		ok: true,
		anchors: [
			{ fromWeekKey: '2026-10-05', value: 40 },
			{ fromWeekKey: '2026-11-02', value: 50 },
		],
		act: 'set',
		merged: true,
		before: 45,
	})
})

test('the earliest segment can be set but never removed', () => {
	expect(
		editAnchorList(anchors, {
			action: 'set',
			fromWeekKey: '2026-10-05',
			value: 38,
		}),
	).toMatchObject({ ok: true, act: 'set', merged: false, before: 40 })
	expect(
		editAnchorList(anchors, { action: 'remove', fromWeekKey: '2026-10-05' }),
	).toEqual({ ok: false, reason: 'earliest-anchor' })
	expect(
		editAnchorList(anchors, { action: 'remove', fromWeekKey: '2026-11-02' }),
	).toMatchObject({
		ok: true,
		anchors: [{ fromWeekKey: '2026-10-05', value: 40 }],
		act: 'remove',
		before: 45,
	})
})

test('a set or remove names a segment that exists', () => {
	expect(
		editAnchorList(anchors, {
			action: 'set',
			fromWeekKey: '2026-10-12',
			value: 1,
		}),
	).toEqual({ ok: false, reason: 'anchor-not-found' })
	expect(
		editAnchorList(anchors, { action: 'remove', fromWeekKey: '2026-10-12' }),
	).toEqual({ ok: false, reason: 'anchor-not-found' })
})

test('the segment in force is the latest at or before the week', () => {
	expect(anchorInForceAt(anchors, '2026-10-26')?.value).toBe(40)
	expect(anchorInForceAt(anchors, '2026-11-02')?.value).toBe(45)
	expect(anchorInForceAt(anchors, '2026-09-28')).toBeNull()
})

test('a retirement anchor is neither removed nor overwritten, and nothing is re-anchored after it (ADR 0109 §3)', () => {
	const retired = [
		{ fromWeekKey: '2026-10-05', value: 40 },
		{ fromWeekKey: '2026-11-02', value: 0 },
	]
	const refused = { ok: false, reason: 'retired-track' }
	expect(
		editAnchorList(retired, { action: 'remove', fromWeekKey: '2026-11-02' }),
	).toEqual(refused)
	expect(
		editAnchorList(retired, {
			action: 'set',
			fromWeekKey: '2026-11-02',
			value: 5,
		}),
	).toEqual(refused)
	expect(
		editAnchorList(retired, {
			action: 'add',
			fromWeekKey: '2026-11-16',
			value: 5,
		}),
	).toEqual(refused)
	// Before the retirement the season is still the athlete's to edit.
	expect(
		editAnchorList(retired, {
			action: 'add',
			fromWeekKey: '2026-10-19',
			value: 42,
		}),
	).toMatchObject({ ok: true, act: 'add' })
})
