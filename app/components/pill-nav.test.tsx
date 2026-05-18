/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { PillNav } from './pill-nav.tsx'

vi.mock('framer-motion', async () => {
	const actual = await vi.importActual<typeof import('framer-motion')>(
		'framer-motion',
	)
	return {
		...actual,
		LayoutGroup: ({ children }: { children: React.ReactNode }) => (
			<>{children}</>
		),
		motion: {
			...actual.motion,
			span: ({
				children,
				className,
				layoutId: _layoutId,
				...props
			}: React.HTMLAttributes<HTMLSpanElement> & { layoutId?: string }) => (
				<span className={className} {...props}>
					{children}
				</span>
			),
		},
	}
})

function NavWrapper({
	pathname,
	user = { id: 'user-1' },
}: {
	pathname: string
	user?: { id: string } | null
}) {
	const App = createRoutesStub([
		{
			path: '*',
			Component: () => <PillNav user={user} />,
		},
	])
	return <App initialEntries={[pathname]} />
}

test('renders nav with Home, Training, Settings, and New links for authenticated users', async () => {
	render(<NavWrapper pathname="/" />)

	const nav = await screen.findByRole('navigation', {
		name: /main navigation/i,
	})
	expect(nav).toBeInTheDocument()

	const homeLink = within(nav).getByRole('link', { name: /home/i })
	expect(homeLink).toHaveAttribute('href', '/')

	const trainingLink = within(nav).getByRole('link', { name: /training/i })
	expect(trainingLink).toHaveAttribute('href', '/training/upcoming')

	const settingsLink = within(nav).getByRole('link', { name: /settings/i })
	expect(settingsLink).toHaveAttribute('href', '/settings/profile')

	const newLink = within(nav).getByRole('link', { name: /new session/i })
	expect(newLink).toHaveAttribute('href', '/training/sessions/new')
})

test('highlights active link via aria-current when on training route', async () => {
	render(<NavWrapper pathname="/training/upcoming" />)

	const nav = await screen.findByRole('navigation', {
		name: /main navigation/i,
	})

	const trainingLink = within(nav).getByRole('link', { name: /training/i })
	expect(trainingLink).toHaveAttribute('aria-current', 'page')

	const homeLink = within(nav).getByRole('link', { name: /home/i })
	expect(homeLink).not.toHaveAttribute('aria-current')

	const settingsLink = within(nav).getByRole('link', { name: /settings/i })
	expect(settingsLink).not.toHaveAttribute('aria-current')
})

test('highlights Home when on root path', async () => {
	render(<NavWrapper pathname="/" />)

	const nav = await screen.findByRole('navigation', {
		name: /main navigation/i,
	})

	const homeLink = within(nav).getByRole('link', { name: /home/i })
	expect(homeLink).toHaveAttribute('aria-current', 'page')

	const trainingLink = within(nav).getByRole('link', { name: /training/i })
	expect(trainingLink).not.toHaveAttribute('aria-current')
})

test('highlights Settings tab on settings routes', async () => {
	render(<NavWrapper pathname="/settings/profile" />)

	const nav = await screen.findByRole('navigation', {
		name: /main navigation/i,
	})

	const settingsLink = within(nav).getByRole('link', { name: /settings/i })
	expect(settingsLink).toHaveAttribute('aria-current', 'page')

	const homeLink = within(nav).getByRole('link', { name: /home/i })
	expect(homeLink).not.toHaveAttribute('aria-current')
})

test('does not render navigation when user is not authenticated', async () => {
	render(<NavWrapper pathname="/" user={null} />)

	expect(
		screen.queryByRole('navigation', { name: /main navigation/i }),
	).not.toBeInTheDocument()
})
