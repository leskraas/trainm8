/**
 * The Week Replan demo seed (#198, PRD #194 user story 23): the two fixture
 * athletes `prisma/seed.ts` creates via `seedWeekReplanDemoAthletes`, driven
 * through the real recompute-path applier — so these tests assert the same
 * stored outcomes a demo viewer sees, external behavior only.
 */
import { expect, test } from 'vitest'
import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { seedWeekReplanDemoAthletes } from '#tests/week-replan-demo-seed.ts'

test('the seeded overreaching athlete gets a proposed softening that silence applied: stored decision + softened sessions with Replan Notes', async () => {
	const now = new Date()
	const { overreachingId } = await seedWeekReplanDemoAthletes(now)

	// The stored decision for the most recently closed Training Week: proposed,
	// with the reason composed by the pure composers — overshoot and Form named.
	const replan = await prisma.weekReplan.findUnique({
		where: {
			athleteId_weekKey: {
				athleteId: overreachingId,
				weekKey: addDays(weekMonday(now, 'UTC'), -7),
			},
		},
	})
	expect(replan?.outcome).toBe('proposed')
	expect(replan?.reason).toMatch(/over plan/i)
	expect(replan?.reason).toMatch(/softened this week/i)
	const scales = await prisma.weekReplanProposal.findMany({
		where: { weekReplanId: replan!.id, kind: 'scale' },
		select: { payload: true },
	})
	expect(scales.length).toBeGreaterThan(0)
	for (const { payload } of scales) {
		expect((JSON.parse(payload) as { factor: number }).factor).toBeLessThan(1)
	}

	// The still-scheduled sessions were visibly softened: Replan Notes attached
	// and the quantified hour cut below its authored 3600s.
	const softened = await prisma.workoutSession.findMany({
		where: { userId: overreachingId, replanReason: { not: null } },
		select: {
			status: true,
			replanReason: true,
			workout: { select: { blocks: { select: { steps: true } } } },
		},
	})
	expect(softened.length).toBeGreaterThan(0)
	for (const session of softened) {
		expect(session.status).toBe('scheduled')
		expect(session.replanReason).toMatch(/kortere/)
	}
	const stepDurations = softened.flatMap((s) =>
		(s.workout?.blocks ?? []).flatMap((b) =>
			b.steps.map((step) => step.durationSec),
		),
	)
	expect(stepDurations.length).toBeGreaterThan(0)
	for (const durationSec of stepDurations) {
		expect(durationSec).not.toBeNull()
		expect(durationSec!).toBeLessThan(3600)
	}
})

test('the seeded no-planned-load athlete gets the explicit insufficient-data decline, no session touched', async () => {
	const now = new Date()
	const { noPlannedLoadId } = await seedWeekReplanDemoAthletes(now)

	const replan = await prisma.weekReplan.findUnique({
		where: {
			athleteId_weekKey: {
				athleteId: noPlannedLoadId,
				weekKey: addDays(weekMonday(now, 'UTC'), -7),
			},
		},
	})
	// The honest decline, stored and demoable: no measurable adherence ⇒ the
	// explicit "no adjustment — not enough data" outcome, never a tweak.
	expect(replan?.outcome).toBe('insufficient-data')
	expect(replan?.reason).toMatch(/no adjustment, not enough data/i)
	expect(replan?.appliedScale).toBeNull()

	// No session carries a note and no prescription changed.
	const noted = await prisma.workoutSession.count({
		where: { userId: noPlannedLoadId, replanReason: { not: null } },
	})
	expect(noted).toBe(0)
	const steps = await prisma.workoutStep.findMany({
		where: { block: { workout: { ownerId: noPlannedLoadId } } },
		select: { durationSec: true },
	})
	for (const step of steps) {
		expect(step.durationSec).toBe(3600)
	}
})
