/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub, redirect } from 'react-router'
import { expect, test, vi } from 'vitest'
import IntegrationsRoute from './integrations.tsx'

type StravaHub = {
	configured: boolean
	status: 'disconnected' | 'connected' | 'backfilling' | 'revoked'
	lastSyncedAt: string | null
}

function renderHub(strava: StravaHub) {
	const synced = vi.fn()
	const reconnected = vi.fn()
	const disconnected = vi.fn()
	const App = createRoutesStub([
		{
			path: '/settings/integrations',
			Component: (props: Record<string, unknown>) => (
				<IntegrationsRoute {...(props as any)} />
			),
			loader: () => ({ strava }),
			action: async ({ request }) => {
				const formData = await request.formData()
				disconnected({ intent: formData.get('intent') })
				return redirect('/settings/integrations')
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
		{
			path: '/integrations/strava/sync',
			action: ({ request }) => {
				synced({ method: request.method, url: request.url })
				return redirect('/settings/integrations')
			},
		},
		{
			path: '/integrations/strava/connect',
			action: ({ request }) => {
				reconnected({ method: request.method })
				return redirect('/settings/integrations')
			},
		},
		{ path: '/imports/upload', Component: () => <div>Upload page</div> },
	])
	render(<App initialEntries={['/settings/integrations']} />)
	return { synced, reconnected, disconnected }
}

const connected: StravaHub = {
	configured: true,
	status: 'connected',
	lastSyncedAt: '2026-07-07T06:12:00.000Z',
}

test('connected Strava card shows plain-language state, last sync, and all three actions', async () => {
	renderHub(connected)

	const cards = await screen.findByText('Strava')
	const card = cards.closest('[data-provider="strava"]')!
	expect(within(card as HTMLElement).getByText(/connected/i)).toBeVisible()
	expect(within(card as HTMLElement).getByText(/last synced/i)).toBeVisible()
	expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument()
	expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: /^disconnect$/i }),
	).toBeInTheDocument()
})

test('"Sync now" POSTs to the existing Strava sync route', async () => {
	const user = userEvent.setup()
	const { synced } = renderHub(connected)

	await user.click(await screen.findByRole('button', { name: /sync now/i }))

	await waitFor(() => expect(synced).toHaveBeenCalledTimes(1))
	expect(synced.mock.calls[0]![0].method).toBe('POST')
	// The hub asks the sync action to land the athlete back on the hub.
	expect(synced.mock.calls[0]![0].url).toMatch(
		/redirectTo=(%2F|\/)settings(%2F|\/)integrations/,
	)
})

test('backfilling state shows "importing history" and hides manual sync', async () => {
	renderHub({ ...connected, status: 'backfilling' })

	expect(await screen.findByText('Importing history')).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /sync now/i }),
	).not.toBeInTheDocument()
})

test('revoked state says "needs re-authorization" with a working Reconnect', async () => {
	const user = userEvent.setup()
	const { reconnected } = renderHub({ ...connected, status: 'revoked' })

	expect(await screen.findByText(/needs re-authorization/i)).toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: /reconnect/i }))
	await waitFor(() => expect(reconnected).toHaveBeenCalledTimes(1))
	expect(reconnected.mock.calls[0]![0].method).toBe('POST')
})

test('disconnect asks for confirmation, then posts the disconnect intent', async () => {
	const user = userEvent.setup()
	const { disconnected } = renderHub(connected)

	await user.click(await screen.findByRole('button', { name: /^disconnect$/i }))
	await user.click(
		await screen.findByRole('button', { name: /disconnect strava/i }),
	)

	await waitFor(() => expect(disconnected).toHaveBeenCalledTimes(1))
	expect(disconnected.mock.calls[0]![0].intent).toBe('disconnect-strava')
})

test('disconnected Strava is listed as available with a Connect action', async () => {
	const user = userEvent.setup()
	const { reconnected } = renderHub({
		configured: true,
		status: 'disconnected',
		lastSyncedAt: null,
	})

	const connectButton = await screen.findByRole('button', {
		name: /connect strava/i,
	})
	expect(
		screen.queryByRole('button', { name: /sync now/i }),
	).not.toBeInTheDocument()
	await user.click(connectButton)
	await waitFor(() => expect(reconnected).toHaveBeenCalledTimes(1))
})

test('Strava card is omitted entirely when OAuth is not configured', async () => {
	renderHub({ configured: false, status: 'disconnected', lastSyncedAt: null })

	await screen.findByText('File upload')
	expect(screen.queryByText('Strava')).not.toBeInTheDocument()
})

test('file upload is always available and links to the existing upload flow', async () => {
	renderHub(connected)

	const link = await screen.findByRole('link', { name: /upload activity/i })
	expect(link).toHaveAttribute('href', '/imports/upload')
})

test('Intervals.icu shows an honestly disabled connect action', async () => {
	renderHub(connected)

	const card = (await screen.findByText('Intervals.icu')).closest(
		'[data-provider="intervalsicu"]',
	)!
	// The connect flow hasn't landed yet — the affordance is disabled and the
	// copy says so; nothing pretends to work.
	const button = within(card as HTMLElement).getByRole('button', {
		name: /connect/i,
	})
	expect(button).toBeDisabled()
	expect(
		within(card as HTMLElement).getByText(/connect flow coming soon/i),
	).toBeInTheDocument()
})

test('Garmin and Suunto are coming soon, naming the partner-program gate; no Polar', async () => {
	renderHub(connected)

	expect(await screen.findByText('Garmin Connect')).toBeInTheDocument()
	expect(screen.getByText('Suunto')).toBeInTheDocument()
	expect(screen.getAllByText(/partner/i).length).toBeGreaterThanOrEqual(2)
	expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThanOrEqual(2)
	expect(screen.queryByText(/polar/i)).not.toBeInTheDocument()
})
