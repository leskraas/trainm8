/**
 * @vitest-environment jsdom
 *
 * **What you lift next time** — the panel that ends the session with a decision
 * rather than a summary (#485, ADR 0060 §7).
 *
 * The assertions that matter most are the two negative ones: a Stall Cut is a
 * status region containing **no button, no link and no input**, and the word
 * *"deload"* appears nowhere on the screen. Both are rules the app has broken
 * before, and neither can be checked by reading the copy.
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { type PlateInventory } from '#app/utils/strength/plates.ts'
import { type StrengthLogView } from '#app/utils/strength-log.server.ts'
import { type OutcomePanelItem } from './__outcome-panel-presenter.ts'
import SetLogRoute from './sessions.$sessionId_.log.tsx'

type LogRow = StrengthLogView['exercises'][0]['rows'][0]
type LogExercise = StrengthLogView['exercises'][0]

/** The rack the handoff's own sentence was written against: 55 kg yes, 54 no. */
const gym: PlateInventory = {
	bars: [{ label: 'Olympic', weightKg: 20 }],
	plates: [
		{ weightKg: 20, count: 2 },
		{ weightKg: 10, count: 2 },
		{ weightKg: 5, count: 2 },
		{ weightKg: 2.5, count: 2 },
	],
	fixedDumbbellsKg: null,
}

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

function exercise(overrides: Partial<LogExercise> = {}): LogExercise {
	return {
		stepId: 'step-1',
		exerciseId: 'ex-1',
		name: 'Squat',
		restBetweenSetsSec: null,
		unilateral: null,
		loadSemanticsKind: null,
		rows: Array.from({ length: 5 }, (_, index) =>
			row({ orderIndex: index, exerciseSetId: `set-${index + 1}` }),
		),
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
		program: { instanceId: 'inst-1', name: 'StrongLifts 5×5' },
		...overrides,
	}
}

function item(overrides: Partial<OutcomePanelItem> = {}): OutcomePanelItem {
	return {
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
		...overrides,
	}
}

const progressed = item()

const held = item({
	key: 'ex-2::',
	liftName: 'Bench Press',
	exerciseId: 'ex-2',
	headline: 'Bench Press stays at 60 kg',
	reason: 'A set came up short, so the weight repeats.',
	tone: 'held',
	label: 'Stall Count 1',
})

const notLogged = item({
	key: 'ex-3::',
	liftName: 'Barbell Row',
	exerciseId: 'ex-3',
	headline: 'Barbell Row unchanged at 55 kg',
	reason: 'Nothing was logged for this lift, so the program did not read it.',
	tone: 'notLogged',
})

const stallCut = item({
	key: 'ex-2::barbell',
	liftName: 'Bench Press',
	exerciseId: 'ex-2',
	headline: 'Bench Press 60 kg → 54 kg',
	reason:
		'You came up short on this lift three sessions in a row, so the program takes the weight down 10 % and you build it again.',
	isNotice: true,
	label: 'Stall Cut',
	tone: 'cut',
	movedToKg: 54,
	provenance:
		'The 10 % cut is StrongLifts 5×5’s own published convention. No trial supports it.',
})

/** Finish the session and hand the panel these outcomes. */
async function finishWith(
	outcomes: OutcomePanelItem[],
	overrides: Partial<StrengthLogView> = {},
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
				return {
					ok: true as const,
					finished: { outcomes, programName: 'StrongLifts 5×5' },
				}
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
		{ path: '/', Component: () => <div>Cockpit</div> },
		{
			path: '/training/exercises/:exerciseId',
			Component: () => <div>Lift</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/sess-1/log']} />)
	await userEvent.click(
		await screen.findByRole('button', { name: 'Finish workout' }),
	)
	return {
		submitted,
		panel: await screen.findByRole('region', {
			name: 'What you lift next time',
		}),
	}
}

// ——— The four kinds ————————————————————————————————————————————————————————

test('all four outcomes render with their own words', async () => {
	const { panel } = await finishWith([progressed, held, notLogged, stallCut])

	expect(within(panel).getByText('Squat 82.5 kg → 85 kg')).toBeInTheDocument()
	expect(
		within(panel).getByText('All 5 sets of 5 reps. StrongLifts adds 2.5 kg.'),
	).toBeInTheDocument()
	expect(
		within(panel).getByText('Bench Press stays at 60 kg'),
	).toBeInTheDocument()
	expect(
		within(panel).getByText('A set came up short, so the weight repeats.'),
	).toBeInTheDocument()
	expect(
		within(panel).getByText('Barbell Row unchanged at 55 kg'),
	).toBeInTheDocument()
	expect(
		within(panel).getByText(
			'Nothing was logged for this lift, so the program did not read it.',
		),
	).toBeInTheDocument()
	expect(
		within(panel).getByText('Bench Press 60 kg → 54 kg'),
	).toBeInTheDocument()
})

test('each kind is drawn in its own background and border', async () => {
	const { panel } = await finishWith([progressed, held, notLogged, stallCut])

	// Read as elements rather than by role: a notice is a `role="status"` region
	// and is deliberately no longer a listitem.
	const panels = [...panel.querySelectorAll('li')]
	const [progress, hold, unread, cut] = panels.map((el) => el.className)

	// Progress and "not logged" are both quiet outlines — the design's own call.
	// A held lift is filled and a cut is destructive, and neither reads like the
	// other or like the outlines.
	expect(progress).toMatch(/border-border/)
	expect(progress).not.toMatch(/bg-card|destructive/)
	expect(unread).not.toMatch(/bg-card|destructive/)
	expect(hold).toMatch(/bg-card/)
	expect(cut).toMatch(/destructive/)
	expect(new Set([progress, hold, cut]).size).toBe(3)
})

// ——— The Stall Cut ————————————————————————————————————————————————————————

test('a Stall Cut is a status region and offers nothing', async () => {
	const { panel } = await finishWith([progressed, stallCut])

	const notice = within(panel)
		.getAllByRole('status')
		.find((el) => el.textContent?.includes('Stall Cut'))!
	expect(notice).toHaveTextContent('Bench Press 60 kg → 54 kg')

	// No undo, no dismiss, no "keep the weight anyway".
	expect(within(notice).queryByRole('button')).not.toBeInTheDocument()
	expect(within(notice).queryByRole('link')).not.toBeInTheDocument()
	expect(within(notice).queryByRole('textbox')).not.toBeInTheDocument()
	expect(within(notice).queryByRole('checkbox')).not.toBeInTheDocument()
	expect(notice.querySelectorAll('input, textarea, select')).toHaveLength(0)
})

test('the word deload appears nowhere', async () => {
	await finishWith([progressed, held, notLogged, stallCut])

	expect(document.body.textContent).not.toMatch(/deload/i)
})

test('the Stall Cut carries its provenance above a hairline', async () => {
	const { panel } = await finishWith([stallCut])

	const provenance = within(panel).getByText(
		'The 10 % cut is StrongLifts 5×5’s own published convention. No trial supports it.',
	)
	expect(provenance.className).toMatch(/border-t/)
})

test('nothing but the cut carries a provenance line', async () => {
	const { panel } = await finishWith([progressed, held, notLogged])

	expect(
		within(panel).queryByText(/published convention/),
	).not.toBeInTheDocument()
})

test('where the gym cannot make the cut weight, the panel says which weight it can make', async () => {
	const { panel } = await finishWith([stallCut], {
		hasGymOnFile: true,
		exercises: [
			exercise({
				exerciseId: 'ex-2',
				name: 'Bench Press',
				plateContext: {
					inventory: gym,
					gymName: 'Bredvid Gym',
					options: {},
					variantName: null,
				},
			}),
		],
	})

	expect(
		within(panel).getByText(/Your gym makes 55 kg, not 54 kg\./),
	).toBeInTheDocument()
})

test('a rack that can make the cut weight is not talked about', async () => {
	const { panel } = await finishWith(
		[{ ...stallCut, movedToKg: 55, headline: 'Bench Press 60 kg → 55 kg' }],
		{
			hasGymOnFile: true,
			exercises: [
				exercise({
					exerciseId: 'ex-2',
					name: 'Bench Press',
					plateContext: {
						inventory: gym,
						gymName: 'Bredvid Gym',
						options: {},
						variantName: null,
					},
				}),
			],
		},
	)

	expect(within(panel).queryByText(/Your gym makes/)).not.toBeInTheDocument()
})

// ——— Where the panel leads ————————————————————————————————————————————————

test('an outline link reaches the lift over time and a primary button returns to the cockpit', async () => {
	const { panel } = await finishWith([progressed, held])

	expect(
		within(panel).getByRole('link', { name: 'See Squat over time' }),
	).toHaveAttribute('href', '/training/exercises/ex-1')
	expect(
		within(panel).getByRole('link', { name: 'Back to today' }),
	).toHaveAttribute('href', '/')
})

test('a lift the catalogue does not know offers no history link', async () => {
	const { panel } = await finishWith([{ ...progressed, exerciseId: '' }])

	expect(within(panel).queryByRole('link', { name: /over time/ })).toBeNull()
})

test('back from the outcome panel returns to the runner', async () => {
	const { panel } = await finishWith([progressed])

	await userEvent.click(
		within(panel).getByRole('button', { name: 'Back to your sets' }),
	)

	expect(screen.queryByText('What you lift next time')).not.toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: 'Finish workout' }),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Log set 1 of Squat')).toBeInTheDocument()
})

test('a session that advanced no program says so rather than drawing an empty panel', async () => {
	const { panel } = await finishWith([])

	expect(
		within(panel).getByText(
			'Session finished. This one is not part of a running program, so nothing advanced.',
		),
	).toBeInTheDocument()
})
