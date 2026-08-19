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
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { type PlateInventory } from '#app/utils/strength/plates.ts'
import {
	REST_ADJUST_STEP_SEC,
	REST_AFTER_MADE_SET_SEC,
	REST_AFTER_MISSED_SET_SEC,
	REST_BEFORE_LAST_WARMUP_SEC,
} from '#app/utils/strength/rest.ts'
import { type StrengthLogView } from '#app/utils/strength-log.server.ts'
import { REST_TICK_MS } from './__rest-bar.tsx'
import { type LiftProgress } from './__runner-presenter.ts'
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
	/** Where each lift of the run stands, which is what the help panel says the
	 * weight in — empty outside a program. */
	liftProgress: LiftProgress[] = [],
) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/sessions/:sessionId/log',
			Component: (props: Record<string, unknown>) => (
				<SetLogRoute {...(props as any)} />
			),
			loader: () => ({ ...view(overrides), liftProgress }),
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

/** A three-rung ramp: two empty-bar fives, then the rungs up to the work weight. */
function rungs(): LogRow[] {
	return [
		{ orderIndex: 1000, kg: 20, reps: 5 },
		{ orderIndex: 1001, kg: 40, reps: 5 },
		{ orderIndex: 1002, kg: 60, reps: 3 },
	].map((rung) =>
		row({
			orderIndex: rung.orderIndex,
			exerciseSetId: null,
			prescribedReps: rung.reps,
			warmupRung: { targetKg: rung.kg, effectiveKg: rung.kg, plateLine: '' },
		}),
	)
}

/** The chip for rung `n` of the default lift, ticked or not. */
function chip(n: number) {
	return screen.getByLabelText(new RegExp(`^Log(ged)? warm-up ${n} of Squat,`))
}

function chipLabels() {
	return [...document.querySelectorAll('[data-warmup-chip]')].map(
		(node) => node.textContent,
	)
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

test('the ramp wraps as chips that toggle independently, and a tick survives a re-render', async () => {
	frozenClock()
	renderLog({ exercises: [exercise({ warmupRows: rungs() })] })
	await settle()

	// Every rung of the shipped ramp is on screen, each carrying its own weight
	// and reps — the ladder read at arm's length rather than a table.
	expect(chipLabels()).toEqual(['20 × 5', '40 × 5', '60 × 3'])
	// The chips **wrap** rather than scroll: five rungs on a 390px screen are two
	// rows, and a hidden rung is a rung nobody walks up.
	expect(chip(1).parentElement?.className).toContain('flex-wrap')
	// 44px minimum, like every other control on this screen — the one metric here
	// that is about a hand rather than about taste.
	expect(chip(1)).toHaveClass('min-h-11')

	await tap(chip(1))
	await settle()
	expect(chip(1)).toHaveAttribute('aria-pressed', 'true')
	// **Independently**: one rung ticked says nothing about its neighbours.
	expect(chip(2)).toHaveAttribute('aria-pressed', 'false')
	expect(chip(3)).toHaveAttribute('aria-pressed', 'false')

	await tap(chip(3))
	await settle()
	// The rest bar's own tick re-renders the whole runner half a second later,
	// and the rungs already ticked are still ticked.
	await clockAt(TAPPED_AT + 30_000)
	expect(chip(1)).toHaveAttribute('aria-pressed', 'true')
	expect(chip(2)).toHaveAttribute('aria-pressed', 'false')
	expect(chip(3)).toHaveAttribute('aria-pressed', 'true')
})

test('ticking the last rung starts the pause before working weight, and the bar says why', async () => {
	frozenClock()
	renderLog({ exercises: [exercise({ warmupRows: rungs() })] })
	await settle()

	// The ramp is walked up briskly: the earlier rungs start nothing at all.
	await tap(chip(1))
	await settle()
	expect(screen.queryByTestId('rest-clock')).not.toBeInTheDocument()

	await tap(chip(3))
	await settle()

	// The duration is the rest module's, not this test's arithmetic on a literal.
	expect(restClock()).toHaveTextContent(
		`${REST_BEFORE_LAST_WARMUP_SEC / 60}:00`,
	)
	expect(
		screen.getByText('rest before your last warm-up set'),
	).toBeInTheDocument()
})

test('ticking an earlier rung clears a running rest, because the timer follows what the athlete is doing', async () => {
	frozenClock()
	renderLog({ exercises: [exercise({ warmupRows: rungs() })] })
	await settle()

	await tap(chip(3))
	await settle()
	expect(restClock()).toBeInTheDocument()

	await tap(chip(2))
	await settle()

	expect(screen.queryByTestId('rest-clock')).not.toBeInTheDocument()
	// Walking back down the ramp is still a logged rung: the pause went, the set
	// did not.
	expect(chip(2)).toHaveAttribute('aria-pressed', 'true')
})

test('un-ticking the last rung clears both the rung and its rest', async () => {
	frozenClock()
	const { submitted } = renderLog({
		exercises: [exercise({ warmupRows: rungs() })],
	})
	await settle()

	await tap(chip(3))
	await settle()
	expect(restClock()).toBeInTheDocument()

	await tap(chip(3))
	await settle()

	expect(submitted).toHaveBeenLastCalledWith(
		expect.objectContaining({ intent: 'clear-set', orderIndex: '1002' }),
	)
	expect(chip(3)).toHaveAttribute('aria-pressed', 'false')
	expect(screen.queryByTestId('rest-clock')).not.toBeInTheDocument()
})

test('where no ramp can be generated the section is absent, not empty', async () => {
	renderLog({ exercises: [exercise({ warmupRows: [] })] })

	// The working sets are there, so the card rendered — and there is no empty
	// WARM-UP heading above them.
	expect(await screen.findByText('Working sets')).toBeInTheDocument()
	expect(screen.queryByText('Warm-up')).not.toBeInTheDocument()
	expect(document.querySelector('[data-warmup-chip]')).toBeNull()
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
						exerciseId: 'ex-1',
						headline: 'Squat 82.5 kg → 85 kg',
						reason: 'All 5 sets of 5 reps. StrongLifts adds 2.5 kg.',
						isNotice: false,
						label: null,
						tone: 'progressed',
						movedToKg: null,
						provenance: null,
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
						exerciseId: 'ex-1',
						headline: 'Squat 60 kg → 54 kg',
						reason: 'You missed this lift three sessions in a row.',
						isNotice: true,
						label: 'Stall Cut',
						tone: 'cut',
						movedToKg: 54,
						provenance:
							'The 10 % cut is StrongLifts 5×5’s own published convention. No trial supports it.',
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

// ——— The rest bar ————————————————————————————————————————————————————————
//
// **Fake timers against a fixed deadline, never a real wait.** The whole claim of
// this bar is that it is derived from a wall-clock deadline rather than counted
// down, and the only way to test that is to move the clock without running the
// interval — which is exactly what a locked phone does.

/** The instant every rest below is started at. */
const TAPPED_AT = Date.parse('2026-08-19T17:00:00Z')

afterEach(() => {
	vi.useRealTimers()
})

/**
 * Freeze the clock at the instant every rest below is tapped at, so the deadline
 * under test is an exact number rather than whatever the machine's clock read.
 */
function frozenClock() {
	vi.useFakeTimers({ now: TAPPED_AT })
}

/**
 * A tap. `fireEvent` rather than `userEvent` deliberately: `userEvent` awaits its
 * own timers, which a frozen clock never delivers, and every control on this
 * screen is a plain `onClick`.
 */
async function tap(element: HTMLElement) {
	fireEvent.click(element)
	await settle()
}

/** Let the fetcher's save land without moving the clock. */
async function settle() {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(0)
	})
}

/** Render the bar as it stands at `instant`, one tick and no waiting. */
async function clockAt(instant: number) {
	await act(async () => {
		vi.setSystemTime(instant - REST_TICK_MS)
		await vi.advanceTimersByTimeAsync(REST_TICK_MS)
	})
	return screen.getByTestId('rest-clock')
}

function restClock() {
	return screen.getByTestId('rest-clock')
}

test('the rest bar counts down from the made-set rest, on a deadline anchored to the tap', async () => {
	frozenClock()
	renderLog()
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()

	expect(restClock()).toHaveTextContent('3:00')
	expect(restClock()).toHaveTextContent(/^3:00$/)
	expect(await clockAt(TAPPED_AT + 60_000)).toHaveTextContent('2:00')
})

test('a phone locked mid-rest comes back to the clock, not to the ticks the interval missed', async () => {
	frozenClock()
	renderLog()
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()
	// Two and a half minutes pass with the tab suspended: one tick, not three
	// hundred. A decremented counter would read 2:59 here.
	expect(await clockAt(TAPPED_AT + 150_000)).toHaveTextContent('0:30')
})

test('past zero the bar keeps counting into +m:ss in destructive rather than stopping or disappearing', async () => {
	frozenClock()
	renderLog()
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()

	const clock = await clockAt(
		TAPPED_AT + REST_AFTER_MADE_SET_SEC * 1000 + 14_000,
	)
	expect(clock).toHaveTextContent('+0:14')
	expect(clock.className).toContain('text-destructive')
	expect(screen.getByText('over your rest')).toBeInTheDocument()
})

test('the time renders in tabular numerals at a fixed minimum width, so the bar does not jitter', async () => {
	frozenClock()
	renderLog()
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()

	expect(restClock().className).toContain('tabular-nums')
	expect(restClock().className).toContain('min-w-14')
})

test('±15 s moves the deadline in one tap', async () => {
	frozenClock()
	renderLog()
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()

	await tap(screen.getByRole('button', { name: `−${REST_ADJUST_STEP_SEC}s` }))
	expect(restClock()).toHaveTextContent('2:45')
	await tap(screen.getByRole('button', { name: `+${REST_ADJUST_STEP_SEC}s` }))
	await tap(screen.getByRole('button', { name: `+${REST_ADJUST_STEP_SEC}s` }))
	expect(restClock()).toHaveTextContent('3:15')
	// And the moved deadline is what the next tick is measured against.
	expect(await clockAt(TAPPED_AT + 15_000)).toHaveTextContent('3:00')
})

test('✕ dismisses the bar', async () => {
	frozenClock()
	renderLog()
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()
	expect(restClock()).toBeInTheDocument()

	await tap(screen.getByRole('button', { name: 'Dismiss the rest timer' }))
	expect(screen.queryByTestId('rest-clock')).not.toBeInTheDocument()
	// The set it was resting from is still logged: dismissing a timer is not
	// unlogging a set.
	expect(screen.getByLabelText('Logged set 1 of Squat')).toBeInTheDocument()
})

test('clearing a set cancels the rest, because the set it was resting from is gone', async () => {
	frozenClock()
	renderLog({
		exercises: [
			exercise({ rows: [row({ orderIndex: 0, prescribedReps: 1 })] }),
		],
	})
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()
	expect(restClock()).toBeInTheDocument()

	// One rep prescribed: the second tap is the tap past zero, which clears.
	await tap(screen.getByLabelText('Logged set 1 of Squat'))
	await settle()
	await tap(screen.getByLabelText('Logged set 1 of Squat'))
	await settle()

	expect(screen.getByLabelText('Log set 1 of Squat')).toBeInTheDocument()
	expect(screen.queryByTestId('rest-clock')).not.toBeInTheDocument()
})

test('the bar covers no set circle: it is outside the cards, and the scroll area reserves its height', async () => {
	frozenClock()
	renderLog()
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()

	const bar = screen.getByLabelText('Rest timer')
	// No circle lives inside the bar, and the bar lives outside the scroll area
	// it is pinned to the foot of.
	expect(bar.querySelector('[data-set-circle]')).toBeNull()
	const scroll = document.querySelector('[data-runner-scroll]')!
	expect(scroll.contains(bar)).toBe(false)
	// The reserved height at the foot of the scroll area is what keeps the last
	// card's circles clear of the bar, and must not be dropped.
	expect(scroll.className).toContain('pb-30')
})

test('every set circle stays enabled and tappable while the timer runs — the rest never blocks a set', async () => {
	frozenClock()
	const { submitted } = renderLog()
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()
	expect(restClock()).toHaveTextContent('3:00')

	// All five, including the one already logged: nothing on this screen is
	// disabled by a running clock.
	const circles = Array.from(document.querySelectorAll('[data-set-circle]'))
	expect(circles).toHaveLength(5)
	for (const c of circles) expect(c).toBeEnabled()
	// And a tap lands mid-rest, twenty seconds in.
	await act(async () => {
		vi.setSystemTime(TAPPED_AT + 20_000)
		await vi.advanceTimersByTimeAsync(REST_TICK_MS)
	})
	await tap(screen.getByLabelText('Log set 2 of Squat'))
	await settle()
	expect(submitted).toHaveBeenLastCalledWith(
		expect.objectContaining({ orderIndex: '1', reps: '5' }),
	)
	// The rest restarts from the set just logged, not from the one before it.
	expect(restClock()).toHaveTextContent('3:00')
})

test('a short set restarts the rest at the longer duration, and the bar states the reason', async () => {
	frozenClock()
	renderLog()
	await settle()

	await tap(screen.getByLabelText('Log set 1 of Squat'))
	await settle()
	await tap(screen.getByLabelText('Logged set 1 of Squat'))
	await settle()

	expect(restClock()).toHaveTextContent(`${REST_AFTER_MISSED_SET_SEC / 60}:00`)
	expect(screen.getByText('longer rest after a missed set')).toBeInTheDocument()
})

// ——— The help panel, the plate line and last time (#484) —————————————————

test('the help panel is collapsed by default and opens from the control beside the name', async () => {
	renderLog()

	const toggle = await screen.findByLabelText('About Squat')
	// 36px drawn, 44px to a thumb through the `after:` inset.
	expect(toggle).toHaveClass('size-9')
	expect(toggle).toHaveAttribute('aria-expanded', 'false')
	// **Collapsed by default**: the panel is absent, not hidden — nothing on the
	// quiet screen and nothing for a screen reader to read past.
	expect(
		document.querySelector('[data-lift-help-panel]'),
	).not.toBeInTheDocument()
	expect(
		screen.queryByText(
			'The rest timer survives a locked phone, but not a closed tab.',
		),
	).not.toBeInTheDocument()

	await userEvent.click(toggle)

	expect(toggle).toHaveAttribute('aria-expanded', 'true')
	expect(document.querySelector('[data-lift-help-panel]')).toBeInTheDocument()
})

test('open, the panel says how the weight resolved, which rack, what the timer survives, and links to the lift over time', async () => {
	renderLog(
		{
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
		},
		{ ok: true },
		[
			{
				exerciseId: 'ex-1',
				equipment: 'barbell',
				workingWeightKg: 82.5,
				stallCount: 0,
				madeInARow: 5,
			},
		],
	)

	await userEvent.click(await screen.findByLabelText('About Squat'))
	const panel = document.querySelector('[data-lift-help-panel]')!

	// The weight in the athlete's own numbers, not the algorithm's.
	expect(panel).toHaveTextContent(
		'82.5 kg is your working weight after five made sessions.',
	)
	expect(panel).toHaveTextContent('Plates are solved against Bredvid Gym.')
	expect(panel).toHaveTextContent(
		'The rest timer survives a locked phone, but not a closed tab.',
	)
	expect(
		within(panel as HTMLElement).getByRole('link', {
			name: 'This lift over time',
		}),
	).toHaveAttribute('href', '/training/exercises/ex-1')
})

test('a held lift says two sessions came up short, so a weight that did not move is explained', async () => {
	renderLog({}, { ok: true }, [
		{
			exerciseId: 'ex-1',
			equipment: 'barbell',
			workingWeightKg: 60,
			stallCount: 2,
			madeInARow: 0,
		},
	])

	await userEvent.click(await screen.findByLabelText('About Squat'))

	expect(
		await screen.findByText(
			'60 kg is held: two sessions in a row came up short.',
		),
	).toBeInTheDocument()
})

test('the plate line is monospace under the sets, and last time sits beside it', async () => {
	renderLog({
		hasGymOnFile: true,
		exercises: [
			exercise({
				rows: workingSets().map((set) => ({
					...set,
					ghost: {
						load: { kind: 'external' as const, kg: 80 },
						reps: 5,
						durationSec: null,
						extrapolated: false,
					},
				})),
				plateContext: {
					gymName: 'Bredvid Gym',
					variantName: null,
					inventory: gym,
					options: { kind: 'external' },
				},
			}),
		],
	})

	const line = await waitFor(() => {
		const found = document.querySelector('[data-plate-line]')
		expect(found).not.toBeNull()
		return found!
	})
	expect(line).toHaveClass('font-mono')
	expect(
		screen.getByRole('button', { name: 'Last time 80 kg × 5,5,5,5,5' }),
	).toBeInTheDocument()
})

test('with no gym described there is no plate line, and the offer to describe one stands in its place', async () => {
	renderLog()

	await waitFor(async () =>
		expect(
			await screen.findByRole('link', { name: 'Tell us what your gym has' }),
		).toHaveAttribute('href', '/settings/training/gym'),
	)
	// **Not a default rack, not an assumed bar** (ADR 0060 §2).
	expect(document.querySelector('[data-plate-line]')).not.toBeInTheDocument()
	expect(document.querySelector('[data-plate-offer]')).toBeInTheDocument()
})
