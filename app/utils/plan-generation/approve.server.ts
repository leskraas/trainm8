import { createId } from '@paralleldrive/cuid2'
import { prisma } from '#app/utils/db.server.ts'
import {
	intensityRangeColumns,
	type IntensityResolution,
	type PreviewBlock,
	type PreviewSession,
	type PreviewStep,
} from './preview.ts'
import { type PlanGenerationInput, type PlanOutline } from './schema.ts'

const DAY_MS = 24 * 60 * 60 * 1000

export type PersistApprovedPlanParams = {
	/** Wizard inputs that drove the generation; used to anchor an auto-Event. */
	input: PlanGenerationInput
	/** Periodized Plan Outline, written as JSON onto the Target Event. */
	outline: PlanOutline
	/**
	 * Near-term dated sessions to materialize as Workouts + Workout Sessions, with
	 * each Step's Intensity Target already resolved on the shared generation path
	 * (so the persisted ranges match the Plan Preview exactly).
	 */
	sessions: PreviewSession[]
	/**
	 * Whether Intensity Target resolution succeeded upstream; echoed back so a
	 * failed resolution is visible at this seam rather than swallowed. Defaults to
	 * `resolved` for direct callers that pass already-resolved sessions.
	 */
	resolution?: IntensityResolution
	/** Model id stamped onto every persisted session (provenance). */
	generatedByModel: string
	/**
	 * Existing Target Event to anchor to. When omitted/null a `fitness-goal`
	 * Event is auto-created from the goal text + horizon so grouping always holds.
	 */
	targetEventId?: string | null
	/** Generation timestamp stamped onto every session; defaults to `now`. */
	generatedAt?: Date
	/** Injectable clock; the auto-Event start date is `now + horizon`. */
	now?: Date
	/**
	 * Regeneration mode (PRD #103 / ADR 0016): before writing the new sessions,
	 * replace only the future, still-`scheduled`, `generated` sessions anchored to
	 * the (existing) Target Event. `completed`/`skipped`/`missed` and `authored`
	 * (including edit-adopted) sessions are never touched. Requires `targetEventId`.
	 */
	replaceFutureGenerated?: boolean
}

export type PersistApprovedPlanResult = {
	eventId: string
	generationId: string
	sessionIds: string[]
	/** Whether Intensity Target resolution succeeded for the saved sessions. */
	resolution: IntensityResolution
}

/**
 * Persist an approved Plan Preview (PRD #103 / ADR 0016).
 *
 * The commit model is preview → approve → persist: nothing is written until the
 * athlete approves. On approve we either reuse the supplied Target Event or
 * auto-create a `fitness-goal` Event from the goal text + horizon (so grouping
 * always holds), write the Plan Outline onto it, and write one Workout + one
 * Workout Session per generated session — carrying the Session Source
 * (`generated`), a shared `generationId`, the model id, a generated-at
 * timestamp, and the Target Event anchor. Once persisted, generated sessions are
 * indistinguishable from authored ones to the ledger, detail view, and load.
 *
 * Cached intensity ranges are written from the sessions' already-resolved
 * Intensity Targets — the same resolution the Plan Preview showed (PRD #125), so
 * the saved ranges match the preview rather than being re-derived afterwards.
 * The upstream `resolution` status is echoed back so a failed resolution is
 * visible here instead of silently reading as a clean save.
 */
export async function persistApprovedPlan(
	userId: string,
	params: PersistApprovedPlanParams,
): Promise<PersistApprovedPlanResult> {
	const { input, outline, sessions, generatedByModel } = params
	const resolution: IntensityResolution = params.resolution ?? 'resolved'
	const now = params.now ?? new Date()
	const generatedAt = params.generatedAt ?? now
	const generationId = createId()
	const planOutlineJson = JSON.stringify(outline)

	// Verify ownership of an explicit Target Event before opening the transaction,
	// so a foreign or missing Event fails fast rather than half-persisting.
	const requestedEventId = params.targetEventId ?? null
	if (requestedEventId) {
		const owned = await prisma.event.findFirst({
			where: { id: requestedEventId, athleteId: userId },
			select: { id: true },
		})
		if (!owned) {
			throw new Error('Target Event not found for this athlete.')
		}
	}

	const result = await prisma.$transaction(async (tx) => {
		const event = requestedEventId
			? await tx.event.update({
					where: { id: requestedEventId },
					data: { planOutline: planOutlineJson },
					select: { id: true },
				})
			: await tx.event.create({
					data: {
						athleteId: userId,
						name: goalToEventName(input.goal),
						kind: 'fitness-goal',
						priority: 'C',
						startDate: new Date(
							now.getTime() + input.horizonWeeks * 7 * DAY_MS,
						),
						disciplines: JSON.stringify(input.disciplines),
						status: 'planned',
						planOutline: planOutlineJson,
					},
					select: { id: true },
				})

		// Regeneration: clear out the future, still-scheduled, generated sessions
		// anchored to this Event before writing the fresh ones. Completed/skipped/
		// missed and authored (edit-adopted) sessions are left in place. Their
		// Workouts are removed too so no orphans linger.
		if (params.replaceFutureGenerated) {
			const stale = await tx.workoutSession.findMany({
				where: {
					userId,
					targetEventId: event.id,
					source: 'generated',
					status: 'scheduled',
					scheduledAt: { gte: now },
				},
				select: { id: true, workoutId: true },
			})
			const staleSessionIds = stale.map((s) => s.id)
			const staleWorkoutIds = stale
				.map((s) => s.workoutId)
				.filter((id): id is string => id != null)
			if (staleSessionIds.length) {
				await tx.workoutSession.deleteMany({
					where: { id: { in: staleSessionIds } },
				})
			}
			if (staleWorkoutIds.length) {
				await tx.workout.deleteMany({
					where: { id: { in: staleWorkoutIds } },
				})
			}
		}

		const sessionIds: string[] = []
		for (const session of sessions) {
			const workout = await tx.workout.create({
				data: {
					title: session.title,
					discipline: session.discipline,
					intent: session.intent,
					ownerId: userId,
					blocks: { create: buildBlocksCreate(session.blocks) },
				},
				select: { id: true },
			})

			const created = await tx.workoutSession.create({
				data: {
					userId,
					workoutId: workout.id,
					scheduledAt: session.scheduledAt,
					status: 'scheduled',
					source: 'generated',
					generationId,
					generatedByModel,
					generatedAt,
					targetEventId: event.id,
				},
				select: { id: true },
			})
			sessionIds.push(created.id)
		}

		return { eventId: event.id, sessionIds }
	})

	return { ...result, generationId, resolution }
}

/** Derive an Event name from the free-text goal, clamped to the Event name limit. */
function goalToEventName(goal: string): string {
	return goal.trim().slice(0, 120)
}

export function buildBlocksCreate(blocks: PreviewBlock[]) {
	return blocks.map((block, blockIndex) => ({
		name: block.name ?? null,
		orderIndex: blockIndex,
		repeatCount: block.repeatCount,
		steps: { create: block.steps.map(buildStepCreate) },
	}))
}

function buildStepCreate(step: PreviewStep, stepIndex: number) {
	if (step.kind === 'cardio') {
		// Persist the baked metric Intensity Target (#131) — pace / %FTP / HR
		// resolved against the athlete's recipe on the shared generation path — so
		// the saved Step carries a real target the #130 formatter renders, not just
		// a zone name. Falls back to the generated zone label when no threshold
		// resolved it, or for direct callers that pass no `persistIntensity`.
		const intensity = step.persistIntensity ?? step.intensity
		return {
			orderIndex: stepIndex,
			kind: 'cardio',
			discipline: step.discipline,
			intensity: intensity != null ? JSON.stringify(intensity) : null,
			durationSec: step.durationSec ?? null,
			distanceM: step.distanceM ?? null,
			notes: step.notes ?? null,
			// Cache the ranges resolved on the shared generation path so the saved
			// Step matches what the Plan Preview displayed (PRD #125).
			...intensityRangeColumns(step.resolvedIntensity),
		}
	}

	return {
		orderIndex: stepIndex,
		kind: 'rest',
		durationSec: step.durationSec ?? null,
		notes: step.notes ?? null,
	}
}
