/**
 * The few session writes the domain had no undo for, built here with one:
 * skipping (a missed day, or a day ahead the athlete will not train), the
 * feeling (RPE and note), handing a session back to the plan, an added
 * session, and a strength session finished outside any program.
 *
 * Each undo follows the domain's rule for _Angre_: put back exactly what the
 * write changed, only while the session still stands as the write left it,
 * and refuse rather than trample once something else has happened to it.
 */
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	triggerRecomputeForSession,
	upsertSessionLog,
} from '#app/utils/session-log.server.ts'
import {
	canMarkMissed,
	deleteWorkoutSession,
	markSessionMissed,
	recomputeRewroteSince,
} from '#app/utils/workout.server.ts'
import { type UndoPayload } from './undo-token.server.ts'

export type UndoRefusal = 'changed' | 'trained'

export type UndoDone =
	| { ok: true; undone: boolean }
	| { ok: false; reason: UndoRefusal }

// ── skip ──────────────────────────────────────────────────────────────────

export type SkipResult =
	| {
			ok: true
			state: 'missed' | 'skipped'
			undo: Extract<UndoPayload, { k: 'skip' }> | null
	  }
	| { ok: false; reason: 'not-found' | 'not-open' }

/**
 * Skip a session. On a day that has begun it is the domain's _not done_
 * (`missed`), which sets the plan's load recompute off and may ease the next
 * session; on a day still ahead it is `skipped`, the athlete's word ahead of
 * time, with the same recompute. Undo is offered only when that recompute
 * changed no other session.
 */
export async function skipSession(
	userId: string,
	sessionId: string,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<SkipResult> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			id: true,
			status: true,
			scheduledAt: true,
			recordingId: true,
		},
	})
	if (!session) return { ok: false, reason: 'not-found' }
	if (session.status !== 'scheduled' || session.recordingId != null) {
		return { ok: false, reason: 'not-open' }
	}
	const since = new Date()
	let state: 'missed' | 'skipped'
	if (canMarkMissed(session, { now, timezone })) {
		const marked = await markSessionMissed(userId, session.id, {
			now,
			timezone,
		})
		if (!marked?.marked) return { ok: false, reason: 'not-open' }
		state = 'missed'
	} else {
		const claimed = await prisma.workoutSession.updateMany({
			where: { id: session.id, userId, status: 'scheduled', recordingId: null },
			data: { status: 'skipped' },
		})
		if (claimed.count === 0) return { ok: false, reason: 'not-open' }
		await triggerRecomputeForSession(session.id, { clampFutureToToday: true })
		state = 'skipped'
	}
	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { updatedAt: true, status: true },
	})
	const undoable =
		after != null && !(await recomputeRewroteSince(userId, since, [session.id]))
	return {
		ok: true,
		state,
		undo:
			undoable && after
				? {
						k: 'skip',
						sessionId: session.id,
						status: after.status,
						updatedAt: after.updatedAt.toISOString(),
					}
				: null,
	}
}

export async function undoSkip(
	userId: string,
	token: Extract<UndoPayload, { k: 'skip' }>,
): Promise<UndoDone> {
	const restored = await prisma.workoutSession.updateMany({
		where: {
			id: token.sessionId,
			userId,
			status: token.status,
			recordingId: null,
			updatedAt: new Date(token.updatedAt),
		},
		data: { status: 'scheduled' },
	})
	if (restored.count === 0) {
		const now = await prisma.workoutSession.findFirst({
			where: { id: token.sessionId, userId },
			select: { status: true },
		})
		if (now?.status === 'scheduled') return { ok: true, undone: false }
		return { ok: false, reason: 'changed' }
	}
	await triggerRecomputeForSession(token.sessionId)
	return { ok: true, undone: true }
}

// ── feeling ───────────────────────────────────────────────────────────────

type Log = { content: string; rpe: number | null }

export type FeelingResult =
	| { ok: true; undo: Extract<UndoPayload, { k: 'log' }> }
	| { ok: false; reason: 'not-found' | 'not-yet' }

function sameLog(a: Log | null, b: Log | null): boolean {
	if (a == null || b == null) return a == null && b == null
	return a.content === b.content && a.rpe === b.rpe
}

async function writeLog(sessionId: string, log: Log | null) {
	if (log) {
		await upsertSessionLog({ sessionId, content: log.content, rpe: log.rpe })
		return
	}
	await prisma.sessionLog.deleteMany({ where: { sessionId } })
	await triggerRecomputeForSession(sessionId)
}

/**
 * Say how hard a session felt (RPE 1–10, or null to clear it), or set its
 * note. The other half of the log is kept. Only a session whose day has
 * begun: a feeling is about something that happened. The RPE feeds the
 * training load of a session with no recording, so the load is recomputed.
 */
export async function writeFeeling(
	userId: string,
	sessionId: string,
	change: { rpe: number | null } | { note: string },
	{ now, timezone }: { now: Date; timezone: string },
): Promise<FeelingResult> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			id: true,
			scheduledAt: true,
			sessionLog: { select: { content: true, rpe: true } },
		},
	})
	if (!session) return { ok: false, reason: 'not-found' }
	if (localDate(session.scheduledAt, timezone) > localDate(now, timezone)) {
		return { ok: false, reason: 'not-yet' }
	}
	const before: Log | null = session.sessionLog
		? { content: session.sessionLog.content, rpe: session.sessionLog.rpe }
		: null
	const merged: Log = {
		content: 'note' in change ? change.note.trim() : (before?.content ?? ''),
		rpe: 'rpe' in change ? change.rpe : (before?.rpe ?? null),
	}
	const after = merged.content === '' && merged.rpe == null ? null : merged
	if (!sameLog(before, after)) await writeLog(session.id, after)
	return {
		ok: true,
		undo: { k: 'log', sessionId: session.id, before, after },
	}
}

export async function undoFeeling(
	userId: string,
	token: Extract<UndoPayload, { k: 'log' }>,
): Promise<UndoDone> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: token.sessionId, userId },
		select: { sessionLog: { select: { content: true, rpe: true } } },
	})
	if (!session) return { ok: false, reason: 'changed' }
	const current: Log | null = session.sessionLog
		? { content: session.sessionLog.content, rpe: session.sessionLog.rpe }
		: null
	if (sameLog(current, token.before)) return { ok: true, undone: false }
	if (!sameLog(current, token.after)) return { ok: false, reason: 'changed' }
	await writeLog(token.sessionId, token.before)
	return { ok: true, undone: true }
}

// ── handing back, adding, finishing ───────────────────────────────────────

export async function undoRelease(
	userId: string,
	token: Extract<UndoPayload, { k: 'release' }>,
): Promise<UndoDone> {
	const taken = await prisma.workoutSession.updateMany({
		where: {
			id: token.sessionId,
			userId,
			releasedAt: new Date(token.releasedAt),
		},
		data: { releasedAt: null },
	})
	if (taken.count > 0) return { ok: true, undone: true }
	const now = await prisma.workoutSession.findFirst({
		where: { id: token.sessionId, userId },
		select: { releasedAt: true },
	})
	return now && now.releasedAt == null
		? { ok: true, undone: false }
		: { ok: false, reason: 'changed' }
}

/** Remove a session `add_session` wrote, while nothing was trained on it. */
export async function undoAdd(
	userId: string,
	token: Extract<UndoPayload, { k: 'add' }>,
): Promise<UndoDone> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: token.sessionId, userId },
		select: {
			recordingId: true,
			_count: { select: { setLogs: true, programApplications: true } },
		},
	})
	if (!session) return { ok: true, undone: false }
	if (
		session.recordingId != null ||
		session._count.setLogs > 0 ||
		session._count.programApplications > 0
	) {
		return { ok: false, reason: 'trained' }
	}
	await deleteWorkoutSession(userId, token.sessionId)
	return { ok: true, undone: true }
}

/**
 * Put a strength session finished outside any program back to planned, its
 * logged sets kept, so it can be finished again.
 */
export async function undoFinish(
	userId: string,
	token: Extract<UndoPayload, { k: 'unfinish' }>,
): Promise<UndoDone> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: token.sessionId, userId },
		select: {
			status: true,
			recordingId: true,
			markedDoneAt: true,
			_count: { select: { programApplications: true } },
		},
	})
	if (!session) return { ok: false, reason: 'changed' }
	if (session.status === 'scheduled') return { ok: true, undone: false }
	if (
		session.status !== 'completed' ||
		session.recordingId != null ||
		session.markedDoneAt != null ||
		session._count.programApplications > 0
	) {
		return { ok: false, reason: 'changed' }
	}
	await prisma.workoutSession.updateMany({
		where: { id: token.sessionId, userId, status: 'completed' },
		data: { status: 'scheduled' },
	})
	await triggerRecomputeForSession(token.sessionId)
	return { ok: true, undone: true }
}
