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
	expect(relinked.data.result).toEqual({ ok: true, sessionId: plan.id })
})

test('linking an ekstra to a planned session answers the question', async () => {
	const { userId, cookie } = await athlete()
	const importId = await importRun(userId)
	const plan = await plannedRun(userId)

	const reply = await send(
		{ intent: 'link', importId, sessionId: plan.id },
		cookie,
	)

	expect(reply.data.result).toEqual({ ok: true, sessionId: plan.id })
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
	expect((await done(owner.cookie)).data.result).toEqual({ ok: true })
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
	expect(relinked.data.result).toEqual({ ok: true, sessionId: plan.id })
})
