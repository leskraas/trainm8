/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { CreateMenu } from './create-menu.tsx'

function renderMenu() {
	const App = createRoutesStub([
		{
			path: '*',
			Component: () => <CreateMenu />,
		},
	])
	return render(<App initialEntries={['/']} />)
}

test('the "+ Ny" control opens the single creation menu: Ny økt, Nytt løp, Ny plan', async () => {
	const user = userEvent.setup()
	renderMenu()

	const createButton = await screen.findByRole('button', { name: /lag ny/i })
	await user.click(createButton)

	const menu = await screen.findByRole('menu')

	const newSession = within(menu).getByRole('menuitem', {
		name: /ny økt/i,
	})
	expect(newSession).toHaveAttribute('href', '/training/sessions/new')

	const newEvent = within(menu).getByRole('menuitem', { name: /nytt løp/i })
	expect(newEvent).toHaveAttribute('href', '/training/events/new')

	// Plan Generation is gone (ADR 0044); a plan is now something the athlete
	// authors, so the menu creates sessions, events and plans.
	const newPlan = within(menu).getByRole('menuitem', { name: /ny plan/i })
	expect(newPlan).toHaveAttribute('href', '/training/plan/new')

	expect(within(menu).getAllByRole('menuitem')).toHaveLength(3)
})
