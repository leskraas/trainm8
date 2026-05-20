import { prisma } from './db.server.ts'
import { recomputeLoadFrom } from './load/snapshot.server.ts'

async function triggerRecomputeForSession(sessionId: string): Promise<void> {
	try {
		const session = await prisma.workoutSession.findUnique({
			where: { id: sessionId },
			select: {
				userId: true,
				scheduledAt: true,
				user: {
					select: {
						athleteProfile: { select: { timezone: true } },
					},
				},
			},
		})
		if (!session) return
		const timezone = session.user.athleteProfile?.timezone ?? 'UTC'
		const fmt = new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		})
		const dateStr = fmt.format(session.scheduledAt)
		await recomputeLoadFrom(session.userId, dateStr)
	} catch {
		// Fire-and-forget: silently skip if DB is unavailable (e.g. test teardown)
	}
}

type RpeValidResult = { valid: true; value: number | null }
type RpeInvalidResult = { valid: false; error: string }
type RpeResult = RpeValidResult | RpeInvalidResult

export function validateRpe(rpe: number | null | undefined): RpeResult {
	if (rpe == null) {
		return { valid: true, value: null }
	}
	if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
		return { valid: false, error: 'RPE must be an integer between 1 and 10' }
	}
	return { valid: true, value: rpe }
}

export async function createSessionLog({
	sessionId,
	content,
	rpe,
}: {
	sessionId: string
	content: string
	rpe?: number | null
}) {
	const log = await prisma.sessionLog.create({
		data: {
			sessionId,
			content,
			rpe: rpe ?? null,
		},
	})
	await triggerRecomputeForSession(sessionId)
	return log
}

export async function upsertSessionLog({
	sessionId,
	content,
	rpe,
}: {
	sessionId: string
	content: string
	rpe?: number | null
}) {
	const log = await prisma.sessionLog.upsert({
		where: { sessionId },
		create: {
			sessionId,
			content,
			rpe: rpe ?? null,
		},
		update: {
			content,
			rpe: rpe ?? null,
		},
	})
	await triggerRecomputeForSession(sessionId)
	return log
}

export async function getSessionLog(sessionId: string) {
	return prisma.sessionLog.findUnique({
		where: { sessionId },
	})
}

export async function getRecentSessionLogs(userId: string, limit = 3) {
	return prisma.sessionLog.findMany({
		where: {
			session: { userId },
		},
		orderBy: { createdAt: 'desc' },
		take: limit,
		select: {
			id: true,
			content: true,
			rpe: true,
			createdAt: true,
			session: {
				select: {
					id: true,
					workout: {
						select: {
							title: true,
						},
					},
				},
			},
		},
	})
}
