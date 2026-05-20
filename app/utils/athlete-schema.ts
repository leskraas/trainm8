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

export const AthleteProfileUpdateSchema = z.object({
	timezone: z.string().min(1).max(100).optional(),
	weekStartsOn: z.number().int().min(0).max(6).optional(),
	preferredUnits: z.enum(['metric', 'imperial']).optional(),
	birthdate: z.coerce.date().nullable().optional(),
	weightKg: z.number().positive().max(500).nullable().optional(),
})
export type AthleteProfileUpdate = z.infer<typeof AthleteProfileUpdateSchema>
