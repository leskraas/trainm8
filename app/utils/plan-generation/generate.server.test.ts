import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { approveGeneratedPlan, horizonWeeksUntil } from './generate.server.ts'
import { type PlanGenerationInput, type PlanOutline } from './schema.ts'

const DAY_MS = 24 * 60 * 60 * 1000

async function createUserWithPassword() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
					trainableWeekdays: '[1,3,5]',
					defaultTrainingTime: '18:00',
				},
			},
		},
	})
}

const input: PlanGenerationInput = {
	disciplines: ['run'],
	experience: 'intermediate',
	goal: 'Run a sub-2:00 half marathon',
	horizonWeeks: 12,
}

function outlineWeeks(planOutline: string): number {
	const outline = JSON.parse(planOutline) as PlanOutline
	return outline.phases.reduce((sum, phase) => sum + phase.weeks, 0)
}

test('horizonWeeksUntil derives whole weeks from now → event start, clamped to 1..52', () => {
	const now = new Date('2026-06-07T00:00:00.000Z')
	// 28 days out → exactly 4 weeks.
	expect(horizonWeeksUntil(new Date(now.getTime() + 28 * DAY_MS), now)).toBe(4)
	// 15 days out → ceil(15/7) = 3 weeks.
	expect(horizonWeeksUntil(new Date(now.getTime() + 15 * DAY_MS), now)).toBe(3)
	// A past event clamps up to the 1-week minimum.
	expect(horizonWeeksUntil(new Date(now.getTime() - 5 * DAY_MS), now)).toBe(1)
	// A far-future event clamps down to the 52-week maximum.
	expect(horizonWeeksUntil(new Date(now.getTime() + 400 * DAY_MS), now)).toBe(
		52,
	)
})

test('approving against an existing Target Event derives the horizon from its date and anchors to it', async () => {
	const user = await createUserWithPassword()
	const now = new Date('2026-06-07T00:00:00.000Z')

	// Event four weeks out; the wizard input asks for 12 weeks, but the chosen
	// Target Event's date is authoritative.
	const event = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: 'Oslo Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date(now.getTime() + 28 * DAY_MS),
			disciplines: JSON.stringify(['run']),
			status: 'planned',
		},
		select: { id: true },
	})

	const before = await prisma.event.count({ where: { athleteId: user.id } })

	const result = await approveGeneratedPlan(user.id, input, {
		targetEventId: event.id,
		now,
	})

	expect(result.ok).toBe(true)
	if (!result.ok) return

	// No duplicate Event was created — the chosen one was reused.
	expect(result.eventId).toBe(event.id)
	const after = await prisma.event.count({ where: { athleteId: user.id } })
	expect(after).toBe(before)

	// The persisted Plan Outline spans the derived 4-week horizon, not the
	// wizard's 12.
	const persisted = await prisma.event.findUnique({
		where: { id: event.id },
		select: { planOutline: true },
	})
	expect(outlineWeeks(persisted!.planOutline!)).toBe(4)

	// Every session anchors to the chosen Target Event.
	const sessions = await prisma.workoutSession.findMany({
		where: { id: { in: result.sessionIds } },
		select: { targetEventId: true },
	})
	expect(sessions.length).toBeGreaterThan(0)
	expect(sessions.every((s) => s.targetEventId === event.id)).toBe(true)
})

test('approving with no Target Event uses the wizard horizon and auto-creates an Event', async () => {
	const user = await createUserWithPassword()
	const now = new Date('2026-06-07T00:00:00.000Z')

	const result = await approveGeneratedPlan(user.id, input, { now })

	expect(result.ok).toBe(true)
	if (!result.ok) return

	const event = await prisma.event.findUnique({
		where: { id: result.eventId },
		select: { kind: true, planOutline: true },
	})
	expect(event!.kind).toBe('fitness-goal')
	// The wizard's 12-week horizon is honored when no Event anchors the plan.
	expect(outlineWeeks(event!.planOutline!)).toBe(12)
})
