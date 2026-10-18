/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { draftStart } from '#app/utils/first-run/start-draft.ts'
import { weekIndexOf } from '#app/utils/plan-outline/week-keys.ts'
import { type EditableStrengthTrack } from './__strength-segment-editor.tsx'
import { treningsformViewOf } from './__treningsform-view.ts'
import { type TreningsformView } from './__treningsform.tsx'
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
	/** All three null for an open-ended plan (ADR 0079). */
	eventId: string | null
	eventName: string | null
	eventDate: Date | null
	/** The philosophy the plan follows; absent or null when it follows none. */
	family?: 'classic' | 'masters' | 'big-base' | 'polarized' | 'threshold' | null
	/** An open-ended plan's round, the n of _blokk n av ∞_. */
	round?: number | null
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
	/** `null` means the athlete never authored a **Weekly Capacity** (ADR 0050). */
	weeklyCapacityHours: number | null
	/**
	 * The hours-against-hours fit check, beside the days one and never instead of
	 * it: `peakHours` is the worst week of the run, not what every week asks for.
	 */
	hoursWarnings: Array<{
		fromWeekInPlan: number
		toWeekInPlan: number
		peakHours: number
		weeklyCapacityHours: number
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
	fit: { kind: string; weeks?: number } | null
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

/**
 * The strength track as the section reads it: the blocks a test authors, over the
 * anchors the season it is rendered beside actually carries.
 *
 * Reshaped from the season like `anchorTracksFor`, and for the same reason — the
 * plan page converts each stored week key into the 0-based index off the **Plan
 * Start Week** that both boundary-step rules read (ADR 0040 §3), so a hardcoded
 * `[{ fromWeekIndex: 0 }]` here would be this fixture's own claim about the anchor
 * rather than the season's, and would go on being made after `hybridSeason` moved
 * its lifting anchor anywhere else.
 */
function strengthTrack(
	season: Season,
	segments: StrengthTracks[number]['segments'],
): StrengthTracks {
	const track = season.tracks.find((entry) => entry.trackId === STRENGTH_TRACK)
	return [
		{
			trackId: STRENGTH_TRACK,
			discipline: 'strength',
			currency: 'sets',
			segments,
			// `weekIndexOf` itself and not a lookup in `season.weeks`, because that is
			// what the page calls: an anchor keyed before the plan's first week is a
			// negative index the rules read as "in force from before week one", and a
			// list lookup would drop it and hand the section a different anchor list
			// from the one that priced the weeks.
			anchors: (track?.anchors ?? []).map((anchor) => ({
				fromWeekIndex: weekIndexOf(season.startWeekKey, anchor.fromWeekKey),
			})),
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
	// Never authored either, so the hours check is unavailable rather than passing.
	weeklyCapacityHours: null,
	hoursWarnings: [],
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
		/** Sesong's Events card (ADR 0083); none coming up unless a test says so. */
		seasonEvents?: {
			events: Array<{
				id: string
				name: string
				kind: string
				priority: string
				startDate: Date
			}>
			upcomingCount: number
		}
		/** The first week not yet begun; weeks before it offer no edit. */
		firstUnbegunWeekKey?: string
		/** Bibliotek's lifts (ADR 0101); none unless a test says so. */
		libraryLifts?: Array<{ id: string; name: string }>
		/** The lead's next easy week (ADR 0101 §2); none unless a test says so. */
		nextEasyWeek?: { weekKey: string; weekNumber: number; isThisWeek: boolean }
		/** Where the athlete lands; Avansert open, unless a test says otherwise. */
		at?: string
		/** _Bytt treningsform_'s options (#581); none unless a test says so. */
		treningsform?: TreningsformView
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
				seasonQuery: eventQuery ? { name: 'event', value: eventQuery } : null,
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
				seasonEvents: extra.seasonEvents ?? { events: [], upcomingCount: 0 },
				libraryLifts: extra.libraryLifts ?? [],
				nextEasyWeek: extra.nextEasyWeek ?? null,
				treningsform: extra.treningsform ?? null,
				// No Event of the athlete's waits for a plan unless a test says so.
				attachableEvents: [],
				// Every week of these fixtures is ahead, so each offers its edit.
				firstUnbegunWeekKey:
					extra.firstUnbegunWeekKey ?? season.weeks[0]?.weekKey ?? '2030-01-07',
			}),
			action: action as any,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(
		<App
			initialEntries={[
				// Every Sesong editor lives behind Plan's closed Avansert now (ADR
				// 0101 §2). These suites read the editors, so they land on Avansert
				// the way I dag's Avansert chip does; `?tab=weeks` opens it by itself.
				extra.at ??
					(tab === 'blocks'
						? '/training/plan#avansert'
						: '/training/plan?tab=weeks'),
			]}
		/>,
	)
}

/**
 * Sesong renders a closed section's body only when it opens (ADR 0090): what
 * is behind _Avansert_, a phase card that is not the current one, a week row.
 * A test reading what is inside one opens it first, the way the athlete does —
 * every disclosure under `root` that is still closed, nested ones included.
 * Dialog triggers (`aria-haspopup`) are left alone: they are actions, not
 * sections.
 */
async function openAllIn(root: HTMLElement) {
	for (let round = 0; round < 6; round++) {
		const closed = Array.from(
			root.querySelectorAll<HTMLElement>(
				'[aria-expanded="false"]:not([aria-haspopup]):not([role="combobox"])',
			),
		)
		if (closed.length === 0) return
		for (const trigger of closed) await userEvent.click(trigger)
	}
}

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Open the page-level section whose summary starts with `summary`, if it is
 * not open already, and return what it holds: the trigger's parent.
 */
async function openSection(summary: string | RegExp) {
	const [trigger] = await screen.findAllByRole(
		'button',
		{
			name:
				typeof summary === 'string'
					? new RegExp(`^${escapeRegExp(summary)}`)
					: summary,
		},
		{ timeout: REFUSAL_TIMEOUT },
	)
	if (trigger!.getAttribute('aria-expanded') === 'false') {
		await userEvent.click(trigger!)
	}
	return trigger!.parentElement!
}

/**
 * The season's own _Avansert_, below the readings — not a block card's, which
 * has the same title and comes first on the page.
 */
const SEASON_ADVANCED = /^Avansert\s*Disse endringene/

/** The Weeks reading's rows, each opened onto its targets. */
async function openWeeks() {
	const list = await screen.findByRole(
		'list',
		{ name: 'Treningsuker' },
		{ timeout: REFUSAL_TIMEOUT },
	)
	await openAllIn(list)
	return within(list).getAllByRole('listitem')
}

// ---------------------------------------------------------------------------
// Plan leads with the plain picture (ADR 0101 §2, #577)
// ---------------------------------------------------------------------------

const EASY_WEEK = { weekKey: '2030-01-14', weekNumber: 3, isThisWeek: false }

test('Plan opens on the plain name with the family small and the next easy week', async () => {
	renderPlan({ ...SEASON, family: 'polarized' }, 'blocks', null, undefined, {
		at: '/training/plan',
		nextEasyWeek: EASY_WEEK,
	})

	// The Start Option's own words, so the plan reads as the card picked.
	expect(
		await screen.findByRole('heading', {
			level: 1,
			name: 'Mest rolig, litt veldig hardt',
		}),
	).toBeInTheDocument()
	expect(screen.getByText('Fagnavn: Polarisert 80/20')).toBeInTheDocument()
	expect(
		screen.getByText('Neste lette uke er uke 3, fra 14. jan 2030.'),
	).toBeInTheDocument()
	// Toward the race, by name.
	expect(
		screen.getByRole('link', { name: 'Spring Half Marathon' }),
	).toBeInTheDocument()
})

test('a plan that follows no family is the athlete’s own, and says no family', async () => {
	renderPlan({ ...SEASON, family: null }, 'blocks', null, undefined, {
		at: '/training/plan',
	})

	expect(
		await screen.findByRole('heading', { level: 1, name: 'Din egen plan' }),
	).toBeInTheDocument()
	expect(screen.queryByText(/^Fagnavn:/)).not.toBeInTheDocument()
})

test('the athlete in the easy week is told so, not given a date', async () => {
	renderPlan(SEASON, 'blocks', null, undefined, {
		at: '/training/plan',
		nextEasyWeek: { ...EASY_WEEK, isThisWeek: true },
	})

	expect(
		await screen.findByText('Denne uka er en lett uke.'),
	).toBeInTheDocument()
})

test('an open-ended plan offers Legg til et løp in the lead', async () => {
	renderPlan(
		{
			...SEASON,
			eventId: null,
			eventName: null,
			eventDate: null,
			fit: null,
			round: 2,
			family: 'classic',
		},
		'blocks',
		null,
		undefined,
		{ at: '/training/plan' },
	)

	const lead = await screen.findByRole('region', {
		name: 'Variert og bygger seg opp',
	})
	expect(lead).toHaveTextContent('blokk 2 av ∞')
	expect(
		within(lead).getByRole('button', { name: /Legg til et løp/ }),
	).toBeInTheDocument()
})

test('Bytt treningsform comes after Legg til et løp in the lead, and its preview leaves Avansert closed', async () => {
	const answers = {
		level: 'recreational' as const,
		discipline: 'run' as const,
		hours: 5,
		days: [0, 2, 4, 5] as Array<0 | 2 | 4 | 5>,
		startWeekKey: '2030-01-14',
	}
	const treningsform = treningsformViewOf({
		answers,
		start: draftStart(answers)!,
		current: 'classic',
		levelSaid: true,
	})
	renderPlan(
		{
			...SEASON,
			eventId: null,
			eventName: null,
			eventDate: null,
			fit: null,
			round: 1,
			family: 'classic',
		},
		'blocks',
		null,
		() => ({
			treningsform: {
				result: { status: 'success' },
				confirmResult: null,
				preview: {
					from: 'classic',
					to: 'polarized',
					fromWeekKey: '2030-01-14',
					digest: 'digest-1',
					warnings: [],
					phases: { before: [], after: [] },
					weeks: [],
				},
			},
		}),
		{ at: '/training/plan', treningsform },
	)

	const lead = await screen.findByRole('region', {
		name: 'Variert og bygger seg opp',
	})
	const attach = within(lead).getByRole('button', { name: /Legg til et løp/ })
	const offer = within(lead).getByRole('button', { name: /Bytt treningsform/ })
	expect(
		attach.compareDocumentPosition(offer) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()

	await userEvent.click(offer)
	await userEvent.click(
		within(lead).getByRole('button', {
			name: 'Velg denne: Mest rolig, litt veldig hardt',
		}),
	)

	expect(
		await within(lead).findByRole('button', {
			name: 'Bytt til Mest rolig, litt veldig hardt',
		}),
	).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: /^Avansert\s*Filosofi/ }),
	).toHaveAttribute('aria-expanded', 'false')
})

test('Avansert is closed by default, under Bibliotek, and holds the Sesong editors', async () => {
	renderPlan({ ...SEASON, family: 'classic' }, 'blocks', null, undefined, {
		at: '/training/plan',
	})

	const advanced = await screen.findByRole('button', {
		name: /^Avansert\s*Filosofi, ukemål/,
	})
	expect(advanced).toHaveAttribute('aria-expanded', 'false')
	// Closed means unrendered: none of the editors are on the page yet.
	expect(
		screen.queryByRole('region', { name: 'Endre sesongen' }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByRole('region', { name: 'Filosofi' }),
	).not.toBeInTheDocument()
	// The order ADR 0101 §2 sets: the lead, Bibliotek, then Avansert.
	const library = screen.getByRole('region', { name: 'Bibliotek' })
	const lead = screen.getByRole('region', { name: 'Variert og bygger seg opp' })
	expect(
		lead.compareDocumentPosition(library) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()
	expect(
		library.compareDocumentPosition(advanced) &
			Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()

	await userEvent.click(advanced)

	expect(advanced).toHaveAttribute('aria-expanded', 'true')
	for (const name of ['Endre sesongen', 'Filosofi', 'Hva planen består av']) {
		expect(screen.getByRole('region', { name })).toBeInTheDocument()
	}
	expect(screen.getByRole('list', { name: 'Faser' })).toBeInTheDocument()
})

test('a link to a reading or an edit lands on Avansert open', async () => {
	renderPlan(SEASON, 'blocks', null, undefined, {
		at: '/training/plan?edit=week-target&weekKey=2030-01-14&trackId=track-run',
	})

	expect(
		await screen.findByRole('button', { name: /^Avansert\s*Filosofi/ }),
	).toHaveAttribute('aria-expanded', 'true')
	expect(
		screen.getByRole('region', { name: 'Endre sesongen' }),
	).toBeInTheDocument()
})

test('the season names its Event, its length and where it ends against it', async () => {
	renderPlan()

	expect(
		await screen.findByRole('link', { name: 'Spring Half Marathon' }),
	).toHaveAttribute('href', '/training/events/event-1')
	expect(screen.getByText(/3 uker fra 7\. jan 2030/)).toBeInTheDocument()
	// The plan is never stretched to reach the Event — the shortfall is said out
	// loud instead (ADR 0044 §3).
	expect(
		screen.getByText('Planen slutter 6 uker før uka for løpet.'),
	).toBeInTheDocument()
})

test('Plan is a tab: no way back, and the Events it plans around are on it (ADR 0083, ADR 0101)', async () => {
	renderPlan(SEASON, 'blocks', null, undefined, {
		seasonEvents: {
			events: [
				{
					id: 'event-7',
					name: 'Fjellmaraton',
					kind: 'race',
					priority: 'B',
					startDate: new Date('2030-06-01T00:00:00.000Z'),
				},
			],
			upcomingCount: 4,
		},
	})

	expect(
		await screen.findByRole('heading', { name: 'Plan', level: 1 }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('link', { name: /tilbake til/i }),
	).not.toBeInTheDocument()
	const events = within(
		screen.getByRole('region', { name: 'Løp og arrangementer' }),
	)
	expect(events.getByText('4 kommende')).toBeInTheDocument()
	expect(events.getByRole('link', { name: /Fjellmaraton/ })).toHaveAttribute(
		'href',
		'/training/events/event-7',
	)
	expect(events.getByRole('link', { name: 'Alle løp' })).toHaveAttribute(
		'href',
		'/training/events',
	)
	expect(
		events.getByRole('link', { name: 'Planlegg en ny sesong' }),
	).toHaveAttribute('href', '/training/plan/new')
})

test('a plan that is not finished says what is left, and where to do it', async () => {
	// The default fixture: no ramp anywhere, no pattern, nothing stamped — which is
	// exactly the state an athlete authoring their own blocks lands in.
	renderPlan()

	const next = within(
		await screen.findByRole('region', { name: 'Det som gjenstår' }),
	)
	expect(next.getByText('2 ting igjen')).toBeInTheDocument()
	expect(next.getByText('Gi ukene en stigning')).toBeInTheDocument()
	expect(next.getByText('Si hvordan den typiske uka di ser ut')).toBeVisible()
	// Putting the weeks on the calendar is no step of the athlete's: the weeks
	// fill from the typical week as the horizon reaches them (ADR 0090,
	// decision 14), so nothing here asks for a stamp.
	expect(next.queryByText(/kalenderen|stemple/i)).not.toBeInTheDocument()
	// Each step links to the reading that performs it rather than explaining where
	// to find it.
	expect(next.getByRole('link', { name: 'Sett en stigning' })).toHaveAttribute(
		'href',
		'/training/plan',
	)
	expect(next.getByRole('link', { name: 'Lag uka' })).toHaveAttribute(
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
				// A typical week counts once it has a day in it: the weeks fill from
				// its days, so an empty one fills nothing.
				{
					id: 'pattern-1',
					name: 'Typical week',
					orderIndex: 0,
					days: [shareDay(1, 1)],
				},
			],
		},
		'blocks',
		null,
		undefined,
		{ weeksWithSessions: 2 },
	)

	// Every step done: one quiet line about how far the calendar is filled, and
	// no checklist.
	expect(
		await screen.findByText(
			'2 av 3 uker har økter i kalenderen. Resten fylles når horisonten når dem.',
		),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('region', { name: 'Det som gjenstår' }),
	).not.toBeInTheDocument()
})

test('the track reads its own currency and its authored anchor', async () => {
	renderPlan()

	expect(await screen.findByText(/· i km\/uke/)).toBeInTheDocument()
	expect(screen.getByText(/starter på 50 km\/uke/)).toBeInTheDocument()
})

test('a track’s line never wraps with its separator leading the next line', async () => {
	renderPlan()

	// The name and what follows it are one run of text, and the name is held to
	// its `·` by a no-break space: at 390 px the line breaks *after* the
	// separator, never into "Løping" over "· i km/uke…" (audit B9).
	const text = await screen.findByText(
		/· i km\/uke/,
		{},
		{ timeout: REFUSAL_TIMEOUT },
	)
	// Raw `textContent`: the matchers normalise a no-break space to a space.
	expect(text.textContent).toMatch(/^\u00a0· i km\/uke/)
	expect(text.closest('li')?.textContent).toMatch(/^Løping\u00a0· i km/)
	// The name sits right before it, inside the same run of text.
	expect(text.previousElementSibling).toHaveTextContent(/^Løping$/)
})

test('the Blocks reading lists the phases in order with their spans and rhythm', async () => {
	renderPlan()

	const phases = within(
		await screen.findByRole('list', { name: 'Faser' }),
	).getAllByRole('listitem')
	// ISO weeks: the plan opens on Monday 7 Jan 2030, which is uke 2.
	expect(phases[0]).toHaveTextContent('Grunntrening')
	expect(phases[0]).toHaveTextContent('Uke 2–3')
	expect(phases[0]).toHaveTextContent('3:1')
	expect(phases[1]).toHaveTextContent('Nedtrapping')
	expect(phases[1]).toHaveTextContent('Uke 4')
	expect(phases[1]).toHaveTextContent('Trapper ned')
})

test('the Weeks reading shows each week’s role and its derived target', async () => {
	renderPlan(SEASON, 'weeks')

	const weeks = await openWeeks()
	expect(weeks[0]).toHaveTextContent('Uke 2')
	expect(weeks[0]).toHaveTextContent('7. jan')
	expect(weeks[0]).toHaveTextContent('Grunntrening')
	expect(weeks[0]).toHaveTextContent('hard uke')
	expect(weeks[0]).toHaveTextContent('50 km/uke')
	expect(weeks[2]).toHaveTextContent('Nedtrapping')
	expect(weeks[2]).toHaveTextContent('27,5 km/uke')
	// The reading edits nothing itself (#505 S13): each week links to the Sesong
	// edit, and none of these is hand-set.
	const list = screen.getByRole('list', { name: 'Treningsuker' })
	expect(within(list).queryByRole('spinbutton')).not.toBeInTheDocument()
	expect(
		screen.getByRole('link', { name: 'Endre ukemålet: uke 2 løping' }),
	).toBeInTheDocument()
	expect(screen.queryByText(/^Satt selv/)).not.toBeInTheDocument()
})

test('a week’s chevron says whether that week is open, not whether anything around it is', async () => {
	renderPlan(SEASON, 'weeks')

	const list = await screen.findByRole(
		'list',
		{ name: 'Treningsuker' },
		{ timeout: REFUSAL_TIMEOUT },
	)
	const rows = [...list.querySelectorAll<HTMLElement>(':scope > li')]
	// The chevron closes the week's trigger row.
	const triggerOf = (row: HTMLElement) =>
		row.querySelector<HTMLElement>('[aria-expanded]')!
	// The selector the chevron's rotate class compiles to (audit B5): its own
	// trigger's `data-panel-open`, never a `group` an ancestor could also be.
	const pointsOpen = (row: HTMLElement) => {
		const trigger = triggerOf(row)
		const chevron = trigger.lastElementChild!
		expect(chevron.getAttribute('class')).not.toMatch(/group-open/)
		expect(chevron.classList).toContain('[[data-panel-open]>&]:rotate-180')
		return chevron.matches('[data-panel-open] > *')
	}

	expect(pointsOpen(rows[0]!)).toBe(false)
	await userEvent.click(triggerOf(rows[1]!))
	expect(pointsOpen(rows[1]!)).toBe(true)
	expect(pointsOpen(rows[0]!)).toBe(false)
})

test('a week opens its target edit in Endre sesongen, pre-filled for that week and track', async () => {
	renderPlan(SEASON, 'weeks')

	const weeks = await openWeeks()
	const link = await screen.findByRole('link', {
		name: 'Endre ukemålet: uke 3 løping',
	})
	expect(link.getAttribute('href')).toBe(
		`/training/plan?tab=weeks&edit=week-target&weekKey=2030-01-14&trackId=${RUN_TRACK}#season-edits`,
	)
	const row = within(weeks[1]!)
	expect(row.getByText('55 km/uke')).toBeInTheDocument()
	// Nothing hand-set, so nothing says what the rule would give instead.
	expect(row.queryByText(/Regelen gir/)).not.toBeInTheDocument()
})

test('a week already begun shows its target and offers no edit', async () => {
	renderPlan(SEASON, 'weeks', null, undefined, {
		firstUnbegunWeekKey: '2030-01-14',
	})

	await openWeeks()
	expect(
		await screen.findByRole('link', { name: 'Endre ukemålet: uke 3 løping' }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('link', { name: 'Endre ukemålet: uke 2 løping' }),
	).not.toBeInTheDocument()
})

test('where a week changes, and what 0 means, is stated once under the weeks', async () => {
	renderPlan(SEASON, 'weeks')

	// Blank means something different a third time on this page, and `0` is the one
	// number an athlete would otherwise have to guess at.
	expect(
		await screen.findByText(/der du ser endringen før den gjelder/),
	).toBeInTheDocument()
	expect(screen.getByText(/0 er en uke uten trening/)).toBeInTheDocument()
})

test('a hand-set week is marked, and says what the rule would give instead', async () => {
	renderPlan(
		{ ...SEASON, weeks: [week(1), week(2, { targets: [handSet(42, 55)] })] },
		'weeks',
	)

	const rows = await openWeeks()
	const row = within(rows[1]!)
	// The athlete's own number in the reading, marked in words, and what going
	// back to the plan's target would restore said once the week is opened.
	expect(row.getByText('42 km/uke')).toBeInTheDocument()
	expect(row.getByText('Satt selv')).toBeInTheDocument()
	expect(row.getByText('Satt selv. Regelen gir 55 km/uke.')).toBeInTheDocument()
	// And the week beside it is untouched — an override is a leaf.
	expect(within(rows[0]!).queryByText('Satt selv')).not.toBeInTheDocument()
})

test('a hand-set week the rule cannot price says so', async () => {
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

	await openWeeks()
	expect(
		await screen.findByText(
			'Satt selv. Regelen har ikke noe tall for denne uka.',
		),
	).toBeInTheDocument()
})

test('a week hand-set to 0 reads as a week without training, not as nothing', async () => {
	renderPlan(
		{ ...SEASON, weeks: [week(1, { targets: [handSet(0, 50)] })] },
		'weeks',
	)

	// `0` is a value the athlete authored and needs no flag of its own, so it reads
	// as a zero rather than as "nothing typed" (GLOSSARY.md).
	expect(await screen.findByText('Satt selv')).toBeInTheDocument()
	// Scoped to the week list: the season picture carries every week's figure
	// again, so an unscoped query would match the picture as well as the row.
	const weeks = screen.getByRole('list', { name: 'Treningsuker' })
	expect(within(weeks).getByText('0 km/uke')).toBeInTheDocument()
})

test('a week a track cannot price can still have its target set', async () => {
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
	await openWeeks()
	expect(
		await screen.findByRole('link', {
			name: 'Endre ukemålet: uke 2 styrke',
		}),
	).toBeInTheDocument()
	expect(screen.getByText('Utilgjengelig')).toBeInTheDocument()
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

	expect(await screen.findAllByText('Utilgjengelig')).toHaveLength(3)
	// Both walks price their weeks since ADR 0047 §1, so the only remaining reason a
	// whole column is null is that no anchor covers the plan. The old reason — "a
	// strength track's weekly sets are not derived yet" — is false and is gone.
	expect(
		screen.getByText(
			'Styrke: ukene kan ikke regnes ut – ingen startnivå dekker planen ennå.',
		),
	).toBeInTheDocument()
	expect(screen.queryByText(/ikke utledet ennå/i)).not.toBeInTheDocument()
})

test('both readings are reachable, and the current one says so', async () => {
	renderPlan()

	const blocks = await screen.findByRole('link', { name: 'Blokker' })
	const weeks = screen.getByRole('link', { name: 'Uker' })
	expect(blocks).toHaveAttribute('aria-current', 'page')
	expect(weeks).not.toHaveAttribute('aria-current')
	expect(weeks).toHaveAttribute('href', '/training/plan?tab=weeks')
})

test('switching reading keeps the season being read', async () => {
	// Both params travel together, or tapping Weeks would silently jump from the
	// season the athlete asked for to the nearest one.
	renderPlan(SEASON, 'blocks', 'event-1')

	expect(await screen.findByRole('link', { name: 'Uker' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1&tab=weeks',
	)
	expect(screen.getByRole('link', { name: 'Blokker' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1',
	)
})

// ── Editing the structure: #402 ──────────────────────────────────────────────

/** The phase cards, which are the *direct* items of the Faser list, opened. */
async function phaseCards() {
	const list = await screen.findByRole(
		'list',
		{ name: 'Faser' },
		{ timeout: REFUSAL_TIMEOUT },
	)
	await openAllIn(list)
	return within(list).getAllByRole('listitem')
}

test('every phase links to its own edit in Endre sesongen, and edits no name, length or rhythm itself', async () => {
	renderPlan()

	const [base, taper] = await phaseCards()
	expect(
		within(base!)
			.getByRole('link', { name: 'Endre navn eller lengde på en fase' })
			.getAttribute('href'),
	).toBe('/training/plan?edit=phase&phaseId=phase-base#season-edits')
	expect(
		within(taper!)
			.getByRole('link', { name: 'Endre navn eller lengde på en fase' })
			.getAttribute('href'),
	).toBe('/training/plan?edit=phase&phaseId=phase-taper#season-edits')
	expect(within(base!).queryByRole('textbox', { name: 'Navn' })).toBeNull()
	expect(
		within(base!).queryByRole('button', { name: /Lagre rytme/ }),
	).toBeNull()
})

test('the season’s ends have nothing to swap with, and say so', async () => {
	renderPlan()

	const [base, taper] = await phaseCards()
	expect(
		within(base!).getByRole('button', { name: 'Flytt tidligere' }),
	).toBeDisabled()
	expect(
		within(base!).getByRole('button', { name: 'Flytt senere' }),
	).toBeEnabled()
	expect(
		within(taper!).getByRole('button', { name: 'Flytt senere' }),
	).toBeDisabled()
})

test('a plan’s only phase cannot be removed — that would be deleting the plan', async () => {
	renderPlan({ ...SEASON, phases: [SEASON.phases[0]!], weeks: [week(1)] })

	const [only] = await phaseCards()
	expect(within(only!).getByRole('button', { name: 'Fjern' })).toBeDisabled()
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
	expect(within(cards[0]!).queryByText('Nå')).not.toBeInTheDocument()
	expect(within(cards[1]!).getByText('Nå')).toBeInTheDocument()
	expect(screen.getAllByText('Nå')).toHaveLength(1)
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
	const marks = within(phase!).getByRole('group', { name: 'Ukenes rytme' })
	expect(within(marks).getAllByText(/^Uke \d+:/)).toHaveLength(8)
	expect(within(marks).getByText('Uke 4: lett uke')).toBeInTheDocument()
	expect(within(marks).getByText('Uke 8: lett uke')).toBeInTheDocument()
	expect(
		within(phase!).getByText(/Lette uker: uke 4, uke 8 i fasen/),
	).toBeInTheDocument()
})

test('a phase is added at a position, and the copy promises the start week stays', async () => {
	renderPlan()

	await openSection(SEASON_ADVANCED)
	await openSection('Legg til en fase')
	expect(
		await screen.findByRole('button', { name: 'Legg til fase' }),
	).toBeInTheDocument()
	expect(
		screen.getByText(
			'Planen vokser framover – en ny fase flytter aldri uka planen starter i.',
		),
	).toBeInTheDocument()
	// The insert position is named the way the season reads: at the start, or after
	// a phase the athlete can see.
	expect(
		screen.getByRole('combobox', { name: 'Hvor den skal ligge' }),
	).toBeInTheDocument()
})

test('deleting is confirmed, and the confirmation says what stays', async () => {
	const user = userEvent.setup()
	renderPlan()

	await openSection(SEASON_ADVANCED)
	const section = await openSection('Slett planen')
	await user.click(
		within(section).getByRole('button', {
			name: 'Slett planen',
			expanded: false,
		}),
	)

	const dialog = await screen.findByRole('alertdialog')
	expect(dialog).toHaveTextContent(/fasene, sporene og startnivåene dine/)
	// The half an athlete actually worries about: their training history.
	expect(dialog).toHaveTextContent(/Det rører ikke Spring Half Marathon/)
	expect(dialog).toHaveTextContent(/noen økt du har trent/)
	expect(
		within(dialog).getByRole('button', { name: 'Behold planen' }),
	).toBeInTheDocument()
})

test('a refused edit is said at the top of the reading that asked for it', async () => {
	const user = userEvent.setup()
	renderPlan(SEASON, 'blocks', null, () => ({
		error: 'That phase is no longer part of this plan.',
	}))

	const [base] = await phaseCards()
	await user.click(within(base!).getByRole('button', { name: 'Flytt senere' }))

	expect(
		await screen.findByRole('alert', {}, { timeout: REFUSAL_TIMEOUT }),
	).toHaveTextContent('That phase is no longer part of this plan.')
})

// ── The Season Span headline (ADR 0043) ──────────────────────────────────────

test('a single-track plan reads its Season Span, with the total behind it', async () => {
	renderPlan()

	// Anchor → peak loading week in the track's own currency, never a total as the
	// headline: a total conflates how big a plan is with how long it is.
	expect(await screen.findByText('50 km/uke → 55 km/uke')).toBeInTheDocument()
	// The peak loading week is plan week 2, which is ISO uke 3.
	expect(screen.getByText(/den tyngste harde uka, uke 3/)).toBeInTheDocument()
	expect(screen.getByText(/aldri lagt sammen fra økter/)).toBeInTheDocument()
	// The total is available, and it is secondary.
	expect(screen.getByText(/132,5 km over hele sesongen/)).toBeInTheDocument()
})

test('a single-track headline names no discipline and carries no marker', async () => {
	renderPlan()

	// One figure, so there is nothing to tell apart and nothing was added up.
	expect(await screen.findByText('50 km/uke → 55 km/uke')).toBeInTheDocument()
	expect(screen.queryByText('Utledet')).not.toBeInTheDocument()
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
	expect(await screen.findByText('50 km/uke → 55 km/uke')).toBeInTheDocument()
	expect(screen.getByText('12 sett/uke → 21 sett/uke')).toBeInTheDocument()
	// Named, because there are two figures to tell apart. (The roster below names
	// the same disciplines, which is why these are counted rather than found once.)
	expect(screen.getAllByText('Løping').length).toBeGreaterThan(0)
	expect(screen.getAllByText('Styrke').length).toBeGreaterThan(0)
	expect(screen.queryByText('Utledet')).not.toBeInTheDocument()
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

	expect(
		await screen.findByText('320 TSS/uke → 450 TSS/uke'),
	).toBeInTheDocument()
	// The marker rides on the figure it qualifies, never as a footnote (ADR 0045 §9).
	expect(screen.getByText('Utledet')).toBeInTheDocument()
	expect(screen.getByText('Svømming · Sykling · Løping')).toBeInTheDocument()
	// A derived marker is a promise that a derivation exists, so the reason is said.
	expect(
		screen.getByText(/fordi en TSS er den samme timen med terskelarbeid/),
	).toBeInTheDocument()
	// Plural, because several anchors went into it.
	expect(
		screen.getByText(/regnet ut fra startnivåene og stigningen/),
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

	expect(await screen.findByText('10 t/uke → 14 t/uke')).toBeInTheDocument()
	expect(screen.getByText(/aldri som hvor hard den er/)).toBeInTheDocument()
	// The total is unavailable here, and its absence is silence rather than a zero.
	expect(screen.queryByText(/over hele sesongen/)).not.toBeInTheDocument()
})

// ── Several tracks over one phase timeline (ADR 0043 §1) ─────────────────────

test('the roster offers only the disciplines the plan does not already measure', async () => {
	const user = userEvent.setup()
	renderPlan()

	await openSection('Legg til et spor')
	await user.click(await screen.findByRole('combobox', { name: 'Sport' }))
	const listbox = await screen.findByRole('listbox')

	// Run is already tracked, and one track per Discipline is the rule the picker
	// enforces before the unique index has to.
	expect(
		within(listbox).queryByRole('option', { name: 'Løping' }),
	).not.toBeInTheDocument()
	for (const name of ['Svømming', 'Sykling', 'Styrke']) {
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

	await openSection('Legg til et spor')
	await user.click(await screen.findByRole('combobox', { name: 'Sport' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Sykling',
		}),
	)
	await user.type(screen.getByRole('spinbutton', { name: /Startvolum/ }), '300')
	await user.click(screen.getByRole('button', { name: 'Legg til spor' }))

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

	await openSection('Legg til et spor')
	await user.click(await screen.findByRole('combobox', { name: 'Sport' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Styrke',
		}),
	)

	// Strength speaks `sets` and only `sets`, so there is nothing to pick — a
	// one-option select is the dead control ADR 0044 §8 argues against, and the
	// athlete is never asked for a unit strength cannot express (ADR 0043 §2).
	expect(
		await screen.findByText(/styrkens egen enhet, ikke et valg/),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('combobox', { name: 'Enhet' }),
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

	await openSection('Legg til et spor')
	await user.click(await screen.findByRole('combobox', { name: 'Sport' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Sykling',
		}),
	)

	// Proposed, and named as a proposal: the athlete would quote kilometres, so the
	// plan speaks kilometres (ADR 0043 §2).
	expect(screen.getByRole('combobox', { name: 'Enhet' })).toHaveTextContent(
		'Kilometer i uka',
	)
	expect(
		screen.getByText(/Foreslått fra din egen historikk/),
	).toBeInTheDocument()
	// And the anchor arrives with it, since the two are one act — with the
	// arithmetic said out loud rather than a figure asserted (ADR 0040 §6).
	expect(screen.getByRole('spinbutton', { name: /Startvolum/ })).toHaveValue(80)
	expect(
		screen.getByText(
			/De siste 4 ukene var snittet 80 km\/uke \(320 km til sammen\)/,
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

	await openSection('Legg til et spor')
	await user.click(await screen.findByRole('combobox', { name: 'Sport' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Sykling',
		}),
	)

	expect(screen.getByText(/du trente 2 av dem/)).toBeInTheDocument()
})

test('with no history the add form asks for the unit rather than preselecting one', async () => {
	renderPlan()

	// The form opens on Swim, which this athlete has never trained: nothing is
	// preselected and nothing is pre-filled, because honest beats guessing
	// (ADR 0043 §2) and the alternative is a plan measured in a unit nobody chose.
	await openSection('Legg til et spor')
	expect(
		await screen.findByRole('combobox', { name: 'Enhet' }),
	).toHaveTextContent('Velg enheten du planlegger i')
	expect(
		screen.getByText(/Ingenting i de siste 4 ukene å lese en enhet fra/),
	).toBeInTheDocument()
	expect(screen.getByRole('spinbutton', { name: /Startvolum/ })).toHaveValue(
		null,
	)
	expect(
		screen.getByText(/Ingenting i de siste 4 ukene å lese dette fra/),
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

	await openSection('Legg til et spor')
	await user.click(await screen.findByRole('combobox', { name: 'Sport' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Sykling',
		}),
	)
	await user.click(screen.getByRole('combobox', { name: 'Enhet' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Timer i uka',
		}),
	)

	// Anchor value and Volume Currency are one act (ADR 0043 §2) — a distance number
	// relabelled as hours is a figure nobody authored.
	expect(
		screen.getByRole('spinbutton', { name: /Startvolum \(t\/uke\)/ }),
	).toHaveValue(3)
	expect(
		screen.getByText(/snittet 3 t\/uke \(12 t til sammen\)/),
	).toBeInTheDocument()
})

test('switching the discipline brings that discipline’s figure, same unit or not', async () => {
	const user = userEvent.setup()
	// Two disciplines this athlete has trained, both read in kilometres: the case
	// where the unit does not change and the number must.
	renderPlan(SEASON, 'blocks', null, undefined, {
		trackProposals: [
			read('swim', 'km', 40),
			read('bike', 'km', 320),
			unread('strength'),
		],
	})

	// Typed into, which is what makes this a real repro rather than a re-render: the
	// browser marks a field the athlete has touched as dirty, and a dirty field
	// ignores a new `defaultValue` until it is remounted.
	await openSection('Legg til et spor')
	const anchor = await screen.findByRole('spinbutton', {
		name: /Startvolum/,
	})
	await user.clear(anchor)
	await user.type(anchor, '12')
	await user.click(screen.getByRole('combobox', { name: 'Sport' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Sykling',
		}),
	)

	// Swim and bike both propose `km`, so keying on the unit alone leaves the swim
	// figure — or the athlete's half-typed one — sitting under a label and a
	// derivation sentence that now both say Bike (ADR 0043 §2).
	expect(
		screen.getByRole('spinbutton', { name: /Startvolum \(km\/uke\)/ }),
	).toHaveValue(80)
	expect(
		screen.getByText(/snittet 80 km\/uke \(320 km til sammen\)/),
	).toBeInTheDocument()
})

test('the only track offers no remove control', async () => {
	renderPlan()

	const roster = await screen.findByRole('list', { name: 'Treningsspor' })
	expect(
		within(roster).queryByRole('button', { name: /Fjern/ }),
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
		await screen.findByRole('button', { name: 'Fjern sporet styrke' }),
	)
	expect(screen.getByText(/Fasene står som de er/)).toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Fjern sporet' }))

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
	expect(await screen.findByText(/· i sett\/uke/)).toBeInTheDocument()
	expect(screen.queryByText(/den tyngste harde uka/)).not.toBeInTheDocument()
})

// ── Authoring the progression (ADR 0040) ─────────────────────────────────────

/** The Blocks card for a phase, by its heading. */
async function phaseCard(name: string) {
	const phases = await phaseCards()
	const card = phases.find((item) => item.textContent?.startsWith(name))
	if (!card) throw new Error(`No phase card named ${name}`)
	return within(card)
}

test('an authored ramp shows the number the athlete typed', async () => {
	renderPlan(withSegments([segment(0, { ramp: 0.05 }), segment(1)]))

	const base = await phaseCard('Grunntrening')
	expect(base.getByLabelText(/Stigning, % per harde uke/)).toHaveValue(5)
	expect(base.getByText(/\+5 % hver harde uke/)).toBeInTheDocument()
})

test('an unset ramp is blank and says the block holds level', async () => {
	renderPlan()

	const base = await phaseCard('Grunntrening')
	expect(base.getByLabelText(/Stigning, % per harde uke/)).toHaveValue(null)
	expect(base.getByText(/volumet holder seg flatt/)).toBeInTheDocument()
})

test('an unset cut reads as the convention, not as the convention’s number', async () => {
	renderPlan()

	const base = await phaseCard('Grunntrening')
	// The distinction ADR 0044 §4 requires: the box is empty and the convention is
	// named beside it, so the athlete's plan does not move when the convention does.
	expect(base.getByLabelText(/Kutt i lett uke/)).toHaveValue(null)
	expect(base.getByText(/følger vanlig praksis, −30 %/)).toBeInTheDocument()
})

test('an authored cut of the convention’s own size is visibly the athlete’s', async () => {
	renderPlan(withSegments([segment(0, { recoveryCut: 0.3 }), segment(1)]))

	const base = await phaseCard('Grunntrening')
	expect(base.getByLabelText(/Kutt i lett uke/)).toHaveValue(30)
	expect(base.getByText(/Ditt: −30 %/)).toBeInTheDocument()
	expect(base.queryByText(/følger vanlig praksis/)).not.toBeInTheDocument()
})

test('the season’s opening block offers no boundary step, and says why', async () => {
	renderPlan()

	const base = await phaseCard('Grunntrening')
	expect(
		base.queryByLabelText(/Hopp ved starten av blokka/),
	).not.toBeInTheDocument()
	expect(base.getByText(/ingen blokkgrense å hoppe ved/)).toBeInTheDocument()
})

test('a later block authors a boundary step at its opening', async () => {
	renderPlan(withSegments([segment(0), segment(1, { boundaryStep: -0.2 })]))

	const taper = await phaseCard('Nedtrapping')
	expect(taper.getByLabelText(/Hopp ved starten av blokka/)).toHaveValue(-20)
	expect(taper.getByText(/−20 % én gang, ved starten/)).toBeInTheDocument()
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

	const taper = await phaseCard('Nedtrapping')
	expect(
		taper.queryByLabelText(/Hopp ved starten av blokka/),
	).not.toBeInTheDocument()
	// The same sentence the lifting section gives a dated block in this state: one
	// situation, said one way.
	expect(
		taper.getByText(/Startnivået ditt gjelder fra uka denne blokka starter/),
	).toBeInTheDocument()
	// And the authored −20% still travels, so saving the ramp cannot clear a step
	// the athlete will want back the day they move the anchor off this week.
	const hidden = taper
		.getByRole('button', { name: /Lagre stigning/ })
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

	const taper = await phaseCard('Nedtrapping')
	expect(
		taper.queryByLabelText(/Hopp ved starten av blokka/),
	).not.toBeInTheDocument()
	// Its own reason, not the re-anchor one: what the athlete would change to make
	// the field live is a different edit (Unavailable Metric — the reason is the point).
	expect(
		taper.getByText(/Ingen startnivå dekker denne blokka ennå/),
	).toBeInTheDocument()
	// And the season's own opening keeps the reason it has always had.
	expect(
		(await phaseCard('Grunntrening')).getByText(
			/ingen blokkgrense å hoppe ved/,
		),
	).toBeInTheDocument()
})

test('a taper cut is offered only where the phase tapers', async () => {
	renderPlan()

	const base = await phaseCard('Grunntrening')
	const taper = await phaseCard('Nedtrapping')
	expect(base.queryByLabelText(/Kutt i nedtrappingen/)).not.toBeInTheDocument()
	expect(taper.getByLabelText(/Kutt i nedtrappingen/)).toBeInTheDocument()
	// A tapering phase tapers throughout rather than recovering on a rhythm.
	expect(taper.queryByLabelText(/Kutt i lett uke/)).not.toBeInTheDocument()
})

test('a rate with no field for it still travels, so saving cannot clear it', async () => {
	renderPlan(withSegments([segment(0, { taperCut: 0.4 }), segment(1)]))

	// Base does not taper, so it shows no taper cut field — and must not wipe the
	// stored one on save.
	const base = await phaseCard('Grunntrening')
	const hidden = base
		.getByRole('button', { name: /Lagre stigning/ })
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

	// Ending on its full stop: the block's own reading says the same climb
	// mid-sentence.
	const warning = await screen.findByText(/stiger \+12 % per harde uke\.$/)
	// The warning names the phase, so the athlete knows which card to open.
	expect(warning.closest('li')).toHaveTextContent('Grunntrening')
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

	const copy = await screen.findByText(/Vanlig praksis er \+8 %/)
	// A ramp is a per-week rate and a step happens once, so the sentence must not
	// describe the step with the ramp's "a week".
	expect(copy).toHaveTextContent(
		/per harde uke for stigning, og på én gang for et hopp ved start/,
	)
	expect(copy).toHaveTextContent(/uvanlig, ikke farlig/)
	// The 10% rule has a failed RCT behind it, so no surface may claim otherwise.
	expect(copy).toHaveTextContent(/ingen volumregel er vist å forebygge skader/)
	// And it never blocks: the ramp is stored as authored.
	expect(copy).toHaveTextContent(/lagret slik du skrev dem/)
	expect(
		(await phaseCard('Grunntrening')).getByLabelText(
			/Stigning, % per harde uke/,
		),
	).toHaveValue(12)
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
	expect(await screen.findByText(/Vanlig praksis er \+8 %/)).toBeInTheDocument()
	expect(screen.getByText(/Det er dager mot dager/)).toBeInTheDocument()
	expect(
		screen.getByText(/Det spennet er utledet fra styrkemålet/),
	).toBeInTheDocument()
	// Named for what they close, never a bare ×: three of these in a row is three
	// decisions, and a screen reader is owed which one it is about to make.
	for (const name of [
		'Lukk merknaden om stigning',
		'Lukk merknaden om treningsdager',
		'Lukk merknaden om belastning',
	]) {
		expect(screen.getByRole('button', { name })).toBeEnabled()
	}
})

test('a guard the athlete has read and decided about closes, alone', async () => {
	renderPlan(guardedSeason())

	await userEvent.click(
		await screen.findByRole('button', { name: 'Lukk merknaden om stigning' }),
	)

	expect(screen.queryByText(/Vanlig praksis er \+8 %/)).not.toBeInTheDocument()
	// Focus follows the dismissal instead of dropping to `<body>`: the next Tab
	// resumes where the notice was rather than at the top of the page, and the
	// athlete hears that the button they pressed did something.
	expect(document.activeElement).toHaveTextContent(
		'Merknaden om stigning er lukket.',
	)
	// One notice, one decision: closing the ramp note says nothing about the other two.
	expect(screen.getByText(/Det er dager mot dager/)).toBeInTheDocument()
	expect(
		screen.getByText(/Det spennet er utledet fra styrkemålet/),
	).toBeInTheDocument()
	// And nothing was blocked or unsaved by it — the plan is exactly as authored.
	expect(
		(await phaseCard('Grunntrening')).getByLabelText(
			/Stigning, % per harde uke/,
		),
	).toHaveValue(12)
})

// ── The Quality Session Mix and its derived readings (ADR 0042 §3–§7) ────────

test('the mix offers one field per quality zone, and no fourth kind of work', async () => {
	renderPlan()

	const base = await phaseCard('Grunntrening')
	expect(base.getByLabelText(/Sone 3 tempo/)).toBeInTheDocument()
	expect(base.getByLabelText(/Sone 4 terskel/)).toBeInTheDocument()
	expect(base.getByLabelText(/Sone 5 VO₂maks/)).toBeInTheDocument()
	// Exactly three, because the fields are generated from `QUALITY_ZONES`.
	expect(base.getAllByLabelText(/^Sone \d/)).toHaveLength(3)
	// Neuromuscular work has no position on the metabolic zone axis, so there is
	// nowhere for a speed field to appear rather than a field kept hidden
	// (ADR 0042 §7) — and zones 1–2 are not quality sessions (§3).
	expect(base.queryByLabelText(/fart/i)).not.toBeInTheDocument()
	expect(base.queryByLabelText(/nevromuskulær/i)).not.toBeInTheDocument()
	expect(base.queryByLabelText(/sprint/i)).not.toBeInTheDocument()
	expect(base.queryByLabelText(/Sone 1/)).not.toBeInTheDocument()
	expect(base.queryByLabelText(/Sone 2/)).not.toBeInTheDocument()
})

test('a zone in the mix shows its count, and one that is not shows blank', async () => {
	renderPlan(withSegments([segment(0, { mix: mix({ 4: 2 }) }), segment(1)]))

	const base = await phaseCard('Grunntrening')
	expect(base.getByLabelText(/Sone 4 terskel/)).toHaveValue(2)
	// Blank rather than 0: the row does not exist, and the help text says a blank box
	// leaves the zone out — the opposite of the ramp's "follow the convention" blank.
	expect(base.getByLabelText(/Sone 3 tempo/)).toHaveValue(null)
	expect(base.getByText(/Tomt eller 0 tar sonen ut/)).toBeInTheDocument()
	expect(
		base.getByText(
			/kvalitetsøkter har ingen vanlig praksis å falle tilbake på/,
		),
	).toBeInTheDocument()
})

test('the emphasis label and the count are read off the mix', async () => {
	renderPlan(
		withSegments([segment(0, { mix: mix({ 4: 2, 5: 1 }) }), segment(1)]),
	)

	const base = await phaseCard('Grunntrening')
	// Kind *and* dose, every zone in the mix, ascending (ADR 0042 §5).
	expect(base.getByText('2× terskel + 1× VO₂maks')).toBeInTheDocument()
	expect(base.getByText('Vekt, utledet')).toBeInTheDocument()
	const count = base.getByText('Kvalitetsøkter i uka, utledet')
	expect(count.nextElementSibling).toHaveTextContent('3')
})

test('an empty mix reads as no quality sessions, never as unknown', async () => {
	renderPlan()

	const base = await phaseCard('Grunntrening')
	// The positive statement ADR 0042 §6 makes — not a dash, not "unknown".
	expect(base.getByText('Ingen kvalitetsøkter')).toBeInTheDocument()
	expect(base.queryByText(/ukjent/i)).not.toBeInTheDocument()
	expect(
		base.getByText('Kvalitetsøkter i uka, utledet').nextElementSibling,
	).toHaveTextContent('0')
})

test('neither derived reading is a control the athlete could type into', async () => {
	renderPlan(
		withSegments([segment(0, { mix: mix({ 4: 2, 5: 1 }) }), segment(1)]),
	)

	const base = await phaseCard('Grunntrening')
	// Both are description-list values, and there is no field for either: nobody can
	// name a block for work it does not contain, or hand-set a sum (ADR 0042 §4–§5).
	expect(base.getByText('2× terskel + 1× VO₂maks').tagName).toBe('DD')
	expect(base.queryByLabelText(/^Vekt/)).not.toBeInTheDocument()
	expect(base.queryByLabelText(/Kvalitetsøkter i uka/)).not.toBeInTheDocument()
	expect(
		base.getByText(/Begge leses av kvalitetsøktene du lagret/),
	).toBeInTheDocument()
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
		/ber om 4 kvalitetsøkter i uka, og du kan trene 3 dager i uka/,
	)
	// The locator is a **week span**, not a phase name: a lifting block floats free
	// of the phases, so no phase names the stretch a combined warning is about.
	// Plan weeks 1–2 are ISO uke 2–3.
	expect(notice).toHaveTextContent('Uke 2–3')
	// Days against days, no safety claim, and saved as authored (ADR 0040 §13).
	const copy = screen.getByText(/Det er dager mot dager/)
	expect(copy).toHaveTextContent(/økter mot dagene du trener/)
	expect(copy).toHaveTextContent(/lagret slik du skrev den/)
	expect(copy.textContent).not.toMatch(/skade|farlig|risiko|overtren/i)
	// The retired claim: until ADR 0050 this paragraph said days-against-days was
	// "the only comparison your training availability can make, since it records
	// which weekdays you train and no capacity at all". Training Availability now
	// carries a **Weekly Capacity**, so the sentence is false and must stay gone.
	expect(copy.textContent).not.toMatch(
		/eneste sammenligning|ingen kapasitet|only comparison|no capacity/i,
	)
	// And the mix is on the card exactly as authored.
	expect(
		(await phaseCard('Grunntrening')).getByLabelText(/Sone 4/),
	).toHaveValue(2)
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
		/ber om 3 kvalitetsøkter og 3 styrkeøkter i uka, og du kan trene 4 dager i uka/,
	)
	expect(notice).toHaveTextContent('Uke 4')
	expect(notice.textContent).not.toMatch(/Uke 4–4/)
})

test('availability the athlete never set produces no notice at all', async () => {
	renderPlan(
		withSegments([segment(0, { mix: mix({ 4: 3, 5: 3 }) }), segment(1)]),
	)

	await screen.findByRole('list', { name: 'Faser' })
	// Six quality sessions and no comparison to make: the app does not guess at an
	// availability the athlete never stated, so the reading arrives empty.
	expect(screen.queryByText(/du kan trene/)).not.toBeInTheDocument()
	expect(screen.queryByText(/dager mot dager/)).not.toBeInTheDocument()
	// And nothing about hours either: an unset **Weekly Capacity** is unavailable,
	// which is silence rather than a verdict (ADR 0050).
	expect(screen.queryByText(/kapasitet/i)).not.toBeInTheDocument()
})

// ── Hours against hours: the Weekly Capacity check (ADR 0050) ───────────────

test('a stretch whose hours outrun the Weekly Capacity is noted beside the days check', async () => {
	renderPlan({
		...SEASON,
		weeklyCapacityHours: 8,
		hoursWarnings: [
			{
				fromWeekInPlan: 3,
				toWeekInPlan: 6,
				peakHours: 11.4,
				weeklyCapacityHours: 8,
			},
		],
	})

	const notice = await screen.findByText(
		/ber om opptil 11,4 t\/uke utholdenhetstrening, og kapasiteten din er 8 t\/uke/,
	)
	expect(notice).toHaveTextContent('Uke 4–7')
	// "opptil", because the figure is the run's worst week and not every week's.
	const copy = screen.getByText(/Det er timer mot timer/)
	expect(copy).toHaveTextContent(/lagret slik du skrev den/)
	expect(copy.textContent).not.toMatch(/skade|farlig|risiko|overtren/i)
})

test('a single over-capacity week states its hours flatly, with no "up to"', async () => {
	renderPlan({
		...SEASON,
		weeklyCapacityHours: 6,
		hoursWarnings: [
			{
				fromWeekInPlan: 2,
				toWeekInPlan: 2,
				peakHours: 9,
				weeklyCapacityHours: 6,
			},
		],
	})

	const notice = await screen.findByText(
		/ber om 9 t\/uke utholdenhetstrening, og kapasiteten din er 6 t\/uke/,
	)
	expect(notice).toHaveTextContent('Uke 3')
	expect(notice.textContent).not.toMatch(/opptil/)
})

test('both checks in one notice, each naming what it compared', async () => {
	renderPlan({
		...SEASON,
		trainableWeekdays: 3,
		weeklyCapacityHours: 8,
		availabilityWarnings: [
			{
				fromWeekInPlan: 1,
				toWeekInPlan: 1,
				qualitySessions: 4,
				strengthSessions: 0,
				trainableWeekdays: 3,
			},
		],
		hoursWarnings: [
			{
				fromWeekInPlan: 1,
				toWeekInPlan: 1,
				peakHours: 10,
				weeklyCapacityHours: 8,
			},
		],
	})

	// One dismissible notice and not two: "does my week fit" is one thought.
	expect(
		await screen.findByText(/4 kvalitetsøkter i uka, og du kan trene 3 dager/),
	).toBeInTheDocument()
	expect(screen.getByText(/10 t\/uke utholdenhetstrening/)).toBeInTheDocument()
	expect(
		screen.getAllByRole('button', {
			name: 'Lukk merknaden om treningsdager',
		}),
	).toHaveLength(1)
	expect(screen.getByText(/to ulike sammenligninger/)).toHaveTextContent(
		/en uke kan bomme på den ene uten den andre/,
	)
})

test('a days warning with no capacity says the hours were never checked, and never that they fit', async () => {
	renderPlan({
		...SEASON,
		trainableWeekdays: 3,
		availabilityWarnings: [
			{
				fromWeekInPlan: 1,
				toWeekInPlan: 1,
				qualitySessions: 4,
				strengthSessions: 0,
				trainableWeekdays: 3,
			},
		],
	})

	// The absent capacity is a statement about the *setting*, pointing at the field
	// that would change it — never a verdict on the plan's hours (ADR 0050).
	const line = await screen.findByText(/har ingen ukentlig kapasitet ennå/)
	expect(line).toHaveTextContent(/ingenting her er sjekket mot timene dine/)
	expect(
		within(line).getByRole('link', { name: 'utøverprofilen' }),
	).toHaveAttribute('href', '/settings/profile')
})

// ── The preset gallery (#405) ───────────────────────────────────────────────

/** The shape cards, which are the direct items of the gallery list. */
async function shapeCards() {
	await openSection(SEASON_ADVANCED)
	await openSection('Start fra en form')
	return within(
		await screen.findByRole('list', { name: 'Sesongformer' }),
	).getAllByRole('listitem')
}

test('every shape is on offer, five families at three lengths, each with an Apply', async () => {
	renderPlan()

	const cards = await shapeCards()
	expect(cards).toHaveLength(15)
	// Family first, length within it: the three lengths of one season sit together
	// rather than being scattered across the gallery by week count.
	expect(cards[0]).toHaveTextContent('Klassisk 3:1, kort innkjøring')
	expect(cards[1]).toHaveTextContent(/Tre uker der treningen øker/)
	expect(cards[2]).toHaveTextContent('Klassisk 3:1, lang innkjøring')
	expect(cards[4]).toHaveTextContent('Masters 2:1')
	expect(cards[7]).toHaveTextContent('Stor base')
	expect(cards[10]).toHaveTextContent('Polarisert 80/20')
	expect(cards[13]).toHaveTextContent('Terskelfokus')
	for (const name of [
		'Bruk Klassisk 3:1',
		'Bruk Masters 2:1, kort innkjøring',
		'Bruk Stor base, lang innkjøring',
		'Bruk Polarisert 80/20',
		'Bruk Terskelfokus, kort innkjøring',
	]) {
		expect(screen.getByRole('button', { name })).toBeEnabled()
	}
})

test('once the plan has begun, no shape is offered: Bytt filosofi is, behind its preview', async () => {
	// The plan opens 7 Jan; its first week is lived. A shape would replace every
	// phase, lived weeks included, with no preview (#505 stories 14, 75).
	renderPlan(SEASON, 'blocks', null, undefined, {
		firstUnbegunWeekKey: '2030-01-14',
	})

	await openSection(SEASON_ADVANCED)
	expect(
		await screen.findByText(
			/Planen er i gang, og en ny form ville skrevet over/,
		),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('list', { name: 'Sesongformer' }),
	).not.toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /^Bruk / }),
	).not.toBeInTheDocument()
	expect(
		screen.getByRole('link', { name: 'Til Bytt filosofi' }),
	).toHaveAttribute('href', '#philosophy')
})

test('the edits outside Sesong v1 wait behind Avansert, which says they apply directly', async () => {
	renderPlan()

	// Plan's own Avansert, which holds all of this (ADR 0101 §2), is not one of
	// these lines: it says what it holds, not how its edits apply.
	const advanced = (
		await screen.findAllByRole('button', { name: /^Avansert/ })
	).filter((trigger) => !trigger.hasAttribute('data-plan-advanced'))
	// One per open block card (the current one), and one for the season's own
	// rules.
	expect(advanced.length).toBeGreaterThan(1)
	for (const trigger of advanced) {
		expect(trigger).toHaveAttribute('aria-expanded', 'false')
		expect(trigger).toHaveTextContent(/uten forhåndsvisning/)
	}
	const season = advanced.at(-1)!
	await userEvent.click(season)
	for (const name of ['Start fra en form', 'Startnivå', 'Legg til en fase']) {
		expect(
			within(season.parentElement!).getAllByText(name).length,
		).toBeGreaterThan(0)
	}
	// A block's climb and its place are behind its own Avansert line.
	const block = advanced[0]!
	await userEvent.click(block)
	expect(
		within(block.parentElement!).getByRole('button', { name: 'Flytt senere' }),
	).toBeInTheDocument()
})

test('the gallery states the fitting rule: base first, taper never', async () => {
	renderPlan()
	await shapeCards()

	// A rule that only exists in code is not a documented rule. It is stated here,
	// on `proposeFit`, in ADR 0048 §6 and in `GLOSSARY.md` under Season Fit.
	const gallery = screen.getByRole('region', { name: 'Start fra en form' })
	expect(gallery).toHaveTextContent(
		/Uker tas fra grunntreningen først, så framover gjennom sesongen, og nedtrappingen kortes aldri ned/,
	)
	expect(gallery).toHaveTextContent(/Hver form finnes i tre lengder/)
})

test('a shape is chosen from a picture of the load profile it lays down', async () => {
	renderPlan()

	const classic = (await shapeCards())[1]
	// The illustration is the primary way to choose, so it is a picture with a
	// summary rather than a paragraph — and the season's own length and peak are in
	// that summary, drawn from the preset's real configuration.
	const picture = within(classic!).getByRole('img')
	expect(picture).toHaveAccessibleName(/en belastning over 18 uker/)
	expect(picture).toHaveAccessibleName(/topper på 171\s% av det i uke 15/)
	// Its phases and total length read beside it.
	expect(classic!).toHaveTextContent('18 uker')
	expect(classic!).toHaveTextContent(
		'Grunntrening 8 · Oppbygging 6 · Spissing 2 · Nedtrapping 2',
	)
})

test('the picture’s numbers are reachable, not only its pixels', async () => {
	renderPlan()

	const classic = (await shapeCards())[1]
	const table = within(classic!).getByRole('table')
	expect(table).toHaveTextContent(/hver uke som andel av første uke/)
	// Week 4 of a 3:1 base recovers, and the table says so with its figure — the
	// accessible equivalent ADR 0030 requires of a picture carrying numbers. A
	// shape's weeks are its own (uke 1 is its first), not calendar weeks.
	const week4 = within(table).getByRole('rowheader', { name: 'Uke 4' })
	expect(week4.closest('tr')).toHaveTextContent('Lett uke')
	expect(week4.closest('tr')).toHaveTextContent('77 %')
})

test('the ramp is stated as a convention and claims nothing about injury', async () => {
	renderPlan()
	await shapeCards()

	// `RAMP_GUARD_MAX`'s rule: a convention may be named as a convention and no
	// more. The 10% rule it descends from has a failed RCT behind it.
	const gallery = screen.getByRole('region', { name: 'Start fra en form' })
	expect(gallery).toHaveTextContent(
		/Alle stiger etter vanlig praksis, rundt \+?5 % per harde uke/,
	)
	expect(gallery).toHaveTextContent(/ikke en sikkerhetsgrense/)
	expect(gallery).toHaveTextContent(
		/ingen volumregel er vist å forebygge skader/,
	)
})

test('the two cuts read as the convention’s, never as the shape’s own', async () => {
	renderPlan()
	await shapeCards()

	// A preset stores neither cut (ADR 0044 §4), so the gallery must not read as
	// though a shape had picked −30% and −50%.
	const gallery = screen.getByRole('region', { name: 'Start fra en form' })
	expect(gallery).toHaveTextContent(
		/Lette uker og nedtrapping følger vanlig praksis også – −?30 % fra siste harde uke og −?50 % mot løpet/,
	)
	expect(gallery).toHaveTextContent(/Ingen form velger dem/)
})

test('a card names what makes its shape different from the others', async () => {
	renderPlan()

	const cards = await shapeCards()
	const [classic, masters, bigBase] = [cards[1], cards[4], cards[7]]
	// The rhythm and the boundary step are what differ; both are read off the
	// preset rather than written beside it, so neither can describe an old shape.
	expect(classic!).toHaveTextContent('Rytme 3:1 — tre harde uker, så en lett.')
	expect(masters!).toHaveTextContent('Rytme 2:1 — to harde uker, så en lett.')
	expect(bigBase!).toHaveTextContent(
		/Volumet går −10 % inn i Oppbygging, med vilje/,
	)
	// And the convention prose is stated once for the gallery, not three times.
	expect(screen.getAllByText(/Alle stiger etter vanlig praksis/)).toHaveLength(
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
		screen.getByText(/Å bruke en erstatter blokkene du har nå/),
	).toBeInTheDocument()
	expect(screen.getAllByText('Erstatter blokkene du har nå.')).toHaveLength(15)
	// A warning and never a dialog: this repo warns and never blocks, so the tap
	// submits rather than opening a confirmation in front of a picker.
	await user.click(within(cards[0]!).getByRole('button', { name: /^Bruk/ }))
	expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('a card posts the shape it shows, against the plan being read', async () => {
	renderPlan()

	const masters = (await shapeCards())[4]
	const form = within(masters!)
		.getByRole('button', { name: /^Bruk/ })
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
	await shapeCards()
	expect(
		await screen.findByText(
			/slutter før eller etter løpet i stedet for å strekke en blokk/,
		),
	).toBeInTheDocument()
	expect(
		screen.getByText('Planen slutter 6 uker før uka for løpet.'),
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

	await screen.findByRole('list', { name: 'Faser' })
	expect(screen.queryByText(/Vanlig praksis er/)).not.toBeInTheDocument()
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
	const list = await screen.findByRole('list', { name: 'Ukemønstre' })
	return Array.from(list.children) as HTMLElement[]
}

/** One pattern's day rows, in weekday order. */
async function dayRows(name = 'Dager i Weekday base') {
	return within(await screen.findByRole('list', { name })).getAllByRole(
		'listitem',
	)
}

test('the pattern lists its days Monday-first, each with its track and its kind', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')
	await openSection('Den typiske uka di')

	const rows = await dayRows()
	expect(rows).toHaveLength(3)
	// Monday-first, matching the Training Week rather than the Sunday-first
	// calendar index the profile stores.
	expect(rows[0]).toHaveTextContent('Tirsdag')
	expect(rows[0]).toHaveTextContent('Løping')
	expect(rows[0]).toHaveTextContent('Andel, vekt 1')
	expect(rows[1]).toHaveTextContent('Onsdag')
	expect(rows[1]).toHaveTextContent('5×1000m Z4')
	expect(rows[1]).toHaveTextContent('slik du skrev den, aldri skalert')
	expect(rows[2]).toHaveTextContent('Lørdag')
})

test('each day says what it resolves to against the chosen week’s real target', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')
	await openSection('Den typiske uka di')

	const rows = await dayRows()
	// Week 1 derives 50 km: the fixed 8 km comes off first, and the two shares
	// divide the 42 that are left by weight — 1 against 2.5.
	expect(rows[0]).toHaveTextContent('12 km')
	expect(rows[0]).toHaveTextContent('29 % av det som er igjen')
	expect(rows[1]).toHaveTextContent('8 km')
	expect(rows[2]).toHaveTextContent('30 km')
	expect(rows[2]).toHaveTextContent('71 % av det som er igjen')
})

test('the totals say the week’s target, the fixed volume and the remainder', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')
	await openSection('Den typiske uka di')

	// The order is the arithmetic's: fixed volume is subtracted before the shares
	// divide what is left.
	const target = await screen.findByText('Ukemål')
	expect(target.nextElementSibling).toHaveTextContent('50 km/uke')
	expect(
		screen.getByText('Lagt inn av faste dager').nextElementSibling,
	).toHaveTextContent('8 km')
	expect(
		screen.getByText('Igjen til andelsdagene').nextElementSibling,
	).toHaveTextContent('42 km')
})

test('a different week resolves to different volumes, from that week’s own target', async () => {
	// Week 2 derives 55 km. Nothing about the pattern changed — the week did.
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, undefined, {
		week: '2030-01-14',
	})
	await openSection('Den typiske uka di')

	const rows = await dayRows()
	expect(rows[0]).toHaveTextContent('13,4 km')
	expect(rows[2]).toHaveTextContent('33,6 km')
	// The fixed session is the same session in a bigger week: prescribed, not scaled.
	expect(rows[1]).toHaveTextContent('8 km')
	expect(
		screen.getByText('Igjen til andelsdagene').nextElementSibling,
	).toHaveTextContent('47 km')
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
	await openSection('Den typiske uka di')

	const rows = await dayRows()
	expect(within(rows[0]!).getByText('Utilgjengelig')).toBeInTheDocument()
	expect(rows[0]).toHaveTextContent(/Uka har ikke noe utregnet mål for løping/)
	expect(rows[0]).not.toHaveTextContent(/(^|\D)0 km/)
	// The fixed day still reads: its volume is prescribed by the session itself, so
	// it does not depend on the week having a target at all.
	expect(rows[1]).toHaveTextContent('8 km')
	expect(
		screen.getByText('Igjen til andelsdagene').nextElementSibling,
	).toHaveTextContent('Utilgjengelig')
})

test('a prescribed session the currency cannot read costs the shares their number', async () => {
	renderPlan(
		withPatterns([
			pattern([shareDay(1, 1), fixedDay(2, null), shareDay(5, 2.5)]),
		]),
		'weeks',
	)
	await openSection('Den typiske uka di')

	// Honest about *why* there is no number, and it does not guess a price.
	const notice = await screen.findByText(/Én fast dag kan ikke leses i km/)
	expect(notice).toHaveTextContent(/uka kan ikke deles/)
	expect(notice).toHaveTextContent(/et tall appen fant på/)
	const rows = await dayRows()
	expect(within(rows[0]!).getByText('Utilgjengelig')).toBeInTheDocument()
	expect(rows[0]).toHaveTextContent(
		/En fast økt i mønsteret kan ikke leses i km/,
	)
	expect(rows[1]).toHaveTextContent(/kan ikke leses i km/)
})

test('fixed days over the week’s target warn, and nothing claims to correct them', async () => {
	renderPlan(
		withPatterns([pattern([fixedDay(2, 55), shareDay(5, 1)])]),
		'weeks',
	)
	await openSection('Den typiske uka di')

	const notice = await screen.findByText(
		/De faste øktene for løping legger inn/,
	)
	expect(notice).toHaveTextContent('55 km')
	expect(notice).toHaveTextContent('50 km/uke')
	// The athlete prescribed those intervals: the warning reports and never
	// corrects, and no copy may suggest the app changed a session.
	expect(notice).toHaveTextContent(/De står slik du skrev dem/)
	expect(notice).toHaveTextContent(
		/ingenting her korter ned en økt du har skrevet/,
	)
	expect(notice.textContent).not.toMatch(
		/krympet|kortet ned|redusert|skalert ned|justert|begrenset/i,
	)
	expect(notice.textContent).not.toMatch(/skade|farlig|risiko|overtren/i)
	// And there is genuinely nothing left for the share day — a resolved 0, said as
	// a number, not as an Unavailable.
	expect((await dayRows())[1]).toHaveTextContent(/(^|\D)0 km/)
})

test('a pattern at either end of the order has nothing to swap with', async () => {
	renderPlan(
		withPatterns([
			WEEKDAY_PATTERN,
			pattern([shareDay(1, 1)], { id: 'pattern-2', name: 'Race week' }),
		]),
		'weeks',
	)
	await openSection('Den typiske uka di')

	const [first, second] = await patternCards()
	expect(
		within(first!).getByRole('button', { name: 'Flytt tidligere' }),
	).toBeDisabled()
	expect(
		within(first!).getByRole('button', { name: 'Flytt senere' }),
	).toBeEnabled()
	expect(
		within(second!).getByRole('button', { name: 'Flytt senere' }),
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
	await openSection('Den typiske uka di')

	const rows = await dayRows()
	expect(
		within(rows[0]!).getByRole('button', { name: 'Tidligere på dagen' }),
	).toBeDisabled()
	expect(
		within(rows[0]!).getByRole('button', { name: 'Senere på dagen' }),
	).toBeEnabled()
	expect(
		within(rows[1]!).getByRole('button', { name: 'Senere på dagen' }),
	).toBeDisabled()
	// Saturday holds one session, so there is nothing to order and no control for
	// it — a weekday's order is scoped to that weekday.
	expect(
		within(rows[2]!).queryByRole('button', { name: 'Tidligere på dagen' }),
	).not.toBeInTheDocument()
})

test('deleting a pattern is confirmed, and the confirmation says what stays', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')
	await openSection('Den typiske uka di')

	await user.click(
		await screen.findByRole('button', { name: 'Slett mønsteret' }),
	)

	const dialog = await screen.findByRole('alertdialog')
	expect(dialog).toHaveTextContent(/fjerner Weekday base og de 3 dagene/)
	// The half an athlete worries about — and here there is a second half: the
	// weeks already filled from it keep their sessions.
	expect(dialog).toHaveTextContent(/hver økt du har trent blir stående/)
	expect(dialog).toHaveTextContent(
		/økter som allerede er lagt inn i kalenderen blir også stående/,
	)
	expect(
		within(dialog).getByRole('button', { name: 'Behold mønsteret' }),
	).toBeInTheDocument()
})

test('deleting a pattern with no days yet reads as a sentence, never “its 0 days”', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([pattern([])]), 'weeks')
	await openSection('Den typiske uka di')

	await user.click(
		await screen.findByRole('button', { name: 'Slett mønsteret' }),
	)

	// A named pattern nobody has filled in yet is an ordinary state, and it reads
	// as one.
	const dialog = await screen.findByRole('alertdialog')
	expect(dialog).toHaveTextContent(
		/fjerner Weekday base, som ikke har noen dager ennå/,
	)
	expect(dialog).not.toHaveTextContent('0 dager')
})

test('a day is added by weekday, track and kind — and by no volume or zone', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')
	await openSection('Den typiske uka di')

	// Scoped to the day form: the claim is about what a **pattern day** authors, and
	// the page also carries a track's own starting volume, which is a different act
	// on a different object.
	const form = (
		await screen.findByRole('combobox', { name: 'Ukedag' })
	).closest('form')!
	expect(
		within(form).getByRole('combobox', { name: 'Spor' }),
	).toBeInTheDocument()
	expect(
		within(form).getByRole('combobox', { name: 'Hva slags dag' }),
	).toBeInTheDocument()
	// A pattern day carries no absolute volume and no zone: there is nowhere for
	// either to be typed rather than a field that is validated away. The scoping to
	// `form` is load-bearing, not tidiness: the season chart's plot carries an
	// `aria-label` containing the word "volume", and `queryByLabelText` reads an
	// `aria-label` as readily as a field's `<label>` (#413).
	expect(within(form).queryByLabelText(/volum/i)).not.toBeInTheDocument()
	expect(within(form).queryByLabelText(/sone/i)).not.toBeInTheDocument()
	expect(within(form).queryByLabelText(/distanse/i)).not.toBeInTheDocument()
	expect(
		within(form).getByRole('button', { name: 'Legg til dag' }),
	).toBeEnabled()
})

test('choosing a share day asks for its weight, and a fixed one for its workout', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')
	await openSection('Den typiske uka di')

	// A fixed day prescribes a Workout and takes no weight.
	expect(
		await screen.findByRole('combobox', { name: 'Økt' }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('spinbutton', { name: 'Relativ vekt' }),
	).not.toBeInTheDocument()

	await user.click(screen.getByRole('combobox', { name: 'Hva slags dag' }))
	const listbox = await screen.findByRole('listbox')
	await user.click(
		within(listbox).getByRole('option', { name: /Andel av uka/ }),
	)

	expect(
		await screen.findByRole('spinbutton', { name: 'Relativ vekt' }),
	).toHaveValue(1)
	// The Workout becomes an optional *shape* rather than a prescription.
	expect(
		screen.getByRole('combobox', { name: 'Form (valgfri)' }),
	).toBeInTheDocument()
})

test('a share day opens with no shape, and never inherits the fixed day’s workout', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')
	await openSection('Den typiske uka di')

	// A fixed day *is* its Workout, so pre-selecting the newest is right there.
	expect(
		await screen.findByRole('combobox', { name: 'Økt' }),
	).toHaveTextContent('5×1000m Z4')

	await user.click(screen.getByRole('combobox', { name: 'Hva slags dag' }))
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Andel av uka',
		}),
	)

	// A shape is optional, so it opens unchosen: adding a share day and touching
	// nothing must not store it "shaped on" whichever Workout happened to be newest.
	expect(
		await screen.findByRole('combobox', { name: 'Form (valgfri)' }),
	).toHaveTextContent('Ingen form – bare volum')
	expect(document.querySelector('input[name="workoutId"]')).toHaveValue('')
})

test('the kind selector names the kind, and the rule is said under the field', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks')
	await openSection('Den typiske uka di')

	// Short enough not to clip in a 316 px trigger at the 390 px reference (§2.5)…
	const kind = await screen.findByRole('combobox', { name: 'Hva slags dag' })
	expect(kind).toHaveTextContent('Fast økt')

	// …with the rule the choice carries stated in full under the field.
	expect(
		screen.getByText(/aldri skalert – de samme dragene i en stor uke/),
	).toBeInTheDocument()

	await user.click(kind)
	await user.click(
		within(await screen.findByRole('listbox')).getByRole('option', {
			name: 'Andel av uka',
		}),
	)

	expect(
		await screen.findByText(/En relativ vekt, fordelt over uka/),
	).toBeInTheDocument()
})

test('the workout picker offers only the chosen track’s own discipline', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, undefined, {
		workouts: [BIKE_WORKOUT, ...WORKOUTS],
	})
	await openSection('Den typiske uka di')

	await user.click(await screen.findByRole('combobox', { name: 'Økt' }))
	const options = within(await screen.findByRole('listbox')).getAllByRole(
		'option',
	)

	// The plan's only track is run: a bike session here would fund a run week with
	// bike duration, so it is not on offer at all.
	expect(options.map((option) => option.textContent)).toEqual([
		'5×1000m Z4 · Løping',
		'Easy 45 min · Løping',
	])
})

test('a track with no workout of its own discipline offers no fixed day, and says why', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, undefined, {
		workouts: [BIKE_WORKOUT],
	})
	await openSection('Den typiske uka di')

	// No dead picker and no fixed kind: the same posture as having no Workouts at
	// all, because from this track's side there are none.
	expect(
		screen.queryByRole('combobox', { name: 'Økt' }),
	).not.toBeInTheDocument()
	expect(
		await screen.findByText(/du har ingen økt i løping ennå/),
	).toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'skriv en økt' })).toHaveAttribute(
		'href',
		'/training/sessions/new',
	)

	await user.click(screen.getByRole('combobox', { name: 'Hva slags dag' }))
	const options = within(await screen.findByRole('listbox')).getAllByRole(
		'option',
	)
	expect(options.map((option) => option.textContent)).toEqual(['Andel av uka'])
})

test('an athlete with no workouts is told why, and pointed at authoring one', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, undefined, {
		workouts: [],
	})
	await openSection('Den typiske uka di')

	// No dead picker: the reason and the way out, and a share day still available.
	expect(
		await screen.findByRole('link', { name: 'skriv en økt' }),
	).toHaveAttribute('href', '/training/sessions/new')
	expect(screen.getByText(/du har ingen ennå/)).toBeInTheDocument()
	expect(
		screen.queryByRole('combobox', { name: 'Økt' }),
	).not.toBeInTheDocument()
	expect(
		screen.getByRole('spinbutton', { name: 'Relativ vekt' }),
	).toBeInTheDocument()
})

test('the chosen week is URL state, and travels with the season being read', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', 'event-1', undefined, {
		week: '2030-01-14',
	})
	await openSection('Den typiske uka di')

	// Both other params travel with it, so switching reading keeps the week the
	// pattern is being read against.
	expect(await screen.findByRole('link', { name: 'Blokker' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1&week=2030-01-14',
	)
	expect(screen.getByRole('link', { name: 'Uker' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1&tab=weeks&week=2030-01-14',
	)
	// The chooser is a GET form, so a week can be linked and reloaded into.
	const chooser = screen.getByRole('combobox', { name: 'Les mot' })
	expect(chooser.closest('form')).toHaveAttribute('method', 'get')
	expect(
		screen.getByRole('button', { name: 'Les denne uka' }),
	).toBeInTheDocument()
})

test('the plan’s first week needs no param, exactly like the default reading', async () => {
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', 'event-1')
	await openSection('Den typiske uka di')

	expect(await screen.findByRole('link', { name: 'Blokker' })).toHaveAttribute(
		'href',
		'/training/plan?event=event-1',
	)
})

test('an athlete with no pattern reads that, and is offered one', async () => {
	renderPlan(SEASON, 'weeks')
	await openSection('Den typiske uka di')

	expect(await screen.findByText('Ingen typisk uke ennå.')).toBeInTheDocument()
	// The offer first — a week built from what the app already knows — and the
	// empty pattern still there for an athlete who wants to type their own.
	expect(
		screen.getByRole('button', { name: 'Lag en typisk uke for meg' }),
	).toBeEnabled()
	expect(screen.getByRole('button', { name: 'Legg til mønster' })).toBeEnabled()
	// And no preview figures at all, rather than a preview of nothing.
	expect(screen.queryByText('Igjen til andelsdagene')).not.toBeInTheDocument()
})

test('the starter week names the athlete’s own days, or says it is a convention', async () => {
	// Never set: the copy says it is a starting point and claims to have read
	// nothing about them (ADR 0044 §4's rule for a convention, applied to copy).
	renderPlan(SEASON, 'weeks')
	await openSection('Den typiske uka di')
	expect(
		await screen.findByText(/en uke med fire dager som utgangspunkt/),
	).toBeInTheDocument()

	cleanup()

	renderPlan({ ...SEASON, trainableWeekdays: 3 }, 'weeks')
	await openSection('Den typiske uka di')
	expect(
		await screen.findByText(/fra de 3 dagene du sier du kan trene/),
	).toBeInTheDocument()
})

test('a pattern with no share day says what nothing absorbs', async () => {
	renderPlan(withPatterns([pattern([fixedDay(2, 8)])]), 'weeks')
	await openSection('Den typiske uka di')

	expect(
		(await screen.findByText('Tatt av ingen dag')).nextElementSibling,
	).toHaveTextContent('42 km')
	// A pattern does not have to spend the whole week, so this states the fact and
	// asks for nothing.
	expect(screen.getByText(/så ingenting tar resten av uka/)).toBeInTheDocument()
})

test('a refused pattern edit is said at the top of the reading that asked for it', async () => {
	const user = userEvent.setup()
	renderPlan(withPatterns([WEEKDAY_PATTERN]), 'weeks', null, () => ({
		error: 'That week pattern is no longer part of this plan.',
	}))
	await openSection('Den typiske uka di')

	await user.click(await screen.findByRole('button', { name: 'Gi nytt navn' }))

	expect(
		await screen.findByRole('alert', {}, { timeout: REFUSAL_TIMEOUT }),
	).toHaveTextContent('That week pattern is no longer part of this plan.')
})

// ── The strength Training Track's dated blocks (#409, ADR 0047) ─────────────

/** The lifting cards, which are the direct items of the Lifting blocks list. */
async function blockCards() {
	await openSection(SEASON_ADVANCED)
	await openSection('Styrkeblokker')
	return within(
		await screen.findByRole('list', { name: 'Styrkeblokker' }),
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
	const season = hybridSeason()
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, [block()]),
	})

	const [first] = await blockCards()
	expect(first).toHaveTextContent('Uke 2–3')
	expect(first).toHaveTextContent('Muskelvekst')
	expect(first).toHaveTextContent('3× i uka')
	// The whole block is one save: the window moves and the rates are rewritten
	// together, because a moved block and a resized one are the same action.
	expect(
		within(first!).getByRole('button', { name: 'Lagre blokka' }),
	).toBeEnabled()
	expect(
		within(first!).getByRole('button', { name: 'Fjern blokka' }),
	).toBeEnabled()
	// And it sits outside the Faser list: a dated block has no phase card.
	expect(
		within(await screen.findByRole('list', { name: 'Faser' })).queryByText(
			/Styrkeblokk/,
		),
	).not.toBeInTheDocument()
})

test('the section says what `sets` means and attaches no citable range to it', async () => {
	const season = hybridSeason()
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, [block()]),
	})

	await blockCards()
	const copy = await screen.findByText(/Sporet planlegges i/)
	expect(copy).toHaveTextContent(/ukas arbeidssett til sammen/)
	expect(copy).toHaveTextContent(/for hele kroppen/)
	expect(copy).toHaveTextContent(/ikke noe publisert tall å holde det opp mot/)
	// Nobody publishes a systemic weekly set count, so no range may be presented as
	// though somebody did — not ACSM's ≥10, not RP's per-muscle 10–20.
	expect(copy.textContent).not.toMatch(/\d+\s*[–-]\s*\d+\s*sett/)
	expect(copy.textContent).not.toMatch(/≥\s*\d+\s*sett/)
})

test('the derived band moves with the goal, and there is no input for it', async () => {
	const season = hybridSeason()
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, [
			block({ goal: 'maximal-strength' }),
		]),
	})

	const [card] = await blockCards()
	const band = within(card!)
	expect(
		band.getByText('Belastning, utledet').nextElementSibling,
	).toHaveTextContent('80–100 % 1RM')
	expect(
		band.getByText('Repetisjoner, utledet').nextElementSibling,
	).toHaveTextContent('1–6 rep')
	// Derived and unauthorable: there is no control for either, which is what makes
	// `30 sett/uke at 90 % 1RM` unauthorable rather than merely guarded (ADR 0047 §3).
	expect(band.queryByLabelText(/1RM/i)).not.toBeInTheDocument()
	expect(band.queryByLabelText(/^Belastning/)).not.toBeInTheDocument()
	expect(band.queryByLabelText(/repetisjon/i)).not.toBeInTheDocument()
	expect(band.getByText(/det er ingenting å skrive/)).toBeInTheDocument()
})

test('nothing on a lifting block derives sets a week from the goal', async () => {
	const season = hybridSeason()
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, [block({ goal: 'hypertrophy' })]),
	})

	const [card] = await blockCards()
	// ACSM states hypertrophy as ≥10 sets/wk, and reading that off the goal would
	// give the plan two sources for one number (ADR 0047 §1/§3).
	expect(card!.textContent).not.toMatch(/\d+\s*sett\/uke/)
	expect(within(card!).getByText(/leses ikke av målet/)).toBeInTheDocument()
})

test('an unset deload cut reads as the convention, and an authored one as theirs', async () => {
	const season = hybridSeason()
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, [
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
	expect(within(unset!).getByLabelText(/Kutt i avlastning/)).toHaveValue(null)
	expect(
		within(unset!).getByText(
			/følger vanlig praksis, −50 % hver avlastningsuke/,
		),
	).toBeInTheDocument()
	expect(within(authored!).getByLabelText(/Kutt i avlastning/)).toHaveValue(50)
	expect(within(authored!).getByText(/^Ditt: −50 %/)).toBeInTheDocument()
	expect(
		within(authored!).queryByText(/følger vanlig praksis, −50 % hver/),
	).not.toBeInTheDocument()
})

test('a week outside every lifting block reads “no lifting”, never a dash', async () => {
	const season = hybridSeason()
	renderPlan(season, 'weeks', null, undefined, {
		strengthTracks: strengthTrack(season, [block()]),
	})

	const weeks = within(
		await screen.findByRole('list', { name: 'Treningsuker' }),
	).getAllByRole('listitem')
	expect(weeks[0]).toHaveTextContent('12 sett/uke')
	// Week 3 is in the gap between blocks: the authored "no lifting these weeks",
	// a positive statement and never an Unavailable Metric (ADR 0047 §6).
	expect(within(weeks[2]!).getByText('Ingen styrke')).toBeInTheDocument()
	expect(within(weeks[2]!).queryByText('Utilgjengelig')).not.toBeInTheDocument()
	expect(within(weeks[2]!).queryByText('0 sett/uke')).not.toBeInTheDocument()
})

test('a lifting block’s deload week is visible on the week it lands in', async () => {
	const season = hybridSeason()
	renderPlan(season, 'weeks', null, undefined, {
		// Two weeks, the second of which is the block's own tail.
		strengthTracks: strengthTrack(season, [
			block({ weeks: 2, deloadWeeks: 1 }),
		]),
	})

	const weeks = within(
		await screen.findByRole('list', { name: 'Treningsuker' }),
	).getAllByRole('listitem')
	expect(weeks[0]).not.toHaveTextContent('Avlastning')
	expect(weeks[1]).toHaveTextContent('Avlastning')
	// Beside the week's own role and never instead of it: the phase rhythm is still
	// loading that week, and a week carries one role of each kind (ADR 0047 §6).
	expect(weeks[1]).toHaveTextContent('hard uke')
	expect(weeks[1]).toHaveTextContent('13 sett/uke')
})

test('the deload note says the block’s tail is intent, not a phase mismatch', async () => {
	const season = hybridSeason()
	renderPlan(season, 'weeks', null, undefined, {
		strengthTracks: strengthTrack(season, [
			block({ weeks: 2, deloadWeeks: 1 }),
		]),
	})

	const copy = await screen.findByText(
		/Avlastning er slutten på en styrkeblokk/,
	)
	expect(copy).toHaveTextContent(/Den kommer fra ukene du ga blokka/)
	expect(copy).toHaveTextContent(/rytmen i fasene når den ikke/)
	// A lifter's deload landing on a different week from a runner's recovery week
	// is the point of a dated block, so nothing may read it as a fault.
	expect(copy.textContent).not.toMatch(
		/inkonsekvent|uoverensstemm|konflikt|burde stemme|feil/i,
	)
})

test('a plan whose blocks have no deload week says nothing about deloads', async () => {
	// A positively authored "no deload", which is not the same as leaving it blank:
	// both of the block's weeks load, and the week after it is still the gap.
	const season = hybridSeason({}, ['loading', 'loading', 'gap'])
	renderPlan(season, 'weeks', null, undefined, {
		strengthTracks: strengthTrack(season, [
			block({ weeks: 2, deloadWeeks: 0 }),
		]),
	})

	await screen.findByRole('list', { name: 'Treningsuker' })
	expect(screen.queryByText(/Avlastning/)).not.toBeInTheDocument()
})

test('each track states its own currency, and no track states a span of its own', async () => {
	const season = hybridSeason()
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, [block()]),
	})

	// Each track in *its* Volume Currency, never converted (ADR 0043 §4–§5).
	expect(
		await screen.findByText(/· i sett\/uke · starter på 12 sett\/uke/),
	).toBeInTheDocument()
	expect(
		screen.getByText(/· i km\/uke · starter på 50 km\/uke/),
	).toBeInTheDocument()
	// And no per-track **Season Span** in the roster: a span belongs to a
	// commensurability group rather than to a track (ADR 0043 §5), and the headline
	// above is the one place the grouping is rendered.
	const roster = screen.getByRole('list', { name: 'Treningsspor' })
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
		{ strengthTracks: strengthTrack(season, [block({ ramp: 0.15 })]) },
	)

	const warning = await screen.findByText(/stiger \+15 % per harde uke/)
	expect(warning.closest('li')).toHaveTextContent(
		'Styrke stiger +15 % per harde uke, i blokka som starter i Grunntrening.',
	)
	const copy = screen.getByText(/Vanlig praksis er \+8 %/)
	expect(copy).toHaveTextContent(
		/datert og ikke knyttet til en fase, så fasen som nevnes ved en slik blokk er bare der den første uka faller/,
	)
	// Still a convention, still no injury claim.
	expect(copy).toHaveTextContent(/uvanlig, ikke farlig/)
	expect(copy.textContent).not.toMatch(/skaderisiko|farlig stigning/i)
})

test('a session outside its block’s band warns, and says the band is derived', async () => {
	const season = hybridSeason({
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
	})
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, [
			block({ goal: 'maximal-strength' }),
		]),
	})

	const link = await screen.findByRole('link', { name: /Uke 2, 9\. jan/ })
	expect(link).toHaveAttribute('href', '/training/sessions/session-9')
	expect(link.closest('li')).toHaveTextContent(
		/er lagt inn med 60 %, 65 % 1RM, utenfor 80–100 % 1RM som maksimal styrke trener i\./,
	)
	const copy = screen.getByText(/Det spennet er utledet fra styrkemålet/)
	expect(copy).toHaveTextContent(/utledet/)
	expect(copy).toHaveTextContent(/aldri skrevet ved siden av/)
	// Warns and never blocks (ADR 0042 §9).
	expect(copy).toHaveTextContent(/en merknad og ikke en grense/)
	expect(copy).toHaveTextContent(/lagret slik du skrev dem/)
})

test('a dismissed band note comes back when the goal moves the band', async () => {
	const user = userEvent.setup()
	const season = hybridSeason({
		bandWarnings: [
			{
				sessionId: 'session-9',
				scheduledAt: new Date('2030-01-09T17:00:00.000Z'),
				weekInPlan: 1,
				goal: 'hypertrophy',
				band: { minPct1RM: 70, maxPct1RM: 85 },
				outsidePct1RMs: [55],
			},
		],
	})
	renderPlan(
		season,
		'blocks',
		null,
		() => {
			// The save the athlete just made: the block is authored for maximal strength
			// now, so the derived band moved under the very same session (ADR 0047 §3).
			season.bandWarnings = [
				{
					...season.bandWarnings[0]!,
					goal: 'maximal-strength',
					band: { minPct1RM: 80, maxPct1RM: 100 },
				},
			]
			return { ok: true }
		},
		{ strengthTracks: strengthTrack(season, [block()]) },
	)

	await user.click(
		await screen.findByRole('button', { name: 'Lukk merknaden om belastning' }),
	)
	expect(
		screen.queryByText(/Det spennet er utledet fra styrkemålet/),
	).not.toBeInTheDocument()

	await blockCards()
	await user.click(screen.getByRole('button', { name: 'Lagre blokka' }))

	// The sessions named never changed, so a key of session ids would hold the
	// dismissal over a sentence the athlete has not read — which is the one failure
	// the re-keying exists to prevent. What the notice *says* is what it is keyed on.
	expect(
		await screen.findByText(
			/utenfor 80–100 % 1RM som maksimal styrke trener i/,
			{},
			{ timeout: REFUSAL_TIMEOUT },
		),
	).toBeInTheDocument()
})

test('each Unavailable reading gets its own sentence and its own reason', async () => {
	const season = hybridSeason({
		unavailableReadings: [
			'hours-calendar-cost',
			'combined-cross-track-load',
			'strength-ctl',
		],
	})
	renderPlan(season, 'weeks', null, undefined, {
		strengthTracks: strengthTrack(season, [block()]),
	})

	// Behind its own disclosure (ADR 0090): a footnote to the plan, opened when
	// the athlete asks what is missing.
	await openSection('Hva planen ikke kan si')
	const reasons = within(
		await screen.findByRole('region', { name: 'Hva planen ikke kan si' }),
	).getAllByRole('listitem')
	// Three readings, three reasons — never one line over three dashes, because
	// each is Unavailable for something different (ADR 0047 §5).
	expect(reasons).toHaveLength(3)
	expect(reasons[0]).toHaveTextContent(
		/Hva uka koster i timer kan ikke regnes ut/,
	)
	expect(reasons[0]).toHaveTextContent(
		/ingenting her lagrer hvor lang en økt er/,
	)
	expect(reasons[1]).toHaveTextContent(/Styrketrening har ingen TSS/)
	expect(reasons[2]).toHaveTextContent(
		/å prise en styrkeøkt som timer × en antatt intensitet/,
	)
	expect(screen.queryByText('—')).not.toBeInTheDocument()
})

test('the lifter reads what the plan cannot tell them while authoring blocks', async () => {
	const season = hybridSeason({
		unavailableReadings: ['combined-cross-track-load'],
	})
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, [block()]),
	})

	// The notice lived inside the Weeks reading, where the lifter shaping the block
	// that causes it never was. It sits above both readings now, so the sentence
	// arrives with the authoring rather than one tab away from it (story 49).
	await openSection('Hva planen ikke kan si')
	const notice = await screen.findByRole('region', {
		name: 'Hva planen ikke kan si',
	})
	expect(notice).toHaveTextContent(/Styrketrening har ingen TSS/)
	expect(await blockCards()).not.toHaveLength(0)
})

test('a plan with no strength track is owed none of the three readings', async () => {
	renderPlan(SEASON, 'weeks')

	await screen.findByRole('list', { name: 'Treningsuker' })
	expect(screen.queryByText('Hva planen ikke kan si')).not.toBeInTheDocument()
	// And no lifting section for a runner who does not lift.
	expect(screen.queryByText('Styrkeblokker')).not.toBeInTheDocument()
})

test('a block whose window fell out of the plan is shown rather than hidden', async () => {
	const season = hybridSeason()
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, [
			block({ startWeekKey: '2030-06-03', startWeekInPlan: null }),
		]),
	})

	const [card] = await blockCards()
	expect(card).toHaveTextContent('Utenfor ukene i planen')
	expect(card).toHaveTextContent(/en kortere sesong lar den ligge der den var/)
	// Still removable and still editable, or the athlete would have no way out.
	expect(
		within(card!).getByRole('button', { name: 'Fjern blokka' }),
	).toBeEnabled()
})

test('a strength track with no blocks says every week is no lifting', async () => {
	const season = hybridSeason()
	renderPlan(season, 'blocks', null, undefined, {
		strengthTracks: strengthTrack(season, []),
	})

	await openSection(SEASON_ADVANCED)
	await openSection('Styrkeblokker')
	expect(
		await screen.findByText(/Ingen styrkeblokker ennå/),
	).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Legg til blokk' })).toBeEnabled()
})

// ── Re-anchoring a track mid-season (#407, ADR 0040 §5) ─────────────────────

/** The run track's anchor list, under Avansert › Startnivå. */
async function anchorList() {
	await openSection(SEASON_ADVANCED)
	await openSection('Startnivå')
	return screen.findByRole('list', { name: 'Startnivå for løping' })
}

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

	const list = await anchorList()
	const [opening, reanchor] = within(list).getAllByRole('listitem')
	// Which is the season's opening level and which is a later statement, in words
	// rather than by position: an athlete reading the list has to be able to see
	// that they re-anchored at all.
	// ISO weeks: the plan's first week is uke 2, its third uke 4.
	expect(opening).toHaveTextContent('Fra uke 2')
	expect(opening).toHaveTextContent('Sesongstart')
	expect(opening).toHaveTextContent('50 km/uke')
	expect(reanchor).toHaveTextContent('Fra uke 4')
	expect(reanchor).toHaveTextContent('Nytt startnivå')
	expect(reanchor).toHaveTextContent('30 km/uke')
	// And said once more at the top of the page, where the track is summarised.
	expect(
		screen.getByText(/nytt startnivå én gang, sist til 30 km\/uke/),
	).toBeInTheDocument()
})

test('the earliest anchor cannot be removed, and the row says why', async () => {
	renderPlan(reanchoredSeason())

	const list = await anchorList()
	const [opening, reanchor] = within(list).getAllByRole('listitem')
	// Removing the first segment would leave every week before the next one with
	// nothing to derive from, so the control is absent rather than present and
	// refused — and the row says what to do instead.
	expect(
		within(opening!).queryByRole('button', { name: 'Fjern dette startnivået' }),
	).not.toBeInTheDocument()
	expect(opening).toHaveTextContent(/Sesongen beholder dette/)
	expect(
		within(reanchor!).getByRole('button', { name: 'Fjern dette startnivået' }),
	).toBeEnabled()
})

test('an anchor row edits its value, and offers no unit anywhere', async () => {
	renderPlan(reanchoredSeason())

	const list = await anchorList()
	const [, reanchor] = within(list).getAllByRole('listitem')
	// The athlete's own number read back at the currency's own precision — this is
	// not a rate box, so there is no convention for a blank to fall through to.
	expect(
		within(reanchor!).getByRole('spinbutton', {
			name: /Ukevolum, km\/uke/,
		}),
	).toHaveValue(30)
	// A segment carries no unit at all (ADR 0043): there is nowhere on the section
	// for one to be chosen, rather than a field that is validated away.
	const section = screen.getByRole('region', { name: 'Startnivå' })
	expect(
		within(section).queryByRole('combobox', { name: /enhet|valuta/i }),
	).not.toBeInTheDocument()
	expect(
		within(section).queryByLabelText(/enhet|valuta/i),
	).not.toBeInTheDocument()
})

test('the re-anchor form offers only weeks that carry no anchor yet', async () => {
	const user = userEvent.setup()
	renderPlan(reanchoredSeason())

	await anchorList()
	await user.click(await screen.findByRole('combobox', { name: 'Fra uke' }))
	const options = within(await screen.findByRole('listbox')).getAllByRole(
		'option',
	)
	// Weeks 1 and 3 already carry a segment, so the only week left is week 2 —
	// "two anchors in the same week" is a state this form cannot reach, with the
	// unique index behind it as the structural backstop rather than the first line.
	expect(options.map((option) => option.textContent)).toEqual([
		'Uke 3 · 14. jan',
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
	await anchorList()
	expect(
		await screen.findByText(/Uke 2–3 i planen kan ikke regnes ut/),
	).toBeInTheDocument()
})

test('Bibliotek is a section of Plan: the catalogue, programs, every exercise and the athlete’s own lifts (ADR 0101)', async () => {
	renderPlan(SEASON, 'blocks', null, undefined, {
		libraryLifts: [{ id: 'exercise-1', name: 'Back Squat' }],
	})

	const library = within(
		await screen.findByRole('region', { name: 'Bibliotek' }),
	)
	expect(library.getByRole('link', { name: /katalog/i })).toHaveAttribute(
		'href',
		'/training/catalogue',
	)
	expect(
		library.getByRole('link', { name: /styrkeprogrammer/i }),
	).toHaveAttribute('href', '/training/programs')
	expect(library.getByRole('link', { name: /alle øvelser/i })).toHaveAttribute(
		'href',
		'/library/exercises',
	)
	expect(library.getByRole('link', { name: 'Back Squat' })).toHaveAttribute(
		'href',
		'/training/exercises/exercise-1',
	)
})
