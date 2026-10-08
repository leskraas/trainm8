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
	relinkRecordingToSession,
} from './activity-import.server.ts'
import { prisma } from './db.server.ts'
import { type ImportLinkRefusal } from './import-link-schema.ts'
import { setCountsInNoTrack } from './plan-outline/week-volumes.server.ts'

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

async function findImport(athleteId: string, importId: string) {
	return prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: {
			id: true,
			promotedSessionId: true,
			unlinkedFromSessionId: true,
		},
	})
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
): Promise<ImportLinkResult> {
	const imported = await findImport(athleteId, importId)
	if (!imported?.promotedSessionId) {
		return { ok: false, reason: 'import-not-found' }
	}

	if (answer.kind === 'link') {
		const moved = await relinkRecordingToSession(
			athleteId,
			importId,
			answer.sessionId,
		).catch(() => null)
		if (!moved) return { ok: false, reason: 'session-not-found' }
		await markAnswered(importId, now)
		return { ok: true, sessionId: moved.sessionId }
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
	return { ok: true, sessionId: imported.promotedSessionId }
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

	const moved = await relinkRecordingToSession(
		athleteId,
		importId,
		imported.unlinkedFromSessionId,
	).catch(() => null)
	if (!moved) return { ok: false, reason: 'nothing-to-relink' }
	await markAnswered(importId, now)
	return { ok: true, sessionId: moved.sessionId }
}
