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

function renderNewSession() {
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
				exercises: [],
				recentExerciseIds: [],
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
	const view = render(<App initialEntries={['/training/sessions/new']} />)
	return { submitted, view }
}

async function addStructure(user: ReturnType<typeof userEvent.setup>) {
	await screen.findByLabelText(/title/i) // wait for hydration
	await user.click(screen.getByRole('button', { name: /add structure/i }))
	await screen.findByText(/step 1/i)
}

test('the duration token opens a popover stepper that writes through to the Conform field', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')

	const trigger = await screen.findByRole('button', {
		name: 'Edit duration: 6 min',
	})
	await user.click(trigger)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)

	// The token, the popover value, and the existing form field all agree.
	expect(
		await screen.findByRole('button', { name: 'Edit duration: 7 min' }),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Duration')).toHaveValue('7 min')
})

test('focus returns to the token trigger when the popover closes', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(
		await screen.findByRole('button', { name: 'Edit duration: 6 min' }),
	)
	await screen.findByRole('button', { name: /increase duration/i })

	await user.keyboard('{Escape}')

	await waitFor(() =>
		expect(
			screen.getByRole('button', { name: 'Edit duration: 6 min' }),
		).toHaveFocus(),
	)
})

test('the distance token opens a popover stepper bound to the distance field', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Distance'), '1 km')

	await user.click(
		await screen.findByRole('button', { name: 'Edit distance: 1 km' }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase distance/i }),
	)

	expect(
		await screen.findByRole('button', { name: 'Edit distance: 1.5 km' }),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Distance')).toHaveValue('1.5 km')
})

test('the repeat-count token opens a popover stepper bound to the block repeatCount field', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	const repeatInput = screen.getByLabelText('Repeat count')
	await user.clear(repeatInput)
	await user.type(repeatInput, '4')

	await user.click(
		await screen.findByRole('button', { name: 'Edit repeat count: 4' }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase repeat count/i }),
	)

	expect(
		await screen.findByRole('button', { name: 'Edit repeat count: 5' }),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Repeat count')).toHaveValue(4 + 1)
})

test('a rest step token sets its duration from empty through the popover stepper', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	// Make the step a rest step via the existing kind select.
	await user.click(screen.getByLabelText(/kind/i))
	const listbox = await screen.findByRole('listbox')
	await user.click(within(listbox).getByRole('option', { name: 'Rest' }))

	await user.click(
		await screen.findByRole('button', { name: 'Edit rest: rest' }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase rest/i }),
	)

	expect(
		await screen.findByRole('button', { name: 'Edit rest: 1 min rest' }),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Duration')).toHaveValue('1 min')
})

test('the notes token opens a popover textarea writing through to the notes field', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.type(screen.getByLabelText('Notes'), 'strides')

	await user.click(await screen.findByRole('button', { name: 'Edit notes' }))
	const noteText = await screen.findByLabelText('Note text')
	expect(noteText).toHaveValue('strides')
	await user.type(noteText, ' after')

	expect(screen.getByLabelText('Notes')).toHaveValue('strides after')
})

test('sentence affordances add, reorder, and remove steps and blocks via Conform intents', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')

	// Add a step from the sentence — it arrives visible, with a valid default.
	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	expect(
		await screen.findByRole('button', { name: 'Edit duration: 10 min' }),
	).toBeInTheDocument()
	expect(screen.getByText(/step 2/i)).toBeInTheDocument()

	// Reorder from the new step's popover: move it earlier.
	await user.click(
		screen.getByRole('button', { name: 'Edit duration: 10 min' }),
	)
	await user.click(await screen.findByRole('button', { name: 'Move earlier' }))
	await waitFor(() => {
		const durations = screen.getAllByLabelText('Duration')
		expect(durations[0]).toHaveValue('10 min')
		expect(durations[1]).toHaveValue('6 min')
	})

	// Remove it again from its popover.
	await user.click(
		screen.getByRole('button', { name: 'Edit duration: 10 min' }),
	)
	await user.click(await screen.findByRole('button', { name: 'Remove step' }))
	await waitFor(() =>
		expect(screen.getAllByLabelText('Duration')).toHaveLength(1),
	)
	expect(screen.getByLabelText('Duration')).toHaveValue('6 min')

	// Add and remove a whole block from the sentence. The classic field UI has
	// its own "Remove block 2" button, so scope to the sentence editor.
	await user.click(screen.getByRole('button', { name: 'Add block' }))
	expect(await screen.findByText(/block 2/i)).toBeInTheDocument()
	const editor = within(
		document.querySelector('[data-token-sentence-editor]') as HTMLElement,
	)
	await user.click(editor.getByRole('button', { name: 'Remove block 2' }))
	await waitFor(() =>
		expect(screen.queryByText(/block 2/i)).not.toBeInTheDocument(),
	)
})

test('a sequence of token edits submits the same form data as the equivalent field edits', async () => {
	const user = userEvent.setup()

	// Flow A — token edits: bump the duration via the popover stepper, add a
	// step from the sentence, bump the new step's duration.
	const flowA = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Intervals')
	await user.click(screen.getByRole('button', { name: /add structure/i }))
	await screen.findByText(/step 1/i)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(
		await screen.findByRole('button', { name: 'Edit duration: 6 min' }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	await user.click(
		await screen.findByRole('button', { name: 'Edit duration: 10 min' }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(flowA.submitted).toHaveBeenCalledTimes(1))
	const tokenPayload = flowA.submitted.mock.calls[0]![0]
	flowA.view.unmount()

	// Flow B — the equivalent direct field edits.
	const flowB = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Intervals')
	await user.click(screen.getByRole('button', { name: /add structure/i }))
	await screen.findByText(/step 1/i)
	await user.type(screen.getByLabelText('Duration'), '7 min')

	await user.click(screen.getByRole('button', { name: /\+ add step/i }))
	await screen.findByText(/step 2/i)
	const durations = screen.getAllByLabelText('Duration')
	await user.type(durations[1]!, '11 min')

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(flowB.submitted).toHaveBeenCalledTimes(1))
	const fieldPayload = flowB.submitted.mock.calls[0]![0]

	expect(tokenPayload).toEqual(fieldPayload)
})

test('intensity and exercise tokens stay inert in this slice', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')

	// Author a zone-label intensity through the existing picker.
	await user.click(screen.getByLabelText('Intensity'))
	await user.click(await screen.findByRole('option', { name: 'Zone' }))
	await user.click(await screen.findByText('Select zone…'))
	await user.click(await screen.findByRole('option', { name: 'Z2' }))

	// The intensity token renders in the sentence but is not a button.
	const editor = document.querySelector('[data-token-sentence-editor]')!
	const intensityToken = await waitFor(() => {
		const el = editor.querySelector('[data-token-type="intensity"]')
		expect(el).not.toBeNull()
		return el!
	})
	expect(intensityToken.closest('button')).toBeNull()
})
