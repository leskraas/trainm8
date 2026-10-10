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
 * functions, in Norwegian through `labels.ts` (ADR 0081: Ukeskiftet speaks
 * Norwegian, and this reason is what it shows). Nothing reads the clock or the DB: the caller pre-filters the
 * adjustable summary (future, still-`scheduled`, quantified cardio), so no
 * time input is needed at all.
 */

import { formatSignedTsb } from '#app/utils/format.ts'
import {
	WEEK_HOLD_REASON_LABELS,
	WEEK_REPLAN_SOFTENED_LABELS,
	type WeekHoldFacts,
} from '#app/utils/labels.ts'
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
	/** Plain-language note, e.g. "Forrige uke ble 32 % tyngre enn planlagt, og formen var −12. Denne økta ble gjort ca. 24 % kortere." */
	note: string
}

/**
 * Every outcome a stored `WeekReplan` row carries: ADR 0025's three, plus
 * ADR 0080's `proposed`. `adjusted` survives only on rows written before #505.
 */
export const WEEK_REPLAN_OUTCOMES = [
	'adjusted',
	'proposed',
	'no-change',
	'insufficient-data',
] as const
export type WeekReplanOutcome = (typeof WEEK_REPLAN_OUTCOMES)[number]

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
	| { outcome: 'no-change'; why: NoChangeWhy; reason: string }
	| { outcome: 'insufficient-data'; why: InsufficientDataWhy; reason: string }

/**
 * Which branch held the week — an enum beside the `reason`, so a second
 * composer (the proposal reasons, `propose-week-change.ts`) words the same
 * judgment without parsing a sentence.
 */
export const NO_CHANGE_WHYS = [
	'under',
	'on-target',
	'fresh',
	'nothing-adjustable',
] as const
export type NoChangeWhy = (typeof NO_CHANGE_WHYS)[number]
export const INSUFFICIENT_DATA_WHYS = [
	'no-adherence',
	'form-untrusted',
	'form-missing',
] as const
export type InsufficientDataWhy = (typeof INSUFFICIENT_DATA_WHYS)[number]
/** Every branch that holds a week, each worded in `WEEK_HOLD_REASON_LABELS`. */
export type WeekHoldWhy = NoChangeWhy | InsufficientDataWhy

/**
 * The one documented scale (ADR 0025 §2): the inverse of the overshoot,
 * floored — bring next week back to roughly the load the plan intended,
 * never cut more than 30%. Downward only by construction: it is only invoked
 * for an `over` week (ratio > 1), so the scale is always < 1.
 */
function replanScale(weeklyRatio: number): number {
	return Math.max(1 / weeklyRatio, REPLAN_MIN_SCALE)
}

/** The quantified cardio Step Quantities the volume rule may rescale. */
export type StepQuantities = {
	durationSec: number | null
	distanceM: number | null
}

/**
 * Round a scaled quantity to the nearest unit, honestly bounded: a positive
 * quantity never rounds to zero (the step survives) and never crosses its
 * original against the scale's direction — a sub-unit quantity a softening
 * can't soften is left unchanged rather than inflated to a whole unit, and a
 * scale-up never rounds below where it started.
 */
function scaleQuantity(
	value: number | null,
	scale: number,
	unit: number,
): number | null {
	if (value == null) return null
	const rounded = Math.max(unit, Math.round((value * scale) / unit) * unit)
	return scale <= 1 ? Math.min(value, rounded) : Math.max(value, rounded)
}

/**
 * Apply a volume scale to one step's quantified cardio volume — the Week
 * Replan's softening, and any scale proposal (ADR 0080), up or down: durations
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

/** `32 %` — a fraction as the reason sentences write it. */
function percent(fraction: number): string {
	return `${Math.round(fraction * 100)} %`
}

/**
 * The facts a held week's sentence is worded from — the same
 * `WEEK_HOLD_REASON_LABELS` the week's `keep` proposal reads, so the week's
 * reason and its proposal can never word one judgment two ways.
 */
function holdFacts(
	ratio: number,
	tsb: number | null,
	trust: TsbTrust,
): WeekHoldFacts {
	return {
		over: percent(ratio - 1),
		under: percent(1 - ratio),
		tsb: tsb == null ? '' : formatSignedTsb(tsb),
		requiredDays: trust.requiredDays,
		daysOfHistory: trust.daysOfHistory,
	}
}

/**
 * The softened sentence (PRD copy pattern) — one composer for both the
 * per-session Replan Note and the week-level reason, so the two can never
 * drift apart.
 */
function softenedSentence(
	ratio: number,
	tsb: number,
	scale: number,
	subject: 'session' | 'week',
): string {
	return WEEK_REPLAN_SOFTENED_LABELS[subject](
		percent(ratio - 1),
		formatSignedTsb(tsb),
		percent(1 - scale),
	)
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
	const H = WEEK_HOLD_REASON_LABELS

	if (!adherence) {
		return {
			outcome: 'insufficient-data',
			why: 'no-adherence',
			reason: H['no-adherence'](holdFacts(1, tsb, trust)),
		}
	}
	const facts = holdFacts(adherence.ratio, tsb, trust)

	if (adherence.band.tone === 'under') {
		return { outcome: 'no-change', why: 'under', reason: H.under(facts) }
	}

	if (adherence.band.tone === 'on-target') {
		return {
			outcome: 'no-change',
			why: 'on-target',
			reason: H['on-target'](facts),
		}
	}

	// The over branch: Form must corroborate the overload before volume moves.
	if (!trust.trustworthy) {
		return {
			outcome: 'insufficient-data',
			why: 'form-untrusted',
			reason: H['form-untrusted'](facts),
		}
	}
	if (tsb == null) {
		return {
			outcome: 'insufficient-data',
			why: 'form-missing',
			reason: H['form-missing'](facts),
		}
	}
	if (tsb > REPLAN_TSB_GATE) {
		return { outcome: 'no-change', why: 'fresh', reason: H.fresh(facts) }
	}
	if (adjustableSessions.length === 0) {
		return {
			outcome: 'no-change',
			why: 'nothing-adjustable',
			reason: H['nothing-adjustable'](facts),
		}
	}

	const scale = replanScale(adherence.ratio)
	return {
		outcome: 'adjusted',
		scale,
		notes: adjustableSessions.map((session) => ({
			sessionId: session.id,
			note: softenedSentence(adherence.ratio, tsb, scale, 'session'),
		})),
		reason: softenedSentence(adherence.ratio, tsb, scale, 'week'),
	}
}
