import { expect, test } from 'vitest'
import {
	REST_AFTER_MADE_SET_SEC,
	REST_AFTER_MISSED_SET_SEC,
	REST_BEFORE_LAST_WARMUP_SEC,
	restAfterSet,
} from './rest.ts'

test('a made working set rests for the published three minutes', () => {
	expect(restAfterSet({ role: 'working', missed: false })).toEqual({
		sec: REST_AFTER_MADE_SET_SEC,
		reason: 'made-the-target',
	})
})

test('a missed working set rests longer than a made one, because the program says so', () => {
	const made = restAfterSet({ role: 'working', missed: false })
	const missed = restAfterSet({ role: 'working', missed: true })

	expect(missed.sec).toBe(REST_AFTER_MISSED_SET_SEC)
	expect(missed.sec!).toBeGreaterThan(made.sec!)
	expect(missed.reason).toBe('missed-the-target')
})

test('a prescribed rest governs a made set, because it is a coach’s own number', () => {
	expect(
		restAfterSet({ role: 'working', missed: false, prescribedSec: 90 }),
	).toEqual({ sec: 90, reason: 'made-the-target' })
})

test('a missed set takes the longer of the published rest and the prescribed one, and never a scaled one', () => {
	// 90 s prescribed does not become 150 s by applying the published 5:3 ratio —
	// that ratio is an artefact of two absolute figures, not a coefficient.
	expect(
		restAfterSet({ role: 'working', missed: true, prescribedSec: 90 }).sec,
	).toBe(REST_AFTER_MISSED_SET_SEC)
	// A coach who asked for more than five minutes keeps their number.
	expect(
		restAfterSet({ role: 'working', missed: true, prescribedSec: 420 }).sec,
	).toBe(420)
})

test('there is no rest between warm-up sets, and null says so rather than zero', () => {
	expect(restAfterSet({ role: 'warmup', missed: false })).toEqual({
		sec: null,
		reason: 'between-warmup-sets',
	})
})

test('the last warm-up set is the one that gets a pause', () => {
	expect(
		restAfterSet({ role: 'warmup', missed: false, isLastWarmupSet: true }),
	).toEqual({
		sec: REST_BEFORE_LAST_WARMUP_SEC,
		reason: 'before-the-last-warmup-set',
	})
})

test('a prescribed rest never reaches the ramp, so two empty-bar fives are not three minutes apart', () => {
	expect(
		restAfterSet({ role: 'warmup', missed: false, prescribedSec: 180 }).sec,
	).toBeNull()
})

test('a back-off set rests like a working set, because it is work', () => {
	expect(restAfterSet({ role: 'backoff', missed: false }).reason).toBe(
		'made-the-target',
	)
})
