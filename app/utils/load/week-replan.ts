/**
 * The Week Replan decision core (#195, PRD #194, ADR 0025).
 *
 * When a Training Week closes having run clearly over plan while the athlete's
 * Form (TSB) confirms the overload, the *following* week's quantified cardio
 * volume softens by one documented rule — and in every other case the app
 * explicitly declines with a plain-language reason, never inventing a tweak.
 * This module is that decision: given the closed week's Weekly Plan Adherence
 * (ADR 0019 semantics unchanged), the current TSB plus its trust gate, and a
 * structural summary of the target week's adjustable sessions, return what — if
 * anything — should change and exactly what to say about it.
 *
 * Pure and page-agnostic, mirroring `decideSessionNudge`. The server applier
 * and every display surface (Week tab, Session Ledger, Workout Detail View)
 * read this one decision shape, so what is applied and what is said can never
 * disagree — the final Replan copy is composed here (PRD open question O2).
 *
 * **Tone-driven, never prose-parsed.** The decision reads the adherence band's
 * `tone` enum (plus the underlying ratio and TSB numbers), never any free-text
 * sentence. Reasons and Replan Notes are composed here by our own pure
 * functions. Nothing reads the clock or the DB: the caller pre-filters the
 * adjustable summary (future, still-`scheduled`, quantified cardio), so no
 * time input is needed at all.
 */

import { type WeeklyAdherence } from './adherence.ts'
import { type TsbTrust } from './trustworthiness.ts'

/**
 * Adjust only when TSB is at or below this gate: the overshoot happened *and*
 * the body is measurably under load. Any negative Form corroborates the
 * overload (the stricter fatigued threshold would under-fire). Tune here,
 * like the adherence cut points.
 */
export const REPLAN_TSB_GATE = 0

/**
 * The scale floor: the next week is never cut by more than 30%, however large
 * the overshoot — one bad week can't gut the plan. Tune here.
 */
export const REPLAN_MIN_SCALE = 0.7

/** Scaled durations round to the nearest minute — display-friendly, load-insignificant. */
export const REPLAN_DURATION_ROUND_SEC = 60

/** Scaled distances round to the nearest 100 m — display-friendly, load-insignificant. */
export const REPLAN_DISTANCE_ROUND_M = 100

/**
 * One adjustable session in the target week — a structural summary, like the
 * nudge's `NextPlannedSession`, so this pure module never depends on the
 * presenter or the DB row shape. The *caller* owns the adjustability gate
 * (ADR 0025 §3): only future, still-`scheduled` sessions carrying quantified
 * cardio steps belong here. Strength sessions and unquantified steps are
 * structurally excluded — no load model to scale, so they never receive a
 * scale or a Replan Note.
 */
export type AdjustableSession = {
	/** WorkoutSession id, so the applier attaches each note to the right row. */
	id: string
}

/** The Replan Note destined for one adjusted session's `replanReason`. */
export type ReplanNote = {
	sessionId: string
	/** Plain-language note, e.g. "Last week ran 32% over plan and Form was −12 — softened this session ~24%." */
	note: string
}

/**
 * The Week Replan decision — a discriminated union of three outcomes (the
 * same trio the persisted `WeekReplan` row stores):
 *
 * - `adjusted`: the one documented rule fired; carries the applied scale and a
 *   Replan Note for every adjustable session. The applier rescales steps by
 *   `scaleStepQuantities` and attaches the notes; nothing is persisted here.
 * - `no-change`: the app looked and chose to hold — on-target, under ("bank
 *   the planned work"), over-but-fresh, or nothing adjustable to soften.
 * - `insufficient-data`: the data can't justify a judgment — no measurable
 *   adherence for the closed week, or a TSB that is missing/untrustworthy.
 *
 * Every outcome carries a plain-language reason so the declined states are as
 * durable and demoable as the adjustment itself.
 */
export type WeekReplanDecision =
	| { outcome: 'adjusted'; scale: number; notes: ReplanNote[]; reason: string }
	| { outcome: 'no-change'; reason: string }
	| { outcome: 'insufficient-data'; reason: string }

/**
 * The one documented scale (ADR 0025 §2): the inverse of the overshoot,
 * floored — bring next week back to roughly the load the plan intended,
 * never cut more than 30%. Downward only by construction: the caller only
 * invokes it for an `over` week (ratio > 1), so the scale is always < 1.
 */
export function replanScale(weeklyRatio: number): number {
	return Math.max(1 / weeklyRatio, REPLAN_MIN_SCALE)
}

/** The quantified cardio Step Quantities the volume rule may rescale. */
export type StepQuantities = {
	durationSec: number | null
	distanceM: number | null
}

/**
 * Round a scaled quantity to the nearest unit, honestly bounded: a positive
 * quantity never rounds to zero (the step survives) and never above its
 * original (downward only — a sub-unit quantity the rounding can't soften is
 * left unchanged rather than inflated to a whole unit).
 */
function scaleQuantity(
	value: number | null,
	scale: number,
	unit: number,
): number | null {
	if (value == null) return null
	const rounded = Math.round((value * scale) / unit) * unit
	return Math.min(value, Math.max(unit, rounded))
}

/**
 * Apply the replan scale to one step's quantified cardio volume: durations
 * round to the nearest minute, distances to the nearest 100 m; `null` stays
 * `null`. Intensity Targets are structurally out of reach — the helper only
 * accepts quantities, so zones and threshold percentages can never change
 * (volume-only rule, ADR 0025 §2).
 */
export function scaleStepQuantities(
	quantities: StepQuantities,
	scale: number,
): StepQuantities {
	return {
		durationSec: scaleQuantity(
			quantities.durationSec,
			scale,
			REPLAN_DURATION_ROUND_SEC,
		),
		distanceM: scaleQuantity(
			quantities.distanceM,
			scale,
			REPLAN_DISTANCE_ROUND_M,
		),
	}
}

/** A signed TSB for the reason sentences, matching the Coach card's `+6` / `−18`. */
function signedTsb(tsb: number): string {
	const r = Math.round(tsb)
	// Use a real minus sign (−) to match the PRD examples, plus for positives.
	return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : '+0'
}

/** "Last week ran 32% over plan" — the overshoot clause with the real ratio. */
function overshootClause(ratio: number): string {
	return `Last week ran ${Math.round((ratio - 1) * 100)}% over plan`
}

/** "softened … ~24%" — the applied cut as a round percentage. */
function softenedPct(scale: number): string {
	return `~${Math.round((1 - scale) * 100)}%`
}

/** The per-session Replan Note (PRD copy pattern; travels with the session). */
function replanNoteText(ratio: number, tsb: number, scale: number): string {
	return `${overshootClause(ratio)} and Form was ${signedTsb(tsb)} — softened this session ${softenedPct(scale)}.`
}

/** The week-level adjusted reason (the Week tab's decision line). */
function adjustedReason(ratio: number, tsb: number, scale: number): string {
	return `${overshootClause(ratio)} and Form was ${signedTsb(tsb)} — softened this week's remaining sessions ${softenedPct(scale)}.`
}

/**
 * Decide the Week Replan for the most recently closed Training Week.
 *
 * Priority:
 *   1. No measurable adherence → `insufficient-data`: silence never
 *      masquerades as a judgment.
 *   2. `under` → `no-change` with the "bank the planned work" reason —
 *      inflating load is the risky direction, and adherence needs no TSB
 *      trust to say so (mirroring the nudge's adherence-before-trust order).
 *   3. `on-target` → `no-change`: the app looked and chose to hold.
 *   4. `over` needs Form to corroborate the overload:
 *        - untrustworthy or missing TSB → `insufficient-data` (a cold-start
 *          TSB never rewrites the plan; honest "day N/42" reason);
 *        - TSB above `REPLAN_TSB_GATE` → `no-change` (the body is absorbing it);
 *        - nothing adjustable in the target week → `no-change`, an explicit
 *          refusal — the app never claims an adjustment it didn't make;
 *        - otherwise → `adjusted` with the floored inverse-overshoot scale
 *          and a Replan Note per adjustable session.
 */
export function decideWeekReplan(input: {
	/** The closed week's Weekly Plan Adherence (ADR 0019); `null` when unmeasurable. */
	adherence: WeeklyAdherence | null
	/** Current TSB; `null` when there is no load history to derive it from. */
	tsb: number | null
	trust: TsbTrust
	/** The target week's adjustable sessions (see `AdjustableSession` for the gate). */
	adjustableSessions: AdjustableSession[]
}): WeekReplanDecision {
	const { adherence, tsb, trust, adjustableSessions } = input

	if (!adherence) {
		return {
			outcome: 'insufficient-data',
			reason:
				'Last week has no measurable Plan Adherence — no adjustment, not enough data.',
		}
	}

	if (adherence.band.tone === 'under') {
		return {
			outcome: 'no-change',
			reason: `Last week ran ${Math.round((1 - adherence.ratio) * 100)}% under plan — bank the planned work; this week stands as planned.`,
		}
	}

	if (adherence.band.tone === 'on-target') {
		return {
			outcome: 'no-change',
			reason: 'Last week matched the plan — this week stands as planned.',
		}
	}

	// The over branch: Form must corroborate the overload before volume moves.
	if (!trust.trustworthy) {
		return {
			outcome: 'insufficient-data',
			reason: `${overshootClause(adherence.ratio)}, but your Form reading is reliable after ${trust.requiredDays} days — day ${trust.daysOfHistory}/${trust.requiredDays} — no adjustment yet.`,
		}
	}
	if (tsb == null) {
		return {
			outcome: 'insufficient-data',
			reason: `${overshootClause(adherence.ratio)}, but Form is unavailable — no adjustment without it.`,
		}
	}
	if (tsb > REPLAN_TSB_GATE) {
		return {
			outcome: 'no-change',
			reason: `${overshootClause(adherence.ratio)} but Form is ${signedTsb(tsb)} — you're absorbing it, so this week stands as planned.`,
		}
	}
	if (adjustableSessions.length === 0) {
		return {
			outcome: 'no-change',
			reason: `${overshootClause(adherence.ratio)} and Form was ${signedTsb(tsb)}, but nothing in the coming week can be softened — no change made.`,
		}
	}

	const scale = replanScale(adherence.ratio)
	return {
		outcome: 'adjusted',
		scale,
		notes: adjustableSessions.map((session) => ({
			sessionId: session.id,
			note: replanNoteText(adherence.ratio, tsb, scale),
		})),
		reason: adjustedReason(adherence.ratio, tsb, scale),
	}
}
