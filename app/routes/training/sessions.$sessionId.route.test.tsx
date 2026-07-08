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
		stream: null,
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
		replanReason: null,
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
	thresholds: Record<string, unknown> = {},
	lastSimilar: SimilarSession | null = null,
) {
	return async (_args: LoaderFunctionArgs) => ({
		session,
		thresholds,
		lastSimilar,
	})
}

type WorkoutStep = NonNullable<
	SessionDetail['workout']
>['blocks'][number]['steps'][number]

/** Override the first step's authored intensity on a session's workout. */
function withStepIntensity(
	session: SessionDetail,
	intensity: string,
): SessionDetail {
	const workout = session.workout!
	const block = workout.blocks[0]!
	const step: WorkoutStep = { ...block.steps[0]!, intensity }
	return {
		...session,
		workout: {
			...workout,
			blocks: [{ ...block, steps: [step] }],
		},
	}
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

test('the Workout Shape renders with the structure even without any telemetry', async () => {
	// A scheduled session: no recording, no stream — the zone diagram belongs to
	// the prescription and must not disappear with the telemetry overlay.
	const session = makeSession({ status: 'scheduled' })
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Workout structure')
	expect(screen.getByText('Workout Shape by zone')).toBeInTheDocument()
})

test('the Workout Shape renders for a completed session whose recording has no stream', async () => {
	const session = makeSession({ recording: makeRecording({ stream: null }) })
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Telemetry not available')
	expect(screen.getByText('Workout Shape by zone')).toBeInTheDocument()
})

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

/** A bike session whose work step carries a resolved power Intensity Target, so
 * the overlay has a band to draw. */
function makeBikeWorkoutWithPowerTarget(): NonNullable<
	SessionDetail['workout']
> {
	const baseStep = {
		kind: 'cardio' as const,
		discipline: 'bike',
		intensity: null,
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
	}
	return {
		id: 'workout-bike',
		title: 'Threshold Ride',
		description: '3 × 12 min at threshold',
		discipline: 'bike',
		intent: 'threshold',
		blocks: [
			{
				id: 'block-warmup',
				name: 'Warm-up',
				orderIndex: 0,
				repeatCount: 1,
				steps: [
					{
						...baseStep,
						id: 'step-wu',
						notes: 'Easy spin',
						orderIndex: 0,
						durationSec: 300,
					},
				],
			},
			{
				id: 'block-work',
				name: 'Intervals',
				orderIndex: 1,
				repeatCount: 1,
				steps: [
					{
						...baseStep,
						id: 'step-work',
						notes: '12 min at threshold',
						orderIndex: 0,
						durationSec: 720,
						intensityPowerMin: 238,
						intensityPowerMax: 263,
					},
				],
			},
		],
	}
}

test('completed session with a telemetry stream renders the overlay, not the unavailable state', async () => {
	const session = makeSession({
		status: 'completed',
		tssValue: 90,
		plannedTssValue: 88,
		workout: makeBikeWorkoutWithPowerTarget(),
		recording: makeRecording({
			discipline: 'bike',
			powerAvg: 244,
			powerMax: 268,
			stream: {
				resolutionSec: 5,
				timeSec: [0, 5, 10, 15, 20, 25, 30],
				power: [180, 240, 250, null, null, 245, 250],
				heartrate: [120, 150, 160, 158, 150, 162, 165],
			},
		}),
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Telemetry overlay')
	// The honest placeholder is gone once a real stream exists.
	expect(screen.queryByText('Telemetry not available')).not.toBeInTheDocument()
	// The overlay is not chart-only: a non-visual summary states the pause…
	expect(screen.getByText(/paused stretch shown as gaps/i)).toBeInTheDocument()
	// …and the planned power target, surfaced as text.
	expect(screen.getByText(/Planned power target 238–263 W/)).toBeInTheDocument()
	// The planned Workout Shape rail rides beneath the chart.
	expect(screen.getByText('Planned Workout Shape')).toBeInTheDocument()
})

test('recording-only session with a stream renders the overlay without planned target bands', async () => {
	const session = makeSession({
		status: 'completed',
		workout: null,
		tssValue: 75,
		recording: makeRecording({
			discipline: 'bike',
			stream: {
				resolutionSec: 5,
				timeSec: [0, 5, 10, 15, 20],
				power: [200, 210, 220, 215, 205],
				heartrate: [130, 140, 150, 148, 145],
			},
		}),
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Telemetry overlay')
	expect(screen.queryByText('Telemetry not available')).not.toBeInTheDocument()
	// No plan → no target bands and no shape rail, but the lines still plot.
	expect(screen.queryByText(/Planned power target/)).not.toBeInTheDocument()
	expect(screen.queryByText('Planned Workout Shape')).not.toBeInTheDocument()
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

test('shows the headline Intensity Target resolved against the athlete thresholds (#130)', async () => {
	const session = withStepIntensity(
		makeSession({ status: 'scheduled', recording: null }),
		JSON.stringify({ kind: 'powerPct', minPct: 95, maxPct: 105 }),
	)
	renderRoute(
		sessionDetailLoader(session, {
			run: {
				lthr: 168,
				maxHr: 190,
				// The step is a run step, but the seeded workout's discipline maps to a
				// run profile here; FTP present so %FTP resolves to watts.
				ftp: 250,
				thresholdPaceSecPerKm: 240,
				cssSecPer100m: null,
				zoneSystem: null,
				zoneOverrides: null,
			},
		}),
	)

	// 95–105% of FTP 250 → 238–263 W, shown as the session's headline target.
	await screen.findByText(/Target 238–263 W/)
})

const danielsRunProfile = {
	lthr: 168,
	maxHr: 190,
	ftp: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'daniels-pace-5',
	zoneOverrides: null,
}

test('a planned session resolves zone-label structure lines to concrete ranges against the athlete thresholds (#180)', async () => {
	const session = withStepIntensity(
		makeSession({ status: 'scheduled', recording: null }),
		JSON.stringify({ kind: 'zoneLabel', label: 'E' }),
	)
	renderRoute(sessionDetailLoader(session, { run: danielsRunProfile }))

	await screen.findByText('Workout structure')
	// The Token Sentence's intensity token carries the concrete range facet:
	// daniels-pace-5 "E" = 1.29–1.74 × threshold pace 240 → 5:10–6:58 /km.
	const token = screen.getByText('E (5:10–6:58 /km)')
	expect(token).toHaveAttribute('data-token-type', 'intensity')
	// The headline chip agrees — the concrete pace, not a bare letter.
	expect(screen.getByText(/Target 5:10–6:58 \/km/)).toBeInTheDocument()
	// Everything resolved → no Training Settings nudge.
	expect(
		screen.queryByRole('link', { name: /training settings/i }),
	).not.toBeInTheDocument()
})

test('missing thresholds degrade the structure lines honestly, with a pointer to Training Settings (#180)', async () => {
	const session = withStepIntensity(
		makeSession({ status: 'scheduled', recording: null }),
		JSON.stringify({ kind: 'zoneLabel', label: 'E' }),
	)
	renderRoute(
		sessionDetailLoader(session, {
			run: { ...danielsRunProfile, thresholdPaceSecPerKm: null },
		}),
	)

	await screen.findByText('Workout structure')
	// The sentence's intensity token reduces to the bare zone label — no range
	// is fabricated anywhere on the page.
	expect(
		screen.getByText('E', { selector: '[data-token-type="intensity"]' }),
	).toBeInTheDocument()
	expect(screen.queryByText(/\/km/)).not.toBeInTheDocument()
	// The chip degrades to the captioned Training Zone, never a made-up pace.
	expect(screen.getByText(/Target E — easy\/endurance/)).toBeInTheDocument()
	// The honest degradation names the missing threshold and points at settings.
	expect(
		screen.getByText(/threshold pace is not configured/i),
	).toBeInTheDocument()
	const settingsLink = screen.getByRole('link', { name: /training settings/i })
	expect(settingsLink).toHaveAttribute('href', '/settings/training')
})

test('a %FTP token keeps the authored target and composes the zone chip and resolved watts facets', async () => {
	const session = withStepIntensity(
		makeSession({ status: 'scheduled', recording: null }),
		JSON.stringify({ kind: 'powerPct', minPct: 95, maxPct: 105 }),
	)
	renderRoute(
		sessionDetailLoader(session, {
			run: { ...danielsRunProfile, ftp: 250 },
		}),
	)

	await screen.findByText('Workout structure')
	const token = screen.getByText('95–105% FTP · Z4 (238–263 W)')
	expect(token).toHaveAttribute('data-token-type', 'intensity')
})

/** The canonical interval prescription: a warm-up block plus a repeated work
 * block with an inline rest step — the ADR 0027 sentence shape. */
function makeIntervalWorkout(): NonNullable<SessionDetail['workout']> {
	const baseStep = {
		kind: 'cardio' as const,
		notes: null,
		discipline: 'run',
		intensity: null,
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
	}
	return {
		id: 'workout-intervals',
		title: 'Interval Run',
		description: null,
		discipline: 'run',
		intent: 'vo2max',
		blocks: [
			{
				id: 'block-wu',
				name: 'warm-up',
				orderIndex: 0,
				repeatCount: 1,
				steps: [{ ...baseStep, id: 'step-wu', orderIndex: 0, distanceM: 2000 }],
			},
			{
				id: 'block-work',
				name: null,
				orderIndex: 1,
				repeatCount: 4,
				steps: [
					{
						...baseStep,
						id: 'step-work',
						orderIndex: 0,
						durationSec: 360,
						intensity: JSON.stringify({ kind: 'pace', minSecPerKm: 280 }),
					},
					{
						...baseStep,
						id: 'step-rest',
						kind: 'rest' as const,
						orderIndex: 1,
						durationSec: 60,
					},
				],
			},
		],
	}
}

test('the structure card renders the prescription as one Token Sentence, repeat blocks as `4 × …` groups (#223)', async () => {
	const session = makeSession({
		status: 'completed',
		workout: makeIntervalWorkout(),
		recording: makeRecording(),
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Workout structure')
	// The whole prescription reads as the notation module's deterministic
	// sentence: quantities, the repeat group, the @-pace, the inline rest.
	const sentence = document.querySelector('[data-token-sentence]')
	expect(sentence).toHaveTextContent(
		'2 km warm-up → 4 × 6 min @ 4:40 /km (1 min rest)',
	)
	// Tokens are real labelled elements inside the sentence, not one text blob.
	expect(screen.getByText('2 km')).toHaveAttribute(
		'data-token-type',
		'quantity',
	)
	expect(screen.getByText('4:40 /km')).toHaveAttribute(
		'data-token-type',
		'intensity',
	)
	expect(screen.getByText('1 min rest')).toHaveAttribute(
		'data-token-type',
		'rest',
	)
	// The old per-step structure list is gone.
	expect(screen.queryByText(/^Block \d/)).not.toBeInTheDocument()
})

test('the structure card renders a strength step as exercise + set notation with the rest facet (#229)', async () => {
	const baseStep = makeSession().workout!.blocks[0]!.steps[0]!
	const session = makeSession({
		status: 'completed',
		recording: makeRecording(),
		workout: {
			id: 'workout-strength',
			title: 'Leg Day',
			description: null,
			discipline: 'strength',
			intent: 'strength-hypertrophy',
			blocks: [
				{
					id: 'block-1',
					name: null,
					orderIndex: 0,
					repeatCount: 1,
					steps: [
						{
							...baseStep,
							id: 'step-strength',
							kind: 'strength',
							discipline: null,
							durationSec: null,
							exerciseId: 'ex-squat',
							restBetweenSetsSec: 150,
							exercise: {
								id: 'ex-squat',
								name: 'Back squat',
								primaryMuscle: 'quads',
								equipment: 'barbell',
							},
							sets: [0, 1, 2, 3, 4].map((orderIndex) => ({
								id: `set-${orderIndex}`,
								kind: 'reps',
								orderIndex,
								reps: 5,
								weightKg: 80,
								pct1RM: null,
								durationSec: null,
							})),
						},
					],
				},
			],
		},
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Workout structure')
	const sentence = document.querySelector('[data-token-sentence]')
	expect(sentence).toHaveTextContent(
		'Back squat 5 × 5 @ 80 kg (2 min 30 s rest)',
	)
	expect(screen.getByText('Back squat')).toHaveAttribute(
		'data-token-type',
		'exercise',
	)
	expect(screen.getByText('5 × 5 @ 80 kg')).toHaveAttribute(
		'data-token-type',
		'sets',
	)
	expect(screen.getByText('2 min 30 s rest')).toHaveAttribute(
		'data-token-type',
		'rest',
	)
})

test('a completed session renders the Token Sentence inert — recorded history has no edit affordances (#223)', async () => {
	const session = makeSession({
		status: 'completed',
		workout: makeIntervalWorkout(),
		recording: makeRecording(),
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Workout structure')
	const sentence = document.querySelector('[data-token-sentence]')!
	expect(
		sentence.querySelectorAll('button, a, input, [role="button"], [tabindex]'),
	).toHaveLength(0)
})

test('a missed session renders the Token Sentence inert too (#223)', async () => {
	const session = makeSession({
		status: 'missed',
		workout: makeIntervalWorkout(),
		recording: null,
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Workout structure')
	const sentence = document.querySelector('[data-token-sentence]')!
	expect(sentence).toHaveTextContent('4 × 6 min @ 4:40 /km (1 min rest)')
	expect(
		sentence.querySelectorAll('button, a, input, [role="button"], [tabindex]'),
	).toHaveLength(0)
})

test('omits the headline target when no threshold resolves it — never fabricated (Unavailable Metric, CONTEXT.md)', async () => {
	const session = withStepIntensity(
		makeSession({ status: 'scheduled', recording: null }),
		JSON.stringify({ kind: 'powerPct', minPct: 95, maxPct: 105 }),
	)
	// No thresholds at all → FTP absent → Unavailable → no target chip.
	renderRoute(sessionDetailLoader(session, {}))

	await screen.findByText('Workout structure')
	expect(screen.queryByText(/^Target /)).not.toBeInTheDocument()
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
	renderRoute(sessionDetailLoader(session, {}, lastSimilar))

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
	renderRoute(sessionDetailLoader(session, {}, null))

	await screen.findByText('vs last time')
	expect(screen.getByText(/first of its kind/i)).toBeInTheDocument()
	// No per-metric "last time …" line — the first of its kind isn't faked.
	expect(screen.queryByText(/^last time/i)).not.toBeInTheDocument()
})

test('scheduled session shows no "vs last time" card', async () => {
	const session = makeSession({ status: 'scheduled', recording: null })
	renderRoute(sessionDetailLoader(session, {}, null))

	await screen.findByText('Workout structure')
	expect(screen.queryByText('vs last time')).not.toBeInTheDocument()
})

test('a softened session shows its Replan Note with the prescription (ADR 0025)', async () => {
	const note =
		'Last week ran 32% over plan and Form was −12 — softened this session ~24%.'
	const session = makeSession({
		status: 'scheduled',
		recording: null,
		replanReason: note,
	})
	renderRoute(sessionDetailLoader(session))

	// The note renders inside the Workout structure card — the stored reason
	// verbatim, so the "why" travels with the prescription it explains.
	await screen.findByText('Workout structure')
	expect(screen.getByText('Replan note:')).toBeInTheDocument()
	expect(
		screen.getByText(new RegExp('softened this session')),
	).toHaveTextContent(note)
})

test('a session without a Replan Note shows no replan slot at all', async () => {
	const session = makeSession({
		status: 'scheduled',
		recording: null,
		replanReason: null,
	})
	renderRoute(sessionDetailLoader(session))

	await screen.findByText('Workout structure')
	expect(screen.queryByText(/replan note/i)).not.toBeInTheDocument()
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
