/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
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
type RecentLog = {
	id: string
	content: string
	rpe: number | null
	session: { id: string; workout: { title: string } | null }
}

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
		recentLogs?: RecentLog[]
		ledger?: LedgerSession[]
		current?: LoadTriad | null
		snapshots?: LoadSnapshot[]
		tsbTrust?: TsbTrust
		activePlan?: ActivePlan | null
		weeklyAdherence?: WeeklyAdherence | null
		weeklyBuild?: Array<WeeklyAdherence | null>
		sustained?: SustainedDeviation | null
		thresholds?: DisciplineThresholdMap
	} = {},
) {
	return async (_args: LoaderFunctionArgs) => ({
		isAuthenticated: true as const,
		now: opts.now ?? NOW,
		recentLogs: opts.recentLogs ?? [],
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
	// elapsed → week 10, in the Peak phase (weeks 9–10), "16d" to go.
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
	)
	// Measured history still draws; only the forward projection is withheld.
	expect(
		await screen.findByText(/race-day projection unavailable/i),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('img', { name: /projection to race day/i }),
	).not.toBeInTheDocument()
})

test('the readiness banner shows the road-to-race context for an active plan', async () => {
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
	const planLink = await screen.findByRole('link', {
		name: /plan: spring half marathon/i,
	})
	expect(planLink).toHaveAttribute('href', '/training/events/event-42')
	expect(within(planLink).getByText('16d')).toBeInTheDocument()
	expect(within(planLink).getByText('W10')).toBeInTheDocument()
	expect(within(planLink).getByText(/peak/i)).toBeInTheDocument()
	expect(within(planLink).getByText('92%')).toBeInTheDocument()
})

test('week load renders honestly (—, no fabricated %) when adherence is unavailable', async () => {
	renderRoute(
		dashboardLoader({ activePlan: activePlanFixture(), weeklyAdherence: null }),
	)
	const planLink = await screen.findByRole('link', {
		name: /plan: spring half marathon/i,
	})
	expect(within(planLink).getByText('—')).toBeInTheDocument()
	expect(within(planLink).queryByText('%', { exact: false })).toBeNull()
})

test('dashboard renders the session ledger heading', async () => {
	renderRoute(dashboardLoader())
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
	renderRoute(dashboardLoader({ ledger }))

	const ledgerRegion = await screen.findByRole('region', {
		name: /session ledger/i,
	})
	expect(within(ledgerRegion).getByText('Recovery Spin')).toBeInTheDocument()
	expect(
		within(ledgerRegion).getByText('Threshold Intervals'),
	).toBeInTheDocument()
	// The "Now" divider separates past from planned.
	expect(within(ledgerRegion).getByText(/^now$/i)).toBeInTheDocument()
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
	renderRoute(dashboardLoader({ ledger }))

	// The same session appears in both the ledger and the Recent comparison,
	// so scope the assertion to the ledger region.
	const ledgerRegion = await screen.findByRole('region', {
		name: /session ledger/i,
	})
	expect(
		within(ledgerRegion).getByLabelText(/Adherence: Over/i),
	).toBeInTheDocument()
})

test("today's prescription surfaces the next planned session", async () => {
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

	const todayRegion = await screen.findByRole('region', { name: /^today$/i })
	expect(within(todayRegion).getByText('Tempo Intervals')).toBeInTheDocument()
	// base-ui's Button renders the React Router Link as an anchor carrying
	// role="button", so the CTA is queried by that role.
	expect(
		within(todayRegion).getByRole('button', { name: /start session/i }),
	).toHaveAttribute('href', '/training/sessions/today-1')
})

test('today zone shows an empty state when nothing is scheduled', async () => {
	renderRoute(dashboardLoader())
	const todayRegion = await screen.findByRole('region', { name: /^today$/i })
	expect(
		within(todayRegion).getByText(/nothing scheduled/i),
	).toBeInTheDocument()
})

test("today's card resolves a metric Intensity Target against the athlete thresholds", async () => {
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

	const todayRegion = await screen.findByRole('region', { name: /^today$/i })
	expect(within(todayRegion).getByText('4:05–4:15 /km')).toBeInTheDocument()
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

test('dashboard shows quick-start pills for all activity types', async () => {
	renderRoute(dashboardLoader())

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
	const logs: RecentLog[] = [
		{
			id: 'log-1',
			content: 'Felt strong on intervals',
			rpe: 7,
			session: { id: 'session-10', workout: { title: 'Tempo Run' } },
		},
	]
	renderRoute(dashboardLoader({ recentLogs: logs }))

	await screen.findByRole('heading', { name: /recent reflections/i })
	expect(screen.getByText('Felt strong on intervals')).toBeInTheDocument()
	expect(screen.getByText('RPE 7')).toBeInTheDocument()
})

test('dashboard hides recent reflections when no logs', async () => {
	renderRoute(dashboardLoader())

	await screen.findByRole('heading', { name: /here's your week/i })
	expect(
		screen.queryByRole('heading', { name: /recent reflections/i }),
	).not.toBeInTheDocument()
})

// The Form & load card (ADR 0017 + the compact-top fold-in) is reused verbatim
// as the Cockpit's Orient hero. Its behaviour is exercised in depth in
// form-load-card.test.tsx; these route-level tests confirm the loader data
// flows into the card on the dashboard.
test('form card shows building-baseline cold-start when TSB is untrustworthy', async () => {
	renderRoute(
		dashboardLoader({
			tsbTrust: { trustworthy: false, daysOfHistory: 12, requiredDays: 42 },
		}),
	)

	const card = await screen.findByRole('region', {
		name: /form and training load/i,
	})
	expect(within(card).getByText(/building baseline/i)).toBeInTheDocument()
	expect(within(card).getByText(/day 12\/42/i)).toBeInTheDocument()
})

test('form card shows readiness label and signed TSB when trustworthy', async () => {
	renderRoute(
		dashboardLoader({
			current: { ctl: 50, atl: 43, tsb: 7 },
			tsbTrust: { trustworthy: true, daysOfHistory: 60, requiredDays: 42 },
		}),
	)

	const card = await screen.findByRole('region', {
		name: /form and training load/i,
	})
	expect(within(card).getByText('+7')).toBeInTheDocument()
	expect(within(card).getByText('Fresh')).toBeInTheDocument()
	expect(within(card).queryByText(/building baseline/i)).not.toBeInTheDocument()
})

test('form card surfaces the supporting CTL/ATL numbers', async () => {
	renderRoute(
		dashboardLoader({
			current: { ctl: 45, atl: 38, tsb: 7 },
			tsbTrust: { trustworthy: true, daysOfHistory: 60, requiredDays: 42 },
		}),
	)

	const card = await screen.findByRole('region', {
		name: /form and training load/i,
	})
	expect(within(card).getByText('45')).toBeInTheDocument()
	expect(within(card).getByText('38')).toBeInTheDocument()
})

test('session ledger shows an empty state when there are no sessions', async () => {
	renderRoute(dashboardLoader())
	await screen.findByText(/no sessions yet/i)
})
