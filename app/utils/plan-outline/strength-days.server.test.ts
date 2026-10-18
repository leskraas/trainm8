import { expect, test } from 'vitest'
import { weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { proposeWeekChange } from '#app/utils/load/propose-week-change.ts'
import { applyWeekReplanForUser } from '#app/utils/load/week-replan.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
	setQualitySessionMix,
} from './authoring.server.ts'
import { stampWeekPattern } from './stamp.server.ts'
import {
	previewStrengthDays,
	readStrengthDays,
	setStrengthDays,
} from './strength-days.server.ts'

// The athlete chooses their lifting days in _Meg → Trening → Styrke_ (#597,
// ADR 0104 §4). Weekdays are the Week Pattern's: 0 is Monday, 6 Sunday.

const NOW = new Date('2030-01-09T12:00:00Z') // a Wednesday
const WEEKS = ['2030-01-14', '2030-01-21']
const MON = 0
const TUE = 1
const THU = 3

/**
 * A race plan with running every day — long on Sunday, one threshold session
 * a week — and lifting twice a week on days the app chooses, both weeks
 * already on the calendar.
 */
async function setup({
	trainableWeekdays = [0, 1, 2, 3, 4, 5, 6],
	fixedLiftingDays,
}: { trainableWeekdays?: number[]; fixedLiftingDays?: number[] } = {}) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'Europe/Oslo',
					defaultTrainingTime: '07:00',
					trainableWeekdays: JSON.stringify(trainableWeekdays),
				},
			},
		},
	})
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			name: 'Vårhalvmaraton',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-04-07T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	const created = await createPlanOutline(
		user.id,
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
	const run = tracks.find((t) => t.discipline === 'run')!.id
	const lift = tracks.find((t) => t.discipline === 'strength')!.id
	const added = await addWeekPattern(user.id, {
		outlineId: created.outlineId,
		name: 'Uke',
	})
	if (!added.ok) throw new Error(added.reason)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId: created.outlineId },
		select: { id: true },
	})
	for (const weekday of [0, 1, 2, 3, 4, 5, 6] as const) {
		const day = await addWeekPatternDay(user.id, {
			patternId: pattern.id,
			kind: 'share',
			trackId: run,
			weekday,
			weight: weekday === 6 ? 2 : 1,
		})
		if (!day.ok) throw new Error(day.reason)
	}
	const segment = await prisma.trainingTrackSegment.findFirstOrThrow({
		where: { trackId: run, kind: 'endurance' },
		select: { id: true },
	})
	const mixed = await setQualitySessionMix(user.id, {
		segmentId: segment.id,
		entries: [{ zone: 4, sessionsPerWeek: 1 }],
	})
	if (!mixed.ok) throw new Error(mixed.reason)
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: user.id,
			title: 'Knebøy',
			discipline: 'strength',
			intent: 'strength',
		},
	})
	if (fixedLiftingDays) {
		for (const weekday of fixedLiftingDays) {
			await prisma.weekPatternDay.create({
				data: {
					patternId: pattern.id,
					trackId: lift,
					kind: 'fixed',
					weekday,
					orderInDay: 1,
					workoutId: workout.id,
				},
			})
		}
	} else {
		for (const orderInDay of [0, 1]) {
			await prisma.weekPatternDay.create({
				data: {
					patternId: pattern.id,
					trackId: lift,
					kind: 'lifting',
					weekday: null,
					orderInDay,
					workoutId: workout.id,
				},
			})
		}
	}
	const stamped = await stampWeekPattern(
		user.id,
		{ patternId: pattern.id, weekKeys: WEEKS, replace: false },
		NOW,
	)
	if (!stamped.ok) throw new Error(stamped.reason)
	return { userId: user.id, liftTrackId: lift }
}

/** Each plan week's lifting days and hard-run days, as on the calendar. */
async function calendar(userId: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, status: 'scheduled' },
		orderBy: { scheduledAt: 'asc' },
		select: {
			scheduledAt: true,
			workout: { select: { discipline: true, title: true } },
		},
	})
	return WEEKS.map((monday) => {
		const inWeek = sessions.filter((s) => {
			const date = s.scheduledAt.toISOString().slice(0, 10)
			return date >= monday && date < nextMonday(monday)
		})
		const day = (s: (typeof inWeek)[number]) =>
			weekdayIndex(s.scheduledAt.toISOString().slice(0, 10))
		return {
			lifting: inWeek
				.filter((s) => s.workout?.discipline === 'strength')
				.map(day),
			hard: inWeek
				.filter((s) => s.workout?.title.startsWith('Terskel'))
				.map(day),
		}
	})
}

function nextMonday(monday: string) {
	const date = new Date(`${monday}T00:00:00Z`)
	date.setUTCDate(date.getUTCDate() + 7)
	return date.toISOString().slice(0, 10)
}

test('a plan whose lifting the app lays reads as La appen velge', async () => {
	const { userId } = await setup()
	expect(await readStrengthDays(userId, NOW)).toMatchObject({
		pinned: null,
		count: 2,
	})
})

test('choosing Tuesday and Thursday lifts on Tuesday and Thursday in every week, and the run’s intervals are laid away from them', async () => {
	const { userId, liftTrackId } = await setup()
	const state = (await readStrengthDays(userId, NOW))!

	// The preview shows it before anything is written.
	const preview = await previewStrengthDays(userId, [TUE, THU], NOW)
	if (!preview.ok) throw new Error(preview.reason)
	for (const week of preview.weeks) {
		expect(week.after.lifting).toEqual([TUE, THU])
		expect(week.after.hard).not.toContain(TUE)
		expect(week.after.hard).not.toContain(THU)
	}
	expect(await calendar(userId)).not.toContainEqual(
		expect.objectContaining({ lifting: [TUE, THU] }),
	)

	const written = await setStrengthDays(
		userId,
		{ choice: [TUE, THU], version: state.version },
		NOW,
	)
	expect(written).toMatchObject({ ok: true, choice: [TUE, THU], count: 2 })
	for (const week of await calendar(userId)) {
		expect(week.lifting).toEqual([TUE, THU])
		// The one hard run lands on Monday: off both lifting days and off the
		// day after each.
		expect(week.hard).toEqual([MON])
	}
	expect(await readStrengthDays(userId, NOW)).toMatchObject({
		pinned: [TUE, THU],
	})
	const track = await prisma.trainingTrack.findUniqueOrThrow({
		where: { id: liftTrackId },
		select: { pinnedDays: true },
	})
	expect(track.pinnedDays).toBe('[1,3]')
})

test('the Strength Frequency is the number of days chosen', async () => {
	const { userId } = await setup()
	const state = (await readStrengthDays(userId, NOW))!
	await setStrengthDays(userId, { choice: [THU], version: state.version }, NOW)
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { strengthPerWeek: true },
	})
	expect(profile.strengthPerWeek).toBe(1)
	for (const week of await calendar(userId)) {
		expect(week.lifting).toEqual([THU])
	}
})

test('undoing from the toast restores the previous days', async () => {
	const { userId } = await setup()
	const state = (await readStrengthDays(userId, NOW))!
	const before = await calendar(userId)
	const written = await setStrengthDays(
		userId,
		{ choice: [TUE, THU], version: state.version },
		NOW,
	)
	if (!written.ok) throw new Error(written.reason)

	const undone = await setStrengthDays(
		userId,
		{
			choice: written.previous.days,
			version: written.version,
			restore: written.previous,
		},
		NOW,
	)
	expect(undone).toMatchObject({ ok: true, choice: null, count: 2 })
	expect(await readStrengthDays(userId, NOW)).toMatchObject({
		pinned: null,
		count: 2,
		answer: null,
	})
	expect(await calendar(userId)).toEqual(before)
})

test('an existing plan’s fixed strength days appear as the chosen days, and La appen velge hands them back', async () => {
	const { userId, liftTrackId } = await setup({ fixedLiftingDays: [MON, THU] })
	const state = (await readStrengthDays(userId, NOW))!
	expect(state).toMatchObject({ pinned: [MON, THU], count: 2 })
	for (const week of await calendar(userId)) {
		expect(week.lifting).toEqual([MON, THU])
	}

	const handed = await setStrengthDays(
		userId,
		{ choice: null, version: state.version },
		NOW,
	)
	expect(handed).toMatchObject({ ok: true, choice: null, count: 2 })
	const rows = await prisma.weekPatternDay.findMany({
		where: { trackId: liftTrackId },
		select: { kind: true, weekday: true },
	})
	expect(rows).toEqual([
		{ kind: 'lifting', weekday: null },
		{ kind: 'lifting', weekday: null },
	])
	for (const week of await calendar(userId)) {
		expect(week.lifting).toHaveLength(2)
		for (const lift of week.lifting) {
			expect(week.hard).not.toContain(lift)
			expect(week.hard).not.toContain((lift + 1) % 7)
		}
	}
})

test('a day the athlete does not train on cannot be chosen', async () => {
	const { userId } = await setup({ trainableWeekdays: [1, 3, 5, 6] })
	const state = (await readStrengthDays(userId, NOW))!
	// Training Availability is Sunday-first: Monday, Wednesday, Friday and
	// Saturday are Monday-first 0, 2, 4 and 5.
	expect(state.available).toEqual([0, 2, 4, 5])
	expect(
		await setStrengthDays(
			userId,
			{ choice: [TUE], version: state.version },
			NOW,
		),
	).toEqual({ ok: false, reason: 'outside-availability' })
})

test('a choice made against a plan that changed since is refused', async () => {
	const { userId } = await setup()
	const state = (await readStrengthDays(userId, NOW))!
	await setStrengthDays(userId, { choice: [TUE], version: state.version }, NOW)
	expect(
		await setStrengthDays(
			userId,
			{ choice: [THU], version: state.version },
			NOW,
		),
	).toEqual({ ok: false, reason: 'stale' })
})

test('Week Replan is told a missed lift’s track’s chosen days, so a make-up goes on one of them', async () => {
	const { userId } = await setup()
	const state = (await readStrengthDays(userId, NOW))!
	await setStrengthDays(
		userId,
		{ choice: [TUE, THU], version: state.version },
		NOW,
	)
	// The week of 14 January closes with its lifts not done.
	let seen: Parameters<typeof proposeWeekChange>[0] | null = null
	await applyWeekReplanForUser(
		userId,
		new Date('2030-01-21T08:00:00Z'),
		(facts) => {
			seen = facts
			return proposeWeekChange(facts)
		},
	)
	const missedLifts = seen!.missedSessions.filter(
		(session) => session.placement?.kind === 'lifting',
	)
	expect(missedLifts.length).toBeGreaterThan(0)
	for (const lift of missedLifts) expect(lift.ownDays).toEqual([TUE, THU])
	// A missed run's track names no days of its own.
	for (const run of seen!.missedSessions.filter(
		(s) => s.placement?.kind !== 'lifting',
	)) {
		expect(run.ownDays).toBeUndefined()
	}
})
