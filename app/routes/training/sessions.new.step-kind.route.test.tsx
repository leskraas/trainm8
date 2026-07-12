/**
 * @vitest-environment jsdom
 *
 * Step kind switching with set-aside reconciliation (workout-editor spec §4,
 * #255): the ⋮ menu's Kind section with consequence previews, the carry /
 * set-aside / bring-back model, the sheet's Kind select routing through the
 * same reconciliation, and the stash never reaching the submission.
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

async function addStructure() {
	await screen.findByLabelText(/title/i) // wait for hydration
	await screen.findByText(/step 1/i)
}

const stanza = () => document.querySelector('[data-score-stanza]')!

/** The single step's ⋮ mark. */
const stepMark = () =>
	screen.getByRole('button', { name: 'Step 1 of 1 actions, block 1 of 1' })

/** Open the ⋮ menu and activate its "⇄ Make …" row for `kind`. */
async function makeKind(user: ReturnType<typeof userEvent.setup>, kind: string) {
	await user.click(stepMark())
	await user.click(
		await screen.findByRole('menuitem', { name: new RegExp(`make ${kind}`, 'i') }),
	)
}

// ——— Every pair, both directions, from the ⋮ menu ————————————————————————

test('every kind pair switches in both directions and lands as the target kind’s notation', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure()
	await user.type(screen.getByLabelText('Duration'), '6 min')

	// cardio → rest: the time quantity carries into rest notation.
	await makeKind(user, 'rest')
	await waitFor(() => expect(stanza()).toHaveTextContent('(6 min rest)'))

	// rest → strength: strength placeholder tokens; the 6 min is set aside.
	await makeKind(user, 'strength')
	await waitFor(() => expect(stanza()).toHaveTextContent('1 × 5'))

	// strength → cardio: the untouched strength seed is forgotten; cardio
	// seeds its 10 min.
	await makeKind(user, 'cardio')
	await waitFor(() => expect(stanza()).toHaveTextContent('10 min'))

	// cardio → rest again: the stash brings the authored 6 min back (the
	// untouched 10 min seed is forgotten).
	await makeKind(user, 'rest')
	await waitFor(() => expect(stanza()).toHaveTextContent('(6 min rest)'))

	// rest → cardio: the time carries back out of rest.
	await makeKind(user, 'cardio')
	await waitFor(() => {
		expect(stanza()).toHaveTextContent('6 min')
		expect(stanza()).not.toHaveTextContent('rest')
	})

	// cardio → strength: the last remaining direction.
	await makeKind(user, 'strength')
	await waitFor(() => expect(stanza()).toHaveTextContent('1 × 5'))
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent(
			'Step is now strength',
		),
	)
})

// ——— The Kind section and its previews ————————————————————————————————————

test('the Kind section checks the current kind inert and previews each switch’s consequences', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await user.type(screen.getByLabelText('Notes'), 'strides')

	await user.click(stepMark())

	// The current kind is checked and inert.
	const current = await screen.findByRole('menuitem', { name: /✓ Cardio/ })
	expect(current).toHaveAttribute('data-disabled')

	// The switch rows preview keeps / sets aside / starts, from real values:
	// the 6 min is a time, so rest keeps it; strength sets it aside.
	expect(
		screen.getByRole('menuitem', { name: /make rest/i }),
	).toHaveTextContent('keeps 6 min, note')
	expect(
		screen.getByRole('menuitem', { name: /make strength/i }),
	).toHaveTextContent(
		'starts as an exercise, 1 × 5 — keeps note — sets aside 6 min',
	)
})

test('a distance is set aside for rest, previewed as a bring-back, and restored on switch back', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure()
	await user.type(screen.getByLabelText('Distance'), '2 km')

	// A distance doesn't fit rest: it's set aside and rest seeds 1 min.
	await makeKind(user, 'rest')
	await waitFor(() => expect(stanza()).toHaveTextContent('(1 min rest)'))
	expect(stanza()).not.toHaveTextContent('2 km')

	// The switch-back row says exactly what returns.
	await user.click(stepMark())
	expect(
		await screen.findByRole('menuitem', { name: /make cardio/i }),
	).toHaveTextContent('brings back 2 km')

	// And it does: the distance is restored, the seeded rest time is gone.
	await user.click(screen.getByRole('menuitem', { name: /make cardio/i }))
	await waitFor(() => expect(stanza()).toHaveTextContent('2 km'))
	await waitFor(() =>
		expect(screen.getByLabelText('Distance')).toHaveValue('2 km'),
	)
	expect(screen.getByLabelText('Duration')).toHaveValue('')
})

// ——— Persistence: only the active kind's fields; the stash never submits ——

test('saving persists only the active kind’s fields — the stash never reaches the server', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/title/i), 'Kind Day')
	await screen.findByText(/step 1/i)
	await user.type(screen.getByLabelText('Distance'), '2 km')

	// Switch to rest: the 2 km is set aside in-session.
	await makeKind(user, 'rest')
	await waitFor(() => expect(stanza()).toHaveTextContent('(1 min rest)'))

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0] as Record<string, string>

	// The active kind's fields are what's written…
	expect(payload['blocks[0].steps[0].kind']).toBe('rest')
	expect(payload['blocks[0].steps[0].duration']).toBe('1 min')
	// …the set-aside distance is cleared from the live fields…
	expect(payload['blocks[0].steps[0].distance'] ?? '').toBe('')
	// …and the stash itself never rides the submission.
	expect(Object.keys(payload).join()).not.toMatch(/setAside/i)
})

// ——— The sheet's Kind select — one model everywhere (§4.3) ————————————————

test('the sheet’s Kind select routes through the same reconciliation as the ⋮ menu', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure()
	await user.type(screen.getByLabelText('Duration'), '6 min')

	await user.click(
		screen.getByRole('button', { name: 'Block 1 of 1 actions' }),
	)
	await user.click(
		await screen.findByRole('menuitem', { name: 'Open block editor…' }),
	)
	const sheet = await waitFor(() => {
		const el = document.querySelector('[data-block-editor-sheet]')
		expect(el).not.toBeNull()
		return el as HTMLElement
	})

	// Change the kind from the sheet's select.
	await user.click(within(sheet).getByRole('combobox', { name: 'Step 1 kind' }))
	await user.click(await screen.findByRole('option', { name: 'Rest' }))

	// Identical outcome to the ⋮ menu's switch: the time carries into rest.
	await waitFor(() => expect(stanza()).toHaveTextContent('(6 min rest)'))
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent('Step is now rest'),
	)
})
