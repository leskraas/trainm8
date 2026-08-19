/**
 * @vitest-environment jsdom
 *
 * **The runner's tap-to-log grid, driven by real taps** (ADR 0064).
 *
 * Every test below taps a circle and asserts what was **posted**, because the
 * whole claim of this surface is that a tap is a write: no save button, no load
 * field, and nothing on the screen that is a promise about a set rather than a
 * record of one.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { type PlateInventory } from '#app/utils/strength/plates.ts'
import {
	REST_AFTER_MADE_SET_SEC,
	REST_AFTER_MISSED_SET_SEC,
} from '#app/utils/strength/rest.ts'
import { type StrengthLogView } from '#app/utils/strength-log.server.ts'
import SetLogRoute from './sessions.$sessionId_.log.tsx'

type LogRow = StrengthLogView['exercises'][0]['rows'][0]
type LogExercise = StrengthLogView['exercises'][0]

function row(overrides: Partial<LogRow> = {}): LogRow {
	return {
		orderIndex: 0,
		exerciseSetId: 'set-1',
		prescribedReps: 5,
		prescribedDurationSec: null,
		prescribedLoad: { kind: 'absolute' as const, kg: 82.5 },
		resolvedLoad: null,
		warmupRung: null,
		logged: null,
		ghost: null,
		...overrides,
	}
}

/** Five prescribed working sets, the StrongLifts shape. */
function workingSets(count = 5): LogRow[] {
	return Array.from({ length: count }, (_, index) =>
		row({ orderIndex: index, exerciseSetId: `set-${index + 1}` }),
	)
}

function exercise(overrides: Partial<LogExercise> = {}): LogExercise {
	return {
		stepId: 'step-1',
		exerciseId: 'ex-1',
		name: 'Squat',
		restBetweenSetsSec: null,
		unilateral: null,
		loadSemanticsKind: null,
		rows: workingSets(),
		warmupRows: [],
		warmupUnavailable: null,
		plateContext: null,
		...overrides,
	}
}

function view(overrides: Partial<StrengthLogView> = {}): StrengthLogView {
	return {
		sessionId: 'sess-1',
		sessionTitle: 'Workout A',
		scheduledAt: new Date('2026-08-19T17:00:00Z'),
		status: 'scheduled',
		bodyweightKg: 80,
		exercises: [exercise()],
		hasGymOnFile: false,
		program: null,
		...overrides,
	}
}

function renderLog(
	overrides: Partial<StrengthLogView> = {},
	actionResult: unknown = { ok: true },
) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/sessions/:sessionId/log',
			Component: (props: Record<string, unknown>) => (
				<SetLogRoute {...(props as any)} />
			),
			loader: () => view(overrides),
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return actionResult
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/sess-1/log']} />)
	return { submitted }
}

/** The circle for set `n` of the default lift. */
function circle(n: number) {
	return screen.getByLabelText(new RegExp(`^Logg?ed? set ${n} of Squat$`))
}

// ——— The card ——————————————————————————————————————————————————————————————

test('one card per lift, with the lift name and its resolved scheme and weight', async () => {
	renderLog({
		exercises: [
			exercise(),
			exercise({ stepId: 'step-2', name: 'Bench Press', rows: workingSets(5) }),
		],
	})

	expect(
		await screen.findByRole('heading', { name: 'Squat' }),
	).toBeInTheDocument()
	expect(
		screen.getByRole('heading', { name: 'Bench Press' }),
	).toBeInTheDocument()
	// The one line under the name, and the only place the resolved weight is
	// stated: `5×5 · 82.5 kg`.
	expect(screen.getAllByText('5×5 · 82.5 kg')).toHaveLength(2)
})

test('the header carries the workout eyebrow, the title and a back arrow to the cockpit', async () => {
	renderLog({ program: { instanceId: 'inst-1', name: 'StrongLifts 5×5' } })

	expect(await screen.findByText('Workout A')).toBeInTheDocument()
	expect(
		screen.getByRole('heading', { name: 'Run your workout' }),
	).toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Back to today' })).toHaveAttribute(
		'href',
		'/',
	)
	expect(screen.getByText('StrongLifts 5×5')).toBeInTheDocument()
})

test('a working set is one circle showing its target reps, sized for a shaking hand', async () => {
	renderLog()

	const first = await screen.findByLabelText('Log set 1 of Squat')
	expect(screen.getAllByLabelText(/^Log set \d of Squat$/)).toHaveLength(5)
	expect(first).toHaveTextContent('5')
	// 60px tall — the handoff's `h-15`, and the reason it is a circle and not a row.
	expect(first).toHaveClass('h-15')
	// There is no load field and no reps field anywhere on this surface.
	expect(screen.queryByLabelText(/^kg$/i)).not.toBeInTheDocument()
	expect(screen.queryByLabelText(/^reps$/i)).not.toBeInTheDocument()
})

// ——— The tap ——————————————————————————————————————————————————————————————

test('the first tap logs the full target and posts it through the existing log-set path', async () => {
	const { submitted } = renderLog()

	await userEvent.click(await screen.findByLabelText('Log set 1 of Squat'))

	// Typed fields, and nothing parsed: the load kind and the weight the program
	// resolved, plus the count under the name of the quantity it is.
	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			intent: 'log-set',
			stepId: 'step-1',
			orderIndex: '0',
			role: 'working',
			loadKind: 'external',
			loadNumber: '82.5',
			reps: '5',
		}),
	)
	// And it reads as made, immediately — before the round trip.
	await waitFor(() =>
		expect(screen.getByLabelText('Logged set 1 of Squat')).toHaveAttribute(
			'data-state',
			'made',
		),
	)
})

test('each further tap counts the reps down, and a set under target reads as destructive with the count achieved', async () => {
	const { submitted } = renderLog()

	const first = await screen.findByLabelText('Log set 1 of Squat')
	await userEvent.click(first)
	await userEvent.click(circle(1))

	expect(submitted).toHaveBeenLastCalledWith(
		expect.objectContaining({ intent: 'log-set', orderIndex: '0', reps: '4' }),
	)
	const short = circle(1)
	expect(short).toHaveAttribute('data-state', 'short')
	expect(short).toHaveTextContent('4')
	expect(short).toHaveClass('text-destructive')

	await userEvent.click(circle(1))
	expect(submitted).toHaveBeenLastCalledWith(
		expect.objectContaining({ reps: '3' }),
	)
})

test('a tap past zero clears the set, through the existing clear-set path', async () => {
	const { submitted } = renderLog()

	await userEvent.click(await screen.findByLabelText('Log set 1 of Squat'))
	for (const _ of [5, 4, 3, 2, 1]) await userEvent.click(circle(1))

	expect(circle(1)).toHaveTextContent('0')
	await userEvent.click(circle(1))

	expect(submitted).toHaveBeenLastCalledWith({
		intent: 'clear-set',
		stepId: 'step-1',
		orderIndex: '0',
	})
	// Back to asking, showing the target again.
	const cleared = await screen.findByLabelText('Log set 1 of Squat')
	expect(cleared).toHaveAttribute('data-state', 'untouched')
	expect(cleared).toHaveTextContent('5')
})

test('a set already logged reopens as logged, so a reload does not lose the session', async () => {
	renderLog({
		exercises: [
			exercise({
				rows: [
					row({
						orderIndex: 0,
						logged: {
							id: 'log-1',
							role: 'working',
							outcome: 'completed',
							toFailure: false,
							load: { kind: 'external', kg: 82.5 },
							effectiveKg: 82.5,
							reps: 3,
							repsLeft: null,
							durationSec: null,
							rir: null,
							restTakenSec: null,
						},
					}),
					row({ orderIndex: 1 }),
				],
			}),
		],
	})

	const logged = await screen.findByLabelText('Logged set 1 of Squat')
	expect(logged).toHaveAttribute('data-state', 'short')
	expect(logged).toHaveTextContent('3')
	expect(screen.getByText('1 of 2 logged')).toBeInTheDocument()
})

test('the counter reflects the working sets logged, so nobody counts circles', async () => {
	renderLog()

	expect(await screen.findByText('0 of 5 logged')).toBeInTheDocument()
	await userEvent.click(screen.getByLabelText('Log set 1 of Squat'))
	await userEvent.click(screen.getByLabelText('Log set 2 of Squat'))

	expect(await screen.findByText('2 of 5 logged')).toBeInTheDocument()
})

test('the circles announce themselves, so the grid is operable without sight', async () => {
	renderLog()

	expect(await screen.findByLabelText('Log set 3 of Squat')).toBeInTheDocument()
	await userEvent.click(screen.getByLabelText('Log set 3 of Squat'))
	expect(
		await screen.findByLabelText('Logged set 3 of Squat'),
	).toBeInTheDocument()
})

test('only the colour transition and the press-scale animate', async () => {
	renderLog()

	const first = await screen.findByLabelText('Log set 1 of Squat')
	expect(first.className).toContain(
		'[transition:background-color_120ms,border-color_120ms,color_120ms,transform_80ms]',
	)
	expect(first.className).toContain('active:scale-[0.94]')
})

test('a circle stays tappable while the rest timer runs, because the timer never blocks a set', async () => {
	const { submitted } = renderLog()

	await userEvent.click(await screen.findByLabelText('Log set 1 of Squat'))
	// The bar is up…
	expect(await screen.findByText('3:00')).toBeInTheDocument()
	// …and the next set still goes in.
	await userEvent.click(screen.getByLabelText('Log set 2 of Squat'))
	expect(screen.getByLabelText('Logged set 2 of Squat')).toBeEnabled()
	expect(submitted).toHaveBeenLastCalledWith(
		expect.objectContaining({ orderIndex: '1', reps: '5' }),
	)
})

test('a made set gets the made-set rest and a short one the longer rest, and the bar says why', async () => {
	renderLog()

	await userEvent.click(await screen.findByLabelText('Log set 1 of Squat'))
	expect(
		await screen.findByText(`${REST_AFTER_MADE_SET_SEC / 60}:00`),
	).toBeInTheDocument()

	await userEvent.click(circle(1))
	expect(
		await screen.findByText(`${REST_AFTER_MISSED_SET_SEC / 60}:00`),
	).toBeInTheDocument()
	expect(screen.getByText('longer rest after a missed set')).toBeInTheDocument()
})

test('a set the server refused puts the circle back and says so, because a set that looks logged and is not is gone', async () => {
	renderLog({}, { error: 'That session is gone.' })

	await userEvent.click(await screen.findByLabelText('Log set 1 of Squat'))

	expect(await screen.findByRole('alert')).toHaveTextContent(
		'That session is gone.',
	)
	expect(screen.getByLabelText('Log set 1 of Squat')).toHaveAttribute(
		'data-state',
		'untouched',
	)
})

test('a rejected save that says nothing still tells the athlete the set did not save', async () => {
	renderLog({}, { nonsense: true })

	await userEvent.click(await screen.findByLabelText('Log set 1 of Squat'))

	expect(await screen.findByRole('alert')).toHaveTextContent(/did not save/i)
})

// ——— The weight the program resolved, and its absences ————————————————————

test('an unresolved percentage is stated as an absence with its fix, and there is nothing to tap', async () => {
	renderLog({
		exercises: [
			exercise({
				rows: [
					row({
						prescribedLoad: { kind: 'pct1RM', minPct: 85 },
						resolvedLoad: {
							kind: 'unavailable',
							reason: 'no-anchor',
							authored: { kind: 'pct1RM', minPct: 85 },
							text: 'no 1RM on file for this lift',
							fix: 'Record a 1RM for this lift.',
						},
					}),
				],
			}),
		],
	})

	expect(
		await screen.findByText(/no 1RM on file for this lift/),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Log set 1 of Squat')).toBeDisabled()
	// Never a number nobody has, and never a zero.
	expect(screen.queryByText(/0 kg/)).not.toBeInTheDocument()
})

test('a bodyweight lift posts bodyweight and invents no kilo', async () => {
	const { submitted } = renderLog({
		exercises: [
			exercise({
				loadSemanticsKind: 'bodyweight',
				rows: [
					row({ prescribedLoad: { kind: 'bodyweight' }, prescribedReps: 8 }),
				],
			}),
		],
	})

	await userEvent.click(await screen.findByLabelText('Log set 1 of Squat'))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			loadKind: 'bodyweight',
			loadNumber: '',
			reps: '8',
		}),
	)
})

test('a timed hold logs its seconds and does not count down', async () => {
	const { submitted } = renderLog({
		exercises: [
			exercise({
				loadSemanticsKind: 'unloaded',
				rows: [
					row({
						prescribedReps: null,
						prescribedDurationSec: 45,
						prescribedLoad: null,
					}),
				],
			}),
		],
	})

	await userEvent.click(await screen.findByLabelText('Log set 1 of Squat'))
	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ loadKind: 'unloaded', durationSec: '45' }),
	)

	// The next tap clears it rather than counting 45 down one second at a time.
	await userEvent.click(circle(1))
	expect(submitted).toHaveBeenLastCalledWith(
		expect.objectContaining({ intent: 'clear-set' }),
	)
})

// ——— The plate line ———————————————————————————————————————————————————————

const gym: PlateInventory = {
	bars: [{ label: 'Olympic', weightKg: 20 }],
	plates: [
		{ weightKg: 20, count: 2 },
		{ weightKg: 10, count: 2 },
		{ weightKg: 1.25, count: 1 },
	],
	fixedDumbbellsKg: null,
}

test('the plate line sits under the sets, solved against the gym, and is absent where no gym is described', async () => {
	renderLog({
		hasGymOnFile: true,
		exercises: [
			exercise({
				plateContext: {
					gymName: 'Bredvid Gym',
					variantName: null,
					inventory: gym,
					options: { kind: 'external' },
				},
			}),
		],
	})

	// The assertion goes **inside** `waitFor`: a callback that only returns a
	// `querySelector` never throws, so it resolves on the first tick — while the
	// route is still its hydrate fallback — and hands back null.
	const line = await waitFor(() => {
		const found = document.querySelector('[data-plate-line]')
		expect(found).not.toBeNull()
		return found
	})
	expect(line?.textContent).toContain('20')

	// **No gym, no plate line** — not a default rack, not an assumed bar.
	renderLog()
	await waitFor(() =>
		expect(document.querySelectorAll('[data-plate-line]')).toHaveLength(1),
	)
})

// ——— The warm-up ramp —————————————————————————————————————————————————————

test('a warm-up rung is a chip that toggles, and logs as a warm-up', async () => {
	const { submitted } = renderLog({
		exercises: [
			exercise({
				warmupRows: [
					row({
						orderIndex: 1000,
						exerciseSetId: null,
						prescribedReps: 5,
						warmupRung: {
							targetKg: 20,
							effectiveKg: 20,
							plateLine: 'empty bar',
						},
					}),
				],
			}),
		],
	})

	const chip = await screen.findByLabelText(/^Log warm-up 1 of Squat/)
	expect(chip).toHaveTextContent('20 × 5')
	await userEvent.click(chip)

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			intent: 'log-set',
			orderIndex: '1000',
			role: 'warmup',
			loadKind: 'external',
			loadNumber: '20',
			reps: '5',
		}),
	)
	// And a rung is not a working set: the counter is untouched.
	expect(screen.getByText('0 of 5 logged')).toBeInTheDocument()
})

// ——— Finishing ————————————————————————————————————————————————————————————

test('finishing the session is an explicit act, and says what you lift next time', async () => {
	renderLog(
		{ program: { instanceId: 'inst-1', name: 'StrongLifts 5×5' } },
		{
			ok: true,
			finished: {
				outcomes: [
					{
						key: 'ex-1::',
						liftName: 'Squat',
						headline: 'Squat 82.5 kg → 85 kg',
						reason: 'All 5 sets of 5 reps. StrongLifts adds 2.5 kg.',
						isNotice: false,
						label: null,
					},
				],
				programName: 'StrongLifts 5×5',
			},
		},
	)

	await userEvent.click(
		await screen.findByRole('button', { name: 'Finish workout' }),
	)

	expect(await screen.findByText('What you lift next time')).toBeInTheDocument()
	expect(screen.getByText('Squat 82.5 kg → 85 kg')).toBeInTheDocument()
})

test('finishing a warm-up-only session is refused in words', async () => {
	renderLog(
		{},
		{ error: 'Log a working set first — there is nothing to finish yet.' },
	)

	await userEvent.click(
		await screen.findByRole('button', { name: 'Finish workout' }),
	)

	expect(await screen.findByRole('alert')).toHaveTextContent(
		'Log a working set first — there is nothing to finish yet.',
	)
})

test('the caption says the sets are already saved and that Finish only marks the day', async () => {
	renderLog()

	expect(
		await screen.findByText(
			'Every set was saved as you tapped it. This only marks the day.',
		),
	).toBeInTheDocument()
})

test('a Stall Cut renders as a notice with a reason, and offers nothing', async () => {
	renderLog(
		{ program: { instanceId: 'inst-1', name: 'StrongLifts 5×5' } },
		{
			ok: true,
			finished: {
				outcomes: [
					{
						key: 'ex-1::',
						liftName: 'Squat',
						headline: 'Squat 60 kg → 54 kg',
						reason: 'You missed this lift three sessions in a row.',
						isNotice: true,
						label: 'Stall Cut',
					},
				],
				programName: 'StrongLifts 5×5',
			},
		},
	)

	await userEvent.click(
		await screen.findByRole('button', { name: 'Finish workout' }),
	)

	const notice = await waitFor(() => {
		const found = screen
			.getAllByRole('status')
			.find((el) => el.textContent?.includes('Stall Cut'))
		expect(found).toBeDefined()
		return found!
	})
	expect(notice).toHaveTextContent('Squat 60 kg → 54 kg')
	// It offers nothing.
	expect(within(notice).queryByRole('button')).not.toBeInTheDocument()
	expect(within(notice).queryByRole('link')).not.toBeInTheDocument()
	expect(within(notice).queryByRole('textbox')).not.toBeInTheDocument()
	expect(document.body.textContent).not.toMatch(/deload/i)
})

test('a session that is already recorded says so above the cards and offers no second finish', async () => {
	renderLog({ status: 'completed' })

	expect(await screen.findByText('Already recorded.')).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: 'Finish workout' }),
	).not.toBeInTheDocument()
	// The circles stay tappable: a set logged after the fact is still the truth.
	expect(screen.getByLabelText('Log set 1 of Squat')).toBeEnabled()
})

test('a session with no lifts says that instead of drawing an empty grid', async () => {
	renderLog({ exercises: [] })

	expect(
		await screen.findByText('This session has no lifts to log.'),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: 'Finish workout' }),
	).not.toBeInTheDocument()
})

// ——— The explanations, one tap behind the name ————————————————————————————

test("a lift's history is one tap behind its name, so a session logged outside a program still leads there", async () => {
	renderLog()

	await userEvent.click(await screen.findByLabelText('About Squat'))

	expect(
		await screen.findByRole('link', { name: 'This lift over time' }),
	).toHaveAttribute('href', '/training/exercises/ex-1')
})

test('a step naming no catalogued exercise offers no history link, because there is none to open', async () => {
	renderLog({ exercises: [exercise({ exerciseId: null })] })

	await userEvent.click(await screen.findByLabelText('About Squat'))

	expect(
		screen.queryByRole('link', { name: 'This lift over time' }),
	).not.toBeInTheDocument()
})

test('with no gym on file the notes link to the place the athlete describes one', async () => {
	renderLog()

	await userEvent.click(await screen.findByLabelText('About Squat'))

	expect(
		await screen.findByRole('link', { name: 'Tell us what your gym has' }),
	).toHaveAttribute('href', '/settings/training/gym')
})
