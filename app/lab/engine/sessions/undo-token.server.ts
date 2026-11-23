/**
 * Undo tokens for the sessions capabilities: an opaque, signed string an app
 * holds and hands back to `undo`. It names the athlete, the kind of write
 * and what that write needs to be taken back exactly; the signature means a
 * token cannot be made up or edited, and the athlete in it means one athlete's
 * token never acts for another.
 *
 * A token carries no expiry of its own: every undo checks that what it would
 * put back is still as the write left it, and refuses otherwise.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type UndoPayload =
	| {
			k: 'done'
			sessionId: string
			markedAt: string
			status: 'scheduled' | 'missed'
			markedDoneAt: string | null
	  }
	| { k: 'skip'; sessionId: string; status: string; updatedAt: string }
	| { k: 'adjust'; adjustmentId: string }
	| { k: 'release'; sessionId: string; releasedAt: string }
	| { k: 'add'; sessionId: string }
	| {
			k: 'log'
			sessionId: string
			before: { content: string; rpe: number | null } | null
			after: { content: string; rpe: number | null } | null
	  }
	| { k: 'counts'; sessionId: string; before: boolean }
	| { k: 'set-added'; sessionId: string; setLogId: string }
	| {
			k: 'set-restore'
			sessionId: string
			stepId: string
			orderIndex: number
			/** The row as it stood, to write back. */
			row: StoredSet
			/** Null when the set was removed; the edit's row id otherwise. */
			editedId: string | null
	  }
	| { k: 'quick-log'; sessionId: string; setLogIds: string[] }
	| { k: 'unfinish'; sessionId: string }
	| { k: 'link'; importId: string; linkedAt: string }
	| { k: 'unlink'; importId: string }
	| { k: 'proposals'; proposalIds: string[] }

/** A logged set, as `saveLoggedSet` takes it back. */
export type StoredSet = {
	role: 'warmup' | 'working' | 'backoff'
	outcome: 'completed' | 'abandoned'
	toFailure: boolean
	load: string
	reps: number | null
	repsLeft: number | null
	durationSec: number | null
	rir: number | null
	restTakenSec: number | null
}

type Envelope = { v: 1; u: string; p: unknown }

function secret(scope: string): string {
	const value = process.env.SESSION_SECRET
	if (!value) throw new Error('SESSION_SECRET is required to sign undo tokens')
	return `${scope}:${value}`
}

function sign(scope: string, body: string): string {
	return createHmac('sha256', secret(scope)).update(body).digest('base64url')
}

/**
 * Seal any undo payload for one athlete under a scope, so a token from one
 * area (sessions, goal) is never read by another, and none can be made up or
 * edited.
 */
export function sealUndo(scope: string, userId: string, payload: unknown) {
	const envelope: Envelope = { v: 1, u: userId, p: payload }
	const body = Buffer.from(JSON.stringify(envelope)).toString('base64url')
	return `${body}.${sign(scope, body)}`
}

/** The payload, or null when the token is not one this engine sealed under
 * `scope` for this athlete. */
export function openUndo(
	scope: string,
	userId: string,
	token: string,
): unknown {
	const [body, mac] = token.split('.')
	if (!body || !mac) return null
	const expected = Buffer.from(sign(scope, body))
	const given = Buffer.from(mac)
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
		return null
	}
	try {
		const envelope = JSON.parse(
			Buffer.from(body, 'base64url').toString('utf8'),
		) as Envelope
		if (envelope.v !== 1 || envelope.u !== userId) return null
		return envelope.p
	} catch {
		return null
	}
}

const SESSIONS = 'lab-undo'

export function signUndo(userId: string, payload: UndoPayload): string {
	return sealUndo(SESSIONS, userId, payload)
}

/** The payload, or null when the token is not one this engine signed for
 * this athlete. */
export function readUndo(userId: string, token: string): UndoPayload | null {
	return openUndo(SESSIONS, userId, token) as UndoPayload | null
}
