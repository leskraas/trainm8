import { expect, test } from 'vitest'
import { deleteAccount } from '#app/utils/account-deletion.server.ts'
import {
	listOwnPublishableWorkouts,
	publishWorkout,
	readPublishTarget,
} from '#app/utils/community.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { deleteEvent } from '#app/utils/event.server.ts'
import {
	getAuthoredWorkouts,
	getSeasonForOutline,
} from '#app/utils/training.server.ts'
import { type WorkoutAuthoringInput } from '#app/utils/workout-schema.ts'
import {
	createWorkoutSession,
	deleteWorkoutSession,
	updateWorkoutSession,
	workoutCopySelect,
} from '#app/utils/workout.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createOpenEndedPlan,
	createPlanOutline,
	deletePlanOutline,
	removeTrack,
	removeWeekPattern,
	removeWeekPatternDay,
} from './authoring.server.ts'
import { heldWorkouts } from './held-workouts.server.ts'
import { stampWeekPattern } from './stamp.server.ts'
import { addProposedStrengthTrack } from './strength-offer.server.ts'

// A Week Pattern day holds the plan's own copy of what it picked, a **Held
// Workout** (#665, ADR 0112): the athlete's sessions and their plan are never
// tied together, so a session the pattern picked can be edited or deleted and
// the pattern, and every week it lays, stays as it was.

const OSLO = 'Europe/Oslo'
const NOW = new Date('2030-01-09T12:00:00Z') // a Wednesday
const WEEK_1 = '2030-01-14'
const WEEK_2 = '2030-01-21'
const WED = 2
const SAT = 5

async function athlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: { timezone: OSLO, defaultTrainingTime: '07:00' },
			},
		},
	})
	return user.id
}

/** A race plan with a run and a strength track and one empty Week Pattern. */
async function racePlan(userId: string) {
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: userId,
			name: 'Vårhalvmaraton',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-04-07T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	const created = await createPlanOutline(
		userId,
		{
			eventId: event.id,
			startWeekKey: '2030-01-07',
			structure: { phases: [{ name: 'Base', weeks: 6, rhythm: 'none' }] },
			tracks: [
				{ discipline: 'run', currency: 'km', anchorValue: 50 },
				{ discipline: 'strength', currency: 'sets', anchorValue: 12 },
			],
		},
		NOW,
	)
	if (!created.ok) throw new Error(created.reason)
	const tracks = await prisma.trainingTrack.findMany({
		where: { outlineId: created.outlineId },
		select: { id: true, discipline: true },
	})
	const added = await addWeekPattern(userId, {
		outlineId: created.outlineId,
		name: 'Uke',
	})
	if (!added.ok) throw new Error(added.reason)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId: created.outlineId },
		select: { id: true },
	})
	return {
		eventId: event.id,
		outlineId: created.outlineId,
		patternId: pattern.id,
		runTrackId: tracks.find((track) => track.discipline === 'run')!.id,
		liftTrackId: tracks.find((track) => track.discipline === 'strength')!.id,
	}
}

const threshold = (title: string, minutes = 8): WorkoutAuthoringInput => ({
	title,
	discipline: 'run',
	intent: 'threshold',
	scheduledAt: new Date('2030-01-08T07:00:00Z'),
	blocks: [
		{
			repeatCount: 4,
			steps: [
				{
					kind: 'cardio',
					discipline: 'run',
					durationSec: minutes * 60,
					intensity: { kind: 'zoneLabel' as const, label: 'Z4' },
				},
			],
		},
	],
})

/** A session the athlete wrote by hand, and its Workout. */
async function authoredSession(userId: string, title = 'Terskel 4×8') {
	const session = await createWorkoutSession(userId, threshold(title))
	const { workoutId } = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { workoutId: true },
	})
	return { sessionId: session.id, workoutId: workoutId! }
}

/** A Workout's prescription as the stamp copies it, without its id. */
async function prescription(workoutId: string) {
	const {
		id: _id,
		visibility: _visibility,
		...rest
	} = await prisma.workout.findUniqueOrThrow({
		where: { id: workoutId },
		select: workoutCopySelect,
	})
	return rest
}

/** The plan's days, with the Workout each holds. */
async function daysOf(patternId: string) {
	return prisma.weekPatternDay.findMany({
		where: { patternId },
		orderBy: [{ weekday: 'asc' }, { orderInDay: 'asc' }],
		select: {
			id: true,
			kind: true,
			workoutId: true,
			workout: {
				select: {
					title: true,
					heldByOutlineId: true,
					copiedFromId: true,
					ownerId: true,
				},
			},
		},
	})
}

/** The prescriptions the plan laid in the week of `weekKey`, in order. */
async function laidIn(userId: string, weekKey: string) {
	const from = new Date(`${weekKey}T00:00:00Z`)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			source: 'generated',
			scheduledAt: {
				gte: from,
				lt: new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000),
			},
		},
		orderBy: { scheduledAt: 'asc' },
		select: { workoutId: true },
	})
	return Promise.all(
		sessions.map((session) => prescription(session.workoutId!)),
	)
}

async function stamp(userId: string, patternId: string, weekKey: string) {
	const stamped = await stampWeekPattern(
		userId,
		{ patternId, weekKeys: [weekKey], replace: true },
		NOW,
	)
	if (!stamped.ok) throw new Error(stamped.reason)
}

/** The plan's Held Workouts. */
const heldBy = (outlineId: string) =>
	prisma.workout.findMany({
		where: { heldByOutlineId: outlineId },
		select: { id: true },
	})

// ── The holder ───────────────────────────────────────────────────────────────

test('hold copies the athlete’s own Workout once per write, and returns a row the plan holds unchanged', async () => {
	const userId = await athlete()
	const { outlineId } = await racePlan(userId)
	const { workoutId } = await authoredSession(userId)

	const [first, second] = await prisma.$transaction(async (tx) => {
		const held = heldWorkouts(tx, { outlineId, athleteId: userId })
		return [
			await held.hold(workoutId, 'run'),
			await held.hold(workoutId, 'run'),
		]
	})
	if (!first?.ok || !second?.ok) throw new Error('not held')
	// One write's picks share one copy.
	expect(second.workoutId).toBe(first.workoutId)
	expect(first.workoutId).not.toBe(workoutId)
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: first.workoutId },
			select: {
				ownerId: true,
				authorship: true,
				copiedFromId: true,
				heldByOutlineId: true,
			},
		}),
	).toEqual({
		ownerId: userId,
		authorship: 'athlete',
		copiedFromId: workoutId,
		heldByOutlineId: outlineId,
	})
	expect(await prescription(first.workoutId)).toEqual(
		await prescription(workoutId),
	)

	// A later write holding what the plan holds gets the same id back.
	const again = await prisma.$transaction((tx) =>
		heldWorkouts(tx, { outlineId, athleteId: userId }).hold(first.workoutId),
	)
	expect(again).toEqual({ ok: true, workoutId: first.workoutId })
})

test('a later write holding the same unchanged Workout reuses the plan’s copy, and an edited one gets a new copy', async () => {
	const userId = await athlete()
	const { outlineId } = await racePlan(userId)
	const session = await authoredSession(userId)
	const holdOnce = () =>
		prisma.$transaction((tx) =>
			heldWorkouts(tx, { outlineId, athleteId: userId }).hold(
				session.workoutId,
				'run',
			),
		)

	const first = await holdOnce()
	const second = await holdOnce()
	if (!first.ok || !second.ok) throw new Error('not held')
	// Separate writes share the copy, so the same pick is one unit (ADR 0112 §2).
	expect(second.workoutId).toBe(first.workoutId)

	await updateWorkoutSession(
		userId,
		session.sessionId,
		threshold('Terskel 5×6', 6),
	)
	const edited = await holdOnce()
	if (!edited.ok) throw new Error(edited.reason)
	// The session changed since: the plan holds what it says now, beside the
	// copy its earlier days hold as it was.
	expect(edited.workoutId).not.toBe(first.workoutId)
	expect((await prescription(edited.workoutId)).title).toBe('Terskel 5×6')
	expect((await prescription(first.workoutId)).title).toBe('Terskel 4×8')
	// A Workout held in another plan is never reused here.
	const other = await createOpenEndedPlan(
		userId,
		{ discipline: 'run', weeklyHours: 4 },
		NOW,
	)
	if (!other.ok) throw new Error(other.reason)
	const elsewhere = await prisma.$transaction((tx) =>
		heldWorkouts(tx, { outlineId: other.outlineId, athleteId: userId }).hold(
			session.workoutId,
			'run',
		),
	)
	if (!elsewhere.ok) throw new Error(elsewhere.reason)
	expect(elsewhere.workoutId).not.toBe(edited.workoutId)
})

test('hold copies a Stock Workout in, and refuses a stranger’s, another plan’s or another Discipline’s', async () => {
	const userId = await athlete()
	const { outlineId } = await racePlan(userId)
	const stock = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Helkropp A',
			discipline: 'strength',
			intent: 'strength',
			authorship: 'system',
		},
	})
	const stranger = await athlete()
	const theirs = await authoredSession(stranger)
	const { workoutId: mine } = await authoredSession(userId)
	const other = await createOpenEndedPlan(
		userId,
		{ discipline: 'run', weeklyHours: 4 },
		NOW,
	)
	if (!other.ok) throw new Error(other.reason)
	const otherHeld = await prisma.$transaction((tx) =>
		heldWorkouts(tx, { outlineId: other.outlineId, athleteId: userId }).hold(
			mine,
		),
	)
	if (!otherHeld.ok) throw new Error(otherHeld.reason)

	const results = await prisma.$transaction(async (tx) => {
		const held = heldWorkouts(tx, { outlineId, athleteId: userId })
		return {
			stock: await held.hold(stock.id, 'strength'),
			stranger: await held.hold(theirs.workoutId),
			otherPlan: await held.hold(otherHeld.workoutId),
			mismatch: await held.hold(mine, 'bike'),
			gone: await held.hold('no-such-workout'),
		}
	})
	expect(results.stock.ok).toBe(true)
	if (results.stock.ok) {
		expect(
			await prisma.workout.findUniqueOrThrow({
				where: { id: results.stock.workoutId },
				select: { copiedFromId: true, authorship: true, ownerId: true },
			}),
		).toEqual({
			copiedFromId: stock.id,
			authorship: 'athlete',
			ownerId: userId,
		})
	}
	expect(results.stranger).toEqual({ ok: false, reason: 'workout-gone' })
	expect(results.otherPlan).toEqual({ ok: false, reason: 'workout-gone' })
	expect(results.mismatch).toEqual({
		ok: false,
		reason: 'workout-discipline-mismatch',
	})
	expect(results.gone).toEqual({ ok: false, reason: 'workout-gone' })
})

test('acceptsOnly takes the plan’s own held rows and nothing else', async () => {
	const userId = await athlete()
	const { outlineId } = await racePlan(userId)
	const { workoutId } = await authoredSession(userId)
	const verdicts = await prisma.$transaction(async (tx) => {
		const held = heldWorkouts(tx, { outlineId, athleteId: userId })
		const copy = await held.hold(workoutId)
		if (!copy.ok) throw new Error(copy.reason)
		return {
			held: await held.acceptsOnly([copy.workoutId, null], 'run'),
			none: await held.acceptsOnly([null]),
			session: await held.acceptsOnly([copy.workoutId, workoutId]),
			discipline: await held.acceptsOnly([copy.workoutId], 'strength'),
		}
	})
	expect(verdicts).toEqual({
		held: true,
		none: true,
		session: false,
		discipline: false,
	})
})

test('sweep deletes the plan’s held rows no day uses, sparing what the undo names', async () => {
	const userId = await athlete()
	const { outlineId, patternId, runTrackId } = await racePlan(userId)
	const used = await authoredSession(userId, 'Brukt')
	const spared = await authoredSession(userId, 'Spart')
	const unused = await authoredSession(userId, 'Ubrukt')
	const added = await addWeekPatternDay(userId, {
		patternId,
		kind: 'fixed',
		trackId: runTrackId,
		weekday: WED,
		workoutId: used.workoutId,
	})
	if (!added.ok) throw new Error(added.reason)
	const ids = await prisma.$transaction(async (tx) => {
		const held = heldWorkouts(tx, { outlineId, athleteId: userId })
		const a = await held.hold(spared.workoutId)
		const b = await held.hold(unused.workoutId)
		if (!a.ok || !b.ok) throw new Error('not held')
		return { spared: a.workoutId, unused: b.workoutId }
	})

	const swept = await prisma.$transaction((tx) =>
		heldWorkouts(tx, { outlineId, athleteId: userId }).sweep({
			spare: [ids.spared, null],
		}),
	)
	expect(swept).toBe(1)
	const left = (await heldBy(outlineId)).map((row) => row.id)
	expect(left).toContain(ids.spared)
	expect(left).not.toContain(ids.unused)
	expect(left).toHaveLength(2)
	// The sessions' own Workouts are never the plan's to sweep.
	expect(
		await prisma.workout.count({
			where: {
				id: { in: [used.workoutId, spared.workoutId, unused.workoutId] },
			},
		}),
	).toBe(3)
})

// ── The athlete's sessions are theirs again ─────────────────────────────────

test('a session a fixed day picked can be deleted; the day keeps its Workout and the weeks laid afterwards are the same', async () => {
	const userId = await athlete()
	const { outlineId, patternId, runTrackId } = await racePlan(userId)
	const session = await authoredSession(userId)
	const picked = await prescription(session.workoutId)
	const added = await addWeekPatternDay(userId, {
		patternId,
		kind: 'fixed',
		trackId: runTrackId,
		weekday: WED,
		workoutId: session.workoutId,
	})
	expect(added).toEqual({ ok: true })
	await stamp(userId, patternId, WEEK_1)
	const laidBefore = await laidIn(userId, WEEK_1)
	expect(laidBefore).toEqual([picked])

	expect(await deleteWorkoutSession(userId, session.sessionId)).toEqual({
		id: session.sessionId,
	})

	expect(
		await prisma.workoutSession.count({ where: { id: session.sessionId } }),
	).toBe(0)
	const [day] = await daysOf(patternId)
	expect(day?.workout).toMatchObject({
		title: 'Terskel 4×8',
		heldByOutlineId: outlineId,
		// The source is gone; the lineage is orphaned, never the copy.
		copiedFromId: null,
	})
	const season = await getSeasonForOutline(userId, outlineId, NOW)
	expect(season?.patterns[0]?.days[0]?.workout?.title).toBe('Terskel 4×8')
	await stamp(userId, patternId, WEEK_2)
	expect(await laidIn(userId, WEEK_2)).toEqual(laidBefore)
})

test('a share day keeps its shape when the session it was shaped on is deleted', async () => {
	const userId = await athlete()
	const { outlineId, patternId, runTrackId } = await racePlan(userId)
	const session = await authoredSession(userId, 'Langtur i terreng')
	const added = await addWeekPatternDay(userId, {
		patternId,
		kind: 'share',
		trackId: runTrackId,
		weekday: SAT,
		weight: 2,
		workoutId: session.workoutId,
	})
	expect(added).toEqual({ ok: true })

	expect(await deleteWorkoutSession(userId, session.sessionId)).not.toBeNull()

	const [day] = await daysOf(patternId)
	expect(day).toMatchObject({ kind: 'share' })
	expect(day?.workoutId).not.toBeNull()
	// The editor's "formet etter <title>", not "no shape".
	const season = await getSeasonForOutline(userId, outlineId, NOW)
	expect(season?.patterns[0]?.days[0]?.workout?.title).toBe('Langtur i terreng')
})

test('editing the picked session reaches neither the day nor the weeks it lays, and editing a laid session reaches neither the day nor another week', async () => {
	const userId = await athlete()
	const { patternId, runTrackId } = await racePlan(userId)
	const session = await authoredSession(userId)
	const picked = await prescription(session.workoutId)
	const added = await addWeekPatternDay(userId, {
		patternId,
		kind: 'fixed',
		trackId: runTrackId,
		weekday: WED,
		workoutId: session.workoutId,
	})
	expect(added).toEqual({ ok: true })
	const [day] = await daysOf(patternId)

	const edited = await updateWorkoutSession(
		userId,
		session.sessionId,
		threshold('Terskel 5×6', 6),
	)
	expect(edited.ok).toBe(true)
	expect((await prescription(session.workoutId)).title).toBe('Terskel 5×6')

	expect(await prescription(day!.workoutId!)).toEqual(picked)
	await stamp(userId, patternId, WEEK_1)
	await stamp(userId, patternId, WEEK_2)
	expect(await laidIn(userId, WEEK_1)).toEqual([picked])

	// Editing the week-1 session the pattern laid.
	const [laid] = await prisma.workoutSession.findMany({
		where: { userId, source: 'generated' },
		orderBy: { scheduledAt: 'asc' },
		select: { id: true },
	})
	const laidEdit = await updateWorkoutSession(
		userId,
		laid!.id,
		threshold('Min egen terskel', 10),
	)
	expect(laidEdit.ok).toBe(true)
	expect(await prescription(day!.workoutId!)).toEqual(picked)
	expect(await laidIn(userId, WEEK_2)).toEqual([picked])
})

test('after the strength offer, the strength session the lifts copy can be deleted and the next laid weeks still lift it', async () => {
	const userId = await athlete()
	const plan = await createOpenEndedPlan(
		userId,
		{ discipline: 'run', weeklyHours: 4 },
		NOW,
	)
	if (!plan.ok) throw new Error(plan.reason)
	const { outlineId } = plan
	const run = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const added = await addWeekPattern(userId, { outlineId, name: 'Uke' })
	if (!added.ok) throw new Error(added.reason)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const day = await addWeekPatternDay(userId, {
		patternId: pattern.id,
		kind: 'share',
		trackId: run.id,
		weekday: WED,
		weight: 1,
	})
	if (!day.ok) throw new Error(day.reason)
	// Two lifts a week over the four weeks the offer reads.
	let last = ''
	for (const monday of [10, 17, 24, 31]) {
		for (const offset of [0, 3]) {
			const lifted = await prisma.workout.create({
				select: { id: true },
				data: {
					title: 'Knebøy 3×5',
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
											orderIndex: 0,
											kind: 'strength',
											sets: {
												create: [0, 1, 2].map((orderIndex) => ({
													orderIndex,
													kind: 'reps',
													reps: 5,
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
			const session = await prisma.workoutSession.create({
				select: { id: true },
				data: {
					userId,
					status: 'completed',
					workoutId: lifted.id,
					scheduledAt: new Date(Date.UTC(2029, 11, monday + offset, 16)),
				},
			})
			last = session.id
		}
	}
	const lastWorkoutId = (await prisma.workoutSession.findUniqueOrThrow({
		where: { id: last },
		select: { workoutId: true },
	}))!.workoutId!
	const lifted = await prescription(lastWorkoutId)

	expect(await addProposedStrengthTrack(userId, outlineId, NOW)).toMatchObject({
		ok: true,
		lifts: 2,
	})
	const slots = await prisma.weekPatternDay.findMany({
		where: { kind: 'lifting', pattern: { outlineId } },
		select: { workoutId: true },
	})
	expect(slots).toHaveLength(2)
	// The slots share one copy the plan holds, not the session's own row.
	expect(new Set(slots.map((slot) => slot.workoutId)).size).toBe(1)
	expect(slots[0]!.workoutId).not.toBe(lastWorkoutId)

	expect(await deleteWorkoutSession(userId, last)).toEqual({ id: last })

	expect(await prescription(slots[0]!.workoutId!)).toEqual(lifted)
	const { startWeekKey } = await prisma.planOutline.findUniqueOrThrow({
		where: { id: outlineId },
		select: { startWeekKey: true },
	})
	await stamp(userId, pattern.id, startWeekKey)
	const strength = (await laidIn(userId, startWeekKey)).filter(
		(laid) => laid.discipline === 'strength',
	)
	expect(strength).toEqual([lifted, lifted])
})

// ── What a removed day leaves behind ───────────────────────────────────────

async function planWithEveryKindOfDay() {
	const userId = await athlete()
	const plan = await racePlan(userId)
	const fixed = await authoredSession(userId, 'Terskel')
	const shape = await authoredSession(userId, 'Langtur')
	for (const input of [
		{
			kind: 'fixed' as const,
			trackId: plan.runTrackId,
			weekday: WED as 2,
			workoutId: fixed.workoutId,
		},
		{
			kind: 'share' as const,
			trackId: plan.runTrackId,
			weekday: SAT as 5,
			weight: 2,
			workoutId: shape.workoutId,
		},
	]) {
		const added = await addWeekPatternDay(userId, {
			patternId: plan.patternId,
			...input,
		})
		if (!added.ok) throw new Error(added.reason)
	}
	const stock = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Helkropp A',
			discipline: 'strength',
			intent: 'strength',
			authorship: 'system',
		},
	})
	await prisma.$transaction(async (tx) => {
		const held = await heldWorkouts(tx, {
			outlineId: plan.outlineId,
			athleteId: userId,
		}).hold(stock.id, 'strength')
		if (!held.ok) throw new Error(held.reason)
		for (const orderInDay of [0, 1]) {
			await tx.weekPatternDay.create({
				data: {
					patternId: plan.patternId,
					trackId: plan.liftTrackId,
					kind: 'lifting',
					weekday: null,
					orderInDay,
					workoutId: held.workoutId,
				},
			})
		}
	})
	return {
		userId,
		...plan,
		sessionWorkoutIds: [fixed.workoutId, shape.workoutId],
		stockId: stock.id,
	}
}

test('removing a day takes the Held Workout only it used, and never a session’s', async () => {
	const plan = await planWithEveryKindOfDay()
	expect(await heldBy(plan.outlineId)).toHaveLength(3)
	const [fixed] = (await daysOf(plan.patternId)).filter(
		(day) => day.kind === 'fixed',
	)

	expect(await removeWeekPatternDay(plan.userId, { dayId: fixed!.id })).toEqual(
		{ ok: true },
	)

	const left = await heldBy(plan.outlineId)
	expect(left).toHaveLength(2)
	expect(left.map((row) => row.id)).not.toContain(fixed!.workoutId)
	expect(
		await prisma.workout.count({
			where: { id: { in: plan.sessionWorkoutIds } },
		}),
	).toBe(2)
})

test('removing a pattern or a track takes the Held Workouts only its days used', async () => {
	const plan = await planWithEveryKindOfDay()
	expect(await removeTrack(plan.userId, { trackId: plan.liftTrackId })).toEqual(
		{ ok: true },
	)
	// The lifting slots' copy went with the strength track's days.
	expect(await heldBy(plan.outlineId)).toHaveLength(2)

	expect(
		await removeWeekPattern(plan.userId, { patternId: plan.patternId }),
	).toEqual({ ok: true })
	expect(await heldBy(plan.outlineId)).toHaveLength(0)
	expect(
		await prisma.workout.count({
			where: { id: { in: plan.sessionWorkoutIds } },
		}),
	).toBe(2)
	expect(await prisma.workout.count({ where: { id: plan.stockId } })).toBe(1)
})

test('deleting the plan or its Event takes its Held Workouts, fixed, share and lifting alike', async () => {
	const byPlan = await planWithEveryKindOfDay()
	expect(
		await deletePlanOutline(byPlan.userId, { outlineId: byPlan.outlineId }),
	).toEqual({ ok: true })
	expect(await heldBy(byPlan.outlineId)).toHaveLength(0)
	expect(
		await prisma.workout.count({
			where: { id: { in: byPlan.sessionWorkoutIds } },
		}),
	).toBe(2)

	const byEvent = await planWithEveryKindOfDay()
	expect(await deleteEvent(byEvent.userId, byEvent.eventId)).toEqual({
		id: byEvent.eventId,
	})
	expect(
		await prisma.planOutline.count({ where: { id: byEvent.outlineId } }),
	).toBe(0)
	expect(await heldBy(byEvent.outlineId)).toHaveLength(0)
})

test('a Workout a day still uses cannot be deleted out from under it', async () => {
	const plan = await planWithEveryKindOfDay()
	const [fixed] = (await daysOf(plan.patternId)).filter(
		(day) => day.kind === 'fixed',
	)
	await expect(
		prisma.workout.delete({ where: { id: fixed!.workoutId! } }),
	).rejects.toThrow()
	expect(await daysOf(plan.patternId)).toHaveLength(4)
})

// ── Account deletion (ADR 0105) ─────────────────────────────────────────────

test('deleting the account erases the plan’s Held Workouts with the rest', async () => {
	const plan = await planWithEveryKindOfDay()
	const erasure = await deleteAccount(plan.userId)
	expect(erasure.erased).toBeGreaterThanOrEqual(5)
	expect(await heldBy(plan.outlineId)).toHaveLength(0)
	expect(await prisma.workout.count({ where: { ownerId: plan.userId } })).toBe(
		0,
	)
	expect(await prisma.workout.count({ where: { id: plan.stockId } })).toBe(1)
})

test('a bare user delete passes with fixed, share and lifting days held (ADR 0112 §6)', async () => {
	const plan = await planWithEveryKindOfDay()
	await prisma.user.delete({ where: { id: plan.userId } })
	expect(await heldBy(plan.outlineId)).toHaveLength(0)
	expect(
		await prisma.weekPatternDay.count({ where: { patternId: plan.patternId } }),
	).toBe(0)
})

// ── Readers ─────────────────────────────────────────────────────────────────

test('the picker and the publish flow never offer a Held Workout', async () => {
	const plan = await planWithEveryKindOfDay()
	const held = (await heldBy(plan.outlineId)).map((row) => row.id)

	const picker = await getAuthoredWorkouts(plan.userId, ['run', 'strength'])
	expect(picker.map((workout) => workout.id).sort()).toEqual(
		[...plan.sessionWorkoutIds].sort(),
	)

	const own = await listOwnPublishableWorkouts(plan.userId)
	expect(own.map((workout) => workout.id).sort()).toEqual(
		[...plan.sessionWorkoutIds].sort(),
	)

	for (const id of held) {
		expect(await readPublishTarget(plan.userId, id)).toBeNull()
		expect(
			await publishWorkout({
				userId: plan.userId,
				workoutId: id,
				displayName: 'Kari',
				archetype: 'threshold',
			}),
		).toEqual({ ok: false, reason: 'held-by-plan' })
	}
	expect(
		await prisma.workout.count({
			where: { id: { in: held }, visibility: 'public' },
		}),
	).toBe(0)
})
