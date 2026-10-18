/**
 * I dag's calm default view, through its loader and action (spec #558 S4,
 * ADR 0101 §3–§4): the actions it offers by time, before the Plan Start Week,
 * with no plan, and the detail every row leads to. What the view says is read
 * off the loader's own data exactly as the screen reads it
 * (`buildTimelineSeason` → `buildCalmToday`).
 */
import { type AppLoadContext } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createFirstRunPlan } from '#app/utils/first-run/plan.server.ts'
import { type ProposalAuthor } from '#app/utils/load/propose-week-change.ts'
import { runWeekChangeForUser } from '#app/utils/load/week-change.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader as sessionLoader } from '../training/sessions.$sessionId.tsx'
import { buildCalmToday } from './__calm-today.ts'
import { action, loader } from './index.tsx'
import { buildTimelineSeason } from './timeline/presenter.ts'

// Wednesday 2 January 2030, midday UTC; the week is Mon 31 Dec – Sun 6 Jan.
const NOW = new Date('2030-01-02T12:00:00Z')
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/',
}

beforeEach(() => {
	// Only the clock: the database and the timers stay real.
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(NOW)
})
afterEach(() => {
	vi.useRealTimers()
})

async function signedIn() {
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

async function run(userId: string, at: string, status = 'scheduled') {
	const workout = await prisma.workout.create({
		data: {
			title: `Løpetur ${at.slice(0, 10)}`,
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 2700,
								},
							],
						},
					},
				],
			},
			sessions: { create: { userId, scheduledAt: new Date(at), status } },
		},
		select: { sessions: { select: { id: true } } },
	})
	return workout.sessions[0]!.id
}

function get(cookie: string, path = '/') {
	return new Request(new URL(path, BASE_URL).toString(), {
		headers: { cookie },
	})
}

async function calmView(cookie: string) {
	const data = await loader({ ...ARGS, request: get(cookie) })
	if (!data.isAuthenticated) throw new Error('expected a signed-in athlete')
	const now = new Date(data.now)
	const season = buildTimelineSeason({
		ledger: data.ledger,
		now,
		timezone: 'UTC',
		activePlan: data.activePlan,
		importConnected: data.importConnected,
	})
	return buildCalmToday({
		season,
		ledger: data.ledger,
		now,
		timezone: 'UTC',
		activePlan: data.activePlan,
	})
}

test('Gjort is offered on today and on past sessions not yet done, never on one still ahead', async () => {
	const { userId, cookie } = await signedIn()
	const ids = {
		monday: await run(userId, '2029-12-31T07:00:00Z'),
		today: await run(userId, '2030-01-02T18:00:00Z'),
		friday: await run(userId, '2030-01-04T07:00:00Z'),
	}

	const view = await calmView(cookie)
	const offers = Object.fromEntries(
		view.week.days
			.flatMap((day) => day.sessions)
			.map((session) => [session.id, session.markDone != null]),
	)

	expect(offers).toEqual({
		[ids.monday]: true,
		[ids.today]: true,
		[ids.friday]: false,
	})
	// Monday's open session is behind today: ikke gjort, still markable.
	expect(view.week.days[0]!.sessions[0]!.status).toBe('missed')
	expect(view.week.doneLine).toBe('0 av 3 økter gjort')
})

test('with no plan, I dag invites the athlete to the start', async () => {
	const { cookie } = await signedIn()

	const view = await calmView(cookie)

	expect(view.card.kind).toBe('no-plan')
	// No empty calendar: a week with nothing in it is not drawn.
	expect(view.week.shown).toBe(false)
})

test('before the Plan Start Week the card says when the plan starts, and a session can still be added today', async () => {
	const { userId, cookie } = await signedIn()
	const created = await createFirstRunPlan(
		userId,
		{
			discipline: 'run',
			hours: 4,
			days: [1, 3, 5],
			goal: { kind: 'active' },
			family: null,
		},
		NOW,
	)
	expect(created.ok).toBe(true)

	const before = await calmView(cookie)
	expect(before.card.kind).toBe('before-start')
	if (before.card.kind !== 'before-start') return
	// The first week not yet begun (ADR 0079): next Monday.
	expect(before.card.title).toBe('Planen starter mandag 7. jan')
	expect(before.card.first?.line).toMatch(/^Første økt: .+, tirsdag 8\. jan/)

	// The composer's own post, on today.
	const written = (await action({
		...ARGS,
		request: new Request(new URL('/', BASE_URL).toString(), {
			method: 'POST',
			headers: {
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				intent: 'stamp-day',
				date: '2030-01-02',
				discipline: 'run',
				landing: 'toast',
			}).toString(),
		}),
	})) as { data: { stampedSessionId: string } }
	expect(written.data.stampedSessionId).toEqual(expect.any(String))

	const after = await calmView(cookie)
	expect(after.card.kind).toBe('before-start')
	const today = after.week.days.find((day) => day.isToday)!
	expect(today.sessions.map((session) => session.id)).toEqual([
		written.data.stampedSessionId,
	])
	expect(today.sessions[0]!.markDone).not.toBeNull()
})

test('a done session with no Workout opens a detail that says what is known, never a 404', async () => {
	const { userId, cookie } = await signedIn()
	const done = await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt: new Date('2030-01-01T07:00:00Z'),
			status: 'completed',
		},
		select: { id: true },
	})

	const page = await sessionLoader({
		...ARGS,
		unstable_pattern: '/training/sessions/:sessionId',
		params: { sessionId: done.id },
		request: get(cookie, `/training/sessions/${done.id}`),
	})

	expect(page.session.id).toBe(done.id)
	expect(page.session.status).toBe('completed')
	expect(page.canMarkMissed).toBe(false)
})

test('under autopilot I dag ships the Autopilot Notice; under Spør meg først it does not', async () => {
	// The week of 24 Dec closed on Sunday 30 Dec at 20:00; today is Wednesday.
	const close = new Date('2029-12-30T20:01:00Z')
	const soften: ProposalAuthor = (facts) => ({
		outcome: 'proposed',
		reason: 'Test author.',
		proposals: facts.adjustableSessions.map((session) => ({
			payload: { kind: 'scale' as const, factor: 0.85 },
			targetSessionId: session.id,
			targetWeekKey: facts.targetWeekKey,
			reason: 'Økta er gjort ca. 15 % kortere.',
		})),
	})
	const notices = []
	for (const autopilot of [true, false]) {
		const { userId, cookie } = await signedIn()
		await prisma.athleteProfile.create({ data: { userId, autopilot } })
		// The machine's session, so the autopilot may change it.
		await prisma.workoutSession.update({
			where: { id: await run(userId, '2030-01-04T07:00:00Z') },
			data: { source: 'generated' },
		})
		await runWeekChangeForUser(userId, close, soften)
		const data = await loader({ ...ARGS, request: get(cookie) })
		if (!data.isAuthenticated) throw new Error('expected a signed-in athlete')
		notices.push(data.autopilotNotice)
	}

	const [on, off] = notices
	expect(on?.lines.map((line) => [line.kind, line.text, line.undo])).toEqual([
		['changed', 'Økta er gjort ca. 15 % kortere.', 'closed'],
	])
	expect(off).toBeNull()
})
