import { expect, test } from 'vitest'
import { addDays, weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { fillPlanWeek } from '#app/utils/load/horizon-fill.server.ts'
import {
	isSimpleActivityTrack,
	resolvedTracks,
} from '#app/utils/plan-outline/from-rows.ts'
import { weekKeyAt } from '#app/utils/plan-outline/week-keys.ts'
import { readSimpleActivity } from '#app/utils/simple-activity.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { type FirstRunAnswers } from './first-run-schema.ts'
import { createFirstRunPlan } from './plan.server.ts'
import { draftStart } from './start-draft.ts'

// The plan writer with Simple Activities (#572): what is made is what was
// shown, minute for minute, Simple Activities included, and the horizon fill
// keeps laying them in the weeks after.

const NOW = new Date('2030-01-09T12:00:00Z') // a Wednesday
const START = '2030-01-14' // the first week not yet begun: next Monday

async function createAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	return user.id
}

async function laid(athleteId: string, weekKey: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId: athleteId,
			scheduledAt: {
				gte: new Date(`${weekKey}T00:00:00Z`),
				lt: new Date(`${addDays(weekKey, 7)}T00:00:00Z`),
			},
		},
		orderBy: { scheduledAt: 'asc' },
		select: {
			scheduledAt: true,
			status: true,
			markedDoneAt: true,
			recordingId: true,
			source: true,
			workout: {
				select: {
					title: true,
					discipline: true,
					activityKind: true,
					effortWord: true,
					blocks: {
						select: {
							repeatCount: true,
							seriesRepeatCount: true,
							steps: {
								select: {
									kind: true,
									durationSec: true,
									distanceM: true,
									intensity: true,
								},
							},
						},
					},
				},
			},
		},
	})
	return sessions.map((session) => ({
		...session,
		weekday: weekdayIndex(session.scheduledAt.toISOString().slice(0, 10)),
		minutes: Math.round(
			session
				.workout!.blocks.flatMap((block) => block.steps)
				.reduce((sum, step) => sum + (step.durationSec ?? 0), 0) / 60,
		),
		simple: readSimpleActivity(session.workout),
	}))
}

const ANSWERS = {
	level: 'recreational',
	discipline: 'run',
	activities: ['climb', 'yoga-mobility'],
	hours: 5,
	days: [0, 2, 4, 5],
	family: 'polarized',
} satisfies FirstRunAnswers

test('the plan made is the card shown, minute for minute, Simple Activities included, and nothing is marked done', async () => {
	const athleteId = await createAthlete()
	const option = draftStart({ ...ANSWERS, startWeekKey: START })!.options.find(
		(shown) => shown.family === 'polarized',
	)!

	const created = await createFirstRunPlan(athleteId, ANSWERS, NOW)
	expect(created).toMatchObject({ ok: true })

	const weekOne = await laid(athleteId, START)
	expect(weekOne.map((session) => [session.weekday, session.minutes])).toEqual(
		option.week.days.flatMap((day) =>
			day.sessions.map((session) => [day.weekday, session.minutes]),
		),
	)
	expect(
		weekOne.every(
			(session) =>
				session.status === 'scheduled' &&
				session.markedDoneAt == null &&
				session.recordingId == null &&
				session.source === 'generated',
		),
	).toBe(true)

	// The climb and the yoga are Simple Activities, with their kind and word.
	const simple = weekOne.flatMap((session) =>
		session.simple
			? [{ title: session.workout!.title, ...session.simple }]
			: [],
	)
	expect(simple).toEqual([
		{
			title: 'Klatring',
			kind: 'climb',
			effortWord: 'middels',
			durationMin: 90,
		},
		{
			title: 'Yoga og bevegelighet',
			kind: 'yoga-mobility',
			effortWord: 'rolig',
			durationMin: 30,
		},
	])

	// One hours track on `other`, its pattern days fixed.
	const outline = await prisma.planOutline.findFirstOrThrow({
		where: { athleteId },
		select: {
			tracks: {
				select: {
					discipline: true,
					currency: true,
					segments: { select: { mix: { select: { zone: true } } } },
				},
			},
			patterns: {
				select: {
					days: {
						select: {
							kind: true,
							track: { select: { discipline: true } },
						},
					},
				},
			},
		},
	})
	const other = outline.tracks.filter((track) => track.discipline === 'other')
	expect(other).toHaveLength(1)
	expect(other[0]!.currency).toBe('hours')
	expect(other[0]!.segments.length).toBeGreaterThan(0)
	expect(other[0]!.segments.every((segment) => segment.mix.length === 0)).toBe(
		true,
	)
	const days = outline.patterns.flatMap((pattern) => pattern.days)
	expect(
		days
			.filter((day) => day.track.discipline === 'other')
			.map((day) => day.kind),
	).toEqual(['fixed', 'fixed'])
})

test('the plan’s Simple Activities track asks for the same hours every week, through every phase', async () => {
	const athleteId = await createAthlete()
	expect(await createFirstRunPlan(athleteId, ANSWERS, NOW)).toMatchObject({
		ok: true,
	})
	const found = await findActiveOutline(athleteId, NOW)
	const other = resolvedTracks(found!.outline).find((track) =>
		isSimpleActivityTrack(track.discipline),
	)!
	const values = other.targets.map((target) => target.value)
	expect(values.length).toBeGreaterThanOrEqual(4)
	expect(new Set(values)).toEqual(new Set([2]))
})

test('the horizon fill lays the Simple Activities in the weeks after the first two', async () => {
	const athleteId = await createAthlete()
	expect(await createFirstRunPlan(athleteId, ANSWERS, NOW)).toMatchObject({
		ok: true,
	})
	const third = weekKeyAt(START, 2)
	await fillPlanWeek(athleteId, third, await getAthleteTimezone(athleteId), NOW)
	const weekThree = await laid(athleteId, third)
	expect(
		weekThree.flatMap((session) =>
			session.simple ? [[session.simple.kind, session.simple.durationMin]] : [],
		),
	).toEqual([
		['climb', 90],
		['yoga-mobility', 30],
	])
})

test('an athlete who picked only Simple Activities gets one simple week, made as shown', async () => {
	const athleteId = await createAthlete()
	const answers = {
		level: 'recreational',
		activities: ['hike', 'yoga-mobility'],
		hours: 3,
		days: [1, 3, 5],
		family: null,
	} satisfies FirstRunAnswers
	const start = draftStart({ ...answers, startWeekKey: START })!
	expect(start.options).toHaveLength(1)

	expect(await createFirstRunPlan(athleteId, answers, NOW)).toMatchObject({
		ok: true,
	})
	const weekOne = await laid(athleteId, START)
	expect(weekOne.map((session) => [session.weekday, session.minutes])).toEqual(
		start.options[0]!.week.days.flatMap((day) =>
			day.sessions.map((session) => [day.weekday, session.minutes]),
		),
	)
	expect(weekOne.every((session) => session.simple != null)).toBe(true)
	expect(weekOne.reduce((sum, session) => sum + session.minutes, 0)).toBe(180)
	const tracks = await prisma.trainingTrack.findMany({
		where: { outline: { athleteId } },
		select: { discipline: true },
	})
	expect(tracks).toEqual([{ discipline: 'other' }])
})
