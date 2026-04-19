/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { test } from 'vitest'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import UpcomingRoute from './upcoming.tsx'
import UpcomingSessionDetailRoute from './upcoming.$sessionId.tsx'

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
			blocks: [
				{
					id: 'block-1',
					name: 'Main set',
					orderIndex: 0,
					steps: [
						{
							id: 'step-1',
							description: '4 x 5 min steady',
							activity: 'run',
							intensity: 'moderate',
							orderIndex: 0,
						},
					],
				},
			],
		},
	}
}

test('upcoming list links to detail route and detail renders workout structure', async () => {
	const user = userEvent.setup()
	const session = makeSession()
	const UpcomingRouteComponent = (props: Record<string, unknown>) => (
		<UpcomingRoute {...(props as any)} />
	)
	const UpcomingSessionDetailRouteComponent = (
		props: Record<string, unknown>,
	) => <UpcomingSessionDetailRoute {...(props as any)} />
	const App = createRoutesStub([
		{
			path: '/training/upcoming',
			Component: UpcomingRouteComponent,
			loader: async () => ({ sessions: [session] }),
			HydrateFallback: () => <div>Loading...</div>,
		},
		{
			path: '/training/upcoming/:sessionId',
			Component: UpcomingSessionDetailRouteComponent,
			loader: async () => ({ session }),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(<App initialEntries={['/training/upcoming']} />)

	const detailLink = await screen.findByRole('link', { name: /view details/i })
	await user.click(detailLink)

	await screen.findByRole('link', { name: /back to upcoming workouts/i })
	await screen.findByText(/workout structure/i)
	await screen.findByText(/4 x 5 min steady/i)
})
