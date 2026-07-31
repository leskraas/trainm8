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
	/** `null` means the athlete never set their availability (ADR 0042 §9). */
	trainableWeekdays: number | null
	/**
	 * The **combined** days-against-days fit check, derived at the read boundary and
	 * never in the component (ADR 0047 §4). A week span, because a lifting block
	 * floats free of the phases and no phase names the stretch.
	 */
	availabilityWarnings: Array<{
		fromWeekInPlan: number
		toWeekInPlan: number
		qualitySessions: number
		strengthSessions: number
		trainableWeekdays: number
	}>
	/** Scheduled sessions outside the band their block's Strength Goal derives. */
	bandWarnings: Array<{
		sessionId: string
		scheduledAt: Date
		weekInPlan: number
		goal: 'hypertrophy' | 'maximal-strength' | 'power'
		band: { minPct1RM: number; maxPct1RM: number }
		outsidePct1RMs: number[]
	}>
	/** Which cross-track readings this plan cannot state (ADR 0047 §5). */
	unavailableReadings: Array<
		'hours-calendar-cost' | 'combined-cross-track-load' | 'strength-ctl'
	>
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
		/** The stored row's id — what a **Week Pattern** day's `trackId` joins to. */
		trackId: string
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
			/** The stored **Quality Session Mix**; `[]` is an empty mix, not a gap. */
			mix: Array<{ zone: 3 | 4 | 5; sessionsPerWeek: number }>
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
			trackId: string
			discipline: string
			currency: string
			value: number | null
		}>
	}>
	/** The **Week Patterns** authored on this plan, in position order (#410). */
	patterns: Array<{
		id: string
		name: string
		orderIndex: number
		days: PatternDay[]
	}>
	fit: { kind: string; weeks?: number }
	currentPhaseIndex: number | null
}

/**
 * One pattern day as the loader hands it over: the resolution's own spec, plus the
 * Workout's name. A fixed day arrives **already priced** in its track's currency
 * (`null` where that currency cannot read the prescription); a share day carries a
 * relative weight. Neither carries a volume target or a zone, here or anywhere.
 */
type PatternDay = {
	dayId: string
	weekday: number
	orderInDay: number
	trackId: string
	workout: { id: string; title: string } | null
} & (
	| { kind: 'fixed'; volume: number | null }
	| { kind: 'share'; weight: number }
)

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
		targets: [
			{ trackId: RUN_TRACK, discipline: 'run', currency: 'km', value: 50 },
		],
		...overrides,
	}
}

/** The run track every fixture hangs off, by id — what a pattern day joins on. */
const RUN_TRACK = 'track-run'

/** A share day: a relative weight, and no quantity of any kind. */
function shareDay(
	weekday: number,
	weight: number,
	overrides: Partial<PatternDay> = {},
): PatternDay {
	return {
		dayId: `share-${weekday}`,
		weekday,
		orderInDay: 0,
		trackId: RUN_TRACK,
		kind: 'share',
		weight,
		workout: null,
		...overrides,
	} as PatternDay
}

/** A fixed day: a Workout, priced off its own prescription. */
function fixedDay(
	weekday: number,
	volume: number | null,
	overrides: Partial<PatternDay> = {},
): PatternDay {
	return {
		dayId: `fixed-${weekday}`,
		weekday,
		orderInDay: 0,
		trackId: RUN_TRACK,
		kind: 'fixed',
		volume,
		workout: { id: 'workout-1', title: '5×1000m Z4' },
		...overrides,
	} as PatternDay
}

function pattern(
	days: PatternDay[],
	overrides: Partial<Season['patterns'][number]> = {},
): Season['patterns'][number] {
	return {
		id: 'pattern-1',
		name: 'Weekday base',
		orderIndex: 0,
		days,
		...overrides,
	}
}

/** The season with one pattern on it, everything else unchanged. */
function withPatterns(patterns: Season['patterns']): Season {
	return { ...SEASON, patterns }
}

/** The Workouts the picker offers — the athlete's own, newest first. */
const WORKOUTS = [
	{ id: 'workout-1', title: '5×1000m Z4', discipline: 'run' },
	{ id: 'workout-2', title: 'Easy 45 min', discipline: 'run' },
]

/**
 * A Workout of a discipline the plan's only track does **not** author. Newest first
 * means it would be pre-selected on a run-track day, which is exactly the day that
 * would then count bike duration as run volume (ADR 0041, ADR 0043 §5).
 */
const BIKE_WORKOUT = {
	id: 'workout-bike',
	title: 'Endurance ride',
	discipline: 'bike',
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
		mix: [],
		...overrides,
	}
}

/** A mix as the reading carries it: ascending by zone, zeros never stored. */
function mix(
	counts: Partial<Record<3 | 4 | 5, number>>,
): Season['tracks'][number]['segments'][number]['mix'] {
	return ([3, 4, 5] as const).flatMap((zone) => {
		const sessionsPerWeek = counts[zone]
		return sessionsPerWeek == null ? [] : [{ zone, sessionsPerWeek }]
	})
}

/**
 * The strength tracks as the loader hands them over: a track and the dated blocks
 * authored on it (#409, ADR 0047 §6). Separate from `season.tracks` because a
 * `SegmentReading` is the *endurance* reading — a phase and a mix, neither of which
 * a dated block has.
 */
type StrengthTracks = Array<{
	trackId: string
	discipline: string
	currency: string
	segments: Array<{
		segmentId: string
		startWeekKey: string
		startWeekInPlan: number | null
		weeks: number
		ramp: number | null
		boundaryStep: number | null
		goal: 'hypertrophy' | 'maximal-strength' | 'power'
		sessionsPerWeek: number
		deloadCut: number | null
		deloadWeeks: number | null
	}>
}>

const STRENGTH_TRACK = 'track-strength'

/** One lifting block, at defaults every field of which is deliberately unset. */
function block(
	overrides: Partial<StrengthTracks[number]['segments'][number]> = {},
): StrengthTracks[number]['segments'][number] {
	return {
		segmentId: 'block-1',
		startWeekKey: '2030-01-07',
		startWeekInPlan: 1,
		weeks: 2,
		ramp: null,
		boundaryStep: null,
		goal: 'hypertrophy',
		sessionsPerWeek: 3,
		// Null: the documented convention, deliberately *not* an authored 0.5.
		deloadCut: null,
		deloadWeeks: 1,
		...overrides,
	}
}

function strengthTrack(
	segments: StrengthTracks[number]['segments'],
): StrengthTracks {
	return [
		{
			trackId: STRENGTH_TRACK,
			discipline: 'strength',
			currency: 'sets',
			segments,
		},
	]
}

const SEASON: Season = {
	outlineId: 'outline-1',
	eventId: 'event-1',
	eventName: 'Spring Half Marathon',
	eventDate: new Date('2030-03-05T09:00:00Z'),
	startWeekKey: '2030-01-07',
	timezone: 'UTC',
	// Never set, which is the state that yields no availability warning at all.
	trainableWeekdays: null,
	availabilityWarnings: [],
	bandWarnings: [],
	// Empty for a plan with no strength track — the three are owed only where one is.
	unavailableReadings: [],
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
			trackId: RUN_TRACK,
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
		week(2, {
			targets: [
				{ trackId: RUN_TRACK, discipline: 'run', currency: 'km', value: 55 },
			],
		}),
		week(3, {
			phaseIndex: 1,
			role: 'taper',
			targets: [
				{ trackId: RUN_TRACK, discipline: 'run', currency: 'km', value: 27.5 },
			],
		}),
	],
	// No pattern by default: the Weeks reading has to read honestly for an athlete
	// who has never authored one.
	patterns: [],
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
	/**
	 * What the pattern reading needs on top of the season: the week `?week=`
	 * resolved to — the plan's first week unless the athlete asked for another —
	 * the Workouts a fixed day can prescribe, and the strength track's dated blocks,
	 * which the loader reads separately because the season reading's `segments` is
	 * the endurance one (ADR 0047 §6).
	 */
	extra: {
		week?: string | null
		workouts?: typeof WORKOUTS
		strengthTracks?: StrengthTracks
	} = {},
) {
	const week =
		extra.week === undefined ? (season.weeks[0]?.weekKey ?? null) : extra.week
	const workouts = extra.workouts ?? WORKOUTS
	const strengthTracks = extra.strengthTracks ?? []
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: (props: Record<string, unknown>) => (
				<PlanRoute {...(props as any)} />
			),
			loader: () => ({
				season,
				tab,
				eventQuery,
				week,
				workouts,
				strengthTracks,
			}),
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
					trackId: 'track-strength',
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
				targets: [
					{
						trackId: 'track-strength',
						discipline: 'strength',
						currency: 'sets',
						value: null,
					},
				],
			})),
		},
		'weeks',
	)

	expect(await screen.findAllByText('Unavailable')).toHaveLength(3)
	// Both walks price their weeks since ADR 0047 §1, so the only remaining reason a
	// whole column is null is that no anchor covers the plan. The old reason — "a
	// strength track's weekly sets are not derived yet" — is false and is gone.
	expect(
		screen.getByText(/no Season Anchor covers this plan yet/i),
	).toBeInTheDocument()
	expect(screen.queryByText(/not derived yet/i)).not.toBeInTheDocument()
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
				trackId: 'track-bike',
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
				trackId: 'track-strength',
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

// ── The Quality Session Mix and its derived readings (ADR 0042 §3–§7) ────────

test('the mix offers one field per quality zone, and no fourth kind of work', async () => {
	renderPlan()

	const base = await phaseCard('Base')
	expect(base.getByLabelText(/Zone 3 tempo/)).toBeInTheDocument()
	expect(base.getByLabelText(/Zone 4 threshold/)).toBeInTheDocument()
	expect(base.getByLabelText(/Zone 5 VO₂ max/)).toBeInTheDocument()
	// Exactly three, because the fields are generated from `QUALITY_ZONES`.
	expect(base.getAllByLabelText(/^Zone \d/)).toHaveLength(3)
	// Neuromuscular work has no position on the metabolic zone axis, so there is
	// nowhere for a speed field to appear rather than a field kept hidden
	// (ADR 0042 §7) — and zones 1–2 are not quality sessions (§3).
	expect(base.queryByLabelText(/speed/i)).not.toBeInTheDocument()
	expect(base.queryByLabelText(/neuromuscular/i)).not.toBeInTheDocument()
	expect(base.queryByLabelText(/sprint/i)).not.toBeInTheDocument()
	expect(base.queryByLabelText(/Zone 1/)).not.toBeInTheDocument()
	expect(base.queryByLabelText(/Zone 2/)).not.toBeInTheDocument()
})

test('a zone in the mix shows its count, and one that is not shows blank', async () => {
	renderPlan(withSegments([segment(0, { mix: mix({ 4: 2 }) }), segment(1)]))

	const base = await phaseCard('Base')
	expect(base.getByLabelText(/Zone 4 threshold/)).toHaveValue(2)
	// Blank rather than 0: the row does not exist, and the help text says a blank box
	// leaves the zone out — the opposite of the ramp's "follow the convention" blank.
	expect(base.getByLabelText(/Zone 3 tempo/)).toHaveValue(null)
	expect(base.getByText(/leaves a zone out of the mix/i)).toBeInTheDocument()
	expect(
		base.getByText(/no convention for a mix to fall back on/i),
	).toBeInTheDocument()
})

test('the emphasis label and the count are read off the mix', async () => {
	renderPlan(
		withSegments([segment(0, { mix: mix({ 4: 2, 5: 1 }) }), segment(1)]),
	)

	const base = await phaseCard('Base')
	// Kind *and* dose, every zone in the mix, ascending (ADR 0042 §5).
	expect(base.getByText('2× threshold + 1× VO₂ max')).toBeInTheDocument()
	expect(base.getByText('Intensity emphasis, derived')).toBeInTheDocument()
	const count = base.getByText('Quality sessions a week, derived')
	expect(count.nextElementSibling).toHaveTextContent('3')
})

test('an empty mix reads as no quality sessions, never as unknown', async () => {
	renderPlan()

	const base = await phaseCard('Base')
	// The positive statement ADR 0042 §6 makes — not a dash, not "unknown".
	expect(base.getByText('No quality sessions')).toBeInTheDocument()
	expect(base.queryByText(/unknown/i)).not.toBeInTheDocument()
	expect(
		base.getByText('Quality sessions a week, derived').nextElementSibling,
	).toHaveTextContent('0')
})

test('neither derived reading is a control the athlete could type into', async () => {
	renderPlan(
		withSegments([segment(0, { mix: mix({ 4: 2, 5: 1 }) }), segment(1)]),
	)

	const base = await phaseCard('Base')
	// Both are description-list values, and there is no field for either: nobody can
	// name a block for work it does not contain, or hand-set a sum (ADR 0042 §4–§5).
	expect(base.getByText('2× threshold + 1× VO₂ max').tagName).toBe('DD')
	expect(base.queryByLabelText(/emphasis/i)).not.toBeInTheDocument()
	expect(
		base.queryByLabelText(/Quality sessions a week/i),
	).not.toBeInTheDocument()
	expect(base.getByText(/read off the mix you saved/i)).toBeInTheDocument()
})

test('a week span that outruns the trainable weekdays is noted, and blocks nothing', async () => {
	renderPlan({
		...withSegments([segment(0, { mix: mix({ 4: 2, 5: 2 }) }), segment(1)]),
		trainableWeekdays: 3,
		// Read off the season, never re-derived in the component: the check is the
		// combined one across both tracks (ADR 0047 §4).
		availabilityWarnings: [
			{
				fromWeekInPlan: 1,
				toWeekInPlan: 2,
				qualitySessions: 4,
				strengthSessions: 0,
				trainableWeekdays: 3,
			},
		],
	})

	const notice = await screen.findByText(
		/ask for 4 quality sessions a week, and you have 3 trainable weekdays/,
	)
	// The locator is a **week span**, not a phase name: a lifting block floats free
	// of the phases, so no phase names the stretch a combined warning is about.
	expect(notice).toHaveTextContent('Weeks 1–2')
	// Days against days, no safety claim, and saved as authored (ADR 0040 §13).
	const copy = screen.getByText(/That is days against days/)
	expect(copy).toHaveTextContent(/records which weekdays you train/)
	expect(copy).toHaveTextContent(/saved exactly as you authored it/)
	expect(copy.textContent).not.toMatch(/injur|unsafe|risk|overtrain/i)
	// And the mix is on the card exactly as authored.
	expect((await phaseCard('Base')).getByLabelText(/Zone 4/)).toHaveValue(2)
})

test('the fit notice counts lifting sessions beside quality ones', async () => {
	renderPlan({
		...SEASON,
		trainableWeekdays: 4,
		availabilityWarnings: [
			{
				fromWeekInPlan: 3,
				toWeekInPlan: 3,
				qualitySessions: 3,
				strengthSessions: 3,
				trainableWeekdays: 4,
			},
		],
	})

	// Both halves named, and a one-week span collapses to a single week.
	const notice = await screen.findByText(
		/asks for 3 quality sessions and 3 lifting sessions a week, and you have 4 trainable weekdays/,
	)
	expect(notice).toHaveTextContent('Week 3')
	expect(notice.textContent).not.toMatch(/Weeks 3–3/)
})

test('availability the athlete never set produces no notice at all', async () => {
	renderPlan(
		withSegments([segment(0, { mix: mix({ 4: 3, 5: 3 }) }), segment(1)]),
	)

	await screen.findByRole('list', { name: 'Phases' })
	// Six quality sessions and no comparison to make: the app does not guess at an
	// availability the athlete never stated, so the reading arrives empty.
	expect(screen.queryByText(/trainable weekday/)).not.toBeInTheDocument()
	expect(screen.queryByText(/days against days/)).not.toBeInTheDocument()
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

// ── The Week Pattern and its preview (#410) ─────────────────────────────────

/**
 * The pattern the preview tests read: a Tuesday share, a Wednesday fixed session
 * of 8 km and a Saturday long run weighted 2.5× — the shape ADR 0044 §7 draws.
 */
const WEEKDAY_PATTERN = pattern([
	shareDay(1, 1),
	fixedDay(2, 8),
	shareDay(5, 2.5),
])

/** The pattern cards: the *direct* children of the patterns list, since each one
 *  contains a nested list of its own days. */
async function patternCards() {
	const list = await screen.findByRole('list', { name: 'Week patterns' })
	return Array.from(list.children) as HTMLElement[]
}

/** One pattern's day rows, in weekday order. */
async function dayRows(name = 'Weekday base days') {
	return within(await screen.findByRole('list', { name })).getAllByRole(
		'listitem',
	)
}

test('the pattern lists its days Monday-first, each with its track and its kind', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')

	const rows = await dayRows()
	expect(rows).toHaveLength(3)
	// Monday-first, matching the Training Week rather than the Sunday-first
	// calendar index the profile stores.
	expect(rows[0]).toHaveTextContent('Tuesday')
	expect(rows[0]).toHaveTextContent('Run')
	expect(rows[0]).toHaveTextContent('Share, weight 1')
	expect(rows[1]).toHaveTextContent('Wednesday')
	expect(rows[1]).toHaveTextContent('5×1000m Z4')
	expect(rows[1]).toHaveTextContent('prescribed as authored, never scaled')
	expect(rows[2]).toHaveTextContent('Saturday')
})

test('each day says what it resolves to against the chosen week’s real target', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')

	const rows = await dayRows()
	// Week 1 derives 50 km: the fixed 8 km comes off first, and the two shares
	// divide the 42 that are left by weight — 1 against 2.5.
	expect(rows[0]).toHaveTextContent('12.0 km')
	expect(rows[0]).toHaveTextContent('29% of what is left')
	expect(rows[1]).toHaveTextContent('8.0 km')
	expect(rows[2]).toHaveTextContent('30.0 km')
	expect(rows[2]).toHaveTextContent('71% of what is left')
})

test('the totals say the week’s target, the fixed volume and the remainder', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')

	// The order is the arithmetic's: fixed volume is subtracted before the shares
	// divide what is left.
	const target = await screen.findByText('Week target')
	expect(target.nextElementSibling).toHaveTextContent('50.0 km/wk')
	expect(
		screen.getByText('Prescribed by fixed days').nextElementSibling,
	).toHaveTextContent('8.0 km')
	expect(
		screen.getByText('Left for the share days').nextElementSibling,
	).toHaveTextContent('42.0 km')
})

test('a different week resolves to different volumes, from that week’s own target', async () => {
	// Week 2 derives 55 km. Nothing about the pattern changed — the week did.
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, undefined, {
		week: '2030-01-14',
	})

	const rows = await dayRows()
	expect(rows[0]).toHaveTextContent('13.4 km')
	expect(rows[2]).toHaveTextContent('33.6 km')
	// The fixed session is the same session in a bigger week: prescribed, not scaled.
	expect(rows[1]).toHaveTextContent('8.0 km')
	expect(
		screen.getByText('Left for the share days').nextElementSibling,
	).toHaveTextContent('47.0 km')
})

test('a week with no derived target reads Unavailable with its reason, never 0', async () => {
	renderPlan(
		{
			...withPatterns([WEEKDAY_PATTERN]),
			weeks: SEASON.weeks.map((entry) => ({
				...entry,
				targets: [
					{
						trackId: RUN_TRACK,
						discipline: 'run',
						currency: 'km',
						value: null,
					},
				],
			})),
		},
		'weeks',
	)

	const rows = await dayRows()
	expect(within(rows[0]!).getByText('Unavailable')).toBeInTheDocument()
	expect(rows[0]).toHaveTextContent(/Week has no derived run target/)
	expect(rows[0]).not.toHaveTextContent('0.0 km')
	// The fixed day still reads: its volume is prescribed by the session itself, so
	// it does not depend on the week having a target at all.
	expect(rows[1]).toHaveTextContent('8.0 km')
	expect(
		screen.getByText('Left for the share days').nextElementSibling,
	).toHaveTextContent('Unavailable')
})

test('a prescribed session the currency cannot read costs the shares their number', async () => {
	renderPlan(
		withPatterns([
			pattern([shareDay(1, 1), fixedDay(2, null), shareDay(5, 2.5)]),
		]),
		'weeks',
	)

	// Honest about *why* there is no number, and it does not guess a price.
	const notice = await screen.findByText(/One fixed day cannot be read in km/)
	expect(notice).toHaveTextContent(/this week cannot be divided/)
	expect(notice).toHaveTextContent(/a number the app made up/)
	const rows = await dayRows()
	expect(within(rows[0]!).getByText('Unavailable')).toBeInTheDocument()
	expect(rows[0]).toHaveTextContent(
		/A prescribed session in this pattern cannot be read in km/,
	)
	expect(rows[1]).toHaveTextContent(/cannot be read in km/)
})

test('fixed days over the week’s target warn, and nothing claims to correct them', async () => {
	renderPlan(
		withPatterns([pattern([fixedDay(2, 55), shareDay(5, 1)])]),
		'weeks',
	)

	const notice = await screen.findByText(/Your fixed run sessions prescribe/)
	expect(notice).toHaveTextContent('55.0 km')
	expect(notice).toHaveTextContent('50.0 km/wk')
	// The athlete prescribed those intervals: the warning reports and never
	// corrects, and no copy may suggest the app changed a session.
	expect(notice).toHaveTextContent(/stay exactly as you authored them/)
	expect(notice).toHaveTextContent(/nothing here shortens a session you wrote/)
	expect(notice.textContent).not.toMatch(
		/shrunk|shortened|reduced|scaled down|adjusted|capped/i,
	)
	expect(notice.textContent).not.toMatch(/injur|unsafe|risk|overtrain/i)
	// And there is genuinely nothing left for the share day — a resolved 0, said as
	// a number, not as an Unavailable.
	expect((await dayRows())[1]).toHaveTextContent('0.0 km')
})

test('a pattern at either end of the order has nothing to swap with', async () => {
	renderPlan(
		withPatterns([
			WEEKDAY_PATTERN,
			pattern([shareDay(1, 1)], { id: 'pattern-2', name: 'Race week' }),
		]),
		'weeks',
	)

	const [first, second] = await patternCards()
	expect(
		within(first!).getByRole('button', { name: 'Move earlier' }),
	).toBeDisabled()
	expect(
		within(first!).getByRole('button', { name: 'Move later' }),
	).toBeEnabled()
	expect(
		within(second!).getByRole('button', { name: 'Move later' }),
	).toBeDisabled()
})

test('two sessions on one weekday are orderable, and the ends are disabled', async () => {
	renderPlan(
		withPatterns([
			pattern([
				shareDay(1, 1, { dayId: 'tue-am' }),
				fixedDay(1, 8, { dayId: 'tue-pm', orderInDay: 1 }),
				shareDay(5, 2.5),
			]),
		]),
		'weeks',
	)

	const rows = await dayRows()
	expect(
		within(rows[0]!).getByRole('button', { name: 'Earlier in the day' }),
	).toBeDisabled()
	expect(
		within(rows[0]!).getByRole('button', { name: 'Later in the day' }),
	).toBeEnabled()
	expect(
		within(rows[1]!).getByRole('button', { name: 'Later in the day' }),
	).toBeDisabled()
	// Saturday holds one session, so there is nothing to order and no control for
	// it — a weekday's order is scoped to that weekday.
	expect(
		within(rows[2]!).queryByRole('button', { name: 'Earlier in the day' }),
	).not.toBeInTheDocument()
})

test('deleting a pattern is confirmed, and the confirmation says what stays', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')

	await user.click(
		await screen.findByRole('button', { name: 'Delete pattern' }),
	)

	const dialog = await screen.findByRole('alertdialog')
	expect(dialog).toHaveTextContent(/removes Weekday base and its 3 days/i)
	// The half an athlete worries about — and here there is a second half: nothing
	// has been scheduled from a pattern at all.
	expect(dialog).toHaveTextContent(/every session you have already trained/i)
	expect(dialog).toHaveTextContent(/nothing on your calendar came from this/i)
	expect(
		within(dialog).getByRole('button', { name: 'Keep pattern' }),
	).toBeInTheDocument()
})

test('deleting a pattern with no days yet reads as a sentence, never “its 0 days”', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([pattern([])]), 'weeks')

	await user.click(
		await screen.findByRole('button', { name: 'Delete pattern' }),
	)

	// A named pattern nobody has filled in yet is an ordinary state, and it reads
	// as one.
	const dialog = await screen.findByRole('alertdialog')
	expect(dialog).toHaveTextContent(
		/removes Weekday base, which has no days in it yet/i,
	)
	expect(dialog).not.toHaveTextContent('0 days')
})

test('a day is added by weekday, track and kind — and by no volume or zone', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')

	expect(
		await screen.findByRole('combobox', { name: 'Weekday' }),
	).toBeInTheDocument()
	expect(
		screen.getByRole('combobox', { name: 'Training track' }),
	).toBeInTheDocument()
	expect(
		screen.getByRole('combobox', { name: 'What kind of day' }),
	).toBeInTheDocument()
	// A pattern day carries no absolute volume and no zone: there is nowhere for
	// either to be typed rather than a field that is validated away.
	expect(screen.queryByLabelText(/volume/i)).not.toBeInTheDocument()
	expect(screen.queryByLabelText(/zone/i)).not.toBeInTheDocument()
	expect(screen.queryByLabelText(/distance/i)).not.toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Add day' })).toBeEnabled()
})

test('choosing a share day asks for its weight, and a fixed one for its workout', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')

	// A fixed day prescribes a Workout and takes no weight.
	expect(
		await screen.findByRole('combobox', { name: 'Workout' }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('spinbutton', { name: 'Relative weight' }),
	).not.toBeInTheDocument()

	await user.click(screen.getByRole('combobox', { name: 'What kind of day' }))
	const listbox = await screen.findByRole('listbox')
	await user.click(
		within(listbox).getByRole('option', { name: /Share of the week/ }),
	)

	expect(
		await screen.findByRole('spinbutton', { name: 'Relative weight' }),
	).toHaveValue(1)
	// The Workout becomes an optional *shape* rather than a prescription.
	expect(
		screen.getByRole('combobox', { name: 'Shape (optional)' }),
	).toBeInTheDocument()
})

test('a share day opens with no shape, and never inherits the fixed day’s workout', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')

	// A fixed day *is* its Workout, so pre-selecting the newest is right there.
	expect(
		await screen.findByRole('combobox', { name: 'Workout' }),
	).toHaveTextContent('5×1000m Z4')

	await user.click(screen.getByRole('combobox', { name: 'What kind of day' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Share of the week',
		}),
	)

	// A shape is optional, so it opens unchosen: adding a share day and touching
	// nothing must not store it "shaped on" whichever Workout happened to be newest.
	expect(
		await screen.findByRole('combobox', { name: 'Shape (optional)' }),
	).toHaveTextContent('No shape — volume only')
	expect(document.querySelector('input[name="workoutId"]')).toHaveValue('')
})

test('the kind selector names the kind, and the rule is said under the field', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')

	// Short enough not to clip in a 316 px trigger at the 390 px reference (§2.5)…
	const kind = await screen.findByRole('combobox', { name: 'What kind of day' })
	expect(kind).toHaveTextContent('Fixed session')

	// …with the rule the choice carries stated in full under the field.
	expect(
		screen.getByText(/never scaled — the same intervals in a big week/i),
	).toBeInTheDocument()

	await user.click(kind)
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Share of the week',
		}),
	)

	expect(
		await screen.findByText(/normalised across the week/i),
	).toBeInTheDocument()
})

test('the workout picker offers only the chosen track’s own discipline', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, undefined, {
		workouts: [BIKE_WORKOUT, ...WORKOUTS],
	})

	await user.click(await screen.findByRole('combobox', { name: 'Workout' }))
	const options = within(await screen.findByRole('listbox')).getAllByRole(
		'option',
	)

	// The plan's only track is run: a bike session here would fund a run week with
	// bike duration, so it is not on offer at all.
	expect(options.map((option) => option.textContent)).toEqual([
		'5×1000m Z4 · Run',
		'Easy 45 min · Run',
	])
})

test('a track with no workout of its own discipline offers no fixed day, and says why', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, undefined, {
		workouts: [BIKE_WORKOUT],
	})

	// No dead picker and no fixed kind: the same posture as having no Workouts at
	// all, because from this track's side there are none.
	expect(
		screen.queryByRole('combobox', { name: 'Workout' }),
	).not.toBeInTheDocument()
	expect(
		await screen.findByText(/you have no run workout yet/i),
	).toBeInTheDocument()
	expect(
		screen.getByRole('link', { name: 'author a session' }),
	).toHaveAttribute('href', '/training/sessions/new')

	await user.click(screen.getByRole('combobox', { name: 'What kind of day' }))
	const options = within(await screen.findByRole('listbox')).getAllByRole(
		'option',
	)
	expect(options.map((option) => option.textContent)).toEqual([
		'Share of the week',
	])
})

test('an athlete with no workouts is told why, and pointed at authoring one', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, undefined, {
		workouts: [],
	})

	// No dead picker: the reason and the way out, and a share day still available.
	expect(
		await screen.findByRole('link', { name: 'author a session' }),
	).toHaveAttribute('href', '/training/sessions/new')
	expect(screen.getByText(/you have none yet/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('combobox', { name: 'Workout' }),
	).not.toBeInTheDocument()
	expect(
		screen.getByRole('spinbutton', { name: 'Relative weight' }),
	).toBeInTheDocument()
})

test('the chosen week is URL state, and travels with the season being read', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', 'event-1', undefined, {
		week: '2030-01-14',
	})

	// Both other params travel with it, so switching reading keeps the week the
	// pattern is being read against.
	expect(await screen.findByRole('link', { name: 'Blocks' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1&week=2030-01-14',
	)
	expect(screen.getByRole('link', { name: 'Weeks' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1&tab=weeks&week=2030-01-14',
	)
	// The chooser is a GET form, so a week can be linked and reloaded into.
	const chooser = screen.getByRole('combobox', { name: 'Read against' })
	expect(chooser.closest('form')).toHaveAttribute('method', 'get')
	expect(
		screen.getByRole('button', { name: 'Read this week' }),
	).toBeInTheDocument()
})

test('the plan’s first week needs no param, exactly like the default reading', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', 'event-1')

	expect(await screen.findByRole('link', { name: 'Blocks' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1',
	)
})

test('an athlete with no pattern reads that, and is offered one', async () => {
	renderPlan(SEASON, 'weeks')

	expect(await screen.findByText(/No pattern yet/)).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Add pattern' })).toBeEnabled()
	// And no preview figures at all, rather than a preview of nothing.
	expect(screen.queryByText('Left for the share days')).not.toBeInTheDocument()
})

test('a pattern with no share day says what nothing absorbs', async () => {
	renderPlan(withPatterns([pattern([fixedDay(2, 8)])]), 'weeks')

	expect(
		(await screen.findByText('Taken by no day')).nextElementSibling,
	).toHaveTextContent('42.0 km')
	// A pattern does not have to spend the whole week, so this states the fact and
	// asks for nothing.
	expect(
		screen.getByText(/nothing absorbs the rest of the week/i),
	).toBeInTheDocument()
})

test('a refused pattern edit is said at the top of the reading that asked for it', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, () => ({
		error: 'That week pattern is no longer part of this plan.',
	}))

	await user.click(await screen.findByRole('button', { name: 'Rename' }))

	expect(await screen.findByRole('alert')).toHaveTextContent(
		'That week pattern is no longer part of this plan.',
	)
})

// ── The strength Training Track's dated blocks (#409, ADR 0047) ─────────────

/** The lifting cards, which are the direct items of the Lifting blocks list. */
async function blockCards() {
	return within(
		await screen.findByRole('list', { name: 'Lifting blocks' }),
	).getAllByRole('listitem')
}

/** A season carrying a strength track beside the run one, weeks priced in sets. */
function hybridSeason(overrides: Partial<Season> = {}): Season {
	return {
		...SEASON,
		tracks: [
			SEASON.tracks[0]!,
			{
				trackId: STRENGTH_TRACK,
				discipline: 'strength',
				currency: 'sets',
				anchors: [{ fromWeekKey: '2030-01-07', value: 12 }],
				// A dated block authors nothing on a phase card, so this stays empty.
				segments: [],
				span: { anchor: 12, peak: 21, peakWeekIndex: 1 },
				total: 45,
				warnings: [],
			},
		],
		weeks: SEASON.weeks.map((entry, index) => ({
			...entry,
			targets: [
				...entry.targets,
				{
					trackId: STRENGTH_TRACK,
					discipline: 'strength',
					currency: 'sets',
					// Weeks 1–2 lift; week 3 falls in a gap and derives 0.
					value: index === 2 ? 0 : 12 + index,
				},
			],
		})),
		...overrides,
	}
}

test('a lifting block is laid out along the plan’s weeks, not on a phase', async () => {
	renderPlan(hybridSeason(), 'blocks', null, undefined, {
		strengthTracks: strengthTrack([block()]),
	})

	const [first] = await blockCards()
	expect(first).toHaveTextContent('Weeks 1–2')
	expect(first).toHaveTextContent('Hypertrophy')
	expect(first).toHaveTextContent('3× a week')
	// The whole block is one save: the window moves and the rates are rewritten
	// together, because a moved block and a resized one are the same action.
	expect(
		within(first!).getByRole('button', { name: 'Save block' }),
	).toBeEnabled()
	expect(
		within(first!).getByRole('button', { name: 'Remove block' }),
	).toBeEnabled()
	// And it sits outside the Phases list: a dated block has no phase card.
	expect(
		within(await screen.findByRole('list', { name: 'Phases' })).queryByText(
			/Lifting/,
		),
	).not.toBeInTheDocument()
})

test('the section says what `sets` means and attaches no citable range to it', async () => {
	renderPlan(hybridSeason(), 'blocks', null, undefined, {
		strengthTracks: strengthTrack([block()]),
	})

	const copy = await screen.findByText(/planned in/i)
	expect(copy).toHaveTextContent(/total working sets/)
	expect(copy).toHaveTextContent(/across your whole body/)
	expect(copy).toHaveTextContent(/no published number to hold that against/)
	// Nobody publishes a systemic weekly set count, so no range may be presented as
	// though somebody did — not ACSM's ≥10, not RP's per-muscle 10–20.
	expect(copy.textContent).not.toMatch(/\d+\s*[–-]\s*\d+\s*sets/)
	expect(copy.textContent).not.toMatch(/≥\s*\d+\s*sets/)
})

test('the derived band moves with the goal, and there is no input for it', async () => {
	renderPlan(hybridSeason(), 'blocks', null, undefined, {
		strengthTracks: strengthTrack([block({ goal: 'maximal-strength' })]),
	})

	const [card] = await blockCards()
	const band = within(card!)
	expect(
		band.getByText('Load band, derived').nextElementSibling,
	).toHaveTextContent('80–100% 1RM')
	expect(band.getByText('Reps, derived').nextElementSibling).toHaveTextContent(
		'1–6 reps',
	)
	// Derived and unauthorable: there is no control for either, which is what makes
	// `30 sets/wk at 90% 1RM` unauthorable rather than merely guarded (ADR 0047 §3).
	expect(band.queryByLabelText(/1RM/i)).not.toBeInTheDocument()
	expect(band.queryByLabelText(/band/i)).not.toBeInTheDocument()
	expect(band.queryByLabelText(/reps/i)).not.toBeInTheDocument()
	expect(band.getByText(/nothing to type/i)).toBeInTheDocument()
})

test('nothing on a lifting block derives sets a week from the goal', async () => {
	renderPlan(hybridSeason(), 'blocks', null, undefined, {
		strengthTracks: strengthTrack([block({ goal: 'hypertrophy' })]),
	})

	const [card] = await blockCards()
	// ACSM states hypertrophy as ≥10 sets/wk, and reading that off the goal would
	// give the plan two sources for one number (ADR 0047 §1/§3).
	expect(card!.textContent).not.toMatch(/\d+\s*sets\/wk/)
	expect(within(card!).getByText(/not read off the goal/i)).toBeInTheDocument()
})

test('an unset deload cut reads as the convention, and an authored one as theirs', async () => {
	renderPlan(hybridSeason(), 'blocks', null, undefined, {
		strengthTracks: strengthTrack([
			block({ segmentId: 'block-unset', deloadCut: null }),
			block({
				segmentId: 'block-authored',
				startWeekKey: '2030-01-21',
				startWeekInPlan: 3,
				weeks: 1,
				deloadCut: 0.5,
			}),
		]),
	})

	const [unset, authored] = await blockCards()
	// Same depth, different status — and the unset one is blank rather than
	// carrying the convention's own number (ADR 0044 §4).
	expect(within(unset!).getByLabelText(/Deload cut/)).toHaveValue(null)
	expect(
		within(unset!).getByText(/follows the documented convention/),
	).toHaveTextContent('−50%')
	expect(within(authored!).getByLabelText(/Deload cut/)).toHaveValue(50)
	expect(within(authored!).getByText(/^Yours: −50%/)).toBeInTheDocument()
	expect(
		within(authored!).queryByText(/follows the documented convention/),
	).not.toBeInTheDocument()
})

test('a week outside every lifting block reads “no lifting”, never a dash', async () => {
	renderPlan(hybridSeason(), 'weeks', null, undefined, {
		strengthTracks: strengthTrack([block()]),
	})

	const weeks = within(
		await screen.findByRole('list', { name: 'Training weeks' }),
	).getAllByRole('listitem')
	expect(weeks[0]).toHaveTextContent('12 sets/wk')
	// Week 3 is in the gap between blocks: the authored "no lifting these weeks",
	// a positive statement and never an Unavailable Metric (ADR 0047 §6).
	expect(within(weeks[2]!).getByText('No lifting')).toBeInTheDocument()
	expect(within(weeks[2]!).queryByText('Unavailable')).not.toBeInTheDocument()
	expect(within(weeks[2]!).queryByText('0 sets/wk')).not.toBeInTheDocument()
})

test('a lifting block’s deload week is visible on the week it lands in', async () => {
	renderPlan(hybridSeason(), 'weeks', null, undefined, {
		// Two weeks, the second of which is the block's own tail.
		strengthTracks: strengthTrack([block({ weeks: 2, deloadWeeks: 1 })]),
	})

	const weeks = within(
		await screen.findByRole('list', { name: 'Training weeks' }),
	).getAllByRole('listitem')
	expect(weeks[0]).not.toHaveTextContent('Deload')
	expect(weeks[1]).toHaveTextContent('Deload')
	// Beside the week's own role and never instead of it: the phase rhythm is still
	// loading that week, and a week carries one role of each kind (ADR 0047 §6).
	expect(weeks[1]).toHaveTextContent('Loading')
	expect(weeks[1]).toHaveTextContent('13 sets/wk')
})

test('the deload note says the block’s tail is intent, not a phase mismatch', async () => {
	renderPlan(hybridSeason(), 'weeks', null, undefined, {
		strengthTracks: strengthTrack([block({ weeks: 2, deloadWeeks: 1 })]),
	})

	const copy = await screen.findByText(/is a lifting block/)
	expect(copy).toHaveTextContent(/comes from the weeks you gave that block/)
	expect(copy).toHaveTextContent(/rhythm does not reach it/)
	// A lifter's deload landing on a different week from a runner's recovery week
	// is the point of a dated block, so nothing may read it as a fault.
	expect(copy.textContent).not.toMatch(
		/inconsistent|mismatch|conflict|should match|wrong/i,
	)
})

test('a plan whose blocks have no deload week says nothing about deloads', async () => {
	renderPlan(hybridSeason(), 'weeks', null, undefined, {
		// A positively authored "no deload", which is not the same as leaving it blank.
		strengthTracks: strengthTrack([block({ weeks: 2, deloadWeeks: 0 })]),
	})

	await screen.findByRole('list', { name: 'Training weeks' })
	expect(screen.queryByText(/Deload/)).not.toBeInTheDocument()
})

test('each track states its own currency, and no track states a span of its own', async () => {
	renderPlan(hybridSeason(), 'blocks', null, undefined, {
		strengthTracks: strengthTrack([block()]),
	})

	// Each track in *its* Volume Currency, never converted (ADR 0043 §4–§5).
	expect(
		await screen.findByText(/authored in sets\/wk · starts at 12 sets\/wk/),
	).toBeInTheDocument()
	expect(
		screen.getByText(/authored in km\/wk · starts at 50\.0 km\/wk/),
	).toBeInTheDocument()
	// And no per-track **Season Span**: a span belongs to a commensurability group
	// rather than to a track (CONTEXT.md, _Season Span_), and that grouping is a
	// later ticket's — rendering one here would settle it on the page first.
	expect(screen.queryByText(/→/)).not.toBeInTheDocument()
})

test('the guard warns on a lifting block without tying it to a phase', async () => {
	const season = hybridSeason()
	renderPlan(
		{
			...season,
			tracks: [
				season.tracks[0]!,
				{
					...season.tracks[1]!,
					// `phaseIndex` is where the block's *opening week* falls — where the
					// athlete looks — and never a phase binding (ADR 0047 §6).
					warnings: [{ subject: 'ramp', phaseIndex: 0, authored: 0.15 }],
				},
			],
		},
		'blocks',
		null,
		undefined,
		{ strengthTracks: strengthTrack([block({ ramp: 0.15 })]) },
	)

	const warning = await screen.findByText(/ramps \+15% a loading week/)
	expect(warning.closest('li')).toHaveTextContent(
		'Strength ramps +15% a loading week, in the block opening in Base.',
	)
	const copy = screen.getByText(/The convention is \+8%/)
	expect(copy).toHaveTextContent(
		/dated rather than tied to a phase, so the phase named beside one is only where its opening week falls/,
	)
	// Still a convention, still no injury claim.
	expect(copy).toHaveTextContent(/unusual rather than unsafe/)
	expect(copy.textContent).not.toMatch(/injury risk|unsafe ramp|dangerous/i)
})

test('a session outside its block’s band warns, and says the band is derived', async () => {
	renderPlan(
		hybridSeason({
			bandWarnings: [
				{
					sessionId: 'session-9',
					scheduledAt: new Date('2030-01-09T17:00:00.000Z'),
					weekInPlan: 1,
					goal: 'maximal-strength',
					band: { minPct1RM: 80, maxPct1RM: 100 },
					outsidePct1RMs: [60, 65],
				},
			],
		}),
		'blocks',
		null,
		undefined,
		{ strengthTracks: strengthTrack([block({ goal: 'maximal-strength' })]) },
	)

	const link = await screen.findByRole('link', { name: /Week 1, 9 Jan 2030/ })
	expect(link).toHaveAttribute('href', '/training/sessions/session-9')
	expect(link.closest('li')).toHaveTextContent(
		'is authored at 60%, 65% 1RM, outside the 80–100% 1RM that maximal strength works in.',
	)
	const copy = screen.getByText(/That band is/)
	expect(copy).toHaveTextContent(/derived/)
	expect(copy).toHaveTextContent(/never typed beside it/)
	// Warns and never blocks (ADR 0042 §9).
	expect(copy).toHaveTextContent(/a note and not a limit/)
	expect(copy).toHaveTextContent(/saved exactly as you authored them/)
})

test('each Unavailable reading gets its own sentence and its own reason', async () => {
	renderPlan(
		hybridSeason({
			unavailableReadings: [
				'hours-calendar-cost',
				'combined-cross-track-load',
				'strength-ctl',
			],
		}),
		'weeks',
		null,
		undefined,
		{ strengthTracks: strengthTrack([block()]) },
	)

	const reasons = within(
		await screen.findByRole('region', {
			name: 'What this plan cannot tell you',
		}),
	).getAllByRole('listitem')
	// Three readings, three reasons — never one line over three dashes, because
	// each is Unavailable for something different (ADR 0047 §5).
	expect(reasons).toHaveLength(3)
	expect(reasons[0]).toHaveTextContent(/costs in hours reads Unavailable/)
	expect(reasons[0]).toHaveTextContent(/nothing here stores how long one takes/)
	expect(reasons[1]).toHaveTextContent(/lifting carries no TSS at all/)
	expect(reasons[2]).toHaveTextContent(
		/pricing a lifting session as hours × an assumed intensity/,
	)
	expect(screen.queryByText('—')).not.toBeInTheDocument()
})

test('a plan with no strength track is owed none of the three readings', async () => {
	renderPlan(SEASON, 'weeks')

	await screen.findByRole('list', { name: 'Training weeks' })
	expect(
		screen.queryByText('What this plan cannot tell you'),
	).not.toBeInTheDocument()
	// And no lifting section for a runner who does not lift.
	expect(screen.queryByText('Lifting blocks')).not.toBeInTheDocument()
})

test('a block whose window fell out of the plan is shown rather than hidden', async () => {
	renderPlan(hybridSeason(), 'blocks', null, undefined, {
		strengthTracks: strengthTrack([
			block({ startWeekKey: '2030-06-03', startWeekInPlan: null }),
		]),
	})

	const [card] = await blockCards()
	expect(card).toHaveTextContent('Outside your plan’s weeks')
	expect(card).toHaveTextContent(
		/shortening your season leaves it where it was/,
	)
	// Still removable and still editable, or the athlete would have no way out.
	expect(
		within(card!).getByRole('button', { name: 'Remove block' }),
	).toBeEnabled()
})

test('a strength track with no blocks says every week is no lifting', async () => {
	renderPlan(hybridSeason(), 'blocks', null, undefined, {
		strengthTracks: strengthTrack([]),
	})

	expect(await screen.findByText(/No lifting blocks yet/)).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Add block' })).toBeEnabled()
})
