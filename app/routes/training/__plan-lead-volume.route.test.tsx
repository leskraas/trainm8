/**
 * @vitest-environment jsdom
 *
 * _Ukevolum_ in Plan's lead (#673): a strength track gets one line pointing to
 * Avansert, whether or not an endurance track sits beside it.
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { PlanLeadVolume } from './__plan-lead-card.tsx'

function renderVolume(props: Parameters<typeof PlanLeadVolume>[0]) {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<>
					<p>Plan</p>
					<PlanLeadVolume {...props} />
				</>
			),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan']} />)
}

test('a plan of strength alone still points to Avansert for its volume', async () => {
	renderVolume({ tracks: [], hasStrength: true })
	expect(
		await screen.findByText('Styrke planlegges i blokker under Avansert.'),
	).toBeInTheDocument()
	expect(screen.queryByRole('list')).toBeNull()
})

test('a plan with neither shows no volume at all', async () => {
	renderVolume({ tracks: [], hasStrength: false })
	await screen.findByText('Plan')
	expect(document.querySelector('[data-plan-lead-volume]')).toBeNull()
})
