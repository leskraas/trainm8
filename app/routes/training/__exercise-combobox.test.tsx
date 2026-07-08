/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React from 'react'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { ExerciseCombobox, type ExerciseItem } from './__exercise-combobox.tsx'

// cmdk scrolls the selected item into view and observes list resizing;
// jsdom implements neither.
window.HTMLElement.prototype.scrollIntoView = () => {}
window.ResizeObserver ??= class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

const CATALOG: ExerciseItem[] = [
	{
		id: 'ex-squat',
		name: 'Back Squat',
		primaryMuscle: 'quads',
		equipment: 'barbell',
	},
	{
		id: 'ex-bench',
		name: 'Bench Press',
		primaryMuscle: 'chest',
		equipment: 'barbell',
	},
	{
		id: 'ex-split-squat',
		name: 'Bulgarian Split Squat',
		primaryMuscle: 'quads',
		equipment: 'dumbbell',
	},
	{
		id: 'ex-push-up',
		name: 'Push-up',
		primaryMuscle: 'chest',
		equipment: null,
	},
]

function Harness({
	exercises = CATALOG,
	recentExerciseIds = [],
}: {
	exercises?: ExerciseItem[]
	recentExerciseIds?: string[]
}) {
	const [value, setValue] = React.useState('')
	return (
		<div>
			<label htmlFor="exercise-combobox">Exercise</label>
			<ExerciseCombobox
				id="exercise-combobox"
				exercises={exercises}
				recentExerciseIds={recentExerciseIds}
				value={value}
				onChange={setValue}
			/>
			<output data-testid="selected-id">{value}</output>
		</div>
	)
}

function renderCombobox(props: React.ComponentProps<typeof Harness> = {}) {
	const createAction = vi.fn()
	const App = createRoutesStub([
		{ path: '/', Component: () => <Harness {...props} /> },
		{
			path: '/training/exercises',
			action: async ({ request }) => {
				const formData = await request.formData()
				const entries = Object.fromEntries(formData)
				createAction(entries)
				return {
					exercise: { id: 'ex-created', name: entries.name as string },
				}
			},
		},
	])
	render(<App initialEntries={['/']} />)
	return { createAction }
}

async function openCombobox(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByLabelText('Exercise'))
	return await screen.findByLabelText('Search exercises')
}

function visibleOptionNames() {
	return screen.getAllByRole('option').map((option) => option.textContent ?? '')
}

test('typing filters the catalog by name', async () => {
	const user = userEvent.setup()
	renderCombobox()

	const input = await openCombobox(user)

	// Full catalog listed before any query.
	expect(visibleOptionNames().join(' ')).toContain('Back Squat')
	expect(visibleOptionNames().join(' ')).toContain('Push-up')

	await user.type(input, 'split')

	const names = visibleOptionNames().join(' ')
	expect(names).toContain('Bulgarian Split Squat')
	expect(names).not.toContain('Back Squat')
	expect(names).not.toContain('Bench Press')
	expect(names).not.toContain('Push-up')
})

test('muscle and equipment chips narrow results and compose with the query', async () => {
	const user = userEvent.setup()
	renderCombobox()

	await openCombobox(user)

	// Muscle chip: only quads exercises remain.
	await user.click(
		screen.getByRole('button', { name: 'Quads', pressed: false }),
	)
	let names = visibleOptionNames().join(' ')
	expect(names).toContain('Back Squat')
	expect(names).toContain('Bulgarian Split Squat')
	expect(names).not.toContain('Bench Press')

	// Equipment chip composes: quads + barbell leaves only the Back Squat.
	await user.click(
		screen.getByRole('button', { name: 'Barbell', pressed: false }),
	)
	names = visibleOptionNames().join(' ')
	expect(names).toContain('Back Squat')
	expect(names).not.toContain('Bulgarian Split Squat')

	// The text query composes with the active chips.
	await user.type(screen.getByLabelText('Search exercises'), 'zzz')
	expect(screen.queryByRole('option', { name: /back squat/i })).toBeNull()

	// Toggling a chip off widens results again.
	await user.clear(screen.getByLabelText('Search exercises'))
	await user.click(
		screen.getByRole('button', { name: 'Barbell', pressed: true }),
	)
	names = visibleOptionNames().join(' ')
	expect(names).toContain('Bulgarian Split Squat')
})

test('recently used exercises are grouped on top', async () => {
	const user = userEvent.setup()
	renderCombobox({ recentExerciseIds: ['ex-split-squat', 'ex-bench'] })

	await openCombobox(user)

	expect(screen.getByText('Recent')).toBeInTheDocument()
	expect(screen.getByText('All exercises')).toBeInTheDocument()

	// The recent exercises come first, in recent order, before the rest.
	const names = visibleOptionNames()
	expect(names[0]).toContain('Bulgarian Split Squat')
	expect(names[1]).toContain('Bench Press')
	// …and are not duplicated in the All group.
	expect(names.filter((name) => name.includes('Bench Press'))).toHaveLength(1)
})

test('selecting an exercise binds its id and closes the popover', async () => {
	const user = userEvent.setup()
	renderCombobox()

	await openCombobox(user)
	await user.click(screen.getByRole('option', { name: /bench press/i }))

	expect(screen.getByTestId('selected-id')).toHaveTextContent('ex-bench')
	await waitFor(() =>
		expect(screen.queryByLabelText('Search exercises')).toBeNull(),
	)
	// The trigger now shows the selected exercise.
	expect(screen.getByLabelText('Exercise')).toHaveTextContent('Bench Press')
})

test('inline create posts to the exercises action and selects the result', async () => {
	const user = userEvent.setup()
	const { createAction } = renderCombobox()

	const input = await openCombobox(user)
	await user.type(input, 'Nordic Curl')

	await user.click(
		screen.getByRole('option', { name: /create "nordic curl"/i }),
	)

	// The inline flow asks for the required primary muscle instead of guessing.
	expect(
		await screen.findByText(/primary muscle for "nordic curl"/i),
	).toBeInTheDocument()
	await user.click(await screen.findByRole('option', { name: 'Hamstrings' }))

	await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
	expect(createAction.mock.calls[0]![0]).toEqual({
		name: 'Nordic Curl',
		primaryMuscle: 'hamstrings',
	})

	// The created exercise is selected without leaving the flow.
	await waitFor(() =>
		expect(screen.getByTestId('selected-id')).toHaveTextContent('ex-created'),
	)
	expect(screen.getByLabelText('Exercise')).toHaveTextContent('Nordic Curl')
})

test('the create row only appears when there is no exact name match', async () => {
	const user = userEvent.setup()
	renderCombobox()

	const input = await openCombobox(user)

	// No query → no create row.
	expect(screen.queryByRole('option', { name: /create "/i })).toBeNull()

	// Exact (case-insensitive) match → no create row.
	await user.type(input, 'back squat')
	expect(screen.queryByRole('option', { name: /create "/i })).toBeNull()

	// Partial match → create row offered.
	await user.clear(input)
	await user.type(input, 'back sq')
	expect(
		screen.getByRole('option', { name: /create "back sq"/i }),
	).toBeInTheDocument()
})
