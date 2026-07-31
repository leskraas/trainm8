import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import {
	getActivePlan,
	getActiveSeason,
	getDisciplineThresholds,
	getLastSimilarSession,
	getSeasonForEvent,
	getSessionLedger,
	getUpcomingSessions,
} from './training.server.ts'

async function createUserWithPassword() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

async function createWorkoutForUser(userId: string) {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
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
									kind: 'cardio',
									notes: '10 min easy',
									discipline: 'run',
									intensity: 'easy',
									orderIndex: 0,
								},
							],
						},
					},
				],
			},
		},
	})
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

test('returns sessions scheduled in the future', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: inDays(2),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(1)
	expect(sessions[0]?.workout?.id).toBe(workout.id)
})

test('excludes sessions in the past', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: daysAgo(1),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(0)
})

test('excludes sessions belonging to another user', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()
	const workout = await createWorkoutForUser(userA.id)
	await prisma.workoutSession.create({
		data: {
			userId: userA.id,
			workoutId: workout.id,
			scheduledAt: inDays(3),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(userB.id)
	expect(sessions).toHaveLength(0)
})

test('returns sessions ordered soonest-first', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.createMany({
		data: [
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(5),
				status: 'scheduled',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(1),
				status: 'scheduled',
			},
		],
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions[0]!.scheduledAt.getTime()).toBeLessThan(
		sessions[1]!.scheduledAt.getTime(),
	)
})

test('includes sessions at exactly 14 days from now', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: inDays(14),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(1)
})

test('excludes sessions beyond the 14-day horizon', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: inDays(15),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(0)
})

test('includes sessions of all statuses in the upcoming window', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.createMany({
		data: [
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(1),
				status: 'scheduled',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(2),
				status: 'completed',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(3),
				status: 'skipped',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(4),
				status: 'missed',
			},
		],
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(4)
	expect(sessions.map((s) => s.status)).toEqual([
		'scheduled',
		'completed',
		'skipped',
		'missed',
	])
})

test('getSessionLedger returns past and future sessions ordered by date', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.createMany({
		data: [
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(2),
				status: 'scheduled',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: daysAgo(3),
				status: 'completed',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: daysAgo(1),
				status: 'missed',
			},
		],
	})
	const ledger = await getSessionLedger(user.id)
	expect(ledger.map((s) => s.status)).toEqual([
		'completed',
		'missed',
		'scheduled',
	])
})

test('getSessionLedger is bounded by the trailing window and planned horizon', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.createMany({
		data: [
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: daysAgo(60),
				status: 'completed',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: daysAgo(10),
				status: 'completed',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(5),
				status: 'scheduled',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(20),
				status: 'scheduled',
			},
		],
	})
	const ledger = await getSessionLedger(user.id)
	expect(ledger).toHaveLength(2)
})

test('getSessionLedger excludes sessions belonging to another user', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()
	const workout = await createWorkoutForUser(userA.id)
	await prisma.workoutSession.create({
		data: {
			userId: userA.id,
			workoutId: workout.id,
			scheduledAt: daysAgo(2),
			status: 'completed',
		},
	})
	const ledger = await getSessionLedger(userB.id)
	expect(ledger).toHaveLength(0)
})

/**
 * A Plan Outline fixture in its stored, relational shape (ADR 0044). `track` is
 * optional: an Outline may author phases and no volume yet, which is a valid
 * state the read path must handle without guessing.
 */
type OutlineFixture = {
	startWeekKey?: string
	phases?: Array<{
		name: string
		weeks: number
		rhythm?: string
		tapers?: boolean
	}>
	track?: {
		discipline: string
		currency: string
		anchorValue: number
		ramp?: number | null
	} | null
}

async function createEventForUser(
	userId: string,
	data: {
		startDate: Date
		outline?: OutlineFixture | null
		status?: string
		name?: string
	},
) {
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: userId,
			name: data.name ?? faker.lorem.words(2),
			kind: 'race',
			priority: 'A',
			startDate: data.startDate,
			disciplines: '["run"]',
			status: data.status ?? 'planned',
		},
	})
	if (!data.outline) return event

	const startWeekKey = data.outline.startWeekKey ?? '2030-01-07'
	const outline = await prisma.planOutline.create({
		data: {
			eventId: event.id,
			startWeekKey,
			phases: {
				create: (data.outline.phases ?? []).map((phase, orderIndex) => ({
					orderIndex,
					name: phase.name,
					weeks: phase.weeks,
					rhythm: phase.rhythm ?? '3:1',
					tapers: phase.tapers ?? false,
				})),
			},
		},
		select: { id: true, phases: { select: { id: true, orderIndex: true } } },
	})

	if (data.outline.track) {
		const { discipline, currency, anchorValue, ramp } = data.outline.track
		const track = await prisma.trainingTrack.create({
			data: {
				outlineId: outline.id,
				discipline,
				currency,
				anchors: {
					create: [{ fromWeekKey: startWeekKey, value: anchorValue }],
				},
			},
			select: { id: true },
		})
		for (const phase of outline.phases) {
			await prisma.trainingTrackSegment.create({
				data: {
					trackId: track.id,
					kind: 'endurance',
					phaseId: phase.id,
					ramp: ramp ?? null,
				},
			})
		}
	}
	return event
}

const OUTLINE: OutlineFixture = {
	phases: [
		{ name: 'Base', weeks: 4 },
		{ name: 'Build', weeks: 4 },
	],
}

test('getActivePlan returns the upcoming Target Event carrying a Plan Outline', async () => {
	const user = await createUserWithPassword()
	const event = await createEventForUser(user.id, {
		startDate: inDays(30),
		outline: OUTLINE,
		name: 'Spring Half',
	})
	const plan = await getActivePlan(user.id)
	expect(plan?.eventId).toBe(event.id)
	expect(plan?.eventName).toBe('Spring Half')
	// The arc's phases carry everything a phase stores — name, span, rhythm, taper
	// — and no dates: those are derived from the Plan Start Week (ADR 0044 §3).
	expect(plan?.phases).toEqual([
		{ name: 'Base', weeks: 4, rhythm: '3:1', tapers: false },
		{ name: 'Build', weeks: 4, rhythm: '3:1', tapers: false },
	])
	// The plan's authored first Training Week, not a count back from the Event.
	expect(plan?.planStart).toEqual(new Date('2030-01-07T00:00:00.000Z'))
	// An Outline that authors no Training Track yet projects nothing at all.
	expect(plan?.weeklyTss).toEqual([])
})

test('getActivePlan derives per-week TSS from an hours-authored Training Track', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: inDays(30),
		outline: {
			...OUTLINE,
			track: {
				discipline: 'run',
				currency: 'hours',
				anchorValue: 6,
				ramp: null,
			},
		},
	})
	const plan = await getActivePlan(user.id)
	// 6 h/week × 60 TSS/h = 360, and the 3:1 rhythm cuts every fourth week by the
	// documented 30% → 4.2 h → 252 TSS. Nothing stores these numbers (ADR 0040);
	// they are floats straight off the derivation, so compare them as such.
	expect(plan?.weeklyTss.map((tss) => Math.round(tss!))).toEqual([
		360, 360, 360, 252, 360, 360, 360, 252,
	])
})

test('getActivePlan leaves a km-authored track Unavailable rather than converting it', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: inDays(30),
		outline: {
			...OUTLINE,
			track: { discipline: 'run', currency: 'km', anchorValue: 55, ramp: 0.05 },
		},
	})
	const plan = await getActivePlan(user.id)
	// km→TSS needs the mix-aware conversion (#385); until then every week is null.
	expect(plan?.weeklyTss).toEqual(Array<null>(8).fill(null))
})

test('getActivePlan projects nothing from a strength-only plan, and still returns the arc', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: inDays(30),
		outline: {
			...OUTLINE,
			track: {
				discipline: 'strength',
				currency: 'sets',
				anchorValue: 12,
				ramp: null,
			},
		},
	})
	const plan = await getActivePlan(user.id)
	// A pure lifter authors a real plan; the load-derived surfaces stay honest
	// rather than fabricating endurance load (ADR 0041 §6, §7).
	expect(plan?.phases).toHaveLength(2)
	expect(plan?.weeklyTss).toEqual([])
})

test('getActivePlan is null when an upcoming Event has no Plan Outline (marker, not plan)', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: inDays(30),
		outline: null,
	})
	expect(await getActivePlan(user.id)).toBeNull()
})

test('getActivePlan is null when the only outlined Target Event is in the past', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: daysAgo(10),
		outline: OUTLINE,
	})
	expect(await getActivePlan(user.id)).toBeNull()
})

test('getActivePlan is null for another user’s outlined Target Event', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()
	await createEventForUser(userA.id, {
		startDate: inDays(30),
		outline: OUTLINE,
	})
	expect(await getActivePlan(userB.id)).toBeNull()
})

test('getActivePlan picks the nearest outlined Target Event, skipping outline-less markers', async () => {
	const user = await createUserWithPassword()
	// A nearer Event without an Outline is a marker, not a plan — it must not win.
	await createEventForUser(user.id, {
		startDate: inDays(7),
		outline: null,
		name: 'Parkrun (marker)',
	})
	const nearestPlan = await createEventForUser(user.id, {
		startDate: inDays(40),
		outline: OUTLINE,
		name: 'Goal Race',
	})
	await createEventForUser(user.id, {
		startDate: inDays(90),
		outline: OUTLINE,
		name: 'Later Race',
	})
	const plan = await getActivePlan(user.id)
	expect(plan?.eventId).toBe(nearestPlan.id)
	expect(plan?.eventName).toBe('Goal Race')
})

test('getActivePlan is null when the outlined Target Event is cancelled', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: inDays(30),
		outline: OUTLINE,
		status: 'cancelled',
	})
	expect(await getActivePlan(user.id)).toBeNull()
})

// ── getActiveSeason: the planning surface's reading of the same rows ──────────

const SEASON_NOW = new Date('2030-01-09T12:00:00Z')

test('getActiveSeason lays the phases forward from the authored Plan Start Week', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [
				{ name: 'Base', weeks: 4 },
				{ name: 'Build', weeks: 4, rhythm: '2:1' },
			],
			track: { discipline: 'run', currency: 'km', anchorValue: 50, ramp: null },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	expect(season?.startWeekKey).toBe('2030-01-07')
	expect(season?.phases).toEqual([
		{
			name: 'Base',
			weeks: 4,
			rhythm: '3:1',
			tapers: false,
			fromWeekInPlan: 1,
			toWeekInPlan: 4,
			fromWeekKey: '2030-01-07',
		},
		{
			name: 'Build',
			weeks: 4,
			rhythm: '2:1',
			tapers: false,
			fromWeekInPlan: 5,
			toWeekInPlan: 8,
			fromWeekKey: '2030-02-04',
		},
	])
})

test('getActiveSeason derives every week’s target in the track’s own currency', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 4 }],
			track: { discipline: 'run', currency: 'km', anchorValue: 50, ramp: 0.1 },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	expect(season?.weeks).toHaveLength(4)
	// 3:1 makes the fourth week recovery, cut by the documented −30% off the last
	// loading week — the existing derivation, untouched.
	expect(season?.weeks.map((week) => week.role)).toEqual([
		'loading',
		'loading',
		'loading',
		'recovery',
	])
	expect(season?.weeks.map((week) => week.weekKey)).toEqual([
		'2030-01-07',
		'2030-01-14',
		'2030-01-21',
		'2030-01-28',
	])
	expect(
		season?.weeks.map((week) => week.targets[0]?.value?.toFixed(1)),
	).toEqual(['50.0', '55.0', '60.5', '42.4'])
	expect(season?.weeks[0]?.targets[0]).toMatchObject({
		discipline: 'run',
		currency: 'km',
	})
})

test('getActiveSeason carries the track’s currency and its Season Anchor segments', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 4 }],
			track: { discipline: 'run', currency: 'km', anchorValue: 50, ramp: null },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	expect(season?.tracks).toEqual([
		{
			discipline: 'run',
			currency: 'km',
			anchors: [{ fromWeekKey: '2030-01-07', value: 50 }],
			// The authored progression rides beside the anchor: one segment per phase,
			// every rate unset because this track authors no ramp (ADR 0042 §8).
			segments: [
				{
					segmentId: expect.any(String),
					phaseIndex: 0,
					ramp: null,
					boundaryStep: null,
					recoveryCut: null,
					taperCut: null,
				},
			],
			// A flat season spans from its anchor to itself, and the total is the
			// secondary figure behind it (ADR 0043): four weeks, one of them a −30%
			// recovery week by the convention.
			span: { anchor: 50, peak: 50, peakWeekIndex: 0 },
			total: 185,
			warnings: [],
		},
	])
})

test('getActiveSeason says where the season ends against the Event, without stretching', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		// Race week is 2030-03-04; the plan's 8 weeks end the week of 2030-02-25.
		startDate: new Date('2030-03-07T09:00:00Z'),
		outline: {
			phases: [
				{ name: 'Base', weeks: 4 },
				{ name: 'Build', weeks: 4 },
			],
			track: { discipline: 'run', currency: 'km', anchorValue: 50, ramp: null },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	expect(season?.fit).toEqual({ kind: 'ends-before', weeks: 1 })
})

test('getActiveSeason leaves a strength week Unavailable rather than pricing it by the endurance rule', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 2 }],
			track: {
				discipline: 'strength',
				currency: 'sets',
				anchorValue: 18,
				ramp: null,
			},
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// The strength progression rule lands with its own ticket; until then a sets
	// week is an honest Unavailable Metric, never an endurance number in disguise.
	expect(season?.weeks.map((week) => week.targets[0]?.value)).toEqual([
		null,
		null,
	])
	expect(season?.tracks[0]?.currency).toBe('sets')
})

test('getSeasonForEvent reads the Event asked for, not the nearest one', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: OUTLINE,
		name: 'Nearest Race',
	})
	const later = await createEventForUser(user.id, {
		startDate: new Date('2031-09-05T09:00:00Z'),
		outline: { ...OUTLINE, startWeekKey: '2031-01-06' },
		name: 'Next Season',
	})

	// The active season is the nearest (ADR 0018); a named Event is itself.
	expect((await getActiveSeason(user.id, SEASON_NOW))?.eventName).toBe(
		'Nearest Race',
	)
	const named = await getSeasonForEvent(user.id, later.id)
	expect(named?.eventName).toBe('Next Season')
	expect(named?.startWeekKey).toBe('2031-01-06')
})

test('getSeasonForEvent is null for another athlete’s Event, and for a plan-less one', async () => {
	const owner = await createUserWithPassword()
	const other = await createUserWithPassword()
	const planned = await createEventForUser(owner.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: OUTLINE,
	})
	const marker = await createEventForUser(owner.id, {
		startDate: new Date('2030-04-05T09:00:00Z'),
	})

	expect(await getSeasonForEvent(other.id, planned.id)).toBeNull()
	expect(await getSeasonForEvent(owner.id, marker.id)).toBeNull()
})

test('getSeasonForEvent still reads a season whose Event has passed', async () => {
	const user = await createUserWithPassword()
	const past = await createEventForUser(user.id, {
		startDate: new Date('2029-03-05T09:00:00Z'),
		outline: OUTLINE,
		name: 'Last Spring',
	})

	// It is the athlete's own authored season; reading it back is not a claim that
	// it is active. `getActiveSeason` is the one that answers "am I living in it".
	expect((await getSeasonForEvent(user.id, past.id))?.eventName).toBe(
		'Last Spring',
	)
	expect(await getActiveSeason(user.id, SEASON_NOW)).toBeNull()
})

test('getActiveSeason is null for another athlete’s outlined Event', async () => {
	const owner = await createUserWithPassword()
	const other = await createUserWithPassword()
	await createEventForUser(owner.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: OUTLINE,
	})

	expect(await getActiveSeason(other.id, SEASON_NOW)).toBeNull()
})

test('getSessionLedger carries load and RPE for completed sessions', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const completed = await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: daysAgo(1),
			status: 'completed',
			tssValue: 72,
		},
		select: { id: true },
	})
	await prisma.sessionLog.create({
		data: { sessionId: completed.id, content: 'solid', rpe: 8 },
	})
	const ledger = await getSessionLedger(user.id)
	expect(ledger).toHaveLength(1)
	expect(ledger[0]?.tssValue).toBe(72)
	expect(ledger[0]?.sessionLog?.rpe).toBe(8)
})

// --- getLastSimilarSession ---------------------------------------------------

const RUN_ENDURANCE = { discipline: 'run', intent: 'endurance' }

async function createSimilarTestSession(
	userId: string,
	{
		discipline = 'run',
		intent = 'endurance',
		scheduledAt,
		status = 'completed',
		tssValue,
	}: {
		discipline?: string
		intent?: string
		scheduledAt: Date
		status?: string
		tssValue?: number
	},
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
			discipline,
			intent,
			ownerId: userId,
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status,
			tssValue: tssValue ?? null,
		},
	})
}

test('getLastSimilarSession returns the most recent prior session matching discipline + intent', async () => {
	const user = await createUserWithPassword()
	await createSimilarTestSession(user.id, {
		...RUN_ENDURANCE,
		scheduledAt: daysAgo(20),
		tssValue: 50,
	})
	const recent = await createSimilarTestSession(user.id, {
		...RUN_ENDURANCE,
		scheduledAt: daysAgo(5),
		tssValue: 70,
	})
	const found = await getLastSimilarSession(user.id, RUN_ENDURANCE, daysAgo(1))
	expect(found?.id).toBe(recent.id)
	expect(found?.tssValue).toBe(70)
})

test('getLastSimilarSession ignores sessions at or after the cutoff (no future, no self)', async () => {
	const user = await createUserWithPassword()
	// More recent than the cutoff — the current/future side, never compared.
	await createSimilarTestSession(user.id, {
		...RUN_ENDURANCE,
		scheduledAt: daysAgo(1),
	})
	const prior = await createSimilarTestSession(user.id, {
		...RUN_ENDURANCE,
		scheduledAt: daysAgo(10),
	})
	const found = await getLastSimilarSession(user.id, RUN_ENDURANCE, daysAgo(5))
	expect(found?.id).toBe(prior.id)
})

test('getLastSimilarSession ignores a more recent session of a different discipline', async () => {
	const user = await createUserWithPassword()
	const runPrior = await createSimilarTestSession(user.id, {
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: daysAgo(10),
	})
	await createSimilarTestSession(user.id, {
		discipline: 'bike',
		intent: 'endurance',
		scheduledAt: daysAgo(2),
	})
	const found = await getLastSimilarSession(user.id, RUN_ENDURANCE, daysAgo(1))
	expect(found?.id).toBe(runPrior.id)
})

test('getLastSimilarSession ignores a more recent session of a different intent', async () => {
	const user = await createUserWithPassword()
	const endurancePrior = await createSimilarTestSession(user.id, {
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: daysAgo(10),
	})
	await createSimilarTestSession(user.id, {
		discipline: 'run',
		intent: 'threshold',
		scheduledAt: daysAgo(2),
	})
	const found = await getLastSimilarSession(user.id, RUN_ENDURANCE, daysAgo(1))
	expect(found?.id).toBe(endurancePrior.id)
})

test('getLastSimilarSession only counts completed sessions (the athlete must have done it)', async () => {
	const user = await createUserWithPassword()
	await createSimilarTestSession(user.id, {
		...RUN_ENDURANCE,
		scheduledAt: daysAgo(3),
		status: 'missed',
	})
	await createSimilarTestSession(user.id, {
		...RUN_ENDURANCE,
		scheduledAt: daysAgo(4),
		status: 'scheduled',
	})
	await createSimilarTestSession(user.id, {
		...RUN_ENDURANCE,
		scheduledAt: daysAgo(6),
		status: 'skipped',
	})
	const completed = await createSimilarTestSession(user.id, {
		...RUN_ENDURANCE,
		scheduledAt: daysAgo(12),
		status: 'completed',
	})
	const found = await getLastSimilarSession(user.id, RUN_ENDURANCE, daysAgo(1))
	expect(found?.id).toBe(completed.id)
})

test('getLastSimilarSession is null when there is no prior similar session', async () => {
	const user = await createUserWithPassword()
	await createSimilarTestSession(user.id, {
		discipline: 'bike',
		intent: 'endurance',
		scheduledAt: daysAgo(10),
	})
	expect(
		await getLastSimilarSession(user.id, RUN_ENDURANCE, daysAgo(1)),
	).toBeNull()
})

test('getLastSimilarSession ignores another user’s matching session', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()
	await createSimilarTestSession(userA.id, {
		...RUN_ENDURANCE,
		scheduledAt: daysAgo(5),
	})
	expect(
		await getLastSimilarSession(userB.id, RUN_ENDURANCE, daysAgo(1)),
	).toBeNull()
})

test('getLastSimilarSession ignores recording-only sessions (no Workout, so no intent to match)', async () => {
	const user = await createUserWithPassword()
	await prisma.workoutSession.create({
		data: { userId: user.id, scheduledAt: daysAgo(3), status: 'completed' },
	})
	expect(
		await getLastSimilarSession(user.id, RUN_ENDURANCE, daysAgo(1)),
	).toBeNull()
})

test('getLastSimilarSession carries the prior session’s recorded duration', async () => {
	const user = await createUserWithPassword()
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Tempo',
			discipline: 'run',
			intent: 'tempo',
			ownerId: user.id,
		},
	})
	const recording = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			externalProvider: 'manual',
			externalId: faker.string.uuid(),
			startedAt: daysAgo(8),
			endedAt: daysAgo(8),
			durationSec: 2700,
			discipline: 'run',
			rawJson: '{}',
		},
	})
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: daysAgo(8),
			status: 'completed',
			recordingId: recording.id,
		},
	})
	const found = await getLastSimilarSession(
		user.id,
		{ discipline: 'run', intent: 'tempo' },
		daysAgo(1),
	)
	expect(found?.recording?.durationSec).toBe(2700)
})

test('getDisciplineThresholds keys each discipline profile by discipline', async () => {
	const user = await createUserWithPassword()
	await prisma.athleteProfile.create({
		data: {
			userId: user.id,
			timezone: 'UTC',
			disciplineProfiles: {
				create: [
					{
						discipline: 'run',
						lthr: 168,
						maxHr: 190,
						thresholdPaceSecPerKm: 240,
					},
					{ discipline: 'bike', ftp: 250 },
				],
			},
		},
	})

	const thresholds = await getDisciplineThresholds(user.id)
	expect(thresholds.run).toMatchObject({
		lthr: 168,
		maxHr: 190,
		thresholdPaceSecPerKm: 240,
		ftp: null,
	})
	expect(thresholds.bike).toMatchObject({ ftp: 250 })
	expect(thresholds.swim).toBeUndefined()
})

test('getDisciplineThresholds is empty for an athlete with no profile', async () => {
	const user = await createUserWithPassword()
	expect(await getDisciplineThresholds(user.id)).toEqual({})
})
