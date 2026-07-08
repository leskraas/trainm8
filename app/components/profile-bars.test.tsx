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
