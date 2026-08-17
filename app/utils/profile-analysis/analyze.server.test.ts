import { expect, test, describe, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { setDisciplineThresholds } from '../athlete.server.ts'
import {
	acceptancePlan,
	analyseProfile,
	findEstimate,
	paceChannelToSpeed,
} from './analyze.server.ts'

// The same fire-and-forget recomputes `athlete.server.test.ts` mocks: they run
// after the transaction resolves and the DB is torn down before they finish.
vi.mock('../workout.server.ts', () => ({
	recomputeIntensityRanges: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../load/planned-tss.server.ts', () => ({
	recomputePlannedTssForUser: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../activity-telemetry.server.ts', () => ({
	rederiveHrPhaseBarsForDiscipline: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../load/snapshot.server.ts', () => ({
	recomputeLoadFrom: vi.fn().mockResolvedValue(undefined),
}))

const NOW = new Date('2026-08-13T12:00:00Z')

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

/** A ride at a flat wattage, with a stored stream on a 5 s grid. */
async function createRide(
	athleteId: string,
	{
		id,
		watts,
		durationSec,
		daysAgo,
		hrMax = null,
	}: {
		id: string
		watts: number
		durationSec: number
		daysAgo: number
		hrMax?: number | null
	},
) {
	const count = Math.round(durationSec / 5)
	const startedAt = new Date(NOW.getTime() - daysAgo * 86_400_000)
	await prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider: 'manual',
			externalId: id,
			startedAt,
			endedAt: new Date(startedAt.getTime() + durationSec * 1000),
			durationSec,
			discipline: 'bike',
			hrMax,
			rawJson: '{}',
			stream: {
				create: {
					resolutionSec: 5,
					sampleCount: count,
					timeSec: JSON.stringify(
						Array.from({ length: count }, (_, i) => i * 5),
					),
					power: JSON.stringify(Array.from({ length: count }, () => watts)),
				},
			},
		},
	})
}

/** Rides tracing `P(t) = CP + W′/t`, so the fit has known truth to recover. */
async function seedModelRides(athleteId: string, cpW = 250, wPrimeJ = 20_000) {
	const durations = [120, 300, 600, 1200]
	for (const [i, durationSec] of durations.entries()) {
		await createRide(athleteId, {
			id: `ride-${i}`,
			watts: cpW + wPrimeJ / durationSec,
			durationSec,
			daysAgo: (i + 1) * 3,
		})
	}
}

describe('paceChannelToSpeed', () => {
	test('inverts pace into speed so the maximum is the fast end', () => {
		const speed = paceChannelToSpeed({
			resolutionSec: 5,
			samples: [300, 240], // 5:00/km then 4:00/km
		})
		expect(speed!.samples[1]!).toBeGreaterThan(speed!.samples[0]!)
	})

	test('a stopped sample is a gap, never a zero speed', () => {
		const speed = paceChannelToSpeed({
			resolutionSec: 5,
			samples: [240, 0, null],
		})
		expect(speed!.samples).toEqual([1000 / 240, null, null])
	})

	test('a channel with nothing usable is absent rather than all-null', () => {
		expect(
			paceChannelToSpeed({ resolutionSec: 5, samples: [null, 0] }),
		).toBeNull()
	})
})

describe('analyseProfile', () => {
	test('reads nothing and writes nothing for an athlete with no history', async () => {
		const user = await createTestUser()
		const analysis = await analyseProfile(user.id, NOW)
		expect(analysis.activitiesRead).toBe(0)
		// Every rung still answers, so nothing is silently missing.
		expect(analysis.estimates.length).toBeGreaterThan(0)
		expect(analysis.estimates.every((e) => e.kind === 'refusal')).toBe(true)
		expect(await prisma.thresholdEvent.count()).toBe(0)
	})

	test('recovers a critical power from stored streams', async () => {
		const user = await createTestUser()
		await seedModelRides(user.id)
		const analysis = await analyseProfile(user.id, NOW)
		expect(analysis.activitiesRead).toBe(4)
		const cp = findEstimate(analysis, 'bike', 'cp')
		expect(cp).not.toBeNull()
		expect(cp!.value).toBeGreaterThan(240)
		expect(cp!.value).toBeLessThan(260)
	})

	test('the loader is read-only — previewing writes no threshold', async () => {
		const user = await createTestUser()
		await seedModelRides(user.id)
		await analyseProfile(user.id, NOW)
		expect(await prisma.thresholdEvent.count()).toBe(0)
		// Stronger than "no threshold was written": the read path does not so much
		// as upsert an **Athlete Profile** into existence, so previewing leaves the
		// account exactly as it found it.
		expect(
			await prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
		).toBeNull()
		expect(
			await prisma.disciplineProfile.count({
				where: { athleteProfile: { userId: user.id } },
			}),
		).toBe(0)
	})

	test('activity outside the window is not read', async () => {
		const user = await createTestUser()
		await createRide(user.id, {
			id: 'ancient',
			watts: 300,
			durationSec: 1200,
			daysAgo: 400,
		})
		const analysis = await analyseProfile(user.id, NOW)
		expect(analysis.activitiesRead).toBe(0)
	})
})

describe('accepting an estimate', () => {
	test('writes the value and files the provenance the manual path cannot', async () => {
		const user = await createTestUser()
		await seedModelRides(user.id)
		const analysis = await analyseProfile(user.id, NOW)
		const estimate = findEstimate(analysis, 'bike', 'cp')!
		const plan = acceptancePlan(estimate)

		// A CP lands in the `ftp` column because that is the only column there is…
		expect(plan.column).toBe('ftp')
		expect(plan.kind).toBe('ftp')
		// …and the event records that it is a CP, so the history never claims the
		// two are the same quantity.
		expect(plan.construct).toBe('cp')
		expect(plan.protocol).toBe('cp-fit')

		await setDisciplineThresholds(
			user.id,
			'bike',
			{ [plan.column]: plan.value },
			{
				construct: plan.construct,
				protocol: plan.protocol,
				confidence: plan.confidence,
			},
		)

		const event = await prisma.thresholdEvent.findFirstOrThrow({
			where: { discipline: 'bike', kind: 'ftp' },
		})
		expect(event.construct).toBe('cp')
		expect(event.protocol).toBe('cp-fit')
		expect(event.confidence).toBe(estimate.confidence)
		expect(event.source).toBe('inferred')
		expect(event.valueNumeric).toBe(estimate.value)
	})

	test('a typed threshold still files as manual, with no confidence grade', async () => {
		const user = await createTestUser()
		await setDisciplineThresholds(user.id, 'bike', { ftp: 250 })
		const event = await prisma.thresholdEvent.findFirstOrThrow({
			where: { discipline: 'bike', kind: 'ftp' },
		})
		expect(event.source).toBe('manual')
		expect(event.protocol).toBe('manual')
		expect(event.construct).toBe('ftp')
		// A number somebody stated about themselves is not graded by the app.
		expect(event.confidence).toBeNull()
	})

	test('an accepted estimate is authored afterwards — nothing re-reads history', async () => {
		const user = await createTestUser()
		await seedModelRides(user.id)
		const analysis = await analyseProfile(user.id, NOW)
		const plan = acceptancePlan(findEstimate(analysis, 'bike', 'cp')!)
		await setDisciplineThresholds(user.id, 'bike', {
			[plan.column]: plan.value,
		})

		// The athlete then edits it. A second analysis proposes again; it does not
		// overwrite (ADR 0050's derived-then-authored rule).
		await setDisciplineThresholds(user.id, 'bike', { ftp: 300 })
		await analyseProfile(user.id, NOW)

		const row = await prisma.disciplineProfile.findFirstOrThrow({
			where: { discipline: 'bike', athleteProfile: { userId: user.id } },
		})
		expect(row.ftp).toBe(300)
	})
})
