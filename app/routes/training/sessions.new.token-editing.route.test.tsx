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

// A new session is honestly empty (spec §11): the Token Sentence is the sole
// authoring surface now, so seed the first step through the empty-state's
// "start from scratch ＋" kind chooser — a cardio step lands as its 10 min seed.
async function addStructure(user: ReturnType<typeof userEvent.setup>) {
	await screen.findByLabelText(/title/i) // wait for hydration
	await user.click(
		await screen.findByRole('button', { name: /start from scratch/i }),
	)
	await user.click(await screen.findByRole('menuitem', { name: /cardio/i }))
	await screen.findByRole('button', { name: /min duration/ })
}

const stanza = () => document.querySelector('[data-score-stanza]')!

/** The single step's ⋮ mark. */
const stepMark = () =>
	screen.getByRole('button', { name: 'Step 1 of 1 actions, block 1 of 1' })

/** Retype the cardio step's duration token through its popover (replacing the
 * classic Duration field these tests seeded through). */
async function setDuration(
	user: ReturnType<typeof userEvent.setup>,
	value: string,
) {
	await user.click(await screen.findByRole('button', { name: /min duration/ }))
	const input = await screen.findByLabelText('Duration value')
	await user.clear(input)
	await user.type(input, value)
	await user.keyboard('{Escape}')
}

/** Add a note via the "＋ note" neighbour link in the duration popover. */
async function addNote(user: ReturnType<typeof userEvent.setup>, text: string) {
	await user.click(await screen.findByRole('button', { name: /min duration/ }))
	await user.click(await screen.findByRole('button', { name: '＋ note' }))
	await user.type(await screen.findByLabelText('Note text'), text)
	await user.keyboard('{Escape}')
}

/** Switch the cardio step's quantity to a distance via the popover's
 * Duration ⇄ Distance segmented switch, then set its value. */
async function useDistance(
	user: ReturnType<typeof userEvent.setup>,
	value: string,
) {
	await user.click(await screen.findByRole('button', { name: /min duration/ }))
	await user.click(await screen.findByRole('button', { name: 'Distance' }))
	const input = await screen.findByLabelText('Distance value')
	await user.clear(input)
	await user.type(input, value)
	await user.keyboard('{Escape}')
}

/** Introduce/adjust a block repeat via the ⠿ block menu → "Repeat…". The
 * repeat token (`repeated N times`) only renders on the line when count > 1. */
async function setRepeat(
	user: ReturnType<typeof userEvent.setup>,
	count: number,
) {
	await user.click(screen.getByRole('button', { name: 'Block 1 of 1 actions' }))
	await user.click(await screen.findByRole('menuitem', { name: /repeat/i }))
	const input = await screen.findByLabelText('Repeat count value')
	await user.clear(input)
	await user.type(input, String(count))
	await user.keyboard('{Escape}')
}

/** Author the seeded cardio step and flip it to strength through its ⋮ menu's
 * Kind section, so its sentence reads as the exercise + set-notation tokens. */
async function makeStrengthStep(user: ReturnType<typeof userEvent.setup>) {
	await addStructure(user)
	await user.click(stepMark())
	await user.click(
		await screen.findByRole('menuitem', { name: /make strength/i }),
	)
	await screen.findByRole('button', { name: /^sets: 1 × 5/ })
}

test('the duration token opens a popover stepper that writes through to the sentence', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await setDuration(user, '6 min')

	const trigger = await screen.findByRole('button', {
		name: /^6 min duration/,
	})
	await user.click(trigger)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)

	// The token re-derives live from the stepper (6 min + one nudge → 7 min).
	expect(
		await screen.findByRole('button', { name: /^7 min duration/ }),
	).toBeInTheDocument()
})

test('focus returns to the token trigger when the popover closes', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await setDuration(user, '6 min')

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

test('the distance token opens a popover stepper bound to the distance value', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await useDistance(user, '1 km')

	await user.click(
		await screen.findByRole('button', { name: /^1 km distance/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase distance/i }),
	)

	expect(
		await screen.findByRole('button', { name: /^1\.5 km distance/ }),
	).toBeInTheDocument()
})

test('the repeat-count token opens a popover stepper bound to the block repeat', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	// A repeat > 1 introduces the repeat token in the first place.
	await setRepeat(user, 4)

	await user.click(
		await screen.findByRole('button', { name: /^repeated 4 times/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase repeat count/i }),
	)

	expect(
		await screen.findByRole('button', { name: /^repeated 5 times/ }),
	).toBeInTheDocument()
})

test('the editor renders the live Workout Shape strip, expanding repeats with no bracket rail', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await screen.findByLabelText(/title/i)

	// Honest-empty (§8.1): with zero steps the sentence states nothing, so the
	// preview region is entirely absent (never an intent-fallback bar — B7's
	// lie). The first seeded step makes it appear.
	expect(screen.queryByTestId('editor-workout-shape')).toBeNull()

	// The seeded cardio step (10 min) is paintable: one segment. Lean (§8.1):
	// aria-hidden, no bracket rail, no captions — the sentence states the numbers.
	await addStructure(user)
	const shape = await screen.findByTestId('editor-workout-shape')
	const strip = shape.querySelector('[data-shape-strip]')!
	expect(strip).toHaveAttribute('aria-hidden', 'true')
	expect(strip.querySelectorAll('[data-shape-segment]')).toHaveLength(1)
	expect(within(shape).queryByTestId('profile-bracket')).toBeNull()

	// Raising the repeat count re-derives the strip live (no submit): the block
	// expands into repeated segments — the sentence's badge states the repeat,
	// so still no bracket.
	await setRepeat(user, 3)

	await waitFor(() =>
		expect(
			screen
				.getByTestId('editor-workout-shape')
				.querySelectorAll('[data-shape-segment]'),
		).toHaveLength(3),
	)
	expect(
		within(screen.getByTestId('editor-workout-shape')).queryByTestId(
			'profile-bracket',
		),
	).toBeNull()
})

test('the strip appears only with the first paintable step', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await screen.findByLabelText(/title/i)

	// Honest-empty: zero steps state nothing, so the preview region is entirely
	// absent (never an empty frame, never an intent-fallback bar).
	expect(screen.queryByTestId('editor-workout-shape')).toBeNull()

	// The first paintable statement — the seeded cardio's 10 min — brings it
	// into being.
	await addStructure(user)
	await waitFor(() =>
		expect(
			screen
				.getByTestId('editor-workout-shape')
				.querySelectorAll('[data-shape-segment]'),
		).toHaveLength(1),
	)
})

test('a rest step token sets its duration through the popover stepper', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	// Make the step a rest step via its ⋮ Kind section; the 10 min time carries
	// into rest notation (§4.2). A rest can no longer be authored empty — the
	// switch always seeds at least the 1 min floor — so this drives the seeded
	// rest's duration through the same popover stepper, keeping §8.1's spirit.
	await user.click(stepMark())
	await user.click(await screen.findByRole('menuitem', { name: /make rest/i }))
	await waitFor(() => expect(stanza()).toHaveTextContent('(10 min rest)'))

	await user.click(await screen.findByRole('button', { name: /^10 min rest/ }))
	await user.click(
		await screen.findByRole('button', { name: /increase rest/i }),
	)

	expect(
		await screen.findByRole('button', { name: /^10 min 30 s rest/ }),
	).toBeInTheDocument()
})

test('the note token opens a popover textarea writing through to the note facet', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await setDuration(user, '6 min')
	await addNote(user, 'strides')

	await user.click(
		await screen.findByRole('button', { name: /^note: strides/ }),
	)
	const noteText = await screen.findByLabelText('Note text')
	expect(noteText).toHaveValue('strides')
	await user.type(noteText, ' after')

	// The note facet re-derives live from the textarea (rendered in quotes).
	await waitFor(() => expect(stanza()).toHaveTextContent('strides after'))
})

test('sentence affordances add, reorder, and remove steps and blocks via Conform intents', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await setDuration(user, '6 min')

	// Add a step from the ＋ kind chooser — a kind is always chosen (§4.1), and
	// the cardio seed arrives visible, with its 10 min default.
	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	await user.click(await screen.findByRole('menuitem', { name: /cardio/i }))
	expect(
		await screen.findByRole('button', {
			name: '10 min duration, step 2 of 2, block 1 of 1',
		}),
	).toBeInTheDocument()

	// Reorder from the new step's ⋮ menu: move it earlier — position rides the
	// tokens' accessible names (§9.4), so the order is visible there.
	await user.click(
		screen.getByRole('button', { name: 'Step 2 of 2 actions, block 1 of 1' }),
	)
	await user.click(
		await screen.findByRole('menuitem', { name: 'Move earlier' }),
	)
	expect(
		await screen.findByRole('button', {
			name: '10 min duration, step 1 of 2, block 1 of 1',
		}),
	).toBeInTheDocument()
	expect(
		screen.getByRole('button', {
			name: '6 min duration, step 2 of 2, block 1 of 1',
		}),
	).toBeInTheDocument()

	// Remove the now-first (10 min) step again from its ⋮ menu.
	await user.click(
		screen.getByRole('button', { name: 'Step 1 of 2 actions, block 1 of 1' }),
	)
	await user.click(await screen.findByRole('menuitem', { name: 'Remove' }))
	expect(
		await screen.findByRole('button', {
			name: '6 min duration, step 1 of 1, block 1 of 1',
		}),
	).toBeInTheDocument()

	// Add a whole block from the sentence, then delete it from its ⠿ menu.
	await user.click(screen.getByRole('button', { name: 'Add block' }))
	await user.click(
		await screen.findByRole('button', { name: 'Block 2 of 2 actions' }),
	)
	await user.click(
		await screen.findByRole('menuitem', { name: 'Delete block' }),
	)
	await waitFor(() =>
		expect(
			screen.queryByRole('button', { name: /^Block 2 of/ }),
		).not.toBeInTheDocument(),
	)
})

test('two authoring paths — the ± stepper and typing — submit the same form data', async () => {
	const user = userEvent.setup()

	// Flow A — the ± nudge: seed cardio (10 min), bump it to 11 min via the
	// popover stepper, add a step from the sentence, bump the new one the same
	// way.
	const flowA = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Intervals')
	await addStructure(user)

	await user.click(
		await screen.findByRole('button', { name: /^10 min duration/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	await user.click(await screen.findByRole('menuitem', { name: /cardio/i }))
	await user.click(
		await screen.findByRole('button', { name: /^10 min duration/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(flowA.submitted).toHaveBeenCalledTimes(1))
	const stepperPayload = flowA.submitted.mock.calls[0]![0]
	flowA.view.unmount()

	// Flow B — the equivalent type-to-edit edits: the same two values reached by
	// typing into the popover input instead of nudging.
	const flowB = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Intervals')
	await addStructure(user)

	await user.click(
		await screen.findByRole('button', { name: /^10 min duration/ }),
	)
	const inputA = await screen.findByLabelText('Duration value')
	await user.clear(inputA)
	await user.type(inputA, '11 min')
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	await user.click(await screen.findByRole('menuitem', { name: /cardio/i }))
	await user.click(
		await screen.findByRole('button', { name: /^10 min duration/ }),
	)
	const inputB = await screen.findByLabelText('Duration value')
	await user.clear(inputB)
	await user.type(inputB, '11 min')
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(flowB.submitted).toHaveBeenCalledTimes(1))
	const typedPayload = flowB.submitted.mock.calls[0]![0]

	expect(stepperPayload).toEqual(typedPayload)
})

test('intensity tokens are editable via the popover in this slice', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await setDuration(user, '6 min')

	// Author a zone-label intensity through the "＋ intensity" neighbour link in
	// the duration popover (the shared intensity editor leads with zone chips).
	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)
	await user.click(await screen.findByRole('button', { name: '＋ intensity' }))
	await user.click(await screen.findByRole('button', { name: 'Z2' }))

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
	await setDuration(user, '6 min')

	// Author an HR %-of-LTHR target through the shared intensity editor, reached
	// from the duration popover's "＋ intensity" neighbour: the quiet kind row's
	// "heart rate" entry swaps in the HR fields, then %LTHR.
	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)
	await user.click(await screen.findByRole('button', { name: '＋ intensity' }))
	await user.click(await screen.findByRole('button', { name: 'heart rate' }))
	await user.click(await screen.findByRole('button', { name: '%LTHR' }))
	await user.type(await screen.findByLabelText('Min %LTHR'), '95')
	await user.type(await screen.findByLabelText('Max %LTHR (optional)'), '99')

	// The stanza's intensity chip carries the authored value as content and its
	// zone-equivalent step as the tint — computed live from the profile, not
	// authored (spec §7.2). 95–99% LTHR sits in friel Z4.
	const editor = document.querySelector('[data-token-sentence-editor]')!
	await waitFor(() => {
		const el = editor.querySelector('[data-token-type="intensity"]')!
		expect(el.textContent).toMatch(/95–99% LTHR/)
		expect(el).toHaveAttribute('data-zone-step', '4')
	})

	// Change the percentage: the zone-equivalent tint re-resolves without a
	// submit — 80–99% LTHR's midpoint lands in friel Z2.
	const minPct = screen.getByLabelText('Min %LTHR')
	await user.clear(minPct)
	await user.type(minPct, '80')
	await waitFor(() => {
		const el = editor.querySelector('[data-token-type="intensity"]')!
		expect(el.textContent).toMatch(/80–99% LTHR/)
		expect(el).toHaveAttribute('data-zone-step', '2')
	})
})

// ——— Strength: the uniform-first sets popover (spec §5.2, #256) ———————————

test('the uniform mirror edits sets × reps @ load; the payload matches the classic set-row fields', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')
	await makeStrengthStep(user)

	// The strength step reads as compact set notation; the seeded set is
	// `1 × 5`, uniform, so the popover opens on the three-control mirror.
	await user.click(await screen.findByRole('button', { name: /^sets: 1 × 5/ }))

	// One gesture per value: count, reps, load — all whole-list edits keep the
	// popover open (the sets token's address never moves).
	await user.click(screen.getByRole('button', { name: 'Increase sets' }))
	await user.click(screen.getByRole('button', { name: 'Increase sets' }))
	const reps = screen.getByLabelText('Reps value')
	await user.clear(reps)
	await user.type(reps, '6')
	await user.type(screen.getByLabelText('Load kg'), '80')

	// The token re-derives live from the uniform edits.
	expect(
		await screen.findByRole('button', { name: /^sets: 3 × 6 @ 80 kg/ }),
	).toBeInTheDocument()

	await user.keyboard('{Escape}')
	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]

	// The submitted set fields are exactly what the old fixed-width set rows
	// produced: kind, the quantity, the load, and a position-based orderIndex —
	// the uniform mirror materializes real per-set fields.
	for (const index of [0, 1, 2]) {
		expect(payload[`blocks[0].steps[0].sets[${index}].kind`]).toBe('reps')
		expect(payload[`blocks[0].steps[0].sets[${index}].reps`]).toBe('6')
		expect(payload[`blocks[0].steps[0].sets[${index}].weightKg`]).toBe('80')
		expect(payload[`blocks[0].steps[0].sets[${index}].orderIndex`]).toBe(
			String(index),
		)
	}
	expect(payload['blocks[0].steps[0].sets[3].kind']).toBeUndefined()
})

test('the kind select swaps the middle control between reps, timed, and AMRAP', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Plank Day')
	await makeStrengthStep(user)

	await user.click(await screen.findByRole('button', { name: /^sets: 1 × 5/ }))

	// Reps lead; switching to Timed swaps the middle control to a duration,
	// seeded at 30 s.
	await user.click(screen.getByLabelText('Set kind'))
	await user.click(await screen.findByRole('option', { name: 'Timed' }))
	const time = await screen.findByLabelText('Time per set value')
	expect(time).toHaveValue('30 s')
	await user.clear(time)
	await user.type(time, '45 s')

	// AMRAP needs no quantity — the middle control gives way entirely.
	await user.click(screen.getByLabelText('Set kind'))
	await user.click(await screen.findByRole('option', { name: 'AMRAP' }))
	expect(screen.queryByLabelText('Time per set value')).not.toBeInTheDocument()
	expect(
		await screen.findByRole('button', { name: /^sets: 1 × AMRAP/ }),
	).toBeInTheDocument()

	// And back to Timed: the authored 45 s survived the round-trip (§4.2's
	// carry principle, per set).
	await user.click(screen.getByLabelText('Set kind'))
	await user.click(await screen.findByRole('option', { name: 'Timed' }))
	expect(await screen.findByLabelText('Time per set value')).toHaveValue('45 s')

	await user.keyboard('{Escape}')
	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]
	expect(payload['blocks[0].steps[0].sets[0].kind']).toBe('timed')
	expect(payload['blocks[0].steps[0].sets[0].durationSec']).toBe('45')
})

test('load is one field with a kg ⇄ %1RM toggle — mutually exclusive on commit', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')
	await makeStrengthStep(user)

	await user.click(await screen.findByRole('button', { name: /^sets: 1 × 5/ }))

	await user.type(screen.getByLabelText('Load kg'), '80')
	expect(
		await screen.findByRole('button', { name: /^sets: 1 × 5 @ 80 kg/ }),
	).toBeInTheDocument()

	// Toggling shows the other unit's own (empty) value — nothing is silently
	// reinterpreted; committing a %1RM clears the kg on every set.
	await user.click(screen.getByRole('button', { name: '%1RM' }))
	const pct = screen.getByLabelText('Load %1RM')
	expect(pct).toHaveValue('')
	await user.type(pct, '75')
	expect(
		await screen.findByRole('button', { name: /^sets: 1 × 5 @ 75% 1RM/ }),
	).toBeInTheDocument()

	await user.keyboard('{Escape}')
	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]
	expect(payload['blocks[0].steps[0].sets[0].weightKg']).toBe('')
	expect(payload['blocks[0].steps[0].sets[0].pct1RM']).toBe('75')
})

test('vary-individually round-trips: diverge hides the collapse affordance until sets are equal again', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Waves')
	await makeStrengthStep(user)

	await user.click(await screen.findByRole('button', { name: /^sets: 1 × 5/ }))
	await user.click(screen.getByRole('button', { name: 'Increase sets' }))

	// Expand to the per-set grid; the sets are equal, so the collapse
	// affordance is offered.
	await user.click(
		screen.getByRole('button', { name: 'Vary sets individually ▸' }),
	)
	expect(
		await screen.findByRole('button', { name: '◂ Collapse to uniform' }),
	).toBeInTheDocument()

	// Diverge: the collapse affordance disappears — the uniform editor never
	// destroys authored variation.
	const secondReps = await screen.findByLabelText('Set 2 reps')
	await user.clear(secondReps)
	await user.type(secondReps, '3')
	await waitFor(() =>
		expect(
			screen.queryByRole('button', { name: '◂ Collapse to uniform' }),
		).not.toBeInTheDocument(),
	)
	expect(
		await screen.findByRole('button', {
			name: /^sets: 5 @ .* \/ 3|^sets: 5 \/ 3/,
		}),
	).toBeInTheDocument()

	// Equal again: the affordance returns, and collapsing lands back on the
	// three-control mirror (a view switch, not a rewrite).
	await user.clear(secondReps)
	await user.type(secondReps, '5')
	await user.click(
		await screen.findByRole('button', { name: '◂ Collapse to uniform' }),
	)
	expect(await screen.findByLabelText('Reps value')).toHaveValue('5')
	expect(screen.getByLabelText('Sets value')).toHaveValue('2')
})

test('mixed sets open directly expanded, and per-set edits keep the popover open', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Pyramid')
	await makeStrengthStep(user)

	// Author a mixed list: expand, add a set, diverge, close.
	await user.click(await screen.findByRole('button', { name: /^sets: 1 × 5/ }))
	await user.click(
		screen.getByRole('button', { name: 'Vary sets individually ▸' }),
	)
	await user.click(screen.getByRole('button', { name: '＋ add set' }))
	const secondReps = await screen.findByLabelText('Set 2 reps')
	await user.clear(secondReps)
	await user.type(secondReps, '3')
	await user.type(screen.getByLabelText('Set 2 kg'), '90')
	await user.keyboard('{Escape}')

	// Reopening lands directly on the per-set grid — never a uniform view that
	// would misstate the variation.
	await user.click(await screen.findByRole('button', { name: /^sets: 5 \/ 3/ }))
	expect(await screen.findByLabelText('Set 1 reps')).toBeInTheDocument()
	expect(screen.queryByLabelText('Reps value')).not.toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: '◂ Collapse to uniform' }),
	).not.toBeInTheDocument()

	// Duplicate keeps the popover open and appends the copy after its source.
	await user.click(screen.getByRole('button', { name: 'Duplicate set 2' }))
	expect(await screen.findByLabelText('Set 3 reps')).toHaveValue(3)

	await user.keyboard('{Escape}')
	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]
	expect(payload['blocks[0].steps[0].sets[0].reps']).toBe('5')
	expect(payload['blocks[0].steps[0].sets[1].reps']).toBe('3')
	expect(payload['blocks[0].steps[0].sets[1].weightKg']).toBe('90')
	expect(payload['blocks[0].steps[0].sets[2].reps']).toBe('3')
	expect(payload['blocks[0].steps[0].sets[2].orderIndex']).toBe('2')
})

test('rest-between-sets is addable and removable from the popover footer and reads as the mid-dot facet', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')
	await makeStrengthStep(user)

	// Absent → the footer offers introduction (G10).
	await user.click(await screen.findByRole('button', { name: /^sets: 1 × 5/ }))
	await user.click(screen.getByRole('button', { name: '＋ rest between sets' }))
	expect(await screen.findByLabelText('Rest between sets value')).toHaveValue(
		'1 min',
	)

	// On the line it folds into the set notation with the mid-dot — never the
	// parenthesized form, which stays reserved for rest steps (§5.1).
	await user.keyboard('{Escape}')
	expect(
		await screen.findByRole('button', { name: /^1 min rest between sets/ }),
	).toBeInTheDocument()
	const editor = document.querySelector('[data-token-sentence-editor]')!
	expect(editor.textContent).toMatch(/·\s*1 min rest/)
	expect(editor.textContent).not.toMatch(/\(\s*1 min rest/)

	// Present → the footer offers removal.
	await user.click(screen.getByRole('button', { name: /^sets: 1 × 5/ }))
	await user.click(
		screen.getByRole('button', { name: 'Remove rest between sets' }),
	)
	expect(
		await screen.findByRole('button', { name: '＋ rest between sets' }),
	).toBeInTheDocument()
	await user.keyboard('{Escape}')
	await waitFor(() =>
		expect(
			screen.queryByRole('button', { name: /rest between sets, step/ }),
		).not.toBeInTheDocument(),
	)
})

test('rest-between-sets renders as the sentence rest facet and is editable there', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Leg Day')
	await makeStrengthStep(user)

	// Give the step a rest through the sets popover footer, then set its value
	// via that popover's own type-to-edit input (the classic fieldset spinbutton
	// is gone).
	await user.click(await screen.findByRole('button', { name: /^sets: 1 × 5/ }))
	await user.click(screen.getByRole('button', { name: '＋ rest between sets' }))
	const restValue = await screen.findByLabelText('Rest between sets value')
	await user.clear(restValue)
	await user.type(restValue, '1 min 30 s')
	await user.keyboard('{Escape}')

	// The facet reads in the sentence and opens its own popover stepper.
	await user.click(
		await screen.findByRole('button', {
			name: /^1 min 30 s rest between sets/,
		}),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase rest/i }),
	)

	// The facet re-derives live from its stepper (1 min 30 s + one nudge).
	expect(
		await screen.findByRole('button', {
			name: /^1 min 45 s rest between sets/,
		}),
	).toBeInTheDocument()
})

// ——— The retargeting popover (spec §2.4 + §9, #252) ——————————————————————

test('activating another token retargets the open popover in place — same popup, swapped content', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await setDuration(user, '6 min')
	await addNote(user, 'strides')

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
	await setDuration(user, '6 min')

	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)

	const input = await screen.findByLabelText('Duration value')
	await user.clear(input)
	await user.type(input, '8 min')
	// The sentence's quantity token re-derives from the parsed input.
	await waitFor(() => expect(stanza()).toHaveTextContent('8 min'))

	// An unparseable draft stays local to the input — the sentence keeps the
	// last valid value and the token (the popover anchor) never vanishes.
	await user.clear(input)
	await user.type(input, 'banana')
	expect(input).toHaveValue('banana')
	expect(stanza()).toHaveTextContent('8 min')
	// The popover's anchor input is still mounted mid-edit.
	expect(screen.getByLabelText('Duration value')).toBeInTheDocument()
})

test('committed changes announce through the polite live region in human words', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await setDuration(user, '6 min')

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
	await setDuration(user, '6 min')

	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	await user.click(await screen.findByRole('menuitem', { name: /cardio/i }))

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
	await setDuration(user, '6 min')

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
