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

test('renders only Home and Settings pills (no Training pill) for authenticated users', async () => {
	render(<NavWrapper pathname="/" />)

	const nav = await screen.findByRole('navigation', {
		name: /main navigation/i,
	})
	expect(nav).toBeInTheDocument()

	const homeLink = within(nav).getByRole('link', { name: /home/i })
	expect(homeLink).toHaveAttribute('href', '/')

	const settingsLink = within(nav).getByRole('link', { name: /settings/i })
	expect(settingsLink).toHaveAttribute('href', '/settings/profile')

	// The orphaned Training pill (pointed at the deleted /training/upcoming) is gone.
	expect(
		within(nav).queryByRole('link', { name: /^training$/i }),
	).not.toBeInTheDocument()

	expect(within(nav).getByRole('button', { name: /more/i })).toBeInTheDocument()
	expect(
		within(nav).getByRole('button', { name: /create/i }),
	).toBeInTheDocument()
})

test('More overflow exposes Events and Imports and no longer contains Load', async () => {
	const user = userEvent.setup()
	render(<NavWrapper pathname="/" />)

	const moreButton = await screen.findByRole('button', { name: /more/i })
	await user.click(moreButton)

	const menu = await screen.findByRole('menu')

	const eventsLink = within(menu).getByRole('menuitem', { name: /events/i })
	expect(eventsLink).toHaveAttribute('href', '/training/events')

	const importsLink = within(menu).getByRole('menuitem', { name: /imports/i })
	expect(importsLink).toHaveAttribute('href', '/imports')

	expect(
		within(menu).queryByRole('menuitem', { name: /load/i }),
	).not.toBeInTheDocument()
})

test('the "+" control opens an authoring menu with New session, Generate plan, and New event', async () => {
	const user = userEvent.setup()
	render(<NavWrapper pathname="/" />)

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
})

test.each([
	['/training/events', /events/i],
	['/imports', /imports/i],
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

test('highlights Home when on root path', async () => {
	render(<NavWrapper pathname="/" />)

	const nav = await screen.findByRole('navigation', {
		name: /main navigation/i,
	})

	const homeLink = within(nav).getByRole('link', { name: /home/i })
	expect(homeLink).toHaveAttribute('aria-current', 'page')

	const settingsLink = within(nav).getByRole('link', { name: /settings/i })
	expect(settingsLink).not.toHaveAttribute('aria-current')
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
