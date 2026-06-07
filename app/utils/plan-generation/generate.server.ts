import { parseTrainableWeekdays } from '#app/utils/athlete-schema.ts'
import { getOrCreateAthleteProfile } from '#app/utils/athlete.server.ts'
import { persistApprovedPlan } from './approve.server.ts'
import { generatePlan, type GenerateOptions } from './generate.ts'
import { createStubModelClient, type PlanModelClient } from './model-client.ts'
import {
	buildPlanPreview,
	type PlanPreview,
	type ProfilesByDiscipline,
} from './preview.ts'
import {
	scheduleSessions,
	type ScheduledSession,
	type TrainingAvailability,
} from './schedule.ts'
import { type GeneratedPlan, type PlanGenerationInput } from './schema.ts'

type AthleteProfile = Awaited<ReturnType<typeof getOrCreateAthleteProfile>>

/** Training Availability from a profile, defaulting time so sessions still place. */
function availabilityFromProfile(
	profile: AthleteProfile,
): TrainingAvailability {
	return {
		trainableWeekdays: parseTrainableWeekdays(profile.trainableWeekdays),
		// Default to 18:00 when the athlete has not set a training time, so we
		// still place sessions rather than silently dropping them.
		defaultTrainingTime: profile.defaultTrainingTime ?? '18:00',
		timezone: profile.timezone,
	}
}

/** Map a profile's discipline profiles into the resolver-shaped lookup. */
function profilesByDiscipline(profile: AthleteProfile): ProfilesByDiscipline {
	// The full Prisma discipline profile structurally satisfies the resolver's
	// narrower contract; the typed map exposes only the fields it reads.
	const profiles: ProfilesByDiscipline = {}
	for (const dp of profile.disciplineProfiles) {
		profiles[dp.discipline as keyof ProfilesByDiscipline] = dp
	}
	return profiles
}

function scheduleForUser(
	plan: GeneratedPlan,
	profile: AthleteProfile,
	horizonWeeks: number,
	startDate: Date,
): ScheduledSession[] {
	return scheduleSessions(plan, availabilityFromProfile(profile), {
		startDate,
		horizonWeeks,
	})
}

export type GeneratePreviewResult =
	| { ok: true; preview: PlanPreview }
	| { ok: false; error: string }

/**
 * End-to-end generate → preview pipe for an athlete (PRD #103, slice #105).
 *
 * Loads the athlete's Training Availability (#104) + Athlete Timezone + zone
 * profiles, runs orchestration against the injected model client (a stub for
 * this slice), schedules the validated plan into dated sessions, and resolves
 * zone-label intensities. Nothing is persisted — the preview is transient.
 *
 * The model client is injectable so route/integration tests can pass a fake.
 */
export async function generatePlanPreview(
	userId: string,
	input: PlanGenerationInput,
	options: GenerateOptions & { client?: PlanModelClient } = {},
): Promise<GeneratePreviewResult> {
	const { client = createStubModelClient(), onProgress } = options

	const result = await generatePlan(client, input, { onProgress })
	if (!result.ok) return result

	const profile = await getOrCreateAthleteProfile(userId)
	const scheduled = scheduleForUser(
		result.plan,
		profile,
		input.horizonWeeks,
		new Date(),
	)

	return {
		ok: true,
		preview: buildPlanPreview(
			result.plan.outline,
			scheduled,
			profilesByDiscipline(profile),
		),
	}
}

export type ApprovePlanResult =
	| { ok: true; eventId: string; generationId: string; sessionIds: string[] }
	| { ok: false; error: string }

/**
 * Generate → schedule → persist an approved plan for an athlete (PRD #103).
 *
 * The commit model is preview → approve → persist: this runs the same
 * deterministic orchestration as the preview, then persists the result —
 * auto-creating a `fitness-goal` Target Event when none is supplied, writing the
 * Plan Outline, and materializing the scheduled sessions as Workouts + Workout
 * Sessions with `generated` provenance. The model client is injectable so tests
 * can pass a fake; the stub re-derives the previewed plan deterministically.
 */
export async function approveGeneratedPlan(
	userId: string,
	input: PlanGenerationInput,
	options: {
		client?: PlanModelClient
		targetEventId?: string | null
		now?: Date
	} = {},
): Promise<ApprovePlanResult> {
	const {
		client = createStubModelClient(),
		targetEventId = null,
		now = new Date(),
	} = options

	const result = await generatePlan(client, input)
	if (!result.ok) return result

	const profile = await getOrCreateAthleteProfile(userId)
	const scheduled = scheduleForUser(
		result.plan,
		profile,
		input.horizonWeeks,
		now,
	)

	try {
		const persisted = await persistApprovedPlan(userId, {
			input,
			outline: result.plan.outline,
			sessions: scheduled,
			generatedByModel: client.modelId,
			targetEventId,
			now,
		})
		return { ok: true, ...persisted }
	} catch {
		return {
			ok: false,
			error: 'The plan could not be saved. Please try again.',
		}
	}
}
