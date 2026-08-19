/**
 * @vitest-environment jsdom
 *
 * Seam 3, used sparingly: only the rules that are genuinely about the surface.
 * The mapping is proven at the presenter seam in
 * `__exercise-history-presenter.test.ts`, so what is left here is what the page
 * itself must never do — invent a kilo, or render an empty chart as if it were a
 * reading.
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { type ExerciseHistoryView } from '#app/utils/strength-records.server.ts'
import { type ProgramLiftContext } from './__exercise-history-presenter.ts'
import ExerciseHistoryRoute from './exercises.$exerciseId.tsx'

function view(
	overrides: Partial<ExerciseHistoryView> = {},
): ExerciseHistoryView {
	return {
		exercise: { id: 'ex-1', name: 'Back squat', unilateral: false },
		equipment: 'barbell',
		variants: [{ equipment: 'barbell', sessionCount: 2 }],
		sessions: [
			{
				sessionId: 'sess-1',
				performedAt: new Date('2026-08-10T17:00:00Z'),
				workingSetCount: 5,
				topSetKg: 100,
				topSetText: '100 kg × 5',
				loadBasis: 'bar',
				comparable: true,
			},
		],
		lastTime: {
			sessionId: 'sess-1',
			performedAt: new Date('2026-08-10T17:00:00Z'),
			workingSetCount: 5,
			topSetKg: 100,
			topSetText: '100 kg × 5',
			loadBasis: 'bar',
			comparable: true,
		},
		records: [
			{
				exerciseId: 'ex-1',
				equipment: 'barbell',
				loadBasis: 'bar',
				kind: 'heaviestLoad',
				reps: null,
				value: 100,
				unit: 'kg',
				sessionId: 'sess-1',
				achievedAt: new Date('2026-08-10T17:00:00Z'),
				previousValue: 97.5,
				delta: 2.5,
				crossExerciseComparable: true,
				unavailableNote: null,
				debut: false,
				estimator: null,
			},
		],
		estimator: 'epley',
		recordsRefused: null,
		oneRmUnavailable: null,
		timezone: 'UTC',
		now: new Date('2026-08-14T12:00:00Z'),
		...overrides,
	}
}

function renderHistory(
	overrides: Partial<ExerciseHistoryView> = {},
	program: ProgramLiftContext | null = null,
) {
	const App = createRoutesStub([
		{
			path: '/training/exercises/:exerciseId',
			Component: (props: Record<string, unknown>) => (
				<ExerciseHistoryRoute {...(props as any)} />
			),
			loader: () => ({ view: view(overrides), program }),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/exercises/ex-1']} />)
}

/** A run of sessions on one lift, oldest first, so the chart has bars to mark. */
function run(count: number): ExerciseHistoryView['sessions'] {
	return Array.from({ length: count }, (_, index) => ({
		sessionId: `sess-${index + 1}`,
		performedAt: new Date(Date.UTC(2026, 6, index + 1, 17)),
		workingSetCount: 5,
		topSetKg: 80 + index,
		topSetText: `${80 + index} kg × 5`,
		loadBasis: 'bar' as const,
		comparable: true,
	}))
}

test('the page leads with what the lift did last time and the records read out of it', async () => {
	renderHistory()

	expect(await screen.findByText('Last time: 3 days ago')).toBeInTheDocument()
	expect(screen.getByText('Heaviest ever')).toBeInTheDocument()
	expect(screen.getByText('100 kg')).toBeInTheDocument()
	expect(screen.getByText('up 2.5 kg')).toBeInTheDocument()
})

test('an assisted lift shows the reason it has no record, not an empty strip', async () => {
	renderHistory({
		exercise: { id: 'ex-1', name: 'Assisted pull-up', unilateral: false },
		equipment: 'assisted-machine',
		variants: [{ equipment: 'assisted-machine', sessionCount: 4 }],
		records: [],
		recordsRefused:
			'An assisted set takes no record: the number is your bodyweight minus the assistance, so it grows as the work shrinks.',
	})

	expect(
		await screen.findByText(/grows as the work shrinks/),
	).toBeInTheDocument()
	expect(screen.queryByText('Heaviest ever')).not.toBeInTheDocument()
})

test('a lift with no honest kilo says it progresses against itself only, and no kilo appears anywhere', async () => {
	renderHistory({
		exercise: { id: 'ex-1', name: 'Lat pulldown', unilateral: false },
		equipment: 'machine',
		variants: [{ equipment: 'machine', sessionCount: 1 }],
		sessions: [
			{
				sessionId: 'sess-1',
				performedAt: new Date('2026-08-10T17:00:00Z'),
				workingSetCount: 3,
				topSetKg: null,
				topSetText: 'level 7 × 12',
				loadBasis: 'stackLevel',
				comparable: false,
			},
		],
		lastTime: {
			sessionId: 'sess-1',
			performedAt: new Date('2026-08-10T17:00:00Z'),
			workingSetCount: 3,
			topSetKg: null,
			topSetText: 'level 7 × 12',
			loadBasis: 'stackLevel',
			comparable: false,
		},
		records: [
			{
				exerciseId: 'ex-1',
				equipment: 'machine',
				loadBasis: 'stackLevel',
				kind: 'stackLevel',
				reps: null,
				value: 7,
				unit: 'level',
				sessionId: 'sess-1',
				achievedAt: new Date('2026-08-10T17:00:00Z'),
				previousValue: 6,
				delta: 1,
				crossExerciseComparable: false,
				unavailableNote: 'No kilos — this progresses against itself only.',
				debut: false,
				estimator: null,
			},
		],
	})

	expect(
		await screen.findByText('No kilos — this progresses against itself only.'),
	).toBeInTheDocument()
	expect(screen.getByText('level 7')).toBeInTheDocument()
	// The chart is never kept continuous by inventing a kilo for an ordinal.
	expect(screen.queryByText(/kg/)).not.toBeInTheDocument()
})

test('a missing estimated 1RM is stated on the page, never a row that quietly disappears', async () => {
	// The same set must not be estimated from here and refused on the propose
	// surface, and the way the two agree is that this page says why the number is
	// absent rather than dropping the row.
	renderHistory({
		oneRmUnavailable:
			'None of your sets here says how close to failure it was, and in lifting there is no way to tell from the numbers. Mark a set as taken to failure, or record its reps in reserve.',
	})

	expect(
		await screen.findByText(/None of your sets here says how close to failure/),
	).toBeInTheDocument()
	expect(screen.queryByText(/Best estimated 1RM/)).not.toBeInTheDocument()
})

test('a lift with nothing logged says so instead of drawing an empty chart', async () => {
	renderHistory({ sessions: [], lastTime: null, records: [], variants: [] })

	expect(
		await screen.findByText(
			'No working sets logged on this lift yet, so there is nothing to read.',
		),
	).toBeInTheDocument()
	expect(screen.queryByText('Records')).not.toBeInTheDocument()
})

test('the surface offers neither a session tonnage nor a logging streak', async () => {
	renderHistory()

	await screen.findByText('Heaviest ever')
	// Declined, not deferred (ADR 0056), so not even a placeholder.
	expect(screen.queryByText(/tonnage/i)).not.toBeInTheDocument()
	expect(screen.queryByText(/streak/i)).not.toBeInTheDocument()
})

test("the page links on to this lift's anchors, which are otherwise unreachable", async () => {
	renderHistory()

	expect(
		await screen.findByRole('link', { name: /your numbers for this lift/i }),
	).toHaveAttribute('href', '/settings/training/lifts/ex-1')
})

test('a lift with no logged set still offers its anchors, because stating a number about yourself never needed a history', async () => {
	renderHistory({ sessions: [], lastTime: null, records: [] })

	expect(
		await screen.findByRole('link', { name: /your numbers for this lift/i }),
	).toHaveAttribute('href', '/settings/training/lifts/ex-1')
})

test("the working weight is the screen's headline, with the estimated 1RM and the set it came from beside it", async () => {
	renderHistory(
		{
			sessions: run(3),
			records: [
				{
					exerciseId: 'ex-1',
					equipment: 'barbell',
					loadBasis: 'bar',
					kind: 'e1RM',
					reps: null,
					value: 96,
					unit: 'kg',
					sessionId: 'sess-3',
					achievedAt: new Date('2026-07-03T17:00:00Z'),
					previousValue: null,
					delta: null,
					crossExerciseComparable: true,
					unavailableNote: null,
					debut: false,
					oneRmProtocol: 'epley',
					estimator: 'epley',
				},
			],
		},
		{ workingWeightKg: 82.5, stallCuts: [] },
	)

	expect(await screen.findByText('Working weight')).toBeInTheDocument()
	expect(screen.getByText('82.5 kg')).toBeInTheDocument()
	expect(screen.getAllByText('96 kg').length).toBeGreaterThan(0)
	expect(screen.getAllByText(/from 82 kg × 5/).length).toBeGreaterThan(0)
})

test('the session the program cut on is marked on the chart and named by a note strip that carries both weights', async () => {
	renderHistory(
		{ sessions: run(9) },
		{
			workingWeightKg: 72.5,
			stallCuts: [
				{ sessionId: 'sess-8', fromKg: 80, toKg: 72.5, response: 'stallCut' },
			],
		},
	)

	expect(
		await screen.findByText('Session 8 — Stall Cut, 80 kg → 72.5 kg'),
	).toBeInTheDocument()
	// The chart says the same thing to a reader who cannot see the bar.
	expect(
		screen.getByRole('img', { name: /Stall Cut, 80 kg → 72.5 kg/ }),
	).toBeInTheDocument()
})

test('every third session on the chart carries its tick, and the ones between carry none', async () => {
	renderHistory({ sessions: run(9) }, { workingWeightKg: 82.5, stallCuts: [] })

	expect(await screen.findByText('S1')).toBeInTheDocument()
	expect(screen.getByText('S4')).toBeInTheDocument()
	expect(screen.getByText('S7')).toBeInTheDocument()
	expect(screen.queryByText('S2')).not.toBeInTheDocument()
	expect(screen.queryByText('S8')).not.toBeInTheDocument()
})

test('a lift in no program shows no working weight, no marking and no note strip — the absence is the answer', async () => {
	renderHistory({ sessions: run(9) }, null)

	await screen.findByText('Records')
	expect(screen.queryByText('Working weight')).not.toBeInTheDocument()
	expect(screen.queryByText(/Stall Cut/)).not.toBeInTheDocument()
})

test('the records list carries the rep max and the estimated 1RM, and never a session tonnage', async () => {
	renderHistory(
		{
			sessions: run(3),
			records: [
				{
					exerciseId: 'ex-1',
					equipment: 'barbell',
					loadBasis: 'bar',
					kind: 'repMax',
					reps: 5,
					value: 82.5,
					unit: 'kg',
					sessionId: 'sess-3',
					achievedAt: new Date('2026-07-03T17:00:00Z'),
					previousValue: 80,
					delta: 2.5,
					crossExerciseComparable: true,
					unavailableNote: null,
					debut: false,
					estimator: null,
				},
				{
					exerciseId: 'ex-1',
					equipment: 'barbell',
					loadBasis: 'bar',
					kind: 'e1RM',
					reps: null,
					value: 96,
					unit: 'kg',
					sessionId: 'sess-3',
					achievedAt: new Date('2026-07-03T17:00:00Z'),
					previousValue: null,
					delta: null,
					crossExerciseComparable: true,
					unavailableNote: null,
					debut: false,
					oneRmProtocol: 'epley',
					estimator: 'epley',
				},
			],
		},
		{ workingWeightKg: 82.5, stallCuts: [] },
	)

	expect(await screen.findByText('Best 5-rep set')).toBeInTheDocument()
	expect(screen.getByText('Best estimated 1RM')).toBeInTheDocument()
	// ADR 0058 §3 declines tonnage; the handoff's third row is not built.
	expect(screen.queryByText(/tonnage/i)).not.toBeInTheDocument()
})

test('the per-equipment variant tabs keep working beside the chart', async () => {
	renderHistory({
		variants: [
			{ equipment: 'barbell', sessionCount: 5 },
			{ equipment: 'dumbbell', sessionCount: 2 },
		],
	})

	expect(
		await screen.findByRole('link', { name: /All variants/ }),
	).toHaveAttribute('href', '/training/exercises/ex-1')
	expect(screen.getByRole('link', { name: /Dumbbell/ })).toHaveAttribute(
		'href',
		'/training/exercises/ex-1?equipment=dumbbell',
	)
})
