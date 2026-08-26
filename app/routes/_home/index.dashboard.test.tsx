/**
 * @vitest-environment jsdom
 *
 * The home screen: one bi-directional timeline anchored on today.
 *
 * This file replaces the tabbed-dashboard suite that stood here. The Cockpit's
 * tabs, fitness curve, Trends evidence, proof strip and week filmstrip are no
 * longer *on home* — the handoff replaces the whole composition with a hero, a
 * week strip and a stream — so the tests that asserted home rendered them have
 * gone with them. Their components keep their own tests
 * (`cockpit/presenter.test.ts`, `cockpit/decision-strip.test.tsx`); what is no
 * longer true, and so no longer asserted, is that *this route* shows them.
 *
 * What is tested here is the composition and what it says. The scroll behaviour
 * that defines the screen — the landing, the collapse threshold, the loading
 * window, the compensation — cannot be tested in jsdom, which reports every
 * `getBoundingClientRect()` as zero; that arithmetic lives in `anchoring.ts` and
 * is unit-tested there against real numbers. What jsdom *can* prove is the part
 * that must hold on first paint: the hero open, the pill absent, the strip
 * centred on this week, and the right week mounted.
 */
import { render, screen, within } from '@testing-library/react'
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

// ── the caps at both ends ─────────────────────────────────────────────────

test('the near end names the day the history starts', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [
				at(-7, { id: 'first', status: 'completed', tssValue: 40 }),
				TODAY_SESSION,
			],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(stream).toHaveTextContent(/nothing logged before 26 Dec/i)
	expect(stream).toHaveTextContent(/as far back as your history goes/i)
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
