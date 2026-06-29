// Personal Records: derived best-effort benchmarks that give the Cockpit its
// Proof zone — evidence that training is working (#134). A Personal Record is
// *derived, never authored*: it is always the product of `detectPersonalRecords`
// over the athlete's qualifying efforts, so there is no way to fake one.
//
// v1 derives records from whole-activity telemetry only — per-sample streams
// aren't ingested yet (CONTEXT.md "Recording"), so split- or power-curve PRs
// aren't truthfully computable. The single honest, comparable benchmark from a
// whole-activity summary is the farthest distance covered in one effort. The
// `BenchmarkKind` union leaves room for pace/power/duration benchmarks later.

import { DISCIPLINES, type Discipline } from './workout-schema.ts'

/** The kind of best-effort a Personal Record measures (see module note). */
export type BenchmarkKind = 'farthest'

/**
 * Load Confidence reused as the Personal Record trust gate (ADR 0008): records
 * only come from trustworthy data. `high`/`medium` qualify; `low` (the `sRPE`
 * hand-logged fallback) and a missing confidence are gated out — the same
 * "no records from low-confidence data" rule load applies.
 */
export type EffortConfidence = 'high' | 'medium' | 'low' | null

/**
 * One completed effort considered for detection: a completed Workout Session
 * backed by a Recording (a promoted Activity Import). Carries just what
 * detection needs — the discipline, the achieved distance, when it happened, the
 * achieving session id, and the Load Confidence used as the trust gate.
 */
export type PrEffort = {
	/** The achieving Workout Session. */
	sessionId: string
	discipline: string
	/** Distance covered in metres; null when the effort recorded no distance. */
	distanceM: number | null
	achievedAt: Date
	confidence: EffortConfidence
}

/** A derived best-effort benchmark for one discipline. Never authored. */
export type PersonalRecord = {
	discipline: Discipline
	kind: BenchmarkKind
	/** The record value in the benchmark's base unit (metres for `farthest`). */
	value: number
	/** The Workout Session that set the record. */
	sessionId: string
	achievedAt: Date
	/**
	 * The best the record beat — the athlete's farthest qualifying effort from
	 * *before* this one was set. Null when the record-setting effort is also the
	 * earliest qualifying effort in the discipline (nothing came before it).
	 */
	previousValue: number | null
	/** `value − previousValue`; null when there is no previous best. */
	delta: number | null
}

const QUALIFYING_CONFIDENCE = new Set<EffortConfidence>(['high', 'medium'])

function isDiscipline(value: string): value is Discipline {
	return (DISCIPLINES as readonly string[]).includes(value)
}

function qualifies(effort: PrEffort): boolean {
	return (
		QUALIFYING_CONFIDENCE.has(effort.confidence) &&
		effort.distanceM != null &&
		effort.distanceM > 0 &&
		isDiscipline(effort.discipline)
	)
}

/**
 * Derive the athlete's current Personal Records from their efforts — one record
 * per discipline that has at least one qualifying effort. Pure and deterministic:
 *
 * - **Trust gating** drops untrustworthy efforts up front (`qualifies`), so a
 *   longer-but-untrusted effort can neither hold a record nor count as the
 *   previous best.
 * - **Per-discipline scoping**: efforts only compete within their discipline.
 * - The record is the **farthest** qualifying effort; ties go to the earliest
 *   (the first to reach the distance holds it).
 * - **Previous best** is the farthest effort from *before* the record was set —
 *   the best the athlete had when they broke it. The delta is how far the record
 *   beat it by. When the record is also the earliest effort, both are null — so
 *   a debut effort reads as a debut, never a fabricated gain over a *later*,
 *   shorter outing.
 *
 * Records come back in canonical discipline order for a stable strip.
 */
export function detectPersonalRecords(efforts: PrEffort[]): PersonalRecord[] {
	const byDiscipline = new Map<Discipline, PrEffort[]>()
	for (const effort of efforts) {
		if (!qualifies(effort)) continue
		const discipline = effort.discipline as Discipline
		const bucket = byDiscipline.get(discipline) ?? []
		bucket.push(effort)
		byDiscipline.set(discipline, bucket)
	}

	const records: PersonalRecord[] = []
	for (const [discipline, group] of byDiscipline) {
		// Farthest first; earliest wins a tie so the original record-setter holds it.
		const ranked = [...group].sort((a, b) =>
			b.distanceM! !== a.distanceM!
				? b.distanceM! - a.distanceM!
				: a.achievedAt.getTime() - b.achievedAt.getTime(),
		)
		const best = ranked[0]!
		// The previous best is the farthest effort that predates the record. Earlier
		// efforts are all strictly shorter (a tie would have held the record by the
		// earliest-wins rule), so the delta is always a real gain, never zero.
		const previousValue = group.reduce<number | null>(
			(farthest, e) =>
				e.achievedAt.getTime() < best.achievedAt.getTime()
					? Math.max(farthest ?? 0, e.distanceM!)
					: farthest,
			null,
		)
		records.push({
			discipline,
			kind: 'farthest',
			value: best.distanceM!,
			sessionId: best.sessionId,
			achievedAt: best.achievedAt,
			previousValue,
			delta: previousValue != null ? best.distanceM! - previousValue : null,
		})
	}

	return records.sort(
		(a, b) =>
			DISCIPLINES.indexOf(a.discipline) - DISCIPLINES.indexOf(b.discipline),
	)
}
