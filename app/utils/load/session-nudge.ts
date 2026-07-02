/**
 * The Session Nudge decision core (#157, PRD #156, feature #154).
 *
 * The Coach card already reconciles Form (TSB) and sustained Plan Adherence into
 * one honest daily call (`reconcileCoach`). This module takes that reconciled
 * call and decides what — if anything — should happen to the athlete's *next
 * planned session*: ease it to an easy endurance session, hold it as planned,
 * say it can't be judged yet (cold-start), or say nothing (no upcoming session).
 *
 * Pure and page-agnostic, mirroring `reconcileCoach` / `readinessFromTsb`. The
 * server applier (Slice 2) and the home display both call this one function, so
 * what is applied and what is said can never disagree.
 *
 * **Tone-driven, never prose-parsed.** The decision reads the reconciled
 * recommendation's `tone` enum + `source` (plus the underlying TSB and
 * sustained-weeks numbers), never the recommendation's free-text sentence. The
 * reason sentence is composed here by our own pure function.
 */

import { type CoachRecommendation, type SustainedDeviation } from './coach.ts'
import { type TsbTrust } from './trustworthiness.ts'

/**
 * The single next planned session the nudge acts on — the same one the home
 * surface's Today card selects (earliest upcoming ledger entry still planned).
 * A structural summary so this pure module never depends on the presenter or
 * the DB row shape.
 */
export type NextPlannedSession = {
	/** Discipline id, e.g. `run` / `bike` / `swim` / `strength`. */
	discipline: string
	/** How the reason names the session, e.g. `Tuesday` in "eased Tuesday's session". */
	label: string
	/** Planned duration in minutes; drives the eased 60-minute cap. `null` when unknown. */
	durationMin: number | null
}

/**
 * The canonical eased target for a cardio session: one endurance-intent block in
 * the same Discipline, at the athlete's endurance (Z2) zone, capped at an hour.
 * Slice 1 only *describes* the target for the reason line and Slice 2's applier;
 * nothing is persisted here. Absolute and idempotent by design (ADR 0006/0019).
 */
export type EasedTarget = {
	discipline: string
	/** The endurance zone label the eased session targets (resolved to the athlete's ranges in Slice 2). */
	zone: 'Z2'
	intent: 'endurance'
	/** min(original planned duration, 60). `null` when the source duration is unknown. */
	durationMin: number | null
}

/**
 * The nudge decision — a discriminated union of four outcomes:
 *
 * - `eased`: a back-off signal on a cardio next-session; carries the eased target
 *   and the reason. (Slice 1 does NOT apply it; the card still shows today's
 *   recommendation line — see the loader/display slice.)
 * - `held`: the next session stands as planned (fresh/neutral/under, or a
 *   strength session that can't take a zone-based ease yet); carries the reason.
 * - `unavailable`: not enough trustworthy Form to justify a change (cold-start);
 *   carries the existing "day N/42" reason. No change.
 * - `none`: there is no upcoming planned session, so the card says nothing.
 */
export type SessionNudge =
	| { outcome: 'eased'; target: EasedTarget; reason: string }
	| { outcome: 'held'; reason: string }
	| { outcome: 'unavailable'; reason: string }
	| { outcome: 'none' }

/** The eased cardio session is capped at an hour (flat across disciplines in v1). */
export const EASED_CAP_MIN = 60

const CARDIO_DISCIPLINES = new Set(['run', 'bike', 'swim'])

/** A signed TSB for the reason sentence, matching the Coach card's `+6` / `-18`. */
function signedTsb(tsb: number): string {
	const r = Math.round(tsb)
	// Use a real minus sign (−) to match the PRD examples, plus for positives.
	return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : '+0'
}

/**
 * Compose the eased-cap duration label for the reason sentence. The canonical
 * eased session is capped at an hour, so a session at/over the cap reads as
 * "an hour"; a shorter session keeps its own (unchanged) duration in minutes.
 */
function easedDurationPhrase(durationMin: number | null): string {
	if (durationMin == null) return 'a Z2 endurance session'
	const capped = Math.min(durationMin, EASED_CAP_MIN)
	return capped >= EASED_CAP_MIN
		? 'a Z2 endurance hour'
		: `a ${capped}-minute Z2 endurance session`
}

/** The signal clause naming why we backed off, with real numbers. */
function backOffSignalClause(
	recommendation: CoachRecommendation,
	tsb: number | null,
	sustained: SustainedDeviation | null,
): string {
	if (recommendation.source === 'adherence' && sustained) {
		return `Over your plan ${sustained.weeks} weeks`
	}
	// Form-derived fatigue (the acute "rest today" reading).
	return tsb != null ? `Form is low (TSB ${signedTsb(tsb)})` : 'Form is low'
}

/** The signal clause for a held session, with real numbers. */
function holdSignalClause(
	recommendation: CoachRecommendation,
	tsb: number | null,
	sustained: SustainedDeviation | null,
): string {
	if (recommendation.source === 'adherence' && sustained) {
		return `Under your plan ${sustained.weeks} weeks`
	}
	// Form-derived fresh / neutral.
	const word = recommendation.tone === 'fresh' ? 'fresh' : 'neutral'
	return tsb != null ? `Form is ${word} (TSB ${signedTsb(tsb)})` : `Form is ${word}`
}

/**
 * Decide the Session Nudge for the athlete's next planned session.
 *
 * Priority:
 *   1. No upcoming session → `none` (the card never talks about a session that
 *      doesn't exist).
 *   2. No reconciled recommendation → `unavailable`: cold-start, not enough
 *      trustworthy Form and no sustained deviation to speak; the honest
 *      "day N/42" reason, no change.
 *   3. Back-off tone (`fatigued` Form, or sustained `over` — including during
 *      cold-start, since adherence is independent of TSB trust):
 *        - strength next → `held` (no zone model to ease into; honest reason);
 *        - cardio next   → `eased` (target + reason). Slice 2 applies it.
 *   4. Otherwise (fresh / neutral Form, or sustained `under`) → `held`: a nudge
 *      never reduces load when the problem is under-training.
 */
export function decideSessionNudge(input: {
	recommendation: CoachRecommendation | null
	trust: TsbTrust
	tsb: number | null
	sustained: SustainedDeviation | null
	nextSession: NextPlannedSession | null
}): SessionNudge {
	const { recommendation, trust, tsb, sustained, nextSession } = input

	if (!nextSession) return { outcome: 'none' }

	if (!recommendation) {
		return {
			outcome: 'unavailable',
			reason: `Your Form reading is reliable after ${trust.requiredDays} days — day ${trust.daysOfHistory}/${trust.requiredDays}.`,
		}
	}

	const isBackOff =
		recommendation.tone === 'fatigued' || recommendation.tone === 'over'

	if (isBackOff) {
		if (!CARDIO_DISCIPLINES.has(nextSession.discipline)) {
			return {
				outcome: 'held',
				reason: `Next session is ${nextSession.discipline} — no Form-based ease yet.`,
			}
		}
		const durationMin =
			nextSession.durationMin != null
				? Math.min(nextSession.durationMin, EASED_CAP_MIN)
				: null
		const signal = backOffSignalClause(recommendation, tsb, sustained)
		return {
			outcome: 'eased',
			target: {
				discipline: nextSession.discipline,
				zone: 'Z2',
				intent: 'endurance',
				durationMin,
			},
			reason: `${signal} — eased ${nextSession.label}'s session to ${easedDurationPhrase(
				nextSession.durationMin,
			)}.`,
		}
	}

	// Hold tones: fresh / neutral Form, or sustained under.
	const signal = holdSignalClause(recommendation, tsb, sustained)
	return {
		outcome: 'held',
		reason: `${signal} — your next session stands.`,
	}
}
