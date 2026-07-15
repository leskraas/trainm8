/**
 * @vitest-environment jsdom
 *
 * Server validation errors on the token line (workout-editor spec §10, #259):
 * a rejected save paints errors on the line and repairs through the editor's
 * own instruments. Token errors tint/underline the token and its popover
 * leads with the message; absent facets anchor on the step's ⋮ mark and
 * highlight the repairing ＋ link; block errors anchor in the gutter; session
 * errors anchor on the header field; unmappable paths degrade to anchor-less
 * summary items. The summary line lists everything in document order, focus
 * moves to the first anchor with a live-region announcement, and a marking
 * clears locally the moment the value behind it changes.
 */
import { parseWithZod } from '@conform-to/zod'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { FormSchema } from '#app/utils/workout-authoring.ts'
import NewSessionRoute from './sessions.new.tsx'

window.HTMLElement.prototype.scrollIntoView = () => {}
window.ResizeObserver ??= class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

/** A stub whose action rejects like the real one: the second-pass
 * `WorkoutAuthoringSchema` failure replies with dot-joined domain paths. */
function renderNewSession(fieldErrors: Record<string, string[]>) {
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
				const submission = parseWithZod(formData, { schema: FormSchema })
				if (submission.status !== 'success') {
					return { result: submission.reply() }
				}
				return { result: submission.reply({ fieldErrors }) }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/new']} />)
}

const REJECTION: Record<string, string[]> = {
	// Deliberately shuffled: the summary must re-order into document order.
	'blocks.0.steps.0.intensity': ['Pick an intensity for tempo work'],
	'tampered.path': ['Something only the server could see'],
	scheduledAt: ['Sessions can’t be scheduled in the past'],
	'blocks.0.steps.0.durationSec': ['Too long for this plan'],
	'blocks.0.name': ['That block name is taken'],
}

const durationToken = () =>
	screen.getByRole('button', { name: /^6 min duration/ })
const stepMark = () =>
	screen.getByRole('button', { name: 'Step 1 of 1 actions, block 1 of 1' })
const blockGrip = () =>
	screen.getByRole('button', { name: 'Block 1 of 1 actions' })
const summary = () =>
	document.querySelector('[data-validation-summary]') as HTMLElement | null
const popup = () =>
	document.querySelector('[data-slot="token-popover"]') as HTMLElement

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

/** Author the minimum valid draft (title + a 6 min step) and submit into the
 * stubbed rejection. */
async function submitAndReject(user: ReturnType<typeof userEvent.setup>) {
	await addStructure(user)
	await user.type(screen.getByLabelText(/title/i), 'Tempo Day')
	// The scratch seed lands at 10 min; retune it to the 6 min the token
	// anchors reference.
	await setDuration(user, '6')
	await screen.findByRole('button', { name: /^6 min duration/ })
	await user.click(screen.getByRole('button', { name: 'Create Session' }))
	await waitFor(() => expect(summary()).not.toBeNull())
}

test('the 400 paints every anchor level, lists the summary in document order, moves focus, and announces', async () => {
	const user = userEvent.setup()
	renderNewSession(REJECTION)
	await submitAndReject(user)

	// The summary line: count in human words, items in document order —
	// header first, then the block gutter, the step's tokens, absent facets,
	// and the unmappable floor item last.
	const line = summary()!
	expect(line).toHaveTextContent('5 things need fixing')
	const items = within(line)
		.getAllByRole('listitem')
		.map((item) => item.textContent)
	expect(items).toEqual([
		'Sessions can’t be scheduled in the past',
		'That block name is taken',
		'Too long for this plan',
		'Pick an intensity for tempo work',
		'Something only the server could see',
	])

	// The floor item is plain text — no anchor, no button, never a crash or
	// a silent drop (§10.5).
	expect(
		within(line).getByText('Something only the server could see').tagName,
	).toBe('SPAN')

	// Token primary (§10.1): the duration token carries the marking in the
	// notation's own language. The absent intensity tints the step's ⋮ mark
	// (§10.2); the block error tints the gutter ⠿ (§10.3).
	expect(durationToken()).toHaveAttribute('data-server-error')
	expect(stepMark()).toHaveAttribute('data-server-error')
	expect(blockGrip()).toHaveAttribute('data-server-error')

	// Focus lands on the first anchored item — the session-level error's
	// header field (the schedule date input).
	const dateInput = screen.getByLabelText(/date/i)
	await waitFor(() => expect(dateInput).toHaveFocus())

	// The polite live region announces the rejection in human words.
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent(
			/5 things need fixing — Sessions can’t be scheduled in the past/,
		),
	)
})

test('the offending token’s popover leads with the message; a summary item retargets the popover to its anchor', async () => {
	const user = userEvent.setup()
	renderNewSession(REJECTION)
	await submitAndReject(user)

	// The summary item for the token error opens the token's own popover.
	await user.click(
		within(summary()!).getByRole('button', { name: 'Too long for this plan' }),
	)
	await waitFor(() => {
		const errorLead = within(popup()).getByText('Too long for this plan')
		expect(errorLead).toBeVisible()
	})
	// The step's absent-facet message rides along, and its repairing
	// "＋ intensity" neighbour link is highlighted (§10.2).
	expect(popup()).toHaveTextContent('Pick an intensity for tempo work')
	const highlighted = popup().querySelector('[data-error-highlight]')
	expect(highlighted).toHaveTextContent('＋ intensity')
})

test('the block gutter menu leads with the block’s message', async () => {
	const user = userEvent.setup()
	renderNewSession(REJECTION)
	await submitAndReject(user)

	await user.click(blockGrip())
	const menu = await screen.findByRole('menu')
	expect(within(menu).getByText('That block name is taken')).toBeInTheDocument()
})

test('a marking clears locally the moment its value changes — no re-run of server rules — and the count follows', async () => {
	const user = userEvent.setup()
	renderNewSession(REJECTION)
	await submitAndReject(user)
	expect(summary()).toHaveTextContent('5 things need fixing')

	// Edit the duration behind the token anchor (through the token's own
	// popover, which binds the same Conform field the marking watches).
	await setDuration(user, '8')

	await waitFor(() =>
		expect(summary()).toHaveTextContent('4 things need fixing'),
	)
	expect(
		within(summary()!).queryByText('Too long for this plan'),
	).not.toBeInTheDocument()
	// The token itself is clean again.
	expect(
		screen.getByRole('button', { name: /^8 min duration/ }),
	).not.toHaveAttribute('data-server-error')

	// Clearing is one-way: typing the rejected value back does not repaint —
	// that would be the client re-judging server rules. The next submit
	// returns the full truth.
	await setDuration(user, '6')
	await screen.findByRole('button', { name: /^6 min duration/ })
	expect(summary()).toHaveTextContent('4 things need fixing')
	expect(
		screen.getByRole('button', { name: /^6 min duration/ }),
	).not.toHaveAttribute('data-server-error')

	// Introducing the absent intensity clears the step-anchored marking too.
	await user.click(screen.getByRole('button', { name: /^6 min duration/ }))
	await user.click(await screen.findByRole('button', { name: '＋ intensity' }))
	await user.click(await within(popup()).findByRole('button', { name: /Z3/ }))
	await waitFor(() =>
		expect(summary()).toHaveTextContent('3 things need fixing'),
	)
	// The popover keeps the rest of the card inert while open — close it
	// before reading the ⋮ mark's paint.
	await user.keyboard('{Escape}')
	await waitFor(() =>
		expect(document.querySelector('[data-step-menu]')).not.toHaveAttribute(
			'data-server-error',
		),
	)
})

test('the whole summary disappears when everything anchored is repaired', async () => {
	const user = userEvent.setup()
	renderNewSession({
		'blocks.0.steps.0.durationSec': ['Too long for this plan'],
	})
	await submitAndReject(user)
	expect(summary()).toHaveTextContent('1 thing needs fixing')

	await setDuration(user, '8')
	await waitFor(() => expect(summary()).toBeNull())
})
