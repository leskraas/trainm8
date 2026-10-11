/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import NewSessionRoute from './sessions.new.tsx'

// The exercise combobox (cmdk) scrolls the selected item into view and
// observes list resizing; jsdom implements neither.
window.HTMLElement.prototype.scrollIntoView = () => {}
window.ResizeObserver ??= class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

function renderNewSession(
	exercises: Array<{
		id: string
		name: string
		primaryMuscle: string
		equipment: string | null
	}> = [],
	recentExerciseIds: string[] = [],
	defaultDiscipline: string | null = 'run',
) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/sessions/new',
			Component: (props: Record<string, unknown>) => (
				<NewSessionRoute {...(props as any)} />
			),
			loader: () => ({
				defaultDate: '2026-06-01',
				defaultTime: '08:00',
				// The prefilled Discipline the loader derives from the athlete's own
				// history (#501). `null` is its other legal value — see the test at
				// the bottom of this file.
				defaultDiscipline: defaultDiscipline as string | null,
				exercises,
				recentExerciseIds,
				disciplineProfiles: [],
			}),
			action: async ({ request }) => {
				const formData = await request.formData()
				submitted(Object.fromEntries(formData))
				return { result: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/new']} />)
	return { submitted }
}

/** A new session is honestly empty (spec §11): the Token Sentence is the sole
 * authoring surface, so seed the first step through the empty-state's "start
 * from scratch ＋" kind chooser — a cardio step lands as its 10 min seed. */
async function addFirstStep(user: ReturnType<typeof userEvent.setup>) {
	await screen.findByLabelText(/tittel/i) // wait for hydration
	await user.click(
		await screen.findByRole('button', { name: /begynn med et tomt steg/i }),
	)
	await user.click(await screen.findByRole('menuitem', { name: /kondisjon/i }))
	await screen.findByRole('button', { name: /min varighet/ })
}

/** Retype the cardio step's duration token through its popover. */
async function setDuration(
	user: ReturnType<typeof userEvent.setup>,
	value: string,
) {
	await user.click(await screen.findByRole('button', { name: /min varighet/ }))
	const input = await screen.findByLabelText('Verdi for varigheten')
	await user.clear(input)
	await user.type(input, value)
	await user.keyboard('{Escape}')
}

/** Flip the seeded cardio step to strength through its ⋮ menu (§4). */
async function makeStrength(user: ReturnType<typeof userEvent.setup>) {
	await user.click(
		screen.getByRole('button', {
			name: 'Handlinger for steg 1 av 1, blokk 1 av 1',
		}),
	)
	await user.click(
		await screen.findByRole('menuitem', { name: /gjør til styrke/i }),
	)
}

test('a new session is honestly empty — the §11 composition, nothing fabricated', async () => {
	renderNewSession()

	await screen.findByLabelText(/tittel/i) // wait for hydration

	// The empty composition: three archetype seeds and start-from-scratch.
	expect(screen.getByRole('button', { name: /rolig økt/i })).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: /intervaller/i }),
	).toBeInTheDocument()
	expect(screen.getByRole('button', { name: /styrkeøkt/i })).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: /begynn med et tomt steg/i }),
	).toBeInTheDocument()

	// Nothing fabricated: no implicit step, no stanza, no strip.
	expect(screen.queryByText(/step 1/i)).not.toBeInTheDocument()
	expect(document.querySelector('[data-score-stanza]')).toBeNull()
	expect(
		document.querySelector('[data-testid="editor-workout-shape"]'),
	).toBeNull()

	// The toggle is gone — no "Add structure" / "Remove structure" affordance.
	expect(
		screen.queryByRole('button', { name: /add structure/i }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /remove structure/i }),
	).not.toBeInTheDocument()
})

test('strength is authorable from the start — no "add structure" gate', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession([
		{
			id: 'ex-squat',
			name: 'Back Squat',
			primaryMuscle: 'quads',
			equipment: null,
		},
	])

	await user.type(await screen.findByLabelText(/tittel/i), 'Leg Day')
	await addFirstStep(user)

	// Pick the strength discipline directly; there is no gate to clear first.
	await user.click(screen.getAllByLabelText('Sport')[0]!)
	const listbox = await screen.findByRole('listbox')
	await user.click(within(listbox).getByRole('option', { name: /styrke/i }))

	// The seeded step can become a strength step immediately, from its ⋮ menu.
	await makeStrength(user)

	// The strength exercise picker is the sentence's exercise token combobox —
	// available right away, no "add structure" gate.
	await user.click(await screen.findByRole('button', { name: /velg øvelse/i }))
	await user.click(await screen.findByRole('option', { name: /back squat/i }))

	await user.click(screen.getByRole('button', { name: /lag økta/i }))

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0] as Record<string, string>
	expect(payload.discipline).toBe('strength')
	expect(payload.structure).toBe('structured')
	expect(payload['blocks[0].steps[0].kind']).toBe('strength')
})

test('a one-step submission posts structured blocks with the humane duration', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()

	await user.type(await screen.findByLabelText(/tittel/i), 'Easy Run')
	await addFirstStep(user)
	await setDuration(user, '40 min')

	await user.click(screen.getByRole('button', { name: /lag økta/i }))

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0] as Record<string, string>
	// The simple/structured toggle is gone — the UI always submits structured
	// blocks (the schema keeps accepting the simple shape for compatibility).
	expect(payload.structure).toBe('structured')
	expect(payload['blocks[0].steps[0].duration']).toBe('40 min')
	expect(payload.discipline).toBe('run')
	expect(payload.intent).toBe('endurance')
})

test('submits the intent chosen via the Select', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()

	await user.type(await screen.findByLabelText(/tittel/i), 'Tempo Run')
	await addFirstStep(user)

	await user.click(screen.getByLabelText(/formål/i))
	await user.click(await screen.findByRole('option', { name: 'Tempo' }))

	await user.click(screen.getByRole('button', { name: /lag økta/i }))

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	expect(submitted.mock.calls[0]![0].intent).toBe('tempo')
})

test('submits the discipline chosen via the Select', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()

	await user.type(await screen.findByLabelText(/tittel/i), 'Open Water Swim')
	await addFirstStep(user)

	// The workout-level Discipline is the top-level select; a step's own
	// discipline override lives in its (closed) quantity popover, so this is the
	// only "Discipline" on the page here.
	await user.click(screen.getAllByLabelText('Sport')[0]!)
	const listbox = await screen.findByRole('listbox')
	await user.click(within(listbox).getByRole('option', { name: /svømming/i }))

	await user.click(screen.getByRole('button', { name: /lag økta/i }))

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	expect(submitted.mock.calls[0]![0].discipline).toBe('swim')
})

// Intensity-kind selection (RPE and every other target kind) is authored
// through the sentence's intensity token popover now, exhaustively covered in
// `sessions.new.intensity-popover.route.test.tsx`; the deleted fieldset
// Intensity Select's field-reveal test retired with the fieldset (§12).

test('selecting an Exercise via the combobox submits its id (payload unchanged)', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession([
		{
			id: 'ex-squat',
			name: 'Back Squat',
			primaryMuscle: 'quads',
			equipment: null,
		},
		{
			id: 'ex-bench',
			name: 'Bench Press',
			primaryMuscle: 'chest',
			equipment: 'barbell',
		},
	])

	await user.type(await screen.findByLabelText(/tittel/i), 'Leg Day')
	await addFirstStep(user)

	// Switch the step to Strength so the Exercise picker renders.
	await makeStrength(user)

	// Open the exercise token combobox and pick via type-ahead.
	await user.click(await screen.findByRole('button', { name: /velg øvelse/i }))
	await user.type(await screen.findByLabelText('Søk i øvelser'), 'back')
	expect(
		screen.queryByRole('option', { name: /bench press/i }),
	).not.toBeInTheDocument()
	await user.click(await screen.findByRole('option', { name: /back squat/i }))

	await user.click(screen.getByRole('button', { name: /lag økta/i }))

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0] as Record<string, string>
	expect(payload.structure).toBe('structured')
	const exerciseEntry = Object.entries(payload).find(([key]) =>
		key.endsWith('exerciseId'),
	)
	expect(exerciseEntry?.[1]).toBe('ex-squat')
})

test('the combobox groups the loader-provided recent exercises on top', async () => {
	const user = userEvent.setup()
	renderNewSession(
		[
			{
				id: 'ex-squat',
				name: 'Back Squat',
				primaryMuscle: 'quads',
				equipment: null,
			},
			{
				id: 'ex-bench',
				name: 'Bench Press',
				primaryMuscle: 'chest',
				equipment: 'barbell',
			},
		],
		['ex-bench'],
	)

	await screen.findByLabelText(/tittel/i)
	await addFirstStep(user)
	await makeStrength(user)

	await user.click(await screen.findByRole('button', { name: /velg øvelse/i }))

	expect(await screen.findByText('Nylig brukt')).toBeInTheDocument()
	const optionNames = screen
		.getAllByRole('option')
		.map((option) => option.textContent ?? '')
	expect(optionNames[0]).toContain('Bench Press')
})

// Step-kind switching (cardio ↔ strength ↔ rest) with set-aside reconciliation
// is authored through the sentence's ⋮ menu now, exhaustively covered in
// `sessions.new.step-kind.route.test.tsx`; the deleted fieldset Kind Select's
// field-swap test retired with the fieldset (§12).

test('with no history to derive one from, no discipline is preselected', async () => {
	// ADR 0065 §5: an athlete with no history is **asked**, never assigned. The
	// route used to open on a hardcoded `run` for everybody, including swimmers.
	renderNewSession([], [], null)

	await screen.findByLabelText(/tittel/i)
	expect(screen.getAllByLabelText('Sport')[0]!).toHaveTextContent('Velg sport')
})

test('the derived discipline is what the route opens on', async () => {
	renderNewSession([], [], 'swim')

	await screen.findByLabelText(/tittel/i)
	expect(screen.getAllByLabelText('Sport')[0]!).toHaveTextContent('Svømming')
})
