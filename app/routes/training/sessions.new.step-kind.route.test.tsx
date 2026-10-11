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
				// The prefilled Discipline the loader derives from the athlete's own
				// history (#501). These specs are about the sentence, not about the
				// derivation, so they open on the discipline the route used to
				// hardcode.
				defaultDiscipline: 'run',
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
	await screen.findByLabelText(/tittel/i) // wait for hydration
	await user.click(
		await screen.findByRole('button', { name: /begynn med et tomt steg/i }),
	)
	await user.click(await screen.findByRole('menuitem', { name: /kondisjon/i }))
	await screen.findByRole('button', { name: /min varighet/ })
}

/** Retype the cardio step's duration token through its popover (replacing the
 * classic Duration field these tests seeded through). */
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

/** Add a note via the "＋ note" neighbour link in the duration popover. */
async function addNote(user: ReturnType<typeof userEvent.setup>, text: string) {
	await user.click(await screen.findByRole('button', { name: /min varighet/ }))
	await user.click(await screen.findByRole('button', { name: '＋ notat' }))
	await user.type(await screen.findByLabelText('Notat'), text)
	await user.keyboard('{Escape}')
}

/** Switch the cardio step's quantity to a distance via the popover's
 * Duration ⇄ Distance segmented switch, then set its value. */
async function useDistance(
	user: ReturnType<typeof userEvent.setup>,
	value: string,
) {
	await user.click(await screen.findByRole('button', { name: /min varighet/ }))
	await user.click(await screen.findByRole('button', { name: 'Distanse' }))
	const input = await screen.findByLabelText('Verdi for distansen')
	await user.clear(input)
	await user.type(input, value)
	await user.keyboard('{Escape}')
}

const stanza = () => document.querySelector('[data-score-stanza]')!

/** The single step's ⋮ mark. */
const stepMark = () =>
	screen.getByRole('button', {
		name: 'Handlinger for steg 1 av 1, blokk 1 av 1',
	})

/** Open the ⋮ menu and activate its "⇄ Gjør til …" row for `kind` (the
 * kind as the menu names it: `kondisjon`, `styrke`, `pause`). */
async function makeKind(
	user: ReturnType<typeof userEvent.setup>,
	kind: string,
) {
	await user.click(stepMark())
	await user.click(
		await screen.findByRole('menuitem', {
			name: new RegExp(`gjør til ${kind}`, 'i'),
		}),
	)
}

// ——— Every pair, both directions, from the ⋮ menu ————————————————————————

test('every kind pair switches in both directions and lands as the target kind’s notation', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await setDuration(user, '6 min')

	// cardio → rest: the time quantity carries into rest notation.
	await makeKind(user, 'pause')
	await waitFor(() => expect(stanza()).toHaveTextContent('(6 min pause)'))

	// rest → strength: strength placeholder tokens; the 6 min is set aside.
	await makeKind(user, 'styrke')
	await waitFor(() => expect(stanza()).toHaveTextContent('1 × 5'))

	// strength → cardio: the untouched strength seed is forgotten; cardio
	// seeds its 10 min.
	await makeKind(user, 'kondisjon')
	await waitFor(() => expect(stanza()).toHaveTextContent('10 min'))

	// cardio → rest again: the stash brings the authored 6 min back (the
	// untouched 10 min seed is forgotten).
	await makeKind(user, 'pause')
	await waitFor(() => expect(stanza()).toHaveTextContent('(6 min pause)'))

	// rest → cardio: the time carries back out of rest.
	await makeKind(user, 'kondisjon')
	await waitFor(() => {
		expect(stanza()).toHaveTextContent('6 min')
		expect(stanza()).not.toHaveTextContent('pause')
	})

	// cardio → strength: the last remaining direction.
	await makeKind(user, 'styrke')
	await waitFor(() => expect(stanza()).toHaveTextContent('1 × 5'))
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent('Steget er nå styrke'),
	)
})

// ——— The Kind section and its previews ————————————————————————————————————

test('the Kind section checks the current kind inert and previews each switch’s consequences', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await setDuration(user, '6 min')
	await addNote(user, 'strides')

	await user.click(stepMark())

	// The current kind is checked and inert.
	const current = await screen.findByRole('menuitem', { name: /✓ Kondisjon/ })
	expect(current).toHaveAttribute('data-disabled')

	// The switch rows preview keeps / sets aside / starts, from real values:
	// the 6 min is a time, so rest keeps it; strength sets it aside.
	expect(
		screen.getByRole('menuitem', { name: /gjør til pause/i }),
	).toHaveTextContent('beholder 6 min, notat')
	expect(
		screen.getByRole('menuitem', { name: /gjør til styrke/i }),
	).toHaveTextContent(
		'starter som en øvelse, 1 × 5 — beholder notat — legger til side 6 min',
	)
})

test('a distance is set aside for rest, previewed as a bring-back, and restored on switch back', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await addStructure(user)
	await useDistance(user, '2 km')

	// A distance doesn't fit rest: it's set aside and rest seeds 1 min.
	await makeKind(user, 'pause')
	await waitFor(() => expect(stanza()).toHaveTextContent('(1 min pause)'))
	expect(stanza()).not.toHaveTextContent('2 km')

	// The switch-back row says exactly what returns.
	await user.click(stepMark())
	expect(
		await screen.findByRole('menuitem', { name: /gjør til kondisjon/i }),
	).toHaveTextContent('henter tilbake 2 km')

	// And it does: the distance is restored, the seeded rest time is gone.
	await user.click(
		screen.getByRole('menuitem', { name: /gjør til kondisjon/i }),
	)
	await waitFor(() => expect(stanza()).toHaveTextContent('2 km'))
	// The distance token is back and no duration token stands in its place.
	expect(
		screen.getByRole('button', { name: /^2 km distanse/ }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /min varighet/ }),
	).not.toBeInTheDocument()
})

// ——— Persistence: only the active kind's fields; the stash never submits ——

test('saving persists only the active kind’s fields — the stash never reaches the server', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession()
	await user.type(await screen.findByLabelText(/tittel/i), 'Kind Day')
	await addStructure(user)
	await useDistance(user, '2 km')

	// Switch to rest: the 2 km is set aside in-session.
	await makeKind(user, 'pause')
	await waitFor(() => expect(stanza()).toHaveTextContent('(1 min pause)'))

	await user.click(screen.getByRole('button', { name: /lag økta/i }))
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
	await addStructure(user)
	await setDuration(user, '6 min')

	await user.click(
		screen.getByRole('button', { name: 'Handlinger for blokk 1 av 1' }),
	)
	await user.click(
		await screen.findByRole('menuitem', { name: 'Åpne blokka …' }),
	)
	const sheet = await waitFor(() => {
		const el = document.querySelector('[data-block-editor-sheet]')
		expect(el).not.toBeNull()
		return el as HTMLElement
	})

	// Change the kind from the sheet's select.
	await user.click(
		within(sheet).getByRole('combobox', { name: 'Type for steg 1' }),
	)
	await user.click(await screen.findByRole('option', { name: 'Pause' }))

	// Identical outcome to the ⋮ menu's switch: the time carries into rest.
	await waitFor(() => expect(stanza()).toHaveTextContent('(6 min pause)'))
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent('Steget er nå pause'),
	)
})
