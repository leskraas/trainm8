import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import {
	autoSaveImport,
	createActivityImport,
} from '#app/utils/activity-import.server.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action as detailAction } from '../training/sessions.$sessionId.tsx'
import { action } from './import-link.tsx'
import { action as doneAction } from './session-done.tsx'

// An import's row on I dag (#505 stories 80–82): each tap reaches the import
// answers, and only for the athlete's own import and sessions.

const ARGS = { params: {}, context: {} as AppLoadContext }
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000)

async function athlete() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return {
		userId: session.userId,
		cookie: await getSessionCookieHeader(session),
	}
}

async function plannedRun(userId: string) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title: 'Rolig',
			discipline: 'run',
			intent: 'endurance',
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: { userId, workoutId: workout.id, scheduledAt: YESTERDAY },
	})
}

async function importRun(userId: string) {
	const imported = await createActivityImport(userId, {
		externalProvider: 'intervalsicu',
		externalId: `${userId}-${Math.random()}`,
		startedAt: YESTERDAY,
		endedAt: YESTERDAY,
		durationSec: 3000,
		distanceM: 10000,
		discipline: 'run',
		rawJson: '{}',
	})
	await autoSaveImport(userId, imported.id, 'UTC')
	return imported.id
}

function post(path: string, entries: Record<string, string>, cookie: string) {
	return new Request(new URL(path, BASE_URL).toString(), {
		method: 'POST',
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(entries).toString(),
	})
}

type Reply = {
	data: { result: { ok: boolean; reason?: string } | null }
	init: { status: number } | null
}

const send = async (entries: Record<string, string>, cookie: string) =>
	(await action({
		...ARGS,
		unstable_pattern: '/resources/import-link',
		request: post('/resources/import-link', entries, cookie),
	})) as Reply

test('undo then relink from the row puts the import back on its plan', async () => {
	const { userId, cookie } = await athlete()
	const plan = await plannedRun(userId)
	const importId = await importRun(userId)

	const undone = await send({ intent: 'undo', importId }, cookie)
	expect(undone.data.result?.ok).toBe(true)
	const relinked = await send({ intent: 'relink', importId }, cookie)
	expect(relinked.data.result).toEqual({
		ok: true,
		sessionId: plan.id,
		undo: null,
	})
})

test('linking an ekstra to a planned session answers the question', async () => {
	const { userId, cookie } = await athlete()
	const importId = await importRun(userId)
	const plan = await plannedRun(userId)

	const reply = await send(
		{ intent: 'link', importId, sessionId: plan.id },
		cookie,
	)

	expect(reply.data.result).toMatchObject({ ok: true, sessionId: plan.id })
})

test('another athlete’s import is not found, and nothing moves', async () => {
	const owner = await athlete()
	const stranger = await athlete()
	const plan = await plannedRun(owner.userId)
	const importId = await importRun(owner.userId)

	const reply = await send({ intent: 'undo', importId }, stranger.cookie)

	expect(reply.init?.status).toBe(404)
	expect(
		(await prisma.workoutSession.findUniqueOrThrow({ where: { id: plan.id } }))
			.recordingId,
	).toBe(importId)
})

test('a malformed post is refused', async () => {
	const { cookie } = await athlete()
	const reply = await send({ intent: 'link', importId: 'x' }, cookie)
	expect(reply.init?.status).toBe(400)
})

test('Gjort marks the athlete’s own session done; another athlete’s is not found', async () => {
	const owner = await athlete()
	const stranger = await athlete()
	const plan = await plannedRun(owner.userId)
	const done = (cookie: string) =>
		doneAction({
			...ARGS,
			unstable_pattern: '/resources/session-done',
			request: post('/resources/session-done', { sessionId: plan.id }, cookie),
		}) as Promise<Reply>

	expect((await done(stranger.cookie)).init?.status).toBe(404)
	expect((await done(owner.cookie)).data.result).toMatchObject({ ok: true })
	expect(
		(await prisma.workoutSession.findUniqueOrThrow({ where: { id: plan.id } }))
			.status,
	).toBe('completed')
})

test('the detail page’s detach is Angre kobling: Koble igjen can put it back', async () => {
	const { userId, cookie } = await athlete()
	const plan = await plannedRun(userId)
	const importId = await importRun(userId)
	const form = new URLSearchParams({ intent: 'detach' })

	const response = await detailAction({
		...ARGS,
		params: { sessionId: plan.id },
		unstable_pattern: '/training/sessions/:sessionId',
		request: new Request(
			new URL(`/training/sessions/${plan.id}`, BASE_URL).toString(),
			{
				method: 'POST',
				headers: {
					cookie,
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: form.toString(),
			},
		),
	})

	expect((response as Response).status).toBe(302)
	expect(
		await prisma.activityImport.findUniqueOrThrow({
			where: { id: importId },
			select: { unlinkedFromSessionId: true },
		}),
	).toEqual({ unlinkedFromSessionId: plan.id })
	const relinked = await send({ intent: 'relink', importId }, cookie)
	expect(relinked.data.result).toEqual({
		ok: true,
		sessionId: plan.id,
		undo: null,
	})
})

// ---------------------------------------------------------------------------
// Angre on _Gjort_ and on a link answer (ADR 0088, amended): each write's
// reply carries what takes it back, and the undo intent puts back exactly
// what stood before — and nothing when there is nothing left to take back.
// ---------------------------------------------------------------------------

type UndoReply = {
	data: {
		result:
			| {
					ok: true
					sessionId?: string
					undo: Record<string, string | null> | null
			  }
			| { ok: false; reason: string }
			| null
		undone?: boolean
	}
	init: { status: number; headers?: HeadersInit } | null
}

const markDone = async (entries: Record<string, string>, cookie: string) =>
	(await doneAction({
		...ARGS,
		unstable_pattern: '/resources/session-done',
		request: post('/resources/session-done', entries, cookie),
	})) as UndoReply

/** The undo token a reply carried, as the form the toast posts. */
function undoPost(reply: UndoReply): Record<string, string> {
	const result = reply.data.result
	if (!result?.ok || !result.undo) throw new Error('no undo on the reply')
	return Object.fromEntries(
		Object.entries(result.undo).map(([key, value]) => [key, value ?? '']),
	)
}

async function sessionState(sessionId: string) {
	return prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: {
			status: true,
			markedDoneAt: true,
			recordingId: true,
			statusBeforeLink: true,
			tssValue: true,
			tssFormula: true,
		},
	})
}

async function importState(importId: string) {
	return prisma.activityImport.findUniqueOrThrow({
		where: { id: importId },
		select: {
			linkAnsweredAt: true,
			unlinkedFromSessionId: true,
			promotedSession: {
				select: { source: true, status: true, recordingId: true },
			},
		},
	})
}

test('Angre on Gjort puts the session back exactly as it stood', async () => {
	const { userId, cookie } = await athlete()
	const plan = await plannedRun(userId)
	const before = await sessionState(plan.id)

	const marked = await markDone({ sessionId: plan.id }, cookie)
	expect(marked.data.result).toMatchObject({ ok: true })
	expect((await sessionState(plan.id)).status).toBe('completed')

	const undone = await markDone(
		{ intent: 'undo', sessionId: plan.id, ...undoPost(marked) },
		cookie,
	)

	expect(undone.init?.status ?? 200).toBe(200)
	expect(undone.data.undone).toBe(true)
	expect(await sessionState(plan.id)).toEqual(before)
	// Its own toast says what the undo did.
	expect(new Headers(undone.init?.headers).get('set-cookie')).toBeTruthy()
	// A second Angre finds nothing to take back, and moves nothing.
	const again = await markDone(
		{ intent: 'undo', sessionId: plan.id, ...undoPost(marked) },
		cookie,
	)
	expect(again.data.undone).toBe(false)
	expect(await sessionState(plan.id)).toEqual(before)
})

test('Angre on Gjort puts a missed session back to missed', async () => {
	const { userId, cookie } = await athlete()
	const plan = await plannedRun(userId)
	await prisma.workoutSession.update({
		where: { id: plan.id },
		data: { status: 'missed' },
	})

	const marked = await markDone({ sessionId: plan.id }, cookie)
	await markDone(
		{ intent: 'undo', sessionId: plan.id, ...undoPost(marked) },
		cookie,
	)

	expect(await sessionState(plan.id)).toMatchObject({
		status: 'missed',
		markedDoneAt: null,
	})
})

test('Angre on Gjort is refused once an import has linked onto the session', async () => {
	const { userId, cookie } = await athlete()
	const plan = await plannedRun(userId)
	const marked = await markDone({ sessionId: plan.id }, cookie)
	const importId = await importRun(userId)
	expect((await sessionState(plan.id)).recordingId).toBe(importId)

	const undone = await markDone(
		{ intent: 'undo', sessionId: plan.id, ...undoPost(marked) },
		cookie,
	)

	expect(undone.init?.status).toBe(409)
	expect(await sessionState(plan.id)).toMatchObject({
		status: 'completed',
		recordingId: importId,
	})
})

test('another athlete’s Angre on Gjort is not found, and the session stays done', async () => {
	const owner = await athlete()
	const stranger = await athlete()
	const plan = await plannedRun(owner.userId)
	const marked = await markDone({ sessionId: plan.id }, owner.cookie)

	const undone = await markDone(
		{ intent: 'undo', sessionId: plan.id, ...undoPost(marked) },
		stranger.cookie,
	)

	expect(undone.init?.status).toBe(404)
	expect((await sessionState(plan.id)).status).toBe('completed')
})

/** An ekstra run on a day with two planned runs: the question is asked. */
async function askedImport(userId: string) {
	const importId = await importRun(userId)
	const plan = await plannedRun(userId)
	const other = await plannedRun(userId)
	return { importId, plan, other }
}

test('Angre on a link answer unlinks it and puts the import and the session back', async () => {
	const { userId, cookie } = await athlete()
	const { importId, plan } = await askedImport(userId)
	const sessionBefore = await sessionState(plan.id)
	const importBefore = await importState(importId)
	expect(importBefore.promotedSession?.source).toBe('recorded')

	const linked = await send(
		{ intent: 'link', importId, sessionId: plan.id },
		cookie,
	)
	expect((await sessionState(plan.id)).recordingId).toBe(importId)

	const undone = (await send(
		{ intent: 'undo-answer', ...undoPost(linked as UndoReply) },
		cookie,
	)) as UndoReply

	expect(undone.init?.status ?? 200).toBe(200)
	expect(undone.data.undone).toBe(true)
	expect(await sessionState(plan.id)).toEqual(sessionBefore)
	// The import stands as its own ekstra again, unanswered: the question is
	// asked again, as it was before the tap.
	expect(await importState(importId)).toEqual(importBefore)
	// A second Angre finds nothing to take back.
	const again = (await send(
		{ intent: 'undo-answer', ...undoPost(linked as UndoReply) },
		cookie,
	)) as UndoReply
	expect(again.data.undone).toBe(false)
	expect(await importState(importId)).toEqual(importBefore)
})

test('Angre on a link answer puts a session marked done by hand back to done', async () => {
	const { userId, cookie } = await athlete()
	const { importId, plan } = await askedImport(userId)
	await markDone({ sessionId: plan.id }, cookie)
	const sessionBefore = await sessionState(plan.id)

	const linked = await send(
		{ intent: 'link', importId, sessionId: plan.id },
		cookie,
	)
	await send(
		{ intent: 'undo-answer', ...undoPost(linked as UndoReply) },
		cookie,
	)

	expect(await sessionState(plan.id)).toEqual(sessionBefore)
})

test('a link from an ekstra the athlete had made their own offers no Angre', async () => {
	const { userId, cookie } = await athlete()
	const { importId, plan } = await askedImport(userId)
	const ekstra = await prisma.activityImport.findUniqueOrThrow({
		where: { id: importId },
		select: { promotedSessionId: true },
	})
	// A note on the ekstra goes with it when the link takes its place: that
	// is not something an undo can bring back.
	await prisma.sessionLog.create({
		data: { sessionId: ekstra.promotedSessionId!, content: 'Tung dag', rpe: 6 },
	})

	const linked = await send(
		{ intent: 'link', importId, sessionId: plan.id },
		cookie,
	)

	expect(linked.data.result).toMatchObject({ ok: true, undo: null })
})

test('Angre on a link answer is refused once the link has been undone another way', async () => {
	const { userId, cookie } = await athlete()
	const { importId, plan } = await askedImport(userId)
	const linked = await send(
		{ intent: 'link', importId, sessionId: plan.id },
		cookie,
	)
	await send({ intent: 'undo', importId }, cookie)
	const after = await importState(importId)

	const undone = (await send(
		{ intent: 'undo-answer', ...undoPost(linked as UndoReply) },
		cookie,
	)) as UndoReply

	expect(undone.init?.status).toBe(409)
	expect(await importState(importId)).toEqual(after)
})

test('another athlete’s Angre on a link answer is not found, and the link stands', async () => {
	const owner = await athlete()
	const stranger = await athlete()
	const { importId, plan } = await askedImport(owner.userId)
	const linked = await send(
		{ intent: 'link', importId, sessionId: plan.id },
		owner.cookie,
	)

	const undone = (await send(
		{ intent: 'undo-answer', ...undoPost(linked as UndoReply) },
		stranger.cookie,
	)) as UndoReply

	expect(undone.init?.status).toBe(404)
	expect((await sessionState(plan.id)).recordingId).toBe(importId)
})
