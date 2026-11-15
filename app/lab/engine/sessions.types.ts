/**
 * The input and output types of the **sessions** capabilities: doing a
 * session, recording it, saying how it felt, changing it when life happens,
 * and answering the plan when it adapts. Client-safe: no server imports, so a
 * Lab App can `import type` from here.
 *
 * Conventions every type below keeps:
 *
 * - Dates are `YYYY-MM-DD` and times `HH:mm`, in the athlete's own timezone.
 * - A number the engine cannot know is `null`, with a short Norwegian reason
 *   beside it (`…UnknownBecause`). Never 0 for unknown.
 * - Every write answers with what changed (`changed`, `removedSessionIds`) and
 *   an `undo` token, or `null` with `noUndoBecause` saying why not. Pass the
 *   token to `undo`.
 */

// ── shared ────────────────────────────────────────────────────────────────

/** Where a session stands. */
export type SessionState =
	/** Still to do (also a past day nobody marked yet). */
	| 'planned'
	/** Done: marked done, logged, or a recording came in. */
	| 'done'
	/** Its day passed and the athlete said it did not happen. */
	| 'missed'
	/** The athlete chose ahead of time not to do it. */
	| 'skipped'

export type Sport = 'run' | 'bike' | 'swim' | 'strength' | 'other'

/** One session as it stands after a write. */
export type SessionSnapshot = {
	id: string
	date: string
	time: string
	title: string | null
	/** Null for a recording with no sport the engine knows. */
	sport: Sport | null
	state: SessionState
	/** Planned length; null where it cannot be timed end to end. */
	minutes: number | null
	minutesUnknownBecause?: string
	/**
	 * `athlete`: the athlete wrote it or changed it themselves, so the plan
	 * never changes it without asking. `plan`: the plan may adjust it.
	 */
	owner: 'athlete' | 'plan'
	hasRecording: boolean
	/** False when the athlete said it counts toward no part of the plan. */
	countsTowardPlan: boolean
	/** Why the plan or the athlete last changed it, in plain Norwegian. */
	changeNote: string | null
	/** How hard it felt, 1–10; null when not said. */
	rpe: number | null
	note: string | null
}

/** Every write's tail: how to take it back, or why it cannot be. */
export type UndoPart = {
	/** Pass to `undo`. Null when this write cannot be taken back. */
	undo: string | null
	/** Norwegian, short; set exactly when `undo` is null. */
	noUndoBecause: string | null
}

export type SessionIdInput = { sessionId: string }

// ── doing and recording ───────────────────────────────────────────────────

export type MarkDoneInput = SessionIdInput
export type MarkDoneOutput = { changed: SessionSnapshot[] } & UndoPart

export type SkipSessionInput = SessionIdInput
export type SkipSessionOutput = {
	changed: SessionSnapshot[]
	/** `missed` on a day that has begun, `skipped` on a day still ahead. */
	state: 'missed' | 'skipped'
} & UndoPart

export type DeleteSessionInput = SessionIdInput
export type DeleteSessionOutput = {
	removedSessionIds: string[]
	/** Always null: a delete cannot be taken back. Confirm before calling. */
	undo: null
	noUndoBecause: string
}

export type AddSessionInput = {
	date: string
	/**
	 * What it is, in the athlete's own words: `45 min rolig`, `4x8 min
	 * terskel`, `3x10 knebøy 60 kg`. Left out, `sport` alone adds a 45-minute
	 * easy session (run, bike or swim only).
	 */
	sentence?: string
	sport?: Sport
	/** Copy another of the athlete's sessions onto `date` instead. */
	copyOf?: string
	/** It already happened: mark it done (a day that has begun only). */
	alreadyDone?: boolean
	/** A note kept on the session. */
	note?: string
	/** False: it counts toward no part of the plan (a bike commute). */
	countsTowardPlan?: boolean
}
export type AddSessionOutput = {
	changed: SessionSnapshot[]
	sessionId: string
	/** Asked for `alreadyDone` but it could not be marked: why. */
	notDoneBecause: string | null
} & UndoPart

// ── when life happens ─────────────────────────────────────────────────────

/** A day-rule warning about where a session now sits. */
export type DayClash = {
	code:
		| 'lifting-on-hard-day'
		| 'lifting-before-hard-day'
		| 'lifting-on-long-day'
		| 'hard-days-in-a-row'
		| 'two-hard-sessions'
		| 'two-long-sessions'
		| 'easy-before-hard-day'
	/** E.g. `dagen før en hard økt`. */
	text: string
}

export type MoveSessionInput = {
	sessionId: string
	/**
	 * The day to move to, today or later. Left out (today's session only), the
	 * plan picks the next free day this week that fits, or swaps with the next
	 * session when no day is free.
	 */
	date?: string
}
export type MoveSessionOutput = {
	changed: SessionSnapshot[]
	moves: Array<{ sessionId: string; fromDate: string; toDate: string }>
	/** Other sessions already on the new day (not moved). */
	sharesDayWith: string[]
	/** Day-rule warnings on the new day; empty when it fits. */
	clashes: DayClash[]
	/** The session left its training week: that week's total drops and the
	 * new week's grows. Nothing else in either week moves. */
	leftItsWeek: boolean
} & UndoPart

export type SwapSessionsInput = { sessionId: string; otherSessionId: string }
export type SwapSessionsOutput = {
	changed: SessionSnapshot[]
	moves: Array<{ sessionId: string; fromDate: string; toDate: string }>
} & UndoPart

export type ShortenSessionInput = SessionIdInput
export type ShortenSessionOutput = {
	changed: SessionSnapshot[]
	minutesBefore: number | null
	minutesAfter: number | null
} & UndoPart

export type EaseSessionInput = SessionIdInput
export type EaseSessionOutput = ShortenSessionOutput

export type ReleaseSessionInput = SessionIdInput
export type ReleaseSessionOutput = {
	changed: SessionSnapshot[]
	/** False when it was already the plan's. */
	released: boolean
} & UndoPart

export type SetCountsTowardPlanInput = {
	sessionId: string
	countsTowardPlan: boolean
}
export type SetCountsTowardPlanOutput = {
	changed: SessionSnapshot[]
} & UndoPart

// ── feeling ───────────────────────────────────────────────────────────────

export type RateSessionInput = { sessionId: string; rpe: number | null }
export type RateSessionOutput = { changed: SessionSnapshot[] } & UndoPart

export type NoteSessionInput = { sessionId: string; note: string }
export type NoteSessionOutput = { changed: SessionSnapshot[] } & UndoPart

// ── recordings ────────────────────────────────────────────────────────────

export type LinkOptionsInput = { recordingId: string }
export type LinkOptionsOutput = {
	recordingId: string
	/** The session the recording stands on now; null if none. */
	currentSessionId: string | null
	/** Planned sessions it could be linked to: same day, same sport. */
	options: SessionSnapshot[]
}

export type LinkRecordingInput = { recordingId: string; sessionId: string }
export type LinkRecordingOutput = {
	changed: SessionSnapshot[]
	removedSessionIds: string[]
} & UndoPart

export type UnlinkRecordingInput = { recordingId: string }
export type UnlinkRecordingOutput = {
	changed: SessionSnapshot[]
	/** The new extra session the recording now stands on. */
	extraSessionId: string
} & UndoPart

// ── strength ──────────────────────────────────────────────────────────────

/** What was on the bar, in the athlete's terms. */
export type StrengthLoad =
	/** A weight in kilos: the whole bar, or one dumbbell per hand. */
	| { kind: 'kg'; kg: number }
	/** Kilos per hand on a pair of dumbbells or kettlebells. */
	| { kind: 'kg-per-hand'; kg: number }
	| { kind: 'bodyweight' }
	/** Bodyweight with `kg` added (a dip belt). */
	| { kind: 'bodyweight-plus'; kg: number }
	/** A machine taking `kg` off the athlete. */
	| { kind: 'assisted'; kg: number }
	/** A pin on a weight stack: a level, not kilos. */
	| { kind: 'machine-level'; level: number; label?: string }
	| { kind: 'band'; band: string }
	/** No external load (a jump, a hold). */
	| { kind: 'none' }

/** What a prescription asks for, which may be a reference to the athlete. */
export type PrescribedLoad =
	| { kind: 'kg'; kg: number; kgMax: number | null }
	/** A share of a max, resolved against the athlete's own numbers. */
	| { kind: 'reference'; text: string }
	| { kind: 'bodyweight'; addedKg: number | null }
	| { kind: 'other'; text: string }

export type Plates = {
	/** Plates for ONE side, heaviest first, e.g. `[20, 10, 2.5]`. */
	perSide: number[]
	barKg: number
	/** What the rack actually makes; may differ from the asked kilos. */
	madeKg: number | null
	exact: boolean
}

export type StrengthSet = {
	/** Pass back as `setIndex`. Warm-up rows have their own range. */
	setIndex: number
	warmup: boolean
	prescribed: {
		reps: number | null
		seconds: number | null
		load: PrescribedLoad | null
		/** The kilos to lift today, from the athlete's own numbers. */
		kg: number | null
		kgUnknownBecause?: string
		/** How to fix an unknown `kg` (e.g. log a max for this lift). */
		kgFix?: string
	}
	/** Plates for `prescribed.kg`; null with a reason when none apply. */
	plates: Plates | null
	platesUnknownBecause?: string
	logged: {
		reps: number | null
		seconds: number | null
		load: StrengthLoad | null
		/** True when finished as asked or changed; false when abandoned. */
		done: boolean
		toFailure: boolean
		repsInReserve: number | null
	} | null
	/** The same set last time this lift was done; null the first time. */
	lastTime: {
		reps: number | null
		seconds: number | null
		load: StrengthLoad
	} | null
}

export type StrengthExercise = {
	stepId: string
	exerciseId: string | null
	name: string
	restSeconds: number | null
	/** True: one side at a time. Null: nobody said. */
	oneSideAtATime: boolean | null
	/** The default load a tap logs; null with why when it needs a number. */
	defaultLoad: StrengthLoad | null
	defaultLoadUnknownBecause?: string
	sets: StrengthSet[]
	/** Why there is no warm-up ramp, when there is none. */
	noWarmupBecause: string | null
}

export type StrengthSessionInput = SessionIdInput
export type StrengthSessionOutput = {
	session: SessionSnapshot
	bodyweightKg: number | null
	/** False: no gym described, so no plate counts. */
	hasGymOnFile: boolean
	/** The program this session belongs to, if one is running. */
	program: { name: string } | null
	exercises: StrengthExercise[]
	loggedWorkingSets: number
	/** Working sets with nothing logged yet. */
	unloggedWorkingSets: number
}

export type StartStrengthSessionInput = SessionIdInput
export type StartStrengthSessionOutput = StrengthSessionOutput

export type LogStrengthSetInput = {
	sessionId: string
	stepId: string
	setIndex: number
	/** Left out on a done set: the prescribed count. */
	reps?: number | null
	seconds?: number | null
	/** Left out: what is already logged, else the prescribed load. */
	load?: StrengthLoad
	/** Default true. False: abandoned (counts as not done). */
	done?: boolean
	toFailure?: boolean
	repsInReserve?: number | null
	/** Required to change what kind of load an already logged set was. */
	changeLoadKind?: boolean
}
export type StrengthRecordHit = {
	exerciseId: string
	kind: 'heaviest' | 'rep-max' | 'estimated-1rm' | 'machine-level'
	reps: number | null
	value: number
	unit: 'kg' | 'level'
	previous: number | null
}
export type LogStrengthSetOutput = {
	set: StrengthSet
	/** Personal records this set just set; usually empty. */
	records: StrengthRecordHit[]
} & UndoPart

export type RemoveStrengthSetInput = {
	sessionId: string
	stepId: string
	setIndex: number
}
export type RemoveStrengthSetOutput = { removed: boolean } & UndoPart

export type FinishStrengthSessionInput = {
	sessionId: string
	/**
	 * Working sets still unlogged: `not-done` finishes anyway and counts them
	 * as not done. Left out, finishing with unlogged sets fails with
	 * `unlogged-sets` and their count, so the app can ask.
	 */
	unloggedSets?: 'not-done'
}
export type LiftResult = {
	exerciseId: string
	name: string
	/** What happens to this lift next time. */
	result:
		| 'goes-up'
		| 'stays'
		| 'goes-down'
		| 'lifted-lighter'
		| 'not-readable'
		| 'skipped'
	/** The working weight from now on. */
	nextKg: number
	reason: string
}
export type FinishStrengthSessionOutput = {
	changed: SessionSnapshot[]
	alreadyFinished: boolean
	/** Empty when the session belongs to no running program. */
	lifts: LiftResult[]
	programName: string | null
} & UndoPart

export type LogStrengthAsPlannedInput = {
	sessionId: string
	/** Sets that went differently; every other set is logged as planned. */
	sets?: Array<{ stepId: string; setIndex: number; reps: number }>
	/** A lift done at another weight; all its sets are logged at it. */
	lifts?: Array<{ stepId: string; kg: number }>
}
export type LogStrengthAsPlannedOutput = {
	changed: SessionSnapshot[]
	loggedSets: number
	alreadyLogged: boolean
	lifts: LiftResult[]
} & UndoPart

export type PlatesForInput = { sessionId: string; stepId: string; kg: number }
export type PlatesForOutput = {
	plates: Plates | null
	platesUnknownBecause?: string
	gymName: string | null
}

// ── adaptation ────────────────────────────────────────────────────────────
//
// The proposals themselves are read with the `proposals` read capability
// (see reads.md); their `id`s are what these writes take.

export type AnswerProposalInput = {
	proposalId: string
	answer: 'yes' | 'no'
	/** A move only: `this-week` (default) or `from-now-on`. */
	scope?: 'this-week' | 'from-now-on'
}
export type AnswerProposalOutput = {
	proposalId: string
	/** The proposal's state now. */
	status: 'accepted' | 'declined'
	/** False on a yes that found nothing left to change (kept as answered). */
	applied: boolean
	/** Sessions the yes changed or placed. */
	changed: SessionSnapshot[]
} & UndoPart

export type AcceptAllProposalsInput = Record<string, never>
export type AcceptAllProposalsOutput = {
	accepted: string[]
	/** Ids that could not be answered, with why. */
	failed: Array<{ proposalId: string; because: string }>
	changed: SessionSnapshot[]
} & UndoPart

export type AcceptRoundInput = { proposalId: string; factor: number }
export type AcceptRoundOutput = AnswerProposalOutput

export type EaseWeekInput = {
	/** The Monday of the week to ease; only the coming week can be. */
	week?: string
}
export type EaseWeekOutput = {
	week: string
	sessionsChanged: number
	changed: SessionSnapshot[]
	/** Planned volume per sport before and after, in each sport's unit. */
	volume: Array<{
		sport: string
		/** `load` is training-load points (TSS). */
		unit: 'km' | 'hours' | 'load' | 'sets'
		before: number | null
		after: number | null
	}>
} & UndoPart

export type UndoChangeInput = { proposalId: string }
export type UndoAllChangesInput = {
	/** The Monday of the closed week whose automatic changes to undo;
	 * left out, the last closed week. */
	closedWeek?: string
}
export type UndoAllChangesOutput = UndoOutput & {
	/** How many changes were taken back. */
	count: number
	/** Changes that stand, with why (one was trained since, say). */
	kept: string[]
}

export type RefreshAdaptationInput = Record<string, never>
export type RefreshAdaptationOutput = {
	/** A week closed now and the plan wrote its proposals. */
	newProposals: boolean
	/** Proposals applied quietly or automatically by this run. */
	appliedIds: string[]
	/** Proposals waiting for a yes or no now. */
	waiting: number
}

// ── undo ──────────────────────────────────────────────────────────────────

export type UndoInput = { token: string }
export type UndoOutput = {
	/** False when it had already been undone: nothing changed now. */
	undone: boolean
	changed: SessionSnapshot[]
	removedSessionIds: string[]
}
