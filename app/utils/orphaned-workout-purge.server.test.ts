import { expect, test, vi } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { saveToCatalogueList } from './catalogue.server.ts'
import { publishWorkout } from './community.server.ts'
import { prisma } from './db.server.ts'
import { jobHandlers } from './jobs/handlers.server.ts'
import { enqueueJob, processNextJob } from './jobs/queue.server.ts'
import {
	ensureOrphanedWorkoutPurgeEnqueued,
	ORPHANED_WORKOUT_PURGE_JOB_KIND,
} from './orphaned-workout-purge.server.ts'

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

/**
 * An account deleted the way every one was before #641: a published Workout
 * someone saved, a private one, and a published one another athlete's session
 * holds, all left behind ownerless.
 */
async function createOrphans() {
	const author = await createAthlete()
	const reader = await createAthlete()
	const workout = (title: string) =>
		prisma.workout.create({
			select: { id: true },
			data: {
				discipline: 'run',
				intent: 'threshold',
				ownerId: author.id,
				title,
				description: `${title}, in the author's words`,
			},
		})
	const publish = (workoutId: string) =>
		publishWorkout({
			userId: author.id,
			workoutId,
			displayName: 'Kari Nordmann',
			archetype: 'threshold',
		})
	const published = await workout('Kari sine 6x1000')
	await publish(published.id)
	await saveToCatalogueList(reader.id, published.id)
	const privateOne = await workout('Kari sine notater')
	const held = await workout('Kari sin terskel')
	await publish(held.id)
	await prisma.workoutSession.create({
		data: {
			userId: reader.id,
			workoutId: held.id,
			scheduledAt: new Date('2030-01-01T07:00:00Z'),
			status: 'scheduled',
			source: 'authored',
		},
	})
	await prisma.user.delete({ where: { id: author.id } })
	return { erasable: [published.id, privateOne.id], held }
}

async function readJob(id: string) {
	const job = await prisma.job.findUniqueOrThrow({ where: { id } })
	return { ...job, payload: JSON.parse(job.payload) as Record<string, unknown> }
}

test('boot enqueues the purge exactly once, ever', async () => {
	await prisma.job.deleteMany({
		where: { kind: ORPHANED_WORKOUT_PURGE_JOB_KIND },
	})

	await ensureOrphanedWorkoutPurgeEnqueued()
	await ensureOrphanedWorkoutPurgeEnqueued()
	expect(
		await prisma.job.count({
			where: { kind: ORPHANED_WORKOUT_PURGE_JOB_KIND },
		}),
	).toBe(1)

	await prisma.job.updateMany({
		where: { kind: ORPHANED_WORKOUT_PURGE_JOB_KIND },
		data: { status: 'completed' },
	})
	await ensureOrphanedWorkoutPurgeEnqueued()
	expect(
		await prisma.job.count({
			where: { kind: ORPHANED_WORKOUT_PURGE_JOB_KIND },
		}),
	).toBe(1)
})

test('the job erases the Orphaned Workouts and records counts only, on its own row', async () => {
	await prisma.job.deleteMany({})
	const { erasable, held } = await createOrphans()
	const job = await enqueueJob({ kind: ORPHANED_WORKOUT_PURGE_JOB_KIND })
	const info = vi.spyOn(console, 'info').mockImplementation(() => {})

	expect(await processNextJob(jobHandlers)).toBe('processed')

	const row = await readJob(job.id)
	expect(row.status).toBe('completed')
	expect(row.payload).toEqual({
		purged: { erased: 2, keptUnattributed: 1, spliced: 0 },
	})
	expect(await prisma.workout.count({ where: { id: { in: erasable } } })).toBe(
		0,
	)
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: held.id },
			select: { visibility: true, ownerId: true },
		}),
	).toEqual({ visibility: 'private', ownerId: null })
	expect(info).toHaveBeenCalledWith(
		'[orphaned-workout-purge] erased 2, kept unattributed 1, spliced 0',
	)
	// Nothing the author wrote, nor which rows, is in the record or the log.
	const recorded = JSON.stringify([row.payload, info.mock.calls])
	for (const needle of ['Kari', 'notater', 'terskel', ...erasable, held.id]) {
		expect(recorded).not.toContain(needle)
	}
	info.mockRestore()
})

test('a run after one that committed keeps the first record, never zeros', async () => {
	await prisma.job.deleteMany({})
	await createOrphans()
	const job = await enqueueJob({ kind: ORPHANED_WORKOUT_PURGE_JOB_KIND })
	const info = vi.spyOn(console, 'info').mockImplementation(() => {})
	await processNextJob(jobHandlers)
	// A crash after the purge committed, before the worker marked it done.
	await prisma.job.update({
		where: { id: job.id },
		data: { status: 'pending', runAt: new Date(0) },
	})

	await processNextJob(jobHandlers)

	expect((await readJob(job.id)).payload).toEqual({
		purged: { erased: 2, keptUnattributed: 1, spliced: 0 },
	})
	info.mockRestore()
})

test('a record that is not three counts is not taken as the first run’s', async () => {
	await prisma.job.deleteMany({})
	await createOrphans()
	const job = await enqueueJob({
		kind: ORPHANED_WORKOUT_PURGE_JOB_KIND,
		payload: { purged: { erased: 'all' } },
	})
	const info = vi.spyOn(console, 'info').mockImplementation(() => {})

	await processNextJob(jobHandlers)

	expect((await readJob(job.id)).payload).toEqual({
		purged: { erased: 2, keptUnattributed: 1, spliced: 0 },
	})
	expect(info).toHaveBeenCalledWith(
		'[orphaned-workout-purge] erased 2, kept unattributed 1, spliced 0',
	)
	info.mockRestore()
})

test('a purge that fails partway erases nothing and is retried', async () => {
	await prisma.job.deleteMany({})
	const { erasable, held } = await createOrphans()
	const job = await enqueueJob({ kind: ORPHANED_WORKOUT_PURGE_JOB_KIND })
	// Fail at the last write inside the purge's transaction, after the erase:
	// the database refuses the record.
	await prisma.$executeRawUnsafe(
		`CREATE TRIGGER purge_record_fails BEFORE UPDATE OF payload ON Job
		BEGIN SELECT RAISE(ABORT, 'disk full'); END`,
	)

	expect(await processNextJob(jobHandlers)).toBe('processed')

	expect(await prisma.workout.count({ where: { id: { in: erasable } } })).toBe(
		2,
	)
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: held.id },
			select: { visibility: true },
		}),
	).toEqual({ visibility: 'public' })
	const row = await readJob(job.id)
	expect(row).toMatchObject({
		status: 'pending',
		attempts: 1,
		lastError: expect.stringContaining('tx.job.update'),
	})
	expect(row.payload).toEqual({})
})

test('a purge a crash stranded in running is retried by the next boot', async () => {
	await prisma.job.deleteMany({})
	const { erasable } = await createOrphans()
	const job = await enqueueJob({ kind: ORPHANED_WORKOUT_PURGE_JOB_KIND })
	// The worker claimed it, then the machine stopped mid-purge (a deploy, a
	// crash): the transaction rolled back, but the row still says `running`.
	await prisma.job.update({
		where: { id: job.id },
		data: {
			status: 'running',
			attempts: 1,
			startedAt: new Date(Date.now() - 60 * 60 * 1000),
		},
	})

	await ensureOrphanedWorkoutPurgeEnqueued()
	const requeued = await readJob(job.id)
	expect(requeued).toMatchObject({ status: 'pending', attempts: 1 })
	await prisma.job.update({
		where: { id: job.id },
		data: { runAt: new Date(0) },
	})
	const info = vi.spyOn(console, 'info').mockImplementation(() => {})
	expect(await processNextJob(jobHandlers)).toBe('processed')
	info.mockRestore()

	expect((await readJob(job.id)).status).toBe('completed')
	expect(await prisma.workout.count({ where: { id: { in: erasable } } })).toBe(
		0,
	)
	expect(
		await prisma.job.count({
			where: { kind: ORPHANED_WORKOUT_PURGE_JOB_KIND },
		}),
	).toBe(1)
})

test('boot leaves a purge that is running now alone', async () => {
	await prisma.job.deleteMany({})
	const job = await enqueueJob({ kind: ORPHANED_WORKOUT_PURGE_JOB_KIND })
	await prisma.job.update({
		where: { id: job.id },
		data: { status: 'running', attempts: 1, startedAt: new Date() },
	})

	await ensureOrphanedWorkoutPurgeEnqueued()

	expect(await readJob(job.id)).toMatchObject({
		status: 'running',
		attempts: 1,
	})
})
