/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import {
	type SessionDetail,
	type SimilarSession,
} from '#app/utils/training.server.ts'
import SessionDetailRoute from './sessions.$sessionId.tsx'

type Recording = NonNullable<SessionDetail['recording']>

function makeRecording(overrides: Partial<Recording> = {}): Recording {
	return {
		id: 'recording-1',
		discipline: 'run',
		startedAt: new Date('2030-01-02T08:00:00.000Z'),
		endedAt: new Date('2030-01-02T08:31:00.000Z'),
		durationSec: 1860,
		distanceM: 8200,
		hrAvg: 158,
		hrMax: 176,
		powerAvg: null,
		powerMax: null,
		powerWeightedAvg: null,
		cadenceAvg: 168,
		paceAvgSecPerKm: 227,
		speedMaxMps: null,
		elevationGainM: 45,
		kilojoules: null,
		polyline: null,
		phaseBarsJson: null,
		tssValue: 92,
		externalProvider: 'strava',
		...overrides,
	}
}

function makeSession(overrides: Partial<SessionDetail> = {}): SessionDetail {
	return {
		id: 'session-1',
		scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
		status: 'completed',
		source: 'authored',
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		workout: {
			id: 'workout-1',
			title: 'Tempo Run',
			description: 'Threshold pace intervals',
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
							notes: '4 x 5 min at threshold',
							discipline: 'run',
							intensity: null,
							orderIndex: 0,
							durationSec: 1800,
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
		sessionLog: null,
		recording: null,
		...overrides,
	}
}

function makeSimilarSession(
	overrides: Partial<SimilarSession> = {},
): SimilarSession {
	return {
		id: 'session-0',
		scheduledAt: new Date('2029-12-20T08:00:00.000Z'),
		tssValue: 80,
		recording: { durationSec: 1740 },
		...overrides,
	}
}

function sessionDetailLoader(
	session: SessionDetail,
	lastSimilar: SimilarSession | null = null,
) {
	return async (_args: LoaderFunctionArgs) => ({ session, lastSimilar })
}

function renderRoute(loader: (args: LoaderFunctionArgs) => Promise<unknown>) {
	const RouteComponent = (props: Record<string, unknown>) => (
		<SessionDetailRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/training/sessions/:sessionId',
			Component: RouteComponent,
			loader,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/session-1']} />)
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

test('completed session with a recording leads with the planned-vs-actual summary and an honest telemetry state', async () => {
	const session = makeSession({
		status: 'completed',
		tssValue: 92,
		plannedTssValue: 88,
		recording: makeRecording(),
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Planned vs actual')
	// Adherence Band verdict, surfaced as text (not chart-only); the band label
	// appears in both the verdict line and the chip.
	expect(screen.getByText(/matched the plan/i)).toBeInTheDocument()
	expect(screen.getAllByText('On target').length).toBeGreaterThan(0)
	// Actual vs planned TSS exposed as text ("planned 88" is unique to the summary).
	expect(screen.getByText('planned 88')).toBeInTheDocument()
	// The telemetry overlay slot is reserved with an honest Unavailable Metric.
	expect(screen.getByText('Telemetry not available')).toBeInTheDocument()
	// The Recording aggregate metric grid is retained below ("Avg HR" lives only
	// in that grid).
	expect(screen.getByText('Avg HR')).toBeInTheDocument()
})

test('shows the planned TSS as unavailable rather than a fabricated band', async () => {
	const session = makeSession({
		status: 'completed',
		tssValue: 92,
		plannedTssValue: null,
		recording: makeRecording(),
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Planned vs actual')
	// Planned TSS and planned distance are both unavailable → honest "planned —".
	expect(screen.getAllByText('planned —').length).toBeGreaterThan(0)
	// No band without both sides of the comparison.
	expect(screen.queryByText('On target')).not.toBeInTheDocument()
})

test('scheduled session shows the prescription only — no comparison, no telemetry slot', async () => {
	const session = makeSession({ status: 'scheduled', recording: null })
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Workout structure')
	expect(screen.queryByText('Planned vs actual')).not.toBeInTheDocument()
	expect(screen.queryByText('Telemetry not available')).not.toBeInTheDocument()
})

test('recording-only session shows the recording without a plan comparison', async () => {
	const session = makeSession({
		status: 'completed',
		workout: null,
		tssValue: 75,
		recording: makeRecording(),
	})
	renderRoute(sessionDetailLoader(session))

	// The telemetry slot still renders its honest Unavailable Metric.
	await screen.findByText('Telemetry not available')
	// No plan to compare against, and no prescription to show.
	expect(screen.queryByText('Planned vs actual')).not.toBeInTheDocument()
	expect(screen.queryByText('Workout structure')).not.toBeInTheDocument()
	// The recording metric grid still renders.
	expect(screen.getByText('Avg HR')).toBeInTheDocument()
})

test('completed session shows a "vs last time" delta against the last similar session', async () => {
	const session = makeSession({
		status: 'completed',
		tssValue: 92,
		recording: makeRecording({ durationSec: 1860 }),
	})
	const lastSimilar = makeSimilarSession({
		tssValue: 80,
		recording: { durationSec: 1740 },
	})
	renderRoute(sessionDetailLoader(session, lastSimilar))

	await screen.findByText('vs last time')
	// Truthful deltas surfaced as text: +12 TSS and +2 min versus last time.
	expect(screen.getByText('last time 80')).toBeInTheDocument()
	expect(screen.getByText('(+12)')).toBeInTheDocument()
	expect(screen.getByText('(+2 min)')).toBeInTheDocument()
})

test('the first session of its kind shows an Unavailable "vs last time" state, not a fabricated delta', async () => {
	const session = makeSession({
		status: 'completed',
		tssValue: 92,
		recording: makeRecording(),
	})
	renderRoute(sessionDetailLoader(session, null))

	await screen.findByText('vs last time')
	expect(screen.getByText(/first of its kind/i)).toBeInTheDocument()
	// No per-metric "last time …" line — the first of its kind isn't faked.
	expect(screen.queryByText(/^last time/i)).not.toBeInTheDocument()
})

test('scheduled session shows no "vs last time" card', async () => {
	const session = makeSession({ status: 'scheduled', recording: null })
	renderRoute(sessionDetailLoader(session, null))

	await screen.findByText('Workout structure')
	expect(screen.queryByText('vs last time')).not.toBeInTheDocument()
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
