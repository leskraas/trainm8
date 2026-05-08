/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { AppNavigation } from './app-navigation.tsx'

function NavWrapper({ pathname }: { pathname: string }) {
	const App = createRoutesStub([
		{
			path: '*',
			Component: () => <AppNavigation user={{ id: 'user-1' }} />,
		},
	])
	return <App initialEntries={[pathname]} />
}

function NoUserNavWrapper({ pathname }: { pathname: string }) {
	const App = createRoutesStub([
		{
			path: '*',
			Component: () => <AppNavigation user={undefined} />,
		},
	])
	return <App initialEntries={[pathname]} />
}

test('renders bottom tab bar with Home, Training, and Settings tabs for authenticated users', async () => {
	render(<NavWrapper pathname="/training/upcoming" />)

	const bottomNav = await screen.findByRole('navigation', {
		name: /bottom tab bar/i,
	})
	expect(bottomNav).toBeInTheDocument()

	const homeLink = within(bottomNav).getByRole('link', { name: /home/i })
	expect(homeLink).toHaveAttribute('href', '/')

	const trainingLink = within(bottomNav).getByRole('link', {
		name: /training/i,
	})
	expect(trainingLink).toHaveAttribute('href', '/training/upcoming')

	const settingsLink = within(bottomNav).getByRole('link', {
		name: /settings/i,
	})
	expect(settingsLink).toHaveAttribute('href', '/settings/profile')
})

test('renders top nav bar with same three destinations for authenticated users', async () => {
	render(<NavWrapper pathname="/training/upcoming" />)

	const topNav = await screen.findByRole('navigation', {
		name: /top navigation/i,
	})
	expect(topNav).toBeInTheDocument()

	const homeLink = within(topNav).getByRole('link', { name: /home/i })
	expect(homeLink).toHaveAttribute('href', '/')

	const trainingLink = within(topNav).getByRole('link', {
		name: /training/i,
	})
	expect(trainingLink).toHaveAttribute('href', '/training/upcoming')

	const settingsLink = within(topNav).getByRole('link', {
		name: /settings/i,
	})
	expect(settingsLink).toHaveAttribute('href', '/settings/profile')
})

test('highlights active tab based on current route', async () => {
	render(<NavWrapper pathname="/training/upcoming" />)

	const bottomNav = await screen.findByRole('navigation', {
		name: /bottom tab bar/i,
	})

	const trainingLink = within(bottomNav).getByRole('link', {
		name: /training/i,
	})
	expect(trainingLink).toHaveAttribute('aria-current', 'page')

	const homeLink = within(bottomNav).getByRole('link', { name: /home/i })
	expect(homeLink).not.toHaveAttribute('aria-current')
})

test('highlights Home tab when on root path', async () => {
	render(<NavWrapper pathname="/" />)

	const bottomNav = await screen.findByRole('navigation', {
		name: /bottom tab bar/i,
	})

	const homeLink = within(bottomNav).getByRole('link', { name: /home/i })
	expect(homeLink).toHaveAttribute('aria-current', 'page')
})

test('highlights Settings tab on settings routes', async () => {
	render(<NavWrapper pathname="/settings/profile" />)

	const bottomNav = await screen.findByRole('navigation', {
		name: /bottom tab bar/i,
	})

	const settingsLink = within(bottomNav).getByRole('link', {
		name: /settings/i,
	})
	expect(settingsLink).toHaveAttribute('aria-current', 'page')
})

test('does not render navigation when user is not authenticated', async () => {
	render(<NoUserNavWrapper pathname="/" />)

	expect(
		screen.queryByRole('navigation', { name: /bottom tab bar/i }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByRole('navigation', { name: /top navigation/i }),
	).not.toBeInTheDocument()
})
