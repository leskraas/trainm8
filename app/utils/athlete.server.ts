import { rederiveHrPhaseBarsForDiscipline } from './activity-telemetry.server.ts'
import { localDate } from './athlete-calendar.ts'
import {
	type AthleteProfileUpdate,
	type DisciplineThresholdInput,
} from './athlete-schema.ts'
import { prisma } from './db.server.ts'
import { recomputePlannedTssForUser } from './load/planned-tss.server.ts'
import { recomputeLoadFrom } from './load/snapshot.server.ts'
import { CARDIO_DISCIPLINES, type Discipline } from './workout-schema.ts'
import { recomputeIntensityRanges } from './workout.server.ts'
import { zoneRecipeFieldsForNewProfile } from './zones/defaults.ts'

const THRESHOLD_KIND_MAP = {
	maxHr: 'maxHr',
	lthr: 'lthr',
	ftp: 'ftp',
	runPowerThresholdW: 'runPower',
	thresholdPaceSecPerKm: 'thresholdPace',
	cssSecPer100m: 'css',
} as const satisfies Record<
	keyof Omit<
		DisciplineThresholdInput,
		// `zoneSystem` is deliberately not a threshold: it carries no measurement of
		// this athlete, so it writes no ThresholdEvent and defaults where a threshold
		// never could (#454).
		'enabled' | 'preferCogganTss' | 'preferRTSS' | 'zoneSystem'
	>,
	string
>

/**
 * The Athlete Timezone (IANA) from the Athlete Profile, used for calendar-day
 * attribution through the Athlete Calendar helpers. Degrades to `'UTC'` only
 * when the athlete has no profile — never a guessed zone (the same
 * honest-degradation rule the Strava sync/webhook/backfill paths apply).
 */
export async function getAthleteTimezone(userId: string): Promise<string> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	return profile?.timezone ?? 'UTC'
}

/**
 * Lay down a **Discipline Profile** per cardio **Discipline** for an athlete
 * missing any, carrying the default **Zone Recipe** and nothing else (#454).
 *
 * A default that only landed on rows that already exist would reach almost
 * nobody: the sole app-code writer of this table is
 * {@link setDisciplineThresholds}, so an athlete who has never opened
 * `/settings/training` has no rows at all, and every **Volume Conversion** and
 * every metric **Intensity Target** for them stays an **Unavailable Metric**.
 *
 * **The row asserts nothing about the athlete.** Every threshold column stays
 * null, which is precisely what "they have not told us their FTP" means, and the
 * recipe it does carry is stamped `source: 'default'` so no surface can mistake
 * it for a choice they made. It says nothing about whether they train the
 * discipline either — `/settings/training` has always shown all three.
 *
 * Idempotent, and cheap: one read, and a write only on the first call.
 */
async function ensureCardioDisciplineProfiles(athleteProfileId: string) {
	const existing = await prisma.disciplineProfile.findMany({
		where: { athleteProfileId },
		select: { discipline: true },
	})
	const have = new Set(existing.map((row) => row.discipline))
	const missing = CARDIO_DISCIPLINES.filter(
		(discipline) => !have.has(discipline),
	)
	if (missing.length === 0) return
	// `createMany`'s `skipDuplicates` is unsupported on SQLite, so the guard above
	// is the whole of the de-duplication.
	await prisma.disciplineProfile.createMany({
		data: missing.map((discipline) => ({
			athleteProfileId,
			discipline,
			...zoneRecipeFieldsForNewProfile(discipline),
		})),
	})
}

export async function getOrCreateAthleteProfile(userId: string) {
	const profile = await prisma.athleteProfile.upsert({
		where: { userId },
		create: { userId },
		update: {},
		select: { id: true },
	})
	await ensureCardioDisciplineProfiles(profile.id)
	return prisma.athleteProfile.findUniqueOrThrow({
		where: { id: profile.id },
		include: { disciplineProfiles: true },
	})
}

export async function updateAthleteProfile(
	userId: string,
	patch: AthleteProfileUpdate,
) {
	// `trainableWeekdays` is a number[] in the API but a JSON string column in the DB.
	// Serialize it only when present so an omitted field leaves the stored value alone.
	const { trainableWeekdays, ...rest } = patch
	const data = {
		...rest,
		...(trainableWeekdays !== undefined
			? { trainableWeekdays: JSON.stringify(trainableWeekdays) }
			: {}),
	}
	const profile = await prisma.athleteProfile.upsert({
		where: { userId },
		create: { userId, ...data },
		update: data,
	})
	await ensureCardioDisciplineProfiles(profile.id)
	return profile
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

		// The **Zone Recipe** travels with its provenance, so the two are split out
		// of the patch and rejoined per branch (#454): submitting one is authoring
		// it, and creating a profile without one takes the discipline's default.
		// Omitting it on an update leaves both columns alone — an athlete saving a
		// threshold has not restated their recipe.
		const { zoneSystem, ...thresholds } = patch
		const updated = await tx.disciplineProfile.upsert({
			where: {
				athleteProfileId_discipline: { athleteProfileId, discipline },
			},
			create: {
				athleteProfileId,
				discipline,
				...thresholds,
				...zoneRecipeFieldsForNewProfile(discipline, zoneSystem),
			},
			update: {
				...thresholds,
				...(zoneSystem
					? { zoneSystem, zoneSystemSource: 'athlete' as const }
					: {}),
			},
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
			const fromDateStr = localDate(earliestSession.scheduledAt, timezone)
			void recomputeLoadFrom(userId, fromDateStr)
		}

		return updated
	})

	// Re-resolve cached intensity ranges for all cardio steps in this discipline,
	// then refresh Planned TSS (resolved ranges shifted, so the prescribed stress
	// did too — ADR 0019). Fire-and-forget: caller gets the updated profile
	// immediately; errors are logged. Synchronous-enough for SQLite hobby project.
	recomputeIntensityRanges(userId, discipline)
		.then(() => recomputePlannedTssForUser(userId))
		.catch((err: unknown) => {
			console.error('[recompute after threshold change] failed:', err)
		})

	// A new/changed LTHR moves every HR-zone boundary: re-derive the phase bars
	// on this discipline's recordings from their stored streams, so recordings
	// imported before the threshold existed finally show their intensity shape.
	// Fire-and-forget like the recomputes above.
	if (patch.lthr != null) {
		rederiveHrPhaseBarsForDiscipline(userId, discipline, patch.lthr).catch(
			(err: unknown) => {
				console.error(
					'[phase-bar re-derivation after LTHR change] failed:',
					err,
				)
			},
		)
	}

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
