// The authoring flow's second step, server side: what the loader proposes from
// the athlete's own history, and what the action writes.
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { presetFor } from '#app/utils/plan-outline/presets.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action, loader } from './plan.new.$eventId.tsx'

const ARGS_BASE = {
	context: {} as AppLoadContext,
	unstable_pattern: '/training/plan/new/:eventId',
}

async function setupAthlete() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: { create: { timezone: 'Europe/Oslo' } },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return { ...session, cookie: await getSessionCookieHeader(session) }
}

async function createRace(
	athleteId: string,
	overrides: { startDate?: Date; disciplines?: string[]; status?: string } = {},
) {
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: overrides.startDate ?? inDays(120),
			status: overrides.status ?? 'planned',
			disciplines: JSON.stringify(overrides.disciplines ?? ['run']),
		},
	})
	return event.id
}

const DAY_MS = 24 * 60 * 60 * 1000
const inDays = (n: number) => new Date(Date.now() + n * DAY_MS)
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS)

/** A completed run with a Recording — the only kind of history the pre-fill reads. */
async function logRun(
	athleteId: string,
	{ daysBack, km, minutes }: { daysBack: number; km: number; minutes: number },
) {
	const recording = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId,
			externalProvider: 'manual',
			externalId: `run-${daysBack}-${Math.random()}`,
			startedAt: daysAgo(daysBack),
			endedAt: daysAgo(daysBack),
			durationSec: minutes * 60,
			distanceM: km * 1000,
			discipline: 'run',
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

function loaderRequest(eventId: string, cookie?: string, search = '') {
	const url = new URL(`/training/plan/new/${eventId}${search}`, BASE_URL)
	const headers = new Headers()
	if (cookie) headers.set('cookie', cookie)
	return new Request(url.toString(), { method: 'GET', headers })
}

function actionRequest(
	eventId: string,
	entries: Array<[string, string]>,
	cookie?: string,
) {
	const url = new URL(`/training/plan/new/${eventId}`, BASE_URL)
	const headers = new Headers({
		'content-type': 'application/x-www-form-urlencoded',
	})
	if (cookie) headers.set('cookie', cookie)
	return new Request(url.toString(), {
		method: 'POST',
		headers,
		body: new URLSearchParams(entries).toString(),
	})
}

function validEntries(
	overrides: Array<[string, string]> = [],
): Array<[string, string]> {
	return [
		// The athlete's own blocks, which is what the phase rows below are for. A
		// shape posts `structure` alone and no rows at all — `shapeEntries`.
		['structure', 'own'],
		['currency', 'km'],
		['anchorValue', '55'],
		['discipline', 'run'],
		['phaseName', 'Base'],
		['phaseWeeks', '8'],
		['phaseName', 'Build'],
		['phaseWeeks', '4'],
		['phaseName', ''],
		['phaseWeeks', ''],
		...overrides,
	]
}

/** The same form, submitted with a shape picked instead of hand-typed blocks. */
function shapeEntries(
	presetKey: string,
	overrides: Array<[string, string]> = [],
): Array<[string, string]> {
	return [
		['structure', presetKey],
		['currency', 'km'],
		['anchorValue', '55'],
		['discipline', 'run'],
		...overrides,
	]
}

test('the loader proposes km and the window average from the athlete’s own runs', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)
	// Four completed weeks back — inside the pre-fill window, whatever weekday today
	// is, since the window is the four complete weeks before this one.
	for (const daysBack of [8, 11, 15, 22]) {
		await logRun(athlete.userId, { daysBack, km: 10, minutes: 50 })
	}

	const result = await loader({
		request: loaderRequest(eventId, athlete.cookie),
		params: { eventId },
		...ARGS_BASE,
	})

	expect(result.discipline).toBe('run')
	expect(result.proposal?.currency).toBe('km')
	expect(result.proposal?.offered).toEqual(['km', 'hours', 'tss'])
	expect(result.proposal?.anchors.km?.value).toBe(10)
	expect(result.proposal?.anchors.km?.derivation).toMatchObject({
		source: 'recent-training',
		windowWeeks: 4,
		total: 40,
		currency: 'km',
	})
	// Hours is offered beside distance and carries its *own* figure: 4 × 50 min is
	// 3⅓ h over the window, so 0.8 h/wk — never the distance number relabelled.
	expect(result.proposal?.anchors.hours?.value).toBe(0.8)
})

test('the loader proposes nothing to an athlete with no history', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)

	const result = await loader({
		request: loaderRequest(eventId, athlete.cookie),
		params: { eventId },
		...ARGS_BASE,
	})

	expect(result.proposal?.currency).toBeNull()
	expect(result.proposal?.anchors).toEqual({})
	// The unit is still theirs to pick — honest beats guessing (ADR 0043 §2).
	expect(result.proposal?.offered).toEqual(['km', 'hours', 'tss'])
})

test('the start-week options are Mondays, defaulting to this week’s', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)

	const result = await loader({
		request: loaderRequest(eventId, athlete.cookie),
		params: { eventId },
		...ARGS_BASE,
	})

	const mondays = result.weekOptions.filter(
		(option) => new Date(`${option.weekKey}T00:00:00.000Z`).getUTCDay() === 1,
	)
	expect(mondays).toHaveLength(result.weekOptions.length)
	expect(result.weekOptions.filter((option) => option.isCurrent)).toHaveLength(
		1,
	)
	expect(result.currentWeekKey).toBe(
		result.weekOptions.find((option) => option.isCurrent)?.weekKey,
	)
})

test('the loader sends another athlete’s Event back to the first question', async () => {
	const owner = await setupAthlete()
	const intruder = await setupAthlete()
	const eventId = await createRace(owner.userId)

	const response = await loader({
		request: loaderRequest(eventId, intruder.cookie),
		params: { eventId },
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).headers.get('location')).toBe(
		'/training/plan/new',
	)
})

test('a past Event cannot be planned against, even by URL', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId, { startDate: daysAgo(10) })

	const response = await loader({
		request: loaderRequest(eventId, athlete.cookie),
		params: { eventId },
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	expect((response as Response).headers.get('location')).toBe(
		'/training/plan/new',
	)
})

test('the action authors the Outline and lands on the plan', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)
	const start = (
		await loader({
			request: loaderRequest(eventId, athlete.cookie),
			params: { eventId },
			...ARGS_BASE,
		})
	).currentWeekKey

	const response = await action({
		request: actionRequest(
			eventId,
			validEntries([['startWeekKey', start]]),
			athlete.cookie,
		),
		params: { eventId },
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	expect(response).toBeInstanceOf(Response)
	// To the season just authored, which need not be the nearest upcoming one.
	expect((response as Response).headers.get('location')).toBe(
		`/training/plan?event=${eventId}`,
	)

	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { eventId },
		select: {
			startWeekKey: true,
			phases: {
				orderBy: { orderIndex: 'asc' },
				select: { name: true, weeks: true },
			},
			tracks: {
				select: {
					discipline: true,
					currency: true,
					anchors: { select: { fromWeekKey: true, value: true } },
				},
			},
		},
	})
	expect(outline.startWeekKey).toBe(start)
	// The blank row the form always renders is not a phase.
	expect(outline.phases).toEqual([
		{ name: 'Base', weeks: 8 },
		{ name: 'Build', weeks: 4 },
	])
	expect(outline.tracks).toEqual([
		{
			discipline: 'run',
			currency: 'km',
			anchors: [{ fromWeekKey: start, value: 55 }],
		},
	])
})

test('a half-filled phase row is refused rather than quietly dropped', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)
	const start = (
		await loader({
			request: loaderRequest(eventId, athlete.cookie),
			params: { eventId },
			...ARGS_BASE,
		})
	).currentWeekKey

	const result = (await action({
		request: actionRequest(
			eventId,
			[
				['startWeekKey', start],
				['currency', 'km'],
				['anchorValue', '55'],
				['discipline', 'run'],
				['phaseName', 'Base'],
				['phaseWeeks', ''],
			],
			athlete.cookie,
		),
		params: { eventId },
		...ARGS_BASE,
	})) as { data: { result: { status: string } }; init: { status: number } }

	expect(result.data.result.status).toBe('error')
	expect(result.init.status).toBe(400)
	expect(await prisma.planOutline.count({ where: { eventId } })).toBe(0)
})

test('own blocks with none typed is refused, on the field that decides it', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)
	const start = (
		await loader({
			request: loaderRequest(eventId, athlete.cookie),
			params: { eventId },
			...ARGS_BASE,
		})
	).currentWeekKey

	const result = (await action({
		request: actionRequest(
			eventId,
			[
				['structure', 'own'],
				['startWeekKey', start],
				['currency', 'km'],
				['anchorValue', '55'],
				['discipline', 'run'],
			],
			athlete.cookie,
		),
		params: { eventId },
		...ARGS_BASE,
	})) as {
		data: {
			result: { status: string; error?: Record<string, string[] | null> }
		}
	}

	expect(result.data.result.status).toBe('error')
	// Addressed to the choice, so the athlete can answer it by picking a shape
	// rather than by hunting for a rule about phases.
	expect(result.data.result.error?.structure?.join(' ')).toMatch(
		/start from a shape/i,
	)
	expect(await prisma.planOutline.count({ where: { eventId } })).toBe(0)
})

test('a form naming no structure at all is refused', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)

	const result = (await action({
		request: actionRequest(
			eventId,
			[
				['startWeekKey', '2030-01-07'],
				['currency', 'km'],
				['anchorValue', '55'],
				['discipline', 'run'],
			],
			athlete.cookie,
		),
		params: { eventId },
		...ARGS_BASE,
	})) as { data: { result: { status: string } } }

	expect(result.data.result.status).toBe('error')
	expect(await prisma.planOutline.count({ where: { eventId } })).toBe(0)
})

test('a shape authors the whole season — its blocks, its climb and its mix', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)
	const start = (
		await loader({
			request: loaderRequest(eventId, athlete.cookie),
			params: { eventId },
			...ARGS_BASE,
		})
	).currentWeekKey

	const response = await action({
		request: actionRequest(
			eventId,
			shapeEntries('classic-linear', [['startWeekKey', start]]),
			athlete.cookie,
		),
		params: { eventId },
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	expect((response as Response).headers.get('location')).toBe(
		`/training/plan?event=${eventId}`,
	)

	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { eventId },
		select: {
			phases: {
				orderBy: { orderIndex: 'asc' },
				select: { name: true, weeks: true, rhythm: true, tapers: true },
			},
			tracks: {
				select: {
					segments: {
						orderBy: { phase: { orderIndex: 'asc' } },
						select: {
							ramp: true,
							boundaryStep: true,
							mix: { select: { zone: true, sessionsPerWeek: true } },
						},
					},
				},
			},
		},
	})

	const preset = presetFor('classic-linear')
	// The shape's own blocks, at the length it recommends — nothing stretched to
	// reach the Event.
	expect(outline.phases).toEqual(
		preset.phases.map((phase) => ({
			name: phase.name,
			weeks: phase.weeks,
			rhythm: phase.rhythm,
			tapers: phase.tapers,
		})),
	)
	// And the progression with them, which is the half a plan created from typed
	// blocks does not have: a first plan climbs and has quality sessions in it.
	const segments = outline.tracks[0]!.segments
	expect(segments.map((segment) => segment.ramp)).toEqual(
		preset.phases.map((phase) => phase.ramp),
	)
	expect(segments.map((segment) => segment.mix)).toEqual(
		preset.phases.map((phase) => phase.mix),
	)
})

test('a shape stores no cut, so the convention stays a convention', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)

	await action({
		request: actionRequest(
			eventId,
			shapeEntries('big-base', [['startWeekKey', '2030-01-07']]),
			athlete.cookie,
		),
		params: { eventId },
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	// The cuts live on the track segment, and a shape authors neither: unset, the
	// documented convention applies and stays visible as a convention (ADR 0044 §4).
	const segments = await prisma.trainingTrackSegment.findMany({
		where: { track: { outline: { eventId } } },
		select: { recoveryCut: true, taperCut: true },
	})
	expect(segments.length).toBeGreaterThan(0)
	for (const segment of segments) {
		expect(segment.recoveryCut).toBeNull()
		expect(segment.taperCut).toBeNull()
	}
})

test('a start week that is not a Monday is a field error, not a generic one', async () => {
	const athlete = await setupAthlete()
	const eventId = await createRace(athlete.userId)

	// A tampered body meets the same rule the service applies, addressed to the
	// field the athlete would fix.
	const result = (await action({
		request: actionRequest(
			eventId,
			validEntries([['startWeekKey', '2030-01-09']]),
			athlete.cookie,
		),
		params: { eventId },
		...ARGS_BASE,
	})) as {
		data: {
			result: { status: string; error?: Record<string, string[] | null> }
		}
	}

	expect(result.data.result.status).toBe('error')
	expect(result.data.result.error?.startWeekKey?.join(' ')).toMatch(/Monday/)
	expect(await prisma.planOutline.count({ where: { eventId } })).toBe(0)
})

test('another athlete’s Event is refused by the action too, not only the loader', async () => {
	const owner = await setupAthlete()
	const intruder = await setupAthlete()
	const eventId = await createRace(owner.userId)

	const result = (await action({
		request: actionRequest(
			eventId,
			validEntries([['startWeekKey', '2030-01-07']]),
			intruder.cookie,
		),
		params: { eventId },
		...ARGS_BASE,
	})) as { data: { result: { status: string } } }

	expect(result.data.result.status).toBe('error')
	expect(await prisma.planOutline.count({ where: { eventId } })).toBe(0)
})

test('an unauthenticated athlete is sent to login', async () => {
	const eventId = 'whatever'
	const response = await loader({
		request: loaderRequest(eventId),
		params: { eventId },
		...ARGS_BASE,
	}).catch((error: unknown) => error)

	expect((response as Response).headers.get('location')).toContain('/login')
})
