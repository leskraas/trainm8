import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
} from './authoring.server.ts'
import { attachEventToOutline } from './open-ended.server.ts'
import { stampWeekPattern } from './stamp.server.ts'

// Seam 1 for adding an Event to an open-ended plan (#505 stories 7–8, ADR 0079
// §4): a plan with no Event, the weeks already on the calendar, an Event and a
// clock go in; the phases, the plan's anchor and the sessions come out.
//
// The plan opens Monday 31 Dec 2029 with two four-week rounds on 3:1. The
// Event is added on Wednesday 9 Jan — the second week of Blokk 1 — for a race
// on Sunday 10 Mar, whose week (4 Mar) is the plan's tenth.

const OSLO = 'Europe/Oslo'
const PLAN_START = '2029-12-31'
const WEDNESDAY = new Date('2030-01-09T12:00:00Z')

const wednesdayOf = (weekKey: string) => {
	const [y, mo, d] = weekKey.split('-').map(Number)
	// 07:00 in Oslo, the athlete's training time, in January (UTC+1).
	return new Date(Date.UTC(y!, mo! - 1, d! + 2, 6, 0))
}

async function setUp() {
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
	const created = await createPlanOutline(
		user.id,
		{
			startWeekKey: PLAN_START,
			structure: {
				phases: [
					{ name: 'Blokk 1', weeks: 4, rhythm: '3:1' },
					{ name: 'Blokk 2', weeks: 4, rhythm: '3:1' },
				],
			},
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 30 }],
		},
		new Date('2029-12-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	const outlineId = created.outlineId
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const added = await addWeekPattern(user.id, { outlineId, name: 'Uke' })
	if (!added.ok) throw new Error(added.reason)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const day = await addWeekPatternDay(user.id, {
		patternId: pattern.id,
		kind: 'share',
		trackId: track.id,
		weekday: 2,
		weight: 1,
	})
	if (!day.ok) throw new Error(day.reason)
	const stamped = await stampWeekPattern(
		user.id,
		{
			patternId: pattern.id,
			weekKeys: ['2029-12-31', '2030-01-07', '2030-01-14', '2030-01-21'],
			replace: false,
		},
		new Date('2029-12-30T12:00:00Z'),
	)
	if (!stamped.ok) throw new Error(stamped.reason)
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			name: 'Vårløpet',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-03-10T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	return { userId: user.id, outlineId, eventId: event.id }
}

async function sessionOn(userId: string, weekKey: string) {
	return prisma.workoutSession.findMany({
		where: { userId, scheduledAt: wednesdayOf(weekKey) },
		select: { id: true, source: true, planOutlineId: true },
	})
}

test('adding an Event mid-round ends the round early, lays phases to the Event, and keeps the athlete’s sessions', async () => {
	const { userId, outlineId, eventId } = await setUp()
	const lived = await sessionOn(userId, '2030-01-07')
	const relaid = await sessionOn(userId, '2030-01-14')
	// The athlete adopted the plan's session in the week of 21 Jan …
	const [adopted] = await sessionOn(userId, '2030-01-21')
	await prisma.workoutSession.update({
		where: { id: adopted!.id },
		data: { adoptedAt: new Date('2030-01-05T12:00:00Z') },
	})
	// … and wrote one of their own in the week of 14 Jan.
	const own = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			scheduledAt: new Date('2030-01-15T16:00:00Z'),
			status: 'scheduled',
			source: 'authored',
		},
	})

	const result = await attachEventToOutline(
		userId,
		outlineId,
		eventId,
		WEDNESDAY,
	)

	// Blokk 1 ends after the two weeks lived; Blokk 2 never began, so it goes.
	// Klassisk's run-up (Build 6, Peak 2, Taper 2) fits the eight weeks left by
	// the Season Fit rule: the first block gives, the taper never.
	expect(result).toEqual({
		ok: true,
		ended: { name: 'Blokk 1', weeks: 2 },
		phases: [
			{ name: 'Build', weeks: 4 },
			{ name: 'Peak', weeks: 2 },
			{ name: 'Taper', weeks: 2 },
		],
		relaid: 1,
	})
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: outlineId },
		select: {
			eventId: true,
			phases: {
				orderBy: { orderIndex: 'asc' },
				select: { name: true, weeks: true, rhythm: true, tapers: true },
			},
		},
	})
	expect(outline).toEqual({
		eventId,
		phases: [
			{ name: 'Blokk 1', weeks: 2, rhythm: '3:1', tapers: false },
			{ name: 'Build', weeks: 4, rhythm: '3:1', tapers: false },
			{ name: 'Peak', weeks: 2, rhythm: 'none', tapers: false },
			{ name: 'Taper', weeks: 2, rhythm: 'none', tapers: true },
		],
	})
	// It is an ordinary plan toward that Event now.
	expect((await findActiveOutline(userId, WEDNESDAY))?.event?.id).toBe(eventId)

	// The week being lived is untouched.
	expect(await sessionOn(userId, '2030-01-07')).toEqual(lived)
	// The machine's week ahead is laid again at the new phase's target …
	const fresh = await sessionOn(userId, '2030-01-14')
	expect(fresh).toHaveLength(1)
	expect(fresh[0]!.id).not.toBe(relaid[0]!.id)
	expect(fresh[0]).toMatchObject({
		source: 'generated',
		planOutlineId: outlineId,
	})
	// … the athlete's own sessions stay, and the week they took over is not
	// laid a second time beside them.
	expect(
		await prisma.workoutSession.findUnique({
			where: { id: own.id },
			select: { id: true },
		}),
	).toEqual({ id: own.id })
	expect(await sessionOn(userId, '2030-01-21')).toEqual([
		{ id: adopted!.id, source: 'generated', planOutlineId: outlineId },
	])
})

test('an Event too close, or with a plan of its own, is refused and nothing moves', async () => {
	const { userId, outlineId } = await setUp()
	const thisWeek = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: userId,
			name: 'Fredagsløpet',
			kind: 'race',
			priority: 'B',
			startDate: new Date('2030-01-11T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	expect(
		await attachEventToOutline(userId, outlineId, thisWeek.id, WEDNESDAY),
	).toEqual({ ok: false, reason: 'event-too-soon' })

	const planned = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: userId,
			name: 'Høstløpet',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-09-10T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	const other = await createPlanOutline(
		userId,
		{
			eventId: planned.id,
			startWeekKey: '2030-06-03',
			structure: { phases: [{ name: 'Base', weeks: 4 }] },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 30 }],
		},
		WEDNESDAY,
	)
	expect(other.ok).toBe(true)
	expect(
		await attachEventToOutline(userId, outlineId, planned.id, WEDNESDAY),
	).toEqual({ ok: false, reason: 'event-already-planned' })

	expect(
		await prisma.planOutlinePhase.findMany({
			where: { outlineId },
			orderBy: { orderIndex: 'asc' },
			select: { name: true, weeks: true },
		}),
	).toEqual([
		{ name: 'Blokk 1', weeks: 4 },
		{ name: 'Blokk 2', weeks: 4 },
	])
})

test('an Event only a week or two out still gets its taper', async () => {
	const { userId, outlineId } = await setUp()
	const soon = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: userId,
			name: 'Snart',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-01-20T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})

	const result = await attachEventToOutline(
		userId,
		outlineId,
		soon.id,
		WEDNESDAY,
	)

	expect(result).toMatchObject({
		ok: true,
		ended: { name: 'Blokk 1', weeks: 2 },
		phases: [{ name: 'Taper', weeks: 1 }],
	})
})
