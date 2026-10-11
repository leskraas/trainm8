/**
 * @vitest-environment jsdom
 *
 * I dag: the top line, the season strip, and the list (ADR 0086).
 *
 * There is no hero any more. What it said about today — the session, its
 * action, the coach's line — is said in today's row, and its Form and Rekorder
 * panes moved to the Meg tab, where their own tests stand.
 *
 * What is tested here is the composition and what it says. The scroll
 * behaviour — the landing, the observers, the jumps — cannot be tested in
 * jsdom, which has no layout; the arithmetic is in `anchoring.test.ts` and the
 * wiring in `use-timeline-scroll.test.tsx`, and the real thing is driven in
 * `tests/e2e/home-timeline.test.ts`. What jsdom *can* prove is what must hold
 * on first paint: the pill at rest, the strip on this week, and every week
 * before today mounted.
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
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
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
		tsbTrust?: TsbTrust
		activePlan?: ActivePlan | null
		sustained?: SustainedDeviation | null
		thresholds?: DisciplineThresholdMap
		loadRecomputeNotice?: {
			kind: string
			ctlBefore: number
			ctlAfter: number
		} | null
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
		tsbTrust:
			opts.tsbTrust ??
			({ trustworthy: false, daysOfHistory: 0, requiredDays: 42 } as TsbTrust),
		activePlan: opts.activePlan ?? null,
		sustained: opts.sustained ?? null,
		thresholds: opts.thresholds ?? {},
		loadRecomputeNotice: opts.loadRecomputeNotice ?? null,
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
		// The composer reads its week and its lifts from resource routes once it
		// opens; with no plan here, the week has no tracks and the line names
		// nothing — what matters to these tests is that it opens at all.
		{
			path: '/resources/week-sum',
			loader: ({ request }) => ({
				day: new URL(request.url).searchParams.get('day'),
				week: null,
			}),
		},
		{
			path: '/resources/sentence-exercises',
			loader: () => ({ exercises: [] }),
		},
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

// ── today's row: what the hero used to say (ADR 0086) ─────────────────────

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

/** Today's row in the list: the day carrying the landing anchor. */
async function todayRow() {
	const stream = await screen.findByTestId('timeline-stream')
	return stream.querySelector<HTMLElement>('[data-timeline-today]')!
}

test('there is no hero: the list is all there is under the top line', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	await screen.findByTestId('timeline-stream')
	expect(screen.queryByTestId('hero-fold')).not.toBeInTheDocument()
	expect(screen.queryByTestId('hero-pager')).not.toBeInTheDocument()
	expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
})

test("today's row carries today's session, its action and the coach's line", async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			activePlan: activePlanFixture(),
			thresholds: RUN_THRESHOLDS,
			current: { ctl: 62, atl: 58, tsb: 4 },
			tsbTrust: { trustworthy: true, daysOfHistory: 60, requiredDays: 42 },
		}),
	)

	const row = await todayRow()
	expect(
		within(row).getByRole('link', { name: /threshold 4 × 8 min/i }),
	).toHaveAttribute('href', `/training/sessions/${TODAY_SESSION.id}`)
	expect(within(row).getByRole('link', { name: 'Se økta' })).toHaveAttribute(
		'href',
		`/training/sessions/${TODAY_SESSION.id}`,
	)
	// The coach's line is this week's sentence, in its header (ADR 0086).
	const week = row.closest<HTMLElement>('[data-timeline-week]')!
	expect(within(week).getByText(/^Form \+4, /)).toBeInTheDocument()
})

test("the coach's line never shows a Form number on a cold start", async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			current: { ctl: 30, atl: 28, tsb: 2 },
			tsbTrust: { trustworthy: false, daysOfHistory: 9, requiredDays: 42 },
		}),
	)

	const week = (await todayRow()).closest<HTMLElement>('[data-timeline-week]')!
	expect(
		within(week).getByText(/formen kan leses etter 42 dager — dag 9\/42\./i),
	).toBeInTheDocument()
	expect(within(week).queryByText(/^Form \+/)).not.toBeInTheDocument()
})

test('today empty: the row says so, offers to write one, and lends Friday no action', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [FRIDAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	const row = await todayRow()
	expect(row).toHaveTextContent('Ingenting i dag')
	expect(
		within(row).getByRole('button', { name: /legg inn en økt ons/i }),
	).toBeInTheDocument()
	// "Se økta" belongs to today's own session; Friday's is not today's.
	expect(
		screen.queryByRole('link', { name: 'Se økta' }),
	).not.toBeInTheDocument()
})

test("today done: today's row is the done session, and Friday is not headlined as today's", async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_DONE, FRIDAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	const row = await todayRow()
	expect(row).toHaveTextContent('Tempo 3 × 10 min')
	expect(row).not.toHaveTextContent('Intervals 6 × 3 min')
	expect(
		screen.queryByRole('link', { name: 'Se økta' }),
	).not.toBeInTheDocument()
})

// ── the top line ──────────────────────────────────────────────────────────

test('the top line names the plan and counts down to the race', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [TODAY_SESSION],
			activePlan: activePlanFixture(),
		}),
	)

	const top = await screen.findByTestId('timeline-top')
	expect(top).toHaveTextContent('Oppbygging · uke 5 av 12')
	expect(top).toHaveTextContent('Spring Half Marathon om 8 uker')
})

test('with no plan the top line says so and leads to Sesong', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const top = await screen.findByTestId('timeline-top')
	expect(top).toHaveTextContent('Ingen plan')
	expect(
		within(top).getByRole('link', { name: 'Lag en i Sesong' }),
	).toHaveAttribute('href', '/training/plan')
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

test('the "I dag" pill is on the top line, and quiet while today is in view', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const top = await screen.findByTestId('timeline-top')
	const pill = within(top).getByRole('button', { name: 'Gå til i dag' })
	expect(pill).toHaveAttribute('data-away', '0')
})

test('every week before today is mounted in full, and a strip tap jumps to one', async () => {
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
	// The whole past is mounted up front, and whole (ADR 0086): every closed
	// week with all its days and sessions, nothing behind a tap.
	expect(
		stream.querySelectorAll('[data-week-shape="past"]').length,
	).toBeGreaterThanOrEqual(4)
	expect(within(stream).getByText('Session -28')).toBeInTheDocument()
	expect(
		stream.querySelector('[data-timeline-fold], [data-timeline-band]'),
	).toBeNull()

	const strip = screen.getByTestId('week-strip')
	await userEvent.click(strip.querySelector('[data-timeline-cell]')!)
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
		name: /^Denne uka\s*·\s*31\. des – 6\. jan/,
		level: 2,
	})
	expect(header).toHaveTextContent(/^Denne uka · 31\. des – 6\. jan/)
	const block = header.closest('[data-timeline-week]')!
	expect(block).toHaveTextContent('Oppbygging · hard uke')
	// No track to read the week in, so it carries its sessions and load.
	expect(block).toHaveTextContent('1 av 2 gjort · 48 av 141 TSS')
})

test("today's row carries the inline action and the chip that says where the day stands", async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	const row = within(stream).getByRole('link', { name: /threshold 4 × 8 min/i })
	expect(row).toHaveAttribute('href', `/training/sessions/${TODAY_SESSION.id}`)
	expect(row).toHaveTextContent('I dag · ikke gjort ennå')
	// The action sits beside the row's link, never inside it (ADR 0086).
	expect(within(stream).getByRole('link', { name: 'Se økta' })).not.toBe(row)
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
		within(stream).getByText('9,2 km · 50 min · 5:26 /km'),
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
		within(stream).getByText('Utenfor planen · ingen plan å sammenligne med'),
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
	expect(within(stream).getByText('Ikke gjort')).toBeInTheDocument()
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
		'Forrige uke ble 32 % tyngre enn planlagt, og formen var −12. Denne økta ble gjort ca. 24 % kortere.'
	renderRoute(
		dashboardLoader({
			ledger: [at(2, { id: 'eased', plannedTssValue: 34, replanReason: note })],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(within(stream).getByText(note)).toBeInTheDocument()
})

test('a Replan Note stored in English before #505 round 2 reads in Norwegian', async () => {
	renderRoute(
		dashboardLoader({
			ledger: [
				at(2, {
					id: 'eased',
					plannedTssValue: 34,
					replanReason:
						'Last week ran 32% over plan and Form was −12 — softened this session ~24%.',
				}),
			],
		}),
	)

	const stream = await screen.findByTestId('timeline-stream')
	expect(
		within(stream).getByText(
			'Forrige uke ble 32 % tyngre enn planlagt, og formen var −12. Denne økta ble gjort ca. 24 % kortere.',
		),
	).toBeInTheDocument()
	expect(stream).not.toHaveTextContent(/Last week/)
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
	// Sunday — four cells the athlete can write into, each its own row (ADR
	// 0086, overriding #505 story 30's folded free days).
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	for (const name of [
		'Legg inn en økt tor 3',
		'Legg inn en økt fre 4',
		'Legg inn en økt lør 5',
		'Legg inn en økt søn 6',
	]) {
		expect(within(stream).getByRole('button', { name })).toHaveTextContent(
			'fri',
		)
	}
	// And today is not one of them: it has a session on it.
	expect(
		within(stream).queryByRole('button', { name: /legg inn en økt ons 2/i }),
	).not.toBeInTheDocument()
})

// ── behind today, every day is a row too (ADR 0086) ──────────────────────

test('the empty days behind today are rows like any other, never one band', async () => {
	// NOW is Wednesday 2 January, so Monday and Tuesday sit behind today with
	// nothing on them. Until ADR 0086 they read as `2 dager · ingenting
	// logget`; a calendar draws the two days.
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	expect(
		within(stream).getByRole('button', { name: 'Legg inn en økt man 31' }),
	).toBeInTheDocument()
	expect(
		within(stream).getByRole('button', { name: 'Legg inn en økt tir 1' }),
	).toBeInTheDocument()
	expect(
		within(stream).queryByRole('button', { name: /uten noe logget/i }),
	).not.toBeInTheDocument()
})

test('a single empty day behind today is a row like the rest', async () => {
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
	expect(
		within(stream).getAllByRole('button', { name: /legg inn en økt/i }).length,
	).toBeGreaterThan(0)
	expect(stream).not.toHaveTextContent(/rest day/i)
})

test('every empty cell is a real button, not a clickable box', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	const stream = await screen.findByTestId('timeline-stream')
	const cells = within(stream).getAllByRole('button', {
		name: /legg inn en økt/i,
	})
	// Monday, Tuesday, and Thursday to Sunday: every day but today's.
	expect(cells).toHaveLength(6)
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

	await screen.findByTestId('timeline-stream')
	expect(screen.getByRole('button', { name: 'Gå til i dag' })).toHaveAttribute(
		'data-away',
		'0',
	)
	expect(
		screen.queryByRole('button', { name: /gå (opp|ned) til i dag/i }),
	).not.toBeInTheDocument()
})

// ── the destinations home still has to carry ──────────────────────────────

test('creation survives the re-composition: “Ny økt” is on the top line', async () => {
	renderRoute(dashboardLoader({ ledger: [TODAY_SESSION] }))

	// I dag's one creation control (owner decision 6, ADR 0088): it opens the
	// composer on today. Losing it would leave an athlete with no way to author
	// a session from the screen they open the app on.
	const top = await screen.findByTestId('timeline-top')
	await userEvent.click(within(top).getByRole('button', { name: 'Ny økt' }))
	const composer = await screen.findByRole('dialog', { name: 'Ny økt' })
	expect(composer.querySelector('[data-composer]')).toHaveAttribute(
		'data-composer-day',
		'2030-01-02',
	)
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
