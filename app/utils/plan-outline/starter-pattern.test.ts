import { expect, test } from 'vitest'
import {
	DEFAULT_TRAINING_WEEKDAYS,
	proposeStarterPattern,
	type StarterTrack,
} from './starter-pattern.ts'

const RUN: StarterTrack = {
	trackId: 'track-run',
	discipline: 'run',
	sessionsPerWeek: null,
}
const LIFT: StarterTrack = {
	trackId: 'track-strength',
	discipline: 'strength',
	sessionsPerWeek: 2,
}

test('the athlete’s own training days become the week, long day last', () => {
	// Sunday-first as stored: Tue, Thu, Sun.
	const proposal = proposeStarterPattern({
		trainableWeekdays: [2, 4, 0],
		tracks: [RUN],
	})

	expect(proposal?.source).toBe('availability')
	// Monday-first as a Training Week runs: Tue (1), Thu (3), Sun (6).
	expect(proposal?.days).toEqual([
		{ weekday: 1, trackId: 'track-run', weight: 1, role: 'ordinary' },
		{ weekday: 3, trackId: 'track-run', weight: 1, role: 'ordinary' },
		{ weekday: 6, trackId: 'track-run', weight: 2, role: 'long' },
	])
})

test('an athlete who never said falls back to the default, and it says so', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: null,
		tracks: [RUN],
	})

	expect(proposal?.source).toBe('default')
	expect(proposal?.days.map((day) => day.weekday)).toEqual(
		DEFAULT_TRAINING_WEEKDAYS,
	)
})

test('an athlete who says they train on no days is taken at their word', () => {
	expect(
		proposeStarterPattern({ trainableWeekdays: [], tracks: [RUN] }),
	).toBeNull()
})

test('a plan with no tracks has no week to propose', () => {
	expect(
		proposeStarterPattern({ trainableWeekdays: [2, 4], tracks: [] }),
	).toBeNull()
})

test('lifting days sit alongside the endurance week, from the front of it', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: [2, 4, 0],
		tracks: [RUN, LIFT],
	})

	const lifting = proposal?.days.filter(
		(day) => day.trackId === 'track-strength',
	)
	// Two, because that is what the block authors — and on the first two days, so
	// they land away from the long day rather than on top of it.
	expect(lifting).toEqual([
		{ weekday: 1, trackId: 'track-strength', weight: 1, role: 'ordinary' },
		{ weekday: 3, trackId: 'track-strength', weight: 1, role: 'ordinary' },
	])
	// And the run week is untouched by their presence: no figure crosses the two
	// tracks in either direction.
	expect(
		proposal?.days.filter((day) => day.trackId === 'track-run'),
	).toHaveLength(3)
})

test('a lifter who trains more often than they are available gets what fits', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: [2],
		tracks: [{ ...LIFT, sessionsPerWeek: 4 }],
	})

	expect(proposal?.days).toHaveLength(1)
})

test('a triathlete gets every discipline on every day, not one chosen for them', () => {
	const proposal = proposeStarterPattern({
		trainableWeekdays: [2, 0],
		tracks: [
			RUN,
			{ trackId: 'track-swim', discipline: 'swim', sessionsPerWeek: null },
		],
	})

	expect(proposal?.days).toHaveLength(4)
	expect(
		proposal?.days.filter((day) => day.role === 'long').map((d) => d.trackId),
	).toEqual(['track-run', 'track-swim'])
})
