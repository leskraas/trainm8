import { expect, test, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { recomputeLoadFrom } from './snapshot.server.ts'

// The week change rides on the load recompute, but it is the athlete's plan
// moving on, not the log or import that triggered it: when it fails, the
// recompute still lands and the failure is logged.
vi.mock('./week-change.server.ts', () => ({
	runWeekChangeForUser: vi.fn().mockRejectedValue(new Error('stamp failed')),
}))

test('a failing week change never fails the recompute that ran it, and is logged', async () => {
	const user = await prisma.user.create({
		select: { id: true },
		data: { ...createUser(), athleteProfile: { create: { timezone: 'UTC' } } },
	})
	const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
	const today = new Date().toISOString().slice(0, 10)

	await expect(recomputeLoadFrom(user.id, today)).resolves.toBeUndefined()

	expect(
		await prisma.loadSnapshot.count({ where: { athleteId: user.id } }),
	).toBe(1)
	expect(logged).toHaveBeenCalledWith(
		'[week-change] failed during load recompute',
		expect.objectContaining({ message: 'stamp failed' }),
	)
	logged.mockRestore()
})
