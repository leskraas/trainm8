import { z } from 'zod'
import {
	CARDIO_DISCIPLINES,
	WORKOUT_INTENTS,
} from '#app/utils/workout-schema.ts'

/**
 * Plan-generation contract (PRD #103).
 *
 * trainm8 owns the model's output schema — we do not consume any loose external
 * `GeneratedProgram` shape. The model is driven via forced tool-use to emit JSON
 * matching this schema; output is Zod-validated and a still-invalid candidate is
 * rejected rather than previewed (see `generate.ts`).
 *
 * V1 is cardio only: `cardio`/`rest` steps, `durationSec` XOR `distanceM`, a
 * `WORKOUT_INTENTS` intent, and `zoneLabel` intensity keyed to the athlete's
 * recipe. Disciplines outside the cardio set and intents outside
 * `WORKOUT_INTENTS` are rejected by the enum checks below.
 */

// Generated intensity is always a zone label (resolved to concrete HR/power/pace
// ranges later, per ADR 0006). The model never emits raw bpm/watt/pace targets.
export const GeneratedIntensitySchema = z.object({
	kind: z.literal('zoneLabel'),
	label: z.string().min(1),
})

const cardioQuantityXor = (step: { durationSec?: number; distanceM?: number }) =>
	!(step.durationSec != null && step.distanceM != null)

export const GeneratedCardioStepSchema = z
	.object({
		kind: z.literal('cardio'),
		discipline: z.enum(CARDIO_DISCIPLINES),
		intensity: GeneratedIntensitySchema.optional(),
		durationSec: z.number().int().positive().optional(),
		distanceM: z.number().int().positive().optional(),
		notes: z.string().max(240).optional(),
	})
	.refine(cardioQuantityXor, {
		message: 'A step cannot have both duration and distance',
		path: ['durationSec'],
	})

export const GeneratedRestStepSchema = z.object({
	kind: z.literal('rest'),
	durationSec: z.number().int().positive().optional(),
	notes: z.string().max(240).optional(),
})

export const GeneratedStepSchema = z.union([
	GeneratedCardioStepSchema,
	GeneratedRestStepSchema,
])
export type GeneratedStep = z.infer<typeof GeneratedStepSchema>

export const GeneratedBlockSchema = z.object({
	name: z.string().max(60).optional(),
	repeatCount: z.number().int().min(1).default(1),
	steps: z.array(GeneratedStepSchema).min(1, 'A block must have at least one step'),
})
export type GeneratedBlock = z.infer<typeof GeneratedBlockSchema>

/**
 * A generated session is schedule-agnostic: it carries a 0-based `weekIndex` and
 * an `orderInWeek` ordinal, not a concrete date. The pure scheduling helper maps
 * these onto the athlete's trainable weekdays + default time (see `schedule.ts`),
 * so date placement stays out of the model contract.
 */
export const GeneratedSessionSchema = z.object({
	weekIndex: z.number().int().min(0),
	orderInWeek: z.number().int().min(0).default(0),
	title: z.string().min(1).max(120),
	discipline: z.enum(CARDIO_DISCIPLINES),
	intent: z.enum(WORKOUT_INTENTS),
	blocks: z.array(GeneratedBlockSchema).min(1, 'A session must have at least one block'),
})
export type GeneratedSession = z.infer<typeof GeneratedSessionSchema>

// Plan Outline: periodized phases spanning now → horizon, each with a weekly
// load pattern. Persisted on the Event on approve (a later slice); here it is
// transient preview data.
export const PlanPhaseSchema = z.object({
	name: z.string().min(1).max(60),
	weeks: z.number().int().min(1),
	focus: z.string().min(1).max(240),
	weeklyLoadHours: z.number().nonnegative(),
})
export type PlanPhase = z.infer<typeof PlanPhaseSchema>

export const PlanOutlineSchema = z.object({
	phases: z.array(PlanPhaseSchema).min(1, 'An outline must have at least one phase'),
})
export type PlanOutline = z.infer<typeof PlanOutlineSchema>

export const GeneratedPlanSchema = z.object({
	outline: PlanOutlineSchema,
	sessions: z.array(GeneratedSessionSchema).min(1, 'A plan must have at least one session'),
})
export type GeneratedPlan = z.infer<typeof GeneratedPlanSchema>

// ── Wizard inputs ──────────────────────────────────────────────────────────

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
	beginner: 'Beginner',
	intermediate: 'Intermediate',
	advanced: 'Advanced',
}

export const PlanGenerationInputSchema = z.object({
	// Non-cardio disciplines are rejected here (cardio-only V1).
	disciplines: z
		.array(z.enum(CARDIO_DISCIPLINES))
		.min(1, 'Select at least one discipline')
		.transform((ds) => [...new Set(ds)]),
	experience: z.enum(EXPERIENCE_LEVELS),
	goal: z.string().min(1, 'Describe your goal').max(500),
	horizonWeeks: z.coerce.number().int().min(1).max(52),
})
export type PlanGenerationInput = z.infer<typeof PlanGenerationInputSchema>
