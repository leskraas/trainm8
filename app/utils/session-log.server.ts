import { localDate } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import { recomputeLoadFrom } from './load/snapshot.server.ts'

/**
 * Fire the load-recompute path (ADR 0008) from a session's scheduled date. New
 * real data landed on that session — a Session Log below, or a recorded
 * missed/skipped status (`markSessionMissed`) — so the Load Snapshots are
 * rebuilt and the Session Nudge applier runs.
 *
 * `clampFutureToToday` is for the mark-missed transition only: a recompute
 * window starting after today would no-op, so recording a miss on a
 * future-dated session recomputes from today instead (nothing to rebuild, but
 * the Session Nudge still reconciles). The Session Log paths below keep the
 * original behavior unchanged.
 */
export async function triggerRecomputeForSession(
	sessionId: string,
	{ clampFutureToToday = false } = {},
): Promise<void> {
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
		const now = new Date()
		const from =
			clampFutureToToday && session.scheduledAt > now
				? now
				: session.scheduledAt
		await recomputeLoadFrom(session.userId, localDate(from, timezone))
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
