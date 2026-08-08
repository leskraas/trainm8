import { expect, test } from 'vitest'
import {
	fitRuleSummary,
	proposeFit,
	type FittablePhase,
} from './fit-proposal.ts'

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

test('the base absorbs the whole trim before any other block gives', () => {
	// Three weeks off a season whose base can pay all three: nothing else moves.
	// The rule is not "spread it fairly" — it is "the block furthest from the
	// event gives first", which is the only ordering an athlete can predict.
	const proposal = proposeFit(SEASON, { kind: 'runs-past', weeks: 3 })

	expect(proposal).toEqual({
		delta: -3,
		changes: [{ index: 0, name: 'Base', from: 8, to: 5 }],
	})
})

test('once the base is at its floor the season gives forward, block by block', () => {
	// Ten weeks off: the base pays seven (8 → 1) and the build pays the rest,
	// leaving the Peak untouched. The Peak gives last because it is the block
	// nearest the event and the most race-specific work in the season.
	const proposal = proposeFit(SEASON, { kind: 'runs-past', weeks: 10 })

	expect(proposal).toEqual({
		delta: -10,
		changes: [
			{ index: 0, name: 'Base', from: 8, to: 1 },
			{ index: 1, name: 'Build', from: 6, to: 3 },
		],
	})
})

test('the peak is the last block to give, never the first', () => {
	// The rule an ADR 0048 §3 proportional trim got wrong: taking off the longest
	// block reaches the Peak while the base is still long, which is a different
	// season rather than a shorter run-up to the same one.
	const peakHeavy: FittablePhase[] = [
		{ name: 'Base', weeks: 4, tapers: false },
		{ name: 'Peak', weeks: 9, tapers: false },
		{ name: 'Taper', weeks: 2, tapers: true },
	]

	expect(proposeFit(peakHeavy, { kind: 'runs-past', weeks: 3 })).toEqual({
		delta: -3,
		changes: [{ index: 0, name: 'Base', from: 4, to: 1 }],
	})
})

test('the taper is never touched, in either direction', () => {
	const trimmed = proposeFit(SEASON, { kind: 'runs-past', weeks: 12 })
	const extended = proposeFit(SEASON, { kind: 'ends-before', weeks: 4 })

	for (const proposal of [trimmed, extended]) {
		expect(proposal?.changes.some((change) => change.index === 3)).toBe(false)
	}
})

test('a taper is never shortened even when it is the only block with weeks to give', () => {
	// The one clause that is absolute. A season whose taper is the only block above
	// its floor cannot be fitted at all, and that is the right answer: a compressed
	// taper is the single change that reliably costs the athlete the event.
	const spent: FittablePhase[] = [
		{ name: 'Base', weeks: 1, tapers: false },
		{ name: 'Taper', weeks: 6, tapers: true },
	]

	expect(proposeFit(spent, { kind: 'runs-past', weeks: 2 })).toBeNull()
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

test('a block already at its floor is skipped rather than blocking the trim', () => {
	const spentBase: FittablePhase[] = [
		{ name: 'Base', weeks: 1, tapers: false },
		{ name: 'Build', weeks: 5, tapers: false },
		{ name: 'Taper', weeks: 2, tapers: true },
	]

	expect(proposeFit(spentBase, { kind: 'runs-past', weeks: 2 })).toEqual({
		delta: -2,
		changes: [{ index: 1, name: 'Build', from: 5, to: 3 }],
	})
})

test('the rule says what it did, naming every block and no others', () => {
	const one = proposeFit(SEASON, { kind: 'runs-past', weeks: 1 })!
	const two = proposeFit(SEASON, { kind: 'runs-past', weeks: 10 })!
	const three = proposeFit(SEASON, { kind: 'runs-past', weeks: 13 })!
	const added = proposeFit(SEASON, { kind: 'ends-before', weeks: 2 })!

	expect(fitRuleSummary(one)).toBe('shortens Base by 1 week')
	expect(fitRuleSummary(two)).toBe(
		'shortens Base by 7 weeks and Build by 3 weeks',
	)
	expect(fitRuleSummary(three)).toBe(
		'shortens Base by 7 weeks, Build by 5 weeks and Peak by 1 week',
	)
	expect(fitRuleSummary(added)).toBe('lengthens Base by 2 weeks')
})
