import { expect, test, describe, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { DisciplineThresholdSchema } from './athlete-schema.ts'
import {
	setDisciplineThresholds,
	getThresholdHistory,
	getOrCreateAthleteProfile,
	updateAthleteProfile,
} from './athlete.server.ts'

// recomputeIntensityRanges fires as fire-and-forget after setDisciplineThresholds.
// In tests the DB is torn down before the async recompute completes, triggering
// console.error (which the test harness converts to a failure). Mock it to a no-op.
vi.mock('./workout.server.ts', () => ({
	recomputeIntensityRanges: vi.fn().mockResolvedValue(undefined),
}))

async function createTestUser() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

describe('getOrCreateAthleteProfile', () => {
	test('creates a new profile if none exists', async () => {
		const user = await createTestUser()
		const profile = await getOrCreateAthleteProfile(user.id)
		expect(profile.userId).toBe(user.id)
		expect(profile.preferredUnits).toBe('metric')
		expect(profile.weekStartsOn).toBe(1)
		expect(profile.timezone).toBe('UTC')
	})

	test('returns existing profile on second call', async () => {
		const user = await createTestUser()
		const first = await getOrCreateAthleteProfile(user.id)
		const second = await getOrCreateAthleteProfile(user.id)
		expect(first.id).toBe(second.id)
	})
})

describe('updateAthleteProfile', () => {
	test('writes timezone and weekStartsOn', async () => {
		const user = await createTestUser()
		await updateAthleteProfile(user.id, {
			timezone: 'Europe/Oslo',
			weekStartsOn: 1,
		})
		const profile = await prisma.athleteProfile.findUniqueOrThrow({
			where: { userId: user.id },
		})
		expect(profile.timezone).toBe('Europe/Oslo')
		expect(profile.weekStartsOn).toBe(1)
	})
})

describe('setDisciplineThresholds', () => {
	test('writes a ThresholdEvent in the same transaction', async () => {
		const user = await createTestUser()
		await setDisciplineThresholds(user.id, 'bike', { ftp: 250 })

		const events = await prisma.thresholdEvent.findMany({
			where: { athleteProfile: { userId: user.id } },
		})
		expect(events).toHaveLength(1)
		expect(events[0]!.kind).toBe('ftp')
		expect(events[0]!.valueNumeric).toBe(250)
		expect(events[0]!.source).toBe('manual')
		expect(events[0]!.discipline).toBe('bike')
	})

	test('writes one ThresholdEvent per changed threshold field', async () => {
		const user = await createTestUser()
		await setDisciplineThresholds(user.id, 'run', { maxHr: 185, lthr: 162 })

		const events = await prisma.thresholdEvent.findMany({
			where: { athleteProfile: { userId: user.id } },
			orderBy: { kind: 'asc' },
		})
		expect(events).toHaveLength(2)
		const kinds = events.map((e) => e.kind).sort()
		expect(kinds).toEqual(['lthr', 'maxHr'])
	})

	test('does not create a ThresholdEvent when value is unchanged', async () => {
		const user = await createTestUser()
		await setDisciplineThresholds(user.id, 'bike', { ftp: 250 })
		await setDisciplineThresholds(user.id, 'bike', { ftp: 250 })

		const events = await prisma.thresholdEvent.findMany({
			where: { athleteProfile: { userId: user.id } },
		})
		expect(events).toHaveLength(1)
	})

	test('creates a second ThresholdEvent when value changes', async () => {
		const user = await createTestUser()
		await setDisciplineThresholds(user.id, 'bike', { ftp: 250 })
		await setDisciplineThresholds(user.id, 'bike', { ftp: 270 })

		const events = await prisma.thresholdEvent.findMany({
			where: { athleteProfile: { userId: user.id } },
			orderBy: { effectiveAt: 'asc' },
		})
		expect(events).toHaveLength(2)
		expect(events[0]!.valueNumeric).toBe(250)
		expect(events[1]!.valueNumeric).toBe(270)
	})

	test('upserts the DisciplineProfile row', async () => {
		const user = await createTestUser()
		await setDisciplineThresholds(user.id, 'bike', { ftp: 250 })
		await setDisciplineThresholds(user.id, 'bike', { ftp: 270 })

		const profiles = await prisma.disciplineProfile.findMany({
			where: { athleteProfile: { userId: user.id }, discipline: 'bike' },
		})
		expect(profiles).toHaveLength(1)
		expect(profiles[0]!.ftp).toBe(270)
	})
})

describe('getThresholdHistory', () => {
	test('returns history ordered newest-first', async () => {
		const user = await createTestUser()
		await setDisciplineThresholds(user.id, 'bike', { ftp: 200 })
		await setDisciplineThresholds(user.id, 'bike', { ftp: 250 })
		await setDisciplineThresholds(user.id, 'bike', { ftp: 300 })

		const history = await getThresholdHistory(user.id)
		expect(history[0]!.valueNumeric).toBe(300)
		expect(history[1]!.valueNumeric).toBe(250)
		expect(history[2]!.valueNumeric).toBe(200)
	})

	test('filters by discipline when provided', async () => {
		const user = await createTestUser()
		await setDisciplineThresholds(user.id, 'bike', { ftp: 250 })
		await setDisciplineThresholds(user.id, 'run', { lthr: 155 })

		const bikeHistory = await getThresholdHistory(user.id, 'bike')
		expect(bikeHistory).toHaveLength(1)
		expect(bikeHistory[0]!.discipline).toBe('bike')
	})

	test('returns empty array when no profile exists', async () => {
		const user = await createTestUser()
		const history = await getThresholdHistory(user.id)
		expect(history).toHaveLength(0)
	})
})

describe('DisciplineThresholdSchema', () => {
	test('accepts valid FTP', () => {
		expect(DisciplineThresholdSchema.safeParse({ ftp: 250 }).success).toBe(true)
	})

	test('rejects FTP below minimum (50)', () => {
		expect(DisciplineThresholdSchema.safeParse({ ftp: 40 }).success).toBe(false)
	})

	test('rejects FTP above maximum (600)', () => {
		expect(DisciplineThresholdSchema.safeParse({ ftp: 700 }).success).toBe(
			false,
		)
	})

	test('accepts valid maxHr', () => {
		expect(DisciplineThresholdSchema.safeParse({ maxHr: 185 }).success).toBe(
			true,
		)
	})

	test('rejects maxHr below minimum (80)', () => {
		expect(DisciplineThresholdSchema.safeParse({ maxHr: 50 }).success).toBe(
			false,
		)
	})

	test('rejects maxHr above maximum (220)', () => {
		expect(DisciplineThresholdSchema.safeParse({ maxHr: 250 }).success).toBe(
			false,
		)
	})

	test('accepts valid threshold pace (sec/km)', () => {
		expect(
			DisciplineThresholdSchema.safeParse({ thresholdPaceSecPerKm: 240 })
				.success,
		).toBe(true)
	})

	test('rejects threshold pace below minimum (150)', () => {
		expect(
			DisciplineThresholdSchema.safeParse({ thresholdPaceSecPerKm: 100 })
				.success,
		).toBe(false)
	})

	test('rejects threshold pace above maximum (600)', () => {
		expect(
			DisciplineThresholdSchema.safeParse({ thresholdPaceSecPerKm: 700 })
				.success,
		).toBe(false)
	})

	test('accepts valid CSS (sec/100m)', () => {
		expect(
			DisciplineThresholdSchema.safeParse({ cssSecPer100m: 100 }).success,
		).toBe(true)
	})

	test('rejects CSS below minimum (60)', () => {
		expect(
			DisciplineThresholdSchema.safeParse({ cssSecPer100m: 50 }).success,
		).toBe(false)
	})

	test('rejects CSS above maximum (250)', () => {
		expect(
			DisciplineThresholdSchema.safeParse({ cssSecPer100m: 300 }).success,
		).toBe(false)
	})

	test('accepts empty object (all fields optional)', () => {
		expect(DisciplineThresholdSchema.safeParse({}).success).toBe(true)
	})
})
