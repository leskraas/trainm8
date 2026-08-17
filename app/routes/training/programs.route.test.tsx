/**
 * @vitest-environment jsdom
 *
 * Reachability, not presentation: the program list is the app's one way into
 * the strength module, so what this file pins is that each card leads somewhere
 * and that an empty corpus is a dead end said out loud rather than a blank page.
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { type ProgramSummary } from '#app/utils/strength-program.server.ts'
import ProgramsRoute from './programs.tsx'

type Instance = {
	id: string
	programId: string
	status: string
	startedOn: Date
	program: { name: string }
}

function program(overrides: Partial<ProgramSummary> = {}): ProgramSummary {
	return {
		id: 'prog_stronglifts_5x5_basic',
		key: 'stronglifts-5x5',
		variantId: 'basic',
		name: 'StrongLifts 5×5',
		dayIds: ['A', 'B'],
		provenanceNote:
			'The three-session −10 % Stall Cut is StrongLifts’ own published default.',
		citation: {
			author: 'Mehdi Hadim',
			work: 'stronglifts.com',
			year: null,
			locator: null,
		},
		lifts: [
			{
				exerciseId: 'ex_bb_back_squat',
				equipment: null,
				name: 'Back Squat',
				dayIds: ['A', 'B'],
				setCount: 5,
				repsPerSet: 5,
				defaultStartKg: 20,
				startSeedRepMaxReps: null,
				incrementText: '+2.5 kg',
				stallResponseText: 'three fails then cut 10 %',
				stallsBeforeResponse: 3,
			},
		],
		...overrides,
	}
}

function renderPrograms({
	programs = [program()],
	instances = [] as Instance[],
} = {}) {
	const App = createRoutesStub([
		{
			path: '/training/programs',
			Component: (props: Record<string, unknown>) => (
				<ProgramsRoute {...(props as any)} />
			),
			loader: () => ({ programs, instances }),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/programs']} />)
}

test('a program an athlete has not started leads to the screen that asks for starting weights', async () => {
	renderPrograms()

	expect(
		await screen.findByRole('link', { name: /start stronglifts 5×5/i }),
	).toHaveAttribute(
		'href',
		'/training/programs/prog_stronglifts_5x5_basic/start',
	)
})

test('a program already running leads to its run instead, never back through the start form', async () => {
	renderPrograms({
		instances: [
			{
				id: 'inst-1',
				programId: 'prog_stronglifts_5x5_basic',
				status: 'active',
				startedOn: new Date('2026-08-01T00:00:00Z'),
				program: { name: 'StrongLifts 5×5' },
			},
		],
	})

	expect(
		await screen.findByRole('link', { name: /open your run/i }),
	).toHaveAttribute('href', '/training/programs/run/inst-1')
	expect(screen.queryByRole('link', { name: /^start /i })).toBeNull()
})

test('with no programs published the screen says so is nobody’s fault and points at a way to train that is open', async () => {
	renderPrograms({ programs: [] })

	expect(
		await screen.findByText(/no programs are published in this database yet/i),
	).toBeInTheDocument()
	expect(screen.getByRole('link', { name: /catalogue/i })).toHaveAttribute(
		'href',
		'/training/catalogue',
	)
	expect(
		screen.getByRole('link', { name: /write one yourself/i }),
	).toHaveAttribute('href', '/training/sessions/new')
})

test('the back link leaves for Home, because there is no training index route to land on', async () => {
	renderPrograms()

	expect(await screen.findByRole('link', { name: /home/i })).toHaveAttribute(
		'href',
		'/',
	)
})
