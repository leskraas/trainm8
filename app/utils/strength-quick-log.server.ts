/**
 * The server half of the **quick strength log** on I dag (#505 stories 83–84):
 * read the plan pre-filled, and log it — as planned in one tap, or with the
 * sets that went differently changed.
 *
 * **It decides nothing the runner does not already decide.** The weight a set is
 * logged at is `buildWorkingLoad`'s, the one a tap on the runner's circle posts
 * (ADR 0064 §1), so the quick log and the runner cannot write the same set two
 * ways; each set goes through `saveLoggedSet`, the upsert on `(sessionId,
 * stepId, orderIndex)` (ADR 0056 §2); and the session is finished by
 * `finishStrengthSession`, which marks it done and folds it into a running
 * program exactly once (ADR 0060 §6). When the offer stands is
 * `canQuickLogStrength`'s, the same rule the home row reads.
 */
import {
	buildWorkingLoad,
	type WorkingLoad,
} from '#app/routes/training/__runner-presenter.ts'
import { addDays, localDate } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import { QUICK_LOG_LABELS } from './labels.ts'
import {
	type LogExercise,
	getStrengthLogView,
	saveLoggedSet,
} from './strength-log.server.ts'
import { type LoadValue } from './strength-log.ts'
import {
	type QuickLog,
	type QuickLogLift,
	type QuickLogRefusal,
	canQuickLogStrength,
	QUICK_LOG_REACH_DAYS,
} from './strength-quick-log.ts'
import {
	type FinishSessionResult,
	finishStrengthSession,
} from './strength-runner.server.ts'

/** What a quick log asks for: the plan as it stands, or the plan with the sets
 * that went differently. A set left out of `sets` is logged as planned. */
export type QuickLogEntry =
	| { kind: 'as-planned' }
	| {
			kind: 'edited'
			sets: Array<{ stepId: string; orderIndex: number; count?: number }>
	  }

export type QuickLogResult =
	| {
			ok: true
			sessionId: string
			/** Working sets this call logged; 0 when it found the session done. */
			loggedSets: number
			/** True when the session was already logged and nothing was written —
			 * the double tap's answer. */
			alreadyLogged: boolean
			/** The runner's own finish, outcomes and all; null when nothing was
			 * written. */
			finished: Extract<FinishSessionResult, { ok: true }> | null
	  }
	| { ok: false; reason: QuickLogRefusal }

type Plan = { quickLog: QuickLog; loads: Map<string, LoadValue> }

/**
 * The quick log for one of the athlete's sessions: the planned lifts and their
 * sets, pre-filled, with each lift's weight said as the prescription resolves
 * it today. Null when the session is not this athlete's or not a quick log's to
 * take (`canQuickLogStrength`).
 */
export async function readQuickLog(
	userId: string,
	sessionId: string,
	{ now = new Date(), timezone }: { now?: Date; timezone: string },
): Promise<QuickLog | null> {
	if (!(await offerStands(userId, sessionId, { now, timezone }))) return null
	return (await planFor(userId, sessionId))?.quickLog ?? null
}

/**
 * Log a strength session from I dag: every planned set as planned, or with the
 * sets that differed changed — then finish it, as the runner's Finish does.
 *
 * **A double tap logs once.** Calls for one session run one after another, and
 * the second finds the session done and writes nothing (`alreadyLogged`); every
 * set is an upsert in any case, and the finish folds a program in only once.
 */
export async function logStrengthSession(
	userId: string,
	sessionId: string,
	entry: QuickLogEntry,
	{ now = new Date(), timezone }: { now?: Date; timezone: string },
): Promise<QuickLogResult> {
	return oneAtATime(sessionId, () =>
		logNow(userId, sessionId, entry, { now, timezone }),
	)
}

async function logNow(
	userId: string,
	sessionId: string,
	entry: QuickLogEntry,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<QuickLogResult> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			status: true,
			setLogs: {
				where: { role: 'working', outcome: 'completed' },
				select: { id: true },
			},
		},
	})
	if (!session) return { ok: false, reason: 'session-not-found' }
	if (session.status === 'completed') {
		return {
			ok: true,
			sessionId,
			loggedSets: 0,
			alreadyLogged: true,
			finished: null,
		}
	}
	if (!(await offerStands(userId, sessionId, { now, timezone }))) {
		return { ok: false, reason: 'not-loggable' }
	}
	const plan = await planFor(userId, sessionId)
	if (!plan) return { ok: false, reason: 'session-not-found' }
	if (!plan.quickLog.loggable) return { ok: false, reason: 'not-plannable' }

	const counts = countsFor(plan.quickLog, entry)
	if (counts === 'unknown-set') return { ok: false, reason: 'unknown-set' }
	if (counts.every((set) => set.count <= 0)) {
		return { ok: false, reason: 'nothing-done' }
	}

	let loggedSets = 0
	for (const set of counts) {
		if (set.count <= 0) continue
		const saved = await saveLoggedSet({
			athleteId: userId,
			sessionId,
			stepId: set.stepId,
			orderIndex: set.orderIndex,
			role: 'working',
			outcome: 'completed',
			toFailure: false,
			load: plan.loads.get(set.stepId)!,
			reps: set.unit === 'reps' ? set.count : null,
			repsLeft: null,
			durationSec: set.unit === 'seconds' ? set.count : null,
			rir: null,
			restTakenSec: null,
		})
		// The plan was read a moment ago from the same rows, so a refusal here is
		// the session changing under the log — said as such, not half-finished.
		if (!saved.ok) return { ok: false, reason: 'not-loggable' }
		loggedSets += 1
	}
	const finished = await finishStrengthSession({ userId, sessionId, now })
	if (!finished.ok) return { ok: false, reason: 'not-loggable' }
	return { ok: true, sessionId, loggedSets, alreadyLogged: false, finished }
}

/** Whether `canQuickLogStrength` holds for the session as stored now. */
async function offerStands(
	userId: string,
	sessionId: string,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<boolean> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			status: true,
			scheduledAt: true,
			workout: {
				select: {
					discipline: true,
					blocks: {
						select: {
							steps: { select: { _count: { select: { sets: true } } } },
						},
					},
				},
			},
			_count: {
				select: {
					setLogs: { where: { role: 'working', outcome: 'completed' } },
				},
			},
		},
	})
	if (!session) return false
	const todayKey = localDate(now, timezone)
	return canQuickLogStrength(
		{
			status: session.status,
			workoutDiscipline: session.workout?.discipline ?? null,
			plannedSets: (session.workout?.blocks ?? [])
				.flatMap((block) => block.steps)
				.reduce((sum, step) => sum + step._count.sets, 0),
			loggedWorkingSets: session._count.setLogs,
			dayKey: localDate(session.scheduledAt, timezone),
		},
		{ todayKey, reachFromKey: addDays(todayKey, -QUICK_LOG_REACH_DAYS) },
	)
}

/** The runner's own view of the session, as the quick log reads it, with the
 * Load Value each lift's sets are logged at. */
async function planFor(
	userId: string,
	sessionId: string,
): Promise<Plan | null> {
	const view = await getStrengthLogView(userId, sessionId)
	if (!view) return null
	const loads = new Map<string, LoadValue>()
	const lifts = view.exercises.map((exercise): QuickLogLift => {
		const working = buildWorkingLoad(exercise)
		const load = working.kind === 'resolved' ? loadValueOf(working) : null
		if (load) loads.set(exercise.stepId, load)
		const sets = plannedSets(exercise)
		return {
			stepId: exercise.stepId,
			name: exercise.name,
			scheme: QUICK_LOG_LABELS.scheme(sets.length, sameCount(sets)),
			loadLabel:
				working.kind === 'resolved'
					? QUICK_LOG_LABELS.load(working.loadKind, working.kg)
					: null,
			loggable:
				load != null &&
				sets.length > 0 &&
				sets.every((set) => set.target != null && set.target > 0),
			sets: sets.flatMap((set) =>
				set.target != null && set.target > 0
					? [{ orderIndex: set.orderIndex, target: set.target, unit: set.unit }]
					: [],
			),
		}
	})
	return {
		quickLog: {
			sessionId: view.sessionId,
			loggable: lifts.length > 0 && lifts.every((lift) => lift.loggable),
			lifts,
			runnerTo: `/training/sessions/${view.sessionId}/log`,
		},
		loads,
	}
}

/** The prescribed rows of a lift, as the runner's circles read them: a timed
 * hold counts in seconds, everything else in reps. */
function plannedSets(exercise: LogExercise) {
	return exercise.rows.map((row) => {
		const timed =
			row.prescribedReps == null && row.prescribedDurationSec != null
		return {
			orderIndex: row.orderIndex,
			target: timed ? row.prescribedDurationSec : row.prescribedReps,
			unit: timed ? ('seconds' as const) : ('reps' as const),
		}
	})
}

function sameCount(
	sets: ReturnType<typeof plannedSets>,
): { count: number; unit: 'reps' | 'seconds' } | null {
	const first = sets[0]
	if (!first || first.target == null) return null
	return sets.every((s) => s.target === first.target && s.unit === first.unit)
		? { count: first.target, unit: first.unit }
		: null
}

/**
 * The Load Value a set is logged at — the member and number the runner's tap
 * posts for the same lift, so a set logged here and re-tapped there is the same
 * load and not a restatement (`saveLoggedSet`'s load-kind lock).
 */
function loadValueOf(
	working: Extract<WorkingLoad, { kind: 'resolved' }>,
): LoadValue | null {
	const kg = working.kg == null ? null : Number(working.kg.toFixed(2))
	switch (working.loadKind) {
		case 'external':
			return kg != null && kg > 0 ? { kind: 'external', kg } : null
		case 'bodyweight':
			return { kind: 'bodyweight' }
		case 'bodyweightPlus':
			return kg != null && kg > 0
				? { kind: 'bodyweightPlus', addedKg: kg }
				: null
		case 'assisted':
			return kg != null && kg > 0 ? { kind: 'assisted', assistKg: kg } : null
		case 'unloaded':
			return { kind: 'unloaded' }
	}
}

/** Every planned set with the count it is logged at: the plan's, or the one
 * _Endre_ posted for it. A posted set the plan does not have is refused. */
function countsFor(
	quickLog: QuickLog,
	entry: QuickLogEntry,
):
	| Array<{
			stepId: string
			orderIndex: number
			unit: 'reps' | 'seconds'
			count: number
	  }>
	| 'unknown-set' {
	const planned = quickLog.lifts.flatMap((lift) =>
		lift.sets.map((set) => ({
			stepId: lift.stepId,
			orderIndex: set.orderIndex,
			unit: set.unit,
			count: set.target,
		})),
	)
	if (entry.kind === 'as-planned') return planned
	const keyOf = (set: { stepId: string; orderIndex: number }) =>
		`${set.stepId}_${set.orderIndex}`
	const known = new Set(planned.map(keyOf))
	if (entry.sets.some((set) => !known.has(keyOf(set)))) return 'unknown-set'
	const posted = new Map(entry.sets.map((set) => [keyOf(set), set.count ?? 0]))
	return planned.map((set) => ({
		...set,
		count: posted.get(keyOf(set)) ?? set.count,
	}))
}

/**
 * Calls for one session, one after another. A double tap's two posts would
 * otherwise both find the session unlogged and race the same upserts; in line,
 * the second finds it done. Per process, which is where one athlete's two taps
 * land.
 */
const inFlight = new Map<string, Promise<unknown>>()
async function oneAtATime<T>(key: string, run: () => Promise<T>): Promise<T> {
	const before = inFlight.get(key) ?? Promise.resolve()
	const mine = before.catch(() => {}).then(run)
	inFlight.set(key, mine)
	try {
		return await mine
	} finally {
		if (inFlight.get(key) === mine) inFlight.delete(key)
	}
}
