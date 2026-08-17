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
				comparable: true,
			},
		],
		lastTime: {
			sessionId: 'sess-1',
			performedAt: new Date('2026-08-10T17:00:00Z'),
			workingSetCount: 5,
			topSetKg: 100,
			topSetText: '100 kg × 5',
			comparable: true,
		},
		records: [
			{
				exerciseId: 'ex-1',
				equipment: 'barbell',
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
		timezone: 'UTC',
		now: new Date('2026-08-14T12:00:00Z'),
		...overrides,
	}
}

function renderHistory(overrides: Partial<ExerciseHistoryView> = {}) {
	const App = createRoutesStub([
		{
			path: '/training/exercises/:exerciseId',
			Component: (props: Record<string, unknown>) => (
				<ExerciseHistoryRoute {...(props as any)} />
			),
			loader: () => ({ view: view(overrides) }),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/exercises/ex-1']} />)
}

test('the page leads with what the lift did last time and the records read out of it', async () => {
	renderHistory()

	expect(await screen.findByText('Last time: 3 days ago')).toBeInTheDocument()
	expect(screen.getByText('Heaviest ever')).toBeInTheDocument()
	expect(screen.getByText('100 kg')).toBeInTheDocument()
	expect(screen.getByText('up 2.5 kg')).toBeInTheDocument()
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
				comparable: false,
			},
		],
		lastTime: {
			sessionId: 'sess-1',
			performedAt: new Date('2026-08-10T17:00:00Z'),
			workingSetCount: 3,
			topSetKg: null,
			topSetText: 'level 7 × 12',
			comparable: false,
		},
		records: [
			{
				exerciseId: 'ex-1',
				equipment: 'machine',
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
