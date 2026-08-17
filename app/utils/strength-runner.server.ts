/**
 * **Finishing a strength session** — the one write the runner owes that logging a
 * set does not.
 *
 * Two things happen, in this order, and neither is an inference:
 *
 * 1. `WorkoutSession.status` becomes `completed`, because the athlete said so.
 *    ADR 0056 left this open and the spec resolves it **by direction rather than
 *    by a second source of truth**: finishing is an explicit athlete act, and
 *    every strength aggregate still reads logged working sets and never `status`.
 *    The column is calendar and list state; the sets are the truth. So the two
 *    cannot disagree about anything that matters, and neither is derived from the
 *    other.
 * 2. Where the session belongs to a running **Program**, the log is folded back
 *    in — `recordProgramSession` reads `ExerciseSetLog` and re-runs the pure
 *    engine server-side, so the posted form cannot move a working weight.
 *
 * The order matters only in one direction: a program fold that fails must not
 * leave the session marked done on a run that did not advance, so the fold goes
 * first and the status follows it.
 *
 * Queries and writes; decides nothing.
 */
import { prisma } from './db.server.ts'
import { type LiftOutcome } from './strength/program-engine.ts'
import { recordProgramSession } from './strength-program.server.ts'

export type FinishSessionResult =
	| {
			ok: true
			/** Per lift: incremented, repeated, or a **Stall Response** with its
			 * reason. Empty where the session belongs to no running program — a
			 * one-off gym session progresses nothing, and saying "no change" about a
			 * program nobody is on would be a claim. */
			outcomes: LiftOutcome[]
			liftNames: Record<string, string>
			programName: string | null
			loggedWorkingSets: number
	  }
	| { ok: false; reason: 'not-found' | 'nothing-logged' }

/**
 * Finish the session.
 *
 * Refuses a session with **no logged working set**: "completed" on a strength
 * session that recorded nothing is the exact disagreement between the column and
 * the sets that the direction above exists to prevent. Warm-ups and abandoned
 * sets do not count, for the same reason no aggregate counts them.
 */
export async function finishStrengthSession(input: {
	userId: string
	sessionId: string
	now?: Date
}): Promise<FinishSessionResult> {
	const now = input.now ?? new Date()
	const session = await prisma.workoutSession.findFirst({
		where: { id: input.sessionId, userId: input.userId },
		select: {
			id: true,
			workoutId: true,
			setLogs: {
				where: { role: 'working', outcome: 'completed' },
				select: { id: true },
			},
		},
	})
	if (!session) return { ok: false, reason: 'not-found' }
	if (session.setLogs.length === 0)
		return { ok: false, reason: 'nothing-logged' }

	const instance = session.workoutId
		? await prisma.programInstance.findFirst({
				where: {
					userId: input.userId,
					status: 'active',
					program: { days: { some: { workoutId: session.workoutId } } },
				},
				orderBy: { startedOn: 'desc' },
				select: { id: true, program: { select: { name: true } } },
			})
		: null

	let outcomes: LiftOutcome[] = []
	let liftNames: Record<string, string> = {}
	if (instance) {
		const recorded = await recordProgramSession({
			userId: input.userId,
			instanceId: instance.id,
			sessionId: session.id,
			now,
		})
		// A run that cannot place this session's day is a reason to leave the
		// program alone, not a reason to refuse the athlete their finished session.
		if (recorded.ok) {
			outcomes = recorded.outcomes
			liftNames = recorded.liftNames
		}
	}

	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { status: 'completed' },
		select: { id: true },
	})

	return {
		ok: true,
		outcomes,
		liftNames,
		programName: instance?.program.name ?? null,
		loggedWorkingSets: session.setLogs.length,
	}
}
