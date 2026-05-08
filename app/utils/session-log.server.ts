import { prisma } from './db.server.ts'

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
	return prisma.sessionLog.create({
		data: {
			sessionId,
			content,
			rpe: rpe ?? null,
		},
	})
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
	return prisma.sessionLog.upsert({
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
