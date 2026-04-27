/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import UpcomingRoute from './upcoming.tsx'

function makeSession(): UpcomingSession {
	return {
		id: 'session-1',
		scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
		status: 'scheduled',
		workout: {
			id: 'workout-1',
			title: 'Threshold Intervals',
			description: 'Focus on controlled effort.',
			activityType: 'run',
			blocks: [],
		},
	}
}

test('upcoming ledger rows link to session detail without a separate view-details control', async () => {
	const session = makeSession()
	const UpcomingRouteComponent = (props: Record<string, unknown>) => (
		<UpcomingRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/training/upcoming',
			Component: UpcomingRouteComponent,
			loader: async () => ({
				sessions: [session],
				timeZone: 'UTC',
				locale: 'en-US',
			}),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(<App initialEntries={['/training/upcoming']} />)

	const rowLink = await screen.findByRole('link', { name: /threshold intervals/i })
	expect(rowLink).toHaveAttribute('href', '/training/upcoming/session-1')
	expect(
		screen.queryByRole('link', { name: /view details/i }),
	).not.toBeInTheDocument()
})
