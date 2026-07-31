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
	weekOptions: Array<{ weekKey: string; startsAt: Date; isCurrent: boolean }>
	discipline: string | null
	proposal: {
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
	} | null
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
		weekOptions: WEEK_OPTIONS,
		discipline: 'run',
		proposal: {
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
		await screen.findByRole('combobox', { name: /what do you plan in/i }),
	).toHaveTextContent('Kilometres per week')
	expect(screen.getByText(/proposed from your own history/i)).toBeInTheDocument()
	expect(screen.getByText(/locked once the track exists/i)).toBeInTheDocument()
})

test('switching to the offered hours brings the hours figure, not the km one', async () => {
	// Anchor value and Volume Currency are one act (ADR 0043 §2) — a distance
	// number relabelled as hours is a figure nobody authored.
	const user = userEvent.setup()
	renderStep()

	await user.click(
		await screen.findByRole('combobox', { name: /what do you plan in/i }),
	)
	await user.click(await screen.findByRole('option', { name: 'Hours per week' }))

	await waitFor(() =>
		expect(
			screen.getByLabelText(/where you are starting from/i),
		).toHaveValue(4.8),
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
			proposal: {
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
		}),
	)

	expect(await screen.findByText(/you trained 2 of them/i)).toBeInTheDocument()
})

test('with no history the currency is the athlete’s to pick and the anchor is empty', async () => {
	renderStep(
		loaderData({
			proposal: {
				discipline: 'run',
				currency: null,
				offered: ['km', 'hours', 'tss'],
				anchors: {},
			},
		}),
	)

	expect(
		await screen.findByText(
			/nothing in your last 4 weeks to read a unit from, so this one is yours to choose/i,
		),
	).toBeInTheDocument()
	expect(
		screen.getByRole('combobox', { name: /what do you plan in/i }),
	).toHaveTextContent(/pick the unit/i)
	expect(screen.getByLabelText(/where you are starting from/i)).toHaveValue(null)
	expect(
		screen.getByText(/nothing in your last 4 weeks to read this from/i),
	).toBeInTheDocument()
})

test('strength is offered sets and nothing else', async () => {
	renderStep(
		loaderData({
			discipline: 'strength',
			proposal: {
				discipline: 'strength',
				currency: 'sets',
				offered: ['sets'],
				anchors: {},
			},
		}),
	)

	// Not a choice at all (ADR 0043 §2), so there is no control to leave dead: the
	// unit is stated and submitted.
	expect(
		await screen.findByText(/strength’s own unit, not a choice/i),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('combobox', { name: /what do you plan in/i }),
	).not.toBeInTheDocument()
})

test('the athlete names their phases with a week count each, and submits the plan', async () => {
	const user = userEvent.setup()
	const { submitted } = renderStep()

	await user.type(await screen.findByLabelText('Phase 1 name'), 'Base')
	const weekCounts = screen.getAllByLabelText('Weeks')
	await user.type(weekCounts[0]!, '8')
	await user.type(screen.getByLabelText('Phase 2 name'), 'Build')
	await user.type(weekCounts[1]!, '4')
	await user.click(screen.getByRole('button', { name: /create plan/i }))

	expect(submitted).toHaveBeenCalledTimes(1)
	const call = submitted.mock.calls[0]![0]
	expect(call.fields).toMatchObject({
		startWeekKey: '2030-01-07',
		currency: 'km',
		anchorValue: '50',
		discipline: 'run',
	})
	// Blank rows ride along in the body and are dropped server-side, so authoring
	// three phases and authoring six is the same form.
	expect(call.phaseNames.slice(0, 2)).toEqual(['Base', 'Build'])
	expect(call.phaseWeeks.slice(0, 2)).toEqual(['8', '4'])
})

test('a goal just created is named as created, so nothing was written invisibly', async () => {
	renderStep(loaderData({ createdGoal: true }))

	expect(await screen.findByText(/goal created/i)).toBeInTheDocument()
	expect(
		screen.getByText(/added to your calendar as a fitness goal/i),
	).toBeInTheDocument()
})

test('an Event naming no discipline says so rather than guessing a track', async () => {
	renderStep(loaderData({ discipline: null, proposal: null }))

	expect(
		await screen.findByText(/names no discipline/i),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /create plan/i }),
	).not.toBeInTheDocument()
})
