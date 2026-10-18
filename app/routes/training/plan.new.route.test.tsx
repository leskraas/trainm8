/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import NewPlanRoute from './plan.new.tsx'

type Candidate = {
	id: string
	name: string
	kind: string
	startDate: Date
	endDate: Date | null
	disciplines: string[]
	plannedOutlineId: string | null
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
	return {
		id: 'event-1',
		name: 'Spring Half Marathon',
		kind: 'race',
		startDate: new Date('2030-03-05T09:00:00Z'),
		endDate: null,
		disciplines: ['run'],
		plannedOutlineId: null,
		...overrides,
	}
}

type OpenEnded = {
	outlineId: string | null
	hoursByDiscipline: Partial<Record<'run' | 'bike' | 'swim', number>>
	defaultDiscipline: 'run' | 'bike' | 'swim'
}

function renderStep(
	candidates: Candidate[] = [candidate()],
	openEnded: OpenEnded = {
		outlineId: null,
		hoursByDiscipline: {},
		defaultDiscipline: 'run',
	},
	/** No plan yet: Plan invites to the start (ADR 0101 §4). */
	startInvite = false,
) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/plan/new',
			Component: (props: Record<string, unknown>) => (
				<NewPlanRoute {...(props as any)} />
			),
			loader: () => ({
				candidates,
				defaultDate: '2030-01-09',
				openEnded,
				roundWeeks: 4,
				libraryLifts: [],
				startInvite,
			}),
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return { result: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan/new']} />)
	return { submitted }
}

test('the flow opens by asking what the athlete is building toward, as Plan’s landing (ADR 0083, ADR 0101)', async () => {
	renderStep()

	expect(
		await screen.findByRole('heading', { name: 'Plan', level: 1 }),
	).toBeInTheDocument()
	expect(screen.getByText('Hva bygger du mot?')).toBeInTheDocument()
	// A tab's landing page: the tab bar is the way out, not a back arrow.
	expect(
		screen.queryByRole('link', { name: /^back to/i }),
	).not.toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Alle løp' })).toHaveAttribute(
		'href',
		'/training/events',
	)
})

test('with no plan, Plan still holds Bibliotek, with nothing lifted yet said in words (ADR 0101)', async () => {
	renderStep()

	const library = within(
		await screen.findByRole('region', { name: 'Bibliotek' }),
	)
	expect(library.getByRole('link', { name: /katalog/i })).toHaveAttribute(
		'href',
		'/training/catalogue',
	)
	expect(
		library.getByText(/løftene du legger inn i en økt/i),
	).toBeInTheDocument()
})

test('an upcoming Event is offered as the plan’s anchor', async () => {
	renderStep()

	expect(await screen.findByText('Spring Half Marathon')).toBeInTheDocument()
	expect(screen.getByText(/5\. mar 2030/)).toBeInTheDocument()
	expect(
		screen.getByRole('link', { name: /planlegg mot dette løpet/i }),
	).toHaveAttribute('href', '/training/plan/new/event-1')
})

test('an Event that already has a plan says so instead of offering itself', async () => {
	renderStep([candidate({ plannedOutlineId: 'outline-1' })])

	expect(await screen.findByText(/har allerede en plan/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('link', { name: /planlegg mot dette løpet/i }),
	).not.toBeInTheDocument()
	expect(screen.getByRole('link', { name: /åpne planen/i })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1',
	)
})

test('with nothing on the calendar the athlete is pointed at the goal step', async () => {
	renderStep([])

	expect(
		await screen.findByText(/ingenting i kalenderen ennå/i),
	).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: /lag målet og gå videre/i }),
	).toBeInTheDocument()
})

test('setting a goal submits a named, dated goal in a discipline', async () => {
	const user = userEvent.setup()
	const { submitted } = renderStep()

	await user.type(await screen.findByLabelText(/^mål$/i), 'Sub-40 10k shape')
	await user.clear(screen.getByLabelText(/^dato$/i))
	await user.type(screen.getByLabelText(/^dato$/i), '2030-06-01')
	await user.click(
		within(
			screen.getByRole('region', { name: /eller sett et mål/i }),
		).getByRole('radio', { name: 'Sykling' }),
	)
	await user.click(
		screen.getByRole('button', { name: /lag målet og gå videre/i }),
	)

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			name: 'Sub-40 10k shape',
			startDate: '2030-06-01',
			discipline: 'bike',
		}),
	)
})

test('the goal step says out loud that it creates a calendar entry', async () => {
	renderStep()

	// Never created behind the athlete's back (ADR 0039): the step states what it
	// will write before it writes it.
	expect(
		await screen.findByText(/lager et datomål i kalenderen din/i),
	).toBeInTheDocument()
})

test('“Hold meg aktiv” is offered as a plan with no race and no end', async () => {
	renderStep([])

	expect(
		await screen.findByRole('heading', { name: 'Hold meg aktiv' }),
	).toBeInTheDocument()
	expect(screen.getByText(/ingen løp og ingen sluttdato/i)).toBeInTheDocument()
})

test('“Hold meg aktiv” submits a discipline and hours a week, pre-filled from history', async () => {
	const user = userEvent.setup()
	const { submitted } = renderStep([], {
		outlineId: null,
		hoursByDiscipline: { run: 3.5, bike: 5 },
		defaultDiscipline: 'bike',
	})

	const section = within(
		await screen.findByRole('region', { name: 'Hold meg aktiv' }),
	)
	expect(section.getByLabelText(/timer i uka/i)).toHaveValue(5)
	await user.click(section.getByRole('radio', { name: 'Løping' }))
	expect(section.getByLabelText(/timer i uka/i)).toHaveValue(3.5)
	await user.clear(section.getByLabelText(/timer i uka/i))
	await user.type(section.getByLabelText(/timer i uka/i), '4')
	await user.click(section.getByRole('button', { name: /lag planen/i }))

	expect(submitted).toHaveBeenCalledWith({
		intent: 'open-ended',
		discipline: 'run',
		hours: '4',
	})
})

test('an athlete who already has an open-ended plan is sent to it instead', async () => {
	renderStep([], {
		outlineId: 'outline-9',
		hoursByDiscipline: {},
		defaultDiscipline: 'run',
	})

	expect(
		await screen.findByRole('link', { name: /åpne planen/i }),
	).toHaveAttribute('href', '/training/plan?outline=outline-9')
	expect(
		screen.queryByRole('button', { name: /lag planen/i }),
	).not.toBeInTheDocument()
})

test('an athlete with no plan is invited to the start above setting a season up', async () => {
	renderStep(undefined, undefined, true)

	const invite = await screen.findByRole('region', {
		name: 'Du har ingen plan ennå',
	})
	expect(
		within(invite).getByRole('link', { name: 'Kom i gang' }),
	).toHaveAttribute('href', '/start')
	// The expert path stays, below it.
	expect(
		invite.compareDocumentPosition(screen.getByText('Hva bygger du mot?')) &
			Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()
})

test('an athlete who has a plan is not invited to the start', async () => {
	renderStep()

	await screen.findByText('Hva bygger du mot?')
	expect(
		screen.queryByRole('region', { name: 'Du har ingen plan ennå' }),
	).not.toBeInTheDocument()
})
