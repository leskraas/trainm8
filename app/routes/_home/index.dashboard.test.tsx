/**
 * @vitest-environment jsdom
 *
 * The home screen: one bi-directional timeline anchored on today.
 *
 * This file replaces the tabbed-dashboard suite that stood here. The Cockpit's
 * tabs, fitness curve and week filmstrip are no longer *on home* — the handoff
 * replaces the whole composition with a hero, a week strip and a stream — so
 * the tests that asserted home rendered them have gone with them. Their
 * components keep their own tests (`cockpit/presenter.test.ts`,
 * `cockpit/decision-strip.test.tsx`); what is no longer true, and so no longer
 * asserted, is that *this route* shows them.
 *
 * What came back is the evidence rather than the composition (#496): the load
 * triad, the records, the week's adherence and the Week Replan line are panes
 * of the **Hero** now, built by the same presenters and asserted here as part
 * of what the screen says.
 *
 * What is tested here is the composition and what it says. The scroll behaviour
 * that defines the screen — the landing, the collapse threshold, the loading
 * window, the compensation — cannot be tested in jsdom, which reports every
 * `getBoundingClientRect()` as zero; that arithmetic lives in `anchoring.ts` and
 * is unit-tested there against real numbers. What jsdom *can* prove is the part
 * that must hold on first paint: the hero open, the pill absent, the strip
 * centred on this week, and the right week mounted.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import {
	createRoutesStub,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from 'react-router'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import {
	type WeeklyAdherence,
	type WeeklyLoad,
} from '#app/utils/load/adherence.ts'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import IndexRoute from './index.tsx'

// Home subscribes to the Live Imports Stream via an EventSource (#75, ADR 0049),
// which jsdom doesn't provide. Stub the hook so the render is deterministic.
vi.mock('remix-utils/sse/react', () => ({
	useEventSource: () => null,
}))

const DAY = 24 * 60 * 60 * 1000
// A fixed Wednesday at local noon — the timeline reads "today" off the loader's
// `now`, so anchoring fixtures to it keeps every week label deterministic.
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
			archetype: null,
			blocks: [],
		},
		recording: null,
		sessionLog: null,
		setLogs: [],
		...overrides,
	}
}

type Workout = NonNullable<LedgerSession['workout']>
type WorkoutBlock = Workout['blocks'][number]
type WorkoutStep = WorkoutBlock['steps'][number]
type Recording = NonNullable<LedgerSession['recording']>

function step(overrides: Partial<WorkoutStep> = {}): WorkoutStep {
	return {
		id: 'step-1',
		kind: 'cardio',
		notes: null,
		discipline: 'run',
		intensity: null,
		intensityHrMin: null,
		intensityHrMax: null,
		intensityPowerMin: null,
		intensityPowerMax: null,
		intensityPaceMin: null,
		intensityPaceMax: null,
		orderIndex: 0,
		durationSec: 3000,
		distanceM: null,
		verticalM: null,
		gradePct: null,
		cadenceRpmMin: null,
		cadenceRpmMax: null,
		rest: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
		...overrides,
	}
}

function blocks(steps: WorkoutStep[] = [step()]): WorkoutBlock[] {
	return [
		{
			id: 'block-1',
			name: 'Main',
			orderIndex: 0,
			repeatCount: 1,
			seriesRepeatCount: 1,
			betweenSeriesRestSec: null,
			sendOff: null,
			steps,
		},
	]
}

function recording(overrides: Partial<Recording> = {}): Recording {
	return {
		id: 'recording-1',
		discipline: 'run',
		durationSec: 3000,
		distanceM: 9200,
		startedAt: NOW,
		endedAt: NOW,
		phaseBarsJson: null,
		...overrides,
	}
}

/** A session `days` from `NOW`, keeping the same time of day. */
function at(
	days: number,
	overrides: Partial<LedgerSession> = {},
): LedgerSession {
	return makeLedgerSession({
		id: `session-${days}-${overrides.id ?? ''}`,
		scheduledAt: new Date(NOW.getTime() + days * DAY),
		...overrides,
	})
}

const RUN_THRESHOLDS: DisciplineThresholdMap = {
	run: {
		thresholdPaceSecPerKm: 240,
		lthr: 168,
		maxHr: 190,
		ftp: null,
		runPowerThresholdW: null,
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
		weeklyBuild?: WeeklyLoad[]
		sustained?: SustainedDeviation | null
		thresholds?: DisciplineThresholdMap
		personalRecords?: PersonalRecord[]
		weekReplan?: { outcome: string; reason: string } | null
		loadRecomputeNotice?: {
			kind: string
			ctlBefore: number
			ctlAfter: number
		} | null
		strengthCount?: { completed: number; planned: number } | null
	} = {},
) {
	// The loader's shape is unchanged by the re-composition (`index.test.ts`
	// guards it), even though the new screen reads fewer of its fields.
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
		loadRecomputeNotice: opts.loadRecomputeNotice ?? null,
		strengthCount: opts.strengthCount ?? null,
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
	action?: (args: ActionFunctionArgs) => Promise<unknown>,
) {
	const RouteComponent = (props: Record<string, unknown>) => (
		<IndexRoute {...(props as any)} />
	)
	const App = createRoutesStub([
		{
			path: '/',
			Component: RouteComponent,
			loader,
			action,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={[initialPath]} />)
}

/** A 12-week plan that began 4 weeks ago, so earlier weeks read as imported. */
function activePlanFixture(now: Date = NOW): ActivePlan {
	return {
		eventId: 'event-42',
		eventName: 'Spring Half Marathon',
		eventDate: new Date(now.getTime() + 8 * 7 * DAY),
		planStart: new Date(now.getTime() - 4 * 7 * DAY),
		phases: [
			{ name: 'Base', weeks: 4 },
			{ name: 'Build', weeks: 6 },
			{ name: 'Taper', weeks: 2 },
		],
		weeklyTss: Array<number>(12).fill(320),
		loadBasis: {
			tracks: [
				{
					discipline: 'run',
					currency: 'km',
					contributes: true,
					marker: 'derived',
				},
			],
			conventions: ['minutes-in-zone-per-session'],
			formulae: ['rTSS'],
			substitutions: [],
		},
	}
}

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
	// The strip centres a cell against the strip's own box; jsdom reports zero
	// layout, so give the elements a width to measure.
	Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
		configurable: true,
		get: () => 124,
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

// ── the unauthenticated surface is untouched ──────────────────────────────

test('unauthenticated user sees marketing landing page', async () => {
	renderRoute(marketingLoader())
	await screen.findByText(/the epic stack/i)
})

// ── the hero: today's session ─────────────────────────────────────────────

const TODAY_SESSION = at(0, {
	id: 'today',
	scheduledAt: new Date('2030-01-02T18:00:00'),
	plannedTssValue: 91,
	workout: {
		id: 'w-today',
		title: 'Threshold 4 × 8 min',
		description: null,
		discipline: 'run',
		intent: 'threshold',
		archetype: null,
		blocks: blocks([
			step({
				durationSec: 3720,
				intensityPaceMin: 245,
				intensityPaceMax: 252,
				intensityHrMax: 168,
			}),
		]),
	},
})

test("the hero is today's session, with its kicker, title and numbers", async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			activePlan: activePlanFixture(),
			thresholds: RUN_THRESHOLDS,
		}),
	)

	await screen.findByRole('heading', { name: 'Threshold 4 × 8 min', level: 1 })
	// The kicker: when, which discipline, and how far to race day.
	expect(
		screen.getByText(/today · run · 8 weeks to race day/i),
	).toBeInTheDocument()
	expect(screen.getByText('62 min')).toBeInTheDocument()
	expect(screen.getByText('91 TSS')).toBeInTheDocument()
})

test('the hero is open on first paint — the athlete must see today', async () => {
	// The collapse is measured from the landing position, not from zero, exactly
	// so that opening the screen does not open it collapsed.
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	await screen.findByRole('heading', { name: 'Threshold 4 × 8 min', level: 1 })
	// The collapsed header shows the title at 13px beside an Open button; the
	// open hero shows the h1. Only one of the two is ever rendered.
	expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument()
})

test('the hero CTA opens the session, with the label the presenter chose', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const cta = await screen.findByRole('link', { name: /view session/i })
	expect(cta).toHaveAttribute('href', `/training/sessions/${TODAY_SESSION.id}`)
})

test('the hero verdict never shows a Form number on a cold start', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			current: { ctl: 30, atl: 28, tsb: 2 },
			tsbTrust: { trustworthy: false, daysOfHistory: 9, requiredDays: 42 },
		}),
	)

	await screen.findByText(
		/your form reading is reliable after 42 days — day 9\/42\./i,
	)
	expect(screen.queryByText(/^Form \+/)).not.toBeInTheDocument()
})

test('the hero verdict states Form and its reading once trustworthy', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			current: { ctl: 62, atl: 58, tsb: 4 },
			tsbTrust: { trustworthy: true, daysOfHistory: 60, requiredDays: 42 },
		}),
	)

	await screen.findByText(/^Form \+4, /)
})

// ââ the hero names the day it is showing (#493) âââââââââââââââââââââââââââ
//
// Three fixtures, one per shape of today: still to come, completed, and empty.
// Friday's session is the same in all three, so the only thing that changes is
// what today itself holds â which is exactly what the heading has to be honest
// about.

const FRIDAY_SESSION = at(2, {
	id: 'friday',
	scheduledAt: new Date('2030-01-04T18:00:00'),
	plannedTssValue: 55,
	workout: {
		id: 'w-friday',
		title: 'Intervals 6 × 3 min',
		description: null,
		discipline: 'run',
		intent: 'vo2max',
		archetype: null,
		blocks: blocks([step({ durationSec: 3000 })]),
	},
})

const TODAY_DONE = at(0, {
	id: 'today-done',
	scheduledAt: new Date('2030-01-02T06:00:00'),
	status: 'completed',
	tssValue: 88,
	plannedTssValue: 91,
	recording: recording(),
	workout: {
		id: 'w-today-done',
		title: 'Tempo 3 × 10 min',
		description: null,
		discipline: 'run',
		intent: 'tempo',
		archetype: null,
		blocks: blocks([step({ durationSec: 3600 })]),
	},
})

test("today still to come: the kicker says today and the heading is today's session", async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION, FRIDAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	await screen.findByRole('heading', {
		name: 'Threshold 4 × 8 min',
		level: 1,
	})
	expect(screen.getByText(/^today · run/i)).toBeInTheDocument()
	// Nothing is demoted to a fact, because the headline is already today's.
	expect(screen.queryByText(/next up ·/i)).not.toBeInTheDocument()
})

test('today empty: the heading says so and the next session is a fact, not the headline', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [FRIDAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	await screen.findByRole('heading', { name: 'Nothing on today', level: 1 })
	expect(screen.getByText('Next up · Intervals 6 × 3 min')).toBeInTheDocument()
	// The kicker names Friday â the day the session is actually on.
	expect(screen.getByText(/^friday · run/i)).toBeInTheDocument()
	expect(screen.queryByText(/^today · /i)).not.toBeInTheDocument()
})

test("today completed: the hero says today is done rather than headlining Friday as today's", async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_DONE, FRIDAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	await screen.findByRole('heading', { name: 'Today is done', level: 1 })
	expect(screen.getByText('Next up · Intervals 6 × 3 min')).toBeInTheDocument()
	expect(screen.getByText(/^friday · run/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('heading', {
			name: 'Intervals 6 × 3 min',
			level: 1,
		}),
	).not.toBeInTheDocument()
})

test('nothing scheduled says so, and offers to plan one', async () => {
	renderRoute(dashboardLoader({ ledger: [at(-3, { status: 'completed' })] }))

	await screen.findByRole('heading', { name: /nothing scheduled/i, level: 1 })
	expect(screen.getByRole('link', { name: /plan a session/i })).toHaveAttribute(
		'href',
		'/training/sessions/new',
	)
})

test('the hero offers the season plan, since the tab bar that would carry it is not built', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const links = await screen.findAllByRole('link', { name: /season plan/i })
	expect(links[0]).toHaveAttribute('href', '/training/plan')
})

// ── the hero pages sideways (#496) ────────────────────────────────────────
//
// The rule the screen is explained by (ADR 0065 §8): the hero never moves in
// time, and the strip and the stream always do. So these ask two things of the
// pager — that all four facets of today are reachable, by dot and by key as
// well as by thumb; and that reaching them moves nothing else on the screen.
//
// The gesture itself is arithmetic and lives in `hero-pager.test.ts`, where a
// flick can be given a velocity. jsdom has no thumb.

const PANE_FIXTURES = {
	ledger: [TODAY_SESSION],
	current: { ctl: 62, atl: 58, tsb: 4 },
	tsbTrust: { trustworthy: true, daysOfHistory: 60, requiredDays: 42 },
	snapshots: [
		{ date: '2029-11-04', ctl: 51, atl: 44, tsb: 7 },
		{ date: '2030-01-02', ctl: 62, atl: 58, tsb: 4 },
	],
	weeklyAdherence: {
		ratio: 0.94,
		band: {
			label: 'On target',
			recommendation: 'matched the plan',
			tone: 'on-target',
		},
		sessionCount: 4,
		totalActual: 282,
		totalPlanned: 300,
	} as WeeklyAdherence,
	strengthCount: { completed: 2, planned: 3 },
	weekReplan: {
		outcome: 'adjusted',
		reason: 'Last week came in 62% of plan, so this week is 10% lighter.',
	},
	personalRecords: [
		{
			discipline: 'run' as const,
			kind: 'farthest' as const,
			value: 21_100,
			sessionId: 'session-1',
			achievedAt: new Date('2029-12-20T09:00:00'),
			previousValue: 10_000,
			delta: 11_100,
		},
	],
}

/** The pane on show: the one the pager has not marked `inert`. */
function showingPane() {
	const panes = screen
		.getAllByRole('group')
		.filter((node) => node.getAttribute('aria-roledescription') === 'slide')
	const showing = panes.filter((pane) => !pane.hasAttribute('inert'))
	// Exactly one, always: two would mean the fold and the pager disagree.
	expect(showing).toHaveLength(1)
	return showing[0]!
}

test('the hero is a pager of four panes, anchored on today', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	const pager = await screen.findByRole('group', { name: 'Today, four ways' })
	expect(pager).toHaveAttribute('aria-roledescription', 'carousel')
	const panes = within(pager)
		.getAllByRole('group')
		.map((pane) => pane.getAttribute('aria-label'))
	expect(panes).toEqual([
		'Today, pane 1 of 4',
		'Form, pane 2 of 4',
		'This week, pane 3 of 4',
		'Records, pane 4 of 4',
	])
	// It opens on today, whatever else it can be paged to.
	expect(showingPane()).toHaveAttribute('aria-label', 'Today, pane 1 of 4')
})

test('the strip carries a name and a role of its own', async () => {
	// Two swipeable bands, both announced: the strip navigates the season and the
	// pager does not, and a screen reader has to be able to tell them apart.
	renderRoute(dashboardLoader(PANE_FIXTURES))

	const strip = await screen.findByRole('region', {
		name: 'The season, week by week',
	})
	expect(strip).toBe(screen.getByTestId('week-strip'))
})

test('every pane is reachable without swiping — the dots are real buttons', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	const dots = within(await screen.findByTestId('hero-pane-dots')).getAllByRole(
		'button',
	)
	expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual([
		'Today',
		'Form',
		'This week',
		'Records',
	])

	for (const [index, name] of [
		'Form',
		'This week',
		'Records',
		'Today',
	].entries()) {
		await userEvent.click(screen.getByRole('button', { name }))
		expect(showingPane()).toHaveAttribute(
			'aria-label',
			`${name}, pane ${[2, 3, 4, 1][index]} of 4`,
		)
		expect(screen.getByRole('button', { name })).toHaveAttribute(
			'aria-current',
			'true',
		)
	}
})

test('the pager is keyboard-operable, and the arrow keys page it', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	const pager = await screen.findByRole('group', { name: 'Today, four ways' })
	pager.focus()
	expect(pager).toHaveFocus()

	await userEvent.keyboard('{ArrowRight}')
	expect(showingPane()).toHaveAttribute('aria-label', 'Form, pane 2 of 4')
	await userEvent.keyboard('{End}')
	expect(showingPane()).toHaveAttribute('aria-label', 'Records, pane 4 of 4')
	await userEvent.keyboard('{ArrowLeft}')
	expect(showingPane()).toHaveAttribute('aria-label', 'This week, pane 3 of 4')
	await userEvent.keyboard('{Home}')
	expect(showingPane()).toHaveAttribute('aria-label', 'Today, pane 1 of 4')
	// The ends hold rather than wrapping: a pager that loops has no ends to count.
	await userEvent.keyboard('{ArrowLeft}')
	expect(showingPane()).toHaveAttribute('aria-label', 'Today, pane 1 of 4')
})

test('a pane change is announced', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	const pager = await screen.findByRole('group', { name: 'Today, four ways' })
	const announcement = pager.parentElement!.querySelector('[aria-live]')!
	expect(announcement).toHaveTextContent('Today, pane 1 of 4')

	await userEvent.click(screen.getByRole('button', { name: 'This week' }))
	expect(announcement).toHaveTextContent('This week, pane 3 of 4')
})

test('paging the hero moves neither the strip nor the stream', async () => {
	// The hero never moves in time. Paging it is not navigation, so the week the
	// stream is parked in and the cell the strip marks are the same afterwards.
	const ledger = [-14, -7, 0].map((days) =>
		days === 0
			? TODAY_SESSION
			: at(days, { id: `s${days}`, status: 'completed', tssValue: 50 }),
	)
	renderRoute(dashboardLoader({ ...PANE_FIXTURES, ledger }))

	const strip = await screen.findByTestId('week-strip')
	const stream = screen.getByTestId('timeline-stream')
	const axes = () => ({
		activeCell: strip.querySelector('[aria-current="true"]')?.textContent,
		scrollLeft: strip.scrollLeft,
		scrollTop: stream.scrollTop,
		weeks: stream.querySelectorAll('[data-timeline-week]').length,
	})
	const before = axes()

	// `fireEvent` rather than `userEvent`, and nothing awaited in between: the
	// landing re-centres the strip on a ladder of timers (`anchoring.ts`), and a
	// timer cannot fire while no macrotask is awaited. So anything that moved
	// between these two readings moved because the hero was paged.
	fireEvent.click(screen.getByRole('button', { name: 'Records' }))
	fireEvent.click(screen.getByRole('button', { name: 'Form' }))

	expect(showingPane()).toHaveAttribute('aria-label', 'Form, pane 2 of 4')
	expect(axes()).toEqual(before)
})

// ── what the three re-homed panes say ─────────────────────────────────────

test('the Form pane brings the load triad back, as legend triggers (#181)', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	await userEvent.click(await screen.findByRole('button', { name: 'Form' }))
	const pane = showingPane()
	// The abbreviation is what is written; the accessible name is the full term.
	for (const term of ['Fitness (CTL)', 'Fatigue (ATL)', 'Form (TSB)']) {
		expect(within(pane).getByRole('button', { name: term })).toBeInTheDocument()
	}
	expect(within(pane).getByText('Fit')).toBeInTheDocument()
	expect(pane).toHaveTextContent('62')
	expect(pane).toHaveTextContent('58')
	// And the trend the triad is one day of, off the snapshots already loaded.
	expect(pane).toHaveTextContent('Fitness 51 → 62 since 4 Nov')
})

test('the Form pane refuses a Form number on a cold start, and says why', async () => {
	renderRoute(
		dashboardLoader({
			...PANE_FIXTURES,
			tsbTrust: { trustworthy: false, daysOfHistory: 12, requiredDays: 42 },
		}),
	)

	await userEvent.click(await screen.findByRole('button', { name: 'Form' }))
	const pane = showingPane()
	expect(pane).toHaveTextContent('Building baseline — day 12/42')
	// Fitness and Fatigue are averages of what was logged and still read.
	expect(pane).toHaveTextContent('62')
	expect(pane).toHaveTextContent('—')
})

test('the This week pane brings back adherence, the strength count and the replan line', async () => {
	renderRoute(
		dashboardLoader({ ...PANE_FIXTURES, activePlan: activePlanFixture() }),
	)

	await userEvent.click(
		await screen.findByRole('button', { name: 'This week' }),
	)
	const pane = showingPane()
	// Where the week sits in the plan, minus the clause its own heading carries.
	expect(pane).toHaveTextContent('Build 1')
	expect(pane).toHaveTextContent('On target · 94% of planned endurance load')
	expect(pane).toHaveTextContent('2 of 3 lifting sessions logged')
	const replan = within(pane).getByTestId('hero-week-replan')
	expect(replan).toHaveTextContent('This week adjusted')
	expect(replan).toHaveTextContent(
		'Last week came in 62% of plan, so this week is 10% lighter.',
	)
})

test('the Records pane brings the Proof Strip back', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	await userEvent.click(await screen.findByRole('button', { name: 'Records' }))
	const pane = showingPane()
	expect(pane).toHaveTextContent('Longest run')
	expect(pane).toHaveTextContent('21.1 km')
	expect(pane).toHaveTextContent('+11.1 km over your previous best')
})

test('no qualifying record says so rather than showing a zero', async () => {
	renderRoute(dashboardLoader({ ...PANE_FIXTURES, personalRecords: [] }))

	await userEvent.click(await screen.findByRole('button', { name: 'Records' }))
	expect(showingPane()).toHaveTextContent('No personal records yet')
})

// ── the header ────────────────────────────────────────────────────────────

test('the header names today and where in the plan today falls', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	await screen.findByText('Wed 2 Jan · week 5 of 12')
})

test('with no plan the header says only the date it knows', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	await screen.findByText('Wed 2 Jan')
})

// ── the week strip ────────────────────────────────────────────────────────

test('the strip renders the whole season, not a window over it', async () => {
	// Four weeks of history plus this one: the stream mounts three, the strip
	// shows five, because an overview with holes in it is not an overview.
	const ledger = [-28, -21, -14, -7, 0].map((days) =>
		at(days, { id: `s${days}`, status: 'completed', tssValue: 50 }),
	)
	renderRoute(dashboardLoader({ ledger }))

	const strip = await screen.findByTestId('week-strip')
	const cells = within(strip).getAllByRole('button')
	expect(cells).toHaveLength(5)
})

test('the strip marks the week the stream is parked in', async () => {
	const ledger = [-7, 0].map((days) =>
		at(days, { id: `s${days}`, status: 'completed', tssValue: 50 }),
	)
	renderRoute(dashboardLoader({ ledger }))

	const strip = await screen.findByTestId('week-strip')
	const active = within(strip)
		.getAllByRole('button')
		.filter((cell) => cell.getAttribute('aria-current') === 'true')
	expect(active).toHaveLength(1)
	// This week is 31 Dec – 6 Jan.
	expect(active[0]).toHaveTextContent('31 Dec – 6 Jan')
})

test('the strip states both ends of the season', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	const strip = await screen.findByTestId('week-strip')
	expect(strip).toHaveTextContent(/no earlier weeks/i)
	// Race day, at the far end.
	expect(strip).toHaveTextContent(/27 Feb race day/i)
})

test('tapping a strip cell outside the window loads that week into the stream', async () => {
	const ledger = [-28, -21, -14, -7, 0].map((days) =>
		at(days, {
			id: `s${days}`,
			status: 'completed',
			tssValue: 50,
			workout: {
				id: `w${days}`,
				title: `Session ${days}`,
				description: null,
				discipline: 'run',
				intent: 'endurance',
				archetype: null,
				blocks: blocks(),
			},
		}),
	)
	renderRoute(dashboardLoader({ ledger }))

	const stream = await screen.findByTestId('timeline-stream')
	// The initial window is one week either way, so the oldest week is not there.
	expect(within(stream).queryByText('Session -28')).not.toBeInTheDocument()

	const strip = screen.getByTestId('week-strip')
	const oldest = within(strip).getAllByRole('button')[0]!
	await userEvent.click(oldest)

	expect(within(stream).getByText('Session -28')).toBeInTheDocument()
})

// ── the stream ────────────────────────────────────────────────────────────

test('a week header carries its range, its phase and what happened in it', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [
				at(-1, {
					id: 'done',
					status: 'completed',
					tssValue: 48,
					plannedTssValue: 50,
				}),
				TODAY_SESSION,
			],
			activePlan: activePlanFixture(),
		}),
	)

	const header = await screen.findByRole('heading', {
		name: '31 December – 6 January',
		level: 2,
	})
	const block = header.closest('[data-timeline-week]')!
	expect(block).toHaveTextContent('Build 1 · This week')
	expect(block).toHaveTextContent('1 of 2 done · 48 of 141 TSS')
})

test("today's row carries the inline action and the chip that says where the day stands", async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	const row = within(stream).getByRole('link', { name: /threshold 4 × 8 min/i })
	expect(row).toHaveAttribute('href', `/training/sessions/${TODAY_SESSION.id}`)
	expect(row).toHaveTextContent('TODAY · NOT DONE YET')
	expect(row).toHaveTextContent('Open')
})

test('a completed row reads two kinds of load and names its band', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [
				at(-1, {
					id: 'done',
					status: 'completed',
					tssValue: 88,
					plannedTssValue: 91,
					recording: recording(),
					sessionLog: { id: 'log-1', rpe: 8 },
				}),
			],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	// Line 1 — what you did. Line 2 — what it cost.
	expect(
		within(stream).getByText('9.2 km · 50 min · 5:26 /km'),
	).toBeInTheDocument()
	expect(within(stream).getByText('RPE 8')).toBeInTheDocument()
	expect(
		within(stream).getByText('TSS 88 / 91 · ON TARGET'),
	).toBeInTheDocument()
})

test('an unplanned session says there is no plan to compare, never a percentage', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [
				at(-1, {
					id: 'unplanned',
					status: 'completed',
					source: 'recorded',
					tssValue: 24,
					recording: recording({ discipline: 'bike', distanceM: 14000 }),
					workout: null,
				}),
			],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(
		within(stream).getByText('UNPLANNED · NO PLAN TO COMPARE'),
	).toBeInTheDocument()
	expect(stream).not.toHaveTextContent(/%/)
})

test('a missed session invents nothing', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [at(-1, { id: 'missed', status: 'missed', plannedTssValue: 42 })],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(within(stream).getByText('Nothing recorded')).toBeInTheDocument()
	expect(within(stream).getByText('MISSED')).toBeInTheDocument()
})

test('a planned row is an instruction: line 1 ends in "planned", line 2 is the target', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [
				at(2, {
					id: 'future',
					plannedTssValue: 42,
					workout: {
						id: 'w-future',
						title: 'Easy run',
						description: null,
						discipline: 'run',
						intent: 'endurance',
						archetype: null,
						blocks: blocks([
							step({
								durationSec: 3000,
								intensityPaceMin: 325,
								intensityPaceMax: 340,
								intensityHrMax: 145,
							}),
						]),
					},
				}),
			],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(
		within(stream).getByText('50 min · 42 TSS planned'),
	).toBeInTheDocument()
	expect(
		within(stream).getByText('5:25–5:40 /km · under 145 bpm'),
	).toBeInTheDocument()
})

test('an imported week says so once, in its header, and its rows carry no chip', async () => {
	const plan = activePlanFixture()
	renderRoute(
		dashboardLoader({
			ledger: [
				at(-35, {
					id: 'imported',
					status: 'completed',
					tssValue: 61,
					plannedTssValue: 60,
					recording: recording(),
				}),
				TODAY_SESSION,
			],
			activePlan: plan,
		}),
	)

	// Reach the imported week through the strip: it is outside the initial window.
	const strip = await screen.findByTestId('week-strip')
	await userEvent.click(within(strip).getAllByRole('button')[0]!)

	const stream = screen.getByTestId('timeline-stream')
	const row = within(stream).getByRole('link', { name: /morning run/i })
	expect(row).not.toHaveTextContent(/ON TARGET/)
	expect(row).not.toHaveTextContent(/IMPORTED/)
	// With no chip to carry it, the load moves onto line 2.
	expect(row).toHaveTextContent('61 TSS')
	const header = within(stream).getByText(/before this plan · imported/i)
	expect(header).toBeInTheDocument()
})

test('a Replan Note rides as a quiet chip, verbatim (ADR 0025)', async () => {
	const note =
		'Last week ran 32% over plan and Form was −12 — softened this session ~24%.'
	renderRoute(
		dashboardLoader({
			ledger: [at(2, { id: 'eased', plannedTssValue: 34, replanReason: note })],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(within(stream).getByText(note)).toBeInTheDocument()
})

test('rows inside a week are chronological, whatever order they arrive in', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [
				at(1, { id: 'thu', workout: titled('w-thu', 'Thursday session') }),
				at(-1, {
					id: 'tue',
					status: 'completed',
					tssValue: 40,
					workout: titled('w-tue', 'Tuesday session'),
				}),
			],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	const titles = within(stream)
		.getAllByRole('link')
		.map((row) => row.textContent ?? '')
	expect(titles.findIndex((t) => t.includes('Tuesday'))).toBeLessThan(
		titles.findIndex((t) => t.includes('Thursday')),
	)
})

function titled(id: string, title: string): Workout {
	return {
		id,
		title,
		description: null,
		discipline: 'run',
		intent: 'endurance',
		archetype: null,
		blocks: blocks(),
	}
}

test('two sessions on one day sit under one date gutter, said once', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [
				at(0, {
					id: 'morning',
					scheduledAt: new Date('2030-01-02T06:30:00'),
					status: 'completed',
					tssValue: 40,
					workout: titled('w-morning', 'Morning ride'),
				}),
				at(0, {
					id: 'evening',
					scheduledAt: new Date('2030-01-02T18:00:00'),
					workout: titled('w-evening', 'Evening lift'),
				}),
			],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	const morning = within(stream).getByRole('link', { name: /morning ride/i })
	const evening = within(stream).getByRole('link', { name: /evening lift/i })
	// One row, two sessions: the day owns both, rather than the two of them being
	// unrelated rows that happen to share a date (ADR 0065 §1).
	const day = morning.parentElement!
	expect(evening.parentElement).toBe(day)
	// The gutter is the day's, so the date is stated once for both.
	expect(within(day).getAllByText('Wed')).toHaveLength(1)
	// And the landing anchor is that day — not whichever of its sessions came
	// first, which is what lets it survive a day with no sessions at all.
	expect(day).toHaveAttribute('data-timeline-today')
})

// ── the grid: every day from today forward is a row (#497) ────────────────

test('every day from today forward is a row, whether anything is on it or not', async () => {
	// NOW is Wednesday 2 January, so the rest of this week is Thursday through
	// Sunday — four cells the athlete can write into, with no plan and no
	// sessions anywhere near them.
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	for (const name of [
		'Add a workout on Thu 3',
		'Add a workout on Fri 4',
		'Add a workout on Sat 5',
		'Add a workout on Sun 6',
	]) {
		expect(within(stream).getByRole('button', { name })).toBeInTheDocument()
	}
	// And today is not one of them: it has a session on it.
	expect(
		within(stream).queryByRole('button', { name: /add a workout on wed 2/i }),
	).not.toBeInTheDocument()
})

// ── behind today, a run of empty days is one band (#500) ──────────────────

test('a run of empty days behind today is one band, and tapping it opens the days', async () => {
	// NOW is Wednesday 2 January, so Monday and Tuesday sit behind today with
	// nothing on them. Nine blank rows in front of the athlete's history read
	// worse than none, and the band states the fact they only imply (ADR 0065 §3).
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	const band = within(stream).getByRole('button', {
		name: '2 days with nothing logged, 31 December – 1 January',
	})
	expect(band).toHaveTextContent('2 days · nothing logged')
	expect(band).toHaveAttribute('aria-expanded', 'false')
	expect(
		within(stream).queryByRole('button', { name: /add a workout on mon/i }),
	).not.toBeInTheDocument()

	await userEvent.click(band)

	// Expanded, they are day rows like any other — the same add gesture a day
	// forward of today takes.
	expect(band).toHaveAttribute('aria-expanded', 'true')
	expect(
		within(stream).getByRole('button', { name: 'Add a workout on Mon 31' }),
	).toBeInTheDocument()
	expect(
		within(stream).getByRole('button', { name: 'Add a workout on Tue 1' }),
	).toBeInTheDocument()
})

test('a single empty day behind today is a day, not a one-day band', async () => {
	// Tuesday was trained and today is Wednesday, so Monday is a run of one —
	// and a band over one row says no more than the row does.
	renderRoute(
		dashboardLoader({
			ledger: [
				at(-1, { id: 'tue', status: 'completed', tssValue: 40 }),
				TODAY_SESSION,
			],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(
		within(stream).getByRole('button', { name: 'Add a workout on Mon 31' }),
	).toBeInTheDocument()
	expect(
		within(stream).queryByRole('button', { name: /nothing logged/i }),
	).not.toBeInTheDocument()
})

test('with nothing on today, today is still a row and still the anchor', async () => {
	// The rest-day dead end: with no session on today the stream used to have
	// nothing to land on, so it opened on last week, the hero measured its
	// collapse from zero and the pill could never render (ADR 0065 §1).
	renderRoute(
		dashboardLoader({
			ledger: [at(2, { id: 'friday', workout: titled('w-fri', 'Friday run') })],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	const today = within(stream).getByRole('button', {
		name: 'Add a workout on Wed 2',
	})
	expect(today.closest('[data-timeline-today]')).not.toBeNull()
})

test('an empty day is never called a rest day — nothing prescribes one', async () => {
	// `Rest day` is written only where the Plan Outline prescribes recovery, and
	// nothing in the model can: `rhythm` is week-granular, `trainableWeekdays` is
	// availability. So with a full plan running, every empty day is still blank
	// (ADR 0065 §4). The label's own rendering is covered in `stream.test.tsx`,
	// which is the only place it can be reached from.
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(
		within(stream).getAllByRole('button', { name: /add a workout on/i }).length,
	).toBeGreaterThan(0)
	expect(stream).not.toHaveTextContent(/rest day/i)
})

test('the strip’s dots and the stream’s rows agree about which days are empty', async () => {
	// Both axes are derived from one day list precisely so they cannot disagree
	// (ADR 0065, consequences), and every day dot now has a row it must match.
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	const thisWeek = screen
		.getByTestId('week-strip')
		.querySelector('[data-timeline-cell="2029-12-31"]')!
	for (const [weekday, date] of [
		['Thursday', 'Thu 3'],
		['Friday', 'Fri 4'],
		['Saturday', 'Sat 5'],
		['Sunday', 'Sun 6'],
	]) {
		expect(
			within(thisWeek as HTMLElement).getByTitle(`${weekday} — nothing`),
		).toBeInTheDocument()
		expect(
			within(stream).getByRole('button', { name: `Add a workout on ${date}` }),
		).toBeInTheDocument()
	}
	// And today, which has a session on it, is neither: the dot says today and
	// the row is that session.
	expect(
		within(thisWeek as HTMLElement).getByTitle('Wednesday — today'),
	).toBeInTheDocument()
	expect(
		within(stream).queryByRole('button', { name: /add a workout on wed/i }),
	).not.toBeInTheDocument()
})

test('every empty cell is a real button, not a clickable box', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	const cells = within(stream).getAllByRole('button', {
		name: /add a workout on/i,
	})
	expect(cells).toHaveLength(4)
	for (const cell of cells) {
		expect(cell.tagName).toBe('BUTTON')
		expect(cell).toHaveClass('min-h-11')
	}
})

// ── the caps at both ends ─────────────────────────────────────────────────

test("the near end states the query's reach, not the end of the athlete's history", async () => {
	// It used to say `Nothing logged before 26 Dec` over `This is as far back as
	// your history goes`. Home queries half a year, so that was the query's own
	// bound dressed up as a fact about the athlete's training (#500).
	renderRoute(
		dashboardLoader({
			ledger: [
				at(-7, { id: 'first', status: 'completed', tssValue: 40 }),
				TODAY_SESSION,
			],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(stream).toHaveTextContent(/home reads back to 4 Jul/i)
	expect(stream).toHaveTextContent(/26 weeks of it/i)
	expect(stream).toHaveTextContent(/earliest session in that reach is 26 Dec/i)
	expect(stream).toHaveTextContent(/older training is not on this screen/i)
	expect(stream).not.toHaveTextContent(/as far back as your history goes/i)
})

test('the far end says how far the plan is written, and offers to write the rest', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(stream).toHaveTextContent(/everything is written through 2 Jan/i)
	expect(stream).toHaveTextContent(/sketched, not written/i)
	expect(
		within(stream).getByRole('link', { name: /write the last 8 weeks/i }),
	).toHaveAttribute('href', '/training/plan')
})

// ── the back-to-today pill ────────────────────────────────────────────────

test('the pill is not visible on first paint — today is already in view', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	await screen.findByRole('heading', { name: 'Threshold 4 × 8 min', level: 1 })
	expect(
		screen.queryByRole('button', { name: /back to today/i }),
	).not.toBeInTheDocument()
})

// ── the destinations home still has to carry ──────────────────────────────

test('creation survives the re-composition: "+ New" is in the header', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	// #178's single creation menu. Losing it would leave an athlete with no way
	// to author a session from the screen they open the app on.
	await screen.findByRole('button', { name: /create/i })
})

test('the far end carries the destinations home only links to', async () => {
	// Programs and the Catalogue have no other way in at all (#471, #477), and
	// the bottom tab bar the design would have put them in is not built.
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const elsewhere = await screen.findByRole('navigation', {
		name: /elsewhere in trainm8/i,
	})
	expect(
		within(elsewhere).getByRole('link', { name: 'Events' }),
	).toHaveAttribute('href', '/training/events')
	expect(
		within(elsewhere).getByRole('link', { name: 'Catalogue' }),
	).toHaveAttribute('href', '/training/catalogue')
	expect(
		within(elsewhere).getByRole('link', { name: 'Programs' }),
	).toHaveAttribute('href', '/training/programs')
})

test('an athlete with no plan is offered one at the far end', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	expect(
		await screen.findByRole('link', { name: /plan a season/i }),
	).toHaveAttribute('href', '/training/plan/new')
})

// ── the re-composition: what left home ────────────────────────────────────

test('the tabbed dashboard is gone — home is one stream, not three panels', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	await screen.findByTestId('timeline-stream')
	expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
	expect(screen.queryByTestId('decision-strip')).not.toBeInTheDocument()
	expect(screen.queryByTestId('week-timeline')).not.toBeInTheDocument()
})

// ── the Load Recompute Notice (ADR 0046 §2): explaining the CTL drop ───────

const STRENGTH_NOTICE = {
	kind: 'strength-left-the-triad',
	ctlBefore: 62.4,
	ctlAfter: 47.8,
}

test('an outstanding notice explains the drop above the timeline', async () => {
	// It survives the re-composition deliberately: it is a one-shot explanation
	// of why a number the athlete had already read moved, and dropping it with
	// the tabs would have quietly retired an ADR obligation.
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			loadRecomputeNotice: STRENGTH_NOTICE,
		}),
	)

	const callout = await screen.findByTestId('load-recompute-notice')
	expect(callout).toHaveTextContent(/fitness recalculated/i)
	// The movement, in the same rounded units the triad shows.
	expect(callout).toHaveTextContent(/fitness fell by up to 15/i)
	// The cause, and that the athlete's own training is not what changed.
	expect(callout).toHaveTextContent(/strength sessions no longer count/i)
	expect(callout).toHaveTextContent(/your training hasn't changed/i)
})

test('no notice renders nothing — a dismissed correction stays dismissed', async () => {
	renderRoute(
		dashboardLoader({ ledger: [TODAY_SESSION], loadRecomputeNotice: null }),
	)

	await screen.findByTestId('timeline-stream')
	expect(screen.queryByTestId('load-recompute-notice')).not.toBeInTheDocument()
})

test('a recompute kind the app has no words for is silent, never vague copy', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			loadRecomputeNotice: { ...STRENGTH_NOTICE, kind: 'some-future-thing' },
		}),
	)

	await screen.findByTestId('timeline-stream')
	expect(screen.queryByTestId('load-recompute-notice')).not.toBeInTheDocument()
})

test('acknowledging the notice posts the dismiss intent for that kind only', async () => {
	const submitted: Array<Record<string, unknown>> = []
	const action = async ({ request }: ActionFunctionArgs) => {
		const formData = await request.formData()
		submitted.push(Object.fromEntries(formData))
		return { dismissed: true }
	}
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			loadRecomputeNotice: STRENGTH_NOTICE,
		}),
		'/',
		action,
	)

	await screen.findByTestId('load-recompute-notice')
	await userEvent.click(screen.getByRole('button', { name: /got it/i }))

	// The kind travels with the acknowledgement, so "got it" can never silence an
	// explanation the athlete hasn't seen.
	expect(submitted).toEqual([
		{
			intent: 'dismiss-load-recompute-notice',
			kind: 'strength-left-the-triad',
		},
	])
})
