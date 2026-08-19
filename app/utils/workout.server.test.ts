import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { saveLoggedSet } from './strength-log.server.ts'
import { type WorkoutAuthoringInput } from './workout-schema.ts'
import {
	createWorkoutSession,
	deleteWorkoutSession,
	describeLoggedSetRefusal,
	updateWorkoutSession,
	getWorkoutSessionForEdit,
	getExerciseCatalog,
	getRecentExerciseIds,
	createCustomExercise,
	copyWorkout,
	workoutCopySelect,
} from './workout.server.ts'

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

function validInput(
	overrides: Partial<WorkoutAuthoringInput> = {},
): WorkoutAuthoringInput {
	return {
		title: 'Test Session',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'cardio', discipline: 'run', notes: '10 min easy' }],
			},
		],
		...overrides,
	}
}

test('creates a workout session with workout, block, and step', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: { steps: true },
						orderBy: { orderIndex: 'asc' },
					},
				},
			},
		},
	})

	expect(result).not.toBeNull()
	expect(result!.workout!.title).toBe('Test Session')
	expect(result!.workout!.discipline).toBe('run')
	expect(result!.workout!.ownerId).toBe(user.id)
	expect(result!.userId).toBe(user.id)
	expect(result!.status).toBe('scheduled')
	expect(result!.workout!.blocks).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.steps).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.steps[0]!.notes).toBe('10 min easy')
	expect(result!.workout!.blocks[0]!.steps[0]!.kind).toBe('cardio')
})

test('cardio step stores discipline explicitly', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(
		user.id,
		validInput({ discipline: 'swim' }),
	)

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})

	expect(result!.workout!.blocks[0]!.steps[0]!.discipline).toBe('run')
})

test('cardio step with explicit discipline stores that discipline', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Brick',
		discipline: 'bike',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						notes: 'run off the bike',
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})

	expect(result!.workout!.blocks[0]!.steps[0]!.discipline).toBe('run')
})

test('creates multiple blocks with ordered steps (cardio + rest)', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Multi-block',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				name: 'Warm-up',
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 600,
						intensity: { kind: 'zoneLabel' as const, label: 'Z1' },
						notes: 'easy jog',
					},
				],
			},
			{
				name: 'Main Set',
				repeatCount: 5,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 180,
						intensity: { kind: 'zoneLabel' as const, label: 'threshold' },
						notes: 'hard',
					},
					{
						kind: 'rest',
						durationSec: 60,
						notes: 'recover',
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: { steps: { orderBy: { orderIndex: 'asc' } } },
						orderBy: { orderIndex: 'asc' },
					},
				},
			},
		},
	})

	expect(result!.workout!.blocks).toHaveLength(2)
	expect(result!.workout!.blocks[0]!.name).toBe('Warm-up')
	expect(result!.workout!.blocks[0]!.orderIndex).toBe(0)
	expect(result!.workout!.blocks[0]!.repeatCount).toBe(1)
	expect(result!.workout!.blocks[1]!.name).toBe('Main Set')
	expect(result!.workout!.blocks[1]!.orderIndex).toBe(1)
	expect(result!.workout!.blocks[1]!.repeatCount).toBe(5)
	expect(result!.workout!.blocks[1]!.steps).toHaveLength(2)
	expect(result!.workout!.blocks[1]!.steps[0]!.durationSec).toBe(180)
	expect(result!.workout!.blocks[1]!.steps[1]!.kind).toBe('rest')
})

test('persists durationSec and distanceM on cardio steps', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Quantified',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 600,
						notes: 'timed',
					},
					{
						kind: 'cardio',
						discipline: 'run',
						distanceM: 400,
						notes: 'distance',
					},
					{ kind: 'cardio', discipline: 'run', notes: 'unquantified' },
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: { steps: { orderBy: { orderIndex: 'asc' } } },
					},
				},
			},
		},
	})

	const steps = result!.workout!.blocks[0]!.steps
	expect(steps[0]!.durationSec).toBe(600)
	expect(steps[0]!.distanceM).toBeNull()
	expect(steps[1]!.distanceM).toBe(400)
	expect(steps[1]!.durationSec).toBeNull()
	expect(steps[2]!.durationSec).toBeNull()
	expect(steps[2]!.distanceM).toBeNull()
})

test('owner scope: session belongs to the requesting user', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()

	const session = await createWorkoutSession(userA.id, validInput())

	const result = await prisma.workoutSession.findFirst({
		where: { id: session.id, userId: userB.id },
	})
	expect(result).toBeNull()

	const ownerResult = await prisma.workoutSession.findFirst({
		where: { id: session.id, userId: userA.id },
	})
	expect(ownerResult).not.toBeNull()
})

test('workout is 1:1 with session (private workout)', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})

	const sessionsForWorkout = await prisma.workoutSession.findMany({
		where: { workoutId: result!.workoutId },
	})
	expect(sessionsForWorkout).toHaveLength(1)
})

test('deleteWorkoutSession removes session and cascades to private workout', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const before = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})
	const workoutId = before!.workoutId!

	await deleteWorkoutSession(user.id, session.id)

	const deletedSession = await prisma.workoutSession.findUnique({
		where: { id: session.id },
	})
	expect(deletedSession).toBeNull()

	const deletedWorkout = await prisma.workout.findUnique({
		where: { id: workoutId },
	})
	expect(deletedWorkout).toBeNull()
})

test('deleteWorkoutSession enforces owner scope', async () => {
	const owner = await createUserWithPassword()
	const otherUser = await createUserWithPassword()
	const session = await createWorkoutSession(owner.id, validInput())

	const result = await deleteWorkoutSession(otherUser.id, session.id)
	expect(result).toBeNull()

	const stillExists = await prisma.workoutSession.findUnique({
		where: { id: session.id },
	})
	expect(stillExists).not.toBeNull()
})

test('deleteWorkoutSession cascades to session log', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	await prisma.sessionLog.create({
		data: {
			sessionId: session.id,
			content: 'Great workout',
			rpe: 7,
		},
	})

	const logBefore = await prisma.sessionLog.findUnique({
		where: { sessionId: session.id },
	})
	expect(logBefore).not.toBeNull()

	await deleteWorkoutSession(user.id, session.id)

	const logAfter = await prisma.sessionLog.findUnique({
		where: { sessionId: session.id },
	})
	expect(logAfter).toBeNull()
})

test('updateWorkoutSession updates title, discipline, and scheduledAt', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	const updated = await updateWorkoutSession(user.id, session.id, {
		title: 'Updated Title',
		discipline: 'bike',
		intent: 'endurance',
		scheduledAt: new Date('2026-07-01T10:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'cardio', discipline: 'bike', notes: 'easy spin' }],
			},
		],
	})

	expect(updated).toEqual({ ok: true, id: session.id })

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: { include: { steps: true }, orderBy: { orderIndex: 'asc' } },
				},
			},
		},
	})

	expect(result!.workout!.title).toBe('Updated Title')
	expect(result!.workout!.discipline).toBe('bike')
	expect(result!.scheduledAt.toISOString()).toBe('2026-07-01T10:00:00.000Z')
	expect(result!.workout!.blocks).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.steps[0]!.notes).toBe('easy spin')
})

test('updateWorkoutSession replaces entire block/step subtree', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Original',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				name: 'Warm-up',
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 600,
						notes: 'easy jog',
					},
				],
			},
			{
				name: 'Main Set',
				repeatCount: 3,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 300,
						intensity: { kind: 'zoneLabel' as const, label: 'threshold' },
						notes: 'hard',
					},
				],
			},
		],
	})

	await updateWorkoutSession(user.id, session.id, {
		title: 'Revised',
		discipline: 'run',
		intent: 'tempo',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				name: 'Only Block',
				repeatCount: 2,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						distanceM: 400,
						notes: '400m rep',
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: { steps: { orderBy: { orderIndex: 'asc' } } },
						orderBy: { orderIndex: 'asc' },
					},
				},
			},
		},
	})

	expect(result!.workout!.blocks).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.name).toBe('Only Block')
	expect(result!.workout!.blocks[0]!.repeatCount).toBe(2)
	expect(result!.workout!.blocks[0]!.steps).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.steps[0]!.distanceM).toBe(400)
	expect(result!.workout!.blocks[0]!.steps[0]!.notes).toBe('400m rep')
})

test('updateWorkoutSession enforces owner scope', async () => {
	const owner = await createUserWithPassword()
	const otherUser = await createUserWithPassword()
	const session = await createWorkoutSession(owner.id, validInput())

	const result = await updateWorkoutSession(otherUser.id, session.id, {
		title: 'Hijacked',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'cardio', discipline: 'run', notes: 'evil step' }],
			},
		],
	})

	expect(result).toEqual({ ok: false, reason: 'not-found' })

	const unchanged = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: { workout: true },
	})
	expect(unchanged!.workout!.title).toBe('Test Session')
})

// ─── Session Adoption (#460, closing #459) ──────────────────────────────────
// `source` is the origin and keeps its value for life; `adoptedAt` is the
// takeover. The first adopting save forks the machine's Workout aside instead of
// deleting its blocks.

/** A Generated Session, as Plan Generation persistence would have left one. */
async function generatedSession(userId: string) {
	const session = await createWorkoutSession(userId, validInput())
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { source: 'generated' },
	})
	return session
}

/** A `detected` session carrying an auto-materialized Workout (ADR 0033). */
async function detectedSession(userId: string) {
	const session = await createWorkoutSession(userId, validInput())
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { source: 'detected' },
	})
	return session
}

test('editing a generated session adopts it — origin survives, adoptedAt is stamped', async () => {
	const user = await createUserWithPassword()
	const session = await generatedSession(user.id)

	await updateWorkoutSession(user.id, session.id, {
		title: 'Tweaked by athlete',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-07-01T10:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'cardio', discipline: 'run', notes: 'my tweak' }],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { source: true, adoptedAt: true },
	})
	// The origin is history and history is immutable (ADR 0012) — it used to be
	// overwritten to record the takeover.
	expect(result!.source).toBe('generated')
	expect(result!.adoptedAt).not.toBeNull()
})

test('rescheduling a detected session does not adopt it — re-detection survives (#459)', async () => {
	const user = await createUserWithPassword()
	const session = await detectedSession(user.id)
	const before = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})

	// The athlete's action was "move this to Saturday", and nothing else.
	await updateWorkoutSession(
		user.id,
		session.id,
		validInput({ scheduledAt: new Date('2026-06-06T08:00:00.000Z') }),
	)

	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: {
			source: true,
			adoptedAt: true,
			workoutId: true,
			scheduledAt: true,
		},
	})
	expect(after!.source).toBe('detected')
	expect(after!.adoptedAt).toBeNull()
	expect(after!.scheduledAt).toEqual(new Date('2026-06-06T08:00:00.000Z'))
	// No fork either: nothing was superseded, so nothing was preserved.
	expect(after!.workoutId).toBe(before!.workoutId)
})

test('saving a detected session with nothing changed does not adopt it', async () => {
	const user = await createUserWithPassword()
	const session = await detectedSession(user.id)

	await updateWorkoutSession(user.id, session.id, validInput())

	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { source: true, adoptedAt: true },
	})
	expect(after!.adoptedAt).toBeNull()
	expect(after!.source).toBe('detected')
})

test('renaming a detected session does not adopt it — a title is not the prescription', async () => {
	const user = await createUserWithPassword()
	const session = await detectedSession(user.id)

	await updateWorkoutSession(
		user.id,
		session.id,
		validInput({ title: 'Saturday intervals' }),
	)

	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: {
			source: true,
			adoptedAt: true,
			workout: { select: { title: true } },
		},
	})
	expect(after!.adoptedAt).toBeNull()
	expect(after!.workout!.title).toBe('Saturday intervals')
})

test('changing the intent of a detected session adopts it', async () => {
	const user = await createUserWithPassword()
	const session = await detectedSession(user.id)

	await updateWorkoutSession(
		user.id,
		session.id,
		validInput({ intent: 'threshold' }),
	)

	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { adoptedAt: true },
	})
	expect(after!.adoptedAt).not.toBeNull()
})

test('the first adopting edit forks: the pre-edit prescription is preserved, not deleted', async () => {
	const user = await createUserWithPassword()
	const session = await detectedSession(user.id)
	const before = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})
	const machineWorkoutId = before!.workoutId!

	await updateWorkoutSession(
		user.id,
		session.id,
		validInput({
			blocks: [
				{
					repeatCount: 6,
					steps: [
						{
							kind: 'cardio',
							discipline: 'run',
							distanceM: 1000,
							notes: 'the athlete counted six, not five',
						},
					],
				},
			],
		}),
	)

	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: {
			workoutId: true,
			workout: {
				select: {
					copiedFromId: true,
					ownerId: true,
					blocks: { select: { repeatCount: true } },
				},
			},
		},
	})
	// The session points at a *new* Workout that back-points at the machine's.
	expect(after!.workoutId).not.toBe(machineWorkoutId)
	expect(after!.workout!.copiedFromId).toBe(machineWorkoutId)
	expect(after!.workout!.ownerId).toBe(user.id)
	expect(after!.workout!.blocks[0]!.repeatCount).toBe(6)

	// The machine's row is still there, untouched — this is what the drawer's
	// `90 min → 75 min` diff is read from.
	const preserved = await prisma.workout.findUnique({
		where: { id: machineWorkoutId },
		select: { blocks: { select: { repeatCount: true } } },
	})
	expect(preserved).not.toBeNull()
	expect(preserved!.blocks[0]!.repeatCount).toBe(1)
})

test('a second edit of an adopted session rewrites in place — the lineage stays one hop', async () => {
	const user = await createUserWithPassword()
	const session = await detectedSession(user.id)

	await updateWorkoutSession(
		user.id,
		session.id,
		validInput({
			blocks: [
				{ repeatCount: 6, steps: [{ kind: 'cardio', discipline: 'run' }] },
			],
		}),
	)
	const firstEdit = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true, adoptedAt: true },
	})

	await updateWorkoutSession(
		user.id,
		session.id,
		validInput({
			blocks: [
				{ repeatCount: 8, steps: [{ kind: 'cardio', discipline: 'run' }] },
			],
		}),
	)
	const secondEdit = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: {
			workoutId: true,
			adoptedAt: true,
			workout: { select: { blocks: { select: { repeatCount: true } } } },
		},
	})

	expect(secondEdit!.workoutId).toBe(firstEdit!.workoutId)
	expect(secondEdit!.adoptedAt).toEqual(firstEdit!.adoptedAt)
	expect(secondEdit!.workout!.blocks[0]!.repeatCount).toBe(8)
	// Exactly one preserved ancestor, ever.
	expect(
		await prisma.workout.count({
			where: { copies: { some: { id: secondEdit!.workoutId! } } },
		}),
	).toBe(1)
})

test('deleting an adopted session takes its preserved pre-edit Workout with it', async () => {
	const user = await createUserWithPassword()
	const session = await detectedSession(user.id)
	const before = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})
	const machineWorkoutId = before!.workoutId!

	await updateWorkoutSession(
		user.id,
		session.id,
		validInput({
			blocks: [
				{ repeatCount: 6, steps: [{ kind: 'cardio', discipline: 'run' }] },
			],
		}),
	)
	const adopted = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})

	await deleteWorkoutSession(user.id, session.id)

	// `copiedFromId` is SetNull, so the preserved row outlives its descendant and
	// the session's own cascade can never reach it — the lineage walk must.
	expect(
		await prisma.workout.findUnique({ where: { id: machineWorkoutId } }),
	).toBeNull()
	expect(
		await prisma.workout.findUnique({ where: { id: adopted!.workoutId! } }),
	).toBeNull()
})

test('deleting an adopted session never collects a Catalogue row it descends from', async () => {
	const user = await createUserWithPassword()
	// A Stock Workout the athlete's prescription was forked from (ADR 0051).
	const stock = await prisma.workout.create({
		data: {
			title: 'Daniels progression',
			discipline: 'run',
			intent: 'endurance',
			// Authored on the Workout since ADR 0055; the entry's column is pinned to
			// it by the three-column foreign key, so the nested create takes it from
			// the relation rather than restating it.
			archetype: 'threshold',
			authorship: 'system',
			catalogueEntry: { create: {} },
		},
		select: { id: true },
	})
	const session = await createWorkoutSession(user.id, validInput())
	const created = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { workoutId: true },
	})
	await prisma.workout.update({
		where: { id: created!.workoutId! },
		data: { copiedFromId: stock.id },
	})

	await deleteWorkoutSession(user.id, session.id)

	expect(
		await prisma.workout.findUnique({ where: { id: stock.id } }),
	).not.toBeNull()
})

test('editing an authored session leaves its source authored', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())

	await updateWorkoutSession(user.id, session.id, {
		title: 'Edited',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-07-01T10:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'cardio', discipline: 'run', notes: 'edit' }],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { source: true },
	})
	expect(result!.source).toBe('authored')
})

test('updating a session clears its Replan Note — a note never explains a prescription that no longer exists', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, validInput())
	// As the Week Replan applier would have left it (ADR 0025 §4).
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: {
			replanReason:
				'Last week ran 25% over plan and Form was −12 — softened this session ~20%.',
		},
	})

	await updateWorkoutSession(
		user.id,
		session.id,
		validInput({ title: 'Rewritten by athlete' }),
	)

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { replanReason: true },
	})
	expect(result!.replanReason).toBeNull()
})

test('getWorkoutSessionForEdit returns session data for owner', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Editable Session',
		discipline: 'swim',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-15T07:00:00.000Z'),
		blocks: [
			{
				name: 'Main',
				repeatCount: 2,
				steps: [
					{
						kind: 'cardio',
						discipline: 'swim',
						durationSec: 300,
						intensity: { kind: 'zoneLabel' as const, label: 'Z2' },
						notes: 'pull',
					},
				],
			},
		],
	})

	const result = await getWorkoutSessionForEdit(user.id, session.id)

	expect(result).not.toBeNull()
	expect(result!.workout!.title).toBe('Editable Session')
	expect(result!.workout!.discipline).toBe('swim')
	expect(result!.workout!.blocks).toHaveLength(1)
	expect(result!.workout!.blocks[0]!.name).toBe('Main')
	expect(result!.workout!.blocks[0]!.repeatCount).toBe(2)
	expect(result!.workout!.blocks[0]!.steps[0]!.durationSec).toBe(300)
	expect(result!.workout!.blocks[0]!.steps[0]!.intensity).toBe(
		JSON.stringify({ kind: 'zoneLabel', label: 'Z2' }),
	)
	expect(result!.workout!.blocks[0]!.steps[0]!.kind).toBe('cardio')
})

test('getWorkoutSessionForEdit returns null for non-owner', async () => {
	const owner = await createUserWithPassword()
	const other = await createUserWithPassword()
	const session = await createWorkoutSession(owner.id, validInput())

	const result = await getWorkoutSessionForEdit(other.id, session.id)
	expect(result).toBeNull()
})

test('creates strength step with exercise sets', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'Lower Body',
		discipline: 'strength',
		intent: 'strength-max',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'strength',
						exerciseId: 'ex_bb_back_squat',
						restBetweenSetsSec: 90,
						sets: [
							{ kind: 'reps', orderIndex: 0, reps: 5, weightKg: 100 },
							{ kind: 'reps', orderIndex: 1, reps: 5, weightKg: 100 },
							{ kind: 'reps', orderIndex: 2, reps: 5, weightKg: 100 },
						],
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: {
						include: {
							steps: {
								include: {
									sets: { orderBy: { orderIndex: 'asc' } },
									exercise: true,
								},
							},
						},
					},
				},
			},
		},
	})

	const step = result!.workout!.blocks[0]!.steps[0]!
	expect(step.kind).toBe('strength')
	expect(step.exerciseId).toBe('ex_bb_back_squat')
	expect(step.exercise!.name).toBe('Back Squat')
	expect(step.restBetweenSetsSec).toBe(90)
	expect(step.sets).toHaveLength(3)
	expect(step.sets[0]!.kind).toBe('reps')
	expect(step.sets[0]!.reps).toBe(5)
	expect(step.sets[0]!.weightKg).toBe(100)
})

test('creates rest step with durationSec', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(user.id, {
		title: 'With Rest',
		discipline: 'strength',
		intent: 'strength-max',
		scheduledAt: new Date('2026-06-01T08:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'rest',
						durationSec: 90,
						notes: 'Rest between sets',
					},
				],
			},
		],
	})

	const result = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		include: {
			workout: {
				include: {
					blocks: { include: { steps: true } },
				},
			},
		},
	})

	const step = result!.workout!.blocks[0]!.steps[0]!
	expect(step.kind).toBe('rest')
	expect(step.durationSec).toBe(90)
	expect(step.notes).toBe('Rest between sets')
})

test('getExerciseCatalog returns seed exercises plus custom exercises for user', async () => {
	const user = await createUserWithPassword()

	const before = await getExerciseCatalog(user.id)
	const seedCount = before.length
	expect(seedCount).toBeGreaterThan(0)

	const custom = await createCustomExercise(user.id, {
		name: 'Kettlebell Swing',
		primaryMuscle: 'glutes',
		equipment: 'kettlebell',
		isCompound: true,
	})

	const after = await getExerciseCatalog(user.id)
	expect(after).toHaveLength(seedCount + 1)
	expect(after.some((ex) => ex.id === custom.id)).toBe(true)
})

test('getExerciseCatalog does not return other users custom exercises', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()

	await createCustomExercise(userA.id, {
		name: 'UserA Secret Move',
		primaryMuscle: 'chest',
	})

	const catalogForB = await getExerciseCatalog(userB.id)
	expect(catalogForB.some((ex) => ex.name === 'UserA Secret Move')).toBe(false)
})

test('getRecentExerciseIds returns exercise ids from recent strength steps, newest session first, deduped', async () => {
	const user = await createUserWithPassword()

	const squat = await createCustomExercise(user.id, {
		name: 'Recent Squat',
		primaryMuscle: 'quads',
	})
	const bench = await createCustomExercise(user.id, {
		name: 'Recent Bench',
		primaryMuscle: 'chest',
	})

	function strengthInput(scheduledAt: string, exerciseIds: string[]) {
		return validInput({
			discipline: 'strength',
			intent: 'strength-max',
			scheduledAt: new Date(scheduledAt),
			blocks: [
				{
					repeatCount: 1,
					steps: exerciseIds.map((exerciseId) => ({
						kind: 'strength' as const,
						exerciseId,
						sets: [{ orderIndex: 0, kind: 'reps' as const, reps: 5 }],
					})),
				},
			],
		})
	}

	// Older session: squat. Newer session: bench then squat again (dupe).
	await createWorkoutSession(
		user.id,
		strengthInput('2026-05-01T08:00:00.000Z', [squat.id]),
	)
	await createWorkoutSession(
		user.id,
		strengthInput('2026-06-01T08:00:00.000Z', [bench.id, squat.id]),
	)
	// A cardio session in between contributes nothing.
	await createWorkoutSession(
		user.id,
		validInput({ scheduledAt: new Date('2026-05-15T08:00:00.000Z') }),
	)

	const ids = await getRecentExerciseIds(user.id)
	expect(ids).toEqual([bench.id, squat.id])
})

test('getRecentExerciseIds is scoped to the athlete', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()

	const squat = await createCustomExercise(userA.id, {
		name: 'A-only Squat',
		primaryMuscle: 'quads',
	})
	await createWorkoutSession(
		userA.id,
		validInput({
			discipline: 'strength',
			intent: 'strength-max',
			blocks: [
				{
					repeatCount: 1,
					steps: [
						{
							kind: 'strength' as const,
							exerciseId: squat.id,
							sets: [{ orderIndex: 0, kind: 'reps' as const, reps: 5 }],
						},
					],
				},
			],
		}),
	)

	expect(await getRecentExerciseIds(userA.id)).toEqual([squat.id])
	expect(await getRecentExerciseIds(userB.id)).toEqual([])
})

// ——— #450: the structure and quantities survive the write and the deep copy ——

test('a full-expressiveness session round-trips through create, read and copy', async () => {
	const user = await createUserWithPassword()
	const session = await createWorkoutSession(
		user.id,
		validInput({
			discipline: 'bike',
			blocks: [
				{
					name: 'Ronnestad',
					// 3 x (13 x 30/15) — the shape one repeat level could not say.
					seriesRepeatCount: 3,
					repeatCount: 13,
					betweenSeriesRestSec: 180,
					steps: [
						{
							kind: 'cardio',
							discipline: 'bike',
							durationSec: 30,
							cadenceRpmMin: 95,
							cadenceRpmMax: 105,
							gradePct: 4.5,
						},
						{ kind: 'rest', rest: { kind: 'toHr', belowBpm: 120 } },
					],
				},
				{
					name: 'Vertical',
					repeatCount: 1,
					steps: [{ kind: 'cardio', discipline: 'run', verticalM: 1000 }],
				},
			],
		}),
	)

	const stored = await prisma.workoutSession.findFirstOrThrow({
		where: { id: session.id },
		select: { workoutId: true },
	})
	const source = await prisma.workout.findFirstOrThrow({
		where: { id: stored.workoutId! },
		select: workoutCopySelect,
	})
	const [work, vertical] = source.blocks
	expect(work!.seriesRepeatCount).toBe(3)
	expect(work!.repeatCount).toBe(13)
	expect(work!.betweenSeriesRestSec).toBe(180)
	const [interval, rest] = work!.steps
	expect(interval!.cadenceRpmMin).toBe(95)
	expect(interval!.cadenceRpmMax).toBe(105)
	expect(interval!.gradePct).toBe(4.5)
	expect(vertical!.steps[0]!.verticalM).toBe(1000)
	// An HR recovery has no duration, so the column every duration reader
	// trusts stays empty rather than carrying a guess.
	expect(JSON.parse(rest!.rest!)).toEqual({ kind: 'toHr', belowBpm: 120 })
	expect(rest!.durationSec).toBeNull()

	const copy = await prisma.$transaction((tx) =>
		copyWorkout(tx, source, user.id),
	)
	const copied = await prisma.workout.findFirstOrThrow({
		where: { id: copy.id },
		select: workoutCopySelect,
	})
	// A copy that quietly differs from its source is the one thing the deep
	// copy may not do — so every new field travels with it.
	expect(copied.blocks).toEqual(source.blocks)
})

test('a swim block carries its send-off, and a strength set its three axes', async () => {
	const user = await createUserWithPassword()
	const exercise = await prisma.exercise.create({
		select: { id: true },
		data: { name: 'Half squat', primaryMuscle: 'quads', isCompound: true },
	})
	const session = await createWorkoutSession(
		user.id,
		validInput({
			discipline: 'swim',
			blocks: [
				{
					repeatCount: 10,
					// Anchored, never absolute: a shared Catalogue cannot ship a
					// send-off that means a different session per swimmer.
					sendOff: { kind: 'anchored', anchor: 'css', allowanceSecPer100m: 10 },
					steps: [{ kind: 'cardio', discipline: 'swim', distanceM: 100 }],
				},
				{
					repeatCount: 3,
					steps: [
						{
							kind: 'strength',
							exerciseId: exercise.id,
							sets: [
								{
									orderIndex: 0,
									kind: 'toRir',
									terminationRir: 1,
									load: { kind: 'repMax', reps: 10 },
									effortCap: { kind: 'rir', min: 1, max: 2 },
									tempo: '2-0-X',
								},
							],
						},
					],
				},
			],
		}),
	)

	const row = await prisma.workoutSession.findFirstOrThrow({
		where: { id: session.id },
		select: { workoutId: true },
	})
	const stored = await prisma.workout.findFirstOrThrow({
		where: { id: row.workoutId! },
		select: workoutCopySelect,
	})
	expect(JSON.parse(stored.blocks[0]!.sendOff!)).toEqual({
		kind: 'anchored',
		anchor: 'css',
		allowanceSecPer100m: 10,
	})
	const set = stored.blocks[1]!.steps[0]!.sets[0]!
	expect(set.kind).toBe('toRir')
	expect(set.terminationRir).toBe(1)
	expect(JSON.parse(set.load!)).toEqual({ kind: 'repMax', reps: 10 })
	expect(JSON.parse(set.effortCap!)).toEqual({ kind: 'rir', min: 1, max: 2 })
	expect(set.tempo).toBe('2-0-X')
	// A rep-max reference has no kilo and no percentage to mirror into, so
	// both legacy columns stay null instead of inventing one.
	expect(set.weightKg).toBeNull()
	expect(set.pct1RM).toBeNull()
})

// ── The athlete's logged sets are not the prescription (ADR 0056 §2) ─────────
// The ship blocker: an inline edit that changed one step's exercise gave every
// `WorkoutStep` a new id, and `ExerciseSetLog.stepId` cascaded — five logged
// sets gone, with no warning and no undo. Three guarantees are tested here: an
// ordinary edit keeps the ids and therefore the sets, an edit that would change
// what a step *is* is refused and says so, and the upsert key the double-tap
// guarantee rests on still holds now that `stepId` is nullable.

async function createLift(name: string) {
	return prisma.exercise.create({
		select: { id: true, name: true },
		data: { name, primaryMuscle: 'chest', equipment: 'barbell' },
	})
}

/** A scheduled strength session prescribing `3 × 5` of one lift. */
function strengthInput(
	exerciseId: string,
	overrides: { reps?: number; weightKg?: number } = {},
): WorkoutAuthoringInput {
	return {
		title: 'Push day',
		discipline: 'strength',
		intent: 'strength-max',
		scheduledAt: new Date('2026-08-19T17:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'strength' as const,
						exerciseId,
						restBetweenSetsSec: 120,
						sets: [0, 1, 2].map((orderIndex) => ({
							orderIndex,
							kind: 'reps' as const,
							reps: overrides.reps ?? 5,
							weightKg: overrides.weightKg ?? 60,
						})),
					},
				],
			},
		],
	}
}

async function firstStepOf(sessionId: string) {
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: {
			workout: {
				select: {
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: { id: true, exerciseId: true },
							},
						},
					},
				},
			},
		},
	})
	return session.workout!.blocks[0]!.steps[0]!
}

test('a logged set survives an edit to the prescription it answered', async () => {
	const user = await createUserWithPassword()
	const dip = await createLift('Dip')
	const session = await createWorkoutSession(user.id, strengthInput(dip.id))
	const step = await firstStepOf(session.id)

	const logged = await prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId: session.id,
			stepId: step.id,
			exerciseId: dip.id,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'bodyweightPlus', addedKg: 20 }),
			effectiveKg: 100,
			bodyweightKg: 80,
			reps: 8,
		},
	})

	// The prescription is rewritten around the set the athlete already did: the
	// same lift, heavier, with a fourth set added and the rest shortened.
	const result = await updateWorkoutSession(user.id, session.id, {
		...strengthInput(dip.id, { reps: 3, weightKg: 80 }),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'strength' as const,
						exerciseId: dip.id,
						restBetweenSetsSec: 180,
						sets: [0, 1, 2, 3].map((orderIndex) => ({
							orderIndex,
							kind: 'reps' as const,
							reps: 3,
							weightKg: 80,
						})),
					},
				],
			},
		],
	})
	expect(result).toEqual({ ok: true, id: session.id })

	// The set is still there, still says what the athlete did, and still points at
	// the step it answered — the id is stable across the edit, so no cascade could
	// have fired.
	const after = await prisma.exerciseSetLog.findUnique({
		where: { id: logged.id },
		select: { stepId: true, reps: true, effectiveKg: true, exerciseId: true },
	})
	expect(after).toEqual({
		stepId: step.id,
		reps: 8,
		effectiveKg: 100,
		exerciseId: dip.id,
	})

	// And the edit really did land.
	const edited = await prisma.workoutStep.findUniqueOrThrow({
		where: { id: step.id },
		select: {
			restBetweenSetsSec: true,
			sets: { orderBy: { orderIndex: 'asc' }, select: { reps: true } },
		},
	})
	expect(edited.restBetweenSetsSec).toBe(180)
	expect(edited.sets.map((set) => set.reps)).toEqual([3, 3, 3, 3])
})

test('an edit that would change what a step is refuses instead of destroying the sets logged against it', async () => {
	const user = await createUserWithPassword()
	const dip = await createLift('Dip')
	const bench = await createLift('Bench press')
	const session = await createWorkoutSession(user.id, strengthInput(dip.id))
	const step = await firstStepOf(session.id)

	for (const orderIndex of [0, 1, 2, 3, 4]) {
		await prisma.exerciseSetLog.create({
			data: {
				sessionId: session.id,
				stepId: step.id,
				exerciseId: dip.id,
				orderIndex,
				role: 'working',
				outcome: 'completed',
				load: JSON.stringify({ kind: 'bodyweight' }),
				effectiveKg: 80,
				reps: 8,
			},
		})
	}

	const result = await updateWorkoutSession(
		user.id,
		session.id,
		strengthInput(bench.id),
	)

	expect(result).toEqual({
		ok: false,
		reason: 'logged-sets',
		refusals: [
			{
				blockIndex: 0,
				stepIndex: 0,
				exerciseName: 'Dip',
				loggedSetCount: 5,
				change: 'exercise-changed',
			},
		],
	})
	expect(
		describeLoggedSetRefusal({
			blockIndex: 0,
			stepIndex: 0,
			exerciseName: 'Dip',
			loggedSetCount: 5,
			change: 'exercise-changed',
		}),
	).toMatch(/5 sets are logged against Dip/)

	// Nothing was written: the five sets stand, and the step is still a Dip.
	expect(
		await prisma.exerciseSetLog.count({ where: { stepId: step.id } }),
	).toBe(5)
	expect((await firstStepOf(session.id)).exerciseId).toBe(dip.id)
})

test('dropping a step the athlete has already lifted is refused, and dropping an untouched one is not', async () => {
	const user = await createUserWithPassword()
	const dip = await createLift('Dip')
	const session = await createWorkoutSession(user.id, strengthInput(dip.id))
	const step = await firstStepOf(session.id)

	const emptied = await updateWorkoutSession(user.id, session.id, {
		...strengthInput(dip.id),
		blocks: [{ repeatCount: 1, steps: [] }],
	})
	expect(emptied).toEqual({ ok: true, id: session.id })

	// Now with a set against it, the same edit is refused.
	const restored = await createWorkoutSession(user.id, strengthInput(dip.id))
	const restoredStep = await firstStepOf(restored.id)
	await prisma.exerciseSetLog.create({
		data: {
			sessionId: restored.id,
			stepId: restoredStep.id,
			exerciseId: dip.id,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'bodyweight' }),
			effectiveKg: 80,
			reps: 8,
		},
	})
	const refused = await updateWorkoutSession(user.id, restored.id, {
		...strengthInput(dip.id),
		blocks: [{ repeatCount: 1, steps: [] }],
	})
	expect(refused).toMatchObject({
		ok: false,
		reason: 'logged-sets',
		refusals: [{ change: 'step-removed', loggedSetCount: 1 }],
	})
	expect(
		await prisma.exerciseSetLog.count({ where: { stepId: restoredStep.id } }),
	).toBe(1)
	// The first step, which nobody had lifted, is gone as asked.
	expect(
		await prisma.workoutStep.findUnique({ where: { id: step.id } }),
	).toBeNull()
})

test('logging is still an upsert, so the between-sets double-tap cannot log a set twice', async () => {
	const user = await createUserWithPassword()
	const dip = await createLift('Dip')
	const session = await createWorkoutSession(user.id, strengthInput(dip.id))
	const step = await firstStepOf(session.id)

	// A set that was logged against a *deleted* prescription slot: `stepId` is now
	// nullable, and this is the row that made the key worth re-checking. SQLite
	// treats NULLs as distinct, so it neither blocks nor is matched by the live
	// upsert below on the same `(sessionId, orderIndex)`.
	const detached = await prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId: session.id,
			stepId: null,
			exerciseId: dip.id,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'bodyweight' }),
			effectiveKg: 80,
			reps: 6,
		},
	})

	const tap = () =>
		saveLoggedSet({
			athleteId: user.id,
			sessionId: session.id,
			stepId: step.id,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			toFailure: false,
			load: { kind: 'external', kg: 60 },
			reps: 5,
			repsLeft: null,
			durationSec: null,
			rir: null,
			restTakenSec: null,
		})

	const first = await tap()
	const second = await tap()
	expect(first.ok).toBe(true)
	expect(second.ok).toBe(true)
	expect(first.ok && second.ok && first.id === second.id).toBe(true)

	const rows = await prisma.exerciseSetLog.findMany({
		where: { sessionId: session.id },
		select: { id: true, stepId: true },
	})
	expect(rows).toHaveLength(2)
	expect(rows.filter((row) => row.stepId === step.id)).toHaveLength(1)
	expect(rows.filter((row) => row.id === detached.id)).toHaveLength(1)
})

test('adopting a generated session carries the sets already logged onto the forked prescription', async () => {
	const user = await createUserWithPassword()
	const dip = await createLift('Dip')
	const session = await createWorkoutSession(user.id, strengthInput(dip.id))
	// The engine wrote this one, so the first real edit forks rather than
	// overwrites (#460).
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { source: 'generated' },
	})
	const step = await firstStepOf(session.id)
	const logged = await prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId: session.id,
			stepId: step.id,
			exerciseId: dip.id,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'bodyweight' }),
			effectiveKg: 80,
			reps: 8,
		},
	})

	const result = await updateWorkoutSession(
		user.id,
		session.id,
		strengthInput(dip.id, { reps: 3 }),
	)
	expect(result).toEqual({ ok: true, id: session.id })

	// The machine's Workout is left exactly as found, so nothing was deleted and
	// no cascade fired — but the session reads a new subtree, and the athlete's set
	// belongs to the slot they lifted it in rather than to an orphaned old Step.
	const forkedStep = await firstStepOf(session.id)
	expect(forkedStep.id).not.toBe(step.id)
	const after = await prisma.exerciseSetLog.findUniqueOrThrow({
		where: { id: logged.id },
		select: { stepId: true, reps: true },
	})
	expect(after).toEqual({ stepId: forkedStep.id, reps: 8 })
})
