import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import {
	autoSaveImport,
	createActivityImport,
} from '#app/utils/activity-import.server.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createEvent, setEventResult } from '#app/utils/event.server.ts'
import { addPerformanceResult } from '#app/utils/performance-result-writer.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './resultater.tsx'

// Løpsresultater's loader marks which result a `racePace` target resolves
// against (ADR 0117 §3). The mark is read off the resolver's own choice: a
// row says "the typed time you wrote the same day is used" only when that
// typed row is the one in use.

const ROUTE_PATH = '/settings/training/resultater'
const DAY_MS = 86_400_000
const dayKey = (offset: number) =>
	new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10)
const RACE_DAY = dayKey(-9)
const LATER_DAY = dayKey(-2)
const RACE_START = new Date(`${RACE_DAY}T08:00:00Z`)
const NOW = new Date()

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
	await prisma.athleteProfile.create({
		data: { userId: session.userId, timezone: 'UTC' },
	})
	return session
}

/** A 10 km race Event whose result is read from a Garmin Recording. */
async function eventResult(userId: string) {
	const event = await createEvent(userId, {
		name: 'Sentrumsløpet',
		kind: 'race',
		priority: 'A',
		startDate: new Date(`${RACE_DAY}T00:00:00Z`),
		disciplines: ['run'],
		status: 'planned',
		distanceM: 10000,
	})
	const imported = await createActivityImport(userId, {
		externalProvider: 'intervalsicu',
		externalId: 'race-1',
		originPlatform: 'garmin',
		deviceName: 'Garmin Forerunner 265',
		startedAt: RACE_START,
		endedAt: new Date(RACE_START.getTime() + 2472_000),
		durationSec: 2442,
		distanceM: 10210,
		discipline: 'run',
		rawJson: '{}',
	})
	const saved = await autoSaveImport(userId, imported.id, 'UTC')
	await setEventResult(userId, event.id, saved!.sessionId)
	return event
}

async function rows(session: { id: string; userId: string }) {
	const request = new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		headers: { cookie: await getSessionCookieHeader(session) },
	})
	const data = await loader({
		request,
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: ROUTE_PATH,
	})
	return data.results
}

test('a typed time the same day is marked in use, and the Event row says why it is not', async () => {
	const session = await athlete()
	await eventResult(session.userId)
	await addPerformanceResult(
		session.userId,
		{ anchor: '10k', timeSec: 2465, date: RACE_DAY, source: 'race' },
		NOW,
	)

	expect(await rows(session)).toEqual([
		expect.objectContaining({ event: null, inUse: true, shadowed: false }),
		expect.objectContaining({
			event: expect.objectContaining({ name: 'Sentrumsløpet' }),
			inUse: false,
			shadowed: true,
		}),
	])
})

test('a newer result at the anchor leaves both same-day rows unmarked', async () => {
	const session = await athlete()
	await eventResult(session.userId)
	await addPerformanceResult(
		session.userId,
		{ anchor: '10k', timeSec: 2465, date: RACE_DAY, source: 'race' },
		NOW,
	)
	await addPerformanceResult(
		session.userId,
		{ anchor: '10k', timeSec: 2440, date: LATER_DAY, source: 'race' },
		NOW,
	)

	// The newest typed result is the one in use, so neither row on the race day
	// may claim the other is used.
	expect(await rows(session)).toEqual([
		expect.objectContaining({ event: null, inUse: false, shadowed: false }),
		expect.objectContaining({ event: null, inUse: false, shadowed: false }),
		expect.objectContaining({
			event: expect.objectContaining({ name: 'Sentrumsløpet' }),
			inUse: false,
			shadowed: false,
		}),
	])
})
