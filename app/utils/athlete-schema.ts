import { z } from 'zod'
import { type Discipline } from './workout-schema.ts'
import { BUILT_IN_RECIPES } from './zones/recipes.ts'

/**
 * A built-in **Zone Recipe** id. Recipes are versioned reference data in code
 * (ADR 0006), so the accepted set is read off `BUILT_IN_RECIPES` rather than
 * written out here — a recipe that ships is pickable the day it ships, and one
 * that never shipped can never be stored.
 *
 * Which recipes belong to which **Discipline** is not checked here, because this
 * schema does not carry the discipline; the form that does checks it (see
 * {@link recipeBelongsToDiscipline}).
 */
export const ZoneRecipeIdSchema = z
	.string()
	.refine((id) => BUILT_IN_RECIPES.some((recipe) => recipe.id === id), {
		message: 'Unknown zone recipe',
	})

/** Whether a recipe id is one of `discipline`'s — a cross-field form check. */
export function recipeBelongsToDiscipline(
	id: string,
	discipline: Discipline,
): boolean {
	return BUILT_IN_RECIPES.some(
		(recipe) => recipe.id === id && recipe.discipline === discipline,
	)
}

export const DisciplineThresholdSchema = z.object({
	maxHr: z.number().int().min(80).max(220).optional(),
	lthr: z.number().int().min(80).max(220).optional(),
	ftp: z.number().int().min(50).max(600).optional(),
	runPowerThresholdW: z.number().int().min(50).max(600).optional(),
	thresholdPaceSecPerKm: z.number().int().min(150).max(600).optional(),
	cssSecPer100m: z.number().int().min(60).max(250).optional(),
	/**
	 * The **Zone Recipe** this discipline's targets are read on (#454).
	 *
	 * The one field here that is *not* a threshold, and the one the app is allowed
	 * to fill on the athlete's behalf: a recipe is **shape** — which ladder their
	 * own numbers sit on — where every other field on this schema is a **size**, a
	 * number about this athlete that only they can supply. Submitting it is
	 * authoring it; omitting it leaves whatever is stored alone, and on a profile
	 * being created for the first time hands the per-discipline default (see
	 * `app/utils/zones/defaults.ts`).
	 */
	zoneSystem: ZoneRecipeIdSchema.optional(),
	enabled: z.boolean().optional(),
	preferCogganTss: z.boolean().optional(),
	preferRTSS: z.boolean().optional(),
})
export type DisciplineThresholdInput = z.infer<typeof DisciplineThresholdSchema>

// Training Availability (PRD #103).
// Weekday numbers follow the rest of the athlete profile: 0=Sun … 6=Sat (ADR 0005).
export const TrainableWeekdaysSchema = z.preprocess(
	// A hidden form sentinel submits an empty string so the field is always present,
	// letting the athlete clear every weekday; drop it before numeric coercion
	// (otherwise "" would coerce to 0 = Sunday).
	(value) => (Array.isArray(value) ? value.filter((v) => v !== '') : value),
	z
		.array(z.coerce.number().int().min(0).max(6))
		// de-dupe and sort so persisted order is stable regardless of form ordering
		.transform((days) => [...new Set(days)].sort((a, b) => a - b)),
)

// 24-hour "HH:MM" local time, interpreted in the athlete timezone.
export const DefaultTrainingTimeSchema = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour HH:MM time')

/**
 * The clock time a scheduled session lands on when the athlete has not set a
 * **Default Training Time** — a documented **convention**, never a stored
 * default (ADR 0044 §4). A null column means "I have not said", so the value is
 * resolved here at read time and the athlete's own answer, when they give one,
 * is visibly theirs rather than an edit to a number the app had already written.
 *
 * Early morning because the session's *day* is what the plan states and the hour
 * is only a place to put it: a time before the working day is the one an athlete
 * is least likely to read as the app having scheduled something for them.
 */
export const DEFAULT_TRAINING_TIME = '07:00'

/**
 * The **Weekly Capacity** in hours per Training Week (ADR 0050).
 *
 * Bounded rather than open: a capacity is hours in a week, and a week holds 168 of
 * them. The upper bound is deliberately loose — it exists to catch a mistyped
 * `500` rather than to have an opinion about how much an athlete may train — and
 * the lower bound is **exclusive of zero**, because "no hours at all" is not a
 * capacity to size a plan against; an athlete saying that is saying they are not
 * training, which is the absent value rather than a stated one.
 *
 * Nothing here derives the number. The derivation lives in `proposal.ts` and is
 * read **once**, at authoring time (ADR 0040 §6); this only guards what the
 * athlete typed.
 */
export const WeeklyCapacityHoursSchema = z.number().positive().max(168)

export const AthleteProfileUpdateSchema = z.object({
	timezone: z.string().min(1).max(100).optional(),
	weekStartsOn: z.number().int().min(0).max(6).optional(),
	preferredUnits: z.enum(['metric', 'imperial']).optional(),
	birthdate: z.coerce.date().nullable().optional(),
	weightKg: z.number().positive().max(500).nullable().optional(),
	trainableWeekdays: TrainableWeekdaysSchema.optional(),
	// An empty time input ('') means "cleared", not an invalid time — map it to null
	// before the HH:MM check. An omitted field stays undefined (left untouched).
	defaultTrainingTime: z
		.preprocess(
			(v) => (v === '' ? null : v),
			DefaultTrainingTimeSchema.nullable(),
		)
		.optional(),
	// The **Weekly Capacity**, with `defaultTrainingTime`'s tri-state discipline and
	// for the same reason (ADR 0050): an emptied box means "cleared" and stores
	// `null`, an omitted field leaves the stored value alone, and `null` is never
	// set — which the hours fit check reads as unavailable rather than as passing.
	weeklyCapacityHours: z
		.preprocess(
			(v) => (v === '' ? null : v),
			WeeklyCapacityHoursSchema.nullable(),
		)
		.optional(),
})
export type AthleteProfileUpdate = z.infer<typeof AthleteProfileUpdateSchema>

/**
 * Parse the persisted `trainableWeekdays` JSON column back into weekday numbers.
 * Tolerates null/empty/malformed values (returns `[]`) so a never-set or corrupt
 * profile never crashes the read path.
 */
export function parseTrainableWeekdays(value: string | null): number[] {
	if (!value) return []
	try {
		const parsed: unknown = JSON.parse(value)
		if (!Array.isArray(parsed)) return []
		return parsed.filter(
			(n): n is number => typeof n === 'number' && n >= 0 && n <= 6,
		)
	} catch {
		return []
	}
}
