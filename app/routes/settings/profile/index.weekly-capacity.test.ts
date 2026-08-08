// The **Weekly Capacity** on the Athlete Profile screen, server side: what the
// loader proposes from the athlete's own endurance training, when it proposes
// nothing at all, and what the action writes (ADR 0050).
//
// The one behaviour worth a test of its own is the **non**-behaviour: once the
// athlete has authored a capacity, nothing re-reads their history. A pre-fill that
// kept re-deriving would move a stored number as activities imported in the
// background, which is the failure ADR 0040 §6 exists to prevent — and it is
// invisible in a screenshot, because the field looks identical either way.

import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ANCHOR_WINDOW_WEEKS } from '#app/utils/plan-outline/proposal.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action, loader } from './index.tsx'

const ROUTE_PATH = '/settings/profile'
const ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS)

async function setupAthlete(weeklyCapacityHours: number | null = null) {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: {
						create: { timezone: 'UTC', weeklyCapacityHours },
					},
				},
			},
		},
		select: { id: true, userId: true },
	})
	return { ...session, cookie: await getSessionCookieHeader(session) }
}

/**
 * A completed endurance session with a **Recording** — the only kind of history
 * the pre-fill reads, since a hand-logged session carries no achieved duration.
 *
 * `daysBack` places it in a completed Training Week: 8 and 15 are two different
 * weeks in the four-week window, whatever weekday today happens to be, as long as
 * they stay clear of the week in progress.
 */
async function logSession(
	athleteId: string,
	{
		daysBack,
		minutes,
		discipline = 'run',
	}: { daysBack: number; minutes: number; discipline?: string },
) {
	const recording = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId,
			externalProvider: 'manual',
			externalId: `${discipline}-${daysBack}-${Math.random()}`,
			startedAt: daysAgo(daysBack),
			endedAt: daysAgo(daysBack),
			durationSec: minutes * 60,
			distanceM: 10_000,
			discipline,
			rawJson: '{}',
		},
	})
	await prisma.workoutSession.create({
		data: {
			userId: athleteId,
			scheduledAt: daysAgo(daysBack),
			status: 'completed',
			recordingId: recording.id,
		},
	})
}

async function runLoader(session: { cookie: string }) {
	return loader({
		request: new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
			headers: { cookie: session.cookie },
		}),
		...ARGS_BASE,
	})
}

test('the capacity is pre-filled from the athlete’s own endurance hours, with its derivation', async () => {
	const athlete = await setupAthlete()
	// Six hours across two weeks of the four-week window: the average is over the
	// whole window, so the proposal is 1.5 h/wk and the derivation says why.
	await logSession(athlete.userId, { daysBack: 8, minutes: 180 })
	await logSession(athlete.userId, { daysBack: 15, minutes: 180 })

	const data = await runLoader(athlete)

	expect(data.capacityPrefill).toEqual({
		hours: 1.5,
		derivation: {
			source: 'recent-training',
			windowWeeks: ANCHOR_WINDOW_WEEKS,
			weeksTrained: 2,
			total: 6,
			currency: 'hours',
		},
	})
})

test('the pre-fill sums the endurance Disciplines and counts a shared week once', async () => {
	const athlete = await setupAthlete()
	// A run and a swim in the same Training Week: two hours of training, one week
	// trained. Adding the per-Discipline counts would say two.
	await logSession(athlete.userId, { daysBack: 8, minutes: 60 })
	await logSession(athlete.userId, {
		daysBack: 8,
		minutes: 60,
		discipline: 'swim',
	})

	const data = await runLoader(athlete)

	expect(data.capacityPrefill?.derivation.total).toBe(2)
	expect(data.capacityPrefill?.derivation.weeksTrained).toBe(1)
})

test('an athlete with no history gets no pre-fill — an Unavailable proposal, never a default', async () => {
	const athlete = await setupAthlete()

	const data = await runLoader(athlete)

	expect(data.capacityPrefill).toBeNull()
	expect(data.athleteProfile.weeklyCapacityHours).toBeNull()
})

test('an authored capacity is never re-derived, however much the athlete has trained since', async () => {
	const athlete = await setupAthlete(8)
	await logSession(athlete.userId, { daysBack: 8, minutes: 600 })

	const data = await runLoader(athlete)

	expect(data.athleteProfile.weeklyCapacityHours).toBe(8)
	expect(data.capacityPrefill).toBeNull()
})

test('the athlete profile form stores a Weekly Capacity in hours', async () => {
	const athlete = await setupAthlete()

	await action({
		request: new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
			method: 'POST',
			headers: {
				cookie: athlete.cookie,
				'content-type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams([
				['intent', 'update-athlete-profile'],
				['timezone', 'UTC'],
				['weeklyCapacityHours', '9.5'],
			]).toString(),
		}),
		...ARGS_BASE,
	})

	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId: athlete.userId },
	})
	expect(profile.weeklyCapacityHours).toBe(9.5)
})
