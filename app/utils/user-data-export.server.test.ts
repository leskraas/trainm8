import { getAuthTables } from '@better-auth/core/db'
import { Prisma } from '@prisma/client'
import { expect, test } from 'vitest'
import { weekMonday } from '#app/utils/athlete-calendar.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { connectAccountConnection } from './account-connection.server.ts'
import { authOptions } from './auth/options.server.ts'
import { prisma } from './db.server.ts'
import {
	USER_DATA_EXPORT_EXCLUSIONS,
	exportUserData,
} from './user-data-export.server.ts'

/**
 * Every model that holds a row about a user: `User` itself and, transitively,
 * every model with a foreign key into one that does, plus every table Better
 * Auth is configured with (ADR 0113 §6), since `AuthVerification` names its
 * user without a foreign key. Read from the Prisma schema and from
 * `getAuthTables`, so a new table, or one a Better Auth plugin or upgrade adds,
 * joins this list the moment it exists and the export test fails until the
 * export carries it or names why it does not.
 */
function userOwnedModels(): string[] {
	const models = Prisma.dmmf.datamodel.models
	const owned = new Set(['User', ...betterAuthModels()])
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

/** Better Auth's configured tables, by Prisma model name (`authSession` → `AuthSession`). */
function betterAuthModels() {
	return Object.values(getAuthTables(authOptions)).map(
		({ modelName }) => modelName.charAt(0).toUpperCase() + modelName.slice(1),
	)
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
			blocks: {
				create: { orderIndex: 0, steps: { create: { orderIndex: 0 } } },
			},
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
	return {
		userId: user.id,
		workoutId: workout.id,
		activityImportId: activityImport.id,
	}
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
		expect.objectContaining({
			provider: 'intervalsicu',
			externalAthleteId: 'me-ext',
		}),
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

test("a moderator's export carries the reports they resolved, not the reporters' words", async () => {
	const me = await createAthleteWithTrainingRecord('me')
	const other = await createAthleteWithTrainingRecord('other')
	const resolvedAt = new Date('2026-10-01T10:00:00Z')
	const resolvedByMe = await prisma.workoutReport.create({
		select: { id: true },
		data: {
			workoutId: other.workoutId,
			reporterId: other.userId,
			reason: 'spam',
			detail: 'other wrote this privately',
			resolvedAt,
			resolution: 'dismissed',
			resolvedById: me.userId,
		},
	})
	const mine = await prisma.workoutReport.create({
		select: { id: true },
		data: {
			workoutId: other.workoutId,
			reporterId: me.userId,
			reason: 'unsafe',
			detail: 'me wrote this',
		},
	})

	const { tables } = await exportUserData({
		userId: me.userId,
		domain: 'https://x.test',
	})

	const reports = tables.WorkoutReport as Array<Record<string, unknown>>
	expect(reports.find((r) => r.id === mine.id)).toMatchObject({
		reporterId: me.userId,
		reason: 'unsafe',
		detail: 'me wrote this',
	})
	expect(reports.find((r) => r.id === resolvedByMe.id)).toEqual({
		id: resolvedByMe.id,
		workoutId: other.workoutId,
		resolvedAt,
		resolution: 'dismissed',
		resolvedById: me.userId,
	})
	const json = JSON.stringify(tables)
	expect(json).not.toContain('other wrote this privately')
	expect(json).not.toContain(other.userId)
})

test("Better Auth's tables are in the walk, the verification table included", () => {
	expect(betterAuthModels().sort()).toEqual([
		'AuthAccount',
		'AuthPasskey',
		'AuthSession',
		'AuthVerification',
		'TwoFactor',
		'User',
	])
	expect(userOwnedModels()).toEqual(
		expect.arrayContaining(['AuthVerification', 'TwoFactor']),
	)
})

/** One row in every Better Auth table, each holding a secret the export must never carry. */
async function createSignInMethods(userId: string, label: string) {
	const secrets = {
		passwordHash: `$2a$10$${label}PasswordHashThatMustNotLeak`,
		githubAccessToken: `${label}-github-access-token`,
		githubRefreshToken: `${label}-github-refresh-token`,
		githubIdToken: `${label}-github-id-token`,
		sessionToken: `${label}-session-token-must-not-leak`,
		totpSecret: `${label}-totp-secret-must-not-leak`,
		backupCodeOne: `${label}-backup-code-1`,
		backupCodeTwo: `${label}-backup-code-2`,
		oneTimeCode: `${label}-hashed-one-time-code`,
		passkeyPublicKey: `${label}-passkey-public-key`,
		passkeyCredentialId: `${label}-passkey-credential-id`,
	}
	await prisma.user.update({
		where: { id: userId },
		data: { twoFactorEnabled: true },
	})
	await prisma.authAccount.createMany({
		data: [
			{
				id: `${label}-credential`,
				userId,
				providerId: 'credential',
				accountId: userId,
				password: secrets.passwordHash,
				updatedAt: new Date(),
			},
			{
				id: `${label}-github`,
				userId,
				providerId: 'github',
				accountId: `${label}-github-id`,
				accessToken: secrets.githubAccessToken,
				refreshToken: secrets.githubRefreshToken,
				idToken: secrets.githubIdToken,
				updatedAt: new Date(),
			},
		],
	})
	await prisma.authPasskey.create({
		data: {
			id: `${label}-passkey`,
			userId,
			name: `${label} sin iPhone`,
			publicKey: secrets.passkeyPublicKey,
			credentialID: secrets.passkeyCredentialId,
			counter: 0,
			deviceType: 'multiDevice',
			backedUp: true,
			createdAt: new Date('2026-11-01T08:00:00Z'),
		},
	})
	await prisma.authSession.create({
		data: {
			id: `${label}-auth-session`,
			userId,
			token: secrets.sessionToken,
			expiresAt: new Date(Date.now() + 86_400_000),
			updatedAt: new Date(),
		},
	})
	await prisma.twoFactor.create({
		data: {
			id: `${label}-two-factor`,
			userId,
			secret: secrets.totpSecret,
			backupCodes: `${secrets.backupCodeOne},${secrets.backupCodeTwo}`,
		},
	})
	await prisma.authVerification.create({
		data: {
			id: `${label}-verification`,
			identifier: `sign-in-otp-${label}@example.test`,
			value: `${secrets.oneTimeCode}:0`,
			expiresAt: new Date(Date.now() + 300_000),
			updatedAt: new Date(),
		},
	})
	return secrets
}

test('the export lists sign-in methods and never a sign-in secret', async () => {
	const me = await createAthleteWithTrainingRecord('me')
	const secrets = await createSignInMethods(me.userId, 'me')

	const exported = await exportUserData({
		userId: me.userId,
		domain: 'https://x.test',
	})
	const { tables } = exported

	// Password set, GitHub linked.
	expect(tables.AuthAccount).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ providerId: 'credential' }),
			expect.objectContaining({
				providerId: 'github',
				accountId: 'me-github-id',
			}),
		]),
	)
	// Passkey names and dates.
	expect(tables.AuthPasskey).toEqual([
		{
			id: 'me-passkey',
			name: 'me sin iPhone',
			deviceType: 'multiDevice',
			backedUp: true,
			createdAt: new Date('2026-11-01T08:00:00Z'),
		},
	])
	// Two-factor on.
	expect(tables.User).toEqual([
		expect.objectContaining({ twoFactorEnabled: true }),
	])
	expect(tables.AuthSession).toEqual([
		expect.objectContaining({ id: 'me-auth-session' }),
	])

	const json = JSON.stringify(exported)
	const leaked = Object.entries(secrets).filter(([, secret]) =>
		json.includes(secret),
	)
	expect(leaked).toEqual([])
	for (const row of tables.AuthAccount ?? []) {
		expect(Object.keys(row).sort()).toEqual([
			'accountId',
			'createdAt',
			'id',
			'providerId',
			'updatedAt',
		])
	}
	expect(json).not.toContain('me-verification')
	expect(json).not.toContain('me-two-factor')
})
