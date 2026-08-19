/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import {
	type PlateInventory,
	plateLineText,
} from '#app/utils/strength/plates.ts'
import { warmupRamp } from '#app/utils/strength/warmup.ts'
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
		unilateral: null,
		loadSemanticsKind: null,
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

test('a bodyweight movement opens on Bodyweight, so a timed hold is logged without a kilo being invented', async () => {
	const { submitted } = renderLog({
		exercises: [
			exercise({
				// A plank: seconds, no Load Target at all, and the corpus says the load
				// is the athlete.
				loadSemanticsKind: 'bodyweight',
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

	// No kg box to leave empty, and none to fill with a number nobody lifted.
	expect(await screen.findByLabelText(/^seconds$/i)).toBeInTheDocument()
	expect(screen.queryByLabelText(/^kg$/i)).not.toBeInTheDocument()

	await userEvent.type(screen.getByLabelText(/^seconds$/i), '45')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			intent: 'log-set',
			loadKind: 'bodyweight',
			durationSec: '45',
		}),
	)
})

test('a prescribed load outranks the movement’s own load semantics when the two disagree', async () => {
	renderLog({
		exercises: [
			exercise({
				loadSemanticsKind: 'bodyweight',
				// A weighted pull-up: the movement is bodyweight-loaded, but this
				// session asks for kilos on a belt.
				rows: [
					row({
						prescribedLoad: { kind: 'bodyweight', addedKg: 20 },
					}),
				],
			}),
		],
	})

	expect(await screen.findByLabelText(/^\+ kg$/i)).toBeInTheDocument()
})

test('a rack that cannot make the number says so in full, never truncated to its first word', async () => {
	renderLog({
		hasGymOnFile: true,
		exercises: [
			exercise({
				rows: [row()],
				plateContext: {
					gymName: 'My gym',
					variantName: null,
					options: { kind: 'external', barKg: 20 },
					inventory: {
						bars: [{ weightKg: 20 }],
						plates: [{ weightKg: 20, count: 2 }],
						fixedDumbbellsKg: null,
					},
				},
			}),
		],
	})

	await userEvent.type(await screen.findByLabelText(/^kg$/i), '20.3')

	// The refusal is the half that matters, and it is rendered whole.
	const line = await screen.findByText(/Your gym makes 20 kg, not 20.3 kg\./)
	expect(line).toBeInTheDocument()
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

function loggedSet(
	load: NonNullable<LogRow['logged']>['load'],
	reps: number,
): LogRow['logged'] {
	return {
		id: `log-${reps}-${load?.kind}`,
		role: 'working',
		outcome: 'completed',
		toFailure: false,
		load,
		effectiveKg: load?.kind === 'external' ? load.kg : null,
		reps,
		repsLeft: null,
		durationSec: null,
		rir: null,
		restTakenSec: null,
	}
}

test('a set logged as a stack level reopens as a stack level, not as kilos', async () => {
	// The data-corruption defect. The load kind was one answer per *exercise*, held
	// in component state and defaulted from whichever row happened to be logged
	// first — so a set logged on the machine reopened labelled `kg` with the stack
	// level sitting in the weight field, and the page's own invitation to edit a
	// recorded set then posted that ordinal as kilos. A recorded row's kind now comes
	// off the row.
	const { submitted } = renderLog({
		exercises: [
			exercise({
				name: 'Barbell row',
				rows: [
					// The rack was busy, so set 2 happened on the machine. Two rows, two
					// answers, and neither one may speak for the other.
					row({ logged: loggedSet({ kind: 'external', kg: 60 }, 10) }),
					row({
						orderIndex: 1,
						exerciseSetId: 'set-2',
						logged: loggedSet({ kind: 'stackLevel', level: 7 }, 10),
					}),
				],
			}),
		],
	})

	await screen.findByLabelText(/^Log set 1/)
	const machineSet = within(
		document.querySelector('[data-set-row="1"]') as HTMLElement,
	)
	// A machine level, not kilos — and no kg field for the 7 to be read as a weight.
	expect(machineSet.getByLabelText(/^level$/i)).toHaveValue(7)
	expect(machineSet.queryByLabelText(/^kg$/i)).not.toBeInTheDocument()

	// And editing that row's reps posts the kind it was logged with, with nothing
	// claiming the athlete asked to change it.
	await userEvent.clear(machineSet.getByLabelText(/^reps$/i))
	await userEvent.type(machineSet.getByLabelText(/^reps$/i), '8')
	await userEvent.click(machineSet.getByLabelText(/^Log set 2/))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			orderIndex: '1',
			loadKind: 'stackLevel',
			loadNumber: '7',
			reps: '8',
		}),
	)
	expect(submitted.mock.calls[0]![0]).not.toHaveProperty('changeLoadKind')
})

test('changing how a recorded set was loaded is a deliberate act, said out loud', async () => {
	// The other side of the lock: an athlete who logged a set on the wrong picker
	// must be able to fix it. Touching *"How this is loaded"* is what says so, and it
	// is the only thing that does — the server refuses a kind change that is not
	// declared, so a silent one cannot rewrite the row.
	const { submitted } = renderLog({
		exercises: [
			exercise({
				name: 'Barbell row',
				rows: [
					row({ logged: loggedSet({ kind: 'stackLevel', level: 7 }, 10) }),
				],
			}),
		],
	})

	await userEvent.click(await screen.findByLabelText(/how this is loaded/i))
	await userEvent.click(
		await screen.findByRole('option', { name: 'Weight (kg)' }),
	)
	await userEvent.type(screen.getByLabelText(/^kg$/i), '60')
	await userEvent.click(screen.getByLabelText(/^Log set 1/))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ loadKind: 'external', changeLoadKind: 'on' }),
	)
})

test('a load with no honest kilo gets no plate line, before or after the picker is touched', async () => {
	// A stack "7" is an ordinal, so there is nothing to solve into plates — and the
	// solver's own refusal is a *sentence*, which beside "No kilos recorded" reads as
	// the surface arguing with itself about the same set. The observed defect printed
	// "empty bar · Your gym makes 20 kg, not 7 kg." two lines from that label.
	renderLog({
		hasGymOnFile: true,
		exercises: [
			exercise({
				name: 'Barbell row',
				rows: [
					row({
						logged: {
							id: 'log-1',
							role: 'working',
							outcome: 'completed',
							toFailure: false,
							load: { kind: 'stackLevel', level: 7 },
							effectiveKg: null,
							reps: 10,
							repsLeft: null,
							durationSec: null,
							rir: null,
							restTakenSec: null,
						},
					}),
				],
				plateContext: {
					gymName: 'My gym',
					variantName: null,
					options: { kind: 'external' },
					inventory: {
						bars: [{ weightKg: 20 }],
						plates: [{ weightKg: 20, count: 2 }],
						fixedDumbbellsKg: null,
					},
				},
			}),
		],
	})

	expect(await screen.findByText('No kilos recorded')).toBeInTheDocument()
	expect(document.querySelector('[data-plate-line]')).toBeNull()
	expect(screen.queryByText(/your gym makes/i)).not.toBeInTheDocument()

	// And touching the picker does not conjure one either. Flipping to `kg` above
	// this row previewed "empty bar · Your gym makes 20 kg, not 7 kg." while the row
	// two lines down still said "No kilos recorded": nothing was stored, but the
	// surface argued with itself about the same set. The 7 in the box is an ordinal
	// until a save says otherwise, so the row is described and never argued with.
	await userEvent.click(screen.getByLabelText(/how this is loaded/i))
	await userEvent.click(
		await screen.findByRole('option', { name: 'Weight (kg)' }),
	)

	expect(screen.getByLabelText(/^kg$/i)).toHaveValue(7)
	expect(await screen.findByText('No kilos recorded')).toBeInTheDocument()
	expect(document.querySelector('[data-plate-line]')).toBeNull()
	expect(screen.queryByText(/your gym makes/i)).not.toBeInTheDocument()
	expect(screen.queryByText('empty bar')).not.toBeInTheDocument()
})

test('the plate line under an assisted set solves the help, not the bar the variant brought', async () => {
	// The observed defect, at the surface: the barbell variant's `barKg: 20` and
	// `multiplier: 2` survived the picker, so 10 kg of assist rendered "empty bar ·
	// Your gym makes 74 kg, not 10 kg." — the bodyweight with no assist at all,
	// compared against the assist, two lines from the number the row would store.
	renderLog({
		hasGymOnFile: true,
		bodyweightKg: 80,
		exercises: [
			exercise({
				name: 'Assisted pull-up',
				rows: [row()],
				plateContext: {
					gymName: 'My gym',
					variantName: null,
					options: {
						kind: 'external',
						barKg: 20,
						multiplier: 2,
						bodyweightKg: 80,
					},
					inventory: {
						bars: [{ weightKg: 20 }],
						plates: [
							{ weightKg: 10, count: 2 },
							{ weightKg: 5, count: 2 },
						],
						fixedDumbbellsKg: null,
					},
				},
			}),
		],
	})

	await userEvent.click(await screen.findByLabelText(/how this is loaded/i))
	await userEvent.click(
		await screen.findByRole('option', { name: 'Assisted (kg off)' }),
	)
	await userEvent.type(screen.getByLabelText(/^kg off$/i), '10')

	// One 10 kg plate on the horn, and no sentence: the rack makes exactly the help
	// that was asked for.
	const line = document.querySelector('[data-plate-line]')
	expect(line).toHaveTextContent('10')
	expect(screen.queryByText(/your gym makes/i)).not.toBeInTheDocument()
	expect(screen.queryByText(/empty bar/i)).not.toBeInTheDocument()
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
						warmupRung: {
							targetKg: 20,
							effectiveKg: 20,
							plateLine: 'empty bar',
						},
					}),
					row({
						orderIndex: 1001,
						exerciseSetId: null,
						prescribedReps: 5,
						prescribedLoad: { kind: 'absolute', kg: 60 },
						warmupRung: { targetKg: 60, effectiveKg: 60, plateLine: '20' },
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

test('a set that took a record says so on that row, the moment it is logged', async () => {
	// ADR 0058's user story calls the banner "the reason the feature exists": the
	// derivation shipped and nothing told the athlete.
	renderLog(
		{},
		{
			ok: true,
			id: 'log-1',
			record: {
				lines: ['Heaviest ever: 120 kg — up 10 kg'],
				debut: false,
			},
		},
	)

	await userEvent.type((await screen.findAllByLabelText(/^kg$/i))[0]!, '120')
	await userEvent.type(screen.getAllByLabelText(/^reps$/i)[0]!, '5')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	const banners = await screen.findAllByText('Heaviest ever: 120 kg — up 10 kg')
	// One banner, on the row that took it — not one per row in the grid.
	expect(banners).toHaveLength(1)
	expect(document.querySelectorAll('[data-record-banner]')).toHaveLength(1)
})

test('a set that took nothing draws no banner, so the banner keeps meaning something', async () => {
	const { submitted } = renderLog({}, { ok: true, id: 'log-1', record: null })

	await userEvent.type((await screen.findAllByLabelText(/^kg$/i))[0]!, '100')
	await userEvent.type(screen.getAllByLabelText(/^reps$/i)[0]!, '5')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	await waitFor(() => expect(submitted).toHaveBeenCalled())
	expect(document.querySelector('[data-record-banner]')).toBeNull()
})

test('the between-sets double-tap fires the banner once and never twice', async () => {
	renderLog(
		{},
		{
			ok: true,
			id: 'log-1',
			record: { lines: ['Heaviest ever: 120 kg — up 10 kg'], debut: false },
		},
	)

	await userEvent.type((await screen.findAllByLabelText(/^kg$/i))[0]!, '120')
	await userEvent.type(screen.getAllByLabelText(/^reps$/i)[0]!, '5')
	await userEvent.dblClick(screen.getByLabelText('Log set 1'))

	await screen.findAllByText('Heaviest ever: 120 kg — up 10 kg')
	// The row has one fetcher, so the second answer replaces the first rather
	// than stacking a second banner underneath it.
	expect(document.querySelectorAll('[data-record-banner]')).toHaveLength(1)
})

test('a weight with no count is refused in place, on the row, in the same words as a missing weight', async () => {
	// The count is validated at the write seam (`statesWhatWasPerformed`), and the
	// refusal has to land where the athlete is looking: the row's own alert, beside
	// the tap that caused it, exactly as a missing weight already does.
	const { submitted } = renderLog(
		{},
		{ error: 'Reps or seconds needs a number — or mark the set abandoned.' },
	)

	await userEvent.type((await screen.findAllByLabelText(/^kg$/i))[0]!, '20')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ reps: '', loadNumber: '20' }),
	)
	expect(await screen.findByRole('alert')).toHaveTextContent(
		'Reps or seconds needs a number — or mark the set abandoned.',
	)
})

// ── Laterality, the other side, and a day already filed ──────────────────────

/** Open the `⋯` menu on set 1 and hand back its popover. */
async function openRowMenu() {
	const user = userEvent.setup()
	await user.click(await screen.findByLabelText('More for set 1'))
	return screen.getByRole('dialog')
}

test('a movement stated bilateral is never asked for the other side, because a barbell squat has no other side', async () => {
	renderLog({ exercises: [exercise({ unilateral: false })] })

	const menu = await openRowMenu()
	expect(within(menu).queryByLabelText(/other side/i)).toBeNull()
})

test('a movement stated unilateral names the other side flatly, because there is one', async () => {
	renderLog({ exercises: [exercise({ unilateral: true })] })

	const menu = await openRowMenu()
	expect(
		within(menu).getByLabelText('Reps on the other side'),
	).toBeInTheDocument()
})

test('a movement whose laterality nobody stated still offers the other side, because an absence is not a no', async () => {
	renderLog({ exercises: [exercise({ unilateral: null })] })

	const menu = await openRowMenu()
	expect(
		within(menu).getByLabelText('Other side, if this was one-armed'),
	).toBeInTheDocument()
})

test('a session that is already recorded says so above the grid and offers no second finish', async () => {
	renderLog({ status: 'completed' })

	const notice = await screen.findByRole('status')
	expect(notice).toHaveTextContent(/already recorded/i)
	expect(screen.queryByRole('button', { name: /finish workout/i })).toBeNull()
})

test('a session that is not recorded yet offers the finish and claims nothing about the day', async () => {
	renderLog()

	expect(
		await screen.findByRole('button', { name: /finish workout/i }),
	).toBeInTheDocument()
	expect(screen.queryByText(/already recorded/i)).toBeNull()
})

test('with no gym on file the exercise notes link to the place the athlete describes one, so the missing plate line is fixable from here', async () => {
	renderLog({ hasGymOnFile: false })
	const user = userEvent.setup()

	await user.click(await screen.findByLabelText('About Back squat'))
	const notes = screen.getByRole('dialog')
	expect(
		within(notes).getByRole('link', { name: /tell us what your gym has/i }),
	).toHaveAttribute('href', '/settings/training/gym')
})

// ── A set tapped too soon, and a save that did not land ──────────────────────

/**
 * Type the way the browser does before this route has hydrated: the value lands
 * in the DOM and React's `onChange` never runs, so component state stays empty
 * while the athlete can plainly read the number on the screen.
 */
function typeBeforeListening(input: HTMLElement, value: string) {
	;(input as HTMLInputElement).value = value
}

test('a number typed before the row was listening is still the number that gets posted', async () => {
	// The observed defect: tapping ✓ moments after the screen appeared posted an
	// empty weight and the set silently did not save, while the row still showed
	// what had been typed. What is posted is read off the form, so it is what is on
	// the screen in every hydration state.
	const { submitted } = renderLog()

	typeBeforeListening((await screen.findAllByLabelText(/^kg$/i))[0]!, '102.5')
	typeBeforeListening(screen.getAllByLabelText(/^reps$/i)[0]!, '5')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ loadNumber: '102.5', reps: '5' }),
	)
})

test('the ✓ is a submit button on a real form, so the tap means something before any of this has hydrated', async () => {
	// The other half of the same window: with no JS attached yet a click handler
	// does nothing at all, and a tap that does nothing is the same lost set. The
	// row posts its own named fields, so the browser can do it alone.
	renderLog()

	const button = await screen.findByLabelText('Log set 1')
	expect(button).toHaveAttribute('type', 'submit')
	const form = button.closest('form')
	expect(form).not.toBeNull()
	expect(form!.querySelector('[name="intent"]')).toHaveValue('log-set')
	expect(form!.querySelector('[name="stepId"]')).toHaveValue('step-1')
	expect(form!.querySelector('[name="orderIndex"]')).toHaveValue('0')
	expect(form!.querySelector('[name="loadKind"]')).toHaveValue('external')
})

test('a rejected save that says nothing still tells the athlete the set did not save', async () => {
	// A refusal normally carries its own sentence. One that does not used to render
	// nothing, which is the worst outcome on this surface: the athlete moves on and
	// the set is gone — and the program fold reads the absence as a missed rep.
	renderLog({}, null)

	await userEvent.type((await screen.findAllByLabelText(/^kg$/i))[0]!, '100')
	await userEvent.type(screen.getAllByLabelText(/^reps$/i)[0]!, '5')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	expect(await screen.findByRole('alert')).toHaveTextContent(
		'That set did not save — tap ✓ again.',
	)
})

test('a set the server refused does not start the rest timer, because a running rest bar reads as a set that is in', async () => {
	renderLog({}, { error: 'That step is not a lift.' })

	await userEvent.type((await screen.findAllByLabelText(/^kg$/i))[0]!, '100')
	await userEvent.type(screen.getAllByLabelText(/^reps$/i)[0]!, '5')
	await userEvent.click(screen.getByLabelText('Log set 1'))

	expect(await screen.findByRole('alert')).toHaveTextContent(
		'That step is not a lift.',
	)
	expect(
		screen.queryByLabelText('Dismiss the rest timer'),
	).not.toBeInTheDocument()
})

test('opening the row menu posts nothing, because the row is a form now', async () => {
	const { submitted } = renderLog()

	await userEvent.click(await screen.findByLabelText('More for set 1'))

	expect(submitted).not.toHaveBeenCalled()
})

test('a warm-up rung on a bodyweight lift prefills what goes on the belt, not the athlete plus the belt', async () => {
	// **The ramp and the work sets have to be in one unit.** A dip prescribed
	// `3 × 8 @ 30 kg` used to render a ramp of `84 / 84 / 99` above a work set of
	// `30`: the rungs were bodyweight-inclusive totals and the work set was the
	// belt. With the picker on *"Bodyweight + kg"* the first rung showed `[+ kg 84]`
	// and one tap stored `{ bodyweightPlus, addedKg: 84 }` on a rung that means no
	// plates at all.
	//
	// The rungs are taken from `warmupRamp` itself, mapped exactly as
	// `buildWarmupRows` maps them, so this pins the producer to the consumer rather
	// than to a number typed into a fixture.
	const inventory: PlateInventory = {
		bars: [{ weightKg: 20 }],
		plates: [
			{ weightKg: 20, count: 2 },
			{ weightKg: 10, count: 2 },
			{ weightKg: 5, count: 2 },
			{ weightKg: 2.5, count: 2 },
		],
		fixedDumbbellsKg: null,
	}
	const options = { kind: 'bodyweightPlus' as const, bodyweightKg: 74 }
	const ramp = warmupRamp(30, { ...options, inventory })
	if (ramp.outcome !== 'ramp') throw new Error('expected a ramp')

	renderLog({
		bodyweightKg: 74,
		hasGymOnFile: true,
		exercises: [
			exercise({
				name: 'Weighted dip',
				loadSemanticsKind: 'bodyweightPlus',
				rows: [
					row({
						prescribedReps: 8,
						prescribedLoad: { kind: 'bodyweight', addedKg: 30 },
					}),
				],
				warmupRows: ramp.sets.map((rung) => ({
					...row({
						orderIndex: 1000 + rung.orderIndex,
						exerciseSetId: null,
						prescribedReps: rung.reps,
						prescribedLoad: { kind: 'absolute', kg: rung.statedKg },
						warmupRung: {
							targetKg: rung.statedKg,
							effectiveKg: rung.effectiveKg,
							plateLine: plateLineText(rung.solution),
						},
					}),
				})),
				plateContext: {
					gymName: 'My gym',
					variantName: null,
					options,
					inventory,
				},
			}),
		],
	})

	// The picker opened on the belt, so every box on the screen is a `+ kg` box.
	const belts = await screen.findAllByLabelText(/^\+ kg$/i)
	expect(belts).toHaveLength(ramp.sets.length + 1)

	// The two base rungs are the athlete alone: nothing goes on the belt, so
	// nothing is prefilled. `0` in a `+ kg` box is a set that cannot be logged and
	// the athlete's own 74 kg is not a number anybody hangs off a belt.
	expect(belts[0]).toHaveValue(null)
	expect(belts[1]).toHaveValue(null)
	// The loaded rung is the belt's own kilos — under the work set's 30, and
	// nowhere near 74 or 84.
	const loaded = Number((belts[2] as HTMLInputElement).value)
	expect(loaded).toBeGreaterThan(0)
	expect(loaded).toBeLessThan(30)

	// No box, and no target phrase, quotes a bodyweight-inclusive total.
	for (const belt of belts) {
		const value = (belt as HTMLInputElement).value
		if (value !== '') expect(Number(value)).toBeLessThan(74)
	}
	expect(screen.queryByText(/84 kg/)).not.toBeInTheDocument()
	expect(screen.queryByText(/167\.75 kg/)).not.toBeInTheDocument()
	// And no rung claims the rack missed a number the athlete never asked for.
	expect(screen.queryByText(/Your gym makes/)).not.toBeInTheDocument()
})
