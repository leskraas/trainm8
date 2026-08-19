import { z } from 'zod'
import { parseDistance, parseDuration } from '#app/utils/format.ts'
import { parseAuthoredIntensity } from '#app/utils/intensity-target.ts'
import {
	CARDIO_DISCIPLINES,
	DISCIPLINES,
	EffortCapSchema,
	IntensityTargetSchema,
	LoadTargetSchema,
	WORKOUT_INTENTS,
	type CardioDiscipline,
	type EffortCap,
	type IntensityTarget,
	type LoadTarget,
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
	/**
	 * The authored **Load Target** as JSON — the general form, carried through
	 * the form so an edit elsewhere on the session preserves it (ADR 0056).
	 *
	 * It has to be the union and not the `weightKg`/`pct1RM` pair below, because
	 * the pair is a lossy projection of it: four of the six load kinds have no
	 * column to land in and a `85–90 % 1RM` range collapses to its minimum. A
	 * form without this field turned every save into a rewrite that answered
	 * `load: null`, so the first inline autosave destroyed a `4 × 8 @ 8RM`.
	 */
	load: z.string().optional(),
	weightKg: z.string().optional(),
	pct1RM: z.string().optional(),
	/** The authored **Effort Cap** as JSON, carried for the same reason. */
	effortCap: z.string().optional(),
	/** The authored tempo (`3-0-3`), carried for the same reason. */
	tempo: z.string().optional(),
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
export const INTENSITY_HINT = 'Complete the intensity target or clear it'

export const FormSchema = z
	.object({
		title: z.string().min(1, 'Title is required').max(120),
		discipline: z.enum(DISCIPLINES),
		intent: z.enum(WORKOUT_INTENTS),
		scheduledAtDate: z.string().min(1, 'Date is required'),
		scheduledAtTime: z.string().min(1, 'Time is required'),
		// Legacy compatibility only (ADR 0027 §6): the simple/structured toggle
		// was removed from the UI, which now always submits `structured` blocks
		// (a new session starts as a one-step sentence). The `simple` shape — one
		// humane duration/distance pair that becomes a single-step structured
		// session — is still accepted so old payloads keep validating. Default
		// stays `simple` for any caller that omits the field.
		structure: z.enum(STRUCTURE_MODES).default('simple'),
		duration: z.string().optional(),
		distance: z.string().optional(),
		blocks: z.array(FormBlockSchema).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.structure === 'structured') {
			// Zero blocks deliberately passes this first pass (workout-editor
			// spec §11.6): saving an empty session is allowed and posts, and the
			// server's second-pass `WorkoutAuthoringSchema` answers the 400 with
			// the one summary-line message ("Add at least one step…") — a
			// client-side rule here would swallow the submit instead.
			value.blocks?.forEach((block, blockIndex) => {
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
					// An authored intensity must be a parseable Intensity Target
					// (canonical JSON or a legacy plain zone label). An incomplete
					// editor draft fails here as a field error instead of being
					// silently dropped by the form → Step mapper.
					if (
						step.intensity?.trim() &&
						parseAuthoredIntensity(step.intensity) == null
					) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: path('intensity'),
							message: INTENSITY_HINT,
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

/**
 * The authored **Load Target** parsed back out of its form carrier.
 *
 * Unparseable JSON reads as *no union*, which sends the set back through the
 * legacy `weightKg`/`pct1RM` pair below rather than through a validation error
 * the athlete has no control to clear: nothing in the editor types this field,
 * so the only ways to get here are a stored row the current schema no longer
 * accepts or a hand-made post, and wedging every save on a session whose load
 * the athlete cannot even see would be worse than the projection.
 */
export function parseLoadTarget(json: string | undefined): LoadTarget | null {
	if (!json?.trim()) return null
	try {
		const result = LoadTargetSchema.safeParse(JSON.parse(json))
		return result.success ? result.data : null
	} catch {
		return null
	}
}

/** The authored **Effort Cap** parsed back out of its carrier, same rule. */
export function parseEffortCap(json: string | undefined): EffortCap | null {
	if (!json?.trim()) return null
	try {
		const result = EffortCapSchema.safeParse(JSON.parse(json))
		return result.success ? result.data : null
	} catch {
		return null
	}
}

/**
 * Eccentric-pause-concentric, as `ExerciseSetSchema` spells it. Checked here so
 * a stored value the schema would reject travels no further — the alternative
 * is a 400 on every autosave of a session with no control that can fix it.
 */
const TEMPO_PATTERN = /^[0-9X]+-[0-9X]+-[0-9X]+$/

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
			// A per-step discipline override (G6). Unlike cardio there is no
			// inherit-the-workout fallback: the workout's own discipline may be
			// 'strength', which is not a per-step cardio override.
			discipline: CARDIO_DISCIPLINES.includes(
				(step.discipline ?? '') as CardioDiscipline,
			)
				? (step.discipline as CardioDiscipline)
				: undefined,
			exerciseId: step.exerciseId || '',
			sets: (step.sets ?? []).map((set, i) => {
				const setKind = (set.kind || 'reps') as 'reps' | 'timed' | 'amrap'
				const load = parseLoadTarget(set.load)
				const effortCap = parseEffortCap(set.effortCap)
				const tempo = set.tempo?.trim()
				// A set states its load once (`loadXorLegacy`): where the union is
				// there it wins and the legacy pair falls silent; where it is not, the
				// pair is what the set still says.
				const base = {
					orderIndex: set.orderIndex ? Number(set.orderIndex) : i,
					load: load ?? undefined,
					weightKg:
						load == null && set.weightKg ? Number(set.weightKg) : undefined,
					pct1RM: load == null && set.pct1RM ? Number(set.pct1RM) : undefined,
					effortCap: effortCap ?? undefined,
					tempo: tempo && TEMPO_PATTERN.test(tempo) ? tempo : undefined,
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
		// parseAuthoredIntensity, not parseIntensityTarget: a legacy plain zone
		// label round-trips as a zoneLabel target instead of being dropped.
		intensity: parseAuthoredIntensity(step.intensity) ?? undefined,
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
		load: '',
		weightKg: '',
		pct1RM: '',
		effortCap: '',
		tempo: '',
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
