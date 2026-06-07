import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { persistApprovedPlan } from './approve.server.ts'
import { persistExtendedWindow } from './extend.server.ts'
import { approveGeneratedPlan, extendGeneratedPlan } from './generate.server.ts'
import { type ScheduledSession } from './schedule.ts'
import { type PlanGenerationInput, type PlanOutline } from './schema.ts'

async function createUserWithPassword() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

/** A profile that can train any day at 09:00 UTC, so sessions always place. */
async function createAvailableProfile(userId: string) {
	return prisma.athleteProfile.create({
		data: {
			userId,
			timezone: 'UTC',
			trainableWeekdays: JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
			defaultTrainingTime: '09:00',
		},
	})
}

const NOW = new Date('2026-06-08T09:00:00.000Z') // a Monday

const input: PlanGenerationInput = {
	disciplines: ['run'],
	experience: 'intermediate',
	goal: 'Run a sub-2:00 half marathon',
	horizonWeeks: 8,
}

const outline: PlanOutline = {
	phases: [{ name: 'Base', weeks: 8, focus: 'Aerobic base', weeklyLoadHours: 6 }],
}

function scheduledSession(
	overrides: Partial<ScheduledSession> = {},
): ScheduledSession {
	return {
		weekIndex: 0,
		orderInWeek: 0,
		title: 'Easy run',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-08T09:00:00.000Z'),
		blocks: [
			{
				name: 'Main',
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						intensity: { kind: 'zoneLabel', label: 'Z2' },
						durationSec: 2700,
					},
				],
			},
		],
		...overrides,
	}
}

test('extending materializes the next window anchored to the Event with generated provenance', async () => {
	const user = await createUserWithPassword()
	await createAvailableProfile(user.id)

	// Approve first to create the Event + Outline + near-term (week 0–1) sessions.
	const approved = await approveGeneratedPlan(user.id, input, { now: NOW })
	expect(approved.ok).toBe(true)
	if (!approved.ok) return

	const extended = await extendGeneratedPlan(user.id, approved.eventId, {
		now: NOW,
	})

	expect(extended.ok).toBe(true)
	if (!extended.ok || !extended.extended) throw new Error('expected extension')

	// A fresh generation distinct from the approve that created the Event.
	expect(extended.generationId).not.toBe(approved.generationId)
	expect(extended.sessionIds.length).toBeGreaterThan(0)

	const newSessions = await prisma.workoutSession.findMany({
		where: { id: { in: extended.sessionIds } },
		select: {
			source: true,
			targetEventId: true,
			generationId: true,
			generatedByModel: true,
			scheduledAt: true,
		},
	})

	const latestApprovedAt = Math.max(
		...(
			await prisma.workoutSession.findMany({
				where: { generationId: approved.generationId },
				select: { scheduledAt: true },
			})
		).map((s) => s.scheduledAt.getTime()),
	)

	for (const session of newSessions) {
		expect(session.source).toBe('generated')
		expect(session.targetEventId).toBe(approved.eventId)
		expect(session.generationId).toBe(extended.generationId)
		expect(session.generatedByModel).toBe('stub-v1')
		// The extended window sits strictly after the already-detailed sessions.
		expect(session.scheduledAt.getTime()).toBeGreaterThan(latestApprovedAt)
	}
})

test('extending does not modify or duplicate already-materialized sessions', async () => {
	const user = await createUserWithPassword()
	await createAvailableProfile(user.id)

	const approved = await approveGeneratedPlan(user.id, input, { now: NOW })
	if (!approved.ok) throw new Error('approve failed')

	const before = await prisma.workoutSession.findMany({
		where: { generationId: approved.generationId },
		select: { id: true, scheduledAt: true, workoutId: true },
		orderBy: { scheduledAt: 'asc' },
	})

	const extended = await extendGeneratedPlan(user.id, approved.eventId, {
		now: NOW,
	})
	if (!extended.ok || !extended.extended) throw new Error('expected extension')

	const after = await prisma.workoutSession.findMany({
		where: { generationId: approved.generationId },
		select: { id: true, scheduledAt: true, workoutId: true },
		orderBy: { scheduledAt: 'asc' },
	})

	// The original generation is untouched: same rows, same dates, same workouts.
	expect(after).toEqual(before)

	// No new sessions reuse the original generationId.
	const overlap = extended.sessionIds.filter((id) =>
		before.some((s) => s.id === id),
	)
	expect(overlap).toEqual([])
})

test('extending is a no-op when the Outline is fully detailed', async () => {
	const user = await createUserWithPassword()
	await createAvailableProfile(user.id)

	// A 2-week horizon's Outline is fully covered by the near-term detail window.
	const shortInput: PlanGenerationInput = { ...input, horizonWeeks: 2 }
	const approved = await approveGeneratedPlan(user.id, shortInput, { now: NOW })
	if (!approved.ok) throw new Error('approve failed')

	const countBefore = await prisma.workoutSession.count({
		where: { userId: user.id },
	})

	const extended = await extendGeneratedPlan(user.id, approved.eventId, {
		now: NOW,
	})

	expect(extended).toEqual({ ok: true, extended: false })

	const countAfter = await prisma.workoutSession.count({
		where: { userId: user.id },
	})
	expect(countAfter).toBe(countBefore)
})

test('extending an Event with no Plan Outline cannot proceed', async () => {
	const user = await createUserWithPassword()
	const event = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: 'Plain Event',
			kind: 'race',
			priority: 'C',
			startDate: new Date('2026-09-01'),
			disciplines: JSON.stringify(['run']),
			status: 'planned',
		},
		select: { id: true },
	})

	const result = await extendGeneratedPlan(user.id, event.id, { now: NOW })
	expect(result).toEqual({ ok: false, error: 'This plan cannot be extended.' })

	await expect(
		persistExtendedWindow(user.id, {
			eventId: event.id,
			sessions: [scheduledSession()],
			generatedByModel: 'stub-v1',
		}),
	).rejects.toThrow()
})

test('persistExtendedWindow rejects an Event owned by another athlete', async () => {
	const owner = await createUserWithPassword()
	const intruder = await createUserWithPassword()

	const result = await persistApprovedPlan(owner.id, {
		input,
		outline,
		sessions: [scheduledSession()],
		generatedByModel: 'stub-v1',
	})

	await expect(
		persistExtendedWindow(intruder.id, {
			eventId: result.eventId,
			sessions: [scheduledSession()],
			generatedByModel: 'stub-v1',
		}),
	).rejects.toThrow()

	const count = await prisma.workoutSession.count({
		where: { userId: intruder.id },
	})
	expect(count).toBe(0)
})

test('persistExtendedWindow writes sessions anchored to the Event with a fresh generationId', async () => {
	const user = await createUserWithPassword()

	const approved = await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [scheduledSession()],
		generatedByModel: 'stub-v1',
	})

	const extended = await persistExtendedWindow(user.id, {
		eventId: approved.eventId,
		sessions: [
			scheduledSession({
				title: 'Tempo run',
				scheduledAt: new Date('2026-06-22T09:00:00.000Z'),
			}),
		],
		generatedByModel: 'stub-v1',
	})

	expect(extended.sessionIds).toHaveLength(1)
	expect(extended.generationId).not.toBe(approved.generationId)

	const session = await prisma.workoutSession.findUnique({
		where: { id: extended.sessionIds[0]! },
		select: { source: true, targetEventId: true, generationId: true },
	})
	expect(session!.source).toBe('generated')
	expect(session!.targetEventId).toBe(approved.eventId)
	expect(session!.generationId).toBe(extended.generationId)
})
