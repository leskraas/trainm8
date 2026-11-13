// Editing the activities in _Meg_, against the database (#587, ADR 0109):
// the preview (_Vis ny uke_) and the apply (_Bekreft_). Both run one
// computation, `computeActivitiesEdit`, over the same stored rows, the
// preview through `prisma` and the apply inside its transaction, so what the
// athlete confirmed is what lands: the apply recomputes it and refuses with
// `preview-stale` when its digest differs from the one confirmed, as the
// philosophy switch does (`philosophy.server.ts`).
//
// What stays, and why it is safe (ADR 0109 §6):
//   - **Lived weeks.** Nothing before the first unbegun week is written: the
//     phase being lived is cut there, and every anchor, override, segment and
//     block the edit writes is from it on.
//   - **The athlete's sessions.** After commit the weeks from the boundary are
//     laid again through the stamp, whose clearing is the gated
//     `clearPlanWeek`: only the machine's untrained sessions go. A session the
//     athlete wrote or adopted stays on its day, on a removed sport too, and
//     the week is laid around it, as the preview showed.

import { type Prisma } from '@prisma/client'
import {
	localDate,
	weekBoundsFromMondayUTC,
	weekdayIndex,
	weekMonday,
} from '../athlete-calendar.ts'
import {
	getAthleteTimezone,
	readAvailablePatternDays,
} from '../athlete.server.ts'
import { plannedMinutes } from '../prescribed-duration.ts'
import { prisma } from '../db.server.ts'
import { readEffortWord } from '../effort-word.ts'
import { liftDisplayName } from '../exercise-aliases-nb.ts'
import { type DisciplineThresholdMap } from '../intensity-target.ts'
import { liftSchemeLabel } from '../labels.ts'
import { upcomingSessionSelect } from '../ledger-session.ts'
import { readFirstUnbegunWeekKey } from '../load/week-begun.server.ts'
import { STARTER_PATTERN_NAME } from '../plan-outline/authoring.server.ts'
import { phaseSpecs } from '../plan-outline/from-rows.ts'
import {
	closePendingRounds,
	relayPlanFrom,
} from '../plan-outline/open-ended.server.ts'
import { outlineFamily } from '../plan-outline/presets.ts'
import {
	readHeldSessions,
	readKeptSlots,
	stampWeekPattern,
} from '../plan-outline/stamp.server.ts'
import { PROPOSED_STRENGTH_GOAL } from '../plan-outline/strength-offer.server.ts'
import { weekIndexOf, weekKeyAt } from '../plan-outline/week-keys.ts'
import { isPatternWeekday } from '../plan-outline/week-pattern.ts'
import {
	clearPlanWeek,
	REPLACEABLE_SESSION,
} from '../plan-outline/week-sessions.server.ts'
import { createSimpleActivityWorkout } from '../simple-activity.server.ts'
import { getActiveSeason, getDisciplineThresholds } from '../training.server.ts'
import {
	activitiesOf,
	choiceRefusal,
	editedAnswers,
	previewActivitiesEdit,
	type ActivitiesChoice,
	type ActivitiesChoiceRefusal,
	type ActivitiesEditPreview,
	type KeptSession,
} from './activities-edit.ts'
import {
	readPlanStartAnswers,
	type PlanStartAnswersReading,
} from './plan-start-options.server.ts'
import {
	draftStart,
	layStartFamily,
	type TrainingLevel,
} from './start-draft.ts'
import { readLiftingWorkoutId } from './start-strength.server.ts'

export type ActivitiesEditRefusal =
	| ActivitiesChoiceRefusal
	/** No plan, or not this athlete's. */
	| 'outline-not-found'
	/** A plan the edit cannot lay: toward an Event, in km or TSS, lifting only. */
	| 'not-editable'
	/** The activities and days lay no week. */
	| 'nothing-to-lay'
	/**
	 * The edit would now differ from the preview the athlete confirmed: a
	 * session added, moved or adopted in the boundary week, a week begun, or
	 * the plan changed elsewhere since they looked.
	 */
	| 'preview-stale'

export type ActivitiesEditResult =
	| {
			ok: true
			outlineId: string
			/** The Training Level the week was laid at: its session cap. */
			level: TrainingLevel
			/** The plan's hours a week the week was laid for. */
			hours: number
			/** The boundary is the week being lived: nothing trained in it yet. */
			boundaryThisWeek: boolean
			preview: ActivitiesEditPreview
	  }
	| { ok: false; reason: ActivitiesEditRefusal }

/**
 * What the edit reads before its transaction: what a confirm does not change
 * and the one connection a transaction holds could not read inside it — the
 * athlete's zone, answers, thresholds and days, and the plan read back as
 * the start's answers.
 */
type EditContext = {
	userId: string
	now: Date
	timezone: string
	outlineId: string
	reading: Extract<PlanStartAnswersReading, { ok: true }>
	thresholds: DisciplineThresholdMap
	liftingDays: ReturnType<typeof readAvailablePatternDays> extends Promise<
		infer Days
	>
		? Days
		: never
}

async function readEditContext(
	userId: string,
	now: Date,
): Promise<EditContext | { ok: false; reason: ActivitiesEditRefusal }> {
	const timezone = await getAthleteTimezone(userId)
	const season = await getActiveSeason(userId, now)
	if (!season) return { ok: false, reason: 'outline-not-found' }
	const boundary = await readFirstUnbegunWeekKey(userId, now, timezone)
	const reading = await readPlanStartAnswers(userId, season, boundary, now)
	if (!reading.ok || reading.readOnly) {
		return { ok: false, reason: 'not-editable' }
	}
	const [thresholds, liftingDays] = await Promise.all([
		getDisciplineThresholds(userId),
		readAvailablePatternDays(userId),
	])
	return {
		userId,
		now,
		timezone,
		outlineId: season.outlineId,
		reading,
		thresholds,
		liftingDays,
	}
}

/** The plan's rows as the edit reads them, in the stamp's own shape. */
const editOutlineSelect = {
	id: true,
	startWeekKey: true,
	family: true,
	eventId: true,
	phases: {
		orderBy: { orderIndex: 'asc' as const },
		select: {
			id: true,
			orderIndex: true,
			name: true,
			weeks: true,
			rhythm: true,
			tapers: true,
			recoveryWeekIndex: true,
		},
	},
	tracks: {
		select: {
			id: true,
			discipline: true,
			currency: true,
			pinnedDays: true,
			anchors: {
				orderBy: { fromWeekKey: 'asc' as const },
				select: { fromWeekKey: true, value: true },
			},
			segments: {
				select: {
					id: true,
					kind: true,
					phaseId: true,
					ramp: true,
					boundaryStep: true,
					recoveryCut: true,
					taperCut: true,
					startWeekKey: true,
					weeks: true,
					goal: true,
					sessionsPerWeek: true,
					deloadCut: true,
					deloadWeeks: true,
					mix: {
						orderBy: { zone: 'asc' as const },
						select: { zone: true, sessionsPerWeek: true },
					},
				},
			},
			overrides: {
				orderBy: { weekKey: 'asc' as const },
				select: { weekKey: true, value: true },
			},
		},
	},
} satisfies Prisma.PlanOutlineSelect

/**
 * The athlete's sessions in the boundary week that the re-lay keeps where
 * they are: the ones they wrote, and any another plan laid (the stamp's held
 * sessions), and the plan's own it keeps (adopted, or trained).
 */
async function readKeptSessions(
	db: Prisma.TransactionClient,
	{ userId, timezone, thresholds }: EditContext,
	outlineId: string,
	weekKey: string,
): Promise<KeptSession[]> {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
	const rows = await db.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: start, lte: end },
			OR: [
				{
					status: { in: ['scheduled', 'completed'] },
					OR: [
						{ source: 'authored' },
						{ planOutlineId: null },
						{ planOutlineId: { not: outlineId } },
					],
				},
				{
					planOutlineId: outlineId,
					source: { not: 'authored' },
					NOT: REPLACEABLE_SESSION,
				},
			],
		},
		orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
		select: {
			id: true,
			scheduledAt: true,
			workout: upcomingSessionSelect.workout,
		},
	})
	return rows.flatMap((row): KeptSession[] => {
		const weekday = weekdayIndex(localDate(row.scheduledAt, timezone))
		if (!row.workout || !isPatternWeekday(weekday)) return []
		const { workout } = row
		const lifts =
			workout.discipline === 'strength'
				? workout.blocks.flatMap((block) =>
						block.steps.flatMap((step) => {
							if (!step.exercise || step.sets.length === 0) return []
							const reps = step.sets[0]!.reps
							const agree = step.sets.every((set) => set.reps === reps)
							return [
								`${liftDisplayName(step.exerciseId, step.exercise.name)} ${liftSchemeLabel(step.sets.length, agree ? reps : null)}`,
							]
						}),
					)
				: []
		return [
			{
				id: row.id,
				weekday,
				discipline: workout.discipline,
				title: workout.title,
				minutes:
					plannedMinutes(workout.blocks, {
						thresholds,
						discipline: workout.discipline,
					})?.minutes ?? null,
				// An Effort Word that cannot be read is not easy (#617).
				effort: readEffortWord(workout, thresholds) ?? 'middels',
				lifts,
			},
		]
	})
}

/**
 * The Discipline of every own or adopted session from the boundary on that
 * is still to do or done: a skipped or missed one is not counted as staying.
 */
async function readKeptAhead(
	db: Prisma.TransactionClient,
	{ userId, timezone }: EditContext,
	outlineId: string,
	weekKey: string,
): Promise<string[]> {
	const { start } = weekBoundsFromMondayUTC(weekKey, timezone)
	const rows = await db.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: start },
			status: { in: ['scheduled', 'completed'] },
			OR: [
				{ source: 'authored' },
				{
					planOutlineId: outlineId,
					source: { not: 'authored' },
					NOT: REPLACEABLE_SESSION,
				},
			],
		},
		select: { workout: { select: { discipline: true } } },
	})
	return rows.flatMap((row) => (row.workout ? [row.workout.discipline] : []))
}

/** The edit as it would land now, read through the caller's client. */
async function computeActivitiesEdit(
	db: Prisma.TransactionClient,
	context: EditContext,
	choice: ActivitiesChoice,
): Promise<ActivitiesEditResult> {
	const { userId, now, timezone, reading } = context
	const refusal = choiceRefusal(
		activitiesOf(reading.answers, reading.lifting?.perWeek ?? null),
		choice,
	)
	if (refusal) return { ok: false, reason: refusal }
	const outline = await db.planOutline.findFirst({
		where: { id: context.outlineId, athleteId: userId },
		select: editOutlineSelect,
	})
	if (!outline) return { ok: false, reason: 'outline-not-found' }
	if (outline.eventId != null) return { ok: false, reason: 'not-editable' }
	const unbegun = await readFirstUnbegunWeekKey(userId, now, timezone, db)
	const boundaryWeekKey = weekKeyAt(
		outline.startWeekKey,
		Math.max(0, weekIndexOf(outline.startWeekKey, unbegun)),
	)

	// The start's draft for the new activities, from the boundary: the plan's
	// own family laid by itself, or the top option for a plan with none.
	const session = reading.lifting?.session ?? null
	const answers = editedAnswers(
		{ ...reading.answers, startWeekKey: boundaryWeekKey },
		choice,
		session,
	)
	const own = outlineFamily(outline.family, phaseSpecs(outline))
	const drafted = own ? layStartFamily(answers, own) : draftStart(answers)
	const start = drafted && {
		...drafted,
		options: drafted.options.slice(0, 1),
	}
	if (!start || start.options.length === 0) {
		return { ok: false, reason: 'nothing-to-lay' }
	}

	const [held, keptSlots, kept, keptAhead] = await Promise.all([
		readHeldSessions(
			db,
			userId,
			outline.id,
			boundaryWeekKey,
			timezone,
			context.thresholds,
		),
		readKeptSlots(db, userId, outline.id, boundaryWeekKey, timezone),
		readKeptSessions(db, context, outline.id, boundaryWeekKey),
		readKeptAhead(db, context, outline.id, boundaryWeekKey),
	])
	const preview = previewActivitiesEdit({
		outline: {
			startWeekKey: outline.startWeekKey,
			phases: outline.phases,
			tracks: outline.tracks,
		},
		boundaryWeekKey,
		choice,
		family: start.options[0]!.family,
		familyTaken: own == null,
		start,
		strength:
			reading.lifting && choice.strength != null
				? {
						setsPerSession: reading.lifting.setsPerSession,
						goal: PROPOSED_STRENGTH_GOAL,
					}
				: null,
		liftingSession: session,
		held,
		keptSlots,
		kept,
		keptAhead,
		liftingDays: context.liftingDays ?? undefined,
	})
	return {
		ok: true,
		outlineId: outline.id,
		level: answers.level,
		hours: answers.hours,
		boundaryThisWeek: boundaryWeekKey === weekMonday(now, timezone),
		preview,
	}
}

/**
 * The new week the edit lays (_Vis ny uke_), and everything else it changes,
 * for the athlete to confirm. Writes nothing.
 */
export async function readActivitiesEdit(
	userId: string,
	choice: ActivitiesChoice,
	now: Date = new Date(),
): Promise<ActivitiesEditResult> {
	const context = await readEditContext(userId, now)
	if ('ok' in context) return context
	return computeActivitiesEdit(prisma, context, choice)
}

/**
 * Edit the plan's activities (_Bekreft_): the edit the preview showed,
 * recomputed and written in one transaction, then the weeks from the
 * boundary laid again. `digest` is the preview's; when the edit recomputed
 * now has another, nothing is written and the answer is `preview-stale`.
 * Omitted, nothing is compared: a caller that never showed a preview.
 */
export async function applyActivitiesEdit(
	userId: string,
	choice: ActivitiesChoice,
	now: Date = new Date(),
	{ digest }: { digest?: string } = {},
): Promise<ActivitiesEditResult> {
	const context = await readEditContext(userId, now)
	if ('ok' in context) return context
	const result = await prisma.$transaction(async (tx) => {
		const computed = await computeActivitiesEdit(tx, context, choice)
		if (!computed.ok) return computed
		if (digest != null && computed.preview.digest !== digest) {
			return { ok: false as const, reason: 'preview-stale' as const }
		}
		await writeActivitiesEdit(tx, context, computed)
		return computed
	})
	if (!result.ok) return result

	// The boundary week first, as the preview laid it, whatever the plan
	// already had in it; then every week after it, and the horizon.
	const { boundaryWeekKey } = result.preview.splice
	try {
		const pattern = await prisma.weekPattern.findFirst({
			where: { outlineId: result.outlineId, days: { some: {} } },
			orderBy: { orderIndex: 'asc' },
			select: { id: true },
		})
		const stamped = pattern
			? await stampWeekPattern(
					userId,
					{ patternId: pattern.id, weekKeys: [boundaryWeekKey], replace: true },
					now,
					{ aroundKeptSessions: true },
				)
			: null
		if (!stamped?.ok) {
			// The new rows lay nothing here: what the old activities laid goes,
			// as `relayFutureWeeks` does for the weeks after it.
			console.error(
				'[activities] the boundary week did not stamp after an activities edit',
				stamped?.reason ?? 'no-pattern',
			)
			await prisma.$transaction((tx) =>
				clearPlanWeek(
					tx,
					userId,
					result.outlineId,
					boundaryWeekKey,
					context.timezone,
				),
			)
		}
		await relayPlanFrom(
			userId,
			result.outlineId,
			weekKeyAt(boundaryWeekKey, 1),
			context.timezone,
			now,
		)
	} catch (error) {
		console.error(
			'[activities] laying weeks after an activities edit failed',
			error,
		)
	}
	return result
}

/** The writes the preview describes, inside the apply's transaction. */
async function writeActivitiesEdit(
	tx: Prisma.TransactionClient,
	{ userId, now, reading }: EditContext,
	{ outlineId, preview }: Extract<ActivitiesEditResult, { ok: true }>,
) {
	const { splice, start, choice } = preview
	const { boundaryWeekKey: from, phases } = splice
	const draft = start.options[0]!.draft

	// The phases: the ones after the boundary go (their segments and mixes by
	// cascade), the one it falls in is cut, and the round is laid after them.
	await tx.planOutlinePhase.deleteMany({
		where: { outlineId, id: { in: phases.remove } },
	})
	for (const { phaseId, weeks } of phases.resize) {
		await tx.planOutlinePhase.update({
			where: { id: phaseId },
			data: { weeks },
		})
	}
	const laidPhaseIds: string[] = []
	for (const [offset, phase] of phases.add.entries()) {
		const row = await tx.planOutlinePhase.create({
			data: {
				outlineId,
				orderIndex: phases.keptIds.length + offset,
				name: phase.name,
				weeks: phase.weeks,
				rhythm: phase.rhythm,
				tapers: phase.tapers,
			},
			select: { id: true },
		})
		laidPhaseIds.push(row.id)
	}

	// The tracks: re-anchored, made or retired at the boundary.
	const trackIds = new Map<string, string>()
	for (const change of splice.tracks) {
		if (change.kind === 'add') {
			const created = await tx.trainingTrack.create({
				data: {
					outlineId,
					discipline: change.discipline,
					currency: change.currency,
				},
				select: { id: true },
			})
			trackIds.set(change.trackId, created.id)
			const opens = splice.rows.startWeekKey
			await tx.seasonAnchorSegment.createMany({
				data:
					opens === from
						? [{ trackId: created.id, fromWeekKey: from, value: change.anchor }]
						: [
								{ trackId: created.id, fromWeekKey: opens, value: 0 },
								{
									trackId: created.id,
									fromWeekKey: from,
									value: change.anchor,
								},
							],
			})
		} else {
			trackIds.set(change.trackId, change.trackId)
			await tx.seasonAnchorSegment.deleteMany({
				where: { trackId: change.trackId, fromWeekKey: { gte: from } },
			})
			await tx.seasonAnchorSegment.create({
				data: {
					trackId: change.trackId,
					fromWeekKey: from,
					value: change.anchor,
				},
			})
		}
	}
	const idOf = (trackId: string) => trackIds.get(trackId) ?? trackId
	for (const lived of splice.livedSegments) {
		await tx.trainingTrackSegment.create({
			data: {
				kind: 'endurance',
				trackId: idOf(lived.trackId),
				phaseId: lived.phaseId,
				ramp: lived.segment.ramp,
				boundaryStep: lived.segment.boundaryStep,
				recoveryCut: lived.segment.recoveryCut,
				taperCut: lived.segment.taperCut,
			},
		})
	}
	for (const laid of splice.segments) {
		await tx.trainingTrackSegment.create({
			data: {
				kind: 'endurance',
				trackId: idOf(laid.trackId),
				phaseId: laidPhaseIds[laid.phaseIndex]!,
				ramp: laid.segment.ramp,
				boundaryStep: laid.segment.boundaryStep,
				recoveryCut: laid.segment.recoveryCut,
				taperCut: laid.segment.taperCut,
				...(laid.segment.mix.length > 0
					? {
							mix: {
								create: laid.segment.mix.map(({ zone, sessionsPerWeek }) => ({
									zone,
									sessionsPerWeek,
								})),
							},
						}
					: {}),
			},
		})
	}

	// Strength: the blocks cut at the boundary, and one opened there.
	await tx.trainingTrackSegment.deleteMany({
		where: { id: { in: splice.strength.remove }, track: { outlineId } },
	})
	for (const { segmentId, weeks, deloadWeeks } of splice.strength.cut) {
		await tx.trainingTrackSegment.update({
			where: { id: segmentId },
			data: { weeks, deloadWeeks },
		})
	}
	const strengthChange = splice.tracks.find(
		(change) => change.discipline === 'strength' && change.kind !== 'retire',
	)
	if (splice.strength.open && strengthChange) {
		await tx.trainingTrackSegment.create({
			data: {
				kind: 'strength',
				trackId: idOf(strengthChange.trackId),
				...splice.strength.open,
			},
		})
	}

	// Hand-set weeks from the boundary go; every Pinned day goes back to
	// _La appen velge_. Nothing before the boundary is touched.
	await tx.weekVolumeOverride.deleteMany({
		where: { track: { outlineId }, weekKey: { gte: from } },
	})
	await tx.trainingTrack.updateMany({
		where: { outlineId, pinnedDays: { not: null } },
		data: { pinnedDays: null },
	})

	// The first Week Pattern's days become the draft's own (ADR 0109 §4).
	const pattern =
		(await tx.weekPattern.findFirst({
			where: { outlineId, days: { some: {} } },
			orderBy: { orderIndex: 'asc' },
			select: { id: true },
		})) ??
		(await tx.weekPattern.findFirst({
			where: { outlineId },
			orderBy: { orderIndex: 'asc' },
			select: { id: true },
		})) ??
		(await tx.weekPattern.create({
			data: {
				outlineId,
				name: STARTER_PATTERN_NAME,
				orderIndex: await tx.weekPattern.count({ where: { outlineId } }),
			},
			select: { id: true },
		}))
	await tx.weekPatternDay.deleteMany({ where: { patternId: pattern.id } })
	const draftTrack = new Map(
		splice.tracks.flatMap((change) =>
			change.draftTrackId
				? [[change.draftTrackId, idOf(change.trackId)] as const]
				: [],
		),
	)
	const activityWorkouts = new Map<string, string>()
	for (const activity of draft.simpleActivities) {
		const workout = await createSimpleActivityWorkout(tx, userId, {
			kind: activity.kind,
			effortWord: activity.effortWord,
			durationMin: activity.minutes,
		})
		activityWorkouts.set(activity.workoutId, workout.id)
	}
	for (const day of draft.stampInput.days) {
		const trackId = draftTrack.get(day.trackId)
		if (!trackId) continue
		await tx.weekPatternDay.create({
			data: {
				patternId: pattern.id,
				trackId,
				weekday: day.weekday,
				orderInDay: day.orderInDay,
				kind: day.kind,
				...(day.kind === 'share'
					? { weight: day.weight }
					: {
							workoutId: day.workoutId
								? (activityWorkouts.get(day.workoutId) ?? null)
								: null,
						}),
			},
		})
	}
	const lifts = splice.strength.open?.sessionsPerWeek ?? 0
	if (lifts > 0 && strengthChange) {
		const workoutId = await readLiftingWorkoutId(tx, userId, now)
		for (let orderInDay = 0; orderInDay < lifts; orderInDay++) {
			await tx.weekPatternDay.create({
				data: {
					patternId: pattern.id,
					trackId: idOf(strengthChange.trackId),
					weekday: null,
					orderInDay,
					kind: 'lifting',
					workoutId,
				},
			})
		}
	}

	// A plan with no family follows the one laid from now on.
	if (preview.familyTaken) {
		await tx.planOutline.update({
			where: { id: outlineId },
			data: { family: preview.family },
		})
	}
	// The Strength Frequency is the athlete's answer: kept as tapped, and
	// cleared when they stop lifting. Only when the editor offered strength:
	// with no lifting session to copy it showed none, so nothing was answered.
	if (reading.lifting) {
		await tx.athleteProfile.updateMany({
			where: { userId },
			data: { strengthPerWeek: choice.strength },
		})
	}
	// A next round proposed on the old activities is not this plan's any more.
	await closePendingRounds(tx, userId, outlineId, now)
}
