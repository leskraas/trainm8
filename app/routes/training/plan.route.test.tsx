/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import PlanRoute from './plan.tsx'

type Season = {
	outlineId: string
	eventId: string
	eventName: string
	eventDate: Date
	startWeekKey: string
	timezone: string
	phases: Array<{
		id: string
		name: string
		weeks: number
		rhythm: string
		tapers: boolean
		fromWeekInPlan: number
		toWeekInPlan: number
		fromWeekKey: string
		startsAt: Date
	}>
	tracks: Array<{
		discipline: string
		currency: string
		anchors: Array<{ fromWeekKey: string; value: number }>
	}>
	weeks: Array<{
		weekKey: string
		weekInPlan: number
		phaseIndex: number
		role: string
		startsAt: Date
		targets: Array<{
			discipline: string
			currency: string
			value: number | null
		}>
	}>
	fit: { kind: string; weeks?: number }
	currentPhaseIndex: number | null
}

function week(
	weekInPlan: number,
	overrides: Partial<Season['weeks'][number]> = {},
): Season['weeks'][number] {
	// The plan opens Monday 2030-01-07, so week N opens on the 7Nth.
	const day = String(weekInPlan * 7).padStart(2, '0')
	return {
		weekKey: `2030-01-${day}`,
		weekInPlan,
		phaseIndex: 0,
		role: 'loading',
		startsAt: new Date(`2030-01-${day}T00:00:00.000Z`),
		targets: [{ discipline: 'run', currency: 'km', value: 50 }],
		...overrides,
	}
}

const SEASON: Season = {
	outlineId: 'outline-1',
	eventId: 'event-1',
	eventName: 'Spring Half Marathon',
	eventDate: new Date('2030-03-05T09:00:00Z'),
	startWeekKey: '2030-01-07',
	timezone: 'UTC',
	phases: [
		{
			id: 'phase-base',
			name: 'Base',
			weeks: 2,
			rhythm: '3:1',
			tapers: false,
			fromWeekInPlan: 1,
			toWeekInPlan: 2,
			fromWeekKey: '2030-01-07',
			startsAt: new Date('2030-01-07T00:00:00.000Z'),
		},
		{
			id: 'phase-taper',
			name: 'Taper',
			weeks: 1,
			rhythm: 'none',
			tapers: true,
			fromWeekInPlan: 3,
			toWeekInPlan: 3,
			fromWeekKey: '2030-01-21',
			startsAt: new Date('2030-01-21T00:00:00.000Z'),
		},
	],
	tracks: [
		{
			discipline: 'run',
			currency: 'km',
			anchors: [{ fromWeekKey: '2030-01-07', value: 50 }],
		},
	],
	weeks: [
		week(1),
		week(2, { targets: [{ discipline: 'run', currency: 'km', value: 55 }] }),
		week(3, {
			phaseIndex: 1,
			role: 'taper',
			targets: [{ discipline: 'run', currency: 'km', value: 27.5 }],
		}),
	],
	fit: { kind: 'ends-before', weeks: 6 },
	currentPhaseIndex: 0,
}

function renderPlan(
	season: Season = SEASON,
	tab: 'blocks' | 'weeks' = 'blocks',
	eventQuery: string | null = null,
	action?: (args: { request: Request }) => unknown,
) {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: (props: Record<string, unknown>) => (
				<PlanRoute {...(props as any)} />
			),
			loader: () => ({ season, tab, eventQuery }),
			action: action as any,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(
		<App
			initialEntries={[
				tab === 'blocks' ? '/training/plan' : '/training/plan?tab=weeks',
			]}
		/>,
	)
}

test('the season names its Event, its length and where it ends against it', async () => {
	renderPlan()

	expect(
		await screen.findByRole('link', { name: 'Spring Half Marathon' }),
	).toHaveAttribute('href', '/training/events/event-1')
	expect(screen.getByText(/3 weeks from 7 Jan 2030/)).toBeInTheDocument()
	// The plan is never stretched to reach the Event — the shortfall is said out
	// loud instead (ADR 0044 §3).
	expect(
		screen.getByText(/plan ends 6 weeks before your event’s week/i),
	).toBeInTheDocument()
})

test('the track reads its own currency and its authored anchor', async () => {
	renderPlan()

	expect(await screen.findByText(/authored in km\/wk/)).toBeInTheDocument()
	expect(screen.getByText(/starts at 50\.0 km\/wk/)).toBeInTheDocument()
})

test('the Blocks reading lists the phases in order with their spans and rhythm', async () => {
	renderPlan()

	const phases = within(
		await screen.findByRole('list', { name: 'Phases' }),
	).getAllByRole('listitem')
	expect(phases[0]).toHaveTextContent('Base')
	expect(phases[0]).toHaveTextContent('Weeks 1–2')
	expect(phases[0]).toHaveTextContent('every 4th week recovers')
	expect(phases[1]).toHaveTextContent('Taper')
	expect(phases[1]).toHaveTextContent('Week 3')
	expect(phases[1]).toHaveTextContent('Tapers')
})

test('the Weeks reading shows each week’s role and its derived target', async () => {
	renderPlan(SEASON, 'weeks')

	const weeks = within(
		await screen.findByRole('list', { name: 'Training weeks' }),
	).getAllByRole('listitem')
	expect(weeks[0]).toHaveTextContent('Week 1')
	expect(weeks[0]).toHaveTextContent('7 Jan 2030')
	expect(weeks[0]).toHaveTextContent('Base')
	expect(weeks[0]).toHaveTextContent('Loading')
	expect(weeks[0]).toHaveTextContent('50.0 km/wk')
	expect(weeks[2]).toHaveTextContent('Taper')
	expect(weeks[2]).toHaveTextContent('27.5 km/wk')
})

test('a week a track cannot price reads Unavailable, with the reason once', async () => {
	renderPlan(
		{
			...SEASON,
			tracks: [
				{
					discipline: 'strength',
					currency: 'sets',
					anchors: [{ fromWeekKey: '2030-01-07', value: 18 }],
				},
			],
			weeks: SEASON.weeks.map((entry) => ({
				...entry,
				targets: [{ discipline: 'strength', currency: 'sets', value: null }],
			})),
		},
		'weeks',
	)

	expect(await screen.findAllByText('Unavailable')).toHaveLength(3)
	expect(
		screen.getByText(/weekly sets are not derived yet/i),
	).toBeInTheDocument()
})

test('both readings are reachable, and the current one says so', async () => {
	renderPlan()

	const blocks = await screen.findByRole('link', { name: 'Blocks' })
	const weeks = screen.getByRole('link', { name: 'Weeks' })
	expect(blocks).toHaveAttribute('aria-current', 'page')
	expect(weeks).not.toHaveAttribute('aria-current')
	expect(weeks).toHaveAttribute('href', '/training/plan?tab=weeks')
})

test('switching reading keeps the season being read', async () => {
	// Both params travel together, or tapping Weeks would silently jump from the
	// season the athlete asked for to the nearest one.
	renderPlan(SEASON, 'blocks', 'event-1')

	expect(await screen.findByRole('link', { name: 'Weeks' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1&tab=weeks',
	)
	expect(screen.getByRole('link', { name: 'Blocks' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1',
	)
})

// ── Editing the structure: #402 ──────────────────────────────────────────────

/** The phase cards, which are the *direct* items of the Phases list. */
async function phaseCards() {
	return within(
		await screen.findByRole('list', { name: 'Phases' }),
	).getAllByRole('listitem')
}

test('every phase carries its own edit actions, addressed by its own id', async () => {
	renderPlan()

	const [base, taper] = await phaseCards()
	// Rename, resize and rhythm are separate actions on the row, so fixing one
	// mistyped week count is not a re-submission of the season.
	expect(
		within(base!).getByRole('textbox', { name: 'Name' }),
	).toHaveValue('Base')
	expect(within(base!).getByRole('spinbutton', { name: 'Weeks' })).toHaveValue(2)
	expect(within(base!).getByRole('button', { name: 'Rename' })).toBeEnabled()
	expect(within(base!).getByRole('button', { name: 'Save weeks' })).toBeEnabled()
	expect(within(base!).getByRole('button', { name: 'Save rhythm' })).toBeEnabled()

	// Each row's forms name the phase they act on, so no action can land on a
	// neighbour.
	const phaseIds = Array.from(
		base!.querySelectorAll('input[name="phaseId"]'),
	).map((input) => (input as HTMLInputElement).value)
	expect(new Set(phaseIds)).toEqual(new Set(['phase-base']))
	expect(
		(taper!.querySelector('input[name="phaseId"]') as HTMLInputElement).value,
	).toBe('phase-taper')
})

test('the season’s ends have nothing to swap with, and say so', async () => {
	renderPlan()

	const [base, taper] = await phaseCards()
	expect(
		within(base!).getByRole('button', { name: 'Move earlier' }),
	).toBeDisabled()
	expect(within(base!).getByRole('button', { name: 'Move later' })).toBeEnabled()
	expect(
		within(taper!).getByRole('button', { name: 'Move later' }),
	).toBeDisabled()
})

test('a plan’s only phase cannot be removed — that would be deleting the plan', async () => {
	renderPlan({ ...SEASON, phases: [SEASON.phases[0]!], weeks: [week(1)] })

	const [only] = await phaseCards()
	expect(within(only!).getByRole('button', { name: 'Remove' })).toBeDisabled()
})

test('two phases with the same name do not both read as current — position does', async () => {
	renderPlan({
		...SEASON,
		phases: [
			SEASON.phases[0]!,
			{ ...SEASON.phases[0]!, id: 'phase-base-2', fromWeekInPlan: 3, toWeekInPlan: 4 },
		],
		currentPhaseIndex: 1,
	})

	const cards = await phaseCards()
	expect(within(cards[0]!).queryByText('Current')).not.toBeInTheDocument()
	expect(within(cards[1]!).getByText('Current')).toBeInTheDocument()
	expect(screen.getAllByText('Current')).toHaveLength(1)
})

test('the recovery weeks of the chosen rhythm are marked before saving', async () => {
	renderPlan({
		...SEASON,
		phases: [{ ...SEASON.phases[0]!, weeks: 8 }],
		weeks: [week(1)],
	})

	const [phase] = await phaseCards()
	// 3:1 over 8 weeks recovers in weeks 4 and 8, and it says so before anything is
	// submitted — the rhythm's consequence is not a surprise on the Weeks reading.
	const marks = within(phase!).getByRole('group', { name: 'Week roles' })
	expect(within(marks).getAllByText(/^Week \d+:/)).toHaveLength(8)
	expect(within(marks).getByText('Week 4: Recovery')).toBeInTheDocument()
	expect(within(marks).getByText('Week 8: Recovery')).toBeInTheDocument()
	expect(
		within(phase!).getByText(/Recovery weeks: week 4, week 8/),
	).toBeInTheDocument()
})

test('marking a phase as tapering redraws its weeks before it is saved', async () => {
	const user = userEvent.setup()
	renderPlan({
		...SEASON,
		phases: [{ ...SEASON.phases[0]!, weeks: 4 }],
		weeks: [week(1)],
	})

	const [phase] = await phaseCards()
	await user.click(within(phase!).getByRole('checkbox', { name: /tapers/i }))

	const marks = within(phase!).getByRole('group', { name: 'Week roles' })
	expect(within(marks).getAllByText(/: Taper$/)).toHaveLength(4)
	expect(
		within(phase!).getByText(/steps down toward your event/i),
	).toBeInTheDocument()
})

test('a phase is added at a position, and the copy promises the start week stays', async () => {
	renderPlan()

	expect(
		await screen.findByRole('button', { name: 'Add phase' }),
	).toBeInTheDocument()
	expect(
		screen.getByText(/adding a phase never moves the week your plan starts on/i),
	).toBeInTheDocument()
	// The insert position is named the way the season reads: at the start, or after
	// a phase the athlete can see.
	expect(
		screen.getByRole('combobox', { name: 'Where it goes' }),
	).toBeInTheDocument()
})

test('deleting is confirmed, and the confirmation says what stays', async () => {
	const user = userEvent.setup()
	renderPlan()

	await user.click(await screen.findByRole('button', { name: 'Delete plan' }))

	const dialog = await screen.findByRole('alertdialog')
	expect(dialog).toHaveTextContent(/phases, your training tracks/i)
	// The half an athlete actually worries about: their training history.
	expect(dialog).toHaveTextContent(/does not touch Spring Half Marathon/i)
	expect(dialog).toHaveTextContent(/any session you have already trained/i)
	expect(
		within(dialog).getByRole('button', { name: 'Keep plan' }),
	).toBeInTheDocument()
})

test('a refused edit is said at the top of the reading that asked for it', async () => {
	const user = userEvent.setup()
	renderPlan(SEASON, 'blocks', null, () => ({
		error: 'That phase is no longer part of this plan.',
	}))

	const [base] = await phaseCards()
	await user.click(within(base!).getByRole('button', { name: 'Rename' }))

	expect(await screen.findByRole('alert')).toHaveTextContent(
		'That phase is no longer part of this plan.',
	)
})
