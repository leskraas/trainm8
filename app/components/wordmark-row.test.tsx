/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { WordmarkRow } from './wordmark-row.tsx'

// The theme switch reads request info from the root loader, which a routes
// stub doesn't provide; it isn't a navigation entry, so stub it out.
vi.mock('#app/routes/resources/theme-switch.tsx', () => ({
	ThemeSwitch: () => null,
}))

const defaultUser = { id: 'user-1', name: 'Kody', username: 'kody' }

function renderRow({
	user = defaultUser,
	at = '/',
}: {
	user?: typeof defaultUser | null
	at?: string
} = {}) {
	const App = createRoutesStub([
		{
			path: '*',
			Component: () => <WordmarkRow user={user} />,
		},
	])
	return render(<App initialEntries={[at]} />)
}

test('the wordmark links home', async () => {
	renderRow()

	const banner = await screen.findByRole('banner')
	expect(
		within(banner).getByRole('link', { name: /trainm8/i }),
	).toHaveAttribute('href', '/')
})

test('the four tabs land where they say (ADR 0083)', async () => {
	renderRow()

	const tabs = await screen.findByRole('navigation', { name: 'Hovedmeny' })
	const links = within(tabs).getAllByRole('link')
	expect(
		links.map((link) => [link.textContent, link.getAttribute('href')]),
	).toEqual([
		['I dag', '/'],
		['Sesong', '/training/plan'],
		['Bibliotek', '/library'],
		['Meg', '/me'],
	])
})

test('a tab’s landing page is the page; a page deeper in the tab is inside it', async () => {
	renderRow({ at: '/me' })
	const tabs = await screen.findByRole('navigation', { name: 'Hovedmeny' })
	expect(within(tabs).getByRole('link', { name: 'Meg' })).toHaveAttribute(
		'aria-current',
		'page',
	)
})

test('a page that moved into a tab marks that tab, as inside it', async () => {
	renderRow({ at: '/settings/profile/passkeys' })

	const tabs = await screen.findByRole('navigation', { name: 'Hovedmeny' })
	expect(within(tabs).getByRole('link', { name: 'Meg' })).toHaveAttribute(
		'aria-current',
		'true',
	)
	expect(within(tabs).getByRole('link', { name: 'I dag' })).not.toHaveAttribute(
		'aria-current',
	)
})

test('with no plan, Sesong’s plan creation is Sesong’s landing page', async () => {
	renderRow({ at: '/training/plan/new' })
	const tabs = await screen.findByRole('navigation', { name: 'Hovedmeny' })
	expect(within(tabs).getByRole('link', { name: 'Sesong' })).toHaveAttribute(
		'aria-current',
		'page',
	)
})

test('the first run carries no tab bar', async () => {
	renderRow({ at: '/start/funn' })
	await screen.findByRole('banner')
	expect(
		screen.queryByRole('navigation', { name: 'Hovedmeny' }),
	).not.toBeInTheDocument()
})

test('a page under no tab marks none', async () => {
	renderRow({ at: '/training/sessions/abc' })

	const tabs = await screen.findByRole('navigation', { name: 'Hovedmeny' })
	for (const link of within(tabs).getAllByRole('link')) {
		expect(link).not.toHaveAttribute('aria-current')
	}
})

test('carries no Inbox chip — imports auto-save, so there is no queue', async () => {
	renderRow()

	const banner = await screen.findByRole('banner')
	expect(
		within(banner).queryByRole('link', { name: /inbox/i }),
	).not.toBeInTheDocument()
})

test('renders nothing when the user is not authenticated', async () => {
	renderRow({ user: null })

	expect(
		screen.queryByRole('navigation', { name: 'Hovedmeny' }),
	).not.toBeInTheDocument()
})
