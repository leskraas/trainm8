// Strength in the start, on the server (#574, spec #558, ADR 0103): what the
// one tap is pre-set to, and the session a lifting day copies.

import { stockWorkoutId } from '../catalogue-corpus.all.ts'
import { prisma } from '../db.server.ts'
import { liftDisplayName } from '../exercise-aliases-nb.ts'
import { liftSchemeLabel } from '../labels.ts'
import { readStrengthTrackOffer } from '../plan-outline/history.server.ts'
import { type StartStrengthSession } from './start-draft.ts'

/**
 * The Catalogue's full-body **Stock Workout** a lifting day copies where the
 * athlete has no strength session of their own to copy: _Anatomical
 * adaptation, full body A_ (ACSM 2026), the corpus's beginner full-body row.
 */
export const START_STOCK_STRENGTH_KEY = 'strength-S1'

export type StartStrengthReading = {
	/** The Workout every lifting day copies. */
	workoutId: string
	session: StartStrengthSession
	/** The sets the session prescribes, which the track's anchor is read from. */
	setsPerSession: number
	/**
	 * Strength sessions a week in the lifting history, where the strength
	 * offer reads one (`readStrengthTrackOffer`); null without one.
	 */
	fromHistory: number | null
}

/**
 * What the start's strength needs: the athlete's history's frequency, and the
 * session to lift — their most recent strength session's Workout, or else the
 * full-body Stock Workout. Null where there is neither, and then _styrke_
 * cannot lay a day.
 */
export async function readStartStrength(
	userId: string,
	now: Date = new Date(),
): Promise<StartStrengthReading | null> {
	const [offer, recent] = await Promise.all([
		readStrengthTrackOffer(userId, now),
		prisma.workoutSession.findFirst({
			where: {
				userId,
				status: 'completed',
				scheduledAt: { lte: now },
				workoutId: { not: null },
				workout: { discipline: 'strength' },
			},
			orderBy: { scheduledAt: 'desc' },
			select: { workoutId: true },
		}),
	])
	const workoutId =
		recent?.workoutId ?? stockWorkoutId(START_STOCK_STRENGTH_KEY)
	const workout = await prisma.workout.findUnique({
		where: { id: workoutId },
		select: {
			id: true,
			title: true,
			discipline: true,
			blocks: {
				orderBy: { orderIndex: 'asc' },
				select: {
					steps: {
						orderBy: { orderIndex: 'asc' },
						where: { kind: 'strength' },
						select: {
							exerciseId: true,
							exercise: { select: { name: true } },
							sets: { select: { reps: true } },
						},
					},
				},
			},
		},
	})
	if (!workout || workout.discipline !== 'strength') return null
	const steps = workout.blocks.flatMap((block) => block.steps)
	const lifts = steps.flatMap((step) => {
		if (!step.exercise || step.sets.length === 0) return []
		const reps = step.sets[0]!.reps
		const agree = step.sets.every((set) => set.reps === reps)
		return [
			`${liftDisplayName(step.exerciseId, step.exercise.name)} ${liftSchemeLabel(
				step.sets.length,
				agree ? reps : null,
			)}`,
		]
	})
	return {
		workoutId: workout.id,
		session: { title: workout.title, lifts },
		setsPerSession: steps.reduce((sum, step) => sum + step.sets.length, 0),
		fromHistory: offer?.sessionsPerWeek ?? null,
	}
}
