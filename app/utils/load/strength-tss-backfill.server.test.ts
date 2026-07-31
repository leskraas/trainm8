import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { ewmaStep } from './ewma.ts'
import { recomputeLoadFrom } from './snapshot.server.ts'
import {
	ensureStrengthTssBackfillEnqueued,
	runStrengthTssBackfill,
	STRENGTH_LEFT_THE_TRIAD_NOTICE,
	STRENGTH_TSS_BACKFILL_JOB_KIND,
	widestCtlDrop,
} from './strength-tss-backfill.server.ts'

// ── the one-shot strength-leaves-the-triad recompute (ADR 0046 §2) ─────────
// Every stored LoadSnapshot was built with strength `sRPE` inside `tssTotal`,
// so a hybrid athlete's CTL is inflated. The backfill pushes affected athletes
// through the existing recompute path and leaves a notice naming the drop —
// a one-time migration with an explanation, never a silent switch.

async function createHybridAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
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
}

/** A completed 1h session `daysAgo` days back, with an RPE and optional HR. */
async function createSession(
	userId: string,
	opts: {
		daysAgo: number
		discipline: string
		rpe: number | null
		hrAvg?: number | null
	},
) {
	const startedAt = new Date()
	startedAt.setUTCHours(12, 0, 0, 0)
	startedAt.setUTCDate(startedAt.getUTCDate() - opts.daysAgo)

	const imp = await prisma.activityImport.create({
		data: {
			athleteId: userId,
			externalProvider: 'manual',
			externalId: faker.string.uuid(),
			startedAt,
			endedAt: new Date(startedAt.getTime() + 3600 * 1000),
			durationSec: 3600,
			discipline: opts.discipline,
			hrAvg: opts.hrAvg ?? null,
			rawJson: '{}',
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt: startedAt,
			status: 'completed',
			recordingId: imp.id,
		},
		select: { id: true },
	})
	await prisma.activityImport.update({
		where: { id: imp.id },
		data: { promotedSessionId: session.id },
	})
	if (opts.rpe != null) {
		await prisma.sessionLog.create({
			data: { sessionId: session.id, content: 'test', rpe: opts.rpe },
		})
	}
	return { session, dateStr: startedAt.toISOString().slice(0, 10) }
}

/** Rebuild the athlete's snapshots the pre-ADR-0046 way: strength summed in. */
async function seedInflatedSnapshots(athleteId: string, fromDateStr: string) {
	await recomputeLoadFrom(athleteId, fromDateStr)
	const rows = await prisma.loadSnapshot.findMany({
		where: { athleteId },
		orderBy: { date: 'asc' },
		select: { id: true, tssByDiscipline: true },
	})
	// Re-derive `tssTotal` as the sum of the whole split — the old invariant —
	// then re-run the curve through the same `ewmaStep` recurrence production
	// uses, so the seeded "before" state is a curve the old code really produced.
	let ctl = 0
	let atl = 0
	for (const row of rows) {
		const split = JSON.parse(row.tssByDiscipline) as Record<string, number>
		const tssTotal = Object.values(split).reduce((sum, v) => sum + v, 0)
		const stepped = ewmaStep({ prevCtl: ctl, prevAtl: atl, tss: tssTotal })
		ctl = stepped.ctl
		atl = stepped.atl
		await prisma.loadSnapshot.update({
			where: { id: row.id },
			data: { tssTotal, ctl, atl, tsb: stepped.tsb },
		})
	}
}

test('ensureStrengthTssBackfillEnqueued enqueues exactly once, ever', async () => {
	await prisma.job.deleteMany({
		where: { kind: STRENGTH_TSS_BACKFILL_JOB_KIND },
	})

	await ensureStrengthTssBackfillEnqueued()
	await ensureStrengthTssBackfillEnqueued()
	expect(
		await prisma.job.count({ where: { kind: STRENGTH_TSS_BACKFILL_JOB_KIND } }),
	).toBe(1)

	// A finished job still counts as "ran" — later boots must not re-enqueue.
	await prisma.job.updateMany({
		where: { kind: STRENGTH_TSS_BACKFILL_JOB_KIND },
		data: { status: 'completed' },
	})
	await ensureStrengthTssBackfillEnqueued()
	expect(
		await prisma.job.count({ where: { kind: STRENGTH_TSS_BACKFILL_JOB_KIND } }),
	).toBe(1)
})

test("a hybrid athlete's stored snapshots drop their strength load and CTL falls", async () => {
	const user = await createHybridAthlete()
	// hrAvg = lthr = 160 → hrTSS = 100 for the run; 1h at RPE 7 → sRPE 105.
	const { dateStr } = await createSession(user.id, {
		daysAgo: 3,
		discipline: 'strength',
		rpe: 7,
	})
	await createSession(user.id, {
		daysAgo: 3,
		discipline: 'run',
		rpe: null,
		hrAvg: 160,
	})
	await seedInflatedSnapshots(user.id, dateStr)

	const before = await prisma.loadSnapshot.findUniqueOrThrow({
		where: { athleteId_date: { athleteId: user.id, date: dateStr } },
	})
	expect(before.tssTotal).toBeCloseTo(205, 4)

	await runStrengthTssBackfill()

	const after = await prisma.loadSnapshot.findUniqueOrThrow({
		where: { athleteId_date: { athleteId: user.id, date: dateStr } },
	})
	// The run's 100 survives; the lifting's 105 leaves the total but keeps its
	// slice in the split.
	expect(after.tssTotal).toBeCloseTo(100, 4)
	expect(JSON.parse(after.tssByDiscipline)).toMatchObject({ strength: 105 })
	expect(after.ctl).toBeLessThan(before.ctl)
})

test('the backfill leaves one notice naming the CTL it moved', async () => {
	const user = await createHybridAthlete()
	const { dateStr } = await createSession(user.id, {
		daysAgo: 3,
		discipline: 'strength',
		rpe: 7,
	})
	await seedInflatedSnapshots(user.id, dateStr)

	await runStrengthTssBackfill()

	const notice = await prisma.loadRecomputeNotice.findUniqueOrThrow({
		where: {
			athleteId_kind: {
				athleteId: user.id,
				kind: STRENGTH_LEFT_THE_TRIAD_NOTICE,
			},
		},
	})
	expect(notice.ctlBefore).toBeGreaterThan(notice.ctlAfter)
	// Strength was this athlete's only load, so the corrected CTL is zero.
	expect(notice.ctlAfter).toBeCloseTo(0, 6)
	expect(notice.dismissedAt).toBeNull()

	// Idempotent: a re-run (retry, or a second boot on a fresh job row) must not
	// stack a second notice, and must not overwrite the original `ctlBefore`
	// with the already-corrected value.
	await runStrengthTssBackfill()
	expect(
		await prisma.loadRecomputeNotice.count({ where: { athleteId: user.id } }),
	).toBe(1)
	const reread = await prisma.loadRecomputeNotice.findUniqueOrThrow({
		where: {
			athleteId_kind: {
				athleteId: user.id,
				kind: STRENGTH_LEFT_THE_TRIAD_NOTICE,
			},
		},
	})
	expect(reread.ctlBefore).toBeCloseTo(notice.ctlBefore, 6)
})

test('an endurance-only athlete is left alone — no recompute, no notice', async () => {
	const user = await createHybridAthlete()
	const { dateStr } = await createSession(user.id, {
		daysAgo: 3,
		discipline: 'run',
		rpe: null,
		hrAvg: 160,
	})
	await recomputeLoadFrom(user.id, dateStr)
	const before = await prisma.loadSnapshot.findUniqueOrThrow({
		where: { athleteId_date: { athleteId: user.id, date: dateStr } },
	})

	await runStrengthTssBackfill()

	const after = await prisma.loadSnapshot.findUniqueOrThrow({
		where: { athleteId_date: { athleteId: user.id, date: dateStr } },
	})
	expect(after.tssTotal).toBeCloseTo(before.tssTotal, 6)
	expect(after.ctl).toBeCloseTo(before.ctl, 6)
	expect(
		await prisma.loadRecomputeNotice.count({ where: { athleteId: user.id } }),
	).toBe(0)
})

test('a lifter whose sessions carry no RPE never had a strength contribution, so gets no notice', async () => {
	const user = await createHybridAthlete()
	// No RPE → no sRPE → the session contributed nothing before this change
	// either. Nothing moves, so there is nothing to explain.
	const { dateStr } = await createSession(user.id, {
		daysAgo: 3,
		discipline: 'strength',
		rpe: null,
	})
	await recomputeLoadFrom(user.id, dateStr)

	await runStrengthTssBackfill()

	expect(
		await prisma.loadRecomputeNotice.count({ where: { athleteId: user.id } }),
	).toBe(0)
})

// ── which day the recompute moved most (pure) ──────────────────────────────
// The notice quotes the widest gap over the whole history, not today's CTL. CTL
// is a 42-day EWMA, so a lifter whose gym block ended months ago sees an
// unchanged current figure and a visibly redrawn chart — and reading only the
// latest snapshot would leave exactly that athlete un-notified.

test('widestCtlDrop picks the day the curve moved furthest, not the last day', () => {
	const before = new Map([
		['2026-01-01', 10],
		['2026-01-02', 40],
		['2026-01-03', 12],
	])
	const after = new Map([
		['2026-01-01', 8],
		['2026-01-02', 15],
		['2026-01-03', 11],
	])
	// Drops are 2, 25, 1 — the middle day wins even though it isn't the latest.
	expect(widestCtlDrop(before, after)).toEqual({ ctlBefore: 40, ctlAfter: 15 })
})

test('widestCtlDrop finds a historical drop the latest day hides entirely', () => {
	// A gym block long since decayed out of the current figure: today reads the
	// same on both curves, so a latest-only check would say "nothing moved".
	const before = new Map([
		['2026-01-01', 30],
		['2026-06-01', 4.01],
	])
	const after = new Map([
		['2026-01-01', 12],
		['2026-06-01', 4],
	])
	expect(widestCtlDrop(before, after)).toEqual({ ctlBefore: 30, ctlAfter: 12 })
})

test('widestCtlDrop ignores float noise and an unchanged curve', () => {
	const before = new Map([['2026-01-01', 20]])
	expect(widestCtlDrop(before, new Map([['2026-01-01', 20]]))).toBeNull()
	// Below the noticeable threshold: nothing an athlete could read off a chart.
	expect(widestCtlDrop(before, new Map([['2026-01-01', 19.98]]))).toBeNull()
})

test('widestCtlDrop skips days with no counterpart on the other curve', () => {
	// A day the recompute never wrote is not evidence of a drop.
	expect(
		widestCtlDrop(new Map([['2026-01-01', 30]]), new Map([['2026-01-02', 0]])),
	).toBeNull()
})
