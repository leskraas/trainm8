/**
 * The Autopilot's guards (#576, ADR 0100 §3): what replaces the athlete's yes
 * when the Week Change applies its Week Replan at the close.
 *
 * - **A step up is bounded**: at most the presets' 5 % a round
 *   (`ROUND_STEP_UP`) and never past the ramp guard's 8 % (`RAMP_GUARD_MAX`).
 *   Both are conventions, not injury prevention (ADR 0040 §13). The stricter
 *   of the two is the cap. A next round's step also rides on the ramp step
 *   into its first week, so the autopilot's round is authored at a factor that
 *   keeps the two together inside the 8 % (`autopilotRoundFactor`, #584); the
 *   payload guard here then holds it to the 5 %.
 * - **Nothing is placed on a day nobody chose**: a make-up copy and an extra
 *   session add a session the athlete never asked for, so neither is placed.
 *   The missed session stays _ikke gjort_ on its day (ADR 0080 §5).
 * - **The athlete's own sessions are never changed** — that is the apply
 *   engine's ownership check at apply time, not a reading of the payload.
 *
 * Only the deterministic rule set writes proposals today. Whether the
 * autopilot may apply a proposal an assistant wrote is ADR 0093's to say, not
 * written yet (ADR 0100 Consequences): nothing here reads the author.
 *
 * Pure: no clock, no DB.
 */

import { z } from 'zod/v3'
import { RAMP_GUARD_MAX } from '#app/utils/plan-outline/ramp-guard.ts'
import { ROUND_STEP_UP } from './propose-next-round.ts'
import { type ProposalPayload } from './week-replan-proposal.ts'

/** The largest factor the autopilot applies without a yes. */
export const AUTOPILOT_STEP_UP_MAX = Math.min(ROUND_STEP_UP, 1 + RAMP_GUARD_MAX)

/**
 * What the autopilot did with one proposal at the close, as
 * `WeekReplanProposal.autopilotOutcome` stores it:
 *
 * - `applied`: written to the sessions (or the plan), with a before-image;
 * - `left-alone`: aimed at the athlete's own session, which stands;
 * - `not-placed`: a make-up or an extra session, which is never placed;
 * - `over-guard`: a step up past the guards;
 * - `gone`: nothing left to change — its session was done, moved or deleted.
 */
export const AUTOPILOT_OUTCOMES = [
	'applied',
	'left-alone',
	'not-placed',
	'over-guard',
	'gone',
] as const
export const AutopilotOutcomeSchema = z.enum(AUTOPILOT_OUTCOMES)
export type AutopilotOutcome = z.infer<typeof AutopilotOutcomeSchema>

/**
 * Whether the guards let the autopilot try this payload, or the outcome that
 * holds it. Ownership is not read here: it is re-read from the row when the
 * change is written.
 */
export function autopilotGuard(
	payload: ProposalPayload,
): 'may-apply' | Extract<AutopilotOutcome, 'not-placed' | 'over-guard'> {
	switch (payload.kind) {
		case 'add':
			return 'not-placed'
		case 'move':
			return payload.makeUp ? 'not-placed' : 'may-apply'
		case 'scale':
		case 'add-phase':
			return payload.factor > AUTOPILOT_STEP_UP_MAX ? 'over-guard' : 'may-apply'
		case 'keep':
		case 'swap':
			return 'may-apply'
	}
}
