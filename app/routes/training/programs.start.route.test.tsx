/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import {
	STRONGLIFTS_EMPTY_BAR_START_KG,
	STRONGLIFTS_PULL_START_KG,
} from '#app/utils/strength/program.constants.ts'
import StartProgramRoute from './programs.$programId.start.tsx'

// ── Start a program ──────────────────────────────────────────────────────────
// One number per lift, and the screen has one job: get that number to the
// action. A weight it will not carry has to say so — a submit that does nothing
// is the worst answer this form can give. And every pre-filled number has to say
// where it came from, because a number the athlete cannot account for is a
// number they cannot accept.

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
	programKey = 'stronglifts-5x5',
	actionResult = { ok: true as const },
}: {
	lifts?: Lift[]
	programKey?: string
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
				program: {
					id: 'prog-1',
					key: programKey,
					name: 'StrongLifts 5×5',
					lifts,
				},
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

/** The published StrongLifts shape: the empty bar for the presses and the squat,
 * the low end of the published range for the pulls. */
function strongLiftsLifts(): Lift[] {
	return [
		lift({
			exerciseId: 'ex-squat',
			name: 'Squat',
			equipment: null,
			defaultStartKg: STRONGLIFTS_EMPTY_BAR_START_KG,
		}),
		lift({
			exerciseId: 'ex-row',
			name: 'Barbell Row',
			equipment: null,
			defaultStartKg: STRONGLIFTS_PULL_START_KG,
		}),
		lift({
			exerciseId: 'ex-deadlift',
			name: 'Deadlift',
			equipment: null,
			setCount: 1,
			defaultStartKg: STRONGLIFTS_PULL_START_KG,
		}),
	]
}

test('every field is pre-filled with the program’s own published default', async () => {
	renderRoute({ lifts: strongLiftsLifts() })

	expect(await screen.findByLabelText(/Squat/)).toHaveValue(
		STRONGLIFTS_EMPTY_BAR_START_KG,
	)
	expect(screen.getByLabelText(/Barbell Row/)).toHaveValue(
		STRONGLIFTS_PULL_START_KG,
	)
	expect(screen.getByLabelText(/Deadlift/)).toHaveValue(
		STRONGLIFTS_PULL_START_KG,
	)
})

test('the scheme sits on the label row beside the lift', async () => {
	renderRoute({ lifts: strongLiftsLifts() })

	// The squat is 5×5 and the deadlift is the program's one heavy single set.
	// The scheme is part of the field's own accessible name, so it is read out
	// with the lift rather than sitting beside it as unattached decoration.
	expect(await screen.findByLabelText(/Squat 5×5/)).toBeInTheDocument()
	expect(screen.getByLabelText(/Deadlift 1×5/)).toBeInTheDocument()
})

test('each pre-filled number says where it came from', async () => {
	renderRoute({ lifts: strongLiftsLifts() })

	// The empty bar is a fixed absolute weight — that is why no 1RM is needed …
	expect(
		await screen.findByText(
			'StrongLifts 5×5 publishes 20 kg here — the empty bar.',
		),
	).toBeInTheDocument()
	// … and the pulls are published as a range, with the low end taken and said.
	expect(
		screen.getAllByText('The low end of the published 30–40 kg range.'),
	).toHaveLength(2)
})

test('the hint is attached to its own field, not merely nearby', async () => {
	renderRoute({ lifts: strongLiftsLifts() })

	const squat = await screen.findByLabelText(/Squat/)
	const hintId = squat.getAttribute('aria-describedby')
	expect(hintId).toBeTruthy()
	expect(document.getElementById(hintId!)).toHaveTextContent(
		'StrongLifts 5×5 publishes 20 kg here — the empty bar.',
	)
})

test('a lift the program seeds by instruction is left empty and says so', async () => {
	renderRoute({
		lifts: [lift({ defaultStartKg: null, startSeedRepMaxReps: 10 })],
	})

	expect(await screen.findByLabelText(/Back squat/)).toHaveValue(null)
	expect(
		screen.getByText(
			'StrongLifts 5×5 says: a weight you could lift for 10 reps.',
		),
	).toBeInTheDocument()
})

test('the field takes a numeric keypad on a phone', async () => {
	renderRoute({ lifts: strongLiftsLifts() })

	for (const field of await screen.findAllByRole('spinbutton')) {
		expect(field).toHaveAttribute('inputmode', 'decimal')
	}
})

test('the primary button names the program', async () => {
	renderRoute({ lifts: strongLiftsLifts() })

	expect(
		await screen.findByRole('button', { name: 'Start StrongLifts 5×5' }),
	).toBeInTheDocument()
})

test('the unit is stated once per field rather than typed by the athlete', async () => {
	renderRoute({ lifts: [lift({ defaultStartKg: 20 })] })

	const field = await screen.findByLabelText(/Back squat/)
	const row = field.closest('[data-slot="starting-weight-field"]')
	expect(row).not.toBeNull()
	expect(within(row as HTMLElement).getByText('kg')).toBeInTheDocument()
})

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
