import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { buildLoadCurve } from './load-curve.ts'
import {
	recomputeLoadFrom,
	getLoadSnapshots,
	getCurrentLoad,
	getTsbTrust,
} from './snapshot.server.ts'

async function createUserWithProfile(tz = 'UTC') {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: tz,
					disciplineProfiles: {
						create: [
							{
								discipline: 'run',
								lthr: 160,
								maxHr: 185,
								preferCogganTss: false,
								preferRTSS: false,
							},
						],
					},
				},
			},
		},
	})
	return user
}

async function createCompletedSession(
	userId: string,
	scheduledAt: Date,
	discipline: string,
	rpe: number | null,
	hrAvg: number | null = 155,
) {
	// Create a recording import
	const startedAt = scheduledAt
	const endedAt = new Date(scheduledAt.getTime() + 3600 * 1000)
	const imp = await prisma.activityImport.create({
		data: {
			athleteId: userId,
			externalProvider: 'manual',
			externalId: faker.string.uuid(),
			startedAt,
			endedAt,
			durationSec: 3600,
			discipline,
			hrAvg,
			rawJson: '{}',
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt,
			status: 'completed',
			recordingId: imp.id,
		},
		select: { id: true },
	})
	await prisma.activityImport.update({
		where: { id: imp.id },
		data: { promotedSessionId: session.id },
	})
	if (rpe != null) {
		await prisma.sessionLog.create({
			data: { sessionId: session.id, content: 'test', rpe },
		})
	}
	return session
}

// ── recompute produces snapshots ──────────────────────────────────────────

test('recomputeLoadFrom: creates a snapshot for a day with a completed session', async () => {
	const user = await createUserWithProfile()
	const today = new Date()
	today.setUTCHours(12, 0, 0, 0)
	const todayStr = today.toISOString().slice(0, 10)

	await createCompletedSession(user.id, today, 'run', 7, 160)
	await recomputeLoadFrom(user.id, todayStr)

	const snap = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: user.id, date: todayStr } },
	})
	expect(snap).not.toBeNull()
	expect(snap!.tssTotal).toBeGreaterThan(0)
	expect(snap!.ctl).toBeGreaterThan(0)
	expect(snap!.atl).toBeGreaterThan(0)
})

test('recomputeLoadFrom: zero-TSS day (no sessions) creates snapshot with tssTotal=0', async () => {
	const user = await createUserWithProfile()
	const today = new Date()
	today.setUTCHours(12, 0, 0, 0)
	const todayStr = today.toISOString().slice(0, 10)

	await recomputeLoadFrom(user.id, todayStr)

	const snap = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: user.id, date: todayStr } },
	})
	expect(snap).not.toBeNull()
	expect(snap!.tssTotal).toBe(0)
})

test('recomputeLoadFrom: persists exactly what buildLoadCurve produces (thin shell)', async () => {
	const user = await createUserWithProfile()
	const today = new Date()
	today.setUTCHours(12, 0, 0, 0)
	const todayStr = today.toISOString().slice(0, 10)

	// Create a session with known hrAvg = lthr = 160 → hrTSS = 100
	await createCompletedSession(user.id, today, 'run', null, 160)
	await recomputeLoadFrom(user.id, todayStr)

	const snap = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: user.id, date: todayStr } },
	})
	expect(snap).not.toBeNull()

	// The shell only fetches + persists; the recurrence is the pure curve's.
	// Feed the persisted day's TSS back through the curve from a zero anchor
	// and assert the shell wrote those exact values.
	const [expected] = buildLoadCurve(
		[{ date: todayStr, tssTotal: snap!.tssTotal, tssByDiscipline: {} }],
		{ ctl: 0, atl: 0 },
	)
	expect(snap!.ctl).toBeCloseTo(expected!.ctl, 6)
	expect(snap!.atl).toBeCloseTo(expected!.atl, 6)
	expect(snap!.tsb).toBeCloseTo(expected!.tsb, 6)
})

test('getLoadSnapshots: returns sorted snapshots within window', async () => {
	const user = await createUserWithProfile()
	const today = new Date()
	today.setUTCHours(12, 0, 0, 0)
	const todayStr = today.toISOString().slice(0, 10)

	await recomputeLoadFrom(user.id, todayStr)
	const snapshots = await getLoadSnapshots(user.id, 7)
	expect(Array.isArray(snapshots)).toBe(true)
	// At minimum we get the today snapshot
	const todaySnap = snapshots.find((s) => s.date === todayStr)
	expect(todaySnap).toBeDefined()
})

test('getCurrentLoad: returns the most recent snapshot', async () => {
	const user = await createUserWithProfile()
	const today = new Date()
	today.setUTCHours(12, 0, 0, 0)
	const todayStr = today.toISOString().slice(0, 10)

	await recomputeLoadFrom(user.id, todayStr)
	const load = await getCurrentLoad(user.id)
	expect(load).not.toBeNull()
	expect(load!.date).toBe(todayStr)
})

// ── TSB trustworthiness gate ──────────────────────────────────────────────

test('getTsbTrust: no snapshots → not trustworthy with zero history', async () => {
	const user = await createUserWithProfile()
	const trust = await getTsbTrust(user.id)
	expect(trust.trustworthy).toBe(false)
	expect(trust.daysOfHistory).toBe(0)
	expect(trust.requiredDays).toBe(42)
})

test('getTsbTrust: thin history (today only) is not trustworthy', async () => {
	const user = await createUserWithProfile()
	const today = new Date()
	today.setUTCHours(12, 0, 0, 0)
	const todayStr = today.toISOString().slice(0, 10)

	await createCompletedSession(user.id, today, 'run', 7, 160)
	await recomputeLoadFrom(user.id, todayStr)

	const trust = await getTsbTrust(user.id)
	expect(trust.trustworthy).toBe(false)
	expect(trust.daysOfHistory).toBe(1)
})

test('getTsbTrust: ≥42 days of history is trustworthy', async () => {
	const user = await createUserWithProfile()

	// Earliest snapshot 49 days before today → 50 inclusive days of history.
	const first = new Date()
	first.setUTCHours(12, 0, 0, 0)
	first.setUTCDate(first.getUTCDate() - 49)
	await prisma.loadSnapshot.create({
		data: {
			athleteId: user.id,
			date: first.toISOString().slice(0, 10),
			tssTotal: 0,
			tssByDiscipline: '{}',
			ctl: 0,
			atl: 0,
			tsb: 0,
		},
	})

	const trust = await getTsbTrust(user.id)
	expect(trust.daysOfHistory).toBeGreaterThanOrEqual(42)
	expect(trust.trustworthy).toBe(true)
})

// ── timezone-correct day attribution ─────────────────────────────────────

test('recomputeLoadFrom: Oslo 22:00 ride counts on Oslo calendar day', async () => {
	// Oslo is UTC+2 in summer. A session at 20:00 UTC = 22:00 Oslo.
	const user = await createUserWithProfile('Europe/Oslo')

	// 2026-05-19T20:00:00Z = 22:00 Oslo time → should land on 2026-05-19 in Oslo
	const sessionTime = new Date('2026-05-19T20:00:00.000Z')
	await createCompletedSession(user.id, sessionTime, 'run', 7, 160)

	await recomputeLoadFrom(user.id, '2026-05-19')

	const snap = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: user.id, date: '2026-05-19' } },
	})
	expect(snap).not.toBeNull()
	expect(snap!.tssTotal).toBeGreaterThan(0)
})
