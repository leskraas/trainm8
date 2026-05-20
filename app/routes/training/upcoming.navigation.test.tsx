/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import {
	DISCIPLINE_QUERY_PARAM,
	parseDisciplineQueryParam,
} from '#app/utils/upcoming-ledger-filters.ts'
import UpcomingSessionDetailRoute from './upcoming.$sessionId.tsx'
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
			discipline: 'run',
			intent: 'threshold',
			blocks: [
				{
					id: 'block-1',
					name: 'Main set',
					orderIndex: 0,
					repeatCount: 1,
					steps: [
						{
							id: 'step-1',
							kind: 'cardio',
							notes: '4 x 5 min steady',
							discipline: 'run',
							intensity: null,
							orderIndex: 0,
							durationSec: null,
							distanceM: null,
							exerciseId: null,
							restBetweenSetsSec: null,
							intensityHrMin: null,
							intensityHrMax: null,
							intensityPowerMin: null,
							intensityPowerMax: null,
							intensityPaceMin: null,
							intensityPaceMax: null,
							exercise: null,
							sets: [],
						},
					],
				},
			],
		},
		recording: null,
	}
}

function upcomingListLoader(sessions: UpcomingSession[]) {
	return async ({ request }: LoaderFunctionArgs) => {
		const url = new URL(request.url)
		const disciplineFilter = parseDisciplineQueryParam(
			url.searchParams.get(DISCIPLINE_QUERY_PARAM),
		)
		return {
			sessions,
			events: [],
			disciplineFilter,
			currentLoad: null,
			snapshots: [],
		}
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
			loader: upcomingListLoader([session]),
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

	const detailLink = await screen.findByRole('link', {
		name: /threshold intervals/i,
	})
	await user.click(detailLink)

	await screen.findByRole('link', { name: /back to upcoming workouts/i })
	await screen.findByText(/workout structure/i)
	await screen.findByText(/4 x 5 min steady/i)
})

test('activity filter uses activity query; All clears the query string', async () => {
	const user = userEvent.setup()
	const runSession = makeSession()
	runSession.workout!.title = 'Morning Run'
	runSession.workout!.discipline = 'run'
	const bikeSession = makeSession()
	bikeSession.id = 'session-bike'
	bikeSession.workout!.title = 'Z2 Ride'
	bikeSession.workout!.discipline = 'bike'
	const UpcomingRouteComponent = (props: Record<string, unknown>) => (
		<UpcomingRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/training/upcoming',
			Component: UpcomingRouteComponent,
			loader: upcomingListLoader([runSession, bikeSession]),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(<App initialEntries={['/training/upcoming']} />)

	await screen.findByRole('link', { name: /morning run/i })
	await screen.findByRole('link', { name: /z2 ride/i })

	await user.click(screen.getByRole('link', { name: /^ride$/i }))

	expect(
		await screen.findByRole('link', { name: /z2 ride/i }),
	).toBeInTheDocument()
	await waitFor(() => {
		expect(
			screen.queryByRole('link', { name: /morning run/i }),
		).not.toBeInTheDocument()
	})

	await user.click(screen.getByRole('link', { name: /^all$/i }))

	await screen.findByRole('link', { name: /morning run/i })
	await screen.findByRole('link', { name: /z2 ride/i })
})
