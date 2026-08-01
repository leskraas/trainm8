/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, describe } from 'vitest'
import { type PlannedLoadContexts } from '#app/utils/plan-outline/planned-load.ts'
import { type FitnessAnchor } from '#app/utils/plan-outline/season-chart.ts'
import { OLT_HR_5_RUN } from '#app/utils/zones/recipes.ts'
import { SeasonChart, type SeasonChartSeason } from './__season-chart.tsx'

// ── fixtures ──────────────────────────────────────────────────────────────────
// ADR 0045 §7's athlete: an Olympiatoppen runner, maxHr 195 / LTHR 172, 4:00/km
// threshold, whose plan opens Monday 2030-01-07 and runs four weeks into a race
// on its last week.

const RUNNER: PlannedLoadContexts = {
	run: {
		recipe: OLT_HR_5_RUN,
		profile: {
			lthr: 172,
			maxHr: 195,
			thresholdPaceSecPerKm: 240,
			cssSecPer100m: null,
		},
	},
}

/** An athlete with no Discipline Profile: every derived reading closes its gate. */
const NO_PROFILE: PlannedLoadContexts = {}

const ANCHOR: FitnessAnchor = {
	ctl: 45,
	trustworthy: true,
	daysOfHistory: 200,
	requiredDays: 42,
}

const RUN = 'track-run'
const LIFT = 'track-strength'

const WEEK_VALUES = [50, 52.5, 36.8, 55]

function weekRow(index: number, value: number | null, overrides = {}) {
	const day = String(7 + index * 7).padStart(2, '0')
	return {
		weekKey: `2030-01-${day}`,
		weekInPlan: index + 1,
		phaseIndex: index === 3 ? 1 : 0,
		role: (index === 2 ? 'recovery' : index === 3 ? 'taper' : 'loading') as
			| 'loading'
			| 'recovery'
			| 'taper',
		startsAt: new Date(`2030-01-${day}T00:00:00.000Z`),
		targets: [{ trackId: RUN, value, overridden: false, derivedValue: value }],
		...overrides,
	}
}

function season(over: Partial<SeasonChartSeason> = {}): SeasonChartSeason {
	return {
		startWeekKey: '2030-01-07',
		timezone: 'UTC',
		eventName: 'Spring Half Marathon',
		// Saturday of plan week 4, whose Monday is 2030-01-28.
		eventDate: new Date('2030-02-02T09:00:00Z'),
		phases: [
			{ name: 'Base', weeks: 3, rhythm: '3:1', tapers: false },
			{ name: 'Taper', weeks: 1, rhythm: 'none', tapers: true },
		],
		tracks: [
			{
				trackId: RUN,
				discipline: 'run',
				currency: 'km',
				anchors: [{ fromWeekKey: '2030-01-07', value: 50 }],
				segments: [
					{ phaseIndex: 0, ramp: 0.05, mix: [{ zone: 4, sessionsPerWeek: 2 }] },
					{ phaseIndex: 1, ramp: null, mix: [] },
				],
				strengthSegments: [],
			},
		],
		weeks: WEEK_VALUES.map((value, index) => weekRow(index, value)),
		...over,
	}
}

function renderChart(
	data: SeasonChartSeason = season(),
	contexts: PlannedLoadContexts = RUNNER,
	fitnessAnchor: FitnessAnchor | null = ANCHOR,
) {
	// Through the route stub like every other component test on this surface, even
	// though the chart itself navigates nowhere: it is mounted inside a route, and
	// a stub is what keeps the render honest about that.
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<SeasonChart
					season={data}
					contexts={contexts}
					fitnessAnchor={fitnessAnchor}
				/>
			),
		},
	])
	render(<App initialEntries={['/training/plan']} />)
}

/** The volume chart's fixed inspect panel — a `figcaption`, never a tooltip. */
function volumePanel() {
	return screen.getAllByRole('figure')[0]!.querySelector('figcaption')!
}

function layer(name: string) {
	return screen.getByRole('button', { name })
}

/**
 * Put the keyboard on the volume plot. The chart's controls come first in tab
 * order, so reaching the plot with `{Tab}` alone would depend on how many toggles
 * happen to be rendered — the surface under test is the focusable `role="img"`
 * itself, which is what the keyboard model hangs off (ADR 0030 rule 2).
 */
function focusChart() {
	screen.getByRole('img', { name: /volume across the season/ }).focus()
}

// ── the layers ────────────────────────────────────────────────────────────────

describe('the layers', () => {
	test('all five plus Form are offered, and each toggles on its own', async () => {
		const user = userEvent.setup()
		renderChart()

		for (const name of [
			'Volume',
			'Fitness',
			'Rhythm',
			'Ramp',
			'Emphasis',
			'Form',
		]) {
			expect(layer(name)).toBeInTheDocument()
		}
		// Volume alone by default: one thing at a time on a shape already known.
		expect(layer('Volume')).toHaveAttribute('aria-pressed', 'true')
		expect(layer('Rhythm')).toHaveAttribute('aria-pressed', 'false')

		await user.click(layer('Rhythm'))
		expect(layer('Rhythm')).toHaveAttribute('aria-pressed', 'true')
		// Turning one on leaves the others exactly as they were.
		expect(layer('Volume')).toHaveAttribute('aria-pressed', 'true')
		expect(layer('Ramp')).toHaveAttribute('aria-pressed', 'false')

		await user.click(layer('Volume'))
		expect(layer('Volume')).toHaveAttribute('aria-pressed', 'false')
		expect(layer('Rhythm')).toHaveAttribute('aria-pressed', 'true')
	})

	test('the Form layer draws nothing and says why, in plain words', async () => {
		const user = userEvent.setup()
		renderChart()

		expect(screen.queryByTestId('form-layer-refusal')).not.toBeInTheDocument()
		const figuresBefore = screen.getAllByRole('figure').length

		await user.click(layer('Form'))

		const refusal = screen.getByTestId('form-layer-refusal')
		expect(refusal).toHaveTextContent(/Form does not draw here/)
		expect(refusal).toHaveTextContent(/spread each week evenly/)
		expect(refusal).toHaveTextContent(/Fitness minus Fatigue/)
		// Offered, refuses, and adds no chart: the refusal is the whole layer.
		expect(screen.getAllByRole('figure')).toHaveLength(figuresBefore)
	})

	test('Fitness is a second chart with its own axis, never a second line on this one', async () => {
		const user = userEvent.setup()
		renderChart()

		expect(screen.getAllByRole('figure')).toHaveLength(1)
		await user.click(layer('Fitness'))

		const figures = screen.getAllByRole('figure')
		expect(figures).toHaveLength(2)
		// Two axes, two charts (ADR 0043 §7) — the second one reads CTL and the
		// first still reads the track's own kilometres.
		expect(
			within(figures[1]!).getByRole('img', { name: /Projected fitness/ }),
		).toBeInTheDocument()
		expect(
			within(figures[0]!).getByRole('img', { name: /Run volume/ }),
		).toBeInTheDocument()
	})

	test('the projected curve carries one derivation statement for the whole line', async () => {
		const user = userEvent.setup()
		renderChart()
		await user.click(layer('Fitness'))

		expect(
			screen.getByText(/Replayed from the fitness you carried into week 1/),
		).toBeInTheDocument()
		expect(
			screen.getByText(/Your plan is one number a week, so only fitness/),
		).toBeInTheDocument()
	})

	test('the Fitness layer declines with a reason when a week cannot be priced', async () => {
		const user = userEvent.setup()
		renderChart(season(), NO_PROFILE)
		await user.click(layer('Fitness'))

		expect(screen.getByTestId('fitness-unavailable')).toHaveTextContent(
			/Projected fitness is Unavailable — Run: no zone system is set/,
		)
		expect(screen.getAllByRole('figure')).toHaveLength(1)
	})
})

// ── one axis is one track in one currency ─────────────────────────────────────

describe('the value axis', () => {
	test('unit switching is a control on the chart, and not a tab', async () => {
		const user = userEvent.setup()
		renderChart()

		// Nothing here is navigation: no links, no tablist — the readings' tabs stay
		// the surface's and a unit never joins them (ADR 0043 §8).
		const controls = screen.getByText('Read in').parentElement!
		expect(within(controls).queryByRole('link')).not.toBeInTheDocument()
		expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

		const authored = screen.getByRole('button', {
			name: /Read in Kilometres per week, as authored/,
		})
		expect(authored).toHaveAttribute('aria-pressed', 'true')

		await user.click(
			screen.getByRole('button', { name: /Read in TSS per week, derived/ }),
		)
		expect(
			screen.getByRole('img', {
				name: /Run volume across the season, in TSS\/wk/,
			}),
		).toBeInTheDocument()
	})

	test('a lifting track is offered no unit switch at all', () => {
		renderChart(
			season({
				tracks: [
					{
						trackId: LIFT,
						discipline: 'strength',
						currency: 'sets',
						anchors: [{ fromWeekKey: '2030-01-07', value: 12 }],
						segments: [],
						strengthSegments: [
							{
								segmentId: 'block-1',
								startWeekInPlan: 2,
								weeks: 2,
								ramp: 0.05,
							},
						],
					},
				],
				weeks: WEEK_VALUES.map((_, index) => ({
					...weekRow(index, 12),
					targets: [
						{ trackId: LIFT, value: 12, overridden: false, derivedValue: 12 },
					],
				})),
			}),
		)

		// `sets` converts in no direction (ADR 0041), so the control is absent
		// rather than present and refusing every option it offers.
		expect(screen.queryByText('Read in')).not.toBeInTheDocument()
	})
})

// ── tap a week, read it below the chart ───────────────────────────────────────

describe('the inspect panel', () => {
	test('opens below the chart with the week’s values, and never floats', async () => {
		const user = userEvent.setup()
		renderChart()

		const figure = screen.getAllByRole('figure')[0]!
		const panel = volumePanel()
		expect(panel).toHaveTextContent(/Tap a week to read it/)
		// The panel is a child of the figure, after the plot — a fixed region below
		// the chart, which is what ADR 0030 rule 3 requires instead of a tooltip.
		expect(figure).toContainElement(panel)
		expect(panel.tagName).toBe('FIGCAPTION')
		expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

		focusChart()
		await user.keyboard('{Home}')

		expect(volumePanel()).toHaveTextContent('Week 1')
		expect(volumePanel()).toHaveTextContent('50.0 km/wk')
		expect(volumePanel()).toHaveTextContent('authored')
	})

	test('the keyboard walks the weeks and the panel follows', async () => {
		const user = userEvent.setup()
		renderChart()

		focusChart()
		await user.keyboard('{Home}')
		expect(volumePanel()).toHaveTextContent('Week 1')

		await user.keyboard('{ArrowRight}')
		expect(volumePanel()).toHaveTextContent('Week 2')
		expect(volumePanel()).toHaveTextContent('52.5 km/wk')

		await user.keyboard('{End}')
		expect(volumePanel()).toHaveTextContent('Week 4')
		expect(volumePanel()).toHaveTextContent('your event’s week')

		await user.keyboard('{Escape}')
		expect(volumePanel()).toHaveTextContent(/Tap a week to read it/)
	})

	test('a derived week shows the chain and the buckets it was priced from', async () => {
		const user = userEvent.setup()
		renderChart()
		await user.click(
			screen.getByRole('button', { name: /Read in TSS per week, derived/ }),
		)
		focusChart()
		await user.keyboard('{Home}')

		const panel = volumePanel()
		expect(panel).toHaveTextContent('derived')
		expect(panel).toHaveTextContent('Where this number comes from')
		// Every non-authored number names its source (ADR 0045 §10) — the
		// convention that sized the quality bucket, and the athlete's own recipe.
		expect(panel).toHaveTextContent(/minutes in zone per quality session/)
		expect(panel).toHaveTextContent(/a convention/)
		expect(panel).toHaveTextContent(/olt-hr-5-run zone system/)
		// The decomposition, five buckets deep, in its own scrolling container.
		const buckets = within(panel).getByRole('table', {
			name: /decomposed into intensity buckets/,
		})
		expect(
			within(buckets).getByRole('rowheader', { name: /2× threshold/ }),
		).toBeInTheDocument()
		expect(
			within(buckets).getByRole('rowheader', { name: 'Easy' }),
		).toBeInTheDocument()
		expect(buckets.parentElement).toHaveClass('overflow-x-auto')
	})

	test('an authored week shows no derivation, because it stands on nothing', async () => {
		const user = userEvent.setup()
		renderChart()
		focusChart()
		await user.keyboard('{Home}')

		expect(volumePanel()).not.toHaveTextContent('Where this number comes from')
	})

	test('an Unavailable week inspects to a stated reason, never to nothing', async () => {
		const user = userEvent.setup()
		renderChart(
			season({
				weeks: [
					weekRow(0, null),
					...WEEK_VALUES.slice(1).map((value, i) => weekRow(i + 1, value)),
				],
			}),
		)

		focusChart()
		await user.keyboard('{Home}')
		expect(volumePanel()).toHaveTextContent(
			'Unavailable — no Season Anchor is in force on that track',
		)
		// And the slot is marked, so it is distinguishable from a true zero at a
		// glance rather than only on inspection (ADR 0030 rule 1).
		expect(screen.getAllByText('n/a').length).toBeGreaterThan(0)
	})

	test('a closed conversion gate names the athlete’s own missing datum', async () => {
		const user = userEvent.setup()
		renderChart(season(), NO_PROFILE)
		await user.click(
			screen.getByRole('button', { name: /Read in TSS per week, derived/ }),
		)
		focusChart()
		await user.keyboard('{Home}')

		expect(volumePanel()).toHaveTextContent(
			'Unavailable — no zone system is set for that discipline',
		)
	})

	test('a layer turned off leaves the reading as well as the picture', async () => {
		const user = userEvent.setup()
		renderChart()
		await user.click(layer('Rhythm'))
		focusChart()
		await user.keyboard('{Home}')
		await user.keyboard('{ArrowRight}{ArrowRight}')

		expect(volumePanel()).toHaveTextContent('Recovery week')
		await user.click(layer('Rhythm'))
		expect(volumePanel()).not.toHaveTextContent('Recovery week')
	})

	test('the ramp reads the step taken beside the rate authored for it', async () => {
		const user = userEvent.setup()
		renderChart()
		await user.click(layer('Ramp'))
		focusChart()
		await user.keyboard('{Home}')
		await user.keyboard('{ArrowRight}')

		expect(volumePanel()).toHaveTextContent('+5% on the week before.')
		expect(volumePanel()).toHaveTextContent('Ramp authored at +5%.')
	})

	test('the time axis names its own marks — a block opening and a re-anchor', async () => {
		const user = userEvent.setup()
		renderChart(
			season({
				tracks: [
					{
						...season().tracks[0]!,
						anchors: [
							{ fromWeekKey: '2030-01-07', value: 50 },
							{ fromWeekKey: '2030-01-14', value: 48 },
						],
					},
					{
						trackId: LIFT,
						discipline: 'strength',
						currency: 'sets',
						anchors: [],
						segments: [],
						strengthSegments: [
							{
								segmentId: 'block-1',
								startWeekInPlan: 2,
								weeks: 2,
								ramp: null,
							},
						],
					},
				],
			}),
		)

		focusChart()
		await user.keyboard('{Home}')
		await user.keyboard('{ArrowRight}')

		expect(volumePanel()).toHaveTextContent('Re-anchored: Run 48.0 km/wk')
		expect(volumePanel()).toHaveTextContent('A strength block opens this week')
		// And both are drawn on the time axis, not only said in the panel — the
		// plan's opening anchor is not one of them (ADR 0040 §5).
		expect(screen.getAllByTestId('re-anchor-mark')).toHaveLength(1)
	})
})

// ── the accessible equivalent (ADR 0030 rule 2) ───────────────────────────────

test('every value the panel can show is reachable in the hidden data table', () => {
	renderChart()

	const table = screen.getByRole('table', {
		name: /Run volume by Training Week/,
	})
	const rows = within(table).getAllByRole('row')
	// A header row plus one per Training Week.
	expect(rows).toHaveLength(5)

	const week3 = within(table)
		.getByRole('rowheader', { name: '3' })
		.closest('tr')!
	expect(week3).toHaveTextContent('Base')
	expect(week3).toHaveTextContent('Recovery')
	expect(week3).toHaveTextContent('36.8 km/wk')
	expect(week3).toHaveTextContent('2× threshold')

	// The wrapper carries `sr-only`, never the table itself: a table ignores a
	// 1px width and would push the document past 390px.
	expect(table.parentElement).toHaveClass('sr-only')
	expect(table).not.toHaveClass('sr-only')
})

test('the accessible table states a derived reading is derived, in its caption', async () => {
	const user = userEvent.setup()
	renderChart()
	await user.click(
		screen.getByRole('button', { name: /Read in TSS per week, derived/ }),
	)

	expect(
		screen.getByRole('table', {
			name: /a derived reading of a track authored in km\/wk/,
		}),
	).toBeInTheDocument()
})
