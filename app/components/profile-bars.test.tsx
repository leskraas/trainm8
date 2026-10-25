/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { type ProfileBar } from '#app/utils/session-profile.ts'
import { ProfileBars } from './profile-bars.tsx'

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
	// 3 × 20 × 50 m with warm-up and cool-down: 122 bars. At a 1px floor and a
	// 1px gap that is 243px, past the 140px a timeline row gives the profile,
	// so the floor shrinks to fit 2n - 1 slots in the container's width.
	const many: ProfileBar[] = Array.from({ length: 122 }, (_, i) => ({
		id: `bar-${i}`,
		zone: 1,
		durationSec: 15,
	}))
	const { container } = render(<ProfileBars bars={many} />)
	const fit = container.querySelector<HTMLElement>('[data-profile-fit]')
	expect(fit).not.toBeNull()
	expect(fit!.style.getPropertyValue('--profile-bar-px')).toBe(
		'min(1px, 100cqw / 243)',
	)
	expect(container.querySelectorAll('[data-profile-bar]')).toHaveLength(122)
})
