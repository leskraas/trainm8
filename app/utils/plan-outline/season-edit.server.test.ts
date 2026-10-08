import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	getActivePlan,
	getSeasonForOutline,
} from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
} from './authoring.server.ts'
import { applySeasonEdit, readSeasonEdit } from './season-edit.server.ts'
import { type SeasonEdit } from './season-edit.ts'
import { stampWeekPattern } from './stamp.server.ts'
import { getWeekVolumes } from './week-volumes.server.ts'

// Seam 1 for the Sesong edits (#505 stories 72–77): a plan, the weeks already
// on the calendar, an edit and a clock go in; the preview, the plan and the
// sessions come out.
//
// The plan opens Monday 31 Dec 2029: two four-week blocks on 3:1 at a flat
// 30 km. The edits are made on Wednesday 9 Jan — the plan's second week,
// begun — so the first week an edit may change is 14 Jan.

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

/** An open-ended plan with one Wednesday run a week, stamped into four weeks. */
async function plan() {
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
		{ patternId: pattern.id, weekKeys: STAMPED, replace: false },
		new Date('2029-12-30T12:00:00Z'),
	)
	if (!stamped.ok) throw new Error(stamped.reason)
	return { userId: user.id, outlineId, trackId: track.id }
}

async function sessionsOn(userId: string, weekKey: string) {
	return prisma.workoutSession.findMany({
		where: { userId, scheduledAt: wednesdayOf(weekKey) },
		select: { id: true, source: true },
	})
}

/** The preview the athlete sees, then the apply confirmed from it. */
async function previewThenApply(
	userId: string,
	outlineId: string,
	edit: SeasonEdit,
) {
	const preview = await readSeasonEdit(userId, outlineId, edit, WEDNESDAY)
	if (!preview.ok) return preview
	return applySeasonEdit(userId, outlineId, edit, WEDNESDAY, {
		digest: preview.digest,
	})
}

async function plannedKm(userId: string, weekKey: string) {
	const volumes = await getWeekVolumes(userId, { weekKey, now: WEDNESDAY })
	return volumes.tracks[0]?.planned
}

test('a new week target lays that week again at it, keeps the athlete’s session, and leaves the other weeks alone', async () => {
	const { userId, outlineId, trackId } = await plan()
	const [machine] = await sessionsOn(userId, '2030-01-14')
	const nextWeek = await sessionsOn(userId, '2030-01-21')
	// The athlete wrote a session of their own into the week of 14 Jan.
	const own = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			scheduledAt: new Date('2030-01-15T16:00:00Z'),
			status: 'scheduled',
			source: 'authored',
		},
	})
	expect(await plannedKm(userId, '2030-01-14')).toBe(30)

	const edit = {
		kind: 'week-target' as const,
		trackId,
		weekKey: '2030-01-14',
		value: 34,
	}
	const preview = await readSeasonEdit(userId, outlineId, edit, WEDNESDAY)
	if (!preview.ok) throw new Error(preview.reason)
	// +13 % over the loading week before it: the preview says so.
	expect(preview.warnings).toEqual([
		expect.objectContaining({ weekKey: '2030-01-14', from: 30, to: 34 }),
	])
	expect(preview.held).toEqual(['phase', 'other-weeks'])

	const applied = await applySeasonEdit(userId, outlineId, edit, WEDNESDAY, {
		digest: preview.digest,
	})
	expect(applied).toEqual(preview)

	expect(
		await prisma.weekVolumeOverride.findMany({
			where: { trackId },
			select: { weekKey: true, value: true },
		}),
	).toEqual([{ weekKey: '2030-01-14', value: 34 }])
	// The machine's session in that week is laid again, at the new target …
	const relaid = await sessionsOn(userId, '2030-01-14')
	expect(relaid).toHaveLength(1)
	expect(relaid[0]!.id).not.toBe(machine!.id)
	expect(relaid[0]!.source).toBe('generated')
	expect(await plannedKm(userId, '2030-01-14')).toBe(34)
	// … the athlete's own session stays, and the week the edit did not touch
	// keeps the very sessions it had.
	expect(
		await prisma.workoutSession.findUnique({
			where: { id: own.id },
			select: { id: true },
		}),
	).toEqual({ id: own.id })
	expect(await sessionsOn(userId, '2030-01-21')).toEqual(nextWeek)
})

test('a stale preview is refused and nothing is written', async () => {
	const { userId, outlineId, trackId } = await plan()
	const edit = {
		kind: 'week-target' as const,
		trackId,
		weekKey: '2030-01-14',
		value: 34,
	}
	const preview = await readSeasonEdit(userId, outlineId, edit, WEDNESDAY)
	if (!preview.ok) throw new Error(preview.reason)
	// Another tab hand-sets the week before it after the preview was shown, so
	// the rise the preview warned about is no longer the one that would land.
	await prisma.weekVolumeOverride.create({
		data: { trackId, weekKey: '2030-01-07', value: 33 },
	})
	const [machine] = await sessionsOn(userId, '2030-01-14')

	expect(
		await applySeasonEdit(userId, outlineId, edit, WEDNESDAY, {
			digest: preview.digest,
		}),
	).toEqual({ ok: false, reason: 'preview-stale' })
	expect(
		await prisma.weekVolumeOverride.findMany({
			where: { trackId, weekKey: '2030-01-14' },
		}),
	).toEqual([])
	expect(await sessionsOn(userId, '2030-01-14')).toEqual([
		{ id: machine!.id, source: 'generated' },
	])
})

test('another athlete’s plan reads as not found', async () => {
	const { outlineId, trackId } = await plan()
	const stranger = await createAthlete()
	expect(
		await readSeasonEdit(
			stranger.id,
			outlineId,
			{ kind: 'week-target', trackId, weekKey: '2030-01-14', value: 34 },
			WEDNESDAY,
		),
	).toEqual({ ok: false, reason: 'outline-not-found' })
})

test('a chosen easy week is stored, read by home and the season, and its weeks laid again', async () => {
	const { userId, outlineId } = await plan()
	const [machine] = await sessionsOn(userId, '2030-01-14')
	const edit = { kind: 'easy-week' as const, weekKey: '2030-01-14' }
	const preview = await readSeasonEdit(userId, outlineId, edit, WEDNESDAY)
	if (!preview.ok) throw new Error(preview.reason)
	expect(preview.relayWeekKeys).toEqual(['2030-01-14', '2030-01-21'])

	const applied = await applySeasonEdit(userId, outlineId, edit, WEDNESDAY, {
		digest: preview.digest,
	})
	expect(applied.ok).toBe(true)

	const phases = await prisma.planOutlinePhase.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: { name: true, recoveryWeekIndex: true },
	})
	expect(phases).toEqual([
		{ name: 'Blokk 1', recoveryWeekIndex: 2 },
		{ name: 'Blokk 2', recoveryWeekIndex: null },
	])
	// Home (S9 week roles) and the season chart read the same rhythm.
	const active = await getActivePlan(userId, WEDNESDAY)
	expect(active?.weekRoles.slice(0, 4)).toEqual([
		'loading',
		'loading',
		'recovery',
		'loading',
	])
	const season = await getSeasonForOutline(userId, outlineId, WEDNESDAY)
	expect(season?.weeks.slice(0, 4).map((week) => week.role)).toEqual([
		'loading',
		'loading',
		'recovery',
		'loading',
	])
	// The new easy week is laid again at its cut target.
	const relaid = await sessionsOn(userId, '2030-01-14')
	expect(relaid[0]!.id).not.toBe(machine!.id)
	expect(await plannedKm(userId, '2030-01-14')).toBe(21)
	expect(await plannedKm(userId, '2030-01-21')).toBe(30)
})

test('a phase renamed and lengthened lands as previewed; a rename alone lays nothing again', async () => {
	const { userId, outlineId } = await plan()
	const phase = await prisma.planOutlinePhase.findFirstOrThrow({
		where: { outlineId, orderIndex: 1 },
		select: { id: true },
	})
	const before = await prisma.workoutSession.findMany({
		where: { userId },
		select: { id: true },
		orderBy: { id: 'asc' },
	})

	const renamed = await previewThenApply(userId, outlineId, {
		kind: 'phase',
		phaseId: phase.id,
		name: 'Bygg',
		weeks: null,
		rhythm: null,
		tapers: null,
	})
	expect(renamed).toMatchObject({
		ok: true,
		held: ['phase-length', 'week-targets'],
		relayWeekKeys: [],
	})
	expect(
		await prisma.workoutSession.findMany({
			where: { userId },
			select: { id: true },
			orderBy: { id: 'asc' },
		}),
	).toEqual(before)

	const resized = await previewThenApply(userId, outlineId, {
		kind: 'phase',
		phaseId: phase.id,
		name: null,
		weeks: 6,
		rhythm: null,
		tapers: null,
	})
	expect(resized).toMatchObject({
		ok: true,
		held: ['phase-name', 'plan-start', 'other-phases'],
	})
	const season = await getSeasonForOutline(userId, outlineId, WEDNESDAY)
	expect(season?.phases.map((p) => [p.name, p.weeks])).toEqual([
		['Blokk 1', 4],
		['Bygg', 6],
	])
})

test('back to the plan’s target removes the override and lays the week again at the plan’s number', async () => {
	const { userId, outlineId, trackId } = await plan()
	const edit = {
		kind: 'week-target' as const,
		trackId,
		weekKey: '2030-01-14',
		value: 34,
	}
	expect((await previewThenApply(userId, outlineId, edit)).ok).toBe(true)
	expect(await plannedKm(userId, '2030-01-14')).toBe(34)

	const reverted = await previewThenApply(userId, outlineId, {
		...edit,
		value: null,
	})
	expect(reverted).toMatchObject({
		ok: true,
		summary: { before: 34, after: 30, revert: true },
	})
	expect(
		await prisma.weekVolumeOverride.findMany({ where: { trackId } }),
	).toEqual([])
	expect(await plannedKm(userId, '2030-01-14')).toBe(30)
})

test('a new rhythm lands behind its preview and clears the easy week chosen under the old one', async () => {
	const { userId, outlineId } = await plan()
	const phase = await prisma.planOutlinePhase.findFirstOrThrow({
		where: { outlineId, orderIndex: 1 },
		select: { id: true },
	})
	expect(
		(
			await previewThenApply(userId, outlineId, {
				kind: 'easy-week',
				weekKey: '2030-02-04',
			})
		).ok,
	).toBe(true)
	expect(
		await prisma.planOutlinePhase.findUniqueOrThrow({
			where: { id: phase.id },
			select: { recoveryWeekIndex: true },
		}),
	).toEqual({ recoveryWeekIndex: 1 })

	const changed = await previewThenApply(userId, outlineId, {
		kind: 'phase',
		phaseId: phase.id,
		name: null,
		weeks: null,
		rhythm: '2:1',
		tapers: null,
	})
	expect(changed.ok).toBe(true)
	expect(
		await prisma.planOutlinePhase.findUniqueOrThrow({
			where: { id: phase.id },
			select: { rhythm: true, recoveryWeekIndex: true },
		}),
	).toEqual({ rhythm: '2:1', recoveryWeekIndex: null })
})
