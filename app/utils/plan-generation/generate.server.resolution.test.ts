import { expect, test, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { approveGeneratedPlan, extendGeneratedPlan } from './generate.server.ts'
import type * as PreviewModule from './preview.ts'
import { type PlanGenerationInput } from './schema.ts'

// Force the shared intensity-resolution step to throw, so we can assert that a
// failed resolution surfaces at the persistence seam instead of being swallowed
// (PRD #121 user story 16, #125). vi.mock is hoisted above these imports; the
// column mapper and other preview exports stay real, so persistence still writes
// (null) ranges normally.
vi.mock('./preview.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof PreviewModule>()
	return {
		...actual,
		buildPlanPreview: vi.fn(() => {
			throw new Error('intensity resolution failed')
		}),
	}
})

const NOW = new Date('2026-06-08T09:00:00.000Z') // a Monday

const input: PlanGenerationInput = {
	disciplines: ['run'],
	experience: 'intermediate',
	goal: 'Run a sub-2:00 half marathon',
	horizonWeeks: 8,
}

/** An athlete who can train any day, so generated sessions always place. */
async function createAvailableUser() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
					trainableWeekdays: JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
					defaultTrainingTime: '09:00',
				},
			},
		},
	})
}

test('approve surfaces resolution: failed when intensity resolution throws — but the plan still saves', async () => {
	const user = await createAvailableUser()

	const result = await approveGeneratedPlan(user.id, input, { now: NOW })

	// The save itself succeeded; a failed resolution no longer reads as a failed
	// save, nor as a clean success — it surfaces as resolution: 'failed'.
	expect(result.ok).toBe(true)
	if (!result.ok) return
	expect(result.resolution).toBe('failed')
	expect(result.sessionIds.length).toBeGreaterThan(0)

	// The sessions persisted with unresolved (null) ranges, since resolution threw.
	const steps = await prisma.workoutStep.findMany({
		where: {
			kind: 'cardio',
			block: { workout: { sessions: { some: { userId: user.id } } } },
		},
		select: { intensityHrMin: true, intensityHrMax: true },
	})
	expect(steps.length).toBeGreaterThan(0)
	expect(steps.every((s) => s.intensityHrMin === null)).toBe(true)
})

test('extend surfaces resolution: failed when intensity resolution throws', async () => {
	const user = await createAvailableUser()

	const approved = await approveGeneratedPlan(user.id, input, { now: NOW })
	expect(approved.ok).toBe(true)
	if (!approved.ok) return

	const extended = await extendGeneratedPlan(user.id, approved.eventId, {
		now: NOW,
	})

	expect(extended.ok).toBe(true)
	if (!extended.ok || !extended.extended) throw new Error('expected extension')
	expect(extended.resolution).toBe('failed')
})
