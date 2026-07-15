/**
 * @vitest-environment jsdom
 *
 * The empty state — honest-empty with canonical seeds (workout-editor spec
 * §11, #260). A session with zero steps renders a dedicated composition:
 * three fixed archetype seeds as tappable ghost-notation lines plus "or
 * start from scratch ＋" — no stanza chrome anchored to nothing, no strip,
 * nothing fabricated. The first choice materializes the real stanza; the
 * strength seed flips the header discipline; deleting everything brings the
 * same composition back; and saving with zero steps is allowed — the server
 * 400 lands as one summary line in human words with focus and a live-region
 * announcement, clearing when the first step materializes.
 */
import { parseWithZod } from '@conform-to/zod'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { buildBlocksInput, FormSchema } from '#app/utils/workout-authoring.ts'
import { WorkoutAuthoringSchema } from '#app/utils/workout-schema.ts'
import NewSessionRoute from './sessions.new.tsx'

window.HTMLElement.prototype.scrollIntoView = () => {}
window.ResizeObserver ??= class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

/** A stub whose action validates like the real one: first-pass `FormSchema`,
 * then the second-pass `WorkoutAuthoringSchema` over the built blocks — so a
 * zero-step save is rejected by the server exactly as in production. */
function renderNewSession() {
	// Every accepted POST's form data — `posted` fires whether or not the
	// second-pass schema rejects, so tests can assert what actually posted.
	const posted = vi.fn()
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
				posted(Object.fromEntries(formData))
				const submission = parseWithZod(formData, { schema: FormSchema })
				if (submission.status !== 'success') {
					return { result: submission.reply() }
				}
				const authoring = WorkoutAuthoringSchema.safeParse({
					title: submission.value.title,
					discipline: submission.value.discipline,
					intent: submission.value.intent,
					scheduledAt: '2026-06-01T08:00:00.000Z',
					blocks: buildBlocksInput(submission.value),
				})
				if (!authoring.success) {
					const fieldErrors: Record<string, string[]> = {}
					for (const issue of authoring.error.issues) {
						const path = issue.path.join('.')
						;(fieldErrors[path] ??= []).push(issue.message)
					}
					return { result: submission.reply({ fieldErrors }) }
				}
				return { result: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/new']} />)
	return { posted }
}

const emptyState = () =>
	document.querySelector('[data-workout-empty-state]') as HTMLElement | null
const stanza = () => document.querySelector('[data-score-stanza]')
const summary = () =>
	document.querySelector('[data-validation-summary]') as HTMLElement | null

const seed = (name: RegExp) => screen.getByRole('button', { name })
const scratch = () =>
	screen.getByRole('button', { name: /or start from scratch/i })

async function hydrated() {
	await screen.findByLabelText(/title/i)
	await waitFor(() => expect(emptyState()).not.toBeNull())
}

// ——— The composition itself ——————————————————————————————————————————————

test('zero steps renders the honest composition: three ghost seeds + scratch, no chrome, no strip', async () => {
	renderNewSession()
	await hydrated()

	// The three fixed archetype seeds, each a native button carrying its
	// ghost-notation line (§11.3, §11.7).
	const composition = emptyState()!
	expect(
		within(composition).getByRole('button', { name: /easy session/i }),
	).toHaveTextContent('45 min @ easy')
	const intervals = within(composition).getByRole('button', {
		name: /intervals/i,
	})
	expect(intervals).toHaveTextContent('15 min')
	expect(intervals).toHaveTextContent('4×')
	expect(intervals).toHaveTextContent('4 min @ threshold ( 2 min rest )')
	expect(intervals).toHaveTextContent('10 min')
	expect(
		within(composition).getByRole('button', { name: /strength session/i }),
	).toHaveTextContent('exercise 3 × 8 → exercise 3 × 5')
	expect(
		within(composition).getByRole('button', { name: /start from scratch/i }),
	).toBeInTheDocument()

	// No stanza chrome anchored to nothing (B11), and the strip region is
	// absent (§8.1).
	expect(stanza()).toBeNull()
	expect(document.querySelector('[data-stanza-grip]')).toBeNull()
	expect(document.querySelector('[data-step-menu]')).toBeNull()
	expect(
		document.querySelector('[data-testid="editor-workout-shape"]'),
	).toBeNull()
	expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull()
})

test('the seeds and the scratch affordance are native tab stops in order (§9.3)', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await hydrated()

	seed(/easy session/i).focus()
	await user.tab()
	expect(seed(/intervals/i)).toHaveFocus()
	await user.tab()
	expect(seed(/strength session/i)).toHaveFocus()
	await user.tab()
	expect(scratch()).toHaveFocus()
})

// ——— Seeds materialize the real stanza ———————————————————————————————————

test('the Easy seed materializes one block: 45 min with the easy zone chip', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await hydrated()

	await user.click(seed(/easy session/i))

	await waitFor(() => expect(stanza()).not.toBeNull())
	expect(emptyState()).toBeNull()
	expect(
		screen.getByRole('button', { name: /^45 min duration, step 1 of 1/ }),
	).toBeInTheDocument()
	const chip = document.querySelector('[data-token-type="intensity"]')
	expect(chip).toHaveTextContent('Easy')
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent('Easy session added'),
	)
})

test('the Intervals seed materializes warm-up · 4× work/rest · cool-down', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await hydrated()

	await user.click(seed(/intervals/i))

	await waitFor(() => expect(stanza()).not.toBeNull())
	expect(document.querySelectorAll('[data-stanza-line]')).toHaveLength(3)
	// The middle block's repeat renders as the gutter badge.
	expect(
		screen.getByRole('button', { name: /^repeated 4 times, block 2 of 3/ }),
	).toBeInTheDocument()
	expect(
		screen.getByRole('button', {
			name: /^4 min duration, step 1 of 2, block 2 of 3/,
		}),
	).toBeInTheDocument()
	expect(
		document.querySelector('[data-token-type="intensity"]'),
	).toHaveTextContent('Threshold')
	// The rest step reads as the parenthesized rest notation.
	expect(
		screen.getByRole('button', {
			name: /^2 min rest, step 2 of 2, block 2 of 3/,
		}),
	).toBeInTheDocument()
})

test('the Strength seed flips the header discipline and lands two set-notation steps', async () => {
	const user = userEvent.setup()
	const { posted } = renderNewSession()
	await hydrated()

	await user.click(seed(/strength session/i))

	await waitFor(() => expect(stanza()).not.toBeNull())
	expect(
		screen.getByRole('button', { name: /^sets: 3 × 8, step 1 of 2/ }),
	).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: /^sets: 3 × 5, step 2 of 2/ }),
	).toBeInTheDocument()

	// The header discipline flipped to strength (§11.3) — asserted on the
	// form control (the Select trigger's label needs the popup's items, which
	// jsdom never mounts)…
	const hostForm = document.getElementById('new-session') as HTMLFormElement
	expect(
		(hostForm.elements.namedItem('discipline') as HTMLInputElement).value,
	).toBe('strength')

	// …and the flip survives to the posted payload alongside both steps.
	await user.type(screen.getByLabelText(/title/i), 'Gym Day')
	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(posted).toHaveBeenCalledTimes(1))
	const payload = posted.mock.calls[0]![0] as Record<string, string>
	expect(payload.discipline).toBe('strength')
	expect(payload['blocks[0].steps[0].kind']).toBe('strength')
	expect(payload['blocks[0].steps[1].kind']).toBe('strength')
	expect(payload['blocks[0].steps[0].sets[2].reps']).toBe('8')
	expect(payload['blocks[0].steps[1].sets[2].reps']).toBe('5')
})

// ——— Start from scratch ——————————————————————————————————————————————————

test('"or start from scratch ＋" opens the kind chooser; the chosen kind materializes the stanza', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await hydrated()

	await user.click(scratch())
	// The three-row kind chooser (§4.1), each row with its seed hint.
	const menu = await screen.findByRole('menu')
	const items = within(menu).getAllByRole('menuitem')
	expect(items.map((item) => item.textContent)).toEqual([
		'Cardiostarts as 10 min',
		'Strengthstarts as an exercise, 1 × 5',
		'Reststarts as 1 min of recovery',
	])

	await user.click(within(menu).getByRole('menuitem', { name: /rest/i }))
	await waitFor(() => expect(stanza()).not.toBeNull())
	expect(emptyState()).toBeNull()
	expect(
		screen.getByRole('button', { name: /^1 min rest, step 1 of 1/ }),
	).toBeInTheDocument()
})

// ——— A pure function of zero steps ———————————————————————————————————————

test('emptying the session out brings the identical composition back (§11.5)', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await hydrated()

	await user.click(seed(/easy session/i))
	await waitFor(() => expect(stanza()).not.toBeNull())

	// Remove the only step through its ⋮ menu — no last-step guard.
	await user.click(
		screen.getByRole('button', { name: 'Step 1 of 1 actions, block 1 of 1' }),
	)
	await user.click(await screen.findByRole('menuitem', { name: 'Remove' }))

	await waitFor(() => expect(emptyState()).not.toBeNull())
	expect(stanza()).toBeNull()
	expect(seed(/easy session/i)).toBeInTheDocument()
	expect(scratch()).toBeInTheDocument()
})

// ——— Zero steps + save ———————————————————————————————————————————————————

test('saving with zero steps posts, lands the summary-line floor with focus + announcement, and clears when a step exists', async () => {
	const user = userEvent.setup()
	renderNewSession()
	await hydrated()

	await user.type(screen.getByLabelText(/title/i), 'Empty Day')
	// No disabled save button (§11.6): the save posts and the server answers.
	const save = screen.getByRole('button', { name: /create session/i })
	expect(save).toBeEnabled()
	await user.click(save)

	// One summary line in human words — §10's floor: plain text, no anchor
	// button — and the summary itself takes focus.
	await waitFor(() => expect(summary()).not.toBeNull())
	const line = summary()!
	expect(line).toHaveTextContent('1 thing needs fixing')
	const item = within(line).getByText(
		'Add at least one step to save this session',
	)
	expect(item.tagName).toBe('SPAN')
	await waitFor(() => expect(line).toHaveFocus())
	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent(
			/1 thing needs fixing — Add at least one step to save this session/,
		),
	)

	// Edit-to-clear (§10.4): the summary clears the moment the first step
	// materializes.
	await user.click(seed(/easy session/i))
	await waitFor(() => expect(summary()).toBeNull())
	expect(stanza()).not.toBeNull()
})
