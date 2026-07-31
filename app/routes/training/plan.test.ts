// The planning surface's loader: it reads the active plan, and sends an athlete
// who has none to the flow's first question rather than to an empty page.
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action, loader } from './plan.tsx'

const ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/training/plan',
}

const DAY_MS = 24 * 60 * 60 * 1000

async function setupAthlete() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: { create: { timezone: 'UTC' } },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return { ...session, cookie: await getSessionCookieHeader(session) }
}

/** An upcoming Event carrying a one-phase, one-track Outline opening this week. */
async function createPlannedEvent(
	athleteId: string,
	overrides: { name?: string; inDays?: number } = {},
) {
	const monday = mondayOf(new Date())
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId,
			name: overrides.name ?? 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + (overrides.inDays ?? 60) * DAY_MS),
			disciplines: '["run"]',
		},
	})
	const outline = await prisma.planOutline.create({
		select: { id: true, phases: { select: { id: true } } },
		data: {
			eventId: event.id,
			startWeekKey: monday,
			phases: { create: [{ orderIndex: 0, name: 'Base', weeks: 4 }] },
		},
	})
	const track = await prisma.trainingTrack.create({
		select: { id: true },
		data: {
			outlineId: outline.id,
			discipline: 'run',
			currency: 'km',
			anchors: { create: [{ fromWeekKey: monday, value: 50 }] },
			// One endurance segment per phase, 1:1, with every rate unset — what the
			// authoring service lays down (ADR 0042 §8).
			segments: {
				create: [{ kind: 'endurance', phaseId: outline.phases[0]!.id }],
			},
		},
	})
	const segment = await prisma.trainingTrackSegment.findFirstOrThrow({
		where: { trackId: track.id },
		select: { id: true },
	})
	return { eventId: event.id, monday, segmentId: segment.id }
}

function postRates(
	cookie: string,
	rates: Record<string, string>,
): Parameters<typeof action>[0] {
	const body = new URLSearchParams(rates)
	const headers = new Headers({
		cookie,
		'content-type': 'application/x-www-form-urlencoded',
	})
	return {
		request: new Request(new URL('/training/plan', BASE_URL).toString(), {
			method: 'POST',
			headers,
			body,
		}),
		...ARGS_BASE,
	}
}

/** The stored rates of the plan's one segment. */
async function storedRates(segmentId: string) {
	return prisma.trainingTrackSegment.findUniqueOrThrow({
		where: { id: segmentId },
		select: {
			ramp: true,
			boundaryStep: true,
			recoveryCut: true,
			taperCut: true,
		},
	})
}

function mondayOf(instant: Date): string {
	const date = new Date(
		Date.UTC(
			instant.getUTCFullYear(),
			instant.getUTCMonth(),
			instant.getUTCDate(),
		),
	)
	date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
	return date.toISOString().slice(0, 10)
}

function request(cookie?: string, search = '') {
	const url = new URL(`/training/plan${search}`, BASE_URL)
	const headers = new Headers()
	if (cookie) headers.set('cookie', cookie)
	return new Request(url.toString(), { method: 'GET', headers })
}

test('an athlete with no plan is sent to the flow’s first question', async () => {
	const athlete = await setupAthlete()

	const response = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).headers.get('location')).toBe(
		'/training/plan/new',
	)
})

test('the surface reads the authored season, phases and derived weeks', async () => {
	const athlete = await setupAthlete()
	const { eventId, monday } = await createPlannedEvent(athlete.userId)

	const result = await loader({ request: request(athlete.cookie), ...ARGS_BASE })

	expect(result.season.eventId).toBe(eventId)
	expect(result.season.startWeekKey).toBe(monday)
	expect(result.season.weeks).toHaveLength(4)
	expect(result.season.weeks[0]?.targets[0]?.value).toBe(50)
	expect(result.season.phases[0]).toMatchObject({
		name: 'Base',
		fromWeekInPlan: 1,
		toWeekInPlan: 4,
	})
	// The default reading is Blocks, kept out of the URL.
	expect(result.tab).toBe('blocks')
})

test('the Weeks reading is selected by search param, and an unknown one is not', async () => {
	const athlete = await setupAthlete()
	await createPlannedEvent(athlete.userId)

	expect(
		(await loader({ request: request(athlete.cookie, '?tab=weeks'), ...ARGS_BASE }))
			.tab,
	).toBe('weeks')
	expect(
		(await loader({ request: request(athlete.cookie, '?tab=nonsense'), ...ARGS_BASE }))
			.tab,
	).toBe('blocks')
})

test('a named Event shows that Event’s season, not the nearest one', async () => {
	const athlete = await setupAthlete()
	await createPlannedEvent(athlete.userId)
	const later = await createPlannedEvent(athlete.userId, {
		name: 'Next Season',
		inDays: 400,
	})

	const result = await loader({
		request: request(athlete.cookie, `?event=${later.eventId}`),
		...ARGS_BASE,
	})

	expect(result.season.eventId).toBe(later.eventId)
	expect(result.eventQuery).toBe(later.eventId)
})

test('a named Event with no plan of its own falls back to the active plan', async () => {
	const athlete = await setupAthlete()
	await createPlannedEvent(athlete.userId)
	const marker = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: athlete.userId,
			name: 'Just a marker',
			kind: 'race',
			priority: 'C',
			startDate: new Date(Date.now() + 20 * DAY_MS),
			disciplines: '["run"]',
		},
	})

	const response = await loader({
		request: request(athlete.cookie, `?event=${marker.id}`),
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	expect((response as Response).headers.get('location')).toBe('/training/plan')
})

test('an unauthenticated athlete is sent to login', async () => {
	const response = await loader({ request: request(), ...ARGS_BASE }).catch(
		(error: unknown) => error,
	)

	expect((response as Response).headers.get('location')).toContain('/login')
})

test('the surface reads each track’s segments, its span and the guard', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)

	const result = await loader({ request: request(athlete.cookie), ...ARGS_BASE })

	const track = result.season.tracks[0]!
	expect(track.segments).toEqual([
		{
			segmentId,
			phaseIndex: 0,
			ramp: null,
			boundaryStep: null,
			recoveryCut: null,
			taperCut: null,
		},
	])
	// No ramp authored yet, so the season is flat and spans from itself to itself —
	// honest, and not an Unavailable Metric.
	expect(track.span).toMatchObject({ anchor: 50, peak: 50 })
	expect(track.warnings).toEqual([])
})

test('authoring the ramp moves the derived weeks and the Season Span', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)

	const result = await action(
		postRates(athlete.cookie, { segmentId, ramp: '5', recoveryCut: '20' }),
	)

	expect(result).toMatchObject({ segmentId })
	// Percent at the form boundary, fractions in storage (ADR 0040 §10).
	expect(await storedRates(segmentId)).toEqual({
		ramp: 0.05,
		boundaryStep: null,
		recoveryCut: 0.2,
		taperCut: null,
	})
	const after = await loader({ request: request(athlete.cookie), ...ARGS_BASE })
	// Three loading weeks then a recovery week: the peak is week 3, and the span
	// and the weeks are recomputed on read rather than stored (ADR 0040 §1).
	expect(after.season.tracks[0]!.span).toMatchObject({ peakWeekIndex: 2 })
	expect(after.season.weeks[3]!.targets[0]!.value).toBeCloseTo(
		50 * 1.05 ** 2 * 0.8,
		6,
	)
})

test('a blank rate clears an authored one back to the convention', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)
	await action(postRates(athlete.cookie, { segmentId, recoveryCut: '20' }))

	await action(postRates(athlete.cookie, { segmentId, recoveryCut: '' }))

	// Stored as unset, not as the convention's own number: an authored −30% and the
	// convention's −30% must stay different states (ADR 0044 §4).
	expect((await storedRates(segmentId)).recoveryCut).toBeNull()
})

test('a ramp steeper than the convention saves, and the guard says so', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)

	await action(postRates(athlete.cookie, { segmentId, ramp: '12' }))

	// Warns and never blocks (ADR 0040 §12).
	expect((await storedRates(segmentId)).ramp).toBeCloseTo(0.12, 6)
	const after = await loader({ request: request(athlete.cookie), ...ARGS_BASE })
	expect(after.season.tracks[0]!.warnings).toEqual([
		{ subject: 'ramp', phaseIndex: 0, authored: 0.12 },
	])
})

test('a rate outside the storable range is a form error, not a throw', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)

	// 500% a week — a 5 typed where 0.05 was meant.
	const response = (await action(
		postRates(athlete.cookie, { segmentId, ramp: '500' }),
	)) as { init: { status: number } }

	expect(response.init.status).toBe(400)
	expect((await storedRates(segmentId)).ramp).toBeNull()
})

test('another athlete’s segment cannot be authored', async () => {
	const owner = await setupAthlete()
	const intruder = await setupAthlete()
	const { segmentId } = await createPlannedEvent(owner.userId)

	const response = (await action(
		postRates(intruder.cookie, { segmentId, ramp: '5' }),
	)) as { init: { status: number } }

	expect(response.init.status).toBe(400)
	expect((await storedRates(segmentId)).ramp).toBeNull()
})
