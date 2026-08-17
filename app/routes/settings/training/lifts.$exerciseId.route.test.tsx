/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { type StoredAnchor } from '#app/utils/strength-anchors.server.ts'
import ExerciseAnchorsRoute from './lifts.$exerciseId.tsx'

// ── Your numbers for one lift ────────────────────────────────────────────────
// The screen's contract: an anchor states its own provenance, the history is a
// list rather than a field, and a prescription nothing resolves shows the
// absence instead of a kilo.

function anchor(overrides: Partial<StoredAnchor> = {}): StoredAnchor {
	return {
		id: 'anchor-1',
		construct: 'oneRm',
		valueKg: 140,
		reps: null,
		protocol: 'athlete-stated',
		confidence: null,
		effectiveAtISO: '2026-08-01T12:00:00.000Z',
		createdAtISO: '2026-08-01T12:00:00.000Z',
		sourceSetLogId: null,
		...overrides,
	}
}

type LoaderData = {
	exerciseId: string
	exerciseName: string
	timezone: string
	bodyweightKg: number | null
	anchors: StoredAnchor[]
	prescriptions: Array<{
		sessionId: string
		sessionTitle: string
		scheduledAtISO: string
		summary: string | null
	}>
}

function loaderData(overrides: Partial<LoaderData> = {}): LoaderData {
	return {
		exerciseId: 'ex-1',
		exerciseName: 'Back squat',
		timezone: 'UTC',
		bodyweightKg: 80,
		anchors: [],
		prescriptions: [],
		...overrides,
	}
}

function renderRoute(overrides: Partial<LoaderData> = {}) {
	const submitted = vi.fn()
	const Stub = createRoutesStub([
		{
			path: '/settings/training/lifts/:exerciseId',
			Component: (props: Record<string, unknown>) => (
				<ExerciseAnchorsRoute {...(props as any)} />
			),
			loader: () => loaderData(overrides),
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return { ok: true, message: 'Saved.' }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<Stub initialEntries={['/settings/training/lifts/ex-1']} />)
	return { submitted }
}

test('an unresolved 85 % 1RM renders the prescription and its stated absence, never a number', async () => {
	renderRoute({
		prescriptions: [
			{
				sessionId: 'sess-1',
				sessionTitle: 'Squat day',
				scheduledAtISO: '2026-08-12T17:00:00.000Z',
				summary: '5 × 5 @ 85% 1RM · no 1RM on file',
			},
		],
	})

	const line = await screen.findByText(/85% 1RM/)
	expect(line).toHaveTextContent('5 × 5 @ 85% 1RM · no 1RM on file')
	// The whole rule in one assertion: nothing on this line is a weight.
	expect(line.textContent).not.toMatch(/\d+(\.\d+)? kg/)
})

test('with an anchor on file the same prescription shows the athlete’s own kilos', async () => {
	renderRoute({
		anchors: [anchor()],
		prescriptions: [
			{
				sessionId: 'sess-1',
				sessionTitle: 'Squat day',
				scheduledAtISO: '2026-08-12T17:00:00.000Z',
				summary: '5 × 5 @ 85% 1RM · 119 kg',
			},
		],
	})

	expect(await screen.findByText(/85% 1RM · 119 kg/)).toBeInTheDocument()
})

test('a number the athlete typed is shown as ungraded rather than as a confident one', async () => {
	renderRoute({ anchors: [anchor()] })

	expect(await screen.findByText('140 kg 1RM')).toBeInTheDocument()
	expect(screen.getByText('you typed it')).toBeInTheDocument()
	// No badge at all would read as a missing grade; "not graded" is the stated
	// answer, because the app does not grade what somebody said about themselves.
	expect(screen.getByText('not graded')).toBeInTheDocument()
	expect(screen.queryByText(/confidence/)).toBeNull()
})

test('an older anchor stays on the screen, marked superseded rather than removed', async () => {
	renderRoute({
		anchors: [
			anchor({
				id: 'new',
				valueKg: 140,
				effectiveAtISO: '2026-08-01T12:00:00.000Z',
			}),
			anchor({
				id: 'old',
				valueKg: 120,
				effectiveAtISO: '2026-06-01T12:00:00.000Z',
			}),
		],
	})

	expect(await screen.findByText('140 kg 1RM')).toBeInTheDocument()
	expect(screen.getByText('120 kg 1RM')).toBeInTheDocument()
	expect(screen.getByText('superseded')).toBeInTheDocument()
})

test('saving a rep max posts the rep count it is at, because the number alone is ambiguous', async () => {
	const { submitted } = renderRoute()
	const user = userEvent.setup()

	await user.click(await screen.findByRole('combobox', { name: /What it is/i }))
	await user.click(screen.getByRole('option', { name: 'Rep max' }))
	await user.type(screen.getByLabelText(/^kg$/i), '92.5')
	await user.type(screen.getByLabelText(/at reps/i), '8')
	await user.click(screen.getByRole('button', { name: /Save this number/i }))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			intent: 'add-anchor',
			construct: 'repMax',
			valueKg: '92.5',
			reps: '8',
		}),
	)
})

test('a one-rep max does not ask for a rep count, because it has none to state', async () => {
	renderRoute()

	expect(await screen.findByLabelText(/^kg$/i)).toBeInTheDocument()
	expect(screen.queryByLabelText(/at reps/i)).toBeNull()
})
