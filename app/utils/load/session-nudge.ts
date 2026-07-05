/**
 * The Session Nudge decision core (#157, PRD #156, feature #154).
 *
 * The Coach card already reconciles Form (TSB) and sustained Plan Adherence into
 * one honest daily call (`reconcileCoach`). This module takes that reconciled
 * call — plus a recent qualifying miss from the Session Ledger (#185, PRD #163)
 * — and decides what — if anything — should happen to the athlete's *next
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
 * miss signal is likewise structural (`selectQualifyingMiss` walks the ledger's
 * statuses and step zones, never any sentence). The reason sentence is composed
 * here by our own pure functions.
 */

import { formatSignedTsb, formatWeekday } from '#app/utils/format.ts'
import { expandWorkoutSteps } from '#app/utils/session-profile.ts'
import { type LedgerSession } from '#app/utils/training.server.ts'
import {
	deriveLedgerStatus,
	getSessionDiscipline,
} from '#app/utils/training.ts'
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

/**
 * How far back a missed session still moves the plan (PRD #163, assumption A2).
 * An older gap has already been absorbed — the plan simply continues.
 */
export const MISS_LOOKBACK_DAYS = 7

const CARDIO_DISCIPLINES = new Set(['run', 'bike', 'swim'])

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The single most-recent qualifying miss the nudge acts on — a structural
 * summary, like `NextPlannedSession`, so the decision never depends on the
 * presenter or the DB row shape.
 */
export type RecentMiss = {
	/** Discipline id of the missed session, e.g. `run` / `bike` / `swim`. */
	discipline: string
	/** How the reason names the miss, e.g. `Monday` in "You missed Monday's session". */
	label: string
}

/**
 * A missed prescription is "key" when it carried intensity above the
 * endurance/Z2 zone (PRD #163, assumption A3) — judged from the workout's real
 * steps via the same zone mapping the Workout Shape uses. A session whose
 * intensity can't be truthfully zoned (including strength, which has no cardio
 * zone model) is never "key": a skipped easy or recovery session never moves
 * the plan.
 */
function isKeySession(workout: LedgerSession['workout']): boolean {
	return expandWorkoutSteps(workout).some(
		({ zone }) => zone != null && zone > 2,
	)
}

/**
 * Walk the Session Ledger and select the single most-recent qualifying miss —
 * the pure upstream selection helper mirroring `sustainedAdherence` (#185,
 * PRD #163). A miss qualifies when it is:
 *
 *   - **derived-missed** — a planned session whose scheduled time passed with
 *     no Recording, or a stored `missed`/`skipped` (per `deriveLedgerStatus`);
 *   - **recent** — scheduled within the trailing `MISS_LOOKBACK_DAYS` window (A2);
 *   - **key** — intensity above the endurance/Z2 zone (A3, `isKeySession`).
 *
 * Multiple misses do not compound (A4): only the most recent qualifying one is
 * returned. Pure — `now` is injected, never read from the clock.
 */
export function selectQualifyingMiss(
	ledger: LedgerSession[],
	now: Date,
	timezone: string = 'UTC',
): RecentMiss | null {
	const windowStart = now.getTime() - MISS_LOOKBACK_DAYS * DAY_MS
	const mostRecent = ledger
		.filter((session) => {
			if (deriveLedgerStatus(session, now) !== 'missed') return false
			if (new Date(session.scheduledAt).getTime() < windowStart) return false
			return isKeySession(session.workout)
		})
		.sort(
			(a, b) =>
				new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
		)[0]
	if (!mostRecent) return null
	return {
		discipline: getSessionDiscipline(mostRecent),
		// Shared formatting layer (#172): weekday named in the Athlete Timezone.
		label: formatWeekday(new Date(mostRecent.scheduledAt), timezone),
	}
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
	return tsb != null
		? `Form is low (TSB ${formatSignedTsb(tsb)})`
		: 'Form is low'
}

/** The signal clause naming the miss, with the real session label. */
function missSignalClause(miss: RecentMiss): string {
	return `You missed ${miss.label}'s session`
}

/**
 * The held reason for a miss-driven ease that has been decided but not yet
 * persisted — consumed by Slice 3's honesty guard, composed here so the card
 * says exactly what the core decided, never a prose-parsed variant.
 */
export function missEasePendingReason(miss: RecentMiss): string {
	return `${missSignalClause(miss)} — easing your next session.`
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
	return tsb != null
		? `Form is ${word} (TSB ${formatSignedTsb(tsb)})`
		: `Form is ${word}`
}

/** The canonical eased target for a cardio next-session (ADR 0006/0019). */
function easedTarget(nextSession: NextPlannedSession): EasedTarget {
	return {
		discipline: nextSession.discipline,
		zone: 'Z2',
		intent: 'endurance',
		durationMin:
			nextSession.durationMin != null
				? Math.min(nextSession.durationMin, EASED_CAP_MIN)
				: null,
	}
}

/**
 * Decide the Session Nudge for the athlete's next planned session.
 *
 * Priority:
 *   1. No upcoming session → `none` (the card never talks about a session that
 *      doesn't exist).
 *   2. Back-off tone (`fatigued` Form, or sustained `over` — including during
 *      cold-start, since adherence is independent of TSB trust):
 *        - strength next → `held` (no zone model to ease into; honest reason);
 *        - cardio next   → `eased` (target + reason). Slice 2 applies it.
 *      A co-occurring miss is subsumed, never double-counted (PRD #163, A5).
 *   3. A recent qualifying miss (`selectQualifyingMiss`) → the same
 *      `eased`/`held` split with the miss-driven reason. Ledger-derived, not
 *      Form-derived, so it speaks before the cold-start gate — a recent key
 *      miss still eases during cold-start, mirroring how sustained `over` does.
 *   4. No reconciled recommendation → `unavailable`: cold-start, not enough
 *      trustworthy Form and no sustained deviation to speak; the honest
 *      "day N/42" reason, no change.
 *   5. Otherwise (fresh / neutral Form, or sustained `under`) → `held`: a nudge
 *      never reduces load when the problem is under-training.
 */
export function decideSessionNudge(input: {
	recommendation: CoachRecommendation | null
	trust: TsbTrust
	tsb: number | null
	sustained: SustainedDeviation | null
	/** The most recent qualifying miss (`selectQualifyingMiss`); null/omitted when none. */
	recentMiss?: RecentMiss | null
	nextSession: NextPlannedSession | null
}): SessionNudge {
	const { recommendation, trust, tsb, sustained, recentMiss, nextSession } =
		input

	if (!nextSession) return { outcome: 'none' }

	if (recommendation?.tone === 'fatigued' || recommendation?.tone === 'over') {
		if (!CARDIO_DISCIPLINES.has(nextSession.discipline)) {
			return {
				outcome: 'held',
				reason: `Next session is ${nextSession.discipline} — no Form-based ease yet.`,
			}
		}
		const signal = backOffSignalClause(recommendation, tsb, sustained)
		return {
			outcome: 'eased',
			target: easedTarget(nextSession),
			reason: `${signal} — eased ${nextSession.label}'s session to ${easedDurationPhrase(
				nextSession.durationMin,
			)}.`,
		}
	}

	if (recentMiss) {
		if (!CARDIO_DISCIPLINES.has(nextSession.discipline)) {
			return {
				outcome: 'held',
				reason: `${missSignalClause(recentMiss)} — next session is ${nextSession.discipline}, no Form-based ease yet.`,
			}
		}
		return {
			outcome: 'eased',
			target: easedTarget(nextSession),
			reason: `${missSignalClause(recentMiss)} — eased ${nextSession.label}'s session to ${easedDurationPhrase(
				nextSession.durationMin,
			)} so you don't stack hard days after a gap.`,
		}
	}

	if (!recommendation) {
		return {
			outcome: 'unavailable',
			reason: `Your Form reading is reliable after ${trust.requiredDays} days — day ${trust.daysOfHistory}/${trust.requiredDays}.`,
		}
	}

	// Hold tones: fresh / neutral Form, or sustained under.
	const signal = holdSignalClause(recommendation, tsb, sustained)
	return {
		outcome: 'held',
		reason: `${signal} — your next session stands.`,
	}
}
