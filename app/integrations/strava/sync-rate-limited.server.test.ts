import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { syncStravaActivities } from './sync.server.ts'

/**
 * A manual sync runs inside a request, not on the job queue, so a spent
 * Strava day can't be deferred there (#637). It reports `rate-limited`
 * instead. Kept in its own file: spending the shared limiter's day would make
 * every later test in a file defer too.
 */

test('a spent Strava day returns rate-limited from a manual sync, not a throw', async () => {
	const user = await prisma.user.create({
		data: { ...createUser() },
		select: { id: true },
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'initial_access',
			refreshToken: 'initial_refresh',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	// Strava says the day's read budget is spent: waiting would hold the
	// request until midnight UTC.
	server.use(
		http.get(
			'https://www.strava.com/api/v3/athlete/activities',
			() =>
				new HttpResponse(null, {
					status: 429,
					headers: {
						'X-ReadRateLimit-Limit': '100,1000',
						'X-ReadRateLimit-Usage': '30,1000',
					},
				}),
		),
	)

	const result = await syncStravaActivities(user.id)

	expect(result).toEqual({ ok: false, reason: 'rate-limited' })
	const after = await prisma.accountConnection.findUniqueOrThrow({
		where: { id: connection.id },
	})
	expect(after.lastSyncedAt).toBeNull()
})
