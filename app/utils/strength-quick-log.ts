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

import { z } from 'zod/v3'
import { MARK_DONE_REACH_DAYS } from './import-fit.ts'
import { QUICK_LOG_LABELS } from './labels.ts'
import { parseKiloInput } from './strength/kilo-input.ts'
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

/** The heaviest weight _Endre_ takes, in the load's own kilos — the writing
 * line's own ceiling (`workout-sentence.ts`), so 500 kg is still a weight. */
export const QUICK_LOG_MAX_KG = 500

/**
 * A weight as the quick log stores it, or null where it cannot be true: kept to
 * the hundredth (`postedNumber`'s rule — two decimals is the smallest plate
 * anybody owns, twice over), more than 0 and at most {@link QUICK_LOG_MAX_KG}.
 */
export function quickLogKg(kg: number): number | null {
	if (!Number.isFinite(kg)) return null
	const kept = Math.round(kg * 100) / 100
	return kept > 0 && kept <= QUICK_LOG_MAX_KG ? kept : null
}

/**
 * The weight one press of _Endre_'s − or + lands on: the next multiple of the
 * rack's step below or above, so an off-grid 81 kg steps to 80 or 82,5 rather
 * than to 78,5 or 83,5. Never below one step, never above
 * {@link QUICK_LOG_MAX_KG}.
 */
export function stepKilo(kg: number, stepKg: number, direction: 1 | -1) {
	const scale = 100
	const at = Math.round(kg * scale)
	const step = Math.max(1, Math.round(stepKg * scale))
	const next =
		direction === 1
			? (Math.floor(at / step) + 1) * step
			: (Math.ceil(at / step) - 1) * step
	return Math.min(QUICK_LOG_MAX_KG * scale, Math.max(step, next)) / scale
}

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
	/** A weight that cannot be true: 0, below a hundredth, or over 500 kg. */
	'bad-weight',
	/** A weight on a lift whose load carries no number (bodyweight, unloaded). */
	'weight-not-editable',
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

/**
 * One lift's weight as _Endre_ posts it (#530): typed with either separator
 * (`82,5`, `82.5`), blank where it was left as planned.
 */
const EditedLift = z.object({
	stepId: z.string().min(1),
	kg: z
		.string()
		.optional()
		.transform((typed, ctx) => {
			if (typed == null || typed.trim() === '') return null
			const read = parseKiloInput(typed)
			const kg = read == null ? null : quickLogKg(read)
			if (kg == null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: QUICK_LOG_LABELS.weightInvalid,
				})
				return z.NEVER
			}
			return kg
		}),
})

/** _Endre_ posts every set with its count, and each weighted lift's weight; a
 * set left out is logged as planned, and so is a lift whose weight is blank. */
export const StrengthLogEditSchema = z.object({
	intent: z.literal('edited'),
	sessionId: SessionId,
	sets: z.array(EditedSet).min(1),
	lifts: z.array(EditedLift).optional(),
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
	/**
	 * The weight _Endre_ may change (#530, ADR 0064 amended), in the load's own
	 * kilos, and the step its − and + take — a pair of the smallest plates the
	 * athlete's rack owns, else the app's stated 2,5 kg default. Null where the
	 * load carries no number (bodyweight, unloaded) or does not resolve.
	 */
	weight: { kg: number; stepKg: number } | null
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
