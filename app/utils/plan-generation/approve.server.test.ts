import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	getSessionByIdForUser,
	getUpcomingSessions,
} from '#app/utils/training.server.ts'
import { type ResolvedIntensity } from '#app/utils/zones/resolve.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { persistApprovedPlan } from './approve.server.ts'
import { type PreviewSession } from './preview.ts'
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

const input: PlanGenerationInput = {
	disciplines: ['run'],
	experience: 'intermediate',
	goal: 'Run a sub-2:00 half marathon',
	horizonWeeks: 8,
}

const outline: PlanOutline = {
	phases: [
		{ name: 'Base', weeks: 8, focus: 'Aerobic base', weeklyLoadHours: 6 },
	],
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
		scheduledAt: new Date('2026-06-10T18:00:00.000Z'),
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

/** A single-cardio-step session whose Step carries a resolved Intensity Target. */
function resolvedSession({
	resolvedIntensity,
}: {
	resolvedIntensity: ResolvedIntensity
}): PreviewSession {
	const base = scheduledSession()
	return {
		...base,
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
						resolvedIntensity,
					},
				],
			},
		],
	}
}

test('approving with no Event auto-creates a fitness-goal Event with the Plan Outline', async () => {
	const user = await createUserWithPassword()

	const result = await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [scheduledSession()],
		generatedByModel: 'stub-v1',
	})

	const event = await prisma.event.findUnique({
		where: { id: result.eventId },
		select: {
			kind: true,
			name: true,
			athleteId: true,
			disciplines: true,
			planOutline: true,
		},
	})

	expect(event).not.toBeNull()
	expect(event!.kind).toBe('fitness-goal')
	expect(event!.athleteId).toBe(user.id)
	expect(event!.name).toBe('Run a sub-2:00 half marathon')
	expect(JSON.parse(event!.disciplines!)).toEqual(['run'])
	expect(JSON.parse(event!.planOutline!)).toEqual(outline)
})

test('each generated session persists with provenance and the Target Event anchor', async () => {
	const user = await createUserWithPassword()

	const result = await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [
			scheduledSession({ title: 'Easy run' }),
			scheduledSession({
				title: 'Tempo run',
				orderInWeek: 1,
				scheduledAt: new Date('2026-06-12T18:00:00.000Z'),
			}),
		],
		generatedByModel: 'stub-v1',
	})

	expect(result.sessionIds).toHaveLength(2)

	const sessions = await prisma.workoutSession.findMany({
		where: { id: { in: result.sessionIds } },
		select: {
			source: true,
			generationId: true,
			generatedByModel: true,
			generatedAt: true,
			targetEventId: true,
			workout: { select: { title: true } },
		},
	})

	expect(sessions).toHaveLength(2)
	for (const session of sessions) {
		expect(session.source).toBe('generated')
		expect(session.generatedByModel).toBe('stub-v1')
		expect(session.generatedAt).not.toBeNull()
		expect(session.targetEventId).toBe(result.eventId)
		// All sessions from one approval share a single generationId.
		expect(session.generationId).toBe(result.generationId)
	}
	expect(result.generationId).toBeTruthy()
})

test('approving against an existing Target Event reuses it and writes the Outline', async () => {
	const user = await createUserWithPassword()

	const existing = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: 'Oslo Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2026-09-01'),
			disciplines: JSON.stringify(['run']),
			status: 'planned',
		},
		select: { id: true },
	})

	const before = await prisma.event.count({ where: { athleteId: user.id } })

	const result = await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [scheduledSession()],
		generatedByModel: 'stub-v1',
		targetEventId: existing.id,
	})

	expect(result.eventId).toBe(existing.id)

	const after = await prisma.event.count({ where: { athleteId: user.id } })
	expect(after).toBe(before) // no duplicate Event created

	const event = await prisma.event.findUnique({
		where: { id: existing.id },
		select: { planOutline: true },
	})
	expect(JSON.parse(event!.planOutline!)).toEqual(outline)
})

test('rejects a Target Event owned by another athlete', async () => {
	const owner = await createUserWithPassword()
	const intruder = await createUserWithPassword()

	const event = await prisma.event.create({
		data: {
			athleteId: owner.id,
			name: 'Private Race',
			kind: 'race',
			priority: 'C',
			startDate: new Date('2026-09-01'),
			disciplines: JSON.stringify(['run']),
			status: 'planned',
		},
		select: { id: true },
	})

	await expect(
		persistApprovedPlan(intruder.id, {
			input,
			outline,
			sessions: [scheduledSession()],
			generatedByModel: 'stub-v1',
			targetEventId: event.id,
		}),
	).rejects.toThrow()

	// Nothing was written for the intruder.
	const count = await prisma.workoutSession.count({
		where: { userId: intruder.id },
	})
	expect(count).toBe(0)
})

test('persisted sessions surface in the ledger and open with a Workout Shape', async () => {
	const user = await createUserWithPassword()
	// Schedule into the upcoming horizon so the ledger query picks it up.
	const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

	const result = await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [scheduledSession({ scheduledAt: soon })],
		generatedByModel: 'stub-v1',
	})

	const upcoming = await getUpcomingSessions(user.id)
	expect(upcoming.map((s) => s.id)).toContain(result.sessionIds[0])
	expect(upcoming[0]!.source).toBe('generated')

	const detail = await getSessionByIdForUser(user.id, result.sessionIds[0]!)
	expect(detail).not.toBeNull()
	expect(detail!.workout!.blocks[0]!.steps[0]!.kind).toBe('cardio')
})

test('persists the cached intensity ranges resolved upstream on the shared path', async () => {
	const user = await createUserWithPassword()

	// The shared generation path resolves intensities before persistence; this
	// seam just writes the ranges it is handed, so the saved Step matches the
	// Plan Preview rather than being re-resolved here.
	const result = await persistApprovedPlan(user.id, {
		input,
		outline,
		generatedByModel: 'stub-v1',
		sessions: [
			resolvedSession({ resolvedIntensity: { hrMin: 145, hrMax: 151 } }),
		],
	})

	const detail = await getSessionByIdForUser(user.id, result.sessionIds[0]!)
	const step = detail!.workout!.blocks[0]!.steps[0]!
	expect(step.intensityHrMin).toBe(145)
	expect(step.intensityHrMax).toBe(151)
})

test('regenerating replaces future still-scheduled generated sessions, leaving the rest', async () => {
	const user = await createUserWithPassword()
	const now = new Date('2026-06-07T00:00:00.000Z')

	// First approval auto-creates the Target Event with two future generated
	// sessions.
	const first = await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [
			scheduledSession({
				title: 'Will complete',
				scheduledAt: new Date('2026-06-10T18:00:00.000Z'),
			}),
			scheduledSession({
				title: 'Future generated',
				orderInWeek: 1,
				scheduledAt: new Date('2026-06-17T18:00:00.000Z'),
			}),
		],
		generatedByModel: 'stub-v1',
		now,
	})
	const eventId = first.eventId
	const [completedId, futureGeneratedId] = first.sessionIds

	// Mark the first generated session completed — it must survive regeneration.
	await prisma.workoutSession.update({
		where: { id: completedId },
		data: { status: 'completed' },
	})

	// A past generated session (already happened) must also survive: only the
	// future window is regenerated.
	const pastGenerated = await prisma.workoutSession.create({
		data: {
			userId: user.id,
			scheduledAt: new Date('2026-06-01T18:00:00.000Z'),
			status: 'scheduled',
			source: 'generated',
			generationId: first.generationId,
			targetEventId: eventId,
		},
		select: { id: true },
	})

	// An authored session anchored to the same Event must survive untouched.
	const authored = await prisma.workoutSession.create({
		data: {
			userId: user.id,
			scheduledAt: new Date('2026-06-20T18:00:00.000Z'),
			status: 'scheduled',
			source: 'authored',
			targetEventId: eventId,
		},
		select: { id: true },
	})

	// Regenerate against the existing Event.
	const regen = await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [
			scheduledSession({
				title: 'Fresh generated',
				scheduledAt: new Date('2026-06-24T18:00:00.000Z'),
			}),
		],
		generatedByModel: 'stub-v1',
		targetEventId: eventId,
		now,
		replaceFutureGenerated: true,
	})

	const surviving = await prisma.workoutSession.findMany({
		where: { userId: user.id },
		select: { id: true },
	})
	const survivingIds = surviving.map((s) => s.id)

	// The future, still-scheduled, generated session was replaced.
	expect(survivingIds).not.toContain(futureGeneratedId)
	// Completed, past-generated, and authored sessions all survive.
	expect(survivingIds).toContain(completedId)
	expect(survivingIds).toContain(pastGenerated.id)
	expect(survivingIds).toContain(authored.id)
	// The fresh generated session is present.
	expect(survivingIds).toContain(regen.sessionIds[0])
})

test('an adopted (edit → authored) session survives a regeneration', async () => {
	const user = await createUserWithPassword()
	const now = new Date('2026-06-07T00:00:00.000Z')

	const first = await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [
			scheduledSession({
				title: 'Adopted later',
				scheduledAt: new Date('2026-06-17T18:00:00.000Z'),
			}),
		],
		generatedByModel: 'stub-v1',
		now,
	})
	const adoptedId = first.sessionIds[0]!

	// Editing a generated session adopts it: source flips to authored.
	await prisma.workoutSession.update({
		where: { id: adoptedId },
		data: { source: 'authored' },
	})

	await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [
			scheduledSession({
				scheduledAt: new Date('2026-06-24T18:00:00.000Z'),
			}),
		],
		generatedByModel: 'stub-v1',
		targetEventId: first.eventId,
		now,
		replaceFutureGenerated: true,
	})

	const stillThere = await prisma.workoutSession.findUnique({
		where: { id: adoptedId },
		select: { id: true },
	})
	expect(stillThere).not.toBeNull()
})

test('persists null ranges for a step whose intensity did not resolve', async () => {
	const user = await createUserWithPassword()

	// A step left unresolved upstream (no threshold, or an unavailable target)
	// carries no resolved ranges, so it persists with null range columns.
	const result = await persistApprovedPlan(user.id, {
		input,
		outline,
		sessions: [scheduledSession()],
		generatedByModel: 'stub-v1',
	})

	const detail = await getSessionByIdForUser(user.id, result.sessionIds[0]!)
	const step = detail!.workout!.blocks[0]!.steps[0]!
	expect(step.intensityHrMin).toBeNull()
	expect(step.intensityHrMax).toBeNull()
})
