/**
 * The one reader behind {@link mostTrainedDiscipline} — so the timeline's
 * prefilled chip and the authoring route's own default can never disagree about
 * what the athlete trains most (ADR 0065 §5).
 *
 * Only sessions that actually **happened** count: a plan full of Tuesday swims
 * the athlete never swam is a statement about the plan, not about them. A
 * completed session names its discipline through its **Recording** where one
 * exists — that is what was done — and through its Workout otherwise, which is
 * the same precedence `readAnchorContext` reads volume with.
 */
import { prisma } from './db.server.ts'
import {
	MOST_TRAINED_WINDOW_DAYS,
	mostTrainedDiscipline,
	type TrainedSession,
} from './most-trained-discipline.ts'
import { DISCIPLINES, type Discipline } from './workout-schema.ts'

const DAY_MS = 24 * 60 * 60 * 1000

function asDiscipline(value: string | null | undefined): Discipline | null {
	return DISCIPLINES.includes(value as Discipline)
		? (value as Discipline)
		: null
}

/**
 * The athlete's most-trained Discipline over the trailing window, or `null` when
 * they have trained nothing in it — in which case the caller **asks**, and never
 * picks one for them.
 */
export async function readMostTrainedDiscipline(
	userId: string,
	now: Date = new Date(),
): Promise<Discipline | null> {
	const from = new Date(now.getTime() - MOST_TRAINED_WINDOW_DAYS * DAY_MS)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			status: 'completed',
			scheduledAt: { gte: from, lte: now },
		},
		select: {
			scheduledAt: true,
			recording: { select: { discipline: true } },
			workout: { select: { discipline: true } },
		},
	})

	const history: TrainedSession[] = []
	for (const session of sessions) {
		const discipline =
			asDiscipline(session.recording?.discipline) ??
			asDiscipline(session.workout?.discipline)
		if (!discipline) continue
		history.push({ discipline, at: session.scheduledAt })
	}
	return mostTrainedDiscipline(history)
}
