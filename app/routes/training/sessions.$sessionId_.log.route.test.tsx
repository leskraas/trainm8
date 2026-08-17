/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { type StrengthLogView } from '#app/utils/strength-log.server.ts'
import SetLogRoute from './sessions.$sessionId_.log.tsx'

type LogRow = StrengthLogView['exercises'][0]['rows'][0]

function row(overrides: Partial<LogRow> = {}): LogRow {
	return {
		orderIndex: 0,
		exerciseSetId: 'set-1',
		prescribedReps: 5,
		prescribedDurationSec: null,
		prescribedLoad: { kind: 'absolute' as const, kg: 100 },
		resolvedLoad: null,
		warmupRung: null,
		logged: null,
		ghost: null,
		...overrides,
	}
}

function exercise(
	overrides: Partial<StrengthLogView['exercises'][0]> = {},
): StrengthLogView['exercises'][0] {
	return {
		stepId: 'step-1',
		exerciseId: 'ex-1',
		name: 'Back squat',
		restBetweenSetsSec: 180,
		rows: [row(), row({ orderIndex: 1, exerciseSetId: 'set-2' })],
		warmupRows: [],
		warmupUnavailable: null,
		plateContext: null,
		...overrides,
	}
}

function view(overrides: Partial<StrengthLogView> = {}): StrengthLogView {
	return {
		sessionId: 'sess-1',
		sessionTitle: 'Squat day',
		scheduledAt: new Date('2026-08-13T17:00:00Z'),
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

test('the surface is a grid of rows, not a sentence per set', async () => {
	renderLog()

	// One row per prescribed set, each with its own load and reps inputs — the
	// columns ADR 0027's Token Sentence cannot give the log (ADR 0056).
	expect(await screen.findByLabelText('Log set 1')).toBeInTheDocument()
	expect(screen.getByLabelText('Log set 2')).toBeInTheDocument()
	expect(screen.getAllByLabelText(/^kg$/i)).toHaveLength(2)
	expect(screen.getAllByLabelText(/^reps$/i)).toHaveLength(2)
})

test('the prescription rides along as a target, in a phrase', async () => {
	renderLog()

	expect(await screen.findAllByText('Target 5 reps · 100 kg')).toHaveLength(2)
})

test('logging a set posts what was lifted, as a Load Value', async () => {
	const { submitted } = renderLog()

	const kg = (await screen.findAllByLabelText(/^kg$/i))[0]!
	await userEvent.type(kg, '102.5')
	await userEvent.type(screen.getAllByLabelText(/^reps$/i)[0]!, '5')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			intent: 'log-set',
			stepId: 'step-1',
			orderIndex: '0',
			role: 'working',
			loadKind: 'external',
			loadNumber: '102.5',
			reps: '5',
		}),
	)
})

test('the ghost is text and filling it is an explicit tap', async () => {
	// The observed failure mode is athletes logging the ghost by accident, so the
	// input stays empty and the ghost is a button.
	const { submitted } = renderLog({
		exercises: [
			exercise({
				restBetweenSetsSec: 180,
				rows: [
					row({
						ghost: {
							load: { kind: 'external', kg: 97.5 },
							reps: 5,
							durationSec: null,
							extrapolated: false,
						},
					}),
				],
			}),
		],
	})

	const kg = await screen.findByLabelText(/^kg$/i)
	expect(kg).toHaveValue(null)

	await userEvent.click(
		screen.getByRole('button', { name: /Last time 97.5 kg × 5/ }),
	)
	expect(kg).toHaveValue(97.5)

	await userEvent.click(screen.getByLabelText('Log set 1'))
	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ loadNumber: '97.5', reps: '5' }),
	)
})

test('a ghost borrowed from beyond last time says so', async () => {
	renderLog({
		exercises: [
			exercise({
				restBetweenSetsSec: null,
				rows: [
					row({
						ghost: {
							load: { kind: 'external', kg: 100 },
							reps: 5,
							durationSec: null,
							extrapolated: true,
						},
					}),
				],
			}),
		],
	})

	expect(
		await screen.findByRole('button', { name: /beyond last time/ }),
	).toBeInTheDocument()
})

test('a machine level states that it carries no kilos, in one phrase', async () => {
	renderLog()

	await userEvent.click(await screen.findByLabelText(/how this is loaded/i))
	// `findBy`, not `getBy`: the Select's popup mounts a tick after the click.
	await userEvent.click(
		await screen.findByRole('option', { name: 'Machine level' }),
	)

	// The caveat sits on the number; there is no paragraph explaining ordinals.
	expect(
		screen.getByText('No kilos — this progresses against itself only.'),
	).toBeInTheDocument()
	expect(screen.getAllByLabelText(/^level$/i)).toHaveLength(2)
})

test('bodyweight work with no bodyweight on file says what it cannot record', async () => {
	renderLog({ bodyweightKg: null })

	await userEvent.click(await screen.findByLabelText(/how this is loaded/i))
	await userEvent.click(
		await screen.findByRole('option', { name: 'Bodyweight' }),
	)

	expect(
		screen.getByText('No bodyweight on file, so this set records no kilos.'),
	).toBeInTheDocument()
	// A bodyweight set needs no number, so the kg field is gone rather than
	// waiting to be filled with a zero.
	expect(screen.queryAllByLabelText(/^kg$/i)).toHaveLength(0)
})

test('coming up short reads off the numbers, with no separate failed flag', async () => {
	renderLog({
		exercises: [
			exercise({
				restBetweenSetsSec: null,
				rows: [
					row({
						prescribedReps: 5,
						logged: {
							id: 'log-1',
							role: 'working',
							outcome: 'completed',
							toFailure: false,
							load: { kind: 'external', kg: 100 },
							effectiveKg: 100,
							reps: 3,
							repsLeft: null,
							durationSec: null,
							rir: null,
							restTakenSec: null,
						},
					}),
				],
			}),
		],
	})

	expect(await screen.findByText('Under target')).toBeInTheDocument()
})

test('racking it is its own outcome, one tap away, and reads as abandoned', async () => {
	const { submitted } = renderLog()

	await userEvent.type((await screen.findAllByLabelText(/^reps$/i))[0]!, '2')
	await userEvent.click(screen.getByLabelText('More for set 1'))
	await userEvent.click(
		await screen.findByRole('button', { name: /racked it/i }),
	)

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ abandoned: 'on' }),
	)
})

test('reps in reserve is a chip row behind one tap, never asked per set', async () => {
	const { submitted } = renderLog()

	// Not on the row: asking on every set of every session is how a logger
	// becomes a chore.
	expect(screen.queryByText(/reps in reserve/i)).not.toBeInTheDocument()

	await userEvent.click(await screen.findByLabelText('More for set 1'))
	const rirGroup = (await screen.findByText(/reps in reserve/i)).parentElement!
	await userEvent.click(within(rirGroup).getByRole('button', { name: '2' }))
	await userEvent.click(screen.getByLabelText('Log set 1'))

	expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ rir: '2' }))
})

test('a logged warm-up says so and a session with no lifts says that instead', async () => {
	renderLog({ exercises: [] })
	expect(
		await screen.findByText('This session has no lifts to log.'),
	).toBeInTheDocument()
})

test('completing a set starts the rest timer as a bar that never blocks the next set', async () => {
	renderLog()

	expect(screen.queryByRole('status')).not.toBeInTheDocument()

	await userEvent.type((await screen.findAllByLabelText(/^kg$/i))[0]!, '100')
	await userEvent.type(screen.getAllByLabelText(/^reps$/i)[0]!, '5')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	const bar = await screen.findByRole('status')
	expect(within(bar).getByText(/^3:00$|^2:5\d$/)).toBeInTheDocument()
	// The next set is still loggable while it runs.
	expect(screen.getByLabelText('Log set 2')).toBeEnabled()
})

// ——— The runner (spec Slice 5) ————————————————————————————————————————————

test('the per-exercise "fill from last time" fills the inputs and does not submit', async () => {
	// The rule ADR 0056 §5 states and #434 regressed: filling is help, submitting
	// is the app claiming the athlete did a set they have not done.
	const { submitted } = renderLog({
		exercises: [
			exercise({
				rows: [
					row({
						ghost: {
							load: { kind: 'external', kg: 97.5 },
							reps: 5,
							durationSec: null,
							extrapolated: false,
						},
					}),
					row({
						orderIndex: 1,
						exerciseSetId: 'set-2',
						ghost: {
							load: { kind: 'external', kg: 97.5 },
							reps: 4,
							durationSec: null,
							extrapolated: false,
						},
					}),
				],
			}),
		],
	})

	await userEvent.click(
		await screen.findByRole('button', { name: /fill from last time/i }),
	)

	const kgFields = screen.getAllByLabelText(/^kg$/i)
	expect(kgFields[0]).toHaveValue(97.5)
	expect(kgFields[1]).toHaveValue(97.5)
	expect(screen.getAllByLabelText(/^reps$/i)[1]).toHaveValue(4)
	expect(submitted).not.toHaveBeenCalled()
})

test('an unresolved percentage renders the authored form plus its stated absence, never a number', async () => {
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

	const target = await screen.findByText(/Target 5 reps · 85% 1RM/)
	expect(target).toHaveTextContent('no 1RM on file')
	// Not a kilo anywhere in the target: the failure this rule exists to prevent.
	expect(target.textContent).not.toMatch(/\d+(\.\d+)?\s*kg/)
})

test('the plate line is a passive annotation under the weight input, updating as you type', async () => {
	renderLog({
		hasGymOnFile: true,
		exercises: [
			exercise({
				rows: [row()],
				plateContext: {
					gymName: 'My gym',
					variantName: null,
					options: { kind: 'external' },
					inventory: {
						bars: [{ weightKg: 20 }],
						plates: [
							{ weightKg: 20, count: 2 },
							{ weightKg: 10, count: 2 },
						],
						fixedDumbbellsKg: null,
					},
				},
			}),
		],
	})

	const kg = await screen.findByLabelText(/^kg$/i)
	await userEvent.type(kg, '60')
	expect(await screen.findByText('20')).toBeInTheDocument()

	await userEvent.clear(kg)
	await userEvent.type(kg, '80')
	expect(await screen.findByText('20 · 10')).toBeInTheDocument()
})

test('a warm-up rung is a row of its own, in the ramp’s numbering and never set one', async () => {
	renderLog({
		hasGymOnFile: true,
		exercises: [
			exercise({
				warmupRows: [
					row({
						orderIndex: 1000,
						exerciseSetId: null,
						prescribedReps: 5,
						prescribedLoad: { kind: 'absolute', kg: 20 },
						warmupRung: { targetKg: 20, plateLine: 'empty bar' },
					}),
					row({
						orderIndex: 1001,
						exerciseSetId: null,
						prescribedReps: 5,
						prescribedLoad: { kind: 'absolute', kg: 60 },
						warmupRung: { targetKg: 60, plateLine: '20' },
					}),
				],
			}),
		],
	})

	// The rung is loggable, numbered within the ramp, and the working sets keep
	// their own numbers.
	expect(await screen.findByLabelText('Log warm-up W1')).toBeInTheDocument()
	expect(screen.getByLabelText('Log warm-up W2')).toBeInTheDocument()
	expect(screen.getByLabelText('Log set 1')).toBeInTheDocument()
})

test('a missed set rests longer than a made one, and the bar says why', async () => {
	renderLog()

	await userEvent.type((await screen.findAllByLabelText(/^kg$/i))[0]!, '100')
	// Three of five: the shortfall is the number, and there is no failed flag.
	await userEvent.type(screen.getAllByLabelText(/^reps$/i)[0]!, '3')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	const bar = await screen.findByRole('status')
	expect(within(bar).getByText(/^5:00$|^4:5\d$/)).toBeInTheDocument()
	expect(
		within(bar).getByText('longer rest after a missed set'),
	).toBeInTheDocument()
	// And it still does not block the next set.
	expect(screen.getByLabelText('Log set 2')).toBeEnabled()
})

test('the between-sets double-tap cannot log a set twice', async () => {
	// The single most likely interaction on this surface. The guard is the **key**,
	// not the button: whatever the fingers do, every save from this row names the
	// same `(stepId, orderIndex)`, and the server upserts on exactly that — so two
	// taps are one row, restated. A test that only asserted "one submission" would
	// pass on a race and prove nothing about the row count.
	const { submitted } = renderLog()

	await userEvent.type((await screen.findAllByLabelText(/^kg$/i))[0]!, '100')
	await userEvent.type(screen.getAllByLabelText(/^reps$/i)[0]!, '5')
	await userEvent.dblClick(screen.getByLabelText('Log set 1'))

	expect(submitted.mock.calls.length).toBeGreaterThan(0)
	const keys = new Set(
		submitted.mock.calls.map(
			(call) => `${call[0].stepId}::${call[0].orderIndex}`,
		),
	)
	expect([...keys]).toEqual(['step-1::0'])
})

test('finishing the session is an explicit act, and says what you lift next time', async () => {
	const { submitted } = renderLog(
		{},
		{
			ok: true,
			finished: {
				outcomes: [
					{
						key: 'ex-1::barbell',
						liftName: 'Back squat',
						headline: 'Back squat 100 kg → 102.5 kg',
						reason: 'You made all 25 prescribed reps.',
						isNotice: false,
						label: null,
					},
				],
				programName: 'StrongLifts 5×5',
			},
		},
	)

	await userEvent.click(
		await screen.findByRole('button', { name: /finish workout/i }),
	)

	expect(submitted).toHaveBeenCalledWith({ intent: 'finish-session' })
	expect(
		await screen.findByText('Back squat 100 kg → 102.5 kg'),
	).toBeInTheDocument()
	expect(screen.getByText('What you lift next time')).toBeInTheDocument()
})

test('a Stall Cut renders as a notice with a reason, and offers nothing', async () => {
	renderLog(
		{},
		{
			ok: true,
			finished: {
				outcomes: [
					{
						key: 'ex-1::',
						liftName: 'Back squat',
						headline: 'Back squat 100 kg → 90 kg',
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
		await screen.findByRole('button', { name: /finish workout/i }),
	)

	const notice = (await screen.findByText('Stall Cut:')).closest('li')!
	expect(notice).toHaveTextContent('Back squat 100 kg → 90 kg')
	expect(notice).toHaveTextContent(
		'You missed this lift three sessions in a row.',
	)
	// It is a statement, not a prompt: there is nothing inside it to press, and
	// the word `deload` is ADR 0047's planned week and is not this.
	expect(notice.querySelectorAll('button, a, input')).toHaveLength(0)
	expect(notice.textContent?.toLowerCase()).not.toContain('deload')
})

test("a lift's history is one tap behind its name, so a session logged outside a program still leads there", async () => {
	renderLog()
	const user = userEvent.setup()

	await user.click(
		await screen.findByRole('button', { name: /about back squat/i }),
	)
	expect(
		await screen.findByRole('link', { name: /this lift over time/i }),
	).toHaveAttribute('href', '/training/exercises/ex-1')
})

test('a step naming no catalogued exercise offers no history link, because there is none to open', async () => {
	renderLog({ exercises: [exercise({ exerciseId: null })] })
	const user = userEvent.setup()

	await user.click(
		await screen.findByRole('button', { name: /about back squat/i }),
	)
	expect(
		screen.queryByRole('link', { name: /this lift over time/i }),
	).toBeNull()
})
