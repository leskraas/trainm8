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
		// The default anchor is one the athlete typed, so no set is missing.
		derivation: { kind: 'no-set' },
		...overrides,
	}
}

type LoaderData = {
	exerciseId: string
	exerciseName: string
	timezone: string
	today: string
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
		today: '2026-08-18',
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

test("a weight the athlete's plates can make is stated as it was stored, not rounded to one decimal", async () => {
	// The runner's plate line for this lift says "your gym makes 60 kg, not
	// 61.25 kg", so this page reading "your 61.3 kg 1RM" showed two numbers for
	// one stored anchor — and a rack with 1.25 kg pairs makes 61.25.
	renderRoute({ anchors: [anchor({ valueKg: 61.25 })] })

	expect(await screen.findByText('61.25 kg 1RM')).toBeInTheDocument()
	expect(screen.getByText(/read against your 61.25 kg 1RM/)).toBeInTheDocument()
	expect(screen.queryByText(/61\.3 kg/)).not.toBeInTheDocument()
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

test('the closed picker names the construct in words, never the stored enum', async () => {
	renderRoute()

	const trigger = await screen.findByRole('combobox', { name: /What it is/i })
	expect(trigger).toHaveTextContent('One-rep max')
	expect(trigger).not.toHaveTextContent('oneRm')
})

test('the date the number takes effect opens on today, so no athlete is shown an empty US date pattern', async () => {
	renderRoute()

	expect(await screen.findByLabelText(/^From$/i)).toHaveValue('2026-08-18')
})

test('a weight the athlete’s plates can make is not rejected by the input', async () => {
	const { submitted } = renderRoute()
	const user = userEvent.setup()

	// 61.25 kg is a bar plus 1.25 kg plates — a rack the app knows nothing about,
	// so the field may not decide it is impossible.
	await user.type(await screen.findByLabelText(/^kg$/i), '61.25')
	await user.click(screen.getByRole('button', { name: /Save this number/i }))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ valueKg: '61.25' }),
	)
})

test('a value the form refuses says why rather than swallowing the submit', async () => {
	const submitted = vi.fn()
	const Stub = createRoutesStub([
		{
			path: '/settings/training/lifts/:exerciseId',
			Component: (props: Record<string, unknown>) => (
				<ExerciseAnchorsRoute {...(props as any)} />
			),
			loader: () => loaderData(),
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return {
					ok: false,
					error: 'A weight has to be a positive number of kilos.',
				}
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<Stub initialEntries={['/settings/training/lifts/ex-1']} />)
	const user = userEvent.setup()

	// Nothing typed at all: the case the browser used to swallow.
	await user.click(
		await screen.findByRole('button', { name: /Save this number/i }),
	)

	// The submit reached the action rather than dying at the input …
	expect(submitted).toHaveBeenCalled()
	// … and the refusal is on the screen, in the same place every other one is.
	expect(await screen.findByRole('alert')).toHaveTextContent(
		'A weight has to be a positive number of kilos.',
	)
})

test('an anchor whose source set is gone does not keep claiming a derivation it cannot show', async () => {
	renderRoute({
		anchors: [
			anchor({
				id: 'anchor-epley',
				construct: 'estimatedOneRm',
				valueKg: 330,
				reps: 5,
				protocol: 'epley',
				confidence: 'medium',
				sourceSetLogId: null,
				derivation: { kind: 'source-gone' },
			}),
		],
	})

	// The number stands — it was the athlete's own the moment they accepted it, and
	// `sourceSetLogId` is `SET NULL` so losing the set does not lose the anchor.
	expect(await screen.findByText('330 kg estimated 1RM')).toBeInTheDocument()
	// The provenance claim does not stand on its own: naming the equation with
	// nothing behind it asserts a derivation the app cannot produce, so the row
	// says the set is gone in the same breath.
	expect(
		screen.getByText(/read from a set that is no longer on file/),
	).toBeInTheDocument()
})

test('an anchor whose source set is on file names its equation without qualification', async () => {
	renderRoute({
		anchors: [
			anchor({
				construct: 'estimatedOneRm',
				valueKg: 116.67,
				reps: 5,
				protocol: 'epley',
				confidence: 'medium',
				sourceSetLogId: 'setlog-1',
				derivation: { kind: 'shown', setLogId: 'setlog-1' },
			}),
		],
	})

	expect(await screen.findByText('Epley/Welday')).toBeInTheDocument()
	expect(screen.queryByText(/no longer on file/)).not.toBeInTheDocument()
})
