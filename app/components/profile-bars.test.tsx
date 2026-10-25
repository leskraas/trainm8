/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { type ProfileBar } from '#app/utils/session-profile.ts'
import { MAX_PROFILE_BARS, ProfileBars } from './profile-bars.tsx'

const bars: ProfileBar[] = [
	{ id: 'wu', zone: 1, durationSec: 600 },
	{ id: 'on-0', zone: 4, durationSec: 360 },
	{ id: 'off-0', zone: 1, durationSec: 60 },
	{ id: 'on-1', zone: 4, durationSec: 360 },
	{ id: 'off-1', zone: 1, durationSec: 60 },
	{ id: 'cd', zone: 1, durationSec: 600 },
]

test('renders a muted dash for an empty profile', () => {
	render(<ProfileBars bars={[]} />)
	expect(screen.getByText('—')).toBeInTheDocument()
})

test('renders no repeat bracket when no grouping is passed', () => {
	const { container } = render(<ProfileBars bars={bars} />)
	expect(container.querySelector('[data-testid="profile-bracket"]')).toBeNull()
})

test('renders a `× N` bracket over a repeat group', () => {
	render(
		<ProfileBars
			bars={bars}
			groups={[{ startIndex: 1, span: 4, repeatCount: 2 }]}
		/>,
	)
	const bracket = screen.getByTestId('profile-bracket')
	expect(bracket).toHaveTextContent('× 2')
})

test('renders one bracket per group', () => {
	const { getAllByTestId } = render(
		<ProfileBars
			bars={bars}
			groups={[
				{ startIndex: 1, span: 2, repeatCount: 3 },
				{ startIndex: 3, span: 2, repeatCount: 5 },
			]}
		/>,
	)
	const brackets = getAllByTestId('profile-bracket')
	expect(brackets).toHaveLength(2)
	expect(brackets[0]).toHaveTextContent('× 3')
	expect(brackets[1]).toHaveTextContent('× 5')
})

test('sizes every bar and gap so the whole session fits its width', () => {
	// 60 bars at a 1px floor and a 1px gap is 119px; in a box narrower than
	// that the floor shrinks to fit 2n - 1 slots in the box's width.
	const many: ProfileBar[] = Array.from({ length: 60 }, (_, i) => ({
		id: `bar-${i}`,
		zone: i % 2 ? 1 : 4,
		durationSec: 15,
	}))
	const { container } = render(<ProfileBars bars={many} />)
	const fit = container.querySelector<HTMLElement>('[data-profile-fit]')
	expect(fit).not.toBeNull()
	expect(fit!.style.getPropertyValue('--profile-bar-px')).toBe(
		'min(1px, 100cqw / 119)',
	)
	expect(container.querySelectorAll('[data-profile-bar]')).toHaveLength(60)
})

/** Each drawn bar's weight, as its flex-grow says. */
function drawnWeights(container: HTMLElement) {
	return Array.from(
		container.querySelectorAll<HTMLElement>('[data-profile-bar]'),
		(bar) => Number(bar.style.flexGrow),
	)
}

// 2n - 1 ≤ 140 in the 140px session detail, the narrowest box the bars draw
// in: past 70 a bar's floor goes under a pixel and the shape smears. Past the
// cap, runs of one zone draw as one bar first, so 3 × 20 × 50 m (122 bars,
// work and float alternating) keeps every rep it can.
test('caps the bars so each keeps a pixel in the narrowest box', () => {
	const steady: ProfileBar[] = Array.from({ length: 200 }, (_, i) => ({
		id: `steady-${i}`,
		zone: i < 100 ? 2 : 3,
		durationSec: 30,
	}))
	const { container, unmount } = render(<ProfileBars bars={steady} />)
	// One zone's run is one bar: two zones, two bars, time kept.
	expect(drawnWeights(container)).toEqual([3000, 3000])
	unmount()

	const alternating: ProfileBar[] = Array.from({ length: 1000 }, (_, i) => ({
		id: `rep-${i}`,
		zone: i % 2 ? 1 : 5,
		durationSec: i % 2 ? 10 : 20,
	}))
	const view = render(<ProfileBars bars={alternating} scale="row" />)
	const weights = drawnWeights(view.container)
	expect(weights).toHaveLength(MAX_PROFILE_BARS)
	expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(15_000)
	expect(
		view.container
			.querySelector<HTMLElement>('[data-profile-fit]')!
			.style.getPropertyValue('--profile-bar-px'),
	).toBe(`min(1px, 100cqw / ${2 * MAX_PROFILE_BARS - 1})`)
	// The longer half of each slice paints it: zone 5 here.
	expect(
		view.container.querySelectorAll('[data-profile-bar].bg-zone-5'),
	).toHaveLength(MAX_PROFILE_BARS)
})

test("a capped profile's brackets still span their bars, in order", () => {
	const longBlock: ProfileBar[] = [
		{ id: 'wu', zone: 1, durationSec: 600 },
		...Array.from({ length: 300 }, (_, i) => ({
			id: `rep-${i}`,
			zone: (i % 2 ? 1 : 4) as 1 | 4,
			durationSec: 30,
		})),
		{ id: 'cd', zone: 2, durationSec: 600 },
	]
	render(
		<ProfileBars
			bars={longBlock}
			groups={[
				{ startIndex: 1, span: 150, repeatCount: 75 },
				{ startIndex: 151, span: 150, repeatCount: 75 },
			]}
		/>,
	)
	const brackets = screen.getAllByTestId('profile-bracket')
	// No slice straddles a bracket's edge: each spans its own reps' time, and
	// the warm-up and cool-down stay outside them.
	expect(brackets.map((b) => Number(b.style.flexGrow))).toEqual([4500, 4500])
	const weights = drawnWeights(document.body)
	expect(weights.length).toBeLessThanOrEqual(MAX_PROFILE_BARS)
	expect([weights[0], weights.at(-1)]).toEqual([600, 600])
})

// The floor is read off the box the bars draw in, so a caller's width on the
// bars (`className`) is the width the floor divides, never the wrapper's.
test("the floor is read off the box the bars draw in, the caller's class on it", () => {
	const { container } = render(<ProfileBars bars={bars} className="w-1/2" />)
	const bar = container.querySelector<HTMLElement>('[data-profile-bar]')!
	const row = bar.parentElement!
	const box = row.parentElement!
	expect(box).toHaveClass('@container', 'w-1/2')
	expect(row).toHaveClass('w-full', 'gap-(--profile-bar-px)')
	expect(row).not.toHaveClass('@container')
})
