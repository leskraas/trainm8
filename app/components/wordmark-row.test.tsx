/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { WordmarkRow } from './wordmark-row.tsx'

// The row subscribes to live import events via an EventSource (#75), which
// jsdom doesn't provide. Stub the hook so the render is deterministic.
vi.mock('remix-utils/sse/react', () => ({
	useEventSource: () => null,
}))

// The theme switch reads request info from the root loader, which a routes
// stub doesn't provide; it isn't a navigation entry, so stub it out.
vi.mock('#app/routes/resources/theme-switch.tsx', () => ({
	ThemeSwitch: () => null,
}))

const defaultUser = { id: 'user-1', name: 'Kody', username: 'kody' }

function renderRow({
	user = defaultUser,
	inboxCount = 0,
}: {
	user?: typeof defaultUser | null
	inboxCount?: number
} = {}) {
	const App = createRoutesStub([
		{
			path: '*',
			Component: () => <WordmarkRow user={user} inboxCount={inboxCount} />,
		},
	])
	return render(<App initialEntries={['/']} />)
}

test('wordmark links home and the avatar links to Settings', async () => {
	renderRow()

	const nav = await screen.findByRole('navigation', { name: /primary/i })

	const wordmark = within(nav).getByRole('link', { name: /trainm8/i })
	expect(wordmark).toHaveAttribute('href', '/')

	const settingsLink = within(nav).getByRole('link', { name: /settings/i })
	expect(settingsLink).toHaveAttribute('href', '/settings/profile')
})

test('shows the Inbox chip with the pending count when non-zero', async () => {
	renderRow({ inboxCount: 3 })

	const nav = await screen.findByRole('navigation', { name: /primary/i })
	const inboxLink = within(nav).getByRole('link', { name: /inbox/i })
	expect(inboxLink).toHaveAttribute('href', '/imports')
	expect(inboxLink).toHaveTextContent('3')
})

test('keeps the Inbox chip visible at zero pending imports, without a count badge', async () => {
	renderRow({ inboxCount: 0 })

	const nav = await screen.findByRole('navigation', { name: /primary/i })
	const inboxLink = within(nav).getByRole('link', { name: /inbox/i })
	expect(inboxLink).toHaveAttribute('href', '/imports')
	expect(within(inboxLink).queryByLabelText(/pending/i)).not.toBeInTheDocument()
})

test('renders no floating or sticky chrome — the row is in normal flow', async () => {
	renderRow()

	const nav = await screen.findByRole('navigation', { name: /primary/i })
	const header = nav.closest('header')
	expect(header).not.toBeNull()
	expect(header?.className).not.toMatch(/fixed|sticky/)
	expect(nav.className).not.toMatch(/fixed|sticky/)
})

test('renders nothing when the user is not authenticated', async () => {
	renderRow({ user: null })

	expect(
		screen.queryByRole('navigation', { name: /primary/i }),
	).not.toBeInTheDocument()
})
