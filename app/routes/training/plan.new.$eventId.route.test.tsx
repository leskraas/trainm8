/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import NewPlanStructureRoute from './plan.new.$eventId.tsx'

type LoaderData = {
	event: {
		id: string
		name: string
		kind: string
		startDate: Date
		endDate: Date | null
		disciplines: string[]
		plannedOutlineId: string | null
	}
	createdGoal: boolean
	timezone: string
	currentWeekKey: string
	eventWeekKey: string
	weekOptions: Array<{ weekKey: string; startsAt: Date; isCurrent: boolean }>
	/** One per Discipline the Event names — three of them for a triathlon. */
	proposals: Proposal[]
}

type Proposal = {
	discipline: string
	currency: string | null
	offered: string[]
	anchors: Record<
		string,
		{
			value: number
			derivation: {
				source: string
				windowWeeks: number
				weeksTrained: number
				total: number
				currency: string
			}
		}
	>
}

const WEEK_OPTIONS: LoaderData['weekOptions'] = [
	{
		weekKey: '2029-12-31',
		startsAt: new Date('2029-12-31T00:00:00.000Z'),
		isCurrent: false,
	},
	{
		weekKey: '2030-01-07',
		startsAt: new Date('2030-01-07T00:00:00.000Z'),
		isCurrent: true,
	},
	{
		weekKey: '2030-01-14',
		startsAt: new Date('2030-01-14T00:00:00.000Z'),
		isCurrent: false,
	},
]

function loaderData(overrides: Partial<LoaderData> = {}): LoaderData {
	return {
		event: {
			id: 'event-1',
			name: 'Spring Half Marathon',
			kind: 'race',
			startDate: new Date('2030-03-05T09:00:00Z'),
			endDate: null,
			disciplines: ['run'],
			plannedOutlineId: null,
		},
		createdGoal: false,
		timezone: 'UTC',
		currentWeekKey: '2030-01-07',
		// The Monday of the Event's own week: nine weeks of run-in, which every
		// shipped shape overruns. Overridden where a test is about the fit.
		eventWeekKey: '2030-03-04',
		weekOptions: WEEK_OPTIONS,
		proposals: [
			{
				discipline: 'run',
				currency: 'km',
				offered: ['km', 'hours', 'tss'],
				anchors: {
					km: {
						value: 50,
						derivation: {
							source: 'recent-training',
							windowWeeks: 4,
							weeksTrained: 4,
							total: 200,
							currency: 'km',
						},
					},
					hours: {
						value: 4.8,
						derivation: {
							source: 'recent-training',
							windowWeeks: 4,
							weeksTrained: 4,
							total: 19.2,
							currency: 'hours',
						},
					},
				},
			},
		],
		...overrides,
	}
}

function renderStep(data: LoaderData = loaderData()) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/plan/new/:eventId',
			Component: (props: Record<string, unknown>) => (
				<NewPlanStructureRoute {...(props as any)} />
			),
			loader: () => data,
			action: async ({ request }) => {
				const formData = await request.formData()
				submitted({
					fields: Object.fromEntries(formData),
					phaseNames: formData.getAll('phaseName'),
					phaseWeeks: formData.getAll('phaseWeeks'),
				})
				return { result: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan/new/event-1']} />)
	return { submitted }
}

test('the Plan Start Week is authored, defaulting to this week’s Monday', async () => {
	renderStep()

	// Every option is a Monday, because that is how the week is stored — an invalid
	// start week is not something the athlete can submit.
	const select = await screen.findByRole('combobox', {
		name: /plan start week/i,
	})
	expect(select).toHaveTextContent('7 Jan 2030 · this week')
	expect(
		screen.getByText(/nothing counts back from your event/i),
	).toBeInTheDocument()
})

test('the proposed currency is preselected and named as a proposal', async () => {
	renderStep()

	expect(
		await screen.findByRole('combobox', {
			name: /what do you plan your run in/i,
		}),
	).toHaveTextContent('Kilometres per week')
	expect(
		screen.getByText(/proposed from your own history/i),
	).toBeInTheDocument()
	expect(screen.getByText(/locked once the track exists/i)).toBeInTheDocument()
})

test('switching to the offered hours brings the hours figure, not the km one', async () => {
	// Anchor value and Volume Currency are one act (ADR 0043 §2) — a distance
	// number relabelled as hours is a figure nobody authored.
	const user = userEvent.setup()
	renderStep()

	await user.click(
		await screen.findByRole('combobox', {
			name: /what do you plan your run in/i,
		}),
	)
	await user.click(
		await screen.findByRole('option', { name: 'Hours per week' }),
	)

	await waitFor(() =>
		expect(screen.getByLabelText(/where you are starting from/i)).toHaveValue(
			4.8,
		),
	)
	expect(
		screen.getByText(/averaged 4\.8 h\/wk \(19\.2 h in total\)/i),
	).toBeInTheDocument()
})

test('the anchor is pre-filled with its derivation shown, and stays editable', async () => {
	const user = userEvent.setup()
	renderStep()

	const anchor = await screen.findByLabelText(/where you are starting from/i)
	expect(anchor).toHaveValue(50)
	expect(
		screen.getByText(
			/your last 4 weeks averaged 50\.0 km\/wk \(200\.0 km in total\)/i,
		),
	).toBeInTheDocument()

	await user.clear(anchor)
	await user.type(anchor, '58')
	expect(anchor).toHaveValue(58)
})

test('a partly-trained window says how many weeks it read', async () => {
	renderStep(
		loaderData({
			proposals: [
				{
					discipline: 'run',
					currency: 'km',
					offered: ['km', 'hours', 'tss'],
					anchors: {
						km: {
							value: 25,
							derivation: {
								source: 'recent-training',
								windowWeeks: 4,
								weeksTrained: 2,
								total: 100,
								currency: 'km',
							},
						},
					},
				},
			],
		}),
	)

	expect(await screen.findByText(/you trained 2 of them/i)).toBeInTheDocument()
})

test('with no history the currency is the athlete’s to pick and the anchor is empty', async () => {
	renderStep(
		loaderData({
			proposals: [
				{
					discipline: 'run',
					currency: null,
					offered: ['km', 'hours', 'tss'],
					anchors: {},
				},
			],
		}),
	)

	expect(
		await screen.findByText(
			/nothing in your last 4 weeks to read a unit from, so this one is yours to choose/i,
		),
	).toBeInTheDocument()
	expect(
		screen.getByRole('combobox', { name: /what do you plan your run in/i }),
	).toHaveTextContent(/pick the unit/i)
	expect(screen.getByLabelText(/where you are starting from/i)).toHaveValue(
		null,
	)
	expect(
		screen.getByText(/nothing in your last 4 weeks to read this from/i),
	).toBeInTheDocument()
})

test('strength is offered sets and nothing else', async () => {
	renderStep(
		loaderData({
			proposals: [
				{
					discipline: 'strength',
					currency: 'sets',
					offered: ['sets'],
					anchors: {},
				},
			],
		}),
	)

	// Not a choice at all (ADR 0043 §2), so there is no control to leave dead: the
	// unit is stated and submitted.
	expect(
		await screen.findByText(/strength’s own unit, not a choice/i),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('combobox', { name: /what do you plan/i }),
	).not.toBeInTheDocument()
	// And nothing claims the unit was read from anywhere: `sets` is a fact about the
	// Discipline rather than a reading of the athlete's own weeks, so neither "we
	// proposed this" nor "so this one is yours to choose" is a true sentence about
	// it. The plan page's add form drops the same clause, and one unit must not be
	// explained two ways on two surfaces.
	expect(
		screen.queryByText(/proposed from your own history/i),
	).not.toBeInTheDocument()
	expect(screen.queryByText(/to read a unit from/i)).not.toBeInTheDocument()
	// What *is* true of it still reads.
	expect(screen.getByText(/locked once the track exists/i)).toBeInTheDocument()
})

test('a multi-discipline event authors a track each over one phase timeline', async () => {
	const user = userEvent.setup()
	const { submitted } = renderStep(
		loaderData({
			event: {
				id: 'event-1',
				name: 'Spring Triathlon',
				kind: 'race',
				startDate: new Date('2030-03-05T09:00:00Z'),
				endDate: null,
				disciplines: ['swim', 'bike', 'run'],
				plannedOutlineId: null,
			},
			proposals: [
				{
					discipline: 'swim',
					currency: 'km',
					offered: ['km', 'hours', 'tss'],
					anchors: {
						km: {
							value: 6,
							derivation: {
								source: 'recent-training',
								windowWeeks: 4,
								weeksTrained: 4,
								total: 24,
								currency: 'km',
							},
						},
					},
				},
				{
					// Nothing logged on the bike, so this one asks rather than guessing —
					// and it asks about the bike alone, not about the whole season.
					discipline: 'bike',
					currency: null,
					offered: ['km', 'hours', 'tss'],
					anchors: {},
				},
				{
					discipline: 'run',
					currency: 'km',
					offered: ['km', 'hours', 'tss'],
					anchors: {
						km: {
							value: 40,
							derivation: {
								source: 'recent-training',
								windowWeeks: 4,
								weeksTrained: 4,
								total: 160,
								currency: 'km',
							},
						},
					},
				},
			],
		}),
	)

	// One question per discipline, each in that discipline's own unit — the three
	// share the blocks above them and nothing else (ADR 0043 §1).
	for (const heading of [
		/how big are your swim weeks/i,
		/how big are your bike weeks/i,
		/how big are your run weeks/i,
	]) {
		expect(
			await screen.findByRole('heading', { name: heading }),
		).toBeInTheDocument()
	}
	expect(screen.getByLabelText(/per swim week/i)).toHaveValue(6)
	expect(screen.getByLabelText(/per run week/i)).toHaveValue(40)
	// The bike track has no history behind it, so its anchor is empty and its unit
	// unpicked — one track proposing nothing does not cost the other two theirs.
	expect(screen.getByLabelText(/per bike week/i)).toHaveValue(null)

	await user.click(
		screen.getByRole('combobox', { name: /what do you plan your bike in/i }),
	)
	await user.click(
		await screen.findByRole('option', { name: 'Hours per week' }),
	)
	await user.type(screen.getByLabelText(/per bike week/i), '5')
	await user.click(screen.getByRole('button', { name: /create plan/i }))

	// All three travel in one submission, so one plan comes back rather than three.
	expect(submitted.mock.calls[0]![0].fields).toMatchObject({
		'tracks[0].discipline': 'swim',
		'tracks[0].currency': 'km',
		'tracks[0].anchorValue': '6',
		'tracks[1].discipline': 'bike',
		'tracks[1].currency': 'hours',
		'tracks[1].anchorValue': '5',
		'tracks[2].discipline': 'run',
		'tracks[2].currency': 'km',
		'tracks[2].anchorValue': '40',
	})
})

test('the athlete names their phases with a week count each, and submits the plan', async () => {
	const user = userEvent.setup()
	const { submitted } = renderStep()

	// The escape hatch is a choice beside the shapes, so taking it is one tap and
	// the rows are already there to type into.
	await user.click(
		await screen.findByRole('radio', { name: /lay out my own blocks/i }),
	)
	await user.type(await screen.findByLabelText('Phase 1 name'), 'Base')
	const weekCounts = screen.getAllByLabelText('Weeks')
	await user.type(weekCounts[0]!, '8')
	await user.type(screen.getByLabelText('Phase 2 name'), 'Build')
	await user.type(weekCounts[1]!, '4')
	await user.click(screen.getByRole('button', { name: /create plan/i }))

	expect(submitted).toHaveBeenCalledTimes(1)
	const call = submitted.mock.calls[0]![0]
	expect(call.fields).toMatchObject({
		structure: 'own',
		startWeekKey: '2030-01-07',
		'tracks[0].discipline': 'run',
		'tracks[0].currency': 'km',
		'tracks[0].anchorValue': '50',
	})
	// Blank rows ride along in the body and are dropped server-side, so authoring
	// three phases and authoring six is the same form.
	expect(call.phaseNames.slice(0, 2)).toEqual(['Base', 'Build'])
	expect(call.phaseWeeks.slice(0, 2)).toEqual(['8', '4'])
})

/**
 * The radio for one shape, by the key it posts.
 *
 * By value rather than by accessible name: nine shapes ship and six of them are
 * another one's name plus a length, so a name regex matches three cards at once.
 * The value is also exactly what the form submits, which is what the test is about.
 */
async function shapeRadio(value: string) {
	const radios = await screen.findAllByRole('radio')
	const match = radios.find(
		(radio) => (radio as HTMLInputElement).value === value,
	)
	expect(match, `no shape radio for ${value}`).toBeDefined()
	return match!
}

test('the season opens with shapes to pick from, not with an empty structure', async () => {
	renderStep()

	// Every shipped shape is on offer — three families at three lengths — each as a
	// choice rather than as a link to a section the athlete has to find later.
	for (const value of [
		'classic-linear-short',
		'classic-linear',
		'classic-linear-long',
		'masters-2-1-short',
		'masters-2-1',
		'masters-2-1-long',
		'big-base-short',
		'big-base',
		'big-base-long',
		'own',
	]) {
		expect(await shapeRadio(value)).toBeInTheDocument()
	}
	// And the picture is drawn from the shape's own numbers, week by week.
	expect(
		await screen.findByRole('img', {
			name: /classic 3:1 linear: a load profile 18 weeks long/i,
		}),
	).toBeInTheDocument()
})

test('each shape says where it would land against this event', async () => {
	renderStep()

	// Nine weeks of run-in and an 18-week shape: the plan would run nine weeks
	// past the event, and it is said before the athlete picks rather than after.
	expect(
		await screen.findByText(/runs 9 weeks past your event/i),
	).toBeInTheDocument()
	expect(
		screen.getByText(/never stretched to reach your event/i),
	).toBeInTheDocument()
})

test('a shape that misses says what the fitting rule would cost, before it is picked', async () => {
	renderStep()

	// The 18-week classic runs nine weeks past this event. Base absorbs first and
	// bottoms out at one week, so the build gives the rest — and the athlete reads
	// which blocks it costs them *while choosing*, not after tapping fit.
	expect(
		await screen.findByText(
			/runs 9 weeks past your event · fitting it shortens Base by 7 weeks and Build by 2 weeks/i,
		),
	).toBeInTheDocument()
	// The 11-week masters shape overruns by two, which its base pays on its own.
	expect(
		screen.getByText(
			/runs 2 weeks past your event · fitting it shortens Base by 2 weeks/i,
		),
	).toBeInTheDocument()
})

test('the shape that lands closest to the event is the one already picked, and it leads the list', async () => {
	// An event 18 weeks out: the 18-week shape ends on its week and every other
	// shape misses it.
	renderStep(loaderData({ eventWeekKey: '2030-05-06' }))

	expect(await shapeRadio('classic-linear')).toBeChecked()
	expect(screen.getByText(/ends on your event’s week/i)).toBeInTheDocument()
	// Nine cards is a long scroll at 390 px, so the nearest-landing shape is first
	// rather than buried in the shipped order. Order is not a label: no card is
	// marked recommended (ADR 0048 §2).
	const shapes = (await screen.findAllByRole('radio')).map(
		(radio) => (radio as HTMLInputElement).value,
	)
	expect(shapes[0]).toBe('classic-linear')
	expect(shapes.at(-1)).toBe('own')
})

test('picking a shape submits the shape and no phase rows', async () => {
	const user = userEvent.setup()
	const { submitted } = renderStep()

	await user.click(await shapeRadio('big-base'))
	await user.click(screen.getByRole('button', { name: /create plan/i }))

	const call = submitted.mock.calls[0]![0]
	expect(call.fields).toMatchObject({
		structure: 'big-base',
		'tracks[0].currency': 'km',
		'tracks[0].anchorValue': '50',
	})
	// The rows ride along empty and the action ignores them for a shape, so a
	// mis-tap cannot mix half a shape with half a hand-authored season.
	expect(call.phaseNames.every((name: string) => name === '')).toBe(true)
})

test('a goal just created is named as created, so nothing was written invisibly', async () => {
	renderStep(loaderData({ createdGoal: true }))

	expect(await screen.findByText(/goal created/i)).toBeInTheDocument()
	expect(
		screen.getByText(/added to your calendar as a fitness goal/i),
	).toBeInTheDocument()
})

test('an Event naming no discipline says so rather than guessing a track', async () => {
	renderStep(loaderData({ proposals: [] }))

	expect(await screen.findByText(/names no discipline/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /create plan/i }),
	).not.toBeInTheDocument()
})
