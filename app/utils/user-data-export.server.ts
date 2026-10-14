import { prisma } from './db.server.ts'
import { getUserImgSrc } from './misc.tsx'

/**
 * The athlete's data export: "Alt vi har lagret om deg, som én JSON-fil"
 * (`labels.ts`, settings → Dataene dine). GDPR Art. 15 (access) and Art. 20
 * (portability) need the whole training record, not just the account (#548).
 *
 * **Shape.** `tables` is keyed by Prisma model name, one array of rows each, so
 * the file maps one-to-one onto the schema and a reader can tell where every
 * row came from. Every table the schema ties to a user is either here or in
 * {@link USER_DATA_EXPORT_EXCLUSIONS}; `user-data-export.server.test.ts`
 * derives that list from the Prisma schema and fails on a new table that is in
 * neither, so a table cannot be left out silently.
 *
 * **Scoping.** Every query filters on the athlete's own ownership path (their
 * `userId` / `athleteId`, their athlete profile, their plan outline, their
 * workouts, their imports). A table is never reached through a shared row
 * (an exercise, a workout someone else may use), so another athlete's rows
 * cannot ride along.
 *
 * **Secrets stay out.** Provider tokens, the password hash and login-session
 * ids (the cookie value) are credentials, not information about the athlete,
 * and are never written to a file that may be shared onwards.
 *
 * When a new user-owned table lands (consent records, `McpAuditEvent`, agent
 * transcripts), add it here.
 */

/** User-owned tables deliberately not exported, and why. */
export const USER_DATA_EXPORT_EXCLUSIONS = {
	Password:
		'Only a bcrypt hash of the password: a credential, not information about the athlete.',
} as const satisfies Record<string, string>

type Row = Record<string, unknown>

/** BigInt and binary columns have no JSON form; give them a stable one. */
function toJsonSafe(value: unknown): unknown {
	if (typeof value === 'bigint') return value.toString()
	if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
	if (value instanceof Date || value == null) return value
	if (Array.isArray(value)) return value.map(toJsonSafe)
	if (typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, v]) => [key, toJsonSafe(v)]),
		)
	}
	return value
}

export async function exportUserData({
	userId,
	domain,
}: {
	userId: string
	domain: string
}) {
	const own = { userId }
	const athlete = { athleteId: userId }
	const profile = { athleteProfile: { userId } }
	const outline = { outline: { athleteId: userId } }
	const track = { track: { outline: { athleteId: userId } } }
	const workout = { workout: { ownerId: userId } }
	const session = { session: { userId } }
	const activityImport = { activityImport: { athleteId: userId } }
	const exercise = { exercise: { createdByAthleteId: userId } }
	const instance = { instance: { userId } }

	const [user, images] = await Promise.all([
		prisma.user.findUniqueOrThrow({
			where: { id: userId },
			include: { roles: { select: { name: true } } },
		}),
		prisma.userImage.findMany({
			where: own,
			select: {
				id: true,
				altText: true,
				objectKey: true,
				createdAt: true,
				updatedAt: true,
				userId: true,
			},
		}),
	])

	const tables: Record<string, Row[]> = {
		User: [user],
		UserImage: images.map((image) => ({
			...image,
			url: domain + getUserImgSrc(image.objectKey),
		})),
		// The session id is the login cookie's value: a bearer credential.
		Session: await prisma.session.findMany({ where: own, omit: { id: true } }),
		Connection: await prisma.connection.findMany({ where: own }),
		Passkey: await prisma.passkey.findMany({ where: own }),

		AthleteProfile: await prisma.athleteProfile.findMany({ where: own }),
		DisciplineProfile: await prisma.disciplineProfile.findMany({
			where: profile,
		}),
		PerformanceResult: await prisma.performanceResult.findMany({
			where: profile,
		}),
		ThresholdEvent: await prisma.thresholdEvent.findMany({ where: profile }),
		ExerciseThreshold: await prisma.exerciseThreshold.findMany({
			where: profile,
		}),
		PlateInventory: await prisma.plateInventory.findMany({ where: profile }),

		Event: await prisma.event.findMany({ where: athlete }),
		PlanOutline: await prisma.planOutline.findMany({ where: athlete }),
		PlanOutlinePhase: await prisma.planOutlinePhase.findMany({
			where: outline,
		}),
		TrainingTrack: await prisma.trainingTrack.findMany({ where: outline }),
		SeasonAnchorSegment: await prisma.seasonAnchorSegment.findMany({
			where: track,
		}),
		TrainingTrackSegment: await prisma.trainingTrackSegment.findMany({
			where: track,
		}),
		QualitySessionMixEntry: await prisma.qualitySessionMixEntry.findMany({
			where: { segment: track },
		}),
		WeekVolumeOverride: await prisma.weekVolumeOverride.findMany({
			where: track,
		}),
		WeekPattern: await prisma.weekPattern.findMany({ where: outline }),
		WeekPatternDay: await prisma.weekPatternDay.findMany({
			where: { pattern: outline },
		}),

		Workout: await prisma.workout.findMany({ where: { ownerId: userId } }),
		WorkoutBlock: await prisma.workoutBlock.findMany({ where: workout }),
		WorkoutStep: await prisma.workoutStep.findMany({
			where: { block: workout },
		}),
		ExerciseSet: await prisma.exerciseSet.findMany({
			where: { step: { block: workout } },
		}),
		CatalogueEntry: await prisma.catalogueEntry.findMany({ where: workout }),
		CatalogueEntryPhase: await prisma.catalogueEntryPhase.findMany({
			where: { entry: workout },
		}),
		CatalogueEntryGoalEvent: await prisma.catalogueEntryGoalEvent.findMany({
			where: { entry: workout },
		}),
		Attribution: await prisma.attribution.findMany({ where: workout }),
		CatalogueSave: await prisma.catalogueSave.findMany({
			where: { ownerId: userId },
		}),
		// The athlete's own reports whole; a report they resolved as a moderator
		// only as far as their own act goes. Its reason, detail and reporter are
		// the reporter's data, not the moderator's.
		WorkoutReport: [
			...(await prisma.workoutReport.findMany({
				where: { reporterId: userId },
			})),
			...(await prisma.workoutReport.findMany({
				where: {
					resolvedById: userId,
					// A reporter whose account is gone leaves `reporterId` null.
					OR: [{ reporterId: null }, { reporterId: { not: userId } }],
				},
				select: {
					id: true,
					workoutId: true,
					resolvedAt: true,
					resolution: true,
					resolvedById: true,
				},
			})),
		],

		Exercise: await prisma.exercise.findMany({
			where: { createdByAthleteId: userId },
		}),
		ExerciseVariant: await prisma.exerciseVariant.findMany({ where: exercise }),
		ExerciseAlias: await prisma.exerciseAlias.findMany({ where: exercise }),

		WorkoutSession: await prisma.workoutSession.findMany({ where: own }),
		SessionLog: await prisma.sessionLog.findMany({ where: session }),
		ExerciseSetLog: await prisma.exerciseSetLog.findMany({ where: session }),

		ActivityImport: await prisma.activityImport.findMany({ where: athlete }),
		ActivityStream: await prisma.activityStream.findMany({
			where: activityImport,
		}),
		WorkoutDetection: await prisma.workoutDetection.findMany({
			where: activityImport,
		}),
		// Every other source that delivered an activity (ADR 0096 §3).
		ActivityImportAlias: await prisma.activityImportAlias.findMany({
			where: athlete,
		}),
		// The original files, byte for byte (base64 in the JSON, like any binary).
		ActivityFile: await prisma.activityFile.findMany({
			where: activityImport,
		}),
		// The connection without its credentials.
		AccountConnection: await prisma.accountConnection.findMany({
			where: athlete,
			omit: { accessToken: true, refreshToken: true },
		}),

		LoadSnapshot: await prisma.loadSnapshot.findMany({ where: athlete }),
		LoadRecomputeNotice: await prisma.loadRecomputeNotice.findMany({
			where: athlete,
		}),
		WeekReplan: await prisma.weekReplan.findMany({ where: athlete }),
		WeekReplanProposal: await prisma.weekReplanProposal.findMany({
			where: athlete,
		}),

		ProgramInstance: await prisma.programInstance.findMany({ where: own }),
		ProgramSessionApplication: await prisma.programSessionApplication.findMany({
			where: instance,
		}),
		ProgramLiftState: await prisma.programLiftState.findMany({
			where: instance,
		}),
		StrengthProgramDay: await prisma.strengthProgramDay.findMany({
			where: workout,
		}),
		StrengthProgramLiftRule: await prisma.strengthProgramLiftRule.findMany({
			where: exercise,
		}),
	}

	return {
		exportedAt: new Date().toISOString(),
		tables: toJsonSafe(tables) as Record<string, Row[]>,
	}
}
