import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import { recomputePlannedTssForSession } from './load/planned-tss.server.ts'
import { triggerRecomputeForSession } from './session-log.server.ts'
import {
	type ExerciseSet,
	type IntensityTarget,
	type WorkoutAuthoringInput,
	type WorkoutStep,
} from './workout-schema.ts'
import {
	resolveIntensity,
	type DisciplineProfileForResolver,
	type ResolvedIntensity,
} from './zones/index.ts'

function buildStepCreate(step: WorkoutStep, stepIndex: number) {
	const base = { orderIndex: stepIndex }

	if (step.kind === 'cardio') {
		return {
			...base,
			kind: 'cardio',
			discipline: step.discipline,
			intensity: step.intensity != null ? JSON.stringify(step.intensity) : null,
			durationSec: step.durationSec ?? null,
			distanceM: step.distanceM ?? null,
			notes: step.notes ?? null,
		}
	}

	if (step.kind === 'strength') {
		return {
			...base,
			kind: 'strength',
			exerciseId: step.exerciseId,
			restBetweenSetsSec: step.restBetweenSetsSec ?? null,
			notes: step.notes ?? null,
			sets: {
				create: step.sets.map((set: ExerciseSet) => ({
					orderIndex: set.orderIndex,
					kind: set.kind,
					weightKg: set.weightKg ?? null,
					pct1RM: set.pct1RM ?? null,
					reps: set.kind === 'reps' ? set.reps : null,
					durationSec: set.kind === 'timed' ? set.durationSec : null,
				})),
			},
		}
	}

	// rest
	return {
		...base,
		kind: 'rest',
		durationSec: (step as { durationSec?: number }).durationSec ?? null,
		notes: (step as { notes?: string }).notes ?? null,
	}
}

function buildBlocksCreate(input: WorkoutAuthoringInput) {
	return input.blocks.map((block, blockIndex) => ({
		name: block.name ?? null,
		orderIndex: blockIndex,
		repeatCount: block.repeatCount,
		steps: {
			create: block.steps.map(buildStepCreate),
		},
	}))
}

export async function deleteWorkoutSession(userId: string, sessionId: string) {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, workoutId: true },
	})

	if (!session) return null

	return prisma.$transaction(async (tx) => {
		await tx.workoutSession.delete({ where: { id: session.id } })
		if (session.workoutId) {
			await tx.workout.delete({ where: { id: session.workoutId } })
		}
		return { id: session.id }
	})
}

/**
 * Record a miss: mark a planned session `missed` — the minimal athlete-facing
 * Session Status transition (#186, PRD #163). Owner-scoped and non-destructive:
 * only the stored status changes (the prescription and any Session Log stay
 * untouched). Only valid while the session is still `scheduled`: a completed
 * session can never be marked, and re-marking an already-missed/skipped one is
 * rejected rather than re-firing the recompute. Recording the miss fires the
 * same load-recompute path logging a session does (ADR 0008), which runs the
 * Session Nudge applier — so a recorded key miss eases the next planned cardio
 * session at the moment it is recorded, never on a GET.
 *
 * Returns `null` when the session doesn't exist (or isn't the caller's), and
 * `{ marked: false }` when its status can't take the transition.
 */
export async function markSessionMissed(userId: string, sessionId: string) {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, status: true },
	})
	if (!session) return null
	if (session.status !== 'scheduled') return { marked: false as const }

	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { status: 'missed' },
	})
	await triggerRecomputeForSession(session.id, { clampFutureToToday: true })
	return { marked: true as const }
}

export async function getWorkoutSessionForEdit(
	userId: string,
	sessionId: string,
) {
	return prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			id: true,
			scheduledAt: true,
			status: true,
			source: true,
			workout: {
				select: {
					id: true,
					title: true,
					discipline: true,
					intent: true,
					blocks: {
						orderBy: { orderIndex: 'asc' as const },
						select: {
							id: true,
							name: true,
							repeatCount: true,
							orderIndex: true,
							steps: {
								orderBy: { orderIndex: 'asc' as const },
								select: {
									id: true,
									kind: true,
									discipline: true,
									intensity: true,
									durationSec: true,
									distanceM: true,
									exerciseId: true,
									restBetweenSetsSec: true,
									notes: true,
									orderIndex: true,
									sets: {
										orderBy: { orderIndex: 'asc' as const },
										select: {
											id: true,
											kind: true,
											orderIndex: true,
											weightKg: true,
											pct1RM: true,
											reps: true,
											durationSec: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
}

export async function updateWorkoutSession(
	userId: string,
	sessionId: string,
	input: WorkoutAuthoringInput,
) {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, workoutId: true, source: true },
	})

	if (!session) return null

	const updated = await prisma.$transaction(async (tx) => {
		if (session.workoutId) {
			await tx.workoutBlock.deleteMany({
				where: { workoutId: session.workoutId },
			})
			await tx.workout.update({
				where: { id: session.workoutId },
				data: {
					title: input.title,
					discipline: input.discipline,
					intent: input.intent,
					blocks: { create: buildBlocksCreate(input) },
				},
			})
		}

		return tx.workoutSession.update({
			where: { id: session.id },
			data: {
				scheduledAt: input.scheduledAt,
				// Editing a Generated Session adopts it: the Session Source flips to
				// `authored`, permanently excluding it from future regeneration
				// (PRD #103 / ADR 0016). Other sources are left untouched.
				...(session.source === 'generated' ? { source: 'authored' } : {}),
			},
			select: { id: true },
		})
	})

	// The prescription changed, so the Planned TSS it implies did too (ADR 0019).
	await recomputePlannedTssForSession(userId, session.id)

	return updated
}

export async function createWorkoutSession(
	userId: string,
	input: WorkoutAuthoringInput,
) {
	const session = await prisma.$transaction(async (tx) => {
		const workout = await tx.workout.create({
			data: {
				title: input.title,
				discipline: input.discipline,
				intent: input.intent,
				ownerId: userId,
				blocks: { create: buildBlocksCreate(input) },
			},
			select: { id: true },
		})

		return tx.workoutSession.create({
			data: {
				userId,
				workoutId: workout.id,
				scheduledAt: input.scheduledAt,
				status: 'scheduled',
			},
			select: { id: true },
		})
	})

	// Materialize the new session's Planned TSS up front (ADR 0019).
	await recomputePlannedTssForSession(userId, session.id)

	return session
}

export async function getExerciseCatalog(userId: string) {
	return prisma.exercise.findMany({
		where: {
			OR: [{ createdByAthleteId: null }, { createdByAthleteId: userId }],
		},
		select: {
			id: true,
			name: true,
			primaryMuscle: true,
			equipment: true,
			isCompound: true,
			createdByAthleteId: true,
		},
		orderBy: [{ name: 'asc' }],
	})
}

export async function createCustomExercise(
	userId: string,
	data: {
		name: string
		primaryMuscle: string
		equipment?: string
		isCompound?: boolean
	},
) {
	return prisma.exercise.create({
		data: {
			name: data.name,
			primaryMuscle: data.primaryMuscle,
			equipment: data.equipment ?? null,
			isCompound: data.isCompound ?? false,
			createdByAthleteId: userId,
		},
		select: { id: true, name: true },
	})
}

const EMPTY_INTENSITY_RANGES = {
	intensityHrMin: null as number | null,
	intensityHrMax: null as number | null,
	intensityPowerMin: null as number | null,
	intensityPowerMax: null as number | null,
	intensityPaceMin: null as number | null,
	intensityPaceMax: null as number | null,
}

function mapResolvedIntensity(
	r: ResolvedIntensity,
): typeof EMPTY_INTENSITY_RANGES {
	if (r.unavailable) return EMPTY_INTENSITY_RANGES
	return {
		intensityHrMin: r.hrMin ?? null,
		intensityHrMax: r.hrMax ?? null,
		intensityPowerMin: r.powerMin ?? null,
		intensityPowerMax: r.powerMax ?? null,
		intensityPaceMin: r.paceMin ?? null,
		intensityPaceMax: r.paceMax ?? null,
	}
}

function resolvedRangeFromIntensity(
	intensity: string | null,
	profile: DisciplineProfileForResolver,
): typeof EMPTY_INTENSITY_RANGES {
	if (!intensity) return EMPTY_INTENSITY_RANGES
	let target: IntensityTarget
	try {
		target = JSON.parse(intensity) as IntensityTarget
	} catch {
		return EMPTY_INTENSITY_RANGES
	}
	return mapResolvedIntensity(resolveIntensity(target, profile))
}

// Synchronous post-write hook: re-resolves cached intensity ranges for all
// of a user's cardio steps whenever their thresholds or zone system changes.
// SQLite + single-user hobby project → synchronous is acceptable here.
// In a multi-tenant/high-volume setup this would be enqueued as a background job.
export async function recomputeIntensityRanges(
	userId: string,
	discipline?: string,
) {
	const athleteProfile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: {
			disciplineProfiles: {
				where: discipline ? { discipline } : undefined,
				select: {
					discipline: true,
					lthr: true,
					maxHr: true,
					ftp: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
					zoneSystem: true,
					zoneOverrides: true,
				},
			},
		},
	})

	if (!athleteProfile) return

	// Find all workout steps for this user that are cardio steps with an intensity value
	const steps = await prisma.workoutStep.findMany({
		where: {
			kind: 'cardio',
			intensity: { not: null },
			block: {
				workout: {
					sessions: { some: { userId } },
				},
			},
			...(discipline ? { discipline } : {}),
		},
		select: {
			id: true,
			discipline: true,
			intensity: true,
		},
	})

	if (steps.length === 0) return

	const updates: Promise<unknown>[] = []
	for (const step of steps) {
		const profile = athleteProfile.disciplineProfiles.find(
			(p) => p.discipline === step.discipline,
		)
		if (!profile) continue

		const resolved = resolvedRangeFromIntensity(step.intensity, profile)
		updates.push(
			prisma.workoutStep.update({
				where: { id: step.id },
				data: resolved,
			}),
		)
	}

	await Promise.all(updates)
}

// Used when first writing a step — resolves intensity from the athlete's profile
// synchronously at write time (pre-populate cache).
export async function resolveStepIntensityForUser(
	userId: string,
	discipline: string,
	intensity: IntensityTarget,
): Promise<ReturnType<typeof resolvedRangeFromIntensity>> {
	const athleteProfile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: {
			disciplineProfiles: {
				where: { discipline },
				select: {
					lthr: true,
					maxHr: true,
					ftp: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
					zoneSystem: true,
					zoneOverrides: true,
				},
				take: 1,
			},
		},
	})

	const profile = athleteProfile?.disciplineProfiles[0]
	if (!profile) return EMPTY_INTENSITY_RANGES

	return mapResolvedIntensity(resolveIntensity(intensity, profile))
}

// Expose type for select queries that need step + resolved ranges
export type WorkoutStepSelect = Prisma.WorkoutStepSelect
