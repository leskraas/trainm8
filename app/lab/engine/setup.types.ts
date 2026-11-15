/**
 * The input and output types of the Lab Engine's **setup** capabilities:
 * getting started, the goal, the plan before it exists, connections and
 * settings. Client-safe (no server imports), so a Lab App can
 * `import type { … } from '#app/lab/engine/setup.types.ts'`.
 *
 * Conventions:
 * - Dates are `YYYY-MM-DD` in the athlete's timezone; instants are ISO strings.
 * - Every number the app could not know is `null`, never `0`, and comes with a
 *   short Norwegian `why` where that helps.
 * - Words meant for the athlete (`name`, `note`, `why`, `label`) are Norwegian.
 */

// ── Shared vocabulary ────────────────────────────────────────────────────────

/** A day of the week, Monday first. */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export const WEEKDAYS: readonly Weekday[] = [
	'mon',
	'tue',
	'wed',
	'thu',
	'fri',
	'sat',
	'sun',
]

/** The endurance sports the plan lays sessions for. */
export type Sport = 'run' | 'bike' | 'swim'
export const SPORTS: readonly Sport[] = ['run', 'bike', 'swim']

/**
 * Other things the athlete does that the plan gives a fixed day, but no
 * structure: cross-country skiing, hiking, climbing, yoga/mobility.
 */
export type OtherActivity =
	| 'cross-country-ski'
	| 'hike'
	| 'climb'
	| 'yoga-mobility'
export const OTHER_ACTIVITIES: readonly OtherActivity[] = [
	'cross-country-ski',
	'hike',
	'climb',
	'yoga-mobility',
]

/** How the athlete describes themselves, easiest first. */
export type ExperienceLevel =
	| 'beginner'
	| 'recreational'
	| 'experienced'
	| 'competitive'
export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = [
	'beginner',
	'recreational',
	'experienced',
	'competitive',
]

/**
 * The kinds of session the athlete likes. They rank the plan styles offered
 * and `short` keeps weekday sessions short; they never change what a style
 * is.
 */
export type SessionPreference =
	| 'long'
	| 'intervals'
	| 'threshold'
	| 'short'
	| 'surprise'
export const SESSION_PREFERENCES: readonly SessionPreference[] = [
	'long',
	'intervals',
	'threshold',
	'short',
	'surprise',
]

/**
 * A way to train, i.e. the plan's style:
 * - `polarized`: mostly easy, a little very hard;
 * - `threshold`: steady, controlled hard work;
 * - `classic`: varied, three building weeks and one easy;
 * - `big-base`: easy only at first, harder later (offered to beginners).
 */
export type PlanStyle = 'polarized' | 'threshold' | 'classic' | 'big-base'

/** How hard a session is, in plain words. */
export type Effort = 'easy' | 'moderate' | 'hard'

/** A number that may be unknown, with why when it is. */
export type Known<T = number> = { value: T | null; why?: string }

// ── Getting started ──────────────────────────────────────────────────────────

export type HomePlace = {
	name: string
	kind: string
	municipality: string
	county: string
	latitude: number
	longitude: number
}

/** Everything the athlete has said about themselves, as stored. */
export type AthleteSetup = {
	displayName: string | null
	username: string
	/** The endurance sports, main sport first; null = never said. */
	sports: Sport[] | null
	mainSport: Sport | null
	/** Null = never said; `[]` = said none. */
	otherActivities: OtherActivity[] | null
	level: ExperienceLevel | null
	/** The hours a week they train now; null = never said. */
	currentHoursPerWeek: number | null
	availability: {
		/** The days they can train; null = never said. */
		days: Weekday[] | null
		/** The other days: the ones that do not work. Null = never said. */
		blockedDays: Weekday[] | null
		/** The most hours a week they have room for; null = never said. */
		hoursPerWeek: number | null
	}
	/** Strength sessions a week (1–3); null = no lifting in the plan. */
	strengthPerWeek: number | null
	/** Null = never asked; `[]` = skipped. */
	sessionPreferences: SessionPreference[] | null
	/** IANA timezone, e.g. `Europe/Oslo`. */
	timezone: string
	/** Where the athlete lives, for the weather; null = none chosen. */
	homePlace: HomePlace | null
	/** Whether the plan adjusts itself at each week's end, or asks first. */
	adjustAutomatically: boolean
	/** `HH:MM`, the time sessions are put on; null = never said (07:00 is used). */
	defaultTrainingTime: string | null
}

/** A question getting started still needs an answer to before plans can be shown. */
export type SetupQuestion = 'sports' | 'level'

/**
 * `get_setup`'s output: what is answered, what is missing, what would be
 * used where an answer is missing, and whether the athlete has a plan.
 */
export type SetupState = {
	answers: AthleteSetup
	/** Answers start options cannot be made without. Empty = ready. */
	missing: SetupQuestion[]
	/** True when `start_options` can show plans (and there is no plan yet). */
	readyForPlans: boolean
	/** True when the athlete already has a plan: getting started is done. */
	hasPlan: boolean
	/**
	 * What the experience level suggests, for pre-filling a question; null
	 * until the level is set.
	 */
	suggested: {
		currentHoursPerWeek: number
		days: Weekday[]
		strengthPerWeek: number
	} | null
	/**
	 * What the athlete's own recorded training says (needs a connected watch
	 * or uploads). Pre-fills, never stored until the athlete says so.
	 */
	fromHistory: {
		importing: boolean
		hoursPerWeek: Known
		days: Weekday[] | null
		/** Norwegian, e.g. «Siste fire uker: 5,5 timer i uka». */
		note: string | null
	}
	/** Choices for each question, with Norwegian labels. */
	choices: {
		sports: Array<{ id: Sport; label: string }>
		otherActivities: Array<{ id: OtherActivity; label: string }>
		levels: Array<{ id: ExperienceLevel; label: string }>
		sessionPreferences: Array<{ id: SessionPreference; label: string }>
		strengthPerWeek: number[]
		hoursPerWeek: { min: number; max: number; step: number }
	}
}

/** What a getting-started write returns: the state after it. */
export type SetupWriteResult = SetupState

export type SetSportsInput = {
	/** At least one sport or one other activity. The first sport is the main one. */
	sports: Sport[]
	/** Override which of `sports` is the main one. */
	mainSport?: Sport
	otherActivities?: OtherActivity[]
}
export type SetLevelInput = { level: ExperienceLevel }
export type SetCurrentVolumeInput = { hoursPerWeek: number }
export type SetStrengthInput = { perWeek: 0 | 1 | 2 | 3 }
export type SetSessionPreferencesInput = { preferences: SessionPreference[] }
export type SetTimezoneInput = { timezone: string }
export type SearchPlacesInput = { text: string }
export type SearchPlacesOutput =
	| { status: 'found'; places: Array<HomePlace & { id: string }> }
	| { status: 'unavailable'; why: string }
export type SetHomePlaceInput = HomePlace

/**
 * Availability: give `days` (the days that work) or `blockedDays` (the days
 * that don't), and/or `hoursPerWeek` (null clears it).
 */
export type SetAvailabilityInput = {
	days?: Weekday[]
	blockedDays?: Weekday[]
	hoursPerWeek?: number | null
}
export type SetAvailabilityOutput = {
	setup: SetupState
	/**
	 * What it did to the plan: each sport or activity that was pinned to a day
	 * that is now blocked, and what it keeps. Empty when the plan was not
	 * touched or there is no plan. Weeks already laid are not moved.
	 */
	planEffect: Array<{
		what: string
		lostDays: Weekday[]
		/** Null: the plan picks its days again. */
		keptDays: Weekday[] | null
	}>
	/** Norwegian, one line, for the athlete. */
	note: string
}

// ── The plan before it exists ────────────────────────────────────────────────

export type PreviewSession = {
	title: string
	sport: Sport | 'strength' | 'other'
	minutes: number
	effort: Effort
}

export type PreviewDay = {
	date: string
	weekday: Weekday
	sessions: PreviewSession[]
	/** Strength sessions that day: shown by their lifts, never in minutes. */
	strength: Array<{ title: string; lifts: string[] }>
}

/** One real week, day by day, as it will be laid. */
export type PreviewWeek = {
	/** Its Monday. */
	weekStart: string
	days: PreviewDay[]
	totals: {
		minutes: number
		sessions: number
		hardSessions: number
		strengthSessions: number
		minutesByEffort: Record<Effort, number>
	}
}

export type StartOption = {
	style: PlanStyle
	/** The plain name, e.g. «Mest rolig, litt veldig hardt». */
	name: string
	why: string
	/** The style's trade name, small: «Fagnavn: Polarisert». */
	styleName: string
	/** «Passer deg best» / «Anbefalt for nivået ditt», only on the first, and only with a reason. */
	badge: string | null
	firstWeek: PreviewWeek
	/** Where week 1 falls short of the hours given: why. */
	shortOfHours: { minutes: number; note: string } | null
	/** Other activities that did not fit week 1: why. */
	notFitted: string | null
	/** Strength notes for this option (fewer lifting days than asked, clashes). */
	strengthNotes: string[]
}

export type StartOptionsOutput = {
	/** The plan's first day: the first week not yet begun. */
	startsOn: string
	/**
	 * Answers that were not given and were filled from history or the level's
	 * suggestion, so the app can say so (and ask).
	 */
	assumed: Array<{
		question: 'currentHoursPerWeek' | 'days'
		value: number | Weekday[]
		from: 'history' | 'level'
	}>
	/** Norwegian lines about the set as a whole (fewer options, fewer days used …). */
	notes: string[]
	/** Ranked, best first; never two that lay the same week. */
	options: StartOption[]
}

export type PlanPreviewInput = { style?: PlanStyle }

export type PlanPhase = {
	name: string
	weeks: number
	/** Its first Monday. */
	from: string
}

export type OutlookWeek = {
	weekStart: string
	phase: string
	/** `loading` builds, `recovery` is a lighter week, `taper` is before the race. */
	role: 'loading' | 'recovery' | 'taper'
	roleLabel: string
	/** The week's target hours across sports; null where it cannot be priced. */
	hours: number | null
	why?: string
}

export type PlanPreviewOutput = {
	style: PlanStyle
	name: string
	why: string
	startsOn: string
	/** The weeks that will be laid at once, day by day. */
	weeks: PreviewWeek[]
	/** The first block, week by week (open-ended plans grow a block at a time). */
	phases: PlanPhase[]
	outlook: OutlookWeek[]
	/**
	 * With a goal set: how the plan would run toward it once accepted. Null
	 * without a goal. `problem` says why it cannot (e.g. the race is this week).
	 */
	towardGoal: {
		goal: { name: string; date: string }
		phases: PlanPhase[]
		outlook: OutlookWeek[]
		problem: string | null
	} | null
	notes: string[]
}

export type AcceptPlanInput = { style?: PlanStyle }
export type AcceptPlanOutput = {
	planId: string
	style: PlanStyle
	startsOn: string
	/** Sessions put on the calendar now (the first weeks). */
	sessionsLaid: number
	/** True when the plan now runs toward the goal. */
	goalApplied: boolean
	/** Why the goal could not be applied, where it could not. */
	goalProblem: string | null
	/** Creating a plan has no undo; changing the goal or availability later does. */
	undo: null
}

// ── Goal ─────────────────────────────────────────────────────────────────────

export type Goal = {
	id: string
	name: string
	/** The race day. */
	date: string
	sports: Array<Sport | 'strength'>
	distanceKm: number | null
	/** Target finish time in seconds, and as `t:mm:ss`. */
	targetTime: { seconds: number; text: string } | null
	status: 'planned' | 'completed' | 'cancelled'
	/** Days from today to the race; negative once it has been. */
	daysLeft: number
	/** True when the plan runs toward this goal. */
	planRunsTowardIt: boolean
}

/** A change to the plan that the athlete must accept before it is applied. */
export type GoalPlanProposal = {
	goalId: string
	/** Pass back to `apply_goal_to_plan`; refused if the plan changed since. */
	digest: string
	/** The current block ends early, after this many weeks. */
	endsCurrentBlock: { name: string; weeksKept: number; weeksHad: number }
	/** The blocks laid toward the race, from `from`. */
	phases: PlanPhase[]
	outlook: OutlookWeek[]
	/** Weeks that rise more than 10 % over the week before: a warning, not a block. */
	steepWeeks: Array<{ weekStart: string; fromHours: number; toHours: number }>
	/** The athlete's own sessions ahead, which all stay. */
	ownSessionsKept: number
}

export type GoalWriteOutput = GoalOutput & {
	/** Pass to `undo_goal_change` to put the goal back as it was. */
	undo: string | null
}

export type GoalOutput = {
	goal: Goal | null
	/** True when the plan has no race: «bli i bedre form». */
	openEnded: boolean
	/** Waiting for a yes: the goal applied to the current plan. */
	proposal: GoalPlanProposal | null
	/** Why the goal cannot be applied to the plan, where it cannot. */
	problem: string | null
}

export type SetGoalInput =
	| {
			kind: 'event'
			name: string
			/** `YYYY-MM-DD`, in the future. */
			date: string
			sport: Sport
			distanceKm?: number
			/** `t:mm:ss` or `mm:ss`, or seconds. */
			targetTime?: string | number
	  }
	| { kind: 'open-ended' }

export type UpdateGoalInput = {
	name?: string
	date?: string
	sport?: Sport
	distanceKm?: number | null
	targetTime?: string | number | null
}

export type RemoveGoalInput = {
	/**
	 * Required when the plan runs toward the goal: removing the goal then
	 * stops the plan too (it was built for that race), and getting started
	 * can make a new one. Undo brings both back while no new plan exists.
	 */
	stopPlan?: boolean
}

export type RemoveGoalOutput = {
	removed: 'deleted' | 'cancelled' | 'nothing'
	planStopped: boolean
	/** Pass to `undo_goal_change` to bring the goal back. */
	undo: string | null
}

export type UndoGoalChangeInput = { undo: string }

export type ApplyGoalToPlanInput = { goalId: string; digest: string }
export type ApplyGoalToPlanOutput = {
	goal: Goal
	endedBlock: { name: string; weeks: number }
	phases: Array<{ name: string; weeks: number }>
	/** Applying a goal has no undo in the domain; remove the goal to stop it. */
	undo: null
}

// ── Connections ──────────────────────────────────────────────────────────────

export type SourceId =
	| 'intervalsicu'
	| 'polar'
	| 'strava'
	| 'garmin'
	| 'suunto'
	| 'file'

export type SourceState =
	| 'not-connected'
	| 'connected'
	| 'importing-history'
	| 'needs-reconnect'

export type Source = {
	id: SourceId
	name: string
	description: string
	/** How it is connected: paste a key, sign in elsewhere, or upload files. */
	how: 'api-key' | 'oauth' | 'file'
	/** `available`: can be connected now. `not-available`/`coming-soon`: listed honestly, cannot. */
	availability: 'available' | 'not-available' | 'coming-soon'
	state: SourceState
	/** When the app last asked the source for new sessions. */
	lastCheckedAt: string | null
	canSync: boolean
	canDisconnect: boolean
	/** Why it cannot be connected, where it cannot. */
	why: string | null
}

export type ConnectionsOutput = {
	sources: Source[]
	/** Two sources at once can occasionally bring the same session twice. */
	duplicateRisk: string | null
}

export type ConnectIntervalsIcuInput = { apiKey: string }
export type ConnectOutput = { source: Source }
export type DisconnectInput = { source: 'intervalsicu' | 'strava' }
export type DisconnectOutput = { source: Source }
export type SyncInput = { source?: 'intervalsicu' | 'strava' }
export type SyncOutput = {
	/** Sessions brought in. */
	imported: number
	failed: Array<{ source: SourceId; message: string }>
	/** When a rate-limited source may be asked again. */
	retryAt: string | null
}

/**
 * `upload_activity_files` takes multipart form data: one or more `file`
 * fields (.fit, .fit.gz, .tcx, .gpx, .zip, .gz) and an optional `sport`
 * (only used for a single file).
 */
export type UploadOutput = {
	imported: number
	duplicates: number
	failed: Array<{ file: string; reason: string }>
	/** For a single imported file: the session it became. */
	sessionId: string | null
}

export type ImportStatusOutput = {
	/** True while any source is still bringing in history. */
	importing: boolean
	sources: Array<{
		id: SourceId
		state: SourceState
		lastCheckedAt: string | null
	}>
	recordings: {
		total: number
		bySource: Array<{ source: SourceId | 'upload'; count: number }>
		earliest: string | null
		latest: string | null
	}
	/** The last four complete weeks, as the start reads them. */
	history: {
		weeksWithTraining: number
		hoursPerWeek: Known
	}
}

// ── Settings ─────────────────────────────────────────────────────────────────

export type ThresholdValues = {
	/** Beats per minute. */
	maxHr: number | null
	/** Lactate-threshold heart rate, bpm. */
	lthr: number | null
	/** Bike: functional threshold power, watts. */
	ftp: number | null
	/** Run: threshold running power, watts. */
	runPower: number | null
	/** Run: threshold pace, seconds per km. */
	thresholdPacePerKm: number | null
	/** Swim: critical swim speed, seconds per 100 m. */
	cssPer100m: number | null
}

export type Zone = {
	label: string
	description: string | null
	/** Low (`min`) to high (`max`, null = open-ended) in `unit`; null when the threshold it hangs on is not set. */
	range: {
		min: number
		max: number | null
		unit: 'bpm' | 'watt' | 'sec-per-km' | 'sec-per-100m'
	} | null
	why?: string
}

export type SportThresholds = {
	sport: Sport
	values: ThresholdValues
	zoneSystem: { id: string; name: string; chosenBy: 'app' | 'athlete' } | null
	zoneSystems: Array<{ id: string; name: string }>
	zones: Zone[]
	history: Array<{ what: keyof ThresholdValues; value: number; date: string }>
}

export type ThresholdsOutput = { sports: SportThresholds[] }

export type SetThresholdsInput = {
	sport: Sport
	maxHr?: number
	lthr?: number
	ftp?: number
	runPower?: number
	thresholdPacePerKm?: number
	cssPer100m?: number
	zoneSystem?: string
}
export type SetThresholdsOutput = SportThresholds

export type SetDisplayNameInput = { name: string | null }
export type SetPreferencesInput = {
	adjustAutomatically?: boolean
	/** `HH:MM`; null clears it. */
	defaultTrainingTime?: string | null
	sessionPreferences?: SessionPreference[]
}

export type ExportDataOutput = {
	fileName: string
	/** Everything the athlete owns, as JSON. */
	data: unknown
}

export type DeleteAccountInput = {
	/** Must be exactly `SLETT`: the athlete typed it to confirm. */
	confirm: string
}
export type DeleteAccountOutput = {
	deleted: true
	/** Sessions erased: every session on the calendar, planned, done or uploaded. */
	sessionsErased: number
	/** Recordings erased: activities uploaded from a file or synced from a watch or service. */
	recordingsErased: number
	/**
	 * Written session plans erased (the steps and targets behind planned or
	 * written sessions). An uploaded recording has no written plan, so an athlete
	 * who only uploaded has 0 here. A plan someone else still uses is kept,
	 * without the athlete's name.
	 */
	workoutsErased: number
}
