import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import { recomputePlannedTssForSession } from './load/planned-tss.server.ts'
import { triggerRecomputeForSession } from './session-log.server.ts'
import { deriveWorkoutTitle } from './session-title.ts'
import {
	type ExerciseSet,
	type IntensityTarget,
	type WorkoutAuthoringInput,
	type WorkoutStep,
	type WorkoutStructure,
	WorkoutStructureSchema,
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
			discipline: step.discipline ?? null,
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

/**
 * Build the nested Prisma `blocks.create` payload from a workout's structural
 * blocks. Shared by the authoring paths (which pass `WorkoutAuthoringInput`
 * blocks) and detection materialization (which passes the identically-shaped
 * `WorkoutStructure` blocks), so a detected structure persists into a real
 * Workout with no translation (ADR 0032).
 */
export function buildBlocksCreate(blocks: WorkoutStructure['blocks']) {
	return blocks.map((block, blockIndex) => ({
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
					blocks: { create: buildBlocksCreate(input.blocks) },
				},
			})
		}

		return tx.workoutSession.update({
			where: { id: session.id },
			data: {
				scheduledAt: input.scheduledAt,
				// The athlete rewrote the prescription, so a Replan Note explaining
				// the old one is stale — cleared (ADR 0025 §4). The WeekReplan row
				// stands untouched: at-most-once lives there, not in the notes.
				replanReason: null,
				// Editing a machine-produced session adopts it: the Session Source
				// flips to `authored`. For a Generated Session this permanently
				// excludes it from future regeneration (PRD #103 / ADR 0016); for a
				// `detected` session it retires the "detected · (confidence)" badge
				// once the athlete corrects the structure (ADR 0033). Other sources
				// are left untouched.
				...(session.source === 'generated' || session.source === 'detected'
					? { source: 'authored' }
					: {}),
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
				blocks: { create: buildBlocksCreate(input.blocks) },
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

/**
 * Parse a stored `WorkoutDetection.structureJson` back into the validated
 * `WorkoutStructure` shape. Tolerant of a malformed/legacy blob — degrades to
 * `null` (no materialization), never throws.
 */
export function parseStoredWorkoutStructure(
	structureJson: string,
): WorkoutStructure | null {
	try {
		const parsed = WorkoutStructureSchema.safeParse(JSON.parse(structureJson))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/**
 * Materialize a Structure Detection onto a recording-only session as its
 * Workout, marking the Session Source `detected` (ADR 0032/0033). Called by the
 * structure-detection job when a detection clears the honesty gate and its
 * import is already promoted to a recording-only session.
 *
 * The authoring envelope the structural schema omits (`title`, `intent`) is
 * synthesized: it carries no analytic weight — a `detected` session never
 * computes Planned TSS (ADR 0034), so `intent` never feeds load — and the
 * "detected · (confidence)" badge, not the intent label, is the provenance
 * signal on the Workout Detail View.
 *
 * Idempotent and non-destructive: a session that already carries a Workout is
 * left untouched (a re-run of the detection job never double-materializes, and
 * an athlete's adopted edits are never overwritten). Deliberately does NOT
 * recompute Planned TSS — the guard in `planned-tss.server.ts` keeps it null
 * for `detected` sessions regardless, but skipping the call avoids the churn.
 */
export async function materializeDetectedStructure(
	ownerId: string,
	sessionId: string,
	structure: WorkoutStructure,
): Promise<{ materialized: boolean }> {
	return prisma.$transaction(async (tx) => {
		const session = await tx.workoutSession.findFirst({
			where: { id: sessionId, userId: ownerId },
			select: { id: true, workoutId: true },
		})
		if (!session || session.workoutId) return { materialized: false }

		const workout = await tx.workout.create({
			data: {
				title: deriveWorkoutTitle(structure),
				discipline: structure.discipline,
				intent: 'endurance',
				ownerId,
				blocks: { create: buildBlocksCreate(structure.blocks) },
			},
			select: { id: true },
		})

		// Compare-and-swap the attach: only claim a session that is still
		// structureless. If a concurrent materialize (the job racing the promotion
		// path, or an overlapping retry) already attached a Workout, we lost — roll
		// back our now-orphaned Workout rather than clobbering theirs.
		const { count } = await tx.workoutSession.updateMany({
			where: { id: session.id, workoutId: null },
			data: { workoutId: workout.id, source: 'detected' },
		})
		if (count === 0) {
			await tx.workout.delete({ where: { id: workout.id } })
			return { materialized: false }
		}

		return { materialized: true }
	})
}

/**
 * Replace a `detected` session's materialized Workout with a freshly re-detected
 * structure (#357 — ADR 0032's engine-version re-detection). Called by the
 * structure-detection job when a re-run over an already-`detected` session yields
 * new structure: the version-aware backfill after an `analyze` change, or the
 * manual "Re-run detection" control.
 *
 * Strictly guarded so the athlete's edits stay sacred — it only ever touches a
 * session whose Session Source is still `detected`. An adopted `authored` session
 * (ADR 0033), or any `generated`/`recorded` session, is left untouched. The swap
 * repoints the session to the new Workout first, then deletes the superseded one
 * (whose blocks/steps/sets cascade): deleting the old Workout while the session
 * still referenced it would take the session down with it (the `workoutId` FK is
 * `onDelete: Cascade`).
 */
export async function replaceDetectedStructure(
	ownerId: string,
	sessionId: string,
	structure: WorkoutStructure,
): Promise<{ replaced: boolean }> {
	return prisma.$transaction(async (tx) => {
		const session = await tx.workoutSession.findFirst({
			where: { id: sessionId, userId: ownerId, source: 'detected' },
			select: { id: true, workoutId: true },
		})
		if (!session) return { replaced: false }

		const workout = await tx.workout.create({
			data: {
				title: deriveWorkoutTitle(structure),
				discipline: structure.discipline,
				intent: 'endurance',
				ownerId,
				blocks: { create: buildBlocksCreate(structure.blocks) },
			},
			select: { id: true },
		})

		// Compare-and-swap on `source`: only claim a session that is still
		// `detected`. If it adopted to `authored` between the read and here, we lost
		// the race — roll back the now-orphaned Workout rather than clobber the edit.
		const { count } = await tx.workoutSession.updateMany({
			where: { id: session.id, source: 'detected' },
			data: { workoutId: workout.id },
		})
		if (count === 0) {
			await tx.workout.delete({ where: { id: workout.id } })
			return { replaced: false }
		}

		// The session now points at the new Workout, so the old one is unreferenced
		// and safe to delete (blocks/steps/sets cascade). Order matters: the FK is
		// `onDelete: Cascade`, so deleting it before the repoint would delete the
		// session too.
		if (session.workoutId && session.workoutId !== workout.id) {
			await tx.workout.delete({ where: { id: session.workoutId } })
		}

		return { replaced: true }
	})
}

/**
 * Revert a `detected` session to a structureless `recorded` one, removing its
 * materialized Workout (#357). Called when a re-detect over an already-`detected`
 * session now reads below the honesty gate — the stale structure must not outlive
 * the signal that justified it (mirroring the re-snapshot clear in the detection
 * job). Guarded to `detected` sessions so an adopted `authored` session is never
 * stripped; the Workout delete runs only after the session is repointed to null,
 * so the `onDelete: Cascade` FK never removes the session.
 */
export async function dematerializeDetectedStructure(
	ownerId: string,
	sessionId: string,
): Promise<{ cleared: boolean }> {
	return prisma.$transaction(async (tx) => {
		const session = await tx.workoutSession.findFirst({
			where: { id: sessionId, userId: ownerId, source: 'detected' },
			select: { id: true, workoutId: true },
		})
		if (!session) return { cleared: false }

		const { count } = await tx.workoutSession.updateMany({
			where: { id: session.id, source: 'detected' },
			data: { workoutId: null, source: 'recorded' },
		})
		if (count === 0) return { cleared: false }

		if (session.workoutId) {
			await tx.workout.delete({ where: { id: session.workoutId } })
		}
		return { cleared: true }
	})
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

/**
 * The exercise ids behind the athlete's most recent strength steps, most
 * recent first — the "Recent" group of the exercise combobox (ADR 0027 §8).
 * Purely derived at load time from the sessions the athlete already owns
 * (ordered by Scheduled At, newest first); no new stored state.
 */
export async function getRecentExerciseIds(userId: string, limit = 5) {
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			workout: {
				blocks: {
					some: {
						steps: { some: { kind: 'strength', exerciseId: { not: null } } },
					},
				},
			},
		},
		orderBy: { scheduledAt: 'desc' },
		// A window of recent sessions is plenty to fill the group; keeps the
		// traversal bounded for athletes with long histories.
		take: 25,
		select: {
			workout: {
				select: {
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: { kind: true, exerciseId: true },
							},
						},
					},
				},
			},
		},
	})

	const ids: string[] = []
	for (const session of sessions) {
		for (const block of session.workout?.blocks ?? []) {
			for (const step of block.steps) {
				if (
					step.kind === 'strength' &&
					step.exerciseId &&
					!ids.includes(step.exerciseId)
				) {
					ids.push(step.exerciseId)
					if (ids.length >= limit) return ids
				}
			}
		}
	}
	return ids
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
					runPowerThresholdW: true,
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
					runPowerThresholdW: true,
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
