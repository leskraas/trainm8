/**
 * The registry (ADR 0092 §1): every action, listed once. Readers loop over it
 * — the MCP server registers each action whose `callers` include `mcp`, the
 * routes dispatch their intents through `runAction` — so adding an operation
 * is one `defineAction` here and one fixture in `parity.test.ts`.
 *
 * The first slice (#553): six reads, and Ukeskiftet (ADR 0080) — its read and
 * the three answers that are the athlete's own yes.
 */

import { type z } from 'zod/v4'
import { acceptRoundAction } from './accept-round.server.ts'
import { answerProposalAction } from './answer-proposal.server.ts'
import { type ActionDef, type ActionResult } from './define.ts'
import { easeWeekAction } from './ease-week.server.ts'
import { getSeasonAction } from './get-season.server.ts'
import { getSessionVsPlanAction } from './get-session-vs-plan.server.ts'
import { getSessionAction } from './get-session.server.ts'
import { getTodayAction } from './get-today.server.ts'
import { getTrainingLoadAction } from './get-training-load.server.ts'
import { getWeekChangeAction } from './get-week-change.server.ts'
import { listSessionsAction } from './list-sessions.server.ts'

const ACTIONS = {
	get_today: getTodayAction,
	list_sessions: listSessionsAction,
	get_session: getSessionAction,
	get_session_vs_plan: getSessionVsPlanAction,
	get_training_load: getTrainingLoadAction,
	get_season: getSeasonAction,
	get_week_change: getWeekChangeAction,
	answer_proposal: answerProposalAction,
	accept_round: acceptRoundAction,
	ease_week: easeWeekAction,
} as const

type Actions = typeof ACTIONS
export type ActionName = keyof Actions

/** An action of any input and output, as a reader loops over them. */
export type AnyActionDef = ActionDef<any, any>

export type InputOf<N extends ActionName> = z.input<Actions[N]['input']>
export type OutputOf<N extends ActionName> = z.output<Actions[N]['output']>
export type ResultOf<N extends ActionName> = ActionResult<OutputOf<N>>

/** Every action, in a stable order (by name), for the readers' loops. */
export function listActions(): AnyActionDef[] {
	return Object.values(ACTIONS as Record<string, AnyActionDef>).sort((a, b) =>
		a.name.localeCompare(b.name),
	)
}

export function isActionName(name: string): name is ActionName {
	return Object.hasOwn(ACTIONS, name)
}

export function getAction(name: ActionName): AnyActionDef {
	const action = (ACTIONS as Record<string, AnyActionDef | undefined>)[name]
	if (!action || action.name !== name) {
		throw new Error(`No action is registered as "${name}".`)
	}
	return action
}
