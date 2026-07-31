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
	return {
		eventId: event.id,
		monday,
		segmentId: segment.id,
		// The two handles a **Week Pattern** edit addresses: the Outline a pattern
		// belongs to, and the track a pattern day draws its volume from (#410).
		outlineId: outline.id,
		trackId: track.id,
	}
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

/**
 * Post a **Quality Session Mix**: one field per quality zone, named for the zone.
 *
 * Every zone is submitted on every save, since the mix is replaced whole — which is
 * what makes "clear the mix" expressible as three blank boxes.
 */
function postMix(
	cookie: string,
	counts: Record<string, string>,
): Parameters<typeof action>[0] {
	const body = new URLSearchParams({ intent: 'set-quality-mix', ...counts })
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

/** The stored mix rows of one segment, ascending by zone. */
async function storedMix(segmentId: string) {
	return prisma.qualitySessionMixEntry.findMany({
		where: { segmentId },
		orderBy: { zone: 'asc' },
		select: { zone: true, sessionsPerWeek: true },
	})
}

/** How many trainable weekdays the athlete says they have — `null` until they say. */
async function setTrainableWeekdays(userId: string, weekdays: string | null) {
	await prisma.athleteProfile.update({
		where: { userId },
		data: { trainableWeekdays: weekdays },
	})
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
			// A segment with no mix rows reads as an *empty mix* — "no quality sessions
			// in this segment" — rather than as a missing value (ADR 0042 §6).
			mix: [],
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

test('a shape that does not fill the run-in says so, and stretches nothing', async () => {
	const athlete = await setupAthlete()
	// An event roughly 10 weeks out, against an 18-week shape. The preset's phases
	// are fixed length, so the plan runs *past* the Event and the surface reports
	// that rather than squeezing four blocks into ten weeks (#405; ADR 0044 §3).
	const { eventId } = await createPlannedEvent(athlete.userId, { inDays: 70 })
	await submit(athlete.cookie, {
		intent: 'apply-preset',
		outlineId: await outlineIdFor(eventId),
		presetKey: 'classic-linear',
	})

	const after = await loader({ request: request(athlete.cookie), ...ARGS_BASE })
	expect(after.season.weeks).toHaveLength(18)
	// The direction, not the exact gap: the run-in's week count depends on which
	// weekday the suite runs on, and `event-fit.test.ts` already pins the arithmetic.
	expect(after.season.fit.kind).toBe('runs-past')
	// Every phase is the length the preset authored — nothing was scaled to fit.
	expect((await phasesOf(eventId)).map((phase) => phase.weeks)).toEqual([
		8, 6, 2, 2,
	])
})

test('a shape longer than the run-in leaves the plan ending before the event', async () => {
	const athlete = await setupAthlete()
	// The mirror case: an event far out, so the same fixed-length shape ends early.
	const { eventId } = await createPlannedEvent(athlete.userId, { inDays: 175 })
	await submit(athlete.cookie, {
		intent: 'apply-preset',
		outlineId: await outlineIdFor(eventId),
		presetKey: 'classic-linear',
	})

	const after = await loader({ request: request(athlete.cookie), ...ARGS_BASE })
	expect(after.season.weeks).toHaveLength(18)
	expect(after.season.fit.kind).toBe('ends-before')
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

// ── Authoring the Quality Session Mix (ADR 0042 §3–§6) ───────────────────────

test('a posted mix stores one row per zone, and stores nothing derived', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)

	const result = await action(
		postMix(athlete.cookie, { segmentId, zone4: '2', zone5: '1' }),
	)

	expect(result).toMatchObject({ intent: 'set-quality-mix', segmentId })
	expect(await storedMix(segmentId)).toEqual([
		{ zone: 4, sessionsPerWeek: 2 },
		{ zone: 5, sessionsPerWeek: 1 },
	])
	// The count and the label are read off those rows on the next load and are
	// stored nowhere: three sessions exist only as the sum of the mix (ADR 0042 §4).
	const after = await loader({ request: request(athlete.cookie), ...ARGS_BASE })
	expect(after.season.tracks[0]!.segments[0]!.mix).toEqual([
		{ zone: 4, sessionsPerWeek: 2 },
		{ zone: 5, sessionsPerWeek: 1 },
	])
	const segmentRow = await prisma.trainingTrackSegment.findUniqueOrThrow({
		where: { id: segmentId },
	})
	expect(Object.keys(segmentRow).join(' ')).not.toMatch(
		/qualitySession|emphasis/i,
	)
})

test('three blank counts clear the mix, and that is a save rather than a refusal', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)
	await action(postMix(athlete.cookie, { segmentId, zone3: '1', zone4: '2' }))

	const result = await action(
		postMix(athlete.cookie, { segmentId, zone3: '', zone4: '', zone5: '' }),
	)

	// An empty mix is the positive statement "no quality sessions in this segment"
	// (ADR 0042 §6), so clearing succeeds and leaves no rows behind.
	expect(result).toMatchObject({ intent: 'set-quality-mix', segmentId })
	expect(await storedMix(segmentId)).toEqual([])
})

test('a zone posted as 0 is left out of the mix rather than stored as a zero', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)

	await action(
		postMix(athlete.cookie, { segmentId, zone3: '0', zone4: '2', zone5: '0' }),
	)

	// The mix holds the zones that are *in* it, so a zero has nothing to store and a
	// stored `sessionsPerWeek: 0` would be a term the label would have to drop again.
	expect(await storedMix(segmentId)).toEqual([{ zone: 4, sessionsPerWeek: 2 }])
})

test('a session count that is not a whole number in range is a field error, storing nothing', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)

	const fraction = (await action(
		postMix(athlete.cookie, { segmentId, zone4: '1.5' }),
	)) as { init: { status: number } }
	// 70 typed where 7 was meant — the storage schema's typo guard, at the boundary.
	const typo = (await action(
		postMix(athlete.cookie, { segmentId, zone4: '70' }),
	)) as { init: { status: number } }

	expect(fraction.init.status).toBe(400)
	expect(typo.init.status).toBe(400)
	expect(await storedMix(segmentId)).toEqual([])
})

test('another athlete’s segment cannot have its mix authored', async () => {
	const owner = await setupAthlete()
	const intruder = await setupAthlete()
	const { segmentId } = await createPlannedEvent(owner.userId)

	const response = (await action(
		postMix(intruder.cookie, { segmentId, zone4: '2' }),
	)) as { init: { status: number } }

	// A row that is not the caller's reads as absent rather than as forbidden.
	expect(response.init.status).toBe(400)
	expect(await storedMix(segmentId)).toEqual([])
})

test('a mix that outruns the athlete’s trainable weekdays still saves, and warns', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)
	// Two trainable weekdays against four quality sessions.
	await setTrainableWeekdays(athlete.userId, '[2,4]')

	await action(
		postMix(athlete.cookie, { segmentId, zone3: '1', zone4: '2', zone5: '1' }),
	)

	// Advisory and never blocking (ADR 0042 §9): the mix is stored exactly as
	// authored, and the surface has something to say about it.
	expect(await storedMix(segmentId)).toEqual([
		{ zone: 3, sessionsPerWeek: 1 },
		{ zone: 4, sessionsPerWeek: 2 },
		{ zone: 5, sessionsPerWeek: 1 },
	])
	const after = await loader({ request: request(athlete.cookie), ...ARGS_BASE })
	expect(after.season.trainableWeekdays).toBe(2)
})

test('availability the athlete never set reads as null, so nothing is compared', async () => {
	const athlete = await setupAthlete()
	const { segmentId } = await createPlannedEvent(athlete.userId)
	await action(postMix(athlete.cookie, { segmentId, zone4: '5' }))

	const result = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	})

	// `null` rather than `0`: never-set availability must not read as "cannot train
	// at all" and warn on every mix.
	expect(result.season.trainableWeekdays).toBeNull()
})

// ── Authoring a Week Pattern, and reading it against a week (#410) ────────────

/**
 * A Workout the athlete owns, in the shape a fixed day is priced off: one block
 * repeated `repeatCount` times, one step carrying either a distance or a duration.
 * `distanceM: null` with no duration is the honestly unreadable case — a
 * prescription a km track cannot price.
 */
async function createWorkout(
	ownerId: string,
	overrides: {
		title?: string
		distanceM?: number | null
		durationSec?: number | null
		repeatCount?: number
	} = {},
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId,
			title: overrides.title ?? '5×1000m Z4',
			discipline: 'run',
			intent: 'threshold',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: overrides.repeatCount ?? 5,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									distanceM:
										overrides.distanceM === undefined
											? 1000
											: overrides.distanceM,
									durationSec: overrides.durationSec ?? null,
								},
							],
						},
					},
				],
			},
		},
	})
	return workout.id
}

/** One Outline's patterns in authored order, with their days. */
async function patternsOf(outlineId: string) {
	return prisma.weekPattern.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: {
			id: true,
			name: true,
			orderIndex: true,
			days: {
				orderBy: [{ weekday: 'asc' }, { orderInDay: 'asc' }],
				select: {
					id: true,
					weekday: true,
					orderInDay: true,
					kind: true,
					weight: true,
					workoutId: true,
				},
			},
		},
	})
}

/** Add a pattern through the route, and hand back its row. */
async function addPattern(
	cookie: string,
	outlineId: string,
	name = 'Base week',
) {
	await submit(cookie, { intent: 'add-week-pattern', outlineId, name })
	return prisma.weekPattern.findFirstOrThrow({
		where: { outlineId, name },
		select: { id: true },
	})
}

test('a pattern is added to the plan, named and positioned', async () => {
	const athlete = await setupAthlete()
	const { outlineId } = await createPlannedEvent(athlete.userId)

	const result = await submit(athlete.cookie, {
		intent: 'add-week-pattern',
		outlineId,
		name: 'Base week',
	})

	expect(result).toEqual({ ok: true })
	// Appended, and opening with no days: a pattern with a default week in it would
	// be a shape nobody authored.
	expect(await patternsOf(outlineId)).toMatchObject([
		{ name: 'Base week', orderIndex: 0, days: [] },
	])
})

test('a pattern is renamed from its own row', async () => {
	const athlete = await setupAthlete()
	const { outlineId } = await createPlannedEvent(athlete.userId)
	const pattern = await addPattern(athlete.cookie, outlineId)

	const result = await submit(athlete.cookie, {
		intent: 'rename-week-pattern',
		patternId: pattern.id,
		name: 'Race week',
	})

	expect(result).toEqual({ ok: true })
	expect((await patternsOf(outlineId))[0]).toMatchObject({ name: 'Race week' })
})

test('a pattern moves through the order, and the ends refuse', async () => {
	const athlete = await setupAthlete()
	const { outlineId } = await createPlannedEvent(athlete.userId)
	await addPattern(athlete.cookie, outlineId, 'Base week')
	const second = await addPattern(athlete.cookie, outlineId, 'Race week')

	const moved = await submit(athlete.cookie, {
		intent: 'move-week-pattern',
		patternId: second.id,
		direction: 'earlier',
	})
	const atTheEdge = await submit(athlete.cookie, {
		intent: 'move-week-pattern',
		patternId: second.id,
		direction: 'earlier',
	})

	expect(moved).toEqual({ ok: true })
	expect((await patternsOf(outlineId)).map((entry) => entry.name)).toEqual([
		'Race week',
		'Base week',
	])
	// One message for either end and either direction, since naming "start" would be
	// the wrong word half the time.
	expect(refusal(atTheEdge)).toEqual({
		error: 'That is already at that end of its order.',
		status: 400,
	})
})

test('a fixed day stores its Workout and no weight at all', async () => {
	const athlete = await setupAthlete()
	const { outlineId, trackId } = await createPlannedEvent(athlete.userId)
	const pattern = await addPattern(athlete.cookie, outlineId)
	const workoutId = await createWorkout(athlete.userId)

	const result = await submit(athlete.cookie, {
		intent: 'add-week-pattern-day',
		patternId: pattern.id,
		trackId,
		weekday: '2',
		kind: 'fixed',
		workoutId,
	})

	expect(result).toEqual({ ok: true })
	// Wednesday, Monday-first. Prescribed, so there is no share of the week to take
	// and no weight to store.
	expect((await patternsOf(outlineId))[0]!.days).toMatchObject([
		{ weekday: 2, orderInDay: 0, kind: 'fixed', weight: null, workoutId },
	])
})

test('a share day stores its relative weight, and appends within its weekday', async () => {
	const athlete = await setupAthlete()
	const { outlineId, trackId } = await createPlannedEvent(athlete.userId)
	const pattern = await addPattern(athlete.cookie, outlineId)

	await submit(athlete.cookie, {
		intent: 'add-week-pattern-day',
		patternId: pattern.id,
		trackId,
		weekday: '5',
		kind: 'share',
		weight: '2.5',
	})
	// A second Saturday session — two sessions on one weekday, orderable.
	const second = await submit(athlete.cookie, {
		intent: 'add-week-pattern-day',
		patternId: pattern.id,
		trackId,
		weekday: '5',
		kind: 'share',
		weight: '1',
		// Blank is a real choice — volume with no shape — rather than a missing field.
		workoutId: '',
	})

	expect(second).toEqual({ ok: true })
	expect((await patternsOf(outlineId))[0]!.days).toMatchObject([
		{ weekday: 5, orderInDay: 0, kind: 'share', weight: 2.5, workoutId: null },
		{ weekday: 5, orderInDay: 1, kind: 'share', weight: 1, workoutId: null },
	])
})

test('two sessions on one weekday are reordered, and the day’s ends refuse', async () => {
	const athlete = await setupAthlete()
	const { outlineId, trackId } = await createPlannedEvent(athlete.userId)
	const pattern = await addPattern(athlete.cookie, outlineId)
	for (const weight of ['1', '2']) {
		await submit(athlete.cookie, {
			intent: 'add-week-pattern-day',
			patternId: pattern.id,
			trackId,
			weekday: '1',
			kind: 'share',
			weight,
		})
	}
	const [first] = (await patternsOf(outlineId))[0]!.days

	const moved = await submit(athlete.cookie, {
		intent: 'move-week-pattern-day',
		dayId: first!.id,
		direction: 'later',
	})
	const atTheEdge = await submit(athlete.cookie, {
		intent: 'move-week-pattern-day',
		dayId: first!.id,
		direction: 'later',
	})

	expect(moved).toEqual({ ok: true })
	expect(
		(await patternsOf(outlineId))[0]!.days.map((day) => day.weight),
	).toEqual([2, 1])
	expect(refusal(atTheEdge).error).toBe(
		'That is already at that end of its order.',
	)
})

test('a day is removed, and its weekday’s survivors close the gap', async () => {
	const athlete = await setupAthlete()
	const { outlineId, trackId } = await createPlannedEvent(athlete.userId)
	const pattern = await addPattern(athlete.cookie, outlineId)
	for (const weight of ['1', '2']) {
		await submit(athlete.cookie, {
			intent: 'add-week-pattern-day',
			patternId: pattern.id,
			trackId,
			weekday: '1',
			kind: 'share',
			weight,
		})
	}
	const [first] = (await patternsOf(outlineId))[0]!.days

	const result = await submit(athlete.cookie, {
		intent: 'remove-week-pattern-day',
		dayId: first!.id,
	})

	expect(result).toEqual({ ok: true })
	expect((await patternsOf(outlineId))[0]!.days).toMatchObject([
		{ orderInDay: 0, weight: 2 },
	])
})

test('deleting a pattern takes its days and leaves the plan alone', async () => {
	const athlete = await setupAthlete()
	const { outlineId, trackId, eventId } = await createPlannedEvent(
		athlete.userId,
	)
	const pattern = await addPattern(athlete.cookie, outlineId)
	await submit(athlete.cookie, {
		intent: 'add-week-pattern-day',
		patternId: pattern.id,
		trackId,
		weekday: '1',
		kind: 'share',
		weight: '1',
	})

	const result = await submit(athlete.cookie, {
		intent: 'remove-week-pattern',
		patternId: pattern.id,
	})

	expect(result).toEqual({ ok: true })
	expect(await patternsOf(outlineId)).toEqual([])
	// The days went with it — scoped to this plan's own track, so the count says
	// something about this season rather than about the database.
	expect(await prisma.weekPatternDay.count({ where: { trackId } })).toBe(0)
	// The season itself is untouched: a pattern is a shape over the plan, not part
	// of its structure.
	expect(await phasesOf(eventId)).toHaveLength(1)
})

test('a stale pattern is worded, not thrown', async () => {
	const athlete = await setupAthlete()
	const { outlineId } = await createPlannedEvent(athlete.userId)
	const pattern = await addPattern(athlete.cookie, outlineId)
	await submit(athlete.cookie, {
		intent: 'remove-week-pattern',
		patternId: pattern.id,
	})

	const renamed = await submit(athlete.cookie, {
		intent: 'rename-week-pattern',
		patternId: pattern.id,
		name: 'Race week',
	})

	// The state the athlete can act on, as a sentence — a page rendered before a
	// sibling tab deleted the row is an ordinary thing to happen.
	expect(refusal(renamed)).toEqual({
		error: 'That week pattern is no longer part of this plan.',
		status: 400,
	})
})

test('a fixed day with no workout named is refused rather than stored as a share', async () => {
	const athlete = await setupAthlete()
	const { outlineId, trackId } = await createPlannedEvent(athlete.userId)
	const pattern = await addPattern(athlete.cookie, outlineId)

	const response = await submit(athlete.cookie, {
		intent: 'add-week-pattern-day',
		patternId: pattern.id,
		trackId,
		weekday: '2',
		kind: 'fixed',
	})

	expect(refusal(response)).toEqual({
		error: 'A fixed day prescribes a workout, so choose the session it stamps.',
		status: 400,
	})
	expect((await patternsOf(outlineId))[0]!.days).toEqual([])
})

test('another athlete’s workout cannot be prescribed on a day', async () => {
	const owner = await setupAthlete()
	const stranger = await setupAthlete()
	const { outlineId, trackId } = await createPlannedEvent(owner.userId)
	const pattern = await addPattern(owner.cookie, outlineId)
	const theirs = await createWorkout(stranger.userId)

	const response = await submit(owner.cookie, {
		intent: 'add-week-pattern-day',
		patternId: pattern.id,
		trackId,
		weekday: '2',
		kind: 'fixed',
		workoutId: theirs,
	})

	// A row that is not the caller's reads as absent rather than as forbidden.
	expect(refusal(response).error).toMatch(/no longer one of yours/)
	expect((await patternsOf(outlineId))[0]!.days).toEqual([])
})

test('another athlete cannot author a pattern on this plan', async () => {
	const owner = await setupAthlete()
	const intruder = await setupAthlete()
	const { outlineId } = await createPlannedEvent(owner.userId)

	const response = await submit(intruder.cookie, {
		intent: 'add-week-pattern',
		outlineId,
		name: 'Mine now',
	})

	expect(refusal(response)).toEqual({
		error: 'That plan is not available to edit.',
		status: 400,
	})
	expect(await patternsOf(outlineId)).toEqual([])
})

test('the loader exposes each pattern day, with fixed days already priced', async () => {
	const athlete = await setupAthlete()
	const { outlineId, trackId } = await createPlannedEvent(athlete.userId)
	const pattern = await addPattern(athlete.cookie, outlineId)
	const workoutId = await createWorkout(athlete.userId)
	await submit(athlete.cookie, {
		intent: 'add-week-pattern-day',
		patternId: pattern.id,
		trackId,
		weekday: '2',
		kind: 'fixed',
		workoutId,
	})
	await submit(athlete.cookie, {
		intent: 'add-week-pattern-day',
		patternId: pattern.id,
		trackId,
		weekday: '5',
		kind: 'share',
		weight: '2.5',
	})

	const result = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	})

	const [reading] = result.season.patterns
	expect(reading).toMatchObject({ name: 'Base week', orderIndex: 0 })
	// 5×1000m read in the track's own currency — off the prescription, never off the
	// week, so it is the same figure in every week of the plan.
	expect(reading!.days).toMatchObject([
		{
			weekday: 2,
			orderInDay: 0,
			kind: 'fixed',
			trackId,
			volume: 5,
			workout: { title: '5×1000m Z4' },
		},
		{ weekday: 5, orderInDay: 0, kind: 'share', trackId, weight: 2.5 },
	])
	// The track a day joins on is exposed beside the week's own derived target, so
	// the preview can pair them.
	expect(result.season.weeks[0]!.targets[0]).toMatchObject({
		trackId,
		value: 50,
	})
})

test('a prescription the track’s currency cannot read is priced as Unavailable', async () => {
	const athlete = await setupAthlete()
	const { outlineId, trackId } = await createPlannedEvent(athlete.userId)
	const pattern = await addPattern(athlete.cookie, outlineId)
	// A 45-minute run on a km-authored track: honest to the minute, unreadable in
	// kilometres, and never guessed at.
	const workoutId = await createWorkout(athlete.userId, {
		title: 'Easy 45 min',
		distanceM: null,
		durationSec: 2700,
		repeatCount: 1,
	})
	await submit(athlete.cookie, {
		intent: 'add-week-pattern-day',
		patternId: pattern.id,
		trackId,
		weekday: '2',
		kind: 'fixed',
		workoutId,
	})

	const result = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	})

	expect(result.season.patterns[0]!.days[0]).toMatchObject({
		kind: 'fixed',
		volume: null,
	})
})

test('the week the pattern is read against is a search param, defaulting to the first', async () => {
	const athlete = await setupAthlete()
	const { monday } = await createPlannedEvent(athlete.userId)
	const secondWeek = mondayOf(new Date(Date.now() + 7 * DAY_MS))

	const absent = await loader({
		request: request(athlete.cookie),
		...ARGS_BASE,
	})
	const asked = await loader({
		request: request(athlete.cookie, `?tab=weeks&week=${secondWeek}`),
		...ARGS_BASE,
	})
	const stale = await loader({
		request: request(athlete.cookie, '?week=2020-01-06'),
		...ARGS_BASE,
	})

	expect(absent.week).toBe(monday)
	expect(asked.week).toBe(secondWeek)
	// A week that is not this plan's has no derived target to read, so the reading
	// falls back to the plan's first week rather than to nothing.
	expect(stale.week).toBe(monday)
})
