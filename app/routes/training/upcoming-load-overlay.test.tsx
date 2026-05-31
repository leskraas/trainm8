/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import { type UpcomingSession } from '#app/utils/training.server.ts'
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

function loaderWithLoad() {
	return async ({ request }: LoaderFunctionArgs) => {
		const url = new URL(request.url)
		const disciplineFilter = parseDisciplineQueryParam(
			url.searchParams.get(DISCIPLINE_QUERY_PARAM),
		)
		return {
			sessions: [makeSession()],
			events: [],
			disciplineFilter,
			currentLoad: { ctl: 42, atl: 30, tsb: 12, date: '2030-01-01' },
			snapshots: [
				{
					date: '2029-12-31',
					tssTotal: 55,
					tssByDiscipline: { run: 55 },
					ctl: 41,
					atl: 28,
					tsb: 13,
				},
				{
					date: '2030-01-01',
					tssTotal: 60,
					tssByDiscipline: { run: 60 },
					ctl: 42,
					atl: 30,
					tsb: 12,
				},
			],
		}
	}
}

function renderUpcoming() {
	const App = createRoutesStub([
		{
			path: '/training/upcoming',
			Component: (props: Record<string, unknown>) => (
				<UpcomingRoute {...(props as any)} />
			),
			loader: loaderWithLoad(),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/upcoming']} />)
}

test('load overlay surfaces current CTL/ATL/TSB metrics', async () => {
	renderUpcoming()

	await screen.findByRole('heading', { name: /training load/i })
	expect(screen.getByText('CTL 42')).toBeInTheDocument()
	expect(screen.getByText('ATL 30')).toBeInTheDocument()
	expect(screen.getByText('TSB +12')).toBeInTheDocument()
})

test('load overlay curve toggles open and closed', async () => {
	const user = userEvent.setup()
	renderUpcoming()

	await screen.findByRole('heading', { name: /training load/i })

	// Curve is hidden until the athlete opts in.
	expect(
		screen.queryByRole('img', { name: /14-day ctl\/atl curve/i }),
	).not.toBeInTheDocument()

	await user.click(screen.getByRole('button', { name: /show curve/i }))
	expect(
		screen.getByRole('img', { name: /14-day ctl\/atl curve/i }),
	).toBeInTheDocument()

	await user.click(screen.getByRole('button', { name: /hide curve/i }))
	expect(
		screen.queryByRole('img', { name: /14-day ctl\/atl curve/i }),
	).not.toBeInTheDocument()
})
