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

test('the "+ New" control opens the single creation menu: New session, Generate plan, New event', async () => {
	const user = userEvent.setup()
	renderMenu()

	const createButton = await screen.findByRole('button', { name: /create/i })
	await user.click(createButton)

	const menu = await screen.findByRole('menu')

	const newSession = within(menu).getByRole('menuitem', {
		name: /new session/i,
	})
	expect(newSession).toHaveAttribute('href', '/training/sessions/new')

	const generatePlan = within(menu).getByRole('menuitem', {
		name: /generate plan/i,
	})
	expect(generatePlan).toHaveAttribute('href', '/training/plan/new')

	const newEvent = within(menu).getByRole('menuitem', { name: /new event/i })
	expect(newEvent).toHaveAttribute('href', '/training/events/new')

	expect(within(menu).getAllByRole('menuitem')).toHaveLength(3)
})
