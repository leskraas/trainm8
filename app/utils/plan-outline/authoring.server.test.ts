import { describe, expect, expectTypeOf, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { getActivePlan, getActiveSeason } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	type PlanOutlineUpdateInput,
	type TrackCreateInput,
} from './authoring-schema.ts'
import {
	addPhase,
	addStrengthSegment,
	addWeekPattern,
	addWeekPatternDay,
	applyPreset,
	clearWeekVolumeOverride,
	createFitnessGoalEvent,
	createPlanOutline,
	deletePlanOutline,
	listPlanAnchorCandidates,
	movePhase,
	moveWeekPattern,
	moveWeekPatternDay,
	removePhase,
	removeStrengthSegment,
	removeWeekPattern,
	removeWeekPatternDay,
	renamePhase,
	renameWeekPattern,
	resizePhase,
	setEnduranceSegment,
	setPhaseRhythm,
	setQualitySessionMix,
	setSeasonAnchorValue,
	setStrengthSegment,
	setWeekVolumeOverride,
} from './authoring.server.ts'
import { DEFAULT_DELOAD_CUT, DEFAULT_DELOAD_WEEKS } from './derive.ts'
import { presetFor, presetWeeks, type PeriodizationPreset } from './presets.ts'

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

// ── Endurance segments: the progression the athlete authors (ADR 0040) ────────

/** The segments of the plan `planInput` authors, in phase order. */
async function segmentsOf(eventId: string) {
	return prisma.trainingTrackSegment.findMany({
		where: { track: { outline: { eventId } } },
		orderBy: { phase: { orderIndex: 'asc' } },
		select: {
			id: true,
			kind: true,
			ramp: true,
			boundaryStep: true,
			recoveryCut: true,
			taperCut: true,
			phase: { select: { name: true } },
		},
	})
}

test('an endurance track gets one segment per phase, all rates unset', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)

	const segments = await segmentsOf(eventId)

	// One per phase, 1:1 (ADR 0042 §8), so the progression is authorable the moment
	// the plan exists.
	expect(segments.map((segment) => segment.phase?.name)).toEqual([
		'Base',
		'Build',
		'Taper',
	])
	// Every rate opens **unset**: an unset cut means "follow the documented
	// convention", and storing the convention's own number would make the two
	// indistinguishable (ADR 0044 §4).
	expect(segments.map((segment) => segment.ramp)).toEqual([null, null, null])
	expect(segments.map((segment) => segment.recoveryCut)).toEqual([
		null,
		null,
		null,
	])
})

test('a strength track gets no phase-bound segment, since its own float free', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId, { disciplines: ['strength'] })
	await createPlanOutline(
		athleteId,
		{
			...planInput(eventId),
			tracks: [{ discipline: 'strength', currency: 'sets', anchorValue: 18 }],
		},
		NOW,
	)

	expect(await segmentsOf(eventId)).toEqual([])
})

test('authoring a segment stores the ramp, the step and both cuts', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)

	const result = await setEnduranceSegment(athleteId, {
		segmentId: base!.id,
		ramp: 0.05,
		boundaryStep: -0.2,
		recoveryCut: 0.25,
		taperCut: null,
	})

	expect(result).toEqual({ ok: true })
	const [after] = await segmentsOf(eventId)
	expect(after).toMatchObject({
		ramp: 0.05,
		boundaryStep: -0.2,
		recoveryCut: 0.25,
		// Left unset, and stored as unset rather than as −50%: the convention moving
		// later must not move a number the athlete never typed (ADR 0044 §4).
		taperCut: null,
	})
})

test('a cut can be cleared back to the convention', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)
	const authored = {
		segmentId: base!.id,
		ramp: 0.05,
		boundaryStep: null,
		recoveryCut: 0.3,
		taperCut: 0.4,
	}
	await setEnduranceSegment(athleteId, authored)

	await setEnduranceSegment(athleteId, {
		...authored,
		recoveryCut: null,
		taperCut: null,
	})

	// An authored −30% and the convention's own −30% are different states, so
	// clearing has to be expressible — a partial update could not say it.
	const [after] = await segmentsOf(eventId)
	expect(after).toMatchObject({ recoveryCut: null, taperCut: null })
})

test('a ramp steeper than the guard’s convention is stored, not refused', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)

	// The guard warns and never blocks (ADR 0040 §12): the number is the athlete's.
	expect(
		await setEnduranceSegment(athleteId, {
			segmentId: base!.id,
			ramp: 0.2,
			boundaryStep: 0.3,
			recoveryCut: null,
			taperCut: null,
		}),
	).toEqual({ ok: true })
	const [after] = await segmentsOf(eventId)
	expect(after).toMatchObject({ ramp: 0.2, boundaryStep: 0.3 })
})

test('a ramp outside the storable range is refused as a typo', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)

	await expect(
		setEnduranceSegment(athleteId, {
			segmentId: base!.id,
			// 5 meant as 5%, not 500% a week.
			ramp: 5,
			boundaryStep: null,
			recoveryCut: null,
			taperCut: null,
		}),
	).rejects.toThrow()
})

test('another athlete cannot author a segment’s progression', async () => {
	const owner = await createAthlete()
	const intruder = await createAthlete()
	const eventId = await createRace(owner)
	await createPlanOutline(owner, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)

	expect(
		await setEnduranceSegment(intruder, {
			segmentId: base!.id,
			ramp: 0.4,
			boundaryStep: null,
			recoveryCut: null,
			taperCut: null,
		}),
	).toEqual({ ok: false, reason: 'segment-not-found' })
	const [after] = await segmentsOf(eventId)
	expect(after!.ramp).toBeNull()
})

// ── The Quality Session Mix: the second authored axis (ADR 0042 §3) ───────────

/** One segment's stored mix, ascending by zone — one row per zone, never a blob. */
async function storedMix(segmentId: string) {
	return prisma.qualitySessionMixEntry.findMany({
		where: { segmentId },
		orderBy: { zone: 'asc' },
		select: { zone: true, sessionsPerWeek: true },
	})
}

/** A plan whose only track is strength, with one dated segment of its own. */
async function strengthSegment() {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId, { disciplines: ['strength'] })
	await createPlanOutline(
		athleteId,
		{
			...planInput(eventId),
			tracks: [{ discipline: 'strength', currency: 'sets', anchorValue: 18 }],
		},
		NOW,
	)
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outline: { eventId } },
		select: { id: true },
	})
	// Created here rather than by `createPlanOutline`, which lays down no strength
	// segment: a strength segment is dated and floats free of the phases (ADR 0047 §6).
	const segment = await prisma.trainingTrackSegment.create({
		data: {
			trackId: track.id,
			kind: 'strength',
			startWeekKey: START_WEEK_KEY,
			weeks: 6,
			goal: 'hypertrophy',
			sessionsPerWeek: 3,
		},
		select: { id: true },
	})
	return { athleteId, segmentId: segment.id }
}

test('authoring a mix stores one row per zone', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)

	const result = await setQualitySessionMix(athleteId, {
		segmentId: base!.id,
		entries: [
			{ zone: 5, sessionsPerWeek: 1 },
			{ zone: 4, sessionsPerWeek: 2 },
		],
	})

	expect(result).toEqual({ ok: true })
	// A multiset of Training Zone → sessions per week, one row per zone (ADR 0042 §3).
	// The count and the emphasis label are read off these rows and never stored
	// (§4, §5), so there is nothing here but the zones and their doses.
	expect(await storedMix(base!.id)).toEqual([
		{ zone: 4, sessionsPerWeek: 2 },
		{ zone: 5, sessionsPerWeek: 1 },
	])
})

test('re-authoring replaces the whole mix rather than merging into it', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)
	await setQualitySessionMix(athleteId, {
		segmentId: base!.id,
		entries: [
			{ zone: 4, sessionsPerWeek: 2 },
			{ zone: 5, sessionsPerWeek: 1 },
		],
	})

	await setQualitySessionMix(athleteId, {
		segmentId: base!.id,
		entries: [{ zone: 3, sessionsPerWeek: 1 }],
	})

	// A multiset is one value, so the whole of it is written every time: merging
	// per zone would leave "drop the last zone 5 session" unexpressible.
	expect(await storedMix(base!.id)).toEqual([{ zone: 3, sessionsPerWeek: 1 }])
})

test('an empty mix clears the segment and is a valid save, not an error', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)
	await setQualitySessionMix(athleteId, {
		segmentId: base!.id,
		entries: [{ zone: 4, sessionsPerWeek: 3 }],
	})

	const result = await setQualitySessionMix(athleteId, {
		segmentId: base!.id,
		entries: [],
	})

	// `{}` is the positive statement that the segment has no quality sessions
	// (ADR 0042 §6) — which is how the prototype's `focus: 'recovery'` dissolves —
	// so it saves rather than being refused or read back as "unknown".
	expect(result).toEqual({ ok: true })
	expect(await storedMix(base!.id)).toEqual([])
})

test('a zone off the quality axis is refused', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)

	await expect(
		setQualitySessionMix(athleteId, {
			segmentId: base!.id,
			// @ts-expect-error ADR 0042 §3 — zones 3–5 only, spelled out as literals so
			// an easy-run zone is unrepresentable in the input type, not merely rejected.
			entries: [{ zone: 2, sessionsPerWeek: 1 }],
		}),
	).rejects.toThrow()
	await expect(
		setQualitySessionMix(athleteId, {
			segmentId: base!.id,
			// @ts-expect-error ADR 0042 §7 — neuromuscular work has no position on the
			// metabolic axis, so there is no zone 6 to put it in.
			entries: [{ zone: 6, sessionsPerWeek: 1 }],
		}),
	).rejects.toThrow()
	expect(await storedMix(base!.id)).toEqual([])
})

test('the same zone twice in one mix is refused', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)

	// The mix is a multiset by *count*: a zone appears once, carrying its number.
	await expect(
		setQualitySessionMix(athleteId, {
			segmentId: base!.id,
			entries: [
				{ zone: 4, sessionsPerWeek: 2 },
				{ zone: 4, sessionsPerWeek: 1 },
			],
		}),
	).rejects.toThrow(/appears once/)
	expect(await storedMix(base!.id)).toEqual([])
})

test('a zone in the mix carries a whole session count of at least one', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	await createPlanOutline(athleteId, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)

	// Zero sessions in a zone is that zone being absent, which an empty entry list
	// already says — two spellings of one state is what this refusal prevents.
	await expect(
		setQualitySessionMix(athleteId, {
			segmentId: base!.id,
			entries: [{ zone: 4, sessionsPerWeek: 0 }],
		}),
	).rejects.toThrow()
	await expect(
		setQualitySessionMix(athleteId, {
			segmentId: base!.id,
			entries: [{ zone: 4, sessionsPerWeek: 1.5 }],
		}),
	).rejects.toThrow()
	expect(await storedMix(base!.id)).toEqual([])
})

test('a strength segment cannot be given a Quality Session Mix', async () => {
	const { athleteId, segmentId } = await strengthSegment()

	// A strength segment authors its intensity as a **Strength Goal** instead
	// (ADR 0047 §3). It reads as absent rather than as forbidden, the same shape
	// every other refusal here takes.
	expect(
		await setQualitySessionMix(athleteId, {
			segmentId,
			entries: [{ zone: 4, sessionsPerWeek: 2 }],
		}),
	).toEqual({ ok: false, reason: 'segment-not-found' })
	expect(await storedMix(segmentId)).toEqual([])
})

test('another athlete cannot author a segment’s mix, or clear one', async () => {
	const owner = await createAthlete()
	const intruder = await createAthlete()
	const eventId = await createRace(owner)
	await createPlanOutline(owner, planInput(eventId), NOW)
	const [base] = await segmentsOf(eventId)
	await setQualitySessionMix(owner, {
		segmentId: base!.id,
		entries: [{ zone: 4, sessionsPerWeek: 2 }],
	})

	expect(
		await setQualitySessionMix(intruder, {
			segmentId: base!.id,
			entries: [],
		}),
	).toEqual({ ok: false, reason: 'segment-not-found' })
	// The refused write deletes nothing: ownership is checked before the
	// delete-then-insert, so a stranger cannot empty someone else's mix.
	expect(await storedMix(base!.id)).toEqual([{ zone: 4, sessionsPerWeek: 2 }])
})

test('a plan authored here lights up the Plan card and the projection', async () => {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	// The mix-aware conversion reads the athlete's own thresholds and zone recipe
	// (ADR 0045 §4), so a plan only lights up the projection for an athlete who has
	// set them — which is the honest gate, not a missing feature.
	await prisma.athleteProfile.create({
		data: {
			userId: athleteId,
			disciplineProfiles: {
				create: [
					{
						discipline: 'run',
						thresholdPaceSecPerKm: 240,
						zoneSystem: 'daniels-pace-5',
					},
				],
			},
		},
	})
	await createPlanOutline(
		athleteId,
		{
			...planInput(eventId),
			// **km**, the currency a runner's history actually proposes: since #411 it
			// converts to projectable TSS like any other (ADR 0045 §7).
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 55 }],
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

/**
 * Whether **any** member of a union carries `currency`.
 *
 * It distributes deliberately. `keyof (A | B)` is the *intersection* of their
 * keys, so asking `'currency' extends keyof PlanOutlineUpdateInput` goes quiet as
 * soon as one member lacks the field — and every member lacks it today, which
 * made the check pass for the wrong reason and would have kept passing had a
 * later ticket widened the union with an input that carried one. Distributed, a
 * single offending member turns the answer into `boolean` and fails the test.
 */
type CarriesCurrency<T> = T extends unknown
	? 'currency' extends keyof T
		? true
		: false
	: never

test('the create input carries currency and no update input does', () => {
	expectTypeOf<TrackCreateInput>().toHaveProperty('currency')
	expectTypeOf<CarriesCurrency<PlanOutlineUpdateInput>>().toEqualTypeOf<false>()
	// The guard bites: a member that did carry one would not read as `false`.
	expectTypeOf<CarriesCurrency<TrackCreateInput>>().toEqualTypeOf<true>()
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

test('an added phase joins the endurance track’s one-segment-per-phase 1:1', async () => {
	const { athleteId, outlineId } = await authoredPlan()

	const added = await addPhase(athleteId, {
		outlineId,
		atIndex: 1,
		name: 'Sharpen',
		weeks: 3,
	})

	// The phase is authorable the moment it exists, like the phases `createPlanOutline`
	// laid down (ADR 0042 §8) — and its rates open unset, so no convention is stored
	// as though the athlete had chosen it (ADR 0044 §4).
	const segment = await prisma.trainingTrackSegment.findFirstOrThrow({
		where: { phaseId: added.ok ? added.phaseId : '' },
		select: {
			kind: true,
			ramp: true,
			boundaryStep: true,
			recoveryCut: true,
			taperCut: true,
		},
	})
	expect(segment).toEqual({
		kind: 'endurance',
		ramp: null,
		boundaryStep: null,
		recoveryCut: null,
		taperCut: null,
	})
	// Still exactly one segment per phase across the season.
	expect(
		await prisma.trainingTrackSegment.count({
			where: { track: { outlineId } },
		}),
	).toBe(4)
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

// ── Applying a periodization preset: #371 ────────────────────────────────────
// A preset is a season's *shape*, copied in. Every test below reads the rows an
// apply left rather than the calls it made, because that is the whole claim: what
// lands is ordinary phases and ordinary segments, with nothing recording where they
// came from and nothing linking back — which is why the last test here edits every
// value the preset wrote.

/** The endurance segments an apply leaves, in phase order, each with its mix. */
async function appliedSegments(outlineId: string) {
	return prisma.trainingTrackSegment.findMany({
		where: { track: { outlineId }, kind: 'endurance' },
		orderBy: { phase: { orderIndex: 'asc' } },
		select: {
			id: true,
			ramp: true,
			boundaryStep: true,
			recoveryCut: true,
			taperCut: true,
			phase: { select: { name: true } },
			mix: {
				orderBy: { zone: 'asc' },
				select: { zone: true, sessionsPerWeek: true },
			},
		},
	})
}

/** Every segment row under the Outline, of either kind — orphans included. */
async function segmentCount(outlineId: string) {
	return prisma.trainingTrackSegment.count({ where: { track: { outlineId } } })
}

/** Every Quality Session Mix row under the Outline — orphans included. */
async function mixCount(outlineId: string) {
	return prisma.qualitySessionMixEntry.count({
		where: { segment: { track: { outlineId } } },
	})
}

/** How many mix rows a preset authors across its phases. */
function presetMixRows(preset: PeriodizationPreset) {
	return preset.phases.reduce((sum, phase) => sum + phase.mix.length, 0)
}

describe('applyPreset', () => {
	test('applying writes the preset’s own phases, in order and contiguous', async () => {
		const { athleteId, outlineId } = await authoredPlan()
		const preset = presetFor('classic-linear')

		expect(
			await applyPreset(athleteId, { outlineId, presetKey: 'classic-linear' }),
		).toEqual({ ok: true })

		// The preset's own names, week counts, rhythms and taper flags — written
		// explicitly rather than left to the column defaults, because a preset
		// *chooses* them.
		expect(
			(await storedPhases(outlineId)).map(
				({ orderIndex, name, weeks, rhythm, tapers }) => ({
					orderIndex,
					name,
					weeks,
					rhythm,
					tapers,
				}),
			),
		).toEqual(
			preset.phases.map((phase, orderIndex) => ({
				orderIndex,
				name: phase.name,
				weeks: phase.weeks,
				rhythm: phase.rhythm,
				tapers: phase.tapers,
			})),
		)
	})

	test('applying replaces the structure the athlete had, entirely', async () => {
		const { athleteId, outlineId, phaseIds } = await authoredPlan()
		const preset = presetFor('masters-2-1')

		await applyPreset(athleteId, { outlineId, presetKey: 'masters-2-1' })

		// Picking a shape is picking a shape: there is nothing of the old one left to
		// reconcile against the new.
		expect((await storedPhases(outlineId)).map((phase) => phase.name)).toEqual(
			preset.phases.map((phase) => phase.name),
		)
		expect(
			await prisma.planOutlinePhase.count({ where: { id: { in: phaseIds } } }),
		).toBe(0)
	})

	test('each cardio track gets one segment per phase, carrying the preset’s rates', async () => {
		const athleteId = await createAthlete()
		const eventId = await createRace(athleteId, {
			disciplines: ['run', 'bike'],
		})
		const created = await createPlanOutline(
			athleteId,
			{
				...planInput(eventId),
				tracks: [
					{ discipline: 'run', currency: 'km', anchorValue: 55 },
					{ discipline: 'bike', currency: 'hours', anchorValue: 6 },
				],
			},
			NOW,
		)
		if (!created.ok) throw new Error(`plan not created: ${created.reason}`)
		// The pyramidal preset is the one that authors a Block Boundary Step, so its
		// two rates are both non-null somewhere in the season.
		const preset = presetFor('big-base')

		expect(
			await applyPreset(athleteId, {
				outlineId: created.outlineId,
				presetKey: 'big-base',
			}),
		).toEqual({ ok: true })

		for (const discipline of ['run', 'bike']) {
			const segments = await prisma.trainingTrackSegment.findMany({
				where: { track: { outlineId: created.outlineId, discipline } },
				orderBy: { phase: { orderIndex: 'asc' } },
				select: {
					kind: true,
					ramp: true,
					boundaryStep: true,
					phase: { select: { name: true } },
				},
			})
			// Exactly one per phase, 1:1 (ADR 0042 §8) — the list's length says so as
			// much as its contents do.
			expect(segments).toEqual(
				preset.phases.map((phase) => ({
					kind: 'endurance',
					ramp: phase.ramp,
					boundaryStep: phase.boundaryStep,
					phase: { name: phase.name },
				})),
			)
		}
	})

	test('every segment a preset applies has both cuts unset', async () => {
		const { athleteId, outlineId } = await authoredPlan()
		const preset = presetFor('big-base')

		await applyPreset(athleteId, { outlineId, presetKey: 'big-base' })

		const segments = await appliedSegments(outlineId)
		expect(segments).toHaveLength(preset.phases.length)
		// A preset authors no cut at all. Left unset, the documented convention
		// applies *and stays visible as a convention*; stored, it would read as though
		// the athlete had typed it, and a convention moving later would look like an
		// edit to their plan (ADR 0044 §4).
		expect(segments.map((segment) => segment.recoveryCut)).toEqual(
			preset.phases.map(() => null),
		)
		expect(segments.map((segment) => segment.taperCut)).toEqual(
			preset.phases.map(() => null),
		)
	})

	test('the Quality Session Mix lands per phase, and the taper carries none', async () => {
		const { athleteId, outlineId } = await authoredPlan()
		const preset = presetFor('classic-linear')

		await applyPreset(athleteId, { outlineId, presetKey: 'classic-linear' })

		const segments = await appliedSegments(outlineId)
		expect(
			segments.map((segment) => [segment.phase?.name, segment.mix]),
		).toEqual(
			preset.phases.map((phase) => [
				phase.name,
				phase.mix.map((entry) => ({
					zone: entry.zone,
					sessionsPerWeek: entry.sessionsPerWeek,
				})),
			]),
		)
		// No rows is a positive statement — the tapering phase has no quality sessions
		// — and never "unknown".
		expect(segments.at(-1)?.mix).toEqual([])
	})

	test('the replaced structure leaves no orphan segments or mix entries', async () => {
		const { athleteId, outlineId } = await authoredPlan()
		const preset = presetFor('classic-linear')
		const before = await appliedSegments(outlineId)
		for (const segment of before) {
			await prisma.qualitySessionMixEntry.create({
				data: { segmentId: segment.id, zone: 5, sessionsPerWeek: 2 },
			})
		}
		expect(await segmentCount(outlineId)).toBe(3)
		expect(await mixCount(outlineId)).toBe(3)

		await applyPreset(athleteId, { outlineId, presetKey: 'classic-linear' })

		// The old segments cascade with the phases they spanned and their mix entries
		// go with them, so what is left is the preset's rows and only those.
		expect(await segmentCount(outlineId)).toBe(preset.phases.length)
		expect(await mixCount(outlineId)).toBe(presetMixRows(preset))
		expect(
			await prisma.trainingTrackSegment.count({
				where: { id: { in: before.map((segment) => segment.id) } },
			}),
		).toBe(0)
	})

	test('a strength track gets no endurance segment, and its dated one survives', async () => {
		const athleteId = await createAthlete()
		const eventId = await createRace(athleteId, { disciplines: ['strength'] })
		const created = await createPlanOutline(
			athleteId,
			{
				...planInput(eventId),
				tracks: [{ discipline: 'strength', currency: 'sets', anchorValue: 18 }],
			},
			NOW,
		)
		if (!created.ok) throw new Error(`plan not created: ${created.reason}`)
		const track = await prisma.trainingTrack.findFirstOrThrow({
			where: { outlineId: created.outlineId },
			select: { id: true },
		})
		// The create path lays none down, so the segment that has to survive is
		// written here: dated, floating free of the phases (ADR 0047 §6).
		const strength = await prisma.trainingTrackSegment.create({
			select: { id: true },
			data: {
				kind: 'strength',
				trackId: track.id,
				startWeekKey: START_WEEK_KEY,
				weeks: 6,
				goal: 'hypertrophy',
				sessionsPerWeek: 2,
			},
		})

		expect(
			await applyPreset(athleteId, {
				outlineId: created.outlineId,
				presetKey: 'classic-linear',
			}),
		).toEqual({ ok: true })

		// A preset says nothing about lifting, and no phase's removal reaches a
		// segment that never spanned one.
		expect(await appliedSegments(created.outlineId)).toEqual([])
		expect(
			await prisma.trainingTrackSegment.findUniqueOrThrow({
				where: { id: strength.id },
				select: {
					kind: true,
					phaseId: true,
					startWeekKey: true,
					weeks: true,
					goal: true,
					sessionsPerWeek: true,
				},
			}),
		).toEqual({
			kind: 'strength',
			phaseId: null,
			startWeekKey: START_WEEK_KEY,
			weeks: 6,
			goal: 'hypertrophy',
			sessionsPerWeek: 2,
		})
	})

	test('applying leaves the track’s currency and its Season Anchors alone', async () => {
		const { athleteId, outlineId } = await authoredPlan()
		const track = await prisma.trainingTrack.findFirstOrThrow({
			where: { outlineId },
			select: { id: true },
		})
		await setSeasonAnchorValue(athleteId, {
			trackId: track.id,
			fromWeekKey: '2030-02-04',
			value: 44,
		})

		await applyPreset(athleteId, { outlineId, presetKey: 'big-base' })

		// A preset is shape and never size: it carries no Volume Currency and no
		// Season Anchor value, so the same shape lands on a 40 km week and a 90 km one
		// (ADR 0043 §1).
		expect(
			await prisma.trainingTrack.findUniqueOrThrow({
				where: { id: track.id },
				select: {
					currency: true,
					anchors: {
						orderBy: { fromWeekKey: 'asc' },
						select: { fromWeekKey: true, value: true },
					},
				},
			}),
		).toEqual({
			currency: 'km',
			anchors: [
				{ fromWeekKey: START_WEEK_KEY, value: 55 },
				{ fromWeekKey: '2030-02-04', value: 44 },
			],
		})
	})

	test('applying never moves the Plan Start Week', async () => {
		const { athleteId, outlineId } = await authoredPlan()
		const preset = presetFor('big-base')

		await applyPreset(athleteId, { outlineId, presetKey: 'big-base' })

		// The start is authored on the Outline and a preset carries none, so the
		// season's phases are fixed length and grow *forward* from where the athlete
		// put the plan (ADR 0044 §3).
		expect(
			await prisma.planOutline.findUniqueOrThrow({
				where: { id: outlineId },
				select: { startWeekKey: true },
			}),
		).toEqual({ startWeekKey: START_WEEK_KEY })
		const season = await readSeason(athleteId)
		expect(season.startWeekKey).toBe(START_WEEK_KEY)
		expect(season.weeks).toHaveLength(presetWeeks(preset))
	})

	test('a Week Volume Override the athlete hand-set survives applying', async () => {
		const { athleteId, outlineId } = await authoredPlan()
		const track = await prisma.trainingTrack.findFirstOrThrow({
			where: { outlineId },
			select: { id: true },
		})
		await prisma.weekVolumeOverride.create({
			data: { trackId: track.id, weekKey: '2030-02-04', value: 31 },
		})

		await applyPreset(athleteId, { outlineId, presetKey: 'classic-linear' })

		// A leaf the athlete authored about one particular week (ADR 0044 §5), and a
		// preset is not about that week.
		expect(
			await prisma.weekVolumeOverride.findMany({
				where: { trackId: track.id },
				select: { weekKey: true, value: true },
			}),
		).toEqual([{ weekKey: '2030-02-04', value: 31 }])
	})

	test('another athlete cannot apply a preset, and nothing is written', async () => {
		const { outlineId } = await authoredPlan()
		const intruder = await createAthlete()
		const before = await storedPhases(outlineId)

		// A row that is not the caller's reads as absent rather than as forbidden.
		expect(
			await applyPreset(intruder, { outlineId, presetKey: 'classic-linear' }),
		).toEqual({ ok: false, reason: 'outline-not-found' })

		expect(await storedPhases(outlineId)).toEqual(before)
		expect(await segmentCount(outlineId)).toBe(3)
		expect(await mixCount(outlineId)).toBe(0)
	})

	test('a missing Outline is the same refusal', async () => {
		const athleteId = await createAthlete()

		expect(
			await applyPreset(athleteId, {
				outlineId: 'no-such-outline',
				presetKey: 'classic-linear',
			}),
		).toEqual({ ok: false, reason: 'outline-not-found' })
	})

	test('a second preset over the first leaves only the second’s shape', async () => {
		const { athleteId, outlineId } = await authoredPlan()
		await applyPreset(athleteId, { outlineId, presetKey: 'classic-linear' })
		const preset = presetFor('big-base')

		await applyPreset(athleteId, { outlineId, presetKey: 'big-base' })

		expect((await storedPhases(outlineId)).map((phase) => phase.name)).toEqual(
			preset.phases.map((phase) => phase.name),
		)
		expect(await segmentCount(outlineId)).toBe(preset.phases.length)
		expect(await mixCount(outlineId)).toBe(presetMixRows(preset))
	})

	// The phase and the progression are editable the moment they land. The
	// **Quality Session Mix** is the exception, and it is #404's rather than this
	// ticket's: `applyPreset` writes the mix rows because a preset that dropped them
	// would leave every preset-authored season silently mix-less once the authoring
	// path arrives, but until #404 ships there is no service operation and no read
	// path for them, so nothing here can assert an edit that does not exist yet.
	// Named rather than quietly omitted — the test below would otherwise read as
	// covering a value it does not touch.
	test('every value a preset writes except the mix is editable afterwards', async () => {
		const { athleteId, outlineId } = await authoredPlan()
		await applyPreset(athleteId, { outlineId, presetKey: 'classic-linear' })
		const [phase] = await storedPhases(outlineId)
		const [segment] = await appliedSegments(outlineId)

		// Nothing links back to the preset, so what landed is ordinary rows every
		// existing edit path already reaches: it's yours now, edit anything
		// (ADR 0044 §2, #371).
		expect(
			await renamePhase(athleteId, {
				phaseId: phase!.id,
				name: 'Return to run',
			}),
		).toEqual({ ok: true })
		expect(
			await resizePhase(athleteId, { phaseId: phase!.id, weeks: 3 }),
		).toEqual({ ok: true })
		expect(
			await setEnduranceSegment(athleteId, {
				segmentId: segment!.id,
				ramp: 0.02,
				boundaryStep: -0.15,
				recoveryCut: 0.2,
				taperCut: 0.45,
			}),
		).toEqual({ ok: true })

		const [edited] = await storedPhases(outlineId)
		expect(edited).toMatchObject({
			id: phase!.id,
			name: 'Return to run',
			weeks: 3,
		})
		const [authored] = await appliedSegments(outlineId)
		expect(authored).toMatchObject({
			id: segment!.id,
			ramp: 0.02,
			boundaryStep: -0.15,
			// The cuts the preset deliberately left to the convention are the athlete's
			// to author, and authoring one is not undone by where the phase came from.
			recoveryCut: 0.2,
			taperCut: 0.45,
		})
	})

	test('a preset the app never shipped is refused, and so is a stray currency', async () => {
		const { athleteId, outlineId } = await authoredPlan()

		await expect(
			applyPreset(athleteId, {
				outlineId,
				// @ts-expect-error the caller names a shape the app ships; block
				// periodization is deferred and is not one of them.
				presetKey: 'block',
			}),
		).rejects.toThrow()
		await expect(
			applyPreset(athleteId, {
				outlineId,
				presetKey: 'classic-linear',
				// @ts-expect-error ADR 0044 §8 — no update input carries `currency`.
				currency: 'hours',
			}),
		).rejects.toThrow()

		// `.strict()` refuses the write outright rather than dropping the stray key,
		// so neither malformed call reached the season.
		expect((await storedPhases(outlineId)).map((phase) => phase.name)).toEqual([
			'Base',
			'Build',
			'Taper',
		])
	})
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

// ── Authoring a Week Pattern: #410 ───────────────────────────────────────────
// The microcycle the athlete authors once instead of scheduling eighteen weeks by
// hand (ADR 0044 §6). Every test below reads the rows an operation left, because
// the claims are about rows: what a `fixed` day stores and what a `share` day
// stores, that the positions are dense from 0, and that nothing anywhere in a
// pattern is an absolute volume (ADR 0044 §7).

/** A plan with one pattern on it, and the track its days draw from. */
async function patternedPlan() {
	const { athleteId, outlineId } = await authoredPlan()
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const added = await addWeekPattern(athleteId, {
		outlineId,
		name: 'Standard week',
	})
	if (!added.ok) throw new Error(`pattern not added: ${added.reason}`)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	return { athleteId, outlineId, trackId: track.id, patternId: pattern.id }
}

/** A second plan of the same athlete's, and its own track. */
async function secondPlanTrack(athleteId: string) {
	const eventId = await createRace(athleteId, {
		startDate: new Date('2030-09-01T09:00:00Z'),
	})
	const created = await createPlanOutline(athleteId, planInput(eventId), NOW)
	if (!created.ok) throw new Error(`plan not created: ${created.reason}`)
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId: created.outlineId },
		select: { id: true },
	})
	return { outlineId: created.outlineId, trackId: track.id }
}

/** A Workout the given user owns — what a `fixed` day stamps. */
async function createWorkout(ownerId: string, title = '5×1000m Z4') {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: { ownerId, title, discipline: 'run', intent: 'threshold' },
	})
	return workout.id
}

async function storedPatterns(outlineId: string) {
	return prisma.weekPattern.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: { id: true, orderIndex: true, name: true },
	})
}

async function storedDays(patternId: string) {
	return prisma.weekPatternDay.findMany({
		where: { patternId },
		orderBy: [{ weekday: 'asc' }, { orderInDay: 'asc' }],
		select: {
			id: true,
			weekday: true,
			orderInDay: true,
			kind: true,
			weight: true,
			workoutId: true,
			trackId: true,
		},
	})
}

/** A share day of the given weekday, appended by the service. */
async function addShareDay(
	athleteId: string,
	patternId: string,
	trackId: string,
	weekday: number,
	weight = 1,
) {
	const added = await addWeekPatternDay(athleteId, {
		kind: 'share',
		patternId,
		trackId,
		weekday,
		weight,
	})
	if (!added.ok) throw new Error(`day not added: ${added.reason}`)
}

test('a pattern is appended to the plan, named and positioned from zero', async () => {
	const { athleteId, outlineId } = await authoredPlan()

	expect(
		await addWeekPattern(athleteId, { outlineId, name: 'Standard week' }),
	).toEqual({ ok: true })
	expect(
		await addWeekPattern(athleteId, { outlineId, name: 'Race week' }),
	).toEqual({ ok: true })

	// The position is counted by the service rather than submitted, so a second tab
	// cannot claim a position the first already took.
	expect(
		(await storedPatterns(outlineId)).map(({ orderIndex, name }) => [
			orderIndex,
			name,
		]),
	).toEqual([
		[0, 'Standard week'],
		[1, 'Race week'],
	])
})

test('a new pattern opens with no days at all', async () => {
	const { patternId } = await patternedPlan()

	// A default week laid down here would be a shape nobody authored — the same
	// objection ADR 0044 §4 makes to storing a convention as a choice.
	expect(await storedDays(patternId)).toEqual([])
})

test('a pattern is renamed, and its name is free text', async () => {
	const { athleteId, outlineId, patternId } = await patternedPlan()
	await addWeekPattern(athleteId, { outlineId, name: 'Race week' })

	expect(
		await renameWeekPattern(athleteId, {
			patternId,
			name: '  Two-a-day week  ',
		}),
	).toEqual({ ok: true })

	// Trimmed, and nothing in the app branches on the word.
	expect(
		(await storedPatterns(outlineId)).map(({ orderIndex, name }) => [
			orderIndex,
			name,
		]),
	).toEqual([
		[0, 'Two-a-day week'],
		// A rename reaches one row, and never its siblings' names or positions.
		[1, 'Race week'],
	])
})

test('a pattern moves one position at a time, and the ends refuse', async () => {
	const { athleteId, outlineId } = await authoredPlan()
	for (const name of ['Standard week', 'Big week', 'Race week']) {
		await addWeekPattern(athleteId, { outlineId, name })
	}
	const before = await storedPatterns(outlineId)

	expect(
		await moveWeekPattern(athleteId, {
			patternId: before[2]!.id,
			direction: 'earlier',
		}),
	).toEqual({ ok: true })

	expect((await storedPatterns(outlineId)).map((p) => p.name)).toEqual([
		'Standard week',
		'Race week',
		'Big week',
	])
	// A direction and never a target index, so the ends have nothing to swap with.
	expect(
		await moveWeekPattern(athleteId, {
			patternId: before[0]!.id,
			direction: 'earlier',
		}),
	).toEqual({ ok: false, reason: 'at-the-edge' })
	expect(
		await moveWeekPattern(athleteId, {
			patternId: before[1]!.id,
			direction: 'later',
		}),
	).toEqual({ ok: false, reason: 'at-the-edge' })
	expect((await storedPatterns(outlineId)).map((p) => p.name)).toEqual([
		'Standard week',
		'Race week',
		'Big week',
	])
})

test('removing a pattern in the middle leaves the positions contiguous', async () => {
	const { athleteId, outlineId, trackId } = await patternedPlan()
	await addWeekPattern(athleteId, { outlineId, name: 'Big week' })
	await addWeekPattern(athleteId, { outlineId, name: 'Race week' })
	const patterns = await storedPatterns(outlineId)
	await addShareDay(athleteId, patterns[1]!.id, trackId, 5, 2.5)

	expect(
		await removeWeekPattern(athleteId, { patternId: patterns[1]!.id }),
	).toEqual({ ok: true })

	expect(
		(await storedPatterns(outlineId)).map(({ orderIndex, name }) => [
			orderIndex,
			name,
		]),
	).toEqual([
		[0, 'Standard week'],
		[1, 'Race week'],
	])
	// The days cascade with the pattern they belonged to.
	expect(
		await prisma.weekPatternDay.count({
			where: { patternId: patterns[1]!.id },
		}),
	).toBe(0)
})

test('a fixed day stores the Workout it stamps and carries no weight', async () => {
	const { athleteId, patternId, trackId } = await patternedPlan()
	const workoutId = await createWorkout(athleteId)

	expect(
		await addWeekPatternDay(athleteId, {
			kind: 'fixed',
			patternId,
			trackId,
			weekday: 2,
			workoutId,
		}),
	).toEqual({ ok: true })

	// Intervals are *prescribed*, not scaled: the day takes no share of the week,
	// so there is no weight to store (ADR 0044 §7).
	expect(await storedDays(patternId)).toEqual([
		{
			id: expect.any(String),
			weekday: 2,
			orderInDay: 0,
			kind: 'fixed',
			weight: null,
			workoutId,
			trackId,
		},
	])
})

test('a share day stores its relative weight, and may carry a shape to scale', async () => {
	const { athleteId, patternId, trackId } = await patternedPlan()
	const workoutId = await createWorkout(athleteId, 'Long run')

	await addShareDay(athleteId, patternId, trackId, 1, 1)
	expect(
		await addWeekPatternDay(athleteId, {
			kind: 'share',
			patternId,
			trackId,
			weekday: 5,
			weight: 2.5,
			workoutId,
		}),
	).toEqual({ ok: true })

	// "The long run is 2.5× a weekday run" holds at any volume, because a weight is
	// a ratio and never a quantity. The Workout on a share day is an optional
	// *shape to scale*, not a prescription.
	expect(
		(await storedDays(patternId)).map(
			({ weekday, kind, weight, workoutId }) => ({
				weekday,
				kind,
				weight,
				workoutId,
			}),
		),
	).toEqual([
		{ weekday: 1, kind: 'share', weight: 1, workoutId: null },
		{ weekday: 5, kind: 'share', weight: 2.5, workoutId },
	])
})

test('days append within their weekday, and each weekday counts from zero', async () => {
	const { athleteId, patternId, trackId } = await patternedPlan()

	await addShareDay(athleteId, patternId, trackId, 1, 1) // Tuesday, morning
	await addShareDay(athleteId, patternId, trackId, 1, 0.5) // Tuesday, evening
	await addShareDay(athleteId, patternId, trackId, 5, 2.5) // Saturday

	// `orderInDay` is scoped to its weekday, which is the whole of how one Tuesday
	// holds two sessions in the order the athlete put them.
	expect(
		(await storedDays(patternId)).map(({ weekday, orderInDay, weight }) => [
			weekday,
			orderInDay,
			weight,
		]),
	).toEqual([
		[1, 0, 1],
		[1, 1, 0.5],
		[5, 0, 2.5],
	])
})

test('a day moves within its own weekday only, and the ends refuse', async () => {
	const { athleteId, patternId, trackId } = await patternedPlan()
	await addShareDay(athleteId, patternId, trackId, 1, 1)
	await addShareDay(athleteId, patternId, trackId, 1, 0.5)
	await addShareDay(athleteId, patternId, trackId, 5, 2.5)
	const [morning, evening, saturday] = await storedDays(patternId)

	expect(
		await moveWeekPatternDay(athleteId, {
			dayId: evening!.id,
			direction: 'earlier',
		}),
	).toEqual({ ok: true })

	expect(
		(await storedDays(patternId)).map(({ id, weekday, orderInDay }) => [
			id,
			weekday,
			orderInDay,
		]),
	).toEqual([
		[evening!.id, 1, 0],
		[morning!.id, 1, 1],
		[saturday!.id, 5, 0],
	])
	// Saturday's only session is at both ends of its own weekday at once — moving a
	// session to another day is authoring a different week, not reordering this one.
	expect(
		await moveWeekPatternDay(athleteId, {
			dayId: saturday!.id,
			direction: 'earlier',
		}),
	).toEqual({ ok: false, reason: 'at-the-edge' })
	expect(
		await moveWeekPatternDay(athleteId, {
			dayId: saturday!.id,
			direction: 'later',
		}),
	).toEqual({ ok: false, reason: 'at-the-edge' })
	expect(
		await prisma.weekPatternDay.findUniqueOrThrow({
			where: { id: saturday!.id },
			select: { weekday: true, orderInDay: true },
		}),
	).toEqual({ weekday: 5, orderInDay: 0 })
})

test('removing a day renumbers its weekday and leaves the others alone', async () => {
	const { athleteId, patternId, trackId } = await patternedPlan()
	await addShareDay(athleteId, patternId, trackId, 1, 1)
	await addShareDay(athleteId, patternId, trackId, 1, 0.5)
	await addShareDay(athleteId, patternId, trackId, 1, 0.25)
	await addShareDay(athleteId, patternId, trackId, 5, 2.5)
	const [, middle] = await storedDays(patternId)

	expect(await removeWeekPatternDay(athleteId, { dayId: middle!.id })).toEqual({
		ok: true,
	})

	// Tuesday closes its gap; Saturday never had one to close.
	expect(
		(await storedDays(patternId)).map(({ weekday, orderInDay, weight }) => [
			weekday,
			orderInDay,
			weight,
		]),
	).toEqual([
		[1, 0, 1],
		[1, 1, 0.25],
		[5, 0, 2.5],
	])
})

test('a track from another plan is not one this pattern can draw from', async () => {
	const { athleteId, patternId } = await patternedPlan()
	const other = await secondPlanTrack(athleteId)

	// The athlete's own track, on the wrong Outline: a day drawing from it would
	// draw from a target that has nothing to do with this week. The foreign key
	// cannot say so, so the service does.
	expect(
		await addWeekPatternDay(athleteId, {
			kind: 'share',
			patternId,
			trackId: other.trackId,
			weekday: 3,
			weight: 1,
		}),
	).toEqual({ ok: false, reason: 'track-gone' })
	expect(
		await addWeekPatternDay(athleteId, {
			kind: 'share',
			patternId,
			trackId: 'no-such-track',
			weekday: 3,
			weight: 1,
		}),
	).toEqual({ ok: false, reason: 'track-gone' })
	expect(await storedDays(patternId)).toEqual([])
})

test('another athlete’s Workout cannot be stamped or scaled by a pattern', async () => {
	const { athleteId, patternId, trackId } = await patternedPlan()
	const stranger = await createAthlete()
	const theirs = await createWorkout(stranger)

	// A Workout that is not the caller's reads as absent, whether it was to be
	// stamped as authored or used as a share day's shape.
	expect(
		await addWeekPatternDay(athleteId, {
			kind: 'fixed',
			patternId,
			trackId,
			weekday: 2,
			workoutId: theirs,
		}),
	).toEqual({ ok: false, reason: 'workout-gone' })
	expect(
		await addWeekPatternDay(athleteId, {
			kind: 'share',
			patternId,
			trackId,
			weekday: 5,
			weight: 2.5,
			workoutId: theirs,
		}),
	).toEqual({ ok: false, reason: 'workout-gone' })
	expect(
		await addWeekPatternDay(athleteId, {
			kind: 'fixed',
			patternId,
			trackId,
			weekday: 2,
			workoutId: 'no-such-workout',
		}),
	).toEqual({ ok: false, reason: 'workout-gone' })
	expect(await storedDays(patternId)).toEqual([])
})

test('a missing Outline is the same refusal as another athlete’s', async () => {
	const athleteId = await createAthlete()

	expect(
		await addWeekPattern(athleteId, {
			outlineId: 'no-such-outline',
			name: 'Standard week',
		}),
	).toEqual({ ok: false, reason: 'outline-gone' })
	expect(
		await renameWeekPattern(athleteId, {
			patternId: 'no-such-pattern',
			name: 'Standard week',
		}),
	).toEqual({ ok: false, reason: 'pattern-gone' })
	expect(
		await moveWeekPatternDay(athleteId, {
			dayId: 'no-such-day',
			direction: 'earlier',
		}),
	).toEqual({ ok: false, reason: 'day-gone' })
})

test('another athlete cannot author a pattern, or reorder or remove its days', async () => {
	const { athleteId, outlineId, patternId, trackId } = await patternedPlan()
	const workoutId = await createWorkout(athleteId)
	await addShareDay(athleteId, patternId, trackId, 1, 1)
	await addShareDay(athleteId, patternId, trackId, 1, 0.5)
	const intruder = await createAthlete()
	const patternsBefore = await storedPatterns(outlineId)
	const daysBefore = await storedDays(patternId)

	// Every row that is not the caller's reads as absent rather than as forbidden,
	// so the intruder learns nothing about another athlete's week.
	expect(await addWeekPattern(intruder, { outlineId, name: 'Theirs' })).toEqual(
		{ ok: false, reason: 'outline-gone' },
	)
	expect(
		await renameWeekPattern(intruder, { patternId, name: 'Theirs' }),
	).toEqual({ ok: false, reason: 'pattern-gone' })
	expect(
		await moveWeekPattern(intruder, { patternId, direction: 'later' }),
	).toEqual({ ok: false, reason: 'pattern-gone' })
	expect(await removeWeekPattern(intruder, { patternId })).toEqual({
		ok: false,
		reason: 'pattern-gone',
	})
	expect(
		await addWeekPatternDay(intruder, {
			kind: 'fixed',
			patternId,
			trackId,
			weekday: 3,
			workoutId,
		}),
	).toEqual({ ok: false, reason: 'pattern-gone' })
	expect(
		await moveWeekPatternDay(intruder, {
			dayId: daysBefore[1]!.id,
			direction: 'earlier',
		}),
	).toEqual({ ok: false, reason: 'day-gone' })
	expect(
		await removeWeekPatternDay(intruder, { dayId: daysBefore[0]!.id }),
	).toEqual({ ok: false, reason: 'day-gone' })

	expect(await storedPatterns(outlineId)).toEqual(patternsBefore)
	expect(await storedDays(patternId)).toEqual(daysBefore)
})

test('a fixed day cannot carry a weight, and no pattern day carries a volume', async () => {
	const { athleteId, patternId, trackId } = await patternedPlan()
	const workoutId = await createWorkout(athleteId)

	await expect(
		addWeekPatternDay(athleteId, {
			kind: 'fixed',
			patternId,
			trackId,
			weekday: 2,
			workoutId,
			// @ts-expect-error ADR 0044 §7 — a fixed session is prescribed, not scaled,
			// so the `fixed` member has no `weight` key to fill in.
			weight: 2.5,
		}),
	).rejects.toThrow()
	await expect(
		addWeekPatternDay(athleteId, {
			kind: 'share',
			patternId,
			trackId,
			weekday: 5,
			weight: 2.5,
			// @ts-expect-error A pattern holds no absolute quantity: the week's target is
			// derived and changes week to week (ADR 0040 §1), so a stored volume would be a
			// second, staler answer to a question the derivation already answers.
			km: 22,
		}),
	).rejects.toThrow()
	await expect(
		addWeekPatternDay(athleteId, {
			kind: 'share',
			patternId,
			trackId,
			weekday: 5,
			weight: 2.5,
			// @ts-expect-error The position within the weekday is the service's, appended.
			orderInDay: 3,
		}),
	).rejects.toThrow()
	// A fixed day with nothing to stamp is not a day.
	await expect(
		// @ts-expect-error `workoutId` is required on the `fixed` member.
		addWeekPatternDay(athleteId, {
			kind: 'fixed',
			patternId,
			trackId,
			weekday: 2,
		}),
	).rejects.toThrow()

	// `.strict()` refuses the write outright rather than dropping the stray key, so
	// no form body can smuggle a quantity into a pattern.
	expect(await storedDays(patternId)).toEqual([])
})

test('a weight of zero and a weekday outside Monday–Sunday are refused', async () => {
	const { athleteId, patternId, trackId } = await patternedPlan()

	// A weight of zero absorbs nothing, and a day that absorbs nothing is a day
	// that is not there — the migration's own `weight > 0`, held one layer up.
	await expect(
		addWeekPatternDay(athleteId, {
			kind: 'share',
			patternId,
			trackId,
			weekday: 5,
			weight: 0,
		}),
	).rejects.toThrow(/above zero/)
	// Mon–Sun, 0–6 (ADR 0019). 7 is a Sunday-first index leaking in.
	await expect(
		addWeekPatternDay(athleteId, {
			kind: 'share',
			patternId,
			trackId,
			weekday: 7,
			weight: 1,
		}),
	).rejects.toThrow(/Sunday/)
	await expect(
		addWeekPatternDay(athleteId, {
			kind: 'share',
			patternId,
			trackId,
			weekday: -1,
			weight: 1,
		}),
	).rejects.toThrow(/Monday/)
	// A pattern's name is not optional either — an unnamed week cannot be picked
	// from a list.
	await expect(
		renameWeekPattern(athleteId, { patternId, name: '   ' }),
	).rejects.toThrow(/Name the pattern/)

	expect(await storedDays(patternId)).toEqual([])
})

// ── Authoring a strength Training Track segment (#409) ───────────────────────
// A strength **Training Track segment** is the one segment the athlete adds and
// removes **explicitly**. An endurance track's segments are laid down one per
// phase by `layEnduranceSegments` (ADR 0042 §8), but a strength segment is dated
// and floats free of the phases (ADR 0047 §6), so there is no 1:1 to lay one down
// under and no phase whose removal takes it away.
//
// What it authors: the window (`startWeekKey` + `weeks`), the progression it now
// **shares with endurance** (`ramp`, `boundaryStep`), its **Strength Goal**, its
// **Strength Frequency** and its tail deload. What it cannot author: a `%1RM`
// band or a rep range, which derive from the goal and are not typable at all
// (ADR 0047 §3) — no input below has a field for either, which is the point.

/** The plan `planInput` authors, week by week: 13 weeks from `START_WEEK_KEY`. */
const WEEK_4 = '2030-01-28' // index 3
const WEEK_5 = '2030-02-04' // index 4
const WEEK_9 = '2030-03-04' // index 8
const LAST_WEEK_KEY = '2030-04-01' // index 12 — the plan's final Training Week
const AFTER_PLAN_WEEK_KEY = '2030-04-08' // index 13 — the Monday after it
const BEFORE_PLAN_WEEK_KEY = '2029-12-31' // index −1 — the Monday before the plan

/** A plan whose only track is strength — the track a dated segment hangs off. */
async function strengthTrackedPlan() {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId, { disciplines: ['strength'] })
	const created = await createPlanOutline(
		athleteId,
		{
			...planInput(eventId),
			tracks: [{ discipline: 'strength', currency: 'sets', anchorValue: 18 }],
		},
		NOW,
	)
	if (!created.ok) throw new Error(`plan not created: ${created.reason}`)
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outline: { eventId } },
		select: { id: true },
	})
	return { athleteId, eventId, outlineId: created.outlineId, trackId: track.id }
}

/** Every segment on a track, earliest first — what a write actually left behind. */
async function storedStrengthSegments(trackId: string) {
	return prisma.trainingTrackSegment.findMany({
		where: { trackId },
		orderBy: { startWeekKey: 'asc' },
		select: {
			id: true,
			kind: true,
			phaseId: true,
			startWeekKey: true,
			weeks: true,
			ramp: true,
			boundaryStep: true,
			goal: true,
			sessionsPerWeek: true,
			deloadCut: true,
			deloadWeeks: true,
		},
	})
}

/**
 * One authorable strength segment. Every convention-bearing field is `null` by
 * default, which is what an athlete who has said nothing about them has authored.
 */
function strengthSegmentInput(trackId: string) {
	return {
		trackId,
		startWeekKey: START_WEEK_KEY,
		weeks: 4,
		ramp: null,
		boundaryStep: null,
		goal: 'hypertrophy' as const,
		sessionsPerWeek: 3,
		deloadCut: null,
		deloadWeeks: null,
	}
}

describe('addStrengthSegment', () => {
	test('adding stores the dated window, the Strength Goal and the frequency', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		const result = await addStrengthSegment(athleteId, {
			...strengthSegmentInput(trackId),
			startWeekKey: WEEK_5,
			weeks: 6,
			ramp: 0.05,
			boundaryStep: -0.15,
			goal: 'maximal-strength',
			sessionsPerWeek: 4,
			deloadCut: 0.4,
			deloadWeeks: 1,
		})

		expect(result).toEqual({ ok: true, segmentId: expect.any(String) })
		expect(await storedStrengthSegments(trackId)).toEqual([
			{
				id: expect.any(String),
				kind: 'strength',
				// It carries no `phaseId`: it floats free of the phases (ADR 0047 §6).
				phaseId: null,
				startWeekKey: WEEK_5,
				weeks: 6,
				ramp: 0.05,
				boundaryStep: -0.15,
				goal: 'maximal-strength',
				sessionsPerWeek: 4,
				deloadCut: 0.4,
				deloadWeeks: 1,
			},
		])
	})

	test('an unset convention field stores as null, not as the convention’s number', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		await addStrengthSegment(athleteId, strengthSegmentInput(trackId))

		// `null` is a value the athlete chose — "follow the documented convention" —
		// and stays deliberately distinguishable from an authored number of the same
		// size, so moving the convention later leaves their own numbers alone
		// (ADR 0044 §4). The convention is −50% over 1 week (Bell 2025), and neither
		// figure may be written here as though it had been authored.
		const [stored] = await storedStrengthSegments(trackId)
		expect(stored).toMatchObject({
			ramp: null,
			boundaryStep: null,
			deloadCut: null,
			deloadWeeks: null,
		})
		expect(stored?.deloadCut).not.toBe(DEFAULT_DELOAD_CUT)
		expect(stored?.deloadWeeks).not.toBe(DEFAULT_DELOAD_WEEKS)
	})

	test('two strength segments cannot open in the same week', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()
		await addStrengthSegment(athleteId, strengthSegmentInput(trackId))

		// `@@unique([trackId, startWeekKey])` makes this structural; the service turns
		// it into a refusal the surface can word rather than a constraint violation.
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				weeks: 2,
			}),
		).toEqual({ ok: false, reason: 'week-already-opens-a-segment' })
		expect(await storedStrengthSegments(trackId)).toHaveLength(1)
	})

	test('two strength segments whose windows overlap are refused', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()
		// Weeks 0–3.
		await addStrengthSegment(athleteId, strengthSegmentInput(trackId))

		// Opens on week 3, which the first segment still holds. The opening weeks
		// differ, so the unique index says nothing; the derivation resolves the
		// collision only by a documented latest-start-wins tie-break, which is a
		// state to refuse rather than one to author.
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: WEEK_4,
				weeks: 4,
			}),
		).toEqual({ ok: false, reason: 'segments-overlap' })
		expect(await storedStrengthSegments(trackId)).toHaveLength(1)
	})

	test('a gap between two strength segments is authorable, not an error', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()
		await addStrengthSegment(athleteId, strengthSegmentInput(trackId))

		// Weeks 0–3 lift, weeks 4–7 do not, weeks 8–11 lift. The gap is the positive
		// statement "no lifting these weeks" and is exactly why segments float free
		// of the phases (ADR 0047 §6) — a hole in the plan would be a defect, and
		// this is not one.
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: WEEK_9,
			}),
		).toEqual({ ok: true, segmentId: expect.any(String) })
		expect(
			(await storedStrengthSegments(trackId)).map((s) => s.startWeekKey),
		).toEqual([START_WEEK_KEY, WEEK_9])
	})

	test('two adjacent segments touch without overlapping', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()
		// Weeks 0–3.
		await addStrengthSegment(athleteId, strengthSegmentInput(trackId))

		// A window is `[start, start + weeks)`, so a segment opening on week 4 begins
		// exactly where the first ends — back-to-back segments, the ordinary case.
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: WEEK_5,
			}),
		).toEqual({ ok: true, segmentId: expect.any(String) })
	})

	test('an endurance track refuses a strength segment', async () => {
		const athleteId = await createAthlete()
		const eventId = await createRace(athleteId)
		await createPlanOutline(athleteId, planInput(eventId), NOW)
		const run = await prisma.trainingTrack.findFirstOrThrow({
			where: { outline: { eventId } },
			select: { id: true },
		})

		// The `TrainingTrackSegment_kind_position` CHECK holds the row's *shape*, but
		// nothing structural says a run track may not carry a strength block — so the
		// service refuses cleanly rather than authoring a lift block on a run track.
		expect(
			await addStrengthSegment(athleteId, strengthSegmentInput(run.id)),
		).toEqual({ ok: false, reason: 'not-a-strength-track' })
		expect(
			await prisma.trainingTrackSegment.count({
				where: { trackId: run.id, kind: 'strength' },
			}),
		).toBe(0)
	})

	test('a track that is not the athlete’s reads as absent', async () => {
		const { trackId } = await strengthTrackedPlan()
		const intruder = await createAthlete()

		expect(
			await addStrengthSegment(intruder, strengthSegmentInput(trackId)),
		).toEqual({ ok: false, reason: 'track-not-found' })
		expect(await storedStrengthSegments(trackId)).toEqual([])
	})

	test('a start week that is not a Monday is refused', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		// Every week-scoped row is keyed by the Monday opening its Training Week
		// (ADR 0044 §3), which `WeekKeySchema` holds for a segment exactly as it does
		// for the Plan Start Week.
		await expect(
			addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: '2030-02-05',
			}),
		).rejects.toThrow(/Monday/)
	})

	test('a start week outside the plan’s weeks is refused, at either end', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: BEFORE_PLAN_WEEK_KEY,
			}),
		).toEqual({ ok: false, reason: 'start-week-outside-the-plan' })
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: AFTER_PLAN_WEEK_KEY,
			}),
		).toEqual({ ok: false, reason: 'start-week-outside-the-plan' })
		expect(await storedStrengthSegments(trackId)).toEqual([])
	})

	test('a segment whose window runs past the end of the plan is refused', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		// The weeks past the plan's last are an **Unavailable Metric** by
		// construction — `strengthWeekTarget` reads them as null — so a window
		// reaching over the edge stores an intent nothing can price.
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: LAST_WEEK_KEY,
				weeks: 2,
			}),
		).toEqual({ ok: false, reason: 'segment-runs-past-the-plan' })
		// One week, filling the plan's last week exactly, is inside it.
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: LAST_WEEK_KEY,
				weeks: 1,
			}),
		).toEqual({ ok: true, segmentId: expect.any(String) })
	})

	test('a segment ending before the event is a peaking strategy, not an error', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		// A strength track needs no taper mechanism: peaking is a negative **Block
		// Boundary Step**, a tail deload, or a segment that simply ends early — which
		// is one of the three reasons segments float free (ADR 0047 §6).
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				weeks: 4,
				boundaryStep: -0.35,
			}),
		).toEqual({ ok: true, segmentId: expect.any(String) })
	})

	test('a deload longer than the segment is refused', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		await expect(
			addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				weeks: 4,
				deloadWeeks: 5,
			}),
		).rejects.toThrow(/deload/i)
		// A deload covering the whole segment is odd but authorable — the tail is the
		// whole of it, and nothing here decides for the athlete how deep a block goes.
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				weeks: 4,
				deloadWeeks: 4,
			}),
		).toEqual({ ok: true, segmentId: expect.any(String) })
		// A deload of zero weeks is a block with no deload at all, which is a choice
		// and is distinguishable from the unset convention of one week.
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: WEEK_5,
				deloadWeeks: 0,
			}),
		).toEqual({ ok: true, segmentId: expect.any(String) })
	})

	test('a Strength Frequency of one is authorable, though ACSM prescribes two', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		// ACSM 2026's ≥2 sessions/wk is a **convention**, not a bound: it warns where
		// it is worth saying and never blocks (ADR 0047 §4, ADR 0040 §12).
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				sessionsPerWeek: 1,
			}),
		).toEqual({ ok: true, segmentId: expect.any(String) })
		// Zero is not a frequency: "no lifting these weeks" is the segment not
		// existing, which is what makes a gap meaningful.
		await expect(
			addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: WEEK_5,
				sessionsPerWeek: 0,
			}),
		).rejects.toThrow()
		// A week has seven days, so `70` meant as `7` is the typo this catches.
		await expect(
			addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: WEEK_5,
				sessionsPerWeek: 70,
			}),
		).rejects.toThrow(/typo/)
	})

	test('a goal outside ACSM’s three is refused, and no band or rep range is typable', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		await expect(
			addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				// The middle goal is `maximal-strength`, under the field's own term —
				// 'strength' on its own is not one of the three (ADR 0047 §3).
				// @ts-expect-error not a Strength Goal.
				goal: 'strength',
			}),
		).rejects.toThrow()
		// The `%1RM` band and the rep range **derive** from the goal and cannot be
		// authored beside it, so neither is a field any input here has — `.strict()`
		// refuses one at runtime and the type refuses it at compile time.
		await expect(
			addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				// @ts-expect-error ADR 0047 §3 — the band derives from the goal.
				minPct1RM: 80,
			}),
		).rejects.toThrow()
		expect(await storedStrengthSegments(trackId)).toEqual([])
	})

	test('a ramp steeper than the guard’s convention is stored, not refused', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		// Nothing here consults the **ramp guard**: it warns and never blocks
		// (ADR 0040 §12, and ADR 0047 §1 gives it a second track to guard), so the
		// value is stored exactly as authored.
		expect(
			await addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				ramp: 0.25,
			}),
		).toEqual({ ok: true, segmentId: expect.any(String) })
		expect((await storedStrengthSegments(trackId))[0]).toMatchObject({
			ramp: 0.25,
		})
		// The storable range is a typo guard and nothing more: 5 meant as 5% a week.
		await expect(
			addStrengthSegment(athleteId, {
				...strengthSegmentInput(trackId),
				startWeekKey: WEEK_5,
				ramp: 5,
			}),
		).rejects.toThrow(/typo/)
	})

	test('a flat anchor across two blocks is an ordinary plan, never an incomplete one', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()

		// No upward ratchet, in any form (ADR 0047 §7): nothing here proposes a higher
		// opening volume for the second block, and two blocks that both open flat are
		// authored and stored exactly as typed.
		await addStrengthSegment(athleteId, {
			...strengthSegmentInput(trackId),
			ramp: null,
			boundaryStep: null,
		})
		await addStrengthSegment(athleteId, {
			...strengthSegmentInput(trackId),
			startWeekKey: WEEK_9,
			ramp: null,
			boundaryStep: null,
		})

		expect(
			(await storedStrengthSegments(trackId)).map((s) => ({
				ramp: s.ramp,
				boundaryStep: s.boundaryStep,
			})),
		).toEqual([
			{ ramp: null, boundaryStep: null },
			{ ramp: null, boundaryStep: null },
		])
	})
})

describe('setStrengthSegment', () => {
	/** One authored segment on a strength track, ready to be re-authored. */
	async function authoredStrengthSegment() {
		const plan = await strengthTrackedPlan()
		const added = await addStrengthSegment(
			plan.athleteId,
			strengthSegmentInput(plan.trackId),
		)
		if (!added.ok) throw new Error(`segment not added: ${added.reason}`)
		return { ...plan, segmentId: added.segmentId }
	}

	test('setting re-authors the whole segment, window included', async () => {
		const { athleteId, trackId, segmentId } = await authoredStrengthSegment()

		const result = await setStrengthSegment(athleteId, {
			segmentId,
			startWeekKey: WEEK_5,
			weeks: 5,
			ramp: 0.03,
			boundaryStep: 0.1,
			goal: 'power',
			sessionsPerWeek: 2,
			deloadCut: 0.5,
			deloadWeeks: 2,
		})

		expect(result).toEqual({ ok: true })
		expect(await storedStrengthSegments(trackId)).toEqual([
			{
				id: segmentId,
				kind: 'strength',
				phaseId: null,
				startWeekKey: WEEK_5,
				weeks: 5,
				ramp: 0.03,
				boundaryStep: 0.1,
				goal: 'power',
				sessionsPerWeek: 2,
				deloadCut: 0.5,
				deloadWeeks: 2,
			},
		])
	})

	test('a convention field can be cleared back to the convention', async () => {
		const { athleteId, trackId, segmentId } = await authoredStrengthSegment()
		const authored = {
			segmentId,
			startWeekKey: START_WEEK_KEY,
			weeks: 4,
			ramp: 0.05,
			boundaryStep: -0.2,
			goal: 'hypertrophy' as const,
			sessionsPerWeek: 3,
			deloadCut: 0.45,
			deloadWeeks: 2,
		}
		await setStrengthSegment(athleteId, authored)

		await setStrengthSegment(athleteId, {
			...authored,
			ramp: null,
			boundaryStep: null,
			deloadCut: null,
			deloadWeeks: null,
		})

		// An authored −50% and the convention's own −50% are different states, so
		// clearing has to be expressible — a partial update could not say it.
		expect((await storedStrengthSegments(trackId))[0]).toMatchObject({
			ramp: null,
			boundaryStep: null,
			deloadCut: null,
			deloadWeeks: null,
		})
	})

	test('re-authoring a segment in place does not collide with itself', async () => {
		const { athleteId, segmentId } = await authoredStrengthSegment()

		// The overlap and same-opening-week checks are against the *siblings*: a
		// segment cannot open in its own week twice.
		expect(
			await setStrengthSegment(athleteId, {
				segmentId,
				startWeekKey: START_WEEK_KEY,
				weeks: 6,
				ramp: null,
				boundaryStep: null,
				goal: 'hypertrophy',
				sessionsPerWeek: 3,
				deloadCut: null,
				deloadWeeks: null,
			}),
		).toEqual({ ok: true })
	})

	test('moving a segment onto a sibling’s week or window is refused', async () => {
		const { athleteId, trackId, segmentId } = await authoredStrengthSegment()
		await addStrengthSegment(athleteId, {
			...strengthSegmentInput(trackId),
			startWeekKey: WEEK_9,
			weeks: 4,
		})
		const move = (startWeekKey: string, weeks: number) =>
			setStrengthSegment(athleteId, {
				segmentId,
				startWeekKey,
				weeks,
				ramp: null,
				boundaryStep: null,
				goal: 'hypertrophy' as const,
				sessionsPerWeek: 3,
				deloadCut: null,
				deloadWeeks: null,
			})

		expect(await move(WEEK_9, 2)).toEqual({
			ok: false,
			reason: 'week-already-opens-a-segment',
		})
		// Growing over the sibling rather than landing on its opening week.
		expect(await move(START_WEEK_KEY, 10)).toEqual({
			ok: false,
			reason: 'segments-overlap',
		})
		// The refused writes left the segment where it was.
		expect((await storedStrengthSegments(trackId))[0]).toMatchObject({
			startWeekKey: START_WEEK_KEY,
			weeks: 4,
		})
	})

	test('a window moved past the end of the plan is refused', async () => {
		const { athleteId, segmentId } = await authoredStrengthSegment()

		expect(
			await setStrengthSegment(athleteId, {
				segmentId,
				startWeekKey: WEEK_9,
				weeks: 8,
				ramp: null,
				boundaryStep: null,
				goal: 'hypertrophy',
				sessionsPerWeek: 3,
				deloadCut: null,
				deloadWeeks: null,
			}),
		).toEqual({ ok: false, reason: 'segment-runs-past-the-plan' })
	})

	test('another athlete’s segment, and an endurance segment, read as absent', async () => {
		const { segmentId } = await authoredStrengthSegment()
		const intruder = await createAthlete()
		const eventId = await createRace(intruder)
		await createPlanOutline(intruder, planInput(eventId), NOW)
		const [enduranceSegment] = await segmentsOf(eventId)
		const authored = {
			startWeekKey: WEEK_5,
			weeks: 3,
			ramp: null,
			boundaryStep: null,
			goal: 'power' as const,
			sessionsPerWeek: 2,
			deloadCut: null,
			deloadWeeks: null,
		}

		expect(
			await setStrengthSegment(intruder, { ...authored, segmentId }),
		).toEqual({ ok: false, reason: 'segment-not-found' })
		// An endurance segment authors its progression by its own path and its
		// intensity as a **Quality Session Mix** — it has no goal to set.
		expect(
			await setStrengthSegment(intruder, {
				...authored,
				segmentId: enduranceSegment!.id,
			}),
		).toEqual({ ok: false, reason: 'segment-not-found' })
	})
})

describe('removeStrengthSegment', () => {
	test('removing takes the segment and leaves its siblings', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()
		const first = await addStrengthSegment(
			athleteId,
			strengthSegmentInput(trackId),
		)
		await addStrengthSegment(athleteId, {
			...strengthSegmentInput(trackId),
			startWeekKey: WEEK_9,
		})
		if (!first.ok) throw new Error('segment not added')

		expect(
			await removeStrengthSegment(athleteId, { segmentId: first.segmentId }),
		).toEqual({ ok: true })
		// Removing a strength segment is how "stop lifting these weeks" is authored:
		// the weeks it held become a gap, which is a positive state (ADR 0047 §6).
		expect(
			(await storedStrengthSegments(trackId)).map((s) => s.startWeekKey),
		).toEqual([WEEK_9])
	})

	test('the week a removal frees can be authored again', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()
		const added = await addStrengthSegment(
			athleteId,
			strengthSegmentInput(trackId),
		)
		if (!added.ok) throw new Error('segment not added')
		await removeStrengthSegment(athleteId, { segmentId: added.segmentId })

		expect(
			await addStrengthSegment(athleteId, strengthSegmentInput(trackId)),
		).toEqual({ ok: true, segmentId: expect.any(String) })
	})

	test('another athlete’s segment reads as absent', async () => {
		const { athleteId, trackId } = await strengthTrackedPlan()
		const intruder = await createAthlete()
		const added = await addStrengthSegment(
			athleteId,
			strengthSegmentInput(trackId),
		)
		if (!added.ok) throw new Error('segment not added')

		expect(
			await removeStrengthSegment(intruder, { segmentId: added.segmentId }),
		).toEqual({ ok: false, reason: 'segment-not-found' })
		expect(await storedStrengthSegments(trackId)).toHaveLength(1)
	})

	test('an endurance segment is not removable through the strength path', async () => {
		const athleteId = await createAthlete()
		const eventId = await createRace(athleteId)
		await createPlanOutline(athleteId, planInput(eventId), NOW)
		const [base] = await segmentsOf(eventId)

		// An endurance segment goes with its phase and never on its own (ADR 0042 §8).
		expect(
			await removeStrengthSegment(athleteId, { segmentId: base!.id }),
		).toEqual({ ok: false, reason: 'segment-not-found' })
		expect(await segmentsOf(eventId)).toHaveLength(3)
	})
})

test('no strength authoring path carries a Volume Currency', async () => {
	const { athleteId, trackId } = await strengthTrackedPlan()

	// The type-level half is the `CarriesCurrency<PlanOutlineUpdateInput>` assertion
	// above, which every new member of the union has to satisfy. This is the runtime
	// half: `.strict()` refuses the write outright rather than dropping the stray
	// key, so a form body cannot smuggle a currency change through a segment save
	// (ADR 0044 §8, ADR 0043 §2 — a track's currency is fixed for its life).
	await expect(
		addStrengthSegment(athleteId, {
			...strengthSegmentInput(trackId),
			// @ts-expect-error ADR 0044 §8 — no update input carries `currency`.
			currency: 'km',
		}),
	).rejects.toThrow()

	expect(await storedStrengthSegments(trackId)).toEqual([])
	expect(
		(
			await prisma.trainingTrack.findUniqueOrThrow({
				where: { id: trackId },
				select: { currency: true },
			})
		).currency,
	).toBe('sets')
})

// ── Hand-setting a week: the Week Volume Override (#406) ─────────────────────
// A **Week Volume Override** is the athlete overruling the rule for one week, and
// nothing more (ADR 0044 §5). The two operations below hold what the storage
// cannot:
//
// - **`0` is a value.** A week without training is a thing an athlete means, and
//   `0` says it exactly — so the input floor is zero rather than the anchor's
//   "more than zero", and the row is stored rather than treated as a clear.
// - **A row is keyed to a week the plan contains.** `weekTarget`'s short-circuit
//   is total, so a row keyed outside the span would be a target for a week no
//   season holds and no revert could reach. Refused here, where the plan's span is
//   knowable, rather than in the derivation.
// - **It hangs off the track**, which is why a strength track's week hand-sets
//   exactly like a run track's.

/** A plan whose single track is `track`, and the id a week-scoped write addresses. */
async function trackedPlan(
	track: TrackCreateInput = {
		discipline: 'run',
		currency: 'km',
		anchorValue: 55,
	},
) {
	const athleteId = await createAthlete()
	const eventId = await createRace(athleteId)
	const created = await createPlanOutline(
		athleteId,
		{ ...planInput(eventId), tracks: [track] },
		NOW,
	)
	if (!created.ok) throw new Error(`plan not created: ${created.reason}`)
	const trackRow = await prisma.trainingTrack.findFirstOrThrow({
		where: { outline: { eventId } },
		select: { id: true },
	})
	return { athleteId, eventId, trackId: trackRow.id }
}

/** Every hand-set week stored on a plan, earliest first. */
async function storedOverrides(eventId: string) {
	return prisma.weekVolumeOverride.findMany({
		where: { track: { outline: { eventId } } },
		orderBy: { weekKey: 'asc' },
		select: { weekKey: true, value: true },
	})
}

describe('week volume overrides', () => {
	/** The plan's fourth week — the one Base's 3:1 rhythm makes a recovery week. */
	const RECOVERY_WEEK = '2030-01-28'

	test('typing a target stores one row against that week’s Monday', async () => {
		const { athleteId, eventId, trackId } = await trackedPlan()

		expect(
			await setWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: RECOVERY_WEEK,
				value: 45,
			}),
		).toEqual({ ok: true })
		expect(await storedOverrides(eventId)).toEqual([
			{ weekKey: RECOVERY_WEEK, value: 45 },
		])
	})

	test('zero is a week off, stored rather than refused', async () => {
		const { athleteId, eventId, trackId } = await trackedPlan()

		expect(
			await setWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: RECOVERY_WEEK,
				value: 0,
			}),
		).toEqual({ ok: true })
		// `0` expresses a week without training and needs no separate flag
		// (ADR 0044 §5) — so it is a stored row, not an absent one.
		expect(await storedOverrides(eventId)).toEqual([
			{ weekKey: RECOVERY_WEEK, value: 0 },
		])
	})

	test('hand-setting the same week again updates the one row', async () => {
		const { athleteId, eventId, trackId } = await trackedPlan()

		await setWeekVolumeOverride(athleteId, {
			trackId,
			weekKey: RECOVERY_WEEK,
			value: 45,
		})
		await setWeekVolumeOverride(athleteId, {
			trackId,
			weekKey: RECOVERY_WEEK,
			value: 38,
		})

		// One row per track per week, so a second thought is an edit and never a
		// second statement about the same week.
		expect(await storedOverrides(eventId)).toEqual([
			{ weekKey: RECOVERY_WEEK, value: 38 },
		])
	})

	test('clearing reverts the week to the rule, and a week with no override refuses', async () => {
		const { athleteId, eventId, trackId } = await trackedPlan()
		await setWeekVolumeOverride(athleteId, {
			trackId,
			weekKey: RECOVERY_WEEK,
			value: 45,
		})

		expect(
			await clearWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: RECOVERY_WEEK,
			}),
		).toEqual({ ok: true })
		expect(await storedOverrides(eventId)).toEqual([])
		// Reverting a week that was never hand-set is refused rather than silently
		// succeeding: a stale reading's button says why.
		expect(
			await clearWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: RECOVERY_WEEK,
			}),
		).toEqual({ ok: false, reason: 'override-not-found' })
	})

	test('a week orphaned by a shrunken plan is still clearable', async () => {
		const { athleteId, eventId, trackId } = await trackedPlan()
		// The plan's own last week, hand-set while the season still reached it — so the
		// row was authored legally and the span check had nothing to say about it.
		const LAST_WEEK = '2030-04-01'
		expect(
			await setWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: LAST_WEEK,
				value: 30,
			}),
		).toEqual({ ok: true })

		// Base shrinks from eight weeks to four, so the season now ends five weeks
		// before the week that carries the override. Nothing rewrites the row: an
		// override is keyed to a Monday, so a structural edit leaves it where it was
		// (ADR 0044 §3).
		const base = await prisma.planOutlinePhase.findFirstOrThrow({
			where: { outline: { eventId }, orderIndex: 0 },
			select: { id: true },
		})
		expect(
			await resizePhase(athleteId, { phaseId: base.id, weeks: 4 }),
		).toEqual({ ok: true })

		// Clearing **removes** state, so it is always safe — and it has to be allowed,
		// or a row the Weeks reading no longer shows would be unrevertible and would
		// silently re-apply the moment the season lengthened again. "An override can be
		// cleared, restoring the derived value" is unconditional (ADR 0044 §5).
		expect(
			await clearWeekVolumeOverride(athleteId, { trackId, weekKey: LAST_WEEK }),
		).toEqual({ ok: true })
		expect(await storedOverrides(eventId)).toEqual([])
	})

	test('another athlete cannot hand-set or clear a week, and nothing is written', async () => {
		const { athleteId: owner, eventId, trackId } = await trackedPlan()
		const intruder = await createAthlete()

		expect(
			await setWeekVolumeOverride(intruder, {
				trackId,
				weekKey: RECOVERY_WEEK,
				value: 999,
			}),
		).toEqual({ ok: false, reason: 'track-not-found' })
		expect(await storedOverrides(eventId)).toEqual([])

		await setWeekVolumeOverride(owner, {
			trackId,
			weekKey: RECOVERY_WEEK,
			value: 45,
		})
		expect(
			await clearWeekVolumeOverride(intruder, {
				trackId,
				weekKey: RECOVERY_WEEK,
			}),
		).toEqual({ ok: false, reason: 'track-not-found' })
		// Ownership is checked before the delete, so a stranger cannot revert
		// someone else's week.
		expect(await storedOverrides(eventId)).toEqual([
			{ weekKey: RECOVERY_WEEK, value: 45 },
		])
	})

	test('a week the athlete never touched carries no row at all', async () => {
		const { athleteId, eventId, trackId } = await trackedPlan()
		await setWeekVolumeOverride(athleteId, {
			trackId,
			weekKey: RECOVERY_WEEK,
			value: 45,
		})

		// Stored lazily — absent unless authored. Thirteen derived weeks, one row.
		const season = await readSeason(athleteId)
		expect(season.weeks).toHaveLength(13)
		expect(await storedOverrides(eventId)).toHaveLength(1)
	})

	test('a week key that is not a Monday is refused', async () => {
		const { athleteId, eventId, trackId } = await trackedPlan()

		await expect(
			setWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: '2030-01-29', // the Tuesday inside the same Training Week
				value: 45,
			}),
		).rejects.toThrow(/Monday/)
		await expect(
			clearWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: '2030-01-29',
			}),
		).rejects.toThrow(/Monday/)
		expect(await storedOverrides(eventId)).toEqual([])
	})

	test('hand-setting a week outside the plan’s span is refused, at either end', async () => {
		const { athleteId, eventId, trackId } = await trackedPlan()

		// The plan runs thirteen weeks from 2030-01-07, so 2029-12-31 is the week
		// before it opens and 2030-04-08 the week after it ends. Both ends, because a
		// span check tested at one end only is half a check.
		for (const weekKey of ['2029-12-31', '2030-04-08']) {
			expect(
				await setWeekVolumeOverride(athleteId, { trackId, weekKey, value: 45 }),
			).toEqual({ ok: false, reason: 'week-outside-plan' })
			// The span is the *set* path's gate alone: clearing removes state, so it
			// answers about the override rather than about the week.
			expect(
				await clearWeekVolumeOverride(athleteId, { trackId, weekKey }),
			).toEqual({ ok: false, reason: 'override-not-found' })
		}
		expect(await storedOverrides(eventId)).toEqual([])
		// The last week the plan does contain is hand-settable, so the bound is the
		// week after the season rather than one inside it.
		expect(
			await setWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: '2030-04-01',
				value: 45,
			}),
		).toEqual({ ok: true })
	})

	test('a strength track hand-sets a week exactly like a run track', async () => {
		const { athleteId, eventId, trackId } = await trackedPlan({
			discipline: 'strength',
			currency: 'sets',
			anchorValue: 18,
		})

		// An override hangs off the **track**, so it works identically for a strength
		// track — ADR 0044 §5, and the reason there is no second operation for lifting.
		expect(
			await setWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: RECOVERY_WEEK,
				value: 12,
			}),
		).toEqual({ ok: true })
		expect(await storedOverrides(eventId)).toEqual([
			{ weekKey: RECOVERY_WEEK, value: 12 },
		])

		const season = await readSeason(athleteId)
		expect(season.weeks[3]!.targets[0]).toMatchObject({
			trackId,
			currency: 'sets',
			value: 12,
			overridden: true,
			// The strength walk prices this week since ADR 0047 §1, and the plan has no
			// lifting block on it, so what a revert restores is the authored "no lifting
			// this week" — `0`, a positive statement (ADR 0047 §6) and not an Unavailable.
			derivedValue: 0,
		})

		expect(
			await clearWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: RECOVERY_WEEK,
			}),
		).toEqual({ ok: true })
		expect(await storedOverrides(eventId)).toEqual([])
		expect((await readSeason(athleteId)).weeks[3]!.targets[0]).toMatchObject({
			value: 0,
			overridden: false,
		})
	})

	test('the stored value is the week’s final target, and the weeks after it are untouched', async () => {
		const { athleteId, trackId } = await trackedPlan()
		const before = await readSeason(athleteId)
		expect(before.weeks[3]!.weekKey).toBe(RECOVERY_WEEK)
		expect(before.weeks[3]!.role).toBe('recovery')

		await setWeekVolumeOverride(athleteId, {
			trackId,
			weekKey: RECOVERY_WEEK,
			value: 45,
		})

		// Read back through the whole server path — query, `from-rows`, derivation —
		// so the wiring is proven rather than the pure layer being asked twice.
		const after = await readSeason(athleteId)
		// Final: 45 means 45 on a recovery week, not 45 × 0.7.
		expect(after.weeks[3]!.targets[0]).toMatchObject({
			trackId,
			value: 45,
			overridden: true,
			derivedValue: before.weeks[3]!.targets[0]!.value,
		})
		// A leaf: the following weeks still compute from the anchor and the ramps.
		expect(after.weeks[4]!.targets[0]!.value).toBe(
			before.weeks[4]!.targets[0]!.value,
		)
		expect(after.weeks[4]!.targets[0]!.overridden).toBe(false)
		expect(after.weeks[12]!.targets[0]!.value).toBe(
			before.weeks[12]!.targets[0]!.value,
		)
	})

	test('a hand-set week survives a later re-anchor, still marked and still revertible', async () => {
		const { athleteId, trackId } = await trackedPlan()
		await setWeekVolumeOverride(athleteId, {
			trackId,
			weekKey: RECOVERY_WEEK,
			value: 45,
		})

		// A re-anchor is a **second dated segment**, never an edit of the first
		// (ADR 0040 §5) — and this one takes effect from the week before the hand-set
		// one, so the rule's answer for that week genuinely changes underneath it.
		expect(
			await setSeasonAnchorValue(athleteId, {
				trackId,
				fromWeekKey: '2030-01-21', // the plan's third week
				value: 40,
			}),
		).toEqual({ ok: true })

		// Read through the whole server path, because what story 56 asks for is that
		// the athlete's explicit statement about a week is not *silently discarded* —
		// which is a property of the reading, not of the row.
		const after = await readSeason(athleteId)
		expect(after.weeks[3]!.targets[0]).toMatchObject({
			trackId,
			value: 45,
			overridden: true,
		})
		// Marked *and* revertible: the rule moved to the new anchor, so what a revert
		// would restore is the new anchor's recovery week (40 × (1 − 30%)) rather than
		// the number the old anchor gave.
		expect(after.weeks[3]!.targets[0]!.derivedValue).toBeCloseTo(28, 6)

		expect(
			await clearWeekVolumeOverride(athleteId, {
				trackId,
				weekKey: RECOVERY_WEEK,
			}),
		).toEqual({ ok: true })
		const reverted = await readSeason(athleteId)
		expect(reverted.weeks[3]!.targets[0]!.overridden).toBe(false)
		expect(reverted.weeks[3]!.targets[0]!.value).toBeCloseTo(28, 6)
	})
})
