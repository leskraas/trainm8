/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import { type SessionDetail } from '#app/utils/training.server.ts'
import SessionDetailRoute from './upcoming.$sessionId.tsx'

function makeSession(overrides: Partial<SessionDetail> = {}): SessionDetail {
	return {
		id: 'session-1',
		scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
		status: 'completed',
		workout: {
			id: 'workout-1',
			title: 'Tempo Run',
			description: 'Threshold pace intervals',
			activityType: 'run',
			blocks: [
				{
					id: 'block-1',
					name: 'Main set',
					orderIndex: 0,
					steps: [
						{
							id: 'step-1',
							description: '4 x 5 min at threshold',
							activity: 'run',
							intensity: 'hard',
							orderIndex: 0,
						},
					],
				},
			],
		},
		sessionLog: null,
		...overrides,
	}
}

function sessionDetailLoader(session: SessionDetail) {
	return async (_args: LoaderFunctionArgs) => ({
		session,
		timeZone: 'UTC',
		locale: 'en-US',
	})
}

function renderRoute(loader: (args: LoaderFunctionArgs) => Promise<unknown>) {
	const RouteComponent = (props: Record<string, unknown>) => (
		<SessionDetailRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/training/upcoming/:sessionId',
			Component: RouteComponent,
			loader,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/upcoming/session-1']} />)
}

test('displays session log when one exists', async () => {
	const session = makeSession({
		sessionLog: {
			id: 'log-1',
			content: 'Felt strong and controlled',
			rpe: 7,
			createdAt: new Date('2030-01-02T10:00:00.000Z'),
			updatedAt: new Date('2030-01-02T10:00:00.000Z'),
		},
	})
	renderRoute(sessionDetailLoader(session))

	const display = await screen.findByText('RPE: 7/10')
	expect(display).toBeInTheDocument()
	expect(
		screen.getByText('Felt strong and controlled', { selector: 'p' }),
	).toBeInTheDocument()
})

test('displays session log without RPE', async () => {
	const session = makeSession({
		sessionLog: {
			id: 'log-1',
			content: 'Easy recovery session',
			rpe: null,
			createdAt: new Date('2030-01-02T10:00:00.000Z'),
			updatedAt: new Date('2030-01-02T10:00:00.000Z'),
		},
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Easy recovery session', { selector: 'p' })
	expect(screen.queryByText(/RPE:/)).not.toBeInTheDocument()
})

test('renders session log form with textarea and RPE selector', async () => {
	const session = makeSession()
	renderRoute(sessionDetailLoader(session))

	await screen.findByPlaceholderText('How did the session go?')
	expect(
		screen.getByRole('group', { name: /rpe selector/i }),
	).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: 'Save Session Log' }),
	).toBeInTheDocument()
})

test('RPE selector shows all 10 values', async () => {
	const session = makeSession()
	renderRoute(sessionDetailLoader(session))

	await screen.findByPlaceholderText('How did the session go?')
	for (let i = 1; i <= 10; i++) {
		expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument()
	}
})

test('shows update button when session log exists', async () => {
	const session = makeSession({
		sessionLog: {
			id: 'log-1',
			content: 'Already logged',
			rpe: 5,
			createdAt: new Date('2030-01-02T10:00:00.000Z'),
			updatedAt: new Date('2030-01-02T10:00:00.000Z'),
		},
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('RPE: 5/10')
	expect(
		screen.getByRole('button', { name: 'Update Session Log' }),
	).toBeInTheDocument()
})
