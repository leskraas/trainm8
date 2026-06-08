import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import {
	recomputePlannedTssForSession,
	recomputePlannedTssForUser,
} from './planned-tss.server.ts'

async function createRunner(lthr: number | null = 160) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: [{ discipline: 'run', lthr, maxHr: 185 }],
					},
				},
			},
		},
	})
	return user
}

/** A run session whose single cardio step prescribes an HR-bpm range + duration. */
async function createHrSession(
	userId: string,
	{ durationSec = 3600, hrMin = 158, hrMax = 162 } = {},
) {
	const workout = await prisma.workout.create({
		data: {
			title: 'Threshold run',
			discipline: 'run',
			intent: 'threshold',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec,
									intensity: JSON.stringify({ kind: 'hrBpm', min: hrMin, max: hrMax }),
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
			status: 'scheduled',
		},
		select: { id: true },
	})
	return session
}

test('recomputePlannedTssForSession stores value + full confidence', async () => {
	const user = await createRunner(160)
	const session = await createHrSession(user.id)

	await recomputePlannedTssForSession(user.id, session.id)

	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { plannedTssValue: true, plannedTssConfidence: true },
	})
	expect(after!.plannedTssValue).toBeCloseTo(100, 0)
	expect(after!.plannedTssConfidence).toBe('full')
})

test('recomputePlannedTssForUser stores null when nothing resolves', async () => {
	// No LTHR/maxHr usable? maxHr is set, but an HR step still resolves via maxHr.
	// Use a profile with neither LTHR nor maxHr so hrTSS cannot run.
	const user = await createRunner(null)
	await prisma.disciplineProfile.updateMany({
		where: { athleteProfile: { userId: user.id }, discipline: 'run' },
		data: { maxHr: null },
	})
	const session = await createHrSession(user.id)

	await recomputePlannedTssForUser(user.id)

	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { plannedTssValue: true, plannedTssConfidence: true },
	})
	expect(after!.plannedTssValue).toBeNull()
	expect(after!.plannedTssConfidence).toBeNull()
})

test('recompute reflects a threshold change (new LTHR shifts the value)', async () => {
	const user = await createRunner(160)
	const session = await createHrSession(user.id, { hrMin: 160, hrMax: 160 })

	await recomputePlannedTssForUser(user.id)
	const before = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { plannedTssValue: true },
	})
	expect(before!.plannedTssValue).toBeCloseTo(100, 0)

	// Raise LTHR → the same prescribed HR is now a lower fraction of threshold →
	// lower Planned TSS.
	await prisma.disciplineProfile.updateMany({
		where: { athleteProfile: { userId: user.id }, discipline: 'run' },
		data: { lthr: 200 },
	})
	await recomputePlannedTssForUser(user.id)
	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { plannedTssValue: true },
	})
	expect(after!.plannedTssValue).toBeLessThan(before!.plannedTssValue!)
})
