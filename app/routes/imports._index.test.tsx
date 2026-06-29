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
	])
	render(<App initialEntries={['/imports']} />)
	return { synced }
}

const connected: StravaState = {
	configured: true,
	connected: true,
	backfillInProgress: false,
}

test('exposes a working "Sync now" affordance that POSTs to the sync action', async () => {
	const user = userEvent.setup()
	const { synced } = renderImports(connected)

	const syncButton = await screen.findByRole('button', { name: /sync now/i })
	await user.click(syncButton)

	await waitFor(() => expect(synced).toHaveBeenCalledTimes(1))
	expect(synced.mock.calls[0]![0].method).toBe('POST')
})

test('demotes "Sync now": it is a quiet affordance, not a primary button', async () => {
	renderImports(connected)

	// The copy tells the athlete syncing is automatic — the whole point of the
	// demotion — and the control itself is a secondary (ghost), not primary, button.
	expect(
		await screen.findByText(/new activities import automatically/i),
	).toBeInTheDocument()
	const syncButton = screen.getByRole('button', { name: /sync now/i })
	expect(syncButton.className).not.toMatch(/bg-primary/)
})

test('hides manual sync while a backfill is in progress', async () => {
	renderImports({ ...connected, backfillInProgress: true })

	expect(await screen.findByTestId('backfill-banner')).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /sync now/i }),
	).not.toBeInTheDocument()
})

test('shows Connect, not Sync now, when Strava is not connected', async () => {
	renderImports({
		configured: true,
		connected: false,
		backfillInProgress: false,
	})

	expect(
		await screen.findByRole('button', { name: /connect strava/i }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /sync now/i }),
	).not.toBeInTheDocument()
})
