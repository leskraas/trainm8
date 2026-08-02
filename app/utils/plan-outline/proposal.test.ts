import { expect, test } from 'vitest'
import {
	ANCHOR_WINDOW_WEEKS,
	currencyOptionsFor,
	defaultTrackDiscipline,
	proposeTrack,
	trackDisciplinesFor,
	type LoggedVolume,
} from './proposal.ts'

function volume(overrides: Partial<LoggedVolume> = {}): LoggedVolume {
	return {
		discipline: 'run',
		weeksTrained: 4,
		sessions: 16,
		km: 200,
		hours: 20,
		sets: null,
		...overrides,
	}
}

test('an endurance discipline proposes distance, and offers hours beside it', () => {
	const proposal = proposeTrack(volume({ km: 200, hours: 20 }))

	expect(proposal.currency).toBe('km')
	expect(proposal.offered).toContain('hours')
	// The proposed currency leads, so the form's default needs no second lookup.
	expect(proposal.offered[0]).toBe('km')
})

test('the anchor is the window average, with its derivation carried beside it', () => {
	const proposal = proposeTrack(
		volume({ km: 200, weeksTrained: 4, sessions: 16 }),
	)

	expect(proposal.anchors.km).toEqual({
		value: 50,
		derivation: {
			source: 'recent-training',
			windowWeeks: ANCHOR_WINDOW_WEEKS,
			weeksTrained: 4,
			total: 200,
			currency: 'km',
		},
	})
})

test('every offered currency the history can express carries its own pre-fill', () => {
	// Anchor value and Volume Currency are one act (ADR 0043 §2): an athlete taking
	// the offered hours must get the hours figure, not the distance one relabelled.
	const proposal = proposeTrack(volume({ km: 200, hours: 20 }))

	expect(proposal.anchors.km?.value).toBe(50)
	expect(proposal.anchors.hours?.value).toBe(5)
	expect(proposal.anchors.hours?.derivation).toMatchObject({
		total: 20,
		currency: 'hours',
	})
	// TSS is offerable but this history cannot express it, so it has no pre-fill.
	expect(proposal.anchors.tss).toBeUndefined()
})

test('the window average divides by the whole window, not by the weeks trained', () => {
	// "Your last 4 weeks averaged …" (ADR 0040 §6) — two trained weeks out of four
	// average to half, and `weeksTrained` is what tells the athlete why.
	const proposal = proposeTrack(volume({ km: 100, weeksTrained: 2 }))

	expect(proposal.anchors.km?.value).toBe(25)
	expect(proposal.anchors.km?.derivation.weeksTrained).toBe(2)
})

test('an endurance discipline whose history recorded no distance proposes hours', () => {
	const proposal = proposeTrack(volume({ km: null, hours: 22 }))

	expect(proposal.currency).toBe('hours')
	expect(proposal.anchors.hours?.value).toBe(5.5)
	expect(proposal.anchors.km).toBeUndefined()
})

test('a distance proposal survives a history with no recorded duration', () => {
	const proposal = proposeTrack(volume({ km: 120, hours: null }))

	expect(proposal.currency).toBe('km')
	expect(proposal.anchors.km?.value).toBe(30)
	expect(proposal.anchors.hours).toBeUndefined()
})

test('strength proposes sets per week, with no other currency offered', () => {
	const proposal = proposeTrack(
		volume({ discipline: 'strength', km: null, hours: 6, sets: 96 }),
	)

	expect(proposal.currency).toBe('sets')
	expect(proposal.offered).toEqual(['sets'])
	expect(proposal.anchors.sets?.value).toBe(24)
})

test('no history proposes nothing at all — the athlete picks', () => {
	const proposal = proposeTrack(
		volume({ sessions: 0, weeksTrained: 0, km: null, hours: null }),
	)

	expect(proposal.currency).toBeNull()
	expect(proposal.anchors).toEqual({})
	// The unit is still theirs to choose, so the options do not go away with it.
	expect(proposal.offered).toEqual(['km', 'hours', 'tss'])
})

test('history with sessions but nothing measurable proposes nothing', () => {
	const proposal = proposeTrack(volume({ km: null, hours: null }))

	expect(proposal.currency).toBeNull()
	expect(proposal.anchors).toEqual({})
})

test('a strength history with no counted sets proposes sets and no anchor', () => {
	// The currency is not a guess for strength (ADR 0043 §2) — only the number is.
	const proposal = proposeTrack(
		volume({ discipline: 'strength', km: null, sets: null }),
	)

	expect(proposal.currency).toBe('sets')
	expect(proposal.anchors.sets).toBeUndefined()
})

test('the pre-filled anchor is rounded to a number the athlete would type', () => {
	expect(proposeTrack(volume({ km: 233 })).anchors.km?.value).toBe(58.3)
	expect(
		proposeTrack(volume({ km: null, hours: 23.13 })).anchors.hours?.value,
	).toBe(5.8)
	expect(
		proposeTrack(volume({ discipline: 'strength', km: null, sets: 97 })).anchors
			.sets?.value,
	).toBe(24)
})

test('a zero-volume history proposes no anchor rather than an anchor of zero', () => {
	// An anchor of 0 makes every derived week 0 for the life of the plan, which is
	// a plan nobody authored — Unavailable beats a number that cannot be trained.
	const proposal = proposeTrack(volume({ km: 0, hours: 0 }))

	expect(proposal.anchors).toEqual({})
})

test('currency options are the discipline’s, never the whole vocabulary', () => {
	expect(currencyOptionsFor('run')).toEqual(['km', 'hours', 'tss'])
	expect(currencyOptionsFor('swim')).toEqual(['km', 'hours', 'tss'])
	expect(currencyOptionsFor('bike')).toEqual(['km', 'hours', 'tss'])
	expect(currencyOptionsFor('strength')).toEqual(['sets'])
})

test('the track’s discipline follows the Event the plan is built toward', () => {
	expect(
		defaultTrackDiscipline(['bike'], [volume({ discipline: 'run' })]),
	).toBe('bike')
})

test('with a discipline-less Event the most-trained discipline leads', () => {
	expect(
		defaultTrackDiscipline(
			[],
			[
				volume({ discipline: 'run', sessions: 3 }),
				volume({ discipline: 'bike', sessions: 11 }),
			],
		),
	).toBe('bike')
})

test('with nothing to go on the discipline stays unset rather than guessed', () => {
	expect(defaultTrackDiscipline([], [])).toBeNull()
	expect(
		defaultTrackDiscipline([], [volume({ discipline: 'run', sessions: 0 })]),
	).toBeNull()
})

test('a multi-discipline Event gets a track each, not just its first', () => {
	// One season, three tracks, one phase timeline (ADR 0043 §1) — a triathlete
	// who got one track would be authoring three plans to peak once.
	expect(trackDisciplinesFor(['swim', 'bike', 'run'], [])).toEqual([
		'swim',
		'bike',
		'run',
	])
})

test('a Discipline named twice on the Event is still one track', () => {
	expect(trackDisciplinesFor(['run', 'run'], [])).toEqual(['run'])
})

test('a discipline-less Event falls back to the one discipline history reads', () => {
	expect(
		trackDisciplinesFor(
			[],
			[
				volume({ discipline: 'run', sessions: 3 }),
				volume({ discipline: 'bike', sessions: 11 }),
			],
		),
	).toEqual(['bike'])
	expect(trackDisciplinesFor([], [])).toEqual([])
})
