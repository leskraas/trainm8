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
import { type KiloLoadBasis, kiloLoadBasis } from './program-rules.ts'

/**
 * A logged set with the identity history needs: whose session, which lift, when,
 * and the kilos baked beside it at log time (null where none is honest).
 *
 * **`effectiveKg` is a number, not a claim about a bar.** What kind of kilo it is
 * lives in `load.kind` — a dip belt bakes the athlete into it, a per-hand load is
 * halved, an assist is inverted (ADR 0056 §3) — so every reading here asks
 * {@link kiloLoadBasis} before it orders two of them.
 */
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
 * **Which kind of kilo a session's headline is a kilo of**, or that it is not a
 * kilo at all.
 *
 * The three kilo piles are the program rules' own ({@link kiloLoadBasis}) — the
 * same partition the records strip reads, because a top set and a heaviest-ever
 * are the same question asked over one session and over all of them. Two members
 * on top of them:
 *
 * - **`stackLevel`** — the session's reading is an ordinal, in levels. Level 6 → 7
 *   is real progress and belongs on its own curve.
 * - **`unreadable`** — the session has no orderable load at all: an assisted set,
 *   whose number grows as the work shrinks, a band, or an unloaded hold. **The
 *   session still happened**, and its headline is its last working set as text —
 *   see {@link headlineSet}.
 */
export type SessionLoadBasis = KiloLoadBasis | 'stackLevel' | 'unreadable'

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
	/**
	 * The heaviest working set's baked kilos **within {@link loadBasis}** — the
	 * curve's y value, and comparable to another session's only where the two bases
	 * agree. Null where the session's reading is not a kilo (a stack level, a band,
	 * an assist).
	 *
	 * It is **not** the largest number in the session. A dip-belt set bakes the
	 * athlete plus the belt — 104 kg on a lift whose heaviest bar is 30 kg — and
	 * picking the maximum across kinds made that set the session's headline and the
	 * curve's peak. The basis is chosen first; the maximum is taken inside it.
	 */
	topSetKg: number | null
	/** The top set as text, which exists whether or not a kilo does. */
	topSetText: string
	/** **Which kind of number the headline is**, so a caller can group before it
	 * orders. The partition `comparable` used to be a boolean about. */
	loadBasis: SessionLoadBasis
	/** False when this session cannot be compared against another exercise — which
	 * is every basis but the bar. Derived from {@link loadBasis} and nothing else,
	 * so a session cannot be flagged comparable and be a bodyweight kilo. */
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

// ——— The cutoff —————————————————————————————————————————————————————————

/**
 * **Has this work happened yet?** The one time cutoff every per-exercise
 * reading is taken through — the history strip, the Set Ghost *and* the records
 * strip and the runner's PR banner, which read it through
 * {@link deriveStrengthRecords}.
 *
 * A set's `performedAt` is **its session's own day** (`strength-records.server`
 * bakes `session.scheduledAt` into it), so a session the athlete has already
 * logged into but whose day is still ahead of `now` has *not happened* as far as
 * every reading is concerned. That is the rule, and it is one rule rather than
 * two on purpose: `deriveStrengthRecords` had no cutoff at all, so one loader
 * payload announced *"Heaviest bodyweight set: 109 kg — first time!"* off a set
 * logged into a session dated 23:30 tonight while the same payload's
 * `sessions: []` made the page say *"First time on this lift"*. A record read
 * from work the history cannot see is a page arguing with itself.
 *
 * Chosen over the alternative — counting a future-dated session and teaching the
 * history to show it — because this one needs no new concept, no timezone and no
 * notion of "later today": `performedAt <= now` is already what history means by
 * *past*, and a reading that waits until its session's own instant is trivially
 * defensible. The record is not lost, only not yet: the same set announces
 * itself the moment its session's day arrives.
 *
 * Exported so nothing has to restate the comparison. A second copy of `<=` is a
 * second copy that can drift.
 */
export function hasHappenedBy(performedAt: Date, now: Date): boolean {
	return performedAt.getTime() <= now.getTime()
}

// ——— The history ————————————————————————————————————————————————————————

function inScope(set: PerformedSet, scope: ExerciseScope): boolean {
	return (
		set.exerciseId === scope.exerciseId &&
		(scope.equipment == null || set.equipment === scope.equipment) &&
		hasHappenedBy(set.performedAt, scope.now) &&
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
 *
 * Every entry states the {@link SessionLoadBasis} its number belongs to, and the
 * numbers of two different bases are **never ordered against each other**. A
 * caller that ranks sessions — a curve, a best-session line — groups by
 * `loadBasis` first; `comparable` is that partition's yes/no for the bar and
 * nothing more.
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
	const headline = headlineSet(ordered)
	return {
		sessionId: headline.set.sessionId,
		performedAt: headline.set.performedAt,
		workingSetCount: ordered.length,
		// A kilo only where the basis is a kilo one. A stack level's ordinal and an
		// assist's inverted number are readings, and neither is a y value on a
		// kilo axis.
		topSetKg: isKiloBasis(headline.basis) ? headline.set.effectiveKg : null,
		topSetText: setText(headline.set),
		loadBasis: headline.basis,
		// Only the bar is comparable outside itself — `records.ts` says the same
		// sentence about the same partition, because it is the same partition.
		comparable: headline.basis === 'bar',
	}
}

/**
 * The bases in the order a reading prefers them. The **bar leads**: it is what an
 * athlete means by "my bench", and the same order the records strip reports in.
 */
const KILO_BASIS_PREFERENCE: KiloLoadBasis[] = [
	'bar',
	'perHand',
	'bodyweightDerived',
]

function isKiloBasis(basis: SessionLoadBasis): basis is KiloLoadBasis {
	return (KILO_BASIS_PREFERENCE as SessionLoadBasis[]).includes(basis)
}

/**
 * **The set that stands for the session, and which pile its number is in.**
 *
 * The basis is chosen **before** the maximum, and that is the whole of the fix
 * here. This function used to take the heaviest `effectiveKg` in the session
 * across every load kind, and `effectiveKg` alone is not a claim about the bar:
 * `{ kind: 'bodyweightPlus', addedKg: 30 }` bakes the athlete's 74 kg into 104 kg
 * (ADR 0056 §3), so a dip-belt set became the headline of a session whose bar
 * topped out at 30 kg, was flagged `comparable`, and then peaked the curve. One
 * classification decides it — {@link kiloLoadBasis}, the program engine's and the
 * records strip's — and the maximum is taken *inside* the pile.
 *
 * Then, in order:
 *
 * 1. the heaviest **bar** set, else the heaviest **per-hand** set, else the
 *    heaviest **bodyweight-derived** one;
 * 2. the highest **stack level**, because an ordinal is the only other ordering a
 *    load carries;
 * 3. otherwise the **last working set**, standing for the session as text.
 *
 * Case 3 is a statement, not a fallback into silence: **a session whose sets are
 * all unorderable still happened.** An assisted pull-up session has no maximum —
 * its number gets bigger as the machine does more of the work, which is why
 * `records.ts` refuses it a record — but it is a session of work, it keeps its
 * place in the history, and dropping it would make the ghost read "new territory"
 * on a lift the athlete trains every week.
 */
function headlineSet(ordered: PerformedSet[]): {
	set: PerformedSet
	basis: SessionLoadBasis
} {
	for (const basis of KILO_BASIS_PREFERENCE) {
		const ofBasis = ordered.filter(
			(set) =>
				kiloLoadBasis(set.load.kind) === basis && set.effectiveKg != null,
		)
		const heaviest = ofBasis.reduce<PerformedSet | null>(
			(best, set) =>
				best == null || set.effectiveKg! > best.effectiveKg! ? set : best,
			null,
		)
		if (heaviest) return { set: heaviest, basis }
	}

	const levels = ordered.filter((set) => set.load.kind === 'stackLevel')
	if (levels.length > 0) {
		return {
			set: levels.reduce((best, set) =>
				set.load.kind === 'stackLevel' &&
				best.load.kind === 'stackLevel' &&
				set.load.level > best.load.level
					? set
					: best,
			),
			basis: 'stackLevel',
		}
	}

	return { set: ordered[ordered.length - 1]!, basis: 'unreadable' }
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
