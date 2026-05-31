/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import NewSessionRoute from './sessions.new.tsx'

function renderNewSession(
	exercises: Array<{
		id: string
		name: string
		primaryMuscle: string
		equipment: string | null
	}> = [],
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

test('submits the intent chosen via the Select', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()

	await user.type(await screen.findByLabelText(/title/i), 'Tempo Run')

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

	// The top-level workout Discipline select (the per-step discipline field,
	// migrated separately, shares the label so we take the first match).
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

	await user.click(screen.getByLabelText('Intensity'))
	await user.click(await screen.findByRole('option', { name: 'RPE' }))

	expect(await screen.findByText('Min RPE (1-10)')).toBeInTheDocument()
})

test('selecting an Exercise on a strength step submits its id', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession([
		{
			id: 'ex-squat',
			name: 'Back Squat',
			primaryMuscle: 'legs',
			equipment: null,
		},
	])

	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')

	// Switch the step to Strength so the Exercise picker renders.
	await user.click(screen.getByLabelText(/kind/i))
	await user.click(await screen.findByRole('option', { name: 'Strength' }))

	await user.click(await screen.findByLabelText('Exercise'))
	await user.click(await screen.findByRole('option', { name: 'Back Squat' }))

	await user.click(screen.getByRole('button', { name: /create session/i }))

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0] as Record<string, string>
	const exerciseEntry = Object.entries(payload).find(([key]) =>
		key.endsWith('exerciseId'),
	)
	expect(exerciseEntry?.[1]).toBe('ex-squat')
})

test('changing a step Kind reactively swaps in the matching fields', async () => {
	const user = userEvent.setup()
	renderNewSession()

	await screen.findByLabelText(/title/i) // wait for hydration

	// Cardio is the default kind, so the per-step Discipline field is rendered
	// alongside the top-level workout Discipline (two matches).
	expect(screen.getAllByLabelText('Discipline')).toHaveLength(2)

	await user.click(screen.getByLabelText(/kind/i))
	const listbox = await screen.findByRole('listbox')
	await user.click(within(listbox).getByRole('option', { name: 'Rest' }))

	// Rest fields have no Discipline select, so only the top-level one survives.
	await waitFor(() =>
		expect(screen.getAllByLabelText('Discipline')).toHaveLength(1),
	)
})
