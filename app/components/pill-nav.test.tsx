/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { PillNav } from './pill-nav.tsx'

vi.mock('framer-motion', async () => {
	const actual =
		await vi.importActual<typeof import('framer-motion')>('framer-motion')
	// Strip motion-only props (layoutId, layout, whileHover, etc.) and render
	// plain DOM elements so the tree is queryable in jsdom.
	function stripMotionProps<P extends Record<string, unknown>>(props: P) {
		const {
			layoutId: _layoutId,
			layout: _layout,
			whileHover: _whileHover,
			whileTap: _whileTap,
			whileFocus: _whileFocus,
			whileDrag: _whileDrag,
			whileInView: _whileInView,
			transition: _transition,
			initial: _initial,
			animate: _animate,
			exit: _exit,
			variants: _variants,
			...rest
		} = props as Record<string, unknown>
		return rest
	}
	function passthrough(tag: keyof React.JSX.IntrinsicElements) {
		return (props: React.HTMLAttributes<HTMLElement>) => {
			const Tag = tag as keyof React.JSX.IntrinsicElements
			// @ts-expect-error generic intrinsic element
			return <Tag {...stripMotionProps(props)} />
		}
	}
	return {
		...actual,
		LayoutGroup: ({ children }: { children: React.ReactNode }) => (
			<>{children}</>
		),
		motion: {
			...actual.motion,
			span: passthrough('span'),
			div: passthrough('div'),
			nav: passthrough('nav'),
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

	const moreButton = within(nav).getByRole('button', { name: /more/i })
	expect(moreButton).toBeInTheDocument()
})

test('More overflow exposes Imports, Events, and Load destinations', async () => {
	const user = userEvent.setup()
	render(<NavWrapper pathname="/" />)

	const moreButton = await screen.findByRole('button', { name: /more/i })
	await user.click(moreButton)

	const menu = await screen.findByRole('menu')
	const importsLink = within(menu).getByRole('menuitem', { name: /imports/i })
	expect(importsLink).toHaveAttribute('href', '/imports')

	const eventsLink = within(menu).getByRole('menuitem', { name: /events/i })
	expect(eventsLink).toHaveAttribute('href', '/training/events')

	const loadLink = within(menu).getByRole('menuitem', { name: /load/i })
	expect(loadLink).toHaveAttribute('href', '/training/load')
})

test.each([
	['/imports', /imports/i],
	['/training/events', /events/i],
	['/training/load', /load/i],
])(
	'marks the active overflow destination with aria-current on %s',
	async (pathname, name) => {
		const user = userEvent.setup()
		render(<NavWrapper pathname={pathname} />)

		const moreButton = await screen.findByRole('button', { name: /more/i })
		await user.click(moreButton)

		const menu = await screen.findByRole('menu')
		const activeItem = within(menu).getByRole('menuitem', { name })
		expect(activeItem).toHaveAttribute('aria-current', 'page')

		const others = within(menu)
			.getAllByRole('menuitem')
			.filter((item) => item !== activeItem)
		for (const item of others) {
			expect(item).not.toHaveAttribute('aria-current')
		}
	},
)

test('does not highlight Training when on an overflow training route', async () => {
	render(<NavWrapper pathname="/training/events" />)

	const nav = await screen.findByRole('navigation', {
		name: /main navigation/i,
	})

	const trainingLink = within(nav).getByRole('link', { name: /training/i })
	expect(trainingLink).not.toHaveAttribute('aria-current')
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
