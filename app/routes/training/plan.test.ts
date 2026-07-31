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
	// The route dispatches on `intent`: the progression save shares its action with
	// the structural edits (#402).
	const body = new URLSearchParams({ intent: 'set-segment-rates', ...rates })
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

	const result = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	})

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
		(
			await loader({
				request: request(athlete.cookie, '?tab=weeks'),
				...ARGS_BASE,
			})
		).tab,
	).toBe('weeks')
	expect(
		(
			await loader({
				request: request(athlete.cookie, '?tab=nonsense'),
				...ARGS_BASE,
			})
		).tab,
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

// ── The action: editing and deleting the structure (#402) ─────────────────────

function post(cookie: string, body: Record<string, string>) {
	const headers = new Headers({
		cookie,
		'content-type': 'application/x-www-form-urlencoded',
	})
	return new Request(new URL('/training/plan', BASE_URL).toString(), {
		method: 'POST',
		headers,
		body: new URLSearchParams(body).toString(),
	})
}

async function submit(cookie: string, body: Record<string, string>) {
	return action({ request: post(cookie, body), ...ARGS_BASE }).catch(
		(error: unknown) => error,
	)
}

/** A refusal as the route returns it: `data({ error }, { status })`. */
function refusal(result: unknown) {
	const refused = result as {
		data: { error: string }
		init: { status: number }
	}
	return { error: refused.data.error, status: refused.init.status }
}

async function firstPhase(eventId: string) {
	return prisma.planOutlinePhase.findFirstOrThrow({
		where: { outline: { eventId } },
		orderBy: { orderIndex: 'asc' },
		select: { id: true, name: true, weeks: true, rhythm: true, tapers: true },
	})
}

test('a phase is renamed from the Blocks reading, one row at a time', async () => {
	const athlete = await setupAthlete()
	const { eventId } = await createPlannedEvent(athlete.userId)
	const phase = await firstPhase(eventId)

	const result = await submit(athlete.cookie, {
		intent: 'rename-phase',
		phaseId: phase.id,
		name: 'Return to run',
	})

	expect(result).toEqual({ ok: true })
	expect((await firstPhase(eventId)).name).toBe('Return to run')
})

test('resizing a phase re-derives every week on the next read, with none stored', async () => {
	const athlete = await setupAthlete()
	const { eventId, monday } = await createPlannedEvent(athlete.userId)
	const phase = await firstPhase(eventId)

	await submit(athlete.cookie, {
		intent: 'resize-phase',
		phaseId: phase.id,
		weeks: '6',
	})

	const result = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	})
	expect(result.season.weeks).toHaveLength(6)
	// The plan grew forward: its first week is the week it was authored to open on.
	expect(result.season.startWeekKey).toBe(monday)
})

test('a phase’s rhythm and taper flag are set from its own row', async () => {
	const athlete = await setupAthlete()
	const { eventId } = await createPlannedEvent(athlete.userId)
	const phase = await firstPhase(eventId)

	await submit(athlete.cookie, {
		intent: 'set-phase-rhythm',
		phaseId: phase.id,
		rhythm: '2:1',
		tapers: 'on',
	})

	expect(await firstPhase(eventId)).toMatchObject({
		rhythm: '2:1',
		tapers: true,
	})
})

test('a phase is added at a position without moving the Plan Start Week', async () => {
	const athlete = await setupAthlete()
	const { eventId, monday } = await createPlannedEvent(athlete.userId)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { eventId },
		select: { id: true },
	})

	await submit(athlete.cookie, {
		intent: 'add-phase',
		outlineId: outline.id,
		atIndex: '0',
		name: 'Off-season',
		weeks: '3',
		rhythm: 'none',
	})

	const result = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	})
	expect(result.season.phases.map((phase) => phase.name)).toEqual([
		'Off-season',
		'Base',
	])
	expect(result.season.startWeekKey).toBe(monday)
	expect(result.season.weeks).toHaveLength(7)
})

test('a week count the athlete cleared is worded, not thrown', async () => {
	const athlete = await setupAthlete()
	const { eventId } = await createPlannedEvent(athlete.userId)
	const phase = await firstPhase(eventId)

	const response = await submit(athlete.cookie, {
		intent: 'resize-phase',
		phaseId: phase.id,
		weeks: '',
	})

	expect(refusal(response)).toEqual({
		error: 'How many weeks is this phase?',
		status: 400,
	})
	expect((await firstPhase(eventId)).weeks).toBe(4)
})

test('a body with no rhythm is refused, never written as the convention', async () => {
	const athlete = await setupAthlete()
	const { eventId } = await createPlannedEvent(athlete.userId)
	const phase = await firstPhase(eventId)
	await submit(athlete.cookie, {
		intent: 'set-phase-rhythm',
		phaseId: phase.id,
		rhythm: 'none',
	})

	const response = await submit(athlete.cookie, {
		intent: 'set-phase-rhythm',
		phaseId: phase.id,
	})

	// Defaulting to 3:1 here would overwrite the `none` the athlete chose with a
	// convention they never picked (ADR 0044 §4).
	expect(refusal(response)).toEqual({
		error: 'Pick how this phase recovers',
		status: 400,
	})
	expect((await firstPhase(eventId)).rhythm).toBe('none')
})

test('an unreadable position is refused rather than landing at the season’s front', async () => {
	const athlete = await setupAthlete()
	const { eventId } = await createPlannedEvent(athlete.userId)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { eventId },
		select: { id: true },
	})

	const response = await submit(athlete.cookie, {
		intent: 'add-phase',
		outlineId: outline.id,
		atIndex: 'the middle',
		name: 'Sharpen',
		weeks: '3',
		rhythm: '3:1',
	})

	expect(refusal(response).status).toBe(400)
	expect(
		await prisma.planOutlinePhase.count({ where: { outlineId: outline.id } }),
	).toBe(1)
})

test('another athlete cannot edit or delete this plan', async () => {
	const owner = await setupAthlete()
	const intruder = await setupAthlete()
	const { eventId } = await createPlannedEvent(owner.userId)
	const phase = await firstPhase(eventId)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { eventId },
		select: { id: true },
	})

	const renamed = await submit(intruder.cookie, {
		intent: 'rename-phase',
		phaseId: phase.id,
		name: 'Mine now',
	})
	const deleted = await submit(intruder.cookie, {
		intent: 'delete-plan',
		outlineId: outline.id,
	})

	// A row that is not the caller's reads as absent rather than as forbidden.
	expect(refusal(renamed).status).toBe(400)
	expect(refusal(deleted).status).toBe(400)
	expect(await firstPhase(eventId)).toMatchObject({ name: 'Base' })
	expect(
		await prisma.planOutline.findUnique({ where: { id: outline.id } }),
	).not.toBeNull()
})

test('deleting the plan lands home and leaves the Event and its sessions', async () => {
	const athlete = await setupAthlete()
	const { eventId } = await createPlannedEvent(athlete.userId)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { eventId },
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: athlete.userId,
			scheduledAt: new Date(),
			status: 'completed',
			targetEventId: eventId,
		},
	})

	const response = await submit(athlete.cookie, {
		intent: 'delete-plan',
		outlineId: outline.id,
	})

	expect((response as Response).headers.get('location')).toBe('/')
	expect(
		await prisma.planOutline.findUnique({ where: { id: outline.id } }),
	).toBeNull()
	expect(
		await prisma.event.findUnique({
			where: { id: eventId },
			select: { name: true },
		}),
	).toEqual({ name: 'Spring Half Marathon' })
	expect(
		await prisma.workoutSession.findUnique({ where: { id: session.id } }),
	).not.toBeNull()
})

test('an intent this page does not have is refused', async () => {
	const athlete = await setupAthlete()
	await createPlannedEvent(athlete.userId)

	const response = await submit(athlete.cookie, { intent: 'rewrite-history' })

	expect(refusal(response).status).toBe(400)
})

test('the surface reads each track’s segments, its span and the guard', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)

	const result = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	})

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

// ── Applying a periodization preset (#405) ───────────────────────────────────

/** The Outline's phases in season order, with what a preset writes on them. */
async function phasesOf(eventId: string) {
	return prisma.planOutlinePhase.findMany({
		where: { outline: { eventId } },
		orderBy: { orderIndex: 'asc' },
		select: { name: true, weeks: true, rhythm: true, tapers: true },
	})
}

async function outlineIdFor(eventId: string) {
	return (
		await prisma.planOutline.findUniqueOrThrow({
			where: { eventId },
			select: { id: true },
		})
	).id
}

test('applying a shape lays its blocks down and says the plan is now the athlete’s', async () => {
	const athlete = await setupAthlete()
	const { eventId } = await createPlannedEvent(athlete.userId)

	const response = await submit(athlete.cookie, {
		intent: 'apply-preset',
		outlineId: await outlineIdFor(eventId),
		presetKey: 'classic-linear',
	})

	// Back to the reading the athlete applied from, with the message the copy is
	// bound to say out loud: nothing stays linked (ADR 0044 §2, #371).
	expect(response).toHaveRedirect('/training/plan')
	await expect(response).toSendToast(
		expect.objectContaining({
			type: 'success',
			title: 'Copied into your plan',
			description: expect.stringContaining('Nothing stays linked'),
		}),
	)
	// The preset's own phases replaced the one the plan was created with — its
	// week counts as authored, and nothing stretched to reach the Event.
	expect(await phasesOf(eventId)).toEqual([
		{ name: 'Base', weeks: 8, rhythm: '3:1', tapers: false },
		{ name: 'Build', weeks: 6, rhythm: '3:1', tapers: false },
		{ name: 'Peak', weeks: 2, rhythm: 'none', tapers: false },
		{ name: 'Taper', weeks: 2, rhythm: 'none', tapers: true },
	])
})

test('the shape is copied in as ordinary blocks the athlete can then edit', async () => {
	const athlete = await setupAthlete()
	const { eventId } = await createPlannedEvent(athlete.userId)
	await submit(athlete.cookie, {
		intent: 'apply-preset',
		outlineId: await outlineIdFor(eventId),
		presetKey: 'classic-linear',
	})

	const after = await loader({ request: request(athlete.cookie), ...ARGS_BASE })
	// The season now reads as any hand-authored one would: 18 derived weeks, and
	// every cut still unset so the documented convention applies (ADR 0044 §4).
	expect(after.season.weeks).toHaveLength(18)
	expect(after.season.tracks[0]!.segments[0]).toMatchObject({
		ramp: 0.05,
		recoveryCut: null,
		taperCut: null,
	})

	// And an ordinary rename lands on a phase the preset wrote.
	const first = await firstPhase(eventId)
	const renamed = await submit(athlete.cookie, {
		intent: 'rename-phase',
		phaseId: first.id,
		name: 'Return to run',
	})
	expect(renamed).toEqual({ ok: true })
})

test('a shape this app does not ship is refused, and the season is untouched', async () => {
	const athlete = await setupAthlete()
	const { eventId } = await createPlannedEvent(athlete.userId)

	const response = await submit(athlete.cookie, {
		intent: 'apply-preset',
		outlineId: await outlineIdFor(eventId),
		presetKey: 'block-periodization',
	})

	// Block periodization is deferred on evidence; a body naming it is not a shape
	// the surface can apply, and nothing is half-written on the way to finding out.
	expect(refusal(response).status).toBe(400)
	expect(await phasesOf(eventId)).toEqual([
		{ name: 'Base', weeks: 4, rhythm: '3:1', tapers: false },
	])
})

test('another athlete’s plan cannot be reshaped', async () => {
	const owner = await setupAthlete()
	const intruder = await setupAthlete()
	const { eventId } = await createPlannedEvent(owner.userId)

	const response = await submit(intruder.cookie, {
		intent: 'apply-preset',
		outlineId: await outlineIdFor(eventId),
		presetKey: 'big-base',
	})

	// A plan that is not the caller's reads as absent rather than as forbidden.
	expect(refusal(response)).toEqual({
		error: 'That plan is not available to edit.',
		status: 400,
	})
	expect(await phasesOf(eventId)).toHaveLength(1)
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
