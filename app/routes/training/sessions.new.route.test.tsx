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

test('defaults to a single one-step sentence, with no simple/structured toggle', async () => {
	renderNewSession()

	await screen.findByLabelText(/title/i) // wait for hydration

	// A new session opens directly on the structured editor, seeded with one
	// block and one cardio step (ADR 0027 §6).
	expect(screen.getByText(/block 1/i)).toBeInTheDocument()
	expect(screen.getByText(/step 1/i)).toBeInTheDocument()
	expect(screen.queryByText(/step 2/i)).not.toBeInTheDocument()
	// The cardio step's own quantity + intensity fields are the sentence.
	expect(screen.getByLabelText('Duration')).toBeInTheDocument()
	expect(screen.getByLabelText('Intensity')).toBeInTheDocument()

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

	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')

	// Pick the strength discipline directly; there is no gate to clear first.
	await user.click(screen.getAllByLabelText('Discipline')[0]!)
	const listbox = await screen.findByRole('listbox')
	await user.click(within(listbox).getByRole('option', { name: /strength/i }))

	// The seeded step can become a strength step immediately.
	await user.click(await screen.findByLabelText(/kind/i))
	await user.click(await screen.findByRole('option', { name: 'Strength' }))

	// The strength exercise picker is the sentence's exercise token combobox —
	// available right away, no "add structure" gate.
	await user.click(
		await screen.findByRole('button', { name: /select exercise/i }),
	)
	await user.click(await screen.findByRole('option', { name: /back squat/i }))

	await user.click(screen.getByRole('button', { name: /create session/i }))

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0] as Record<string, string>
	expect(payload.discipline).toBe('strength')
	expect(payload.structure).toBe('structured')
	expect(payload['blocks[0].steps[0].kind']).toBe('strength')
})

test('a one-step submission posts structured blocks with the humane duration', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()

	await user.type(await screen.findByLabelText(/title/i), 'Easy Run')
	await user.type(screen.getByLabelText('Duration'), '40 min')

	await user.click(screen.getByRole('button', { name: /create session/i }))

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

	await user.type(await screen.findByLabelText(/title/i), 'Tempo Run')
	await user.type(screen.getByLabelText('Duration'), '40 min')

	await user.click(screen.getByLabelText(/intent/i))
	await user.click(await screen.findByRole('option', { name: 'Tempo' }))

	await user.click(screen.getByRole('button', { name: /create session/i }))

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	expect(submitted.mock.calls[0]![0].intent).toBe('tempo')
})

test('submits the discipline chosen via the Select', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()

	await user.type(await screen.findByLabelText(/title/i), 'Open Water Swim')
	await user.type(screen.getByLabelText('Duration'), '30 min')

	// The workout-level Discipline is the first of the two selects (the cardio
	// step renders its own "Discipline" too).
	await user.click(screen.getAllByLabelText('Discipline')[0]!)
	const listbox = await screen.findByRole('listbox')
	await user.click(within(listbox).getByRole('option', { name: /swim/i }))

	await user.click(screen.getByRole('button', { name: /create session/i }))

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	expect(submitted.mock.calls[0]![0].discipline).toBe('swim')
})

test('choosing an Intensity kind reveals the matching target fields', async () => {
	const user = userEvent.setup()
	renderNewSession()

	await screen.findByLabelText(/title/i) // wait for hydration

	// Cardio step renders the Intensity picker; default kind shows no target inputs.
	expect(screen.queryByText('Min RPE (1-10)')).not.toBeInTheDocument()

	await user.click(await screen.findByLabelText('Intensity'))
	await user.click(await screen.findByRole('option', { name: 'RPE' }))

	expect(await screen.findByText('Min RPE (1-10)')).toBeInTheDocument()
})

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

	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')

	// Switch the step to Strength so the Exercise picker renders.
	await user.click(await screen.findByLabelText(/kind/i))
	await user.click(await screen.findByRole('option', { name: 'Strength' }))

	// Open the exercise token combobox and pick via type-ahead.
	await user.click(
		await screen.findByRole('button', { name: /select exercise/i }),
	)
	await user.type(await screen.findByLabelText('Search exercises'), 'back')
	expect(
		screen.queryByRole('option', { name: /bench press/i }),
	).not.toBeInTheDocument()
	await user.click(await screen.findByRole('option', { name: /back squat/i }))

	await user.click(screen.getByRole('button', { name: /create session/i }))

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

	await screen.findByLabelText(/title/i)
	await user.click(await screen.findByLabelText(/kind/i))
	await user.click(await screen.findByRole('option', { name: 'Strength' }))

	await user.click(
		await screen.findByRole('button', { name: /select exercise/i }),
	)

	expect(await screen.findByText('Recent')).toBeInTheDocument()
	const optionNames = screen
		.getAllByRole('option')
		.map((option) => option.textContent ?? '')
	expect(optionNames[0]).toContain('Bench Press')
})

test('changing a step Kind reactively swaps in the matching fields', async () => {
	const user = userEvent.setup()
	renderNewSession()

	await screen.findByLabelText(/title/i) // wait for hydration

	// Cardio is the default kind, so the per-step Discipline field is rendered
	// alongside the top-level workout Discipline (two matches).
	await waitFor(() =>
		expect(screen.getAllByLabelText('Discipline')).toHaveLength(2),
	)

	await user.click(screen.getByLabelText(/kind/i))
	const listbox = await screen.findByRole('listbox')
	await user.click(within(listbox).getByRole('option', { name: 'Rest' }))

	// Rest fields have no Discipline select, so only the top-level one survives.
	await waitFor(() =>
		expect(screen.getAllByLabelText('Discipline')).toHaveLength(1),
	)
})
