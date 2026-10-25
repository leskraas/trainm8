/**
 * `defineAction` and the shapes every reader shares (ADR 0092 §1–§5): the
 * context an action runs in, the result union, and the annotations a kind
 * implies. An action is data plus one `run`; everything a reader needs to
 * expose it — the catalog entry, the envelope's schema, the hints — follows
 * from these fields, so no reader holds per-action code.
 */

import { z } from 'zod/v4'
import { CreditSchema, type Credit } from './reading.ts'
import { type Refusal } from './refusals.ts'
import {
	type ActionKind,
	type Caller,
	NEXTS,
	NOT_RUN_REASONS,
	type Next,
	type NotRunReason,
	REFUSAL_CODES,
	type RefusalCode,
	type Scope,
} from './vocabulary.ts'

/** A stable action name: `snake_case`, at most 64 characters (§1). */
export const ACTION_NAME = /^[a-z0-9_]{1,64}$/

/**
 * What a reader hands `runAction`: who is asking and when. `userId` comes from
 * here only — no action input carries a user, athlete or owner id (§3).
 */
export type ActionCtx = {
	userId: string
	now: Date
	/** The Athlete Timezone, read once per call. */
	timezone: string
	caller: Caller
	/**
	 * The scopes the credential carries. Absent for `web` (the athlete's own
	 * session may do anything the action's `callers` allow).
	 */
	scopes?: readonly Scope[]
	/**
	 * Where deep links point: the origin the request reached trainm8 on, so a
	 * link a model is handed opens the athlete's own trainm8.
	 */
	origin: string
}

/** The context `run` receives: the caller's, plus the gate's credit sink. */
export type RunCtx = ActionCtx & {
	credit: (credit: Credit) => void
	/** An absolute deep link into trainm8 for `path`. */
	link: (path: string) => string
}

/** An opaque, server-held undo handle (ADR 0093 §6). Phase 3; none yet. */
export type UndoRef = { handle: string; expiresAt: string }

/** The one result union every reader receives (§5). */
export type ActionResult<O> =
	| {
			outcome: 'done'
			value: O
			undo?: UndoRef
			link?: string
			credits: Credit[]
	  }
	| { outcome: 'proposed'; proposalIds: string[]; link: string }
	| {
			outcome: 'refused'
			code: RefusalCode
			next: Next
			message: string
			/** Where in trainm8 the athlete can act; always on `needs-athlete-yes`. */
			link?: string
	  }
	| { outcome: 'not-run'; reason: NotRunReason }
	| { outcome: 'unknown'; message: string }

export type AnyActionResult = ActionResult<unknown>

/** The whole envelope's schema, for an action whose value is `output`. */
export function envelopeSchema<O extends z.ZodType>(output: O) {
	return z.discriminatedUnion('outcome', [
		z.object({
			outcome: z.literal('done'),
			value: output,
			undo: z.object({ handle: z.string(), expiresAt: z.string() }).optional(),
			link: z.string().optional(),
			credits: z.array(CreditSchema),
		}),
		z.object({
			outcome: z.literal('proposed'),
			proposalIds: z.array(z.string()),
			link: z.string(),
		}),
		z.object({
			outcome: z.literal('refused'),
			code: z.enum(REFUSAL_CODES as [RefusalCode, ...RefusalCode[]]),
			next: z.enum(NEXTS),
			message: z.string(),
			link: z.string().optional(),
		}),
		z.object({
			outcome: z.literal('not-run'),
			reason: z.enum(NOT_RUN_REASONS),
		}),
		z.object({ outcome: z.literal('unknown'), message: z.string() }),
	])
}

/** One athlete operation (§1). */
export type ActionDef<
	I extends z.ZodObject = z.ZodObject,
	O extends z.ZodType = z.ZodType,
> = {
	name: string
	/** Bumped when the meaning or the input changes in a non-additive way. */
	revision: number
	kind: ActionKind
	callers: readonly [Caller, ...Caller[]]
	/** The athlete's words, from `labels.ts`. */
	title: string
	/** English, for a model; a template with no data in it. */
	description: string
	input: I
	output: O
	/**
	 * A `write` that only adds (writes a session, marks one _Gjort_, logs
	 * sets), which a test must say: its hint is then non-destructive (§4).
	 */
	additive?: boolean
	/** A `write` that is idempotent, which a test must say (§4). */
	idempotent?: boolean
	run: (ctx: RunCtx, input: z.output<I>) => Promise<z.output<O> | Refusal>
}

/**
 * Define an action. Returns it unchanged after checking the name, so a bad
 * name fails where it is written rather than in a reader.
 */
export function defineAction<I extends z.ZodObject, O extends z.ZodType>(
	action: ActionDef<I, O>,
): ActionDef<I, O> {
	if (!ACTION_NAME.test(action.name)) {
		throw new Error(`Action name "${action.name}" is not snake_case ≤ 64.`)
	}
	if (action.kind !== 'write' && (action.additive || action.idempotent)) {
		throw new Error(`Only a write declares additive or idempotent.`)
	}
	return Object.freeze(action)
}

/** The MCP tool annotations a kind implies, never written by hand (§4). */
export type ActionAnnotations = {
	readOnlyHint: boolean
	destructiveHint?: boolean
	idempotentHint?: boolean
	openWorldHint: false
}

export function annotationsFor(action: ActionDef): ActionAnnotations {
	switch (action.kind) {
		case 'read':
			return { readOnlyHint: true, openWorldHint: false }
		case 'propose':
			return {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			}
		case 'write':
			return {
				readOnlyHint: false,
				destructiveHint: action.additive !== true,
				idempotentHint: action.idempotent === true,
				openWorldHint: false,
			}
	}
}
