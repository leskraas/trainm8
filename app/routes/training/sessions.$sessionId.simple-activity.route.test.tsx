/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import { readSimpleActivity } from '#app/utils/simple-activity.ts'
import { type SessionDetail } from '#app/utils/training.server.ts'
import { buildSessionSummary } from './__workout-detail-summary.ts'
import SessionDetailRoute from './sessions.$sessionId.tsx'

// A Simple Activity's detail page (ADR 0015 §A, #567, spec #558 story 63):
// its time and Effort Word, and every other number _ikke målt_ with the
// reason — never a figure, never a zone, never the step editor.

function climb(overrides: Partial<SessionDetail> = {}): SessionDetail {
	return {
		id: 'session-1',
		scheduledAt: new Date('2030-01-02T16:00:00.000Z'),
		status: 'scheduled',
		source: 'authored',
		adoptedAt: null,
		tssValue: null,
		// A stored figure must not reach the page: the planned discipline
		// withholds it.
		plannedTssValue: 80,
		plannedTssConfidence: 'full',
		replanReason: null,
		workout: {
			id: 'workout-1',
			title: 'Klatring',
			description: null,
			discipline: 'other',
			intent: 'simple-activity',
			archetype: null,
			activityKind: 'climb',
			effortWord: 'hard',
			blocks: [
				{
					id: 'block-1',
					name: null,
					orderIndex: 0,
					repeatCount: 1,
					seriesRepeatCount: 1,
					betweenSeriesRestSec: null,
					sendOff: null,
					steps: [
						{
							id: 'step-1',
							kind: 'cardio',
							notes: null,
							discipline: 'other',
							intensity: null,
							orderIndex: 0,
							durationSec: 5400,
							distanceM: null,
							verticalM: null,
							gradePct: null,
							cadenceRpmMin: null,
							cadenceRpmMax: null,
							rest: null,
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

function loaderFor(session: SessionDetail) {
	const simpleActivity = readSimpleActivity(session.workout)
	return async (_args: LoaderFunctionArgs) => ({
		session,
		thresholds: {},
		lastSimilar: null,
		relinkTargets: [],
		archetype: null,
		simpleActivity,
		loadContexts: {},
		exercises: [],
		recentExerciseIds: [],
		loggedSetCount: 0,
		loggedSetsByStep: {},
		summary: buildSessionSummary({
			discipline: 'other',
			status: session.status,
			currency: null,
			thresholds: {},
			workout: session.workout,
			recording: session.recording,
			loggedSets: 0,
			simpleActivity: simpleActivity != null,
		}),
	})
}

function renderRoute(session: SessionDetail) {
	const RouteComponent = (props: Record<string, unknown>) => (
		<SessionDetailRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/training/sessions/:sessionId',
			Component: RouteComponent,
			loader: loaderFor(session),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/session-1']} />)
}

test('a planned climb shows its time and Effort Word, and zones, pace, power, Planned TSS and load as ikke målt with the reason', async () => {
	renderRoute(climb())

	await screen.findByText('Klatring')
	expect(screen.getByText('1 t 30 min')).toBeInTheDocument()
	expect(screen.getByText('Hard')).toBeInTheDocument()
	const facts = document.querySelector('[data-simple-activity]') as HTMLElement
	const notMeasured = facts.querySelector('[data-not-measured]') as HTMLElement
	for (const metric of [
		'Soner',
		'Fart',
		'Watt',
		'Planlagt TSS',
		'Treningsbelastning',
	]) {
		const row = within(notMeasured).getByText(metric).parentElement!
		expect(within(row).getByText('ikke målt')).toBeInTheDocument()
	}
	expect(
		within(facts).getByText(/En enkel aktivitet har bare tid og innsats/),
	).toBeInTheDocument()
	// Never a number for what it cannot measure.
	expect(screen.queryByText(/80/)).not.toBeInTheDocument()
	expect(screen.getByText('Enkel aktivitet')).toBeInTheDocument()
})

test('a climb done by hand still reads its planned time, and no comparison against a plan it cannot measure', async () => {
	renderRoute(climb({ status: 'completed' }))

	await screen.findByText('Klatring')
	expect(screen.getByText('1 t 30 min')).toBeInTheDocument()
	expect(screen.queryByText('Plan mot gjennomført')).not.toBeInTheDocument()
})
