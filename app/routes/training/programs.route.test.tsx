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
				stallResponseText: 'Stall Cut of 10 % after 3 misses in a row',
				stallsBeforeResponse: 3,
			},
			{
				exerciseId: 'ex_bb_deadlift',
				equipment: null,
				name: 'Deadlift',
				dayIds: ['B'],
				setCount: 1,
				repsPerSet: 5,
				defaultStartKg: 30,
				startSeedRepMaxReps: null,
				incrementText: '+5 kg',
				stallResponseText: 'Stall Cut of 10 % after 3 misses in a row',
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

test('a program already running is never offered the start form again', async () => {
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
		await screen.findByRole('button', { name: /open your run/i }),
	).toBeInTheDocument()
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

const runningInstance: Instance = {
	id: 'inst-1',
	programId: 'prog_stronglifts_5x5_basic',
	status: 'active',
	startedOn: new Date('2026-08-01T00:00:00Z'),
	program: { name: 'StrongLifts 5×5' },
}

test('a card says what the program is: its day shapes and one line per lift, in the program’s own numbers', async () => {
	renderPrograms()

	expect(
		await screen.findByText('2 day shapes · Workout A / Workout B'),
	).toBeInTheDocument()
	expect(
		screen.getByText(
			(_, node) =>
				node?.textContent ===
					'Back Squat 5×5 · +2.5 kg · −10 % after 3 stalls' &&
				node.tagName === 'LI',
		),
	).toBeInTheDocument()
	expect(
		screen.getByText(
			(_, node) =>
				node?.textContent === 'Deadlift 1×5 · +5 kg · −10 % after 3 stalls' &&
				node.tagName === 'LI',
		),
	).toBeInTheDocument()
})

test('the provenance note is on the card, because twelve weeks of a rule is a thing to consent to', async () => {
	renderPrograms()

	expect(
		await screen.findByText(
			/The three-session −10 % Stall Cut is StrongLifts’ own published default\./,
		),
	).toBeInTheDocument()
})

test('a running program is badged, so an athlete can tell their program from the others', async () => {
	renderPrograms({ instances: [runningInstance] })

	expect(await screen.findByText('Running')).toBeInTheDocument()
})

test('a program that is not running is not badged', async () => {
	renderPrograms()

	expect(screen.queryByText('Running')).toBeNull()
})

test('the primary button on a running program opens today’s session directly, through the open-session intent', async () => {
	renderPrograms({ instances: [runningInstance] })

	const button = await screen.findByRole('button', { name: /open your run/i })
	const form = button.closest('form')
	expect(form).not.toBeNull()
	expect(form).toHaveAttribute('method', 'post')
	expect(form?.getAttribute('action')).toBe('/training/programs/run/inst-1')
	expect(form?.querySelector('input[name="intent"]')).toHaveAttribute(
		'value',
		'open-session',
	)
})

test('a running card keeps a secondary link to the overview, where a working weight is corrected and a program ended', async () => {
	renderPrograms({ instances: [runningInstance] })

	expect(
		await screen.findByRole('link', {
			name: /correct a weight or end this program/i,
		}),
	).toHaveAttribute('href', '/training/programs/run/inst-1')
})
