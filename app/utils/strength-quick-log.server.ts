/**
 * The server half of the **quick strength log** on I dag (#505 stories 83–84):
 * read the plan pre-filled, and log it — as planned in one tap, or with the
 * sets that went differently changed.
 *
 * **It decides nothing the runner does not already decide.** The weight a set is
 * logged at is `buildWorkingLoad`'s, the one a tap on the runner's circle posts
 * (ADR 0064 §1), so the quick log and the runner cannot write the same set two
 * ways; a program session is re-stamped first, as opening it in the runner
 * re-stamps it, so the weight is the run's current one; each set goes through
 * `saveLoggedSet`, the upsert on `(sessionId, stepId, orderIndex)` (ADR 0056
 * §2); and the session is finished as the runner's Finish finishes it, folded
 * into a running program once (ADR 0060 §6). When the offer stands is
 * `canQuickLogStrength`'s, the same rule the home row reads, over the planned
 * sets as `readPlannedSets` counts them for the week's numbers too.
 *
 * **All of it or none of it.** The sets and the finish are one transaction,
 * opened by a claim: a conditional `UPDATE` that matches only while the session
 * has no working set logged. SQLite holds the write from that statement on, so
 * a second quick log, or a runner tap, waits; when the second log gets its turn
 * the claim matches nothing and it writes nothing.
 */
import { invariant } from '@epic-web/invariant'
import { type Prisma } from '@prisma/client'
import { addDays, localDate, mondayOfDay } from './athlete-calendar.ts'
import { readPlannedSets } from './dashboard.ts'
import { prisma } from './db.server.ts'
import { QUICK_LOG_LABELS } from './labels.ts'
import { getWeekTrackActual } from './plan-outline/week-volumes.server.ts'
import { type LiftOutcome } from './strength/program-engine.ts'
import {
	type LiftScheme,
	type SetUnit,
	buildWorkingLoad,
	liftSchemeOf,
	plannedRowsOf,
	workingLoadValue,
} from './strength/working-load.ts'
import { getStrengthLogView, saveLoggedSet } from './strength-log.server.ts'
import { type LoadValue, formatKg } from './strength-log.ts'
import { openNextProgramSession } from './strength-program.server.ts'
import {
	type QuickLog,
	type QuickLogLift,
	type QuickLogRefusal,
	canQuickLogStrength,
	QUICK_LOG_REACH_DAYS,
} from './strength-quick-log.ts'
import {
	activeRunFor,
	finishIn,
	prepareFinish,
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
			/** Working sets this call logged; 0 when it found the session logged. */
			loggedSets: number
			/** True when the session was already logged and nothing was written —
			 * the double tap's answer. */
			alreadyLogged: boolean
			/** What finishing did; null when nothing was written. */
			finished: {
				outcomes: LiftOutcome[]
				liftNames: Record<string, string>
				programName: string | null
			} | null
			/** The week's done sets in the strength track, before and after; null
			 * without a strength track, or when nothing was written. */
			week: { weekKey: string; before: number; after: number } | null
	  }
	| { ok: false; reason: QuickLogRefusal }

/** Thrown inside the transaction to roll the log back with its reason. */
class QuickLogRefused extends Error {
	constructor(readonly reason: QuickLogRefusal | 'already-logged') {
		super(reason)
	}
}

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
	const facts = await readFacts(userId, sessionId, { now, timezone })
	if (!facts?.offered) return null
	return (await planFor(userId, sessionId, facts.repeated))?.quickLog ?? null
}

/**
 * Log a strength session from I dag: every planned set as planned, or with the
 * sets that differed changed — then finish it, as the runner's Finish does, in
 * the same transaction.
 *
 * **A double tap logs once.** The second call finds the first one's sets —
 * before it starts, or at its claim — and answers `alreadyLogged`.
 */
export async function logStrengthSession(
	userId: string,
	sessionId: string,
	entry: QuickLogEntry,
	{ now = new Date(), timezone }: { now?: Date; timezone: string },
): Promise<QuickLogResult> {
	const facts = await readFacts(userId, sessionId, { now, timezone })
	if (!facts) return { ok: false, reason: 'session-not-found' }
	if (facts.loggedWorkingSets > 0) {
		return alreadyLoggedOr(sessionId, facts.status)
	}
	if (!facts.offered) return { ok: false, reason: 'not-loggable' }

	// A program session prescribes its run's weight as of the moment it is
	// opened; re-open it now so the log carries the current one.
	if (facts.run && !facts.folded) {
		await openNextProgramSession({
			userId,
			instanceId: facts.run.id,
			scheduledAt: facts.scheduledAt,
			now,
			onlySessionId: sessionId,
		})
	}
	const plan = await planFor(userId, sessionId, facts.repeated)
	if (!plan) return { ok: false, reason: 'session-not-found' }
	if (!plan.quickLog.loggable) return { ok: false, reason: 'not-plannable' }
	const counts = countsFor(plan.quickLog, entry)
	if (counts === 'unknown-set') return { ok: false, reason: 'unknown-set' }
	const done = counts.filter((set) => set.count > 0)
	if (done.length === 0) return { ok: false, reason: 'nothing-done' }

	const prepared = await prepareFinish({
		userId,
		sessionId,
		now,
		known: { run: facts.run, folded: facts.folded },
	})
	invariant(prepared, 'the session was read a moment ago')
	const weekKey = mondayOfDay(facts.dayKey)
	const before = await getWeekTrackActual(userId, {
		weekKey,
		discipline: 'strength',
		now,
	})

	let finished: Awaited<ReturnType<typeof finishIn>>
	try {
		finished = await prisma.$transaction(
			async (tx) => {
				const claimed = await tx.$executeRaw`
					UPDATE "WorkoutSession" SET "status" = "status"
					WHERE "id" = ${sessionId} AND "userId" = ${userId}
					AND NOT EXISTS (
						SELECT 1 FROM "ExerciseSetLog"
						WHERE "sessionId" = ${sessionId}
						AND "role" = 'working' AND "outcome" = 'completed'
					)`
				if (claimed === 0) throw new QuickLogRefused('already-logged')
				for (const set of done) {
					const load = plan.loads.get(set.stepId)
					invariant(load, 'a loggable lift has a load')
					const saved = await saveIn(tx, userId, sessionId, set, load)
					// The plan was read from the same rows a moment ago, so a refusal
					// here is the session changing under the log.
					if (!saved) throw new QuickLogRefused('not-loggable')
				}
				return finishIn(tx, prepared)
			},
			{ timeout: 15_000 },
		)
	} catch (error) {
		if (!(error instanceof QuickLogRefused)) throw error
		if (error.reason !== 'already-logged') {
			return { ok: false, reason: error.reason }
		}
		const status = (
			await prisma.workoutSession.findFirst({
				where: { id: sessionId, userId },
				select: { status: true },
			})
		)?.status
		return alreadyLoggedOr(sessionId, status ?? 'scheduled')
	}

	const after = await getWeekTrackActual(userId, {
		weekKey,
		discipline: 'strength',
		now,
	})
	return {
		ok: true,
		sessionId,
		loggedSets: done.length,
		alreadyLogged: false,
		finished,
		week: before != null && after != null ? { weekKey, before, after } : null,
	}
}

/** Sets are in already: the double tap's answer once the session is finished,
 * and the runner's business while it is not. */
function alreadyLoggedOr(sessionId: string, status: string): QuickLogResult {
	return status === 'completed'
		? {
				ok: true,
				sessionId,
				loggedSets: 0,
				alreadyLogged: true,
				finished: null,
				week: null,
			}
		: { ok: false, reason: 'not-loggable' }
}

async function saveIn(
	tx: Prisma.TransactionClient,
	userId: string,
	sessionId: string,
	set: { stepId: string; orderIndex: number; unit: SetUnit; count: number },
	load: LoadValue,
): Promise<boolean> {
	const saved = await saveLoggedSet(
		{
			athleteId: userId,
			sessionId,
			stepId: set.stepId,
			orderIndex: set.orderIndex,
			role: 'working',
			outcome: 'completed',
			toFailure: false,
			load,
			reps: set.unit === 'reps' ? set.count : null,
			repsLeft: null,
			durationSec: set.unit === 'seconds' ? set.count : null,
			rir: null,
			restTakenSec: null,
		},
		{ db: tx, detectRecords: false },
	)
	return saved.ok
}

/**
 * Everything the offer and the write read about the session, in one query:
 * whether the offer stands, the planned sets as `readPlannedSets` counts them,
 * and the running program it belongs to, if any.
 */
async function readFacts(
	userId: string,
	sessionId: string,
	{ now, timezone }: { now: Date; timezone: string },
) {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			status: true,
			scheduledAt: true,
			workoutId: true,
			workout: {
				select: {
					discipline: true,
					copiedFromId: true,
					blocks: {
						select: {
							repeatCount: true,
							seriesRepeatCount: true,
							steps: { select: { sets: { select: { id: true } } } },
						},
					},
				},
			},
			_count: {
				select: {
					setLogs: { where: { role: 'working', outcome: 'completed' } },
					programApplications: true,
				},
			},
		},
	})
	if (!session) return null
	const planned = readPlannedSets(session.workout?.blocks ?? [])
	const todayKey = localDate(now, timezone)
	const dayKey = localDate(session.scheduledAt, timezone)
	const loggedWorkingSets = session._count.setLogs
	return {
		status: session.status,
		scheduledAt: session.scheduledAt,
		dayKey,
		loggedWorkingSets,
		repeated: planned.repeated,
		offered: canQuickLogStrength(
			{
				workoutDiscipline: session.workout?.discipline ?? null,
				plannedSets: planned.total,
				loggedWorkingSets,
				dayKey,
			},
			{ todayKey, reachFromKey: addDays(todayKey, -QUICK_LOG_REACH_DAYS) },
		),
		run: await activeRunFor(userId, session),
		folded: session._count.programApplications > 0,
	}
}

type Plan = { quickLog: QuickLog; loads: Map<string, LoadValue> }

/**
 * The runner's own view of the session, as the quick log reads it, with the
 * Load Value each lift's sets are logged at. A session with a repeated block is
 * not loggable here: the runner logs it round by round (one row per set per
 * round, `prescribedSetForRow`), and this short log has not been taught to show
 * rounds, so it sends the athlete there rather than guess.
 */
async function planFor(
	userId: string,
	sessionId: string,
	repeated: boolean,
): Promise<Plan | null> {
	const view = await getStrengthLogView(userId, sessionId)
	if (!view) return null
	const loads = new Map<string, LoadValue>()
	const lifts = view.exercises.map((exercise): QuickLogLift => {
		const working = buildWorkingLoad(exercise)
		const load = working.kind === 'resolved' ? workingLoadValue(working) : null
		if (load) loads.set(exercise.stepId, load)
		const rows = plannedRowsOf(exercise.rows)
		const scheme: LiftScheme = liftSchemeOf(exercise.rows)
		return {
			stepId: exercise.stepId,
			name: exercise.name,
			scheme: QUICK_LOG_LABELS.scheme(scheme),
			loadLabel:
				working.kind === 'resolved'
					? QUICK_LOG_LABELS.load(
							working.loadKind,
							working.kg == null ? null : formatKg(working.kg),
						)
					: null,
			loggable:
				!repeated &&
				load != null &&
				rows.length > 0 &&
				rows.every((row) => row.target != null && row.target > 0),
			sets: rows.flatMap((row) =>
				row.target != null && row.target > 0
					? [{ orderIndex: row.orderIndex, target: row.target, unit: row.unit }]
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

/** Every planned set with the count it is logged at: the plan's, or the one
 * _Endre_ posted for it. A posted set the plan does not have is refused. */
function countsFor(
	quickLog: QuickLog,
	entry: QuickLogEntry,
):
	| Array<{ stepId: string; orderIndex: number; unit: SetUnit; count: number }>
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
