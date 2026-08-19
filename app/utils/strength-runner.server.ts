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
 * The two are **one write**. Marking the session done is the same act as folding
 * it in, so `recordProgramSession` performs both inside its transaction: a fold
 * that fails cannot leave the session marked done on a run that did not advance.
 * What makes finishing happen **once** is that transaction's
 * `ProgramSessionApplication` insert, on a unique index — not the status flip,
 * which is shared state this file only states. A session with no running program
 * behind it has no fold to be idempotent about, and is claimed here with a single
 * conditional `UPDATE`.
 *
 * **Finishing twice is not an error and is not a second advance.** The
 * between-sets double-tap is the likeliest interaction on this surface — ADR
 * 0056 §2 made set logging an upsert for exactly that reason — and a double tap
 * on Finish would otherwise append the same session to every lift's weight and
 * stall history twice, advancing a program on evidence it already counted.
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
			/** True when this session was **already** finished and this call changed
			 * nothing. The outcomes are then the first finish's own, replayed word for
			 * word, so a double tap answers the same thing twice rather than raising an
			 * error at an athlete who tapped a button. */
			alreadyFinished: boolean
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
			workout: { select: { copiedFromId: true } },
			setLogs: {
				where: { role: 'working', outcome: 'completed' },
				select: { id: true },
			},
		},
	})
	if (!session) return { ok: false, reason: 'not-found' }
	if (session.setLogs.length === 0)
		return { ok: false, reason: 'nothing-logged' }

	// **The run this session belongs to, found through the copy.** Opening a program
	// session materialises the athlete's own copy of the day shape — that is where
	// the resolved load lives — so the day shape is `Workout.copiedFromId`. The
	// session's own `workoutId` is kept in the search for a session opened before
	// the load was materialised, which points at the shared shape directly.
	const dayShapeIds = [
		session.workoutId,
		session.workout?.copiedFromId ?? null,
	].filter((id): id is string => id != null)
	const instance = dayShapeIds.length
		? await prisma.programInstance.findFirst({
				where: {
					userId: input.userId,
					status: 'active',
					program: { days: { some: { workoutId: { in: dayShapeIds } } } },
				},
				orderBy: { startedOn: 'desc' },
				select: { id: true, program: { select: { name: true } } },
			})
		: null

	let outcomes: LiftOutcome[] = []
	let liftNames: Record<string, string> = {}
	let claimed: boolean | null = null
	if (instance) {
		const recorded = await recordProgramSession({
			userId: input.userId,
			instanceId: instance.id,
			sessionId: session.id,
			now,
		})
		// A run that cannot place this session's day is a reason to leave the
		// program alone, not a reason to refuse the athlete their finished session —
		// the claim below then stands in for the fold's.
		if (recorded.ok) {
			outcomes = recorded.outcomes
			liftNames = recorded.liftNames
			claimed = !recorded.alreadyRecorded
		}
	}

	// **The claim, where the fold did not make it.** One conditional `UPDATE`
	// rather than a read followed by a write: `count === 0` means somebody already
	// finished this session, which is an answer and not an error.
	if (claimed == null) {
		const marked = await prisma.workoutSession.updateMany({
			where: {
				id: session.id,
				userId: input.userId,
				status: { not: 'completed' },
			},
			data: { status: 'completed' },
		})
		claimed = marked.count > 0
	}

	return {
		ok: true,
		outcomes,
		liftNames,
		programName: instance?.program.name ?? null,
		loggedWorkingSets: session.setLogs.length,
		alreadyFinished: !claimed,
	}
}
