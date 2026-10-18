/**
 * **Juster** (spec #558 S5, ADR 0100 §7, GLOSSARY): the one-tap changes to
 * today's session on I dag's today card — _For sliten i dag_, _Lite tid_ and
 * _Bytt dag_. This module is their rules, pure: how long a session becomes,
 * which day it moves to, and the forms the chips post. The writes and the
 * undo live in `juster.server.ts`.
 *
 * - **For sliten i dag** (`tired`): an endurance session becomes easy at 60 %
 *   of its time, to the nearest 5 minutes, never under 20 (and never longer
 *   than it was). A strength session or a Simple Activity keeps its kind and
 *   becomes _rolig_ and shorter.
 * - **Lite tid** (`short`): 30 minutes, or 20 if it was 30 or less. The intent
 *   is kept.
 * - **Bytt dag** (`move`): the next free day this week, or a swap with the
 *   next session; refused when no later day is left.
 * - **Bytt økt** (`swap`, #579): a session picked from Bibliotek — a Catalogue
 *   session, a program day or one exercise — replaces today's prescription.
 *
 * The first three never touch ownership: on the machine's session _For sliten
 * i dag_ and _Lite tid_ are a machine write at the athlete's request (the
 * documented exception to Session Adoption), and _Bytt dag_ is a reschedule.
 * _Bytt økt_ is the athlete's choice of session, so it **adopts** under the
 * normal rule (ADR 0080).
 */
import { z } from 'zod/v3'

export const JUSTER_INTENTS = ['tired', 'short', 'move'] as const
export type JusterIntent = (typeof JUSTER_INTENTS)[number]

/** Why a chip could not act. Each has a sentence in `JUSTER_LABELS.refused`. */
export const JUSTER_REFUSALS = [
	/** Not the athlete's session, or gone. */
	'session-not-found',
	/** Juster changes today's session only. */
	'not-today',
	/** Done, or _ikke gjort_: there is nothing left to change. */
	'not-open',
	/** No prescription to change (a session with no Workout). */
	'no-workout',
	/** The session states no time to shorten from. */
	'no-time',
	/** _Lite tid_ on a session already 20 minutes or less. */
	'already-short',
	/** _For sliten i dag_ on a session already easy and as short as it goes. */
	'already-easy',
	/** _Bytt dag_ on the last day of the week. */
	'no-later-day',
	/** _Bytt økt_'s pick is not in Bibliotek (gone, retired, or not theirs). */
	'pick-not-found',
] as const
export type JusterRefusal = (typeof JUSTER_REFUSALS)[number]

/** Why an _Angre_ on a Juster was refused. */
export const JUSTER_UNDO_REFUSALS = [
	'not-found',
	/** A session it changed has been trained: done, missed, logged or linked. */
	'session-trained',
	/** The session changed again since (another Juster, an edit, a replan). */
	'changed',
] as const
export type JusterUndoRefusal = (typeof JUSTER_UNDO_REFUSALS)[number]

/** _For sliten i dag_ keeps this share of the session's time. */
export const TIRED_SHARE = 0.6
/** _For sliten i dag_ never makes a session shorter than this. */
export const TIRED_FLOOR_MIN = 20
/** _Lite tid_'s two lengths: this, or the shorter one when it was this or less. */
export const SHORT_MIN = 30
export const SHORTER_MIN = 20

/**
 * _For sliten i dag_'s length: 60 % to the nearest 5 minutes, at least 20,
 * and never longer than the session already was.
 */
export function tiredMinutes(minutes: number): number {
	const share = Math.round((minutes * TIRED_SHARE) / 5) * 5
	return Math.min(minutes, Math.max(TIRED_FLOOR_MIN, share))
}

/**
 * _Lite tid_'s length — 30 minutes, or 20 if it was 30 or less — or null
 * where it would not be shorter (20 minutes or less already).
 */
export function shortMinutes(minutes: number): number | null {
	if (minutes <= SHORTER_MIN) return null
	return minutes > SHORT_MIN ? SHORT_MIN : SHORTER_MIN
}

/**
 * _For sliten i dag_ on a lift: the sets each exercise keeps, the same 60 %
 * rounded up, and never fewer than one.
 */
export function tiredSets(sets: number): number {
	return Math.max(1, Math.min(sets, Math.ceil(sets * TIRED_SHARE)))
}

/** A later day of this week, as _Bytt dag_ reads it. */
export type LaterDay = {
	/** YYYY-MM-DD, Athlete Timezone. */
	key: string
	/** The open sessions on it, earliest first. */
	openSessionIds: readonly string[]
	/** Whether anything at all is on it (an open session, or one done). */
	occupied: boolean
}

export type NewDay =
	| { kind: 'move'; toKey: string }
	| { kind: 'swap'; toKey: string; withSessionId: string }
	| { kind: 'refused'; reason: 'no-later-day' }

/**
 * Where _Bytt dag_ puts today's session: the first free day after today this
 * week; with none free, a swap with the next open session; with neither, a
 * refusal. `laterDays` are this week's days after today, in order.
 */
export function pickNewDay(laterDays: readonly LaterDay[]): NewDay {
	const free = laterDays.find((day) => !day.occupied)
	if (free) return { kind: 'move', toKey: free.key }
	for (const day of laterDays) {
		const next = day.openSessionIds[0]
		if (next) return { kind: 'swap', toKey: day.key, withSessionId: next }
	}
	return { kind: 'refused', reason: 'no-later-day' }
}

// ── Bytt økt ─────────────────────────────────────────────────────────────

/** Where in Bibliotek a _Bytt økt_ pick comes from. */
export const SWAP_SOURCES = ['catalogue', 'program', 'exercise'] as const
export type SwapSource = (typeof SWAP_SOURCES)[number]

/**
 * One exercise picked for today and never planned before: this many sets of
 * this many reps. A lift the athlete has planned keeps their own last sets.
 */
export const EXERCISE_PICK_SETS = 3
export const EXERCISE_PICK_REPS = 8

/** Where _Bytt økt_'s picker reads Bibliotek (`resources/session-swap.tsx`). */
export const SESSION_SWAP_PICKER = '/resources/session-swap'

// ── the forms ────────────────────────────────────────────────────────────

/** Where the today card's chips post (`routes/resources/session-adjust.tsx`). */
export const SESSION_ADJUST_ACTION = '/resources/session-adjust'

const sessionId = z.string().min(1)

/** One chip's post: the intent and today's session. One zod union. */
export const JusterSchema = z.discriminatedUnion('intent', [
	z.object({ intent: z.literal('tired'), sessionId }),
	z.object({ intent: z.literal('short'), sessionId }),
	z.object({ intent: z.literal('move'), sessionId }),
	z.object({
		intent: z.literal('swap'),
		sessionId,
		from: z.enum(SWAP_SOURCES),
		pickId: z.string().min(1),
	}),
])
export type JusterPost = z.infer<typeof JusterSchema>

/** _Angre_ on a Juster: the change's own token, back. */
export const JusterUndoSchema = z.object({
	intent: z.literal('undo'),
	adjustmentId: z.string().min(1),
})

// ── the before-image ─────────────────────────────────────────────────────

/**
 * One touched session as the change found it, and where it left it. The
 * undo puts back `scheduledAt`, `replanReason` and `workoutId`, and refuses
 * when the session no longer stands where the change left it.
 */
const ImageSessionSchema = z.object({
	id: z.string(),
	scheduledAt: z.string(),
	replanReason: z.string().nullable(),
	workoutId: z.string().nullable(),
	after: z.object({
		scheduledAt: z.string(),
		workoutId: z.string().nullable(),
	}),
})

/**
 * The prescription a _For sliten i dag_ or _Lite tid_ replaced: the Workout's
 * own columns and its blocks as stored rows (`workoutCopySelect`), so the
 * undo writes back exactly what stood. `forkId` is the Workout the change
 * wrote instead when the session's own was shared (another session, a Week
 * Pattern day, the Catalogue): the undo then points the session back and
 * removes the fork. `afterFingerprint` is the prescription the change left.
 */
const ImageWorkoutSchema = z.object({
	id: z.string(),
	title: z.string(),
	intent: z.string(),
	effortWord: z.string().nullable(),
	blocks: z.array(z.record(z.unknown())),
	forkId: z.string().nullable(),
	afterFingerprint: z.string(),
})

/**
 * What a _Bytt økt_ replaced besides the session's Workout: who owned the
 * session (it adopts), the title it had, the copy it put on today (removed
 * by the undo) and that copy's prescription as it left it.
 */
const ImageSwapSchema = z.object({
	beforeTitle: z.string().nullable(),
	adoptedAt: z.string().nullable(),
	releasedAt: z.string().nullable(),
	copyId: z.string(),
	afterFingerprint: z.string(),
})

export const JusterImageSchema = z.object({
	sessions: z.array(ImageSessionSchema).min(1),
	workout: ImageWorkoutSchema.nullable(),
	/** Only on a _Bytt økt_; images written before it have none. */
	swap: ImageSwapSchema.nullable().optional(),
})
export type JusterImage = z.infer<typeof JusterImageSchema>

export function parseJusterImage(stored: string): JusterImage {
	return JusterImageSchema.parse(JSON.parse(stored))
}
