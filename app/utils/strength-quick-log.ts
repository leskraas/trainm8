/**
 * The **quick strength log** on I dag (#505 stories 83–84): after a strength
 * session, a short log pre-filled from the planned sets. One tap logs it _som
 * planlagt_; _Endre_ changes the reps of a set that went differently, or marks
 * it not done. It writes through the strength set log (ADR 0056 §2), one
 * upsert per set, and finishes the session the way the runner does.
 *
 * **The weight is the prescription's and is not edited here** (ADR 0064 §2): a
 * set is logged at the weight the program resolved, exactly as a tap on the
 * runner's circle logs it, and an off-program weight still has no way in. The
 * log says so rather than offering a field the write would have to ignore.
 *
 * Shared by the home row, the resource route and the server, so the offer and
 * the write can never disagree about when a session may be logged this way.
 * Pure: no database, no clock of its own — callers pass the local days.
 */

import { z } from 'zod'
import { MARK_DONE_REACH_DAYS } from './import-fit.ts'
import { type SetUnit } from './strength/working-load.ts'

/** Where the quick log is read and posted (`routes/resources/strength-log.tsx`). */
export const STRENGTH_LOG_ACTION = '/resources/strength-log'

/**
 * How far back the quick log is offered: the session's day and the six before
 * it — the same week _Gjort_ reaches, so a missed gym day and a missed run are
 * caught up on over the same stretch.
 */
export const QUICK_LOG_REACH_DAYS = MARK_DONE_REACH_DAYS

/** The most reps (or seconds of a hold) one set may claim from the log. */
export const QUICK_LOG_MAX_COUNT = 600

/**
 * Whether a session takes the quick log: a strength session with sets on its
 * plan, on a day that has begun and is at most a week back, with **no working
 * set logged yet**. Its status does not enter into it: a session an import
 * linked, or one marked done, is `completed` with nothing lifted in it — no
 * provider carries kilos or sets (ADR 0056 §1), which is the log's main case.
 * A session the runner has started is finished in the runner, where its sets
 * are.
 */
export function canQuickLogStrength(
	session: {
		workoutDiscipline: string | null
		/** Prescribed working sets on the session's Workout (`readPlannedSets`). */
		plannedSets: number
		/** Working sets already logged against this session. */
		loggedWorkingSets: number
		dayKey: string
	},
	{ todayKey, reachFromKey }: { todayKey: string; reachFromKey: string },
): boolean {
	return (
		session.workoutDiscipline === 'strength' &&
		session.plannedSets > 0 &&
		session.loggedWorkingSets === 0 &&
		session.dayKey <= todayKey &&
		session.dayKey >= reachFromKey
	)
}

/** Why the server turned a quick log down. */
export const QUICK_LOG_REFUSALS = [
	'session-not-found',
	'not-loggable',
	'not-plannable',
	'unknown-set',
	'nothing-done',
] as const
export type QuickLogRefusal = (typeof QUICK_LOG_REFUSALS)[number]

const SessionId = z.string().min(1)

/** One set as _Endre_ posts it. No count (or 0) is a set not done. */
const EditedSet = z.object({
	stepId: z.string().min(1),
	orderIndex: z.number().int().min(0),
	count: z.number().int().min(0).max(QUICK_LOG_MAX_COUNT).optional(),
})

/**
 * _Som planlagt_ posts the session alone — the server reads the plan, so the
 * one tap carries nothing that could disagree with it.
 */
export const StrengthLogAsPlannedSchema = z.object({
	intent: z.literal('as-planned'),
	sessionId: SessionId,
})

/** _Endre_ posts every set with its count; a set left out is logged as
 * planned. */
export const StrengthLogEditSchema = z.object({
	intent: z.literal('edited'),
	sessionId: SessionId,
	sets: z.array(EditedSet).min(1),
})

/**
 * _Angre_ from the log's toast (ADR 0088): the set logs that log wrote, as
 * its reply named them — comma-separated, since the toast posts one field.
 */
export const StrengthLogUndoSchema = z.object({
	intent: z.literal('undo'),
	sessionId: SessionId,
	setLogIds: z.preprocess(
		(value) =>
			typeof value === 'string'
				? value.split(',').filter((id) => id.length > 0)
				: value,
		z.array(z.string().min(1)).min(1).max(200),
	),
})

/** Every post, as the resource route parses it. */
export const StrengthLogActionSchema = z.discriminatedUnion('intent', [
	StrengthLogAsPlannedSchema,
	StrengthLogEditSchema,
	StrengthLogUndoSchema,
])

/** `?sessionId=` on the quick log's read. */
export const StrengthLogQuerySchema = z.object({ sessionId: SessionId })

/** One planned set, pre-filled. */
export type QuickLogSet = {
	orderIndex: number
	/** The prescribed count: reps, or seconds for a timed hold. */
	target: number
	unit: SetUnit
}

/** One lift of the session, as the quick log shows it. */
export type QuickLogLift = {
	stepId: string
	name: string
	/** `5×5`, `3×45 s`. */
	scheme: string
	/** `82,5 kg`, `kroppsvekt + 15 kg` — or null where it does not resolve. */
	loadLabel: string | null
	/** False where a set has no count or the weight does not resolve: such a
	 * lift is logged in the runner, never guessed here. */
	loggable: boolean
	sets: QuickLogSet[]
}

/** What the quick log reads: the plan, pre-filled, set by set. */
export type QuickLog = {
	sessionId: string
	/** Every lift is loggable. Otherwise _Som planlagt_ would log only part of
	 * the session as though it were all of it, so the log sends the athlete to
	 * the runner instead. */
	loggable: boolean
	lifts: QuickLogLift[]
	/** The runner, for a session the quick log cannot take. */
	runnerTo: string
}
