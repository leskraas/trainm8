import { z } from 'zod'
import { type Discipline } from './workout-schema.ts'
import { prisma } from './db.server.ts'
import { recomputeIntensityRanges } from './workout.server.ts'
import { recomputeLoadFrom } from './load/snapshot.server.ts'

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

const THRESHOLD_KIND_MAP = {
	maxHr: 'maxHr',
	lthr: 'lthr',
	ftp: 'ftp',
	thresholdPaceSecPerKm: 'thresholdPace',
	cssSecPer100m: 'css',
} as const satisfies Record<
	keyof Omit<
		DisciplineThresholdInput,
		'enabled' | 'preferCogganTss' | 'preferRTSS'
	>,
	string
>

export async function getOrCreateAthleteProfile(userId: string) {
	return prisma.athleteProfile.upsert({
		where: { userId },
		create: { userId },
		update: {},
		include: { disciplineProfiles: true },
	})
}

export async function updateAthleteProfile(
	userId: string,
	patch: AthleteProfileUpdate,
) {
	return prisma.athleteProfile.upsert({
		where: { userId },
		create: { userId, ...patch },
		update: patch,
	})
}

export async function setDisciplineThresholds(
	userId: string,
	discipline: Discipline,
	patch: DisciplineThresholdInput,
) {
	const result = await prisma.$transaction(async (tx) => {
		const athleteProfile = await tx.athleteProfile.upsert({
			where: { userId },
			create: { userId },
			update: {},
			select: { id: true },
		})
		const athleteProfileId = athleteProfile.id

		const existing = await tx.disciplineProfile.findUnique({
			where: {
				athleteProfileId_discipline: { athleteProfileId, discipline },
			},
		})

		const updated = await tx.disciplineProfile.upsert({
			where: {
				athleteProfileId_discipline: { athleteProfileId, discipline },
			},
			create: { athleteProfileId, discipline, ...patch },
			update: patch,
		})

		for (const field of Object.keys(THRESHOLD_KIND_MAP) as Array<
			keyof typeof THRESHOLD_KIND_MAP
		>) {
			const newValue = patch[field]
			if (newValue == null) continue
			const oldValue = existing?.[field]
			if (oldValue === newValue) continue

			await tx.thresholdEvent.create({
				data: {
					athleteProfileId,
					discipline,
					kind: THRESHOLD_KIND_MAP[field],
					valueNumeric: newValue,
					source: 'manual',
					effectiveAt: new Date(),
				},
			})
		}

		// Recompute LoadSnapshots from the earliest recorded session so
		// historical TSS re-resolves with the new threshold (ADR 0008).
		const earliestSession = await tx.workoutSession.findFirst({
			where: { userId },
			orderBy: { scheduledAt: 'asc' },
			select: { scheduledAt: true },
		})
		if (earliestSession) {
			const timezone =
				(
					await tx.athleteProfile.findUnique({
						where: { userId },
						select: { timezone: true },
					})
				)?.timezone ?? 'UTC'
			const fmt = new Intl.DateTimeFormat('en-CA', {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			})
			const fromDateStr = fmt.format(earliestSession.scheduledAt)
			void recomputeLoadFrom(userId, fromDateStr)
		}

		return updated
	})

	// Re-resolve cached intensity ranges for all cardio steps in this discipline.
	// Fire-and-forget: caller gets the updated profile immediately; errors are logged.
	// Synchronous-enough for SQLite hobby project (no queue needed).
	recomputeIntensityRanges(userId, discipline).catch((err: unknown) => {
		console.error('[recomputeIntensityRanges] failed:', err)
	})

	return result
}

export async function getThresholdHistory(
	userId: string,
	discipline?: Discipline,
) {
	const athleteProfile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { id: true },
	})
	if (!athleteProfile) return []

	return prisma.thresholdEvent.findMany({
		where: {
			athleteProfileId: athleteProfile.id,
			...(discipline ? { discipline } : {}),
		},
		orderBy: { effectiveAt: 'desc' },
	})
}
