import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { getSeasonForOutline } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
} from './authoring.server.ts'
import { readPhilosophySwitch, switchPhilosophy } from './philosophy.server.ts'
import { stampWeekPattern } from './stamp.server.ts'

// Seam 1 for switching philosophy (#505 stories 12–14): a plan, the weeks
// already on the calendar, a family and a clock go in; the phases, the
// preview and the sessions come out.
//
// The plans open Monday 31 Dec 2029. The switch is made on Wednesday 9 Jan —
// the plan's second week, begun — so the first week it may change is 14 Jan.

const OSLO = 'Europe/Oslo'
const PLAN_START = '2029-12-31'
const WEDNESDAY = new Date('2030-01-09T12:00:00Z')
const STAMPED = ['2029-12-31', '2030-01-07', '2030-01-14', '2030-01-21']

const wednesdayOf = (weekKey: string) => {
	const [y, mo, d] = weekKey.split('-').map(Number)
	// 07:00 in Oslo, the athlete's training time, in January (UTC+1).
	return new Date(Date.UTC(y!, mo! - 1, d! + 2, 6, 0))
}

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: { timezone: OSLO, defaultTrainingTime: '07:00' },
			},
		},
	})
}

/** A week pattern of one Wednesday run, stamped into `weeks`. */
async function stampWeeks(
	userId: string,
	outlineId: string,
	weeks: string[],
	weekdays: Array<0 | 1 | 2 | 3 | 4 | 5 | 6> = [2],
) {
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const added = await addWeekPattern(userId, { outlineId, name: 'Uke' })
	if (!added.ok) throw new Error(added.reason)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	for (const weekday of weekdays) {
		const day = await addWeekPatternDay(userId, {
			patternId: pattern.id,
			kind: 'share',
			trackId: track.id,
			weekday,
			weight: 1,
		})
		if (!day.ok) throw new Error(day.reason)
	}
	const stamped = await stampWeekPattern(
		userId,
		{ patternId: pattern.id, weekKeys: weeks, replace: false },
		new Date('2029-12-30T12:00:00Z'),
	)
	if (!stamped.ok) throw new Error(stamped.reason)
}

/** An open-ended plan of two four-week rounds, made before `family` existed. */
async function openEndedPlan(weekdays: Array<0 | 1 | 2 | 3 | 4 | 5 | 6> = [2]) {
	const user = await createAthlete()
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
	if (!created.ok) throw new Error(created.reason)
	await stampWeeks(user.id, created.outlineId, STAMPED, weekdays)
	return { userId: user.id, outlineId: created.outlineId }
}

async function sessionOn(userId: string, weekKey: string) {
	return prisma.workoutSession.findMany({
		where: { userId, scheduledAt: wednesdayOf(weekKey) },
		select: { id: true, source: true, planOutlineId: true },
	})
}

async function phasesOf(outlineId: string) {
	return prisma.planOutlinePhase.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: {
			name: true,
			weeks: true,
			rhythm: true,
			tapers: true,
			segments: {
				select: {
					ramp: true,
					mix: {
						select: { zone: true, sessionsPerWeek: true },
						orderBy: { zone: 'asc' },
					},
				},
			},
		},
	})
}

test('a switch keeps lived weeks and the athlete’s sessions, and lays the machine’s weeks ahead again on the new family', async () => {
	const { userId, outlineId } = await openEndedPlan()
	const lived = [
		await sessionOn(userId, '2029-12-31'),
		await sessionOn(userId, '2030-01-07'),
	]
	const [relaid] = await sessionOn(userId, '2030-01-14')
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

	const result = await switchPhilosophy(
		userId,
		outlineId,
		'polarized',
		WEDNESDAY,
	)

	expect(result).toMatchObject({
		ok: true,
		from: 'classic',
		to: 'polarized',
		fromWeekKey: '2030-01-14',
	})
	// Blokk 1 keeps the two weeks lived; Blokk 2 never began, so it goes, and
	// one round of polarized 80/20 follows: four weeks on 3:1, its climb, and
	// its mix — one very hard session a week, no threshold.
	expect(await phasesOf(outlineId)).toEqual([
		{
			name: 'Blokk 1',
			weeks: 2,
			rhythm: '3:1',
			tapers: false,
			segments: [{ ramp: null, mix: [] }],
		},
		{
			name: 'Blokk 2',
			weeks: 4,
			rhythm: '3:1',
			tapers: false,
			segments: [{ ramp: 0.05, mix: [{ zone: 5, sessionsPerWeek: 1 }] }],
		},
	])
	expect(
		(await prisma.planOutline.findUniqueOrThrow({ where: { id: outlineId } }))
			.family,
	).toBe('polarized')

	// The weeks lived are untouched.
	expect([
		await sessionOn(userId, '2029-12-31'),
		await sessionOn(userId, '2030-01-07'),
	]).toEqual(lived)
	// The machine's week ahead is laid again …
	const fresh = await sessionOn(userId, '2030-01-14')
	expect(fresh).toHaveLength(1)
	expect(fresh[0]!.id).not.toBe(relaid!.id)
	expect(fresh[0]).toMatchObject({
		source: 'generated',
		planOutlineId: outlineId,
	})
	// … the athlete's own session stays, and the week they took over keeps
	// their session and is not laid a second time beside it.
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

test('the preview writes nothing, and is what the switch then applies', async () => {
	const { userId, outlineId } = await openEndedPlan()
	const phasesBefore = await phasesOf(outlineId)
	const sessionsBefore = await prisma.workoutSession.findMany({
		where: { userId },
		select: { id: true, updatedAt: true },
		orderBy: { id: 'asc' },
	})

	const preview = await readPhilosophySwitch(
		userId,
		outlineId,
		'threshold',
		WEDNESDAY,
	)
	if (!preview.ok) throw new Error(preview.reason)

	// Pure: the plan and the calendar are as they were, and asking twice gives
	// the same answer.
	expect(await phasesOf(outlineId)).toEqual(phasesBefore)
	expect(
		await prisma.workoutSession.findMany({
			where: { userId },
			select: { id: true, updatedAt: true },
			orderBy: { id: 'asc' },
		}),
	).toEqual(sessionsBefore)
	expect(
		(await prisma.planOutline.findUniqueOrThrow({ where: { id: outlineId } }))
			.family,
	).toBeNull()
	expect(
		await readPhilosophySwitch(userId, outlineId, 'threshold', WEDNESDAY),
	).toEqual(preview)

	// What changes from 14 Jan: the rest of Blokk 1 and Blokk 2, before; one
	// round of threshold focus, after — tempo and threshold, no zone 5.
	expect(preview.phases.before.map((p) => [p.name, p.weeks])).toEqual([
		['Blokk 1', 2],
		['Blokk 2', 4],
	])
	expect(preview.phases.after).toEqual([
		{
			name: 'Blokk 2',
			weeks: 4,
			fromWeekKey: '2030-01-14',
			rhythm: '3:1',
			tapers: false,
			mix: [
				{ zone: 3, sessionsPerWeek: 1 },
				{ zone: 4, sessionsPerWeek: 1 },
			],
		},
	])

	const applied = await switchPhilosophy(
		userId,
		outlineId,
		'threshold',
		WEDNESDAY,
	)
	expect(applied).toEqual(preview)

	// The season the plan page reads afterwards is the one the preview showed,
	// week for week, target for target.
	const season = await getSeasonForOutline(userId, outlineId, WEDNESDAY)
	expect(season?.family).toBe('threshold')
	expect(season?.phases.map((p) => [p.name, p.weeks])).toEqual([
		['Blokk 1', 2],
		['Blokk 2', 4],
	])
	const after = preview.weeks.filter((week) => week.after != null)
	expect(after.map((week) => week.weekKey)).toEqual(
		season?.weeks.slice(2).map((week) => week.weekKey),
	)
	for (const week of after) {
		const read = season!.weeks.find((w) => w.weekKey === week.weekKey)!
		expect(read.targets.map((t) => t.value)).toEqual(
			week.after!.targets.map((t) => t.value),
		)
		expect(read.role).toBe(week.after!.role)
	}
})

test('a plan toward an Event switches from the first unbegun week and still ends on the Event’s week', async () => {
	const user = await createAthlete()
	// Race on Sunday 5 May 2030, in the plan's eighteenth week (29 Apr).
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			name: 'Vårløpet',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-05-05T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	const created = await createPlanOutline(
		user.id,
		{
			eventId: event.id,
			startWeekKey: PLAN_START,
			structure: { presetKey: 'classic-linear' },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
		},
		new Date('2029-12-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(created.reason)
	const outlineId = created.outlineId
	expect(
		(await prisma.planOutline.findUniqueOrThrow({ where: { id: outlineId } }))
			.family,
	).toBe('classic')

	// Wednesday 6 Feb: the plan's sixth week, still in its eight-week Base.
	const result = await switchPhilosophy(
		user.id,
		outlineId,
		'masters',
		new Date('2030-02-06T12:00:00Z'),
	)

	expect(result).toMatchObject({ ok: true, fromWeekKey: '2030-02-11' })
	// Base keeps the six weeks lived. Masters 2:1's season (Base 9, Build 6,
	// Peak 2, Taper 2) is fitted to the twelve weeks left: its Base gives, the
	// taper never.
	expect(
		(await phasesOf(outlineId)).map(({ name, weeks, rhythm, tapers }) => ({
			name,
			weeks,
			rhythm,
			tapers,
		})),
	).toEqual([
		{ name: 'Base', weeks: 6, rhythm: '3:1', tapers: false },
		{ name: 'Base', weeks: 2, rhythm: '2:1', tapers: false },
		{ name: 'Build', weeks: 6, rhythm: '2:1', tapers: false },
		{ name: 'Peak', weeks: 2, rhythm: 'none', tapers: false },
		{ name: 'Taper', weeks: 2, rhythm: 'none', tapers: true },
	])
	const season = await getSeasonForOutline(
		user.id,
		outlineId,
		new Date('2030-02-06T12:00:00Z'),
	)
	expect(season?.fit).toEqual({ kind: 'ends-on-event-week' })
	expect(season?.family).toBe('masters')
})

test('a switch to the family the plan follows, or on someone else’s plan, is refused and nothing moves', async () => {
	const { userId, outlineId } = await openEndedPlan()
	const before = await phasesOf(outlineId)

	expect(
		await switchPhilosophy(userId, outlineId, 'classic', WEDNESDAY),
	).toEqual({ ok: false, reason: 'same-family' })
	const stranger = await createAthlete()
	expect(
		await switchPhilosophy(stranger.id, outlineId, 'masters', WEDNESDAY),
	).toEqual({ ok: false, reason: 'outline-not-found' })

	expect(await phasesOf(outlineId)).toEqual(before)
})

test('a next round proposed on the old family is closed by the switch', async () => {
	const { userId, outlineId } = await openEndedPlan()
	const waiting = await prisma.weekReplanProposal.create({
		select: { id: true },
		data: {
			athleteId: userId,
			kind: 'add-phase',
			payload: JSON.stringify({
				kind: 'add-phase',
				outlineId,
				afterPhaseId: 'whatever',
				name: 'Blokk 3',
				weeks: 4,
				rhythm: '3:1',
				factor: 1,
			}),
			reason: 'Neste blokk.',
			loadDirection: 'keeps-or-reduces',
			targetWeekKey: '2030-01-28',
		},
	})

	await switchPhilosophy(userId, outlineId, 'masters', WEDNESDAY)

	expect(
		await prisma.weekReplanProposal.findUniqueOrThrow({
			where: { id: waiting.id },
			select: { answer: true, appliedAt: true },
		}),
	).toEqual({ answer: 'declined', appliedAt: null })
	// Masters' round is three weeks: two on, one easy.
	expect(
		(await phasesOf(outlineId)).map(({ name, weeks, rhythm }) => [
			name,
			weeks,
			rhythm,
		]),
	).toEqual([
		['Blokk 1', 2, '3:1'],
		['Blokk 2', 3, '2:1'],
	])
})

test('a week holding the athlete’s adopted session is laid again around it, at the new targets', async () => {
	// Tuesday and Thursday runs, every week.
	const { userId, outlineId } = await openEndedPlan([1, 3])
	const week = await prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: {
				gte: new Date('2030-01-20T23:00:00Z'),
				lt: new Date('2030-01-27T23:00:00Z'),
			},
		},
		orderBy: { scheduledAt: 'asc' },
		select: { id: true, scheduledAt: true },
	})
	expect(week).toHaveLength(2)
	const [tuesday, thursday] = week
	await prisma.workoutSession.update({
		where: { id: tuesday!.id },
		data: { adoptedAt: new Date('2030-01-05T12:00:00Z') },
	})

	const result = await switchPhilosophy(userId, outlineId, 'masters', WEDNESDAY)
	if (!result.ok) throw new Error(result.reason)

	const after = await prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: {
				gte: new Date('2030-01-20T23:00:00Z'),
				lt: new Date('2030-01-27T23:00:00Z'),
			},
		},
		orderBy: { scheduledAt: 'asc' },
		select: { id: true, scheduledAt: true, source: true },
	})
	// The adopted Tuesday stays and fills its slot; Thursday is the machine's,
	// so it is laid again at the new plan's target rather than left empty.
	expect(after).toHaveLength(2)
	expect(after[0]).toMatchObject({ id: tuesday!.id })
	expect(after[1]!.id).not.toBe(thursday!.id)
	expect(after[1]).toMatchObject({
		scheduledAt: thursday!.scheduledAt,
		source: 'generated',
	})
})

test('a Monday with a training session done in it is begun: the switch starts the week after', async () => {
	const { userId, outlineId } = await openEndedPlan()
	const MONDAY = new Date('2030-01-14T18:00:00Z')

	const untrained = await readPhilosophySwitch(
		userId,
		outlineId,
		'polarized',
		MONDAY,
	)
	expect(untrained).toMatchObject({ ok: true, fromWeekKey: '2030-01-14' })

	await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt: new Date('2030-01-14T06:00:00Z'),
			status: 'completed',
			source: 'authored',
		},
	})
	expect(
		await readPhilosophySwitch(userId, outlineId, 'polarized', MONDAY),
	).toMatchObject({ ok: true, fromWeekKey: '2030-01-21' })
})

test('a confirm whose preview no longer matches is refused, and nothing moves', async () => {
	const { userId, outlineId } = await openEndedPlan()
	const preview = await readPhilosophySwitch(
		userId,
		outlineId,
		'polarized',
		WEDNESDAY,
	)
	if (!preview.ok) throw new Error(preview.reason)
	const before = await phasesOf(outlineId)

	// A week later the switch would start a week later: not what was shown.
	expect(
		await switchPhilosophy(
			userId,
			outlineId,
			'polarized',
			new Date('2030-01-16T12:00:00Z'),
			{ digest: preview.digest },
		),
	).toEqual({ ok: false, reason: 'preview-stale' })
	expect(await phasesOf(outlineId)).toEqual(before)

	// The same preview, confirmed on time, applies.
	expect(
		await switchPhilosophy(userId, outlineId, 'polarized', WEDNESDAY, {
			digest: preview.digest,
		}),
	).toMatchObject({ ok: true, digest: preview.digest })
})

test('the preview warns where the new plan would rise more than 10 % in a week, and only from the switch on', async () => {
	const { userId, outlineId } = await openEndedPlan()

	// The family's own climb rises about 5 % a loading week: nothing to warn.
	const plain = await readPhilosophySwitch(
		userId,
		outlineId,
		'threshold',
		WEDNESDAY,
	)
	if (!plain.ok) throw new Error(plain.reason)
	expect(plain.warnings).toEqual([])

	// A week the athlete hand-set stays through the switch (a Week Volume
	// Override is kept), so the new round's second week now jumps from its
	// first. The preview says so, in the track's own unit; an equal jump in a
	// lived week is history, and is not warned on.
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	await prisma.weekVolumeOverride.createMany({
		data: [
			{ trackId: track.id, weekKey: '2030-01-07', value: 60 },
			{ trackId: track.id, weekKey: '2030-01-21', value: 60 },
		],
	})
	const preview = await readPhilosophySwitch(
		userId,
		outlineId,
		'threshold',
		WEDNESDAY,
	)
	if (!preview.ok) throw new Error(preview.reason)
	const first = preview.weeks.find((w) => w.weekKey === '2030-01-14')!
	expect(preview.warnings).toEqual([
		expect.objectContaining({
			trackId: track.id,
			currency: 'km',
			weekKey: '2030-01-21',
			fromWeekKey: '2030-01-14',
			from: first.after!.targets[0]!.value,
			to: 60,
		}),
	])
	expect(preview.warnings[0]!.rise).toBeGreaterThan(0.1)
})
