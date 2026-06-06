import { parseTrainableWeekdays } from '#app/utils/athlete-schema.ts'
import { getOrCreateAthleteProfile } from '#app/utils/athlete.server.ts'
import { generatePlan, type GenerateOptions } from './generate.ts'
import { createStubModelClient, type PlanModelClient } from './model-client.ts'
import {
	buildPlanPreview,
	type PlanPreview,
	type ProfilesByDiscipline,
} from './preview.ts'
import { scheduleSessions, type TrainingAvailability } from './schedule.ts'
import { type PlanGenerationInput } from './schema.ts'

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

	const availability: TrainingAvailability = {
		trainableWeekdays: parseTrainableWeekdays(profile.trainableWeekdays),
		// Default to 18:00 when the athlete has not set a training time, so the
		// preview still places sessions rather than silently dropping them.
		defaultTrainingTime: profile.defaultTrainingTime ?? '18:00',
		timezone: profile.timezone,
	}

	const scheduled = scheduleSessions(result.plan, availability, {
		startDate: new Date(),
		horizonWeeks: input.horizonWeeks,
	})

	// The full Prisma discipline profile structurally satisfies the resolver's
	// narrower contract; the typed map exposes only the fields it reads.
	const profiles: ProfilesByDiscipline = {}
	for (const dp of profile.disciplineProfiles) {
		profiles[dp.discipline as keyof ProfilesByDiscipline] = dp
	}

	return {
		ok: true,
		preview: buildPlanPreview(result.plan.outline, scheduled, profiles),
	}
}
