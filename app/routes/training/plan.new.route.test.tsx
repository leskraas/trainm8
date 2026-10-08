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

test('the flow opens by asking what the athlete is building toward', async () => {
	renderStep()

	expect(
		await screen.findByRole('heading', {
			name: /what are you building toward/i,
		}),
	).toBeInTheDocument()
})

test('an upcoming Event is offered as the plan’s anchor', async () => {
	renderStep()

	expect(await screen.findByText('Spring Half Marathon')).toBeInTheDocument()
	expect(screen.getByText(/5 Mar 2030/)).toBeInTheDocument()
	expect(
		screen.getByRole('link', { name: /plan for this event/i }),
	).toHaveAttribute('href', '/training/plan/new/event-1')
})

test('an Event that already has a plan says so instead of offering itself', async () => {
	renderStep([candidate({ plannedOutlineId: 'outline-1' })])

	expect(await screen.findByText(/already has a plan/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('link', { name: /plan for this event/i }),
	).not.toBeInTheDocument()
	expect(screen.getByRole('link', { name: /open its plan/i })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1',
	)
})

test('with nothing on the calendar the athlete is pointed at the goal step', async () => {
	renderStep([])

	expect(
		await screen.findByText(/nothing on the calendar yet/i),
	).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: /create goal and continue/i }),
	).toBeInTheDocument()
})

test('setting a goal submits a named, dated goal in a discipline', async () => {
	const user = userEvent.setup()
	const { submitted } = renderStep()

	await user.type(await screen.findByLabelText(/^goal$/i), 'Sub-40 10k shape')
	await user.clear(screen.getByLabelText(/^date$/i))
	await user.type(screen.getByLabelText(/^date$/i), '2030-06-01')
	await user.click(
		within(screen.getByRole('region', { name: /or set a goal/i })).getByRole(
			'radio',
			{ name: 'Ride' },
		),
	)
	await user.click(
		screen.getByRole('button', { name: /create goal and continue/i }),
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
		await screen.findByText(/creates a dated fitness goal on your calendar/i),
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
	await user.click(section.getByRole('radio', { name: 'Run' }))
	expect(section.getByLabelText(/timer i uka/i)).toHaveValue(3.5)
	await user.clear(section.getByLabelText(/timer i uka/i))
	await user.type(section.getByLabelText(/timer i uka/i), '4')
	await user.click(section.getByRole('button', { name: /lag planen/i }))

	expect(submitted).toHaveBeenCalledWith({
		intent: 'open-ended',
		discipline: 'run',
		weeklyHours: '4',
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
