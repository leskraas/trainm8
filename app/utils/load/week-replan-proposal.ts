/**
 * The Week Replan proposal (#505, ADR 0080): one change the app proposes for
 * the week after a closed one, as data rather than prose.
 *
 * A proposal is a kind with its payload — `keep`, `move`, `swap`, `add`,
 * `scale`, or `add-phase` for an open-ended plan's next round — validated by one discriminated union, plus a reason, which is the
 * only prose field. Whatever writes proposals (the deterministic rule set in
 * `propose-week-change.ts` today, AI later) writes this type, and the apply
 * rules in `week-replan-proposals.server.ts` read only it, so changing the
 * author never changes what Ok, Nei takk and silence do (ADR 0080 step 6).
 *
 * The load direction is never authored: it is read off the payload by
 * {@link loadDirectionOf}, so a proposal cannot add load while claiming not to —
 * and only one that keeps or reduces load may ever apply on silence.
 *
 * Pure: no clock, no DB.
 */

import { z } from 'zod/v3'
import { DayKeySchema, WeekKeySchema } from '#app/utils/calendar-key-schema.ts'
import { RHYTHMS, VOLUME_CURRENCIES } from '#app/utils/plan-outline/derive.ts'
import { SESSION_OWNERS } from '#app/utils/session-ownership.ts'

const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

/**
 * Leave the target as it is. With no target session it is the week-level
 * "this week stands as planned"; on a missed session it is "let it go" — the
 * session stays on its day as _ikke gjort_ and is not made up.
 */
const KeepPayload = z.object({ kind: z.literal('keep') })

/**
 * Move the target session from one day to another, keeping its local time of
 * day. `makeUp` is the missed-session variant: the session itself stays on
 * `fromDate` as _ikke gjort_ (nothing ever moves a missed session, ADR 0080
 * step 5) and a copy is placed on `toDate` — which adds load to that week.
 */
const MovePayload = z.object({
	kind: z.literal('move'),
	fromDate: DayKeySchema,
	toDate: DayKeySchema,
	makeUp: z.boolean(),
})

/** Exchange the days of the target session and `otherSessionId`. */
const SwapPayload = z.object({
	kind: z.literal('swap'),
	otherSessionId: z.string().min(1),
})

/** Place a copy of `workoutId` on `date` at `time` (local) — always more load. */
const AddPayload = z.object({
	kind: z.literal('add'),
	workoutId: z.string().min(1),
	date: DayKeySchema,
	time: ClockTime,
})

/**
 * Scale the quantified cardio volume by `factor`: of the target session, or —
 * with `scope: 'week'` — of every still-scheduled session left in the target
 * week. Below 1 softens; above 1 adds load.
 *
 * Week-wide is said, never inferred from a missing target: the target column
 * is cleared when its session is deleted, and a softening meant for one
 * session must not become one for the whole week, the athlete's own included.
 */
/**
 * A week's Planned Volume per track — the numbers "før → etter" are read from,
 * the same ones the week header holds (`week-volumes.ts`), so the eased line
 * and the header never disagree.
 */
const WeekVolumeSchema = z.object({
	tracks: z.array(
		z.object({
			trackId: z.string().min(1),
			discipline: z.string().min(1),
			currency: z.enum(VOLUME_CURRENCIES),
			/** In the track's currency; null where nothing planned has a number. */
			planned: z.number().nullable(),
		}),
	),
})
export type WeekVolume = z.infer<typeof WeekVolumeSchema>

const ScalePayload = z.object({
	kind: z.literal('scale'),
	factor: z.number().positive(),
	scope: z.literal('week').optional(),
	/**
	 * The week's planned volume before and after a week-wide scale applied —
	 * recorded by "Gjør uka lettere", so the card can say "før → etter" after a
	 * reload as well as on the tap. A record of what happened, never an input.
	 */
	volumes: z
		.object({ before: WeekVolumeSchema, after: WeekVolumeSchema })
		.optional(),
})

/**
 * Append the next round to an open-ended plan (ADR 0079 §2–3): a phase named
 * `name`, of `weeks` weeks on `rhythm`, after the phase `afterPhaseId` — which
 * must still be the plan's last when it applies, so a plan the athlete has
 * reshaped meanwhile is never appended to twice. `factor` is the round's
 * volume against the one before: 1 keeps it, above 1 adds load. Its target is
 * the plan, never a session, so session ownership has nothing to say about it.
 */
const AddPhasePayload = z.object({
	kind: z.literal('add-phase'),
	outlineId: z.string().min(1),
	afterPhaseId: z.string().min(1),
	name: z.string().min(1),
	weeks: z.number().int().positive(),
	rhythm: z.enum(RHYTHMS),
	factor: z.number().positive(),
})

export const ProposalPayloadSchema = z.discriminatedUnion('kind', [
	KeepPayload,
	MovePayload,
	SwapPayload,
	AddPayload,
	ScalePayload,
	AddPhasePayload,
])

export type ProposalPayload = z.infer<typeof ProposalPayloadSchema>

/** Whether a proposal puts more training on the athlete (ADR 0080 §Consequences). */
export const LoadDirectionSchema = z.enum(['adds', 'keeps-or-reduces'])
export type LoadDirection = z.infer<typeof LoadDirectionSchema>

/** A move's reach: _bare denne gangen_ or _fra nå av_ (ADR 0080 step 4). */
export const ProposalScopeSchema = z.enum(['this-time', 'from-now-on'])
export type ProposalScope = z.infer<typeof ProposalScopeSchema>

export const ProposalAnswerSchema = z.enum(['pending', 'accepted', 'declined'])
export type ProposalAnswer = z.infer<typeof ProposalAnswerSchema>

/**
 * The load direction a payload implies — the one reading every writer and the
 * silence rule share. An `add` and a make-up move put a session into a week
 * that did not plan it; a scale above 1 lengthens what is there. Keep, a
 * reschedule, a swap and a softening keep or reduce the load. A next round
 * adds load when its factor is above 1, and keeps it at 1.
 */
export function loadDirectionOf(payload: ProposalPayload): LoadDirection {
	switch (payload.kind) {
		case 'add':
			return 'adds'
		case 'move':
			return payload.makeUp ? 'adds' : 'keeps-or-reduces'
		case 'scale':
		case 'add-phase':
			return payload.factor > 1 ? 'adds' : 'keeps-or-reduces'
		case 'keep':
		case 'swap':
			return 'keeps-or-reduces'
	}
}

/**
 * One proposal as an author writes it, before it is stored. The answer, the
 * load direction and the timestamps are the store's business, not the author's.
 */
export type ProposalDraft = {
	payload: ProposalPayload
	/** The session the change is aimed at; null for a week-wide change. */
	targetSessionId: string | null
	/** The Monday (YYYY-MM-DD) of the week the change lands in. */
	targetWeekKey: string
	/** Why, in plain Norwegian — the only prose a proposal carries. */
	reason: string
}

// ── the before-image ───────────────────────────────────────────────────────

/**
 * One session as it stood before an applied change wrote to it: its placement,
 * its Replan Note and — when the change scaled it — the quantities of the
 * cardio steps it scaled. Exactly what the apply engine writes, so putting
 * these back puts the session back.
 */
const SessionImageSchema = z.object({
	id: z.string().min(1),
	scheduledAt: z.string().datetime(),
	replanReason: z.string().nullable(),
	/**
	 * Whose the session was when the change applied (Session Adoption) — so an
	 * undo can tell that the athlete took it over since, and leave it alone.
	 */
	owner: z.enum(SESSION_OWNERS),
	steps: z
		.array(
			z.object({
				id: z.string().min(1),
				durationSec: z.number().nullable(),
				distanceM: z.number().nullable(),
			}),
		)
		.optional(),
})
export type SessionImage = z.infer<typeof SessionImageSchema>

/**
 * What an applied proposal replaced (#564, spec #558 "Autopilot"), so an undo
 * restores exactly rather than guessing:
 *
 * - `sessions`: every session the change wrote to, as it stood before;
 * - `placed`: every session the change created (an `add`, a make-up), which an
 *   undo removes;
 * - `round`: for a next round, what it appended — the plan, the new phase, the
 *   week it opens on and the factor it was appended at. An undo re-lays it at
 *   factor 1 rather than removing it, so an open-ended plan never ends.
 *
 * A `keep` (and a change that found nothing to write) has an empty image.
 */
export const BeforeImageSchema = z.object({
	sessions: z.array(SessionImageSchema),
	placed: z.array(z.string().min(1)),
	round: z
		.object({
			outlineId: z.string().min(1),
			phaseId: z.string().min(1),
			opensWeekKey: WeekKeySchema,
			factor: z.number().positive(),
		})
		.optional(),
})
export type BeforeImage = z.infer<typeof BeforeImageSchema>

export function emptyBeforeImage(): BeforeImage {
	return { sessions: [], placed: [] }
}

/** Read a stored before-image back, refusing anything the schema does not describe. */
export function parseBeforeImage(json: string): BeforeImage {
	return BeforeImageSchema.parse(JSON.parse(json))
}

/** Read a stored payload back, refusing anything the union does not describe. */
export function parseProposalPayload(json: string): ProposalPayload {
	return ProposalPayloadSchema.parse(JSON.parse(json))
}
