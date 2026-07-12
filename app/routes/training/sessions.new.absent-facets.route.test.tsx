/**
 * @vitest-environment jsdom
 *
 * Absent facets — popover neighbours (workout-editor spec §6, #257): a token
 * renders only when its value exists, so an absent facet is introduced from
 * the popovers of the tokens the step already renders. The quantity popover
 * leads with the Duration ⇄ Distance switch (G8); "＋ intensity" (G7) and
 * "＋ note" (G9) links swap the open popover's content in place; the per-step
 * discipline select rides the quantity and sets popovers (G6) and an
 * override renders as a quiet word token; a fully emptied step stays
 * repairable through the ⋮ menu's one fallback "Add…" row (§6.3).
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

// A new session is honestly empty (spec §11): the token sentence is the sole
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

const stanza = () => document.querySelector('[data-score-stanza]')!
const popup = () =>
	document.querySelector('[data-slot="token-popover"]') as HTMLElement

/** The single step's ⋮ mark. */
const stepMark = () =>
	screen.getByRole('button', { name: 'Step 1 of 1 actions, block 1 of 1' })

/** Retune the seeded step's 10 min quantity down to the 6 min the token anchors
 * reference (a fresh cardio step lands at 10 min, not blank). */
async function authorDuration(user: ReturnType<typeof userEvent.setup>) {
	await setDuration(user, '6')
	await screen.findByRole('button', { name: /^6 min duration/ })
}

/** Open the step's quantity popover from its duration token. */
async function openQuantityPopover(
	user: ReturnType<typeof userEvent.setup>,
	name = /^6 min duration/,
) {
	await user.click(await screen.findByRole('button', { name }))
	return waitFor(() => {
		const el = popup()
		expect(el).not.toBeNull()
		return el
	})
}

// ——— G8: the Duration ⇄ Distance switch ——————————————————————————————————

test('the quantity popover leads with a Duration ⇄ Distance switch that seeds defaults and round-trips', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await authorDuration(user)

	await openQuantityPopover(user)
	const toggle = () =>
		within(popup()).getByRole('group', { name: 'Quantity kind' })
	expect(
		within(toggle()).getByRole('button', { name: 'Duration' }),
	).toHaveAttribute('aria-pressed', 'true')

	// Switch to distance: the duration clears, the distance seeds 1 km, and
	// the token re-renders as the distance — the popover stays open on it.
	await user.click(within(toggle()).getByRole('button', { name: 'Distance' }))
	await waitFor(() => expect(stanza()).toHaveTextContent('1 km'))
	expect(stanza()).not.toHaveTextContent('6 min')
	expect(
		screen.getByRole('button', { name: /^1 km distance/ }),
	).toBeInTheDocument()

	// Switch back: the authored 6 min round-trips, not the 10 min default.
	await user.click(within(toggle()).getByRole('button', { name: 'Duration' }))
	await waitFor(() => expect(stanza()).toHaveTextContent('6 min'))
	expect(stanza()).not.toHaveTextContent('10 min')
	expect(stanza()).not.toHaveTextContent('km')
})

test('the quantity is removable from its popover, and reintroducible via "＋ time or distance" in the note popover', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await authorDuration(user)

	// Author a note through the duration popover's "＋ note" neighbour link, so
	// the step carries a second anchor to survive removing the quantity.
	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)
	await user.click(await screen.findByRole('button', { name: '＋ note' }))
	await user.type(await screen.findByLabelText('Note text'), 'strides')
	await waitFor(() => expect(stanza()).toHaveTextContent('“strides”'))
	await user.keyboard('{Escape}')

	// Remove the authored 6 min from the quantity popover's quiet footer.
	await openQuantityPopover(user)
	await user.click(
		screen.getByRole('button', { name: 'Remove time or distance' }),
	)
	await waitFor(() => expect(stanza()).not.toHaveTextContent('6 min'))

	// The note token is the step's remaining anchor; its popover offers the
	// "＋ time or distance" neighbour link, which swaps to the quantity
	// editor's intro — nothing seeded until a measure is chosen. Choosing a
	// measure seeds its default and the quantity token returns to the line.
	await user.click(screen.getByRole('button', { name: /^note: strides/ }))
	await user.click(
		await screen.findByRole('button', { name: '＋ time or distance' }),
	)
	const pop = await waitFor(() => {
		const el = popup()
		expect(el).toHaveTextContent('pick how to measure it')
		return el
	})
	await user.click(within(pop).getByRole('button', { name: 'Distance' }))
	await waitFor(() => expect(stanza()).toHaveTextContent('1 km'))
})

// ——— G7: intensity in and out through popover neighbours ————————————————

test('"＋ intensity" swaps the quantity popover to the intensity editor; removal is its quiet footer action', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await authorDuration(user)

	const pop = await openQuantityPopover(user)
	// The intensity popover offers no removal before anything exists.
	await user.click(within(pop).getByRole('button', { name: '＋ intensity' }))
	await waitFor(() =>
		expect(within(popup()).getByRole('group', { name: 'Zone' })).toBeVisible(),
	)
	expect(
		within(popup()).queryByRole('button', { name: 'Remove intensity' }),
	).not.toBeInTheDocument()

	// Author a zone: the chip appears on the line.
	await user.click(within(popup()).getByRole('button', { name: 'Z3' }))
	expect(
		await screen.findByRole('button', { name: /^Z3 intensity/ }),
	).toBeInTheDocument()

	// Its own popover now carries the quiet Remove intensity footer.
	await user.click(screen.getByRole('button', { name: /^Z3 intensity/ }))
	await user.click(
		await screen.findByRole('button', { name: 'Remove intensity' }),
	)
	await waitFor(() =>
		expect(
			screen.queryByRole('button', { name: /^Z3 intensity/ }),
		).not.toBeInTheDocument(),
	)
})

// ——— G9: notes in and out through popover neighbours ————————————————————

test('"＋ note" swaps to the note editor; "Remove note" lives in the note popover footer', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await authorDuration(user)

	const pop = await openQuantityPopover(user)
	await user.click(within(pop).getByRole('button', { name: '＋ note' }))
	const noteField = await screen.findByLabelText('Note text')
	await user.type(noteField, 'easy')
	await waitFor(() => expect(stanza()).toHaveTextContent('“easy”'))
	expect(
		screen.getByRole('button', { name: /^note: easy/ }),
	).toBeInTheDocument()

	// Close, reopen from the note token itself, and remove from its footer.
	await user.keyboard('{Escape}')
	await user.click(screen.getByRole('button', { name: /^note: easy/ }))
	await user.click(await screen.findByRole('button', { name: 'Remove note' }))
	await waitFor(() => expect(stanza()).not.toHaveTextContent('“easy”'))
	expect(
		screen.queryByRole('button', { name: /^note: easy/ }),
	).not.toBeInTheDocument()
})

test('the rest popover offers "＋ note" but never intensity or discipline', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await authorDuration(user)

	// Make the step a rest step through its ⋮ Kind section.
	await user.click(stepMark())
	await user.click(await screen.findByRole('menuitem', { name: /make rest/i }))
	await waitFor(() => expect(stanza()).toHaveTextContent('(6 min rest)'))

	await user.click(screen.getByRole('button', { name: /^6 min rest/ }))
	const pop = await waitFor(() => {
		const el = popup()
		expect(el).not.toBeNull()
		return el
	})
	expect(within(pop).getByRole('button', { name: '＋ note' })).toBeVisible()
	expect(
		within(pop).queryByRole('button', { name: '＋ intensity' }),
	).not.toBeInTheDocument()
	expect(
		within(pop).queryByRole('combobox', { name: 'Step discipline' }),
	).not.toBeInTheDocument()
})

// ——— G6: per-step discipline ————————————————————————————————————————————

test('the discipline select overrides and clears; an override renders the quiet word token', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Mixed Day')
	await addStructure(user)
	await authorDuration(user)

	// Override from the quantity popover's discipline select.
	const pop = await openQuantityPopover(user)
	await user.click(
		within(pop).getByRole('combobox', { name: 'Step discipline' }),
	)
	await user.click(await screen.findByRole('option', { name: 'bike' }))
	await waitFor(() =>
		expect(
			stanza().querySelector('[data-token-type="discipline"]'),
		).toHaveTextContent('bike'),
	)

	// The word token leads the step, before the quantity.
	expect(stanza().textContent!.indexOf('bike')).toBeLessThan(
		stanza().textContent!.indexOf('6 min'),
	)

	// The override rides the submission.
	await user.keyboard('{Escape}')
	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0] as Record<string, string>
	expect(payload['blocks[0].steps[0].discipline']).toBe('bike')

	// Tap the word token to edit; clearing back to inherit removes it.
	await user.click(screen.getByRole('button', { name: /^bike discipline/ }))
	await user.click(
		await screen.findByRole('combobox', { name: 'Step discipline' }),
	)
	await user.click(await screen.findByRole('option', { name: /inherit · run/ }))
	await waitFor(() =>
		expect(
			stanza().querySelector('[data-token-type="discipline"]'),
		).not.toBeInTheDocument(),
	)
})

test('the sets popover carries the discipline select and the "＋ note" link for strength steps', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)

	await user.click(stepMark())
	await user.click(
		await screen.findByRole('menuitem', { name: /make strength/i }),
	)
	await waitFor(() => expect(stanza()).toHaveTextContent('1 × 5'))

	await user.click(screen.getByRole('button', { name: /^sets: 1 × 5/ }))
	const pop = await waitFor(() => {
		const el = popup()
		expect(el).not.toBeNull()
		return el
	})
	expect(
		within(pop).getByRole('combobox', { name: 'Step discipline' }),
	).toBeVisible()
	expect(within(pop).getByRole('button', { name: '＋ note' })).toBeVisible()
	// Strength steps have no cardio facets to introduce.
	expect(
		within(pop).queryByRole('button', { name: '＋ intensity' }),
	).not.toBeInTheDocument()
	expect(
		within(pop).queryByRole('button', { name: '＋ time or distance' }),
	).not.toBeInTheDocument()
})

// ——— §6.3: the zero-token fallback ——————————————————————————————————————

test('a fully emptied step grows the one ⋮ "Add…" row, absent in every normal state', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await authorDuration(user)

	// A normal step's ⋮ menu has no Add… row.
	await user.click(stepMark())
	expect(
		screen.queryByRole('menuitem', { name: 'Add…' }),
	).not.toBeInTheDocument()
	await user.keyboard('{Escape}')

	// Empty the step completely: remove its only facet, the authored 6 min.
	await openQuantityPopover(user)
	await user.click(
		screen.getByRole('button', { name: 'Remove time or distance' }),
	)
	await waitFor(() => expect(stanza()).not.toHaveTextContent('6 min'))

	// The step still renders its ⋮ mark, whose menu now leads with Add….
	await user.click(stepMark())
	await user.click(await screen.findByRole('menuitem', { name: 'Add…' }))

	// The ⋮-anchored popover opens on the quantity intro; choosing a measure
	// seeds the token back and the step is repaired.
	const pop = await waitFor(() => {
		const el = document.querySelector(
			'[data-slot="add-facet-popover"]',
		) as HTMLElement
		expect(el).toHaveTextContent('pick how to measure it')
		return el
	})
	await user.click(within(pop).getByRole('button', { name: 'Distance' }))
	await waitFor(() => expect(stanza()).toHaveTextContent('1 km'))

	// Repaired: the fallback row is gone again.
	await user.keyboard('{Escape}')
	await user.click(stepMark())
	expect(
		screen.queryByRole('menuitem', { name: 'Add…' }),
	).not.toBeInTheDocument()
})
