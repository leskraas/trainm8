/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
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
}

function renderPlan(
	season: Season = SEASON,
	tab: 'blocks' | 'weeks' = 'blocks',
	eventQuery: string | null = null,
) {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: (props: Record<string, unknown>) => (
				<PlanRoute {...(props as any)} />
			),
			loader: () => ({ season, tab, eventQuery }),
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
