import { expect, test } from 'vitest'
import { eventFit } from './event-fit.ts'

// A 10-week plan opening Monday 2026-03-02 runs its last week from 2026-05-04.
const START = '2026-03-02'

test('a plan whose last week is the Event’s week ends on it', () => {
	expect(eventFit(START, 10, '2026-05-04')).toEqual({
		kind: 'ends-on-event-week',
	})
})

test('a plan ending short of the Event says how short, and is not stretched', () => {
	expect(eventFit(START, 8, '2026-05-04')).toEqual({
		kind: 'ends-before',
		weeks: 2,
	})
})

test('a plan running past the Event says how far past', () => {
	expect(eventFit(START, 12, '2026-05-04')).toEqual({
		kind: 'runs-past',
		weeks: 2,
	})
})

test('an Event before the plan opens leaves every authored week past it', () => {
	expect(eventFit(START, 4, '2026-02-16')).toEqual({
		kind: 'runs-past',
		weeks: 5,
	})
})
