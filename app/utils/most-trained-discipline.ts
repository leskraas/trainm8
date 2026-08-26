/**
 * The athlete's **most-trained discipline** — read from their own history, and
 * `null` where there is no history to read it from (ADR 0065 §5).
 *
 * The prefilled Discipline on a stamped cell is what the stamp is stamped
 * *for*, so it has to be derived rather than defaulted: a default that is a
 * guess dressed as a derivation is the failure mode this repo keeps naming, and
 * an athlete with nothing on record is **asked** instead. That is the same rule
 * `defaultTrackDiscipline` already holds for a Training Track (ADR 0043), said
 * once more for a surface that had no Event to lead it.
 *
 * Pure, so both callers derive it identically — the timeline's prefill chip and
 * the authoring route's own default — from the one reader beside this file.
 */
import { type Discipline } from './workout-schema.ts'

/**
 * How far back "what you train" reaches: half a year, the same span the home
 * timeline itself is willing to look over. Long enough that a fortnight off
 * does not erase an athlete's discipline, short enough that a sport they left
 * behind last season does not keep prefilling cells they will retype.
 */
export const MOST_TRAINED_WINDOW_DAYS = 182

/** One session that actually happened, reduced to the two facts this reads. */
export type TrainedSession = {
	discipline: Discipline
	/** When it was trained — the tiebreak, so a dead heat is not arbitrary. */
	at: Date
}

/**
 * The Discipline the athlete trained most over the window, or `null` when they
 * trained none at all.
 *
 * Counted in **sessions** rather than in load or hours, because the question the
 * chip answers is "what do you usually put on a day", and a day is a session.
 * A dead heat goes to the one trained **most recently** — the tiebreak is a
 * fact about the athlete rather than about the order rows came back in.
 */
export function mostTrainedDiscipline(
	history: TrainedSession[],
): Discipline | null {
	const counts = new Map<Discipline, { sessions: number; last: number }>()
	for (const entry of history) {
		const at = entry.at.getTime()
		const bucket = counts.get(entry.discipline)
		if (bucket) {
			bucket.sessions += 1
			bucket.last = Math.max(bucket.last, at)
		} else {
			counts.set(entry.discipline, { sessions: 1, last: at })
		}
	}

	let best: { discipline: Discipline; sessions: number; last: number } | null =
		null
	for (const [discipline, bucket] of counts) {
		if (
			best == null ||
			bucket.sessions > best.sessions ||
			(bucket.sessions === best.sessions && bucket.last > best.last)
		) {
			best = { discipline, sessions: bucket.sessions, last: bucket.last }
		}
	}
	return best?.discipline ?? null
}
