import { expect, expectTypeOf, test } from 'vitest'
import {
	type CtlFor,
	type CtlForKind,
	type CtlMovement,
	LOAD_RECOMPUTE_KIND_DECLARATIONS,
	widestCtlMovement,
} from './recompute-notice.ts'

const curve = (entries: Array<[string, number]>) => new Map(entries)

test('a rise is the day the curve went up furthest, not the last day', () => {
	const before = curve([
		['2026-01-01', 10],
		['2026-01-02', 20],
		['2026-01-03', 30],
	])
	const after = curve([
		['2026-01-01', 11],
		['2026-01-02', 26],
		['2026-01-03', 31],
	])
	expect(widestCtlMovement(before, after, 'rise')).toEqual({
		ctlBefore: 20,
		ctlAfter: 26,
	})
})

test('a rise ignores days the curve fell, and a fall ignores days it rose', () => {
	const before = curve([
		['2026-01-01', 10],
		['2026-01-02', 20],
	])
	const after = curve([
		['2026-01-01', 30],
		['2026-01-02', 12],
	])
	expect(widestCtlMovement(before, after, 'rise')).toEqual({
		ctlBefore: 10,
		ctlAfter: 30,
	})
	expect(widestCtlMovement(before, after, 'fall')).toEqual({
		ctlBefore: 20,
		ctlAfter: 12,
	})
})

test('float noise, an unchanged curve and unmatched days are no movement', () => {
	expect(
		widestCtlMovement(
			curve([['2026-01-01', 20]]),
			curve([['2026-01-01', 20.02]]),
			'rise',
		),
	).toBeNull()
	expect(
		widestCtlMovement(
			curve([['2026-01-01', 20]]),
			curve([['2026-01-02', 90]]),
			'rise',
		),
	).toBeNull()
	expect(widestCtlMovement(curve([]), curve([]), 'fall')).toBeNull()
})

test('a prescription correction cannot record a CTL pair (ADR 0114 §3)', () => {
	// A load correction names its movement, or none when it moved no more than
	// noise. A prescription correction moved no Load Snapshot, so a pair there
	// would be an invented delta: the type refuses it. Typechecked, so the
	// `@ts-expect-error` fails the build the day the refusal stops holding.
	const moved: CtlFor<'load'> = { ctlBefore: 40, ctlAfter: 44 }
	const noise: CtlFor<'load'> = null
	const none: CtlFor<'prescription'> = null
	// @ts-expect-error a prescription correction has no CTL movement to name
	const invented: CtlFor<'prescription'> = { ctlBefore: 40, ctlAfter: 44 }
	expect([moved, noise, none, invented]).toHaveLength(4)

	expectTypeOf<CtlFor<'load'>>().toEqualTypeOf<CtlMovement | null>()
	expectTypeOf<CtlFor<'prescription'>>().toEqualTypeOf<null>()
	// A kind that might be either takes only what both allow.
	expectTypeOf<CtlFor<'load' | 'prescription'>>().toEqualTypeOf<null>()
})

test("each kind's writer takes the pair its declaration allows", () => {
	expectTypeOf<
		CtlForKind<'swim-rest-left-the-pace'>
	>().toEqualTypeOf<CtlMovement | null>()
	expectTypeOf<
		CtlForKind<'strength-left-the-triad'>
	>().toEqualTypeOf<CtlMovement | null>()
	// Both corrections today moved Load Snapshots.
	expect(LOAD_RECOMPUTE_KIND_DECLARATIONS).toEqual({
		'strength-left-the-triad': { moved: 'load' },
		'swim-rest-left-the-pace': { moved: 'load' },
	})
})
