/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import IndexRoute from './index.tsx'

const DAY = 24 * 60 * 60 * 1000
// A fixed Wednesday at local noon — the Cockpit reads "today" off the loader's
// `now`, so anchoring fixtures to it keeps the week timeline deterministic.
const NOW = new Date('2030-01-02T12:00:00')

type LoadTriad = { ctl: number; atl: number; tsb: number }
type TsbTrust = {
	trustworthy: boolean
	daysOfHistory: number
	requiredDays: number
}
type LoadSnapshot = { date: string; ctl: number; atl: number; tsb: number }

function makeLedgerSession(
	overrides: Partial<LedgerSession> = {},
): LedgerSession {
	return {
		id: 'ledger-1',
		scheduledAt: new Date('2030-01-02T08:00:00'),
		status: 'scheduled',
		source: 'authored',
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		replanReason: null,
		workout: {
			id: 'workout-1',
			title: 'Morning Run',
			description: null,
			discipline: 'run',
			intent: 'endurance',
			blocks: [],
		},
		recording: null,
		sessionLog: null,
		...overrides,
	}
}

type Workout = NonNullable<LedgerSession['workout']>
type WorkoutStep = Workout['blocks'][number]['steps'][number]

/** A run workout whose single cardio step carries the given authored intensity. */
function workoutWithTarget(intensity: string): Workout {
	const step: WorkoutStep = {
		id: 'step-0',
		kind: 'cardio',
		notes: null,
		discipline: 'run',
		intensity,
		intensityHrMin: null,
		intensityHrMax: null,
		intensityPowerMin: null,
		intensityPowerMax: null,
		intensityPaceMin: null,
		intensityPaceMax: null,
		orderIndex: 0,
		durationSec: 1200,
		distanceM: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
	}
	return {
		id: 'workout-1',
		title: 'Tempo Run',
		description: null,
		discipline: 'run',
		intent: 'tempo',
		blocks: [
			{
				id: 'block-1',
				name: 'Main',
				orderIndex: 0,
				repeatCount: 1,
				steps: [step],
			},
		],
	}
}

const RUN_THRESHOLDS: DisciplineThresholdMap = {
	run: {
		lthr: 168,
		maxHr: 190,
		ftp: null,
		thresholdPaceSecPerKm: 240,
		cssSecPer100m: null,
		zoneSystem: null,
		zoneOverrides: null,
	},
}

function dashboardLoader(
	opts: {
		now?: Date
		ledger?: LedgerSession[]
		current?: LoadTriad | null
		snapshots?: LoadSnapshot[]
		tsbTrust?: TsbTrust
		activePlan?: ActivePlan | null
		weeklyAdherence?: WeeklyAdherence | null
		weeklyBuild?: Array<WeeklyAdherence | null>
		sustained?: SustainedDeviation | null
		thresholds?: DisciplineThresholdMap
		personalRecords?: PersonalRecord[]
		weekReplan?: { outcome: string; reason: string } | null
	} = {},
) {
	return async (_args: LoaderFunctionArgs) => ({
		isAuthenticated: true as const,
		now: opts.now ?? NOW,
		ledger: opts.ledger ?? [],
		current: opts.current ?? null,
		snapshots: opts.snapshots ?? [],
		tsbTrust:
			opts.tsbTrust ??
			({ trustworthy: false, daysOfHistory: 0, requiredDays: 42 } as TsbTrust),
		activePlan: opts.activePlan ?? null,
		weeklyAdherence: opts.weeklyAdherence ?? null,
		weeklyBuild: opts.weeklyBuild ?? [],
		sustained: opts.sustained ?? null,
		thresholds: opts.thresholds ?? {},
		personalRecords: opts.personalRecords ?? [],
		weekReplan: opts.weekReplan ?? null,
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

function activePlanFixture(now: Date = NOW): ActivePlan {
	// A 12-week plan whose Target Event is 16 days out ⇒ ~9.7 of 12 weeks
	// elapsed → week 10, in the Peak phase (weeks 9–10), 16 days to go.
	return {
		eventId: 'event-42',
		eventName: 'Spring Half Marathon',
		eventDate: new Date(now.getTime() + 16 * DAY),
		phases: [
			{ name: 'Base', weeks: 4, weeklyLoadHours: 6 },
			{ name: 'Build', weeks: 4, weeklyLoadHours: 9 },
			{ name: 'Peak', weeks: 2, weeklyLoadHours: 7 },
			{ name: 'Taper', weeks: 2, weeklyLoadHours: 3 },
		],
	}
}

// TanStack Virtual measures its scroll element (via offsetWidth/offsetHeight)
// to decide which rows to mount; jsdom reports zero-size layout, so give the
// virtualizer a real viewport.
const originalOffsets = {
	width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
	height: Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		'offsetHeight',
	),
}

beforeAll(() => {
	if (!('ResizeObserver' in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver
	}
	Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
		configurable: true,
		get: () => 1024,
	})
	Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
		configurable: true,
		get: () => 640,
	})
})

afterAll(() => {
	vi.restoreAllMocks()
	if (originalOffsets.width) {
		Object.defineProperty(
			HTMLElement.prototype,
			'offsetWidth',
			originalOffsets.width,
		)
	}
	if (originalOffsets.height) {
		Object.defineProperty(
			HTMLElement.prototype,
			'offsetHeight',
			originalOffsets.height,
		)
	}
})

test('unauthenticated user sees marketing landing page', async () => {
	renderRoute(marketingLoader())
	await screen.findByText(/the epic stack/i)
})

test('with no active plan the heading falls back to "Here\'s your week"', async () => {
	renderRoute(dashboardLoader())
	await screen.findByRole('heading', { name: /here's your week/i })
	expect(
		screen.queryByRole('heading', { name: /road to race/i }),
	).not.toBeInTheDocument()
})

test('an active plan flips the heading to "Road to race day"', async () => {
	renderRoute(dashboardLoader({ activePlan: activePlanFixture() }))
	await screen.findByRole('heading', { name: /road to race day/i })
})

// ── tabs (#184): Week / Trends / History, one dense panel at a time ──

test('the tabs render one panel at a time — Week by default', async () => {
	renderRoute(dashboardLoader())

	const tablist = await screen.findByRole('tablist', {
		name: /dashboard views/i,
	})
	const weekTab = within(tablist).getByRole('tab', { name: /^week$/i })
	expect(weekTab).toHaveAttribute('aria-selected', 'true')
	expect(within(tablist).getByRole('tab', { name: /trends/i })).toHaveAttribute(
		'aria-selected',
		'false',
	)

	// Week content renders; Trends and History content do not.
	expect(screen.getByRole('region', { name: /this week/i })).toBeInTheDocument()
	expect(
		screen.queryByRole('region', { name: /weekly load/i }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByRole('region', { name: /session ledger/i }),
	).not.toBeInTheDocument()
})

test('the selected tab is URL-addressable: ?tab=history renders only the History panel', async () => {
	renderRoute(dashboardLoader(), '/?tab=history')

	const historyTab = await screen.findByRole('tab', { name: /history/i })
	expect(historyTab).toHaveAttribute('aria-selected', 'true')
	expect(
		screen.getByRole('region', { name: /session ledger/i }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('region', { name: /this week/i }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByRole('region', { name: /personal records/i }),
	).not.toBeInTheDocument()
})

test('clicking a tab switches the panel and writes the choice into the URL', async () => {
	const user = userEvent.setup()
	renderRoute(dashboardLoader())

	await screen.findByRole('tablist', { name: /dashboard views/i })
	await user.click(screen.getByRole('tab', { name: /trends/i }))

	expect(
		await screen.findByRole('region', { name: /weekly load/i }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('region', { name: /this week/i }),
	).not.toBeInTheDocument()
	expect(screen.getByRole('tab', { name: /trends/i })).toHaveAttribute(
		'aria-selected',
		'true',
	)
})

test('the History tab carries the session count', async () => {
	const ledger = [
		makeLedgerSession({ id: 's1' }),
		makeLedgerSession({
			id: 's2',
			scheduledAt: new Date('2030-01-01T08:00:00'),
			status: 'completed',
			tssValue: 60,
		}),
	]
	renderRoute(dashboardLoader({ ledger }))

	const historyTab = await screen.findByRole('tab', { name: /history/i })
	expect(within(historyTab).getByLabelText('2 sessions')).toBeInTheDocument()
})

// ── header: the plan-arc chip replaces the 3-stat plan bar ──

test('the header plan-arc chip spells out countdown, week and phase, and opens the Target Event', async () => {
	renderRoute(dashboardLoader({ activePlan: activePlanFixture() }))

	const chip = await screen.findByRole('link', {
		name: /plan: spring half marathon/i,
	})
	expect(chip).toHaveAttribute('href', '/training/events/event-42')
	// #181/#184: spelled out — never "16d", "W10" or "Peak · w10/12".
	expect(chip).toHaveTextContent('16 days to race · Week 10 of 12 · Peak phase')
})

test('without an active plan the header keeps the Events and Generate plan entries (#178)', async () => {
	renderRoute(dashboardLoader({ activePlan: null }))

	await screen.findByText(/no active plan/i)
	expect(screen.getByRole('link', { name: /^events$/i })).toHaveAttribute(
		'href',
		'/training/events',
	)
	expect(screen.getByRole('link', { name: /generate plan/i })).toHaveAttribute(
		'href',
		'/training/plan/new',
	)
})

test("the week panel shows this week's load reading, honest when unavailable", async () => {
	renderRoute(
		dashboardLoader({ activePlan: activePlanFixture(), weeklyAdherence: null }),
	)

	const weekRegion = await screen.findByRole('region', { name: /this week/i })
	// No fabricated percentage — the spelled-out Unavailable reading (#181).
	expect(
		within(weekRegion).getByText(/planned week load unavailable/i),
	).toBeInTheDocument()
	expect(within(weekRegion).queryByText(/%/)).not.toBeInTheDocument()
})

test('the week panel spells out the available week-load percentage', async () => {
	renderRoute(
		dashboardLoader({
			activePlan: activePlanFixture(),
			weeklyAdherence: {
				ratio: 0.92,
				band: {
					label: 'On target',
					recommendation: 'matched the plan',
					tone: 'on-target',
				},
				sessionCount: 3,
				totalActual: 276,
				totalPlanned: 300,
			},
		}),
	)

	const weekRegion = await screen.findByRole('region', { name: /this week/i })
	expect(
		within(weekRegion).getByText(/92% of planned week load/i),
	).toBeInTheDocument()
})

// ── the Week Replan decision line (ADR 0025): the stored reason, verbatim ──

test('the Week tab renders the stored adjusted decision line verbatim', async () => {
	const reason =
		'Last week ran 32% over plan and Form was −12 — softened this week’s remaining sessions ~24%.'
	renderRoute(dashboardLoader({ weekReplan: { outcome: 'adjusted', reason } }))

	await screen.findByRole('region', { name: /this week/i })
	const line = screen.getByTestId('week-replan-line')
	expect(line).toHaveTextContent(reason)
})

test('the Week tab renders the stored no-change decline verbatim', async () => {
	const reason =
		'Last week ran 20% under plan — bank the planned work; this week stands as planned.'
	renderRoute(dashboardLoader({ weekReplan: { outcome: 'no-change', reason } }))

	await screen.findByRole('region', { name: /this week/i })
	expect(screen.getByTestId('week-replan-line')).toHaveTextContent(reason)
})

test('the Week tab renders the stored insufficient-data decline verbatim', async () => {
	const reason =
		'Last week has no measurable Plan Adherence — no adjustment, not enough data.'
	renderRoute(
		dashboardLoader({ weekReplan: { outcome: 'insufficient-data', reason } }),
	)

	await screen.findByRole('region', { name: /this week/i })
	expect(screen.getByTestId('week-replan-line')).toHaveTextContent(reason)
})

test('with no stored Week Replan the Week tab shows no decision line at all', async () => {
	renderRoute(dashboardLoader({ weekReplan: null }))

	await screen.findByRole('region', { name: /this week/i })
	// No stored row → nothing new on the tab; a status is never invented.
	expect(screen.queryByTestId('week-replan-line')).not.toBeInTheDocument()
})

// ── the ledger's "adjusted" adornment (ADR 0025): from replanReason only ──

test('ledger rows whose session carries a Replan Note get the "adjusted" adornment', async () => {
	const note =
		'Last week ran 32% over plan and Form was −12 — softened this session ~24%.'
	const ledger = [
		makeLedgerSession({
			id: 'softened-1',
			scheduledAt: new Date('2030-01-04T08:00:00'),
			status: 'scheduled',
			replanReason: note,
		}),
	]
	renderRoute(dashboardLoader({ ledger }), '/?tab=history')

	const ledgerRegion = await screen.findByRole('region', {
		name: /session ledger/i,
	})
	// Both presentations of the same rows carry the mark, with the full stored
	// note riding along for anyone who digs in.
	for (const variant of [
		within(ledgerRegion).getByTestId('session-ledger-table'),
		within(ledgerRegion).getByTestId('session-ledger-cards'),
	]) {
		const mark = within(variant).getByText('adjusted')
		expect(mark).toBeInTheDocument()
		expect(mark.closest('[title]')).toHaveAttribute('title', note)
	}
})

test('ledger rows without a Replan Note carry no "adjusted" adornment', async () => {
	const ledger = [
		makeLedgerSession({
			id: 'untouched-1',
			scheduledAt: new Date('2030-01-04T08:00:00'),
			status: 'scheduled',
			replanReason: null,
		}),
	]
	renderRoute(dashboardLoader({ ledger }), '/?tab=history')

	await screen.findByRole('region', { name: /session ledger/i })
	expect(screen.queryByText('adjusted')).not.toBeInTheDocument()
})

// ── Trends: the one home for the load story ──

const ctlSnapshots = (): LoadSnapshot[] =>
	Array.from({ length: 8 }, (_, i) => {
		const date = new Date(NOW.getTime() - (7 - i) * DAY)
		return {
			date: date.toISOString().slice(0, 10),
			ctl: 40 + i,
			atl: 42,
			tsb: -2,
		}
	})

test('the fitness curve projects to race day once the CTL baseline is trustworthy', async () => {
	renderRoute(
		dashboardLoader({
			activePlan: activePlanFixture(),
			snapshots: ctlSnapshots(),
			tsbTrust: { trustworthy: true, daysOfHistory: 60, requiredDays: 42 },
		}),
		'/?tab=trends',
	)
	expect(
		await screen.findByRole('img', { name: /projection to race day/i }),
	).toBeInTheDocument()
	expect(screen.queryByText(/projection unavailable/i)).not.toBeInTheDocument()
})

test('the fitness curve degrades to an Unavailable projection on a cold-start baseline', async () => {
	renderRoute(
		dashboardLoader({
			activePlan: activePlanFixture(),
			snapshots: ctlSnapshots(),
			tsbTrust: { trustworthy: false, daysOfHistory: 12, requiredDays: 42 },
		}),
		'/?tab=trends',
	)
	// Measured history still draws; only the forward projection is withheld.
	expect(
		await screen.findByText(/race-day projection unavailable/i),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('img', { name: /projection to race day/i }),
	).not.toBeInTheDocument()
})

test('Trends carries the CTL/ATL/TSB evidence with the spelled-out legends (#181)', async () => {
	renderRoute(
		dashboardLoader({
			current: { ctl: 45.4, atl: 38.6, tsb: 7 },
			tsbTrust: { trustworthy: true, daysOfHistory: 60, requiredDays: 42 },
		}),
		'/?tab=trends',
	)

	const region = await screen.findByRole('region', {
		name: /fitness to race/i,
	})
	// The abbreviated stat labels are keyboard-focusable legend triggers named
	// by the canonical term, and the values render rounded.
	const fit = within(region).getByRole('button', { name: 'Fitness (CTL)' })
	const fat = within(region).getByRole('button', { name: 'Fatigue (ATL)' })
	expect(within(fit.parentElement!).getByText('45')).toBeInTheDocument()
	expect(within(fat.parentElement!).getByText('39')).toBeInTheDocument()
	expect(
		within(region).getByRole('button', { name: 'Form (TSB)' }),
	).toBeInTheDocument()
})

test('the proof strip surfaces a derived personal record with its gain', async () => {
	const personalRecords: PersonalRecord[] = [
		{
			discipline: 'run',
			kind: 'farthest',
			value: 21_100,
			sessionId: 'pr-run',
			achievedAt: new Date('2029-12-20T08:00:00'),
			previousValue: 18_000,
			delta: 3_100,
		},
	]
	renderRoute(dashboardLoader({ personalRecords }), '/?tab=trends')

	const proofRegion = await screen.findByRole('region', {
		name: /proof · personal records/i,
	})
	expect(within(proofRegion).getByText('Longest run')).toBeInTheDocument()
	expect(within(proofRegion).getByText('21.1 km')).toBeInTheDocument()
	expect(
		within(proofRegion).getByLabelText(/\+3\.1 km over previous best/i),
	).toBeInTheDocument()
})

test('the proof strip shows an empty state, not a fabricated zero, with no records', async () => {
	renderRoute(dashboardLoader({ personalRecords: [] }), '/?tab=trends')

	const proofRegion = await screen.findByRole('region', {
		name: /proof · personal records/i,
	})
	expect(
		within(proofRegion).getByText(/no personal records yet/i),
	).toBeInTheDocument()
})

// ── History: the full Session Ledger ──

test('the History panel renders the session ledger heading', async () => {
	renderRoute(dashboardLoader(), '/?tab=history')
	await screen.findByRole('heading', { name: /session ledger/i })
})

test('session ledger lists completed past and planned future sessions', async () => {
	const ledger = [
		makeLedgerSession({
			id: 'past-1',
			scheduledAt: new Date('2030-01-01T08:00:00'),
			status: 'completed',
			tssValue: 65,
			workout: {
				id: 'w-past',
				title: 'Recovery Spin',
				description: null,
				discipline: 'bike',
				intent: 'recovery',
				blocks: [],
			},
			sessionLog: { id: 'log-1', rpe: 4 },
		}),
		makeLedgerSession({
			id: 'future-1',
			scheduledAt: new Date('2030-01-09T08:00:00'),
			status: 'scheduled',
			workout: {
				id: 'w-future',
				title: 'Threshold Intervals',
				description: null,
				discipline: 'run',
				intent: 'threshold',
				blocks: [],
			},
		}),
	]
	renderRoute(dashboardLoader({ ledger }), '/?tab=history')

	const ledgerRegion = await screen.findByRole('region', {
		name: /session ledger/i,
	})
	// The ledger renders the same rows as both a table (tablet and up) and
	// cards (below the tablet breakpoint, #182); CSS shows one per viewport, so
	// assert each variant carries the sessions.
	for (const variant of [
		within(ledgerRegion).getByTestId('session-ledger-table'),
		within(ledgerRegion).getByTestId('session-ledger-cards'),
	]) {
		expect(within(variant).getByText('Recovery Spin')).toBeInTheDocument()
		expect(within(variant).getByText('Threshold Intervals')).toBeInTheDocument()
		// The "Now" divider separates past from planned.
		expect(within(variant).getByText(/^now$/i)).toBeInTheDocument()
	}
})

test('session ledger shows the Plan Adherence band on the load cell', async () => {
	const ledger = [
		makeLedgerSession({
			id: 'over-1',
			scheduledAt: new Date('2030-01-01T08:00:00'),
			status: 'completed',
			tssValue: 120, // 120 / 100 = 1.2 → over
			plannedTssValue: 100,
			plannedTssConfidence: 'full',
			workout: {
				id: 'w-over',
				title: 'Overcooked Tempo',
				description: null,
				discipline: 'run',
				intent: 'tempo',
				blocks: [],
			},
			sessionLog: { id: 'log-over', rpe: 8 },
		}),
	]
	renderRoute(dashboardLoader({ ledger }), '/?tab=history')

	const ledgerRegion = await screen.findByRole('region', {
		name: /session ledger/i,
	})
	for (const variant of [
		within(ledgerRegion).getByTestId('session-ledger-table'),
		within(ledgerRegion).getByTestId('session-ledger-cards'),
	]) {
		expect(
			within(variant).getByLabelText(/Adherence: Over/i),
		).toBeInTheDocument()
	}
})

test('session ledger shows an empty state when there are no sessions', async () => {
	renderRoute(dashboardLoader(), '/?tab=history')
	await screen.findByText(/no sessions yet/i)
})

// ── the decision strip: Form + today's session + one honest action ──

test('the decision strip surfaces the next planned session with its single status-derived action', async () => {
	const ledger = [
		makeLedgerSession({
			id: 'today-1',
			scheduledAt: new Date('2030-01-02T18:00:00'),
			status: 'scheduled',
			plannedTssValue: 60,
			workout: {
				id: 'w-today',
				title: 'Tempo Intervals',
				description: null,
				discipline: 'run',
				intent: 'tempo',
				blocks: [],
			},
		}),
	]
	renderRoute(dashboardLoader({ ledger }))

	const strip = await screen.findByRole('region', {
		name: /today's decision/i,
	})
	expect(within(strip).getByText('Tempo Intervals')).toBeInTheDocument()
	// base-ui's Button renders the React Router Link as an anchor carrying
	// role="button", so the CTA is queried by that role. The label is the honest
	// Session Status CTA (#179): a scheduled session is *viewed* — the app never
	// promises to start or record one (in-app recording is a non-goal).
	expect(
		within(strip).getByRole('button', { name: /view session/i }),
	).toHaveAttribute('href', '/training/sessions/today-1')
	expect(
		within(strip).queryByRole('button', { name: /start session/i }),
	).not.toBeInTheDocument()
	// No duplicate session CTA anywhere else on the page.
	expect(screen.getAllByRole('button', { name: /view session/i })).toHaveLength(
		1,
	)
})

test('the decision strip shows an empty state when nothing is scheduled', async () => {
	renderRoute(dashboardLoader())
	const strip = await screen.findByRole('region', {
		name: /today's decision/i,
	})
	expect(within(strip).getByText(/nothing scheduled/i)).toBeInTheDocument()
})

test('the decision strip resolves a metric Intensity Target against the athlete thresholds', async () => {
	const ledger = [
		makeLedgerSession({
			id: 'today-1',
			scheduledAt: new Date('2030-01-02T18:00:00'),
			status: 'scheduled',
			workout: workoutWithTarget(
				JSON.stringify({ kind: 'pace', minSecPerKm: 245, maxSecPerKm: 255 }),
			),
		}),
	]
	renderRoute(dashboardLoader({ ledger, thresholds: RUN_THRESHOLDS }))

	const strip = await screen.findByRole('region', {
		name: /today's decision/i,
	})
	expect(within(strip).getByText('4:05–4:15 /km')).toBeInTheDocument()
})

test('the week timeline stop shows its resolved metric target', async () => {
	const ledger = [
		makeLedgerSession({
			id: 'fri-1',
			scheduledAt: new Date('2030-01-03T08:00:00'),
			status: 'scheduled',
			workout: workoutWithTarget(
				JSON.stringify({ kind: 'hrPct', ref: 'lthr', minPct: 95, maxPct: 99 }),
			),
		}),
	]
	renderRoute(dashboardLoader({ ledger, thresholds: RUN_THRESHOLDS }))

	const weekRegion = await screen.findByRole('region', { name: /this week/i })
	// 95–99% of LTHR 168 → 160–166 bpm.
	expect(within(weekRegion).getByText('160–166 bpm')).toBeInTheDocument()
})

test('the This week header spells out session progress in plain language (#181)', async () => {
	const ledger = [
		makeLedgerSession({
			id: 'mon-done',
			scheduledAt: new Date('2029-12-31T08:00:00'),
			status: 'completed',
			tssValue: 60,
		}),
		makeLedgerSession({
			id: 'fri-planned',
			scheduledAt: new Date('2030-01-03T08:00:00'),
			status: 'scheduled',
		}),
	]
	renderRoute(dashboardLoader({ ledger }))

	const weekRegion = await screen.findByRole('region', { name: /this week/i })
	expect(
		within(weekRegion).getByText(/1 of 2 sessions done/),
	).toBeInTheDocument()
	expect(within(weekRegion).queryByText(/1\/2 done/)).not.toBeInTheDocument()
})

test('the recent comparison surfaces a completed session with its adherence band', async () => {
	const ledger = [
		makeLedgerSession({
			id: 'recent-over',
			scheduledAt: new Date('2029-12-30T08:00:00'),
			status: 'completed',
			tssValue: 120,
			plannedTssValue: 100,
			workout: {
				id: 'w-recent',
				title: 'Big Saturday Ride',
				description: null,
				discipline: 'bike',
				intent: 'endurance',
				blocks: [],
			},
		}),
	]
	renderRoute(dashboardLoader({ ledger }))

	const recentRegion = await screen.findByRole('region', {
		name: /recent · planned vs actual/i,
	})
	expect(
		within(recentRegion).getByText('Big Saturday Ride'),
	).toBeInTheDocument()
	expect(
		within(recentRegion).getByLabelText(/Adherence: Over/i),
	).toBeInTheDocument()
})

// ── zones that left the home scroll (#184) ──

test('quick-start chips are gone from the home scroll — creation lives behind "+ New"', async () => {
	renderRoute(dashboardLoader())

	await screen.findByRole('heading', { name: /here's your week/i })
	expect(screen.queryByRole('link', { name: /^run$/i })).not.toBeInTheDocument()
	expect(
		screen.queryByRole('link', { name: /^ride$/i }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByText(/quick start a new session/i),
	).not.toBeInTheDocument()
	// The single creation entry point remains.
	expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
})

test('the reflections grid is gone from the home scroll (reflections live on session detail)', async () => {
	renderRoute(dashboardLoader())

	await screen.findByRole('heading', { name: /here's your week/i })
	expect(
		screen.queryByRole('heading', { name: /recent reflections/i }),
	).not.toBeInTheDocument()
})

// The decision strip absorbed the Coach card (its behaviour is exercised in
// depth in decision-strip.test.tsx); these route-level tests confirm the
// loader data flows into the strip on the dashboard.
test('decision strip shows building-baseline cold-start when TSB is untrustworthy', async () => {
	renderRoute(
		dashboardLoader({
			tsbTrust: { trustworthy: false, daysOfHistory: 12, requiredDays: 42 },
		}),
	)

	const strip = await screen.findByRole('region', {
		name: /today's decision/i,
	})
	expect(within(strip).getByText(/building baseline/i)).toBeInTheDocument()
	expect(within(strip).getByText(/day 12\/42/i)).toBeInTheDocument()
})

test('decision strip shows readiness label and signed TSB when trustworthy', async () => {
	renderRoute(
		dashboardLoader({
			current: { ctl: 50, atl: 43, tsb: 7 },
			tsbTrust: { trustworthy: true, daysOfHistory: 60, requiredDays: 42 },
		}),
	)

	const strip = await screen.findByRole('region', {
		name: /today's decision/i,
	})
	expect(within(strip).getByText('+7')).toBeInTheDocument()
	expect(within(strip).getByText('Fresh')).toBeInTheDocument()
	expect(
		within(strip).queryByText(/building baseline/i),
	).not.toBeInTheDocument()
})
