import { prisma } from '#app/utils/db.server.ts'
import { type IntensityTarget } from '#app/utils/workout-schema.ts'
import {
	resolveIntensity,
	type DisciplineProfileForResolver,
} from '#app/utils/zones/index.ts'
import {
	computePlannedTss,
	type PlannedTssProfile,
	type PlannedTssStep,
	type PlannedTssWorkout,
} from './planned-tss.ts'

// Planned TSS is materialized on the Workout Session (ADR 0019), never computed
// per render. It is kept fresh by recomputing on prescription edits (the steps
// changed) and on threshold changes (the resolved ranges shifted). Like the
// rest of the load math this is synchronous — fine for a SQLite hobby project.

const disciplineProfileSelect = {
	discipline: true,
	lthr: true,
	maxHr: true,
	ftp: true,
	thresholdPaceSecPerKm: true,
	cssSecPer100m: true,
	zoneSystem: true,
	zoneOverrides: true,
	preferCogganTss: true,
	preferRTSS: true,
} as const

type DbDisciplineProfile = {
	discipline: string
	lthr: number | null
	maxHr: number | null
	ftp: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
	zoneSystem: string | null
	zoneOverrides: string | null
	preferCogganTss: boolean
	preferRTSS: boolean
}

type DbStep = {
	kind: string
	discipline: string | null
	intensity: string | null
	durationSec: number | null
	distanceM: number | null
}

type DbWorkout = {
	discipline: string
	blocks: Array<{ repeatCount: number; steps: DbStep[] }>
}

type ResolvedRanges = {
	intensityHrMin: number | null
	intensityHrMax: number | null
	intensityPowerMin: number | null
	intensityPowerMax: number | null
	intensityPaceMin: number | null
	intensityPaceMax: number | null
}

const EMPTY_RANGES: ResolvedRanges = {
	intensityHrMin: null,
	intensityHrMax: null,
	intensityPowerMin: null,
	intensityPowerMax: null,
	intensityPaceMin: null,
	intensityPaceMax: null,
}

/**
 * Resolve a step's authored intensity fresh from the athlete's current profile.
 * We resolve here rather than reading the cached `intensity*` columns so Planned
 * TSS is correct immediately after a prescription edit — the authoring path does
 * not refresh those columns, and a stale cache would silently under-report.
 */
function resolveStepRanges(
	step: DbStep,
	dp: DbDisciplineProfile | undefined,
): ResolvedRanges {
	if (step.kind !== 'cardio' || !step.intensity || !dp) return EMPTY_RANGES
	let authored: IntensityTarget
	try {
		authored = JSON.parse(step.intensity) as IntensityTarget
	} catch {
		return EMPTY_RANGES
	}
	const resolverProfile: DisciplineProfileForResolver = {
		lthr: dp.lthr,
		maxHr: dp.maxHr,
		ftp: dp.ftp,
		thresholdPaceSecPerKm: dp.thresholdPaceSecPerKm,
		cssSecPer100m: dp.cssSecPer100m,
		zoneSystem: dp.zoneSystem,
		zoneOverrides: dp.zoneOverrides,
	}
	const r = resolveIntensity(authored, resolverProfile)
	if (r.unavailable) return EMPTY_RANGES
	return {
		intensityHrMin: r.hrMin ?? null,
		intensityHrMax: r.hrMax ?? null,
		intensityPowerMin: r.powerMin ?? null,
		intensityPowerMax: r.powerMax ?? null,
		intensityPaceMin: r.paceMin ?? null,
		intensityPaceMax: r.paceMax ?? null,
	}
}

function toPlannedWorkout(
	workout: DbWorkout,
	profiles: DbDisciplineProfile[],
): PlannedTssWorkout {
	return {
		discipline: workout.discipline,
		blocks: workout.blocks.map((block) => ({
			repeatCount: block.repeatCount,
			steps: block.steps.map((step): PlannedTssStep => {
				const dp = profiles.find(
					(p) => p.discipline === (step.discipline ?? workout.discipline),
				)
				return {
					kind: step.kind,
					discipline: step.discipline,
					intensity: step.intensity,
					durationSec: step.durationSec,
					distanceM: step.distanceM,
					...resolveStepRanges(step, dp),
				}
			}),
		})),
	}
}

function toPlannedProfile(profiles: DbDisciplineProfile[]): PlannedTssProfile {
	return {
		disciplineProfiles: profiles.map((p) => ({
			discipline: p.discipline,
			lthr: p.lthr,
			maxHr: p.maxHr,
			ftp: p.ftp,
			thresholdPaceSecPerKm: p.thresholdPaceSecPerKm,
			cssSecPer100m: p.cssSecPer100m,
			preferCogganTss: p.preferCogganTss,
			preferRTSS: p.preferRTSS,
		})),
	}
}

async function getProfiles(userId: string): Promise<DbDisciplineProfile[]> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { disciplineProfiles: { select: disciplineProfileSelect } },
	})
	return profile?.disciplineProfiles ?? []
}

const workoutInclude = {
	blocks: {
		select: {
			repeatCount: true,
			steps: {
				select: {
					kind: true,
					discipline: true,
					intensity: true,
					durationSec: true,
					distanceM: true,
				},
			},
		},
	},
} as const

/** Recompute and persist Planned TSS for a single session (owner-scoped). */
export async function recomputePlannedTssForSession(
	userId: string,
	sessionId: string,
): Promise<void> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			id: true,
			workout: { select: { discipline: true, ...workoutInclude } },
		},
	})
	if (!session) return
	const profiles = await getProfiles(userId)
	await persist(session.id, session.workout, profiles)
}

/** Recompute and persist Planned TSS for every session the athlete owns. */
export async function recomputePlannedTssForUser(
	userId: string,
): Promise<void> {
	const profiles = await getProfiles(userId)
	const sessions = await prisma.workoutSession.findMany({
		where: { userId },
		select: {
			id: true,
			workout: { select: { discipline: true, ...workoutInclude } },
		},
	})
	await Promise.all(sessions.map((s) => persist(s.id, s.workout, profiles)))
}

async function persist(
	sessionId: string,
	workout: DbWorkout | null,
	profiles: DbDisciplineProfile[],
): Promise<void> {
	const result = workout
		? computePlannedTss(
				toPlannedWorkout(workout, profiles),
				toPlannedProfile(profiles),
			)
		: null
	await prisma.workoutSession.update({
		where: { id: sessionId },
		data: {
			plannedTssValue: result?.tss ?? null,
			plannedTssConfidence: result?.confidence ?? null,
		},
	})
}
