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

// A new session opens directly on the one-step structured editor (ADR 0027
// §6): the simple/structured toggle is gone, so there is nothing to click —
// just wait for the seeded Step 1 to hydrate.
async function addStructure(_user: ReturnType<typeof userEvent.setup>) {
	await screen.findByLabelText(/title/i) // wait for hydration
	await screen.findByText(/step 1/i)
}

// Flip the seeded step to a strength step through the classic Kind select, so
// its sentence reads as the exercise + set-notation tokens.
async function makeStrengthStep(user: ReturnType<typeof userEvent.setup>) {
	await user.click(await screen.findByLabelText(/kind/i))
	await user.click(await screen.findByRole('option', { name: 'Strength' }))
}

test('the duration token opens a popover stepper that writes through to the Conform field', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')

	const trigger = await screen.findByRole('button', {
		name: /^6 min duration/,
	})
	await user.click(trigger)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)

	// The token, the popover value, and the existing form field all agree.
	expect(
		await screen.findByRole('button', { name: /^7 min duration/ }),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Duration')).toHaveValue('7 min')
})

test('focus returns to the token trigger when the popover closes', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)
	await screen.findByRole('button', { name: /increase duration/i })

	await user.keyboard('{Escape}')

	await waitFor(() =>
		expect(
			screen.getByRole('button', { name: /^6 min duration/ }),
		).toHaveFocus(),
	)
})

test('the distance token opens a popover stepper bound to the distance field', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Distance'), '1 km')

	await user.click(
		await screen.findByRole('button', { name: /^1 km distance/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase distance/i }),
	)

	expect(
		await screen.findByRole('button', { name: /^1\.5 km distance/ }),
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
		await screen.findByRole('button', { name: /^repeated 4 times/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase repeat count/i }),
	)

	expect(
		await screen.findByRole('button', { name: /^repeated 5 times/ }),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Repeat count')).toHaveValue(4 + 1)
})

test('the editor renders the live Workout Shape and brackets a repeat block as its count changes', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	// The Workout Shape rides under the sentence, live from the draft; the
	// seeded one-step block has no repeat yet, so no bracket.
	const shape = await screen.findByTestId('editor-workout-shape')
	expect(within(shape).queryByTestId('profile-bracket')).toBeNull()

	// Raising the repeat count re-derives the shape live (no submit) — the
	// grouped bars gain a `× N` bracket from the same shared diagram.
	const repeatInput = screen.getByLabelText('Repeat count')
	await user.clear(repeatInput)
	await user.type(repeatInput, '3')

	await waitFor(() =>
		expect(
			within(screen.getByTestId('editor-workout-shape')).getByTestId(
				'profile-bracket',
			),
		).toHaveTextContent('× 3'),
	)
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
		await screen.findByRole('button', { name: /^rest, step/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase rest/i }),
	)

	expect(
		await screen.findByRole('button', { name: /^1 min rest, step/ }),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Duration')).toHaveValue('1 min')
})

test('the notes token opens a popover textarea writing through to the notes field', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.type(screen.getByLabelText('Notes'), 'strides')

	await user.click(await screen.findByRole('button', { name: /^note: strides/ }))
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
		await screen.findByRole('button', { name: /^10 min duration/ }),
	).toBeInTheDocument()
	expect(screen.getByText(/step 2/i)).toBeInTheDocument()

	// Reorder from the new step's popover: move it earlier.
	await user.click(
		screen.getByRole('button', { name: /^10 min duration/ }),
	)
	await user.click(await screen.findByRole('button', { name: 'Move earlier' }))
	await waitFor(() => {
		const durations = screen.getAllByLabelText('Duration')
		expect(durations[0]).toHaveValue('10 min')
		expect(durations[1]).toHaveValue('6 min')
	})

	// Remove it again from its popover.
	await user.click(
		screen.getByRole('button', { name: /^10 min duration/ }),
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
	await screen.findByText(/step 1/i)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	await user.click(
		await screen.findByRole('button', { name: /^10 min duration/ }),
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

test('intensity tokens are editable via the popover in this slice', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')

	// Author a zone-label intensity through the shared intensity editor.
	await user.click(screen.getByLabelText('Intensity'))
	await user.click(await screen.findByRole('option', { name: 'Zone' }))
	await user.click(await screen.findByText('Select zone…'))
	await user.click(await screen.findByRole('option', { name: 'Z2' }))

	// The intensity token now renders as its own popover trigger (slice 5/9),
	// no longer inert — the sentence's intensity is editable in place.
	const editor = document.querySelector('[data-token-sentence-editor]')!
	const intensityToken = await waitFor(() => {
		const el = editor.querySelector('[data-token-type="intensity"]')
		expect(el).not.toBeNull()
		return el!
	})
	const trigger = intensityToken.closest('button')
	expect(trigger).not.toBeNull()
	expect(trigger).toHaveAttribute('data-token-editor', 'intensity')
})

// A run profile whose LTHR + HR zone recipe let a %-of-threshold target
// resolve to a concrete zone chip and bpm range.
const RUN_PROFILE = {
	discipline: 'run',
	lthr: 168,
	maxHr: 190,
	ftp: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'friel-hr-5-run',
	zoneOverrides: null,
}

function renderWithProfile() {
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
				disciplineProfiles: [RUN_PROFILE],
			}),
			action: async () => ({ result: null }),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/new']} />)
}

test('editing the intensity re-resolves the sentence zone chip and bpm facet live', async () => {
	const user = userEvent.setup()
	renderWithProfile()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	// Author an HR %-of-LTHR target through the shared intensity editor.
	await user.click(screen.getByLabelText('Intensity'))
	await user.click(await screen.findByRole('option', { name: 'HR (%)' }))
	await user.type(screen.getByLabelText('Min %'), '95')
	await user.type(screen.getByLabelText(/Max %/), '99')

	// The stanza's intensity chip carries the authored value as content and
	// its zone-equivalent step as the tint — computed live from the profile,
	// not authored (spec §7.2). 95–99% LTHR sits in friel Z4.
	const editor = document.querySelector('[data-token-sentence-editor]')!
	await waitFor(() => {
		const el = editor.querySelector('[data-token-type="intensity"]')!
		expect(el.textContent).toMatch(/95–99% LTHR/)
		expect(el).toHaveAttribute('data-zone-step', '4')
	})

	// Change the percentage: the zone-equivalent tint re-resolves without a
	// submit — 80–99% LTHR's midpoint lands in friel Z2.
	const minPct = screen.getByLabelText('Min %')
	await user.clear(minPct)
	await user.type(minPct, '80')
	await waitFor(() => {
		const el = editor.querySelector('[data-token-type="intensity"]')!
		expect(el.textContent).toMatch(/80–99% LTHR/)
		expect(el).toHaveAttribute('data-zone-step', '2')
	})
})

// ——— Strength: exercise + set-notation tokens (slice 9/9) ————————————————

test('the sets popover edits the full set list; the payload matches the classic set-row fields', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')
	await makeStrengthStep(user)

	// The strength step reads as compact set notation; the seeded set is `1 × 5`.
	await user.click(
		await screen.findByRole('button', { name: 'Edit sets: 1 × 5' }),
	)

	// Load the first set.
	await user.type(screen.getByLabelText('Set 1 kg'), '80')

	// Add a second set from the popover. Structure edits re-seed the field-list
	// keys, so the popover closes (like the step actions) — reopen it to edit
	// the new set.
	await user.click(screen.getByRole('button', { name: '+ Add set' }))
	await user.click(await screen.findByRole('button', { name: /edit sets:/i }))
	const secondReps = await screen.findByLabelText('Set 2 reps')
	await user.clear(secondReps)
	await user.type(secondReps, '3')
	await user.type(screen.getByLabelText('Set 2 kg'), '90')

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]

	// The submitted set fields are exactly what the old fixed-width set rows
	// produced: kind, the quantity, the load, and a position-based orderIndex.
	expect(payload['blocks[0].steps[0].kind']).toBe('strength')
	expect(payload['blocks[0].steps[0].sets[0].kind']).toBe('reps')
	expect(payload['blocks[0].steps[0].sets[0].reps']).toBe('5')
	expect(payload['blocks[0].steps[0].sets[0].weightKg']).toBe('80')
	expect(payload['blocks[0].steps[0].sets[0].orderIndex']).toBe('0')
	expect(payload['blocks[0].steps[0].sets[1].kind']).toBe('reps')
	expect(payload['blocks[0].steps[0].sets[1].reps']).toBe('3')
	expect(payload['blocks[0].steps[0].sets[1].weightKg']).toBe('90')
	expect(payload['blocks[0].steps[0].sets[1].orderIndex']).toBe('1')
})

test('a set switched to timed submits seconds, and the notation reads its duration', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Plank Day')
	await makeStrengthStep(user)

	await user.click(
		await screen.findByRole('button', { name: 'Edit sets: 1 × 5' }),
	)

	// Switch the set kind to Timed; the reps input gives way to a seconds input.
	await user.click(screen.getByLabelText('Set 1 kind'))
	await user.click(await screen.findByRole('option', { name: 'Timed' }))
	await user.type(await screen.findByLabelText('Set 1 seconds'), '45')

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]
	expect(payload['blocks[0].steps[0].sets[0].kind']).toBe('timed')
	expect(payload['blocks[0].steps[0].sets[0].durationSec']).toBe('45')
})

test('kg and %1RM stay mutually exclusive per set — entering one clears the other', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')
	await makeStrengthStep(user)

	await user.click(
		await screen.findByRole('button', { name: 'Edit sets: 1 × 5' }),
	)

	const kg = screen.getByLabelText('Set 1 kg')
	const pct = screen.getByLabelText('Set 1 %1RM')
	await user.type(kg, '80')
	expect(kg).toHaveValue(80)

	// Entering a %1RM clears the kg field in place — the UI never lets both hold
	// a value (the schema's weight-XOR-pct rule).
	await user.type(pct, '75')
	expect(pct).toHaveValue(75)
	expect(kg).toHaveValue(null)

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]
	expect(payload['blocks[0].steps[0].sets[0].weightKg']).toBe('')
	expect(payload['blocks[0].steps[0].sets[0].pct1RM']).toBe('75')
})

test('rest-between-sets renders as the sentence rest facet and is editable there', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')
	await makeStrengthStep(user)

	// Give the step a rest; the facet then reads in the sentence.
	await user.type(
		screen.getByRole('spinbutton', { name: /rest between sets/i }),
		'90',
	)

	await user.click(
		await screen.findByRole('button', { name: /^1 min 30 s rest between sets/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase rest/i }),
	)

	// The facet, the popover, and the underlying field all agree (close the
	// popover first — while it traps focus, outside fields are aria-hidden).
	expect(
		await screen.findByRole('button', { name: /^1 min 45 s rest between sets/ }),
	).toBeInTheDocument()
	await user.keyboard('{Escape}')
	expect(
		await screen.findByRole('spinbutton', { name: /rest between sets/i }),
	).toHaveValue(105)
})

// ——— The retargeting popover (spec §2.4 + §9, #252) ——————————————————————

test('activating another token retargets the open popover in place — same popup, swapped content', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.type(screen.getByLabelText('Notes'), 'strides')

	// Open on the duration token: the popover leads with the type-to-edit value.
	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)
	const popup = await waitFor(() => {
		const el = document.querySelector('[data-slot="token-popover"]')
		expect(el).not.toBeNull()
		return el as HTMLElement
	})
	expect(within(popup).getByLabelText('Duration value')).toHaveValue('6 min')

	// Activate the note token while open: the SAME popup element retargets —
	// content swaps in place, never close-and-reopen.
	// While the popover traps focus (§9.3) outside elements are aria-hidden
	// (their accessible names compute empty) until pressed — the press itself
	// is what retargets — so reach the next anchor by its editor mark.
	await user.click(
		document.querySelector<HTMLButtonElement>(
			'button[data-token-editor="notes"]',
		)!,
	)
	await within(popup).findByLabelText('Note text')
	expect(document.querySelectorAll('[data-slot="token-popover"]')).toHaveLength(
		1,
	)
	expect(document.querySelector('[data-slot="token-popover"]')).toBe(popup)
	expect(
		within(popup).queryByLabelText('Duration value'),
	).not.toBeInTheDocument()
	// The cap label follows the active token.
	expect(popup).toHaveTextContent(/note/i)
})

test('every value is type-to-edit: typing into the popover input writes through; unparseable text never does', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)

	const input = await screen.findByLabelText('Duration value')
	await user.clear(input)
	await user.type(input, '8 min')
	expect(screen.getByLabelText('Duration')).toHaveValue('8 min')

	// An unparseable draft stays local to the input — the form keeps the last
	// valid value and the token (the popover anchor) never vanishes mid-edit.
	await user.clear(input)
	await user.type(input, 'banana')
	expect(screen.getByLabelText('Duration')).toHaveValue('8 min')
	expect(
		screen.getByRole('button', { name: /^8 min duration/ }),
	).toBeInTheDocument()
})

test('committed changes announce through the polite live region in human words', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)

	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent(
			'Duration set to 7 min',
		),
	)
})

test('token buttons are native tab stops carrying value + facet + position names', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))

	// Position rides the accessible name (§9.4) and follows notation order.
	expect(
		await screen.findByRole('button', {
			name: '6 min duration, step 1 of 2, block 1 of 1',
		}),
	).toBeInTheDocument()
	expect(
		screen.getByRole('button', {
			name: '10 min duration, step 2 of 2, block 1 of 1',
		}),
	).toBeInTheDocument()
})

test('clicking non-interactive ground closes the popover', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)
	await screen.findByLabelText('Duration value')

	await user.click(document.body)
	await waitFor(() =>
		expect(
			document.querySelector('[data-slot="token-popover"]'),
		).not.toBeInTheDocument(),
	)
})
