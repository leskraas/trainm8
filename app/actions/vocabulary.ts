/**
 * The registry's closed vocabularies (ADR 0092 §1–§6), as pure data: the
 * kinds, callers and scopes an action is described by, the refusal codes with
 * their fixed advice, and the one **Unavailable Metric** reason list every
 * `Reading` uses.
 *
 * A runtime leaf on purpose: `labels.ts` words every code here and imports
 * this file for its types only, and the registry's modules import the lists.
 * Nothing in here knows a service, the database or a reader.
 */

import { UNAVAILABLE_READINGS } from '#app/utils/plan-outline/unavailable-readings.ts'
import { UNAVAILABLE_METRIC_REASONS } from '#app/utils/planned-discipline.ts'

// ── kinds, callers, scopes (§2, §3) ─────────────────────────────────────────

/** What an action does, fixed per action and never by its input (§2). */
export const ACTION_KINDS = ['read', 'propose', 'write'] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

/**
 * Who is calling, derived at the boundary from the credential that
 * authenticated the request, never from anything the client sets (§3).
 */
export const CALLERS = ['web', 'mcp', 'agent'] as const
export type Caller = (typeof CALLERS)[number]

/** The callers that are a model: what they see passes the provenance gate. */
export const MODEL_CALLERS = ['mcp', 'agent'] as const satisfies Caller[]
export type ModelCaller = (typeof MODEL_CALLERS)[number]

export function isModelCaller(caller: Caller): caller is ModelCaller {
	return (MODEL_CALLERS as readonly Caller[]).includes(caller)
}

/** The OAuth scope each kind needs from a token (§2). */
export const SCOPE_OF_KIND = {
	read: 'training:read',
	propose: 'training:propose',
	write: 'training:log',
} as const satisfies Record<ActionKind, string>
export type Scope = (typeof SCOPE_OF_KIND)[ActionKind]
export const SCOPES = Object.values(SCOPE_OF_KIND) as Scope[]

// ── refusals (§5) ────────────────────────────────────────────────────────────

/**
 * What a reader should do after a refusal. Fixed per code, so every reader —
 * the route, the MCP server, a later agent — gives the same advice.
 */
export const NEXTS = ['fix-input', 'ask-athlete', 'reread', 'stop'] as const
export type Next = (typeof NEXTS)[number]

/**
 * Every refusal code and its `next`. A refusal means nothing happened and the
 * same call will not succeed. The seed list is ADR 0092 §5's; the rest are the
 * domain's own codes, added as each slice lands — here Ukeskiftet's answers
 * (`answerProposal`, `acceptRoundWithFactor`, `easeWeek`), whose service
 * reasons are these codes one to one, so the route can say exactly what it
 * said before the registry (`routes/resources/week-change.tsx`).
 */
export const REFUSALS = {
	// The seed list (ADR 0092 §5).
	'invalid-input': 'fix-input',
	'not-found': 'fix-input',
	'not-allowed': 'stop',
	'needs-athlete-yes': 'ask-athlete',
	'needs-scope': 'ask-athlete',
	stale: 'reread',
	'too-late': 'stop',
	'already-answered': 'stop',
	'not-undoable': 'stop',
	'undo-expired': 'stop',
	'no-before-image': 'stop',
	// Ukeskiftet (ADR 0080; `week-replan-answers.server.ts`).
	'already-applied': 'stop',
	'scope-not-a-move': 'fix-input',
	'scope-not-for-a-make-up': 'fix-input',
	'factor-not-a-round': 'fix-input',
	'factor-out-of-range': 'fix-input',
	'not-a-week': 'fix-input',
	'not-the-coming-week': 'stop',
	'already-eased': 'stop',
	autopilot: 'stop',
} as const satisfies Record<string, Next>
export type RefusalCode = keyof typeof REFUSALS
export const REFUSAL_CODES = Object.keys(REFUSALS) as RefusalCode[]

/** Why nothing ran, when the same call may succeed later (§5). */
export const NOT_RUN_REASONS = [
	'rate-limited',
	'switched-off',
	'internal',
] as const
export type NotRunReason = (typeof NOT_RUN_REASONS)[number]

// ── the Unavailable Metric's reasons (§6) ────────────────────────────────────

/**
 * The volume conversion's reasons (`plan-outline/volume-conversion.ts`'s
 * `UnavailableReason`), restated as a list so they can be iterated;
 * `vocabulary.test.ts` holds the two to the same set at typecheck.
 */
export const VOLUME_CONVERSION_REASONS = [
	'sets-has-no-reading',
	'not-an-endurance-discipline',
	'no-zone-recipe',
	'no-intensity-source',
	'no-heart-rate-anchor',
	'no-threshold-pace',
	'no-critical-swim-speed',
	'no-ride-history',
] as const

/**
 * **One** `UnavailableReason` for the whole app (ADR 0092 §6). The local
 * vocabularies are subsets of it by construction — `PlannedMetric`'s, the
 * strength plan's `UNAVAILABLE_READINGS`, the volume conversion's — plus the
 * reasons that were prose or flags before:
 *
 * - `no-season-anchor`: no Season Anchor is in force on the track.
 * - `no-recording`: nothing was recorded (yet) for the session.
 * - `building-baseline`: Form (TSB) before the 42-day trust gate.
 * - `insufficient-data`: no history to read the number from.
 * - `source-terms`: the Origin Platform's terms forbid this surface (ADR 0098).
 *
 * And the ones the first slice found it needed (ADR 0092, "The first slice"):
 *
 * - `outside-plan`: the week lies outside the active plan, so it has no
 *   Week Target (`week-volumes.ts`' `TargetAbsence`).
 * - `no-plan`: there is no active plan to hold a number against.
 * - `not-logged`: the athlete has not logged it (RPE, a Session Log).
 * - `structure-not-verifiable`: Structure Adherence could not confirm the
 *   structure (ADR 0034) — never charged to the athlete as a miss.
 */
export const UNAVAILABLE_REASONS = [
	...UNAVAILABLE_METRIC_REASONS,
	...UNAVAILABLE_READINGS,
	...VOLUME_CONVERSION_REASONS,
	'no-season-anchor',
	'no-recording',
	'building-baseline',
	'insufficient-data',
	'source-terms',
	'outside-plan',
	'no-plan',
	'not-logged',
	'structure-not-verifiable',
] as const
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number]
