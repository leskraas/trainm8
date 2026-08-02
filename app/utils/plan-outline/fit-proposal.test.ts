import { expect, test } from 'vitest'
import { proposeFit, type FittablePhase } from './fit-proposal.ts'

const SEASON: FittablePhase[] = [
	{ name: 'Base', weeks: 8, tapers: false },
	{ name: 'Build', weeks: 6, tapers: false },
	{ name: 'Peak', weeks: 2, tapers: false },
	{ name: 'Taper', weeks: 2, tapers: true },
]

test('a season already ending on the event week has nothing to propose', () => {
	expect(proposeFit(SEASON, { kind: 'ends-on-event-week' })).toBeNull()
})

test('weeks to add all go to the base — a longer run-in is more base', () => {
	const proposal = proposeFit(SEASON, { kind: 'ends-before', weeks: 3 })

	expect(proposal).toEqual({
		delta: 3,
		changes: [{ index: 0, name: 'Base', from: 8, to: 11 }],
	})
})

test('weeks to take come off the longest blocks first, one at a time', () => {
	// 8/6 with three to give: Base 8→7, Base 7→6, and now the two are level, so
	// the third week comes off Build — the base stays at least as long as the
	// build it feeds.
	const proposal = proposeFit(SEASON, { kind: 'runs-past', weeks: 3 })

	expect(proposal).toEqual({
		delta: -3,
		changes: [
			{ index: 0, name: 'Base', from: 8, to: 6 },
			{ index: 1, name: 'Build', from: 6, to: 5 },
		],
	})
})

test('the taper is never touched, in either direction', () => {
	const trimmed = proposeFit(SEASON, { kind: 'runs-past', weeks: 12 })
	const extended = proposeFit(SEASON, { kind: 'ends-before', weeks: 4 })

	for (const proposal of [trimmed, extended]) {
		expect(proposal?.changes.some((change) => change.index === 3)).toBe(false)
	}
})

test('no block is trimmed out of existence', () => {
	// 8 + 6 + 2 = 16 weeks over three blocks, each of which must keep one: 13
	// weeks is the most that can come off.
	const proposal = proposeFit(SEASON, { kind: 'runs-past', weeks: 13 })

	expect(proposal?.changes).toEqual([
		{ index: 0, name: 'Base', from: 8, to: 1 },
		{ index: 1, name: 'Build', from: 6, to: 1 },
		{ index: 2, name: 'Peak', from: 2, to: 1 },
	])
})

test('a trim that cannot land in full is no proposal at all', () => {
	// One more week than the blocks can give. A partial fit would shorten blocks
	// *and* still miss the event, so the athlete is left to remove one instead.
	expect(proposeFit(SEASON, { kind: 'runs-past', weeks: 14 })).toBeNull()
})

test('a season that is nothing but a taper has nothing to give', () => {
	const taperOnly: FittablePhase[] = [{ name: 'Taper', weeks: 3, tapers: true }]

	expect(proposeFit(taperOnly, { kind: 'runs-past', weeks: 1 })).toBeNull()
	expect(proposeFit(taperOnly, { kind: 'ends-before', weeks: 1 })).toBeNull()
})
