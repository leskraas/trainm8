import { z } from 'zod'
import { parseDistance, parseDuration } from '#app/utils/format.ts'
import {
	CARDIO_DISCIPLINES,
	DISCIPLINES,
	IntensityTargetSchema,
	WORKOUT_INTENTS,
	type CardioDiscipline,
	type IntensityTarget,
	type StepKind,
} from '#app/utils/workout-schema.ts'

// ——— Form schema (Zod) ——————————————————————————————————————————————
// Form fields arrive as strings; the schema is intentionally loose and the
// mapper below coerces them into Step/Block domain shapes. Duration and
// distance fields are humane text ("40 min", "8 km") parsed through the
// shared format layer (#176, ADR 0023) — canonical seconds/metres exist only
// past this boundary.

export const STRUCTURE_MODES = ['simple', 'structured'] as const
export type StructureMode = (typeof STRUCTURE_MODES)[number]

export const FormSetSchema = z.object({
	kind: z.string().optional(),
	orderIndex: z.string().optional(),
	weightKg: z.string().optional(),
	pct1RM: z.string().optional(),
	reps: z.string().optional(),
	durationSec: z.string().optional(),
})

export const FormStepSchema = z.object({
	kind: z.string().optional(),
	discipline: z.string().optional(),
	intensity: z.string().optional(),
	duration: z.string().optional(),
	distance: z.string().optional(),
	exerciseId: z.string().optional(),
	restBetweenSetsSec: z.string().optional(),
	sets: z.array(FormSetSchema).optional(),
	notes: z.string().optional(),
})

export const FormBlockSchema = z.object({
	name: z.string().optional(),
	repeatCount: z.string().optional(),
	steps: z.array(FormStepSchema).min(1, 'A block must have at least one step'),
})

const DURATION_HINT = 'Enter a duration like "40 min" or "1 h 30 min"'
const DISTANCE_HINT = 'Enter a distance like "8 km"'
const STEP_DISTANCE_HINT = 'Enter a distance like "400 m" or "1.2 km"'

export const FormSchema = z
	.object({
		title: z.string().min(1, 'Title is required').max(120),
		discipline: z.enum(DISCIPLINES),
		intent: z.enum(WORKOUT_INTENTS),
		scheduledAtDate: z.string().min(1, 'Date is required'),
		scheduledAtTime: z.string().min(1, 'Time is required'),
		// Simple mode is the default: one humane duration/distance pair that
		// becomes a single-step structured session. "Add structure" switches the
		// form to the full Block/Step editor.
		structure: z.enum(STRUCTURE_MODES).default('simple'),
		duration: z.string().optional(),
		distance: z.string().optional(),
		blocks: z.array(FormBlockSchema).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.structure === 'structured') {
			if (!value.blocks || value.blocks.length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['blocks'],
					message: 'A structured workout needs at least one block',
				})
				return
			}
			value.blocks.forEach((block, blockIndex) => {
				block.steps.forEach((step, stepIndex) => {
					const path = (field: string) => [
						'blocks',
						blockIndex,
						'steps',
						stepIndex,
						field,
					]
					if (step.duration && parseDuration(step.duration) == null) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: path('duration'),
							message: DURATION_HINT,
						})
					}
					if (
						step.distance &&
						parseDistance(step.distance, { defaultUnit: 'm' }) == null
					) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: path('distance'),
							message: STEP_DISTANCE_HINT,
						})
					}
					if (step.duration && step.distance) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: path('duration'),
							message: 'A step cannot have both duration and distance',
						})
					}
				})
			})
			return
		}

		// Simple mode.
		if (value.discipline === 'strength') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['discipline'],
				message:
					'Strength sessions need exercises — use "Add structure" to pick them',
			})
		}
		const duration = value.duration?.trim() ?? ''
		const distance = value.distance?.trim() ?? ''
		if (!duration && !distance) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['duration'],
				message: 'Enter a duration (e.g. "40 min") or a distance (e.g. "8 km")',
			})
			return
		}
		if (duration && distance) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['duration'],
				message: 'Enter either a duration or a distance, not both',
			})
			return
		}
		if (duration && parseDuration(duration) == null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['duration'],
				message: DURATION_HINT,
			})
		}
		if (distance && parseDistance(distance) == null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['distance'],
				message: DISTANCE_HINT,
			})
		}
	})

export type FormValue = z.infer<typeof FormSchema>

// ——— Form → Step/Block mapper ————————————————————————————————————————

export function parseIntensityTarget(
	json: string | undefined,
): IntensityTarget | undefined {
	if (!json) return undefined
	try {
		const result = IntensityTargetSchema.safeParse(JSON.parse(json))
		return result.success ? result.data : undefined
	} catch {
		return undefined
	}
}

function toCardioDiscipline(discipline: string): CardioDiscipline {
	return CARDIO_DISCIPLINES.includes(discipline as CardioDiscipline)
		? (discipline as CardioDiscipline)
		: 'run'
}

export function buildStepInput(
	step: z.infer<typeof FormStepSchema>,
	workoutDiscipline: string,
) {
	const kind = (step.kind || 'cardio') as StepKind

	if (kind === 'rest') {
		return {
			kind: 'rest' as const,
			durationSec: step.duration
				? (parseDuration(step.duration) ?? undefined)
				: undefined,
			notes: step.notes || undefined,
		}
	}

	if (kind === 'strength') {
		return {
			kind: 'strength' as const,
			exerciseId: step.exerciseId || '',
			sets: (step.sets ?? []).map((set, i) => {
				const setKind = (set.kind || 'reps') as 'reps' | 'timed' | 'amrap'
				const base = {
					orderIndex: set.orderIndex ? Number(set.orderIndex) : i,
					weightKg: set.weightKg ? Number(set.weightKg) : undefined,
					pct1RM: set.pct1RM ? Number(set.pct1RM) : undefined,
				}
				if (setKind === 'reps') {
					return {
						...base,
						kind: 'reps' as const,
						reps: set.reps ? Number(set.reps) : 1,
					}
				}
				if (setKind === 'timed') {
					return {
						...base,
						kind: 'timed' as const,
						durationSec: set.durationSec ? Number(set.durationSec) : 30,
					}
				}
				return { ...base, kind: 'amrap' as const }
			}),
			restBetweenSetsSec: step.restBetweenSetsSec
				? Number(step.restBetweenSetsSec)
				: undefined,
			notes: step.notes || undefined,
		}
	}

	return {
		kind: 'cardio' as const,
		discipline: toCardioDiscipline(step.discipline || workoutDiscipline),
		intensity: parseIntensityTarget(step.intensity),
		durationSec: step.duration
			? (parseDuration(step.duration) ?? undefined)
			: undefined,
		distanceM: step.distance
			? (parseDistance(step.distance, { defaultUnit: 'm' }) ?? undefined)
			: undefined,
		notes: step.notes || undefined,
	}
}

/**
 * Map the validated form value to `WorkoutAuthoringSchema` block inputs. A
 * simple-mode submission becomes a single-step structured session (one block,
 * one cardio step) — the domain keeps canonical units and one schema.
 */
export function buildBlocksInput(value: FormValue) {
	if (value.structure === 'structured') {
		return (value.blocks ?? []).map((block) => ({
			name: block.name || undefined,
			repeatCount: block.repeatCount ? Number(block.repeatCount) : 1,
			steps: block.steps.map((step) => buildStepInput(step, value.discipline)),
		}))
	}

	const duration = value.duration?.trim()
	const distance = value.distance?.trim()
	return [
		{
			repeatCount: 1,
			steps: [
				{
					kind: 'cardio' as const,
					discipline: toCardioDiscipline(value.discipline),
					durationSec: duration
						? (parseDuration(duration) ?? undefined)
						: undefined,
					distanceM: distance
						? (parseDistance(distance) ?? undefined)
						: undefined,
				},
			],
		},
	]
}

// ——— Empty-form builders ——————————————————————————————————————————————

export function emptySet() {
	return {
		kind: 'reps',
		orderIndex: '0',
		reps: '5',
		weightKg: '',
		pct1RM: '',
		durationSec: '',
	}
}

export function emptyStep() {
	return {
		kind: 'cardio',
		discipline: '',
		intensity: '',
		duration: '',
		distance: '',
		exerciseId: '',
		restBetweenSetsSec: '',
		sets: [emptySet()],
		notes: '',
	}
}

export function emptyBlock() {
	return {
		name: '',
		repeatCount: '1',
		steps: [emptyStep()],
	}
}
