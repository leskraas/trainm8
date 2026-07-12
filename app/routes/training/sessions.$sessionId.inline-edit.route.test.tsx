/**
 * @vitest-environment jsdom
 *
 * Inline token editing on the Workout Detail View (ADR 0027, R7 — slice 8/9).
 * Read = write: a scheduled session's Token Sentence is editable in place and
 * saves through the EXISTING edit action via a fetcher; non-scheduled sessions
 * stay inert. These route-level tests render the detail route beside a stub of
 * the edit route's action (the real save path is DB-tested in
 * `upcoming.$sessionId.edit.test.ts`), interact with tokens, and assert the
 * submitted prescription.
 */
import { parseWithZod } from '@conform-to/zod'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub, data, redirect } from 'react-router'
import { expect, test } from 'vitest'
import { parseDuration } from '#app/utils/format.ts'
import { type SessionDetail } from '#app/utils/training.server.ts'
import { FormSchema } from '#app/utils/workout-authoring.ts'
import SessionDetailRoute from './sessions.$sessionId.tsx'

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

type Captured = { payload: Record<string, unknown> | null; url: string | null }

/**
 * Render the detail route beside a stub of the edit route. The stub embodies
 * the documented save behaviour — it applies the edited duration to a mutable
 * store, mirrors Generated-Session adoption (`generated → authored`, ADR 0016),
 * and redirects like the real action — so the detail view proves it routes the
 * inline save through that path. Pass `failWith` to exercise the error surface.
 */
function setup(session: SessionDetail, options: { failWith?: string } = {}) {
	const store = { session }
	const captured: Captured = { payload: null, url: null }

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
			HydrateFallback: () => <div>Loading...</div>,
		},
		{
			path: '/training/upcoming/:sessionId/edit',
			action: async ({ request }: { request: Request }) => {
				const formData = await request.formData()
				captured.payload = Object.fromEntries(formData)
				captured.url = new URL(request.url).pathname

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

test('a scheduled session edits a token inline and saves the whole prescription through the edit action', async () => {
	const user = userEvent.setup()
	const { captured } = setup(scheduledRun())

	await screen.findByText('Tempo Run')
	await bumpDuration(user)

	await user.click(screen.getByRole('button', { name: /save changes/i }))

	await waitFor(() => expect(captured.payload).not.toBeNull())
	// The inline save reuses the edit route's action — no bespoke save path.
	expect(captured.url).toBe('/training/upcoming/session-1/edit')
	// The full prescription round-trips, not just the tapped token: untouched
	// fields (title, block name, step kind) survive alongside the edited value.
	expect(captured.payload).toMatchObject({
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

test('editing a generated session posts through the edit action, adopting it (source: authored)', async () => {
	const user = userEvent.setup()
	const { store, captured } = setup(scheduledRun({ source: 'generated' }))

	await screen.findByText('Tempo Run')
	await bumpDuration(user)

	await user.click(screen.getByRole('button', { name: /save changes/i }))

	// The save reaches the edit action — the same path that flips a Generated
	// Session to `authored`. Server-side adoption is DB-tested for the edit
	// action; here the reused action performs the flip.
	await waitFor(() =>
		expect(captured.url).toBe('/training/upcoming/session-1/edit'),
	)
	await waitFor(() => expect(store.session.source).toBe('authored'))
})

test('a failed save surfaces the server error inline without losing the draft', async () => {
	const user = userEvent.setup()
	setup(scheduledRun(), { failWith: 'Could not save — try again' })

	await screen.findByText('Tempo Run')
	await bumpDuration(user)

	await user.click(screen.getByRole('button', { name: /save changes/i }))

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
