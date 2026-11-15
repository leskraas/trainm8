/**
 * The Lab Engine's **reads**: every output type, client-safe (no server
 * imports), so a Lab App can `import type` what a read returns.
 *
 * The contract, in `docs/lab/capabilities/reads.md`:
 *
 * - Every number the athlete might read is a {@link Num}: `value` is the
 *   number, or `null` with `why` saying (in Norwegian) why it is unknown.
 *   A `null` is never a zero, and an app never fills it in.
 * - Days are `YYYY-MM-DD` in the athlete's timezone; instants are ISO strings.
 * - `source: 'demo'` marks the made-up demo athlete, served only when a read
 *   was asked for it with `demo: true`.
 */

// ── shared shapes ────────────────────────────────────────────────────────────

/** A number, or why there is none. `why` is null whenever `value` is set. */
export type Num = { value: number | null; why: string | null }

/** `YYYY-MM-DD` in the athlete's timezone. */
export type DayKey = string

/** `athlete` is the signed-in athlete's own data; `demo` the made-up one. */
export type DataSource = 'athlete' | 'demo'

export type Sport = 'run' | 'bike' | 'swim' | 'strength' | 'other'

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/** The unit a sport's weekly volume is planned and counted in. */
export type VolumeUnit = 'km' | 'hours' | 'tss' | 'sets'

/**
 * - `planned`: still to do (today's counts as planned until the day is over).
 * - `done`: done, recorded or marked done.
 * - `missed`: its day passed without it, or it was skipped.
 * - `recording-only`: something the watch recorded that no plan asked for.
 */
export type SessionStatus = 'planned' | 'done' | 'missed' | 'recording-only'

/**
 * Whose session it is to change: `plan` may be changed by plan adjustments
 * without asking (always with a way back); `athlete` is the athlete's own and
 * is never changed without their yes.
 */
export type Whose = 'athlete' | 'plan'

/** Planned against actual load: lighter, as planned, or harder. */
export type Band = 'under' | 'on-target' | 'over'

/** How a session (or a week) went against its plan, in plain words. */
export type Verdict = {
	call: Band | null
	/** `Under`, `I rute`, `Over`; null when there is no call. */
	label: string | null
	/** `Under – lettere enn planlagt`; null when there is no call. */
	sentence: string | null
	/** Why there is no call, when there is none. */
	why: string | null
}

/** One sport's week: the target, what the sessions add up to, what was done. */
export type SportVolume = {
	sport: Sport
	sportName: string
	unit: VolumeUnit
	/** The week's target from the plan. */
	target: Num
	/** What the week's sessions add up to. */
	planned: Num
	/** What was done. */
	actual: Num
}

/** One session as a row in a list, a day or a calendar. */
export type SessionCard = {
	id: string
	date: DayKey
	/** `HH:MM` local. */
	time: string | null
	sport: Sport
	/** `Løping`, `Sykling`, `Svømming`, `Styrke`, … */
	sportName: string
	/** The session's title, or the sport's name where it has none. */
	title: string
	/** What the session is for (`Terskel`, `Utholdenhet`, …), or null. */
	purpose: string | null
	status: SessionStatus
	whose: Whose
	/** Durations in seconds, distances in metres, load in TSS. */
	planned: { durationS: Num; distanceM: Num; load: Num }
	actual: { durationS: Num; distanceM: Num; load: Num }
	/** Planned against actual load. */
	verdict: Verdict
	/** How hard it felt, 1–10, when the athlete said. */
	rpe: number | null
	hasRecording: boolean
	/** The athlete said "done" by hand; numbers may follow from the watch. */
	markedDone: boolean
	/** Logged strength sets, for a strength session; null otherwise. */
	strengthSetsLogged: number | null
	/** Why the plan adjusted this session, when it did. */
	adjustedBecause: string | null
	/** The athlete put it outside every sport's weekly count. */
	outsideWeeklyCount: boolean
}

/** Fitness, fatigue and form, as of a day. */
export type Form = {
	/** Fitness (CTL). */
	fitness: Num
	/** Fatigue (ATL). */
	fatigue: Num
	/** Form (TSB); null until the history is long enough to trust it. */
	form: Num
}

/** Whether form can be trusted yet, and why not. */
export type FormTrust = {
	trusted: boolean
	daysOfHistory: number | null
	requiredDays: number
	/** Why form is not shown yet, when it is not. */
	why: string | null
}

// ── athlete ──────────────────────────────────────────────────────────────────

export type TrainingLevel =
	| 'beginner'
	| 'recreational'
	| 'experienced'
	| 'competitive'

export type SourceProvider = 'intervalsicu' | 'polar' | 'strava' | 'garmin'

/**
 * - `disconnected`: not connected (or never was).
 * - `connected`: connected and syncing.
 * - `importing-history`: just connected, the history is still coming in.
 * - `needs-reconnect`: the service stopped accepting the connection.
 */
export type SourceStatus =
	| 'disconnected'
	| 'connected'
	| 'importing-history'
	| 'needs-reconnect'

export type DataSourceLink = {
	provider: SourceProvider
	name: string
	status: SourceStatus
	/** Whether a new connection to it can be made today. */
	canConnect: boolean
	connectedAt: string | null
	/** When the app last asked the service for new sessions. */
	lastCheckedAt: string | null
	/** The start of the newest session it brought in. */
	newestSessionAt: string | null
	historyImported: boolean
}

export type Goal = {
	/** `event`: a race or ride on a date; `open-ended`: get fitter, no date. */
	kind: 'event' | 'open-ended'
	eventId: string | null
	name: string
	date: DayKey | null
	daysToGo: number | null
	/** `race`, `time-trial` or `fitness-goal`, for an event. */
	eventKind: string | null
	sports: Sport[]
	/** What the athlete aims for, in plain words (`Under 1:45:00`). */
	aim: string | null
	/** The aim as data, when it is one. */
	aimDetail:
		| { kind: 'time'; seconds: number }
		| { kind: 'pace'; secPerKm: number }
		| { kind: 'distance'; meters: number }
		| { kind: 'placement'; position: number }
		| { kind: 'finish' }
		| { kind: 'qualitative'; text: string }
		| null
}

export type AthleteSetup = {
	/** Nothing at all yet: no plan, no sessions, no recordings, no answers. */
	firstOpen: boolean
	/** The getting-started answers are there (level and days). */
	answeredBasics: boolean
	/** A watch service is connected, or a file has been uploaded. */
	hasSessionSource: boolean
	hasGoal: boolean
	hasPlan: boolean
	/**
	 * Getting started is done: the athlete has a plan. This is the switch an
	 * app uses between "first open" and "returning".
	 */
	complete: boolean
	/** The next step getting started would ask for, or null when complete. */
	next: 'basics' | 'connect' | 'goal' | 'plan' | null
}

export type AthleteOutput = {
	source: DataSource
	name: string | null
	username: string
	email: string | null
	timezone: string
	today: DayKey
	level: TrainingLevel | null
	levelName: string | null
	/** The sports the athlete plans or trains, main first. */
	sports: Sport[]
	availability: {
		/** The days they can train; null when never said. */
		days: Weekday[] | null
		/** `HH:MM` they usually train, or null. */
		usualTime: string | null
		/** Hours a week they have room for. */
		weeklyHours: Num
		/** Strength sessions a week they want; null when never said. */
		strengthPerWeek: number | null
		/** Kinds of session they like: `long`, `intervals`, `threshold`, `short`, `surprise`. */
		likes: string[]
	}
	setup: AthleteSetup
	sources: DataSourceLink[]
	recordings: {
		count: number
		first: DayKey | null
		last: DayKey | null
	}
	goal: Goal | null
	plan: { exists: boolean; firstWeek: DayKey | null; lastWeek: DayKey | null }
	/** Where they train from, for the weather. */
	homePlace: { name: string; municipality: string } | null
	/**
	 * `autopilot`: the plan adjusts each week by itself and says what it did
	 * (every change can be undone); `ask-first`: it proposes and waits.
	 */
	adjustMode: 'autopilot' | 'ask-first'
	units: 'metric' | 'imperial'
}

// ── today ────────────────────────────────────────────────────────────────────

export type ReadinessCall =
	| 'fresh'
	| 'neutral'
	| 'fatigued'
	| 'overreaching'
	| 'drifting'

export type Readiness = {
	/**
	 * The one call, when there is one: `fresh` (go for it), `neutral` (train
	 * as planned), `fatigued` (take it easy), `overreaching` (over the plan
	 * for weeks; ease back), `drifting` (under the plan for weeks).
	 */
	call: ReadinessCall | null
	/** What led the call: form, or weeks of being over/under the plan. */
	ledBy: 'form' | 'adherence' | null
	/** The call in one Norwegian sentence. Always said, also without a call. */
	sentence: string
	/** What it did, or would do, to the next planned session. */
	nextSession: {
		outcome: 'eased' | 'held' | 'unavailable' | 'none'
		sentence: string | null
	}
}

export type Weather = {
	/** The hour it is for, ISO. */
	at: string
	symbol: string
	/** `Sol`, `Lett regn`, … */
	label: string
	temperatureC: number
	precipitationMm: number
	credit: string
}

export type TodayOutput = {
	source: DataSource
	date: DayKey
	weekday: Weekday
	weekKey: DayKey
	/** Nothing is planned today (recordings may still be there). */
	restDay: boolean
	sessions: SessionCard[]
	/** The next planned session after today, for a rest day. */
	next: SessionCard | null
	form: Form
	formTrust: FormTrust
	readiness: Readiness
	/** This week per sport. */
	week: SportVolume[]
	phase: PhasePosition | null
	proposalsWaiting: number
	/** Changes the plan made by itself at the last week's close, not yet undone. */
	changesMade: number
	weather: Weather | null
	weatherWhy: string | null
}

// ── week ─────────────────────────────────────────────────────────────────────

export type WeekRole = 'loading' | 'recovery' | 'taper'

/** Where a week sits in the plan. */
export type PhasePosition = {
	name: string
	/** 1-based week of the plan. */
	planWeek: number
	planWeeks: number
	/** 1-based week of the phase. */
	phaseWeek: number
	phaseWeeks: number
	/** A building week, an easy week or a taper week. */
	role: WeekRole | null
}

export type WeekDay = {
	date: DayKey
	weekday: Weekday
	isToday: boolean
	isPast: boolean
	/** Whether the athlete said they can train this weekday; null when never said. */
	available: boolean | null
	/** Nothing planned on the day. */
	restDay: boolean
	sessions: SessionCard[]
}

export type WeekOutput = {
	source: DataSource
	weekKey: DayKey
	/** `past`, `current` or `future`. */
	when: 'past' | 'current' | 'future'
	isoWeek: number
	phase: PhasePosition | null
	days: WeekDay[]
	sports: SportVolume[]
	/** The week's load in TSS. */
	load: { planned: Num; actual: Num; verdict: Verdict }
	counts: {
		planned: number
		done: number
		missed: number
		recordingOnly: number
	}
	/** Proposals that would change this week, waiting for an answer. */
	proposals: ProposalItem[]
	/** The athlete made this week easier. */
	eased: boolean
}

// ── plan ─────────────────────────────────────────────────────────────────────

export type PlanPhase = {
	name: string
	weeks: number
	firstWeek: DayKey
	lastWeek: DayKey
	isCurrent: boolean
	/** `3:1` = three building weeks then one easy. */
	rhythm: string | null
	tapers: boolean
}

export type PlanWeek = {
	weekKey: DayKey
	/** 1-based. */
	number: number
	phase: string | null
	role: WeekRole | null
	when: 'past' | 'current' | 'future'
	sports: SportVolume[]
	/** The load the plan projects for the week, in TSS. */
	projectedLoad: Num
}

export type PlanOutput = {
	source: DataSource
	plan: {
		goal: Goal
		firstWeek: DayKey
		lastWeek: DayKey
		totalWeeks: number
		/** 1-based week today is in; null before the plan starts or after it ends. */
		currentWeek: number | null
		/** For a plan with no date: which block of the open-ended plan this is. */
		block: number | null
		philosophy: { key: string; name: string; description: string } | null
		sports: { sport: Sport; sportName: string; unit: VolumeUnit }[]
		phases: PlanPhase[]
		weeks: PlanWeek[]
		/** Fitness on the goal's day if the plan is followed. */
		projectedFitnessOnGoalDay: Num
	} | null
	/** Every upcoming event, also the ones no plan aims at. */
	events: {
		id: string
		name: string
		date: DayKey
		kind: string
		priority: string
		isPlanGoal: boolean
	}[]
}

// ── sessions ─────────────────────────────────────────────────────────────────

export type SessionsOutput = {
	source: DataSource
	from: DayKey
	to: DayKey
	sessions: SessionCard[]
	/** Pass back as `cursor` for the next page; null on the last. */
	nextCursor: string | null
}

// ── session ──────────────────────────────────────────────────────────────────

export type TargetRange = { min: number | null; max: number | null }

/** A step's intensity, as written and as it comes out in the athlete's zones. */
export type StepTarget = {
	/** As written: `Z2 — rolig`, `95–105% FTP`, `4:10–4:20 /km`. */
	label: string
	/** The athlete's own numbers: `238–263 W`; null when it does not resolve. */
	resolvedText: string | null
	/** The same as numbers, per channel. Null where the channel does not apply. */
	heartRate: TargetRange | null
	power: TargetRange | null
	/** Pace in seconds per `paceUnit`. */
	pace: (TargetRange & { unit: 'km' | '100m' }) | null
	/** A translation rather than plain arithmetic (show `≈`). */
	approximate: boolean
	/** Why there are no numbers, e.g. a threshold the athlete has not set. */
	why: string | null
}

export type SessionStep = {
	kind: 'work' | 'rest' | 'strength'
	sport: Sport | null
	durationS: number | null
	distanceM: number | null
	climbM: number | null
	target: StepTarget | null
	/** For a strength step. */
	exercise: { id: string; name: string } | null
	sets: number | null
	restBetweenSetsS: number | null
	note: string | null
	/** The step in one line: `4 min Z4 · 285–300 W`. */
	text: string
}

export type SessionBlock = {
	name: string | null
	/** How many times the steps repeat. */
	repeat: number
	/** How many times the whole repeat runs (`3 × (13 × 30/15)`). */
	series: number
	restBetweenSeriesS: number | null
	steps: SessionStep[]
	/** The block in one line: `6 × (4 min Z4, 2 min pause)`. */
	text: string
}

export type StrengthSet = {
	number: number
	role: 'warmup' | 'working' | 'backoff'
	prescribed: {
		reps: number | null
		durationS: number | null
		/** `80 kg`, `75% 1RM · 82,5 kg`. */
		loadText: string | null
		kg: Num
	} | null
	logged: {
		setLogId: string
		reps: number | null
		durationS: number | null
		kg: number | null
		loadText: string | null
		repsInReserve: number | null
		outcome: 'completed' | 'abandoned'
	} | null
	/** What the athlete did last time on this set, as a hint. */
	lastTime: string | null
}

export type StrengthExercise = {
	stepId: string
	exerciseId: string | null
	name: string
	restBetweenSetsS: number | null
	/** Stated one side at a time; null when nobody said. */
	oneSideAtATime: boolean | null
	sets: StrengthSet[]
}

export type RecordingSummary = {
	id: string
	/** Where it was recorded: `garmin`, `polar`, `upload`, … */
	from: string
	startedAt: string
	durationS: Num
	distanceM: Num
	avgHeartRate: Num
	maxHeartRate: Num
	avgPower: Num
	normalizedPower: Num
	/** Seconds per km. */
	avgPace: Num
	climbM: Num
	load: Num
}

export type Allowed = { allowed: boolean; why: string | null }

/**
 * What can be done to the session right now. A hint for showing the right
 * buttons: the write itself has the last word.
 */
export type SessionCan = {
	move: Allowed
	swap: Allowed
	skip: Allowed
	shorten: Allowed
	makeEasier: Allowed
	markDone: Allowed
	undoDone: Allowed
	logStrength: Allowed
	rateFeeling: Allowed
}

export type SessionOutput = SessionCard & {
	source: DataSource
	description: string | null
	/** The whole session in one line. */
	summary: string | null
	structure: SessionBlock[] | null
	comparison: {
		load: { planned: Num; actual: Num }
		durationS: { planned: Num; actual: Num }
		distanceM: { planned: Num; actual: Num }
		verdict: Verdict
		/** Whether the recorded intervals matched the plan. */
		structure: {
			call: 'as-planned' | 'diverged' | null
			label: string | null
			why: string | null
		}
		/** Against the last session of the same kind. */
		sinceLast: {
			sessionId: string
			date: DayKey
			load: Num
			durationS: Num
		} | null
	}
	feeling: { rpe: number | null; note: string | null }
	strength: {
		exercises: StrengthExercise[]
		loggedSets: number
		prescribedSets: number
	} | null
	recording: RecordingSummary | null
	can: SessionCan
}

// ── progress ─────────────────────────────────────────────────────────────────

export type ProgressDay = {
	date: DayKey
	/** That day's load, TSS. */
	load: Num
	fitness: Num
	fatigue: Num
	form: Num
}

export type ProgressWeek = {
	weekKey: DayKey
	plannedLoad: Num
	actualLoad: Num
	verdict: Verdict
	/** Per sport, in its unit, where the plan has the sport. */
	sports: SportVolume[]
	/** Per sport, what was recorded: time and distance. */
	recorded: {
		sport: Sport
		sportName: string
		sessions: number
		durationS: Num
		distanceM: Num
	}[]
}

export type ProgressOutput = {
	source: DataSource
	weeks: number
	current: Form
	formTrust: FormTrust
	days: ProgressDay[]
	weekly: ProgressWeek[]
	/** Weeks in a row over or under the plan, when it is a trend (two or more). */
	trend: { direction: 'under' | 'over'; weeks: number } | null
	goal: {
		goal: Goal
		weeksToGo: number | null
		planWeek: number | null
		planWeeks: number | null
		phase: string | null
		fitnessToday: Num
		/** Fitness on the goal's day if the plan is followed. */
		projectedFitnessOnGoalDay: Num
	} | null
}

// ── proposals ────────────────────────────────────────────────────────────────

export type ProposalKind =
	| 'keep'
	| 'move'
	| 'swap'
	| 'add'
	| 'scale'
	| 'add-phase'

/**
 * - `waiting`: needs a yes or no.
 * - `accepted` / `declined`: answered.
 * - `applied-silently`: an easing applied because nobody answered (can be undone).
 * - `too-late`: the session it was about has passed.
 */
export type ProposalState =
	| 'waiting'
	| 'accepted'
	| 'declined'
	| 'applied-silently'
	| 'too-late'

export type ProposalItem = {
	id: string
	kind: ProposalKind
	/** What it would do: `Flytt «Terskel» fra tirsdag til torsdag`. */
	headline: string
	/** Why, in plain Norwegian. */
	reason: string
	/** It puts more training on the athlete. */
	addsLoad: boolean
	/** It touches one of the athlete's own sessions. */
	touchesOwnSession: boolean
	state: ProposalState
	stateLabel: string | null
	/** The week it would change. */
	weekKey: DayKey
	session: {
		id: string
		date: DayKey
		sport: Sport | null
		title: string | null
		whose: Whose
	} | null
	otherSession: {
		id: string
		date: DayKey
		sport: Sport | null
		title: string | null
		whose: Whose
	} | null
	/** A move asks "just this time" or "from now on" with the yes. */
	asksScope: boolean
	/** The next block of an open-ended plan: its volume factor, adjustable. */
	block: {
		factor: number
		min: number
		max: number
		step: number
		peak: { value: number; unit: VolumeUnit } | null
	} | null
	/** The concrete change, as data. */
	change:
		| { kind: 'keep' }
		| { kind: 'move'; fromDate: DayKey; toDate: DayKey; makeUp: boolean }
		| { kind: 'swap' }
		| { kind: 'add'; date: DayKey; time: string }
		| { kind: 'scale'; factor: number; wholeWeek: boolean }
		| { kind: 'add-phase'; name: string; weeks: number; factor: number }
}

export type AutoChange = {
	proposalId: string
	/**
	 * `changed` (can be undone), `kept` (the week stands), `left-alone` (the
	 * athlete's own session stands), `let-go` (a missed session stays missed),
	 * `held` (nothing written).
	 */
	kind: 'changed' | 'kept' | 'left-alone' | 'let-go' | 'held'
	text: string
	about: string | null
	/** `offered`: can be undone now; `undone`; `closed`: too late. */
	undo: 'offered' | 'undone' | 'closed' | null
}

export type ProposalsOutput = {
	source: DataSource
	adjustMode: 'autopilot' | 'ask-first'
	/** How many wait for an answer. */
	waiting: number
	/** The week that closed and was read. */
	closedWeek: DayKey | null
	/** The week the proposals would change. */
	forWeek: DayKey | null
	/** The week's verdict in a sentence. */
	summary: string | null
	proposals: ProposalItem[]
	/** What the plan changed by itself at the last close (autopilot). */
	changesMade: {
		heading: string
		weekKey: DayKey
		changes: AutoChange[]
		undoable: number
	} | null
	/** The athlete made the coming week easier: volumes before and after. */
	easedWeek: {
		weekKey: DayKey
		sports: { sport: Sport; unit: VolumeUnit; before: Num; after: Num }[]
	} | null
}

// ── zones ────────────────────────────────────────────────────────────────────

export type Zone = {
	/** The model's own code: `Z2`, `E`, `I-3`. */
	label: string
	description: string | null
	/** On the common 1–5 scale; null for a band off that scale. */
	step: number | null
	heartRate: TargetRange | null
	power: TargetRange | null
	pace: (TargetRange & { unit: 'km' | '100m' }) | null
	why: string | null
}

export type SportZones = {
	sport: 'run' | 'bike' | 'swim'
	sportName: string
	thresholds: {
		maxHeartRate: Num
		thresholdHeartRate: Num
		/** Bike: FTP, watts. */
		ftp: Num
		/** Run: critical power, watts. */
		runPower: Num
		/** Run: threshold pace, seconds per km. */
		thresholdPace: Num
		/** Swim: critical swim speed, seconds per 100 m. */
		css: Num
	}
	model: {
		id: string
		name: string
		/** `default` (the app's) or `athlete` (chosen). */
		chosenBy: 'default' | 'athlete' | null
		/** What the zones are read from. */
		basedOn: string
	} | null
	/** Other models the athlete can choose. */
	models: { id: string; name: string }[]
	zones: Zone[]
	modelWhy: string | null
}

export type ZonesOutput = {
	source: DataSource
	sports: SportZones[]
	history: {
		sport: string
		/** `maxHr`, `lthr`, `ftp`, `runPower`, `thresholdPace`, `css`, `weight`. */
		kind: string
		value: number
		at: string
		how: string | null
	}[]
	results: {
		id: string
		sport: string
		distanceM: number
		timeS: number
		date: DayKey
		kind: string
		verified: boolean
	}[]
}

// ── exercises ────────────────────────────────────────────────────────────────

export type ExerciseHit = {
	id: string
	name: string
	/** Another name it answers to (`knebøy`), or null. */
	alias: string | null
	ownExercise: boolean
	primaryMuscle: string
	equipment: string | null
	/** Sessions the athlete has logged it in. */
	timesLogged: number
}

export type ExercisesOutput = {
	query: string
	exercises: ExerciseHit[]
	total: number
	nextCursor: string | null
}

export type ExerciseOutput = {
	id: string
	name: string
	primaryMuscle: string
	equipment: string | null
	oneSideAtATime: boolean | null
	ownExercise: boolean
	/** The athlete's stated or estimated maxima for the lift. */
	anchors: {
		kind: string
		kg: number
		reps: number | null
		at: string
	}[]
	history: {
		sessionId: string
		date: DayKey
		workingSets: number
		/** The heaviest working set, kg, when it is a kilo on the bar. */
		topSetKg: Num
		topSetText: string
	}[]
	lastTime: { sessionId: string; date: DayKey; topSetText: string } | null
	records: { label: string; text: string; date: DayKey | null }[]
	estimatedOneRepMax: Num
}

// ── recordings ───────────────────────────────────────────────────────────────

export type RecordingItem = RecordingSummary & {
	date: DayKey
	sport: Sport
	sportName: string
	/** The session it is linked to, if any. */
	sessionId: string | null
	/** Whether it is linked to a planned session (not a session of its own). */
	linkedToPlan: boolean
	/** Also came from these other places (the same activity, kept once). */
	alsoFrom: string[]
}

export type RecordingsOutput = {
	source: DataSource
	recordings: RecordingItem[]
	nextCursor: string | null
	importing: boolean
	sources: DataSourceLink[]
}
