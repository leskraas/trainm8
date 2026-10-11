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
	screen
		.getByRole('img', { name: /^Volum for løping gjennom sesongen/ })
		.focus()
}

// ── the layers ────────────────────────────────────────────────────────────────

describe('the layers', () => {
	test('all five plus Form are offered, and each toggles on its own', async () => {
		const user = userEvent.setup()
		renderChart()

		for (const name of [
			'Volum',
			'Form',
			'Rytme',
			'Stigning',
			'Vekt',
			'Overskudd',
		]) {
			expect(layer(name)).toBeInTheDocument()
		}
		// Volume alone by default: one thing at a time on a shape already known.
		expect(layer('Volum')).toHaveAttribute('aria-pressed', 'true')
		expect(layer('Rytme')).toHaveAttribute('aria-pressed', 'false')

		await user.click(layer('Rytme'))
		expect(layer('Rytme')).toHaveAttribute('aria-pressed', 'true')
		// Turning one on leaves the others exactly as they were.
		expect(layer('Volum')).toHaveAttribute('aria-pressed', 'true')
		expect(layer('Stigning')).toHaveAttribute('aria-pressed', 'false')

		await user.click(layer('Volum'))
		expect(layer('Volum')).toHaveAttribute('aria-pressed', 'false')
		expect(layer('Rytme')).toHaveAttribute('aria-pressed', 'true')
	})

	test('the Form layer draws nothing and says why, in plain words', async () => {
		const user = userEvent.setup()
		renderChart()

		expect(screen.queryByTestId('form-layer-refusal')).not.toBeInTheDocument()
		const figuresBefore = screen.getAllByRole('figure').length

		await user.click(layer('Overskudd'))

		const refusal = screen.getByTestId('form-layer-refusal')
		expect(refusal).toHaveTextContent(/Overskudd tegnes ikke her/)
		expect(refusal).toHaveTextContent(/spre hver uke jevnt/)
		expect(refusal).toHaveTextContent(/overskudd er form minus trøtthet/)
		// Offered, refuses, and adds no chart: the refusal is the whole layer.
		expect(screen.getAllByRole('figure')).toHaveLength(figuresBefore)
	})

	test('Fitness is a second chart with its own axis, never a second line on this one', async () => {
		const user = userEvent.setup()
		renderChart()

		expect(screen.getAllByRole('figure')).toHaveLength(1)
		await user.click(layer('Form'))

		const figures = screen.getAllByRole('figure')
		expect(figures).toHaveLength(2)
		// Two axes, two charts (ADR 0043 §7) — the second one reads CTL and the
		// first still reads the track's own kilometres.
		expect(
			within(figures[1]!).getByRole('img', {
				name: /^Beregnet form \(CTL\) gjennom sesongen/,
			}),
		).toBeInTheDocument()
		expect(
			within(figures[0]!).getByRole('img', { name: /^Volum for løping/ }),
		).toBeInTheDocument()
	})

	test('the projected curve carries one derivation statement for the whole line', async () => {
		const user = userEvent.setup()
		renderChart()
		await user.click(layer('Form'))

		expect(
			screen.getByText(/Regnet fram fra formen du hadde inn i den første uka/),
		).toBeInTheDocument()
		expect(
			screen.getByText(/Planen er ett tall i uka, så bare formen/),
		).toBeInTheDocument()
	})

	test('the Fitness layer declines with a reason when a week cannot be priced', async () => {
		const user = userEvent.setup()
		renderChart(season(), NO_PROFILE)
		await user.click(layer('Form'))

		expect(screen.getByTestId('fitness-unavailable')).toHaveTextContent(
			/Formkurven kan ikke regnes ut – Løping: ingen sonemodell er satt/,
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
		const controls = screen.getByText('Les i').parentElement!
		expect(within(controls).queryByRole('link')).not.toBeInTheDocument()
		expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

		const authored = screen.getByRole('button', {
			name: /Les i kilometer i uka, slik du skrev det/,
		})
		expect(authored).toHaveAttribute('aria-pressed', 'true')

		await user.click(
			screen.getByRole('button', { name: /Les i tss i uka, utledet/ }),
		)
		expect(
			screen.getByRole('img', {
				name: /Volum for løping gjennom sesongen, i TSS\/uke/,
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
		expect(screen.queryByText('Les i')).not.toBeInTheDocument()
	})
})

// ── tap a week, read it below the chart ───────────────────────────────────────

describe('the inspect panel', () => {
	test('opens below the chart with the week’s values, and never floats', async () => {
		const user = userEvent.setup()
		renderChart()

		const figure = screen.getAllByRole('figure')[0]!
		const panel = volumePanel()
		expect(panel).toHaveTextContent(/Trykk på en uke for å lese den/)
		// The panel is a child of the figure, after the plot — a fixed region below
		// the chart, which is what ADR 0030 rule 3 requires instead of a tooltip.
		expect(figure).toContainElement(panel)
		expect(panel.tagName).toBe('FIGCAPTION')
		expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

		focusChart()
		await user.keyboard('{Home}')

		expect(volumePanel()).toHaveTextContent('Uke 2')
		expect(volumePanel()).toHaveTextContent('50 km/uke')
		expect(volumePanel()).toHaveTextContent('skrevet')
	})

	test('the keyboard walks the weeks and the panel follows', async () => {
		const user = userEvent.setup()
		renderChart()

		focusChart()
		await user.keyboard('{Home}')
		expect(volumePanel()).toHaveTextContent('Uke 2')

		await user.keyboard('{ArrowRight}')
		expect(volumePanel()).toHaveTextContent('Uke 3')
		expect(volumePanel()).toHaveTextContent('52,5 km/uke')

		await user.keyboard('{End}')
		expect(volumePanel()).toHaveTextContent('Uke 5')
		expect(volumePanel()).toHaveTextContent('uka for løpet')

		await user.keyboard('{Escape}')
		expect(volumePanel()).toHaveTextContent(/Trykk på en uke for å lese den/)
	})

	test('a derived week shows the chain and the buckets it was priced from', async () => {
		const user = userEvent.setup()
		renderChart()
		await user.click(
			screen.getByRole('button', { name: /Les i tss i uka, utledet/ }),
		)
		focusChart()
		await user.keyboard('{Home}')

		const panel = volumePanel()
		expect(panel).toHaveTextContent('utledet')
		expect(panel).toHaveTextContent('Hvor tallet kommer fra')
		// Every non-authored number names its source (ADR 0045 §10) — the
		// convention that sized the quality bucket, and the athlete's own recipe.
		expect(panel).toHaveTextContent(/minutter i sonen per kvalitetsøkt/)
		expect(panel).toHaveTextContent(/vanlig praksis/)
		expect(panel).toHaveTextContent(/sonemodellen olt-hr-5-run/)
		// The decomposition, five buckets deep, in its own scrolling container.
		const buckets = within(panel).getByRole('table', {
			name: /Uka delt opp i intensiteter/,
		})
		expect(
			within(buckets).getByRole('rowheader', { name: /2× terskel/ }),
		).toBeInTheDocument()
		expect(
			within(buckets).getByRole('rowheader', { name: 'Rolig' }),
		).toBeInTheDocument()
		expect(buckets.parentElement).toHaveClass('overflow-x-auto')
	})

	test('an authored week shows no derivation, because it stands on nothing', async () => {
		const user = userEvent.setup()
		renderChart()
		focusChart()
		await user.keyboard('{Home}')

		expect(volumePanel()).not.toHaveTextContent('Hvor tallet kommer fra')
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
			'Utilgjengelig – sporet har ikke noe startnivå',
		)
		// And the slot is marked, so it is distinguishable from a true zero at a
		// glance rather than only on inspection (ADR 0030 rule 1).
		expect(screen.getAllByText('mangler').length).toBeGreaterThan(0)
	})

	test('a closed conversion gate names the athlete’s own missing datum', async () => {
		const user = userEvent.setup()
		renderChart(season(), NO_PROFILE)
		await user.click(
			screen.getByRole('button', { name: /Les i tss i uka, utledet/ }),
		)
		focusChart()
		await user.keyboard('{Home}')

		expect(volumePanel()).toHaveTextContent(
			'Utilgjengelig – ingen sonemodell er satt for den sporten',
		)
	})

	test('a layer turned off leaves the reading as well as the picture', async () => {
		const user = userEvent.setup()
		renderChart()
		await user.click(layer('Rytme'))
		focusChart()
		await user.keyboard('{Home}')
		await user.keyboard('{ArrowRight}{ArrowRight}')

		expect(volumePanel()).toHaveTextContent('Lett uke')
		await user.click(layer('Rytme'))
		expect(volumePanel()).not.toHaveTextContent('Lett uke')
	})

	test('the ramp reads the step taken beside the rate authored for it', async () => {
		const user = userEvent.setup()
		renderChart()
		await user.click(layer('Stigning'))
		focusChart()
		await user.keyboard('{Home}')
		await user.keyboard('{ArrowRight}')

		expect(volumePanel()).toHaveTextContent('+5 % mot uka før.')
		expect(volumePanel()).toHaveTextContent('Stigning satt til +5 %.')
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

		expect(volumePanel()).toHaveTextContent('Nytt startnivå: Løping 48 km/uke')
		expect(volumePanel()).toHaveTextContent(
			'En blokk med styrke starter denne uka',
		)
		// And both are drawn on the time axis, not only said in the panel — the
		// plan's opening anchor is not one of them (ADR 0040 §5).
		expect(screen.getAllByTestId('re-anchor-mark')).toHaveLength(1)
	})
})

// ── the accessible equivalent (ADR 0030 rule 2) ───────────────────────────────

test('every value the panel can show is reachable in the hidden data table', () => {
	renderChart()

	const table = screen.getByRole('table', {
		name: /Volum for løping per treningsuke/,
	})
	const rows = within(table).getAllByRole('row')
	// A header row plus one per Training Week.
	expect(rows).toHaveLength(5)

	const week3 = within(table)
		.getByRole('rowheader', { name: '4' })
		.closest('tr')!
	expect(week3).toHaveTextContent('Grunntrening')
	expect(week3).toHaveTextContent('Lett uke')
	expect(week3).toHaveTextContent('36,8 km/uke')
	expect(week3).toHaveTextContent('2× terskel')

	// The wrapper carries `sr-only`, never the table itself: a table ignores a
	// 1px width and would push the document past 390px.
	expect(table.parentElement).toHaveClass('sr-only')
	expect(table).not.toHaveClass('sr-only')
})

test('the accessible table states a derived reading is derived, in its caption', async () => {
	const user = userEvent.setup()
	renderChart()
	await user.click(
		screen.getByRole('button', { name: /Les i tss i uka, utledet/ }),
	)

	expect(
		screen.getByRole('table', {
			name: /en utledet lesning av et spor skrevet i km\/uke/,
		}),
	).toBeInTheDocument()
})
