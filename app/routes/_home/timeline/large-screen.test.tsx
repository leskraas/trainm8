/**
 * @vitest-environment jsdom
 *
 * I dag on a large screen (#505 story 60, ADR 0087): the season pane left of
 * the list — plan card, season table, compact curve — and the selected day
 * right of it, or in a Sheet between `lg` and `xl`.
 *
 * jsdom has no layout and no `matchMedia`, so the screen's width is stubbed
 * per test; the grid itself, the independent scrolling and the overflow are
 * driven in a real browser in `tests/e2e/home-large-screen.test.ts`. What is
 * proved here is what the panes say and how a pick travels: a row of the
 * table jumps the list, a click or focus in the list picks a day, and the pane
 * or the sheet follows without navigating.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { ComposerProvider } from './composer-context.tsx'
import { DayDetail } from './day-pane.tsx'
import { HomeTimeline, type HomeTimelineData } from './home-timeline.tsx'
import { buildTimelineSeason, type TimelineSeason } from './presenter.ts'
import { SeasonPane } from './season-pane.tsx'

const DAY = 24 * 60 * 60 * 1000
// Wednesday 20 February 2030, local noon: ISO week 8.
const NOW = new Date('2030-02-20T12:00:00')
const TODAY = '2030-02-20'
const THIS_MONDAY = '2030-02-18'

type Workout = NonNullable<LedgerSession['workout']>

function workout(km: number, title = 'Rolig tur'): Workout {
	return {
		id: `workout-${title}`,
		title,
		description: null,
		discipline: 'run',
		intent: 'endurance',
		archetype: null,
		activityKind: null,
		effortWord: null,
		blocks: [
			{
				id: 'block-1',
				name: 'Main',
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
						discipline: 'run',
						intensity: null,
						intensityHrMin: null,
						intensityHrMax: null,
						intensityPowerMin: null,
						intensityPowerMax: null,
						intensityPaceMin: null,
						intensityPaceMax: null,
						orderIndex: 0,
						durationSec: null,
						distanceM: km * 1000,
						verticalM: null,
						gradePct: null,
						cadenceRpmMin: null,
						cadenceRpmMax: null,
						rest: null,
						exerciseId: null,
						restBetweenSetsSec: null,
						exercise: null,
						sets: [],
					},
				],
			},
		],
	}
}

/** A session `days` from today: planned ahead (or today), done behind. */
function on(
	days: number,
	overrides: Partial<LedgerSession> = {},
): LedgerSession {
	const at = new Date(NOW.getTime() + days * DAY)
	const done = days < 0
	return {
		id: `session-${days}`,
		scheduledAt: at,
		status: done ? 'completed' : 'scheduled',
		source: 'authored',
		adoptedAt: null,
		releasedAt: null,
		countsInNoTrack: false,
		tssValue: done ? 50 : null,
		plannedTssValue: 50,
		plannedTssConfidence: 'full',
		replanReason: null,
		workout: workout(8),
		recording: done
			? {
					id: `recording-${days}`,
					discipline: 'run',
					durationSec: 3000,
					distanceM: 8200,
					startedAt: at,
					endedAt: at,
					phaseBarsJson: null,
					linkAnsweredAt: null,
					unlinkedFromSessionId: null,
				}
			: null,
		sessionLog: null,
		setLogs: [],
		...overrides,
	}
}

const RUN_TARGETS = [30, 33, 36, 27, 40, 44, 48, 36, 50, 54, 30, 20]

/** Twelve weeks toward a race, begun four weeks back, read in km. */
function plan(overrides: Partial<ActivePlan> = {}): ActivePlan {
	return {
		eventId: 'event-1',
		eventName: 'Vårhalvmaraton',
		eventDate: new Date(NOW.getTime() + 7 * 7 * DAY + 4 * DAY),
		planStart: new Date(NOW.getTime() - 4 * 7 * DAY),
		phases: [
			{ name: 'Grunntrening', weeks: 4 },
			{ name: 'Oppbygging', weeks: 6 },
			{ name: 'Nedtrapping', weeks: 2 },
		],
		weeklyTss: Array<number>(12).fill(300),
		round: null,
		tracks: [
			{
				trackId: 'track-run',
				discipline: 'run',
				currency: 'km',
				targets: RUN_TARGETS,
				overridden: RUN_TARGETS.map(() => false),
				sessionTargets: null,
			},
		],
		weekRoles: [
			...(['loading', 'loading', 'loading', 'recovery'] as const),
			...(['loading', 'loading', 'loading', 'recovery'] as const),
			...(['loading', 'loading'] as const),
			...(['taper', 'taper'] as const),
		],
		fillsWeeks: true,
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
		...overrides,
	}
}

const OPEN_ENDED = plan({
	eventId: null,
	eventName: null,
	eventDate: null,
	phases: [
		{ name: 'Blokk 1', weeks: 4 },
		{ name: 'Blokk 2', weeks: 4 },
	],
	round: 2,
})

const LEDGER = [on(-8), on(-1), on(0, { id: 'today' }), on(2, { id: 'ahead' })]

function season(
	activePlan: ActivePlan | null,
	ledger = LEDGER,
): TimelineSeason {
	return buildTimelineSeason({ ledger, now: NOW, timezone: 'UTC', activePlan })
}

function inRouter(node: React.ReactNode) {
	const App = createRoutesStub([
		{
			// The writing line names lifts against the exercise catalogue (ADR 0089).
			path: '/resources/sentence-exercises',
			loader: () => ({ exercises: [] }),
		},
		{
			// The writing line reads the day's week as it opens; an empty plan
			// keeps its own preview out of these tests.
			path: '/resources/week-sum',
			loader: ({ request }) => ({
				day: new URL(request.url).searchParams.get('day'),
				week: {
					weekName: 'Denne uka',
					volumes: { weekKey: THIS_MONDAY, tracks: [], other: null },
				},
			}),
		},
		{ path: '/', Component: () => node },
	])
	return render(<App initialEntries={['/']} />)
}

// ---------------------------------------------------------------------------
// The season pane
// ---------------------------------------------------------------------------

function renderPane(
	activePlan: ActivePlan | null,
	{ onJump = vi.fn(), onToday = vi.fn() } = {},
) {
	const s = season(activePlan)
	inRouter(
		<SeasonPane
			season={s}
			frame={{ from: THIS_MONDAY, to: THIS_MONDAY }}
			onJump={onJump}
			onToday={onToday}
		/>,
	)
	return { season: s, onJump, onToday }
}

describe('the season pane', () => {
	test('the table numbers weeks as the calendar does, outlines this one and marks the horizon once', async () => {
		const onJump = vi.fn()
		renderPane(plan(), { onJump })
		const table = screen.getByRole('table', { name: 'Sesongtabell' })
		const rows = within(table).getAllByRole('row').slice(1)
		// The plan's twelve weeks, and the horizon's row among them.
		const weekRows = rows.filter((row) => row.hasAttribute('data-season-row'))
		expect(weekRows).toHaveLength(12)
		expect(within(weekRows[0]!).getByRole('button').textContent).toBe(
			String(isoWeekNumber('2030-01-21')),
		)
		// This week: ISO week 8, outlined, and named the way the list names it.
		const now = table.querySelector('[aria-current="date"]')!
		expect(now).toHaveAttribute('data-season-row', THIS_MONDAY)
		expect(within(now as HTMLElement).getByRole('button')).toHaveAccessibleName(
			/^Gå til Uke 8, /,
		)
		// Its rhythm and its target beside what was done: `mål · gjort`.
		expect(now).toHaveTextContent('hard uke')
		expect(
			within(now as HTMLElement).getByRole('cell', {
				name: /^Løping: mål 40 km, gjort /,
			}),
		).toBeInTheDocument()
		const horizon = table.querySelectorAll('[data-season-horizon]')
		expect(horizon).toHaveLength(1)
		expect(horizon[0]).toHaveTextContent(
			'horisont · økter fylles hit, videre bare mål',
		)
		// A row jumps the list to its week, once per press.
		await userEvent.click(within(weekRows[6]!).getByRole('button'))
		expect(onJump).toHaveBeenCalledTimes(1)
		expect(onJump).toHaveBeenCalledWith(
			weekRows[6]!.getAttribute('data-season-row'),
		)
	})

	test('the plan card says the race, its countdown and the way back to today', async () => {
		const { season: s, onToday } = renderPane(plan())
		const card = screen.getByRole('region', { name: 'Planen' })
		expect(card).toHaveTextContent('Vårhalvmaraton')
		expect(card).toHaveTextContent(s.topLine.goal!.when)
		await userEvent.click(
			within(card).getByRole('button', { name: 'Gå til i dag' }),
		)
		expect(onToday).toHaveBeenCalledTimes(1)
	})

	test('an open-ended plan reads “blokk n av ∞”, never a race (ADR 0079)', () => {
		renderPane(OPEN_ENDED)
		const card = screen.getByRole('region', { name: 'Planen' })
		expect(card).toHaveTextContent(/blokk 2 av ∞/i)
		expect(card).not.toHaveTextContent('⚑')
		expect(card).toHaveAttribute('data-plan-card', 'open-ended')
	})

	test('with no plan the card says so and leads to Sesong, and the table reads load', () => {
		renderPane(null)
		const card = screen.getByRole('region', { name: 'Planen' })
		expect(card).toHaveTextContent('Ingen plan ennå')
		expect(
			within(card).getByRole('link', { name: 'Lag en i Plan' }),
		).toHaveAttribute('href', '/training/plan')
		const table = screen.getByRole('table', { name: 'Sesongtabell' })
		expect(within(table).getAllByRole('columnheader')[2]).toHaveTextContent(
			'TSS',
		)
		expect(table.querySelector('[data-season-horizon]')).toBeNull()
	})

	test('the curve is Norwegian, names what it draws, and carries every week in its table', () => {
		renderPane(plan())
		expect(
			screen.getByRole('img', {
				name: 'Løping (km): ukemål som linje, gjort som søyler, i dag og horisont markert',
			}),
		).toBeInTheDocument()
		const data = screen.getByRole('table', { name: 'Løping, uke for uke' })
		expect(within(data).getAllByRole('row')).toHaveLength(13)
		expect(
			within(data)
				.getAllByRole('columnheader')
				.map((h) => h.textContent),
		).toEqual(['Uke', 'mål (km)', 'gjort (km)'])
		const curve = document.querySelector('[data-season-curve]')!
		expect(curve.querySelector('[data-curve-today]')).not.toBeNull()
		expect(curve.querySelector('[data-curve-horizon]')).not.toBeNull()
		expect(curve.querySelector('[data-curve-target]')).not.toBeNull()
		// Nothing English is left on it.
		expect(curve.textContent).not.toMatch(/season|week|layers|read in/i)
	})
})

// ---------------------------------------------------------------------------
// The day pane
// ---------------------------------------------------------------------------

function renderDay(dayKey: string, ledger = LEDGER) {
	const s = season(plan(), ledger)
	inRouter(
		<ComposerProvider
			prefill="run"
			thresholds={{}}
			todayKey={s.todayKey}
			minDayKey="2029-08-01"
			container="pane"
		>
			<DayDetail
				weeks={s.weeks}
				dayKey={dayKey}
				todayKey={s.todayKey}
				minWriteKey="2029-08-01"
				today={null}
				headingId="day"
			/>
		</ComposerProvider>,
	)
}

describe('the day pane', () => {
	test('today’s planned session: its figures, its status, whose it is, and its actions', () => {
		renderDay(TODAY)
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
			'onsdag 20. feb · i dag',
		)
		const card = screen.getByRole('article', { name: 'Rolig tur' })
		expect(card).toHaveTextContent('planlagt')
		expect(card).toHaveTextContent('din økt')
		expect(card).toHaveTextContent('8 km')
		expect(
			within(card).getByRole('link', { name: 'Rediger Rolig tur' }),
		).toHaveAttribute('href', '/training/sessions/today')
		expect(
			within(card).getByRole('button', { name: 'Lås opp Rolig tur' }),
		).toBeInTheDocument()
	})

	test('a done session opens to be seen, and offers no lock', () => {
		renderDay('2030-02-19')
		const card = screen.getByRole('article', { name: 'Rolig tur' })
		expect(card).toHaveTextContent('gjort')
		expect(
			within(card).getByRole('link', { name: 'Se økta Rolig tur' }),
		).toBeInTheDocument()
		expect(within(card).queryByRole('button', { name: /^Lås opp/ })).toBeNull()
	})

	test('a free day says so, and the composer is there for that day (ADR 0088)', () => {
		renderDay('2030-02-21')
		expect(screen.getByText('Ingen økt · fri.')).toBeInTheDocument()
		// The same composer every "+" opens on a phone, inline: the day is the
		// pane's, so it shows no day strip of its own.
		const composer = document.querySelector('[data-composer="pane"]')!
		expect(composer).toHaveAttribute('data-composer-day', '2030-02-21')
		expect(composer.querySelector('[data-composer-date]')).toBeNull()
		expect(
			within(composer as HTMLElement).getByRole('button', {
				name: 'Legg til 45 min Z2',
			}),
		).toBeInTheDocument()
		// The week's zones close the pane, named by its ISO week.
		expect(
			screen.getByRole('heading', { name: 'Uke 8 i soner' }),
		).toBeInTheDocument()
	})
})

// ---------------------------------------------------------------------------
// The whole screen, wide: a pick in the list reaches the pane
// ---------------------------------------------------------------------------

/** Stub the screen's width for `matchMedia('(min-width: …px)')`. */
function screenWidth(width: number) {
	vi.stubGlobal('matchMedia', (query: string) => {
		const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
		return {
			matches: width >= min,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}
	})
}

function homeData(): HomeTimelineData {
	return {
		now: NOW,
		ledger: LEDGER,
		current: null,
		tsbTrust: { trustworthy: false, daysOfHistory: 0, requiredDays: 42 },
		activePlan: plan(),
		sustained: null,
		nudge: { outcome: 'none' } as SessionNudge,
		thresholds: {},
		loadRecomputeNotice: null,
		stampDiscipline: 'run',
	}
}

function dayRow(key: string) {
	return document.querySelector<HTMLElement>(`[data-timeline-day="${key}"]`)!
}

describe('picking a day in the list', () => {
	beforeEach(() => {
		// The stream reads `scrollTo`; jsdom has none.
		Element.prototype.scrollTo = () => {}
	})
	afterEach(() => vi.unstubAllGlobals())

	test('≥1280: a click on a row’s gutter, or focus in a row, shows that day beside the list', async () => {
		screenWidth(1440)
		inRouter(<HomeTimeline data={homeData()} />)
		const pane = await waitFor(() => {
			const el = document.querySelector<HTMLElement>('[data-day-pane]')!
			expect(el.querySelector('[data-day-detail]')).not.toBeNull()
			return el
		})
		expect(pane).toHaveAccessibleName('onsdag 20. feb · i dag')
		expect(dayRow(TODAY)).toHaveAttribute('data-day-selected')

		// The date gutter of Friday: a click on the row, not on a control.
		await userEvent.click(within(dayRow('2030-02-22')).getAllByText('22')[0]!)
		expect(pane).toHaveAccessibleName('fredag 22. feb')
		expect(dayRow('2030-02-22')).toHaveAttribute('data-day-selected')
		expect(dayRow(TODAY)).not.toHaveAttribute('data-day-selected')

		// Focus follows for a keyboard: tabbing onto Thursday's empty cell.
		within(dayRow('2030-02-21')).getByRole('button').focus()
		await waitFor(() => expect(pane).toHaveAccessibleName('torsdag 21. feb'))

		// The free day's "+" picks the day and hands its composer the line —
		// one composer, beside the list; nothing opens in the row and no Drawer
		// comes up over it (the double-open the audit found).
		await userEvent.click(within(dayRow('2030-02-21')).getByRole('button'))
		await waitFor(() =>
			expect(pane.querySelector('[data-composer-input]')).toHaveFocus(),
		)
		expect(pane.querySelector('[data-composer]')).toHaveAttribute(
			'data-composer-day',
			'2030-02-21',
		)
		expect(document.querySelectorAll('[data-composer]')).toHaveLength(1)
		expect(screen.queryByRole('dialog')).toBeNull()

		// The season pane sits left of the list, Norwegian, and the old chart
		// is gone.
		const seasonPane = screen.getByRole('complementary', { name: 'Sesongen' })
		expect(
			within(seasonPane).getByRole('table', { name: 'Sesongtabell' }),
		).toBeInTheDocument()
		expect(document.body.textContent).not.toMatch(/Your season|Read in|Layers/)
	})

	test('1024–1279: the day opens in a sheet from a row’s gutter or `I`, never from its controls', async () => {
		screenWidth(1100)
		inRouter(<HomeTimeline data={homeData()} />)
		await waitFor(() =>
			expect(
				screen.getByRole('complementary', { name: 'Sesongen' }),
			).toHaveTextContent('Sesongtabell'),
		)
		// No third column: the day pane's card holds nothing.
		expect(document.querySelector('[data-day-detail]')).toBeNull()

		// The empty cell's "+" opens the day's sheet, with its composer in it.
		await userEvent.click(within(dayRow('2030-02-21')).getByRole('button'))
		const composing = await screen.findByRole('dialog')
		expect(composing).toHaveAccessibleName('Dagen: torsdag 21. feb')
		expect(composing.querySelector('[data-composer="pane"]')).toHaveAttribute(
			'data-composer-day',
			'2030-02-21',
		)
		await userEvent.click(
			within(composing).getByRole('button', { name: 'Lukk' }),
		)
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

		// The gutter opens the sheet on that day.
		await userEvent.click(within(dayRow('2030-02-22')).getAllByText('22')[0]!)
		const sheet = await screen.findByRole('dialog')
		expect(sheet).toHaveAccessibleName('Dagen: fredag 22. feb')
		await userEvent.click(within(sheet).getByRole('button', { name: 'Lukk' }))
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

		// `I` on a focused row opens it for a keyboard.
		const ahead = within(dayRow('2030-02-24')).getByRole('button')
		ahead.focus()
		await userEvent.keyboard('i')
		expect(await screen.findByRole('dialog')).toHaveAccessibleName(
			'Dagen: søndag 24. feb',
		)
	})

	test('below 1024 nothing listens and nothing is marked', async () => {
		screenWidth(390)
		inRouter(<HomeTimeline data={homeData()} />)
		await userEvent.click(within(dayRow('2030-02-22')).getAllByText('22')[0]!)
		expect(document.querySelector('[data-day-selected]')).toBeNull()
		expect(document.querySelector('[data-day-detail]')).toBeNull()
		expect(screen.queryByRole('table', { name: 'Sesongtabell' })).toBeNull()
	})
})

describe('the autopilot’s history in Se hele sesongen (#580)', () => {
	beforeEach(() => {
		Element.prototype.scrollTo = () => {}
	})
	afterEach(() => vi.unstubAllGlobals())

	test('a past notice sits at the week it laid, with its lines and reasons, read-only', async () => {
		screenWidth(390)
		inRouter(
			<HomeTimeline
				data={{
					...homeData(),
					autopilotHistory: [
						{
							closedWeekKey: '2030-02-11',
							comingWeekKey: THIS_MONDAY,
							heading: 'Denne uka er lagt ut',
							begun: true,
							showEase: false,
							seen: true,
							lines: [
								{
									proposalId: 'p1',
									kind: 'changed',
									subject: '«Terskel» · onsdag',
									text: 'Økta er gjort ca. 15 % kortere.',
									undo: 'closed',
								},
								{
									proposalId: 'p2',
									kind: 'changed',
									subject: '«Langtur» · søndag',
									text: 'Økta er gjort ca. 15 % kortere.',
									undo: 'undone',
								},
							],
							unlaidLine:
								'Uka fra mandag 4. mars ble ikke lagt ut: den ligger etter slutten av planen.',
							undoable: 0,
							closedLine:
								'Uka har begynt, så endringene kan ikke angres lenger.',
							eased: null,
						},
					],
				}}
			/>,
		)

		const card = await screen.findByRole('region', {
			name: 'Lagt ut av autopiloten',
		})
		// At its own week, after that week's days.
		expect(card.closest(`[data-timeline-week="${THIS_MONDAY}"]`)).not.toBeNull()
		expect(card).toHaveTextContent('«Terskel» · onsdag')
		expect(card).toHaveTextContent('Økta er gjort ca. 15 % kortere.')
		expect(card).toHaveTextContent('Angret')
		expect(card).toHaveTextContent(
			'Uka fra mandag 4. mars ble ikke lagt ut: den ligger etter slutten av planen.',
		)
		expect(within(card).queryByRole('button')).toBeNull()
	})
})
