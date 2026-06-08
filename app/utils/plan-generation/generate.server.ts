import { parseTrainableWeekdays } from '#app/utils/athlete-schema.ts'
import { getOrCreateAthleteProfile } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	buildAthleteModelContext,
	createAnthropicModelClient,
	isOAuthToken,
} from './anthropic-client.ts'
import { persistApprovedPlan } from './approve.server.ts'
import { persistExtendedWindow } from './extend.server.ts'
import { generatePlan, type GenerateOptions } from './generate.ts'
import { createStubModelClient, type PlanModelClient } from './model-client.ts'
import {
	buildPlanPreview,
	type IntensityResolution,
	type PlanPreview,
	type PreviewSession,
	type ProfilesByDiscipline,
} from './preview.ts'
import {
	nextDetailWindow,
	scheduleSessions,
	type TrainingAvailability,
} from './schedule.ts'
import {
	PlanGenerationInputSchema,
	PlanOutlineSchema,
	type GeneratedPlan,
	type PlanGenerationInput,
} from './schema.ts'

type AthleteProfile = Awaited<ReturnType<typeof getOrCreateAthleteProfile>>

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Derive the plan horizon in whole weeks from `now` → an Event's start date
 * (PRD #103, user story 3). When the athlete anchors a generation to an existing
 * Target Event, the Event's date is authoritative — the horizon is the time
 * remaining until it, rounded up to a whole week and clamped to the wizard's
 * 1..52 range so a past or far-future Event still yields a usable plan.
 */
export function horizonWeeksUntil(eventStart: Date, now: Date): number {
	const weeks = Math.ceil((eventStart.getTime() - now.getTime()) / (7 * DAY_MS))
	return Math.min(52, Math.max(1, weeks))
}

/**
 * Resolve the effective horizon for a generation. With no Target Event the
 * wizard's chosen `horizonWeeks` stands; with one, the horizon is derived from
 * that Event's date (ownership-scoped lookup). A missing/foreign Event falls
 * back to the wizard horizon here — the preview persists nothing, and approval
 * re-verifies ownership before writing.
 */
async function resolveHorizonWeeks(
	userId: string,
	input: PlanGenerationInput,
	targetEventId: string | null,
	now: Date,
): Promise<number> {
	if (!targetEventId) return input.horizonWeeks
	const event = await prisma.event.findFirst({
		where: { id: targetEventId, athleteId: userId },
		select: { startDate: true },
	})
	return event ? horizonWeeksUntil(event.startDate, now) : input.horizonWeeks
}

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

/** The schedule-and-resolve context shared by preview, approve, and extend. */
type GenerationContext = {
	profile: AthleteProfile
	/** Weeks the plan spans from `startDate`; sessions beyond it are dropped. */
	horizonWeeks: number
	/** Anchor instant for week 0 (now for preview/approve, the window for extend). */
	startDate: Date
}

/**
 * The one internal entrypoint that turns a generated plan into scheduled,
 * intensity-resolved sessions (PRD #121, #125, user story 15). It derives
 * Training Availability from the Athlete Profile, schedules the sessions onto
 * concrete dates, and resolves each Step's Intensity Target against the profile
 * — the single path the preview, approve, and extend flows all run through, so
 * what the athlete previews is exactly what gets saved.
 *
 * Resolution is pure and in-memory; should it throw, the sessions still schedule
 * (unresolved) and `resolution: 'failed'` is returned so the persistence seam can
 * surface it rather than swallowing it.
 */
function scheduleForGeneration(
	plan: GeneratedPlan,
	context: GenerationContext,
): { sessions: PreviewSession[]; resolution: IntensityResolution } {
	const scheduled = scheduleSessions(
		plan,
		availabilityFromProfile(context.profile),
		{ startDate: context.startDate, horizonWeeks: context.horizonWeeks },
	)

	try {
		const preview = buildPlanPreview(
			plan.outline,
			scheduled,
			profilesByDiscipline(context.profile),
		)
		return { sessions: preview.sessions, resolution: 'resolved' }
	} catch {
		// Resolution failed: keep the scheduled sessions (no resolved ranges) so the
		// plan is still usable/saveable, and surface the failure at the seam.
		const sessions: PreviewSession[] = scheduled.map((session) => ({
			...session,
			blocks: session.blocks.map((block) => ({ ...block, steps: block.steps })),
		}))
		return { sessions, resolution: 'failed' }
	}
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
	options: GenerateOptions & {
		client?: PlanModelClient
		targetEventId?: string | null
		now?: Date
	} = {},
): Promise<GeneratePreviewResult> {
	const { onProgress, targetEventId = null, now = new Date() } = options

	const profile = await getOrCreateAthleteProfile(userId)

	// Anchoring to an existing Target Event makes its date authoritative: the
	// horizon is derived from now → Event start rather than the wizard input.
	const horizonWeeks = await resolveHorizonWeeks(
		userId,
		input,
		targetEventId,
		now,
	)
	input = { ...input, horizonWeeks }

	// Default to the real hosted-Claude client when a credential is configured
	// (Fly), falling back to the deterministic stub locally/in CI. Tests inject a
	// fake. Two credential shapes are supported: a standard API key
	// (ANTHROPIC_API_KEY, `sk-ant-api03-…`) or a Claude Code OAuth token
	// (CLAUDE_CODE_OAUTH_TOKEN, `sk-ant-oat01-…`) for developers with only a
	// Claude subscription. An oat token mistakenly placed in ANTHROPIC_API_KEY is
	// detected by prefix and routed as OAuth rather than 401-ing. The prompt is
	// built from this athlete's zone profiles so generated zone labels resolve
	// (ADR 0006).
	const credential =
		process.env.CLAUDE_CODE_OAUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY
	const client =
		options.client ??
		(credential
			? createAnthropicModelClient({
					...(isOAuthToken(credential)
						? { oauthToken: credential }
						: { apiKey: credential }),
					athleteContext: buildAthleteModelContext(
						input.disciplines,
						profile.disciplineProfiles,
					),
				})
			: createStubModelClient())

	const result = await generatePlan(client, input, { onProgress })
	if (!result.ok) return result

	const { sessions } = scheduleForGeneration(result.plan, {
		profile,
		horizonWeeks: input.horizonWeeks,
		startDate: now,
	})

	return { ok: true, preview: { outline: result.plan.outline, sessions } }
}

export type ApprovePlanResult =
	| {
			ok: true
			eventId: string
			generationId: string
			sessionIds: string[]
			/** Whether Intensity Target resolution succeeded for the saved sessions. */
			resolution: IntensityResolution
	  }
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
		/**
		 * Regeneration: replace the future, still-scheduled, generated sessions
		 * anchored to the (existing) Target Event rather than only appending.
		 * Edit-adopted (`authored`) and completed/skipped/missed sessions survive.
		 */
		regenerate?: boolean
	} = {},
): Promise<ApprovePlanResult> {
	const {
		client = createStubModelClient(),
		targetEventId = null,
		now = new Date(),
		regenerate = false,
	} = options

	// A chosen Target Event's date is authoritative: derive the horizon from
	// now → Event start so the Plan Outline and scheduling span the real run-up.
	const horizonWeeks = await resolveHorizonWeeks(
		userId,
		input,
		targetEventId,
		now,
	)
	input = { ...input, horizonWeeks }

	const result = await generatePlan(client, input)
	if (!result.ok) return result

	const profile = await getOrCreateAthleteProfile(userId)
	const { sessions, resolution } = scheduleForGeneration(result.plan, {
		profile,
		horizonWeeks: input.horizonWeeks,
		startDate: now,
	})

	try {
		const persisted = await persistApprovedPlan(userId, {
			input,
			outline: result.plan.outline,
			sessions,
			resolution,
			generatedByModel: client.modelId,
			targetEventId,
			now,
			replaceFutureGenerated: regenerate,
		})
		return { ok: true, ...persisted }
	} catch {
		return {
			ok: false,
			error: 'The plan could not be saved. Please try again.',
		}
	}
}

export type ExtendPlanResult =
	| {
			ok: true
			extended: true
			eventId: string
			generationId: string
			sessionIds: string[]
			/** Whether Intensity Target resolution succeeded for the saved sessions. */
			resolution: IntensityResolution
	  }
	/** The Outline is fully detailed — extend is a no-op. */
	| { ok: true; extended: false }
	| { ok: false; error: string }

/**
 * Detail the next phase of an existing plan's stored Plan Outline (PRD #103,
 * user story 21 / #110).
 *
 * Instead of materializing the whole horizon up front, the athlete extends the
 * plan when they are ready: this reads the Plan Outline stored on the Event,
 * works out the next undetailed window from the already-materialized sessions,
 * generates and schedules just that window through Training Availability, and
 * persists it anchored to the same Event with `generated` provenance — the same
 * persistence path as approve. When the Outline is fully detailed the action is a
 * no-op (`extended: false`). Existing sessions are never touched.
 *
 * The model client is injectable so tests can pass a fake; the stub re-derives a
 * deterministic window. Session content is regenerated against the stored
 * Outline's disciplines/horizon; the stored Outline itself is left unchanged.
 */
export async function extendGeneratedPlan(
	userId: string,
	eventId: string,
	options: { client?: PlanModelClient; now?: Date } = {},
): Promise<ExtendPlanResult> {
	const { client = createStubModelClient(), now = new Date() } = options

	const event = await prisma.event.findFirst({
		where: { id: eventId, athleteId: userId },
		select: { id: true, name: true, disciplines: true, planOutline: true },
	})
	if (!event || !event.planOutline) {
		return { ok: false, error: 'This plan cannot be extended.' }
	}

	let outline
	try {
		outline = PlanOutlineSchema.parse(JSON.parse(event.planOutline))
	} catch {
		return { ok: false, error: 'This plan cannot be extended.' }
	}
	const totalWeeks = outline.phases.reduce((sum, phase) => sum + phase.weeks, 0)

	const existing = await prisma.workoutSession.findMany({
		where: { userId, targetEventId: eventId, source: 'generated' },
		select: { scheduledAt: true },
	})
	const window = nextDetailWindow(
		existing.map((s) => s.scheduledAt),
		totalWeeks,
		now,
	)
	if (!window) return { ok: true, extended: false }

	const input = reconstructInput(event.name, event.disciplines, totalWeeks)
	if (!input) return { ok: false, error: 'This plan cannot be extended.' }

	const result = await generatePlan(client, input)
	if (!result.ok) return result

	const profile = await getOrCreateAthleteProfile(userId)
	// The stored Outline is authoritative; we keep it and only schedule the
	// regenerated sessions into the next window's calendar weeks.
	const { sessions, resolution } = scheduleForGeneration(result.plan, {
		profile,
		horizonWeeks: window.remainingWeeks,
		startDate: window.startDate,
	})
	if (sessions.length === 0) return { ok: true, extended: false }

	try {
		const persisted = await persistExtendedWindow(userId, {
			eventId,
			sessions,
			resolution,
			generatedByModel: client.modelId,
			generatedAt: now,
		})
		if (persisted.sessionIds.length === 0) return { ok: true, extended: false }
		return { ok: true, extended: true, eventId, ...persisted }
	} catch {
		return {
			ok: false,
			error: 'The plan could not be extended. Please try again.',
		}
	}
}

/**
 * Rebuild the generation input from a stored Event so the next window can be
 * generated. Experience is not persisted on the Event and does not affect
 * generated session content (only the Outline's weekly load, which we keep), so
 * it defaults to `intermediate`. Returns null when the Event's disciplines are
 * not parseable cardio disciplines.
 */
function reconstructInput(
	name: string,
	disciplinesJson: string,
	totalWeeks: number,
): PlanGenerationInput | null {
	let disciplines: unknown
	try {
		disciplines = JSON.parse(disciplinesJson)
	} catch {
		return null
	}

	const parsed = PlanGenerationInputSchema.safeParse({
		disciplines,
		experience: 'intermediate',
		goal: name,
		horizonWeeks: Math.min(Math.max(totalWeeks, 1), 52),
	})
	return parsed.success ? parsed.data : null
}
