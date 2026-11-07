import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
} from '#app/utils/plan-outline/authoring.server.ts'
import { deleteWorkoutSession } from '#app/utils/workout.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'

test('probe: deleting the session whose Workout a fixed pattern day picked', async () => {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: { ...userData, password: { create: createPassword(userData.username) } },
	})
	const workout = await prisma.workout.create({
		select: { id: true },
		data: { title: 'Terskel', discipline: 'run', intent: 'endurance', ownerId: user.id },
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: { userId: user.id, workoutId: workout.id, scheduledAt: new Date('2030-01-02T07:00:00Z'), source: 'authored' },
	})
	const created = await createPlanOutline(
		user.id,
		{
			startWeekKey: '2029-12-31',
			structure: { phases: [{ name: 'Base', weeks: 4, rhythm: 'none' as const }] },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 30 }],
		},
		new Date('2029-12-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(created.reason)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: created.outlineId },
		select: { tracks: { select: { id: true } } },
	})
	await addWeekPattern(user.id, { outlineId: created.outlineId, name: 'Uke' })
	const pattern = await prisma.weekPattern.findFirstOrThrow({ where: { outlineId: created.outlineId } })
	const day = await addWeekPatternDay(user.id, {
		patternId: pattern.id,
		kind: 'fixed',
		trackId: outline.tracks[0]!.id,
		weekday: 2,
		workoutId: workout.id,
	} as any)
	console.log('PROBE add fixed day:', JSON.stringify(day))
	let outcome: string
	try {
		const result = await deleteWorkoutSession(user.id, session.id)
		outcome = 'deleted ' + JSON.stringify(result)
	} catch (error) {
		outcome = 'THREW ' + String((error as Error).message).split('\n').slice(-3).join(' | ')
	}
	console.log('PROBE delete session:', outcome)
	const still = await prisma.workoutSession.findUnique({ where: { id: session.id } })
	const dayRow = await prisma.weekPatternDay.findFirst({ where: { patternId: pattern.id } })
	console.log('PROBE session still there:', still != null, '| day workoutId:', dayRow?.workoutId)
	expect(true).toBe(true)
})
