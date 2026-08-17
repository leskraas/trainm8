/**
 * **Per-exercise history and the Set Ghost.**
 *
 * Two readings, one query shape: *"what have I done on this lift"* and *"what
 * did I do on it last time"*. Both are scoped to the progression key
 * `(exerciseId, equipment)` — barbell bench and dumbbell bench are separate
 * histories (ADR 0056's consequences), so a lighter dumbbell day never reads as
 * a regression.
 *
 * Pure: arrays in, decisions out. `now` is an argument, nothing is random,
 * nothing queries, nothing is mutated.
 *
 * **Everything here is text or a display value, and none of it is a prefill.**
 * ADR 0056 §5's fourth rule: the observed failure mode across several apps is
 * athletes logging the ghost by accident and never noticing, so the ghost is
 * text and the input stays empty. A {@link SetGhostReading} therefore carries no
 * load and no rep count a caller could hand to an input's `value` — filling the
 * row is the runner's *"Fill from last time"* control, working from the log
 * itself, and an explicit tap.
 */
import {
	type EquipmentId,
	type LoggedSet,
	type SetGhost,
	countsTowardWork,
	ghostsForRows,
	loadValueText,
} from '../strength-log.ts'

/** A logged set with the identity history needs: whose session, which lift,
 * when, and the kilos baked beside it at log time (null where none is honest). */
export type PerformedSet = LoggedSet & {
	sessionId: string
	exerciseId: string
	equipment: EquipmentId
	performedAt: Date
	effectiveKg: number | null
}

/** Which lift's history, as of when. */
export type ExerciseScope = {
	exerciseId: string
	/** Omit to read the exercise across every equipment variant. */
	equipment?: EquipmentId
	/** Sessions at or after this instant are not history. */
	now: Date
}

/**
 * One past session on this lift, as a surface shows it. Deliberately **not** the
 * sets themselves: this is the top-set curve and the "last time" line, and
 * handing back rows of loads and reps is how they end up in an input.
 */
export type ExerciseSessionSummary = {
	sessionId: string
	performedAt: Date
	/** Working sets that finished. Warm-ups and abandoned sets are not work. */
	workingSetCount: number
	/** The heaviest working set's baked kilos — the curve's y value. Null when
	 * nothing in the session had an honest kilo (a stack level, a band). */
	topSetKg: number | null
	/** The top set as text, which exists whether or not a kilo does. */
	topSetText: string
	/** False when this session cannot be compared against another exercise. */
	comparable: boolean
}

/**
 * A **Set Ghost** as the row renders it: one line of text, plus whether it is
 * borrowed from a shorter session. No load, no rep count, nothing typed as a
 * number — see the module note.
 */
export type SetGhostReading = {
	/** `100 kg × 5`, `level 7 × 12`, `bodyweight × 45 s`. */
	text: string
	/** True when this row is beyond where the previous session ended. */
	extrapolated: boolean
	/** The phrase that says the row is borrowed, or null. */
	note: string | null
}

const BEYOND_NOTE = 'beyond last time'
const DAY_MS = 24 * 60 * 60 * 1000

// ——— The history ————————————————————————————————————————————————————————

function inScope(set: PerformedSet, scope: ExerciseScope): boolean {
	return (
		set.exerciseId === scope.exerciseId &&
		(scope.equipment == null || set.equipment === scope.equipment) &&
		set.performedAt.getTime() <= scope.now.getTime() &&
		countsTowardWork(set)
	)
}

/**
 * Every past session containing this lift, **newest first**, one entry each.
 *
 * The qualification gate is the shared one (`countsTowardWork`): a warm-up is
 * not a session's top set and an abandoned set is dropped from every aggregate,
 * so a session whose only heavy set was racked does not spike the curve.
 *
 * A session with no honest kilo is **present in its own curve and flagged
 * uncomparable** — level 6 → 7 is real, and refusing to plot it would be as
 * dishonest as inventing kilos for it.
 */
export function exerciseHistory(
	sets: PerformedSet[],
	scope: ExerciseScope,
): ExerciseSessionSummary[] {
	const bySession = new Map<string, PerformedSet[]>()
	for (const set of sets) {
		if (!inScope(set, scope)) continue
		const bucket = bySession.get(set.sessionId) ?? []
		bucket.push(set)
		bySession.set(set.sessionId, bucket)
	}

	return [...bySession.values()]
		.map(summarize)
		.sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())
}

function summarize(sets: PerformedSet[]): ExerciseSessionSummary {
	const ordered = [...sets].sort((a, b) => a.orderIndex - b.orderIndex)
	const top = topSet(ordered)
	return {
		sessionId: top.sessionId,
		performedAt: top.performedAt,
		workingSetCount: ordered.length,
		topSetKg: top.effectiveKg,
		topSetText: setText(top),
		comparable: top.effectiveKg != null,
	}
}

/**
 * The session's top set: the heaviest honest kilo where there is one, and
 * otherwise the highest stack level — because that is the only other ordering a
 * load carries. With neither, the last set stands for the session rather than a
 * fabricated ranking.
 */
function topSet(ordered: PerformedSet[]): PerformedSet {
	const withKilos = ordered.filter((s) => s.effectiveKg != null)
	if (withKilos.length > 0) {
		return withKilos.reduce((best, s) =>
			s.effectiveKg! > best.effectiveKg! ? s : best,
		)
	}
	const levels = ordered.filter((s) => s.load.kind === 'stackLevel')
	if (levels.length > 0) {
		return levels.reduce((best, s) =>
			s.load.kind === 'stackLevel' &&
			best.load.kind === 'stackLevel' &&
			s.load.level > best.load.level
				? s
				: best,
		)
	}
	return ordered[ordered.length - 1]!
}

/**
 * The last session containing **this exercise** — ADR 0056 §5's first rule.
 * Not the last calendar session: a push/pull/legs split would then show the
 * wrong lift's ghost two days in three.
 */
export function lastTimeYouDidThis(
	sets: PerformedSet[],
	scope: ExerciseScope & { excludeSessionId?: string },
): ExerciseSessionSummary | null {
	const history = exerciseHistory(
		scope.excludeSessionId == null
			? sets
			: sets.filter((s) => s.sessionId !== scope.excludeSessionId),
		scope,
	)
	return history[0] ?? null
}

/**
 * When the athlete last did this lift, in plain time. `now` is an argument, so
 * the phrase is deterministic and the module still owns no clock.
 */
export function lastTimeLabel(
	last: ExerciseSessionSummary | null,
	now: Date,
): string {
	if (!last) return 'First time on this lift'
	const days = Math.max(
		0,
		Math.floor((now.getTime() - last.performedAt.getTime()) / DAY_MS),
	)
	if (days === 0) return 'Last time: today'
	if (days === 1) return 'Last time: yesterday'
	if (days < 14) return `Last time: ${days} days ago`
	const weeks = Math.floor(days / 7)
	return `Last time: ${weeks} weeks ago`
}

// ——— The ghost ——————————————————————————————————————————————————————————

/**
 * The Set Ghost for each row of the exercise being logged, following ADR 0056
 * §5's four rules:
 *
 * 1. sourced from the **last session containing this exercise**, never the last
 *    calendar session;
 * 2. **matched positionally** — set 3's ghost is last time's set 3, never the
 *    nearest weight, which is what makes a ramp (60/80/100) show the right ghost
 *    per row;
 * 3. an **extra row borrows the last ghost, flagged** `extrapolated`, because an
 *    empty ghost on set 5 of 5 reads as "new territory" when it only means "you
 *    did four last time";
 * 4. warm-ups and abandoned sets are **dropped from the previous session before
 *    matching**, so adding a warm-up does not shift every working row by one.
 *
 * Pass the session currently being logged as `excludeSessionId` so a row cannot
 * become its own ghost.
 *
 * Returns one entry per row, `null` where there is no history to show.
 */
export function setGhostReadings(
	sets: PerformedSet[],
	scope: ExerciseScope & { rowCount: number; excludeSessionId?: string },
): Array<SetGhostReading | null> {
	const last = lastTimeYouDidThis(sets, scope)
	if (!last) return Array.from({ length: scope.rowCount }, () => null)

	// Rules 2–4 are already one function on the shipped pure module; reusing it
	// keeps positional matching in one place rather than restating it here.
	const previous: PerformedSet[] = sets
		.filter((s) => s.sessionId === last.sessionId && inScope(s, scope))
		.sort((a, b) => a.orderIndex - b.orderIndex)

	return ghostsForRows(previous, scope.rowCount).map((ghost, index) => {
		if (!ghost) return null
		// `previous` has already passed `countsTowardWork`, so it is exactly the
		// list `ghostsForRows` matched against — the same position therefore
		// names the same set, and the extra rep count of a unilateral set can be
		// read off it rather than lost on the way to the row.
		const matched = previous[Math.min(index, previous.length - 1)]
		return {
			text: setText({ ...ghost, repsLeft: matched?.repsLeft ?? null }),
			extrapolated: ghost.extrapolated,
			note: ghost.extrapolated ? BEYOND_NOTE : null,
		}
	})
}

/**
 * One set as a line of text: what was on the bar, then what was done with it.
 *
 * A unilateral set keeps **both** rep counts — 10 left and 8 right is one set
 * with two numbers, and collapsing it to "9" invents a rep nobody did. A held
 * or timed set reads in seconds rather than borrowing a rep count it has not
 * got.
 */
function setText(set: {
	load: SetGhost['load']
	reps: number | null
	repsLeft?: number | null
	durationSec: number | null
}): string {
	const load = loadValueText(set.load)
	if (set.reps != null) {
		const reps =
			set.repsLeft != null ? `${set.reps} / ${set.repsLeft}` : `${set.reps}`
		return `${load} × ${reps}`
	}
	if (set.durationSec != null) return `${load} × ${set.durationSec} s`
	return load
}
