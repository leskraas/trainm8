// The athlete's answers about an import, from its row on I dag (#505 stories
// 78–82, ADR 0049 as amended): "hva var dette?" when auto-save was unsure,
// and _Angre kobling_ / _Koble igjen_ on any import. Auto-save itself stays the
// one answer to "what happens to a new activity" (`autoSaveImport`); this is
// only what the athlete says afterwards.
//
// Every answer is owner-scoped twice: the import must be the athlete's, and so
// must any session it names. Another athlete's ids answer `import-not-found` /
// `session-not-found` and change nothing.

import {
	detachRecordingFromPlan,
	findPlanCandidates,
	ImportLinkNotFoundError,
	promoteToNewSession,
	relinkRecordingToSession,
} from './activity-import.server.ts'
import { getAthleteTimezone } from './athlete.server.ts'
import { prisma } from './db.server.ts'
import { isRecordingOnlySource } from './import-fit.ts'
import {
	type AngreRefusal,
	type ImportLinkRefusal,
} from './import-link-schema.ts'
import { recomputeRewroteSince, setCountsInNoTrack } from './workout.server.ts'

/** The three answers to "hva var dette?" (#505 story 80). */
export type ImportAnswer =
	/** It was this planned session: link the import to it. */
	| { kind: 'link'; sessionId: string }
	/** It was an extra session: keep it as _ekstra_, and stop asking. */
	| { kind: 'keep' }
	/** It counts in nothing (a bike ride to work): keep it, in Annet. */
	| { kind: 'annet' }

export type ImportLinkResult =
	| { ok: true; sessionId: string }
	| { ok: false; reason: ImportLinkRefusal }

/** What _Angre_ on a `link` answer posts back: the stamp that link wrote. */
export type ImportAnswerUndoToken = { importId: string; linkedAt: string }

/**
 * An answer's result. A `link` carries its _Angre_ (ADR 0088, amended), or
 * null when it may not be taken back; `keep` and Annet carry none.
 */
export type ImportAnswerResult =
	| { ok: true; sessionId: string; undo: ImportAnswerUndoToken | null }
	| { ok: false; reason: ImportLinkRefusal }

async function findImport(athleteId: string, importId: string) {
	return prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: {
			id: true,
			startedAt: true,
			promotedSessionId: true,
			unlinkedFromSessionId: true,
			linkAnsweredAt: true,
		},
	})
}

/**
 * Whether the session an import stands on is a bare _ekstra_ shell: one that
 * `promoteToNewSession` would stand up again exactly as it is — recording-only
 * and unadopted, on the import's own start, done, in no Annet, holding nothing
 * the athlete or the plan put on it (a note, sets, an Event result, a program
 * fold, a replan), and, when `detected`, with its detection still there to
 * materialize again. A link deletes the shell it leaves; only a bare one can
 * be put back by an undo, so only a link from one offers _Angre_.
 */
async function isBareEkstra(
	sessionId: string,
	imported: { id: string; startedAt: Date },
): Promise<boolean> {
	const session = await prisma.workoutSession.findUnique({
		where: { id: sessionId },
		select: {
			source: true,
			adoptedAt: true,
			releasedAt: true,
			status: true,
			scheduledAt: true,
			countsInNoTrack: true,
			replanReason: true,
			planOutlineId: true,
			targetEventId: true,
			sessionLog: { select: { id: true } },
			_count: {
				select: {
					setLogs: true,
					eventResults: true,
					programApplications: true,
					replanProposals: true,
					unlinkedImports: true,
				},
			},
		},
	})
	if (!session || !isRecordingOnlySource(session)) return false
	if (session.source === 'detected') {
		const detection = await prisma.workoutDetection.findUnique({
			where: { activityImportId: imported.id },
			select: { id: true },
		})
		if (!detection) return false
	}
	return (
		session.status === 'completed' &&
		session.scheduledAt.getTime() === imported.startedAt.getTime() &&
		!session.countsInNoTrack &&
		session.releasedAt == null &&
		session.replanReason == null &&
		session.planOutlineId == null &&
		session.targetEventId == null &&
		session.sessionLog == null &&
		Object.values(session._count).every((count) => count === 0)
	)
}

/** A relink that finds nothing to link reads as null; any other fault throws. */
async function relinkOrNull(
	athleteId: string,
	importId: string,
	sessionId: string,
) {
	return relinkRecordingToSession(athleteId, importId, sessionId).catch(
		(error: unknown) => {
			if (error instanceof ImportLinkNotFoundError) return null
			throw error
		},
	)
}

async function markAnswered(importId: string, now: Date) {
	await prisma.activityImport.update({
		where: { id: importId },
		data: { linkAnsweredAt: now },
	})
}

/**
 * Answer "hva var dette?" for an import. Linking moves the Recording onto the
 * named planned session (its own _ekstra_ session goes, as on any relink);
 * keeping and Annet leave it where it is. Each answer is remembered, so the
 * question is asked once.
 */
export async function answerImportQuestion(
	athleteId: string,
	importId: string,
	answer: ImportAnswer,
	now: Date = new Date(),
): Promise<ImportAnswerResult> {
	const imported = await findImport(athleteId, importId)
	if (!imported?.promotedSessionId) {
		return { ok: false, reason: 'import-not-found' }
	}

	if (answer.kind === 'link') {
		const owned = await prisma.workoutSession.findFirst({
			where: { id: answer.sessionId, userId: athleteId },
			select: { id: true },
		})
		if (!owned) return { ok: false, reason: 'session-not-found' }
		// Only a session the import could be: the same rule auto-save links by
		// and the question offers (`fitsImport`) — same day, same sport, a
		// planned session holding no Recording.
		const candidates = await findPlanCandidates(
			athleteId,
			importId,
			await getAthleteTimezone(athleteId),
		)
		if (!candidates.includes(answer.sessionId)) {
			return { ok: false, reason: 'not-a-fit' }
		}
		// Read before the link deletes it: only an unanswered import standing
		// on a bare ekstra can be put back as it was.
		const restorable =
			imported.linkAnsweredAt == null &&
			imported.unlinkedFromSessionId == null &&
			(await isBareEkstra(imported.promotedSessionId, imported))
		const since = new Date()
		const moved = await relinkOrNull(athleteId, importId, answer.sessionId)
		if (!moved) return { ok: false, reason: 'session-not-found' }
		await markAnswered(importId, now)
		const undoable =
			restorable &&
			!(await recomputeRewroteSince(athleteId, since, [moved.sessionId]))
		return {
			ok: true,
			sessionId: moved.sessionId,
			undo: undoable ? { importId, linkedAt: now.toISOString() } : null,
		}
	}

	if (answer.kind === 'annet') {
		const result = await setCountsInNoTrack(
			athleteId,
			imported.promotedSessionId,
			true,
		)
		if (!result.ok) return { ok: false, reason: 'session-not-found' }
	}
	await markAnswered(importId, now)
	return { ok: true, sessionId: imported.promotedSessionId, undo: null }
}

export type UndoImportAnswerResult =
	| {
			ok: true
			/** False when there was nothing left to take back: a second tap. */
			undone: boolean
			/** The planned session's title, for the undo's own toast. */
			title: string | null
	  }
	| { ok: false; reason: AngreRefusal }

/**
 * _Angre_ on a "hva var dette?" link (ADR 0088, amended): take back exactly
 * that link. The planned session gets back the status it had before
 * (`statusBeforeLink`, as _Angre kobling_ reads it) and holds no Recording;
 * the import stands on an _ekstra_ shell of its own again, as auto-save stood
 * it up, and is unanswered — so "hva var dette?" is asked again, as it was
 * before the tap. Unlike _Angre kobling_ it remembers nothing: there is no
 * _Koble igjen_ after it, because the athlete took back an answer rather than
 * gave one.
 *
 * Only the link the token names is taken back (its `linkAnsweredAt` stamp must
 * still be on the import), so a stale or forged token moves nothing. Refused
 * (`not-undoable`) once something else has answered for the import since (an
 * _Angre kobling_, a _Koble igjen_); a second _Angre_ finds it unanswered and
 * is a no-op. Owner-scoped: another athlete's import is not found.
 *
 * The shell is a new row with a new id: the link deleted the old one, and only
 * a bare one (`isBareEkstra`) was offered this way back.
 */
export async function undoImportAnswer(
	athleteId: string,
	token: ImportAnswerUndoToken,
): Promise<UndoImportAnswerResult> {
	const imported = await findImport(athleteId, token.importId)
	if (!imported) return { ok: false, reason: 'import-not-found' }
	const linkedAt = new Date(token.linkedAt)
	if (imported.linkAnsweredAt == null) {
		return { ok: true, undone: false, title: null }
	}
	if (
		imported.linkAnsweredAt.getTime() !== linkedAt.getTime() ||
		imported.unlinkedFromSessionId != null ||
		!imported.promotedSessionId
	) {
		return { ok: false, reason: 'not-undoable' }
	}
	const session = await prisma.workoutSession.findFirst({
		where: {
			id: imported.promotedSessionId,
			userId: athleteId,
			recordingId: imported.id,
		},
		select: {
			id: true,
			source: true,
			adoptedAt: true,
			statusBeforeLink: true,
			workout: { select: { title: true } },
		},
	})
	if (!session || isRecordingOnlySource(session)) {
		return { ok: false, reason: 'not-undoable' }
	}
	const status = session.statusBeforeLink ?? 'scheduled'
	const taken = await prisma.$transaction(async (tx) => {
		// Compare-and-set on the link's stamp, so two taps race to one undo
		// and one ekstra. Unanswered from here on: the question is back.
		const lifted = await tx.activityImport.updateMany({
			where: {
				id: imported.id,
				promotedSessionId: session.id,
				linkAnsweredAt: linkedAt,
			},
			data: { promotedSessionId: null, linkAnsweredAt: null },
		})
		if (lifted.count === 0) return false
		await tx.workoutSession.update({
			where: { id: session.id },
			data: {
				recordingId: null,
				status,
				statusBeforeLink: null,
				// The link's recompute priced it off the Recording; a session that
				// goes back to open carries none (the recompute prices only done
				// ones), and one that goes back to done is priced again below.
				tssValue: null,
				tssFormula: null,
				tssConfidence: null,
			},
		})
		return true
	})
	if (!taken) return { ok: true, undone: false, title: null }
	// The ekstra, as auto-save stood it up; its recompute (from the import's
	// day, the planned session's day too) prices the week again.
	await promoteToNewSession(athleteId, imported.id)
	return { ok: true, undone: true, title: session.workout?.title ?? null }
}

/**
 * _Angre kobling_ (#505 story 81): lift the import off the planned session it
 * was linked to, onto an _ekstra_ session of its own. The planned session goes
 * back to not done (or to done by hand, if the athlete said so). Remembers
 * where it came from, so _Koble igjen_ can put it back, and counts as an
 * answer: the athlete just said what it was not.
 */
export async function undoImportLink(
	athleteId: string,
	importId: string,
	now: Date = new Date(),
): Promise<ImportLinkResult> {
	const imported = await findImport(athleteId, importId)
	if (!imported) return { ok: false, reason: 'import-not-found' }
	const from = imported.promotedSessionId

	const moved = await detachRecordingFromPlan(athleteId, importId)
	if (!moved || !from) return { ok: false, reason: 'not-linked' }

	await prisma.activityImport.update({
		where: { id: importId },
		data: { linkAnsweredAt: now, unlinkedFromSessionId: from },
	})
	return { ok: true, sessionId: moved.sessionId }
}

/**
 * _Koble igjen_ (#505 story 81): put the import back on the planned session
 * an _Angre kobling_ lifted it off. Refused when there is nothing to go back
 * to — never undone, or that session is gone or holds another Recording now.
 */
export async function redoImportLink(
	athleteId: string,
	importId: string,
	now: Date = new Date(),
): Promise<ImportLinkResult> {
	const imported = await findImport(athleteId, importId)
	if (!imported) return { ok: false, reason: 'import-not-found' }
	if (!imported.unlinkedFromSessionId) {
		return { ok: false, reason: 'nothing-to-relink' }
	}

	const moved = await relinkOrNull(
		athleteId,
		importId,
		imported.unlinkedFromSessionId,
	)
	if (!moved) return { ok: false, reason: 'nothing-to-relink' }
	await markAnswered(importId, now)
	return { ok: true, sessionId: moved.sessionId }
}
