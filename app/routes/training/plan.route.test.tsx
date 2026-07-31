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
	currentPhaseIndex: 0,
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
	expect(within(base!).getByRole('textbox', { name: 'Name' })).toHaveValue(
		'Base',
	)
	expect(within(base!).getByRole('spinbutton', { name: 'Weeks' })).toHaveValue(
		2,
	)
	expect(within(base!).getByRole('button', { name: 'Rename' })).toBeEnabled()
	expect(
		within(base!).getByRole('button', { name: 'Save weeks' }),
	).toBeEnabled()
	expect(
		within(base!).getByRole('button', { name: 'Save rhythm' }),
	).toBeEnabled()

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
	expect(
		within(base!).getByRole('button', { name: 'Move later' }),
	).toBeEnabled()
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
			{
				...SEASON.phases[0]!,
				id: 'phase-base-2',
				fromWeekInPlan: 3,
				toWeekInPlan: 4,
			},
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
		screen.getByText(
			/adding a phase never moves the week your plan starts on/i,
		),
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

// ── The preset gallery (#405) ───────────────────────────────────────────────

/** The three shape cards, which are the direct items of the gallery list. */
async function shapeCards() {
	return within(
		await screen.findByRole('list', { name: 'Season shapes' }),
	).getAllByRole('listitem')
}

test('all three shapes are on offer, each with its provenance and an Apply', async () => {
	renderPlan()

	const cards = await shapeCards()
	expect(cards).toHaveLength(3)
	expect(cards[0]).toHaveTextContent('Classic 3:1 linear')
	expect(cards[0]).toHaveTextContent(/Friel’s classic three-weeks-on/)
	expect(cards[1]).toHaveTextContent('Masters 2:1')
	expect(cards[2]).toHaveTextContent('Big base / pyramidal')
	for (const name of [
		'Apply Classic 3:1 linear',
		'Apply Masters 2:1',
		'Apply Big base / pyramidal',
	]) {
		expect(screen.getByRole('button', { name })).toBeEnabled()
	}
})

test('a shape is chosen from a picture of the load profile it lays down', async () => {
	renderPlan()

	const [classic] = await shapeCards()
	// The illustration is the primary way to choose, so it is a picture with a
	// summary rather than a paragraph — and the season's own length and peak are in
	// that summary, drawn from the preset's real configuration.
	const picture = within(classic!).getByRole('img')
	expect(picture).toHaveAccessibleName(/a load profile 18 weeks long/)
	expect(picture).toHaveAccessibleName(/peaks at 171% of it in week 15/)
	// Its phases and total length read beside it.
	expect(classic!).toHaveTextContent('18 weeks')
	expect(classic!).toHaveTextContent('Base 8 · Build 6 · Peak 2 · Taper 2')
})

test('the picture’s numbers are reachable, not only its pixels', async () => {
	renderPlan()

	const [classic] = await shapeCards()
	const table = within(classic!).getByRole('table')
	expect(table).toHaveTextContent(/percentage of your opening week/)
	// Week 4 of a 3:1 base recovers, and the table says so with its figure — the
	// accessible equivalent ADR 0030 requires of a picture carrying numbers.
	const week4 = within(table).getByRole('rowheader', { name: 'Week 4' })
	expect(week4.closest('tr')).toHaveTextContent('Recovery')
	expect(week4.closest('tr')).toHaveTextContent('77%')
})

test('the ramp is stated as a convention and claims nothing about injury', async () => {
	renderPlan()
	await shapeCards()

	// `RAMP_GUARD_MAX`'s rule: a convention may be named as a convention and no
	// more. The 10% rule it descends from has a failed RCT behind it.
	const gallery = screen.getByRole('region', { name: 'Start from a shape' })
	expect(gallery).toHaveTextContent(
		/They all climb by the convention, about 5% a loading week/,
	)
	expect(gallery).toHaveTextContent(/rather than a safety limit/)
	expect(gallery).toHaveTextContent(
		/no volume rule has been shown to prevent injury/,
	)
})

test('the two cuts read as the convention’s, never as the shape’s own', async () => {
	renderPlan()
	await shapeCards()

	// A preset stores neither cut (ADR 0044 §4), so the gallery must not read as
	// though a shape had picked −30% and −50%.
	const gallery = screen.getByRole('region', { name: 'Start from a shape' })
	expect(gallery).toHaveTextContent(
		/Recovery weeks and the taper follow the documented convention too — 30% off your last loading week and 50% by your event/,
	)
	expect(gallery).toHaveTextContent(/No shape chooses them/)
})

test('a card names what makes its shape different from the others', async () => {
	renderPlan()

	const [classic, masters, bigBase] = await shapeCards()
	// The rhythm and the boundary step are what differ; both are read off the
	// preset rather than written beside it, so neither can describe an old shape.
	expect(classic!).toHaveTextContent('Loads 3:1 — every 4th week recovers.')
	expect(masters!).toHaveTextContent('Loads 2:1 — every 3rd week recovers.')
	expect(bigBase!).toHaveTextContent(
		/Volume steps −10% entering Build, deliberately/,
	)
	// And the convention prose is stated once for the gallery, not three times.
	expect(screen.getAllByText(/They all climb by the convention/)).toHaveLength(
		1,
	)
})

test('applying replaces the blocks, and the card says so without blocking', async () => {
	const user = userEvent.setup()
	renderPlan(SEASON, 'blocks', null, () => ({ ok: true }))

	const cards = await shapeCards()
	// Said once for the section and again beside every button, because the finger
	// is at the button.
	expect(
		screen.getByText(/Applying one replaces the blocks you have now/),
	).toBeInTheDocument()
	expect(screen.getAllByText('Replaces your current blocks.')).toHaveLength(3)
	// A warning and never a dialog: this repo warns and never blocks, so the tap
	// submits rather than opening a confirmation in front of a picker.
	await user.click(within(cards[0]!).getByRole('button', { name: /^Apply/ }))
	expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('a card posts the shape it shows, against the plan being read', async () => {
	renderPlan()

	const [, masters] = await shapeCards()
	const form = within(masters!)
		.getByRole('button', { name: /^Apply/ })
		.closest('form')!
	const posted = Object.fromEntries(
		Array.from(form.querySelectorAll('input[type="hidden"]')).map((input) => [
			(input as HTMLInputElement).name,
			(input as HTMLInputElement).value,
		]),
	)
	// A shape is *named*, never posted: the numbers are code constants, so the
	// surface cannot apply a preset the app never shipped.
	expect(posted).toEqual({
		intent: 'apply-preset',
		outlineId: 'outline-1',
		presetKey: 'masters-2-1',
	})
})

test('the gallery says the plan is not stretched to reach the event', async () => {
	renderPlan()

	// Where the plan lands against the Event is one reading, said once at the top
	// of the page; the gallery points at it rather than restating it.
	expect(
		await screen.findByText(
			/ending before or after your event rather than stretching/,
		),
	).toBeInTheDocument()
	expect(
		screen.getByText(/plan ends 6 weeks before your event’s week/i),
	).toBeInTheDocument()
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
