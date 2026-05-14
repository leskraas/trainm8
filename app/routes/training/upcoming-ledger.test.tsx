/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
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
		return { sessions, activityFilter }
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

test('upcoming ledger renders the local training header with add workout link', async () => {
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

	await screen.findByRole('heading', { name: /upcoming ledger/i })
	const addWorkoutLink = screen.getByRole('link', {
		name: /add workout/i,
	})
	expect(addWorkoutLink).toHaveAttribute('href', '/training/sessions/new')
})

test('upcoming ledger header shows only the Upcoming tab without future placeholders', async () => {
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

	await screen.findByRole('heading', { name: /upcoming ledger/i })
	expect(screen.getByText('Upcoming')).toBeInTheDocument()
	expect(screen.queryByText(/library/i)).not.toBeInTheDocument()
	expect(screen.queryByText(/calendar/i)).not.toBeInTheDocument()
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

test('upcoming ledger renders summary and allocation for visible sessions', async () => {
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

	await screen.findByRole('heading', { name: /14-day horizon/i })
	expect(screen.getByText('1 Session')).toBeInTheDocument()
	const allocation = screen.getByLabelText(/activity allocation/i)
	expect(within(allocation).getByText('Run')).toBeInTheDocument()
	expect(within(allocation).getByText('1 (100%)')).toBeInTheDocument()
	expect(screen.getByText('Duration')).toBeInTheDocument()
	expect(screen.getAllByText('Unavailable')).toHaveLength(3)
	expect(within(allocation).queryByText('Ride')).not.toBeInTheDocument()
})

test('upcoming ledger row renders workout shape from workout steps', async () => {
	const session = makeSession()
	session.workout.blocks = [
		{
			id: 'block-1',
			name: 'Main',
			orderIndex: 0,
			repeatCount: 1,
			steps: [
				{
					id: 'step-easy',
					description: 'Warm up',
					activity: 'run',
					intensity: 'easy',
					orderIndex: 0,
					durationSec: null,
					distanceM: null,
				},
				{
					id: 'step-hard',
					description: 'Tempo rep',
					activity: 'run',
					intensity: 'threshold',
					orderIndex: 1,
					durationSec: null,
					distanceM: null,
				},
			],
		},
	]
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

	const workoutShape = await screen.findByLabelText(
		/workout shape for threshold intervals/i,
	)
	expect(within(workoutShape).getByTitle(/warm up, easy/i)).toBeInTheDocument()
	expect(
		within(workoutShape).getByTitle(/tempo rep, threshold/i),
	).toBeInTheDocument()
})

test('upcoming mobile card exposes core session details and workout shape inside the detail link', async () => {
	const session = makeSession()
	session.workout.blocks = [
		{
			id: 'block-1',
			name: 'Main',
			orderIndex: 0,
			repeatCount: 1,
			steps: [
				{
					id: 'step-easy',
					description: 'Warm up',
					activity: 'run',
					intensity: 'easy',
					orderIndex: 0,
					durationSec: null,
					distanceM: null,
				},
			],
		},
	]
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

	const cardLink = await screen.findByRole('link', {
		name: /threshold intervals/i,
	})
	expect(cardLink).toHaveAttribute('href', '/training/upcoming/session-1')
	expect(within(cardLink).getByText('Time')).toBeInTheDocument()
	expect(within(cardLink).getByText('Activity')).toBeInTheDocument()
	expect(within(cardLink).getByText('Shape')).toBeInTheDocument()
	expect(within(cardLink).getByText('Run')).toBeInTheDocument()
	expect(within(cardLink).getByText('Scheduled')).toBeInTheDocument()
	expect(
		within(cardLink).getByLabelText(/workout shape for threshold intervals/i),
	).toBeInTheDocument()
})
