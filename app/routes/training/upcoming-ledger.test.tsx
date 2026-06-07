/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import {
	type UpcomingEvent,
	type UpcomingSession,
} from '#app/utils/training.server.ts'
import {
	DISCIPLINE_QUERY_PARAM,
	parseDisciplineQueryParam,
} from '#app/utils/upcoming-ledger-filters.ts'
import UpcomingRoute from './upcoming.tsx'

function makeSession(): UpcomingSession {
	return {
		id: 'session-1',
		scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
		status: 'scheduled',
		source: 'authored',
		workout: {
			id: 'workout-1',
			title: 'Threshold Intervals',
			description: 'Focus on controlled effort.',
			discipline: 'run',
			intent: 'threshold',
			blocks: [],
		},
		recording: null,
	}
}

function upcomingLoader(sessions: UpcomingSession[]) {
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
	expect(rowLink).toHaveAttribute('href', '/training/sessions/session-1')
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

test('upcoming ledger shows only sessions matching the discipline query', async () => {
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
			loader: upcomingLoader([runSession, bikeSession]),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(
		<App
			initialEntries={[`/training/upcoming?${DISCIPLINE_QUERY_PARAM}=run`]}
		/>,
	)

	await screen.findByRole('link', { name: /morning run/i })
	expect(
		screen.queryByRole('link', { name: /z2 ride/i }),
	).not.toBeInTheDocument()
})

test('upcoming ledger renders summary and allocation for visible sessions', async () => {
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
			loader: upcomingLoader([runSession, bikeSession]),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(
		<App
			initialEntries={[`/training/upcoming?${DISCIPLINE_QUERY_PARAM}=run`]}
		/>,
	)

	await screen.findByRole('heading', { name: /14-day horizon/i })
	expect(screen.getByText('1 Session')).toBeInTheDocument()
	const allocation = screen.getByLabelText(/discipline allocation/i)
	expect(within(allocation).getByText('Run')).toBeInTheDocument()
	expect(within(allocation).getByText('1 (100%)')).toBeInTheDocument()
	expect(screen.getByText('Duration')).toBeInTheDocument()
	expect(screen.getAllByText('Unavailable')).toHaveLength(3)
	expect(within(allocation).queryByText('Ride')).not.toBeInTheDocument()
})

test('upcoming ledger row renders workout shape from workout steps', async () => {
	const session = makeSession()
	session.workout!.blocks = [
		{
			id: 'block-1',
			name: 'Main',
			orderIndex: 0,
			repeatCount: 1,
			steps: [
				{
					id: 'step-easy',
					kind: 'cardio',
					notes: 'Warm up',
					discipline: 'run',
					intensity: 'easy',
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
				{
					id: 'step-hard',
					kind: 'cardio',
					notes: 'Tempo rep',
					discipline: 'run',
					intensity: 'threshold',
					orderIndex: 1,
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
	session.workout!.blocks = [
		{
			id: 'block-1',
			name: 'Main',
			orderIndex: 0,
			repeatCount: 1,
			steps: [
				{
					id: 'step-easy',
					kind: 'cardio',
					notes: 'Warm up',
					discipline: 'run',
					intensity: 'easy',
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
	expect(cardLink).toHaveAttribute('href', '/training/sessions/session-1')
	expect(within(cardLink).getByText('Time')).toBeInTheDocument()
	expect(within(cardLink).getByText('Discipline')).toBeInTheDocument()
	expect(within(cardLink).getByText('Shape')).toBeInTheDocument()
	expect(within(cardLink).getByText('Run')).toBeInTheDocument()
	expect(within(cardLink).getByText('Scheduled')).toBeInTheDocument()
	expect(
		within(cardLink).getByLabelText(/workout shape for threshold intervals/i),
	).toBeInTheDocument()
})

function makeEvent(overrides: Partial<UpcomingEvent> = {}): UpcomingEvent {
	return {
		id: 'event-1',
		name: 'Trondheim Marathon',
		kind: 'race',
		priority: 'A',
		startDate: new Date('2030-01-01T00:00:00.000Z'),
		endDate: null,
		disciplines: JSON.stringify(['run']),
		status: 'planned',
		resultSessionId: null,
		...overrides,
	}
}

function upcomingLoaderWithEvents(
	sessions: UpcomingSession[],
	events: UpcomingEvent[],
) {
	return async ({ request }: LoaderFunctionArgs) => {
		const url = new URL(request.url)
		const disciplineFilter = parseDisciplineQueryParam(
			url.searchParams.get(DISCIPLINE_QUERY_PARAM),
		)
		return {
			sessions,
			events,
			disciplineFilter,
			currentLoad: null,
			snapshots: [],
		}
	}
}

test('tape renders single-day event marker with priority chip and name', async () => {
	const session = makeSession()
	const event = makeEvent()
	const UpcomingRouteComponent = (props: Record<string, unknown>) => (
		<UpcomingRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/training/upcoming',
			Component: UpcomingRouteComponent,
			loader: upcomingLoaderWithEvents([session], [event]),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(<App initialEntries={['/training/upcoming']} />)

	const marker = await screen.findByRole('link', {
		name: /trondheim marathon/i,
	})
	expect(marker).toHaveAttribute('href', '/training/events/event-1')
	expect(within(marker).getByText('A')).toBeInTheDocument()
})

test('tape renders multi-day event marker showing endDate range', async () => {
	const session = makeSession()
	const event = makeEvent({
		endDate: new Date('2030-01-03T00:00:00.000Z'),
	})
	const UpcomingRouteComponent = (props: Record<string, unknown>) => (
		<UpcomingRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/training/upcoming',
			Component: UpcomingRouteComponent,
			loader: upcomingLoaderWithEvents([session], [event]),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(<App initialEntries={['/training/upcoming']} />)

	const marker = await screen.findByRole('link', {
		name: /trondheim marathon/i,
	})
	expect(marker).toHaveAttribute('href', '/training/events/event-1')
	// multi-day event should show a date range
	expect(marker.textContent).toMatch(/\d+ \w+ –/)
})
