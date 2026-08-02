/**
 * @vitest-environment jsdom
 *
 * The phase card's **rhythm** controls (#402, ADR 0044 §4).
 *
 * One thing is under test here and it is a copy question as much as a wiring one:
 * a tapering phase's weeks are *all* taper weeks — `weekRole` reads `tapers` before
 * it reads the rhythm — so a loading rhythm chosen on one changes nothing. ADR 0044
 * §8 rules that state out, so the control goes and a sentence says why. What the
 * form still has to do is carry the stored rhythm through the save, or a phase that
 * later stops tapering would come back on whatever the action defaults to.
 *
 * The rest of the card is covered where it is used, in `plan.route.test.tsx`.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import {
	AddPhaseForm,
	PhaseCard,
	type EditablePhase,
} from './__phase-editor.tsx'

/** A four-week block on a 3:1 rhythm, opening the plan on a Monday. */
function phase(overrides: Partial<EditablePhase> = {}): EditablePhase {
	return {
		id: 'phase-base',
		name: 'Base',
		weeks: 4,
		rhythm: '3:1',
		tapers: false,
		fromWeekInPlan: 1,
		toWeekInPlan: 4,
		startsAt: new Date('2030-01-07T00:00:00.000Z'),
		...overrides,
	}
}

function renderCard({
	spec = phase(),
	action,
}: {
	spec?: EditablePhase
	action?: (args: { request: Request }) => unknown
} = {}) {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				// Opened, because the controls under test live in the body of the card.
				<PhaseCard
					phase={spec}
					position={0}
					phaseCount={2}
					isCurrent
					timezone="UTC"
				/>
			),
			action: action as never,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan']} />)
}

test('a phase that does not taper chooses its loading rhythm', async () => {
	renderCard()

	expect(
		await screen.findByRole('combobox', { name: 'Loading rhythm' }),
	).toBeInTheDocument()
	expect(screen.queryByText(/no loading rhythm to set/)).not.toBeInTheDocument()
})

test('a tapering phase offers no loading rhythm, and says why', async () => {
	renderCard({ spec: phase({ tapers: true }) })

	// Not a disabled select and not a select that does nothing: the control is gone
	// and the reason is on the page (ADR 0044 §8).
	expect(
		await screen.findByText(
			/A tapering phase’s weeks are all taper weeks, so there is no loading rhythm to set/,
		),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('combobox', { name: 'Loading rhythm' }),
	).not.toBeInTheDocument()
})

test('the stored rhythm still travels on a tapering phase, so saving cannot lose it', async () => {
	const user = userEvent.setup()
	let posted: Array<[string, string]> = []
	renderCard({
		spec: phase({ rhythm: '2:1', tapers: true }),
		action: async ({ request }) => {
			posted = [...(await request.formData()).entries()] as Array<
				[string, string]
			>
			return null
		},
	})

	await user.click(await screen.findByRole('button', { name: 'Save rhythm' }))

	// `set-phase-rhythm` rewrites both fields every time, so a phase that stops
	// tapering has to find the rhythm it came in with.
	expect(posted).toEqual([
		['intent', 'set-phase-rhythm'],
		['phaseId', 'phase-base'],
		['rhythm', '2:1'],
		['tapers', 'on'],
	])
})

test('the recovery preview still reads the phase, with every week a taper', async () => {
	renderCard({ spec: phase({ tapers: true }) })

	const marks = await screen.findByRole('group', { name: 'Week roles' })
	expect(within(marks).getAllByText(/: Taper$/)).toHaveLength(4)
	expect(
		screen.getByText(
			/steps down toward your event, so it holds no recovery week/,
		),
	).toBeInTheDocument()
})

test('checking “This phase tapers” takes the rhythm away as it is checked', async () => {
	const user = userEvent.setup()
	renderCard()

	await user.click(
		await screen.findByRole('checkbox', { name: 'This phase tapers' }),
	)

	// The consequence is visible *before* the save, the way the recovery marks are.
	expect(
		screen.queryByRole('combobox', { name: 'Loading rhythm' }),
	).not.toBeInTheDocument()
	expect(screen.getByText(/no loading rhythm to set/)).toBeInTheDocument()
})

test('the new-phase form follows the same rule, and still posts a rhythm', async () => {
	const user = userEvent.setup()
	let posted: Array<[string, string]> = []
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<AddPhaseForm
					outlineId="outline-1"
					phases={[{ id: 'phase-base', name: 'Base' }]}
				/>
			),
			action: (async ({ request }: { request: Request }) => {
				posted = [...(await request.formData()).entries()] as Array<
					[string, string]
				>
				return null
			}) as never,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan']} />)

	await user.click(
		await screen.findByRole('checkbox', { name: 'This phase tapers' }),
	)
	expect(
		screen.queryByRole('combobox', { name: 'Loading rhythm' }),
	).not.toBeInTheDocument()

	await user.type(screen.getByLabelText('Name'), 'Race week')
	await user.click(screen.getByRole('button', { name: 'Add phase' }))

	expect(Object.fromEntries(posted)).toMatchObject({
		intent: 'add-phase',
		name: 'Race week',
		rhythm: '3:1',
		tapers: 'on',
	})
})
