/**
 * @vitest-environment jsdom
 *
 * The home screen: one bi-directional timeline anchored on today.
 *
 * This file replaces the tabbed-dashboard suite that stood here. The Cockpit's
 * tabs, fitness curve and week filmstrip are no longer *on home* — the handoff
 * replaces the whole composition with a hero, a week strip and a stream — so
 * the tests that asserted home rendered them have gone with them; what is no
 * longer true, and so no longer asserted, is that *this route* shows them.
 * #499 finished the job — the components themselves are gone, and the
 * presenters that outlived them moved up to `_home/presenter.ts`, where their
 * own tests still stand.
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
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
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
type LoadSnapshot = { date: string; ctl: number }

function makeLedgerSession(
	overrides: Partial<LedgerSession> = {},
): LedgerSession {
	return {
		id: 'ledger-1',
		scheduledAt: new Date('2030-01-02T08:00:00'),
		status: 'scheduled',
		source: 'authored',
		adoptedAt: null,
		releasedAt: null,
		countsInNoTrack: false,
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
		linkAnsweredAt: null,
		unlinkedFromSessionId: null,
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
	// Exactly the loader's shape, field for field (`index.test.ts` guards the
	// real one): the screen now reads every field it is handed, so a fixture with
	// a spare in it would be the only place the retired series still existed.
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
		round: null,
		tracks: [],
		// Base and Build at 3:1, then the taper — the rhythm `weekRole` reads.
		weekRoles: [
			...(['loading', 'loading', 'loading', 'recovery'] as const),
			...(['loading', 'loading', 'loading', 'recovery'] as const),
			...(['loading', 'loading'] as const),
			...(['taper', 'taper'] as const),
		],
		fillsWeeks: false,
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
		screen.getByText(/i dag · løping · 8 uker til løpsdagen/i),
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
	expect(screen.queryByRole('link', { name: 'Åpne' })).not.toBeInTheDocument()
})

test('the hero CTA opens the session, with the label the presenter chose', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const cta = await screen.findByRole('link', { name: /se økta/i })
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

	await screen.findByText(/formen kan leses etter 42 dager — dag 9\/42\./i)
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
	expect(screen.getByText(/^i dag · løping/i)).toBeInTheDocument()
	// Nothing is demoted to a fact, because the headline is already today's.
	expect(screen.queryByText(/neste ·/i)).not.toBeInTheDocument()
})

test('today empty: the heading says so and the next session is a fact, not the headline', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [FRIDAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	await screen.findByRole('heading', { name: 'Ingenting i dag', level: 1 })
	expect(screen.getByText('Neste · Intervals 6 × 3 min')).toBeInTheDocument()
	// The kicker names Friday â the day the session is actually on.
	expect(screen.getByText(/^fredag · løping/i)).toBeInTheDocument()
	expect(screen.queryByText(/^i dag · /i)).not.toBeInTheDocument()
})

test("today completed: the hero says today is done rather than headlining Friday as today's", async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_DONE, FRIDAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	await screen.findByRole('heading', { name: 'I dag er gjort', level: 1 })
	expect(screen.getByText('Neste · Intervals 6 × 3 min')).toBeInTheDocument()
	expect(screen.getByText(/^fredag · løping/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('heading', {
			name: 'Intervals 6 × 3 min',
			level: 1,
		}),
	).not.toBeInTheDocument()
})

test('nothing scheduled says so, and offers to plan one', async () => {
	renderRoute(dashboardLoader({ ledger: [at(-3, { status: 'completed' })] }))

	await screen.findByRole('heading', { name: /ingenting planlagt/i, level: 1 })
	expect(
		screen.getByRole('link', { name: /planlegg en økt/i }),
	).toHaveAttribute('href', '/training/sessions/new')
})

test('the hero offers the season plan, since the tab bar that would carry it is not built', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const links = await screen.findAllByRole('link', { name: /sesongplan/i })
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
		{ date: '2029-11-04', ctl: 51 },
		{ date: '2030-01-02', ctl: 62 },
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

	const pager = await screen.findByRole('group', {
		name: 'I dag, på fire måter',
	})
	expect(pager).toHaveAttribute('aria-roledescription', 'carousel')
	const panes = within(pager)
		.getAllByRole('group')
		.map((pane) => pane.getAttribute('aria-label'))
	expect(panes).toEqual([
		'I dag, side 1 av 4',
		'Form, side 2 av 4',
		'Denne uka, side 3 av 4',
		'Rekorder, side 4 av 4',
	])
	// It opens on today, whatever else it can be paged to.
	expect(showingPane()).toHaveAttribute('aria-label', 'I dag, side 1 av 4')
})

test('the strip carries a name and a role of its own', async () => {
	// Two swipeable bands, both announced: the strip navigates the season and the
	// pager does not, and a screen reader has to be able to tell them apart.
	renderRoute(dashboardLoader(PANE_FIXTURES))

	// A toolbar with one tab stop: the season is a single stop in the tab
	// order, and the arrow keys move along it.
	const toolbar = await screen.findByRole('toolbar', {
		name: 'Sesongen, uke for uke',
	})
	expect(screen.getByTestId('week-strip')).toContainElement(toolbar)
	const tabbable = [...toolbar.querySelectorAll('button')].filter(
		(cell) => cell.tabIndex === 0,
	)
	expect(tabbable).toHaveLength(1)
})

test('every pane is reachable without swiping — the dots are real buttons', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	const dots = within(await screen.findByTestId('hero-pane-dots')).getAllByRole(
		'button',
	)
	expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual([
		'I dag',
		'Form',
		'Denne uka',
		'Rekorder',
	])

	for (const [index, name] of [
		'Form',
		'Denne uka',
		'Rekorder',
		'I dag',
	].entries()) {
		await userEvent.click(screen.getByRole('button', { name }))
		expect(showingPane()).toHaveAttribute(
			'aria-label',
			`${name}, side ${[2, 3, 4, 1][index]} av 4`,
		)
		expect(screen.getByRole('button', { name })).toHaveAttribute(
			'aria-current',
			'true',
		)
	}
})

test('the pager is keyboard-operable, and the arrow keys page it', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	const pager = await screen.findByRole('group', {
		name: 'I dag, på fire måter',
	})
	pager.focus()
	expect(pager).toHaveFocus()

	await userEvent.keyboard('{ArrowRight}')
	expect(showingPane()).toHaveAttribute('aria-label', 'Form, side 2 av 4')
	await userEvent.keyboard('{End}')
	expect(showingPane()).toHaveAttribute('aria-label', 'Rekorder, side 4 av 4')
	await userEvent.keyboard('{ArrowLeft}')
	expect(showingPane()).toHaveAttribute('aria-label', 'Denne uka, side 3 av 4')
	await userEvent.keyboard('{Home}')
	expect(showingPane()).toHaveAttribute('aria-label', 'I dag, side 1 av 4')
	// The ends hold rather than wrapping: a pager that loops has no ends to count.
	await userEvent.keyboard('{ArrowLeft}')
	expect(showingPane()).toHaveAttribute('aria-label', 'I dag, side 1 av 4')
})

test('a pane change is announced', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	const pager = await screen.findByRole('group', {
		name: 'I dag, på fire måter',
	})
	const announcement = pager.parentElement!.querySelector('[aria-live]')!
	expect(announcement).toHaveTextContent('I dag, side 1 av 4')

	await userEvent.click(screen.getByRole('button', { name: 'Denne uka' }))
	expect(announcement).toHaveTextContent('Denne uka, side 3 av 4')
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
		activeCell: strip
			.querySelector('[aria-current="true"]')
			?.getAttribute('aria-label'),
		scrollLeft: strip.scrollLeft,
		scrollTop: stream.scrollTop,
		weeks: stream.querySelectorAll('[data-timeline-week]').length,
	})
	const before = axes()

	// `fireEvent` rather than `userEvent`, and nothing awaited in between: the
	// landing settles on a ladder of timers (`anchoring.ts`), and a timer cannot
	// fire while no macrotask is awaited. So anything that moved between these
	// two readings moved because the hero was paged.
	fireEvent.click(screen.getByRole('button', { name: 'Rekorder' }))
	fireEvent.click(screen.getByRole('button', { name: 'Form' }))

	expect(showingPane()).toHaveAttribute('aria-label', 'Form, side 2 av 4')
	expect(axes()).toEqual(before)
})

// ── what the three re-homed panes say ─────────────────────────────────────

test('the Form pane brings the load triad back, as legend triggers (#181)', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	await userEvent.click(await screen.findByRole('button', { name: 'Form' }))
	const pane = showingPane()
	// The abbreviation is what is written; the accessible name is the full term.
	for (const term of ['Kondisjon (CTL)', 'Tretthet (ATL)', 'Form (TSB)']) {
		expect(within(pane).getByRole('button', { name: term })).toBeInTheDocument()
	}
	expect(within(pane).getByText('Kond')).toBeInTheDocument()
	expect(pane).toHaveTextContent('62')
	expect(pane).toHaveTextContent('58')
	// And the trend the triad is one day of, off the snapshots already loaded.
	expect(pane).toHaveTextContent('Kondisjon 51 → 62 siden 4. nov')
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
	expect(pane).toHaveTextContent('Bygger grunnlag — dag 12/42')
	// Fitness and Fatigue are averages of what was logged and still read.
	expect(pane).toHaveTextContent('62')
	expect(pane).toHaveTextContent('—')
})

test('the This week pane brings back adherence, the strength count and the replan line', async () => {
	renderRoute(
		dashboardLoader({ ...PANE_FIXTURES, activePlan: activePlanFixture() }),
	)

	await userEvent.click(
		await screen.findByRole('button', { name: 'Denne uka' }),
	)
	const pane = showingPane()
	// Where the week sits in the plan, minus the clause its own heading carries.
	expect(pane).toHaveTextContent('Build · hard uke')
	expect(pane).toHaveTextContent(
		'I rute · 94 % av planlagt utholdenhetsbelastning',
	)
	expect(pane).toHaveTextContent('2 av 3 styrkeøkter logget')
	const replan = within(pane).getByTestId('hero-week-replan')
	expect(replan).toHaveTextContent('Uka er justert')
	// The stored English reason of an older outcome is said in the pane's own
	// words rather than quoted (ADR 0081).
	expect(replan).toHaveTextContent(
		'Vi gjorde denne uka lettere etter uka som gikk.',
	)
})

test('the Records pane brings the Proof Strip back', async () => {
	renderRoute(dashboardLoader(PANE_FIXTURES))

	await userEvent.click(await screen.findByRole('button', { name: 'Rekorder' }))
	const pane = showingPane()
	expect(pane).toHaveTextContent('Lengste løpetur')
	expect(pane).toHaveTextContent('21.1 km')
	expect(pane).toHaveTextContent('+11.1 km over forrige beste')
})

test('no qualifying record says so rather than showing a zero', async () => {
	renderRoute(dashboardLoader({ ...PANE_FIXTURES, personalRecords: [] }))

	await userEvent.click(await screen.findByRole('button', { name: 'Rekorder' }))
	expect(showingPane()).toHaveTextContent('Ingen personlige rekorder ennå')
})

// ── the header ────────────────────────────────────────────────────────────

test('the header names today and where in the plan today falls', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	await screen.findByText('ons 2. jan · uke 5 av 12')
})

test('with no plan the header says only the date it knows', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	await screen.findByText('ons 2. jan')
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
	expect(strip.querySelectorAll('[data-timeline-cell]')).toHaveLength(5)
})

test('a strip bar is exactly as tall as its share of the season, never floored', async () => {
	// ADR 0066 §3: a bar's height is its value. With no plan the strip reads
	// load, so 50 TSS against the season's 100 is a bar half as tall.
	const ledger = [
		at(-7, { id: 'big', status: 'completed', tssValue: 100 }),
		at(-1, { id: 'small', status: 'completed', tssValue: 50 }),
	]
	renderRoute(dashboardLoader({ ledger }))

	const strip = await screen.findByTestId('week-strip')
	const bar = (key: string) =>
		strip.querySelector<HTMLElement>(
			`[data-timeline-cell="${key}"] [data-strip-bar]`,
		)!
	expect(bar('2029-12-24').style.height).toBe('100%')
	expect(bar('2029-12-31').style.height).toBe('50%')
})

test('the strip marks the week the stream is parked in', async () => {
	const ledger = [-7, 0].map((days) =>
		at(days, { id: `s${days}`, status: 'completed', tssValue: 50 }),
	)
	renderRoute(dashboardLoader({ ledger }))

	const strip = await screen.findByTestId('week-strip')
	const active = [...strip.querySelectorAll('[data-timeline-cell]')].filter(
		(cell) => cell.getAttribute('aria-current') === 'true',
	)
	expect(active).toHaveLength(1)
	// This week is 31 Dec – 6 Jan, and the strip names it the way the header does.
	expect(active[0]).toHaveAccessibleName(/^Denne uka, 31\. des – 6\. jan/)
	// And its frame sits over the weeks the stream is showing.
	expect(strip.querySelector('[data-strip-frame]')).not.toBeNull()
})

test('the "I dag" pill is there and quiet while today is in view', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const strip = await screen.findByTestId('week-strip')
	const pill = within(strip).getByRole('button', { name: 'Gå til i dag' })
	expect(pill).toHaveAttribute('data-away', '0')
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
	await userEvent.click(strip.querySelector('[data-timeline-cell]')!)

	// A closed week is folded, and a jump into one opens it: the jump asked to
	// see the week, not its one line.
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
		name: 'Denne uka 31. des – 6. jan',
		level: 2,
	})
	const block = header.closest('[data-timeline-week]')!
	expect(block).toHaveTextContent('Build · hard uke')
	// No track to read the week in, so it carries its sessions and load.
	expect(block).toHaveTextContent('1 av 2 gjort · 48 av 141 TSS')
})

test("today's row carries the inline action and the chip that says where the day stands", async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	const row = within(stream).getByRole('link', { name: /threshold 4 × 8 min/i })
	expect(row).toHaveAttribute('href', `/training/sessions/${TODAY_SESSION.id}`)
	expect(row).toHaveTextContent('I DAG · IKKE GJORT ENNÅ')
	expect(row).toHaveTextContent('Åpne')
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
	expect(within(stream).getByText('TSS 88 / 91 · I RUTE')).toBeInTheDocument()
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
		within(stream).getByText('UTENFOR PLANEN · INGEN PLAN Å SAMMENLIGNE MED'),
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
	expect(within(stream).getByText('Ingenting registrert')).toBeInTheDocument()
	expect(within(stream).getByText('IKKE GJORT')).toBeInTheDocument()
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
		within(stream).getByText('50 min · 42 TSS planlagt'),
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
	await userEvent.click(strip.querySelector('[data-timeline-cell]')!)

	const stream = screen.getByTestId('timeline-stream')
	const row = within(stream).getByRole('link', { name: /morning run/i })
	expect(row).not.toHaveTextContent(/I RUTE/)
	expect(row).not.toHaveTextContent(/IMPORTED/)
	// With no chip to carry it, the load moves onto line 2.
	expect(row).toHaveTextContent('61 TSS')
	const header = within(stream).getByText('før planen')
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
	// Read through the day's own mark rather than the parent: a planned row of
	// the athlete's own carries its "lås opp" beside it (#505 story 55).
	const day = morning.closest<HTMLElement>('[data-timeline-day]')!
	expect(evening.closest('[data-timeline-day]')).toBe(day)
	// The gutter is the day's, so the date is stated once for both.
	expect(within(day).getAllByText('ons')).toHaveLength(1)
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
	// Four free days in a row fold into one short row (#505 story 30), which
	// opens into the four cells.
	await userEvent.click(
		within(stream).getByRole('button', { name: /^4 ledige dager, / }),
	)
	for (const name of [
		'Legg inn en økt tor 3',
		'Legg inn en økt fre 4',
		'Legg inn en økt lør 5',
		'Legg inn en økt søn 6',
	]) {
		expect(within(stream).getByRole('button', { name })).toBeInTheDocument()
	}
	// And today is not one of them: it has a session on it.
	expect(
		within(stream).queryByRole('button', { name: /legg inn en økt ons 2/i }),
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
		name: '2 dager uten noe logget, 31. des – 1. jan',
	})
	expect(band).toHaveTextContent('2 dager · ingenting logget')
	expect(band).toHaveAttribute('aria-expanded', 'false')
	expect(
		within(stream).queryByRole('button', { name: /legg inn en økt man/i }),
	).not.toBeInTheDocument()

	await userEvent.click(band)

	// Expanded, they are day rows like any other — the same add gesture a day
	// forward of today takes.
	expect(band).toHaveAttribute('aria-expanded', 'true')
	expect(
		within(stream).getByRole('button', { name: 'Legg inn en økt man 31' }),
	).toBeInTheDocument()
	expect(
		within(stream).getByRole('button', { name: 'Legg inn en økt tir 1' }),
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
		within(stream).getByRole('button', { name: 'Legg inn en økt man 31' }),
	).toBeInTheDocument()
	expect(
		within(stream).queryByRole('button', { name: /uten noe logget/i }),
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
		name: 'Legg inn en økt ons 2',
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
	await userEvent.click(
		within(stream).getAllByRole('button', { name: /ledige dager/i })[0]!,
	)
	expect(
		within(stream).getAllByRole('button', { name: /legg inn en økt/i }).length,
	).toBeGreaterThan(0)
	expect(stream).not.toHaveTextContent(/rest day/i)
})

test('the free days ahead are one short row, and today is never folded into it', async () => {
	// Thursday to Sunday hold nothing, so they read as one row — a printed plan's
	// `4 ledige dager` — while today, which is the landing, stays its own row.
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	const free = within(stream).getByRole('button', {
		name: '4 ledige dager, 3.–6. jan — åpne for å legge inn en økt',
	})
	expect(free).toHaveTextContent('4 ledige dager')
	expect(free).toHaveAttribute('aria-expanded', 'false')
	expect(
		within(stream).getByRole('link', { name: /threshold 4 × 8 min/i }),
	).toBeInTheDocument()
})

test('every empty cell is a real button, not a clickable box', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	await userEvent.click(
		within(stream).getByRole('button', { name: /ledige dager/i }),
	)
	const cells = within(stream).getAllByRole('button', {
		name: /legg inn en økt/i,
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
	expect(stream).toHaveTextContent(/i dag leser tilbake til 4\. jul/i)
	expect(stream).toHaveTextContent(/26 uker av det/i)
	expect(stream).toHaveTextContent(
		/den første økta i den perioden er 26\. des/i,
	)
	expect(stream).toHaveTextContent(/eldre trening vises ikke her/i)
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
	// The season runs to the plan's last week now (#505 story 27), so the far
	// end is reached through the strip rather than sitting under this week.
	const cells = screen
		.getByTestId('week-strip')
		.querySelectorAll('[data-timeline-cell]')
	await userEvent.click(cells[cells.length - 1]!)
	expect(stream).toHaveTextContent(/alt er skrevet til og med 2\. jan/i)
	expect(stream).toHaveTextContent(/skissert, ikke skrevet/i)
	expect(
		within(stream).getByRole('link', { name: /skriv de siste 8 ukene/i }),
	).toHaveAttribute('href', '/training/plan')
})

// ── the back-to-today pill ────────────────────────────────────────────────

test('the pill does not point anywhere on first paint — today is already in view', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	await screen.findByRole('heading', { name: 'Threshold 4 × 8 min', level: 1 })
	expect(screen.getByRole('button', { name: 'Gå til i dag' })).toHaveAttribute(
		'data-away',
		'0',
	)
	expect(
		screen.queryByRole('button', { name: /gå (opp|ned) til i dag/i }),
	).not.toBeInTheDocument()
})

// ── the destinations home still has to carry ──────────────────────────────

test('creation survives the re-composition: "+ New" is in the header', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	// #178's single creation menu. Losing it would leave an athlete with no way
	// to author a session from the screen they open the app on.
	await screen.findByRole('button', { name: /lag ny/i })
})

test('the far end carries the destinations home only links to', async () => {
	// Programs and the Catalogue have no other way in at all (#471, #477), and
	// the bottom tab bar the design would have put them in is not built.
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const elsewhere = await screen.findByRole('navigation', {
		name: /andre steder i trainm8/i,
	})
	expect(
		within(elsewhere).getByRole('link', { name: 'Løp og arrangementer' }),
	).toHaveAttribute('href', '/training/events')
	expect(
		within(elsewhere).getByRole('link', { name: 'Katalog' }),
	).toHaveAttribute('href', '/training/catalogue')
	expect(
		within(elsewhere).getByRole('link', { name: 'Programmer' }),
	).toHaveAttribute('href', '/training/programs')
})

test('an athlete with no plan is offered the first run at the far end', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	expect(
		await screen.findByRole('link', { name: /planlegg en sesong/i }),
	).toHaveAttribute('href', '/start')
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
	expect(callout).toHaveTextContent(/kondisjonen er regnet ut på nytt/i)
	// The movement, in the same rounded units the triad shows.
	expect(callout).toHaveTextContent(/kondisjonen falt med opptil 15/i)
	// The cause, and that the athlete's own training is not what changed.
	expect(callout).toHaveTextContent(/styrkeøkter teller ikke lenger/i)
	expect(callout).toHaveTextContent(/treningen din er den samme/i)
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
	await userEvent.click(screen.getByRole('button', { name: /skjønner/i }))

	// The kind travels with the acknowledgement, so "got it" can never silence an
	// explanation the athlete hasn't seen.
	expect(submitted).toEqual([
		{
			intent: 'dismiss-load-recompute-notice',
			kind: 'strength-left-the-triad',
		},
	])
})
