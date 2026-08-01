// **Copying a week** onto another week (#415, ADR 0044 §6).
//
// The small action that turned out not to be free. There is no session- or
// week-level duplicate anywhere else in the app — `duplicate` exists only for a step
// and a set inside the workout editor — so "just copy a good week" was never the
// cheap alternative to a **Week Pattern** it looked like. This module is that write;
// `copy-week.ts` is the arithmetic behind it.
//
// Four rules, and each is the same rule stamping holds, for the same reason:
//
// - **A fresh `Workout` per copied session, always.** `Workout.sessions` is
//   one-to-many, so a copy that shared the source's Workout would make editing
//   Wednesday in the new week edit Wednesday in the old one. `copyWorkout` is the one
//   deep-copy seam and this reuses it rather than growing a second (ADR 0044 §6).
// - **A copied session is an ordinary session.** Anchored to the same **Event** and
//   carrying the `authored` **Session Source** — the two marks a hand-authored
//   session has. Nothing records that it was copied, so there is nothing to keep in
//   sync and no "copied session" category to explain.
// - **Copied as authored, never scaled.** This is what makes copying a week a
//   *different* offer from stamping a pattern. A pattern's share days absorb the
//   week's derived volume; a copy carries the week the athlete already wrote. If the
//   target week's derived target differs, the Weeks reading shows the sessions
//   against that target the way it does for any hand-edited week (ADR 0040 §1).
// - **A target week that already holds sessions says so before it is rewritten.** The
//   confirmation gate and the never-replaced set are the stamp's, off the one
//   statement of that policy (`week-sessions.server.ts`), so the two writes cannot
//   drift apart on which sessions the plan may delete.

import { weekBoundsFromMondayUTC } from '../athlete-calendar.ts'
import { getAthleteTimezone } from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import { recomputePlannedTssForSession } from '../load/planned-tss.server.ts'
import { copyWorkout, workoutCopySelect } from '../workout.server.ts'
import {
	planWeekCopy,
	WeekCopySchema,
	type CopySkip,
	type WeekCopyInput,
} from './copy-week.ts'
import { totalWeeks } from './derive.ts'
import { phaseSpecs } from './from-rows.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'
import { clearPlanWeek, readWeekOccupancy } from './week-sessions.server.ts'

/**
 * Why a copy was refused. Every one is a state the athlete can act on, so none is an
 * exception and none carries wording — the route maps each to a sentence.
 *
 * `target-week-filled` is the only one that is not an absence: it is the confirmation
 * gate, and it comes back **with the counts** so the surface can say exactly what
 * would be replaced before the athlete says yes.
 */
export type CopyWeekRefusal =
	| 'plan-gone'
	| 'week-outside-plan'
	| 'same-week'
	| 'source-week-empty'
	| 'nothing-to-copy'
	| 'target-week-filled'

/** The target week as it stands, and what a copy onto it would do. */
export type CopyWeekConflict = {
	weekKey: string
	weekInPlan: number
	/** Scheduled, untrained sessions of this plan that the copy deletes. */
	replacing: number
	/**
	 * Sessions the copy leaves exactly alone: completed, skipped or missed ones,
	 * anything carrying a **Session Log**, and anything backed by a **Recording**. A
	 * week the athlete has lived is not the copy's to rewrite, so this is a hard rule
	 * and not a consequence of the confirmation.
	 */
	keeping: number
}

/** What a copy did, in numbers — the surface words it (ADR 0023). */
export type CopyWeekReport = {
	sourceWeekInPlan: number
	targetWeekInPlan: number
	/** Sessions written onto the target week. */
	sessions: number
	/** Sessions deleted to make room. */
	replaced: number
	/** Sessions of the source week that produced no copy, each with its reason. */
	skipped: CopySkip[]
}

export type CopyWeekResult =
	| { ok: true; report: CopyWeekReport }
	| { ok: false; reason: Exclude<CopyWeekRefusal, 'target-week-filled'> }
	| { ok: false; reason: 'target-week-filled'; conflict: CopyWeekConflict }

function refuse(
	reason: Exclude<CopyWeekRefusal, 'target-week-filled'>,
): CopyWeekResult {
	return { ok: false, reason }
}

/**
 * Copy one week of this plan's sessions onto another week of the same plan.
 *
 * All-or-nothing: one transaction, so a mid-flight failure can never leave half a
 * week behind. That also makes a double submit safe — a confirmed copy submitted
 * twice deletes what the first one wrote and writes it again, landing on the same
 * sessions rather than doubling them, and an *unconfirmed* second submit finds the
 * week filled and asks for confirmation instead of writing anything.
 */
export async function copyWeek(
	userId: string,
	input: WeekCopyInput,
): Promise<CopyWeekResult> {
	const copy = WeekCopySchema.parse(input)

	const outline = await prisma.planOutline.findFirst({
		where: { id: copy.outlineId, event: { athleteId: userId } },
		select: {
			startWeekKey: true,
			event: { select: { id: true } },
			phases: {
				select: {
					id: true,
					orderIndex: true,
					name: true,
					weeks: true,
					rhythm: true,
					tapers: true,
				},
			},
		},
	})
	if (!outline) return refuse('plan-gone')

	// The plan's span, and nothing else about it: a copy reads no track, no anchor and
	// no ramp, because a copied week is not priced against the week it lands on.
	const weekCount = totalWeeks(phaseSpecs({ ...outline, tracks: [] }))
	const source = weekInPlan(outline.startWeekKey, copy.sourceWeekKey, weekCount)
	const target = weekInPlan(outline.startWeekKey, copy.targetWeekKey, weekCount)
	if (source == null || target == null) return refuse('week-outside-plan')
	// A week onto itself is a no-op dressed as a destructive one: it would clear the
	// week and write it back, and anything it could not copy would simply be gone.
	// Said as its own reason rather than run.
	if (copy.sourceWeekKey === copy.targetWeekKey) return refuse('same-week')

	const eventId = outline.event.id
	const timezone = await getAthleteTimezone(userId)

	// Scoped to this Event, exactly as the replacement scope is: the plan copies the
	// week *of this plan*, so a session the athlete authored outside it is neither
	// taken nor overwritten. Every status comes across — a week that went well is a
	// week that was *trained*, and refusing to copy a completed session would make
	// the feature useless for the case it was asked for.
	const bounds = weekBoundsFromMondayUTC(copy.sourceWeekKey, timezone)
	const sources = await prisma.workoutSession.findMany({
		where: {
			userId,
			targetEventId: eventId,
			scheduledAt: { gte: bounds.start, lte: bounds.end },
		},
		orderBy: { scheduledAt: 'asc' },
		select: { id: true, scheduledAt: true, workoutId: true },
	})
	// Refused rather than reported as a copy of nothing: "it did nothing and said it
	// worked" is exactly the silence this refusal exists to break.
	if (sources.length === 0) return refuse('source-week-empty')

	const plan = planWeekCopy({
		sources: sources.map((session) => ({
			sessionId: session.id,
			scheduledAt: session.scheduledAt,
			workoutId: session.workoutId,
		})),
		sourceWeekKey: copy.sourceWeekKey,
		targetWeekKey: copy.targetWeekKey,
		timezone,
	})
	// The week holds sessions but not one of them is a prescription — every one is a
	// recording with no Workout behind it. Named rather than reported as a success.
	if (plan.sessions.length === 0) return refuse('nothing-to-copy')

	// What is already there, read before anything is written: the athlete is told what
	// the copy would replace *before* it replaces it, so an edited week is never
	// silently lost.
	const occupancy = await readWeekOccupancy(
		userId,
		eventId,
		copy.targetWeekKey,
		timezone,
	)
	if (!copy.replace && (occupancy.replacing > 0 || occupancy.keeping > 0)) {
		return {
			ok: false,
			reason: 'target-week-filled',
			conflict: {
				weekKey: copy.targetWeekKey,
				weekInPlan: target,
				...occupancy,
			},
		}
	}

	// The sources read once, in the shape `copyWorkout` takes — the seam's own reason
	// for taking rows rather than an id. Nothing in the target week can have deleted
	// one of these: the two weeks are different weeks, which `same-week` guarantees.
	const sourceWorkouts = await prisma.workout.findMany({
		where: {
			ownerId: userId,
			id: { in: plan.sessions.map((session) => session.sourceWorkoutId) },
		},
		select: workoutCopySelect,
	})
	const byId = new Map(sourceWorkouts.map((workout) => [workout.id, workout]))

	const written = await prisma.$transaction(async (tx) => {
		const replaced = await clearPlanWeek(
			tx,
			userId,
			eventId,
			copy.targetWeekKey,
			timezone,
		)
		const sessionIds: string[] = []
		for (const session of plan.sessions) {
			const workout = byId.get(session.sourceWorkoutId)
			if (!workout) continue
			// A verbatim copy: no title override and no block override, because nothing
			// is scaled. The prescription the athlete wrote is the prescription they get.
			const fresh = await copyWorkout(tx, workout, userId)
			const created = await tx.workoutSession.create({
				data: {
					userId,
					workoutId: fresh.id,
					scheduledAt: session.scheduledAt,
					// A copy is a plan, never a record of the source's outcome: it starts
					// scheduled, with no Session Log and no Recording, whatever had happened
					// to the session it was copied from.
					status: 'scheduled',
					// The two marks that make this an ordinary session: authored by the
					// athlete, anchored to the same Event as the week it came from.
					source: 'authored',
					targetEventId: eventId,
				},
				select: { id: true },
			})
			sessionIds.push(created.id)
		}
		return { replaced, sessionIds }
	})

	// Planned TSS is materialized on the session (ADR 0019), so every fresh copy gets
	// its own figure — and a strength copy honestly gets `null` rather than a zero,
	// which is what "contributes no TSS" means (ADR 0008).
	for (const sessionId of written.sessionIds) {
		await recomputePlannedTssForSession(userId, sessionId)
	}

	return {
		ok: true,
		report: {
			sourceWeekInPlan: source,
			targetWeekInPlan: target,
			sessions: written.sessionIds.length,
			replaced: written.replaced,
			skipped: plan.skipped,
		},
	}
}

/**
 * This week's 1-based position in the plan, or `null` for a week the plan does not
 * have.
 *
 * A week key that is not one of *this* plan's Mondays is refused rather than snapped
 * to the nearest week: `weekIndexOf` rounds, so a stale link or a mid-week date would
 * otherwise copy somewhere nobody pointed at — the guard `stampWeekPattern` makes.
 */
function weekInPlan(
	startWeekKey: string,
	weekKey: string,
	weekCount: number,
): number | null {
	const index = weekIndexOf(startWeekKey, weekKey)
	if (index < 0 || index >= weekCount) return null
	return weekKeyAt(startWeekKey, index) === weekKey ? index + 1 : null
}
