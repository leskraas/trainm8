// Deploy probe for #665: a database at the migration before this one, with
// a plan whose days point at a session's Workout, a Stock Workout and a row
// two plans share, then `prisma migrate deploy`, then the checks.
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const url = process.env.DATABASE_URL!
const db = new PrismaClient({ datasources: { db: { url } } })
const id = { select: { id: true } } as const

async function main() {
	const user = await db.user.create({ ...id, data: { email: 'probe@x.no', username: 'probe' } })
	const outline = await db.planOutline.create({ ...id, data: { athleteId: user.id, startWeekKey: '2030-01-07' } })
	const other = await db.planOutline.create({ ...id, data: { athleteId: user.id, startWeekKey: '2030-01-07' } })
	const run = await db.trainingTrack.create({ ...id, data: { outlineId: outline.id, discipline: 'run', currency: 'km' } })
	const lift = await db.trainingTrack.create({ ...id, data: { outlineId: outline.id, discipline: 'strength', currency: 'sets' } })
	const run2 = await db.trainingTrack.create({ ...id, data: { outlineId: other.id, discipline: 'run', currency: 'km' } })
	const pattern = await db.weekPattern.create({ ...id, data: { outlineId: outline.id, name: 'Uke', orderIndex: 0 } })
	const pattern2 = await db.weekPattern.create({ ...id, data: { outlineId: other.id, name: 'Uke', orderIndex: 0 } })
	const block = { create: [{ orderIndex: 0, steps: { create: [{ orderIndex: 0, kind: 'cardio', durationSec: 600 }] } }] }
	const own = await db.workout.create({ ...id, data: { ownerId: user.id, title: 'Terskel', discipline: 'run', intent: 'threshold', blocks: block } })
	await db.workoutSession.create({ ...id, data: { userId: user.id, workoutId: own.id, scheduledAt: new Date(), status: 'scheduled' } })
	const stock = await db.workout.create({ ...id, data: { authorship: 'system', title: 'Helkropp', discipline: 'strength', intent: 'strength', blocks: block } })
	const shared = await db.workout.create({ ...id, data: { ownerId: user.id, title: 'Rolig', discipline: 'run', intent: 'endurance', blocks: block } })
	await db.weekPatternDay.create({ ...id, data: { patternId: pattern.id, trackId: run.id, kind: 'fixed', weekday: 2, workoutId: own.id } })
	await db.weekPatternDay.create({ ...id, data: { patternId: pattern.id, trackId: run.id, kind: 'fixed', weekday: 4, workoutId: shared.id } })
	await db.weekPatternDay.create({ ...id, data: { patternId: pattern.id, trackId: lift.id, kind: 'lifting', weekday: null, workoutId: stock.id } })
	await db.weekPatternDay.create({ ...id, data: { patternId: pattern2.id, trackId: run2.id, kind: 'fixed', weekday: 4, workoutId: shared.id } })
	await db.$disconnect()

	console.log(execSync('npx prisma migrate deploy', { env: process.env }).toString().split('\n').filter(Boolean).at(-1))

	const after = new PrismaClient({ datasources: { db: { url } } })
	const days = await after.weekPatternDay.findMany({ select: { workoutId: true, pattern: { select: { outlineId: true } }, workout: { select: { heldByOutlineId: true, copiedFromId: true, blocks: { select: { steps: { select: { durationSec: true } } } } } } } })
	console.log(JSON.stringify(days, null, 1))
	console.log('fk violations:', (await after.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check')).length)
	await after.workoutSession.deleteMany({ where: { workoutId: own.id } })
	await after.workout.delete({ where: { id: own.id } })
	console.log('session Workout deleted; days still', await after.weekPatternDay.count())
	await after.user.delete({ where: { id: user.id } })
	console.log('user deleted; days', await after.weekPatternDay.count(), 'workouts left', await after.workout.count({ where: { ownerId: user.id } }), 'held left', await after.workout.count({ where: { heldByOutlineId: { not: null } } }))
	await after.$disconnect()
}
main().catch((error) => { console.error(error); process.exit(1) })
