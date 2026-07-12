import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createSessionLog } from '#app/utils/session-log.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader, action } from './sessions.$sessionId.tsx'

const ROUTE_PATH = '/training/sessions/:sessionId'
const LOADER_ARGS_BASE = {
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

async function setupUser() {
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
	return session
}

async function createWorkoutSession(
	userId: string,
	scheduledAt: Date,
	status = 'scheduled',
) {
	const workout = await prisma.workout.create({
		data: {
			title: faker.lorem.words(3),
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						name: 'Main set',
						orderIndex: 0,
						steps: {
							create: [
								{
									kind: 'cardio',
									notes: '4 x 5 min steady',
									discipline: 'run',
									intensity: 'threshold',
									orderIndex: 0,
								},
							],
						},
					},
				],
			},
			sessions: {
				create: { userId, scheduledAt, status },
			},
		},
		select: { sessions: { select: { id: true } } },
	})
	return workout.sessions[0]!
}

async function createCompletedSessionWithRecording(
	userId: string,
	{ withStream }: { withStream: boolean },
) {
	const startedAt = new Date()
	const recording = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: userId,
			externalProvider: 'strava',
			externalId: faker.string.uuid(),
			startedAt,
			endedAt: new Date(startedAt.getTime() + 1800 * 1000),
			durationSec: 1800,
			discipline: 'bike',
			powerAvg: 240,
			rawJson: '{}',
			...(withStream
				? {
						stream: {
							create: {
								resolutionSec: 5,
								sampleCount: 4,
								timeSec: JSON.stringify([0, 5, 10, 15]),
								power: JSON.stringify([200, null, 240, 250]),
								heartrate: JSON.stringify([140, 150, 160, 165]),
							},
						},
					}
				: {}),
		},
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			scheduledAt: startedAt,
			status: 'completed',
			recordingId: recording.id,
		},
	})
	return session
}

function makeRequest(sessionId: string, cookieHeader?: string) {
	const url = new URL(`/training/sessions/${sessionId}`, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	return new Request(url.toString(), { method: 'GET', headers })
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

test('unauthenticated requests redirect to login', async () => {
	const request = makeRequest('missing-session')
	const response = await loader({
		request,
		params: { sessionId: 'missing-session' },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toContain('/login')
})

test('authenticated user receives their own session with workout structure', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as {
		session: {
			id: string
			status: string
			workout: { blocks: Array<{ steps: Array<{ notes: string | null }> }> }
		}
	}

	expect(data.session.id).toBe(createdSession.id)
	expect(data.session.status).toBe('completed')
	expect(data.session.workout.blocks).toHaveLength(1)
	expect(data.session.workout.blocks[0]!.steps[0]!.notes).toContain('steady')
})

test('loader includes session log when one exists', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	await createSessionLog({
		sessionId: createdSession.id,
		content: 'Felt great today',
		rpe: 7,
	})

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as {
		session: {
			id: string
			sessionLog: { content: string; rpe: number | null } | null
		}
	}

	expect(data.session.sessionLog).not.toBeNull()
	expect(data.session.sessionLog!.content).toBe('Felt great today')
	expect(data.session.sessionLog!.rpe).toBe(7)
})

test('loader returns null sessionLog when none exists', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(user.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as {
		session: {
			id: string
			sessionLog: null
		}
	}

	expect(data.session.sessionLog).toBeNull()
})

test("loader returns the recording's parsed Activity Stream when one exists", async () => {
	const user = await setupUser()
	const createdSession = await createCompletedSessionWithRecording(
		user.userId,
		{
			withStream: true,
		},
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as {
		session: {
			recording: {
				stream: {
					resolutionSec: number
					timeSec: number[]
					power?: Array<number | null>
					heartrate?: Array<number | null>
				} | null
			} | null
		}
	}

	const stream = data.session.recording!.stream
	expect(stream).not.toBeNull()
	expect(stream!.resolutionSec).toBe(5)
	expect(stream!.timeSec).toEqual([0, 5, 10, 15])
	// The null gap survives the round-trip rather than being interpolated.
	expect(stream!.power).toEqual([200, null, 240, 250])
	expect(stream!.heartrate).toEqual([140, 150, 160, 165])
})

test('deleting an Activity Import cascade-deletes its Activity Stream (ADR 0020 / ADR 0012)', async () => {
	const user = await setupUser()
	const createdSession = await createCompletedSessionWithRecording(
		user.userId,
		{
			withStream: true,
		},
	)
	const recordingId = (await prisma.workoutSession
		.findUniqueOrThrow({
			where: { id: createdSession.id },
			select: { recordingId: true },
		})
		.then((s) => s.recordingId))!

	expect(
		await prisma.activityStream.count({
			where: { activityImportId: recordingId },
		}),
	).toBe(1)

	// Detach the recording from the session, then delete the import — the stream
	// rides with its import and is gone too.
	await prisma.workoutSession.update({
		where: { id: createdSession.id },
		data: { recordingId: null },
	})
	await prisma.activityImport.delete({ where: { id: recordingId } })

	expect(
		await prisma.activityStream.count({
			where: { activityImportId: recordingId },
		}),
	).toBe(0)
})

test('loader returns a null stream when the recording has none', async () => {
	const user = await setupUser()
	const createdSession = await createCompletedSessionWithRecording(
		user.userId,
		{
			withStream: false,
		},
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as {
		session: { recording: { stream: unknown } | null }
	}

	expect(data.session.recording).not.toBeNull()
	expect(data.session.recording!.stream).toBeNull()
})

test('authenticated user cannot access another user session detail', async () => {
	const owner = await setupUser()
	const otherUser = await setupUser()
	const createdSession = await createWorkoutSession(owner.userId, inDays(1))

	const cookieHeader = await getSessionCookieHeader(otherUser)
	const request = makeRequest(createdSession.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(404)
})

test('loader surfaces the last similar session for a completed session', async () => {
	const user = await setupUser()
	const prior = await createWorkoutSession(
		user.userId,
		daysAgo(10),
		'completed',
	)
	const current = await createWorkoutSession(
		user.userId,
		daysAgo(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(current.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: current.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as { lastSimilar: { id: string } | null }
	expect(data.lastSimilar?.id).toBe(prior.id)
})

test('loader returns a null comparison for the first session of its kind', async () => {
	const user = await setupUser()
	const only = await createWorkoutSession(user.userId, daysAgo(2), 'completed')

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(only.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: only.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as { lastSimilar: unknown }
	expect(data.lastSimilar).toBeNull()
})

test('loader skips the similar-session lookup for a non-completed session', async () => {
	const user = await setupUser()
	// A prior completed similar session exists, but the viewed session is only
	// scheduled — there is nothing to compare yet, so no lookup runs.
	await createWorkoutSession(user.userId, daysAgo(10), 'completed')
	const scheduled = await createWorkoutSession(
		user.userId,
		inDays(2),
		'scheduled',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeRequest(scheduled.id, cookieHeader)
	const response = await loader({
		request,
		params: { sessionId: scheduled.id },
		...LOADER_ARGS_BASE,
	})

	const data = response as { lastSimilar: unknown }
	expect(data.lastSimilar).toBeNull()
})

function makeActionRequest(
	sessionId: string,
	formData: Record<string, string>,
	cookieHeader?: string,
) {
	const url = new URL(`/training/sessions/${sessionId}`, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	headers.set('content-type', 'application/x-www-form-urlencoded')
	const body = new URLSearchParams(formData).toString()
	return new Request(url.toString(), { method: 'POST', headers, body })
}

test('action creates a session log with content and RPE', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ content: 'Solid tempo session', rpe: '7' },
		cookieHeader,
	)

	await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const log = await prisma.sessionLog.findUnique({
		where: { sessionId: createdSession.id },
	})
	expect(log).not.toBeNull()
	expect(log!.content).toBe('Solid tempo session')
	expect(log!.rpe).toBe(7)
})

test('action creates a session log without RPE', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ content: 'Easy recovery' },
		cookieHeader,
	)

	await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const log = await prisma.sessionLog.findUnique({
		where: { sessionId: createdSession.id },
	})
	expect(log).not.toBeNull()
	expect(log!.content).toBe('Easy recovery')
	expect(log!.rpe).toBeNull()
})

test('action rejects invalid RPE value', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ content: 'Some content', rpe: '15' },
		cookieHeader,
	)

	const response = (await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')

	const log = await prisma.sessionLog.findUnique({
		where: { sessionId: createdSession.id },
	})
	expect(log).toBeNull()
})

test('action rejects empty content', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ content: '' },
		cookieHeader,
	)

	const response = (await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('action prevents non-owner from creating session log', async () => {
	const owner = await setupUser()
	const otherUser = await setupUser()
	const createdSession = await createWorkoutSession(owner.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(otherUser)
	const request = makeActionRequest(
		createdSession.id,
		{ content: 'Sneaky log' },
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(404)
})

test('action updates existing session log on resubmit', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		inDays(2),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)

	const request1 = makeActionRequest(
		createdSession.id,
		{ content: 'First draft', rpe: '5' },
		cookieHeader,
	)
	await action({
		request: request1,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const request2 = makeActionRequest(
		createdSession.id,
		{ content: 'Revised reflection', rpe: '8' },
		cookieHeader,
	)
	await action({
		request: request2,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	const logs = await prisma.sessionLog.findMany({
		where: { sessionId: createdSession.id },
	})
	expect(logs).toHaveLength(1)
	expect(logs[0]!.content).toBe('Revised reflection')
	expect(logs[0]!.rpe).toBe(8)
})

test('delete action removes session and redirects home', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(user.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ intent: 'delete' },
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toBe('/')

	const deleted = await prisma.workoutSession.findUnique({
		where: { id: createdSession.id },
	})
	expect(deleted).toBeNull()
})

test('mark-missed action sets the stored status so the Session Ledger shows the session as missed', async () => {
	const user = await setupUser()
	// A planned session whose time passed silently — the athlete records the miss.
	const createdSession = await createWorkoutSession(user.userId, daysAgo(1))

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ intent: 'mark-missed' },
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toBe(
		`/training/sessions/${createdSession.id}`,
	)

	// Non-destructive: only the status changed; the prescription stays.
	const after = await prisma.workoutSession.findUnique({
		where: { id: createdSession.id },
		select: { status: true, workout: { select: { id: true } } },
	})
	expect(after!.status).toBe('missed')
	expect(after!.workout).not.toBeNull()
})

test('mark-missed action rejects a completed session with 400', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		daysAgo(1),
		'completed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ intent: 'mark-missed' },
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(400)

	const after = await prisma.workoutSession.findUnique({
		where: { id: createdSession.id },
		select: { status: true },
	})
	expect(after!.status).toBe('completed')
})

test('mark-missed action rejects an already-missed session with 400 (only a planned session can take the transition)', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(
		user.userId,
		daysAgo(1),
		'missed',
	)

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{ intent: 'mark-missed' },
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(400)

	const after = await prisma.workoutSession.findUnique({
		where: { id: createdSession.id },
		select: { status: true },
	})
	expect(after!.status).toBe('missed')
})

test('mark-missed action rejects non-owner with 404', async () => {
	const owner = await setupUser()
	const otherUser = await setupUser()
	const createdSession = await createWorkoutSession(owner.userId, daysAgo(1))

	const cookieHeader = await getSessionCookieHeader(otherUser)
	const request = makeActionRequest(
		createdSession.id,
		{ intent: 'mark-missed' },
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(404)

	const after = await prisma.workoutSession.findUnique({
		where: { id: createdSession.id },
		select: { status: true },
	})
	expect(after!.status).toBe('scheduled')
})

// ── mark-missed fires the load recompute, which applies the Session Nudge ─────

/** A hard (key) bike interval session — powerPct 110–120 is zone 5. */
async function createBikeIntervalSession(userId: string, scheduledAt: Date) {
	const workout = await prisma.workout.create({
		data: {
			title: 'VO2 intervals',
			discipline: 'bike',
			intent: 'vo2max',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 5,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'bike',
									durationSec: 5400,
									intensity: JSON.stringify({
										kind: 'powerPct',
										minPct: 110,
										maxPct: 120,
									}),
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	return prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status: 'scheduled',
			source: 'generated',
		},
		select: { id: true },
	})
}

/** An athlete with a trustworthy, neutral Form history — without a miss the
 * Session Nudge would hold, so any ease below is miss-driven. */
async function setupBikerWithHistory() {
	const user = await setupUser()
	await prisma.athleteProfile.create({
		data: {
			userId: user.userId,
			timezone: 'UTC',
			disciplineProfiles: {
				create: [
					{
						discipline: 'bike',
						ftp: 250,
						zoneSystem: 'coggan-power-7',
						preferCogganTss: true,
					},
				],
			},
		},
	})
	const iso = (d: Date) => d.toISOString().slice(0, 10)
	await prisma.loadSnapshot.create({
		data: {
			athleteId: user.userId,
			date: iso(daysAgo(60)),
			tssTotal: 50,
			tssByDiscipline: '{}',
			ctl: 40,
			atl: 40,
			tsb: 0,
		},
	})
	await prisma.loadSnapshot.create({
		data: {
			athleteId: user.userId,
			date: iso(daysAgo(2)),
			tssTotal: 0,
			tssByDiscipline: '{}',
			ctl: 40,
			atl: 38,
			tsb: 2,
		},
	})
	return user
}

async function readNextPrescription(sessionId: string) {
	const session = await prisma.workoutSession.findUnique({
		where: { id: sessionId },
		select: {
			source: true,
			plannedTssValue: true,
			workout: {
				select: {
					intent: true,
					blocks: {
						select: {
							repeatCount: true,
							steps: { select: { durationSec: true, intensity: true } },
						},
					},
				},
			},
		},
	})
	return session!
}

test('marking a key session missed eases the next planned cardio session there and then', async () => {
	const user = await setupBikerWithHistory()
	const missed = await createBikeIntervalSession(user.userId, daysAgo(1))
	const next = await createBikeIntervalSession(user.userId, inDays(1))
	const cookieHeader = await getSessionCookieHeader(user)

	// Opening the page decides nothing — the ease never fires on a GET.
	await loader({
		request: makeRequest(missed.id, cookieHeader),
		params: { sessionId: missed.id },
		...LOADER_ARGS_BASE,
	})
	const before = await readNextPrescription(next.id)
	expect(before.workout!.intent).toBe('vo2max')

	// Recording the miss fires the load recompute, which runs the applier.
	await action({
		request: makeActionRequest(
			missed.id,
			{ intent: 'mark-missed' },
			cookieHeader,
		),
		params: { sessionId: missed.id },
		...LOADER_ARGS_BASE,
	})

	const marked = await prisma.workoutSession.findUnique({
		where: { id: missed.id },
		select: { status: true },
	})
	expect(marked!.status).toBe('missed')

	// The next planned cardio session now carries the canonical eased target…
	const after = await readNextPrescription(next.id)
	expect(after.workout!.intent).toBe('endurance')
	expect(after.workout!.blocks).toHaveLength(1)
	expect(after.workout!.blocks[0]!.repeatCount).toBe(1)
	const step = after.workout!.blocks[0]!.steps[0]!
	expect(step.durationSec).toBe(60 * 60) // capped at the hour
	expect(JSON.parse(step.intensity!)).toEqual({
		kind: 'zoneLabel',
		label: 'Z2',
	})
	// …with its Planned TSS recomputed and its source preserved (no adoption).
	expect(after.plannedTssValue).not.toBeNull()
	expect(after.source).toBe('generated')
})

test('delete action rejects non-owner with 404', async () => {
	const owner = await setupUser()
	const otherUser = await setupUser()
	const createdSession = await createWorkoutSession(owner.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(otherUser)
	const request = makeActionRequest(
		createdSession.id,
		{ intent: 'delete' },
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(404)

	const stillExists = await prisma.workoutSession.findUnique({
		where: { id: createdSession.id },
	})
	expect(stillExists).not.toBeNull()
})

// ── inline token-sentence autosave — the detail view IS the editor (§1, B9) ───
//
// The standalone edit page and its route are gone (§12); its workout-update
// action moved here, dispatched by the `saveWorkout` control field. These pin
// the moved save path at the DB level (adoption/resolution are exercised by the
// route-level inline-edit test and updateWorkoutSession's own tests).

function validWorkoutFormEntries(): Record<string, string> {
	return {
		saveWorkout: '1',
		title: 'Updated Tempo Run',
		discipline: 'run',
		intent: 'endurance',
		scheduledAtDate: '2026-06-15',
		scheduledAtTime: '07:00',
		structure: 'structured',
		'blocks[0].name': 'Main set',
		'blocks[0].repeatCount': '1',
		'blocks[0].steps[0].kind': 'cardio',
		'blocks[0].steps[0].notes': 'updated step',
		'blocks[0].steps[0].duration': '15 min',
	}
}

test('saveWorkout action updates the scheduled session and redirects to the detail view', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(user.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		validWorkoutFormEntries(),
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	const res = response as Response
	expect(res.status).toBe(302)
	expect(res.headers.get('location')).toBe(
		`/training/sessions/${createdSession.id}`,
	)

	const updated = await prisma.workoutSession.findUnique({
		where: { id: createdSession.id },
		include: {
			workout: { include: { blocks: { include: { steps: true } } } },
		},
	})
	expect(updated!.workout!.title).toBe('Updated Tempo Run')
	expect(updated!.workout!.blocks[0]!.steps[0]!.notes).toBe('updated step')
	expect(updated!.workout!.blocks[0]!.steps[0]!.durationSec).toBe(900)
})

test('saveWorkout action rejects invalid workout input and returns field errors', async () => {
	const user = await setupUser()
	const createdSession = await createWorkoutSession(user.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(user)
	const request = makeActionRequest(
		createdSession.id,
		{
			saveWorkout: '1',
			title: '',
			discipline: 'run',
			scheduledAtDate: '2026-06-15',
			scheduledAtTime: '07:00',
			structure: 'structured',
			'blocks[0].steps[0].kind': 'cardio',
			'blocks[0].steps[0].notes': 'some step',
		},
		cookieHeader,
	)

	const response = (await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(response.init.status).toBe(400)
	expect(response.data.result.status).toBe('error')
})

test('saveWorkout action returns 404 for a non-owner', async () => {
	const owner = await setupUser()
	const otherUser = await setupUser()
	const createdSession = await createWorkoutSession(owner.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(otherUser)
	const request = makeActionRequest(
		createdSession.id,
		validWorkoutFormEntries(),
		cookieHeader,
	)

	const response = await action({
		request,
		params: { sessionId: createdSession.id },
		...LOADER_ARGS_BASE,
	}).catch((e: unknown) => e)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).status).toBe(404)
})
