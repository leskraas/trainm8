/**
 * @vitest-environment jsdom
 *
 * The phase card's **rhythm** reading and the new-phase form (#402, ADR 0044 §4).
 *
 * Since #505 S13 an existing phase's name, length and rhythm are Sesong edits,
 * changed in _Endre sesongen_ behind a preview; the card shows which weeks
 * recover and links there. The new-phase form keeps its rhythm controls: a
 * tapering phase's weeks are *all* taper weeks — `weekRole` reads `tapers`
 * before the rhythm — so the rhythm select goes and a sentence says why, while
 * the form still posts a rhythm.
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

/** Open the card's _Navn, lengde og lett uke_ section, where the links live. */
async function openEditSection() {
	const user = userEvent.setup()
	await user.click(
		await screen.findByRole('button', { name: /^Navn, lengde og lett uke/ }),
	)
}

test('an existing phase is edited in Endre sesongen, pre-filled, and not on the card', async () => {
	renderCard()
	await openEditSection()

	const link = await screen.findByRole('link', {
		name: 'Endre navn eller lengde på en fase',
	})
	expect(link.getAttribute('href')).toBe(
		'/training/plan?edit=phase&phaseId=phase-base#season-edits',
	)
	expect(
		screen.getByRole('link', { name: 'Velg hvilken uke som er lett' }),
	).toBeInTheDocument()
	// Nothing on the card writes a name, a length or a rhythm any more.
	expect(screen.queryByRole('button', { name: 'Gi nytt navn' })).toBeNull()
	expect(screen.queryByRole('button', { name: /^Lagre/ })).toBeNull()
})

test('the recovery preview still reads the phase, with every week a taper', async () => {
	renderCard({ spec: phase({ tapers: true }) })
	await openEditSection()

	const marks = await screen.findByRole('group', { name: 'Ukenes rytme' })
	expect(within(marks).getAllByText(/: nedtrapping$/)).toHaveLength(4)
	expect(
		screen.getByText(/trapper ned mot løpet, så den har ingen lett uke/),
	).toBeInTheDocument()
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
		await screen.findByRole('checkbox', { name: 'Fasen trapper ned' }),
	)
	expect(
		screen.queryByRole('combobox', { name: 'Rytme' }),
	).not.toBeInTheDocument()

	await user.type(screen.getByLabelText('Navn'), 'Race week')
	await user.click(screen.getByRole('button', { name: 'Legg til fase' }))

	expect(Object.fromEntries(posted)).toMatchObject({
		intent: 'add-phase',
		name: 'Race week',
		rhythm: '3:1',
		tapers: 'on',
	})
})
