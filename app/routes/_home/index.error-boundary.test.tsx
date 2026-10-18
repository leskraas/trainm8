/**
 * @vitest-environment jsdom
 *
 * What the athlete gets when home's loader throws.
 *
 * Home is the default post-login destination and its loader is the widest one in
 * the app, so it is also the one with the most ways to fail. Two things have to
 * hold and neither did before: the failure is caught *at the route*, so the
 * athlete keeps the chrome and is still inside the app, and "we could not find
 * it" does not read as the same sentence as "something broke".
 */
import { cleanup, render, screen } from '@testing-library/react'
import { createRoutesStub, Outlet } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { HOME_TIMELINE_FULL_VIEW_LABELS } from '#app/utils/labels.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import IndexRoute, { ErrorBoundary } from './index.tsx'

// The boundary logs what it caught and React logs the throw that reached it; the
// shared setup turns any console.error into a failed test.
beforeEach(() => {
	consoleError.mockImplementation(() => {})
})

const CHROME = 'wordmark row'
const ROOT_BOUNDARY = 'the whole app fell over'

/**
 * Home as it is actually mounted: a child of a parent route that draws the
 * persistent chrome and carries the last-resort boundary, which is what
 * `app/root.tsx` is. Nesting it is the only way to tell a route-level catch from
 * a root-level one — a boundary rendered on its own always looks like it worked.
 */
function renderHomeWithThrowingLoader(thrown: unknown) {
	const App = createRoutesStub([
		{
			path: '/',
			Component: () => (
				<div>
					<p>{CHROME}</p>
					<Outlet />
				</div>
			),
			ErrorBoundary: () => <p>{ROOT_BOUNDARY}</p>,
			HydrateFallback: () => <div>Loading...</div>,
			children: [
				{
					index: true,
					Component: IndexRoute,
					loader: () => {
						throw thrown
					},
					ErrorBoundary,
				},
			],
		},
	])
	render(<App initialEntries={['/']} />)
}

test('a thrown loader error is caught at the route, with the chrome left standing', async () => {
	renderHomeWithThrowingLoader(new Error('the session ledger query failed'))

	expect(
		await screen.findByText('the session ledger query failed'),
	).toBeInTheDocument()
	expect(screen.getByText(CHROME)).toBeInTheDocument()
	expect(screen.queryByText(ROOT_BOUNDARY)).not.toBeInTheDocument()
})

test('a 404 and an unexpected error do not read as the same failure', async () => {
	renderHomeWithThrowingLoader(
		new Response('No training found', { status: 404 }),
	)

	expect(
		await screen.findByText(HOME_TIMELINE_FULL_VIEW_LABELS.notFound),
	).toBeInTheDocument()
	// Neither the bare status nor the server's own string reaches the athlete —
	// what they get is a sentence about their training.
	expect(screen.queryByText(/404/)).not.toBeInTheDocument()
	expect(screen.queryByText(/No training found/)).not.toBeInTheDocument()

	cleanup()

	renderHomeWithThrowingLoader(new Error('the session ledger query failed'))

	expect(
		await screen.findByText('the session ledger query failed'),
	).toBeInTheDocument()
	expect(
		screen.queryByText(HOME_TIMELINE_FULL_VIEW_LABELS.notFound),
	).not.toBeInTheDocument()
})
