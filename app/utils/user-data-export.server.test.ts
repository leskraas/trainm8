import { Prisma } from '@prisma/client'
import { expect, test } from 'vitest'
import { weekMonday } from '#app/utils/athlete-calendar.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { connectAccountConnection } from './account-connection.server.ts'
import { prisma } from './db.server.ts'
import {
	USER_DATA_EXPORT_EXCLUSIONS,
	exportUserData,
} from './user-data-export.server.ts'

/**
 * Every model that holds a row about a user: `User` itself and, transitively,
 * every model with a foreign key into one that does. Read from the Prisma
 * schema, so a new table joins this list the moment it is added and the export
 * test fails until the export carries it or names why it does not.
 */
function userOwnedModels(): string[] {
	const models = Prisma.dmmf.datamodel.models
	const owned = new Set(['User'])
	let grew = true
	while (grew) {
		grew = false
		for (const model of models) {
			if (owned.has(model.name)) continue
			const pointsAtOwned = model.fields.some(
				(field) =>
					field.kind === 'object' &&
					(field.relationFromFields?.length ?? 0) > 0 &&
					owned.has(field.type),
			)
			if (pointsAtOwned) {
				owned.add(model.name)
				grew = true
			}
		}
	}
	return [...owned].sort()
}

async function createAthleteWithTrainingRecord(label: string) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			sessions: {
				create: { expirationDate: new Date(Date.now() + 86_400_000) },
			},
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: [{ discipline: 'run', lthr: 160, maxHr: 185 }],
					},
				},
			},
		},
	})
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId: user.id },
		select: { id: true },
	})
	await prisma.thresholdEvent.create({
		data: {
			athleteProfileId: profile.id,
			discipline: 'run',
			kind: 'lthr',
			valueNumeric: 161,
		},
	})
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: `${label} terskeløkt`,
			discipline: 'run',
			intent: 'threshold',
			ownerId: user.id,
			authorship: 'athlete',
			blocks: { create: { orderIndex: 0, steps: { create: { orderIndex: 0 } } } },
		},
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: { userId: user.id, workoutId: workout.id, scheduledAt: new Date() },
	})
	await prisma.sessionLog.create({
		data: { sessionId: session.id, content: `${label} kjentes tung` },
	})
	const activityImport = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			externalProvider: 'intervalsicu',
			externalId: `${label}-activity`,
			startedAt: new Date(),
			endedAt: new Date(),
			durationSec: 3600,
			discipline: 'run',
			rawJson: '{}',
			stream: {
				create: { resolutionSec: 1, sampleCount: 1, timeSec: '[0]' },
			},
		},
	})
	await connectAccountConnection({
		athleteId: user.id,
		provider: 'intervalsicu',
		externalAthleteId: `${label}-ext`,
		accessToken: `${label}-secret-api-key`,
		refreshToken: null,
		expiresAt: null,
	})
	const outline = await createPlanOutline(user.id, {
		startWeekKey: weekMonday(new Date(), 'UTC'),
		structure: { phases: [{ name: 'Blokk 1', weeks: 4, rhythm: '3:1' }] },
		tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
	})
	if (!outline.ok) throw new Error(outline.reason)
	return { userId: user.id, workoutId: workout.id, activityImportId: activityImport.id }
}

test('the export carries every user-owned table in the schema', async () => {
	const { userId } = await createAthleteWithTrainingRecord('me')

	const exported = await exportUserData({ userId, domain: 'https://x.test' })

	const missing = userOwnedModels().filter(
		(model) =>
			!(model in exported.tables) && !(model in USER_DATA_EXPORT_EXCLUSIONS),
	)
	expect(missing).toEqual([])
	for (const rows of Object.values(exported.tables)) {
		expect(Array.isArray(rows)).toBe(true)
	}
	// An exclusion names a real, user-owned table, and is not also exported.
	for (const model of Object.keys(USER_DATA_EXPORT_EXCLUSIONS)) {
		expect(userOwnedModels()).toContain(model)
		expect(exported.tables).not.toHaveProperty(model)
	}
})

test("the export holds the athlete's training record", async () => {
	const me = await createAthleteWithTrainingRecord('me')

	const { tables } = await exportUserData({
		userId: me.userId,
		domain: 'https://x.test',
	})

	expect(tables.User).toHaveLength(1)
	expect(tables.AthleteProfile).toHaveLength(1)
	expect(tables.DisciplineProfile).toHaveLength(1)
	expect(tables.ThresholdEvent).toHaveLength(1)
	expect(tables.Workout).toEqual([
		expect.objectContaining({ id: me.workoutId, title: 'me terskeløkt' }),
	])
	expect(tables.WorkoutBlock).toHaveLength(1)
	expect(tables.WorkoutStep).toHaveLength(1)
	expect(tables.WorkoutSession).toHaveLength(1)
	expect(tables.SessionLog).toEqual([
		expect.objectContaining({ content: 'me kjentes tung' }),
	])
	expect(tables.ActivityImport).toEqual([
		expect.objectContaining({ id: me.activityImportId }),
	])
	expect(tables.ActivityStream).toHaveLength(1)
	expect(tables.AccountConnection).toEqual([
		expect.objectContaining({ provider: 'intervalsicu', externalAthleteId: 'me-ext' }),
	])
	expect(tables.PlanOutline).toHaveLength(1)
	expect(tables.TrainingTrack).toHaveLength(1)
	expect(tables.Session).toHaveLength(1)
})

test('the export leaves out secrets and every other athlete', async () => {
	const me = await createAthleteWithTrainingRecord('me')
	const other = await createAthleteWithTrainingRecord('other')

	const exported = await exportUserData({
		userId: me.userId,
		domain: 'https://x.test',
	})
	const json = JSON.stringify(exported)

	expect(json).not.toContain('me-secret-api-key')
	expect(json).not.toContain('enc:v1:')
	expect(json).not.toMatch(/accessToken|refreshToken/)
	expect(json).not.toContain('$2') // a bcrypt hash
	const mySession = await prisma.session.findFirstOrThrow({
		where: { userId: me.userId },
	})
	expect(json).not.toContain(mySession.id)

	expect(json).not.toContain(other.userId)
	expect(json).not.toContain(other.workoutId)
	expect(json).not.toContain('other kjentes tung')
	expect(json).not.toContain('other-ext')
})
