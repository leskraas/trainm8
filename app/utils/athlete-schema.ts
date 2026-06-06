import { z } from 'zod'

export const DisciplineThresholdSchema = z.object({
	maxHr: z.number().int().min(80).max(220).optional(),
	lthr: z.number().int().min(80).max(220).optional(),
	ftp: z.number().int().min(50).max(600).optional(),
	thresholdPaceSecPerKm: z.number().int().min(150).max(600).optional(),
	cssSecPer100m: z.number().int().min(60).max(250).optional(),
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
