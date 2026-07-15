/**
 * @vitest-environment jsdom
 *
 * Inline token editing on the Workout Detail View (ADR 0027, R7; autosave from
 * workout-editor spec §1, #261). The detail view IS the editor: a scheduled
 * session's Token Sentence is editable in place and AUTOSAVES through the
 * detail route's own workout-update action via a fetcher on every committed
 * change — no save button, no edit-page round-trip (the standalone edit page is
 * gone, §12). Non-scheduled sessions stay inert. These route-level tests render
 * the detail route with a stub of that action (the real save path is DB-tested
 * in `sessions.$sessionId.test.ts`), interact with tokens, and assert the
 * autosaved prescription.
 */
import { parseWithZod } from '@conform-to/zod'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub, data, redirect } from 'react-router'
import { expect, test } from 'vitest'
import { parseDuration } from '#app/utils/format.ts'
import { type SessionDetail } from '#app/utils/training.server.ts'
import { FormSchema } from '#app/utils/workout-authoring.ts'
import { AUTOSAVE_DEBOUNCE_MS } from './__workout-detail-editor.tsx'
import SessionDetailRoute from './sessions.$sessionId.tsx'

// Autosave posts land after the debounce plus a fetch round-trip and a
// revalidation; this leaves ample slack over both without slowing the suite.
const SAVE_TIMEOUT = 3000

// The Token Sentence editor mounts Radix popovers; jsdom implements neither of
// these, which some popover internals reach for on open.
window.HTMLElement.prototype.scrollIntoView = () => {}
window.ResizeObserver ??= class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

function scheduledRun(overrides: Partial<SessionDetail> = {}): SessionDetail {
	return {
		id: 'session-1',
		scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
		status: 'scheduled',
		source: 'authored',
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		replanReason: null,
		workout: {
			id: 'workout-1',
			title: 'Tempo Run',
			description: null,
			discipline: 'run',
			intent: 'threshold',
			blocks: [
				{
					id: 'block-1',
					name: 'Main set',
					orderIndex: 0,
					repeatCount: 1,
					steps: [
						{
							id: 'step-1',
							kind: 'cardio',
							notes: null,
							discipline: 'run',
							intensity: null,
							orderIndex: 0,
							durationSec: 1800,
							distanceM: null,
							exerciseId: null,
							restBetweenSetsSec: null,
							intensityHrMin: null,
							intensityHrMax: null,
							intensityPowerMin: null,
							intensityPowerMax: null,
							intensityPaceMin: null,
							intensityPaceMax: null,
							exercise: null,
							sets: [],
						},
					],
				},
			],
		},
		sessionLog: null,
		recording: null,
		...overrides,
	}
}

type Captured = {
	payload: Record<string, unknown> | null
	url: string | null
	/** How many times the edit action fired — one committed edit is one post. */
	posts: number
}

/** A promise the test resolves by hand — lets the stub action "hang" so the
 * delayed "saving…" indicator can be observed, then release cleanly. */
function deferred() {
	let resolve!: () => void
	const promise = new Promise<void>((r) => {
		resolve = r
	})
	return { promise, resolve }
}

/**
 * Render the detail route with a stub of its own workout-update action. The
 * stub embodies the documented save behaviour — it applies the edited duration
 * to a mutable store, mirrors Generated-Session adoption (`generated →
 * authored`, ADR 0016), and redirects like the real action — so the detail view
 * proves it routes the inline save through that path. Pass `failWith` to
 * exercise the error surface, or `hangUntil` to hold the response open for the
 * delayed-indicator test.
 */
function setup(
	session: SessionDetail,
	options: { failWith?: string; hangUntil?: Promise<void> } = {},
) {
	const store = { session }
	const captured: Captured = { payload: null, url: null, posts: 0 }

	const App = createRoutesStub([
		{
			path: '/training/sessions/:sessionId',
			Component: (props: Record<string, unknown>) => (
				<SessionDetailRoute {...(props as any)} />
			),
			loader: () => ({
				session: store.session,
				thresholds: {},
				lastSimilar: null,
			}),
			action: async ({ request }: { request: Request }) => {
				const formData = await request.formData()
				captured.payload = Object.fromEntries(formData)
				captured.url = new URL(request.url).pathname
				captured.posts += 1

				if (options.hangUntil) await options.hangUntil

				if (options.failWith) {
					const submission = parseWithZod(formData, { schema: FormSchema })
					return data(
						{ result: submission.reply({ formErrors: [options.failWith] }) },
						{ status: 400 },
					)
				}

				// Reflect the saved edit + adoption in the store so revalidation is
				// honest, mirroring updateWorkoutSession (PRD #103 / ADR 0016).
				const newDurationSec = parseDuration(
					String(formData.get('blocks[0].steps[0].duration') ?? ''),
				)
				const workout = store.session.workout!
				const block = workout.blocks[0]!
				const step = block.steps[0]!
				store.session = {
					...store.session,
					source:
						store.session.source === 'generated'
							? 'authored'
							: store.session.source,
					workout: {
						...workout,
						blocks: [
							{ ...block, steps: [{ ...step, durationSec: newDurationSec }] },
						],
					},
				}
				throw redirect(`/training/sessions/${store.session.id}`)
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])

	render(<App initialEntries={['/training/sessions/session-1']} />)
	return { store, captured }
}

async function bumpDuration(user: ReturnType<typeof userEvent.setup>) {
	await user.click(
		await screen.findByRole('button', { name: /^30 min duration/ }),
	)
	await user.click(
		await screen.findByRole('button', { name: /increase duration/i }),
	)
	await user.keyboard('{Escape}')
	await screen.findByRole('button', { name: /^35 min duration/ })
}

test('a scheduled session edits a token inline and autosaves the whole prescription through the detail action', async () => {
	const user = userEvent.setup()
	const { captured } = setup(scheduledRun())

	await screen.findByText('Tempo Run')
	// No save button and no edit-page prose — the change alone triggers the save.
	expect(
		screen.queryByRole('button', { name: /save changes/i }),
	).not.toBeInTheDocument()
	expect(screen.queryByText(/open the edit page/i)).not.toBeInTheDocument()

	await bumpDuration(user)

	// The committed change autosaves — no user action, no button click.
	await waitFor(() => expect(captured.payload).not.toBeNull(), {
		timeout: SAVE_TIMEOUT,
	})
	// The autosave posts to the detail route's own action — no bespoke save path.
	expect(captured.url).toBe('/training/sessions/session-1')
	// The full prescription round-trips, not just the tapped token: untouched
	// fields (title, block name, step kind) survive alongside the edited value,
	// and the `saveWorkout` control field routes it to the right action branch
	// without colliding with the workout's own `intent`.
	expect(captured.payload).toMatchObject({
		saveWorkout: '1',
		title: 'Tempo Run',
		discipline: 'run',
		intent: 'threshold',
		structure: 'structured',
		'blocks[0].name': 'Main set',
		'blocks[0].repeatCount': '1',
		'blocks[0].steps[0].kind': 'cardio',
		'blocks[0].steps[0].duration': '35 min',
	})
	// The prescription re-renders with the edit — no navigation to the edit page.
	expect(
		screen.getByRole('button', { name: /^35 min duration/ }),
	).toBeInTheDocument()
	// One committed edit is exactly one post: the save's own revalidation must
	// not look like a fresh change and re-post itself (silence is the norm).
	await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2))
	expect(captured.posts).toBe(1)
})

test('merely opening a scheduled session persists nothing — autosave fires on change, not on mount', async () => {
	const user = userEvent.setup()
	const { captured } = setup(scheduledRun())

	await screen.findByText('Tempo Run')
	// Give any mount-time effect a beat past the autosave debounce to fire.
	await new Promise((resolve) =>
		setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 300),
	)
	expect(captured.payload).toBeNull()

	// A real edit does post, proving the quiet mount wasn't a broken save path.
	await bumpDuration(user)
	await waitFor(() => expect(captured.payload).not.toBeNull(), {
		timeout: SAVE_TIMEOUT,
	})
})

test('a completed session renders the sentence read-only, with no inline editor', async () => {
	setup(scheduledRun({ status: 'completed' }))

	await screen.findByText('Tempo Run')
	// No save affordance, no tappable tokens — recorded history is immutable.
	expect(
		screen.queryByRole('button', { name: /save changes/i }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /duration, step/ }),
	).not.toBeInTheDocument()
	const stanza = document.querySelector('[data-score-stanza]')!
	expect(stanza).toHaveTextContent('30 min')
	expect(
		stanza.querySelectorAll('button, a, input, [role="button"], [tabindex]'),
	).toHaveLength(0)
})

test('editing a generated session autosaves through the detail action, adopting it (source: authored)', async () => {
	const user = userEvent.setup()
	const { store, captured } = setup(scheduledRun({ source: 'generated' }))

	await screen.findByText('Tempo Run')
	await bumpDuration(user)

	// The autosave reaches the detail route's workout-update action — the same
	// path that flips a Generated Session to `authored`. Server-side adoption is
	// DB-tested for that action; here the reused action performs the flip.
	await waitFor(
		() => expect(captured.url).toBe('/training/sessions/session-1'),
		{ timeout: SAVE_TIMEOUT },
	)
	await waitFor(() => expect(store.session.source).toBe('authored'))
})

test('a failed autosave surfaces the server error inline without losing the draft', async () => {
	const user = userEvent.setup()
	setup(scheduledRun(), { failWith: 'Could not save — try again' })

	await screen.findByText('Tempo Run')
	await bumpDuration(user)

	// The server's validation error surfaces inline, through the one §10
	// validation summary (never two error systems on one card)…
	expect(
		await screen.findByText('Could not save — try again'),
	).toBeInTheDocument()
	expect(document.querySelectorAll('[data-validation-summary]')).toHaveLength(1)
	// …and the athlete's in-progress edit is preserved, not reverted.
	expect(
		screen.getByRole('button', { name: /^35 min duration/ }),
	).toBeInTheDocument()
})

// This case deliberately holds a save open past the ~2 s hang threshold, so it
// needs headroom over vitest's 5 s default; the try/finally guarantees the held
// save is always released, even on a failed assertion, so no pending fetcher
// can outlive the test.
test('a fast autosave is silent — the "saving…" indicator only appears when a save hangs', async () => {
	const user = userEvent.setup()
	const gate = deferred()
	const { captured } = setup(scheduledRun(), { hangUntil: gate.promise })

	try {
		await screen.findByText('Tempo Run')
		await bumpDuration(user)

		// The save is in flight but must stay quiet until it has hung ~2 s.
		await waitFor(() => expect(captured.payload).not.toBeNull(), {
			timeout: SAVE_TIMEOUT,
		})
		expect(screen.queryByText(/saving…/i)).not.toBeInTheDocument()

		// Once it hangs past the threshold, the quiet delayed indicator appears.
		expect(
			await screen.findByText(/saving…/i, {}, { timeout: SAVE_TIMEOUT }),
		).toBeInTheDocument()
	} finally {
		// Releasing the save clears the indicator — silence is the resting state.
		gate.resolve()
	}
	await waitFor(() =>
		expect(screen.queryByText(/saving…/i)).not.toBeInTheDocument(),
	)
}, 15000)
