/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { type ProgramOverview } from '#app/utils/strength-program.server.ts'
import ProgramRunRoute from './programs.run.$instanceId.tsx'

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
				submitted(Object.fromEntries(await request.formData()))
				return { ok: true }
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
	expect(notice).toHaveTextContent('Stall Cut: Back Squat 100 kg → 90 kg.')
	// The reason, in the athlete's own numbers, and the provenance of the rule
	// that produced it — a 10 % drop with no trial behind it says so.
	expect(notice).toHaveTextContent(/missed reps on this lift/i)
	expect(notice).toHaveTextContent(/no trial/i)
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
				lastStall: null,
			},
		],
	})

	expect(await screen.findByText(/Today: Workout A/)).toBeInTheDocument()
	expect(screen.queryByRole('status')).toBeNull()
})

test('the overview answers what to lift today and what is next, with the load resolved', async () => {
	renderOverview()

	expect(await screen.findByText(/Today: Workout A/)).toBeInTheDocument()
	const todayLine = screen
		.getAllByRole('listitem')
		.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
	expect(todayLine).toContain('Back Squat 5×5 @ 90 kg')
	expect(screen.getByText('Next after today: Workout B.')).toBeInTheDocument()
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
				lastStall: null,
			},
			{
				exerciseId: 'ex_bb_bench',
				equipment: null,
				name: 'Bench Press',
				currentWorkingWeightKg: 60,
				stallCount: 0,
				incrementText: '+2.5 kg',
				lastStall: null,
			},
		],
	})

	expect(await screen.findByText(/Stall Count 2/)).toBeInTheDocument()
	expect(screen.queryByText(/Stall Count 0/)).toBeNull()
})

test("each lift's name opens that lift's history, so the screen that says what you lift next also answers whether it is moving", async () => {
	renderOverview()

	expect(
		await screen.findByRole('link', { name: 'Back Squat' }),
	).toHaveAttribute('href', '/training/exercises/ex_bb_back_squat')
})
