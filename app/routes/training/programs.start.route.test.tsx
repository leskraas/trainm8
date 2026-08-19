/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import StartProgramRoute from './programs.$programId.start.tsx'

// ── Start a program ──────────────────────────────────────────────────────────
// One number per lift, and the screen has one job: get that number to the
// action. A weight it will not carry has to say so — a submit that does nothing
// is the worst answer this form can give.

type Lift = {
	exerciseId: string
	name: string
	equipment: string | null
	setCount: number
	repsPerSet: number
	defaultStartKg: number | null
	startSeedRepMaxReps: number | null
}

function lift(overrides: Partial<Lift> = {}): Lift {
	return {
		exerciseId: 'ex-squat',
		name: 'Back squat',
		equipment: 'barbell',
		setCount: 5,
		repsPerSet: 5,
		defaultStartKg: null,
		startSeedRepMaxReps: 10,
		...overrides,
	}
}

function renderRoute({
	lifts = [lift()],
	actionResult = { ok: true as const },
}: {
	lifts?: Lift[]
	actionResult?: { ok: true } | { ok: false; error: string }
} = {}) {
	const submitted = vi.fn()
	const Stub = createRoutesStub([
		{
			path: '/training/programs/:programId/start',
			Component: (props: Record<string, unknown>) => (
				<StartProgramRoute {...(props as any)} />
			),
			loader: () => ({
				program: { id: 'prog-1', name: 'StrongLifts 5×5', lifts },
			}),
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return actionResult
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<Stub initialEntries={['/training/programs/prog-1/start']} />)
	return { submitted }
}

test('a weight the athlete’s plates can make is not rejected by the input', async () => {
	const { submitted } = renderRoute()
	const user = userEvent.setup()

	// 61.25 kg is a bar plus 1.25 kg plates — a rack the app knows nothing about,
	// so the field may not decide it is impossible.
	await user.type(await screen.findByLabelText(/Back squat/), '61.25')
	await user.click(screen.getByRole('button', { name: /Start StrongLifts/i }))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ 'weight::ex-squat::barbell': '61.25' }),
	)
})

test('a value the form refuses says why rather than swallowing the submit', async () => {
	const { submitted } = renderRoute({
		actionResult: {
			ok: false,
			error: 'A starting weight has to be a positive number of kilos.',
		},
	})
	const user = userEvent.setup()

	await user.type(await screen.findByLabelText(/Back squat/), '-5')
	await user.click(screen.getByRole('button', { name: /Start StrongLifts/i }))

	// The submit reached the action rather than dying at the input …
	expect(submitted).toHaveBeenCalled()
	// … and the refusal is on the screen, in the same place every other one is.
	expect(await screen.findByRole('alert')).toHaveTextContent(
		'A starting weight has to be a positive number of kilos.',
	)
})
