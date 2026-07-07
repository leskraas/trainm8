import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createSessionLog } from '#app/utils/session-log.server.ts'
import { deriveLedgerStatus } from '#app/utils/training.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './index.tsx'

const ROUTE_PATH = '/'
const LOADER_ARGS_BASE = {
	params: {},
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

async function createWorkoutWithSession(
	userId: string,
	scheduledAt: Date,
	status = 'scheduled',
	discipline = 'run',
	title?: string,
) {
	return prisma.workout.create({
		data: {
			title: title ?? faker.lorem.words(3),
			discipline,
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									kind: 'cardio',
									notes: 'warm up',
									discipline: discipline,
									intensity: 'easy',
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
		select: { id: true, sessions: { select: { id: true } } },
	})
}

function makeRequest(cookieHeader?: string) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	return new Request(url.toString(), { method: 'GET', headers })
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

test('unauthenticated user receives marketing data', async () => {
	const request = makeRequest()
	const response = await loader({ request, ...LOADER_ARGS_BASE })
	const data = response as { isAuthenticated: false }
	expect(data.isAuthenticated).toBe(false)
})

test('authenticated user receives the session ledger with upcoming sessions', async () => {
	const session = await setupUser()
	await createWorkoutWithSession(session.userId, inDays(1))
	await createWorkoutWithSession(session.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		isAuthenticated: true
		ledger: Array<{ id: string }>
		weeklyBuild: Array<unknown>
		personalRecords: Array<unknown>
	}
	expect(data.isAuthenticated).toBe(true)
	// The Cockpit reads everything off the ledger (42d trailing + 14d forward),
	// which carries the upcoming sessions instead of a separate next/upcoming split.
	expect(data.ledger.length).toBeGreaterThanOrEqual(2)
	// The trailing weekly-build series is always returned (oldest → current).
	expect(Array.isArray(data.weeklyBuild)).toBe(true)
	// The Proof strip's derived Personal Records are surfaced by the loader.
	expect(Array.isArray(data.personalRecords)).toBe(true)
})

test('authenticated user with no sessions gets an empty ledger', async () => {
	const session = await setupUser()
	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as { isAuthenticated: true; ledger: Array<unknown> }
	expect(data.isAuthenticated).toBe(true)
	expect(data.ledger).toHaveLength(0)
})

test('the home loader no longer ships reflections — they live on session detail (#184)', async () => {
	const session = await setupUser()
	const workout = await createWorkoutWithSession(
		session.userId,
		inDays(-1),
		'completed',
	)
	await createSessionLog({
		sessionId: workout.sessions[0]!.id,
		content: 'Good session',
		rpe: 6,
	})

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	// The reflections grid left the home scroll in the #184 re-composition; the
	// Session Log still reaches the athlete on the Workout Detail View (which
	// hosts both the display and the create/update form).
	expect(response).not.toHaveProperty('recentLogs')
})

const utcDayKey = (n: number) =>
	new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

async function createLoadSnapshot(
	athleteId: string,
	date: string,
	tsb: number,
) {
	return prisma.loadSnapshot.create({
		data: {
			athleteId,
			date,
			tssTotal: 0,
			tssByDiscipline: '{}',
			ctl: 0,
			atl: 0,
			tsb,
			computedAt: new Date(),
		},
	})
}

test('coach card data: no load history is an untrustworthy cold-start', async () => {
	const session = await setupUser()
	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		current: { ctl: number; atl: number; tsb: number } | null
		tsbTrust: {
			trustworthy: boolean
			daysOfHistory: number
			requiredDays: number
		}
	}
	expect(data.current).toBeNull()
	expect(data.tsbTrust.trustworthy).toBe(false)
	expect(data.tsbTrust.daysOfHistory).toBe(0)
})

test('coach card data: 42+ days of history surfaces a trustworthy TSB', async () => {
	const session = await setupUser()
	await createLoadSnapshot(session.userId, utcDayKey(-50), -3)
	await createLoadSnapshot(session.userId, utcDayKey(0), 7)

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		current: { ctl: number; atl: number; tsb: number } | null
		tsbTrust: { trustworthy: boolean; daysOfHistory: number }
	}
	expect(data.tsbTrust.trustworthy).toBe(true)
	expect(data.tsbTrust.daysOfHistory).toBe(51)
	expect(data.current?.tsb).toBe(7)
})

test('dashboard ledger covers a mix of completed, missed, and planned sessions', async () => {
	const session = await setupUser()
	await createWorkoutWithSession(session.userId, inDays(-3), 'completed')
	await createWorkoutWithSession(session.userId, inDays(-1), 'missed')
	await createWorkoutWithSession(session.userId, inDays(2), 'scheduled')

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		ledger: Array<{ scheduledAt: Date; status: string }>
	}
	expect(data.ledger).toHaveLength(3)
	// ordered chronologically (past → future)
	const times = data.ledger.map((s) => new Date(s.scheduledAt).getTime())
	expect(times).toEqual([...times].sort((a, b) => a - b))
	expect(data.ledger.map((s) => deriveLedgerStatus(s))).toEqual([
		'completed',
		'missed',
		'planned',
	])
})

async function setSessionLoad(
	sessionId: string,
	tssValue: number | null,
	plannedTssValue: number | null,
) {
	return prisma.workoutSession.update({
		where: { id: sessionId },
		data: { tssValue, plannedTssValue },
	})
}

test('weekly plan adherence rolls the current week into a banded ratio', async () => {
	const session = await setupUser()
	// Two sessions this week: 90/100 and 110/100 → 200/200 = on target,
	// even though neither session matched its plan alone.
	const w1 = await createWorkoutWithSession(
		session.userId,
		new Date(),
		'completed',
	)
	const w2 = await createWorkoutWithSession(
		session.userId,
		new Date(),
		'completed',
	)
	await setSessionLoad(w1.sessions[0]!.id, 90, 100)
	await setSessionLoad(w2.sessions[0]!.id, 110, 100)

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		weeklyAdherence: {
			ratio: number
			band: { tone: string }
			sessionCount: number
		} | null
	}
	expect(data.weeklyAdherence).not.toBeNull()
	expect(data.weeklyAdherence!.ratio).toBe(1)
	expect(data.weeklyAdherence!.band.tone).toBe('on-target')
	expect(data.weeklyAdherence!.sessionCount).toBe(2)
})

test('weekly plan adherence excludes sessions missing a planned or actual side', async () => {
	const session = await setupUser()
	const w1 = await createWorkoutWithSession(
		session.userId,
		new Date(),
		'completed',
	)
	const w2 = await createWorkoutWithSession(
		session.userId,
		new Date(),
		'completed',
	)
	await setSessionLoad(w1.sessions[0]!.id, 80, 100) // both present
	await setSessionLoad(w2.sessions[0]!.id, 200, null) // no planned — excluded

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		weeklyAdherence: { ratio: number; sessionCount: number } | null
	}
	// Only the first session counts: 80 / 100, not (80+200)/100.
	expect(data.weeklyAdherence!.sessionCount).toBe(1)
	expect(data.weeklyAdherence!.ratio).toBeCloseTo(0.8)
})

test('weekly plan adherence is null when the week has no resolvable planned load', async () => {
	const session = await setupUser()
	const w = await createWorkoutWithSession(
		session.userId,
		new Date(),
		'completed',
	)
	await setSessionLoad(w.sessions[0]!.id, 80, null)

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as { weeklyAdherence: unknown | null }
	expect(data.weeklyAdherence).toBeNull()
})

// ── the Week Replan decision line (ADR 0025): stored state only ──

// The closed week's Monday — the same (athlete, weekKey) the recompute-path
// applier writes, so the loader reads exactly the stored decision.
const closedWeekKey = () => addDays(weekMonday(new Date(), 'UTC'), -7)

test('the loader surfaces the stored Week Replan for the latest closed week verbatim', async () => {
	const session = await setupUser()
	await prisma.weekReplan.create({
		data: {
			athleteId: session.userId,
			weekKey: closedWeekKey(),
			outcome: 'adjusted',
			reason:
				'Last week ran 32% over plan and Form was −12 — softened this week’s remaining sessions ~24%.',
			adherenceRatio: 1.32,
			tsb: -12,
			appliedScale: 0.76,
		},
	})

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		weekReplan: { outcome: string; reason: string } | null
	}
	// The stored row, verbatim — never re-derived at render.
	expect(data.weekReplan).toEqual({
		outcome: 'adjusted',
		reason:
			'Last week ran 32% over plan and Form was −12 — softened this week’s remaining sessions ~24%.',
	})
})

test('the loader returns no Week Replan when no decision row exists yet', async () => {
	const session = await setupUser()
	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as { weekReplan: unknown | null }
	// No stored decision → nothing to show; the Week tab never invents a status.
	expect(data.weekReplan).toBeNull()
})

test('an older closed week’s decision does not stand in for the latest one', async () => {
	const session = await setupUser()
	// A decision two weeks back — its "Last week …" copy would be stale now.
	await prisma.weekReplan.create({
		data: {
			athleteId: session.userId,
			weekKey: addDays(closedWeekKey(), -7),
			outcome: 'no-change',
			reason: 'Last week matched the plan — this week stands as planned.',
		},
	})

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as { weekReplan: unknown | null }
	expect(data.weekReplan).toBeNull()
})

test('two straight weeks under the plan surface as a sustained under deviation (#120)', async () => {
	const session = await setupUser()
	// This week and last week both come in light (50/100 → 0.5, under) — a
	// trend the Coach card reconciles into a single "drifting" recommendation.
	const thisWeek = await createWorkoutWithSession(
		session.userId,
		new Date(),
		'completed',
	)
	const lastWeek = await createWorkoutWithSession(
		session.userId,
		inDays(-7),
		'completed',
	)
	await setSessionLoad(thisWeek.sessions[0]!.id, 50, 100)
	await setSessionLoad(lastWeek.sessions[0]!.id, 50, 100)

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		sustained: { tone: string; weeks: number } | null
	}
	expect(data.sustained).toEqual({ tone: 'under', weeks: 2 })
})

test('a single off week is not yet a sustained deviation (#120)', async () => {
	const session = await setupUser()
	// Only this week is under; last week is on plan — below the two-week
	// threshold, so the Coach card stays on its plain Form reading.
	const thisWeek = await createWorkoutWithSession(
		session.userId,
		new Date(),
		'completed',
	)
	const lastWeek = await createWorkoutWithSession(
		session.userId,
		inDays(-7),
		'completed',
	)
	await setSessionLoad(thisWeek.sessions[0]!.id, 50, 100) // under
	await setSessionLoad(lastWeek.sessions[0]!.id, 100, 100) // on target

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as { sustained: unknown | null }
	expect(data.sustained).toBeNull()
})
