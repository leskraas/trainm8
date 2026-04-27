/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import {
	ACTIVITY_QUERY_PARAM,
	parseActivityQueryParam,
} from '#app/utils/upcoming-ledger-filters.ts'
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

function upcomingLoader(sessions: UpcomingSession[]) {
	return async ({ request }: LoaderFunctionArgs) => {
		const url = new URL(request.url)
		const activityFilter = parseActivityQueryParam(
			url.searchParams.get(ACTIVITY_QUERY_PARAM),
		)
		return {
			sessions,
			timeZone: 'UTC',
			locale: 'en-US',
			activityFilter,
		}
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
			loader: upcomingLoader([session]),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(<App initialEntries={['/training/upcoming']} />)

	const rowLink = await screen.findByRole('link', {
		name: /threshold intervals/i,
	})
	expect(rowLink).toHaveAttribute('href', '/training/upcoming/session-1')
	expect(
		screen.queryByRole('link', { name: /view details/i }),
	).not.toBeInTheDocument()
})

test('upcoming ledger shows only sessions matching the activity query', async () => {
	const runSession = makeSession()
	runSession.workout.title = 'Morning Run'
	runSession.workout.activityType = 'run'
	const bikeSession = makeSession()
	bikeSession.id = 'session-bike'
	bikeSession.workout.title = 'Z2 Ride'
	bikeSession.workout.activityType = 'bike'
	const UpcomingRouteComponent = (props: Record<string, unknown>) => (
		<UpcomingRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/training/upcoming',
			Component: UpcomingRouteComponent,
			loader: upcomingLoader([runSession, bikeSession]),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(
		<App initialEntries={[`/training/upcoming?${ACTIVITY_QUERY_PARAM}=run`]} />,
	)

	await screen.findByRole('link', { name: /morning run/i })
	expect(
		screen.queryByRole('link', { name: /z2 ride/i }),
	).not.toBeInTheDocument()
})
