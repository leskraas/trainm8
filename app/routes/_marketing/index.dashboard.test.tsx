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
			discipline: 'run',
			intent: 'endurance',
			blocks: [],
		},
		recording: null,
		...overrides,
	}
}

type RecentLog = {
	id: string
	content: string
	rpe: number | null
	createdAt: Date
	session: { id: string; workout: { title: string } | null }
}

type TsbTrust = {
	trustworthy: boolean
	daysOfHistory: number
	requiredDays: number
}

function dashboardLoader(
	nextSession: UpcomingSession | null,
	upcomingSessions: UpcomingSession[] = [],
	recentLogs: RecentLog[] = [],
	coach: { tsb: number | null; tsbTrust: TsbTrust } = {
		tsb: null,
		tsbTrust: { trustworthy: false, daysOfHistory: 0, requiredDays: 42 },
	},
) {
	return async (_args: LoaderFunctionArgs) => ({
		isAuthenticated: true as const,
		nextSession,
		upcomingSessions,
		recentLogs,
		tsb: coach.tsb,
		tsbTrust: coach.tsbTrust,
	})
}

function marketingLoader() {
	return async (_args: LoaderFunctionArgs) => ({
		isAuthenticated: false as const,
	})
}

function renderRoute(
	loader: (args: LoaderFunctionArgs) => Promise<unknown>,
	initialPath = '/',
) {
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
	render(<App initialEntries={[initialPath]} />)
}

test('unauthenticated user sees marketing landing page', async () => {
	renderRoute(marketingLoader())
	await screen.findByText(/the epic stack/i)
})

test('authenticated user sees week strip dashboard with greeting', async () => {
	renderRoute(dashboardLoader(null))

	await screen.findByRole('heading', { name: /here's your week/i })
})

test('dashboard shows 7-day week navigation', async () => {
	renderRoute(dashboardLoader(null))

	const nav = await screen.findByRole('navigation', {
		name: /week navigation/i,
	})
	expect(nav).toBeInTheDocument()
})

test('dashboard shows rest day when focused day has no sessions', async () => {
	renderRoute(dashboardLoader(null, []))

	await screen.findByText(/rest day/i)
})

test('dashboard shows today hero when focused day has a session', async () => {
	const next = makeSession({
		id: 'next-1',
		// scheduled 2030-01-02 in UTC — focus on that day via ?day=
		scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
		workout: {
			id: 'w-1',
			title: 'Tempo Intervals',
			description: null,
			discipline: 'run',
			intent: 'tempo',
			blocks: [],
		},
	})
	renderRoute(dashboardLoader(next), '/?day=2030-01-02')

	expect(await screen.findByText('Tempo Intervals')).toBeInTheDocument()
})

test('dashboard shows stats strip with session count', async () => {
	const next = makeSession()
	renderRoute(dashboardLoader(next))

	// Inline stat unit: "session" or "sessions"
	await screen.findByText(/^sessions?$/i)
})

test('dashboard shows quick-start pills for all activity types', async () => {
	renderRoute(dashboardLoader(null))

	const runLink = await screen.findByRole('link', { name: /^run$/i })
	expect(runLink).toHaveAttribute(
		'href',
		'/training/sessions/new?discipline=run',
	)

	expect(screen.getByRole('link', { name: /^ride$/i })).toHaveAttribute(
		'href',
		'/training/sessions/new?discipline=bike',
	)

	expect(screen.getByRole('link', { name: /^swim$/i })).toHaveAttribute(
		'href',
		'/training/sessions/new?discipline=swim',
	)

	expect(screen.getByRole('link', { name: /^strength$/i })).toHaveAttribute(
		'href',
		'/training/sessions/new?discipline=strength',
	)
})

test('dashboard shows recent reflections when logs exist', async () => {
	const next = makeSession()
	const logs: RecentLog[] = [
		{
			id: 'log-1',
			content: 'Felt strong on intervals',
			rpe: 7,
			createdAt: new Date('2030-01-01T10:00:00.000Z'),
			session: {
				id: 'session-10',
				workout: { title: 'Tempo Run' },
			},
		},
	]
	renderRoute(dashboardLoader(next, [], logs))

	await screen.findByRole('heading', { name: /recent reflections/i })
	expect(screen.getByText('Felt strong on intervals')).toBeInTheDocument()
	expect(screen.getByText('RPE 7')).toBeInTheDocument()
})

test('dashboard hides recent reflections when no logs', async () => {
	renderRoute(dashboardLoader(null, [], []))

	// Wait for the greeting to appear (page loaded)
	await screen.findByRole('heading', { name: /here's your week/i })
	expect(
		screen.queryByRole('heading', { name: /recent reflections/i }),
	).not.toBeInTheDocument()
})

test('coach card shows building-baseline cold-start when TSB is untrustworthy', async () => {
	renderRoute(
		dashboardLoader(null, [], [], {
			tsb: null,
			tsbTrust: { trustworthy: false, daysOfHistory: 12, requiredDays: 42 },
		}),
	)

	await screen.findByText(/building baseline/i)
	expect(screen.getByText(/day 12\/42/i)).toBeInTheDocument()
})

test('coach card shows readiness label and signed TSB when trustworthy', async () => {
	renderRoute(
		dashboardLoader(null, [], [], {
			tsb: 7,
			tsbTrust: { trustworthy: true, daysOfHistory: 60, requiredDays: 42 },
		}),
	)

	await screen.findByText('+7')
	expect(screen.getByText(/fresh/i)).toBeInTheDocument()
	expect(screen.queryByText(/building baseline/i)).not.toBeInTheDocument()
})

test('dashboard shows upcoming this week for sessions not on focused day', async () => {
	// Focus on 2030-01-02 (next session's day); Z2 Ride on 2030-01-09 is a different day
	const next = makeSession({
		id: 'next-1',
		scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
	})
	const upcoming = [
		makeSession({
			id: 's-2',
			scheduledAt: new Date('2030-01-09T08:00:00.000Z'),
			workout: {
				id: 'w-2',
				title: 'Z2 Ride',
				description: null,
				discipline: 'bike',
				intent: 'endurance',
				blocks: [],
			},
		}),
	]
	renderRoute(dashboardLoader(next, upcoming), '/?day=2030-01-02')

	await screen.findByRole('heading', { name: /this week/i })
})
