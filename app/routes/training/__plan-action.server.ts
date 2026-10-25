/**
 * What every editor's action on the plan page (`plan.tsx`) shares (#533): the
 * form-field helpers, the refusal reply, and the refusals more than one editor
 * words. Each editor's own action is in the `.server.ts` beside its component.
 */

import { data } from 'react-router'
import { z } from 'zod/v3'
import { SESONG_REFUSAL_LABELS } from '#app/utils/labels.ts'

/**
 * A box the athlete left empty, as HTML delivers it: absent from the body, or a
 * string of nothing.
 *
 * Every field below preprocesses through this, because `Number('')` is 0 — which
 * would read back as a bound the athlete broke ("a phase runs at least one week")
 * when what happened is that nothing was typed. What each field maps a blank *to* is
 * its own business and deliberately not always the same: `undefined` where a blank
 * means "you have not answered yet", `null` where the blank is itself the answer.
 */
export function isBlank(value: unknown): boolean {
	return value == null || (typeof value === 'string' && value.trim() === '')
}

export const IdField = z.string().min(1)

/** A checkbox that is absent from the body when unchecked, as HTML has it. */
export function checked(formData: FormData, name: string): boolean {
	return formData.get(name) === 'on'
}

/**
 * Which way a move goes — the one field every reorder on this route submits, for a
 * phase, a pattern and a pattern day alike.
 *
 * Anything that is not `later` reads as `earlier` rather than being refused: a move
 * is a nudge through a sequence with no destructive end, and the service refuses the
 * edge in either direction anyway, so there is no body that can move something
 * somewhere nobody asked for.
 */
export function moveDirection(formData: FormData): 'earlier' | 'later' {
	return formData.get('direction') === 'later' ? 'later' : 'earlier'
}

export const OUTLINE_GONE = SESONG_REFUSAL_LABELS.outlineGone

/**
 * One sentence for a track that is gone, shared by a pattern day, a hand-set week
 * and a lifting block — the same absence, so it must not be worded three times and
 * drift.
 */
export const TRACK_GONE = SESONG_REFUSAL_LABELS.trackGone

/**
 * One sentence for a week the plan does not hold, shared by a lifting block's
 * opening and a **Season Anchor** segment's — the same fact about the same span, so
 * it must not be worded twice and drift. It names both ways out, because a week
 * outside the plan has two: pick another, or make the plan reach it.
 */
export const WEEK_NOT_ONE_OF_THE_PLANS = SESONG_REFUSAL_LABELS.weekNotInPlan

/** A refusal the athlete reads, at the top of the reading that produced it. */
export function refuse(error: string) {
	return data({ error }, { status: 400 })
}

export function firstIssue(error: z.ZodError): string {
	return error.issues[0]?.message ?? SESONG_REFUSAL_LABELS.badValue
}

export function issueMessages(error: z.ZodError): string[] {
	return error.issues.map((issue) => issue.message)
}
