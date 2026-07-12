/**
 * @vitest-environment jsdom
 *
 * Structural editing chrome (workout-editor spec §3 + §4.1, #254): the block
 * ⠿ grip menu with drag reorder, the step ⋮ menu on every step uniformly,
 * and the ＋ three-row kind chooser.
 */
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react'
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

async function addStructure(_user: ReturnType<typeof userEvent.setup>) {
	await screen.findByLabelText(/title/i) // wait for hydration
	await screen.findByText(/step 1/i)
}

/** The block's ⠿ grip by its accessible name. */
function grip(block: number, of: number) {
	return screen.getByRole('button', { name: `Block ${block} of ${of} actions` })
}

// ——— The block ⠿ grip menu ————————————————————————————————————————————————

test('the ⠿ menu names a block — the name reaches the field but never the line (G2)', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(grip(1, 1))
	await user.click(await screen.findByRole('menuitem', { name: 'Name…' }))

	const nameInput = await screen.findByRole('textbox', { name: 'Block name' })
	await user.type(nameInput, 'Warm-up')

	// The classic field agrees; the notation line never shows the name.
	await waitFor(() =>
		expect(screen.getByLabelText(/block name \(optional\)/i)).toHaveValue(
			'Warm-up',
		),
	)
	const stanza = document.querySelector('[data-score-stanza]')!
	expect(stanza.textContent).not.toContain('Warm-up')

	// Esc returns focus to the grip that summoned the editor.
	await user.keyboard('{Escape}')
	await waitFor(() => expect(grip(1, 1)).toHaveFocus())
})

test('the ⠿ menu introduces a repeat, which renders as the gutter badge (G3)', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	// No badge while the repeat is 1.
	expect(
		document.querySelector('[data-stanza-gutter] [data-token-type="repeat"]'),
	).not.toBeInTheDocument()

	await user.click(grip(1, 1))
	await user.click(await screen.findByRole('menuitem', { name: 'Repeat…' }))
	await user.click(
		await screen.findByRole('button', { name: /increase repeat count/i }),
	)

	// 1 → 2: the gutter badge appears and the classic field agrees.
	await waitFor(() =>
		expect(
			document.querySelector('[data-stanza-gutter] [data-token-type="repeat"]'),
		).toHaveTextContent('2×'),
	)
	expect(screen.getByLabelText('Repeat count')).toHaveValue(2)
})

test('the ⠿ menu reorders blocks, with the ends disabled — the keyboard reorder path', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(screen.getByRole('button', { name: 'Add block' }))
	await screen.findByText(/block 2/i)

	// The first block can't move earlier.
	await user.click(grip(1, 2))
	expect(
		await screen.findByRole('menuitem', { name: 'Move earlier' }),
	).toHaveAttribute('data-disabled')

	// Move it later instead: the 6 min step's block is now second.
	await user.click(screen.getByRole('menuitem', { name: 'Move later' }))
	await waitFor(() => {
		const durations = screen.getAllByLabelText('Duration')
		expect(durations[0]).toHaveValue('10 min')
		expect(durations[1]).toHaveValue('6 min')
	})
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent('Block moved later'),
	)
})

test('the ⠿ menu adds a block after its own block, not at the end', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(screen.getByRole('button', { name: 'Add block' }))
	await screen.findByText(/block 2/i)
	const durations = screen.getAllByLabelText('Duration')
	await user.clear(durations[1]!)
	await user.type(durations[1]!, '20 min')

	// Add after block 1: the seeded 10 min block lands between 6 and 20.
	await user.click(grip(1, 2))
	await user.click(
		await screen.findByRole('menuitem', { name: 'Add block after' }),
	)
	await waitFor(() => {
		const values = screen.getAllByLabelText('Duration')
		expect(values.map((input) => (input as HTMLInputElement).value)).toEqual([
			'6 min',
			'10 min',
			'20 min',
		])
	})
})

test('the ⠿ menu deletes a block — disabled while it is the only one', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(grip(1, 1))
	expect(
		await screen.findByRole('menuitem', { name: 'Delete block' }),
	).toHaveAttribute('data-disabled')
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: 'Add block' }))
	await screen.findByText(/block 2/i)
	await user.click(grip(2, 2))
	await user.click(
		await screen.findByRole('menuitem', { name: 'Delete block' }),
	)
	await waitFor(() =>
		expect(screen.queryByText(/block 2/i)).not.toBeInTheDocument(),
	)
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent('Block deleted'),
	)
})

test('the ⠿ Add-step submenu requires a kind choice, and rest lands as rest notation', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(grip(1, 1))
	await user.click(await screen.findByRole('menuitem', { name: 'Add step' }))
	// Base UI parks the submenu behind `pointer-events: none` until a real
	// hover reaches it — jsdom has no hover, so activate the row directly.
	fireEvent.click(await screen.findByRole('menuitem', { name: /rest/i }))

	// The rest seed lands as the parenthesized rest-step notation.
	const stanza = document.querySelector('[data-score-stanza]')!
	await waitFor(() => expect(stanza).toHaveTextContent('(1 min rest)'))
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent('Rest step added'),
	)
})

// ——— Drag reorder (pointer-only) —————————————————————————————————————————

test('dragging a block grip onto another line reorders the blocks', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(screen.getByRole('button', { name: 'Add block' }))
	await screen.findByText(/block 2/i)

	const lines = document.querySelectorAll('[data-stanza-line]')
	expect(lines).toHaveLength(2)
	const dataTransfer = { setData: () => {}, effectAllowed: '', dropEffect: '' }
	fireEvent.dragStart(grip(1, 2), { dataTransfer })
	fireEvent.dragOver(lines[1]!, { dataTransfer })
	fireEvent.drop(lines[1]!, { dataTransfer })

	await waitFor(() => {
		const durations = screen.getAllByLabelText('Duration')
		expect(durations[0]).toHaveValue('10 min')
		expect(durations[1]).toHaveValue('6 min')
	})
})

// ——— The step ⋮ menu, uniform on every kind ———————————————————————————————

test('every step kind carries the same ⋮ menu — cardio, strength, and rest alike (G4)', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	// Add a strength and a rest step through the ＋ chooser.
	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	await user.click(await screen.findByRole('menuitem', { name: /strength/i }))
	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	await user.click(await screen.findByRole('menuitem', { name: /rest/i }))

	// Three steps, three ⋮ marks — one per step, whatever its kind.
	const marks = await screen.findAllByRole('button', {
		name: /^Step \d of 3 actions/,
	})
	expect(marks).toHaveLength(3)

	// The rest step's menu carries the same actions.
	await user.click(
		screen.getByRole('button', { name: 'Step 3 of 3 actions, block 1 of 1' }),
	)
	for (const item of ['Move earlier', 'Move later', 'Duplicate', 'Remove']) {
		expect(
			await screen.findByRole('menuitem', { name: item }),
		).toBeInTheDocument()
	}
	// Last step: Move later is disabled.
	expect(screen.getByRole('menuitem', { name: 'Move later' })).toHaveAttribute(
		'data-disabled',
	)
})

test('⋮ Duplicate copies the step in place with its values', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.type(screen.getByLabelText('Notes'), 'strides')

	await user.click(
		screen.getByRole('button', { name: 'Step 1 of 1 actions, block 1 of 1' }),
	)
	await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

	await waitFor(() => {
		const durations = screen.getAllByLabelText('Duration')
		expect(durations).toHaveLength(2)
		expect(durations[1]).toHaveValue('6 min')
	})
	const notes = screen.getAllByLabelText('Notes')
	expect(notes[1]).toHaveValue('strides')
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent('Step duplicated'),
	)
})

test("removing a block's only step removes the block itself", async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.click(screen.getByRole('button', { name: 'Add block' }))
	await screen.findByText(/block 2/i)

	await user.click(
		screen.getByRole('button', { name: 'Step 1 of 1 actions, block 2 of 2' }),
	)
	await user.click(await screen.findByRole('menuitem', { name: 'Remove' }))

	await waitFor(() =>
		expect(screen.queryByText(/block 2/i)).not.toBeInTheDocument(),
	)
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent(
			'Step removed with its block',
		),
	)
})

test("the whole workout's last step cannot be removed", async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(
		screen.getByRole('button', { name: 'Step 1 of 1 actions, block 1 of 1' }),
	)
	expect(
		await screen.findByRole('menuitem', { name: 'Remove' }),
	).toHaveAttribute('data-disabled')
})

// ——— The ＋ kind chooser ——————————————————————————————————————————————————

test('＋ opens the three-row kind chooser with seed hints — never a blind insert (G5)', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))

	// No step was inserted by the click itself — the chooser is open instead.
	expect(screen.getAllByLabelText('Duration')).toHaveLength(1)
	const menu = await screen.findByRole('menu')
	const items = within(menu).getAllByRole('menuitem')
	expect(items.map((item) => item.textContent)).toEqual([
		'Cardiostarts as 10 min',
		'Strengthstarts as an exercise, 1 × 5',
		'Reststarts as 1 min of recovery',
	])
})

test('the strength seed lands as exercise + set notation, submitting a strength step', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Chooser Day')
	await screen.findByText(/step 1/i)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(screen.getByRole('button', { name: 'Add step to block 1' }))
	await user.click(await screen.findByRole('menuitem', { name: /strength/i }))

	// The strength seed reads as its placeholder tokens.
	const stanza = document.querySelector('[data-score-stanza]')!
	await waitFor(() => expect(stanza).toHaveTextContent('1 × 5'))

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]
	expect(payload['blocks[0].steps[1].kind']).toBe('strength')
	expect(payload['blocks[0].steps[1].sets[0].reps']).toBe('5')
})

// ——— The block editor sheet ———————————————————————————————————————————————

test('the sheet opens from the ⠿ menu as a summoned surface and edits write through', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(grip(1, 1))
	await user.click(
		await screen.findByRole('menuitem', { name: 'Open block editor…' }),
	)

	const sheet = await waitFor(() => {
		const el = document.querySelector('[data-block-editor-sheet]')
		expect(el).not.toBeNull()
		return el as HTMLElement
	})
	expect(within(sheet).getByText('Block 1')).toBeInTheDocument()
	// The step list shows the step's notation summary.
	expect(within(sheet).getByText(/6 min/)).toBeInTheDocument()

	// Name edits in the sheet reach the same field the ⠿ menu edits (G2).
	await user.type(within(sheet).getByLabelText('Block name'), 'Main set')
	await waitFor(() =>
		expect(screen.getByLabelText(/block name \(optional\)/i)).toHaveValue(
			'Main set',
		),
	)

	// Structure actions live here too: duplicate the step from the sheet.
	await user.click(
		within(sheet).getByRole('button', { name: 'Duplicate step 1' }),
	)
	await waitFor(() =>
		expect(screen.getAllByLabelText('Duration')).toHaveLength(2),
	)

	// Done dismisses the summoned surface.
	await user.click(within(sheet).getByRole('button', { name: 'Done' }))
	await waitFor(() =>
		expect(
			document.querySelector('[data-block-editor-sheet]'),
		).not.toBeInTheDocument(),
	)
})

// ——— Keyboard & craft ————————————————————————————————————————————————————

test('the chrome marks are native tab stops in notation order (§9.3)', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	// ⠿, ⋮ and ＋ are buttons — focusable, Enter/Space activates.
	const gripMark = grip(1, 1)
	const stepMark = screen.getByRole('button', {
		name: 'Step 1 of 1 actions, block 1 of 1',
	})
	const addMark = screen.getByRole('button', { name: 'Add step to block 1' })
	for (const mark of [gripMark, stepMark, addMark]) {
		expect(mark.tagName).toBe('BUTTON')
		expect(mark).not.toHaveAttribute('tabindex', '-1')
	}

	// A full keyboard-only structural pass: open the ⋮ menu with the keyboard
	// and duplicate the step via the menu (the keyboard reorder path).
	stepMark.focus()
	await user.keyboard('{Enter}')
	const duplicate = await screen.findByRole('menuitem', { name: 'Duplicate' })
	duplicate.focus()
	await user.keyboard('{Enter}')
	await waitFor(() =>
		expect(screen.getAllByLabelText('Duration')).toHaveLength(2),
	)
})

test('opening a menu never shifts the line — the menu is portaled off the flow', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')

	const line = document.querySelector('[data-stanza-line]')!
	const before = line.childElementCount
	await user.click(grip(1, 1))
	await screen.findByRole('menu')
	// The menu renders in a portal, not inside the line.
	expect(line.childElementCount).toBe(before)
	expect(line.querySelector('[role="menu"]')).toBeNull()
})
