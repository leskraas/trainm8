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
		segments: Array<{
			segmentId: string
			phaseIndex: number
			ramp: number | null
			boundaryStep: number | null
			recoveryCut: number | null
			taperCut: number | null
		}>
		span: { anchor: number; peak: number; peakWeekIndex: number } | null
		total: number | null
		warnings: Array<{
			subject: 'ramp' | 'boundary-step'
			phaseIndex: number
			authored: number
		}>
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

function segment(
	phaseIndex: number,
	overrides: Partial<Season['tracks'][number]['segments'][number]> = {},
): Season['tracks'][number]['segments'][number] {
	return {
		segmentId: `segment-${phaseIndex}`,
		phaseIndex,
		ramp: null,
		boundaryStep: null,
		recoveryCut: null,
		taperCut: null,
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
			segments: [
				segment(0, { segmentId: 'segment-base' }),
				segment(1, { segmentId: 'segment-taper' }),
			],
			span: { anchor: 50, peak: 55, peakWeekIndex: 1 },
			total: 132.5,
			warnings: [],
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

/** The season with one run track carrying `segments`, and no guard warnings. */
function withSegments(segments: Season['tracks'][number]['segments']): Season {
	return {
		...SEASON,
		tracks: [{ ...SEASON.tracks[0]!, segments, warnings: [] }],
	}
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
					// A strength track's segments are dated and float free of the phases
					// (ADR 0047 §6), so it authors nothing on a phase card here.
					segments: [],
					span: null,
					total: null,
					warnings: [],
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

// ── The Season Span headline (ADR 0043) ──────────────────────────────────────

test('a single-track plan reads its Season Span, with the total behind it', async () => {
	renderPlan()

	// Anchor → peak loading week in the track's own currency, never a total as the
	// headline: a total conflates how big a plan is with how long it is.
	expect(await screen.findByText('50.0 km/wk → 55.0 km/wk')).toBeInTheDocument()
	expect(screen.getByText(/peak loading week, week 2/)).toBeInTheDocument()
	expect(screen.getByText(/never added up from sessions/)).toBeInTheDocument()
	// The total is available, and it is secondary.
	expect(screen.getByText(/132\.5 km across the season/)).toBeInTheDocument()
})

test('several tracks read no single span, rather than one fabricated total', async () => {
	renderPlan({
		...SEASON,
		tracks: [
			SEASON.tracks[0]!,
			{
				discipline: 'bike',
				currency: 'hours',
				anchors: [{ fromWeekKey: '2030-01-07', value: 6 }],
				segments: [segment(0, { segmentId: 'bike-base' })],
				span: { anchor: 6, peak: 8, peakWeekIndex: 1 },
				total: 80,
				warnings: [],
			},
		],
	})

	// One span per commensurability group is a later ticket's; no headline is
	// honest, and km added to hours would not be (ADR 0043 §5).
	expect(await screen.findByText(/authored in km\/wk/)).toBeInTheDocument()
	expect(screen.queryByText('50.0 km/wk → 55.0 km/wk')).not.toBeInTheDocument()
})

test('a track no week of which can be priced reads no span at all', async () => {
	renderPlan({
		...SEASON,
		tracks: [
			{
				discipline: 'strength',
				currency: 'sets',
				anchors: [{ fromWeekKey: '2030-01-07', value: 18 }],
				segments: [],
				span: null,
				total: null,
				warnings: [],
			},
		],
	})

	expect(await screen.findByText(/authored in sets\/wk/)).toBeInTheDocument()
	expect(screen.queryByText(/peak loading week/)).not.toBeInTheDocument()
})

// ── Authoring the progression (ADR 0040) ─────────────────────────────────────

/** The Blocks card for a phase, by its heading. */
async function phaseCard(name: string) {
	const phases = within(
		await screen.findByRole('list', { name: 'Phases' }),
	).getAllByRole('listitem')
	const card = phases.find((item) => item.textContent?.startsWith(name))
	if (!card) throw new Error(`No phase card named ${name}`)
	return within(card)
}

test('an authored ramp shows the number the athlete typed', async () => {
	renderPlan(withSegments([segment(0, { ramp: 0.05 }), segment(1)]))

	const base = await phaseCard('Base')
	expect(base.getByLabelText(/Volume ramp/)).toHaveValue(5)
	expect(base.getByText(/\+5% on every loading week/)).toBeInTheDocument()
})

test('an unset ramp is blank and says the block holds level', async () => {
	renderPlan()

	const base = await phaseCard('Base')
	expect(base.getByLabelText(/Volume ramp/)).toHaveValue(null)
	expect(base.getByText(/volume holds level/)).toBeInTheDocument()
})

test('an unset cut reads as the convention, not as the convention’s number', async () => {
	renderPlan()

	const base = await phaseCard('Base')
	// The distinction ADR 0044 §4 requires: the box is empty and the convention is
	// named beside it, so the athlete's plan does not move when the convention does.
	expect(base.getByLabelText(/Recovery week cut/)).toHaveValue(null)
	expect(
		base.getByText(/follows the documented convention, −30%/),
	).toBeInTheDocument()
})

test('an authored cut of the convention’s own size is visibly the athlete’s', async () => {
	renderPlan(withSegments([segment(0, { recoveryCut: 0.3 }), segment(1)]))

	const base = await phaseCard('Base')
	expect(base.getByLabelText(/Recovery week cut/)).toHaveValue(30)
	expect(base.getByText(/Yours: −30%/)).toBeInTheDocument()
	expect(
		base.queryByText(/follows the documented convention/),
	).not.toBeInTheDocument()
})

test('the season’s opening block offers no boundary step, and says why', async () => {
	renderPlan()

	const base = await phaseCard('Base')
	expect(base.queryByLabelText(/Boundary step/)).not.toBeInTheDocument()
	expect(base.getByText(/no boundary to step at/)).toBeInTheDocument()
})

test('a later block authors a boundary step at its opening', async () => {
	renderPlan(withSegments([segment(0), segment(1, { boundaryStep: -0.2 })]))

	const taper = await phaseCard('Taper')
	expect(taper.getByLabelText(/Boundary step/)).toHaveValue(-20)
	expect(taper.getByText(/−20% once, at the opening/)).toBeInTheDocument()
})

test('a taper cut is offered only where the phase tapers', async () => {
	renderPlan()

	const base = await phaseCard('Base')
	const taper = await phaseCard('Taper')
	expect(base.queryByLabelText(/Taper cut/)).not.toBeInTheDocument()
	expect(taper.getByLabelText(/Taper cut/)).toBeInTheDocument()
	// A tapering phase tapers throughout rather than recovering on a rhythm.
	expect(taper.queryByLabelText(/Recovery week cut/)).not.toBeInTheDocument()
})

test('a rate with no field for it still travels, so saving cannot clear it', async () => {
	renderPlan(withSegments([segment(0, { taperCut: 0.4 }), segment(1)]))

	// Base does not taper, so it shows no taper cut field — and must not wipe the
	// stored one on save.
	const base = await phaseCard('Base')
	const hidden = base
		.getByRole('button', { name: /Save progression/ })
		.closest('form')!
		.querySelector('input[type="hidden"][name$="taperCut"]')
	expect(hidden).toHaveValue('40')
})

// ── The ramp guard (ADR 0040 §12–13) ────────────────────────────────────────

test('the guard names the block and the authored number', async () => {
	renderPlan({
		...SEASON,
		tracks: [
			{
				...SEASON.tracks[0]!,
				segments: [segment(0, { ramp: 0.12 }), segment(1)],
				warnings: [{ subject: 'ramp', phaseIndex: 0, authored: 0.12 }],
			},
		],
	})

	const warning = await screen.findByText(/ramps \+12% a loading week/)
	// The warning names the phase, so the athlete knows which card to open.
	expect(warning.closest('li')).toHaveTextContent('Base')
})

test('the guard’s copy is a convention and makes no injury claim', async () => {
	renderPlan({
		...SEASON,
		tracks: [
			{
				...SEASON.tracks[0]!,
				segments: [segment(0, { ramp: 0.12 }), segment(1)],
				warnings: [{ subject: 'ramp', phaseIndex: 0, authored: 0.12 }],
			},
		],
	})

	const copy = await screen.findByText(/The convention is \+8%/)
	// A ramp is a per-week rate and a step happens once, so the sentence must not
	// describe the step with the ramp's "a week".
	expect(copy).toHaveTextContent(
		/per loading week for a ramp, and in one go for a step/,
	)
	expect(copy).toHaveTextContent(/unusual rather than unsafe/)
	// The 10% rule has a failed RCT behind it, so no surface may claim otherwise.
	expect(copy).toHaveTextContent(
		/no volume rule has been shown to prevent injury/,
	)
	// And it never blocks: the ramp is stored as authored.
	expect(copy).toHaveTextContent(/saved exactly as you authored them/)
	expect((await phaseCard('Base')).getByLabelText(/Volume ramp/)).toHaveValue(
		12,
	)
})

test('the guard stays silent on a recovery rebound and on a taper', async () => {
	// A −60% recovery week rebounds +150% and a −70% taper drops hard. Neither is a
	// steep *authored* ramp, so there is nothing on the page about either.
	renderPlan(
		withSegments([
			segment(0, { ramp: 0.05, recoveryCut: 0.6 }),
			segment(1, { ramp: 0.05, taperCut: 0.7 }),
		]),
	)

	await screen.findByRole('list', { name: 'Phases' })
	expect(screen.queryByText(/The convention is up to/)).not.toBeInTheDocument()
})
