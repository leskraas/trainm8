import { expect, expectTypeOf, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { getActivePlan, getActiveSeason } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	type PlanOutlineUpdateInput,
	type TrackCreateInput,
} from './authoring-schema.ts'
import {
	addPhase,
	createFitnessGoalEvent,
	createPlanOutline,
	deletePlanOutline,
	listPlanAnchorCandidates,
	movePhase,
	removePhase,
	renamePhase,
	resizePhase,
	setPhaseRhythm,
	setSeasonAnchorValue,
} from './authoring.server.ts'

const NOW = new Date('2030-01-09T12:00:00Z') // a Wednesday
const START_WEEK_KEY = '2030-01-07' // its Monday

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

async function createRace(
	athleteId: string,
	overrides: {
		startDate?: Date
		endDate?: Date | null
		status?: string
		disciplines?: string[]
	} = {},
) {
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: overrides.startDate ?? new Date('2030-04-07T09:00:00Z'),
			endDate: overrides.endDate ?? null,
			status: overrides.status ?? 'planned',
			disciplines: JSON.stringify(overrides.disciplines ?? ['run']),
		},
	})
	return event.id
}

function planInput(eventId: string) {
	return {
		eventId,
		startWeekKey: START_WEEK_KEY,
		phases: [
			{ name: 'Base', weeks: 8 },
			{ name: 'Build', weeks: 4, rhythm: '2:1' as const },
			{ name: 'Taper', weeks: 1, rhythm: 'none' as const, tapers: true },
		],
		tracks: [
			{ discipline: 'run' as const, currency: 'km' as const, anchorValue: 55 },
		],
	}
}

test('creating an Outline stores the start week, the phases and the track', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)

	const result = await createPlanOutline(athleteId, planInput(eventId), NOW)

	expect(result).toEqual({ ok: true, outlineId: expect.any(String) })
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { eventId },
		select: {
			startWeekKey: true,
			phases: {
				orderBy: { orderIndex: 'asc' },
				select: {
					orderIndex: true,
					name: true,
					weeks: true,
					rhythm: true,
					tapers: true,
				},
			},
			tracks: {
				select: {
					discipline: true,
					currency: true,
					anchors: { select: { fromWeekKey: true, value: true } },
				},
			},
		},
	})

	expect(outline.startWeekKey).toBe(START_WEEK_KEY)
	expect(outline.phases).toEqual([
		{ orderIndex: 0, name: 'Base', weeks: 8, rhythm: '3:1', tapers: false },
		{ orderIndex: 1, name: 'Build', weeks: 4, rhythm: '2:1', tapers: false },
		{ orderIndex: 2, name: 'Taper', weeks: 1, rhythm: 'none', tapers: true },
	])
	expect(outline.tracks).toEqual([
		{
			discipline: 'run',
			currency: 'km',
			// The first anchor takes effect from the plan's own first week, and carries
			// no unit of its own (ADR 0043).
			anchors: [{ fromWeekKey: START_WEEK_KEY, value: 55 }],
		},
	])
})

test('phases are stored by position with no dates of their own', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)

	const phases = await prisma.planOutlinePhase.findMany({
		where: { outline: { eventId } },
		orderBy: { orderIndex: 'asc' },
		select: { orderIndex: true, weeks: true },
	})

	// Contiguity is a consequence of position-plus-count, not something validated:
	// there is no date pair here that could disagree with the phase before it.
	expect(phases.map((phase) => phase.orderIndex)).toEqual([0, 1, 2])
	expect(phases.reduce((sum, phase) => sum + phase.weeks, 0)).toBe(13)
})

test('another athlete’s Event cannot be planned against', async () => {
	const owner = await createAthlete()
	const intruder = await createAthlete()
	const eventId = await createRace(owner)

	const result = await createPlanOutline(intruder, planInput(eventId), NOW)

	expect(result).toEqual({ ok: false, reason: 'event-not-found' })
	expect(await prisma.planOutline.findUnique({ where: { eventId } })).toBeNull()
})

test('a past Event cannot anchor a new plan', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId, {
		startDate: new Date('2029-11-01T09:00:00Z'),
	})

	expect(await createPlanOutline(athleteId, planInput(eventId), NOW)).toEqual({
		ok: false,
		reason: 'event-past',
	})
})

test('a multi-day Event is still plannable until its end date passes', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId, {
		startDate: new Date('2030-01-05T09:00:00Z'),
		endDate: new Date('2030-01-12T18:00:00Z'),
	})

	expect(await createPlanOutline(athleteId, planInput(eventId), NOW)).toEqual({
		ok: true,
		outlineId: expect.any(String),
	})
})

test('a cancelled Event cannot anchor a plan', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId, { status: 'cancelled' })

	expect(await createPlanOutline(athleteId, planInput(eventId), NOW)).toEqual({
		ok: false,
		reason: 'event-cancelled',
	})
})

test('an Event that already carries an Outline refuses a second one', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)

	expect(await createPlanOutline(athleteId, planInput(eventId), NOW)).toEqual({
		ok: false,
		reason: 'event-already-planned',
	})
	expect(await prisma.planOutline.count({ where: { eventId } })).toBe(1)
})

test('two racing creates leave one plan, and the loser is told why', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)

	// Both calls read "no plan yet" before either writes; `PlanOutline.eventId` is
	// unique, so the loser's insert aborts. It comes back as the athlete-visible
	// refusal rather than as an exception.
	const results = await Promise.all([
		createPlanOutline(athleteId, planInput(eventId), NOW),
		createPlanOutline(athleteId, planInput(eventId), NOW),
	])

	expect(results.filter((result) => result.ok)).toHaveLength(1)
	expect(results.filter((result) => !result.ok)).toEqual([
		{ ok: false, reason: 'event-already-planned' },
	])
	expect(await prisma.planOutline.count({ where: { eventId } })).toBe(1)
})

test('a Plan Start Week that is not a Monday is refused', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)

	await expect(
		createPlanOutline(
			athleteId,
			{ ...planInput(eventId), startWeekKey: '2030-01-08' },
			NOW,
		),
	).rejects.toThrow(/Monday/)
})

test('a currency the discipline cannot author is refused', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)

	await expect(
		createPlanOutline(
			athleteId,
			{
				...planInput(eventId),
				tracks: [{ discipline: 'strength', currency: 'km', anchorValue: 20 }],
			},
			NOW,
		),
	).rejects.toThrow(/not one this discipline authors/)
})

test('two tracks for one discipline are refused', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)

	await expect(
		createPlanOutline(
			athleteId,
			{
				...planInput(eventId),
				tracks: [
					{ discipline: 'run', currency: 'km', anchorValue: 55 },
					{ discipline: 'run', currency: 'hours', anchorValue: 6 },
				],
			},
			NOW,
		),
	).rejects.toThrow(/One Training Track per discipline/)
})

test('a plan with no phases is refused', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)

	await expect(
		createPlanOutline(athleteId, { ...planInput(eventId), phases: [] }, NOW),
	).rejects.toThrow(/at least one phase/)
})

test('a refused create leaves nothing behind', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)

	await expect(
		createPlanOutline(
			athleteId,
			{ ...planInput(eventId), phases: [{ name: 'Base', weeks: 0 }] },
			NOW,
		),
	).rejects.toThrow()

	expect(await prisma.planOutline.count({ where: { eventId } })).toBe(0)
	expect(await prisma.trainingTrack.count()).toBe(0)
})

test('the goal Event is created as a dated fitness-goal, visibly', async () => {
	const athleteId = await createAthlete()

	const goal = await createFitnessGoalEvent(athleteId, {
		name: 'Sub-40 10k shape',
		startDate: new Date('2030-06-01T09:00:00Z'),
		disciplines: ['run'],
	})

	const event = await prisma.event.findUniqueOrThrow({
		where: { id: goal.id },
		select: {
			athleteId: true,
			name: true,
			kind: true,
			priority: true,
			startDate: true,
			status: true,
			disciplines: true,
		},
	})
	expect(event).toEqual({
		athleteId,
		name: 'Sub-40 10k shape',
		kind: 'fitness-goal',
		priority: 'A',
		startDate: new Date('2030-06-01T09:00:00Z'),
		status: 'planned',
		disciplines: JSON.stringify(['run']),
	})
})

test('the anchor candidates are the athlete’s own upcoming Events', async () => {
	const athleteId = await createAthlete()
	const other = await createAthlete()
	const upcoming = await createRace(athleteId)
	await createRace(athleteId, { startDate: new Date('2029-01-01T09:00:00Z') })
	await createRace(athleteId, { status: 'cancelled' })
	await createRace(other)

	const candidates = await listPlanAnchorCandidates(athleteId, NOW)

	expect(candidates.map((candidate) => candidate.id)).toEqual([upcoming])
	expect(candidates[0]).toMatchObject({
		disciplines: ['run'],
		plannedOutlineId: null,
	})
})

test('a candidate that already has a plan is offered with its plan named', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	const created = await createPlanOutline(athleteId, planInput(eventId), NOW)

	const [candidate] = await listPlanAnchorCandidates(athleteId, NOW)

	// Offered rather than hidden, so the surface can say "this already has a plan"
	// instead of losing the Event the athlete came looking for.
	expect(candidate?.plannedOutlineId).toBe(
		created.ok ? created.outlineId : null,
	)
})

test('setting a Season Anchor’s value changes the value and nothing else', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outline: { eventId } },
		select: { id: true, currency: true },
	})

	const result = await setSeasonAnchorValue(athleteId, {
		trackId: track.id,
		fromWeekKey: START_WEEK_KEY,
		value: 61,
	})

	expect(result).toEqual({ ok: true })
	const after = await prisma.trainingTrack.findUniqueOrThrow({
		where: { id: track.id },
		select: {
			currency: true,
			anchors: { select: { fromWeekKey: true, value: true } },
		},
	})
	expect(after.anchors).toEqual([{ fromWeekKey: START_WEEK_KEY, value: 61 }])
	expect(after.currency).toBe('km')
})

test('a re-anchor from a later week adds a segment rather than moving the first', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outline: { eventId } },
		select: { id: true },
	})

	await setSeasonAnchorValue(athleteId, {
		trackId: track.id,
		fromWeekKey: '2030-02-04',
		value: 44,
	})

	const anchors = await prisma.seasonAnchorSegment.findMany({
		where: { trackId: track.id },
		orderBy: { fromWeekKey: 'asc' },
		select: { fromWeekKey: true, value: true },
	})
	// Lowering volume from a chosen week never rewrites the weeks before it
	// (ADR 0040 §5).
	expect(anchors).toEqual([
		{ fromWeekKey: START_WEEK_KEY, value: 55 },
		{ fromWeekKey: '2030-02-04', value: 44 },
	])
})

test('another athlete cannot re-anchor a track', async () => {
	const owner = await createAthlete()
	const intruder = await createAthlete()
	const eventId = await createRace(owner)
	await createPlanOutline(owner, planInput(eventId), NOW)
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outline: { eventId } },
		select: { id: true },
	})

	expect(
		await setSeasonAnchorValue(intruder, {
			trackId: track.id,
			fromWeekKey: START_WEEK_KEY,
			value: 999,
		}),
	).toEqual({ ok: false, reason: 'track-not-found' })
	const anchor = await prisma.seasonAnchorSegment.findFirstOrThrow({
		where: { trackId: track.id },
		select: { value: true },
	})
	expect(anchor.value).toBe(55)
})

test('a plan authored here lights up the Plan card and the projection', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(
		athleteId,
		{
			...planInput(eventId),
			// Hours converts to projectable TSS with the machinery that exists today;
			// the mix-aware conversion that gives a km track a curve is #385's.
			tracks: [{ discipline: 'run', currency: 'hours', anchorValue: 6 }],
		},
		NOW,
	)

	const plan = await getActivePlan(athleteId, NOW)

	expect(plan?.eventId).toBe(eventId)
	expect(plan?.phases.map((phase) => phase.name)).toEqual([
		'Base',
		'Build',
		'Taper',
	])
	expect(plan?.weeklyTss).toHaveLength(13)
	expect(plan?.weeklyTss[0]).toBeGreaterThan(0)
})

// ── ADR 0044 §8: the Volume Currency lock ────────────────────────────────────
// `currency` is in the create input and in no update input, "so changing it is a
// compile error rather than a runtime check". Both halves are asserted: the type
// level below, and the runtime rejection after it.

test('the create input carries currency and no update input does', () => {
	expectTypeOf<TrackCreateInput>().toHaveProperty('currency')
	expectTypeOf<
		'currency' extends keyof PlanOutlineUpdateInput ? true : false
	>().toEqualTypeOf<false>()
})

test('an update input carrying currency does not compile', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outline: { eventId } },
		select: { id: true },
	})

	await expect(
		setSeasonAnchorValue(athleteId, {
			trackId: track.id,
			fromWeekKey: START_WEEK_KEY,
			value: 61,
			// @ts-expect-error ADR 0044 §8 — no update input carries `currency`.
			currency: 'hours',
		}),
	).rejects.toThrow()

	// And the runtime half: the write is refused outright rather than the stray key
	// being dropped, so a form body cannot smuggle a currency change through.
	const after = await prisma.trainingTrack.findUniqueOrThrow({
		where: { id: track.id },
		select: {
			currency: true,
			anchors: { select: { value: true } },
		},
	})
	expect(after.currency).toBe('km')
	expect(after.anchors).toEqual([{ value: 55 }])
})

// ── The structure is the athlete's: #402 ─────────────────────────────────────
// Every edit below is one action on one phase, and every one of them is checked
// against the same two invariants: the positions stay contiguous, and the **Plan
// Start Week** does not move. Nothing per week is stored, so the season's targets
// are re-derived by the read rather than migrated by the write.

/** A three-phase plan — Base(8) · Build(4) · Taper(1) — and its ids. */
async function authoredPlan() {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	const created = await createPlanOutline(athleteId, planInput(eventId), NOW)
	if (!created.ok) throw new Error(`plan not created: ${created.reason}`)
	const phases = await storedPhases(created.outlineId)
	return {
		athleteId,
		eventId,
		outlineId: created.outlineId,
		phaseIds: phases.map((phase) => phase.id),
	}
}

async function storedPhases(outlineId: string) {
	return prisma.planOutlinePhase.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: {
			id: true,
			orderIndex: true,
			name: true,
			weeks: true,
			rhythm: true,
			tapers: true,
		},
	})
}

/** The season as a reader sees it, so an edit is judged by what it derives. */
async function readSeason(athleteId: string) {
	const season = await getActiveSeason(athleteId, NOW)
	if (!season) throw new Error('no active season')
	return season
}

test('a phase is added at a position, and the phases after it slide', async () => {
	const { athleteId, outlineId, phaseIds } = await authoredPlan()

	const added = await addPhase(athleteId, {
		outlineId,
		atIndex: 1,
		name: 'Sharpen',
		weeks: 3,
		rhythm: '2:1',
	})

	expect(added).toEqual({ ok: true, phaseId: expect.any(String) })
	const phases = await storedPhases(outlineId)
	expect(phases.map((phase) => [phase.orderIndex, phase.name])).toEqual([
		[0, 'Base'],
		[1, 'Sharpen'],
		[2, 'Build'],
		[3, 'Taper'],
	])
	// The phases that slid are the *same rows* — an insert renumbers, it does not
	// rewrite the season.
	expect(phases[2]!.id).toBe(phaseIds[1])
})

test('a position past the last phase appends rather than refusing', async () => {
	const { athleteId, outlineId } = await authoredPlan()

	await addPhase(athleteId, {
		outlineId,
		atIndex: 99,
		name: 'Off-season',
		weeks: 2,
	})

	const phases = await storedPhases(outlineId)
	expect(phases.map((phase) => phase.orderIndex)).toEqual([0, 1, 2, 3])
	expect(phases[3]!.name).toBe('Off-season')
})

test('adding a phase never moves the Plan Start Week', async () => {
	const { athleteId, outlineId } = await authoredPlan()

	await addPhase(athleteId, { outlineId, atIndex: 0, name: 'Prep', weeks: 4 })

	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: outlineId },
		select: { startWeekKey: true },
	})
	// A phase inserted *before* every other one is the case that would move a
	// derived start. The start is authored, so the season grows forward instead.
	expect(outline.startWeekKey).toBe(START_WEEK_KEY)
	const season = await readSeason(athleteId)
	expect(season.phases[0]!.fromWeekKey).toBe(START_WEEK_KEY)
	expect(season.weeks).toHaveLength(17)
})

test('a phase name is free text and takes names outside base/build/peak', async () => {
	const { athleteId, phaseIds } = await authoredPlan()

	expect(
		await renamePhase(athleteId, {
			phaseId: phaseIds[0]!,
			name: '  Return to run  ',
		}),
	).toEqual({ ok: true })

	const phase = await prisma.planOutlinePhase.findUniqueOrThrow({
		where: { id: phaseIds[0]! },
		select: { name: true },
	})
	expect(phase.name).toBe('Return to run')
})

test('resizing a phase slides the ones after it and holds the start week', async () => {
	const { athleteId, outlineId, phaseIds } = await authoredPlan()
	const before = await readSeason(athleteId)
	expect(before.weeks).toHaveLength(13)
	expect(before.weeks[8]!.phaseIndex).toBe(1)

	expect(
		await resizePhase(athleteId, { phaseId: phaseIds[0]!, weeks: 10 }),
	).toEqual({ ok: true })

	const after = await readSeason(athleteId)
	expect(after.startWeekKey).toBe(START_WEEK_KEY)
	expect(after.weeks).toHaveLength(15)
	// Week 9 was Build's first week and is now Base's ninth: the phases after the
	// resized one moved because none of them stores a date of its own.
	expect(after.weeks[8]!.phaseIndex).toBe(0)
	expect(after.phases[1]!.fromWeekInPlan).toBe(11)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: outlineId },
		select: { startWeekKey: true },
	})
	expect(outline.startWeekKey).toBe(START_WEEK_KEY)
})

test('per-week targets recompute after a structural edit, with none stored', async () => {
	const { athleteId, phaseIds } = await authoredPlan()
	const before = await readSeason(athleteId)
	// Week 4 closes Base's first 3:1 block, so it is a recovery week.
	expect(before.weeks[3]!.role).toBe('recovery')

	await setPhaseRhythm(athleteId, {
		phaseId: phaseIds[0]!,
		rhythm: '2:1',
		tapers: false,
	})

	const after = await readSeason(athleteId)
	// The same calendar week reads differently because the *rule* changed — there
	// was no stored week value to migrate or to go stale (ADR 0040 §1).
	expect(after.weeks[2]!.role).toBe('recovery')
	expect(after.weeks[3]!.role).toBe('loading')
	expect(after.weeks[3]!.targets[0]!.value).not.toBe(
		before.weeks[3]!.targets[0]!.value,
	)
})

test('rhythm and the taper flag are authored per phase, not per season', async () => {
	const { athleteId, outlineId, phaseIds } = await authoredPlan()

	await setPhaseRhythm(athleteId, {
		phaseId: phaseIds[1]!,
		rhythm: 'none',
		tapers: true,
	})

	const phases = await storedPhases(outlineId)
	expect(phases.map((phase) => [phase.rhythm, phase.tapers])).toEqual([
		// Base keeps the rhythm it was authored with: one phase's recovery is its own.
		['3:1', false],
		['none', true],
		['none', true],
	])
})

test('a phase moves one position at a time, and the ends refuse', async () => {
	const { athleteId, outlineId, phaseIds } = await authoredPlan()

	expect(
		await movePhase(athleteId, { phaseId: phaseIds[2]!, direction: 'earlier' }),
	).toEqual({ ok: true })

	expect((await storedPhases(outlineId)).map((phase) => phase.name)).toEqual([
		'Base',
		'Taper',
		'Build',
	])

	expect(
		await movePhase(athleteId, { phaseId: phaseIds[0]!, direction: 'earlier' }),
	).toEqual({ ok: false, reason: 'at-the-edge' })
	expect(
		await movePhase(athleteId, { phaseId: phaseIds[1]!, direction: 'later' }),
	).toEqual({ ok: false, reason: 'at-the-edge' })
	expect((await storedPhases(outlineId)).map((phase) => phase.name)).toEqual([
		'Base',
		'Taper',
		'Build',
	])
})

test('removing a phase closes the gap it leaves', async () => {
	const { athleteId, outlineId, phaseIds } = await authoredPlan()

	expect(await removePhase(athleteId, { phaseId: phaseIds[1]! })).toEqual({
		ok: true,
	})

	const phases = await storedPhases(outlineId)
	expect(phases.map((phase) => [phase.orderIndex, phase.name])).toEqual([
		[0, 'Base'],
		[1, 'Taper'],
	])
	const season = await readSeason(athleteId)
	expect(season.weeks).toHaveLength(9)
	expect(season.phases[1]!.fromWeekInPlan).toBe(9)
})

test('the only phase cannot be removed — a plan has at least one', async () => {
	const { athleteId, outlineId, phaseIds } = await authoredPlan()
	await removePhase(athleteId, { phaseId: phaseIds[1]! })
	await removePhase(athleteId, { phaseId: phaseIds[2]! })

	expect(await removePhase(athleteId, { phaseId: phaseIds[0]! })).toEqual({
		ok: false,
		reason: 'last-phase',
	})
	expect(await storedPhases(outlineId)).toHaveLength(1)
})

test('no edit can grow the season past the longest plan the surface authors', async () => {
	const { athleteId, outlineId, phaseIds } = await authoredPlan()
	// 13 weeks authored; four 24-week phases would put it past 104.
	for (const index of [0, 1, 2, 3]) {
		await addPhase(athleteId, {
			outlineId,
			atIndex: index,
			name: `Block ${index}`,
			weeks: 22,
		})
	}

	expect(
		await addPhase(athleteId, {
			outlineId,
			atIndex: 0,
			name: 'More',
			weeks: 4,
		}),
	).toEqual({ ok: false, reason: 'plan-too-long' })
	expect(
		await resizePhase(athleteId, { phaseId: phaseIds[0]!, weeks: 52 }),
	).toEqual({ ok: false, reason: 'plan-too-long' })
	const phases = await storedPhases(outlineId)
	expect(phases).toHaveLength(7)
	expect(phases.reduce((sum, phase) => sum + phase.weeks, 0)).toBe(101)
})

test('another athlete cannot edit or reorder or remove a phase', async () => {
	const { outlineId, phaseIds } = await authoredPlan()
	const intruder = await createAthlete()
	const before = await storedPhases(outlineId)

	// A row that is not the caller's reads as absent rather than as forbidden: the
	// intruder learns nothing about another athlete's season.
	expect(
		await addPhase(intruder, {
			outlineId,
			atIndex: 0,
			name: 'Theirs',
			weeks: 2,
		}),
	).toEqual({ ok: false, reason: 'outline-not-found' })
	expect(
		await renamePhase(intruder, { phaseId: phaseIds[0]!, name: 'Theirs' }),
	).toEqual({ ok: false, reason: 'phase-not-found' })
	expect(
		await resizePhase(intruder, { phaseId: phaseIds[0]!, weeks: 2 }),
	).toEqual({ ok: false, reason: 'phase-not-found' })
	expect(
		await setPhaseRhythm(intruder, {
			phaseId: phaseIds[0]!,
			rhythm: 'none',
			tapers: true,
		}),
	).toEqual({ ok: false, reason: 'phase-not-found' })
	expect(
		await movePhase(intruder, { phaseId: phaseIds[2]!, direction: 'earlier' }),
	).toEqual({ ok: false, reason: 'phase-not-found' })
	expect(await removePhase(intruder, { phaseId: phaseIds[1]! })).toEqual({
		ok: false,
		reason: 'phase-not-found',
	})

	expect(await storedPhases(outlineId)).toEqual(before)
})

test('deleting the plan removes the Outline and leaves the Event and its sessions', async () => {
	const { athleteId, eventId, outlineId } = await authoredPlan()
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: athleteId,
			scheduledAt: new Date('2030-01-08T06:00:00Z'),
			status: 'completed',
			targetEventId: eventId,
		},
	})

	expect(await deletePlanOutline(athleteId, { outlineId })).toEqual({
		ok: true,
	})

	expect(
		await prisma.planOutline.findUnique({ where: { id: outlineId } }),
	).toBeNull()
	// The Outline's own children go with it, and nothing else does: an Event with
	// no Outline is a calendar marker the read path already handles.
	expect(await prisma.trainingTrack.count({ where: { outlineId } })).toBe(0)
	expect(
		await prisma.event.findUnique({
			where: { id: eventId },
			select: { name: true, status: true },
		}),
	).toEqual({ name: 'Spring Half Marathon', status: 'planned' })
	expect(
		await prisma.workoutSession.findUnique({
			where: { id: session.id },
			select: { targetEventId: true, status: true },
		}),
	).toEqual({ targetEventId: eventId, status: 'completed' })
	expect(await getActivePlan(athleteId, NOW)).toBeNull()
})

test('another athlete cannot delete a plan', async () => {
	const { outlineId } = await authoredPlan()
	const intruder = await createAthlete()

	expect(await deletePlanOutline(intruder, { outlineId })).toEqual({
		ok: false,
		reason: 'outline-not-found',
	})
	expect(
		await prisma.planOutline.findUnique({ where: { id: outlineId } }),
	).not.toBeNull()
})
