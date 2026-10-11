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
		name: /startuke for planen/i,
	})
	expect(select).toHaveTextContent('Uke 2 · 7. jan 2030 · denne uka')
	expect(
		screen.getByText(/ingenting telles bakover fra løpet/i),
	).toBeInTheDocument()
})

test('the proposed currency is preselected and named as a proposal', async () => {
	renderStep()

	expect(
		await screen.findByRole('combobox', {
			name: /hvilken enhet planlegger du løping i/i,
		}),
	).toHaveTextContent('Kilometer i uka')
	expect(
		screen.getByText(/foreslått fra din egen historikk/i),
	).toBeInTheDocument()
	expect(
		screen.getByText(/enheten ligger fast når sporet finnes/i),
	).toBeInTheDocument()
})

test('switching to the offered hours brings the hours figure, not the km one', async () => {
	// Anchor value and Volume Currency are one act (ADR 0043 §2) — a distance
	// number relabelled as hours is a figure nobody authored.
	const user = userEvent.setup()
	renderStep()

	await user.click(
		await screen.findByRole('combobox', {
			name: /hvilken enhet planlegger du løping i/i,
		}),
	)
	await user.click(await screen.findByRole('option', { name: 'Timer i uka' }))

	await waitFor(() =>
		expect(screen.getByLabelText(/startvolum per uke i løping/i)).toHaveValue(
			4.8,
		),
	)
	expect(
		screen.getByText(/snittet 4,8 t\/uke \(19,2 t til sammen\)/i),
	).toBeInTheDocument()
})

test('the anchor is pre-filled with its derivation shown, and stays editable', async () => {
	const user = userEvent.setup()
	renderStep()

	const anchor = await screen.findByLabelText(/startvolum per uke i løping/i)
	expect(anchor).toHaveValue(50)
	expect(
		screen.getByText(
			/de siste 4 ukene var snittet 50 km\/uke \(200 km til sammen\)/i,
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

	expect(await screen.findByText(/du trente 2 av dem/i)).toBeInTheDocument()
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
			/ingenting i de siste 4 ukene å lese en enhet fra, så du velger selv/i,
		),
	).toBeInTheDocument()
	expect(
		screen.getByRole('combobox', {
			name: /hvilken enhet planlegger du løping i/i,
		}),
	).toHaveTextContent(/velg enheten du planlegger i/i)
	expect(screen.getByLabelText(/startvolum per uke i løping/i)).toHaveValue(
		null,
	)
	expect(
		screen.getByText(/ingenting i de siste 4 ukene å lese dette fra/i),
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
		await screen.findByText(/styrkens egen enhet, ikke et valg/i),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('combobox', { name: /hvilken enhet planlegger du/i }),
	).not.toBeInTheDocument()
	// And nothing claims the unit was read from anywhere: `sets` is a fact about the
	// Discipline rather than a reading of the athlete's own weeks, so neither "we
	// proposed this" nor "so this one is yours to choose" is a true sentence about
	// it. The plan page's add form drops the same clause, and one unit must not be
	// explained two ways on two surfaces.
	expect(
		screen.queryByText(/foreslått fra din egen historikk/i),
	).not.toBeInTheDocument()
	expect(screen.queryByText(/å lese en enhet fra/i)).not.toBeInTheDocument()
	// What *is* true of it still reads.
	expect(
		screen.getByText(/enheten ligger fast når sporet finnes/i),
	).toBeInTheDocument()
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
		/hvor store er ukene i svømming/i,
		/hvor store er ukene i sykling/i,
		/hvor store er ukene i løping/i,
	]) {
		expect(
			await screen.findByRole('heading', { name: heading }),
		).toBeInTheDocument()
	}
	expect(screen.getByLabelText(/per uke i svømming/i)).toHaveValue(6)
	expect(screen.getByLabelText(/per uke i løping/i)).toHaveValue(40)
	// The bike track has no history behind it, so its anchor is empty and its unit
	// unpicked — one track proposing nothing does not cost the other two theirs.
	expect(screen.getByLabelText(/per uke i sykling/i)).toHaveValue(null)

	await user.click(
		screen.getByRole('combobox', {
			name: /hvilken enhet planlegger du sykling i/i,
		}),
	)
	await user.click(await screen.findByRole('option', { name: 'Timer i uka' }))
	await user.type(screen.getByLabelText(/per uke i sykling/i), '5')
	await user.click(screen.getByRole('button', { name: /lag planen/i }))

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
		await screen.findByRole('radio', { name: /jeg legger opp blokkene selv/i }),
	)
	await user.type(await screen.findByLabelText('Navn på fase 1'), 'Base')
	const weekCounts = screen.getAllByLabelText('Uker')
	await user.type(weekCounts[0]!, '8')
	await user.type(screen.getByLabelText('Navn på fase 2'), 'Build')
	await user.type(weekCounts[1]!, '4')
	await user.click(screen.getByRole('button', { name: /lag planen/i }))

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
 * By value rather than by accessible name: fifteen shapes ship and ten of them are
 * another one's name plus a length, so a name regex matches three cards at once.
 * The value is also exactly what the form submits, which is what the test is about.
 *
 * The radio is `ui/radio-group`'s (Base UI): a `role="radio"` element with the
 * native input it posts through beside it, so the value is read off that input.
 * The other lengths sit in a closed panel that stays mounted, so every radio is
 * in the group whether or not it is shown — hence `hidden: true`.
 */
function radioValue(radio: HTMLElement): string | null {
	return radio.nextElementSibling?.getAttribute('value') ?? null
}

/** Every shape radio, in DOM order — the visible controls, not their inputs. */
async function allShapeRadios() {
	const radios = await screen.findAllByRole('radio', { hidden: true })
	return radios.filter((radio) => radio.tagName !== 'INPUT')
}

async function shapeRadio(value: string) {
	const radios = await allShapeRadios()
	const match = radios.find((radio) => radioValue(radio) === value)
	expect(match, `no shape radio for ${value}`).toBeDefined()
	return match!
}

/** Open the other lengths when the radio a test taps sits behind them. */
async function reveal(
	user: ReturnType<typeof userEvent.setup>,
	radio: HTMLElement,
) {
	if (radio.closest('[hidden]')) {
		await user.click(screen.getByRole('button', { name: /lengder til/i }))
	}
	return radio
}

test('the season opens with shapes to pick from, not with an empty structure', async () => {
	renderStep()

	// Every shipped shape is on offer — five families at three lengths — each as a
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
		'polarized-short',
		'polarized',
		'polarized-long',
		'threshold-focus-short',
		'threshold-focus',
		'threshold-focus-long',
		'own',
	]) {
		expect(await shapeRadio(value)).toBeInTheDocument()
	}
	// And the picture is drawn from the shape's own numbers, week by week.
	expect(
		await screen.findByRole('img', {
			name: /^Klassisk 3:1: en belastning over 18 uker/,
			hidden: true,
		}),
	).toBeInTheDocument()
})

test('each shape says where it would land against this event', async () => {
	renderStep()

	// Nine weeks of run-in and an 18-week shape: the plan would run nine weeks
	// past the event, and it is said before the athlete picks rather than after.
	// Three shapes run 18 weeks — Klassisk, polarized and threshold focus share
	// Klassisk's lengths — and each says so on its own card.
	expect(await screen.findAllByText(/går 9 uker forbi løpet/i)).toHaveLength(3)
	expect(screen.getByText(/strekkes aldri for å nå løpet/i)).toBeInTheDocument()
})

test('a shape that misses says what the fitting rule would cost, before it is picked', async () => {
	renderStep()

	// The 18-week classic runs nine weeks past this event. Base absorbs first and
	// bottoms out at one week, so the build gives the rest — and the athlete reads
	// which blocks it costs them *while choosing*, not after tapping fit.
	expect(
		await screen.findAllByText(
			/går 9 uker forbi løpet · å tilpasse den korter ned Grunntrening med 7 uker og Oppbygging med 2 uker/i,
		),
	).toHaveLength(3)
	// The 11-week masters shape overruns by two, which its base pays on its own.
	expect(
		screen.getByText(
			/går 2 uker forbi løpet · å tilpasse den korter ned Grunntrening med 2 uker/i,
		),
	).toBeInTheDocument()
})

test('the shape that lands closest to the event is the one already picked, and it leads the list', async () => {
	// An event 18 weeks out: the 18-week shape ends on its week and every other
	// shape misses it.
	renderStep(loaderData({ eventWeekKey: '2030-05-06' }))

	expect(await shapeRadio('classic-linear')).toBeChecked()
	// Klassisk and the two families at its lengths all land on it.
	expect(screen.getAllByText(/slutter i uka for løpet/i)).toHaveLength(3)
	// Nine cards is a long scroll at 390 px, so the nearest-landing shape is first
	// rather than buried in the shipped order. Order is not a label: no card is
	// marked recommended (ADR 0048 §2).
	const shapes = (await allShapeRadios()).map(radioValue)
	expect(shapes[0]).toBe('classic-linear')
	expect(shapes.at(-1)).toBe('own')
})

test('picking a shape submits the shape and no phase rows', async () => {
	const user = userEvent.setup()
	const { submitted } = renderStep()

	await user.click(await reveal(user, await shapeRadio('big-base')))
	await user.click(screen.getByRole('button', { name: /lag planen/i }))

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

	expect(await screen.findByText(/mål laget/i)).toBeInTheDocument()
	expect(
		screen.getByText(/lagt i kalenderen som et datomål/i),
	).toBeInTheDocument()
})

test('an Event naming no discipline says so rather than guessing a track', async () => {
	renderStep(loaderData({ proposals: [] }))

	expect(await screen.findByText(/løpet har ingen idrett/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /lag planen/i }),
	).not.toBeInTheDocument()
})
