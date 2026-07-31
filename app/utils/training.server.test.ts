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
		/**
		 * The **Quality Session Mix** on this phase's endurance segment, as stored:
		 * one row per zone (ADR 0042 §3). Omitted means no rows, which is an *empty*
		 * mix rather than an unknown one (§6).
		 */
		mix?: Array<{ zone: number; sessionsPerWeek: number }>
	}>
	track?: {
		discipline: string
		currency: string
		anchorValue: number
		ramp?: number | null
	} | null
	/**
	 * A second, **strength** Training Track with its own dated segments (ADR 0047
	 * §1, §6). Separate from `track` because a strength segment carries none of the
	 * phase-bound shape: it is positioned by `startWeekKey` + `weeks`, and the two
	 * things it authors beside the progression are a **Strength Goal** and a
	 * **Strength Frequency**. A week between two segments is a gap — the authored
	 * "no lifting these weeks" — which is why the segments are listed rather than
	 * derived from the phases.
	 */
	strength?: {
		anchorValue: number
		segments: Array<{
			startWeekKey: string
			weeks: number
			goal?: string | null
			sessionsPerWeek?: number | null
		}>
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
			const mix = data.outline.phases?.[phase.orderIndex]?.mix ?? []
			await prisma.trainingTrackSegment.create({
				data: {
					trackId: track.id,
					kind: 'endurance',
					phaseId: phase.id,
					ramp: ramp ?? null,
					mix: { create: mix },
				},
			})
		}
	}

	if (data.outline.strength) {
		const { anchorValue, segments } = data.outline.strength
		await prisma.trainingTrack.create({
			data: {
				outlineId: outline.id,
				discipline: 'strength',
				currency: 'sets',
				anchors: {
					create: [{ fromWeekKey: startWeekKey, value: anchorValue }],
				},
				segments: {
					create: segments.map((segment) => ({
						kind: 'strength',
						startWeekKey: segment.startWeekKey,
						weeks: segment.weeks,
						goal: segment.goal ?? null,
						sessionsPerWeek: segment.sessionsPerWeek ?? null,
					})),
				},
			},
		})
	}
	return event
}

/**
 * A scheduled strength session whose sets are priced in `%1RM` — the already-authored
 * quantity the band warning reads (ADR 0047 §3). One block, one step, one set per
 * figure, which is all the check looks at.
 */
async function createStrengthSessionForUser(
	userId: string,
	scheduledAt: Date,
	...pct1RMs: number[]
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Squat',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									kind: 'strength',
									orderIndex: 0,
									sets: {
										create: pct1RMs.map((pct1RM, orderIndex) => ({
											orderIndex,
											kind: 'reps',
											reps: 5,
											pct1RM,
										})),
									},
								},
							],
						},
					},
				],
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status: 'scheduled',
		},
	})
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
		{
			id: expect.any(String),
			name: 'Base',
			weeks: 4,
			rhythm: '3:1',
			tapers: false,
		},
		{
			id: expect.any(String),
			name: 'Build',
			weeks: 4,
			rhythm: '3:1',
			tapers: false,
		},
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
			// Each phase carries its row id: a per-phase edit addresses identity, while
			// position orders the season (#402).
			id: expect.any(String),
			name: 'Base',
			weeks: 4,
			rhythm: '3:1',
			tapers: false,
			fromWeekInPlan: 1,
			toWeekInPlan: 4,
			fromWeekKey: '2030-01-07',
		},
		{
			id: expect.any(String),
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
			// The stored row's id, which is what a **Week Pattern** day's `trackId`
			// joins to — a day references its track by key rather than by Discipline.
			trackId: expect.any(String),
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
					// And no quality sessions: an empty mix is what this segment says,
					// not what it is missing (ADR 0042 §6).
					mix: [],
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

test('getActiveSeason returns each endurance segment’s mix, ascending by zone', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [
				// Stored in the order they were authored; read back by zone.
				{
					name: 'Build',
					weeks: 4,
					mix: [
						{ zone: 5, sessionsPerWeek: 1 },
						{ zone: 3, sessionsPerWeek: 2 },
					],
				},
				{ name: 'Taper', weeks: 2 },
			],
			track: { discipline: 'run', currency: 'km', anchorValue: 50, ramp: null },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	expect(season?.tracks[0]?.segments.map((segment) => segment.mix)).toEqual([
		// Ascending by zone, so the emphasis label's terms read in one order whatever
		// order the athlete typed them in (ADR 0042 §5).
		[
			{ zone: 3, sessionsPerWeek: 2 },
			{ zone: 5, sessionsPerWeek: 1 },
		],
		// A segment with no rows has an *empty* mix — the positive statement that it
		// carries no quality sessions, never "unknown" (ADR 0042 §6).
		[],
	])
})

test('getActiveSeason leaves availability absent when the athlete never set it', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 4 }],
			track: { discipline: 'run', currency: 'km', anchorValue: 50, ramp: null },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// Never set is not zero days: the soft mix warning has nothing to compare
	// against and declines to guess (ADR 0042 §9).
	expect(season?.trainableWeekdays).toBeNull()
})

test('getActiveSeason returns the athlete’s availability as a count of days', async () => {
	const user = await createUserWithPassword()
	await prisma.athleteProfile.create({
		data: { userId: user.id, trainableWeekdays: JSON.stringify([1, 3, 5, 6]) },
	})
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 4 }],
			track: { discipline: 'run', currency: 'km', anchorValue: 50, ramp: null },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// A count and not the weekdays themselves: ADR 0045 makes the check
	// days-against-days, so which days they are decides nothing here.
	expect(season?.trainableWeekdays).toBe(4)
})

test('getActiveSeason counts an explicitly emptied availability as zero days', async () => {
	const user = await createUserWithPassword()
	await prisma.athleteProfile.create({
		data: { userId: user.id, trainableWeekdays: JSON.stringify([]) },
	})
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 4 }],
			track: { discipline: 'run', currency: 'km', anchorValue: 50, ramp: null },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// An athlete who ticked nothing has said something; an athlete who never opened
	// the form has not. `0` and `null` are different answers and stay so.
	expect(season?.trainableWeekdays).toBe(0)
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

test('getActiveSeason prices a week outside every strength segment as zero sets, not Unavailable', async () => {
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

	// A strength track with an anchor and no segments has every week outside every
	// segment, and a week inside the plan but outside them all derives `0` — the
	// authored "no lifting these weeks", a positive statement rather than a hole
	// (ADR 0047 §6). `null` keeps its own meaning: no anchor in force, or a week
	// outside the plan.
	expect(season?.weeks.map((week) => week.targets[0]?.value)).toEqual([0, 0])
	expect(season?.tracks[0]?.currency).toBe('sets')
})

test('getActiveSeason warns where quality sessions plus Strength Frequency outrun the trainable weekdays', async () => {
	const user = await createUserWithPassword()
	await prisma.athleteProfile.create({
		data: { userId: user.id, trainableWeekdays: JSON.stringify([1, 2, 3, 4]) },
	})
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [
				{ name: 'Base', weeks: 4, mix: [{ zone: 4, sessionsPerWeek: 2 }] },
			],
			track: { discipline: 'run', currency: 'km', anchorValue: 50 },
			strength: {
				anchorValue: 18,
				segments: [
					{ startWeekKey: '2030-01-07', weeks: 4, sessionsPerWeek: 3 },
				],
			},
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// Days against days across **both** tracks: 2 quality sessions and 3 lifting
	// sessions against 4 trainable weekdays (ADR 0047 §4). One reading for the run
	// of weeks that ask the same thing, not one per week.
	expect(season?.availabilityWarnings).toEqual([
		{
			fromWeekInPlan: 1,
			toWeekInPlan: 4,
			qualitySessions: 2,
			strengthSessions: 3,
			trainableWeekdays: 4,
		},
	])
})

test('getActiveSeason stays silent about a gap week, which asks for no lifting at all', async () => {
	const user = await createUserWithPassword()
	await prisma.athleteProfile.create({
		data: { userId: user.id, trainableWeekdays: JSON.stringify([1, 2, 3, 4]) },
	})
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [
				{ name: 'Base', weeks: 6, mix: [{ zone: 4, sessionsPerWeek: 2 }] },
			],
			track: { discipline: 'run', currency: 'km', anchorValue: 50 },
			strength: {
				anchorValue: 18,
				segments: [
					{ startWeekKey: '2030-01-07', weeks: 2, sessionsPerWeek: 3 },
					{ startWeekKey: '2030-02-04', weeks: 2, sessionsPerWeek: 3 },
				],
			},
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// Weeks 3–4 sit between the two segments, so they ask for 2 sessions against 4
	// days and break the run — the gap is the athlete's own "no lifting" statement.
	expect(
		season?.availabilityWarnings.map((warning) => [
			warning.fromWeekInPlan,
			warning.toWeekInPlan,
		]),
	).toEqual([
		[1, 2],
		[5, 6],
	])
})

test('getActiveSeason gives no fit warnings to an athlete who never set their availability', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [
				{ name: 'Base', weeks: 4, mix: [{ zone: 4, sessionsPerWeek: 4 }] },
			],
			track: { discipline: 'run', currency: 'km', anchorValue: 50 },
			strength: {
				anchorValue: 18,
				segments: [
					{ startWeekKey: '2030-01-07', weeks: 4, sessionsPerWeek: 4 },
				],
			},
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	expect(season?.availabilityWarnings).toEqual([])
})

test('getActiveSeason flags a scheduled session whose %1RM falls outside its segment’s band', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 4 }],
			track: { discipline: 'run', currency: 'km', anchorValue: 50 },
			strength: {
				anchorValue: 18,
				segments: [
					{
						startWeekKey: '2030-01-07',
						weeks: 4,
						goal: 'maximal-strength',
						sessionsPerWeek: 3,
					},
				],
			},
		},
	})
	// Week 2 of the plan (the week opening 2030-01-14), at 60% and 85%.
	const session = await createStrengthSessionForUser(
		user.id,
		new Date('2030-01-15T17:00:00Z'),
		60,
		85,
	)

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// ADR 0042 §9's soft warning on ADR 0047 §3's own example, off already-authored
	// data: `ExerciseSet.pct1RM` needed no schema change. 85% is inside the band.
	expect(season?.bandWarnings).toEqual([
		{
			sessionId: session.id,
			scheduledAt: new Date('2030-01-15T17:00:00Z'),
			weekInPlan: 2,
			goal: 'maximal-strength',
			band: { minPct1RM: 80, maxPct1RM: 100 },
			outsidePct1RMs: [60],
		},
	])
})

test('getActiveSeason leaves a session in a gap between strength segments unflagged', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 6 }],
			track: { discipline: 'run', currency: 'km', anchorValue: 50 },
			strength: {
				anchorValue: 18,
				segments: [
					{
						startWeekKey: '2030-01-07',
						weeks: 2,
						goal: 'maximal-strength',
						sessionsPerWeek: 3,
					},
					{
						startWeekKey: '2030-02-04',
						weeks: 2,
						goal: 'maximal-strength',
						sessionsPerWeek: 3,
					},
				],
			},
		},
	})
	// Week 3 of the plan: inside the plan, outside every segment.
	await createStrengthSessionForUser(
		user.id,
		new Date('2030-01-22T17:00:00Z'),
		40,
	)

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// No segment covers the week, so there is no derived band for the session to be
	// outside of — silence, never a warning against a band nobody authored.
	expect(season?.bandWarnings).toEqual([])
})

test('getActiveSeason names the three cross-track readings a strength plan cannot state', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 4 }],
			track: { discipline: 'run', currency: 'km', anchorValue: 50 },
			strength: {
				anchorValue: 18,
				segments: [
					{ startWeekKey: '2030-01-07', weeks: 4, sessionsPerWeek: 3 },
				],
			},
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// Three readings, named separately, because each stays Unavailable for its own
	// reason (ADR 0047 §5) — and the surface has to say which is which rather than
	// render one sentence over a row of dashes.
	expect(season?.unavailableReadings).toEqual([
		'hours-calendar-cost',
		'combined-cross-track-load',
		'strength-ctl',
	])
})

test('getActiveSeason names no Unavailable cross-track reading for a plan with no strength track', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-03-05T09:00:00Z'),
		outline: {
			phases: [{ name: 'Base', weeks: 4 }],
			track: { discipline: 'run', currency: 'km', anchorValue: 50 },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// ADR 0046 §3's correction is about a plan that *has* a strength track; a pure
	// runner is not owed three sentences about readings nothing in their plan blocks.
	expect(season?.unavailableReadings).toEqual([])
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

test('the current phase is decided by position, so a repeated name reads once', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: new Date('2030-07-05T09:00:00Z'),
		outline: {
			// A two-A-race season: "Base" appears twice, which is the case a name
			// comparison lit up twice (ADR 0044 §2).
			phases: [
				{ name: 'Base', weeks: 4 },
				{ name: 'Peak', weeks: 4 },
				{ name: 'Base', weeks: 4 },
			],
			track: { discipline: 'run', currency: 'km', anchorValue: 50, ramp: null },
		},
	})

	const season = await getActiveSeason(user.id, SEASON_NOW)

	// The plan opens 2030-01-07 and SEASON_NOW is that week, so the *first* Base is
	// current — one position, not both phases carrying the name.
	expect(season?.currentPhaseIndex).toBe(0)
	expect(season?.phases.filter((phase) => phase.name === 'Base')).toHaveLength(
		2,
	)
})

test('a season the athlete is not living in yet has no current phase', async () => {
	const user = await createUserWithPassword()
	const later = await createEventForUser(user.id, {
		startDate: new Date('2031-03-05T09:00:00Z'),
		outline: { ...OUTLINE, startWeekKey: '2031-01-06' },
		name: 'Next Spring',
	})

	// Its first week is a year out, so today is outside the plan: null rather than
	// clamping onto the first phase, which would read as "you are in Base now".
	const season = await getSeasonForEvent(user.id, later.id, SEASON_NOW)
	expect(season?.currentPhaseIndex).toBeNull()
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
