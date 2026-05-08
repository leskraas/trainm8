/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import IndexRoute from './index.tsx'

function makeSession(
	overrides: Partial<UpcomingSession> = {},
): UpcomingSession {
	return {
		id: 'session-1',
		scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
		status: 'scheduled',
		workout: {
			id: 'workout-1',
			title: 'Morning Run',
			description: 'Easy zone 2 run',
			activityType: 'run',
			blocks: [],
		},
		...overrides,
	}
}

type RecentLog = {
	id: string
	content: string
	rpe: number | null
	createdAt: Date
	session: { id: string; workout: { title: string } }
}

function dashboardLoader(
	nextSession: UpcomingSession | null,
	upcomingSessions: UpcomingSession[] = [],
	recentLogs: RecentLog[] = [],
) {
	return async (_args: LoaderFunctionArgs) => ({
		isAuthenticated: true as const,
		nextSession,
		upcomingSessions,
		recentLogs,
		timeZone: 'UTC',
		locale: 'en-US',
	})
}

function marketingLoader() {
	return async (_args: LoaderFunctionArgs) => ({
		isAuthenticated: false as const,
	})
}

function renderRoute(loader: (args: LoaderFunctionArgs) => Promise<unknown>) {
	const RouteComponent = (props: Record<string, unknown>) => (
		<IndexRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/',
			Component: RouteComponent,
			loader,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/']} />)
}

test('unauthenticated user sees marketing landing page', async () => {
	renderRoute(marketingLoader())
	await screen.findByText(/the epic stack/i)
})

test('authenticated user sees dashboard with next session highlighted', async () => {
	const next = makeSession({
		id: 'next-1',
		workout: {
			id: 'w-1',
			title: 'Tempo Intervals',
			description: 'Threshold pace work',
			activityType: 'run',
			blocks: [],
		},
	})
	renderRoute(dashboardLoader(next))

	const heading = await screen.findByRole('heading', { name: /next workout/i })
	expect(heading).toBeInTheDocument()
	expect(screen.getByText('Tempo Intervals')).toBeInTheDocument()
})

test('dashboard shows upcoming sessions list', async () => {
	const next = makeSession({ id: 'next-1' })
	const upcoming = [
		makeSession({
			id: 's-2',
			scheduledAt: new Date('2030-01-03T08:00:00.000Z'),
			workout: {
				id: 'w-2',
				title: 'Z2 Ride',
				description: null,
				activityType: 'bike',
				blocks: [],
			},
		}),
		makeSession({
			id: 's-3',
			scheduledAt: new Date('2030-01-04T09:00:00.000Z'),
			workout: {
				id: 'w-3',
				title: 'Pool Session',
				description: null,
				activityType: 'swim',
				blocks: [],
			},
		}),
	]
	renderRoute(dashboardLoader(next, upcoming))

	await screen.findByText('Z2 Ride')
	expect(screen.getByText('Pool Session')).toBeInTheDocument()
})

test('dashboard links to the full upcoming ledger', async () => {
	const next = makeSession()
	renderRoute(dashboardLoader(next))

	const link = await screen.findByRole('link', { name: /upcoming ledger/i })
	expect(link).toHaveAttribute('href', '/training/upcoming')
})

test('dashboard shows empty state when no sessions exist', async () => {
	renderRoute(dashboardLoader(null, []))

	await screen.findByText(/no upcoming workouts/i)
})

test('dashboard shows empty state when no session logs', async () => {
	const next = makeSession()
	renderRoute(dashboardLoader(next))

	await screen.findByRole('heading', { name: /session logs/i })
	expect(screen.getByText(/no session logs yet/i)).toBeInTheDocument()
})

test('dashboard displays recent session logs', async () => {
	const next = makeSession()
	const logs: RecentLog[] = [
		{
			id: 'log-1',
			content: 'Felt strong on tempo intervals',
			rpe: 7,
			createdAt: new Date('2030-01-01T10:00:00.000Z'),
			session: {
				id: 'session-10',
				workout: { title: 'Tempo Run' },
			},
		},
		{
			id: 'log-2',
			content: 'Easy recovery spin',
			rpe: null,
			createdAt: new Date('2029-12-31T10:00:00.000Z'),
			session: {
				id: 'session-11',
				workout: { title: 'Z2 Ride' },
			},
		},
	]
	renderRoute(dashboardLoader(next, [], logs))

	await screen.findByText('Tempo Run')
	expect(screen.getByText('Felt strong on tempo intervals')).toBeInTheDocument()
	expect(screen.getByText('RPE: 7/10')).toBeInTheDocument()
	expect(screen.getByText('Z2 Ride')).toBeInTheDocument()
	expect(screen.getByText('Easy recovery spin')).toBeInTheDocument()
})
