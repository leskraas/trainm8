/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub, redirect } from 'react-router'
import { expect, test, vi } from 'vitest'
import ImportsIndexRoute from './imports._index.tsx'

// The route subscribes to live import events via an EventSource (#75), which
// jsdom doesn't provide. Stub the hook so the render is deterministic.
vi.mock('remix-utils/sse/react', () => ({
	useEventSource: () => null,
}))

type StravaState = {
	configured: boolean
	connected: boolean
	backfillInProgress: boolean
}

function renderImports(strava: StravaState) {
	const synced = vi.fn()
	const App = createRoutesStub([
		{
			path: '/imports',
			Component: (props: Record<string, unknown>) => (
				<ImportsIndexRoute {...(props as any)} />
			),
			loader: () => ({ imports: [], strava }),
			HydrateFallback: () => <div>Loading...</div>,
		},
		{
			path: '/integrations/strava/sync',
			action: ({ request }) => {
				synced({ method: request.method })
				// The real action redirects back to the inbox with a toast; mirror the
				// redirect so the stub navigates somewhere it can render.
				return redirect('/imports')
			},
		},
		{
			path: '/settings/integrations',
			Component: () => <div>Integration Hub</div>,
		},
	])
	render(<App initialEntries={['/imports']} />)
	return { synced }
}

const connected: StravaState = {
	configured: true,
	connected: true,
	backfillInProgress: false,
}

test('keeps a working quiet "Sync now" safety valve that POSTs to the sync action', async () => {
	const user = userEvent.setup()
	const { synced } = renderImports(connected)

	const syncButton = await screen.findByRole('button', { name: /sync now/i })
	// Quiet affordance, not a primary button (#136).
	expect(syncButton.className).not.toMatch(/bg-primary/)
	await user.click(syncButton)

	await waitFor(() => expect(synced).toHaveBeenCalledTimes(1))
	expect(synced.mock.calls[0]![0].method).toBe('POST')
})

test('no longer hosts the Strava card: a slim source line links to the Integration Hub', async () => {
	renderImports(connected)

	// Connection management moved to the hub (ADR 0026): no connect/reconnect/
	// disconnect controls left on the inbox.
	const hubLink = await screen.findByRole('link', { name: /manage sources/i })
	expect(hubLink).toHaveAttribute('href', '/settings/integrations')
	expect(
		screen.queryByRole('button', { name: /reconnect/i }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /disconnect/i }),
	).not.toBeInTheDocument()
})

test('hides manual sync and mentions the history import while a backfill runs', async () => {
	renderImports({ ...connected, backfillInProgress: true })

	expect(await screen.findByText(/importing.*history/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /sync now/i }),
	).not.toBeInTheDocument()
})

test('points to the hub, not a Connect button, when Strava is not connected', async () => {
	renderImports({
		configured: true,
		connected: false,
		backfillInProgress: false,
	})

	const hubLink = await screen.findByRole('link', { name: /manage sources/i })
	expect(hubLink).toHaveAttribute('href', '/settings/integrations')
	expect(
		screen.queryByRole('button', { name: /connect strava/i }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /sync now/i }),
	).not.toBeInTheDocument()
})

test('still shows the source line (hub link) when Strava OAuth is not configured', async () => {
	renderImports({
		configured: false,
		connected: false,
		backfillInProgress: false,
	})

	// File upload is always a source, so the hub is always worth linking to.
	expect(
		await screen.findByRole('link', { name: /manage sources/i }),
	).toBeInTheDocument()
	expect(screen.queryByText(/strava/i)).not.toBeInTheDocument()
})
