/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { type ProgramOverview } from '#app/utils/strength-program.server.ts'
import ProgramRunRoute, {
	workingWeightKg,
	workingWeightRefusal,
} from './programs.run.$instanceId.tsx'

function overview(changes: Partial<ProgramOverview> = {}): ProgramOverview {
	return {
		instanceId: 'inst-1',
		status: 'active',
		startedOn: new Date('2026-08-01T00:00:00Z'),
		program: {
			id: 'prog_stronglifts_5x5_basic',
			key: 'stronglifts-5x5',
			variantId: 'basic',
			name: 'StrongLifts 5×5',
			dayIds: ['A', 'B'],
			provenanceNote:
				'The three-session −10 % Stall Cut is StrongLifts’ own published default. The percentage is program convention and is supported by no trial.',
			citation: {
				author: 'Mehdi Hadim',
				work: 'stronglifts.com',
				year: null,
				locator: 'Progression and failure articles',
			},
			lifts: [],
		},
		openSessionId: null,
		openSessionHasLoggedSets: false,
		today: {
			dayId: 'A',
			lifts: [
				{
					exerciseId: 'ex_bb_back_squat',
					equipment: null,
					sets: Array.from({ length: 5 }, (_, index) => ({
						setIndex: index,
						reps: 5,
						weight: {
							kind: 'resolved' as const,
							kg: 90,
							unroundedKg: 90,
							basis: 'working weight',
						},
					})),
				},
			],
		},
		liftNames: { ex_bb_back_squat: 'Back Squat' },
		nextDayId: 'B',
		lifts: [
			{
				exerciseId: 'ex_bb_back_squat',
				equipment: null,
				name: 'Back Squat',
				currentWorkingWeightKg: 90,
				stallCount: 0,
				incrementText: '+2.5 kg',
				increment: { kind: 'absolute', deltaKg: 2.5 },
				lastStall: { fromKg: 100, toKg: 90, response: 'stallCut' },
			},
		],
		...changes,
	}
}

function renderOverview(changes: Partial<ProgramOverview> = {}) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/programs/run/:instanceId',
			Component: (props: Record<string, unknown>) => (
				<ProgramRunRoute {...(props as any)} />
			),
			loader: () => overview(changes),
			action: async ({ request }) => {
				const fields = Object.fromEntries(await request.formData())
				submitted(fields)
				// The route's own refusal, not a restated copy of it: the sentence under
				// test is the one the action really sends.
				const refusal =
					fields.intent === 'set-working-weight'
						? workingWeightRefusal(String(fields.weightKg ?? ''))
						: null
				return refusal ? { ok: false, error: refusal } : { ok: true }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/programs/run/inst-1']} />)
	return { submitted }
}

test('a Stall Cut renders as a notice with its reason, and offers nothing', async () => {
	renderOverview()

	const notice = await screen.findByRole('status')
	expect(notice).toHaveTextContent('Vekta kuttes: Back Squat 100 kg → 90 kg.')
	// The reason, in the athlete's own numbers, and the provenance of the rule
	// that produced it — a 10 % drop with no trial behind it says so.
	expect(notice).toHaveTextContent(/kom til kort på dette løftet/i)
	expect(notice).toHaveTextContent(/uten studier bak/i)
	// It is a notice and not a prompt: nothing inside it to press or decide.
	expect(within(notice).queryByRole('button')).toBeNull()
	expect(within(notice).queryByRole('link')).toBeNull()
	expect(within(notice).queryByRole('textbox')).toBeNull()
})

test('a lift that has never stalled shows no notice at all', async () => {
	renderOverview({
		lifts: [
			{
				exerciseId: 'ex_bb_back_squat',
				equipment: null,
				name: 'Back Squat',
				currentWorkingWeightKg: 90,
				stallCount: 0,
				incrementText: '+2.5 kg',
				increment: { kind: 'absolute', deltaKg: 2.5 },
				lastStall: null,
			},
		],
	})

	expect(await screen.findByText(/I dag: Økt A/)).toBeInTheDocument()
	expect(screen.queryByRole('status')).toBeNull()
})

test('the overview answers what to lift today and what is next, with the load resolved', async () => {
	renderOverview()

	expect(await screen.findByText(/I dag: Økt A/)).toBeInTheDocument()
	const todayLine = screen
		.getAllByRole('listitem')
		.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
	expect(todayLine).toContain('Back Squat 5×5 · 90 kg')
	expect(screen.getByText('Neste etter i dag: Økt B.')).toBeInTheDocument()
})

test('each lift says its working weight and what the next made session adds, with a decimal comma (Arket M)', async () => {
	renderOverview({
		lifts: [
			{
				exerciseId: 'ex-squat',
				equipment: null,
				name: 'Knebøy',
				currentWorkingWeightKg: 82.5,
				stallCount: 0,
				incrementText: '+2.5 kg',
				increment: { kind: 'absolute', deltaKg: 2.5 },
				lastStall: null,
			},
		],
	})

	expect(await screen.findByText('82,5 kg')).toBeInTheDocument()
	expect(screen.getByText('neste: +2,5 kg')).toBeInTheDocument()
	expect(screen.getByLabelText('Arbeidsvekt for Knebøy i kg')).toHaveValue(
		'82,5',
	)
})

test('a Stall Count is shown only where it is non-zero, because a lift on zero has nothing to say', async () => {
	renderOverview({
		lifts: [
			{
				exerciseId: 'ex_bb_back_squat',
				equipment: null,
				name: 'Back Squat',
				currentWorkingWeightKg: 90,
				stallCount: 2,
				incrementText: '+2.5 kg',
				increment: { kind: 'absolute', deltaKg: 2.5 },
				lastStall: null,
			},
			{
				exerciseId: 'ex_bb_bench',
				equipment: null,
				name: 'Bench Press',
				currentWorkingWeightKg: 60,
				stallCount: 0,
				incrementText: '+2.5 kg',
				increment: { kind: 'absolute', deltaKg: 2.5 },
				lastStall: null,
			},
		],
	})

	expect(await screen.findByText(/2 økter på rad til kort/)).toBeInTheDocument()
	expect(screen.queryByText(/Stall Count 0/)).toBeNull()
})

test("each lift's name opens that lift's history, so the screen that says what you lift next also answers whether it is moving", async () => {
	renderOverview()

	expect(
		await screen.findByRole('link', { name: 'Back Squat' }),
	).toHaveAttribute('href', '/training/exercises/ex_bb_back_squat')
})

test('the working-weight control is labelled with a verb, so "Set" cannot be read as the noun beside a weight field', async () => {
	const { submitted } = renderOverview()
	const user = userEvent.setup()

	const save = await screen.findByRole('button', { name: 'Lagre vekt' })
	expect(screen.queryByRole('button', { name: 'Set' })).toBeNull()

	await user.click(save)
	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			intent: 'set-working-weight',
			exerciseId: 'ex_bb_back_squat',
			weightKg: '90',
		}),
	)
})

test('a refused working weight says what is wrong next to the input', async () => {
	// `0` posted, came back 400 `{"error":"That did not make sense."}`, and this page
	// rendered nothing whatsoever — the route never read `fetcher.data` — so the
	// refused number sat in the field looking saved. `-5` had a second problem on
	// top of that one, and it has its own test below.
	const { submitted } = renderOverview({
		lifts: [
			{
				exerciseId: 'ex_bb_back_squat',
				equipment: null,
				name: 'Back Squat',
				currentWorkingWeightKg: 90,
				stallCount: 0,
				incrementText: '+2.5 kg',
				increment: { kind: 'absolute', deltaKg: 2.5 },
				lastStall: null,
			},
			{
				exerciseId: 'ex_bb_bench_press',
				equipment: null,
				name: 'Bench Press',
				currentWorkingWeightKg: 60,
				stallCount: 0,
				incrementText: '+2.5 kg',
				increment: { kind: 'absolute', deltaKg: 2.5 },
				lastStall: null,
			},
		],
	})
	const user = userEvent.setup()

	const bench = await screen.findByLabelText('Arbeidsvekt for Bench Press i kg')
	await user.clear(bench)
	await user.type(bench, '0')
	await user.click(
		within(bench.closest('form')!).getByRole('button', { name: 'Lagre vekt' }),
	)

	expect(submitted).toHaveBeenCalled()
	// The sentence says what the field takes …
	const alert = await screen.findByRole('alert')
	expect(alert).toHaveTextContent(
		'En arbeidsvekt må være et positivt antall kilo.',
	)
	// … it is tied to the input that caused it …
	expect(bench).toHaveAttribute('aria-describedby', alert.id)
	expect(bench).toHaveAttribute('aria-invalid', 'true')
	// … and it does not appear against the lift nobody touched.
	expect(screen.getAllByRole('alert')).toHaveLength(1)
})

test('a negative working weight says what is wrong rather than doing nothing', async () => {
	// `min="0"` swallowed a typed `-5`: the browser blocked the submit, so nothing
	// posted, no sentence appeared and nothing saved — while `0` and `999999` came
	// back with sentences. A silent refusal is the worst shape a refusal can take,
	// so `-5` now takes the same visible path as the other two.
	const { submitted } = renderOverview()
	const user = userEvent.setup()

	const squat = await screen.findByLabelText('Arbeidsvekt for Back Squat i kg')
	await user.clear(squat)
	await user.type(squat, '-5')
	// Nothing in the client stops it: the refusal is the server's to say, in words.
	expect((squat as HTMLInputElement).checkValidity()).toBe(true)
	await user.click(screen.getByRole('button', { name: 'Lagre vekt' }))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ weightKg: '-5' }),
	)
	const alert = await screen.findByRole('alert')
	expect(alert).toHaveTextContent(
		'En arbeidsvekt må være et positivt antall kilo.',
	)
	expect(squat).toHaveAttribute('aria-describedby', alert.id)
	expect(squat).toHaveAttribute('aria-invalid', 'true')
})

test('a working weight past the sanity bound is refused as the typo it is, and names the bound', async () => {
	// `999999 kg` used to be accepted and then rendered as a prescription. The bound
	// is a product decision about typos, so the message states the number rather than
	// implying the app knows what anybody can lift.
	renderOverview()
	const user = userEvent.setup()

	const squat = await screen.findByLabelText('Arbeidsvekt for Back Squat i kg')
	await user.clear(squat)
	await user.type(squat, '999999')
	await user.click(screen.getByRole('button', { name: 'Lagre vekt' }))

	expect(await screen.findByRole('alert')).toHaveTextContent(
		'En arbeidsvekt må være 1000 kg eller mindre — over det er det en skrivefeil, ikke et løft.',
	)
})

test('the bound refuses a typo and nothing a person could actually lift', async () => {
	// Both directions of the bound, stated once: it is generous on purpose, because
	// an app that guessed at a ceiling would refuse somebody's real number.
	expect(workingWeightRefusal('0')).toMatch(/positivt antall kilo/)
	expect(workingWeightRefusal('-5')).toMatch(/positivt antall kilo/)
	expect(workingWeightRefusal('abc')).toMatch(/positivt antall kilo/)
	expect(workingWeightRefusal('999999')).toMatch(/1000 kg eller mindre/)
	expect(workingWeightRefusal('1000.5')).toMatch(/1000 kg eller mindre/)
	expect(workingWeightRefusal('61.25')).toBeNull()
	expect(workingWeightRefusal('300')).toBeNull()
})

test('a Norwegian decimal comma is a working weight, read as the kilo it says', async () => {
	expect(workingWeightRefusal('62,5')).toBeNull()
	expect(workingWeightRefusal('1000,5')).toMatch(/1000 kg eller mindre/)
	expect(workingWeightRefusal('6,2,5')).toMatch(/positivt antall kilo/)
	expect(workingWeightKg('62,5')).toBe(62.5)
	expect(workingWeightKg('62.5')).toBe(62.5)

	const { submitted } = renderOverview()
	const user = userEvent.setup()
	const squat = await screen.findByLabelText('Arbeidsvekt for Back Squat i kg')
	// A text field with a decimal keypad, so the locale cannot turn `62,5`
	// into `625` on the way out.
	expect(squat).toHaveAttribute('type', 'text')
	expect(squat).toHaveAttribute('inputmode', 'decimal')
	await user.clear(squat)
	await user.type(squat, '62,5')
	await user.click(screen.getByRole('button', { name: 'Lagre vekt' }))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ weightKg: '62,5' }),
	)
	expect(screen.queryByRole('alert')).toBeNull()
})
