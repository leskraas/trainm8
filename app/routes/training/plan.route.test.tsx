/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { type EditableStrengthTrack } from './__strength-segment-editor.tsx'
import PlanRoute from './plan.tsx'

// A refusal lands only after the submit round-trips through the stub's action and
// the route re-renders — and this route renders the roster, the anchor list, both
// readings and every segment form each time. That is comfortably over
// `findBy*`'s 1000 ms default on a loaded machine, which showed up as a test that
// passed alone and failed beside others. The slack is the fix; the assertion is
// unchanged.
const REFUSAL_TIMEOUT = 5000

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
	/**
	 * The **Season Span** headline: one figure per **commensurability group**, never
	 * one per track (ADR 0043 §5). Grouped at the read boundary, so the component
	 * has no rule of its own about what may be added to what — which is exactly what
	 * these fixtures exercise.
	 */
	spanGroups: Array<{
		key: string
		currency: string
		disciplines: string[]
		marker: 'authored' | 'derived'
		span: { anchor: number; peak: number; peakWeekIndex: number }
		total: number | null
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
		/**
		 * The **dated** blocks this track authors — empty for an endurance track,
		 * which positions its segments by phase instead (ADR 0047 §6). Carried here
		 * because the season chart puts a block's opening on the **time** axis, and
		 * the strength editor's own copy of these rows is a different reading with a
		 * different shape.
		 */
		strengthSegments: Array<{
			segmentId: string
			startWeekInPlan: number | null
			weeks: number
			ramp: number | null
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
			/**
			 * Hand-set by a **Week Volume Override** rather than derived, and what the
			 * rule would give in its place — what a revert restores (ADR 0044 §5).
			 * Neither is expressible from `value` alone, which is why the reading
			 * carries three fields and this hand copy has to carry them too.
			 */
			overridden: boolean
			derivedValue: number | null
			/**
			 * Where the week sits in the lifting block holding it, derived at the read
			 * boundary off the same spec that priced `value` (ADR 0047 §6). `'gap'` is a
			 * week between blocks; `null` is an endurance track, which has no such role.
			 */
			strengthRole: 'loading' | 'deload' | 'gap' | null
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
		targets: [target(50)],
		...overrides,
	}
}

/** The run track every fixture hangs off, by id — what a pattern day joins on. */
const RUN_TRACK = 'track-run'

/**
 * One track's reading of one week: the number, whether the athlete hand-set it, and
 * what the rule would give in its place.
 *
 * A **derived** week's two numbers agree, because the rule is where the number came
 * from and there is nothing for a revert to restore.
 */
function target(
	value: number | null,
	overrides: Partial<Season['weeks'][number]['targets'][number]> = {},
): Season['weeks'][number]['targets'][number] {
	return {
		trackId: RUN_TRACK,
		discipline: 'run',
		currency: 'km',
		value,
		overridden: false,
		derivedValue: value,
		// An endurance track has no lifting-block role at all (ADR 0047 §6).
		strengthRole: null,
		...overrides,
	}
}

/**
 * A **hand-set** week: the athlete's own number, and the rule's own number beside it.
 * The two differ on purpose — an override is the week's final target and takes no
 * role factor on top, so a recovery week the athlete hand-set is exactly where they
 * part company (ADR 0044 §5).
 */
function handSet(value: number, ruleGives: number | null) {
	return target(value, { overridden: true, derivedValue: ruleGives })
}

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

/**
 * What the add-track form is handed for one Discipline this plan does not measure
 * yet: the unit the athlete's own history proposes and the anchor pre-filled from
 * it, read at the loader (ADR 0043 §2, ADR 0040 §6).
 */
type Proposal = {
	discipline: string
	currency: string | null
	offered: string[]
	anchors: Record<
		string,
		{
			value: number
			derivation: {
				source: string
				windowWeeks: number
				weeksTrained: number
				total: number
				currency: string
			}
		}
	>
}

const ENDURANCE_UNITS = ['km', 'hours', 'tss']

/**
 * A Discipline the athlete has never trained: a unit for them to pick and nothing
 * to pre-fill — except for strength, whose unit is a fact about the Discipline and
 * not a reading of anything (ADR 0043 §2).
 */
function unread(discipline: string): Proposal {
	const strength = discipline === 'strength'
	return {
		discipline,
		currency: strength ? 'sets' : null,
		offered: strength ? ['sets'] : ENDURANCE_UNITS,
		anchors: {},
	}
}

/** A Discipline with four complete weeks behind it, proposing `currency`. */
function read(
	discipline: string,
	currency: string,
	total: number,
	weeksTrained = 4,
): Proposal {
	return {
		discipline,
		currency,
		offered: [currency, ...ENDURANCE_UNITS.filter((unit) => unit !== currency)],
		anchors: {
			[currency]: {
				value: total / 4,
				derivation: {
					source: 'recent-training',
					windowWeeks: 4,
					weeksTrained,
					total,
					currency,
				},
			},
		},
	}
}

/** One proposal per Discipline the season does not already measure. */
function proposalsFor(season: Season): Proposal[] {
	return ['swim', 'bike', 'run', 'strength']
		.filter(
			(discipline) =>
				!season.tracks.some((track) => track.discipline === discipline),
		)
		.map(unread)
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
 *
 * The section's own type rather than a structural copy of it. A copy type-checks
 * against fixtures that omit a field the component now requires, so the drift shows
 * up as a render crash here instead of a compile error — which is how `anchors`
 * arrived unset once already.
 */
type StrengthTracks = EditableStrengthTrack[]

/**
 * The **Season Anchor** segments as the loader hands them over: each track's list,
 * earliest first, with the 1-based week each takes effect from (#407, ADR 0040 §5).
 *
 * Separate from `season.tracks[].anchors` because the reading has two things the
 * stored rows do not — which week of the plan the segment lands on, and which of
 * them is the earliest — both worked out at the read boundary rather than in the
 * component.
 */
type AnchorTracks = Array<{
	trackId: string
	discipline: string
	currency: string
	anchors: Array<{
		fromWeekKey: string
		/** `null` for a segment on a week the plan no longer covers. */
		weekInPlan: number | null
		value: number
		earliest: boolean
	}>
}>

/** The loader's own reshape, so a fixture cannot describe a season it never read. */
function anchorTracksFor(season: Season): AnchorTracks {
	return season.tracks.map((track) => ({
		trackId: track.trackId,
		discipline: track.discipline,
		currency: track.currency,
		anchors: track.anchors.map((anchor, index) => ({
			fromWeekKey: anchor.fromWeekKey,
			weekInPlan:
				season.weeks.find((entry) => entry.weekKey === anchor.fromWeekKey)
					?.weekInPlan ?? null,
			value: anchor.value,
			earliest: index === 0,
		})),
	}))
}

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
			// The anchor `hybridSeason` authors, as the plan page converts it: week
			// key '2030-01-07' is the Plan Start Week, so it takes effect at index 0.
			anchors: [{ fromWeekIndex: 0 }],
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
	spanGroups: [
		{
			key: 'km:run',
			currency: 'km',
			disciplines: ['run'],
			marker: 'authored',
			span: { anchor: 50, peak: 55, peakWeekIndex: 1 },
			total: 132.5,
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
			strengthSegments: [],
			span: { anchor: 50, peak: 55, peakWeekIndex: 1 },
			total: 132.5,
			warnings: [],
		},
	],
	weeks: [
		week(1),
		week(2, { targets: [target(55)] }),
		week(3, { phaseIndex: 1, role: 'taper', targets: [target(27.5)] }),
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
		anchorTracks?: AnchorTracks
		/** Weeks of the plan already holding sessions — the last "what's next" step. */
		weeksWithSessions?: number
		/** What the add-track form proposes; unread history unless a test says so. */
		trackProposals?: Proposal[]
	} = {},
) {
	const week =
		extra.week === undefined ? (season.weeks[0]?.weekKey ?? null) : extra.week
	const workouts = extra.workouts ?? WORKOUTS
	const strengthTracks = extra.strengthTracks ?? []
	// Reshaped from the season by default rather than hand-written, so the anchor
	// section reads the same list the rest of the page derives from.
	const anchorTracks = extra.anchorTracks ?? anchorTracksFor(season)
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
				// No week of these fixtures has been stamped, so nothing can disagree
				// with a mix yet — the ordinary state, and the stamp section's own
				// suite covers the case where something does (#412).
				mixWarnings: [],
				weeksWithSessions: extra.weeksWithSessions ?? 0,
				anchorTracks,
				// The season chart's two athlete-scoped inputs (#413). Empty and null
				// are the honest defaults for these suites: this athlete has no
				// Discipline Profile, so every derived reading closes its gate, and no
				// load history, so the Fitness layer declines. Both are exercised in
				// `__season-chart.route.test.tsx`, which is where the chart is the
				// subject rather than the furniture.
				conversionContexts: {},
				fitnessAnchor: null,
				trackProposals: extra.trackProposals ?? proposalsFor(season),
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

test('a plan that is not finished says what is left, and where to do it', async () => {
	// The default fixture: no ramp anywhere, no pattern, nothing stamped — which is
	// exactly the state an athlete authoring their own blocks lands in.
	renderPlan()

	const next = within(
		await screen.findByRole('region', { name: /what’s next/i }),
	)
	expect(next.getByText(/give your weeks a climb/i)).toBeInTheDocument()
	expect(next.getByText(/say what your typical week looks like/i)).toBeVisible()
	expect(next.getByText(/put your weeks on the calendar/i)).toBeVisible()
	// Each step links to the reading that performs it rather than explaining where
	// to find it.
	expect(next.getByRole('link', { name: /set a climb/i })).toHaveAttribute(
		'href',
		'/training/plan',
	)
	expect(next.getByRole('link', { name: /stamp your weeks/i })).toHaveAttribute(
		'href',
		'/training/plan?tab=weeks',
	)
})

test('a step closes when the plan actually has the thing, not when a flag is set', async () => {
	renderPlan(
		{
			...withSegments([
				segment(0, { segmentId: 'segment-base', ramp: 0.05 }),
				segment(1, { segmentId: 'segment-taper' }),
			]),
			patterns: [
				{ id: 'pattern-1', name: 'Typical week', orderIndex: 0, days: [] },
			],
		},
		'blocks',
		null,
		undefined,
		{ weeksWithSessions: 2 },
	)

	// Every step done: one quiet line about the calendar, and no checklist.
	expect(await screen.findByText(/your plan is set up/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('region', { name: /what’s next/i }),
	).not.toBeInTheDocument()
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
	// Every week is hand-settable, and none of these is hand-set: the boxes are blank
	// and no week is marked (ADR 0044 §4–§5).
	expect(
		screen.getByRole('spinbutton', { name: 'Week 1 Run, km/wk' }),
	).toHaveValue(null)
	expect(screen.queryByText('Hand-set')).not.toBeInTheDocument()
})

test('a derived week reads as blank, with the rule’s own number beside the box', async () => {
	renderPlan(SEASON, 'weeks')

	const field = await screen.findByRole('spinbutton', {
		name: 'Week 2 Run, km/wk',
	})
	// **Not** pre-filled with 55: the rule's number in the box would make the rule
	// look like an edit to the athlete's plan (ADR 0044 §4).
	expect(field).toHaveValue(null)
	expect(field).toHaveAttribute('min', '0')
	// A tenth of a kilometre, from the currency's own precision.
	expect(field).toHaveAttribute('step', '0.1')
	const row = within(
		within(screen.getByRole('list', { name: 'Training weeks' })).getAllByRole(
			'listitem',
		)[1]!,
	)
	expect(row.getByText('55.0 km/wk')).toBeInTheDocument()
	// Nothing to revert, so no control that claims there is.
	expect(
		row.queryByRole('button', { name: /revert to the rule/i }),
	).not.toBeInTheDocument()
})

test('the blank-and-zero rule is stated once, where the boxes are', async () => {
	renderPlan(SEASON, 'weeks')

	// Blank means something different a third time on this page, and `0` is the one
	// number an athlete would otherwise have to guess at.
	expect(
		await screen.findByText(/hand the week back to the rule/i),
	).toBeInTheDocument()
	expect(screen.getByText(/is a week without training/i)).toBeInTheDocument()
})

test('a hand-set week is marked, and says what the rule would give instead', async () => {
	renderPlan(
		{ ...SEASON, weeks: [week(1), week(2, { targets: [handSet(42, 55)] })] },
		'weeks',
	)

	const rows = within(
		await screen.findByRole('list', { name: 'Training weeks' }),
	).getAllByRole('listitem')
	const row = within(rows[1]!)
	// The athlete's own number, in the box and in the reading.
	expect(
		row.getByRole('spinbutton', { name: 'Week 2 Run, km/wk' }),
	).toHaveValue(42)
	// Marked in words, and the revert made legible before it is pressed.
	expect(row.getByText('Hand-set')).toBeInTheDocument()
	expect(row.getByText('The rule gives 55.0 km/wk.')).toBeInTheDocument()
	expect(
		row.getByRole('button', { name: 'Revert to the rule for week 2 Run' }),
	).toBeEnabled()
	// And the week beside it is untouched — an override is a leaf.
	expect(within(rows[0]!).queryByText('Hand-set')).not.toBeInTheDocument()
})

test('a hand-set week the rule cannot price says the revert has nothing to restore', async () => {
	renderPlan(
		{
			...SEASON,
			weeks: [
				week(1, {
					targets: [handSet(12, null)],
				}),
			],
		},
		'weeks',
	)

	expect(
		await screen.findByText(/reverting would leave it Unavailable/i),
	).toBeInTheDocument()
})

test('a week hand-set to 0 reads as a week without training, not as a blank box', async () => {
	renderPlan(
		{ ...SEASON, weeks: [week(1, { targets: [handSet(0, 50)] })] },
		'weeks',
	)

	// `0` is a value the athlete authored and needs no flag of its own, so it sits in
	// the box as a zero rather than reading as "nothing typed" (CONTEXT.md).
	expect(
		await screen.findByRole('spinbutton', { name: 'Week 1 Run, km/wk' }),
	).toHaveValue(0)
	expect(screen.getByText('Hand-set')).toBeInTheDocument()
	// Scoped to the week list: the season chart above it carries every week's
	// figure again in its accessible data-table equivalent (ADR 0030 rule 2), so
	// an unscoped query would match the picture as well as the field.
	const weeks = screen.getByRole('list', { name: 'Training weeks' })
	expect(within(weeks).getByText('0.0 km/wk')).toBeInTheDocument()
})

test('a week a track cannot price is still hand-settable', async () => {
	renderPlan(
		{
			...SEASON,
			weeks: [
				week(1, {
					targets: [
						target(null, {
							trackId: 'track-strength',
							discipline: 'strength',
							currency: 'sets',
						}),
					],
				}),
			],
		},
		'weeks',
	)

	// A real track with a real currency: the athlete knowing what they want for a week
	// the rule cannot price is exactly what an override is for. Only the derived
	// sentence has nothing to name.
	expect(
		await screen.findByRole('spinbutton', {
			name: 'Week 1 Strength, sets/wk',
		}),
	).toBeEnabled()
	expect(screen.getByText('Unavailable')).toBeInTheDocument()
})

test('a week posts its own track, its own Monday and the number typed', async () => {
	const user = userEvent.setup()
	let posted: Record<string, string> = {}
	renderPlan(SEASON, 'weeks', null, async ({ request }) => {
		posted = Object.fromEntries(await request.formData()) as Record<
			string,
			string
		>
		return { ok: true }
	})

	await user.type(
		await screen.findByRole('spinbutton', { name: 'Week 2 Run, km/wk' }),
		'42',
	)
	await user.click(screen.getByRole('button', { name: 'Save week 2 Run' }))

	expect(posted).toMatchObject({
		intent: 'set-week-override',
		trackId: RUN_TRACK,
		weekKey: '2030-01-14',
		value: '42',
	})
})

test('a week typed as 0 posts 0, and never a blank', async () => {
	const user = userEvent.setup()
	let posted: Record<string, string> = {}
	renderPlan(SEASON, 'weeks', null, async ({ request }) => {
		posted = Object.fromEntries(await request.formData()) as Record<
			string,
			string
		>
		return { ok: true }
	})

	await user.type(
		await screen.findByRole('spinbutton', { name: 'Week 1 Run, km/wk' }),
		'0',
	)
	await user.click(screen.getByRole('button', { name: 'Save week 1 Run' }))

	// The whole distinction rides on this: `0` is a week without training and blank is
	// the revert, so a `0` that arrived as `''` would make a week off unauthorable.
	expect(posted.value).toBe('0')
})

test('the revert control posts the week it is beside, and no value', async () => {
	const user = userEvent.setup()
	let posted: Record<string, string> = {}
	renderPlan(
		{ ...SEASON, weeks: [week(1, { targets: [handSet(42, 50)] })] },
		'weeks',
		null,
		async ({ request }) => {
			posted = Object.fromEntries(await request.formData()) as Record<
				string,
				string
			>
			return { ok: true }
		},
	)

	await user.click(
		await screen.findByRole('button', {
			name: 'Revert to the rule for week 1 Run',
		}),
	)

	// No value at all: reverting deletes the athlete's statement rather than storing
	// what the rule happens to give today.
	expect(posted).toEqual({
		intent: 'clear-week-override',
		trackId: RUN_TRACK,
		weekKey: '2030-01-07',
	})
})

test('a refused hand-set week is said at the top of the reading that asked for it', async () => {
	const user = userEvent.setup()
	renderPlan(
		{ ...SEASON, weeks: [week(1, { targets: [handSet(42, 50)] })] },
		'weeks',
		null,
		() => ({ error: 'That week is not in your plan.' }),
	)

	await user.click(
		await screen.findByRole('button', {
			name: 'Revert to the rule for week 1 Run',
		}),
	)

	expect(
		await screen.findByRole('alert', {}, { timeout: REFUSAL_TIMEOUT }),
	).toHaveTextContent('That week is not in your plan.')
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
					strengthSegments: [],
					span: null,
					total: null,
					warnings: [],
				},
			],
			weeks: SEASON.weeks.map((entry) => ({
				...entry,
				targets: [
					target(null, {
						trackId: 'track-strength',
						discipline: 'strength',
						currency: 'sets',
						strengthRole: 'gap',
					}),
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

	expect(
		await screen.findByRole('alert', {}, { timeout: REFUSAL_TIMEOUT }),
	).toHaveTextContent('That phase is no longer part of this plan.')
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

test('a single-track headline names no discipline and carries no marker', async () => {
	renderPlan()

	// One figure, so there is nothing to tell apart and nothing was added up.
	expect(await screen.findByText('50.0 km/wk → 55.0 km/wk')).toBeInTheDocument()
	expect(screen.queryByText('Derived')).not.toBeInTheDocument()
})

test('a runner who lifts reads two spans, each named, neither derived', async () => {
	renderPlan({
		...SEASON,
		spanGroups: [
			SEASON.spanGroups[0]!,
			{
				key: 'sets:strength',
				currency: 'sets',
				disciplines: ['strength'],
				marker: 'authored',
				span: { anchor: 12, peak: 21, peakWeekIndex: 1 },
				total: 45,
			},
		],
	})

	// Two figures in two currencies, because no number spans an endurance and a
	// strength track in either direction (ADR 0046 §1).
	expect(await screen.findByText('50.0 km/wk → 55.0 km/wk')).toBeInTheDocument()
	expect(screen.getByText('12 sets/wk → 21 sets/wk')).toBeInTheDocument()
	// Named, because there are two figures to tell apart. (The roster below names
	// the same disciplines, which is why these are counted rather than found once.)
	expect(screen.getAllByText('Run').length).toBeGreaterThan(0)
	expect(screen.getAllByText('Strength').length).toBeGreaterThan(0)
	expect(screen.queryByText('Derived')).not.toBeInTheDocument()
})

test('an accumulated span is marked derived, names its tracks and says why it adds up', async () => {
	renderPlan({
		...SEASON,
		spanGroups: [
			{
				key: 'tss',
				currency: 'tss',
				disciplines: ['swim', 'bike', 'run'],
				marker: 'derived',
				span: { anchor: 320, peak: 450, peakWeekIndex: 1 },
				total: 4800,
			},
		],
	})

	expect(await screen.findByText('320 TSS/wk → 450 TSS/wk')).toBeInTheDocument()
	// The marker rides on the figure it qualifies, never as a footnote (ADR 0045 §9).
	expect(screen.getByText('Derived')).toBeInTheDocument()
	expect(screen.getByText('Swim · Bike · Run')).toBeInTheDocument()
	// A derived marker is a promise that a derivation exists, so the reason is said.
	expect(
		screen.getByText(/because a TSS is the same hour of threshold work/),
	).toBeInTheDocument()
	// Plural, because several anchors went into it.
	expect(
		screen.getByText(/read from your anchors and your ramps/),
	).toBeInTheDocument()
})

test('an accumulated hours span says it is calendar cost and not a dose', async () => {
	renderPlan({
		...SEASON,
		spanGroups: [
			{
				key: 'hours',
				currency: 'hours',
				disciplines: ['run', 'bike'],
				marker: 'derived',
				span: { anchor: 10, peak: 14, peakWeekIndex: 1 },
				total: null,
			},
		],
	})

	expect(await screen.findByText('10.0 h/wk → 14.0 h/wk')).toBeInTheDocument()
	expect(screen.getByText(/never as how hard it is/)).toBeInTheDocument()
	// The total is unavailable here, and its absence is silence rather than a zero.
	expect(screen.queryByText(/h across the season/)).not.toBeInTheDocument()
})

// ── Several tracks over one phase timeline (ADR 0043 §1) ─────────────────────

test('the roster offers only the disciplines the plan does not already measure', async () => {
	const user = userEvent.setup()
	renderPlan()

	await user.click(await screen.findByRole('combobox', { name: 'Discipline' }))
	const listbox = await screen.findByRole('listbox')

	// Run is already tracked, and one track per Discipline is the rule the picker
	// enforces before the unique index has to.
	expect(
		within(listbox).queryByRole('option', { name: 'Run' }),
	).not.toBeInTheDocument()
	for (const name of ['Swim', 'Bike', 'Strength']) {
		expect(within(listbox).getByRole('option', { name })).toBeInTheDocument()
	}
})

test('adding a track posts its discipline, its unit and its first anchor in one act', async () => {
	const user = userEvent.setup()
	let posted: Record<string, string> = {}
	renderPlan(SEASON, 'blocks', null, async ({ request }) => {
		posted = Object.fromEntries(await request.formData()) as Record<
			string,
			string
		>
		return { ok: true }
	})

	await user.click(await screen.findByRole('combobox', { name: 'Discipline' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Bike',
		}),
	)
	await user.type(
		screen.getByRole('spinbutton', { name: /Starting volume/ }),
		'300',
	)
	await user.click(screen.getByRole('button', { name: 'Add track' }))

	// Currency and anchor value are one act (ADR 0043 §2), so both travel with the
	// Discipline rather than the track being anchored afterwards.
	expect(posted).toMatchObject({
		intent: 'add-track',
		outlineId: 'outline-1',
		discipline: 'bike',
		anchorValue: '300',
	})
})

test('a strength track states its unit rather than offering a dead picker', async () => {
	const user = userEvent.setup()
	renderPlan()

	await user.click(await screen.findByRole('combobox', { name: 'Discipline' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Strength',
		}),
	)

	// Strength speaks `sets` and only `sets`, so there is nothing to pick — a
	// one-option select is the dead control ADR 0044 §8 argues against, and the
	// athlete is never asked for a unit strength cannot express (ADR 0043 §2).
	expect(
		await screen.findByText(/strength’s own unit, not a choice/i),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('combobox', { name: 'Unit' }),
	).not.toBeInTheDocument()
})

test('the add form proposes the unit the athlete’s own history is measured in', async () => {
	const user = userEvent.setup()
	renderPlan(SEASON, 'blocks', null, undefined, {
		trackProposals: [
			read('bike', 'km', 320),
			unread('swim'),
			unread('strength'),
		],
	})

	await user.click(await screen.findByRole('combobox', { name: 'Discipline' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Bike',
		}),
	)

	// Proposed, and named as a proposal: the athlete would quote kilometres, so the
	// plan speaks kilometres (ADR 0043 §2).
	expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveTextContent(
		'Kilometres per week',
	)
	expect(
		screen.getByText(/proposed from your own history/i),
	).toBeInTheDocument()
	// And the anchor arrives with it, since the two are one act — with the
	// arithmetic said out loud rather than a figure asserted (ADR 0040 §6).
	expect(
		screen.getByRole('spinbutton', { name: /Starting volume/ }),
	).toHaveValue(80)
	expect(
		screen.getByText(
			/your last 4 weeks averaged 80\.0 km\/wk \(320\.0 km in total\)/i,
		),
	).toBeInTheDocument()
})

test('a partly-trained window says how many weeks it read', async () => {
	const user = userEvent.setup()
	renderPlan(SEASON, 'blocks', null, undefined, {
		trackProposals: [
			read('bike', 'km', 160, 2),
			unread('swim'),
			unread('strength'),
		],
	})

	await user.click(await screen.findByRole('combobox', { name: 'Discipline' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Bike',
		}),
	)

	expect(screen.getByText(/you trained 2 of them/i)).toBeInTheDocument()
})

test('with no history the add form asks for the unit rather than preselecting one', async () => {
	renderPlan()

	// The form opens on Swim, which this athlete has never trained: nothing is
	// preselected and nothing is pre-filled, because honest beats guessing
	// (ADR 0043 §2) and the alternative is a plan measured in a unit nobody chose.
	expect(
		await screen.findByRole('combobox', { name: 'Unit' }),
	).toHaveTextContent('Pick the unit you plan in')
	expect(
		screen.getByText(/nothing in your last 4 weeks to read a unit from/i),
	).toBeInTheDocument()
	expect(
		screen.getByRole('spinbutton', { name: /Starting volume/ }),
	).toHaveValue(null)
	expect(
		screen.getByText(/nothing in your last 4 weeks to read this from/i),
	).toBeInTheDocument()
})

test('switching the unit brings that unit’s own figure, not the first one relabelled', async () => {
	const user = userEvent.setup()
	renderPlan(SEASON, 'blocks', null, undefined, {
		trackProposals: [
			{
				discipline: 'bike',
				currency: 'km',
				offered: ['km', 'hours', 'tss'],
				anchors: {
					...read('bike', 'km', 320).anchors,
					...read('bike', 'hours', 12).anchors,
				},
			},
			unread('swim'),
			unread('strength'),
		],
	})

	await user.click(await screen.findByRole('combobox', { name: 'Discipline' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Bike',
		}),
	)
	await user.click(screen.getByRole('combobox', { name: 'Unit' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Hours per week',
		}),
	)

	// Anchor value and Volume Currency are one act (ADR 0043 §2) — a distance number
	// relabelled as hours is a figure nobody authored.
	expect(
		screen.getByRole('spinbutton', { name: /Starting volume \(h\/wk\)/ }),
	).toHaveValue(3)
	expect(
		screen.getByText(/averaged 3\.0 h\/wk \(12\.0 h in total\)/i),
	).toBeInTheDocument()
})

test('the only track offers no remove control', async () => {
	renderPlan()

	const roster = await screen.findByRole('list', { name: 'Training tracks' })
	expect(
		within(roster).queryByRole('button', { name: /Remove/ }),
	).not.toBeInTheDocument()
})

test('removing a track is confirmed, and says the phases stay', async () => {
	const user = userEvent.setup()
	let posted: Record<string, string> = {}
	renderPlan(
		{
			...SEASON,
			tracks: [
				SEASON.tracks[0]!,
				{
					trackId: STRENGTH_TRACK,
					discipline: 'strength',
					currency: 'sets',
					anchors: [{ fromWeekKey: '2030-01-07', value: 12 }],
					segments: [],
					strengthSegments: [],
					span: { anchor: 12, peak: 21, peakWeekIndex: 1 },
					total: 45,
					warnings: [],
				},
			],
		},
		'blocks',
		null,
		async ({ request }) => {
			posted = Object.fromEntries(await request.formData()) as Record<
				string,
				string
			>
			return { ok: true }
		},
	)

	await user.click(
		await screen.findByRole('button', { name: 'Remove the Strength track' }),
	)
	expect(
		screen.getByText(/Your phases stay exactly as they are/),
	).toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Remove track' }))

	expect(posted).toMatchObject({
		intent: 'remove-track',
		trackId: STRENGTH_TRACK,
	})
})

test('a plan whose tracks price no loading week reads no headline at all', async () => {
	renderPlan({
		...SEASON,
		spanGroups: [],
		tracks: [
			{
				trackId: 'track-strength',
				discipline: 'strength',
				currency: 'sets',
				anchors: [{ fromWeekKey: '2030-01-07', value: 18 }],
				segments: [],
				strengthSegments: [],
				span: null,
				total: null,
				warnings: [],
			},
		],
	})

	// The roster still reads, so the athlete sees the track they authored — there is
	// simply no span to state, which is an absent headline and not an Unavailable one.
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

test('re-anchoring onto a later block’s opening takes its step away', async () => {
	renderPlan({
		...SEASON,
		tracks: [
			{
				...SEASON.tracks[0]!,
				// The second anchor lands on week 3, which is the week the Taper opens —
				// so the walk already knows what that block opens at and skips its step
				// (ADR 0040 §5). Before this, the field went on offering "−20% once, at
				// the opening" over a derivation that ignored it.
				anchors: [
					{ fromWeekKey: '2030-01-07', value: 50 },
					{ fromWeekKey: '2030-01-21', value: 40 },
				],
				segments: [segment(0), segment(1, { boundaryStep: -0.2 })],
			},
		],
	})

	const taper = await phaseCard('Taper')
	expect(taper.queryByLabelText(/Boundary step/)).not.toBeInTheDocument()
	// The same sentence the lifting section gives a dated block in this state: one
	// situation, said one way.
	expect(
		taper.getByText(/Your anchor takes effect on the week this block opens/),
	).toBeInTheDocument()
	// And the authored −20% still travels, so saving the ramp cannot clear a step
	// the athlete will want back the day they move the anchor off this week.
	const hidden = taper
		.getByRole('button', { name: /Save progression/ })
		.closest('form')!
		.querySelector('input[type="hidden"][name$="boundaryStep"]')
	expect(hidden).toHaveValue('-20')
})

test('a block no anchor reaches says there is no level for a step to move', async () => {
	renderPlan({
		...SEASON,
		tracks: [
			{
				...SEASON.tracks[0]!,
				// An anchor left on a week the plan no longer covers — a season can be
				// shortened under one, and nothing cascades (ADR 0044 §3). No anchor is
				// in force anywhere, so no week has a level a step could move.
				anchors: [{ fromWeekKey: '2030-01-28', value: 50 }],
				segments: [segment(0), segment(1)],
			},
		],
		weeks: SEASON.weeks.map((entry) => ({
			...entry,
			targets: [target(null)],
		})),
	})

	const taper = await phaseCard('Taper')
	expect(taper.queryByLabelText(/Boundary step/)).not.toBeInTheDocument()
	// Its own reason, not the re-anchor one: what the athlete would change to make
	// the field live is a different edit (Unavailable Metric — the reason is the point).
	expect(
		taper.getByText(/No Season Anchor covers this block yet/),
	).toBeInTheDocument()
	// And the season's own opening keeps the reason it has always had.
	expect(
		(await phaseCard('Base')).getByText(/no boundary to step at/),
	).toBeInTheDocument()
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

// ── Warnings are dismissible signals, not blocked saves (#399 story 95) ──────

/** The season carrying one of each guard, so all three notices are on the page. */
function guardedSeason(): Season {
	return {
		...SEASON,
		trainableWeekdays: 3,
		tracks: [
			{
				...SEASON.tracks[0]!,
				segments: [segment(0, { ramp: 0.12 }), segment(1)],
				warnings: [{ subject: 'ramp', phaseIndex: 0, authored: 0.12 }],
			},
		],
		availabilityWarnings: [
			{
				fromWeekInPlan: 1,
				toWeekInPlan: 2,
				qualitySessions: 4,
				strengthSessions: 0,
				trainableWeekdays: 3,
			},
		],
		bandWarnings: [
			{
				sessionId: 'session-1',
				scheduledAt: new Date('2030-01-08T17:00:00.000Z'),
				weekInPlan: 1,
				goal: 'hypertrophy',
				band: { minPct1RM: 0.67, maxPct1RM: 0.85 },
				outsidePct1RMs: [0.92],
			},
		],
	}
}

test('every guard arrives open, and each offers to be closed by name', async () => {
	renderPlan(guardedSeason())

	// Open on arrival, all three: a warning behind a disclosure is a warning
	// withheld, and dismissal is the athlete's act *after* reading, not before.
	expect(await screen.findByText(/The convention is \+8%/)).toBeInTheDocument()
	expect(screen.getByText(/That is days against days/)).toBeInTheDocument()
	expect(screen.getByText(/That band is/)).toBeInTheDocument()
	// Named for what they close, never a bare ×: three of these in a row is three
	// decisions, and a screen reader is owed which one it is about to make.
	for (const name of [
		'Dismiss the ramp note',
		'Dismiss the training availability note',
		'Dismiss the load band note',
	]) {
		expect(screen.getByRole('button', { name })).toBeEnabled()
	}
})

test('a guard the athlete has read and decided about closes, alone', async () => {
	renderPlan(guardedSeason())

	await userEvent.click(
		await screen.findByRole('button', { name: 'Dismiss the ramp note' }),
	)

	expect(screen.queryByText(/The convention is \+8%/)).not.toBeInTheDocument()
	// One notice, one decision: closing the ramp note says nothing about the other two.
	expect(screen.getByText(/That is days against days/)).toBeInTheDocument()
	expect(screen.getByText(/That band is/)).toBeInTheDocument()
	// And nothing was blocked or unsaved by it — the plan is exactly as authored.
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
				targets: [target(null)],
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

	// Scoped to the day form: the claim is about what a **pattern day** authors, and
	// the page also carries a track's own starting volume, which is a different act
	// on a different object.
	const form = (
		await screen.findByRole('combobox', { name: 'Weekday' })
	).closest('form')!
	expect(
		within(form).getByRole('combobox', { name: 'Training track' }),
	).toBeInTheDocument()
	expect(
		within(form).getByRole('combobox', { name: 'What kind of day' }),
	).toBeInTheDocument()
	// A pattern day carries no absolute volume and no zone: there is nowhere for
	// either to be typed rather than a field that is validated away. The scoping to
	// `form` is load-bearing, not tidiness: the season chart's plot carries an
	// `aria-label` containing the word "volume", and `queryByLabelText` reads an
	// `aria-label` as readily as a field's `<label>` (#413).
	expect(within(form).queryByLabelText(/volume/i)).not.toBeInTheDocument()
	expect(within(form).queryByLabelText(/zone/i)).not.toBeInTheDocument()
	expect(within(form).queryByLabelText(/distance/i)).not.toBeInTheDocument()
	expect(within(form).getByRole('button', { name: 'Add day' })).toBeEnabled()
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
	// The offer first — a week built from what the app already knows — and the
	// empty pattern still there for an athlete who wants to type their own.
	expect(
		screen.getByRole('button', { name: /build me a typical week/i }),
	).toBeEnabled()
	expect(screen.getByRole('button', { name: 'Add pattern' })).toBeEnabled()
	// And no preview figures at all, rather than a preview of nothing.
	expect(screen.queryByText('Left for the share days')).not.toBeInTheDocument()
})

test('the starter week names the athlete’s own days, or says it is a convention', async () => {
	// Never set: the copy says it is a starting point and claims to have read
	// nothing about them (ADR 0044 §4's rule for a convention, applied to copy).
	renderPlan(SEASON, 'weeks')
	expect(
		await screen.findByText(/four-day week as a starting point/i),
	).toBeInTheDocument()

	cleanup()

	renderPlan({ ...SEASON, trainableWeekdays: 3 }, 'weeks')
	expect(
		await screen.findByText(/from the 3 days you say you can train on/i),
	).toBeInTheDocument()
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

	expect(
		await screen.findByRole('alert', {}, { timeout: REFUSAL_TIMEOUT }),
	).toHaveTextContent('That week pattern is no longer part of this plan.')
})

// ── The strength Training Track's dated blocks (#409, ADR 0047) ─────────────

/** The lifting cards, which are the direct items of the Lifting blocks list. */
async function blockCards() {
	return within(
		await screen.findByRole('list', { name: 'Lifting blocks' }),
	).getAllByRole('listitem')
}

/**
 * A season carrying a strength track beside the run one, weeks priced in sets.
 *
 * `strengthRoles` is what the read boundary derived for the lifting track, one entry
 * per plan week: the default is the two-week block `block()` authors — a loading week,
 * its own deload tail, then the gap after it (ADR 0047 §6). It is passed in rather
 * than worked out from the blocks, because working it out here is exactly the
 * duplicate derivation the surface no longer does.
 */
function hybridSeason(
	overrides: Partial<Season> = {},
	strengthRoles: Array<'loading' | 'deload' | 'gap'> = [
		'loading',
		'deload',
		'gap',
	],
): Season {
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
				strengthSegments: [],
				span: { anchor: 12, peak: 21, peakWeekIndex: 1 },
				total: 45,
				warnings: [],
			},
		],
		weeks: SEASON.weeks.map((entry, index) => ({
			...entry,
			targets: [
				...entry.targets,
				// Weeks 1–2 lift; week 3 falls in a gap and derives 0.
				target(index === 2 ? 0 : 12 + index, {
					trackId: STRENGTH_TRACK,
					discipline: 'strength',
					currency: 'sets',
					strengthRole: strengthRoles[index] ?? 'gap',
				}),
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
	renderPlan(
		// A positively authored "no deload", which is not the same as leaving it blank:
		// both of the block's weeks load, and the week after it is still the gap.
		hybridSeason({}, ['loading', 'loading', 'gap']),
		'weeks',
		null,
		undefined,
		{ strengthTracks: strengthTrack([block({ weeks: 2, deloadWeeks: 0 })]) },
	)

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
	// And no per-track **Season Span** in the roster: a span belongs to a
	// commensurability group rather than to a track (ADR 0043 §5), and the headline
	// above is the one place the grouping is rendered.
	const roster = screen.getByRole('list', { name: 'Training tracks' })
	expect(within(roster).queryByText(/→/)).not.toBeInTheDocument()
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

test('the lifter reads what the plan cannot tell them while authoring blocks', async () => {
	renderPlan(
		hybridSeason({ unavailableReadings: ['combined-cross-track-load'] }),
		'blocks',
		null,
		undefined,
		{ strengthTracks: strengthTrack([block()]) },
	)

	// The notice lived inside the Weeks reading, where the lifter shaping the block
	// that causes it never was. It sits above both readings now, so the sentence
	// arrives with the authoring rather than one tab away from it (story 49).
	const notice = await screen.findByRole('region', {
		name: 'What this plan cannot tell you',
	})
	expect(notice).toHaveTextContent(/lifting carries no TSS at all/)
	expect(
		await screen.findByRole('list', { name: 'Lifting blocks' }),
	).toBeInTheDocument()
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

// ── Re-anchoring a track mid-season (#407, ADR 0040 §5) ─────────────────────

/** The season re-anchored from its third week, which is the Taper week here. */
function reanchoredSeason(): Season {
	return {
		...SEASON,
		tracks: [
			{
				...SEASON.tracks[0]!,
				anchors: [
					{ fromWeekKey: '2030-01-07', value: 50 },
					{ fromWeekKey: '2030-01-21', value: 30 },
				],
			},
		],
	}
}

test('the anchor list says the athlete re-anchored, from when and to what', async () => {
	renderPlan(reanchoredSeason())

	const list = await screen.findByRole('list', { name: 'Run season anchors' })
	const [opening, reanchor] = within(list).getAllByRole('listitem')
	// Which is the season's opening level and which is a later statement, in words
	// rather than by position: an athlete reading the list has to be able to see
	// that they re-anchored at all.
	expect(opening).toHaveTextContent('From week 1')
	expect(opening).toHaveTextContent('Season opening')
	expect(opening).toHaveTextContent('50.0 km/wk')
	expect(reanchor).toHaveTextContent('From week 3')
	expect(reanchor).toHaveTextContent('Re-anchored')
	expect(reanchor).toHaveTextContent('30.0 km/wk')
	// And said once more at the top of the page, where the track is summarised.
	expect(
		screen.getByText(/re-anchored once, most recently to 30\.0 km\/wk/),
	).toBeInTheDocument()
})

test('the earliest anchor cannot be removed, and the row says why', async () => {
	renderPlan(reanchoredSeason())

	const list = await screen.findByRole('list', { name: 'Run season anchors' })
	const [opening, reanchor] = within(list).getAllByRole('listitem')
	// Removing the first segment would leave every week before the next one with
	// nothing to derive from, so the control is absent rather than present and
	// refused — and the row says what to do instead.
	expect(
		within(opening!).queryByRole('button', { name: 'Remove this re-anchor' }),
	).not.toBeInTheDocument()
	expect(opening).toHaveTextContent(/Your season keeps this one/)
	expect(
		within(reanchor!).getByRole('button', { name: 'Remove this re-anchor' }),
	).toBeEnabled()
})

test('an anchor row edits its value, and offers no unit anywhere', async () => {
	renderPlan(reanchoredSeason())

	const list = await screen.findByRole('list', { name: 'Run season anchors' })
	const [, reanchor] = within(list).getAllByRole('listitem')
	// The athlete's own number read back at the currency's own precision — this is
	// not a rate box, so there is no convention for a blank to fall through to.
	expect(
		within(reanchor!).getByRole('spinbutton', {
			name: /Weekly volume, km\/wk/,
		}),
	).toHaveValue(30)
	// A segment carries no unit at all (ADR 0043): there is nowhere on the section
	// for one to be chosen, rather than a field that is validated away.
	const section = screen.getByRole('region', { name: 'Season anchors' })
	expect(
		within(section).queryByRole('combobox', { name: /unit|currency/i }),
	).not.toBeInTheDocument()
	expect(
		within(section).queryByLabelText(/unit|currency/i),
	).not.toBeInTheDocument()
})

test('the re-anchor form offers only weeks that carry no anchor yet', async () => {
	const user = userEvent.setup()
	renderPlan(reanchoredSeason())

	await user.click(await screen.findByRole('combobox', { name: 'From week' }))
	const options = within(await screen.findByRole('listbox')).getAllByRole(
		'option',
	)
	// Weeks 1 and 3 already carry a segment, so the only week left is week 2 —
	// "two anchors in the same week" is a state this form cannot reach, with the
	// unique index behind it as the structural backstop rather than the first line.
	expect(options.map((option) => option.textContent)).toEqual([
		'Week 2 · 14 Jan 2030',
	])
})

test('weeks before the first anchor are named as Unavailable, never guessed', async () => {
	const late = {
		...SEASON,
		tracks: [
			{
				...SEASON.tracks[0]!,
				anchors: [{ fromWeekKey: '2030-01-21', value: 30 }],
			},
		],
	}
	renderPlan(late)

	// Nothing can price a week with no anchor in force, and the section says so in
	// the athlete's own week numbers rather than leaving a column of dashes.
	expect(
		await screen.findByText(/Weeks 1–2 of your plan read/),
	).toBeInTheDocument()
})
