import { type AppLoadContext } from 'react-router'
import { expect, test, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatPaceClock } from '#app/utils/format.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action, loader } from './index.tsx'

// recomputeIntensityRanges + recomputePlannedTssForUser fire as fire-and-forget
// after setDisciplineThresholds. In tests the DB is torn down before the async
// recompute completes, triggering console.error (which the test harness converts
// to a failure). Mock both to no-ops (same approach as athlete.server.test.ts).
vi.mock('#app/utils/workout.server.ts', () => ({
	recomputeIntensityRanges: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('#app/utils/load/planned-tss.server.ts', () => ({
	recomputePlannedTssForUser: vi.fn().mockResolvedValue(undefined),
}))

const ROUTE_PATH = '/settings/training'
const ARGS_BASE = {
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

function makeActionRequest(
	formEntries: Array<[string, string]>,
	cookieHeader?: string,
) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	headers.set('content-type', 'application/x-www-form-urlencoded')
	const body = new URLSearchParams(formEntries).toString()
	return new Request(url.toString(), { method: 'POST', headers, body })
}

async function getDisciplineProfile(userId: string, discipline: string) {
	return prisma.disciplineProfile.findFirstOrThrow({
		where: { athleteProfile: { userId }, discipline },
	})
}

type ActionErrorResult = {
	data: { result: { status: string; error: Record<string, string[]> | null } }
	init: { status: number }
}

test('threshold pace entered as mm:ss stores canonical seconds per km', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'run'],
			['thresholdPaceSecPerKm', '4:05'],
		],
		cookie,
	)
	const result = (await action({ request, ...ARGS_BASE })) as {
		result: { status: string }
	}
	expect(result.result.status).toBe('success')

	const profile = await getDisciplineProfile(session.userId, 'run')
	expect(profile.thresholdPaceSecPerKm).toBe(245)
})

test('threshold pace tolerates a /km unit suffix', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'run'],
			['thresholdPaceSecPerKm', '4:00 /km'],
		],
		cookie,
	)
	const result = (await action({ request, ...ARGS_BASE })) as {
		result: { status: string }
	}
	expect(result.result.status).toBe('success')

	const profile = await getDisciplineProfile(session.userId, 'run')
	expect(profile.thresholdPaceSecPerKm).toBe(240)
})

test('CSS entered as mm:ss stores canonical seconds per 100m', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'swim'],
			['cssSecPer100m', '1:35'],
		],
		cookie,
	)
	const result = (await action({ request, ...ARGS_BASE })) as {
		result: { status: string }
	}
	expect(result.result.status).toBe('success')

	const profile = await getDisciplineProfile(session.userId, 'swim')
	expect(profile.cssSecPer100m).toBe(95)
})

test('stored pace round-trips back to the same mm:ss display value', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'run'],
			['thresholdPaceSecPerKm', '4:05'],
		],
		cookie,
	)
	await action({ request, ...ARGS_BASE })

	const loaderRequest = new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'GET',
		headers: { cookie },
	})
	const { athleteProfile } = await loader({
		request: loaderRequest,
		...ARGS_BASE,
	})
	const runProfile = athleteProfile.disciplineProfiles.find(
		(p) => p.discipline === 'run',
	)
	expect(runProfile?.thresholdPaceSecPerKm).toBe(245)
	// The form re-displays the stored canonical seconds as mm:ss.
	expect(formatPaceClock(runProfile!.thresholdPaceSecPerKm!)).toBe('4:05')
})

test('unparseable pace entry returns 400 with mm:ss error copy', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'run'],
			['thresholdPaceSecPerKm', '240'],
		],
		cookie,
	)
	const result = (await action({ request, ...ARGS_BASE })) as ActionErrorResult
	expect(result.data.result.status).toBe('error')
	expect(result.init.status).toBe(400)
	const errors = result.data.result.error?.thresholdPaceSecPerKm ?? []
	expect(errors.join(' ')).toMatch(/mm:ss/i)

	const profile = await prisma.disciplineProfile.findFirst({
		where: { athleteProfile: { userId: session.userId }, discipline: 'run' },
	})
	expect(profile).toBeNull()
})

test('out-of-range pace returns 400 with a mm:ss range message', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'run'],
			['thresholdPaceSecPerKm', '1:30'],
		],
		cookie,
	)
	const result = (await action({ request, ...ARGS_BASE })) as ActionErrorResult
	expect(result.data.result.status).toBe('error')
	expect(result.init.status).toBe(400)
	const errors = result.data.result.error?.thresholdPaceSecPerKm ?? []
	// Range bounds are surfaced in mm:ss, not raw seconds (150–600 s = 2:30–10:00).
	expect(errors.join(' ')).toContain('2:30')
	expect(errors.join(' ')).toContain('10:00')
})

test('out-of-range CSS returns 400 with a mm:ss range message', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'swim'],
			['cssSecPer100m', '5:00'],
		],
		cookie,
	)
	const result = (await action({ request, ...ARGS_BASE })) as ActionErrorResult
	expect(result.data.result.status).toBe('error')
	const errors = result.data.result.error?.cssSecPer100m ?? []
	// 60–250 s per 100m = 1:00–4:10.
	expect(errors.join(' ')).toContain('1:00')
	expect(errors.join(' ')).toContain('4:10')
})

test('empty pace field is treated as omitted, other thresholds still save', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'run'],
			['maxHr', '190'],
			['thresholdPaceSecPerKm', ''],
		],
		cookie,
	)
	const result = (await action({ request, ...ARGS_BASE })) as {
		result: { status: string }
	}
	expect(result.result.status).toBe('success')

	const profile = await getDisciplineProfile(session.userId, 'run')
	expect(profile.maxHr).toBe(190)
	expect(profile.thresholdPaceSecPerKm).toBeNull()
})

test('threshold pace saved via mm:ss records a canonical-seconds threshold event', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'run'],
			['thresholdPaceSecPerKm', '4:05'],
		],
		cookie,
	)
	await action({ request, ...ARGS_BASE })

	const event = await prisma.thresholdEvent.findFirstOrThrow({
		where: {
			athleteProfile: { userId: session.userId },
			kind: 'thresholdPace',
		},
	})
	expect(event.valueNumeric).toBe(245)
})

test('critical running power saves and records a runPower threshold event (ADR 0038)', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const request = makeActionRequest(
		[
			['discipline', 'run'],
			['runPowerThresholdW', '280'],
		],
		cookie,
	)
	const result = (await action({ request, ...ARGS_BASE })) as {
		result: { status: string }
	}
	expect(result.result.status).toBe('success')

	const profile = await getDisciplineProfile(session.userId, 'run')
	expect(profile.runPowerThresholdW).toBe(280)

	const event = await prisma.thresholdEvent.findFirstOrThrow({
		where: {
			athleteProfile: { userId: session.userId },
			kind: 'runPower',
		},
	})
	expect(event.valueNumeric).toBe(280)
})
